const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');

module.exports = function(RED) {
    class Zigbee2mqttNodeOut {
        constructor(config) {
            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);

            if (node.server) {
                // ✅ SUBSCREVER EVENTOS DO SERVIDOR
                node.listener_onMQTTConnect = function() { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onConnectError = function() { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTBridgeState = function(data) { node.onMQTTBridgeState(data); }
                node.server.on('onMQTTBridgeState', node.listener_onMQTTBridgeState);

                node.on('close', () => node.onClose());

                // ✅ MOSTRAR STATUS INICIAL
                if (typeof(node.server.mqtt) === 'object' && node.server.connection) {
                    node.status({
                        fill: "green",
                        shape: "ring",
                        text: "ready"
                    });
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "MQTT disconnected"
                    });
                }

                node.on('input', function(message) {
                    clearTimeout(node.cleanTimer);

                    // ✅ VALIDAR CONEXÃO
                    if (!node.server || !node.server.mqtt || !node.server.connection) {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "MQTT not connected"
                        });
                        node.error("MQTT not connected - cannot publish message");
                        return;
                    }

                    let key = node.config.device_id;
                    if ((!key || key === 'msg.topic') && message.topic) {
                        key = message.topic;
                    }
                    
                    let device = node.server.getDeviceOrGroupByKey(key);
                    
                    if (device) {
                        let payload;
                        let options = {};
                        
                        // 1. PROCESSAR PAYLOAD
                        switch (node.config.payloadType) {
                            case '':
                            case null:
                            case 'nothing':
                                payload = null;
                                break;

                            case 'flow':
                            case 'global': {
                                RED.util.evaluateNodeProperty(node.config.payload, node.config.payloadType, node, message, function (error, result) {
                                    if (error) {
                                        node.error(error, message);
                                    } else {
                                        payload = result;
                                    }
                                });
                                break;
                            }
                            
                            case 'z2m_payload':
                                // Lógica para valor manual vinda do slider ou input numérico
                                if (node.config.payload === '__manual__' && node.config.manualPayloadValue) {
                                    payload = node.config.manualPayloadValue;
                                } else {
                                    payload = node.config.payload;
                                }
                                break;

                            case 'num': {
                                payload = parseFloat(node.config.payload);
                                break;
                            }

                            case 'str': {
                                payload = node.config.payload;
                                break;
                            }

                            case 'json': {
                                try {
                                        const rawPayload = node.config.payload;
                                        if (typeof rawPayload === 'object' && rawPayload !== null) {
                                            payload = rawPayload;
                                        } else if (typeof rawPayload === 'string' && rawPayload.trim() !== '') {
                                            payload = JSON.parse(rawPayload);
                                        } else {
                                             // Handle numbers/booleans gracefully if passed as config
                                            payload = rawPayload;
                                        }
                                } catch (e) {
                                    node.warn('Incorrect payload. Waiting for valid JSON: ' + e.message);
                                    node.status({
                                        fill: "red",
                                        shape: "dot",
                                        text: "invalid json"
                                    });
                                    node.cleanTimer = setTimeout(function(){
                                        node.status({}); 
                                    }, 3000);
                                    return;
                                }
                                break;
                            }

                            case 'msg':
                            default: {
                                payload = message[node.config.payload];
                                break;
                            }
                        }

                        // 2. PROCESSAR COMANDO
                        let command;
                        switch (node.config.commandType) {
                            case '':
                            case null:
                            case 'nothing':
                                payload = null;
                                break;

                            case 'msg': {
                                command = message[node.config.command];
                                break;
                            }
                            
                            case 'z2m_cmd':
                                command = node.config.command;
                                
                                // Detetar comandos state_lX
                                if (command && command.match(/^state_l\d+$/)) {
                                    if (payload === 'TOGGLE' || payload === 'toggle') {
                                        if (device.current_values && command in device.current_values) {
                                            const currentState = device.current_values[command];
                                            payload = (currentState === 'ON' || currentState === 'on') ? 'OFF' : 'ON';
                                        } else {
                                            payload = 'OFF';
                                        }
                                    }
                                } 
                                else {
                                    switch (command) {
                                        case 'color_rgb':
                                            if (typeof payload === 'string' && payload.includes(',')) {
                                                const p = payload.split(',');
                                                payload = { color: { r: parseInt(p[0]), g: parseInt(p[1]), b: parseInt(p[2]) } };
                                                command = null; // Envia payload direto
                                            } else {
                                                payload = {"color": {"rgb": payload}};
                                                command = null;
                                            }
                                            break;
                                            
                                        case 'color_xy':
                                            if (typeof payload === 'string' && payload.includes(',')) {
                                                const p = payload.split(',');
                                                payload = { color: { x: parseFloat(p[0]), y: parseFloat(p[1]) } };
                                                command = null;
                                            } else {
                                                payload = {"color": {"x": payload}};
                                                command = null;
                                            }
                                            break;

                                        case 'color_hsb':
                                            if (typeof payload === 'string' && payload.includes(',')) {
                                                const p = payload.split(',');
                                                payload = { color: { h: parseInt(p[0]), s: parseInt(p[1]), b: parseInt(p[2]) } };
                                                command = null;
                                            } else {
                                                payload = {"color": {"hsb": payload}};
                                                command = null;
                                            }
                                            break;
                                            
                                        case 'color_hex':
                                            payload = {"color": {"hex": payload}};
                                            command = null;
                                            break;
                                            
                                        case 'color_hue':
                                            payload = {"color": {"hue": parseInt(payload)}};
                                            command = null;
                                            break;
                                            
                                        case 'color_saturation':
                                            payload = {"color": {"saturation": parseInt(payload)}};
                                            command = null;
                                            break;
                                        case 'state':
                                            if (payload === 'toggle' || payload === 'TOGGLE') {
                                                if (device.current_values && 'position' in device.current_values) {
                                                    payload = device.current_values.position > 0 ? 'close' : 'open';
                                                } else if (device.current_values && 'state' in device.current_values) {
                                                    const currentState = device.current_values.state;
                                                    payload = (currentState === 'ON' || currentState === 'on') ? 'OFF' : 'ON';
                                                } else {
                                                    payload = 'ON';
                                                }
                                            }
                                            break;
                                            
                                        case 'brightness':
                                            payload = parseInt(payload);
                                            if (isNaN(payload)) {
                                                node.warn("Invalid brightness value received: " + message.payload);
                                                return;
                                            }
                                            options["state"] = payload > 0 ? "on" : "Off";
                                            break;

                                        case 'position':
                                            payload = parseInt(payload);
                                            if (isNaN(payload)) return;
                                            break;
                                        
                                        case 'scene':
                                            command = 'scene_recall';
                                            payload = parseInt(payload);
                                            break;

                                        case 'lock':
                                            command = 'state';
                                            if (payload === 'toggle' || payload === 'TOGGLE') {
                                                if (device.current_values && 'lock_state' in device.current_values && device.current_values.lock_state === 'locked') {
                                                    payload = 'unlock';
                                                } else {
                                                    payload = 'lock';
                                                }
                                            } else if (payload === 'lock' || payload == 1 || payload === true || payload === 'on') {
                                                payload = 'lock';
                                            } else if (payload === 'unlock' || payload == 0 || payload === false || payload === 'off') {
                                                payload = 'unlock';
                                            }
                                            break;

                                        case 'color':
//                                            payload = {"color": payload};
//                                            break;
                                            
                                        case 'color_rgb':
//                                            payload = {"color": {"rgb": payload}};
//                                            break;
                                            
                                        case 'color_hex':
//                                            command = "color";
//                                            payload = {"color": {"hex": payload}};
//                                            break;
                                            
                                        case 'color_hsb':
//                                            command = "color";
//                                            payload = {"color": {"hsb": payload}};
//                                            break;
                                            
                                        case 'color_hsv':
//                                            command = "color";
//                                            payload = {"color": {"hsv": payload}};
//                                            break;
                                            
                                        case 'color_hue':
//                                            command = "color";
//                                            payload = {"color": {"hue": payload}};
//                                            break;
                                            
                                        case 'color_saturation':
//                                            command = "color";
//                                            payload = {"color": {"saturation": payload}};
//                                            break;

                                        case 'color_temp':
                                        case 'brightness_move':
                                        case 'brightness_step':
                                        case 'alert':
                                        default:
                                            break;
                                    }
                                }
                                break;

                            case 'homekit':
                                payload = node.fromHomeKitFormat(message, device);
                                break;

                            case 'json':
                                break;

                            case 'str':
                            default: {
                                command = node.config.command;
                                break;
                            }
                        }

                        // 3. PROCESSAR OPÇÕES
                        let optionsToSend = {};
                        switch (node.config.optionsType) {
                            case '':
                            case null:
                            case 'nothing':
                                break;

                            case 'msg':
                                if (node.config.optionsValue in message && typeof(message[node.config.optionsValue]) == 'object') {
                                    optionsToSend = message[node.config.optionsValue];
                                } else {
                                    node.warn('Options value has invalid format');
                                }
                                break;

                            case 'json':
                                if (Zigbee2mqttHelper.isJson(node.config.optionsValue)) {
                                    optionsToSend = JSON.parse(node.config.optionsValue);
                                } else {
                                    node.warn('Options value is not valid JSON, ignore: ' + node.config.optionsValue);
                                }
                                break;

                            default:
                                optionsToSend[node.config.optionsType] = node.config.optionsValue;
                                break;
                        }

                        if (Object.keys(optionsToSend).length) {
                            node.server.setDeviceOptions(device.friendly_name, optionsToSend);
                        }

                         // 4. ENVIAR COMANDO
                        if (payload !== undefined && payload !== null) {
                            let toSend = {};
                            let statusText = '';
                            let topic = node.server.getTopic('/' + device.friendly_name + '/set');

                            try {
                                // Lógica de construção do objeto (Cores vs Simples)
                                if (command === null) {
                                    toSend = payload;
                                    statusText = JSON.stringify(payload);
                                }
                                else if (typeof(payload) === 'object') {
                                    toSend = payload;
                                    statusText = JSON.stringify(payload);
                                } 
                                else {
                                    toSend[command] = payload;
                                    statusText = String(payload);
                                }

                                const payloadStr = JSON.stringify(toSend);
                                
                                if (RED.settings.verbose) {
                                    node.log('Published to mqtt topic: ' + topic + ' : ' + payloadStr);
                                }
                                
                                node.server.mqtt.publish(
                                    topic, 
                                    payloadStr,
                                    {'qos': parseInt(node.server.config.mqtt_qos || 0)},
                                    function(err) {
                                        if (err) {
                                            node.status({fill: "red", shape: "dot", text: "publish failed"});
                                            node.error("MQTT publish error: " + err.message);
                                        }
                                    }
                                );

                                // Atualizar Status Visual
                                let fill = node.server.getDeviceAvailabilityColor(node.server.getTopic('/' + device.friendly_name));
                                node.status({ fill: fill, shape: "dot", text: statusText });
                                
                                node.cleanTimer = setTimeout(function(){
                                    node.status({ fill: fill, shape: "ring", text: statusText });
                                }, 3000);

                            } catch (e) {
                                node.error("Serialization error: " + e.message, message);
                                node.status({fill: "red", shape: "dot", text: "error"});
                            }
                        } else {
                            // Else do payload válido
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "no payload"
                            });
                        }
                    
                    } else { 
                        // ✅ FECHEI O IF (DEVICE) AQUI
                        // Else do device encontrado
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "device not found"
                        });
                        node.error(`Device not found for key: ${key}`);
                    }
                });
 
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "no server"
                });
            }
        }
 
           
        updateStatus() {
            let node = this;
            if (!node.server || !node.server.mqtt || !node.server.connection) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "MQTT disconnected"
                });
            } else {
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "ready"
                });
            }
        }

        onMQTTConnect() {
            let node = this;
            node.status({
                fill: "green",
                shape: "ring",
                text: "MQTT connected"
            });
            clearTimeout(node.cleanTimer);
            node.cleanTimer = setTimeout(function() {
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "ready"
                });
            }, 3000);
        }

        onConnectError() {
            let node = this;
            node.status({
                fill: "red",
                shape: "dot",
                text: "MQTT disconnected"
            });
        }

        onMQTTBridgeState(data) {
            let node = this;
            if (data.payload) {
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "ready"
                });
            } else {
                node.onConnectError();
            }
        }

        onClose() {
            let node = this;
            if (node.server) {
                if (node.listener_onMQTTConnect) {
                    node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
                }
                if (node.listener_onConnectError) {
                    node.server.removeListener('onConnectError', node.listener_onConnectError);
                }
                if (node.listener_onMQTTBridgeState) {
                    node.server.removeListener('onMQTTBridgeState', node.listener_onMQTTBridgeState);
                }
            }
        }

        fromHomeKitFormat(message, device) {
            // Validação defensiva
            if (!message || !message.payload) 
                return null;
            
            if ("hap" in message && message.hap.context === undefined) {
                return null;
            }

            let payload = message['payload'];
            let msg = {};

            if (payload.On !== undefined) {
                msg['state'] = payload.On ? "on" : "off";
            }
            if (payload.Brightness !== undefined) {
                msg['brightness'] = Zigbee2mqttHelper.convertRange(payload.Brightness, [0, 100], [0, 255]);
                if ("current_values" in device) {
                    device.current_values.brightness = msg['brightness'];
                }
                if (payload.Brightness >= 254) payload.Brightness = 255;
                msg['state'] = payload.Brightness > 0 ? "on" : "off"
            }
            if (payload.Hue !== undefined) {
                msg['color'] = {"hue": payload.Hue};
                if ("current_values" in device) {
                    if ("brightness" in device.current_values) msg['brightness'] = device.current_values.brightness;
                    if ("color" in device.current_values && "saturation" in device.current_values.color) msg['color']['saturation'] = device.current_values.color.saturation;
                    if ("color" in device.current_values && "hue" in device.current_values.color) device.current_values.color.hue = payload.Hue;
                }
                msg['state'] = "on";
            }
            if (payload.Saturation !== undefined) {
                msg['color'] = {"saturation": payload.Saturation};
                if ("current_values" in device) {
                    if ("brightness" in device.current_values) msg['brightness'] = device.current_values.brightness;
                    if ("color" in device.current_values && "hue" in device.current_values.color) msg['color']['hue'] = device.current_values.color.hue;
                    if ("color" in device.current_values && "saturation" in device.current_values.color) device.current_values.color.saturation = payload.Saturation;
                }
                msg['state'] = "on";
            }
            if (payload.ColorTemperature !== undefined) {
                msg['color_temp'] = Zigbee2mqttHelper.convertRange(payload.ColorTemperature, [150, 500], [150, 500]);
                if ("current_values" in device) {
                    if ("color_temp" in device.current_values) device.current_values.color_temp = msg['color_temp'];
                }
                msg['state'] = "on";
            }
            if (payload.LockTargetState !== undefined) {
                msg['state'] = payload.LockTargetState ? "LOCK" : "UNLOCK";
            }
            if (payload.TargetPosition !== undefined) {
                msg['position'] = payload.TargetPosition;
            }

            return msg;
        }
    }

    RED.nodes.registerType('zigbee2mqtt-out', Zigbee2mqttNodeOut);
};
