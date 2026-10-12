const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const registerIn = require('../nodes/in');
const registerGet = require('../nodes/get');
const registerOut = require('../nodes/out');
const registerBridge = require('../nodes/bridge');
const { instantiate } = require('./support/runtime');

function makeServer() {
    const server = new EventEmitter();
    const lamp = {
        friendly_name: 'lamp',
        ieee_address: '0x001',
        current_values: { position: 25, lock_state: 'locked', color: {} }
    };
    server.devices = [lamp];
    server.groups = [];
    server.mqtt = {
        publications: [],
        publish(...args) {
            this.publications.push(args);
            if (this.publishError && typeof args.at(-1) === 'function') {
                args.at(-1)(this.publishError);
            }
        }
    };
    server.config = { mqtt_qos: '1' };
    server.bridge_info = { log_level: 'info', permit_join: false };
    server.bridge_state = true;
    server.calls = [];
    server.getTopic = (path) => `zigbee2mqtt${path}`;
    server.getDeviceAvailabilityColor = () => 'green';
    server.getDeviceOrGroupByKey = (key) => ['lamp', '0x001', 'zigbee2mqtt/lamp', 'zigbee2mqtt/0x001'].includes(key) ? lamp : null;
    server.nodeSend = (node, options) => server.calls.push({ node, options });
    server.setDeviceOptions = (...args) => server.calls.push({ method: 'setDeviceOptions', args });
    return server;
}

test('input node routes matching single-device, availability and multiple-device updates', () => {
    const server = makeServer();
    const single = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server', device_id: '0x001', filterChanges: true
    }, server).node;

    server.emit('onMQTTMessage', {
        item: { ieee_address: '0x001' }, retained: true
    });
    assert.equal(server.calls[0].node, single);
    assert.deepEqual(server.calls[0].options, { filter: true, retained: true });

    server.emit('onMQTTMessage', { item: { id: '1' }, retained: false });
    assert.equal(server.calls.length, 2);

    server.emit('onMQTTAvailability', { item: { ieee_address: '0x001' } });
    assert.deepEqual(server.calls[2].options, { node_send: false });

    const multiple = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server', enableMultiple: true, device_id: ['0x001', 2]
    }, server).node;
    const changed = { item: { id: 2 }, retained: true };
    server.emit('onMQTTMessage', changed);
    assert.equal(server.calls.at(-1).node, multiple);
    assert.deepEqual(server.calls.at(-1).options, { changed, retained: true });
});

test('input node restores its last status on reconnect and detaches listeners on close', () => {
    const server = makeServer();
    const { node } = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server', device_id: 'lamp'
    }, server);
    const successful = { fill: 'green', shape: 'dot', text: 'received' };

    node.setSuccessfulStatus(successful);
    server.emit('onMQTTBridgeState', { payload: true });
    assert.equal(node.lastStatus, successful);
    server.emit('onMQTTBridgeState', { payload: false });
    assert.match(node.lastStatus.text, /no_connection/);

    assert.equal(server.listenerCount('onMQTTMessage'), 1);
    node.emit('close');
    assert.equal(server.listenerCount('onMQTTMessage'), 0);
    assert.match(node.lastStatus.text, /no_connection/);
});

test('input node reports a missing server', () => {
    const { node } = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'missing', device_id: 'lamp'
    }, undefined);

    assert.match(node.lastStatus.text, /no_server/);
});

test('get node uses configured device or incoming message topic', () => {
    const server = makeServer();
    const dynamic = instantiate(registerGet, 'zigbee2mqtt-get', {
        server: 'server', device_id: 'msg.topic'
    }, server).node;
    dynamic.emit('input', { topic: '0x001', payload: 'request' });
    assert.deepEqual(server.calls.at(-1).options, {
        msg: { topic: '0x001', payload: 'request' }, key: '0x001'
    });

    const fixed = instantiate(registerGet, 'zigbee2mqtt-get', {
        server: 'server', device_id: 'lamp'
    }, server).node;
    fixed.emit('input', { topic: 'ignored' });
    assert.equal(server.calls.at(-1).options.key, 'lamp');
});

test('get node reports a missing server', () => {
    const { node } = instantiate(registerGet, 'zigbee2mqtt-get', {
        server: 'missing'
    }, undefined);
    assert.match(node.lastStatus.text, /no_server/);
});

test('output node translates commands and publishes with configured MQTT QoS', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'toggle',
        commandType: 'z2m_cmd', command: 'state'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', {});

    assert.equal(server.listenerCount('onMQTTMessage'), 0);
    assert.equal(node.messages.length, 0);
    assert.equal(server.mqtt.publications.length, 1);
    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/lamp/set');
    assert.equal(server.mqtt.publications[0][1], '{"state":"close"}');
    assert.deepEqual(server.mqtt.publications[0][2], { qos: 1 });
    assert.equal(node.lastStatus.fill, 'green');
});

