/**
 * Lazy Script Loader
 * 按需載入大型 JavaScript 函式庫
 */

(function() {
    'use strict';

    // 追蹤已載入的腳本
    const loadedScripts = new Set();
    const loadingPromises = new Map();

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

    // 暴露到全域
    window.LazyLoader = {
        loadScript,
        isLoaded: (id) => loadedScripts.has(id)
    };

    console.log('🔧 Lazy Loader 已初始化');
})();
