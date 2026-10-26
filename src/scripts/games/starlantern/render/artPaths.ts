import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { artEnemy, artMaterial, artSpecial } from '../data/monsters';
import { EQUIPMENT, WEAPON_KINDS } from '../data/equipment';
import { RARITIES, SETS, SPECIALS, regionSpecials } from '../data/gear';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { REGIONS, type RegionId } from '../data/regions';
import { RUNES, type RuneId } from '../data/runes';
import { SKILLS } from '../data/skills';
import type { AilmentShown } from '../engine/ailments';
import type { BattleEvent } from '../engine/combatant';
import type { Dir, Tile } from '../engine/map';
import type { CharacterId, FxKey, ItemInstance, Rarity, WeaponKind } from '../engine/types';

export const ART_BASE = '/assets/games/starlantern';
/** A rune icon (art step 9, G4): a rune, or a slot state. */
export type RuneIconId = RuneId | 'slot-empty' | 'slot-filled';
/** 14 x 14 inline with 12px text (a skill's slots, the battle menu); 16 x 16 in a rune row's 20 x 20 cell. */
export type RuneIconSize = 14 | 16;
export const RUNE_ICON_SIZES: readonly RuneIconSize[] = [14, 16];
/** Every rune icon id: each rune of the data and both slot states (registry `icon-rune-<id>-<size>`). */
export const RUNE_ICON_IDS = (): RuneIconId[] => ['slot-empty', 'slot-filled', ...(Object.keys(RUNES) as RuneId[])];
/** A skill icon at its native size (art step 9, G3/G4; registry `icon-<skill>-<size>`): 16 in a skill row, 14 in the tree. */
export type SkillIconSize = 16 | 14;
export const SKILL_ICON_SIZES: readonly SkillIconSize[] = [16, 14];
/** Every ailment shown in battle (render/ailmentStyle AILMENT_FILL): its 14px chip icon (registry `icon-ail-<id>-14`). */
export const AILMENT_ICON_IDS: readonly AilmentShown[] = ['poison', 'sleep', 'burn', 'freeze', 'chill', 'shock', 'bleed'];
/** A mechanic's 14px chip icon (registry `icon-mech-<key>-14`); a device uses its own skill's 14px icon instead. */
export type MechIconKey = 'heat' | 'coins' | 'embers' | 'beat' | 'shield' | 'aim' | 'mark' | 'ward' | 'purify' | 'thunder'
  | 'moon-first' | 'moon-full' | 'moon-waning' | 'moon-new';
export const MECH_ICON_KEYS: readonly MechIconKey[] = ['heat', 'coins', 'embers', 'beat', 'shield', 'aim', 'mark', 'ward', 'purify', 'thunder',
  'moon-first', 'moon-full', 'moon-waning', 'moon-new'];
export const MANIFEST_URL = `${ART_BASE}/manifest.json`;
export type TileKey = Tile | 'chest-open';
export type { FxKey };
/** Battle faces (unchanged). */
export type Mood = 'normal' | 'attack' | 'hit' | 'dying' | 'down' | 'ultimate';
/** Talking faces everyone has. */
export type CoreMood = 'normal' | 'smile' | 'sad' | 'surprised' | 'serious' | 'blush';
/** Talking faces only one character has (Rin's two looks share hers). */
export type SpecialMood =
  | 'resolve' | 'distant'                 // hero
  | 'averted' | 'guarded'                 // rin, rin-oath
  | 'foresee' | 'wistful'                 // selene
  | 'solemn' | 'bewildered'               // chizuru
  | 'wink' | 'laugh'                      // safira
  | 'alert' | 'unguarded'                 // sylvie
  | 'smug' | 'pout' | 'panic'             // noel
  | 'excited' | 'grin' | 'focused'        // bobby
  | 'scheming' | 'hushed'                 // liz
  | 'vow' | 'shaken';                     // scarlet
