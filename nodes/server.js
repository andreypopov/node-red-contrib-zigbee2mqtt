const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');

module.exports = function (RED) {
    class ServerNode{
        constructor(n) {
            RED.nodes.createNode(this, n);

            var node = this;
            node.config = n;
            node.connection = false;
            node.topic = '/devices/#';
            node.items = undefined;
            node.devices_values = [];
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

        getChannels(callback, forceRefresh = false) {
            var node = this;

            // Sort of singleton construct
            if (forceRefresh || node.items === undefined) {
                node.log('Refreshing devices');
                var that = this;
                that.devices = [];
                that.items = [];
                that.end = false;


                var options = {
                    port: node.config.mqtt_port||1883,
                    username: node.config.mqtt_username||null,
                    password: node.config.mqtt_password||null,
                    clientId:"NodeRed-tmp-"+node.id
                };
                var client = mqtt.connect('mqtt://' + node.config.host, options);


                client.on('connect', function () {
                    client.subscribe(['/devices/+/meta/name', '/devices/+/controls/+/meta/+', '/devices/+/controls/+', '/tmp/items_list'], function (err) {
                        if (!err) {
                            client.publish('/tmp/items_list', 'end_reading_items_list')
                        } else {
                            RED.log.error("zigbee2mqtt: error code #0023: "+err);
                        }
                    })
                });

                client.on('error', function (error) {
                    RED.log.error("zigbee2mqtt: error code #0024: "+error);
                });

                client.on('message', function (topic, message) {
                    if (message.toString() == 'end_reading_items_list') {
                        //client.unsubscribe(['/devices/+/meta/name', '/devices/+/controls/+/meta/+', '/devices/+/controls/+', '/tmp/items_list'], function (err) {})
                        client.end(true);

                        if (!that.items.length) {
                            RED.log.warn("zigbee2mqtt: error code #0026: No items, check your settings");
                        } else {
                            that.items = (that.items).sort(function (a, b) {
                                var aSize = a.device_name;
                                var bSize = b.device_name;
                                var aLow = a.control_name;
                                var bLow = b.control_name;
                                if (aSize == bSize) {
                                    return (aLow < bLow) ? -1 : (aLow > bLow) ? 1 : 0;
                                } else {
                                    return (aSize < bSize) ? -1 : 1;
                                }
                            })
                        }

                        if (!that.end) {
                            that.end = true;

                            if (typeof(callback) === "function") {
                                callback(that.items);
                            }
                        }
                        return node.items;
                    } else {
                        //parse topic
                        var topicParts = topic.split('/');
                        var deviceName = topicParts[2];

                        //meta device name
                        if (topicParts[3] === 'meta' && topicParts[4] === 'name') {
                            that.devices[deviceName] = {'friendly_name': message.toString(), 'controls': []}

                            //meta controls
                        } else if (topicParts[3] === 'controls' && topicParts[5] === 'meta' && deviceName in that.devices) {
                            var controlName = topicParts[4];
                            if (typeof(that.devices[deviceName]['controls'][controlName]) == 'undefined')
                                that.devices[deviceName]['controls'][controlName] = {};

                            that.devices[deviceName]['controls'][controlName][topicParts[6]] = message.toString()

                            //devices
                        } else if (topicParts[3] === 'controls' && deviceName in that.devices) {
                            var controlName = topicParts[4];
                            that.items.push({
                                topic: topic,
                                message: message.toString(),
                                control_name: controlName,
                                device_name: deviceName,
                                device_friendly_name: typeof(that.devices[deviceName]['friendly_name']) != 'undefined' ? that.devices[deviceName]['friendly_name'] : deviceName,
                                meta: that.devices[deviceName]['controls'][controlName]
                            });
                        }
                    }
                })

                // if (!Object.keys(node.items).length) {
                    //node.emit('onConnectError');
                // }

            } else {
                node.log('Using cached devices');
                if (typeof(callback) === "function") {
                    callback(node.items);
                }
                return node.items;
            }

        }

        onMQTTConnect() {
            var node = this;
            node.connection = true;
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
            var node = this;
            // node.connection = true;
            node.log('MQTT Offline');
            // console.log();

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
            node.devices_values[topic] = messageString;
            node.emit('onMQTTMessage', {topic:topic, payload:messageString});
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

