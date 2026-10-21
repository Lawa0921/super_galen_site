import { CHARACTERS, rulesOf } from '../../data/characters';
import { POWERS } from '../../data/gear';
import { SKILLS } from '../../data/skills';
import { BOARDS, BOARD_ROWS, KEYSTONES, MEMORY_KEYSTONES, TALENT_PER, TALENT_SCALE, boardPoints, rankOf, type TalentNode } from '../../data/talents';
import { ACTIVE_RANK_PCT, NODES, TREES, branchNodes, nodeName as treeNodeName, nodeText, tierNodes, type TreeBranch, type TreeNode } from '../../data/trees';
import { T } from '../../data/text.zh-TW';
import { fromMember, skillCost, skillFor } from '../../engine/battle';
import { itemLines } from '../../engine/compare';
import { ROW_MELEE, rowOfCell } from '../../engine/formation';
import {
  boardKeystonesOf, canRaiseNode, canRaiseTalent, freeNode, treeCost, memoryKeystoneAwake, learnedSkills, nodeRank, rankMod, skillPointsLeft, talentPointsLeft, ultimateFor,
} from '../../engine/progression';
import type { RaiseFail, TalentFail } from '../../engine/progression';
import { ABYSS_UNLOCK } from '../../data/hero';
import { SLOTS, activeIds, expToNext, powersOf, sheetOf, statSources, statsOf } from '../../engine/party';
import { STAT_CATEGORIES, type StatCategory } from '../../engine/stats';
import { chainLength } from '../../data/story/chains';
import type { AnyStat, CharacterId, Member, Slot, StatKey, Stats } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { gearLabel, rarityClass } from '../loot';
import type { SceneCtx } from '../scene';
import { cancelSpend, clickSpend, pressSpend, type SpendState } from '../spendPress';
import { battleTp, slotDots, slotStates } from '../skillCard';
import { RUNES } from '../../data/runes';
import { socketable } from '../../engine/sockets';

export const STAT_ORDER: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];

/** A skill's icon (`icon/<skill>.png`) before its head line, once published; nothing before then. */
const skillIco = (ctx: SceneCtx, skill: string): HTMLElement[] =>
  (ctx.art.has(art.icon(skill)) ? [el('img', { class: 'slx-skill-ico', attrs: { src: art.icon(skill), alt: '' } })] : []);
export const SLOT_ORDER: Slot[] = SLOTS;

/**
 * One page of the character sheet. A new system (enchanting, talents, a skill tree) adds an entry to STATUS_TABS:
 * `render` draws the page; for pointer input, `redraw(change)` applies `change` and draws the page again, both only
 * while the sheet is open. `onAction`, when present, receives keys first (except Q/E and cancel) and returns true when
 * it used one, after which the sheet redraws the page. `shown`, when present, runs once the page is on screen (after
 * the scroll position is restored). `leave`, when present, runs when the page goes away: another tab or another member
 * is drawn, or the sheet closes. `hint` replaces the sheet's key hint while the tab is up.
 */
export interface StatusTab {
  id: string;
  label: string;
  hint?: string;
  render(ctx: SceneCtx, id: CharacterId, redraw: (change?: () => void) => void): HTMLElement;
  onAction?(a: UiAction, ctx: SceneCtx, id: CharacterId): boolean;
  shown?(body: HTMLElement): void;
  /** Opened straight onto this page (not by paging to it): bring the kept cursor into view once the page is shown. */
  reveal?(): void;
  leave?(): void;
}

/** "攻擊+3 防禦+1" for a bonus, or an em dash. */
export function bonusText(b: Partial<Stats>): string {
  return STAT_ORDER.filter((k) => b[k]).map((k) => `${T.stat[k]}${T.signed(b[k]!)}`).join(' ') || '—';
}

/** A source column's change: signed with the minus sign (T.signed), or an em dash for none. */
const signed = (n: number) => (n ? T.signed(n) : '—');
/** The base column's own value: no plus sign, but the minus sign (T.signed) when it is negative. */
const base = (n: number) => (n < 0 ? T.signed(n) : String(n));

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
        return el('td', { class: `slx-${p.source}`, text: i === 0 ? base(d) : signed(d) });
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
          // A heading too long for its share reads short, the whole word in its title (主屬 for 主屬性).
          el('thead', {}, [el('tr', {}, [el('th'), ...parts.map((p) => el('th', {
            text: t.sourcesShort[p.source] ?? t.sources[p.source] ?? p.source, attrs: { title: t.sources[p.source] ?? p.source },
          })), el('th', { text: t.capCol }), el('th', { text: t.total })])]),
          el('tbody', {}, c.keys.map(statRow)),
        ])]
        : [];
      // The primary heading carries the member's affinity: the primary that converts best, or 全能 for all of them.
      const affinity = c.id === 'primary'
        ? [el('p', { class: 'slx-stat-affinity', text: t.affinity(def.affinity === 'all' ? t.affinityAll : T.gear.statName[def.affinity]) })]
        : [];
      return el('section', { class: 'slx-stat-cat', attrs: { 'data-cat': c.id } }, [head, ...affinity, ...table]);
    });

    return el('div', { class: 'slx-tab-stats' }, [
      el('div', { class: 'slx-status-facts' }, [
        // With 常駐 holding some back, the max TP a fight leaves her (plan 8g ruling 9).
        el('p', { text: `HP ${m.hp}／${st.hp}　TP ${m.tp}／${st.tp}${((tp) => (tp === null ? '' : t.tpBattle(tp)))(battleTp(m))}` }),
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
    // The first heading also brings the facts above it back into view; the last stop the end of the page (the margin
    // under it), so the ▼ cue does not stay up over nothing.
    const list = stops();
    if (view.cur === list[0]) body.scrollTop = 0;
    else if (view.cur === list[list.length - 1]) body.scrollTop = body.scrollHeight;
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
        el('span', { class: it ? `slx-gear-name ${rarityClass(it)}` : 'slx-gear-name', text: it ? gearLabel(it) : T.ui2.status.none }),
        el('span', { class: 'slx-gear-bonus', text: stat }),
        // Outside the member's tree: dimmed. In the tree but not learned yet: at full colour, with the equip page's note.
        ...(power ? [el('span', { class: power.usable === false ? 'slx-gear-power slx-line-off' : 'slx-gear-power' }, [
          power.text,
          ...(power.usable && power.learned === false ? [el('span', { class: 'slx-line-note', text: T.gear.notLearned })] : []),
        ])] : []),
      ]);
    }));
  },
};

