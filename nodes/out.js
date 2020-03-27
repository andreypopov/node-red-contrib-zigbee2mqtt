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

            if (typeof(node.config.channel) == 'string') node.config.channel = [node.config.channel]; //for compatible

            if (node.server) {
                node.status({}); //clean

                node.on('input', function(message) {
                    clearTimeout(node.cleanTimer);

                    var channels = [];

                    //overwrite with topic
                    if (!(node.config.channel).length && "topic" in message) {
                        if (typeof(message.topic) == 'string' ) message.topic = [message.topic];
                        if (typeof(message.topic) == 'object') {
                            for (var i in message.topic) {
                                var topic = message.topic[i];
                                if (typeof(topic) == 'string' && topic in node.server.devices_values) {
                                    channels.push(topic);
                                }
                            }
                        }
                    } else {
                        channels = node.config.channel;
                    }


                    if (typeof (channels) == 'object'  && channels.length) {
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

                            case 'str':
                            default: {
                                command = node.config.command;
                                break;
                            }
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


                            for (var i in channels) {
                                node.log('Published to mqtt topic: ' + (channels[i] + command) + ' : ' + payload.toString());
                                node.server.mqtt.publish(channels[i] + command, payload.toString());
                            }


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
    }
    RED.nodes.registerType('zigbee2mqtt-out', Zigbee2mqttNodeOut);
};






