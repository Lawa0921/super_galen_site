import { describe, it, expect } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, V8_KEY, loadGame, saveGame } from './save';
import { SAVE_VERSION, newGame } from './state';
import { MAX_REACHED } from './levels';
import { rollPortals } from './portals';
import { mulberry32 } from './rng';
import { makeBattle, makeCombatant, memoryStorage, plainItem, fullParty, version8Save } from './testing';
import { Game } from './game';
import { defaultTalents, defaultTree, heroTree, memoriesOf, validBuild } from './progression';
import { BOARDS } from '../data/talents';
import { TREES } from '../data/trees';
import { CHARACTER_IDS } from '../data/characters';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharacterId } from './types';
import { ABSORB_CAP, ABSORB_GAIN } from '../data/story/fragments';
import { chainLength } from '../data/story/chains';

describe('save', () => {
  it('round-trips a game', () => {
    const st = memoryStorage();
    const g = newGame();
    g.gold = 777;
    g.dungeon.reached.blaze = 10;
    expect(saveGame(st, g)).toBe(true);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('B1 ruling: an unknown banter id is dropped from the story lists, never a corrupt save; any other unknown id still is', () => {
    const st = memoryStorage();
    const g = newGame();
    g.story.seen = ['prologue', 'banter:noel-rin:1'];
    g.story.queue = ['prologue-inn'];
    const raw = JSON.parse(JSON.stringify({ ...g, version: SAVE_VERSION }));
    raw.story.seen.push('banter:noel-rin:9', 'banter:bobby-zelda:1');
    raw.story.fresh.push('banter:noel-rin:9');
    raw.story.queue.push('banter:bobby-zelda:2');
    st.setItem(SAVE_KEY, JSON.stringify(raw));
    const r = loadGame(st);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.state.story.seen).toEqual(['prologue', 'banter:noel-rin:1']);
    expect(r.state.story.fresh).toEqual([]);
    expect(r.state.story.queue).toEqual(g.story.queue);
    // a 6d `heard` record keyed by an unknown banter is dropped with it
    const withHeard = JSON.parse(JSON.stringify(raw));
    withHeard.story.heard = { 'banter:noel-rin:9': [0] };
    st.setItem(SAVE_KEY, JSON.stringify(withHeard));
    const h = loadGame(st);
    expect(h.status).toBe('ok');
    if (h.status === 'ok') expect((h.state.story as unknown as { heard: object }).heard).toEqual({});
    // any other unknown scene id keeps its old meaning: the save is corrupt
    for (const bad of ['chat:noel:9', 'nope', 42]) {
      const other = JSON.parse(JSON.stringify({ ...g, version: SAVE_VERSION }));
      other.story.seen.push(bad);
      st.setItem(SAVE_KEY, JSON.stringify(other));
      expect(loadGame(st).status, String(bad)).toBe('corrupt');
    }
  });
  it('reports an empty slot', () => {
    expect(loadGame(memoryStorage())).toEqual({ status: 'empty' });
  });
  it('backs up unreadable JSON', () => {
    const st = memoryStorage({ [SAVE_KEY]: '{oops' });
    expect(loadGame(st)).toEqual({ status: 'corrupt' });
    expect(st.map.get(BACKUP_KEY)).toBe('{oops');
  });
  it('backs up a different version', () => {
    const raw = JSON.stringify({ ...newGame(), version: 0 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('a v7 save reports version', () => {
    const raw = JSON.stringify({ ...newGame(), version: 7 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('a v6 save reports version', () => {
    const raw = JSON.stringify({ ...newGame(), version: 6 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('a save that lists one member twice in recruited is corrupt', () => {
    const g = newGame();
    g.party.recruited = [...g.party.recruited, g.party.recruited[0]];
    const st = memoryStorage();
    saveGame(st, g);
    expect(loadGame(st)).toEqual({ status: 'corrupt' });
  });
  it('a save without the hero on the field, or with the hero on the field but not recruited, is corrupt', () => {
    const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
      const g = newGame();
      mut(g);
      const st = memoryStorage();
      saveGame(st, g);
      return loadGame(st).status;
    };
    expect(bad(() => {})).toBe('ok');
    expect(bad((g) => { g.party.grid = g.party.grid.map((c) => (c === 'hero' ? null : c)); })).toBe('corrupt');
    expect(bad((g) => { g.party.grid = g.party.grid.map((c) => (c === 'hero' ? 'rin' : c === 'rin' ? null : c)); })).toBe('corrupt');
    expect(bad((g) => { g.party.recruited = g.party.recruited.filter((id) => id !== 'hero'); })).toBe('corrupt');   // still standing on the grid, not recruited
    expect(bad((g) => { g.party.recruited = g.party.recruited.filter((id) => id !== 'hero'); g.party.grid = g.party.grid.map((c) => (c === 'hero' ? null : c)); g.party.grid[8] = 'rin'; })).toBe('corrupt');
  });
  it('rejects structurally broken saves', () => {
    const g = newGame() as unknown as { party: { roster: Record<string, unknown> } };
    delete g.party.roster.bobby;
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) }))).toEqual({ status: 'corrupt' });
    const h = { ...newGame(), gold: -5 };
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(h) }))).toEqual({ status: 'corrupt' });
    expect(loadGame(memoryStorage({ [SAVE_KEY]: 'null' }))).toEqual({ status: 'corrupt' });
  });
  it('rejects malformed nested values that later code would iterate', () => {
    const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
      const g = newGame();
      g.party = fullParty();
      mut(g);
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(bad((g) => { (g.revealed as unknown as Record<string, unknown>).slime = 5; })).toBe('corrupt');
    expect(bad((g) => { (g.revealed as unknown as Record<string, unknown>).slime = ['lava']; })).toBe('corrupt');
    expect(bad((g) => { (g.dungeon.reached as unknown as Record<string, unknown>).blaze = 'deep'; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.blaze = 0; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.mainline = 2.5; })).toBe('corrupt');
    expect(bad((g) => { delete (g.dungeon.reached as Partial<typeof g.dungeon.reached>).iron; })).toBe('corrupt');
    expect(bad((g) => { (g.dungeon.reached as unknown as Record<string, unknown>).nowhere = 3; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.storm = 40; })).toBe('ok');
    expect(bad((g) => { g.party.grid[3] = 'bobby'; })).toBe('corrupt');
    expect(bad((g) => { g.party.grid[3] = 'liz'; })).toBe('corrupt');
    expect(bad((g) => { g.party.grid = g.party.grid.slice(0, 5); })).toBe('corrupt');
    expect(bad((g) => { g.party.grid = Array(9).fill(null); })).toBe('corrupt');   // nobody on the field
    expect(bad((g) => { g.party.recruited.push('bobby'); g.party.grid[3] = 'bobby'; })).toBe('corrupt');   // six on the field
    expect(bad((g) => { g.party.roster.liz.equip.weapon = 'nope' as never; })).toBe('corrupt');
    expect(bad((g) => { g.party.roster.liz.limit = 101; })).toBe('corrupt');
    expect(bad((g) => { (g.party.roster.liz as unknown as Record<string, unknown>).limit = 'full'; })).toBe('corrupt');
    expect(bad((g) => { g.party.roster.liz.limit = 60; })).toBe('ok');
    expect(bad((g) => { delete g.party.roster.liz.limit; })).toBe('ok');
    expect(bad((g) => { g.party.roster.liz.level = 35; })).toBe('ok');
    expect(bad((g) => { g.party.roster.liz.level = 51; })).toBe('corrupt');
  });
  it('rejects a duplicate uid, an unknown base, an unknown affix key, a ring in the weapon slot, a bag over 60, and nextUid not above every uid', () => {
    const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
      const g = newGame();
      g.bag = [plainItem('iron-sword', 1), { ...plainItem('copper-ring', 2), affixes: [{ key: 'crit', value: 3 }] }];
      g.party.roster.liz.equip = { ring1: plainItem('copper-ring', 3), weapon: plainItem('iron-sword', 4) };
      g.nextUid = 5;
      mut(g);
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(bad(() => {})).toBe('ok');
    expect(bad((g) => { g.bag[1].uid = 1; })).toBe('corrupt');                                 // twice in the bag
    expect(bad((g) => { g.party.roster.liz.equip.weapon!.uid = 1; })).toBe('corrupt');          // worn and in the bag
    expect(bad((g) => { g.party.roster.noel.equip.ring2 = plainItem('copper-ring', 3); })).toBe('corrupt');   // worn by two
    expect(bad((g) => { g.bag[0].base = 'nope'; })).toBe('corrupt');
    expect(bad((g) => { g.bag[1].affixes[0].key = 'luck' as never; })).toBe('corrupt');
    expect(bad((g) => { g.bag[1].affixes[0].value = 'big' as never; })).toBe('corrupt');
    // Affix values are held to |v| <= 10000: two huge armor affixes would sum to Infinity and make damage NaN.
    expect(bad((g) => { g.bag[1].affixes[0].value = 1e308; })).toBe('corrupt');
    expect(bad((g) => { g.bag[1].affixes[0].value = 10001; })).toBe('corrupt');
    expect(bad((g) => { g.bag[1].affixes[0].value = -10001; })).toBe('corrupt');
    expect(bad((g) => { g.bag[1].affixes[0].value = 10000; })).toBe('ok');
    expect(bad((g) => { g.bag[1].affixes[0].value = -10000; })).toBe('ok');
    expect(bad((g) => { g.party.roster.liz.equip = { ring2: { ...plainItem('copper-ring', 3), affixes: [{ key: 'armor', value: 1e308 }] } }; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].rarity = 'mythic' as never; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].special = 'nope'; })).toBe('corrupt');
    expect(bad((g) => { g.party.roster.liz.equip = { weapon: plainItem('copper-ring', 3) }; })).toBe('corrupt');   // a ring in the weapon slot
    expect(bad((g) => { g.party.roster.liz.equip = { ring2: plainItem('copper-ring', 3) }; })).toBe('ok');
    expect(bad((g) => { (g.party.roster.liz.equip as Record<string, unknown>).armor = plainItem('cloth-robe', 9); })).toBe('corrupt');
    expect(bad((g) => { g.bag = Array.from({ length: 61 }, (_, i) => plainItem('iron-sword', 10 + i)); g.nextUid = 100; })).toBe('corrupt');
    expect(bad((g) => { g.bag = Array.from({ length: 60 }, (_, i) => plainItem('iron-sword', 10 + i)); g.nextUid = 100; })).toBe('ok');
    expect(bad((g) => { g.nextUid = 4; })).toBe('corrupt');
    expect(bad((g) => { g.nextUid = 4.5; })).toBe('corrupt');
    expect(bad((g) => { g.bag = []; g.party.roster.liz.equip = {}; g.nextUid = -1; })).toBe('corrupt');
    expect(bad((g) => { g.bag = []; g.party.roster.liz.equip = {}; g.nextUid = 0; })).toBe('corrupt');
    expect(bad((g) => { g.nextUid = 2 ** 53; })).toBe('corrupt');
    // nextUid is held to 1e9, far below the safe-integer edge, so a pick-up can never mint an unsaveable uid.
    expect(bad((g) => { g.nextUid = 1e9 + 1; })).toBe('corrupt');
    expect(bad((g) => { g.nextUid = 2 ** 53 - 1; })).toBe('corrupt');
    expect(bad((g) => { g.nextUid = 1e9; })).toBe('ok');
    expect(bad((g) => { g.bag[0].ilvl = 1e300; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].ilvl = 1000; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].ilvl = 999; })).toBe('ok');
    expect(bad((g) => { delete (g as Partial<typeof g>).bag; })).toBe('corrupt');
    expect(bad((g) => { delete (g as Partial<typeof g>).nextUid; })).toBe('corrupt');
  });
  it('round-trips a filled bag and worn gear intact', () => {
    const st = memoryStorage();
    const g = newGame();
    g.bag = [
      { ...plainItem('iron-sword', 1), rarity: 'rare', ilvl: 12, affixes: [{ key: 'crit', value: 3 }, { key: 'str', value: 7 }], junk: true },
      { ...plainItem('copper-ring', 2), rarity: 'set', ilvl: 20, special: 'set-blaze-ring', affixes: [{ key: 'fireDmg', value: 9 }] },
    ];
    g.party.roster.liz.equip = {
      weapon: { ...plainItem('iron-sword', 3), rarity: 'legendary', ilvl: 30, special: 'lg-liz', affixes: [{ key: 'atk', value: 11 }] },
      ring2: plainItem('copper-ring', 4),
    };
    g.nextUid = 5;
    expect(saveGame(st, g)).toBe(true);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('a version-5 save reports version', () => {
    const { forgeDraws: _f, ...rest } = newGame();
    const raw = JSON.stringify({ ...rest, version: 5 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('round-trips forgeDraws, an enhanced item and a locked affix', () => {
    const st = memoryStorage();
    const g = newGame();
    g.forgeDraws = 12;
    g.bag = [{ ...plainItem('iron-sword', 1), rarity: 'rare', enhance: 10, locked: 1, affixes: [{ key: 'crit', value: 3 }, { key: 'str', value: 7 }] }];
    g.nextUid = 2;
    expect(saveGame(st, g)).toBe(true);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('a new game starts with zero forge draws and leaves the rng sequence alone', () => {
    expect(newGame().forgeDraws).toBe(0);
  });
  it('a new game takes its forge salt once, without drawing from the rng, and the salt round-trips', () => {
    const a = mulberry32(5), b = mulberry32(5);
    const g = newGame(a, 123456789);
    expect(g.forgeSalt).toBe(123456789);
    newGame(b);
    expect(a()).toBe(b());
    expect(newGame().forgeSalt).toBe(0);
    const st = memoryStorage();
    expect(saveGame(st, g)).toBe(true);
    const back = loadGame(st);
    expect(back.status === 'ok' && back.state.forgeSalt).toBe(123456789);
  });
  it('rejects a forge salt that is not a safe integer, or missing', () => {
    const bad = (salt: unknown, drop = false) => {
      const g: Record<string, unknown> = { ...newGame(), forgeSalt: salt };
      if (drop) delete g.forgeSalt;
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(bad(0)).toBe('ok');
    expect(bad(4294967295)).toBe('ok');
    expect(bad(-7)).toBe('ok');
    expect(bad(1.5)).toBe('corrupt');
    expect(bad('3')).toBe('corrupt');
    expect(bad(2 ** 53)).toBe('corrupt');
    expect(bad(null)).toBe('corrupt');
    expect(bad(0, true)).toBe('corrupt');
  });
  it('rejects enhance 11, -1 and 1.5, a locked index out of range or fractional, and a bad forgeDraws', () => {
    const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
      const g = newGame();
      g.bag = [{ ...plainItem('iron-sword', 1), rarity: 'rare', affixes: [{ key: 'crit', value: 3 }, { key: 'str', value: 7 }] }];
      g.nextUid = 2;
      mut(g);
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(bad((g) => { g.bag[0].enhance = 10; })).toBe('ok');
    expect(bad((g) => { g.bag[0].enhance = 11; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].enhance = -1; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].enhance = 1.5; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].locked = 1; })).toBe('ok');
    expect(bad((g) => { g.bag[0].locked = 2; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].locked = -1; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].locked = 0.5; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].locked = '0' as never; })).toBe('corrupt');
    expect(bad((g) => { g.bag[0].affixes = []; g.bag[0].locked = 0; })).toBe('corrupt');
    expect(bad((g) => { g.forgeDraws = -1; })).toBe('corrupt');
    expect(bad((g) => { g.forgeDraws = 1.5; })).toBe('corrupt');
    expect(bad((g) => { g.forgeDraws = 1e9 + 1; })).toBe('corrupt');
    expect(bad((g) => { g.forgeDraws = 1e9; })).toBe('ok');
    expect(bad((g) => { g.forgeDraws = '3' as never; })).toBe('corrupt');
    expect(bad((g) => { delete (g as Partial<typeof g>).forgeDraws; })).toBe('corrupt');
  });
  it('rejects a __proto__ key smuggled into an item or the state without crashing', () => {
    const g = newGame();
    g.bag = [{ ...plainItem('iron-sword', 1), rarity: 'rare', affixes: [{ key: 'crit', value: 3 }] }];
    g.nextUid = 2;
    const raw = JSON.stringify(g);
    const hostileKey = raw.replace('"enhance":0', '"enhance":0,"__proto__":{"locked":9}');
    expect(hostileKey).toContain('__proto__');
    const r = loadGame(memoryStorage({ [SAVE_KEY]: hostileKey }));
    expect(['ok', 'corrupt']).toContain(r.status);
    const affixProto = raw.replace('"key":"crit"', '"key":"__proto__"');
    expect(loadGame(memoryStorage({ [SAVE_KEY]: affixProto })).status).toBe('corrupt');
  });
  it('a version-4 save reports version', () => {
    const g = newGame();
    const roster = Object.fromEntries(Object.entries(g.party.roster).map(([id, m]) => {
      const { tree: _t, talents: _a, ...rest } = m;
      return [id, rest];
    }));
    const raw = JSON.stringify({ ...g, version: 4, party: { ...g.party, roster } });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('a version-3 save reports version', () => {
    const { bag: _b, nextUid: _n, ...rest } = newGame();
    const raw = JSON.stringify({ ...rest, version: 3 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('a v2 save loads as a version reset (backed up), not corrupt', () => {
    const { portals: _p, ...dungeon } = newGame().dungeon;
    const raw = JSON.stringify({ ...newGame(), version: 2, dungeon });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('save validation rejects a bad region or depth', () => {
    const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
      const g = newGame();
      mut(g);
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(bad((g) => { g.dungeon.portals[1].region = 'nowhere' as never; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.portals[2].condition = 'rain' as never; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.portals[0].region = 'blaze'; })).toBe('corrupt');   // mainline must be first
    expect(bad((g) => { g.dungeon.portals[2] = { ...g.dungeon.portals[1] }; })).toBe('corrupt');   // two different regions
    expect(bad((g) => { g.dungeon.portals = g.dungeon.portals.slice(0, 2); })).toBe('corrupt');
    expect(bad((g) => { delete (g.dungeon as Partial<typeof g.dungeon>).portals; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.frost = 0; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.frost = 7.5; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.frost = 7; })).toBe('ok');
    expect(bad((g) => { g.dungeon.reached.frost = 1e9; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.frost = MAX_REACHED + 1; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.reached.frost = MAX_REACHED; })).toBe('ok');
  });
  it('a saved game keeps its portals across a reload', () => {
    const st = memoryStorage();
    const g = newGame(mulberry32(42));
    expect(saveGame(st, g)).toBe(true);
    const r = loadGame(st);
    expect(r.status === 'ok' && r.state.dungeon.portals).toEqual(g.dungeon.portals);
    expect(g.dungeon.portals).toEqual(rollPortals(mulberry32(42)));
  });
  it('survives storage that throws (private mode)', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(saveGame(throwing, newGame())).toBe(false);
    expect(loadGame(throwing)).toEqual({ status: 'empty' });
  });
});

describe('save v4 codex, boss kills and auto junk', () => {
  const bad = (mut: (g: ReturnType<typeof newGame>) => void) => {
    const g = newGame();
    mut(g);
    return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
  };
  it('round-trips codex, auto junk and boss kills', () => {
    const st = memoryStorage();
    const g = newGame();
    g.codex = ['lg-noel', 'set-blaze'];
    g.autoJunk = 'magic';
    g.dungeon.bossKills = { 'mainline:5': 3, 'blaze:10': 1 };
    expect(saveGame(st, g)).toBe(true);
    const r = loadGame(st);
    expect(r).toEqual({ status: 'ok', state: g });
    expect(r.status === 'ok' && r.state.dungeon.bossKills['mainline:5']).toBe(3);
  });
  it('a new game starts with an empty codex, junk off and no boss kills', () => {
    const g = newGame();
    expect([g.codex, g.autoJunk, g.dungeon.bossKills]).toEqual([[], 'off', {}]);
  });
  it('rejects an unknown codex id, a negative boss kill count, a bad auto-junk mode', () => {
    expect(bad((g) => { g.codex = ['nope']; })).toBe('corrupt');
    expect(bad((g) => { (g as unknown as Record<string, unknown>).codex = 'lg-noel'; })).toBe('corrupt');
    expect(bad((g) => { delete (g as Partial<typeof g>).codex; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.bossKills = { 'mainline:5': -1 }; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.bossKills = { 'mainline:5': 1.5 }; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.bossKills = { 'nowhere:5': 1 }; })).toBe('corrupt');
    expect(bad((g) => { delete (g.dungeon as Partial<typeof g.dungeon>).bossKills; })).toBe('corrupt');
    expect(bad((g) => { g.autoJunk = 'all' as never; })).toBe('corrupt');
    expect(bad((g) => { delete (g as Partial<typeof g>).autoJunk; })).toBe('corrupt');
    expect(bad((g) => { g.codex = ['lg-noel']; g.autoJunk = 'common'; g.dungeon.bossKills = { 'frost:15': 0 }; })).toBe('ok');
  });
  it('bounds the boss-kill depth and drops duplicate codex ids', () => {
    expect(bad((g) => { g.dungeon.bossKills = { 'mainline:10000': 1 }; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.bossKills = { 'mainline:0': 1 }; })).toBe('corrupt');
    expect(bad((g) => { g.dungeon.bossKills = { 'mainline:9999': 1 }; })).toBe('ok');
    const g = newGame();
    g.codex = ['lg-noel', 'set-blaze', 'lg-noel', 'set-blaze'];
    const r = loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) }));
    expect(r.status === 'ok' && r.state.codex).toEqual(['lg-noel', 'set-blaze']);
  });

  it('turns gear base ids left in the inventory into common bag items on load', () => {
    const g = newGame();
    g.inventory = { potion: 2, 'iron-sword': 2, 'copper-ring': 1 };
    g.bag = [plainItem('thorn-spear', 4)];
    g.nextUid = 5;
    const r = loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) }));
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.state.inventory).toEqual({ potion: 2 });
    expect(r.state.bag.map((it) => [it.uid, it.base, it.rarity])).toEqual([[4, 'thorn-spear', 'common'], [5, 'iron-sword', 'common'], [6, 'iron-sword', 'common'], [7, 'copper-ring', 'common']]);
    expect(r.state.nextUid).toBe(8);
  });
  it('keeps the overflow in the inventory when the bag fills up', () => {
    const g = newGame();
    g.bag = Array.from({ length: 59 }, (_, i) => plainItem('thorn-spear', i + 1));
    g.nextUid = 60;
    g.inventory = { 'iron-sword': 3 };
    const r = loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) }));
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.state.bag).toHaveLength(60);
    expect(r.state.inventory).toEqual({ 'iron-sword': 2 });
  });
});

