/**
 * 統一錢包管理器 v3.0 - 純 ethers.js 實作
 * 移除 Wagmi Core 依賴，大幅提升載入效能
 * 保持 100% API 向後兼容
 */

console.log('🔧 載入統一錢包管理器 v3.0 (純 ethers.js)...');
console.log('🕒 載入時間:', new Date().toISOString());

let unifiedWalletManager = null;

class UnifiedWalletManager {
    constructor() {
        // 支援的網路配置
        this.supportedNetworks = {
            31337: { name: 'Local Chain', symbol: 'ETH', rpcUrl: 'http://127.0.0.1:8545' },
            137: { name: 'Polygon', symbol: 'MATIC', rpcUrl: 'https://polygon-rpc.com' }
        };

        // 清理可能的舊版本錢包狀態儲存（安全檢查）
        this.clearDeprecatedWalletStorage();

        // 全域狀態
        this.state = {
            isConnected: false,
            address: null,
            chainId: null,
            provider: null,
            signer: null
        };

        // 事件監聽器
        this.eventListeners = new Map();

        // 防拖機制
        this.notifyTimeout = null;

        // 網路狀態追蹤
        this.lastKnownChainId = null;

        this.init();
    }

    // 清理可能的錢包狀態儲存
    clearDeprecatedWalletStorage() {
        try {
            // 清理可能的錢包連接狀態緩存
            const walletKeys = [
                'walletconnect',
                'WALLETCONNECT_DEEPLINK_CHOICE',
                'wagmi.connected',
                'wagmi.wallet',
                'wagmi.cache',
                'ethereum.selectedAddress',
                'wallet.address',
                'wallet.chainId',
                'wallet.isConnected'
            ];

            let cleared = 0;
            walletKeys.forEach(key => {
                if (localStorage.getItem(key)) {
                    localStorage.removeItem(key);
                    cleared++;
                }
            });

            if (cleared > 0) {
                console.log(`🧹 [安全檢查] 清理了 ${cleared} 個舊版本錢包狀態項目`);
            }
        } catch (error) {
            console.warn('⚠️ [安全檢查] 清理錢包狀態失敗:', error);
        }
    }

    async init() {
        console.log('🚀 初始化統一錢包管理器...');

        try {
            // 等待 ethers.js 載入
            await this.waitForEthers();

            // 設置 MetaMask 事件監聽器
            this.setupEventListeners();

            // 嘗試重新連接已存在的連接
            await this.attemptReconnect();

            // 檢查初始連接狀態
            await this.checkInitialConnection();

            console.log('✅ 統一錢包管理器初始化完成');

        } catch (error) {
            console.error('❌ 統一錢包管理器初始化失敗:', error);
            this.updateState({ isConnected: false });
            this.notifyStateChange();
        }
    }

