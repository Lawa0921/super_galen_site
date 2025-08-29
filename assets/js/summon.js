/* ===== 召喚系統 JavaScript 功能 ===== */

(function() {
    'use strict';

    // 召喚系統設定
    const SUMMON_CONFIG = {
        cost: 10000, // 召喚費用
        rarityRates: {
            1: 40, // 1星 40%
            2: 30, // 2星 30%  
            3: 20, // 3星 20%
            4: 9,  // 4星 9%
            5: 1   // 5星 1%
        }
    };

    // 夥伴資料庫 - 之後會由使用者提供立繪和詳細資料
    const COMPANION_DATA = {
        1: [ // 1星夥伴
            {
                id: 'common_1',
                name: '新手程式師',
                description: '剛踏入程式世界的新夥伴，充滿學習熱忱！',
                image: '/assets/images/companions/common_1.png',
                skills: ['基礎除錯', 'Hello World']
            },
            {
                id: 'common_2', 
                name: '實習生小助手',
                description: '勤奮的實習生，總是樂於幫助解決簡單問題。',
                image: '/assets/images/companions/common_2.png',
                skills: ['文件整理', '測試協助']
            }
        ],
        2: [ // 2星夥伴
            {
                id: 'uncommon_1',
                name: '前端開發者',
                description: '擅長製作美觀介面的創意夥伴。',
                image: '/assets/images/companions/uncommon_1.png',
                skills: ['UI設計', 'CSS動畫']
            },
            {
                id: 'uncommon_2',
                name: '後端工程師',
                description: '負責處理伺服器邏輯的可靠夥伴。',
                image: '/assets/images/companions/uncommon_2.png',
                skills: ['API開發', '資料庫管理']
            }
        ],
        3: [ // 3星夥伴
            {
                id: 'rare_1',
                name: '全端開發者',
                description: '前後端通吃的萬能程式戰士！',
                image: '/assets/images/companions/rare_1.png',
                skills: ['全端開發', '系統架構', 'DevOps']
            },
            {
                id: 'rare_2',
                name: '資深顧問',
                description: '經驗豐富的技術顧問，能提供寶貴建議。',
                image: '/assets/images/companions/rare_2.png',
                skills: ['技術諮詢', '架構設計', '團隊領導']
            }
        ],
        4: [ // 4星夥伴
            {
                id: 'epic_1',
                name: '技術大師',
                description: '掌握多種程式語言的傳奇高手！',
                image: '/assets/images/companions/epic_1.png',
                skills: ['多語言精通', '效能優化', '系統重構', '技術創新']
            },
            {
                id: 'epic_2',
                name: '開源貢獻者',
                description: '活躍於開源社群的知名開發者。',
                image: '/assets/images/companions/epic_2.png', 
                skills: ['開源項目', '社群經營', '程式碼審查', '技術分享']
            }
        ],
        5: [ // 5星夥伴
            {
                id: 'legendary_1',
                name: 'CTO級大神',
                description: '傳說中的技術領袖，能改變整個團隊的命運！',
                image: '/assets/images/companions/legendary_1.png',
                skills: ['戰略規劃', '技術願景', '團隊管理', '創新領導', '企業架構']
            }
        ]
    };

    // 使用者已召喚的夥伴清單
    let summonedCompanions = [];

    // 初始化召喚系統
    function initSummonSystem() {
        console.log('召喚系統初始化完成');
        loadSummonedCompanions();
        updateCompanionDisplay();
    }

    // 執行召喚
    function performSummon() {
        // 檢查金幣是否足夠
        if (!window.hasEnoughGold || !window.hasEnoughGold(SUMMON_CONFIG.cost)) {
            showSummonMessage('金幣不足！需要 ' + SUMMON_CONFIG.cost.toLocaleString() + ' 金幣', 'error');
            return;
        }

        // 扣除金幣
        if (!window.deductGold || !window.deductGold(SUMMON_CONFIG.cost)) {
            showSummonMessage('扣除金幣失敗！', 'error');
            return;
        }

        // 計算召喚結果
        const rarity = calculateSummonRarity();
        const companion = getRandomCompanion(rarity);
        
        // 觸發召喚動畫
        startSummonAnimation(companion, rarity);
        
        // 添加到已召喚清單
        addCompanionToCollection(companion);
    }

    // 計算召喚稀有度
    function calculateSummonRarity() {
        const random = Math.random() * 100;
        let cumulativeRate = 0;
        
        // 從低星到高星累加機率
        for (let rarity = 1; rarity <= 5; rarity++) {
            cumulativeRate += SUMMON_CONFIG.rarityRates[rarity];
            if (random < cumulativeRate) {
                return rarity;
            }
        }
        
        return 1; // 保險起見，預設返回1星
    }

    // 獲取隨機夥伴
    function getRandomCompanion(rarity) {
        const companions = COMPANION_DATA[rarity];
        if (!companions || companions.length === 0) {
            // 如果該稀有度沒有夥伴，返回1星
            return COMPANION_DATA[1][0];
        }
        
        const randomIndex = Math.floor(Math.random() * companions.length);
        return { ...companions[randomIndex], rarity };
    }

    // 開始召喚動畫
    function startSummonAnimation(companion, rarity) {
        const summonArea = document.querySelector('.summon-animation-area');
        if (!summonArea) return;

        // 清除之前的動畫
        summonArea.innerHTML = '';
        summonArea.classList.remove('animate');

        // 根據稀有度設置不同的動畫效果
        const animationClass = `summon-effect-${rarity}star`;
        summonArea.classList.add('animate', animationClass);

        // 創建召喚特效
        createSummonEffect(summonArea, rarity);

        // 延遲顯示結果
        setTimeout(() => {
            showSummonResult(companion, rarity);
        }, 2000 + (rarity * 500)); // 高星數動畫時間更長
    }

    // 創建召喚特效
    function createSummonEffect(container, rarity) {
        // 基礎光芒效果
        const lightEffect = document.createElement('div');
        lightEffect.className = `summon-light-effect rarity-${rarity}`;
        container.appendChild(lightEffect);

        // 粒子效果
        for (let i = 0; i < rarity * 10; i++) {
            const particle = document.createElement('div');
            particle.className = `summon-particle rarity-${rarity}`;
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 2 + 's';
            container.appendChild(particle);
        }

        // 特殊效果（高星數專用）
        if (rarity >= 4) {
            const specialEffect = document.createElement('div');
            specialEffect.className = `summon-special-effect rarity-${rarity}`;
            container.appendChild(specialEffect);
        }

        if (rarity === 5) {
            // 5星專屬震撼效果
            const legendaryEffect = document.createElement('div'); 
            legendaryEffect.className = 'summon-legendary-effect';
            container.appendChild(legendaryEffect);
        }
    }

    // 顯示召喚結果
    function showSummonResult(companion, rarity) {
        const resultModal = document.querySelector('.summon-result-modal');
        if (!resultModal) return;

        // 更新結果顯示
        const companionImage = resultModal.querySelector('.companion-image img');
        const companionName = resultModal.querySelector('.companion-name');
        const companionDescription = resultModal.querySelector('.companion-description');
        const companionSkills = resultModal.querySelector('.companion-skills');
        const rarityStars = resultModal.querySelector('.rarity-stars');

        if (companionImage) companionImage.src = companion.image;
        if (companionName) companionName.textContent = companion.name;
        if (companionDescription) companionDescription.textContent = companion.description;
        
        // 顯示技能
        if (companionSkills) {
            companionSkills.innerHTML = companion.skills.map(skill => 
                `<span class="skill-tag">${skill}</span>`
            ).join('');
        }

        // 顯示星數
        if (rarityStars) {
            const fullStars = '<img src="/assets/images/star.png" alt="★" class="star-icon">'.repeat(rarity);
            const emptyStars = '<img src="/assets/images/star.png" alt="☆" class="star-icon empty">'.repeat(5 - rarity);
            rarityStars.innerHTML = fullStars + emptyStars;
            rarityStars.className = `rarity-stars rarity-${rarity}`;
        }

        // 設置背景效果
        resultModal.className = `summon-result-modal rarity-${rarity} show`;
    }

    // 添加夥伴到收藏
    function addCompanionToCollection(companion) {
        // 檢查是否已經擁有
        const existingCompanion = summonedCompanions.find(c => c.id === companion.id);
        if (existingCompanion) {
            existingCompanion.count = (existingCompanion.count || 1) + 1;
        } else {
            companion.count = 1;
            summonedCompanions.push(companion);
        }
        
        saveSummonedCompanions();
        updateCompanionDisplay();
    }

    // 更新夥伴展示
    function updateCompanionDisplay() {
        const companionGrid = document.querySelector('.companion-grid');
        if (!companionGrid) return;

        companionGrid.innerHTML = '';

        if (summonedCompanions.length === 0) {
            companionGrid.innerHTML = '<div class="no-companions">還沒有召喚任何夥伴，快去召喚吧！</div>';
            return;
        }

        summonedCompanions.forEach(companion => {
            // const companionCard = createCompanionCard(companion);
            // companionGrid.appendChild(companionCard);
        });
    }

    // 創建夥伴卡片
    function createCompanionCard(companion) {
        const card = document.createElement('div');
        card.className = `companion-card rarity-${companion.rarity}`;
        
        card.innerHTML = `
            <div class="companion-portrait">
                <img src="${companion.image}" alt="${companion.name}" onerror="this.src='/assets/images/placeholder-companion.png'">
                <div class="rarity-border rarity-${companion.rarity}"></div>
            </div>
            <div class="companion-info">
                <div class="companion-name">${companion.name}</div>
                <div class="rarity-stars rarity-${companion.rarity}">
                    ${'<img src="/assets/images/star.png" alt="★" class="star-icon">'.repeat(companion.rarity)}${'<img src="/assets/images/star.png" alt="☆" class="star-icon empty">'.repeat(5 - companion.rarity)}
                </div>
                ${companion.count > 1 ? `<div class="companion-count">x${companion.count}</div>` : ''}
            </div>
        `;

        // 點擊顯示詳細資訊
        card.addEventListener('click', () => showCompanionDetail(companion));
        
        return card;
    }

    // 顯示夥伴詳細資訊
    function showCompanionDetail(companion) {
        // 這裡可以創建詳細資訊模態框
        console.log('顯示夥伴詳細資訊:', companion);
    }

    // 顯示召喚訊息
    function showSummonMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `summon-message ${type}`;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    // 儲存已召喚夥伴清單
    function saveSummonedCompanions() {
        localStorage.setItem('summonedCompanions', JSON.stringify(summonedCompanions));
    }

    // 載入已召喚夥伴清單
    function loadSummonedCompanions() {
        const saved = localStorage.getItem('summonedCompanions');
        if (saved) {
            try {
                summonedCompanions = JSON.parse(saved);
            } catch (e) {
                console.error('載入召喚夥伴清單失敗:', e);
                summonedCompanions = [];
            }
        }
    }

    // 關閉召喚結果模態框
    function closeSummonResult() {
        const resultModal = document.querySelector('.summon-result-modal');
        if (resultModal) {
            resultModal.classList.remove('show');
        }
    }

    // 顯示召喚工具提示
    function showSummonTooltip(event) {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip) return;
        
        tooltip.classList.add('show');
        updateSummonTooltipPosition(event);
    }
    
    // 更新召喚工具提示位置
    function updateSummonTooltipPosition(event) {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip || !tooltip.classList.contains('show')) return;
        
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        const tooltipWidth = 200; // tooltip估計寬度
        const tooltipHeight = 80; // tooltip估計高度
        const margin = 15; // 與邊界的距離
        
        // 預設偏移量
        let offsetX = 15;
        let offsetY = -15;
        
        // 計算初始位置
        let left = mouseX + offsetX;
        let top = mouseY + offsetY;
        
        // 檢查右邊界，如果會超出則改為左邊顯示
        if (left + tooltipWidth > window.innerWidth - margin) {
            left = mouseX - tooltipWidth - offsetX;
        }
        
        // 檢查左邊界
        if (left < margin) {
            left = margin;
        }
        
        // 檢查上下邊界
        if (top < margin) {
            top = mouseY + 20; // 改到滑鼠下方
        } else if (top + tooltipHeight > window.innerHeight - margin) {
            top = mouseY - tooltipHeight - 15; // 改到滑鼠上方
        }
        
        // 設置最終位置
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
    
    // 隱藏召喚工具提示
    function hideSummonTooltip() {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip) return;
        
        tooltip.classList.remove('show');
    }

    // 暴露函數到全域作用域
    window.initSummonSystem = initSummonSystem;
    window.performSummon = performSummon;
    window.closeSummonResult = closeSummonResult;
    window.showSummonTooltip = showSummonTooltip;
    window.updateSummonTooltipPosition = updateSummonTooltipPosition;
    window.hideSummonTooltip = hideSummonTooltip;

})();