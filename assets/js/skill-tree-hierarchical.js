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
        this.zoomLevel = 5.0; // 預設更近的視角，讓小節點內容更清楚
        this.minZoom = 0.5;
        this.maxZoom = 8.0; // 提高最大縮放倍率
        
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
    
    // 取得分類對應的顏色
    getCategoryColor(node) {
        // 根據節點 ID 或其父節點判斷所屬分類
        const categoryColors = {
            'frontend': '#3B82F6',      // 鮮豔藍色
            'backend': '#10B981',       // 鮮豔綠色
            'devops': '#F59E0B',        // 鮮豔橘色
            'blockchain': '#8B5CF6',    // 鮮豔紫色
            'personal': '#EF4444'       // 鮮豔紅色
        };
        
        // 尋找主分類
        let currentNode = node;
        while (currentNode && !categoryColors[currentNode.id]) {
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
        return {
            // 根節點
            'root': '全端工程師一枚，上至前端特效、下至資料庫優化，左能寫智能合約、右能修水電，基本上就是個科技界的瑞士刀！',
            
            // 主分支
            'frontend': '前端技術大本營，專門負責讓網頁變得漂亮又好用。從手刻 HTML 到玩轉各種框架，只要是能讓用戶眼睛一亮的東西，這裡都有！',
            'backend': '後端技術指揮中心，掌管著所有數據的生死大權。Ruby on Rails 是主力輸出，偶爾使用 Elixir 放大絕，讓伺服器不只穩定，還要飛快！',
            'devops': 'DevOps 武器庫，專門負責讓程式碼從本地飛到雲端。Git 是基本功，AWS 是主戰場，自動化部署更是拿手絕活，讓上線如呼吸般自然！',
            'blockchain': '區塊鏈冒險地圖，探索 Web3 新世界的必備技能。從寫智能合約到建 DApp，雖然還在學習中，但已經能讓代幣在鏈上飛來飛去了！',
            'personal': '生活技能大雜燴，證明人生不只有寫程式！教桌遊、管露營、修水電、寫小說，基本上就是個生活駭客，什麼都會一點！',
            
            // 前端技能
            'html': 'HTML 老大哥，網頁世界的地基。雖然看似簡單，但沒有它什麼都不用玩。精通到連 <marquee> 都會用（但我不會用的）！',
            'css': 'CSS 美容師，負責讓網頁從素顏路人變成時尚超模。Flexbox 和 Grid 是左右護法，動畫特效是絕招，但永遠不寫 !important！',
            'javascript': 'JavaScript 萬能戰士，前端後端都能打。非同步編程是基本功，Promise 和 async/await 是好朋友，還能跟 this 和平相處！',
            'tailwind': 'Tailwind CSS 快速時裝師，用 class 名稱就能搭配出美麗的 UI。雖然 HTML 會變得有點長，但開發速度飆升是真的！',
            'bootstrap': 'Bootstrap 老牌框架，雖然有點年紀了，但在快速原型開發時還是很給力。格線系統和元件庫一應俱全！',
            'react': 'React 新潮框架，寫起來像在組樂高。雖然 Hooks 有時會讓人頭痛，但元件化開發的爽快感無可取代！',
            'jquery': 'jQuery 老朋友，雖然現在不太流行了，但在處理舊專案時還是得靠它。$ 符號一出，誰與爭鋒（在 2010 年）！',
            'stimulus': 'Stimulus 輕量級框架，Rails 的好搭檔。不用 Virtual DOM，直接操作真實 DOM，簡單暴力但有效！',
            'hotwire': 'Hotwire 熱線技術，讓伺服器端渲染也能飛快。Turbo 和 Stimulus 雙劍合璧，讓 Rails 開發者不用寫太多 JavaScript！',
            
            // 後端技能
            'ruby': 'Ruby 紅寶石語言，優雅到讓人愛不釋手。寫起來像在寫詩，讀起來像在看英文，開發者的快樂就是這麼簡單！',
            'rails': 'Rails 魔法框架，讓網站開發像飛一樣。Convention over Configuration 是信條，一行指令就能生成一堆東西！',
            'nodejs': 'Node.js JavaScript 後端大將，讓 JS 工程師不用學新語言就能寫後端。非同步 I/O 是特色，npm 套件海是寶庫！',
            'elixir': 'Elixir 長生不老藥，讓伺服器永不宕機。函數式編程是特色，並行處理是強項，雖然學習曲線有點陡！',
            'phoenix': 'Phoenix 火鳳凰框架，Elixir 的最佳搭檔。實時功能超強大，效能高到嚇嚇叫，讓 Rails 開發者也能輕鬆上手！',
            'postgresql': 'PostgreSQL 資料庫王者，功能強大到有點過分。不只是資料庫，還能當 NoSQL、全文搜尋、地理資訊系統！',
            'mvc': 'MVC 架構大師，把程式碼整理得井井有條。Model-View-Controller 三位一體，讓維護與擴充都輕鬆寫意！',
            'api': 'API 開發專家，讓不同系統能夠愛的抱抱。RESTful 是基本款，GraphQL 是進階版，文件寫得清楚才是王道！',
            
            // DevOps 技能
            'git': 'Git 版本控制大神，救了無數開發者的命。commit、push、pull 是基本功，rebase 和 cherry-pick 是進階技，但永遠不要 force push 到 main！',
            'github': 'GitHub 程式碼社交平台，開源世界的中心。Pull Request 是日常，Issue 是溝通管道，綠色方格是成就感的來源！',
            'aws': 'AWS 雲端帝國，服務多到數不清。EC2 是基本款，S3 是儲存庫，Lambda 是新玩具，但帳單要小心看！',
            'aws-glue': 'AWS Glue 數據魔術師，把雜亂的數據變整齊。ETL 是拿手絕活，爬資料是基本功，讓大數據分析變得簡單！',
            'terraform': 'Terraform 基礎設施魔法棒，用程式碼建造雲端世界。Infrastructure as Code 是理念，一鍵部署是目標！',
            'ansible': 'Ansible 自動化管家，讓伺服器管理不再頭痛。Playbook 是劇本，YAML 是語言，但空格與 Tab 的戰爭永不停歇！',
            'github-actions': 'GitHub Actions CI/CD 超人，讓測試與部署全自動。每次 push 都是一次冒險，綠色勾勾是最美的風景！',
            '自動化部署': '自動化部署專家，讓上線不再是惡夢。一鍵部署是基本，零停機更新是追求，半夜不用起來改 bug 真好！',
            
            // 區塊鏈技能
            'solidity': 'Solidity 智能合約語言，讓程式碼變成法律。寫起來要小心翼翼，因為 bug 可能值幾百萬，但成就感也是滿滿！',
            '合約部署': '合約部署專家，讓程式碼在區塊鏈上永生。Gas fee 要算好，測試網先跑過，主網部署才不會心痛！',
            'ethers': 'ethers.js Web3 工具箱，讓 JavaScript 也能玩轉區塊鏈。連接錢包、呼叫合約都簡單，但要小心用戶拒絕交易！',
            'hardhat': 'Hardhat 區塊鏈開發瑞士刀，測試、部署、除錯一手包。本地網路超方便，模擬測試超完整，讓合約開發不再是惡夢！',
            'ipfs': 'IPFS 星際檔案系統，讓資料在全宇宙漫遊。去中心化儲存是特色，但速度有時讓人想哭！',
            'token': 'Token 開發專家，讓你也能發行自己的代幣。ERC-20 是基本款，ERC-721 是 NFT，但別真的拿去割韭菜！',
            'dao': 'DAO 開發者，建造去中心化的烏托邦。投票機制是核心，治理代幣是工具，讓社群自己管理自己！',
            'dex': 'DEX 開發初學者，挑戰去中心化交易所。流動性池是關鍵，滑點計算要精準，別讓用戶的錢憂在裡面！',
            
            // 生活技能
            'boardgame': '桌遊教學達人，把遊戲規則說得比程式邏輯還清楚。從簡單的 UNO 到複雜的大富翁，沒有我教不會的，只有你想不想學！',
            '露營管理員': '露營區管理高手，讓大自然與人類和平共處。搭帳篷、生營火、看星星都是基本功，半夜趕走野豬才是真功夫！',
            '客服之神': '客服應對大師，把奧客變成好朋友。耐心是基本功，微笑是必殺技，即使客戶問「為什麼電腦不能喝水」也能淡定回答！',
            '水電工': '水電維修小能手，家裡壞了什麼都能修。換燈泡、修水管、通馬桶都是小 case，但別跟我說電腦也算水電！',
            '遊戲評論家': '遊戲評論作家，用鍵盤敲出遊戲世界的真相。從畫面到劇情，從音效到手感，每個細節都不放過，但最常說的還是「這遊戲真香」！',
            '小說創作者': '業餘小說家，用文字編織奇幻世界。雖然還在練習中，但已經能把 bug 寫成特色，把程式碼寫成詩！',
            '團隊合作': '團隊合作達人，讓 1+1 > 2 不是夢想。溝通是橋樑，理解是基礎，即使隊友寫出詭異的 code 也能微笑以對！',
            '問題解決': '問題解決專家，沒有 bug 是我找不出來的。Stack Overflow 是好朋友，console.log 是必殺技，但最強的還是「重開機試試看」！',
            
            // 分類節點
            'frontend-basic': '基礎技術的大本營，前端世界的入門票。HTML、CSS、JavaScript 三劍客，一個都不能少！',
            'frontend-frameworks': '框架工具大集合，讓開發速度飛升。React 與 jQuery 雙雄並立，各有各的擁護者！',
            'frontend-css': 'CSS 框架雙傑，Tailwind 與 Bootstrap 各擅勝場。一個是快速時尚，一個是經典永恆！',
            'frontend-rails': 'Rails 前端組合技，Stimulus 與 Hotwire 雙劍合璧。讓 Rails 開發者不用學太多 JavaScript！',
            'backend-ruby': 'Ruby 生態系的巨頭，Ruby 與 Rails 黃金組合。優雅的語言配上魔法框架，開發效率無人能敵！',
            'backend-elixir': 'Elixir 生態系，高並發的秘密武器。Elixir 與 Phoenix 攼守兼備，讓伺服器永不倒下！',
            'backend-architecture': '架構設計中心，MVC 與 API 雙管齊下。一個管理程式架構，一個負責對外溝通！',
            'devops-vcs': '版本控制雙人組，Git 與 GitHub 形影不離。一個是技術，一個是平台，讓程式碼協作更順暢！',
            'devops-cloud': '雲端服務大本營，AWS 系列服務一應俱全。從基礎設施到數據處理，全部都在雲端搮定！',
            'devops-iac': '基礎設施即代碼，Terraform 與 Ansible 雙巨頭。一個負責建設，一個負責管理，讓雲端也能版本控制！',
            'devops-cicd': 'CI/CD 專門區，目前只有 GitHub Actions 一位大將。但一個就夠了，因為它太強大！',
            'blockchain-core': '智能合約核心區，Solidity 與部署技術雙劍合璧。寫得好還不夠，部署得對才是真功夫！',
            'blockchain-tools': 'Web3 工具箱，各種必備工具一應俱全。從前端互動到開發測試，還有去中心化儲存！',
            'blockchain-dapp': 'DApp 開發大本營，各種區塊鏈應用都在這。Token、DAO、DEX 一字排開，都是去中心化的未來！',
            'personal-hobbies': '興趣專長大集合，從桌遊到露營，從修水電到寫小說。人生不只有程式碼，還有更多樂趣！',
            'personal-skills': '專業技能三巨頭，客服、團隊、解決問題。軟實力也是實力，有時候比硬技能更重要！',
            'personal-creative': '創作魂燃燒中，遊戲評論家獨挑大樑。用文字記錄遊戲世界，讓更多人知道好遊戲！'
        };
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
                    color: '#3B82F6',
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
                            angle: 60,  // 兩點鐘方向
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
                    color: '#10B981',
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
                    color: '#F59E0B',
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
                    color: '#8B5CF6',
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
                            angle: 45,  // 朝右下
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
                    color: '#EF4444',
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
        
        // 清空畫布並設置背景
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 添加微妙的背景漸層效果
        this.ctx.save();
        const bgGradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) / 2
        );
        bgGradient.addColorStop(0, 'rgba(15, 23, 42, 0.05)');
        bgGradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
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
        const baseRadius = 25;
        const radius = baseRadius + (node.depth === 1 ? 15 : 0) - (node.depth * 2);
        const isHovered = this.hoveredNode === node;
        const isSelected = this.selectedNode === node;
        
        // 計算節點顏色 - 使用分類顏色
        let nodeColor = node.color || this.getCategoryColor(node) || '#64748b';
        
        // 根據等級調整亮度
        if (node.level !== undefined) {
            const brightness = node.level >= 8 ? 1.2 : node.level >= 5 ? 1.0 : 0.8;
            nodeColor = this.adjustColorBrightness(nodeColor, brightness);
        }
        
        // 懸停或選中效果 - 加強版
        if (isHovered || isSelected) {
            // 外層大光暈
            const outerGlowRadius = radius + 35;
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
            const glowRadius = radius + 20;
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
            
            // 脈動效果
            const pulseScale = 1 + Math.sin(this.animationTime * 3) * 0.05;
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
    
    // 調整顏色亮度
    adjustColorBrightness(color, brightness) {
        const hex = color.replace('#', '');
        const r = Math.min(255, Math.floor(parseInt(hex.substring(0, 2), 16) * brightness));
        const g = Math.min(255, Math.floor(parseInt(hex.substring(2, 4), 16) * brightness));
        const b = Math.min(255, Math.floor(parseInt(hex.substring(4, 6), 16) * brightness));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
            
            if (currentLine) lines.push(currentLine);
        }
        
        return lines;
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
            let description = '';
            
            // 優先使用節點 ID 查找描述
            if (descriptions[node.id]) {
                description = descriptions[node.id];
            } 
            // 如果找不到，用節點名稱查找
            else if (descriptions[node.name]) {
                description = descriptions[node.name];
            }
            // 如果是有 skillName 的節點，用 skillName 查找
            else if (node.skillName && descriptions[node.skillName]) {
                description = descriptions[node.skillName];
            }
            // 都找不到的話，使用預設描述
            else {
                if (node.isRoot) {
                    description = '技能樹的核心，所有技能都從這裡發散出去。';
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