describe('save v5 skill trees and talents', () => {
  const status = (mut: (g: ReturnType<typeof newGame>) => void) => {
    const g = newGame();
    mut(g);
    return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
  };
  const liz = TREES.liz.branches;
  it('a member built at Lv20 round-trips', () => {
    const st = memoryStorage();
    const g = newGame();
    const m = g.party.roster.liz;
    m.level = 20;
    m.tree = defaultTree('liz', 20);
    m.talents = defaultTalents('liz', 20);
    saveGame(st, g);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('a full Lv50 default build round-trips', () => {
    const st = memoryStorage();
    const g = newGame();
    for (const m of Object.values(g.party.roster)) {
      m.level = 50;
      m.tree = defaultTree(m.id, 50);
      m.talents = defaultTalents(m.id, 50);
    }
    saveGame(st, g);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('save validation rejects a broken build', () => {
    const lv = (level: number, tree: Record<string, number>, talents: Record<string, number> = {}) => (g: ReturnType<typeof newGame>) => {
      Object.assign(g.party.roster.liz, { level, tree, talents });
    };
    const free = liz[0].nodes[0].id;
    expect(status(lv(10, { ...defaultTree('liz', 10) }))).toBe('ok');
    expect(status(lv(10, { ...defaultTree('liz', 10), nope: 1 }))).toBe('corrupt');            // unknown node
    expect(status(lv(50, { [free]: 4 }))).toBe('corrupt');                                      // rank 4
    expect(status(lv(50, { [free]: 0 }))).toBe('corrupt');                                      // rank 0
    expect(status(lv(2, { [free]: 1, [liz[1].nodes[0].id]: 1, [liz[2].nodes[0].id]: 1 }))).toBe('corrupt'); // overspent
    expect(status(lv(50, { [liz[1].nodes[0].id]: 1 }))).toBe('corrupt');                        // free node missing
    // 17 points each way at Lv50 (26 earned): only the one-ultimate rule tells the two builds apart.
    const b0 = { 'twin-slash': 3, pickpocket: 2, 'liz-twin-up': 2, 'liz-triple-up': 2, jackpot: 1 };
    const b1 = { stealth: 1, 'treasure-sense': 1, 'smoke-bomb': 3, 'liz-smoke-up': 3 };
    expect(status(lv(50, { ...b0, ...b1, 'fortune-strike': 1 }))).toBe('corrupt');             // two ultimates
    expect(status(lv(50, { ...b0, ...b1 }))).toBe('ok');                                        // one ultimate
    expect(status(lv(50, { ...b1, 'twin-slash': 3, pickpocket: 2, 'liz-twin-up': 2, 'liz-triple-up': 2, 'fortune-strike': 1 }))).toBe('ok');
    expect(status(lv(50, { [free]: 1 }, { 'liz-t30': 1 }))).toBe('corrupt');                    // not adjacent
    expect(status(lv(50, { [free]: 1 }, { 'liz-t00': 5, 'liz-t01': 5, 'liz-t02': 5, 'liz-k0': 1, 'liz-k1': 1, 'liz-k2': 1 }))).toBe('corrupt'); // three keystones
    expect(status((g) => { delete (g.party.roster.liz as Partial<typeof g.party.roster.liz>).tree; })).toBe('corrupt');
    expect(status((g) => { delete (g.party.roster.liz as Partial<typeof g.party.roster.liz>).talents; })).toBe('corrupt');
    expect(status((g) => { g.party.roster.liz.level = 2.5; })).toBe('corrupt');
    expect(BOARDS.liz.filter((n) => n.keystone).length).toBeGreaterThanOrEqual(2);
  });
  const capTree = { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5, 'abyss-sword': 1 };
  const withHero = (extra: Record<string, unknown>) => {
    const g = newGame();
    g.party.roster.hero = { ...g.party.roster.hero, level: 50, tree: capTree, ...extra } as typeof g.party.roster.hero;
    return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
  };
  const withMember = (id: 'hero' | 'rin', extra: Record<string, unknown>) => {
    const g = newGame();
    g.party.roster[id] = { ...g.party.roster[id], ...extra } as typeof g.party.roster.hero;
    return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
  };
  it("a saved capstone loads when the hero's memories allow it", () => {
    expect(withHero({ memories: 2 })).toBe('ok');
    expect(withHero({ memories: 1 })).toBe('corrupt');
  });
  it('hostile memories are corrupt', () => {
    for (const bad of [null, -1, 1.5, '3', chainLength('hero') + 1]) expect(withHero({ memories: bad }), String(bad)).toBe('corrupt');
    expect(withMember('rin', { memories: chainLength('rin') + 1 })).toBe('corrupt');
  });
  it("a queued reveal needs all seven of Rin's pieces", () => {
    const withQueue = (pieces: number | undefined) => {
      const g = newGame();
      g.story.queue = ['rin-reveal'];
      if (pieces !== undefined) g.party.roster.rin = { ...g.party.roster.rin, memories: pieces };
      return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status;
    };
    expect(withQueue(undefined)).toBe('corrupt');
    expect(withQueue(chainLength('rin') - 1)).toBe('corrupt');
    expect(withQueue(chainLength('rin'))).toBe('ok');
  });
  it('only Rin with all seven may hold her oath', () => {
    expect(withMember('rin', { memories: chainLength('rin') - 1, oath: true })).toBe('corrupt');
    expect(withMember('rin', { memories: chainLength('rin'), oath: true })).toBe('ok');
    expect(withMember('rin', { oath: true })).toBe('corrupt');
    expect(withMember('hero', { memories: chainLength('hero'), oath: true })).toBe('corrupt');
    expect(withMember('rin', { memories: chainLength('rin'), oath: false })).toBe('corrupt');
  });
  it('absorbed gains must come from the table', () => {
    const ok = { stat: 'atk', amount: ABSORB_GAIN.dim.atk };
    expect(withMember('rin', { absorbed: [ok] })).toBe('ok');
    expect(withMember('rin', { absorbed: [{ stat: 'hp', amount: ABSORB_GAIN.vivid.hp }] })).toBe('ok');
    expect(withMember('rin', { absorbed: [{ stat: 'atk', amount: 999 }] })).toBe('corrupt');
    expect(withMember('rin', { absorbed: [{ stat: 'crit', amount: 1 }] })).toBe('corrupt');
    expect(withMember('rin', { absorbed: Array(ABSORB_CAP).fill(ok) })).toBe('ok');
    expect(withMember('rin', { absorbed: Array(ABSORB_CAP + 1).fill(ok) })).toBe('corrupt');
    expect(withMember('rin', { absorbed: 'x' })).toBe('corrupt');
  });
  it('a hero capstone without memories is corrupt', () => {
    const tree = { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5, 'abyss-sword': 1 };
    const g = newGame();
    g.party.roster.hero = { ...g.party.roster.hero, level: 50, tree };
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })).status).toBe('corrupt');
    expect(validBuild('hero', 50, tree, {}, 10)).toBe(true);
  });
});

