// commands.test.ts — 指令匯流排的網路輸入驗證 validCmd（co-op M-B2 Task 2，計畫 B9）
import { describe, it, expect } from 'vitest';
import { CMD_OPS, validCmd, type Cmd, type CmdOp } from './commands';
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance';

/** 每個 op 至少一個合法樣本 */
const SAMPLES: Record<CmdOp, Cmd[]> = {
  craft: [{ op: 'craft', recipe: 'planks' }],
  swap: [{ op: 'swap', a: 0, b: 39 }],
  place: [{ op: 'place', x: -5, y: 59, slot: 1 }],
  toss: [{ op: 'toss', slot: 3 }, { op: 'toss', slot: 39, n: 9999 }],
  chestTake: [{ op: 'chestTake', slot: 19 }],
  chestTakeAll: [{ op: 'chestTakeAll' }],
  chestDeposit: [{ op: 'chestDeposit', slot: 7 }],
  chestClose: [{ op: 'chestClose' }],
  equip: [{ op: 'equip', slot: 0 }, { op: 'equip', slot: 5, to: 'acc3' }],
  unequip: [{ op: 'unequip', slot: 'body' }],
  equipVanity: [{ op: 'equipVanity', slot: 2 }, { op: 'equipVanity', slot: 2, to: 'back' }],
  unequipVanity: [{ op: 'unequipVanity', slot: 'acc' }],
  hideArmor: [{ op: 'hideArmor', slot: 'head', hide: true }],
  recolor: [{ op: 'recolor', slot: 'body', tint: [0, 255] }],
  bodyLook: [{ op: 'bodyLook', look: normalizeAppearance({ race: 1 }) }],
  mirrorClose: [{ op: 'mirrorClose' }],
  rebirth: [{ op: 'rebirth', race: 2 }],
  lock: [{ op: 'lock', at: 4 }, { op: 'lock', at: 'head' }],
  salvage: [{ op: 'salvage', at: 'acc0' }],
  salvageAll: [{ op: 'salvageAll', maxRarity: 1 }],
  reroll: [{ op: 'reroll', at: 0, affix: 1 }],
  upgrade: [{ op: 'upgrade', at: 'legs' }],
  ascend: [{ op: 'ascend', at: 12 }],
  deepforge: [{ op: 'deepforge', at: 3, key: 'v0:smith' }],
  buy: [{ op: 'buy', npc: 'merchant', i: 0 }],
  sell: [{ op: 'sell', npc: 'cook', item: 'wood', n: 3 }],
  service: [{ op: 'service', npc: 'healer' }],
  residentService: [{ op: 'residentService', npc: 'healer', svc: 'heal' }],
  folkBuy: [{ op: 'folkBuy', key: 'v0:elder', i: 2 }],
  folkSell: [{ op: 'folkSell', key: 'v0:elder', item: 'gold_ore', n: 1 }],
  folkService: [{ op: 'folkService', key: 't3', svc: 'rescue' }],
  acceptQuest: [{ op: 'acceptQuest', key: 'v0:elder', id: 'q1' }],
  turnInQuest: [{ op: 'turnInQuest', id: 'q1' }],
  refreshQuests: [{ op: 'refreshQuests' }],
  learnSkill: [{ op: 'learnSkill', id: 'b_vigor' }],
  respec: [{ op: 'respec' }],
  skill: [{ op: 'skill', skill: 'pulse' }],
  talk: [{ op: 'talk' }],
  talkAt: [{ op: 'talkAt', px: 12.5, py: -3 }],
  travel: [{ op: 'travel', to: 2 }],
  travelStone: [{ op: 'travelStone', to: -1 }],
  spawnCore: [{ op: 'spawnCore', id: 7 }],
  marker: [{ op: 'marker', x: 1_000_000, y: 4095 }],
};

