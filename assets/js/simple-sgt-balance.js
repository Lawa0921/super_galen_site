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

        // 監聽統一錢包管理器的事件
        document.addEventListener('unifiedWalletStateChanged', (event) => {
            this.displayBalance();
        });

        // 等待統一錢包管理器載入並檢查初始狀態
        const waitForWalletManager = () => {
            if (window.unifiedWalletManager) {
                const state = window.unifiedWalletManager.getState();
                console.log('🚀 [SGT-Balance] 獲取初始狀態:', state);

                // 註冊監聽器
                window.unifiedWalletManager.addEventListener('sgt-balance', (state) => {
                    this.displayBalance();
                });

                this.displayBalance();
                console.log('✅ 錢包狀態監聽器設置完成');
            } else {
                console.log('⏳ 等待 UnifiedWalletManager 載入...');
                setTimeout(waitForWalletManager, 100);
            }
        };

        waitForWalletManager();
    }


    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDependencies = () => {
                if (document.readyState === 'complete' && typeof ethers !== 'undefined') {
                    console.log('📦 依賴項已載入');
                    resolve();
                } else {
                    // 減少 log 頻率，只在第一次和每10次檢查時輸出
                    if (!this.dependencyCheckCount) this.dependencyCheckCount = 0;
                    this.dependencyCheckCount++;
                    if (this.dependencyCheckCount === 1 || this.dependencyCheckCount % 10 === 0) {
                        console.log(`⏳ 等待依賴項載入... (${this.dependencyCheckCount})`);
                    }
                    setTimeout(checkDependencies, 200);
                }
            };
            checkDependencies();
        });
    }

    async displayBalance() {

        const container = document.getElementById('sgt-balance-header');
        const amountElement = document.getElementById('sgt-balance-amount');
        const switchButton = document.getElementById('switch-to-polygon-header');

        if (!container || !amountElement) {
            console.error('❌ SGT 餘額 DOM 元素未找到');
            return;
        }

        // 首先檢查錢包是否已連接
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState || !walletState.isConnected) {
            console.log('👤 錢包未連接，隱藏 SGT 餘額顯示');
            container.classList.add('hidden');
            if (switchButton) switchButton.classList.add('hidden');
            return;
        }

        try {
            // 使用錢包管理器的狀態
            const currentChainId = walletState.chainId;
            const userAddress = walletState.address;
            const provider = walletState.provider;

            if (!provider || !userAddress) {
                this.showConnectPrompt();
                return;
            }

            // 確認是支援的網路
            if (!(currentChainId in this.contracts)) {
                this.showSwitchButton();
                return;
            }

            // 檢查合約是否已部署
            if (!this.contracts[currentChainId]) {
                if (currentChainId === 137) {
                    this.showPolygonComingSoon();
                } else {
                    this.showSwitchButton();
                }
                return;
            }

            // 設置合約並查詢餘額
            const contract = new ethers.Contract(
                this.contracts[currentChainId],
                ["function balanceOf(address account) view returns (uint256)"],
                provider
            );

            const balance = await contract.balanceOf(userAddress);
            const balanceInEther = parseFloat(ethers.formatEther(balance));

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
            this.showBalance(displayBalance, networkName, balanceInEther);

        } catch (error) {
            console.error('❌ SGT 餘額查詢失敗:', error);

            // 顯示錯誤狀態
            amountElement.textContent = '0';
            container.classList.remove('hidden');

            // 更新 title 屬性顯示錯誤信息
            container.title = '查詢餘額失敗';

            if (switchButton) switchButton.classList.add('hidden');
        }
    }

    showBalance(balance, networkName, exactBalance = null) {
        const container = document.getElementById('sgt-balance-header');
        const amountElement = document.getElementById('sgt-balance-amount');
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 顯示餘額
        amountElement.textContent = balance;
        container.classList.remove('hidden');

        // 更新原生 title 屬性顯示精確餘額
        if (exactBalance !== null) {
            const formattedExactBalance = exactBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
            });
            container.title = `${formattedExactBalance} SGT`;
        } else {
            container.title = '餘額載入中...';
            console.warn('⚠️ [SGT-Balance] exactBalance 為空，設置預設 title');
        }

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
        const switchButton = document.getElementById('switch-to-polygon-header');

        // 顯示即將推出訊息（只在錢包已連接時）
        amountElement.textContent = '即將推出';
        container.classList.remove('hidden');

        // 更新 title 屬性
        container.title = 'Polygon 網路即將推出';

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
        // 監聽購買完成事件
        document.addEventListener('sgtBalanceUpdated', (event) => {
            this.displayBalance();
        });
    }

    // 手動刷新餘額
    async refresh() {
        console.log('🔄 手動刷新 SGT 餘額...');
        await this.displayBalance();
    }
}

// 創建實例並初始化
let simpleSGTBalance;

function initSimpleSGTBalance() {
    if (simpleSGTBalance) {
        console.log('🔄 重新初始化簡化 SGT 餘額顯示器...');
        return; // 避免重複初始化
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