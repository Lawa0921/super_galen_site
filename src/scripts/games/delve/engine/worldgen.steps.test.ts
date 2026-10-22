// worldgen.steps.test.ts — 分段生成（標題畫面顯示生成進度用）與一次生成完全相同
import { describe, it, expect } from 'vitest';
import { generateWorld, generateWorldSteps, GEN_STAGE_COUNT, type GenResult } from './worldgen';
import { DelveGame } from './game';
import { serializeGame, restoreGame } from '../save/serialize';

function hash(...arrs: ArrayLike<number>[]): number {
  let h = 2166136261;
  for (const a of arrs) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}
const SMALL = { width: 300, height: 160 };

function runSteps(seed: string): { stages: string[]; res: GenResult } {
  const it = generateWorldSteps(seed, SMALL);
  const stages: string[] = [];
  for (;;) {
    const r = it.next();
    if (r.done) return { stages, res: r.value };
    stages.push(r.value);
  }
}

describe('generateWorldSteps', () => {
  it('逐段 yield 階段名，最後的結果與 generateWorld 逐格相同', () => {
    const { stages, res } = runSteps('steps');
    const ref = generateWorld('steps', SMALL);
    expect(stages.length).toBe(GEN_STAGE_COUNT);
    expect(new Set(stages).size).toBeGreaterThan(10);
    expect(hash(res.world.fg, res.world.wall, res.world.liquid)).toBe(hash(ref.world.fg, ref.world.wall, ref.world.liquid));
    expect(res.spawn).toEqual(ref.spawn);
    expect(res.springs.length).toBe(ref.springs.length);
  });

  it('DelveGame 可以接收預先生成的世界（opts.gen），結果與自己生成相同', () => {
    const { res } = runSteps('pregen');
    const a = new DelveGame({ seed: 'pregen', ...SMALL, gen: res });
    const b = new DelveGame({ seed: 'pregen', ...SMALL });
    const va = a.world.window(0, 0, a.world.width, a.world.height), vb = b.world.window(0, 0, b.world.width, b.world.height);
    expect(hash(va.fg, va.wall)).toBe(hash(vb.fg, vb.wall));
    expect(a.spawn).toEqual(b.spawn);
    expect(a.player.x).toBe(b.player.x);
  });

  it('restoreGame 可以接收預先生成的世界（opts.gen）', () => {
    const g = new DelveGame({ seed: 'rest', ...SMALL });
    const t = g.playerTile();
    g.world.setFg(t.x + 2, t.y + 3, 7);
    const bytes = serializeGame(g);
    const { res } = runSteps('rest');
    const r = restoreGame(bytes, { gen: res });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.game.world.getFg(t.x + 2, t.y + 3)).toBe(7);
  });
});
