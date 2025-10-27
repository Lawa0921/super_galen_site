/* ===== 成就大廳 JavaScript 功能 ===== */

// 成就資料結構 - 從 i18n 系統載入
let achievementData = {};

// 從 i18n 系統載入成就資料
function loadAchievementData() {
    if (window.i18n && window.i18n.currentTranslations && window.i18n.currentTranslations.achievements) {
        const i18nAchievements = window.i18n.currentTranslations.achievements.items;
        achievementData = {};

        // 轉換 i18n 格式到原有的資料結構
        for (const [key, achievement] of Object.entries(i18nAchievements)) {
            achievementData[key] = {
                icon: achievement.icon,
                title: achievement.title,
                description: achievement.description,
                date: achievement.date
            };
        }

        console.log('成就資料已從 i18n 系統載入:', Object.keys(achievementData).length, '個成就');
    } else {
        console.warn('i18n 系統尚未載入或成就資料不存在');
    }
}

// 臨時函數，即將移除
function getRarityText(rarity) {
    return '';
}

// DOM 元素
let achievementsHall = null;
let doorContainer = null;
let achievementBookshelf = null;
let achievementTooltip = null;

// 原始圖片尺寸（根據實際圖片尺寸設定）
const ORIGINAL_IMAGE_WIDTH = 1024;  // 原始圖片寬度
const ORIGINAL_IMAGE_HEIGHT = 1024; // 原始圖片高度

// 初始化成就大廳 - 強化穩定性
function initAchievementsHall() {
    achievementsHall = document.querySelector('.achievements-hall');
    doorContainer = document.querySelector('.door-container');
    achievementBookshelf = document.querySelector('.achievement-bookshelf');
    achievementTooltip = document.querySelector('.achievement-tooltip');

    if (!achievementsHall) {
        console.warn('[Achievements] 成就大廳元素未找到');
        return;
    }

    console.log('[Achievements] 開始初始化成就系統');

    // 載入成就資料
    loadAchievementData();

    // 初始化圖片縮放比例計算（優先執行）
    setupImageScaling();

    // 等待圖片完全載入後再綁定事件
    ensureImageAndHotspots();
}

// 重置動畫狀態
function resetAnimationState() {
    if (!achievementsHall || !doorContainer) return;

    // 移除所有動畫類別
    achievementsHall.classList.remove('animate-entrance');
    doorContainer.classList.remove('doors-opening');

    // 恢復門的可見性和互動性
    doorContainer.style.display = 'flex';
    doorContainer.style.pointerEvents = 'auto';
    doorContainer.style.visibility = 'visible';

    if (achievementBookshelf) {
        achievementBookshelf.style.display = 'none';
    }

    // 重新設置門的點擊監聽器
    setTimeout(() => {
        setupDoorClickListener();
    }, 100);
}

// 設置門的點擊監聽器
function setupDoorClickListener() {
    if (!doorContainer) return;
    
    // 移除之前的事件監聽器（如果存在）
    doorContainer.removeEventListener('click', handleDoorClick);
    
    // 添加點擊事件監聽器
    doorContainer.addEventListener('click', handleDoorClick);
    
    // 添加 hover 效果提示用戶可以點擊
    doorContainer.style.cursor = 'pointer';
    doorContainer.title = '點擊開啟成就大廳';
    
    console.log('Door click listener setup complete');
}

// 處理門的點擊事件
function handleDoorClick() {
    console.log('Door clicked - starting animation');
    
    // 移除點擊監聽器，防止動畫進行中被重複觸發
    doorContainer.removeEventListener('click', handleDoorClick);
    doorContainer.style.cursor = 'default';
    doorContainer.title = '';
    
    // 觸發開門動畫
    triggerEntranceAnimation();
}

// 啟動入場動畫（獨立函數，每次切換到成就頁面都會調用）
function triggerEntranceAnimation() {
    if (!achievementsHall) return;
    
    // 啟動入場動畫
    setTimeout(() => {
        startEntranceAnimation();
    }, 200);
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

            // 書櫃顯示後，立即更新座標
            setTimeout(() => {
                updateImageMapCoordinates();
                console.log('[Achievements] 書櫃顯示後更新座標');
            }, 100);
        }
        
        // 啟動全新的震撼金光特效
        const goldenBurstEffect = document.querySelector('.golden-burst-effect');
        if (goldenBurstEffect) {
            goldenBurstEffect.classList.add('active');
        }
        
    }, 1000);
    
    // 4秒後金光特效開始淡去，書櫃完全顯示，門容器隱藏
    setTimeout(() => {
        const goldenBurstEffect = document.querySelector('.golden-burst-effect');
        if (goldenBurstEffect) {
            goldenBurstEffect.classList.remove('active');
        }

        if (achievementsHall) {
            achievementsHall.classList.remove('bookshelf-early-show');
            achievementsHall.classList.add('bookshelf-visible');
        }

        // 隱藏門容器，讓書櫃可以互動
        if (doorContainer) {
            doorContainer.style.display = 'none';
            doorContainer.style.pointerEvents = 'none';
            doorContainer.style.visibility = 'hidden';
        }

        console.log('[Achievements] 門已隱藏，書櫃現在可以互動');
    }, 4000);
}

