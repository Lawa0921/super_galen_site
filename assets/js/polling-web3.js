/* ===== 輪詢式 Web3 錢包系統 ===== */

(function() {
    'use strict';

    console.log('🔄 輪詢式 Web3 系統開始載入...');

    // 狀態管理
    let currentState = null;
    let pollingInterval = null;
    let isPolling = false;

    // 支援的網路
    const POLYGON_MAINNET = '0x89';
    const HARDHAT_LOCAL = '0x7a69';
    const SUPPORTED_NETWORKS = [POLYGON_MAINNET, HARDHAT_LOCAL];

    // 檢查錢包狀態
    async function checkWalletState() {
        if (!window.ethereum) {
            return { status: 'no-metamask' };
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });

            if (accounts.length === 0) {
                return { status: 'disconnected' };
            }

            const chainId = await window.ethereum.request({ method: 'eth_chainId' });

            if (SUPPORTED_NETWORKS.includes(chainId)) {
                return {
                    status: 'connected-correct',
                    account: accounts[0],
                    chainId: chainId
                };
            } else {
                return {
                    status: 'connected-wrong',
                    account: accounts[0],
                    chainId: chainId
                };
            }

        } catch (error) {
            console.error('❌ 檢查錢包狀態失敗:', error);
            return { status: 'error', error: error.message };
        }
    }

    // 比較狀態是否有變化
    function hasStateChanged(newState, oldState) {
        if (!oldState) return true;

        return (
            newState.status !== oldState.status ||
            newState.account !== oldState.account ||
            newState.chainId !== oldState.chainId
        );
    }

    // 更新 UI
    function updateUI(state) {
        console.log('🎨 更新 UI:', state.status);

        const container = document.getElementById('wallet-container');
        if (!container) return;

        // 移除所有狀態類別
        container.classList.remove('show-connect', 'show-switch', 'show-connected');

        switch (state.status) {
            case 'no-metamask':
            case 'disconnected':
                container.classList.add('show-connect');
                break;

            case 'connected-wrong':
                container.classList.add('show-switch');
                break;

            case 'connected-correct':
                container.classList.add('show-connected');
                break;

            default:
                container.classList.add('show-connect');
        }
    }

    // 輪詢檢查
    async function pollWalletState() {
        const newState = await checkWalletState();

        if (hasStateChanged(newState, currentState)) {
            console.log('🚨 偵測到狀態變化!');
            console.log('舊狀態:', currentState);
            console.log('新狀態:', newState);

            currentState = newState;
            updateUI(currentState);

            // 觸發自訂事件
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('walletStateChanged', {
                    detail: currentState
                }));
            }
        }
    }

    // 開始輪詢
    function startPolling(interval = 1000) {
        if (isPolling) return;

        console.log(`🔄 開始輪詢檢查 (${interval}ms 間隔)`);
        isPolling = true;

        // 立即檢查一次
        pollWalletState();

        // 設置定期輪詢
        pollingInterval = setInterval(pollWalletState, interval);
    }

    // 停止輪詢
    function stopPolling() {
        if (!isPolling) return;

        console.log('🛑 停止輪詢檢查');
        isPolling = false;

        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // 連接錢包
    async function connectWallet() {
        console.log('🔗 嘗試連接錢包...');

        if (!window.ethereum) {
            alert('請安裝 MetaMask');
            return;
        }

        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log('✅ 連接請求成功');

            // 立即檢查狀態
            await pollWalletState();

        } catch (error) {
            console.error('❌ 連接失敗:', error);
            alert('連接失敗: ' + error.message);
        }
    }

    // 切換到 Polygon 網路
    async function switchToPolygon() {
        console.log('🔄 切換到 Polygon Mainnet...');

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: POLYGON_MAINNET }],
            });
            console.log('✅ 網路切換成功');

            // 立即檢查狀態
            await pollWalletState();

        } catch (error) {
            console.error('❌ 網路切換失敗:', error);
            alert('切換失敗: ' + error.message);
        }
    }

    // 綁定 UI 事件
    function bindUIEvents() {
        console.log('🎯 綁定 UI 事件...');

        const connectBtn = document.getElementById('connect-wallet-btn');
        const switchBtn = document.getElementById('switch-network-btn');

        if (connectBtn) {
            connectBtn.addEventListener('click', connectWallet);
            console.log('✅ 連接按鈕已綁定');
        }

        if (switchBtn) {
            switchBtn.addEventListener('click', switchToPolygon);
            console.log('✅ 切換按鈕已綁定');
        }
    }

    // 初始化系統
    function initialize() {
        console.log('🚀 初始化輪詢式 Web3 系統...');

        // 綁定 UI 事件
        bindUIEvents();

        // 開始輪詢 (每秒檢查一次)
        startPolling(1000);

        console.log('🎉 輪詢式 Web3 系統初始化完成');
    }

    // 暴露 API
    window.pollingWeb3 = {
        getState: () => currentState,
        startPolling: startPolling,
        stopPolling: stopPolling,
        connect: connectWallet,
        switchNetwork: switchToPolygon,
        forceCheck: pollWalletState
    };

    // 等待 DOM 載入
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }

    console.log('📋 輪詢式 Web3 API 已註冊: window.pollingWeb3');

})();