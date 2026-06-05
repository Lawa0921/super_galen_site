import { Assets, type Texture } from 'pixi.js';

const BASE = '/assets/games/tetris';

export const ASSET_URLS = {
  block: `${BASE}/block.webp`,
  frameWell: `${BASE}/frame-well.webp`,
  bg: `${BASE}/bg-dungeon.webp`,
  spark: `${BASE}/fx-spark.webp`,
  ring: `${BASE}/fx-ring.webp`,
  glow: `${BASE}/fx-glow.webp`,
} as const;

export interface GameTextures {
  block: Texture;
  frameWell: Texture;
  bg: Texture;
  spark: Texture;
  ring: Texture;
  glow: Texture;
}

/** 預載入並回傳所有遊戲貼圖。 */
export async function loadGameTextures(): Promise<GameTextures> {
  const [block, frameWell, bg, spark, ring, glow] = await Promise.all([
    Assets.load(ASSET_URLS.block) as Promise<Texture>,
    Assets.load(ASSET_URLS.frameWell) as Promise<Texture>,
    Assets.load(ASSET_URLS.bg) as Promise<Texture>,
    Assets.load(ASSET_URLS.spark) as Promise<Texture>,
    Assets.load(ASSET_URLS.ring) as Promise<Texture>,
    Assets.load(ASSET_URLS.glow) as Promise<Texture>,
  ]);
  // 方塊與火花走最近鄰取樣以保留像素硬邊；背景/光暈維持平滑。
  block.source.scaleMode = 'nearest';
  spark.source.scaleMode = 'nearest';
  return { block, frameWell, bg, spark, ring, glow };
}
