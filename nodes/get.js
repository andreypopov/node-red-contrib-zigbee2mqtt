module.exports = function(RED) {
    function hasState(value) {
        return value !== null && value !== undefined
            && !(Array.isArray(value) && value.length === 0)
            && !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
    }

    function hasRequestedState(node, device) {
        if (!device || !hasState(device.current_values)) return false;
        const state = node.config.state;
        if (!state || state === '0') return true;

        const property = state.split('homekit_').join('');
        if (state.startsWith('homekit_')) {
            return !!device.homekit && property in device.homekit
                && device.homekit[property] !== null && device.homekit[property] !== undefined;
        }
        return typeof device.current_values === 'object' && property in device.current_values
            && device.current_values[property] !== null && device.current_values[property] !== undefined;
    }

    class Zigbee2mqttNodeGet {
        constructor(config) {
            RED.nodes.createNode(this, config);

            let node = this;
            node.config = config;
            node.cleanTimer = null;
            node.last_successful_status = {};
            node.server = RED.nodes.getNode(node.config.server);
            node.status({});
            if (node.server) {
                node.on('input', function(message_in) {

                    let key = node.config.device_id;
                    if ((!key || key === 'msg.topic') && message_in.topic) {
                        key = message_in.topic;
                    }

                    const options = {
                        'msg': message_in,
                        'key': key,
                    };
                    if (node.config.enableMultiple) {
                        node.server.nodeSend(node, options);
                        return;
                    }

                    const device = node.server.getDeviceByKey(key);
                    if (device && !hasRequestedState(node, device)
                        && typeof node.server.requestMissingDeviceStates === 'function') {
                        node.server.requestMissingDeviceStates(node, options, [device]);
                    } else {
                        node.server.nodeSend(node, options);
                    }
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
