import { CHARACTERS } from '../../data/characters';
import { EQUIPMENT } from '../../data/equipment';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { ROW_MELEE, rowOfCell } from '../../engine/formation';
import { expToNext, learnedSkills, statsOf } from '../../engine/party';
import type { CharacterId, Slot, StatKey, Stats } from '../../engine/types';
import type { Game } from '../../engine/game';
import { el } from '../../ui/dom';

export const STAT_ORDER: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
export const SLOT_ORDER: Slot[] = ['weapon', 'armor', 'accessory'];

export interface StatusTab {
  id: string;
  /** The page body for one member; tabs are listed in STATUS_TABS, so a new system (enchanting, talents, skill trees) adds one entry. */
  render(game: Game, id: CharacterId): HTMLElement;
}

/** Sum of equipment bonuses for one member. */
export function gearBonus(equip: Partial<Record<Slot, string>>): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const slot of SLOT_ORDER) {
    const b = equip[slot] ? EQUIPMENT[equip[slot]!]?.bonus : undefined;
    if (b) for (const [k, v] of Object.entries(b)) out[k as StatKey] = (out[k as StatKey] ?? 0) + (v ?? 0);
  }
  return out;
}

/** "攻擊+3 防禦+1" for a bonus, or an em dash. */
export function bonusText(b: Partial<Stats>): string {
  return STAT_ORDER.filter((k) => b[k]).map((k) => `${T.stat[k]}${b[k]! > 0 ? '+' : ''}${b[k]}`).join(' ') || '—';
}

const signed = (n: number) => (n ? `${n > 0 ? '+' : ''}${n}` : '—');

const stats: StatusTab = {
  id: 'stats',
  render(game, id) {
    const t = T.ui2.status;
    const m = game.state.party.roster[id];
    const def = CHARACTERS[id];
    const st = statsOf(m);
    const gear = gearBonus(m.equip);
    const cell = game.state.party.grid.indexOf(id);
    const row = cell >= 0 ? rowOfCell(cell) : null;
    const head = el('tr', {}, t.cols.map((c) => el('th', { text: c })));
    const rows = STAT_ORDER.map((k) => el('tr', { attrs: { 'data-stat': k } }, [
      el('th', { text: T.stat[k] }),
      el('td', { class: 'slx-base', text: String(def.base[k]) }),
      el('td', { class: 'slx-growth', text: signed(def.growth[k] * (m.level - 1)) }),
      el('td', { class: 'slx-gear', text: signed(gear[k] ?? 0) }),
      el('td', { class: 'slx-total', text: String(st[k]) }),
    ]));
    return el('div', { class: 'slx-tab-stats' }, [
      el('div', { class: 'slx-status-facts' }, [
        el('p', { text: `HP ${m.hp}／${st.hp}　TP ${m.tp}／${st.tp}` }),
        el('p', { text: t.exp(m.exp, expToNext(m.level)) }),
        el('p', { text: t.place(row ? T.ui2.rows[row] : T.ui2.formation.reserve) }),
        el('p', { text: t.attack(def.melee, Math.round(ROW_MELEE[row ?? 'front'] * 100)) }),
        el('p', { text: t.gauge(m.limit ?? 0) }),
      ]),
      el('table', { class: 'slx-stat-table' }, [el('thead', {}, [head]), el('tbody', {}, rows)]),
    ]);
  },
};

const gear: StatusTab = {
  id: 'gear',
  render(game, id) {
    const m = game.state.party.roster[id];
    return el('div', { class: 'slx-tab-gear' }, SLOT_ORDER.map((slot) => {
      const eid = m.equip[slot];
      return el('div', { class: 'slx-gear-row' }, [
        el('span', { class: 'slx-gear-slot', text: T.slot[slot] }),
        el('span', { class: 'slx-gear-name', text: eid ? EQUIPMENT[eid].name : T.ui2.status.none }),
        el('span', { class: 'slx-gear-bonus', text: eid ? bonusText(EQUIPMENT[eid].bonus) : '' }),
      ]);
    }));
  },
};

const skills: StatusTab = {
  id: 'skills',
  render(game, id) {
    const t = T.ui2.status;
    const m = game.state.party.roster[id];
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
  render(game, id) {
    const u = ULTIMATES[id];
    const m = game.state.party.roster[id];
    return el('div', { class: 'slx-tab-ultimate' }, [
      el('h4', { text: u.name }),
      el('p', { class: 'slx-desc', text: u.desc }),
      el('p', { text: T.ui2.status.gauge(m.limit ?? 0) }),
    ]);
  },
};

export const STATUS_TABS: StatusTab[] = [stats, gear, skills, ultimate];
