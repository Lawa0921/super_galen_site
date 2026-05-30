// 階層式技能樹系統
// 共用的年齡計算函數
function calculateCurrentAge() {
    const birthDate = new Date('1992-09-21');
    const now = new Date();

    let age = now.getFullYear() - birthDate.getFullYear();
    const monthDiff = now.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

class HierarchicalSkillTree {
    constructor() {
        console.log('🎯 HierarchicalSkillTree 構造函數開始執行');
        window.__skillTreeDebug = window.__skillTreeDebug || {};
        window.__skillTreeDebug.constructorCalled = true;

        this.canvas = document.getElementById('skill-tree-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.detailsPanel = document.querySelector('.skill-details-panel');

        console.log('🎯 Canvas:', this.canvas, 'Context:', this.ctx);
        window.__skillTreeDebug.canvasFound = !!this.canvas;
        window.__skillTreeDebug.contextCreated = !!this.ctx;

        // 畫布設定 - 必須在 initializeWhenReady 之前設置，因為 buildSkillTree 需要這些值
        this.canvasWidth = 2400;
        this.canvasHeight = 1600;
        this.centerX = this.canvasWidth / 2;
        this.centerY = this.canvasHeight / 2;

        // 相機偏移和縮放
        this.cameraOffset = { x: 0, y: 0 };
        this.zoomLevel = 5.0; // 預設更近的視角，讓小節點內容更清楚
        this.minZoom = this.calculateMinZoom(); // 動態計算最小縮放
        this.maxZoom = 8.0; // 提高最大縮放倍率

        // 動畫相關
        this.animationTime = 0;
        this.hoveredNode = null;
        this.selectedNode = null;

        // 拖曳相關
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // 載入頭像圖片
        this.avatarImage = new Image();
        // 從頁面中已存在的 avatar 圖片取得正確的路徑
        const existingAvatar = document.querySelector('.player-avatar');
        this.avatarImage.src = existingAvatar.src;
        this.avatarImageLoaded = false;
        this.avatarImage.onload = () => {
            this.avatarImageLoaded = true;
            // 只有在技能樹已初始化且節點位置已計算時才重繪
            // 否則會在 init() 結束時自動開始繪製
            if (this.skillTree && this.skillTree.x !== undefined) {
                this.drawFullSkillTree();
            }
        };

        // 等待 i18n 載入後初始化 - 必須在所有屬性設置完成後才調用
        this.initializeWhenReady();
    }

    // 等待 i18n 載入後初始化（事件驅動版本）
    initializeWhenReady() {
        // 如果 i18n 已經載入且初始化完成，直接執行
        if (window.i18n && window.i18n.currentTranslations) {
            console.log('✅ i18n 已就緒，立即初始化技能樹');
            this.skillTree = this.buildSkillTree();
            // 立即計算所有節點位置，確保在 init() 之前完成
            this.calculateNodePositions(this.skillTree);
            this.init();
            this.listenForLanguageChange();
            return;
        }

        // 否則，監聽 i18nInitialized 事件
        console.log('⏳ 等待 i18n 初始化...');
        const handleI18nReady = () => {
            console.log('✅ 收到 i18nInitialized 事件，初始化技能樹');
            this.skillTree = this.buildSkillTree();
            // 立即計算所有節點位置，確保在 init() 之前完成
            this.calculateNodePositions(this.skillTree);
            this.init();
            this.listenForLanguageChange();
        };

        window.addEventListener('i18nInitialized', handleI18nReady, { once: true });

        // 安全網：如果 i18n 已經存在但事件還沒觸發（競爭條件），再次檢查
        setTimeout(() => {
            if (window.i18n && window.i18n.currentTranslations && !this.skillTree) {
                console.log('✅ i18n 已就緒，執行初始化（安全網觸發）');
                handleI18nReady();
            }
        }, 100);
    }

    // 監聽語言切換事件並重新建構技能樹
    listenForLanguageChange() {
        window.addEventListener('i18n:languageChanged', () => {
            // 重新建構技能樹
            this.skillTree = this.buildSkillTree();

            // 重新計算節點位置
            this.calculateNodePositions(this.skillTree, this.centerX, this.centerY, 0, 0);
            this.calculateBranchLevels(this.skillTree);
            this.updateNavButtonLevels();

            // 重新繪製
            this.drawFullSkillTree();
        });
    }
    
    // 計算能完整顯示技能樹的最小縮放等級
    calculateMinZoom() {
        // 如果 canvas 不存在或尺寸為 0，返回預設值
        if (!this.canvas || !this.canvas.width || !this.canvas.height) {
            return 1.5; // 預設最小縮放
        }

        // 技能樹的最大範圍計算
        const maxDistance = 250 + 180 + 120; // 主分支 + 子分支 + 葉子節點距離
        const totalWidth = maxDistance * 2; // 直徑
        const totalHeight = maxDistance * 2; // 直徑

        // 加上節點半徑和一些邊距
        const padding = 200; // 增加邊距
        const requiredWidth = totalWidth + padding;
        const requiredHeight = totalHeight + padding;

        // 計算實際畫布大小（考慮 devicePixelRatio）
        const actualCanvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
        const actualCanvasHeight = this.canvas.height / (window.devicePixelRatio || 1);

        // 計算需要的縮放等級以適應畫布
        const scaleX = actualCanvasWidth / requiredWidth;
        const scaleY = actualCanvasHeight / requiredHeight;

        // 使用較小的縮放值確保整個技能樹都能顯示，但設定一個實用的最小值
        const calculatedMinZoom = Math.min(scaleX, scaleY);
        return Math.max(1.5, calculatedMinZoom); // 最小不能小於 1.5，保持技能樹可讀性
    }
    
    // 取得分類對應的顏色
    getCategoryColor(node) {
        // 根據節點 ID 或其父節點判斷所屬分類
        const categoryColors = {
            'frontend': '#3B82F6',      // 鮮豔藍色
            'backend': '#10B981',       // 鮮豔綠色
            'devops': '#F59E0B',        // 鮮豔橘色
            'blockchain': '#8B5CF6',    // 鮮豔紫色
            'ai': '#06B6D4',            // 鮮豔青色
            'personal': '#EF4444'       // 鮮豔紅色
        };

        // 尋找主分類 - 加入循環引用保護
        let currentNode = node;
        const visited = new Set();  // 追蹤已訪問的節點，防止無限循環
        let maxDepth = 10;  // 最大遍歷深度保護

        while (currentNode && maxDepth-- > 0) {
            // 檢測循環引用
            if (visited.has(currentNode)) {
                console.warn('⚠️ 檢測到循環引用，停止遍歷');
                break;
            }
            visited.add(currentNode);

            // 檢查是否匹配分類 ID
            if (categoryColors[currentNode.id]) {
                return categoryColors[currentNode.id];
            }

            // 查找節點的分類ID前綴
            for (let category in categoryColors) {
                if (currentNode.id && currentNode.id.startsWith(category)) {
                    return categoryColors[category];
                }
            }

            currentNode = currentNode.parent;
        }

        return categoryColors[currentNode?.id] || '#64748b';
    }
    
    // 技能描述資料
    getSkillDescriptions() {
        if (!window.i18n) {
            console.warn('i18n 尚未載入，使用空描述');
            return {};
        }

        // 從 i18n 系統載入技能描述
        return window.i18n.currentTranslations?.skills?.descriptions || {};
    }

    // 技能名稱資料 - 從 i18n 載入
    getSkillNames() {
        if (!window.i18n) {
            console.warn('i18n 尚未載入，使用空名稱');
            return {};
        }

        // 從 i18n 系統載入技能名稱
        return window.i18n.currentTranslations?.skills?.names || {};
    }
    
    buildSkillTree() {
        // 獲取技能名稱
        const skillNames = this.getSkillNames();

        return {
            id: 'root',
            name: 'SuperGalen',
            x: this.centerX,
            y: this.centerY,
            level: calculateCurrentAge(),
            isRoot: true,
            children: [
                {
                    id: 'frontend',
                    name: skillNames.frontend || '前端技術',
                    angle: -90,
                    distance: 300,
                    color: '#3B82F6',
                    children: [
                        {
                            id: 'frontend-basic',
                            name: skillNames.frontend_basic || '基礎技術',
                            angle: -90,
                            distance: 180,
                            children: [
                                { id: 'html', name: skillNames.html || 'HTML', level: 10, angle: -30, distance: 120 },
                                { id: 'css', name: skillNames.css || 'CSS', level: 8, angle: 0, distance: 120 },
                                { id: 'javascript', name: skillNames.javascript || 'JavaScript', level: 7, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-frameworks',
                            name: skillNames.frontend_frameworks || '框架工具',
                            angle: -45,
                            distance: 180,
                            children: [
                                { id: 'jquery', name: skillNames.jquery || 'jQuery', level: 5, angle: 0, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-css',
                            name: skillNames.frontend_css || 'CSS 框架',
                            angle: 75,  // 兩點鐘方向
                            distance: 180,
                            children: [
                                { id: 'tailwind', name: skillNames.tailwind || 'Tailwind CSS', level: 8, angle: -15, distance: 120 },
                                { id: 'bootstrap', name: skillNames.bootstrap || 'Bootstrap', level: 6, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-rails',
                            name: skillNames.frontend_rails || 'Rails 前端',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'stimulus', name: skillNames.stimulus || 'Stimulus', level: 7, angle: -15, distance: 120 },
                                { id: 'hotwire', name: skillNames.hotwire || 'Hotwire', level: 8, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'frontend-phoenix',
                            name: skillNames.frontend_phoenix || 'Phoenix 前端',
                            angle: 45,
                            distance: 180,
                            children: [
                                { id: 'liveview', name: skillNames.liveview || 'LiveView', level: 8, angle: 0, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'backend',
                    name: skillNames.backend || '後端技術',
                    angle: -30,
                    distance: 300,
                    color: '#10B981',
                    children: [
                        {
                            id: 'backend-ruby',
                            name: skillNames.backend_ruby || 'Ruby 生態系',
                            angle: -30,
                            distance: 180,
                            children: [
                                { id: 'ruby', name: skillNames.ruby || 'Ruby', level: 9, angle: -30, distance: 120 },
                                { id: 'rails', name: skillNames.rails || 'Rails', level: 9, angle: 0, distance: 120 },
                                { id: 'sidekiq', name: skillNames.sidekiq || 'Sidekiq', level: 8, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'backend-elixir',
                            name: skillNames.backend_elixir || 'Elixir 生態系',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'elixir', name: skillNames.elixir || 'Elixir', level: 8, angle: -15, distance: 120 },
                                { id: 'phoenix', name: skillNames.phoenix || 'Phoenix', level: 8, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'backend-node',
                            name: skillNames.nodejs || 'Node.js',
                            angle: 30,
                            distance: 150,
                            level: 5
                        },
                        {
                            id: 'postgresql',
                            name: skillNames.backend_database || '資料庫',
                            angle: -60,
                            distance: 150,
                            level: 8,
                            skillName: skillNames.postgresql || 'PostgreSQL'
                        },
                        {
                            id: 'mysql',
                            name: skillNames.backend_database || '資料庫',
                            angle: -90,
                            distance: 150,
                            level: 5,
                            skillName: skillNames.mysql || 'MySQL'
                        },
                        {
                            id: 'backend-architecture',
                            name: skillNames.backend_architecture || '架構設計',
                            angle: 60,
                            distance: 180,
                            children: [
                                { id: 'mvc', name: skillNames.mvc || 'MVC 架構', level: 9, angle: -15, distance: 120 },
                                { id: 'api', name: skillNames.api || 'API 開發', level: 8, angle: 15, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'devops',
                    name: skillNames.devops || 'DevOps',
                    angle: 30,
                    distance: 300,
                    color: '#F59E0B',
                    children: [
                        {
                            id: 'devops-vcs',
                            name: skillNames.devops_vcs || '版本控制',
                            angle: 30,
                            distance: 180,
                            children: [
                                { id: 'git', name: skillNames.git || 'Git', level: 10, angle: -15, distance: 120 },
                                { id: 'github', name: skillNames.github || 'GitHub', level: 10, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-cloud',
                            name: skillNames.devops_cloud || '雲端服務',
                            angle: 60,
                            distance: 180,
                            children: [
                                { id: 'aws', name: skillNames.aws || 'AWS', level: 6, angle: 0, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-iac',
                            name: skillNames.devops_infrastructure || '基礎設施即代碼',
                            angle: 90,
                            distance: 180,
                            children: [
                                { id: 'terraform', name: skillNames.terraform || 'Terraform', level: 5, angle: -15, distance: 120 },
                                { id: 'ansible', name: skillNames.ansible || 'Ansible', level: 5, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'devops-cicd',
                            name: skillNames.cicd || 'CI/CD',
                            angle: 0,
                            distance: 180,
                            children: [
                                { id: 'github-actions', name: skillNames.github_actions || 'GitHub Actions', level: 9, angle: 0, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'blockchain',
                    name: skillNames.blockchain || '區塊鏈',
                    angle: 150,  // 左下方
                    distance: 300,
                    color: '#8B5CF6',
                    children: [
                        {
                            id: 'blockchain-core',
                            name: skillNames.blockchain_core || '智能合約',
                            angle: -30,  // 相對於父節點，朝左下
                            distance: 180,
                            children: [
                                { id: 'solidity', name: skillNames.solidity || 'Solidity', level: 5, angle: -15, distance: 120 },
                                { id: 'contract-deploy', name: skillNames.contract_deployment || '合約部署', level: 5, angle: 15, distance: 120 }
                            ]
                        },
                        {
                            id: 'blockchain-tools',
                            name: skillNames.blockchain_tools || 'Web3 工具',
                            angle: 0,  // 直下
                            distance: 180,
                            children: [
                                { id: 'ethers', name: skillNames.ethers || 'ethers.js', level: 5, angle: -30, distance: 120 },
                                { id: 'hardhat', name: skillNames.hardhat || 'Hardhat', level: 3, angle: 0, distance: 120 },
                                { id: 'ipfs', name: skillNames.ipfs || 'IPFS', level: 2, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'blockchain-dapp',
                            name: skillNames.blockchain_dapp || 'DApp 開發',
                            angle: 45,  // 朝右下
                            distance: 180,
                            children: [
                                { id: 'token', name: skillNames.token || 'Token 開發', level: 5, angle: -30, distance: 120 },
                                { id: 'dao', name: skillNames.dao || 'DAO 開發', level: 3, angle: 0, distance: 120 },
                                { id: 'dex', name: skillNames.dex || 'DEX 開發', level: 3, angle: 30, distance: 120 }
                            ]
                        }
                    ]
                },
                {
                    id: 'ai',
                    name: skillNames.ai || 'AI 應用',
                    angle: 90,  // 正下方
                    distance: 300,
                    color: '#06B6D4',
                    children: [
                        {
                            id: 'ai-tools',
                            name: skillNames.ai_tools || 'AI 工具',
                            angle: -30,
                            distance: 380,
                            children: [
                                { id: 'claude-code', name: skillNames.claude_code || 'Claude Code', level: 9, angle: -32, distance: 125 },
                                { id: 'codex', name: skillNames.codex || 'Codex', level: 8, angle: 0, distance: 120 },
                                { id: 'gemini', name: skillNames.gemini || 'Gemini', level: 5, angle: 32, distance: 125 }
                            ]
                        },
                        {
                            id: 'ai-gen',
                            name: skillNames.ai_gen || '生成式 AI',
                            angle: -13,
                            distance: 200,
                            children: [
                                { id: 'image-gen', name: skillNames.image_gen || '圖片生成', level: 6, angle: -32, distance: 125 },
                                { id: 'video-gen', name: skillNames.video_gen || '影片生成', level: 5, angle: 0, distance: 120 },
                                { id: 'music-gen', name: skillNames.music_gen || '音樂生成', level: 5, angle: 32, distance: 125 }
                            ]
                        },
                        {
                            id: 'ai-rag',
                            name: skillNames.ai_rag || '檢索 / RAG',
                            angle: 13,
                            distance: 320,
                            children: [
                                { id: 'rag', name: skillNames.rag || 'RAG', level: 8, angle: -32, distance: 125 },
                                { id: 'vector-search', name: skillNames.vector_search || '向量檢索', level: 7, angle: 0, distance: 120 },
                                { id: 'reranker', name: skillNames.reranker || 'Reranker', level: 7, angle: 32, distance: 125 }
                            ]
                        },
                        {
                            id: 'ai-agent',
                            name: skillNames.ai_agent || 'Agent / 模型',
                            angle: 39,
                            distance: 200,
                            children: [
                                { id: 'multi-agent', name: skillNames.multi_agent || 'Multi-agent', level: 7, angle: -32, distance: 125 },
                                { id: 'mcp', name: skillNames.mcp || 'MCP', level: 7, angle: 0, distance: 120 },
                                { id: 'local-model', name: skillNames.local_model || '本地模型', level: 5, angle: 32, distance: 125 }
                            ]
                        }
                    ]
                },
                {
                    id: 'personal',
                    name: skillNames.personal || '生活技能',
                    angle: -150,  // 左上方 (-150 = 210 - 360)
                    distance: 300,
                    color: '#EF4444',
                    children: [
                        {
                            id: 'personal-hobbies',
                            name: skillNames.personal_hobbies || '興趣專長',
                            angle: -30,  // 相對於父節點，朝左上
                            distance: 180,
                            children: [
                                { id: 'boardgame', name: skillNames.boardgame || '桌遊大師', level: 10, angle: -45, distance: 120 },
                                { id: 'camping', name: skillNames.camping_manager || '露營管理員', level: 10, angle: -15, distance: 120 },
                                { id: 'handyman', name: skillNames.handyman || '水電工', level: 6, angle: 15, distance: 120 },
                                { id: 'writer', name: skillNames.writer || '小說創作者', level: 3, angle: 45, distance: 120 }
                            ]
                        },
                        {
                            id: 'personal-skills',
                            name: skillNames.personal_skills || '專業技能',
                            angle: 30,  // 朝右上
                            distance: 180,
                            children: [
                                { id: 'customer-service', name: skillNames.customer_service || '客服技術', level: 8, angle: -30, distance: 120 },
                                { id: 'teamwork', name: skillNames.teamwork || '團隊合作', level: 9, angle: 0, distance: 120 },
                                { id: 'problem-solving', name: skillNames.problem_solving || '問題解決', level: 9, angle: 30, distance: 120 }
                            ]
                        },
                        {
                            id: 'personal-creative',
                            name: skillNames.personal_creative || '創作',
                            angle: 0,  // 直上
                            distance: 150,
                            level: 5,
                            skillName: skillNames.game_reviewer || '遊戲評論家'
                        }
                    ]
                }
            ]
        };
    }
    
    // 計算節點的實際位置
    calculateNodePositions(node, parentX = null, parentY = null, parentAngle = 0, depth = 0) {
        // 防止無限遞迴 - 限制最大深度
        if (depth > 10) {
            console.error('⚠️ calculateNodePositions: 超過最大深度限制', depth, node);
            return;
        }

        // 檢查節點是否有效
        if (!node) {
            console.warn('⚠️ calculateNodePositions: node is null/undefined');
            return;
        }

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
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                // 檢查循環引用
                if (child === node || child === node.parent) {
                    console.error('⚠️ 檢測到循環引用，跳過此節點', child.id);
                    return;
                }

                child.parent = node;
                // 傳遞當前節點的角度作為新的父角度
                const newParentAngle = depth === 0 ? node.angle : parentAngle + (node.angle || 0);
                this.calculateNodePositions(child, node.x, node.y, newParentAngle, depth + 1);
            });
        }
    }
    
    // 計算分支總等級
    calculateBranchLevels(node, depth = 0) {
        // 防止無限遞迴
        if (depth > 15) {
            console.error('⚠️ calculateBranchLevels: 超過最大深度限制');
            return 0;
        }

        // 檢查節點是否有效
        if (!node) {
            return 0;
        }

        let totalLevel = node.level || 0;

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                // 檢查循環引用
                if (child === node || child === node.parent) {
                    console.error('⚠️ calculateBranchLevels: 檢測到循環引用');
                    return;
                }
                totalLevel += this.calculateBranchLevels(child, depth + 1);
            });
        }

        if (node.depth === 1) { // 主分支節點
            node.totalLevel = totalLevel;
        }

        return totalLevel;
    }
    
    updateNavButtonLevels() {
        // 注意：節點位置已在 initializeWhenReady() 中計算，不需要重複計算
        // this.calculateNodePositions(this.skillTree);  // ← 已移除，避免重複計算

        // 計算各分支總等級
        if (this.skillTree && this.skillTree.children) {
            this.skillTree.children.forEach(branch => {
                this.calculateBranchLevels(branch);
            });
        }
    }
    
    // 繪製動畫背景
    drawAnimatedBackground() {
        // 嚴格驗證 canvas 尺寸 - 必須是有限的正數
        const width = this.canvas.width;
        const height = this.canvas.height;

        if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
            // Canvas 尺寸無效，直接返回不繪製背景
            return;
        }

        // 驗證 animationTime
        if (this.animationTime === undefined || this.animationTime === null || !isFinite(this.animationTime)) {
            // 初始化為 0
            this.animationTime = 0;
        }

        // 計算中心點和最大維度
        const centerX = width / 2;
        const centerY = height / 2;
        const maxDimension = Math.max(width, height) / 2;

        this.ctx.save();

        // 1. 基礎漸變背景
        const baseGradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, maxDimension
        );
        baseGradient.addColorStop(0, 'rgba(15, 23, 42, 0.15)');
        baseGradient.addColorStop(0.4, 'rgba(30, 41, 59, 0.08)');
        baseGradient.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
        this.ctx.fillStyle = baseGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. 動態光環效果 (使用已聲明的 centerX, centerY)

        // 外層光環
        const outerRadius = 300 + Math.sin(this.animationTime * 0.5) * 50;
        const outerGlow = this.ctx.createRadialGradient(
            centerX, centerY, outerRadius * 0.6,
            centerX, centerY, outerRadius
        );
        outerGlow.addColorStop(0, 'rgba(59, 130, 246, 0.03)');
        outerGlow.addColorStop(0.7, 'rgba(147, 51, 234, 0.02)');
        outerGlow.addColorStop(1, 'rgba(59, 130, 246, 0)');
        this.ctx.fillStyle = outerGlow;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 中層光環
        const middleRadius = 200 + Math.sin(this.animationTime * 0.8) * 30;
        const middleGlow = this.ctx.createRadialGradient(
            centerX, centerY, middleRadius * 0.3,
            centerX, centerY, middleRadius
        );
        middleGlow.addColorStop(0, 'rgba(16, 185, 129, 0.04)');
        middleGlow.addColorStop(0.6, 'rgba(245, 158, 11, 0.02)');
        middleGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
        this.ctx.fillStyle = middleGlow;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, middleRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 3. 旋轉的粒子效果
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2 + this.animationTime * 0.3;
            const distance = 150 + Math.sin(this.animationTime * 0.7 + i) * 20;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            
            const size = 3 + Math.sin(this.animationTime * 1.2 + i) * 1;
            const opacity = 0.1 + Math.sin(this.animationTime * 0.9 + i) * 0.05;
            
            // 粒子光暈
            const particleGlow = this.ctx.createRadialGradient(x, y, 0, x, y, size * 8);
            particleGlow.addColorStop(0, `rgba(139, 92, 246, ${opacity})`);
            particleGlow.addColorStop(1, 'rgba(139, 92, 246, 0)');
            this.ctx.fillStyle = particleGlow;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size * 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 4. 脈衝波效果
        const pulseRadius = 80 + Math.sin(this.animationTime * 2) * 40;
        const pulseGradient = this.ctx.createRadialGradient(
            centerX, centerY, pulseRadius * 0.7,
            centerX, centerY, pulseRadius
        );
        pulseGradient.addColorStop(0, 'rgba(255, 215, 0, 0.05)');
        pulseGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        this.ctx.fillStyle = pulseGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawFullSkillTree() {
        if (!this.canvas || !this.ctx) return;

        // 安全檢查：確保技能樹已初始化,否則不繼續
        if (!this.skillTree) {
            // skillTree 未初始化，停止繪製循環
            // 初始化完成後會從 init() 方法中重新啟動
            return;
        }

        // 獲取 Canvas 尺寸並驗證
        const newWidth = this.canvas.offsetWidth;
        const newHeight = this.canvas.offsetHeight;

        // 如果尺寸無效（0 或 NaN），停止繪製
        if (!newWidth || !newHeight || newWidth <= 0 || newHeight <= 0) {
            console.warn('⚠️ Canvas 尺寸無效，停止繪製:', { width: newWidth, height: newHeight });
            return;
        }

        this.canvas.width = newWidth;
        this.canvas.height = newHeight;

        const baseScale = Math.min(this.canvas.width / this.canvasWidth,
            this.canvas.height / this.canvasHeight) * 0.8;
        const scale = baseScale * this.zoomLevel;

        // 清空畫布並設置背景
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製酷炫的動畫背景 (用 try-catch 保護以防錯誤)
        try {
            this.drawAnimatedBackground();
        } catch (error) {
            console.error('⚠️ drawAnimatedBackground 錯誤:', error);
        }

        this.ctx.save();

        // 應用變換
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(scale, scale);
        this.ctx.translate(this.cameraOffset.x, this.cameraOffset.y);
        this.ctx.translate(-this.canvasWidth / 2, -this.canvasHeight / 2);

        // 先繪製所有連線
        this.drawConnections(this.skillTree);

        // 再繪製所有節點
        this.drawNodes(this.skillTree);

        this.ctx.restore();

        // 更新動畫
        this.animationTime += 0.016;
        requestAnimationFrame(() => this.drawFullSkillTree());
    }
    
    drawConnections(node, depth = 0) {
        // 防止無限遞迴
        if (depth > 10) {
            console.error('⚠️ drawConnections: 超過最大深度限制');
            return;
        }

        // 安全檢查：確保 node 存在
        if (!node) {
            console.warn('⚠️ drawConnections: node is undefined');
            return;
        }

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                // 檢查循環引用
                if (child === node || child === node.parent) {
                    console.error('⚠️ drawConnections: 檢測到循環引用');
                    return;
                }

                // 繪製到子節點的連線
                const gradient = this.ctx.createLinearGradient(
                    node.x, node.y, child.x, child.y
                );

                // 根節點使用金色，其他使用分類顏色
                const parentColor = node.isRoot ? '#ffd700' : (node.color || this.getCategoryColor(node) || '#64748b');
                const childColor = child.color || this.getCategoryColor(child) || parentColor;

                gradient.addColorStop(0, parentColor + 'CC');
                gradient.addColorStop(1, childColor + 'CC');

                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = Math.max(3, 8 - child.depth * 1.5);
                this.ctx.lineCap = 'round';
                this.ctx.shadowColor = parentColor;
                this.ctx.shadowBlur = 5;

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
                this.ctx.shadowBlur = 0;

                // 遞歸繪製子連線
                this.drawConnections(child, depth + 1);
            });
        }
    }
    
    drawNodes(node, depth = 0) {
        // 防止無限遞迴
        if (depth > 10) {
            console.error('⚠️ drawNodes: 超過最大深度限制');
            return;
        }

        // 安全檢查：確保 node 存在
        if (!node) {
            console.warn('⚠️ drawNodes: node is undefined');
            return;
        }

        // 繪製節點
        if (node.isRoot) {
            this.drawRootNode(node);
        } else {
            this.drawSkillNode(node);
        }

        // 遞歸繪製子節點
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                // 檢查循環引用
                if (child === node || child === node.parent) {
                    console.error('⚠️ drawNodes: 檢測到循環引用');
                    return;
                }
                this.drawNodes(child, depth + 1);
            });
        }
    }
    
    drawRootNode(node) {
        const radius = 60;
        
        // 動畫光暈 - 多層次效果
        const pulseRadius = radius + 30 + Math.sin(this.animationTime * 2) * 10;
        const outerPulseRadius = radius + 50 + Math.sin(this.animationTime * 1.5) * 15;
        
        // 外層光暈
        const outerGradient = this.ctx.createRadialGradient(
            node.x, node.y, 0, node.x, node.y, outerPulseRadius
        );
        outerGradient.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
        outerGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.1)');
        outerGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        
        this.ctx.fillStyle = outerGradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, outerPulseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 內層光暈
        const gradient = this.ctx.createRadialGradient(
            node.x, node.y, 0, node.x, node.y, pulseRadius
        );
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
        gradient.addColorStop(0.7, 'rgba(255, 215, 0, 0.2)');
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
        
        // 發光效果 - 雙層光暈
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 30;
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 第二層光暈
        this.ctx.shadowBlur = 15;
        this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
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
        const radius = this.calculateNodeRadius(node);
        const isHovered = this.hoveredNode === node;
        const isSelected = this.selectedNode === node;
        
        // 計算節點顏色 - 使用分類顏色
        let nodeColor = node.color || this.getCategoryColor(node) || '#64748b';
        
        // 根據等級調整亮度
        if (node.level !== undefined) {
            const brightness = node.level >= 8 ? 1.2 : node.level >= 5 ? 1.0 : 0.8;
            nodeColor = this.adjustColorBrightness(nodeColor, brightness);
        }
        
        // 懸停或選中效果 - 加強版，根據節點大小調整光暈
        if (isHovered || isSelected) {
            // 根據節點半徑調整光暈大小
            const glowScale = Math.max(1.0, radius / 25); // 最小1倍，隨半徑增長
            
            // 外層大光暈
            const outerGlowRadius = radius + (30 * glowScale);
            const outerGlowGradient = this.ctx.createRadialGradient(
                node.x, node.y, radius, node.x, node.y, outerGlowRadius
            );
            outerGlowGradient.addColorStop(0, nodeColor + '30');
            outerGlowGradient.addColorStop(0.5, nodeColor + '15');
            outerGlowGradient.addColorStop(1, nodeColor + '00');
            
            this.ctx.fillStyle = outerGlowGradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, outerGlowRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 內層光暈
            const glowRadius = radius + (15 * glowScale);
            const glowGradient = this.ctx.createRadialGradient(
                node.x, node.y, radius, node.x, node.y, glowRadius
            );
            glowGradient.addColorStop(0, nodeColor + '80');
            glowGradient.addColorStop(0.7, nodeColor + '40');
            glowGradient.addColorStop(1, nodeColor + '00');
            
            this.ctx.fillStyle = glowGradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 脈動效果 - 大節點脈動更明顯
            const pulseIntensity = Math.min(0.08, 0.03 + (glowScale - 1) * 0.02);
            const pulseScale = 1 + Math.sin(this.animationTime * 3) * pulseIntensity;
            this.ctx.save();
            this.ctx.translate(node.x, node.y);
            this.ctx.scale(pulseScale, pulseScale);
            this.ctx.translate(-node.x, -node.y);
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
        
        // 邊框 - 雙層效果
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 外層邊框光暈
        if (isHovered || isSelected) {
            this.ctx.strokeStyle = nodeColor;
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = nodeColor;
            this.ctx.shadowBlur = 10;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 2, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
            
            // 恢復變換狀態
            this.ctx.restore();
        }
        
        // 文字設置
        this.ctx.fillStyle = '#ffffff';
        
        // 根據節點大小和深度動態計算字體大小
        const baseFontSize = Math.min(14, Math.max(8, radius / 3));
        const depthAdjustment = node.depth === 1 ? 0 : node.depth === 2 ? -1 : -2;
        const fontSize = baseFontSize + depthAdjustment;
        
        this.ctx.font = `bold ${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // 智能分行處理
        const displayName = node.skillName || node.name;
        
        // 根據節點半徑計算最大寬度，確保文字在圓內
        const padding = 5; // 內邊距
        const maxWidth = (radius - padding) * 2 * 0.8; // 使用直徑的80%
        
        // 使用智能斷行
        let lines = this.smartWrapText(displayName, maxWidth);
        
        // 根據可用空間限制行數
        const maxLines = Math.floor((radius * 1.4) / (fontSize + 2));
        
        // 如果行數太多，嘗試減小字體
        if (lines.length > maxLines && fontSize > 8) {
            this.ctx.font = `bold ${fontSize - 2}px Arial`;
            lines = this.smartWrapText(displayName, maxWidth);
        }
        
        // 仍然太多行的話，截斷
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            if (lines[maxLines - 1].length > 3) {
                lines[maxLines - 1] = lines[maxLines - 1].substring(0, lines[maxLines - 1].length - 3) + '...';
            }
        }
        
        // 繪製文字
        const lineHeight = fontSize + 2;
        const totalHeight = lines.length * lineHeight;
        
        // 確保文字垂直居中且在圓圈內
        const textAreaHeight = radius * 1.2; // 可用高度為半徑的1.2倍
        const startY = -Math.min(totalHeight, textAreaHeight) / 2;
        
        lines.forEach((text, index) => {
            const y = node.y + startY + index * lineHeight + lineHeight/2;
            
            // 最後檢查：確保每行文字真的不超出寬度
            let finalText = text;
            const actualWidth = this.ctx.measureText(finalText).width;
            
            // 如果還是太寬，強制截斷
            if (actualWidth > maxWidth) {
                const charWidth = actualWidth / finalText.length;
                const maxChars = Math.floor(maxWidth / charWidth);
                if (maxChars > 3) {
                    finalText = finalText.substring(0, maxChars - 3) + '...';
                } else {
                    finalText = finalText.substring(0, maxChars);
                }
            }
            
            this.ctx.fillText(finalText, node.x, y);
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
            this.ctx.fillText(`Lv.${node.totalLevel}`, node.x, node.y + radius + 25);
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
    
    // 限制相機偏移範圍，防止用戶滑動到空白區域
    // 固定的邊界，不受縮放影響
    clampCameraOffset(offset, axis) {
        // 計算技能樹的實際邊界（固定值）
        const margin = 200; // 在技能樹周圍保留的邊距
        
        // 最外層節點的大致位置
        const maxDistance = 250 + 180 + 120; // 主分支 + 子分支 + 葉子節點距離
        const boundary = maxDistance + margin; // 固定邊界，不隨縮放改變
        
        // 直接使用固定邊界值
        return Math.max(-boundary, Math.min(boundary, offset));
    }
    
    // 調整顏色亮度
    adjustColorBrightness(color, brightness) {
        const hex = color.replace('#', '');
        const r = Math.min(255, Math.floor(parseInt(hex.substring(0, 2), 16) * brightness));
        const g = Math.min(255, Math.floor(parseInt(hex.substring(2, 4), 16) * brightness));
        const b = Math.min(255, Math.floor(parseInt(hex.substring(4, 6), 16) * brightness));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // 計算節點半徑，根據深度和技能等級
    calculateNodeRadius(node) {
        if (node.isRoot) return 60;
        
        // 計算基礎半徑，根據深度調整
        let baseRadius = 25;
        baseRadius += (node.depth === 1 ? 15 : 0) - (node.depth * 2);
        
        // 根據技能等級動態調整半徑
        let levelMultiplier = 1.0;
        if (node.level !== undefined && node.level !== null) {
            // 等級 1-3: 0.8x (小型)
            // 等級 4-6: 1.0x (中型)
            // 等級 7-9: 1.3x (大型)
            // 等級 10: 1.5x (超大型)
            if (node.level <= 3) {
                levelMultiplier = 0.8;
            } else if (node.level <= 6) {
                levelMultiplier = 1.0;
            } else if (node.level <= 9) {
                levelMultiplier = 1.3;
            } else {
                levelMultiplier = 1.5;
            }
        } else {
            // 沒有等級的節點使用較大尺寸（通常是分類節點）
            levelMultiplier = 1.5;
        }
        
        return baseRadius * levelMultiplier;
    }
    
    // 智能文字換行
    smartWrapText(text, maxWidth) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = '';
        
        // 處理中文和英文混合
        if (text.match(/[\u4e00-\u9fa5]/)) {
            // 包含中文，按字符分割
            const chars = text.split('');
            let line = '';
            
            for (let char of chars) {
                const testLine = line + char;
                const metrics = this.ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && line.length > 0) {
                    lines.push(line);
                    line = char;
                } else {
                    line = testLine;
                }
            }
            
            if (line) lines.push(line);
        } else {
            // 純英文，按單詞分割
            for (let word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const metrics = this.ctx.measureText(testLine);

                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                // 檢查最後一行是否太長，如果太長則按字符分割
                const finalMetrics = this.ctx.measureText(currentLine);
                if (finalMetrics.width > maxWidth) {
                    // 單詞太長，需要按字符分割
                    const chars = currentLine.split('');
                    let line = '';
                    for (let char of chars) {
                        const testLine = line + char;
                        const charMetrics = this.ctx.measureText(testLine);
                        if (charMetrics.width > maxWidth && line.length > 0) {
                            lines.push(line);
                            line = char;
                        } else {
                            line = testLine;
                        }
                    }
                    if (line) lines.push(line);
                } else {
                    lines.push(currentLine);
                }
            }
        }
        
        return lines;
    }
    
    findNodeAtPosition(node, x, y, depth = 0) {
        // 防止無限遞迴
        if (depth > 10) {
            console.error('⚠️ findNodeAtPosition: 超過最大深度限制');
            return null;
        }

        // 安全檢查：確保 node 存在
        if (!node) {
            return null;
        }

        const radius = this.calculateNodeRadius(node);
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));

        if (distance <= radius) {
            return node;
        }

        if (node.children && Array.isArray(node.children)) {
            for (let child of node.children) {
                // 檢查循環引用
                if (child === node || child === node.parent) {
                    console.error('⚠️ findNodeAtPosition: 檢測到循環引用');
                    continue;
                }

                const found = this.findNodeAtPosition(child, x, y, depth + 1);
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
            
            // 根據縮放級別調整拖曳靈敏度，增加基礎敏感度
            const baseDragSensitivity = 3.0; // 基礎靈敏度提升3倍
            const dragSensitivity = baseDragSensitivity / this.zoomLevel;
            
            const newOffsetX = this.cameraOffset.x + deltaX * dragSensitivity;
            const newOffsetY = this.cameraOffset.y + deltaY * dragSensitivity;
            
            // 應用邊界限制
            this.cameraOffset.x = this.clampCameraOffset(newOffsetX, 'x');
            this.cameraOffset.y = this.clampCameraOffset(newOffsetY, 'y');
            
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
            const zoomSensitivity = 0.2;
            
            // 使用指數縮放獲得更自然的體驗
            const scaleFactor = e.deltaY > 0 ? 0.95 : 1.05;
            const zoomMultiplier = Math.pow(scaleFactor, Math.abs(e.deltaY) * zoomSensitivity);
            
            // 計算新的縮放級別
            const newZoom = Math.max(this.minZoom, 
                Math.min(this.maxZoom, this.zoomLevel * zoomMultiplier));
            
            // 以滑鼠位置為中心進行縮放
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - this.canvas.width / 2;
            const mouseY = e.clientY - rect.top - this.canvas.height / 2;
            
            const zoomRatio = newZoom / this.zoomLevel;
            
            // 調整相機偏移以保持滑鼠位置不變
            this.cameraOffset.x = mouseX + (this.cameraOffset.x - mouseX) * zoomRatio;
            this.cameraOffset.y = mouseY + (this.cameraOffset.y - mouseY) * zoomRatio;
            
            this.zoomLevel = newZoom;
            
            // 縮放後重新檢查邊界限制
            this.cameraOffset.x = this.clampCameraOffset(this.cameraOffset.x, 'x');
            this.cameraOffset.y = this.clampCameraOffset(this.cameraOffset.y, 'y');
        } else {
            // 一般滾輪 = 平移
            const sensitivity = 2 / this.zoomLevel; // 根據縮放調整靈敏度
            if (e.shiftKey) {
                const newOffsetX = this.cameraOffset.x - e.deltaY * sensitivity;
                this.cameraOffset.x = this.clampCameraOffset(newOffsetX, 'x');
            } else {
                const newOffsetY = this.cameraOffset.y - e.deltaY * sensitivity;
                this.cameraOffset.y = this.clampCameraOffset(newOffsetY, 'y');
            }
            
            if (e.deltaX !== 0) {
                const newOffsetX = this.cameraOffset.x - e.deltaX * sensitivity;
                this.cameraOffset.x = this.clampCameraOffset(newOffsetX, 'x');
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
        const levelBar = document.querySelector('.skill-level-bar');
        
        const displayName = node.skillName || node.name;
        
        if (skillName) skillName.textContent = displayName;
        
        // 處理等級顯示
        if (node.level !== undefined && node.level !== null) {
            // 有等級的節點，顯示進度條
            if (levelBar) levelBar.style.display = 'block';
            if (skillProgress && levelText) {
                const level = node.level;
                skillProgress.style.width = `${level * 10}%`;
                levelText.textContent = `Level ${level}`;
            }
        } else {
            // 沒有等級的節點，隱藏進度條
            if (levelBar) levelBar.style.display = 'none';
        }
        
        if (skillDescription) {
            const descriptions = this.getSkillDescriptions();
            const skillNames = this.getSkillNames();
            let description = '';

            // 特殊映射：處理 ID 和翻譯 key 不一致的情況
            const idMapping = {
                'backend-node': 'nodejs',
                'backend-db': node.skillName ? node.skillName.toLowerCase() : null,
                'contract-deploy': 'contract_deployment',
                'camping': 'camping_manager',
                'devops-iac': 'devops_infrastructure'
            };

            // 1. 優先檢查特殊映射
            if (idMapping[node.id] && descriptions[idMapping[node.id]]) {
                description = descriptions[idMapping[node.id]];
            }
            // 2. 使用節點 ID 直接查找
            else if (descriptions[node.id]) {
                description = descriptions[node.id];
            }
            // 3. 將連字號轉換為底線後查找
            else if (node.id && descriptions[node.id.replace(/-/g, '_')]) {
                description = descriptions[node.id.replace(/-/g, '_')];
            }
            // 4. 使用 skillName 查找（轉換為小寫）
            else if (node.skillName) {
                const skillNameKey = node.skillName.toLowerCase();
                if (descriptions[skillNameKey]) {
                    description = descriptions[skillNameKey];
                }
            }
            // 5. 使用節點 name 查找（轉換為小寫並移除空格）
            else if (node.name) {
                const nameKey = node.name.toLowerCase().replace(/\s+/g, '_');
                if (descriptions[nameKey]) {
                    description = descriptions[nameKey];
                }
            }
            // 6. 都找不到的話，使用預設描述
            if (!description) {
                if (node.isRoot) {
                    description = descriptions.root || '技能樹的核心，所有技能都從這裡發散出去。';
                } else if (node.depth === 1) {
                    description = `${displayName}分支，包含了多項相關技能。`;
                } else if (node.children) {
                    description = `${displayName}類別，包含多個子技能。`;
                } else {
                    const levelDesc = node.level >= 8 ? '精通' :
                                     node.level >= 5 ? '熟練' : '學習中';
                    description = `${displayName} - ${levelDesc}階段，正在努力精進中！`;
                }
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
            <span class="points-label" data-i18n="skills.remaining_points">剩餘點數</span>
            <span class="points-value">??</span>
        `;

        // 應用 i18n 翻譯
        if (window.I18nManager) {
            window.I18nManager.updatePageTranslations();
        }
    }
    
    init() {
        if (!this.canvas) return;

        // 注意：節點位置已在 initializeWhenReady() 中計算，此處不需要重複計算
        // this.calculateNodePositions(this.skillTree);  // ← 已移除重複調用

        // 更新導航按鈕等級（內部會再次計算位置以確保正確性）
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