const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createFlowNode } = require('./support/server');
const registerIn = require('../nodes/in');
const { instantiate } = require('./support/runtime');

function addLamp(server, values = { state: 'ON', brightness: 80, battery: 52 }) {
    server.devices = [{
        id: 1,
        friendly_name: 'lamp',
        ieee_address: '0x001',
        power_source: 'Battery',
        definition: { exposes: [] }
    }];
    server.devices_values['zigbee2mqtt/lamp'] = values;
}

function addButton(server) {
    server.devices = [{
        id: 2,
        friendly_name: 'button',
        ieee_address: '0x002',
        power_source: 'Battery',
        definition: { exposes: [] }
    }];
}

test('MQTT connection uses configured authentication and subscribes on connect', () => {
    const { node, client, connection } = createServer({
        mqtt_port: 1884,
        mqtt_username: 'user',
        mqtt_password: 'pass',
        mqtt_qos: '1'
    });

    assert.equal(connection.url, 'mqtt://localhost');
    assert.equal(connection.options.port, 1884);
    assert.equal(connection.options.username, 'user');
    assert.equal(connection.options.password, 'pass');
    assert.match(connection.options.clientId, /^NodeRed-server-id-/);

    client.emit('connect');
    assert.equal(node.connection, true);
    assert.equal(client.subscriptions[0][0], 'zigbee2mqtt/#');
    assert.deepEqual(client.subscriptions[0][1], { qos: 1 });
    assert.equal(typeof client.subscriptions[0][2], 'function');
});

test('topic and availability helpers use the configured base topic', () => {
    const { node } = createServer();

    assert.equal(node.getBaseTopic(), 'zigbee2mqtt');
    assert.equal(node.getTopic('/bridge/state'), 'zigbee2mqtt/bridge/state');
    assert.equal(node.getDeviceAvailabilityColor('zigbee2mqtt/lamp'), 'blue');
    node.avaialability['zigbee2mqtt/lamp'] = false;
    assert.equal(node.getDeviceAvailabilityColor('zigbee2mqtt/lamp'), 'red');
    node.avaialability['zigbee2mqtt/lamp'] = true;
    assert.equal(node.getDeviceAvailabilityColor('zigbee2mqtt/lamp'), 'green');
});

test('device lookup supports names, IEEE addresses, ids, topics and selectors', () => {
    const { node } = createServer();
    addLamp(node);

    const byName = node.getDeviceByKey('lamp');
    assert.equal(byName.friendly_name, 'lamp');
    assert.deepEqual(byName.current_values, { state: 'ON', brightness: 80, battery: 52 });
    assert.ok(byName.homekit.Switch);
    assert.deepEqual(node.getDeviceByKey('0x001').current_values, byName.current_values);
    assert.equal(node.getDeviceByKey(1).friendly_name, 'lamp');
    assert.equal(node.getDeviceByKey('zigbee2mqtt/lamp').friendly_name, 'lamp');
    assert.equal(node.getDeviceByKey('zigbee2mqtt_lamp').friendly_name, 'lamp');
    assert.equal(node.getDeviceOrGroupByKey('missing'), null);
});

test("plain-text MQTT states do not crash device lookup", () => {
    const { node } = createServer();
    addLamp(node);
    const updates = [];
    node.on("onMQTTMessage", (data) => updates.push(data));

    assert.doesNotThrow(() => node.onMQTTMessage("zigbee2mqtt/lamp", Buffer.from("ON")));

    assert.equal(node.devices_values["zigbee2mqtt/lamp"], "ON");
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].item.homekit, {});
    assert.deepEqual(updates[0].item.format, {});
});

test('single output reads the selected multi-endpoint state property', (t) => {
    const { node: server } = createServer();
    server.devices = [{
        id: 2,
        friendly_name: 'multi-switch',
        ieee_address: '0x002',
        definition: { exposes: [
            { name: 'State', property: 'state_l1' },
            { name: 'State', property: 'state_l2' }
        ] }
    }];
    server.devices_values['zigbee2mqtt/multi-switch'] = { state_l1: 'ON', state_l2: 'OFF' };
    const output = createFlowNode({ device_id: 'multi-switch', state: 'state_l2' });
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { key: 'multi-switch' });

    assert.equal(output.messages[0].payload, 'OFF');
    assert.deepEqual(output.messages[0].payload_raw, { state_l1: 'ON', state_l2: 'OFF' });
});

