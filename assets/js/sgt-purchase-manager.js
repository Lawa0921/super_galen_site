/**
 * SGT 購買管理器
 * 負責處理 SGT 代幣的購買流程
 */

if (window.DebugUtils?.isDevelopment()) {
    window.DebugUtils.debugLog('🛒 載入 SGT 購買管理器...');
}

class SGTPurchaseManager {
    constructor() {
        // 使用動態合約配置
        if (window.ContractsConfig) {
            this.contracts = window.ContractsConfig;
            if (window.DebugUtils?.isDevelopment()) {
                window.DebugUtils.debugLog('📄 [SGT-Purchase] 使用動態合約配置:', this.contracts);
            }
        } else {
            // 備用配置（如果動態配置未載入）
            console.error('❌ [SGT-Purchase] 動態配置未載入！這不應該發生。');
            console.error('❌ 請檢查 default.html 中的 ContractsConfig 是否正確載入');
            this.contracts = null; // 不提供 fallback，強制使用全域配置
            throw new Error('ContractsConfig not loaded');
        }

        // 網路配置
        this.networks = {
            31337: {
                name: "Local Chain",
                rpcUrl: "http://127.0.0.1:8545",
                chainId: "0x7a69"
            },
            137: {
                name: "Polygon",
                rpcUrl: "https://polygon-rpc.com",
                chainId: "0x89"
            }
        };

        // 狀態
        this.isConnected = false;
        this.currentChainId = null;
        this.userAddress = null;
        this.provider = null;
        this.signer = null;
        this.sgtContract = null;
        this.usdtContract = null;

        // 防拖機制
        this.updateUITimeout = null;

        // 餘額
        this.balances = {
            sgt: '0',
            usdt: '0'
        };

        // 交易狀態
        this.isApproving = false;
        this.isPurchasing = false;

        this.init();
    }

    // 獲取翻譯文字的輔助方法
    getTranslation(key, fallback) {
        if (window.i18n && window.i18n.currentTranslations) {
            const keys = key.split('.');
            let value = window.i18n.currentTranslations;
            for (const k of keys) {
                value = value?.[k];
                if (!value) break;
            }
            return value || fallback;
        }
        return fallback;
    }

    async init() {
        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog('🔧 初始化 SGT 購買管理器...');
        }

        // 等待頁面載入完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }

