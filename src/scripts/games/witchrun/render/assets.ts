import { Assets, Graphics, Text, TextStyle, Texture, type Renderer } from 'pixi.js';
import type { BulletKind, EnemyKind, BossId } from '../engine/types';
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterId } from '../engine/characters';

export interface WitchTextures {
  playerFrames: Texture[];   // idle 動畫影格（至少 1 格；缺 idle 素材時退回單張）
  playerAnchorY: number;     // 自機 sprite 垂直錨點：讓 3px 判定點落在角色身體核心（FX 在下方，身體偏上）
  playerBullet: Texture;
  accent: number;            // 角色流派色（自機光暈／連鎖電弧用）
  bullets: Record<BulletKind, Texture>;
  enemies: Record<EnemyKind, Texture>;
  bosses: Record<BossId, Texture>;
  coin: Texture;
  dropPower: Texture;
  dropBomb: Texture;
}

const BASE = '/assets/games/witchrun';

/**
 * 自機 sprite 垂直錨點（0=頂 1=底）。idle 影格中角色「騎乘載具、FX 排氣在下方」，
 * 身體偏畫布上半；錨點對到身體核心，讓 3px 被彈判定點落在看得見的身體上（非下方空白 FX）。
 * 逐角不同：Gale 人小偏上需最高。值由 4399 對位驗證取得。
 */
const PLAYER_ANCHOR_Y: Record<CharacterId, number> = {
  mira: 0.44, gale: 0.29, frost: 0.43, volt: 0.40,
};

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

/** 程式產生道具 drop 紋理：圓底 + 字母，nearest 採樣。 */
function dropTex(renderer: Renderer, label: string, circleColor: number): Texture {
  const r = 10;
  const g = new Graphics().circle(0, 0, r).fill(circleColor).stroke({ width: 1.5, color: 0xffffff });
  const t = new Text({
    text: label,
    style: new TextStyle({ fontFamily: '"Press Start 2P", monospace', fontSize: 8, fill: 0xffffff }),
  });
  t.anchor.set(0.5);
  t.x = 0; t.y = 0;
  g.addChild(t);
  const tex = renderer.generateTexture(g);
  g.destroy(true);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** 嘗試載入單張紋理；缺檔/失敗回 null（供 idle 影格與自機彈做優雅降級）。 */
async function tryLoad(url: string): Promise<Texture | null> {
  try {
    return pixelate(await Assets.load<Texture>(url));
  } catch {
    return null;
  }
}

/** 載入正式像素素材。自機支援 idle 多影格（player-<id>-f0..N.png），自機彈支援專屬子彈圖。 */
export async function loadWitchTextures(
  renderer: Renderer,
  characterId: CharacterId = DEFAULT_CHARACTER,
): Promise<WitchTextures> {
  const urls: Record<string, string> = { coin: `${BASE}/coin.png` };
  for (const k of BULLET_KINDS) urls[`bullet-${k}`] = `${BASE}/bullet-${k}.png`;
  for (const k of ENEMY_KINDS) urls[`enemy-${k}`] = `${BASE}/enemy-${k}.png`;
  for (const b of BOSS_IDS) urls[`boss-${b}`] = `${BASE}/boss-${b}.png`;

  const loaded = await Assets.load<Texture>(Object.values(urls));
  const tex = (key: string): Texture => pixelate(loaded[urls[key]]);

  // 自機 idle 影格：依序載 f0,f1,… 直到缺檔；都沒有則退回單張 player-<id>.png。
  const playerFrames: Texture[] = [];
  for (let i = 0; i < 8; i++) {
    const t = await tryLoad(`${BASE}/player-${characterId}-f${i}.png`);
    if (!t) break;
    playerFrames.push(t);
  }
  if (playerFrames.length === 0) {
    const single = await tryLoad(`${BASE}/player-${characterId}.png`);
    if (single) playerFrames.push(single);
  }

  // 自機彈：專屬像素子彈圖；缺檔退回程式產生的光點（保底不讓遊戲掛掉）。
  const playerBullet =
    (await tryLoad(`${BASE}/bullet-player-${characterId}.png`)) ??
    circleTex(renderer, 3, CHARACTERS[characterId].color, 0xffffff);

  return {
    playerFrames,
    playerAnchorY: PLAYER_ANCHOR_Y[characterId],
    playerBullet,
    accent: CHARACTERS[characterId].color,
    bullets: Object.fromEntries(BULLET_KINDS.map((k) => [k, tex(`bullet-${k}`)])) as Record<BulletKind, Texture>,
    enemies: Object.fromEntries(ENEMY_KINDS.map((k) => [k, tex(`enemy-${k}`)])) as Record<EnemyKind, Texture>,
    bosses: Object.fromEntries(BOSS_IDS.map((b) => [b, tex(`boss-${b}`)])) as Record<BossId, Texture>,
    coin: tex('coin'),
    dropPower: dropTex(renderer, 'P', 0xff5a4d),
    dropBomb: dropTex(renderer, 'B', 0xffa040),
  };
}
