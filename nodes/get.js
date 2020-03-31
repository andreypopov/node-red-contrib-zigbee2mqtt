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
                        if (device) {
                            // console.log(device);
                            var result = null;

                            if ("lastPayload" in device) {
                                if (parseInt(node.config.state) != 0 && node.config.state in device.lastPayload) {
                                    result = device.lastPayload[node.config.state];
                                } else {
                                    result = device.lastPayload;
                                }

                                message_in.payload_in = message_in.payload;
                                message_in.payload = result;
                                message_in.payload_raw = device.lastPayload;
                                message_in.device = device;
                                node.send(message_in);

                                //text
                                var text = RED._("node-red-contrib-zigbee2mqtt/get:status.received");
                                if (parseInt(node.config.state) != 0 && node.config.state in device.lastPayload) {
                                    text = device.lastPayload[node.config.state];
                                }

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




