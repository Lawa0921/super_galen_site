import { CHARACTERS } from '../../data/characters';
import { POWERS } from '../../data/gear';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { skillCost, skillFor } from '../../engine/battle';
import { itemLines } from '../../engine/compare';
import { ROW_MELEE, rowOfCell } from '../../engine/formation';
import { SLOTS, expToNext, learnedSkills, powersOf, sheetOf, statSources, statsOf } from '../../engine/party';
import { STAT_CATEGORIES, type StatCategory } from '../../engine/stats';
import type { AnyStat, CharacterId, Slot, StatKey, Stats } from '../../engine/types';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { gearLabel } from '../loot';
import type { SceneCtx } from '../scene';

export const STAT_ORDER: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
export const SLOT_ORDER: Slot[] = SLOTS;

/**
 * One page of the character sheet. A new system (enchanting, talents, a skill tree) adds an entry to STATUS_TABS:
 * `render` draws the page; for pointer input, `redraw(change)` applies `change` and draws the page again, both only
 * while the sheet is open. `onAction`, when present, receives keys first (except Q/E and cancel) and returns true when
 * it used one, after which the sheet redraws the page. `shown`, when present, runs once the page is on screen (after
 * the scroll position is restored). `hint` replaces the sheet's key hint while the tab is up.
 */
export interface StatusTab {
  id: string;
  label: string;
  hint?: string;
  render(ctx: SceneCtx, id: CharacterId, redraw: (change?: () => void) => void): HTMLElement;
  onAction?(a: UiAction, ctx: SceneCtx, id: CharacterId): boolean;
  shown?(body: HTMLElement): void;
}

/** "攻擊+3 防禦+1" for a bonus, or an em dash. */
export function bonusText(b: Partial<Stats>): string {
  return STAT_ORDER.filter((k) => b[k]).map((k) => `${T.stat[k]}${T.signed(b[k]!)}`).join(' ') || '—';
}

/** A source column's change: signed with the minus sign (T.signed), or an em dash for none. */
const signed = (n: number) => (n ? T.signed(n) : '—');

/**
 * The display rule for the stats page. The seven base stats are whole numbers (battle floors them, see statsOf); every
 * other stat shows to one decimal place, floored. Each source column shows how far it moves the running floored sum,
 * so the columns of a row always add up to its total. A capped stat adds a 上限 column holding the cut (negative), so
 * its columns add up to the capped total too. Zero rows are dimmed by the shown total.
 */
const WHOLE = new Set<AnyStat>(STAT_ORDER);
function floorShown(k: AnyStat, v: number): number {
  const unit = WHOLE.has(k) ? 1 : 10;
  return Math.floor(v * unit + 1e-9) / unit;
}

/** Fold state and row cursor of the stats page; kept for the session, so paging to another member keeps them. */
const DEFAULT_OPEN: StatCategory[] = ['primary', 'attack'];
const view = { open: new Set<StatCategory>(DEFAULT_OPEN), cur: 'cat:primary', reveal: false };

/** Back to the first-visit state: primary and attack open, the cursor on the first heading. */
export function resetStatsView(): void {
  view.open = new Set(DEFAULT_OPEN);
  view.cur = 'cat:primary';
  view.reveal = false;
}

/** Every place the row cursor can rest: each heading, then the rows of an open category. */
function stops(): string[] {
  return STAT_CATEGORIES.flatMap((c) => [`cat:${c.id}`, ...(view.open.has(c.id) ? c.keys.map((k) => `stat:${k}`) : [])]);
}

function toggle(cat: StatCategory): void {
  if (view.open.has(cat)) view.open.delete(cat);
  else view.open.add(cat);
}

/** Pointer input only reaches the active window (see MenuView). */
const locked = (node: HTMLElement) => !!node.closest('[inert]');

/** Move the cursor highlight in place, for a hover or a tap on a row: no redraw, so the page does not jump. */
function point(node: HTMLElement, key: string): void {
  if (locked(node) || view.cur === key) return;
  view.cur = key;
  node.closest('.slx-tab-stats')?.querySelector('.slx-row-cur')?.classList.remove('slx-row-cur');
  node.classList.add('slx-row-cur');
}

