const test = require('node:test');
const assert = require('node:assert/strict');
const EditorUtils = require('../resources/js/node-red-contrib-zigbee2mqtt-editor-utils');

test("default Out labels describe the selected state action and device", () => {
    const node = {
        name: "",
        friendly_name: "Desk lamp",
        device_id: "desk_lamp",
        commandType: "z2m_cmd",
        command: "state",
        payloadType: "z2m_payload",
        payload: "on"
    };

    assert.equal(EditorUtils.getDefaultOutNodeLabel(node), "Turn on Desk lamp");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, payload: "off" }), "Turn off Desk lamp");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, payload: "toggle" }), "Toggle Desk lamp");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, command: "state_l2" }), "Turn on Desk lamp (l2)");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, payloadType: "msg" }), "Set state of Desk lamp");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, command: "brightness" }), "Set brightness of Desk lamp");
    assert.equal(EditorUtils.getDefaultOutNodeLabel({ ...node, name: "Custom name" }), "Custom name");
});

test('server flow labels are appended when configured and omitted when blank', () => {
    assert.equal(EditorUtils.appendServerFlowLabel('Turn on Desk lamp', { flow_label: 'Upstairs' }), 'Turn on Desk lamp [Upstairs]');
    assert.equal(EditorUtils.appendServerFlowLabel('Custom name', { flow_label: '  House A  ' }), 'Custom name [House A]');
    assert.equal(EditorUtils.appendServerFlowLabel('Desk lamp', { flow_label: '  ' }), 'Desk lamp');
    assert.equal(EditorUtils.appendServerFlowLabel('Desk lamp', null), 'Desk lamp');
});

test('Out payload choices follow the values the device declares', () => {
    const values = (device, command) => EditorUtils.getPayloadOptions(device, command).map(({ value, label }) => `${value}:${label}`);
    const device = (expose) => ({ definition: { exposes: [expose] } });

    assert.deepEqual(values(device({ type: 'binary', property: 'state', access: 7, value_on: 'ON', value_off: 'OFF', value_toggle: 'TOGGLE' }), 'state'),
        ['on:On', 'off:Off', 'toggle:Toggle']);
    assert.deepEqual(values(device({ type: 'enum', property: 'state', access: 7, values: ['OPEN', 'CLOSE', 'STOP'] }), 'state'),
        ['open:Open', 'close:Close', 'STOP:STOP']);
    assert.deepEqual(values(device({ type: 'enum', property: 'mode', access: 7, values: ['eco', 'comfort'] }), 'mode'),
        ['eco:eco', 'comfort:comfort']);
    assert.deepEqual(values(null, 'state').length, 7);
    assert.deepEqual(values(null, 'brightness'), []);

    const socket = device({ type: 'binary', property: 'state', access: 7, value_on: 'ON', value_off: 'OFF', value_toggle: 'TOGGLE' });
    assert.equal(EditorUtils.getStateCommandOptions(socket)[0].label, 'State (on|off|toggle)');
    assert.equal(EditorUtils.getStateCommandOptions()[0].label, 'State (on|off|toggle|lock|unlock|open|close)');
    assert.equal(EditorUtils.getStateCommandOptions()[1].label, 'State_l1 (on|off|toggle)');
});

test('Out commands are limited to what the selected device supports', () => {
    const commands = ['state', 'state_l1', 'brightness', 'brightness_move', 'color', 'color_rgb',
        'color_temp', 'color_temp_step', 'position', 'tilt', 'scene', 'lock', 'alert'].map((value) => ({ value, label: value }));
    const values = (device, keep) => EditorUtils.filterCommandOptions(commands, device, keep).map(({ value }) => value);
    const light = { definition: { exposes: [{ type: 'light', features: [
        { property: 'state', access: 7 },
        { property: 'brightness', access: 7 },
        { property: 'color_temp', access: 7 }
    ] }, { property: 'linkquality', access: 1 }] } };

    assert.deepEqual(values(light), ['state', 'brightness', 'brightness_move', 'color_temp', 'color_temp_step', 'scene', 'alert']);
    assert.deepEqual(values({ definition: { exposes: [{ type: 'light', features: [
        { property: 'state', access: 7 },
        { type: 'composite', property: 'color', access: 7, features: [{ property: 'x', access: 7 }] }
    ] }] } }), ['state', 'color', 'color_rgb', 'scene', 'alert']);
    assert.deepEqual(values({ definition: { exposes: [{ type: 'lock', features: [{ property: 'state', access: 7 }] }] } }), ['state', 'lock']);
    assert.deepEqual(values({ definition: { exposes: [{ type: 'cover', features: [
        { property: 'state', access: 7 }, { property: 'position', access: 7 }
    ] }] } }), ['state', 'position']);
    assert.deepEqual(values(light, 'tilt'), ['state', 'brightness', 'brightness_move', 'color_temp', 'color_temp_step', 'tilt', 'scene', 'alert']);
    assert.deepEqual(values({ definition: { exposes: [{ property: 'temperature', access: 1 }] } }), commands.map(({ value }) => value));
    assert.deepEqual(values(null), commands.map(({ value }) => value));
    assert.deepEqual(values({ friendly_name: 'room' }), commands.map(({ value }) => value));
});

