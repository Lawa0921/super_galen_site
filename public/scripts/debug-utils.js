/**
 * 調試工具 - 生產環境安全的日誌系統
 */

// 檢測是否為開發環境
function isDevelopment() {
    // 檢查多個開發環境指標
    return (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '4000' ||
        window.location.search.includes('debug=true') ||
        localStorage.getItem('debug') === 'true'
    );
}

// 安全的 console.log 替代
function debugLog(...args) {
    if (isDevelopment()) {
        console.log('[DEBUG]', ...args);
    }
}

// 安全的 console.warn 替代
function debugWarn(...args) {
    if (isDevelopment()) {
        console.warn('[DEBUG-WARN]', ...args);
    }
}

// 安全的 console.error 替代（錯誤總是要記錄的）
function debugError(...args) {
    console.error('[ERROR]', ...args);
}

// 安全的 console.info 替代
function debugInfo(...args) {
    if (isDevelopment()) {
        console.info('[DEBUG-INFO]', ...args);
    }
}

// 性能測量工具
function debugTime(label) {
    if (isDevelopment()) {
        console.time(`[DEBUG-TIME] ${label}`);
    }
}

function debugTimeEnd(label) {
    if (isDevelopment()) {
        console.timeEnd(`[DEBUG-TIME] ${label}`);
    }
}

// 對象結構調試（防止敏感信息洩露）
function debugObject(obj, label = 'Object') {
    if (isDevelopment()) {
        console.group(`[DEBUG] ${label}`);
        console.log('Keys:', Object.keys(obj));
        console.log('Type:', typeof obj);
        console.log('Constructor:', obj.constructor?.name);
        console.groupEnd();
    }
}

// 導出函數
if (typeof window !== 'undefined') {
    window.DebugUtils = {
        isDevelopment,
        debugLog,
        debugWarn,
        debugError,
        debugInfo,
        debugTime,
        debugTimeEnd,
        debugObject
    };
}

// Node.js 環境支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isDevelopment,
        debugLog,
        debugWarn,
        debugError,
        debugInfo,
        debugTime,
        debugTimeEnd,
        debugObject
    };
}