class Zigbee2MqttEditor {
    constructor(node, config = {}) {
        this.node = node;
        this.devices = null;
        this.config = Object.assign( {
            allow_empty:false
        }, config);
        this.device_id = node.device_id||null;
        this.property = node.state||null;
        this.filterProperties = this.normalizeFilterProperties(node.filterProperties);
        this.optionsValue = node.optionsValue||null;
        this.optionsType = node.optionsType||null;
        this.refresh = false;

        return this;
    }

    bind() {
        let that = this;
        that.getRefreshBtn().off('click').on('click', () => {
            that.refresh = true;
            that.build();
        });
        that.getServerInput().off('change').on('change', (e) => {
            // console.log('bind: getServerInput');
            that.property = null;
            that.refresh = true;
            that.build();
        });
        that.getDeviceIdInput().off('change').on('change', () => {
            that.device_id = that.getDeviceIdInput().multipleSelect('getSelects', 'value');
            if (!that.isMultiple()) { //no need to build for multiple
                // console.log('bind: getDeviceIdInput');
                that.build();
            } else {
                that.setFriendlyName();
                that.buildFilterPropertiesInput();
            }
        });
        if (that.getDeviceOptionsInput()) {
            that.getDeviceOptionsInput().off('change').on('change', (event, type, value) => {
                // console.log('bind: getDeviceOptionsInput');
                that.optionsValue = value;
                that.optionsType = type;
                that.buildDeviceOptionsHelpBlock();
            });
        }
        that.getFilterChanges().off('change').on('change', () => {
            that.updateFilterPropertiesVisibility();
        });
        that.getEnableMultipleCheckbox().off('change').on('change', (e) => {
            // that.property = null;
            // that.refresh = true;
            // console.log('bind: getEnableMultipleCheckbox');
            that.build();
        });
    }

    async build() {
        let that = this;
        // console.log('build : '+(this.refresh?'true':false));
        await that.buildDeviceIdInput().then(()=>{
            that.buildDevicePropertyInput();
            that.buildDeviceOptionsInput();
            that.buildFilterPropertiesInput();
        });
        that.updateFilterPropertiesVisibility();
        if (typeof that.config.onBuild === 'function') {
            that.config.onBuild(that.getDevice());
        }
        that.bind();
    }

    async buildDeviceIdInput() {
        let that = this;
        that.getFilterChanges().closest('.form-row').show();
        // console.log('BUILD buildDeviceIdInput');

        let params = {
            single: !that.isMultiple(),
            minimumCountSelected: !that.isMultiple()?1:0,
            numberDisplayed: 1,
            maxHeight: 300,
            dropWidth: 320,
            width: 320,
            filter: true,
            formatAllSelected:function(){return RED._("node-red-contrib-zigbee2mqtt/server:editor.select_device")}
        };
        if (that.config.allow_empty && !that.isMultiple()) {
            params.formatAllSelected = function(){return RED._("node-red-contrib-zigbee2mqtt/server:editor.msg_topic")};
        }

        that.getDeviceIdInput().children().remove();
        that.getDeviceIdInput().multipleSelect('destroy').multipleSelect(params).multipleSelect('disable');

        let data = await that.getDevices();

        if (that.config.allow_empty && !that.isMultiple()) {
            that.getDeviceIdInput().html('<option value="msg.topic">msg.topic</option>');
        }

        let html = '';

        //groups
        let groups = data[1];
        if (groups.length) {
            html = $('<optgroup/>', {label: RED._("node-red-contrib-zigbee2mqtt/server:editor.groups")});
            html.appendTo(that.getDeviceIdInput());
            $.each(groups, function(index, value) {
                let text = '';
                if ("devices" in value && typeof (value.devices) != 'undefined' && value.devices.length > 0) {
                    text = ' (' + value.devices.length + ')';
                }
                $('<option value="' + value.id + '" data-friendly_name="' + value.friendly_name + '">' + value.friendly_name + text + '</option>')
                    .appendTo(html);
            });
        }

        //devices
        let devices = data[0];
        if (devices.length) {
            html = $('<optgroup/>', {label: RED._("node-red-contrib-zigbee2mqtt/server:editor.devices")});
            html.appendTo(that.getDeviceIdInput());
            $.each(devices, function(index, value) {
                var model = '';
                if ("definition" in value && value.definition && "model" in value.definition && typeof (value.definition.model) !== undefined) {
                    model = ' (' + value.definition.model + ')';
                }
                $('<option value="' + value.ieee_address + '" data-friendly_name="' + value.friendly_name + '">' + value.friendly_name + model + '</option>')
                    .appendTo(html);
            });
        }

        that.getDeviceIdInput().multipleSelect('enable');
        that.getDeviceIdInput().multipleSelect('refresh');

        that.setDeviceValue();
        that.setFriendlyName();
        return this;
    }

