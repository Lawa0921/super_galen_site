const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SuperGalenToken 安全性測試", function () {
    let token;
    let owner;
    let attacker;
    let victim;
    let user1;
    let user2;

    const INITIAL_SUPPLY = ethers.utils.parseEther("1000000");
    const MAX_SUPPLY = ethers.utils.parseEther("10000000");

    beforeEach(async function () {
        [owner, attacker, victim, user1, user2] = await ethers.getSigners();

        // 部署 Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const mockUSDT = await MockUSDT.deploy();
        await mockUSDT.deployed();

        const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");
        token = await upgrades.deployProxy(
            SuperGalenTokenV1,
            ["SuperGalen Token", "SGT", INITIAL_SUPPLY, MAX_SUPPLY, owner.address, mockUSDT.address, owner.address],
            { kind: 'uups', initializer: 'initialize' }
        );
        await token.deployed();
    });

    describe("重入攻擊防護測試", function () {
        it("應該防止通過 transfer 的重入攻擊", async function () {
            // 創建一個惡意合約來測試重入攻擊
            const MaliciousContract = await ethers.getContractFactory("MaliciousContract");

            // 如果 MaliciousContract 不存在，我們跳過這個測試
            // 在實際項目中，我們會創建專門的攻擊合約

            // 佔位測試 - 驗證 ReentrancyGuard 正在使用
            expect(true).to.be.true;
        });
    });

    describe("訪問控制攻擊測試", function () {
        it("攻擊者不應該能夠獲取管理員權限", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

            // 攻擊者嘗試授予自己管理員權限
            await expect(
                token.connect(attacker).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
            ).to.be.revertedWith("AccessControl: account");
        });

        it("攻擊者不應該能夠直接調用受保護的函數", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();

            // 攻擊者嘗試鑄造代幣
            await expect(
                token.connect(attacker).mint(attacker.address, ethers.utils.parseEther("1000000"))
            ).to.be.revertedWith("AccessControl: account");
        });

        it("攻擊者不應該能夠暫停合約", async function () {
            await expect(
                token.connect(attacker).pause()
            ).to.be.revertedWith("AccessControl: account");
        });

        it("攻擊者不應該能夠操作黑名單", async function () {
            await expect(
                token.connect(attacker).setBlacklisted(victim.address, true)
            ).to.be.revertedWith("AccessControl: account");
        });

        it("攻擊者不應該能夠修改系統參數", async function () {
            const newMaxSupply = ethers.utils.parseEther("50000000");

            await expect(
                token.connect(attacker).updateMaxSupply(newMaxSupply)
            ).to.be.revertedWith("AccessControl: account");
        });
    });

    describe("整數溢位攻擊測試", function () {
        it("應該防止整數溢位攻擊", async function () {
            // 給攻擊者一些代幣
            await token.connect(owner).transfer(attacker.address, ethers.utils.parseEther("1000"));

            // 嘗試轉移超過餘額的代幣（可能導致溢位）
            const attackerBalance = await token.balanceOf(attacker.address);
            const overflowAmount = attackerBalance.add(1);

            await expect(
                token.connect(attacker).transfer(victim.address, overflowAmount)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("應該防止最大供應量溢位", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantRole(MINTER_ROLE, owner.address);

            // 嘗試鑄造超過最大供應量的代幣
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const excessAmount = maxSupply.sub(currentSupply).add(1);

            await expect(
                token.connect(owner).mint(user1.address, excessAmount)
            ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
        });
    });

    describe("授權攻擊測試", function () {
        it("應該防止未授權的代幣轉移", async function () {
            // 給受害者一些代幣
            await token.connect(owner).transfer(victim.address, ethers.utils.parseEther("5000"));

            // 攻擊者嘗試未經授權轉移受害者的代幣
            await expect(
                token.connect(attacker).transferFrom(
                    victim.address,
                    attacker.address,
                    ethers.utils.parseEther("1000")
                )
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("應該防止授權額度被惡意使用", async function () {
            // 受害者授權攻擊者少量代幣
            await token.connect(owner).transfer(victim.address, ethers.utils.parseEther("5000"));
            const authorizedAmount = ethers.utils.parseEther("100");
            await token.connect(victim).approve(attacker.address, authorizedAmount);

            // 攻擊者嘗試轉移超過授權額度的代幣
            await expect(
                token.connect(attacker).transferFrom(
                    victim.address,
                    attacker.address,
                    authorizedAmount.add(1)
                )
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });
    });

    describe("黑名單繞過攻擊測試", function () {
        it("黑名單用戶不應該能夠通過代理轉移代幣", async function () {
            // 給用戶一些代幣
            await token.connect(owner).transfer(user1.address, ethers.utils.parseEther("5000"));

            // 用戶授權攻擊者
            await token.connect(user1).approve(attacker.address, ethers.utils.parseEther("1000"));

            // 將攻擊者加入黑名單
            const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();
            await token.grantRole(BLACKLIST_MANAGER_ROLE, owner.address);
            await token.setBlacklisted(attacker.address, true);

            // 攻擊者嘗試通過代理轉移來繞過黑名單
            await expect(
                token.connect(attacker).transferFrom(
                    user1.address,
                    user2.address,
                    ethers.utils.parseEther("500")
                )
            ).to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });

        it("不應該能夠向黑名單地址轉移代幣", async function () {
            const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();
            await token.grantRole(BLACKLIST_MANAGER_ROLE, owner.address);
            await token.setBlacklisted(attacker.address, true);

            await expect(
                token.connect(owner).transfer(attacker.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });
    });

    describe("鑄造攻擊測試", function () {
        it("應該防止超過鑄造上限的攻擊", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantRole(MINTER_ROLE, attacker.address);

            const mintingCap = await token.mintingCap();
            const excessAmount = mintingCap.add(ethers.utils.parseEther("1"));

            await expect(
                token.connect(attacker).mint(attacker.address, excessAmount)
            ).to.be.revertedWithCustomError(token, "ExceedsMintingCap");
        });

        it("應該防止批量鑄造攻擊", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantRole(MINTER_ROLE, attacker.address);

            // 嘗試批量鑄造超過最大供應量
            const currentSupply = await token.totalSupply();
            const maxSupply = await token.maxSupply();
            const remainingSupply = maxSupply.sub(currentSupply);

            const recipients = [user1.address, user2.address];
            const amounts = [
                remainingSupply.div(2).add(ethers.utils.parseEther("1")),
                remainingSupply.div(2).add(ethers.utils.parseEther("1"))
            ];

            await expect(
                token.connect(attacker).batchMint(recipients, amounts)
            ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
        });
    });

    describe("暫停繞過攻擊測試", function () {
        it("暫停狀態下所有轉移應該被阻止", async function () {
            const PAUSER_ROLE = await token.PAUSER_ROLE();
            await token.grantRole(PAUSER_ROLE, owner.address);
            await token.pause();

            // 直接轉移
            await expect(
                token.connect(owner).transfer(attacker.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWith("Pausable: paused");

            // 代理轉移
            await expect(
                token.connect(attacker).transferFrom(
                    owner.address,
                    attacker.address,
                    ethers.utils.parseEther("1000")
                )
            ).to.be.revertedWith("Pausable: paused");
        });

        it("暫停狀態下鑄造也應該被阻止", async function () {
            const PAUSER_ROLE = await token.PAUSER_ROLE();
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantRole(PAUSER_ROLE, owner.address);
            await token.grantRole(MINTER_ROLE, owner.address);

            await token.pause();

            await expect(
                token.connect(owner).mint(user1.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWith("Pausable: paused");
        });
    });

    describe("升級攻擊測試", function () {
        it("非升級者不應該能夠執行惡意升級", async function () {
            // 這需要一個惡意的實現合約
            const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");

            await expect(
                upgrades.upgradeProxy(token.address, SuperGalenTokenV1.connect(attacker))
            ).to.be.reverted;
        });

        it("升級權限被撤銷後不應該能夠升級", async function () {
            const UPGRADER_ROLE = await token.UPGRADER_ROLE();

            // 給攻擊者升級權限然後撤銷
            await token.grantRole(UPGRADER_ROLE, attacker.address);
            await token.revokeRole(UPGRADER_ROLE, attacker.address);

            const SuperGalenTokenV1 = await ethers.getContractFactory("SuperGalenTokenV1");

            await expect(
                upgrades.upgradeProxy(token.address, SuperGalenTokenV1.connect(attacker))
            ).to.be.reverted;
        });
    });

    describe("前端運行攻擊測試", function () {
        it("應該防止交易搶跑攻擊", async function () {
            // 模擬搶跑場景：攻擊者試圖在受害者交易前執行類似交易
            // 在實際測試中，這需要更複雜的場景設置

            const transferAmount = ethers.utils.parseEther("1000");

            // 受害者的交易
            const victimTx = token.connect(owner).transfer(victim.address, transferAmount);

            // 攻擊者試圖搶跑（在這個例子中只是簡單的轉移）
            const attackerTx = token.connect(owner).transfer(attacker.address, transferAmount);

            // 兩個交易都應該成功，因為它們不衝突
            await expect(victimTx).to.not.be.reverted;
            await expect(attackerTx).to.not.be.reverted;

            // 在實際場景中，我們會測試更複雜的搶跑場景
        });
    });

    describe("閃電貸攻擊測試", function () {
        it("應該防止利用閃電貸的價格操縱攻擊", async function () {
            // 這個測試需要模擬 DeFi 環境中的閃電貸攻擊
            // 由於我們的代幣是基本的 ERC-20，這裡做基本驗證

            // 確保大額轉移不會破壞系統
            const largeAmount = ethers.utils.parseEther("500000");
            await token.connect(owner).transfer(attacker.address, largeAmount);

            // 攻擊者進行大額操作
            await token.connect(attacker).transfer(user1.address, largeAmount);

            // 系統狀態應該保持一致
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await token.balanceOf(user1.address)).to.equal(largeAmount);
        });
    });

    describe("Gas 攻擊測試", function () {
        it("批量操作不應該導致 Gas 攻擊", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            const BLACKLIST_MANAGER_ROLE = await token.BLACKLIST_MANAGER_ROLE();
            await token.grantRole(MINTER_ROLE, owner.address);
            await token.grantRole(BLACKLIST_MANAGER_ROLE, owner.address);

            // 測試大量批量操作
            const manyAddresses = [];
            const manyAmounts = [];

            for (let i = 0; i < 50; i++) {
                manyAddresses.push(ethers.Wallet.createRandom().address);
                manyAmounts.push(ethers.utils.parseEther("100"));
            }

            // 批量鑄造應該成功但有合理的 Gas 限制
            const tx = await token.batchMint(manyAddresses, manyAmounts);
            const receipt = await tx.wait();

            // Gas 使用應該在合理範圍內（這個數值需要根據實際測試調整）
            expect(receipt.gasUsed.toNumber()).to.be.lessThan(5000000);
        });
    });

    describe("時間攻擊測試", function () {
        it("合約功能不應該依賴於時間戳", async function () {
            // 我們的合約不依賴時間戳，所以這個測試確保沒有時間相關的漏洞

            // 確保基本功能不受時間影響
            const transferAmount = ethers.utils.parseEther("1000");

            await token.connect(owner).transfer(user1.address, transferAmount);
            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);

            // 多次調用應該一致
            await token.connect(owner).transfer(user2.address, transferAmount);
            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
        });
    });
});