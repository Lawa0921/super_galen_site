import { describe, expect, it, vi } from 'vitest';
import { art } from '../render/artPaths';
import { NO_ART } from '../render/textures';
import { T } from '../data/text.zh-TW';
import { PartyBar } from './partyBar';
import { MorePopover } from './morePopover';

const m = (key: string, hp = 30, extra = {}) => ({ key, name: key, hp, maxHp: 30, tp: 10, maxTp: 20, limit: 40, alive: hp > 0, ...extra });

describe('PartyBar', () => {
  it('shows one panel per member with bars, the active one lit and the fallen dimmed', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz', 0), m('noel')], 'noel');
    const panels = [...bar.el.querySelectorAll('.slx-pm')];
    expect(panels.map((p) => (p as HTMLElement).dataset.key)).toEqual(['scarlet', 'liz', 'noel']);
    expect(panels[2].classList.contains('slx-pm-active')).toBe(true);
    expect(panels[1].classList.contains('slx-pm-down')).toBe(true);
    const hp = panels[0].querySelector('.slx-bar-hp')!;
    expect(hp.getAttribute('role')).toBe('meter');
    expect([hp.getAttribute('aria-valuenow'), hp.getAttribute('aria-valuemax')]).toEqual(['30', '30']);
    expect(hp.querySelector('.slx-fill-20')).not.toBeNull();
    expect(panels[0].querySelector('.slx-bar-limit .slx-fill-8')).not.toBeNull();   // 40 of 100
    expect(panels[1].querySelector('.slx-bar-hp .slx-fill-0')).not.toBeNull();
    expect(panels[0].textContent).toContain('30/30');
    expect(panels[0].querySelector('.slx-pm-tp')!.textContent).toBe('TP 10/20');
  });

  it('tags each member with their row', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 30, { row: 'front' }), m('noel', 30, { row: 'middle' })]);
    expect([...bar.el.querySelectorAll('.slx-pm-row')].map((e) => e.textContent)).toEqual(['前', '中']);
  });

  it('turns the HP bar red when a member is low, and shows a sliver for any HP left', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 7), m('liz', 1), m('noel', 20)]);
    const hp = (k: string) => bar.el.querySelector(`[data-key=${k}] .slx-bar-hp`)!;
    expect(hp('scarlet').classList.contains('slx-low')).toBe(true);
    expect(hp('noel').classList.contains('slx-low')).toBe(false);
    expect(hp('liz').querySelector('.slx-fill-1')).not.toBeNull();
  });

  it('uses the mood portrait and swaps it briefly on a pulse', () => {
    const idx = { has: (u: string) => [art.portrait('scarlet', 'normal'), art.portrait('scarlet', 'hit'), art.portrait('scarlet', 'dying')].includes(u) };
    const bar = new PartyBar(idx);
    bar.update([m('scarlet', 5)]);
    const img = () => bar.el.querySelector('.slx-pm img')!.getAttribute('src');
    expect(img()).toBe(art.portrait('scarlet', 'dying'));
    bar.pulse('scarlet', 'hit');
    expect(img()).toBe(art.portrait('scarlet', 'hit'));
  });

  it('shows a damage or heal number on the panel and marks a knockout', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz')]);
    bar.pulse('scarlet', 'hit', 24);
    const panel = (k: string) => bar.el.querySelector(`[data-key=${k}]`)!;
    expect(panel('scarlet').classList.contains('slx-pm-hit')).toBe(true);
    expect(panel('scarlet').querySelector('.slx-pm-pop')!.textContent).toBe('-24');
    bar.pulse('liz', 'heal', 60);
    expect(panel('liz').querySelector('.slx-pm-pop-heal')!.textContent).toBe('+60');
    bar.pulse('liz', 'ko');
    expect(panel('liz').classList.contains('slx-pm-ko')).toBe(true);
  });

  it('lays the attack effect over the face, enlarges heavy numbers and calls out weak hits', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet')]);
    bar.pulse('scarlet', 'hit', 30, { fx: '/fx/slash.png', heavy: true, weak: true });
    const panel = bar.el.querySelector('[data-key=scarlet]')!;
    expect(panel.querySelector('.slx-pm-fx')!.getAttribute('src')).toBe('/fx/slash.png');
    expect(panel.querySelector('.slx-pm-pop')!.classList.contains('slx-pm-pop-big')).toBe(true);
    expect(panel.querySelector('.slx-pm-weak')!.textContent).toBe('弱點！');
  });

  it('plays the animated effect sheet over the face when there is one', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet')]);
    bar.pulse('scarlet', 'hit', 10, { fxAnim: 'fire' });
    expect(bar.el.querySelector('[data-key=scarlet] .slx-pm-fxa.slx-pm-fxa-fire')).not.toBeNull();
  });

  it('leaves a white ghost of lost HP that drains down to the new value', async () => {
    vi.useFakeTimers();
    try {
      const bar = new PartyBar(NO_ART);
      bar.update([m('scarlet', 30)]);
      bar.update([m('scarlet', 10)]);
      const ghost = () => bar.el.querySelector('[data-key=scarlet] .slx-bar-hp .slx-ghost')!;
      expect(ghost().classList.contains('slx-fill-20')).toBe(true);
      await vi.advanceTimersByTimeAsync(400);
      expect(ghost().classList.contains('slx-fill-7')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the draining ghost when another update arrives mid-drain', async () => {
    vi.useFakeTimers();
    try {
      const bar = new PartyBar(NO_ART);
      bar.update([m('scarlet', 30), m('liz', 30)]);
      bar.update([m('scarlet', 10), m('liz', 30)]);
      await vi.advanceTimersByTimeAsync(400);
      const ghost = bar.el.querySelector('[data-key=scarlet] .slx-ghost');
      bar.update([m('scarlet', 10), m('liz', 20)]);
      expect(bar.el.querySelector('[data-key=scarlet] .slx-ghost')).toBe(ghost);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a low-HP member\'s panel flashing a warning', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 6), m('liz', 30), m('noel', 0)]);
    const danger = (k: string) => bar.el.querySelector(`[data-key=${k}]`)!.classList.contains('slx-pm-danger');
    expect([danger('scarlet'), danger('liz'), danger('noel')]).toEqual([true, false, false]);
  });

  it('updates panels in place, so a shake or number already playing is not cut off', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz')]);
    const before = bar.el.querySelector('[data-key=scarlet]');
    bar.pulse('scarlet', 'hit', 5);
    bar.update([m('scarlet', 25), m('liz', 20)]);
    const after = bar.el.querySelector('[data-key=scarlet]')!;
    expect(after).toBe(before);
    expect(after.classList.contains('slx-pm-hit')).toBe(true);
    expect(after.querySelector('.slx-pm-pop')).not.toBeNull();
    expect(after.textContent).toContain('25/30');
  });
});

