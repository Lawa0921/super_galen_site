/* ===== 成就大廳 JavaScript 功能 ===== */

// 成就資料結構
const achievementData = {
    // 第一排 (上層) - 金色獎項
    'golden-coder': {
        icon: '🏆',
        title: '金牌程式師',
        description: '寫出優雅高效的程式碼，成為團隊中的技術標竿。每一行程式都像藝術品般精緻。',
        rarity: 'legendary',
        progress: 95,
        date: '2023-11-15'
    },
    'certification': {
        icon: '📜',
        title: '專業認證',
        description: '獲得多項重要技術認證，證明了你的專業知識和持續學習能力。',
        rarity: 'epic',
        progress: 100,
        date: '2023-08-20'
    },
    'champion-trophy': {
        icon: '🏅',
        title: '競賽冠軍',
        description: '在程式設計競賽中脫穎而出，用實力證明自己是真正的程式設計高手。',
        rarity: 'legendary',
        progress: 100,
        date: '2023-06-10'
    },
    'excellence-award': {
        icon: '🥇',
        title: '卓越獎章',
        description: '在專案開發中表現卓越，獲得同事和上司的一致認可。',
        rarity: 'epic',
        progress: 88,
        date: '2023-12-05'
    },
    'knowledge-keeper': {
        icon: '📚',
        title: '知識守護者',
        description: '博覽群書，掌握豐富的技術知識，成為團隊中的知識寶庫。',
        rarity: 'rare',
        progress: 78,
        date: '2023-09-18'
    },

    // 第二排 (中層) - 專業技能
    'pyramid-builder': {
        icon: '🏗️',
        title: '架構大師',
        description: '設計出穩固如金字塔的系統架構，為專案奠定堅實的技術基礎。',
        rarity: 'legendary',
        progress: 82,
        date: '2023-10-12'
    },
    'cross-platform': {
        icon: '✝️',
        title: '跨平台專家',
        description: '精通多平台開發，能夠讓程式在各種環境中完美運行。',
        rarity: 'epic',
        progress: 75,
        date: '2023-07-22'
    },
    'balance-master': {
        icon: '⚖️',
        title: '平衡大師',
        description: '在性能、安全性和可維護性之間找到完美平衡，寫出真正優秀的程式。',
        rarity: 'epic',
        progress: 90,
        date: '2023-11-30'
    },
    'community-star': {
        icon: '⭐',
        title: '社群之星',
        description: '在技術社群中閃閃發光，積極分享知識，幫助他人成長。',
        rarity: 'rare',
        progress: 65,
        date: '2023-05-14'
    },
    'documentation-hero': {
        icon: '📋',
        title: '文件英雄',
        description: '撰寫清晰完整的技術文件，拯救了無數迷失在程式碼海洋中的開發者。',
        rarity: 'rare',
        progress: 85,
        date: '2023-09-28'
    },

    // 第三排 (下層) - 工具與管理
    'polyglot-programmer': {
        icon: '🌈',
        title: '多語言專家',
        description: '精通多種程式語言，能夠選用最適合的工具來解決問題。',
        rarity: 'epic',
        progress: 70,
        date: '2023-04-15'
    },
    'project-manager': {
        icon: '📁',
        title: '專案管理師',
        description: '擅長專案規劃與管理，確保每個專案都能按時高質量完成。',
        rarity: 'uncommon',
        progress: 88,
        date: '2023-08-03'
    },
    'devops-engineer': {
        icon: '🔧',
        title: 'DevOps 工程師',
        description: '建構自動化部署流程，讓開發與營運無縫接軌，提升整體效率。',
        rarity: 'epic',
        progress: 72,
        date: '2023-10-20'
    },
    'system-architect': {
        icon: '🖥️',
        title: '系統架構師',
        description: '設計高可用性、高擴展性的系統架構，支撐大規模應用的運行。',
        rarity: 'legendary',
        progress: 80,
        date: '2023-12-18'
    },
    'problem-solver': {
        icon: '🔨',
        title: '問題解決專家',
        description: '面對棘手問題時總能找到解決方案，是團隊中的救火英雄。',
        rarity: 'rare',
        progress: 92,
        date: '2024-01-08'
    }
};

