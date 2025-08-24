// 主要的 JavaScript 檔案
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 炫酷部落格已載入完成！');
    
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
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    // 設定初始主題
    document.documentElement.setAttribute('data-theme', currentTheme);
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
                    if (window.currentSkillTreeTab && window.currentSkillTreeTab.drawFullSkillTree) {
                        window.currentSkillTreeTab.drawFullSkillTree();
                    } else {
                        initSkillTreeCanvas();
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
    const navButtons = document.querySelectorAll('.nav-btn');
    const skillCanvas = document.getElementById('skill-tree-canvas');
    const detailsPanel = document.querySelector('.skill-details-panel');
    
    if (!skillCanvas) return;
    
    // 技能樹數據
    const skillData = {
        frontend: {
            name: '前端技術樹',
            level: 85,
            mastery: 12,
            learning: 5,
            description: '掌握現代前端開發技術，包含 React、Vue.js、HTML5、CSS3 等核心技術，以及各種前端工具鏈的運用。'
        },
        backend: {
            name: '後端技術樹',
            level: 78,
            mastery: 8,
            learning: 6,
            description: '精通 Node.js、Python、Java 等後端技術，熟悉資料庫設計與 API 開發，具備微服務架構經驗。'
        },
        devops: {
            name: 'DevOps 技術樹',
            level: 72,
            mastery: 6,
            learning: 8,
            description: '熟悉 Docker、Kubernetes、CI/CD 流程，擅長雲端部署與自動化運維，提升開發效率。'
        },
        blockchain: {
            name: '區塊鏈技術樹',
            level: 68,
            mastery: 6,
            learning: 4,
            description: '精通 Solidity 智能合約開發、Web3.js、DeFi 協議，熟悉各種區塊鏈生態系統。'
        },
        personal: {
            name: '生活技能樹',
            level: 90,
            mastery: 15,
            learning: 3,
            description: '包含專案管理、團隊協作、技術寫作、教學分享等軟實力，以及桌遊教學、野營管理等個人興趣。'
        }
    };
    
    // 畫布中心點
    const canvasWidth = 1600;
    const canvasHeight = 900;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    // 五個方向的角度（從上方開始，順時針）
    const branchAngles = {
        frontend: -90,      // 上
        backend: -18,       // 右上
        devops: 54,         // 右下
        blockchain: 126,    // 左下
        personal: 198       // 左上
    };
    
    // 計算位置的輔助函數
    function calculatePosition(angle, distance) {
        const rad = angle * Math.PI / 180;
        return {
            x: centerX + Math.cos(rad) * distance,
            y: centerY + Math.sin(rad) * distance
        };
    }
    
    // 所有技能節點位置
    const skillPositions = {
        center: { x: centerX, y: centerY, name: 'SuperGalen', isRoot: true },
        frontend: { 
            ...calculatePosition(branchAngles.frontend, 200),
            nodes: [
                { name: 'React', ...calculatePosition(branchAngles.frontend, 320), level: 5 },
                { name: 'Vue.js', ...calculatePosition(branchAngles.frontend - 15, 340), level: 4 },
                { name: 'TypeScript', ...calculatePosition(branchAngles.frontend + 15, 340), level: 4 },
                { name: 'CSS3', ...calculatePosition(branchAngles.frontend - 30, 380), level: 5 },
                { name: 'Webpack', ...calculatePosition(branchAngles.frontend + 30, 380), level: 3 }
            ]
        },
        backend: { 
            ...calculatePosition(branchAngles.backend, 200),
            nodes: [
                { name: 'Node.js', ...calculatePosition(branchAngles.backend, 320), level: 5 },
                { name: 'Python', ...calculatePosition(branchAngles.backend - 15, 340), level: 4 },
                { name: 'PostgreSQL', ...calculatePosition(branchAngles.backend + 15, 340), level: 4 },
                { name: 'Redis', ...calculatePosition(branchAngles.backend - 30, 380), level: 3 },
                { name: 'GraphQL', ...calculatePosition(branchAngles.backend + 30, 380), level: 3 }
            ]
        },
        devops: { 
            ...calculatePosition(branchAngles.devops, 200),
            nodes: [
                { name: 'Docker', ...calculatePosition(branchAngles.devops, 320), level: 4 },
                { name: 'K8s', ...calculatePosition(branchAngles.devops - 15, 340), level: 3 },
                { name: 'AWS', ...calculatePosition(branchAngles.devops + 15, 340), level: 4 },
                { name: 'CI/CD', ...calculatePosition(branchAngles.devops - 30, 380), level: 4 },
                { name: 'Terraform', ...calculatePosition(branchAngles.devops + 30, 380), level: 2 }
            ]
        },
        blockchain: { 
            ...calculatePosition(branchAngles.blockchain, 200),
            nodes: [
                { name: 'Solidity', ...calculatePosition(branchAngles.blockchain, 320), level: 4 },
                { name: 'Web3.js', ...calculatePosition(branchAngles.blockchain - 15, 340), level: 4 },
                { name: 'DeFi', ...calculatePosition(branchAngles.blockchain + 15, 340), level: 3 },
                { name: 'NFT', ...calculatePosition(branchAngles.blockchain - 30, 380), level: 3 },
                { name: 'DAO', ...calculatePosition(branchAngles.blockchain + 30, 380), level: 2 }
            ]
        },
        personal: { 
            ...calculatePosition(branchAngles.personal, 200),
            nodes: [
                { name: '溝通力', ...calculatePosition(branchAngles.personal, 320), level: 5 },
                { name: '團隊合作', ...calculatePosition(branchAngles.personal - 15, 340), level: 5 },
                { name: '問題解決', ...calculatePosition(branchAngles.personal + 15, 340), level: 4 },
                { name: '時間管理', ...calculatePosition(branchAngles.personal - 30, 380), level: 3 },
                { name: '領導力', ...calculatePosition(branchAngles.personal + 30, 380), level: 3 }
            ]
        }
    };
    
    let selectedSkill = null;
    let cameraOffset = { x: 0, y: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    
    // 繪製整個技能樹
    function drawFullSkillTree() {
        const canvas = document.getElementById('skill-tree-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // 計算合適的縮放比例
        const scale = Math.min(canvas.width / canvasWidth, canvas.height / canvasHeight) * 0.9;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        
        // 將原點移到畫布中心，然後應用偏移和縮放
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-canvasWidth / 2 + cameraOffset.x, -canvasHeight / 2 + cameraOffset.y);
        
        // 先繪製所有連線（從中心到各分支）
        Object.entries(skillPositions).forEach(([branch, data]) => {
            if (branch !== 'center' && skillData[branch]) {
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(skillPositions.center.x, skillPositions.center.y);
                ctx.lineTo(data.x, data.y);
                ctx.stroke();
            }
        });
        
        // 繪製中心節點（SuperGalen）
        drawCenterNode(ctx);
        
        // 繪製所有分支
        Object.entries(skillPositions).forEach(([branch, data]) => {
            if (branch !== 'center' && skillData[branch]) {
                drawBranch(ctx, branch, data, skillData[branch]);
            }
        });
        
        ctx.restore();
    }
    
    // 繪製中心節點
    function drawCenterNode(ctx) {
        const center = skillPositions.center;
        
        // 繪製光暈效果
        const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 50);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 50, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製主節點
        ctx.fillStyle = '#ff6b6b';
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 繪製文字
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(center.name, center.x, center.y);
    }
    
    // 繪製單一分支
    function drawBranch(ctx, branchName, position, branchData) {
        const { x, y, nodes } = position;
        
        // 繪製根節點
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        
        // 根節點
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(branchData.name.replace('技術樹', '').replace('技能樹', ''), x, y);
        
        // 繪製連線和子節點
        nodes.forEach(node => {
            // 連線
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(node.x, node.y);
            ctx.stroke();
            
            // 子節點
            const nodeSize = 15 + node.level * 3;
            ctx.fillStyle = node.level >= 4 ? '#10b981' : '#3b82f6';
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '11px Arial';
            ctx.fillText(node.name, node.x, node.y);
        });
    }
    
    // 導航按鈕事件
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const branch = btn.getAttribute('data-branch');
            const position = skillPositions[branch];
            
            if (position) {
                // 平滑移動相機到對應分支
                const targetX = 0;
                const targetY = 0;
                
                // 計算需要的偏移量，讓目標分支位於畫布中心
                const branchOffsetX = centerX - position.x;
                const branchOffsetY = centerY - position.y;
                
                // 簡單的平滑過渡
                const duration = 500;
                const startTime = Date.now();
                const startX = cameraOffset.x;
                const startY = cameraOffset.y;
                
                function animate() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // 使用 easeOutCubic 緩動函數
                    const easeProgress = 1 - Math.pow(1 - progress, 3);
                    
                    cameraOffset.x = startX + (branchOffsetX - startX) * easeProgress;
                    cameraOffset.y = startY + (branchOffsetY - startY) * easeProgress;
                    
                    drawFullSkillTree();
                    
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    }
                }
                
                animate();
            }
        });
    });
    
    // Canvas 事件
    skillCanvas.addEventListener('mousedown', (e) => {
        const rect = skillCanvas.getBoundingClientRect();
        const scale = Math.min(skillCanvas.width / canvasWidth, skillCanvas.height / canvasHeight) * 0.9;
        
        // 計算實際的點擊位置（考慮縮放和偏移）
        const canvasX = (e.clientX - rect.left - skillCanvas.width / 2) / scale + canvasWidth / 2 - cameraOffset.x;
        const canvasY = (e.clientY - rect.top - skillCanvas.height / 2) / scale + canvasHeight / 2 - cameraOffset.y;
        
        // 檢查是否點擊到技能節點
        let clicked = false;
        
        // 檢查中心節點
        const centerDist = Math.sqrt((canvasX - skillPositions.center.x) ** 2 + (canvasY - skillPositions.center.y) ** 2);
        if (centerDist < 35) {
            clicked = true;
            showSkillDetails({
                name: 'SuperGalen',
                level: 100,
                description: '技能樹的核心，所有技能都從這裡發散出去。'
            }, 'center');
        }
        
        // 檢查分支節點
        if (!clicked) {
            Object.entries(skillPositions).forEach(([branch, data]) => {
                if (branch !== 'center' && data.nodes) {
                    // 檢查根節點
                    const rootDist = Math.sqrt((canvasX - data.x) ** 2 + (canvasY - data.y) ** 2);
                    if (rootDist < 30) {
                        clicked = true;
                        showSkillDetails(skillData[branch], branch);
                    }
                    
                    // 檢查子節點
                    data.nodes.forEach(node => {
                        const nodeSize = 15 + node.level * 3;
                        const dist = Math.sqrt((canvasX - node.x) ** 2 + (canvasY - node.y) ** 2);
                        if (dist < nodeSize) {
                            clicked = true;
                            showSkillDetails(node, branch);
                        }
                    });
                }
            });
        }
        
        if (!clicked) {
            isDragging = true;
            dragStart = { x: e.clientX - cameraOffset.x, y: e.clientY - cameraOffset.y };
        }
    });
    
    skillCanvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            cameraOffset.x = e.clientX - dragStart.x;
            cameraOffset.y = e.clientY - dragStart.y;
            drawFullSkillTree();
        }
    });
    
    skillCanvas.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // 顯示技能詳情
    function showSkillDetails(skillInfo, branch) {
        const detailsPanel = document.querySelector('.skill-details-panel');
        if (!detailsPanel) return;
        
        detailsPanel.classList.add('active');
        
        // 更新詳情內容
        const skillName = document.getElementById('skill-name');
        const skillProgress = document.getElementById('skill-progress');
        const levelText = skillProgress?.nextElementSibling;
        const skillDescription = document.getElementById('skill-description');
        
        if (skillName) skillName.textContent = skillInfo.name || '未知技能';
        if (skillProgress && levelText) {
            const level = skillInfo.level || 0;
            skillProgress.style.width = `${level}%`;
            levelText.textContent = `Level ${level}`;
        }
        if (skillDescription) {
            skillDescription.innerHTML = `<p>${skillInfo.description || '技能說明載入中...'}</p>`;
        }
        
        // 如果是分支根節點，顯示統計數據
        if (skillData[branch]) {
            const masteryCount = document.getElementById('mastery-count');
            const learningCount = document.getElementById('learning-count');
            if (masteryCount) masteryCount.textContent = skillData[branch].mastery || 0;
            if (learningCount) learningCount.textContent = skillData[branch].learning || 0;
        }
    }
    
    // 隱藏技能詳情
    function hideSkillDetails() {
        const detailsPanel = document.querySelector('.skill-details-panel');
        if (detailsPanel) {
            detailsPanel.classList.remove('active');
        }
    }
    
    // 點擊其他區域收起說明面板
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.skill-details-panel') && 
            !e.target.closest('#skill-tree-canvas') &&
            !e.target.closest('.nav-btn')) {
            hideSkillDetails();
        }
    });
    
    // 初始化技能樹畫布
    setTimeout(() => {
        drawFullSkillTree();
    }, 100);
    
    // 將必要的函數暴露到全局作用域
    window.currentSkillTreeTab = {
        drawFullSkillTree
    };
}

