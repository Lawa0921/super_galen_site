import { describe, it, expect, vi } from 'vitest';
import { attachControls } from './controls';
import type { DelveGame } from '../engine/game';
import { T } from '../engine/tiles';

/** 只有 controls 觸控路徑會碰到的那幾個方法；talkAt 的回傳可換（客人副本 = CMD_PENDING true） */
function fakeGame(o: { talkAt: boolean; held?: { item: string; count: number } | null; person?: boolean }) {
  const calls = { mining: [] as boolean[], use: [] as boolean[], acts: [] as string[] };
  const game = {
    setMoveX: vi.fn(), setJump: vi.fn(), setUp: vi.fn(), setDrop: vi.fn(),
    setAimWorld: vi.fn(),
    setMining: (v: boolean) => { calls.mining.push(v); },
    setUse: (v: boolean) => { calls.use.push(v); },
    getState: () => ({ aim: { x: 3, y: 4 } }),
    act: (cmd: { op: string }) => { calls.acts.push(cmd.op); return cmd.op === 'talkAt' ? o.talkAt : true; },
    inventory: { selected: 0, selectedStack: () => o.held ?? null },
    world: { getFg: () => T.DIRT },
    settle: { npcAtPx: () => null },
    folk: { atPx: () => (o.person ? {} : null) },
  };
  return { game: game as unknown as DelveGame, calls };
}

function touchDown(canvas: HTMLElement): void {
  canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 40, clientY: 50, bubbles: true, cancelable: true }));
}

function setup(o: Parameters<typeof fakeGame>[0]) {
  const root = document.createElement('div'), canvas = document.createElement('canvas');
  root.appendChild(canvas); document.body.appendChild(root);
  const { game, calls } = fakeGame(o);
  const c = attachControls({ game, canvas, root, screenToWorld: (x, y) => ({ x, y }), onInventory: () => {}, onMenu: () => {}, isBlocked: () => false });
  return { canvas, calls, done: () => { c.destroy(); root.remove(); } };
}

describe('controls 觸控點畫面', () => {
  it('連線客人（talkAt 一律回 pending true）點土塊：照樣開始挖，不送對話指令', () => {
    const { canvas, calls, done } = setup({ talkAt: true, held: { item: 'wood_pickaxe', count: 1 } });
    touchDown(canvas);
    expect(calls.mining).toEqual([true]);
    expect(calls.acts).not.toContain('talkAt');
    done();
  });

  it('連線客人拿土塊點空格：照樣放置（setUse）', () => {
    const { canvas, calls, done } = setup({ talkAt: true, held: { item: 'dirt', count: 3 } });
    touchDown(canvas);
    expect(calls.use).toEqual([true]);
    done();
  });

  it('點到人：送對話指令、對話成功就不挖也不用', () => {
    const { canvas, calls, done } = setup({ talkAt: true, person: true, held: { item: 'wood_pickaxe', count: 1 } });
    touchDown(canvas);
    expect(calls.acts).toContain('talkAt');
    expect(calls.mining).toEqual([]);
    expect(calls.use).toEqual([]);
    done();
  });

  it('單機點到人但搆不到（talkAt false）：退回互動（use）', () => {
    const { canvas, calls, done } = setup({ talkAt: false, person: true, held: { item: 'wood_pickaxe', count: 1 } });
    touchDown(canvas);
    expect(calls.use).toEqual([true]);
    done();
  });
});
