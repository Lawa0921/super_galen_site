import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';
import { Dialogue, MenuView, QtyView, backControl, confirmBox } from './widgets';

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
