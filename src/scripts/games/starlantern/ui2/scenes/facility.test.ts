import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import type { MenuItem } from '../menu';
import { FacilityScene } from './facility';
import { MenuView } from '../widgets';
import { Menu } from '../menu';
import { STORY, flatLines } from '../../data/story.zh-TW';
import { DEFAULT_SETTINGS } from '../settings';
import type { ActNode, SceneId } from '../../data/story/scenes';

class Probe extends FacilityScene {
  picked: string[] = [];
  protected commands(): MenuItem[] { return [{ id: 'open', label: '打開' }]; }
  protected onCommand(id: string): void {
    this.picked.push(id);
    const sub = new MenuView(new Menu([{ id: 'x', label: 'X' }]), { pick: () => this.picked.push('x'), cancel: () => this.pop() });
    this.push({ el: sub.el, onAction: (a) => sub.onAction(a) });
  }
  cheer(): Promise<void> { return this.say('好！', 'happy'); }
  her(text: string): Promise<void> { return this.speakAs('selene', text, 'smile'); }
  twice(): Promise<void> { return this.sayThen('一', '二'); }
  scene(id: SceneId, o: Parameters<FacilityScene['play']>[1] = {}): Promise<void> { return this.play(id, o); }
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

describe('FacilityScene mouse', () => {
  it('the 返回 control closes one window per click, then leaves; it is locked during a line', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    const back = root.querySelector('.slx-back') as HTMLElement;
    back.click();                                   // greeting on screen: ignored
    expect(c.go).not.toHaveBeenCalled();
    (root.querySelector('.slx-talk') as HTMLElement).click();   // close the greeting by mouse
    s.onAction('confirm');                          // open sub window
    back.click();
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(0);
    expect(c.go).not.toHaveBeenCalled();
    back.click();
    expect(c.go).toHaveBeenCalledWith('town');
  });
});

describe('FacilityScene story', () => {
  const stageCtx = (nodes: ActNode[], returned: ('anna' | 'orik')[] = []) => {
    const c = ctx();
    c.game.state.story.nodes.push(...nodes);
    c.game.state.story.returned.push(...returned);
    return c;
  };
  const greeting = (c: ReturnType<typeof ctx>, id: 'guild' | 'shop', rng: number) => {
    Object.assign(c.game, { rng: () => rng });
    const root = document.createElement('div');
    new Probe(c, id, Infinity).enter(root);
    return root.querySelector('.slx-talk .slx-text')!.textContent;
  };

  it('greetings follow the stage', () => {
    const c = stageCtx(['act2']);
    expect(STORY.greet.guild.act2).toContain(greeting(c, 'guild', 0));
    expect(STORY.greet.guild.act2).toContain(greeting(c, 'guild', 0.999));
  });

  it('a returned townsperson after-line joins her greetings', () => {
    const c = stageCtx([], ['anna']);
    const pool = [...STORY.greet.guild.prologue, STORY.town.anna.after];
    expect(greeting(c, 'guild', 0.999)).toBe(pool[pool.length - 1]);
    // Orik has not returned: the shop pool is unchanged.
    expect(STORY.greet.shop.prologue).toContain(greeting(c, 'shop', 0.999));
  });

  it('hides the command window while a scene plays and brings it back after', async () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    s.onAction('confirm');
    c.game.arrival = ['prologue'];
    const done = s.scene('prologue');
    const cmd = root.querySelector('.slx-cmd') as HTMLElement;
    const hud = [root.querySelector('.slx-place')!, root.querySelector('.slx-gold')!];
    expect(cmd.classList.contains('slx-cmd-hidden')).toBe(true);
    for (const e of hud) expect(e.classList.contains('slx-cmd-hidden'), e.className).toBe(true);   // staging S1: the HUD too
    s.onAction('cancel'); await new Promise((r) => setTimeout(r, 0)); s.onAction('confirm');
    await done;
    expect(cmd.classList.contains('slx-cmd-hidden')).toBe(false);
    for (const e of hud) expect(e.classList.contains('slx-cmd-hidden'), e.className).toBe(false);
  });
});

describe('FacilityScene.play: the mode and record (bond plan Task 12)', () => {
  it('a mode the caller gives wins over the setting; record false plays and records nothing', async () => {
    const settings = { get: () => ({ ...DEFAULT_SETTINGS, story: 'none' as const }) };
    const c = { ...ctx(), settings };
    const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity);
    s.enter(root);
    s.onAction('confirm');
    const id = 'chat:hero:1';
    // the setting alone: not shown, recorded as auto (a scene is recorded only while it is due: pending here)
    c.game.pending.push(id);
    await s.scene(id);
    expect(c.game.state.story.fresh).toContain(id);
    // the player's own: shown and played
    const c2 = { ...ctx(), settings };
    const r2 = document.createElement('div');
    const s2 = new Probe(c2, 'guild', Infinity);
    s2.enter(r2);
    s2.onAction('confirm');
    c2.game.pending.push(id);
    const p = s2.scene(id, { mode: 'all' });
    expect(r2.querySelector('.slx-talk .slx-text')!.textContent).toBe(flatLines(STORY.scenes[id].lines)[0].text);
    for (let i = 0; i < flatLines(STORY.scenes[id].lines).length; i++) { s2.onAction('confirm'); await new Promise((r) => setTimeout(r, 0)); }
    await p;
    expect(c2.game.state.story.seen).toContain(id);
    expect(c2.game.state.story.fresh).not.toContain(id);
    // record: false (a walk with everyone): shown, never recorded
    const c3 = { ...ctx(), settings };
    const r3 = document.createElement('div');
    const s3 = new Probe(c3, 'guild', Infinity);
    s3.enter(r3);
    s3.onAction('confirm');
    c3.game.pending.push(id);
    const seen = [...c3.game.state.story.seen];
    const q = s3.scene(id, { mode: 'all', record: false });
    for (let i = 0; i < flatLines(STORY.scenes[id].lines).length; i++) { s3.onAction('confirm'); await new Promise((r) => setTimeout(r, 0)); }
    await q;
    expect(c3.game.state.story.seen).toEqual(seen);
  });
});

describe('FacilityScene.speakAs (bond plan Task 13)', () => {
  it('a companion speaks in the facility box, with her plate; a held second box does not follow her', async () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'inn', Infinity); s.enter(root);
    s.onAction('confirm');
    void s.twice();                       // 一, holding 二 for the next box
    void s.her('謝謝您。');
    expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe('瑟蕾');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('謝謝您。');
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // no 二 after her
  });
});
