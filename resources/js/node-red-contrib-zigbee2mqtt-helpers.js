class Zigbee2MqttEditor {
    constructor(node, config = {}) {

        // ✅ debugger
        this.debug = Z2MDebug.create('Z2M Editor');
        

        this.node = node;
        this.devices = null;
        this.config = Object.assign( {
            allow_empty:false,
            mode: 'all'  // ✨ ATUALIZADO: 'in', 'out' ou 'all' (default: 'all' para compatibilidade)
        }, config);
        this.device_id = node.device_id||null;
        this.property = node.state||null;
        this.optionsValue = node.optionsValue||null;
        this.optionsType = node.optionsType||null;
        this.refresh = false;
        
        this.debug.log('Constructor called with mode:', this.config.mode);
        
        return this;
    }
    
    hasSetAccess(access) {
        // Verificar se o bit SET (2) está ativo usando bitwise AND
        // Se (access & 2) > 0, então tem permissão de escrita
        return (access & 2) > 0;
    }
    hasPublishAccess(access) {
        // Verificar se o bit PUBLISH (1) está ativo usando bitwise AND
        // Se (access & 1) > 0, então device publica dados (leitura)
        return (access & 1) > 0;
    }    
    bind() {
        let that = this;
        that.getRefreshBtn().off('click').on('click', () => {
            that.refresh = true;
            that.build();
        });
        that.getServerInput().off('change').on('change', (e) => {
            that.property = null;
            that.refresh = true;
            that.build();
        });
        that.getDeviceIdInput().off('change').on('change', () => {
            that.device_id = that.getDeviceIdInput().multipleSelect('getSelects', 'value');
            if (!that.isMultiple()) {
                that.build();
            } else {
                that.setFriendlyName();
            }
        });
        
        if (that.getDeviceCommandInput()) {
            that.getDeviceCommandInput().off('change').on('change', (event, type, value) => {
                that.debug.log('═══════════════════════════════════════════════════════');
                that.debug.log('🔔 COMMAND CHANGED EVENT');
                that.debug.log('═══════════════════════════════════════════════════════');
                that.debug.log('   - type:', type);
                that.debug.log('   - value:', value);
                
                that.debug.log('⏳ Waiting 50ms for typedInput to update...');
                
                // AGUARDAR typedInput atualizar internamente
                setTimeout(() => {
                    try {
                        const currentType = that.getDeviceCommandInput().typedInput('type');
                        const currentValue = that.getDeviceCommandInput().typedInput('value');
                        that.debug.log('✅ After delay - typedInput type:', currentType);
                        that.debug.log('✅ After delay - typedInput value:', currentValue);
                    } catch(e) {
                        that.debug.log('❌ Error reading typedInput:', e);
                    }
                    
                    that.debug.log('🔄 Calling buildDevicePayloadInput()...');
                    
                    // Reconstruir payload
                    that.buildDevicePayloadInput();
                    // ✨ Mostrar/esconder payload row baseado no tipo E na disponibilidade de comandos
                    const hasCommands = that.deviceHasCommands();
                    if (!hasCommands) {
                        // Se device não tem comandos, esconder TUDO
                        that.debug.log('⚠️  No commands available - hiding all');
                        that.getDevicePayloadInput().closest('.form-row').hide();
                        $('#manual-payload-row').hide();
                    }
                    // ✨ ADICIONAR: Mostrar/esconder payload row
                    else if (type === 'homekit' || type === 'nothing') {
                        that.debug.log('⚠️  Hiding payload row (homekit/nothing)');
                        that.getDevicePayloadInput().closest('.form-row').hide();
                    } else {
                        that.debug.log('✅ Showing payload row');
                        that.getDevicePayloadInput().closest('.form-row').show();
                    }

                    // NOVO: Atualizar blocos de ajuda
                    let command = value;
                    let commandType = type;
                    if (command === '{}') command = 'json';
                    if (commandType === 'str') command = 'custom';
                    $('.help_block').hide();
                    $('.help_block__' + commandType + '_' + command).show();
                }, 50);
            });
        }
        if (that.getDevicePayloadInput()) {
            that.getDevicePayloadInput().off('change').on('change', (event, type, value) => {
                that.debug.log('🔔 PAYLOAD CHANGED:', type, value);
                
                // Passar o VALUE diretamente
                that.toggleManualPayloadInput(value);
            });
        }
        if (that.getDeviceOptionsInput()) {
            that.getDeviceOptionsInput().off('change').on('change', (event, type, value) => {
                that.optionsValue = value;
                that.optionsType = type;
                that.buildDeviceOptionsHelpBlock();
            });
        }
        
        that.getEnableMultipleCheckbox().off('change').on('change', (e) => {
            that.build();
        });
    }

    async build() {
        let that = this;
        await that.buildDeviceIdInput();
        that.buildDevicePropertyInput();
        that.buildDeviceOptionsInput();
        await that.buildDeviceCommandInput();  // AGUARDA terminar!
        that.buildDevicePayloadInput();        // SÓ executa DEPOIS!
        that.bind();
    }

    async buildDeviceIdInput() {
        let that = this;
        
        that.debug.log('[buildDeviceIdInput] Starting with mode:', that.config.mode);
        
        that.getFilterChanges().closest('.form-row').toggle(!that.isMultiple());

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
            
            // ✨ NOVO: Filtrar baseado no MODE
            let filteredDevices;
            
            if (that.config.mode === 'out') {
                // OUT: Mostrar apenas devices com ESCRITA (comandos)
                filteredDevices = devices.filter(device => {
                    return that.deviceHasCommandsForDevice(device);
                });
                that.debug.log('[buildDeviceIdInput OUT] Total devices:', devices.length);
                that.debug.log('[buildDeviceIdInput OUT] Devices with commands:', filteredDevices.length);
            } else if (that.config.mode === 'in') {
                // IN: Mostrar apenas devices com LEITURA (sensores)
                filteredDevices = devices.filter(device => {
                    return that.deviceHasReadableExposesForDevice(device);
                });
                that.debug.log('[buildDeviceIdInput IN] Total devices:', devices.length);
                that.debug.log('[buildDeviceIdInput IN] Devices with readable:', filteredDevices.length);
            } else if (that.config.mode === 'all') {
                // ALL: Mostrar TODOS os devices - MESMO o Coordinator
                filteredDevices = devices;
                that.debug.log('[buildDeviceIdInput ALL] Showing ALL devices:', filteredDevices.length);
            } else {
                // FALLBACK: Se mode não for reconhecido, excluir apenas Coordinator (comportamento seguro)
                that.debug.warn('[buildDeviceIdInput] Unknown mode:', that.config.mode, '- filtering Coordinator');
                filteredDevices = devices.filter(device => {
                    return device.type !== 'Coordinator';
                });
            }
            
            // Adicionar os devices filtrados
            $.each(filteredDevices, function(index, value) {
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

        that.debug.log('BUILD buildDevicePropertyInput');

        that.getDevicePropertyInput().children().remove();
        that.getDevicePropertyInput().multipleSelect('destroy').multipleSelect({
            numberDisplayed: 1,
            dropWidth: 320,
            width: 320,
            single: !(typeof $(this).attr('multiple') !== typeof undefined && $(this).attr('multiple') !== false)
        }).multipleSelect('disable');

        that.getDevicePropertyInput().html('<option value="0">'+ RED._("node-red-contrib-zigbee2mqtt/server:editor.complete_payload")+'</option>');

        let html = '';
        let device = that.getDevice();

        if (device && 'definition' in device && device.definition && 'exposes' in device.definition) {
            html = $('<optgroup/>', {label: RED._("node-red-contrib-zigbee2mqtt/server:editor.zigbee2mqtt")});
            html.appendTo(that.getDevicePropertyInput());

            $.each(device.definition.exposes, function(index, value) {
                if ('features' in value) {
                    $.each(value.features, function(index2, value2) {
                        if ('property' in value2) {
                            $('<option  value="' + value2.property + '">' + value2.name + (value2.unit ? ', ' + value2.unit : '') + '</option>')
                                .appendTo(html);
                        }
                    });
                } else if ('property' in value) {
                    $('<option  value="' + value.property + '">' + value.name + (value.unit ? ', ' + value.unit : '') + '</option>')
                        .appendTo(html);
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
        if (that.getDevicePropertyInput().find('option[value='+that.property+']').length) {
            that.getDevicePropertyInput().val(that.property);
        } else {
            that.getDevicePropertyInput().val(that.getDevicePropertyInput().find('option').eq(0).attr('value'));
        }
        that.getDevicePropertyInput().multipleSelect('refresh');
    }

    async buildDeviceCommandInput() {
        let that = this;
        if (!that.getDeviceCommandInput()) return;
        
        // Se é múltiplo, esconder e sair
        if (that.isMultiple()) {
            that.getDeviceCommandInput().closest('.form-row').hide();
            return;
        }

        that.debug.log('BUILD buildDeviceCommandInput');

        // ✨ NOVO: Verificar se device tem comandos
        const hasCommands = that.deviceHasCommands();
        that.debug.log('[buildDeviceCommandInput] Device has commands:', hasCommands);
        
        // Se NÃO tem comandos, ocultar row e configurar como "nothing"
        if (!hasCommands) {
            that.debug.log('[buildDeviceCommandInput] No commands found - hiding command row');
            that.getDeviceCommandInput().closest('.form-row').hide();
            
            // Configurar typedInput como "nothing"
            try {
                if (that.getDeviceCommandInput().data('typedInput')) {
                    that.getDeviceCommandInput().typedInput('destroy');
                }
            } catch(e) {}
            
            that.getDeviceCommandInput().typedInput({
                default: 'nothing',
                value: '',
                typeField: that.getDeviceCommandTypeInput(),
            });
            
            that.getDeviceCommandInput().typedInput('types', [
                {
                    value: 'nothing',
                    label: RED._("node-red-contrib-zigbee2mqtt/server:editor.nothing"),
                    options: ['']
                }
            ]);
            that.getDeviceCommandInput().typedInput('type', 'nothing');
            that.getDeviceCommandInput().typedInput('value', '');
            
            return new Promise((resolve) => {
                setTimeout(() => {
                    that.debug.log('buildDeviceCommandInput DONE (no commands)');
                    resolve();
                }, 50);
            });
        }
        
        // ✅ TEM COMANDOS - mostrar row e continuar normalmente
        that.getDeviceCommandInput().closest('.form-row').show();

        let $commandList = that.getDeviceCommandListInput();
        if (!$commandList) {
            that.debug.warn('command-list not found');
            return;
        }

        $commandList.children().remove();

        let device = that.getDevice();
        let commandsCount = 0;

        if (device && 'definition' in device && device.definition && 'exposes' in device.definition) {
            const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
            const exposes = flatten(device.definition.exposes);

            $.each(exposes, function(index, expose) {
                if ('features' in expose) {
                    $.each(expose.features, function(index2, feature) {
                        if ('property' in feature && 'access' in feature && that.hasSetAccess(feature.access)) {
                            $('<option/>', {
                                value: feature.property,
                                text: feature.name || feature.property
                            }).appendTo($commandList);
                            commandsCount++;
                        }
                    });
                } else if ('property' in expose && 'access' in expose && that.hasSetAccess(expose.access)) {
                    // ↑ CORRETO: Apenas uma chave } antes do else
                    $('<option/>', {
                        value: expose.property,
                        text: expose.name || expose.property
                    }).appendTo($commandList);
                    commandsCount++;
                }
            });
        }

        if (commandsCount === 0) {
            $('<option/>', {
                value: 'state',
                text: 'state'
            }).appendTo($commandList);
        }

        that.debug.log('Commands in list:', $commandList.find('option').length);

        let z2mOptions = [];
        $commandList.find('option').each(function() {
            z2mOptions.push({
                value: $(this).val(),
                label: $(this).text()
            });
        });

        that.debug.log('z2mOptions:', z2mOptions.length);

        let currentType = that.node.commandType || 'z2m_cmd';
        let currentValue = that.node.command || z2mOptions[0]?.value || 'state';

        try {
            if (that.getDeviceCommandInput().data('typedInput')) {
                currentType = that.getDeviceCommandInput().typedInput('type');
                currentValue = that.getDeviceCommandInput().typedInput('value');
                that.getDeviceCommandInput().typedInput('destroy');
            }
        } catch(e) {
            that.debug.warn('Error reading current:', e);
        }

        that.debug.log('Current:', currentType, currentValue);

        const commandTypes = [
            {
                value: 'z2m_cmd',
                label: 'zigbee2mqtt',
                icon: 'icons/node-red-contrib-zigbee2mqtt/icon.png',
                options: z2mOptions
            },
            {
                value: 'homekit',
                label: 'homekit',
                icon: 'icons/node-red-contrib-zigbee2mqtt/homekit-logo.png',
                options: [{ value: 'homekit', label: 'Apple Homekit data format' }]
            },
            {
                value: 'nothing',
                label: RED._("node-red-contrib-zigbee2mqtt/server:editor.nothing"),
                options: ['']
            },
            'str',
            'msg',
            'flow',
            'global',
            'json'
        ];

        that.debug.log('Creating typedInput with', commandTypes[0].options.length, 'z2m options');

        if (currentType === 'z2m_cmd') {
            const exists = z2mOptions.some(opt => opt.value === currentValue);
            if (!exists) {
                currentValue = z2mOptions[0]?.value || 'state';
                that.debug.log('Value not found, using:', currentValue);
            }
        }

        that.getDeviceCommandInput().typedInput({
            default: 'z2m_cmd',
            value: currentValue,
            typeField: that.getDeviceCommandTypeInput(),
        });

        that.getDeviceCommandInput().typedInput('types', commandTypes);
        that.getDeviceCommandInput().typedInput('type', currentType);
        that.getDeviceCommandInput().typedInput('value', currentValue);

        that.debug.log('Setting:', currentType, currentValue);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                that.debug.log('buildDeviceCommandInput DONE');
                resolve();
            }, 50);
        });
    }
  
  buildDevicePayloadInput() {
        let that = this;
        if (!that.getDevicePayloadInput()) 
            return;
        that.getDevicePayloadInput().closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) 
            return;

        const hasCommands = that.deviceHasCommands();
        that.debug.log('[buildDevicePayloadInput] Device has commands:', hasCommands);
        
        if (!hasCommands) {
            that.debug.log('[buildDevicePayloadInput] No commands - hiding payload row');
            that.getDevicePayloadInput().closest('.form-row').hide();
            $('#manual-payload-row').hide();
            return;
        }
        that.getDevicePayloadInput().closest('.form-row').show();

        that.debug.log('═══════════════════════════════════════════════════════');
        that.debug.log('BUILD buildDevicePayloadInput - START');
        that.debug.log('═══════════════════════════════════════════════════════');

        let currentCommand = '';
        let currentCommandType = 'z2m_cmd';
        
        that.debug.log('🔍 Step 1: Reading command from different sources...');
        that.debug.log('   - node.command:', that.node.command);
        that.debug.log('   - node.commandType:', that.node.commandType);
        
        try {
            const $cmd = that.getDeviceCommandInput();
            if ($cmd && $cmd.length) {
                try {
                    currentCommandType = $cmd.typedInput('type');
                    currentCommand = $cmd.typedInput('value');
                    that.debug.log('✅ Read from command typedInput:');
                    that.debug.log('  - commandType:', currentCommandType);
                    that.debug.log('  - command (raw):', currentCommand);
                    
                    if (currentCommand && typeof currentCommand === 'object') {
                        that.debug.log('  - command is object:', JSON.stringify(currentCommand));
                        if ('value' in currentCommand) {
                            currentCommand = currentCommand.value;
                            that.debug.log('  - extracted from object:', currentCommand);
                        }
                    }
                    
                    if (!currentCommand) {
                        const $commandList = that.getDeviceCommandListInput();
                        if ($commandList && $commandList.val()) {
                            currentCommand = $commandList.val();
                            that.debug.log('⚠️ Empty value, reading from command-list:', currentCommand);
                        }
                    }
                } catch(innerErr) {
                    that.debug.log('⚠️ Command typedInput exists but cannot read:', innerErr.message);
                    currentCommand = that.node.command || '';
                    currentCommandType = that.node.commandType || 'z2m_cmd';
                }
            } else {
                that.debug.log('⚠️ Command input element not found');
            }
        } catch(e) {
            that.debug.warn('❌ Error reading command from typedInput:', e);
        }
        
        if (!currentCommand) {
            currentCommand = that.node.command || '';
            currentCommandType = that.node.commandType || 'z2m_cmd';
            that.debug.log('⚠️ Command empty, using node values:', currentCommandType, '/', currentCommand);
        }

        that.debug.log('🎯 FINAL command to use:', currentCommandType, '/', currentCommand);
        that.debug.log('-----------------------------------------------------------');
        
        try {
            if (that.getDevicePayloadInput().data('typedInput')) {
                that.getDevicePayloadInput().typedInput('destroy');
            }
        } catch(e) {
            // Ignorar
        }

        let z2mPayloadOptions = [];
        let device = that.getDevice();
        
        that.debug.log('🔍 Device:', device ? 'Found' : 'Not found');
        
        if (currentCommandType === 'z2m_cmd' && device && 'definition' in device && device.definition && 'exposes' in device.definition && currentCommand) {
            that.debug.log('✅ Conditions met for extracting payload options');
            that.debug.log('📋 Total exposes:', device.definition.exposes.length);
            
            const findExpose = (exposes, level = 0) => {
                const indent = '  '.repeat(level);
                that.debug.log(indent + '🔎 Searching in', exposes.length, 'exposes at level', level);
                
                for (let i = 0; i < exposes.length; i++) {
                    const expose = exposes[i];
                    that.debug.log(indent + `  [${i}] property:`, expose.property || 'none', 
                               'type:', expose.type || 'none',
                               'has features:', 'features' in expose);
                    
                    if ('property' in expose && expose.property === currentCommand) {
                        that.debug.log(indent + '  ✨ MATCH FOUND!');
                        return expose;
                    }
                    
                    if ('features' in expose && Array.isArray(expose.features)) {
                        that.debug.log(indent + '  ↳ Recursing into features...');
                        const result = findExpose(expose.features, level + 1);
                        if (result) {
                            that.debug.log(indent + '  ✅ Found in nested features!');
                            return result;
                        }
                    }
                }
                that.debug.log(indent + '❌ Not found at level', level);
                return null;
            };

            const foundExpose = findExpose(device.definition.exposes);
            that.debug.log('🎯 Final expose result:', foundExpose ? 'FOUND' : 'NOT FOUND');

            if (foundExpose) {
                that.debug.log('📊 Processing expose data...');
                
                if ('values' in foundExpose && Array.isArray(foundExpose.values)) {
                    that.debug.log('✅ Found values array:', foundExpose.values);
                    $.each(foundExpose.values, function(i, value) {
                        const option = {
                            'value': value,
                            'label': value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
                        };
                        that.debug.log(`  [${i}] Adding option:`, JSON.stringify(option));
                        z2mPayloadOptions.push(option);
                    });
                } else if ('type' in foundExpose && foundExpose.type === 'binary') {
                    that.debug.log('✅ Found binary type');
                    
                    const valueOn = foundExpose.value_on || 'ON';
                    const valueOff = foundExpose.value_off || 'OFF';
                    
                    that.debug.log('   - value_on:', valueOn);
                    that.debug.log('   - value_off:', valueOff);
                    that.debug.log('   - property:', foundExpose.property);
                    
                    const commandProperty = foundExpose.property || '';
                    
                    const toggleablePatterns = [
                        /^state$/i,
                        /^state_l\d+$/i,
                        /^state_(left|right|center)$/i,
                        /^window_detection$/i
                    ];
                    
                    const nonToggleablePatterns = [
                        /^backlight/i,
                        /^alarm/i,
                        /^tamper/i,
                        /^occupancy/i,
                        /^presence/i,
                        /^contact/i,
                        /^water_leak/i,
                        /^battery_low/i,
                        /^ac_status/i,
                        /^led_disabled/i,
                        /^power_outage/i,
                        /^child_lock/i,
                        /^auto_/i,
                        /^mode$/i
                    ];
                    
                    let includeToggle = false;
                    
                    const isNeverToggleable = nonToggleablePatterns.some(pattern => pattern.test(commandProperty));
                    
                    if (isNeverToggleable) {
                        includeToggle = false;
                        that.debug.log('   ❌ Matches NEVER pattern - no toggle');
                    } else {
                        const isAlwaysToggleable = toggleablePatterns.some(pattern => pattern.test(commandProperty));
                        
                        if (isAlwaysToggleable) {
                            includeToggle = true;
                            that.debug.log('   ✅ Matches ALWAYS pattern - has toggle');
                        } else if (valueOn.toUpperCase() === 'ON' && valueOff.toUpperCase() === 'OFF') {
                            includeToggle = true;
                            that.debug.log('   ✅ Uses standard ON/OFF - assuming toggle support');
                        } else {
                            includeToggle = false;
                            that.debug.log('   ❌ Custom values - no toggle');
                        }
                    }
                    
                    if (includeToggle) {
                        z2mPayloadOptions = [
                            {
                                'value': valueOn, 
                                'label': valueOn.charAt(0).toUpperCase() + valueOn.slice(1).toLowerCase()
                            },
                            {
                                'value': valueOff, 
                                'label': valueOff.charAt(0).toUpperCase() + valueOff.slice(1).toLowerCase()
                            },
                            {
                                'value': 'TOGGLE', 
                                'label': 'Toggle'
                            }
                        ];
                        that.debug.log('   → Added 3 options (with TOGGLE)');
                    } else {
                        z2mPayloadOptions = [
                            {
                                'value': valueOn, 
                                'label': valueOn.charAt(0).toUpperCase() + valueOn.slice(1).toLowerCase()
                            },
                            {
                                'value': valueOff, 
                                'label': valueOff.charAt(0).toUpperCase() + valueOff.slice(1).toLowerCase()
                            }
                        ];
                        that.debug.log('   → Added 2 options (no TOGGLE)');
                    }
                } else if ('value_min' in foundExpose && 'value_max' in foundExpose) {
                    that.debug.log('✅ Found numeric range:', foundExpose.value_min, '-', foundExpose.value_max);
                    const min = foundExpose.value_min;
                    const max = foundExpose.value_max;
                    const steps = 5;
                    
                    for (let i = 0; i < steps; i++) {
                        const val = Math.round(min + (max - min) * i / (steps - 1));
                        const percentage = Math.round((val - min) / (max - min) * 100);
                        const option = {
                            'value': val.toString(),
                            'label': `${val} (${percentage}%)`
                        };
                        that.debug.log(`  [${i}] Adding numeric option:`, JSON.stringify(option));
                        z2mPayloadOptions.push(option);
                    }
                }
            }
        }

        if (currentCommandType === 'z2m_cmd' && z2mPayloadOptions.length === 0 && currentCommand) {
            that.debug.log('🔄 Using FALLBACK options for command:', currentCommand);
            
            const stateOptions = [
                {'value': 'ON', 'label': 'On'},
                {'value': 'OFF', 'label': 'Off'},
                {'value': 'TOGGLE', 'label': 'Toggle'}
            ];
            
            const fallbackOptions = {
                'state': stateOptions,
                'brightness': [
                    {'value': '0', 'label': '0 (Off)'},
                    {'value': '64', 'label': '64 (25%)'},
                    {'value': '128', 'label': '128 (50%)'},
                    {'value': '192', 'label': '192 (75%)'},
                    {'value': '255', 'label': '255 (100%)'}
                ],
                'inching_control': [
                    {'value': 'true', 'label': 'Enable (true)'},
                    {'value': 'false', 'label': 'Disable (false)'}
                ]
            };
            
            if (device && 'definition' in device && device.definition && 'exposes' in device.definition) {
                const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
                const exposes = flatten(device.definition.exposes);
                
                const stateChannels = exposes
                    .filter(e => e.property && e.property.match(/^state_l\d+$/))
                    .map(e => e.property);
                
                if (stateChannels.length > 0) {
                    that.debug.log('  🔍 Found', stateChannels.length, 'state channels:', stateChannels);
                    stateChannels.forEach(channel => {
                        fallbackOptions[channel] = stateOptions;
                    });
                }
                
                const inchingChannels = exposes
                    .filter(e => e.property && e.property.match(/^inching_control_\d+$/))
                    .map(e => e.property);
                
                if (inchingChannels.length > 0) {
                    that.debug.log('  🔍 Found', inchingChannels.length, 'inching control channels:', inchingChannels);
                    inchingChannels.forEach(channel => {
                        fallbackOptions[channel] = [
                            {'value': 'true', 'label': 'Enable (true)'},
                            {'value': 'false', 'label': 'Disable (false)'}
                        ];
                    });
                }
            }
            
            if (currentCommand.toLowerCase().includes('lock')) {
                z2mPayloadOptions = [
                    {'value': 'LOCK', 'label': 'Lock'},
                    {'value': 'UNLOCK', 'label': 'Unlock'}
                ];
            } else if (fallbackOptions[currentCommand]) {
                z2mPayloadOptions = fallbackOptions[currentCommand];
                that.debug.log('  ✅ Found fallback with', z2mPayloadOptions.length, 'options');
            }
        }
        
        that.debug.log('📊 Total payload options:', z2mPayloadOptions.length);

        const payloadTypes = [];

        if (currentCommandType === 'homekit' || currentCommandType === 'nothing') {
            that.debug.log('⚠️ Command type is', currentCommandType, '- skipping z2m_payload');
        } 
        else if (z2mPayloadOptions.length > 0) {
            that.debug.log('✅ Adding z2m_payload type WITH', z2mPayloadOptions.length, 'options');

            const isNumericCommand = currentCommand && (
                currentCommand.toLowerCase().includes('countdown') ||
                currentCommand.toLowerCase().includes('brightness') ||
                currentCommand.toLowerCase().includes('color_temp') ||
                currentCommand.toLowerCase().includes('position') ||
                currentCommand.toLowerCase().includes('delay') ||
                currentCommand.toLowerCase().includes('duration') ||
                currentCommand.toLowerCase().includes('time') ||
                currentCommand.toLowerCase().includes('level')
            );
            
            that.debug.log('🔍 Command is numeric:', isNumericCommand);
            
            let finalOptions = z2mPayloadOptions;
            if (isNumericCommand) {
                finalOptions = [...z2mPayloadOptions, {
                    'value': '__manual__',
                    'label': '✏️ Manual input...'
                }];
                that.debug.log('✅ Added manual input option (numeric command)');
            } else {
                that.debug.log('⚠️ Skipped manual input option (not numeric)');
            }
            
            payloadTypes.push({
                value: 'z2m_payload',
                label: 'zigbee2mqtt',
                icon: 'icons/node-red-contrib-zigbee2mqtt/icon.png',
                options: finalOptions
            });
        }
        else if (currentCommandType === 'z2m_cmd' && currentCommand && currentCommand !== '') {
            that.debug.log('✅ Adding z2m_payload type as FREE TEXT');
            payloadTypes.push({
                value: 'z2m_payload',
                label: 'zigbee2mqtt',
                icon: 'icons/node-red-contrib-zigbee2mqtt/icon.png',
                hasValue: true
            });
        }

        payloadTypes.push('msg', 'flow', 'global', 'str', 'num', 'json');

        // ✅ FIX: Ler valores SEMPRE do node primeiro, e só depois do typedInput
        let currentType = that.node.payloadType || 'msg';
        let currentValue = that.node.payload || 'payload';

        that.debug.log('🔍 Initial values from node:', currentType, '/', currentValue);

        // ✅ Tentar ler do typedInput APENAS se já existe e não é a primeira vez
        try {
            if (that.getDevicePayloadInput().data('typedInput')) {
                const existingType = that.getDevicePayloadInput().typedInput('type');
                const existingValue = that.getDevicePayloadInput().typedInput('value');
                
                // ✅ Se existem valores no typedInput, usar esses
                if (existingType && existingValue !== undefined) {
                    currentType = existingType;
                    currentValue = existingValue;
                    that.debug.log('✅ Found existing typedInput values:', currentType, '/', currentValue);
                }
            }
        } catch(e) {
            that.debug.log('⚠️ No existing typedInput, using node values');
        }

        // ✅ Se tinha valor manual gravado, restaurar para __manual__
        if (that.node.manualPayloadValue && that.node.manualPayloadValue !== '' && that.node.manualPayloadValue !== '0') {
            that.debug.log('🔄 Restoring manual mode, value was:', that.node.manualPayloadValue);
            currentValue = '__manual__';
        }
        
        // ✅ Se temos opções z2m e o tipo atual não é z2m, mudar para z2m
        if (z2mPayloadOptions.length > 0) {
            // ✅ MAS: Se o tipo atual é msg/flow/global/str/num/json, MANTER!
            if (!['msg', 'flow', 'global', 'str', 'num', 'json'].includes(currentType)) {
                currentType = 'z2m_payload';
                that.debug.log('⚠️ Changed type to z2m_payload because we have options');
            } else {
                that.debug.log('✅ Keeping existing type:', currentType);
            }
        }

        that.debug.log('🔍 Current payload state:', currentType, '/', currentValue);

        // ✅ Validar se o valor existe nas opções (apenas para z2m_payload)
        if (currentType === 'z2m_payload' && z2mPayloadOptions.length > 0 && currentValue !== '__manual__') {
            const valueExists = z2mPayloadOptions.some(opt => opt.value === currentValue);
            if (!valueExists) {
                currentValue = z2mPayloadOptions[0]?.value || '';
                that.debug.log('⚠️ Value not found in options, using:', currentValue);
            }
        }

        // ✅ CRITICAL: Para tipos msg/flow/global, garantir valor padrão
        if (['msg', 'flow', 'global'].includes(currentType) && (!currentValue || currentValue === '')) {
            currentValue = 'payload';
            that.debug.log('✅ Set default value "payload" for type:', currentType);
        }

        that.getDevicePayloadInput().typedInput({
            default: z2mPayloadOptions.length > 0 ? 'z2m_payload' : 'msg',
            value: currentValue,
            typeField: that.getDevicePayloadTypeInput(),
        });

        that.getDevicePayloadInput().typedInput('types', payloadTypes);    

        // ✅ Se currentValue é __manual__ mas não existe nas opções, usar primeira opção
        if (currentValue === '__manual__') {
            const hasManualOption = payloadTypes.some(type => {
                if (type.options) {
                    return type.options.some(opt => opt.value === '__manual__');
                }
                return false;
            });
            
            if (!hasManualOption) {
                that.debug.log('⚠️ Manual mode requested but not available for this command');
                currentValue = z2mPayloadOptions[0]?.value || 'payload';
                that.debug.log('   Using fallback value:', currentValue);
            }
        }
        
        that.getDevicePayloadInput().typedInput('type', currentType);
        that.getDevicePayloadInput().typedInput('value', currentValue);
        
        that.debug.log('✅ Payload set to:', currentType, '/', currentValue);

        // Mostrar/esconder campo manual baseado no VALOR
        that.toggleManualPayloadInput(currentValue);
        
        that.debug.log('═══════════════════════════════════════════════════════');
    }
    buildDeviceOptionsInput() {
        let that = this;
        if (!that.getDeviceOptionsInput()) return;
        that.getDeviceOptionsTypeHelpBlock().hide().find('div').text('').closest('.form-tips').find('span').text('');
        that.getDeviceOptionsInput().closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) return;

        that.debug.log('BUILD buildDeviceOptionsInput');
        
        // ✨ NOVO: Verificar se device tem comandos
        const hasCommands = that.deviceHasCommands();
        that.debug.log('[buildDeviceOptionsInput] Device has commands:', hasCommands);
        
        // Se NÃO tem comandos, ocultar row de options
        if (!hasCommands) {
            that.debug.log('[buildDeviceOptionsInput] No commands found - hiding options row');
            that.getDeviceOptionsInput().closest('.form-row').hide();
            that.getDeviceOptionsTypeHelpBlock().hide();
            
            // Configurar como "nothing"
            try {
                if (that.getDeviceOptionsInput().data('typedInput')) {
                    that.getDeviceOptionsInput().typedInput('destroy');
                }
            } catch(e) {}
            
            that.getDeviceOptionsInput().typedInput({
                default: 'nothing',
                value: '',
                typeField: that.getDeviceOptionsTypeInput(),
            });
            
            that.getDeviceOptionsInput().typedInput('types', [
                {
                    value: 'nothing',
                    label: RED._("node-red-contrib-zigbee2mqtt/server:editor.nothing"),
                    options: ['']
                }
            ]);
            that.getDeviceOptionsInput().typedInput('type', 'nothing');
            that.getDeviceOptionsInput().typedInput('value', '');
            
            return;
        }
        
        // ✅ TEM COMANDOS - mostrar row e continuar normalmente
        that.getDeviceOptionsInput().closest('.form-row').show();
        
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

        that.debug.log('BUILD buildDeviceOptionsHelpBlock');

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
                controllerID: that.getServerInput().val()
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

    getEnableMultipleCheckbox() {
        return $('#node-input-enableMultiple');
    }

    getDeviceCommandInput() {
        let $elem = $('#node-input-command');
        return $elem.length ? $elem : null;
    }

    getDeviceCommandTypeInput() {
        let $elem = $('#node-input-commandType');
        return $elem.length ? $elem : null;
    }

    getDevicePayloadInput() {
        let $elem = $('#node-input-payload');
        return $elem.length ? $elem : null;
    }

    getDevicePayloadTypeInput() {
        let $elem = $('#node-input-payloadType');
        return $elem.length ? $elem : null;
    }

    getDeviceCommandListInput() {
        let $elem = $('#node-input-command-list');
        return $elem.length ? $elem : null;
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
                that.device_id = that.device_id[0];
            }
            if (that.getDeviceIdInput().find('option[value="'+that.device_id+'"]').length) {
                that.getDeviceIdInput().val(that.device_id);
            }
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
                that.device_id = that.device_id[0];
            }
            if (that.getDeviceIdInput().find('option[value="'+that.device_id+'"]').length) {
                that.getDeviceFriendlyNameInput().val(that.getDeviceIdInput().multipleSelect('getSelects', 'text'));
            }
        } else {
            that.getDeviceFriendlyNameInput().val('');
        }
    }
    
    getManualPayloadValueInput() {
        let $elem = $('#node-input-manualPayloadValue');
        return $elem.length ? $elem : null;
    }
    
    toggleManualPayloadInput(currentValue) {
        let that = this;
        const $manualRow = $('#manual-payload-row');
        
        that.debug.log('🔄 toggleManualPayloadInput called with value:', currentValue);
        
        // Mostrar se o valor for __manual__
        if (currentValue === '__manual__') {
            that.debug.log('✅ Showing manual input row (value is __manual__)');
            $manualRow.show();
        } else {
            that.debug.log('❌ Hiding manual input row (value is not __manual__)');
            $manualRow.hide();
        }
    }

    deviceHasCommands() {
        let that = this;
        let device = that.getDevice();
        
        if (!device || !('definition' in device) || !device.definition || !('exposes' in device.definition)) {
            return false;
        }
        
        const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
        const exposes = flatten(device.definition.exposes);
        
        const hasWritableExposes = exposes.some(expose => {
            // Verificar propriedade direta
            if ('property' in expose && 'access' in expose) {
                const canSet = that.hasSetAccess(expose.access);
                if (canSet) {
                    that.debug.log(`  ✅ [${expose.property}] access=${expose.access} → CAN SET`);
                    return true;
                } else {
                    that.debug.log(`  ❌ [${expose.property}] access=${expose.access} → READ ONLY`);
                }
            }

            if ('features' in expose && Array.isArray(expose.features)) {
                return expose.features.some(feature => {
                    if ('property' in feature && 'access' in feature) {
                        const canSet = that.hasSetAccess(feature.access);
                        if (canSet) {
                            that.debug.log(`  ✅ [${feature.property}] access=${feature.access} → CAN SET`);
                            return true;
                        } else {
                            that.debug.log(`  ❌ [${feature.property}] access=${feature.access} → READ ONLY`);
                        }
                    }
                    return false;
                });
            }
            
            return false;
        });
        
        that.debug.log('[deviceHasCommands] Device has writable exposes:', hasWritableExposes);
        return hasWritableExposes;
}

    deviceHasCommandsForDevice(device) {
        if (!device || !('definition' in device) || !device.definition || !('exposes' in device.definition)) {
            return false;
        }
        
        const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
        const exposes = flatten(device.definition.exposes);
        
        const hasWritableExposes = exposes.some(expose => {
            // Verificar propriedade direta
            if ('property' in expose && 'access' in expose) {
                const canSet = this.hasSetAccess(expose.access);
                if (canSet) {
                    this.debug.log(`  ✅ [${device.friendly_name}][${expose.property}] access=${expose.access} → CAN SET`);
                    return true;
                }
            }
            
            // Verificar features aninhadas
            if ('features' in expose && Array.isArray(expose.features)) {
                return expose.features.some(feature => {
                    if ('property' in feature && 'access' in feature) {
                        const canSet = this.hasSetAccess(feature.access);
                        if (canSet) {
                            this.debug.log(`  ✅ [${device.friendly_name}][${feature.property}] access=${feature.access} → CAN SET`);
                            return true;
                        }
                    }
                    return false;
                });
            }
            
            return false;
        });
        
        return hasWritableExposes;
    }

    deviceHasReadableExposes() {
        let that = this;
        let device = that.getDevice();
        
        if (!device || !('definition' in device) || !device.definition || !('exposes' in device.definition)) {
            return false;
        }
        
        const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
        const exposes = flatten(device.definition.exposes);
        
        // Verificar se existe pelo menos 1 expose com PUBLISH (bit 1)
        const hasReadableExposes = exposes.some(expose => {
            // Verificar propriedade direta
            if ('property' in expose && 'access' in expose) {
                const canPublish = this.hasPublishAccess(expose.access);
                if (canPublish) {
                    this.debug.log(`  ✅ [${expose.property}] access=${expose.access} → CAN PUBLISH`);
                    return true;
                } else {
                    this.debug.log(`  ❌ [${expose.property}] access=${expose.access} → WRITE ONLY`);
                }
            }
            
            // Verificar features aninhadas
            if ('features' in expose && Array.isArray(expose.features)) {
                return expose.features.some(feature => {
                    if ('property' in feature && 'access' in feature) {
                        const canPublish = this.hasPublishAccess(feature.access);
                        if (canPublish) {
                            this.debug.log(`  ✅ [${feature.property}] access=${feature.access} → CAN PUBLISH`);
                            return true;
                        } else {
                            this.debug.log(`  ❌ [${feature.property}] access=${feature.access} → WRITE ONLY`);
                        }
                    }
                    return false;
                });
            }
            
            return false;
        });
        
        this.debug.log('[deviceHasReadableExposes] Device has readable exposes:', hasReadableExposes);
        return hasReadableExposes;
    }

    deviceHasReadableExposesForDevice(device) {
        if (!device || !('definition' in device) || !device.definition || !('exposes' in device.definition)) {
            return false;
        }
        
        const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
        const exposes = flatten(device.definition.exposes);
        
        // Verificar se existe pelo menos 1 expose com PUBLISH (bit 1)
        const hasReadableExposes = exposes.some(expose => {
            // Verificar propriedade direta
            if ('property' in expose && 'access' in expose) {
                const canPublish = this.hasPublishAccess(expose.access);
                if (canPublish) {
                    this.debug.log(`  ✅ [${device.friendly_name}][${expose.property}] access=${expose.access} → CAN PUBLISH`);
                    return true;
                }
            }
            
            // Verificar features aninhadas
            if ('features' in expose && Array.isArray(expose.features)) {
                return expose.features.some(feature => {
                    if ('property' in feature && 'access' in feature) {
                        const canPublish = this.hasPublishAccess(feature.access);
                        if (canPublish) {
                            this.debug.log(`  ✅ [${device.friendly_name}][${feature.property}] access=${feature.access} → CAN PUBLISH`);
                            return true;
                        }
                    }
                    return false;
                });
            }
            
            return false;
        });
        
        return hasReadableExposes;
    }

}
