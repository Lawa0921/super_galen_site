import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { SKILLS } from '../data/skills';
import type { BattleEvent } from '../engine/combatant';
import type { Dir, Tile } from '../engine/map';

export const ART_BASE = '/assets/games/starlantern';
export const MANIFEST_URL = `${ART_BASE}/manifest.json`;
export type TileKey = Tile | 'chest-open';
export type FxKey = 'slash' | 'pierce' | 'strike' | 'fire' | 'ice' | 'thunder' | 'heal' | 'buff';
export type Mood = 'normal' | 'attack' | 'hit' | 'dying' | 'down' | 'ultimate';
export const MOODS: Mood[] = ['normal', 'attack', 'hit', 'dying', 'down', 'ultimate'];

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
  portrait: (cid: string, mood: Mood) => `${ART_BASE}/char/${cid}-portrait${mood === 'normal' ? '' : `-${mood}`}.png`,
  standee: (cid: string) => `${ART_BASE}/char/${cid}-standee.png`,
  icon: (id: string) => `${ART_BASE}/icon/${id}.png`,
  frame: `${ART_BASE}/ui/frame.png`,
  scene: (id: 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate') => `${ART_BASE}/scene/${id}.png`,
  npc: (id: 'guild' | 'shop' | 'inn' | 'gate', mood: 'normal' | 'happy') => `${ART_BASE}/npc/${id}${mood === 'happy' ? '-happy' : ''}.png`,
  logo: `${ART_BASE}/ui/logo.png`,
  window: `${ART_BASE}/ui/window.png`,
  cursor: `${ART_BASE}/ui/cursor.png`,
  fog: `${ART_BASE}/map/fog.png`,
};

export function tileKey(t: Tile, opened: boolean): TileKey {
  return t === 'chest' && opened ? 'chest-open' : t;
}

export function moodFor(hp: number, max: number): Mood {
  if (hp <= 0) return 'down';
  return hp <= max * 0.3 ? 'dying' : 'normal';
}

export function effectFor(ev: BattleEvent, actorDefId: string | null): FxKey | null {
  if (ev.type === 'damage') {
    if (ev.element !== 'phys') return ev.element;
    if (actorDefId && PIERCERS.has(actorDefId)) return 'pierce';
    return actorDefId && SLASHERS.has(actorDefId) ? 'slash' : 'strike';
  }
  if (ev.type === 'heal' || ev.type === 'revive' || ev.type === 'cure') return 'heal';
  if (ev.type === 'buff') return ev.pct > 0 ? 'buff' : null;
  return null;
}

export function allArtUrls(): string[] {
  const urls: string[] = [];
  for (const id of CHARACTER_IDS) urls.push(art.standee(id), ...MOODS.map((m) => art.portrait(id, m)));
  for (const d of DIRS) urls.push(art.party(d));
  urls.push(art.fog);
  for (const f of [1, 2, 3]) { for (const k of TILE_KEYS) urls.push(art.tile(f, k)); urls.push(art.bg(f)); }
  for (const id of Object.keys(ENEMIES)) urls.push(art.enemy(id));
  for (const k of FX_KEYS) urls.push(art.fx(k), art.fxAnim(k));
  urls.push(art.frame);
  for (const s of ['title', 'town', 'guild', 'shop', 'inn', 'gate'] as const) urls.push(art.scene(s));
  for (const n of ['guild', 'shop', 'inn', 'gate'] as const) urls.push(art.npc(n, 'normal'), art.npc(n, 'happy'));
  urls.push(art.logo, art.window, art.cursor);
  for (const id of [...Object.keys(SKILLS), ...Object.keys(ITEMS), ...Object.keys(MATERIALS), ...Object.keys(EQUIPMENT)]) urls.push(art.icon(id));
  return urls;
}

export function parseManifest(json: unknown): Set<string> {
  if (!json || typeof json !== 'object') return new Set();
  const m = json as { version?: unknown; urls?: unknown };
  if (m.version !== 1 || !Array.isArray(m.urls)) return new Set();
  return new Set(m.urls.filter((u): u is string => typeof u === 'string' && u.startsWith(`${ART_BASE}/`) && !u.includes('..')));
}
