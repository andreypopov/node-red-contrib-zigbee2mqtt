const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');

module.exports = function(RED) {
    class Zigbee2mqttNodeGet {
        constructor(config) {

            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.is_subscribed = false;
            node.server = RED.nodes.getNode(node.config.server);


            if (node.server)  {
                node.on('input', function (message_in) {
                    clearTimeout(node.cleanTimer);

                    if (node.config.device_id) {


                        var device = node.server.getDeviceById(node.config.device_id);
                        var group = node.server.getGroupById(node.config.device_id);
                        if (device) {
                            if ("lastPayload" in device) {
                                var homekit_payload = Zigbee2mqttHelper.payload2homekit(device.lastPayload, device);
                                var format_payload = Zigbee2mqttHelper.formatPayload(device.lastPayload, device);
                                var result = device.lastPayload;
                                var text = RED._("node-red-contrib-zigbee2mqtt/get:status.received");
                                if (parseInt(node.config.state) != 0 && node.config.state in device.lastPayload) {
                                    result = device.lastPayload[node.config.state];
                                    text = device.lastPayload[node.config.state];
                                } else if (homekit_payload && node.config.state.split("homekit_").join('') in homekit_payload) {
                                    result = homekit_payload[node.config.state.split("homekit_").join('')];
                                }

                                message_in.payload_in = message_in.payload;
                                message_in.payload = result;
                                message_in.payload_raw = device.lastPayload;
                                message_in.device = device;
                                message_in.homekit = homekit_payload;
                                message_in.format = format_payload;
                                node.send(message_in);

                                node.status({
                                    fill: "green",
                                    shape: "dot",
                                    text: text
                                });

                                node.cleanTimer = setTimeout(function () {
                                    node.status({});
                                }, 3000);
                            }
                        } else if (group) {
                            if ("lastPayload" in group) {
                                var homekit_payload = Zigbee2mqttHelper.payload2homekit(group.lastPayload, group);
                                var format_payload = Zigbee2mqttHelper.formatPayload(group.lastPayload, group);
                                var result = group.lastPayload;
                                var text = RED._("node-red-contrib-zigbee2mqtt/get:status.received");
                                if (parseInt(node.config.state) != 0 && node.config.state in group.lastPayload) {
                                    result = group.lastPayload[node.config.state];
                                    text = group.lastPayload[node.config.state];
                                } else if (homekit_payload && node.config.state.split("homekit_").join('') in homekit_payload) {
                                    result = homekit_payload[node.config.state.split("homekit_").join('')];
                                }

                                message_in.payload_in = message_in.payload;
                                message_in.payload = result;
                                message_in.payload_raw = group.lastPayload;
                                message_in.homekit = homekit_payload;
                                message_in.format = format_payload;
                                node.send(message_in);

                                node.status({
                                    fill: "green",
                                    shape: "dot",
                                    text: text
                                });

                                node.cleanTimer = setTimeout(function () {
                                    node.status({});
                                }, 3000);
                            }
                        } else {
                            node.warn('Empty devices list. Bug?');
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "node-red-contrib-zigbee2mqtt/get:status.no_device"
                            });
                        }

                    } else {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "node-red-contrib-zigbee2mqtt/get:status.no_device"
                        });
                    }
                });

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/get:status.no_server"
                });
            }
        }

    }
    RED.nodes.registerType('zigbee2mqtt-get', Zigbee2mqttNodeGet);
};