/** The skills page's one-line note: why the workshop did not open (shown until the next key or page). */
const skillsView = { note: '' };

/**
 * The workshop on `id`'s `skill` (plan 8g Task 5), or on her first skill that takes runes. In the labyrinth only the
 * members on the field can change runes (the workshop pages over them alone): for one on the bench the error cue and a
 * note, and nothing opens (Task 5 review).
 */
const toWorkshop = (ctx: SceneCtx, id: CharacterId, skill?: string): boolean => {
  const first = skill ?? socketable(ctx.game.state.party.roster[id])[0];
  if (!first) return false;
  const g = ctx.game;
  if (g.phase === 'map' && !!g.run && !activeIds(g.state.party).includes(id)) {
    ctx.sfx.error();
    skillsView.note = T.ui2.status.fieldOnly;
    return true;
  }
  ctx.sfx.confirm();
  ctx.go('workshop', `${id}:${first}`);
  return true;
};

const skills: StatusTab = {
  id: 'skills',
  label: T.ui2.status.tabs.skills,
  hint: T.ui2.status.hintSkills,
  onAction(a, ctx, id) {
    skillsView.note = '';
    return a === 'confirm' ? toWorkshop(ctx, id) : false;
  },
  leave() { skillsView.note = ''; },
  render(ctx, id, redraw) {
    const t = T.ui2.status;
    const m = ctx.game.state.party.roster[id];
    // The skill as this member casts it: tree ranks and mod nodes, worn powers, her weapon and her runes rewrite it; tpCost
    // lowers its price (the battle rules: engine/battle.ts fromMember, skillFor and skillCost).
    const powers = powersOf(m);
    const caster = fromMember(m, 0);
    // Only what the member has learned, each with its rank in the tree.
    const runed = socketable(m);
    const note = skillsView.note ? [el('p', { class: 'slx-skills-note', attrs: { role: 'status' }, text: skillsView.note })] : [];
    return el('div', { class: 'slx-tab-skills' }, [...note, ...learnedSkills(m).flatMap((sk) => {
      const s = skillFor(caster, sk);
      if (!s) return [];
      const changed = powers.map((p) => POWERS[p]).filter((p) => p && p.skill === sk);
      // A skill that takes runes: its slot dots after the name, a line for each rune in it (greyed with its reason when it
      // does nothing), and a click opens the workshop on it (plan 8g Task 5).
      const takes = runed.includes(sk);
      const runes = takes ? slotStates(m, sk).flatMap((x) => (x.ref ? [x] : [])) : [];
      const node = el('div', { class: takes ? 'slx-skill slx-skill-runed' : 'slx-skill', attrs: { 'data-skill': sk } }, [
        ...skillIco(ctx, sk),
        el('div', { class: 'slx-skill-head' }, [
          // A name with two variants on it (設置砲台・雙管・雙砲台, plan 8d Task 8) is set a size smaller, so it stays whole.
          el('span', { class: s.name.length >= LONG_SKILL_NAME ? 'slx-skill-name slx-skill-name-long' : 'slx-skill-name', text: s.name }),
          // A recovery skill that can also be cast from the labyrinth's field menu (SkillDef.field).
          ...(SKILLS[sk]?.field ? [el('span', { class: 'slx-field-tag', text: t.fieldTag })] : []),
          ...(takes ? [el('span', { class: 'slx-skill-slots', text: slotDots(m, sk) })] : []),
          ...(s.passive ? [] : [el('span', { class: 'slx-skill-target', text: t.targets[s.target] })]),
          el('span', { class: 'slx-skill-cost', text: s.passive ? t.passive : t.tp(treeCost(m, sk, skillCost(caster, sk))) }),
          // A skill she knows outside her tree (Rin's mark) has no rank to show.
          el('span', { class: 'slx-skill-rank', text: NODES[sk] ? t.rank(nodeRank(m, sk), NODES[sk].node.maxRank) : t.innate }),
        ]),
        el('p', { class: 'slx-desc', text: s.desc }),
        ...changed.map((p) => el('p', { class: 'slx-skill-power', text: p.text })),
        ...runes.map((x) => el('p', { class: x.state === 'off' ? 'slx-skill-rune slx-line-off' : 'slx-skill-rune' }, [
          `${T.rune.label(x.ref!.id, x.ref!.tier)}：${RUNES[x.ref!.id].text(x.ref!.tier)}`,
          ...(x.state === 'off' && x.why ? [el('span', { class: 'slx-line-note', text: T.ui2.workshop.off(x.why) })] : []),
        ])),
      ]);
      if (takes) node.addEventListener('click', () => { if (!locked(node)) redraw(() => { skillsView.note = ''; toWorkshop(ctx, id, sk); }); });
      return node;
    })]);
  },
};

