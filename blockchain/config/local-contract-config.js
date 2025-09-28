/**
 * 本地部署的 SuperGalen Token 配置
 * 用於前端整合
 */

const LOCAL_CONTRACT_CONFIG = {
    // 網路配置
    network: {
        name: "localhost",
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8545",
        currency: {
            name: "Ethereum",
            symbol: "ETH",
            decimals: 18
        }
    },

    // 合約地址 (從部署配置自動生成)
    contracts: {
        superGalenToken: {
            proxy: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            implementation: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
        }
    },

    // 代幣信息
    token: {
        name: "SuperGalen Token",
        symbol: "SGT",
        decimals: 18,
        initialSupply: "1000000",
        maxSupply: "10000000",
        mintingCap: "100000"
    },

    // 預設帳戶 (Hardhat 測試帳戶)
    accounts: {
        deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        user1: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        user2: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        user3: "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    },

    // 合約 ABI (關鍵函數)
    abi: {
        // 基本 ERC-20 函數
        balanceOf: "function balanceOf(address account) view returns (uint256)",
        totalSupply: "function totalSupply() view returns (uint256)",
        transfer: "function transfer(address to, uint256 amount) returns (bool)",
        approve: "function approve(address spender, uint256 amount) returns (bool)",
        allowance: "function allowance(address owner, address spender) view returns (uint256)",

        // SuperGalen Token 特有函數
        mint: "function mint(address to, uint256 amount)",
        burn: "function burn(uint256 amount)",
        pause: "function pause()",
        unpause: "function unpause()",
        paused: "function paused() view returns (bool)",

        // 黑名單功能
        isBlacklisted: "function isBlacklisted(address account) view returns (bool)",
        setBlacklisted: "function setBlacklisted(address account, bool blacklisted)",

        // 查詢函數
        maxSupply: "function maxSupply() view returns (uint256)",
        mintingCap: "function mintingCap() view returns (uint256)",
        remainingSupply: "function remainingSupply() view returns (uint256)",
        getContractHealth: "function getContractHealth() view returns (bool hasAdmin, bool hasUpgrader, bool hasPauser, bool hasMinter, bool hasBlacklistManager, bool isPaused, uint256 currentSupply, uint256 maxSupplyLimit, uint256 mintingCapLimit)",

        // 權限管理
        hasRole: "function hasRole(bytes32 role, address account) view returns (bool)",
        grantRole: "function grantRole(bytes32 role, address account)",
        revokeRole: "function revokeRole(bytes32 role, address account)",

        // 角色常數
        DEFAULT_ADMIN_ROLE: "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        MINTER_ROLE: "function MINTER_ROLE() view returns (bytes32)",
        PAUSER_ROLE: "function PAUSER_ROLE() view returns (bytes32)",
        UPGRADER_ROLE: "function UPGRADER_ROLE() view returns (bytes32)",
        BLACKLIST_MANAGER_ROLE: "function BLACKLIST_MANAGER_ROLE() view returns (bytes32)"
    },

    // 前端整合助手函數
    utils: {
        // 檢查是否為本地網路
        isLocalNetwork: function() {
            return window.ethereum && window.ethereum.chainId === '0x7a69'; // 31337 in hex
        },

        // 切換到本地網路
        switchToLocalNetwork: async function() {
            if (!window.ethereum) {
                throw new Error("請安裝 MetaMask");
            }

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x7a69' }], // 31337
                });
            } catch (switchError) {
                // 如果網路不存在，則添加它
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x7a69',
                            chainName: 'Hardhat Local',
                            nativeCurrency: {
                                name: 'Ethereum',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            rpcUrls: ['http://127.0.0.1:8545'],
                            blockExplorerUrls: null
                        }]
                    });
                } else {
                    throw switchError;
                }
            }
        },

        // 格式化代幣數量
        formatTokenAmount: function(amount, decimals = 18) {
            return (parseFloat(amount) / Math.pow(10, decimals)).toFixed(2);
        },

        // 解析代幣數量
        parseTokenAmount: function(amount, decimals = 18) {
            return (parseFloat(amount) * Math.pow(10, decimals)).toString();
        }
    },

    // 常用操作的 Gas 估算
    gasEstimates: {
        transfer: 65000,
        mint: 80000,
        approve: 50000,
        burn: 60000,
        pause: 45000,
        setBlacklisted: 55000
    },

    // 開發配置
    development: {
        // 是否啟用詳細日志
        verbose: true,

        // 自動刷新間隔 (毫秒)
        refreshInterval: 5000,

        // 測試用戶資料 (僅地址，私鑰請自行從 Hardhat 控制台獲取)
        testUsers: [
            {
                name: "Alice",
                address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                // 私鑰已移除，請使用 hardhat console 或 .env 文件管理
            },
            {
                name: "Bob",
                address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
                // 私鑰已移除，請使用 hardhat console 或 .env 文件管理
            }
        ]
    }
};

// 如果在 Node.js 環境中
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LOCAL_CONTRACT_CONFIG;
}

// 如果在瀏覽器環境中
if (typeof window !== 'undefined') {
    window.LOCAL_CONTRACT_CONFIG = LOCAL_CONTRACT_CONFIG;
}