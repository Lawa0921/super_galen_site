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
            this.updateUI();
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

        // 更新 UI 顯示
        updateUI() {
            const switchBtnHeader = document.getElementById('switch-to-polygon-header');
            const devBadgeHeader = document.getElementById('dev-badge-header');

            if (!window.ethereum) {
                // 沒有 MetaMask 時，顯示切換按鈕提醒用戶安裝
                if (switchBtnHeader) {
                    switchBtnHeader.classList.remove('hidden');
                    switchBtnHeader.textContent = '🦊 安裝 MetaMask';
                    switchBtnHeader.onclick = () => {
                        window.open('https://metamask.io/download/', '_blank');
                    };
                }
                return;
            }

            const isPolygon = this.currentChainId === '0x89';
            const isLocal = this.currentChainId === '0x7a69';
            const isDev = this.isDevEnvironment();

            // 重置按鈕文字和點擊事件
            if (switchBtnHeader) {
                switchBtnHeader.textContent = '🔗 切換至 Polygon';
                switchBtnHeader.onclick = null; // 移除之前的點擊事件
            }

            // 顯示/隱藏切換按鈕（非 Polygon 且非開發環境時顯示）
            if (switchBtnHeader) {
                if (!isPolygon && !isDev) {
                    switchBtnHeader.classList.remove('hidden');
                } else {
                    switchBtnHeader.classList.add('hidden');
                }
            }

            // 顯示/隱藏開發環境標誌（只有在 hardhat local 時顯示）
            if (devBadgeHeader) {
                if (isDev) {
                    devBadgeHeader.classList.remove('hidden');
                } else {
                    devBadgeHeader.classList.add('hidden');
                }
            }

            console.log('📊 UI 更新:', {
                chainId: this.currentChainId,
                isPolygon,
                isLocal,
                isDev,
                showButton: !isPolygon && !isDev,
                showDevBadge: isDev
            });
        }

        // 檢測是否為開發環境 (只指 hardhat local chain)
        isDevEnvironment() {
            return this.currentChainId === '0x7a69'; // Hardhat local
        }

        // 切換到 Polygon 網路
        async switchToPolygon() {
            if (!window.ethereum) {
                console.error('❌ MetaMask 未安裝');
                return false;
            }

            try {
                console.log('🔄 嘗試切換到 Polygon 網路...');

                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }]
                });

                console.log('✅ 成功切換到 Polygon 網路');
                return true;
            } catch (error) {
                console.error('❌ 切換網路失敗:', error);

                // 如果網路不存在，嘗試添加
                if (error.code === 4902) {
                    return await this.addPolygonNetwork();
                }
                return false;
            }
        }

        // 添加 Polygon 網路到 MetaMask
        async addPolygonNetwork() {
            try {
                console.log('➕ 嘗試添加 Polygon 網路...');

                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x89',
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: {
                            name: 'MATIC',
                            symbol: 'MATIC',
                            decimals: 18
                        },
                        rpcUrls: ['https://polygon-rpc.com'],
                        blockExplorerUrls: ['https://polygonscan.com']
                    }]
                });

                console.log('✅ 成功添加並切換到 Polygon 網路');
                return true;
            } catch (error) {
                console.error('❌ 添加網路失敗:', error);
                return false;
            }
        }

        // 設置切換按鈕事件監聽器
        setupSwitchButton() {
            const switchBtnHeader = document.getElementById('switch-to-polygon-header');
            if (switchBtnHeader) {
                switchBtnHeader.addEventListener('click', async () => {
                    switchBtnHeader.disabled = true;
                    const originalText = switchBtnHeader.textContent;
                    switchBtnHeader.textContent = '🔄 切換中...';

                    const success = await this.switchToPolygon();

                    setTimeout(() => {
                        switchBtnHeader.disabled = false;
                        switchBtnHeader.textContent = originalText;
                    }, 1000);
                });
            }
        }

        // 獲取當前狀態
        getState() {
            return {
                currentChainId: this.currentChainId,
                isNetworkSupported: this.isNetworkSupported,
                supportedNetworks: this.supportedNetworks,
                isDev: this.isDevEnvironment()
            };
        }
    }

    // 初始化
    function init() {
        console.log('🚀 初始化簡化網路監控系統...');

        const networkMonitor = new SimpleNetworkMonitor();

        // 立即更新 UI（顯示初始狀態）
        networkMonitor.updateUI();

        // 啟動網路監控
        networkMonitor.startNetworkMonitoring();

        // 設置切換按鈕事件監聽器
        networkMonitor.setupSwitchButton();

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