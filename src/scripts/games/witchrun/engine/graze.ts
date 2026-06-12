// graze.ts
import { OVERDRIVE_MAX, GRAZE_GAIN, OVERDRIVE_DURATION_MS } from './constants';

/** OVERDRIVE 槽：擦彈累積 → 滿槽手動引爆 → 限時火力全開。被彈全清。 */
export class Overdrive {
  gauge = 0;       // 0..OVERDRIVE_MAX
  activeMs = 0;    // >0 表示火力全開中

  get isActive(): boolean { return this.activeMs > 0; }
  get isFull(): boolean { return this.gauge >= OVERDRIVE_MAX; }

  /** grazes 次擦彈；focusBonus 為星屑掃帚低速加成（0 或 0.3）。active 中不累積。 */
  addGraze(grazes: number, focusBonus: number): void {
    if (this.isActive) return;
    this.gauge = Math.min(OVERDRIVE_MAX, this.gauge + grazes * GRAZE_GAIN * (1 + focusBonus));
  }

  /** 滿槽才可引爆；durMult 為回音鈴倍率。回傳是否成功。 */
  activate(durMult: number): boolean {
    if (!this.isFull || this.isActive) return false;
    this.gauge = 0;
    this.activeMs = OVERDRIVE_DURATION_MS * durMult;
    return true;
  }

  tick(dtMs: number): void {
    this.activeMs = Math.max(0, this.activeMs - dtMs);
  }

  onPlayerHit(): void {
    this.gauge = 0;
    this.activeMs = 0;
  }
}
