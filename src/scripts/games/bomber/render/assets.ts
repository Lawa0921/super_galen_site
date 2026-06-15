import { Assets, Texture, Rectangle, type TextureSource } from 'pixi.js';

const SHEET_URL      = '/assets/games/bomber/sheet.png';
const WALK_LENA_URL  = '/assets/games/bomber/walk-lena.png';
const WALK_MIRA_URL  = '/assets/games/bomber/walk-mira.png';
const WALK_AYA_URL   = '/assets/games/bomber/walk-aya.png';
const WALK_ROSA_URL  = '/assets/games/bomber/walk-rosa.png';
const AB_DETONATE_URL = '/assets/games/bomber/ui/ab-detonate.png';
const AB_INFERNO_URL = '/assets/games/bomber/ui/ab-inferno.png';
const AB_BLINK_URL   = '/assets/games/bomber/ui/ab-blink.png';
const AB_BULWARK_URL = '/assets/games/bomber/ui/ab-bulwark.png';
const BOMB_LENA_URL  = '/assets/games/bomber/bomb-lena.png';
const BOMB_MIRA_URL  = '/assets/games/bomber/bomb-mira.png';
const BOMB_AYA_URL   = '/assets/games/bomber/bomb-aya.png';
const BOMB_ROSA_URL  = '/assets/games/bomber/bomb-rosa.png';
const BLAST_SET_URL  = '/assets/games/bomber/blast-set.png';
const TILES_CATACOMB_URL = '/assets/games/bomber/tiles-catacomb.png';
const ENEMY_MIMIC_URL    = '/assets/games/bomber/enemy-mimic.png';
const ENEMY_TANK_URL     = '/assets/games/bomber/enemy-tank.png';
const TILES_FORGE_URL    = '/assets/games/bomber/tiles-forge.png';
const TILES_FROST_URL    = '/assets/games/bomber/tiles-frost.png';
const TILES_VOID_URL     = '/assets/games/bomber/tiles-void.png';
const TILES_FEN_URL      = '/assets/games/bomber/tiles-fen.png';
const TILES_VAULT_URL    = '/assets/games/bomber/tiles-vault.png';
const TILES_GARDEN_URL   = '/assets/games/bomber/tiles-garden.png';
const DECOR_URL          = '/assets/games/bomber/decor.png';
const ENEMY_SAPPER_URL   = '/assets/games/bomber/enemy-sapper.png';
const ENEMY_SPLITTER_URL = '/assets/games/bomber/enemy-splitter.png';
const ENEMY_MINI_URL     = '/assets/games/bomber/enemy-mini.png';
const ENEMY4_CHASER_URL  = '/assets/games/bomber/enemy4-chaser.png';
const ENEMY4_DASHER_URL  = '/assets/games/bomber/enemy4-dasher.png';
const ENEMY4_SAPPER_URL  = '/assets/games/bomber/enemy4-sapper.png';
const ENEMY4_TANK_URL    = '/assets/games/bomber/enemy4-tank.png';
const ENEMY_WANDER_URL = '/assets/games/bomber/enemy-wander.png';
const ENEMY_CHASER_URL = '/assets/games/bomber/enemy-chaser.png';
const ENEMY_GHOST_URL  = '/assets/games/bomber/enemy-ghost.png';
const ENEMY_DASHER_URL = '/assets/games/bomber/enemy-dasher.png';

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
  /** Ability icon textures (48×48 transparent PNGs, nearest-scale). */
  abDetonate:  Texture;
  abInferno:   Texture;
  abBlink:     Texture;
  abBulwark:   Texture;
  /** Per-character bomb sprites (64×64, true alpha). */
  bombLena:    Texture;
  bombMira:    Texture;
  bombAya:     Texture;
  bombRosa:    Texture;
  /** 方向性爆炸件：7 件（center/armH/armV/tipL/tipR/tipU/tipD）× 3 漸弱階段。 */
  blastPieces: Record<'center' | 'armH' | 'armV' | 'tipL' | 'tipR' | 'tipU' | 'tipD', Texture[]>;
  /** Per-kind 3-frame enemy idle/bounce animations (sliced from 192×64 strips). */
  enemyFrames: Record<'wander' | 'chaser' | 'ghost' | 'dasher' | 'mimic' | 'tank' | 'sapper' | 'splitter' | 'mini', Texture[]>;
  /** 地面裝飾（10 幀：每生態區 2 個，index = biome*2 + variant）。 */
  decorFrames: Texture[];
  /** 有方向性怪物的 4 方向 sheet（192×256，同玩家 walk sheet 規格）。 */
  enemySheets: Record<'chaser' | 'dasher' | 'sapper' | 'tank', Texture>;
  /** 生態區磚塊組（index 0=石牢 1=墓窖 2=鍛造廠），每組 {floor, wall, crate}。 */
  tileSets: { floor: Texture; wall: Texture; crate: Texture }[];
}

