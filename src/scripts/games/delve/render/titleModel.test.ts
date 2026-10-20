// titleModel.test.ts — 標題畫面的純邏輯：存檔摘要、遊玩時間、世界名骰子、選單鍵盤移動、音量 / 偏好、生成進度
import { describe, it, expect } from 'vitest';
import {
  formatPlayTime, summarizeGame, continueLines, rollWorldName, menuMove, readVolume, writeVolume, VOLUME_KEY,
  genStageLabel, genProgress, wipeThreshold, titleCamY, panX, zoomPrefLabel, savedAgo, realDate, descentY, focusFor,
  worldLine, characterLine, continueSlot,
} from './titleModel';
import { DAY_LENGTH } from '../engine/constants';

function memStore(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
  };
}

describe('formatPlayTime', () => {
  it('不到一分鐘 / 分鐘 / 小時＋分', () => {
    expect(formatPlayTime(0)).toBe('不到 1 分鐘');
    expect(formatPlayTime(59)).toBe('不到 1 分鐘');
    expect(formatPlayTime(60)).toBe('1 分鐘');
    expect(formatPlayTime(59 * 60 + 59)).toBe('59 分鐘');
    expect(formatPlayTime(3600)).toBe('1 小時');
    expect(formatPlayTime(3600 * 2 + 60 * 5 + 7)).toBe('2 小時 5 分');
  });
  it('壞值當 0', () => {
    expect(formatPlayTime(Number.NaN)).toBe('不到 1 分鐘');
    expect(formatPlayTime(-5)).toBe('不到 1 分鐘');
  });
});

describe('summarizeGame / continueLines', () => {
  const g = {
    seed: 'keepme', time: DAY_LENGTH * 9.5, tick: 60 * 60 * 75, peaceful: false,
    discovery: { stats: () => ({ completion: 0.0712, depthRecord: 212 }) },
  };
  it('從遊戲擷取摘要（tick 60Hz → 秒）', () => {
    expect(summarizeGame(g)).toEqual({ seed: 'keepme', time: DAY_LENGTH * 9.5, playSec: 4500, depth: 212, completion: 0.0712, peaceful: false });
  });
  it('有摘要：種子 + 日期、遊玩時間 / 最深 / 完成度', () => {
    const l = continueLines({ seed: 'keepme', savedAt: 0, summary: summarizeGame(g) }, 0);
    expect(l[0]).toBe('「keepme」 第1年 夏 3日');
    // 每一項內部用不換行空白（「完成度 1%」不會被拆到兩行），項與項之間的 · 兩側才可以換行
    expect(l[1]).toBe('遊玩 1 小時 15 分 · 最深 212 格 · 完成度 7%');
  });
  it('和平模式加註；還沒下過地底不寫最深', () => {
    const s = { ...summarizeGame(g), peaceful: true, depth: 0 };
    const l = continueLines({ seed: 'x', savedAt: 0, summary: s }, 0);
    expect(l[1].replace(/ /g, ' ')).toBe('遊玩 1 小時 15 分 · 完成度 7% · 和平');
  });
  it('舊存檔沒有摘要：種子 + 上次存檔多久前', () => {
    const now = 1_000_000_000;
    expect(continueLines({ seed: 'old', savedAt: now - 3 * 60_000 }, now)).toEqual(['「old」', '上次存檔 3 分鐘前']);
  });
  it('摘要帶暱稱 → 第二行最前面是暱稱', () => {
    const l = continueLines({ seed: 'keepme', savedAt: 0, summary: summarizeGame({ ...g, levels: { level: 3 } }, '旅人') }, 0);
    expect(l[1].startsWith('旅人 · 等級')).toBe(true);
  });
  it('沒給暱稱 → 摘要沒有 nick 欄位（舊測試的 toEqual 不受影響）', () => expect(summarizeGame(g)).not.toHaveProperty('nick'));
  it('暱稱是空字串 → 不放進第二行', () => {
    const l = continueLines({ seed: 'keepme', savedAt: 0, summary: { ...summarizeGame(g), nick: '' } }, 0);
    expect(l[1].startsWith('遊玩')).toBe(true);
  });
  it('摘要欄位壞掉（舊格式 / 被改）→ 當作沒有摘要', () => {
    const l = continueLines({ seed: 'bad', savedAt: 0, summary: { seed: 'bad' } as never }, 0);
    expect(l[0]).toBe('「bad」');
  });
});

