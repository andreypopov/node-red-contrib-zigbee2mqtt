const test = require('node:test');
const assert = require('node:assert/strict');
const registerApi = require('../api');
const { createRuntime } = require('./support/runtime');

class ServerNode {
    constructor() {
        this.bridge_info = { log_level: 'info' };
        this.map = '<svg />';
        this.calls = [];
    }

    getDevices(callback, withGroups, refresh) {
        this.getDevicesArgs = [withGroups, refresh];
        callback([{ id: 1 }, withGroups ? [{ id: 2 }] : undefined]);
    }
    restart() { this.calls.push(['restart']); }
    setPermitJoin(value) { this.calls.push(['setPermitJoin', value]); }
    setLogLevel(value) { this.calls.push(['setLogLevel', value]); }
    renameDevice(...args) { this.calls.push(['renameDevice', ...args]); return { success: true }; }
    removeDevice(...args) { this.calls.push(['removeDevice', ...args]); return { success: true }; }
    renameGroup(...args) { this.calls.push(['renameGroup', ...args]); return { success: true }; }
    removeGroup(...args) { this.calls.push(['removeGroup', ...args]); return { success: true }; }
    addGroup(...args) { this.calls.push(['addGroup', ...args]); return { success: true }; }
    removeDeviceFromGroup(...args) { this.calls.push(['removeDeviceFromGroup', ...args]); return { success: true }; }
    addDeviceToGroup(...args) { this.calls.push(['addDeviceToGroup', ...args]); return { success: true }; }
    refreshMap(...args) { this.calls.push(['refreshMap', ...args]); return Promise.resolve({ svg: true }); }
}

function makeResponse() {
    return {
        body: undefined,
        statusCode: undefined,
        headers: undefined,
        chunks: [],
        json(body) { this.body = body; return this; },
        status(code) { this.statusCode = code; return this; },
        end(body) { this.ended = true; if (body !== undefined) this.chunks.push(body); return this; },
        writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
        write(chunk) { this.chunks.push(chunk); }
    };
}

test('registers each admin API route under the Zigbee2MQTT path', () => {
    const runtime = createRuntime();
    registerApi(runtime.RED);

    assert.deepEqual([...runtime.routes.keys()], [
        '/zigbee2mqtt/getDevices', '/zigbee2mqtt/restart', '/zigbee2mqtt/setPermitJoin',
        '/zigbee2mqtt/setLogLevel', '/zigbee2mqtt/getConfig', '/zigbee2mqtt/renameDevice',
        '/zigbee2mqtt/removeDevice', '/zigbee2mqtt/renameGroup', '/zigbee2mqtt/removeGroup',
        '/zigbee2mqtt/addGroup', '/zigbee2mqtt/removeDeviceFromGroup',
        '/zigbee2mqtt/addDeviceToGroup', '/zigbee2mqtt/refreshMap', '/zigbee2mqtt/showMap'
    ]);
});

test('admin API returns controller data and routes actions to the server node', async () => {
    const controller = new ServerNode();
    const runtime = createRuntime({ nodes: { server: controller } });
    registerApi(runtime.RED);
    const request = (route, query = {}) => {
        const response = makeResponse();
        return { response, result: runtime.routes.get(`/zigbee2mqtt/${route}`)({ query }, response) };
    };

    const devices = request('getDevices', { controllerID: 'server' });
    assert.deepEqual(devices.response.body, [{ id: 1 }, [{ id: 2 }]]);
    assert.deepEqual(controller.getDevicesArgs, [true, false]);
    const refreshedDevices = request('getDevices', { controllerID: 'server', refresh: 'true' });
    assert.deepEqual(refreshedDevices.response.body, [{ id: 1 }, [{ id: 2 }]]);
    assert.deepEqual(controller.getDevicesArgs, [true, true]);
    assert.deepEqual(request('getConfig', { controllerID: 'server' }).response.body, { log_level: 'info' });
    assert.deepEqual(request('renameDevice', {
        controllerID: 'server', ieee_address: '0x001', newName: 'lamp'
    }).response.body, { success: true });
    request('removeDevice', { controllerID: 'server', id: '0x001' });
    request('renameGroup', { controllerID: 'server', id: '1', newName: 'room' });
    request('removeGroup', { controllerID: 'server', id: '1' });
    request('addGroup', { controllerID: 'server', name: 'room' });
    request('removeDeviceFromGroup', { controllerID: 'server', deviceId: 'lamp', groupId: '1' });
    request('addDeviceToGroup', { controllerID: 'server', deviceId: 'lamp', groupId: '1' });
    request('restart', { controllerID: 'server' });
    request('setPermitJoin', { controllerID: 'server', permit_join: 'true' });
    request('setPermitJoin', { controllerID: 'server', permit_join: 'false' });
    request('setLogLevel', { controllerID: 'server', log_level: 'debug' });

    const map = request('showMap', { controllerID: 'server' });
    assert.equal(map.response.statusCode, 200);
    assert.equal(map.response.headers['Content-Type'], 'image/svg+xml');
    assert.deepEqual(map.response.chunks, ['<svg />']);

    const refreshed = request('refreshMap', { controllerID: 'server', engine: 'circo' });
    await refreshed.result;
    assert.deepEqual(refreshed.response.body, { svg: true });

    assert.deepEqual(controller.calls, [
        ['renameDevice', '0x001', 'lamp'],
        ['removeDevice', '0x001', undefined],
        ['renameGroup', '1', 'room'],
        ['removeGroup', '1'],
        ['addGroup', 'room'],
        ['removeDeviceFromGroup', 'lamp', '1'],
        ['addDeviceToGroup', 'lamp', '1'],
        ['restart'],
        ['setPermitJoin', true],
        ['setPermitJoin', false],
        ['setLogLevel', 'debug'],
        ['refreshMap', true, 'circo']
    ]);
});

test('admin API handles missing controllers and refresh errors', async () => {
    const runtime = createRuntime();
    registerApi(runtime.RED);
    const missing = makeResponse();

    runtime.routes.get('/zigbee2mqtt/getDevices')({ query: { controllerID: 'missing' } }, missing);
    assert.deepEqual(missing.body, [[], []]);

    const notFound = makeResponse();
    runtime.routes.get('/zigbee2mqtt/restart')({ query: { controllerID: 'missing' } }, notFound);
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.ended, true);

    const controller = new ServerNode();
    controller.refreshMap = () => Promise.reject(new Error('render failed'));
    const withController = createRuntime({ nodes: { server: controller } });
    registerApi(withController.RED);
    const errorResponse = makeResponse();
    withController.routes.get('/zigbee2mqtt/refreshMap')(
        { query: { controllerID: 'server' } }, errorResponse
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(errorResponse.statusCode, 404);
    assert.equal(errorResponse.ended, true);
});
