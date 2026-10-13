const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createLogger = require('../resources/Zigbee2mqttLogger');

function captureMessages(debugLevel) {
    const calls = [];
    const node = {
        log: (...args) => calls.push({ method: 'notice', args }),
        warn: (...args) => calls.push({ method: 'warning', args }),
        error: (...args) => calls.push({ method: 'error', args })
    };
    const RED = {
        log: {
            error: (...args) => calls.push({ method: 'system-error', args })
        }
    };
    const server = { config: { debug_level: debugLevel } };
    return { calls, logger: createLogger(node, server, RED), server };
}

function getJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return getJavaScriptFiles(filePath);
        return entry.isFile() && filePath.endsWith('.js') ? [filePath] : [];
    });
}

test('log visibility uses notice, warning and error severity thresholds', () => {
    for (const [level, expected] of [
        ['notice', ['notice', 'warning', 'error', 'system-error']],
        ['warning', ['warning', 'error', 'system-error']],
        ['error', ['error', 'system-error']]
    ]) {
        const { calls, logger } = captureMessages(level);
        logger.notice('notice');
        logger.warning('warning');
        logger.error('error');
        logger.systemError('system error');
        assert.deepEqual(calls.map(({ method }) => method), expected, `level: ${level}`);
    }
});

test('missing or invalid log levels preserve the previous all-message behavior', () => {
    const { calls, logger } = captureMessages(undefined);
    logger.notice('notice');
    logger.warning('warning');
    logger.error('error', { payload: 'keep for Catch nodes' });
    assert.deepEqual(calls.map(({ method }) => method), ['notice', 'warning', 'error']);
    assert.deepEqual(calls[2].args, ['error', { payload: 'keep for Catch nodes' }]);

    const invalid = captureMessages('verbose');
    invalid.logger.notice('visible');
    assert.deepEqual(invalid.calls.map(({ method }) => method), ['notice']);
});

test('a server log-level change applies to existing logger instances', () => {
    const { calls, logger, server } = captureMessages('notice');
    logger.notice('first');
    server.config.debug_level = 'error';
    logger.notice('hidden');
    logger.warning('hidden too');
    logger.error('visible');
    assert.deepEqual(calls.map(({ method }) => method), ['notice', 'error']);
});

test('system errors fall back to the node error handler when RED logging is unavailable', () => {
    const calls = [];
    const node = {
        log: (...args) => calls.push({ method: 'notice', args }),
        warn: (...args) => calls.push({ method: 'warning', args }),
        error: (...args) => calls.push({ method: 'error', args })
    };
    const logger = createLogger(node, { config: { debug_level: 'error' } });
    logger.systemError('system failure');
    assert.deepEqual(calls, [{ method: 'error', args: ['system failure'] }]);
});

test('project log messages do not bypass the configured visibility level', () => {
    const directLoggerCall = /\bnode\.(?:log|warn|error)\s*\(|\bconsole\.(?:log|warn|error)\s*\(|\bRED\.log\.(?:debug|info|warn|error)\s*\(/;
    const root = path.join(__dirname, '..');
    const files = [path.join(root, 'api.js'), ...getJavaScriptFiles(path.join(root, 'nodes')), ...getJavaScriptFiles(path.join(root, 'resources'))]
        .filter((filePath) => !filePath.endsWith('Zigbee2mqttLogger.js'));

    for (const filePath of files) {
        const source = fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .filter((line) => !/^\s*\/\//.test(line))
            .join('\n');
        assert.doesNotMatch(source, directLoggerCall, `${path.relative(root, filePath)} has an unfiltered log call`);
    }
});