describe('worldLine / characterLine（角色 / 世界列表的一行摘要）', () => {
  const sp = (s: string): string => s.replace(/ /g, ' ');
  const now = 1_000_000_000;
  const summary = { seed: '青苔深谷7', time: 0, playSec: 4500, depth: 212, completion: 0.0712, peaceful: false };
  it('世界：名稱 · 遊玩時間 · 最深 · 完成度 · 上次遊玩多久前', () => {
    const l = worldLine({ slot: 'w-1', seed: '青苔深谷7', savedAt: now - 3 * 60_000, bytes: 1, summary }, now);
    expect(sp(l)).toBe('「青苔深谷7」 · 遊玩 1 小時 15 分 · 最深 212 格 · 完成度 7% · 3 分鐘前');
  });
  it('世界：和平模式加註、還沒下過地底不寫最深、剛剛存的寫「剛剛」', () => {
    const l = worldLine({ slot: 'w-2', seed: 'x', savedAt: now - 1000, bytes: 1, summary: { ...summary, depth: 0, peaceful: true } }, now);
    expect(sp(l)).toBe('「x」 · 遊玩 1 小時 15 分 · 完成度 7% · 和平 · 剛剛');
  });
  it('世界：沒有摘要（舊存檔）→ 名稱 · 上次遊玩多久前', () => {
    expect(sp(worldLine({ slot: 'main', seed: 'old', savedAt: now - 2 * 3_600_000, bytes: 1 }, now))).toBe('「old」 · 2 小時前');
  });
  it('項目內部用不換行空白（只在 · 處換行）', () => {
    const l = worldLine({ slot: 'w-1', seed: 'a b', savedAt: now, bytes: 1, summary }, now);
    expect(l.split(' · ').every((part) => !part.includes(' '))).toBe(true);
  });
  const look = { body: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, shirt: 0, pants: 0, shoes: 0 } as never;
  it('角色：暱稱 · Lv · 上次遊玩多久前', () => {
    const l = characterLine({ id: 'a', nick: '阿明', savedAt: now - 5 * 60_000, rev: 4, level: 3, appearance: look }, now);
    expect(sp(l)).toBe('阿明 · Lv 3 · 5 分鐘前');
  });
  it('角色：剛建立還沒進過世界（rev 0）→ 從未遊玩', () => {
    const l = characterLine({ id: 'b', nick: '旅人', savedAt: now, rev: 0, level: 1, appearance: look }, now);
    expect(sp(l)).toBe('旅人 · Lv 1 · 從未遊玩');
  });
});

describe('continueSlot（「繼續冒險」指向哪個世界；同 planContinue 不帶 slot 的挑法，只看清單不解碼）', () => {
  const w = (slot: string, savedAt: number, charId?: string) => ({ slot, seed: slot, savedAt, bytes: 1, ...(charId ? { charId } : {}) });
  it('新到舊取第一個「角色還在」的世界', () => {
    const worlds = [w('w-new', 3, 'gone'), w('w-mid', 2, 'b'), w('w-old', 1, 'a')];
    expect(continueSlot(worlds, [{ id: 'a' }, { id: 'b' }])?.slot).toBe('w-mid');
  });
  it('沒有 charId 的舊存檔（main）照樣可以繼續', () => {
    expect(continueSlot([w('w-1', 3, 'gone'), w('main', 1)], [])?.slot).toBe('main');
  });
  it('沒有可玩的組合 → null', () => {
    expect(continueSlot([], [{ id: 'a' }])).toBeNull();
    expect(continueSlot([w('w-1', 1, 'gone')], [{ id: 'a' }])).toBeNull();
  });
});

