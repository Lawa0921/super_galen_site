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
        
        // 觸發召喚動畫（播放影片）
        startSummonVideo(companion, rarity);
        
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

    // 開始召喚影片動畫
    function startSummonVideo(companion, rarity) {
        const video = document.getElementById('summonVideo');
        const portalImage = document.getElementById('portalImage');
        const interactiveArea = document.querySelector('.portal-interactive-area');
        const container = document.querySelector('.summon-portal-container');
        const aura = document.getElementById('summonAura');
        
        if (!video || !portalImage) {
            console.error('無法找到影片或圖片元素');
            // 備用方案：直接顯示結果
            showSummonResult(companion, rarity);
            return;
        }
        
        // 隱藏召喚門背景圖片和互動區域
        portalImage.style.opacity = '0';
        if (interactiveArea) {
            interactiveArea.style.display = 'none';
        }
        
        // 啟動容器脈動效果
        if (container) {
            container.classList.add('summoning');
        }
        
        // 清理並設置光暈效果
        if (aura) {
            aura.className = 'summon-aura';
            aura.classList.add(`star-${rarity}`);
        }
        
        // 顯示影片並開始播放
        video.classList.add('playing');
        video.currentTime = 0;
        
        const playPromise = video.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('召喚影片開始播放');
                })
                .catch((error) => {
                    console.error('影片播放失敗:', error);
                    // 如果影片播放失敗，直接顯示結果
                    resetVideoState(portalImage, video, interactiveArea, container, aura);
                    showSummonResult(companion, rarity);
                });
        }
        
        // 設置時間控制的特效
        setupSummonEffects(video, companion, rarity, portalImage, interactiveArea, container, aura);
        
        // 監聽影片播放完成事件（備用）
        const handleVideoEnd = () => {
            console.log('召喚影片播放完成');
            // 這裡不再直接處理，由 setupSummonEffects 統一控制
            video.removeEventListener('ended', handleVideoEnd);
        };
        
        video.addEventListener('ended', handleVideoEnd);
    }
    
    // 設置召喚特效時間表
    function setupSummonEffects(video, companion, rarity, portalImage, interactiveArea, container, aura) {
        const particleContainer = document.getElementById('particleContainer');
        
        // 第 2 秒：粒子效果出現
        setTimeout(() => {
            createParticleEffect(particleContainer, rarity);
            console.log(`第 2 秒：粒子效果出現`);
        }, 2000);
        
        // 第 3 秒：光暈初始出現（微弱狀態）
        setTimeout(() => {
            if (aura) {
                aura.classList.add('initial');
                console.log(`第 3 秒：光暈初始出現`);
            }
        }, 3000);
        
        // 第 4 秒：光暈完全顯示（平滑過渡）
        setTimeout(() => {
            if (aura) {
                // 先啟動過渡狀態
                aura.classList.add('transitioning');
                
                // 稍後切換狀態
                setTimeout(() => {
                    aura.classList.remove('initial');
                    aura.classList.add('show');
                    
                    // 過渡完成後移除過渡狀態
                    setTimeout(() => {
                        aura.classList.remove('transitioning');
                    }, 1000);
                }, 50);
                
                console.log(`第 4 秒：光暈完全顯示`);
            }
        }, 4000);
        
        // 第 5 秒：強光爆發（平滑過渡）
        setTimeout(() => {
            if (aura) {
                // 先啟動過渡狀態
                aura.classList.add('transitioning');
                
                setTimeout(() => {
                    aura.classList.remove('show');
                    aura.classList.add('burst');
                    
                    // 爆發效果不需要繼續過渡
                    aura.classList.remove('transitioning');
                }, 50);
                
                console.log(`第 5 秒：強光爆發`);
            }
        }, 5000);
        
        // 第 5.5 秒：開始淡出過渡（平滑過渡）
        setTimeout(() => {
            if (aura) {
                aura.classList.remove('burst');
                aura.classList.add('fade-out');
                console.log(`第 5.5 秒：開始淡出過渡`);
            }
        }, 5500);
        
        // 第 6 秒：顯示結果並重置
        setTimeout(() => {
            console.log(`第 6 秒：顯示結果`);
            resetVideoState(portalImage, video, interactiveArea, container, aura, particleContainer);
            showSummonResult(companion, rarity);
        }, 6000);
    }
    
    // 創建粒子效果
    function createParticleEffect(container, rarity) {
        if (!container) return;
        
        // 清除舊粒子
        container.innerHTML = '';
        
        // 根據稀有度決定粒子數量 - 大幅增加
        const particleCount = rarity * 15 + 25; // 1星40個，5星100個
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            
            // 五星召喚用彩色粒子，其他用對應星級顏色
            if (rarity === 5) {
                // 彩色粒子：随機選擇不同顏色
                const colors = [1, 2, 3, 4, 5]; // 代表五種不同顏色
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                particle.className = `particle star-${randomColor} rainbow-particle`;
            } else {
                particle.className = `particle star-${rarity}`;
            }
            
            // 隨機位置（以中心為基礎向外發散）- 更大範圍
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 1.0;
            const radius = 20 + Math.random() * 150; // 增加擴散範圍
            const centerX = 50;
            const centerY = 50;
            
            const x = centerX + Math.cos(angle) * (radius / 100) * 40;
            const y = centerY + Math.sin(angle) * (radius / 100) * 40;
            
            particle.style.left = `${x}%`;
            particle.style.top = `${y}%`;
            
            // 隨機延遲和動畫時間
            particle.style.animationDelay = `${Math.random() * 0.8}s`;
            particle.style.animationDuration = `${2 + Math.random() * 1.5}s`; // 2-3.5秒的隨機持續時間
            
            // 五星彩色粒子的特殊動畫延遲
            if (rarity === 5) {
                particle.style.animationDelay = `${Math.random() * 1.2}s`; // 更多随機性
            }
            
            container.appendChild(particle);
            
            // 觸發動畫
            setTimeout(() => {
                particle.classList.add('show');
            }, Math.random() * 200);
        }
    }
    
    // 重置影片狀態
    function resetVideoState(portalImage, video, interactiveArea, container, aura, particleContainer) {
        // 顯示召喚門背景圖片
        portalImage.style.opacity = '1';
        
        // 顯示互動區域
        if (interactiveArea) {
            interactiveArea.style.display = 'block';
        }
        
        // 停止容器脈動
        if (container) {
            container.classList.remove('summoning');
        }
        
        // 清理光暈效果
        if (aura) {
            aura.className = 'summon-aura';
            // 確保移除所有狀態類別
            aura.classList.remove('initial', 'show', 'burst', 'fade-out', 'transitioning');
        }
        
        // 清理粒子效果
        if (particleContainer) {
            particleContainer.innerHTML = '';
        }
        
        // 隱藏影片
        video.classList.remove('playing');
        video.currentTime = 0;
        video.pause();
    }

    // 舊的 createSummonEffect 函數已被 startSummonVideo 取代
    // 保留空函數以避免錯誤
    function createSummonEffect(container, rarity) {
        // 這個函數已不再使用，由 startSummonVideo 取代
        console.log('舊的 createSummonEffect 被呼叫，但已由影片動畫取代');
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