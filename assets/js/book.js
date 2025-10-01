class InteractiveBook {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 0;
        this.pages = [];
        this.isAnimating = false;

        // 等待 i18n 載入後初始化章節
        this.initializeWhenReady();
    }

    async initializeWhenReady() {
        // 等待 i18n 管理器載入
        while (!window.i18n) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 額外等待確保翻譯數據已載入
        let retries = 0;
        while (retries < 50) {
            const testKey = 'story_book.chapters.chapter_0.title';
            const result = window.i18n.t(testKey);
            if (result !== testKey) {
                // 翻譯數據已載入
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        this.loadChapters();
        this.init();
    }

    loadChapters() {
        // 使用 i18n 載入章節內容
        this.chapters = this.buildChaptersFromI18n();
    }

    buildChaptersFromI18n() {
        const chapters = [];
        const chapterKeys = ['chapter_0', 'chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_final'];

        chapterKeys.forEach(chapterKey => {
            const chapterData = {
                title: window.i18n.t(`story_book.chapters.${chapterKey}.title`),
                content: []
            };

            // 動態載入每個章節的事件
            let eventIndex = 0;
            while (true) {
                const eventKey = `story_book.chapters.${chapterKey}.events.event_${eventIndex}`;
                const title = window.i18n.t(`${eventKey}.title`);

                // 如果翻譯 key 不存在，跳出迴圈
                if (title === `${eventKey}.title`) break;

                chapterData.content.push({
                    date: window.i18n.t(`${eventKey}.date`),
                    title: title,
                    description: window.i18n.t(`${eventKey}.description`)
                });

                eventIndex++;
            }

            if (chapterData.content.length > 0) {
                chapters.push(chapterData);
            }
        });

        return chapters;
    }

    // 監聽語言切換事件並重新載入章節
    listenForLanguageChange() {
        window.addEventListener('i18n:languageChanged', () => {
            this.loadChapters();
            this.createBookStructure();
            this.bindEvents(); // 重新綁定事件監聽器
            this.renderCurrentPage();
        });
    }

    
    init() {
        this.createBookStructure();
        this.bindEvents();
        this.renderCurrentPage();
        this.listenForLanguageChange();
    }
    
    createBookStructure() {
        const container = document.querySelector('#story-tab');
        // 清空原有內容
        container.innerHTML = '';
        container.innerHTML = `
            <div class="book-container">
                <div class="book-loading">${window.i18n.t('messages.loading')}</div>
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
            const loading = document.querySelector('.book-loading');
            const book = document.querySelector('.book');
            if (loading) loading.style.display = 'none';
            if (book) book.style.display = 'block';
        }, 500);
    }
    
    bindEvents() {
        const leftPage = document.querySelector('.page-left');
        const rightPage = document.querySelector('.page-right');
        const book = document.querySelector('.book');

        // 確保元素存在
        if (!leftPage || !rightPage || !book) {
            console.error('Book elements not found for binding events');
            return;
        }

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