/* ===== Web3 錢包管理系統 ===== */

(function() {
    'use strict';

    // 網路配置
    const NETWORKS = {
        ETHEREUM_MAINNET: {
            chainId: '0x1',
            name: 'Ethereum Mainnet',
            rpc: 'https://mainnet.infura.io/v3/'
        },
        POLYGON_MAINNET: {
            chainId: '0x89',
            name: 'Polygon Mainnet',
            rpc: 'https://polygon-rpc.com/',
            currency: {
                name: 'MATIC',
                symbol: 'MATIC',
                decimals: 18
            },
            blockExplorer: 'https://polygonscan.com'
        },
        POLYGON_MUMBAI: {
            chainId: '0x13881',
            name: 'Polygon Mumbai',
            rpc: 'https://rpc-mumbai.maticvigil.com/',
            currency: {
                name: 'MATIC',
                symbol: 'MATIC',
                decimals: 18
            },
            blockExplorer: 'https://mumbai.polygonscan.com'
        },
        HARDHAT_LOCAL: {
            chainId: '0x7a69', // 31337
            name: 'Hardhat Local',
            rpc: 'http://127.0.0.1:8545/',
            currency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18
            }
        }
    };

    // SGT 代幣合約地址配置
    const SGT_CONTRACTS = {
        [NETWORKS.POLYGON_MAINNET.chainId]: '0x0000000000000000000000000000000000000000', // 需要真實的 Polygon SGT 合約地址
        [NETWORKS.HARDHAT_LOCAL.chainId]: '0x5FbDB2315678afecb367f032d93F642f64180aa3' // 本地合約 (預設 Hardhat 第一個合約地址)
    };

    // 網路配置映射（簡化版，移除 Mumbai）
    const SUPPORTED_NETWORKS = {
        '0x89': NETWORKS.POLYGON_MAINNET,
        '0x7a69': NETWORKS.HARDHAT_LOCAL
    };

    // SGT 代幣 ABI (簡化版)
    const SGT_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function balanceOf(address owner) view returns (uint256)',
        'function transfer(address to, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function totalSupply() view returns (uint256)',
        'event Transfer(address indexed from, address indexed to, uint256 value)'
    ];

    // Web3 狀態
    let web3State = {
        provider: null,
        signer: null,
        account: null,
        chainId: null,
        networkName: null,
        isConnected: false,
        sgtContract: null,
        sgtBalance: '0',
        maticBalance: '0'
    };

    // Web3 管理類
    class Web3Manager {
        constructor() {
            this.initialize();
        }

        async initialize() {
            // 檢查是否有 MetaMask
            if (typeof window.ethereum !== 'undefined') {
                console.log('Web3Manager: MetaMask detected');

                // 延遲一點時間確保 MetaMask 完全初始化
                await new Promise(resolve => setTimeout(resolve, 100));

                // 確保移除舊的事件監聽器，避免重複監聽
                try {
                    if (window.ethereum.removeAllListeners) {
                        window.ethereum.removeAllListeners('accountsChanged');
                        window.ethereum.removeAllListeners('chainChanged');
                    }
                } catch (error) {
                    console.log('Web3Manager: 移除舊監聽器時出現錯誤（正常現象）:', error.message);
                }

                // 設置標準的 MetaMask 事件監聽器
                try {
                    // 監聽帳戶變更
                    window.ethereum.on('accountsChanged', this.handleAccountsChanged.bind(this));
                    console.log('Web3Manager: 🔗 帳戶變更事件監聽器已設置');

                    // 監聽網路變更 - 使用標準 chainChanged 事件
                    window.ethereum.on('chainChanged', this.handleChainChanged.bind(this));
                    console.log('Web3Manager: 🔗 網路變更事件監聽器已設置');

                } catch (error) {
                    console.error('Web3Manager: 設置事件監聽器失敗:', error);
                }

                // 嘗試自動連接（如果之前已連接）
                await this.tryAutoConnect();
            } else {
                console.log('Web3Manager: MetaMask not detected');
                this.dispatchEvent('web3-not-available');
            }
        }

        // 測試事件監聽器
        testEventListeners() {
            console.log('Web3Manager: 🧪 測試事件監聽器...');

            // 檢查監聽器數量
            const events = window.ethereum._events || {};
            console.log('Web3Manager: 當前事件監聽器:', {
                chainChanged: events.chainChanged?.length || 0,
                accountsChanged: events.accountsChanged?.length || 0,
                networkChanged: events.networkChanged?.length || 0
            });
        }

        // 嘗試自動連接並正確檢測當前網路
        async tryAutoConnect() {
            try {
                console.log('Web3Manager: 🔍 檢查自動連接狀態...');

                if (!window.ethereum) {
                    console.log('Web3Manager: ❌ MetaMask 未檢測到，無法自動連接');
                    this.dispatchEvent('web3-not-available');
                    return;
                }

                const accounts = await window.ethereum.request({ method: 'eth_accounts' });

                if (accounts.length > 0) {
                    console.log('Web3Manager: ✅ 發現已連接帳戶，開始同步狀態...');

                    // 直接從 MetaMask 獲取當前網路（避免 ethers 快取問題）
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                    console.log('Web3Manager: 📡 當前網路 (直接從 MetaMask):', {
                        chainId: chainId,
                        networkName: this.getNetworkName(chainId)
                    });

                    // 呼叫 connectWallet 完成連接流程
                    await this.connectWallet();

                    console.log('Web3Manager: ✅ 自動連接完成');
                } else {
                    console.log('Web3Manager: 💡 沒有已連接的帳戶，等待用戶手動連接');
                    this.dispatchEvent('wallet-disconnected');
                }
            } catch (error) {
                console.error('Web3Manager: ❌ 自動連接失敗', error);
            }
        }

        // 連接錢包
        async connectWallet() {
            try {
                if (typeof window.ethereum === 'undefined') {
                    throw new Error('MetaMask not installed');
                }

                // 請求連接
                const accounts = await window.ethereum.request({
                    method: 'eth_requestAccounts'
                });

                if (accounts.length === 0) {
                    throw new Error('No accounts found');
                }

                // 建立 ethers provider
                web3State.provider = new ethers.providers.Web3Provider(window.ethereum);
                web3State.signer = web3State.provider.getSigner();
                web3State.account = accounts[0];

                // 直接從 MetaMask 獲取網路資訊（避免 ethers provider 快取）
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                web3State.chainId = chainId;
                web3State.networkName = this.getNetworkName(chainId);
                web3State.isConnected = true;

                console.log('Web3Manager: 🔍 直接從 MetaMask 獲取網路 (避免快取):', {
                    chainId: chainId,
                    networkName: web3State.networkName
                });

                // 初始化代幣合約
                await this.initializeContract();

                // 更新餘額
                await this.updateBalances();

                // 連接後無需啟動額外監控，chainChanged 事件已足夠

                // 發送事件
                this.dispatchEvent('wallet-connected', {
                    account: web3State.account,
                    chainId: web3State.chainId,
                    networkName: web3State.networkName
                });

                console.log('Web3Manager: Wallet connected', web3State);
                return true;
            } catch (error) {
                console.error('Web3Manager: Connect wallet failed', error);
                this.dispatchEvent('wallet-error', { error: error.message });
                return false;
            }
        }

        // 斷開錢包
        async disconnectWallet() {
            web3State.provider = null;
            web3State.signer = null;
            web3State.account = null;
            web3State.chainId = null;
            web3State.networkName = null;
            web3State.isConnected = false;
            web3State.sgtContract = null;
            web3State.sgtBalance = '0';
            web3State.maticBalance = '0';

            this.dispatchEvent('wallet-disconnected');
            console.log('Web3Manager: Wallet disconnected');
        }

        // MetaMask 快取清理和網路重置
        async clearMetaMaskCache() {
            console.log('Web3Manager: 🧹 清理 MetaMask 快取...');

            try {
                // 方法 1: 強制重新請求權限
                console.log('Web3Manager: 步驟 1 - 強制重新請求權限');
                await window.ethereum.request({
                    method: 'wallet_requestPermissions',
                    params: [{ eth_accounts: {} }]
                });

                // 方法 2: 重新獲取帳戶和網路資訊
                console.log('Web3Manager: 步驟 2 - 重新獲取狀態');
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                console.log('Web3Manager: 清理後的狀態', {
                    accounts: accounts,
                    chainId: chainId,
                    timestamp: new Date().toISOString()
                });

                // 更新本地狀態
                if (accounts.length > 0) {
                    web3State.account = accounts[0];
                    web3State.chainId = chainId;
                    web3State.networkName = this.getNetworkName(chainId);

                    // 觸發狀態更新
                    this.dispatchEvent('cache-cleared', {
                        account: accounts[0],
                        chainId: chainId,
                        networkName: web3State.networkName
                    });
                }

                return true;
            } catch (error) {
                console.error('Web3Manager: 快取清理失敗', error);
                return false;
            }
        }

        // 強化的網路狀態檢測 - 多重驗證機制
        async getEnhancedChainId() {
            console.log('Web3Manager: 🔍 開始強化網路檢測...');

            const results = [];
            const methods = [
                // 方法 1: 標準 eth_chainId
                async () => {
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    console.log('方法 1 (eth_chainId):', chainId);
                    return chainId;
                },
                // 方法 2: 重複 eth_chainId 檢查（避免 ethers 快取問題）
                async () => {
                    try {
                        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                        console.log('方法 2 (重複 eth_chainId):', chainId);
                        return chainId;
                    } catch (error) {
                        console.log('方法 2 失敗:', error.message);
                        return null;
                    }
                },
                // 方法 3: 重複檢查 eth_chainId (防止暫時性錯誤)
                async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    console.log('方法 3 (延遲 eth_chainId):', chainId);
                    return chainId;
                },
                // 方法 4: 使用 net_version 做為交叉驗證
                async () => {
                    try {
                        const netVersion = await window.ethereum.request({ method: 'net_version' });
                        const chainId = '0x' + parseInt(netVersion).toString(16);
                        console.log('方法 4 (net_version):', chainId, '(from net_version:', netVersion + ')');
                        return chainId;
                    } catch (error) {
                        console.log('方法 4 失敗:', error.message);
                        return null;
                    }
                }
            ];

            // 執行所有檢測方法
            for (let i = 0; i < methods.length; i++) {
                try {
                    const result = await methods[i]();
                    if (result) {
                        results.push(result);
                    }
                } catch (error) {
                    console.warn(`Web3Manager: 檢測方法 ${i + 1} 失敗:`, error.message);
                }
            }

            // 分析結果
            console.log('Web3Manager: 所有檢測結果:', results);

            if (results.length === 0) {
                throw new Error('所有網路檢測方法都失敗');
            }

            // 尋找最常見的結果
            const counts = {};
            results.forEach(chainId => {
                counts[chainId] = (counts[chainId] || 0) + 1;
            });

            const sortedResults = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const mostCommon = sortedResults[0][0];
            const confidence = sortedResults[0][1] / results.length;

            console.log('Web3Manager: 檢測分析結果:', {
                最常見結果: mostCommon,
                信心度: `${(confidence * 100).toFixed(1)}%`,
                所有結果: counts
            });

            // 如果信心度不夠高，發出警告
            if (confidence < 0.75) {
                console.warn('Web3Manager: ⚠️ 網路檢測結果不一致，可能存在 MetaMask 狀態問題');
            }

            return mostCommon;
        }

        // 強制網路重新整理（用於解決快取問題）
        async forceNetworkRefresh() {
            console.log('Web3Manager: 🔄 強制網路重新整理...');

            try {
                // 使用強化檢測獲取真實網路狀態
                const realChainId = await this.getEnhancedChainId();
                console.log('Web3Manager: 強化檢測結果:', realChainId);

                // 如果檢測到的與實際不符，嘗試修復
                if (realChainId !== web3State.chainId) {
                    console.log('Web3Manager: 🚨 檢測到網路不一致，執行修復', {
                        stored: web3State.chainId,
                        real: realChainId
                    });

                    // 更新狀態
                    const oldChainId = web3State.chainId;
                    web3State.chainId = realChainId;
                    web3State.networkName = this.getNetworkName(realChainId);

                    // 重新初始化合約
                    await this.initializeContract();
                    await this.updateBalances();

                    // 觸發網路變更事件
                    this.dispatchEvent('network-refreshed', {
                        oldChainId: oldChainId,
                        newChainId: realChainId,
                        networkName: web3State.networkName
                    });

                    return true;
                }

                return false;
            } catch (error) {
                console.error('Web3Manager: 網路重新整理失敗', error);
                return false;
            }
        }

        // 深度重置 MetaMask 連接（解決嚴重同步問題）
        async deepResetMetaMask() {
            console.log('Web3Manager: 🔥 執行 MetaMask 深度重置...');

            try {
                // 步驟 1: 完全清理當前狀態
                console.log('Web3Manager: 步驟 1 - 清理本地狀態');
                web3State.provider = null;
                web3State.signer = null;
                web3State.account = null;
                web3State.chainId = null;
                web3State.networkName = null;
                web3State.isConnected = false;
                web3State.sgtContract = null;

                // 步驟 2: 強制斷開 MetaMask 連接
                console.log('Web3Manager: 步驟 2 - 強制斷開 MetaMask');
                this.dispatchEvent('wallet-disconnected');

                // 等待一下讓狀態清理完成
                await new Promise(resolve => setTimeout(resolve, 1000));

                // 步驟 3: 多重網路狀態檢查
                console.log('Web3Manager: 步驟 3 - 多重網路狀態檢查');
                const checks = [];

                // 使用不同方法檢查網路
                for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    checks.push(chainId);
                    console.log(`Web3Manager: 檢查 ${i + 1}: ${chainId}`);
                }

                // 檢查結果是否一致
                const uniqueChainIds = [...new Set(checks)];
                if (uniqueChainIds.length > 1) {
                    console.log('Web3Manager: ⚠️ 檢測到網路狀態不穩定:', checks);
                } else {
                    console.log('Web3Manager: ✅ 網路狀態穩定:', uniqueChainIds[0]);
                }

                // 步驟 4: 重新連接 MetaMask
                console.log('Web3Manager: 步驟 4 - 重新連接 MetaMask');
                const accounts = await window.ethereum.request({
                    method: 'eth_requestAccounts'
                });

                if (accounts.length === 0) {
                    throw new Error('用戶拒絕連接');
                }

                // 步驟 5: 重新建立連接
                console.log('Web3Manager: 步驟 5 - 重新建立連接');
                web3State.provider = new ethers.providers.Web3Provider(window.ethereum);
                web3State.signer = web3State.provider.getSigner();
                web3State.account = accounts[0];

                // 再次檢查網路
                const finalChainId = await window.ethereum.request({ method: 'eth_chainId' });
                web3State.chainId = finalChainId;
                web3State.networkName = this.getNetworkName(finalChainId);
                web3State.isConnected = true;

                console.log('Web3Manager: 🎉 深度重置完成', {
                    account: web3State.account,
                    chainId: web3State.chainId,
                    networkName: web3State.networkName,
                    checks: checks
                });

                // 重新初始化
                await this.initializeContract();
                await this.updateBalances();

                // 觸發重新連接事件
                this.dispatchEvent('wallet-connected', {
                    account: web3State.account,
                    chainId: web3State.chainId,
                    networkName: web3State.networkName
                });

                return {
                    success: true,
                    finalChainId: finalChainId,
                    checks: checks,
                    account: web3State.account
                };

            } catch (error) {
                console.error('Web3Manager: 深度重置失敗', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        }

        // 簡化的狀態同步檢查 - 只在需要時使用
        async syncStateIfNeeded() {
            if (!window.ethereum) return;

            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });

                // 如果 MetaMask 有連接但我們認為未連接，同步狀態
                if (accounts.length > 0 && !web3State.isConnected) {
                    console.log('Web3Manager: 🔄 同步 MetaMask 連接狀態...');
                    await this.connectWallet();
                }
                // 如果 MetaMask 沒有連接但我們認為有連接，斷開狀態
                else if (accounts.length === 0 && web3State.isConnected) {
                    console.log('Web3Manager: 🔄 同步 MetaMask 斷開狀態...');
                    await this.disconnect();
                }
            } catch (error) {
                console.error('Web3Manager: 狀態同步失敗', error);
            }
        }

        // 增強型 chainChanged 事件處理
        async handleChainChangedEnhanced(chainId) {
            console.log('Web3Manager: 🚀 增強型網路變更處理', {
                oldChainId: web3State.chainId,
                newChainId: chainId,
                timestamp: new Date().toISOString()
            });

            // 確保 chainId 格式正確
            if (!chainId.startsWith('0x')) {
                chainId = '0x' + parseInt(chainId).toString(16);
            }

            const oldChainId = web3State.chainId;

            // 更新狀態
            web3State.chainId = chainId;
            web3State.networkName = this.getNetworkName(chainId);

            try {
                // 重新初始化合約和餘額
                await this.initializeContract();
                await this.updateBalances();

                // 觸發多種事件通知
                this.dispatchEvent('network-changed', {
                    chainId: chainId,
                    networkName: web3State.networkName,
                    previousChainId: oldChainId
                });

                this.dispatchEvent('web3:network-changed', {
                    chainId: chainId,
                    networkName: web3State.networkName,
                    previousChainId: oldChainId
                });

                // 遊戲狀態系統不再管理 Web3 狀態

                console.log('Web3Manager: ✅ 增強型網路變更處理完成', {
                    從: oldChainId,
                    到: chainId,
                    網路名稱: web3State.networkName
                });

            } catch (error) {
                console.error('Web3Manager: 增強型網路變更處理失敗', error);
            }
        }

        // 切換到 Polygon 主網
        async switchToPolygonMainnet() {
            return await this.switchToNetwork(NETWORKS.POLYGON_MAINNET);
        }

        // 切換到指定網路
        async switchToNetwork(network) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: network.chainId }],
                });
                return true;
            } catch (error) {
                // 如果網路不存在，嘗試添加
                if (error.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: network.chainId,
                                chainName: network.name,
                                rpcUrls: [network.rpc],
                                nativeCurrency: network.currency,
                                blockExplorerUrls: [network.blockExplorer]
                            }]
                        });
                        return true;
                    } catch (addError) {
                        console.error('Web3Manager: Add network failed', addError);
                        return false;
                    }
                } else {
                    console.error('Web3Manager: Switch network failed', error);
                    return false;
                }
            }
        }

        // 初始化合約
        async initializeContract() {
            const contractAddress = SGT_CONTRACTS[web3State.chainId];
            if (contractAddress && contractAddress !== '0x...') {
                try {
                    web3State.sgtContract = new ethers.Contract(
                        contractAddress,
                        SGT_ABI,
                        web3State.signer
                    );
                    console.log('Web3Manager: SGT contract initialized', contractAddress);
                } catch (error) {
                    console.error('Web3Manager: Contract initialization failed', error);
                }
            }
        }

        // 更新餘額
        async updateBalances() {
            if (!web3State.isConnected) return;

            try {
                // 添加延遲以避免 MetaMask Circuit Breaker
                await new Promise(resolve => setTimeout(resolve, 100));

                // 更新 MATIC 餘額
                const maticBalance = await web3State.provider.getBalance(web3State.account);
                web3State.maticBalance = ethers.utils.formatEther(maticBalance);

                // 更新 SGT 餘額
                web3State.sgtBalance = await this.getSGTBalance();
                console.log('Web3Manager: SGT balance updated:', web3State.sgtBalance);

                // 發送更新事件
                this.dispatchEvent('balances-updated', {
                    matic: web3State.maticBalance,
                    sgt: web3State.sgtBalance
                });

                console.log('Web3Manager: Balances updated', {
                    MATIC: web3State.maticBalance,
                    SGT: web3State.sgtBalance
                });
            } catch (error) {
                // 處理 Circuit Breaker 錯誤和其他 MetaMask 問題
                if (error.code === -32603) {
                    if (error.message.includes('circuit breaker')) {
                        console.warn('Web3Manager: MetaMask Circuit Breaker active, using fallback values...');
                    } else if (error.message.includes('Block tracker destroyed')) {
                        console.warn('Web3Manager: Block tracker destroyed, using fallback values...');
                    } else {
                        console.warn('Web3Manager: MetaMask RPC error, using fallback values...', error.message);
                    }

                    // 為 Hardhat Local 提供示範數據
                    if (web3State.chainId === '0x7a69') {
                        web3State.maticBalance = '10000';
                        web3State.sgtBalance = '996000'; // 減去已分發的 4000 SGT
                        console.log('Web3Manager: Using demo balances for Hardhat Local');
                    } else {
                        web3State.maticBalance = '0';
                        web3State.sgtBalance = '0';
                    }

                    // 發送更新事件
                    this.dispatchEvent('balances-updated', {
                        matic: web3State.maticBalance,
                        sgt: web3State.sgtBalance
                    });
                    return;
                }

                console.error('Web3Manager: Update balances failed', error);

                // 設置預設值
                web3State.maticBalance = '0';
                web3State.sgtBalance = '0';

                // 仍然發送事件，即使有錯誤
                this.dispatchEvent('balances-updated', {
                    matic: web3State.maticBalance,
                    sgt: web3State.sgtBalance
                });
            }
        }

        // 獲取 SGT 餘額
        async getSGTBalance() {
            if (!web3State.isConnected) return '0';

            const chainId = web3State.chainId;
            const account = web3State.account;

            try {
                // Polygon Mainnet
                if (chainId === '0x89') {
                    if (web3State.sgtContract) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const balance = await web3State.sgtContract.balanceOf(account);
                        const decimals = await web3State.sgtContract.decimals();
                        return ethers.utils.formatUnits(balance, decimals);
                    } else {
                        console.warn('Web3Manager: Polygon SGT contract not available');
                        return '0';
                    }
                }

                // Hardhat Local
                if (chainId === '0x7a69') {
                    if (web3State.sgtContract) {
                        try {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            const balance = await web3State.sgtContract.balanceOf(account);
                            const decimals = await web3State.sgtContract.decimals();
                            return ethers.utils.formatUnits(balance, decimals);
                        } catch (contractError) {
                            console.warn('Web3Manager: Hardhat SGT contract call failed, using demo data', contractError);
                            return this.getHardhatDemoBalance(account);
                        }
                    } else {
                        console.log('Web3Manager: Hardhat SGT contract not deployed, using demo data');
                        return this.getHardhatDemoBalance(account);
                    }
                }

                // 其他網路
                console.warn('Web3Manager: Unsupported network for SGT', chainId);
                return '0';

            } catch (error) {
                console.error('Web3Manager: Failed to get SGT balance', error);
                return '0';
            }
        }

        // 獲取 Hardhat 示範餘額
        getHardhatDemoBalance(account) {
            const accountLower = account.toLowerCase();

            // Hardhat 預設帳戶的示範 SGT 餘額
            const demoBalances = {
                '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': '996000', // 帳戶 0 (部署者)
                '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': '1000',   // 帳戶 1
                '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': '1000',   // 帳戶 2
                '0x90f79bf6eb2c4f870365e785982e1f101e93b906': '1000',   // 帳戶 3
                '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': '1000',   // 帳戶 4
                '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': '500',    // 帳戶 5
                '0x976ea74026e726554db657fa54763abd0c3a0aa9': '500',    // 帳戶 6
                '0x14dc79964da2c08b23698b3d3cc7ca32193d9955': '200',    // 帳戶 7
                '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f': '200',    // 帳戶 8
                '0xa0ee7a142d267c1f36714e4a8f75612f20a79720': '100'     // 帳戶 9
            };

            const balance = demoBalances[accountLower] || '0';
            console.log(`Web3Manager: Hardhat demo SGT balance for ${account}: ${balance}`);
            return balance;
        }

        // 處理帳戶變更
        async handleAccountsChanged(accounts) {
            console.log('Web3Manager: Accounts changed', accounts);

            if (accounts.length === 0) {
                await this.disconnectWallet();
            } else if (accounts[0] !== web3State.account) {
                await this.connectWallet();
            }
        }

        // 處理網路變更 - 根據官方文件改進
        async handleChainChanged(chainId) {
            console.log('Web3Manager: 🔄 網路變更事件', {
                oldChainId: web3State.chainId,
                newChainId: chainId
            });

            // 確保 chainId 是正確格式（十六進制）
            if (!chainId.startsWith('0x')) {
                chainId = '0x' + parseInt(chainId).toString(16);
            }

            const oldChainId = web3State.chainId;

            // 更新狀態
            web3State.chainId = chainId;
            web3State.networkName = this.getNetworkName(chainId);

            console.log('Web3Manager: 📊 網路已更新:', {
                chainId: chainId,
                networkName: web3State.networkName
            });

            try {
                // 重新初始化合約和餘額
                await this.initializeContract();
                await this.updateBalances();

                // 發送網路變更事件
                this.dispatchEvent('web3:network-changed', {
                    chainId: chainId,
                    networkName: web3State.networkName,
                    previousChainId: oldChainId
                });

                console.log('Web3Manager: ✅ 網路變更處理完成');

            } catch (error) {
                console.error('Web3Manager: 網路變更處理失敗', error);
            }

                // 🔧 修復：即使網路 ID 相同，也要確保 UI 狀態正確
                // 這解決了 UI 顯示錯誤網路但實際網路正確的問題
                this.dispatchEvent('web3:network-changed', {
                    chainId: chainId,
                    networkName: this.getNetworkName(chainId),
                    previousChainId: oldChainId
                });

                console.log('Web3Manager: 🔄 UI 狀態強制同步完成');
            }
        }

        // 取得網路名稱
        getNetworkName(chainId) {
            const network = Object.values(NETWORKS).find(n => n.chainId === chainId);
            return network ? network.name : 'Unknown Network';
        }

        // 檢查是否為目標網路
        isTargetNetwork() {
            return web3State.chainId === NETWORKS.POLYGON_MAINNET.chainId ||
                   web3State.chainId === NETWORKS.HARDHAT_LOCAL.chainId; // 開發環境支援
        }

        // 取得當前狀態
        getState() {
            return { ...web3State };
        }

        // 發送自定義事件
        dispatchEvent(eventName, detail = null) {
            const event = new CustomEvent(`web3:${eventName}`, {
                detail,
                bubbles: true
            });
            document.dispatchEvent(event);
        }

        // 格式化地址（縮短顯示）
        formatAddress(address) {
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        // 格式化餘額
        formatBalance(balance, decimals = 4) {
            const num = parseFloat(balance);
            if (num === 0) return '0';
            if (num < 0.0001) return '< 0.0001';
            return num.toFixed(decimals);
        }
    }

    // 延遲初始化 Web3 管理器，確保 MetaMask 完全準備好
    let web3ManagerInstance = null;

    function initializeWeb3Manager() {
        if (!web3ManagerInstance) {
            console.log('Web3Manager: 🚀 延遲初始化開始...');
            web3ManagerInstance = new Web3Manager();
            window.Web3Manager = web3ManagerInstance;
        }
        return web3ManagerInstance;
    }

    // 等待頁面和 MetaMask 都準備好後再初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeWeb3Manager, 500); // 額外延遲確保 MetaMask 準備好
        });
    } else {
        // 頁面已載入，延遲一點時間後初始化
        setTimeout(initializeWeb3Manager, 500);
    }

    // 提供全域存取方法（帶延遲初始化）
    window.getWeb3State = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.getState();
    };

    window.connectWallet = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.connectWallet();
    };
    window.disconnectWallet = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.disconnectWallet();
    };

    window.switchToPolygonMainnet = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.switchToPolygonMainnet();
    };

    window.updateWeb3Balances = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.updateBalances();
    };

    window.clearMetaMaskCache = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.clearMetaMaskCache();
    };
    window.forceNetworkRefresh = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.forceNetworkRefresh();
    };

    window.deepResetMetaMask = () => {
        const manager = window.Web3Manager || initializeWeb3Manager();
        return manager.deepResetMetaMask();
    };

    // 🔧 測試方法
    window.testWeb3Events = {
        // 測試是否有 MetaMask
        checkMetaMask: () => {
            console.log('🔧 MetaMask 檢查:', {
                hasEthereum: typeof window.ethereum !== 'undefined',
                isMetaMask: window.ethereum?.isMetaMask,
                chainId: window.ethereum?.chainId,
                networkVersion: window.ethereum?.networkVersion
            });
        },

        // 測試事件監聽器是否設置
        checkEventListeners: () => {
            console.log('🔧 Web3Manager 狀態:', window.Web3Manager.getState());

            // 檢查是否有監聽器
            if (window.ethereum?._events) {
                console.log('🔧 MetaMask 事件監聽器:', Object.keys(window.ethereum._events));
            }
        },

        // 手動觸發網路變更 (測試用)
        simulateNetworkChange: (chainId) => {
            console.log(`🔧 手動觸發網路變更: ${chainId}`);
            if (window.Web3Manager) {
                window.Web3Manager.handleChainChanged(chainId);
            }
        },

        // 🔥 強制監聽 MetaMask 事件（診斷用）
        forceListenMetaMask: () => {
            console.log('🔥 開始強制監聽 MetaMask 所有事件...');

            // 監聽所有可能的事件
            const events = [
                'chainChanged',
                'networkChanged',
                'accountsChanged',
                'connect',
                'disconnect',
                'message'
            ];

            events.forEach(eventName => {
                window.ethereum.on(eventName, (...args) => {
                    console.log(`🔥 MetaMask ${eventName} 事件:`, args);
                });
            });

            console.log('🔥 強制監聽器已設置，請嘗試切換網路...');
        },

        // 🔍 實時監控網路狀態 (舊版本)
        startNetworkMonitor: () => {
            console.log('🔍 開始實時監控網路狀態...');

            let lastChainId = window.ethereum.chainId;
            console.log('🔍 初始網路:', lastChainId);

            const monitor = setInterval(async () => {
                try {
                    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
                    if (currentChainId !== lastChainId) {
                        console.log(`🔍 檢測到網路變更! ${lastChainId} → ${currentChainId}`);
                        lastChainId = currentChainId;

                        // 手動觸發我們的處理程序
                        window.Web3Manager.handleChainChanged(currentChainId);
                    }
                } catch (error) {
                    console.log('🔍 監控錯誤:', error);
                }
            }, 1000);

            // 30 秒後停止監控
            setTimeout(() => {
                clearInterval(monitor);
                console.log('🔍 網路監控已停止');
            }, 30000);

            return monitor;
        },

        // 🚀 啟動積極監控（新版本）
        startAggressiveMonitoring: () => {
            console.log('🚀 啟動積極網路監控系統...');
            window.Web3Manager.startAggressiveNetworkMonitoring();
        },

        // 🛑 停止積極監控
        stopAggressiveMonitoring: () => {
            console.log('🛑 停止積極網路監控系統...');
            window.Web3Manager.stopAggressiveNetworkMonitoring();
        },

        // 🧪 測試增強型網路變更處理
        testEnhancedChainChange: (chainId) => {
            console.log(`🧪 測試增強型網路變更處理: ${chainId}`);
            if (window.Web3Manager) {
                window.Web3Manager.handleChainChangedEnhanced(chainId);
            }
        },

        // 📊 顯示監控狀態
        getMonitoringStatus: () => {
            const hasInterval = !!window.Web3Manager.networkMonitorInterval;
            console.log('📊 監控狀態:', {
                積極監控啟用: hasInterval,
                web3已連接: window.Web3Manager.getState().isConnected,
                當前網路: window.Web3Manager.getState().chainId,
                MetaMask可用: typeof window.ethereum !== 'undefined'
            });
            return hasInterval;
        },

        // 🔥 深度重置 MetaMask（解決嚴重同步問題）
        deepResetMetaMask: async () => {
            console.log('🔥 執行 MetaMask 深度重置...');
            const result = await window.Web3Manager.deepResetMetaMask();
            console.log('🔥 深度重置結果:', result);
            return result;
        },

        // 🔍 強化網路檢測測試
        testEnhancedNetworkDetection: async () => {
            console.log('🔍 測試強化網路檢測...');
            try {
                const result = await window.Web3Manager.getEnhancedChainId();
                console.log('✅ 強化檢測結果:', result);
                return result;
            } catch (error) {
                console.error('❌ 強化檢測失敗:', error);
                return null;
            }
        },

        // 🔬 深度診斷：完整的初始化流程追蹤
        deepDiagnoseInitFlow: async () => {
            console.log('🔬 ===== 開始深度診斷初始化流程 =====');

            // 步驟 1: 檢查 MetaMask 原始狀態
            console.log('🔬 步驟 1: MetaMask 原始狀態');
            try {
                // 🔧 修復：檢查 MetaMask 是否存在
                if (!window.ethereum) {
                    console.log('❌ MetaMask 未檢測到，無法進行深度診斷');
                    console.log('💡 請確保 MetaMask 已安裝並刷新頁面');
                    return false;
                }

                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                const netVersion = await window.ethereum.request({ method: 'net_version' });

                console.log('  📊 原始 API 回應:');
                console.log('    eth_chainId:', chainId);
                console.log('    eth_accounts:', accounts);
                console.log('    net_version:', netVersion);
            } catch (error) {
                console.error('  ❌ MetaMask API 檢測失敗:', error);
            }

            // 步驟 2: 檢查我們的系統狀態
            console.log('🔬 步驟 2: 系統內部狀態');
            const systemState = window.getWeb3State ? window.getWeb3State() : null;
            console.log('  🏠 Web3Manager 狀態:', systemState);

            // 步驟 3: 檢查事件監聽器
            console.log('🔬 步驟 3: 事件監聽器狀態');
            if (window.ethereum._events) {
                console.log('  📡 已註冊的事件監聽器:');
                Object.keys(window.ethereum._events).forEach(event => {
                    const count = window.ethereum._events[event]?.length || 0;
                    console.log(`    ${event}: ${count} 個監聽器`);
                });
            }

            // 步驟 4: 測試事件觸發
            console.log('🔬 步驟 4: 測試事件響應機制');
            console.log('  🧪 即將手動觸發 chainChanged 事件...');

            // 記錄觸發前的狀態
            const beforeTrigger = window.getWeb3State();
            console.log('  📊 觸發前狀態:', beforeTrigger);

            // 手動觸發一個測試事件
            setTimeout(() => {
                console.log('  🔥 手動觸發 chainChanged 事件 (測試)');
                if (window.Web3Manager && window.Web3Manager.handleChainChanged) {
                    window.Web3Manager.handleChainChanged('0x1'); // 測試切換到 ETH Mainnet

                    setTimeout(() => {
                        const afterTrigger = window.getWeb3State();
                        console.log('  📊 觸發後狀態:', afterTrigger);

                        if (beforeTrigger.chainId !== afterTrigger.chainId) {
                            console.log('  ✅ 事件處理機制正常運作');
                        } else {
                            console.log('  ❌ 事件處理機制可能有問題');
                        }

                        // 恢復原始狀態
                        setTimeout(() => {
                            window.Web3Manager.handleChainChanged(beforeTrigger.chainId);
                            console.log('  🔄 已恢復原始狀態');
                        }, 1000);
                    }, 500);
                }
            }, 1000);

            // 步驟 5: 檢查積極監控
            console.log('🔬 步驟 5: 積極監控狀態');
            const hasMonitoring = !!window.Web3Manager.networkMonitorInterval;
            console.log('  📊 積極監控啟用:', hasMonitoring);

            console.log('🔬 ===== 深度診斷完成 =====');
            return true;
        },

        // 🎯 專門診斷：初始化網路同步問題
        diagnoseInitNetworkSync: async () => {
            console.log('🎯 ===== 專門診斷：初始化網路同步問題 =====');

            // 步驟 1: 在任何操作前，直接從 MetaMask 獲取狀態
            console.log('🎯 步驟 1: 直接從 MetaMask 獲取當前狀態');
            try {
                // 🔧 修復：檢查 MetaMask 是否存在
                if (!window.ethereum) {
                    console.log('❌ MetaMask 未檢測到，無法進行網路同步診斷');
                    console.log('💡 請確保 MetaMask 已安裝並刷新頁面');
                    return false;
                }

                const directChainId = await window.ethereum.request({ method: 'eth_chainId' });
                const directAccounts = await window.ethereum.request({ method: 'eth_accounts' });
                console.log('  📊 MetaMask 直接回應:');
                console.log('    chainId:', directChainId);
                console.log('    accounts:', directAccounts);

                // 步驟 2: 檢查我們的初始化時機
                console.log('🎯 步驟 2: 檢查當前 DOM 狀態');
                console.log('  📄 document.readyState:', document.readyState);
                console.log('  🕐 頁面載入時間:', performance.now(), 'ms');

                // 步驟 3: 檢查我們的 tryAutoConnect 函數和當前狀態
                console.log('🎯 步驟 3: 檢查系統狀態與 MetaMask 的同步');
                if (window.Web3Manager && window.Web3Manager.tryAutoConnect) {
                    console.log('  ✅ tryAutoConnect 方法存在');

                    // 檢查當前系統狀態
                    const currentSystemState = window.getWeb3State();
                    console.log('  📊 當前系統狀態:', currentSystemState);

                    // 比較 MetaMask 實際狀態和系統狀態
                    if (currentSystemState.chainId !== directChainId) {
                        console.log('  ❌ 系統狀態與 MetaMask 不同步！');
                        console.log('    MetaMask 實際:', directChainId);
                        console.log('    系統狀態:', currentSystemState.chainId);
                        console.log('  💡 這表明初始化時沒有正確獲取當前網路狀態');
                    } else {
                        console.log('  ✅ 系統狀態與 MetaMask 同步');
                    }
                } else {
                    console.log('  ❌ tryAutoConnect 方法不存在');
                }

                // 步驟 4: 檢查事件監聽器的設置時機
                console.log('🎯 步驟 4: 檢查事件監聽器設置');
                if (window.ethereum._events) {
                    const chainChangedListeners = window.ethereum._events.chainChanged || [];
                    const accountsChangedListeners = window.ethereum._events.accountsChanged || [];

                    console.log('  📡 事件監聽器統計:');
                    console.log('    chainChanged:', chainChangedListeners.length, '個');
                    console.log('    accountsChanged:', accountsChangedListeners.length, '個');

                    if (chainChangedListeners.length === 0) {
                        console.log('  ❌ 沒有 chainChanged 監聽器！這可能是問題所在');
                    }
                } else {
                    console.log('  ❌ 無法訪問 MetaMask 事件系統');
                }

                // 步驟 5: 檢查事件處理機制的設置
                console.log('🎯 步驟 5: 檢查事件處理機制');
                if (window.Web3Manager.handleChainChanged) {
                    console.log('  ✅ handleChainChanged 方法存在');
                    console.log('  📋 事件處理機制已準備就緒');
                } else {
                    console.log('  ❌ handleChainChanged 方法不存在');
                }

                // 檢查網路監控機制
                if (window.Web3Manager.networkMonitorInterval) {
                    console.log('  ✅ 積極網路監控正在運行');
                } else {
                    console.log('  ⚠️ 積極網路監控未啟用');
                    console.log('  💡 建議執行: testWeb3Events.startAggressiveMonitoring()');
                }

                console.log('🎯 ===== 初始化網路同步診斷完成 =====');
                return true;

            } catch (error) {
                console.error('🎯 診斷過程中發生錯誤:', error);
                return false;
            }
        },

        // 🔧 純淨的 MetaMask 狀態檢測（不依賴任何快取）
        testPureMetaMaskState: async () => {
            console.log('🔧 執行純淨 MetaMask 狀態檢測...');
            console.log('==========================================');

            try {
                // 完全獨立的檢測，不使用任何現有變數
                console.log('1. 檢查 MetaMask 可用性...');
                if (!window.ethereum) {
                    console.log('❌ MetaMask 未安裝');
                    return null;
                }
                console.log('✅ MetaMask 可用');

                console.log('2. 檢查連接狀態...');
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                console.log('📋 帳戶:', accounts);
                if (accounts.length === 0) {
                    console.log('❌ 沒有連接的帳戶');
                    return null;
                }

                console.log('3. 直接獲取網路狀態...');
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                const netVersion = await window.ethereum.request({ method: 'net_version' });

                console.log('🔍 原始檢測結果:');
                console.log('  eth_chainId:', chainId);
                console.log('  net_version:', netVersion);
                console.log('  帳戶:', accounts[0]);

                // 網路名稱解析
                const networkNames = {
                    '0x1': 'Ethereum Mainnet',
                    '0x89': 'Polygon Mainnet',
                    '0x7a69': 'Hardhat Local'
                };

                const networkName = networkNames[chainId] || `未知網路 (${chainId})`;
                console.log('  網路名稱:', networkName);

                // 檢查與我們系統狀態的差異
                console.log('4. 對比系統狀態...');
                if (window.getWeb3State) {
                    const systemState = window.getWeb3State();
                    console.log('🏠 系統狀態:', systemState);

                    if (systemState.chainId !== chainId) {
                        console.log('🚨 發現不一致！');
                        console.log('  MetaMask 說:', chainId, '(' + networkName + ')');
                        console.log('  系統說:', systemState.chainId, '(' + systemState.networkName + ')');
                    } else {
                        console.log('✅ 狀態一致');
                    }
                }

                console.log('==========================================');

                return {
                    accounts: accounts,
                    chainId: chainId,
                    netVersion: netVersion,
                    networkName: networkName,
                    isConnected: accounts.length > 0
                };

            } catch (error) {
                console.error('❌ 純淨檢測失敗:', error);
                console.log('==========================================');
                return null;
            }
        },

        // 🧹 清理過時的 Web3 Cookie 資料
        clearStaleCookieData: () => {
            console.log('🧹 清理過時的 Web3 Cookie 資料...');

            try {
                // 檢查遊戲狀態 Cookie
                const cookieName = 'gameState'; // 遊戲狀態的 Cookie 名稱
                const cookies = document.cookie.split(';');

                for (let cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === cookieName && value) {
                        try {
                            const gameState = JSON.parse(decodeURIComponent(value));
                            if (gameState.web3) {
                                console.log('🚨 發現 Cookie 中的過時 Web3 資料:', gameState.web3);

                                // 移除 Web3 資料
                                delete gameState.web3;

                                // 重新保存 Cookie
                                const expires = new Date();
                                expires.setDate(expires.getDate() + 30); // 30 天後過期
                                document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(gameState))}; expires=${expires.toUTCString()}; path=/`;

                                console.log('✅ 已清理 Cookie 中的過時 Web3 資料');
                                return true;
                            } else {
                                console.log('✅ Cookie 中沒有 Web3 資料');
                                return false;
                            }
                        } catch (error) {
                            console.log('❌ 解析 Cookie 失敗:', error);
                        }
                    }
                }

                console.log('ℹ️ 未找到遊戲狀態 Cookie');
                return false;
            } catch (error) {
                console.error('🧹 清理 Cookie 資料失敗:', error);
                return false;
            }
        },

        // 🕵️ 診斷網路狀態不一致問題
        diagnoseNetworkMismatch: async () => {
            console.log('🕵️ 開始診斷網路狀態不一致問題...');

            try {
                const checks = [];

                // 進行 5 次網路檢查
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    checks.push({
                        check: i + 1,
                        chainId: chainId,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`🕵️ 檢查 ${i + 1}: ${chainId}`);
                }

                // 分析結果
                const chainIds = checks.map(c => c.chainId);
                const uniqueChainIds = [...new Set(chainIds)];

                const result = {
                    checks: checks,
                    allSame: uniqueChainIds.length === 1,
                    uniqueChainIds: uniqueChainIds,
                    currentWeb3State: window.Web3Manager.getState().chainId,
                    mismatch: uniqueChainIds[0] !== window.Web3Manager.getState().chainId
                };

                console.log('🕵️ 診斷結果:', result);

                if (result.mismatch) {
                    console.log('🚨 確認發現網路狀態不一致問題！');
                    console.log('💡 建議執行: testWeb3Events.deepResetMetaMask()');
                } else {
                    console.log('✅ 網路狀態正常');
                }

                return result;
            } catch (error) {
                console.error('🕵️ 診斷失敗:', error);
                return { error: error.message };
            }
        }
    };

    console.log('Web3Manager: Initialized successfully');
    console.log('🔧 測試方法已添加:');
    console.log('  • testWeb3Events.checkMetaMask() - 檢查 MetaMask');
    console.log('  • testWeb3Events.checkEventListeners() - 檢查事件監聽器');
    console.log('  • testWeb3Events.simulateNetworkChange(chainId) - 模擬網路變更');
    console.log('  • testWeb3Events.forceListenMetaMask() - 強制監聽所有 MetaMask 事件');
    console.log('  • testWeb3Events.startNetworkMonitor() - 開始實時網路監控 (舊版本)');
    console.log('🚀 新增強力監控方法:');
    console.log('  • testWeb3Events.startAggressiveMonitoring() - 啟動積極監控 (500ms)');
    console.log('  • testWeb3Events.stopAggressiveMonitoring() - 停止積極監控');
    console.log('  • testWeb3Events.testEnhancedChainChange(chainId) - 測試增強型處理');
    console.log('  • testWeb3Events.getMonitoringStatus() - 查看監控狀態');
    console.log('🔥 新增深度重置方法:');
    console.log('  • testWeb3Events.deepResetMetaMask() - 深度重置 MetaMask');
    console.log('  • testWeb3Events.diagnoseNetworkMismatch() - 診斷網路不一致問題');
    console.log('  • testWeb3Events.clearStaleCookieData() - 清理過時的 Web3 Cookie 資料');
    console.log('🔍 新增強化檢測方法:');
    console.log('  • testWeb3Events.testEnhancedNetworkDetection() - 測試強化網路檢測');
    console.log('  • testWeb3Events.testPureMetaMaskState() - 純淨 MetaMask 狀態檢測');
    console.log('  • testWeb3Events.deepDiagnoseInitFlow() - 深度診斷初始化流程');
    console.log('  • testWeb3Events.diagnoseInitNetworkSync() - 專門診斷初始化網路同步問題');

})();