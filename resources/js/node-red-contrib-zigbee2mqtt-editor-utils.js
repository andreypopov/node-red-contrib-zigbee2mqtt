(function (root, factory) {
    const utils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = utils;
    } else {
        root.Zigbee2mqttEditorUtils = utils;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    const stateCommands = ['state', ...Array.from({ length: 9 }, (_, index) => `state_l${index + 1}`)];
    const standardStateValues = [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
        { value: 'toggle', label: 'Toggle' }
    ];

    function formatExposeLabel(expose, parent = null) {
        if (!expose || typeof expose !== 'object') return '';

        const property = typeof expose.property === 'string' ? expose.property : '';
        const name = typeof expose.name === 'string' && expose.name.trim() ? expose.name : property;
        const propertyEndpoint = property !== name ? property.match(/_(l?\d+)$/i)?.[1] : null;
        const endpoint = expose.endpoint || (parent && parent.endpoint) || propertyEndpoint;
        const hasEndpointInName = endpoint && name.toLowerCase().includes(String(endpoint).toLowerCase());
        const endpointSuffix = endpoint && !hasEndpointInName ? ` (${endpoint})` : '';
        const unit = expose.unit ? `, ${expose.unit}` : '';

        return `${name}${endpointSuffix}${unit}`;
    }

    function getStateCommandOptions() {
        return stateCommands.map((command) => ({
            value: command,
            label: command === 'state'
                ? 'State (on|off|toggle|lock|unlock|open|close)'
                : `State_${command.slice('state_'.length)} (on|off|toggle)`
        }));
    }

    function isStateCommand(command) {
        return typeof command === 'string' && stateCommands.includes(command);
    }

    function getStatePayloadOptions(command) {
        if (!isStateCommand(command)) return [];

        const values = command === 'state'
            ? [...standardStateValues,
                { value: 'lock', label: 'Lock' },
                { value: 'unlock', label: 'Unlock' },
                { value: 'open', label: 'Open' },
                { value: 'close', label: 'Close' }]
            : standardStateValues;

        return values.map((option) => ({ ...option }));
    }

    return { formatExposeLabel, getStateCommandOptions, getStatePayloadOptions, isStateCommand };
});
