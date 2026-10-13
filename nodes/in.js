const packageInfo = require('../package.json');
const createLogger = require('../resources/Zigbee2mqttLogger.js');

module.exports = function(RED) {
    class Zigbee2mqttNodeIn {
        constructor(config) {
            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);
            node.logger = createLogger(node, node.server, RED);
            node.last_value = null;
            node.last_filter_value = null;
            node.last_successful_status = {};
            node.homeAssistantEnabled = !node.config.exposeToHomeAssistant;
            node.closed = false;
            node.homeAssistantStateInitialized = !node.config.exposeToHomeAssistant;
            node.homeAssistantPendingMessages = [];
            node.homeAssistantStartupTimer = null;
            node.status({});

            if (node.server) {
                node.homeAssistantDiscoveryPrefix = String(node.server.config.homeassistant_discovery_prefix || 'homeassistant').trim().replace(/^\/+|\/+$/g, '') || 'homeassistant';
                let uniqueId = `node_red_zigbee2mqtt_${node.server.id}_${node.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                node.homeAssistantDiscoveryTopic = `${node.homeAssistantDiscoveryPrefix}/switch/node_red_zigbee2mqtt/${uniqueId}/config`;
                node.homeAssistantCommandTopic = `node-red-contrib-zigbee2mqtt/${node.server.id}/${node.id}/set`;
                node.homeAssistantStateTopic = `node-red-contrib-zigbee2mqtt/${node.server.id}/${node.id}/state`;

                node.listener_onMQTTAvailability = function(data) { node.onMQTTAvailability(data); }
                node.server.on('onMQTTAvailability', node.listener_onMQTTAvailability);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

                node.listener_onMQTTBridgeState = function(data) { node.onMQTTBridgeState(data); }
                node.server.on('onMQTTBridgeState', node.listener_onMQTTBridgeState);

                node.listener_onMQTTConnect = function() { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                if (node.config.exposeToHomeAssistant) {
                    node.listener_onHomeAssistantMessage = function(data) { node.onHomeAssistantMessage(data); }
                    node.server.on('onMQTTHomeAssistantMessage', node.listener_onHomeAssistantMessage);
                }

                node.on('close', (removed, done) => node.onClose(removed, done));

                if (node.config.exposeToHomeAssistant && node.server.connection) {
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
            let item = data.item;
            let matchesNode = item && (
                node.config.enableMultiple
                    ? (("ieee_address" in item && node.config.device_id.includes(item.ieee_address))
                        || ("id" in item && node.config.device_id.includes(item.id)))
                    : (("ieee_address" in item && item.ieee_address === node.config.device_id)
                        || ("id" in item && parseInt(item.id) === parseInt(node.config.device_id)))
            );

            if (!matchesNode) {
                return;
            }

            if (node.config.exposeToHomeAssistant && !node.homeAssistantStateInitialized) {
                node.homeAssistantPendingMessages.push(data);
                return;
            }

            if (!node.homeAssistantEnabled) {
                return;
            }

            if (node.config.enableMultiple) {
                node.server.nodeSend(node, {
                    'filter': node.config.filterChanges,
                    'filterProperties': node.config.filterProperties,
                    'changed' : data,
                    'retained': data.retained
                });
            } else {
                node.server.nodeSend(node, {
                    'filter':  node.config.filterChanges,
                    'filterProperties': node.config.filterProperties,
                    'retained': data.retained
                });
            }

        }

        onMQTTConnect() {
            let node = this;
            if (!node.config.exposeToHomeAssistant || !node.server || !node.server.mqtt) {
                return;
            }

            node.server.mqtt.subscribe([node.homeAssistantCommandTopic, node.homeAssistantStateTopic], { qos: 0 }, (error) => {
                if (node.closed) {
                    return;
                }
                if (error) {
                    node.logger.warning(`Home Assistant MQTT subscription failed: ${error.message || error}`);
                    if (!node.homeAssistantStateInitialized) {
                        node.setHomeAssistantEnabled(true);
                    }
                    return;
                }

                node.publishHomeAssistantDiscovery();
                if (!node.homeAssistantStateInitialized) {
                    clearTimeout(node.homeAssistantStartupTimer);
                    node.homeAssistantStartupTimer = setTimeout(() => {
                        if (!node.homeAssistantStateInitialized) {
                            node.setHomeAssistantEnabled(true);
                            node.server.mqtt.publish(node.homeAssistantStateTopic, 'ON', { retain: true });
                        }
                    }, 250);
                }
            });
        }

        publishHomeAssistantDiscovery() {
            let node = this;
            let deviceKey = Array.isArray(node.config.device_id) ? node.config.device_id[0] : node.config.device_id;
            let device = deviceKey && node.server.devices && node.server.getDeviceByKey(deviceKey);
            let serverName = node.server.config.name || node.server.config.host || 'Zigbee2MQTT';
            let entityName = node.name || (device && device.friendly_name) || `Zigbee2MQTT input ${node.id.slice(0, 8)}`;
            let uniqueId = `node_red_zigbee2mqtt_${node.server.id}_${node.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            let discovery = {
                name: entityName,
                unique_id: uniqueId,
                state_topic: node.homeAssistantStateTopic,
                command_topic: node.homeAssistantCommandTopic,
                payload_on: 'ON',
                payload_off: 'OFF',
                state_on: 'ON',
                state_off: 'OFF',
                retain: false,
                device: {
                    identifiers: [`node_red_zigbee2mqtt_${node.server.id}`],
                    name: `Node-RED: ${serverName}`,
                    manufacturer: 'Node-RED',
                    model: 'node-red-contrib-zigbee2mqtt'
                },
                origin: {
                    name: 'node-red-contrib-zigbee2mqtt',
                    sw_version: packageInfo.version,
                    support_url: packageInfo.homepage
                }
            };

            node.server.mqtt.publish(node.homeAssistantDiscoveryTopic, JSON.stringify(discovery), { retain: true });
        }

        onHomeAssistantMessage(data) {
            let node = this;
            if (!node.config.exposeToHomeAssistant) {
                return;
            }

            let command = data.payload.toString();
            if (command !== 'ON' && command !== 'OFF') {
                return;
            }

            if (data.topic === node.homeAssistantCommandTopic) {
                clearTimeout(node.homeAssistantStartupTimer);
                node.setHomeAssistantEnabled(command === 'ON');
                node.server.mqtt.publish(node.homeAssistantStateTopic, command, { retain: true });
            } else if (data.topic === node.homeAssistantStateTopic) {
                clearTimeout(node.homeAssistantStartupTimer);
                node.setHomeAssistantEnabled(command === 'ON');
            }
        }

        setHomeAssistantEnabled(enabled) {
            let node = this;
            node.homeAssistantEnabled = enabled;
            node.homeAssistantStateInitialized = true;
            let pendingMessages = node.homeAssistantPendingMessages;
            node.homeAssistantPendingMessages = [];
            if (enabled) {
                pendingMessages.forEach((data) => node.onMQTTMessage(data));
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


        onClose(removed, done) {
            let node = this;
            node.closed = true;
            clearTimeout(node.homeAssistantStartupTimer);

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
            if (node.listener_onMQTTConnect) {
                node.server.removeListener("onMQTTConnect", node.listener_onMQTTConnect);
            }
            if (node.listener_onHomeAssistantMessage && node.server) {
                node.server.removeListener('onMQTTHomeAssistantMessage', node.listener_onHomeAssistantMessage);
                if (node.server.mqtt) {
                    node.server.mqtt.unsubscribe([node.homeAssistantCommandTopic, node.homeAssistantStateTopic]);
                }
            }

            node.onConnectError();

            if (node.config.exposeToHomeAssistant) {
                if (removed) {
                    node.removeHomeAssistantDiscovery(done);
                    return;
                } else {
                    if (typeof done === 'function') {
                        done();
                    }
                    setTimeout(() => {
                        const replacement = RED.nodes.getNode(node.id);
                        if (!replacement
                            || !replacement.config.exposeToHomeAssistant
                            || replacement.config.server !== node.config.server) {
                            node.removeHomeAssistantDiscovery();
                        }
                    }, 100);
                    return;
                }
            }

            if (typeof done === 'function') {
                done();
            }
        }

        removeHomeAssistantDiscovery(callback) {
            let node = this;
            if (!node.server || !node.server.mqtt) {
                if (typeof callback === 'function') callback();
                return;
            }

            let completed = 0;
            let finished = false;
            let timeout = null;
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                if (typeof callback === 'function') callback();
            };
            const onPublished = () => {
                completed += 1;
                if (completed === 3) finish();
            };

            if (typeof callback === 'function') {
                timeout = setTimeout(finish, 1000);
            }
            node.server.mqtt.publish(node.homeAssistantDiscoveryTopic, '', { retain: true }, onPublished);
            node.server.mqtt.publish(node.homeAssistantCommandTopic, '', { retain: true }, onPublished);
            node.server.mqtt.publish(node.homeAssistantStateTopic, '', { retain: true }, onPublished);
        }

        setSuccessfulStatus(obj) {
            this.status(obj);
            this.last_successful_status = obj;
        }

    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};
