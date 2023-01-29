const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');

module.exports = function(RED) {

    class Zigbee2mqttNodeBridge {
        constructor(config) {

            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.cleanTimer = null;
            node.is_subscribed = false;
            node.server = RED.nodes.getNode(node.config.server);

            if (node.server) {
                node.listener_onMQTTConnect = function() { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onMQTTMessageBridge = function(data) { node.onMQTTMessageBridge(data); }
                node.server.on('onMQTTMessageBridge', node.listener_onMQTTMessageBridge);

                node.on('close', () => node.onClose());

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
                    node.log('Published to mqtt topic: ' + message_in.topic + ' Payload: ' + JSON.stringify(message_in.payload));
                    node.server.mqtt.publish(message_in.topic, JSON.stringify(message_in.payload));
                });

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/bridge:status.no_server"
                });
            }
        }

        onClose() {
            let node = this;
            node.setNodeStatus();

            //remove listeners
            if (node.listener_onMQTTConnect) {
                node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
            }
            if (node.listener_onMQTTMessageBridge) {
                node.server.removeListener("onMQTTMessageBridge", node.listener_onMQTTMessageBridge);
            }
        }

        onMQTTConnect() {
            let node = this;
            node.setNodeStatus();
        }

        setNodeStatus() {
            let node = this;

            if (node.server.bridge_info && node.server.bridge_info.permit_join && node.server.bridge_state) {
                node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "node-red-contrib-zigbee2mqtt/bridge:status.searching"
                });
            } else {
                let text = node.server.bridge_state?RED._("node-red-contrib-zigbee2mqtt/bridge:status.online"):RED._("node-red-contrib-zigbee2mqtt/bridge:status.offline");
                if (node.server.bridge_info && "log_level" in node.server.bridge_info) {
                    text += ' (log: '+node.server.bridge_info.log_level+')';
                }
                node.status({
                    fill: node.server.bridge_state?"green":"red",
                    shape: "dot",
                    text: text
                });
            }
        }

        onMQTTMessageBridge(data) {
            let node = this;
            let payload = Zigbee2mqttHelper.isJson(data.payload)?JSON.parse(data.payload):data.payload;

            if (node.server.getTopic('/bridge/state') === data.topic) {
                node.setNodeStatus();
            } else if (node.server.getTopic('/bridge/info') === data.topic) {
                if (payload.permit_join != (node.status.fill === 'yellow')) {
                    node.setNodeStatus();
                }
            } else if (node.server.getTopic('/bridge/event') === data.topic) {
                node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: payload.type
                });
                clearTimeout(node.cleanTimer);
                node.cleanTimer = setTimeout(function(){
                    node.setNodeStatus();
                }, 10000);
            }

            node.send({
                payload: payload,
                topic: data.topic
            });
        }
    }
    RED.nodes.registerType('zigbee2mqtt-bridge', Zigbee2mqttNodeBridge);
};