test('output node optionally sends input and updated full device state', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'on',
        commandType: 'z2m_cmd', command: 'state', outputs: 1
    }, server);
    const input = { payload: { source: 'original input' }, extra: 'preserved' };
    t.after(() => node.emit('close'));

    node.emit('input', input);
    assert.equal(node.messages.length, 0);

    server.emit('onMQTTMessage', {
        topic: 'zigbee2mqtt/lamp',
        payload: { state: 'ON', brightness: 42 },
        item: server.devices[0],
        retained: true
    });
    assert.equal(node.messages.length, 0);

    server.emit('onMQTTMessage', {
        topic: 'zigbee2mqtt/other-device',
        payload: { state: 'OFF' },
        item: { friendly_name: 'other-device' },
        retained: false
    });
    assert.equal(node.messages.length, 0);

    const state = { state: 'ON', brightness: 42, linkquality: 80 };
    server.emit('onMQTTMessage', {
        topic: 'zigbee2mqtt/lamp', payload: state, item: server.devices[0], retained: false
    });

    assert.equal(node.messages.length, 1);
    assert.deepEqual(node.messages[0], {
        payload: state,
        payload_in: { source: 'original input' },
        payload_raw: state,
        extra: 'preserved',
        topic: 'zigbee2mqtt/lamp',
        item: server.devices[0],
        homekit: undefined,
        format: undefined,
        selector: 'zigbee2mqtt_lamp'
    });
    assert.deepEqual(input, { payload: { source: 'original input' }, extra: 'preserved' });

    node.emit('close');
    assert.equal(server.listenerCount('onMQTTMessage'), 0);
});

test('output node publishes group commands without an entity-state output', (t) => {
    const server = makeServer();
    const group = { friendly_name: 'downstairs' };
    server.groups = [group];
    server.getDeviceOrGroupByKey = (key) => key === 'downstairs' ? group : null;
    const { node, logs } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'downstairs', payloadType: 'str', payload: 'on',
        commandType: 'z2m_cmd', command: 'state', outputs: 1
    }, server);
    t.after(() => node.emit('close'));

    node.emit('input', {});

    assert.equal(server.mqtt.publications.length, 1);
    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/downstairs/set');
    assert.equal(node.pendingOutputs.length, 0);
    assert.equal(logs.some((entry) => entry.level === 'warn' && entry.args[0].includes('not groups')), true);
});

test('output node clears a pending state output when MQTT publish fails', (t) => {
    const server = makeServer();
    server.mqtt.publishError = new Error('publish failed');
    const { node, logs } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'on',
        commandType: 'z2m_cmd', command: 'state', outputs: 1
    }, server);
    t.after(() => node.emit('close'));

    node.emit('input', { payload: 'original' });

    assert.equal(node.pendingOutputs.length, 0);
    assert.equal(logs.some((entry) => entry.level === 'error'), true);
    server.emit('onMQTTMessage', {
        topic: 'zigbee2mqtt/lamp', payload: { state: 'ON' }, item: server.devices[0], retained: false
    });
    assert.equal(node.messages.length, 0);
});

test('output node removes its state listener and pending timer on close', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'on',
        commandType: 'z2m_cmd', command: 'state', outputs: 1
    }, server);

    node.emit('input', { payload: 'original' });
    assert.equal(node.pendingOutputs.length, 1);
    assert.equal(server.listenerCount('onMQTTMessage'), 1);

    node.emit('close');
    assert.equal(node.pendingOutputs.length, 0);
    assert.equal(server.listenerCount('onMQTTMessage'), 0);
});

test('output node targets an endpoint when msg.topic contains its full set topic', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'msg.topic', payloadType: 'msg', payload: 'payload',
        commandType: 'z2m_cmd', command: 'state'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', { topic: 'zigbee2mqtt/0x001/left/set', payload: 'on' });

    assert.equal(server.mqtt.publications.length, 1);
    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/0x001/left/set');
    assert.equal(server.mqtt.publications[0][1], '{"state":"on"}');
    assert.deepEqual(server.mqtt.publications[0][2], { qos: 1 });
});

test('output node keeps default topics when msg.topic names only a device', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'msg.topic', payloadType: 'msg', payload: 'payload',
        commandType: 'z2m_cmd', command: 'state'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', { topic: 'lamp', payload: 'on' });

    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/lamp/set');
    assert.equal(server.mqtt.publications[0][1], '{"state":"on"}');
});

test('output node publishes numeric tilt commands for Venetian blinds', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: '45',
        commandType: 'z2m_cmd', command: 'tilt'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', {});

    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/lamp/set');
    assert.equal(server.mqtt.publications[0][1], '{"tilt":45}');
});

test('output node preserves floating-point values for device parameters', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'num', payload: '4.5',
        commandType: 'z2m_cmd', command: 'sensitivity'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', {});

    assert.equal(server.mqtt.publications[0][1], '{"sensitivity":4.5}');
});

test('output node wraps color objects when the command comes from the message', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'msg', payload: 'payload',
        commandType: 'msg', command: 'command'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', { command: 'color', payload: { hue: 240, saturation: 100 } });
    assert.equal(server.mqtt.publications.at(-1)[1], '{"color":{"hue":240,"saturation":100}}');

    node.emit('input', { command: 'color', payload: { color: { hue: 240, saturation: 100 } } });
    assert.equal(server.mqtt.publications.at(-1)[1], '{"color":{"hue":240,"saturation":100}}');
});

