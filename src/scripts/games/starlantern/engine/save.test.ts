import { describe, it, expect } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, loadGame, saveGame } from './save';
import { newGame } from './state';
import { rollPortals } from './portals';
import { mulberry32 } from './rng';
import { memoryStorage } from './testing';

describe('save', () => {
  it('round-trips a game', () => {
    const st = memoryStorage();
    const g = newGame();
    g.gold = 777;
    g.dungeon.reached.blaze = 10;
    expect(saveGame(st, g)).toBe(true);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
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
    expect(bad((g) => { g.party.roster.liz.equip.weapon = 'nope'; })).toBe('corrupt');
    expect(bad((g) => { g.party.roster.liz.limit = 101; })).toBe('corrupt');
    expect(bad((g) => { (g.party.roster.liz as unknown as Record<string, unknown>).limit = 'full'; })).toBe('corrupt');
    expect(bad((g) => { g.party.roster.liz.limit = 60; })).toBe('ok');
    expect(bad((g) => { delete g.party.roster.liz.limit; })).toBe('ok');
    expect(bad((g) => { g.party.roster.liz.level = 35; })).toBe('ok');
    expect(bad((g) => { g.party.roster.liz.level = 51; })).toBe('corrupt');
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
