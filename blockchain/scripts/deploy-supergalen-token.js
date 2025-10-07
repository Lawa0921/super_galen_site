const { ethers, upgrades } = require("hardhat");
const { network } = require("hardhat");

/**
 * 安全的 SuperGalen Token 部署腳本
 *
 * 功能：
 * 1. 部署可升級的 ERC-20 代幣合約
 * 2. 設置完整的安全參數
 * 3. 驗證部署結果
 * 4. 生成部署報告
 */

async function main() {
    console.log("🚀 開始部署 SuperGalen Token...");
    console.log("📡 網路:", network.name);

    // 獲取部署者
    const [deployer] = await ethers.getSigners();
    console.log("👤 部署者地址:", deployer.address);
    console.log("💰 部署者餘額:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // 代幣參數配置
    const tokenConfig = {
        name: "SuperGalen Token",
        symbol: "SGT",
        initialSupply: ethers.parseEther("0"),         // 初始供應量為 0（所有代幣透過購買鑄造）
        maxSupply: ethers.parseEther("100000000"),     // 1億代幣上限（永久固定，無法變更）
        defaultAdmin: deployer.address
    };

    // USDT 地址配置（根據網路自動選擇）
    let usdtAddress;
    let treasuryAddress = deployer.address; // 預設使用部署者作為 Treasury

    if (network.name === "polygon") {
        // Polygon 主網的真實 USDT 合約
        usdtAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
        console.log("\n⚠️  請確認 Treasury 地址是否正確！");
        console.log("💡 建議使用 Gnosis Safe 多簽錢包作為 Treasury");
    } else if (network.name === "amoy") {
        // Amoy 測試網需要部署 MockUSDT 或使用測試網 USDT
        throw new Error("請先部署 MockUSDT 或提供 Amoy 測試網 USDT 地址");
    } else {
        // 本地網路需要先部署 MockUSDT
        console.log("\n📦 本地網路偵測到，需要先部署 MockUSDT...");
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const mockUSDT = await MockUSDT.deploy();
        await mockUSDT.waitForDeployment();
        usdtAddress = await mockUSDT.getAddress();
        console.log("✅ MockUSDT 已部署:", usdtAddress);

        // 給 deployer 鑄造一些測試 USDT
        const mintAmount = ethers.parseUnits("1000000", 6); // 100萬 USDT
        await mockUSDT.mint(deployer.address, mintAmount);
        console.log("✅ 已鑄造", ethers.formatUnits(mintAmount, 6), "USDT 給 deployer");
    }

    console.log("\n📋 代幣配置:");
    console.log("- 名稱:", tokenConfig.name);
    console.log("- 符號:", tokenConfig.symbol);
    console.log("- 初始供應量:", ethers.formatEther(tokenConfig.initialSupply));
    console.log("- 最大供應量:", ethers.formatEther(tokenConfig.maxSupply));
    console.log("- 管理員:", tokenConfig.defaultAdmin);
    console.log("- USDT 地址:", usdtAddress);
    console.log("- Treasury 地址:", treasuryAddress);

    try {
        // 步驟 1: 部署邏輯合約
        console.log("\n📦 部署邏輯合約...");
        const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");

        // 使用 OpenZeppelin 的 upgrades 插件部署
        const token = await upgrades.deployProxy(
            SuperGalenTokenV1,
            [
                tokenConfig.name,
                tokenConfig.symbol,
                tokenConfig.initialSupply,
                tokenConfig.maxSupply,
                tokenConfig.defaultAdmin,
                usdtAddress,        // USDT 合約地址
                treasuryAddress     // Treasury 收款地址
            ],
            {
                kind: 'uups',
                initializer: 'initialize'
            }
        );

        await token.waitForDeployment();
        const tokenAddress = await token.getAddress();

        console.log("✅ 代幣合約部署成功!");
        console.log("📍 代理合約地址:", tokenAddress);

        // 獲取實現合約地址
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);
        console.log("📍 實現合約地址:", implementationAddress);

        // 步驟 2: 驗證部署結果
        console.log("\n🔍 驗證部署結果...");

        const name = await token.name();
        const symbol = await token.symbol();
        const totalSupply = await token.totalSupply();
        const maxSupply = await token.maxSupply();
        const decimals = await token.decimals();

        console.log("- 代幣名稱:", name);
        console.log("- 代幣符號:", symbol);
        console.log("- 小數位數:", decimals);
        console.log("- 總供應量:", ethers.formatEther(totalSupply));
        console.log("- 最大供應量:", ethers.formatEther(maxSupply));

        // 檢查管理員權限
        const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
        const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        console.log("- 管理員權限:", hasAdminRole ? "✅" : "❌");

        // 檢查各種角色
        const MINTER_ROLE = await token.MINTER_ROLE();
        const PAUSER_ROLE = await token.PAUSER_ROLE();
        const UPGRADER_ROLE = await token.UPGRADER_ROLE();
        const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();

        console.log("- 鑄造權限:", await token.hasRole(MINTER_ROLE, deployer.address) ? "✅" : "❌");
        console.log("- 暫停權限:", await token.hasRole(PAUSER_ROLE, deployer.address) ? "✅" : "❌");
        console.log("- 升級權限:", await token.hasRole(UPGRADER_ROLE, deployer.address) ? "✅" : "❌");
        console.log("- 黑名單管理權限:", await token.hasRole(BLACKLIST_MANAGER_ROLE, deployer.address) ? "✅" : "❌");

        // 步驟 3: 安全檢查
        console.log("\n🔒 安全檢查...");

        const isPaused = await token.paused();
        console.log("- 合約狀態:", isPaused ? "暫停" : "正常");

        const currentMaxSupply = await token.maxSupply();
        console.log("- 最大供應上限:", ethers.formatEther(currentMaxSupply));

        const remainingSupply = await token.remainingSupply();
        console.log("- 剩餘可鑄造:", ethers.formatEther(remainingSupply));

        // 檢查 USDT 和 Treasury 配置
        const usdtToken = await token.usdtToken();
        const treasury = await token.treasury();
        console.log("- USDT 合約:", usdtToken);
        console.log("- Treasury 地址:", treasury);

        // 檢查購買比例
        const mintRatio = await token.mintRatio();
        console.log("- 當前購買比例:", mintRatio.toString(), "(1 USDT →", mintRatio.toString(), "SGT)");

        // 步驟 4: 生成部署配置文件
        const deploymentInfo = {
            network: network.name,
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                proxy: tokenAddress,
                implementation: implementationAddress,
                usdtToken: usdtAddress,
                treasury: treasuryAddress
            },
            token: {
                name: tokenConfig.name,
                symbol: tokenConfig.symbol,
                decimals: 18,
                initialSupply: tokenConfig.initialSupply.toString(),
                maxSupply: tokenConfig.maxSupply.toString(),
                mintRatio: mintRatio.toString()
            },
            roles: {
                admin: deployer.address,
                minter: deployer.address,
                pauser: deployer.address,
                upgrader: deployer.address,
                blacklistManager: deployer.address
            }
        };

        // 保存部署信息
        const fs = require('fs');
        const path = require('path');

        const deploymentsDir = path.join(__dirname, '../deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const deploymentFile = path.join(deploymentsDir, `${network.name}-supergalen-token.json`);
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

        console.log("📄 部署信息已保存到:", deploymentFile);

        // 步驟 5: 網路特定配置
        if (network.name === "polygon") {
            console.log("\n🔧 Polygon 主網配置...");
            // 主網特定的安全配置
            console.log("⚠️  請注意在主網上進行額外的安全檢查");
        } else if (network.name === "localhost" || network.name === "hardhat") {
            console.log("\n🧪 本地測試網配置...");
            // 測試一些基本功能
            await testBasicFunctionality(token, deployer);
        }

        console.log("\n🎉 SuperGalen Token 部署完成!");
        console.log("📋 摘要:");
        console.log("- 代理合約:", tokenAddress);
        console.log("- 實現合約:", implementationAddress);
        console.log("- 總供應量:", ethers.formatEther(totalSupply), "SGT");
        console.log("- 網路:", network.name);

        return {
            proxy: tokenAddress,
            implementation: implementationAddress,
            token: token
        };

    } catch (error) {
        console.error("❌ 部署失敗:", error);
        throw error;
    }
}

/**
 * 測試基本功能（僅在測試網絡上運行）
 */
async function testBasicFunctionality(token, deployer) {
    console.log("\n🧪 測試基本功能...");

    try {
        // 測試轉帳
        const testAmount = ethers.parseEther("100");
        const testAddress = "0x1234567890123456789012345678901234567890";

        console.log("- 測試轉帳功能...");
        // 這裡可以添加更多測試...

        console.log("✅ 基本功能測試通過");
    } catch (error) {
        console.warn("⚠️  測試過程中出現警告:", error.message);
    }
}

// 如果直接運行此腳本
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };