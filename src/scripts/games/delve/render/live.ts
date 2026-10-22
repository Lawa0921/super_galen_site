// live.ts — 存活中的遊戲 handle / 標題場景 / 音效管理器 / 遊戲迴圈計數（e2e 驗證「回到標題」後沒有殘留）。
// 只是計數器，不持有任何物件參照。
export const LIVE = { handles: 0, scenes: 0, sounds: 0 };

/** 每個遊戲迴圈最後一次跑幀的時間（id → performance.now()） */
const lastFrame = new Map<number, number>();
let nextId = 1;
export function loopId(): number { return nextId++; }
export function markFrame(id: number, now: number): void { lastFrame.set(id, now); }
export function endLoop(id: number): void { lastFrame.delete(id); }

/** 最近 windowMs 內有跑幀的遊戲迴圈數（洩漏的 rAF 迴圈也會被數到） */
export function activeLoops(now: number, windowMs = 300): number {
  let n = 0;
  for (const t of lastFrame.values()) if (now - t < windowMs) n++;
  return n;
}

export interface LiveCounts { handles: number; scenes: number; sounds: number; loops: number }
export function liveCounts(now: number): LiveCounts {
  return { ...LIVE, loops: activeLoops(now) };
}