test('single output filters by selected properties and keeps the full payload', (t) => {
    const { node: server } = createServer();
    addLamp(server, { state: 'ON', brightness: 80, linkquality: 20 });
    const output = createFlowNode({
        device_id: 'lamp',
        filterProperties: 'state, brightness'
    });
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { filter: true });
    server.devices_values['zigbee2mqtt/lamp'] = {
        state: 'ON', brightness: 80, linkquality: 99
    };
    server.nodeSend(output, { filter: true });

    assert.equal(output.messages.length, 1);
    assert.deepEqual(output.messages[0].payload, {
        state: 'ON', brightness: 80, linkquality: 20
    });
    assert.deepEqual(output.messages[0].payload_raw, {
        state: 'ON', brightness: 80, linkquality: 20
    });

    server.devices_values['zigbee2mqtt/lamp'] = {
        state: 'OFF', brightness: 80, linkquality: 99
    };
    server.nodeSend(output, { filter: true });

    assert.equal(output.messages.length, 2);
    assert.deepEqual(output.messages[1].payload, {
        state: 'OFF', brightness: 80, linkquality: 99
    });
});

test('single output keeps full-payload comparison when no properties are configured', (t) => {
    const { node: server } = createServer();
    addLamp(server, { state: 'ON', linkquality: 20 });
    const output = createFlowNode({ device_id: 'lamp' });
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { filter: true });
    server.devices_values['zigbee2mqtt/lamp'] = { state: 'ON', linkquality: 21 };
    server.nodeSend(output, { filter: true });

    assert.equal(output.messages.length, 2);
});

test('multiple output filters each device by selected properties', (t) => {
    const { node: server } = createServer();
    server.devices = [
        { id: 1, friendly_name: 'lamp', ieee_address: '0x001', definition: { exposes: [] } },
        { id: 2, friendly_name: 'sensor', ieee_address: '0x002', definition: { exposes: [] } }
    ];
    server.devices_values['zigbee2mqtt/lamp'] = { state: 'ON', linkquality: 20 };
    server.devices_values['zigbee2mqtt/sensor'] = { state: 'ON', linkquality: 30 };
    const output = createFlowNode({
        enableMultiple: true,
        device_id: ['0x001', '0x002'],
        outputAtStartup: false,
        filterProperties: ' state, state, '
    });
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { filter: true, retained: true });
    assert.equal(output.messages.length, 0);

    server.devices_values['zigbee2mqtt/lamp'] = { state: 'ON', linkquality: 99 };
    server.nodeSend(output, { filter: true, retained: false });
    assert.equal(output.messages.length, 0);

    server.devices_values['zigbee2mqtt/sensor'] = { state: 'OFF', linkquality: 30 };
    server.nodeSend(output, { filter: true, retained: false });

    assert.equal(output.messages.length, 1);
    assert.deepEqual(output.messages[0].payload['0x001'].payload, {
        state: 'ON', linkquality: 99
    });
    assert.deepEqual(output.messages[0].payload['0x002'].payload, {
        state: 'OFF', linkquality: 30
    });
});

test('status-only device refresh does not warn before the initial state arrives', (t) => {
    const { node: server } = createServer();
    addLamp(server, null);
    const output = createFlowNode({ device_id: '0x001' });
    const warnings = [];
    output.warn = (warning) => warnings.push(warning);
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { node_send: false, key: '0x001' });

    assert.deepEqual(warnings, []);
    assert.equal(output.messages.length, 0);

    server.nodeSend(output, { key: '0x001' });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /turn on the "retain" option/);
});

test('Graphviz renders the bridge map as SVG', async () => {
    const { node } = createServer();

    const svg = await node.graphviz('digraph { a -> b }');

    assert.match(svg, /<svg\b/);
    assert.equal(node.map, svg);
});

