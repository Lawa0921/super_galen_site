import { Container, Sprite } from 'pixi.js';
import type { EnemyBullet, PlayerBullet } from '../engine/types';
import type { WitchTextures } from './assets';

/** 與引擎池等長的 sprite 池：index 對 index，active 控制 visible，零配置零 GC。 */
export class BulletView {
  private enemySprites: Sprite[] = [];
  private playerSprites: Sprite[] = [];

  constructor(private layer: Container, private tex: WitchTextures) {}

  render(enemyBullets: EnemyBullet[], playerBullets: PlayerBullet[]): void {
    this.sync(this.playerSprites, playerBullets.length, () => new Sprite(this.tex.playerBullet));
    this.sync(this.enemySprites, enemyBullets.length, () => new Sprite(this.tex.bullets.rune));
    for (let i = 0; i < playerBullets.length; i++) {
      const b = playerBullets[i], s = this.playerSprites[i];
      s.visible = b.active;
      if (b.active) { s.x = b.x; s.y = b.y; }
    }
    for (let i = 0; i < enemyBullets.length; i++) {
      const b = enemyBullets[i], s = this.enemySprites[i];
      s.visible = b.active;
      if (b.active) { s.texture = this.tex.bullets[b.kind]; s.x = b.x; s.y = b.y; }
    }
  }

  private sync(pool: Sprite[], n: number, make: () => Sprite): void {
    while (pool.length < n) {
      const s = make();
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      pool.push(s);
    }
  }
}
