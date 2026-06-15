import { Container, Sprite } from 'pixi.js';
import type { EnemyBullet, PlayerBullet } from '../engine/types';
import { BULLET_R } from '../engine/constants';
import type { WitchTextures } from './assets';

// 敵彈視覺對齊判定：渲染直徑 ≈ 2×BULLET_R×MARGIN（看到的≈會中的，WYSIWYG）。
// MARGIN 略大於 1 讓子彈視覺比判定圈大一點點（偏寬鬆方向，避免「沒碰到卻死」的不公平感）。
const BULLET_VISUAL_MARGIN = 1.3;

/** 與引擎池等長的 sprite 池：index 對 index，active 控制 visible，零配置零 GC。 */
export class BulletView {
  private enemySprites: Sprite[] = [];
  private playerSprites: Sprite[] = [];

  constructor(private layer: Container, private tex: WitchTextures) {}

  render(enemyBullets: EnemyBullet[], playerBullets: PlayerBullet[]): void {
    this.sync(this.playerSprites, playerBullets.length, () => new Sprite(this.tex.playerBullet));
    // 新 sprite 先掛任意紋理（rune）即可：啟用時下方迴圈會依 kind 換貼圖
    this.sync(this.enemySprites, enemyBullets.length, () => new Sprite(this.tex.bullets.rune));
    for (let i = 0; i < playerBullets.length; i++) {
      const b = playerBullets[i], s = this.playerSprites[i];
      s.visible = b.active;
      if (b.active) { s.x = b.x; s.y = b.y; }
    }
    for (let i = 0; i < enemyBullets.length; i++) {
      const b = enemyBullets[i], s = this.enemySprites[i];
      s.visible = b.active;
      if (b.active) {
        s.texture = this.tex.bullets[b.kind];
        // 視覺大小對齊判定半徑：渲染直徑 ≈ 2×BULLET_R×MARGIN
        s.scale.set((2 * BULLET_R[b.kind] * BULLET_VISUAL_MARGIN) / s.texture.width);
        s.x = b.x; s.y = b.y;
      }
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
