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

    function getComparePropertyOptions(devices) {
        const options = new Map();
        const addProperty = (property, label) => {
            if (typeof property !== 'string' || !property.trim() || options.has(property)) return;
            options.set(property, {
                value: property,
                label: typeof label === 'string' && label ? label : property
            });
        };
        const addExpose = (expose, parent = null) => {
            if (!expose || typeof expose !== 'object') return;
            if (Array.isArray(expose.features)) {
                expose.features.forEach((feature) => addExpose(feature, expose));
            }
            if (typeof expose.property === 'string') {
                addProperty(expose.property, formatExposeLabel(expose, parent));
            }
        };

        (Array.isArray(devices) ? devices : []).forEach((device) => {
            const exposes = device && device.definition && device.definition.exposes;
            if (Array.isArray(exposes)) exposes.forEach((expose) => addExpose(expose));

            const state = device && device.current_values;
            if (state && typeof state === 'object' && !Array.isArray(state)) {
                Object.keys(state).forEach((property) => addProperty(property));
            }
        });

        return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
    }

    function getWritableExposeOptions(device) {
        const exposes = device && device.definition && device.definition.exposes;
        if (!Array.isArray(exposes)) return [];

        const options = [];
        const properties = new Set();
        function addExpose(expose, parent = null) {
            if (!expose || typeof expose !== 'object') return;

            if (Array.isArray(expose.features)) {
                expose.features.forEach((feature) => addExpose(feature, expose));
            }

            if (typeof expose.property !== 'string'
                || !(Number(expose.access) & 0b010)
                || properties.has(expose.property)) return;

            properties.add(expose.property);
            options.push({
                value: expose.property,
                label: formatExposeLabel(expose, parent),
                expose
            });
        }

        exposes.forEach((expose) => addExpose(expose));
        return options;
    }

    function getWritableExposePayloadOptions(device, property) {
        const option = getWritableExposeOptions(device).find((item) => item.value === property);
        if (!option) return [];

        const expose = option.expose;
        let values = [];
        if (expose.type === 'enum' && Array.isArray(expose.values)) {
            values = expose.values;
        } else if (expose.type === 'binary' && 'value_on' in expose && 'value_off' in expose) {
            values = [expose.value_on, expose.value_off];
            if ('value_toggle' in expose) values.push(expose.value_toggle);
        }

        return [...new Set(values)]
            .filter((value) => typeof value === 'string')
            .map((value) => ({ value, label: value }));
    }

    // Property a built-in Out command writes, e.g. brightness_move -> brightness
    function getCommandProperty(command) {
        if (/^brightness(_|$)/.test(command)) return 'brightness';
        if (/^color_temp(_|$)/.test(command)) return 'color_temp';
        if (/^color(_|$)/.test(command)) return 'color';
        return command;
    }

    // Keep only the commands the device can use. Devices without exposes (and groups,
    // which have no definition) and devices none of the commands apply to keep the full
    // list; `keep` stays listed so a saved command isn't replaced when the editor opens.
    function filterCommandOptions(commands, device, keep = null) {
        const exposes = device && device.definition && device.definition.exposes;
        if (!Array.isArray(exposes) || !exposes.length) return commands;

        const writable = new Set();
        const types = new Set();
        function addExpose(expose) {
            if (!expose || typeof expose !== 'object') return;
            types.add(expose.type);
            if (Array.isArray(expose.features)) expose.features.forEach(addExpose);
            if (typeof expose.property === 'string' && (Number(expose.access) & 0b010)) {
                writable.add(expose.property);
            }
        }
        exposes.forEach(addExpose);

        const supported = ({ value }) => {
            if (value === 'lock') return types.has('lock');
            if (value === 'scene' || value === 'alert') return types.has('light');
            return writable.has(getCommandProperty(value));
        };
        if (!commands.some(supported)) return commands;
        return commands.filter((command) => command.value === keep || supported(command));
    }

    // Payload choices for an Out command: the values the device declares, falling back to
    // the generic state values. State values that match a generic one (ON -> on) use it,
    // so the labels stay the same and saved nodes keep their value.
    function getPayloadOptions(device, command) {
        const generic = getStatePayloadOptions(command);
        const options = getWritableExposePayloadOptions(device, command);
        if (!options.length) return generic;

        return options.map((option) => generic.find(({ value }) => value === option.value.toLowerCase()) || option);
    }

    // With a device, the labels list only the state values it declares
    function getStateCommandOptions(device = null) {
        return stateCommands.map((command) => {
            const name = command === 'state' ? 'State' : `State_${command.slice('state_'.length)}`;
            const values = getWritableExposePayloadOptions(device, command).length
                ? getPayloadOptions(device, command).map(({ value }) => value)
                : getStatePayloadOptions(command).map(({ value }) => value);
            return { value: command, label: `${name} (${values.join('|')})` };
        });
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

    function getDefaultOutNodeLabel(node) {
        if (!node || typeof node !== "object") return "z2m-out";
        if (node.name) return node.name;

        const deviceName = typeof node.friendly_name === "string" && node.friendly_name.length
            ? node.friendly_name
            : (typeof node.device_id === "string" ? node.device_id : null);
        if (!deviceName) return "z2m-out";
        if (node.commandType !== "z2m_cmd" || typeof node.command !== "string" || !node.command) {
            return deviceName;
        }

        if (isStateCommand(node.command)) {
            const stateActionLabels = {
                on: "Turn on",
                off: "Turn off",
                toggle: "Toggle",
                lock: "Lock",
                unlock: "Unlock",
                open: "Open",
                close: "Close"
            };
            const payload = typeof node.payload === "string" ? node.payload.toLowerCase() : "";
            const action = node.payloadType === "z2m_payload" ? stateActionLabels[payload] : null;
            const endpoint = node.command === "state" ? "" : ` (${node.command.slice("state_".length)})`;
            return action
                ? `${action} ${deviceName}${endpoint}`
                : `Set state of ${deviceName}${endpoint}`;
        }

        return `Set ${node.command.replace(/_/g, " ")} of ${deviceName}`;
    }

    function appendServerFlowLabel(label, server) {
        const marker = server && typeof server.flow_label === 'string'
            ? server.flow_label.trim()
            : '';
        return marker ? `${label} [${marker}]` : label;
    }

    return {
        formatExposeLabel,
        getComparePropertyOptions,
        getWritableExposeOptions,
        getWritableExposePayloadOptions,
        filterCommandOptions,
        getPayloadOptions,
        getStateCommandOptions,
        getStatePayloadOptions,
        getDefaultOutNodeLabel,
        appendServerFlowLabel,
        isStateCommand
    };
});
