const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');
var Viz = require('viz.js');
var {Module, render} = require('viz.js/full.render.js');

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
            node.avaialability = {};
            node.bridge_info = null;
            node.bridge_state = null;
            node.map = null;
            node.on('close', () => this.onClose());
            node.setMaxListeners(0);

            //mqtt
            node.mqtt = node.connectMQTT();
            node.mqtt.on('connect', () => this.onMQTTConnect());
            node.mqtt.on('message', (topic, message) => this.onMQTTMessage(topic, message));

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

        getDevices(callback, forceRefresh = false, withGroups = false) {
            var node = this;

            if (forceRefresh || node.devices === undefined) {
                node.log('Refreshing devices');
                node.groups = [];

                var timeout = null;
                var timeout_ms = 60000;

                var client = node.connectMQTT('tmp');
                client.on('connect', function() {

                    //end function after timeout, if now response
                    timeout = setTimeout(function() {
                        node.error('Error: getDevices timeout, close connection')
                        client.end(true);
                    }, timeout_ms);

                    client.subscribe(node.getTopic('/#'), {'qos':parseInt(node.config.mqtt_qos||0)}, function(err) {
                        if (err) {
                            node.error('Error code #0023: ' + err);
                            client.end(true);
                        }
                    });
                });

                client.on('error', function(error) {
                    node.error('Error code #0024: ' + error);
                    client.end(true);
                });

                client.on('end', function(error, s) {
                    // console.log('END');
                    clearTimeout(timeout);

                    if (typeof (callback) === 'function') {
                        callback(withGroups ? [node.devices, node.groups] : node.devices);
                    }
                    return withGroups ? [node.devices, node.groups] : node.devices;
                });

                client.on('message', function(topic, message) {
                    if (node.getTopic('/bridge/state') === topic) {

                        if (Zigbee2mqttHelper.isJson(message.toString())) {
                            let availabilityStatusObject = JSON.parse(message.toString());
                            node.bridge_state = 'state' in availabilityStatusObject && availabilityStatusObject.state === 'online';
                        } else {
                            node.bridge_state = message.toString() === 'online';
                        }

                        if (!node.bridge_state) {
                            node.warn('Bridge status: offline');
                        }

                    } else if (node.getTopic('/bridge/groups') === topic) {
                        var messageString = message.toString();
                        if (Zigbee2mqttHelper.isJson(messageString)) {
                            node.groups = JSON.parse(messageString);
                        }

                    } else if (node.getTopic('/bridge/info') === topic) {
                        node.bridge_info = JSON.parse(message.toString());

                    } else if (node.getTopic('/bridge/devices') === topic) {
                        if (Zigbee2mqttHelper.isJson(message.toString())) {
                            node.devices = JSON.parse(message.toString());

                            //todo: getDevices() with homekit, move to better place
                            for (let ind in node.devices) {
                                node.devices[ind]['current_values'] = null;
                                node.devices[ind]['homekit'] = null;
                                node.devices[ind]['format'] = null;
                                let topic = node.getTopic('/' + (node.devices[ind]['friendly_name'] ? node.devices[ind]['friendly_name'] : node.devices[ind]['ieee_address']));
                                if (topic in node.devices_values) {
                                    node.devices[ind]['current_values'] = node.devices_values[topic];
                                    node.devices[ind]['homekit'] = Zigbee2mqttHelper.payload2homekit(node.devices_values[topic]);
                                    node.devices[ind]['format'] = Zigbee2mqttHelper.formatPayload(node.devices_values[topic], node.devices[ind]);
                                } else {
                                    // node.warn('no retain option for: ' + topic)
                                    //force get data
                                    node.mqtt.publish(node.getTopic('/bridge/'+node.devices[ind]['ieee_address']+'/get'));

                                }
                            }

                        }
                        client.end(true);
                    }
                });
            } else {
                // console.log(node.devices);
                node.log('Using cached devices');
                if (typeof (callback) === 'function') {
                    callback(withGroups ? [node.devices, node.groups] : node.devices);
                }
                return withGroups ? [node.devices, node.groups] : node.devices;
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

        restart() {
            let node = this;
            node.mqtt.publish(node.getTopic('/bridge/request/restart'));
            node.log('Restarting zigbee2mqtt...');
        }

        setLogLevel(val) {
            let node = this;
            if (['info', 'debug', 'warn', 'error'].indexOf(val) < 0) val = 'info';
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
                'options': {
                    'permit_join': val,
                },
            };
            node.mqtt.publish(node.getTopic('/bridge/request/options'), JSON.stringify(payload));
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
            let payload = {
                'friendly_name': name,
            };
            node.mqtt.publish(node.getTopic('/bridge/request/group/add'), JSON.stringify(payload));
            node.log('Add group: ' + name);

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
            var viz = new Viz({Module, render});
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
                'filter': false //skip the same payload, send only changes
            }, opts);

            let msg = opts.msg;
            let payload = null;
            let payload_all = null;
            let text = RED._("node-red-contrib-zigbee2mqtt/server:status.received");
            let item = this.getDeviceOrGroupByKey(opts.key);

            if (item) {
                payload_all = item.current_values;
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

            if ('firstMsg' in node && node.firstMsg) {
                node.firstMsg = false;

                if (opts.node_send && 'outputAtStartup' in node.config && !node.config.outputAtStartup) {
                    // console.log('Skipped first value');
                    node.last_value = payload;
                    return;
                }
            }

            if (opts.filter) {
                if (opts.node_send && JSON.stringify(node.last_value) === JSON.stringify(payload)) {
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
                'filter': false //skip the same payload, send only changes
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

            if (!Object.keys(msg.payload).length) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/server:status.no_device"
                });
                return;
            }

            if ('firstMsg' in node && node.firstMsg) {
                node.firstMsg = false;

                if (opts.node_send && 'outputAtStartup' in node.config && !node.config.outputAtStartup) {
                    // console.log('Skipped first value');
                    node.last_value = payload;
                    return;
                }
            }
            //
            // if (opts.filter) {
            //     if (opts.node_send && JSON.stringify(node.last_value) === JSON.stringify(payload)) {
            //         // console.log('Filtered the same value');
            //         return;
            //     }
            // }


            // if ('last_value' in node) {
            //     msg.changed = {
            //         'old': node.last_value,
            //         'new': payload//,
            //         // 'diff': Zigbee2mqttHelper.objectsDiff(node.last_value, payload)
            //     };
            // }

            if (opts.node_send) {
                // console.log('SEND:');
                // console.log(payload);
                node.send(msg);
                node.last_value = payload;
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
            node.log('MQTT Connected');
            node.emit('onMQTTConnect');
            node.getDevices(() => {
                node.subscribeMQTT();
            });

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

        onMQTTMessage(topic, message) {
            var node = this;
            var messageString = message.toString();
            // console.log(topic);
            // console.log(messageString);
            //bridge
            if (topic.includes('/bridge/')) {
                if (node.getTopic('/bridge/devices') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        node.devices = JSON.parse(messageString);
                    }
                } else if (node.getTopic('/bridge/groups') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        node.groups = JSON.parse(messageString);
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
                    if (availabilityStatus) {
                        node.getDevices(null, true, true);
                    }
                } else if (node.getTopic('/bridge/info') === topic) {
                    node.bridge_info = JSON.parse(messageString);
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

                    node.avaialability[topic.split('/availability').join('')] = availabilityStatus;

                    node.emit('onMQTTAvailability', {
                        topic: topic,
                        payload: availabilityStatus,
                        item: node.getDeviceOrGroupByKey(topic.split('/availability').join(''))
                    });
                    return;
                }

                let payload = null;
                if (Zigbee2mqttHelper.isJson(messageString)) {
                    payload = {};
                    Object.assign(payload, JSON.parse(messageString)); //clone object for payload output
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
                node.emit('onMQTTMessage', {
                    topic: topic,
                    payload: payload,
                    item: node.getDeviceOrGroupByKey(topic)
                });

            }
        }

        onClose() {
            var node = this;
            node.unsubscribeMQTT();
            node.mqtt.end();
            node.connection = false;
            node.emit('onClose');
            node.log('MQTT connection closed');
        }
    }

    RED.nodes.registerType('zigbee2mqtt-server', ServerNode, {});
};

