/**
 * 賽博龐克終端界面
 * 提供命令行風格的購買體驗
 */

console.log('💻 載入賽博龐克終端界面...');

class CyberTerminal {
    constructor() {
        this.commands = new Map();
        this.history = [];
        this.historyIndex = -1;
        this.currentInput = '';
        this.isProcessing = false;
        this.typewriterSpeed = 30;

        // 移除內部狀態，直接從 unified wallet manager 獲取

        this.init();
    }

    init() {
        console.log('💻 [Terminal] 初始化賽博龐克終端...');
        this.setupCommands();
        this.createTerminalUI();
        this.bindEvents();
        this.showWelcomeMessage();
    }

    setupCommands() {
        // 註冊所有可用命令
        this.commands.set('help', {
            description: '顯示所有可用命令',
            usage: 'help [command]',
            handler: (args) => this.helpCommand(args)
        });

        this.commands.set('clear', {
            description: '清除終端螢幕',
            usage: 'clear',
            handler: () => this.clearCommand()
        });


        this.commands.set('buy', {
            description: '購買 SGT 代幣',
            usage: 'buy <amount> [usdt|sgt]',
            handler: (args) => this.buyCommand(args)
        });

        this.commands.set('balance', {
            description: '查看代幣餘額',
            usage: 'balance [token]',
            handler: (args) => this.balanceCommand(args)
        });

        this.commands.set('price', {
            description: '查看 SGT 當前價格',
            usage: 'price',
            handler: () => this.priceCommand()
        });


        this.commands.set('wallet', {
            description: '顯示錢包詳細資訊',
            usage: 'wallet',
            handler: () => this.walletCommand()
        });
    }

    createTerminalUI() {
        const purchaseSection = document.querySelector('#purchase-content .purchase-section');
        if (!purchaseSection) return;

        const terminalHTML = `
            <div class="cyber-terminal" id="cyber-terminal">
                <div class="terminal-output" id="terminal-output"></div>
                <div class="terminal-input-line">
                    <span class="terminal-prompt">root@supergalen:~$</span>
                    <input type="text" class="terminal-input" id="terminal-input"
                           placeholder="輸入 'help' 查看可用命令" autocomplete="off">
                </div>
            </div>
        `;

        purchaseSection.insertAdjacentHTML('afterbegin', terminalHTML);
        this.terminalOutput = document.getElementById('terminal-output');
        this.terminalInput = document.getElementById('terminal-input');
    }

    bindEvents() {
        if (!this.terminalInput) return;

        // 處理命令輸入
        this.terminalInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !this.isProcessing) {
                e.preventDefault();
                await this.processCommand(this.terminalInput.value);
                this.terminalInput.value = '';
            }

