const test = require('node:test');
const assert = require('node:assert/strict');
const EditorUtils = require('../resources/js/node-red-contrib-zigbee2mqtt-editor-utils');

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
