// fontGate.ts — 點陣字型的載入閘門（純邏輯；document.fonts 由呼叫端注入，可以沒有）：
//   Google Fonts 的 CJK 字型依 unicode-range 分片、用到才下載，canvas 畫字不一定會觸發載入 →
//   第一次開地圖會先用後備字型畫、字型到了又跳成點陣字。ready(text) 在那些字載入前回 false
//   （呼叫端先不畫字），並主動 load；載入完成 / 任何 loadingdone 事件 → onChange（呼叫端清快取重畫）。
//   逾時（離線、字型被擋）後放行，用後備字型總比一直沒有字好。
export interface FontSetLike {
  check(font: string, text?: string): boolean;
  load(font: string, text?: string): Promise<unknown>;
  addEventListener?(type: string, fn: () => void): void;
}

export class FontGate {
  private pending = new Set<string>();
  private gaveUp = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly font: string;

  constructor(private fonts: FontSetLike | undefined | null, family: string, private onChange: () => void, private timeoutMs = 2500) {
    this.font = `16px "${family}"`;
    try { fonts?.addEventListener?.('loadingdone', () => this.onChange()); } catch { /* 不支援事件：只靠 load 的 promise */ }
  }

  /** text 用的字是否已可用（或沒辦法知道 / 已放棄等待） */
  ready(text: string): boolean {
    const f = this.fonts;
    if (!f || this.gaveUp) return true;
    try {
      if (f.check(this.font, text)) return true;
    } catch { return true; }
    if (!this.pending.has(text)) {
      this.pending.add(text);
      let p: Promise<unknown>;
      try { p = f.load(this.font, text); } catch { return true; }
      p.then(() => {
        this.pending.delete(text);
        // 等的都到了 → 取消逾時（之後新的字照樣等載入，不會被舊的計時器放行）
        if (!this.pending.size && this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.onChange();
      }, () => { this.gaveUp = true; this.onChange(); });
      if (!this.timer) this.timer = setTimeout(() => { this.gaveUp = true; this.onChange(); }, this.timeoutMs);
    }
    return false;
  }
}
