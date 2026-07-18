import type { TownDef } from '../economy';

/**
 * M4 首批城鎮：3 座。
 * 啟程之鎮＝經濟基準（priceModifiers 全 1.0，即空表）；河灣鎮／林邊聚落各為
 * 一條路線的終點，靠差價讓「啟程買低→目的地賣高」的押貨貿易有利可圖
 * （見 economy.test.ts / data.test.ts 的差價 sanity）。
 */
export const TOWNS: Record<string, TownDef> = {
  'starting-town': {
    id: 'starting-town',
    name: '啟程之鎮',
    desc: '商隊由此啟程，青石廣場終年人聲鼎沸，鐵匠爐火不熄，貨棧招牌層層疊疊，是踏上未知路途前最後一次安穩補給。',
    priceModifiers: {},
    stock: ['herb', 'bandage', 'torch', 'dried-rations', 'ore', 'spider-silk', 'spice-pouch'],
  },
  'riverbend-town': {
    id: 'riverbend-town',
    name: '河灣鎮',
    desc: '臨水道的終點，碼頭終日停滿駁船，鍛造坊搶收礦石與蛛絲，草藥卻因盛產而賤價，偶有溺水旅人的銀懷錶被沖上岸轉手拍賣。',
    priceModifiers: { ore: 1.5, 'spider-silk': 1.4, herb: 0.6 },
    stock: ['herb', 'silver-locket', 'ore', 'spider-silk'],
  },
  'woodside-settlement': {
    id: 'woodside-settlement',
    name: '林邊聚落',
    desc: '黑森林徑的盡頭，木造矮屋沿林緣錯落，獵人與草藥商在此交易，遠道商旅捎來的香料包總能賣出好價錢，礦石則因不產而滯銷。',
    priceModifiers: { herb: 2.4, 'spice-pouch': 1.8, ore: 0.7 },
    stock: ['herb', 'spice-pouch', 'goblin-earring', 'dried-rations'],
  },
};
