// i18n 管理器 - 處理多語系功能
(function() {
    'use strict';

    // 支援的語言列表
    const supportedLanguages = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
    const defaultLanguage = 'zh-TW';

    // i18n 管理器類
    class I18nManager {
        constructor() {
            // 優先順序：URL 路徑 > localStorage > 瀏覽器語言 > 預設語言
            this.currentLang = this.getLangFromUrl() || this.getStoredLanguage() || this.detectBrowserLanguage() || defaultLanguage;
            this.translations = {};
            this.currentTranslations = null; // 新增：當前語言的翻譯內容
            this.loadedLanguages = new Set();
            this.changeCallbacks = [];
        }

        // 從 URL 路徑中提取語言（優先）
        getLangFromUrl() {
            const pathParts = window.location.pathname.split('/').filter(Boolean);
            if (pathParts.length > 0 && supportedLanguages.includes(pathParts[0])) {
                return pathParts[0];
            }
            return null;
        }

        // 取得儲存的語言偏好
        getStoredLanguage() {
            return localStorage.getItem('preferred-language');
        }

        // 儲存語言偏好
        setStoredLanguage(lang) {
            localStorage.setItem('preferred-language', lang);
        }

        // 偵測瀏覽器語言
        detectBrowserLanguage() {
            const browserLang = navigator.language || navigator.userLanguage;

            // 完全匹配
            if (supportedLanguages.includes(browserLang)) {
                return browserLang;
            }

            // 語言代碼匹配（例如 zh-HK 匹配到 zh-TW）
            const langCode = browserLang.split('-')[0];
            if (langCode === 'zh') {
                // 根據地區決定繁體或簡體
                const region = browserLang.split('-')[1];
                return ['CN', 'SG'].includes(region) ? 'zh-CN' : 'zh-TW';
            }

            // 尋找語言代碼匹配
            return supportedLanguages.find(lang => lang.startsWith(langCode));
        }

        // 載入語言檔案
        async loadLanguage(lang) {
            // 開發模式下總是重新載入（檢查是否有 Jekyll 開發伺服器的跡象）
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (isDev) {
                // 開發模式下強制重新載入，移除已載入標記和快取數據
                this.loadedLanguages.delete(lang);
                delete this.translations[lang];
            } else if (this.loadedLanguages.has(lang)) {
                return this.translations[lang];
            }

            try {
                // 加上時間戳避免快取
                const timestamp = new Date().getTime();
                const response = await fetch(`/assets/i18n/${lang}.json?t=${timestamp}`);
                if (!response.ok) {
                    throw new Error(`Failed to load language: ${lang}`);
                }

                const data = await response.json();
                this.translations[lang] = data;
                this.loadedLanguages.add(lang);

                // 如果載入的是當前語言，則更新 currentTranslations
                if (lang === this.currentLang) {
                    this.currentTranslations = data;
                }

                return data;
            } catch (error) {
                console.error(`Error loading language ${lang}:`, error);
                // 如果載入失敗，嘗試載入預設語言
                if (lang !== defaultLanguage) {
                    return this.loadLanguage(defaultLanguage);
                }
                return null;
            }
        }

        // 取得翻譯文字
        t(key, params = {}) {
            // 資料驗證：拒絕無效的 key
            if (!key || typeof key !== 'string' || key.trim() === '') {
                console.error('[i18n] Invalid translation key:', key);
                return '';
            }

            const keys = key.split('.');
            let value = this.translations[this.currentLang];

            for (const k of keys) {
                if (value && typeof value === 'object') {
                    value = value[k];
                } else {
                    // 如果找不到，嘗試使用預設語言
                    value = this.getDefaultTranslation(key);
                    break;
                }
            }

            // 如果還是找不到，返回 key
            if (!value) {
                console.warn(`Translation not found for key: ${key}`);
                return key;
            }

            // 替換參數
            if (typeof value === 'string') {
                Object.keys(params).forEach(param => {
                    value = value.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
                });
            }

            return value;
        }

        // 取得預設語言翻譯
        getDefaultTranslation(key) {
            const keys = key.split('.');
            let value = this.translations[defaultLanguage];

            for (const k of keys) {
                if (value && typeof value === 'object') {
                    value = value[k];
                } else {
                    return null;
                }
            }

            return value;
        }

        // 切換語言
        async switchLanguage(lang) {
            if (!supportedLanguages.includes(lang)) {
                console.error(`Unsupported language: ${lang}`);
                return false;
            }

            // 載入新語言
            await this.loadLanguage(lang);

            // 更新當前語言
            this.currentLang = lang;
            this.setStoredLanguage(lang);

            // 更新 currentTranslations
            this.currentTranslations = this.translations[lang];

            // 更新 HTML lang 屬性
            document.documentElement.lang = lang;

            // 觸發變更回調
            this.changeCallbacks.forEach(callback => callback(lang));

            // 更新頁面上的所有翻譯
            this.updatePageTranslations();

            // 觸發語言變更事件（兩種事件名稱以確保兼容性）
            window.dispatchEvent(new CustomEvent('languageChanged', {
                detail: { translations: this.currentTranslations, lang: this.currentLang }
            }));
            window.dispatchEvent(new CustomEvent('i18n:languageChanged', {
                detail: { translations: this.currentTranslations, lang: this.currentLang }
            }));

            return true;
        }

        // 註冊語言變更回調
        onLanguageChange(callback) {
            this.changeCallbacks.push(callback);
        }

        // 更新頁面上的翻譯
        updatePageTranslations() {
            // 更新所有帶有 data-i18n 屬性的元素
            document.querySelectorAll('[data-i18n]').forEach(element => {
                const key = element.getAttribute('data-i18n');
                const translation = this.t(key);

                // 檢查是否是輸入元素的 placeholder
                if (element.hasAttribute('data-i18n-placeholder')) {
                    element.placeholder = translation;
                } else if (element.hasAttribute('data-i18n-title')) {
                    element.title = translation;
                } else if (element.hasAttribute('data-i18n-aria-label')) {
                    element.setAttribute('aria-label', translation);
                } else {
                    element.textContent = translation;
                }
            });

            // 更新所有帶有 data-i18n-title 屬性的元素（獨立處理 title）
            document.querySelectorAll('[data-i18n-title]').forEach(element => {
                const key = element.getAttribute('data-i18n-title');
                const translation = this.t(key);
                element.title = translation;
            });

            // 更新所有帶有 data-i18n-alt 屬性的元素（處理 img alt）
            document.querySelectorAll('[data-i18n-alt]').forEach(element => {
                const key = element.getAttribute('data-i18n-alt');
                const translation = this.t(key);
                element.alt = translation;
            });

            // 更新語言切換器的當前語言顯示
            this.updateLanguageSwitcher();
        }

        // 更新語言切換器
        updateLanguageSwitcher() {
            const currentLangName = document.getElementById('current-language-name');
            if (currentLangName) {
                const langNames = {
                    'zh-TW': '繁體中文',
                    'zh-CN': '简体中文',
                    'en': 'English',
                    'ja': '日本語',
                    'ko': '한국어'
                };
                currentLangName.textContent = langNames[this.currentLang] || this.currentLang;
            }

            // 更新選項的 active 狀態
            document.querySelectorAll('.language-option').forEach(option => {
                const lang = option.getAttribute('data-lang');
                if (lang === this.currentLang) {
                    option.classList.add('active');
                } else {
                    option.classList.remove('active');
                }
            });
        }

        // 初始化
        async init() {
            // 載入當前語言
            await this.loadLanguage(this.currentLang);

            // 載入預設語言作為後備
            if (this.currentLang !== defaultLanguage) {
                await this.loadLanguage(defaultLanguage);
            }

            // 確保 currentTranslations 已設置
            this.currentTranslations = this.translations[this.currentLang];

            // 設置 HTML lang 屬性
            document.documentElement.lang = this.currentLang;

            // 初始化語言切換器
            this.initLanguageSwitcher();

            // 更新頁面翻譯
            this.updatePageTranslations();

            // 觸發初始化完成事件，讓其他模組知道可以載入翻譯
            window.dispatchEvent(new CustomEvent('i18nInitialized', {
                detail: { translations: this.currentTranslations, lang: this.currentLang }
            }));
        }

        // 初始化語言切換器
        initLanguageSwitcher() {
            const languageCurrent = document.getElementById('language-current');
            const languageDropdown = document.getElementById('language-dropdown');

            if (!languageCurrent || !languageDropdown) return;

            // 切換下拉選單
            languageCurrent.addEventListener('click', (e) => {
                e.stopPropagation();
                languageDropdown.classList.toggle('show');
                languageCurrent.classList.toggle('active');
            });

            // 選擇語言
            document.querySelectorAll('.language-option').forEach(option => {
                option.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const lang = option.getAttribute('data-lang');
                    await this.switchLanguage(lang);
                    languageDropdown.classList.remove('show');
                    languageCurrent.classList.remove('active');
                });
            });

            // 點擊外部關閉下拉選單
            document.addEventListener('click', () => {
                languageDropdown.classList.remove('show');
                languageCurrent.classList.remove('active');
            });
        }
    }

    // 創建全局 i18n 實例
    window.i18n = new I18nManager();

    // DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.i18n.init());
    } else {
        window.i18n.init();
    }

    // 提供簡便的翻譯函數
    window.__ = (key, params) => window.i18n.t(key, params);
})();