describe('save v8 story', () => {
  const bad = (mut: (s: Record<string, unknown>) => void) => {
    const g = newGame();
    const story = structuredClone(g.story) as unknown as Record<string, unknown>;
    mut(story);
    return loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...g, story }) })).status;
  };
  it("a fresh game's story round-trips", () => {
    const st = memoryStorage();
    const g = newGame();
    expect(saveGame(st, g)).toBe(true);
    const r = loadGame(st);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.state.story).toEqual(g.story);
  });
  it('a well-formed played story is ok', () => {
    expect(bad((s) => { Object.assign(s, { act1Cleared: true, finaleCleared: true, seen: ['act2', 'prologue'], fresh: ['act2'], queue: ['act3'], nodes: ['act2'], pity: { rin: 999, hero: 0 }, returned: ['orik'], fed: true }); })).toBe('ok');
  });
  it('a broken story is corrupt', () => {
    const cases: [string, (s: Record<string, unknown>) => void][] = [
      ['act1Cleared is a string', (s) => { s.act1Cleared = 'yes'; }],
      ['finale without act 1', (s) => { s.finaleCleared = true; s.act1Cleared = false; }],
      ['unknown scene in seen', (s) => { s.seen = ['nope']; }],
      ['duplicate seen', (s) => { s.seen = ['act2', 'act2']; }],
      ['fresh not seen', (s) => { s.fresh = ['act2']; s.seen = []; }],
      ['queue overlaps seen', (s) => { s.queue = ['act2']; s.seen = ['act2']; }],
      ['duplicate queue', (s) => { s.queue = ['act2', 'act2']; }],
      ['unknown node', (s) => { s.nodes = ['act9']; }],
      ['duplicate node', (s) => { s.nodes = ['act2', 'act2']; }],
      ['pity of an unknown key', (s) => { s.pity = { hero: -1 }; }],
      ['pity of a ghost', (s) => { s.pity = { ghost: 1 }; }],
      ['fractional pity', (s) => { s.pity = { rin: 1.5 }; }],
      ['pity above 999', (s) => { s.pity = { rin: 1000 }; }],
      ['duplicate returned', (s) => { s.returned = ['orik', 'orik']; }],
      ['unknown returned', (s) => { s.returned = ['nobody']; }],
      ['fed is a number', (s) => { s.fed = 1; }],
    ];
    for (const [name, mut] of cases) expect(bad(mut), name).toBe('corrupt');
  });
  it('a save with no story at all is corrupt, not a crash', () => {
    const g = newGame();
    const raw = JSON.parse(JSON.stringify(g));
    delete raw.story;
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(raw) })).status).toBe('corrupt');
    raw.story = null;
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(raw) })).status).toBe('corrupt');
  });
  it('a save while the finale waits loads: the main road at 30, no finale, no oath', () => {
    const g = newGame();
    g.dungeon.reached.mainline = 30;
    g.story.act1Cleared = true;
    g.story.nodes = ['act2', 'act3', 'act4'];
    expect(g.story.finaleCleared).toBe(false);
    expect(g.party.roster.rin?.oath).toBeUndefined();
    const st = memoryStorage();
    expect(saveGame(st, g)).toBe(true);
    const r = loadGame(st);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.state.dungeon.reached.mainline).toBe(30);
  });
});

