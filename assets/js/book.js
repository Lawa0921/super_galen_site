class InteractiveBook {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 0;
        this.pages = [];
        this.isAnimating = false;
        
        this.chapters = [
            {
                title: '序章：Galen 的起源',
                content: [
                    {
                        date: '2011-2015',
                        title: '海洋休閒管理系的奇妙冒險',
                        description: '就讀國立高雄科大海洋休閒管理系，我與同學一起研究海洋生態、在衝浪板、風帆上玩耍。我帶領系啦啦隊拿下第二名，還在龍舟比賽奪冠！誰說管理海洋的人不能管理程式碼？我這時候還真不行。'
                    },
                    {
                        date: '2015-至今',
                        title: '密式旅行：從海洋運動員再到 CEO 之後成為 Bug 生產者',
                        description: '創立露營區「密式旅行」，學會了最重要的創業技能：如何在沒有網路的山上 Debug 人生。處理過無數客戶的「需求變更」（臨時要加帳篷、加人、延期、取消），這段經歷讓我深刻理解什麼叫「敏捷開發」。'
                    }
                ]
            },
            {
                title: '第一章：Hello, World!',
                content: [
                    {
                        date: '2019',
                        title: '自學日語突破 N1：自學的起點',
                        description: '一年內自學日檢突破 N1 關卡，發現學日語跟寫程式很像——都是在處理一堆看不懂的符號。漢字像變數名，助詞像運算符。這段經歷證明了我的自學能力，Google 是最好的老師！'
                    },
                    {
                        date: '2020.03-08',
                        title: 'AstroCamp：從麻瓜到魔法師',
                        description: '參加程式轉職訓練營，第一次見到 Ruby 還以為是寶石。從 "puts \'Hello World\'" 開始，到能用 Rails 搭建 GitHub Clone（是的，我們真的做了一個山寨版 GitHub）。學會了 MVC 不是便利商店，CRUD 不是一種髒話。每天 debug 到凌晨，終於理解為什麼程式設計師都有黑眼圈。'
                    }
                ]
            },
            {
                title: '第二章：菜鳥工程師的逆襲',
                content: [
                    {
                        date: '2020.08-2022.02',
                        title: 'Snapask：我的第一個 Production 產品',
                        description: '加入線上教育平台當後端工程師，用 Ruby on Rails 寫 API。學會了 cache、backgroundjob、websocket 各種從沒聽過的名詞，PostgreSQL 的 JOIN 可以寫到讓資深工程師落淚。最自豪的是把原本要跑 30 秒的 API 優化到 3 秒——原來是忘了加索引，什麼是 index？我這時才知道。'
                    },
                    {
                        date: '2021.06',
                        title: '獨立專案：終於可以說「這 Bug 不是我寫的」',
                        description: '第一次像個工程師一樣負責專案！從需求訪談（聽 PM 說故事）、系統設計（畫了一堆看起來很專業的架構圖）、到實作上線（半夜修 Bug）。學會了 Git Flow、CI/CD、還有最重要的技能——如何禮貌地告訴 PM「這個需求做不到」。'
                    }
                ]
            },
            {
                title: '第三章：Web3 的奇幻旅程',
                content: [
                    {
                        date: '2022.02-2022.04',
                        title: 'KryptoCamp：從「什麼是區塊」到「區塊鏈」',
                        description: '參加區塊鏈實戰營，終於搞懂 Gas 不是瓦斯、智能合約也不會自己談判。用 Solidity 寫出第一個智能合約。學會用 Hardhat 測試（免費讚）、IPFS 存儲（去中心化到找不到檔案在哪）、ethers.js 串接（終於不用手動輸入私鑰）。'
                    },
                    {
                        date: '2022.05-2023.02',
                        title: 'DFKRunner：讓 NFT 自己去上班',
                        description: '成為區塊鏈自由開發者，開發 DFKRunner 自動化腳本——讓 DeFi Kingdoms 的 NFT 英雄自動挖礦、釣魚、園藝。使用 Node.js + harmony-js + ethers.js，跨 DFK 和 Klaytn 鏈。最得意的成就：睡覺時 NFT 還在幫我賺錢！也學到了重要經驗——智能合約的 Bug 比一般 Bug 貴很多（真的是用錢在 Debug）。'
                    }
                ]
            },
            {
                title: '第四章：全端工程師的修煉',
                content: [
                    {
                        date: '2023.03-2024.09',
                        title: '伊格公寓：Elixir 的函數式冒險',
                        description: '加入包租代管系統公司，用 Elixir Phoenix 開發。第一次接觸函數式編程，發現「不可變」不是在說我的薪水。Actor Model 讓我理解了什麼叫「讓它 Crash」——原來程式掛掉也可以是一種設計模式！使用 LiveView 做即時互動，不用寫 JavaScript 就能做出 SPA 效果（雖然最後還是寫了很多 JS）。Terraform + Ansible 管理 AWS，學會了 IaC（Infrastructure as Code，不是 IC 設計）。'
                    },
                    {
                        date: '2024.12-至今',
                        title: 'JTCG：Rails 的浴火重生',
                        description: '加入 AI 科技公司，回歸 Ruby on Rails 的懷抱。使用 Stimulus + Hotwire 做前端。串接 Line API 做 AI 聊天機器人，每天跟 Bot 對話測試（有時比跟人說話還多）。維護核心 AI 產品，保持 <0.1% 的伺服器待機時間——意思是我的休息時間比伺服器還少。現在的我：Tailwind 寫到眼壓飆升，Git 已經融入 DNA。'
                    }
                ]
            },
            {
                title: '終章：To Be Continued...',
                content: [
                    {
                        date: '技能樹現況',
                        title: '全端工程師的武器庫',
                        description: '前端：HTML/CSS/JS 基本功、jQuery、Bootstrap + Tailwind（CSS 框架二刀流）。後端：Ruby on Rails（初戀）、Elixir Phoenix（函數式的洗禮）、Node.js（寫自動化腳本的好夥伴）。區塊鏈：Solidity（每行 Code 都是錢）、Hardhat（測試救了我的錢包）、ethers.js（鏈上鏈下的橋樑）。DevOps：Terraform/Ansible（讓伺服器也能 version control）、Git（已經是肌肉記憶）。'
                    },
                    {
                        date: '下一章',
                        title: 'npm install future',
                        description: '未來的計劃？繼續 Debug 人生！正在學習 AI 開發、BMAD 流程。人生座右銘：「Bugs are just features in disguise」。除了寫 Code，也熱愛分享知識（教別人 Debug 才能確認自己真的會）、桌遊（策略遊戲訓練邏輯思維）、新的興趣是與 AI 打嘴砲。歡迎來到我的 GitHub，一起在 Code 的世界裡冒險！'
                    }
                ]
            }
        ];
        
        this.init();
    }
    
    init() {
        this.createBookStructure();
        this.bindEvents();
        this.renderCurrentPage();
    }
    
    createBookStructure() {
        const container = document.querySelector('#story-tab');
        // 清空原有內容
        container.innerHTML = '';
        container.innerHTML = `
            <div class="book-container">
                <div class="book-loading">載入中...</div>
                <div class="book" style="display: none;">
                    <div class="book-spine"></div>
                    <!-- 背景頁面（下層） -->
                    <div class="book-page page-bg-left" data-page="-2">
                        <div class="page-content"></div>
                        <span class="page-number"></span>
                    </div>
                    <div class="book-page page-bg-right" data-page="-1">
                        <div class="page-content"></div>
                        <span class="page-number"></span>
                    </div>
                    <!-- 當前顯示頁面（上層） -->
                    <div class="book-page page-left" data-page="0">
                        <div class="page-content"></div>
                        <span class="page-number"></span>
                    </div>
                    <div class="book-page page-right" data-page="1">
                        <div class="page-content"></div>
                        <span class="page-number"></span>
                    </div>
                </div>
            </div>
        `;
        
        // 整理頁面數據 - 簡化為線性陣列
        this.pages = [];
        this.chapters.forEach((chapter, chapterIndex) => {
            // 章節標題頁
            this.pages.push({
                type: 'chapter',
                title: chapter.title,
                content: null
            });
            
            // 內容頁
            chapter.content.forEach(item => {
                this.pages.push({
                    type: 'content',
                    item: item
                });
            });
        });
        
        this.totalPages = this.pages.length;
        
        // 載入完成，顯示書本
        setTimeout(() => {
            document.querySelector('.book-loading').style.display = 'none';
            document.querySelector('.book').style.display = 'block';
        }, 500);
    }
    
    bindEvents() {
        const leftPage = document.querySelector('.page-left');
        const rightPage = document.querySelector('.page-right');
        const book = document.querySelector('.book');
        
        // 書頁點擊翻頁
        leftPage.addEventListener('click', () => {
            if (!this.isAnimating && this.currentPage > 0) {
                this.turnPage('prev');
            }
        });
        
        rightPage.addEventListener('click', () => {
            if (!this.isAnimating && this.currentPage < this.totalPages - 2) {
                this.turnPage('next');
            }
        });
        
        // Hover 效果
        leftPage.addEventListener('mouseenter', () => {
            if (!this.isAnimating && this.currentPage > 0) {
                leftPage.style.cursor = 'pointer';
                leftPage.classList.add('page-hover-left');
            }
        });
        
        leftPage.addEventListener('mouseleave', () => {
            leftPage.classList.remove('page-hover-left');
        });
        
        rightPage.addEventListener('mouseenter', () => {
            if (!this.isAnimating && this.currentPage < this.totalPages - 2) {
                rightPage.style.cursor = 'pointer';
                rightPage.classList.add('page-hover-right');
            }
        });
        
        rightPage.addEventListener('mouseleave', () => {
            rightPage.classList.remove('page-hover-right');
        });
        
        // 鍵盤控制
        document.addEventListener('keydown', (e) => {
            if (document.querySelector('#story-tab').style.display !== 'none') {
                if (e.key === 'ArrowLeft') this.turnPage('prev');
                if (e.key === 'ArrowRight') this.turnPage('next');
            }
        });
        
        // 觸控支援
        let touchStartX = 0;
        
        book.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        });
        
        book.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    this.turnPage('next');
                } else {
                    this.turnPage('prev');
                }
            }
        });
    }
    
    turnPage(direction) {
        if (this.isAnimating) return;
        
        if (direction === 'next' && this.currentPage < this.totalPages - 2) {
            this.isAnimating = true;
            this.currentPage += 2;
            this.animatePageTurn('next');
        } else if (direction === 'prev' && this.currentPage > 0) {
            this.isAnimating = true;
            this.currentPage -= 2;
            this.animatePageTurn('prev');
        }
        
        this.updateControls();
    }
    
    animatePageTurn(direction) {
        const book = document.querySelector('.book');
        const leftPage = document.querySelector('.page-left');
        const rightPage = document.querySelector('.page-right');
        const bgLeftPage = document.querySelector('.page-bg-left');
        const bgRightPage = document.querySelector('.page-bg-right');
        
        // 添加翻頁中的類別
        book.classList.add('flipping');
        
        // 統一的翻頁邏輯
        // 根據方向決定翻哪一頁
        const pageTurning = direction === 'next' ? rightPage : leftPage;
        const flipOrigin = direction === 'next' ? 'left center' : 'right center';
        const flipRotation = direction === 'next' ? '-180deg' : '180deg';
        
        // 創建翻頁動畫元素
        const flipPage = document.createElement('div');
        flipPage.className = `book-page ${direction === 'next' ? 'page-right' : 'page-left'} page-flip-temp`;
        flipPage.style.cssText = `
            position: absolute;
            width: 500px;
            height: 600px;
            left: ${direction === 'next' ? '500px' : '0'};
            top: 0;
            z-index: 10;
            transform-origin: ${flipOrigin};
            backface-visibility: hidden;
        `;
        flipPage.innerHTML = pageTurning.innerHTML;
        
        // 複製頁面的樣式
        flipPage.style.background = window.getComputedStyle(pageTurning).background;
        flipPage.style.border = window.getComputedStyle(pageTurning).border;
        flipPage.style.borderRadius = window.getComputedStyle(pageTurning).borderRadius;
        flipPage.style.boxShadow = window.getComputedStyle(pageTurning).boxShadow;
        
        // 插入翻頁元素
        book.appendChild(flipPage);
        
        // 隱藏原本的頁面
        pageTurning.style.visibility = 'hidden';
        
        // 啟動翻頁動畫
        requestAnimationFrame(() => {
            flipPage.style.transform = `rotateY(${flipRotation})`;
            flipPage.style.transition = 'transform 0.6s cubic-bezier(0.645, 0.045, 0.355, 1)';
        });
        
        // 在動畫中途更新當前頁面內容（但不更新背景）
        setTimeout(() => {
            this.renderCurrentPage(false);
        }, 300);
        
        // 動畫結束後的處理
        setTimeout(() => {
            // 移除臨時翻頁元素
            flipPage.remove();
            
            // 恢復原頁面的可見性
            pageTurning.style.visibility = 'visible';
            
            book.classList.remove('flipping');
            
            // 動畫完全結束後再更新背景頁面的預渲染內容
            setTimeout(() => {
                this.renderCurrentPage(true);
                this.isAnimating = false;
            }, 100);
        }, 600);
    }
    
    renderCurrentPage(updateBackground = true) {
        const leftPage = document.querySelector('.page-left .page-content');
        const rightPage = document.querySelector('.page-right .page-content');
        const leftPageNum = document.querySelector('.page-left .page-number');
        const rightPageNum = document.querySelector('.page-right .page-number');
        
        const bgLeftPage = document.querySelector('.page-bg-left .page-content');
        const bgRightPage = document.querySelector('.page-bg-right .page-content');
        const bgLeftPageNum = document.querySelector('.page-bg-left .page-number');
        const bgRightPageNum = document.querySelector('.page-bg-right .page-number');
        
        // 渲染當前頁面
        if (this.currentPage < this.totalPages) {
            leftPage.innerHTML = this.renderPageContent(this.pages[this.currentPage]);
            leftPageNum.textContent = this.currentPage + 1;
        }
        
        if (this.currentPage + 1 < this.totalPages) {
            rightPage.innerHTML = this.renderPageContent(this.pages[this.currentPage + 1]);
            rightPageNum.textContent = this.currentPage + 2;
        } else {
            rightPage.innerHTML = '';
            rightPageNum.textContent = '';
        }
        
        if (updateBackground) {
            // 渲染背景頁面
            // 左側背景：預渲染左頁 - 2（用於向前翻頁）
            // 右側背景：預渲染右頁 + 2（用於向後翻頁）
            
            // 左側背景：currentPage - 2
            if (this.currentPage - 2 >= 0) {
                bgLeftPage.innerHTML = this.renderPageContent(this.pages[this.currentPage - 2]);
                bgLeftPageNum.textContent = this.currentPage - 1;
            } else {
                bgLeftPage.innerHTML = '';
                bgLeftPageNum.textContent = '';
            }
            
            // 右側背景：(currentPage + 1) + 2 = currentPage + 3
            if (this.currentPage + 3 < this.totalPages) {
                bgRightPage.innerHTML = this.renderPageContent(this.pages[this.currentPage + 3]);
                bgRightPageNum.textContent = this.currentPage + 4;
            } else {
                bgRightPage.innerHTML = '';
                bgRightPageNum.textContent = '';
            }
        }
    }
    
    renderPageContent(page) {
        if (!page) return '';
        
        if (page.type === 'chapter') {
            return `
                <div class="chapter-page">
                    <h2 class="chapter-title">${page.title}</h2>
                </div>
            `;
        } else if (page.type === 'content') {
            const item = page.item;
            return `
                <div class="chapter-content">
                    <div class="timeline-entry">
                        <span class="timeline-date">${item.date}</span>
                        <h3 class="timeline-title">${item.title}</h3>
                        <p class="timeline-description">${item.description}</p>
                    </div>
                </div>
            `;
        }
        
        return '';
    }
    
    updateControls() {
        const leftPage = document.querySelector('.page-left');
        const rightPage = document.querySelector('.page-right');
        
        // 更新游標狀態
        if (this.currentPage <= 0) {
            leftPage.style.cursor = 'default';
        } else {
            leftPage.style.cursor = 'pointer';
        }
        
        if (this.currentPage >= this.totalPages - 2) {
            rightPage.style.cursor = 'default';
        } else {
            rightPage.style.cursor = 'pointer';
        }
    }
}

// 初始化
window.interactiveBook = null;