/** A skill name this long or longer (two variants on one skill) is set a size smaller on the skills page. */
const LONG_SKILL_NAME = 9;

/** How far one click on a ▲/▼ cue scrolls the tree columns or the talent board: about one row of nodes. */
const CUE_STEP = 40;

/** ▲ while more of `pane` is above, ▼ while more is below; neither when it fits (as the equip detail panel's). */
function scrollCues(pane: HTMLElement, up: HTMLElement, down: HTMLElement): void {
  const room = Math.max(0, pane.scrollHeight - pane.clientHeight);
  up.hidden = !(room > 1 && pane.scrollTop > 0);
  down.hidden = !(room > 1 && pane.scrollTop < room - 1);
}

/**
 * `pane` (the sheet's page, or the tree columns or the talent board, which scroll on their own above the fixed notes) in
 * a frame with the ▲/▼ cues, which stand in for a native scrollbar (the sheet shows none): they show while more is
 * hidden that way, and a click (or tap) on one scrolls it. `keep` hears every new scroll position, so a redraw can put
 * the pane back where it was (the redraw then calls `updateCues`).
 */
export function cueFrame(cls: string, pane: HTMLElement, keep: (top: number) => void): HTMLElement {
  const cue = (c: string, text: string, d: 1 | -1) => {
    const b = el('span', { class: `slx-more ${c}`, text, attrs: { 'aria-hidden': 'true', hidden: '' } });
    b.addEventListener('click', () => {
      if (locked(b)) return;
      pane.scrollTop = Math.max(0, Math.min(pane.scrollHeight - pane.clientHeight, pane.scrollTop + d * CUE_STEP));
      keep(pane.scrollTop);
      scrollCues(pane, up, down);
    });
    return b;
  };
  const up = cue('slx-more-up', '▲', -1);
  const down = cue('slx-more-down', '▼', 1);
  pane.addEventListener('scroll', () => {
    keep(pane.scrollTop);
    scrollCues(pane, up, down);
  });
  return el('div', { class: `slx-cue-frame ${cls}` }, [up, pane, down]);
}

/**
 * Scrolls `pane` (only it: nothing around it moves) just enough to show `node` whole, and not at all when it already shows
 * (plan 8d Task 5: a nudge of a few pixels used to hide the branch names at 1280). `head`, its branch's name, stays pinned
 * at the top of the columns (sticky, 8d Task 6 review), so a row shows only below it.
 */
export function revealIn(pane: HTMLElement, node: HTMLElement, head: HTMLElement | null): void {
  const p = pane.getBoundingClientRect(), r = node.getBoundingClientRect();
  const top = p.top + (head?.getBoundingClientRect().height ?? 0);
  if (r.top < top) pane.scrollTop = Math.max(0, pane.scrollTop - (top - r.top));
  else if (r.bottom > p.bottom) pane.scrollTop += Math.min(r.bottom - p.bottom, r.top - top);   // its top never goes under the name
}

/** The cues of the cue frame around `pane`, brought up to date after a redraw has set its scroll position. */
export function updateCues(pane: HTMLElement): void {
  const frame = pane.parentElement;
  const up = frame?.querySelector<HTMLElement>(':scope > .slx-more-up');
  const down = frame?.querySelector<HTMLElement>(':scope > .slx-more-down');
  if (up && down) scrollCues(pane, up, down);
}

/**
 * Node cursor, the press waiting for its confirmation and the last refusal of the tree page. The cursor is kept for the
 * session like the stats page's; a waiting press and a refusal are dropped whenever the cursor moves, the member
 * changes or the page goes away (`settle`).
 */
const treeView: { cur: string; spend: SpendState; msg: string; reveal: boolean; top: number } = { cur: '', spend: { pending: null }, msg: '', reveal: false, top: 0 };

/** Back to the first-visit state: the cursor on the first node, nothing pending. */
export function resetTreeView(): void {
  treeView.cur = '';
  treeView.reveal = false;
  leaveTree();
}

function settle(): void {
  cancelSpend(treeView.spend);
  treeView.msg = '';
}

/** The page went away: drop a waiting press, and the next visit starts with the columns at the top. */
function leaveTree(): void {
  settle();
  treeView.top = 0;
}