describe('save v8 epic and starlit gear (plan 5g)', () => {
  const chizuru = (uid: number) => ({ ...plainItem('thorn-spear', uid), rarity: 'legendary' as const, ilvl: 20, special: 'lg-chizuru', affixes: [{ key: 'atk' as const, value: 11 }] });
  const epic = (uid: number) => ({ ...plainItem('iron-sword', uid), rarity: 'epic' as const, ilvl: 15, affixes: [{ key: 'crit' as const, value: 3 }, { key: 'str' as const, value: 7 }, { key: 'atk' as const, value: 9 }, { key: 'hp' as const, value: 20 }] });
  it('an old v8 save with no epic or starlit gear loads unchanged', () => {
    const st = memoryStorage();
    const g = newGame();
    g.bag = [plainItem('iron-sword', 1), chizuru(2)];
    g.nextUid = 3;
    expect(SAVE_VERSION).toBe(9);
    expect(saveGame(st, g)).toBe(true);
    expect(st.map.get(SAVE_KEY)).not.toContain('starlit');
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('epic and starlit gear round-trip', () => {
    const st = memoryStorage();
    const g = newGame();
    g.bag = [
      epic(1),
      { ...chizuru(2), starlit: true },
      { ...plainItem('copper-ring', 3), rarity: 'set', ilvl: 20, special: 'set-blaze-ring', affixes: [{ key: 'fireDmg', value: 9 }, { key: 'atk', value: 12 }], starlit: true },
    ];
    g.party.roster.liz.equip = {
      ring1: { ...plainItem('copper-ring', 4), rarity: 'unique', ilvl: 20, special: 'blaze-ember-ring', affixes: [{ key: 'fireDmg', value: 9 }, { key: 'fireRes', value: 9 }, { key: 'atk', value: 9 }, { key: 'str', value: 9 }], starlit: true },
    };
    g.nextUid = 5;
    expect(saveGame(st, g)).toBe(true);
    const r = loadGame(st);
    expect(r).toEqual({ status: 'ok', state: g });
    expect(r.status === 'ok' && r.state.bag.map((it) => it.starlit)).toEqual([undefined, true, true]);
    expect(r.status === 'ok' && r.state.party.roster.liz.equip.ring1?.starlit).toBe(true);
  });
  it('a bad starlit flag makes the save corrupt', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['starlit false', { ...chizuru(1), starlit: false }],
      ["starlit 'yes'", { ...chizuru(1), starlit: 'yes' }],
      ['starlit 1', { ...chizuru(1), starlit: 1 }],
      ['a starlit rare', { ...plainItem('iron-sword', 1), rarity: 'rare', affixes: [{ key: 'crit', value: 3 }], starlit: true }],
      ['a starlit epic', { ...epic(1), starlit: true }],
      ['a starlit legendary with no special', { ...plainItem('iron-sword', 1), rarity: 'legendary', affixes: [{ key: 'atk', value: 3 }], starlit: true }],
    ];
    for (const [name, item] of cases) {
      const g = newGame();
      const raw = JSON.parse(JSON.stringify({ ...g, nextUid: 2 }));
      raw.bag = [item];
      expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(raw) })).status, name).toBe('corrupt');
    }
    const g = newGame();
    const ok = JSON.parse(JSON.stringify({ ...g, nextUid: 2 }));
    ok.bag = [{ ...chizuru(1), starlit: true }];
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(ok) })).status).toBe('ok');
  });
});

