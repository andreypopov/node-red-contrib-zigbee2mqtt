var request = require('request');
var NODE_PATH = '/zigbee2mqtt/';

module.exports = function(RED) {

    RED.httpAdmin.get(NODE_PATH + 'static/*', function (req, res) {
        var options = {
            root: __dirname + '/static/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options);
    });


    RED.httpAdmin.get(NODE_PATH + 'getDevices', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        var forceRefresh = config.forceRefresh ? ['1', 'yes', 'true'].includes(config.forceRefresh.toLowerCase()) : false;

        if (controller && controller.constructor.name === "ServerNode") {
            controller.getDevices(function (items) {
                if (items) {
                    res.json(items);
                } else {
                    res.status(404).end();
                }
            }, forceRefresh);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'getStatesByDevice', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var item = controller.getDeviceById(config.device_id);
            if (item) {
                res.json([item.lastPayload, item.homekit]);
            } else {
                res.status(404).end();
            }
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'setPermitJoin', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            controller.setPermitJoin(config.permit_join=='true'?true:false);
            res.json({"result":"ok"});
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
            res.json(controller.bridge_config);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'renameDevice', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        if (controller && controller.constructor.name === "ServerNode") {
            var response = controller.renameDevice(config.ieeeAddr, config.newName);
            res.json(response);
        } else {
            res.status(404).end();
        }
    });

}
