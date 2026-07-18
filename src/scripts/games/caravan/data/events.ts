import type { EventCard } from '../expedition';
import { registerEvents } from '../expedition';

// ---------------------------------------------------------------------------
// M3 首批事件卡：15 張
// 路線通用 8（含旗標鏈 2：ev_merchant_map → ev_cave_entrance）
// 森林（黑森林徑）限定 3
// 迷宮限定 4
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
];

registerEvents(EVENTS);
