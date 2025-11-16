// Diablo 2 風格物品欄系統
(function() {
    'use strict';
    
    // 物品資料庫 - 從 i18n 系統載入
    let itemDatabase = {};

    // 從 i18n 系統載入物品資料
    function loadItemDatabase() {
        if (window.i18n && window.i18n.currentTranslations && window.i18n.currentTranslations.inventory) {
            const i18nItems = window.i18n.currentTranslations.inventory.items;
            itemDatabase = {};

            // 轉換 i18n 格式到原有的資料結構
            for (const [key, item] of Object.entries(i18nItems)) {
                itemDatabase[key] = {
                    id: parseInt(key),
                    name: item.name,
                    type: item.type,
                    icon: item.icon,
                    rarity: item.rarity,
                    width: item.width,
                    height: item.height,
                    stats: item.stats || {},
                    description: item.description,
                    // 保留其他屬性
                    ...(item.color && { color: item.color }),
                    ...(item.consumable && { consumable: item.consumable }),
                    ...(item.effect && { effect: item.effect }),
                    ...(item.value && { value: item.value })
                };
            }

            // 導出到全域 scope 供 tooltip 和其他系統使用
            window.itemDatabase = itemDatabase;

            console.log('物品資料已從 i18n 系統載入:', Object.keys(itemDatabase).length, '個物品');
        } else {
            console.warn('i18n 系統尚未載入或物品資料不存在');
        }
    }
    
    // 背包格子狀態 (20x10)
    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 10;
    let inventoryGrid = [];
    
    // 裝備欄位資料
    const equipmentSlots = {
        helmet: { name: '頭盔', type: 'helmet' },
        amulet: { name: '項鍊', type: 'amulet' },
        armor: { name: '護甲', type: 'armor' },
        weapon: { name: '武器', type: 'weapon' },
        shield: { name: '副手', type: 'shield' },
        gloves: { name: '手套', type: 'gloves' },
        belt: { name: '腰帶', type: 'belt' },
        boots: { name: '鞋子', type: 'boots' },
        ring1: { name: '戒指', type: 'ring' },
        ring2: { name: '戒指', type: 'ring' },
        charm1: { name: '護符', type: 'charm' },
        charm2: { name: '護符', type: 'charm' },
        charm3: { name: '護符', type: 'charm' }
    };
    
    let draggedItem = null;
    let draggedFromSlot = null;
    let dragOffset = { x: 0, y: 0 };
    
    // 初始化物品欄系統
    function initInventorySystem() {
        if (!document.getElementById('inventory-tab')) return;

        // 載入物品資料
        loadItemDatabase();

        initializeGrid();
        generateGridSlots();
        positionItems();
        setupDragAndDrop();
        setupTooltips();
        addInventoryEffects();

        // 語言切換監聽器已移至全域範圍
    }

    // 更新物品顯示文字（當語言切換時）
    function updateItemDisplayTexts() {
        // 更新所有顯示中的物品 tooltip 和文字
        const items = document.querySelectorAll('.multi-slot-item, .item');
        items.forEach(item => {
            const itemId = item.dataset.itemId;
            if (itemId && itemDatabase[itemId]) {
                const itemData = itemDatabase[itemId];
                // 更新 tooltip 內容
                item.title = `${itemData.name}\n${itemData.description}`;
            }
        });
    }
    
    // 初始化格子狀態
    function initializeGrid() {
        inventoryGrid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(0));
        
        // 標記已存在物品佔用的格子
        const items = document.querySelectorAll('.multi-slot-item');
        items.forEach(item => {
            const x = parseInt(item.dataset.x);
            const y = parseInt(item.dataset.y);
            const width = parseInt(item.dataset.width);
            const height = parseInt(item.dataset.height);
            const itemId = item.dataset.itemId;
            
            markGridOccupied(x, y, width, height, itemId);
        });
    }
    
    // 生成背包格子
    function generateGridSlots() {
        const gridContainer = document.getElementById('inventory-grid');
        if (!gridContainer) return;
        
        gridContainer.innerHTML = '';
        
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const slot = document.createElement('div');
                slot.className = 'inventory-slot';
                slot.dataset.x = x;
                slot.dataset.y = y;
                
                if (inventoryGrid[y][x] !== 0) {
                    slot.classList.add('occupied');
                }
                
                gridContainer.appendChild(slot);
            }
        }
    }
    
    // 標記格子為已佔用
    function markGridOccupied(x, y, width, height, itemId) {
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (y + dy < GRID_HEIGHT && x + dx < GRID_WIDTH) {
                    inventoryGrid[y + dy][x + dx] = itemId;
                    
                    // 更新對應的格子視覺狀態
                    const slot = document.querySelector(`.inventory-slot[data-x="${x + dx}"][data-y="${y + dy}"]`);
                    if (slot) {
                        slot.classList.add('occupied');
                    }
                }
            }
        }
    }
    
    // 清除格子佔用
    function clearGridOccupied(x, y, width, height) {
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (y + dy < GRID_HEIGHT && x + dx < GRID_WIDTH) {
                    inventoryGrid[y + dy][x + dx] = 0;
                    
                    // 更新對應的格子視覺狀態
                    const slot = document.querySelector(`.inventory-slot[data-x="${x + dx}"][data-y="${y + dy}"]`);
                    if (slot) {
                        slot.classList.remove('occupied');
                    }
                }
            }
        }
    }
    
    // 檢查位置是否可放置
    function canPlaceItem(x, y, width, height, excludeItemId = null) {
        if (x < 0 || y < 0 || x + width > GRID_WIDTH || y + height > GRID_HEIGHT) {
            return false;
        }
        
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const gridValue = inventoryGrid[y + dy][x + dx];
                if (gridValue !== 0 && gridValue !== excludeItemId) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    // 定位物品到正確位置
    function positionItems() {
        const items = document.querySelectorAll('.multi-slot-item');
        const gridGap = 1; // gap between cells
        const cellSize = 40; // base cell size
        
        items.forEach(item => {
            const x = parseInt(item.dataset.x);
            const y = parseInt(item.dataset.y);
            const width = parseInt(item.dataset.width);
            const height = parseInt(item.dataset.height);
            
            // 計算位置
            item.style.left = `${x * (cellSize + gridGap)}px`;
            item.style.top = `${y * (cellSize + gridGap)}px`;
            
            // 計算尺寸（考慮格子間隙）
            item.style.width = `${width * cellSize + (width - 1) * gridGap}px`;
            item.style.height = `${height * cellSize + (height - 1) * gridGap}px`;
        });
    }
    
    // 設置拖放功能
    function setupDragAndDrop() {
        // 設置多格物品
        const items = document.querySelectorAll('.multi-slot-item');
        items.forEach(item => {
            item.addEventListener('dragstart', handleMultiSlotDragStart);
            item.addEventListener('dragend', handleMultiSlotDragEnd);
            
            // 添加右鍵點擊事件（藥水使用）
            item.addEventListener('contextmenu', handleRightClick);
        });
        
        // 設置背包格子
        const inventorySlots = document.querySelectorAll('.inventory-slot');
        inventorySlots.forEach(slot => {
            slot.addEventListener('dragover', handleDragOver);
            slot.addEventListener('drop', handleDropOnInventorySlot);
            slot.addEventListener('dragleave', handleDragLeave);
        });
        
        // 設置裝備欄位
        const equipSlots = document.querySelectorAll('.equip-slot');
        equipSlots.forEach(slot => {
            slot.addEventListener('dragover', handleDragOver);
            slot.addEventListener('drop', handleDropOnEquipSlot);
            slot.addEventListener('dragleave', handleDragLeave);
        });
    }
    
    // 多格物品拖動開始
    function handleMultiSlotDragStart(e) {
        // 確保 draggedItem 是物品容器，不管點擊的是哪個子元素
        draggedItem = e.target.closest('.multi-slot-item');
        if (!draggedItem) return;

        draggedFromSlot = null; // 記錄原始位置

        // 隱藏 tooltip
        const tooltip = document.getElementById('item-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }

        // 清除原位置的佔用
        const x = parseInt(draggedItem.dataset.x);
        const y = parseInt(draggedItem.dataset.y);
        const width = parseInt(draggedItem.dataset.width);
        const height = parseInt(draggedItem.dataset.height);

        clearGridOccupied(x, y, width, height);

        draggedItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';

        // 計算拖動偏移（相對於物品左上角的像素位置）
        const rect = draggedItem.getBoundingClientRect();
        let offsetX = e.clientX - rect.left;
        let offsetY = e.clientY - rect.top;

        // 檢查 inventory 是否旋轉了 90 度（由 inventory-responsive.js 導出）
        const rotationState = window.inventoryRotationState || { isRotated: false, scale: 1 };

        if (rotationState.isRotated) {
            // 旋轉 90° 後的座標轉換：
            // 原本的 offsetX（水平方向）→ 旋轉後變成垂直方向（從下往上）
            // 原本的 offsetY（垂直方向）→ 旋轉後變成水平方向（從左往右）
            //
            // 關鍵：getBoundingClientRect() 返回的是旋轉後視覺上的座標
            // 但 grid 的邏輯座標系統沒有旋轉，所以需要反向轉換回去

            const visualWidth = rect.width;   // 旋轉後的視覺寬度（實際是原本的高度）
            const visualHeight = rect.height; // 旋轉後的視覺高度（實際是原本的寬度）

            // 反向旋轉座標（逆時針 90°）：
            // grid 的 X = 視覺的 Y
            // grid 的 Y = 視覺寬度 - 視覺的 X
            const gridOffsetX = offsetY;
            const gridOffsetY = visualWidth - offsetX;

            dragOffset.x = gridOffsetX;
            dragOffset.y = gridOffsetY;
        } else {
            // 沒有旋轉，直接使用原始偏移
            dragOffset.x = offsetX;
            dragOffset.y = offsetY;
        }

        // 計算格子偏移（用戶點擊的是物品的哪個格子）
        const cellSize = 41; // 每個格子的大小
        dragOffset.gridX = Math.floor(dragOffset.x / cellSize);
        dragOffset.gridY = Math.floor(dragOffset.y / cellSize);

        playSound('pickup');
    }
    
    // 多格物品拖動結束
    function handleMultiSlotDragEnd(e) {
        const item = e.target.closest('.multi-slot-item');
        if (item) {
            item.classList.remove('dragging');
        }
        
        // 重新顯示 tooltip（延遲一點避免立即顯示）
        setTimeout(() => {
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip) {
                tooltip.style.display = '';
            }
        }, 100);
        
        // 如果沒有成功放置，恢復原位置
        if (draggedItem && draggedItem.parentElement) {
            const x = parseInt(draggedItem.dataset.x);
            const y = parseInt(draggedItem.dataset.y);
            const width = parseInt(draggedItem.dataset.width);
            const height = parseInt(draggedItem.dataset.height);
            const itemId = draggedItem.dataset.itemId;
            
            markGridOccupied(x, y, width, height, itemId);
        }
        
        draggedItem = null;
        draggedFromSlot = null;
    }
    
    // 允許拖放
    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        // 對於背包格子，顯示預覽
        if (e.currentTarget.classList.contains('inventory-slot') && draggedItem) {
            const slot = e.currentTarget;
            const slotX = parseInt(slot.dataset.x);
            const slotY = parseInt(slot.dataset.y);
            const width = parseInt(draggedItem.dataset.width);
            const height = parseInt(draggedItem.dataset.height);
            const itemId = draggedItem.dataset.itemId;
            
            // 根據拖曳偏移調整預覽位置
            const actualX = slotX - (dragOffset.gridX || 0);
            const actualY = slotY - (dragOffset.gridY || 0);
            
            // 高亮顯示會佔用的格子（使用調整後的位置）
            highlightGridArea(actualX, actualY, width, height, canPlaceItem(actualX, actualY, width, height, itemId));
        }
        
        return false;
    }
    
    // 高亮顯示區域
    function highlightGridArea(x, y, width, height, canPlace) {
        // 先清除所有高亮
        document.querySelectorAll('.inventory-slot').forEach(slot => {
            slot.classList.remove('drag-over', 'invalid-placement');
        });
        
        // 高亮新區域
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const slot = document.querySelector(`.inventory-slot[data-x="${x + dx}"][data-y="${y + dy}"]`);
                if (slot) {
                    slot.classList.add(canPlace ? 'drag-over' : 'invalid-placement');
                }
            }
        }
    }
    
    // 拖動離開
    function handleDragLeave(e) {
        // 清除高亮
        document.querySelectorAll('.inventory-slot').forEach(slot => {
            slot.classList.remove('drag-over', 'invalid-placement');
        });
    }
    
    // 放置到裝備欄位
    function handleDropOnEquipSlot(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        const slot = e.currentTarget;
        slot.classList.remove('drag-over');
        
        // 暫時只處理 1x1 的物品
        if (draggedItem && draggedItem.dataset.width === '1' && draggedItem.dataset.height === '1') {
            const slotContent = slot.querySelector('.slot-content');
            
            if (slotContent.classList.contains('empty')) {
                slotContent.classList.remove('empty');
                slotContent.innerHTML = `
                    <img src="/assets/images/item-placeholder.png" alt="${draggedItem.querySelector('.item-name').textContent}">
                    <span class="equip-name ${draggedItem.querySelector('.item-rarity').className.split(' ')[1]}">${draggedItem.querySelector('.item-name').textContent}</span>
                `;
                
                // 移除背包中的物品
                draggedItem.remove();
                
                playSound('equip');
                addEquipEffect(slot);
            }
        }
        
        return false;
    }
    
    // 放置到物品欄位
    function handleDropOnInventorySlot(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        if (!draggedItem) return false;
        
        const slot = e.currentTarget;
        const slotX = parseInt(slot.dataset.x);
        const slotY = parseInt(slot.dataset.y);
        const width = parseInt(draggedItem.dataset.width);
        const height = parseInt(draggedItem.dataset.height);
        const itemId = draggedItem.dataset.itemId;
        
        // 根據用戶點擊的偏移調整實際放置位置
        // 用戶點擊的格子偏移需要從目標位置減去，讓物品以點擊點為參考放置
        const actualX = slotX - (dragOffset.gridX || 0);
        const actualY = slotY - (dragOffset.gridY || 0);
        
        // 清除高亮
        document.querySelectorAll('.inventory-slot').forEach(s => {
            s.classList.remove('drag-over', 'invalid-placement');
        });
        
        // 檢查是否可以放置（使用調整後的位置）
        if (canPlaceItem(actualX, actualY, width, height, itemId)) {
            // 更新物品位置（使用調整後的實際位置）
            draggedItem.dataset.x = actualX;
            draggedItem.dataset.y = actualY;
            draggedItem.style.left = `${actualX * 41}px`;
            draggedItem.style.top = `${actualY * 41}px`;
            
            // 標記新位置為已佔用
            markGridOccupied(actualX, actualY, width, height, itemId);
            
            playSound('drop');
        } else {
            playSound('error');
        }
        
        return false;
    }
    
    // 設置物品提示框
    function setupTooltips() {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip) return;

        // 為所有物品添加懸停事件
        document.addEventListener('mouseover', function(e) {
            const item = e.target.closest('.multi-slot-item');
            const equipSlot = e.target.closest('.equip-slot');

            if (item) {
                showItemTooltip(item, tooltip, e);
            } else if (equipSlot && !equipSlot.querySelector('.empty')) {
                showEquipTooltip(equipSlot, tooltip, e);
            }
        });

        document.addEventListener('mouseout', function(e) {
            const item = e.target.closest('.multi-slot-item');
            const equipSlot = e.target.closest('.equip-slot');
            const relatedTarget = e.relatedTarget;

            // 檢查滑鼠是否真的離開了元素（不是移動到子元素）
            if (item) {
                // 如果 relatedTarget 不存在，或不在 item 內部，才隱藏 tooltip
                if (!relatedTarget || !item.contains(relatedTarget)) {
                    hideTooltip(tooltip);
                }
            } else if (equipSlot && !item) {
                // 如果 relatedTarget 不存在，或不在 equipSlot 內部，才隱藏 tooltip
                if (!relatedTarget || !equipSlot.contains(relatedTarget)) {
                    hideTooltip(tooltip);
                }
            }
        });
        
        // 跟隨滑鼠移動
        document.addEventListener('mousemove', function(e) {
            if (tooltip.classList.contains('show')) {
                positionTooltip(tooltip, e);
            }
        });
    }
    
    // 顯示物品提示
    function showItemTooltip(item, tooltip, e) {
        const itemId = item.dataset.itemId;

        if (!itemId) {
            return;
        }

        // 檢查 i18n 系統是否已就緒
        if (!window.i18n || !window.i18n.currentTranslations || !window.i18n.currentTranslations.inventory) {
            console.warn('[showItemTooltip] i18n 系統尚未就緒，暫時不顯示 tooltip');
            return;
        }

        // 從 itemDatabase 取得物品資料，如果沒有則從 i18n 直接取得
        let itemData = itemDatabase[itemId];
        if (!itemData) {
            const i18nItem = window.i18n.currentTranslations.inventory.items?.[itemId];
            if (i18nItem) {
                itemData = {
                    id: parseInt(itemId),
                    name: i18nItem.name,
                    type: i18nItem.type,
                    icon: i18nItem.icon,
                    rarity: i18nItem.rarity,
                    width: i18nItem.width,
                    height: i18nItem.height,
                    stats: i18nItem.stats || {},
                    description: i18nItem.description
                };
            }
        }

        // 如果還是沒有資料，就不顯示 tooltip（避免顯示 undefined）
        if (!itemData) {
            console.warn(`[showItemTooltip] 找不到物品 ${itemId} 的資料`);
            return;
        }

        // 設置提示內容
        tooltip.querySelector('.tooltip-name').textContent = itemData.name;

        // 設置類型和尺寸（只有當 type 存在時才顯示）
        const typeElement = tooltip.querySelector('.tooltip-type');
        if (itemData.type && itemData.width && itemData.height) {
            typeElement.textContent = `${itemData.type} (${itemData.width}x${itemData.height})`;
            typeElement.style.display = '';  // 顯示
        } else {
            typeElement.style.display = 'none';  // 完全隱藏
        }

        // 設置屬性
        let statsHtml = '';
        for (const [stat, value] of Object.entries(itemData.stats || {})) {
            const valueStr = String(value);
            const color = valueStr.includes('-') || valueStr.includes('產生率') ? '#FF6666' : '#4AE54A';
            statsHtml += `<div>${stat}: <span style="color: ${color}">${valueStr}</span></div>`;
        }
        tooltip.querySelector('.tooltip-stats').innerHTML = statsHtml;

        // 設置描述
        tooltip.querySelector('.tooltip-description').textContent = itemData.description || '';

        // 設置稀有度顏色
        const nameElement = tooltip.querySelector('.tooltip-name');
        nameElement.className = 'tooltip-name ' + (itemData.rarity || 'common');

        // 顯示提示框
        tooltip.classList.add('show');
        positionTooltip(tooltip, e);
    }
    
    // 顯示裝備提示
    function showEquipTooltip(equipSlot, tooltip, e) {
        const slotType = equipSlot.dataset.slot;
        const slotContent = equipSlot.querySelector('.slot-content');
        const img = slotContent?.querySelector('img');
        const itemId = equipSlot.dataset.itemId;

        // 如果是空的裝備欄，不顯示提示
        if (!img || !itemId) {
            return;
        }

        // 檢查 i18n 系統是否已就緒
        if (!window.i18n || !window.i18n.currentTranslations || !window.i18n.currentTranslations.inventory) {
            console.warn('[showEquipTooltip] i18n 系統尚未就緒，暫時不顯示 tooltip');
            return;
        }

        // 從 itemDatabase 取得物品資料，如果沒有則從 i18n 直接取得
        let itemData = itemDatabase[itemId];

        if (!itemData) {
            const i18nItem = window.i18n.currentTranslations.inventory.items?.[itemId];
            if (i18nItem) {
                itemData = {
                    id: parseInt(itemId),
                    name: i18nItem.name,
                    type: i18nItem.type,
                    icon: i18nItem.icon,
                    rarity: i18nItem.rarity,
                    width: i18nItem.width,
                    height: i18nItem.height,
                    stats: i18nItem.stats || {},
                    description: i18nItem.description
                };
            }
        }

        // 如果還是沒有資料，就不顯示 tooltip（避免顯示 undefined）
        if (!itemData) {
            console.warn(`[showEquipTooltip] 找不到物品 ${itemId} 的資料`);
            return;
        }

        // 設置提示內容
        tooltip.querySelector('.tooltip-name').textContent = itemData.name;

        // 設置類型和裝備狀態（只有當 type 存在時才顯示）
        const typeElement = tooltip.querySelector('.tooltip-type');
        if (itemData.type) {
            typeElement.textContent = `${itemData.type} (已裝備)`;
            typeElement.style.display = '';  // 顯示
        } else {
            typeElement.style.display = 'none';  // 完全隱藏
        }

        // 設置屬性
        try {
            let statsHtml = '';
            for (const [stat, value] of Object.entries(itemData.stats || {})) {
                const valueStr = String(value);
                const color = valueStr.includes('-') || valueStr.includes('產生率') ? '#FF6666' : '#4AE54A';
                statsHtml += `<div>${stat}: <span style="color: ${color}">${valueStr}</span></div>`;
            }
            tooltip.querySelector('.tooltip-stats').innerHTML = statsHtml;

            // 設置描述
            tooltip.querySelector('.tooltip-description').textContent = itemData.description || '';

            // 設置稀有度顏色
            const nameElement = tooltip.querySelector('.tooltip-name');
            nameElement.className = 'tooltip-name ' + (itemData.rarity || 'common');

            tooltip.classList.add('show');
            positionTooltip(tooltip, e);
        } catch (error) {
            console.error('[showEquipTooltip] Error:', error, 'itemData:', itemData);
        }
    }
    
    // 隱藏提示框
    function hideTooltip(tooltip) {
        tooltip.classList.remove('show');
    }
    
    // 定位提示框
    function positionTooltip(tooltip, e) {
        const x = e.clientX + 15;
        const y = e.clientY + 15;
        
        // 確保提示框不會超出視窗
        const rect = tooltip.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;
        
        tooltip.style.left = Math.min(x, maxX) + 'px';
        tooltip.style.top = Math.min(y, maxY) + 'px';
    }
    
    // 添加物品欄特效
    function addInventoryEffects() {
        // 添加裝備光暈效果
        const equipSlots = document.querySelectorAll('.equip-slot');
        equipSlots.forEach(slot => {
            slot.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.05)';
            });
            
            slot.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
            });
        });
        
        // 添加物品懸停效果
        const items = document.querySelectorAll('.multi-slot-item');
        items.forEach(item => {
            // 傳說物品光暈效果已移除
        });
    }
    
    // 傳說物品光暈函式已移除
    
    // 裝備特效
    function addEquipEffect(slot) {
        slot.classList.add('equip-flash');
        setTimeout(() => {
            slot.classList.remove('equip-flash');
        }, 500);
    }
    
    // 播放音效
    function playSound(type) {
        // 這裡可以加入實際的音效播放邏輯
        console.log(`播放音效: ${type}`);
    }
    
    // 處理右鍵點擊（使用藥水）
    function handleRightClick(e) {
        e.preventDefault();
        
        const item = e.currentTarget;
        const itemId = item.dataset.itemId;
        const itemData = itemDatabase[itemId];
        
        // 檢查是否為可消耗品
        if (itemData && itemData.consumable) {
            usePotion(item, itemData);
        }
        
        return false;
    }
    
    // 使用藥水
    function usePotion(itemElement, itemData) {
        const effect = itemData.effect;
        let message = '';
        
        if (effect.hp) {
            message += `HP +${effect.hp} `;
        }
        if (effect.mp) {
            message += `MP +${effect.mp} `;
        }
        if (effect.sp) {
            message += `SP +${effect.sp} `;
        }
        if (effect.hpPercent) {
            message += `全能力 +${effect.hpPercent}% `;
        }
        
        // 顯示使用效果
        showPotionEffect(itemElement, message);
        
        // 播放使用音效
        playSound('potion');
        
        // 移除使用的藥水
        const x = parseInt(itemElement.dataset.x);
        const y = parseInt(itemElement.dataset.y);
        clearGridOccupied(x, y, 1, 1);
        
        // 添加消失動畫
        itemElement.style.animation = 'potion-drink 0.5s ease-out';
        setTimeout(() => {
            itemElement.remove();
        }, 500);
    }
    
    // 顯示藥水效果
    function showPotionEffect(itemElement, message) {
        const effectDiv = document.createElement('div');
        effectDiv.className = 'potion-effect';
        effectDiv.textContent = message;
        effectDiv.style.position = 'absolute';
        effectDiv.style.left = itemElement.style.left;
        effectDiv.style.top = itemElement.style.top;
        effectDiv.style.color = '#4AE54A';
        effectDiv.style.fontWeight = 'bold';
        effectDiv.style.fontSize = '1.2rem';
        effectDiv.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
        effectDiv.style.zIndex = '100';
        effectDiv.style.pointerEvents = 'none';
        effectDiv.style.animation = 'float-up 2s ease-out';
        
        itemElement.parentElement.appendChild(effectDiv);
        
        setTimeout(() => {
            effectDiv.remove();
        }, 2000);
    }
    
    // === 金幣系統 ===
    let goldAmount = 0;
    
    // 初始化金幣系統
    function initGoldSystem() {
        console.log('🎮 [金幣系統] 開始初始化');

        // 檢查是否有狀態管理系統
        const hasGameState = typeof window.GameState !== 'undefined';
        console.log('🎮 [金幣系統] GameState 存在:', hasGameState);

        if (hasGameState) {
            // 使用狀態管理系統的金幣數值
            goldAmount = window.GameState.getState().gold;
            console.log('🎮 [金幣系統] 從 GameState 讀取金幣:', goldAmount);
        } else {
            // 備用方案：使用固定的初始值
            goldAmount = 100000;
            console.log('🎮 [金幣系統] 使用預設金幣:', goldAmount);
        }

        updateGoldDisplay();

        // 為所有可互動元素添加事件監聽，觸發金幣增加
        addGoldEventListeners();
        console.log('✅ [金幣系統] 初始化完成');
    }
    
    // 更新金幣顯示
    function updateGoldDisplay() {
        const goldAmountElement = document.getElementById('gold-amount');
        if (goldAmountElement) {
            goldAmountElement.textContent = goldAmount.toLocaleString();
        }
    }
    
    // 增加金幣
    function addGold(amount) {
        console.log('💰 [addGold] 函數被呼叫', { amount });

        // 檢查死亡狀態，死亡時不能賺錢
        if (window.GameState && window.GameState.isPlayerDead && window.GameState.isPlayerDead()) {
            console.log('💀 [addGold] 玩家已死亡，無法獲得金幣');
            return; // 直接返回，不執行任何操作
        }

        if (!amount) {
            amount = Math.floor(Math.random() * 10) + 1; // 隨機 1-10
            console.log('🎲 [addGold] 隨機金額:', amount);
        }

        // 先消耗 SP/HP（整合點擊消耗機制）
        if (window.GameState && typeof window.GameState.handleClickDamage === 'function') {
            console.log('⚡ [addGold] 呼叫 handleClickDamage()');
            const consumedResource = window.GameState.handleClickDamage();
            console.log('📊 [addGold] consumedResource:', consumedResource);

            // 如果沒有成功消耗資源（可能因為死亡），則不給金幣
            if (!consumedResource) {
                console.log('❌ [addGold] 資源消耗失敗，不給金幣');
                return;
            }
        }

        const oldGold = goldAmount;
        goldAmount += amount;
        console.log(`💸 [addGold] 金幣變化: ${oldGold} → ${goldAmount} (+${amount})`);
        
        // 如果有狀態管理系統，同步更新
        const hasGameState = typeof window.GameState !== 'undefined';
        if (hasGameState) {
            window.GameState.changeGold(amount);
            // 從狀態管理系統讀取最新值（可能有上限控制）
            goldAmount = window.GameState.getState().gold;
        }
        
        updateGoldDisplay();
        
        // 觸發增加動畫
        const goldAmountElement = document.getElementById('gold-amount');
        if (goldAmountElement) {
            goldAmountElement.classList.add('increase-animation');
            setTimeout(() => {
                goldAmountElement.classList.remove('increase-animation');
            }, 500);
        }
        
        // 顯示金幣增加特效
        showGoldEffect(`+${amount}`);
        
        // 創建掉落金幣動畫
        createFallingCoin(amount);
    }
    
    // 扣除金幣
    function deductGold(amount) {
        if (!hasEnoughGold(amount)) {
            return false; // 金幣不足
        }
        
        goldAmount -= amount;
        
        // 如果有狀態管理系統，同步更新
        const hasGameState = typeof window.GameState !== 'undefined';
        if (hasGameState) {
            window.GameState.changeGold(-amount);
            // 從狀態管理系統讀取最新值
            goldAmount = window.GameState.getState().gold;
        }
        
        updateGoldDisplay();
        
        // 觸發減少動畫
        const goldAmountElement = document.getElementById('gold-amount');
        if (goldAmountElement) {
            goldAmountElement.classList.add('decrease-animation');
            setTimeout(() => {
                goldAmountElement.classList.remove('decrease-animation');
            }, 500);
        }
        
        // 顯示金幣減少特效
        showGoldEffect(`-${amount}`, 'decrease');
        
        return true; // 扣除成功
    }
    
    // 檢查金幣是否足夠
    function hasEnoughGold(amount) {
        // 如果有狀態管理系統，使用其數值檢查
        const hasGameState = typeof window.GameState !== 'undefined';
        if (hasGameState) {
            return window.GameState.hasEnoughGold(amount);
        }
        return goldAmount >= amount;
    }
    
    // 獲取當前金幣數量
    function getCurrentGold() {
        // 如果有狀態管理系統，從其獲取最新數值
        const hasGameState = typeof window.GameState !== 'undefined';
        if (hasGameState) {
            goldAmount = window.GameState.getState().gold;
        }
        return goldAmount;
    }
    
    // 顯示金幣特效
    function showGoldEffect(text, type = 'increase') {
        const goldDisplay = document.querySelector('.gold-display');
        if (!goldDisplay) return;
        
        const effectDiv = document.createElement('div');
        effectDiv.textContent = text;
        effectDiv.style.position = 'absolute';
        effectDiv.style.color = type === 'decrease' ? '#FF4444' : '#FFD700';
        effectDiv.style.fontWeight = 'bold';
        effectDiv.style.fontSize = '1rem';
        effectDiv.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
        effectDiv.style.zIndex = '1000';
        effectDiv.style.pointerEvents = 'none';
        effectDiv.style.animation = type === 'decrease' ? 'float-down 1.5s ease-out' : 'float-up 1.5s ease-out';
        effectDiv.style.left = '100%';
        effectDiv.style.top = '0';
        effectDiv.style.marginLeft = '10px';
        
        goldDisplay.style.position = 'relative';
        goldDisplay.appendChild(effectDiv);
        
        setTimeout(() => {
            effectDiv.remove();
        }, 1500);
    }
    
    // 創建掉落金幣動畫
    function createFallingCoin(amount) {
        // 根據金額決定掉落金幣數量（1-3個）
        const coinCount = Math.min(Math.ceil(amount / 5), 3);
        
        for (let i = 0; i < coinCount; i++) {
            setTimeout(() => {
                const coin = document.createElement('img');
                // 從已成功載入的星星圖片推導正確的 base URL
                const starImg = document.querySelector('.star-icon');
                let basePath = '';
                if (starImg && starImg.src) {
                    // 從星星圖片的完整 URL 中提取 base path
                    const starSrc = starImg.src;
                    const assetsIndex = starSrc.indexOf('/assets/images/star.png');
                    if (assetsIndex > -1) {
                        basePath = starSrc.substring(0, assetsIndex);
                    }
                }
                coin.src = basePath + '/assets/images/gold_coin.png';
                coin.className = 'falling-coin';
                coin.alt = '掉落金幣';
                
                // 隨機起始位置（螢幕寬度的中間範圍）
                const startX = Math.random() * (window.innerWidth * 0.6) + (window.innerWidth * 0.2);
                const randomOffset = (Math.random() - 0.5) * 200; // 左右搖擺
                
                // 設置初始位置
                coin.style.left = startX + 'px';
                coin.style.top = '-30px';
                coin.style.setProperty('--random-x', randomOffset + 'px');
                
                // 設置動畫持續時間（2-4秒）
                const fallDuration = Math.random() * 2 + 2;
                const glowDuration = Math.random() * 0.5 + 0.8; // 金光閃爍
                
                coin.style.animationDuration = `${fallDuration}s, ${glowDuration}s`;
                
                // 添加到頁面
                document.body.appendChild(coin);
                
                // 創建金光粒子效果
                createCoinParticles(coin, fallDuration);
                
                // 動畫結束後移除
                setTimeout(() => {
                    if (coin.parentNode) {
                        coin.remove();
                    }
                }, fallDuration * 1000 + 100);
            }, i * 200); // 錯開掉落時間
        }
    }
    
    // 創建金幣周圍的粒子效果
    function createCoinParticles(coinElement, duration) {
        const particleCount = Math.floor(Math.random() * 3) + 2; // 2-4個粒子
        
        for (let i = 0; i < particleCount; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'coin-particle';
                
                // 粒子從金幣位置開始
                const coinRect = coinElement.getBoundingClientRect();
                const particleX = coinRect.left + coinRect.width / 2;
                const particleY = coinRect.top + coinRect.height / 2;
                
                particle.style.left = particleX + 'px';
                particle.style.top = particleY + 'px';
                
                // 隨機粒子移動方向
                const moveX = (Math.random() - 0.5) * 80;
                const moveY = (Math.random() - 0.5) * 60;
                
                particle.style.setProperty('--particle-x', moveX + 'px');
                particle.style.setProperty('--particle-y', moveY + 'px');
                
                // 粒子動畫持續時間（較短）
                const particleDuration = Math.random() * 0.8 + 0.5;
                particle.style.animationDuration = particleDuration + 's';
                
                document.body.appendChild(particle);
                
                // 移除粒子
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.remove();
                    }
                }, particleDuration * 1000 + 50);
            }, Math.random() * (duration * 1000 * 0.5)); // 在金幣掉落的前半程隨機出現
        }
    }
    
    // 為各種互動元素添加金幣事件監聽
    function addGoldEventListeners() {
        console.log('🪙 [金幣系統] 初始化事件監聽器');

        // 物品拖拽事件
        document.addEventListener('dragstart', () => addGold());
        document.addEventListener('dragend', () => addGold());

        // 滑鼠點擊事件 - 點擊任何地方都會加金幣
        document.addEventListener('click', (e) => {
            console.log('🖱️ [金幣系統] 點擊事件', {
                target: e.target.className
            });
            console.log('✅ [金幣系統] 觸發 addGold()');
            addGold();
        });
        
        // 滑鼠右鍵事件（藥水使用等）
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.d2-inventory-panel')) {
                addGold();
            }
        });
        
        // hover 事件（查看物品）
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('.multi-slot-item') || e.target.closest('.item')) {
                // 較少的金幣增加機率，避免過於頻繁
                if (Math.random() < 0.1) {
                    addGold(1);
                }
            }
        });
    }
    
    // 監聽 i18n 初始化完成事件
    function initInventoryWhenI18nReady() {
        initInventorySystem();
        console.log('物品系統已初始化（i18n 系統已就緒）');
    }

    // 監聽 i18n 事件
    window.addEventListener('i18nInitialized', initInventoryWhenI18nReady);
    window.addEventListener('languageChanged', () => {
        loadItemDatabase();
        // 重新更新顯示的物品文字
        updateItemDisplayTexts();
        console.log('語言切換：物品資料已重新載入');
    });

    // 導出初始化函數供 main.js 調用
    window.initInventorySystem = function() {
        // 如果 i18n 已載入，直接初始化內部系統；否則等待事件
        if (window.i18n && window.i18n.currentTranslations) {
            initInventoryWhenI18nReady();  // 呼叫內部的初始化包裝函數
        }
        // 否則等待 i18nInitialized 事件
    };
    window.initGoldSystem = initGoldSystem;
    
    // 導出金幣系統函數供其他模組使用
    window.deductGold = deductGold;
    window.hasEnoughGold = hasEnoughGold;
    window.getCurrentGold = getCurrentGold;
    window.addGold = addGold;
})();