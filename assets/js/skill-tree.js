// 技能樹系統 - 遊戲風格實作
class SkillTreeSystem {
    constructor() {
        this.canvas = document.getElementById('skill-tree-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.currentBranch = 'frontend';
        this.selectedSkill = null;
        this.skills = this.initializeSkills();
        
        // 畫布平移相關
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // 限制範圍
        this.minOffsetX = -500;
        this.maxOffsetX = 500;
        this.minOffsetY = -300;
        this.maxOffsetY = 300;
        
        this.init();
    }

    initializeSkills() {
        return {
            frontend: {
                name: '前端魔法師',
                level: 0, // 將由子技能計算得出
                icon: '🎨',
                skills: [
                    { id: 'html', name: 'HTML', level: 9, exp: 90, years: 5, description: '網頁結構的基石，精通語義化標籤和無障礙設計', x: 100, y: 100, unlocked: true },
                    { id: 'css3', name: 'CSS3', level: 5, exp: 50, years: 5, description: '樣式魔法大師，精通動畫、Grid 和 Flexbox', x: 200, y: 100, unlocked: true },
                    { id: 'javascript', name: 'JavaScript', level: 8, exp: 82, years: 5, description: '網頁的靈魂，賦予網站生命力', x: 300, y: 100, unlocked: true },
                    { id: 'vue', name: 'Vue.js', level: 4, exp: 40, years: 2, description: '漸進式 JavaScript 框架', x: 150, y: 200, unlocked: true },
                    { id: 'react', name: 'React', level: 5, exp: 50, years: 2, description: '流行的前端框架，組件化開發', x: 250, y: 200, unlocked: true },
                    { id: 'typescript', name: 'TypeScript', level: 4, exp: 40, years: 2, description: 'JavaScript 的超集，類型安全', x: 350, y: 200, unlocked: true },
                    { id: 'webpack', name: 'Webpack', level: 3, exp: 30, years: 2, description: '模組打包工具', x: 450, y: 200, unlocked: true },
                    { id: 'tailwind', name: 'Tailwind CSS', level: 8, exp: 78, years: 3, description: '實用優先的 CSS 框架', x: 200, y: 300, unlocked: true }
                ]
            },
            backend: {
                name: '後端工程師',
                level: 0, // 將由子技能計算得出
                icon: '⚙️',
                skills: [
                    { id: 'ruby', name: 'Ruby', level: 9, exp: 92, years: 5, description: '優雅的程式語言，程式設計師的好朋友', x: 100, y: 100, unlocked: true },
                    { id: 'rails', name: 'Ruby on Rails', level: 9, exp: 90, years: 5, description: '快速開發的網頁框架，約定優於配置', x: 200, y: 100, unlocked: true },
                    { id: 'nodejs', name: 'Node.js', level: 7, exp: 68, years: 3, description: 'JavaScript 後端執行環境', x: 300, y: 100, unlocked: true },
                    { id: 'elixir', name: 'Elixir', level: 6, exp: 55, years: 2, description: '函數式語言，高並發處理專家', x: 400, y: 100, unlocked: true },
                    { id: 'phoenix', name: 'Phoenix', level: 6, exp: 52, years: 2, description: 'Elixir 網頁框架，即時通訊強者', x: 150, y: 200, unlocked: true },
                    { id: 'postgresql', name: 'PostgreSQL', level: 8, exp: 80, years: 5, description: '強大的關聯式資料庫', x: 250, y: 200, unlocked: true },
                    { id: 'git', name: 'Git', level: 9, exp: 88, years: 5, description: '版本控制大師，協作開發必備', x: 350, y: 200, unlocked: true }
                ]
            },
            blockchain: {
                name: '區塊鏈術士',
                level: 0, // 將由子技能計算得出
                icon: '🔗',
                skills: [
                    { id: 'solidity', name: 'Solidity', level: 5, exp: 48, years: 2, description: '智能合約開發語言', x: 150, y: 150, unlocked: true },
                    { id: 'hardhat', name: 'Hardhat', level: 5, exp: 45, years: 2, description: '以太坊開發環境', x: 250, y: 150, unlocked: true },
                    { id: 'ipfs', name: 'IPFS', level: 4, exp: 35, years: 1, description: '分散式檔案系統', x: 350, y: 150, unlocked: true },
                    { id: 'ethers', name: 'ethers.js', level: 5, exp: 42, years: 2, description: '以太坊 JavaScript 庫', x: 200, y: 250, unlocked: true }
                ]
            },
            devops: {
                name: '雲端守護者',
                level: 0, // 將由子技能計算得出
                icon: '☁️',
                skills: [
                    { id: 'aws', name: 'AWS', level: 6, exp: 58, years: 3, description: '亞馬遜雲端服務，雲端基礎設施專家', x: 150, y: 150, unlocked: true },
                    { id: 'awsglue', name: 'AWS Glue', level: 5, exp: 45, years: 2, description: 'ETL 資料處理服務', x: 250, y: 150, unlocked: true },
                    { id: 'terraform', name: 'Terraform', level: 5, exp: 48, years: 2, description: '基礎設施即代碼工具', x: 350, y: 150, unlocked: true },
                    { id: 'ansible', name: 'Ansible', level: 5, exp: 42, years: 2, description: '自動化部署工具', x: 200, y: 250, unlocked: true },
                    { id: 'github', name: 'GitHub', level: 9, exp: 95, years: 5, description: '程式碼託管平台，開源協作中心', x: 300, y: 250, unlocked: true },
                    { id: 'newrelic', name: 'New Relic', level: 6, exp: 52, years: 3, description: '應用程式效能監控', x: 400, y: 250, unlocked: true }
                ]
            },
            personal: {
                name: '生活達人',
                level: 0, // 將由子技能計算得出
                icon: '🌟',
                skills: [
                    { id: 'boardgame', name: '桌遊教學', level: 10, exp: 100, years: 8, description: '精通各類桌遊規則教學，擅長帶領新手入門', x: 150, y: 150, unlocked: true },
                    { id: 'camping', name: '露營區經營', level: 8, exp: 85, years: 5, description: '露營區規劃與管理，創造美好戶外體驗', x: 250, y: 150, unlocked: true },
                    { id: 'team', name: '團隊合作', level: 9, exp: 90, years: 6, description: '優秀的團隊協作能力，促進團隊效率', x: 350, y: 150, unlocked: true },
                    { id: 'teaching', name: '教學能力', level: 9, exp: 88, years: 6, description: '將複雜概念簡單化，讓學習變得有趣', x: 200, y: 250, unlocked: true },
                    { id: 'problem', name: '問題解決', level: 9, exp: 92, years: 6, description: '快速分析問題核心，找出最佳解決方案', x: 300, y: 250, unlocked: true }
                ]
            }
        };
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        // 計算各分支的總等級
        this.calculateBranchLevels();

        // 設置畫布大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // 初始化事件監聽
        this.initEventListeners();

        // 繪製初始技能樹
        this.drawSkillTree();

        // 更新統計數據
        this.updateStats();

        // 更新技能點數顯示
        this.updateSkillPoints();
    }

    calculateBranchLevels() {
        // 計算每個分支的子技能總等級
        Object.keys(this.skills).forEach(branchKey => {
            const branch = this.skills[branchKey];
            let totalLevel = 0;
            
            branch.skills.forEach(skill => {
                if (skill.unlocked) {
                    totalLevel += skill.level;
                }
            });
            
            branch.level = totalLevel;
        });

        // 更新導航按鈕的等級顯示
        this.updateNavButtonLevels();
    }

    updateNavButtonLevels() {
        // 更新所有導航按鈕的等級顯示
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const branchKey = btn.dataset.branch;
            const branch = this.skills[branchKey];
            if (branch) {
                const levelSpan = btn.querySelector('.nav-level');
                if (levelSpan) {
                    levelSpan.textContent = `Lv.${branch.level}`;
                }
            }
        });
    }

    updateSkillPoints() {
        // 計算總技能點數和已使用點數
        let totalPoints = 0;
        let usedPoints = 0;
        
        Object.values(this.skills).forEach(branch => {
            branch.skills.forEach(skill => {
                if (skill.unlocked) {
                    usedPoints += skill.level;
                }
            });
        });
        
        // 假設總技能點數基於角色等級或其他因素
        // 這裡暫時設定為已使用點數（表示沒有剩餘點數）
        totalPoints = usedPoints;
        const remainingPoints = totalPoints - usedPoints;
        
        // 更新剩餘點數顯示
        this.displayRemainingPoints(remainingPoints);
    }

    displayRemainingPoints(points) {
        // 查找或創建剩餘點數顯示元素
        let pointsDisplay = document.getElementById('remaining-skill-points');
        if (!pointsDisplay) {
            // 創建剩餘點數顯示元素
            pointsDisplay = document.createElement('div');
            pointsDisplay.id = 'remaining-skill-points';
            pointsDisplay.className = 'skill-points-display';
            
            const skillTreeContainer = document.querySelector('.skill-tree-container');
            if (skillTreeContainer) {
                skillTreeContainer.insertBefore(pointsDisplay, skillTreeContainer.firstChild);
            }
        }
        
        pointsDisplay.innerHTML = `
            <span class="points-label">剩餘技能點數：</span>
            <span class="points-value">${points}</span>
        `;
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.drawSkillTree();
    }

    initEventListeners() {
        // 分支按鈕點擊
        document.querySelectorAll('.branch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const branch = e.currentTarget.dataset.branch;
                this.switchBranch(branch);
            });
        });

        // 畫布點擊
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left - this.offsetX;
                const y = e.clientY - rect.top - this.offsetY;
                this.handleCanvasClick(x, y);
            });

            // 滑鼠按下 - 開始拖拽
            this.canvas.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.canvas.style.cursor = 'grabbing';
            });

            // 滑鼠移動
            this.canvas.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    // 拖拽模式
                    const deltaX = e.clientX - this.lastMouseX;
                    const deltaY = e.clientY - this.lastMouseY;
                    
                    // 更新偏移量並限制範圍
                    this.offsetX = Math.max(this.minOffsetX, Math.min(this.maxOffsetX, this.offsetX + deltaX));
                    this.offsetY = Math.max(this.minOffsetY, Math.min(this.maxOffsetY, this.offsetY + deltaY));
                    
                    this.lastMouseX = e.clientX;
                    this.lastMouseY = e.clientY;
                    
                    // 重繪畫布
                    this.drawSkillTree();
                } else {
                    // 懸停效果
                    const rect = this.canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left - this.offsetX;
                    const y = e.clientY - rect.top - this.offsetY;
                    this.handleCanvasHover(x, y);
                }
            });

            // 滑鼠放開 - 結束拖拽
            this.canvas.addEventListener('mouseup', () => {
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
            });

            // 滑鼠離開畫布
            this.canvas.addEventListener('mouseleave', () => {
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
            });

            // 設置初始游標
            this.canvas.style.cursor = 'grab';
        }
    }

    switchBranch(branch) {
        this.currentBranch = branch;
        
        // 更新按鈕狀態
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.branch === branch);
        });

        // 重新計算等級（如果有變動）
        this.calculateBranchLevels();

        // 重繪技能樹
        this.drawSkillTree();
        
        // 播放切換動畫
        this.playBranchSwitchAnimation();
    }

    drawSkillTree() {
        if (!this.ctx || !this.canvas) return;

        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 保存當前狀態
        this.ctx.save();
        
        // 應用平移變換
        this.ctx.translate(this.offsetX, this.offsetY);

        // 設置樣式
        this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        this.ctx.lineWidth = 2;

        const branchData = this.skills[this.currentBranch];
        if (!branchData) return;

        // 繪製連線
        this.drawConnections(branchData.skills);

        // 繪製技能節點
        branchData.skills.forEach(skill => {
            this.drawSkillNode(skill);
        });
        
        // 恢復狀態
        this.ctx.restore();
    }

    drawConnections(skills) {
        // 簡單的連線邏輯，可以根據需要調整
        for (let i = 0; i < skills.length - 1; i++) {
            const skill1 = skills[i];
            const skill2 = skills[i + 1];
            
            this.ctx.beginPath();
            this.ctx.moveTo(skill1.x, skill1.y);
            this.ctx.lineTo(skill2.x, skill2.y);
            this.ctx.stroke();
        }
    }

    drawSkillNode(skill) {
        const radius = 30;
        const x = skill.x;
        const y = skill.y;

        // 外圈光暈
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
        gradient.addColorStop(0, `rgba(255, 215, 0, ${skill.unlocked ? 0.3 : 0.1})`);
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
        this.ctx.fill();

        // 技能圓圈
        this.ctx.fillStyle = skill.unlocked 
            ? `rgba(255, 215, 0, ${skill.exp / 100})` 
            : 'rgba(100, 100, 100, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // 邊框
        this.ctx.strokeStyle = skill.unlocked ? '#ffd700' : '#666';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // 技能名稱
        this.ctx.fillStyle = skill.unlocked ? '#fff' : '#999';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(skill.name, x, y);

        // 等級顯示
        if (skill.unlocked) {
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`Lv.${skill.level}`, x, y + radius + 15);
        }
    }

    handleCanvasClick(x, y) {
        const branchData = this.skills[this.currentBranch];
        if (!branchData) return;

        // 檢查點擊了哪個技能
        branchData.skills.forEach(skill => {
            const distance = Math.sqrt(Math.pow(x - skill.x, 2) + Math.pow(y - skill.y, 2));
            if (distance <= 30) {
                this.selectSkill(skill);
            }
        });
    }

    handleCanvasHover(x, y) {
        const branchData = this.skills[this.currentBranch];
        if (!branchData) return;

        let hovered = false;
        branchData.skills.forEach(skill => {
            const distance = Math.sqrt(Math.pow(x - skill.x, 2) + Math.pow(y - skill.y, 2));
            if (distance <= 30) {
                this.canvas.style.cursor = 'pointer';
                hovered = true;
            }
        });

        if (!hovered && !this.isDragging) {
            this.canvas.style.cursor = 'grab';
        }
    }

    selectSkill(skill) {
        this.selectedSkill = skill;
        
        // 更新詳細面板
        const skillName = document.getElementById('skill-name');
        const skillDescription = document.getElementById('skill-description');
        const skillYears = document.getElementById('skill-years');
        const skillProficiency = document.getElementById('skill-proficiency');
        
        if (skillName) skillName.textContent = skill.name;
        if (skillDescription) skillDescription.textContent = skill.description;
        if (skillYears) skillYears.textContent = `${skill.years} 年`;
        if (skillProficiency) skillProficiency.textContent = `${skill.exp}%`;
        
        // 更新經驗值條
        const progressBar = document.querySelector('.level-progress');
        const levelText = document.querySelector('.level-text');
        if (progressBar && levelText) {
            progressBar.style.width = `${skill.exp}%`;
            levelText.textContent = `${skill.exp}/100 EXP`;
        }

        // 播放選擇動畫
        this.playSkillSelectAnimation();
    }

    updateStats() {
        let totalSkills = 0;
        let masteredSkills = 0;
        let learningSkills = 0;

        Object.values(this.skills).forEach(branch => {
            branch.skills.forEach(skill => {
                if (skill.unlocked) {
                    totalSkills++;
                    if (skill.level >= 8) {
                        masteredSkills++;
                    } else if (skill.level < 6) {
                        learningSkills++;
                    }
                }
            });
        });

        const totalSkillsEl = document.getElementById('total-skills');
        const masteredSkillsEl = document.getElementById('mastered-skills');
        const learningSkillsEl = document.getElementById('learning-skills');
        
        if (totalSkillsEl) totalSkillsEl.textContent = totalSkills;
        if (masteredSkillsEl) masteredSkillsEl.textContent = masteredSkills;
        if (learningSkillsEl) learningSkillsEl.textContent = learningSkills;
    }

    playBranchSwitchAnimation() {
        // 使用 anime.js 播放切換動畫
        if (typeof anime !== 'undefined') {
            anime({
                targets: '#skill-tree-canvas',
                opacity: [0, 1],
                scale: [0.9, 1],
                duration: 500,
                easing: 'easeOutBack'
            });
        }
    }

    playSkillSelectAnimation() {
        // 使用 anime.js 播放選擇動畫
        if (typeof anime !== 'undefined') {
            anime({
                targets: '.skill-details-panel',
                scale: [0.95, 1],
                duration: 300,
                easing: 'easeOutBack'
            });

            anime({
                targets: '.level-progress',
                scaleX: [0, 1],
                duration: 800,
                easing: 'easeOutElastic(1, 0.5)'
            });
        }
    }
}

// 初始化技能樹系統
document.addEventListener('DOMContentLoaded', () => {
    window.skillTreeSystem = new SkillTreeSystem();
});