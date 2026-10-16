import { CHARACTERS } from '../../data/characters';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { ROW_MELEE, rowOfCell } from '../../engine/formation';
import { itemName, itemStats } from '../../engine/loot/item';
import { SLOTS, expToNext, learnedSkills, statSources, statsOf } from '../../engine/party';
import type { CharacterId, Slot, StatKey, Stats } from '../../engine/types';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import type { SceneCtx } from '../scene';

export const STAT_ORDER: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
export const SLOT_ORDER: Slot[] = SLOTS;

/**
 * One page of the character sheet. A new system (enchanting, talents, a skill tree) adds an entry to STATUS_TABS:
 * `render` draws the page; `onAction`, when present, receives keys first (except Q/E and cancel) and returns true
 * when it used one, after which the sheet redraws the page.
 */
export interface StatusTab {
  id: string;
  label: string;
  render(ctx: SceneCtx, id: CharacterId): HTMLElement;
  onAction?(a: UiAction, ctx: SceneCtx, id: CharacterId): boolean;
}

/** "攻擊+3 防禦+1" for a bonus, or an em dash. */
export function bonusText(b: Partial<Stats>): string {
  return STAT_ORDER.filter((k) => b[k]).map((k) => `${T.stat[k]}${b[k]! > 0 ? '+' : ''}${b[k]}`).join(' ') || '—';
}

const signed = (n: number) => (n ? `${n > 0 ? '+' : ''}${n}` : '—');

const stats: StatusTab = {
  id: 'stats',
  label: T.ui2.status.tabs.stats,
  render(ctx, id) {
    const t = T.ui2.status;
    const m = ctx.game.state.party.roster[id];
    const def = CHARACTERS[id];
    const st = statsOf(m);
    const parts = statSources(m);
    const cell = ctx.game.state.party.grid.indexOf(id);
    const row = cell >= 0 ? rowOfCell(cell) : null;
    // One column per stat source, so a new source shows up here without touching this table.
    const head = el('tr', {}, [el('th'), ...parts.map((p) => el('th', { text: t.sources[p.source] ?? p.source })), el('th', { text: t.total })]);
    const rows = STAT_ORDER.map((k) => el('tr', { attrs: { 'data-stat': k } }, [
      el('th', { text: T.stat[k] }),
      ...parts.map((p, i) => el('td', { class: `slx-${p.source}`, text: i === 0 ? String(p.stats[k] ?? 0) : signed(p.stats[k] ?? 0) })),
      el('td', { class: 'slx-total', text: String(st[k]) }),
    ]));
    return el('div', { class: 'slx-tab-stats' }, [
      el('div', { class: 'slx-status-facts' }, [
        el('p', { text: `HP ${m.hp}／${st.hp}　TP ${m.tp}／${st.tp}` }),
        el('p', { text: t.exp(m.exp, expToNext(m.level)) }),
        el('p', { text: t.place(row ? T.ui2.rows[row] : T.ui2.formation.reserve) }),
        el('p', { text: t.attack(def.melee, row ? Math.round(ROW_MELEE[row] * 100) : null) }),
        el('p', { text: t.gauge(m.limit ?? 0) }),
      ]),
      el('table', { class: 'slx-stat-table' }, [el('thead', {}, [head]), el('tbody', {}, rows)]),
    ]);
  },
};

const gear: StatusTab = {
  id: 'gear',
  label: T.ui2.status.tabs.gear,
  render(ctx, id) {
    const m = ctx.game.state.party.roster[id];
    return el('div', { class: 'slx-tab-gear' }, SLOT_ORDER.map((slot) => {
      const it = m.equip[slot];
      return el('div', { class: 'slx-gear-row' }, [
        el('span', { class: 'slx-gear-slot', text: T.slot[slot] }),
        el('span', { class: 'slx-gear-name', text: it ? itemName(it) : T.ui2.status.none }),
        el('span', { class: 'slx-gear-bonus', text: it ? bonusText(itemStats(it)) : '' }),
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
    return el('div', { class: 'slx-tab-skills' }, CHARACTERS[id].skills.map((sk) => {
      const s = SKILLS[sk];
      return el('div', { class: learned.has(sk) ? 'slx-skill' : 'slx-skill slx-skill-locked' }, [
        el('div', { class: 'slx-skill-head' }, [
          el('span', { class: 'slx-skill-name', text: s.name }),
          el('span', { class: 'slx-skill-cost', text: s.passive ? t.passive : t.tp(s.tp) }),
          el('span', { class: 'slx-skill-learn', text: learned.has(sk) ? t.learned : t.at(s.learnLevel) }),
        ]),
        el('p', { class: 'slx-desc', text: s.desc }),
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
