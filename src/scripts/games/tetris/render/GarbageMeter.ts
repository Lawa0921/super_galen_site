import { Container, Graphics } from 'pixi.js';

const MAX_LINES = 16; // 計量條滿格對應的待入行數

/** 中央垃圾計量條：左半 = A 待入、右半 = B 待入，由下往上填紅，量高時脈動警示。 */
export class GarbageMeter {
  private g = new Graphics();
  private rect = { x: 0, y: 0, w: 0, h: 0 };
  private t = 0;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  setLayout(rect: { x: number; y: number; w: number; h: number }): void {
    this.rect = rect;
  }

  render(pendingA: number, pendingB: number, dtMs: number): void {
    this.t += dtMs;
    const { x, y, w, h } = this.rect;
    const g = this.g.clear();
    g.rect(x, y, w, h).fill({ color: 0x0a0e18, alpha: 0.55 });
    g.rect(x, y, w, h).stroke({ width: 1, color: 0x33405c, alpha: 0.7 });

    const half = w / 2;
    const bar = (bx: number, pending: number): void => {
      const frac = Math.min(1, pending / MAX_LINES);
      if (frac <= 0) return;
      const bh = h * frac;
      const hot = pending >= MAX_LINES * 0.55;
      const pulse = hot ? 0.6 + 0.4 * Math.abs(Math.sin(this.t * 0.012)) : 1;
      const col = pending >= MAX_LINES * 0.8 ? 0xff2a3a : 0xff6a4d;
      g.rect(bx + 1, y + h - bh, half - 2, bh).fill({ color: col, alpha: 0.88 * pulse });
    };
    bar(x, pendingA);
    bar(x + half, pendingB);
  }
}
