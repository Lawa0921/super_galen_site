// wipe.ts — 標題 → 遊戲的像素抖動轉場：全螢幕低解析畫布（每格 CELL CSS px），
// 格子依 wipeThreshold（由左往右的斜掃 + 4×4 Bayer）逐一蓋上 / 掀開；邊緣一圈暖色像素像鑿開的岩面。
// 只有完全不透明 / 完全透明兩種像素；prefers-reduced-motion 時直接切換。
import { wipeThreshold, wipeLead } from './titleModel';

const CELL = 8;
const DARK = 0xff120a0c; // #0c0a12（ABGR）
const EDGE = 0xff10182a; // #2a1810
const EMBER = 0xff1c70e8; // #e8701c

export class Wipe {
  private ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;
  private pix = new Uint32Array(0);
  private th = new Float32Array(0);
  /** 每格的掃描前緣位置（不含抖動）：剛蓋上、靠近前緣的格塗成暖色 */
  private lead = new Float32Array(0);
  private w = 0;
  private h = 0;
  private raf = 0;
  /** 目前覆蓋程度（0 = 全開、1 = 全蓋） */
  level = 0;

  constructor(readonly canvas: HTMLCanvasElement, private readonly reduced: boolean) {
    this.ctx = canvas.getContext('2d');
  }

  private size(): void {
    const cw = Math.max(1, Math.ceil(window.innerWidth / CELL)), ch = Math.max(1, Math.ceil(window.innerHeight / CELL));
    if (cw === this.w && ch === this.h && this.img) return;
    this.w = cw; this.h = ch;
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.style.setProperty('--wipe-w', `${cw * CELL}px`);
    this.canvas.style.setProperty('--wipe-h', `${ch * CELL}px`);
    this.img = this.ctx?.createImageData(cw, ch) ?? null;
    this.pix = this.img ? new Uint32Array(this.img.data.buffer) : new Uint32Array(0);
    this.th = new Float32Array(cw * ch);
    this.lead = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { this.th[y * cw + x] = wipeThreshold(x, y, cw); this.lead[y * cw + x] = wipeLead(x, y, cw); }
  }

  /** 畫出進度 t：cover = 門檻 ≤ t 的格蓋上；!cover（掀開）= 門檻 > t 的格還蓋著 */
  private paint(t: number, cover: boolean): void {
    this.size();
    const { pix, th, lead, img, ctx } = this;
    const mid = t > 0 && t < 1;
    if (!img || !ctx) return;
    for (let i = 0; i < th.length; i++) {
      const v = th[i];
      const on = cover ? v <= t : v > t;
      if (!on) { pix[i] = 0; continue; }
      // 前緣（掃描位置剛過這裡）：一道抖動的暖色帶，像鑿開岩面的火光
      const behind = cover ? t - lead[i] : lead[i] - t + 0.4;
      pix[i] = mid && behind < 0.1 ? EMBER : mid && behind < 0.2 ? EDGE : DARK;
    }
    ctx.putImageData(img, 0, 0);
    this.canvas.hidden = !cover && t >= 1;
  }

  private run(ms: number, cover: boolean): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.canvas.hidden = false;
    if (this.reduced || ms <= 0) {
      this.paint(1, cover);
      this.level = cover ? 1 : 0;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        // 以 8 格 / 秒的節奏分階前進（steps，像素遊戲的轉場不做平滑補間）
        const raw = Math.min(1, (now - t0) / ms);
        const t = Math.min(1, Math.ceil(raw * 16) / 16);
        this.paint(t, cover);
        this.level = cover ? t : 1 - t;
        if (raw >= 1) { resolve(); return; }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  cover(ms = 380): Promise<void> { return this.run(ms, true); }
  reveal(ms = 460): Promise<void> { return this.run(ms, false); }
  /** 直接蓋滿（開局前的生成畫面；不播動畫） */
  coverNow(): void { this.canvas.hidden = false; this.paint(1, true); this.level = 1; }

  destroy(): void { cancelAnimationFrame(this.raf); }
}