// DOM 元素
let achievementsHall = null;
let doorContainer = null;
let achievementBookshelf = null;
let achievementTooltip = null;
let holyLightParticles = null;

// 原始圖片尺寸（根據實際圖片尺寸設定）
const ORIGINAL_IMAGE_WIDTH = 1024;  // 原始圖片寬度
const ORIGINAL_IMAGE_HEIGHT = 1024; // 原始圖片高度

// 初始化成就大廳
function initAchievementsHall() {
    achievementsHall = document.querySelector('.achievements-hall');
    doorContainer = document.querySelector('.door-container');
    achievementBookshelf = document.querySelector('.achievement-bookshelf');
    achievementTooltip = document.querySelector('.achievement-tooltip');
    holyLightParticles = document.querySelector('.holy-light-particles');
    
    if (!achievementsHall) return;
    
    // 啟動入場動畫
    setTimeout(() => {
        startEntranceAnimation();
    }, 500);
    
    // 設置熱點事件監聽器
    setupHotspotListeners();
    
    // 初始化圖片縮放比例計算
    setupImageScaling();
}

// 開始入場動畫
function startEntranceAnimation() {
    if (!achievementsHall || !doorContainer) return;
    
    // 添加動畫類別
    achievementsHall.classList.add('animate-entrance');
    
    // 1秒後開始開門動畫並觸發所有效果
    setTimeout(() => {
        // 門開動畫
        doorContainer.classList.add('doors-opening');
        
        // 觸發金光背景效果
        achievementsHall.classList.add('doors-opening');
        
        // 立即顯示書櫃但透明度較低
        if (achievementBookshelf) {
            achievementBookshelf.style.display = 'flex';
            achievementsHall.classList.add('bookshelf-early-show');
        }
        
        // 啟動聖光粒子效果
        if (holyLightParticles) {
            holyLightParticles.classList.add('active');
        }
    }, 1000);
    
    // 3秒後聖光效果開始淡去，書櫃完全顯示
    setTimeout(() => {
        if (holyLightParticles) {
            holyLightParticles.classList.remove('active');
        }
        if (achievementsHall) {
            achievementsHall.classList.remove('bookshelf-early-show');
            achievementsHall.classList.add('bookshelf-visible');
        }
    }, 4000);
}

// 設置熱點監聽器
function setupHotspotListeners() {
    const hotspots = document.querySelectorAll('.achievement-hotspot');
    
    hotspots.forEach(hotspot => {
        // 滑鼠懸停事件
        hotspot.addEventListener('mouseenter', (e) => {
            showAchievementTooltip(e.target, e);
            showHoverEffect(e.target);
        });
        
        // 滑鼠移動事件 (更新位置)
        hotspot.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e);
        });
        
        // 滑鼠離開事件
        hotspot.addEventListener('mouseleave', () => {
            hideAchievementTooltip();
            hideHoverEffect();
        });
        
        // 點擊事件 (詳細資訊)
        hotspot.addEventListener('click', (e) => {
            showAchievementDetail(e.target);
        });
    });
}

