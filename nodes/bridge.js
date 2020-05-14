const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');


module.exports = function(RED) {

    class Zigbee2mqttNodeBridge {
        constructor(config) {

            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.is_subscribed = false;
            node.server = RED.nodes.getNode(node.config.server);


            // //permit join
            // if (node.config.permit_join == true) {
            //     node.server.setPermitJoin(true);
            //     node.status({
            //         fill: "yellow",
            //         shape: "ring",
            //         text: "node-red-contrib-zigbee2mqtt/bridge:status.searching"
            //     });
            //     //
            //     // node.cleanTimer = setTimeout(function () {
            //     //     node.config.permit_join = false;
            //     //     node.server.setPermitJoin(false);
            //     //     node.status({});
            //     // }, 15000);
            // } else {
            //     node.status({});
            //     node.server.setPermitJoin(false);
            // }

            if (node.server) {
                node.listener_onMQTTConnect = function(data) { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onMQTTMessageBridge = function(data) { node.onMQTTMessageBridge(data); }
                node.server.on('onMQTTMessageBridge', node.listener_onMQTTMessageBridge);

                node.on('close', () => this.onMQTTClose());

                if (typeof(node.server.mqtt) === 'object') {
                    node.onMQTTConnect();
                }
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/bridge:status.no_server"
                });
            }


            if (node.server) {
                node.on('input', function (message_in) {
                    node.log('Published to mqtt topic: ' + message_in.topic + ' Payload: ' + message_in.payload);
                    node.server.mqtt.publish(message_in.topic, JSON.stringify(message_in.payload));
                });

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/bridge:status.no_server"
                });
            }
            //         clearTimeout(node.cleanTimer);
            //
            //         var channels = [];
            //
            //         //overwrite with topic
            //         if (!(node.config.topic).length && "topic" in message_in) {
            //             if (typeof(message_in.topic) == 'string' ) message_in.topic = [message_in.topic];
            //             if (typeof(message_in.topic) == 'object') {
            //                 for (var i in message_in.topic) {
            //                     var topic = message_in.topic[i];
            //                     if (typeof(topic) == 'string' && topic in node.server.devices_values) {
            //                         channels.push(topic);
            //                     }
            //                 }
            //             }
            //         } else {
            //             channels = node.config.topic;
            //         }
            //
            //         if (typeof (channels) == 'object'  && channels.length) {
            //             var result = {};
            //             var hasData = false;
            //             if (channels.length === 1) {
            //                 message_in.topic = channels[0];
            //                 message_in.selector = Zigbee2mqttHelper.generateSelector(message_in.topic);
            //                 if (channels[0] in node.server.devices_values) {
            //                     result = node.server.devices_values[channels[0]];
            //                     hasData = true;
            //                 } else {
            //                     result = null;
            //                 }
            //             } else {
            //                 var data_array = Zigbee2mqttHelper.prepareDataArray(node.server, channels);
            //                 hasData = data_array.is_data;
            //                 result = data_array.data;
            //                 message_in.data_array = data_array.data_full;
            //                 message_in.math = data_array.math;
            //             }
            //
            //             message_in.payload_in = message_in.payload;
            //             message_in.payload = result;
            //             node.send(message_in);
            //
            //             if (hasData) {
            //                 node.status({
            //                     fill: "green",
            //                     shape: "dot",
            //                     text: channels.length === 1?result:"ok"
            //                 });
            //             } else {
            //                 node.status({
            //                     fill: "red",
            //                     shape: "dot",
            //                     text: "node-red-contrib-zigbee2mqtt/bridge:status.no_value"
            //                 });
            //             }
            //             node.cleanTimer = setTimeout(function () {
            //                 node.status({}); //clean
            //             }, 3000);
            //         } else {
            //             node.status({
            //                 fill: "red",
            //                 shape: "dot",
            //                 text: "node-red-contrib-zigbee2mqtt/bridge:status.no_device"
            //             });
            //         }
            //     });
            //
            //
            //
            // } else {
            //     node.status({
            //         fill: "red",
            //         shape: "dot",
            //         text: "node-red-contrib-zigbee2mqtt/bridge:status.no_server"
            //     });
            // }
        }


        onMQTTClose() {
            var node = this;

            //remove listeners
            if (node.listener_onMQTTConnect) {
                node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
            }
            if (node.listener_onMQTTMessageBridge) {
                node.server.removeListener("onMQTTMessageBridge", node.listener_onMQTTMessageBridge);
            }

            node.onConnectError();
        }

        onMQTTConnect() {
            var node = this;

            node.setNodeStatus();
            // node.status({
            //     fill: "green",
            //     shape: "dot",
            //     text: "node-red-contrib-zigbee2mqtt/in:status.connected"
            // });
            // node.cleanTimer = setTimeout(function () {
            //     node.status({}); //clean
            // }, 3000);
        }

        setNodeStatus() {
            var node = this;
            var config = node.server.bridge_config;
            var state = node.server.bridge_state;

            if (config && config.permit_join) {
                node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "node-red-contrib-zigbee2mqtt/bridge:status.searching"
                });
            } else {
                var text = state;
                if (config && "log_level" in config) {
                    text += ' (log: '+config.log_level+')';
                }

                node.status({
                    fill: state=="online"?"green":"red",
                    shape: "dot",
                    text: text
                });
            }
        }

        onMQTTMessageBridge(data) {
            var node = this;

            clearTimeout(node.cleanTimer);

            if (node.server.getBaseTopic()+'/bridge/state' == data.topic) {
                node.server.bridge_state = data.payload;
                node.setNodeStatus();

                node.send({
                    payload: data.payload,
                    topic: data.topic
                });
            } else if (node.server.getBaseTopic()+'/bridge/log' == data.topic) {

                if (Zigbee2mqttHelper.isJson(data.payload)) {
                    var parsedData = JSON.parse(data.payload);

                    if ("type" in parsedData) {
                        if ("device_connected" == parsedData.type) {
                            node.status({
                                fill: "green",
                                shape: "ring",
                                text: "node-red-contrib-zigbee2mqtt/bridge:status.connected"
                            });
                            node.cleanTimer = setTimeout(function(){
                                node.setNodeStatus();
                            }, 3000);
                        } else if ("pairing" == parsedData.type) {
                            if ("interview_started" == parsedData.message) {
                                node.status({
                                    fill: "yellow",
                                    shape: "ring",
                                    text: "node-red-contrib-zigbee2mqtt/bridge:status.pairing"
                                });
                                node.cleanTimer = setTimeout(function(){
                                    node.setNodeStatus();
                                }, 10000);
                            } else if ("interview_successful" == parsedData.message) {
                                node.status({
                                    fill: "green",
                                    shape: "dot",
                                    text: "node-red-contrib-zigbee2mqtt/bridge:status.paired"
                                });
                                node.cleanTimer = setTimeout(function(){
                                    node.setNodeStatus();
                                }, 3000);
                            } else if ("interview_failed" == parsedData.message) {
                                node.status({
                                    fill: "red",
                                    shape: "dot",
                                    text: "node-red-contrib-zigbee2mqtt/bridge:status.failed"
                                });
                                node.cleanTimer = setTimeout(function(){
                                    node.setNodeStatus();
                                }, 3000);
                            }

                        } else if ("device_announced" == parsedData.type) {

                        }
                    }

                    node.send({
                        payload: parsedData,
                        topic: data.topic
                    });
                } else {
                    node.send({
                        payload: data.payload,
                        topic: data.topic
                    });
                }
            } else if (node.server.getBaseTopic()+'/bridge/config' == data.topic) {
                node.setNodeStatus();

                node.send({
                    payload: JSON.parse(data.payload),
                    topic: data.topic
                });

            } else {
                node.send({
                    payload: data.payload,
                    topic: data.topic
                });
            }
        }
    }
    RED.nodes.registerType('zigbee2mqtt-bridge', Zigbee2mqttNodeBridge);
};




