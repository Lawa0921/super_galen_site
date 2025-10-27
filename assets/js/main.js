// 主要的 JavaScript 檔案

// 防止無限重載的保護機制
(function() {
    'use strict';

    // 檢查是否在重載循環中
    const reloadCount = parseInt(sessionStorage.getItem('pageReloadCount') || '0');
    const lastReloadTime = parseInt(sessionStorage.getItem('lastReloadTime') || '0');
    const currentTime = Date.now();

    // 如果在 30 秒內重載超過 3 次，認為是無限循環
    if (reloadCount >= 3 && (currentTime - lastReloadTime) < 30000) {
        console.warn('⚠️ 檢測到頁面快速重載 ' + reloadCount + ' 次，但仍允許頁面初始化');
        // 設置標記但不阻止初始化
        window.__pageReloadWarning = true;
        // 清除計數以避免持續警告
        sessionStorage.removeItem('pageReloadCount');
        sessionStorage.removeItem('lastReloadTime');
        sessionStorage.removeItem('isResetting');
        // 不使用 return，讓頁面繼續初始化
    } else {
        // 記錄重載次數
        sessionStorage.setItem('pageReloadCount', (reloadCount + 1).toString());
        sessionStorage.setItem('lastReloadTime', currentTime.toString());
    }

    // 5 秒後清除重載計數（正常載入完成）
    setTimeout(() => {
        sessionStorage.removeItem('pageReloadCount');
        sessionStorage.removeItem('lastReloadTime');
    }, 5000);
})();

// 初始化函數
function initializeAll() {
    // 初始化所有功能
    initThemeToggle();
    initWalletHeaderEvents();
    initHeroAnimation();
    initScrollEffects();
    // initParticleSystem(); // 已移除粒子效果
    initSocialLinks();
    initTypingAnimation();
    updateDeveloperTime();
    updateCampTime();
    updatePlayerAge();
    updateYearProgress();
    initRPGInterface();
    initInnerTabs();
    initCollapsibleSections();
    initExternalLinks();
}

// 檢查 DOM 是否已就緒，避免使用 defer 時錯過 DOMContentLoaded 事件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAll);
} else {
    // DOM 已就緒，直接執行
    initializeAll();
}

// Dark Mode 切換功能
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    // 主題已在 head 標籤中設定，這裡只需要讀取當前主題
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    // 只需要同步切換按鈕的狀態
    if (themeToggle) {
        themeToggle.checked = currentTheme === 'dark';
    }
    
    // 切換主題
    if (themeToggle) {
        themeToggle.addEventListener('change', function() {
            const theme = this.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            // 添加切換動畫
            document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
            setTimeout(() => {
                document.body.style.transition = '';
            }, 500);
        });
    }
}

// Header 錢包事件處理
function initWalletHeaderEvents() {
    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('🔧 初始化 Header 錢包事件...');
    }

    // 等待統一錢包管理器載入
    const waitForWalletManager = () => {
        if (window.unifiedWalletManager) {
            setupHeaderWalletEvents();
        } else {
            setTimeout(waitForWalletManager, 100);
        }
    };

    waitForWalletManager();
}

function setupHeaderWalletEvents() {
    const connectBtn = document.getElementById('connect-wallet-header');
    const walletStatus = document.getElementById('wallet-status-header');

    if (!connectBtn || !walletStatus) {
        console.error('❌ Header 錢包元素未找到');
        return;
    }

    // 連接錢包按鈕事件
    connectBtn.addEventListener('click', async () => {
        try {
            if (window.DebugUtils?.isDevelopment()) {
                window.DebugUtils.debugLog('🔗 Header 連接錢包...');
            }
            await window.unifiedWalletManager.connectWallet();
        } catch (error) {
            console.error('❌ Header 連接錢包失敗:', error);
            if (window.showAlert) {
                window.showAlert('js.alerts.wallet_connect_failed', { error: error.message });
            } else {
                const errorMsg = window.i18n?.currentTranslations?.js?.alerts?.wallet_connect_failed?.replace('{{error}}', error.message) || `Wallet connection failed: ${error.message}`;
                alert(errorMsg);
            }
        }
    });

    // 斷開錢包按鈕事件
    const disconnectBtn = document.getElementById('disconnect-wallet-header');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            try {
                if (window.DebugUtils?.isDevelopment()) {
                    window.DebugUtils.debugLog('🔌 Header 斷開錢包...');
                }
                if (window.unifiedWalletManager) {
                    window.unifiedWalletManager.disconnect();
                    if (window.DebugUtils?.isDevelopment()) {
                        window.DebugUtils.debugLog('✅ 錢包已斷開');
                    }
                }
            } catch (error) {
                console.error('❌ 斷開錢包失敗:', error);
            }
        });
    }

    // 監聽統一錢包管理器狀態變化
    document.addEventListener('unifiedWalletStateChanged', (event) => {
        const state = event.detail;
        updateHeaderWalletDisplay(state);
    });

    // 註冊到統一錢包管理器
    if (window.unifiedWalletManager) {
        window.unifiedWalletManager.addEventListener('header', (state) => {
            updateHeaderWalletDisplay(state);
        });
    }

    // 初始化 header SGT 餘額檢查（只在連接時顯示）
    initHeaderSGTBalance();

    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('✅ Header 錢包事件設置完成');
    }
}

