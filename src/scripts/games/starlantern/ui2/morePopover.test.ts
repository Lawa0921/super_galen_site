import { resolve } from 'node:path';
import { compile } from 'sass';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AFFIX_FILL } from '../render/ailmentStyle';
import { el } from '../ui/dom';
import { T } from '../data/text.zh-TW';
import { MorePopover, moreTrigger } from './morePopover';

const word = (cls: string, text: string) => el('span', { class: cls, text });
const tap = (t: Element) => {
  t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  return t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const pops: MorePopover[] = [];

function rig() {
  const root = el('div');
  document.body.append(root);
  const pop = new MorePopover();
  pops.push(pop);
  const host = el('div', { class: 'slx-pm' });
  const opened = vi.fn();
  const words = () => [word('slx-ail slx-ail-bleed', '流血×2'), word('slx-ail slx-ail-burn', '灼燒3'), word('slx-ail slx-ail-poison', '中毒')];
  const trigger = moreTrigger(2, () => { opened(); pop.toggle('pm:noel', trigger, host, words()); });
  const outside = el('button', { class: 'slx-opt', text: '防禦' });
  const picked = vi.fn();
  outside.addEventListener('click', picked);
  host.append(trigger);
  root.append(host, outside);
  return { root, pop, host, trigger, outside, picked, opened };
}

afterEach(() => { for (const p of pops.splice(0)) p.dispose(); document.body.replaceChildren(); });

describe('MorePopover (touch overflow)', () => {
  it('the +N is a button that says what it hides; its tap opens a list of every word in the host, with nothing else done', () => {
    const r = rig();
    expect(r.trigger.className).toBe('slx-ail slx-ail-more');
    expect(r.trigger.textContent).toBe('+2');
    expect(r.trigger.getAttribute('role')).toBe('button');
    expect(r.trigger.getAttribute('aria-label')).toBe(T.ailmentMoreLabel(2));
    expect(r.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(r.pop.openId).toBeNull();
    expect(r.pop.el.hidden).toBe(true);
    tap(r.trigger);
    expect(r.opened).toHaveBeenCalledTimes(1);
    expect(r.pop.openId).toBe('pm:noel');
    expect(r.pop.el.hidden).toBe(false);
    expect(r.pop.el.parentElement).toBe(r.host);
    expect(r.pop.el.getAttribute('aria-label')).toBe(T.ailmentAll);
    expect([...r.pop.el.children].map((c) => [c.className, c.textContent])).toEqual([
      ['slx-ail slx-ail-bleed', '流血×2'], ['slx-ail slx-ail-burn', '灼燒3'], ['slx-ail slx-ail-poison', '中毒'],
    ]);
    expect(r.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(r.picked).not.toHaveBeenCalled();
    expect(r.root.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('a second tap on the same +N closes it', () => {
    const r = rig();
    tap(r.trigger);
    tap(r.trigger);
    expect(r.pop.openId).toBeNull();
    expect(r.pop.el.hidden).toBe(true);
    expect(r.trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('a tap outside closes it, and that tap does nothing else (no command is picked by it)', () => {
    const r = rig();
    tap(r.trigger);
    const passed = tap(r.outside);
    expect(r.pop.openId).toBeNull();
    expect(r.pop.el.hidden).toBe(true);
    expect(r.picked).not.toHaveBeenCalled();
    expect(passed).toBe(false);   // the click was cancelled
    // Closed, it takes nothing: the next tap does what it always did.
    tap(r.outside);
    expect(r.picked).toHaveBeenCalledTimes(1);
  });

  it('a long press outside closes it and its click, however late, picks nothing; the next press works as before (review)', () => {
    vi.useFakeTimers();
    try {
      const r = rig();
      tap(r.trigger);
      r.outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(r.pop.openId).toBeNull();
      vi.advanceTimersByTime(2000);                       // held two seconds, then let go
      r.outside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(r.picked).not.toHaveBeenCalled();
      tap(r.outside);
      expect(r.picked).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('a press outside with no click after it (a drag) leaves the next tap alone', () => {
    const r = rig();
    tap(r.trigger);
    r.outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    r.outside.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    tap(r.outside);
    expect(r.picked).toHaveBeenCalledTimes(1);
  });

  it('a tap inside the open list keeps it open', () => {
    const r = rig();
    tap(r.trigger);
    tap(r.pop.el.children[1]);
    expect(r.pop.openId).toBe('pm:noel');
  });

  it('cancel (Esc) closes it and is used up; other keys pass on and close it; closed, it takes no key', () => {
    const r = rig();
    expect(r.pop.onAction('cancel')).toBe(false);   // closed: nothing taken
    tap(r.trigger);
    expect(r.pop.onAction('cancel')).toBe(true);
    expect(r.pop.openId).toBeNull();
    tap(r.trigger);
    expect(r.pop.onAction('down')).toBe(false);
    expect(r.pop.openId).toBeNull();
  });

  it('another +N while one is open: its list replaces the first; a refresh keeps it open on the new +N', () => {
    const r = rig();
    tap(r.trigger);
    const other = el('div');
    const t2 = moreTrigger(1, () => r.pop.toggle('foe:e0', t2, other, [word('slx-ail slx-ail-shock', '感電2')]));
    r.root.append(other, t2);
    tap(t2);
    expect(r.pop.openId).toBe('foe:e0');
    expect(r.pop.el.parentElement).toBe(other);
    expect(r.trigger.getAttribute('aria-expanded')).toBe('false');
    // A redraw hands a new +N and new words: the list follows, still open.
    const t3 = moreTrigger(2, () => undefined);
    r.pop.show('foe:e0', t3, other, [word('slx-ail slx-ail-shock', '感電1'), word('slx-ail slx-ail-chill', '冰緩2')]);
    expect(r.pop.openId).toBe('foe:e0');
    expect([...r.pop.el.children].map((c) => c.textContent)).toEqual(['感電1', '冰緩2']);
    expect(t3.getAttribute('aria-expanded')).toBe('true');
  });

  it('dispose closes it and leaves no listener behind', () => {
    const r = rig();
    tap(r.trigger);
    r.pop.dispose();
    expect(r.pop.openId).toBeNull();
    tap(r.outside);
    expect(r.picked).toHaveBeenCalledTimes(1);
  });

  it('a trigger inside an inert screen does nothing', () => {
    const r = rig();
    r.root.setAttribute('inert', '');
    tap(r.trigger);
    expect(r.opened).not.toHaveBeenCalled();
  });
});

describe('MorePopover stylesheet (touch overflow)', () => {
  const css = compile(resolve(process.cwd(), 'src/styles/_starlantern-ui.scss')).css;
  // Each plain rule by its selector (the last line before its brace), its declarations joined.
  const rules = css.split('}').map((r) => r.split('{')).filter((p) => p.length === 2).map(([sel, body]) => [sel.trim().split('\n').at(-1)!.trim(), body] as const);
  const rule = (sel: string) => rules.filter(([x]) => x === sel).map(([, b]) => b).join(';');

  it('the list is a window over the row, hidden when closed, with no !important', () => {
    expect(rule('.slx-more-pop')).toMatch(/position:\s*absolute/);
    expect(rule('.slx-more-pop[hidden]')).toMatch(/display:\s*none/);
    expect(rule('.slx-pm > .slx-more-pop')).toMatch(/bottom:\s*calc\(100% \+ 18px\)/);
    expect(rule('.slx-pm:nth-child(n+4) > .slx-more-pop')).toMatch(/right:\s*0/);
    for (const sel of ['.slx-more-pop', '.slx-foe-more', '.slx-foe-more-layer', '.slx-pm-ail .slx-ail-more[role=button]']) expect(rule(sel), sel).not.toContain('!important');
  });

  it("the party row's +N takes the pointer back; the foes' layer lets every tap through but its targets", () => {
    expect(rule('.slx-pm-ail .slx-ail-more[role=button]')).toMatch(/pointer-events:\s*auto/);
    expect(rule('.slx-foe-more-layer')).toMatch(/pointer-events:\s*none/);
    expect(rule('.slx-foe-more')).toMatch(/pointer-events:\s*auto/);
  });

  it("a far-right foe's list ends at its target's right edge, as the last two members' do (review)", () => {
    const end = rule('.slx-foe-more-end > .slx-more-pop');
    expect(end).toMatch(/left:\s*auto/);
    expect(end).toMatch(/right:\s*0/);
    expect(end).toMatch(/translate:\s*none/);
  });

  it('a target can stand anywhere on the 640 x 360 stage in 2 px steps', () => {
    expect(rule('.slx-at-x-0')).toMatch(/left:\s*0(px)?;?/);
    expect(rule('.slx-at-x-155')).toMatch(/left:\s*310px/);
    expect(rule('.slx-at-x-320')).toMatch(/left:\s*640px/);
    expect(rule('.slx-at-y-180')).toMatch(/top:\s*360px/);
  });

  it("an affix word in the list has the Pixi row's affix ink", () => {
    expect(rule('.slx-affix')).toContain(`color: #${AFFIX_FILL.toString(16).padStart(6, '0')}`);
  });
});
