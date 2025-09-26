const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * 完整的本地部署腳本
 *
 * 功能：
 * 1. 部署 SuperGalen Token (SGT) 合約
 * 2. 部署 Mock USDT 合約
 * 3. 設置 SGT 接受 USDT 購買
 * 4. 發送測試 ETH 到指定地址
 * 5. 更新部署地址到配置文件
 */

async function main() {
    console.log("🚀 開始完整本地部署流程...");

    // 獲取簽名者
    const [deployer, testUser, treasury] = await ethers.getSigners();
    console.log("👤 部署者地址:", deployer.address);
    console.log("💰 部署者餘額:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    console.log("🏦 Treasury 地址:", treasury.address);

    // ============================
    // 步驟 1: 部署 Mock USDT
    // ============================
    console.log("\n📦 步驟 1: 部署 Mock USDT...");
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mockUSDT = await MockUSDT.deploy();
    await mockUSDT.deployed();
    console.log("✅ Mock USDT 部署成功:", mockUSDT.address);

    // ============================
    // 步驟 2: 部署 SGT 代幣
    // ============================
    console.log("\n📦 步驟 2: 部署 SuperGalen Token...");

    const tokenConfig = {
        name: "SuperGalen Token",
        symbol: "SGT",
        initialSupply: ethers.utils.parseEther("1000000"), // 100萬代幣
        maxSupply: ethers.utils.parseEther("10000000"),    // 1000萬代幣上限
        defaultAdmin: deployer.address
    };

    const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");
    const sgt = await upgrades.deployProxy(
        SuperGalenTokenV1,
        [
            tokenConfig.name,
            tokenConfig.symbol,
            tokenConfig.initialSupply,
            tokenConfig.maxSupply,
            tokenConfig.defaultAdmin,
            mockUSDT.address,  // USDT 地址
            treasury.address  // treasury 地址使用獨立地址
        ],
        {
            kind: 'uups',
            initializer: 'initialize'
        }
    );

    await sgt.deployed();
    console.log("✅ SGT 代幣部署成功:", sgt.address);

    // ============================
    // 步驟 3: 設置 SGT 接受 USDT
    // ============================
    console.log("\n⚙️ 步驟 3: 設置 SGT 接受 USDT 支付...");

    // 設置 USDT 地址到 SGT 合約
    if (sgt.setUSDTContract) {
        await sgt.setUSDTContract(mockUSDT.address);
        console.log("✅ SGT 已設置接受 USDT 地址:", mockUSDT.address);
    } else {
        console.log("⚠️ SGT 合約沒有 setUSDTContract 方法，跳過設置");
    }

    // ============================
    // 步驟 4: 發送測試 ETH
    // ============================
    console.log("\n💸 步驟 4: 發送測試 ETH...");

    // 發送 10 ETH 給測試用戶
    const testAmount = ethers.utils.parseEther("10");
    const tx = await deployer.sendTransaction({
        to: testUser ? testUser.address : deployer.address,
        value: testAmount
    });
    await tx.wait();
    console.log("✅ 已發送 10 ETH 到地址:", testUser ? testUser.address : deployer.address);

    // ============================
    // 步驟 5: 鑄造測試 USDT
    // ============================
    console.log("\n🪙 步驟 5: 鑄造測試 USDT...");

    // 鑄造 10000 USDT 給部署者
    const usdtAmount = ethers.utils.parseUnits("10000", 6); // USDT 是 6 位小數
    await mockUSDT.mint(deployer.address, usdtAmount);
    console.log("✅ 已鑄造 10000 USDT 到部署者地址");

    // 如果有測試用戶，也給他一些 USDT
    if (testUser) {
        await mockUSDT.mint(testUser.address, usdtAmount);
        console.log("✅ 已鑄造 10000 USDT 到測試用戶地址");
    }

    // 鑄造 100000 USDT 給測試帳戶（用於直接測試）
    // 使用 Hardhat 預設帳戶 #0 作為主要測試帳戶
    const testWalletAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat 預設帳戶 #0

    // 帳戶 #0 已經是部署者，已經有 10000 USDT，再追加到 100000 USDT
    const additionalUsdtAmount = ethers.utils.parseUnits("90000", 6); // 追加 90000 USDT
    await mockUSDT.mint(testWalletAddress, additionalUsdtAmount);
    console.log(`✅ 已追加鑄造 90000 USDT 到帳戶 #0 (總計 100000 USDT): ${testWalletAddress}`);

    // 帳戶 #0 是部署者，已經有足夠的 ETH，不需要額外發送

    // ============================
    // 步驟 6: 更新部署地址文件
    // ============================
    console.log("\n📝 步驟 6: 更新部署地址...");

    const deploymentInfo = {
        network: "localhost",
        timestamp: new Date().toISOString(),
        contracts: {
            SGT: sgt.address,
            MockUSDT: mockUSDT.address
        },
        deployer: deployer.address,
        blockNumber: await ethers.provider.getBlockNumber()
    };

    // 更新 deployed_addresses.json
    const deploymentPath = path.join(__dirname, "../deployments/deployed_addresses.json");
    let deployments = {};

    if (fs.existsSync(deploymentPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    }

    deployments.localhost = {
        SGT: sgt.address,
        MockUSDT: mockUSDT.address,
        timestamp: deploymentInfo.timestamp
    };

    fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
    console.log("✅ 部署地址已更新到 deployed_addresses.json");

    // ============================
    // 步驟 7: 生成前端動態配置
    // ============================
    console.log("\n🔧 步驟 7: 生成前端動態配置...");

    // 生成 contracts-config.js
    const configPath = path.join(__dirname, "../../assets/js/contracts-config.js");
    const configContent = `/**
 * 動態合約配置
 * 此檔案由部署腳本自動生成，請勿手動修改
 * Generated at: ${new Date().toISOString()}
 */

window.ContractsConfig = {
    // 本地開發網路 (Hardhat)
    31337: {
        sgt: "${sgt.address}",
        usdt: "${mockUSDT.address}",
        deployedAt: "${new Date().toISOString()}"
    },

    // Polygon 主網
    137: {
        sgt: null, // 待部署
        usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Polygon 官方 USDT
        deployedAt: null
    }
};

console.log('📄 合約配置已載入:', window.ContractsConfig);`;

    fs.writeFileSync(configPath, configContent);
    console.log("✅ contracts-config.js 已生成");

    // ============================
    // 部署總結
    // ============================
    console.log("\n" + "=".repeat(60));
    console.log("🎉 部署完成！");
    console.log("=".repeat(60));
    console.log("\n📋 部署總結:");
    console.log("- SGT 代幣地址:", sgt.address);
    console.log("- Mock USDT 地址:", mockUSDT.address);
    console.log("- 部署者地址:", deployer.address);
    console.log("- 測試 ETH 已發送: 10 ETH 到帳戶 #1");
    console.log("- 測試 USDT 已鑄造:");
    console.log("  • 100000 USDT 給帳戶 #0 (部署者/主要測試帳戶)");
    console.log("  • 10000 USDT 給帳戶 #1");
    console.log("\n💡 提示: 使用 Hardhat 預設帳戶 #0 進行測試:");
    console.log("  地址: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    console.log("  餘額: 100000 USDT + ~9900 ETH");
    console.log("🚀 可以開始測試購買功能了！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失敗:", error);
        process.exit(1);
    });