function updateHeaderWalletDisplay(state) {
    const connectBtn = document.getElementById('connect-wallet-header');
    const walletStatus = document.getElementById('wallet-status-header');
    const networkIndicator = document.getElementById('network-indicator');
    const networkName = document.getElementById('network-name');
    const userAddress = document.getElementById('user-address');

    if (!connectBtn || !walletStatus) {
        console.error('❌ [Header] 找不到錢包 DOM 元素');
        return;
    }

    if (state.isConnected && state.address) {
        // 錢包已連接 - 顯示狀態，隱藏連接按鈕和地址輸入
        connectBtn.style.display = 'none';
        walletStatus.classList.remove('hidden');
        walletStatus.style.display = 'flex';  // 明確設置顯示

        // 更新網路狀態
        const networkInfo = window.unifiedWalletManager?.supportedNetworks[state.chainId];
        if (networkInfo) {
            networkIndicator.textContent = '🟢';
            networkName.textContent = networkInfo.name;
            networkName.removeAttribute('data-i18n');  // 防止 i18n 覆蓋
        } else {
            networkIndicator.textContent = '🔴';
            networkName.textContent = `網路 ${state.chainId}`;
            networkName.removeAttribute('data-i18n');  // 防止 i18n 覆蓋
        }

        // 更新地址顯示
        const shortAddress = state.address.slice(0, 6) + '...' + state.address.slice(-4);
        userAddress.textContent = shortAddress;
        userAddress.removeAttribute('data-i18n');  // 防止 i18n 覆蓋

        // 注意：SGT 餘額顯示由 simple-sgt-balance.js 管理，此處不再重複更新
    } else {
        // 錢包未連接 - 顯示連接按鈕，隱藏 SGT 餘額
        connectBtn.style.display = 'flex';
        walletStatus.classList.add('hidden');
        hideHeaderSGTBalance();
    }
}

// Header SGT 餘額初始化（已停用 - 由 simple-sgt-balance.js 管理）
function initHeaderSGTBalance() {
    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('🔧 SGT 餘額管理已移轉至 simple-sgt-balance.js，舊系統已停用');
    }
    // 注意：SGT 餘額顯示現在完全由 simple-sgt-balance.js 管理
    // 不再需要定期檢查，避免與新系統衝突
}

// 移除了靜默檢查功能 - 只在錢包連接時顯示 SGT 餘額

// 已移除廢棄的 Header SGT 餘額函數 - 已由 simple-sgt-balance.js 系統接管

// 顯示 Header SGT 餘額
function showHeaderSGTBalance() {
    const sgtBalanceHeader = document.getElementById('sgt-balance-header');
    if (sgtBalanceHeader) {
        sgtBalanceHeader.classList.remove('hidden');
    }
}

// 隱藏 Header SGT 餘額
function hideHeaderSGTBalance() {
    const sgtBalanceHeader = document.getElementById('sgt-balance-header');
    if (sgtBalanceHeader) {
        sgtBalanceHeader.classList.add('hidden');
    }
}

// 移除了所有手動地址輸入相關功能

// 增強版英雄區塊動畫
function initHeroAnimation() {
    const heroContent = document.querySelector('.hero-content');
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    // 滑鼠視差效果
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        
        if (heroContent) {
            heroContent.style.transform = `translate(${x * 10}px, ${y * 10}px)`;
        }
    });
    
    // 滾動視差效果
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * -0.5;
        hero.style.transform = `translateY(${rate}px)`;
    });
}

// 增強版滾動效果
function initScrollEffects() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('fade-in');
                }, index * 100); // 錯開動畫時間
            }
        });
    }, {
        threshold: 0.1
    });
    
    // 觀察所有需要動畫的元素
    document.querySelectorAll('.post-card, .hero-content, .social-link').forEach(element => {
        observer.observe(element);
    });
    
    // Header 透明度隨滾動變化
    const header = document.querySelector('.site-header');
    if (header) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const opacity = Math.min(scrolled / 100, 1);
            header.style.backgroundColor = `rgba(var(--surface-color), ${0.8 + opacity * 0.2})`;
        });
    }
}

// 粒子系統已移除 - 用戶要求簡化界面
// function initParticleSystem() { ... }

// 社群連結 hover 效果
function initSocialLinks() {
    document.querySelectorAll('.social-link').forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.2) rotate(5deg)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    });
}

// 打字機效果
function initTypingAnimation() {
    const element = document.querySelector('.typing-effect');
    if (!element) return;
    
    const text = element.textContent;
    element.textContent = '';
    
    let i = 0;
    const typeWriter = () => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(typeWriter, 100);
        }
    };
    
    setTimeout(typeWriter, 1000);
}

// 軟體工程師總時間計算（精確到秒）
function updateDeveloperTime() {
    const element = document.getElementById('developer-time');
    if (!element) return;
    
    const startDate = new Date('2020-03-02'); // 調整為你開始當軟體工程師的日期
    const now = new Date();
    const diff = now - startDate;
    
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
    const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // 使用 i18n 格式化日期
    const dateTimeFormat = window.i18n?.currentTranslations?.date_time?.format || '{years}年{months}月{days}日 {hours}:{minutes}:{seconds}';
    element.textContent = dateTimeFormat
        .replace('{years}', years)
        .replace('{months}', months)
        .replace('{days}', days)
        .replace('{hours}', hours)
        .replace('{minutes}', minutes.toString().padStart(2, '0'))
        .replace('{seconds}', seconds.toString().padStart(2, '0'));

    // 每秒更新一次
    setTimeout(updateDeveloperTime, 1000);
}

