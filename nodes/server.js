const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');
var Viz = require('@viz-js/viz');
var vizInstancePromise;
const MAX_PENDING_MQTT_MESSAGES = 1000;
const INITIAL_STATE_REQUEST_DELAY_MS = 1000;
const DEVICE_STATE_REQUEST_TIMEOUT_MS = 15_000;

function hasState(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return typeof value !== 'object' || Object.keys(value).length > 0;
}

function hasRequestedState(node, device) {
    if (!device || !hasState(device.current_values)) return false;
    const state = node.config.state;
    if (!state || state === '0') return true;

    const property = state.split('homekit_').join('');
    if (state.startsWith('homekit_')) {
        return !!device.homekit && property in device.homekit
            && device.homekit[property] !== null && device.homekit[property] !== undefined;
    }
    return typeof device.current_values === 'object' && property in device.current_values
        && device.current_values[property] !== null && device.current_values[property] !== undefined;
}

function getDeviceGetPayload(device) {
    const exposes = device && device.definition && device.definition.exposes;
    if (!Array.isArray(exposes)) return null;

    const payload = {};
    for (const expose of exposes) {
        if (expose && typeof expose.name === 'string' && expose.access && (expose.access & 0b100)) {
            payload[expose.name] = '';
        }
    }
    return Object.keys(payload).length ? payload : null;
}

function getVizInstance() {
    if (!vizInstancePromise) {
        vizInstancePromise = Viz.instance().catch((error) => {
            vizInstancePromise = null;
            throw error;
        });
    }
    return vizInstancePromise;
}

function parseFilterProperties(value) {
    const values = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
    return [...new Set(values
        .filter((property) => typeof property === 'string')
        .map((property) => property.trim())
        .filter(Boolean))];
}

function selectFilterProperties(payload, properties) {
    if (!properties.length || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return payload;
    }

    return Object.fromEntries(properties
        .filter((property) => Object.prototype.hasOwnProperty.call(payload, property))
        .map((property) => [property, payload[property]]));
}

function getComparisonValue(payload, properties, multiple = false) {
    const selectedProperties = parseFilterProperties(properties);
    if (!selectedProperties.length || !multiple) {
        return selectFilterProperties(payload, selectedProperties);
    }

    return Object.fromEntries(Object.entries(payload).map(([deviceId, itemData]) => [
        deviceId,
        selectFilterProperties(itemData && itemData.payload, selectedProperties)
    ]));
}