// 顯示hover白光效果
function showHoverEffect(hotspot) {
    const bookshelf = document.querySelector('.achievement-bookshelf');
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (!bookshelf || !bookshelfImage) return;
    
    // 清除之前的效果
    hideHoverEffect();
    
    // 獲取當前的座標（已經經過縮放調整）
    const coords = hotspot.coords.split(',').map(Number);
    const shape = hotspot.shape;
    
    // 計算相對於圖片的位置
    const imageRect = bookshelfImage.getBoundingClientRect();
    const bookshelfRect = bookshelf.getBoundingClientRect();
    
    // 圖片在容器中的偏移
    const imageOffsetX = imageRect.left - bookshelfRect.left;
    const imageOffsetY = imageRect.top - bookshelfRect.top;
    
    let left, top, width, height;
    
    if (shape === 'rect') {
        left = coords[0] + imageOffsetX;
        top = coords[1] + imageOffsetY;
        width = coords[2] - coords[0];
        height = coords[3] - coords[1];
    } else if (shape === 'circle') {
        const centerX = coords[0];
        const centerY = coords[1];
        const radius = coords[2];
        left = centerX - radius + imageOffsetX;
        top = centerY - radius + imageOffsetY;
        width = radius * 2;
        height = radius * 2;
    } else if (shape === 'poly') {
        // 處理多邊形座標
        let minX = coords[0], maxX = coords[0], minY = coords[1], maxY = coords[1];
        for (let i = 0; i < coords.length; i += 2) {
            minX = Math.min(minX, coords[i]);
            maxX = Math.max(maxX, coords[i]);
            minY = Math.min(minY, coords[i + 1]);
            maxY = Math.max(maxY, coords[i + 1]);
        }
        left = minX + imageOffsetX;
        top = minY + imageOffsetY;
        width = maxX - minX;
        height = maxY - minY;
    }
    
    // 創建主要光暈效果
    const hoverEffect = document.createElement('div');
    hoverEffect.className = 'achievement-hover-effect';
    hoverEffect.style.left = `${left - 4}px`;
    hoverEffect.style.top = `${top - 4}px`;
    hoverEffect.style.width = `${width + 8}px`;
    hoverEffect.style.height = `${height + 8}px`;
    
    // 創建邊框效果
    const borderEffect = document.createElement('div');
    borderEffect.className = 'achievement-hover-border';
    borderEffect.style.left = `${left - 2}px`;
    borderEffect.style.top = `${top - 2}px`;
    borderEffect.style.width = `${width + 4}px`;
    borderEffect.style.height = `${height + 4}px`;
    
    bookshelf.appendChild(borderEffect);
    bookshelf.appendChild(hoverEffect);
}

// 隱藏hover效果
function hideHoverEffect() {
    const effects = document.querySelectorAll('.achievement-hover-effect, .achievement-hover-border');
    effects.forEach(effect => effect.remove());
}

// 顯示成就提示框
function showAchievementTooltip(hotspot, event) {
    if (!achievementTooltip) return;
    
    const achievementId = hotspot.dataset.achievement;
    const achievement = achievementData[achievementId];
    
    if (!achievement) return;
    
    // 更新提示框內容
    updateTooltipContent(achievement);
    
    // 設置位置
    updateTooltipPosition(event);
    
    // 顯示提示框
    achievementTooltip.classList.add('show');
}

// 更新提示框內容
function updateTooltipContent(achievement) {
    if (!achievementTooltip) return;
    
    const rarityClass = achievement.rarity;
    const progressPercentage = achievement.progress;
    const isCompleted = progressPercentage >= 100;
    
    achievementTooltip.innerHTML = `
        <div class="tooltip-header">
            <span class="tooltip-icon">${achievement.icon}</span>
            <div>
                <div class="tooltip-title">${achievement.title}</div>
                <span class="tooltip-rarity ${rarityClass}">${getRarityText(achievement.rarity)}</span>
            </div>
        </div>
        <div class="tooltip-description">
            ${achievement.description}
        </div>
        <div class="tooltip-progress">
            <div class="tooltip-progress-label">
                完成度: ${progressPercentage}% ${isCompleted ? '✨ 已完成' : ''}
            </div>
            <div class="tooltip-progress-bar">
                <div class="tooltip-progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
        </div>
        <div class="tooltip-date">
            ${isCompleted ? '完成於: ' : '開始於: '}${achievement.date}
        </div>
    `;
}

// 獲取稀有度文字
function getRarityText(rarity) {
    const rarityMap = {
        'common': '普通',
        'uncommon': '不常見',
        'rare': '稀有',
        'epic': '史詩',
        'legendary': '傳奇'
    };
    return rarityMap[rarity] || '普通';
}

