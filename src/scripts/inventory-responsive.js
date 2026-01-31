// Inventory 響應式適配系統
(function() {
    'use strict';

    // Grid 的理想尺寸（像素）
    const IDEAL_GRID_WIDTH = 813;   // 20格 × 40px + gaps + padding + border
    const IDEAL_GRID_HEIGHT = 411;  // 10格 × 40px + gaps + padding + border

    // 初始化響應式系統
    function initInventoryResponsive() {
        const section = document.querySelector('.inventory-section');
        const container = document.querySelector('.inventory-container');
        const grid = document.querySelector('.inventory-grid');

        if (!section || !container || !grid) {
            console.warn('[Inventory Responsive] 找不到必要的 DOM 元素');
            return;
        }

        // 首次調整
        adjustInventoryLayout();

        // 監聽視窗大小變化
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(adjustInventoryLayout, 100);
        });

        // 監聽頁籤切換（當切換到 inventory 頁籤時重新調整）
        document.addEventListener('click', (e) => {
            const tab = e.target.closest('[data-tab="inventory"]');
            if (tab) {
                setTimeout(adjustInventoryLayout, 50);
            }
        });

        // 延遲再次調整，確保所有元素都已渲染（特別是物品圖片）
        setTimeout(adjustInventoryLayout, 200);

        console.log('[Inventory Responsive] 響應式系統已初始化');
    }

    // 調整 inventory 佈局
    function adjustInventoryLayout() {
        const section = document.querySelector('.inventory-section');
        const container = document.querySelector('.inventory-container');
        const grid = document.querySelector('.inventory-grid');

        if (!section || !container || !grid) return;

        // 獲取 section 的可用尺寸（扣除 padding）
        const sectionRect = section.getBoundingClientRect();
        const sectionStyle = getComputedStyle(section);
        const paddingTop = parseFloat(sectionStyle.paddingTop);
        const paddingBottom = parseFloat(sectionStyle.paddingBottom);
        const paddingLeft = parseFloat(sectionStyle.paddingLeft);
        const paddingRight = parseFloat(sectionStyle.paddingRight);

        const availableWidth = sectionRect.width - paddingLeft - paddingRight;
        const availableHeight = sectionRect.height - paddingTop - paddingBottom;

        // 決定策略
        let strategy = determineStrategy(availableWidth, availableHeight);

        // 應用策略
        applyStrategy(container, strategy);

        // Debug 信息
        console.log(`[Inventory Responsive] Section: ${Math.round(availableWidth)}×${Math.round(availableHeight)}, Strategy: ${strategy.type}, Transform: ${strategy.transform}`);
    }

    // 決定適配策略
    function determineStrategy(availableWidth, availableHeight) {
        const viewportWidth = window.innerWidth;

        // 策略 1：小螢幕（< 767px）永遠旋轉
        if (viewportWidth < 767) {
            return determineRotateStrategy(availableWidth, availableHeight);
        }

        // 策略 2：大螢幕且空間充足，正常顯示
        if (availableWidth >= IDEAL_GRID_WIDTH && availableHeight >= IDEAL_GRID_HEIGHT) {
            return {
                type: 'normal',
                transform: 'none',
                scale: 1
            };
        }

        // 策略 3：大螢幕但空間不足，縮放
        return determineScaleStrategy(availableWidth, availableHeight);
    }

    // 旋轉策略（小螢幕專用）
    function determineRotateStrategy(availableWidth, availableHeight) {
        // 旋轉 90° 後（使用 transform-origin: center center）：
        // - grid 的 813px 寬度會佔用「垂直」空間（section 會自動撐高）
        // - grid 的 411px 高度會佔用「水平」空間（availableWidth）
        //
        // 需求 #6 關鍵：旋轉後的 X 軸（原本的 height）應該盡量填滿 availableWidth
        //               高度由 section 自動撐高，不受 availableHeight 限制！

        const scaleForWidth = availableWidth / IDEAL_GRID_HEIGHT;  // X軸適配
        const finalScale = Math.min(scaleForWidth, 1);  // 只考慮寬度適配（需求 #6）

        // 使用 transform-origin: center center 時，不需要 translate 補償
        // 旋轉會自動以中心點為軸，section 的 flexbox 會自動置中（需求 #7）
        // 拖拽邏輯完全不受影響（需求 #8）

        if (finalScale >= 1) {
            // 旋轉後完美適配，不需要額外縮放
            return {
                type: 'rotate',
                transform: `rotate(90deg)`,
                scale: 1
            };
        } else {
            // 旋轉後需要縮放以適配寬度（需求 #4）
            return {
                type: 'rotate-scale',
                transform: `rotate(90deg) scale(${finalScale})`,
                scale: finalScale
            };
        }
    }

    // 縮放策略（大螢幕專用）
    function determineScaleStrategy(availableWidth, availableHeight) {
        const scaleX = availableWidth / IDEAL_GRID_WIDTH;
        const scaleY = availableHeight / IDEAL_GRID_HEIGHT;
        const scale = Math.min(scaleX, scaleY, 1);
        const finalScale = Math.max(scale, 0.25);

        return {
            type: 'scale',
            transform: `scale(${finalScale})`,
            scale: finalScale
        };
    }

    // 應用策略
    function applyStrategy(container, strategy) {
        const section = document.querySelector('.inventory-section');

        // 設置 container 的 transform
        container.style.transform = strategy.transform;

        // 導出旋轉狀態供 inventory.js 使用（用於修正拖拽 offset）
        const isRotated = (strategy.type === 'rotate' || strategy.type === 'rotate-scale');
        window.inventoryRotationState = {
            isRotated: isRotated,
            scale: strategy.scale
        };

        // 關鍵修正：因為 CSS transform 不影響 layout flow，
        // 我們需要手動設定 section 的 min-height 來容納旋轉後的 container
        if (section) {
            // container 的 transition 是 300ms，所以必須等待至少 300ms
            // 才能讀取到正確的 getBoundingClientRect() 值
            setTimeout(() => {
                const containerRect = container.getBoundingClientRect();
                const visualHeight = Math.ceil(containerRect.height);

                // 加上 section 的 padding
                const sectionStyle = window.getComputedStyle(section);
                const paddingTop = parseFloat(sectionStyle.paddingTop) || 0;
                const paddingBottom = parseFloat(sectionStyle.paddingBottom) || 0;
                const totalPadding = paddingTop + paddingBottom;

                // 設定 section 的 min-height 為 container 的視覺高度 + padding
                const requiredHeight = visualHeight + totalPadding;
                section.style.minHeight = `${requiredHeight}px`;

                console.log(`[Inventory Responsive] Set section min-height to ${requiredHeight}px (container ${visualHeight}px + padding ${totalPadding}px)`);
            }, 350);  // 350ms = 300ms transition + 50ms buffer
        }

        // 圖片旋轉邏輯：
        // Container 旋轉 90° 時，根據物品形狀決定是否需要反向旋轉
        // - 正方形物品（data-width === data-height）：反向旋轉 -90° → 視覺上保持原方向
        // - 長方形物品（data-width !== data-height）：不旋轉 → 跟隨 container，視覺上旋轉 90°
        const items = container.querySelectorAll('.multi-slot-item, .inventory-slot img');

        if (isRotated) {
            items.forEach(item => {
                // 取得物品容器（可能是 multi-slot-item 或包含 img 的 slot）
                const itemContainer = item.classList.contains('multi-slot-item') ? item : item.closest('.inventory-slot');
                const img = item.classList.contains('multi-slot-item') ? item.querySelector('img') : item;

                if (!itemContainer || !img) return;

                // 從 data 屬性讀取遊戲邏輯的格子佔用
                const dataWidth = parseInt(itemContainer.dataset.width || '1', 10);
                const dataHeight = parseInt(itemContainer.dataset.height || '1', 10);

                // 判斷是否為正方形：data-width === data-height
                const isSquare = (dataWidth === dataHeight);

                if (isSquare) {
                    // 正方形物品：反向旋轉 -90° 以保持視覺方向不變
                    img.style.setProperty('transform', 'rotate(-90deg)', 'important');
                } else {
                    // 長方形物品：不加額外旋轉，跟隨 container 旋轉 90°
                    img.style.setProperty('transform', 'none', 'important');
                }
            });
        } else {
            // 非旋轉狀態：清除所有圖片的 transform
            items.forEach(item => {
                const img = item.classList.contains('multi-slot-item') ? item.querySelector('img') : item;
                if (img) {
                    img.style.setProperty('transform', 'none', 'important');
                }
            });
        }
    }

    // 導出初始化函數
    window.initInventoryResponsive = initInventoryResponsive;

    // 當 DOM 載入完成後自動初始化（如果 inventory 頁籤存在）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('inventory-tab')) {
                initInventoryResponsive();
            }
        });
    } else {
        if (document.getElementById('inventory-tab')) {
            initInventoryResponsive();
        }
    }
})();
