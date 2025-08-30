/* ===== 召喚系統 JavaScript 功能 ===== */

(function() {
    'use strict';

    // 召喚系統設定
    const SUMMON_CONFIG = {
        cost: 10000, // 召喚費用
        rarityRates: {
            1: 35, // 1星 35%
            2: 25, // 2星 25%  
            3: 20, // 3星 20%
            4: 15,  // 4星 15%
            5: 5   // 5星 5%
        }
    };

    // 夥伴資料庫 - 根據個人經驗填寫
    const COMPANION_DATA = {
        1: [ // 1星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_newbie',
                name: '武術新手',
                description: '剛開始接觸武術的初學者，動作還不標準但充滿熱忱。總是問「這個動作要怎麼做？」的好奇寶寶。',
                image: '/assets/images/companions/martial_newbie.png',
                skills: ['基本動作', '學習熱忱']
            },
            {
                id: 'japanese_student',
                name: '日文學習者',
                description: '努力背五十音的日文初學者，每天都在「あいうえお」和「さしすせそ」之間掙扎。最愛說「頑張って！」',
                image: '/assets/images/companions/japanese_student.png',
                skills: ['五十音', '基礎會話']
            },
            {
                id: 'ocean_beginner',
                name: '海洋運動新手',
                description: '第一次下海就被浪打翻的勇敢新手，雖然技術還很菜但對大海充滿敬畏和嚮往。',
                image: '/assets/images/companions/ocean_beginner.png',
                skills: ['基礎游泳', '海洋適應']
            },
            {
                id: 'camping_rookie',
                name: '露營菜鳥',
                description: '帶了一堆裝備但不知道怎麼用的露營新手，搭帳篷要花三小時但依然樂在其中。',
                image: '/assets/images/companions/camping_rookie.png',
                skills: ['裝備研究', '野外求生']
            },
            {
                id: 'boardgame_newbie',
                name: '桌遊新手',
                description: '剛接觸桌遊的玩家，看規則書看得頭暈但玩起來超認真。最常說「我還是不太懂...」',
                image: '/assets/images/companions/boardgame_newbie.png',
                skills: ['規則學習', '遊戲熱忱']
            },
            {
                id: 'newbie_engineer',
                name: '新手工程師',
                description: '剛踏入程式世界的新夥伴，每天都在「Hello World」和「ChatGPT」之間徘徊，充滿學習熱忱但經常被分號搞瘋！',
                image: '/assets/images/companions/newbie_engineer.png',
                skills: ['基礎除錯', 'Hello World']
            }
        ],
        2: [ // 2星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_practitioner',
                name: '武術練習者',
                description: '已經掌握基本功的武術愛好者，開始學習套路和對練。偶爾會在訓練中展現不錯的身手，但還需要更多磨練。',
                image: '/assets/images/companions/martial_practitioner.png',
                skills: ['基本套路', '對練技巧']
            },
            {
                id: 'japanese_enthusiast',
                name: '日文愛好者',
                description: '已經能進行簡單日常對話的學習者，最愛看日劇和動漫練聽力。經常說「そうですね」和「頑張りましょう」！',
                image: '/assets/images/companions/japanese_enthusiast.png',
                skills: ['日常對話', '文化理解']
            },
            {
                id: 'ocean_sports_fan',
                name: '海洋運動愛好者',
                description: '已經能在海中自在游泳的運動者，開始嘗試衝浪、潛水等進階項目。對海洋有著深深的熱愛和尊重。',
                image: '/assets/images/companions/ocean_sports_fan.png',
                skills: ['游泳技巧', '水中平衡']
            },
            {
                id: 'camping_enthusiast',
                name: '露營愛好者',
                description: '已經掌握基本露營技能的戶外愛好者，能快速搭建營地。開始挑戰更偏僻的露營地點，享受與自然的親密接觸。',
                image: '/assets/images/companions/camping_enthusiast.png',
                skills: ['快速搭營', '野外料理']
            },
            {
                id: 'boardgame_player',
                name: '桌遊玩家',
                description: '已經熟悉多種桌遊的玩家，開始深入研究策略和技巧。桌遊聚會的常客，總是帶著新遊戲來和大家分享。',
                image: '/assets/images/companions/boardgame_player.png',
                skills: ['遊戲策略', '規則解說']
            },
            {
                id: 'frontend_artist',
                name: '前端美工師',
                description: '對像素有著病態執著的完美主義者，能為了1px的偏差熬夜到天亮。瀏覽器兼容性是他最大的噩夢，但CSS動畫是他的最愛！',
                image: '/assets/images/companions/frontend_artist.png',
                skills: ['像素級調整', 'CSS魔法']
            }
        ],
        3: [ // 3星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_junior',
                name: '努力練功的學弟',
                description: '總是練不好但還是努力來參加練功的學校學弟，比賽時都被秒殺但他從來都不在乎，心理素質強健到讓人佩服！永遠保持著初心和熱忱。',
                image: '/assets/images/companions/martial_junior.png',
                skills: ['不屈精神', '心理素質', '持續努力']
            }
        ],
        4: [ // 4星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'cute_martial_sister',
                name: '一起練功的可愛妹妹',
                description: '練功偶爾會出現的稀有人物，每次出現大家都會更努力練功。你說她打得不好？有人在乎嗎？她的存在本身就是最強的 buff！',
                image: '/assets/images/companions/cute_martial_sister.png',
                skills: ['激勵光環', '可愛魅力', '稀有出現']
            },
            {
                id: 'tsundere_coach_daughter',
                name: '武術教練的女兒',
                description: '為人傲嬌，傲佔比大概是9.5:0.5，平時看似高冷但偶爾會露出關心的一面。一出手就打得你不要不要，是少見的女練家子，實力不容小覷！',
                image: '/assets/images/companions/tsundere_coach_daughter.png',
                skills: ['傲嬌魅力', '驚人實力', '女武者氣質']
            }
        ],
        5: [ // 5星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'kids_martial_coach',
                name: '小孩武術團的武術教練',
                description: '除了擅長強身健體之外，還擅長關心同學的身心靈健康，就像大家的第二個媽媽一樣。溫暖的笑容和耐心的指導，讓每個小朋友都能在武術中找到自信。',
                image: '/assets/images/companions/kids_martial_coach.png',
                skills: ['身心靈指導', '母性關愛', '兒童教學', '健體專精']
            },
            {
                id: 'grand_martial_master',
                name: '武術團總教練',
                description: '平常不苟言笑，走路手都背在後面，你以為他很廢，殊不知一出手就被打趴。深藏不露的武術宗師，用沉默和實力詮釋什麼叫真正的高手風範。',
                image: '/assets/images/companions/grand_martial_master.png',
                skills: ['深藏不露', '宗師實力', '無言威嚴', '一擊制勝']
            },
            {
                id: 'youth_martial_coach',
                name: '青年武術團武術教練',
                description: '一群死屁孩的孩子王，任何練習都與學員一起操作，屁孩們都服他！除了武術指導外還要自己記帳，是個文武雙全的全能型教練。',
                image: '/assets/images/companions/youth_martial_coach.png',
                skills: ['孩子王魅力', '全能教學', '帳務管理', '青年領導']
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

    // createSummonEffect 函數已被 startSummonVideo 取代並移除

    // 顯示召喚結果
    function showSummonResult(companion, rarity) {
        console.log('開始顯示召喚結果:', companion, rarity);
        
        const resultModal = document.querySelector('.summon-result-modal');
        if (!resultModal) {
            console.error('找不到召喚結果模態框');
            return;
        }
        
        // 更新標題為夥伴名稱
        const modalTitle = resultModal.querySelector('.modal-header h3');
        if (modalTitle) {
            modalTitle.textContent = companion.name;
        }

        // 更新結果顯示
        const companionImage = resultModal.querySelector('.companion-image img');
        const companionName = resultModal.querySelector('.companion-name');
        const companionDescription = resultModal.querySelector('.companion-description');
        const companionSkills = resultModal.querySelector('.companion-skills');
        const rarityStars = resultModal.querySelector('.rarity-stars');

        // 設置圖片，如果失敗則使用預設圖片
        if (companionImage) {
            companionImage.src = companion.image;
            companionImage.onerror = function() {
                this.src = '/assets/images/companions/placeholder.png';
                console.log('待實現圖片不存在，使用預設圖片');
            };
            console.log('設置待實現圖片:', companion.image);
        } else {
            console.error('找不到待實現圖片元素');
        }
        
        if (companionName) {
            companionName.textContent = companion.name;
            console.log('設置待實現名稱:', companion.name);
        } else {
            console.error('找不到待實現名稱元素');
        }
        
        if (companionDescription) {
            companionDescription.textContent = companion.description;
            console.log('設置待實現描述:', companion.description);
        } else {
            console.error('找不到待實現描述元素');
        }
        
        // 顯示技能
        if (companionSkills) {
            companionSkills.innerHTML = companion.skills.map(skill => 
                `<span class="skill-tag">${skill}</span>`
            ).join('');
            console.log('設置技能:', companion.skills);
        } else {
            console.error('找不到技能元素');
        }

        // 顯示星數（只顯示實際星數，不顯示灰色星星）
        if (rarityStars) {
            const fullStars = '<img src="/assets/images/star.png" alt="★" class="star-icon">'.repeat(rarity);
            rarityStars.innerHTML = fullStars;
            rarityStars.className = `rarity-stars rarity-${rarity}`;
            console.log(`設置 ${rarity} 星星數`);
        } else {
            console.error('找不到星數元素');
        }

        // 設置背景效果並顯示模態框
        resultModal.className = `summon-result-modal rarity-${rarity} show`;
        console.log('模態框已設置為顯示狀態');
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
            const companionCard = createCompanionCard(companion);
            companionGrid.appendChild(companionCard);
        });
    }

    // 創建夥伴卡片
    function createCompanionCard(companion) {
        const card = document.createElement('div');
        card.className = `companion-card rarity-${companion.rarity}`;
        
        card.innerHTML = `
            <div class="companion-avatar">
                <img src="${companion.image}" alt="${companion.name}" onerror="this.src='/assets/images/placeholder-companion.png'">
                <div class="rarity-border rarity-${companion.rarity}"></div>
                <div class="star-badge rarity-${companion.rarity}">
                    ${'<img src="/assets/images/star.png" alt="★" class="star-icon">'.repeat(companion.rarity)}
                </div>
                ${companion.count > 1 ? `<div class="companion-count">×${companion.count}</div>` : ''}
            </div>
            <div class="companion-tooltip">
                <div class="tooltip-name">${companion.name}</div>
                <div class="tooltip-description">${companion.description}</div>
            </div>
        `;

        // 點擊顯示詳細資訊
        card.addEventListener('click', () => showCompanionDetail(companion));
        
        return card;
    }

    // 顯示夥伴詳細資訊
    function showCompanionDetail(companion) {
        // 重用召喚結果modal來顯示夥伴詳細資訊
        showSummonResult(companion, companion.rarity);
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