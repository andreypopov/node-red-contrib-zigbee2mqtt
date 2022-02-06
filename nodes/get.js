module.exports = function(RED) {
    class Zigbee2mqttNodeGet {
        constructor(config) {
            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.cleanTimer = null;
            node.last_successful_status = {};
            node.server = RED.nodes.getNode(node.config.server);
            if (node.server) {
                node.on('input', function(message_in) {

                    let key = node.config.device_id;
                    if (!key && message_in.topic) {
                        key = message_in.topic;
                    }

                    node.server.nodeSend(node, {
                        'msg': message_in,
                        'key': key,
                    });
                });

            } else {
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: 'node-red-contrib-zigbee2mqtt/server:status.no_server',
                });
            }
        }

        setSuccessfulStatus(obj) {
            this.status(obj);
            this.last_successful_status = obj;
        }
    }

    RED.nodes.registerType('zigbee2mqtt-get', Zigbee2mqttNodeGet);
};