test('device MQTT updates are decoded and retained status is forwarded', () => {
    const { node } = createServer();
    addLamp(node, { state: 'OFF' });
    const updates = [];
    node.on('onMQTTMessage', (data) => updates.push(data));

    node.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"state":"ON","brightness":90}'), { retain: true });

    assert.deepEqual(node.devices_values['zigbee2mqtt/lamp'], { state: 'ON', brightness: 90 });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].retained, true);
    assert.equal(updates[0].item.friendly_name, 'lamp');
    assert.deepEqual(updates[0].item.current_values, { state: 'ON', brightness: 90 });
});

test('in node receives a retained state that arrives before device metadata', (t) => {
    const { node: server } = createServer();
    const input = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server',
        device_id: '0x001'
    }, server).node;
    const quietInput = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server',
        device_id: '0x001',
        outputAtStartup: false
    }, server).node;
    t.after(() => {
        input.emit('close');
        quietInput.emit('close');
        clearTimeout(input.cleanTimer);
        clearTimeout(quietInput.cleanTimer);
    });

    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"state":"ON"}'), { retain: true });

    assert.equal(input.messages.length, 0);
    assert.equal(server.pendingMQTTMessages.size, 1);

    server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify([{
        id: 1,
        friendly_name: 'lamp',
        ieee_address: '0x001',
        definition: { exposes: [] }
    }])));

    assert.equal(input.messages.length, 1);
    assert.deepEqual(input.messages[0].payload, { state: 'ON' });
    assert.equal(input.messages[0].topic, 'zigbee2mqtt/lamp');
    assert.equal(quietInput.messages.length, 0);
    assert.deepEqual(quietInput.last_value, { state: 'ON' });
    assert.equal(server.pendingMQTTMessages.size, 0);
});

test('unresolved MQTT messages are bounded and cleared after inventory loads', () => {
    const { node: server } = createServer();

    for (let index = 0; index <= 1000; index++) {
        server.onMQTTMessage(`zigbee2mqtt/unlisted-${index}`, Buffer.from('{"state":"ON"}'));
    }

    assert.equal(server.pendingMQTTMessages.size, 1000);
    assert.equal(server.pendingMQTTMessages.has('zigbee2mqtt/unlisted-0'), false);

    server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from('[]'));
    assert.equal(server.pendingMQTTMessages.size, 1000);

    server.onMQTTMessage('zigbee2mqtt/bridge/groups', Buffer.from('[]'));
    assert.equal(server.pendingMQTTMessages.size, 0);
});

test('partial JSON MQTT updates preserve unchanged properties for GET nodes', (t) => {
    const { node: server } = createServer();
    addLamp(server, { state: 'ON', brightness: 80 });
    const output = createFlowNode({ device_id: 'lamp', state: 'state' });
    t.after(() => clearTimeout(output.cleanTimer));

    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"brightness":4}'));

    assert.deepEqual(server.devices_values['zigbee2mqtt/lamp'], { state: 'ON', brightness: 4 });
    server.nodeSend(output, { key: 'lamp' });
    assert.equal(output.messages[0].payload, 'ON');

    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"state":"OFF"}'));

    assert.deepEqual(server.devices_values['zigbee2mqtt/lamp'], { state: 'OFF', brightness: 4 });
    server.nodeSend(output, { key: 'lamp' });
    assert.equal(output.messages[1].payload, 'OFF');
});

test('button input ignores telemetry after earlier actions and accepts repeated live actions', async (t) => {
    for (const retained of [false, true]) {
        await t.test(retained ? 'retained action after reconnect' : 'earlier live action', (t) => {
            const { node: server } = createServer();
            addButton(server);
            const input = instantiate(registerIn, 'zigbee2mqtt-in', {
                server: 'server', device_id: '0x002', state: 'action',
                filterChanges: false, outputAtStartup: false
            }, server).node;
            t.after(() => {
                clearTimeout(input.cleanTimer);
                input.emit('close');
            });
            const publish = (payload, retain = false) => server.onMQTTMessage(
                'zigbee2mqtt/button', Buffer.from(JSON.stringify(payload)), { retain }
            );

            publish({ action: 'single', battery: 90, voltage: 2900 }, retained);
            const initialCount = retained ? 0 : 1;
            assert.equal(input.messages.length, initialCount);

            publish({ battery: 90, linkquality: 92 });
            publish({ voltage: 2900, linkquality: 88 });
            publish({ battery: 90, linkquality: 88 });
            assert.equal(input.messages.length, initialCount);

            publish({ action: 'single' });
            publish({ action: 'single' });
            assert.equal(input.messages.length, initialCount + 2);
            assert.deepEqual(input.messages.slice(initialCount).map((msg) => msg.payload), ['single', 'single']);

            publish({ linkquality: 80 });
            assert.equal(input.messages.length, initialCount + 2);
        });
    }
});

