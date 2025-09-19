/* ===== 最基本的 MetaMask 測試 ===== */

console.log('🧪 開始最基本的 MetaMask 測試...');

// 測試 1: 檢查 MetaMask 是否存在
if (typeof window.ethereum !== 'undefined') {
    console.log('✅ MetaMask 已檢測到');

    // 測試 2: 檢查基本 API
    window.ethereum.request({ method: 'eth_chainId' })
        .then(chainId => {
            console.log('📡 當前網路:', chainId);

            // 在頁面上顯示當前網路
            document.body.insertAdjacentHTML('beforeend', `
                <div id="network-display" style="
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: black;
                    color: white;
                    padding: 10px;
                    border-radius: 5px;
                    z-index: 9999;
                    font-family: monospace;
                ">
                    當前網路: ${chainId}
                </div>
            `);
        })
        .catch(err => console.error('❌ 獲取網路失敗:', err));

    // 測試 3: 設置最簡單的事件監聽器
    console.log('🔗 設置網路變更監聽器...');

    window.ethereum.on('chainChanged', (chainId) => {
        console.log('🚨 網路變更事件觸發:', chainId);

        // 更新頁面顯示
        const display = document.getElementById('network-display');
        if (display) {
            display.textContent = `當前網路: ${chainId}`;
            display.style.background = 'red'; // 變紅表示事件被觸發了

            setTimeout(() => {
                display.style.background = 'black';
            }, 2000);
        }

        // 在控制台顯示大大的提醒
        console.log('🎉🎉🎉 事件成功觸發！網路已變更為:', chainId, '🎉🎉🎉');
    });

    // 測試 4: 設置帳戶變更監聽器
    window.ethereum.on('accountsChanged', (accounts) => {
        console.log('👤 帳戶變更事件觸發:', accounts);
    });

    console.log('✅ 事件監聽器已設置完成');
    console.log('📋 請現在切換 MetaMask 網路來測試事件是否觸發');

} else {
    console.log('❌ 沒有檢測到 MetaMask');

    // 在頁面上顯示錯誤
    document.body.insertAdjacentHTML('beforeend', `
        <div style="
            position: fixed;
            top: 10px;
            right: 10px;
            background: red;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 9999;
        ">
            沒有檢測到 MetaMask
        </div>
    `);
}

// 全域測試函數
window.testMetaMask = {
    getCurrentNetwork: async () => {
        if (window.ethereum) {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            console.log('當前網路:', chainId);
            return chainId;
        }
        return null;
    },

    getCurrentAccounts: async () => {
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            console.log('當前帳戶:', accounts);
            return accounts;
        }
        return [];
    },

    triggerManualEvent: (chainId = '0x1') => {
        console.log('手動觸發測試事件:', chainId);
        if (window.ethereum && window.ethereum.emit) {
            window.ethereum.emit('chainChanged', chainId);
        }
    }
};

console.log('📋 測試函數已載入: window.testMetaMask');
console.log('  testMetaMask.getCurrentNetwork() - 獲取當前網路');
console.log('  testMetaMask.getCurrentAccounts() - 獲取當前帳戶');
console.log('  testMetaMask.triggerManualEvent("0x89") - 手動觸發事件測試');