const stats: StatusTab = {
  id: 'stats',
  label: T.ui2.status.tabs.stats,
  hint: T.ui2.status.hintStats,
  render(ctx, id, redraw) {
    const t = T.ui2.status;
    const m = ctx.game.state.party.roster[id];
    const def = CHARACTERS[id];
    const st = statsOf(m);
    const sheet = sheetOf(m);
    const parts = statSources(m);
    const cell = ctx.game.state.party.grid.indexOf(id);
    const row = cell >= 0 ? rowOfCell(cell) : null;
    if (!stops().includes(view.cur)) view.cur = 'cat:primary';
    const curCls = (key: string) => (view.cur === key ? ' slx-row-cur' : '');

    const statRow = (k: AnyStat) => {
      const key = `stat:${k}`;
      let before = 0;
      let raw = 0;
      // One column per stat source, so a new source shows up here without touching this table.
      const cells = parts.map((p, i) => {
        raw += p.stats[k] ?? 0;
        const now = floorShown(k, raw);
        const d = Math.round((now - before) * 10) / 10;
        before = now;
        return el('td', { class: `slx-${p.source}`, text: i === 0 ? (d < 0 ? T.signed(d) : String(d)) : signed(d) });
      });
      // Any clamp in capSheet (a cap today, a floor tomorrow) shows here: the sheet differs from the plain sum.
      const capped = sheet[k] !== raw;
      const total = WHOLE.has(k) ? st[k as StatKey] : floorShown(k, sheet[k]);
      const cut = capped ? Math.round((total - before) * 10) / 10 : 0;
      const tr = el('tr', { class: `${total === 0 ? 'slx-zero' : ''}${curCls(key)}`.trim(), attrs: { 'data-stat': k } }, [
        el('th', { text: T.gear.statName[k] }),
        ...cells,
        el('td', { class: 'slx-cap', text: signed(cut) }),
        el('td', { class: capped ? 'slx-total slx-capped' : 'slx-total', text: t.value(k, total) }),
      ]);
      tr.addEventListener('pointermove', () => point(tr, key));
      tr.addEventListener('click', () => point(tr, key));
      return tr;
    };

    const sections = STAT_CATEGORIES.map((c) => {
      const key = `cat:${c.id}`;
      const open = view.open.has(c.id);
      const head = el('div', { class: `slx-stat-cat-head${curCls(key)}`, text: t.cats[c.id], attrs: { role: 'button', 'aria-expanded': String(open) } });
      head.addEventListener('pointermove', () => point(head, key));
      head.addEventListener('click', () => {
        if (locked(head)) return;
        redraw(() => {
          view.cur = key;
          toggle(c.id);
          ctx.sfx.cursor();
        });
      });
      const table = open
        ? [el('table', { class: 'slx-stat-table' }, [
          el('thead', {}, [el('tr', {}, [el('th'), ...parts.map((p) => el('th', { text: t.sources[p.source] ?? p.source })), el('th', { text: t.capCol }), el('th', { text: t.total })])]),
          el('tbody', {}, c.keys.map(statRow)),
        ])]
        : [];
      return el('section', { class: 'slx-stat-cat', attrs: { 'data-cat': c.id } }, [head, ...table]);
    });

    return el('div', { class: 'slx-tab-stats' }, [
      el('div', { class: 'slx-status-facts' }, [
        el('p', { text: `HP ${m.hp}／${st.hp}　TP ${m.tp}／${st.tp}` }),
        el('p', { text: t.exp(m.exp, expToNext(m.level)) }),
        el('p', { text: t.place(row ? T.ui2.rows[row] : T.ui2.formation.reserve) }),
        el('p', { text: t.attack(def.melee, row ? Math.round(ROW_MELEE[row] * 100) : null) }),
        el('p', { text: t.gauge(m.limit ?? 0) }),
      ]),
      ...sections,
    ]);
  },
  onAction(a, ctx) {
    if (a === 'up' || a === 'down') {
      const list = stops();
      const i = Math.max(0, list.indexOf(view.cur));
      const next = list[Math.max(0, Math.min(list.length - 1, i + (a === 'down' ? 1 : -1)))];
      if (next !== view.cur) ctx.sfx.cursor();
      view.cur = next;
      view.reveal = true;
      return true;
    }
    if (a === 'confirm' && view.cur.startsWith('cat:')) {
      toggle(view.cur.slice(4) as StatCategory);
      ctx.sfx.cursor();
      return true;
    }
    return false;
  },
  shown(body) {
    if (!view.reveal) return;
    view.reveal = false;
    // The first heading also brings the facts above it back into view.
    if (view.cur === stops()[0]) body.scrollTop = 0;
    else body.querySelector('.slx-row-cur')?.scrollIntoView?.({ block: 'nearest' });
  },
};