describe('savedAgo', () => {
  it('剛剛 / 分鐘 / 小時 / 天', () => {
    expect(savedAgo(0, 30_000)).toBe('剛剛');
    expect(savedAgo(0, 5 * 60_000)).toBe('5 分鐘前');
    expect(savedAgo(0, 3 * 3_600_000)).toBe('3 小時前');
    expect(savedAgo(0, 2 * 86_400_000)).toBe('2 天前');
  });
});

describe('rollWorldName', () => {
  it('可重現、長度 ≤ 32、不含空白', () => {
    let s = 1;
    const r = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const names = Array.from({ length: 50 }, () => rollWorldName(r));
    for (const n of names) { expect(n.length).toBeLessThanOrEqual(32); expect(n).not.toMatch(/\s/); expect(n.length).toBeGreaterThan(2); }
    expect(new Set(names).size).toBeGreaterThan(30);
    let t = 1;
    const r2 = (): number => { t = (t * 16807) % 2147483647; return t / 2147483647; };
    expect(rollWorldName(r2)).toBe(names[0]);
  });
});

describe('menuMove', () => {
  const vis = [true, false, true, true];
  it('↑ / ↓ 跳過隱藏項、頭尾繞回；Home / End', () => {
    expect(menuMove(vis, 0, 'ArrowDown')).toBe(2);
    expect(menuMove(vis, 2, 'ArrowDown')).toBe(3);
    expect(menuMove(vis, 3, 'ArrowDown')).toBe(0);
    expect(menuMove(vis, 0, 'ArrowUp')).toBe(3);
    expect(menuMove(vis, 2, 'ArrowUp')).toBe(0);
    expect(menuMove(vis, 3, 'Home')).toBe(0);
    expect(menuMove(vis, 0, 'End')).toBe(3);
  });
  it('目前不在選單上（-1）→ ↓ 到第一個、↑ 到最後一個；其他鍵回 null', () => {
    expect(menuMove(vis, -1, 'ArrowDown')).toBe(0);
    expect(menuMove(vis, -1, 'ArrowUp')).toBe(3);
    expect(menuMove(vis, 0, 'a')).toBeNull();
    expect(menuMove([false, false], 0, 'ArrowDown')).toBeNull();
  });
});

describe('音量（遊戲廳共用 arcade-sfx-vol）', () => {
  it('讀：沒有 / 壞值 → 預設 0.6；夾在 0..1', () => {
    expect(readVolume(memStore())).toBe(0.6);
    expect(readVolume(memStore({ [VOLUME_KEY]: 'abc' }))).toBe(0.6);
    expect(readVolume(memStore({ [VOLUME_KEY]: '0.25' }))).toBe(0.25);
    expect(readVolume(memStore({ [VOLUME_KEY]: '7' }))).toBe(1);
    expect(readVolume(undefined)).toBe(0.6);
  });
  it('寫：夾住後存起來', () => {
    const s = memStore();
    writeVolume(s, 1.4);
    expect(s.getItem(VOLUME_KEY)).toBe('1');
    writeVolume(s, 0.35);
    expect(readVolume(s)).toBe(0.35);
  });
});

describe('zoomPrefLabel', () => {
  it('0 = 預設、正數放大、負數縮小', () => {
    expect(zoomPrefLabel(0)).toBe('預設');
    expect(zoomPrefLabel(2)).toBe('放大 +2');
    expect(zoomPrefLabel(-1)).toBe('縮小 −1');
  });
});

