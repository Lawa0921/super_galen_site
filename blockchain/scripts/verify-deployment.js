const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 驗證部署結果...\n");

    // 獲取簽名者
    const [deployer, testUser] = await ethers.getSigners();

    // 從部署地址文件讀取地址
    const deployedAddresses = require("../deployments/deployed_addresses.json");
    const { SGT: sgtAddress, MockUSDT: usdtAddress } = deployedAddresses.localhost;

    console.log("📋 部署地址:");
    console.log("- SGT 合約:", sgtAddress);
    console.log("- USDT 合約:", usdtAddress);
    console.log("- 部署者:", deployer.address);
    console.log("- 測試用戶:", testUser.address);
    console.log();

    // 驗證 1: SGT 合約部署
    console.log("✅ 要求 1: SGT 合約部署");
    const sgt = await ethers.getContractAt("SuperGalenTokenV1", sgtAddress);
    const sgtName = await sgt.name();
    const sgtSymbol = await sgt.symbol();
    const totalSupply = await sgt.totalSupply();
    console.log(`  - 代幣名稱: ${sgtName}`);
    console.log(`  - 代幣符號: ${sgtSymbol}`);
    console.log(`  - 總供應量: ${ethers.utils.formatEther(totalSupply)} SGT`);
    console.log();

    // 驗證 2: USDT 合約部署
    console.log("✅ 要求 2: Mock USDT 合約部署");
    const usdt = await ethers.getContractAt("MockUSDT", usdtAddress);
    const usdtName = await usdt.name();
    const usdtSymbol = await usdt.symbol();
    const deployerUSDTBalance = await usdt.balanceOf(deployer.address);
    const testUserUSDTBalance = await usdt.balanceOf(testUser.address);
    console.log(`  - 代幣名稱: ${usdtName}`);
    console.log(`  - 代幣符號: ${usdtSymbol}`);
    console.log(`  - 部署者 USDT 餘額: ${ethers.utils.formatUnits(deployerUSDTBalance, 6)} USDT`);
    console.log(`  - 測試用戶 USDT 餘額: ${ethers.utils.formatUnits(testUserUSDTBalance, 6)} USDT`);

    // 檢查 SGT 是否知道 USDT 地址
    const sgtUSDTAddress = await sgt.usdtToken();
    console.log(`  - SGT 合約中的 USDT 地址: ${sgtUSDTAddress}`);
    console.log(`  - USDT 地址是否匹配: ${sgtUSDTAddress.toLowerCase() === usdtAddress.toLowerCase() ? "✅ 是" : "❌ 否"}`);
    console.log();

    // 驗證 3: 測試 ETH 發送
    console.log("✅ 要求 3: 測試 ETH 發送");
    const deployerBalance = await deployer.getBalance();
    const testUserBalance = await testUser.getBalance();
    console.log(`  - 部署者 ETH 餘額: ${ethers.utils.formatEther(deployerBalance)} ETH`);
    console.log(`  - 測試用戶 ETH 餘額: ${ethers.utils.formatEther(testUserBalance)} ETH`);
    console.log(`  - 測試用戶收到 ETH: ${parseFloat(ethers.utils.formatEther(testUserBalance)) > 9 ? "✅ 是" : "❌ 否"}`);
    console.log();

    console.log("🎉 所有驗證完成！");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 驗證失敗:", error);
        process.exit(1);
    });