describe('PartyBar stat pops', () => {
  it('shows MISS on an evaded attack without shaking the panel', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet')]);
    bar.pulse('scarlet', 'miss');
    const p = bar.el.querySelector('.slx-pm')!;
    expect(p.querySelector('.slx-pm-miss')!.textContent).toBe('MISS');
    expect(p.classList.contains('slx-pm-hit')).toBe(false);
  });

  it('a crit has its own pop and tag, a resisted hit a small 抗性 tag', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet'), m('liz')]);
    bar.pulse('scarlet', 'hit', 12, { crit: true });
    const s = bar.el.querySelector('[data-key=scarlet]')!;
    expect(s.querySelector('.slx-pm-pop.slx-pm-pop-crit')!.textContent).toBe('-12');
    expect(s.querySelector('.slx-pm-crit')!.textContent).toBe('暴擊！');
    bar.pulse('liz', 'hit', 3, { resist: true });
    const l = bar.el.querySelector('[data-key=liz]')!;
    expect(l.querySelector('.slx-pm-resist')!.textContent).toBe('抗性');
    expect(l.querySelector('.slx-pm-pop-crit')).toBeNull();
  });

  it('TP regen is a quiet blue pop with no shake or glow', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet')]);
    bar.pulse('scarlet', 'tp', 3);
    const p = bar.el.querySelector('.slx-pm')!;
    expect(p.querySelector('.slx-pm-pop.slx-pm-pop-tp')!.textContent).toBe('+3 TP');
    expect(['slx-pm-hit', 'slx-pm-heal', 'slx-pm-acting', 'slx-pm-ko'].some((c) => p.classList.contains(c))).toBe(false);
  });
});

