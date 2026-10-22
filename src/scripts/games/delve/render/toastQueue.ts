// toastQueue.ts — HUD 提示的排隊規則（純邏輯）：同一個提示格一次只顯示一則。
//   · 優先度相同或更高的新提示 → 立刻換上（和以前一樣，連續操作的提示不會塞車）
//   · 優先度比目前低的 → 排隊，等目前這則顯示完再出來（例：圖鑑收錄不會蓋掉「獲得傳說裝備」）
// 優先度：0 = 次要（圖鑑收錄）、1 = 一般、2 = 重要（傳說以上掉落 / 撿起、不滅）
export interface ToastMsg { text: string; ms: number; prio: number; }
export const TOAST_LOW = 0;
export const TOAST_NORMAL = 1;
export const TOAST_HIGH = 2;
const MAX_QUEUE = 4;

export class ToastQueue {
  current: (ToastMsg & { left: number }) | null = null;
  readonly queue: ToastMsg[] = [];

  /** 回傳 'show' = 立刻顯示、'queued' = 排在後面 */
  push(m: ToastMsg): 'show' | 'queued' {
    if (!this.current || m.prio >= this.current.prio) {
      this.current = { ...m, left: m.ms };
      return 'show';
    }
    if (!this.queue.some((q) => q.text === m.text)) {
      this.queue.push(m);
      // 太多就丟掉最舊的次要提示
      while (this.queue.length > MAX_QUEUE) this.queue.shift();
    }
    return 'queued';
  }
  /** 經過 dt 毫秒；回傳現在該顯示的提示（null = 收起） */
  tick(dtMs: number): ToastMsg | null {
    if (!this.current) return null;
    this.current.left -= dtMs;
    if (this.current.left > 0) return this.current;
    const next = this.queue.shift();
    this.current = next ? { ...next, left: next.ms } : null;
    return this.current;
  }
}
