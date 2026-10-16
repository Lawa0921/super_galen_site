import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { statsOf } from '../../engine/party';
import type { AnyStat } from '../../engine/types';
import { STAT_CATEGORIES } from '../../engine/stats';
import { constRng, plainItem } from '../../engine/testing';
import { art } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { STATUS_TABS, resetStatsView } from './statusTabs';
import { StatusScene } from './status';
import { T } from '../../data/text.zh-TW';

/** A shown number back to a number: the minus sign reads as a minus. */
const num = (t: string | null) => Number((t ?? '').replace('−', '-'));

function setup(arg?: string, artIndex: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.party.roster.scarlet.equip.weapon = plainItem('iron-sword', 2);
  game.state.nextUid = 3;
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new StatusScene({ game, art: artIndex, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
  s.enter(root);
  const body = () => root.querySelector('.slx-status-body')!.textContent!;
  const tab = () => root.querySelector('.slx-tab-sel')!.textContent;
  const name = () => root.querySelector('.slx-status-name')!.textContent!;
  return { game, go, root, s, body, tab, name };
}

describe('StatusScene', () => {
  beforeEach(() => resetStatsView());

  it('opens on the member it was given, with a large standee and the stats tab', () => {
    const { root, name, tab, body, game } = setup('scarlet', { has: (u) => u === art.standee('scarlet') });
    expect(name()).toContain('絲嘉蕾');
    expect(name()).toContain('火焰騎士');
    expect(root.querySelector('.slx-status-standee')!.getAttribute('src')).toBe(art.standee('scarlet'));
    expect(tab()).toBe('能力');
    const st = statsOf(game.state.party.roster.scarlet);
    expect(body()).toContain('攻擊');
    expect(root.querySelector('[data-stat=atk] .slx-total')!.textContent).toBe(String(st.atk));
    expect(root.querySelector('[data-stat=atk] .slx-gear')!.textContent).toMatch(/^\+\d+$/);   // the sword's bonus
    expect(body()).toContain('站位 前排');
    expect(body()).toContain('近戰（100%）');
  });

  it('switches tabs with left/right and the mouse', () => {
    const { s, root, tab, body } = setup('noel');
    s.onAction('right');
    expect(tab()).toBe('裝備');
    expect(body()).toContain('武器');
    s.onAction('right');
    expect(tab()).toBe('技能');
    expect(body()).toContain('火之星彈');
    expect(body()).toContain('TP 4');
    (root.querySelector('[data-tab=ultimate]') as HTMLElement).click();
    expect(tab()).toBe('絕技');
    expect(body()).toContain('流星燈火');
    s.onAction('left'); s.onAction('left'); s.onAction('left');
    expect(tab()).toBe('能力');
    s.onAction('left');                                   // wraps
    expect(tab()).toBe('絕技');
  });

  it('pages through the recruited members with Q/E and the arrows, keeping the tab', () => {
    const { s, root, name, tab } = setup('scarlet');
    s.onAction('right');
    s.onAction('next');
    expect(name()).toContain('千鶴');                      // recruited order: scarlet, chizuru, liz, noel, selene
    expect(tab()).toBe('裝備');
    s.onAction('prev');
    expect(name()).toContain('絲嘉蕾');
    (root.querySelector('.slx-status-prev') as HTMLElement).click();
    expect(name()).toContain('瑟蕾');
  });

  it('defaults to the first member on the field and returns where it came from', () => {
    const { s, go, name } = setup();
    expect(name()).toContain('絲嘉蕾');
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('guild');
  });

  it('plays the standee entrance only when the member changes, with an aura in their colour', () => {
    const { s, root } = setup('scarlet', { has: (u) => u.includes('standee') });
    const first = root.querySelector('.slx-status-standee');
    expect(root.querySelector('.slx-status-art')!.classList.contains('slx-aura-scarlet')).toBe(true);
    s.onAction('right');                                 // another tab: same picture, no replay
    expect(root.querySelector('.slx-status-standee')).toBe(first);
    s.onAction('next');                                  // another member: a fresh picture slides in
    expect(root.querySelector('.slx-status-standee')).not.toBe(first);
    expect(root.querySelector('.slx-status-art')!.classList.contains('slx-aura-chizuru')).toBe(true);
    expect(root.querySelectorAll('.slx-status-art .slx-mote').length).toBeGreaterThan(0);
  });

  it('has a tab list that new systems can join, each carrying its own label and keys', () => {
    expect(STATUS_TABS.map((t) => t.id)).toEqual(['stats', 'gear', 'skills', 'ultimate']);
    expect(STATUS_TABS.every((t) => t.label.length > 0)).toBe(true);
    const extra = { id: 'test', label: '測試', onAction: vi.fn(() => true), render: () => document.createElement('div') };
    STATUS_TABS.push(extra);
    try {
      const { s, tab } = setup('scarlet');
      for (let i = 0; i < 4; i++) s.onAction('right');
      expect(tab()).toBe('測試');
      s.onAction('confirm');
      expect(extra.onAction).toHaveBeenCalledWith('confirm', expect.anything(), 'scarlet');
    } finally {
      STATUS_TABS.pop();
    }
  });

  it('shows no melee percentage for a member on reserve', () => {
    const { body } = setup('scarlet');
    expect(body()).toContain('近戰（100%）');
    const r = setup('scarlet');
    r.game.state.party.grid[0] = null;
    r.s.onAction('next'); r.s.onAction('prev');
    expect(r.body()).toContain('站位 待命');
    expect(r.body()).not.toContain('%）');
  });

  it('the gear page lists nine slots with rarity classes', () => {
    const { s, game, root } = setup('scarlet');
    game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 9), rarity: 'rare' };
    s.onAction('right');
    expect(root.querySelectorAll('.slx-tab-gear .slx-gear-row')).toHaveLength(9);
    expect(root.querySelector('.slx-tab-gear .slx-gear-name')!.classList.contains('slx-rarity-rare')).toBe(true);
    expect(root.querySelector('.slx-tab-gear .slx-gear-row:nth-child(2) .slx-gear-name')!.classList.contains('slx-rarity-rare')).toBe(false);
  });

  it('the gear page marks all six rarities with their own class', () => {
    const { s, game, root } = setup('scarlet');
    const eq = game.state.party.roster.scarlet.equip;
    eq.weapon = { ...plainItem('iron-sword', 10), rarity: 'common' };
    eq.offhand = { ...plainItem('wooden-buckler', 11), rarity: 'magic' };
    eq.head = { ...plainItem('leather-cap', 12), rarity: 'rare' };
    eq.neck = { ...plainItem('moss-charm', 13), rarity: 'legendary', special: 'lg-scarlet' };
    eq.ring1 = { ...plainItem('copper-ring', 14), rarity: 'unique', special: 'blaze-ember-ring' };
    eq.body = { ...plainItem('cloth-robe', 15), rarity: 'set', special: 'set-blaze-body' };
    game.state.nextUid = 16;
    s.onAction('right');
    const cls = (slot: number) => [...root.querySelectorAll('.slx-tab-gear .slx-gear-row')][slot].querySelector('.slx-gear-name')!.classList;
    const want: [number, string][] = [[0, 'common'], [1, 'magic'], [2, 'rare'], [6, 'legendary'], [7, 'unique'], [3, 'set']];
    for (const [i, r] of want) {
      expect(cls(i).contains(`slx-rarity-${r}`), r).toBe(true);
      for (const other of want.map(([, o]) => o).filter((o) => o !== r)) expect(cls(i).contains(`slx-rarity-${other}`), `${r} not ${other}`).toBe(false);
    }
  });

  it('the gear page names each slot and shows the rarity word and the item lines, like the equip page', () => {
    const { s, game, root } = setup('scarlet');
    game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 9), rarity: 'rare', affixes: [{ key: 'crit', value: 4 }] };
    s.onAction('right');
    const rows = [...root.querySelectorAll('.slx-tab-gear .slx-gear-row')];
    expect(rows.map((r) => r.querySelector('.slx-gear-slot')!.textContent)).toEqual(['武器', '副手', '頭部', '身體', '手部', '腳部', '項鍊', '戒指 1', '戒指 2']);
    expect(rows[0].querySelector('.slx-gear-name')!.textContent).toContain('・稀有');
    expect(rows[0].querySelector('.slx-gear-bonus')!.textContent).toContain('暴擊率 +4%');   // a secondary affix, from itemLines
    expect(rows[1].querySelector('.slx-gear-name')!.textContent).toBe('（未裝備）');
  });

  describe('the stats tab', () => {
    const stub = vi.fn();
    beforeEach(() => { stub.mockClear(); HTMLElement.prototype.scrollIntoView = stub; });
    afterEach(() => { delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView; });

    const cur = (root: HTMLElement) => root.querySelector('.slx-row-cur');
    const head = (root: HTMLElement, cat: string) => root.querySelector(`[data-cat=${cat}] .slx-stat-cat-head`) as HTMLElement;
    const bodyEl = (root: HTMLElement) => root.querySelector('.slx-status-body') as HTMLElement;

    it('six collapsible categories; rows show base, growth, gear, set and primary sources', () => {
      const { root, game, s } = setup('scarlet');
      game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 2), affixes: [{ key: 'str', value: 3 }] };
      s.onAction('next'); s.onAction('prev');                                // redraw with the new sword
      const cats = [...root.querySelectorAll('section.slx-stat-cat')];
      expect(cats.map((c) => c.getAttribute('data-cat'))).toEqual(STAT_CATEGORIES.map((c) => c.id));
      expect(cats.map((c) => c.querySelector('.slx-stat-cat-head')!.textContent)).toEqual(['主屬性', '攻擊', '防禦', '元素', '資源', '其他'].map((n) => expect.stringContaining(n)));
      expect(cats.map((c) => c.querySelector('.slx-stat-cat-head')!.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
      expect(root.querySelector('[data-cat=defense] tbody')).toBeNull();     // folded: no rows to land on
      const cols = [...root.querySelectorAll('[data-cat=attack] thead th')].map((th) => th.textContent);
      expect(cols).toEqual(['', '基礎', '成長', '裝備', '套裝', '主屬性', '上限', '合計']);
      // str is scarlet's affinity: 3 str gives 4.5 atk, shown whole so the parts add up to the floored total.
      const atk = root.querySelector('[data-stat=atk]')!;
      expect(atk.querySelector('.slx-primary')!.textContent).toMatch(/^\+\d+$/);
      const parts = [...atk.querySelectorAll('td:not(.slx-total)')].map((td) => (td.textContent === '—' ? 0 : num(td.textContent)));
      const total = statsOf(game.state.party.roster.scarlet).atk;
      expect(atk.querySelector('.slx-total')!.textContent).toBe(String(total));
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(root.querySelector('[data-stat=str] .slx-gear')!.textContent).toBe('+3');
      expect(root.querySelector('[data-stat=eliteDmg]')!.classList.contains('slx-zero')).toBe(true);
      expect(root.querySelector('[data-stat=atk]')!.classList.contains('slx-zero')).toBe(false);
      expect(root.querySelector('[data-stat=critDmg] .slx-total')!.textContent).toBe('50%');
    });

    /** The number in each source cell and the 上限 cell (an em dash is 0), and the shown total without its unit. */
    const nums = (tr: Element) => {
      const parts = [...tr.querySelectorAll('td:not(.slx-total)')].map((td) => (td.textContent === '—' ? 0 : num(td.textContent)));
      return { parts, sum: parts.reduce((a, b) => a + b, 0), total: Number(tr.querySelector('.slx-total')!.textContent!.replace('%', '')) };
    };
    const wear = (s: StatusScene, game: Game, affixes: { key: AnyStat; value: number }[]) => {
      game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 2), affixes };
      s.onAction('next'); s.onAction('prev');
    };

    it('a capped total shows the cut in its 上限 column, and the columns still add up', () => {
      const { root, game, s } = setup('scarlet');
      wear(s, game, [{ key: 'agi', value: 3 }, { key: 'crit', value: 70 }]);  // 70.6% crit, cap 60
      const crit = root.querySelector('[data-stat=crit]')!;
      expect(crit.querySelector('.slx-primary')!.textContent).toBe('+0.6');  // 3 agi x 0.2
      expect(crit.querySelector('.slx-cap')!.textContent).toBe('−10.6');
      expect(crit.querySelector('.slx-total')!.textContent).toBe('60%');
      expect(crit.querySelector('.slx-total')!.classList.contains('slx-capped')).toBe(true);
      const n = nums(crit);
      expect(n.sum).toBeCloseTo(n.total, 9);
      expect(n.total).toBe(60);
      expect(root.querySelector('[data-stat=atk] .slx-cap')!.textContent).toBe('—');   // uncapped rows leave it empty
    });

    it('a negative source floors the running sum, so the parts still add up', () => {
      const { root, game, s } = setup('scarlet');
      wear(s, game, [{ key: 'str', value: -1 }]);                           // affinity str: -1.5 atk
      const atk = root.querySelector('[data-stat=atk]')!;
      expect(atk.querySelector('.slx-primary')!.textContent).toBe('−2');     // 18 -> 16.5, shown 16
      const n = nums(atk);
      expect(n.total).toBe(statsOf(game.state.party.roster.scarlet).atk);
      expect(n.sum).toBe(n.total);
      expect(root.querySelector('[data-stat=str] .slx-gear')!.textContent).toBe('−1');
    });

    it('a mixed-sign row that totals 0 is shown as a zero row', () => {
      const { root, game, s } = setup('scarlet');
      wear(s, game, [{ key: 'str', value: -1 }, { key: 'armor', value: 3 }]);  // gear +3 armor, primary -3 armor
      head(root, 'defense').click();
      const armor = root.querySelector('[data-stat=armor]')!;
      expect(armor.querySelector('.slx-gear')!.textContent).toBe('+3');
      expect(armor.querySelector('.slx-primary')!.textContent).toBe('−3');
      expect(armor.querySelector('.slx-total')!.textContent).toBe('0');
      expect(armor.classList.contains('slx-zero')).toBe(true);
      expect(nums(armor).sum).toBe(0);
    });

    it('a fractional row: the parts add up to the shown total, not to rounded parts', () => {
      const { root, game, s } = setup('scarlet');
      wear(s, game, [{ key: 'crit', value: 0.35 }, { key: 'agi', value: 4 }]);  // 0.35 + 0.8 = 1.15, shown 1.1
      const crit = root.querySelector('[data-stat=crit]')!;
      expect(crit.querySelector('.slx-gear')!.textContent).toBe('+0.3');
      expect(crit.querySelector('.slx-primary')!.textContent).toBe('+0.8');
      expect(crit.querySelector('.slx-total')!.textContent).toBe('1.1%');
      const n = nums(crit);
      expect(n.sum).toBeCloseTo(n.total, 9);
    });

    it('a total that floors to zero is dimmed like one', () => {
      const { root, game, s } = setup('scarlet');
      wear(s, game, [{ key: 'crit', value: 0.04 }]);
      const crit = root.querySelector('[data-stat=crit]')!;
      expect(crit.querySelector('.slx-total')!.textContent).toBe('0%');
      expect(crit.classList.contains('slx-zero')).toBe(true);
    });

    it('only the stats tab offers Enter to fold in its key hint', () => {
      const { root, s } = setup('scarlet');
      const hint = () => root.querySelector('.slx-status-panel .slx-hint')!.textContent!;
      expect(hint()).toContain('Enter 摺疊');
      for (let i = 0; i < 3; i++) {
        s.onAction('right');
        expect(hint()).not.toContain('Enter');
        expect(hint()).toContain('↑↓ 捲動');
      }
      s.onAction('right');
      expect(hint()).toContain('Enter 摺疊');
    });

    it('a stale click on a closed sheet changes nothing', () => {
      const { root, s } = setup('scarlet');
      const stale = head(root, 'primary');
      s.exit();
      stale.click();
      expect(stale.getAttribute('aria-expanded')).toBe('true');
      const fresh = setup('scarlet');
      expect(head(fresh.root, 'primary').getAttribute('aria-expanded')).toBe('true');   // the shared fold state is untouched
    });

    it('moving back to the first heading brings the facts above it into view', () => {
      const { root, s } = setup('scarlet');
      s.onAction('down');
      bodyEl(root).scrollTop = 120;
      s.onAction('up');
      expect(cur(root)).toBe(head(root, 'primary'));
      expect(bodyEl(root).scrollTop).toBe(0);
    });

    it('up/down move the row cursor across headers and rows and keep it in view', () => {
      const { root, s } = setup('scarlet');
      expect(cur(root)).toBe(head(root, 'primary'));
      s.onAction('down');
      expect(cur(root)!.getAttribute('data-stat')).toBe('str');
      expect(stub).toHaveBeenCalledWith({ block: 'nearest' });
      expect(stub.mock.contexts.at(-1)).toBe(cur(root));
      for (let i = 0; i < 4; i++) s.onAction('down');                        // int, agi, wil, then the next header
      expect(cur(root)).toBe(head(root, 'attack'));
      s.onAction('up');
      expect(cur(root)!.getAttribute('data-stat')).toBe('wil');
      for (let i = 0; i < 10; i++) s.onAction('down');                       // the attack header and its 8 rows, then the folded defense header
      expect(cur(root)).toBe(head(root, 'defense'));
      s.onAction('down');                                                    // defense is folded: straight on to element
      expect(cur(root)).toBe(head(root, 'element'));
    });

    it('Enter on a header folds or opens it; other keys are not used', () => {
      const { root, s } = setup('scarlet');
      s.onAction('confirm');
      expect(head(root, 'primary').getAttribute('aria-expanded')).toBe('false');
      expect(root.querySelector('[data-stat=str]')).toBeNull();
      expect(cur(root)).toBe(head(root, 'primary'));
      s.onAction('confirm');
      expect(root.querySelector('[data-stat=str]')).not.toBeNull();
      s.onAction('down');
      s.onAction('confirm');                                                 // on a row Enter does nothing
      expect(head(root, 'primary').getAttribute('aria-expanded')).toBe('true');
      expect(STATUS_TABS[0].onAction!('confirm', {} as never, 'scarlet')).toBe(false);
      expect(STATUS_TABS[0].onAction!('menu' as never, {} as never, 'scarlet')).toBe(false);
    });

    it('folding keeps the scroll position', () => {
      const { root, s } = setup('scarlet');
      bodyEl(root).scrollTop = 120;
      s.onAction('confirm');
      expect(head(root, 'primary').getAttribute('aria-expanded')).toBe('false');
      expect(bodyEl(root).scrollTop).toBe(120);
    });

    it('a new tab or a new member starts at the top', () => {
      const { root, s } = setup('scarlet');
      bodyEl(root).scrollTop = 120;
      s.onAction('next');
      expect(bodyEl(root).scrollTop).toBe(0);
      bodyEl(root).scrollTop = 120;
      s.onAction('right');
      expect(bodyEl(root).scrollTop).toBe(0);
    });

    it('other tabs still scroll the body with up/down', () => {
      const { root, s } = setup('noel');
      s.onAction('right'); s.onAction('right');
      s.onAction('down');
      expect(bodyEl(root).scrollTop).toBe(32);
      s.onAction('up');
      expect(bodyEl(root).scrollTop).toBe(0);
    });

    it('fold state survives paging to another member', () => {
      const { root, s } = setup('scarlet');
      s.onAction('confirm');                                                 // fold primary
      s.onAction('down');                                                    // cursor to the attack header
      s.onAction('next');
      expect(head(root, 'primary').getAttribute('aria-expanded')).toBe('false');
      expect(cur(root)).toBe(head(root, 'attack'));
      s.onAction('prev');
      expect(head(root, 'primary').getAttribute('aria-expanded')).toBe('false');
    });

    it('mouse and touch reach every header and row', () => {
      const { root } = setup('scarlet');
      head(root, 'defense').click();
      expect(head(root, 'defense').getAttribute('aria-expanded')).toBe('true');
      expect(cur(root)).toBe(head(root, 'defense'));
      const row = root.querySelector('[data-stat=armor]') as HTMLElement;
      row.dispatchEvent(new Event('pointermove'));
      expect(cur(root)!.getAttribute('data-stat')).toBe('armor');
      (root.querySelector('[data-stat=hp]') as HTMLElement).click();
      expect(cur(root)!.getAttribute('data-stat')).toBe('hp');
      head(root, 'defense').click();
      expect(head(root, 'defense').getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('the skills tab shows each skill as this member casts it: a worn power changes its target, tpCost its price', () => {
    const { root, s, game, body } = setup('noel');
    s.onAction('right'); s.onAction('right');
    const fire = () => root.querySelector('[data-skill=fire-star]')!;
    expect(fire().querySelector('.slx-skill-target')!.textContent).toBe('敵方單體');
    expect(fire().querySelector('.slx-skill-cost')!.textContent).toBe('TP 4');
    const noel = game.state.party.roster.noel;
    noel.equip.ring1 = { ...plainItem('moss-charm', 7), rarity: 'legendary', special: 'lg-noel' };
    noel.equip.neck = { ...plainItem('moss-charm', 8), affixes: [{ key: 'tpCost', value: 50 }] };
    s.onAction('next'); s.onAction('prev');
    expect(fire().querySelector('.slx-skill-target')!.textContent).toBe('敵方全體');
    expect(fire().querySelector('.slx-skill-power')!.textContent).toContain('火之星彈改為打全體');
    expect(fire().querySelector('.slx-skill-cost')!.textContent).toBe('TP 2');
    expect(body()).toContain('TP 2');
  });

  it('the skills tab lists only learned skills with their rank', () => {
    const { root, s, game, body } = setup('noel');
    s.onAction('right'); s.onAction('right');
    expect(body()).toContain('火之星彈');
    expect(root.querySelector('[data-skill=fire-star] .slx-skill-rank')!.textContent).toBe('1／3');
    expect(body()).not.toContain('冰之星彈');
    expect(root.querySelector('[data-skill=ice-star]')).toBeNull();
    game.state.party.roster.noel.tree = { 'fire-star': 2, 'ice-star': 1, 'noel-fire-up': 1 };
    s.onAction('next'); s.onAction('prev');
    expect(root.querySelector('[data-skill=fire-star] .slx-skill-rank')!.textContent).toBe('2／3');
    expect(root.querySelector('[data-skill=ice-star] .slx-skill-rank')!.textContent).toBe('1／3');
    expect(root.querySelector('[data-skill=noel-fire-up]')).toBeNull();   // a mod node is not a skill of its own
  });

  it('the gear tab marks a power the member has not learned as 尚未習得', () => {
    const { root, s, game } = setup('noel');
    game.state.party.roster.noel.equip.neck = { ...plainItem('moss-charm', 7), rarity: 'legendary', special: 'frost-bloom-neck' };
    s.onAction('right');
    const power = () => root.querySelector('.slx-tab-gear .slx-gear-power')!;
    expect(power().textContent).toContain(T.gear.notLearned);
    expect(power().classList.contains('slx-line-off')).toBe(false);
    game.state.party.roster.noel.tree = { 'fire-star': 1, 'ice-star': 1 };
    s.onAction('next'); s.onAction('prev');
    expect(power().textContent).not.toContain(T.gear.notLearned);
    expect(power().classList.contains('slx-line-off')).toBe(false);
    // Outside her tree: dimmed, and not called unlearned.
    const other = setup('scarlet');
    other.game.state.party.roster.scarlet.equip.neck = { ...plainItem('moss-charm', 7), rarity: 'legendary', special: 'frost-bloom-neck' };
    other.s.onAction('right');
    const off = other.root.querySelector('.slx-tab-gear .slx-gear-power')!;
    expect(off.classList.contains('slx-line-off')).toBe(true);
    expect(off.textContent).not.toContain(T.gear.notLearned);
  });
});