/**
 * Every node of the member's tree in cursor order: branch 0 tiers 0-4, then branch 1, then branch 2; a pair's A side
 * before its B side.
 */
const treeOrder = (id: CharacterId): string[] => TREES[id].branches.flatMap((b) => branchNodes(b).map((x) => x.node.id));

type NodeKind = keyof typeof T.ui2.tree.kind;
function kindOf(n: TreeNode, tier: number): NodeKind {
  if (tier === 4) return 'ultimate';
  if (n.kind !== 'active') return n.kind;
  return SKILLS[n.skill!]?.passive ? 'passive' : 'active';
}
/** 火之星彈, 火之星彈・連星, 冷靜 (data/trees nodeName). */
const nodeName = (n: TreeNode) => treeNodeName(n.id);


/** Moves the tree cursor to `node`, dropping a waiting press when the cursor actually moves. */
function moveTree(node: string): boolean {
  if (treeView.cur === node) return false;
  treeView.cur = node;
  settle();
  return true;
}

/** Why `node` is shut, in words; an abyss node names the memories its branch needs. */
function treeReason(why: RaiseFail, node: string): string {
  return why === 'abyss' ? T.ui2.tree.reason.abyss(ABYSS_UNLOCK[NODES[node].branch]) : T.ui2.tree.reason[why];
}

/**
 * Enter on the cursor's node, or a click on `clicked` (which selects it first): the shared two-press spend, through the
 * Game so the spend is saved. On the empty side of a pair whose other side holds points the same two presses change
 * the side instead, free (Game.swapVariant).
 */
function pressTree(ctx: SceneCtx, id: CharacterId, clicked?: string): void {
  const node = clicked ?? treeView.cur;
  if (canRaiseNode(ctx.game.state.party.roster[id], node) === 'pair') {
    // The first press already asks the Game, so a swap it would turn down (in battle) is never armed.
    const can = () => ctx.game.canSwapVariant(id, node);
    const swap = () => ctx.game.swapVariant(id, node).ok;
    const r = clicked ? clickSpend(treeView.spend, node, moveTree, can, swap, ctx.sfx) : pressSpend(treeView.spend, node, can, swap, ctx.sfx);
    treeView.msg = r === 'armed' ? T.ui2.tree.swapPending : r === 'raised' ? T.ui2.tree.swapped : T.ui2.tree.swapRefused;
    return;
  }
  const can = () => canRaiseNode(ctx.game.state.party.roster[id], node);
  const raise = () => ctx.game.raiseNode(id, node).ok;
  const r = clicked ? clickSpend(treeView.spend, node, moveTree, can, raise, ctx.sfx) : pressSpend(treeView.spend, node, can, raise, ctx.sfx);
  treeView.msg = r === 'armed' ? T.ui2.tree.pending : r === 'raised' ? '' : r === 'failed' ? T.ui2.tree.failed : treeReason(r.refused, node);
}

/**
 * What the next rank of an active node changes, by the engine's own rule (progression.rankMod), at rank `rank`: power or
 * a buff's percent (「下一級：威力 100% → 110%」), or, for a skill with nothing to scale, its TP (「下一級：TP −1」) or its
 * rounds (「下一級：持續 +1 回合」). Null when the next rank changes nothing.
 */
export function nextRankText(skill: string, rank: number): string | null {
  const t = T.ui2.tree;
  const now = rankMod({ [skill]: rank }, skill), next = rankMod({ [skill]: rank + 1 }, skill);
  if (!next) return null;
  if (next.powerPct !== undefined || next.buffPct !== undefined) return t.next(next.powerPct !== undefined ? 'power' : 'buff', ACTIVE_RANK_PCT[rank - 1], ACTIVE_RANK_PCT[rank]);
  if (next.tpDelta !== undefined) return t.nextMod(t.mod({ tpDelta: next.tpDelta - (now?.tpDelta ?? 0) }));
  // 收回: its rounds are how long the recalled phase stays, said as such (the whole count at the next rank).
  if (next.turnsDelta !== undefined && SKILLS[skill]?.effects.some((e) => e.kind === 'moon')) return t.nextHold(next.turnsDelta);
  if (next.turnsDelta !== undefined) return t.nextMod(t.mod({ turnsDelta: next.turnsDelta - (now?.turnsDelta ?? 0) }));
  return null;
}

