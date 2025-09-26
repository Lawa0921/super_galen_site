require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@openzeppelin/hardhat-upgrades");

// 載入環境變數，如果 .env 檔案存在
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64); // 預設測試私鑰
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com/";
const MUMBAI_RPC_URL = process.env.MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com/";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  paths: {
    sources: "./blockchain/contracts",
    tests: "./blockchain/test",
    cache: "./blockchain/cache",
    artifacts: "./blockchain/artifacts"
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true, // 支援更大的合約
        },
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 3000 // 每 3 秒出塊，模擬真實網路
      },
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 20,
        accountsBalance: "10000000000000000000000" // 10000 ETH per account
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 20,
        accountsBalance: "10000000000000000000000"
      }
    },
    mumbai: {
      url: MUMBAI_RPC_URL,
      chainId: 80001,
      accounts: [PRIVATE_KEY],
      gasPrice: 20000000000, // 20 Gwei
      gas: 6000000,
    },
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts: [PRIVATE_KEY],
      gasPrice: 50000000000, // 50 Gwei
      gas: 6000000,
    }
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
    }
  },
  mocha: {
    timeout: 40000
  }
};