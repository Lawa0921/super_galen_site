import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';
import { runeMark } from './runeArt';
import { Dialogue, MenuView, QtyView, backControl, confirmBox, richNodes, richText, type Rich } from './widgets';

const mk = () => new Menu([{ id: 'a', label: '冒險者公會' }, { id: 'b', label: '道具店', disabled: true }, { id: 'c', label: '旅館' }]);

describe('MenuView', () => {
  it('renders options, moves with keys, picks with confirm', () => {
    const pick = vi.fn(); const moved = vi.fn();
    const v = new MenuView(mk(), { pick, moved });
    const opts = [...v.el.querySelectorAll('[role=option]')];
    expect(opts.map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館']);
    expect(opts[1].getAttribute('aria-disabled')).toBe('true');
    expect(v.onAction('down')).toBe(true);
    expect(v.el.querySelector('[aria-selected=true]')!.textContent).toBe('旅館');
    expect(moved).toHaveBeenCalledTimes(1);
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    expect(v.el.querySelector('button, select')).toBeNull();
  });

  it('flashes the option that was picked', () => {
    const v = new MenuView(mk(), { pick: vi.fn() });
    v.onAction('confirm');
    expect(v.el.querySelector('[aria-selected=true]')!.classList.contains('slx-picked')).toBe(true);
  });

  it('ignores a resting pointer that a newly opened window appears under', () => {
    const pick = vi.fn();
    const v = new MenuView(mk(), { pick });
    v.el.querySelectorAll('[role=option]')[2].dispatchEvent(new Event('pointerenter'));
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('follows the pointer, so Enter confirms the hovered option', () => {
    const pick = vi.fn();
    const v = new MenuView(mk(), { pick });
    const opts = v.el.querySelectorAll('[role=option]');
    opts[2].dispatchEvent(new Event('pointermove'));
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    opts[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("a row's rightClass is added to its right column, and a row without one keeps plain slx-right", () => {
    const v = new MenuView(new Menu([{ id: 'a', label: 'A', right: '1 G', rightClass: 'slx-lack' }, { id: 'b', label: 'B', right: '2 G' }]), { pick: vi.fn() });
    const [a, b] = [...v.el.querySelectorAll('.slx-right')];
    expect(a.className).toBe('slx-right slx-lack');
    expect(b.className).toBe('slx-right');
  });

  it('passes cancel to its owner', () => {
    const cancel = vi.fn();
    const v = new MenuView(mk(), { pick: vi.fn(), cancel });
    expect(v.onAction('cancel')).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogue', () => {
  afterEach(() => vi.useRealTimers());

  it('types out, completes on the first confirm and closes on the second', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    const done = vi.fn();
    void d.say('露米亞', '暮霧又濃了些。').then(done);
    expect(d.el.hidden).toBe(false);
    expect(d.el.querySelector('.slx-name')!.textContent).toBe('露米亞');
    await vi.advanceTimersByTimeAsync(100);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧');
    expect(d.onAction('confirm')).toBe(true);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧又濃了些。');
    expect(done).not.toHaveBeenCalled();
    d.onAction('confirm');
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalledTimes(1);
    expect(d.el.hidden).toBe(true);
    expect(d.busy()).toBe(false);
  });

  it('marks the line busy while it types, so screen readers read it once when complete', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    void d.say('', '暮霧又濃了些。');
    expect(d.el.getAttribute('aria-busy')).toBe('true');
    d.onAction('confirm');
    expect(d.el.getAttribute('aria-busy')).toBe('false');
  });

  it('settles a line that a newer line replaces, so nothing waits forever', async () => {
    const d = new Dialogue(Infinity);
    const first = vi.fn();
    void d.say('', '一').then(first);
    void d.say('', '二');
    await Promise.resolve();
    expect(first).toHaveBeenCalled();
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('二');
  });

  it('ignores input when idle and shows text at once when the speed is instant', async () => {
    const d = new Dialogue(Infinity);
    expect(d.onAction('confirm')).toBe(false);
    void d.say('', '立即');
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('立即');
  });
});

describe('confirmBox', () => {
  it('answers yes or no and treats cancel as no', () => {
    const on = vi.fn();
    const box = confirmBox('要花 120 G 住宿嗎？', on);
    expect(box.el.textContent).toContain('要花 120 G 住宿嗎？');
    box.view.onAction('confirm');
    expect(on).toHaveBeenLastCalledWith(true);
    box.view.onAction('cancel');
    expect(on).toHaveBeenLastCalledWith(false);
  });
});

describe('MenuView pointer guard', () => {
  it('ignores clicks and hovers while its window is inert', () => {
    const pick = vi.fn();
    const v = new MenuView(mk(), { pick });
    const host = document.createElement('div'); host.append(v.el); host.setAttribute('inert', '');
    const opts = v.el.querySelectorAll('[role=option]');
    opts[2].dispatchEvent(new Event('pointermove'));
    (opts[2] as HTMLElement).click();
    expect(pick).not.toHaveBeenCalled();
    expect(v.menu.cursor).toBe(0);
  });
});

describe('MenuView columns', () => {
  it('renders an icon and a right-hand column without changing the label', () => {
    const v = new MenuView(new Menu([{ id: 'potion', label: '回復藥', icon: '/assets/games/starlantern/icon/potion.png', right: '30 G' }]), { pick: vi.fn() });
    const li = v.el.querySelector('[role=option]')!;
    expect(li.querySelector('img')!.getAttribute('src')).toBe('/assets/games/starlantern/icon/potion.png');
    expect(li.querySelector('.slx-label')!.textContent).toBe('回復藥');
    expect(li.querySelector('.slx-right')!.textContent).toBe('30 G');
  });
});

describe('QtyView', () => {
  it('steps by 1 and 10, clamps to 1..max and reports the result', () => {
    const change = vi.fn(); const done = vi.fn(); const cancel = vi.fn();
    const q = new QtyView(12, { change, done, cancel });
    expect(q.qty).toBe(1);
    q.onAction('left'); expect(q.qty).toBe(1);
    q.onAction('right'); q.onAction('right'); expect(q.qty).toBe(3);
    q.onAction('up'); expect(q.qty).toBe(12);
    q.onAction('down'); expect(q.qty).toBe(2);
    expect(change).toHaveBeenLastCalledWith(2);
    expect(q.el.textContent).toContain('2');
    q.onAction('confirm'); expect(done).toHaveBeenCalledWith(2);
    q.onAction('cancel'); expect(cancel).toHaveBeenCalled();
  });

  it('shows the total price and how to use it when given a unit price', () => {
    const q = new QtyView(10, { change: vi.fn(), done: vi.fn(), cancel: vi.fn() }, 20);
    expect(q.el.querySelector('.slx-qty-total')!.textContent).toBe('20 G');
    q.onAction('right');
    expect(q.el.querySelector('.slx-qty-total')!.textContent).toBe('40 G');
    expect(q.el.querySelector('.slx-hint')!.textContent).toContain('±10');
  });

  it('says its keys in three lines, with arrows Cubic 11 has (legibility Task 1)', () => {
    const q = new QtyView(10, { change: vi.fn(), done: vi.fn(), cancel: vi.fn() }, 20);
    expect(q.el.querySelector('.slx-hint')!.textContent).toBe('←→ ±1\n↑↓ ±10\n點數字 決定');
    expect(q.el.querySelector('.slx-qty-down')!.textContent).toBe('←');   // spaced by margins, not spaces
    expect(q.el.querySelector('.slx-qty-up')!.textContent).toBe('→');
  });
});

describe('MenuView scrolling', () => {
  it('shows a window of rows that follows the cursor, with more-above/below markers', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: `項目${i}` }));
    const v = new MenuView(new Menu(items), { pick: vi.fn() }, 5);
    const labels = () => [...v.el.querySelectorAll('[role=option] .slx-label')].map((o) => o.textContent);
    expect(labels()).toEqual(['項目0', '項目1', '項目2', '項目3', '項目4']);
    expect(v.el.querySelector('.slx-more-up')).toBeNull();
    expect(v.el.querySelector('.slx-more-down')).not.toBeNull();
    for (let i = 0; i < 6; i++) v.onAction('down');
    expect(labels()).toEqual(['項目2', '項目3', '項目4', '項目5', '項目6']);
    expect(v.el.querySelector('[aria-selected=true] .slx-label')!.textContent).toBe('項目6');
    expect(v.el.querySelector('.slx-more-up')).not.toBeNull();
    v.onAction('up'); v.onAction('up'); v.onAction('up'); v.onAction('up'); v.onAction('up');
    expect(labels()[0]).toBe('項目1');
    v.onAction('up'); v.onAction('up');         // wraps to the last item
    expect(labels()).toEqual(['項目7', '項目8', '項目9', '項目10', '項目11']);
  });

  it('a pointer click on a visible row picks that item, not the row index', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: `項目${i}` }));
    const pick = vi.fn();
    const v = new MenuView(new Menu(items), { pick }, 5);
    for (let i = 0; i < 8; i++) v.onAction('down');
    (v.el.querySelectorAll('[role=option]')[0] as HTMLElement).click();
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: '4' }));
  });
});