// 據點經營時間計算
function updateCampTime() {
    const element = document.getElementById('camp-time');
    if (!element) return;
    
    const startDate = new Date('2015-11-06T13:56:37.43'); // 開始經營據點的日期
    const now = new Date();
    const diff = now - startDate;
    
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
    const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // 使用 i18n 格式化日期
    const dateTimeFormat = window.i18n?.currentTranslations?.date_time?.format || '{years}年{months}月{days}日 {hours}:{minutes}:{seconds}';
    element.textContent = dateTimeFormat
        .replace('{years}', years)
        .replace('{months}', months)
        .replace('{days}', days)
        .replace('{hours}', hours)
        .replace('{minutes}', minutes.toString().padStart(2, '0'))
        .replace('{seconds}', seconds.toString().padStart(2, '0'));

    // 每秒更新一次
    setTimeout(updateCampTime, 1000);
}

// 更新玩家年齡（等級）
function updatePlayerAge() {
    const element = document.getElementById('player-level');
    if (!element) return;

    // 使用共用的年齡計算函數（定義在 skill-tree-hierarchical.js 中）
    const age = typeof calculateCurrentAge === 'function' ? calculateCurrentAge() : 32;
    element.textContent = `Lv.${age}`;
}

// 更新年度經驗值進度（從生日開始計算）
function updateYearProgress() {
    const expBar = document.getElementById('exp-progress');
    const expText = document.getElementById('exp-text');
    if (!expBar || !expText) return;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const birthMonth = 8; // 9月是第8個月（0-indexed）
    const birthDay = 21;
    
    // 計算今年的生日和明年的生日
    let startBirthday = new Date(currentYear, birthMonth, birthDay);
    let endBirthday = new Date(currentYear + 1, birthMonth, birthDay);
    
    // 如果今年生日還沒到，則從去年生日開始計算
    if (now < startBirthday) {
        startBirthday = new Date(currentYear - 1, birthMonth, birthDay);
        endBirthday = new Date(currentYear, birthMonth, birthDay);
    }
    
    const totalMilliseconds = endBirthday - startBirthday;
    const elapsedMilliseconds = now - startBirthday;
    
    const percentage = (elapsedMilliseconds / totalMilliseconds * 100).toFixed(5);
    
    expBar.style.width = percentage + '%';
    expText.textContent = percentage + '%';
    
    // 每秒更新一次（顯示到小數點第五位）
    setTimeout(updateYearProgress, 1000);
}