module.exports = function(RED) {
    class ServerNode {
        constructor(n) {
            RED.nodes.createNode(this, n);
            var node = this;
            node.config = n;
            node.connection = false;
            node.items = undefined;
            node.groups = undefined;
            node.devices = undefined;
            node.devices_values = {};
            node.pendingMQTTMessages = new Map();
            node.avaialability = {};
            node.initialStateRequests = new Set();
            node.initialStateRequestTimer = null;
            node.bridge_info = null;
            node.bridge_state = null;
            node.map = null;
            node.on('close', () => this.onClose());
            node.setMaxListeners(0);

            //mqtt
            node.mqtt = node.connectMQTT();
            node.mqtt.on('connect', () => this.onMQTTConnect());
            node.mqtt.on('message', (topic, message, packet) => this.onMQTTMessage(topic, message, packet));

            node.mqtt.on('close', () => this.onMQTTClose());
            node.mqtt.on('end', () => this.onMQTTEnd());
            node.mqtt.on('reconnect', () => this.onMQTTReconnect());
            node.mqtt.on('offline', () => this.onMQTTOffline());
            node.mqtt.on('disconnect', (error) => this.onMQTTDisconnect(error));
            node.mqtt.on('error', (error) => this.onMQTTError(error));

            // console.log(node.config._users);
        }

        connectMQTT(clientId = null) {
            var node = this;
            var options = {
                port: node.config.mqtt_port || 1883,
                username: node.config.mqtt_username || null,
                password: node.config.mqtt_password || null,
                clientId: 'NodeRed-' + node.id + '-' + (clientId ? clientId : (Math.random() + 1).toString(36).substring(7)),
            };

            let baseUrl = 'mqtt://';

            var tlsNode = RED.nodes.getNode(node.config.tls);
            if (node.config.usetls && tlsNode) {
                tlsNode.addTLSOptions(options);
                baseUrl = 'mqtts://';
            }

            return mqtt.connect(baseUrl + node.config.host, options);
        }

        subscribeMQTT() {
            var node = this;
            node.mqtt.subscribe(node.getTopic('/#'), {'qos':parseInt(node.config.mqtt_qos||0)}, function(err) {
                if (err) {
                    node.warn('MQTT Error: Subscribe to "' + node.getTopic('/#'));
                    node.emit('onConnectError', err);
                } else {
                    node.log('MQTT Subscribed to: "' + node.getTopic('/#'));
                }
            });
        }

        unsubscribeMQTT() {
            var node = this;
            node.log('MQTT Unsubscribe from mqtt topic: ' + node.getTopic('/#'));
            node.mqtt.unsubscribe(node.getTopic('/#'), function(err) {});
            node.devices_values = {};
        }

        getDevices(callback, withGroups = false, refresh = false) {
            if (typeof (callback) !== 'function') {
                return
            }
            let node = this;
            if (refresh) {
                const topics = [node.getTopic('/bridge/devices')];
                if (withGroups) {
                    topics.push(node.getTopic('/bridge/groups'));
                }

                let timeout = null;
                let completed = false;
                const receivedTopics = new Set();
                const finish = (success) => {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timeout);
                    node.removeListener('onMQTTMessageBridge', onBridgeMessage);
                    node.mqtt.unsubscribe(topics);
                    if (success) {
                        callback(withGroups ? [node.devices, node.groups] : node.devices);
                    } else {
                        node.error('Error: getDevices timeout');
                        callback(null);
                    }
                };
                const onBridgeMessage = (data) => {
                    if (topics.includes(data.topic)) {
                        receivedTopics.add(data.topic);
                    }
                    if (receivedTopics.size === topics.length) {
                        finish(true);
                    }
                };

                node.on('onMQTTMessageBridge', onBridgeMessage);
                timeout = setTimeout(() => finish(false), 60_000);
                node.mqtt.subscribe(topics, { 'qos': parseInt(node.config.mqtt_qos || 0) }, (err) => {
                    if (err) {
                        node.warn('MQTT Error: Subscribe to "' + topics.join(', ') + '"');
                        finish(false);
                    }
                });
                return;
            }

            if (node.devices && (!withGroups || node.groups)) {
                node.log('Using cached devices')
                callback(withGroups ? [node.devices, node.groups] : node.devices);
            } else {
                node.log('Waiting for device list')
                let timeout = null
                let checkAvailability = null
                new Promise(function(resolve) {
                    timeout = setTimeout(function() {
                        resolve()
                    }, 60_000);
                    checkAvailability = function() {
                        if (node.devices && (!withGroups || node.groups)) {
                            resolve()
                        }
                    }
                    node.on('onMQTTMessageBridge', checkAvailability)
                }).then(function() {
                    clearTimeout(timeout)
                    node.removeListener('onMQTTMessageBridge', checkAvailability);
                    if (node.devices && (!withGroups || node.groups)) {
                        callback(withGroups ? [node.devices, node.groups] : node.devices);
                    } else {
                        node.error('Error: getDevices timeout')
                        callback(null)
                    }
                })
            }
        }


        _getItemByKey(key, varName) {
            var node = this;
            var result = null;
            for (var i in node[varName]) {
                if (key === node.getTopic('/' + node[varName][i]['friendly_name'])
                    || key === node.getTopic('/' + node[varName][i]['ieee_address'])
                    || key === node[varName][i]['friendly_name']
                    || key === node[varName][i]['ieee_address']
                    || ('id' in node[varName][i] && parseInt(key) === parseInt(node[varName][i]['id']))
                    || key === Zigbee2mqttHelper.generateSelector(node.getTopic('/' + node[varName][i]['friendly_name']))
                ) {
                    result = node[varName][i];
                    result['current_values'] = null;
                    result['homekit'] = null;
                    result['format'] = null;

                    let topic = node.getTopic('/' + (node[varName][i]['friendly_name'] ? node[varName][i]['friendly_name'] : node[varName][i]['ieee_address']));
                    if (topic in node.devices_values) {
                        result['current_values'] = node.devices_values[topic];
                        result['homekit'] = Zigbee2mqttHelper.payload2homekit(node.devices_values[topic]);
                        result['format'] = Zigbee2mqttHelper.formatPayload(node.devices_values[topic], node[varName][i]);
                    }
                    break;
                }
            }
            return result;
        }

        getDeviceOrGroupByKey(key) {
            let device = this.getDeviceByKey(key);
            if (device) {
                return device;
            }
            let group = this.getGroupByKey(key);
            if (group) {
                return group;
            }

            return null;
        }

        getDeviceByKey(key) {
            return this._getItemByKey(key, 'devices');
        }

        requestMissingDeviceStates(node, opts, devices) {
            if (node._deviceStateRequestClosed) return;
            if (node._deviceStateRequestClosed === undefined) {
                node._deviceStateRequestClosed = false;
                node.once('close', () => {
                    node._deviceStateRequestClosed = true;
                });
            }

            Promise.all(devices.map((device) => this.requestDeviceState(node, device)))
                .then((received) => {
                    if (node._deviceStateRequestClosed) return;
                    if (received.every(Boolean)) {
                        this.nodeSend(node, opts);
                    } else {
                        node.warn('Zigbee2MQTT did not return a readable device state; no output was sent.');
                    }
                });
        }

        requestDeviceState(node, device) {
            const deviceName = device.friendly_name || device.ieee_address;
            const topic = this.getTopic('/' + deviceName);
            const getPayload = getDeviceGetPayload(device);
            if (!getPayload) return Promise.resolve(false);

            if (!node.pendingDeviceStateRequests) {
                node.pendingDeviceStateRequests = new Map();
            }
            if (node.pendingDeviceStateRequests.has(topic)) {
                return node.pendingDeviceStateRequests.get(topic);
            }

            let resolveRequest;
            const request = new Promise((resolve) => {
                resolveRequest = resolve;
            });
            node.pendingDeviceStateRequests.set(topic, request);

            let timer;
            let settled = false;
            const finish = (received) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.removeListener('onMQTTMessage', onMessage);
                node.removeListener('close', onClose);
                if (node.pendingDeviceStateRequests.get(topic) === request) {
                    node.pendingDeviceStateRequests.delete(topic);
                }
                resolveRequest(received);
            };
            const onMessage = (data) => {
                // Ignore broker replay; this request waits for a fresh response to /get.
                if (data.topic === topic && !data.retained
                    && hasRequestedState(node, this.getDeviceByKey(deviceName))) {
                    finish(true);
                }
            };
            const onClose = () => finish(false);

            this.on('onMQTTMessage', onMessage);
            node.on('close', onClose);
            timer = setTimeout(() => finish(false), DEVICE_STATE_REQUEST_TIMEOUT_MS);
            if (typeof timer.unref === 'function') timer.unref();

            try {
                this.mqtt.publish(
                    topic + '/get',
                    JSON.stringify(getPayload),
                    { qos: parseInt(this.config.mqtt_qos || 0) },
                    (error) => {
                        if (error) finish(false);
                    }
                );
            } catch (error) {
                finish(false);
            }

            return request;
        }

        getGroupByKey(key) {
            return this._getItemByKey(key, 'groups');
        }

        getDeviceAvailabilityColor(topic) {
            let color = 'blue';
            if (topic in this.avaialability) {
                color = this.avaialability[topic]?'green':'red';
            }
            return color;
        }

        getBaseTopic() {
            return this.config.base_topic;
        }

        getTopic(path) {
            return this.getBaseTopic() + path;
        }

        getDeviceStateTopic(device) {
            const name = device && (device.friendly_name || device.ieee_address);
            return name ? this.getTopic('/' + name) : null;
        }

        queueInitialStateRequests() {
            const node = this;
            if (node.initialStateRequestTimer !== null) return;

            node.initialStateRequestTimer = setTimeout(() => {
                node.initialStateRequestTimer = null;
                if (!Array.isArray(node.devices)) return;

                for (const device of node.devices) {
                    if (!device || device.disabled === true) continue;
                    const topic = node.getDeviceStateTopic(device);
                    if (!topic
                        || Object.prototype.hasOwnProperty.call(node.devices_values, topic)
                        || node.avaialability[topic] === false
                        || node.initialStateRequests.has(topic)) {
                        continue;
                    }

                    const getPayload = getDeviceGetPayload(device);
                    if (!getPayload) continue;

                    // A failed request should not be repeated every time the device list is republished.
                    node.initialStateRequests.add(topic);
                    node.mqtt.publish(topic + '/get', JSON.stringify(getPayload));
                }
            }, INITIAL_STATE_REQUEST_DELAY_MS);
        }

        queuePendingMQTTMessage(message) {
            const node = this;
            node.pendingMQTTMessages.delete(message.topic);
            if (node.pendingMQTTMessages.size >= MAX_PENDING_MQTT_MESSAGES) {
                const oldestTopic = node.pendingMQTTMessages.keys().next().value;
                node.pendingMQTTMessages.delete(oldestTopic);
            }
            node.pendingMQTTMessages.set(message.topic, message);
        }

        replayPendingMQTTMessages() {
            const node = this;
            for (const [topic, message] of node.pendingMQTTMessages) {
                const item = node.getDeviceOrGroupByKey(topic);
                if (item) {
                    node.pendingMQTTMessages.delete(topic);
                    node.emit('onMQTTMessage', { ...message, item });
                } else if (node.devices !== undefined && node.groups !== undefined) {
                    node.pendingMQTTMessages.delete(topic);
                }
            }
        }

        restart() {
            let node = this;
            node.mqtt.publish(node.getTopic('/bridge/request/restart'));
            node.log('Restarting zigbee2mqtt...');
        }

        setLogLevel(val) {
            let node = this;
            if (['info', 'debug', 'warning', 'error'].indexOf(val) < 0) val = 'info';
            let payload = {
                'options': {
                    'advanced': {
                        'log_level': val,
                    },
                },
            };
            node.mqtt.publish(node.getTopic('/bridge/request/options'), JSON.stringify(payload));
            node.log('Log Level was set to: ' + val);
        }

        setPermitJoin(val) {
            let node = this;
            let payload = {
                'time': val ? 180 : 0,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/permit_join'), JSON.stringify(payload));
            node.log('Permit Join was set to: ' + val);
        }

        renameDevice(ieee_address, newName) {
            let node = this;

            let device = node.getDeviceByKey(ieee_address);
            if (!device) {
                return {'error': true, 'description': 'no such device'};
            }

            if (!newName.length) {
                return {'error': true, 'description': 'can not be empty'};
            }

            let payload = {
                'from': device.friendly_name, 'to': newName,
            };

            node.mqtt.publish(node.getTopic('/bridge/request/device/rename'), JSON.stringify(payload));
            node.log('Rename device ' + ieee_address + ' to ' + newName);

            return {'success': true, 'description': 'command sent'};
        }

        removeDevice(ieee_address) {
            let node = this;

            let device = node.getDeviceByKey(ieee_address);
            if (!device) {
                return {'error': true, 'description': 'no such device'};
            }
            let payload = {
                'id': ieee_address,
                'force': true
            };

            node.mqtt.publish(node.getTopic('/bridge/device/remove'), JSON.stringify(payload));
            node.log('Remove device: ' + device.friendly_name);

            return {'success': true, 'description': 'command sent'};
        }

        setDeviceOptions(ieee_address, options) {
            let node = this;
            let device = node.getDeviceByKey(ieee_address);
            if (!device) {
                return {'error': true, 'description': 'no such device'};
            }

            let payload = {
                'id': ieee_address,
                'options': options
            };

            node.mqtt.publish(node.getTopic('/bridge/request/device/options'), JSON.stringify(payload));
            node.log('Set device options for "'+device.friendly_name+'" : '+JSON.stringify(payload));

            return {"success":true,"description":"command sent"};
        }

        renameGroup(id, newName) {
            let node = this;

            let group = node.getGroupByKey(id);
            if (!group) {
                return {'error': true, 'description': 'no such group'};
            }

            if (!newName.length) {
                return {'error': true, 'description': 'can not be empty'};
            }

            let payload = {
                'from': group.friendly_name, 'to': newName,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/rename'), JSON.stringify(payload));
            node.log('Rename group ' + id + ' to ' + newName);

            return {'success': true, 'description': 'command sent'};
        }

        removeGroup(id) {
            let node = this;

            let group = node.getGroupByKey(id);
            if (!group) {
                return {'error': true, 'description': 'no such group'};
            }

            let payload = {
                'id': id,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/remove'), JSON.stringify(payload));
            node.log('Remove group: ' + group.friendly_name);

            return {'success': true, 'description': 'command sent'};
        }

        addGroup(name) {
            let node = this;
            const friendlyName = typeof name === 'string' ? name.trim() : '';
            if (!friendlyName) {
                return {'error': true, 'description': 'can not be empty'};
            }

            let payload = {
                'friendly_name': friendlyName,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/add'), JSON.stringify(payload));
            node.log('Add group: ' + friendlyName);

            return {'success': true, 'description': 'command sent'};
        }

        removeDeviceFromGroup(deviceId, groupId) {
            let node = this;

            let device = node.getDeviceByKey(deviceId);
            if (!device) {
                device = {'friendly_name': deviceId};
            }

            let group = node.getGroupByKey(groupId);
            if (!group) {
                return {'error': true, 'description': 'no such group'};
            }
            let payload = {
                'group': groupId, 'device': deviceId,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/members/remove'), JSON.stringify(payload));
            node.log('Removing device: ' + device.friendly_name + ' from group: ' + group.friendly_name);

            return {'success': true, 'description': 'command sent'};
        }

        addDeviceToGroup(deviceId, groupId) {
            let node = this;

            let device = node.getDeviceByKey(deviceId);
            if (!device) {
                return {'error': true, 'description': 'no such device'};
            }

            let group = node.getGroupByKey(groupId);
            if (!group) {
                return {'error': true, 'description': 'no such group'};
            }
            let payload = {
                'group': groupId,
                'device': deviceId,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/members/add'), JSON.stringify(payload));
            node.log('Adding device: ' + device.friendly_name + ' to group: ' + group.friendly_name);

            return {'success': true, 'description': 'command sent'};
        }

        refreshMap(wait = false, engine = null) {
            var node = this;

            return new Promise(function(resolve, reject) {
                if (wait) {
                    var timeout = null;
                    var timeout_ms = 60000 * 5;

                    var client = node.connectMQTT('tmp');
                    client.on('connect', function() {

                        //end function after timeout, if now response
                        timeout = setTimeout(function() {
                            client.end(true);
                        }, timeout_ms);
                        client.subscribe(node.getTopic('/bridge/response/networkmap'), function(err) {
                            if (!err) {
                                client.publish(node.getTopic('/bridge/request/networkmap'), JSON.stringify({'type': 'graphviz', 'routes': false}));

                                node.log('Refreshing map and waiting...');
                            } else {
                                RED.log.error('zigbee2mqtt: error code #0023: ' + err);
                                client.end(true);
                                reject({'success': false, 'description': 'zigbee2mqtt: error code #0023'});
                            }
                        });
                    });

                    client.on('error', function(error) {
                        RED.log.error('zigbee2mqtt: error code #0024: ' + error);
                        client.end(true);
                        reject({'success': false, 'description': 'zigbee2mqtt: error code #0024'});
                    });

                    client.on('end', function(error, s) {
                        clearTimeout(timeout);
                    });

                    client.on('message', function(topic, message) {
                        if (node.getTopic('/bridge/response/networkmap') === topic) {

                            var messageString = message.toString();
                            node.graphviz(JSON.parse(messageString).data.value, engine).then(function(data) {
                                resolve({'success': true, 'svg': node.map});
                            }).catch(error => {
                                reject({'success': false, 'description': 'graphviz failed'});
                            });
                            client.end(true);
                        }
                    });
                } else {
                    node.mqtt.publish(node.getTopic('/bridge/request/networkmap'), JSON.stringify({'type': 'graphviz', 'routes': false}));
                    node.log('Refreshing map...');

                    resolve({'success': true, 'svg': node.map});
                }
            });
        }

        async graphviz(payload, engine = null) {
            var node = this;
            var options = {
                format: 'svg', engine: engine ? engine : 'circo',
            };
            var viz = await getVizInstance();
            return node.map = await viz.renderString(payload, options);
        }

        nodeSend(node, opts) {
            if (node.config.enableMultiple) {
                this.nodeSendMultiple(node, opts)
            } else {
                this.nodeSendSingle(node, opts)
            }
        }

        nodeSendSingle(node, opts) {
            clearTimeout(node.cleanTimer);

            opts = Object.assign({
                'node_send':true,
                'key':node.config.device_id,
                'msg': {},
                'filter': false, //skip the same payload, send only changes
                'filterProperties': node.config.filterProperties || '',
                'retained': false //replayed from the broker's retained store, not a live event
            }, opts);

            let msg = opts.msg;
            let payload = null;
            let payload_all = null;
            let text = RED._("node-red-contrib-zigbee2mqtt/server:status.received");
            let item = this.getDeviceOrGroupByKey(opts.key);

            if (item) {
                payload_all = item.current_values;
                if (payload_all == null && opts.node_send) {
                    node.warn('You need to turn on the "retain" option for the device in Zigbee2MQTT to be able to read it before a state change.')
                }
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/server:status.no_device"
                });
                return;
            }

            let useProperty = null;
            if (node.config.state && node.config.state !== '0') {
                if (item.homekit && node.config.state.split("homekit_").join('') in item.homekit) {
                    payload = item.homekit[node.config.state.split("homekit_").join('')];
                    useProperty = node.config.state.split("homekit_").join('');
                } else if (payload_all && node.config.state in payload_all) {
                    payload = text = payload_all[node.config.state];
                    useProperty = node.config.state;
                } else {
                    //state was not found in payload (button case)
                    //payload: { last_seen: '2022-07-27T15:25:22+03:00', linkquality: 36 }
                    //payload: { action: 'single', last_seen: '2022-07-27T15:25:22+03:00', linkquality: 36 }
                    return;
                }
            } else {
                payload = payload_all;
            }

            const comparisonValue = getComparisonValue(payload, opts.filterProperties);

            //add unit
            if (useProperty) {
                try {
                    for (let ind in item.definition.exposes) {
                        if ('features' in item.definition.exposes) { //why did they add it... what a crap!?
                            for (let featureInd in item.definition.exposes.features) {
                                if (item.definition.exposes[ind]['features'][featureInd]['property'] == useProperty && 'unit' in item.definition.exposes[ind]['features'][featureInd]) {
                                    text += ' ' + item.definition.exposes[ind]['unit'];
                                }
                            }
                        } else {
                            if (item.definition.exposes[ind]['property'] == useProperty && 'unit' in item.definition.exposes[ind]) {
                                text += ' ' + item.definition.exposes[ind]['unit'];
                            }
                        }
                    }
                } catch (e) {}
            }

            if (opts.retained && opts.node_send
                && 'outputAtStartup' in node.config && !node.config.outputAtStartup) {
                // Retained message replayed by the broker on (re)connect - not a live event.
                // Seed last_value so change-filtering still works, but do not emit.
                node.last_value = payload;
                node.last_filter_value = comparisonValue;
                return;
            }

            if (opts.filter) {
                if (opts.node_send && JSON.stringify(node.last_filter_value) === JSON.stringify(comparisonValue)) {
                    // console.log('Filtered the same value');
                    return;
                }
            }

            if (item && "power_source" in item && 'Battery' === item.power_source && payload_all && "battery" in payload_all && parseInt(payload_all.battery) > 0) {
                text += ' ⚡' + payload_all.battery + '%';
            }

            msg.topic = this.getTopic('/'+item.friendly_name);
            if ("payload" in msg) {
                msg.payload_in = msg.payload;
            }
            if ('last_value' in node) {
                msg.changed = {
                    'old': node.last_value,
                    'new': payload//,
                    // 'diff': Zigbee2mqttHelper.objectsDiff(node.last_value, payload)
                };
            }
            msg.payload = payload;
            msg.payload_raw = payload_all;
            msg.homekit = item.homekit;
            msg.format = item.format;
            msg.selector = Zigbee2mqttHelper.generateSelector(msg.topic);
            msg.item = item;
            if (opts.node_send) {
                // console.log('SEND:');
                // console.log(payload);
                node.send(msg);
                node.last_value = payload;
                node.last_filter_value = comparisonValue;
            }

            let time = Zigbee2mqttHelper.statusUpdatedAt();
            let fill = this.getDeviceAvailabilityColor(msg.topic);
            let status = {
                fill: fill,
                shape: 'dot',
                text: text
            };
            node.setSuccessfulStatus(status);

            node.cleanTimer = setTimeout(() => {
                status.text += ' ' + time;
                status.shape = 'ring';
                node.setSuccessfulStatus(status);
            }, 3000);
        }

        nodeSendMultiple(node, opts) {
            let that = this;
            clearTimeout(node.cleanTimer);

            opts = Object.assign({
                'node_send':true,
                'key':node.config.device_id,
                'msg': {},
                'changed': null,
                'filter': false, //skip the same payload, send only changes
                'filterProperties': node.config.filterProperties || '',
                'retained': false //replayed from the broker's retained store, not a live event
            }, opts);

            let msg = opts.msg;
            let payload = {};
            let math = [];
            let text = RED._("node-red-contrib-zigbee2mqtt/server:status.received");

            for (let index in node.config.device_id) {
                let item = that.getDeviceOrGroupByKey(node.config.device_id[index]);
                if (item) {
                    let itemData = {};
                    itemData.item = item;
                    itemData.topic = this.getTopic('/' + item.friendly_name);
                    itemData.selector = Zigbee2mqttHelper.generateSelector(itemData.topic);
                    itemData.homekit = item.homekit;
                    itemData.payload = item.current_values;
                    itemData.format = item.format;

                    payload[node.config.device_id[index]] = itemData;
                    math.push(itemData.payload);
                }
            }

            msg.payload_in = ("payload" in msg)?msg.payload:null;
            msg.payload = payload;
            msg.math = Zigbee2mqttHelper.formatMath(math);
            if (opts.changed !== null) {
                msg.changed = opts.changed;
            }
            const comparisonValue = getComparisonValue(payload, opts.filterProperties, true);

            if (!Object.keys(msg.payload).length) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/server:status.no_device"
                });
                return;
            }

            if (opts.retained && opts.node_send
                && 'outputAtStartup' in node.config && !node.config.outputAtStartup) {
                // Retained message replayed by the broker on (re)connect - not a live event.
                // Seed last_value so change-filtering still works, but do not emit.
                node.last_value = payload;
                node.last_filter_value = comparisonValue;
                return;
            }

            if (opts.filter && opts.node_send
                && JSON.stringify(node.last_filter_value) === JSON.stringify(comparisonValue)) {
                return;
            }

            if (opts.node_send) {
                // console.log('SEND:');
                // console.log(payload);
                node.send(msg);
                node.last_value = payload;
                node.last_filter_value = comparisonValue;
            }

            let time = Zigbee2mqttHelper.statusUpdatedAt();
            let status = {
                fill: 'blue',
                shape: 'dot',
                text: text
            };
            node.setSuccessfulStatus(status);

            node.cleanTimer = setTimeout(() => {
                status.text += ' ' + time;
                status.shape = 'ring';
                node.setSuccessfulStatus(status);
            }, 3000);
        }


        onMQTTConnect() {
            var node = this;
            node.connection = true;
            node.initialStateRequests.clear();
            node.log('MQTT Connected');
            node.emit('onMQTTConnect');
            node.subscribeMQTT();

        }

        onMQTTDisconnect(error) {
            var node = this;
            // node.connection = true;
            node.log('MQTT Disconnected');
            console.log(error);

        }

        onMQTTError(error) {
            var node = this;
            // node.connection = true;
            node.log('MQTT Error');
            console.log(error);

        }

        onMQTTOffline() {
            let node = this;
            // node.connection = true;
            node.warn('MQTT Offline');
        }

        onMQTTEnd() {
            var node = this;
            // node.connection = true;
            node.log('MQTT End');
            // console.log();

        }

        onMQTTReconnect() {
            var node = this;
            // node.connection = true;
            node.log('MQTT Reconnect');
            // console.log();

        }

        onMQTTClose() {
            var node = this;
            // node.connection = true;
            node.log('MQTT Close');
            // console.log(node.connection);

        }

        onMQTTMessage(topic, message, packet) {
            var node = this;
            var messageString = message.toString();
            if (topic.startsWith('node-red-contrib-zigbee2mqtt/')) {
                node.emit('onMQTTHomeAssistantMessage', {
                    topic: topic,
                    payload: messageString,
                    retained: !!(packet && packet.retain)
                });
                return;
            }
            // console.log(topic);
            // console.log(messageString);
            //bridge
            if (topic.includes('/bridge/')) {
                if (node.getTopic('/bridge/devices') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        const previousDevices = new Map((Array.isArray(node.devices) ? node.devices : [])
                            .map((device) => [node.getDeviceStateTopic(device), device])
                            .filter(([deviceTopic]) => deviceTopic));
                        node.devices = JSON.parse(messageString);
                        node.replayPendingMQTTMessages();
                        const currentDeviceTopics = new Set();
                        for (const device of Array.isArray(node.devices) ? node.devices : []) {
                            const deviceTopic = node.getDeviceStateTopic(device);
                            if (!deviceTopic) continue;
                            currentDeviceTopics.add(deviceTopic);

                            const previousDevice = previousDevices.get(deviceTopic);
                            if (previousDevice && previousDevice.disabled === true && device.disabled !== true) {
                                node.initialStateRequests.delete(deviceTopic);
                            }
                        }
                        for (const requestedTopic of node.initialStateRequests) {
                            if (!currentDeviceTopics.has(requestedTopic)) {
                                node.initialStateRequests.delete(requestedTopic);
                            }
                        }
                        node.queueInitialStateRequests();
                    }
                } else if (node.getTopic('/bridge/groups') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        node.groups = JSON.parse(messageString);
                        node.replayPendingMQTTMessages();
                    }
                } else if (node.getTopic('/bridge/state') === topic) {
                    let availabilityStatus = false;
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        let availabilityStatusObject = JSON.parse(messageString);
                        availabilityStatus = 'state' in availabilityStatusObject && availabilityStatusObject.state === 'online';
                    } else {
                        availabilityStatus = messageString === 'online';
                    }
                    node.emit('onMQTTBridgeState', {
                        topic: topic,
                        payload: availabilityStatus,
                    });
                    if (node.bridge_state !== null || !availabilityStatus) {
                        node.warn(`Bridge ${availabilityStatus ? 'online' : 'offline'}`)
                    }
                    node.bridge_state = availabilityStatus
                } else if (node.getTopic('/bridge/info') === topic) {
                    try {
                        node.bridge_info = JSON.parse(messageString);
                    } catch (error) {
                        node.warn("Failed to parse Bridge info JSON:", error);
                        node.bridge_info = null;
                    }
                }

                node.emit('onMQTTMessageBridge', {
                    topic: topic,
                    payload: messageString,
                });

            } else {
                //ignore set topics
                if (topic.substring(topic.length - 4, topic.length) === '/set') {
                    return;
                }

                //availability
                if (topic.substring(topic.length - 13, topic.length) === '/availability') {

                    let availabilityStatus = null;
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        let availabilityStatusObject = JSON.parse(messageString);
                        availabilityStatus = 'state' in availabilityStatusObject && availabilityStatusObject.state === 'online';

                    } else {
                        availabilityStatus = messageString === 'online';
                    }

                    const deviceTopic = topic.split('/availability').join('');
                    const wasOffline = node.avaialability[deviceTopic] === false;
                    node.avaialability[deviceTopic] = availabilityStatus;

                    if (wasOffline && availabilityStatus) {
                        node.initialStateRequests.delete(deviceTopic);
                        node.queueInitialStateRequests();
                    }

                    node.emit('onMQTTAvailability', {
                        topic: topic,
                        payload: availabilityStatus,
                        item: node.getDeviceOrGroupByKey(deviceTopic)
                    });
                    return;
                }

                let payload = null;
                if (Zigbee2mqttHelper.isJson(messageString)) {
                    const parsedPayload = JSON.parse(messageString);
                    if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
                        const previousPayload = node.devices_values[topic];
                        payload = {
                            ...(previousPayload && typeof previousPayload === 'object' && !Array.isArray(previousPayload)
                                ? previousPayload
                                : {}),
                            ...parsedPayload
                        };
                    } else {
                        payload = {};
                        Object.assign(payload, parsedPayload); //clone object for payload output
                    }
                } else {
                    payload = messageString;
                }

// console.log('==========MQTT START')
// console.log(topic);
// console.log(payload_json);
// console.log('==========MQTT END')
                node.devices_values[topic] = payload;
                // node.devices_values[topic] = {
                //     'old':topic in node.devices_values?node.devices_values[topic].new:null,
                //     'new':payload,
                //     'timestamp': new Date().getTime()
                // };
                const update = {
                    topic: topic,
                    payload: payload,
                    item: node.getDeviceOrGroupByKey(topic),
                    retained: !!(packet && packet.retain)
                };
                if (!update.item && (node.devices === undefined || node.groups === undefined)) {
                    node.queuePendingMQTTMessage(update);
                } else {
                    node.emit('onMQTTMessage', update);
                }

            }
        }

        onClose() {
            var node = this;
            if (node.initialStateRequestTimer !== null) {
                clearTimeout(node.initialStateRequestTimer);
                node.initialStateRequestTimer = null;
            }
            node.initialStateRequests.clear();
            node.unsubscribeMQTT();
            node.mqtt.end();
            node.pendingMQTTMessages.clear();
            node.connection = false;
            node.emit('onClose');
            node.log('MQTT connection closed');
        }
    }

    RED.nodes.registerType('zigbee2mqtt-server', ServerNode, {});
};
