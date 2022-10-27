const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');

module.exports = function(RED) {
    class Zigbee2mqttNodeOut {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);

            if (node.server) {
                node.status({}); //clean

                node.on('input', function(message) {
                    clearTimeout(node.cleanTimer);

                    let key = node.config.device_id;
                    if ((!key || key === 'msg.topic') && message.topic) {
                        key = message.topic;
                    }
                    let device = node.server.getDeviceOrGroupByKey(key);
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
                                payload = parseInt(node.config.payload);
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
                                break;
                            }
                            case 'z2m_cmd':
                                command = node.config.command;
                                switch (command) {
                                    case 'state':
                                        if (payload === 'toggle') {
                                            if ('position' in device.current_values) {
                                                payload = device.current_values.position > 0 ? 'close' : 'open';
                                            }
                                        }
                                        break;
                                    case 'brightness':
                                        payload = parseInt(payload);
                                        options["state"] = payload>0?"on":"Off";
                                        break;

                                    case 'position':
                                        payload = parseInt(payload);
                                        break;

                                    case 'lock':
                                        command = 'state';
                                        if (payload === 'toggle') {
                                            if ('lock_state' in
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

                            node.log('Published to mqtt topic: ' + node.server.getTopic('/'+device.friendly_name + '/set') + ' : ' + JSON.stringify(toSend));
                            node.server.mqtt.publish(node.server.getTopic('/'+device.friendly_name + '/set'), JSON.stringify(toSend),
                                {'qos':parseInt(node.server.config.mqtt_qos||0)},
                                function(err) {
                                    if (err) {
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