/** What a story line may ask for: a talking face, or the battle `down` for a collapse. */
export type StoryMood = CoreMood | SpecialMood | 'down';
/** Story faces beyond the battle set (kept as a name so existing imports still compile). */
export type ExtraMood = Exclude<StoryMood, Mood>;
export const MOODS: Mood[] = ['normal', 'attack', 'hit', 'dying', 'down', 'ultimate'];
export const CORE_MOODS: CoreMood[] = ['normal', 'smile', 'sad', 'surprised', 'serious', 'blush'];
export const SPECIAL_MOODS_OF: Record<string, SpecialMood[]> = {
  hero: ['resolve', 'distant'], rin: ['averted', 'guarded'], 'rin-oath': ['averted', 'guarded'],
  selene: ['foresee', 'wistful'], chizuru: ['solemn', 'bewildered'], safira: ['wink', 'laugh'],
  sylvie: ['alert', 'unguarded'], noel: ['smug', 'pout', 'panic'], bobby: ['excited', 'grin', 'focused'],
  liz: ['scheming', 'hushed'], scarlet: ['vow', 'shaken'],
};
/** Every talking face of an art id: the core six, then that id's own. */
export const MOODS_OF: Record<string, StoryMood[]> = Object.fromEntries(
  Object.entries(SPECIAL_MOODS_OF).map(([id, own]) => [id, [...CORE_MOODS, ...own]]),
);
/** Story faces on disk, by art id. An art batch adds its moods here in the same commit as its registry entries. */
export const PUBLISHED_FACES: Record<string, StoryMood[]> = {
  // Wave 2 (art-factory/starlantern/runs/2026-10-24-faces-wave2; user approval 2026-10-24): Lorne's and both Rin looks'
  // grave faces. Each Rin look has its own (cracked bell / flattened bell); `artIdOf` picks the look, as for her normal.
  hero: ['smile', 'sad', 'serious', 'distant'],
  // Wave 4 (art-factory/starlantern/runs/2026-10-24-faces-wave4; user approval 2026-10-24 「可以，照這風格」): each look's own
  // averted (guilty before her oath, shy after), and only the oath look blushes (her heart pact and romance come after it).
  rin: ['smile', 'sad', 'serious', 'guarded', 'averted'], 'rin-oath': ['smile', 'sad', 'serious', 'guarded', 'averted', 'blush'],
  // Companion faces, wave 1 (art-factory/starlantern/runs/2026-10-23-faces-wave1; user approval 2026-10-23): the grave faces
  // the script uses, plus Liz's hushed.
  scarlet: ['serious', 'sad', 'vow', 'shaken', 'blush'], chizuru: ['serious', 'sad', 'solemn', 'blush'],
  sylvie: ['serious', 'sad', 'blush', 'unguarded'],   // + wave 4's blush and unguarded
  // Wave 3 (art-factory/starlantern/runs/2026-10-24-faces-wave3; user approval 2026-10-24 「可以」): Safira's serious and
  // Noel's pout, so no heavy line of the script hides its portrait any more.
  // Wave 4 (same approval): every companion's blush, Sylvie's unguarded, Noel's smug and Bobby's excited, for the bond scenes
  // and the lines the script already tags with them (a glad one no longer borrows the smiling normal).
  selene: ['sad', 'wistful', 'blush'], safira: ['sad', 'serious', 'blush'], bobby: ['serious', 'sad', 'blush', 'excited'],
  liz: ['serious', 'sad', 'hushed', 'blush'], noel: ['sad', 'pout', 'blush', 'smug'],
};
/**
 * Art ids whose `normal` portrait smiles (story depth final review, checked by eye on the published art): every companion.
 * Lorne's and Rin's normal faces are calm, so they are not here. A grave line of theirs shows its own face or a mapped near
 * one (ui2/story.ts `GRAVE_FALLBACK`), never the smiling normal; with neither published it shows no portrait. In a heavy
 * scene (staging S3) Lorne's normal, whose calm carries a soft smile, is no stand-in either; since wave 2 his grave moods
 * have faces of their own (ui2/story.ts `CALM_NORMALS`).
 */
export const NORMAL_SMILES: ReadonlySet<string> = new Set(['selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet']);

/** Characters whose art is not on disk yet; allArtUrls leaves them out. */
export const NO_ART_YET = new Set<CharacterId>();
export const ART_CHARACTER_IDS = CHARACTER_IDS.filter((id) => !NO_ART_YET.has(id));
/** Art ids that are not characters of their own but a second look of one (Rin after her oath). */
export const ART_VARIANT_IDS = ['rin-oath'];

