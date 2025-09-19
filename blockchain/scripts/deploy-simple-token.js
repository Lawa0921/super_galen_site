const { ethers } = require("hardhat");

async function main() {
    console.log("部署 SimpleToken (SGT)...");

    // 獲取部署者帳戶
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("部署者餘額:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

    // 部署合約
    const SimpleToken = await ethers.getContractFactory("SimpleToken");
    const token = await SimpleToken.deploy();

    await token.deployed();

    console.log("SimpleToken (SGT) 已部署到:", token.address);
    console.log("總供應量:", ethers.utils.formatEther(await token.totalSupply()), "SGT");
    console.log("部署者的 SGT 餘額:", ethers.utils.formatEther(await token.balanceOf(deployer.address)), "SGT");

    // 轉一些代幣到其他測試帳戶
    const accounts = await ethers.getSigners();
    if (accounts.length > 1) {
        const transferAmount = ethers.utils.parseEther("1000");

        for (let i = 1; i < Math.min(5, accounts.length); i++) {
            await token.transfer(accounts[i].address, transferAmount);
            console.log(`轉移 1000 SGT 給帳戶 ${i}: ${accounts[i].address}`);
        }
    }

    console.log("\n部署完成！合約地址:", token.address);
    return token.address;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;