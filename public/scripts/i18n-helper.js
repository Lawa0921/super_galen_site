/**
 * i18n 輔助函數
 * 提供多語系相關的工具函數
 */

(function() {
    'use strict';

    // 等待 i18n 管理器載入
    function waitForI18n() {
        return new Promise((resolve) => {
            const checkI18n = () => {
                if (window.i18n && window.i18n.translations && Object.keys(window.i18n.translations).length > 0) {
                    resolve();
                } else {
                    setTimeout(checkI18n, 100);
                }
            };
            checkI18n();
        });
    }

    // i18n 輔助類
    class I18nHelper {
        constructor() {
            this.ready = false;
            this.init();
        }

        async init() {
            await waitForI18n();
            this.ready = true;
            console.log('✅ i18n Helper 初始化完成');
        }

        // 顯示翻譯的 alert
        showAlert(messageKey, params = {}) {
            if (!window.i18n) {
                console.error('i18n 管理器未載入');
                alert(messageKey);
                return;
            }
            const message = window.i18n.t(messageKey, params);
            alert(message);
        }

        // 顯示翻譯的 confirm
        showConfirm(messageKey, params = {}) {
            if (!window.i18n) {
                console.error('i18n 管理器未載入');
                return false; // 安全起見，返回 false 而不是 confirm
            }
            const message = window.i18n.t(messageKey, params);
            // 如果翻譯失敗（返回 key 本身），也返回 false
            if (message === messageKey) {
                console.warn(`翻譯缺失，取消確認對話框: ${messageKey}`);
                return false;
            }
            return confirm(message);
        }

        // 顯示翻譯的 prompt
        showPrompt(messageKey, defaultValue = '', params = {}) {
            if (!window.i18n) {
                console.error('i18n 管理器未載入');
                return prompt(messageKey, defaultValue);
            }
            const message = window.i18n.t(messageKey, params);
            return prompt(message, defaultValue);
        }

        // 格式化數字（根據語言）
        formatNumber(number, decimals = 0) {
            const lang = window.i18n ? window.i18n.currentLang : 'zh-TW';
            const locale = this.getLocale(lang);
            return new Intl.NumberFormat(locale, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(number);
        }

        // 格式化貨幣
        formatCurrency(amount, currency = 'USD') {
            const lang = window.i18n ? window.i18n.currentLang : 'zh-TW';
            const locale = this.getLocale(lang);
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currency
            }).format(amount);
        }

        // 格式化日期
        formatDate(date, options = {}) {
            const lang = window.i18n ? window.i18n.currentLang : 'zh-TW';
            const locale = this.getLocale(lang);
            const defaultOptions = {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            return new Intl.DateTimeFormat(locale, {...defaultOptions, ...options}).format(date);
        }

        // 格式化時間
        formatTime(date, options = {}) {
            const lang = window.i18n ? window.i18n.currentLang : 'zh-TW';
            const locale = this.getLocale(lang);
            const defaultOptions = {
                hour: '2-digit',
                minute: '2-digit'
            };
            return new Intl.DateTimeFormat(locale, {...defaultOptions, ...options}).format(date);
        }

        // 取得對應的 locale
        getLocale(lang) {
            const localeMap = {
                'zh-TW': 'zh-TW',
                'zh-CN': 'zh-CN',
                'en': 'en-US',
                'ja': 'ja-JP',
                'ko': 'ko-KR'
            };
            return localeMap[lang] || 'en-US';
        }

        // 更新元素的文字內容
        updateElementText(element, key, params = {}) {
            if (!element || !window.i18n) return;
            element.textContent = window.i18n.t(key, params);
        }

        // 更新元素的 HTML 內容
        updateElementHTML(element, key, params = {}) {
            if (!element || !window.i18n) return;
            element.innerHTML = window.i18n.t(key, params);
        }

        // 更新元素的屬性
        updateElementAttribute(element, attribute, key, params = {}) {
            if (!element || !window.i18n) return;
            element.setAttribute(attribute, window.i18n.t(key, params));
        }

        // 批量更新元素
        updateElements(updates) {
            if (!window.i18n) return;

            updates.forEach(update => {
                const element = typeof update.element === 'string'
                    ? document.querySelector(update.element)
                    : update.element;

                if (!element) return;

                if (update.type === 'text') {
                    this.updateElementText(element, update.key, update.params);
                } else if (update.type === 'html') {
                    this.updateElementHTML(element, update.key, update.params);
                } else if (update.type === 'attribute') {
                    this.updateElementAttribute(element, update.attribute, update.key, update.params);
                }
            });
        }

        // 註冊語言變更回調
        onLanguageChange(callback) {
            if (window.i18n) {
                window.i18n.onLanguageChange(callback);
            }
        }
    }

    // 創建全局實例
    window.i18nHelper = new I18nHelper();

    // 提供簡便函數
    window.showAlert = (key, params) => window.i18nHelper.showAlert(key, params);
    window.showConfirm = (key, params) => window.i18nHelper.showConfirm(key, params);
    window.showPrompt = (key, defaultValue, params) => window.i18nHelper.showPrompt(key, defaultValue, params);
})();