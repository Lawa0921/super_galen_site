import type { TownDef } from '../economy';
import { registerTowns } from '../expedition';

/**
 * M4 首批城鎮：3 座。
 * 啟程之鎮＝經濟基準（priceModifiers 全 1.0，即空表）；河灣鎮／林邊聚落各為
 * 一條路線的終點，靠差價讓「啟程買低→目的地賣高」的押貨貿易有利可圖
 * （見 economy.test.ts / data.test.ts 的差價 sanity）。
 *
 * M5 擴充第 4 鎮「鹽泉城」：霧嶺古道（reputation≥40）的終點，鹽與裝備溢價——
 * 押貨鹽晶洞窟（reputation≥60）掉落的「鹽」走霧嶺古道到此變現，是全遊戲最長
 * （legs6）也最賺的押貨路線（見 data.test.ts 經濟量級 sanity）。
 */
export const TOWNS: Record<string, TownDef> = {
  'starting-town': {
    id: 'starting-town',
    art: '/assets/games/caravan/town-starting-town.webp',
    name: '啟程之鎮',
    desc: '商隊由此啟程，青石廣場終年人聲鼎沸，鐵匠爐火不熄，貨棧招牌層層疊疊，是踏上未知路途前最後一次安穩補給。',
    priceModifiers: {},
    stock: ['herb', 'bandage', 'torch', 'dried-rations', 'ore', 'spider-silk', 'spice-pouch', 'ridgeleather-vest'],
  },
  'riverbend-town': {
    id: 'riverbend-town',
    art: '/assets/games/caravan/town-riverbend-town.webp',
    name: '河灣鎮',
    desc: '臨水道的終點，碼頭終日停滿駁船，鍛造坊搶收礦石與蛛絲，草藥卻因盛產而賤價，偶有溺水旅人的銀懷錶被沖上岸轉手拍賣。',
    priceModifiers: { ore: 1.5, 'spider-silk': 1.4, herb: 0.6 },
    stock: ['herb', 'silver-locket', 'ore', 'spider-silk', 'saltforged-mail'],
  },
  'woodside-settlement': {
    id: 'woodside-settlement',
    art: '/assets/games/caravan/town-woodside-settlement.webp',
    name: '林邊聚落',
    desc: '黑森林徑的盡頭，木造矮屋沿林緣錯落，獵人與草藥商在此交易，遠道商旅捎來的香料包總能賣出好價錢，礦石則因不產而滯銷。',
    priceModifiers: { herb: 2.4, 'spice-pouch': 1.8, ore: 0.7 },
    stock: ['herb', 'spice-pouch', 'goblin-earring', 'dried-rations', 'ridge-mist-bow'],
  },
  'salt-spring-city': {
    id: 'salt-spring-city',
    art: '/assets/games/caravan/town-salt-spring-city.webp',
    name: '鹽泉城',
    desc: '霧嶺古道盡頭的鹽泉重鎮，泉眼終年湧出鹹澀溫泉，鹽商與鐵匠雲集，鹽貨與精良裝備皆待價而沽，稀罕貨色總開得起價錢。',
    priceModifiers: {
      salt: 1.8,
      'salt-crystal-blade': 1.4,
      'brine-blessed-mace': 1.3,
      'saltforged-mail': 1.3,
      'brinewarded-vestment': 1.3,
    },
    stock: ['salt', 'salt-crystal-blade', 'brine-blessed-mace', 'saltforged-mail', 'brinewarded-vestment', 'herb', 'torch'],
  },
};

registerTowns(TOWNS);
