import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import type { MenuItem } from '../menu';
import { FacilityScene } from './facility';
import { MenuView } from '../widgets';
import { Menu } from '../menu';

class Probe extends FacilityScene {
  picked: string[] = [];
  protected commands(): MenuItem[] { return [{ id: 'open', label: '打開' }]; }
  protected onCommand(id: string): void {
    this.picked.push(id);
    const sub = new MenuView(new Menu([{ id: 'x', label: 'X' }]), { pick: () => this.picked.push('x'), cancel: () => this.pop() });
    this.push({ el: sub.el, onAction: (a) => sub.onAction(a) });
  }
  cheer(): Promise<void> { return this.say('好！', 'happy'); }
}

const ctx = () => ({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() });

describe('FacilityScene', () => {
  afterEach(() => vi.useRealTimers());

  it('lays out the place, gold, command window and a greeting', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    expect(root.querySelector('.slx-place')!.textContent).toBe('冒險者公會');
    expect(root.querySelector('.slx-gold')!.textContent).toBe('150 G');
    expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe('安娜');
  });

  it('cancel closes one layer at a time and leaves only from the top', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    s.onAction('confirm');            // close greeting
    s.onAction('confirm');            // 打開 → sub window
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(1);
    s.onAction('cancel');             // closes the sub window only
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(0);
    expect(c.go).not.toHaveBeenCalled();
    s.onAction('cancel');             // top level → back to town
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('shows the happy face briefly and clears the timer on exit', async () => {
    vi.useFakeTimers();
    const art = { has: () => true };
    const c = { ...ctx(), art }; const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    s.onAction('confirm');
    void s.cheer();
    expect(root.querySelector('.slx-npc')!.getAttribute('src')).toContain('guild-happy');
    s.exit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('FacilityScene pointer', () => {
  it('only the top window takes clicks: the command window is inert under a sub window and during dialogue', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);   // greeting on screen
    s.onAction('confirm');
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(false);
    s.onAction('confirm');                                                       // open sub window
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('.slx-layer')!.hasAttribute('inert')).toBe(false);
    s.onAction('cancel');
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(false);
  });
});
