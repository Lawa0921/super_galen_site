import type { EventCard } from '../expedition';
import { registerEvents } from '../expedition';

// ---------------------------------------------------------------------------
// M3 首批事件卡：15 張
// 路線通用 8（含旗標鏈 2：ev_merchant_map → ev_cave_entrance）
// 森林（黑森林徑）限定 3
// 迷宮限定 4
//
// M5 內容擴充 +27（共 42）：
// 霧嶺古道限定 5／鹽晶洞窟限定 4／跨路線通用 10（含旗標鏈 2：
// ev_faded_banner→ev_mercenary_ruins discover battlefield-ruins；
// ev_strange_merchant_intro→return→finale 三連環給 wanderers-compass）／
// 稀有事件 4（weight 1-2）／迷宮通用 4（適用所有迷宮，含新鹽晶洞窟）
// ---------------------------------------------------------------------------

export const EVENTS: EventCard[] = [
  // ---- 路線通用 8 -----------------------------------------------------
  {
    id: 'ev_bandit_toll',
    context: { kind: 'route' },
    weight: 10,
    title: '隘口的路霸',
    body: '商隊行至狹窄隘口，幾名手持棍棒的路霸從岩石後閃出，攔住了去路。為首的傢伙咧嘴一笑：「此路是我開，此樹是我栽，想過去，留下買路財。」車夫緊張地攥緊了韁繩。',
    options: [
      {
        label: '掏錢消災',
        success: [
          { type: 'gold', amount: -15 },
          { type: 'log', text: '你付清買路財，商隊平安通過隘口。' },
        ],
      },
      {
        label: '怒目逼退（力量）',
        check: { stat: 'str', dc: 13 },
        success: [
          { type: 'log', text: '你亮出腰間劍鋒，寒光一閃，路霸悻悻然讓開了道。' },
        ],
        failure: [
          { type: 'log', text: '路霸不吃這套，反倒吆喝同夥圍了上來！' },
          { type: 'fight', encounterId: 'enc_bandit_raid' },
        ],
      },
      {
        label: '拔劍迎戰',
        success: [{ type: 'fight', encounterId: 'enc_bandit_raid' }],
      },
    ],
  },
  {
    id: 'ev_broken_wheel',
    context: { kind: 'route' },
    weight: 10,
    title: '車輪斷裂',
    body: '一聲刺耳的斷裂聲響起，貨車的輪軸應聲斷裂，車身猛地一沉，貨物散落一地。夜幕即將降臨，若不盡快處理，商隊只能困在荒郊野外過夜。',
    options: [
      {
        label: '連夜搶修（智力）',
        check: { stat: 'int', dc: 12 },
        success: [
          { type: 'log', text: '你巧手修復輪軸，商隊沒有耽擱行程，天亮前重新上路。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '搶修失敗，眾人連夜合力推車，累得筋疲力盡。' },
        ],
      },
      {
        label: '用礦石打副應急鐵箍',
        requirement: { itemId: 'ore' },
        success: [
          { type: 'item', itemId: 'ore', count: -1 },
          { type: 'log', text: '你用隨行的礦石打了個應急鐵箍，勉強撐住了輪軸。' },
        ],
      },
      {
        label: '原地紮營等天亮',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你們原地紮營，隔日再想辦法，雖多花了一天糧食，倒也平安。' },
        ],
      },
    ],
  },
  {
    id: 'ev_wounded_traveler',
    context: { kind: 'route' },
    weight: 10,
    title: '路遇傷者',
    body: '路邊倒著一名渾身是血的旅人，斷斷續續地呻吟著。他的行囊散落一旁，看起來是遭了劫。商隊眾人面面相覷——救，還是不救？',
    options: [
      {
        label: '以藥草治療',
        requirement: { itemId: 'herb' },
        success: [
          { type: 'item', itemId: 'herb', count: -1 },
          { type: 'gold', amount: 20 },
          { type: 'log', text: '你們用藥草治好了傷者的傷口，他感激地塞給你們一袋銀幣。' },
        ],
      },
      {
        label: '施展醫術（體質）',
        check: { stat: 'con', dc: 12 },
        success: [
          { type: 'gold', amount: 15 },
          { type: 'log', text: '你徒手為傷者止血包紮，他掙扎著留下幾枚銅板道謝。' },
        ],
        failure: [
          { type: 'log', text: '你手忙腳亂，傷口越包越糟，傷者只能咬牙自己撐著離開。' },
        ],
      },
      {
        label: '無暇他顧，逕自離開',
        success: [
          { type: 'log', text: '你們選擇繼續趕路，把傷者留在原地，誰都沒有回頭看。' },
        ],
      },
    ],
  },
  {
    id: 'ev_merchant_map',
    context: { kind: 'route' },
    weight: 6,
    title: '神秘的地圖販子',
    body: '一名披著破斗篷的商人攔住商隊，神秘兮兮地攤開一張泛黃的地圖殘片：「這上頭標記著一處哥布林巢穴的入口，敢不敢買下這條發財的門路？」',
    options: [
      {
        label: '殺價買下（魅力）',
        check: { stat: 'cha', dc: 12 },
        success: [
          { type: 'gold', amount: -10 },
          { type: 'flag', flag: 'clue:goblin-cave', value: true },
          { type: 'log', text: '你殺價買下地圖殘片，上頭標記著一處隱密的山洞入口。' },
        ],
        failure: [
          { type: 'gold', amount: -20 },
          { type: 'flag', flag: 'clue:goblin-cave', value: true },
          { type: 'log', text: '商人油鹽不進，你不甘不願地照原價買下了地圖。' },
        ],
      },
      {
        label: '不予理會，逕自離去',
        success: [{ type: 'log', text: '你婉拒了商人的兜售，商隊繼續趕路。' }],
      },
    ],
  },
  {
    id: 'ev_cave_entrance',
    context: { kind: 'route' },
    weight: 6,
    requiresFlags: { 'clue:goblin-cave': true },
    title: '山壁上的裂隙',
    body: '按著地圖上模糊的墨跡，你注意到山壁間一處被藤蔓掩住的裂隙，隱約還能聞到野獸的騷味。地圖上打了個粗魯的叉——就是這裡。',
    options: [
      {
        label: '循圖探查（智力）',
        check: { stat: 'int', dc: 13 },
        success: [
          { type: 'discover', locationId: 'goblin-den' },
          { type: 'log', text: '你撥開藤蔓，找到了藏在裂隙後的洞口——哥布林的巢穴就在眼前。' },
        ],
        failure: [
          { type: 'log', text: '地圖標示模糊，你在山壁間繞了半天，一無所獲。' },
        ],
      },
      {
        label: '無視地圖，直接離開',
        success: [
          { type: 'log', text: '你把地圖收進行囊，決定不節外生枝，先前進再說。' },
        ],
      },
    ],
  },
  {
    id: 'ev_river_crossing',
    context: { kind: 'route' },
    weight: 10,
    title: '湍急的溪流',
    body: '前方一道湍急的溪流擋住去路，水面下的石塊濕滑難行。遠處傳來潺潺水聲，混雜著若有似無的低吼，讓人不敢大意。',
    options: [
      {
        label: '涉水而過（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [
          { type: 'log', text: '你腳步輕巧地踏過濕滑石塊，商隊安然渡過溪流。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'item', itemId: 'torch', count: -1 },
          { type: 'log', text: '一個踉蹌，你跌入水中，隨身的火把也泡濕報廢了。' },
        ],
      },
      {
        label: '繞遠路走乾燥小徑',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你選擇繞行乾燥的小徑，雖多花了些時間，商隊倒是毫髮無傷。' },
        ],
      },
    ],
  },
  {
    id: 'ev_campfire_stories',
    context: { kind: 'route' },
    weight: 10,
    title: '篝火夜話',
    body: '夜幕低垂，商隊在路旁紮營。篝火劈啪作響，隊員們圍坐取暖，氣氛卻有些沉悶——這是連日趕路後難得的喘息時刻。',
    options: [
      {
        label: '帶頭說笑（魅力）',
        check: { stat: 'cha', dc: 11 },
        success: [
          { type: 'hp', target: 'party', amount: 4 },
          { type: 'log', text: '你講的笑話逗樂了眾人，一夜好眠後大家精神百倍。' },
        ],
        failure: [
          { type: 'log', text: '你的笑話冷場，眾人尷尬地笑了兩聲，各自裹著毯子睡去。' },
        ],
      },
      {
        label: '早早歇息',
        success: [
          { type: 'hp', target: 'party', amount: 2 },
          { type: 'log', text: '商隊安靜地紮營歇息，恢復了些許體力。' },
        ],
      },
    ],
  },
  {
    id: 'ev_wolf_howl',
    context: { kind: 'route' },
    weight: 10,
    title: '遠方的狼嚎',
    body: '天色漸暗，遠方傳來此起彼落的狼嚎，聲音越來越近。隊員們握緊了武器，馬匹也開始不安地噴著鼻息，蹄子焦躁地刨著地面。',
    options: [
      {
        label: '紮營戒備（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [
          { type: 'log', text: '你及時發現草叢中的狼群蹤跡，商隊嚴陣以待，狼群知難而退。' },
        ],
        failure: [
          { type: 'log', text: '狼群趁隙從暗處撲了上來！' },
          { type: 'fight', encounterId: 'enc_wolf_pair' },
        ],
      },
      {
        label: '點燃火把驅狼',
        requirement: { itemId: 'torch' },
        success: [
          { type: 'item', itemId: 'torch', count: -1 },
          { type: 'log', text: '熊熊火光嚇退了黑暗中窺伺的狼群，牠們悻悻然遁入林間。' },
        ],
      },
      {
        label: '強行趕路，賭牠們不會靠近',
        success: [
          { type: 'log', text: '你們加快腳步，狼嚎聲漸漸遠去，總算是有驚無險。' },
        ],
      },
    ],
  },

  // ---- 森林（黑森林徑）限定 3 -------------------------------------------
  {
    id: 'ev_forest_shrine',
    context: { kind: 'route', locationIds: ['blackwood-trail'] },
    weight: 8,
    title: '林間的荒祠',
    body: '密林深處立著一座爬滿青苔的荒祠，石像的面容早已風化模糊，祠前散落著半朽的祭品。空氣中瀰漫著一股說不出的詭異寧靜。',
    options: [
      {
        label: '上前查看（智力）',
        check: { stat: 'int', dc: 13 },
        success: [
          { type: 'gold', amount: 25 },
          { type: 'log', text: '你在荒祠底座摸出一格暗格，裡頭藏著往來商旅遺落的錢袋。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '觸動了暗藏的機關，一支毒箭擦過你的肩膀。' },
        ],
      },
      {
        label: '敬而遠之，繼續趕路',
        success: [
          { type: 'log', text: '你們對著荒祠行了個禮，快步離開這片詭異的林地。' },
        ],
      },
    ],
  },
  {
    id: 'ev_goblin_scout_trail',
    context: { kind: 'route', locationIds: ['blackwood-trail'] },
    weight: 8,
    title: '哥布林的腳印',
    body: '泥地上留著一串雜亂的腳印，混著獸皮鞋底與粗製武器拖行的痕跡——是哥布林斥候不久前經過的痕跡。順著腳印望去，林葉還在輕輕晃動。',
    options: [
      {
        label: '循跡跟蹤，伺機偷襲（敏捷）',
        check: { stat: 'dex', dc: 14 },
        success: [
          { type: 'gold', amount: 12 },
          { type: 'item', itemId: 'goblin-earring', count: 1 },
          { type: 'log', text: '你悄悄尾隨，撂倒了落單的哥布林斥候，順手摸走了牠的耳環。' },
        ],
        failure: [
          { type: 'log', text: '枯枝一聲脆響，暴露了行蹤——哥布林轉身撲了上來！' },
          { type: 'fight', encounterId: 'enc_goblin_raiders' },
        ],
      },
      {
        label: '避開腳印，繞道而行',
        success: [
          { type: 'log', text: '你們刻意避開腳印聚集之處，平安無事地穿過林地。' },
        ],
      },
    ],
  },
  {
    id: 'ev_forest_herbalist',
    context: { kind: 'route', locationIds: ['blackwood-trail'] },
    weight: 8,
    title: '隱居的採藥人',
    body: '林間小屋前，一名白髮蒼蒼的採藥人正低頭篩選藥草，對商隊的到來恍若未覺。屋簷下掛滿了曬乾的藥草束，散發著淡淡的清香。',
    options: [
      {
        label: '請教藥草知識（智力）',
        check: { stat: 'int', dc: 12 },
        success: [
          { type: 'item', itemId: 'herb', count: 2 },
          { type: 'log', text: '採藥人見你談吐不俗，傳授了辨識藥草的訣竅，還送你兩把藥草。' },
        ],
        failure: [
          { type: 'log', text: '採藥人對你愛答不理，只顧著低頭篩選他的藥草。' },
        ],
      },
      {
        label: '花錢買藥草',
        success: [
          { type: 'gold', amount: -15 },
          { type: 'item', itemId: 'herb', count: 3 },
          { type: 'log', text: '你付了些銀錢，換來三把曬乾的藥草。' },
        ],
      },
    ],
  },

  // ---- 迷宮限定 4 ------------------------------------------------------
  {
    id: 'ev_mine_gas_pocket',
    context: { kind: 'dungeon', locationIds: ['abandoned-mine'] },
    weight: 8,
    title: '瀰漫的毒氣',
    body: '坑道深處瀰漫著一股嗆鼻的氣味，火把的光芒在此處微微發綠。前方的空氣彷彿凝滯，每吸一口都讓人頭暈目眩。',
    options: [
      {
        label: '摒息通過（體質）',
        check: { stat: 'con', dc: 13 },
        success: [
          { type: 'log', text: '你摒住呼吸快速通過，商隊安然無恙地穿越了毒氣坑道。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -4 },
          { type: 'log', text: '嗆人的毒氣灌入肺裡，眾人咳得眼淚直流，踉蹌逃出坑道。' },
        ],
      },
      {
        label: '點燃火把試探',
        requirement: { itemId: 'torch' },
        success: [
          { type: 'item', itemId: 'torch', count: -1 },
          { type: 'gold', amount: 8 },
          { type: 'log', text: '火把湊近瞬間氣體轟然引燃，所幸只是虛驚一場，坑道深處還散落著幾枚錢幣。' },
        ],
      },
    ],
  },
  {
    id: 'ev_collapsed_tunnel',
    context: { kind: 'dungeon', locationIds: ['abandoned-mine'] },
    weight: 8,
    title: '坍塌的坑道',
    body: '前方坑道半數坍塌，碎石與斷裂的支撐木堵住了去路。頭頂不時傳來令人心驚的碎石聲響，彷彿隨時會再次崩落。',
    options: [
      {
        label: '合力清出通路（力量）',
        check: { stat: 'str', dc: 14 },
        success: [
          { type: 'log', text: '眾人合力搬開落石，硬是清出一條僅容通過的縫隙。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '碎石鬆動崩落，砸得眾人灰頭土臉，勉強擠了過去。' },
        ],
      },
      {
        label: '另尋岔路繞行',
        success: [
          { type: 'log', text: '你們退回岔路，繞了一大圈才重新接上主坑道。' },
        ],
      },
    ],
  },
  {
    id: 'ev_ancient_totem',
    context: { kind: 'dungeon', locationIds: ['goblin-den'] },
    weight: 8,
    title: '古老的圖騰柱',
    body: '巢穴深處立著一根爬滿獸骨與羽毛的圖騰柱，上頭刻著粗獷的哥布林紋樣，柱底隱約堆著一些雜物，散發著某種令人不安的氣息。',
    options: [
      {
        label: '破壞圖騰，激怒守衛（力量）',
        check: { stat: 'str', dc: 13 },
        success: [
          { type: 'gold', amount: 20 },
          { type: 'item', itemId: 'ore', count: 1 },
          { type: 'log', text: '你一斧劈開圖騰柱，裡頭滾出幾枚錢幣與一塊礦石。' },
        ],
        failure: [
          { type: 'log', text: '圖騰柱轟然倒下，驚醒了埋伏在暗處的哥布林！' },
          { type: 'fight', encounterId: 'enc_goblin_raiders' },
        ],
      },
      {
        label: '獻上祭品安撫',
        success: [
          { type: 'gold', amount: -10 },
          { type: 'log', text: '你在圖騰前擺上幾枚銅幣，古怪的低吟聲漸漸平息下來。' },
        ],
      },
    ],
  },
  {
    id: 'ev_unknown_chest_trap',
    context: { kind: 'dungeon' },
    weight: 8,
    title: '可疑的箱子',
    body: '側室角落擺著一只鑲銅木箱，箱蓋上刻著繁複的紋路，邊緣有幾道細如髮絲的刻痕——不像是自然形成的，透著一股蓄意設計的惡意。',
    options: [
      {
        label: '仔細檢查機關（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [
          { type: 'gold', amount: 22 },
          { type: 'log', text: '你巧妙拆解了箱蓋上的毒針機關，裡頭是滿滿的銀幣。' },
        ],
        failure: [
          { type: 'hp', target: 'protagonist', amount: -3 },
          { type: 'log', text: '毒針彈出刺中你的手指，一陣刺痛竄上手臂。' },
        ],
      },
      {
        label: '不予理會，直接離開',
        success: [
          { type: 'log', text: '你決定不冒這個險，逕自離開了這處可疑的箱子。' },
        ],
      },
    ],
  },

  // ---- M5：霧嶺古道限定 5 ------------------------------------------------
  {
    id: 'ev_ridge_fog_veil',
    context: { kind: 'route', locationIds: ['misty-ridge-trail'] },
    weight: 9,
    title: '迷霧鎖徑',
    body: '濃霧毫無預警地湧上山脊，能見度驟降至伸手不見五指，腳下的碎石小徑彷彿隨時會消失在白霧盡頭，隊員們只能屏息，聽著風聲辨認方向。',
    options: [
      {
        label: '循聲辨位（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [{ type: 'log', text: '你憑著風聲與腳感摸清了路徑，商隊在濃霧中穩穩前行。' }],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '一腳踏空，眾人在霧裡跌跌撞撞，擦傷了手腳才穩住身形。' },
        ],
      },
      {
        label: '原地紮營等霧散',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你們原地紮營等待濃霧散去，雖多耗了些糧食，倒也平安無事。' },
        ],
      },
    ],
  },
  {
    id: 'ev_ridge_watchtower',
    context: { kind: 'route', locationIds: ['misty-ridge-trail'] },
    weight: 9,
    title: '崩毀的烽火台',
    body: '山道旁矗立著一座傾頹的烽火台，磚石早已崩落大半，台頂殘留的旗桿隨風搖晃，發出嘎吱怪響。誰曾在此駐守瞭望，如今只剩斷壁殘垣訴說著無人聞問的過往。',
    options: [
      {
        label: '攀上查看（力量）',
        check: { stat: 'str', dc: 14 },
        success: [
          { type: 'gold', amount: 20 },
          { type: 'item', itemId: 'ore', count: 1 },
          { type: 'log', text: '你攀上烽火台頂，在崩塌的石縫間翻出一袋銀幣與半塊礦石。' },
        ],
        failure: [
          { type: 'hp', target: 'protagonist', amount: -3 },
          { type: 'log', text: '腳下的磚石突然鬆動，你摔了個踉蹌，被碎石劃傷了手臂。' },
        ],
      },
      {
        label: '略過不理，繼續趕路',
        success: [{ type: 'log', text: '你們沒有多做停留，任由烽火台在身後漸漸隱入霧色。' }],
      },
    ],
  },
  {
    id: 'ev_ridge_toll_gang',
    context: { kind: 'route', locationIds: ['misty-ridge-trail'] },
    weight: 8,
    title: '山賊的箭陣',
    body: '幾道人影自山脊高處探出頭來，手中弓弦緊繃，箭鏃在霧氣裡泛著冷光。「留下買路財，饒你們平安過嶺！」為首的山賊嗓音在山谷間迴盪，帶著毫不掩飾的威脅。',
    options: [
      {
        label: '高聲談判（魅力）',
        check: { stat: 'cha', dc: 13 },
        success: [
          { type: 'gold', amount: -20 },
          { type: 'log', text: '一番討價還價後，你付了買路財，山賊們收弓讓開了道。' },
        ],
        failure: [
          { type: 'log', text: '談判破裂，山賊們冷笑一聲，箭矢已然離弦！' },
          { type: 'fight', encounterId: 'enc_ridge_bandits' },
        ],
      },
      {
        label: '直接應戰',
        success: [{ type: 'fight', encounterId: 'enc_ridge_bandits' }],
      },
    ],
  },
  {
    id: 'ev_ridge_hermit_scout',
    context: { kind: 'route', locationIds: ['misty-ridge-trail'] },
    weight: 9,
    title: '隱居的斥候',
    body: '一名獨居的老斥候在崖邊搭了間簡陋木屋，見商隊經過，主動招呼你們歇腳。他布滿皺紋的手指向霧靄深處：「這條古道我走了三十年，什麼機關暗道，我門兒清。」',
    options: [
      {
        label: '請教古道知識（智力）',
        check: { stat: 'int', dc: 12 },
        success: [
          { type: 'gold', amount: 18 },
          { type: 'log', text: '老斥候指點了幾處捷徑與暗藏的補給點，臨走前還塞給你一些銀錢。' },
        ],
        failure: [
          { type: 'log', text: '老斥候見你聽得一知半解，搖搖頭不再多說，逕自轉身進了木屋。' },
        ],
      },
      {
        label: '道謝後離開',
        success: [{ type: 'log', text: '你向老斥候道謝，商隊沒有久留，繼續朝山嶺深處前進。' }],
      },
    ],
  },
  {
    id: 'ev_ridge_gale',
    context: { kind: 'route', locationIds: ['misty-ridge-trail'] },
    weight: 9,
    title: '山脊上的狂風',
    body: '一陣狂風毫無預警地自谷底捲上山脊，吹得眾人東倒西歪，車篷被掀得獵獵作響，貨物眼看就要被捲下懸崖。隊員們死死抓住韁繩，與狂風拔河。',
    options: [
      {
        label: '死命穩住（體質）',
        check: { stat: 'con', dc: 13 },
        success: [{ type: 'log', text: '你咬牙撐過這陣狂風，貨物與車隊都穩穩留在原地。' }],
        failure: [
          { type: 'hp', target: 'party', amount: -4 },
          { type: 'item', itemId: 'torch', count: -1 },
          { type: 'log', text: '狂風捲走了幾支火把，眾人被吹得東倒西歪，狼狽不堪。' },
        ],
      },
      {
        label: '就地伏低等風歇',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你們趴伏在地等狂風過去，雖耽擱了行程，倒也平安無事。' },
        ],
      },
    ],
  },

  // ---- M5：鹽晶洞窟限定 4 ------------------------------------------------
  {
    id: 'ev_saltcavern_brine_pool',
    context: { kind: 'dungeon', locationIds: ['salt-crystal-cavern'] },
    weight: 9,
    title: '幽藍鹵水潭',
    body: '洞窟深處有一汪幽藍色的鹵水潭，水面泛著細密的鹽晶結晶，空氣中瀰漫著刺鼻的鹹澀氣味，吸得久了讓人頭暈目眩，卻又隱約看見潭底閃著微光。',
    options: [
      {
        label: '摒息採集（體質）',
        check: { stat: 'con', dc: 14 },
        success: [
          { type: 'item', itemId: 'salt', count: 2 },
          { type: 'log', text: '你摒住呼吸探入潭邊，撈起兩把結晶飽滿的鹽晶。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '鹹澀的氣味嗆得眾人連連咳嗽，只得狼狽退開。' },
        ],
      },
      {
        label: '繞開鹵水潭',
        success: [{ type: 'log', text: '你們沿著岩壁繞開這汪詭異的鹵水潭，繼續向深處前進。' }],
      },
    ],
  },
  {
    id: 'ev_saltcavern_crystal_bloom',
    context: { kind: 'dungeon', locationIds: ['salt-crystal-cavern'] },
    weight: 9,
    title: '結晶花叢',
    body: '岩壁上綻放著一叢叢晶瑩剔透的鹽晶花，稜角銳利如刀刃，卻美得讓人捨不得錯過。輕輕一碰便能感覺到刺骨的寒意順著指尖竄上手臂。',
    options: [
      {
        label: '小心採摘（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [
          { type: 'item', itemId: 'salt', count: 2 },
          { type: 'gold', amount: 10 },
          { type: 'log', text: '你巧妙避開銳利的稜角，採下幾株完整的鹽晶花，賣相極佳。' },
        ],
        failure: [
          { type: 'hp', target: 'protagonist', amount: -3 },
          { type: 'log', text: '指尖被鋒利的結晶劃破，鮮血滴在鹽晶上瞬間凝結。' },
        ],
      },
      {
        label: '不予理會，繼續前進',
        success: [{ type: 'log', text: '你們對這叢危險的結晶花敬而遠之，逕自往深處走去。' }],
      },
    ],
  },
  {
    id: 'ev_saltcavern_echo_chamber',
    context: { kind: 'dungeon', locationIds: ['salt-crystal-cavern'] },
    weight: 9,
    title: '回聲石室',
    body: '一間寬闊的石室裡，任何聲響都會被放大成連綿不絕的回音，方向感在此徹底失靈。隊員們的腳步聲、呼吸聲層層疊疊地反彈回來，教人分不清東西南北。',
    options: [
      {
        label: '憑記憶辨位（智力）',
        check: { stat: 'int', dc: 13 },
        success: [{ type: 'log', text: '你默數步伐、記下轉折，硬是在混亂的回音中辨清了方向。' }],
        failure: [
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '眾人被回音搞得暈頭轉向，撞上岩壁才勉強找回方向感。' },
        ],
      },
      {
        label: '沿牆摸索前進',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你們沿著石壁小心摸索，雖然多花了時間，總算安然穿過石室。' },
        ],
      },
    ],
  },
  {
    id: 'ev_saltcavern_collapsed_vein',
    context: { kind: 'dungeon', locationIds: ['salt-crystal-cavern'] },
    weight: 9,
    title: '坍塌的鹽脈',
    body: '一整片鹽脈從頂部崩落，堆成半人高的鹽礫擋住去路，晶亮的碎塊在火光下閃爍，底下隱約還壓著幾件銹蝕的舊工具。',
    options: [
      {
        label: '合力清出通路（力量）',
        check: { stat: 'str', dc: 14 },
        success: [
          { type: 'item', itemId: 'salt', count: 1 },
          { type: 'gold', amount: 15 },
          { type: 'log', text: '眾人合力搬開鹽礫，在底下翻出一把鹽晶與幾枚舊硬幣。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '鹽礫崩落得比想像中鬆散，砸得眾人灰頭土臉。' },
        ],
      },
      {
        label: '繞道而行',
        success: [{ type: 'log', text: '你們找了條窄路繞過坍塌的鹽脈，沒有多耽擱時間。' }],
      },
    ],
  },

  // ---- M5：跨路線通用 10（含旗標鏈 2） -----------------------------------
  {
    id: 'ev_faded_banner',
    context: { kind: 'route' },
    weight: 6,
    title: '褪色的軍旗',
    body: '路旁土坡半掩著一面褪色的軍旗，布面早被風雨侵蝕得看不清紋章，只依稀認得出一角交叉的劍與盾。旗桿深深插在土裡，彷彿有人刻意留下了什麼訊息。',
    options: [
      {
        label: '細看旗面紋章（智力）',
        check: { stat: 'int', dc: 13 },
        success: [
          { type: 'flag', flag: 'clue:mercenary-ruins', value: true },
          { type: 'log', text: '你辨認出殘存的紋章屬於一支早已解散的傭兵團，隱約記下了方位。' },
        ],
        failure: [
          { type: 'flag', flag: 'clue:mercenary-ruins', value: true },
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '拔旗時驚動了土裡的胡蜂窩，眾人被螫得抱頭鼠竄，倒也記下了大概方向。' },
        ],
      },
      {
        label: '不予理會，逕自離去',
        success: [{ type: 'log', text: '你們沒有多看那面破舊的軍旗一眼，繼續趕路。' }],
      },
    ],
  },
  {
    id: 'ev_mercenary_ruins',
    context: { kind: 'route' },
    weight: 6,
    requiresFlags: { 'clue:mercenary-ruins': true },
    title: '傭兵團遺跡',
    body: '循著旗面上依稀可辨的方位，你們在雜草叢生的坡地間找到一片斷壁殘垣——散落的甲冑鏽跡斑斑，顯然是某支傭兵團全軍覆沒之地。深處似乎還有未被打撈的戰利品。',
    options: [
      {
        label: '深入探查（力量）',
        check: { stat: 'str', dc: 13 },
        success: [
          { type: 'discover', locationId: 'battlefield-ruins' },
          { type: 'log', text: '你搬開壓著入口的斷壁，發現遺跡深處還連著一片更大的古戰場。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '鏽蝕的甲冑碎片鬆動崩塌，劃傷了幾名隊員，深處的入口仍無跡可尋。' },
        ],
      },
      {
        label: '心生忌憚，轉身離開',
        success: [{ type: 'log', text: '這片死寂的遺跡讓人不寒而慄，你們決定暫且轉身離開。' }],
      },
    ],
  },
  {
    id: 'ev_strange_merchant_intro',
    context: { kind: 'route' },
    weight: 6,
    title: '奇怪的商人．初遇',
    body: '一名披著雜色斗篷的商人不知何時跟上了商隊，貨架上擺滿了見所未見的稀奇物件。「我看你們是講信用的商隊，」他瞇眼笑道，「不如先幫我帶個口信，如何？」',
    options: [
      {
        label: '應允幫忙（魅力）',
        check: { stat: 'cha', dc: 11 },
        success: [
          { type: 'flag', flag: 'clue:strange-merchant:1', value: true },
          { type: 'gold', amount: 10 },
          { type: 'log', text: '你爽快答應，商人笑得眼睛瞇成一條縫，塞給你幾枚銀幣當謝禮。' },
        ],
        failure: [
          { type: 'flag', flag: 'clue:strange-merchant:1', value: true },
          { type: 'log', text: '你雖答應得有些勉強，商人倒也不介意，自顧自地道了謝便消失在人群中。' },
        ],
      },
      {
        label: '婉拒，不予理會',
        success: [{ type: 'log', text: '你婉拒了這名來歷不明的商人，商隊繼續趕路。' }],
      },
    ],
  },
  {
    id: 'ev_strange_merchant_return',
    context: { kind: 'route' },
    weight: 6,
    requiresFlags: { 'clue:strange-merchant:1': true },
    title: '奇怪的商人．再遇',
    body: '那名雜色斗篷商人竟又在下一段路上等著你們，像是早算準了商隊的行程。「口信我收到了，」他神秘兮兮地壓低聲音，「這次換我欠你們一份人情——猜猜看，我葫蘆裡賣的是什麼藥？」',
    options: [
      {
        label: '仔細觀察他的言行（智力）',
        check: { stat: 'int', dc: 12 },
        success: [
          { type: 'flag', flag: 'clue:strange-merchant:2', value: true },
          { type: 'log', text: '你注意到他袖口露出的印記，隱約猜出了他的真實身分，他對你的眼力露出讚許的笑。' },
        ],
        failure: [
          { type: 'flag', flag: 'clue:strange-merchant:2', value: true },
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你猜了半天也猜不透，商人哈哈大笑，順手從你腰包摸走了幾枚銅板作弄你。' },
        ],
      },
      {
        label: '沒空猜謎，逕自離去',
        success: [{ type: 'log', text: '你沒空陪他打啞謎，商隊逕自離去，商人在身後意味深長地笑了笑。' }],
      },
    ],
  },
  {
    id: 'ev_strange_merchant_finale',
    context: { kind: 'route' },
    weight: 6,
    requiresFlags: { 'clue:strange-merchant:2': true },
    title: '奇怪的商人．終章',
    body: '商人第三次現身時，臉上少了先前的戲謔，多了幾分認真。「一路承蒙關照，」他從懷裡取出一枚舊羅盤，鄭重地放進你的掌心，「這東西認主，往後它認你了。」',
    options: [
      {
        label: '收下饋贈（魅力）',
        check: { stat: 'cha', dc: 12 },
        success: [
          { type: 'item', itemId: 'wanderers-compass', count: 1 },
          { type: 'gold', amount: 15 },
          { type: 'log', text: '你鄭重收下羅盤，商人滿意地點點頭，轉身沒入人群，再未出現過。' },
        ],
        failure: [
          { type: 'gold', amount: 20 },
          { type: 'log', text: '你一時語塞，手忙腳亂間竟沒接穩羅盤——商人苦笑著改塞給你一袋銀幣。' },
        ],
      },
      {
        label: '婉拒好意，僅道謝',
        success: [
          { type: 'gold', amount: 10 },
          { type: 'log', text: '你婉拒了貴重的饋贈，商人也不勉強，只留下幾枚銀幣聊表心意。' },
        ],
      },
    ],
  },
  {
    id: 'ev_traveling_bard',
    context: { kind: 'route' },
    weight: 9,
    title: '遊唱詩人的請求',
    body: '一名背著魯特琴的遊唱詩人攔下商隊，笑著提議：「讓我隨行一程，換一頓熱飯如何？我保證用歌聲逗樂你們一整晚。」他的眼神裡帶著幾分風塵僕僕的疲憊。',
    options: [
      {
        label: '邀他同行說書（魅力）',
        check: { stat: 'cha', dc: 12 },
        success: [
          { type: 'hp', target: 'party', amount: 5 },
          { type: 'log', text: '詩人的歌聲與故事逗得眾人開懷大笑，一夜好眠後精神格外飽滿。' },
        ],
        failure: [
          { type: 'log', text: '你們相談甚歡，可惜詩人五音不全，眾人只好禮貌地笑笑作罷。' },
        ],
      },
      {
        label: '婉拒，繼續趕路',
        success: [{ type: 'log', text: '你婉拒了詩人的提議，商隊沒有停留，繼續朝前趕路。' }],
      },
    ],
  },
  {
    id: 'ev_lost_cart',
    context: { kind: 'route' },
    weight: 9,
    title: '拋錨的商隊',
    body: '前方路邊停著一輛陷入泥坑的貨車，車主滿頭大汗地推著車輪，貨物散落一地，眼看天色將暗，他焦急地朝你們揮手求助。',
    options: [
      {
        label: '合力推車（力量）',
        check: { stat: 'str', dc: 13 },
        success: [
          { type: 'gold', amount: 15 },
          { type: 'log', text: '眾人合力將貨車推出泥坑，車主感激不已，塞給你們一些銀錢當謝禮。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '貨車陷得比想像中深，眾人使勁推車，累得腰酸背痛也沒能推動分毫。' },
        ],
      },
      {
        label: '愛莫能助，繼續趕路',
        success: [{ type: 'log', text: '你們自身也趕著行程，只能對車主表達歉意，繼續前進。' }],
      },
    ],
  },
  {
    id: 'ev_night_market_rumor',
    context: { kind: 'route' },
    weight: 9,
    title: '打尖客棧的傳聞',
    body: '商隊在路邊小客棧打尖歇腳，鄰桌旅人邊喝酒邊高談闊論，話裡話外似乎提到了什麼有用的門路。你豎起耳朵，努力從嘈雜中拼湊出完整的訊息。',
    options: [
      {
        label: '細聽拼湊（智力）',
        check: { stat: 'int', dc: 12 },
        success: [
          { type: 'gold', amount: 12 },
          { type: 'log', text: '你拼湊出的門路果然有用，順手轉手了一筆小買賣，賺了些銀錢。' },
        ],
        failure: [{ type: 'log', text: '鄰桌的談話太過零散，你聽了半天也沒拼出個所以然。' }],
      },
      {
        label: '專心吃飯，不去理會',
        success: [{ type: 'log', text: '你決定不多管閒事，安安靜靜地吃完這頓飯。' }],
      },
    ],
  },
  {
    id: 'ev_stray_dog',
    context: { kind: 'route' },
    weight: 9,
    title: '跟路的野犬',
    body: '一隻瘦骨嶙峋的野犬遠遠綴在商隊後頭，怯生生地不敢靠近，卻也不肯離開，濕漉漉的眼睛直勾勾地望著車上的乾糧。',
    options: [
      {
        label: '引牠靠近（敏捷）',
        check: { stat: 'dex', dc: 11 },
        success: [
          { type: 'item', itemId: 'dried-rations', count: -1 },
          { type: 'hp', target: 'party', amount: 3 },
          { type: 'log', text: '野犬吃飽後乖乖跟在車隊旁，逗得隊員們心情大好，一路輕鬆不少。' },
        ],
        failure: [{ type: 'log', text: '野犬被你的動作嚇得夾著尾巴跑遠了，再沒出現過。' }],
      },
      {
        label: '驅趕牠離開',
        success: [{ type: 'log', text: '你揮手驅趕，野犬悻悻然地退開，消失在路旁的草叢裡。' }],
      },
    ],
  },
  {
    id: 'ev_toll_shrine_priest',
    context: { kind: 'route' },
    weight: 9,
    title: '巡遊的祭司',
    body: '一名雲遊祭司在路邊設起臨時祭壇，為往來旅人祈福消災。他朝商隊微微頷首：「願聞其詳，也算是與諸位結一段善緣。」語氣平和，不見絲毫催促。',
    options: [
      {
        label: '靜心受祝禱（體質）',
        check: { stat: 'con', dc: 12 },
        success: [
          { type: 'hp', target: 'party', amount: 6 },
          { type: 'log', text: '祭司的祝禱如暖流般淌過全身，眾人只覺神清氣爽，疲憊一掃而空。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: 2 },
          { type: 'log', text: '你心浮氣躁，難以靜下心受祝禱，只勉強沾了些許福澤。' },
        ],
      },
      {
        label: '隨喜添香油錢',
        success: [
          { type: 'gold', amount: -10 },
          { type: 'hp', target: 'party', amount: 4 },
          { type: 'log', text: '你添了些香油錢，祭司欣然為商隊祈福，眾人心裡踏實了不少。' },
        ],
      },
    ],
  },

  // ---- M5：稀有事件 4（weight 1-2） --------------------------------------
  {
    id: 'ev_rare_treasure_map',
    context: {},
    weight: 2,
    title: '寶藏地圖',
    body: '一名垂死的盜賊將一張浸血的羊皮紙塞進你手裡，氣若游絲地說完最後一句話便斷了氣。展開一看，那竟是一張標記詳盡、幾乎能以假亂真的寶藏地圖。',
    options: [
      {
        label: '循圖尋寶（智力）',
        check: { stat: 'int', dc: 14 },
        success: [
          { type: 'gold', amount: 60 },
          { type: 'item', itemId: 'ore', count: 2 },
          { type: 'log', text: '你按圖索驥，竟真的在標記處挖出一箱埋藏多年的財寶！' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '地圖標記的地點觸發了古老的陷阱機關，眾人狼狽逃出，一無所獲。' },
        ],
      },
      {
        label: '收起地圖，日後再議',
        success: [
          { type: 'item', itemId: 'tattered-map', count: 1 },
          { type: 'log', text: '你決定先收好這張地圖，等時機成熟再從長計議。' },
        ],
      },
    ],
  },
  {
    id: 'ev_rare_wandering_swordsaint',
    context: {},
    weight: 1,
    title: '流浪劍聖切磋',
    body: '一名鬚髮皆白的劍客攔在路中央，腰間長劍未出鞘，眼神卻銳利如電。「聽聞商隊裡藏著幾分本事，」他淡淡開口，「可願與老夫過幾招，切磋切磋？」',
    options: [
      {
        label: '拔劍應戰（力量）',
        check: { stat: 'str', dc: 15 },
        success: [
          { type: 'gold', amount: 40 },
          { type: 'log', text: '你堪堪接下劍聖數招，他撫掌大笑，留下一袋銀幣以示嘉許，飄然遠去。' },
        ],
        failure: [
          { type: 'hp', target: 'protagonist', amount: -4 },
          { type: 'gold', amount: 10 },
          { type: 'log', text: '你被劍聖三兩招逼得節節敗退，他卻手下留情，臨走前留了些盤纏。' },
        ],
      },
      {
        label: '謙遜婉拒',
        success: [
          { type: 'gold', amount: 5 },
          { type: 'log', text: '你自認技不如人，謙遜婉拒。劍聖倒也不強求，笑著留下些許銀錢便離去。' },
        ],
      },
    ],
  },
  {
    id: 'ev_rare_moonlit_market',
    context: {},
    weight: 1,
    title: '月光市集',
    body: '夜色正濃時，商隊竟撞見一座燈籠高懸的奇異市集，攤販與貨品都透著幾分不似人間的光澤。老闆們的臉隱在陰影裡，只有交易時的笑聲格外清晰——傳說中的月光市集，居然是真的。',
    options: [
      {
        label: '把握機會採買（魅力）',
        check: { stat: 'cha', dc: 13 },
        success: [
          { type: 'item', itemId: 'herb', count: 2 },
          { type: 'item', itemId: 'spice-pouch', count: 1 },
          { type: 'gold', amount: -15 },
          { type: 'log', text: '你殺價成功，用不多的銀錢換來一批品質極佳的稀奇貨品。' },
        ],
        failure: [
          { type: 'gold', amount: -10 },
          { type: 'log', text: '你被攤販的話術繞得團團轉，花了冤枉錢卻什麼也沒買成。' },
        ],
      },
      {
        label: '心生警惕，快步離開',
        success: [{ type: 'log', text: '這座市集透著詭異的氣息，你決定不冒這個險，快步離開。' }],
      },
    ],
  },
  {
    id: 'ev_rare_wounded_messenger',
    context: {},
    weight: 2,
    title: '受傷的信使',
    body: '一名信使跌跌撞撞地攔住商隊，背上的箭傷還在滲血，懷裡死死護著一個火漆封緘的信封。「拜託……務必送到……」他話未說完便昏厥過去，商隊陷入兩難。',
    options: [
      {
        label: '施救並代為送信（體質）',
        check: { stat: 'con', dc: 13 },
        success: [
          { type: 'gold', amount: 45 },
          { type: 'log', text: '你妥善包紮傷口並代為送達信件，收件人重重酬謝了商隊。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -4 },
          { type: 'gold', amount: 20 },
          { type: 'log', text: '信使傷勢比想像中嚴重，救治過程手忙腳亂，所幸最終仍完成了託付，換得一筆酬金。' },
        ],
      },
      {
        label: '僅止血包紮，不接下重託',
        success: [
          { type: 'item', itemId: 'bandage', count: -1 },
          { type: 'gold', amount: 10 },
          { type: 'log', text: '你為信使簡單止血包紮，婉拒了送信的重託，他虛弱地道謝並塞給你些許銀錢。' },
        ],
      },
    ],
  },

  // ---- M5：迷宮通用 4（適用所有迷宮） -------------------------------------
  {
    id: 'ev_dungeon_flicker_torch',
    context: { kind: 'dungeon' },
    weight: 9,
    title: '搖曳的火光',
    body: '手中的火把毫無來由地劇烈搖曳，光影在牆上扭曲成詭異的形狀，彷彿有什麼東西正屏息躲在暗處窺視著商隊的一舉一動。',
    options: [
      {
        label: '猛然轉身查看（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [
          { type: 'gold', amount: 15 },
          { type: 'log', text: '你猛然回身，只驚起一群受驚的蝙蝠，牆角還遺落著幾枚舊硬幣。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -3 },
          { type: 'log', text: '轉身太急撞上了突起的岩壁，眾人吃痛地悶哼一聲。' },
        ],
      },
      {
        label: '加快腳步，不予理會',
        success: [{ type: 'log', text: '你們加快腳步離開這片陰影，沒有回頭查看。' }],
      },
    ],
  },
  {
    id: 'ev_dungeon_forgotten_shrine',
    context: { kind: 'dungeon' },
    weight: 9,
    title: '被遺忘的祭壇',
    body: '轉角處立著一座布滿蛛網的小祭壇，供奉的神祇早已無人記得名號，壇上還擺著幾枚早已氧化發黑的銅幣，散發著陳年的靜謐氣息。',
    options: [
      {
        label: '誠心獻上香油錢（魅力）',
        check: { stat: 'cha', dc: 12 },
        success: [
          { type: 'hp', target: 'party', amount: 4 },
          { type: 'log', text: '你虔誠地獻上香油錢，一股暖意悄然撫平了眾人的疲憊。' },
        ],
        failure: [{ type: 'log', text: '祭壇沒有任何回應，只留下一片死寂。' }],
      },
      {
        label: '順手取走銅幣',
        success: [
          { type: 'gold', amount: 12 },
          { type: 'log', text: '你順手取走壇上早已氧化的銅幣，換了幾枚可用的銀錢。' },
        ],
      },
    ],
  },
  {
    id: 'ev_dungeon_narrow_crevice',
    context: { kind: 'dungeon' },
    weight: 9,
    title: '狹窄的裂隙',
    body: '前方通道驟然收窄成一道僅容一人側身通過的裂隙，尖銳的岩壁彷彿隨時會刮傷皮肉，隊員們面面相覷，猶豫著該不該冒險擠過去。',
    options: [
      {
        label: '側身擠過（敏捷）',
        check: { stat: 'dex', dc: 13 },
        success: [{ type: 'log', text: '你靈巧地側身擠過裂隙，商隊全員有驚無險地通過。' }],
        failure: [
          { type: 'hp', target: 'protagonist', amount: -3 },
          { type: 'log', text: '尖銳的岩壁劃破了衣衫與皮肉，你咬牙擠了過去。' },
        ],
      },
      {
        label: '找找有無其他通路',
        success: [
          { type: 'gold', amount: -5 },
          { type: 'log', text: '你們花了些時間繞路，總算找到一條較寬敞的通道。' },
        ],
      },
    ],
  },
  {
    id: 'ev_dungeon_whispering_walls',
    context: { kind: 'dungeon' },
    weight: 9,
    title: '低語的石壁',
    body: '石壁深處傳來若有似無的低語，聽不清內容，卻讓人莫名心神不寧，彷彿有無數細小的聲音正在耳邊竊竊私語，訴說著聽不懂的古老語言。',
    options: [
      {
        label: '凝神細聽（智力）',
        check: { stat: 'int', dc: 13 },
        success: [
          { type: 'item', itemId: 'ore', count: 1 },
          { type: 'log', text: '你辨出低語中反覆提及的方位，循聲找到了一小塊裸露的礦脈。' },
        ],
        failure: [
          { type: 'hp', target: 'party', amount: -2 },
          { type: 'log', text: '低語聲越聽越教人心神不寧，眾人只覺頭痛欲裂，倉皇離開。' },
        ],
      },
      {
        label: '摀住耳朵快步通過',
        success: [{ type: 'log', text: '你們摀住耳朵快步通過這片石室，沒有多做停留。' }],
      },
    ],
  },
];

registerEvents(EVENTS);
