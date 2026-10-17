import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT, WEAPON_KINDS } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { REGIONS } from '../data/regions';
import { SKILLS } from '../data/skills';
import type { BattleEvent } from '../engine/combatant';
import type { Dir, Tile } from '../engine/map';
import type { CharacterId, FxKey, WeaponKind } from '../engine/types';

export const ART_BASE = '/assets/games/starlantern';
export const MANIFEST_URL = `${ART_BASE}/manifest.json`;
export type TileKey = Tile | 'chest-open';
export type { FxKey };
export type Mood = 'normal' | 'attack' | 'hit' | 'dying' | 'down' | 'ultimate';
/** Story-only faces that a few characters have besides the battle moods. */
export type ExtraMood = 'smile' | 'sad';
export const EXTRA_MOODS: ExtraMood[] = ['smile', 'sad'];
export const MOODS: Mood[] = ['normal', 'attack', 'hit', 'dying', 'down', 'ultimate'];

/** Characters whose art is not on disk yet; allArtUrls leaves them out. */
export const NO_ART_YET = new Set<CharacterId>();
export const ART_CHARACTER_IDS = CHARACTER_IDS.filter((id) => !NO_ART_YET.has(id));
/** Art ids that are not characters of their own but a second look of one (Rin after her oath). */
export const ART_VARIANT_IDS = ['rin-oath'];
/** Everyone who also has the smile and sad faces. */
const EXTRA_MOOD_IDS = ['hero', 'rin', 'rin-oath'];

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
  portrait: (cid: string, mood: Mood | ExtraMood) => `${ART_BASE}/char/${cid}-portrait${mood === 'normal' ? '' : `-${mood}`}.png`,
  standee: (cid: string) => `${ART_BASE}/char/${cid}-standee.png`,
  icon: (id: string) => `${ART_BASE}/icon/${id}.png`,
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
};

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
  for (const id of EXTRA_MOOD_IDS) urls.push(...EXTRA_MOODS.map((m) => art.portrait(id, m)));
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
    // plan 5a transition: the ten new bases have no icon yet
    'wooden-buckler', 'crystal-aegis', 'leather-cap', 'scale-helm', 'cloth-gloves',
    'thorn-gauntlets', 'straw-sandals', 'bat-boots', 'copper-ring', 'star-ring',
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
  for (const id of [...Object.keys(SKILLS), ...Object.keys(ITEMS), ...Object.keys(MATERIALS), ...Object.keys(EQUIPMENT)]) {
    if (!NO_ICON_YET.has(id)) urls.push(art.icon(id));
  }
  return urls;
}

export function parseManifest(json: unknown): Set<string> {
  if (!json || typeof json !== 'object') return new Set();
  const m = json as { version?: unknown; urls?: unknown };
  if (m.version !== 1 || !Array.isArray(m.urls)) return new Set();
  return new Set(m.urls.filter((u): u is string => typeof u === 'string' && u.startsWith(`${ART_BASE}/`) && !u.includes('..')));
}
