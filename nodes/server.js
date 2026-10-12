const Zigbee2mqttHelper = require('../resources/Zigbee2mqttHelper.js');
var mqtt = require('mqtt');
var Viz = require('viz.js');
var {Module, render} = require('viz.js/full.render.js');


module.exports = function(RED) {
    "use strict";
    
    const path = require('path');
    // âœ… REGISTAR O SCRIPT DEBUG GLOBALMENTE
    RED.httpAdmin.get('/zigbee2mqtt/js/debug.js', function(req, res) {
        res.sendFile(path.join(__dirname, '../resources/js/debug.js'));
    });
    
    class ServerNode {
        constructor(n) {
            RED.nodes.createNode(this, n);
            var node = this;
            node.config = n;
            node.connection = false;
            node.items = undefined;
            node.groups = undefined;
            node.devices = undefined;
            node.devices_values = new Map();
            node.availability = {};
            node.bridge_info = null;
            node.bridge_state = null;
            node.map = null;
            // ✅ Tentar recuperar cache persistente no arranque
            node.devices = node.context().global.get('z2m_devices_' + node.id) || null;
            node.groups = node.context().global.get('z2m_groups_' + node.id) || null;
            
            node.on('close', () => this.onClose());
            node.setMaxListeners(50);
            
            // Rastrear nós clientes para limpeza
            node.clientNodes = new Set();
            
            node.registerClient = (clientNode) => node.clientNodes.add(clientNode);
            node.unregisterClient = (clientNode) => node.clientNodes.delete(clientNode);
            
            //mqtt
            node.mqtt = node.connectMQTT();
            if (node.mqtt) {
                node.mqtt.on('connect', () => this.onMQTTConnect());
                node.mqtt.on('message', (topic, message) => this.onMQTTMessage(topic, message));
 
                node.mqtt.on('close', () => this.onMQTTClose());
                node.mqtt.on('end', () => this.onMQTTEnd());
                node.mqtt.on('reconnect', () => this.onMQTTReconnect());
                node.mqtt.on('offline', () => this.onMQTTOffline());
                node.mqtt.on('disconnect', (error) => this.onMQTTDisconnect(error));
                node.mqtt.on('error', (error) => this.onMQTTError(error));
            }

             //console.log(node.config._users);
        }
        
        connectMQTT(clientId = null) {
            var node = this;
            
            // 1. Recuperar Credenciais (Prioridade: Credentials > Config)
            let user = null;
            let pass = null;

            if (node.credentials) {
                user = node.credentials.mqtt_username;
                pass = node.credentials.mqtt_password;
            }
            
            //// Fallback para config antiga
            //if (!user) user = node.config.mqtt_username;
            //if (!pass) pass = node.config.mqtt_password;

            // 2. Configurar Opções de Conexão
            let port = parseInt(node.config.mqtt_port);
            if (isNaN(port) || port < 1 || port > 65535)
                port = 1883;
            
            var options = {
                port: port,
                username: user,
                password: pass,
                clientId: clientId || ('NodeRed-Z2M-' + node.id.replace('.', '')),
                clean: true,
                keepalive: 30, // Ainda mais reduzido para detecção rápida em redes instáveis
                reconnectPeriod: 5000,
                connectTimeout: 15000, // Timeout reduzido para falhar rápido e tentar reconectar
                resubscribe: true,
                will: { // Last Will & Testament para diagnóstico
                    topic: 'node-red/zigbee2mqtt/status',
                    payload: 'offline',
                    qos: 1,
                    retain: false
                }
            };

            // 3. Configurar Protocolo e TLS
            let baseUrl = 'mqtt://';
            var tlsNode = RED.nodes.getNode(node.config.tls);
            
            if (node.config.usetls && tlsNode) {
                tlsNode.addTLSOptions(options);
                baseUrl = 'mqtts://';
                // REFATORADO: Permitir certificados auto-assinados se configurado (comum em IoT local)
                if (options.rejectUnauthorized === undefined) {
                    options.rejectUnauthorized = true; // Ou ler de config
                }
            }

            // 4. Validar Host
            if (!node.config.host || typeof node.config.host !== 'string' || node.config.host.trim() === '') {
                node.error("MQTT Host not defined or invalid");
                return null;
            }

            // 5. Iniciar Conexão
             // Remover espaços acidentais que utilizadores possam colar
            const cleanHost = node.config.host.trim();
            const fullUrl = baseUrl + cleanHost;
            return mqtt.connect(fullUrl, options);
        }
/*
        connectMQTT(clientId = null) {
            var node = this;
            var options = {
                port: node.config.mqtt_port || 1883,
                username: node.config.mqtt_username || null,
                password: node.config.mqtt_password || null,
                clientId: clientId || ('NodeRed-Z2M-' + node.id.replace('.', '')),
            };

            let baseUrl = 'mqtt://';

            var tlsNode = RED.nodes.getNode(node.config.tls);
            if (node.config.usetls && tlsNode) {
                tlsNode.addTLSOptions(options);
                baseUrl = 'mqtts://';
            }

            return mqtt.connect(baseUrl + node.config.host, options);
        }
*/
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
            if (node.mqtt) {
                node.mqtt.unsubscribe(node.getTopic('/#'), function(err) {});
            }
            // Clear Map instead of assigning new object
            if (node.devices_values instanceof Map) {
                node.devices_values.clear();
            } else {
                node.devices_values = new Map();
            }
        }

        getDevices(callback, withGroups = false) {
            if (typeof (callback) !== 'function') {
                return
            }
            let node = this;

            // ✅ NOVA LÓGICA: Juntar os dados estáticos com os valores em cache
            const mergeValues = (devicesList) => {
                return devicesList.map(device => {
                    let topic = node.getTopic('/' + (device.friendly_name || device.ieee_address));
                    
                    // Check if Map has the topic
                    if (node.devices_values instanceof Map && node.devices_values.has(topic)) {
                        let d = { ...device };
                        d.current_values = node.devices_values.get(topic);
                        return d;
                    }
                    // Fallback for legacy Object structure (safety)
                    else if (!(node.devices_values instanceof Map) && node.devices_values && node.devices_values[topic]) {
                         let d = { ...device };
                         d.current_values = node.devices_values[topic];
                         return d;
                    }
                    return device;
                });
            };

            if (node.devices && (!withGroups || node.groups)) {
                node.log('Using cached devices');
                
                // ✅ APLICAR O MERGE ANTES DE ENVIAR PARA O EDITOR
                let devicesWithValues = mergeValues(node.devices);
                callback(withGroups ? [devicesWithValues, node.groups] : devicesWithValues);
            } else {
                node.log('Waiting for device list')
                let timeout = null
                let checkAvailability = null
                
                if (!node.devices) {
                     node.mqtt.publish(node.getTopic('/bridge/request/devices/get'), '');
                     node.mqtt.publish(node.getTopic('/bridge/request/groups/get'), '');
                }

                new Promise(function(resolve, reject) {
                    timeout = setTimeout(function() {
                        if (checkAvailability) node.removeListener('onMQTTMessageBridge', checkAvailability);
                        resolve(false); 
                    }, 5000); 

                    checkAvailability = function(topic) {
                        if (node.devices && (!withGroups || node.groups)) {
                             clearTimeout(timeout);
                             resolve(true);
                        }
                    }
                    node.on('onMQTTMessageBridge', checkAvailability);
                }).then(function() {
                    clearTimeout(timeout)
                    if (checkAvailability) node.removeListener('onMQTTMessageBridge', checkAvailability);
                    
                    if (node.devices && (!withGroups || node.groups)) {
                        // ✅ APLICAR O MERGE TAMBÉM AQUI
                        let devicesWithValues = mergeValues(node.devices);
                        callback(withGroups ? [devicesWithValues, node.groups] : devicesWithValues);
                    } else {
                        node.error('Error: getDevices timeout')
                        callback(withGroups ? [[], []] : []);
                    }
                })
            }
        }

        rebuildLookupMap(varName) {
            var node = this;
            if (!node[varName]) return;
            
            // Limpar entradas antigas deste tipo
            for (let key of node.lookupMap.keys()) {
                if (key.startsWith(varName + ':')) node.lookupMap.delete(key);
            }

            node[varName].forEach(item => {
                if (varName === 'devices') {
                    if (item.ieee_address) node.lookupMap.set(`devices:${item.ieee_address}`, item);
                    if (item.friendly_name) node.lookupMap.set(`devices:${item.friendly_name}`, item);
                } else if (varName === 'groups') {
                    if (item.id !== undefined) node.lookupMap.set(`groups:${item.id}`, item);
                    if (item.friendly_name) node.lookupMap.set(`groups:${item.friendly_name}`, item);
                }
            });
            node.lookupMap.set(varName + '_version', node[varName].length);
        }

        _getItemByKey(key, varName) {
            var node = this;
            if (!node[varName]) return null;

            if (!node.lookupMap) node.lookupMap = new Map();

            if (!node.lookupMap.has(varName + '_version') || node.lookupMap.get(varName + '_version') !== node[varName].length) {
                 node.rebuildLookupMap(varName);
            }

            const cacheKey = `${varName}:${key}`;
            let result = node.lookupMap.get(cacheKey);
 
            if (result) {
                // Clone para evitar mutar a referência original
                result = { ...result }; 
                result['current_values'] = null;
                result['homekit'] = null;
                result['format'] = null;

                let topic = node.getTopic('/' + (result.friendly_name ? result.friendly_name : result.ieee_address));
                
                // Verificar se temos valores em cache para este tópico (Map support)
                let values = null;
                if (node.devices_values instanceof Map) {
                    values = node.devices_values.get(topic);
                } else if (node.devices_values) {
                    values = node.devices_values[topic];
                }
 
                if (values) {
                    result['current_values'] = values;
                    result['homekit'] = Zigbee2mqttHelper.payload2homekit(values);
                    result['format'] = Zigbee2mqttHelper.formatPayload(values, result);
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
            if (topic in this.availability) {
                color = this.availability[topic]?'green':'red';
            }
            return color;
        }

        getBaseTopic() {
            // Garantir que não termina em barra para evitar //
            let topic = this.config.base_topic || 'zigbee2mqtt';
            if (topic.endsWith('/')) 
                topic = topic.slice(0, -1);
            return topic;
        }
 
        getTopic(path) {
            // Garantir que path começa com barra
            if (path && !path.startsWith('/')) 
                path = '/' + path;
            return this.getBaseTopic() + path;
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

// FIX para Issue #146
    setPermitJoin(val, customTime) {
        let node = this;
        
        // âœ… VALIDAR CONEXÃƒO MQTT
        if (!node.mqtt || !node.connection) {
            node.warn('Cannot set permit_join: MQTT not connected');
            return {'error': true, 'description': 'MQTT not connected'};
        }
        
        // âœ… DETERMINAR TEMPO
        // Aceita: setPermitJoin(true, 300) ou setPermitJoin(true) [default 180s]
        let time = 180; // Default: 3 minutos
        
        if (customTime !== undefined && customTime !== null) {
            const parsed = parseInt(customTime);
            if (!isNaN(parsed) && parsed > 0) {
                time = parsed;
            }
            else {
                node.warn('Invalid permit join time, using default'); 
            }
        }
        
        // âœ… PREPARAR PAYLOAD (novo formato Zigbee2MQTT)
        let payload;
        
        if (val === true || val === 'true' || parseInt(val) > 0) {
            // Ativar pairing mode
            payload = {
                'value': true,
                'time': time
            };
            
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            const timeStr = minutes > 0 ? 
                `${minutes}m ${seconds}s` : 
                `${seconds}s`;
            
            node.log(`Permit Join ENABLED for ${timeStr} (${time} seconds)`);
            
        } else {
            // Desativar pairing mode
            payload = {
                'value': false
            };
            node.log('Permit Join DISABLED');
        }

        // PUBLICAR NO TÓPICO CORRETO
        // Zigbee2MQTT v1.x usa 'value', versões mais recentes podem aceitar boolean direto ou payload diferente.
        // O formato {"value": true, "time": 180} é o padrão atual para /bridge/request/permit_join
        node.mqtt.publish(
            node.getTopic('/bridge/request/permit_join'),
            JSON.stringify(payload),
            { qos: parseInt(node.config.mqtt_qos || 0) },
            (err) => {
                if (err) {
                    node.error('Failed to set permit_join: ' + err.message);
                }
            }
        );
        
        return {
            'success': true, 
            'description': 'command sent', 
            'time': time
        };
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
                                RED.log.error('zigbee2mqtt: Map subscribe error: ' + err);
                                client.end(true);
                                reject({'success': false, 'description': 'Subscribe failed'});
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
                if (payload_all == null) {
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
                    text = payload;
                    useProperty = node.config.state.split("homekit_").join('');
                } else if (payload_all && node.config.state in payload_all) {
                    payload = payload_all[node.config.state];
                    text = payload;
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

            // Convert object text to string for status display (prevents [object Object])
            if (typeof text === 'object' && text !== null) {
                try {
                    text = JSON.stringify(text);
                } catch(e) { text = 'Object'; }
            }

            //add unit
            if (useProperty) {
                try {
                    if (item.definition && item.definition.exposes) {
                        for (let ind in item.definition.exposes) {
                            if ('features' in item.definition.exposes[ind]) {
                                for (let featureInd in item.definition.exposes[ind].features) {
                                    if (item.definition.exposes[ind]['features'][featureInd]['property'] == useProperty && 'unit' in item.definition.exposes[ind]['features'][featureInd]) {
                                        text += ' ' + item.definition.exposes[ind]['features'][featureInd]['unit'];
                                    }
                                }
                            } else {
                                if (item.definition.exposes[ind]['property'] == useProperty && 'unit' in item.definition.exposes[ind]) {
                                    text += ' ' + item.definition.exposes[ind]['unit'];
                                }
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
                // OTIMIZAÇÃO: Comparação rápida antes de serializar
                if (opts.node_send) {
                    // Se forem primitivos iguais, retorna já
                    if (node.last_value === payload) return;
                    
                    // Se um for null/undefined e o outro não, são diferentes
                    if (!node.last_value || !payload) { /* prossegue */ }
                    
                    // Apenas usa JSON.stringify se ambos forem objetos/arrays
                    else if (typeof node.last_value === 'object' && typeof payload === 'object') {
                        if (JSON.stringify(node.last_value) === JSON.stringify(payload)) return;
                    }
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
            node.connection = true;  // âœ… Marca como conectado
            node.log('MQTT Connected');
            node.emit('onMQTTConnect');
            node.subscribeMQTT();
        }

        onMQTTDisconnect(error) {
            var node = this;
            node.connection = false;  // âœ… CORRIGIDO: Marca como desconectado
            node.log('MQTT Disconnected');
            node.emit('onConnectError', error);  // âœ… CORRIGIDO: Notifica os nÃ³s
            if (error) {
                console.log('Disconnect error:', error);
            }
        }

        onMQTTError(error) {
            var node = this;
            node.connection = false;  // âœ… CORRIGIDO: Marca como desconectado
            node.log('MQTT Error');
            node.emit('onConnectError', error);  // âœ… CORRIGIDO: Notifica os nÃ³s
            if (error) {
                console.log('MQTT error:', error);
            }
        }

        onMQTTOffline() {
            let node = this;
            node.connection = false;  // âœ… CORRIGIDO: Marca como desconectado
            node.warn('MQTT Offline');
            node.emit('onConnectError');  // âœ… CORRIGIDO: Notifica os nÃ³s
        }

        onMQTTEnd() {
            var node = this;
            node.connection = false;  // âœ… CORRIGIDO: Marca como desconectado
            node.log('MQTT End');
        }

        onMQTTReconnect() {
            var node = this;
            // MantÃ©m connection = false atÃ© receber onMQTTConnect
            node.log('MQTT Reconnect attempt...');
        }

        onMQTTClose() {
            var node = this;
            node.connection = false;  // âœ… CORRIGIDO: Marca como desconectado
            node.log('MQTT Close');
        }

        onMQTTMessage(topic, message) {
            var node = this;
            var messageString = message.toString();
            
            //bridge
            if (topic.includes('/bridge/')) {
                if (node.getTopic('/bridge/devices') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        try {
                            const devices = JSON.parse(messageString);
                            node.devices = devices;
                            node.context().global.set('z2m_devices_' + node.id, devices);
                        } catch (e) {
                            node.warn('Failed to parse devices JSON: ' + e.message);
                        }
                    }
                } else if (node.getTopic('/bridge/groups') === topic) {
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        try {
                            const groups = JSON.parse(messageString);
                            node.groups = groups;
                            node.context().global.set('z2m_groups_' + node.id, groups);
                        } catch (e) {
                            node.warn('Failed to parse groups JSON: ' + e.message);
                        }
                    }
                    if (node.devices) {
                        for (let ind in node.devices) {
                            let dTopic = node.getTopic('/' + (node.devices[ind]['friendly_name'] ? node.devices[ind]['friendly_name'] : node.devices[ind]['ieee_address']));
                            const hasValue = (node.devices_values instanceof Map) ? node.devices_values.has(dTopic) : (dTopic in node.devices_values);
                            if (!hasValue && node.devices[ind].definition) {
                                let getPayload = {};
                                let isEmpty = true;
                                for (let exp of node.devices[ind].definition.exposes) {
                                    if (exp.access && (exp.access & 0b100)) {
                                        getPayload[exp.name] = "";
                                        isEmpty = false;
                                    }
                                }
                                if (!isEmpty) node.mqtt.publish(dTopic + '/get', JSON.stringify(getPayload));
                            }
                        }
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
                    
                    node.bridge_state = availabilityStatus ? 'online' : 'offline';
                    
                    node.emit('onMQTTBridgeState', {
                        topic: topic,
                        payload: availabilityStatus,
                    });
                    if (node.bridge_state !== null || !availabilityStatus) {
                        if (!availabilityStatus) {
                            node.warn(`Bridge offline`)
                        }
                        // ✅ Log silencioso quando fica online (apenas em debug)
                        else if (typeof Z2MDebug !== 'undefined' && Z2MDebug.isEnabled()) {
                            node.log(`Bridge online`)
                        }
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
                // REFATORADO: Verificação mais robusta de sufixos
                if (topic.endsWith('/set') || topic.endsWith('/get')) {
                    return;
                }

                //availability
                if (topic.endsWith('/availability')) {

                    let availabilityStatus = null;
                    if (Zigbee2mqttHelper.isJson(messageString)) {
                        let availabilityStatusObject = JSON.parse(messageString);
                        availabilityStatus = 'state' in availabilityStatusObject && availabilityStatusObject.state === 'online';

                    } else {
                        availabilityStatus = messageString === 'online';
                    }

                    node.availability[topic.split('/availability').join('')] = availabilityStatus;

                    node.emit('onMQTTAvailability', {
                        topic: topic,
                        payload: availabilityStatus,
                        item: node.getDeviceOrGroupByKey(topic.split('/availability').join(''))
                    });
                    return;
                }

                let payload = null;
                try {
                    const parsed = JSON.parse(messageString);
                    
                    // Verifica se o resultado é um objeto válido e não null
                    if (parsed && typeof parsed === 'object') {
                        payload = {};
                        Object.assign(payload, parsed); // Mantém o comportamento original de clonagem
                    } else {
                        // Se for JSON válido mas não um objeto (ex: número solto), trata como string
                        // para manter consistência com a lógica de Object.assign
                        payload = messageString;
                    }
                } catch (e) {
                    // Se ocorrer erro no JSON.parse, é uma string normal
                    payload = messageString;
                }
                
                // Use Map instead of Object for devices_values to maintain insertion order and avoid expensive Object.keys() calls.
                const MAX_CACHE_SIZE = 2000;
                
                // Map.size is O(1)
                if (node.devices_values.size > MAX_CACHE_SIZE) {
                    const oldestKey = node.devices_values.keys().next().value;
                    node.devices_values.delete(oldestKey);
                }
 
                const currentVal = node.devices_values.get(topic);
                if (currentVal && typeof currentVal === 'object' && typeof payload === 'object') {
                    // Merge new payload into existing object
                    Object.assign(currentVal, payload);
                    // 🔥 FIX: Delete and Set to update insertion order (True LRU)
                    node.devices_values.delete(topic);
                    // Re-set to update order (LRU behavior) if desired, or just leave modified object
                    node.devices_values.set(topic, currentVal);
                } else {
                    //Delete and Set to update insertion order
                    node.devices_values.delete(topic);
                    node.devices_values.set(topic, payload);
                }
                
                node.emit('onMQTTMessage', {
                    topic: topic,
                    payload: payload,
                    item: node.getDeviceOrGroupByKey(topic)
                });

            }
        }

        onClose() {
            var node = this;
            
            // Notificar clientes registados que o servidor vai fechar
            if (node.clientNodes) {
                node.clientNodes.forEach(client => {
                    if (client.status) client.status({fill: "red", shape: "ring", text: "server stopping"});
                });
                node.clientNodes.clear();
                node.clientNodes = null;
            }
 
            // Remover todos os listeners internos do EventEmitter do Node
            node.removeAllListeners();
            
            node.unsubscribeMQTT();
            if (node.mqtt) {
                try {
                    // LIMPEZA: Remover listeners antes de fechar para evitar eventos 'close' tardios
                    node.mqtt.removeAllListeners();
                    node.mqtt.end(true); // Forçar fecho imediato
                } catch(e) { 
                    node.warn("Error closing MQTT client: " + e.message); 
                }
                node.mqtt = null; // Libertar referência para GC
            }
            node.connection = false;
            node.log('MQTT connection closed and resources freed');
        }
    }

    // 🔥 CORREÇÃO AQUI: Adicionar a definição das credentials no 3º argumento
    RED.nodes.registerType('zigbee2mqtt-server', ServerNode, {
        credentials: {
            mqtt_username: { type: "text" },
            mqtt_password: { type: "password" }
        }
    });
};
