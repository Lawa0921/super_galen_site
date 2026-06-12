import { Container, Graphics } from 'pixi.js';

/** v1：純色漸層夜空 + 緩慢下移的星點（捲動感）。Task 17 換成 TilingSprite 正式背景。 */
export class BackgroundView {
  private stars: { g: Graphics; speed: number }[] = [];
  constructor(private layer: Container, private fieldW: number, private fieldH: number) {
    const bg = new Graphics().rect(0, 0, fieldW, fieldH).fill(0x0a0716);
    layer.addChild(bg);
    for (let i = 0; i < 40; i++) {
      const g = new Graphics().circle(0, 0, Math.random() < 0.3 ? 2 : 1).fill(0x6a5a9a);
      g.x = Math.random() * fieldW; g.y = Math.random() * fieldH;
      layer.addChild(g);
      this.stars.push({ g, speed: 30 + Math.random() * 60 });
    }
  }
  update(dtMs: number): void {
    for (const s of this.stars) {
      s.g.y += s.speed * (dtMs / 1000);
      if (s.g.y > this.fieldH) { s.g.y = -2; s.g.x = Math.random() * this.fieldW; }
    }
  }
}
