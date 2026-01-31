/**
 * Lazy Script Loader with Tab Module Management
 * 按需載入大型 JavaScript 函式庫，支援 Tab 模組化管理
 */

(function() {
    'use strict';

    // 追蹤已載入的腳本
    const loadedScripts = new Set();
    const loadingPromises = new Map();
    const loadedTabs = new Set();

    // 獲取資源路徑的輔助函數
    function getAssetPath(filename) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/scripts/${filename}`;
    }

    /**
     * Tab 模組配置
     * 定義每個 tab 需要載入的 JavaScript 檔案
     *
     * 注意：以下模組已預載入（在 default.html 中）：
     * - skill-tree-hierarchical.js (main.js 依賴 calculateCurrentAge)
     * - inventory.js, inventory-responsive.js (main.js 等待 initInventorySystem)
     * - summon-*.js (main.js 等待 initSummonSystem)
     */
    const TAB_MODULES = {
        'status': {
            scripts: [],
            dependencies: []
        },
        'skills': {
            scripts: [], // skill-tree-hierarchical.js 已預載入
            dependencies: []
        },
        'story': {
            scripts: ['book.js'],
            dependencies: []
        },
        'inventory': {
            scripts: [], // inventory.js, inventory-responsive.js 已預載入
            dependencies: []
        },
        'achievements': {
            scripts: ['achievements.js'], // advanced-animations.js 已預載入（包含全站需要的進入動畫）
            dependencies: []
        },
        'party': {
            scripts: [], // summon-*.js 已預載入
            dependencies: []
        },
        'purchase': {
            scripts: [
                'sgt-purchase-manager.js',
                'cyber-terminal.js',
                'cyber-audio.js'
            ],
            dependencies: []
        }
    };

    /**
     * 動態載入腳本
     * @param {string} src - 腳本 URL
     * @param {string} id - 腳本唯一 ID
     * @returns {Promise} 載入完成的 Promise
     */
    function loadScript(src, id) {
        // 如果已經載入，直接返回
        if (loadedScripts.has(id)) {
            return Promise.resolve();
        }

        // 如果正在載入，返回現有的 Promise
        if (loadingPromises.has(id)) {
            return loadingPromises.get(id);
        }

        // 建立新的載入 Promise
        const loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                loadedScripts.add(id);
                loadingPromises.delete(id);
                console.log(`✅ 懶載入完成: ${id}`);
                resolve();
            };

            script.onerror = () => {
                loadingPromises.delete(id);
                console.error(`❌ 懶載入失敗: ${id}`);
                reject(new Error(`Failed to load ${id}`));
            };

            document.head.appendChild(script);
        });

        loadingPromises.set(id, loadPromise);
        return loadPromise;
    }

    /**
     * 載入 Tab 所需的所有模組
     * @param {string} tabName - Tab 名稱（例如 'skills', 'inventory'）
     * @returns {Promise} 所有模組載入完成的 Promise
     */
    async function loadTabModule(tabName) {
        // 如果已經載入過，直接返回
        if (loadedTabs.has(tabName)) {
            console.log(`ℹ️  Tab 模組已載入: ${tabName}`);
            return Promise.resolve();
        }

        // 檢查 tab 是否存在於配置中
        const tabConfig = TAB_MODULES[tabName];
        if (!tabConfig) {
            console.warn(`⚠️  未知的 Tab: ${tabName}`);
            return Promise.resolve();
        }

        console.log(`📦 開始載入 Tab 模組: ${tabName}`);

        try {
            // 先載入依賴的 tab
            if (tabConfig.dependencies && tabConfig.dependencies.length > 0) {
                for (const dep of tabConfig.dependencies) {
                    await loadTabModule(dep);
                }
            }

            // 依序載入該 tab 的所有腳本（確保順序）
            for (const scriptFile of tabConfig.scripts) {
                const scriptPath = getAssetPath(scriptFile);
                await loadScript(scriptPath, scriptFile);
            }

            // 標記為已載入
            loadedTabs.add(tabName);
            console.log(`✅ Tab 模組載入完成: ${tabName}`);

            return Promise.resolve();
        } catch (error) {
            console.error(`❌ Tab 模組載入失敗: ${tabName}`, error);
            return Promise.reject(error);
        }
    }

    /**
     * 批量載入多個 tab 模組
     * @param {string[]} tabNames - Tab 名稱陣列
     * @returns {Promise} 所有模組載入完成的 Promise
     */
    function loadTabModules(tabNames) {
        return Promise.all(tabNames.map(tabName => loadTabModule(tabName)));
    }

    /**
     * 預載入指定的 tab 模組（用於提前載入）
     * @param {string[]} tabNames - 要預載入的 tab 名稱陣列
     */
    function preloadTabModules(tabNames) {
        setTimeout(() => {
            console.log(`🔮 開始預載入 Tab 模組: ${tabNames.join(', ')}`);
            loadTabModules(tabNames);
        }, 2000); // 延遲 2 秒，避免影響初始載入
    }

    // 暴露到全域
    window.LazyLoader = {
        loadScript,
        loadTabModule,
        loadTabModules,
        preloadTabModules,
        isLoaded: (id) => loadedScripts.has(id),
        isTabLoaded: (tabName) => loadedTabs.has(tabName),
        getTabConfig: (tabName) => TAB_MODULES[tabName]
    };

    console.log('🔧 Enhanced Lazy Loader 已初始化 (支援 Tab 模組管理)');
})();