describe('PartyBar portraits of the hero and Rin', () => {
  const published = (ids: string[]) => ({ has: (u: string) => ids.some((id) => u === art.portrait(id, 'normal')) });

  it('render from their published art paths', () => {
    const bar = new PartyBar(published(['hero', 'rin']));
    bar.update([m('hero'), m('rin')]);
    const srcs = [...bar.el.querySelectorAll('.slx-pm img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual([art.portrait('hero', 'normal'), art.portrait('rin', 'normal')]);
  });

  it('a member whose art is missing falls back to the name, with no broken image', () => {
    const bar = new PartyBar(published(['rin']));
    bar.update([m('hero'), m('rin')]);
    const [hero, rin] = [...bar.el.querySelectorAll('.slx-pm')];
    expect(hero.querySelector('img')).toBeNull();
    expect(hero.textContent).toContain('hero');
    expect(rin.querySelector('img')!.getAttribute('src')).toBe(art.portrait('rin', 'normal'));
  });
});

describe('PartyBar after the oath', () => {
  it("after her oath Rin's face is rin-oath", () => {
    const published = { has: (u: string) => [art.portrait('rin', 'normal'), art.portrait('rin-oath', 'normal')].includes(u) };
    const bar = new PartyBar(published);
    bar.update([m('hero'), m('rin', 30, { artId: 'rin-oath' })]);
    const [hero, rin] = [...bar.el.querySelectorAll('.slx-pm')];
    expect(hero.querySelector('img')).toBeNull();
    expect(rin.querySelector('img')!.getAttribute('src')).toBe(art.portrait('rin-oath', 'normal'));
    bar.update([m('hero'), m('rin', 30)]);
    expect(bar.el.querySelector('[data-key=rin] img')!.getAttribute('src')).toBe(art.portrait('rin', 'normal'));
  });

  it('shows each ailment as a coloured word with its turns', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('scarlet', 30, { ailments: [{ id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }] }), m('noel')]);
    const row = bar.el.querySelector<HTMLElement>('[data-key=scarlet] .slx-pm-ail')!;
    expect(row.hidden).toBe(false);
    expect([...row.children].map((c) => [c.className, c.textContent])).toEqual([['slx-ail slx-ail-bleed', '流血×2'], ['slx-ail slx-ail-burn', '灼燒3']]);
    const none = bar.el.querySelector<HTMLElement>('[data-key=noel] .slx-pm-ail')!;
    expect(none.hidden).toBe(true);
    expect(none.children).toHaveLength(0);
    bar.update([m('scarlet', 30, { ailments: [] }), m('noel')]);
    expect(row.children).toHaveLength(0);
    expect(row.hidden).toBe(true);
    expect(bar.el.querySelector('.slx-pm-ail img')).toBeNull();
    expect(bar.el.querySelectorAll('img').length).toBe(0);   // NO_ART: no faces, and the words bring no picture
  });

  it('one line: the most severe first, and what does not fit folds into +N', () => {
    const bar = new PartyBar(NO_ART);
    const five = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }] as const;
    bar.update([m('scarlet', 30, { ailments: [...five] })]);
    const row = bar.el.querySelector<HTMLElement>('[data-key=scarlet] .slx-pm-ail')!;
    const words = [...row.children].map((c) => [c.className, c.textContent]);
    // At 12px (legibility Task 4) two words fit the panel's line before the +N.
    expect(words).toEqual([['slx-ail slx-ail-bleed', '流血×2'], ['slx-ail slx-ail-burn', '灼燒3'], ['slx-ail slx-ail-more', '+3']]);
    bar.update([m('scarlet', 30, { ailments: [{ id: 'chill', turns: 2 }, { id: 'freeze' }, { id: 'sleep', turns: 1 }] })]);
    expect([...row.children].map((c) => c.textContent)).toEqual(['凍結', '睡眠1', '冰緩2']);   // all fit: no +N
  });
});