describe('battle state is never saved (plan 8b)', () => {
  it('a fight with burning and frozen foes saves only the game, and loads back', () => {
    const st = memoryStorage();
    const g = new Game(mulberry32(3), st);
    g.battle = makeBattle(
      [makeCombatant({ key: 'hero', side: 'party', shock: 2 })],
      [makeCombatant({ key: 'e0', side: 'enemy', burn: { tick: 5, turns: 3, src: 'hero' }, frozen: true, bleed: [{ tick: 2, turns: 1, src: 'hero' }] })],
    );
    expect(saveGame(st, g.state)).toBe(true);
    const raw = st.getItem(SAVE_KEY)!;
    expect(Object.keys(JSON.parse(raw))).not.toContain('battle');
    // As keys: a region trait may well be the word "burn" as a value.
    for (const k of ['burn', 'frozen', 'bleed', 'shock']) expect(raw).not.toContain(`"${k}":`);
    expect(loadGame(st).status).toBe('ok');
  });
});

describe('save version 9 (plan 8d)', () => {
  const trees8b = () => (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'roster-8b.json'), 'utf8')) as {
    trees: Record<string, { id: string }[][]>;
  }).trees;

  /** The game without any member's tree or free respec: what a migration must leave exactly as it was. */
  const withoutTrees = (s: ReturnType<typeof newGame>) => ({
    ...s,
    party: { ...s.party, roster: Object.fromEntries(Object.entries(s.party.roster).map(([id, m]) => [id, { ...m, tree: undefined, freeRespec: undefined }])) },
  });

  it('a version 8 save loads as version 9 with standard trees and one free respec', () => {
    const { raw, state: g } = version8Save(trees8b());
    // As plan 8c wrote it: strengthening nodes and since-renamed ids, which no tree of this build holds.
    const old = JSON.parse(raw);
    expect(old.version).toBe(8);
    expect(old.party.roster.liz.tree).toEqual({ 'twin-slash': 1, 'triple-slash': 1, stealth: 1, 'treasure-sense': 1, quickstep: 1, 'liz-quick-up': 1 });
    expect(old.party.roster.noel.tree).toHaveProperty('noel-fire-up', 1);
    expect(old.party.roster.noel.equip.ring1.special).toBe('lg-noel');
    const st = memoryStorage({ [SAVE_KEY]: raw });
    const r = loadGame(st);
    if (r.status !== 'ok') throw new Error(`not loaded: ${r.status}`);
    expect(r.migrated).toBe(true);
    expect(r.state.version).toBe(9);
    expect(r.state.version).toBe(SAVE_VERSION);
    for (const id of CHARACTER_IDS) {
      const m = r.state.party.roster[id], was = g.party.roster[id];
      expect(m.tree, id).toEqual(id === 'hero' ? heroTree(30, 'balanced', 4) : defaultTree(id, was.level));
      expect(m.freeRespec, id).toBe(true);
      expect(validBuild(id, m.level, m.tree, m.talents, memoriesOf(m)), id).toBe(true);
    }
    // Everything else exactly as it was: the whole game, every member's gear, level, memories and talents included.
    expect(withoutTrees(r.state)).toEqual(withoutTrees(g));
    expect(r.state.party.roster.noel.equip.ring1?.special).toBe('lg-noel');
    // The text from before the migration is kept in a key of its own, and the general backup is left alone.
    expect(st.map.get(V8_KEY)).toBe(raw);
    expect(st.map.has(BACKUP_KEY)).toBe(false);
    // Saved again, it loads as it is: no second migration, no second free respec.
    const again = memoryStorage();
    saveGame(again, r.state);
    expect(loadGame(again)).toEqual({ status: 'ok', state: r.state });
  });

  it('the version 8 text goes to its own key once, and nothing ever writes over it', () => {
    const { raw } = version8Save(trees8b());
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st).status).toBe('ok');
    expect(st.map.get(V8_KEY)).toBe(raw);
    // Another version 8 text later (an old tab's new game, say) leaves the first one where it is.
    const other = JSON.stringify({ ...newGame(), version: 8 });
    st.map.set(SAVE_KEY, other);
    expect(loadGame(st).status).toBe('ok');
    expect(st.map.get(V8_KEY)).toBe(raw);
    // So do a corrupt read and a read of another version, which write the general backup.
    st.map.set(SAVE_KEY, '{broken');
    expect(loadGame(st).status).toBe('corrupt');
    st.map.set(SAVE_KEY, JSON.stringify({ ...newGame(), version: 7 }));
    expect(loadGame(st).status).toBe('version');
    expect(st.map.get(V8_KEY)).toBe(raw);
  });

  it('a version 8 save whose only fault is its tree is repaired by the migration', () => {
    // The old tree is thrown away, so a tree that would make a version 9 save corrupt (unknown ids, overspent, a
    // missing free node) loads as the standard build: the migration repairs it on purpose.
    const { raw, state: g } = version8Save(trees8b());
    const bad = JSON.parse(raw);
    bad.party.roster.noel.tree = { nope: 9, 'fire-star': 3, 'inferno': 1 };
    bad.party.roster.liz.tree = {};
    bad.party.roster.hero.tree = 'junk';
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...bad, version: 9 }) }))).toEqual({ status: 'corrupt' });
    const r = loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(bad) }));
    if (r.status !== 'ok') throw new Error(`not repaired: ${r.status}`);
    expect(r.migrated).toBe(true);
    expect(r.state.party.roster.noel.tree).toEqual(defaultTree('noel', 20));
    expect(r.state.party.roster.liz.tree).toEqual(defaultTree('liz', 12));
    expect(r.state.party.roster.hero.tree).toEqual(heroTree(30, 'balanced', 4));
    expect(withoutTrees(r.state)).toEqual(withoutTrees(g));
  });

  it('versions other than 8 and 9 are still refused', () => {
    for (const version of [7, 10]) {
      const raw = JSON.stringify({ ...newGame(), version });
      const st = memoryStorage({ [SAVE_KEY]: raw });
      expect(loadGame(st), String(version)).toEqual({ status: 'version' });
      expect(st.map.get(BACKUP_KEY), String(version)).toBe(raw);
    }
  });

  it('a version 8 save that is broken elsewhere is still corrupt, and backed up', () => {
    const { raw } = version8Save(trees8b());
    const bad = JSON.parse(raw);
    bad.gold = -1;
    const st = memoryStorage({ [SAVE_KEY]: JSON.stringify(bad) });
    expect(loadGame(st)).toEqual({ status: 'corrupt' });
    expect(st.map.get(BACKUP_KEY)).toBe(JSON.stringify(bad));
    // A member the migration cannot read (a level out of range) is left for the validation, which refuses it.
    const lv = JSON.parse(raw);
    lv.party.roster.noel.level = 0;
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(lv) }))).toEqual({ status: 'corrupt' });
  });

  it('freeRespec must be true or absent', () => {
    for (const v of [false, 1, 'yes', null]) {
      const g = JSON.parse(JSON.stringify(newGame()));
      g.party.roster.noel.freeRespec = v;
      expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) })), String(v)).toEqual({ status: 'corrupt' });
    }
    const g = newGame();
    g.party.roster.noel.freeRespec = true;
    const st = memoryStorage();
    saveGame(st, g);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });

  it('a version 9 save is not migrated again', () => {
    const g = newGame();
    g.party.roster.noel.level = 3;
    g.party.roster.noel.tree = { 'fire-star': 3 };   // a build the standard one never makes
    expect(defaultTree('noel', 3)).not.toEqual(g.party.roster.noel.tree);
    const st = memoryStorage();
    saveGame(st, g);
    const r = loadGame(st);
    expect(r).toEqual({ status: 'ok', state: g });
    expect(r).not.toHaveProperty('migrated');
    expect(st.map.has(BACKUP_KEY)).toBe(false);
  });
});