test('full-state and multiple-device inputs omit earlier actions on telemetry updates', (t) => {
    const { node: server } = createServer();
    addButton(server);
    const full = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server', device_id: '0x002', state: '0', filterChanges: false
    }, server).node;
    const multiple = instantiate(registerIn, 'zigbee2mqtt-in', {
        server: 'server', device_id: ['0x002'], enableMultiple: true, filterChanges: false
    }, server).node;
    t.after(() => {
        for (const input of [full, multiple]) {
            clearTimeout(input.cleanTimer);
            input.emit('close');
        }
    });

    server.onMQTTMessage('zigbee2mqtt/button', Buffer.from('{"action":"double","battery":90}'));
    server.onMQTTMessage('zigbee2mqtt/button', Buffer.from('{"linkquality":80}'));

    assert.equal(full.messages.length, 2);
    assert.equal(full.messages[0].payload.action, 'double');
    assert.deepEqual(full.messages[1].payload, { battery: 90, linkquality: 80 });
    assert.deepEqual(full.messages[1].payload_raw, { battery: 90, linkquality: 80 });
    assert.equal(multiple.messages.length, 2);
    assert.equal(multiple.messages[0].payload['0x002'].payload.action, 'double');
    assert.deepEqual(multiple.messages[1].payload['0x002'].payload, { battery: 90, linkquality: 80 });
    assert.deepEqual(multiple.messages[1].changed.payload, { battery: 90, linkquality: 80 });
});

test('partial JSON updates clear earlier actions while preserving readable device state', (t) => {
    const { node: server } = createServer();
    addLamp(server, { state: 'ON', brightness: 80, action: 'single' });
    const output = createFlowNode({ device_id: 'lamp', state: 'state' });
    t.after(() => clearTimeout(output.cleanTimer));

    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"brightness":4}'));
    server.nodeSend(output, { key: 'lamp' });

    assert.equal(output.messages[0].payload, 'ON');
    assert.deepEqual(output.messages[0].payload_raw, { state: 'ON', brightness: 4 });

    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"action":"double"}'));
    server.nodeSend(output, { key: 'lamp' });

    assert.equal(output.messages[1].payload, 'ON');
    assert.deepEqual(output.messages[1].payload_raw, { state: 'ON', brightness: 4, action: 'double' });
});

test('set-topic messages are ignored', () => {
    const { node } = createServer();
    let messages = 0;
    node.on('onMQTTMessage', () => messages++);

    node.onMQTTMessage('zigbee2mqtt/lamp/set', Buffer.from('{"state":"ON"}'), { retain: true });

    assert.equal(messages, 0);
    assert.deepEqual(node.devices_values, {});
});

test('availability accepts plain and JSON bridge states', () => {
    const { node } = createServer();
    addLamp(node);
    const updates = [];
    node.on('onMQTTAvailability', (data) => updates.push(data));

    node.onMQTTMessage('zigbee2mqtt/lamp/availability', Buffer.from('online'));
    node.onMQTTMessage('zigbee2mqtt/lamp/availability', Buffer.from('{"state":"offline"}'));

    assert.equal(updates[0].payload, true);
    assert.equal(updates[1].payload, false);
    assert.equal(updates[0].item.friendly_name, 'lamp');
    assert.equal(node.avaialability['zigbee2mqtt/lamp'], false);
});