describe('PartyBar chip icons (art step 9, G4)', () => {
  const loaded = (...urls: string[]) => ({ has: (u: string) => urls.includes(u) });

  it("each word whose 14px icon is loaded shows it first, decorative; the word's text is unchanged", () => {
    const bar = new PartyBar(loaded(art.ailmentIcon('burn'), art.mechIcon('heat')));
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度3' }], ailments: [{ id: 'burn', turns: 2 }] }), m('rin', 30, { ailments: [{ id: 'poison' }] })]);
    const row = bar.el.querySelector<HTMLElement>('[data-key=noel] .slx-pm-ail')!;
    expect([...row.children].map((c) => [c.className, c.textContent])).toEqual([['slx-mech slx-mech-heat', '熱度3'], ['slx-ail slx-ail-burn', '灼燒2']]);
    const ico = (i: number) => row.children[i].querySelector('img');
    expect(ico(0)!.getAttribute('src')).toBe(art.mechIcon('heat'));
    expect(ico(1)!.getAttribute('src')).toBe(art.ailmentIcon('burn'));
    for (const i of [0, 1]) {
      expect(ico(i)!.className).toBe('slx-chip-ico');
      expect([ico(i)!.getAttribute('alt'), ico(i)!.getAttribute('width'), ico(i)!.getAttribute('height')]).toEqual(['', '14', '14']);
      expect(row.children[i].firstChild).toBe(ico(i));                      // in front of the word
    }
    const poison = bar.el.querySelector('[data-key=rin] .slx-ail-poison')!;   // not loaded: the word alone
    expect([poison.textContent, poison.querySelector('img')]).toEqual(['中毒', null]);
  });

  it('a device word shows its own skill icon; a shield its shield', () => {
    const bar = new PartyBar(loaded(art.skillIcon('turret', 14), art.mechIcon('shield')));
    bar.update([m('bobby', 30, { mech: [{ tone: 'devices', text: T.mech.deviceWord(T.mech.deviceShort.turret, 2, 3) }] }),
      m('chizuru', 30, { mech: [{ tone: 'devices', text: T.mech.shield(12) }] })]);
    const imgs = [...bar.el.querySelectorAll('.slx-pm-ail img')].map((i) => i.getAttribute('src'));
    expect(imgs).toEqual([art.skillIcon('turret', 14), art.mechIcon('shield')]);
  });

  it('+N still folds the line, counting the icons in each word (estimated widths)', () => {
    const five = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }] as const;
    const all = loaded(...five.map((a) => art.ailmentIcon(a.id)));
    const bare = new PartyBar(NO_ART), iconed = new PartyBar(all);
    bare.update([m('scarlet', 30, { ailments: [...five] })]); iconed.update([m('scarlet', 30, { ailments: [...five] })]);
    const texts = (b: PartyBar) => [...b.el.querySelectorAll('[data-key=scarlet] .slx-pm-ail > *')].map((c) => c.textContent);
    expect(texts(bare)).toEqual(['流血×2', '灼燒3', '+3']);
    // An icon is 15 px more per word: one ailment fewer fits, and the +N counts the rest.
    expect(texts(iconed)).toEqual(['流血×2', '+4']);
    const more = iconed.el.querySelector<HTMLElement>('.slx-ail-more')!;
    expect(more.querySelector('img')).toBeNull();
    expect(more.title).toBe('流血×2、灼燒3、中毒、感電2、冰緩2');
  });
});