describe('mouse interaction', () => {
  afterEach(() => vi.useRealTimers());

  it('a click on the dialogue completes the line, shows the continue mark, then closes it', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    const done = vi.fn();
    void d.say('安娜', '歡迎回來。').then(done);
    await vi.advanceTimersByTimeAsync(60);
    expect(d.el.querySelector('.slx-next')!.hasAttribute('hidden')).toBe(true);
    d.el.click();
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('歡迎回來。');
    expect(d.el.querySelector('.slx-next')!.hasAttribute('hidden')).toBe(false);
    d.el.click();
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('the quantity window steps with the arrows and confirms when the number is clicked', () => {
    const done = vi.fn();
    const q = new QtyView(5, { change: vi.fn(), done, cancel: vi.fn() });
    (q.el.querySelector('.slx-qty-up') as HTMLElement).click();
    (q.el.querySelector('.slx-qty-up') as HTMLElement).click();
    (q.el.querySelector('.slx-qty-down') as HTMLElement).click();
    (q.el.querySelector('.slx-qty-n') as HTMLElement).click();
    expect(done).toHaveBeenCalledWith(2);
  });

  it('a back control reports a click as cancel and ignores clicks while inert', () => {
    const onBack = vi.fn();
    const b = backControl(onBack);
    expect(b.getAttribute('role')).toBe('button');
    expect(b.textContent).toBe('返回');
    b.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    b.setAttribute('inert', '');
    b.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogue rich lines', () => {
  afterEach(() => vi.useRealTimers());

  it('types a line with coloured parts, keeping each part in its span as it appears', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    void d.say('', ['打開寶箱：', { text: '鐵劍', cls: 'slx-rarity-rare' }, '。']);
    await vi.advanceTimersByTimeAsync(300);   // 6 characters
    const text = d.el.querySelector('.slx-text')!;
    expect(text.textContent).toBe('打開寶箱：鐵');
    expect(text.querySelector('.slx-rarity-rare')!.textContent).toBe('鐵');
    d.onAction('confirm');
    expect(text.textContent).toBe('打開寶箱：鐵劍。');
    expect(text.querySelector('.slx-rarity-rare')!.textContent).toBe('鐵劍');
  });
});

describe('rich parts with an icon (plan 5d Task 7)', () => {
  const SRC = '/assets/games/starlantern/gear/iron-sword.png';
  const line: Rich = ['拾到', { text: '鐵劍', cls: 'slx-gear-drop slx-rarity-rare', icon: SRC }, '。'];
  const typed = (n: number) => { const p = document.createElement('p'); p.append(...richNodes(line, n)); return p; };

  it('a rich part with an icon shows it once its first character is typed', () => {
    expect(typed(0).querySelectorAll('img')).toHaveLength(0);
    expect(typed(2).querySelectorAll('img')).toHaveLength(0);                 // only the words before it so far
    const one = typed(3);
    expect(one.querySelectorAll('img')).toHaveLength(1);
    expect(one.textContent).toBe('拾到鐵');
    const img = one.querySelector('img')!;
    expect(img.className).toBe('slx-ico slx-gear-ico');
    expect(img.getAttribute('src')).toBe(SRC);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.nextElementSibling!.className).toBe('slx-gear-drop slx-rarity-rare');
    expect(typed(Infinity).querySelectorAll('img')).toHaveLength(1);
    expect(richText(line)).toBe('拾到鐵劍。');                                  // the icon adds no text
  });

  it('a dialogue line types its icon in with the part', async () => {
    vi.useFakeTimers();
    try {
      const d = new Dialogue(20);
      void d.say('', [{ text: '鐵劍', cls: 'slx-rarity-rare', icon: SRC }]);
      const text = d.el.querySelector('.slx-text')!;
      d.onAction('confirm');
      expect(text.querySelectorAll('img.slx-gear-ico')).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("a menu row's icon class is added to its icon", () => {
    const v = new MenuView(new Menu([{ id: 'a', label: '鐵劍', icon: SRC, iconCls: 'slx-gear-ico' }, { id: 'b', label: '回復藥', icon: '/x.png' }]), { pick: () => {} });
    const imgs = [...v.el.querySelectorAll('img')];
    expect(imgs.map((i) => i.className)).toEqual(['slx-ico slx-gear-ico', 'slx-ico']);
  });
});

describe('MenuView pointer scrolling', () => {
  const long = () => new Menu(Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, label: `row ${i}` })));

  it('reaches the last row of a scrolled list by clicking the ▼ marker, and back with ▲', () => {
    const pick = vi.fn();
    const v = new MenuView(long(), { pick }, 6);
    expect(v.el.querySelector('[data-id=r9]')).toBeNull();
    for (let i = 0; i < 10 && !v.el.querySelector('[data-id=r9]'); i++) (v.el.querySelector('.slx-more-down') as HTMLElement).click();
    const last = v.el.querySelector('[data-id=r9]') as HTMLElement;
    expect(last).not.toBeNull();
    last.click();
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'r9' }));
    for (let i = 0; i < 10 && !v.el.querySelector('[data-id=r0]'); i++) (v.el.querySelector('.slx-more-up') as HTMLElement).click();
    expect(v.el.querySelector('[data-id=r0]')).not.toBeNull();
  });

  it('scrolls with the mouse wheel', () => {
    const v = new MenuView(long(), { pick: vi.fn() }, 6);
    for (let i = 0; i < 6; i++) v.el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(v.el.querySelector('[data-id=r9]')).not.toBeNull();
    v.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(v.el.querySelector('[data-id=r3]')).not.toBeNull();
  });

  const wheel = (v: MenuView, deltaY: number, deltaMode = 0) => {
    const e = new WheelEvent('wheel', { deltaY, deltaMode, cancelable: true });
    v.el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const shown = (v: MenuView) => [...v.el.querySelectorAll('.slx-opt')].map((li) => li.getAttribute('data-id'));

  it('lets the wheel through at an edge: only a list that can move takes the wheel', () => {
    const v = new MenuView(long(), { pick: vi.fn() }, 6);
    expect(wheel(v, -100)).toBe(false);                       // already at the top
    expect(shown(v)[0]).toBe('r0');
    expect(wheel(v, 100)).toBe(true);
    for (let i = 0; i < 5; i++) wheel(v, 100);
    expect(shown(v).at(-1)).toBe('r9');
    expect(wheel(v, 100)).toBe(false);                        // already at the bottom
    const short = new MenuView(new Menu([{ id: 'a', label: 'a' }]), { pick: vi.fn() }, 6);
    expect(wheel(short, 100)).toBe(false);                    // nothing to scroll
  });

  it('adds up small trackpad deltas: one row per notch-sized sum, not one per event', () => {
    const v = new MenuView(long(), { pick: vi.fn() }, 6);
    for (let i = 0; i < 10; i++) wheel(v, 10);                // one 100px gesture in ten pieces
    expect(shown(v)[0]).toBe('r1');
    for (let i = 0; i < 9; i++) wheel(v, 10);
    expect(shown(v)[0]).toBe('r1');                           // 90px: not yet a row
    wheel(v, -10);                                            // turning back drops what had gathered
    wheel(v, 10);
    expect(shown(v)[0]).toBe('r1');
    wheel(v, 3, 1);                                           // a mouse in line mode: three lines are one notch
    expect(shown(v)[0]).toBe('r2');
  });

  it('ignores marker clicks and the wheel under an inert window', () => {
    const wrap = document.createElement('div');
    const v = new MenuView(long(), { pick: vi.fn() }, 6);
    wrap.append(v.el);
    wrap.setAttribute('inert', '');
    (v.el.querySelector('.slx-more-down') as HTMLElement).click();
    v.el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(v.el.querySelector('[data-id=r0]')).not.toBeNull();
  });
});

