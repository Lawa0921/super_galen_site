/* ===== Web3 錢包 UI 控制器 ===== */

(function() {
    'use strict';

    // 目標網路 (Polygon Mainnet 或 Local Hardhat)
    const TARGET_NETWORKS = ['0x89', '0x7a69']; // Polygon Mainnet (137), Hardhat (31337)
    const POLYGON_MAINNET = '0x89';

    // UI 元素
    let elements = {};

    // UI 狀態
    let uiState = {
        isInitialized: false,
        currentState: 'loading', // loading, not-available, disconnected, wrong-network, connected
        lastWeb3State: null
    };

    // 錢包 UI 控制器
    class WalletUIController {
        constructor() {
            this.initialize();
        }

        // 初始化
        initialize() {
            console.log('WalletUI: 初始化中...');

            // 等待 DOM 載入
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupUI());
            } else {
                this.setupUI();
            }

            // 遊戲狀態不再管理 Web3 狀態，已移除相關監聽器

            // 監聽 Web3 事件
            this.setupWeb3EventListeners();
        }

        // 設置 UI
        setupUI() {
            // 獲取 UI 元素
            elements = {
                container: document.getElementById('wallet-container'),
                connectBtn: document.getElementById('connect-wallet-btn'),
                wrongNetworkGroup: document.getElementById('wallet-wrong-network-group'),
                switchNetworkBtn: document.getElementById('switch-network-btn'),
                cacheClearBtn: document.getElementById('cache-clear-btn'),
                disconnectBtn2: document.getElementById('disconnect-wallet-btn-2'),
                connectedGroup: document.getElementById('wallet-connected-group'),
                balanceDisplay: document.getElementById('wallet-balance-display'),
                sgtBalance: document.getElementById('sgt-balance'),
                sgtLabel: document.getElementById('sgt-label'),
                disconnectBtn: document.getElementById('disconnect-wallet-btn')
            };

            // 檢查所有元素並記錄日誌
            console.log('WalletUI: 元素檢查結果:', {
                container: !!elements.container,
                connectBtn: !!elements.connectBtn,
                wrongNetworkGroup: !!elements.wrongNetworkGroup,
                switchNetworkBtn: !!elements.switchNetworkBtn,
                cacheClearBtn: !!elements.cacheClearBtn,
                disconnectBtn2: !!elements.disconnectBtn2,
                connectedGroup: !!elements.connectedGroup,
                balanceDisplay: !!elements.balanceDisplay,
                sgtBalance: !!elements.sgtBalance,
                sgtLabel: !!elements.sgtLabel,
                disconnectBtn: !!elements.disconnectBtn
            });

            // 檢查元素是否存在
            if (!elements.container) {
                console.error('WalletUI: 找不到錢包容器元素');
                return;
            }

            // 綁定事件
            this.bindEvents();

            // 初始狀態檢查
            this.checkInitialState();

            uiState.isInitialized = true;
            console.log('WalletUI: 初始化完成');
        }

        // 綁定事件
        bindEvents() {
            if (elements.connectBtn) {
                elements.connectBtn.addEventListener('click', this.handleConnectClick.bind(this));
                console.log('WalletUI: Connect button event bound');
            }

            if (elements.switchNetworkBtn) {
                elements.switchNetworkBtn.addEventListener('click', this.handleSwitchNetworkClick.bind(this));
                console.log('WalletUI: Switch network button event bound');
            }

            if (elements.disconnectBtn) {
                elements.disconnectBtn.addEventListener('click', this.handleDisconnectClick.bind(this));
                console.log('WalletUI: Disconnect button event bound');
            }

            if (elements.cacheClearBtn) {
                elements.cacheClearBtn.addEventListener('click', this.handleCacheClearClick.bind(this));
                console.log('WalletUI: Cache clear button event bound');
            }

            if (elements.disconnectBtn2) {
                elements.disconnectBtn2.addEventListener('click', this.handleDisconnectClick.bind(this));
                console.log('WalletUI: Disconnect button 2 event bound');
            }

            // 地址點擊複製
            if (elements.walletAddress) {
                elements.walletAddress.addEventListener('click', this.handleAddressClick.bind(this));
                console.log('WalletUI: Address click event bound');
            }
        }

        // 設置 Web3 事件監聽
        setupWeb3EventListeners() {
            document.addEventListener('web3:not-available', () => {
                this.updateUIState('not-available');
            });

            document.addEventListener('web3:wallet-connected', (event) => {
                this.updateUIState('connected', event.detail);
            });

            document.addEventListener('web3:wallet-disconnected', () => {
                this.updateUIState('disconnected');
            });

            document.addEventListener('web3:network-changed', (event) => {
                this.handleNetworkChange(event.detail);
            });

            document.addEventListener('web3:balances-updated', (event) => {
                this.updateBalances(event.detail);
            });

            document.addEventListener('web3:wallet-error', (event) => {
                this.handleError(event.detail.error);
            });
        }

        // 檢查初始狀態
        async checkInitialState() {
            console.log('WalletUI: 檢查初始狀態...');

            if (typeof window.ethereum === 'undefined') {
                this.updateUIState('not-available');
                return;
            }

            try {
                // 檢查是否有已連接的帳戶
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });

                if (accounts.length === 0) {
                    // 沒有連接的帳戶
                    this.updateUIState('disconnected');
                    return;
                }

                // 有連接的帳戶，獲取當前網路
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                console.log('WalletUI: 發現已連接的錢包', {
                    account: accounts[0],
                    chainId: chainId
                });

                // 檢查網路是否正確
                const isCorrectNetwork = this.isCorrectNetwork(chainId);

                // 構建 Web3 狀態物件
                const web3State = {
                    isConnected: true,
                    account: accounts[0],
                    chainId: chainId,
                    networkName: this.getNetworkName(chainId),
                    maticBalance: '0',
                    sgtBalance: '0'
                };

                if (isCorrectNetwork) {
                    // 正確網路，顯示已連接狀態
                    console.log('WalletUI: 連接到正確網路，顯示狀態 3');
                    this.updateUIState('connected', web3State);
                } else {
                    // 錯誤網路，顯示切換網路狀態
                    console.log('WalletUI: 連接到錯誤網路，顯示狀態 2');
                    this.updateUIState('wrong-network', web3State);
                }

            } catch (error) {
                console.log('WalletUI: 檢查初始狀態失敗', error);
                this.updateUIState('disconnected');
            }
        }

        // 取得網路名稱（輔助方法）
        getNetworkName(chainId) {
            const networkNames = {
                '0x1': 'Ethereum Mainnet',
                '0x89': 'Polygon Mainnet',
                '0x7a69': 'Hardhat Local'
            };
            return networkNames[chainId] || 'Unknown Network';
        }

        // 更新 UI 狀態
        updateUIState(state, data = null) {
            console.log('WalletUI: 更新 UI 狀態', state, data);

            uiState.currentState = state;
            uiState.lastWeb3State = data;

            // 隱藏所有 UI 元素
            this.hideAllElements();

            switch (state) {
                case 'not-available':
                    this.showNotAvailableState();
                    break;
                case 'disconnected':
                    this.showDisconnectedState();
                    break;
                case 'wrong-network':
                    this.showWrongNetworkState(data);
                    break;
                case 'connected':
                    this.showConnectedState(data);
                    break;
                default:
                    console.warn('WalletUI: 未知的 UI 狀態', state);
            }
        }

        // 隱藏所有元素 - 清理所有顯示類別
        hideAllElements() {
            if (elements.container) {
                const oldClasses = elements.container.className;

                // 移除所有顯示類別，讓 CSS 預設隱藏規則生效
                elements.container.classList.remove('show-connect', 'show-switch', 'show-connected');

                const newClasses = elements.container.className;
                console.log('WalletUI: 🧹 清理 CSS 類別 - Classes:', oldClasses, '->', newClasses);
            }
        }

        // 顯示 MetaMask 未安裝狀態
        showNotAvailableState() {
            if (elements.container) {
                elements.container.classList.add('show-connect');
            }
            if (elements.connectBtn) {
                elements.connectBtn.innerHTML = `
                    <i class="fas fa-download"></i>
                    <span>安裝 MetaMask</span>
                `;
                elements.connectBtn.onclick = () => {
                    window.open('https://metamask.io/', '_blank');
                };
            }
        }

        // 顯示未連接狀態（狀態 1）
        showDisconnectedState() {
            if (elements.container) {
                elements.container.classList.add('show-connect');
            }
            if (elements.connectBtn) {
                elements.connectBtn.innerHTML = `
                    <i class="fas fa-wallet"></i>
                    <span>連接錢包</span>
                `;
                elements.connectBtn.onclick = this.handleConnectClick.bind(this);
                console.log('WalletUI: ✅ 狀態 1 - 只顯示連接按鈕');
            }
        }

        // 顯示網路錯誤狀態（狀態 2）
        showWrongNetworkState(web3State) {
            if (elements.container) {
                elements.container.classList.add('show-switch');
            }
            if (elements.switchNetworkBtn) {
                // 目標是 Polygon Mainnet
                elements.switchNetworkBtn.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>切換到 Polygon Mainnet</span>
                `;
                elements.switchNetworkBtn.onclick = this.handleSwitchNetworkClick.bind(this);
            }
            if (elements.disconnectBtn2) {
                elements.disconnectBtn2.onclick = this.handleDisconnectClick.bind(this);
            }
            console.log('WalletUI: ✅ 狀態 2 - 切換網路 + 斷開按鈕');
        }

        // 顯示已連接狀態（狀態 3）
        showConnectedState(web3State) {
            console.log('WalletUI: showConnectedState called with:', web3State);

            if (elements.container) {
                elements.container.classList.add('show-connected');
            }

            // 更新 SGT 餘額顯示
            this.updateSGTDisplay(web3State.chainId, web3State.sgtBalance || '0');

            // 綁定斷開按鈕事件
            if (elements.disconnectBtn) {
                elements.disconnectBtn.onclick = this.handleDisconnectClick.bind(this);
            }

            console.log('WalletUI: ✅ 狀態 3 - SGT 餘額 + 斷開按鈕');
        }

        // 更新 SGT 顯示
        updateSGTDisplay(chainId, balance) {
            if (!elements.sgtBalance || !elements.balanceDisplay) return;

            // 移除所有網路類別
            elements.balanceDisplay.classList.remove('polygon', 'hardhat');

            // 格式化餘額
            const formattedBalance = this.formatBalance(balance);
            elements.sgtBalance.textContent = formattedBalance;

            // 根據網路設定樣式和標籤
            switch (chainId) {
                case '0x89': // Polygon Mainnet
                    elements.balanceDisplay.classList.add('polygon');
                    if (elements.sgtLabel) {
                        elements.sgtLabel.textContent = 'SGT';
                    }
                    break;
                case '0x7a69': // Hardhat Local
                    elements.balanceDisplay.classList.add('hardhat');
                    if (elements.sgtLabel) {
                        elements.sgtLabel.textContent = 'SGT';
                    }
                    break;
                default:
                    if (elements.sgtLabel) {
                        elements.sgtLabel.textContent = 'SGT';
                    }
            }

            console.log('WalletUI: SGT display updated:', { chainId, balance: formattedBalance });
        }

        // 更新餘額顯示
        updateBalances(balanceData) {
            console.log('WalletUI: 🔄 更新餘額顯示', balanceData);

            const { matic, sgt } = balanceData;

            // 更新當前的餘額資料
            if (uiState.lastWeb3State) {
                uiState.lastWeb3State.maticBalance = matic;
                uiState.lastWeb3State.sgtBalance = sgt;
            }

            // 如果當前狀態是已連接，更新 SGT 顯示
            if (uiState.currentState === 'connected' && uiState.lastWeb3State) {
                this.updateSGTDisplay(uiState.lastWeb3State.chainId, sgt);
            }

            console.log('WalletUI: ✅ 餘額顯示已更新', { matic, sgt });
        }

        // 觸發 MetaMask 快取清理
        async triggerCacheClearing() {
            console.log('WalletUI: 🧹 觸發 MetaMask 快取清理...');

            try {
                // 顯示載入狀態
                this.showLoadingState('正在清理 MetaMask 快取...');

                // 呼叫 Web3Manager 的快取清理功能
                const clearResult = await window.Web3Manager.clearMetaMaskCache();

                if (clearResult) {
                    console.log('WalletUI: ✅ 快取清理成功');
                    // 等待一秒讓用戶看到成功訊息
                    this.showSuccessState('快取清理成功！');
                    setTimeout(() => {
                        // 重新檢查初始狀態
                        this.checkInitialState();
                    }, 1000);
                } else {
                    console.log('WalletUI: ❌ 快取清理失敗');
                    this.showErrorState('快取清理失敗，請手動重置 MetaMask');
                }
            } catch (error) {
                console.error('WalletUI: 快取清理過程中發生錯誤', error);
                this.showErrorState('快取清理失敗，請手動重置 MetaMask');
            }
        }

        // 觸發網路重新整理
        async triggerNetworkRefresh() {
            console.log('WalletUI: 🔄 觸發網路重新整理...');

            try {
                const refreshResult = await window.Web3Manager.forceNetworkRefresh();

                if (refreshResult) {
                    console.log('WalletUI: ✅ 網路狀態已重新整理');
                    this.showSuccessState('網路狀態已更新！');
                } else {
                    console.log('WalletUI: ℹ️ 網路狀態無需更新');
                }
            } catch (error) {
                console.error('WalletUI: 網路重新整理失敗', error);
                this.showErrorState('網路重新整理失敗');
            }
        }

        // 顯示載入狀態
        showLoadingState(message) {
            if (elements.container) {
                elements.container.innerHTML = `
                    <div class="wallet-loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>${message}</span>
                    </div>
                `;
            }
        }

        // 顯示成功狀態
        showSuccessState(message) {
            if (elements.container) {
                elements.container.innerHTML = `
                    <div class="wallet-success-state">
                        <i class="fas fa-check-circle"></i>
                        <span>${message}</span>
                    </div>
                `;
            }
        }

        // 顯示錯誤狀態
        showErrorState(message) {
            if (elements.container) {
                elements.container.innerHTML = `
                    <div class="wallet-error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${message}</span>
                        <button onclick="walletUI.checkInitialState()" class="retry-btn">重試</button>
                    </div>
                `;
            }
        }

        // handleGameStateUpdate 方法已移除
        // Web3 狀態現在完全由 Web3Manager 和瀏覽器錢包管理

        // 處理網路變更
        handleNetworkChange(networkData) {
            console.log('WalletUI: 🔄 網路變更事件', {
                received: networkData,
                currentState: uiState.currentState,
                lastWeb3State: uiState.lastWeb3State
            });

            const { chainId } = networkData;
            const isCorrect = this.isCorrectNetwork(chainId);

            console.log('WalletUI: 🔍 網路檢查結果', {
                chainId,
                isCorrect,
                targetNetworks: TARGET_NETWORKS
            });

            // 🔧 修復：檢查是否真的沒有連接，而不只是依賴 UI 狀態
            // 如果 MetaMask 不可用，才真正忽略
            if (uiState.currentState === 'not-available') {
                console.log('WalletUI: ⏭️ MetaMask 不可用，忽略網路變更');
                return;
            }

            // 如果狀態顯示未連接，但實際上可能已連接，檢查真實的 Web3 狀態
            if (uiState.currentState === 'disconnected') {
                const actualWeb3State = window.getWeb3State();
                if (!actualWeb3State.isConnected) {
                    console.log('WalletUI: ⏭️ 錢包確實未連接，忽略網路變更');
                    return;
                } else {
                    console.log('WalletUI: 🔄 UI 狀態不一致，但錢包實際已連接，繼續處理網路變更');
                }
            }

            // 🔧 修復：確保有有效的 Web3 狀態資料
            // 如果 lastWeb3State 不存在或不完整，使用當前的實際狀態
            const currentActualState = window.getWeb3State();
            const baseWeb3State = (uiState.lastWeb3State && uiState.lastWeb3State.account)
                                  ? uiState.lastWeb3State
                                  : currentActualState;

            const updatedWeb3State = { ...baseWeb3State, chainId };

            if (isCorrect) {
                // 網路正確 → 顯示已連接狀態
                console.log('WalletUI: ✅ 切換到正確網路，更新為已連接狀態');
                this.updateUIState('connected', updatedWeb3State);
            } else {
                // 網路錯誤 → 顯示錯誤網路狀態
                console.log('WalletUI: ❌ 切換到錯誤網路，更新為錯誤網路狀態');
                this.updateUIState('wrong-network', updatedWeb3State);
            }
        }

        // 處理連接按鈕點擊
        async handleConnectClick(event) {
            event.preventDefault();
            console.log('WalletUI: 連接錢包...');

            const button = event.currentTarget;
            this.setButtonLoading(button, true);

            try {
                const success = await window.connectWallet();
                if (!success) {
                    throw new Error('錢包連接失敗');
                }
            } catch (error) {
                console.error('WalletUI: 連接錢包失敗', error);
                this.showTemporaryMessage('連接失敗，請重試', 'error');
            } finally {
                this.setButtonLoading(button, false);
            }
        }

        // 處理切換網路按鈕點擊
        async handleSwitchNetworkClick(event) {
            event.preventDefault();
            console.log('WalletUI: 切換網路按鈕被點擊');

            const button = event.currentTarget;
            this.setButtonLoading(button, true);

            try {
                // 總是嘗試切換到 Polygon Mainnet
                let success = false;

                if (typeof window.Web3Manager?.switchToPolygonMainnet === 'function') {
                    success = await window.Web3Manager.switchToPolygonMainnet();
                } else if (typeof window.switchToPolygonMainnet === 'function') {
                    success = await window.switchToPolygonMainnet();
                } else {
                    // 手動切換邏輯
                    success = await this.switchToPolygonMainnet();
                }

                if (!success) {
                    throw new Error('網路切換失敗');
                }

                this.showTemporaryMessage('已切換到 Polygon Mainnet', 'success');
                console.log('WalletUI: 網路切換成功');
            } catch (error) {
                console.error('WalletUI: 切換網路失敗', error);
                this.showTemporaryMessage(`切換失敗: ${error.message}`, 'error');
            } finally {
                this.setButtonLoading(button, false);
            }
        }

        // 處理快取清理按鈕點擊
        async handleCacheClearClick(event) {
            event.preventDefault();
            console.log('WalletUI: 快取清理按鈕被點擊');

            const button = event.currentTarget;
            this.setButtonLoading(button, true);

            try {
                await this.triggerCacheClearing();
                console.log('WalletUI: 快取清理完成');
            } catch (error) {
                console.error('WalletUI: 快取清理失敗', error);
                this.showTemporaryMessage(`快取清理失敗: ${error.message}`, 'error');
            } finally {
                this.setButtonLoading(button, false);
            }
        }

        // 切換到 Polygon Mainnet
        async switchToPolygonMainnet() {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }], // Polygon Mainnet
                });
                return true;
            } catch (error) {
                if (error.code === 4902) {
                    // 網路不存在，嘗試添加
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x89',
                                chainName: 'Polygon Mainnet',
                                rpcUrls: ['https://polygon-rpc.com/'],
                                nativeCurrency: {
                                    name: 'MATIC',
                                    symbol: 'MATIC',
                                    decimals: 18
                                },
                                blockExplorerUrls: ['https://polygonscan.com/']
                            }]
                        });
                        return true;
                    } catch (addError) {
                        console.error('WalletUI: 添加 Polygon 網路失敗', addError);
                        return false;
                    }
                }
                return false;
            }
        }

        // 切換到本地網路 (開發環境)
        async switchToLocalNetwork() {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x7a69' }], // 31337
                });
                return true;
            } catch (error) {
                if (error.code === 4902) {
                    // 網路不存在，嘗試添加
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x7a69',
                                chainName: 'Hardhat Local',
                                rpcUrls: ['http://127.0.0.1:8545/'],
                                nativeCurrency: {
                                    name: 'ETH',
                                    symbol: 'ETH',
                                    decimals: 18
                                }
                            }]
                        });
                        return true;
                    } catch (addError) {
                        console.error('WalletUI: 添加本地網路失敗', addError);
                        return false;
                    }
                }
                return false;
            }
        }

        // 處理斷開按鈕點擊
        async handleDisconnectClick(event) {
            event.preventDefault();
            console.log('WalletUI: 斷開錢包...');

            try {
                // 調用 Web3Manager 的斷開方法
                await window.disconnectWallet();

                // 手動更新 UI 狀態到未連接
                this.updateUIState('disconnected');

                this.showTemporaryMessage('已斷開錢包連接', 'success');
                console.log('WalletUI: 斷開成功');
            } catch (error) {
                console.error('WalletUI: 斷開失敗', error);
                this.showTemporaryMessage('斷開失敗', 'error');
            }
        }

        // 處理地址點擊複製
        async handleAddressClick(event) {
            const address = event.currentTarget.title.replace('點擊複製: ', '');

            try {
                await navigator.clipboard.writeText(address);
                this.showTemporaryMessage('地址已複製', 'success');
            } catch (error) {
                console.error('WalletUI: 複製地址失敗', error);
                this.showTemporaryMessage('複製失敗', 'error');
            }
        }

        // 處理錯誤
        handleError(error) {
            console.error('WalletUI: Web3 錯誤', error);
            this.showTemporaryMessage(`錯誤: ${error}`, 'error');
        }

        // 檢查是否為正確網路
        isCorrectNetwork(chainId) {
            // 支援的網路：Polygon Mainnet 和 Hardhat Local
            return TARGET_NETWORKS.includes(chainId);
        }

        // 設置按鈕載入狀態
        setButtonLoading(button, isLoading) {
            if (!button) return;

            if (isLoading) {
                button.classList.add('wallet-loading');
                button.disabled = true;
            } else {
                button.classList.remove('wallet-loading');
                button.disabled = false;
            }
        }

        // 顯示臨時訊息
        showTemporaryMessage(message, type = 'info') {
            // 創建提示元素
            const toast = document.createElement('div');
            toast.className = `wallet-toast wallet-toast-${type}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: ${type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : '#339af0'};
                color: white;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                z-index: 10000;
                font-size: 0.9rem;
                font-weight: 500;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                transform: translateX(100%);
                transition: transform 0.3s ease;
            `;

            document.body.appendChild(toast);

            // 顯示動畫
            setTimeout(() => {
                toast.style.transform = 'translateX(0)';
            }, 10);

            // 自動隱藏
            setTimeout(() => {
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }, 3000);
        }

        // 格式化地址
        formatAddress(address) {
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        // 格式化餘額
        formatBalance(balance, decimals = 2) {
            const num = parseFloat(balance);
            if (isNaN(num)) return '0';
            if (num === 0) return '0';
            if (num < 0.01) return '< 0.01';
            return num.toFixed(decimals);
        }
    }

    // 初始化錢包 UI 控制器
    window.WalletUIController = new WalletUIController();

    // 提供測試方法 - 驗證三種狀態
    window.testWalletUI = {
        // 取得當前狀態
        getState: () => {
            return {
                currentState: uiState.currentState,
                isInitialized: uiState.isInitialized,
                lastWeb3State: uiState.lastWeb3State
            };
        },

        // 狀態 1: 未連接錢包
        state1: () => {
            window.WalletUIController.updateUIState('disconnected');
            console.log('🔹 狀態 1: 顯示連接錢包按鈕');
        },

        // 狀態 2: 連接了錢包但不是 Polygon 主網
        state2: () => {
            window.WalletUIController.updateUIState('wrong-network', {
                chainId: '0x1',
                account: '0x8b3f90f3f270226fa818009d29de9410bd3e6a9f'
            });
            console.log('🔹 狀態 2: 顯示切換到 Polygon 按鈕 + 斷開連結按鈕');
        },

        // 狀態 3a: 連接到 Polygon 主網
        state3Polygon: () => {
            window.WalletUIController.updateUIState('connected', {
                account: '0x8b3f90f3f270226fa818009d29de9410bd3e6a9f',
                chainId: '0x89',
                sgtBalance: '15000.5'
            });
            console.log('🔹 狀態 3a: 顯示 Polygon SGT 餘額 + 斷開連結按鈕');
        },

        // 狀態 3b: 連接到 Hardhat Local (開發用)
        state3Hardhat: () => {
            window.WalletUIController.updateUIState('connected', {
                account: '0x8b3f90f3f270226fa818009d29de9410bd3e6a9f',
                chainId: '0x7a69',
                sgtBalance: '996000'
            });
            console.log('🔹 狀態 3b: 顯示 Hardhat SGT 餘額 (Local) + 斷開連結按鈕');
        },

        // 🔧 網路變更測試
        testNetworkChange: (chainId) => {
            console.log(`🔧 測試網路變更到 ${chainId}`, {
                beforeState: uiState.currentState,
                beforeWeb3State: uiState.lastWeb3State
            });

            // 模擬網路變更事件
            const event = new CustomEvent('web3:network-changed', {
                detail: { chainId, networkName: `Test Network ${chainId}` },
                bubbles: true
            });

            document.dispatchEvent(event);
            console.log(`✅ 已發送網路變更事件: ${chainId}`, {
                afterState: uiState.currentState,
                afterWeb3State: uiState.lastWeb3State
            });
        },

        // 🔧 完整事件流程測試
        testEventFlow: () => {
            console.log('🔧 開始測試完整事件流程...');

            // 1. 先連接錢包 (模擬 Polygon 主網)
            console.log('步驟 1: 模擬錢包連接到 Polygon 主網');
            const connectEvent = new CustomEvent('web3:wallet-connected', {
                detail: {
                    account: '0x8b3f90f3f270226fa818009d29de9410bd3e6a9f',
                    chainId: '0x89',
                    networkName: 'Polygon Mainnet'
                },
                bubbles: true
            });
            document.dispatchEvent(connectEvent);

            setTimeout(() => {
                // 2. 切換到以太坊主網
                console.log('步驟 2: 模擬切換到以太坊主網');
                const networkEvent = new CustomEvent('web3:network-changed', {
                    detail: { chainId: '0x1', networkName: 'Ethereum Mainnet' },
                    bubbles: true
                });
                document.dispatchEvent(networkEvent);
            }, 1000);

            setTimeout(() => {
                // 3. 切換回 Polygon 主網
                console.log('步驟 3: 模擬切換回 Polygon 主網');
                const networkEvent2 = new CustomEvent('web3:network-changed', {
                    detail: { chainId: '0x89', networkName: 'Polygon Mainnet' },
                    bubbles: true
                });
                document.dispatchEvent(networkEvent2);
            }, 2000);
        }
    };

    console.log('WalletUI: 控制器已載入');
    console.log('📋 錢包狀態測試方法:');
    console.log('  🔹 testWalletUI.state1()         : 狀態 1 - 顯示連接錢包按鈕');
    console.log('  🔹 testWalletUI.state2()         : 狀態 2 - 切換到 Polygon + 斷開按鈕');
    console.log('  🔹 testWalletUI.state3Polygon()  : 狀態 3a - Polygon SGT 餘額 + 斷開按鈕');
    console.log('  🔹 testWalletUI.state3Hardhat()  : 狀態 3b - Hardhat SGT 餘額 + 斷開按鈕');
    console.log('🔧 網路變更測試方法:');
    console.log('  🔧 testWalletUI.testNetworkChange("0x1")  : 測試切換到以太坊主網');
    console.log('  🔧 testWalletUI.testNetworkChange("0x89") : 測試切換到 Polygon 主網');
    console.log('  🔧 testWalletUI.testEventFlow()          : 測試完整事件流程');;

})();