describe('PartyBar mechanics (plan 8c)', () => {
  it('shows mechanic words before the ailments', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度3' }], ailments: [{ id: 'burn', turns: 2 }] }), m('rin')]);
    const row = bar.el.querySelector<HTMLElement>('[data-key=noel] .slx-pm-ail')!;
    expect(row.hidden).toBe(false);
    expect([...row.children].map((c) => [c.className, c.textContent])).toEqual([['slx-mech slx-mech-heat', '熱度3'], ['slx-ail slx-ail-burn', '灼燒2']]);
    const none = bar.el.querySelector<HTMLElement>('[data-key=rin] .slx-pm-ail')!;
    expect(none.hidden).toBe(true);
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度0' }] }), m('rin', 30, { mech: [] })]);
    expect([...row.children].map((c) => c.textContent)).toEqual(['熱度0']);
    expect(row.hidden).toBe(false);
    expect(none.hidden).toBe(true);
    // The words take their room first; the ailments fold into +N in what is left of the one line.
    const five = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }] as const;
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度5' }], ailments: [...five] })]);
    const texts = [...row.children].map((c) => c.textContent);
    expect(texts[0]).toBe('熱度5');
    expect(texts.at(-1)).toMatch(/^\+\d$/);
    expect(texts.length - 2 + Number(texts.at(-1)!.slice(1))).toBe(5);
  });

  it('a folded ailment stays discoverable: the panel and its +N name every word of the row (legibility leftover)', () => {
    const bar = new PartyBar(NO_ART);
    const five = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }] as const;
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度5' }], ailments: [...five] })]);
    const panel = bar.el.querySelector<HTMLElement>('[data-key=noel]')!;
    const row = panel.querySelector<HTMLElement>('.slx-pm-ail')!;
    // At 12px only one ailment fits beside her mechanic word; the rest fold into +N.
    const shown = [...row.children].map((c) => c.textContent);
    expect(shown).toEqual(['熱度5', '流血×2', '+4']);
    // The whole row, in its order, on the panel's title (the row itself lets the pointer through) and on the +N.
    const all = '熱度5、流血×2、灼燒3、中毒、感電2、冰緩2';
    expect(panel.title).toBe(all);
    expect(row.querySelector<HTMLElement>('.slx-ail-more')!.title).toBe(all);
    // Nothing folded: no title.
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度0' }], ailments: [{ id: 'burn', turns: 2 }] })]);
    expect(row.querySelector('.slx-ail-more')).toBeNull();
    expect(panel.hasAttribute('title')).toBe(false);
  });

  it('words that do not fit the line fold into +N too, after the ones that do (plan 8c Task 5)', () => {
    const bar = new PartyBar(NO_ART);
    const words = [{ tone: 'embers', text: '餘燼500' }, { tone: 'beat', text: '拍子4・終幕' }, { tone: 'embers', text: '贖火4' }] as const;
    bar.update([m('scarlet', 30, { mech: [...words], ailments: [{ id: 'poison' }] })]);
    const row = bar.el.querySelector<HTMLElement>('[data-key=scarlet] .slx-pm-ail')!;
    // At 12px (legibility Task 4) the second word no longer fits beside the +N.
    expect([...row.children].map((c) => [c.className, c.textContent])).toEqual([
      ['slx-mech slx-mech-embers', '餘燼500'], ['slx-ail slx-ail-more', '+3'],
    ]);
    // Words that fit, but leave no room for the ailments' +N: the last word folds in with them (plan 8c Task 6).
    bar.update([m('scarlet', 30, { mech: [{ tone: 'devices', text: '砲台Lv1・2' }, { tone: 'devices', text: '護盾機Lv2・2' }], ailments: [{ id: 'poison' }] })]);
    expect([...row.children].map((c) => c.textContent)).toEqual(['砲台Lv1・2', '+2']);
    // Freeze and sleep are never folded: they stand first, and the words make room (plan 8c final).
    bar.update([m('scarlet', 30, { mech: [{ tone: 'embers', text: '餘燼500' }, { tone: 'embers', text: '贖火4' }, { tone: 'embers', text: '代受' }], ailments: [{ id: 'poison' }, { id: 'sleep', turns: 3 }, { id: 'freeze' }] })]);
    const kept = [...row.children].map((c) => c.textContent);
    expect(kept.slice(0, 2)).toEqual(['凍結', '睡眠3']);
    expect(kept.at(-1)).toMatch(/^\+\d$/);
    // When they all fit, nothing folds.
    bar.update([m('scarlet', 30, { mech: [{ tone: 'embers', text: '餘燼0' }, { tone: 'embers', text: '贖火4' }] })]);
    expect([...row.children].map((c) => c.textContent)).toEqual(['餘燼0', '贖火4']);
  });

  it('on a row too narrow even for them, freeze and sleep still stand, the rest folded (measured widths, plan 8c final)', () => {
    // A laid-out page: every word 30 px, the row 50 px.
    // jsdom's layout getters live somewhere up the chain: spy on the prototype that owns each.
    const owner = (p: object, k: string): object => (Object.getOwnPropertyDescriptor(p, k) ? p : owner(Object.getPrototypeOf(p), k));
    const offset = vi.spyOn(owner(HTMLElement.prototype, 'offsetWidth') as HTMLElement, 'offsetWidth', 'get').mockReturnValue(30);
    const client = vi.spyOn(owner(HTMLElement.prototype, 'clientWidth') as HTMLElement, 'clientWidth', 'get').mockReturnValue(50);
    try {
      const bar = new PartyBar(NO_ART);
      bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度5' }, { tone: 'heat', text: '熱度5' }], ailments: [{ id: 'poison' }, { id: 'sleep', turns: 3 }, { id: 'freeze' }] })]);
      const row = bar.el.querySelector<HTMLElement>('[data-key=noel] .slx-pm-ail')!;
      expect([...row.children].map((c) => c.textContent)).toEqual(['凍結', '睡眠3', '+3']);
    } finally {
      offset.mockRestore();
      client.mockRestore();
    }
  });

  it('a cue rises over the member and goes', () => {
    vi.useFakeTimers();
    const bar = new PartyBar(NO_ART);
    bar.update([m('rin')]);
    bar.cue('rin', { tone: 'mark', text: '還有。' });
    const pop = bar.el.querySelector('[data-key=rin] .slx-pm-cue')!;
    expect([pop.className, pop.textContent]).toEqual(['slx-pm-cue slx-mech-mark', '還有。']);
    bar.cue('nobody', { tone: 'heat', text: '暴走！' });
    expect(bar.el.querySelectorAll('.slx-pm-cue')).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(bar.el.querySelector('.slx-pm-cue')).toBeNull();
    vi.useRealTimers();
  });
});

