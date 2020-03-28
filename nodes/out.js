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

// console.log(node);
                    if (node.config.device_id) {
                        var payload;
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
                            case 'date': {
                                payload = Date.now();
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

                            case 'object': {
                                payload = node.config.payload;
                                break;
                            }

                            case 'homekit':
                                payload = node.formatHomeKit(message, payload);
                                break;

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


                                    case 'bri':
                                    case 'hue':
                                    case 'sat':
                                    case 'color_temp':
                                    case 'scene': // added scene, payload is the scene ID
                                    case 'colorloopspeed':
                                        // case 'transitiontime':
                                        payload = parseInt(payload);
                                        break;

                                    case 'json':
                                    case 'alert':
                                    case 'effect':
                                    case 'state':
                                    default: {
                                        break;
                                    }
                                }
                                break;

                            case 'homekit':
                              //  payload = node.formatHomeKit(message, payload);
                                break;

                            case 'str':
                            default: {
                                command = node.command;
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
                            toSend[command] = payload;

                            node.log('Published to mqtt topic: ' + node.server.getBaseTopic()+'/'+node.config.friendly_name + '/set : ' + JSON.stringify(toSend));
                            node.server.mqtt.publish(node.server.getBaseTopic()+'/'+node.config.friendly_name + '/set', JSON.stringify(toSend));



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
            if (message.hap.context === undefined) {
                return null;
            }

            var msg = {};

            if (payload.On !== undefined) {
                msg['state'] = payload.On?"on":"off";
            } else if (payload.Brightness !== undefined) {
                msg['brightness'] =  Zigbee2mqttHelper.convertRange(payload.Brightness, [0,100], [0,255]);
                if (payload.Brightness >= 254) payload.Brightness = 255;
                msg['state'] = payload.Brightness > 0?"on":"off"
            } else if (payload.Hue !== undefined) {
                msg['hue'] = payload.Hue;
                msg['state'] = "on";
            } else if (payload.Saturation !== undefined) {
                msg['saturation'] = payload.Saturation;
                msg['state'] = "on";
            } else if (payload.ColorTemperature !== undefined) {
                msg['color_temp'] = Zigbee2mqttHelper.convertRange(payload.ColorTemperature, [140,500], [50,400]);
                msg['state'] = "on";
            }

            return msg;
        }
    }


    RED.nodes.registerType('zigbee2mqtt-out', Zigbee2mqttNodeOut);
};





