/* ===== 召喚系統 JavaScript 功能 ===== */

(function() {
    'use strict';

    // 召喚系統設定
    const SUMMON_CONFIG = {
        cost: 10000, // 召喚費用
        rarityRates: {
            1: 25, // 1星 25%
            2: 25, // 2星 25%  
            3: 20, // 3星 20%
            4: 15,  // 4星 15%
            5: 15   // 5星 15%
        },
        // 重複角色轉金幣設定
        duplicateGoldRewards: {
            1: 200,   // 1星重複 = 200金幣
            2: 1000,  // 2星重複 = 1000金幣
            3: 3000,  // 3星重複 = 3000金幣
            4: 5000,  // 4星重複 = 5000金幣
            5: 20000  // 5星重複 = 20000金幣
        }
    };

    // 夥伴資料庫 - 從 i18n 系統載入
    let COMPANION_DATA = {};

    // 從 i18n 系統載入夥伴資料
    function loadCompanionData() {
        if (window.i18n && window.i18n.currentTranslations && window.i18n.currentTranslations.summon) {
            const i18nCompanions = window.i18n.currentTranslations.summon.companions;
            COMPANION_DATA = {};

            // 轉換 i18n 格式到原有的資料結構
            for (const [rarity, companions] of Object.entries(i18nCompanions)) {
                COMPANION_DATA[rarity] = [];
                for (const [id, companion] of Object.entries(companions)) {
                    COMPANION_DATA[rarity].push({
                        id: id,
                        name: companion.name,
                        description: companion.description,
                        image: companion.image,
                        skills: companion.skills || []
                    });
                }
            }

            console.log('夥伴資料已從 i18n 系統載入:', Object.keys(COMPANION_DATA).map(rarity => `${rarity}星${COMPANION_DATA[rarity].length}個`).join(', '));
        } else {
            console.warn('i18n 系統尚未載入或夥伴資料不存在，使用預設資料');
            // 使用原始硬編碼資料作為 fallback
            COMPANION_DATA = originalCompanionData;
        }
    }

    // 原始夥伴資料庫（作為備用，稍後將移除）
    const originalCompanionData = {
        1: [ // 1星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_newbie',
                name: '武術新手',
                description: '剛開始接觸武術的初學者，動作還不標準但充滿熱忱。總是問「這個動作要怎麼做？」的好奇寶寶。',
                image: 'assets/images/companions/martial_newbie.webp',
                skills: ['基本動作', '學習熱忱']
            },
            {
                id: 'japanese_student',
                name: '日文學習者',
                description: '努力背五十音的日文初學者，每天都在「あいうえお」和「さしすせそ」之間掙扎。最愛說「頑張って！」',
                image: 'assets/images/companions/japanese_student.webp',
                skills: ['五十音', '基礎會話']
            },
            {
                id: 'ocean_beginner',
                name: '海洋運動新手',
                description: '第一次下海就被浪打翻的勇敢新手，雖然技術還很菜但對大海充滿敬畏和嚮往。',
                image: 'assets/images/companions/ocean_beginner.webp',
                skills: ['基礎游泳', '海洋適應']
            },
            {
                id: 'camping_rookie',
                name: '露營菜鳥',
                description: '帶了一堆裝備但不知道怎麼用的露營新手，搭帳篷要花三小時但依然樂在其中。',
                image: 'assets/images/companions/camping_rookie.webp',
                skills: ['裝備研究', '野外求生']
            },
            {
                id: 'boardgame_newbie',
                name: '桌遊新手',
                description: '剛接觸桌遊的玩家，看規則書看得頭暈但玩起來超認真。最常說「我還是不太懂...」',
                image: 'assets/images/companions/boardgame_newbie.webp',
                skills: ['規則學習', '遊戲熱忱']
            },
            {
                id: 'newbie_engineer',
                name: '新手工程師',
                description: '剛踏入程式世界的新夥伴，每天都在「Hello World」和「ChatGPT」之間徘徊，充滿學習熱忱但經常被分號搞瘋！',
                image: 'assets/images/companions/newbie_engineer.webp',
                skills: ['基礎除錯', 'Hello World']
            }
        ],
        2: [ // 2星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_practitioner',
                name: '武術練習者',
                description: '已經掌握基本功的武術愛好者，開始學習套路和對練。偶爾會在訓練中展現不錯的身手，但還需要更多磨練。',
                image: 'assets/images/companions/martial_practitioner.webp',
                skills: ['基本套路', '對練技巧']
            },
            {
                id: 'japanese_enthusiast',
                name: '日文愛好者',
                description: '已經能進行簡單日常對話的學習者，最愛看日劇和動漫練聽力。經常說「そうですね」和「頑張りましょう」！',
                image: 'assets/images/companions/japanese_enthusiast.webp',
                skills: ['日常對話', '文化理解']
            },
            {
                id: 'ocean_sports_fan',
                name: '海洋運動愛好者',
                description: '已經能在海中自在游泳的運動者，開始嘗試衝浪、潛水等進階項目。對海洋有著深深的熱愛和尊重。',
                image: 'assets/images/companions/ocean_sports_fan.webp',
                skills: ['游泳技巧', '水中平衡']
            },
            {
                id: 'camping_enthusiast',
                name: '露營愛好者',
                description: '已經掌握基本露營技能的戶外愛好者，能快速搭建營地。開始挑戰更偏僻的露營地點，享受與自然的親密接觸。',
                image: 'assets/images/companions/camping_enthusiast.webp',
                skills: ['快速搭營', '野外料理']
            },
            {
                id: 'boardgame_player',
                name: '桌遊玩家',
                description: '已經熟悉多種桌遊的玩家，開始深入研究策略和技巧。桌遊聚會的常客，總是帶著新遊戲來和大家分享。',
                image: 'assets/images/companions/boardgame_player.webp',
                skills: ['遊戲策略', '規則解說']
            },
            {
                id: 'frontend_artist',
                name: '前端美工師',
                description: '對像素有著病態執著的完美主義者，能為了1px的偏差熬夜到天亮。瀏覽器兼容性是他最大的噩夢，但CSS動畫是他的最愛！',
                image: 'assets/images/companions/frontend_artist.webp',
                skills: ['像素級調整', 'CSS魔法']
            }
        ],
        3: [ // 3星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'martial_junior',
                name: '努力練功的學弟',
                description: '總是練不好但還是努力來參加練功的學校學弟，比賽時都被秒殺但他從來都不在乎，心理素質強健到讓人佩服！永遠保持著初心和熱忱。',
                image: 'assets/images/companions/martial_junior.webp',
                skills: ['不屈精神', '心理素質', '持續努力']
            },
            {
                id: 'boardgame_shop_manager',
                name: '桌遊店店長',
                description: '桌遊店老闆的得力助手，一邊要處理課務一邊還要在需要人玩桌遊的時候來湊咖，還要處理客服，全能型店長。什麼事情都能搞定，是店裡不可缺少的萬能人才！',
                image: 'assets/images/companions/boardgame_shop_manager.webp',
                skills: ['課務處理', '湊咖專家', '客服應對', '全能管理']
            },
            {
                id: 'boardgame_companion_master',
                name: '桌遊店陪玩大哥',
                description: '時常出沒在桌遊店的大哥，不管我們在玩什麼他好像都會玩，缺咖時的最佳補位選手。總是能在關鍵時刻現身，拯救人數不足的窘境！',
                image: 'assets/images/companions/boardgame_companion_master.webp',
                skills: ['萬能補位', '遊戲精通', '關鍵救場', '社交達人']
            },
            {
                id: 'ocean_sports_teacher',
                name: '不太會海洋運動的海洋運動老師',
                description: '游泳課老師永遠都在岸上保護同學安全，經典語句「像鞭子一樣打水」，每次一下水就會落水。理論知識滿分，實際操作零分的最佳典範！',
                image: 'assets/images/companions/ocean_sports_teacher.webp',
                skills: ['岸上指導', '理論專精', '落水專家', '安全至上']
            }
        ],
        4: [ // 4星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'cute_martial_sister',
                name: '一起練功的可愛妹妹',
                description: '練功偶爾會出現的稀有人物，每次出現大家都會更努力練功。你說她打得不好？有人在乎嗎？她的存在本身就是最強的 buff！',
                image: 'assets/images/companions/cute_martial_sister.webp',
                skills: ['激勵光環', '可愛魅力', '稀有出現']
            },
            {
                id: 'tsundere_coach_daughter',
                name: '武術教練的女兒',
                description: '為人傲嬌，傲佔比大概是9.5:0.5，平時看似高冷但偶爾會露出關心的一面。一出手就打得你不要不要，是少見的女練家子，實力不容小覷！',
                image: 'assets/images/companions/tsundere_coach_daughter.webp',
                skills: ['傲嬌魅力', '驚人實力', '女武者氣質']
            },
            {
                id: 'boardgame_shop_owner',
                name: '桌遊店老闆',
                description: '桌遊店扛霸子，會玩超多桌遊，每次都跟他請教非常多遊戲的玩法，冷門熱門都會玩，說是桌遊博士都不為過。活體桌遊百科全書，什麼規則問題都難不倒他！',
                image: 'assets/images/companions/boardgame_shop_owner.webp',
                skills: ['桌遊博士', '規則達人', '教學專精', '遊戲百科']
            },
            {
                id: 'rowing_ocean_classmate',
                name: '划船的海洋運動同學',
                description: '來自海休系的幹話王，有色無膽，就是划船真的有夠會划，跟他上課划水的專業程度差不多。滿嘴幹話但划船技術絕對專業，是海上的划槳大師！',
                image: 'assets/images/companions/rowing_ocean_classmate.webp',
                skills: ['划船專精', '幹話連發', '有色無膽', '划水專業']
            },
            {
                id: 'river_tracing_instructor_buddy',
                name: '一起當溯溪教練的同學',
                description: '溯溪三個月的好戰友，同住一間房，同上一個班，一起騎車去花蓮，一起從花蓮環半島回高雄，溯溪之前不熟，一起去才發現又是一個幹話王。患難與共的真兄弟！',
                image: 'assets/images/companions/river_tracing_instructor_buddy.webp',
                skills: ['患難與共', '幹話戰友', '長途騎行', '溯溪教學']
            },
            {
                id: 'skip_class_buddy',
                name: '一起翹課的同學',
                description: '在宿舍猜拳決定要不要去上課的好夥伴，贏了就直接不去，一句廢話都沒有的真男人。簡單粗暴的決策方式，但友情最真摯！',
                image: 'assets/images/companions/skip_class_buddy.webp',
                skills: ['猜拳決勝', '真男人風範', '簡單決策', '翹課專家']
            },
            {
                id: 'camping_neighbor_leader',
                name: '露營區的像原住民但其實不是的鄰居',
                description: '講話有夠大聲，什麼亂七八糟的事都可以找他處理，選村長的話第一個就選他，可惜他就不是原住民，不能參選村長。天生的領袖氣質，卻被身分限制了政治抱負！',
                image: 'assets/images/companions/camping_neighbor_leader.webp',
                skills: ['大聲公', '萬事通', '領袖氣質', '身分尷尬']
            },
            {
                id: 'frontend_otaku_teammate',
                name: '轉職營同組國手',
                description: '前端臭宅工程師，跑得飛快，組內前端扛霸子。雖然是個宅宅，但前端技術功力深厚，而且意外地體能很好，是組內不可缺少的技術擔當！',
                image: 'assets/images/companions/frontend_otaku_teammate.webp',
                skills: ['前端國手', '臭宅之力', '飛毛腿', '技術扛霸']
            },
            {
                id: 'designer_big_sister',
                name: '轉職營同組設計師',
                description: '平面設計出生的大姊，組內的設計擔當。成熟穩重的大姊頭風範，用專業的設計眼光和豐富的經驗，讓整個專案的視覺呈現完美無瑕！',
                image: 'assets/images/companions/designer_big_sister.webp',
                skills: ['設計眼光', '大姊風範', '平面專業', '視覺完美']
            }
        ],
        5: [ // 5星夥伴 - 在這裡添加你的個人化夥伴
            {
                id: 'kids_martial_coach',
                name: '小孩武術團的武術教練',
                description: '除了擅長強身健體之外，還擅長關心同學的身心靈健康，就像大家的第二個媽媽一樣。溫暖的笑容和耐心的指導，讓每個小朋友都能在武術中找到自信。',
                image: 'assets/images/companions/kids_martial_coach.webp',
                skills: ['身心靈指導', '母性關愛', '兒童教學', '健體專精']
            },
            {
                id: 'grand_martial_master',
                name: '武術團總教練',
                description: '平常不苟言笑，走路手都背在後面，你以為他很廢，殊不知一出手就被打趴。深藏不露的武術宗師，用沉默和實力詮釋什麼叫真正的高手風範。',
                image: 'assets/images/companions/grand_martial_master.webp',
                skills: ['深藏不露', '宗師實力', '無言威嚴', '一擊制勝']
            },
            {
                id: 'youth_martial_coach',
                name: '青年武術團武術教練',
                description: '一群死屁孩的孩子王，任何練習都與學員一起操作，屁孩們都服他！除了武術指導外還要自己記帳，是個文武雙全的全能型教練。',
                image: 'assets/images/companions/youth_martial_coach.webp',
                skills: ['孩子王魅力', '全能教學', '帳務管理', '青年領導']
            },
            {
                id: 'heavyweight_powerhouse',
                name: '力量最強的重擊級同學',
                description: '平常看起來傻傻的憨厚同學，但一耍狠起來小孩直接嚇尿！有什麼打不開、搬不動的東西都叫他，是全團公認的力量擔當。',
                image: 'assets/images/companions/heavyweight_powerhouse.webp',
                skills: ['絕對力量', '重擊專精', '憨厚外表', '威嚇氣場']
            },
            {
                id: 'featherweight_trickster',
                name: '最靈活的羽量級同學',
                description: '幹話最多最滿，全團最欠揍的就是他！但想揍他都揍不到，只能不講武德的圍毆。每次抓到都被痛扁一頓，但下次還是繼續欠揍。',
                image: 'assets/images/companions/featherweight_trickster.webp',
                skills: ['極致靈活', '幹話連發', '閃避專精', '挨揍耐受']
            },
            {
                id: 'lightweight_prodigy',
                name: '最萬能的輕量級同學',
                description: '身強體壯，講話又幹又油，但武術的架式最滿的就他，深得教練真傳！總教練最納悶的就是不知道為什麼可以油成這樣。',
                image: 'assets/images/companions/lightweight_prodigy.webp',
                skills: ['完美架式', '全能體質', '嘴砲技巧', '教練真傳']
            },
            {
                id: 'elder_level_student',
                name: '最穩重的長老級同學',
                description: '人又高又壯，長得還跟你爸差不多老，出門在外需要年齡認證都找他！教職員：「您好，請問是哪位小朋友的家長呢？」永遠的團內長者擔當。',
                image: 'assets/images/companions/elder_level_student.webp',
                skills: ['長者威嚴', '家長氣質', '年齡認證', '穩重可靠']
            },
            {
                id: 'master_river_tracing_instructor',
                name: '溯溪教練的教練',
                description: '培訓課程時在溯溪的路程上一手抓住了差點摔下去的蓋倫，沒有他就沒有今天的蓋倫。真正的生命守護者，用實力和經驗拯救生命的溯溪大師！',
                image: 'assets/images/companions/master_river_tracing_instructor.webp',
                skills: ['生命守護', '溯溪大師', '危機救援', '經驗傳承']
            },
            {
                id: 'ruby_godfather_teacher',
                name: '轉職實戰營的台灣 Ruby 教父',
                description: '恨鐵不成鋼的嚴格老師，最愛問同學有沒有問題，如果沒人有問題大家就慘了。用嚴厲的愛鍛造出無數 Ruby 戰士，是程式界的斯巴達教官！',
                image: 'assets/images/companions/ruby_godfather_teacher.webp',
                skills: ['恨鐵不成鋼', 'Ruby 神技', '斯巴達教學', '沉默恐懼']
            },
            {
                id: 'css_master_teacher',
                name: '轉職實戰營的 HTML 和 CSS 領路人',
                description: '像個帥氣的 CSS 大俠，切版的手速快的比 AI 還快，就是啪，好了。行雲流水的切版技巧讓學生們瞠目結舌，是前端界的絕世高手！',
                image: 'assets/images/companions/css_master_teacher.webp',
                skills: ['光速切版', 'CSS 大俠', '帥氣絕倫', '秒殺 AI']
            },
            {
                id: 'js_gentle_teacher',
                name: '轉職實戰營的 JS 老師',
                description: '講話溫和彬彬有禮，一開口就馬上讓程式菜鳥們全體當機。溫柔的外表下隱藏著深不可測的 JavaScript 功力，是最可怕的溫柔殺手！',
                image: 'assets/images/companions/js_gentle_teacher.webp',
                skills: ['溫和殺手', 'JS 深淵', '集體當機', '禮貌致命']
            },
            {
                id: 'project_assistant_teacher',
                name: '轉職實戰營的專案助教',
                description: '年紀輕輕的 Ruby 軟體工程師，看起來人模人樣殊不知幹話一堆，但技術那是真的罩。外表正經內心狂野，是最會搞笑的技術大神！',
                image: 'assets/images/companions/project_assistant_teacher.webp',
                skills: ['幹話連發', 'Ruby 真神', '人模人樣', '技術罩門']
            },
            {
                id: 'team_leader_cs_girl',
                name: '轉職營同組隊長',
                description: '年紀輕輕的資工背景妹子，講話有條有理，把組員治的服服貼貼，一肩扛起專案的推進。天生的領導者，讓所有人都心服口服的女王！',
                image: 'assets/images/companions/team_leader_cs_girl.webp',
                skills: ['女王氣場', '有條有理', '專案推進', '資工背景']
            },
            {
                id: 'brave_rookie_manager',
                name: '敢收菜鳥蓋倫的勇敢主管',
                description: '為人好相處又精明，工程師生涯最符合的主管就是他，講話有條理又能擋住來自其他團隊的隕石，讓蓋倫可以安心練等的最強守門員。真正懂得保護團隊的智慧領導者！',
                image: 'assets/images/companions/brave_rookie_manager.webp',
                skills: ['隕石防禦', '智慧領導', '菜鳥培育', '團隊守護']
            },
            {
                id: 'first_backend_mentor',
                name: '第一位後端大哥',
                description: '看起來冷冷的其實是個熱心腸的好人，常常利用時間傳授開發心得，真的熟了會發現講話也是很幹。外冷內熱的技術導師，用幹話包裝的溫暖傳承！',
                image: 'assets/images/companions/first_backend_mentor.webp',
                skills: ['外冷內熱', '技術傳承', '幹話包裝', '後端真神']
            },
            {
                id: 'cooperative_frontend_guy',
                name: '配合的前端帥哥',
                description: '交易員出生的轉職仔，跟蓋倫一樣透過轉職營入坑，一起在工作上互相傷害跟打嘴砲。雖然背景不同但志同道合，是最佳的工作夥伴兼互相吐槽對象！',
                image: 'assets/images/companions/cooperative_frontend_guy.webp',
                skills: ['交易員思維', '轉職戰士', '互相傷害', '嘴砲專精']
            },
            {
                id: 'cooperative_data_analyst',
                name: '配合的資料分析師帥哥',
                description: '看起來老老實實但一出手就直接把你捏爆，資料分析知識深厚，公司戰力天花板。平時溫和有禮，但數據分析能力強到讓人懷疑人生的隱藏boss！',
                image: 'assets/images/companions/cooperative_data_analyst.webp',
                skills: ['數據捏爆', '分析天花板', '溫和外表', '隱藏戰力']
            },
            {
                id: 'poor_qa_pm',
                name: '可憐的 QA 兼 PM',
                description: '標準好好先生，什麼工作都逆來順受，什麼鳥事都一肩扛起。明明是 QA 卻要兼 PM，明明是 PM 卻要做所有雜事，是團隊中最辛苦但最可靠的存在！',
                image: 'assets/images/companions/poor_qa_pm.webp',
                skills: ['逆來順受', '一肩扛起', '全能雜工', '好好先生']
            },
            {
                id: 'bootcamp_partner_engineer',
                name: '轉職營的夥伴工程師',
                description: '轉職營的同學後來在公司相遇，一起處理了很多公司的破事，是團隊後端的重要戰鬥力。同窗情誼加上工作默契，讓彼此成為最信賴的戰友！',
                image: 'assets/images/companions/bootcamp_partner_engineer.webp',
                skills: ['同窗情誼', '破事處理', '後端戰力', '默契搭檔']
            },
            {
                id: 'other_group_instructor',
                name: '實戰營的別組助教',
                description: '從公務員轉職成的超猛工程師，連嘴砲都超猛，罵得你渾身舒爽。技術實力強悍，教學方式更是一針見血，是那種會讓你痛並快樂著的嚴師！',
                image: 'assets/images/companions/other_group_instructor.webp',
                skills: ['公務員轉職', '嘴砲專精', '一針見血', '嚴師風範']
            },
            {
                id: 'traditional_company_engineer',
                name: '傳產的同事工程師',
                description: '最愛在上班時間直播開他的小貨車送大家去吃麥當勞，無拘無束技術力又猛，工程師中的遊俠就是他。自由靈魂配上強悍實力，是最有趣的工作夥伴！',
                image: 'assets/images/companions/traditional_company_engineer.webp',
                skills: ['小貨車直播', '無拘無束', '遊俠精神', '麥當勞專送']
            },
            {
                id: 'company_guardian_manager',
                name: '公司守護者',
                description: '每天都開不完的主管，公司的第一把交椅，沒他技術團隊馬上瓦解，一天可幹十六小時，沒人知道他在什麼時候睡覺。真正的公司守護神，用生命在守護整個團隊的運作！',
                image: 'assets/images/companions/company_guardian_manager.webp',
                skills: ['永不睡眠', '團隊支柱', '十六小時戰士', '公司守護神']
            },
            {
                id: 'deceived_devops_developer',
                name: '被騙來做功能開發的 DevOps',
                description: '明明是作為 DevOps 被招募進來，但沒日沒夜的被安排功能開發都沒有崩潰，心靈非常強健。從基礎設施到功能開發無所不能，是最被低估但最全能的技術戰士！',
                image: 'assets/images/companions/deceived_devops_developer.webp',
                skills: ['心靈鋼鐵', '全能開發', 'DevOps 精神', '被騙不崩潰']
            }
        ]
    };

    // 使用者已召喚的夥伴清單
    let summonedCompanions = [];

    // 狀態機實例（新架構）
    let stateMachine = null;

    // 動畫控制器實例（新架構）
    let animationController = null;

    // 初始化召喚系統
    function initSummonSystem() {
        console.log('召喚系統初始化完成');

        // 初始化狀態機
        if (window.SummonStateMachine) {
            stateMachine = new window.SummonStateMachine();
            console.log('狀態機已初始化');
        } else {
            console.warn('狀態機模組未載入');
        }

        // 初始化動畫控制器
        if (window.SummonAnimationController) {
            animationController = new window.SummonAnimationController();
            // 延遲初始化 DOM（確保頁面載入完成）
            setTimeout(() => {
                if (animationController.initialize()) {
                    console.log('動畫控制器已初始化');
                } else {
                    console.warn('動畫控制器初始化失敗');
                    animationController = null;
                }
            }, 100);
        } else {
            console.warn('動畫控制器模組未載入');
        }

        // 載入夥伴資料
        loadCompanionData();

        // 載入已召喚的夥伴
        loadSummonedCompanions();

        // 更新圖鑑顯示
        updateCompanionCollection();

        // 添加滾動事件監聽器來修復進度條位置問題
        let scrollTimeout;
        window.addEventListener('scroll', function() {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                // 滾動停止後重新觸發進度條更新
                forceProgressBarUpdate();
            }, 150);
        });

        // 也在視窗大小改變時重新觸發
        window.addEventListener('resize', function() {
            setTimeout(() => {
                forceProgressBarUpdate();
            }, 100);
        });
    }

    // 執行召喚
    function performSummon() {
        // 使用狀態機檢查
        if (stateMachine && !stateMachine.isIdle()) {
            console.log('召喚進行中，請稍候...');
            return;
        }

        // 狀態轉換：IDLE -> CHECKING_COST
        if (stateMachine) {
            if (!stateMachine.transition(window.SummonState.CHECKING_COST)) {
                console.error('無法開始召喚流程');
                return;
            }
        } else {
            console.warn('[召喚系統] 狀態機未初始化');
        }

        // 檢查金幣是否足夠
        if (!window.hasEnoughGold || !window.hasEnoughGold(SUMMON_CONFIG.cost)) {
            showSummonMessage('金幣不足！需要 ' + SUMMON_CONFIG.cost.toLocaleString() + ' 金幣', 'error');
            // 重置狀態
            if (stateMachine) stateMachine.reset();
            return;
        }

        // 扣除金幣
        if (!window.deductGold || !window.deductGold(SUMMON_CONFIG.cost)) {
            showSummonMessage('扣除金幣失敗！', 'error');
            // 重置狀態
            if (stateMachine) stateMachine.reset();
            return;
        }

        // 狀態轉換：CHECKING_COST -> ROLLING
        // 計算召喚結果
        const rarity = calculateSummonRarity();
        const companion = getRandomCompanion(rarity);

        if (stateMachine) {
            stateMachine.transition(window.SummonState.ROLLING, { companion, rarity });
        }

        // console.log(`召喚到: ${companion.name} (${rarity}星)`);
        // console.log('目前已召喚的角色清單:', summonedCompanions.map(c => `${c.name}(x${c.count || 1})`));

        // 添加到已召喚清單並獲取處理結果
        const processedCompanion = addCompanionToCollection(companion);

        // 狀態轉換：ROLLING -> ANIMATING
        if (stateMachine) {
            stateMachine.transition(window.SummonState.ANIMATING);
        }

        // 觸發召喚動畫
        if (animationController) {
            // 使用新的動畫控制器
            animationController.play(rarity, () => {
                // 動畫完成後顯示結果
                showSummonResult(processedCompanion, rarity);
            });
        } else {
            // 如果動畫控制器未初始化，直接顯示結果
            console.warn('[召喚系統] 動畫控制器未初始化，直接顯示結果');
            showSummonResult(processedCompanion, rarity);
        }
    }

    // 計算召喚稀有度
    function calculateSummonRarity() {
        const random = Math.random() * 100;
        let cumulativeRate = 0;
        
        // 從低星到高星累加機率
        for (let rarity = 1; rarity <= 5; rarity++) {
            cumulativeRate += SUMMON_CONFIG.rarityRates[rarity];
            if (random < cumulativeRate) {
                return rarity;
            }
        }
        
        return 1; // 保險起見，預設返回1星
    }

    // 獲取隨機夥伴
    function getRandomCompanion(rarity) {
        const companions = COMPANION_DATA[rarity];
        if (!companions || companions.length === 0) {
            // 如果該稀有度沒有夥伴，返回1星
            return COMPANION_DATA[1][0];
        }
        
        const randomIndex = Math.floor(Math.random() * companions.length);
        return { ...companions[randomIndex], rarity };
    }


    // 顯示召喚結果
    function showSummonResult(companion, rarity) {
        // console.log('開始顯示召喚結果:', companion, rarity);

        // 狀態轉換：ANIMATING -> SHOWING_RESULT
        if (stateMachine) {
            stateMachine.transition(window.SummonState.SHOWING_RESULT);
        }

        const resultModal = document.querySelector('.summon-result-modal');
        if (!resultModal) {
            // console.error('找不到召喚結果模態框');
            // 重置狀態機
            if (stateMachine) stateMachine.reset();
            return;
        }
        
        // 更新標題為夥伴名稱，如果是重複角色則顯示特殊標題
        const modalTitle = resultModal.querySelector('.modal-header h3');
        if (modalTitle) {
            if (companion.isDuplicate) {
                const duplicateTitle = window.i18n?.currentTranslations?.summon?.result?.duplicate_title || '獲得金幣！';
                modalTitle.innerHTML = `<img src="/assets/images/pile_of_gold_coins.webp" alt="金幣" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;">${duplicateTitle}`;
            } else {
                modalTitle.textContent = companion.name;
            }
        }

        // 更新結果顯示
        const companionImage = resultModal.querySelector('.companion-image img');
        const companionName = resultModal.querySelector('.companion-name');
        const companionDescription = resultModal.querySelector('.companion-description');
        const companionSkills = resultModal.querySelector('.companion-skills');
        const rarityStars = resultModal.querySelector('.rarity-stars');

        // 設置圖片，如果失敗則隱藏圖片元素
        if (companionImage) {
            companionImage.src = companion.image;
            companionImage.onerror = function() {
                // 不再嘗試載入不存在的 placeholder.webp
                // 改為隱藏圖片，或用 CSS 顯示預設樣式
                this.style.display = 'none';
                console.log('夥伴圖片不存在:', companion.image);
            };
        } else {
            console.error('找不到夥伴圖片元素');
        }
        
        if (companionName) {
            if (companion.isDuplicate) {
                // 重複角色不顯示任何文字，保持簡潔
                companionName.textContent = '';
            } else {
                companionName.textContent = companion.name;
            }
            console.log('設置待實現名稱:', companion.name);
        } else {
            console.error('找不到待實現名稱元素');
        }
        
        if (companionDescription) {
            if (companion.isDuplicate) {
                // 重複角色顯示簡化的金幣轉換資訊 - 使用安全的 DOM 操作
                companionDescription.innerHTML = '';

                const duplicateNotice = document.createElement('div');
                duplicateNotice.className = 'duplicate-notice';
                duplicateNotice.style.cssText = 'text-align: center; padding: 20px;';

                const i18nResult = window.i18n?.currentTranslations?.summon?.result || {};

                const title = document.createElement('p');
                title.style.cssText = 'font-size: 1em; margin-bottom: 15px;';
                const convertedText = i18nResult.duplicate_converted || '「{{name}}」已轉換為金幣獎勵';
                title.textContent = convertedText.replace('{{name}}', companion.name);

                const goldDisplay = document.createElement('div');
                goldDisplay.style.cssText = 'background: linear-gradient(45deg, #FFD700, #FFA500); padding: 15px; border-radius: 8px; color: #000; font-weight: bold; font-size: 1.3em; display: flex; align-items: center; justify-content: center; gap: 10px;';

                const goldIcon = document.createElement('img');
                goldIcon.src = '/assets/images/pile_of_gold_coins.webp';
                goldIcon.alt = '金幣';
                goldIcon.style.cssText = 'width: 32px; height: 32px;';

                const goldText = document.createElement('span');
                const goldRewardText = i18nResult.duplicate_gold || '獲得 {{amount}} 金幣';
                goldText.textContent = goldRewardText.replace('{{amount}}', companion.goldReward?.toLocaleString());

                const note = document.createElement('p');
                note.style.cssText = 'font-size: 0.9em; color: #888; margin-top: 10px;';
                note.textContent = i18nResult.duplicate_notice || '重複角色不會增加收藏數量';

                goldDisplay.appendChild(goldIcon);
                goldDisplay.appendChild(goldText);
                duplicateNotice.appendChild(title);
                duplicateNotice.appendChild(goldDisplay);
                duplicateNotice.appendChild(note);
                companionDescription.appendChild(duplicateNotice);
            } else {
                companionDescription.textContent = companion.description;
            }
            console.log('設置待實現描述:', companion.description);
        } else {
            console.error('找不到待實現描述元素');
        }
        
        // 顯示技能（重複角色不顯示技能）
        if (companionSkills) {
            if (companion.isDuplicate) {
                // 重複角色不顯示額外的金幣資訊，保持簡潔
                companionSkills.innerHTML = '';
            } else {
                companionSkills.innerHTML = companion.skills.map(skill => 
                    `<span class="skill-tag">${skill}</span>`
                ).join('');
            }
            console.log('設置技能:', companion.skills);
        } else {
            console.error('找不到技能元素');
        }

        // 顯示星數（只顯示實際星數，不顯示灰色星星）
        if (rarityStars) {
            const fullStars = '<img src="/assets/images/star.webp" alt="★" class="star-icon">'.repeat(rarity);
            rarityStars.innerHTML = fullStars;
            rarityStars.className = `rarity-stars rarity-${rarity}`;
            console.log(`設置 ${rarity} 星星數`);
        } else {
            console.error('找不到星數元素');
        }

        // 設置背景效果並顯示模態框
        let modalClass = `summon-result-modal rarity-${rarity} show`;
        if (companion.isDuplicate) {
            modalClass += ' duplicate-result';
        }
        resultModal.className = modalClass;
        console.log('模態框已設置為顯示狀態');
    }

    // 添加夥伴到收藏
    function addCompanionToCollection(companion) {
        // 檢查是否已經擁有
        const existingCompanion = summonedCompanions.find(c => c.id === companion.id);
        
        if (existingCompanion) {
            // 重複角色：完全轉換為金幣，不增加角色數量
            const goldReward = SUMMON_CONFIG.duplicateGoldRewards[companion.rarity];
            // console.log(`檢測到重複角色: ${companion.name} (${companion.rarity}星), 轉換為 ${goldReward} 金幣`);
            
            // 檢查 addGold 函數是否存在
            if (window.addGold && typeof window.addGold === 'function') {
                window.addGold(goldReward);
                // 金幣變化日誌已移除，避免洩露遊戲狀態
            } else {
                // console.error('window.addGold 函數不存在或不是函數類型');
                // console.log('window.addGold:', typeof window.addGold, window.addGold);
            }
            
            // 重複角色不增加數量，完全轉為金幣
            // existingCompanion.count 保持不變
            
            // 標記為重複，用於顯示不同的結果
            companion.isDuplicate = true;
            companion.goldReward = goldReward;
            
            // console.log(`重複角色 ${companion.name} 已轉換為 ${goldReward} 金幣，不增加收藏數量`);
        } else {
            // 新角色：正常添加
            companion.count = 1;
            companion.isDuplicate = false;
            summonedCompanions.push(companion);
            // console.log(`新角色 ${companion.name} (${companion.rarity}星) 已加入收藏`);
        }
        
        saveSummonedCompanions();
        // 重新啟用召喚後的圖鑑更新
        updateCompanionDisplay();
        // 移除可能導致無限迴圈的 console.log
        // console.log('召喚完成，圖鑑已更新');
        
        return companion; // 返回可能被修改的角色資訊
    }

    // 更新夥伴展示（簡化版，只更新統一圖鑑）
    function updateCompanionDisplay() {
        // 直接更新統一圖鑑顯示
        updateCompanionCollection();
    }
    
    // 更新夥伴圖鑑（統一顯示）
    function updateCompanionCollection() {
        // 計算收集統計
        updateCollectionStats();
        
        // 使用統一網格顯示所有角色
        updateUnifiedGrid();
    }
    
    // 計算並更新收集統計
    function updateCollectionStats() {
        let totalCompanions = 0;
        let collectedCompanions = 0;
        const rarityStats = { 1: { total: 0, collected: 0 }, 2: { total: 0, collected: 0 }, 3: { total: 0, collected: 0 }, 4: { total: 0, collected: 0 }, 5: { total: 0, collected: 0 } };
        
        // 統計所有角色數量
        for (let rarity = 1; rarity <= 5; rarity++) {
            const companions = COMPANION_DATA[rarity] || [];
            totalCompanions += companions.length;
            rarityStats[rarity].total = companions.length;
            
            // 統計已收集的角色
            companions.forEach(companion => {
                const collected = summonedCompanions.find(c => c.id === companion.id);
                if (collected) {
                    collectedCompanions++;
                    rarityStats[rarity].collected++;
                }
            });
        }
        
        // 更新總體統計
        const collectionPercentage = totalCompanions > 0 ? Math.round((collectedCompanions / totalCompanions) * 100) : 0;
        
        const collectedCountEl = document.getElementById('collected-count');
        const totalCountEl = document.getElementById('total-count');
        const collectionProgressBar = document.getElementById('collection-progress-bar');
        const collectionPercentageEl = document.getElementById('collection-percentage');
        
        // 移除可能導致無限迴圈的 console.log
        // console.log('統計結果:', { collectedCompanions, totalCompanions, collectionPercentage });
        // console.log('找到的元素:', { 
        //     collectedCountEl: !!collectedCountEl, 
        //     totalCountEl: !!totalCountEl, 
        //     collectionProgressBar: !!collectionProgressBar,
        //     collectionPercentageEl: !!collectionPercentageEl 
        // });
        
        if (collectedCountEl) collectedCountEl.textContent = collectedCompanions;
        if (totalCountEl) totalCountEl.textContent = totalCompanions;
        if (collectionProgressBar) collectionProgressBar.style.width = `${collectionPercentage}%`;
        if (collectionPercentageEl) collectionPercentageEl.textContent = `${collectionPercentage}%`;
        
        // 更新各星級統計
        for (let rarity = 1; rarity <= 5; rarity++) {
            const collectedEl = document.getElementById(`rarity-${rarity}-collected`);
            const totalEl = document.getElementById(`rarity-${rarity}-total`);
            const categoryCollectedEl = document.getElementById(`category-${rarity}-collected`);
            const categoryTotalEl = document.getElementById(`category-${rarity}-total`);
            
            if (collectedEl) collectedEl.textContent = rarityStats[rarity].collected;
            if (totalEl) totalEl.textContent = rarityStats[rarity].total;
            if (categoryCollectedEl) categoryCollectedEl.textContent = rarityStats[rarity].collected;
            if (categoryTotalEl) categoryTotalEl.textContent = rarityStats[rarity].total;
        }
    }
    
    // 更新統一網格顯示
    function updateUnifiedGrid() {
        const grid = document.querySelector('.unified-grid');
        if (!grid) {
            // console.warn('找不到統一網格容器 .unified-grid');
            return;
        }
        
        // 防止無限遞歸 - 檢查是否正在更新
        if (grid.dataset.updating === 'true') {
            return;
        }
        
        // 設置更新標記
        grid.dataset.updating = 'true';
        
        try {
            // 只清空夥伴卡片，保留收集進度顯示
            const existingCards = grid.querySelectorAll('.collection-card');
            existingCards.forEach(card => card.remove());
            
            // 收集所有角色並按稀有度排序（5星到1星）
            const allCompanions = [];
            for (let rarity = 5; rarity >= 1; rarity--) {
                const companions = COMPANION_DATA[rarity] || [];
                companions.forEach(companion => {
                    const collected = summonedCompanions.find(c => c.id === companion.id);
                    allCompanions.push({
                        ...companion,
                        rarity: rarity,
                        collected: collected
                    });
                });
            }
            
            // 創建卡片並添加到網格
            allCompanions.forEach(companionData => {
                const companionCard = createCollectionCard(companionData, companionData.rarity, companionData.collected);
                grid.appendChild(companionCard);
            });
            
        } catch (error) {
            // 移除可能導致無限迴圈的 error logging
        } finally {
            // 清除更新標記
            grid.dataset.updating = 'false';
        }
    }
    
    
    // 創建收藏卡片（用於圖鑑，支援剪影）
    function createCollectionCard(companion, rarity, collectedData) {
        const card = document.createElement('div');
        const isCollected = !!collectedData;
        
        // 設定卡片樣式
        card.className = `collection-card rarity-${rarity} ${isCollected ? 'collected' : 'silhouette'}`;
        
        if (isCollected) {
            // 已收集：顯示完整資訊
            card.innerHTML = `
                <div class="collection-avatar">
                    <img src="${companion.image}" alt="${companion.name}" onerror="this.style.display='none'">
                    <div class="rarity-border rarity-${rarity}"></div>
                    <div class="collection-star-badge rarity-${rarity}">
                        ${'<img src="/assets/images/star.webp" alt="★" class="star-icon">'.repeat(rarity)}
                    </div>
                    ${collectedData.count > 1 ? `<div class="collection-count">×${collectedData.count}</div>` : ''}
                    <div class="collected-badge">✓</div>
                </div>
                <div class="collection-info">
                    <div class="collection-name">${companion.name}</div>
                </div>
            `;
            
            // 重新啟用點擊事件
            card.addEventListener('click', function companionClickHandler(event) {
                event.preventDefault();
                const displayCompanion = { ...companion, rarity: rarity, count: collectedData.count };
                showCompanionDetail(displayCompanion);
            });
        } else {
            // 未收集：顯示剪影
            card.innerHTML = `
                <div class="collection-avatar silhouette">
                    <div class="silhouette-shape"></div>
                    <div class="rarity-border rarity-${rarity} silhouette"></div>
                    <div class="collection-star-badge rarity-${rarity}">
                        ${'<img src="/assets/images/star.webp" alt="★" class="star-icon silhouette">'.repeat(rarity)}
                    </div>
                    <div class="unknown-badge">?</div>
                </div>
                <div class="collection-info">
                    <div class="collection-name silhouette">未知夥伴</div>
                </div>
            `;
            
            // 重新啟用點擊事件
            card.addEventListener('click', function silhouetteClickHandler(event) {
                event.preventDefault();
                showSilhouetteHint(rarity);
            });
        }
        
        return card;
    }

    // 根據技能名稱判斷技能類型
    function getSkillType(skill) {
        const skillLower = skill.toLowerCase();
        
        // 攻擊類技能 - 戰鬥、攻擊、破壞性技能
        if (skillLower.includes('重擊') || skillLower.includes('捏爆') || skillLower.includes('威嚇') || 
            skillLower.includes('一擊制勝') || skillLower.includes('絕對力量') || skillLower.includes('嘴砲') ||
            skillLower.includes('互相傷害') || skillLower.includes('集體當機') || skillLower.includes('禮貌致命') ||
            skillLower.includes('幹話連發') || skillLower.includes('沉默恐懼') || skillLower.includes('斯巴達教學') ||
            skillLower.includes('恨鐵不成鋼') || skillLower.includes('一針見血') || skillLower.includes('秒殺')) {
            return 'attack';
        }
        
        // 防禦類技能 - 保護、防守、耐久性技能  
        if (skillLower.includes('防禦') || skillLower.includes('守護') || skillLower.includes('隕石防禦') ||
            skillLower.includes('耐受') || skillLower.includes('逆來順受') || skillLower.includes('一肩扛起') ||
            skillLower.includes('團隊守護') || skillLower.includes('安全至上') || skillLower.includes('生命守護') ||
            skillLower.includes('危機救援') || skillLower.includes('挨揍耐受') || skillLower.includes('閃避專精')) {
            return 'defense';
        }
        
        // 支援類技能 - 輔助、治療、管理、領導技能
        if (skillLower.includes('培育') || skillLower.includes('傳授') || skillLower.includes('傳承') || 
            skillLower.includes('教學') || skillLower.includes('領導') || skillLower.includes('好好先生') ||
            skillLower.includes('智慧領導') || skillLower.includes('菜鳥培育') || skillLower.includes('課務處理') ||
            skillLower.includes('全能管理') || skillLower.includes('客服應對') || skillLower.includes('激勵光環') ||
            skillLower.includes('母性關愛') || skillLower.includes('兒童教學') || skillLower.includes('孩子王魅力') ||
            skillLower.includes('全能教學') || skillLower.includes('帳務管理') || skillLower.includes('青年領導') ||
            skillLower.includes('經驗傳承') || skillLower.includes('同窗情誼') || skillLower.includes('默契搭檔') ||
            skillLower.includes('專案推進') || skillLower.includes('溫和外表') || skillLower.includes('患難與共')) {
            return 'support';
        }
        
        // 技術類技能 - 程式設計、技術相關技能
        if (skillLower.includes('技術') || skillLower.includes('除錯') || skillLower.includes('hello world') ||
            skillLower.includes('css') || skillLower.includes('js') || skillLower.includes('ruby') ||
            skillLower.includes('後端') || skillLower.includes('前端') || skillLower.includes('分析') ||
            skillLower.includes('戰力') || skillLower.includes('光速切版') || skillLower.includes('像素級調整') ||
            skillLower.includes('css魔法') || skillLower.includes('css 大俠') || skillLower.includes('ruby 神技') ||
            skillLower.includes('ruby 真神') || skillLower.includes('js 深淵') || skillLower.includes('後端真神') ||
            skillLower.includes('數據捏爆') || skillLower.includes('分析天花板') || skillLower.includes('後端戰力') ||
            skillLower.includes('資工背景') || skillLower.includes('臭宅之力') || skillLower.includes('技術扛霸') ||
            skillLower.includes('技術罩門') || skillLower.includes('隱藏戰力')) {
            return 'tech';
        }
        
        // 特殊類技能 - 獨特、稀有、特殊能力
        if (skillLower.includes('稀有出現') || skillLower.includes('轉職') || skillLower.includes('無拘無束') ||
            skillLower.includes('遊俠') || skillLower.includes('直播') || skillLower.includes('麥當勞專送') ||
            skillLower.includes('極致靈活') || skillLower.includes('小貨車直播') || skillLower.includes('遊俠精神') ||
            skillLower.includes('公務員轉職') || skillLower.includes('交易員思維') || skillLower.includes('轉職戰士') ||
            skillLower.includes('可愛魅力') || skillLower.includes('傲嬌魅力') || skillLower.includes('女武者氣質') ||
            skillLower.includes('女王氣場') || skillLower.includes('帥氣絕倫') || skillLower.includes('深藏不露') ||
            skillLower.includes('宗師實力') || skillLower.includes('無言威嚴') || skillLower.includes('長者威嚴') ||
            skillLower.includes('家長氣質') || skillLower.includes('年齡認證') || skillLower.includes('真男人風範') ||
            skillLower.includes('猜拳決勝') || skillLower.includes('翹課專家') || skillLower.includes('划水專業') ||
            skillLower.includes('有色無膽') || skillLower.includes('身分尷尬') || skillLower.includes('人模人樣') ||
            skillLower.includes('外冷內熱') || skillLower.includes('幹話包裝') || skillLower.includes('嚴師風範')) {
            return 'special';
        }
        
        // 默認為普通類型
        return 'normal';
    }

    // 根據技能名稱獲取對應圖標
    function getSkillIcon(skill) {
        const skillType = getSkillType(skill);
        
        switch (skillType) {
            case 'attack': return '⚔️';
            case 'defense': return '🛡️';
            case 'support': return '💚';
            case 'tech': return '💻';
            case 'special': return '✨';
            default: return '🔸';
        }
    }

    // 顯示夥伴詳細資訊
    function showCompanionDetail(companion) {
        // 移除可能導致無限迴圈的 console.log
        // console.log('顯示夥伴詳細資訊:', companion);
        
        const resultModal = document.querySelector('.summon-result-modal');
        if (!resultModal) {
            // console.error('找不到召喚結果模態框');
            return;
        }
        
        // 更新標題為夥伴名稱
        const modalTitle = resultModal.querySelector('.modal-header h3');
        if (modalTitle) {
            modalTitle.textContent = companion.name;
        }

        // 更新結果顯示
        const companionImage = resultModal.querySelector('.companion-image img');
        const companionName = resultModal.querySelector('.companion-name');
        const companionDescription = resultModal.querySelector('.companion-description');
        const companionSkills = resultModal.querySelector('.companion-skills');
        const rarityStars = resultModal.querySelector('.rarity-stars');

        // 設置圖片
        if (companionImage) {
            companionImage.src = companion.image;
            companionImage.onerror = function() {
                // 不再嘗試載入不存在的 placeholder.webp
                this.style.display = 'none';
            };
        }

        // 設置名稱
        if (companionName) {
            companionName.textContent = companion.name;
        }

        // 設置描述
        if (companionDescription) {
            companionDescription.textContent = companion.description || '這位夥伴的故事還在書寫中...';
        }

        // 設置技能
        if (companionSkills && companion.skills) {
            companionSkills.innerHTML = `
                <div class="skills-grid">
                    ${companion.skills.map((skill, index) => 
                        `<div class="skill-tag skill-${getSkillType(skill)}" data-skill-index="${index}">
                            <div class="skill-icon">${getSkillIcon(skill)}</div>
                            <span class="skill-name">${skill}</span>
                        </div>`
                    ).join('')}
                </div>
            `;
        }

        // 顯示星數
        if (rarityStars) {
            const fullStars = '<img src="/assets/images/star.webp" alt="★" class="star-icon">'.repeat(companion.rarity);
            rarityStars.innerHTML = fullStars;
            rarityStars.className = `rarity-stars rarity-${companion.rarity}`;
        }

        // 設置背景效果並顯示模態框
        resultModal.className = `summon-result-modal rarity-${companion.rarity} show`;
    }
    
    // 顯示剪影提示
    function showSilhouetteHint(rarity) {
        const rarityNames = {
            1: '新手',
            2: '熟練', 
            3: '優秀',
            4: '稀有',
            5: '傳說'
        };
        
        const messages = [
            '這個夥伴還在等待你的召喚...',
            '神秘的身影隱藏在召喚門後',
            '透過召喚來解鎖這位夥伴吧！',
            '未知的力量在召喚門中沉睡',
            '這個夥伴的故事還未開始...'
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        const rarityName = rarityNames[rarity] || '未知';
        
        showSummonMessage(`${rarityName}級夥伴 - ${randomMessage}`, 'info');
    }

    // 顯示召喚訊息
    function showSummonMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `summon-message ${type}`;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    // 儲存已召喚夥伴清單
    function saveSummonedCompanions() {
        localStorage.setItem('summonedCompanions', JSON.stringify(summonedCompanions));
    }

    // 載入已召喚夥伴清單
    function loadSummonedCompanions() {
        const saved = localStorage.getItem('summonedCompanions');
        if (saved) {
            try {
                const savedData = JSON.parse(saved);
                // 重新從當前語言的 COMPANION_DATA 載入翻譯
                summonedCompanions = savedData.map(savedCompanion => {
                    const freshCompanion = COMPANION_DATA[savedCompanion.rarity]?.find(c => c.id === savedCompanion.id);
                    if (freshCompanion) {
                        return {
                            ...freshCompanion,
                            rarity: savedCompanion.rarity,
                            count: savedCompanion.count || 1,
                            isDuplicate: false
                        };
                    }
                    // 如果找不到，返回原始資料（向後相容）
                    return savedCompanion;
                });
            } catch (e) {
                // console.error('載入召喚夥伴清單失敗:', e);
                summonedCompanions = [];
            }
        }
    }

    // 關閉召喚結果模態框
    function closeSummonResult() {
        console.log('⚠️ closeSummonResult() 被調用了！', new Error().stack);
        const resultModal = document.querySelector('.summon-result-modal');
        if (resultModal) {
            // 移除所有動態添加的 class，只保留基礎 class
            resultModal.className = 'summon-result-modal';
        }

        // 狀態轉換：SHOWING_RESULT -> IDLE
        if (stateMachine) {
            stateMachine.reset();
        }
    }

    // 更新已顯示的召喚結果 Modal 的文字內容（不重新載入圖片）
    function updateSummonResultLanguage() {
        const resultModal = document.querySelector('.summon-result-modal');

        // 詳細的 debug 資訊
        console.log('=== updateSummonResultLanguage Debug ===');
        console.log('找到 resultModal:', !!resultModal);
        if (resultModal) {
            console.log('Modal className:', resultModal.className);
            console.log('Modal 有 show class:', resultModal.classList.contains('show'));
            console.log('Modal style.display:', resultModal.style.display);
            console.log('Modal offsetHeight:', resultModal.offsetHeight);
        }

        if (!resultModal || !resultModal.classList.contains('show')) {
            console.log('❌ Modal 未顯示，跳過語言更新');
            return; // Modal 沒有顯示，不需要更新
        }

        // 從 Modal 的 class 中提取稀有度
        const rarityMatch = resultModal.className.match(/rarity-(\d)/);
        if (!rarityMatch) {
            console.log('無法從 Modal class 提取稀有度');
            return;
        }
        const rarity = rarityMatch[1];

        // 從圖片 src 中提取夥伴 ID
        const companionImage = resultModal.querySelector('.companion-image img');
        if (!companionImage) {
            console.log('找不到夥伴圖片元素');
            return;
        }

        const imageSrc = companionImage.src;
        const imageFileName = imageSrc.split('/').pop().split('?')[0]; // 移除可能的查詢參數
        const companionId = imageFileName.replace('.webp', '');

        console.log('嘗試更新夥伴語言:', { rarity, companionId, imageSrc });

        // 從當前語言的 COMPANION_DATA 中找到對應的夥伴
        if (!COMPANION_DATA || !COMPANION_DATA[rarity]) {
            console.log('COMPANION_DATA 未載入或找不到該稀有度:', rarity);
            console.log('當前 COMPANION_DATA:', COMPANION_DATA);
            return;
        }

        const companion = COMPANION_DATA[rarity].find(c => c.id === companionId);
        if (!companion) {
            console.log('找不到對應的夥伴:', companionId, '可用的夥伴:', COMPANION_DATA[rarity].map(c => c.id));
            return;
        }

        // 只更新文字內容，不重新設置圖片
        const modalTitle = resultModal.querySelector('.modal-header h3');
        const companionName = resultModal.querySelector('.companion-name');
        const companionDescription = resultModal.querySelector('.companion-description');
        const companionSkills = resultModal.querySelector('.companion-skills');

        // 檢查是否為重複角色
        const isDuplicate = resultModal.classList.contains('duplicate-result');

        if (modalTitle) {
            if (isDuplicate) {
                // 重複角色標題需要翻譯
                modalTitle.innerHTML = `<img src="/assets/images/pile_of_gold_coins.webp" alt="金幣" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;">獲得金幣！`;
            } else {
                modalTitle.textContent = companion.name;
            }
        }

        if (companionName && !isDuplicate) {
            companionName.textContent = companion.name;
        }

        if (companionDescription && !isDuplicate) {
            companionDescription.textContent = companion.description;
        }

        if (companionSkills && companion.skills && !isDuplicate) {
            companionSkills.innerHTML = '';
            companion.skills.forEach(skill => {
                const skillBadge = document.createElement('span');
                skillBadge.className = 'skill-badge';
                skillBadge.textContent = skill;
                companionSkills.appendChild(skillBadge);
            });
        }

        console.log('✅ 已更新召喚結果 Modal 的語言:', companion.name);
    }

    // 顯示召喚工具提示
    function showSummonTooltip(event) {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip) return;
        
        tooltip.classList.add('show');
        updateSummonTooltipPosition(event);
    }
    
    // 更新召喚工具提示位置
    function updateSummonTooltipPosition(event) {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip || !tooltip.classList.contains('show')) return;
        
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        const tooltipWidth = 200; // tooltip估計寬度
        const tooltipHeight = 80; // tooltip估計高度
        const margin = 15; // 與邊界的距離
        
        // 預設偏移量
        let offsetX = 15;
        let offsetY = -15;
        
        // 計算初始位置
        let left = mouseX + offsetX;
        let top = mouseY + offsetY;
        
        // 檢查右邊界，如果會超出則改為左邊顯示
        if (left + tooltipWidth > window.innerWidth - margin) {
            left = mouseX - tooltipWidth - offsetX;
        }
        
        // 檢查左邊界
        if (left < margin) {
            left = margin;
        }
        
        // 檢查上下邊界
        if (top < margin) {
            top = mouseY + 20; // 改到滑鼠下方
        } else if (top + tooltipHeight > window.innerHeight - margin) {
            top = mouseY - tooltipHeight - 15; // 改到滑鼠上方
        }
        
        // 設置最終位置
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
    
    // 隱藏召喚工具提示
    function hideSummonTooltip() {
        const tooltip = document.getElementById('summonTooltip');
        if (!tooltip) return;
        
        tooltip.classList.remove('show');
    }

    // 強制重新觸發進度條更新的函數
    function forceProgressBarUpdate() {
        const collectionProgressBar = document.getElementById('collection-progress-bar');
        const collectionPercentageEl = document.getElementById('collection-percentage');
        
        if (collectionProgressBar && collectionPercentageEl) {
            // 從百分比文字獲取正確的目標寬度，而不是依賴當前寬度
            const targetWidth = collectionPercentageEl.textContent;
            
            // 先重置到 0 然後重新設定，觸發動畫
            collectionProgressBar.style.width = '0%';
            // 使用 setTimeout 確保 DOM 更新完成
            setTimeout(() => {
                collectionProgressBar.style.width = targetWidth;
            }, 10);
        }
    }


    // 監聽 i18n 初始化完成事件
    function initSummonWhenI18nReady() {
        initSummonSystem();
        console.log('夥伴召喚系統已初始化（i18n 系統已就緒）');
    }

    // 添加 MutationObserver 監控 Modal className 變化（除錯用）
    // 已移除：此功能可能導致堆疊溢位，且僅用於除錯
    // function debugModalClassChanges() { ... }

    // 監聽 i18n 事件
    window.addEventListener('i18nInitialized', initSummonWhenI18nReady);
    window.addEventListener('languageChanged', () => {
        loadCompanionData();
        // 重新更新夥伴圖鑑顯示
        updateCompanionCollection();
        // 語言切換時更新召喚結果 Modal 的文字（不重新載入圖片）
        updateSummonResultLanguage();
        console.log('語言切換：夥伴資料已重新載入');
    });

    // 頁面載入完成後初始化
    document.addEventListener('DOMContentLoaded', function() {
        // 已移除：debugModalClassChanges() 可能導致堆疊溢位
        // setTimeout(debugModalClassChanges, 1000);

        // 如果 i18n 已載入，直接初始化
        if (window.i18n && window.i18n.currentTranslations) {
            initSummonWhenI18nReady();
        }
        // 否則等待 i18nInitialized 事件
    });

    // 暴露函數到全域作用域
    window.initSummonSystem = function() {
        // 如果 i18n 已載入，直接初始化；否則等待載入
        if (window.i18n && window.i18n.currentTranslations) {
            initSummonSystem();
        }
        // 否則等待 i18nInitialized 事件
    };
    window.performSummon = performSummon;
    window.closeSummonResult = closeSummonResult;
    window.showSummonTooltip = showSummonTooltip;
    window.updateSummonTooltipPosition = updateSummonTooltipPosition;
    window.hideSummonTooltip = hideSummonTooltip;
    window.forceProgressBarUpdate = forceProgressBarUpdate;

})();