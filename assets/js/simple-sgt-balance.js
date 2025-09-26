/**
 * 簡化的 SGT 餘額顯示器
 * 專為本地開發環境設計
 */

console.log('🚀 載入簡化 SGT 餘額顯示器...');

class SimpleSGTBalance {
    constructor() {
        // 使用動態合約配置
        if (window.ContractsConfig) {
            this.contracts = {
                31337: window.ContractsConfig[31337]?.sgt || null,
                137: window.ContractsConfig[137]?.sgt || null
            };
            console.log('📄 [SGT-Balance] 使用動態合約配置:', this.contracts);
        } else {
            // 備用配置（如果動態配置未載入）
            console.warn('⚠️ [SGT-Balance] 動態配置未載入，使用備用配置');
            this.contracts = {
                31337: null,
                137: null
            };
        }

        // 移除預設地址，只在連接錢包時顯示餘額
        this.localRpcUrl = "http://127.0.0.1:8545";
        this.polygonRpcUrl = "https://polygon-rpc.com";

        // 防止競爭條件的控制變數
        this.updateTimer = null;
        this.lastUpdateTime = 0;
        this.isUpdating = false;

        this.init();
    }

    async init() {
        console.log('🔧 初始化簡化 SGT 餘額顯示器...');

        // 等待 DOM 和 ethers.js 載入
        await this.waitForDependencies();

        // 設置網路監聽器
        this.setupNetworkListeners();

        // 設置餘額更新事件監聽器
        this.setupBalanceUpdateListener();

        // 顯示餘額
        await this.displayBalance();

        console.log('✅ 簡化 SGT 餘額顯示器初始化完成');
    }

    setupNetworkListeners() {
        console.log('🔗 設置錢包狀態監聽器...');

        // 監聽統一錢包管理器的事件 - 使用防抖動機制
        document.addEventListener('unifiedWalletStateChanged', (event) => {
            console.log('📢 [SGT-Balance] 收到錢包狀態變化:', event.detail);
            this.scheduleBalanceUpdate('walletStateChanged', 300);
        });

        // 等待統一錢包管理器載入並檢查初始狀態
        const waitForWalletManager = () => {
            if (window.unifiedWalletManager) {
                const state = window.unifiedWalletManager.getState();
                console.log('🚀 [SGT-Balance] 獲取初始狀態:', state);

                // 註冊監聽器 - 使用防抖動機制
                window.unifiedWalletManager.addEventListener('sgt-balance', (state) => {
                    console.log('📬 [SGT-Balance] 監聽器收到狀態:', state);
                    this.scheduleBalanceUpdate('sgtBalanceEvent', 300);
                });

                this.scheduleBalanceUpdate('initialLoad', 200);
                console.log('✅ 錢包狀態監聽器設置完成');
            } else {
                console.log('⏳ 等待 UnifiedWalletManager 載入...');
                setTimeout(waitForWalletManager, 100);
            }
        };

        waitForWalletManager();
    }

