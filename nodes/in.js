const Zigbee2mqttHelper = require('../lib/Zigbee2mqttHelper.js');

var mqtt = require('mqtt');

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

            if (data.device && "ieeeAddr" in data.device && data.device.ieeeAddr == node.config.device_id) {
                //ignore /set
                if (data.topic.search(new RegExp(node.server.getBaseTopic()+'\/'+node.config.friendly_name+'\/set')) === 0) {
                    return;
                }

                clearTimeout(node.cleanTimer);
                if (node.firstMsg && !node.config.outputAtStartup) {
                    node.firstMsg = false;
                    return;
                }

                //text
                var payload = data.payload;
                var text = RED._("node-red-contrib-zigbee2mqtt/in:status.received");
                if (parseInt(node.config.state) != 0 && node.config.state in data.payload) {
                    text = data.payload[node.config.state];
                    payload = data.payload[node.config.state];
                }
                if ('Battery' == data.device.powerSource && "battery" in data.payload && parseInt(data.payload.battery)>0) {
                    text += ' ⚡'+data.payload.battery+'%';
                }


                node.send({
                    payload: payload,
                    payload_raw: data.payload,
                    device: data.device,
                    homekit: node.formatHomeKit(data.payload, data.device),
                    format: node.formatPayload(data.payload, data.device)
                });

                node.status({
                    fill: "green",
                    shape: "dot",
                    text: text
                });

                node.cleanTimer = setTimeout(function () {
                    node.status({
                        fill: "green",
                        shape: "ring",
                        text: text
                    });
                }, 3000);
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

        formatPayload(payload, device) {
            var node = this;
            var result = {};

            //convert XY to RGB, HSV
            if ("color" in payload && "x" in payload.color) {
                var bri = "brightness" in payload?payload.brightness:255;
                var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, bri);
                var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
                result['color'] = {
                    "rgb":rgb,
                    "hsv":hsv
                };
            }
            return result;
        }

        formatHomeKit(payload, device) {
            var node = this;
            var msg = {};


            //Battery
            if ("powerSource" in device && "Battery" == device.powerSource && "battery" in payload && parseInt(payload.battery)>0) {
                msg["Battery"] = {
                    "BatteryLevel": parseInt(payload.battery),
                    "StatusLowBattery": parseInt(payload.battery) <= 15 ? 1 : 0
                };
            }


            //Lightbulb
            if ("brightness" in payload) {
                if ("state" in payload && payload.state == "OFF") {
                    msg["Lightbulb"] = { "On" : 0 };
                    msg["Lightbulb_CT"] = { "On" : 0 };
                    msg["Lightbulb_RGB"] = { "On" : 0 };
                } else {

                    var hue = null;
                    var sat = null;
                    if ("color" in payload && "x" in payload.color) {
                        var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, payload.brightness);
                        var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
                        hue = hsv.h;
                        sat = hsv.s;
                    }
                    var bri = Zigbee2mqttHelper.convertRange(parseInt(payload.brightness), [0, 255], [0, 100]);
                    var ct = "color_temp" in payload?Zigbee2mqttHelper.convertRange(parseInt(payload.color_temp), [50,400], [140,500]):null;

                    msg["Lightbulb"] = {
                        "On": 1,
                        "Brightness": bri
                    }
                    msg["Lightbulb_CT"] = {
                        "On": 1,
                        "Brightness": bri,
                        "ColorTemperature": ct
                    }
                    msg["Lightbulb_RGB"] = {
                        "On": 1,
                        "Brightness": bri,
                        "Hue": hue,
                        "Saturation": sat
                    }
                    msg["Lightbulb_RGB_CT"] = {
                        "On": 1,
                        "Brightness": bri,
                        "Hue": hue,
                        "Saturation": sat,
                        "ColorTemperature": ct
                    }
                }
            }

            //LockMechanism
            if ("state" in payload && (payload.state == "LOCK" || payload.state == "UNLOCK")) {
                msg["LockMechanism"] = {
                    "LockCurrentState":payload.state == "LOCK"?1:0,
                    "LockTargetState":payload.state == "LOCK"?1:0
                };
            }

            //TemperatureSensor
            if ('temperature' in payload) {
                msg["TemperatureSensor"] = {
                    "CurrentTemperature":parseFloat(payload.temperature)
                };
            }

            //HumiditySensor
            if ('humidity' in payload) {
                msg["HumiditySensor"] = {
                    "CurrentRelativeHumidity":parseFloat(payload.humidity)
                };
            }

            //LightSensor
            if ('illuminance_lux' in payload) {
                msg["LightSensor"] = {
                    "CurrentAmbientLightLevel":parseInt(payload.illuminance_lux)
                };
            }

            //MotionSensor, OccupancySensor
            if ('occupancy' in payload) {
                msg["MotionSensor"] = {
                    "MotionDetected":payload.occupancy
                };
                msg["OccupancySensor"] = {
                    "OccupancyDetected":payload.occupancy?1:0
                };
            }

            return msg;
        }
    }
    RED.nodes.registerType('zigbee2mqtt-in', Zigbee2mqttNodeIn);
};