/** The notes under the tree for the cursor's node: what it does now and what its next rank changes. */
function treeNotes(ctx: SceneCtx, id: CharacterId): HTMLElement {
  const t = T.ui2.tree;
  const m = ctx.game.state.party.roster[id];
  const { node: n, tier } = NODES[treeView.cur];
  const rank = nodeRank(m, n.id);
  const head = [el('span', { class: 'slx-tree-info-name', text: nodeName(n) }), el('span', { text: t.kind[kindOf(n, tier)] }), el('span', { text: T.ui2.status.rank(rank, n.maxRank) })];
  let desc = '';
  const change: HTMLElement[] = [];
  if (n.kind === 'active') {
    // The skill as this member casts it, at the TP she pays (as on the skills page: fromMember, so runes count too).
    const caster = fromMember(m, 0);
    const s = skillFor(caster, n.skill!);
    if (s) {
      head.push(el('span', { class: 'slx-tree-use', text: s.passive ? T.ui2.status.passive : `${T.ui2.status.targets[s.target]}　${T.ui2.status.tp(skillCost(caster, n.skill!))}` }));
      desc = s.desc;
    }
    // What a further rank changes, by the engine's own rule (power, a percent, TP or rounds).
    const next = rank > 0 && rank < n.maxRank ? nextRankText(n.skill!, rank) : null;
    if (next) change.push(el('span', { class: 'slx-tree-next', text: next }));
  } else {
    // A variant or mechanic node: its rule now and at the next rank, in its own sentence. A new variant's words are its
    // skill's (its rule comes in the lines below); a mechanic node has a rule and nothing else.
    if (n.kind === 'variant' && n.label !== undefined) desc = SKILLS[n.skill!]?.desc ?? '';
    change.push(el('span', { class: 'slx-tree-now', text: t.now(rank > 0 ? nodeText(n.id, rank) : t.none) }));
    if (rank < n.maxRank) change.push(el('span', { class: 'slx-tree-next', text: t.nextMod(nodeText(n.id, rank + 1)) }));
  }
  // A shut node says why as soon as the cursor is on it (a pressed refusal in `msg` says the same, so it is not doubled);
  // the empty side of a taken pair says it can be chosen instead.
  const why = rank === 0 ? canRaiseNode(m, n.id) : null;
  const say = why === 'pair' ? t.swapOpen : why ? treeReason(why, n.id) : '';
  const shut = say && treeView.msg !== say ? say : '';
  return el('div', { class: 'slx-tree-info' }, [
    el('p', { class: 'slx-tree-info-head' }, head),
    el('p', { class: 'slx-desc', text: desc }),
    ...(change.length ? [el('p', { class: 'slx-tree-change' }, change)] : []),
    ...(shut ? [el('p', { class: 'slx-tree-reason', text: shut })] : []),
    ...(treeView.msg ? [el('p', { class: 'slx-tree-msg', text: treeView.msg, attrs: { role: 'status' } })] : []),
  ]);
}

