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
                    // Validação robusta de entrada
                    if (!message_in || typeof message_in !== 'object') {
                         node.warn("Ignored invalid input message (not an object)");
                         return;
                    }
                    // CORREÇÃO: Tratar payload undefined explicitamente para evitar erros silenciosos
                    if (message_in.payload === undefined && node.config.payloadType === 'msg') {
                        node.warn("Message payload is undefined but required by configuration");
                        return;
                    }
                    
                    if (!node.server || !node.server.mqtt || !node.server.connection) {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "node-red-contrib-zigbee2mqtt/bridge:status.no_connection"
                        });
                        node.error("MQTT not connected - cannot publish message");
                        return;
                    }

                    if (!message_in.topic) {
                        node.error("Message must have a 'topic' property");
                        return;
                    }

                    if (message_in.payload === undefined || message_in.payload === null) {
                        node.error("Message must have a 'payload' property");
                        return;
                    }

                    node.log('Published to mqtt topic: ' + message_in.topic + 
                             ' Payload: ' + JSON.stringify(message_in.payload));

                    node.status({
                        fill: "blue",
                        shape: "ring",
                        text: "publishing..."
                    });

                    node.server.mqtt.publish(
                        message_in.topic, 
                        JSON.stringify(message_in.payload),
                        { qos: parseInt(node.server.config.mqtt_qos || 0) },
                        (err) => {
                            if (err) {
                                node.status({
                                    fill: "red",
                                    shape: "dot",
                                    text: "publish failed"
                                });
                                node.error("MQTT publish error: " + err.message);
                                
                                setTimeout(() => {
                                    node.setNodeStatus();
                                }, 5000);
                            } else {
                                setTimeout(() => {
                                    node.setNodeStatus();
                                }, 1000);
                            }
                        }
                    );
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
            if (node.server) {
                // REFATORADO: Desregistar cliente
                if (typeof node.server.unregisterClient === 'function') {
                    node.server.unregisterClient(node);
                }

                if (node.listener_onMQTTConnect) {
                    node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
                }
                if (node.listener_onMQTTMessageBridge) {
                    node.server.removeListener("onMQTTMessageBridge", node.listener_onMQTTMessageBridge);
                }
            }
        }

        onMQTTConnect() {
            let node = this;
            node.setNodeStatus();
        }

        onConnectError() {
            let node = this;
            node.status({
                fill: "red",
                shape: "dot",
                text: RED._("node-red-contrib-zigbee2mqtt/bridge:status.offline")
            });
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
                let text = node.server.bridge_state ?
                    RED._("node-red-contrib-zigbee2mqtt/bridge:status.online") :
                    RED._("node-red-contrib-zigbee2mqtt/bridge:status.offline");
                
                if (node.server.bridge_info && "log_level" in node.server.bridge_info) {
                    text += ' (log: ' + node.server.bridge_info.log_level + ')';
                }
                
                node.status({
                    fill: node.server.bridge_state ? "green" : "red",
                    shape: "dot",
                    text: text
                });
            }
        }
        
        onMQTTMessageBridge(data) {
            let node = this;
             // Proteção contra payload nulo ou indefinido
            if (!data || !Object.prototype.hasOwnProperty.call(data, 'payload'))
                return;
            
            let payload;
            try {
                const strPayload = (typeof data.payload === 'object' && data.payload !== null) 
                    ? data.payload.toString() 
                    : String(data.payload);
                    
                payload = Zigbee2mqttHelper.isJson(strPayload) ? JSON.parse(strPayload) : strPayload;
            } catch (e) {
                node.warn("Failed to parse bridge message: " + e.message);
                payload = data.payload;
            }
            
            if (node.server.getTopic('/bridge/state') === data.topic) {
                node.setNodeStatus();
            } else if (node.server.getTopic('/bridge/info') === data.topic) {
                if (payload.permit_join != (node.status.fill === 'yellow')) {
                    node.setNodeStatus();
                }
            } else if (node.server.getTopic('/bridge/event') === data.topic) {
                if (!payload) 
                    return;
                // Throttle visual: Atualizar no máximo a cada 1s para evitar sobrecarga do editor
                const now = Date.now();
                if (node._lastStatusUpdate === undefined) 
                    node._lastStatusUpdate = 0;
                
                if (now - node._lastStatusUpdate > 1000) {
                    node.status({
                        fill: "yellow",
                        shape: "ring",
                        text: payload.type || 'event'
                    });
                    node._lastStatusUpdate = now;
                }
                
                // Debounce do reset de status
                if (node.cleanTimer) clearTimeout(node.cleanTimer);
                node.cleanTimer = setTimeout(() => {
                    node.setNodeStatus();
                }, 2000); // 2s é suficiente para ler o evento
            }
 
            node.send({
                payload: payload,
                topic: data.topic
            });
        }
    }
    RED.nodes.registerType('zigbee2mqtt-bridge', Zigbee2mqttNodeBridge);
    
};