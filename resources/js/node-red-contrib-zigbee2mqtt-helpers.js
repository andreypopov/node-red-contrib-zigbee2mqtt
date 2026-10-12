/**
 * ============================================================================
 * ZIGBEE2MQTT EDITOR CLASS - ORGANIZED STRUCTURE
 * ============================================================================
 * 
 * Esta classe gere a interface de edição de nós Zigbee2MQTT no Node-RED.
 * As funções estão organizadas por categoria funcional.
 */

class Zigbee2MqttEditor {
   
    // ═══════════════════════════════════════════════════════════════════════
    // 📦 CONSTRUCTOR & INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * Construtor da classe
     * @param {Object} node - Referência ao nó Node-RED
     * @param {Object} config - Configurações: { allow_empty, mode: 'in'|'out'|'all' }
     */
    constructor(node, config = {}) {
        // ✅ PLATINUM SECURITY: Garantir que o debugger existe ou usa fallback para console
        this.debug = (typeof Z2MDebug !== 'undefined') ? Z2MDebug.create('Z2M Editor') : console;
        
        this.node = node;
        this.devices = null;
        this._traceLog = []; 
        this.addTrace = (msg) => { 
            this._traceLog.push({time: new Date().toLocaleTimeString(), msg: msg});
            if (this.debug && this.debug.log) this.debug.log('TRACE:', msg);
        };
        
        this.config = Object.assign({ allow_empty:false, mode: 'all' }, config);
        this.device_id = node.device_id||null;
        this.property = node.state||null;
        this.optionsValue = node.optionsValue||null;
        this.optionsType = node.optionsType||null;
        this.refresh = false;
        this.initializing = false;
 
        // Manter registo global para persistência entre tabs
        if (!window.Z2M_EDITORS) 
            window.Z2M_EDITORS = {};
        window.Z2M_EDITORS[node.id] = this;
        if (!window.Z2M_EDITOR_INSTANCES) 
            window.Z2M_EDITOR_INSTANCES = [];
        window.Z2M_EDITOR_INSTANCES.push(this);
 
        this.addTrace('Constructor initialized');
        return this;
    }
    /**
     * Constrói toda a interface do editor (orquestra todas as builds)
     * @returns {Promise<void>}
     */
    async build() {
        let that = this;
        
        // 🔥 CRITICAL: Bloquear TUDO
        that.initializing = true;
        that.registerGlobalInstance();
        
        that.debug.log('');
        that.debug.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
        that.debug.log('┃⚡️ [build] BUILD PROCESS STARTING                    ┃');
        that.debug.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
        
        try {
            // ====================================================================
            // FASE 1: CARREGAR DADOS
            // ====================================================================
            that.debug.log('|->   🔵 Phase 1: buildDeviceIdInput');
            await that.buildDeviceIdInput();
            that.debug.log('|->   ✅ Phase 1: COMPLETE');
            
            // ====================================================================
            // FASE 2: CONSTRUIR INPUTS BÁSICOS
            // ====================================================================
            that.debug.log('|->   🔵 Phase 2: buildDevicePropertyInput & buildDeviceOptionsInput');
            await that.buildDevicePropertyInput();
            await that.buildDeviceOptionsInput();
            that.debug.log('|->   ✅ Phase 2: COMPLETE');
            
            // ====================================================================
            // FASE 3: CONSTRUIR COMMAND (🔥 CRÍTICO: ESPERAR ATÉ ESTAR PRONTO!)
            // ====================================================================
            that.debug.log('|->   🔵 Phase 3: buildDeviceCommandInput');
            await that.buildDeviceCommandInput();
            that.debug.log('|->   ✅ Phase 3: COMPLETE');
            
            // ====================================================================
            // FASE 4: CONSTRUIR PAYLOAD (🔥 AGORA COMMAND ESTÁ GARANTIDAMENTE PRONTO!)
            // ====================================================================
            that.debug.log('|->   🔵 Phase 4: buildDevicePayloadInput');
            await that.buildDevicePayloadInput();
            that.debug.log('|->   ✅ Phase 4: COMPLETE');
            
            // ====================================================================
            // FASE 5: UI DINÂMICA
            // ====================================================================
            that.debug.log('|->   🔵 Phase 5: initDynamicUI');
            that.initDynamicUI();
            that.debug.log('|->   ✅ Phase 5: COMPLETE');
            
            // ====================================================================
            // FASE 6: REGISTAR EVENTOS E FINALIZAR
            // ====================================================================
            that.debug.log('|->   🔵 Phase 6: bind');
            that.bind();
            
            // 🔥 CRITICAL: Libertar a flag APENAS no fim de tudo
            that.initializing = false;
            that.debug.log('|->   ✅ Phase 6: COMPLETE (Lock released)');
            
            that.debug.log('');
            that.debug.log(' ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
            that.debug.log(' 🎉 [build] ALL PHASES COMPLETED!');
            that.debug.log(' ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
     
        } catch(error) {
            that.initializing = false;
            that.debug.error(' ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
            that.debug.error(' ❌ [build] ERROR:', error);
            that.debug.error(' ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
            throw error;
        } finally {
            // ================================================================
            // 🔥 CRITICAL: Desbloquear SINCRONAMENTE
            // ================================================================
            that.initializing = false;
            
            that.debug.log('');
            that.debug.log(' ╔═══════════════════════════════════════════════════════════╗');
            that.debug.log(' ║ ✅ initializing = FALSE (events NOW enabled)              ║');
            that.debug.log(' ╚═══════════════════════════════════════════════════════════╝');
        }
        
        that.debug.log(' ');
        that.debug.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
        that.debug.log('┃  [build] BUILD PROCESS COMPLETE                   ┃');
        that.debug.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
    }
   /**
     * Regista event listeners
     * ✅ PAYLOAD CHANGE agora atualiza slider
     * ✅ COMMAND CHANGE atualiza slider config
     */
    bind() {
        let that = this;
        that.payloadManuallyChanged = false;
        that.addTrace('Binding events');
        
        // Timers
        if (that._payloadTimer) clearTimeout(that._payloadTimer);
        if (that._cmdTimer) clearTimeout(that._cmdTimer);

        that.debug.log('🔌 [bind] REGISTERING ALL LISTENERS');

        // 1. REFRESH BUTTON
        that.getRefreshBtn().off('click.z2m').on('click.z2m', () => {
            that.debug.log('Command refresh change event');
            that.addTrace('Refresh clicked');
            that.refresh = true; 
            that.build();
        });

        // 2. SERVER CHANGE
        that.getServerInput().off('change.z2m').on('change.z2m', () => {
            that.debug.log('Command server change event');
            if (that.initializing) return;
            that.addTrace('Server Change detected');
            that.device_id = null; 
            that.refresh = true;
            that.build();
        });

        // ============================================================================
        // 3. DEVICE CHANGE → 🔥 RESET COMPLETO + AWAIT (FIXED v3.3)
        // ============================================================================
        const $device = that.getDeviceIdInput();
        $device.off('change.z2m').on('change.z2m', async () => {
            that.debug.log('Command device change event');
            if (that.initializing) return;
            that.addTrace('Device Change triggered');
            
            that.debug.log('');
            that.debug.log('╔═══════════════════════════════════════════════════════════╗');
            that.debug.log('║ 🔄 [Device Change] FULL RESET (v3.3 ASYNC FIX)           ║');
            that.debug.log('╚═══════════════════════════════════════════════════════════╝');
            
            // ─────────────────────────────────────────────────────────────────────────
            // 🔥 CRITICAL: LER NOVO DEVICE ID **ANTES** DE LIMPAR
            // ─────────────────────────────────────────────────────────────────────────
            const selected = $device.multipleSelect('getSelects', 'value');
            const newDevice = that.isMultiple() ? selected : selected[0];
            
            that.debug.log('|     📱 New device selected:', newDevice);
            that.debug.log('|     📱 Previous device:', that.device_id);
            
            // 🔥 SE O DEVICE NÃO MUDOU, IGNORAR!
            if (newDevice === that.device_id) {
                that.debug.log('|     ⚠️  Device unchanged - IGNORING event');
                that.debug.log('╚═══════════════════════════════════════════════════════════╝');
                return;
            }
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 1: 🔥 CRITICAL - ATUALIZAR DEVICE_ID **PRIMEIRO**
            // ─────────────────────────────────────────────────────────────────────────
            const previousDevice = that.device_id;
            that.device_id = newDevice;
            
            that.debug.log('|     💾 device_id updated');
            that.debug.log('|        - Old:', previousDevice);
            that.debug.log('|        - New:', that.device_id);
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 2: 🔥 LIMPAR ESTADO (O build tratará da destruição dos widgets)
            // ─────────────────────────────────────────────────────────────────────────
            if (!that.isMultiple()) {
                that.debug.log('|     🧹 Resetting state for device change...');
                
                // 🔥 CRITICAL: Marcar como inicializando para silenciar eventos durante o reset
                that.initializing = true;
                
                that.node.command = null;
                that.node.commandType = 'z2m_cmd';
                that.node.payload = null;
                that.node.payloadType = 'z2m_payload';
                that._lastBuiltCommand = undefined;
                that._lastBuiltDevice = undefined;
 
                // Limpar campos HTML brutos
                that.getDeviceCommandInput()?.val('');
                that.getDevicePayloadInput()?.val('');
                
                that.debug.log('|     ✅ Internal state reset');
            }
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 3: 🔥 LIMPAR NODE + CACHE (SEM GRAVAR NO WIDGET!)
            // ─────────────────────────────────────────────────────────────────────────
            if (!that.isMultiple()) {
                // Estado já capturado no início do evento change.z2m
                
                that.node.command = null;
                that.node.commandType = 'z2m_cmd';
                that.node.payload = null;
                that.node.payloadType = 'z2m_payload';
                
                // 🔥 LIMPAR CACHE
                that._lastBuiltCommand = undefined;
                that._lastBuiltDevice = undefined;
                that.property = null;
                
                that.debug.log('|     ✅ Internal state and cache cleared for rebuild');
            }
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 4: 🔥 LIMPAR INPUTS HTML (CRITICAL!)
            // ─────────────────────────────────────────────────────────────────────────
            const $cmd = that.getDeviceCommandInput();
            const $payload = that.getDevicePayloadInput();
            
            that.debug.log('|     🧹 Clearing HTML inputs...');
            
            // Command inputs
            if ($cmd && $cmd.length) {
                $cmd.val('');
                that.debug.log('|        - Command input cleared');
            }
            $('#node-input-commandType').val('');
            
            // Payload inputs
            if ($payload && $payload.length) {
                $payload.val('');
                that.debug.log('|        - Payload input cleared');
            }
            $('#node-input-payloadType').val('');
            
            that.debug.log('|     ✅ HTML inputs cleared');
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 5: 🔥 LIMPAR LISTA DE COMANDOS (GARANTIR LIMPEZA!)
            // ─────────────────────────────────────────────────────────────────────────
            const $cmdList = that.getDeviceCommandListInput();
            if ($cmdList && $cmdList.length) {
                that.debug.log('|     🧹 Clearing command list...');
                $cmdList.children().remove();
                that.debug.log('|     ✅ Command list cleared');
            }
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 6: 🔥 LIMPAR SLIDERS E CONTROLOS MANUAIS
            // ─────────────────────────────────────────────────────────────────────────
            const $sliders = that.getManualSlidersWrapper();
            const $inputs = that.getManualInputsWrapper();
            
            if ($sliders && $sliders.length) {
                $sliders.empty().hide();
                that.debug.log('|     🧹 Sliders cleared');
            }
            
            if ($inputs && $inputs.length) {
                $inputs.empty();
                that.debug.log('|     🧹 Inputs cleared');
            }
            
            that.debug.log('');
            that.debug.log('╔═══════════════════════════════════════════════════════════╗');
            that.debug.log('║ ✅ RESET COMPLETE - Starting Rebuild                      ║');
            that.debug.log('╚═══════════════════════════════════════════════════════════╝');
            
            // ─────────────────────────────────────────────────────────────────────────
            // PASSO 7: 🔥 REBUILD COMPLETO COM AWAIT (CRITICAL!)
            // ─────────────────────────────────────────────────────────────────────────
            if (!that.isMultiple()) {
                that.debug.log('|     🔄 Rebuilding editor with AWAIT...');
                
                try {
                    // 🔥 CRITICAL: AWAIT para garantir que build() termina!
                    await that.build();
                    
                    that.debug.log('|     ✅ Editor rebuilt successfully');
                    
                    // ════════════════════════════════════════════════════════════
                    // 🆕 VERIFICAÇÃO IMEDIATA (NÃO NO FINAL!)
                    // ════════════════════════════════════════════════════════════
                    that.debug.log('|     🔍 Immediate post-build verification...');
                    
                    const $cmdCheck = that.getDeviceCommandInput();
                    if ($cmdCheck && $cmdCheck.length) {
                        const hasWidget = !!($cmdCheck.data('typedInput') || 
                                             $cmdCheck.data('red-ui-typedInput'));
                        
                        if (hasWidget) {
                            that.debug.log('|     ✅ Command TypedInput EXISTS after build!');
                            
                            try {
                                const type = $cmdCheck.typedInput('type');
                                const value = $cmdCheck.typedInput('value');
                                that.debug.log('|        - type:', type);
                                that.debug.log('|        - value:', value);
                            } catch(e) {
                                that.debug.warn('|        ⚠️  Read error:', e.message);
                            }
                        } else {
                            that.debug.error('|     ❌ Command TypedInput NOT FOUND after build!');
                            
                            // 🔥 DEBUG: Verificar estado do elemento
                            that.debug.error('|     🔍 Debug info:');
                            that.debug.error('|        - Element exists:', $cmdCheck.length > 0);
                            that.debug.error('|        - HTML value:', $cmdCheck.val());
                            that.debug.error('|        - Has parent:', $cmdCheck.parent().length > 0);
                            that.debug.error('|        - Parent class:', $cmdCheck.parent().attr('class'));
                        }
                    }
                    
                } catch(e) {
                    that.debug.error('|     ❌ Rebuild failed:', e.message);
                    that.debug.error('|        Stack:', e.stack);
                }
            } else {
                that.setFriendlyName();
            }
            
            that.debug.log('');
            that.debug.log('╔═══════════════════════════════════════════════════════════╗');
            that.debug.log('║ 🎉 [Device Change] COMPLETE (v3.3 ASYNC FIX)             ║');
            that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        });
        
        // ============================================================================
        // 4. COMMAND CHANGE
        // ============================================================================
        if (that.getDeviceCommandInput()) {
            that.getDeviceCommandInput().off('change').on('change', async (event, type, value) => {
                that.debug.log('Command command change event');
                 // 🔥 CRITICAL: Bloquear se for atualização interna ou inicialização
                if (that.initializing || that._isUpdatingInternally) {
                    return;
                }
                
                that.debug.log('');
                that.debug.log('  ╔═══════════════════════════════════════════════════════════╗');
                that.debug.log('  ║ 📢 [Command Change] Event fired!                      ║');
                that.debug.log('  ╚═══════════════════════════════════════════════════════════╝');
                
                that.debug.log('|     ✅ Processing...');
                
                // ================================================================
                // PASSO 1: Extrair valor real do comando
                // ================================================================
                let commandValue = value;
                
                // Se vier como objeto {value: "brightness"}, extrair
                if (value && typeof value === 'object' && value.value !== undefined) {
                    commandValue = value.value;
                }
                
                that.debug.log('|     🎯 New command:', type, '/', commandValue);
                
                // ================================================================
                // PASSO 2: 🔥 Gravar IMEDIATAMENTE no node
                // ================================================================
                const previousCommand = that.node.command;
                const previousType = that.node.commandType;
                
                that.node.command = commandValue;
                that.node.commandType = type;
                
                that.debug.log('|     💾 Saved to node');
                that.debug.log('|        - Previous:', previousType, '/', previousCommand);
                that.debug.log('|        - Current:', type, '/', commandValue);
                
                // ================================================================
                // PASSO 3: 🔥 RESET do payload (forçar rebuild)
                // ================================================================
                const commandChanged = (previousCommand !== commandValue) || (previousType !== type);
                
                if (commandChanged) {
                    that.debug.log('|     🔥 Command CHANGED - resetting payload');
                    
                    // Reset completo
                    that.node.payload = null;
                    that.node.payloadType = 'z2m_payload';
                    that.payloadManuallyChanged = false;
                    
                    // Limpar cache de tipos
                    that.currentPayloadTypes = null;
                    
                    that.debug.log('|     ✅ Payload reset complete');
                }
                
                // ================================================================
                // PASSO 4: 🔥 REBUILD PAYLOAD (com nova lista!)
                // ================================================================
                that.debug.log('|     🔄 Rebuilding payload with new options...');
                
                try {
                    await that.buildDevicePayloadInput();
                    that.debug.log('|     ✅ Payload rebuild complete');
                } catch(e) {
                    that.debug.error('|     ❌ Payload rebuild failed:', e.message);
                }
                
                // ================================================================
                // PASSO 5: Atualizar UI Dinâmica (sliders)
                // ================================================================
                that.debug.log('|     🎨 Updating dynamic UI...');
                that.initDynamicUI();
                
                // ================================================================
                // PASSO 6: Atualizar Help Blocks
                // ================================================================
                let cmd = commandValue;
                let cmdType = type;
                if (cmd === '{}') cmd = 'json';
                if (cmdType === 'str') cmd = 'custom';
                
                $('.help_block').hide();
                $('.help_block__' + cmdType + '_' + cmd).show();
                
                that.debug.log('|     ✅ Command change complete');
            });
            
            that.debug.log('|     ✅ Command change listener registered');
        }
 
        // ============================================================================
        // PAYLOAD CHANGE → Sync slider
        // ============================================================================
        if (that.getDevicePayloadInput()) {
            that.getDevicePayloadInput().off('change').on('change', (event, type, value) => {
                that.debug.log('Command payload change event');
                if (that.initializing || that._isUpdatingInternally || value === that.node.payload) {
                    return;
                }
                
                that.debug.log('');
                that.debug.log('  ╔═══════════════════════════════════════════════════════════╗');
                that.debug.log('  ║ 📢 [Payload Change] Event fired!                      ║');
                that.debug.log('  ╚═══════════════════════════════════════════════════════════╝');
                that.debug.log('|        - initializing:', that.initializing);
                that.debug.log('|        - type:', type);
                that.debug.log('|        - value:', value);
                
                
                that.debug.log('✅ Processing...');
                
                const typeChanged = that.node.payloadType !== type;
                
                that.payloadManuallyChanged = true;
                
                that.node.payloadType = type;
                that.node.payload = value;
                
                that.debug.log('💾 Saved:', that.node.payloadType, '/', that.node.payload);
                
                // ✅ SE O TIPO MUDOU: Re-avaliar visibilidade de sliders
                if (typeChanged) {
                    that.debug.log('|     🔄 Payload Type changed to:', type, '- Updating UI');
                    that.initDynamicUI();
                }
                
                // ✅ 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Payload → Slider
                if (type === 'z2m_payload') {
                    const $cmd = that.getDeviceCommandInput();
                    const $payload = that.getDevicePayloadInput(); // ✅ Garantir variável correta
                    try {
                        let currentCmd = that.node.command;
                        if ($cmd && $cmd.data('typedInput')) {
                            const val = $cmd.typedInput('value');
                            currentCmd = (val && typeof val === 'object' && val.value) ? val.value : val;
                        }
                        const uiConfig = window.Z2MConfig?.getComplexInputConfig(currentCmd);
                        if (uiConfig) {
                            // 1. Limpar labels manuais se o valor for padrão
                            let z2mType = that.currentPayloadTypes?.find(t => t.value === 'z2m_payload');
                            if (z2mType && z2mType.options) {
                                const standardOptions = z2mType.options.filter(opt => !String(opt.label).startsWith('Manual ('));
                                const isStandard = standardOptions.some(opt => String(opt.value) === String(value));
                                if (isStandard) {
                                    z2mType.options = standardOptions;
                                    $payload.typedInput('types', that.currentPayloadTypes);
                                }
                            }
                            // 2. Sincronizar UI
                            that.syncUIFromPayload(uiConfig, value);
                        }
                    } catch(e) {
                            that.debug.warn('|     ⚠️ Sync failed:', e.message);
                        }
                }
                
                that.debug.log('|     ✅ Payload change complete');
            });
            
            that.debug.log('|     ✅ Payload change listener registered');
        }
 
        // 6. OPTIONS & MULTIPLE
        if (that.getDeviceOptionsInput()) {
            that.getDeviceOptionsInput().off('change.z2m').on('change.z2m', (e, type, value) => {
                that.debug.log('Command options change event');
                if (that.initializing) return;
                that.addTrace('Options Change');
                that.optionsValue = value; that.optionsType = type;
                that.buildDeviceOptionsHelpBlock();
            });
        }
        // 7. SLIDER VISIBILITY CHECKBOX (FIX)
        const $visCb = that.getSliderVisibilityCheckbox();
        if ($visCb) {
            $visCb.off('change.z2m_vis').on('change.z2m_vis', function() {
                that.debug.log('Command slider change event');
                const isChecked = $(this).is(':checked');
                that.node.manualPayloadSliderVisible = isChecked;
                that.addTrace('Visibility toggled: ' + isChecked);
                const uiConfig = window.Z2MConfig?.getComplexInputConfig(that.getDeviceCommandInput()?.typedInput('value') || that.node.command);
                if (uiConfig) that.getManualSlidersWrapper().toggle(isChecked && uiConfig.type !== 'color-picker');
            });
        }
        
        that.getEnableMultipleCheckbox().off('change.z2m').on('change.z2m', () => {
            that.debug.log('Command multiplecheckbox change event');
            that.addTrace('Multiple Checkbox Change');
            if (!that.initializing) that.build();
        });
        
        that.debug.log('✅ [bind] ALL LISTENERS REGISTERED');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🏗️ BUILD METHODS - Construção de UI Components
    // ═══════════════════════════════════════════════════════════════════════
    /**
     * Aguarda até TypedInput estar inicializado e visível no DOM
     */
    async waitForTypedInputReady($element, timeout = 1000) { 
        let that = this;
        if (!$element || $element.length === 0) return true;
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const isInitialized = !!($element.data('typedInput') || $element.data('red-ui-typedInput'));
                if (isInitialized) return resolve(true);
                if (Date.now() - startTime >= timeout) return resolve(false);
                // Polling mais agressivo (10ms) reduz a percepção de atraso
                setTimeout(check, 10); 
            };
            check();
        });
    }
    
    /**
     * Constrói dropdown de seleção de devices/groups
     * Filtra devices baseado no mode: 'in' (sensores), 'out' (comandos), 'all'
     * @returns {Promise<void>}
     */
    async buildDeviceIdInput() {
        let that = this;
        
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🗿️ [buildDeviceIdInput] STARTING                           ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
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

        // 🔥 CRITICAL: Usar await para esperar getDevices()
        let data = await that.getDevices() || [[], []]; // Fallback para arrays vazios

        if (that.config.allow_empty && !that.isMultiple()) {
            that.getDeviceIdInput().html('<option value="msg.topic">msg.topic</option>');
        }

        let html = '';

        //groups
        let groups = data[1] || [];
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
            
            // ✅ Filtrar baseado no MODE
            let filteredDevices;
            
            if (that.config.mode === 'out') {
                // OUT: Mostrar apenas devices com ESCRITA (comandos)
                filteredDevices = devices.filter(device => {
                    return that.deviceHasCommandsForDevice(device);
                });
                that.debug.log('|     [buildDeviceIdInput OUT] Total devices:', devices.length);
                that.debug.log('|     [buildDeviceIdInput OUT] Devices with commands:', filteredDevices.length);
            } else if (that.config.mode === 'in') {
                // IN: Mostrar apenas devices com LEITURA (sensores)
                    filteredDevices = devices.filter(device => {
                    return that.deviceHasReadableExposesForDevice(device);
                });
                that.debug.log('|     [buildDeviceIdInput IN] Total devices:', devices.length);
                that.debug.log('|     [buildDeviceIdInput IN] Devices with readable:', filteredDevices.length);
            } else if (that.config.mode === 'all') {
                // ALL: Mostrar TODOS os devices - MESMO o Coordinator
                filteredDevices = devices;
                that.debug.log('|     [buildDeviceIdInput ALL] Showing ALL devices:', filteredDevices.length);
            } else {
                // FALLBACK: Se mode não for reconhecido, excluir apenas Coordinator
                that.debug.warn('|     [buildDeviceIdInput] Unknown mode:', that.config.mode, '- filtering Coordinator');
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
                $('<option>', { 
                    value: value.ieee_address,
                    'data-friendly_name': value.friendly_name,
                    text: value.friendly_name + model
                }).appendTo(html);
            });
        }

        that.getDeviceIdInput().multipleSelect('enable');
        that.getDeviceIdInput().multipleSelect('refresh');
        that.setDeviceValue();
        that.setFriendlyName();
        
        // 🔥 CRITICAL: RETORNAR Promise resolvida
        that.debug.log('[buildDeviceIdInput] Complete');
        
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🗿️ [buildDeviceIdInput] COMPLETE                           ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        return Promise.resolve();
    }
    /**
     * Constrói dropdown de propriedades do device (state, brightness, etc)
     * @returns {Promise<void>}
     */
    async buildDevicePropertyInput() {
        let that = this;
        if (!that.getDevicePropertyInput()) return;
        
        that.getDevicePropertyInput().closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) return;

        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🗿️ [buildDevicePropertyInput] STARTING                     ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
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
        
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🗿️ [buildDevicePropertyInput] COMPLETE                     ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        
        // ✅ CRITICAL: Retornar Promise resolvida para que await funcione
        return Promise.resolve();
    }
    /**
     * Constrói TypedInput para comandos (state, brightness, color_temp, etc)
     * @returns {Promise<void>}
     */
    async buildDeviceCommandInput() {
        let that = this;
        if (!that.getDeviceCommandInput()) return;

        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🗿️ [buildDeviceCommandInput] STARTING (v3.4 FIX)          ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        const $cmd = that.getDeviceCommandInput();
        
        if (that.isMultiple()) {
            that.getDeviceCommandInput().closest('.form-row').hide();
            return;
        }

        // ══════════════════════════════════════════════════════════════════════════
        // ✅ VERIFICAR SE DEVICE TEM COMANDOS
        // ══════════════════════════════════════════════════════════════════════════
        const hasCommands = that.deviceHasCommands();
        that.debug.log('|     Device has commands:', hasCommands);
        
        if (!hasCommands) {
            that.debug.log('|     No commands - hiding row');
            that.getDeviceCommandInput().closest('.form-row').hide();
            
            that.node.commandType = 'nothing';
            that.node.command = '';
            that._lastBuiltCommand = undefined;
            
            try {
                if ($cmd.data('typedInput')) {
                    $cmd.typedInput('destroy');
                }
            } catch(e) {}
            
            $cmd.typedInput({
                default: 'nothing',
                value: '',
                typeField: that.getDeviceCommandTypeInput(),
            });
            
            $cmd.typedInput('types', [
                {
                    value: 'nothing',
                    label: RED._("node-red-contrib-zigbee2mqtt/server:editor.nothing"),
                    options: ['']
                }
            ]);
            $cmd.typedInput('type', 'nothing');
            $cmd.typedInput('value', '');
            
            // Reset initializing flag before returning
            that.initializing = false;
            that._isUpdatingInternally = false;
            
            await new Promise(resolve => setTimeout(resolve, 50));
            return;
        }
        
        // ══════════════════════════════════════════════════════════════════════════
        // ✅ CONSTRUIR LISTA DE COMANDOS (LIMPAR PRIMEIRO!)
        // ══════════════════════════════════════════════════════════════════════════
        that.getDeviceCommandInput().closest('.form-row').show();

        let $commandList = that.getDeviceCommandListInput();
        if (!$commandList || !$commandList.length) return;
        
        // 🔥 CRITICAL: LIMPAR LISTA SEMPRE!
        const oldCount = $commandList.children().length;
        $commandList.children().remove();
        that.debug.log('|     🧹 Command list cleared (was:', oldCount, 'options)');

        let device = that.getDevice();
        let commandsCount = 0;

        if (device && 'definition' in device && device.definition && 'exposes' in device.definition) {
            const addCommandsFromExposes = (exposesList) => {
                $.each(exposesList, function(index, expose) {
                    if (expose.type === 'composite' && that.hasSetAccess(expose.access)) {
                        const expansions = window.Z2MConfig?.getCompositeExpansions(expose.property);
                        if (expansions) {
                            expansions.forEach(cmd => {
                                $('<option/>', { value: cmd.value, text: cmd.label }).appendTo($commandList);
                                commandsCount++;
                            });
                        }
                    }
                    
                    if ('features' in expose) {
                        addCommandsFromExposes(expose.features);
                    } 
                    else if ('property' in expose && 'access' in expose && that.hasSetAccess(expose.access)) {
                        const expansions = window.Z2MConfig?.getCompositeExpansions(expose.property);
                        const alreadyAdded = expansions && expansions.some(e => e.value === expose.property);

                        if (!alreadyAdded) {
                            $('<option/>', {
                                value: expose.property,
                                text: expose.name || expose.property
                            }).appendTo($commandList);
                            commandsCount++;
                        }
                    }
                });
            };

            addCommandsFromExposes(device.definition.exposes);
        }

        if (commandsCount === 0) {
            $('<option/>', {
                value: 'state',
                text: 'state'
            }).appendTo($commandList);
            commandsCount = 1;
        }

        that.debug.log('|     ✅ Commands populated:', commandsCount);

        // ══════════════════════════════════════════════════════════════════════════
        // CONSTRUIR OPÇÕES
        // ══════════════════════════════════════════════════════════════════════════
        let z2mOptions = [];
        $commandList.find('option').each(function() {
            z2mOptions.push({
                value: $(this).val(),
                label: $(this).text()
            });
        });

        that.debug.log('|     📋 Options array:', z2mOptions.length, 'items');

        // ══════════════════════════════════════════════════════════════════════════
        // 🔥 DETERMINAR VALOR INICIAL
        // ══════════════════════════════════════════════════════════════════════════
        let currentType = 'z2m_cmd';
        let currentValue = null;

        // ✅ PLATINUM FIX: Só considerar "mudança" se não for o primeiro carregamento
        const isInitialLoad = (that._lastBuiltDevice === undefined);
        const deviceChanged = !isInitialLoad && (that._lastBuiltDevice !== that.device_id);
        
        that.debug.log('|     🔍 Device changed?', deviceChanged, '(Initial Load:', isInitialLoad, ')');
        that.debug.log('|        - Previous device:', that._lastBuiltDevice);
        that.debug.log('|        - Current device:', that.device_id);

        if (deviceChanged) {
            // 🔥 DEVICE MUDOU → Usar primeira opção!
            that.debug.log('|     🔥 Device changed → Using FIRST option');
            
            currentValue = z2mOptions[0]?.value || 'state';
            currentType = 'z2m_cmd';
            
            that.debug.log('|        - Forced to first:', currentValue);
            
        } else {
            // Device não mudou → Tentar manter command
            
            if (that.node.command && that.node.command !== '' && that.node.command !== 'null') {
                const exists = z2mOptions.some(opt => opt.value === that.node.command);
                
                if (exists) {
                    currentValue = that.node.command;
                    currentType = that.node.commandType || 'z2m_cmd';
                    that.debug.log('|     ✅ Using node command:', currentValue);
                }
            }

            if (!currentValue) {
                currentValue = z2mOptions[0]?.value || 'state';
                that.debug.log('|     ✅ Using first option:', currentValue);
            }
        }

        // ══════════════════════════════════════════════════════════════════════════
        // 🔥 CRITICAL: ATUALIZAÇÃO SEM DESTRUIÇÃO (v4.2 FIX LOOP)
        // ══════════════════════════════════════════════════════════════════════════
        const hasWidget = !!($cmd.data('typedInput') || $cmd.data('red-ui-typedInput'));
        
        // Ativar bloqueio TOTAL de eventos antes de qualquer alteração no widget
        that._isUpdatingInternally = true;
        that.initializing = true; 
 
        if (!hasWidget) {
            that.debug.log('|     🆕 Creating Command TypedInput');
            $cmd.typedInput({
                default: 'z2m_cmd',
                typeField: that.getDeviceCommandTypeInput()
            });
        } else {
            // 🔥 OTIMIZAÇÃO: Se já existe, garantir que está visível e limpo
            $cmd.typedInput('show');
        }
 
        // ══════════════════════════════════════════════════════════════════════════
        // INJETAR TIPOS (Isto atualiza a droplist instantaneamente)
        // ══════════════════════════════════════════════════════════════════════════
        
        // ══════════════════════════════════════════════════════════════════════════
        // CONSTRUIR TYPES
        // ══════════════════════════════════════════════════════════════════════════
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

        // ══════════════════════════════════════════════════════════════════════════
        // PASSO 2: GARANTIR ESTADO LIMPO DO DOM
        // ══════════════════════════════════════════════════════════════════════════
        
        if (!$cmd.parent().hasClass('red-ui-typedInput-container')) {
            $cmd.val('');
            $('#node-input-commandType').val('z2m_cmd');
        }
        
        // PASSO 3: Injetar a nova lista e definir valores
        try {
            // Atualizar a lista de opções (droplist)
            $cmd.typedInput('types', commandTypes);
            
            // Forçar o valor e o tipo correto
            $cmd.typedInput('type', currentType);
            $cmd.typedInput('value', currentValue);
            
            // Sincronizar Cache
            that._lastBuiltCommand = currentValue;
            that._lastBuiltDevice = that.device_id;
            
            that.debug.log('|     ✅ Command droplist updated:', currentType, '/', currentValue);
            
            // Definir valores (Garante que a nova lista assume o valor correto)
            $cmd.typedInput('type', currentType);
            $cmd.typedInput('value', currentValue);
            
            // Sincronizar Node e Cache
            that.node.commandType = currentType;
            that.node.command = currentValue;
            that._lastBuiltCommand = currentValue;
            that._lastBuiltDevice = that.device_id;
            
            that.debug.log('|     ✅ Command update complete:', currentType, '/', currentValue);
            
        } catch(e) {
            that.debug.error('|     ❌ Command sync failed:', e.message);
        }
        
        // ══════════════════════════════════════════════════════════════════════════
        // 🔥 DEFINIR TYPE E VALUE
        // ══════════════════════════════════════════════════════════════════════════
        that.debug.log('|     🎯 Setting type and value...');
        
        try {
            $cmd.typedInput('type', currentType);
            that.debug.log('|        - type set:', currentType);
            
            $cmd.typedInput('value', currentValue);
            that.debug.log('|        - value set:', currentValue);
            
            // Verificar
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const finalType = $cmd.typedInput('type');
            let finalValue = $cmd.typedInput('value');
            
            if (finalValue && typeof finalValue === 'object' && finalValue.value) {
                finalValue = finalValue.value;
            }
            
            that.debug.log('|     📊 Verification:');
            that.debug.log('|        - Expected:', currentType, '/', currentValue);
            that.debug.log('|        - Got:', finalType, '/', finalValue);
            
            if (finalValue === currentValue) {
                that.debug.log('|     ✅ Values match!');
            } else {
                that.debug.warn('|     ⚠️  Value mismatch!');
            }
            
        } catch(e) {
            that.debug.error('|     ❌ Error setting values:', e.message);
        }

        // ══════════════════════════════════════════════════════════════════════════
        // 🔥 GRAVAR NO NODE + CACHE
        // ══════════════════════════════════════════════════════════════════════════
        that.node.commandType = currentType;
        that.node.command = currentValue;
        that._lastBuiltCommand = currentValue;
        that._lastBuiltDevice = that.device_id;
        
        // 🔓 Libertar bloqueio com delay maior (150ms) para garantir silêncio no Ingress
        setTimeout(() => { 
            that._isUpdatingInternally = false; 
            that.initializing = false;
            that.debug.log('|     🔓 System unlocked');
        }, 150);
        
        that.debug.log('');
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ ✅ [buildDeviceCommandInput] COMPLETE (v4.1)              ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
    }
    /**
     * Constrói TypedInput para payload (valores a enviar)
     * @returns {Promise<void>}
     */
    async buildDevicePayloadInput() {
        let that = this;
        const $payloadInput = that.getDevicePayloadInput();
        
        if (!$payloadInput) return;
        
        $payloadInput.closest('.form-row').toggle(!that.isMultiple());
        if (that.isMultiple()) return;

        const hasCommands = that.deviceHasCommands();
        
        if (!hasCommands) {
            $payloadInput.closest('.form-row').hide();
            that.node.payloadType = 'nothing';
            that.node.payload = '';
            return;
        }
        
        $payloadInput.closest('.form-row').show();

        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🚀 [buildDevicePayloadInput] OPTIMIZED                   ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        // ================================================================
        // PASSO 1: LER COMANDO (sem wait se possível)
        // ================================================================
        const $cmdInput = that.getDeviceCommandInput();
        
        let currentCommand = '';
        let currentCommandType = 'z2m_cmd';
        
        // 🚀 OTIMIZAÇÃO: Tentar ler direto, sem wait
        try {
            if ($cmdInput && $cmdInput.length && $cmdInput.data('typedInput')) {
                currentCommandType = $cmdInput.typedInput('type');
                let cmdValue = $cmdInput.typedInput('value');
                
                if (cmdValue && typeof cmdValue === 'object' && cmdValue.value) {
                    cmdValue = cmdValue.value;
                }
                
                currentCommand = cmdValue || '';
                that.debug.log('|     📖 Read from Widget:', currentCommandType, '/', currentCommand);
            }
        } catch(e) {
            that.debug.warn('|     ⚠️ Widget read failed:', e.message);
        }
        
        // Fallback para node
        if (!currentCommand && that.node.command) {
            currentCommand = that.node.command;
            currentCommandType = that.node.commandType || 'z2m_cmd';
            that.debug.log('|     📖 Fallback to node:', currentCommandType, '/', currentCommand);
        }
        
        that.debug.log('|     🎯 Command:', currentCommandType, '/', currentCommand);

        // ================================================================
        // PASSO 2: GERAR LISTA DE OPÇÕES
        // ================================================================
        let z2mPayloadOptions = [];
        const device = that.getDevice();
        const config = window.Z2MConfig;
        
        if (currentCommandType === 'z2m_cmd' && currentCommand) {
            const droplistFromConfig = config?.getPayloadDroplist(currentCommand);
            
            if (config?.isToggleable(currentCommand) || config?.matchesPattern(currentCommand, 'state')) {
                z2mPayloadOptions = [
                    { value: 'ON', label: 'ON' },
                    { value: 'OFF', label: 'OFF' }
                ];
                if (config?.isToggleable(currentCommand)) {
                    z2mPayloadOptions.push({ value: 'TOGGLE', label: 'TOGGLE' });
                }
            }
            else if (droplistFromConfig) {
                z2mPayloadOptions = [...droplistFromConfig];
            } 
            else if (device?.definition?.exposes) {
                const findExpose = (exposes) => {
                    for (let expose of exposes) {
                        if (expose.property === currentCommand) return expose;
                        if (expose.features) {
                            const found = findExpose(expose.features);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const foundExpose = findExpose(device.definition.exposes);

                if (foundExpose) {
                    if (foundExpose.values && Array.isArray(foundExpose.values)) {
                        foundExpose.values.forEach(value => {
                            z2mPayloadOptions.push({
                                value: value,
                                label: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
                            });
                        });
                    }
                    else if (foundExpose.type === 'binary') {
                        let valueOn = foundExpose.value_on || 'ON';
                        let valueOff = foundExpose.value_off || 'OFF';
                        
                        z2mPayloadOptions.push(
                            { value: String(valueOn), label: String(valueOn).toUpperCase() },
                            { value: String(valueOff), label: String(valueOff).toUpperCase() }
                        );
                        
                        if (config?.isToggleable(currentCommand)) {
                            z2mPayloadOptions.push({ value: 'TOGGLE', label: 'Toggle' });
                        }
                    }
                    else if ('value_min' in foundExpose && 'value_max' in foundExpose) {
                        const min = foundExpose.value_min;
                        const max = foundExpose.value_max;
                        
                        for (let i = 0; i < 5; i++) {
                            const val = min + (max - min) * i / 4;
                            let formatted, label;
                            
                            if (max <= 1) {
                                formatted = val.toFixed(3);
                                label = `${formatted} (${Math.round(val * 100)}%)`;
                            } else {
                                formatted = Math.round(val);
                                label = `${formatted} (${Math.round((val - min) / (max - min) * 100)}%)`;
                            }
                            
                            z2mPayloadOptions.push({
                                value: formatted.toString(),
                                label: label
                            });
                        }
                    }
                }
            }
        }
        
        that.debug.log('|     📊 Options generated:', z2mPayloadOptions.length);

        // ================================================================
        // PASSO 3: DETERMINAR VALOR INICIAL
        // ================================================================
        let currentType = 'z2m_payload';
        let currentValue = null;
        
        const uiConfig = config?.getComplexInputConfig(currentCommand);
        const isComplexUI = !!uiConfig && currentCommandType === 'z2m_cmd';
        const isNumeric = (currentCommandType === 'z2m_cmd' && currentCommand)
            ? (config?.isNumericCommand(currentCommand) || false) : false;
        
         // ✅ PLATINUM FIX: Se o comando for o mesmo guardado, usar o payload que o utilizador salvou
        if (that.node.command === currentCommand && that.node.payload !== undefined && that.node.payload !== ' ' && that.node.payload !== '') {
            currentValue = that.node.payload;
            currentType = that.node.payloadType || 'z2m_payload';
            that.debug.log('|     💾 Using SAVED payload from node:', currentType, '/', currentValue);
        }
        else if (isComplexUI) {
            currentType = 'z2m_payload';
            if (uiConfig.type === 'color-picker') {
                currentValue = '#FFFFFF'; // Valor inicial padrão para hex
            } else if (uiConfig.parts) {
                currentValue = uiConfig.parts
                    .map(p => p.defaultValue !== undefined ? p.defaultValue : (p.min || 0))
                    .join(uiConfig.separator || ',');
            }
        } 
        else if (device?.current_values && currentCommand in device.current_values) {
            const cachedValue = device.current_values[currentCommand];
            if (cachedValue !== null && cachedValue !== undefined) {
                currentValue = String(cachedValue);
                currentType = 'z2m_payload';
            }
        }
        
        if (!currentValue && z2mPayloadOptions.length > 0) {
            currentValue = z2mPayloadOptions[0].value;
            currentType = 'z2m_payload';
        }
        
        if (!currentValue && isNumeric) {
            currentValue = '0';
            currentType = 'z2m_payload';
        }
        
        if (!currentValue) {
            currentValue = 'payload';
            currentType = 'msg';
        }
        
        that.debug.log('|     🎯 Initial value:', currentType, '/', currentValue);


        // ════════════════════════════════════════════════════════════════════════════
        // 🆕 VERIFICAR QUE COMMAND ESTÁ OPERACIONAL
        // ════════════════════════════════════════════════════════════════════════════
        const $cmd = that.getDeviceCommandInput();
        if ($cmd && $cmd.length) {
            const hasWidget = !!($cmd.data('typedInput') || $cmd.data('red-ui-typedInput'));
            if (!hasWidget) {
                that.debug.warn('|     ⚠️ Command widget missing - attempting quick re-init');
                await that.buildDeviceCommandInput();
            }
        }
        // ================================================================
        // PASSO 4: 🚀 OTIMIZAÇÃO - NÃO DESTRUIR SE JÁ EXISTE
        // ================================================================        
        const payloadTypes = [];

        if (currentCommandType === 'homekit' || currentCommandType === 'nothing') {
            // Sem z2m_payload
        } 
        else if (z2mPayloadOptions.length > 0) {
            // ✅ Injetar label manual se o valor inicial (cache/node) não estiver na lista
            if (currentValue !== null && currentType === 'z2m_payload') {
                const exists = z2mPayloadOptions.some(opt => String(opt.value) === String(currentValue));
                 if (!exists && currentValue !== '') {
                    z2mPayloadOptions.unshift({ value: String(currentValue), label: `Manual (${currentValue})` });
                }
            }
            payloadTypes.push({
                value: 'z2m_payload',
                label: 'zigbee2mqtt',
                icon: 'icons/node-red-contrib-zigbee2mqtt/icon.png',
                options: z2mPayloadOptions
            });
        }
        else if (isComplexUI || isNumeric) {
            payloadTypes.push({
                value: 'z2m_payload',
                label: 'zigbee2mqtt',
                icon: 'icons/node-red-contrib-zigbee2mqtt/icon.png'
            });
        }
        
        that.currentPayloadTypes = payloadTypes;
        payloadTypes.push('str', 'msg', 'flow', 'global', 'num', 'json');

        try {
            const defaultType = (z2mPayloadOptions.length > 0 || isComplexUI) ? 'z2m_payload' : 'str';
            const finalType = isComplexUI ? 'z2m_payload' : currentType;

            // 🔥 CRITICAL: Bloquear disparos de eventos durante o rebuild do payload
            that._isUpdatingInternally = true;
 
            const hasTypedInput = !!($payloadInput.data('typedInput') || $payloadInput.data('red-ui-typedInput'));
            
            if (!hasTypedInput) {
                // Primeira vez - criar
                that.debug.log('|     🆕 Creating TypedInput (first time)');
                
                $payloadInput.typedInput({
                    default: defaultType,
                    value: currentValue,
                    typeField: that.getDevicePayloadTypeInput(),
                });
            } else {
                // Já existe - apenas atualizar (MUITO MAIS RÁPIDO!)
                that.debug.log('|     ⚡ Updating existing TypedInput (fast path)');
            }
            
            // Atualizar tipos e valor
            $payloadInput.typedInput('types', payloadTypes);
            $payloadInput.typedInput('type', finalType);
            $payloadInput.typedInput('value', currentValue);
            
            // Gravar no NODE
            that.node.payloadType = finalType;
            that.node.payload = currentValue;
            
            that.debug.log('|     💾 Saved to node:', finalType, '/', currentValue);
            
            // Aplicar bloqueio HTML se necessário
            if (isComplexUI && z2mPayloadOptions.length === 0) {
                const $visibleInput = $payloadInput.parent().find('input.red-ui-typedInput-input');
                $visibleInput.prop('readOnly', true);
                $visibleInput.css({'background-color': '#f3f3f3', 'cursor': 'not-allowed', 'opacity': '0.8'});
            }
            
            // 🚀 OTIMIZAÇÃO: Timeout reduzido 500ms → 100ms
            // E apenas se for PRIMEIRA VEZ
            if (!hasTypedInput) {
                await that.waitForTypedInputReady($payloadInput, 100);
            }
            
        } catch(e) {
            that.debug.error('|     ❌ Error:', e.message);
        } finally {
            // 🔓 Libertar o bloqueio apenas após o stack de eventos limpar
            setTimeout(() => { that._isUpdatingInternally = false; }, 100);
        }

        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🚀 [buildDevicePayloadInput] COMPLETE                    ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
    }
    /**
     * Constrói TypedInput para opções (ex: transition time)
     * @returns {Promise<void>}
     */
    async buildDeviceOptionsInput() {
        let that = this;
        
        that.debug.log(' ');
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🏁 [buildDeviceOptionsInput] STARTING                     ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        if (!that.getDeviceOptionsInput()) {
            that.debug.log('|     ⚠️ [buildDeviceOptionsInput] Options input not found - skipping');
            return Promise.resolve();  // ✅ Retornar Promise
        }
        
        that.getDeviceOptionsTypeHelpBlock().hide().find('div').text('').closest('.form-tips').find('span').text('');
        that.getDeviceOptionsInput().closest('.form-row').toggle(!that.isMultiple());
        
        if (that.isMultiple()) {
            that.debug.log('|     ⚠️ [buildDeviceOptionsInput] Multiple mode - skipping');
            return Promise.resolve();  // ✅ Retornar Promise
        }

        that.debug.log('|     BUILD buildDeviceOptionsInput');
        
        const hasCommands = that.deviceHasCommands();
        that.debug.log('|     [buildDeviceOptionsInput] Device has commands:', hasCommands);
        
        if (!hasCommands) {
            that.debug.log('|     [buildDeviceOptionsInput] No commands found - hiding options row');
            that.getDeviceOptionsInput().closest('.form-row').hide();
            that.getDeviceOptionsTypeHelpBlock().hide();
            
            try {
                if (that.getDeviceOptionsInput().length && that.getDeviceOptionsInput().data('typedInput')) {
                    that.getDeviceOptionsInput().typedInput('destroy');
                }
            } catch(e) {
                that.debug.warn('|     [buildDeviceOptionsInput] Error destroying typedInput:', e);
            }
            
            try {
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
            } catch(e) {
                that.debug.warn('|     [buildDeviceOptionsInput] Error setting up typedInput:', e);
            }
            
            that.debug.log('|     ✅ [buildDeviceOptionsInput] Done (no commands)');
            return Promise.resolve();  // ✅ Retornar Promise
        }
        
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
        
        try {
            that.getDeviceOptionsInput().typedInput({
                default: 'nothing',
                value: that.optionsType,
                typeField: that.getDeviceOptionsTypeInput(),
            });
            that.getDeviceOptionsInput().typedInput('types', options);
            that.getDeviceOptionsInput().typedInput('type', that.optionsType || 'nothing');
            that.getDeviceOptionsInput().typedInput('value', that.optionsValue || '');
        } catch(e) {
            that.debug.error('|     [buildDeviceOptionsInput] Error setting up typedInput:', e);
        }
        
        that.buildDeviceOptionsHelpBlock();
        
        that.debug.log('|     ✅ [buildDeviceOptionsInput] Done (with commands)');
        
        
        that.debug.log(' ');
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🏁 [buildDeviceOptionsInput] COMPLETE                     ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
        return Promise.resolve();  // ✅ Retornar Promise
    }
    /**
     * Constrói bloco de ajuda para opções
     */
    buildDeviceOptionsHelpBlock() {
        let that = this;
        if (!that.getDeviceOptionsTypeHelpBlock()) return;

        that.getDeviceOptionsTypeHelpBlock().hide().find('div').text('').closest('.form-tips').find('span').text('');
        if (that.isMultiple()) return;

        that.debug.log(' ');
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🏁 [buildDeviceOptionsHelpBlock] STARTING                 ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
        
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
            // PLATINUM FIX: Use safe text setting
            const $block = that.getDeviceOptionsTypeHelpBlock();
            $block.show();
            $block.find('div').text(selectedOption.name);
            $block.closest('.form-tips').find('span').text(selectedOption.description);
        }
        
        that.debug.log(' ');
        that.debug.log('╔═══════════════════════════════════════════════════════════╗');
        that.debug.log('║ 🏁 [buildDeviceOptionsHelpBlock] COMPLETE                 ║');
        that.debug.log('╚═══════════════════════════════════════════════════════════╝');
    }
    // ═══════════════════════════════════════════════════════════════════════
    // 🎚️ SLIDER MANAGEMENT - Gestão do Slider Manual
    // ═══════════════════════════════════════════════════════════════════════
    validateMinMax(cmd, value) {
        let that = this;
        
        // ✅ Usar Z2MConfig.getDetectionPair()
        if (!window.Z2MConfig || typeof Z2MConfig.getDetectionPair !== 'function') {
            that.debug.warn('[validateMinMax] Z2MConfig not available');
            return true;
        }
        
        const pairInfo = Z2MConfig.getDetectionPair(cmd);
        
        if (!pairInfo) {
            return true; // Não é um comando pareado
        }
        
        const isMin = cmd.includes('_min');
        
        // Buscar valor do par no device
        const device = that.getDevice();
        if (!device || !device.definition || !device.definition.exposes) {
            return true;
        }
        
        const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
        const exposes = flatten(device.definition.exposes);
        
        let pairValue = null;
        const pairCmd = isMin ? pairInfo.max : pairInfo.min;
        const pairExpose = exposes.find(e => e.property === pairCmd);
        
        if (pairExpose && device.current_values && pairCmd in device.current_values) {
            pairValue = device.current_values[pairCmd];
        }
        
        // Validar
        if (isMin && pairValue !== null && value >= pairValue) {
            RED.notify(
                'Min ' + pairInfo.unit + ' must be less than max ' + pairInfo.unit + ' (' + pairValue + ')',
                'warning'
            );
            return false;
        }
        
        if (!isMin && pairValue !== null && value <= pairValue) {
            RED.notify(
                'Max ' + pairInfo.unit + ' must be greater than min ' + pairInfo.unit + ' (' + pairValue + ')',
                'warning'
            );
            return false;
        }
        
        return true;
    }
    /**
     * Verifica se comando aceita input manual (slider)
     * @returns {boolean}
     */
    commandSupportsManualInput() {
        let that = this;
        
        that.debug.log('🔍 [commandSupportsManualInput] Checking...');
        
        if (!that.deviceHasCommands()) {
            that.debug.log('|       ❌ No device commands available - returning false');
            return false;
        }
        
        let cmd = null;
        let cmdType = 'z2m_cmd';
        
        // Ler do node
        if (that.node && that.node.command) {
            cmd = that.node.command;
            cmdType = that.node.commandType || 'z2m_cmd';
            that.debug.log('|       ✅ Using node.command:', cmd);
        }
        
        // Fallback: TypedInput
        if (!cmd || cmd === '') {
            const $cmd = that.getDeviceCommandInput();
            
            if ($cmd && $cmd.length && $cmd.data('typedInput')) {
                try {
                    cmdType = $cmd.typedInput('type');
                    let cmdValue = $cmd.typedInput('value');
                    
                    if (cmdValue && typeof cmdValue === 'object' && cmdValue.value) {
                        cmdValue = cmdValue.value;
                    }
                    
                    cmd = cmdValue;
                    that.debug.log('  ✅ Using TypedInput:', cmd);
                } catch(e) {
                    that.debug.warn('|       ⚠️ TypedInput read error:', e.message);
                }
            }
        }
        
        if (!cmd || cmd === '') {
            that.debug.log('|       ❌ No command found - returning false');
            return false;
        }
        
        // ❌ Tipos que NUNCA têm slider
        if (cmdType === 'homekit' || cmdType === 'nothing') {
            that.debug.log('|       ❌ Type is', cmdType, '- no slider');
            return false;
        }
        
        // ✅ Usar Z2MConfig.isNumericCommand()
        if (window.Z2MConfig && typeof Z2MConfig.isNumericCommand === 'function') {
            const isNumeric = Z2MConfig.isNumericCommand(cmd);
            that.debug.log(isNumeric ? '  ✅ Command supports slider:' : '  ❌ Command does NOT support slider:', cmd);
            return Z2MConfig.isNumericCommand(cmd);
        }
        
        // Fallback: verificar device exposes
        that.debug.warn('|       ⚠️ Z2MConfig not available - checking device exposes');
        
        const device = that.getDevice();
        if (device && device.definition && device.definition.exposes) {
            const flatten = arr => arr.flatMap(e => e.features ? flatten(e.features) : [e]);
            const exposes = flatten(device.definition.exposes);
            
            const expose = exposes.find(e => e.property === cmd);
            if (expose && 'value_min' in expose && 'value_max' in expose) {
                that.debug.log('|       ✅ Command supports slider (numeric range):', cmd);
                return true;
            }
        }
        
        that.debug.log('|       ❌ Command does NOT support slider:', cmd);
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔍 VALIDATION & CHECKS - Validações e Verificações
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * Verifica se access permite SET (escrita) - bit 2
     * @param {number} access - Valor do campo access (bitwise)
     * @returns {boolean}
     */
    hasSetAccess(access) {
        // Verificar se o bit SET (2) está ativo usando bitwise AND
        // Se (access & 2) > 0, então tem permissão de escrita
        return (access & 2) > 0;
    }
    /**
     * Verifica se access permite PUBLISH (leitura) - bit 1
     * @param {number} access - Valor do campo access (bitwise)
     * @returns {boolean}
     */
    hasPublishAccess(access) {
        // Verificar se o bit PUBLISH (1) está ativo usando bitwise AND
        // Se (access & 1) > 0, então device publica dados (leitura)
        return (access & 1) > 0;
    }
    /**
     * Verifica se device SELECIONADO tem comandos (propriedades com SET)
     * @returns {boolean}
     */
    deviceHasCommands() {
        let that = this;
        let device = that.getDevice();
        
        that.debug.log('🔵 [deviceHasCommands] Checking...');
        
        if (!device) {
            that.debug.log('⚠️ [deviceHasCommands] No device selected');
            return false;
        }
        
        if (!('definition' in device) || !device.definition) {
            that.debug.log('⚠️ [deviceHasCommands] No device.definition');
            return false;
        }
        
        if (!('exposes' in device.definition)) {
            that.debug.log('⚠️ [deviceHasCommands] No device.definition.exposes');
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
        
        that.debug.log('✅ [deviceHasCommands] Result:', hasWritableExposes);
        return hasWritableExposes;
    }
    /**
     * Verifica se um device ESPECÍFICO tem comandos
     * @param {Object} device - Device a verificar
     * @returns {boolean}
     */
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
                            this.debug.log(`❌ [${device.friendly_name}][${feature.property}] access=${feature.access} â†’ CAN SET`);
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
    /**
     * Verifica se um device ESPECÍFICO tem exposes legíveis
     * @param {Object} device - Device a verificar
     * @returns {boolean}
     */
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
    // ============================================================================
    // 🎨 DYNAMIC UI ENGINE - Sliders e Color Pickers (SUBSTITUI LOGICA ANTIGA)
    // ============================================================================
    /**
     * Inicializa a UI Dinâmica (Sliders/Pickers) ligada ao Checkbox
     */
    initDynamicUI() {
        let that = this;
        if (that.config.mode !== 'out') return;
 
        const $trigger = that.getSliderVisibilityContainer();
        const $checkbox = that.getSliderVisibilityCheckbox();
        const $mainContainer = that.getManualControlsContainer();
        const $payloadInput = that.getDevicePayloadInput();
        const $cmdInput = that.getDeviceCommandInput();
 
        if (!$payloadInput) return;
 
        // 🔍 LEITURA DINÂMICA: Sempre ler da UI para refletir mudanças sem gravar no nó
        let cmd = that.node.command;
        let currentType = that.node.payloadType;
        
        try {
            // Detetar se o widget está presente com qualquer uma das chaves possíveis
            const hasCmdWidget = !!($cmdInput.data('typedInput') || $cmdInput.data('red-ui-typedInput'));
            const hasPayWidget = !!($payloadInput.data('typedInput') || $payloadInput.data('red-ui-typedInput'));
 
            if (hasCmdWidget) {
                const val = $cmdInput.typedInput('value');
                // Se for objeto (comum no NR), extraímos o valor real do comando
                cmd = (val && typeof val === 'object' && val.value !== undefined) ? val.value : val;
            }
            if (hasPayWidget) {
                currentType = $payloadInput.typedInput('type');
            }
        } catch(e) {
            that.debug.warn('initDynamicUI: Widget read failed, using node defaults', e);
        }
 
        const uiConfig = window.Z2MConfig?.getComplexInputConfig(cmd);
        // Verificar se o comando é numérico via pattern se não houver complex config
        const isNumeric = window.Z2MConfig?.isNumericCommand(cmd);
        const shouldShow = (!!uiConfig || isNumeric) && currentType === 'z2m_payload';
 
        that.debug.log('🎨 [initDynamicUI] cmd:', cmd, 'type:', currentType, 'shouldShow:', shouldShow);
 
        if (!shouldShow) {
            $trigger?.hide();
            $mainContainer?.hide();
            that.getManualSlidersWrapper().empty().hide();
            that.getManualInputsWrapper().empty();
            $payloadInput.parent().find('input.red-ui-typedInput-input').prop('readOnly', false).css('opacity', '1');
            return;
        }
 
        $trigger.show();
        $mainContainer.show();
        
        // ✅ Renderizar e Sincronizar passando o valor atual (node ou widget)
        const currentVal = that.node.payload; 
        that.renderDynamicUI(uiConfig, that.getManualInputsWrapper(), that.getManualSlidersWrapper(), currentVal);
        
        // Restaurar estado do checkbox de visibilidade
        const isVisible = that.node.manualPayloadSliderVisible !== false;
        $checkbox.prop('checked', isVisible);
        that.getManualSlidersWrapper().toggle(isVisible && uiConfig.type !== 'color-picker');
    }
    /**
     * Desenha os controlos HTML baseados na configuração
     */
    renderDynamicUI(config, $inputsContainer, $slidersContainer) {
        let that = this;
        $inputsContainer.empty();
        $slidersContainer.empty();
        
        // Estilo visual da borda esquerda (apenas no wrapper dos sliders para ficar bonito)
        $slidersContainer.css('border-left-color', config.type === 'color-picker' ? '#E91E63' : '#2196F3');

        if (config.type === 'slider' || config.type === 'multi-slider') {
            that.renderSliders(config, $inputsContainer, $slidersContainer);
        } else if (config.type === 'color-picker') {
            that.renderColorPicker(config, $inputsContainer); // Color picker fica só num container
            $slidersContainer.hide(); // Esconde o wrapper de sliders se for color picker
        } else {
            $slidersContainer.show();
        }
        
        // Sincronizar valores iniciais
        that.syncUIFromPayload(config);
    }
    /**
     * Gera 1 ou N sliders (ex: RGB gera 3)
     */
     renderSliders(config, $inputsContainer, $slidersContainer) {
        let that = this;
        let htmlInputsContent = '';
        let htmlSliders = '';
        
        // Área de Preview (fica junto aos Sliders)
        if (config.preview) {
            htmlSliders += `<div id="z2m-color-preview" style="height: 25px; border-radius: 4px; margin-bottom: 10px; border: 1px solid #ccc; background: #ddd; transition: background 0.2s;"></div>`;
        }

        config.parts.forEach((part, index) => {
            const rowId = `z2m-slider-${index}`;
            
            // ✅ Determinar valor por defeito (min ou 0)
            const initialVal = part.defaultValue !== undefined ? part.defaultValue : (part.min || 0);
            
            // --- PARTE A: CAIXA DE VALOR (INPUT) ---
            htmlInputsContent += `
                <div style="display: flex; align-items: center; background: transparent; border: none; padding: 0; margin-right: 12px;">
                    <span style="font-size: 12px; font-weight: bold; color: #333; margin-right: 8px;">${config.parts.length > 1 ? part.label + ':' : ''}</span>
                    <input type="number" id="${rowId}-input" class="z2m-dynamic-input" data-index="${index}"
                           min="${part.min}" max="${part.max}" step="${part.step || 1}" value="${initialVal}"
                           style="width: 75px; height: 28px; border: none; border-bottom: 2px solid #ddd; font-size: 15px; font-weight: 500; text-align: center; outline: none; padding: 2px 0; background: transparent;">
                    <span style="font-size: 11px; color: #888; margin-left: 4px;">${part.unit || ''}</span>
                </div>
            `;

            // --- PARTE B: SLIDER (RANGE) ---
            // Sanitização básica para prevenir XSS se 'part.label' vier de fonte externa
            const safeLabel = String(part.label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            htmlSliders += `
                <div class="z2m-slider-row" style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 10px; font-weight: bold; color: #555; width: 60px; margin-right: 5px;">${safeLabel}</span>
                    <span style="font-size: 9px; color: #999; width: 30px; text-align: right; margin-right: 5px;">${part.minLabel || part.min}</span>
                
                    <input type="range" id="${rowId}-range" class="z2m-dynamic-slider" data-index="${index}"
                           min="${part.min}" max="${part.max}" step="${part.step || 1}" value="${initialVal}"
                           style="flex: 1; margin: 0; background: ${part.gradient || '#e0e0e0'}; height: 6px; border-radius: 3px; outline: none; -webkit-appearance: none; cursor: pointer;">
                    
                    <span style="font-size: 9px; color: #999; width: 30px; margin-left: 5px;">${part.maxLabel || part.max}</span>
                </div>
            `;
        });

        // Montar a estrutura form-row correta (Label à esquerda, Inputs à direita)
        const mainLabel = config.parts.length === 1 ? config.parts[0].label : 'Manual Adjust';
        const finalInputsHtml = `
            <label class="l-width"><i class="fa fa-sliders"></i> ${mainLabel}</label>
            <div style="display: inline-flex; width: 70%; align-items: center; flex-wrap: wrap;">
                ${htmlInputsContent}
            </div>
        `;

        $inputsContainer.html(finalInputsHtml);
        $slidersContainer.html(htmlSliders);

        // --- Event Listeners (Sincronização cruzada) ---

        // Slider mexe -> Atualiza Input (no outro container)
        $slidersContainer.find('.z2m-dynamic-slider').on('input', function() {
            const idx = $(this).data('index');
            $(`#z2m-slider-${idx}-input`).val($(this).val());
            that.gatherValuesAndSave(config);
        });

        // Input mexe -> Atualiza Slider (no outro container)
        $inputsContainer.find('.z2m-dynamic-input').on('input', function() {
            const idx = $(this).data('index');
            $(`#z2m-slider-${idx}-range`).val($(this).val());
            that.gatherValuesAndSave(config);
        });
    }
    
    /**
     * Renderizador específico para Color Picker Nativo (HTML5)
     */
    renderColorPicker(config, $container) {
            let that = this;
            const defaultColor = '#000000';
            const html = `
                <div style="display: flex; align-items: center;">
                    <label style="width: 100px; font-weight: bold; color: #555;">${config.label}</label>
                    <input type="color" id="z2m-native-picker" value="${defaultColor}" style="width: 50px; height: 30px; border: none; padding: 0; cursor: pointer; background: none;">
                    <span id="z2m-picker-value" style="margin-left: 15px; font-family: monospace; font-weight: bold; color: #555;">${defaultColor}</span>
                </div>`;
            $container.html(html);

            $('#z2m-native-picker').on('input', function() {
                $('#z2m-picker-value').text($(this).val().toUpperCase());
                that.gatherValuesAndSave(config);
            });
        }
    /**
     * Recolhe valores de TODOS os inputs e salva no Payload
     * (Ex: RGB recolhe 3 valores -> "100,50,200")
     */
    gatherValuesAndSave(config) {
        let that = this;
        let finalValue = '';

        if (config.type === 'color-picker') {
            finalValue = $('#z2m-native-picker').val();
            if (finalValue && finalValue.startsWith('#')) finalValue = finalValue.toUpperCase();
        }  else {
            let values = [];
            const $wrapper = that.getManualInputsWrapper();
            if ($wrapper) {
                $wrapper.find('input.z2m-dynamic-input').each(function() { values.push($(this).val()); });
            }
            finalValue = (config.type === 'multi-slider') ? values.join(config.separator || ',') : values[0];
        }
 
        const $payload = that.getDevicePayloadInput();
        const type = 'z2m_payload'; 
        if (finalValue && finalValue.startsWith('#')) finalValue = finalValue.toUpperCase();
        
        that._isUpdatingInternally = true; 
        try {
            if (that.currentPayloadTypes) {
                let z2mType = that.currentPayloadTypes.find(t => t.value === 'z2m_payload');
                if (z2mType && z2mType.options) {
                    const standardOptions = z2mType.options.filter(opt => !String(opt.label).startsWith('Manual ('));
                    // 🔥 FIX: Comparação case-insensitive para evitar adicionar múltiplos "Manual" da mesma cor
                    const isStandard = standardOptions.some(opt => String(opt.value).toUpperCase() === String(finalValue).toUpperCase());
                    const currentManual = z2mType.options.find(opt => String(opt.label).startsWith('Manual ('));
                    
                    if (!isStandard && finalValue !== '' && (!currentManual || currentManual.value !== String(finalValue))) {
                        z2mType.options = [{ value: String(finalValue), label: `Manual (${finalValue})` }, ...standardOptions];
                        $payload.typedInput('types', that.currentPayloadTypes);
                        // 🔥 CRITICAL: Re-setar o valor após mudar os types para o widget aceitar a nova opção
                        $payload.typedInput('value', finalValue);
                    } else if (isStandard && z2mType.options.length !== standardOptions.length) {
                        z2mType.options = standardOptions;
                        $payload.typedInput('types', that.currentPayloadTypes);
                        $payload.typedInput('value', finalValue);
                    }
                }
            }
            $payload.typedInput('value', finalValue);
            $payload.val(finalValue);
            that.node.payload = finalValue;
            that.node.payloadType = type;
        } catch (e) { 
            if (that.debug) that.debug.error('[Z2M] Manual sync failed:', e); 
        }
        
        setTimeout(() => { that._isUpdatingInternally = false; }, 100);    
    }
    
    /**
     * Lê o payload atual e atualiza os sliders
     * (Ex: "100,50,200" -> ajusta os 3 sliders RGB)
     */
    syncUIFromPayload(config, forcedValue = null) {
        let that = this;
        
        that.debug.log('🔄 [syncUIFromPayload] Starting...');
        
        const $payload = that.getDevicePayloadInput();
        
        // ✅ Prioridade ao valor forçado (vindo do evento/carregamento) para evitar race conditions
        let val = (forcedValue !== null) ? forcedValue : null;
        
        if (val === null) {
            if (!$payload || !$payload.length || !$payload.data('typedInput')) {
                return;
            }
            try {
                val = $payload.typedInput('value');
            } catch(e) { return; }
        }
        
        if (!val && val !== 0) {
            that.debug.log('|     ⚠️ Payload is empty - skipping');
            return;
        }
        
        // ✅ Validar se é número
        if (!/\d/.test(String(val)) && that.node.payloadType !== 'z2m_payload') {
            that.debug.log('|     ⚠️ Payload is not numeric - skipping');
            return;
        }
        
        that.debug.log('|     📖 Read payload:', val);

        // ════════════════════════════════════════════════════════════════
        // COLOR PICKER
        // ════════════════════════════════════════════════════════════════
        if (config.type === 'color-picker') {
            if (String(val).match(/^#[0-9A-F]{6}$/i)) {
                $('#z2m-native-picker').val(val);
                $('#z2m-picker-value').text(val.toUpperCase());
                that.debug.log('|     ✅ Color picker updated:', val);
            }
            return;
        }
        
        // ════════════════════════════════════════════════════════════════
        // SLIDERS (SINGLE ou MULTI)
        // ════════════════════════════════════════════════════════════════
        const separator = config.separator || ',';
        const parts = String(val).includes(separator) ? String(val).split(separator) : [val];
        
        that.debug.log('|     📊 Parts to sync:', parts.length);
        
        if (config.parts) {
            parts.forEach((v, index) => {
                const rangeId = `#z2m-slider-${index}-range`;
                const inputId = `#z2m-slider-${index}-input`;
                
                const $range = $(rangeId);
                const $input = $(inputId);
                
                if ($range.length && $input.length) {
                    $range.val(v);
                    $input.val(v);
                    that.debug.log(`|       ✅ Updated slider ${index}:`, v);
                }
            });
        }
        
        // ✅ Atualizar Preview (se RGB)
        if (config.preview === 'rgb' && parts.length === 3) {
            const $preview = $('#z2m-color-preview');
            if ($preview.length) {
                $preview.css('background', `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`);
                that.debug.log('|     ✅ RGB preview updated');
            }
        }
        
        that.debug.log('|     ✅ Sync complete');
    }
    // ═══════════════════════════════════════════════════════════════════════
    // 📊 DATA MANAGEMENT - Gestão de Dados
    // ═══════════════════════════════════════════════════════════════════════
    /**
     * Obtém lista de devices e groups do servidor
     * @returns {Promise<Array>} - [devices, groups]
     */
    async getDevices() {
        let that = this;
        const cacheKey = 'z2m_cache_' + that.getServerInput().val();
        
        // 1. Prioridade: Memória da instância atual
        if (that.devices !== null && !that.refresh) return that.devices;
 
        // 2. Fallback: LocalStorage do Browser (Instantâneo)
        if (!that.refresh) {
            try {
                const local = localStorage.getItem(cacheKey);
                if (local) {
                    that.devices = JSON.parse(local);
                    that.debug.log('⚡ UI Caching: Instant load from LocalStorage');
                    // Não fazemos return aqui para permitir que o fetch atualize os dados em background
                }
            } catch(e) {}
        }
 
        try {
            const response = await fetch('zigbee2mqtt/getDevices?' + new URLSearchParams({
                controllerID: that.getServerInput().val()
            }).toString(), {
                method: 'GET',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) throw new Error('API Offline');
            
            that.refresh = false;
            that.devices = await response.json();
            window.Z2M_DEVICES_CACHE = that.devices;
            return that.devices;
        } catch (err) {
            that.debug.warn('Using offline cache due to fetch error:', err.message);
            if (window.Z2M_DEVICES_CACHE) {
                that.devices = window.Z2M_DEVICES_CACHE;
                return that.devices;
            }
            return [[], []];
        }
    }

    /**
     * Obtém device atualmente selecionado
     * @returns {Object|null} - Device object ou null
     */
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
    /**
     * Define valor do device no dropdown
     */
    setDeviceValue() {
        let that = this;
        
        that.debug.log('🔧 [setDeviceValue] Starting...');
        that.debug.log('|       - initializing:', that.initializing);
        that.debug.log('|       - device_id:', that.device_id);
        that.debug.log('|       - isMultiple:', that.isMultiple());
        
        // ============================================================================
         // 🔥 FIX: SILENCIAR EVENTOS (v3.6 BREAK LOOP)
        // ============================================================================
        const $deviceInput = that.getDeviceIdInput();
        
        // Em vez de procurar referências complexas, usamos a flag 'initializing'
        // Mas para segurança extra, usamos o namespace .z2m definido no bind()
        that.debug.log('|       ⚠️ Suspending .z2m change events to prevent loop');
        const savedEvents = $._data($deviceInput[0], "events")?.change;
        $deviceInput.off('change.z2m');
        
        // ============================================================================
        // DEFINIR VALORES (sem disparar eventos)
        // ============================================================================
        if (that.isMultiple()) {
            if (typeof(that.device_id) == 'string') {
                that.device_id = [that.device_id];
            }
            if (that.device_id) {
                that.debug.log('|       - Setting multiple select:', that.device_id);
                $deviceInput.multipleSelect('setSelects', that.device_id);
                that.debug.log('|       ✅ Multiple select set (NO event fired)');
            }
        } else if (that.device_id && that.device_id.length) {
            if (typeof(that.device_id) == 'object') {
                that.device_id = that.device_id[0];
            }
            if ($deviceInput.find('option[value="'+that.device_id+'"]').length) {
                that.debug.log('|       - Setting value:', that.device_id);
                $deviceInput.val(that.device_id);
                that.debug.log('|       ✅ Value set (NO event fired yet)');
            }
            $deviceInput.multipleSelect('refresh');
            that.debug.log('|       ✅ Refreshed');
        } else {
            that.device_id = null;
            that.debug.log('|       - No device to set');
        }
        that.debug.log('|       ✅ setDeviceValue finished - events will be restored by bind()');
        
        that.debug.log('✅ [setDeviceValue] Complete');
    }
    /**
     * Atualiza campo de friendly name
     */
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
    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 GETTERS - Acesso a Elementos DOM
    // ═══════════════════════════════════════════════════════════════════════
	getDeviceIdInput() {                 // Dropdown de devices
        return $('#node-input-device_id');
    }
    getDevicePropertyInput() {           // Dropdown de propriedades
	        let $elem = $('#node-input-state');
        return $elem.length?$elem:null;
    }
    getDeviceCommandInput() {            // TypedInput de comando
	    let $elem = $('#node-input-command');
        return $elem.length ? $elem : null;
    }
    getDeviceCommandTypeInput() {        // Hidden input para tipo de comando
	    let $elem = $('#node-input-commandType');
        return $elem.length ? $elem : null;
    }
    getDeviceCommandListInput() {        // Select oculto com comandos do device
	   let $elem = $('#node-input-command-list');
        return $elem.length ? $elem : null;
    }
    getDevicePayloadInput() {            // TypedInput de payload
	    let $elem = $('#node-input-payload');
        return $elem.length ? $elem : null;
    }
    getDevicePayloadTypeInput() {        // Hidden input para tipo de payload
	let $elem = $('#node-input-payloadType');
        return $elem.length ? $elem : null;
    }
    getDeviceOptionsInput() {            // TypedInput de opções
        let $elem = $('#node-input-optionsValue');
        return $elem.length?$elem:null;
    }
    getDeviceOptionsTypeInput() {        // Hidden input para tipo de opções
		let $elem = $('#node-input-optionsType');
        return $elem.length?$elem:null;
    }
    getDeviceOptionsTypeHelpBlock() {    // Bloco de ajuda para opções
	   return $('.optionsType_description');
    }
    getDeviceFriendlyNameInput() {       // Campo de friendly name
	    return $('#node-input-friendly_name');
    }
    getServerInput() {                   // Dropdown de servidor
		return $('#node-input-server');
    }
    getRefreshBtn() {                    // Botão de refresh
	    return $('#force-refresh');
    }
    getFilterChanges() {                 // Checkbox de filtrar changes
        return $('#node-input-filterChanges');
    }
    getEnableMultipleCheckbox() {        // Checkbox de múltiplos devices
	    return $('#node-input-enableMultiple');
    }

 
    getManualControlsContainer() {       // Contentor principal (Z2M Main)
    /**
     * Contentor pai que agrupa inputs e sliders
     * Usado em: OUT node
     * @returns {jQuery|null} - Elemento ou null
     */
        const $elem = $('#z2m-manual-controls-container');
        if (!$elem.length && this.config.mode === 'out') {
            this.debug.warn('Manual controls container NOT FOUND');
        }
        return $elem.length ? $elem : null;
    }
    getManualSlidersWrapper() {          // Wrapper exclusivo dos Sliders
    /**
     * Área que contém as barras de arrasto (range inputs)
     * Usado em: OUT node
     * @returns {jQuery|null} - Elemento ou null
     */
        const $elem = $('#z2m-sliders-wrapper');
        if (!$elem.length && this.config.mode === 'out') {
            this.debug.warn('Manual sliders wrapper NOT FOUND');
        }
        return $elem.length ? $elem : null;
    }
    getManualInputsWrapper() {           // Wrapper exclusivo dos Inputs numéricos
    /**
     * Área que contém as caixas de texto com os valores
     * Usado em: OUT node
     * @returns {jQuery|null} - Elemento ou null
     */
        const $elem = $('#z2m-inputs-wrapper');
        if (!$elem.length && this.config.mode === 'out') {
            this.debug.warn('Manual inputs wrapper NOT FOUND');
        }
        return $elem.length ? $elem : null;
    }
    
    getSliderVisibilityContainer() {     // Container do checkbox de visibilidade do slider
    /**
     * Container do checkbox de visibilidade do slider
     * Usado em: OUT node
     * @returns {jQuery|null} - Elemento ou null
     */
        const $elem = $('#slider-visibility-inline');
        
        if (!$elem.length && this.config.mode === 'out') {
            this.debug.warn('Slider visibility container NOT FOUND');
        }
        
        return $elem.length ? $elem : null;
    }
    getSliderVisibilityCheckbox() {      // Checkbox de visibilidade do slider
        /**
         * Checkbox de visibilidade do slider
         * Usado em: OUT node
         * @returns {jQuery|null} - Elemento ou null
         */    
        const $elem = $('#node-input-manualPayloadSliderVisible');
        
        if (!$elem.length && this.config.mode === 'out') {
            this.debug.warn('Slider visibility checkbox NOT FOUND');
        }
        
        return $elem.length ? $elem : null;
    }
    getPayloadRow() {                    // Row principal do payload (com TypedInput + checkbox)
    /**
     * Row principal do payload (com TypedInput + checkbox)
     * Usado em: OUT node
     * @returns {jQuery|null} - Elemento ou null
     */
        const $elem = $('#payload-row');
        return $elem.length ? $elem : null;
    }
    // ═══════════════════════════════════════════════════════════════════════
    // 🛠️ UTILITIES - Funções Auxiliares
    // ═══════════════════════════════════════════════════════════════════════
    registerGlobalInstance() {
        let that = this;
        if (!window.Z2M_EDITOR_INSTANCES) window.Z2M_EDITOR_INSTANCES = [];
        window.Z2M_EDITOR_INSTANCES.push(this);
        that.debug.log('🔌 Z2M Editor instance registered globally');
    }
   
    /**
     * Verifica se está em modo múltiplo
     * @returns {boolean}
     */
    isMultiple() {
        const $cb = this.getEnableMultipleCheckbox();
        return $cb.length ? $cb.is(':checked') : false;
    }

}
    // ============================================================================
// 🌍 CRITICAL: EXPORTAR PARA GLOBAL SCOPE (FORA DA CLASSE!)
// ============================================================================
if (typeof window !== 'undefined') {
    window.Zigbee2MqttEditor = Zigbee2MqttEditor;
} else {
    console.error('❌ [Helpers] window is undefined - cannot export class!');
}
 
// Logs de carregamento protegidos pela biblioteca debug
const bootLog = Z2MDebug.create('Helpers');
bootLog.log('✅ Zigbee2MqttEditor class exported to window');
bootLog.log('╔═════════════════════════════════════════════════════════════╗');
bootLog.log('║ ✅ Z2M DEBUG TOOLS LOADED                                  ║');
bootLog.log('╚═════════════════════════════════════════════════════════════╝');
bootLog.log('Zigbee2MqttEditor class loaded ✔');