            // 命令歷史導航
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.terminalInput.value = this.history[this.history.length - 1 - this.historyIndex];
                }
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.terminalInput.value = this.history[this.history.length - 1 - this.historyIndex];
                } else if (this.historyIndex === 0) {
                    this.historyIndex = -1;
                    this.terminalInput.value = '';
                }
            }

            // Tab 自動完成
            if (e.key === 'Tab') {
                e.preventDefault();
                this.autoComplete();
            }
        });

        // 移除錢包事件監聽器，改用 unified wallet manager
    }

    showWelcomeMessage() {
        const welcomeMessages = [
            '='.repeat(60),
            '    SUPERGALEN FINANCIAL TERMINAL v1.0',
            '    區塊鏈交易系統已啟動',
            '='.repeat(60),
            '',
            '🚀 歡迎使用 SGT 智能交易終端',
            '💰 支援實時區塊鏈交易',
            '⚡ 整合錢包連接與餘額查詢',
            '',
            '📋 可用命令:',
            '  • help     - 查看所有命令',
            '  • wallet   - 錢包資訊',
            '  • balance  - 查看餘額',
            '  • buy 100  - 購買 SGT',
            '',
            '🔗 請先在頁面上方連接錢包開始交易',
            ''
        ];

        welcomeMessages.forEach((msg, index) => {
            setTimeout(() => {
                let color = 'green';
                if (index === 0 || index === 2) color = 'cyan';
                else if (msg.includes('📋') || msg.includes('🔗')) color = 'yellow';
                else if (msg.includes('•')) color = 'white';

                this.printLine(msg, color);
            }, index * 150);
        });
    }

    async processCommand(input) {
        if (!input.trim()) return;

        this.isProcessing = true;

        // 添加到歷史
        this.history.push(input);
        this.historyIndex = -1;

        // 顯示用戶輸入
        this.printLine(`root@supergalen:~$ ${input}`, 'white');

        // 解析命令
        const args = input.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const params = args.slice(1);

        // 執行命令
        if (this.commands.has(command)) {
            try {
                await this.commands.get(command).handler(params);

                // 觸發成就事件
                document.dispatchEvent(new CustomEvent('command-executed', {
                    detail: { command: command, params: params }
                }));
            } catch (error) {
                this.printLine(`❌ 執行命令時發生錯誤: ${error.message}`, 'red');
            }
        } else {
            this.printLine(`❌ 未知命令: ${command}`, 'red');
            this.printLine(`💡 輸入 "help" 查看可用命令`, 'yellow');
        }

        this.isProcessing = false;
    }


    // 命令處理器
    helpCommand(args) {
        if (args.length === 0) {
            this.printLine('🔧 可用命令:', 'cyan');
            this.printLine('');

            this.commands.forEach((cmd, name) => {
                this.printLine(`  ${name.padEnd(12)} - ${cmd.description}`, 'green');
            });

            this.printLine('');
            this.printLine('💡 使用 "help <command>" 查看具體用法', 'yellow');
        } else {
            const cmdName = args[0].toLowerCase();
            if (this.commands.has(cmdName)) {
                const cmd = this.commands.get(cmdName);
                this.printLine(`📖 ${cmdName} - ${cmd.description}`, 'cyan');
                this.printLine(`用法: ${cmd.usage}`, 'green');
            } else {
                this.printLine(`❌ 未知命令: ${cmdName}`, 'red');
            }
        }
    }

    clearCommand() {
        this.terminalOutput.innerHTML = '';
    }



    async buyCommand(args) {
        // 檢查錢包連接狀態
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState?.isConnected) {
            this.printLine('❌ 請先在頁面上方連接錢包', 'red');
            return;
        }

        if (args.length < 1) {
            this.printLine('❌ 用法: buy <amount> [usdt]', 'red');
            this.printLine('💡 例如: buy 100 (使用 100 USDT 購買 SGT)', 'yellow');
            this.printLine('💡 注意：目前僅支援使用 USDT 購買 SGT', 'yellow');
            return;
        }

        const amount = parseFloat(args[0]);
        const token = args[1] ? args[1].toLowerCase() : 'usdt';

        if (isNaN(amount) || amount <= 0) {
            this.printLine('❌ 請輸入有效的數量', 'red');
            return;
        }

        if (token !== 'usdt') {
            this.printLine('❌ 目前僅支援使用 USDT 購買 SGT', 'red');
            this.printLine('💡 用法: buy <usdt_amount>', 'yellow');
            return;
        }

        this.printLine(`🔄 正在處理購買請求...`, 'yellow');
        this.printLine(`💰 使用 ${amount} USDT 購買 SGT`, 'white');
        this.printLine(`📊 預估獲得: ${amount * 30} SGT (匯率 1:30)`, 'cyan');

        try {
            // 檢查 SGT 購買管理器是否可用
            if (!window.sgtPurchaseManager) {
                this.printLine('❌ 購買系統未載入，請重新整理頁面', 'red');
                return;
            }

            // 使用真實的購買邏輯
            await this.executePurchase(amount);

        } catch (error) {
            this.printLine(`❌ 交易失敗: ${error.message}`, 'red');
            console.error('購買失敗:', error);
        }
    }

    async balanceCommand(args) {
        // 從 unified wallet manager 獲取錢包狀態
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState?.isConnected) {
            this.printLine('❌ 請先在頁面上方連接錢包', 'red');
            return;
        }

        const token = args[0] ? args[0].toLowerCase() : null;

        // 先刷新餘額，然後從 DOM 元素獲取實際餘額顯示
        if (window.simpleSGTBalance) {
            await window.simpleSGTBalance.refresh();
        }
        const sgtBalance = document.getElementById('sgt-balance-amount')?.textContent || '0';

        if (token) {
            if (token === 'sgt') {
                this.printLine(`💰 SGT 餘額: ${sgtBalance}`, 'green');
            } else {
                this.printLine(`❌ 目前僅支援 SGT 代幣`, 'red');
                this.printLine(`💡 用法: balance 或 balance sgt`, 'yellow');
            }
        } else {
            this.printLine('💰 代幣餘額:', 'cyan');
            this.printLine(`  SGT: ${sgtBalance}`, 'green');
            this.printLine(`📍 地址: ${walletState.address}`, 'white');

            // 使用 unified wallet manager 的 getNetworkName 方法
            const networkName = window.unifiedWalletManager?.getNetworkName() || '未知';
            this.printLine(`🌐 網路: ${networkName}`, 'white');
        }
    }

    priceCommand() {
        this.printLine('📈 SGT 價格資訊:', 'cyan');
        this.printLine('  1 USDT = 30 SGT', 'green');
        this.printLine('  1 SGT = 0.0333 USDT', 'green');
        this.printLine('💡 使用 SGT 支付享有 10% 折扣！', 'yellow');
    }


    walletCommand() {
        const walletState = window.unifiedWalletManager?.getState();

        if (!walletState?.isConnected) {
            this.printLine('❌ 錢包未連接', 'red');
            this.printLine('💡 請先在頁面上方連接錢包', 'yellow');
            return;
        }

        this.printLine('👛 錢包詳細資訊:', 'cyan');
        this.printLine('', '');

        // 基本資訊
        this.printLine('📋 基本資訊:', 'yellow');
        this.printLine(`  地址: ${walletState.address}`, 'white');
        this.printLine(`  短地址: ${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`, 'white');

        // 網路資訊
        const networkName = window.unifiedWalletManager?.getNetworkName() || '未知';
        this.printLine(`  網路: ${networkName}`, 'white');
        this.printLine(`  鏈 ID: ${walletState.chainId || '未知'}`, 'white');
        this.printLine('', '');

        // 餘額資訊
        this.printLine('💰 代幣餘額:', 'yellow');
        const sgtBalance = document.getElementById('sgt-balance-amount')?.textContent || '0';
        this.printLine(`  SGT: ${sgtBalance}`, 'green');

        // 如果有 SGT 購買管理器，顯示 USDT 餘額
        if (window.sgtPurchaseManager && window.sgtPurchaseManager.balances) {
            const usdtBalance = window.sgtPurchaseManager.balances.usdt || '檢查中...';
            this.printLine(`  USDT: ${usdtBalance}`, 'green');
        }

        this.printLine('', '');
        this.printLine('🔗 連接狀態: ✅ 已連接', 'green');
    }


    // 輔助方法
    printLine(text, color = 'green') {
        const line = document.createElement('div');
        line.style.color = this.getColor(color);
        line.textContent = text;
        this.terminalOutput.appendChild(line);
        this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
    }

    typewriterPrint(text, color = 'green', delay = 0) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const line = document.createElement('div');
                line.style.color = this.getColor(color);
                this.terminalOutput.appendChild(line);

                let i = 0;
                const type = () => {
                    if (i < text.length) {
                        line.textContent += text.charAt(i);
                        i++;
                        setTimeout(type, this.typewriterSpeed);
                    } else {
                        this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
                        resolve();
                    }
                };
                type();
            }, delay);
        });
    }

    getColor(colorName) {
        const colors = {
            red: '#ff0040',
            green: '#00ff41',
            blue: '#00ffff',
            cyan: '#00ffff',
            yellow: '#ffff00',
            white: '#ffffff',
            purple: '#8a2be2'
        };
        return colors[colorName] || colors.green;
    }

    autoComplete() {
        const input = this.terminalInput.value.toLowerCase();
        const matches = Array.from(this.commands.keys()).filter(cmd =>
            cmd.startsWith(input)
        );

        if (matches.length === 1) {
            this.terminalInput.value = matches[0];
        } else if (matches.length > 1) {
            this.printLine(`💡 可能的命令: ${matches.join(', ')}`, 'yellow');
        }
    }

    async executePurchase(usdtAmount) {
        try {
            this.printLine(`🔄 正在檢查合約授權...`, 'yellow');

            // 檢查合約是否已載入
            const manager = window.sgtPurchaseManager;
            if (!manager.isConnected || !manager.sgtContract || !manager.usdtContract) {
                this.printLine(`🔄 正在初始化合約連接...`, 'yellow');

                // 觸發錢包連接更新
                await manager.updateWalletState();

                if (!manager.isConnected) {
                    throw new Error('無法連接到錢包');
                }
            }

            // 檢查 USDT 餘額
            this.printLine(`🔄 正在檢查 USDT 餘額...`, 'yellow');
            await manager.updateBalances();

            const usdtBalance = parseFloat(manager.balances.usdt);
            if (usdtBalance < usdtAmount) {
                throw new Error(`USDT 餘額不足。當前餘額: ${usdtBalance} USDT，需要: ${usdtAmount} USDT`);
            }

            // 檢查授權額度
            this.printLine(`🔄 正在檢查 USDT 授權額度...`, 'yellow');
            const amountToPay = window.ethers.parseUnits(usdtAmount.toString(), 6);
            const allowance = await manager.usdtContract.allowance(
                manager.userAddress,
                await manager.sgtContract.getAddress()
            );

            if (allowance < amountToPay) {
                this.printLine(`🔑 需要授權 USDT 使用權限...`, 'yellow');
                this.printLine(`💡 請在錢包中確認授權交易`, 'cyan');

                const approveTx = await manager.usdtContract.approve(
                    await manager.sgtContract.getAddress(),
                    amountToPay
                );

                this.printLine(`⏳ 等待授權交易確認...`, 'yellow');
                await approveTx.wait();
                this.printLine(`✅ USDT 授權成功`, 'green');
            }

            // 執行購買
            this.printLine(`🛒 正在執行購買交易...`, 'yellow');
            this.printLine(`💡 請在錢包中確認購買交易`, 'cyan');

            const purchaseTx = await manager.sgtContract.buyTokensWithUSDT(amountToPay);

            this.printLine(`⏳ 等待購買交易確認...`, 'yellow');
            await purchaseTx.wait();

            this.printLine(`✅ 購買成功完成！`, 'green');
            this.printLine(`🎉 獲得 ${usdtAmount * 30} SGT`, 'green');

            // 更新餘額顯示
            setTimeout(async () => {
                await manager.updateBalances();

                // 使用 SGT 購買管理器的 header 餘額更新方法
                manager.updateHeaderBalance();

                // 也觸發事件確保所有監聽器都收到通知
                document.dispatchEvent(new CustomEvent('sgtBalanceUpdated'));

                this.printLine(`📊 餘額已更新`, 'cyan');
            }, 2000);

        } catch (error) {
            // 處理用戶拒絕交易的情況
            if (error.code === 4001 || error.message.includes('User rejected')) {
                this.printLine(`❌ 用戶取消了交易`, 'red');
            } else if (error.message.includes('insufficient funds')) {
                this.printLine(`❌ 餘額不足，無法完成交易`, 'red');
            } else {
                throw error; // 重新拋出其他錯誤
            }
        }
    }
}

// 全局實例
window.CyberTerminal = CyberTerminal;

// 自動初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (document.getElementById('purchase-content')) {
            window.cyberTerminal = new CyberTerminal();
            console.log('💻 [Terminal] 賽博龐克終端已初始化');
        }
    }, 1500);
});

console.log('💻 賽博龐克終端模組載入完成');