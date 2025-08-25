// 統一技能樹系統 - 參考原始網站布局
class SkillTreeSystem {
    constructor() {
        this.canvas = document.getElementById('skill-tree-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.selectedSkill = null;
        this.skills = this.initializeSkills();
        
        // 畫布平移相關
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // 限制範圍
        this.minOffsetX = -400;
        this.maxOffsetX = 100;
        this.minOffsetY = -200;
        this.maxOffsetY = 100;
        
        // 設定 Canvas 高解析度
        this.pixelRatio = window.devicePixelRatio || 1;
        
        this.init();
    }

    initializeSkills() {
        // 所有技能數據 - 樹狀結構
        const skillTree = {
            // 根節點 - 技能分類
            categories: [
                {
                    id: 'frontend',
                    name: '前端技術',
                    x: 400,
                    y: 100,
                    level: 0,
                    color: '#ffd700',
                    skills: [
                        { id: 'html', name: 'HTML', level: 9, exp: 90, x: 250, y: 250 },
                        { id: 'css3', name: 'CSS3', level: 5, exp: 50, x: 350, y: 250 },
                        { id: 'javascript', name: 'JavaScript', level: 8, exp: 82, x: 450, y: 250 },
                        { id: 'vue', name: 'Vue.js', level: 4, exp: 40, x: 200, y: 350 },
                        { id: 'react', name: 'React', level: 5, exp: 50, x: 300, y: 350 },
                        { id: 'typescript', name: 'TypeScript', level: 4, exp: 40, x: 400, y: 350 },
                        { id: 'webpack', name: 'Webpack', level: 3, exp: 30, x: 500, y: 350 },
                        { id: 'tailwind', name: 'Tailwind CSS', level: 8, exp: 78, x: 550, y: 250 }
                    ]
                },
                {
                    id: 'backend',
                    name: '後端技術',
                    x: 800,
                    y: 100,
                    level: 0,
                    color: '#10b981',
                    skills: [
                        { id: 'ruby', name: 'Ruby', level: 9, exp: 92, x: 700, y: 250 },
                        { id: 'rails', name: 'Rails', level: 9, exp: 90, x: 800, y: 250 },
                        { id: 'nodejs', name: 'Node.js', level: 7, exp: 68, x: 900, y: 250 },
                        { id: 'elixir', name: 'Elixir', level: 6, exp: 55, x: 750, y: 350 },
                        { id: 'phoenix', name: 'Phoenix', level: 6, exp: 52, x: 850, y: 350 },
                        { id: 'postgresql', name: 'PostgreSQL', level: 8, exp: 80, x: 650, y: 350 },
                        { id: 'git', name: 'Git', level: 9, exp: 88, x: 950, y: 350 }
                    ]
                },
                {
                    id: 'devops',
                    name: 'DevOps',
                    x: 600,
                    y: 100,
                    level: 0,
                    color: '#3b82f6',
                    skills: [
                        { id: 'aws', name: 'AWS', level: 6, exp: 58, x: 550, y: 450 },
                        { id: 'terraform', name: 'Terraform', level: 5, exp: 48, x: 650, y: 450 },
                        { id: 'ansible', name: 'Ansible', level: 5, exp: 42, x: 750, y: 450 },
                        { id: 'github', name: 'GitHub Actions', level: 9, exp: 95, x: 600, y: 550 },
                        { id: 'newrelic', name: 'New Relic', level: 6, exp: 52, x: 700, y: 550 },
                        { id: 'awsglue', name: 'AWS Glue', level: 5, exp: 45, x: 500, y: 550 }
                    ]
                },
                {
                    id: 'blockchain',
                    name: '區塊鏈',
                    x: 200,
                    y: 100,
                    level: 0,
                    color: '#8b5cf6',
                    skills: [
                        { id: 'solidity', name: 'Solidity', level: 5, exp: 48, x: 100, y: 250 },
                        { id: 'hardhat', name: 'Hardhat', level: 5, exp: 45, x: 150, y: 350 },
                        { id: 'ipfs', name: 'IPFS', level: 4, exp: 35, x: 50, y: 350 },
                        { id: 'ethers', name: 'ethers.js', level: 5, exp: 42, x: 100, y: 450 }
                    ]
                },
                {
                    id: 'personal',
                    name: '生活技能',
                    x: 1000,
                    y: 100,
                    level: 0,
                    color: '#ec4899',
                    skills: [
                        { id: 'boardgame', name: '桌遊教學', level: 10, exp: 100, x: 1000, y: 250 },
                        { id: 'camping', name: '露營經營', level: 8, exp: 85, x: 1100, y: 250 },
                        { id: 'team', name: '團隊合作', level: 9, exp: 90, x: 950, y: 350 },
                        { id: 'teaching', name: '教學能力', level: 9, exp: 88, x: 1050, y: 350 },
                        { id: 'problem', name: '問題解決', level: 9, exp: 92, x: 1150, y: 350 }
                    ]
                }
            ]
        };

        // 計算各分類的總等級
        skillTree.categories.forEach(category => {
            let totalLevel = 0;
            category.skills.forEach(skill => {
                totalLevel += skill.level;
            });
            category.level = totalLevel;
        });

        return skillTree;
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        // 更新導航按鈕的等級顯示
        this.updateNavButtonLevels();

        // 設置畫布大小（高解析度）
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // 初始化事件監聽
        this.initEventListeners();

        // 繪製技能樹
        this.drawSkillTree();

        // 更新統計數據
        this.updateStats();

        // 更新技能點數顯示
        this.updateSkillPoints();
    }

    updateNavButtonLevels() {
        // 更新所有導航按鈕的等級顯示
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const categoryId = btn.dataset.branch;
            const category = this.skills.categories.find(cat => cat.id === categoryId);
            if (category) {
                const levelSpan = btn.querySelector('.nav-level');
                if (levelSpan) {
                    levelSpan.textContent = `Lv.${category.level}`;
                }
            }
        });
    }

    updateSkillPoints() {
        // 計算總技能點數和已使用點數
        let usedPoints = 0;
        
        this.skills.categories.forEach(category => {
            category.skills.forEach(skill => {
                usedPoints += skill.level;
            });
        });
        
        // 剩餘點數設為 0
        const remainingPoints = 0;
        
        // 更新剩餘點數顯示
        this.displayRemainingPoints(remainingPoints);
    }

    displayRemainingPoints(points) {
        // 查找或創建剩餘點數顯示元素
        let pointsDisplay = document.getElementById('remaining-skill-points');
        if (!pointsDisplay) {
            pointsDisplay = document.createElement('div');
            pointsDisplay.id = 'remaining-skill-points';
            pointsDisplay.className = 'skill-points-display';
            
            const skillTreeContainer = document.querySelector('.skill-tree-container');
            if (skillTreeContainer) {
                const firstChild = skillTreeContainer.querySelector('.skill-tree-view');
                if (firstChild) {
                    skillTreeContainer.insertBefore(pointsDisplay, firstChild);
                } else {
                    skillTreeContainer.appendChild(pointsDisplay);
                }
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
        
        // 設定 Canvas 高解析度
        this.canvas.width = rect.width * this.pixelRatio;
        this.canvas.height = rect.height * this.pixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // 縮放 context 以適應高解析度
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
        
        this.drawSkillTree();
    }

    initEventListeners() {
        // 導航按鈕點擊 - 聚焦到對應分類
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.currentTarget.dataset.branch;
                this.focusOnCategory(categoryId);
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
                    const deltaX = e.clientX - this.lastMouseX;
                    const deltaY = e.clientY - this.lastMouseY;
                    
                    this.offsetX = Math.max(this.minOffsetX, Math.min(this.maxOffsetX, this.offsetX + deltaX));
                    this.offsetY = Math.max(this.minOffsetY, Math.min(this.maxOffsetY, this.offsetY + deltaY));
                    
                    this.lastMouseX = e.clientX;
                    this.lastMouseY = e.clientY;
                    
                    this.drawSkillTree();
                } else {
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

    focusOnCategory(categoryId) {
        const category = this.skills.categories.find(cat => cat.id === categoryId);
        if (!category) return;
        
        // 更新按鈕狀態
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.branch === categoryId);
        });
        
        // 計算需要移動的偏移量讓該類別居中
        const canvasRect = this.canvas.getBoundingClientRect();
        const targetX = canvasRect.width / 2 - category.x;
        const targetY = 150 - category.y;
        
        // 限制偏移量範圍
        this.offsetX = Math.max(this.minOffsetX, Math.min(this.maxOffsetX, targetX));
        this.offsetY = Math.max(this.minOffsetY, Math.min(this.maxOffsetY, targetY));
        
        // 重繪技能樹
        this.drawSkillTree();
    }

    drawSkillTree() {
        if (!this.ctx || !this.canvas) return;

        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width / this.pixelRatio, this.canvas.height / this.pixelRatio);

        // 保存當前狀態
        this.ctx.save();
        
        // 應用平移變換
        this.ctx.translate(this.offsetX, this.offsetY);

        // 繪製連線
        this.drawConnections();

        // 繪製分類節點和技能節點
        this.skills.categories.forEach(category => {
            // 繪製分類節點
            this.drawCategoryNode(category);
            
            // 繪製技能節點
            category.skills.forEach(skill => {
                this.drawSkillNode(skill, category.color);
            });
        });
        
        // 恢復狀態
        this.ctx.restore();
    }

    drawConnections() {
        this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        this.ctx.lineWidth = 2;
        
        // 繪製分類到技能的連線
        this.skills.categories.forEach(category => {
            category.skills.forEach(skill => {
                this.ctx.beginPath();
                this.ctx.moveTo(category.x, category.y);
                this.ctx.lineTo(skill.x, skill.y);
                this.ctx.stroke();
            });
        });
    }

    drawCategoryNode(category) {
        const radius = 40;
        const x = category.x;
        const y = category.y;

        // 外圈光暈
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
        gradient.addColorStop(0, `${category.color}40`);
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
        this.ctx.fill();

        // 分類背景
        this.ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
        this.ctx.strokeStyle = category.color;
        this.ctx.lineWidth = 3;
        
        // 繪製圓角矩形
        const width = 120;
        const height = 60;
        const cornerRadius = 10;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x - width/2 + cornerRadius, y - height/2);
        this.ctx.lineTo(x + width/2 - cornerRadius, y - height/2);
        this.ctx.quadraticCurveTo(x + width/2, y - height/2, x + width/2, y - height/2 + cornerRadius);
        this.ctx.lineTo(x + width/2, y + height/2 - cornerRadius);
        this.ctx.quadraticCurveTo(x + width/2, y + height/2, x + width/2 - cornerRadius, y + height/2);
        this.ctx.lineTo(x - width/2 + cornerRadius, y + height/2);
        this.ctx.quadraticCurveTo(x - width/2, y + height/2, x - width/2, y + height/2 - cornerRadius);
        this.ctx.lineTo(x - width/2, y - height/2 + cornerRadius);
        this.ctx.quadraticCurveTo(x - width/2, y - height/2, x - width/2 + cornerRadius, y - height/2);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();

        // 分類名稱
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(category.name, x, y - 8);

        // 等級顯示
        this.ctx.fillStyle = category.color;
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText(`Lv.${category.level}`, x, y + 10);
    }

    drawSkillNode(skill, categoryColor) {
        const radius = 30;
        const x = skill.x;
        const y = skill.y;

        // 外圈光暈
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5);
        gradient.addColorStop(0, `${categoryColor}60`);
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        this.ctx.fill();

        // 技能圓圈背景
        const bgGradient = this.ctx.createRadialGradient(x, y - radius/2, 0, x, y, radius);
        bgGradient.addColorStop(0, `${categoryColor}80`);
        bgGradient.addColorStop(1, `${categoryColor}40`);
        this.ctx.fillStyle = bgGradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // 邊框
        this.ctx.strokeStyle = categoryColor;
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // 技能名稱
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(skill.name, x, y - 5);

        // 等級顯示
        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillText(`Lv.${skill.level}`, x, y + 8);
    }

    handleCanvasClick(x, y) {
        // 檢查點擊了哪個技能
        this.skills.categories.forEach(category => {
            category.skills.forEach(skill => {
                const distance = Math.sqrt(Math.pow(x - skill.x, 2) + Math.pow(y - skill.y, 2));
                if (distance <= 30) {
                    this.selectSkill(skill);
                }
            });
            
            // 檢查是否點擊了分類節點
            const catDistance = Math.sqrt(Math.pow(x - category.x, 2) + Math.pow(y - category.y, 2));
            if (catDistance <= 60) {
                this.focusOnCategory(category.id);
            }
        });
    }

    handleCanvasHover(x, y) {
        let hovered = false;
        
        this.skills.categories.forEach(category => {
            category.skills.forEach(skill => {
                const distance = Math.sqrt(Math.pow(x - skill.x, 2) + Math.pow(y - skill.y, 2));
                if (distance <= 30) {
                    this.canvas.style.cursor = 'pointer';
                    hovered = true;
                }
            });
            
            const catDistance = Math.sqrt(Math.pow(x - category.x, 2) + Math.pow(y - category.y, 2));
            if (catDistance <= 60) {
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
        if (skillDescription) skillDescription.textContent = `${skill.name} - 專業技能`;
        if (skillYears) skillYears.textContent = `${skill.level} 級`;
        if (skillProficiency) skillProficiency.textContent = `${skill.exp}%`;
        
        // 更新經驗值條
        const progressBar = document.querySelector('.level-progress');
        const levelText = document.querySelector('.level-text');
        if (progressBar && levelText) {
            progressBar.style.width = `${skill.exp}%`;
            levelText.textContent = `${skill.exp}/100 EXP`;
        }
    }

    updateStats() {
        let totalSkills = 0;
        let masteredSkills = 0;
        let learningSkills = 0;

        this.skills.categories.forEach(category => {
            category.skills.forEach(skill => {
                totalSkills++;
                if (skill.level >= 8) {
                    masteredSkills++;
                } else if (skill.level < 6) {
                    learningSkills++;
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
}

// 初始化技能樹系統
document.addEventListener('DOMContentLoaded', () => {
    window.skillTreeSystem = new SkillTreeSystem();
});