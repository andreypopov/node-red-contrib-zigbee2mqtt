const mqttPath = require.resolve('mqtt');
const serverPath = require.resolve('../../nodes/server');
const originalMqttModule = require.cache[mqttPath];
const clients = [];

function makeClient() {
    const EventEmitter = require('node:events');
    const client = new EventEmitter();
    client.publications = [];
    client.subscriptions = [];
    client.unsubscriptions = [];
    client.ended = false;
    client.publish = (...args) => {
        client.publications.push(args);
        const callback = args.findLast((arg) => typeof arg === 'function');
        if (callback) callback(null);
    };
    client.subscribe = (...args) => {
        client.subscriptions.push(args);
        const callback = args.findLast((arg) => typeof arg === 'function');
        if (callback) callback(null);
    };
    client.unsubscribe = (...args) => client.unsubscriptions.push(args);
    client.end = () => { client.ended = true; };
    return client;
}

require.cache[mqttPath] = {
    id: mqttPath,
    filename: mqttPath,
    loaded: true,
    exports: {
        connect(url, options) {
            const client = makeClient();
            clients.push({ url, options, client });
            return client;
        }
    }
};
delete require.cache[serverPath];
const registerServer = require('../../nodes/server');
if (originalMqttModule) {
    require.cache[mqttPath] = originalMqttModule;
} else {
    delete require.cache[mqttPath];
}

const { createRuntime } = require('./runtime');

function createServer(config = {}) {
    const runtime = createRuntime();
    registerServer(runtime.RED);
    const ServerNode = runtime.types.get('zigbee2mqtt-server');
    const node = new ServerNode({
        id: 'server-id',
        base_topic: 'zigbee2mqtt',
        host: 'localhost',
        ...config
    });
    const connection = clients.at(-1);
    return { ...runtime, node, client: connection.client, connection };
}

function createFlowNode(config = {}) {
    return {
        config,
        cleanTimer: null,
        messages: [],
        statuses: [],
        send(message) { this.messages.push(message); },
        status(status) { this.lastStatus = status; this.statuses.push(status); },
        setSuccessfulStatus(status) { this.status(status); this.lastSuccessfulStatus = status; },
        warn() {},
        error() {},
        log() {}
    };
}

module.exports = { createServer, createFlowNode };
