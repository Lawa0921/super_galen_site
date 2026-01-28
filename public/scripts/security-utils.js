/**
 * 前端安全工具函數
 * 防止 XSS 攻擊和其他前端安全問題
 */

// HTML 轉義函數 - 防止 XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 安全的 innerHTML 替代函數
function safeSetHTML(element, htmlContent) {
    // 使用 DOMPurify 或簡單的轉義
    element.innerHTML = htmlContent.replace(/[<>'"&]/g, function(match) {
        switch (match) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#x27;';
            case '&': return '&amp;';
            default: return match;
        }
    });
}

// 安全的模板字符串函數
function safeTemplate(template, ...values) {
    const escapedValues = values.map(value =>
        typeof value === 'string' ? escapeHtml(value) : value
    );
    return template.replace(/%s/g, () => escapedValues.shift());
}

// 清理用戶輸入
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    // 移除危險字符
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .trim();
}

// 驗證 URL 安全性
function isValidUrl(url) {
    try {
        const parsedUrl = new URL(url);
        // 只允許 http/https 協議
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
}

// 安全的事件處理器添加
function safeAddEventListener(element, event, handler) {
    if (element && typeof handler === 'function') {
        element.addEventListener(event, handler);
    }
}

// 導出函數供其他模塊使用
if (typeof window !== 'undefined') {
    window.SecurityUtils = {
        escapeHtml,
        safeSetHTML,
        safeTemplate,
        sanitizeInput,
        isValidUrl,
        safeAddEventListener
    };
}

// Node.js 環境支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        safeSetHTML,
        safeTemplate,
        sanitizeInput,
        isValidUrl,
        safeAddEventListener
    };
}