describe('PartyBar +N on touch (touch overflow)', () => {
  const five = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }] as const;
  const loaded = (...urls: string[]) => ({ has: (u: string) => urls.includes(u) });

  it('a tap on +N lists every word of the row, icons and all, in the panel; a second tap closes it', () => {
    const pop = new MorePopover();
    const bar = new PartyBar(loaded(art.ailmentIcon('bleed'), art.ailmentIcon('chill')), pop);
    document.body.append(bar.el);
    bar.update([m('noel', 30, { mech: [{ tone: 'heat', text: '熱度5' }], ailments: [...five] })]);
    const panel = bar.el.querySelector<HTMLElement>('[data-key=noel]')!;
    const more = panel.querySelector<HTMLElement>('.slx-ail-more')!;
    expect(more.getAttribute('role')).toBe('button');
    expect(more.getAttribute('aria-label')).toBe(T.ailmentMoreLabel(Number(more.textContent!.slice(1))));
    more.click();
    expect(pop.openId).toBe('pm:noel');
    expect(pop.el.parentElement).toBe(panel);
    const listed = [...pop.el.children].map((c) => [c.className, c.textContent]);
    expect(listed).toEqual([['slx-mech slx-mech-heat', '熱度5'], ['slx-ail slx-ail-bleed', '流血×2'], ['slx-ail slx-ail-burn', '灼燒3'],
      ['slx-ail slx-ail-poison', '中毒'], ['slx-ail slx-ail-shock', '感電2'], ['slx-ail slx-ail-chill', '冰緩2']]);
    expect([...pop.el.querySelectorAll('img.slx-chip-ico')].map((i) => i.getAttribute('src'))).toEqual([art.ailmentIcon('bleed'), art.ailmentIcon('chill')]);
    // The row itself is untouched: with the bleed's icon only her mechanic word fits before the +N.
    expect([...panel.querySelectorAll('.slx-pm-ail > *')].map((c) => c.textContent)).toEqual(['熱度5', '+5']);
    panel.querySelector<HTMLElement>('.slx-ail-more')!.click();
    expect(pop.openId).toBeNull();
    expect(pop.el.hidden).toBe(true);
    pop.dispose(); bar.el.remove();
  });

  it('a redraw keeps an open list open with the new words; once nothing folds, it closes', () => {
    const pop = new MorePopover();
    const bar = new PartyBar(NO_ART, pop);
    document.body.append(bar.el);
    bar.update([m('noel', 30, { ailments: [...five] }), m('rin', 30, { ailments: [...five] })]);
    bar.el.querySelector<HTMLElement>('[data-key=noel] .slx-ail-more')!.click();
    bar.update([m('noel', 30, { ailments: five.slice(0, 4) }), m('rin', 30, { ailments: [...five] })]);
    expect(pop.openId).toBe('pm:noel');
    expect([...pop.el.children].map((c) => c.textContent)).toEqual(['流血×2', '灼燒3', '中毒', '感電2']);
    expect(bar.el.querySelector('[data-key=noel] .slx-ail-more')!.getAttribute('aria-expanded')).toBe('true');
    expect(bar.el.querySelector('[data-key=rin] .slx-ail-more')!.getAttribute('aria-expanded')).toBe('false');
    bar.update([m('noel', 30, { ailments: [{ id: 'poison' }] }), m('rin', 30, { ailments: [...five] })]);
    expect(pop.openId).toBeNull();
    pop.dispose(); bar.el.remove();
  });

  it('without a popover (the labyrinth) the +N is still the plain folded word with its title', () => {
    const bar = new PartyBar(NO_ART);
    bar.update([m('noel', 30, { ailments: [...five] })]);
    const more = bar.el.querySelector<HTMLElement>('.slx-ail-more')!;
    expect(more.title).toBe('流血×2、灼燒3、中毒、感電2、冰緩2');
    expect(more.hasAttribute('role')).toBe(false);
  });
});

