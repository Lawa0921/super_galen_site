/**
 * 動態合約配置
 * 此檔案由部署腳本自動生成，請勿手動修改
 * Generated at: 2026-01-14T03:34:39.459Z
 */

window.ContractsConfig = {
    // 本地開發網路 (Hardhat)
    31337: {
        sgt: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        usdt: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        deployedAt: "2026-01-14T03:34:39.459Z"
    },

    // Polygon 主網
    137: {
        sgt: null, // 待部署
        usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Polygon 官方 USDT
        deployedAt: null
    }
};

console.log('📄 合約配置已載入:', window.ContractsConfig);