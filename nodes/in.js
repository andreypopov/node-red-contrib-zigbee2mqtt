module.exports = function(RED) {
    class Zigbee2mqttNodeIn {
        constructor(config) {
            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.firstMsg = true;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);
            node.last_value = null;
            node.last_successful_status = {};
            node.status({});

            if (node.server) {
                node.server.on('onConnectError', (data) => node.onConnectError(data));
                node.server.on('onMQTTMessage', (data) => node.onMQTTMessage(data));
                node.server.on('onMQTTAvailability', (data) => node.onMQTTAvailability(data));
                node.server.on('onMQTTBridgeState', (data) => node.onMQTTBridgeState(data));
                node.on('close', () => node.onConnectError());

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/in:status.no_server"
                });
            }
        }

        onMQTTAvailability(data) {
            let node = this;

            if (data.item && 'ieee_address' in data.item && data.item.ieee_address === node.config.device_id) {
                node.server.nodeSend(node, {
                    'node_send': false
                });
            }
        }

        onMQTTMessage(data) {
            let node = this;

            if (data.item &&
                (("ieee_address" in data.item && data.item.ieee_address === node.config.device_id)
            ||  ("id" in data.item && parseInt(data.item.id) === parseInt(node.config.device_id)))
            ) {
                node.server.nodeSend(node, {
                    'filter':  true
                });
            }
        }

        onMQTTBridgeState(data) {
            let node = this;
            if (data.payload) {
                node.status(node.last_successful_status);
            } else {
                node.onConnectError();
            }
        }

        onConnectError() {
            this.status({
                fill: "red",
                shape: "dot",
                text: "node-red-contrib-zigbee2mqtt/in:status.no_connection"
            });
        }

        setSuccessfulStatus(obj) {
            this.status(obj);
            this.last_successful_status = obj;
        }

    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



