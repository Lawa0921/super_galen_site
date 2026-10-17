import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { rulesOf } from '../../data/characters';
import { statsOf, LEGACY_LINEUP } from '../../engine/party';
import type { AnyStat } from '../../engine/types';
import { STAT_CATEGORIES } from '../../engine/stats';
import { raiseTalent } from '../../engine/progression';
import { constRng, plainItem } from '../../engine/testing';
import { art } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { STATUS_TABS, resetStatsView, resetTalentView, resetTreeView } from './statusTabs';
import { StatusScene } from './status';
import { CHAINS } from '../../data/story/chains';
import { T } from '../../data/text.zh-TW';
import { SKILLS } from '../../data/skills';
import { NODES, TREES } from '../../data/trees';
import { BOARDS, KEYSTONES, TALENT_PER, TALENT_SCALE } from '../../data/talents';

/** A shown number back to a number: the minus sign reads as a minus. */
const num = (t: string | null) => Number((t ?? '').replace('−', '-'));

function setup(arg?: string, artIndex: ArtIndex = NO_ART, prep?: (game: Game) => void) {
  const game = new Game(constRng(0.5), null, undefined, 0, LEGACY_LINEUP);
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.party.roster.scarlet.equip.weapon = plainItem('iron-sword', 2);
  game.state.nextUid = 3;
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new StatusScene({ game, art: artIndex, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
  s.enter(root);
  const body = () => root.querySelector('.slx-status-body')!.textContent!;
  const tab = () => root.querySelector('.slx-tab-sel')!.textContent;
  const name = () => root.querySelector('.slx-status-name')!.textContent!;
  return { game, go, root, s, body, tab, name, sfx };
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

  it('a tab: arg opens that tab on the first active member, with the cursor revealed', () => {
    const reveal = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = reveal;
    try {
      for (const [id, label, node] of [['tree', '技能樹', '.slx-tree-node.slx-row-cur'], ['talent', '天賦', '.slx-talent-node.slx-row-cur']]) {
        reveal.mockClear();
        const { root, tab, name } = setup(`tab:${id}`);
        expect(tab()).toBe(label);
        expect(name()).toContain('絲嘉蕾');
        expect(root.querySelector(node)).not.toBeNull();
        expect(reveal).toHaveBeenCalled();
      }
    } finally {
      if (orig) Element.prototype.scrollIntoView = orig; else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('a tab: arg with an unknown tab falls back to the stats tab', () => {
    const { tab, name } = setup('tab:nope');
    expect(tab()).toBe('能力');
    expect(name()).toContain('絲嘉蕾');
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
    s.onAction('left'); s.onAction('left'); s.onAction('left'); s.onAction('left'); s.onAction('left');
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
    expect(STATUS_TABS.map((t) => t.id)).toEqual(['stats', 'gear', 'skills', 'tree', 'talent', 'ultimate']);
    expect(STATUS_TABS.every((t) => t.label.length > 0)).toBe(true);
    const extra = { id: 'test', label: '測試', onAction: vi.fn(() => true), render: () => document.createElement('div') };
    STATUS_TABS.push(extra);
    try {
      const { s, tab } = setup('scarlet');
      for (let i = 0; i < STATUS_TABS.length - 1; i++) s.onAction('right');
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

    it('the stats tab shows a 記憶 column', () => {
      const { root } = setup('scarlet', NO_ART, (g) => { g.state.party.roster.scarlet.memories = 3; });
      const heads = [...root.querySelectorAll('[data-cat=primary] thead th')].map((th) => th.textContent);
      expect(heads.indexOf(T.ui2.status.sources.memory)).toBe(heads.indexOf(T.ui2.status.sources.talent) + 1);
      expect(root.querySelector('[data-stat=str] .slx-memory')!.textContent).toBe('+' + 3 * CHAINS.scarlet.gain.str!);
    });

    it('six collapsible categories; rows show base, growth, gear, set, talent and primary sources', () => {
      const { root, game, s } = setup('scarlet');
      game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 2), affixes: [{ key: 'str', value: 3 }] };
      const raised = raiseTalent({ ...game.state.party.roster.scarlet, level: 6 }, 'scarlet-t00');   // scarlet-t00 is str
      if (!raised.ok) throw new Error(raised.reason);
      game.state.party.roster.scarlet = raised.member;
      s.onAction('next'); s.onAction('prev');                                // redraw with the new sword
      const cats = [...root.querySelectorAll('section.slx-stat-cat')];
      expect(cats.map((c) => c.getAttribute('data-cat'))).toEqual(STAT_CATEGORIES.map((c) => c.id));
      expect(cats.map((c) => c.querySelector('.slx-stat-cat-head')!.textContent)).toEqual(['主屬性', '攻擊', '防禦', '元素', '資源', '其他'].map((n) => expect.stringContaining(n)));
      expect(cats.map((c) => c.querySelector('.slx-stat-cat-head')!.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
      expect(root.querySelector('[data-cat=defense] tbody')).toBeNull();     // folded: no rows to land on
      const cols = [...root.querySelectorAll('[data-cat=attack] thead th')].map((th) => th.textContent);
      expect(cols).toEqual(['', '基礎', '成長', '裝備', '套裝', '天賦', '記憶', '主屬性', '上限', '合計']);
      expect(root.querySelector('[data-stat=str] .slx-talent')!.textContent).toBe(T.signed(TALENT_PER.str! * TALENT_SCALE));
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

    it('the stats tab shows the affinity', () => {
      const { root } = setup('noel');
      const primary = root.querySelector('[data-cat=primary]')!;
      const line = primary.querySelector('.slx-stat-affinity');
      expect(line!.textContent).toBe(T.ui2.status.affinity(T.gear.statName.int));
      expect(line!.previousElementSibling).toBe(head(root, 'primary'));       // right after the heading
      expect(T.ui2.status.affinity(T.ui2.status.affinityAll)).toBe('取向：全能');
      expect(root.querySelectorAll('.slx-stat-affinity')).toHaveLength(1);    // the primary section only
    });

    it("the hero's affinity reads 全能", () => {
      const { root, tab } = setup('hero', NO_ART, (game) => {
        const p = game.state.party;
        p.recruited.push('hero');
        p.grid[0] = 'hero';                                                    // swapped in for scarlet
      });
      expect(tab()).toBe('能力');
      const line = root.querySelector('[data-cat=primary] .slx-stat-affinity');
      expect(line!.textContent).toBe(T.ui2.status.affinity(T.ui2.status.affinityAll));
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

    it('only the stats tab offers Enter to fold in its key hint, and the tree tab Enter to spend', () => {
      const { root, s, tab } = setup('scarlet');
      const hint = () => root.querySelector('.slx-status-panel .slx-hint')!.textContent!;
      expect(hint()).toContain('Enter 摺疊');
      for (let i = 0; i < 5; i++) {
        s.onAction('right');
        if (tab() === '技能樹') {
          expect(hint()).toBe(T.ui2.status.hintTree);
          continue;
        }
        if (tab() === '天賦') {
          expect(hint()).toBe(T.ui2.status.hintTalent);
          expect(hint()).toContain('↑↓ 換列');
          expect(hint()).toContain('Tab 換欄');
          expect(hint()).toContain('Enter 投點');
          continue;
        }
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

  it('the skills tab prices a skill as the tree rewrites it: a modifier node lowers its TP', () => {
    const { root, s, game } = setup('noel');
    game.state.party.roster.noel.tree = { 'fire-star': 1, 'flame-wave': 1, 'noel-wave-up': 3 };
    s.onAction('right'); s.onAction('right');
    const want = Math.max(1, SKILLS['flame-wave'].tp + NODES['noel-wave-up'].node.mods![2].tpDelta!);
    expect(root.querySelector('[data-skill=flame-wave] .slx-skill-cost')!.textContent).toBe(T.ui2.status.tp(want));
  });

  it('the gear tab marks a power the member has not learned as 尚未習得', () => {
    const { root, s, game } = setup('noel');
    game.state.party.roster.noel.equip.neck = { ...plainItem('moss-charm', 7), rarity: 'legendary', special: 'frost-bloom-neck' };
    s.onAction('right');
    const power = () => root.querySelector('.slx-tab-gear .slx-gear-power')!;
    expect(power().querySelector('.slx-line-note')!.textContent).toBe(T.gear.notLearned);   // the same note element as the equip page
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

  it('the tabs read 能力 裝備 技能 技能樹 天賦 絕技', () => {
    const { root } = setup('noel');
    expect([...root.querySelectorAll('.slx-tab')].map((t) => t.textContent)).toEqual(['能力', '裝備', '技能', '技能樹', '天賦', '絕技']);
  });

  describe('the tree tab', () => {
    beforeEach(() => resetTreeView());

    /** Noel at `level` with `tree`, on the tree tab. */
    const onTree = (level: number, tree: Record<string, number> = { 'fire-star': 1 }) => {
      const r = setup('noel');
      r.game.state.party.roster.noel = { ...r.game.state.party.roster.noel, level, tree, talents: {} };
      r.s.onAction('right'); r.s.onAction('right'); r.s.onAction('right');
      expect(r.tab()).toBe('技能樹');
      const node = (id: string) => r.root.querySelector(`.slx-tree-node[data-node="${id}"]`) as HTMLElement;
      const cur = () => r.root.querySelector('.slx-tree-node.slx-row-cur')?.getAttribute('data-node');
      const msg = () => r.root.querySelector('.slx-tree-msg')?.textContent ?? '';
      const info = () => r.root.querySelector('.slx-tree-info')!.textContent!;
      const noel = () => r.game.state.party.roster.noel;
      return { ...r, node, cur, msg, info, noel };
    };
    const down = (s: StatusScene, n: number) => { for (let i = 0; i < n; i++) s.onAction('down'); };
    /** Noel's nodes in cursor order: branch 0 tiers 0-4, then branch 1, then branch 2. */
    const order = TREES.noel.branches.flatMap((b) => b.nodes.map((n) => n.id));

    it('the tree tab shows three branches, the points left and each node\'s rank', () => {
      const { root, body, node, game } = onTree(2);
      expect(body()).toContain('剩餘技能點 1');
      const heads = [...root.querySelectorAll('.slx-tree-branch-name')].map((h) => h.textContent);
      expect(heads).toHaveLength(3);
      expect(heads[0]).toContain('火');
      expect(heads[1]).toContain('冰');
      expect(heads[2]).toContain('雷咒');
      expect(root.querySelectorAll('.slx-tree-node')).toHaveLength(15);
      expect(node('fire-star').textContent).toContain('1／3');
      expect(node('fire-star').classList.contains('slx-node-learned')).toBe(true);
      expect(node('ice-star').textContent).toContain('0／3');
      expect(node('ice-star').classList.contains('slx-node-open')).toBe(true);
      expect(node('ice-star').textContent).toContain(T.ui2.tree.kind.active);
      expect(node('noel-fire-up').textContent).toContain(T.ui2.tree.kind.mod);
      expect(node('inferno').textContent).toContain(T.ui2.tree.kind.ultimate);
      expect(node('flame-wave').classList.contains('slx-node-locked')).toBe(true);
      expect(node('flame-wave').textContent).toContain(T.ui2.tree.reason.req);
      expect(node('flame-wave').title).toBe(T.ui2.tree.reason.req);   // hover alone says why
      expect(node('ice-star').title).toBe('');                        // an open node has nothing to explain
      expect(game.state.party.roster.noel.tree).toEqual({ 'fire-star': 1 });   // drawing spends nothing
    });

    it('the notes under the tree give the reason for a locked node at once, by keys or by a click', () => {
      const { root, node, cur, info, s } = onTree(2);
      const reason = T.ui2.tree.reason.req;
      expect(info()).not.toContain(reason);                     // the cursor starts on an open node
      node('flame-wave').click();                               // one click moves the cursor there and shows why
      expect(cur()).toBe('flame-wave');
      expect(root.querySelector('.slx-tree-info')!.textContent).toContain(reason);
      s.onAction('up'); s.onAction('down');                     // a plain cursor move still shows it
      expect(cur()).toBe('flame-wave');
      expect(info()).toContain(reason);
      expect((info().match(new RegExp(reason, 'g')) ?? []).length).toBe(1);
    });

    it('Enter twice spends one point; then Enter on the same node is refused at once', () => {
      const { s, game, cur, msg, noel, sfx, body, node } = onTree(2);
      const spy = vi.spyOn(game, 'raiseNode');
      down(s, 5);
      expect(cur()).toBe('ice-star');
      s.onAction('confirm');
      expect(noel().tree['ice-star']).toBeUndefined();
      expect(msg()).toBe(T.ui2.tree.pending);
      s.onAction('confirm');
      expect(noel().tree['ice-star']).toBe(1);
      expect(spy).toHaveBeenCalledWith('noel', 'ice-star');   // through the Game, which saves
      expect(body()).toContain('剩餘技能點 0');
      expect(node('ice-star').textContent).toContain('1／3');
      expect(msg()).not.toBe(T.ui2.tree.pending);
      sfx.error.mockClear();
      s.onAction('confirm');
      expect(noel().tree['ice-star']).toBe(1);
      expect(sfx.error).toHaveBeenCalledTimes(1);
      expect(msg()).toBe(T.ui2.tree.reason.points);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a locked node shows its reason on the first press and is never armed', () => {
      const { s, cur, msg, noel, sfx } = onTree(2);
      down(s, 2);
      expect(cur()).toBe('flame-wave');
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.reason.req);
      expect(sfx.error).toHaveBeenCalledTimes(1);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.reason.req);
      expect(noel().tree).toEqual({ 'fire-star': 1 });
    });

    it('every refusal has its own words', () => {
      for (const k of ['unknown', 'max', 'points', 'req', 'gate', 'capstone'] as const) expect(T.ui2.tree.reason[k].length, k).toBeGreaterThan(0);
      expect(new Set(Object.values(T.ui2.tree.reason).filter((v) => typeof v === 'string')).size).toBe(6);
    });

    it('moving the cursor cancels a pending raise', () => {
      const { s, cur, msg, noel } = onTree(2);
      down(s, 5);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.pending);
      s.onAction('up');
      expect(msg()).toBe('');
      s.onAction('down');
      expect(cur()).toBe('ice-star');
      s.onAction('confirm');                                   // armed afresh, not raised
      expect(noel().tree['ice-star']).toBeUndefined();
      expect(msg()).toBe(T.ui2.tree.pending);
    });

    it('paging to another member cancels a pending raise', () => {
      const { s, msg, cur, name } = onTree(2);
      down(s, 5);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.pending);
      s.onAction('next');
      expect(name()).not.toContain('諾艾兒');
      expect(msg()).toBe('');                                   // nothing of noel's press is left on the next page
      s.onAction('prev');
      expect(msg()).toBe('');
      expect(cur()).toBe('fire-star');                          // another tree in between: the cursor starts over
    });

    it('a pending press does not survive switching the tab away and back', () => {
      const { s, msg, noel, cur } = onTree(2);
      down(s, 5);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.pending);
      s.onAction('right'); s.onAction('left');
      expect(cur()).toBe('ice-star');                           // the cursor is kept
      expect(msg()).toBe('');
      s.onAction('confirm');                                    // one press: armed afresh, not raised
      expect(noel().tree['ice-star']).toBeUndefined();
      expect(msg()).toBe(T.ui2.tree.pending);
    });

    it('closing the sheet drops a pending press', () => {
      const { s, game, sfx, go, noel } = onTree(2);
      down(s, 5);
      s.onAction('confirm');
      s.exit();
      const root = document.createElement('div');
      const again = new StatusScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg: 'noel' });
      again.enter(root);
      again.onAction('right'); again.onAction('right'); again.onAction('right');
      expect(root.querySelector('.slx-tree-node.slx-row-cur')!.getAttribute('data-node')).toBe('ice-star');
      expect(root.querySelector('.slx-tree-msg')).toBeNull();
      again.onAction('confirm');
      expect(noel().tree['ice-star']).toBeUndefined();
    });

    it('a spend the Game turns down is not shown as spent', () => {
      const { s, game, msg, noel, sfx, body } = onTree(2);
      down(s, 5);
      s.onAction('confirm');
      game.phase = 'battle';                                    // the Game refuses spends here
      sfx.confirm.mockClear();
      s.onAction('confirm');
      expect(noel().tree['ice-star']).toBeUndefined();
      expect(sfx.confirm).not.toHaveBeenCalled();
      expect(msg()).toBe(T.ui2.tree.failed);
      expect(body()).toContain('剩餘技能點 1');
    });

    it('with no points left a locked node shows its structural reason, an open one 點數不足', () => {
      const { node, s, msg } = onTree(1);
      expect(node('flame-wave').textContent).toContain(T.ui2.tree.reason.req);
      expect(node('flame-wave').textContent).not.toContain(T.ui2.tree.reason.points);
      expect(node('ice-star').textContent).toContain(T.ui2.tree.reason.points);
      down(s, 2);
      s.onAction('confirm');
      expect(msg()).toBe('需先學會上一階');
    });

    it('the keyboard reaches every node, branch by branch', () => {
      const { s, cur } = onTree(2);
      const seen = [cur()];
      for (let i = 0; i < 14; i++) { s.onAction('down'); seen.push(cur()); }
      expect(seen).toEqual(order);
      s.onAction('down');
      expect(cur()).toBe(order[14]);                            // held at the last node
      for (let i = 0; i < 20; i++) s.onAction('up');
      expect(cur()).toBe(order[0]);
    });

    it('left and right still switch tabs on the tree tab', () => {
      const { s, tab } = onTree(2);
      s.onAction('right');
      expect(tab()).toBe('天賦');
      s.onAction('left');
      expect(tab()).toBe('技能樹');
      s.onAction('left');
      expect(tab()).toBe('技能');
    });

    it('the first click selects and arms a node, a second click on it raises', () => {
      const { node, cur, msg, noel } = onTree(2);
      node('ice-star').click();
      expect(cur()).toBe('ice-star');
      expect(msg()).toBe(T.ui2.tree.pending);
      expect(noel().tree['ice-star']).toBeUndefined();
      node('ice-star').click();
      expect(noel().tree['ice-star']).toBe(1);
      expect(msg()).toBe('');
    });

    it('a click on another node moves the selection and arms that node instead', () => {
      const { node, cur, msg, noel } = onTree(3);
      node('ice-star').click();                                 // ice-star armed
      node('hex').click();                                      // hex selected and armed; nothing spent
      expect(cur()).toBe('hex');
      expect(msg()).toBe(T.ui2.tree.pending);
      expect(noel().tree).toEqual({ 'fire-star': 1 });
      node('ice-star').click();                                 // back: armed again, not raised
      expect(noel().tree['ice-star']).toBeUndefined();
      node('ice-star').click();
      expect(noel().tree['ice-star']).toBe(1);
    });

    it('the pending line reads 再按一次投點, for a click or for Enter', () => {
      expect(T.ui2.tree.pending).toBe('再按一次投點');
      expect(T.ui2.talent.pending).toBe('再按一次投點');
    });

    it('clicks and Enter share one press: a click then Enter on the same node raises it', () => {
      const { s, node, noel, msg, cur } = onTree(3);
      node('ice-star').click();                                 // selects and arms
      s.onAction('confirm');                                    // raises
      expect(noel().tree['ice-star']).toBe(1);
      const d = order.indexOf('hex') > order.indexOf('ice-star') ? 'down' : 'up';
      for (let i = 0; i < 15 && cur() !== 'hex'; i++) s.onAction(d);   // the keyboard moves to hex
      s.onAction('confirm');                                    // arms
      expect(msg()).toBe(T.ui2.tree.pending);
      node('hex').click();                                      // raises
      expect(noel().tree.hex).toBe(1);
    });

    it('mouse and touch reach every node', () => {
      const { node, cur } = onTree(2);
      for (const id of order) {
        node(id).click();
        expect(cur()).toBe(id);
      }
    });

    it('the notes show an active node\'s target, TP and next rank, and a modifier\'s rewrites', () => {
      const { node, info } = onTree(10, { 'fire-star': 2 });
      node('fire-star').click();
      expect(info()).toContain(T.ui2.status.targets.enemy);
      expect(info()).toContain(T.ui2.status.tp(SKILLS['fire-star'].tp));
      expect(info()).toContain(SKILLS['fire-star'].desc);
      expect(info()).toContain(T.ui2.tree.next('power', 110, 120));
      node('noel-fire-up').click();
      expect(info()).toContain(NODES['noel-fire-up'].node.desc!);
      expect(info()).toContain(T.ui2.tree.now(T.ui2.tree.none));
      expect(info()).toContain(T.ui2.tree.nextMod('威力 110%'));
      node('noel-wave-up').click();
      expect(info()).toContain(T.ui2.tree.nextMod('TP −1'));
    });

    it('every modifier rank reads as a summary', () => {
      expect(T.ui2.tree.mod({ powerPct: 120 })).toBe('威力 120%');
      expect(T.ui2.tree.mod({ tpDelta: -2 })).toBe('TP −2');
      expect(T.ui2.tree.mod({ turns: 5 })).toBe('持續 5 回合');
      expect(T.ui2.tree.mod({ chance: 0.7 })).toBe('毒機率 70%');
      expect(T.ui2.tree.mod({ hpCost: 0.06 })).toBe('HP 消耗 6%');
      for (const info of Object.values(NODES)) for (const m of info.node.mods ?? []) expect(T.ui2.tree.mod(m), info.node.id).not.toBe('');
    });

    it('a taken capstone is named, and the other capstones say why they are shut', () => {
      const tree = {
        'fire-star': 1, 'noel-fire-up': 1, 'flame-wave': 3, 'noel-wave-up': 3, inferno: 1,
        'ice-star': 3, 'noel-ice-up': 3, 'frost-bind': 1, 'noel-bind-up': 1,
      };
      const { s, body, node, msg, noel, cur } = onTree(50, tree);
      expect(body()).toContain(T.ui2.tree.capstone(SKILLS.inferno.name));
      expect(node('inferno').classList.contains('slx-node-learned')).toBe(true);
      expect(node('blizzard').classList.contains('slx-node-locked')).toBe(true);
      expect(node('blizzard').textContent).toContain(T.ui2.tree.reason.capstone);
      down(s, 9);
      expect(cur()).toBe('blizzard');
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.tree.reason.capstone);
      expect(noel().tree.blizzard).toBeUndefined();
      node('inferno').click();                                  // a maxed node is refused on the first click
      expect(msg()).toBe(T.ui2.tree.reason.max);
    });

    it('with no capstone taken, the line says so', () => {
      const { body } = onTree(2);
      expect(body()).toContain(T.ui2.tree.noCapstone(1));
      expect(body()).toContain('限選 1');
    });

    describe("the columns' scroll cues (as the talent board's)", () => {
      const cue = (root: HTMLElement, d: 'up' | 'down') => root.querySelector<HTMLElement>(`.slx-tab-tree .slx-more-${d}`)!;
      const cols = (root: HTMLElement) => root.querySelector<HTMLElement>('.slx-tree-cols')!;
      let sh: ReturnType<typeof vi.spyOn>;
      let ch: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
        ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
      });
      afterEach(() => { sh.mockRestore(); ch.mockRestore(); });

      it('columns that fit show no cue', () => {
        sh.mockReturnValue(80); ch.mockReturnValue(100);
        const { root } = onTree(2);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([true, true]);
      });

      it('columns that overflow show ▼ at the top and ▲ at the bottom; a click on a cue scrolls them', () => {
        sh.mockReturnValue(300); ch.mockReturnValue(100);
        const { root } = onTree(2);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([true, false]);
        expect([cue(root, 'up').textContent, cue(root, 'down').textContent]).toEqual(['▲', '▼']);
        for (let i = 0; i < 20; i++) cue(root, 'down').click();
        expect(cols(root).scrollTop).toBe(200);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, true]);
        cue(root, 'up').click();
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, false]);
      });

      it('a scroll by wheel or touch updates the cues, and a redraw keeps the place', () => {
        sh.mockReturnValue(300); ch.mockReturnValue(100);
        const { root, s } = onTree(2);
        cols(root).scrollTop = 200;
        cols(root).dispatchEvent(new Event('scroll'));
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, true]);
        s.onAction('confirm');                                  // a redraw
        expect(cols(root).scrollTop).toBe(200);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, true]);
      });
    });
  });

  describe('the talent tab', () => {
    beforeEach(() => resetTalentView());

    /** Noel at `level` with `talents`, on the talent tab. */
    const onTalent = (level: number, talents: Record<string, number> = {}) => {
      const r = setup('noel');
      r.game.state.party.roster.noel = { ...r.game.state.party.roster.noel, level, talents };
      for (let i = 0; i < 4; i++) r.s.onAction('right');
      expect(r.tab()).toBe('天賦');
      const node = (id: string) => r.root.querySelector(`.slx-talent-node[data-node="${id}"]`) as HTMLElement;
      const cur = () => r.root.querySelector('.slx-talent-node.slx-row-cur')?.getAttribute('data-node');
      const msg = () => r.root.querySelector('.slx-talent-msg')?.textContent ?? '';
      const info = () => r.root.querySelector('.slx-talent-info')!.textContent!;
      const top = () => r.root.querySelector('.slx-talent-top')!.textContent!;
      const noel = () => r.game.state.party.roster.noel;
      return { ...r, node, cur, msg, info, top, noel };
    };
    const down = (s: StatusScene, n: number) => { for (let i = 0; i < n; i++) s.onAction('down'); };
    /** Noel's talent nodes in cursor order: row 0 columns 0-3, row 1, ... row 5, then the keystones. */
    const order = BOARDS.noel.map((n) => n.id);
    /** 11 points on noel's board: one short of the keystone gate. */
    const eleven = { 'noel-t00': 5, 'noel-t01': 5, 'noel-t02': 1 };

    it('the talent tab draws the 6x4 board and the keystone row', () => {
      const { root, node, top, game } = onTalent(6);
      const rows = [...root.querySelectorAll('.slx-talent-row')];
      expect(rows).toHaveLength(6);
      expect(rows.every((r) => r.querySelectorAll('.slx-talent-node').length === 4)).toBe(true);
      expect(root.querySelectorAll('.slx-talent-node[data-node]')).toHaveLength(27);
      expect(root.querySelectorAll('.slx-talent-keys .slx-talent-node')).toHaveLength(3);
      expect(top()).toContain('剩餘天賦點 1');
      expect(top()).toContain('關鍵天賦 0／2');
      expect(top()).toContain(T.ui2.talent.board(0));
      expect(node('noel-t00').textContent).toContain(T.gear.statName.int);
      expect(node('noel-t00').textContent).toContain('+2／級');
      expect(node('noel-t00').textContent).toContain('0／5');
      expect(node('noel-t00').classList.contains('slx-node-open')).toBe(true);
      expect(node('noel-t10').classList.contains('slx-node-locked')).toBe(true);
      expect(node('noel-t10').textContent).toContain(T.ui2.talent.cell.adjacent);
      expect(node('noel-k0').textContent).toContain(KEYSTONES['weak-tp'].name);
      expect(node('noel-k0').textContent).toContain('0／1');
      expect(game.state.party.roster.noel.talents).toEqual({});   // drawing spends nothing
    });

    it("each cell is two lines, name and rank then bonus and state; a keystone's rule is in the notes", () => {
      const { node, info } = onTalent(6);
      for (const id of ['noel-t00', 'noel-t10', 'noel-k0']) {
        expect([...node(id).children].map((l) => l.className), id).toEqual(['slx-talent-head', 'slx-talent-sub']);
      }
      const sub = (id: string, cls: string) => node(id).querySelector(`.slx-talent-sub .${cls}`)?.textContent;
      expect([sub('noel-t00', 'slx-talent-per'), sub('noel-t00', 'slx-talent-state')]).toEqual(['+2／級', T.ui2.talent.cell.open]);
      expect([sub('noel-t10', 'slx-talent-per'), sub('noel-t10', 'slx-talent-state')]).toEqual(['+3%／級', T.ui2.talent.cell.adjacent]);   // 雷電傷害
      expect(sub('noel-k0', 'slx-talent-state')).toBe(T.ui2.talent.cell.gate);
      // A cell has room for 3 wide characters beside the bonus (the gate's number aside); a keystone cell has no bonus,
      // so its own reasons may take 4. The notes give the full reason.
      const keyOnly = ['gate', 'keystones'];
      for (const [k, v] of Object.entries(T.ui2.talent.cell)) expect(v.replace(/\d/g, '').length, k).toBeLessThanOrEqual(keyOnly.includes(k) ? 4 : 3);
      expect(Object.keys(T.ui2.talent.cell).sort()).toEqual(['open', ...Object.keys(T.ui2.talent.reason)].sort());
      node('noel-t10').click();
      expect(info()).toContain(T.ui2.talent.reason.adjacent);
      expect(node('noel-k0').textContent).not.toContain(KEYSTONES['weak-tp'].desc);
      node('noel-k0').click();
      expect(info()).toContain(KEYSTONES['weak-tp'].desc);
    });

    it('Lv5 has no talent points: Enter shows the reason at once and changes nothing', () => {
      const { s, msg, noel, sfx, cur, game } = onTalent(5);
      const spy = vi.spyOn(game, 'raiseTalent');
      expect(cur()).toBe('noel-t00');
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.reason.points);
      expect(sfx.error).toHaveBeenCalledTimes(1);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.reason.points);
      expect(noel().talents).toEqual({});
      expect(spy).not.toHaveBeenCalled();
    });

    it('Lv6: Enter twice on a row-0 node raises it to 1／5 and the stats tab shows it in the 天賦 column', () => {
      const { s, root, msg, noel, node, top, game, tab } = onTalent(6);
      for (let i = 0; i < 4; i++) s.onAction('left');
      expect(tab()).toBe('能力');
      expect(root.querySelector('[data-stat=int] .slx-talent')!.textContent).toBe('—');
      for (let i = 0; i < 4; i++) s.onAction('right');
      const spy = vi.spyOn(game, 'raiseTalent');
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.pending);
      expect(noel().talents).toEqual({});
      s.onAction('confirm');
      expect(spy).toHaveBeenCalledWith('noel', 'noel-t00');   // through the Game, which saves
      expect(noel().talents).toEqual({ 'noel-t00': 1 });
      expect(node('noel-t00').textContent).toContain('1／5');
      expect(top()).toContain('剩餘天賦點 0');
      expect(top()).toContain(T.ui2.talent.board(1));
      for (let i = 0; i < 4; i++) s.onAction('left');
      expect(root.querySelector('[data-stat=int] .slx-talent')!.textContent).toBe(T.signed(TALENT_PER.int! * TALENT_SCALE));
    });

    it('a keystone stays locked under 12 board points, with the reason shown', () => {
      const { node, msg, noel, top } = onTalent(50, eleven);
      expect(top()).toContain(T.ui2.talent.board(11));
      expect(top()).toContain('12 點後可選關鍵天賦');
      expect(node('noel-k0').classList.contains('slx-node-locked')).toBe(true);
      expect(node('noel-k0').textContent).toContain(T.ui2.talent.cell.gate);
      node('noel-k0').click();                                  // selects it, and the press is refused at once
      expect(msg()).toBe(T.ui2.talent.reason.gate);
      expect(noel().talents).toEqual(eleven);
      node('noel-t02').click(); node('noel-t02').click();       // arms, raises
      expect(noel().talents['noel-t02']).toBe(2);
      expect(top()).toContain(T.ui2.talent.board(12));
      expect(node('noel-k0').classList.contains('slx-node-open')).toBe(true);
    });

    it('two keystones taken: the count reads 2／2 and the third says why it is shut', () => {
      const { node, top, s, msg, cur } = onTalent(50, { ...eleven, 'noel-t02': 2, 'noel-k0': 1, 'noel-k1': 1 });
      expect(top()).toContain('關鍵天賦 2／2');
      expect(node('noel-k0').classList.contains('slx-node-learned')).toBe(true);
      expect(node('noel-k0').textContent).toContain('1／1');
      expect(node('noel-k2').classList.contains('slx-node-locked')).toBe(true);
      expect(node('noel-k2').textContent).toContain(T.ui2.talent.cell.keystones);
      down(s, 6); s.onAction('swap'); s.onAction('swap');
      expect(cur()).toBe('noel-k2');
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.reason.keystones(rulesOf('noel').maxKeystones));
    });

    it('with no points left a shut node shows its structural reason, an open one 點數不足', () => {
      const { node } = onTalent(6, { 'noel-t00': 1 });
      expect(node('noel-t13').textContent).toContain(T.ui2.talent.cell.adjacent);
      expect(node('noel-t13').textContent).not.toContain(T.ui2.talent.cell.points);
      expect(node('noel-k0').textContent).toContain(T.ui2.talent.cell.gate);
      expect(node('noel-t01').textContent).toContain(T.ui2.talent.cell.points);
      expect(node('noel-t11').textContent).toContain(T.ui2.talent.cell.points);   // diagonal below a raised node
    });

    it('a maxed node and the keystone cap read differently, in the cell and in the notes', () => {
      expect(T.ui2.talent.cell.max).toBe('已滿級');
      expect(T.ui2.talent.cell.keystones).toBe('關鍵已滿');
      expect(new Set(Object.values(T.ui2.talent.cell)).size).toBe(Object.keys(T.ui2.talent.cell).length);
      expect(T.ui2.talent.reason.keystones(2)).toContain('關鍵天賦');
      const { node } = onTalent(50, { ...eleven, 'noel-t02': 2, 'noel-k0': 1, 'noel-k1': 1 });
      expect(node('noel-k2').textContent).toContain('關鍵已滿');
      expect(node('noel-k0').textContent).not.toContain('關鍵已滿');
    });

    it('every refusal has its own words', () => {
      for (const k of ['unknown', 'max', 'points', 'adjacent', 'gate', 'keystones'] as const) expect(String(typeof T.ui2.talent.reason[k] === 'function' ? T.ui2.talent.reason[k](2) : T.ui2.talent.reason[k]).length, k).toBeGreaterThan(0);
      expect(new Set(Object.values(T.ui2.talent.reason)).size).toBe(6);
    });

    it('↑/↓ move to the row above or below and keep the column; the keystone row holds the last column', () => {
      const { s, cur } = onTalent(6);
      const seen = [cur()];
      for (let i = 0; i < 6; i++) { s.onAction('down'); seen.push(cur()); }
      expect(seen).toEqual(['noel-t00', 'noel-t10', 'noel-t20', 'noel-t30', 'noel-t40', 'noel-t50', 'noel-k0']);
      s.onAction('down');
      expect(cur()).toBe('noel-k0');                            // held on the bottom row
      for (let i = 0; i < 10; i++) s.onAction('up');
      expect(cur()).toBe('noel-t00');                           // held on the top row
      for (let i = 0; i < 3; i++) s.onAction('swap');
      expect(cur()).toBe('noel-t03');
      down(s, 5);
      expect(cur()).toBe('noel-t53');
      s.onAction('down');
      expect(cur()).toBe('noel-k2');                            // three keystones: column 3 lands on the last one
      s.onAction('up');
      expect(cur()).toBe('noel-t52');                           // and up keeps the keystone's own column
    });

    it('Tab moves along the row and wraps; ←/→ still switch tabs', () => {
      const { s, cur, tab } = onTalent(6);
      const seen = [cur()];
      for (let i = 0; i < 4; i++) { s.onAction('swap'); seen.push(cur()); }
      expect(seen).toEqual(['noel-t00', 'noel-t01', 'noel-t02', 'noel-t03', 'noel-t00']);
      down(s, 6);
      const keys = [cur()];
      for (let i = 0; i < 3; i++) { s.onAction('swap'); keys.push(cur()); }
      expect(keys).toEqual(['noel-k0', 'noel-k1', 'noel-k2', 'noel-k0']);
      s.onAction('right');
      expect(tab()).toBe('絕技');
    });

    it('the keyboard reaches every node', () => {
      const { s, cur } = onTalent(6);
      const seen = new Set<string>();
      for (let r = 0; r <= 6; r++) {
        for (let c = 0; c < 4; c++) { seen.add(cur()!); s.onAction('swap'); }
        s.onAction('down');
      }
      expect([...seen].sort()).toEqual([...order].sort());
    });

    it('Tab drops a pending press like the other moves', () => {
      const { s, msg, noel } = onTalent(6);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.pending);
      s.onAction('swap');
      expect(msg()).toBe('');
      s.onAction('confirm');                                    // armed afresh on noel-t01, not raised
      expect(noel().talents).toEqual({});
    });

    it('mouse and touch reach every node; the first click selects and arms, a second on it raises', () => {
      const { node, cur, msg, noel } = onTalent(6);
      for (const id of order) {
        node(id).click();
        expect(cur()).toBe(id);
      }
      expect(noel().talents).toEqual({});                       // one click on each node spends nothing
      node('noel-t01').click();
      expect(msg()).toBe(T.ui2.talent.pending);
      node('noel-t02').click();                                 // another node: selected and armed instead
      expect([cur(), msg()]).toEqual(['noel-t02', T.ui2.talent.pending]);
      expect(noel().talents).toEqual({});
      node('noel-t02').click();
      expect(noel().talents).toEqual({ 'noel-t02': 1 });
    });

    it('a click on the node the keyboard put the cursor on arms it, and a second click raises', () => {
      const { s, node, msg, noel } = onTalent(6);
      s.onAction('swap');                                       // noel-t01
      node('noel-t01').click();
      expect(msg()).toBe(T.ui2.talent.pending);
      node('noel-t01').click();
      expect(noel().talents).toEqual({ 'noel-t01': 1 });
    });

    it('moving the cursor, switching tabs or paging drops a pending press', () => {
      const { s, msg, noel, name } = onTalent(6);
      s.onAction('confirm');
      expect(msg()).toBe(T.ui2.talent.pending);
      s.onAction('down'); s.onAction('up');
      expect(msg()).toBe('');
      s.onAction('confirm');                                    // armed afresh, not raised
      expect(noel().talents).toEqual({});
      s.onAction('right'); s.onAction('left');
      expect(msg()).toBe('');
      s.onAction('confirm');
      expect(noel().talents).toEqual({});
      s.onAction('next');
      expect(name()).not.toContain('諾艾兒');
      expect(msg()).toBe('');
    });

    it('a spend the Game turns down is not shown as spent', () => {
      const { s, game, msg, noel, sfx, top } = onTalent(6);
      s.onAction('confirm');
      game.phase = 'battle';                                    // the Game refuses spends here
      sfx.confirm.mockClear();
      s.onAction('confirm');
      expect(noel().talents).toEqual({});
      expect(sfx.confirm).not.toHaveBeenCalled();
      expect(msg()).toBe(T.ui2.talent.failed);
      expect(top()).toContain('剩餘天賦點 1');
    });

    it('the notes show a node\'s bonus per rank and what it gives now, and a keystone\'s effect', () => {
      const { node, info } = onTalent(10, { 'noel-t00': 2 });
      node('noel-t00').click();
      expect(info()).toContain('智力 +2／級（目前 +4）');
      node('noel-k1').click();
      expect(info()).toContain(KEYSTONES['opening-gauge'].name);
      expect(info()).toContain(KEYSTONES['opening-gauge'].desc);
    });

    it('left and right still switch tabs on the talent tab', () => {
      const { s, tab } = onTalent(6);
      s.onAction('right');
      expect(tab()).toBe('絕技');
      s.onAction('left');
      expect(tab()).toBe('天賦');
      s.onAction('left');
      expect(tab()).toBe('技能樹');
    });

    it('each board row is labelled by its tier, and a shut node says what it needs', () => {
      const { root, node, info } = onTalent(6);
      const rows = [...root.querySelectorAll('.slx-talent-row')];
      expect(rows.map((r) => r.querySelector('.slx-talent-tier')!.textContent)).toEqual([1, 2, 3, 4, 5, 6].map((r) => T.ui2.talent.tier(r)));
      expect(T.ui2.talent.reason.adjacent).toBe('需相鄰上一列');
      expect(node('noel-t10').textContent).toContain(T.ui2.talent.cell.adjacent);
      node('noel-t10').click();
      expect(info()).toContain('需相鄰上一列');
    });

    describe('the board\'s scroll cues', () => {
      const cue = (root: HTMLElement, d: 'up' | 'down') => root.querySelector<HTMLElement>(`.slx-tab-talent .slx-more-${d}`)!;
      const board = (root: HTMLElement) => root.querySelector<HTMLElement>('.slx-talent-board')!;
      let sh: ReturnType<typeof vi.spyOn>;
      let ch: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
        ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
      });
      afterEach(() => { sh.mockRestore(); ch.mockRestore(); });

      it('a board that fits shows no cue', () => {
        sh.mockReturnValue(80); ch.mockReturnValue(100);
        const { root } = onTalent(6);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([true, true]);
      });

      it('a board that overflows shows ▼ at the top, ▲ at the bottom, and the cues scroll it when clicked', () => {
        sh.mockReturnValue(300); ch.mockReturnValue(100);
        const { root } = onTalent(6);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([true, false]);
        expect([cue(root, 'up').textContent, cue(root, 'down').textContent]).toEqual(['▲', '▼']);
        cue(root, 'down').click();
        expect(board(root).scrollTop).toBeGreaterThan(0);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, false]);
        for (let i = 0; i < 20; i++) cue(root, 'down').click();
        expect(board(root).scrollTop).toBe(200);                 // held at the bottom
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, true]);
        for (let i = 0; i < 20; i++) cue(root, 'up').click();
        expect(board(root).scrollTop).toBe(0);
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([true, false]);
      });

      it('a scroll by wheel or touch updates the cues', () => {
        sh.mockReturnValue(300); ch.mockReturnValue(100);
        const { root } = onTalent(6);
        board(root).scrollTop = 200;
        board(root).dispatchEvent(new Event('scroll'));
        expect([cue(root, 'up').hidden, cue(root, 'down').hidden]).toEqual([false, true]);
      });
    });

    it('coming back to the tab brings the cursor\'s node into view', () => {
      const into = vi.fn();
      const had = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: into });
      try {
        const { s, cur, root } = onTalent(6);
        down(s, 6); s.onAction('swap'); s.onAction('swap');
        expect(cur()).toBe('noel-k2');
        into.mockClear();
        s.onAction('right'); s.onAction('left');                 // away and back: the board was reset to the top
        expect(cur()).toBe('noel-k2');
        expect(into).toHaveBeenCalled();
        expect(into.mock.contexts.at(-1)).toBe(root.querySelector('.slx-talent-node[data-node="noel-k2"]'));
      } finally {
        if (had) Object.defineProperty(Element.prototype, 'scrollIntoView', had);
        else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });
  });

  describe('the hero leads', () => {
    beforeEach(() => { resetStatsView(); resetTreeView(); resetTalentView(); });

    const heroSetup = (arg?: string, lineup: string[] = ['hero', 'rin', 'scarlet']) => {
      const game = new Game(constRng(0.5), null, undefined, 0, lineup as never);
      const go = vi.fn();
      const root = document.createElement('div');
      const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
      const s = new StatusScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
      s.enter(root);
      const name = () => root.querySelector('.slx-status-name')!.textContent!;
      const tabTo = (n: number) => { for (let i = 0; i < n; i++) s.onAction('right'); };
      return { game, root, s, name, tabTo };
    };

    it('the hero comes first: no argument opens him, and paging follows the recruited order', () => {
      const { s, name } = heroSetup();
      expect(name()).toContain('洛恩');
      s.onAction('next');
      expect(name()).toContain('凜');
      s.onAction('next');
      expect(name()).toContain('絲嘉蕾');
      s.onAction('next');
      expect(name()).toContain('洛恩');
    });

    it('the hero leads even when another member stands first on the field', () => {
      const { game, name } = heroSetup(undefined, ['rin', 'hero']);
      expect(game.state.party.grid.find((id) => id)).toBe('rin');
      expect(name()).toContain('洛恩');
    });

    it("the hero's tree shows five branches and ranks out of 5", () => {
      const { root, tabTo } = heroSetup();
      tabTo(3);
      expect(root.querySelector('.slx-tree-cols')!.classList.contains('slx-tree-wide')).toBe(true);
      expect(root.querySelectorAll('.slx-tree-branch')).toHaveLength(5);
      expect(root.querySelector('.slx-tree-node[data-node="hero-mend"]')!.textContent).toContain('0／5');
    });

    it('a three-branch tree is not wide', () => {
      const { root, tabTo } = heroSetup('rin');
      tabTo(3);
      expect(root.querySelector('.slx-tree-cols')!.classList.contains('slx-tree-wide')).toBe(false);
    });

    it("the hero's board shows six columns and three keystones", () => {
      const { root, tabTo } = heroSetup();
      tabTo(4);
      expect(root.querySelector('.slx-talent-board')!.classList.contains('slx-talent-wide')).toBe(true);
      expect(root.querySelectorAll('.slx-talent-row[data-row="0"] .slx-talent-node')).toHaveLength(6);
      expect(root.querySelector('.slx-talent-keys-head')!.textContent).toContain('限選 3');
      expect(root.querySelector('.slx-talent-count')!.textContent).toBe('關鍵天賦 0／3');
    });

    it("a companion's board stays four columns", () => {
      const { root, tabTo } = heroSetup('rin');
      tabTo(4);
      expect(root.querySelector('.slx-talent-board')!.classList.contains('slx-talent-wide')).toBe(false);
      expect(root.querySelectorAll('.slx-talent-row[data-row="0"] .slx-talent-node')).toHaveLength(4);
    });

    it('the hero header says he may hold two ultimates, a companion one', () => {
      const h = heroSetup();
      h.tabTo(3);
      expect(h.root.querySelector('.slx-tree-capstone')!.textContent).toContain('限選 2');
      const r = heroSetup('rin');
      r.tabTo(3);
      expect(r.root.querySelector('.slx-tree-capstone')!.textContent).toContain('限選 1');
    });

    it("the abyss node opens with the hero's memories", () => {
      const open = (memories: number) => {
        const { root, game, tabTo } = heroSetup();
        const hero = game.state.party.roster.hero;
        game.state.party.roster.hero = { ...hero, level: 50, memories, tree: { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5 } };
        tabTo(3);
        return root.querySelector('.slx-tree-node[data-node="abyss-sword"]')!.textContent!;
      };
      expect(open(2)).not.toContain('深淵尚未甦醒');
      expect(open(0)).toContain('深淵尚未甦醒');
    });

    it('every ultimate the hero holds is named in the header', () => {
      const { root, game, tabTo } = heroSetup();
      const caps = TREES.hero.branches.slice(0, 2).map((b) => b.nodes[4]);
      game.state.party.roster.hero = { ...game.state.party.roster.hero, tree: { ...game.state.party.roster.hero.tree, [caps[0].id]: 1, [caps[1].id]: 1 } };
      tabTo(3);
      const text = root.querySelector('.slx-tree-capstone')!.textContent!;
      for (const c of caps) expect(text).toContain(c.kind === 'active' ? SKILLS[c.skill].name : c.name!);
    });

    it("the hero's ultimate line names his current form", () => {
      const { root, game, s, tabTo } = heroSetup();
      tabTo(5);
      expect(root.querySelector('.slx-tab-ultimate h4')!.textContent).toBe('燈鑰・斬');
      game.state.party.roster.hero = { ...game.state.party.roster.hero, tree: { ...game.state.party.roster.hero.tree, 'hero-mend': 3 } };
      s.onAction('left'); s.onAction('right');
      expect(root.querySelector('.slx-tab-ultimate h4')!.textContent).toBe('燈鑰・光');
    });
  });
});