const gear: StatusTab = {
  id: 'gear',
  label: T.ui2.status.tabs.gear,
  render(ctx, id) {
    const m = ctx.game.state.party.roster[id];
    return el('div', { class: 'slx-tab-gear' }, SLOT_ORDER.map((slot) => {
      const it = m.equip[slot];
      const lines = it ? itemLines(it, m) : [];
      const stat = lines.filter((l) => l.kind === 'implicit' || l.kind === 'affix').map((l) => l.text).join('、');
      const power = lines.find((l) => l.kind === 'power');
      return el('div', { class: 'slx-gear-row' }, [
        el('span', { class: 'slx-gear-slot', text: T.slot[slot] }),
        el('span', { class: it ? `slx-gear-name slx-rarity-${it.rarity}` : 'slx-gear-name', text: it ? gearLabel(it) : T.ui2.status.none }),
        el('span', { class: 'slx-gear-bonus', text: stat }),
        ...(power ? [el('span', { class: power.usable === false ? 'slx-gear-power slx-line-off' : 'slx-gear-power', text: power.text })] : []),
      ]);
    }));
  },
};

const skills: StatusTab = {
  id: 'skills',
  label: T.ui2.status.tabs.skills,
  render(ctx, id) {
    const t = T.ui2.status;
    const m = ctx.game.state.party.roster[id];
    const learned = new Set(learnedSkills(id, m.level));
    // The skill as this member casts it: worn powers rewrite it, tpCost lowers its price (the battle rules, Task 9).
    const powers = powersOf(m);
    const caster = { powers, x: { tpCost: sheetOf(m).tpCost } };
    return el('div', { class: 'slx-tab-skills' }, CHARACTERS[id].skills.flatMap((sk) => {
      const s = skillFor(caster, sk);
      if (!s) return [];
      const changed = powers.map((p) => POWERS[p]).filter((p) => p && p.skill === sk);
      return el('div', { class: learned.has(sk) ? 'slx-skill' : 'slx-skill slx-skill-locked', attrs: { 'data-skill': sk } }, [
        el('div', { class: 'slx-skill-head' }, [
          el('span', { class: 'slx-skill-name', text: s.name }),
          ...(s.passive ? [] : [el('span', { class: 'slx-skill-target', text: t.targets[s.target] })]),
          el('span', { class: 'slx-skill-cost', text: s.passive ? t.passive : t.tp(skillCost(caster, sk)) }),
          el('span', { class: 'slx-skill-learn', text: learned.has(sk) ? t.learned : t.at(SKILLS[sk].learnLevel) }),
        ]),
        el('p', { class: 'slx-desc', text: s.desc }),
        ...changed.map((p) => el('p', { class: 'slx-skill-power', text: p.text })),
      ]);
    }));
  },
};

const ultimate: StatusTab = {
  id: 'ultimate',
  label: T.ui2.status.tabs.ultimate,
  render(ctx, id) {
    const u = ULTIMATES[id];
    const m = ctx.game.state.party.roster[id];
    return el('div', { class: 'slx-tab-ultimate' }, [
      el('h4', { text: u.name }),
      el('p', { class: 'slx-desc', text: u.desc }),
      el('p', { text: T.ui2.status.gauge(m.limit ?? 0) }),
    ]);
  },
};

export const STATUS_TABS: StatusTab[] = [stats, gear, skills, ultimate];
