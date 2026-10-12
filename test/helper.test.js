const test = require('node:test');
const assert = require('node:assert/strict');
const Helper = require('../resources/Zigbee2mqttHelper');

test('generateSelector transliterates Cyrillic and normalizes topic separators', () => {
    assert.equal(Helper.generateSelector('Кухня/Свет 1'), 'Kuhnya_Svet1');
    assert.equal(Helper.generateSelector('zigbee2mqtt/lamp-1'), 'zigbee2mqtt_lamp-1');
});

test('convertRange rounds up and clamps to the output range', () => {
    assert.equal(Helper.convertRange(50, [0, 100], [0, 255]), 128);
    assert.equal(Helper.convertRange(-10, [0, 100], [0, 255]), 0);
    assert.equal(Helper.convertRange(110, [0, 100], [0, 255]), 255);
});

test('isJson accepts valid JSON values and rejects malformed input', () => {
    assert.equal(Helper.isJson('{"state":"ON"}'), true);
    assert.equal(Helper.isJson('null'), true);
    assert.equal(Helper.isJson('{state:ON}'), false);
    assert.equal(Helper.isJson(undefined), false);
});

test('rgb2hsv converts primary and achromatic colors', () => {
    assert.deepEqual(Helper.rgb2hsv(255, 0, 0), { h: 0, s: 100, v: 100 });
    assert.deepEqual(Helper.rgb2hsv(128, 128, 128), { h: 0, s: 0, v: 50.2 });
    assert.deepEqual(Helper.rgb2hsv(0, 0, 0), { h: 0, s: 0, v: 0 });
});

test('cie2rgb applies default and explicit brightness', () => {
    const atDefaultBrightness = Helper.cie2rgb(0.3127, 0.329, undefined);
    const atZeroBrightness = Helper.cie2rgb(0.3127, 0.329, 0);

    assert.ok(Object.values(atDefaultBrightness).every((channel) => channel >= 0 && channel <= 255));
    assert.deepEqual(atZeroBrightness, { r: 0, g: 0, b: 0 });
});

test('payload2homekit returns empty state for absent payload', () => {
    assert.deepEqual(Helper.payload2homekit(null), {});
});

test("payload conversion helpers ignore plain-text MQTT states", () => {
    assert.deepEqual(Helper.payload2homekit("ON"), {});
    assert.deepEqual(Helper.formatPayload("ON"), {});
});

test('payload2homekit maps lights, temperature, battery and lock state', () => {
    const result = Helper.payload2homekit({
        state: 'ON',
        brightness: 255,
        color_temp: 300,
        color: { hue: 120, saturation: 80 },
        temperature: '21.5',
        humidity: '45.2',
        battery: '12',
        contact: true,
        occupancy: true,
        water_leak: true,
        smoke: false,
        illuminance_lux: '36'
    });

    assert.deepEqual(result.Lightbulb, { On: true, Brightness: 100 });
    assert.deepEqual(result.Lightbulb_CT, { On: true, Brightness: 100, ColorTemperature: 300 });
    assert.deepEqual(result.Lightbulb_RGB, { On: true, Brightness: 100, Hue: 120, Saturation: 80 });
    assert.deepEqual(result.Lightbulb_RGB_CT, {
        On: true, Brightness: 100, Hue: 120, Saturation: 80, ColorTemperature: 300
    });
    assert.deepEqual(result.TemperatureSensor, { CurrentTemperature: 21.5 });
    assert.deepEqual(result.HumiditySensor, { CurrentRelativeHumidity: 45.2 });
    assert.deepEqual(result.Battery, { BatteryLevel: 12, StatusLowBattery: 1 });
    assert.deepEqual(result.ContactSensor, { ContactSensorState: 0 });
    assert.deepEqual(result.ContactSensor_Inverse, { ContactSensorState: 1 });
    assert.deepEqual(result.MotionSensor, { MotionDetected: true });
    assert.deepEqual(result.OccupancySensor, { OccupancyDetected: 1 });
    assert.deepEqual(result.LeakSensor, { LeakDetected: 1 });
    assert.deepEqual(result.SmokeSensor, { SmokeDetected: 0 });
    assert.deepEqual(result.LightSensor, { CurrentAmbientLightLevel: 36 });
    assert.deepEqual(Helper.payload2homekit({ state: 'LOCK' }).LockMechanism, {
        LockCurrentState: 1, LockTargetState: 1
    });
});

test('payload2homekit maps off lights and window positions', () => {
    const off = Helper.payload2homekit({
        state: 'OFF', brightness: 0, color_temp: 250, color: { hue: 0, saturation: 0 }
    });
    assert.deepEqual(off.Lightbulb, { On: false });
    assert.deepEqual(off.Lightbulb_CT, { On: false });
    assert.deepEqual(off.Lightbulb_RGB, { On: false });
    assert.deepEqual(off.Lightbulb_RGB_CT, { On: false });

    assert.deepEqual(Helper.payload2homekit({ position: '42', motor_state: 'opening' }).Window, {
        CurrentPosition: 42, TargetPosition: 100, PositionState: 1
    });
    assert.deepEqual(Helper.payload2homekit({ position: '35', running: true }).Door, {
        CurrentPosition: 35, TargetPosition: 35, PositionState: 1
    });
    assert.deepEqual(Helper.payload2homekit({ position: '0' }).WindowCovering, {
        CurrentPosition: 0, TargetPosition: 0, PositionState: 2
    });
});

test('formatPayload converts CIE xy color values to RGB and HSV', () => {
    const formatted = Helper.formatPayload({ color: { x: 0.3127, y: 0.329 }, brightness: 200 });

    assert.deepEqual(Object.keys(formatted.color).sort(), ['hsv', 'rgb']);
    assert.ok(formatted.color.rgb.r >= 0 && formatted.color.rgb.r <= 255);
    assert.ok(formatted.color.hsv.s >= 0 && formatted.color.hsv.s <= 100);
    assert.deepEqual(Helper.formatPayload({ state: 'ON' }), {});
});

test('formatMath computes rounded numeric aggregates and ignores non-numbers', () => {
    assert.deepEqual(Helper.formatMath([
        { temperature: 20.25, linkquality: 10, status: 'online', enabled: true },
        { temperature: 21.5, linkquality: 30, status: 'offline', enabled: false }
    ]), {
        temperature: { count: 2, sum: 41.75, avg: 20.88, min: 20.25, max: 21.5 },
        linkquality: { count: 2, sum: 40, avg: 20, min: 10, max: 30 }
    });
});

test('numeric helpers distinguish integers, floats, booleans and empty strings', () => {
    assert.equal(Helper.isNumber(4), true);
    assert.equal(Helper.isInt(4), true);
    assert.equal(Helper.isFloat(4.5), true);
    assert.equal(Helper.isNumber('4.5'), true);
    assert.equal(Helper.isNumber(true), false);
    assert.equal(Helper.isNumber('false'), false);
    assert.equal(Helper.isNumber(''), false);
});

test('statusUpdatedAt returns a bracketed local date and time', () => {
    assert.match(Helper.statusUpdatedAt(), /^ \[.+ .+\]$/);
});