const tree: StatusTab = {
  id: 'tree',
  label: T.ui2.status.tabs.tree,
  hint: T.ui2.status.hintTree,
  render(ctx, id, redraw) {
    const t = T.ui2.tree;
    const m = ctx.game.state.party.roster[id];
    // Another member's tree: the cursor starts over. A waiting press was already dropped by `leave` (a stale key is
    // another tree's id, so it could never match a node here).
    if (!treeOrder(id).includes(treeView.cur)) treeView.cur = treeOrder(id)[0];
    const branches = TREES[id].branches;
    const capstone = branches.flatMap((b) => tierNodes(b, 4)).filter((n) => nodeRank(m, n.id) > 0);
    const row = (n: TreeNode, tier: number): HTMLElement => {
      const rank = nodeRank(m, n.id);
      const why = canRaiseNode(m, n.id);
      // The empty side of a pair whose other side holds points can take them over, free (`pressTree`).
      const swap = rank === 0 && why === 'pair';
      const state = rank > 0 ? 'slx-node-learned' : swap ? 'slx-node-swap' : why ? 'slx-node-locked' : 'slx-node-open';
      const said = swap ? t.swapOpen : why ? treeReason(why, n.id) : t.open;
      const nodeEl = el('div', {
        class: `slx-skill slx-tree-node ${state}${treeView.cur === n.id ? ' slx-row-cur' : ''}`,
        // Hover alone shows why a shut node is shut (the tooltip), for a pointer that has not clicked it.
        attrs: { 'data-node': n.id, role: 'button', ...(rank === 0 && why ? { title: said } : {}) },
      }, [
        // An active shows its skill's icon. A variant's name starts with the skill it changes (火之星彈・連星), so it goes
        // without, and the whole row is its name's (8d Task 6 review: no name wraps); a mechanic node has no skill at all.
        ...(n.skill && !(n.kind === 'variant' && n.label !== undefined) ? skillIco(ctx, n.skill) : []),
        el('div', { class: 'slx-skill-head' }, [
          // A name of five characters or more (護盾產生器) is set a size smaller, so it stays whole on its node. A variant's
          // (火之星彈・連星) may break onto a second line between its skill and its label, never inside either.
          n.kind === 'variant' && n.label !== undefined
            // A variant too long for its row names its skill short there (砲台・雙砲台; data/trees.ts `short`).
            ? el('span', { class: 'slx-skill-name slx-skill-name-long slx-skill-name-variant' }, [
              el('span', { text: n.short ?? SKILLS[n.skill!]?.name ?? n.skill! }), el('span', { text: `・${n.label}` }),
            ])
            : el('span', { class: nodeName(n).length >= 5 ? 'slx-skill-name slx-skill-name-long' : 'slx-skill-name', text: nodeName(n) }),
          el('span', { class: 'slx-skill-rank', text: T.ui2.status.rank(rank, n.maxRank) }),
        ]),
        el('div', { class: 'slx-tree-node-foot' }, [
          el('span', { class: 'slx-tree-kind', text: t.kind[kindOf(n, tier)] }),
          el('span', { class: 'slx-tree-state', text: said }),
        ]),
      ]);
      // The first click selects and arms the node; a second click on it spends (or changes the side of a pair). A row the
      // columns cut off comes whole into view, as with the keys (`shown`; nothing moves when it already shows).
      nodeEl.addEventListener('click', () => {
        if (locked(nodeEl)) return;
        redraw(() => { pressTree(ctx, id, n.id); treeView.reveal = true; });
      });
      return nodeEl;
    };
    /** A tier's cell: one node, or a pair drawn as two rows, A above B, with 二選一 between them. */
    const cell = (b: TreeBranch, tier: number): HTMLElement => {
      const [a, bSide] = tierNodes(b, tier);
      if (!bSide) return row(a, tier);
      return el('div', { class: 'slx-tree-pair', attrs: { 'data-tier': String(tier) } }, [
        row(a, tier), el('div', { class: 'slx-tree-pair-tag', text: t.pairTag }), row(bSide, tier),
      ]);
    };
    const cols = branches.map((b, bi) => {
      // Points put into the branch: its ranks (both sides of a pair), less branch 0's free first rank.
      const spent = branchNodes(b).reduce((s, x) => s + nodeRank(m, x.node.id), 0) - (bi === 0 ? Math.min(1, nodeRank(m, freeNode(id))) : 0);
      return el('section', { class: 'slx-tree-branch', attrs: { 'data-branch': String(bi) } }, [
        // Five branches (the hero's) are narrow: the name on one line, its points on the next, both whole (plan 8g Task 5).
        branches.length > 3
          ? el('h5', { class: 'slx-tree-branch-name' }, [
            el('span', { class: 'slx-tree-branch-title', text: b.name }),
            el('span', { class: 'slx-tree-branch-pts', text: t.branch(b.name, spent).slice(b.name.length) }),
          ])
          : el('h5', { class: 'slx-tree-branch-name', text: t.branch(b.name, spent) }),
        ...b.nodes.map((_, tier) => cell(b, tier)),
      ]);
    });
    // The columns scroll on their own above the fixed notes, with ▲/▼ cues; a redraw keeps where they were (see `shown`).
    const colsEl = el('div', { class: branches.length > 3 ? 'slx-tree-cols slx-tree-wide' : 'slx-tree-cols' }, cols);
    return el('div', { class: 'slx-tab-tree' }, [
      el('div', { class: 'slx-tree-top' }, [
        el('span', { class: 'slx-tree-left', text: t.left(skillPointsLeft(m)) }),
        el('span', { class: 'slx-tree-capstone', text: capstone.length ? t.capstone(capstone.map(nodeName).join('、')) : t.noCapstone(rulesOf(id).capstones) }),
      ]),
      cueFrame('slx-tree-frame', colsEl, (top) => { treeView.top = top; }),
      treeNotes(ctx, id),
    ]);
  },
  onAction(a, ctx, id) {
    if (a === 'up' || a === 'down') {
      const list = treeOrder(id);
      const i = Math.max(0, list.indexOf(treeView.cur));
      if (moveTree(list[Math.max(0, Math.min(list.length - 1, i + (a === 'down' ? 1 : -1)))])) ctx.sfx.cursor();
      treeView.reveal = true;
      return true;
    }
    if (a === 'confirm') {
      pressTree(ctx, id);
      return true;
    }
    return false;
  },
  leave: leaveTree,
  reveal() { treeView.reveal = true; },
  shown(body) {
    const cols = body.querySelector<HTMLElement>('.slx-tree-cols');
    if (!cols) return;
    cols.scrollTop = treeView.top;
    if (treeView.reveal) {
      treeView.reveal = false;
      const node = cols.querySelector<HTMLElement>('.slx-tree-node.slx-row-cur');
      if (node) revealIn(cols, node, node.closest('.slx-tree-branch')?.querySelector<HTMLElement>('.slx-tree-branch-name') ?? null);
      treeView.top = cols.scrollTop;
    }
    updateCues(cols);
  },
};

/**
 * Node cursor, waiting press and last refusal of the talent page; kept and dropped exactly as the tree page's
 * (`treeView`): the cursor for the session, a waiting press and a refusal until the cursor moves, the member changes or
 * the page goes away.
 */
const talentView: { cur: string; spend: SpendState; msg: string; reveal: boolean; top: number } = { cur: '', spend: { pending: null }, msg: '', reveal: false, top: 0 };

/** Back to the first-visit state: the cursor on the first node, nothing pending. */
export function resetTalentView(): void {
  leaveTalent();
  talentView.cur = '';
  talentView.reveal = false;
}

function settleTalent(): void {
  cancelSpend(talentView.spend);
  talentView.msg = '';
}

/**
 * The page went away: drop a waiting press. The next visit starts with the board at the top and then brings the kept
 * cursor's node into view (`shown`), so a cursor on a low row or a keystone is never left off-screen.
 */
function leaveTalent(): void {
  settleTalent();
  talentView.top = 0;
  talentView.reveal = true;
}

/** The member's talent nodes: row 0 columns 0-3, row 1, ... row 5, then the keystones (BOARDS order). */
const talentOrder = (id: CharacterId): string[] => BOARDS[id].map((n) => n.id);

