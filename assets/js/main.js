// 主要的 JavaScript 檔案
document.addEventListener('DOMContentLoaded', function() {    
    // 初始化所有功能
    initThemeToggle();
    initHeroAnimation();
    initScrollEffects();
    initParticleSystem();
    initSocialLinks();
    initTypingAnimation();
    updateDeveloperTime();
    updateCampTime();
    updatePlayerAge();
    updateYearProgress();
    initRPGInterface();
});

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

// 粒子系統
function initParticleSystem() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;
    
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0.3';
    
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    
    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 3 + 1,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.3
        };
    }
    
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach((particle, index) => {
            particle.x += particle.speedX;
            particle.y += particle.speedY;
            
            if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
            if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;
            
            ctx.globalAlpha = particle.opacity;
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--gradient-1');
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    resizeCanvas();
    for (let i = 0; i < 50; i++) {
        particles.push(createParticle());
    }
    animateParticles();
    
    window.addEventListener('resize', resizeCanvas);
}

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
    
    element.textContent = `${years}年${months}月${days}日 ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
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
    
    element.textContent = `${years}年${months}月${days}日 ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 每秒更新一次
    setTimeout(updateCampTime, 1000);
}

// 更新玩家年齡（等級）
function updatePlayerAge() {
    const element = document.getElementById('player-level');
    if (!element) return;
    
    const birthDate = new Date('1992-09-21');
    const now = new Date();
    
    let age = now.getFullYear() - birthDate.getFullYear();
    const monthDiff = now.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age--;
    }
    
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
    
    // 初始化物品欄系統
    if (typeof initInventorySystem === 'function') {
        initInventorySystem();
    }
    
    // 初始化金幣系統
    if (typeof initGoldSystem === 'function') {
        initGoldSystem();
    }
    
    // 初始化任務系統
    if (typeof initQuestSystem === 'function') {
        initQuestSystem();
    }
    
    // 初始化召喚系統
    if (typeof initSummonSystem === 'function') {
        initSummonSystem();
    }
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
    
    // 啟動 Tab 的函數
    function activateTab(tabName) {
        // 移除所有 active 類別
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));
        
        // 找到對應的按鈕和面板
        const targetButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const targetPanel = document.getElementById(`${tabName}-tab`);
        
        if (targetButton && targetPanel) {
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
                window.interactiveBook = new InteractiveBook();
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
    // 使用階層式技能樹系統
    window.skillTreeInstance = new HierarchicalSkillTree();
    
    // 保持相容性接口
    window.currentSkillTreeTab = {
        drawFullSkillTree: () => window.skillTreeInstance.drawFullSkillTree(),
        updateNavButtonLevels: () => window.skillTreeInstance.updateNavButtonLevels()
    };
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
                // 檢查是否在遊戲界面內（避免與金幣系統重複觸發）
                const isInGameInterface = e.target.closest('.d2-inventory-panel') || 
                                        e.target.closest('.rpg-interface');
                
                if (isInGameInterface) {
                    // 遊戲界面內的點擊由金幣系統處理（金幣系統會呼叫 SP/HP 消耗）
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
        console.log('本地自動回復已停用，使用 GameState 系統統一管理');
        
        // 隨機事件已整合到 GameState 系統
        console.log('隨機事件系統已整合到 GameState 系統中');
        
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