// 平滑滾動
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// 添加 CSS 動畫類別
const style = document.createElement('style');
style.textContent = `
    .fade-in {
        opacity: 0;
        transform: translateY(20px);
        animation: fadeInUp 0.6s ease forwards;
    }
    
    @keyframes fadeInUp {
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .time-number {
        background: linear-gradient(135deg, #667eea, #764ba2);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: bold;
        font-size: 1.2em;
    }
    
    [data-theme="dark"] .time-number {
        background: linear-gradient(135deg, #60a5fa, #a78bfa);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    .time-row {
        margin: 0.5rem 0;
        display: flex;
        justify-content: center;
        gap: 1rem;
        flex-wrap: wrap;
    }
    
    .animate-pulse {
        animation: pulse 1s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// RPG 遊戲介面功能
function initRPGInterface() {
    // Tab 切換系統
    initTabSystem();
    
    // 初始化任務過濾器
    initQuestFilters();
    
    // 初始化遊戲特效
    initGameEffects();
    
    // 初始化技能樹系統
    initSkillTreeTab();
    
    // 初始化資源管理系統
    initResourceSystem();
    
    // 等待其他模組載入完成後再初始化
    waitForModules().then(() => {
        // 初始化物品欄系統
        if (typeof window.initInventorySystem === 'function') {
            console.log('✅ [Main] 呼叫 window.initInventorySystem()');
            window.initInventorySystem();
        } else {
            console.warn('⚠️ [Main] initInventorySystem 函數不存在，跳過初始化');
        }

        // 初始化金幣系統
        if (typeof window.initGoldSystem === 'function') {
            console.log('✅ [Main] 呼叫 window.initGoldSystem()');
            window.initGoldSystem();
        } else {
            console.warn('⚠️ [Main] initGoldSystem 函數不存在，跳過初始化');
        }

        // 初始化任務系統
        if (typeof initQuestSystem === 'function') {
            initQuestSystem();
        }

        // 初始化召喚系統
        if (typeof window.initSummonSystem === 'function') {
            console.log('✅ [Main] 呼叫 window.initSummonSystem()');
            window.initSummonSystem();
        } else {
            console.warn('⚠️ [Main] initSummonSystem 函數不存在，跳過初始化');
        }
    }).catch(err => {
        console.error('❌ [Main] 模組載入等待超時:', err);
    });
}

// 等待其他模組載入（最多等待 5 秒）
function waitForModules() {
    return new Promise((resolve, reject) => {
        const maxWaitTime = 5000; // 5 秒超時
        const checkInterval = 50; // 每 50ms 檢查一次
        let elapsedTime = 0;

        const checkModules = () => {
            const inventoryReady = typeof window.initInventorySystem === 'function';
            const goldReady = typeof window.initGoldSystem === 'function';
            const summonReady = typeof window.initSummonSystem === 'function';

            if (inventoryReady && goldReady && summonReady) {
                console.log('✅ [Main] 所有模組已載入完成');
                resolve();
            } else if (elapsedTime >= maxWaitTime) {
                console.warn('⚠️ [Main] 模組載入超時，使用已載入的模組');
                resolve(); // 即使超時也繼續，讓可用的模組初始化
            } else {
                elapsedTime += checkInterval;
                setTimeout(checkModules, checkInterval);
            }
        };

        checkModules();
    });
}

// Tab 切換系統
function initTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    if (tabButtons.length === 0) return;
    
    // 根據 URL hash 設置初始 Tab
    const initialTab = window.location.hash.slice(1) || 'status';
    activateTab(initialTab);
    
    // 監聽瀏覽器返回/前進按鈕
    window.addEventListener('hashchange', () => {
        const tab = window.location.hash.slice(1) || 'status';
        activateTab(tab);
    });
    
    // 綁定點擊事件
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // 特殊處理日誌導航按鈕 - 允許正常導航
            if (button.classList.contains('journal-nav-btn')) {
                return; // 不阻止預設行為，讓 <a> 標籤正常導航
            }

            e.preventDefault();
            const targetTab = button.dataset.tab;

            // 更新 URL
            window.location.hash = targetTab;

            // 啟動對應的 Tab
            activateTab(targetTab);

            // 播放切換音效（如果有的話）
            playTabSwitchSound();
        });
    });
    
    // 啟動 Tab 的函數（支援懶載入）
    async function activateTab(tabName) {
        // 移除所有 active 類別
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));

        // 找到對應的按鈕和面板
        const targetButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const targetPanel = document.getElementById(`${tabName}-tab`);

        if (targetButton && targetPanel) {
            // 💡 懶載入：先載入 Tab 需要的模組
            if (window.LazyLoader) {
                try {
                    await window.LazyLoader.loadTabModule(tabName);
                } catch (error) {
                    console.error(`⚠️  Tab 模組載入失敗 (${tabName}):`, error);
                }
            }

            // 激活 Tab
            targetButton.classList.add('active');
            targetPanel.classList.add('active');

            // 如果是技能 Tab，重新初始化技能樹畫布
            if (tabName === 'skills') {
                setTimeout(() => {
                    if (window.currentSkillTreeTab) {
                        window.currentSkillTreeTab.updateNavButtonLevels();
                        window.currentSkillTreeTab.drawFullSkillTree();
                    }
                }, 100);
            }

            // 如果是故事 Tab，初始化翻書效果
            if (tabName === 'story' && !window.interactiveBook) {
                setTimeout(() => {
                    if (window.InteractiveBook) {
                        window.interactiveBook = new window.InteractiveBook();
                    }
                }, 50);
            }

            // 如果是購買 Tab，刷新購買管理器
            if (tabName === 'purchase') {
                setTimeout(() => {
                    if (window.sgtPurchaseManager) {
                        window.sgtPurchaseManager.refresh();
                    }
                }, 100);
            }
        } else {
            // 如果找不到對應的 Tab，默認顯示第一個
            const firstButton = tabButtons[0];
            const firstTab = firstButton.dataset.tab;
            window.location.hash = firstTab;
        }
    }
}

// 任務過濾器功能
function initQuestFilters() {
    const filters = document.querySelectorAll('.quest-filter');
    const questItems = document.querySelectorAll('.quest-item');
    
    if (filters.length === 0) return;
    
    filters.forEach(filter => {
        filter.addEventListener('click', () => {
            const filterType = filter.dataset.filter;
            
            // 更新按鈕狀態
            filters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            
            // 根據過濾器顯示/隱藏任務
            questItems.forEach(quest => {
                if (filterType === 'active') {
                    quest.style.display = quest.classList.contains('active-quest') ? 'flex' : 'none';
                } else if (filterType === 'completed') {
                    quest.style.display = quest.classList.contains('completed-quest') ? 'flex' : 'none';
                } else if (filterType === 'side') {
                    quest.style.display = quest.classList.contains('side-quest') ? 'flex' : 'none';
                } else {
                    quest.style.display = 'flex';
                }
            });
        });
    });
}

// 遊戲特效
function initGameEffects() {
    // HP/MP/EXP 條動畫更新
    updateResourceBars();
    
    // 成就解鎖動畫
    checkAchievements();
    
    // 裝備槽 hover 效果
    initEquipmentSlots();
}

// 更新資源條
function updateResourceBars() {
    // 這裡可以添加動態更新 HP/MP/EXP 的邏輯
    // 例如：根據時間或行為更新數值
}

// 檢查成就
function checkAchievements() {
    // 檢查並解鎖成就的邏輯
}

// 裝備槽交互
function initEquipmentSlots() {
    const equipSlots = document.querySelectorAll('.equip-slot');
    const itemSlots = document.querySelectorAll('.item-slot');
    
    // 添加點擊效果
    [...equipSlots, ...itemSlots].forEach(slot => {
        slot.addEventListener('click', function() {
            // 添加閃光效果
            this.style.animation = 'itemClick 0.3s ease';
            setTimeout(() => {
                this.style.animation = '';
            }, 300);
        });
    });
}

// 播放 Tab 切換音效（模擬）
function playTabSwitchSound() {
    // 這裡可以添加音效播放邏輯
    // 例如：new Audio('/assets/sounds/tab-switch.mp3').play();
}

// 添加物品點擊動畫
const itemClickStyle = document.createElement('style');
itemClickStyle.textContent = `
    @keyframes itemClick {
        0% { transform: scale(1); }
        50% { transform: scale(0.95); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(itemClickStyle);

// 滾動到技能樹區塊
window.scrollToSkillTree = function() {
    const skillTreeSection = document.querySelector('.skills-section');
    if (skillTreeSection) {
        skillTreeSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }
};

// 初始化技能樹 Tab 系統
function initSkillTreeTab() {
    try {
        console.log('🔧 開始初始化技能樹...');

        // 使用階層式技能樹系統
        window.skillTreeInstance = new HierarchicalSkillTree();

        console.log('✅ 技能樹實例創建成功:', window.skillTreeInstance);

        // 保持相容性接口
        window.currentSkillTreeTab = {
            drawFullSkillTree: () => window.skillTreeInstance.drawFullSkillTree(),
            updateNavButtonLevels: () => window.skillTreeInstance.updateNavButtonLevels()
        };

        console.log('✅ 技能樹初始化完成');
    } catch (error) {
        console.error('❌ 技能樹初始化失敗:', error);
        console.error('錯誤堆棧:', error.stack);

        // 創建一個簡單的佔位實例以避免後續錯誤
        window.skillTreeInstance = null;
        window.currentSkillTreeTab = {
            drawFullSkillTree: () => console.warn('技能樹未初始化'),
            updateNavButtonLevels: () => console.warn('技能樹未初始化')
        };
    }
}


// 繪製技能樹基礎結構
function drawSkillTreeBase(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    
    // 繪製連接線
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    // 創建簡單的樹狀結構
    const centerX = width / 2;
    const centerY = height / 2;
    
    // 繪製中心到各分支的連線
    const branches = [
        { x: centerX - 120, y: centerY - 80, label: 'React' },
        { x: centerX + 120, y: centerY - 80, label: 'Vue.js' },
        { x: centerX - 80, y: centerY + 60, label: 'CSS3' },
        { x: centerX + 80, y: centerY + 60, label: 'TypeScript' },
        { x: centerX, y: centerY - 140, label: 'JavaScript' }
    ];
    
    // 繪製技能節點
    branches.forEach(branch => {
        // 連線
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(branch.x, branch.y);
        ctx.stroke();
        
        // 技能節點
        ctx.beginPath();
        ctx.arc(branch.x, branch.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
        
        // 技能名稱
        ctx.fillStyle = '#ffd700';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(branch.label, branch.x, branch.y + 35);
    });
    
    // 中心節點
    ctx.beginPath();
    ctx.arc(centerX, centerY, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#ffd700';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('前端', centerX, centerY + 5);
};

// 資源管理系統
function initResourceSystem() {
    // 檢查是否有狀態管理系統
    const hasGameState = typeof window.GameState !== 'undefined';
    
    // 資源狀態（使用狀態管理系統或預設值）
    const resources = {
        hp: { 
            current: hasGameState ? window.GameState.getState().hp : 1000, 
            max: 1000, 
            regen: 3      // 每5秒回3
        },
        mp: { 
            current: hasGameState ? window.GameState.getState().mp : 500, 
            max: 500, 
            regen: 1.5    // 每5秒回1.5
        },
        sp: { 
            current: hasGameState ? window.GameState.getState().sp : 300, 
            max: 300, 
            regen: 0.3    // 少量自動回復 (每5秒0.3點)
        },
        exp: { 
            current: 0, 
            max: 100, 
            regen: 0 
        }
    };
    
    // 自動回復計時器（已移至 GameState 系統）
    let regenTimer = null;
    
    // 更新資源顯示
    function updateResourceDisplay(type) {
        const bar = document.querySelector(`.${type}-bar`);
        if (!bar) return;
        
        const fill = bar.querySelector('.bar-fill') || bar.querySelector(`.${type}-fill`);
        const text = bar.querySelector('.bar-text');
        const resource = resources[type];
        
        if (fill && text) {
            const percentage = (resource.current / resource.max) * 100;
            fill.style.width = `${percentage}%`;
            
            // EXP 顯示百分比，其他顯示數值
            if (type === 'exp') {
                // EXP 已經由 updateYearProgress 函數處理
                return;
            } else {
                text.textContent = `${Math.floor(resource.current)}/${resource.max}`;
            }
            
            // HP 低血量警告
            if (type === 'hp') {
                if (percentage < 20) {
                    bar.classList.add('critical');
                } else {
                    bar.classList.remove('critical');
                }
                
                // HP 歸零效果
                const avatar = document.querySelector('.player-avatar');
                if (resource.current <= 0 && avatar) {
                    avatar.classList.add('dead');
                } else if (avatar) {
                    avatar.classList.remove('dead');
                }
            }
        }
    }
    
    // 創建浮動提示
    function createDamagePopup(value, type, element) {
        const popup = document.createElement('div');
        popup.className = `damage-popup ${type}`;
        popup.textContent = value > 0 ? `+${Math.floor(value)}` : `${Math.floor(value)}`;
        
        // 設置隨機位置
        const rect = element.getBoundingClientRect();
        popup.style.left = `${rect.left + rect.width / 2 + (Math.random() - 0.5) * 50}px`;
        popup.style.top = `${rect.top + rect.height / 2}px`;
        
        document.body.appendChild(popup);
        
        // 1.5秒後移除
        setTimeout(() => popup.remove(), 1500);
    }
    
    // 修改資源值（統一使用 GameState 為資料來源）
    function modifyResource(type, amount, showPopup = true) {
        const hasGameState = typeof window.GameState !== 'undefined';
        
        // 如果有狀態管理系統，優先使用其作為單一資料來源
        if (hasGameState && (type === 'hp' || type === 'mp' || type === 'sp')) {
            const oldState = window.GameState.getState();
            const oldValue = oldState[type];
            
            // 直接通過 GameState 修改，避免雙重同步
            if (type === 'hp') window.GameState.changeHP(amount);
            else if (type === 'mp') window.GameState.changeMP(amount);
            else if (type === 'sp') window.GameState.changeSP(amount);
            
            // 從 GameState 獲取最新狀態並同步到本地
            const newState = window.GameState.getState();
            const newValue = newState[type];
            
            // 更新本地快取
            if (resources[type]) {
                resources[type].current = newValue;
            }
            
            // 更新顯示
            if (oldValue !== newValue) {
                updateResourceDisplay(type);
                
                if (showPopup) {
                    const bar = document.querySelector(`.${type}-bar`);
                    if (bar) {
                        let popupType = 'damage';
                        if (type === 'hp' && amount > 0) popupType = 'heal';
                        else if (type === 'mp') popupType = 'mana';
                        else if (type === 'sp') popupType = 'stamina';
                        
                        createDamagePopup(amount, popupType, bar);
                    }
                }
            }
        } else {
            // 備用機制：如果沒有 GameState 系統
            const resource = resources[type];
            if (!resource) return;
            
            const oldValue = resource.current;
            resource.current = Math.max(0, Math.min(resource.max, resource.current + amount));
            
            if (oldValue !== resource.current) {
                updateResourceDisplay(type);
                
                if (showPopup) {
                    const bar = document.querySelector(`.${type}-bar`);
                    if (bar) {
                        let popupType = 'damage';
                        if (type === 'hp' && amount > 0) popupType = 'heal';
                        else if (type === 'mp') popupType = 'mana';
                        else if (type === 'sp') popupType = 'stamina';
                        
                        createDamagePopup(amount, popupType, bar);
                    }
                }
            }
        }
    }

    // 隨機事件系統已移至 GameState 系統中統一管理
    
    // 綁定按鈕點擊事件
    function bindButtonEvents() {
        // 所有可點擊的按鈕
        const clickableElements = [
            ...document.querySelectorAll('.tab-btn'),
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('.btn'),
            ...document.querySelectorAll('.social-link')
        ];
        
        clickableElements.forEach(element => {
            element.addEventListener('click', (e) => {
                // 檢查是否在物品欄面板內（避免與金幣系統重複觸發）
                const isInInventoryPanel = e.target.closest('.d2-inventory-panel');

                if (isInInventoryPanel) {
                    // 物品欄內的點擊由 inventory.js 處理（會呼叫 SP/HP 消耗）
                    return;
                }
                
                // 其他區域的點擊直接觸發 SP/HP 消耗
                if (window.GameState && typeof window.GameState.handleClickDamage === 'function') {
                    window.GameState.handleClickDamage();
                    
                    // 更新本地資源狀態以保持同步
                    const gameState = window.GameState.getState();
                    resources.hp.current = gameState.hp;
                    resources.sp.current = gameState.sp;
                    resources.mp.current = gameState.mp;
                    
                    // 更新 UI 顯示
                    updateResourceDisplay('hp');
                    updateResourceDisplay('sp');
                    updateResourceDisplay('mp');
                } else {
                    // 備用機制：如果狀態管理系統不可用，使用原有邏輯
                    const damage = Math.floor(Math.random() * 3) + 1;
                    modifyResource('hp', -damage);
                }
            });
        });
    }
    
    // 初始化
    function init() {
        // 如果有狀態管理系統，從其讀取最新狀態
        const hasGameState = typeof window.GameState !== 'undefined';
        if (hasGameState) {
            const gameState = window.GameState.getState();
            resources.hp.current = gameState.hp;
            resources.mp.current = gameState.mp;
            resources.sp.current = gameState.sp;
        }
        
        // 更新所有資源顯示
        Object.keys(resources).forEach(type => {
            updateResourceDisplay(type);
        });
        
        // 啟動自動回復（已整合到 GameState 系統）
        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog('本地自動回復已停用，使用 GameState 系統統一管理');
            window.DebugUtils.debugLog('隨機事件系統已整合到 GameState 系統中');
        }
        
        // 綁定按鈕事件
        bindButtonEvents();
    }
    
    // 頁面卸載時清理（隨機事件清理已移至 GameState 系統）
    window.addEventListener('beforeunload', () => {
        if (regenTimer) clearInterval(regenTimer);
    });
    
    // 開始初始化
    init();
    
    // 導出 API 供其他模組使用
    window.resourceSystem = {
        modifyResource,
        getResource: (type) => resources[type]
    };
}

// 內部頁籤系統
function initInnerTabs() {
    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('🔧 初始化內部頁籤系統...');
    }

    const tabButtons = document.querySelectorAll('.inner-tab-btn');
    const tabPanels = document.querySelectorAll('.inner-tab-panel');
    const tabIndicator = document.querySelector('.tab-indicator');

    if (!tabButtons.length || !tabPanels.length) {
        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog('❌ 內部頁籤元素未找到');
        }
        return;
    }

    // 頁籤切換函數
    function switchTab(targetTabId, clickedButton) {
        // 移除所有活動狀態
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));

        // 添加活動狀態到目標元素
        clickedButton.classList.add('active');
        const targetPanel = document.getElementById(targetTabId);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }

        // 更新指示器位置
        updateTabIndicator(clickedButton);

        // 添加切換動畫
        targetPanel.style.animation = 'none';
        targetPanel.offsetHeight; // 觸發重繪
        targetPanel.style.animation = 'fadeInUp 0.5s ease';

        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog(`✅ 切換到頁籤: ${targetTabId}`);
        }
    }

    // 更新頁籤指示器位置
    function updateTabIndicator(activeButton) {
        if (!tabIndicator) return;

        const buttonIndex = Array.from(tabButtons).indexOf(activeButton);
        const tabWidth = 100 / tabButtons.length; // 每個標籤的寬度百分比
        const translateX = buttonIndex * 100; // 移動距離是 index * 100%

        tabIndicator.style.transform = `translateX(${translateX}%)`;
        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog(`🎯 標籤指示器移動到位置: ${translateX}% (標籤 ${buttonIndex + 1})`);
        }
    }

    // 綁定點擊事件
    tabButtons.forEach((button, index) => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTabId = button.getAttribute('data-tab');

            if (targetTabId) {
                switchTab(targetTabId, button);

                // 添加點擊效果
                button.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    button.style.transform = '';
                }, 150);
            }
        });

        // 添加鍵盤支持
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });

    // 初始化第一個頁籤的指示器位置
    const activeButton = document.querySelector('.inner-tab-btn.active');
    if (activeButton) {
        updateTabIndicator(activeButton);
    }

    // 添加服務預約功能
    initServiceBooking();

    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('✅ 內部頁籤系統初始化完成');
    }
}