/**
 * The board as the keys walk it: ↑/↓ go to the row above or below in the same column (the keystone row has three, so
 * column 3 lands on its last one), held at the top and bottom rows; Tab goes along the row and wraps.
 */
function talentStep(id: CharacterId, from: string, how: 'up' | 'down' | 'swap'): string {
  const nodes = BOARDS[id];
  const at = nodes.find((n) => n.id === from) ?? nodes[0];
  const inRow = (r: number) => nodes.filter((n) => n.row === r);
  if (how === 'swap') {
    const row = inRow(at.row);
    return row[(row.indexOf(at) + 1) % row.length].id;
  }
  const row = inRow(Math.max(0, Math.min(BOARD_ROWS, at.row + (how === 'down' ? 1 : -1))));
  return (row.find((n) => n.col === at.col) ?? row[row.length - 1]).id;
}

/** A saved talent record as the board rules read it: anything but a plain object is empty (as progression reads it). */
const heldTalents = (t: unknown): Record<string, number> =>
  (typeof t === 'object' && t !== null && !Array.isArray(t) ? t as Record<string, number> : {});

/** A normal node's bonus per rank, as the sheet adds it (progression talentStats). */
const perRank = (n: TalentNode): number => Math.round(TALENT_PER[n.stat!]! * TALENT_SCALE * 10) / 10;

/** Moves the talent cursor to `node`, dropping a waiting press when the cursor actually moves. */
function moveTalent(node: string): boolean {
  if (talentView.cur === node) return false;
  talentView.cur = node;
  settleTalent();
  return true;
}

/** The words for a refused talent raise; the keystone cap reads the character's own limit. */
const talentReason = (why: TalentFail, id: CharacterId): string => {
  const r = T.ui2.talent.reason[why];
  return typeof r === 'function' ? r(rulesOf(id).maxKeystones) : r;
};

/** Enter on the cursor's node, or a click on `clicked` (which selects it first): the shared spend, as the tree page's. */
function pressTalent(ctx: SceneCtx, id: CharacterId, clicked?: string): void {
  const t = T.ui2.talent;
  const node = clicked ?? talentView.cur;
  const can = () => canRaiseTalent(ctx.game.state.party.roster[id], node);
  const raise = () => ctx.game.raiseTalent(id, node).ok;
  const r = clicked ? clickSpend(talentView.spend, node, moveTalent, can, raise, ctx.sfx) : pressSpend(talentView.spend, node, can, raise, ctx.sfx);
  talentView.msg = r === 'armed' ? t.pending : r === 'raised' ? '' : r === 'failed' ? t.failed : talentReason(r.refused, id);
}

/** The notes under the board for the cursor's node: its bonus per rank and what it gives now, or the keystone's effect. */
function talentNotes(ctx: SceneCtx, id: CharacterId): HTMLElement {
  const t = T.ui2.talent;
  const m = ctx.game.state.party.roster[id];
  const n = BOARDS[id].find((x) => x.id === talentView.cur)!;
  const rank = rankOf(n, heldTalents(m.talents));
  const why = canRaiseTalent(m, n.id);
  const key = n.keystone ? KEYSTONES[n.keystone] : null;
  const name = key ? key.name : T.gear.statName[n.stat!];
  const per = key ? 0 : perRank(n);
  return el('div', { class: 'slx-talent-info' }, [
    el('p', { class: 'slx-talent-info-head' }, [
      el('span', { class: 'slx-talent-info-name', text: name }),
      el('span', { text: key ? t.keystone : t.row(n.row + 1) }),
      el('span', { text: T.ui2.status.rank(rank, n.maxRank) }),
      el('span', { class: 'slx-talent-state', text: why ? talentReason(why, id) : t.open }),
    ]),
    key
      ? el('p', { class: 'slx-desc', text: key.desc })
      : el('p', { class: 'slx-talent-now', text: t.note(name, n.stat!, per, Math.round(per * rank * 10) / 10) }),
    ...(why === 'adjacent' ? [el('p', { class: 'slx-desc', text: t.adjacentRule })] : []),
    ...(talentView.msg ? [el('p', { class: 'slx-talent-msg', text: talentView.msg, attrs: { role: 'status' } })] : []),
  ]);
}

/** The memory keystone's line under the board: a companion only (the hero has none), awake or waiting on her pieces or her oath. */
function memoryLine(m: Member): HTMLElement[] {
  if (m.id === 'hero') return [];
  const t = T.ui2.talent;
  const k = KEYSTONES[MEMORY_KEYSTONES[m.id]];
  const awake = memoryKeystoneAwake(m);
  return [el('div', { class: `slx-talent-memkey ${awake ? 'slx-memkey-awake' : 'slx-memkey-locked'}` }, [
    // A sleeping keystone keeps its name back: the name would tell what the memories hold.
    // Rin's wakes on her oath, not her pieces, so her hint says so without naming the choice.
    el('span', { class: 'slx-talent-memkey-name', text: t.memoryKeystone(awake ? k.name : T.ui2.handbook.unknown) }),
    el('span', { class: 'slx-talent-memkey-desc', text: awake ? k.desc : m.id === 'rin' ? t.memoryLockedRin : t.memoryLocked(chainLength(m.id)) }),
  ])];
}