test('bridge messages update state, inventory, groups, and defer initial device requests', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { node, client } = createServer();
    t.after(() => node.emit('close'));
    const bridgeStates = [];
    const bridgeMessages = [];
    node.on('onMQTTBridgeState', (data) => bridgeStates.push(data.payload));
    node.on('onMQTTMessageBridge', (data) => bridgeMessages.push(data));

    node.onMQTTMessage('zigbee2mqtt/bridge/state', Buffer.from('{"state":"online"}'));
    node.onMQTTMessage('zigbee2mqtt/bridge/info', Buffer.from('{"log_level":"debug"}'));
    node.onMQTTMessage('zigbee2mqtt/bridge/groups', Buffer.from('[{"id":1,"friendly_name":"room"}]'));
    node.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify([{
        id: 1,
        friendly_name: 'lamp',
        definition: { exposes: [{ name: 'state', access: 5 }] }
    }])));

    assert.deepEqual(bridgeStates, [true]);
    assert.equal(node.bridge_state, true);
    assert.deepEqual(node.bridge_info, { log_level: 'debug' });
    assert.equal(node.groups[0].friendly_name, 'room');
    assert.equal(node.devices[0].friendly_name, 'lamp');
    assert.equal(client.publications.length, 0);
    t.mock.timers.tick(1000);
    assert.equal(client.publications[0][0], 'zigbee2mqtt/lamp/get');
    assert.deepEqual(JSON.parse(client.publications[0][1]), { state: '' });
    assert.equal(bridgeMessages.length, 4);
});

test('initial state requests wait for retained values and skip disabled or offline devices', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { node: server, client } = createServer();
    t.after(() => server.emit('close'));
    const devices = [
        { friendly_name: 'retained-before', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'retained-after', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'online', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'offline', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'disabled', disabled: true, definition: { exposes: [{ name: 'state', access: 5 }] } }
    ];

    server.onMQTTMessage('zigbee2mqtt/retained-before', Buffer.from('{"state":"ON"}'), { retain: true });
    server.onMQTTMessage('zigbee2mqtt/offline/availability', Buffer.from('{"state":"offline"}'), { retain: true });
    server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)), { retain: true });
    server.onMQTTMessage('zigbee2mqtt/retained-after', Buffer.from('{"state":"OFF"}'), { retain: true });

    assert.equal(client.publications.length, 0);
    t.mock.timers.tick(999);
    assert.equal(client.publications.length, 0);
    t.mock.timers.tick(1);

    assert.deepEqual(client.publications.map(([topic, payload]) => [topic, JSON.parse(payload)]), [
        ['zigbee2mqtt/online/get', { state: '' }]
    ]);
});

test('initial state requests are not repeated until an offline or disabled device changes', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { node: server, client } = createServer();
    t.after(() => server.emit('close'));
    const devices = [
        { friendly_name: 'online', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'offline', definition: { exposes: [{ name: 'state', access: 5 }] } },
        { friendly_name: 'disabled', disabled: true, definition: { exposes: [{ name: 'state', access: 5 }] } }
    ];
    const publishDevices = () => server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));

    server.onMQTTMessage('zigbee2mqtt/offline/availability', Buffer.from('offline'), { retain: true });
    publishDevices();
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), ['zigbee2mqtt/online/get']);

    publishDevices();
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), ['zigbee2mqtt/online/get']);

    server.onMQTTMessage('zigbee2mqtt/offline/availability', Buffer.from('online'));
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), [
        'zigbee2mqtt/online/get',
        'zigbee2mqtt/offline/get'
    ]);

    server.onMQTTMessage('zigbee2mqtt/offline/availability', Buffer.from('online'));
    publishDevices();
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), [
        'zigbee2mqtt/online/get',
        'zigbee2mqtt/offline/get'
    ]);

    devices.find((device) => device.friendly_name === 'disabled').disabled = false;
    publishDevices();
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), [
        'zigbee2mqtt/online/get',
        'zigbee2mqtt/offline/get',
        'zigbee2mqtt/disabled/get'
    ]);
});

