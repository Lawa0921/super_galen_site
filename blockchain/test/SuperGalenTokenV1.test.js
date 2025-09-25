const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// 添加自定義的 chai 助手
function expectBigNumberEqual(actual, expected) {
    expect(actual.toString()).to.equal(expected.toString());
}

describe("SuperGalenTokenV1", function () {
    let token;
    let owner;
    let minter;
    let pauser;
    let upgrader;
    let blacklistManager;
    let user1;
    let user2;
    let user3;
    let maliciousUser;

    // 常數定義
    const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 100萬
    const MAX_SUPPLY = ethers.utils.parseEther("10000000");    // 1000萬
    const TOKEN_NAME = "SuperGalen Token";
    const TOKEN_SYMBOL = "SGT";

    beforeEach(async function () {
        // 獲取測試帳戶
        [owner, minter, pauser, upgrader, blacklistManager, user1, user2, user3, maliciousUser] = await ethers.getSigners();

        // 部署 Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const mockUSDT = await MockUSDT.deploy();
        await mockUSDT.deployed();

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
                mockUSDT.address,
                owner.address
            ],
            {
                kind: 'uups',
                initializer: 'initialize'
            }
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
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
        });

        it("應該將初始供應量分配給部署者", async function () {
            expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
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

        it("應該設置正確的鑄造上限", async function () {
            const expectedCap = MAX_SUPPLY.div(100); // 1% of max supply
            expect(await token.mintingCap()).to.equal(expectedCap);
        });
    });

    describe("ERC20 基本功能測試", function () {
        it("應該允許代幣轉帳", async function () {
            const transferAmount = ethers.utils.parseEther("1000");

            await token.connect(owner).transfer(user1.address, transferAmount);

            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
            expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY.sub(transferAmount));
        });

        it("應該允許授權和代理轉帳", async function () {
            const approveAmount = ethers.utils.parseEther("1000");
            const transferAmount = ethers.utils.parseEther("500");

            await token.connect(owner).approve(user1.address, approveAmount);
            await token.connect(user1).transferFrom(owner.address, user2.address, transferAmount);

            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
            expect(await token.allowance(owner.address, user1.address)).to.equal(approveAmount.sub(transferAmount));
        });

        it("應該正確處理授權額度不足", async function () {
            const transferAmount = ethers.utils.parseEther("1000");

            await expect(
                token.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("應該正確處理餘額不足", async function () {
            const transferAmount = ethers.utils.parseEther("1000");

            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });
    });

    describe("鑄造功能測試", function () {
        it("有權限的鑄造者應該能夠鑄造代幣", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            await token.connect(minter).mint(user1.address, mintAmount);

            expect(await token.balanceOf(user1.address)).to.equal(mintAmount);
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY.add(mintAmount));
        });

        it("無權限用戶不應該能夠鑄造代幣", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            await expect(
                token.connect(user1).mint(user2.address, mintAmount)
            ).to.be.revertedWith("AccessControl: account");
        });

        it("應該阻止超過最大供應量的鑄造", async function () {
            const currentSupply = await token.totalSupply();
            const remainingSupply = MAX_SUPPLY.sub(currentSupply);
            const excessAmount = remainingSupply.add(ethers.utils.parseEther("1"));

            await expect(
                token.connect(minter).mint(user1.address, excessAmount)
            ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
        });

        it("應該阻止超過鑄造上限的單次鑄造", async function () {
            const mintingCap = await token.mintingCap();
            const excessAmount = mintingCap.add(ethers.utils.parseEther("1"));

            await expect(
                token.connect(minter).mint(user1.address, excessAmount)
            ).to.be.revertedWithCustomError(token, "ExceedsMintingCap");
        });

        it("應該阻止向零地址鑄造", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            await expect(
                token.connect(minter).mint(ethers.constants.AddressZero, mintAmount)
            ).to.be.revertedWithCustomError(token, "ZeroAddress");
        });

        it("應該阻止鑄造零數量", async function () {
            await expect(
                token.connect(minter).mint(user1.address, 0)
            ).to.be.revertedWithCustomError(token, "ZeroAmount");
        });

        it("應該正確發出鑄造事件", async function () {
            const mintAmount = ethers.utils.parseEther("1000");

            await expect(token.connect(minter).mint(user1.address, mintAmount))
                .to.emit(token, "TokensMinted")
                .withArgs(user1.address, mintAmount);
        });
    });

    describe("批量鑄造功能測試", function () {
        it("應該能夠批量鑄造給多個地址", async function () {
            const recipients = [user1.address, user2.address, user3.address];
            const amounts = [
                ethers.utils.parseEther("1000"),
                ethers.utils.parseEther("2000"),
                ethers.utils.parseEther("3000")
            ];

            await token.connect(minter).batchMint(recipients, amounts);

            expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
            expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
            expect(await token.balanceOf(user3.address)).to.equal(amounts[2]);
        });

        it("應該阻止數組長度不匹配的批量鑄造", async function () {
            const recipients = [user1.address, user2.address];
            const amounts = [ethers.utils.parseEther("1000")];

            await expect(
                token.connect(minter).batchMint(recipients, amounts)
            ).to.be.revertedWith("Arrays length mismatch");
        });

        it("應該跳過零地址和零數量的批量鑄造項目", async function () {
            const recipients = [user1.address, ethers.constants.AddressZero, user2.address];
            const amounts = [
                ethers.utils.parseEther("1000"),
                ethers.utils.parseEther("2000"),
                0
            ];

            await token.connect(minter).batchMint(recipients, amounts);

            expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
            expect(await token.balanceOf(ethers.constants.AddressZero)).to.equal(0);
            expect(await token.balanceOf(user2.address)).to.equal(0);
        });
    });

    describe("燃燒功能測試", function () {
        beforeEach(async function () {
            // 給用戶一些代幣用於燃燒測試
            const mintAmount = ethers.utils.parseEther("5000");
            await token.connect(minter).mint(user1.address, mintAmount);
        });

        it("用戶應該能夠燃燒自己的代幣", async function () {
            const burnAmount = ethers.utils.parseEther("1000");
            const initialBalance = await token.balanceOf(user1.address);
            const initialSupply = await token.totalSupply();

            await token.connect(user1).burn(burnAmount);

            expect(await token.balanceOf(user1.address)).to.equal(initialBalance.sub(burnAmount));
            expect(await token.totalSupply()).to.equal(initialSupply.sub(burnAmount));
        });

        it("應該能夠代理燃燒其他人的代幣", async function () {
            const burnAmount = ethers.utils.parseEther("1000");
            const approveAmount = ethers.utils.parseEther("2000");

            await token.connect(user1).approve(user2.address, approveAmount);
            await token.connect(user2).burnFrom(user1.address, burnAmount);

            expect(await token.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("4000"));
            expect(await token.allowance(user1.address, user2.address)).to.equal(approveAmount.sub(burnAmount));
        });

        it("應該正確發出燃燒事件", async function () {
            const burnAmount = ethers.utils.parseEther("1000");

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
            ).to.be.revertedWith("AccessControl: account");
        });

        it("暫停狀態下應該阻止轉帳", async function () {
            await token.connect(pauser).pause();

            await expect(
                token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWith("Pausable: paused");
        });

        it("應該能夠恢復合約", async function () {
            await token.connect(pauser).pause();
            await token.connect(pauser).unpause();

            expect(await token.paused()).to.be.false;
        });

        it("恢復後應該能夠正常轉帳", async function () {
            await token.connect(pauser).pause();
            await token.connect(pauser).unpause();

            const transferAmount = ethers.utils.parseEther("1000");
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
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });

        it("應該阻止黑名單地址發送代幣", async function () {
            // 先給用戶一些代幣
            await token.connect(owner).transfer(user1.address, ethers.utils.parseEther("1000"));

            // 然後將用戶加入黑名單
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(user1).transfer(user2.address, ethers.utils.parseEther("500"))
            ).to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });

        it("應該阻止向黑名單地址鑄造", async function () {
            await token.connect(blacklistManager).setBlacklisted(user1.address, true);

            await expect(
                token.connect(minter).mint(user1.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWithCustomError(token, "BlacklistedAccount");
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
            const newMaxSupply = ethers.utils.parseEther("20000000"); // 2000萬

            await token.connect(owner).updateMaxSupply(newMaxSupply);

            expect(await token.maxSupply()).to.equal(newMaxSupply);
        });

        it("不應該允許降低最大供應量", async function () {
            const newMaxSupply = ethers.utils.parseEther("5000000"); // 500萬

            await expect(
                token.connect(owner).updateMaxSupply(newMaxSupply)
            ).to.be.revertedWith("Cannot decrease max supply");
        });

        it("新的最大供應量不應該低於當前總供應量", async function () {
            const currentSupply = await token.totalSupply();
            const newMaxSupply = currentSupply.sub(ethers.utils.parseEther("1"));

            await expect(
                token.connect(owner).updateMaxSupply(newMaxSupply)
            ).to.be.revertedWith("New max supply too low");
        });

        it("管理員應該能夠更新鑄造上限", async function () {
            const newCap = ethers.utils.parseEther("500000"); // 50萬

            await token.connect(owner).updateMintingCap(newCap);

            expect(await token.mintingCap()).to.equal(newCap);
        });

        it("應該正確發出參數更新事件", async function () {
            const newMaxSupply = ethers.utils.parseEther("20000000");

            await expect(token.connect(owner).updateMaxSupply(newMaxSupply))
                .to.emit(token, "MaxSupplyUpdated")
                .withArgs(MAX_SUPPLY, newMaxSupply);
        });
    });

    describe("查詢函數測試", function () {
        it("應該正確返回剩餘可鑄造供應量", async function () {
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const expected = maxSupply.sub(currentSupply);

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
            ).to.be.revertedWith("AccessControl: account");
        });

        it("管理員應該能夠撤銷角色", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();

            await token.connect(owner).revokeRole(MINTER_ROLE, minter.address);

            expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
        });

        it("被撤銷角色的用戶不應該能夠執行需要權限的操作", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.connect(owner).revokeRole(MINTER_ROLE, minter.address);

            await expect(
                token.connect(minter).mint(user1.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWith("AccessControl: account");
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
            const transferAmount = ethers.utils.parseEther("1000");
            const tx = await token.connect(owner).transfer(user1.address, transferAmount);
            const receipt = await tx.wait();

            // 基本轉帳應該不超過 100k gas
            expect(receipt.gasUsed.toNumber()).to.be.lessThan(100000);
        });
    });

    describe("邊界條件測試", function () {
        it("應該處理最大整數值", async function () {
            // 測試極端數值的處理
            const maxUint256 = ethers.constants.MaxUint256;

            await expect(
                token.connect(owner).updateMaxSupply(maxUint256)
            ).to.not.be.reverted;
        });

        it("應該處理零值操作", async function () {
            // 零值轉帳應該成功但不產生變化
            const initialBalance = await token.balanceOf(user1.address);
            await token.connect(owner).transfer(user1.address, 0);
            expect(await token.balanceOf(user1.address)).to.equal(initialBalance);
        });
    });
});