// 確保圖片和熱點完全就緒
function ensureImageAndHotspots() {
    const bookshelfImage = document.querySelector('.bookshelf-bg');

    if (!bookshelfImage) {
        console.warn('[Achievements] 書櫃圖片未找到，300ms 後重試');
        setTimeout(ensureImageAndHotspots, 300);
        return;
    }

    const initHotspots = () => {
        // 確保座標已更新
        updateImageMapCoordinates();

        // 延遲綁定，確保 DOM 穩定
        setTimeout(() => {
            setupHotspotListeners();
            console.log('[Achievements] 初始化完成');
        }, 150);
    };

    if (bookshelfImage.complete && bookshelfImage.naturalWidth > 0) {
        console.log('[Achievements] 圖片已載入');
        initHotspots();
    } else {
        console.log('[Achievements] 等待圖片載入');
        bookshelfImage.addEventListener('load', initHotspots, { once: true });
        // 超時保護
        setTimeout(initHotspots, 2000);
    }
}

// 設置熱點監聽器 - 加強穩定性
function setupHotspotListeners() {
    const hotspots = document.querySelectorAll('.achievement-hotspot');

    if (!hotspots || hotspots.length === 0) {
        console.warn('[Achievements] 熱點未找到，500ms 後重試');
        setTimeout(setupHotspotListeners, 500);
        return;
    }

    console.log(`[Achievements] 綁定 ${hotspots.length} 個熱點事件`);

    // 為整個書櫃圖片添加 mousemove 監聽器，用於更新 tooltip 位置
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (bookshelfImage) {
        bookshelfImage.addEventListener('mousemove', (e) => {
            if (achievementTooltip && achievementTooltip.style.display !== 'none') {
                updateTooltipPosition(e);
            }
        });
    }

    hotspots.forEach((hotspot) => {
        // 滑鼠懸停事件
        hotspot.addEventListener('mouseenter', (e) => {
            showAchievementTooltip(e.target, e);
            showHoverEffect(e.target);
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
    
    // 創建主要光暈效果（只保留白光脈動，移除波浪邊框）
    const hoverEffect = document.createElement('div');
    hoverEffect.className = 'achievement-hover-effect';
    hoverEffect.style.left = `${left - 4}px`;
    hoverEffect.style.top = `${top - 4}px`;
    hoverEffect.style.width = `${width + 8}px`;
    hoverEffect.style.height = `${height + 8}px`;
    
    bookshelf.appendChild(hoverEffect);
}

// 隱藏hover效果
function hideHoverEffect() {
    const effects = document.querySelectorAll('.achievement-hover-effect');
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

// 渲染 icon - 支援圖片和 emoji
function renderIcon(icon) {
    // 如果是圖片路徑（包含 .png, .jpg, .jpeg, .gif, .svg）
    if (typeof icon === 'string' && /\.(png|jpg|jpeg|gif|svg)$/i.test(icon)) {
        return `<img src="${icon}" alt="成就圖示">`;
    }
    // 否則作為 emoji 或文字顯示
    return icon;
}

// 更新提示框內容 - 使用安全的 DOM 操作
function updateTooltipContent(achievement) {
    if (!achievementTooltip) return;

    achievementTooltip.innerHTML = '';

    // 創建 header
    const header = document.createElement('div');
    header.className = 'tooltip-header';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tooltip-icon';
    iconSpan.innerHTML = renderIcon(achievement.icon); // renderIcon 應該是安全的

    const titleDiv = document.createElement('div');
    const titleElement = document.createElement('div');
    titleElement.className = 'tooltip-title';
    titleElement.textContent = achievement.title; // 使用 textContent 防止 XSS

    titleDiv.appendChild(titleElement);
    header.appendChild(iconSpan);
    header.appendChild(titleDiv);

    // 創建 description
    const description = document.createElement('div');
    description.className = 'tooltip-description';
    description.textContent = achievement.description; // 使用 textContent 防止 XSS

    // 創建 date
    const dateDiv = document.createElement('div');
    dateDiv.className = 'tooltip-date';
    dateDiv.textContent = `完成於: ${achievement.date}`;

    // 組裝 tooltip
    achievementTooltip.appendChild(header);
    achievementTooltip.appendChild(description);
    achievementTooltip.appendChild(dateDiv);
}

// 更新提示框位置 - 智能容器內定位
function updateTooltipPosition(event) {
    if (!achievementTooltip) return;
    
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    // 獲取achievement-bookshelf容器的邊界
    const bookshelfContainer = document.querySelector('.achievement-bookshelf');
    if (!bookshelfContainer) return;
    
    const containerRect = bookshelfContainer.getBoundingClientRect();
    const tooltipWidth = 350; // tooltip最大寬度
    const tooltipHeight = 200; // tooltip估計高度
    const margin = 10; // 與容器邊界的最小距離
    
    // 預設偏移量
    let offsetX = 15;
    let offsetY = -15;
    
    // 計算初始位置
    let left = mouseX + offsetX;
    let top = mouseY + offsetY;
    
    // 檢查右邊界，如果會超出容器則改為左邊顯示
    if (left + tooltipWidth > containerRect.right - margin) {
        left = mouseX - tooltipWidth - offsetX; // 改到滑鼠左邊
        achievementTooltip.classList.add('tooltip-left');
        achievementTooltip.classList.remove('tooltip-right');
    } else {
        achievementTooltip.classList.add('tooltip-right');
        achievementTooltip.classList.remove('tooltip-left');
    }
    
    // 檢查左邊界
    if (left < containerRect.left + margin) {
        left = containerRect.left + margin;
    }
    
    // 檢查上下邊界
    if (top < containerRect.top + margin) {
        top = mouseY + 20; // 改到滑鼠下方
        achievementTooltip.classList.add('tooltip-bottom');
        achievementTooltip.classList.remove('tooltip-top');
    } else if (top + tooltipHeight > containerRect.bottom - margin) {
        top = containerRect.bottom - tooltipHeight - margin;
        achievementTooltip.classList.add('tooltip-top');
        achievementTooltip.classList.remove('tooltip-bottom');
    } else {
        achievementTooltip.classList.add('tooltip-top');
        achievementTooltip.classList.remove('tooltip-bottom');
    }
    
    // 設置最終位置
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
    
    modal.innerHTML = `
        <div class="achievement-modal-content">
            <button class="achievement-modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
            <div class="achievement-modal-header">
                <span class="achievement-modal-icon">${renderIcon(achievement.icon)}</span>
                <div class="achievement-modal-info">
                    <h2 class="achievement-modal-title">${achievement.title}</h2>
                </div>
            </div>
            <div class="achievement-modal-description">
                ${achievement.description}
            </div>
            <div class="achievement-modal-date">
                完成於: ${achievement.date}
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
            /* 支援圖片顯示 - 大幅增加尺寸讓圖片更突出 */
            width: 160px;
            height: 160px;
            display: flex;
            align-items: center;
            justify-content: center;
            
            /* 如果是文字 emoji，保留原有樣式 */
            font-size: 4rem;
            text-shadow: 0 0 20px currentColor;
            
            /* 如果是圖片，調整樣式 */
        }
        
        .achievement-modal-icon img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 0 25px rgba(255, 215, 0, 1));
            border-radius: 16px;
            border: 6px solid #FFD700;
            box-shadow: 
                0 0 0 3px #FFA500,
                0 0 0 6px rgba(255, 69, 0, 0.8),
                0 0 0 9px rgba(255, 140, 0, 0.4),
                0 0 40px rgba(255, 215, 0, 0.9),
                inset 0 0 20px rgba(255, 255, 255, 0.3);
            
            /* 像素風格渲染 */
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
            
            /* 增加強烈的發光動畫 */
            animation: modalIconGlow 2.5s ease-in-out infinite alternate;
        }
        
        .achievement-modal-title {
            font-size: 1.8rem;
            color: #FFD700;
            margin: 0;
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        
        .achievement-modal-description {
            color: #E8E8E8;
            line-height: 1.6;
            margin-bottom: 20px;
            font-size: 1.1rem;
        }
        
        .achievement-modal-date {
            color: #7F8C8D;
            font-style: italic;
            text-align: right;
        }
        
        @keyframes modalIconGlow {
            0% {
                box-shadow: 
                    0 0 0 3px #FFA500,
                    0 0 0 6px rgba(255, 69, 0, 0.8),
                    0 0 0 9px rgba(255, 140, 0, 0.4),
                    0 0 40px rgba(255, 215, 0, 0.9),
                    inset 0 0 20px rgba(255, 255, 255, 0.3);
                transform: scale(1);
            }
            100% {
                box-shadow: 
                    0 0 0 3px #FFA500,
                    0 0 0 6px rgba(255, 69, 0, 1),
                    0 0 0 9px rgba(255, 140, 0, 0.7),
                    0 0 60px rgba(255, 215, 0, 1),
                    inset 0 0 30px rgba(255, 255, 255, 0.5);
                transform: scale(1.02);
            }
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
    const goldenBurstEffect = document.querySelector('.golden-burst-effect');
    if (goldenBurstEffect) {
        goldenBurstEffect.classList.remove('active');
    }
    
    hideAchievementTooltip();
}

// 檢查頁面是否為成就頁面
function isAchievementsPage() {
    return window.location.hash === '#achievements';
}

// 追踪是否已初始化，防止重複初始化
let isInitialized = false;

// 監聽 i18n 初始化完成事件
function initWhenI18nReady() {
    initAchievementsHall();
    setupDoorClickListener();
    isInitialized = true;
    console.log('成就大廳已初始化（i18n 系統已就緒）');
}

// 監聽 i18n 事件
window.addEventListener('i18nInitialized', initWhenI18nReady);
window.addEventListener('languageChanged', () => {
    loadAchievementData();
    console.log('語言切換：成就資料已重新載入');
});

// 頁面載入完成後初始化（支援懶載入）
function initAchievementsModule() {
    // 監聽 hash 變化
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#achievements') {
            if (!isInitialized) {
                // 如果 i18n 已經載入，直接初始化
                if (window.i18n && window.i18n.currentTranslations) {
                    initWhenI18nReady();
                }
                // 否則等待 i18nInitialized 事件
            } else {
                // 已初始化：重置門的狀態，等待點擊
                setTimeout(() => {
                    resetAnimationState();
                }, 100);
            }
        } else {
            resetAchievementsHall();
        }
    });

    // 如果頁面載入時已經在成就頁面，且 i18n 已載入，則初始化
    if (isAchievementsPage() && !isInitialized && window.i18n && window.i18n.currentTranslations) {
        initWhenI18nReady();
    }
}

// 支援懶載入：檢查 DOM 是否已就緒
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAchievementsModule);
} else {
    // DOM 已就緒（懶載入情況），立即執行
    initAchievementsModule();
}

// 設置圖片縮放比例計算
function setupImageScaling() {
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (!bookshelfImage) return;
    
    // 等待圖片載入完成後進行初始座標更新
    if (bookshelfImage.complete && bookshelfImage.naturalWidth > 0) {
        updateImageMapCoordinates();
    } else {
        bookshelfImage.addEventListener('load', updateImageMapCoordinates);
    }
    
    // 監聽視窗大小變化，使用防抖避免過度調用
    const debouncedUpdate = debounce(updateImageMapCoordinates, 200);
    window.addEventListener('resize', debouncedUpdate);
}

// 更新 Image Map 座標以匹配縮放後的圖片
function updateImageMapCoordinates() {
    const bookshelfImage = document.querySelector('.bookshelf-bg');
    if (!bookshelfImage || !bookshelfImage.naturalWidth) return;
    
    const currentWidth = bookshelfImage.offsetWidth;
    const currentHeight = bookshelfImage.offsetHeight;
    
    // 計算縮放比例
    const scaleX = currentWidth / ORIGINAL_IMAGE_WIDTH;
    const scaleY = currentHeight / ORIGINAL_IMAGE_HEIGHT;
    
    // 獲取所有 Image Map areas
    const areas = document.querySelectorAll('area.achievement-hotspot');
    if (areas.length === 0) return;
    
    areas.forEach(area => {
        // 第一次運行時保存原始座標
        if (!area.dataset.originalCoords) {
            area.dataset.originalCoords = area.coords;
        }
        
        // 使用保存的原始座標進行縮放
        const originalCoords = area.dataset.originalCoords.split(',').map(Number);
        const scaledCoords = originalCoords.map((coord, index) => {
            // 偶數索引是 X 座標，奇數索引是 Y 座標
            const scale = index % 2 === 0 ? scaleX : scaleY;
            return Math.round(coord * scale);
        });
        
        area.coords = scaledCoords.join(',');
    });
    
    console.log(`座標已更新 - 縮放比例: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);
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
    // @ts-ignore - 忽略 TypeScript 類型檢查警告
    window.AchievementsHall = {
        init: initAchievementsHall,
        reset: resetAchievementsHall,
        showTooltip: showAchievementTooltip,
        hideTooltip: hideAchievementTooltip,
        updateCoordinates: updateImageMapCoordinates
    };
}