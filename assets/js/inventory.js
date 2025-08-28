// Diablo 2 風格物品欄系統
(function() {
    'use strict';
    
    // 物品資料庫
    const itemDatabase = {
        1: {
            id: 1,
            name: '祖傳RGB機械鍵盤',
            type: '武器',
            icon: '/assets/images/item-keyboard-new.png',
            rarity: 'legendary',
            width: 4,
            height: 2,
            stats: {
                '打字速度': '+150 WPM',
                'Bug 產生率': '+200%',
                '噪音等級': '鄰居報警',
                'RGB光污染': '+999%',
                '電費消耗': '+50W',
                '裝逼值': '+500%'
            },
            description: '據說是從上古程式設計師手中傳承下來的神器，每個按鍵都刻著「Hello World」的印記。現在還多了足以照亮整個辦公室的RGB燈效。使用時會發出震耳欲聾的青軸聲，同時用彩虹燈光閃瞎所有同事。警告：夜間使用可能會被誤認為是夜店。'
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
        },
        27: {
            id: 27,
            name: '露營區經營者專業帳篷',
            type: '經營裝備',
            icon: '/assets/images/item-tent.png',
            rarity: 'epic',
            width: 4,
            height: 4,
            stats: {
                '露營場地規劃': '+500%',
                '客戶服務品質': '+300%',
                '營運管理效率': '+400%',
                '自然環境適應': '+200%',
                '團隊協調能力': '+250%',
                '戶外活動策劃': '+350%'
            },
            description: '經營露營區的王者裝備！這頂帳篷見證過無數「為什麼蚊子總是找到縫隙」和「遊客半夜上廁所迷路記」。從精準計算每個營位都能看到最美夕陽，到處理各種奇葩客訴（包括但不限於：為什麼沒有WiFi、為什麼星星不夠亮、為什麼營火不會自己生），每一次經歷都是血淚史。副作用：看到任何空地都會自動開始盤算可以放幾個帳篷。'
        },
        28: {
            id: 28,
            name: '神級4K彩虹螢幕',
            type: '顯示設備',
            icon: '/assets/images/item-monitor.png',
            rarity: 'legendary',
            width: 3,
            height: 3,
            stats: {
                '程式碼清晰度': '+400%',
                '眼睛疲勞': '+50%',
                '電費支出': '+200W',
                '工作效率': '+180%',
                '色彩精準度': '+999%',
                '鄰居羨慕值': '+300%'
            },
            description: '傳說中程式師的終極顯示器，擁有完美的色彩還原和4K解析度。彩虹漸層設計讓每一行程式碼都變得如藝術品般美麗。特殊功能：Debug時會自動高亮顯示Bug位置，但也會讓你看到之前沒注意到的其他Bug。警告：長期使用可能會讓你對其他螢幕產生嚴重的色彩潔癖。'
        },
        29: {
            id: 29,
            name: 'RGB炫光電競滑鼠',
            type: '周邊設備',
            icon: '/assets/images/item-gaming-mouse.png',
            rarity: 'rare',
            width: 2,
            height: 2,
            stats: {
                'DPI精確度': '+12000',
                'RGB光污染': '+150%',
                '點擊壽命': '+500萬次',
                '手感順滑度': '+200%',
                '電競氛圍': '+300%',
                '滑鼠墊磨損': '+500%'
            },
            description: '每個程式師都需要的精準操控工具，內建1600萬色RGB燈光系統。特殊功能：寫Bug時會自動亮紅燈警告，Debug成功時會閃綠燈慶祝。副作用：RGB燈光可能會比你寫的程式碼還要炫目。'
        },
        30: {
            id: 30,
            name: '降噪電競耳機',
            type: '周邊設備',
            icon: '/assets/images/item-gaming-headset.png',
            rarity: 'epic',
            width: 2,
            height: 2,
            stats: {
                '降噪效果': '+95%',
                '音質清晰度': '+400%',
                '老闆聲音過濾': '+200%',
                '專注力提升': '+180%',
                '社交隔離': '+300%',
                '頭髮壓扁度': '+100%'
            },
            description: '程式師的終極專注神器，能完美隔離辦公室的一切雜音。特殊功能：自動過濾會議通知聲和老闆叫名字的聲音。警告：可能會讓你錯過重要會議，但也會讓你錯過無聊會議，算是平手。'
        },
        31: {
            id: 31,
            name: '復古風遊戲手把',
            type: '娛樂設備',
            icon: '/assets/images/item-gamepad.png',
            rarity: 'magic',
            width: 2,
            height: 2,
            stats: {
                '遊戲技能': '+150%',
                '工作效率': '-50%',
                '懷舊情懷': '+999%',
                '手指靈活度': '+200%',
                '時間消耗': '+6小時/天',
                '童年回憶': '無價'
            },
            description: '辦公桌下的秘密武器，表面上是在「測試使用者介面」，實際上是在重溫童年時光。特殊功能：當工作壓力過大時會自動啟動「放鬆模式」。副作用：可能會讓你在重要簡報時不小心按出遊戲音效。'
        },
        32: {
            id: 32,
            name: '教學互動桌遊百寶箱',
            type: '教學工具',
            icon: '/assets/images/item-board-game.png',
            rarity: 'epic',
            width: 4,
            height: 4,
            stats: {
                '教學技巧': '+400%',
                '學員互動': '+350%',
                '溝通表達': '+500%',
                '課程設計': '+300%',
                '氣氛營造': '+450%',
                '知識傳遞': '+380%'
            },
            description: '教學界的終極欺騙道具！表面上是在玩遊戲，實際上是在偷偷塞知識到學員腦袋裡。包含「讓學員以為自己很聰明」系列和「不知不覺學會東西」經典款。特殊功能：能將最無聊的理論包裝成刺激的遊戲體驗，讓學員玩到忘記時間。警告：使用後可能被學員評價為「史上最狡猾但最有效的老師」。'
        },
        33: {
            id: 33,
            name: '傳統武術修身養性套組',
            type: '修練裝備',
            icon: '/assets/images/item-martial-arts.png',
            rarity: 'legendary',
            width: 4,
            height: 4,
            stats: {
                '身體素質': '+300%',
                '自信心': '+400%',
                '意志力': '+250%',
                '身材管理': '+500%',
                '心理韌性': '+350%',
                '專注力': '+300%'
            },
            description: '童年被爸媽丟去練武的「受害者」紀念套組！從「師父，我的腿好痠」到「咦，褲子怎麼變鬆了」的神奇變身之旅。這套裝備見證了從小胖墩到有腹肌的華麗轉身，以及從「我不敢」到「我可以」的自信爆棚過程。特殊效果：遇到困難時會自動回想起師父的魔鬼訓練，瞬間獲得「我連這個都熬過來了還怕什麼」的無敵心態。副作用：看到別人姿勢不標準會忍不住想糾正。'
        },
        34: {
            id: 34,
            name: '創作者靈感筆記套組',
            type: '創作工具',
            icon: '/assets/images/item-paper-pen.png',
            rarity: 'rare',
            width: 2,
            height: 2,
            stats: {
                '文字創作': '+450%',
                '遊戲分析': '+400%',
                '批判思考': '+350%',
                '靈感捕捉': '+500%',
                '觀察敏銳度': '+380%',
                '表達能力': '+420%'
            },
            description: '專業吐槽遊戲的神器！這支筆寫過無數「這個遊戲到底在想什麼」和「設計師你出來我保證不打你」的怨念文章。從「這個Boss設計得太變態了吧」到「居然讓我哭了這群混蛋」的情感起伏，每一篇評論都是真情流露。特殊技能：能將玩家心中複雜的愛恨情仇轉化為讀者秒懂的文字。警告：使用過度可能導致看到爛遊戲就手癢想寫評論的職業病。'
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
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        
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
    
    // === 金幣系統 ===
    let goldAmount = 0;
    
    // 初始化金幣系統
    function initGoldSystem() {
        // 隨機初始化金幣數量 (10-99999)
        goldAmount = Math.floor(Math.random() * 99990) + 10;
        updateGoldDisplay();
        
        // 為所有可互動元素添加事件監聽，觸發金幣增加
        addGoldEventListeners();
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
        if (!amount) {
            amount = Math.floor(Math.random() * 10) + 1; // 隨機 1-10
        }
        
        goldAmount += amount;
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
        return goldAmount >= amount;
    }
    
    // 獲取當前金幣數量
    function getCurrentGold() {
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
        // 物品拖拽事件
        document.addEventListener('dragstart', () => addGold());
        document.addEventListener('dragend', () => addGold());
        
        // 滑鼠點擊事件
        document.addEventListener('click', (e) => {
            // 只對遊戲界面內的點擊觸發金幣增加
            if (e.target.closest('.d2-inventory-panel') || 
                e.target.closest('.rpg-interface')) {
                addGold();
            }
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
    
    // 導出初始化函數供 main.js 調用
    window.initInventorySystem = initInventorySystem;
    window.initGoldSystem = initGoldSystem;
    
    // 導出金幣系統函數供其他模組使用
    window.deductGold = deductGold;
    window.hasEnoughGold = hasEnoughGold;
    window.getCurrentGold = getCurrentGold;
    window.addGold = addGold;
})();