/** 預載一張 sprite sheet (320×192)，切成 15 個 64×64 frame Textures 回傳。
 *  設定 source.scaleMode = 'nearest' 以保留像素硬邊（crisp pixel art）。
 *  NEW layout (col,row):
 *    row 0: floor(0,0) wall(1,0) crate(2,0) playerLena(3,0) bomb(4,0)
 *    row 1: enemyWander(0,1) enemyChaser(1,1) blast(2,1) exit(3,1) puFire(4,1)
 *    row 2: puBomb(0,2) puSpeed(1,2) puShield(2,2) playerMira(3,2) heart(4,2)
 */
export async function loadBomberTextures(): Promise<BomberTextures> {
  const [sheet, walkLenaTex, walkMiraTex, walkAyaTex, walkRosaTex,
         abDetonateTex, abInfernoTex, abBlinkTex, abBulwarkTex,
         bombLenaTex, bombMiraTex, bombAyaTex, bombRosaTex, blastSetTex,
         enemyWanderTex, enemyChaserTex, enemyGhostTex, enemyDasherTex,
         tilesCatTex, tilesForgeTex, enemyMimicTex, enemyTankTex,
         tilesFrostTex, tilesVoidTex, decorTex, enemySapperTex, enemySplitterTex,
         enemyMiniTex, e4ChaserTex, e4DasherTex, e4SapperTex, e4TankTex,
         tilesFenTex, tilesVaultTex, tilesGardenTex] = await Promise.all([
    Assets.load(SHEET_URL)    as Promise<Texture>,
    Assets.load(WALK_LENA_URL) as Promise<Texture>,
    Assets.load(WALK_MIRA_URL) as Promise<Texture>,
    Assets.load(WALK_AYA_URL)  as Promise<Texture>,
    Assets.load(WALK_ROSA_URL) as Promise<Texture>,
    Assets.load(AB_DETONATE_URL) as Promise<Texture>,
    Assets.load(AB_INFERNO_URL) as Promise<Texture>,
    Assets.load(AB_BLINK_URL)   as Promise<Texture>,
    Assets.load(AB_BULWARK_URL) as Promise<Texture>,
    Assets.load(BOMB_LENA_URL) as Promise<Texture>,
    Assets.load(BOMB_MIRA_URL) as Promise<Texture>,
    Assets.load(BOMB_AYA_URL)  as Promise<Texture>,
    Assets.load(BOMB_ROSA_URL) as Promise<Texture>,
    Assets.load(BLAST_SET_URL) as Promise<Texture>,
    Assets.load(ENEMY_WANDER_URL) as Promise<Texture>,
    Assets.load(ENEMY_CHASER_URL) as Promise<Texture>,
    Assets.load(ENEMY_GHOST_URL)  as Promise<Texture>,
    Assets.load(ENEMY_DASHER_URL) as Promise<Texture>,
    Assets.load(TILES_CATACOMB_URL) as Promise<Texture>,
    Assets.load(TILES_FORGE_URL)    as Promise<Texture>,
    Assets.load(ENEMY_MIMIC_URL)   as Promise<Texture>,
    Assets.load(ENEMY_TANK_URL)    as Promise<Texture>,
    Assets.load(TILES_FROST_URL)   as Promise<Texture>,
    Assets.load(TILES_VOID_URL)    as Promise<Texture>,
    Assets.load(DECOR_URL)         as Promise<Texture>,
    Assets.load(ENEMY_SAPPER_URL)   as Promise<Texture>,
    Assets.load(ENEMY_SPLITTER_URL) as Promise<Texture>,
    Assets.load(ENEMY_MINI_URL)    as Promise<Texture>,
    Assets.load(ENEMY4_CHASER_URL) as Promise<Texture>,
    Assets.load(ENEMY4_DASHER_URL) as Promise<Texture>,
    Assets.load(ENEMY4_SAPPER_URL) as Promise<Texture>,
    Assets.load(ENEMY4_TANK_URL)   as Promise<Texture>,
    Assets.load(TILES_FEN_URL)     as Promise<Texture>,
    Assets.load(TILES_VAULT_URL)   as Promise<Texture>,
    Assets.load(TILES_GARDEN_URL)  as Promise<Texture>,
  ]);

  sheet.source.scaleMode       = 'nearest';
  walkLenaTex.source.scaleMode = 'nearest';
  walkMiraTex.source.scaleMode = 'nearest';
  walkAyaTex.source.scaleMode  = 'nearest';
  walkRosaTex.source.scaleMode = 'nearest';
  abDetonateTex.source.scaleMode = 'nearest';
  abInfernoTex.source.scaleMode = 'nearest';
  abBlinkTex.source.scaleMode   = 'nearest';
  abBulwarkTex.source.scaleMode = 'nearest';
  bombLenaTex.source.scaleMode  = 'nearest';
  bombMiraTex.source.scaleMode  = 'nearest';
  bombAyaTex.source.scaleMode   = 'nearest';
  bombRosaTex.source.scaleMode  = 'nearest';
  blastSetTex.source.scaleMode  = 'nearest';
  enemyWanderTex.source.scaleMode = 'nearest';
  enemyChaserTex.source.scaleMode = 'nearest';
  enemyGhostTex.source.scaleMode  = 'nearest';
  enemyDasherTex.source.scaleMode = 'nearest';
  tilesCatTex.source.scaleMode    = 'nearest';
  tilesForgeTex.source.scaleMode  = 'nearest';
  enemyMimicTex.source.scaleMode  = 'nearest';
  enemyTankTex.source.scaleMode   = 'nearest';
  tilesFrostTex.source.scaleMode  = 'nearest';
  tilesVoidTex.source.scaleMode   = 'nearest';
  decorTex.source.scaleMode       = 'nearest';
  enemySapperTex.source.scaleMode   = 'nearest';
  enemySplitterTex.source.scaleMode = 'nearest';
  enemyMiniTex.source.scaleMode  = 'nearest';
  e4ChaserTex.source.scaleMode   = 'nearest';
  e4DasherTex.source.scaleMode   = 'nearest';
  e4SapperTex.source.scaleMode   = 'nearest';
  e4TankTex.source.scaleMode     = 'nearest';
  tilesFenTex.source.scaleMode    = 'nearest';
  tilesVaultTex.source.scaleMode  = 'nearest';
  tilesGardenTex.source.scaleMode = 'nearest';

  // 方向性爆炸件：192×448（7 列件型 × 3 欄漸弱階段）
  const pieceRow = (row: number): Texture[] => [0, 1, 2].map((i) => frameAt(blastSetTex.source, i, row));
  const blastPieces = {
    center: pieceRow(0),
    armH:   pieceRow(1),
    armV:   pieceRow(2),
    tipL:   pieceRow(3),
    tipR:   pieceRow(4),
    tipU:   pieceRow(5),
    tipD:   pieceRow(6),
  };

  // 怪物動畫：每條 192×64 切 3 幀
  const strip3 = (t: Texture): Texture[] => [0, 1, 2].map((i) => frameAt(t.source, i, 0));
  const enemyFrames = {
    wander: strip3(enemyWanderTex),
    chaser: strip3(enemyChaserTex),
    ghost:  strip3(enemyGhostTex),
    dasher: strip3(enemyDasherTex),
    mimic:  strip3(enemyMimicTex),
    tank:   strip3(enemyTankTex),
    sapper:   strip3(enemySapperTex),
    splitter: strip3(enemySplitterTex),
    mini:     strip3(enemyMiniTex),
  };

  // 地面裝飾：640×64 條切 10 幀
  const decorFrames = Array.from({ length: 10 }, (_, i) => frameAt(decorTex.source, i, 0));

  // 磚塊組（各 192×64 條：floor|wall|crate）：0=石牢(主 sheet)、1=墓窖、2=鍛造廠、
  // 3=冰窖、4=虛空、5=毒霧沼澤、6=黃金寶庫、7=月光庭園（versus arena 5-7 專屬）
  const tileSetOf = (t: Texture) => ({
    floor: frameAt(t.source, 0, 0),
    wall:  frameAt(t.source, 1, 0),
    crate: frameAt(t.source, 2, 0),
  });

  const src = sheet.source;
  return {
    // row 0
    floor:       frameAt(src, 0, 0),
    wall:        frameAt(src, 1, 0),
    crate:       frameAt(src, 2, 0),
    playerLena:  frameAt(src, 3, 0),
    bomb:        frameAt(src, 4, 0),
    // row 1
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
    // ability icons
    abDetonate:  abDetonateTex,
    abInferno:   abInfernoTex,
    abBlink:     abBlinkTex,
    abBulwark:   abBulwarkTex,
    // per-character bombs + explosion frames
    bombLena:    bombLenaTex,
    bombMira:    bombMiraTex,
    bombAya:     bombAyaTex,
    bombRosa:    bombRosaTex,
    blastPieces,
    enemyFrames,
    decorFrames,
    enemySheets: {
      chaser: e4ChaserTex,
      dasher: e4DasherTex,
      sapper: e4SapperTex,
      tank:   e4TankTex,
    },
    tileSets: [
      { floor: frameAt(src, 0, 0), wall: frameAt(src, 1, 0), crate: frameAt(src, 2, 0) },
      tileSetOf(tilesCatTex),
      tileSetOf(tilesForgeTex),
      tileSetOf(tilesFrostTex),
      tileSetOf(tilesVoidTex),
      tileSetOf(tilesFenTex),     // 5=毒霧沼澤
      tileSetOf(tilesVaultTex),   // 6=黃金寶庫
      tileSetOf(tilesGardenTex),  // 7=月光庭園
    ],
  };
}
