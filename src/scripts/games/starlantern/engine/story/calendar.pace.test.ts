import { describe, it, expect } from 'vitest';
import { CHAINS, MEMORY_PITY } from '../../data/story/chains';
import { MEETINGS } from '../../data/meetings';
import { newRun, startDepths } from '../dungeon/run';
import { meet } from '../party';
import { memoriesOf } from '../progression';
import { mulberry32 } from '../rng';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { calendarOf } from './events';
import { EXPECT_SEED, walkFloor } from './expect';
import { FORCED_GLIMMERS, eligible, forcedGlimmers, nextPiece, type Pity } from './memories';

/**
 * Time and moon plan Task 3: how long Selene's moon pieces wait for their moon. A measurement, not a gate: the numbers are
 * printed and kept in the plan's SDD report; only two things are asserted (the plan's stop rule, and the moon's first
 * floor). The three players of the story L scripted play (`events.test.ts` `scriptedPlay`, its EVERY_FLOOR, EVERY_SECOND
 * and EVERY_THIRD return depths, copied and carried on past the finale): a return to town after every floor, every second
 * floor, every third. Each dive is a day from day 1, starts on the floor after the last return (the main road lets a party
 * start on any depth it has reached, `startDepths`) and walks the main road, Selene's home, floor by floor through
 * `walkFloor` with that day's calendar (`calendarOf`). No night at the inn. Who competes for the forced glimmers: Lorne and
 * Rin from depth 1, Chizuru from depth 1 too (her pieces drop on the main road as well; met early is the worst case),
 * Selene and Bobby on their meeting depths (that floor's drops count). The same walk with no calendar is the control.
 */
const LAST = 60;
const returnsEvery = (step: number): number[] => Array.from({ length: Math.ceil(LAST / step) }, (_, i) => step * i + 1);
const PLAYERS: [string, number[]][] = [['every floor', returnsEvery(1)], ['every 2nd floor', returnsEvery(2)], ['every 3rd floor', returnsEvery(3)]];

interface Drop { n: number; depth: number; day: number }
interface Walk { drops: Drop[]; missed: string[]; contested: number; dueUnderMoon: number }
/** The others who may take a forced glimmer on the main road. */
const RIVALS: CharacterId[] = ['hero', 'rin', 'chizuru', 'bobby'];

const walk = (returns: number[], calendar: boolean): Walk => {
  let s: GameState = newGame(mulberry32(EXPECT_SEED), EXPECT_SEED, ['hero', 'rin', 'chizuru']);
  s = { ...s, inventory: {} };
  let pity: Pity = {};
  const run = newRun(EXPECT_SEED, 'mainline', 'plain', 1);
  const out: Walk = { drops: [], missed: [], contested: 0, dueUnderMoon: 0 };
  let from = 1;
  returns.forEach((to, i) => {
    const day = i + 1;
    if (!startDepths('mainline', from).includes(from)) throw new Error(`no departure at ${from}`);
    for (let d = from; d <= to; d++) {
      for (const m of MEETINGS) if (m.region === 'mainline' && m.depth === d && !s.party.recruited.includes(m.id)) s = { ...s, party: meet(s.party, m.id, 1) };
      s = { ...s, dungeon: { ...s.dungeon, reached: { ...s.dungeon.reached, mainline: Math.max(s.dungeon.reached.mainline, d) } }, story: { ...s.story, day } };
      const cal = calendar ? calendarOf(s) : undefined;
      const met = s.party.recruited.includes('selene');
      const before = met ? memoriesOf(s.party.roster.selene) : 0;
      const n = met ? nextPiece(s.party, 'selene') : null;
      // her next piece waits on the moon, the moon is right, and her pity is due: this floor must hold it
      const due = !!cal && n !== null && !!CHAINS.selene.pieces[n - 1].when?.moon
        && eligible(s.party, 'selene', { region: 'mainline', depth: d, source: 'glimmer', cal }) && (pity.selene ?? 0) >= MEMORY_PITY;
      if (due) {
        out.dueUnderMoon++;
        // the same floor with Lorne, Rin, Chizuru and Bobby all due as well (whoever of them can drop here): the cap of
        // two is theirs, and her glimmer must still be forced past it
        const rivals: Pity = { ...pity, ...Object.fromEntries(RIVALS.map((id) => [id, Math.max(MEMORY_PITY, pity[id] ?? 0)])) };
        if (forcedGlimmers(s.party, rivals, 'mainline', d, cal).filter((id) => id !== 'selene').length >= FORCED_GLIMMERS.max) out.contested++;
        const crowded = walkFloor(s, rivals, 'mainline', d, run, cal);
        if (memoriesOf(crowded.state.party.roster.selene) === before) out.missed.push(`piece ${n} at depth ${d}, day ${day} (${cal!.moon}), the others due too`);
      }
      const floor = walkFloor(s, pity, 'mainline', d, run, cal);
      s = floor.state;
      pity = floor.pity;
      const after = met ? memoriesOf(s.party.roster.selene) : 0;
      for (let k = before + 1; k <= after; k++) out.drops.push({ n: k, depth: d, day });
      if (due && after === before) out.missed.push(`piece ${n} at depth ${d}, day ${day} (${cal!.moon})`);
    }
    from = to + 1;
  });
  return out;
};

const results = PLAYERS.map(([name, returns]) => ({ name, moon: walk(returns, true), plain: walk(returns, false) }));
const at = (w: Walk, n: number): Drop | undefined => w.drops.find((x) => x.n === n);

describe('time and moon: how long Selene waits for her moon (Task 3)', () => {
  it('prints the measurement', () => {
    const lines = ['piece | player | with the calendar: depth (day) | no calendar: depth (day)'];
    for (let n = 1; n <= CHAINS.selene.pieces.length; n++) {
      for (const r of results) {
        const m = at(r.moon, n);
        const p = at(r.plain, n);
        lines.push(`${n}${CHAINS.selene.pieces[n - 1].when?.moon ? ` (${CHAINS.selene.pieces[n - 1].when!.moon!.join('/')})` : ''} | ${r.name} | ${m ? `${m.depth} (${m.day})` : '-'} | ${p ? `${p.depth} (${p.day})` : '-'}`);
      }
    }
    for (const r of results) lines.push(`${r.name}: floors due under her moon ${r.moon.dueUnderMoon}; with the others made due too, the cap full on ${r.moon.contested}`);
    console.log(`[selene-moon]\n${lines.join('\n')}`);
    expect(results).toHaveLength(3);
  });

  it("Selene's fifth piece drops by depth 30 for every player", () => {
    for (const r of results) expect(at(r.moon, 5)?.depth ?? Infinity, r.name).toBeLessThanOrEqual(30);
  });

  it('each moon piece drops on the first floor of its moon once her pity is due', () => {
    for (const r of results) {
      expect(r.moon.dueUnderMoon, r.name).toBeGreaterThan(0);
      expect(r.moon.missed, r.name).toEqual([]);
    }
    // made crowded, she still got hers on each (`missed` above); on some of them the others could fill the cap of two
    // (deeper, their chains are complete and only she is left to drop)
    expect(results.reduce((sum, r) => sum + r.moon.contested, 0)).toBeGreaterThan(0);
  });
});
