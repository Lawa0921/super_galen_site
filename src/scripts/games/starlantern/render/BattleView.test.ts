import { Container, Sprite, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';
import { makeBattle, makeCombatant } from '../engine/testing';
import { BattleView } from './BattleView';
import type { TextureBank } from './textures';

const sfx = { hit: vi.fn(), weak: vi.fn(), heal: vi.fn(), ko: vi.fn() } as unknown as SoundManager;
const bank = { get: () => Texture.WHITE, has: () => true } as unknown as TextureBank;
const battle = (log: BattleState['log']): BattleState =>
  makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], [makeCombatant({ key: 'e0', side: 'enemy' })], { log });
const enemyBox = (view: BattleView) => view.root.children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.children.length > 0) as Container;

describe('BattleView', () => {
  it('lets the final shatter finish before playback resolves', async () => {
    // a real display runs frames ~16 ms apart; the test environment's rAF is near-instant
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    const box = enemyBox(view);
    const s = battle([{ type: 'ko', target: 'e0' }]);
    s.enemies[0].alive = false;
    await view.play(s, sfx);
    const pieces = (box.children[0] as Container).children.filter((c) => c.visible);
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every((p) => p.alpha === 0)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('cancels pending effects when a new battle is set up', async () => {
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on('uncaughtException', onErr);
    const playing = view.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'phys', mult: 1 }]), sfx);
    await new Promise((r) => setTimeout(r, 20));
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    await playing;
    await new Promise((r) => setTimeout(r, 600));
    process.off('uncaughtException', onErr);
    expect(errors).toEqual([]);
  });
});
