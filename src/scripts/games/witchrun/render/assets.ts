import { Assets, Graphics, Texture, type Renderer } from 'pixi.js';
import type { BulletKind, EnemyKind, BossId } from '../engine/types';

export interface WitchTextures {
  player: Texture;
  playerBullet: Texture;
  bullets: Record<BulletKind, Texture>;
  enemies: Record<EnemyKind, Texture>;
  bosses: Record<BossId, Texture>;
  coin: Texture;
}

const BASE = '/assets/games/witchrun';

const BULLET_KINDS: BulletKind[] = ['rune', 'wave', 'page', 'gear', 'wisp', 'bell'];
const ENEMY_KINDS: EnemyKind[] = ['bat', 'wisp', 'fairy', 'tome', 'blade', 'gear', 'angel', 'moth', 'chime'];
const BOSS_IDS: BossId[] = ['gargoyle', 'grimoire', 'bellwright', 'deadbell'];

function circleTex(renderer: Renderer, r: number, fill: number, line: number): Texture {
  const g = new Graphics().circle(0, 0, r).fill(fill).stroke({ width: 2, color: line });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** 像素風：全部紋理用 nearest 採樣，縮放保持硬邊。 */
function pixelate(tex: Texture): Texture {
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** 載入正式像素素材（自機彈仍為程式產生的光點——刻意保持高辨識度）。 */
export async function loadWitchTextures(renderer: Renderer): Promise<WitchTextures> {
  const urls: Record<string, string> = { player: `${BASE}/player.png`, coin: `${BASE}/coin.png` };
  for (const k of BULLET_KINDS) urls[`bullet-${k}`] = `${BASE}/bullet-${k}.png`;
  for (const k of ENEMY_KINDS) urls[`enemy-${k}`] = `${BASE}/enemy-${k}.png`;
  for (const b of BOSS_IDS) urls[`boss-${b}`] = `${BASE}/boss-${b}.png`;

  const loaded = await Assets.load<Texture>(Object.values(urls));
  const tex = (key: string): Texture => pixelate(loaded[urls[key]]);

  return {
    player: tex('player'),
    playerBullet: circleTex(renderer, 3, 0xffb0a0, 0xffe0d0),
    bullets: Object.fromEntries(BULLET_KINDS.map((k) => [k, tex(`bullet-${k}`)])) as Record<BulletKind, Texture>,
    enemies: Object.fromEntries(ENEMY_KINDS.map((k) => [k, tex(`enemy-${k}`)])) as Record<EnemyKind, Texture>,
    bosses: Object.fromEntries(BOSS_IDS.map((b) => [b, tex(`boss-${b}`)])) as Record<BossId, Texture>,
    coin: tex('coin'),
  };
}