describe('世界生成進度', () => {
  it('階段名 → 玩家看得懂的標籤', () => {
    expect(genStageLabel('caves:worms')).toBe('挖掘洞穴');
    expect(genStageLabel('礦脈群（')).toBe('埋下礦脈');
    expect(genStageLabel('樹木')).toBe('種下樹木');
    expect(genStageLabel('液體')).toBe('引入泉水');
    expect(genStageLabel('不認得的')).toBe('塑造世界');
  });
  it('進度單調遞增、介於 0..1', () => {
    let last = 0;
    for (let i = 0; i <= 40; i++) { const p = genProgress(i, 40); expect(p).toBeGreaterThanOrEqual(last); expect(p).toBeLessThanOrEqual(1); last = p; }
    expect(genProgress(40, 40)).toBe(1);
    expect(genProgress(0, 40)).toBe(0);
  });
});

describe('wipeThreshold（像素抖動轉場）', () => {
  it('t=0 全部沒蓋、t=1 全部蓋滿；中間是由左往右的抖動帶', () => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) {
      expect(wipeThreshold(x, y, 64) > 0).toBe(true);
      expect(wipeThreshold(x, y, 64) <= 1).toBe(true);
    }
    // 左邊比右邊早蓋上
    let left = 0, right = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { left += wipeThreshold(x, y, 64); right += wipeThreshold(56 + x, y, 64); }
    expect(left).toBeLessThan(right);
  });
});

describe('標題背景鏡頭', () => {
  it('panX：在 [x0, x1] 之間來回（ping-pong），連續', () => {
    expect(panX(0, 100, 500, 10)).toBe(100);
    expect(panX(10, 100, 500, 10)).toBe(200);
    expect(panX(40, 100, 500, 10)).toBe(500);
    expect(panX(50, 100, 500, 10)).toBe(400);
    expect(panX(80, 100, 500, 10)).toBe(100);
  });
  it('titleCamY：讓鏡頭附近的平均地表落在畫面 horizon 比例的位置', () => {
    const surf = new Int16Array(100).fill(50);
    // 地表 50 格 = 800 px；畫面高 300、地平線在 0.6 → 鏡頭 y = 800 − 180
    expect(titleCamY(surf, 16, 0, 160, 300, 0.6)).toBe(620);
  });
});

describe('realDate', () => {
  it('月份 → 季節、季內天數 1..7；本地時刻', () => {
    expect(realDate(new Date(2026, 9, 17, 22, 30))).toEqual({ season: 2, day: 4, hour: 22.5 });
    expect(realDate(new Date(2026, 2, 1, 6, 0))).toEqual({ season: 0, day: 1, hour: 6 });
    expect(realDate(new Date(2026, 4, 31, 0, 0)).day).toBe(7);
    expect(realDate(new Date(2026, 11, 1, 0, 0))).toMatchObject({ season: 3, day: 1 });
    expect(realDate(new Date(2027, 1, 28, 0, 0))).toMatchObject({ season: 3, day: 7 });
    expect(realDate(new Date(2026, 6, 15, 12, 0)).season).toBe(1);
  });
});

describe('開場鏡頭', () => {
  it('descentY：從天空 y0 緩入緩出降到 y1，之後停住；中途單調', () => {
    expect(descentY(0, -500, 300, 7)).toBe(-500);
    expect(descentY(7, -500, 300, 7)).toBe(300);
    expect(descentY(20, -500, 300, 7)).toBe(300);
    expect(descentY(3.5, -500, 300, 7)).toBe(-100);
    let last = -Infinity;
    for (let t = 0; t <= 7; t += 0.25) { const y = descentY(t, -500, 300, 7); expect(y).toBeGreaterThanOrEqual(last); last = y; }
  });
  it('focusFor：寬螢幕主角在右側（選單在左）、直式在中上、其他置中', () => {
    expect(focusFor(1280, 720)).toEqual({ x: 0.68, y: 0.56 });
    expect(focusFor(390, 844)).toEqual({ x: 0.5, y: 0.52 });
    expect(focusFor(844, 390)).toEqual({ x: 0.5, y: 0.58 });
  });
});
