import { Assets, type Texture } from 'pixi.js';

const BASE = '/assets/games/tetris';

export const ASSET_URLS = {
  block: `${BASE}/block.webp`,
  frameWell: `${BASE}/frame-well.webp`,
  bg: `${BASE}/bg-dungeon.webp`,
} as const;

export interface GameTextures {
  block: Texture;
  frameWell: Texture;
  bg: Texture;
}

/** 預載入並回傳所有遊戲貼圖。 */
export async function loadGameTextures(): Promise<GameTextures> {
  const [block, frameWell, bg] = await Promise.all([
    Assets.load(ASSET_URLS.block) as Promise<Texture>,
    Assets.load(ASSET_URLS.frameWell) as Promise<Texture>,
    Assets.load(ASSET_URLS.bg) as Promise<Texture>,
  ]);
  return { block, frameWell, bg };
}
