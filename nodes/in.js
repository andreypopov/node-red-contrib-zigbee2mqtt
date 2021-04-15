const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');
var TimeAgo = require('javascript-time-ago');
var TimeAgoEn = require('javascript-time-ago/locale/en');
TimeAgo.addLocale(TimeAgoEn);




module.exports = function(RED) {
    class Zigbee2mqttNodeIn {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.firstMsg = true;
            node.is_subscribed = false;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);

            node.status({}); //clean

            if (node.server) {
                node.listener_onMQTTConnect = function(data) { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

                node.listener_onMQTTBridgeState = function(data) { node.onMQTTBridgeState(data); }
                node.server.on('onMQTTBridgeState', node.listener_onMQTTBridgeState);

                node.on('close', () => this.onMQTTClose());

                if (typeof(node.server.mqtt) === 'object') {
                    node.onMQTTConnect();
                }

                node.refreshStatusTimer = setInterval(function () {
                    node.updateTextStatus('ring');
                }, 60000);
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zigbee2mqtt/in:status.no_server"
                });
            }
        }

        onConnectError(status = null) {
            var node = this;
            node.status({
                fill: "red",
                shape: "dot",
                text: "node-red-contrib-zigbee2mqtt/in:status.no_connection"
            });
        }

        onMQTTClose() {
            var node = this;

            clearInterval(node.refreshStatusTimer);

            //remove listeners
            if (node.listener_onMQTTConnect) {
                node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
            }
            if (node.listener_onConnectError) {
                node.server.removeListener('onConnectError', node.listener_onConnectError);
            }
            if (node.listener_onMQTTMessage) {
                node.server.removeListener("onMQTTMessage", node.listener_onMQTTMessage);
            }
            if (node.listener_onMQTTBridgeState) {
                node.server.removeListener("onMQTTBridgeState", node.listener_onMQTTBridgeState);
            }

            node.onConnectError();
        }

        onMQTTConnect() {
            var node = this;

            // node.status({
            //     fill: "green",
            //     shape: "dot",
            //     text: "node-red-contrib-zigbee2mqtt/in:status.connected"
            // });
            // node.cleanTimer = setTimeout(function () {
            //     node.status({}); //clean
            // }, 3000);
        }

        onMQTTMessage(data) {
            var node = this;


            if ( (data.device && "ieeeAddr" in data.device && data.device.ieeeAddr == node.config.device_id)
            || (data.group && "ID" in data.group && data.group.ID == node.config.device_id) ) {
                //ignore /set
                if (data.topic.search(new RegExp(node.server.getBaseTopic()+'\/'+node.config.friendly_name+'\/set')) === 0) {
                    return;
                }

                clearTimeout(node.cleanTimer);
                if (node.firstMsg && !node.config.outputAtStartup) {
                    node.firstMsg = false;
                    return;
                }


                if (data.device) {
                    var homekit_payload = Zigbee2mqttHelper.payload2homekit(data.payload, data.device);
                    var format_payload = Zigbee2mqttHelper.formatPayload(data.payload, data.device);
                } else if (data.group) {
                    var homekit_payload = Zigbee2mqttHelper.payload2homekit(data.payload, data.group);
                    var format_payload = Zigbee2mqttHelper.formatPayload(data.payload, data.group);
                } else {
                    var homekit_payload = null;
                    var format_payload = null;
                }


                var payload = data.payload;
                if (parseInt(node.config.state) != 0) {
                    if (node.config.state in data.payload) {
                        payload = data.payload[node.config.state];
                    } else if (homekit_payload && node.config.state.split("homekit_").join('') in homekit_payload) {
                        payload = homekit_payload[node.config.state.split("homekit_").join('')];
                    }
                }

                node.send({
                    payload: payload,
                    payload_raw: data.payload,
                    device: data.device,
                    group: data.group,
                    homekit: homekit_payload,
                    format: format_payload
                });

                node.updateTextStatus('dot');

                node.cleanTimer = setTimeout(function () {
                    node.updateTextStatus('ring');
                }, 3000);
            }
        }

        updateTextStatus(shape = 'dot') {
            var node = this;

            var payload = null;
            var text = RED._("node-red-contrib-zigbee2mqtt/in:status.received");
            var fill = 'green';
            var timeSign = '';

            var device = node.server.getDeviceById(node.config.device_id);
            var group = node.server.getGroupById(node.config.device_id);
            if (device && "lastPayload" in device) {
                payload = device.lastPayload;
            }

            if (payload) {
                if (parseInt(node.config.state) != 0) {
                    if (payload && node.config.state in payload) {
                        text = payload[node.config.state];
                    }
                }

                var lastSeen = 0;
                if ("last_seen" in payload) {
                    lastSeen = new Date(payload.last_seen).getTime();
                }
                if ("lastSeen" in payload && parseInt(payload.lastSeen) > 0) {
                    lastSeen = new Date(payload.lastSeen).getTime();
                }
                if (!Number.isNaN(lastSeen) && lastSeen > 0) {
                    if (Date.now() - lastSeen > 60 * 60 * 24 * 1000) {
                        timeSign = '❗';
                        fill = 'red';
                    } else {
                        timeSign = '🕑';
                    }
                    var ago = new TimeAgo('en-EN').format(lastSeen, 'twitter');
                    if (ago) {
                        text += ' ' + timeSign + ago;
                    }
                }

                if (device && "powerSource" in device && 'Battery' == device.powerSource && "battery" in payload && parseInt(payload.battery) > 0) {
                    text += ' ⚡' + payload.battery + '%';
                }
            }

            if (text) {
                node.status({
                    fill: fill,
                    shape: shape,
                    text: text
                });
            }
        }

        onMQTTBridgeState(data) {
            var node = this;

            if (data.payload) {
                node.status({});
            } else {
                this.onConnectError();
            }
        }


    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



