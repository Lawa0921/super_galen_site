import { Assets, Texture, Rectangle, type TextureSource } from 'pixi.js';

const SHEET_URL = '/assets/games/bomber/sheet.png';

/** 每格 64×64 px。Sheet 佈局 5 col × 3 row，0-indexed (col, row)。*/
const F = 64;

function frameAt(source: TextureSource, col: number, row: number): Texture {
  return new Texture({ source, frame: new Rectangle(col * F, row * F, F, F) });
}

export interface BomberTextures {
  floor:       Texture;
  wall:        Texture;
  crate:       Texture;
  player:      Texture;
  bomb:        Texture;
  enemyWander: Texture;
  enemyChaser: Texture;
  blast:       Texture;
  exit:        Texture;
  puFire:      Texture;
  puBomb:      Texture;
  puSpeed:     Texture;
  puShield:    Texture;
}

/** 預載一張 sprite sheet (320×192)，切成 13 個 64×64 frame Textures 回傳。
 *  設定 source.scaleMode = 'nearest' 以保留像素硬邊（crisp pixel art）。
 */
export async function loadBomberTextures(): Promise<BomberTextures> {
  const sheet = await Assets.load(SHEET_URL) as Texture;
  sheet.source.scaleMode = 'nearest'; // 套用到所有共享 source 的 frames

  const src = sheet.source;
  return {
    // row 0
    floor:       frameAt(src, 0, 0),
    wall:        frameAt(src, 1, 0),
    crate:       frameAt(src, 2, 0),
    player:      frameAt(src, 3, 0),
    bomb:        frameAt(src, 4, 0),
    // row 1
    enemyWander: frameAt(src, 0, 1),
    enemyChaser: frameAt(src, 1, 1),
    blast:       frameAt(src, 2, 1),
    exit:        frameAt(src, 3, 1),
    puFire:      frameAt(src, 4, 1),
    // row 2
    puBomb:      frameAt(src, 0, 2),
    puSpeed:     frameAt(src, 1, 2),
    puShield:    frameAt(src, 2, 2),
  };
}