    async buildDevicePropertyInput() {
        let that = this;
        if (!that.getDevicePropertyInput()) return;
        that.getDevicePropertyInput().closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) return;

        // console.log('BUILD buildDevicePropertyInput');

        that.getDevicePropertyInput().children().remove();
        that.getDevicePropertyInput().multipleSelect('destroy').multipleSelect({
            numberDisplayed: 1,
            dropWidth: 320,
            width: 320,
            single: !that.isMultipleProperties(),
            placeholder: RED._("node-red-contrib-zigbee2mqtt/server:editor.complete_payload")
        }).multipleSelect('disable');

        if (!that.isMultipleProperties()) {
            // with several properties allowed, selecting none means the complete payload
            that.getDevicePropertyInput().html('<option value="0">'+ RED._("node-red-contrib-zigbee2mqtt/server:editor.complete_payload")+'</option>');
        }

        let html = '';
        let device = that.getDevice();

        if (device && 'definition' in device && device.definition && 'exposes' in device.definition) {
            html = $('<optgroup/>', {label: RED._("node-red-contrib-zigbee2mqtt/server:editor.zigbee2mqtt")});
            html.appendTo(that.getDevicePropertyInput());

            $.each(device.definition.exposes, function(index, value) {
                if ('features' in value) {
                    $.each(value.features, function(index2, value2) {
                        if ('property' in value2) {
                            $('<option/>', {
                                value: value2.property,
                                text: Zigbee2mqttEditorUtils.formatExposeLabel(value2, value)
                            }).appendTo(html);
                        }
                    });
                } else if ('property' in value) {
                    $('<option/>', {
                        value: value.property,
                        text: Zigbee2mqttEditorUtils.formatExposeLabel(value)
                    }).appendTo(html);
                }
            });
        }

