const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');

var mqtt = require('mqtt');

module.exports = function(RED) {
    class Zigbee2mqttNodeIn {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.firstMsg = true;
            node.is_subscribed = false;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);

            node.status({}); //clean

            if (node.server) {
                node.listener_onMQTTConnect = function(data) { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

                node.listener_onMQTTBridgeState = function(data) { node.onMQTTBridgeState(data); }
                node.server.on('onMQTTBridgeState', node.listener_onMQTTBridgeState);

                node.on('close', () => this.onMQTTClose());

                if (typeof(node.server.mqtt) === 'object') {
                    node.onMQTTConnect();
                }
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/in:status.no_server"
                });
            }
        }

        onConnectError(status = null) {
            var node = this;
            node.status({
                fill: "red",
                shape: "dot",
                text: "node-red-contrib-zigbee2mqtt/in:status.no_connection"
            });
        }

        onMQTTClose() {
            var node = this;

            //remove listeners
            if (node.listener_onMQTTConnect) {
                node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
            }
            if (node.listener_onConnectError) {
                node.server.removeListener('onConnectError', node.listener_onConnectError);
            }
            if (node.listener_onMQTTMessage) {
                node.server.removeListener("onMQTTMessage", node.listener_onMQTTMessage);
            }
            if (node.listener_onMQTTBridgeState) {
                node.server.removeListener("onMQTTBridgeState", node.listener_onMQTTBridgeState);
            }

            node.onConnectError();
        }

        onMQTTConnect() {
            var node = this;

            // node.status({
            //     fill: "green",
            //     shape: "dot",
            //     text: "node-red-contrib-zigbee2mqtt/in:status.connected"
            // });
            // node.cleanTimer = setTimeout(function () {
            //     node.status({}); //clean
            // }, 3000);
        }

        onMQTTMessage(data) {
            var node = this;

            if (data.device && "ieeeAddr" in data.device && data.device.ieeeAddr == node.config.device_id) {
                //ignore /set
                if (data.topic.search(new RegExp(node.server.getBaseTopic()+'\/'+node.config.friendly_name+'\/set')) === 0) {
                    return;
                }

                clearTimeout(node.cleanTimer);
                if (node.firstMsg && !node.config.outputAtStartup) {
                    node.firstMsg = false;
                    return;
                }

                //text
                var payload = data.payload;
                var text = RED._("node-red-contrib-zigbee2mqtt/in:status.received");
                if (parseInt(node.config.state) != 0 && node.config.state in data.payload) {
                    text = data.payload[node.config.state];
                    payload = data.payload[node.config.state];
                }
                if ('Battery' == data.device.powerSource) {
                    text += ' ⚡'+data.payload.battery+'%';
                }

                node.send({
                    payload: payload,
                    payload_raw: data.payload,
                    device: data.device
                });

                node.status({
                    fill: "green",
                    shape: "dot",
                    text: text
                });

                node.cleanTimer = setTimeout(function () {
                    node.status({
                        fill: "green",
                        shape: "ring",
                        text: text
                    });
                }, 3000);
            }
        }

        onMQTTBridgeState(data) {
            var node = this;

            if (data.payload) {
                node.status({});
            } else {
                this.onConnectError();
            }
        }

    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



