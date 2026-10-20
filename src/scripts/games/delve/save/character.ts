// character.ts — 可攜的角色檔（co-op M-A）：角色隨身資料自世界存檔拆出，獨立編解碼與驗證。
// 嚴格欄位壞了 = SaveFormatError('character: <欄位>')；寬鬆欄位各自正規化。gzip 由 storage 負責。
import { SaveFormatError, isNum, validFishLog, validInventory, validLevels } from './serialize';
import { normalizeAppearance, type Appearance } from '../engine/appearance';
import { Vanity, type VanityJSON } from '../engine/vanity';
import { DelveGame } from '../engine/game';
import { snapshotGame } from './serialize';
import { splitSnapshot } from './worldSave';
import { Equipment, type EquipmentGearJSON, type EquipmentJSON } from '../engine/equipment';
import type { LevelsJSON } from '../engine/levels';
import { Codex, type CodexJSON } from '../engine/codex';
import { BUFFS, type BuffKind } from '../engine/folkDefs';
import type { InventoryJSON } from '../engine/inventory';
import type { ItemId } from '../engine/items';

export const CHARACTER_FORMAT = 1;
export const DEFAULT_NICK = '旅人';
export const MAX_NICK = 16;

export interface DelveCharacter {
  cformat: 1; id: string; nick: string; createdAt: number; savedAt: number; rev: number;
  appearance: Appearance; vanity: VanityJSON; inventory: InventoryJSON;
  equipment: EquipmentJSON; equipGear: EquipmentGearJSON;
  combat: { hp: number; baseMaxHp: number; mana: number };
  levels: LevelsJSON; codex: CodexJSON; fishLog: Partial<Record<ItemId, number>>;
  undyingCd: number; buffsLeft: Partial<Record<BuffKind, number>>;
}
export interface CharIdentity { id: string; nick: string; createdAt: number; rev: number }

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** UUID v4：優先 crypto.randomUUID，否則用 getRandomValues 自組。 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newIdentity(now: number): CharIdentity {
  return { id: newId(), nick: DEFAULT_NICK, createdAt: now, rev: 0 };
}

/** 暱稱正規化：去頭尾空白；空白或超過 MAX_NICK 字 → 旅人 */
function cleanNick(raw: unknown): string {
  const nick = typeof raw === 'string' ? raw.trim() : '';
  return nick && [...nick].length <= MAX_NICK ? nick : DEFAULT_NICK;
}

const bad = (field: string): SaveFormatError => new SaveFormatError(`character: ${field}`);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validateCharacter(raw: unknown): DelveCharacter {
  if (!isObj(raw)) throw bad('root');
  if (raw.cformat !== CHARACTER_FORMAT) throw bad('cformat');
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) throw bad('id');
  if (typeof raw.rev !== 'number' || !Number.isInteger(raw.rev) || raw.rev < 0) throw bad('rev');
  let inventory: InventoryJSON;
  try { inventory = validInventory(raw.inventory); } catch { throw bad('inventory'); }
  if (!isObj(raw.equipment)) throw bad('equipment');
  if (!isObj(raw.equipGear)) throw bad('equipGear');
  const cb = raw.combat;
  if (!isObj(cb) || !isNum(cb.hp) || !isNum(cb.baseMaxHp) || !isNum(cb.mana)) throw bad('combat');

  const eq = Equipment.fromJSON(raw.equipment, raw.equipGear);
  const codex = new Codex();
  if (isObj(raw.codex)) codex.load(raw.codex);
  const buffsLeft: Partial<Record<BuffKind, number>> = {};
  if (isObj(raw.buffsLeft)) {
    for (const k of Object.keys(BUFFS) as BuffKind[]) {
      const n = raw.buffsLeft[k];
      if (isNum(n) && n > 0) buffsLeft[k] = n;
    }
  }
  return {
    cformat: 1, id: raw.id,
    nick: cleanNick(raw.nick),
    createdAt: isNum(raw.createdAt) ? raw.createdAt : 0,
    savedAt: isNum(raw.savedAt) ? raw.savedAt : 0,
    rev: raw.rev,
    appearance: normalizeAppearance(raw.appearance),
    vanity: Vanity.fromJSON(raw.vanity).toJSON(),
    inventory,
    equipment: eq.toJSON(), equipGear: eq.gearJSON(),
    combat: { hp: cb.hp, baseMaxHp: cb.baseMaxHp, mana: cb.mana },
    levels: validLevels(raw.levels),
    codex: codex.toJSON(),
    fishLog: validFishLog(raw.fishLog),
    undyingCd: isNum(raw.undyingCd) && raw.undyingCd >= 0 ? raw.undyingCd : 0,
    buffsLeft,
  };
}

/** 新角色：隨身狀態 = 全新 DelveGame 的玩家初始狀態（取最小世界的快照），換上自己的身分與外觀。暱稱超過 MAX_NICK 字先截斷。 */
export function createCharacter(nick: string, appearance: Appearance, now: number): DelveCharacter {
  const g = new DelveGame({ seed: 'new-character', width: 160, height: 100 });
  const who: CharIdentity = { ...newIdentity(now), nick: cleanNick([...nick.trim()].slice(0, MAX_NICK).join('')) };
  const c = splitSnapshot(snapshotGame(g, now), who, { worldId: 'x', worldName: 'x', visits: {} }, now).character;
  return { ...c, appearance: normalizeAppearance(appearance), rev: 0 };
}

export function encodeCharacter(c: DelveCharacter): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(c));
}

export function decodeCharacter(bytes: Uint8Array): DelveCharacter {
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw bad('json'); }
  return validateCharacter(raw);
}
