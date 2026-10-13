const LEVELS = Object.freeze({
    notice: 0,
    warning: 1,
    error: 2
});

function getThreshold(server) {
    const configuredLevel = server && server.config && server.config.debug_level;
    return Object.prototype.hasOwnProperty.call(LEVELS, configuredLevel)
        ? LEVELS[configuredLevel]
        : LEVELS.notice;
}

function isEnabled(server, level) {
    return LEVELS[level] >= getThreshold(server);
}

module.exports = function createLogger(node, server, RED) {
    return {
        notice(...args) {
            if (isEnabled(server, 'notice')) {
                node.log(...args);
            }
        },

        warning(...args) {
            if (isEnabled(server, 'warning')) {
                node.warn(...args);
            }
        },

        error(...args) {
            if (isEnabled(server, 'error')) {
                node.error(...args);
            }
        },

        systemError(...args) {
            if (!isEnabled(server, 'error')) return;
            if (RED && RED.log && typeof RED.log.error === 'function') {
                RED.log.error(...args);
            } else {
                node.error(...args);
            }
        }
    };
};
