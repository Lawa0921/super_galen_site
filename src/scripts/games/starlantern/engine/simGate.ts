/**
 * The sim gate (plan 8a Task 1), test-only: a hash chain of every simulated round (the party's actions, the enemies'
 * intents going in, the round's log) and every fight's result, per balance test, so a refactor of the sim can prove it
 * moved nothing on either side. Installed only when `SIM_GATE_OUT` is set.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { Action, BattleState } from './battle';
import { setSimTrace } from './sim';

const encoder = new TextEncoder();

/** 32-bit FNV-1a over the UTF-8 bytes of `s`, continuing from `h` (default the offset basis); unsigned. */
export function fnv1a(s: string, h = 0x811c9dc5): number {
  for (const b of encoder.encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * One round into the chain: the party's actions, the enemies' announced intents going in (none in a fight's first round,
 * when they decide inside resolveRound), and the round's log — every act in turn order, the enemies' included, with
 * whom each touched and how. Together they pin both sides' moves.
 */
export function roundHash(h: number, actions: Record<string, Action>, before: BattleState, after: BattleState): number {
  h = fnv1a(JSON.stringify(actions), h);
  h = fnv1a(JSON.stringify(before.intents ?? null), h);
  return fnv1a(JSON.stringify(after.log), h);
}

interface GateEntry { battles: number; rounds: number; hash: number }

/** Simulated battles that run outside any test (collection, hooks) are keyed here. */
const OUTSIDE = '(outside a test)';

export function installSimGate(tag: 'balance' | 'lineups' | 'deep'): void {
  const out = process.env.SIM_GATE_OUT;
  if (!out) return;
  const entries = new Map<string, GateEntry>();
  let current = OUTSIDE;
  const entry = (): GateEntry => {
    let e = entries.get(current);
    if (!e) { e = { battles: 0, rounds: 0, hash: fnv1a('') }; entries.set(current, e); }
    return e;
  };
  const install = () => setSimTrace({
    round(actions, before, after) { const e = entry(); e.hash = roundHash(e.hash, actions, before, after); },
    end(r) {
      const e = entry();
      e.battles++;
      e.rounds += r.rounds;
      e.hash = fnv1a(JSON.stringify({ outcome: r.outcome, rounds: r.rounds, hpLoss: r.hpLoss }), e.hash);
    },
  });
  // Installed at once (a battle simulated while the file is collected is still seen) and again before the tests run.
  install();
  beforeAll(install);
  beforeEach((ctx) => { current = ctx.task.name; });
  afterEach(() => { current = OUTSIDE; });
  afterAll(() => {
    setSimTrace(null);
    const json: Record<string, { battles: number; rounds: number; hash: string }> = {};
    for (const [name, e] of entries) json[name] = { battles: e.battles, rounds: e.rounds, hash: e.hash.toString(16).padStart(8, '0') };
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${tag}.actions.json`), JSON.stringify(json, null, 2) + '\n');
  });
}