        if (device && 'homekit' in device && device.homekit && Object.keys(device.homekit).length) {
            html = $('<optgroup/>', {label: RED._("node-red-contrib-zigbee2mqtt/server:editor.homekit")});
            html.appendTo(that.getDevicePropertyInput());

            $.each(device.homekit, function (index, value) {
                $('<option  value="homekit_' + index + '">' + index + '</option>').appendTo(html);
            });
        }
        that.getDevicePropertyInput().multipleSelect('enable');
        if (that.isMultipleProperties()) {
            let selected = (Array.isArray(that.property) ? that.property : [that.property]).filter((value) => {
                return value && value !== '0' && that.getDevicePropertyInput().find('option[value="' + value + '"]').length;
            });
            // set the <select> itself: the widget was initialised before these options
            // existed, so setSelects() wouldn't find them; refresh() below picks this up
            that.getDevicePropertyInput().val(selected);
        } else if (that.getDevicePropertyInput().find('option[value='+that.property+']').length) {
            that.getDevicePropertyInput().val(that.property);
        } else {
            that.getDevicePropertyInput().val(that.getDevicePropertyInput().find('option').eq(0).attr('value'));
        }
        that.getDevicePropertyInput().multipleSelect('refresh');
        that.getDevicePropertyInput().off('change.filterProperties').on('change.filterProperties', () => {
            that.updateFilterPropertiesVisibility();
        });
    }

    normalizeFilterProperties(value) {
        const properties = Array.isArray(value)
            ? value
            : (typeof value === 'string' ? value.split(',') : []);
        return [...new Set(properties
            .filter((property) => typeof property === 'string')
            .map((property) => property.trim())
            .filter(Boolean))];
    }

    getFilterPropertyOptions() {
        const deviceInput = this.getDeviceIdInput();
        let selectedIds = deviceInput.multipleSelect('getSelects', 'value');
        if (!selectedIds.length) {
            selectedIds = Array.isArray(this.device_id)
                ? this.device_id
                : (typeof this.device_id === 'string' ? [this.device_id] : []);
        }

        const devices = this.devices && Array.isArray(this.devices[0]) ? this.devices[0] : [];
        const selectedDevices = devices.filter((device) => selectedIds.some((id) => {
            const value = String(id);
            return value === device.ieee_address
                || value === device.friendly_name;
        }));
        return Zigbee2mqttEditorUtils.getComparePropertyOptions(selectedDevices);
    }

    buildFilterPropertiesInput() {
        const input = this.getFilterPropertiesInput();
        if (!input) return;

        if (input.data('multipleSelect')) {
            this.filterProperties = input.multipleSelect('getSelects', 'value');
        }

        const options = this.getFilterPropertyOptions();
        const availableProperties = new Set(options.map(({ value }) => value));
        this.filterProperties = this.normalizeFilterProperties(this.filterProperties);
        if (options.length) {
            this.filterProperties = this.filterProperties.filter((property) => availableProperties.has(property));
        }

        input.multipleSelect('destroy');
        input.empty();
        options.forEach((option) => $('<option/>', {
            value: option.value,
            text: option.label
        }).appendTo(input));

        const hasSelectedDevice = this.getDeviceIdInput().multipleSelect('getSelects', 'value').length > 0;
        input.multipleSelect({
            single: false,
            selectAll: false,
            filter: true,
            filterPlaceholder: RED._('node-red-contrib-zigbee2mqtt/in:multiselect.filter_properties'),
            placeholder: options.length
                ? RED._('node-red-contrib-zigbee2mqtt/in:multiselect.compare_full_payload')
                : RED._(`node-red-contrib-zigbee2mqtt/in:multiselect.${hasSelectedDevice ? 'no_properties_available' : 'select_devices_first'}`),
            width: 320,
            dropWidth: 320,
            maxHeight: 300,
            minimumCountSelected: 1,
            ellipsis: false,
            formatAllSelected: () => RED._('node-red-contrib-zigbee2mqtt/in:multiselect.all_properties_selected'),
            formatCountSelected: (count) => `${count} ${RED._('node-red-contrib-zigbee2mqtt/in:multiselect.properties_selected')}`,
            formatNoMatchesFound: () => RED._('node-red-contrib-zigbee2mqtt/in:multiselect.no_properties_found')
        });
        input.multipleSelect('setSelects', this.filterProperties);
        if (options.length) {
            input.multipleSelect('enable');
        } else {
            input.multipleSelect('disable');
        }
        input.off('change.filterProperties').on('change.filterProperties', () => {
            this.filterProperties = input.multipleSelect('getSelects', 'value');
        });
    }

    buildDeviceOptionsInput() {
        let that = this;
        if (!that.getDeviceOptionsInput()) return;
        that.getDeviceOptionsTypeHelpBlock().hide().find('div').text('').closest('.form-tips').find('span').text('');
        that.getDeviceOptionsInput().closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) return;

        // console.log('BUILD buildDeviceOptionsInput');
        let device = that.getDevice();
        let options = [];
        options.push({'value': 'nothing', 'label': RED._("node-red-contrib-zigbee2mqtt/server:editor.nothing"), options:['']});
        options.push('msg');
        options.push('json');
        if (device && 'definition' in device && device.definition && 'options' in device.definition) {
            $.each(device.definition.options, function(k, v) {
                options.push({'value': v.property, 'label': v.name});
            });
        }
        that.getDeviceOptionsInput().typedInput({
            default: 'nothing',
            value: that.optionsType,
            typeField: that.getDeviceOptionsTypeInput(),
        });
        that.getDeviceOptionsInput().typedInput('types', options);
        that.getDeviceOptionsInput().typedInput('type', that.optionsType || 'nothing');
        that.getDeviceOptionsInput().typedInput('value', that.optionsValue || '');
        that.buildDeviceOptionsHelpBlock();
    }

    buildDeviceOptionsHelpBlock() {
        let that = this;
        if (!that.getDeviceOptionsTypeHelpBlock()) return;

        that.getDeviceOptionsTypeHelpBlock().hide().find('div').text('').closest('.form-tips').find('span').text('');
        if (that.isMultiple()) return;

        // console.log('BUILD buildDeviceOptionsHelpBlock');

        let device = that.getDevice();
        let selectedOption = null;
        if (device && 'definition' in device && device.definition && 'options' in device.definition) {
            $.each(device.definition.options, function(k, v) {
                if ('json' === that.optionsType) {
                    let json = {};
                    $.each(device.definition.options, function(k, v2) {
                        if ('property' in v2) {
                            let defaultVal = '';
                            if ('type' in v2) {
                                if (v2.type==='numeric') {
                                    defaultVal = 0;
                                    if ('value_min' in v2) {
                                        defaultVal = v2.value_min;
                                    }
                                } else if (v2.type==='binary') {
                                    defaultVal = false;
                                }
                            }
                            json[v2.property] = defaultVal;
                        }
                    });
                    selectedOption = {'name':'JSON', 'description':JSON.stringify(json, null, 4)};
                    return false;
                }
                if (v.property === that.optionsType) {
                    selectedOption = v;
                    return false;
                }
            });
        }

        if (selectedOption && 'description' in selectedOption && selectedOption.description) {
            that.getDeviceOptionsTypeHelpBlock().show().find('div').text(selectedOption.name).closest('.form-tips').find('span').text(selectedOption.description);
        }
    }

    async getDevices() {
        let that = this;
        if (that.devices === null || that.refresh) {
            const response = await fetch('zigbee2mqtt/getDevices?' + new URLSearchParams({
                controllerID: that.getServerInput().val(),
                refresh: that.refresh
            }).toString(), {
                method: 'GET',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            that.refresh = false;
            that.devices = await response.json();
            return that.devices;
        } else {
            return await new Promise(function(resolve, reject) {
                resolve(that.devices);
            });
        }
    }

     getDevice() {
        let that = this;
        let devices = that.devices[0];
        let device = null;

        if (devices.length && that.device_id) {
            let selectedDevice = typeof(that.device_id) === 'object' ? that.device_id[0] : that.device_id;
            $.each(devices, function (index, item) {
                if (item.ieee_address === selectedDevice) {
                    device = item;
                    return false;
                }
            });
        }
        return device;
    }

    getDeviceIdInput() {
        return $('#node-input-device_id');
    }

    getDevicePropertyInput() {
        let $elem = $('#node-input-state');
        return $elem.length?$elem:null;
    }

    getDeviceOptionsInput() {
        let $elem = $('#node-input-optionsValue');
        return $elem.length?$elem:null;
    }

    getDeviceOptionsTypeInput() {
        let $elem = $('#node-input-optionsType');
        return $elem.length?$elem:null;
    }

    getDeviceOptionsTypeHelpBlock() {
        return $('.optionsType_description');
    }

    getDeviceFriendlyNameInput() {
        return $('#node-input-friendly_name');
    }

    getServerInput() {
        return $('#node-input-server');
    }

    getRefreshBtn() {
        return $('#force-refresh');
    }

    getFilterChanges() {
        return $('#node-input-filterChanges');
    }

    getFilterPropertiesInput() {
        let $elem = $('#node-input-filterProperties');
        return $elem.length?$elem:null;
    }

    updateFilterPropertiesVisibility() {
        let input = this.getFilterPropertiesInput();
        if (!input) return;

        let state = this.isMultiple()
            ? '0'
            : (this.getDevicePropertyInput() ? this.getDevicePropertyInput().val() : '0');
        if (Array.isArray(state)) state = state.length ? state : '0';
        const show = this.getFilterChanges().is(':checked') && (!state || state === '0');
        input.closest('.form-row').toggle(show);
    }

    getEnableMultipleCheckbox() {
        return $('#node-input-enableMultiple');
    }

    isMultipleProperties() {
        let input = this.getDevicePropertyInput();
        return !!(input && input.attr('multiple'));
    }

    isMultiple() {
        return this.getEnableMultipleCheckbox().is(':checked');
    }

    setDeviceValue() {
        let that = this;
        if (that.isMultiple()) {
            if (typeof(that.device_id) == 'string') {
                that.device_id = [that.device_id];
            }
            if (that.device_id) {
                that.getDeviceIdInput().multipleSelect('setSelects', that.device_id);
            }
        } else if (that.device_id && that.device_id.length) {
            if (typeof(that.device_id) == 'object') {
                that.device_id = that.device_id[0]; //get the first device
            }
            if (that.getDeviceIdInput().find('option[value="'+that.device_id+'"]').length) {
                that.getDeviceIdInput().val(that.device_id);
            }
            // that.getDeviceIdInput().multipleSelect('check', that.device_id); //does not work
            that.getDeviceIdInput().multipleSelect('refresh');
        } else {
            that.device_id = null;
        }
    }

    setFriendlyName() {
        let that = this;
        if (that.isMultiple()) {
            if (typeof(that.device_id) == 'string') {
                that.device_id = [that.device_id];
            }
            if (!that.device_id) {
                that.device_id = [];
            }
            that.getDeviceFriendlyNameInput().val(that.device_id.length + ' ' + RED._("node-red-contrib-zigbee2mqtt/server:editor.selected"));
        } else if (that.device_id && that.device_id.length) {
            if (typeof(that.device_id) == 'object') {
                that.device_id = that.device_id[0]; //get the first device
            }
            if (that.getDeviceIdInput().find('option[value="'+that.device_id+'"]').length) {
                that.getDeviceFriendlyNameInput().val(that.getDeviceIdInput().multipleSelect('getSelects', 'text'));
            }
        } else {
            that.getDeviceFriendlyNameInput().val('');
        }
    }
}
