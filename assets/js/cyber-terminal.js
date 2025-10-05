/**
 * 賽博龐克終端界面
 * 提供命令行風格的購買體驗
 */

// 載入 i18n 資料
let i18nData = {};
let currentLang = 'zh-TW';

async function loadI18nData() {
    try {
        // 修正:使用 'preferred-language' 而不是 'preferredLanguage'
        currentLang = localStorage.getItem('preferred-language') || 'zh-TW';
        const response = await fetch(`/assets/i18n/${currentLang}.json`);
        i18nData = await response.json();
        console.log(`💻 ${i18nData.cyber_terminal?.loading || 'Loading cyber terminal...'}`);
    } catch (error) {
        console.error('Failed to load i18n data:', error);
        // Fallback 到繁體中文
        currentLang = 'zh-TW';
        const response = await fetch('/assets/i18n/zh-TW.json');
        i18nData = await response.json();
    }
}

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
        console.log(`💻 ${i18nData.cyber_terminal?.initializing || 'Initializing terminal...'}`);
        this.setupCommands();
        this.createTerminalUI();
        this.bindEvents();
        this.showWelcomeMessage();
    }

    setupCommands() {
        // 註冊所有可用命令
        const t = i18nData.cyber_terminal?.commands || {};

        this.commands.set('help', {
            description: t.help?.description || 'Show all available commands',
            usage: t.help?.usage || 'help [command]',
            handler: (args) => this.helpCommand(args)
        });

        this.commands.set('clear', {
            description: t.clear?.description || 'Clear terminal screen',
            usage: t.clear?.usage || 'clear',
            handler: () => this.clearCommand()
        });

        this.commands.set('buy', {
            description: t.buy?.description || 'Buy SGT tokens',
            usage: t.buy?.usage || 'buy <amount> [usdt|sgt]',
            handler: (args) => this.buyCommand(args)
        });

        this.commands.set('balance', {
            description: t.balance?.description || 'Check token balance',
            usage: t.balance?.usage || 'balance [token]',
            handler: (args) => this.balanceCommand(args)
        });

        this.commands.set('price', {
            description: t.price?.description || 'Check SGT current price',
            usage: t.price?.usage || 'price',
            handler: () => this.priceCommand()
        });

        this.commands.set('wallet', {
            description: t.wallet?.description || 'Show wallet details',
            usage: t.wallet?.usage || 'wallet',
            handler: () => this.walletCommand()
        });

    }

    createTerminalUI() {
        const purchaseSection = document.querySelector('#purchase-content .purchase-section');
        if (!purchaseSection) return;

        const placeholder = i18nData.cyber_terminal?.placeholder || "Type 'help' to see available commands";

        const terminalHTML = `
            <div class="cyber-terminal" id="cyber-terminal">
                <div class="terminal-output" id="terminal-output"></div>
                <div class="terminal-input-line">
                    <span class="terminal-prompt">root@supergalen:~$</span>
                    <input type="text" class="terminal-input" id="terminal-input"
                           placeholder="${placeholder}" autocomplete="off">
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
        const w = i18nData.cyber_terminal?.welcome || {};

        const welcomeMessages = [
            '='.repeat(60),
            `    ${w.title || 'SUPERGALEN FINANCIAL TERMINAL v1.0'}`,
            `    ${w.subtitle || 'Blockchain trading system activated'}`,
            '='.repeat(60),
            '',
            w.line1 || '🚀 Welcome to SGT smart trading terminal',
            w.line2 || '💰 Real-time blockchain trading support',
            w.line3 || '⚡ Integrated wallet connection and balance inquiry',
            '',
            w.commands_title || '📋 Available commands:',
            w.cmd_help || '  • help     - View all commands',
            w.cmd_wallet || '  • wallet   - Wallet info',
            w.cmd_balance || '  • balance  - Check balance',
            w.cmd_buy || '  • buy 100  - Buy SGT',
            '',
            w.connect_wallet || '🔗 Please connect wallet at the top of the page to start trading',
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
                const msg = i18nData.cyber_terminal?.messages || {};
                this.printLine(`${msg.error_executing || '❌ Error executing command'}: ${error.message}`, 'red');
            }
        } else {
            const msg = i18nData.cyber_terminal?.messages || {};
            this.printLine(`${msg.unknown_command || '❌ Unknown command'}: ${command}`, 'red');
            this.printLine(msg.help_hint || '💡 Type "help" to see available commands', 'yellow');
        }

        this.isProcessing = false;
    }


    // 命令處理器
    helpCommand(args) {
        const msg = i18nData.cyber_terminal?.messages || {};

        if (args.length === 0) {
            this.printLine(msg.available_commands || '🔧 Available commands:', 'cyan');
            this.printLine('');

            this.commands.forEach((cmd, name) => {
                this.printLine(`  ${name.padEnd(12)} - ${cmd.description}`, 'green');
            });

            this.printLine('');
            this.printLine(msg.help_usage_hint || '💡 Use "help <command>" for specific usage', 'yellow');
        } else {
            const cmdName = args[0].toLowerCase();
            if (this.commands.has(cmdName)) {
                const cmd = this.commands.get(cmdName);
                this.printLine(`📖 ${cmdName} - ${cmd.description}`, 'cyan');
                this.printLine(`${msg.usage || 'Usage'}: ${cmd.usage}`, 'green');
            } else {
                this.printLine(`${msg.unknown_command || '❌ Unknown command'}: ${cmdName}`, 'red');
            }
        }
    }

    clearCommand() {
        this.terminalOutput.innerHTML = '';
    }



    async buyCommand(args) {
        const m = i18nData.cyber_terminal?.messages || {};

        // 檢查錢包連接狀態
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState?.isConnected) {
            this.printLine(m.wallet_not_connected || '❌ 請先在頁面上方連接錢包', 'red');
            return;
        }

        if (args.length < 1) {
            this.printLine(m.buy_usage_error || '❌ 用法: buy <amount> [usdt]', 'red');
            this.printLine(m.buy_example || '💡 例如: buy 100 (使用 100 USDT 購買 SGT)', 'yellow');
            this.printLine(m.buy_note || '💡 注意：目前僅支援使用 USDT 購買 SGT', 'yellow');
            return;
        }

        const amount = parseFloat(args[0]);
        const token = args[1] ? args[1].toLowerCase() : 'usdt';

        if (isNaN(amount) || amount <= 0) {
            this.printLine(m.invalid_amount || '❌ 請輸入有效的數量', 'red');
            return;
        }

        if (token !== 'usdt') {
            this.printLine(m.only_usdt || '❌ 目前僅支援使用 USDT 購買 SGT', 'red');
            this.printLine(m.buy_usage_hint || '💡 用法: buy <usdt_amount>', 'yellow');
            return;
        }

        this.printLine(m.processing_purchase || `🔄 正在處理購買請求...`, 'yellow');
        this.printLine((m.buying_with_usdt || `💰 使用 {amount} USDT 購買 SGT`).replace('{amount}', amount), 'white');
        this.printLine((m.estimated_sgt || `📊 預估獲得: {sgt} SGT (匯率 1:30)`).replace('{sgt}', amount * 30), 'cyan');

        try {
            // 檢查 SGT 購買管理器是否可用
            if (!window.sgtPurchaseManager) {
                this.printLine(m.system_not_loaded || '❌ 購買系統未載入，請重新整理頁面', 'red');
                return;
            }

            // 使用真實的購買邏輯
            await this.executePurchase(amount);

        } catch (error) {
            this.printLine((m.transaction_failed || `❌ 交易失敗: {error}`).replace('{error}', error.message), 'red');
            console.error('購買失敗:', error);
        }
    }

    async balanceCommand(args) {
        const m = i18nData.cyber_terminal?.messages || {};

        // 從 unified wallet manager 獲取錢包狀態
        const walletState = window.unifiedWalletManager?.getState();
        if (!walletState?.isConnected) {
            this.printLine(m.wallet_not_connected || '❌ 請先在頁面上方連接錢包', 'red');
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
                this.printLine((m.sgt_balance || `💰 SGT 餘額: {balance}`).replace('{balance}', sgtBalance), 'green');
            } else {
                this.printLine(m.only_sgt_supported || `❌ 目前僅支援 SGT 代幣`, 'red');
                this.printLine(m.balance_usage || `💡 用法: balance 或 balance sgt`, 'yellow');
            }
        } else {
            this.printLine(m.token_balances || '💰 代幣餘額:', 'cyan');
            this.printLine(`  SGT: ${sgtBalance}`, 'green');
            this.printLine((m.address || `📍 地址: {address}`).replace('{address}', walletState.address), 'white');

            // 使用 unified wallet manager 的 getNetworkName 方法
            const networkName = window.unifiedWalletManager?.getNetworkName() || '未知';
            this.printLine((m.network || `🌐 網路: {network}`).replace('{network}', networkName), 'white');
        }
    }

    priceCommand() {
        const m = i18nData.cyber_terminal?.messages || {};

        this.printLine(m.price_info || '📈 SGT 價格資訊:', 'cyan');
        this.printLine(m.price_1_usdt || '  1 USDT = 30 SGT', 'green');
        this.printLine(m.price_1_sgt || '  1 SGT = 0.0333 USDT', 'green');
        this.printLine(m.price_discount || '💡 使用 SGT 支付享有 10% 折扣！', 'yellow');
    }


    walletCommand() {
        const m = i18nData.cyber_terminal?.messages || {};
        const walletState = window.unifiedWalletManager?.getState();

        if (!walletState?.isConnected) {
            this.printLine(m.wallet_not_connected_short || '❌ 錢包未連接', 'red');
            this.printLine(m.connect_wallet_hint || '💡 請先在頁面上方連接錢包', 'yellow');
            return;
        }

        this.printLine(m.wallet_details || '👛 錢包詳細資訊:', 'cyan');
        this.printLine('', '');

        // 基本資訊
        this.printLine(m.basic_info || '📋 基本資訊:', 'yellow');
        this.printLine((m.full_address || `  地址: {address}`).replace('{address}', walletState.address), 'white');
        this.printLine((m.short_address || `  短地址: {short}`).replace('{short}', `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`), 'white');

        // 網路資訊
        const networkName = window.unifiedWalletManager?.getNetworkName() || '未知';
        this.printLine((m.network || `  網路: {network}`).replace('{network}', networkName), 'white');
        this.printLine((m.chain_id || `  鏈 ID: {id}`).replace('{id}', walletState.chainId || '未知'), 'white');
        this.printLine('', '');

        // 餘額資訊
        this.printLine(m.token_balances || '💰 代幣餘額:', 'yellow');
        const sgtBalance = document.getElementById('sgt-balance-amount')?.textContent || '0';
        this.printLine(`  SGT: ${sgtBalance}`, 'green');

        // 如果有 SGT 購買管理器，顯示 USDT 餘額
        if (window.sgtPurchaseManager && window.sgtPurchaseManager.balances) {
            const usdtBalance = window.sgtPurchaseManager.balances.usdt || (m.checking || '檢查中...');
            this.printLine(`  USDT: ${usdtBalance}`, 'green');
        }

        this.printLine('', '');
        this.printLine(m.connection_status || '🔗 連接狀態: ✅ 已連接', 'green');
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
        const m = i18nData.cyber_terminal?.messages || {};
        const input = this.terminalInput.value.toLowerCase();
        const matches = Array.from(this.commands.keys()).filter(cmd =>
            cmd.startsWith(input)
        );

        if (matches.length === 1) {
            this.terminalInput.value = matches[0];
        } else if (matches.length > 1) {
            this.printLine((m.possible_commands || `💡 可能的命令: {commands}`).replace('{commands}', matches.join(', ')), 'yellow');
        }
    }

    async executePurchase(usdtAmount) {
        const m = i18nData.cyber_terminal?.messages || {};

        try {
            this.printLine(m.checking_approval || `🔄 正在檢查合約授權...`, 'yellow');

            // 檢查合約是否已載入
            const manager = window.sgtPurchaseManager;
            if (!manager.isConnected || !manager.sgtContract || !manager.usdtContract) {
                this.printLine(m.initializing_contract || `🔄 正在初始化合約連接...`, 'yellow');

                // 觸發錢包連接更新
                await manager.updateWalletState();

                if (!manager.isConnected) {
                    throw new Error(m.cannot_connect_wallet || '無法連接到錢包');
                }
            }

            // 檢查 USDT 餘額
            this.printLine(m.checking_usdt_balance || `🔄 正在檢查 USDT 餘額...`, 'yellow');
            await manager.updateBalances();

            const usdtBalance = parseFloat(manager.balances.usdt);
            if (usdtBalance < usdtAmount) {
                throw new Error((m.insufficient_usdt || `USDT 餘額不足。當前餘額: {current} USDT，需要: {required} USDT`)
                    .replace('{current}', usdtBalance)
                    .replace('{required}', usdtAmount));
            }

            // 檢查授權額度
            this.printLine(m.checking_allowance || `🔄 正在檢查 USDT 授權額度...`, 'yellow');
            const amountToPay = window.ethers.parseUnits(usdtAmount.toString(), 6);
            const allowance = await manager.usdtContract.allowance(
                manager.userAddress,
                await manager.sgtContract.getAddress()
            );

            if (allowance < amountToPay) {
                this.printLine(m.need_approval || `🔑 需要授權 USDT 使用權限...`, 'yellow');
                this.printLine(m.confirm_approval || `💡 請在錢包中確認授權交易`, 'cyan');

                const approveTx = await manager.usdtContract.approve(
                    await manager.sgtContract.getAddress(),
                    amountToPay
                );

                this.printLine(m.waiting_approval || `⏳ 等待授權交易確認...`, 'yellow');
                await approveTx.wait();
                this.printLine(m.approval_success || `✅ USDT 授權成功`, 'green');
            }

            // 執行購買
            this.printLine(m.executing_purchase || `🛒 正在執行購買交易...`, 'yellow');
            this.printLine(m.confirm_purchase || `💡 請在錢包中確認購買交易`, 'cyan');

            const purchaseTx = await manager.sgtContract.buyTokensWithUSDT(amountToPay);

            this.printLine(m.waiting_confirmation || `⏳ 等待購買交易確認...`, 'yellow');
            await purchaseTx.wait();

            this.printLine(m.purchase_success || `✅ 購買成功完成！`, 'green');
            this.printLine((m.received_sgt || `🎉 獲得 {amount} SGT`).replace('{amount}', usdtAmount * 30), 'green');

            // 更新餘額顯示
            setTimeout(async () => {
                await manager.updateBalances();

                // 使用 SGT 購買管理器的 header 餘額更新方法
                manager.updateHeaderBalance();

                // 也觸發事件確保所有監聽器都收到通知
                document.dispatchEvent(new CustomEvent('sgtBalanceUpdated'));

                this.printLine(m.balance_updated || `📊 餘額已更新`, 'cyan');
            }, 2000);

        } catch (error) {
            // 處理用戶拒絕交易的情況
            if (error.code === 4001 || error.message.includes('User rejected')) {
                this.printLine(m.user_rejected || `❌ 用戶取消了交易`, 'red');
            } else if (error.message.includes('insufficient funds')) {
                this.printLine(m.insufficient_funds || `❌ 餘額不足，無法完成交易`, 'red');
            } else {
                throw error; // 重新拋出其他錯誤
            }
        }
    }

}

// 全局實例
window.CyberTerminal = CyberTerminal;

// 自動初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 先載入 i18n 資料
    await loadI18nData();

    // 檢查購買區域是否存在
    const purchaseSection = document.querySelector('#purchase-content .purchase-section');
    if (purchaseSection) {
        window.cyberTerminal = new CyberTerminal();
        console.log(`💻 ${i18nData.cyber_terminal?.initializing || '[Terminal] Initialized'}`);
    }

    // 監聽語言切換事件 (在 window 上,不在 document)
    window.addEventListener('languageChanged', async (event) => {
        currentLang = event.detail.lang; // 修正:使用 lang 而不是 language
        await loadI18nData();

        // 重新初始化終端以使用新語言
        if (window.cyberTerminal) {
            const terminal = document.getElementById('cyber-terminal');
            if (terminal) {
                terminal.remove();
            }

            // 重新檢查購買區域並重新初始化
            const purchaseSection = document.querySelector('#purchase-content .purchase-section');
            if (purchaseSection) {
                window.cyberTerminal = new CyberTerminal();
                console.log(`💻 Terminal reinitialized with language: ${currentLang}`);
            }
        }
    });
});

console.log('💻 Cyber terminal module loaded');