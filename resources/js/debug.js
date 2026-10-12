/**
 * Sistema de Debug Centralizado para Zigbee2MQTT
 * 
 * Para usar tens de se abrir o frame do node-red
 *
 * Para ativar no console do browser:
 *   localStorage.setItem('z2m_debug', 'true')
 * 
 * Para desativar:
 *   localStorage.removeItem('z2m_debug')
 * 
 * Ativate debug:
 *		javascript
 *			//In console browser (F12)
 *					Z2MDebug.enable()
 *			// After refresh page
 *	Desativate debug:
 *					Z2MDebug.disable()
 *			// After refresh page
 *	See status:
 *					Z2MDebug.isEnabled()
 */
 
 /**
 * Sistema de Debug Centralizado para Zigbee2MQTT
 * 
 * Para ativar no console do browser:
 *   Z2MDebug.enable()
 * 
 * Para desativar:
 *   Z2MDebug.disable()
 */

(function(window) {
    'use strict';
    
    var DEBUG = localStorage.getItem('z2m_debug') === 'true';
    
    function createDebugger(prefix) {
        return {
            log: function() {
                if (DEBUG) console.log('[' + prefix + ']', ...arguments);
            },
            warn: function() {
                if (DEBUG) console.warn('[' + prefix + ']', ...arguments);
            },
            error: function() {
                console.error('[' + prefix + ' ERROR]', ...arguments);
            },
            info: function() {
                if (DEBUG) console.info('[' + prefix + ']', ...arguments);
            },
            group: function(label) {
                if (DEBUG) console.group('[' + prefix + '] ' + label);
            },
            groupEnd: function() {
                if (DEBUG) console.groupEnd();
            },
            table: function(data) {
                if (DEBUG) console.table(data);
            },
            isEnabled: function() {
                return DEBUG;
            }
        };
    }
    
    // Expor globalmente
    window.Z2MDebug = {
        create: createDebugger,
        isEnabled: function() { return DEBUG; },
        enable: function() {
            localStorage.setItem('z2m_debug', 'true');
            DEBUG = true;
            console.log('[Z2M] 🐛 Debug mode ENABLED - Reload page to take effect');
        },
        disable: function() {
            localStorage.removeItem('z2m_debug');
            DEBUG = false;
            console.log('[Z2M] Debug mode DISABLED - Reload page to take effect');
        }
    };
    
    // Log inicial
    if (DEBUG) {
        console.log('[Z2M] 🐛 Debug mode is ENABLED');
        console.log('[Z2M] To disable: Z2MDebug.disable() or localStorage.removeItem("z2m_debug")');
    }
    
    console.log('[Z2M] Debug system loaded successfully!');
    
})(window);