// 服務預約功能
function initServiceBooking() {
    const bookButtons = document.querySelectorAll('.book-service-btn');

    bookButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const serviceType = button.getAttribute('data-service');

            // 添加點擊動畫
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = '';
            }, 150);

            // 顯示預約確認
            showServiceBookingModal(serviceType);
        });
    });
}

// 顯示服務預約模態框
function showServiceBookingModal(serviceType) {
    const serviceNames = {
        'casual': '輕鬆聊天',
        'consultation': '專業諮詢',
        'deep': '深度討論'
    };

    const servicePrices = {
        'casual': { sgt: 270, usdt: 10 },
        'consultation': { sgt: 540, usdt: 20 },
        'deep': { sgt: 810, usdt: 30 }
    };

    const serviceName = serviceNames[serviceType] || serviceType;
    const price = servicePrices[serviceType];

    // 創建模態框 HTML
    const modalHTML = `
        <div class="service-booking-modal" id="service-booking-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h4>📅 預約服務 - ${serviceName}</h4>
                    <button class="close-btn" onclick="closeServiceBookingModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="service-info">
                        <div class="service-details">
                            <h5>服務詳情</h5>
                            <p>服務類型: ${serviceName}</p>
                            <p>服務時長: 1 小時</p>
                            <div class="pricing-info">
                                <p>💰 費用選擇:</p>
                                <div class="price-options">
                                    <label class="price-option">
                                        <input type="radio" name="paymentType" value="sgt" checked>
                                        <span class="price-text">${price.sgt} SGT</span>
                                        <span class="price-note">(推薦，更優惠)</span>
                                    </label>
                                    <label class="price-option">
                                        <input type="radio" name="paymentType" value="usdt">
                                        <span class="price-text">${price.usdt} USDT</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="contact-form">
                            <h5>聯繫方式</h5>
                            <div class="form-group">
                                <label>偏好聯繫方式:</label>
                                <select id="contactMethod">
                                    <option value="discord">Discord</option>
                                    <option value="email">Email</option>
                                    <option value="telegram">Telegram</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>聯繫資訊:</label>
                                <input type="text" id="contactInfo" placeholder="請輸入您的聯繫方式">
                            </div>
                            <div class="form-group">
                                <label>預約時間偏好:</label>
                                <input type="text" id="preferredTime" placeholder="例如：週末下午，平日晚上">
                            </div>
                            <div class="form-group">
                                <label>諮詢主題 (選填):</label>
                                <textarea id="consultationTopic" placeholder="簡單描述您想諮詢的內容..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="cancel-btn" onclick="closeServiceBookingModal()">取消</button>
                    <button class="confirm-btn" onclick="submitServiceBooking('${serviceType}')">確認預約</button>
                </div>
            </div>
        </div>
    `;

    // 添加到頁面
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 添加動畫效果
    const modal = document.getElementById('service-booking-modal');
    modal.style.animation = 'fadeIn 0.3s ease';

    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog(`📅 顯示 ${serviceName} 預約模態框`);
    }
}