test('output node supports lock, color and HomeKit commands', (t) => {
    const server = makeServer();
    const lock = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'toggle',
        commandType: 'z2m_cmd', command: 'lock'
    }, server).node;
    lock.emit('input', {});
    t.after(() => clearTimeout(lock.cleanTimer));
    assert.equal(server.mqtt.publications.at(-1)[1], '{"state":"unlock"}');

    const color = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'str', payload: '#00ff00',
        commandType: 'z2m_cmd', command: 'color_hex'
    }, server).node;
    color.emit('input', {});
    t.after(() => clearTimeout(color.cleanTimer));
    assert.equal(server.mqtt.publications.at(-1)[1], '{"color":{"hex":"#00ff00"}}');

    const homekit = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'msg', payload: 'payload',
        commandType: 'homekit'
    }, server).node;
    homekit.emit('input', { payload: { On: false } });
    t.after(() => clearTimeout(homekit.cleanTimer));
    assert.deepEqual(JSON.parse(server.mqtt.publications.at(-1)[1]), { state: 'off' });

    homekit.emit('input', { payload: { Brightness: 25 } });
    assert.deepEqual(JSON.parse(server.mqtt.publications.at(-1)[1]), { brightness: 64, state: 'on' });
});

test('output node publishes state commands for all nine endpoints', (t) => {
    const server = makeServer();

    for (let endpoint = 1; endpoint <= 9; endpoint++) {
        const command = `state_l${endpoint}`;
        const { node } = instantiate(registerOut, 'zigbee2mqtt-out', {
            server: 'server', device_id: 'lamp', payloadType: 'str', payload: 'on',
            commandType: 'z2m_cmd', command
        }, server);
        t.after(() => clearTimeout(node.cleanTimer));

        node.emit('input', {});

        assert.equal(server.mqtt.publications.at(-1)[1], JSON.stringify({ [command]: 'on' }));
    }
});

test('output node applies device options and rejects invalid JSON payloads', (t) => {
    const server = makeServer();
    const options = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'json', payload: '{"transition":2}',
        commandType: 'json', optionsType: 'json', optionsValue: '{"retain":true}'
    }, server).node;
    options.emit('input', {});
    t.after(() => clearTimeout(options.cleanTimer));
    assert.deepEqual(server.calls.at(-1), {
        method: 'setDeviceOptions', args: ['lamp', { retain: true }]
    });
    assert.equal(server.mqtt.publications.at(-1)[1], '{"transition":2}');

    const invalid = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'lamp', payloadType: 'json', payload: '{invalid',
        commandType: 'str', command: 'state'
    }, server);
    invalid.node.emit('input', {});
    assert.equal(server.mqtt.publications.length, 1);
    assert.match(invalid.node.lastStatus.text, /no_payload/);
    assert.equal(invalid.logs.some((entry) => entry.level === 'warn'), true);
});

test('output node reports missing server and missing device', () => {
    const noServer = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'missing', device_id: 'lamp'
    }, undefined).node;
    assert.match(noServer.lastStatus.text, /no_server/);

    const server = makeServer();
    const noDevice = instantiate(registerOut, 'zigbee2mqtt-out', {
        server: 'server', device_id: 'missing'
    }, server).node;
    noDevice.emit('input', {});
    assert.match(noDevice.lastStatus.text, /no_device/);
});

test('bridge node publishes input and forwards bridge messages with status updates', (t) => {
    const server = makeServer();
    const { node } = instantiate(registerBridge, 'zigbee2mqtt-bridge', {
        server: 'server'
    }, server);
    t.after(() => clearTimeout(node.cleanTimer));

    node.emit('input', { topic: 'zigbee2mqtt/bridge/request/options', payload: { permit_join: true } });
    assert.equal(server.mqtt.publications[0][0], 'zigbee2mqtt/bridge/request/options');
    assert.equal(server.mqtt.publications[0][1], '{"permit_join":true}');

    server.emit('onMQTTMessageBridge', {
        topic: 'zigbee2mqtt/bridge/event', payload: '{"type":"device_announce"}'
    });
    assert.deepEqual(node.messages[0], {
        payload: { type: 'device_announce' }, topic: 'zigbee2mqtt/bridge/event'
    });
    assert.equal(node.lastStatus.fill, 'yellow');

    server.emit('onMQTTMessageBridge', {
        topic: 'zigbee2mqtt/bridge/state', payload: 'online'
    });
    assert.equal(node.messages.length, 2);
    assert.equal(node.lastStatus.fill, 'green');

    node.emit('close');
    assert.equal(server.listenerCount('onMQTTConnect'), 0);
    assert.equal(server.listenerCount('onMQTTMessageBridge'), 0);
});

test('bridge node reports a missing server', () => {
    const { node } = instantiate(registerBridge, 'zigbee2mqtt-bridge', {
        server: 'missing'
    }, undefined);
    assert.match(node.lastStatus.text, /no_server/);
});
