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

    // 夥伴資料庫 - 之後會由使用者提供立繪和詳細資料
    const COMPANION_DATA = {
        1: [ // 1星夥伴
            {
                id: 'common_1',
                name: '新手工程師',
                description: '剛踏入程式世界的新夥伴，每天都在「Hello World」和「Chat gpt」之間徘徊，充滿學習熱忱但經常被分號搞瘋！',
                image: '/assets/images/companions/common_1.png',
                skills: ['基礎除錯', 'Hello World']
            },
            {
                id: 'common_2', 
                name: '實習生小助手',
                description: '勤奮的實習生，專門負責寫文件和倒咖啡。雖然程式技能還在培養，但泡咖啡的技術已經爐火純青！',
                image: '/assets/images/companions/common_2.png',
                skills: ['文件整理', '咖啡沖泡']
            },
            {
                id: 'common_3',
                name: 'Bug製造機',
                description: '天賦異稟的Bug製造專家，能在最簡單的程式碼中創造出最複雜的問題。據說他寫的"Hello World"能產生7個不同的錯誤！',
                image: '/assets/images/companions/common_1.png',
                skills: ['創意Bug', '神秘錯誤']
            },
            {
                id: 'common_4',
                name: '複製貼上大師',
                description: 'Stack Overflow的忠實用戶，擁有超凡的Ctrl+C和Ctrl+V技巧。雖然不太理解程式碼，但複製的速度無人能敵！',
                image: '/assets/images/companions/common_2.png',
                skills: ['快速複製', 'Stack Overflow搜索']
            },
            {
                id: 'common_5',
                name: '變數命名困難戶',
                description: '能為一個變數想50個不同名字的創意天才，最後還是用var1、var2。經常為了變數名字的語義化而陷入深度思考，是團隊裡最糾結的人！',
                image: '/assets/images/companions/common_1.png',
                skills: ['命名糾結', '語義焦慮']
            },
            {
                id: 'common_6',
                name: '註解恐懼症患者',
                description: '認為好的程式碼不需要註解的極簡主義者。三個月後看自己的程式碼完全不知道在寫什麼，但仍堅持"程式碼就是最好的註解"！',
                image: '/assets/images/companions/common_2.png',
                skills: ['極簡編程', '記憶挑戰']
            }
        ],
        2: [ // 2星夥伴
            {
                id: 'uncommon_1',
                name: '前端美工師',
                description: '對像素有著病態執著的完美主義者，能為了1px的偏差熬夜到天亮。瀏覽器兼容性是他最大的噩夢，但CSS動畫是他的最愛！',
                image: '/assets/images/companions/uncommon_1.png',
                skills: ['像素級調整', 'CSS魔法']
            },
            {
                id: 'uncommon_2',
                name: '後端苦力',
                description: '沉默寡言但可靠的後端工程師，每天與資料庫談戀愛。最常說的話是"前端的鍋，後端來背"，但依然默默扛下所有問題。',
                image: '/assets/images/companions/uncommon_2.png',
                skills: ['SQL調優', '背鍋專家']
            },
            {
                id: 'uncommon_3',
                name: 'Git衝突調解員',
                description: '專門處理merge衝突的和平使者，擁有神奇的能力能讓兩個不同的分支和睦相處。他的座右銘："衝突不可怕，可怕的是force push！"',
                image: '/assets/images/companions/uncommon_1.png',
                skills: ['分支管理', '衝突解決']
            },
            {
                id: 'uncommon_4',
                name: '加班戰士',
                description: '以加班為榮的勤奮開發者，辦公室最後一個離開的人。雖然效率不算最高，但絕對是最拼命的。家裡的植物都因為太久沒澆水而枯死了。',
                image: '/assets/images/companions/uncommon_2.png',
                skills: ['超時工作', '熬夜編程']
            },
            {
                id: 'uncommon_5',
                name: '會議殺手',
                description: '專門在會議中提出技術細節問題的鑽牛角尖專家，能讓30分鐘的會議延長到2小時。口頭禪："這個技術方案有個小問題..."',
                image: '/assets/images/companions/uncommon_1.png',
                skills: ['會議延時', '細節鑽研']
            },
            {
                id: 'uncommon_6',
                name: 'Google大師',
                description: '搜尋技能點滿的資訊獵手，能在5秒內找到任何技術問題的解答。被同事們稱為"活體搜尋引擎"，但經常忘記自己剛查過什麼。',
                image: '/assets/images/companions/uncommon_2.png',
                skills: ['搜索神技', '資訊過載']
            }
        ],
        3: [ // 3星夥伴
            {
                id: 'rare_1',
                name: '全端開發魔法師',
                description: '傳說中的全能戰士，前端後端資料庫樣樣精通！唯一的弱點是經常被問"你真的什麼都會嗎？"然後開始懷疑人生。',
                image: '/assets/images/companions/rare_1.png',
                skills: ['全端通殺', '技能收集癖']
            },
            {
                id: 'rare_2',
                name: '技術傳教士',
                description: '資深顧問兼布道師，專門向客戶推銷最新技術框架。口頭禪："這個框架可以解決你所有問題！"直到下個月又有新框架出現...',
                image: '/assets/images/companions/rare_2.png',
                skills: ['技術洗腦', '框架佈道']
            },
            {
                id: 'rare_3',
                name: '效能優化狂人',
                description: '對程式執行速度有著極致追求的性能怪獸，能把0.1秒的延遲優化到0.05秒。經常為了省幾毫秒而重寫整個系統，完美詮釋什麼叫過度優化！',
                image: '/assets/images/companions/rare_1.png',
                skills: ['極致優化', '毫秒計算']
            },
            {
                id: 'rare_4',
                name: '程式碼藝術家',
                description: '認為程式碼就是藝術品的完美主義者，寧可花3天寫出"優雅"的10行程式碼，也不願意寫"醜陋"的3行解決方案。代碼review時的噩夢！',
                image: '/assets/images/companions/rare_2.png',
                skills: ['代碼美學', '重構成癮']
            },
            {
                id: 'rare_5',
                name: '測試狂魔',
                description: '堅信"沒有測試的程式碼就是垃圾"的品質守護者，測試覆蓋率必須100%！經常花比寫功能多三倍的時間寫測試，但從不後悔。',
                image: '/assets/images/companions/rare_1.png',
                skills: ['測試覆蓋', '品質執著']
            },
            {
                id: 'rare_6',
                name: '文檔撰寫大師',
                description: '能把複雜技術寫成白話文的溝通天才，README寫得比小說還精彩！經常被問"你真的是工程師嗎？"因為文筆太好了。',
                image: '/assets/images/companions/rare_2.png',
                skills: ['文檔藝術', '溝通橋樑']
            }
        ],
        4: [ // 4星夥伴
            {
                id: 'epic_1',
                name: '技術考古學家',
                description: '精通17種程式語言的傳奇高手，從COBOL到最新的框架都難不倒他。辦公室裡永遠的技術權威，但偶爾還是會被CSS的垂直居中搞到崩潰！',
                image: '/assets/images/companions/epic_1.png',
                skills: ['古代語言', '框架收集', '技術化石']
            },
            {
                id: 'epic_2',
                name: 'GitHub大神',
                description: '開源界的傳奇人物，Github上的綠格子密到嚇人。每天貢獻代碼就像打卡上班一樣準時，被戲稱為"commit機器"。',
                image: '/assets/images/companions/epic_2.png', 
                skills: ['開源帝王', '代碼農場主']
            },
            {
                id: 'epic_3',
                name: '架構師魔導師',
                description: '能用一張圖解釋整個系統的架構大師，PPT技能滿點！最擅長把簡單問題複雜化，然後用更複雜的方案來解決複雜問題。',
                image: '/assets/images/companions/epic_1.png',
                skills: ['畫圖神器', 'PPT魔法', '複雜化專精']
            },
            {
                id: 'epic_4',
                name: 'Debug偵探',
                description: '能在百萬行程式碼中找到那個害人的分號的神探，擁有超凡的除錯直覺。經常在凌晨3點收到"救命"的訊息，然後5分鐘解決問題。',
                image: '/assets/images/companions/epic_2.png',
                skills: ['Bug獵人', '深夜救援', '直覺除錯']
            },
            {
                id: 'epic_5',
                name: '安全守護者',
                description: '網路安全的白帽子英雄，能在睡夢中發現SQL注入漏洞！每天都在和黑客鬥智鬥勇，口頭禪："永遠不要相信用戶輸入！"',
                image: '/assets/images/companions/epic_1.png',
                skills: ['安全防護', '漏洞嗅探', '加密魔法']
            },
            {
                id: 'epic_6',
                name: '資料庫法師',
                description: 'SQL語句寫得像詩一樣優雅的資料庫大師，能讓複雜查詢在毫秒內完成！經常被開發者們當作Oracle（神諭）來請教問題。',
                image: '/assets/images/companions/epic_2.png',
                skills: ['SQL詩人', '查詢優化', '索引魔術']
            }
        ],
        5: [ // 5星夥伴
            {
                id: 'legendary_1',
                name: '10x程式設計師',
                description: '傳說中的神級開發者，生產力是一般人的10倍！據說他能用一行程式碼解決別人100行才能解決的問題，但沒人看得懂那行程式碼在幹嘛...',
                image: '/assets/images/companions/legendary_1.png',
                skills: ['神級編程', '一行奇蹟', '代碼壓縮術', '時間扭曲']
            },
            {
                id: 'legendary_2',
                name: 'AI訓練師',
                description: '能讓ChatGPT寫出完美程式碼的提示工程大師！精通各種AI模型，被戲稱為"人工智能的人工智能"。最近開始擔心自己被AI取代...',
                image: '/assets/images/companions/legendary_1.png',
                skills: ['AI駕馭', '提示魔法', '未來科技', '機器學習']
            },
            {
                id: 'legendary_3',
                name: '獨角獸CTO',
                description: '來自獨角獸公司的傳奇CTO，擁有把任何想法變成億萬估值的神奇能力！開會時只說"Make it scalable"，然後所有技術問題就神奇地解決了。',
                image: '/assets/images/companions/legendary_1.png',
                skills: ['獨角獸魔法', '估值煉金術', '天使投資人脈', '創業預言']
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