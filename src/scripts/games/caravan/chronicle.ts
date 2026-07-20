// 跨輪編年史（meta 層）：圖鑑收集、成就、傳承點。
// 獨立於存檔 v5——newGame 不清除，永續累積；storage 注入同 save.ts 慣例。
import { EVENTS } from './data/events';
import { LOCATIONS } from './data/locations';
import { ITEMS } from './data/items';
import { ENCOUNTERS, TRAINING_ENCOUNTER } from './data/enemies';

export const CHRONICLE_KEY = 'caravan-chronicle-v1';

export interface Chronicle {
  v: 1;
  seenEvents: string[];
  defeatedEnemies: string[]; // 以單位名去重（同名同種）
  visitedLocations: string[];
  ownedEquipment: string[]; // 曾擁有即收錄
  runs: { started: number; won: number };
  legacyPoints: number;
  unlockedAchievements: string[];
}

export function emptyChronicle(): Chronicle {
  return {
    v: 1,
    seenEvents: [], defeatedEnemies: [], visitedLocations: [], ownedEquipment: [],
    runs: { started: 0, won: 0 },
    legacyPoints: 0,
    unlockedAchievements: [],
  };
}

export function saveChronicle(c: Chronicle, storage: Storage = localStorage): void {
  storage.setItem(CHRONICLE_KEY, JSON.stringify(c));
}

export function loadChronicle(storage: Storage = localStorage): Chronicle {
  try {
    const raw = storage.getItem(CHRONICLE_KEY);
    if (!raw) return emptyChronicle();
    const parsed = JSON.parse(raw) as Chronicle;
    if (parsed.v !== 1 || !Array.isArray(parsed.seenEvents)) return emptyChronicle();
    return { ...emptyChronicle(), ...parsed };
  } catch {
    return emptyChronicle();
  }
}

/** 冪等收錄：新收錄回傳 true。 */
const record = (list: string[], id: string): boolean => {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
};

export const recordEvent = (c: Chronicle, eventId: string): boolean => record(c.seenEvents, eventId);
export const recordEnemyDefeat = (c: Chronicle, enemyName: string): boolean => record(c.defeatedEnemies, enemyName);
export const recordLocationVisit = (c: Chronicle, locationId: string): boolean => record(c.visitedLocations, locationId);
export const recordEquipment = (c: Chronicle, itemId: string): boolean => record(c.ownedEquipment, itemId);

/** 遠征結束結算：won 得 1 傳承點；回傳新增傳承點。 */
export function recordExpedition(c: Chronicle, outcome: 'won' | 'lost' | 'retreat'): number {
  c.runs.started += 1;
  if (outcome !== 'won') return 0;
  c.runs.won += 1;
  c.legacyPoints += 1;
  return 1;
}

/** 傳承加成：新輪起始金幣，每點 +10G、上限 100G。 */
export const legacyBonusGold = (c: Chronicle): number => Math.min(100, c.legacyPoints * 10);

// ---- 收集進度（分母 build 時從 data 實算） ----
const TOTAL_ENEMIES = new Set(
  [...TRAINING_ENCOUNTER(), ...Object.values(ENCOUNTERS).flatMap((mk) => mk())].map((u) => u.name)
).size;
const TOTAL_EQUIPMENT = Object.values(ITEMS).filter((i) => i.equip).length;

export function collectionProgress(c: Chronicle): {
  events: [number, number]; enemies: [number, number]; locations: [number, number]; equipment: [number, number];
} {
  return {
    events: [c.seenEvents.length, EVENTS.length],
    enemies: [c.defeatedEnemies.length, TOTAL_ENEMIES],
    locations: [c.visitedLocations.length, Object.keys(LOCATIONS).length],
    equipment: [c.ownedEquipment.length, TOTAL_EQUIPMENT],
  };
}

// ---- 成就 ----
export interface AchievementDef { id: string; name: string; desc: string; check(c: Chronicle): boolean; }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-steps', name: '啟程者', desc: '首次遠征成功歸來', check: (c) => c.runs.won >= 1 },
  { id: 'veteran-roads', name: '老練商隊長', desc: '遠征成功歸來 10 次', check: (c) => c.runs.won >= 10 },
  { id: 'event-collector-half', name: '見多識廣', desc: '事件圖鑑收錄過半', check: (c) => c.seenEvents.length * 2 >= EVENTS.length },
  { id: 'event-collector-full', name: '路上的百科', desc: '事件圖鑑全數收錄', check: (c) => c.seenEvents.length >= EVENTS.length },
  { id: 'bestiary-complete', name: '獵人手冊', desc: '敵人圖鑑全數收錄', check: (c) => c.defeatedEnemies.length >= TOTAL_ENEMIES },
  { id: 'world-walker', name: '踏遍邊陲', desc: '所有商路與迷宮都走過', check: (c) => c.visitedLocations.length >= Object.keys(LOCATIONS).length },
  { id: 'quartermaster', name: '軍需官', desc: '所有裝備都曾入手', check: (c) => c.ownedEquipment.length >= TOTAL_EQUIPMENT },
  { id: 'boss-slayer', name: '屠魔者', desc: '擊敗三大頭目', check: (c) => ['礦坑監工', '巢穴頭目', '鹽晶洞主'].every((n) => c.defeatedEnemies.includes(n)) },
  { id: 'salt-pilgrim', name: '鹽路朝聖', desc: '走完霧嶺古道', check: (c) => c.visitedLocations.includes('misty-ridge-trail') },
  { id: 'hidden-paths', name: '看不見的路', desc: '踏入古戰場', check: (c) => c.visitedLocations.includes('battlefield-ruins') },
  { id: 'strange-friend', name: '奇怪的朋友', desc: '看完奇怪商人的終章', check: (c) => c.seenEvents.includes('ev_strange_merchant_finale') },
  { id: 'legacy-begins', name: '商會的名聲', desc: '累積 5 點傳承', check: (c) => c.legacyPoints >= 5 },
];

/** 判定並收錄新解鎖成就；回傳本次新解鎖 id（已解鎖過的不重報）。 */
export function evaluateAchievements(c: Chronicle): string[] {
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (c.unlockedAchievements.includes(a.id)) continue;
    if (a.check(c)) { c.unlockedAchievements.push(a.id); fresh.push(a.id); }
  }
  return fresh;
}
