import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT, WEAPON_KINDS } from '../data/equipment';
import { RARITIES, SETS, SPECIALS, regionSpecials } from '../data/gear';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { REGIONS, type RegionId } from '../data/regions';
import { SKILLS } from '../data/skills';
import type { BattleEvent } from '../engine/combatant';
import type { Dir, Tile } from '../engine/map';
import type { CharacterId, FxKey, ItemInstance, Rarity, WeaponKind } from '../engine/types';

export const ART_BASE = '/assets/games/starlantern';
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
  hero: ['smile', 'sad'], rin: ['smile', 'sad'], 'rin-oath': ['smile', 'sad'],
};

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

/**
 * The 15 bases whose old icon (`icon/<id>.png`, sheet-icons-3) is still published. Plan 5d redraws every base under
 * `gear/`; each old icon stays listed until its new art is published and the old one retires (plan 5d Tasks 8 and 10).
 */
export const RETIRING_ICONS: ReadonlySet<string> = new Set([
  'wooden-staff', 'iron-sword', 'hunter-bow', 'thorn-spear', 'crystal-blade', 'frost-staff', 'star-saber',
  'cloth-robe', 'leather-vest', 'scale-mail', 'dusk-mantle', 'moss-charm', 'bat-earring', 'crystal-pendant', 'gear-ring',
]);

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

export function allArtUrls(): string[] {
  const urls: string[] = [];
  for (const id of [...ART_CHARACTER_IDS, ...ART_VARIANT_IDS]) urls.push(art.standee(id), ...MOODS.map((m) => art.portrait(id, m)));
  for (const [id, faces] of Object.entries(PUBLISHED_FACES)) urls.push(...faces.map((m) => art.portrait(id, m)));
  for (const d of DIRS) urls.push(art.party(d));
  urls.push(art.fog);
  for (const f of [1, 2, 3]) { for (const k of TILE_KEYS) urls.push(art.tile(f, k)); urls.push(art.wallTop(f), art.wallFace(f), art.bg(f)); }
  for (const id of Object.keys(ENEMIES)) if (!ENEMIES[id].look) urls.push(art.enemy(id));
  for (const k of FX_KEYS) urls.push(art.fx(k), art.fxAnim(k));
  urls.push(art.frame);
  for (const s of ['title', 'town', 'guild', 'shop', 'inn', 'gate'] as const) urls.push(art.scene(s));
  for (const n of ['guild', 'shop', 'inn', 'gate'] as const) urls.push(art.npc(n, 'normal'), art.npc(n, 'happy'));
  urls.push(art.logo, art.window, art.cursor, art.portalPlaza);
  for (const k of PORTAL_CARD_KEYS) urls.push(art.portalCard(k));
  for (const k of TRAIT_ICON_KEYS) urls.push(art.traitIcon(k));
  for (const k of EVENT_TILE_KEYS) urls.push(art.eventTile(k));
  // Region material icons come with the art batch; until then they are not expected on disk.
  const NO_ICON_YET = new Set<string | null>([
    ...Object.values(REGIONS).map((r) => r.material),
    // plan 5d: gear art (`gear/<id>.png` and `-large`) for every base and special waits for its art batch, and so does
    // any piece merged into SPECIALS later (a roster unique) until its own batch publishes it. A publish takes its ids
    // out of this spread (plan 5d Tasks 8 and 10). The bases no longer list `icon/<id>.png`: see RETIRING_ICONS.
    ...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS),
    // plan 5d: the gate codex's silhouettes (`silhouette:<id>`), the rarity frames (epic with plan 5g), the legend glow,
    // the starlit overlay (plan 5g), the forge scene and Doran
    ...SILHOUETTE_IDS().map((id) => `silhouette:${id}`),
    ...FRAMED_RARITIES.map((r) => `ui:rarity-${r}`), 'ui:glow-legendary', 'ui:starlit',
    'scene:forge', 'npc:forge', 'npc:forge-happy',
    // plan 5a: rare materials have no icon yet
    'star-tear', 'king-scale',
    // plan 5c: the four essences have no icon yet
    'essence-common', 'essence-magic', 'essence-rare', 'essence-legendary',
    // plan 5b: the skill-tree skills have no icon yet
    'flame-wave', 'inferno', 'frost-bind', 'blizzard', 'judgement',
    'spiral-spear', 'thousand-spear', 'sacred-sake', 'great-barrier', 'thunder-thrust', 'heaven-spear',
    'shadow-flurry', 'smoke-bomb', 'fortune-strike', 'quickstep', 'venom-edge', 'phantom-step',
    'heart-shot', 'starfall-arrow', 'snare-shot', 'hunters-mark', 'fire-arrow', 'storm-volley',
    'guardian-roar', 'unbreakable', 'blaze-ring', 'crimson-end', 'shield-bash', 'fortress',
    'moon-rain', 'full-moon', 'blessing', 'sanctuary', 'moon-arrow', 'lunar-eclipse',
    'sand-cyclone', 'thousand-shadows', 'veil-dance', 'desert-festival', 'shadow-step', 'sirocco',
    'cannon', 'repair-kit', 'overclock', 'emergency-repair', 'shock-mine', 'tesla-coil',
    // plan 6a: Rin's skills have no icon yet
    'rin-needle', 'rin-fan', 'rin-venom-needle', 'rin-storm', 'rin-backstab', 'rin-veil', 'rin-shadowless', 'rin-mark', 'rin-execute', 'rin-deathblow',
    // plan 6a: the hero's skills have no icon yet
    ...Object.values(SKILLS).filter((s) => s.owner === 'hero').map((s) => s.id),
  ]);
  for (const id of [...Object.keys(SKILLS), ...Object.keys(ITEMS), ...Object.keys(MATERIALS)]) {
    if (!NO_ICON_YET.has(id)) urls.push(art.icon(id));
  }
  for (const id of RETIRING_ICONS) urls.push(art.icon(id));
  for (const id of [...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS)]) {
    if (!NO_ICON_YET.has(id)) urls.push(art.gear(id), art.gearLarge(id));
  }
  for (const id of SILHOUETTE_IDS()) if (!NO_ICON_YET.has(`silhouette:${id}`)) urls.push(art.gearSilhouette(id));
  for (const r of FRAMED_RARITIES) if (!NO_ICON_YET.has(`ui:rarity-${r}`)) urls.push(art.rarityFrame(r));
  if (!NO_ICON_YET.has('ui:glow-legendary')) urls.push(art.rarityGlow);
  if (!NO_ICON_YET.has('ui:starlit')) urls.push(art.starlitOverlay);
  if (!NO_ICON_YET.has('scene:forge')) urls.push(art.scene('forge'));
  if (!NO_ICON_YET.has('npc:forge')) urls.push(art.npc('forge', 'normal'));
  if (!NO_ICON_YET.has('npc:forge-happy')) urls.push(art.npc('forge', 'happy'));
  return urls;
}

export function parseManifest(json: unknown): Set<string> {
  if (!json || typeof json !== 'object') return new Set();
  const m = json as { version?: unknown; urls?: unknown };
  if (m.version !== 1 || !Array.isArray(m.urls)) return new Set();
  return new Set(m.urls.filter((u): u is string => typeof u === 'string' && u.startsWith(`${ART_BASE}/`) && !u.includes('..')));
}
