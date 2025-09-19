/* ===== 極簡 Web3 錢包系統 - 重新開始 ===== */

(function() {
    'use strict';

    console.log('🚀 極簡 Web3 系統開始載入...');

    // 極簡狀態
    let currentState = {
        isConnected: false,
        account: null,
        chainId: null
    };

    // 支援的網路
    const SUPPORTED_CHAINS = ['0x89', '0x7a69']; // Polygon Mainnet, Hardhat Local

    // UI 更新函數
    function updateUI() {
        console.log('🔄 更新 UI，當前狀態:', currentState);

        const container = document.getElementById('wallet-container');
        if (!container) return;

        // 清除所有狀態類別
        container.classList.remove('show-connect', 'show-switch', 'show-connected');

        if (!currentState.isConnected) {
            // 狀態 1: 未連接
            container.classList.add('show-connect');
            console.log('👤 顯示：未連接狀態');
        } else {
            // 已連接，檢查網路
            if (SUPPORTED_CHAINS.includes(currentState.chainId)) {
                // 狀態 3: 正確網路
                container.classList.add('show-connected');
                console.log('✅ 顯示：已連接正確網路');
            } else {
                // 狀態 2: 錯誤網路
                container.classList.add('show-switch');
                console.log('⚠️ 顯示：錯誤網路');
            }
        }
    }

    // 檢查當前狀態 - 直接同步方式
    async function checkCurrentState() {
        console.log('🔍 檢查當前 MetaMask 狀態...');

        if (!window.ethereum) {
            console.log('❌ 沒有 MetaMask');
            currentState = { isConnected: false, account: null, chainId: null };
            updateUI();
            return;
        }

        try {
            // 獲取帳戶
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });

            if (accounts.length === 0) {
                console.log('💡 MetaMask 未連接');
                currentState = { isConnected: false, account: null, chainId: null };
            } else {
                // 獲取當前網路
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                currentState = {
                    isConnected: true,
                    account: accounts[0],
                    chainId: chainId
                };

                console.log('✅ MetaMask 已連接:', {
                    account: accounts[0].substring(0, 6) + '...',
                    chainId: chainId
                });
            }
        } catch (error) {
            console.error('❌ 檢查狀態失敗:', error);
            currentState = { isConnected: false, account: null, chainId: null };
        }

        updateUI();
    }

    // 網路變更處理 - 極簡版
    function handleChainChanged(chainId) {
        console.log('🔄 網路變更事件:', chainId);

        if (currentState.isConnected) {
            currentState.chainId = chainId;
            console.log('📡 更新網路 ID:', chainId);
            updateUI();
        } else {
            console.log('⏭️ 未連接狀態，忽略網路變更');
        }
    }

    // 帳戶變更處理
    function handleAccountsChanged(accounts) {
        console.log('👤 帳戶變更事件:', accounts);

        if (accounts.length === 0) {
            console.log('🔌 帳戶已斷開');
            currentState = { isConnected: false, account: null, chainId: null };
        } else {
            console.log('🔗 帳戶已連接:', accounts[0].substring(0, 6) + '...');
            currentState.account = accounts[0];
            currentState.isConnected = true;
            // 重新檢查網路
            checkCurrentState();
            return; // checkCurrentState 會呼叫 updateUI
        }

        updateUI();
    }

    // 連接錢包
    async function connectWallet() {
        console.log('🔗 嘗試連接錢包...');

        if (!window.ethereum) {
            alert('請安裝 MetaMask');
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log('✅ 錢包連接成功');

            // 重新檢查完整狀態
            await checkCurrentState();
        } catch (error) {
            console.error('❌ 連接失敗:', error);
        }
    }

    // 初始化系統
    function initialize() {
        console.log('🎯 初始化極簡 Web3 系統...');

        // 設置事件監聽器
        if (window.ethereum) {
            console.log('🔗 設置 MetaMask 事件監聽器...');

            // 移除現有監聽器（如果有）
            if (window.ethereum.removeAllListeners) {
                window.ethereum.removeAllListeners('chainChanged');
                window.ethereum.removeAllListeners('accountsChanged');
            }

            // 設置新的監聽器
            window.ethereum.on('chainChanged', handleChainChanged);
            window.ethereum.on('accountsChanged', handleAccountsChanged);

            console.log('✅ 事件監聽器已設置');
        }

        // 綁定 UI 事件
        const connectBtn = document.getElementById('connect-wallet-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', connectWallet);
            console.log('✅ 連接按鈕事件已綁定');
        }

        // 檢查初始狀態
        checkCurrentState();

        console.log('🎉 極簡 Web3 系統初始化完成');
    }

    // 等待 DOM 載入後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // 暴露測試方法
    window.simpleWeb3Test = {
        checkState: checkCurrentState,
        currentState: () => currentState,
        forceUpdate: updateUI
    };

    console.log('📋 測試方法: window.simpleWeb3Test.checkState()');

})();