test('multi-endpoint state commands cover endpoints 1 through 9', () => {
    assert.deepEqual(
        EditorUtils.getStateCommandOptions().map(({ value }) => value),
        ['state', ...Array.from({ length: 9 }, (_, index) => `state_l${index + 1}`)]
    );
    assert.equal(EditorUtils.isStateCommand('state_l9'), true);
    assert.equal(EditorUtils.isStateCommand('state_unknown'), false);
    assert.equal(EditorUtils.isStateCommand(null), false);
});

test('state commands offer appropriate payload values', () => {
    assert.deepEqual(
        EditorUtils.getStatePayloadOptions('state').map(({ value }) => value),
        ['on', 'off', 'toggle', 'lock', 'unlock', 'open', 'close']
    );
    assert.deepEqual(
        EditorUtils.getStatePayloadOptions('state_l1').map(({ value }) => value),
        ['on', 'off', 'toggle']
    );
    assert.deepEqual(EditorUtils.getStatePayloadOptions('state_l0'), []);
});

test('expose labels distinguish endpoint properties while retaining names and units', () => {
    assert.equal(
        EditorUtils.formatExposeLabel({ name: 'State', property: 'state_l1' }),
        'State (l1)'
    );
    assert.equal(
        EditorUtils.formatExposeLabel({ name: 'State', property: 'state_l2' }, { endpoint: 'l2' }),
        'State (l2)'
    );
    assert.equal(
        EditorUtils.formatExposeLabel({ name: 'Battery', property: 'battery', unit: '%' }),
        'Battery, %'
    );
    assert.equal(EditorUtils.formatExposeLabel({ property: 'state_l3' }), 'state_l3');
    assert.equal(EditorUtils.formatExposeLabel(null), '');
});

test('comparison property options combine exposed and current state properties across devices', () => {
    const devices = [
        {
            definition: {
                exposes: [
                    {
                        type: 'light',
                        features: [
                            { type: 'binary', name: 'State', property: 'state_l1', endpoint: 'l1' },
                            { type: 'numeric', name: 'Brightness', property: 'brightness', unit: '%' }
                        ]
                    },
                    { type: 'numeric', name: 'Link quality', property: 'linkquality' }
                ]
            },
            current_values: { state_l1: 'ON', brightness: 80, linkquality: 100, action: 'single' }
        },
        {
            definition: {
                exposes: [{
                    type: 'light',
                    features: [
                        { type: 'binary', name: 'State', property: 'state_l2', endpoint: 'l2' },
                        { type: 'numeric', name: 'Brightness', property: 'brightness', unit: '%' }
                    ]
                }]
            },
            current_values: { state_l2: 'OFF', brightness: 20, last_seen: 'now' }
        }
    ];

    const options = EditorUtils.getComparePropertyOptions(devices);
    const byValue = new Map(options.map((option) => [option.value, option.label]));

    assert.deepEqual([...byValue.keys()].sort(), [
        'action', 'brightness', 'last_seen', 'linkquality', 'state_l1', 'state_l2'
    ]);
    assert.equal(byValue.get('brightness'), 'Brightness, %');
    assert.equal(byValue.get('state_l1'), 'State (l1)');
    assert.equal(byValue.get('state_l2'), 'State (l2)');
    assert.deepEqual(EditorUtils.getComparePropertyOptions(null), []);
});

test('writable expose options include settable parameters and their selectable values', () => {
    const device = {
        definition: {
            exposes: [
                {
                    type: 'enum', name: 'Mode', property: 'mode', access: 2,
                    values: ['off', 'eco', 'comfort']
                },
                {
                    type: 'light',
                    features: [
                        {
                            type: 'binary', name: 'State', property: 'state', access: 3,
                            value_on: 'ON', value_off: 'OFF'
                        },
                        { type: 'numeric', name: 'Battery', property: 'battery', access: 1, unit: '%' },
                        {
                            type: 'enum', name: 'Duplicate mode', property: 'mode', access: 2,
                            values: ['duplicate']
                        }
                    ]
                }
            ]
        }
    };

    assert.deepEqual(
        EditorUtils.getWritableExposeOptions(device).map(({value, label}) => ({value, label})),
        [
            { value: 'mode', label: 'Mode' },
            { value: 'state', label: 'State' }
        ]
    );
    assert.deepEqual(EditorUtils.getWritableExposePayloadOptions(device, 'mode'), [
        { value: 'off', label: 'off' },
        { value: 'eco', label: 'eco' },
        { value: 'comfort', label: 'comfort' }
    ]);
    assert.deepEqual(EditorUtils.getWritableExposePayloadOptions(device, 'state'), [
        { value: 'ON', label: 'ON' },
        { value: 'OFF', label: 'OFF' }
    ]);
    assert.deepEqual(EditorUtils.getWritableExposePayloadOptions(device, 'battery'), []);
    assert.deepEqual(EditorUtils.getWritableExposePayloadOptions({ definition: { exposes: [{
        type: 'binary', property: 'state', access: 7, value_on: 'ON', value_off: 'OFF', value_toggle: 'TOGGLE'
    }] } }, 'state').map(({ value }) => value), ['ON', 'OFF', 'TOGGLE']);
    assert.deepEqual(EditorUtils.getWritableExposeOptions(null), []);
});
