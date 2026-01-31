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
        this.updateControls(); // 初始化時更新控制項狀態（隱藏第一頁的左箭頭）
        this.listenForLanguageChange();
        this.listenForResize();
    }

    // Debounce 函數
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 監聽視窗縮放
    listenForResize() {
        window.addEventListener('resize', this.debounce(() => {
            // 重新檢測模式並綁定事件
            this.bindEvents();
        }, 300));
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

        // 確保基本元素存在
        if (!leftPage || !book) {
            console.error('Book elements not found for binding events');
            return;
        }

        // 檢測單頁/雙頁模式
        this.isSinglePageMode = !rightPage || window.getComputedStyle(rightPage).display === 'none';

        // 移除舊的事件監聽器（避免重複綁定）
        const newLeftPage = leftPage.cloneNode(true);
        leftPage.parentNode.replaceChild(newLeftPage, leftPage);

        // 左頁點擊 - 在單頁模式下同時處理前後翻頁
        newLeftPage.addEventListener('click', (e) => {
            if (this.isAnimating) return;

            // 檢查是否點擊在內容區域上（有 pointer-events: auto 的元素）
            // 如果是，則不觸發翻頁（讓用戶可以滾動內容）
            if (e.target !== newLeftPage && e.target.closest('.page-content')) {
                return;
            }

            if (this.isSinglePageMode) {
                // 單頁模式：根據點擊位置判斷方向
                const rect = newLeftPage.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pageWidth = rect.width;

                if (clickX < pageWidth / 2) {
                    // 點擊左半邊 - 上一頁
                    if (this.currentPage > 0) {
                        this.turnPage('prev');
                    }
                } else {
                    // 點擊右半邊 - 下一頁
                    if (this.currentPage < this.totalPages - 1) {
                        this.turnPage('next');
                    }
                }
            } else {
                // 雙頁模式：左頁只能往前翻
                if (this.currentPage > 0) {
                    this.turnPage('prev');
                }
            }
        });

        // 右頁點擊 - 只在雙頁模式下有效
        if (rightPage && !this.isSinglePageMode) {
            const newRightPage = rightPage.cloneNode(true);
            rightPage.parentNode.replaceChild(newRightPage, rightPage);

            newRightPage.addEventListener('click', (e) => {
                if (this.isAnimating) return;

                // 檢查是否點擊在內容區域上
                if (e.target !== newRightPage && e.target.closest('.page-content')) {
                    return;
                }

                if (this.currentPage < this.totalPages - 2) {
                    this.turnPage('next');
                }
            });

            // 右頁 Hover 效果
            newRightPage.addEventListener('mouseenter', () => {
                if (!this.isAnimating && this.currentPage < this.totalPages - 2) {
                    newRightPage.style.cursor = 'pointer';
                    newRightPage.classList.add('page-hover-right');
                }
            });

            newRightPage.addEventListener('mouseleave', () => {
                newRightPage.classList.remove('page-hover-right');
            });
        }

        // 左頁 Hover 效果
        newLeftPage.addEventListener('mouseenter', () => {
            if (this.isAnimating) return;

            if (this.isSinglePageMode) {
                // 單頁模式：顯示雙向箭頭提示
                newLeftPage.style.cursor = 'pointer';
            } else if (this.currentPage > 0) {
                // 雙頁模式：只在能往前翻時顯示
                newLeftPage.style.cursor = 'pointer';
                newLeftPage.classList.add('page-hover-left');
            }
        });

        newLeftPage.addEventListener('mouseleave', () => {
            newLeftPage.classList.remove('page-hover-left');
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

        // 根據模式決定翻頁步進：單頁每次1頁，雙頁每次2頁
        const step = this.isSinglePageMode ? 1 : 2;
        const maxPage = this.totalPages - step;

        if (direction === 'next' && this.currentPage < maxPage) {
            this.isAnimating = true;
            this.currentPage += step;
            this.animatePageTurn('next');
        } else if (direction === 'prev' && this.currentPage > 0) {
            this.isAnimating = true;
            this.currentPage -= step;
            this.animatePageTurn('prev');
        }

        this.updateControls();
    }

    animatePageTurn(direction) {
        const book = document.querySelector('.book');
        const leftPage = document.querySelector('.page-left');
        const rightPage = document.querySelector('.page-right');

        // 單頁模式：使用滑動動畫
        if (this.isSinglePageMode) {
            // 滑出動畫
            const slideOutAnimation = direction === 'next' ? 'slideOutLeft' : 'slideOutRight';
            leftPage.style.animation = `${slideOutAnimation} 0.4s ease-out forwards`;

            setTimeout(() => {
                // 更新頁面內容
                this.renderCurrentPage();

                // 滑入動畫
                const slideInAnimation = direction === 'next' ? 'slideInRight' : 'slideInLeft';
                leftPage.style.animation = `${slideInAnimation} 0.4s ease-out`;

                setTimeout(() => {
                    // 清除動畫
                    leftPage.style.animation = '';
                    this.isAnimating = false;
                }, 400);
            }, 400);
            return;
        }

        // 雙頁模式：使用 3D 翻轉動畫
        const bgLeftPage = document.querySelector('.page-bg-left');
        const bgRightPage = document.querySelector('.page-bg-right');

        // 添加翻頁中的類別
        book.classList.add('flipping');

        // 根據方向決定翻哪一頁
        const pageTurning = direction === 'next' ? rightPage : leftPage;
        const flipOrigin = direction === 'next' ? 'left center' : 'right center';
        const flipRotation = direction === 'next' ? '-180deg' : '180deg';

        // 創建翻頁動畫元素
        const flipPage = document.createElement('div');
        flipPage.className = `book-page ${direction === 'next' ? 'page-right' : 'page-left'} page-flip-temp`;

        // 動態取得當前書本尺寸
        const bookWidth = book.offsetWidth;
        const bookHeight = book.offsetHeight;
        const pageWidth = bookWidth / 2;

        flipPage.style.cssText = `
            position: absolute;
            width: ${pageWidth}px;
            height: ${bookHeight}px;
            left: ${direction === 'next' ? pageWidth : 0}px;
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

        // 單頁模式：控制箭頭顯示
        if (this.isSinglePageMode) {
            // 控制左箭頭（上一頁）
            if (this.currentPage <= 0) {
                leftPage.classList.add('hide-left-arrow');
            } else {
                leftPage.classList.remove('hide-left-arrow');
            }

            // 控制右箭頭（下一頁）
            if (this.currentPage >= this.totalPages - 1) {
                leftPage.classList.add('hide-right-arrow');
            } else {
                leftPage.classList.remove('hide-right-arrow');
            }
            return;
        }

        // 雙頁模式：更新游標狀態
        if (this.currentPage <= 0) {
            leftPage.style.cursor = 'default';
        } else {
            leftPage.style.cursor = 'pointer';
        }

        if (rightPage) {
            if (this.currentPage >= this.totalPages - 2) {
                rightPage.style.cursor = 'default';
            } else {
                rightPage.style.cursor = 'pointer';
            }
        }
    }
}

// 匯出類別以支援懶載入
window.InteractiveBook = InteractiveBook;

// 初始化
window.interactiveBook = null;