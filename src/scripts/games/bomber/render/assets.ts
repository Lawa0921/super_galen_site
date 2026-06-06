import { Assets, type Texture } from 'pixi.js';

const BASE = '/assets/games/bomber';

export const ASSET_URLS = {
  floor:       `${BASE}/floor.png`,
  wall:        `${BASE}/wall.png`,
  crate:       `${BASE}/crate.png`,
  player:      `${BASE}/player.png`,
  enemyWander: `${BASE}/enemy-wander.png`,
  enemyChaser: `${BASE}/enemy-chaser.png`,
  bomb:        `${BASE}/bomb.png`,
  puFire:      `${BASE}/pu-fire.png`,
  puBomb:      `${BASE}/pu-bomb.png`,
  puSpeed:     `${BASE}/pu-speed.png`,
  puShield:    `${BASE}/pu-shield.png`,
  exit:        `${BASE}/exit.png`,
  blast:       `${BASE}/blast.png`,
} as const;

export interface BomberTextures {
  floor:       Texture;
  wall:        Texture;
  crate:       Texture;
  player:      Texture;
  enemyWander: Texture;
  enemyChaser: Texture;
  bomb:        Texture;
  puFire:      Texture;
  puBomb:      Texture;
  puSpeed:     Texture;
  puShield:    Texture;
  exit:        Texture;
  blast:       Texture;
}

/** 預載入並回傳所有 Dungeon Bomber 貼圖。所有貼圖設定 nearest 取樣以保留像素硬邊。 */
export async function loadBomberTextures(): Promise<BomberTextures> {
  const [
    floor, wall, crate,
    player, enemyWander, enemyChaser,
    bomb,
    puFire, puBomb, puSpeed, puShield,
    exit_, blast,
  ] = await Promise.all([
    Assets.load(ASSET_URLS.floor)       as Promise<Texture>,
    Assets.load(ASSET_URLS.wall)        as Promise<Texture>,
    Assets.load(ASSET_URLS.crate)       as Promise<Texture>,
    Assets.load(ASSET_URLS.player)      as Promise<Texture>,
    Assets.load(ASSET_URLS.enemyWander) as Promise<Texture>,
    Assets.load(ASSET_URLS.enemyChaser) as Promise<Texture>,
    Assets.load(ASSET_URLS.bomb)        as Promise<Texture>,
    Assets.load(ASSET_URLS.puFire)      as Promise<Texture>,
    Assets.load(ASSET_URLS.puBomb)      as Promise<Texture>,
    Assets.load(ASSET_URLS.puSpeed)     as Promise<Texture>,
    Assets.load(ASSET_URLS.puShield)    as Promise<Texture>,
    Assets.load(ASSET_URLS.exit)        as Promise<Texture>,
    Assets.load(ASSET_URLS.blast)       as Promise<Texture>,
  ]);

  // 全部使用 nearest（crisp 像素風）
  for (const tex of [floor, wall, crate, player, enemyWander, enemyChaser, bomb,
    puFire, puBomb, puSpeed, puShield, exit_, blast]) {
    tex.source.scaleMode = 'nearest';
  }

  return {
    floor, wall, crate,
    player, enemyWander, enemyChaser,
    bomb,
    puFire, puBomb, puSpeed, puShield,
    exit: exit_,
    blast,
  };
}
