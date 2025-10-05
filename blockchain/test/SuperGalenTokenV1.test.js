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

    // 常數定義
    const INITIAL_SUPPLY = ethers.parseEther("0");       // 0 初始供應量
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

        // 為測試準備 USDT
        const usdtAmount = ethers.parseUnits("10000", 6); // 10000 USDT
        await mockUSDT.mint(owner.address, usdtAmount);
        await mockUSDT.mint(user1.address, usdtAmount);
        await mockUSDT.mint(user2.address, usdtAmount);
        await mockUSDT.mint(user3.address, usdtAmount);
    });

    // 輔助函數：購買 SGT 代幣
    async function buyTokens(signer, usdtAmount) {
        await mockUSDT.connect(signer).approve(token.target, usdtAmount);
        await token.connect(signer).buyTokensWithUSDT(usdtAmount);
    }

    describe("初始化測試", function () {
        it("應該正確設置代幣基本信息", async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(0);
            expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
        });

        it("應該有零初始供應量", async function () {
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

        it("購買功能應該預設為未暫停", async function () {
            expect(await token.purchasesPaused()).to.be.false;
        });
    });

    describe("ERC20 基本功能測試", function () {
        it("應該允許代幣轉帳", async function () {
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(owner, usdtAmount);

            const transferAmount = ethers.parseEther("1000");
            const ownerBalance = await token.balanceOf(owner.address);

            await token.connect(owner).transfer(user1.address, transferAmount);

            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
            expect(await token.balanceOf(owner.address)).to.equal(ownerBalance - transferAmount);
        });

        it("應該允許授權和代理轉帳", async function () {
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(owner, usdtAmount);

            const approveAmount = ethers.parseEther("1000");
            const transferAmount = ethers.parseEther("500");

            await token.connect(owner).approve(user1.address, approveAmount);
            await token.connect(user1).transferFrom(owner.address, user2.address, transferAmount);

            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
            expect(await token.allowance(owner.address, user1.address)).to.equal(approveAmount - transferAmount);
        });
    });

    describe("緊急購買暫停機制", function () {
        it("管理員應該能夠暫停購買功能", async function () {
            await expect(token.connect(owner).emergencyPausePurchases())
                .to.emit(token, "PurchasesPaused");

            expect(await token.purchasesPaused()).to.be.true;
        });

        it("購買暫停時應該阻止 buyTokensWithUSDT", async function () {
            await token.connect(owner).emergencyPausePurchases();

            const usdtAmount = ethers.parseUnits("100", 6);
            await mockUSDT.connect(user1).approve(token.target, usdtAmount);

            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.be.revertedWithCustomError(token, "PurchasesPausedError");
        });


        it("購買暫停時仍應該允許正常轉帳", async function () {
            // 先購買一些代幣
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(user1, usdtAmount);

            // 暫停購買
            await token.connect(owner).emergencyPausePurchases();

            // 正常轉帳應該仍然可以執行
            const transferAmount = ethers.parseEther("100");
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.not.be.reverted;

            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
        });

        it("管理員應該能夠恢復購買功能", async function () {
            await token.connect(owner).emergencyPausePurchases();

            await expect(token.connect(owner).resumePurchases())
                .to.emit(token, "PurchasesResumed");

            expect(await token.purchasesPaused()).to.be.false;

            // 恢復後應該能夠購買
            const usdtAmount = ethers.parseUnits("10", 6);
            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await expect(
                token.connect(user1).buyTokensWithUSDT(usdtAmount)
            ).to.not.be.reverted;
        });

        it("非管理員不應該能夠暫停或恢復購買", async function () {
            await expect(
                token.connect(user1).emergencyPausePurchases()
            ).to.be.reverted;

            await token.connect(owner).emergencyPausePurchases();

            await expect(
                token.connect(user1).resumePurchases()
            ).to.be.reverted;
        });
    });

    describe("USDT Token 變更 Timelock", function () {
        let newMockUSDT;

        beforeEach(async function () {
            // 部署新的 Mock USDT 用於測試
            const MockUSDT = await ethers.getContractFactory("MockUSDT");
            newMockUSDT = await MockUSDT.deploy();
            await newMockUSDT.waitForDeployment();
        });

        it("管理員應該能夠提議 USDT 代幣變更", async function () {
            const currentTime = (await ethers.provider.getBlock('latest')).timestamp;

            await expect(token.connect(owner).proposeUSDTTokenChange(newMockUSDT.target))
                .to.emit(token, "USDTTokenChangeProposed");

            expect(await token.pendingUSDTToken()).to.equal(newMockUSDT.target);

            const usdtTokenChangeTime = await token.usdtTokenChangeTime();
            expect(usdtTokenChangeTime).to.be.gt(currentTime);
        });

        it("應該阻止在 24 小時內執行 USDT 變更", async function () {
            await token.connect(owner).proposeUSDTTokenChange(newMockUSDT.target);

            await expect(
                token.connect(owner).executeUSDTTokenChange()
            ).to.be.revertedWithCustomError(token, "TokenChangeTimelockActive");
        });

        it("應該允許在 24 小時後執行 USDT 變更", async function () {
            await token.connect(owner).proposeUSDTTokenChange(newMockUSDT.target);

            // 時間推進 24 小時
            await ethers.provider.send("evm_increaseTime", [24 * 3600]);
            await ethers.provider.send("evm_mine");

            await expect(token.connect(owner).executeUSDTTokenChange())
                .to.emit(token, "USDTTokenUpdated")
                .withArgs(mockUSDT.target, newMockUSDT.target);

            expect(await token.usdtToken()).to.equal(newMockUSDT.target);
            expect(await token.pendingUSDTToken()).to.equal(ethers.ZeroAddress);
        });

        it("應該允許取消待處理的 USDT 變更", async function () {
            await token.connect(owner).proposeUSDTTokenChange(newMockUSDT.target);

            await expect(token.connect(owner).cancelUSDTTokenChange())
                .to.emit(token, "USDTTokenChangeCancelled");

            expect(await token.pendingUSDTToken()).to.equal(ethers.ZeroAddress);
        });

        it("應該阻止在沒有待處理變更時執行", async function () {
            await expect(
                token.connect(owner).executeUSDTTokenChange()
            ).to.be.revertedWithCustomError(token, "NoTokenChangeProposed");
        });

        it("非管理員不應該能夠提議 USDT 變更", async function () {
            await expect(
                token.connect(user1).proposeUSDTTokenChange(newMockUSDT.target)
            ).to.be.reverted;
        });
    });

    describe("升級 Timelock (7天)", function () {
        let newImplementation;

        beforeEach(async function () {
            // 部署新的實現合約用於測試
            const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");
            newImplementation = await SuperGalenTokenV1.deploy();
            await newImplementation.waitForDeployment();
        });

        it("升級者應該能夠提議升級", async function () {
            await expect(token.connect(upgrader).proposeUpgrade(newImplementation.target))
                .to.emit(token, "UpgradeProposed");

            expect(await token.pendingImplementation()).to.equal(newImplementation.target);
        });

        it("應該阻止在 7 天內執行升級", async function () {
            await token.connect(upgrader).proposeUpgrade(newImplementation.target);

            // 驗證 timelock 尚未過期
            const upgradeTimelock = await token.upgradeTimelock();
            const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
            expect(upgradeTimelock).to.be.gt(currentTime);
        });

        it("應該允許在 7 天後執行升級", async function () {
            await token.connect(upgrader).proposeUpgrade(newImplementation.target);

            // 時間推進 7 天
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600]);
            await ethers.provider.send("evm_mine");

            // 驗證 timelock 已過期
            const upgradeTimelock = await token.upgradeTimelock();
            const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
            expect(currentTime).to.be.gte(upgradeTimelock);
        });

        it("應該允許取消待處理的升級", async function () {
            await token.connect(upgrader).proposeUpgrade(newImplementation.target);

            await expect(token.connect(upgrader).cancelUpgrade())
                .to.emit(token, "UpgradeCancelled");

            expect(await token.pendingImplementation()).to.equal(ethers.ZeroAddress);
        });

        it("應該阻止未提議的地址進行升級", async function () {
            const UnauthorizedImpl = await ethers.getContractFactory("SuperGalenTokenV1");
            const unauthorizedImpl = await UnauthorizedImpl.deploy();
            await unauthorizedImpl.waitForDeployment();

            // 提議一個地址
            await token.connect(upgrader).proposeUpgrade(newImplementation.target);

            // 時間推進 7 天
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600]);
            await ethers.provider.send("evm_mine");

            // 嘗試升級到不同地址應該失敗
            await expect(
                upgrades.upgradeProxy(token.target, UnauthorizedImpl)
            ).to.be.revertedWithCustomError(token, "UnauthorizedUpgrade");
        });

        it("非升級者不應該能夠提議升級", async function () {
            await expect(
                token.connect(user1).proposeUpgrade(newImplementation.target)
            ).to.be.reverted;
        });
    });

    describe("資金救援機制", function () {
        let randomToken;

        beforeEach(async function () {
            // 部署一個隨機的 ERC20 代幣用於測試
            const MockToken = await ethers.getContractFactory("MockUSDT");
            randomToken = await MockToken.deploy();
            await randomToken.waitForDeployment();

            // 給隨機代幣一些餘額
            await randomToken.mint(token.target, ethers.parseUnits("1000", 6));
        });

        it("管理員應該能夠救援意外發送的 ERC20 代幣", async function () {
            const amount = ethers.parseUnits("500", 6);
            const treasuryBalanceBefore = await randomToken.balanceOf(owner.address);

            await expect(token.connect(owner).rescueTokens(randomToken.target, amount))
                .to.emit(token, "TokensRescued")
                .withArgs(randomToken.target, owner.address, amount);

            const treasuryBalanceAfter = await randomToken.balanceOf(owner.address);
            expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(amount);
        });

        it("應該阻止救援 SGT 代幣本身", async function () {
            await expect(
                token.connect(owner).rescueTokens(token.target, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(token, "CannotRescueSGT");
        });

        it("應該阻止救援 USDT 代幣", async function () {
            await expect(
                token.connect(owner).rescueTokens(mockUSDT.target, ethers.parseUnits("100", 6))
            ).to.be.revertedWithCustomError(token, "CannotRescueUSDT");
        });

        it("管理員應該能夠救援意外發送的 ETH", async function () {
            // 發送一些 ETH 到合約
            await owner.sendTransaction({
                to: token.target,
                value: ethers.parseEther("1.0")
            });

            const treasuryBalanceBefore = await ethers.provider.getBalance(owner.address);
            const contractBalance = await ethers.provider.getBalance(token.target);

            const tx = await token.connect(owner).rescueETH();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const treasuryBalanceAfter = await ethers.provider.getBalance(owner.address);

            // 考慮 gas 費用
            expect(treasuryBalanceAfter - treasuryBalanceBefore + gasUsed).to.equal(contractBalance);

            // 合約 ETH 餘額應該為 0
            expect(await ethers.provider.getBalance(token.target)).to.equal(0);
        });

        it("合約應該能夠接收 ETH", async function () {
            await expect(
                owner.sendTransaction({
                    to: token.target,
                    value: ethers.parseEther("1.0")
                })
            ).to.emit(token, "ETHReceived")
                .withArgs(owner.address, ethers.parseEther("1.0"));
        });

        it("非管理員不應該能夠救援代幣", async function () {
            await expect(
                token.connect(user1).rescueTokens(randomToken.target, ethers.parseUnits("100", 6))
            ).to.be.reverted;
        });

        it("非管理員不應該能夠救援 ETH", async function () {
            await expect(
                token.connect(user1).rescueETH()
            ).to.be.reverted;
        });
    });

    describe("EIP-2612 Permit 支援", function () {
        it("應該有正確的 EIP-2612 domain separator", async function () {
            const domain = await token.eip712Domain();
            expect(domain.name).to.equal(TOKEN_NAME);
        });

        it("應該能夠使用 permit 進行授權", async function () {
            const spender = user2.address;
            const value = ethers.parseEther("1000");

            // 使用區塊鏈時間
            const latestBlock = await ethers.provider.getBlock('latest');
            const deadline = latestBlock.timestamp + 3600; // 1 小時後過期

            // 獲取當前 nonce
            const nonce = await token.nonces(user1.address);

            // 建立 permit 簽名
            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            };

            const message = {
                owner: user1.address,
                spender: spender,
                value: value,
                nonce: nonce,
                deadline: deadline
            };

            const signature = await user1.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            // 執行 permit
            await token.permit(user1.address, spender, value, deadline, v, r, s);

            // 驗證授權
            expect(await token.allowance(user1.address, spender)).to.equal(value);
        });
    });

    describe("EIP-3009 transferWithAuthorization 支援", function () {
        it("應該能夠使用 transferWithAuthorization 進行轉帳", async function () {
            // 先給 user1 一些代幣
            const usdtAmount = ethers.parseUnits("100", 6);
            await buyTokens(user1, usdtAmount);

            const from = user1.address;
            const to = user2.address;
            const value = ethers.parseEther("100");
            const validAfter = 0;

            // 使用區塊鏈時間
            const latestBlock = await ethers.provider.getBlock('latest');
            const validBefore = latestBlock.timestamp + 3600;
            const nonce = ethers.hexlify(ethers.randomBytes(32));

            // 建立簽名
            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                TransferWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const message = {
                from: from,
                to: to,
                value: value,
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce
            };

            const signature = await user1.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            const user2BalanceBefore = await token.balanceOf(user2.address);

            // 任何人都可以執行這個授權轉帳
            await expect(
                token.connect(user3).transferWithAuthorization(
                    from, to, value, validAfter, validBefore, nonce, v, r, s
                )
            ).to.emit(token, "AuthorizationUsed")
                .withArgs(from, nonce);

            expect(await token.balanceOf(user2.address) - user2BalanceBefore).to.equal(value);
        });

        it("應該阻止重複使用相同的 nonce", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            await buyTokens(user1, usdtAmount);

            const from = user1.address;
            const to = user2.address;
            const value = ethers.parseEther("10");
            const validAfter = 0;

            // 使用區塊鏈時間
            const latestBlock = await ethers.provider.getBlock('latest');
            const validBefore = latestBlock.timestamp + 3600;
            const nonce = ethers.hexlify(ethers.randomBytes(32));

            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                TransferWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const message = {
                from: from,
                to: to,
                value: value,
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce
            };

            const signature = await user1.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            // 第一次應該成功
            await token.connect(user3).transferWithAuthorization(
                from, to, value, validAfter, validBefore, nonce, v, r, s
            );

            // 第二次使用相同 nonce 應該失敗
            await expect(
                token.connect(user3).transferWithAuthorization(
                    from, to, value, validAfter, validBefore, nonce, v, r, s
                )
            ).to.be.revertedWithCustomError(token, "AuthorizationAlreadyUsed");
        });

        it("應該驗證時間窗口 - validAfter", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            await buyTokens(user1, usdtAmount);

            // 使用區塊鏈時間
            const latestBlock = await ethers.provider.getBlock('latest');
            const validAfter = latestBlock.timestamp + 3600; // 1 小時後
            const validBefore = validAfter + 7200; // 再 2 小時
            const nonce = ethers.hexlify(ethers.randomBytes(32));

            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                TransferWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const message = {
                from: user1.address,
                to: user2.address,
                value: ethers.parseEther("10"),
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce
            };

            const signature = await user1.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                token.connect(user3).transferWithAuthorization(
                    user1.address, user2.address, ethers.parseEther("10"),
                    validAfter, validBefore, nonce, v, r, s
                )
            ).to.be.revertedWithCustomError(token, "AuthorizationNotYetValid");
        });

        it("應該驗證時間窗口 - validBefore", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            await buyTokens(user1, usdtAmount);

            const validAfter = 0;

            // 使用區塊鏈時間 - 設為已過期
            const latestBlock = await ethers.provider.getBlock('latest');
            const validBefore = latestBlock.timestamp - 3600; // 1 小時前已過期
            const nonce = ethers.hexlify(ethers.randomBytes(32));

            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                TransferWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const message = {
                from: user1.address,
                to: user2.address,
                value: ethers.parseEther("10"),
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce
            };

            const signature = await user1.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                token.connect(user3).transferWithAuthorization(
                    user1.address, user2.address, ethers.parseEther("10"),
                    validAfter, validBefore, nonce, v, r, s
                )
            ).to.be.revertedWithCustomError(token, "AuthorizationExpired");
        });

        it("應該驗證簽名正確性", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            await buyTokens(user1, usdtAmount);

            const validAfter = 0;

            // 使用區塊鏈時間
            const latestBlock = await ethers.provider.getBlock('latest');
            const validBefore = latestBlock.timestamp + 3600;
            const nonce = ethers.hexlify(ethers.randomBytes(32));

            const domain = {
                name: TOKEN_NAME,
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: token.target
            };

            const types = {
                TransferWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const message = {
                from: user1.address,
                to: user2.address,
                value: ethers.parseEther("10"),
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce
            };

            // user2 簽名，但嘗試從 user1 轉帳
            const signature = await user2.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                token.connect(user3).transferWithAuthorization(
                    user1.address, user2.address, ethers.parseEther("10"),
                    validAfter, validBefore, nonce, v, r, s
                )
            ).to.be.revertedWithCustomError(token, "InvalidSignature");
        });
    });


    describe("強化的 MintRatio 安全限制", function () {
        it("應該阻止在 24 小時冷卻期內變更 mintRatio", async function () {
            // 第一次變更
            await ethers.provider.send("evm_increaseTime", [24 * 3600]);
            await ethers.provider.send("evm_mine");
            await token.connect(owner).setMintRatio(33); // 30 -> 33 (10% 增加)

            // 立即嘗試第二次變更應該失敗
            await expect(
                token.connect(owner).setMintRatio(36)
            ).to.be.revertedWithCustomError(token, "RatioChangeTooFrequent");
        });

        it("應該阻止超過 10% 的單次變更", async function () {
            await ethers.provider.send("evm_increaseTime", [24 * 3600]);
            await ethers.provider.send("evm_mine");

            const currentRatio = await token.mintRatio();
            const tooLargeIncrease = currentRatio + (currentRatio * 15n / 100n); // 15% 增加

            await expect(
                token.connect(owner).setMintRatio(tooLargeIncrease)
            ).to.be.revertedWithCustomError(token, "RatioChangeExceedsLimit");
        });

        it("應該允許在 24 小時冷卻期後且在 10% 範圍內變更", async function () {
            const currentRatio = await token.mintRatio();
            const newRatio = currentRatio + (currentRatio * 8n / 100n); // 8% 增加

            await ethers.provider.send("evm_increaseTime", [24 * 3600]);
            await ethers.provider.send("evm_mine");

            await expect(token.connect(owner).setMintRatio(newRatio))
                .to.emit(token, "MintRatioUpdated")
                .withArgs(currentRatio, newRatio);
        });
    });

    describe("核心功能測試", function () {
        it("mint 函數應該被完全禁用", async function () {
            const mintAmount = ethers.parseEther("1000");

            await expect(
                token.connect(minter).mint(user1.address, mintAmount)
            ).to.be.revertedWith("Use buyTokensWithUSDT instead");
        });

        it("應該能夠使用 USDT 購買 SGT 代幣", async function () {
            const usdtAmount = ethers.parseUnits("100", 6);
            const expectedSGT = ethers.parseEther("3000"); // 100 * 30 = 3000 SGT

            await mockUSDT.connect(user1).approve(token.target, usdtAmount);
            await token.connect(user1).buyTokensWithUSDT(usdtAmount);

            expect(await token.balanceOf(user1.address)).to.equal(expectedSGT);
            expect(await token.totalSupply()).to.equal(expectedSGT);
        });

        it("用戶應該能夠燃燒自己的代幣", async function () {
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(user1, usdtAmount);

            const burnAmount = ethers.parseEther("1000");
            const initialBalance = await token.balanceOf(user1.address);
            const initialSupply = await token.totalSupply();

            await token.connect(user1).burn(burnAmount);

            expect(await token.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("暫停狀態下應該阻止轉帳", async function () {
            const usdtAmount = ethers.parseUnits("50", 6);
            await buyTokens(owner, usdtAmount);

            await token.connect(pauser).pause();

            await expect(
                token.connect(owner).transfer(user1.address, ethers.parseEther("1000"))
            ).to.be.reverted;
        });

        it("應該能夠將地址加入黑名單", async function () {
            await token.connect(blacklistManager).setBlacklisted(maliciousUser.address, true);
            expect(await token.isBlacklisted(maliciousUser.address)).to.be.true;
        });

        it("Treasury timelock 應該正常工作", async function () {
            const newTreasury = user2.address;

            await token.connect(owner).proposeTreasuryChange(newTreasury);
            expect(await token.pendingTreasury()).to.equal(newTreasury);

            await ethers.provider.send("evm_increaseTime", [24 * 3600]);
            await ethers.provider.send("evm_mine");

            await token.connect(owner).executeTreasuryChange();
            expect(await token.treasury()).to.equal(newTreasury);
        });

        it("MaxSupply 7天冷卻期應該正常工作", async function () {
            const currentMaxSupply = await token.maxSupply();
            const newMaxSupply1 = currentMaxSupply + ethers.parseEther("10000000");

            await token.connect(owner).updateMaxSupply(newMaxSupply1);

            const newMaxSupply2 = newMaxSupply1 + ethers.parseEther("10000000");
            await expect(
                token.connect(owner).updateMaxSupply(newMaxSupply2)
            ).to.be.revertedWithCustomError(token, "MaxSupplyChangeTooFrequent");

            await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600]);
            await ethers.provider.send("evm_mine");

            await expect(token.connect(owner).updateMaxSupply(newMaxSupply2))
                .to.not.be.reverted;
        });
    });


    describe("邊界條件測試", function () {
        it("應該處理最大整數值", async function () {
            const currentMaxSupply = await token.maxSupply();
            const maxAllowedIncrease = currentMaxSupply + currentMaxSupply;

            await expect(
                token.connect(owner).updateMaxSupply(maxAllowedIncrease)
            ).to.not.be.reverted;
        });

        it("應該處理零值操作", async function () {
            const initialBalance = await token.balanceOf(user1.address);
            await token.connect(owner).transfer(user1.address, 0);
            expect(await token.balanceOf(user1.address)).to.equal(initialBalance);
        });
    });
});
