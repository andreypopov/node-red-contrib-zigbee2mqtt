const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');
const OUTPUT_STATE_TIMEOUT = 30_000;

function resolveDeviceTarget(server, key) {
    const device = server.getDeviceOrGroupByKey(key);
    if (device) {
        return { device, topic: null };
    }

    if (typeof key !== 'string' || !key) {
        return null;
    }

    const aliases = [];
    for (const item of [...(server.devices || []), ...(server.groups || [])]) {
        const names = new Set([item.friendly_name, item.ieee_address].filter((name) => typeof name === 'string' && name));
        for (const name of names) {
            const topic = server.getTopic('/' + name);
            aliases.push({ prefix: topic, topic, item });
            aliases.push({ prefix: name, topic, item });
        }
    }
    aliases.sort((left, right) => right.prefix.length - left.prefix.length);

    for (const alias of aliases) {
        if (!key.startsWith(alias.prefix + '/')) {
            continue;
        }

        const suffix = key.slice(alias.prefix.length + 1);
        if (suffix === 'set') {
            return { device: alias.item, topic: alias.topic + '/set' };
        }

        const endpoint = suffix.match(/^([^/]+)\/set$/);
        if (endpoint && alias.item.ieee_address) {
            return { device: alias.item, topic: alias.topic + '/' + endpoint[1] + '/set' };
        }
    }

    return null;
}

