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

            if (typeof(node.config.channel) == 'string') node.config.channel = [node.config.channel]; //for compatible

            node.status({}); //clean

            if (node.server) {
                node.listener_onMQTTConnect = function(data) { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

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

            node.onConnectError();
        }

        onMQTTConnect() {
            var node = this;

            node.status({
                fill: "green",
                shape: "dot",
                text: "node-red-contrib-zigbee2mqtt/in:status.connected"
            });

            // node.cleanTimer = setTimeout(function () {
            //     node.status({}); //clean
            // }, 3000);
        }

        onMQTTMessage(data) {
            var node = this;

            if (node.hasChannel(data.topic)) {
                clearTimeout(node.cleanTimer);
                
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: data.payload
                });

                if (node.isSingleChannelMode()) {
                    if (node.firstMsg && !node.config.outputAtStartup) {
                        node.firstMsg = false;
                        return;
                    }

                    node.send({
                        payload: data.payload,
                        topic: data.topic,
                        selector: Zigbee2mqttHelper.generateSelector(data.topic)
                    });
                } else {
                    var data_array = Zigbee2mqttHelper.prepareDataArray(node.server, node.config.channel);

                    if (node.firstMsg && !node.config.outputAtStartup && data_array.has_null) {
                        return;
                    }
                    node.firstMsg = false;

                    node.send({
                        payload: data_array.data,
                        data_array: data_array.data_full,
                        math: data_array.math,
                        event: {
                            payload: data.payload,
                            topic:data.topic,
                            selector: Zigbee2mqttHelper.generateSelector(data.topic)
                        }
                    });

                    node.cleanTimer = setTimeout(function () {
                        node.status({}); //clean
                    }, 3000);
                }
            }
        }

        isSingleChannelMode() {
            return (this.config.channel).length === 1;
        }

        hasChannel(channel) {
            var node = this;
            var result = false;

            for (var i in node.config.channel) {
                if (node.config.channel[i] === channel) {
                    result = true;
                    break;
                }
            }

            return result;
        }


    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