const talent: StatusTab = {
  id: 'talent',
  label: T.ui2.status.tabs.talent,
  hint: T.ui2.status.hintTalent,
  render(ctx, id, redraw) {
    const t = T.ui2.talent;
    const m = ctx.game.state.party.roster[id];
    const held = heldTalents(m.talents);
    // Another member's board: the cursor starts over (a waiting press was already dropped by `leave`).
    if (!talentOrder(id).includes(talentView.cur)) talentView.cur = talentOrder(id)[0];
    const cell = (n: TalentNode) => {
      const rank = rankOf(n, held);
      const why = canRaiseTalent(m, n.id);
      const state = rank > 0 ? 'slx-node-learned' : why ? 'slx-node-locked' : 'slx-node-open';
      const key = n.keystone ? KEYSTONES[n.keystone] : null;
      const node = el('div', {
        class: `slx-talent-node ${state}${rank >= n.maxRank ? ' slx-node-maxed' : ''}${talentView.cur === n.id ? ' slx-row-cur' : ''}`,
        attrs: { 'data-node': n.id, role: 'button' },
      }, [
        el('div', { class: 'slx-talent-head' }, [
          el('span', { class: 'slx-talent-name', text: key ? key.name : T.gear.statName[n.stat!] }),
          el('span', { class: 'slx-talent-rank', text: T.ui2.status.rank(rank, n.maxRank) }),
        ]),
        // Two lines a cell so more rows fit; a keystone's rule is in the notes under the board.
        el('div', { class: 'slx-talent-sub' }, [
          ...(key ? [] : [el('span', { class: 'slx-talent-per', text: t.per(n.stat!, perRank(n)) })]),
          el('span', { class: 'slx-talent-state', text: t.cell[why ?? 'open'] }),
        ]),
      ]);
      // The first click selects and arms the node; a second click on it spends.
      node.addEventListener('click', () => {
        if (locked(node)) return;
        redraw(() => pressTalent(ctx, id, n.id));
      });
      return node;
    };
    // Each row is labelled by its tier and lines up under the one above, so a node's three neighbours above
    // (adjacency) sit right over it.
    const rows = Array.from({ length: BOARD_ROWS }, (_, r) => el('div', { class: 'slx-talent-row', attrs: { 'data-row': String(r) } }, [
      el('span', { class: 'slx-talent-tier', text: t.tier(r + 1) }),
      ...BOARDS[id].filter((n) => !n.keystone && n.row === r).map(cell),
    ]));
    // The board scrolls on its own above the fixed notes, with ▲/▼ cues; a redraw keeps where it was (see `shown`).
    const board = el('div', { class: rulesOf(m.id).boardCols > 4 ? 'slx-talent-board slx-talent-wide' : 'slx-talent-board' }, [
      ...rows,
      el('h5', { class: 'slx-talent-keys-head', text: t.keysHead(rulesOf(m.id).maxKeystones) }),
      el('div', { class: 'slx-talent-keys' }, BOARDS[id].filter((n) => n.keystone).map(cell)),
    ]);
    return el('div', { class: 'slx-tab-talent' }, [
      el('div', { class: 'slx-talent-top' }, [
        el('span', { class: 'slx-talent-left', text: t.left(talentPointsLeft(m)) }),
        el('span', { class: 'slx-talent-count', text: t.keystones(boardKeystonesOf(m).length, rulesOf(m.id).maxKeystones) }),
        el('span', { class: 'slx-talent-gate', text: t.board(boardPoints(id, held)) }),
      ]),
      cueFrame('slx-talent-frame', board, (top) => { talentView.top = top; }),
      ...memoryLine(m),
      talentNotes(ctx, id),
    ]);
  },
  onAction(a, ctx, id) {
    if (a === 'up' || a === 'down' || a === 'swap') {
      if (moveTalent(talentStep(id, talentView.cur, a))) ctx.sfx.cursor();
      talentView.reveal = true;
      return true;
    }
    if (a === 'confirm') {
      pressTalent(ctx, id);
      return true;
    }
    return false;
  },
  leave: leaveTalent,
  reveal() { talentView.reveal = true; },
  shown(body) {
    const board = body.querySelector<HTMLElement>('.slx-talent-board');
    if (!board) return;
    board.scrollTop = talentView.top;
    if (talentView.reveal) {
      talentView.reveal = false;
      board.querySelector('.slx-talent-node.slx-row-cur')?.scrollIntoView?.({ block: 'nearest' });
      talentView.top = board.scrollTop;
    }
    updateCues(board);
  },
};

const ultimate: StatusTab = {
  id: 'ultimate',
  label: T.ui2.status.tabs.ultimate,
  render(ctx, id) {
    const m = ctx.game.state.party.roster[id];
    const u = ultimateFor(m.id, m.tree, m);
    return el('div', { class: 'slx-tab-ultimate' }, [
      el('h4', { text: u.name }),
      el('p', { class: 'slx-desc', text: u.desc }),
      el('p', { text: T.ui2.status.gauge(m.limit ?? 0) }),
    ]);
  },
};

export const STATUS_TABS: StatusTab[] = [stats, gear, skills, tree, talent, ultimate];
