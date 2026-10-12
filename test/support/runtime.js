const EventEmitter = require('node:events');

function createRuntime({ nodes = {}, evaluateNodeProperty } = {}) {
    const types = new Map();
    const routes = new Map();
    const logs = [];
    let nodeId = 0;

    const RED = {
        _: (message) => message,
        nodes: {
            createNode(node, config) {
                EventEmitter.call(node);
                for (const name of Object.getOwnPropertyNames(EventEmitter.prototype)) {
                    if (name !== 'constructor' && typeof EventEmitter.prototype[name] === 'function') {
                        node[name] = EventEmitter.prototype[name].bind(node);
                    }
                }

                node.id = config.id || `test-node-${++nodeId}`;
                node.messages = [];
                node.statuses = [];
                node.status = (status) => {
                    node.lastStatus = status;
                    node.statuses.push(status);
                };
                node.send = (message) => node.messages.push(message);
                node.log = (...args) => logs.push({ level: 'log', args });
                node.warn = (...args) => logs.push({ level: 'warn', args });
                node.error = (...args) => logs.push({ level: 'error', args });
            },
            getNode(id) {
                return nodes[id];
            },
            registerType(name, constructor) {
                types.set(name, constructor);
            }
        },
        httpAdmin: {
            get(path, handler) {
                routes.set(path, handler);
            }
        },
        util: {
            evaluateNodeProperty: evaluateNodeProperty || ((property, type, node, message, done) => {
                done(null, type === 'msg' ? message[property] : property);
            })
        }
    };

    return { RED, types, routes, logs };
}

function instantiate(registerNodes, typeName, config, server, options = {}) {
    const runtime = createRuntime({
        nodes: server ? { [config.server || 'server']: server } : {},
        evaluateNodeProperty: options.evaluateNodeProperty
    });
    registerNodes(runtime.RED);
    const Constructor = runtime.types.get(typeName);
    if (!Constructor) {
        throw new Error(`Node type was not registered: ${typeName}`);
    }
    const node = new Constructor(config);
    return { ...runtime, node };
}

module.exports = { createRuntime, instantiate };