// 關閉服務預約模態框
function closeServiceBookingModal() {
    const modal = document.getElementById('service-booking-modal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// 提交服務預約
function submitServiceBooking(serviceType) {
    const contactMethod = document.getElementById('contactMethod').value;
    const contactInfo = document.getElementById('contactInfo').value;
    const preferredTime = document.getElementById('preferredTime').value;
    const consultationTopic = document.getElementById('consultationTopic').value;
    const paymentType = document.querySelector('input[name="paymentType"]:checked').value;

    if (!contactInfo.trim()) {
        alert('請輸入聯繫資訊');
        return;
    }

    // 這裡可以添加實際的預約提交邏輯
    // 例如發送到後端 API 或發送郵件

    const bookingData = {
        serviceType,
        contactMethod,
        contactInfo,
        preferredTime,
        consultationTopic,
        paymentType,
        timestamp: new Date().toISOString()
    };

    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('📋 預約資料:', bookingData);
    }

    // 顯示成功訊息
    alert(`預約成功！我們會透過 ${contactMethod} 聯繫您安排具體時間。\n\n服務類型: ${serviceType}\n聯繫方式: ${contactInfo}\n付款方式: ${paymentType.toUpperCase()}`);

    // 關閉模態框
    closeServiceBookingModal();
}

// 添加模態框樣式 (如果需要)
function addServiceModalStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .service-booking-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
        }

        .service-booking-modal .modal-content {
            background: var(--bg-color);
            border-radius: 16px;
            border: 1px solid var(--border-color);
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }

        .service-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 25px;
        }

        .service-details h5,
        .contact-form h5 {
            color: var(--primary-color);
            margin: 0 0 15px 0;
            font-size: 1.2em;
            font-weight: 600;
        }

        .price-options {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 10px;
        }

        .price-option {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 2px solid var(--border-color);
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .price-option:hover {
            border-color: var(--primary-color);
        }

        .price-option input[type="radio"]:checked + .price-text {
            color: var(--primary-color);
            font-weight: 600;
        }

        .price-note {
            font-size: 0.85em;
            color: var(--success-color);
            font-weight: 500;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--text-color);
            font-weight: 500;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 10px;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 0.95em;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        @media (max-width: 768px) {
            .service-info {
                grid-template-columns: 1fr;
                gap: 20px;
            }

            .service-booking-modal .modal-content {
                width: 95%;
                margin: 20px;
            }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.9); }
        }
    `;
    document.head.appendChild(style);
}

// 收合功能初始化
function initCollapsibleSections() {
    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('🔧 初始化收合功能...');
    }

    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-toggle');
            const targetContent = document.getElementById(targetId);

            if (targetContent) {
                const isCollapsed = targetContent.style.display === 'none';

                if (isCollapsed) {
                    // 展開
                    targetContent.style.display = 'block';
                    this.classList.remove('collapsed');
                    if (window.DebugUtils?.isDevelopment()) {
                        window.DebugUtils.debugLog(`展開區塊: ${targetId}`);
                    }
                } else {
                    // 收合
                    targetContent.style.display = 'none';
                    this.classList.add('collapsed');
                    if (window.DebugUtils?.isDevelopment()) {
                        window.DebugUtils.debugLog(`收合區塊: ${targetId}`);
                    }
                }
            }
        });
    });
}

// 外部連結自動開新分頁
function initExternalLinks() {
    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog('🔧 初始化外部連結新分頁功能...');
    }

    // 選取所有文章內容區域的連結
    const postContent = document.querySelector('.post-content, .markdown-body, article, main');

    if (!postContent) {
        if (window.DebugUtils?.isDevelopment()) {
            window.DebugUtils.debugLog('⚠️ 未找到文章內容區域,嘗試選取所有連結');
        }
        // 如果沒有找到特定的文章容器,則選取所有連結
        processLinks(document.querySelectorAll('a'));
        return;
    }

    // 處理文章內的連結
    const links = postContent.querySelectorAll('a');
    processLinks(links);

    if (window.DebugUtils?.isDevelopment()) {
        window.DebugUtils.debugLog(`✅ 已處理 ${links.length} 個連結`);
    }
}

// 處理連結的函數
function processLinks(links) {
    links.forEach(link => {
        const href = link.getAttribute('href');

        // 跳過錨點連結、空連結和已經設定 target 的連結
        if (!href || href.startsWith('#') || link.hasAttribute('target')) {
            return;
        }

        // 判斷是否為外部連結
        const isExternal = href.startsWith('http://') ||
                          href.startsWith('https://') ||
                          href.startsWith('//');

        // 判斷是否為站內連結
        const isSameDomain = href.startsWith(window.location.origin) ||
                            href.startsWith('/') ||
                            href.startsWith('./') ||
                            href.startsWith('../');

        // 如果是外部連結,或者是完整 URL 但不是同域名
        if (isExternal && !isSameDomain) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');

            if (window.DebugUtils?.isDevelopment()) {
                window.DebugUtils.debugLog(`🔗 設定外部連結: ${href}`);
            }
        }
    });
}

// 初始化時添加樣式
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addServiceModalStyles);
} else {
    addServiceModalStyles();
}