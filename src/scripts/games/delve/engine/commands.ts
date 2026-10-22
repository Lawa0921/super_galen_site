// commands.ts — 玩家離散動作的指令匯流排（co-op M-B2，計畫 B1 / B2 / B9）：
// 指令型別 Cmd、每個 op 的回傳型別 CmdResults、網路輸入驗證 validCmd。
// 分派在 DelveGame.exec / act（game.ts）；本檔只 import type game.ts，避免循環。
import type { DelveGame, ForgeResult, GearAt } from './game';
import type { CraftResult } from './crafting';
import type { Cost } from './gear';
import type { FolkService } from './folkDefs';
import type { LearnFail, SkillId, ActiveSkill } from './skills';
import type { Appearance } from './appearance';
import type { EquipSlot } from './equipment';
import type { HideSlot, VanitySlot } from './vanity';
import { isItemId, type ItemId } from './items';
import { NPC_KINDS, type NpcKind } from './npcs';
import { INV_SIZE, HOTBAR_SIZE } from './constants';
import { CHEST_SLOTS } from './loot';
import { X_LIMIT } from './coords';
import { EQUIP_SLOTS } from './equipment';
import { VANITY_SLOTS } from './vanity';
import { SKILLS } from './skills';
import { normalizeAppearance } from './appearance';

export type Cmd =
  | { op: 'craft'; recipe: string } | { op: 'swap'; a: number; b: number }
  | { op: 'place'; x: number; y: number; slot: number } | { op: 'toss'; slot: number; n?: number }
  | { op: 'chestTake'; slot: number } | { op: 'chestTakeAll' } | { op: 'chestDeposit'; slot: number } | { op: 'chestClose' }
  | { op: 'equip'; slot: number; to?: EquipSlot } | { op: 'unequip'; slot: EquipSlot }
  | { op: 'equipVanity'; slot: number; to?: VanitySlot } | { op: 'unequipVanity'; slot: VanitySlot }
  | { op: 'hideArmor'; slot: HideSlot; hide: boolean } | { op: 'recolor'; slot: VanitySlot; tint: [number, number] }
  | { op: 'bodyLook'; look: Appearance } | { op: 'mirrorClose' } | { op: 'rebirth'; race: number }
  | { op: 'lock'; at: GearAt } | { op: 'salvage'; at: GearAt } | { op: 'salvageAll'; maxRarity: number }
  | { op: 'reroll'; at: GearAt; affix: number } | { op: 'upgrade'; at: GearAt } | { op: 'ascend'; at: GearAt }
  | { op: 'deepforge'; at: GearAt; key: string }
  | { op: 'buy'; npc: NpcKind; i: number } | { op: 'sell'; npc: NpcKind; item: ItemId; n: number }
  | { op: 'service'; npc: NpcKind } | { op: 'residentService'; npc: NpcKind; svc: FolkService }
  | { op: 'folkBuy'; key: string; i: number } | { op: 'folkSell'; key: string; item: ItemId; n: number }
  | { op: 'folkService'; key: string; svc: FolkService }
  | { op: 'acceptQuest'; key: string; id: string } | { op: 'turnInQuest'; id: string } | { op: 'refreshQuests' }
  | { op: 'learnSkill'; id: SkillId } | { op: 'respec' } | { op: 'skill'; skill: ActiveSkill }
  | { op: 'talk' } | { op: 'talkAt'; px: number; py: number }
  | { op: 'travel'; to: number } | { op: 'travelStone'; to: number } | { op: 'spawnCore'; id: number }
  | { op: 'marker'; x: number; y: number };
export type CmdOp = Cmd['op'];

/** 每個 op 的回傳 = 對應既有方法的回傳型別 */
export interface CmdResults {
  craft: CraftResult; swap: boolean; place: boolean; toss: boolean;
  chestTake: boolean; chestTakeAll: number; chestDeposit: boolean; chestClose: void;
  equip: boolean; unequip: boolean; equipVanity: boolean; unequipVanity: boolean;
  hideArmor: void; recolor: boolean; bodyLook: void; mirrorClose: void; rebirth: boolean;
  lock: boolean | null; salvage: Cost | null; salvageAll: { count: number; shard: number; dust: number };
  reroll: ForgeResult; upgrade: ForgeResult; ascend: ForgeResult; deepforge: ForgeResult;
  buy: boolean; sell: boolean; service: boolean; residentService: { ok: boolean; msg: string };
  folkBuy: boolean; folkSell: boolean; folkService: { ok: boolean; msg: string };
  acceptQuest: boolean; turnInQuest: boolean; refreshQuests: void;
  learnSkill: LearnFail | null; respec: ReturnType<DelveGame['respecSkills']>; skill: boolean;
  talk: boolean; talkAt: boolean;
  travel: boolean; travelStone: boolean; spawnCore: boolean;
  marker: 'added' | 'removed' | 'full';
}

/** 鄉民服務（folkDefs 沒有匯出清單） */
export const FOLK_SERVICES = ['heal', 'bless', 'ward', 'minesong', 'forge', 'deepforge', 'hint', 'scout', 'invite', 'rescue'] as const satisfies readonly FolkService[];

