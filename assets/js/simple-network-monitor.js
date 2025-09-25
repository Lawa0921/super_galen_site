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
                137: { name: 'Polygon', symbol: 'MATIC', chainId: '0x89', rpcUrl: 'https://polygon-rpc.com' },
                31337: { name: 'Local Chain', symbol: 'ETH', chainId: '0x7a69', rpcUrl: 'http://127.0.0.1:8545' }
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
            const decimalChainId = parseInt(chainId, 16);
            this.isNetworkSupported = !!this.supportedNetworks[decimalChainId];

            this.logNetworkStatus();
            this.updateUI();
        }

        // 記錄網路狀態
        logNetworkStatus() {
            const decimalChainId = parseInt(this.currentChainId, 16);
            const network = this.supportedNetworks[decimalChainId];
            const networkName = network ? network.name : `不支援的網路 (${this.currentChainId})`;

            console.log('📊 當前網路狀態:', {
                chainId: this.currentChainId,
                decimalChainId: decimalChainId,
                networkName: networkName,
                isSupported: this.isNetworkSupported
            });
        }

        // 更新 UI 顯示
        updateUI() {
            const switchBtnHeader = document.getElementById('switch-to-polygon-header');

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

            const currentDecimalChainId = parseInt(this.currentChainId, 16);
            const isPolygon = currentDecimalChainId === 137;
            const isLocal = currentDecimalChainId === 31337;
            const isSupportedNetwork = isPolygon || isLocal;

            if (switchBtnHeader) {
                if (isSupportedNetwork) {
                    // 在支援的網路中，顯示切換到另一個網路的按鈕
                    switchBtnHeader.classList.remove('hidden');
                    if (isPolygon) {
                        switchBtnHeader.textContent = '🏠 切換至本地鏈';
                        switchBtnHeader.dataset.targetChain = '31337';
                    } else if (isLocal) {
                        switchBtnHeader.textContent = '🔗 切換至 Polygon';
                        switchBtnHeader.dataset.targetChain = '137';
                    }
                } else {
                    // 不在支援的網路中，顯示切換到 Polygon 的按鈕
                    switchBtnHeader.classList.remove('hidden');
                    switchBtnHeader.textContent = '🔗 切換至 Polygon';
                    switchBtnHeader.dataset.targetChain = '137';
                }
                switchBtnHeader.onclick = null; // 移除之前的點擊事件
            }

            console.log('📊 UI 更新:', {
                chainId: this.currentChainId,
                decimalChainId: currentDecimalChainId,
                isPolygon,
                isLocal,
                isSupportedNetwork,
                buttonText: switchBtnHeader?.textContent,
                targetChain: switchBtnHeader?.dataset.targetChain
            });
        }

        // 檢測是否為開發環境 (只指 hardhat local chain)
        isDevEnvironment() {
            return this.currentChainId === '0x7a69'; // Hardhat local
        }

        // 通用網路切換方法
        async switchToNetwork(targetChainId) {
            if (!window.ethereum) {
                console.error('❌ MetaMask 未安裝');
                return false;
            }

            const networkInfo = this.supportedNetworks[targetChainId];
            if (!networkInfo) {
                console.error('❌ 不支援的網路 ID:', targetChainId);
                return false;
            }

            try {
                console.log(`🔄 嘗試切換到 ${networkInfo.name} 網路...`);

                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: networkInfo.chainId }]
                });

                console.log(`✅ 成功切換到 ${networkInfo.name} 網路`);
                return true;
            } catch (error) {
                console.error('❌ 切換網路失敗:', error);

                // 如果是 Polygon 網路且網路不存在，嘗試添加
                if (error.code === 4902 && targetChainId === 137) {
                    return await this.addPolygonNetwork();
                }

                // 本地鏈無法添加到 MetaMask，提示用戶手動配置
                if (targetChainId === 31337) {
                    alert('請確保本地 Hardhat 節點正在運行，並手動添加網路:\n' +
                          'Network Name: Local Chain\n' +
                          'RPC URL: http://127.0.0.1:8545\n' +
                          'Chain ID: 31337\n' +
                          'Currency Symbol: ETH');
                }

                return false;
            }
        }

        // 保留舊方法以保持向後相容性
        async switchToPolygon() {
            return await this.switchToNetwork(137);
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
                    const targetChainId = parseInt(switchBtnHeader.dataset.targetChain);

                    if (!targetChainId) {
                        console.error('❌ 找不到目標網路 ID');
                        return;
                    }

                    switchBtnHeader.disabled = true;
                    const originalText = switchBtnHeader.textContent;
                    switchBtnHeader.textContent = '🔄 切換中...';

                    const success = await this.switchToNetwork(targetChainId);

                    setTimeout(() => {
                        switchBtnHeader.disabled = false;
                        if (!success) {
                            switchBtnHeader.textContent = originalText;
                        }
                        // 成功時文字會由 updateUI 更新
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