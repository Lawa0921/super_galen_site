/* ===== 完全乾淨的 Web3 錢包系統 ===== */

(function() {
    'use strict';

    console.log('🆕 乾淨 Web3 系統開始載入...');

    // 完全獨立的狀態 - 不與任何其他系統共享
    let walletState = null;

    // 支援的網路
    const POLYGON_MAINNET = '0x89';
    const HARDHAT_LOCAL = '0x7a69';
    const SUPPORTED_NETWORKS = [POLYGON_MAINNET, HARDHAT_LOCAL];

    // 強制清除任何可能的狀態殘留
    function clearAllState() {
        walletState = null;
        console.log('🧹 狀態已清除');
    }

    // 檢查當前錢包狀態 - 每次都重新檢查，不信任任何快取
    async function getCurrentWalletState() {
        console.log('🔍 重新檢查錢包狀態（不使用快取）...');

        if (!window.ethereum) {
            console.log('❌ 沒有 MetaMask');
            return { status: 'no-metamask' };
        }

        try {
            // 直接從 MetaMask 獲取最新狀態
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });

            if (accounts.length === 0) {
                console.log('🔌 錢包未連接');
                return { status: 'disconnected' };
            }

            const chainId = await window.ethereum.request({ method: 'eth_chainId' });

            console.log('📡 錢包狀態:', {
                account: accounts[0].substring(0, 6) + '...',
                chainId: chainId
            });

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

    // 更新 UI - 純粹基於當前狀態
    function updateUI(state) {
        console.log('🎨 更新 UI:', state.status);

        const container = document.getElementById('wallet-container');
        if (!container) {
            console.log('❌ 找不到 wallet-container');
            return;
        }

        // 移除所有狀態類別
        container.classList.remove('show-connect', 'show-switch', 'show-connected');

        switch (state.status) {
            case 'no-metamask':
            case 'disconnected':
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

            default:
                container.classList.add('show-connect');
                console.log('🤷 未知狀態，顯示連接');
        }
    }

    // 刷新整個狀態 - 重新檢查一切
    async function refresh() {
        console.log('🔄 完全刷新錢包狀態...');

        // 清除本地狀態
        clearAllState();

        // 重新檢查錢包
        walletState = await getCurrentWalletState();

        // 更新 UI
        updateUI(walletState);

        console.log('✅ 狀態刷新完成:', walletState.status);
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

            // 重新檢查狀態
            await refresh();

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

            // 重新檢查狀態
            await refresh();

        } catch (error) {
            console.error('❌ 網路切換失敗:', error);
            alert('切換失敗: ' + error.message);
        }
    }

    // 斷開錢包
    async function disconnectWallet() {
        console.log('🔌 斷開錢包連接...');

        // 這裡我們不能真正斷開 MetaMask，只能刷新狀態
        // 用戶需要在 MetaMask 中手動斷開
        alert('請在 MetaMask 中手動斷開連接，然後重新整理頁面');
    }

    // 網路變更事件處理
    function handleChainChanged(chainId) {
        console.log('🚨 網路變更事件:', chainId);

        // 立即刷新狀態，不信任任何快取
        setTimeout(refresh, 100); // 稍微延遲以確保 MetaMask 狀態已更新
    }

    // 帳戶變更事件處理
    function handleAccountsChanged(accounts) {
        console.log('👤 帳戶變更事件:', accounts.length > 0 ? accounts[0].substring(0, 6) + '...' : '無');

        // 立即刷新狀態
        setTimeout(refresh, 100);
    }

    // 設置事件監聽器
    function setupEventListeners() {
        if (!window.ethereum) return;

        console.log('🔗 設置事件監聽器...');

        // 移除可能存在的舊監聽器
        if (window.ethereum.removeAllListeners) {
            window.ethereum.removeAllListeners('chainChanged');
            window.ethereum.removeAllListeners('accountsChanged');
        }

        // 設置新監聽器
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('accountsChanged', handleAccountsChanged);

        console.log('✅ 事件監聽器已設置');
    }

    // 綁定 UI 事件
    function bindUIEvents() {
        console.log('🎯 綁定 UI 事件...');

        const connectBtn = document.getElementById('connect-wallet-btn');
        const switchBtn = document.getElementById('switch-network-btn');
        const disconnectBtn = document.getElementById('disconnect-wallet-btn');
        const disconnectBtn2 = document.getElementById('disconnect-wallet-btn-2');

        if (connectBtn) {
            connectBtn.addEventListener('click', connectWallet);
            console.log('✅ 連接按鈕已綁定');
        }

        if (switchBtn) {
            switchBtn.addEventListener('click', switchToPolygon);
            console.log('✅ 切換按鈕已綁定');
        }

        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', disconnectWallet);
            console.log('✅ 斷開按鈕已綁定');
        }

        if (disconnectBtn2) {
            disconnectBtn2.addEventListener('click', disconnectWallet);
            console.log('✅ 斷開按鈕2已綁定');
        }
    }

    // 初始化系統
    async function initialize() {
        console.log('🚀 初始化乾淨 Web3 系統...');

        // 清除任何殘留狀態
        clearAllState();

        // 設置事件監聽器
        setupEventListeners();

        // 綁定 UI 事件
        bindUIEvents();

        // 進行初始狀態檢查
        await refresh();

        console.log('🎉 乾淨 Web3 系統初始化完成');
    }

    // 暴露測試方法
    window.cleanWeb3 = {
        refresh: refresh,
        getState: () => walletState,
        connect: connectWallet,
        switchNetwork: switchToPolygon,
        disconnect: disconnectWallet,
        clearState: clearAllState
    };

    // 等待 DOM 載入後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // 延遲一點以確保其他腳本載入完成
        setTimeout(initialize, 100);
    }

    console.log('📋 測試方法已註冊: window.cleanWeb3');

})();