// 更新提示框位置
function updateTooltipPosition(event) {
    if (!achievementTooltip) return;
    
    const tooltipRect = achievementTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.pageX - tooltipRect.width / 2;
    let top = event.pageY - tooltipRect.height - 20;
    
    // 防止超出視窗邊界
    if (left < 10) left = 10;
    if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
    }
    
    if (top < 10) {
        top = event.pageY + 20;
    }
    
    achievementTooltip.style.left = `${left}px`;
    achievementTooltip.style.top = `${top}px`;
}

// 隱藏成就提示框
function hideAchievementTooltip() {
    if (achievementTooltip) {
        achievementTooltip.classList.remove('show');
    }
}

// 顯示成就詳細資訊 (點擊事件)
function showAchievementDetail(hotspot) {
    const achievementId = hotspot.dataset.achievement;
    const achievement = achievementData[achievementId];
    
    if (!achievement) return;
    
    // 創建詳細資訊模態框
    const modal = createAchievementModal(achievement);
    document.body.appendChild(modal);
    
    // 顯示模態框
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // 點擊外部關閉
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAchievementModal(modal);
        }
    });
    
    // ESC 鍵關閉
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeAchievementModal(modal);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// 創建成就模態框
function createAchievementModal(achievement) {
    const modal = document.createElement('div');
    modal.className = 'achievement-modal';
    
    const isCompleted = achievement.progress >= 100;
    
    modal.innerHTML = `
        <div class="achievement-modal-content">
            <button class="achievement-modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
            <div class="achievement-modal-header">
                <span class="achievement-modal-icon">${achievement.icon}</span>
                <div class="achievement-modal-info">
                    <h2 class="achievement-modal-title">${achievement.title}</h2>
                    <span class="achievement-modal-rarity ${achievement.rarity}">
                        ${getRarityText(achievement.rarity)}
                    </span>
                </div>
            </div>
            <div class="achievement-modal-description">
                ${achievement.description}
            </div>
            <div class="achievement-modal-progress">
                <div class="progress-label">完成度: ${achievement.progress}%</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${achievement.progress}%"></div>
                    </div>
                    <div class="progress-status ${isCompleted ? 'completed' : 'in-progress'}">
                        ${isCompleted ? '✨ 已完成' : '🔄 進行中'}
                    </div>
                </div>
            </div>
            <div class="achievement-modal-date">
                ${isCompleted ? '完成於: ' : '開始於: '}${achievement.date}
            </div>
        </div>
    `;
    
    // 添加模態框樣式
    const style = document.createElement('style');
    style.textContent = `
        .achievement-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .achievement-modal.show {
            opacity: 1;
        }
        
        .achievement-modal-content {
            background: linear-gradient(135deg, #2a1810, #1f140a);
            border: 3px solid #FFD700;
            border-radius: 16px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            position: relative;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }
        
        .achievement-modal-close {
            position: absolute;
            top: 12px;
            right: 16px;
            background: none;
            border: none;
            color: #FFD700;
            font-size: 24px;
            cursor: pointer;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .achievement-modal-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }
        
        .achievement-modal-icon {
            font-size: 4rem;
            text-shadow: 0 0 20px currentColor;
        }
        
        .achievement-modal-title {
            font-size: 1.8rem;
            color: #FFD700;
            margin: 0;
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        
        .achievement-modal-rarity {
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .achievement-modal-description {
            color: #E8E8E8;
            line-height: 1.6;
            margin-bottom: 20px;
            font-size: 1.1rem;
        }
        
        .achievement-modal-progress {
            margin-bottom: 16px;
        }
        
        .progress-label {
            color: #BDC3C7;
            margin-bottom: 8px;
            font-weight: bold;
        }
        
        .progress-bar-container {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .progress-bar-bg {
            flex: 1;
            height: 12px;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 6px;
            overflow: hidden;
        }
        
        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #FFD700, #FFA500);
            border-radius: 6px;
            transition: width 0.8s ease;
            box-shadow: 0 0 12px rgba(255, 215, 0, 0.8);
        }
        
        .progress-status {
            font-size: 0.9rem;
            font-weight: bold;
        }
        
        .progress-status.completed {
            color: #2ECC71;
        }
        
        .progress-status.in-progress {
            color: #F39C12;
        }
        
        .achievement-modal-date {
            color: #7F8C8D;
            font-style: italic;
            text-align: right;
        }
    `;
    
    if (!document.querySelector('#achievement-modal-styles')) {
        style.id = 'achievement-modal-styles';
        document.head.appendChild(style);
    }
    
    return modal;
}