// 更新技能詳情
function updateSkillDetails(data) {
    const skillName = document.getElementById('skill-name');
    const skillProgress = document.getElementById('skill-progress');
    const masteryCount = document.getElementById('mastery-count');
    const learningCount = document.getElementById('learning-count');
    const skillDescription = document.getElementById('skill-description');
    
    if (skillName) skillName.textContent = data.name;
    if (skillProgress) {
        skillProgress.style.width = `${data.level}%`;
        skillProgress.nextElementSibling.textContent = `Level ${data.level}`;
    }
    if (masteryCount) masteryCount.textContent = data.mastery;
    if (learningCount) learningCount.textContent = data.learning;
    if (skillDescription) {
        skillDescription.innerHTML = `<p>${data.description}</p>`;
    }
}

// 初始化技能樹畫布
function initSkillTreeCanvas() {
    const canvas = document.getElementById('skill-tree-canvas');
    if (!canvas) return;
    
    // 確保畫布尺寸正確
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // 使用新的繪製函數
    if (window.currentSkillTreeTab) {
        window.currentSkillTreeTab.drawFullSkillTree();
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
    // 隨機生成初始資源值
    const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    // 資源狀態 (隨機初始值)
    const resources = {
        hp: { 
            current: randomBetween(300, 1000), 
            max: 1000, 
            regen: 3      // 每5秒回3
        },
        mp: { 
            current: randomBetween(100, 500), 
            max: 500, 
            regen: 1.5    // 每5秒回1.5
        },
        sp: { 
            current: randomBetween(0, 300), 
            max: 300, 
            regen: 2      // 每5秒回2
        },
        exp: { 
            current: 0, 
            max: 100, 
            regen: 0 
        }
    };
    
    // 自動回復計時器
    let regenTimer = null;
    let randomEventTimer = null;
    
    // 更新資源顯示
    function updateResourceDisplay(type) {
        const bar = document.querySelector(`.${type}-bar`);
        if (!bar) return;
        
        const fill = bar.querySelector('.bar-fill');
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
    
    // 修改資源值
    function modifyResource(type, amount, showPopup = true) {
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
    
    // 自動回復
    function startRegen() {
        if (regenTimer) clearInterval(regenTimer);
        
        regenTimer = setInterval(() => {
            // HP 回復
            if (resources.hp.current < resources.hp.max && resources.hp.current > 0) {
                modifyResource('hp', resources.hp.regen, false);
            }
            
            // MP 回復
            if (resources.mp.current < resources.mp.max) {
                modifyResource('mp', resources.mp.regen, false);
            }
            
            // SP 回復
            if (resources.sp.current < resources.sp.max) {
                modifyResource('sp', resources.sp.regen, false);
            }
        }, 5000); // 每5秒回復一次
    }
    
    // 隨機事件
    function startRandomEvents() {
        const triggerRandomEvent = () => {
            // 隨機事件類型
            const eventType = Math.random();
            
            if (eventType < 0.4) {
                // 40% 機率：小型回復事件
                const healAmount = Math.floor(Math.random() * 20) + 10; // 10-30
                modifyResource('hp', healAmount);
                
                // 同時回復一些 MP/SP
                modifyResource('mp', Math.floor(healAmount * 0.5), false);
                modifyResource('sp', Math.floor(healAmount * 0.7), false);
            } else if (eventType < 0.7) {
                // 30% 機率：傷害事件
                const types = ['hp', 'mp', 'sp'];
                const type = types[Math.floor(Math.random() * types.length)];
                const damage = Math.floor(Math.random() * 30) + 15; // 15-45
                modifyResource(type, -damage);
            } else if (eventType < 0.85) {
                // 15% 機率：大型回復事件
                const bigHeal = Math.floor(Math.random() * 40) + 30; // 30-70
                modifyResource('hp', bigHeal);
                modifyResource('mp', 20, false);
                modifyResource('sp', 25, false);
            } else {
                // 15% 機率：災難事件
                const bigDamage = Math.floor(Math.random() * 50) + 30; // 30-80
                modifyResource('hp', -bigDamage);
                
                // 創建特殊警告效果
                const bar = document.querySelector('.hp-bar');
                if (bar) {
                    const popup = document.createElement('div');
                    popup.className = 'damage-popup damage';
                    popup.textContent = `災難! -${bigDamage}`;
                    popup.style.fontSize = '1.8rem';
                    popup.style.color = '#ff0000';
                    popup.style.fontWeight = 'bold';
                    popup.style.textShadow = '0 0 10px #ff0000';
                    
                    const rect = bar.getBoundingClientRect();
                    popup.style.left = `${rect.left + rect.width / 2}px`;
                    popup.style.top = `${rect.top + rect.height / 2}px`;
                    
                    document.body.appendChild(popup);
                    setTimeout(() => popup.remove(), 2000);
                }
            }
            
            // 設置下次觸發時間（10-20秒）
            const nextDelay = Math.random() * 10000 + 10000;
            randomEventTimer = setTimeout(triggerRandomEvent, nextDelay);
        };
        
        // 初始延遲
        randomEventTimer = setTimeout(triggerRandomEvent, 15000);
    }
    
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
            element.addEventListener('click', () => {
                // 只扣 HP
                const type = 'hp';
                
                // 基礎傷害 1-10
                let damage = Math.floor(Math.random() * 10) + 1;
                
                // 爆擊判定 (20% 機率)
                const isCritical = Math.random() < 0.2;
                if (isCritical) {
                    damage = Math.floor(damage * 1.5);
                    
                    // 爆擊時創建特殊效果
                    const bar = document.querySelector('.hp-bar');
                    if (bar) {
                        const popup = document.createElement('div');
                        popup.className = 'damage-popup damage';
                        popup.textContent = `暴擊! -${damage}`;
                        popup.style.fontSize = '1.5rem';
                        popup.style.color = '#ff0000';
                        popup.style.fontWeight = 'bold';
                        
                        const rect = bar.getBoundingClientRect();
                        popup.style.left = `${rect.left + rect.width / 2}px`;
                        popup.style.top = `${rect.top + rect.height / 2}px`;
                        
                        document.body.appendChild(popup);
                        setTimeout(() => popup.remove(), 1500);
                        
                        // 不顯示普通傷害數字
                        modifyResource(type, -damage, false);
                        return;
                    }
                }
                
                // 扣血 (負數)
                modifyResource(type, -damage);
            });
        });
    }
    
    // 初始化
    function init() {
        // 更新所有資源顯示
        Object.keys(resources).forEach(type => {
            updateResourceDisplay(type);
        });
        
        // 啟動自動回復
        startRegen();
        
        // 啟動隨機事件
        startRandomEvents();
        
        // 綁定按鈕事件
        bindButtonEvents();
    }
    
    // 頁面卸載時清理
    window.addEventListener('beforeunload', () => {
        if (regenTimer) clearInterval(regenTimer);
        if (randomEventTimer) clearTimeout(randomEventTimer);
    });
    
    // 開始初始化
    init();
    
    // 導出 API 供其他模組使用
    window.resourceSystem = {
        modifyResource,
        getResource: (type) => resources[type]
    };
}