    // 防抖動的餘額更新調度器
    scheduleBalanceUpdate(source, delay = 300) {
        const now = Date.now();

        // 如果正在更新，跳過
        if (this.isUpdating) {
            console.log(`🔄 [SGT-Balance] 跳過 ${source} 更新（正在更新中）`);
            return;
        }

        // 如果距離上次更新太短，跳過
        if (now - this.lastUpdateTime < 200) {
            console.log(`🔄 [SGT-Balance] 跳過 ${source} 更新（更新太頻繁）`);
            return;
        }

        // 清除之前的定時器
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        console.log(`⏰ [SGT-Balance] 調度 ${source} 更新，延遲 ${delay}ms`);

        this.updateTimer = setTimeout(async () => {
            this.updateTimer = null;
            await this.displayBalance();
        }, delay);
    }

    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDependencies = () => {
                if (document.readyState === 'complete' && typeof ethers !== 'undefined') {
                    console.log('📦 依賴項已載入');
                    resolve();
                } else {
                    console.log('⏳ 等待依賴項載入...');
                    setTimeout(checkDependencies, 100);
                }
            };
            checkDependencies();
        });
    }

    async displayBalance() {
        // 防止重複更新
        if (this.isUpdating) {
            console.log('🔄 [SGT-Balance] 餘額更新進行中，跳過');
            return;
        }

        this.isUpdating = true;
        this.lastUpdateTime = Date.now();

        const container = document.getElementById('sgt-balance-header');
        const amountElement = document.getElementById('sgt-balance-amount');
        const statusElement = document.getElementById('balance-status');
        const switchButton = document.getElementById('switch-to-polygon-header');

        if (!container || !amountElement || !statusElement) {
            console.error('❌ SGT 餘額 DOM 元素未找到');
            this.isUpdating = false;
            return;
        }

        // 首先檢查錢包是否已連接
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState || !walletState.isConnected) {
            console.log('👤 錢包未連接，隱藏 SGT 餘額顯示');
            container.classList.add('hidden');
            if (switchButton) switchButton.classList.add('hidden');
            this.isUpdating = false;
            return;
        }

        console.log('🔍 錢包已連接，檢查 SGT 餘額...', walletState);

        try {

            // 使用錢包管理器的狀態
            const currentChainId = walletState.chainId;
            const userAddress = walletState.address;
            const provider = walletState.provider;

            if (!provider || !userAddress) {
                console.log('❌ Provider 或用戶地址不可用');
                this.showConnectPrompt();
                return;
            }

            console.log('📱 當前網路:', currentChainId, '用戶地址:', userAddress);

            // 確認是支援的網路
            if (!(currentChainId in this.contracts)) {
                console.log('❌ 不支援的網路 ID:', currentChainId);
                this.showSwitchButton();
                return;
            }

            // 檢查合約是否已部署
            if (!this.contracts[currentChainId]) {
                console.log('⚠️ 合約尚未部署到此網路:', currentChainId);
                if (currentChainId === 137) {
                    this.showPolygonComingSoon();
                } else {
                    this.showSwitchButton();
                }
                return;
            }

            console.log('✅ 支援的網路，查詢餘額...');

            // 設置合約
            const contract = new ethers.Contract(
                this.contracts[currentChainId],
                ["function balanceOf(address account) view returns (uint256)"],
                provider
            );

            // 查詢餘額
            console.log('💰 查詢地址餘額:', userAddress);
            const balance = await contract.balanceOf(userAddress);
            const balanceInEther = parseFloat(ethers.formatEther(balance));

            console.log('📊 餘額查詢結果:', balanceInEther, 'SGT');

            // 格式化顯示
            let displayBalance;
            if (balanceInEther >= 1000000) {
                displayBalance = (balanceInEther / 1000000).toFixed(1) + 'M';
            } else if (balanceInEther >= 1000) {
                displayBalance = (balanceInEther / 1000).toFixed(1) + 'K';
            } else {
                displayBalance = balanceInEther.toFixed(2);
            }

            // 根據網路顯示不同狀態
            let networkName;
            if (currentChainId === 31337) {
                networkName = '本地網路';
            } else if (currentChainId === 137) {
                networkName = 'Polygon';
            }

            // 更新 UI - 顯示餘額
            this.showBalance(displayBalance, networkName);

            console.log('✅ SGT 餘額顯示成功:', displayBalance);

        } catch (error) {
            console.error('❌ SGT 餘額查詢失敗:', error);

            // 顯示錯誤狀態
            amountElement.textContent = '0';
            statusElement.textContent = '連接失敗';
            statusElement.className = 'balance-status error';
            container.classList.remove('hidden');
            if (switchButton) switchButton.classList.add('hidden');
        } finally {
            // 釋放更新鎖
            this.isUpdating = false;
            console.log('🔓 [SGT-Balance] 餘額更新完成，釋放鎖');
        }
    }

    showBalance(balance, networkName) {
        const container = document.getElementById('sgt-balance-header');
        const amountElement = document.getElementById('sgt-balance-amount');
        const statusElement = document.getElementById('balance-status');
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 顯示餘額
        amountElement.textContent = balance;
        statusElement.textContent = networkName;
        statusElement.className = 'balance-status success';
        container.classList.remove('hidden');

        // 隱藏切換按鈕
        if (switchButton) switchButton.classList.add('hidden');
    }

    showSwitchButton() {
        const container = document.getElementById('sgt-balance-header');
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 隱藏餘額顯示
        container.classList.add('hidden');

        // 顯示切換按鈕
        if (switchButton) {
            switchButton.classList.remove('hidden');
            switchButton.textContent = '🔗 切換至 Polygon';
        }
    }

    showPolygonComingSoon() {
        // 檢查錢包是否已連接，如果未連接就不顯示任何內容
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState || !walletState.isConnected) {
            console.log('👤 錢包未連接，不顯示 Polygon 即將推出訊息');
            this.showConnectPrompt();
            return;
        }

        const container = document.getElementById('sgt-balance-header');
        const amountElement = document.getElementById('sgt-balance-amount');
        const statusElement = document.getElementById('balance-status');
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 顯示即將推出訊息（只在錢包已連接時）
        amountElement.textContent = '即將推出';
        statusElement.textContent = 'Polygon';
        statusElement.className = 'balance-status warning';
        container.classList.remove('hidden');

        // 隱藏切換按鈕
        if (switchButton) switchButton.classList.add('hidden');
    }

    showConnectPrompt() {
        const container = document.getElementById('sgt-balance-header');
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 隱藏 SGT 餘額顯示（因為錢包未連接）
        container.classList.add('hidden');

        // 隱藏切換按鈕
        if (switchButton) switchButton.classList.add('hidden');

        console.log('👤 錢包未連接，隱藏 SGT 餘額顯示');
    }

    setupBalanceUpdateListener() {
        console.log('🔔 設置餘額更新監聽器...');

        // 監聽購買完成事件 - 使用防抖動機制
        document.addEventListener('sgtBalanceUpdated', (event) => {
            console.log('📬 收到 SGT 餘額更新事件:', event.detail);
            // 如果是購買完成觸發的，立即更新；其他情況使用防抖動
            if (event.detail.source === 'purchase') {
                console.log('🛒 [SGT-Balance] 購買完成，跳過（已由 refresh 處理）');
                return;
            }
            this.scheduleBalanceUpdate('sgtBalanceUpdated', 800);
        });

        console.log('✅ 餘額更新監聽器設置完成');
    }

    // 手動刷新餘額 - 立即執行，不受防抖動限制
    async refresh() {
        console.log('🔄 手動刷新 SGT 餘額（立即執行）...');

        // 清除任何待執行的更新
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }

        // 強制重置更新鎖和計時器
        this.isUpdating = false;
        this.lastUpdateTime = 0;

        await this.displayBalance();
    }
}

// 創建實例並初始化
let simpleSGTBalance;

function initSimpleSGTBalance() {
    if (simpleSGTBalance) {
        console.log('🔄 重新初始化簡化 SGT 餘額顯示器...');
    }

    simpleSGTBalance = new SimpleSGTBalance();
    window.simpleSGTBalance = simpleSGTBalance;

    // 添加全域刷新函數
    window.refreshSimpleSGT = () => {
        if (simpleSGTBalance) {
            simpleSGTBalance.refresh();
        } else {
            initSimpleSGTBalance();
        }
    };
}

// 立即初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimpleSGTBalance);
} else {
    // DOM 已載入，稍後初始化
    setTimeout(initSimpleSGTBalance, 100);
}

console.log('📝 簡化 SGT 餘額顯示器腳本載入完成');