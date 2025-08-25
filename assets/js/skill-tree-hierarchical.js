// 階層式技能樹系統
class HierarchicalSkillTree {
    constructor() {
        this.canvas = document.getElementById('skill-tree-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.detailsPanel = document.querySelector('.skill-details-panel');
        
        // 載入頭像圖片
        this.avatarImage = new Image();
        this.avatarImage.src = '/assets/images/avatar.png';
        this.avatarImageLoaded = false;
        this.avatarImage.onload = () => {
            this.avatarImageLoaded = true;
            this.drawFullSkillTree();
        };
        
        // 畫布設定
        this.canvasWidth = 2400;
        this.canvasHeight = 1600;
        this.centerX = this.canvasWidth / 2;
        this.centerY = this.canvasHeight / 2;
        
        // 相機偏移和縮放
        this.cameraOffset = { x: 0, y: 0 };
        this.zoomLevel = 2.5; // 預設更近的視角
        this.minZoom = 0.5;
        this.maxZoom = 4.0;
        
        // 動畫相關
        this.animationTime = 0;
        this.hoveredNode = null;
        this.selectedNode = null;
        
        // 拖曳相關
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // 建立階層式技能樹數據
        this.skillTree = this.buildSkillTree();
        
        // 初始化
        this.init();
    }
    
    buildSkillTree() {
        return {
            id: 'root',
            name: 'SuperGalen',
            x: this.centerX,
            y: this.centerY,
            level: 32,
            isRoot: true,
            children: [
                {
                    id: 'frontend',
                    name: '前端技術',
                    angle: -90,
                    distance: 250,
                    color: '#ffd700',
                    children: [
                        {
                            id: 'frontend-basic',
                            name: '基礎技術',
                            angle: -90,
                            distance: 180,
                            children: [
                                { id: 'html', name: 'HTML', level: 9, angle: -30, distance: 120 },
                                { id: 'css', name: 'CSS', level: 8, angle: 0, distance: 120 },
                                { id: 'javascript', name: 'JavaScript', level: 8, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-frameworks',
                            name: '框架工具',
                            angle: -45,
                            distance: 180,
                            children: [
                                { id: 'react', name: 'React', level: 5, angle: -20, distance: 120 },
                                { id: 'jquery', name: 'jQuery', level: 7, angle: 20, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-css',
                            name: 'CSS 框架',
                            angle: -135,
                            distance: 180,
                            children: [
                                { id: 'tailwind', name: 'Tailwind CSS', level: 8, angle: -15, distance: 120 },
                                { id: 'bootstrap', name: 'Bootstrap', level: 6, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-rails',
                            name: 'Rails 前端',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'stimulus', name: 'Stimulus', level: 6, angle: -15, distance: 120 },
                                { id: 'hotwire', name: 'Hotwire', level: 6, angle: 15, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'backend',
                    name: '後端技術',
                    angle: -18,
                    distance: 250,
                    color: '#10b981',
                    children: [
                        {
                            id: 'backend-ruby',
                            name: 'Ruby 生態系',
                            angle: -30,
                            distance: 180,
                            children: [
                                { id: 'ruby', name: 'Ruby', level: 9, angle: -15, distance: 120 },
                                { id: 'rails', name: 'Rails', level: 9, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'backend-elixir',
                            name: 'Elixir 生態系',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'elixir', name: 'Elixir', level: 6, angle: -15, distance: 120 },
                                { id: 'phoenix', name: 'Phoenix', level: 6, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'backend-node',
                            name: 'Node.js',
                            angle: 30,
                            distance: 150,
                            level: 7
                        },
                        {
                            id: 'backend-db',
                            name: '資料庫',
                            angle: -60,
                            distance: 150,
                            level: 8,
                            skillName: 'PostgreSQL'
                        },
                        {
                            id: 'backend-architecture',
                            name: '架構設計',
                            angle: 60,
                            distance: 180,
                            children: [
                                { id: 'mvc', name: 'MVC 架構', level: 9, angle: -15, distance: 120 },
                                { id: 'api', name: 'API 開發', level: 8, angle: 15, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'devops',
                    name: 'DevOps',
                    angle: 54,
                    distance: 250,
                    color: '#3b82f6',
                    children: [
                        {
                            id: 'devops-vcs',
                            name: '版本控制',
                            angle: 30,
                            distance: 180,
                            children: [
                                { id: 'git', name: 'Git', level: 9, angle: -15, distance: 120 },
                                { id: 'github', name: 'GitHub', level: 9, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-cloud',
                            name: '雲端服務',
                            angle: 60,
                            distance: 180,
                            children: [
                                { id: 'aws', name: 'AWS', level: 6, angle: -15, distance: 120 },
                                { id: 'aws-glue', name: 'AWS Glue', level: 5, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-iac',
                            name: '基礎設施即代碼',
                            angle: 90,
                            distance: 180,
                            children: [
                                { id: 'terraform', name: 'Terraform', level: 5, angle: -15, distance: 120 },
                                { id: 'ansible', name: 'Ansible', level: 5, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-cicd',
                            name: 'CI/CD',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'github-actions', name: 'GitHub Actions', level: 9, angle: 0, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'blockchain',
                    name: '區塊鏈',
                    angle: 126,  // 左下方
                    distance: 250,
                    color: '#8b5cf6',
                    children: [
                        {
                            id: 'blockchain-core',
                            name: '智能合約',
                            angle: -30,  // 相對於父節點，朝左下
                            distance: 180,
                            children: [
                                { id: 'solidity', name: 'Solidity', level: 5, angle: -15, distance: 120 },
                                { id: 'contract-deploy', name: '合約部署', level: 5, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'blockchain-tools',
                            name: 'Web3 工具',
                            angle: 0,  // 直下
                            distance: 180,
                            children: [
                                { id: 'ethers', name: 'ethers.js', level: 5, angle: -30, distance: 120 },
                                { id: 'hardhat', name: 'Hardhat', level: 5, angle: 0, distance: 120 },
                                { id: 'ipfs', name: 'IPFS', level: 4, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'blockchain-dapp',
                            name: 'DApp 開發',
                            angle: 30,  // 朝右下
                            distance: 180,
                            children: [
                                { id: 'token', name: 'Token 開發', level: 4, angle: -30, distance: 120 },
                                { id: 'dao', name: 'DAO 開發', level: 4, angle: 0, distance: 120 },
                                { id: 'dex', name: 'DEX 開發', level: 3, angle: 30, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'personal',
                    name: '生活技能',
                    angle: -162,  // 左上方 (-162 = 198 - 360)
                    distance: 250,
                    color: '#ec4899',
                    children: [
                        {
                            id: 'personal-hobbies',
                            name: '興趣專長',
                            angle: -30,  // 相對於父節點，朝左上
                            distance: 180,
                            children: [
                                { id: 'boardgame', name: '桌遊大師', level: 10, angle: -45, distance: 120 },
                                { id: 'camping', name: '露營管理員', level: 8, angle: -15, distance: 120 },
                                { id: 'handyman', name: '水電工', level: 6, angle: 15, distance: 120 },
                                { id: 'writer', name: '小說創作者', level: 4, angle: 45, distance: 120 }
                            ]
                        },
                        {
                            id: 'personal-skills',
                            name: '專業技能',
                            angle: 30,  // 朝右上
                            distance: 180,
                            children: [
                                { id: 'customer-service', name: '客服之神', level: 8, angle: -30, distance: 120 },
                                { id: 'teamwork', name: '團隊合作', level: 9, angle: 0, distance: 120 },
                                { id: 'problem-solving', name: '問題解決', level: 9, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'personal-creative',
                            name: '創作',
                            angle: 0,  // 直上
                            distance: 150,
                            level: 5,
                            skillName: '遊戲評論家'
                        }
                    ]
                }
            ]
        };
    }
    
    // 計算節點的實際位置
    calculateNodePositions(node, parentX = null, parentY = null, parentAngle = 0, depth = 0) {
        if (node.isRoot) {
            node.depth = 0;
        } else {
            // 對於主分支（depth 1），直接使用絕對角度
            // 對於子分支，使用相對角度
            let actualAngle;
            if (depth === 1) {
                actualAngle = node.angle * Math.PI / 180;
            } else {
                actualAngle = (parentAngle + (node.angle || 0)) * Math.PI / 180;
            }
            
            const distance = node.distance || 150;
            
            node.x = parentX + Math.cos(actualAngle) * distance;
            node.y = parentY + Math.sin(actualAngle) * distance;
            node.depth = depth;
            node.parentX = parentX;
            node.parentY = parentY;
            
            // 繼承父節點的顏色
            if (!node.color && node.parent) {
                node.color = node.parent.color;
            }
        }
        
        // 遞歸計算子節點位置
        if (node.children) {
            node.children.forEach(child => {
                child.parent = node;
                // 傳遞當前節點的角度作為新的父角度
                const newParentAngle = depth === 0 ? node.angle : parentAngle + (node.angle || 0);
                this.calculateNodePositions(child, node.x, node.y, newParentAngle, depth + 1);
            });
        }
    }
    
    // 計算分支總等級
    calculateBranchLevels(node) {
        let totalLevel = node.level || 0;
        
        if (node.children) {
            node.children.forEach(child => {
                totalLevel += this.calculateBranchLevels(child);
            });
        }
        
        if (node.depth === 1) { // 主分支節點
            node.totalLevel = totalLevel;
        }
        
        return totalLevel;
    }
    
    updateNavButtonLevels() {
        // 先計算所有位置
        this.calculateNodePositions(this.skillTree);
        
        // 計算各分支總等級
        this.skillTree.children.forEach(branch => {
            this.calculateBranchLevels(branch);
        });
        
        // 更新導航按鈕
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            const branchId = btn.getAttribute('data-branch');
            const branch = this.skillTree.children.find(child => child.id === branchId);
            if (branch) {
                const levelSpan = btn.querySelector('.nav-level');
                if (levelSpan) {
                    levelSpan.textContent = `Lv.${branch.totalLevel || 0}`;
                }
            }
        });
    }
    
    drawFullSkillTree() {
        if (!this.canvas || !this.ctx) return;
        
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        const baseScale = Math.min(this.canvas.width / this.canvasWidth, 
            this.canvas.height / this.canvasHeight) * 0.8;
        const scale = baseScale * this.zoomLevel;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        // 應用變換
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-this.canvasWidth / 2 + this.cameraOffset.x, 
            -this.canvasHeight / 2 + this.cameraOffset.y);
        
        // 先繪製所有連線
        this.drawConnections(this.skillTree);
        
        // 再繪製所有節點
        this.drawNodes(this.skillTree);
        
        this.ctx.restore();
        
        // 更新動畫
        this.animationTime += 0.016;
        requestAnimationFrame(() => this.drawFullSkillTree());
    }
    
    drawConnections(node) {
        if (node.children) {
            node.children.forEach(child => {
                // 繪製到子節點的連線
                const gradient = this.ctx.createLinearGradient(
                    node.x, node.y, child.x, child.y
                );
                
                // 根節點使用金色，其他使用父節點顏色
                const parentColor = node.isRoot ? '#ffd700' : (node.color || '#ffd700');
                const childColor = child.color || parentColor;
                
                gradient.addColorStop(0, parentColor + '80');
                gradient.addColorStop(1, childColor + '80');
                
                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = Math.max(1, 4 - child.depth);
                this.ctx.lineCap = 'round';
                
                // 繪製曲線連接
                this.ctx.beginPath();
                this.ctx.moveTo(node.x, node.y);
                
                // 使用貝塞爾曲線
                const cx1 = node.x + (child.x - node.x) * 0.3;
                const cy1 = node.y;
                const cx2 = node.x + (child.x - node.x) * 0.7;
                const cy2 = child.y;
                
                this.ctx.bezierCurveTo(cx1, cy1, cx2, cy2, child.x, child.y);
                this.ctx.stroke();
                
                // 遞歸繪製子連線
                this.drawConnections(child);
            });
        }
    }
    
    drawNodes(node) {
        // 繪製節點
        if (node.isRoot) {
            this.drawRootNode(node);
        } else {
            this.drawSkillNode(node);
        }
        
        // 遞歸繪製子節點
        if (node.children) {
            node.children.forEach(child => {
                this.drawNodes(child);
            });
        }
    }
    
    drawRootNode(node) {
        const radius = 60;
        
        // 動畫光暈
        const pulseRadius = radius + 30 + Math.sin(this.animationTime * 2) * 10;
        const gradient = this.ctx.createRadialGradient(
            node.x, node.y, 0, node.x, node.y, pulseRadius
        );
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 主節點背景
        const bgGradient = this.ctx.createRadialGradient(
            node.x, node.y - radius/2, 0, node.x, node.y, radius
        );
        bgGradient.addColorStop(0, '#ff6b6b');
        bgGradient.addColorStop(1, '#c92a2a');
        
        this.ctx.fillStyle = bgGradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 繪製頭像
        if (this.avatarImageLoaded && this.avatarImage) {
            this.ctx.save();
            
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius - 6, 0, Math.PI * 2);
            this.ctx.clip();
            
            const imageSize = (radius - 6) * 2;
            this.ctx.drawImage(
                this.avatarImage,
                node.x - imageSize / 2,
                node.y - imageSize / 2,
                imageSize,
                imageSize
            );
            
            this.ctx.restore();
        }
        
        // 外框
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 6;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 發光效果
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 20;
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        
        // 文字
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(node.name, node.x, node.y + radius + 15);
        
        // 等級
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(`Lv.${node.level}`, node.x, node.y + radius + 40);
    }
    
    drawSkillNode(node) {
        const baseRadius = 25;
        const radius = baseRadius + (node.depth === 1 ? 15 : 0) - (node.depth * 2);
        const isHovered = this.hoveredNode === node;
        const isSelected = this.selectedNode === node;
        
        // 計算節點顏色
        let nodeColor = node.color || '#64748b';
        if (node.level !== undefined) {
            // 根據等級決定顏色
            if (node.level >= 8) nodeColor = '#10b981'; // 精通 - 綠色
            else if (node.level >= 5) nodeColor = '#3b82f6'; // 熟練 - 藍色
            else nodeColor = '#f59e0b'; // 學習中 - 橘色
        }
        
        // 懸停或選中效果
        if (isHovered || isSelected) {
            const glowRadius = radius + 20;
            const glowGradient = this.ctx.createRadialGradient(
                node.x, node.y, radius, node.x, node.y, glowRadius
            );
            glowGradient.addColorStop(0, nodeColor + '60');
            glowGradient.addColorStop(1, nodeColor + '00');
            
            this.ctx.fillStyle = glowGradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 節點背景
        const bgGradient = this.ctx.createRadialGradient(
            node.x, node.y - radius/2, 0, node.x, node.y, radius
        );
        bgGradient.addColorStop(0, nodeColor);
        bgGradient.addColorStop(1, this.darkenColor(nodeColor, 0.7));
        
        this.ctx.fillStyle = bgGradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 內部光澤
        const shineGradient = this.ctx.createRadialGradient(
            node.x, node.y - radius/2, 0, node.x, node.y - radius/2, radius
        );
        shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        shineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        this.ctx.fillStyle = shineGradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius * 0.8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 邊框
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 文字
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `bold ${12 + (node.depth === 1 ? 4 : 0)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // 分行顯示長文字
        const displayName = node.skillName || node.name;
        const maxWidth = radius * 2.5;
        const words = displayName.split(' ');
        let line = '';
        let lines = [];
        
        for (let word of words) {
            const testLine = line + word + ' ';
            const metrics = this.ctx.measureText(testLine);
            if (metrics.width > maxWidth && line !== '') {
                lines.push(line.trim());
                line = word + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line.trim());
        
        // 繪製文字
        const lineHeight = 16;
        const totalHeight = lines.length * lineHeight;
        lines.forEach((text, index) => {
            const y = node.y - totalHeight/2 + index * lineHeight + lineHeight/2;
            this.ctx.fillText(text, node.x, y);
        });
        
        // 等級顯示
        if (node.level !== undefined) {
            this.ctx.font = 'bold 11px Arial';
            this.ctx.fillStyle = '#ffd700';
            this.ctx.fillText(`Lv.${node.level}`, node.x, node.y + radius + 10);
        }
        
        // 主分支的總等級
        if (node.depth === 1 && node.totalLevel) {
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillStyle = '#ffd700';
            this.ctx.fillText(`總 Lv.${node.totalLevel}`, node.x, node.y + radius + 25);
        }
    }
    
    darkenColor(color, factor) {
        // 簡單的顏色變暗函數
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        const newR = Math.round(r * factor);
        const newG = Math.round(g * factor);
        const newB = Math.round(b * factor);
        
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }
    
    findNodeAtPosition(node, x, y) {
        const radius = node.isRoot ? 60 : 25 + (node.depth === 1 ? 15 : 0) - (node.depth * 2);
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
        
        if (distance <= radius) {
            return node;
        }
        
        if (node.children) {
            for (let child of node.children) {
                const found = this.findNodeAtPosition(child, x, y);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const baseScale = Math.min(this.canvas.width / this.canvasWidth, 
            this.canvas.height / this.canvasHeight) * 0.8;
        const scale = baseScale * this.zoomLevel;
        
        const canvasX = (e.clientX - rect.left - this.canvas.width / 2) / scale + 
            this.canvasWidth / 2 - this.cameraOffset.x;
        const canvasY = (e.clientY - rect.top - this.canvas.height / 2) / scale + 
            this.canvasHeight / 2 - this.cameraOffset.y;
        
        const clickedNode = this.findNodeAtPosition(this.skillTree, canvasX, canvasY);
        
        if (clickedNode) {
            this.selectedNode = clickedNode;
            this.showSkillDetails(clickedNode);
        }
    }
    
    handleMouseMove(e) {
        if (this.isDragging) {
            // 處理拖曳
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            
            // 根據縮放級別調整拖曳靈敏度
            const dragSensitivity = 1 / this.zoomLevel;
            
            this.cameraOffset.x += deltaX * dragSensitivity;
            this.cameraOffset.y += deltaY * dragSensitivity;
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        } else {
            // 處理懸停
            const rect = this.canvas.getBoundingClientRect();
            const baseScale = Math.min(this.canvas.width / this.canvasWidth, 
                this.canvas.height / this.canvasHeight) * 0.8;
            const scale = baseScale * this.zoomLevel;
            
            const canvasX = (e.clientX - rect.left - this.canvas.width / 2) / scale + 
                this.canvasWidth / 2 - this.cameraOffset.x;
            const canvasY = (e.clientY - rect.top - this.canvas.height / 2) / scale + 
                this.canvasHeight / 2 - this.cameraOffset.y;
            
            const hoveredNode = this.findNodeAtPosition(this.skillTree, canvasX, canvasY);
            
            if (hoveredNode !== this.hoveredNode) {
                this.hoveredNode = hoveredNode;
                this.canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
            }
        }
    }
    
    animateToBranch(branchId) {
        const branch = this.skillTree.children.find(child => child.id === branchId);
        if (!branch) return;
        
        const targetX = this.centerX - branch.x;
        const targetY = this.centerY - branch.y;
        
        const duration = 500;
        const startTime = Date.now();
        const startX = this.cameraOffset.x;
        const startY = this.cameraOffset.y;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            this.cameraOffset.x = startX + (targetX - startX) * easeProgress;
            this.cameraOffset.y = startY + (targetY - startY) * easeProgress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        // Ctrl/Cmd + 滾輪 = 縮放
        if (e.ctrlKey || e.metaKey) {
            const zoomSensitivity = 0.001;
            const zoomDelta = -e.deltaY * zoomSensitivity;
            
            // 計算新的縮放級別
            const newZoom = Math.max(this.minZoom, 
                Math.min(this.maxZoom, this.zoomLevel + zoomDelta));
            
            // 以滑鼠位置為中心進行縮放
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - this.canvas.width / 2;
            const mouseY = e.clientY - rect.top - this.canvas.height / 2;
            
            const zoomRatio = newZoom / this.zoomLevel;
            
            // 調整相機偏移以保持滑鼠位置不變
            this.cameraOffset.x = mouseX + (this.cameraOffset.x - mouseX) * zoomRatio;
            this.cameraOffset.y = mouseY + (this.cameraOffset.y - mouseY) * zoomRatio;
            
            this.zoomLevel = newZoom;
        } else {
            // 一般滾輪 = 平移
            const sensitivity = 2 / this.zoomLevel; // 根據縮放調整靈敏度
            if (e.shiftKey) {
                this.cameraOffset.x -= e.deltaY * sensitivity;
            } else {
                this.cameraOffset.y -= e.deltaY * sensitivity;
            }
            
            if (e.deltaX !== 0) {
                this.cameraOffset.x -= e.deltaX * sensitivity;
            }
        }
    }
    
    handleKeyboard(e) {
        const skillsTab = document.getElementById('skills-tab');
        if (!skillsTab || !skillsTab.classList.contains('active')) return;
        
        if (!this.canvas || document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA') return;
        
        const moveSpeed = 30;
        let handled = false;
        
        switch(e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.cameraOffset.y += moveSpeed;
                handled = true;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.cameraOffset.y -= moveSpeed;
                handled = true;
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.cameraOffset.x += moveSpeed;
                handled = true;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.cameraOffset.x -= moveSpeed;
                handled = true;
                break;
            case '0':
                this.cameraOffset.x = 0;
                this.cameraOffset.y = 0;
                handled = true;
                break;
        }
        
        if (handled) {
            e.preventDefault();
        }
    }
    
    showSkillDetails(node) {
        if (!this.detailsPanel) return;
        
        this.detailsPanel.classList.add('active');
        
        const skillName = document.getElementById('skill-name');
        const skillProgress = document.getElementById('skill-progress');
        const levelText = skillProgress?.nextElementSibling;
        const skillDescription = document.getElementById('skill-description');
        
        const displayName = node.skillName || node.name;
        
        if (skillName) skillName.textContent = displayName;
        if (skillProgress && levelText && node.level) {
            const level = node.level;
            skillProgress.style.width = `${level * 10}%`;
            levelText.textContent = `Level ${level}`;
        }
        
        if (skillDescription) {
            let description = '';
            if (node.isRoot) {
                description = '技能樹的核心，所有技能都從這裡發散出去。';
            } else if (node.depth === 1) {
                description = `${displayName}分支，包含了多項相關技能。`;
            } else if (node.children) {
                description = `${displayName}類別，包含多個子技能。`;
            } else {
                const levelDesc = node.level >= 8 ? '精通' : 
                                 node.level >= 5 ? '熟練' : '學習中';
                description = `${displayName} - ${levelDesc}階段`;
            }
            skillDescription.innerHTML = `<p>${description}</p>`;
        }
    }
    
    hideSkillDetails() {
        if (this.detailsPanel) {
            this.detailsPanel.classList.remove('active');
        }
    }
    
    createSkillPointsDisplay() {
        let pointsDisplay = document.getElementById('skill-points-display');
        if (!pointsDisplay) {
            pointsDisplay = document.createElement('div');
            pointsDisplay.id = 'skill-points-display';
            pointsDisplay.className = 'skill-points-display';
            
            const treeContainer = document.querySelector('.skill-tree-container');
            if (treeContainer) {
                treeContainer.appendChild(pointsDisplay);
            }
        }
        
        pointsDisplay.innerHTML = `
            <span class="points-label">剩餘點數</span>
            <span class="points-value">??</span>
        `;
    }
    
    init() {
        if (!this.canvas) return;
        
        // 計算所有節點位置
        this.calculateNodePositions(this.skillTree);
        
        // 更新導航按鈕等級
        this.updateNavButtonLevels();
        
        // 創建剩餘點數顯示
        this.createSkillPointsDisplay();
        
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
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // 拖曳事件
        this.canvas.addEventListener('mousedown', (e) => {
            // 檢查是否點擊到節點
            const rect = this.canvas.getBoundingClientRect();
            const baseScale = Math.min(this.canvas.width / this.canvasWidth, 
                this.canvas.height / this.canvasHeight) * 0.8;
            const scale = baseScale * this.zoomLevel;
            
            const canvasX = (e.clientX - rect.left - this.canvas.width / 2) / scale + 
                this.canvasWidth / 2 - this.cameraOffset.x;
            const canvasY = (e.clientY - rect.top - this.canvas.height / 2) / scale + 
                this.canvasHeight / 2 - this.cameraOffset.y;
            
            const clickedNode = this.findNodeAtPosition(this.skillTree, canvasX, canvasY);
            
            if (!clickedNode) {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.canvas.style.cursor = 'grabbing';
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        });
        
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
        
        // 開始繪製動畫
        this.drawFullSkillTree();
    }
}

// 匯出給全域使用
window.HierarchicalSkillTree = HierarchicalSkillTree;