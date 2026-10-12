var NODE_PATH = '/zigbee2mqtt/';

module.exports = function(RED) {

    // ✅ ENDPOINT COM DETECÇÃO GRANULAR DE ESTADOS
    RED.httpAdmin.get(NODE_PATH + 'serverState/:id', function(req, res) {
        const serverId = req.params.id;
        
        console.log('\n========================================');
        console.log('[Z2M API] 📡 serverState request');
        console.log('[Z2M API] ServerId:', serverId);
        
        const serverNode = RED.nodes.getNode(serverId);
        
        if (!serverNode) {
            console.log('[Z2M API] ❌ Server node NOT FOUND');
            console.log('========================================\n');
            return res.json({ 
                online: false,
                state: 'not_configured',
                error: 'Server not found'
            });
        }
        
        // ═══════════════════════════════════════════════════════════
        // DETECTAR 3 ESTADOS DIFERENTES
        // ═══════════════════════════════════════════════════════════
        
        const hasMqttClient = !!serverNode.mqtt;
        const isMqttConnected = serverNode.connection === true;
        const bridgeState = serverNode.bridge_state;
        
        console.log('[Z2M API] 🔍 Analyzing state:');
        console.log('  - Has MQTT client:', hasMqttClient);
        console.log('  - MQTT connected:', isMqttConnected);
        console.log('  - Bridge state:', bridgeState, '(type:', typeof bridgeState + ')');
        
        let state = 'unknown';
        let online = false;
        let errorComponent = null;
        
        // ✅ CASO 1: MQTT DESCONECTADO
        if (!isMqttConnected || !hasMqttClient) {
            state = 'mqtt_offline';
            online = false;
            errorComponent = 'mqtt';
            console.log('  → MQTT OFFLINE');
        }
        // ✅ CASO 2: MQTT OK mas Z2M OFFLINE
        else if (isMqttConnected && (bridgeState === false || bridgeState === 'offline' || bridgeState === null)) {
            state = 'z2m_offline';
            online = false;
            errorComponent = 'zigbee2mqtt';
            console.log('  → Z2M OFFLINE (MQTT is OK)');
        }
        // ✅ CASO 3: TUDO OK
        else if (isMqttConnected && (bridgeState === true || bridgeState === 'online')) {
            state = 'online';
            online = true;
            errorComponent = null;
            console.log('  → ALL SYSTEMS ONLINE');
        }
        // ❌ CASO 4: ESTADO DESCONHECIDO
        else {
            state = 'unknown';
            online = false;
            errorComponent = 'unknown';
            console.log('  → UNKNOWN STATE');
        }
        
        // ═══════════════════════════════════════════════════════════
        // INFORMAÇÕES ADICIONAIS
        // ═══════════════════════════════════════════════════════════
        
        const response = {
            // Estado geral
            online: online,
            state: state,
            errorComponent: errorComponent,
            
            // Detalhes MQTT
            mqtt: {
                connected: isMqttConnected,
                has_client: hasMqttClient,
                host: serverNode.config?.host || 'Unknown',
                port: serverNode.config?.mqtt_port || '1883'
            },
            
            // Detalhes Zigbee2MQTT
            zigbee2mqtt: {
                bridge_state: bridgeState,
                base_topic: serverNode.config?.base_topic || 'zigbee2mqtt',
                version: serverNode.bridge_info?.version || null,
                permit_join: serverNode.bridge_info?.permit_join || false,
                log_level: serverNode.bridge_info?.log_level || 'info'
            },
            
            // Estatísticas
            stats: {
                devices: serverNode.devices ? serverNode.devices.length : 0,
                groups: serverNode.groups ? serverNode.groups.length : 0
            }
        };
        
        console.log('[Z2M API] 📤 Response:', {
            online: response.online,
            state: response.state,
            errorComponent: response.errorComponent
        });
        console.log('========================================\n');
        
        res.json(response);
    });
    
    // ═══════════════════════════════════════════════════════════
    // OUTROS ENDPOINTS (mantidos iguais)
    // ═══════════════════════════════════════════════════════════
    
    RED.httpAdmin.get(NODE_PATH + 'getDevices', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        
        if (controller && controller.constructor.name === "ServerNode") {
            controller.getDevices(function (items) {
                if (items) {
                    res.json(items);
                } else {
                    res.status(404).end();
                }
            }, true);
        } else {
            res.json([{},{}]);
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'restart', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            controller.restart();
            res.json({"result":"ok"});
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'setPermitJoin', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        
        if (controller && controller.constructor.name === "ServerNode") {
            var time = config.time ? parseInt(config.time) : 180;
            var result = controller.setPermitJoin(
                config.permit_join === 'true', 
                time
            );
            
            res.json({
                "result": "ok", 
                "time": time,
                "enabled": config.permit_join === 'true'
            });
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'setLogLevel', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            controller.setLogLevel(config.log_level);
            res.json({"result":"ok"});
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'getConfig', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            res.json(controller.bridge_info);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'renameDevice', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.renameDevice(config.ieee_address, config.newName);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'removeDevice', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.removeDevice(config.id, config.newName);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'renameGroup', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.renameGroup(config.id, config.newName);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'removeGroup', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.removeGroup(config.id);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'addGroup', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.addGroup(config.name);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'removeDeviceFromGroup', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.removeDeviceFromGroup(config.deviceId, config.groupId);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'addDeviceToGroup', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.addDeviceToGroup(config.deviceId, config.groupId);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'refreshMap', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            controller.refreshMap(true, config.engine).then(function(response){
                res.json(response);
            }).catch(error => {
                res.status(404).end();
            });
        } else {
            res.status(404).end();
        }
    });
    
    RED.httpAdmin.get(NODE_PATH + 'showMap', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.map;
            res.writeHead(200, {'Content-Type': 'image/svg+xml'});
            res.end(response);
        } else {
            res.status(404).end();
        }
    });
    
    RED.httpAdmin.get(NODE_PATH + 'serverState/:id', function(req, res) {
        const serverId = req.params.id;
        
        console.log('\n========================================');
        console.log('[Z2M API] 📡 serverState request');
        console.log('[Z2M API] ServerId:', serverId);
        
        const serverNode = RED.nodes.getNode(serverId);
        
        if (!serverNode) {
            console.log('[Z2M API] ❌ Server node NOT FOUND');
            console.log('========================================\n');
            return res.json({ 
                online: false,
                state: 'not_configured',
                error: 'Server not found'
            });
        }
        
        const hasMqttClient = !!serverNode.mqtt;
        const isMqttConnected = serverNode.connection === true;
        const bridgeState = serverNode.bridge_state;
        
        console.log('[Z2M API] 🔍 Analyzing state:');
        console.log('  - Has MQTT client:', hasMqttClient);
        console.log('  - MQTT connected:', isMqttConnected);
        console.log('  - Bridge state:', bridgeState, '(type:', typeof bridgeState + ')');
        
        let state = 'unknown';
        let online = false;
        let errorComponent = null;
        
        // LÓGICA DE DETECÇÃO
        if (!isMqttConnected || !hasMqttClient) {
            state = 'mqtt_offline';
            online = false;
            errorComponent = 'mqtt';
            console.log('  → MQTT OFFLINE');
        }
        else if (isMqttConnected && (bridgeState === false || bridgeState === 'offline' || bridgeState === null)) {
            state = 'z2m_offline';
            online = false;
            errorComponent = 'zigbee2mqtt';
            console.log('  → Z2M OFFLINE (MQTT is OK)');
        }
        else if (isMqttConnected && (bridgeState === true || bridgeState === 'online')) {
            state = 'online';
            online = true;
            errorComponent = null;
            console.log('  → ALL SYSTEMS ONLINE');
        }
        else {
            state = 'unknown';
            online = false;
            errorComponent = 'unknown';
            console.log('  → UNKNOWN STATE');
        }
        
        // ✅ ADICIONAR COORDINATOR AO RESPONSE
        let coordinator = null;
        if (serverNode.bridge_info && serverNode.bridge_info.coordinator) {
            coordinator = {
                type: serverNode.bridge_info.coordinator.type || 'Unknown',
                meta: {
                    revision: serverNode.bridge_info.coordinator.meta?.revision || 'Unknown'
                }
            };
        }
        
        const response = {
            // Estado geral
            online: online,
            state: state,
            errorComponent: errorComponent,
            
            // Detalhes MQTT
            mqtt: {
                connected: isMqttConnected,
                has_client: hasMqttClient,
                host: serverNode.config?.host || 'Unknown',
                port: serverNode.config?.mqtt_port || '1883'
            },
            
            // Detalhes Zigbee2MQTT
            zigbee2mqtt: {
                bridge_state: bridgeState,
                base_topic: serverNode.config?.base_topic || 'zigbee2mqtt',
                version: serverNode.bridge_info?.version || null,
                permit_join: serverNode.bridge_info?.permit_join || false,
                log_level: serverNode.bridge_info?.log_level || 'info',
                coordinator: coordinator // ✅ ADICIONAR COORDINATOR
            },
            
            // Estatísticas
            stats: {
                devices: serverNode.devices ? serverNode.devices.length : 0,
                groups: serverNode.groups ? serverNode.groups.length : 0
            }
        };
        
        console.log('[Z2M API] 📤 Response:', {
            online: response.online,
            state: response.state,
            errorComponent: response.errorComponent,
            coordinator: coordinator ? `${coordinator.type} (${coordinator.meta.revision})` : 'null'
        });
        console.log('========================================\n');
        
        res.json(response);
    });    
};