describe('confirmBox rich question', () => {
  it('keeps coloured parts of the question', () => {
    const box = confirmBox(['要丟掉 ', { text: '鐵劍・魔法', cls: 'slx-rarity-magic' }, ' 嗎？'], vi.fn());
    expect(box.el.querySelector('p')!.textContent).toBe('要丟掉 鐵劍・魔法 嗎？');
    expect(box.el.querySelector('.slx-rarity-magic')!.textContent).toBe('鐵劍・魔法');
  });
});

describe('Dialogue faces', () => {
  it('a line can carry a face on either side', () => {
    const d = new Dialogue(Infinity);
    void d.say('洛恩', '走吧。', { src: '/a.png', side: 'left' });
    const left = d.el.querySelector('img')!;
    expect(left.classList.contains('slx-talk-face')).toBe(true);
    expect(left.classList.contains('slx-talk-face--left')).toBe(true);
    expect(left.getAttribute('src')).toBe('/a.png');
    void d.say('凜', '嗯。', { src: '/b.png', side: 'right' });
    const faces = d.el.querySelectorAll('img');
    expect(faces).toHaveLength(1);
    expect(faces[0].classList.contains('slx-talk-face--right')).toBe(true);
    expect(faces[0].classList.contains('slx-talk-face--left')).toBe(false);
  });

  it('a line without a face shows no image', () => {
    const d = new Dialogue(Infinity);
    void d.say('洛恩', '走吧。', { src: '/a.png', side: 'left' });
    void d.say('', '風很冷。');
    expect(d.el.querySelector('img')).toBeNull();
  });

  it("a narration line can keep the last speaker's face, dimmed; the next face replaces it (staging S4)", () => {
    const d = new Dialogue(Infinity);
    void d.say('洛恩', '走吧。', { src: '/a.png', side: 'left' });
    const face = d.el.querySelector('img')!;
    void d.say('', '風很冷。', 'keep');
    expect(d.el.querySelector('img')).toBe(face);
    expect(face.classList.contains('slx-talk-face--dim')).toBe(true);
    void d.say('凜', '嗯。', { src: '/b.png', side: 'right' });
    const next = d.el.querySelectorAll('img');
    expect(next).toHaveLength(1);
    expect(next[0].getAttribute('src')).toBe('/b.png');
    expect(next[0].classList.contains('slx-talk-face--dim')).toBe(false);
  });

  it('keep with no face before shows no image', () => {
    const d = new Dialogue(Infinity);
    void d.say('', '風很冷。', 'keep');
    expect(d.el.querySelector('img')).toBeNull();
  });

  it('held, the box stays up between lines with its face; close() puts it away (staging S4)', async () => {
    const closed = vi.fn();
    const d = new Dialogue(Infinity, closed);
    d.hold(true);
    const said = d.say('洛恩', '走吧。', { src: '/a.png', side: 'left' });
    d.onAction('confirm');
    await said;
    expect(closed).toHaveBeenCalledTimes(1);
    expect(d.el.hidden).toBe(false);
    expect(d.el.querySelector('img')).not.toBeNull();
    d.hold(false);
    d.close();
    expect(d.el.hidden).toBe(true);
    expect(d.el.querySelector('img')).toBeNull();
  });

  it('close() leaves a line that is still waiting alone', () => {
    const d = new Dialogue(Infinity);
    void d.say('洛恩', '走吧。');
    d.close();
    expect(d.el.hidden).toBe(false);
  });

  it('memory style fades a sepia veil in over the screen behind the box, and out again (staging S5)', () => {
    const scene = document.createElement('div');
    const d = new Dialogue(Infinity);
    scene.append(d.el);
    d.setStyle('memory');
    const veil = scene.querySelector('.slx-veil-past')!;
    expect(veil).not.toBeNull();
    expect(veil.nextElementSibling).toBe(d.el);               // under the box, over everything before it
    expect(veil.classList.contains('slx-on')).toBe(true);
    d.setStyle('plain');
    expect(veil.parentElement).toBe(scene);                  // it stays, to fade out
    expect(veil.classList.contains('slx-on')).toBe(false);
    d.setStyle('memory');
    expect(scene.querySelectorAll('.slx-veil-past')).toHaveLength(1);
  });

  it('a place card shows where the scene is, over the screen and under the box; night dims the screen (staging S6)', () => {
    const scene = document.createElement('div');
    const d = new Dialogue(Infinity);
    scene.append(d.el);
    d.setPlace({ text: '月影旅館・深夜', night: true });
    const card = scene.querySelector('.slx-place-card')!;
    expect(card.textContent).toBe('月影旅館・深夜');
    const night = scene.querySelector('.slx-veil-night')!;
    expect(night.classList.contains('slx-on')).toBe(true);
    d.setStyle('memory');                                    // a veil made later still goes under the card
    expect([...scene.children].map((e) => e.classList[0] === 'slx-veil' ? e.classList[1] : e.classList[1] ?? e.classList[0])).toEqual(['slx-veil-night', 'slx-veil-past', 'slx-place-card', 'slx-talk']);
    d.setPlace({ text: '月影旅館・清晨' });
    expect(scene.querySelectorAll('.slx-place-card')).toHaveLength(1);
    expect(scene.querySelector('.slx-place-card')!.textContent).toBe('月影旅館・清晨');
    expect(night.classList.contains('slx-on')).toBe(false);
    d.setPlace(null);
    expect(scene.querySelector('.slx-place-card')).toBeNull();
  });

  it('memory style marks the box', () => {
    const d = new Dialogue(Infinity);
    d.setStyle('memory');
    expect(d.el.classList.contains('slx-talk--memory')).toBe(true);
    d.setStyle('plain');
    expect(d.el.classList.contains('slx-talk--memory')).toBe(false);
  });
});

describe('MenuView badges (plan 8g Task 7)', () => {
  it('a badge follows the label', () => {
    const marks = [runeMark({ id: 'spread', tier: 'magic' }, 14), runeMark({ id: 'flame', tier: 'rare' }, 14)];
    const v = new MenuView(new Menu([{ id: 'a', label: '火之星彈', marks, right: '4 TP' }, { id: 'b', label: '冰之星彈' }]), { pick: vi.fn() });
    const [a, b] = [...v.el.querySelectorAll('[role=option]')];
    const badge = a.querySelector('.slx-badge')!;
    expect([...badge.querySelectorAll('img')].map((e) => e.getAttribute('src'))).toEqual(marks.map((m) => m.src));
    expect(badge.textContent).toBe('');
    expect(badge.previousElementSibling!.classList.contains('slx-label')).toBe(true);
    expect(badge.nextElementSibling!.classList.contains('slx-right')).toBe(true);
    expect(b.querySelector('.slx-badge')).toBeNull();
  });
});
