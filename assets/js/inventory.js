// Diablo 2 風格物品欄系統
(function() {
    'use strict';
    
    // 物品資料庫
    const itemDatabase = {
        1: {
            id: 1,
            name: '祖傳鍵盤',
            type: '武器',
            icon: '⌨️',
            rarity: 'legendary',
            width: 2,
            height: 3,
            stats: {
                '打字速度': '+150 WPM',
                'Bug 產生率': '+200%',
                '噪音等級': '鄰居報警'
            },
            description: '據說是從上古程式設計師手中傳承下來的神器，每個按鍵都刻著「Hello World」的印記。使用時會發出震耳欲聾的青軸聲。'
        },
        2: {
            id: 2,
            name: '永遠喝不完的咖啡',
            type: '消耗品',
            icon: '☕',
            rarity: 'legendary',
            width: 1,
            height: 1,
            stats: {
                '清醒度': '+∞',
                '手抖機率': '+50%',
                '廁所頻率': '+300%'
            },
            description: '傳說中的無限咖啡杯，但喝了之後你會開始懷疑人生為什麼要寫程式。'
        },
        3: {
            id: 3,
            name: '橡皮鴨偵錯師',
            type: '寵物',
            icon: '🦆',
            rarity: 'rare',
            width: 1,
            height: 1,
            stats: {
                'Debug 效率': '+80%',
                '自言自語': '+100%',
                '理智值': '-20'
            },
            description: '最忠實的程式設計夥伴，永遠不會嫌你的程式碼很爛，因為它不會說話。'
        },
        4: {
            id: 4,
            name: '失效的 Senior 光環',
            type: '飾品',
            icon: '💫',
            rarity: 'rare',
            width: 1,
            height: 1,
            stats: {
                '裝逼能力': '+100%',
                '實際能力': '+0%',
                '會議發言權': '+50%'
            },
            description: '戴上後會散發出一股「我很資深」的氣場，但遇到真正的技術問題時會自動失效。'
        },
        5: {
            id: 5,
            name: 'Stack Overflow 護身符',
            type: '護符',
            icon: '🛡️',
            rarity: 'common',
            width: 1,
            height: 2,
            stats: {
                '複製貼上速度': '+200%',
                '原創性': '-100%',
                '問題解決率': '+75%'
            },
            description: '遇到問題時會自動開啟瀏覽器搜尋，但要小心被標記為「重複問題」。'
        },
        6: {
            id: 6,
            name: '過期的拉麵',
            type: '食物',
            icon: '🍜',
            rarity: 'common',
            width: 1,
            height: 1,
            stats: {
                '飽足感': '+30',
                '健康值': '-10',
                '懷舊感': '+50'
            },
            description: '每個工程師櫃子裡都有的神秘物品，過期日期已經模糊不清，但餓的時候還是會吃。'
        },
        7: {
            id: 7,
            name: '神秘的 USB',
            type: '未知',
            icon: '/assets/images/item-usb-new.png',
            rarity: 'rare',
            width: 1,
            height: 2,
            stats: {
                '好奇心': '+100%',
                '病毒風險': '+???%',
                '重要資料': '也許有',
                '插入次數': '+99次',
                '正反面判斷': '永遠錯誤'
            },
            description: '不知道從哪裡撿到的 USB，裡面可能是公司機密、迷因圖片，或是毁滅世界的病毒。特殊能力：無論怎麼插都要翻三次面才能插對。'
        },
        8: {
            id: 8,
            name: '永遠載入中的進度條',
            type: '詛咒物品',
            icon: '/assets/images/item-loading.png',
            rarity: 'legendary',
            width: 2,
            height: 1,
            stats: {
                '耐心': '-50%',
                '等待時間': '+∞',
                '完成度': '99%'
            },
            description: '據說是從 Windows Update 中提取出來的神秘物質，永遠卡在 99%。'
        },
        9: {
            id: 9,
            name: '壞掉的滑鼠',
            type: '武器',
            icon: '🖱️',
            rarity: 'common',
            width: 1,
            height: 2,
            stats: {
                '點擊精準度': '-30%',
                '雙擊機率': '+200%',
                '摔桌機率': '+150%'
            },
            description: '左鍵有時候會變成右鍵，右鍵有時候不會動，但丟掉又捨不得。'
        },
        10: {
            id: 10,
            name: '註解之書',
            type: '書籍',
            icon: '📖',
            rarity: 'legendary',
            width: 1,
            height: 2,
            stats: {
                '程式可讀性': '+200%',
                '程式碼行數': '+100%',
                '同事好感度': '+50'
            },
            description: '傳說中記載著「//TODO: 修復這個 Bug」的神秘書籍，但從來沒有人真的去修。'
        },
        // 藥水系列
        11: {
            id: 11,
            name: '紅牛能量飲',
            type: '藥水',
            icon: '/assets/images/potion-red.png',
            rarity: 'common',
            width: 1,
            height: 1,
            color: 'red',
            consumable: true,
            stats: {
                'HP 回復': '+100',
                '翅膀': '不會長出來'
            },
            description: '號稱給你翅膀，但喝了只會心跳加速。右鍵點擊使用。',
            effect: { hp: 100 }
        },
        12: {
            id: 12,
            name: '藍色螢幕藥水',
            type: '藥水',
            icon: '/assets/images/potion-blue.png',
            rarity: 'common',
            width: 1,
            height: 1,
            color: 'blue',
            consumable: true,
            stats: {
                'MP 回復': '+50',
                '藍屏機率': '+10%'
            },
            description: '喝下後會讓你想起 Windows 的美好時光。右鍵點擊使用。',
            effect: { mp: 50 }
        },
        13: {
            id: 13,
            name: '綠茶去油解膩',
            type: '藥水',
            icon: '/assets/images/potion-green.png',
            rarity: 'common',
            width: 1,
            height: 1,
            color: 'green',
            consumable: true,
            stats: {
                'SP 回復': '+30',
                '清爽度': '+100%'
            },
            description: '專門解決吃太多泡麵的罪惡感。右鍵點擊使用。',
            effect: { sp: 30 }
        },
        14: {
            id: 14,
            name: '神秘紫色藥水',
            type: '藥水',
            icon: '/assets/images/potion-purple.png',
            rarity: 'rare',
            width: 1,
            height: 1,
            color: 'purple',
            consumable: true,
            stats: {
                '全能力回復': '+10%',
                '副作用': '未知'
            },
            description: '不知道是誰調配的神秘配方，喝了可能會看到程式碼在跳舞。右鍵點擊使用。',
            effect: { hpPercent: 10, mpPercent: 10, spPercent: 10 }
        },
        15: {
            id: 15,
            name: '程式師 T 恤',
            type: '護甲',
            icon: '/assets/images/armor-hoodie.png',
            rarity: 'legendary',
            width: 2,
            height: 3,
            stats: {
                '防禦力': '+500',
                '保暖度': '+100%',
                '宅度': '+200%',
                '社交迴避': '+300%',
                '編碼效率': '+50%'
            },
            description: '程式設計師的終極戰衣，穿上它就能在家裡寫 code 48 小時不出門。可以有效阻擋他人跟漂亮妹妹的打擾。'
        },
        16: {
            id: 16,
            name: '戰神級電競筆電',
            type: '武器',
            icon: '/assets/images/gaming-laptop.png',
            rarity: 'legendary',
            width: 2,
            height: 3,
            stats: {
                'FPS 效能': '+300',
                'RGB 燈效': '+1000%',
                '滝風噪音': '+500 分貝',
                '暖手溫度': '+85°C',
                '電費消耗': '+999%',
                '重量': '10 公斤'
            },
            description: 'Windows 電競筆電的終極形態，擁有 RTX 9090Ti 雙顯卡和 128GB RAM。RGB 燈效可以讓你的編碼速度提升 300%，但也會讓你的電費帳單提升 1000%。內建渦輪增壓滝風系統，可以讓你在寫 code 時享受飛機引擎般的音效。'
        },
        17: {
            id: 17,
            name: '防滑鍵盤手套',
            type: '手套',
            icon: '/assets/images/gloves-coding.png',
            rarity: 'rare',
            width: 2,
            height: 2,
            stats: {
                '打字速度': '+120 WPM',
                'Ctrl+C/V 精準度': '+200%',
                '手汗吸收': '+100%',
                '腳膝痛緩解': '-50%',
                '清潔鍵盤頻率': '-90%'
            },
            description: '專為程式設計師設計的高科技手套，內建手汗吸收系統，讓你在緊張的 debug 時刻也能保持乾爽。特殊材質可以減少 90% 的清潔鍵盤次數，因為鍵盤永遠不會髒了。'
        },
        18: {
            id: 18,
            name: '極速 Debug 運動鞋',
            type: '鞋子',
            icon: '/assets/images/boots-programming.png',
            rarity: 'legendary',
            width: 2,
            height: 2,
            stats: {
                '跑步速度': '+50%',
                '踩 Bug 精準度': '+200%',
                '加班耐久度': '+500%',
                '氣墊效果': '+10cm',
                '跑路消耗': '-100%',
                '臭味稍滞': '+999%'
            },
            description: '傳說中的程式師專用運動鞋，雖然從來沒用來運動過。特殊設計讓你在趣便利商店買消夜和趣茶水間上廁所時移動速度 +50%。內建氣墊可以讓你看起來高 10 公分，但也會讓你的腳臭味增加 999%。'
        },
        19: {
            id: 19,
            name: '藍光過濾眼鏡',
            type: '頭盔',
            icon: '/assets/images/helmet-glasses.png',
            rarity: 'legendary',
            width: 2,
            height: 2,
            stats: {
                '視力保護': '+200%',
                '暗光視野': '+300%',
                '魅力值': '-50',
                '智慧外觀': '+100%',
                'Bug 辨識率': '+150%',
                '眼鏡起霧': '+500%'
            },
            description: '傳說中的程式師戰鬥眼鏡，可以過濾 99.9% 的藍光，讓你在凌晨 3 點還能繼續看螢幕。特殊鏡片讓你可以在一片漆黑中看到 Bug 的所在。唯一的缺點是戴上它之後，喝熱咖啡時會瞬間起霧。'
        },
        20: {
            id: 20,
            name: '加班戰士皮帶',
            type: '腰帶',
            icon: '/assets/images/belt-leather.png',
            rarity: 'rare',
            width: 2,
            height: 1,
            stats: {
                '腰圍承受力': '+500%',
                '久坐耐久度': '+800%',
                '褲子松緊度': '自動調節',
                '咖啡杯掛載': '+4',
                '肚子隐藏': '+30%',
                '皮帶打人傷害': '+999'
            },
            description: '程式師必備的戰術皮帶，可以根據你吃了多少消夜自動調節松緊度。內建 4 個咖啡杯掛鉤，讓你在辦公室裡移動時不用手拿咖啡。當主管問你為什麼進度落後時，可以用來自我鞭笞。'
        },
        21: {
            id: 21,
            name: '永不摘下的結婚戒指',
            type: '戒指',
            icon: '/assets/images/ring-wedding.png',
            rarity: 'legendary',
            width: 1,
            height: 1,
            stats: {
                '責任感': '+1000%',
                '自由度': '-500%',
                '加班抵抗': '+200%',
                '私房錢': '-90%',
                '幸福值': '隨機波動',
                '回家時間': '提早 3 小時'
            },
            description: '傳說中的程式師必備裝備，一旦裝備就無法卸下。可以大幅提升你的責任感，但同時也會讓你的私房錢消失 90%。特殊效果：當老婆打電話時，會自動停止所有 debug 工作。'
        },
        22: {
            id: 22,
            name: '人體工學電競椅',
            type: '副手',
            icon: '/assets/images/shield-chair.png',
            rarity: 'legendary',
            width: 2,
            height: 3,
            stats: {
                '坐姿矯正': '+300%',
                '腰椎保護': '+500%',
                '屁股麻痺機率': '-80%',
                '轉椅子速度': '+200%',
                '午睡舒適度': '+999%',
                '價格': '月薪 x 2'
            },
            description: '傳說中的終極電競椅，擁有 180 度躺平功能，可以讓你在辦公室裡躺平睡覺。RGB 燈光可以提升編碼速度 50%，但主要功用還是讓你在等待編譯時轉圈圈。唯一的缺點是價格相當於兩個月薪水。'
        },
        23: {
            id: 23,
            name: '綠色乖乖護身符',
            type: '項鍊',
            icon: '/assets/images/amulet-bravo.png',
            rarity: 'legendary',
            width: 1,
            height: 1,
            stats: {
                '系統穩定性': '+999%',
                '當機率': '-95%',
                'Bug 迴避率': '+300%',
                '伺服器正常運行時間': '+365天',
                '椰子香氣': '+100%',
                '過期倒數': '-180天'
            },
            description: '台灣工程師代代相傳的神秘護符，只要放在機器旁邊就能讓設備乖乖運作。警告：千萬不能吃掉，否則會觸怒乖乖之神導致系統崩潰。記得每半年更換一次，過期會失效。注意：只有綠色包裝才有效，黃色會讓系統警告，紅色會讓系統當機！'
        },
        24: {
            id: 24,
            name: '程式師續命神湯',
            type: '消耗品',
            icon: '/assets/images/coffee-energy.png',
            rarity: 'magic',
            width: 1,
            height: 1,
            consumable: true,
            effect: 'sp',
            value: 100,
            stats: {
                'SP 回復': '+100',
                '提神效果': '+300%',
                '熬夜能力': '+6小時',
                '心跳加速': '+50%',
                '手抖機率': '+25%',
                '失眠機率': '+80%'
            },
            description: '傳說中的程式師續命神器，一杯下去立刻精神百倍！內含三倍濃縮咖啡因，可讓你在凌晨 3 點還能寫出完美的程式碼。副作用：可能會讓你看到不存在的 Bug，或是把正確的程式碼改成錯的。警告：一天不能喝超過 10 杯，否則會變成咖啡因驅動的編碼機器人。'
        },
        25: {
            id: 25,
            name: '加班戰士鍊條戒指',
            type: '戒指',
            icon: '/assets/images/ring-chain.png',
            rarity: 'unique',
            width: 1,
            height: 1,
            stats: {
                '加班承受力': '+300%',
                '老闆召喚抗性': '+50%',
                '深夜專注力': '+200%',
                '週末逃脫': '-75%',
                '咖啡因需求': '+150%',
                '社交生活': '-90%'
            },
            description: '傳說中加班族的終極裝備，戴上後你就是辦公室的不敗戰神。警告：長期佩戴可能會忘記回家的路，並且對陽光產生過敏反應。特殊效果：當老闆說「這很簡單，應該很快就能做完」時，會自動啟動心理防護罩。'
        },
        26: {
            id: 26,
            name: '工地級防護手套',
            type: '防具',
            icon: '/assets/images/item-work-gloves.png',
            rarity: 'epic',
            width: 2,
            height: 2,
            stats: {
                '鍵盤保護': '+500%',
                '滑鼠壽命': '+300%',
                '打字準確度': '-20%',
                '觸控螢幕敏感度': '-95%',
                '專業度外觀': '+200%',
                '手部受傷率': '-90%'
            },
            description: '從建築工地偷來的專業手套，原本是用來搬磚頭的，現在被拿來保護程式師的纖細雙手。警告：戴上後打字會變得笨重，但看起來超級專業。特殊效果：當需要修理實體設備時，會自動啟動「我很懂硬體」的氣場。副作用：可能會讓你想要去工地打工。'
        }
    };
    
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
        
        initializeGrid();
        generateGridSlots();
        positionItems();
        setupDragAndDrop();
        setupTooltips();
        addInventoryEffects();
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
        draggedItem = e.target;
        draggedFromSlot = null; // 記錄原始位置
        
        // 清除原位置的佔用
        const x = parseInt(draggedItem.dataset.x);
        const y = parseInt(draggedItem.dataset.y);
        const width = parseInt(draggedItem.dataset.width);
        const height = parseInt(draggedItem.dataset.height);
        
        clearGridOccupied(x, y, width, height);
        
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        
        // 計算拖動偏移
        const rect = e.target.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        
        playSound('pickup');
    }
    
    // 多格物品拖動結束
    function handleMultiSlotDragEnd(e) {
        e.target.classList.remove('dragging');
        
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
            const x = parseInt(slot.dataset.x);
            const y = parseInt(slot.dataset.y);
            const width = parseInt(draggedItem.dataset.width);
            const height = parseInt(draggedItem.dataset.height);
            const itemId = draggedItem.dataset.itemId;
            
            // 高亮顯示會佔用的格子
            highlightGridArea(x, y, width, height, canPlaceItem(x, y, width, height, itemId));
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
        const x = parseInt(slot.dataset.x);
        const y = parseInt(slot.dataset.y);
        const width = parseInt(draggedItem.dataset.width);
        const height = parseInt(draggedItem.dataset.height);
        const itemId = draggedItem.dataset.itemId;
        
        // 清除高亮
        document.querySelectorAll('.inventory-slot').forEach(s => {
            s.classList.remove('drag-over', 'invalid-placement');
        });
        
        // 檢查是否可以放置
        if (canPlaceItem(x, y, width, height, itemId)) {
            // 更新物品位置
            draggedItem.dataset.x = x;
            draggedItem.dataset.y = y;
            draggedItem.style.left = `${x * 41}px`;
            draggedItem.style.top = `${y * 41}px`;
            
            // 標記新位置為已佔用
            markGridOccupied(x, y, width, height, itemId);
            
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
            
            if (item || equipSlot) {
                hideTooltip(tooltip);
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
        const itemData = itemDatabase[itemId];
        
        if (!itemData) return;
        
        // 設置提示內容
        tooltip.querySelector('.tooltip-name').textContent = itemData.name;
        tooltip.querySelector('.tooltip-type').textContent = `${itemData.type} (${itemData.width}x${itemData.height})`;
        
        // 設置屬性
        let statsHtml = '';
        for (const [stat, value] of Object.entries(itemData.stats)) {
            statsHtml += `<div>${stat}: <span style="color: #4AE54A">${value}</span></div>`;
        }
        tooltip.querySelector('.tooltip-stats').innerHTML = statsHtml;
        
        // 設置描述
        tooltip.querySelector('.tooltip-description').textContent = itemData.description;
        
        // 設置稀有度顏色
        const nameElement = tooltip.querySelector('.tooltip-name');
        nameElement.className = 'tooltip-name ' + itemData.rarity;
        
        // 顯示提示框
        tooltip.classList.add('show');
        positionTooltip(tooltip, e);
    }
    
    // 顯示裝備提示
    function showEquipTooltip(equipSlot, tooltip, e) {
        const slotType = equipSlot.dataset.slot;
        const slotContent = equipSlot.querySelector('.slot-content');
        const img = slotContent.querySelector('img');
        const itemId = equipSlot.dataset.itemId;
        
        // 如果是空的裝備欄，不顯示提示
        if (!img || !itemId) return;
        
        // 從 itemDatabase 取得物品資料
        const itemData = itemDatabase[itemId];
        if (!itemData) return;
        
        // 設置提示內容
        tooltip.querySelector('.tooltip-name').textContent = itemData.name;
        tooltip.querySelector('.tooltip-type').textContent = `${itemData.type} (已裝備)`;
        
        // 設置屬性
        let statsHtml = '';
        for (const [stat, value] of Object.entries(itemData.stats)) {
            const color = value.includes('-') || value.includes('產生率') ? '#FF6666' : '#4AE54A';
            statsHtml += `<div>${stat}: <span style="color: ${color}">${value}</span></div>`;
        }
        tooltip.querySelector('.tooltip-stats').innerHTML = statsHtml;
        
        // 設置描述
        tooltip.querySelector('.tooltip-description').textContent = itemData.description;
        
        // 設置稀有度顏色
        const nameElement = tooltip.querySelector('.tooltip-name');
        nameElement.className = 'tooltip-name ' + itemData.rarity;
        
        tooltip.classList.add('show');
        positionTooltip(tooltip, e);
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
    
    // 導出初始化函數供 main.js 調用
    window.initInventorySystem = initInventorySystem;
})();