/**
 * 統一錢包管理器 - 正確使用 Wagmi Core
 * 提供全站統一的錢包狀態管理
 */

console.log('🔧 載入統一錢包管理器 v2.2 (修復版本)...');
console.log('🕒 載入時間:', new Date().toISOString());

// 全域變數用於存儲 Wagmi 和錢包管理器
let wagmiCore = null;
let viem = null;
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

        // Wagmi 相關
        this.wagmiConfig = null;
        this.unwatchAccount = null;
        this.unwatchChainId = null;

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
            // 載入 Wagmi Core 和 dependencies
            await this.loadWagmiCore();

            // 創建 Wagmi 配置
            this.createWagmiConfig();

            // 設置 Wagmi 監聽器
            this.setupWagmiWatchers();

            // 嘗試重新連接已存在的連接
            await this.attemptReconnect();

            // 檢查初始連接狀態（會在內部呼叫 notifyStateChange）
            await this.checkInitialConnection();

            console.log('✅ 統一錢包管理器初始化完成');

        } catch (error) {
            console.error('❌ 統一錢包管理器初始化失敗:', error);
            this.updateState({ isConnected: false });
            this.notifyStateChange();
        }
    }

    async loadWagmiCore() {
        console.log('📦 載入 Wagmi Core...');

        if (wagmiCore && viem) {
            console.log('✅ Wagmi Core 已載入');
            return;
        }

        try {
            // 導入 Wagmi Core 和相關模組
            const [wagmiModule, viemModule] = await Promise.all([
                import('https://esm.sh/@wagmi/core@2.20.1'),
                import('https://esm.sh/viem@2.37.6')
            ]);

            wagmiCore = wagmiModule;
            viem = viemModule;

            console.log('✅ Wagmi Core 載入完成');
            console.log('🔍 [調試] wagmiCore 可用 API:', Object.keys(wagmiCore));
            console.log('🔍 [調試] viem 可用 API:', Object.keys(viem));

        } catch (error) {
            console.error('❌ 載入 Wagmi Core 失敗:', error);
            throw error;
        }
    }

    createWagmiConfig() {
        console.log('⚙️ 創建 Wagmi 配置...');

        try {
            // 手動定義支援的鏈
            const chains = [
                {
                    id: 137,
                    name: 'Polygon',
                    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                    rpcUrls: {
                        default: { http: ['https://polygon-rpc.com'] }
                    }
                },
                {
                    id: 31337,
                    name: 'Localhost',
                    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                    rpcUrls: {
                        default: { http: ['http://127.0.0.1:8545'] }
                    }
                }
            ];

            // 檢查 injected connector 是否存在
            console.log('🔍 [調試] 檢查 injected connector:', typeof wagmiCore.injected);

            // 使用 Wagmi 的內建 injected connector
            const connectors = [
                wagmiCore.injected()
            ];

            // 設置 transports
            const transports = {
                137: viem.http('https://polygon-rpc.com'),
                31337: viem.http('http://127.0.0.1:8545')
            };

            this.wagmiConfig = wagmiCore.createConfig({
                chains,
                connectors,
                transports
            });

            console.log('✅ Wagmi 配置創建成功');

        } catch (error) {
            console.error('❌ 創建 Wagmi 配置失敗:', error);
            throw error;
        }
    }

    setupWagmiWatchers() {
        console.log('🎧 設置 Wagmi 監聽器...');

        try {
            // 監聽帳戶變化
            this.unwatchAccount = wagmiCore.watchAccount(this.wagmiConfig, {
                onChange: (account) => {
                    this.handleAccountChange(account);
                }
            });

            // 監聽網路變化
            this.unwatchChainId = wagmiCore.watchChainId(this.wagmiConfig, {
                onChange: (chainId) => {
                    console.log('🔄 [Wagmi] 網路變化:', chainId);
                    this.handleChainChange(chainId);
                }
            });

            // 額外添加直接監聽 MetaMask 的帳戶變化事件
            if (window.ethereum) {
                console.log('🎧 設置 MetaMask 直接監聽器...');

                // 監聽帳戶變化
                window.ethereum.on('accountsChanged', (accounts) => {
                    if (accounts.length === 0) {
                        this.handleDirectDisconnect();
                    }
                });

                // 註：移除 chainChanged 監聽，因為錢包連接後根本無法監聽到
                // 解決方案是在連接前確保用戶已在正確的網路上
            }

            console.log('✅ Wagmi 和 MetaMask 監聽器設置完成');

        } catch (error) {
            console.error('❌ 設置監聽器失敗:', error);
            throw error;
        }
    }

    handleAccountChange(account) {
        if (!account.isConnected || !account.address) {
            // 錢包已斷開
            console.log('🔌 [Wagmi] 錢包已斷開');
            this.updateState({
                isConnected: false,
                address: null,
                provider: null,
                signer: null
            });
        } else {
            // 錢包已連接或帳戶已切換，使用帳戶參數中的 chainId
            this.updateConnectionState(account.address, account.chainId);
        }

        this.notifyStateChange();
    }

    handleChainChange(chainId) {
        console.log('🔄 [Wagmi] 網路已切換:', chainId);
        this.updateState({ chainId: chainId });

        // 如果已連接，重新設置 provider 和 signer
        if (this.state.isConnected) {
            this.setupProviderAndSigner();
        }

        this.notifyStateChange();
    }

    handleDirectChainChange(chainId) {
        console.log('🔄 [MetaMask 直接] 網路已切換:', chainId);
        this.updateState({ chainId: chainId });

        // 如果已連接，重新設置 provider 和 signer
        if (this.state.isConnected) {
            this.setupProviderAndSigner();
        }

        this.notifyStateChange();
    }

    handleDirectDisconnect() {
        console.log('🔌 [MetaMask 直接] 錢包已斷開');

        this.lastKnownChainId = null;

        this.updateState({
            isConnected: false,
            address: null,
            provider: null,
            signer: null
        });
        this.notifyStateChange();
    }

    // 註：輪詢機制已移除，因為 MetaMask 連接後會鎖定在連接時的網路
    // 無論如何輪詢都只會得到連接時的 chainId，無法偵測真正的網路切換
    // 解決方案是在連接狀態下偵測到網路切換時重新整理頁面


    async attemptReconnect() {
        try {
            console.log('🔄 [Wagmi] 檢查是否需要重新連接...');

            // 先檢查 MetaMask 是否有授權的帳戶
            if (!window.ethereum) {
                console.log('ℹ️ [Wagmi] MetaMask 未安裝，跳過重連');
                return;
            }

            // 使用 eth_accounts 檢查是否有已授權的帳戶（不會觸發連接彈窗）
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });

            if (!accounts || accounts.length === 0) {
                console.log('ℹ️ [Wagmi] 沒有已授權的帳戶，跳過重連');
                return;
            }

            console.log('🔄 [Wagmi] 檢測到已授權帳戶，嘗試重新連接...');
            await wagmiCore.reconnect(this.wagmiConfig);
            console.log('✅ [Wagmi] 重新連接完成');

        } catch (error) {
            console.log('ℹ️ [Wagmi] 重新連接失敗:', error.message);
        }
    }

    // 靜默檢查錢包狀態（不觸發連接請求）
    async checkWalletSilently() {
        if (!window.ethereum) {
            console.log('🔍 [靜默檢查] 未檢測到 MetaMask');
            return null;
        }

        try {
            // 獲取當前網路
            const hexChainId = await window.ethereum.request({ method: 'eth_chainId' });
            const chainId = parseInt(hexChainId, 16);

            // 嘗試獲取帳戶（不會觸發連接請求）
            const accounts = await window.ethereum.request({
                method: 'eth_accounts' // 這個方法不會觸發連接彈窗
            });

            console.log('🔍 [靜默檢查]', {
                chainId: chainId,
                accounts: accounts,
                hasAccounts: accounts.length > 0,
                explanation: accounts.length > 0 ?
                    '網站已被授權，可獲取地址' :
                    '網站未被授權或用戶未連接過錢包'
            });

            return {
                chainId: chainId,
                address: accounts.length > 0 ? accounts[0] : null,
                isConnected: accounts.length > 0
            };

        } catch (error) {
            console.log('⚠️ [靜默檢查] 失敗:', error);
            return null;
        }
    }

    async checkInitialConnection() {
        try {
            console.log('🔍 [Wagmi] 檢查初始連接狀態...');

            // 先進行靜默檢查
            const silentCheck = await this.checkWalletSilently();
            if (silentCheck) {
                console.log('🔍 [靜默檢查] 結果:', silentCheck);

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
                // 靜默檢查失敗，使用 Wagmi 檢查
                const account = wagmiCore.getAccount(this.wagmiConfig);
                console.log('📱 [Wagmi] 初始帳戶狀態:', account);

                if (account.isConnected && account.address) {
                    const chainId = account.chainId;
                    console.log('🔗 [Wagmi] 使用帳戶中的 chainId:', chainId);
                    await this.updateConnectionState(account.address, chainId);
                } else {
                    this.updateState({
                        isConnected: false,
                        address: null,
                        chainId: 1, // 預設值
                        provider: null,
                        signer: null
                    });
                }
            }

            // 通知狀態變化
            this.notifyStateChange();

        } catch (error) {
            console.error('❌ [Wagmi] 檢查初始連接狀態失敗:', error);
            this.updateState({ isConnected: false });
            this.notifyStateChange();
        }
    }


    async updateConnectionState(address, chainId) {
        this.updateState({
            isConnected: true,
            address: address,
            chainId: chainId
        });

        this.lastKnownChainId = chainId;

        // 先設置 provider 和 signer
        await this.setupProviderAndSigner();

        // 確保 provider 和 signer 已設置後再通知

        // 通知狀態變化
        this.notifyStateChange();
    }

    async setupProviderAndSigner() {
        try {
            // 仍然使用 ethers.js 創建 provider 和 signer
            if (window.ethereum && typeof ethers !== 'undefined') {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();

                this.updateState({
                    provider: provider,
                    signer: signer
                });

            }
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
        // 發送全域事件
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

    // 檢查並要求切換到支援的網路
    async ensureSupportedNetwork() {
        if (!window.ethereum) {
            throw new Error('未檢測到 MetaMask！');
        }

        try {
            const hexChainId = await window.ethereum.request({ method: 'eth_chainId' });
            const currentChainId = parseInt(hexChainId, 16);

            console.log('🔍 [預檢] 當前網路:', currentChainId);

            if (this.isNetworkSupported(currentChainId)) {
                console.log('✅ [預檢] 網路支援:', this.getNetworkName(currentChainId));
                return currentChainId;
            }

            // 網路不支援，建議用戶切換
            const supportedNetworks = Object.values(this.supportedNetworks)
                .map(n => n.name)
                .join('、');

            const shouldSwitch = confirm(
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

    // 公開 API
    async connectWallet() {
        try {
            console.log('🔗 開始連接錢包流程...');

            // 步驟 1: 確保網路支援
            await this.ensureSupportedNetwork();

            console.log('🔗 [Wagmi] 連接錢包...');

            if (!wagmiCore || !this.wagmiConfig) {
                throw new Error('Wagmi 未初始化！');
            }

            // 獲取 injected connector
            const connectors = wagmiCore.getConnectors(this.wagmiConfig);
            const injectedConnector = connectors.find(c => c.type === 'injected');

            if (!injectedConnector) {
                throw new Error('找不到 injected 連接器！');
            }

            console.log('🔗 [Wagmi] 使用連接器:', injectedConnector.name);

            const result = await wagmiCore.connect(this.wagmiConfig, {
                connector: injectedConnector
            });

            console.log('✅ [Wagmi] 連接成功:', result);

            return this.state;

        } catch (error) {
            console.error('❌ 連接錢包失敗:', error);
            throw error;
        }
    }

    async switchToNetwork(chainId) {
        try {
            console.log('🔄 [Wagmi] 切換網路到:', chainId);

            await wagmiCore.switchChain(this.wagmiConfig, {
                chainId: chainId
            });

            console.log('✅ [Wagmi] 網路切換成功');
        } catch (error) {
            console.error('❌ [Wagmi] 切換網路失敗:', error);
            throw error;
        }
    }

    disconnect() {
        console.log('🔌 [Wagmi] 斷開錢包...');

        this.lastKnownChainId = null;

        if (wagmiCore && this.wagmiConfig) {
            try {
                wagmiCore.disconnect(this.wagmiConfig);
            } catch (error) {
                console.log('Wagmi 斷開失敗:', error);
            }
        }

        this.updateState({
            isConnected: false,
            address: null,
            provider: null,
            signer: null
        });
        this.notifyStateChange();
    }

    // 狀態查詢
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

    // 公開方法：靜默檢查當前錢包狀態
    async getSilentWalletInfo() {
        return await this.checkWalletSilently();
    }

    // 事件監聽器管理
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

    // 清理資源
    destroy() {
        console.log('🧹 清理統一錢包管理器資源...');

        // 停止 Wagmi 監聽器
        if (this.unwatchAccount) {
            this.unwatchAccount();
            this.unwatchAccount = null;
        }
        if (this.unwatchChainId) {
            this.unwatchChainId();
            this.unwatchChainId = null;
        }

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

// 初始化函數
async function initUnifiedWalletManager() {
    if (unifiedWalletManager) {
        console.log('🔄 重新初始化統一錢包管理器...');
        unifiedWalletManager.destroy();
    }

    unifiedWalletManager = new UnifiedWalletManager();
    window.unifiedWalletManager = unifiedWalletManager;

    // 添加全域函數
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

console.log('📝 統一錢包管理器載入完成');