const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 檢查測試帳戶餘額...\n");

    // 獲取所有帳戶
    const accounts = await ethers.getSigners();
    const deployedAddresses = require("../deployments/deployed_addresses.json");

    // 合約地址
    const sgtAddress = deployedAddresses.localhost.SGT;
    const usdtAddress = deployedAddresses.localhost.MockUSDT;

    console.log("📄 合約地址:");
    console.log("   SGT:", sgtAddress);
    console.log("   USDT:", usdtAddress);
    console.log("");

    // 獲取合約實例
    const usdt = await ethers.getContractAt("MockUSDT", usdtAddress);
    const sgt = await ethers.getContractAt("SuperGalenTokenV1", sgtAddress);

    // 檢查前三個帳戶
    for (let i = 0; i < 3; i++) {
        const account = accounts[i];
        console.log(`\n👤 帳戶 #${i}: ${account.address}`);

        // ETH 餘額
        const ethBalance = await ethers.provider.getBalance(account.address);
        console.log(`   ETH: ${ethers.utils.formatEther(ethBalance)} ETH`);

        // USDT 餘額
        const usdtBalance = await usdt.balanceOf(account.address);
        console.log(`   USDT: ${ethers.utils.formatUnits(usdtBalance, 6)} USDT`);

        // SGT 餘額
        const sgtBalance = await sgt.balanceOf(account.address);
        console.log(`   SGT: ${ethers.utils.formatEther(sgtBalance)} SGT`);
    }

    // 檢查 USDT 合約總供應量
    console.log("\n📊 USDT 合約狀態:");
    const totalSupply = await usdt.totalSupply();
    console.log(`   總供應量: ${ethers.utils.formatUnits(totalSupply, 6)} USDT`);

    // 檢查 SGT 合約中設定的 USDT 地址
    console.log("\n📊 SGT 合約狀態:");
    const sgtTotalSupply = await sgt.totalSupply();
    console.log(`   總供應量: ${ethers.utils.formatEther(sgtTotalSupply)} SGT`);

    // 嘗試獲取 SGT 合約中的 USDT 地址
    try {
        const usdtInSGT = await sgt.usdtToken();
        console.log(`   USDT 地址: ${usdtInSGT}`);
        console.log(`   USDT 地址匹配: ${usdtInSGT.toLowerCase() === usdtAddress.toLowerCase() ? "✅" : "❌"}`);
    } catch (error) {
        console.log("   無法獲取 USDT 地址（可能方法不存在）");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 錯誤:", error);
        process.exit(1);
    });