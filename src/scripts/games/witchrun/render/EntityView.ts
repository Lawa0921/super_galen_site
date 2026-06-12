import { Container, Sprite, Graphics } from 'pixi.js';
import type { WitchState } from '../engine/types';
import { GRAZE_R, PLAYER_HIT_R } from '../engine/constants';
import type { WitchTextures } from './assets';

export class EntityView {
  private player: Sprite;
  private hitDot: Graphics;        // 低速模式顯示判定點
  private boss: Sprite | null = null;
  private enemySprites = new Map<number, Sprite>();
  private coinSprites: Sprite[] = [];

  constructor(private layer: Container, private fx: Container, private tex: WitchTextures) {
    this.player = new Sprite(tex.player);
    this.player.anchor.set(0.5);
    layer.addChild(this.player);
    this.hitDot = new Graphics()
      .circle(0, 0, GRAZE_R).stroke({ width: 1, color: 0xff5a4d, alpha: 0.35 })
      .circle(0, 0, PLAYER_HIT_R + 1).fill(0xffffff);
    this.hitDot.visible = false;
    layer.addChild(this.hitDot);
  }

  render(s: WitchState, _dtMs: number): void {
    // 自機（無敵中閃爍）
    this.player.x = s.player.x; this.player.y = s.player.y;
    this.player.alpha = s.player.invulnMs > 0 ? (Math.floor(s.player.invulnMs / 100) % 2 ? 0.3 : 0.9) : 1;
    this.hitDot.visible = s.player.focus;
    this.hitDot.x = s.player.x; this.hitDot.y = s.player.y;

    // 道中敵：以 id 同步 Map
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = new Sprite(this.tex.enemies[e.kind]);
        sp.anchor.set(0.5);
        this.layer.addChild(sp);
        this.enemySprites.set(e.id, sp);
      }
      sp.x = e.x; sp.y = e.y;
    }
    for (const [id, sp] of this.enemySprites) {
      if (!seen.has(id)) { sp.destroy(); this.enemySprites.delete(id); }
    }

    // Boss
    if (s.boss && !this.boss) {
      this.boss = new Sprite(this.tex.bosses[s.boss.id]);
      this.boss.anchor.set(0.5);
      this.layer.addChild(this.boss);
    } else if (!s.boss && this.boss) {
      this.boss.destroy(); this.boss = null;
    }
    if (s.boss && this.boss) { this.boss.x = s.boss.x; this.boss.y = s.boss.y; }

    // 金幣（簡單池）
    while (this.coinSprites.length < s.coins.length) {
      const c = new Sprite(this.tex.coin);
      c.anchor.set(0.5);
      this.layer.addChild(c);
      this.coinSprites.push(c);
    }
    for (let i = 0; i < this.coinSprites.length; i++) {
      const sp = this.coinSprites[i], c = s.coins[i];
      sp.visible = !!c?.active;
      if (c?.active) { sp.x = c.x; sp.y = c.y; }
    }
  }
}
