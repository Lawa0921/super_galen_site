/* ===== MetaMask 連接權限測試 ===== */

console.log('🔗 MetaMask 連接權限測試開始...');

window.metamaskConnectTest = {
    // 檢查當前連接狀態
    checkConnectionStatus: async () => {
        if (!window.ethereum) {
            console.log('❌ MetaMask 不存在');
            return;
        }

        console.log('=== 連接狀態檢查 ===');

        // 檢查是否有權限讀取帳戶
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        console.log('📋 eth_accounts 結果:', accounts);

        if (accounts.length > 0) {
            console.log('✅ 網站已獲得帳戶權限');
            console.log('📱 連接的帳戶:', accounts[0]);
        } else {
            console.log('❌ 網站沒有帳戶權限');
        }

        // 檢查網路
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        console.log('🌐 當前網路:', chainId);

        // 檢查 MetaMask 是否認為網站已連接
        console.log('🔗 MetaMask 連接狀態:');
        console.log('  isConnected:', window.ethereum.isConnected ? window.ethereum.isConnected() : '未知');
        console.log('  selectedAddress:', window.ethereum.selectedAddress);

        return { accounts, chainId };
    },

    // 主動請求連接
    requestConnection: async () => {
        if (!window.ethereum) {
            console.log('❌ MetaMask 不存在');
            return;
        }

        console.log('🔗 主動請求 MetaMask 連接...');

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log('✅ 連接成功!');
            console.log('📱 授權的帳戶:', accounts);

            // 連接後立即設置事件監聽器
            console.log('🎯 連接後設置事件監聽器...');

            // 清除舊的監聽器
            if (window.ethereum.removeAllListeners) {
                window.ethereum.removeAllListeners('chainChanged');
                window.ethereum.removeAllListeners('accountsChanged');
            }

            // 設置新的監聽器
            window.ethereum.on('chainChanged', (chainId) => {
                console.log('🚨🚨🚨 連接後的 chainChanged 事件:', chainId);

                // 更新頁面顯示
                const display = document.getElementById('network-display');
                if (display) {
                    display.textContent = `連接後檢測: ${chainId}`;
                    display.style.background = 'lime';

                    setTimeout(() => {
                        display.style.background = 'black';
                    }, 3000);
                }
            });

            window.ethereum.on('accountsChanged', (accounts) => {
                console.log('👤👤👤 連接後的 accountsChanged 事件:', accounts);
            });

            console.log('✅ 連接後的事件監聽器已設置');
            console.log('🎯 現在請嘗試切換 MetaMask 網路!');

            return accounts;

        } catch (error) {
            console.error('❌ 連接失敗:', error);
            return null;
        }
    },

    // 測試斷開再重連
    testReconnect: async () => {
        console.log('🔄 測試重新連接流程...');

        // 這個操作會提示用戶在 MetaMask 中斷開連接
        alert('請在 MetaMask 中斷開與此網站的連接，然後點擊確定繼續');

        // 檢查斷開後的狀態
        await window.metamaskConnectTest.checkConnectionStatus();

        // 重新連接
        await window.metamaskConnectTest.requestConnection();
    }
};

// 自動執行初始檢查
window.metamaskConnectTest.checkConnectionStatus();

console.log('📋 測試方法已載入:');
console.log('  metamaskConnectTest.checkConnectionStatus() - 檢查連接狀態');
console.log('  metamaskConnectTest.requestConnection() - 主動請求連接');
console.log('  metamaskConnectTest.testReconnect() - 測試重新連接');