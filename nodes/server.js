const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');

module.exports = function (RED) {
    class ServerNode{
        constructor(n) {
            RED.nodes.createNode(this, n);

            var node = this;
            node.config = n;
            node.connection = false;
            node.topic = node.config.base_topic+'/#';
            node.items = undefined;
            node.devices = undefined;
            node.devices_values = [];
            node.bridge_config = null;
            node.bridge_state = null;
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

        connectMQTT() {
            var node = this;
            var options = {
                port: node.config.mqtt_port||1883,
                username: node.config.mqtt_username||null,
                password: node.config.mqtt_password||null,
                clientId:"NodeRed-"+node.id
            };
            return mqtt.connect('mqtt://' + node.config.host, options);
        }

        subscribeMQTT() {
            var node = this;
            node.mqtt.subscribe(node.topic, function (err) {
                if (err) {
                    node.warn('MQTT Error: Subscribe to "' + node.topic);
                    node.emit('onConnectError', err);
                } else {
                    node.log('MQTT Subscribed to: "' + node.topic);
                }
            })
        }

        unsubscribeMQTT() {
            var node = this;
            node.log('MQTT Unsubscribe from mqtt topic: ' + node.topic);
            node.mqtt.unsubscribe(node.topic, function (err) {});
            node.devices_values = [];
        }

        getDevices(callback, forceRefresh = false) {
            var node = this;

            if (forceRefresh || node.devices === undefined) {
                node.log('Refreshing devices');
                node.devices = [];

                var timeout = null;
                var timeout_ms = 5000;

                var options = {
                    port: node.config.mqtt_port || 1883,
                    username: node.config.mqtt_username || null,
                    password: node.config.mqtt_password || null,
                    clientId: "NodeRed-tmp-" + node.id
                };
                var client = mqtt.connect('mqtt://' + node.config.host, options);

                client.on('connect', function () {

                    //end function after timeout, if now response
                    timeout = setTimeout(function(){
                        client.end(true);
                    }, timeout_ms);

                    client.subscribe(node.topic, function (err) {
                        if (!err) {
                            client.publish(node.getBaseTopic() + "/bridge/config/devices/get", new Date().getTime() + "")
                        } else {
                            RED.log.error("zigbee2mqtt: error code #0023: " + err);
                            client.end(true);
                        }
                    })
                });

                client.on('error', function (error) {
                    RED.log.error("zigbee2mqtt: error code #0024: " + error);
                    client.end(true);
                });

                client.on('end', function (error, s) {
                   // console.log('END');
                    clearTimeout(timeout);

                    if (typeof (callback) === "function") {
                        callback(node.devices);
                    }
                    // console.log("return");
                    // console.log(node.devices);
                    return node.devices;
                });

                client.on('message', function (topic, message) {
                    if (node.getBaseTopic() + "/bridge/state" == topic) {
                        node.bridge_state = message.toString();
                        if (message.toString() != "online") {
                            RED.log.error("zigbee2mqtt: bridge status: " + message.toString());
                        }
                    }
                    if (node.getBaseTopic() + "/bridge/config/devices" == topic) {
                        node.devices = JSON.parse(message.toString());
                        client.end(true);
                    }
                })
            } else {
                node.log('Using cached devices');
                if (typeof (callback) === "function") {
                    callback(node.devices);
                }
                return node.devices;
            }
        }


        getDeviceById(id) {
            var node = this;
            var result = null;
            for (var i in node.devices) {
                if (id == node.devices[i]['ieeeAddr']) {
                    result = node.devices[i];
                    result['lastPayload'] = {};

                    var topic =  node.config.base_topic+'/'+(node.devices[i]['friendly_name']?node.devices[i]['friendly_name']:node.devices[i]['ieeeAddr']);
                    // console.log(topic);
                    // console.log(node.devices_values);
                    if (topic in node.devices_values) {
                        result['lastPayload'] = node.devices_values[topic];
                    }
                    break;
                }
            }
            return result;
        }

        getDeviceByTopic(topic) {
            var node = this;
            var result = null;
            for (var i in node.devices) {
                if (topic == node.config.base_topic+'/'+node.devices[i]['friendly_name']
                || topic == node.config.base_topic+'/'+node.devices[i]['ieeeAddr']) {
                    result = node.devices[i];
                    break;
                }
            }
            return result;
        }

        getBaseTopic() {
            return this.config.base_topic;
        }

        setLogLevel(val) {
            var node = this;
            if (['info', 'debug', 'warn', 'error'].indexOf(val) < 0) val = 'info';
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/log_level", val);
            node.log('Log Level set to: '+val);
        }

        setPermitJoin(val) {
            var node = this;
            val = val?"true":"false";
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/permit_join", val);
            node.log('Permit Join set to: '+val);
        }

        renameDevice(ieeeAddr, newName) {
            var node = this;

            var device = node.getDeviceById(ieeeAddr);
            if (!device) {
                return {"error":true,"description":"no such device"};
            }

            if (!newName.length)  {
                return {"error":true,"description":"can not be empty"};
            }

            var payload = {
                "old":device.friendly_name,
                "new":newName
            };

            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/rename", JSON.stringify(payload));
            node.log('Rename device '+ieeeAddr+' to '+newName);

            return {"success":true,"description":"command sent"};
        }

        onMQTTConnect() {
            var node = this;
            node.connection = true;
            node.log('MQTT Connected');
            node.emit('onMQTTConnect');
            node.getDevices(function(){
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
            var node = this;
            // node.connection = true;
            node.log('MQTT Offline');
            console.log("MQTT OFFLINE");

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
            if (topic.search(new RegExp(node.getBaseTopic()+'\/bridge\/')) === 0) {
                if (node.getBaseTopic() + '/bridge/config/devices' == topic) {
                    node.devices = JSON.parse(messageString);
                } else if (node.getBaseTopic() + '/bridge/state' == topic) {
                    node.emit('onMQTTBridgeState', {
                        topic:topic,
                        payload:message.toString()=="online"
                    });
                } else if (node.getBaseTopic() + '/bridge/log' == topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        var payload = JSON.parse(messageString);
                        if ("type" in payload) {
                            if ("device_renamed" == payload.type) {
                                node.getDevices(null, true);
                            }
                        }
                    }
                }


                node.emit('onMQTTMessageBridge', {
                    topic:topic,
                    payload:messageString
                });
            } else {
                // console.log( {topic:topic, payload:messageString});
                var msg = Zigbee2mqttHelper.isJson(messageString)?JSON.parse(messageString):messageString;

                node.devices_values[topic] = msg;
                node.emit('onMQTTMessage', {
                    topic:topic,
                    payload:msg,
                    device:node.getDeviceByTopic(topic)
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

