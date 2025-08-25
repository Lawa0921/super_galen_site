// 統一的技能樹系統 - 基於原始設計
class UnifiedSkillTree {
    constructor() {
        this.canvas = document.getElementById('skill-tree-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.detailsPanel = document.querySelector('.skill-details-panel');
        
        // 技能樹數據
        this.skillData = {
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
        
        // 畫布設定
        this.canvasWidth = 1600;
        this.canvasHeight = 900;
        this.centerX = this.canvasWidth / 2;
        this.centerY = this.canvasHeight / 2;
        
        // 五個方向的角度（從上方開始，順時針）
        this.branchAngles = {
            frontend: -90,      // 上
            backend: -18,       // 右上
            devops: 54,         // 右下
            blockchain: 126,    // 左下
            personal: 198       // 左上
        };
        
        // 所有技能節點位置
        this.skillPositions = this.initializeSkillPositions();
        
        // 相機偏移和縮放
        this.cameraOffset = { x: 0, y: 0 };
        this.fixedZoomLevel = 1.5;
        
        // 初始化
        this.init();
    }
    
    calculatePosition(angle, distance) {
        const rad = angle * Math.PI / 180;
        return {
            x: this.centerX + Math.cos(rad) * distance,
            y: this.centerY + Math.sin(rad) * distance
        };
    }
    
    initializeSkillPositions() {
        return {
            center: { x: this.centerX, y: this.centerY, name: 'SuperGalen', isRoot: true },
            frontend: { 
                ...this.calculatePosition(this.branchAngles.frontend, 200),
                nodes: [
                    { name: 'React', ...this.calculatePosition(this.branchAngles.frontend, 320), level: 5 },
                    { name: 'Vue.js', ...this.calculatePosition(this.branchAngles.frontend - 15, 340), level: 4 },
                    { name: 'TypeScript', ...this.calculatePosition(this.branchAngles.frontend + 15, 340), level: 4 },
                    { name: 'CSS3', ...this.calculatePosition(this.branchAngles.frontend - 30, 380), level: 5 },
                    { name: 'Webpack', ...this.calculatePosition(this.branchAngles.frontend + 30, 380), level: 3 }
                ]
            },
            backend: { 
                ...this.calculatePosition(this.branchAngles.backend, 200),
                nodes: [
                    { name: 'Node.js', ...this.calculatePosition(this.branchAngles.backend, 320), level: 5 },
                    { name: 'Python', ...this.calculatePosition(this.branchAngles.backend - 15, 340), level: 4 },
                    { name: 'PostgreSQL', ...this.calculatePosition(this.branchAngles.backend + 15, 340), level: 4 },
                    { name: 'Redis', ...this.calculatePosition(this.branchAngles.backend - 30, 380), level: 3 },
                    { name: 'GraphQL', ...this.calculatePosition(this.branchAngles.backend + 30, 380), level: 3 }
                ]
            },
            devops: { 
                ...this.calculatePosition(this.branchAngles.devops, 200),
                nodes: [
                    { name: 'Docker', ...this.calculatePosition(this.branchAngles.devops, 320), level: 4 },
                    { name: 'K8s', ...this.calculatePosition(this.branchAngles.devops - 15, 340), level: 3 },
                    { name: 'AWS', ...this.calculatePosition(this.branchAngles.devops + 15, 340), level: 4 },
                    { name: 'CI/CD', ...this.calculatePosition(this.branchAngles.devops - 30, 380), level: 4 },
                    { name: 'Terraform', ...this.calculatePosition(this.branchAngles.devops + 30, 380), level: 2 }
                ]
            },
            blockchain: { 
                ...this.calculatePosition(this.branchAngles.blockchain, 200),
                nodes: [
                    { name: 'Solidity', ...this.calculatePosition(this.branchAngles.blockchain, 320), level: 4 },
                    { name: 'Web3.js', ...this.calculatePosition(this.branchAngles.blockchain - 15, 340), level: 4 },
                    { name: 'DeFi', ...this.calculatePosition(this.branchAngles.blockchain + 15, 340), level: 3 },
                    { name: 'NFT', ...this.calculatePosition(this.branchAngles.blockchain - 30, 380), level: 3 },
                    { name: 'DAO', ...this.calculatePosition(this.branchAngles.blockchain + 30, 380), level: 2 }
                ]
            },
            personal: { 
                ...this.calculatePosition(this.branchAngles.personal, 200),
                nodes: [
                    { name: '溝通力', ...this.calculatePosition(this.branchAngles.personal, 320), level: 5 },
                    { name: '團隊合作', ...this.calculatePosition(this.branchAngles.personal - 15, 340), level: 5 },
                    { name: '問題解決', ...this.calculatePosition(this.branchAngles.personal + 15, 340), level: 4 },
                    { name: '時間管理', ...this.calculatePosition(this.branchAngles.personal - 30, 380), level: 3 },
                    { name: '領導力', ...this.calculatePosition(this.branchAngles.personal + 30, 380), level: 3 }
                ]
            }
        };
    }
    
    calculateBranchTotalLevel(branch) {
        const branchData = this.skillPositions[branch];
        if (!branchData || !branchData.nodes) return 0;
        
        let totalLevel = 0;
        branchData.nodes.forEach(node => {
            totalLevel += node.level || 0;
        });
        
        // 加上根節點的基礎等級
        if (this.skillData[branch]) {
            totalLevel += this.skillData[branch].level || 0;
        }
        
        return totalLevel;
    }
    
    updateNavButtonLevels() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            const branch = btn.getAttribute('data-branch');
            if (branch && this.skillPositions[branch]) {
                const totalLevel = this.calculateBranchTotalLevel(branch);
                const levelSpan = btn.querySelector('.nav-level');
                if (levelSpan) {
                    levelSpan.textContent = `Lv.${totalLevel}`;
                }
            }
        });
    }
    
    drawFullSkillTree() {
        if (!this.canvas || !this.ctx) return;
        
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        const baseScale = Math.min(this.canvas.width / this.canvasWidth, this.canvas.height / this.canvasHeight) * 0.9;
        const scale = baseScale * this.fixedZoomLevel;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        // 應用變換
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-this.canvasWidth / 2 + this.cameraOffset.x, -this.canvasHeight / 2 + this.cameraOffset.y);
        
        // 繪製連線
        Object.entries(this.skillPositions).forEach(([branch, data]) => {
            if (branch !== 'center' && this.skillData[branch]) {
                this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(this.skillPositions.center.x, this.skillPositions.center.y);
                this.ctx.lineTo(data.x, data.y);
                this.ctx.stroke();
            }
        });
        
        // 繪製中心節點
        this.drawCenterNode();
        
        // 繪製所有分支
        Object.entries(this.skillPositions).forEach(([branch, data]) => {
            if (branch !== 'center' && this.skillData[branch]) {
                this.drawBranch(branch, data, this.skillData[branch]);
            }
        });
        
        this.ctx.restore();
    }
    
    drawCenterNode() {
        const center = this.skillPositions.center;
        
        this.ctx.font = 'bold 20px Arial';
        const textMetrics = this.ctx.measureText(center.name);
        const textWidth = textMetrics.width;
        const nodeRadius = Math.max(45, textWidth / 2 + 15);
        
        // 光暈效果
        const gradient = this.ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, nodeRadius + 30);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, nodeRadius + 30, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 主節點
        this.ctx.fillStyle = '#ff6b6b';
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 6;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, nodeRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // 文字
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(center.name, center.x, center.y);
    }
    
    drawBranch(branchName, position, branchData) {
        const { x, y, nodes } = position;
        
        // 根節點
        this.ctx.fillStyle = '#ffd700';
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 4;
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 40, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#1e293b';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(branchData.name.replace('技術樹', '').replace('技能樹', ''), x, y);
        
        // 子節點
        nodes.forEach(node => {
            // 連線
            this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(node.x, node.y);
            this.ctx.stroke();
            
            // 節點
            const nodeSize = 20 + node.level * 4;
            this.ctx.fillStyle = node.level >= 4 ? '#10b981' : '#3b82f6';
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 邊框
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(node.name, node.x, node.y);
        });
    }
    
    animateToBranch(branch) {
        const position = this.skillPositions[branch];
        if (!position) return;
        
        const branchOffsetX = this.centerX - position.x;
        const branchOffsetY = this.centerY - position.y;
        
        const duration = 500;
        const startTime = Date.now();
        const startX = this.cameraOffset.x;
        const startY = this.cameraOffset.y;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            this.cameraOffset.x = startX + (branchOffsetX - startX) * easeProgress;
            this.cameraOffset.y = startY + (branchOffsetY - startY) * easeProgress;
            
            this.drawFullSkillTree();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const baseScale = Math.min(this.canvas.width / this.canvasWidth, this.canvas.height / this.canvasHeight) * 0.9;
        const scale = baseScale * this.fixedZoomLevel;
        
        const canvasX = (e.clientX - rect.left - this.canvas.width / 2) / scale + this.canvasWidth / 2 - this.cameraOffset.x;
        const canvasY = (e.clientY - rect.top - this.canvas.height / 2) / scale + this.canvasHeight / 2 - this.cameraOffset.y;
        
        // 檢查中心節點
        const centerDist = Math.sqrt((canvasX - this.skillPositions.center.x) ** 2 + (canvasY - this.skillPositions.center.y) ** 2);
        if (centerDist < 60) {
            this.showSkillDetails({
                name: 'SuperGalen',
                level: 100,
                description: '技能樹的核心，所有技能都從這裡發散出去。'
            }, 'center');
            return;
        }
        
        // 檢查其他節點
        Object.entries(this.skillPositions).forEach(([branch, data]) => {
            if (branch !== 'center' && data.nodes) {
                const rootDist = Math.sqrt((canvasX - data.x) ** 2 + (canvasY - data.y) ** 2);
                if (rootDist < 40) {
                    this.showSkillDetails(this.skillData[branch], branch);
                    return;
                }
                
                data.nodes.forEach(node => {
                    const nodeSize = 20 + node.level * 4;
                    const dist = Math.sqrt((canvasX - node.x) ** 2 + (canvasY - node.y) ** 2);
                    if (dist < nodeSize) {
                        this.showSkillDetails(node, branch);
                        return;
                    }
                });
            }
        });
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const sensitivity = 2;
        if (e.shiftKey) {
            this.cameraOffset.x -= e.deltaY * sensitivity;
        } else {
            this.cameraOffset.y -= e.deltaY * sensitivity;
        }
        
        if (e.deltaX !== 0) {
            this.cameraOffset.x -= e.deltaX * sensitivity;
        }
        
        this.drawFullSkillTree();
    }
    
    handleKeyboard(e) {
        const skillsTab = document.getElementById('skills-tab');
        if (!skillsTab || !skillsTab.classList.contains('active')) return;
        
        if (!this.canvas || document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA') return;
        
        const moveSpeed = 30;
        let needsRedraw = false;
        
        switch(e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.cameraOffset.y += moveSpeed;
                needsRedraw = true;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.cameraOffset.y -= moveSpeed;
                needsRedraw = true;
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.cameraOffset.x += moveSpeed;
                needsRedraw = true;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.cameraOffset.x -= moveSpeed;
                needsRedraw = true;
                break;
            case '0':
                this.cameraOffset.x = 0;
                this.cameraOffset.y = 0;
                needsRedraw = true;
                break;
        }
        
        if (needsRedraw) {
            e.preventDefault();
            this.drawFullSkillTree();
        }
    }
    
    showSkillDetails(skillInfo, branch) {
        if (!this.detailsPanel) return;
        
        this.detailsPanel.classList.add('active');
        
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
        
        if (this.skillData[branch]) {
            const masteryCount = document.getElementById('mastery-count');
            const learningCount = document.getElementById('learning-count');
            if (masteryCount) masteryCount.textContent = this.skillData[branch].mastery || 0;
            if (learningCount) learningCount.textContent = this.skillData[branch].learning || 0;
        }
    }
    
    hideSkillDetails() {
        if (this.detailsPanel) {
            this.detailsPanel.classList.remove('active');
        }
    }
    
    init() {
        if (!this.canvas) return;
        
        // 更新導航按鈕等級
        this.updateNavButtonLevels();
        
        // 導航按鈕事件
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const branch = btn.getAttribute('data-branch');
                this.animateToBranch(branch);
            });
        });
        
        // Canvas 事件
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // 鍵盤事件
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // 點擊外部關閉詳情面板
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.skill-details-panel') && 
                !e.target.closest('#skill-tree-canvas') &&
                !e.target.closest('.nav-btn')) {
                this.hideSkillDetails();
            }
        });
        
        // 關閉按鈕
        const closeBtn = document.querySelector('.skill-details-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideSkillDetails();
            });
        }
        
        // 初始繪製
        setTimeout(() => {
            this.drawFullSkillTree();
        }, 100);
    }
}

// 匯出給全域使用
window.UnifiedSkillTree = UnifiedSkillTree;