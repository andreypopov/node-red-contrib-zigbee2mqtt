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
                node.listener_onMQTTAvailability = function(data) { node.onMQTTAvailability(data); }
                node.server.on('onMQTTAvailability', node.listener_onMQTTAvailability);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

                node.listener_onMQTTBridgeState = function(data) { node.onMQTTBridgeState(data); }
                node.server.on('onMQTTBridgeState', node.listener_onMQTTBridgeState);

                node.on('close', () => node.onClose());

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

            if (node.config.enableMultiple) {
                if (data.item &&
                    (("ieee_address" in data.item && (node.config.device_id).includes(data.item.ieee_address))
                        ||  ("id" in data.item && (node.config.device_id).includes(data.item.id)))
                ) {
                    node.server.nodeSend(node, {
                        'changed' : data
                    });
                }


            } else {
                if (data.item &&
                    (("ieee_address" in data.item && data.item.ieee_address === node.config.device_id)
                        ||  ("id" in data.item && parseInt(data.item.id) === parseInt(node.config.device_id)))
                ) {
                    node.server.nodeSend(node, {
                        'filter':  node.config.filterChanges
                    });
                }
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


        onClose() {
            let node = this;

            if (node.listener_onMQTTAvailability) {
                node.server.removeListener("onMQTTAvailability", node.listener_onMQTTAvailability);
            }
            if (node.listener_onConnectError) {
                node.server.removeListener("onConnectError", node.listener_onConnectError);
            }
            if (node.listener_onMQTTMessage) {
                node.server.removeListener("onMQTTMessage", node.listener_onMQTTMessage);
            }
            if (node.listener_onMQTTBridgeState) {
                node.server.removeListener("onMQTTBridgeState", node.listener_onMQTTBridgeState);
            }

            node.onConnectError();
        }

        setSuccessfulStatus(obj) {
            this.status(obj);
            this.last_successful_status = obj;
        }

    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



