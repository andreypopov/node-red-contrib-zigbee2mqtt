const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');

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

                    if (node.config.device_id) {
                        var payload;
                        var options = {};
                        switch (node.config.payloadType) {
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
                            // case 'date': {
                            //     payload = Date.now();
                            //     break;
                            // }
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
                            case 'msg': {
                                command = message[node.config.command];
                                break;
                            }
                            case 'z2m_cmd':
                                command = node.config.command;
                                switch (command) {
                                    case 'state':
                                    case 'brightness':
                                        break;

                                    case 'position':
                                        payload = parseInt(payload);
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
                                        if ("transition" in node.config && (node.config.transition).length > 0) {
                                            options['transition'] = parseInt(node.config.transition);
                                        }
                                        break;

                                    case 'brightness_move':
                                    case 'alert':
                                    default: {
                                        break;
                                    }
                                }
                                break;

                            case 'homekit':
                                payload = node.formatHomeKit(message, message['payload']);
                                break;

                            case 'json':
                                break;

                            case 'str':
                            default: {
                                command = node.config.command;
                                break;
                            }
                        }

                        //empty payload, stop
                        if (payload === null) {
                            return false;
                        }

                        if (payload !== undefined) {

                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: payload.toString()
                            });

                            node.cleanTimer = setTimeout(function(){
                                node.status({}); //clean
                            }, 3000);

                            var toSend = {};
                            var text = '';
                            if (typeof(payload) == 'object') {
                                toSend = payload;
                                text = 'json';
                            } else {
                                toSend[command] = payload;
                                text = command+': '+payload;
                            }
                            //add options
                            if (Object.keys(options).length) {
                                for (var key in options) {
                                    toSend[key] = options[key];
                                }
                            }

                            node.log('Published to mqtt topic: ' + node.server.getBaseTopic()+'/'+node.config.friendly_name + '/set : ' + JSON.stringify(toSend));
                            node.server.mqtt.publish(node.server.getBaseTopic()+'/'+node.config.friendly_name + '/set', JSON.stringify(toSend));

                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: text
                            });
                            node.cleanTimer = setTimeout(function(){
                                node.status({}); //clean
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

        formatHomeKit(message, payload) {
            if ("hap" in message && message.hap.context === undefined) {
                return null;
            }

            var msg = {};

            if (payload.On !== undefined) {
                msg['state'] = payload.On?"on":"off";
            }
            if (payload.Brightness !== undefined) {
                msg['brightness'] =  Zigbee2mqttHelper.convertRange(payload.Brightness, [0,100], [0,255]);
                if (payload.Brightness >= 254) payload.Brightness = 255;
                msg['state'] = payload.Brightness > 0?"on":"off"
            }
            if (payload.Hue !== undefined) {
                msg['color'] = {"hue":payload.Hue};
                msg['state'] = "on";
            }
            if (payload.Saturation !== undefined) {
                msg['color'] = {"saturation":payload.Saturation};
                msg['state'] = "on";
            }
            if (payload.ColorTemperature !== undefined) {
                msg['color_temp'] = Zigbee2mqttHelper.convertRange(payload.ColorTemperature, [140,500], [50,400]);
                msg['state'] = "on";
            }
            if (payload.LockTargetState !== undefined) {
                msg['state'] = payload.LockTargetState?"LOCK":"UNLOCK";
            }

            return msg;
        }
    }


    RED.nodes.registerType('zigbee2mqtt-out', Zigbee2mqttNodeOut);
};