describe('validCmd', () => {
  it('合法指令原樣通過', () => {
    expect(validCmd({ op: 'craft', recipe: 'planks' })).toEqual({ op: 'craft', recipe: 'planks' });
    const t = validCmd({ op: 'toss', slot: 3 });
    expect(t).toEqual({ op: 'toss', slot: 3 });
    expect(Object.keys(t!)).toEqual(['op', 'slot']);
    expect(CMD_OPS.length).toBe(Object.keys(SAMPLES).length);
    for (const op of CMD_OPS) {
      expect(SAMPLES[op].length, op).toBeGreaterThan(0);
      for (const s of SAMPLES[op]) expect(validCmd(JSON.parse(JSON.stringify(s))), op).toEqual(s);
    }
  });
  it('CMD_OPS 的順序同 Cmd', () => {
    expect(CMD_OPS.slice(0, 4)).toEqual(['craft', 'swap', 'place', 'toss']);
    expect(CMD_OPS[CMD_OPS.length - 1]).toBe('marker');
    expect(new Set(CMD_OPS).size).toBe(CMD_OPS.length);
  });
  it('垃圾一律 null、不拋', () => {
    const junk: unknown[] = [
      null, 42, 'craft', {}, [], { op: 'nuke' }, { op: 'toString' }, { op: '__proto__' },
      { op: 'swap', a: 0.5, b: 1 }, { op: 'swap', a: NaN, b: 1 }, { op: 'swap', a: 0 },
      { op: 'chestTake', slot: 20 }, { op: 'equip', slot: 40 }, { op: 'unequip', slot: 'hat' },
      { op: 'sell', npc: 'merchant', item: 'no_such', n: 1 }, { op: 'sell', npc: 'merchant', item: 'wood', n: 0 },
      { op: 'craft', recipe: 'x'.repeat(65) }, { op: 'craft', recipe: '' },
      { op: 'place', x: 2e6, y: 0, slot: 0 }, { op: 'place', x: 0, y: 4096, slot: 0 }, { op: 'place', x: 0, y: 0, slot: 10 },
      { op: 'hideArmor', slot: 'head', hide: 'yes' }, { op: 'hideArmor', slot: 'back', hide: true },
      { op: 'toss', slot: 0, n: 10000 }, { op: 'toss', slot: 0, n: null },
      { op: 'recolor', slot: 'body', tint: [0, 256] }, { op: 'recolor', slot: 'body', tint: [1, 2, 3] },
      { op: 'bodyLook', look: 3 }, { op: 'talkAt', px: Infinity, py: 0 }, { op: 'skill', skill: 'fly' },
      { op: 'learnSkill', id: 'x_none' }, { op: 'residentService', npc: 'healer', svc: 'nap' },
      { op: 'lock', at: 'hat' }, { op: 'travel', to: 2 ** 60 },
    ];
    for (const j of junk) expect(() => validCmd(j)).not.toThrow();
    for (const j of junk) expect(validCmd(j), JSON.stringify(j)).toBeNull();
  });
  it('只拷貝已知欄位', () => {
    const raw = JSON.parse('{"op":"respec","__proto__":{"polluted":1},"extra":2}');
    const c = validCmd(raw);
    expect(c).toEqual({ op: 'respec' });
    expect(c).not.toBe(raw);
    expect(Object.keys(c!)).toEqual(['op']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // 原型上的欄位不算
    const proto = Object.create({ recipe: 'planks' }) as Record<string, unknown>;
    proto.op = 'craft';
    expect(validCmd(proto)).toBeNull();
  });
  it('bodyLook 的外觀先正規化', () => {
    const c = validCmd({ op: 'bodyLook', look: { race: 999, junk: 1 } }) as Extract<Cmd, { op: 'bodyLook' }>;
    expect(c).not.toBeNull();
    expect(c.look).toEqual(normalizeAppearance({ race: 999 }));
    expect(c.look.race).toBe(DEFAULT_APPEARANCE.race);
    expect('junk' in c.look).toBe(false);
  });
});
