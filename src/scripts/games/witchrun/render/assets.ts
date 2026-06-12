import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { BulletKind, EnemyKind, BossId } from '../engine/types';

export interface WitchTextures {
  player: Texture;
  playerBullet: Texture;
  bullets: Record<BulletKind, Texture>;
  enemies: Record<EnemyKind, Texture>;
  bosses: Record<BossId, Texture>;
  coin: Texture;
}

function circleTex(renderer: Renderer, r: number, fill: number, line: number): Texture {
  const g = new Graphics().circle(0, 0, r).fill(fill).stroke({ width: 2, color: line });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}
function diamondTex(renderer: Renderer, r: number, fill: number): Texture {
  const g = new Graphics().poly([0, -r, r, 0, 0, r, -r, 0]).fill(fill);
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** v1 佔位紋理（純幾何）。Task 17 改為載入 public/assets/games/witchrun/ 下的正式圖。 */
export function makePlaceholderTextures(renderer: Renderer): WitchTextures {
  const bullets: Record<BulletKind, Texture> = {
    rune: circleTex(renderer, 4, 0xff5a8a, 0xffd0e0),
    wave: circleTex(renderer, 6, 0x9a6bff, 0xe0d0ff),
    page: diamondTex(renderer, 5, 0xf0e6c8),
    gear: circleTex(renderer, 7, 0xd0a040, 0xffe0a0),
    wisp: circleTex(renderer, 4, 0x60c0ff, 0xd0f0ff),
    bell: circleTex(renderer, 6, 0xffd23f, 0xfff0c0),
  };
  const enemyColor: Record<EnemyKind, number> = {
    bat: 0x6a5acd, wisp: 0x87cefa, fairy: 0xba55d3,
    tome: 0x8b4513, blade: 0xc0c0c0, gear: 0xb8860b,
    angel: 0xeee8aa, moth: 0x9370db, chime: 0xdaa520,
  };
  const enemies = Object.fromEntries(
    (Object.keys(enemyColor) as EnemyKind[]).map((k) => [k, diamondTex(renderer, 14, enemyColor[k])]),
  ) as Record<EnemyKind, Texture>;
  const bosses = {
    gargoyle: circleTex(renderer, 36, 0x708090, 0xc0d0e0),
    grimoire: circleTex(renderer, 36, 0x8b0000, 0xffc0c0),
    bellwright: circleTex(renderer, 36, 0xb8860b, 0xffe080),
    deadbell: circleTex(renderer, 40, 0x4b0082, 0xffd23f),
  } satisfies Record<BossId, Texture>;
  return {
    player: diamondTex(renderer, 12, 0xff5a4d),     // Mira 緋紅
    playerBullet: circleTex(renderer, 3, 0xffb0a0, 0xffe0d0),
    bullets, enemies, bosses,
    coin: circleTex(renderer, 6, 0xffd700, 0xfff0a0),
  };
}