module.exports = function(RED) {
    class Zigbee2mqttNodeOut {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);
            node.pendingOutputs = [];
            node.outputEnabled = Number(node.config.outputs) > 0;

            node.removePendingOutput = function(pending) {
                clearTimeout(pending.timeout);
                const index = node.pendingOutputs.indexOf(pending);
                if (index !== -1) {
                    node.pendingOutputs.splice(index, 1);
                }
            };

            node.listener_onMQTTMessage = function(data) {
                if (!node.outputEnabled || !data || data.retained || typeof data.topic !== 'string') {
                    return;
                }

                const index = node.pendingOutputs.findIndex((pending) => pending.stateTopic === data.topic);
                if (index === -1) {
                    return;
                }

                const [pending] = node.pendingOutputs.splice(index, 1);
                clearTimeout(pending.timeout);

                const item = data.item || pending.device;
                const state = data.payload !== undefined ? data.payload : item.current_values;
                const response = RED.util.cloneMessage(pending.message);
                response.payload_in = pending.message.payload;
                response.payload = state;
                response.payload_raw = state;
                response.topic = data.topic;
                response.item = item;
                response.homekit = item.homekit;
                response.format = item.format;
                response.selector = Zigbee2mqttHelper.generateSelector(data.topic);
                node.send(response);
            };

            node.on('close', function() {
                clearTimeout(node.cleanTimer);
                if (node.server && node.listener_onMQTTMessage) {
                    node.server.removeListener('onMQTTMessage', node.listener_onMQTTMessage);
                }
                for (const pending of node.pendingOutputs) {
                    clearTimeout(pending.timeout);
                }
                node.pendingOutputs = [];
            });

            if (node.server) {
                node.status({}); //clean

                if (node.outputEnabled) {
                    node.server.on('onMQTTMessage', node.listener_onMQTTMessage);
                }

                node.on('input', function(message) {
                    clearTimeout(node.cleanTimer);

                    let key = node.config.device_id;
                    if ((!key || key === 'msg.topic') && message.topic) {
                        key = message.topic;
                    }
                    const target = resolveDeviceTarget(node.server, key);
                    let device = target && target.device;
                    if (device) {
                        let payload;
                        let options = {};
                        switch (node.config.payloadType) {
                            case '':
                            case null:
                            case 'nothing':
                                payload = null;
                                break;

                            case 'flow':
                            case 'global': {
                                RED.util.evaluateNodeProperty(node.config.payload, node.config.payloadType, this, message, function (error, result) {
                                    if (error) {
                                        node.error(error, message);
                                    } else {
                                        payload = result;
                                    }
                                });
                                break;
                            }
                            case 'z2m_payload':
                                payload = node.config.payload;
                                break;

                            case 'num': {
                                payload = parseFloat(node.config.payload);
                                break;
                            }

                            case 'str': {
                                payload = node.config.payload;
                                break;
                            }

                            case 'json': {
                                if (Zigbee2mqttHelper.isJson(node.config.payload)) {
                                    payload = JSON.parse(node.config.payload);
                                } else {
                                    node.warn('Incorrect payload. Waiting for valid JSON');
                                    node.status({
                                        fill: "red",
                                        shape: "dot",
                                        text: "node-red-contrib-zigbee2mqtt/out:status.no_payload"
                                    });
                                    node.cleanTimer = setTimeout(function(){
                                        node.status({}); //clean
                                    }, 3000);
                                }
                                break;
                            }

                            // case 'homekit':
                            //     payload = node.formatHomeKit(message, payload);
                            //     break;

                            case 'msg':
                            default: {
                                payload = message[node.config.payload];
                                break;
                            }
                        }


                        var command;
                        switch (node.config.commandType) {
                            case '':
                            case null:
                            case 'nothing':
                                payload = null;
                                break;

                            case 'msg': {
                                command = message[node.config.command];
                                if (command === 'color' && payload && typeof payload === 'object' && !Array.isArray(payload)
                                    && !Object.prototype.hasOwnProperty.call(payload, 'color')) {
                                    payload = { color: payload };
                                }
                                break;
                            }
                            case 'z2m_cmd':
                                command = node.config.command;
                                switch (command) {
                                    case 'state':
                                        if (payload === 'toggle') {
                                            if (device.current_values && 'position' in device.current_values) {
                                                payload = device.current_values.position > 0 ? 'close' : 'open';
                                            }
                                        }
                                        break;
                                    case 'brightness':
                                        payload = parseInt(payload);
                                        options["state"] = payload>0?"on":"Off";
                                        break;

                                    case 'position':
                                    case 'tilt':
                                        payload = parseInt(payload);
                                        break;
                                    
                                    case 'scene':
                                        command = 'scene_recall';
                                        payload = parseInt(payload);
                                        break;

                                    case 'lock':
                                        command = 'state';
                                        if (payload === 'toggle') {
                                            if (device.current_values && 'lock_state' in
                                                device.current_values && device.current_values.lock_state === 'locked') {
                                                payload = 'unlock';
                                            } else {
                                                payload = 'lock';
                                            }
                                        } else if (payload === 'lock' || payload == 1 || payload === true || payload === 'on') {
                                            payload = 'lock';
                                        } else if (payload === 'unlock' || payload == 0 || payload === false || payload === 'off') {
                                            payload = 'unlock';
                                        }
                                        break;

                                    case 'color':
                                        payload =  {"color":payload};
                                        break;
                                    case 'color_rgb':
                                        payload =  {"color":{"rgb": payload}};
                                        break;
                                    case 'color_hex':
                                        command = "color";
                                        payload =  {"color":{"hex": payload}};
                                        break;
                                    case 'color_hsb':
                                        command = "color";
                                        payload =  {"color":{"hsb": payload}};
                                        break;
                                    case 'color_hsv':
                                        command = "color";
                                        payload =  {"color":{"hsv": payload}};
                                        break;
                                    case 'color_hue':
                                        command = "color";
                                        payload =  {"color":{"hue": payload}};
                                        break;
                                    case 'color_saturation':
                                        command = "color";
                                        payload =  {"color":{"saturation": payload}};
                                        break;

                                    case 'color_temp':

                                        break;

                                    case 'brightness_move':
                                    case 'brightness_step':
                                    case 'alert':
                                    default: {
                                        break;
                                    }
                                }
                                break;

                            case 'homekit':
                                payload = node.fromHomeKitFormat(message, device);
                                break;

                            case 'json':
                                break;

                            case 'str':
                            default: {
                                command = node.config.command;
                                break;
                            }
                        }

                        let optionsToSend = {};
                        switch (node.config.optionsType) {
                            case '':
                            case null:
                            case 'nothing':
                                break;

                            case 'msg':
                                if (node.config.optionsValue in message && typeof(message[node.config.optionsValue]) == 'object') {
                                    optionsToSend = message[node.config.optionsValue];
                                } else {
                                    node.warn('Options value has invalid format');
                                }
                                break;

                            case 'json':
                                if (Zigbee2mqttHelper.isJson(node.config.optionsValue)) {
                                    optionsToSend = JSON.parse(node.config.optionsValue);
                                } else {
                                    node.warn('Options value is not valid JSON, ignore: '+node.config.optionsValue);
                                }
                                break;

                            default:
                                optionsToSend[node.config.optionsType] = node.config.optionsValue;
                                break;
                        }

                        //apply options
                        if (Object.keys(optionsToSend).length) {
                            node.server.setDeviceOptions(device.friendly_name, optionsToSend);
                        }

                        //empty payload, stop
                        if (payload === null) {
                            return false;
                        }

                        if (payload !== undefined) {
                            var toSend = {};
                            var text = '';
                            if (typeof(payload) == 'object') {
                                toSend = payload;
                                text = 'json';
                            } else {
                                toSend[command] = payload;
                                text = command+': '+payload;
                            }

                            const topic = target.topic || node.server.getTopic('/'+device.friendly_name + '/set');
                            let pendingOutput = null;
                            if (node.outputEnabled) {
                                const isDevice = (node.server.devices || []).includes(device);
                                if (isDevice) {
                                    const stateTopic = node.server.getTopic('/' + (device.friendly_name || device.ieee_address));
                                    pendingOutput = {
                                        stateTopic,
                                        device,
                                        message: RED.util.cloneMessage(message),
                                        timeout: null
                                    };
                                    pendingOutput.timeout = setTimeout(function() {
                                        node.removePendingOutput(pendingOutput);
                                        node.warn(`No state update received from ${device.friendly_name || device.ieee_address} within 30 seconds`);
                                    }, OUTPUT_STATE_TIMEOUT);
                                    node.pendingOutputs.push(pendingOutput);
                                } else {
                                    node.warn('The optional output is available for devices, not groups');
                                }
                            }

                            node.log('Published to mqtt topic: ' + topic + ' : ' + JSON.stringify(toSend));
                            node.server.mqtt.publish(topic, JSON.stringify(toSend),
                                {'qos':parseInt(node.server.config.mqtt_qos||0)},
                                function(err) {
                                    if (err) {
                                        if (pendingOutput) {
                                            node.removePendingOutput(pendingOutput);
                                        }
                                        node.error(err);
                                    }
                            });

                            let fill = node.server.getDeviceAvailabilityColor(node.server.getTopic('/'+device.friendly_name));
                            node.status({
                                fill: fill,
                                shape: "dot",
                                text: text
                            });
                            let time = Zigbee2mqttHelper.statusUpdatedAt();
                            node.cleanTimer = setTimeout(function(){
                                node.status({
                                    fill: fill,
                                    shape: "ring",
                                    text: text + ' ' + time
                                });
                            }, 3000);
                        } else {
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "node-red-contrib-zigbee2mqtt/out:status.no_payload"
                            });
                        }
                    } else {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "node-red-contrib-zigbee2mqtt/out:status.no_device"
                        });
                    }
                });

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/out:status.no_server"
                });
            }
        }

        fromHomeKitFormat(message, device) {
            if ("hap" in message && message.hap.context === undefined) {
                return null;
            }

            var payload = message['payload'];
            var msg = {};

            if (payload.On !== undefined) {
                if ("current_values" in device) {
                    // if ("brightness" in device.current_values) msg['brightness'] = device.current_values.brightness;
                }
                msg['state'] = payload.On?"on":"off";
            }
            if (payload.Brightness !== undefined) {
                msg['brightness'] =  Zigbee2mqttHelper.convertRange(payload.Brightness, [0,100], [0,255]);
                device.current_values.brightness = msg['brightness'];
                if ("current_values" in device) {
                    if ("current_values" in device) device.current_values.brightness = msg['brightness'];
                }
                if (payload.Brightness >= 254) payload.Brightness = 255;
                msg['state'] = payload.Brightness > 0?"on":"off"
            }
            if (payload.Hue !== undefined) {
                msg['color'] = {"hue":payload.Hue};
                device.current_values.color.hue = payload.Hue;
                if ("current_values" in device) {
                    if ("brightness" in device.current_values) msg['brightness'] = device.current_values.brightness;
                    if ("color" in device.current_values && "saturation" in device.current_values.color) msg['color']['saturation'] = device.current_values.color.saturation;
                    if ("color" in device.current_values && "hue" in device.current_values.color) device.current_values.color.hue = payload.Hue;
                }
                msg['state'] = "on";
            }
            if (payload.Saturation !== undefined) {
                msg['color'] = {"saturation":payload.Saturation};
                device.current_values.color.saturation = payload.Saturation;
                if ("current_values" in device) {
                    if ("brightness" in device.current_values) msg['brightness'] = device.current_values.brightness;
                    if ("color" in device.current_values && "hue" in device.current_values.color) msg['color']['hue'] = device.current_values.color.hue;
                    if ("color" in device.current_values && "saturation" in device.current_values.color) msg['color']['saturation'] = payload.Saturation;
                }
                msg['state'] = "on";
            }
            if (payload.ColorTemperature !== undefined) {
                msg['color_temp'] = Zigbee2mqttHelper.convertRange(payload.ColorTemperature, [150,500], [150,500]);
                device.current_values.color_temp = msg['color_temp'];
                if ("current_values" in device) {
                    if ("color_temp" in device.current_values)  device.current_values.color_temp = msg['color_temp'];
                }
                msg['state'] = "on";
            }
            if (payload.LockTargetState !== undefined) {
                msg['state'] = payload.LockTargetState?"LOCK":"UNLOCK";
            }
            if (payload.TargetPosition !== undefined) {
                msg['position'] = payload.TargetPosition;
            }

            return msg;
        }
    }


    RED.nodes.registerType('zigbee2mqtt-out', Zigbee2mqttNodeOut);
};