// ── 欄位解析：回傳要放進新物件的值，不合法 → BAD ─────────────
const BAD: unique symbol = Symbol('bad');
type Parse = (v: unknown) => unknown;
const intIn = (lo: number, hi: number): Parse => (v) => (Number.isSafeInteger(v) && (v as number) >= lo && (v as number) < hi ? v : BAD);
const oneOf = (list: readonly unknown[]): Parse => (v) => (list.includes(v) ? v : BAD);
const inv = intIn(0, INV_SIZE);
const hot = intIn(0, HOTBAR_SIZE);
const chest = intIn(0, CHEST_SLOTS);
const int: Parse = (v) => (Number.isSafeInteger(v) ? v : BAD);
const xc = intIn(-X_LIMIT, X_LIMIT + 1);
const yc = intIn(0, 4096);
const count = intIn(1, 10000);
const fin: Parse = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : BAD);
const str: Parse = (v) => (typeof v === 'string' && v.length >= 1 && v.length <= 64 ? v : BAD);
const bool: Parse = (v) => (typeof v === 'boolean' ? v : BAD);
const item: Parse = (v) => (isItemId(v) ? v : BAD);
const npc = oneOf(NPC_KINDS);
const equipSlot = oneOf(EQUIP_SLOTS);
const vanitySlot = oneOf(VANITY_SLOTS);
const hideSlot = oneOf(['head', 'body', 'legs'] satisfies HideSlot[]);
const active = oneOf(['dash', 'slam', 'pulse'] satisfies ActiveSkill[]);
const skillId = oneOf(SKILLS.map((s) => s.id));
const folkSvc = oneOf(FOLK_SERVICES);
const gearAt: Parse = (v) => (inv(v) !== BAD ? v : equipSlot(v));
const byte = intIn(0, 256);
const tint: Parse = (v) => (Array.isArray(v) && v.length === 2 && byte(v[0]) !== BAD && byte(v[1]) !== BAD ? [v[0], v[1]] : BAD);
const look: Parse = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? normalizeAppearance(v) : BAD);
/** 選填欄位：沒給 → 不放這個鍵；給了就要合法 */
const opt = (p: Parse): Parse & { optional: true } => Object.assign((v: unknown) => p(v), { optional: true as const });

type Spec = Record<string, Parse & { optional?: true }>;
/** 每個 op 的欄位（順序同 Cmd） */
const SPECS: { [K in CmdOp]: { [F in Exclude<keyof Extract<Cmd, { op: K }>, 'op'>]-?: Parse } } = {
  craft: { recipe: str }, swap: { a: inv, b: inv },
  // place 的格子要能被選中（快捷欄），否則 selectOf 不換格、會放到原本手上的東西
  place: { x: xc, y: yc, slot: hot }, toss: { slot: inv, n: opt(count) },
  chestTake: { slot: chest }, chestTakeAll: {}, chestDeposit: { slot: inv }, chestClose: {},
  equip: { slot: inv, to: opt(equipSlot) }, unequip: { slot: equipSlot },
  equipVanity: { slot: inv, to: opt(vanitySlot) }, unequipVanity: { slot: vanitySlot },
  hideArmor: { slot: hideSlot, hide: bool }, recolor: { slot: vanitySlot, tint },
  bodyLook: { look }, mirrorClose: {}, rebirth: { race: int },
  lock: { at: gearAt }, salvage: { at: gearAt }, salvageAll: { maxRarity: int },
  reroll: { at: gearAt, affix: int }, upgrade: { at: gearAt }, ascend: { at: gearAt },
  deepforge: { at: gearAt, key: str },
  buy: { npc, i: int }, sell: { npc, item, n: count },
  service: { npc }, residentService: { npc, svc: folkSvc },
  folkBuy: { key: str, i: int }, folkSell: { key: str, item, n: count },
  folkService: { key: str, svc: folkSvc },
  acceptQuest: { key: str, id: str }, turnInQuest: { id: str }, refreshQuests: {},
  learnSkill: { id: skillId }, respec: {}, skill: { skill: active },
  talk: {}, talkAt: { px: fin, py: fin },
  travel: { to: int }, travelStone: { to: int }, spawnCore: { id: int },
  marker: { x: xc, y: yc },
};

/** 全部 op，順序同 Cmd */
export const CMD_OPS: readonly CmdOp[] = Object.keys(SPECS) as CmdOp[];

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * 網路收到的 JSON → 合法指令（B9）；不合法 → null，不拋例外。
 * 建立新物件、只拷貝該 op 已知的自有欄位（__proto__、多餘欄位都丟掉）。語意（配方在不在、錢夠不夠）交給既有方法。
 */
export function validCmd(v: unknown): Cmd | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const op = own(o, 'op') ? o.op : undefined;
  if (typeof op !== 'string' || !own(SPECS, op)) return null;
  const spec: Spec = SPECS[op as CmdOp];
  const out: Record<string, unknown> = { op };
  for (const k of Object.keys(spec)) {
    const p = spec[k];
    if (!own(o, k) || o[k] === undefined) {
      if (p.optional) continue;
      return null;
    }
    const r = p(o[k]);
    if (r === BAD) return null;
    out[k] = r;
  }
  return out as Cmd;
}