        // 等待統一錢包管理器載入並設置監聽器
        await this.waitForUnifiedWalletManager();

        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog('✅ SGT 購買管理器初始化完成');
        }
    }

    async waitForUnifiedWalletManager() {
        return new Promise((resolve) => {
            const checkManager = () => {
                if (window.unifiedWalletManager) {
                    if (window.DebugUtils?.isDevelopment()) {
                        window.DebugUtils.debugLog('🎯 [SGT-Purchase] 找到統一錢包管理器，設置監聽器...');
                    }
                    this.setupWalletListeners();
                    // addEventListener 會自動調用當前狀態，無需重複調用
                    resolve();
                } else {
                    if (window.DebugUtils?.isDevelopment()) {
                        window.DebugUtils.debugLog('⏳ [SGT-Purchase] 等待統一錢包管理器載入...');
                    }
                    setTimeout(checkManager, 100);
                }
            };
            checkManager();
        });
    }

    setupWalletListeners() {
        console.log('🔗 設置錢包狀態監聽器...');

        // 監聽統一錢包管理器狀態變化
        document.addEventListener('unifiedWalletStateChanged', (event) => {
            // 延遲處理，確保所有狀態都已準備好
            setTimeout(() => {
                this.handleWalletStateChange(event.detail);
            }, 100);
        });

        // 註冊到統一錢包管理器（會立即調用一次當前狀態）
        window.unifiedWalletManager.addEventListener('sgt-purchase', (state) => {
            // 對於初始狀態，也延遲一下處理
            setTimeout(() => {
                this.handleWalletStateChange(state);
            }, 100);
        });

        console.log('✅ 錢包狀態監聽器設置完成');
    }

    handleWalletStateChange(state) {
        // 更新本地狀態
        this.isConnected = state.isConnected;
        this.userAddress = state.address;
        this.currentChainId = state.chainId;
        this.provider = state.provider;
        this.signer = state.signer;

        // 更新網路狀態顯示
        this.updateNetworkStatusFromState(state);

        // 更新合約實例並等待完成
        if (this.isConnected && this.provider && this.signer) {
            this.updateContractInstances();

            // 延遲一下確保合約實例已創建，然後更新餘額
            setTimeout(async () => {
                if (this.sgtContract && this.usdtContract) {
                    await this.updateBalances();
                    this.updateBalanceDisplay();
                } else {
                    console.log('⏳ [SGT-Purchase] 等待合約初始化...');
                    // 如果合約還沒準備好，再試一次
                    setTimeout(async () => {
                        if (this.sgtContract && this.usdtContract) {
                            await this.updateBalances();
                            this.updateBalanceDisplay();
                        }
                    }, 1000);
                }
            }, 500);
        }

        // 更新 UI
        this.updateUI();
    }

    updateNetworkStatusFromState(state) {
        const networkIndicator = document.getElementById('purchase-network-indicator');
        const networkNameElement = document.getElementById('purchase-network-name');

        if (!networkIndicator || !networkNameElement) {
            console.error('❌ [網路狀態] 找不到 DOM 元素');
            return;
        }

        if (!state.isConnected) {
            // 錢包未連接
            networkIndicator.textContent = '🔴';
            networkNameElement.textContent = this.getTranslation('purchase_manager.network.not_connected', '未連接');
            console.log('🔴 [網路狀態] 錢包未連接');
            return;
        }

        // 錢包已連接，直接使用 header 的邏輯
        const networkInfo = window.unifiedWalletManager?.supportedNetworks[state.chainId];
        if (networkInfo) {
            networkIndicator.textContent = '🟢';
            networkNameElement.textContent = networkInfo.name;
        } else {
            networkIndicator.textContent = '🔴';
            networkNameElement.textContent = `${this.getTranslation('purchase_manager.network.network_prefix', '網路')} ${state.chainId}`;
        }
    }

    setupUI() {
        console.log('🎨 設置購買頁面 UI...');

        // 綁定事件
        this.bindEvents();

        // 不在初始化時調用 updateUI()，等待統一錢包管理器的狀態同步
        console.log('⏳ 等待統一錢包管理器提供初始狀態...');
    }

    bindEvents() {
        // 連接錢包按鈕
        const connectBtn = document.getElementById('connect-wallet');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.connectWallet());
        }

        // 複製地址按鈕
        const copyBtn = document.getElementById('copy-address');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyAddress());
        }

        // USDT 輸入框
        const usdtInput = document.getElementById('usdt-input');
        if (usdtInput) {
            usdtInput.addEventListener('input', () => this.onUSDTAmountChange());
        }

        // MAX 按鈕
        const maxBtn = document.getElementById('max-usdt');
        if (maxBtn) {
            maxBtn.addEventListener('click', () => this.setMaxUSDT());
        }

        // 授權按鈕
        const approveBtn = document.getElementById('approve-btn');
        if (approveBtn) {
            approveBtn.addEventListener('click', () => this.approveUSDT());
        }

        // 購買按鈕
        const purchaseBtn = document.getElementById('purchase-btn');
        if (purchaseBtn) {
            purchaseBtn.addEventListener('click', () => this.purchaseSGT());
        }


        // 彈窗按鈕
        const closePurchaseModal = document.getElementById('close-purchase-modal');
        if (closePurchaseModal) {
            closePurchaseModal.addEventListener('click', () => this.closePurchaseModal());
        }

        const cancelPurchase = document.getElementById('cancel-purchase');
        if (cancelPurchase) {
            cancelPurchase.addEventListener('click', () => this.closePurchaseModal());
        }

        const confirmPurchase = document.getElementById('confirm-purchase');
        if (confirmPurchase) {
            confirmPurchase.addEventListener('click', () => this.confirmPurchase());
        }

        // 舊的網路監聽器已移除，現在使用統一錢包管理器
    }

    // 已停用：舊的錢包監聽器，現在使用統一錢包管理器
    setupNetworkListeners_DISABLED() {
        console.log('🔗 [購買管理器] 設置錢包狀態監聽器...');

        // 監聽簡化錢包管理器的事件
        document.addEventListener('walletAccountChanged', (event) => {
            this.handleWalletAccountChanged(event.detail);
        });

        document.addEventListener('walletNetworkChanged', (event) => {
            console.log('🔄 [購買管理器] 收到網路變化:', event.detail);
            this.handleWalletNetworkChanged(event.detail);
        });

        // 等待簡化錢包管理器載入並獲取初始狀態
        const waitForWalletManager = () => {
            if (window.simpleWalletManager) {
                const state = window.simpleWalletManager.getCurrentState();
                console.log('🚀 [購買管理器] 獲取初始狀態:', state);

                if (state.isConnected) {
                    this.handleWalletAccountChanged({
                        address: state.userAddress,
                        isConnected: state.isConnected
                    });
                }

                if (state.currentChainId) {
                    this.handleWalletNetworkChanged({
                        chainId: state.currentChainId,
                        networkName: state.networkName,
                        isSupported: state.isNetworkSupported
                    });
                }

                console.log('✅ [購買管理器] 錢包監聽器設置完成');
            } else {
                console.log('⏳ [購買管理器] 等待 SimpleWalletManager 載入...');
                setTimeout(waitForWalletManager, 100);
            }
        };

        waitForWalletManager();
    }

    handleWalletAccountChanged(detail) {
        if (detail.isConnected && detail.address) {
            this.isConnected = true;
            this.userAddress = detail.address;

            // 獲取 provider 和 signer
            const walletState = window.simpleWalletManager?.getCurrentState();
            if (walletState) {
                this.provider = walletState.provider;
                this.signer = walletState.signer;
            }

            this.setupContracts();
            this.updateBalances();
            this.updateUI();

        } else {
            console.log('🔌 [購買管理器] 錢包已斷開');
            this.disconnect();
        }
    }

    handleWalletNetworkChanged(detail) {
        this.currentChainId = detail.chainId;
        console.log('🔄 [購買管理器] 網路切換到:', detail.networkName, `(${detail.chainId})`);

        // 如果已連接，重新設置合約和更新餘額
        if (this.isConnected) {
            // 獲取最新的 provider 和 signer
            const walletState = window.simpleWalletManager?.getCurrentState();
            if (walletState) {
                this.provider = walletState.provider;
                this.signer = walletState.signer;
            }

            this.setupContracts();
            this.updateBalances();
        }

        this.updateUI();
    }

    // 移除 checkWalletConnection，現在使用統一錢包管理器處理連接狀態

    updateContractInstances() {
        if (!this.currentChainId || !this.signer) {
            this.sgtContract = null;
            this.usdtContract = null;
            return;
        }

        const contractAddresses = this.contracts[this.currentChainId];
        if (!contractAddresses) {
            console.log('❌ 不支援的網路:', this.currentChainId);
            this.sgtContract = null;
            this.usdtContract = null;
            return;
        }

        try {
            // SGT 合約
            if (contractAddresses.sgt) {
                this.sgtContract = new ethers.Contract(
                    contractAddresses.sgt,
                    [
                        "function buyTokensWithUSDT(uint256 usdtAmount) external",
                        "function balanceOf(address account) view returns (uint256)",
                        "function calculateSGTAmount(uint256 usdtAmount) view returns (uint256)",
                        "function purchasesPaused() view returns (bool)"
                    ],
                    this.signer
                );
            }

            // USDT 合約
            if (contractAddresses.usdt) {
                this.usdtContract = new ethers.Contract(
                    contractAddresses.usdt,
                    [
                        "function balanceOf(address account) view returns (uint256)",
                        "function approve(address spender, uint256 amount) external returns (bool)",
                        "function allowance(address owner, address spender) view returns (uint256)",
                        "function decimals() view returns (uint8)"
                    ],
                    this.signer
                );
            }

        } catch (error) {
            console.error('❌ 更新合約實例失敗:', error);
        }
    }

    async connectWallet() {
        if (!window.unifiedWalletManager) {
            if (window.showAlert) {
                window.showAlert('js.alerts.wallet_not_loaded');
            } else {
                // 備用方案：使用系統預設警告
                alert(window.i18n?.currentTranslations?.js?.alerts?.wallet_not_loaded || 'Wallet manager not loaded yet');
            }
            return;
        }

        try {
            console.log('🔗 使用統一錢包管理器連接錢包...');
            await window.unifiedWalletManager.connectWallet();

        } catch (error) {
            console.error('❌ 連接錢包失敗:', error);
            if (window.showAlert) {
                window.showAlert('js.alerts.wallet_connect_failed', { error: error.message });
            } else {
                const errorMsg = window.i18n?.currentTranslations?.js?.alerts?.wallet_connect_failed?.replace('{{error}}', error.message) || `Wallet connection failed: ${error.message}`;
                alert(errorMsg);
            }
        }
    }

    async handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            console.log('🔌 錢包已斷開');
            this.disconnect();
        } else {
            this.userAddress = accounts[0];
            this.isConnected = true;

            await this.setupContracts();
            await this.updateBalances();
            this.updateUI();
        }
    }

    async handleChainChanged(chainId) {
        const chainIdNum = parseInt(chainId, 16);
        const oldChainId = this.currentChainId;
        this.currentChainId = chainIdNum;

        console.log('🔄 網路切換:', oldChainId, '→', chainIdNum);

        // 更新網路狀態
        if (chainIdNum === 31337) {
            this.updateNetworkStatus('Local Chain', true);
        } else if (chainIdNum === 137) {
            this.updateNetworkStatus('Polygon', true);
        } else {
            this.updateNetworkStatus('不支援的網路', false);
        }

        // 主流 DApp 做法：如果已連接，重新實例化 Provider 和合約
        if (this.isConnected) {
            console.log('🔧 網路變化，重新實例化 Provider（主流 DApp 標準做法）...');

            // 重新實例化 Provider（關鍵：不斷開錢包）
            await this.reinitializeProvider();

            // 重新設置合約
            await this.setupContracts();

            // 更新餘額
            await this.updateBalances();

            // 更新 UI
            this.updateUI();

        }
    }

    async reinitializeProvider() {
        try {
            console.log('🔄 重新創建 Provider 實例...');

            // 重新包裝 Provider（Web3Modal 標準做法）
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();

            console.log('✅ Provider 重新實例化成功');
        } catch (error) {
            console.error('❌ Provider 重新實例化失敗:', error);
            throw error;
        }
    }

    async checkAndSwitchNetwork() {
        const currentChainId = parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16);

        // 檢查是否為支援的網路
        if (![31337, 137].includes(currentChainId)) {
            // 嘗試切換到本地網路
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x7a69' }], // 31337 的十六進制
                });
            } catch (error) {
                console.log('⚠️ 切換網路失敗，保持當前網路');
            }
        }
    }

    async setupContracts() {
        if (!this.isConnected || !this.currentChainId) return;

        try {
            // 設置 provider 和 signer
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();

            const contractAddresses = this.contracts[this.currentChainId];
            if (!contractAddresses) {
                console.log('❌ 不支援的網路:', this.currentChainId);
                return;
            }

            // SGT 合約 ABI（簡化版）
            const sgtABI = [
                "function balanceOf(address account) view returns (uint256)",
                "function buyTokensWithUSDT(uint256 usdtAmount)",
                "function calculateSGTAmount(uint256 usdtAmount) view returns (uint256)",
                "function purchasesPaused() view returns (bool)"
            ];

            // USDT 合約 ABI（簡化版）
            const usdtABI = [
                "function balanceOf(address account) view returns (uint256)",
                "function allowance(address owner, address spender) view returns (uint256)",
                "function approve(address spender, uint256 amount) returns (bool)",
                "function decimals() view returns (uint8)"
            ];

            // 創建合約實例
            if (contractAddresses.sgt) {
                this.sgtContract = new ethers.Contract(contractAddresses.sgt, sgtABI, this.signer);
                console.log('✅ SGT 合約已連接');
            }

            if (contractAddresses.usdt) {
                this.usdtContract = new ethers.Contract(contractAddresses.usdt, usdtABI, this.signer);
                console.log('✅ USDT 合約已連接');
            }

        } catch (error) {
            console.error('❌ 設置合約失敗:', error);
        }
    }

    async updateBalances() {
        if (!this.userAddress) return;

        try {
            // 如果是 Polygon，只查詢 USDT 餘額
            if (this.currentChainId === 137) {
                if (this.usdtContract) {
                    const usdtBalance = await this.usdtContract.balanceOf(this.userAddress);
                    this.balances.usdt = ethers.formatUnits(usdtBalance, 6);
                    this.balances.sgt = '0'; // Polygon 上暫時沒有 SGT
                    console.log('💰 [Polygon] USDT 餘額更新:', this.balances.usdt);
                }
            }
            // 其他網路，查詢 SGT 和 USDT
            else if (this.sgtContract && this.usdtContract) {
                // 查詢 SGT 餘額
                const sgtBalance = await this.sgtContract.balanceOf(this.userAddress);
                this.balances.sgt = ethers.formatEther(sgtBalance);

                // 查詢 USDT 餘額
                const usdtBalance = await this.usdtContract.balanceOf(this.userAddress);
                this.balances.usdt = ethers.formatUnits(usdtBalance, 6);

            }

        } catch (error) {
            console.error('❌ 更新餘額失敗:', error);
        }
    }

    updateUI() {
        // 防拖機制 - 避免重複調用
        if (this.updateUITimeout) {
            clearTimeout(this.updateUITimeout);
        }

        this.updateUITimeout = setTimeout(() => {
            this._actualUpdateUI();
        }, 50); // 50ms 防拖
    }

    _actualUpdateUI() {
        // 正規 Web3 UI 更新：根據連接狀態顯示不同區域
        const walletConnected = document.getElementById('wallet-connected');
        const walletDisconnected = document.getElementById('wallet-disconnected');
        const purchaseSection = document.getElementById('purchase-section');
        const historySection = document.getElementById('history-section');


        if (this.isConnected && this.userAddress) {
            // 錢包已連接 - 顯示已連接狀態
            if (walletConnected) {
                walletConnected.style.display = 'block';
            }

            if (walletDisconnected) {
                walletDisconnected.style.display = 'none';
            }

            // 更新地址顯示
            const addressElement = document.getElementById('purchase-user-address');
            if (addressElement) {
                addressElement.textContent = this.userAddress;
            }

            // 檢查網路支援（只影響購買功能，不影響錢包連接顯示）
            const polygonNotice = document.getElementById('polygon-notice');

            // purchase-section 現在專門用於終端機，始終顯示
            if (purchaseSection) purchaseSection.style.display = 'block';

            if (this.currentChainId === 137) {
                // Polygon 網路 - 顯示即將推出訊息（但不影響終端機顯示）
                if (polygonNotice) polygonNotice.style.display = 'block';
                this.setupPolygonSwitchButton();

            } else if (this.isNetworkSupported()) {
                // 支援的網路 - 隱藏 Polygon 通知
                if (polygonNotice) polygonNotice.style.display = 'none';
            } else {
                // 不支援的網路 - 隱藏 Polygon 通知
                if (polygonNotice) polygonNotice.style.display = 'none';
            }

            // 更新餘額顯示（錢包已連接時總是嘗試更新）
            this.updateBalanceDisplay();

        } else {
            // 錢包未連接 - 顯示未連接狀態
            if (walletConnected) {
                walletConnected.style.display = 'none';
            }
            if (walletDisconnected) {
                walletDisconnected.style.display = 'block';
            }
            // purchase-section 現在專門用於終端機，始終顯示
            if (purchaseSection) purchaseSection.style.display = 'block';
            if (historySection) historySection.style.display = 'none';
        }

        // 更新按鈕狀態
        this.updateButtonStates();
    }

    updateAddressDisplay() {
        const addressElement = document.getElementById('purchase-user-address');
        if (addressElement && this.userAddress) {
            // 顯示完整地址
            addressElement.textContent = this.userAddress;
        }
    }

    setupPolygonSwitchButton() {
        const switchBtn = document.getElementById('switch-to-local');
        if (switchBtn) {
            // 移除舊的事件監聽器（避免重複綁定）
            switchBtn.replaceWith(switchBtn.cloneNode(true));
            const newSwitchBtn = document.getElementById('switch-to-local');

            newSwitchBtn.addEventListener('click', async () => {
                try {
                    console.log('🔄 切換到本地測試網...');
                    if (window.unifiedWalletManager) {
                        await window.unifiedWalletManager.switchToNetwork(31337);
                    }
                } catch (error) {
                    console.error('❌ 切換網路失敗:', error);
                    if (window.showAlert) {
                        window.showAlert('js.alerts.network_switch_failed');
                    } else {
                        alert('切換網路失敗，請手動在 MetaMask 中切換到本地測試網（Chain ID: 31337）');
                    }
                }
            });
        }
    }

    updateBalanceDisplay() {
        const sgtBalanceElement = document.getElementById('sgt-balance');
        const usdtBalanceElement = document.getElementById('usdt-balance');
        const availableUsdtElement = document.getElementById('available-usdt');

        if (sgtBalanceElement) {
            sgtBalanceElement.textContent = parseFloat(this.balances.sgt).toFixed(2);
        }

        if (usdtBalanceElement) {
            usdtBalanceElement.textContent = parseFloat(this.balances.usdt).toFixed(2);
        }

        if (availableUsdtElement) {
            availableUsdtElement.textContent = parseFloat(this.balances.usdt).toFixed(2);
        }
    }

    updateNetworkStatus(networkName, isConnected) {
        console.log('🔄 [網路狀態] 更新顯示:', { networkName, isConnected });

        const networkIndicator = document.getElementById('network-indicator');
        const networkNameElement = document.getElementById('network-name');

        console.log('🔍 [網路狀態] DOM 元素:', {
            networkIndicator: !!networkIndicator,
            networkNameElement: !!networkNameElement,
            networkIndicatorContent: networkIndicator?.textContent,
            networkNameContent: networkNameElement?.textContent
        });

        if (networkIndicator) {
            const oldIndicator = networkIndicator.textContent;
            const indicator = isConnected ? '🟢' : '🔴';
            networkIndicator.textContent = indicator;

            // 管理 CSS 類別
            if (isConnected) {
                networkIndicator.classList.add('connected');
            } else {
                networkIndicator.classList.remove('connected');
            }

            console.log(`🎯 [網路狀態] 指示器變更: "${oldIndicator}" → "${indicator}", CSS 類別: ${isConnected ? '+connected' : '-connected'}`);

            // 確認變更是否生效
            setTimeout(() => {
                const actualIndicator = networkIndicator.textContent;
                const hasConnectedClass = networkIndicator.classList.contains('connected');
                console.log(`🔍 [網路狀態] 實際指示器內容: "${actualIndicator}", 連接類別: ${hasConnectedClass}`);
                if (actualIndicator !== indicator) {
                    console.error(`❌ [網路狀態] 指示器變更失敗！預期: "${indicator}", 實際: "${actualIndicator}"`);
                }
                if (hasConnectedClass !== isConnected) {
                    console.error(`❌ [網路狀態] CSS 類別設置錯誤！預期: ${isConnected}, 實際: ${hasConnectedClass}`);
                }
            }, 100);
        } else {
            console.error('❌ [網路狀態] 找不到 network-indicator 元素');
        }

        if (networkNameElement) {
            const oldName = networkNameElement.textContent;
            networkNameElement.textContent = networkName;
            console.log(`🎯 [網路狀態] 網路名稱變更: "${oldName}" → "${networkName}"`);

            // 確認變更是否生效
            setTimeout(() => {
                const actualName = networkNameElement.textContent;
                console.log(`🔍 [網路狀態] 實際網路名稱內容: "${actualName}"`);
                if (actualName !== networkName) {
                    console.error(`❌ [網路狀態] 網路名稱變更失敗！預期: "${networkName}", 實際: "${actualName}"`);
                }
            }, 100);
        } else {
            console.error('❌ [網路狀態] 找不到 network-name 元素');
        }
    }

    isNetworkSupported() {
        const supported = !!(this.currentChainId && this.contracts[this.currentChainId] && this.contracts[this.currentChainId].sgt);
        return supported;
    }

    async copyAddress() {
        if (this.userAddress) {
            try {
                await navigator.clipboard.writeText(this.userAddress);
                if (window.showAlert) {
                    window.showAlert('js.alerts.copy_success');
                } else {
                    alert('地址已複製到剪貼板！');
                }
            } catch (error) {
                console.error('複製失敗:', error);
            }
        }
    }

    onUSDTAmountChange() {
        const usdtInput = document.getElementById('usdt-input');
        const sgtOutput = document.getElementById('sgt-output');

        if (usdtInput && sgtOutput) {
            const usdtAmount = parseFloat(usdtInput.value) || 0;
            const sgtAmount = usdtAmount * 30; // 1 USDT = 30 SGT

            sgtOutput.textContent = sgtAmount.toFixed(2);

            // 更新交易詳情
            this.updateTransactionDetails(usdtAmount, sgtAmount);

            // 更新按鈕狀態
            this.updateButtonStates();
        }
    }

    setMaxUSDT() {
        const usdtInput = document.getElementById('usdt-input');
        if (usdtInput) {
            usdtInput.value = this.balances.usdt;
            this.onUSDTAmountChange();
        }
    }

    updateTransactionDetails(usdtAmount, sgtAmount) {
        const detailsSection = document.getElementById('transaction-details');
        const payAmountElement = document.getElementById('pay-amount');
        const receiveAmountElement = document.getElementById('receive-amount');

        if (usdtAmount > 0) {
            if (detailsSection) detailsSection.style.display = 'block';
            if (payAmountElement) payAmountElement.textContent = `${usdtAmount.toFixed(6)} USDT`;
            if (receiveAmountElement) receiveAmountElement.textContent = `${sgtAmount.toFixed(2)} SGT`;
        } else {
            if (detailsSection) detailsSection.style.display = 'none';
        }
    }

    updateButtonStates() {
        const usdtInput = document.getElementById('usdt-input');
        const approveBtn = document.getElementById('approve-btn');
        const purchaseBtn = document.getElementById('purchase-btn');

        const usdtAmount = parseFloat(usdtInput?.value) || 0;
        const hasValidAmount = usdtAmount > 0;

        if (approveBtn) {
            approveBtn.disabled = !hasValidAmount || this.isApproving;
            if (this.isConnected) {
                approveBtn.textContent = this.isApproving ? '授權中...' : '🔓 授權 USDT';
            } else {
                approveBtn.textContent = this.isApproving ? '連接中...' : '🔗 連接錢包';
            }
        }

        if (purchaseBtn) {
            purchaseBtn.disabled = !hasValidAmount || this.isPurchasing;
            if (this.isConnected) {
                purchaseBtn.textContent = this.isPurchasing ? '購買中...' : '🛒 購買 SGT';
            } else {
                purchaseBtn.textContent = this.isPurchasing ? '連接中...' : '🔗 連接錢包';
            }
        }
    }

    async approveUSDT() {
        if (this.isApproving) return;

        const usdtInput = document.getElementById('usdt-input');
        const usdtAmount = parseFloat(usdtInput?.value) || 0;

        if (usdtAmount <= 0) {
            if (window.showAlert) {
                window.showAlert('js.alerts.invalid_amount');
            } else {
                alert('請輸入有效的 USDT 數量');
            }
            return;
        }

        try {
            this.isApproving = true;
            this.updateButtonStates();
            this.updateStepStatus('approve', 'processing');

            console.log('🔗 USDT 授權流程開始...');

            // 步驟 1: 連接錢包（如果尚未連接）
            if (!this.isConnected) {
                console.log('🔗 步驟 1: 連接錢包...');
                await this.connectWallet();

                if (!this.isConnected || !this.usdtContract) {
                    throw new Error('錢包連接或合約載入失敗');
                }
            }

            // 檢查購買功能是否暫停
            if (this.sgtContract) {
                const isPaused = await this.sgtContract.purchasesPaused();
                if (isPaused) {
                    throw new Error('購買功能暫時維護中，請稍後再試');
                }
            }

            // 步驟 2: 執行授權
            console.log('🔓 步驟 2: 授權 USDT...');
            const sgtContractAddress = this.contracts[this.currentChainId].sgt;
            const amountToApprove = ethers.parseUnits(usdtAmount.toString(), 6);

            const tx = await this.usdtContract.approve(sgtContractAddress, amountToApprove);

            console.log('⏳ 等待授權交易確認...');
            await tx.wait();

            console.log('✅ USDT 授權成功');
            this.updateStepStatus('approve', 'completed');


        } catch (error) {
            console.error('❌ USDT 授權失敗:', error);
            this.updateStepStatus('approve', 'error');
            if (window.showAlert) {
                window.showAlert('js.alerts.approve_failed', { error: error.message });
            } else {
                alert('授權失敗：' + error.message);
            }
        } finally {
            this.isApproving = false;
            this.updateButtonStates();
        }
    }

    async purchaseSGT() {
        if (this.isPurchasing) return;

        const usdtInput = document.getElementById('usdt-input');
        const usdtAmount = parseFloat(usdtInput?.value) || 0;

        if (usdtAmount <= 0) {
            if (window.showAlert) {
                window.showAlert('js.alerts.invalid_amount');
            } else {
                alert('請輸入有效的 USDT 數量');
            }
            return;
        }

        try {
            this.isPurchasing = true;
            this.updateButtonStates();
            this.updateStepStatus('purchase', 'processing');

            console.log('🛒 SGT 購買流程開始...');

            // 步驟 1: 連接錢包（如果尚未連接）
            if (!this.isConnected) {
                console.log('🔗 步驟 1: 連接錢包...');
                await this.connectWallet();

                if (!this.isConnected || !this.sgtContract) {
                    throw new Error('錢包連接或合約載入失敗');
                }
            }

            // 檢查購買功能是否暫停
            const isPaused = await this.sgtContract.purchasesPaused();
            if (isPaused) {
                throw new Error('購買功能暫時維護中，請稍後再試');
            }

            // 步驟 2: 執行購買
            console.log('💰 步驟 2: 購買 SGT...');
            const amountToPay = ethers.parseUnits(usdtAmount.toString(), 6);

            const tx = await this.sgtContract.buyTokensWithUSDT(amountToPay);

            console.log('⏳ 等待購買交易確認...');
            await tx.wait();

            console.log('✅ SGT 購買成功');
            this.updateStepStatus('purchase', 'completed');

            // 更新餘額
            await this.updateBalances();
            this.updateBalanceDisplay();

            // 觸發 header SGT 餘額更新
            this.updateHeaderBalance();

            // 重置輸入
            if (usdtInput) usdtInput.value = '';
            this.onUSDTAmountChange();

            // 顯示成功訊息
            if (window.showAlert) {
                window.showAlert('js.alerts.purchase_success');
            } else {
                alert('🎉 SGT 購買成功！');
            }


        } catch (error) {
            console.error('❌ SGT 購買失敗:', error);
            this.updateStepStatus('purchase', 'error');
            if (window.showAlert) {
                window.showAlert('js.alerts.purchase_failed', { error: error.message });
            } else {
                alert('購買失敗：' + error.message);
            }
        } finally {
            this.isPurchasing = false;
            this.updateButtonStates();
        }
    }

    updateStepStatus(step, status) {
        const stepElement = document.getElementById(`step-${step}`);
        const statusElement = document.getElementById(`${step}-status`);

        if (!stepElement || !statusElement) return;

        // 清除所有狀態類
        stepElement.classList.remove('active', 'completed', 'error');

        switch (status) {
            case 'processing':
                stepElement.classList.add('active');
                statusElement.textContent = '處理中...';
                break;
            case 'completed':
                stepElement.classList.add('completed');
                statusElement.textContent = '已完成';
                break;
            case 'error':
                stepElement.classList.add('error');
                statusElement.textContent = '失敗';
                break;
            default:
                statusElement.textContent = '待處理';
        }
    }

    closePurchaseModal() {
        const modal = document.getElementById('purchase-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async confirmPurchase() {
        // 這裡可以添加確認購買的邏輯
        this.closePurchaseModal();
        await this.purchaseSGT();
    }



    disconnect() {
        console.log('🔌 斷開錢包連結中...');
        this.isConnected = false;
        this.currentChainId = null;
        this.userAddress = null;
        this.provider = null;
        this.signer = null;
        this.sgtContract = null;
        this.usdtContract = null;
        this.balances = { sgt: '0', usdt: '0' };

        this.updateNetworkStatus('未連接', false);
        this.updateUI();
        console.log('✅ 錢包已斷開，網路監聽功能已恢復正常');
    }

    // 更新 header 中的 SGT 餘額顯示
    updateHeaderBalance() {
        console.log('🔄 觸發 header SGT 餘額更新...');

        // 刷新網路狀態管理器（確保獲取最新的區塊鏈狀態）
        if (window.networkStateManager) {
            window.networkStateManager.refresh();
        }

        // 如果存在簡化 SGT 餘額顯示器，刷新它
        if (window.simpleSGTBalance) {
            window.simpleSGTBalance.refresh();
        }

        // 如果存在刷新函數，也調用它
        if (window.refreshSimpleSGT) {
            window.refreshSimpleSGT();
        }

        // 發送自定義事件通知其他組件
        const event = new CustomEvent('sgtBalanceUpdated', {
            detail: {
                newBalance: this.balances.sgt,
                userAddress: this.userAddress,
                source: 'purchase'
            }
        });

        document.dispatchEvent(event);
    }

    // 手動刷新功能
    async refresh() {
        console.log('🔄 手動刷新購買管理器...');

        // 從統一錢包管理器獲取最新狀態
        if (window.unifiedWalletManager) {
            const currentState = window.unifiedWalletManager.getState();
            console.log('📊 [SGT-Purchase] 刷新時獲取狀態:', currentState);
            this.handleWalletStateChange(currentState);
        }

        // 如果已連接，更新餘額
        if (this.isConnected) {
            await this.updateBalances();
        }

        this.updateUI();
    }
}

// 創建全域實例
let sgtPurchaseManager;

function initSGTPurchaseManager() {
    if (sgtPurchaseManager) {
        console.log('🔄 重新初始化 SGT 購買管理器...');
        return; // 避免重複初始化
    }

    sgtPurchaseManager = new SGTPurchaseManager();
    window.sgtPurchaseManager = sgtPurchaseManager;

    // 添加全域刷新函數
    window.refreshSGTPurchase = () => {
        if (sgtPurchaseManager) {
            sgtPurchaseManager.refresh();
        } else {
            initSGTPurchaseManager();
        }
    };
}

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSGTPurchaseManager);
} else {
    // DOM 已載入，延遲初始化以確保其他腳本已載入
    setTimeout(initSGTPurchaseManager, 100);
}

console.log('📝 SGT 購買管理器腳本載入完成');