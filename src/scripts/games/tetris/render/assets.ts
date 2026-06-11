import { Assets, type Texture } from 'pixi.js';
import { SKIN_CATALOG } from './skins';

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

/** skinId → block 貼圖 URL；未知 id 回退 neon（= 現狀 block.webp）。 */
function blockUrlFor(skinId: string): string {
  return SKIN_CATALOG.find((s) => s.id === skinId)?.blockUrl ?? ASSET_URLS.block;
}

/**
 * 預載入並回傳所有遊戲貼圖。
 * skinId 只影響 block 貼圖（frameWell/bg/fx 不變）；無參數＝neon＝現狀。
 * Pixi Assets.load 以 URL 為快取鍵，不同皮膚各自快取，無需手動失效。
 */
export async function loadGameTextures(skinId = 'neon'): Promise<GameTextures> {
  const [block, frameWell, bg, spark, ring, glow] = await Promise.all([
    Assets.load(blockUrlFor(skinId)) as Promise<Texture>,
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