// 關閉成就模態框
function closeAchievementModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }, 300);
}

// 重置成就大廳 (用於頁面切換)
function resetAchievementsHall() {
    if (achievementsHall) {
        achievementsHall.classList.remove('animate-entrance', 'bookshelf-visible', 'doors-opening', 'bookshelf-early-show');
    }
    if (doorContainer) {
        doorContainer.classList.remove('doors-opening');
    }
    if (achievementBookshelf) {
        achievementBookshelf.style.display = 'none';
    }
    if (holyLightParticles) {
        holyLightParticles.classList.remove('active');
    }
    hideAchievementTooltip();
}

// 檢查頁面是否為成就頁面
function isAchievementsPage() {
    return window.location.hash === '#achievements';
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    // 只有當明確在成就頁面時才初始化
    if (isAchievementsPage()) {
        // 延遲初始化，確保DOM完全載入
        setTimeout(() => {
            initAchievementsHall();
        }, 100);
    }
    
    // 監聽 hash 變化
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#achievements') {
            // 延遲初始化，等待內容載入
            setTimeout(() => {
                initAchievementsHall();
            }, 100);
        } else {
            resetAchievementsHall();
        }
    });
});

// 設置圖片縮放比例計算
function setupImageScaling() {
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (!bookshelfImage) return;
    
    // 等待圖片載入完成
    if (bookshelfImage.complete) {
        updateImageMapCoordinates();
    } else {
        bookshelfImage.addEventListener('load', updateImageMapCoordinates);
    }
    
    // 監聽視窗大小變化
    window.addEventListener('resize', debounce(updateImageMapCoordinates, 300));
}

// 更新 Image Map 座標以匹配縮放後的圖片
function updateImageMapCoordinates() {
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (!bookshelfImage) return;
    
    const currentWidth = bookshelfImage.offsetWidth;
    const currentHeight = bookshelfImage.offsetHeight;
    
    // 計算縮放比例
    const scaleX = currentWidth / ORIGINAL_IMAGE_WIDTH;
    const scaleY = currentHeight / ORIGINAL_IMAGE_HEIGHT;
    
    console.log(`縮放比例 - X: ${scaleX.toFixed(3)}, Y: ${scaleY.toFixed(3)}`);
    console.log(`圖片尺寸 - 原始: ${ORIGINAL_IMAGE_WIDTH}x${ORIGINAL_IMAGE_HEIGHT}, 當前: ${currentWidth}x${currentHeight}`);
    
    // 獲取所有 Image Map areas
    const areas = document.querySelectorAll('area.achievement-hotspot');
    
    areas.forEach(area => {
        const originalCoords = area.dataset.originalCoords;
        
        // 第一次運行時儲存原始座標
        if (!originalCoords) {
            area.dataset.originalCoords = area.coords;
        }
        
        // 使用原始座標進行縮放計算
        const coords = (originalCoords || area.coords).split(',').map(Number);
        const scaledCoords = coords.map((coord, index) => {
            // 奇數索引是 Y 座標，偶數索引是 X 座標
            const scale = index % 2 === 0 ? scaleX : scaleY;
            return Math.round(coord * scale);
        });
        
        area.coords = scaledCoords.join(',');
    });
}

// 防抖函數
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 暴露給全域使用的函數
if (typeof window !== 'undefined') {
    window.AchievementsHall = {
        init: initAchievementsHall,
        reset: resetAchievementsHall,
        showTooltip: showAchievementTooltip,
        hideTooltip: hideAchievementTooltip,
        updateCoordinates: updateImageMapCoordinates
    };
}