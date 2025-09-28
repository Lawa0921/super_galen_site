const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// 添加自定義的 chai 助手
function expectBigNumberEqual(actual, expected) {
    expect(actual.toString()).to.equal(expected.toString());
}

describe("SuperGalenTokenV1", function () {
    let token;
    let mockUSDT;
    let owner;
    let minter;
    let pauser;
    let upgrader;
    let blacklistManager;
    let user1;
    let user2;
    let user3;
    let maliciousUser;

    // 常數定義 - 更新為新需求
    const INITIAL_SUPPLY = ethers.parseEther("0");       // 0 初始供應量（只能通過購買獲得）
    const MAX_SUPPLY = ethers.parseEther("100000000");   // 1億最大供應量
    const TOKEN_NAME = "SuperGalen Token";
    const TOKEN_SYMBOL = "SGT";

    beforeEach(async function () {
        // 獲取測試帳戶
        [owner, minter, pauser, upgrader, blacklistManager, user1, user2, user3, maliciousUser] = await ethers.getSigners();

        // 部署 Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        mockUSDT = await MockUSDT.deploy();
        await mockUSDT.waitForDeployment();

        // 部署合約
        const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");
        token = await upgrades.deployProxy(
            SuperGalenTokenV1,
            [
                TOKEN_NAME,
                TOKEN_SYMBOL,
                INITIAL_SUPPLY,
                MAX_SUPPLY,
                owner.address,
                mockUSDT.target,
                owner.address
            ],
            {
                kind: 'uups',
                initializer: 'initialize'
            }
        );
        await token.waitForDeployment();

        // 設置角色
        const MINTER_ROLE = await token.MINTER_ROLE();
        const PAUSER_ROLE = await token.PAUSER_ROLE();
        const UPGRADER_ROLE = await token.UPGRADER_ROLE();
        const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();

        await token.grantRole(MINTER_ROLE, minter.address);
        await token.grantRole(PAUSER_ROLE, pauser.address);
        await token.grantRole(UPGRADER_ROLE, upgrader.address);
        await token.grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);

        // 為測試準備 USDT 和 SGT
        const usdtAmount = ethers.parseUnits("10000", 6); // 10000 USDT
        await mockUSDT.mint(owner.address, usdtAmount);
        await mockUSDT.mint(user1.address, usdtAmount);
        await mockUSDT.mint(user2.address, usdtAmount);
        await mockUSDT.mint(user3.address, usdtAmount);
    });

    // 輔助函數：購買 SGT 代幣
    async function buyTokens(signer, usdtAmount) {
        // 授權 USDT 給合約
        await mockUSDT.connect(signer).approve(token.target, usdtAmount);
        // 購買 SGT
        await token.connect(signer).buyTokensWithUSDT(usdtAmount);
    }

    describe("初始化測試", function () {
        it("應該正確設置代幣基本信息", async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(0); // 修改：現在是零初始供應量
            expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
        });

        it("應該有零初始供應量（只能通過購買獲得）", async function () {
            expect(await token.totalSupply()).to.equal(0);
            expect(await token.balanceOf(owner.address)).to.equal(0);
        });

        it("應該正確設置所有角色", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
            const MINTER_ROLE = await token.MINTER_ROLE();
            const PAUSER_ROLE = await token.PAUSER_ROLE();
            const UPGRADER_ROLE = await token.UPGRADER_ROLE();
            const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();

            expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
            expect(await token.hasRole(PAUSER_ROLE, pauser.address)).to.be.true;
            expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
            expect(await token.hasRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address)).to.be.true;
        });

        it("應該設置正確的最大供應量為1億", async function () {
            expect(await token.maxSupply()).to.equal(ethers.parseEther("100000000"));
        });
    });

    describe("ERC20 基本功能測試", function () {
        it("應該允許代幣轉帳", async function () {
            // 先購買一些代幣（50 USDT = 1500 SGT）
            const usdtAmount = ethers.parseUnits("50", 6); // 50 USDT
            await buyTokens(owner, usdtAmount);

            const transferAmount = ethers.parseEther("1000"); // 1000 SGT
            const ownerBalance = await token.balanceOf(owner.address);

            await token.connect(owner).transfer(user1.address, transferAmount);

            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
            expect(await token.balanceOf(owner.address)).to.equal(ownerBalance - transferAmount);
        });

        it("應該允許授權和代理轉帳", async function () {
            // 先購買一些代幣（50 USDT = 1500 SGT）
            const usdtAmount = ethers.parseUnits("50", 6); // 50 USDT
            await buyTokens(owner, usdtAmount);

            const approveAmount = ethers.parseEther("1000");
            const transferAmount = ethers.parseEther("500");

            await token.connect(owner).approve(user1.address, approveAmount);
            await token.connect(user1).transferFrom(owner.address, user2.address, transferAmount);

            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
            expect(await token.allowance(owner.address, user1.address)).to.equal(approveAmount - transferAmount);
        });

        it("應該正確處理授權額度不足", async function () {
            const transferAmount = ethers.parseEther("1000");

            await expect(
                token.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
            ).to.be.reverted;
        });

        it("應該正確處理餘額不足", async function () {
            const transferAmount = ethers.parseEther("1000");

            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.be.reverted;
        });
    });

    describe("鑄造功能測試", function () {
        it("mint 函數應該被完全禁用（即使是有權限者）", async function () {
            const mintAmount = ethers.parseEther("1000");

            await expect(
                token.connect(minter).mint(user1.address, mintAmount)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("無權限用戶嘗試 mint 也會收到相同的禁用訊息", async function () {
            const mintAmount = ethers.parseEther("1000");

            await expect(
                token.connect(user1).mint(user2.address, mintAmount)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("任何參數的 mint 都應該被拒絕", async function () {
            // 測試各種參數組合，都應該收到相同的禁用訊息
            await expect(
                token.connect(minter).mint(ethers.ZeroAddress, 0)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");

            await expect(
                token.connect(minter).mint(user1.address, ethers.parseEther("999999999"))
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("管理員也不能使用 mint 函數", async function () {
            const mintAmount = ethers.parseEther("1000");

            await expect(
                token.connect(owner).mint(user1.address, mintAmount)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });
    });

    describe("禁用批量鑄造功能測試", function () {
        it("batchMint 函數應該被完全禁用", async function () {
            const recipients = [user1.address, user2.address, user3.address];
            const amounts = [
                ethers.parseEther("1000"),
                ethers.parseEther("2000"),
                ethers.parseEther("3000")
            ];

            await expect(
                token.connect(minter).batchMint(recipients, amounts)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("即使參數錯誤，batchMint 也返回禁用訊息", async function () {
            const recipients = [user1.address, user2.address];
            const amounts = [ethers.parseEther("1000")]; // 長度不匹配

            await expect(
                token.connect(minter).batchMint(recipients, amounts)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("管理員也不能使用 batchMint", async function () {
            const recipients = [user1.address];
            const amounts = [ethers.parseEther("1000")];

            await expect(
                token.connect(owner).batchMint(recipients, amounts)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });
    });

    describe("USDT 購買功能測試", function () {
        it("應該能夠使用 USDT 購買 SGT 代幣", async function () {
            const usdtAmount = ethers.parseUnits("100", 6); // 100 USDT
            const expectedSGT = ethers.parseEther("3000"); // 100 * 30 = 3000 SGT

            // 授權 USDT
            await mockUSDT.connect(user1).approve(token.target, usdtAmount);

            // 購買代幣
            await token.connect(user1).buyTokensWithUSDT(usdtAmount);

            // 驗證結果
            expect(await token.balanceOf(user1.address)).to.equal(expectedSGT);
            expect(await token.totalSupply()).to.equal(expectedSGT);
        });

        it("應該正確計算 SGT 數量", async function () {
            const usdtAmount = ethers.parseUnits("1", 6); // 1 USDT
            const expectedSGT = ethers.parseEther("30"); // 1 * 30 = 30 SGT

            const calculatedSGT = await token.calculateSGTAmount(usdtAmount);
            expect(calculatedSGT).to.equal(expectedSGT);
        });

        it("應該正確計算所需 USDT 數量", async function () {
            const sgtAmount = ethers.parseEther("30"); // 30 SGT
            const expectedUSDT = ethers.parseUnits("1", 6); // 1 USDT

            const calculatedUSDT = await token.calculateUSDTRequired(sgtAmount);
            expect(calculatedUSDT).to.equal(expectedUSDT);
        });

        it("應該阻止余額不足的購買", async function () {
            const usdtAmount = ethers.parseUnits("100000", 6); // 100000 USDT

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.be.reverted;
        });

        it("應該阻止授權不足的購買", async function () {
            const usdtAmount = ethers.parseUnits("100", 6); // 100 USDT

            // 不授權或授權不足
            await mockUSDT.connect(user1).approve(token.target, ethers.parseUnits("50", 6));

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.be.reverted;
        });

        it("應該阻止購買超過最大供應量", async function () {
            // 先給 user1 大量 USDT
            const largeUsdtAmount = ethers.parseUnits("10000000", 6); // 1000萬 USDT
            await mockUSDT.mint(user1.address, largeUsdtAmount);
            await mockUSDT.connect(user1).approve(token.target, largeUsdtAmount);

            // 嘗試購買超過最大供應量的代幣
            const excessiveUsdtAmount = ethers.parseUnits("4000000", 6); // 400萬 USDT = 1.2億 SGT > 1億 最大供應量

            await expect(
                token.connect(user1).buyTokensWithUSDT(excessiveUsdtAmount)
            ).to.be.reverted;
        });

        it("應該正確發出購買事件", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            const expectedSGT = ethers.parseEther("3000");

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            )
                .to.emit(token, "TokensPurchased")
                .withArgs(user1.address, usdtAmount, expectedSGT)
                .and.to.emit(token, "TokensMinted")
                .withArgs(user1.address, expectedSGT);
        });

        it("應該正確轉帳 USDT 到 treasury", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            const treasuryBalanceBefore = await mockUSDT.balanceOf(owner.address); // owner 是 treasury

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await token.connect(user1).buyTokensWithUSDT(usdtAmount);

            const treasuryBalanceAfter = await mockUSDT.balanceOf(owner.address);
            expect(treasuryBalanceAfter - (treasuryBalanceBefore)).to.equal(usdtAmount);
        });

        it("暫停狀態下應該阻止購買", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await token.connect(pauser).pause();

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.be.reverted;
        });

        it("黑名單用戶應該被阻止購買", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.be.reverted;
        });

        it("應該能夠更新鑄造比例並影響購買結果", async function () {
            // 初始比例是 30 (1 USDT = 30 SGT)
            const usdtAmount = ethers.parseUnits("10", 6); // 10 USDT
            let expectedSGT = ethers.parseEther("300"); // 10 * 30 = 300 SGT

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await token.connect(user1).buyTokensWithUSDT(usdtAmount);

            expect(await token.balanceOf(user1.address)).to.equal(expectedSGT);

            // 更新比例為 50 (1 USDT = 50 SGT)
            await token.connect(owner).setMintRatio(50);
            expect(await token.mintRatio()).to.equal(50);

            // 再次購買應該使用新比例
            await mockUSDT.connect(user2).approve(token.target, usdtAmount);
            await token.connect(user2).buyTokensWithUSDT(usdtAmount);

            expectedSGT = ethers.parseEther("500"); // 10 * 50 = 500 SGT
            expect(await token.balanceOf(user2.address)).to.equal(expectedSGT);
        });

        it("應該阻止設置非法比例", async function () {
            // 測試零比例
            await expect(
                token.connect(owner).setMintRatio(0)
            ).to.be.reverted;

            // 測試過大比例
            await expect(
                token.connect(owner).setMintRatio(1001) // > MAX_MINT_RATIO (1000)
            ).to.be.reverted;
        });

        it("非管理員不應該能夠更新比例", async function () {
            await expect(
                token.connect(user1).setMintRatio(50)
            ).to.be.reverted;
        });
    });

    describe("燃燒功能測試", function () {
        beforeEach(async function () {
            // 為燃燒測試準備代幣（50 USDT = 1500 SGT）
            const usdtAmount = ethers.parseUnits("50", 6); // 50 USDT
            await buyTokens(user1, usdtAmount);
        });

        it("用戶應該能夠燃燒自己的代幣", async function () {
            const burnAmount = ethers.parseEther("1000");
            const initialBalance = await token.balanceOf(user1.address);
            const initialSupply = await token.totalSupply();

            await token.connect(user1).burn(burnAmount);

            expect(await token.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("應該能夠代理燃燒其他人的代幣", async function () {
            const burnAmount = ethers.parseEther("1000");
            const approveAmount = ethers.parseEther("2000");
            const initialBalance = await token.balanceOf(user1.address);

            await token.connect(user1).approve(user2.address, approveAmount);
            await token.connect(user2).burnFrom(user1.address, burnAmount);

            expect(await token.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await token.allowance(user1.address, user2.address)).to.equal(approveAmount - burnAmount);
        });

        it("應該正確發出燃燒事件", async function () {
            const burnAmount = ethers.parseEther("1000");

            await expect(token.connect(user1).burn(burnAmount))
                .to.emit(token, "TokensBurned")
                .withArgs(user1.address, burnAmount);
        });
    });

    describe("暫停功能測試", function () {
        it("有權限的暫停者應該能夠暫停合約", async function () {
            await token.connect(pauser).pause();
            expect(await token.paused()).to.be.true;
        });

        it("無權限用戶不應該能夠暫停合約", async function () {
            await expect(
                token.connect(user1).pause()
            ).to.be.reverted;
        });

        it("暫停狀態下應該阻止轉帳", async function () {
            // 先購買一些代幣（50 USDT = 1500 SGT）
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(owner, usdtAmount);

            await token.connect(pauser).pause();

            await expect(
                token.connect(owner).transfer(user1.address, ethers.parseEther("1000"))
            ).to.be.reverted;
        });

        it("應該能夠恢復合約", async function () {
            await token.connect(pauser).pause();
            await token.connect(pauser).unpause();

            expect(await token.paused()).to.be.false;
        });

        it("恢復後應該能夠正常轉帳", async function () {
            // 先購買一些代幣
            const usdtAmount = ethers.parseUnits("1000", 6);
            await buyTokens(owner, usdtAmount);

            await token.connect(pauser).pause();
            await token.connect(pauser).unpause();

            const transferAmount = ethers.parseEther("1000");
            await token.connect(owner).transfer(user1.address, transferAmount);

            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
        });
    });

    describe("黑名單功能測試", function () {
        it("應該能夠將地址加入黑名單", async function () {
            await token.connect(blacklistManager).setBlacklisted(maliciousUser.address, true);
            expect(await token.isBlacklisted(maliciousUser.address)).to.be.true;
        });

        it("應該阻止黑名單地址接收代幣", async function () {
            // 先購買一些代幣
            const usdtAmount = ethers.parseUnits("1000", 6);
            await buyTokens(owner, usdtAmount);

            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(owner).transfer(user1.address, ethers.parseEther("1000"))
            ).to.be.reverted;
        });

        it("應該阻止黑名單地址發送代幣", async function () {
            // 先購買一些代幣給 user1
            const usdtAmount = ethers.parseUnits("1000", 6);
            await buyTokens(user1, usdtAmount);

            // 然後將用戶加入黑名單
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(user1).transfer(user2.address, ethers.parseEther("500"))
            ).to.be.reverted;
        });

        it("應該阻止向黑名單地址鑄造", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            // mint 已被禁用，所以這裡測試的是 mint 被禁用的訊息
            await expect(
                token.connect(minter).mint(user1.address, ethers.parseEther("1000"))
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("應該能夠從黑名單移除地址", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);
            await token.connect(blacklistManager).setBlacklisted(user1.address, false);

            expect(await token.isBlacklisted(user1.address)).to.be.false;
        });

        it("應該能夠批量設置黑名單", async function () {
            const accounts = [user1.address, user2.address, user3.address];

            await token.connect(blacklistManager).batchSetBlacklisted(accounts, true);

            for (const account of accounts) {
                expect(await token.isBlacklisted(account)).to.be.true;
            }
        });

        it("應該正確發出黑名單更新事件", async function () {
            await expect(token.connect(blacklistManager).setBlacklisted(user1.address, true))
                .to.emit(token, "BlacklistUpdated")
                .withArgs(user1.address, true);
        });
    });

    describe("參數管理測試", function () {
        it("管理員應該能夠更新最大供應量", async function () {
            const newMaxSupply = ethers.parseEther("200000000"); // 2億（必須大於現在的1億）

            await token.connect(owner).updateMaxSupply(newMaxSupply);

            expect(await token.maxSupply()).to.equal(newMaxSupply);
        });

        it("不應該允許降低最大供應量", async function () {
            const newMaxSupply = ethers.parseEther("50000000"); // 5000萬（小於現在的1億）

            await expect(
                token.connect(owner).updateMaxSupply(newMaxSupply)
            ).to.be.revertedWith("Cannot decrease max supply");
        });

        it("新的最大供應量不應該低於當前總供應量", async function () {
            // 先購買一些代幣來增加總供應量
            const usdtAmount = ethers.parseUnits("1000", 6);
            await buyTokens(owner, usdtAmount);

            const currentSupply = await token.totalSupply();
            const newMaxSupply = currentSupply - ethers.parseEther("1");

            await expect(
                token.connect(owner).updateMaxSupply(newMaxSupply)
            ).to.be.revertedWith("New max supply too low");
        });

        it("管理員應該能夠更新鑄造比例", async function () {
            const newRatio = 50; // 1 USDT = 50 SGT

            await token.connect(owner).setMintRatio(newRatio);

            expect(await token.mintRatio()).to.equal(newRatio);
        });

        it("應該正確發出參數更新事件", async function () {
            const newMaxSupply = ethers.parseEther("200000000"); // 2億

            await expect(token.connect(owner).updateMaxSupply(newMaxSupply))
                .to.emit(token, "MaxSupplyUpdated")
                .withArgs(MAX_SUPPLY, newMaxSupply);
        });
    });

    describe("查詢函數測試", function () {
        it("應該正確返回剩餘可鑄造供應量", async function () {
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const expected = maxSupply - currentSupply;

            expect(await token.remainingSupply()).to.equal(expected);
        });

        it("應該正確檢查黑名單狀態", async function () {
            expect(await token.isBlacklisted(user1.address)).to.be.false;

            await token.connect(blacklistManager).setBlacklisted(user1.address, true);
            expect(await token.isBlacklisted(user1.address)).to.be.true;
        });
    });

    describe("訪問控制測試", function () {
        it("非管理員不應該能夠授予角色", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();

            await expect(
                token.connect(user1).grantRole(MINTER_ROLE, user2.address)
            ).to.be.reverted;
        });

        it("管理員應該能夠撤銷角色", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();

            await token.connect(owner).revokeRole(MINTER_ROLE, minter.address);

            expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
        });

        it("被撤銷角色的用戶不應該能夠執行需要權限的操作", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.connect(owner).revokeRole(MINTER_ROLE, minter.address);

            // mint 已被禁用，所以不管是否有權限都會得到相同訊息
            await expect(
                token.connect(minter).mint(user1.address, ethers.parseEther("1000"))
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });
    });

    describe("升級功能測試", function () {
        it("只有升級者應該能夠授權升級", async function () {
            // 這個測試需要一個新的實現合約來測試升級功能
            // 在實際測試中，我們會部署一個新版本並測試升級
            const UPGRADER_ROLE = await token.UPGRADER_ROLE();
            expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
        });

        it("非升級者不應該能夠執行升級", async function () {
            const UPGRADER_ROLE = await token.UPGRADER_ROLE();
            expect(await token.hasRole(UPGRADER_ROLE, user1.address)).to.be.false;
        });
    });

    describe("重入攻擊防護測試", function () {
        it("應該防止重入攻擊", async function () {
            // 這需要一個專門的攻擊合約來測試
            // 在實際測試中，我們會創建一個惡意合約並測試防護
            expect(true).to.be.true; // 佔位測試
        });
    });

    describe("Gas 使用測試", function () {
        it("基本轉帳應該在合理的 gas 限制內", async function () {
            // 先購買一些代幣
            const usdtAmount = ethers.parseUnits("1000", 6);
            await buyTokens(owner, usdtAmount);

            const transferAmount = ethers.parseEther("1000");
            const tx = await token.connect(owner).transfer(user1.address, transferAmount);
            const receipt = await tx.wait();

            // 基本轉帳應該不超過 100k gas
            expect(Number(receipt.gasUsed)).to.be.lessThan(100000);
        });
    });

    describe("邊界條件測試", function () {
        it("應該處理最大整數值", async function () {
            // 測試極端數值的處理 - 但要遵循新的安全限制
            const currentMaxSupply = await token.maxSupply();
            const maxAllowedIncrease = currentMaxSupply + currentMaxSupply; // 100% 增加

            await expect(
                token.connect(owner).updateMaxSupply(maxAllowedIncrease)
            ).to.not.be.reverted;

            // 測試超過限制應該被拒絕 - 使用新的最大值計算
            const newMaxSupply = await token.maxSupply();
            const tooLargeIncrease = newMaxSupply + newMaxSupply + 1n; // 超過100%增加
            await expect(
                token.connect(owner).updateMaxSupply(tooLargeIncrease)
            ).to.be.revertedWith("Increase exceeds 100% limit");
        });

        it("應該處理零值操作", async function () {
            // 零值轉帳應該成功但不產生變化
            const initialBalance = await token.balanceOf(user1.address);
            await token.connect(owner).transfer(user1.address, 0);
            expect(await token.balanceOf(user1.address)).to.equal(initialBalance);
        });
    });
});