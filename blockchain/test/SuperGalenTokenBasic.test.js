const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SuperGalenToken 基本功能測試", function () {
    let token;
    let owner;
    let minter;
    let pauser;
    let upgrader;
    let blacklistManager;
    let user1;
    let user2;

    const INITIAL_SUPPLY = ethers.utils.parseEther("1000000");
    const MAX_SUPPLY = ethers.utils.parseEther("10000000");
    const TOKEN_NAME = "SuperGalen Token";
    const TOKEN_SYMBOL = "SGT";

    beforeEach(async function () {
        [owner, minter, pauser, upgrader, blacklistManager, user1, user2] = await ethers.getSigners();

        // 部署 Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const mockUSDT = await MockUSDT.deploy();
        await mockUSDT.deployed();

        const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");
        token = await upgrades.deployProxy(
            SuperGalenTokenV1,
            [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, MAX_SUPPLY, owner.address, mockUSDT.address, owner.address],
            { kind: 'uups', initializer: 'initialize' }
        );
        await token.deployed();

        // 設置角色
        const MINTER_ROLE = await token.MINTER_ROLE();
        const PAUSER_ROLE = await token.PAUSER_ROLE();
        const UPGRADER_ROLE = await token.UPGRADER_ROLE();
        const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();

        await token.grantRole(MINTER_ROLE, minter.address);
        await token.grantRole(PAUSER_ROLE, pauser.address);
        await token.grantRole(UPGRADER_ROLE, upgrader.address);
        await token.grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);
    });

    describe("初始化測試", function () {
        it("應該正確設置代幣基本信息", async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await token.decimals()).to.equal(18);
            expect((await token.totalSupply()).toString()).to.equal(INITIAL_SUPPLY.toString());
            expect((await token.maxSupply()).toString()).to.equal(MAX_SUPPLY.toString());
        });

        it("應該將初始供應量分配給部署者", async function () {
            const balance = await token.balanceOf(owner.address);
            expect(balance.toString()).to.equal(INITIAL_SUPPLY.toString());
        });

        it("應該正確設置管理員角色", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
            const hasRole = await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
            expect(hasRole).to.be.true;
        });
    });

    describe("ERC20 基本功能測試", function () {
        it("應該允許代幣轉帳", async function () {
            const transferAmount = ethers.utils.parseEther("1000");

            await token.connect(owner).transfer(user1.address, transferAmount);

            const user1Balance = await token.balanceOf(user1.address);
            expect(user1Balance.toString()).to.equal(transferAmount.toString());
        });

        it("應該允許授權和代理轉帳", async function () {
            const approveAmount = ethers.utils.parseEther("1000");
            const transferAmount = ethers.utils.parseEther("500");

            await token.connect(owner).approve(user1.address, approveAmount);
            await token.connect(user1).transferFrom(owner.address, user2.address, transferAmount);

            const user2Balance = await token.balanceOf(user2.address);
            expect(user2Balance.toString()).to.equal(transferAmount.toString());
        });

        it("應該正確處理餘額不足", async function () {
            const transferAmount = ethers.utils.parseEther("1000");

            try {
                await token.connect(user1).transfer(user2.address, transferAmount);
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("ERC20: transfer amount exceeds balance");
            }
        });
    });

    describe("鑄造功能測試", function () {
        it("有權限的鑄造者應該能夠鑄造代幣", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            await token.connect(minter).mint(user1.address, mintAmount);

            const balance = await token.balanceOf(user1.address);
            expect(balance.toString()).to.equal(mintAmount.toString());
        });

        it("無權限用戶不應該能夠鑄造代幣", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            try {
                await token.connect(user1).mint(user2.address, mintAmount);
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("AccessControl");
            }
        });

        it("應該阻止超過最大供應量的鑄造", async function () {
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const remainingSupply = maxSupply.sub(currentSupply);
            const excessAmount = remainingSupply.add(ethers.utils.parseEther("1"));

            try {
                await token.connect(minter).mint(user1.address, excessAmount);
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("ExceedsMaxSupply");
            }
        });
    });

    describe("暫停功能測試", function () {
        it("有權限的暫停者應該能夠暫停合約", async function () {
            await token.connect(pauser).pause();
            const isPaused = await token.paused();
            expect(isPaused).to.be.true;
        });

        it("暫停狀態下應該阻止轉帳", async function () {
            await token.connect(pauser).pause();

            try {
                await token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"));
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("paused");
            }
        });

        it("應該能夠恢復合約", async function () {
            await token.connect(pauser).pause();
            await token.connect(pauser).unpause();

            const isPaused = await token.paused();
            expect(isPaused).to.be.false;
        });
    });

    describe("黑名單功能測試", function () {
        it("應該能夠將地址加入黑名單", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);
            const isBlacklisted = await token.isBlacklisted(user1.address);
            expect(isBlacklisted).to.be.true;
        });

        it("應該阻止黑名單地址接收代幣", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            try {
                await token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"));
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("BlacklistedAccount");
            }
        });

        it("應該能夠從黑名單移除地址", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);
            await token.connect(blacklistManager).setBlacklisted(user1.address, false);

            const isBlacklisted = await token.isBlacklisted(user1.address);
            expect(isBlacklisted).to.be.false;
        });
    });

    describe("升級功能測試", function () {
        it("只有升級者應該擁有升級權限", async function () {
            const UPGRADER_ROLE = await token.UPGRADER_ROLE();
            const hasRole = await token.hasRole(UPGRADER_ROLE, upgrader.address);
            expect(hasRole).to.be.true;

            const userHasRole = await token.hasRole(UPGRADER_ROLE, user1.address);
            expect(userHasRole).to.be.false;
        });
    });

    describe("安全性測試", function () {
        it("攻擊者不應該能夠獲取管理員權限", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

            try {
                await token.connect(user1).grantRole(DEFAULT_ADMIN_ROLE, user1.address);
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("AccessControl");
            }
        });

        it("應該防止整數溢位攻擊", async function () {
            await token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"));

            const userBalance = await token.balanceOf(user1.address);
            const overflowAmount = userBalance.add(1);

            try {
                await token.connect(user1).transfer(user2.address, overflowAmount);
                expect.fail("應該拋出錯誤");
            } catch (error) {
                expect(error.message).to.include("ERC20: transfer amount exceeds balance");
            }
        });
    });

    describe("查詢函數測試", function () {
        it("應該正確返回剩餘可鑄造供應量", async function () {
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const expected = maxSupply.sub(currentSupply);
            const actual = await token.remainingSupply();

            expect(actual.toString()).to.equal(expected.toString());
        });

        it("應該正確檢查黑名單狀態", async function () {
            expect(await token.isBlacklisted(user1.address)).to.be.false;

            await token.connect(blacklistManager).setBlacklisted(user1.address, true);
            expect(await token.isBlacklisted(user1.address)).to.be.true;
        });
    });

    describe("Gas 使用測試", function () {
        it("基本轉帳應該在合理的 gas 限制內", async function () {
            const transferAmount = ethers.utils.parseEther("1000");
            const tx = await token.connect(owner).transfer(user1.address, transferAmount);
            const receipt = await tx.wait();

            // 基本轉帳應該不超過 100k gas
            expect(receipt.gasUsed.toNumber()).to.be.lessThan(100000);
        });
    });
});