test('retained device states on MQTT reconnect prevent another initial request', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { node: server, client } = createServer();
    t.after(() => server.emit('close'));
    const devices = [{ friendly_name: 'lamp', definition: { exposes: [{ name: 'state', access: 5 }] } }];
    const publishDevices = () => server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));

    publishDevices();
    t.mock.timers.tick(1000);
    assert.deepEqual(client.publications.map(([topic]) => topic), ['zigbee2mqtt/lamp/get']);

    server.onMQTTConnect();
    server.onMQTTMessage('zigbee2mqtt/lamp', Buffer.from('{"state":"ON"}'), { retain: true });
    publishDevices();
    t.mock.timers.tick(1000);

    assert.deepEqual(client.publications.map(([topic]) => topic), ['zigbee2mqtt/lamp/get']);
    assert.deepEqual(server.devices_values['zigbee2mqtt/lamp'], { state: 'ON' });
});

test('a device can be queried again after it leaves and reappears in the inventory', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { node: server, client } = createServer();
    t.after(() => server.emit('close'));
    const device = { friendly_name: 'lamp', definition: { exposes: [{ name: 'state', access: 5 }] } };
    const publishDevices = (devices) => server.onMQTTMessage('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));

    publishDevices([device]);
    t.mock.timers.tick(1000);
    publishDevices([]);
    t.mock.timers.tick(1000);
    publishDevices([device]);
    t.mock.timers.tick(1000);

    assert.deepEqual(client.publications.map(([topic]) => topic), [
        'zigbee2mqtt/lamp/get',
        'zigbee2mqtt/lamp/get'
    ]);
});

test('admin commands publish expected payloads and validate missing devices', () => {
    const { node, client } = createServer();
    addLamp(node);

    assert.deepEqual(node.renameDevice('0x001', 'desk lamp'), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { from: 'lamp', to: 'desk lamp' });
    assert.deepEqual(node.renameDevice('missing', 'new name'), { error: true, description: 'no such device' });
    assert.deepEqual(node.renameDevice('0x001', ''), { error: true, description: 'can not be empty' });

    assert.deepEqual(node.setDeviceOptions('0x001', { retain: true }), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { id: '0x001', options: { retain: true } });
    assert.deepEqual(node.removeDevice('0x001'), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { id: '0x001', force: true });
    assert.deepEqual(node.removeDevice('missing'), { error: true, description: 'no such device' });
});

test('group commands validate ids and publish expected MQTT topics', () => {
    const { node, client } = createServer();
    addLamp(node);
    node.groups = [{ id: 2, friendly_name: 'room' }];

    assert.deepEqual(node.renameGroup(2, 'office'), { success: true, description: 'command sent' });
    assert.equal(client.publications.at(-1)[0], 'zigbee2mqtt/bridge/request/group/rename');
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { from: 'room', to: 'office' });
    assert.deepEqual(node.removeGroup(2), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { id: 2 });
    assert.deepEqual(node.removeGroup(9), { error: true, description: 'no such group' });

    assert.deepEqual(node.addGroup('  office  '), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { friendly_name: 'office' });
    const publicationCount = client.publications.length;
    for (const invalidName of ['', '  ', null, undefined, 42, '/', ' // ', 'a\nb']) {
        assert.deepEqual(node.addGroup(invalidName), { error: true, description: 'can not be empty' });
        assert.deepEqual(node.renameGroup(2, invalidName), { error: true, description: 'can not be empty' });
    }
    assert.deepEqual(node.renameGroup(2, ' room '), { success: true, description: 'name unchanged' });
    assert.equal(client.publications.length, publicationCount);
    assert.deepEqual(node.addDeviceToGroup('lamp', 2), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { group: 2, device: 'lamp' });
    assert.deepEqual(node.removeDeviceFromGroup('lamp', 2), { success: true, description: 'command sent' });
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { group: 2, device: 'lamp' });
    assert.deepEqual(node.removeDeviceFromGroup('lamp', 9), { error: true, description: 'no such group' });
});

test('bridge settings normalize log level and publish control messages', () => {
    const { node, client } = createServer();

    node.setLogLevel('debug');
    assert.equal(client.publications.at(-1)[0], 'zigbee2mqtt/bridge/request/options');
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { options: { advanced: { log_level: 'debug' } } });
    node.setLogLevel('invalid');
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { options: { advanced: { log_level: 'info' } } });
    node.setPermitJoin(true);
    assert.equal(client.publications.at(-1)[0], 'zigbee2mqtt/bridge/request/permit_join');
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { time: 180 });
    node.setPermitJoin(false);
    assert.equal(client.publications.at(-1)[0], 'zigbee2mqtt/bridge/request/permit_join');
    assert.deepEqual(JSON.parse(client.publications.at(-1)[1]), { time: 0 });
    node.restart();
    assert.equal(client.publications.at(-1)[0], 'zigbee2mqtt/bridge/request/restart');
});