    async waitForEthers() {
        // 等待 ethers.js 全域物件可用
        if (typeof ethers !== 'undefined') {
            console.log('✅ ethers.js 已載入');
            return;
        }

        console.log('⏳ 等待 ethers.js 載入...');

        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 秒超時

            const checkEthers = setInterval(() => {
                attempts++;

                if (typeof ethers !== 'undefined') {
                    clearInterval(checkEthers);
                    console.log('✅ ethers.js 載入完成');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkEthers);
                    reject(new Error('ethers.js 載入超時'));
                }
            }, 100);
        });
    }

    setupEventListeners() {
        if (!window.ethereum) {
            console.log('ℹ️ MetaMask 未檢測到');
            return;
        }

        console.log('🎧 設置 MetaMask 事件監聽器...');

        // 監聽帳戶變化
        window.ethereum.on('accountsChanged', (accounts) => {
            console.log('🔄 [MetaMask] 帳戶變化:', accounts);

            if (accounts.length === 0) {
                // 用戶斷開連接
                this.handleDisconnect();
            } else {
                // 帳戶切換
                this.handleAccountChange(accounts[0]);
            }
        });

        // 監聽網路變化
        window.ethereum.on('chainChanged', (chainIdHex) => {
            console.log('🔄 [MetaMask] 網路變化:', chainIdHex);
            const chainId = parseInt(chainIdHex, 16);
            this.handleChainChange(chainId);
        });

        console.log('✅ MetaMask 監聽器設置完成');
    }

    async handleAccountChange(newAddress) {
        console.log('🔄 處理帳戶切換:', newAddress);

        // 獲取當前網路
        const chainId = await this.getCurrentChainId();

        // 更新連接狀態
        await this.updateConnectionState(newAddress, chainId);
    }

    async handleChainChange(chainId) {
        console.log('🔄 處理網路切換:', chainId);

        this.updateState({ chainId });
        this.lastKnownChainId = chainId;

        // 如果已連接，重新設置 provider 和 signer
        if (this.state.isConnected) {
            await this.setupProviderAndSigner();
        }

        this.notifyStateChange();
    }

    handleDisconnect() {
        console.log('🔌 處理錢包斷開');

        this.lastKnownChainId = null;

        this.updateState({
            isConnected: false,
            address: null,
            provider: null,
            signer: null
        });

        this.notifyStateChange();
    }

    async getCurrentChainId() {
        if (!window.ethereum) return null;

        try {
            const chainIdHex = await window.ethereum.request({
                method: 'eth_chainId'
            });
            return parseInt(chainIdHex, 16);
        } catch (error) {
            console.error('❌ 獲取 chainId 失敗:', error);
            return null;
        }
    }

    async attemptReconnect() {
        try {
            console.log('🔄 檢查是否需要重新連接...');

            if (!window.ethereum) {
                console.log('ℹ️ MetaMask 未安裝，跳過重連');
                return;
            }

            // 使用 eth_accounts 檢查是否有已授權的帳戶（不會觸發連接彈窗）
            const accounts = await window.ethereum.request({
                method: 'eth_accounts'
            });

            if (!accounts || accounts.length === 0) {
                console.log('ℹ️ 沒有已授權的帳戶，跳過重連');
                return;
            }

            console.log('🔄 檢測到已授權帳戶，重新連接...');

            const chainId = await this.getCurrentChainId();
            await this.updateConnectionState(accounts[0], chainId);

            console.log('✅ 重新連接完成');

        } catch (error) {
            console.log('ℹ️ 重新連接失敗:', error.message);
        }
    }

    async checkInitialConnection() {
        try {
            console.log('🔍 檢查初始連接狀態...');

            const silentCheck = await this.checkWalletSilently();

            if (silentCheck) {
                console.log('🔍 靜默檢查結果:', silentCheck);

                if (silentCheck.isConnected) {
                    // 錢包已連接，更新狀態
                    await this.updateConnectionState(silentCheck.address, silentCheck.chainId);
                } else {
                    // 錢包未連接，但我們知道當前網路
                    this.updateState({
                        isConnected: false,
                        address: null,
                        chainId: silentCheck.chainId,
                        provider: null,
                        signer: null
                    });
                }
            } else {
                // 靜默檢查失敗
                this.updateState({
                    isConnected: false,
                    address: null,
                    chainId: null,
                    provider: null,
                    signer: null
                });
            }

            // 通知狀態變化
            this.notifyStateChange();

        } catch (error) {
            console.error('❌ 檢查初始連接狀態失敗:', error);
            this.updateState({ isConnected: false });
            this.notifyStateChange();
        }
    }

    async checkWalletSilently() {
        if (!window.ethereum) {
            console.log('🔍 [靜默檢查] 未檢測到 MetaMask');
            return null;
        }

        try {
            // 獲取當前網路
            const chainId = await this.getCurrentChainId();

            // 嘗試獲取帳戶（不會觸發連接請求）
            const accounts = await window.ethereum.request({
                method: 'eth_accounts'
            });

            console.log('🔍 [靜默檢查]', {
                chainId,
                accounts,
                hasAccounts: accounts.length > 0
            });

            return {
                chainId,
                address: accounts.length > 0 ? accounts[0] : null,
                isConnected: accounts.length > 0
            };

        } catch (error) {
            console.log('⚠️ [靜默檢查] 失敗:', error);
            return null;
        }
    }

    async updateConnectionState(address, chainId) {
        this.updateState({
            isConnected: true,
            address,
            chainId
        });

        this.lastKnownChainId = chainId;

        // 設置 provider 和 signer
        await this.setupProviderAndSigner();

        // 通知狀態變化
        this.notifyStateChange();
    }

    async setupProviderAndSigner() {
        try {
            if (!window.ethereum || typeof ethers === 'undefined') {
                console.error('❌ window.ethereum 或 ethers 未定義');
                return;
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            this.updateState({
                provider,
                signer
            });

            console.log('✅ Provider 和 Signer 設置完成');

        } catch (error) {
            console.error('❌ 設置 Provider 和 Signer 失敗:', error);
        }
    }

    updateState(updates) {
        Object.assign(this.state, updates);
    }

    notifyStateChange() {
        // 防拖機制 - 避免重複通知
        if (this.notifyTimeout) {
            clearTimeout(this.notifyTimeout);
        }

        this.notifyTimeout = setTimeout(() => {
            this._actualNotifyStateChange();
        }, 50); // 50ms 防拖
    }

    _actualNotifyStateChange() {
        // 發送全域事件（向後兼容）
        const event = new CustomEvent('unifiedWalletStateChanged', {
            detail: { ...this.state }
        });
        document.dispatchEvent(event);

        // 通知所有註冊的監聽器
        this.eventListeners.forEach((callback, id) => {
            try {
                callback(this.state);
            } catch (error) {
                console.error(`❌ 監聽器 ${id} 執行失敗:`, error);
            }
        });
    }

    // ==================== 公開 API ====================

    async ensureSupportedNetwork() {
        if (!window.ethereum) {
            throw new Error('未檢測到 MetaMask！');
        }

        try {
            const currentChainId = await this.getCurrentChainId();

            console.log('🔍 [預檢] 當前網路:', currentChainId);

            if (this.isNetworkSupported(currentChainId)) {
                console.log('✅ [預檢] 網路支援:', this.getNetworkName(currentChainId));
                return currentChainId;
            }

            // 網路不支援，建議用戶切換
            const supportedNetworks = Object.values(this.supportedNetworks)
                .map(n => n.name)
                .join('、');

            const shouldSwitch = window.showConfirm ?
                window.showConfirm('js.alerts.network_switch_confirm', { network: supportedNetworks }) :
                confirm(
                    `⚠️ 不支援的網路\n\n` +
                    `目前網路：${this.getNetworkName(currentChainId)}\n` +
                    `支援的網路：${supportedNetworks}\n\n` +
                    `請先在 MetaMask 中切換到支援的網路，然後點擊「確定」重新檢查。`
                );

            if (shouldSwitch) {
                // 遞歸檢查直到用戶切換到支援的網路
                return await this.ensureSupportedNetwork();
            } else {
                throw new Error('用戶取消網路切換');
            }

        } catch (error) {
            console.error('❌ [預檢] 網路檢查失敗:', error);
            throw error;
        }
    }

    async connectWallet() {
        try {
            console.log('🔗 開始連接錢包流程...');

            if (!window.ethereum) {
                throw new Error('未檢測到 MetaMask！請先安裝 MetaMask 擴充功能。');
            }

            // 步驟 1: 確保網路支援
            await this.ensureSupportedNetwork();

            console.log('🔗 請求連接錢包...');

            // 步驟 2: 請求連接（會觸發 MetaMask 彈窗）
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('用戶拒絕連接');
            }

            console.log('✅ 錢包連接成功:', accounts[0]);

            // 步驟 3: 獲取網路並更新狀態
            const chainId = await this.getCurrentChainId();
            await this.updateConnectionState(accounts[0], chainId);

            return this.state;

        } catch (error) {
            console.error('❌ 連接錢包失敗:', error);
            throw error;
        }
    }

    async switchToNetwork(targetChainId) {
        try {
            console.log('🔄 切換網路到:', targetChainId);

            if (!window.ethereum) {
                throw new Error('未檢測到 MetaMask！');
            }

            const chainIdHex = '0x' + targetChainId.toString(16);

            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }]
            });

            console.log('✅ 網路切換成功');

        } catch (error) {
            // 如果網路不存在，嘗試添加
            if (error.code === 4902) {
                await this.addNetwork(targetChainId);
            } else {
                console.error('❌ 切換網路失敗:', error);
                throw error;
            }
        }
    }

    async addNetwork(chainId) {
        const networkConfig = this.supportedNetworks[chainId];

        if (!networkConfig) {
            throw new Error(`不支援的網路 ID: ${chainId}`);
        }

        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x' + chainId.toString(16),
                    chainName: networkConfig.name,
                    nativeCurrency: {
                        name: networkConfig.symbol,
                        symbol: networkConfig.symbol,
                        decimals: 18
                    },
                    rpcUrls: [networkConfig.rpcUrl]
                }]
            });

            console.log('✅ 網路添加成功');

        } catch (error) {
            console.error('❌ 添加網路失敗:', error);
            throw error;
        }
    }

    disconnect() {
        console.log('🔌 斷開錢包...');

        this.lastKnownChainId = null;

        this.updateState({
            isConnected: false,
            address: null,
            provider: null,
            signer: null
        });

        this.notifyStateChange();
    }

    // ==================== 狀態查詢 API ====================

    getState() {
        return { ...this.state };
    }

    isConnected() {
        return this.state.isConnected;
    }

    getAddress() {
        return this.state.address;
    }

    getChainId() {
        return this.state.chainId;
    }

    getProvider() {
        return this.state.provider;
    }

    getSigner() {
        return this.state.signer;
    }

    getNetworkName(chainId = null) {
        const id = chainId || this.state.chainId;
        return this.supportedNetworks[id]?.name || `Network ${id}`;
    }

    isNetworkSupported(chainId = null) {
        const id = chainId || this.state.chainId;
        return !!this.supportedNetworks[id];
    }

    async getSilentWalletInfo() {
        return await this.checkWalletSilently();
    }

    // ==================== 事件監聽器管理 ====================

    addEventListener(id, callback) {
        this.eventListeners.set(id, callback);
        console.log(`✅ 註冊監聽器: ${id}`);

        // 立即調用一次以獲取當前狀態
        callback(this.state);
    }

    removeEventListener(id) {
        this.eventListeners.delete(id);
        console.log(`🗑️ 移除監聽器: ${id}`);
    }

    // ==================== 清理資源 ====================

    destroy() {
        console.log('🧹 清理統一錢包管理器資源...');

        // 移除 MetaMask 事件監聽器
        if (window.ethereum) {
            try {
                window.ethereum.removeAllListeners('chainChanged');
                window.ethereum.removeAllListeners('accountsChanged');
            } catch (error) {
                console.log('清理 MetaMask 監聽器失敗:', error);
            }
        }

        this.eventListeners.clear();
        console.log('✅ 資源清理完成');
    }
}

// ==================== 初始化函數 ====================

async function initUnifiedWalletManager() {
    if (unifiedWalletManager) {
        console.log('🔄 重新初始化統一錢包管理器...');
        unifiedWalletManager.destroy();
    }

    unifiedWalletManager = new UnifiedWalletManager();
    window.unifiedWalletManager = unifiedWalletManager;

    // 添加全域函數（向後兼容）
    window.connectWallet = () => unifiedWalletManager.connectWallet();
    window.disconnectWallet = () => unifiedWalletManager.disconnect();
    window.switchNetwork = (chainId) => unifiedWalletManager.switchToNetwork(chainId);
    window.getWalletState = () => unifiedWalletManager.getState();
    window.getSilentWalletInfo = () => unifiedWalletManager.getSilentWalletInfo();

    console.log('🌐 統一錢包管理器已設置為全域實例');
}

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUnifiedWalletManager);
} else {
    // DOM 已載入，立即初始化
    initUnifiedWalletManager();
}

console.log('📝 統一錢包管理器 v3.0 載入完成（無 Wagmi 依賴）');
