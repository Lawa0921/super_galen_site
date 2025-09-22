/* ===== 簡化網路監控系統 ===== */

(function() {
    'use strict';

    console.log('📡 簡化網路監控系統開始載入...');

    class SimpleNetworkMonitor {
        constructor() {
            this.currentChainId = null;
            this.isNetworkSupported = false;

            // 支援的網路
            this.supportedNetworks = {
                '0x89': { name: 'Polygon Mainnet', symbol: 'MATIC' },
                '0x7a69': { name: 'Hardhat Local', symbol: 'ETH' }
            };
        }

        // 啟動網路監控
        async startNetworkMonitoring() {
            console.log('📡 啟動網路監控...');

            if (!window.ethereum) {
                console.log('❌ MetaMask 未安裝');
                return;
            }

            // 設置網路變化監聽器
            window.ethereum.on('chainChanged', (chainId) => {
                console.log('🔄 網路變化偵測:', chainId);
                this.handleNetworkChange(chainId);
            });

            // 初始網路檢測
            try {
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                this.handleNetworkChange(chainId);
                console.log('✅ 網路監控已啟動');
            } catch (error) {
                console.error('❌ 網路檢測失敗:', error);
            }
        }

        // 處理網路變化
        handleNetworkChange(chainId) {
            console.log('🔄 處理網路變化:', this.currentChainId, '→', chainId);

            this.currentChainId = chainId;
            this.isNetworkSupported = !!this.supportedNetworks[chainId];

            this.logNetworkStatus();
        }

        // 記錄網路狀態
        logNetworkStatus() {
            const network = this.supportedNetworks[this.currentChainId];
            const networkName = network ? network.name : `不支援的網路 (${this.currentChainId})`;

            console.log('📊 當前網路狀態:', {
                chainId: this.currentChainId,
                networkName: networkName,
                isSupported: this.isNetworkSupported
            });
        }

        // 獲取當前狀態
        getState() {
            return {
                currentChainId: this.currentChainId,
                isNetworkSupported: this.isNetworkSupported,
                supportedNetworks: this.supportedNetworks
            };
        }
    }

    // 初始化
    function init() {
        console.log('🚀 初始化簡化網路監控系統...');

        const networkMonitor = new SimpleNetworkMonitor();

        // 啟動網路監控
        networkMonitor.startNetworkMonitoring();

        // 暴露到全域（供調試用）
        window.networkMonitor = networkMonitor;

        console.log('✅ 簡化網路監控系統初始化完成');
    }

    // 啟動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();