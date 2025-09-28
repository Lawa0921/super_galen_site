const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

describe("Deployment Configuration", function () {
    let mockUSDT;
    let sgt;
    let deployer;

    beforeEach(async function () {
        [deployer] = await ethers.getSigners();

        // 部署 Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        mockUSDT = await MockUSDT.deploy();
        await mockUSDT.waitForDeployment();
    });

    describe("Config Generation", function () {
        it("Should generate valid contracts config", async function () {
            const configPath = path.join(__dirname, "../../assets/js/test-contracts-config.js");

            // 模擬配置生成
            const configContent = `window.ContractsConfig = {
    31337: {
        sgt: "${ethers.ZeroAddress}",
        usdt: "${mockUSDT.address}",
        deployedAt: "${new Date().toISOString()}"
    }
};`;

            fs.writeFileSync(configPath, configContent);

            // 檢查檔案是否生成
            expect(fs.existsSync(configPath)).to.be.true;

            // 檢查內容格式
            const content = fs.readFileSync(configPath, 'utf8');
            expect(content).to.include('window.ContractsConfig');
            expect(content).to.include(mockUSDT.address);
            expect(content).to.include('31337');

            // 清理測試檔案
            fs.unlinkSync(configPath);
        });

        it("Should validate contract addresses format", function () {
            const testAddress = mockUSDT.target;

            // 檢查地址格式
            expect(ethers.isAddress(testAddress)).to.be.true;
            expect(testAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
        });
    });

    describe("Deployment Integration", function () {
        it("Should maintain deployed addresses consistency", async function () {
            const deploymentPath = path.join(__dirname, "../deployments/deployed_addresses.json");

            if (fs.existsSync(deploymentPath)) {
                const deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

                // 檢查結構
                if (deployments.localhost) {
                    if (deployments.localhost.SGT) {
                        expect(ethers.isAddress(deployments.localhost.SGT)).to.be.true;
                    }
                    if (deployments.localhost.MockUSDT) {
                        expect(ethers.isAddress(deployments.localhost.MockUSDT)).to.be.true;
                    }
                }
            }
        });
    });
});