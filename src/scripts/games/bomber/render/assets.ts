import { Assets, Texture, Rectangle, type TextureSource } from 'pixi.js';

const SHEET_URL    = '/assets/games/bomber/sheet.png';
const WALK_LENA_URL = '/assets/games/bomber/walk-lena.png';
const WALK_MIRA_URL = '/assets/games/bomber/walk-mira.png';
const WALK_AYA_URL  = '/assets/games/bomber/walk-aya.png';
const WALK_ROSA_URL = '/assets/games/bomber/walk-rosa.png';

/** 每格 64×64 px。Sheet 佈局 5 col × 3 row，0-indexed (col, row)。*/
const F = 64;

function frameAt(source: TextureSource, col: number, row: number): Texture {
  return new Texture({ source, frame: new Rectangle(col * F, row * F, F, F) });
}

export interface BomberTextures {
  floor:       Texture;
  wall:        Texture;
  crate:       Texture;
  playerLena:  Texture;
  playerMira:  Texture;
  bomb:        Texture;
  enemyWander: Texture;
  enemyChaser: Texture;
  blast:       Texture;
  exit:        Texture;
  puFire:      Texture;
  puBomb:      Texture;
  puSpeed:     Texture;
  puShield:    Texture;
  heart:       Texture;
  /** Full 192×256 walk sheet for Lena (3 cols × 4 rows of 64×64 frames). */
  walkLena:    Texture;
  /** Full 192×256 walk sheet for Mira (3 cols × 4 rows of 64×64 frames). */
  walkMira:    Texture;
  /** Full 192×256 walk sheet for Aya (3 cols × 4 rows of 64×64 frames). */
  walkAya:     Texture;
  /** Full 192×256 walk sheet for Rosa (3 cols × 4 rows of 64×64 frames). */
  walkRosa:    Texture;
}

/** 預載一張 sprite sheet (320×192)，切成 15 個 64×64 frame Textures 回傳。
 *  設定 source.scaleMode = 'nearest' 以保留像素硬邊（crisp pixel art）。
 *  NEW layout (col,row):
 *    row 0: floor(0,0) wall(1,0) crate(2,0) playerLena(3,0) bomb(4,0)
 *    row 1: enemyWander(0,1) enemyChaser(1,1) blast(2,1) exit(3,1) puFire(4,1)
 *    row 2: puBomb(0,2) puSpeed(1,2) puShield(2,2) playerMira(3,2) heart(4,2)
 */
export async function loadBomberTextures(): Promise<BomberTextures> {
  const [sheet, walkLenaTex, walkMiraTex, walkAyaTex, walkRosaTex] = await Promise.all([
    Assets.load(SHEET_URL)    as Promise<Texture>,
    Assets.load(WALK_LENA_URL) as Promise<Texture>,
    Assets.load(WALK_MIRA_URL) as Promise<Texture>,
    Assets.load(WALK_AYA_URL)  as Promise<Texture>,
    Assets.load(WALK_ROSA_URL) as Promise<Texture>,
  ]);

  sheet.source.scaleMode     = 'nearest';
  walkLenaTex.source.scaleMode = 'nearest';
  walkMiraTex.source.scaleMode = 'nearest';
  walkAyaTex.source.scaleMode  = 'nearest';
  walkRosaTex.source.scaleMode = 'nearest';

  const src = sheet.source;
  return {
    // row 0
    floor:       frameAt(src, 0, 0),
    wall:        frameAt(src, 1, 0),
    crate:       frameAt(src, 2, 0),
    playerLena:  frameAt(src, 3, 0),
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
    playerMira:  frameAt(src, 3, 2),
    heart:       frameAt(src, 4, 2),
    // walk sheets (separate textures, pixel-crisp)
    walkLena:    walkLenaTex,
    walkMira:    walkMiraTex,
    walkAya:     walkAyaTex,
    walkRosa:    walkRosaTex,
  };
}
