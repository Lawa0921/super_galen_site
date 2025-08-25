class InteractiveBook {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 0;
        this.pages = [];
        this.isAnimating = false;
        
        this.chapters = [
            {
                title: '序章：意外的開始',
                content: [
                    {
                        date: '2011-2015',
                        title: '海洋休閒管理系的青春歲月',
                        description: '就讀國立高雄科技大學，看似與程式無關的科系，卻培養了我的團隊合作能力。帶領系啦啦隊獲得校際第二名，參與系學會長選舉，還在大專組龍舟比賽中奪下男女混合組第一名！'
                    },
                    {
                        date: '2015',
                        title: '創業初體驗：密式旅行',
                        description: '畢業後沒有走傳統就業路線，而是創立了「密式旅行」露營區。從零開始學習經營管理，這段經歷培養了我解決問題的能力和創業家精神。'
                    }
                ]
            },
            {
                title: '第一章：轉職的契機',
                content: [
                    {
                        date: '2019',
                        title: '自學日語的挑戰',
                        description: '一年內從零基礎自學到通過日檢 N1！這證明了我的自學能力和毅力，也為後來學習程式語言打下了信心基礎。'
                    },
                    {
                        date: '2020.03',
                        title: '踏入程式世界',
                        description: '參加 AstroCamp 程式轉職訓練營，從完全不懂程式的麻瓜，開始接觸 Ruby on Rails。每天寫程式到凌晨，debug 到懷疑人生，但越寫越有成就感！'
                    }
                ]
            },
            {
                title: '第二章：工程師之路',
                content: [
                    {
                        date: '2020.08',
                        title: 'Snapask 後端工程師',
                        description: '加入線上教育平台 Snapask，負責後端系統開發。從菜鳥工程師開始，學習大型系統架構、資料庫優化、API 設計等實戰技能。'
                    },
                    {
                        date: '2021.06',
                        title: '第一個商業專案',
                        description: '獨立完成第一個商業專案！從需求分析到系統上線，體驗了完整的開發流程。那種看著自己的程式碼在生產環境運行的感覺，真的很棒！'
                    }
                ]
            },
            {
                title: '第三章：區塊鏈探索',
                content: [
                    {
                        date: '2022.02',
                        title: 'KryptoCamp 區塊鏈實戰',
                        description: '參加區塊鏈實戰營，學習智能合約開發、DeFi 協議、NFT 實作。從 Web2 跨入 Web3 的世界，發現了全新的可能性！'
                    },
                    {
                        date: '2022.05-2023.02',
                        title: '自由開發者時期',
                        description: '成為區塊鏈自由開發者，開發 DFKRunner 自動化腳本、參與多個 DeFi 專案。這段時間讓我學會了獨立接案和時間管理。'
                    }
                ]
            },
            {
                title: '第四章：技術精進',
                content: [
                    {
                        date: '2023.03',
                        title: 'Elixir Phoenix 的魔法',
                        description: '開始使用 Elixir Phoenix 開發高並發網站。函數式編程的思維顛覆了我對程式的認知，Actor Model 更是讓我大開眼界！'
                    },
                    {
                        date: '2024.12',
                        title: '回歸 Ruby on Rails',
                        description: '重新擁抱 Ruby on Rails，發現自己對這個框架有了更深的理解。現在的我，能夠更好地運用它的優雅和效率。'
                    }
                ]
            },
            {
                title: '終章：持續冒險',
                content: [
                    {
                        date: '現在',
                        title: '全端工程師的日常',
                        description: '精通前後端技術，熟悉區塊鏈開發，同時保持對新技術的好奇心。除了寫程式，還熱愛教學、露營、桌遊，是個不折不扣的生活駭客！'
                    },
                    {
                        date: '未來',
                        title: '下一個章節...',
                        description: '技術的世界永無止境，每天都有新的挑戰和機會。期待與更多優秀的夥伴合作，一起創造有趣的產品，寫下更精彩的故事！'
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
                <div class="book-controls">
                    <button class="book-btn prev-btn disabled" title="上一頁">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="book-btn next-btn" title="下一頁">
                        <i class="fas fa-chevron-right"></i>
                    </button>
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
        const prevBtn = document.querySelector('.prev-btn');
        const nextBtn = document.querySelector('.next-btn');
        
        prevBtn.addEventListener('click', () => this.turnPage('prev'));
        nextBtn.addEventListener('click', () => this.turnPage('next'));
        
        // 鍵盤控制
        document.addEventListener('keydown', (e) => {
            if (document.querySelector('#story-tab').style.display !== 'none') {
                if (e.key === 'ArrowLeft') this.turnPage('prev');
                if (e.key === 'ArrowRight') this.turnPage('next');
            }
        });
        
        // 觸控支援
        let touchStartX = 0;
        const book = document.querySelector('.book');
        
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
        
        
        if (direction === 'next') {
            // 向後翻頁前，先更新背景頁面為當前內容
            bgLeftPage.querySelector('.page-content').innerHTML = leftPage.querySelector('.page-content').innerHTML;
            bgLeftPage.querySelector('.page-number').textContent = leftPage.querySelector('.page-number').textContent;
            
            // 右頁向左翻
            rightPage.classList.add('page-turning');
            
            setTimeout(() => {
                rightPage.classList.remove('page-turning');
                rightPage.style.display = 'none';
                this.renderCurrentPage();
                
                setTimeout(() => {
                    rightPage.style.display = 'block';
                    book.classList.remove('flipping');
                    this.isAnimating = false;
                }, 100);
            }, 600);
        } else {
            // 向前翻頁
            // 先更新右側背景頁面為當前右頁內容
            bgRightPage.querySelector('.page-content').innerHTML = rightPage.querySelector('.page-content').innerHTML;
            bgRightPage.querySelector('.page-number').textContent = rightPage.querySelector('.page-number').textContent;
            
            // 準備翻頁：創建一個臨時的翻頁元素來顯示動畫
            const flipPage = document.createElement('div');
            flipPage.className = 'book-page page-left page-flip-temp';
            flipPage.style.cssText = `
                position: absolute;
                width: 400px;
                height: 500px;
                left: 0;
                top: 0;
                z-index: 10;
                transform-origin: right center;
                backface-visibility: hidden;
            `;
            flipPage.innerHTML = `
                <div class="page-content">${leftPage.querySelector('.page-content').innerHTML}</div>
                <span class="page-number">${leftPage.querySelector('.page-number').textContent}</span>
            `;
            
            // 複製左頁的樣式
            flipPage.style.background = window.getComputedStyle(leftPage).background;
            flipPage.style.border = window.getComputedStyle(leftPage).border;
            flipPage.style.borderRadius = window.getComputedStyle(leftPage).borderRadius;
            flipPage.style.boxShadow = window.getComputedStyle(leftPage).boxShadow;
            
            // 插入翻頁元素
            book.appendChild(flipPage);
            
            // 隱藏原本的左頁
            leftPage.style.visibility = 'hidden';
            
            // 啟動翻頁動畫
            requestAnimationFrame(() => {
                flipPage.style.transform = 'rotateY(180deg)';
                flipPage.style.transition = 'transform 0.6s cubic-bezier(0.645, 0.045, 0.355, 1)';
            });
            
            setTimeout(() => {
                // 移除臨時翻頁元素
                flipPage.remove();
                
                // 更新頁面內容
                this.renderCurrentPage();
                
                // 恢復左頁可見性
                leftPage.style.visibility = 'visible';
                
                book.classList.remove('flipping');
                this.isAnimating = false;
            }, 600);
        }
    }
    
    renderCurrentPage() {
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
        
        // 渲染背景頁面
        // 左側背景：前一頁（用於向前翻頁）
        if (this.currentPage - 2 >= 0) {
            bgLeftPage.innerHTML = this.renderPageContent(this.pages[this.currentPage - 2]);
            bgLeftPageNum.textContent = this.currentPage - 1;
        } else {
            bgLeftPage.innerHTML = '';
            bgLeftPageNum.textContent = '';
        }
        
        // 右側背景：下下頁（用於向後翻頁）
        if (this.currentPage + 2 < this.totalPages) {
            bgRightPage.innerHTML = this.renderPageContent(this.pages[this.currentPage + 2]);
            bgRightPageNum.textContent = this.currentPage + 3;
        } else {
            bgRightPage.innerHTML = '';
            bgRightPageNum.textContent = '';
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
        const prevBtn = document.querySelector('.prev-btn');
        const nextBtn = document.querySelector('.next-btn');
        
        if (this.currentPage <= 0) {
            prevBtn.classList.add('disabled');
        } else {
            prevBtn.classList.remove('disabled');
        }
        
        if (this.currentPage >= this.totalPages - 2) {
            nextBtn.classList.add('disabled');
        } else {
            nextBtn.classList.remove('disabled');
        }
    }
}

// 初始化
window.interactiveBook = null;