export const TILE_KEYS: TileKey[] = ['wall', 'floor', 'door', 'up', 'down', 'chest', 'chest-open', 'entrance', 'boss'];
export const FX_KEYS: FxKey[] = ['slash', 'pierce', 'strike', 'fire', 'ice', 'thunder', 'heal', 'buff'];
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const PIERCERS = new Set(['chizuru', 'sylvie']);
const SLASHERS = new Set<string>(CHARACTER_IDS.filter((id) => !PIERCERS.has(id)));

export const art = {
  tile: (floor: number, key: TileKey) => `${ART_BASE}/tiles/f${floor}-${key}.png`,
  /** Autotiled walls: a seamless top, and a brick face for a wall whose south side looks onto open ground. */
  wallTop: (floor: number) => `${ART_BASE}/tiles/f${floor}-wall-top.png`,
  wallFace: (floor: number) => `${ART_BASE}/tiles/f${floor}-wall-face.png`,
  party: (dir: Dir) => `${ART_BASE}/map/party-${dir}.png`,
  bg: (floor: number) => `${ART_BASE}/bg/f${floor}.png`,
  enemy: (id: string) => `${ART_BASE}/enemy/${id}.png`,
  fx: (key: FxKey) => `${ART_BASE}/fx/${key}.png`,
  /** Four equal frames left to right: wind-up, burst, spread, fade. */
  fxAnim: (key: FxKey) => `${ART_BASE}/fx/${key}-anim.png`,
  portrait: (cid: string, mood: Mood | StoryMood) => `${ART_BASE}/char/${cid}-portrait${mood === 'normal' ? '' : `-${mood}`}.png`,
  standee: (cid: string) => `${ART_BASE}/char/${cid}-standee.png`,
  icon: (id: string) => `${ART_BASE}/icon/${id}.png`,
  /** Gear art (plan 5d; registry `gear-<id>`): 26 x 26, the subject's long side 22, shown at its own size. Use gearArtId. */
  gear: (id: string) => `${ART_BASE}/gear/${id}.png`,
  /** The same piece large (registry `gear-<id>-large`): 64 x 64, for the item detail. */
  gearLarge: (id: string) => `${ART_BASE}/gear/${id}-large.png`,
  /** An unobtained region piece or set on the gate's codex (registry `gear-<id>-silhouette`): 28 x 28, made from the icon. */
  gearSilhouette: (id: string) => `${ART_BASE}/gear/${id}-silhouette.png`,
  frame: `${ART_BASE}/ui/frame.png`,
  scene: (id: 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate' | 'forge') => `${ART_BASE}/scene/${id}.png`,
  npc: (id: 'guild' | 'shop' | 'inn' | 'gate' | 'forge', mood: 'normal' | 'happy') => `${ART_BASE}/npc/${id}${mood === 'happy' ? '-happy' : ''}.png`,
  portalPlaza: `${ART_BASE}/scene/portal-plaza.png`,
  portalCard: (k: PortalCardKey) => `${ART_BASE}/portal/${k}.png`,
  traitIcon: (k: TraitIconKey) => `${ART_BASE}/icon/trait-${k}.png`,
  /** A rune or slot-state icon at its native size (art step 9, G4; registry `icon-rune-<id>-<size>`). */
  runeIcon: (id: RuneIconId, size: RuneIconSize) => `${ART_BASE}/icon/rune-${id}-${size}.png`,
  /** A skill's icon at its native size (art step 9): 16 x 16 in a skill row, 14 x 14 in the tree; never scaled. */
  skillIcon: (id: string, size: SkillIconSize) => `${ART_BASE}/icon/${id}-${size}.png`,
  /** An ailment's 14px icon in front of its word (art step 9, G4). */
  ailmentIcon: (id: AilmentShown) => `${ART_BASE}/icon/ail-${id}-14.png`,
  /** A mechanic's 14px icon in front of its word (art step 9, G4). */
  mechIcon: (k: MechIconKey) => `${ART_BASE}/icon/mech-${k}-14.png`,
  logo: `${ART_BASE}/ui/logo.png`,
  window: `${ART_BASE}/ui/window.png`,
  cursor: `${ART_BASE}/ui/cursor.png`,
  fog: `${ART_BASE}/map/fog.png`,
  /** Event marker art for the map (one cell, transparent). */
  eventTile: (k: EventTileKey) => `${ART_BASE}/tiles/event-${k}.png`,
  /**
   * Rarity frames (plan 5d Task 5; registry `ui-rarity-<r>`): nine-slice 16 x 16, slice 5, clear centre. Not in
   * allArtUrls until the art plan publishes them, so nothing requests them before then.
   */
  rarityFrame: (r: FramedRarity) => `${ART_BASE}/ui/rarity-${r}.png`,
  /** The legend tier's in-cell glow (registry `ui-glow-legendary`): 16 x 16, slice 5, under the icon. Unpublished. */
  rarityGlow: `${ART_BASE}/ui/glow-legendary.png`,
  /**
   * The starlit overlay (plan 5g; registry `ui-starlit`): 16 x 16, slice 5, stars in the corners drawn inside the cell
   * over the frame, only on starlit legendary, unique and set pieces. Unpublished.
   */
  starlitOverlay: `${ART_BASE}/ui/starlit.png`,
};

/** Every rarity but common has a frame (plan 5d Task 5); epic comes with plan 5g through RARITIES. */
export type FramedRarity = Exclude<Rarity, 'common'>;
export const FRAMED_RARITIES: FramedRarity[] = RARITIES.filter((r): r is FramedRarity => r !== 'common');

/** The art of a piece: a special (legendary, unique, set piece) has its own and never borrows its base's. */
export const gearArtId = (it: Pick<ItemInstance, 'base' | 'special'>): string => it.special ?? it.base;

/** The art of a codex entry: a set shows its first piece; anything else is its own id. */
export const codexArtId = (id: string): string => SETS[id]?.pieces[0] ?? id;

/** Region-limited pieces and sets: the gate's codex shows a silhouette of each until it is obtained. */
const SILHOUETTE_IDS = (): string[] => [
  ...(Object.keys(REGIONS) as RegionId[]).flatMap((r) => regionSpecials(r).map((s) => s.id)),
  ...Object.keys(SETS),
];

/** Event tiles with art of their own in the art factory; a chest uses its terrain's chest tile instead. */
export type EventTileKey = 'fountain' | 'merchant' | 'altar' | 'elite' | 'vault'
  // opened vault art (an opened vault turns to floor today, so nothing draws it yet, but it is published)
  | 'vault-open'
  | 'key' | 'trap';
export type PortalCardKey = 'mainline' | 'blaze' | 'frost' | 'storm' | 'mire' | 'shade' | 'iron';
export type TraitIconKey = 'fire' | 'ice' | 'thunder' | 'poison' | 'shade' | 'iron';
export const PORTAL_CARD_KEYS: PortalCardKey[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
export const TRAIT_ICON_KEYS: TraitIconKey[] = ['fire', 'ice', 'thunder', 'poison', 'shade', 'iron'];
export const EVENT_TILE_KEYS: EventTileKey[] = ['fountain', 'merchant', 'altar', 'elite', 'vault', 'vault-open', 'key', 'trap'];

export function tileKey(t: Tile, opened: boolean): TileKey {
  return t === 'chest' && opened ? 'chest-open' : t;
}

export function moodFor(hp: number, max: number): Mood {
  if (hp <= 0) return 'down';
  return hp <= max * 0.3 ? 'dying' : 'normal';
}

/** `weaponKind` is the hero's weapon: it picks the hit effect of his physical damage; everyone else passes none. */
export function effectFor(ev: BattleEvent, actorDefId: string | null, weaponKind?: WeaponKind): FxKey | null {
  if (ev.type === 'damage') {
    if (ev.element !== 'phys') return ev.element;
    if (weaponKind) return WEAPON_KINDS[weaponKind].fx;
    if (actorDefId && PIERCERS.has(actorDefId)) return 'pierce';
    return actorDefId && SLASHERS.has(actorDefId) ? 'slash' : 'strike';
  }
  if (ev.type === 'heal' || ev.type === 'revive' || ev.type === 'cure') return 'heal';
  if (ev.type === 'buff') return ev.pct > 0 ? 'buff' : null;
  return null;
}

/** The picture of an enemy: the standee of the character it looks like, else art of its own. */
export function enemyArt(id: string): string {
  const look = ENEMIES[id]?.look;
  return look ? art.standee(look) : art.enemy(id);
}

/** The map art of a floor's terrain: its tiles, walls, event tiles, the party marker and the fog. */
export function mapArtUrls(floor: number): string[] {
  return [...TILE_KEYS.map((k) => art.tile(floor, k)), art.wallTop(floor), art.wallFace(floor), ...EVENT_TILE_KEYS.map((k) => art.eventTile(k)),
    ...(['up', 'down', 'left', 'right'] as const).map((d) => art.party(d)), art.fog];
}

export function allArtUrls(): string[] {
  const urls: string[] = [];
  for (const id of [...ART_CHARACTER_IDS, ...ART_VARIANT_IDS]) urls.push(art.standee(id), ...MOODS.map((m) => art.portrait(id, m)));
  for (const [id, faces] of Object.entries(PUBLISHED_FACES)) urls.push(...faces.map((m) => art.portrait(id, m)));
  for (const d of DIRS) urls.push(art.party(d));
  urls.push(art.fog);
  for (const f of [1, 2, 3]) { for (const k of TILE_KEYS) urls.push(art.tile(f, k)); urls.push(art.wallTop(f), art.wallFace(f), art.bg(f)); }
  // Roster plan ruling 3: a roster enemy's art is listed once its art batch is published (ROSTER_ART).
  for (const id of Object.keys(ENEMIES)) if (artEnemy(id) && !ENEMIES[id].look) urls.push(art.enemy(id));
  for (const k of FX_KEYS) urls.push(art.fx(k), art.fxAnim(k));
  urls.push(art.frame);
  for (const s of ['title', 'town', 'guild', 'shop', 'inn', 'gate'] as const) urls.push(art.scene(s));
  for (const n of ['guild', 'shop', 'inn', 'gate'] as const) urls.push(art.npc(n, 'normal'), art.npc(n, 'happy'));
  urls.push(art.logo, art.window, art.cursor, art.portalPlaza);
  for (const k of PORTAL_CARD_KEYS) urls.push(art.portalCard(k));
  for (const k of TRAIT_ICON_KEYS) urls.push(art.traitIcon(k));
  for (const k of EVENT_TILE_KEYS) urls.push(art.eventTile(k));
  for (const id of [...Object.keys(ITEMS), ...Object.keys(MATERIALS).filter(artMaterial)]) urls.push(art.icon(id));
  // Art step 9 (G3 and G4): every skill at its two native sizes (the plan 4 icon/<skill>.png they re-derive are retired),
  // and the 14px chip icons of every ailment and mechanic.
  for (const id of Object.keys(SKILLS)) for (const size of SKILL_ICON_SIZES) urls.push(art.skillIcon(id, size));
  for (const id of AILMENT_ICON_IDS) urls.push(art.ailmentIcon(id));
  for (const k of MECH_ICON_KEYS) urls.push(art.mechIcon(k));
  // Plan 5d: the gear art of every base and special (small and large; a base no longer lists an icon/ path), the codex
  // silhouettes, the rarity layers, the forge and Doran. A piece merged into SPECIALS later (a roster unique) comes with
  // its own art batch, which must list it here.
  for (const id of [...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS).filter(artSpecial)]) urls.push(art.gear(id), art.gearLarge(id));
  for (const id of SILHOUETTE_IDS()) urls.push(art.gearSilhouette(id));
  for (const r of FRAMED_RARITIES) urls.push(art.rarityFrame(r));
  urls.push(art.rarityGlow, art.starlitOverlay, art.scene('forge'), art.npc('forge', 'normal'), art.npc('forge', 'happy'));
  // Art step 9 (G4): every rune and both slot states, 14 and 16.
  for (const id of RUNE_ICON_IDS()) for (const size of RUNE_ICON_SIZES) urls.push(art.runeIcon(id, size));
  return urls;
}

export function parseManifest(json: unknown): Set<string> {
  if (!json || typeof json !== 'object') return new Set();
  const m = json as { version?: unknown; urls?: unknown };
  if (m.version !== 1 || !Array.isArray(m.urls)) return new Set();
  return new Set(m.urls.filter((u): u is string => typeof u === 'string' && u.startsWith(`${ART_BASE}/`) && !u.includes('..')));
}