describe('PartyBar art that lands late (ui2/lateArt)', () => {
  it('only the panel drawn without a picture is drawn again when it lands; the others, and other art, change nothing', () => {
    const landed = new Set<string>();
    const bar = new PartyBar({ has: (u) => landed.has(u) });
    bar.update([m('scarlet'), m('noel', 30, { ailments: [{ id: 'poison' }] })]);
    const panel = (k: string) => bar.el.querySelector<HTMLElement>(`.slx-pm[data-key=${k}]`)!;
    const ailOf = (k: string) => panel(k).querySelector('.slx-pm-ail')!;
    const noelWord = ailOf('noel').firstElementChild;
    const scarletName = panel('scarlet').querySelector('.slx-pm-name')!.firstChild;
    const seen = new MutationObserver(() => {});
    seen.observe(bar.el, { subtree: true, childList: true, attributes: true, characterData: true });
    bar.artArrived(new Set([art.portrait('sylvie', 'normal'), art.ailmentIcon('burn')]));   // no panel waits for these
    expect(seen.takeRecords()).toEqual([]);
    // Her face lands: put in her panel only; Noel's row is not laid out again.
    landed.add(art.portrait('scarlet', 'normal'));
    bar.artArrived(new Set([art.portrait('scarlet', 'normal')]));
    expect(panel('scarlet').querySelector('img.sl-portrait')!.getAttribute('src')).toBe(art.portrait('scarlet', 'normal'));
    expect(panel('noel').querySelector('img.sl-portrait')).toBeNull();
    expect(ailOf('noel').firstElementChild).toBe(noelWord);
    // The poison icon lands in a later batch: Noel's row gains it, Scarlet's panel is left as it is.
    landed.add(art.ailmentIcon('poison'));
    bar.artArrived(new Set([art.ailmentIcon('poison')]));
    expect(ailOf('noel').querySelector('img.slx-chip-ico')!.getAttribute('src')).toBe(art.ailmentIcon('poison'));
    expect(panel('scarlet').querySelector('.slx-pm-name')!.firstChild).toBe(scarletName);
    seen.disconnect();
  });
});