test('cached device listing returns devices and groups without waiting', () => {
    const { node } = createServer();
    node.devices = [{ friendly_name: 'lamp' }];
    node.groups = [{ friendly_name: 'room' }];
    let result;

    node.getDevices((items) => { result = items; }, true);

    assert.deepEqual(result, [node.devices, node.groups]);
});

test('forced device refresh requests the retained device and group lists', (t) => {
    const { node, client } = createServer();
    node.devices = [{ friendly_name: 'old lamp' }];
    node.groups = [];
    let result;

    node.getDevices((items) => { result = items; }, true, true);

    const topics = ['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/bridge/groups'];
    assert.deepEqual(client.subscriptions[0][0], topics);
    assert.equal(result, undefined);

    node.onMQTTMessage(topics[0], Buffer.from('[{"friendly_name":"new lamp"}]'));
    assert.equal(result, undefined);
    node.onMQTTMessage(topics[1], Buffer.from('[]'));

    assert.deepEqual(result, [[{ friendly_name: 'new lamp' }], []]);
    assert.deepEqual(client.unsubscriptions[0][0], topics);
    t.after(() => clearTimeout(node.cleanTimer));
});

test('single output suppresses retained startup values but seeds change filtering', (t) => {
    const { node: server } = createServer();
    addLamp(server, { state: 'ON' });
    const output = createFlowNode({ device_id: 'lamp', state: 'state', outputAtStartup: false });
    output.last_value = null;
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { retained: true, filter: true });
    assert.equal(output.messages.length, 0);
    assert.equal(output.last_value, 'ON');

    server.nodeSend(output, { retained: false, filter: true });
    assert.equal(output.messages.length, 0);

    server.devices_values['zigbee2mqtt/lamp'] = { state: 'OFF' };
    server.nodeSend(output, { retained: false, filter: true, msg: { payload: 'input' } });
    assert.equal(output.messages.length, 1);
    assert.equal(output.messages[0].payload, 'OFF');
    assert.equal(output.messages[0].payload_in, 'input');
    assert.deepEqual(output.messages[0].changed, { old: 'ON', new: 'OFF' });
});

test('multiple output builds values and math, suppressing retained startup output', (t) => {
    const { node: server } = createServer();
    server.devices = [
        { id: 1, friendly_name: 'lamp', ieee_address: '0x001', definition: { exposes: [] } },
        { id: 2, friendly_name: 'sensor', ieee_address: '0x002', definition: { exposes: [] } }
    ];
    server.devices_values['zigbee2mqtt/lamp'] = { brightness: 100, temperature: 20 };
    server.devices_values['zigbee2mqtt/sensor'] = { brightness: 200, temperature: 22 };
    const output = createFlowNode({
        enableMultiple: true,
        device_id: ['lamp', 'sensor'],
        outputAtStartup: false
    });
    output.last_value = null;
    t.after(() => clearTimeout(output.cleanTimer));

    server.nodeSend(output, { retained: true });
    assert.equal(output.messages.length, 0);
    assert.deepEqual(Object.keys(output.last_value), ['lamp', 'sensor']);

    server.nodeSend(output, { retained: false, msg: { payload: 'original' } });
    assert.equal(output.messages.length, 1);
    assert.deepEqual(output.messages[0].math.temperature, {
        count: 2, avg: 21, min: 20, max: 22, sum: 42
    });
    assert.equal(output.messages[0].payload_in, 'original');
});

test('close unsubscribes and ends the MQTT client', () => {
    const { node, client } = createServer();
    node.devices_values['zigbee2mqtt/lamp'] = { state: 'ON' };

    node.onClose();

    assert.equal(client.unsubscriptions[0][0], 'zigbee2mqtt/#');
    assert.equal(client.ended, true);
    assert.equal(node.connection, false);
    assert.deepEqual(node.devices_values, {});
});
