/* ===== 基於 ethers.js v6 的正確 Web3 錢包系統 ===== */

(function() {
    'use strict';

    console.log('🔌 基於 ethers.js v6 的 Web3 系統開始載入...');

    // 等待 ethers.js 載入
    function waitForEthers(callback) {
        if (typeof ethers !== 'undefined') {
            console.log('✅ ethers.js 已載入，版本:', ethers.version || '6.x');
            callback();
        } else {
            console.log('⏳ 等待 ethers.js v6 載入...');
            setTimeout(() => waitForEthers(callback), 100);
        }
    }

    // 主要的 Web3 管理類別
    class EthersV6Web3Manager {
        constructor() {
            this.provider = null;
            this.signer = null;
            this.currentNetwork = null;
            this.currentAccount = null;
            this.isConnected = false;

            // 輪詢機制（備用檢測用戶手動切換）
            this.pollingInterval = null;
            this.isPolling = false;
            this.lastKnownChainId = null;

            // 支援的網路配置
            this.supportedNetworks = {
                '0x89': {
                    name: 'Polygon Mainnet',
                    chainId: '0x89',
                    rpcUrl: 'https://polygon-rpc.com',
                    symbol: 'MATIC',
                    blockExplorer: 'https://polygonscan.com'
                },
                '0x7a69': {
                    name: 'Hardhat Local',
                    chainId: '0x7a69',
                    rpcUrl: 'http://localhost:8545',
                    symbol: 'ETH',
                    blockExplorer: null
                }
            };
        }

        // 初始化 Web3 Provider
        async initialize() {
            console.log('🚀 初始化 ethers.js v6 Web3 系統...');

            if (!window.ethereum) {
                console.log('❌ MetaMask 未安裝');
                this.updateUI('no-metamask');
                return;
            }

            try {
                // 創建 BrowserProvider (ethers v6)
                this.recreateProvider();
                console.log('✅ BrowserProvider 已創建');

                // 設置事件監聽器
                this.setupEventListeners();

                // 檢查當前連接狀態
                await this.checkConnection();

                console.log('🎉 ethers.js v6 Web3 系統初始化完成');

                // 啟動輪詢機制（檢測用戶手動切換網路）
                this.startManualSwitchPolling();

            } catch (error) {
                console.error('❌ 初始化失敗:', error);
                this.updateUI('error');
            }
        }

        // 重新建立 provider (關鍵方法)
        recreateProvider() {
            console.log('🔄 重新建立 BrowserProvider...');
            this.provider = new ethers.BrowserProvider(window.ethereum);
        }

        // 設置事件監聽器
        setupEventListeners() {
            console.log('🔗 設置 v6 事件監聽器...');

            // 🎯 關鍵：直接監聽 window.ethereum 的 chainChanged 事件
            window.ethereum.on('chainChanged', async (chainId) => {
                console.log('🚨🚨🚨 chainChanged 事件成功觸發!');
                console.log('新網路 ID:', chainId);

                // 🔧 每次網路變化都重新建立 provider
                this.recreateProvider();

                // 重新檢查連接狀態
                await this.checkConnection();

                console.log('✅ 網路切換處理完成');
            });

            // 帳戶變更監聽
            window.ethereum.on('accountsChanged', (accounts) => {
                console.log('👤 帳戶變更事件:', accounts);
                this.handleAccountsChanged(accounts);
            });

            // 連接狀態變更監聽
            window.ethereum.on('connect', (connectInfo) => {
                console.log('🔗 MetaMask 連接事件:', connectInfo);
                this.checkConnection();
            });

            window.ethereum.on('disconnect', (error) => {
                console.log('🔌 MetaMask 斷線事件:', error);
                this.handleDisconnected();
            });

            console.log('✅ 所有事件監聽器已設置');
        }

        // 檢查連接狀態
        async checkConnection() {
            console.log('🔍 檢查連接狀態...');

            try {
                // v6 語法：使用 provider.send
                const accounts = await this.provider.send('eth_accounts', []);

                if (accounts.length === 0) {
                    console.log('🔌 未連接帳戶');
                    this.isConnected = false;
                    this.currentAccount = null;
                    this.updateUI('disconnected');
                    return;
                }

                this.currentAccount = accounts[0];
                this.isConnected = true;

                // 獲取網路資訊 (v6 語法)
                const network = await this.provider.getNetwork();
                this.currentNetwork = network;

                console.log('📡 當前狀態:', {
                    account: this.currentAccount.substring(0, 6) + '...',
                    network: network.name,
                    chainId: '0x' + network.chainId.toString(16)
                });

                // 檢查是否為支援的網路
                const chainId = '0x' + network.chainId.toString(16);
                if (this.supportedNetworks[chainId]) {
                    this.updateUI('connected-correct');
                } else {
                    this.updateUI('connected-wrong');
                }

            } catch (error) {
                console.error('❌ 檢查連接狀態失敗:', error);
                this.updateUI('error');
            }
        }

        // 處理帳戶變更事件
        handleAccountsChanged(accounts) {
            if (accounts.length === 0) {
                console.log('🔌 所有帳戶已斷線');
                this.handleDisconnected();
            } else {
                console.log('👤 帳戶已變更:', accounts[0]);
                this.currentAccount = accounts[0];
                this.checkConnection(); // 重新檢查狀態
            }
        }

        // 處理斷線事件
        handleDisconnected() {
            this.isConnected = false;
            this.currentAccount = null;
            this.currentNetwork = null;
            this.updateUI('disconnected');
        }

        // 連接錢包
        async connectWallet() {
            console.log('🔗 嘗試連接錢包...');

            if (!window.ethereum) {
                alert('請安裝 MetaMask');
                return;
            }

            try {
                // 請求帳戶權限
                await window.ethereum.request({ method: 'eth_requestAccounts' });

                // 🔧 連接後重新建立 provider
                this.recreateProvider();
                this.signer = await this.provider.getSigner();

                console.log('✅ 連接成功');

                // 重新檢查狀態
                await this.checkConnection();

            } catch (error) {
                console.error('❌ 連接失敗:', error);
                if (error.code === 4001) {
                    alert('用戶拒絕了連接請求');
                } else {
                    alert('連接失敗: ' + error.message);
                }
            }
        }

        // 切換到 Polygon 網路
        async switchToPolygon() {
            console.log('🔄 切換到 Polygon Mainnet...');

            const polygonNetwork = this.supportedNetworks['0x89'];

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: polygonNetwork.chainId }],
                });

                console.log('✅ 網路切換請求已送出');

            } catch (error) {
                console.error('❌ 切換網路失敗:', error);

                if (error.code === 4902) {
                    // 網路不存在，嘗試新增
                    await this.addPolygonNetwork();
                } else {
                    alert('切換網路失敗: ' + error.message);
                }
            }
        }

        // 新增 Polygon 網路
        async addPolygonNetwork() {
            console.log('➕ 新增 Polygon 網路...');

            const polygonNetwork = this.supportedNetworks['0x89'];

            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: polygonNetwork.chainId,
                        chainName: polygonNetwork.name,
                        rpcUrls: [polygonNetwork.rpcUrl],
                        nativeCurrency: {
                            name: polygonNetwork.symbol,
                            symbol: polygonNetwork.symbol,
                            decimals: 18
                        },
                        blockExplorerUrls: polygonNetwork.blockExplorer ? [polygonNetwork.blockExplorer] : null
                    }]
                });

                console.log('✅ Polygon 網路已新增');

            } catch (error) {
                console.error('❌ 新增網路失敗:', error);
                alert('新增網路失敗: ' + error.message);
            }
        }

        // 更新 UI
        updateUI(status) {
            console.log('🎨 更新 UI 狀態:', status);

            const container = document.getElementById('wallet-container');
            if (!container) {
                console.log('❌ 找不到 wallet-container');
                return;
            }

            // 移除所有狀態類別
            container.classList.remove('show-connect', 'show-switch', 'show-connected');

            switch (status) {
                case 'no-metamask':
                case 'disconnected':
                case 'error':
                    container.classList.add('show-connect');
                    console.log('👤 顯示：連接錢包');
                    break;

                case 'connected-wrong':
                    container.classList.add('show-switch');
                    console.log('⚠️ 顯示：切換網路');
                    break;

                case 'connected-correct':
                    container.classList.add('show-connected');
                    console.log('✅ 顯示：已連接');
                    break;
            }
        }

        // 輪詢檢測用戶手動切換網路
        async pollForManualSwitch() {
            if (!window.ethereum) return;

            try {
                // 直接查詢 MetaMask 當前網路
                const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

                // 檢查是否與上次記錄的網路不同
                if (this.lastKnownChainId && this.lastKnownChainId !== currentChainId) {
                    console.log('🔍 輪詢偵測到用戶手動切換網路!');
                    console.log('從:', this.lastKnownChainId, '切換到:', currentChainId);

                    // 手動觸發 chainChanged 處理
                    await this.handleManualNetworkChange(currentChainId);
                }

                // 更新記錄的網路 ID
                this.lastKnownChainId = currentChainId;

            } catch (error) {
                console.error('❌ 輪詢檢查失敗:', error);
            }
        }

        // 處理手動網路變更
        async handleManualNetworkChange(chainId) {
            console.log('🔄 處理手動網路變更...', chainId);

            // 重新建立 provider
            this.recreateProvider();

            // 重新檢查連接狀態
            await this.checkConnection();

            console.log('✅ 手動網路切換處理完成');
        }

        // 開始手動切換檢測輪詢
        startManualSwitchPolling(interval = 1000) {
            if (this.isPolling) return;

            console.log('🔄 開始手動網路切換檢測 (每 1 秒)');
            this.isPolling = true;

            // 立即記錄當前網路
            if (window.ethereum) {
                window.ethereum.request({ method: 'eth_chainId' })
                    .then(chainId => {
                        this.lastKnownChainId = chainId;
                        console.log('📍 初始網路記錄:', chainId);
                    })
                    .catch(err => console.error('記錄初始網路失敗:', err));
            }

            // 開始定期檢查
            this.pollingInterval = setInterval(() => {
                this.pollForManualSwitch();
            }, interval);
        }

        // 停止輪詢
        stopManualSwitchPolling() {
            if (!this.isPolling) return;

            console.log('🛑 停止手動網路切換檢測');
            this.isPolling = false;

            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
        }

        // 獲取當前狀態
        getState() {
            return {
                isConnected: this.isConnected,
                account: this.currentAccount,
                network: this.currentNetwork,
                provider: this.provider,
                signer: this.signer,
                isPolling: this.isPolling,
                lastKnownChainId: this.lastKnownChainId
            };
        }
    }

    // 全域實例
    let web3Manager = null;

    // 綁定 UI 事件
    function bindUIEvents() {
        console.log('🎯 綁定 UI 事件...');

        const connectBtn = document.getElementById('connect-wallet-btn');
        const switchBtn = document.getElementById('switch-network-btn');
        const disconnectBtns = document.querySelectorAll('[id*="disconnect-wallet-btn"]');

        if (connectBtn) {
            connectBtn.addEventListener('click', () => web3Manager.connectWallet());
            console.log('✅ 連接按鈕已綁定');
        }

        if (switchBtn) {
            switchBtn.addEventListener('click', () => web3Manager.switchToPolygon());
            console.log('✅ 切換按鈕已綁定');
        }

        disconnectBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                alert('請在 MetaMask 中手動斷開連接');
            });
        });

        if (disconnectBtns.length > 0) {
            console.log(`✅ ${disconnectBtns.length} 個斷開按鈕已綁定`);
        }
    }

    // 初始化函數
    function initialize() {
        console.log('🚀 初始化 ethers.js v6 Web3 系統...');

        web3Manager = new EthersV6Web3Manager();

        // 綁定 UI 事件
        bindUIEvents();

        // 初始化 Web3
        web3Manager.initialize();
    }

    // 暴露全域 API
    function exposeGlobalAPI() {
        window.ethersV6Web3 = {
            manager: web3Manager,
            getState: () => web3Manager ? web3Manager.getState() : null,
            connect: () => web3Manager ? web3Manager.connectWallet() : null,
            switchNetwork: () => web3Manager ? web3Manager.switchToPolygon() : null,
            checkConnection: () => web3Manager ? web3Manager.checkConnection() : null,
            startPolling: (interval) => web3Manager ? web3Manager.startManualSwitchPolling(interval) : null,
            stopPolling: () => web3Manager ? web3Manager.stopManualSwitchPolling() : null,
            forceCheck: () => web3Manager ? web3Manager.pollForManualSwitch() : null
        };

        console.log('📋 ethers.js v6 Web3 API 已註冊: window.ethersV6Web3');
    }

    // 等待 DOM 和 ethers.js 載入後初始化
    function startInitialization() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                waitForEthers(initialize);
            });
        } else {
            waitForEthers(initialize);
        }

        exposeGlobalAPI();
    }

    // 開始初始化
    startInitialization();

})();