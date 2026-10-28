import { CHARACTER_IDS, CHARACTERS } from '../../data/characters';
import { REGIONS } from '../../data/regions';
import { ENEMIES } from '../../data/enemies';
import { SETS, SPECIALS, codexName } from '../../data/gear';
import { chainLength } from '../../data/story/chains';
import { TOWN_FRAGMENTS } from '../../data/story/fragments';
import type { SceneId } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { BEAST_FILTERS, handbook, type BeastFilter, type BondPage, type Handbook, type MonsterPage, type SceneEntry } from '../../engine/story/handbook';
import { BESTIARY_UI } from '../../data/bestiary.zh-TW';
import { MATERIALS } from '../../data/materials';
import { ROSTER_LIVE } from '../../data/monsters';
import { AFFIXES, AFFIX_IDS } from '../../data/affixes';
import { TIERS } from '../../data/difficulty';
import type { Difficulty } from '../../engine/battle';
import type { GameState } from '../../engine/state';
import { HELL_BOSS_DEPTH, NIGHTMARE_DEPTH, tierUnlocked } from '../../engine/tiers';
import type { Lead } from '../../engine/story/leads';
import type { CharacterId } from '../../engine/types';
import { art, enemyArt } from '../../render/artPaths';
import { artIdOf } from '../../ui/art';
import { el, itemName } from '../../ui/dom';
import type { UiAction } from '../input';
import { awaitArt } from '../lateArt';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { textCps } from '../settings';
import { playScene, storyCtx } from '../story';
import { Dialogue, MenuView, backControl, win } from '../widgets';

const H = T.ui2.handbook;
const TABS = ['memories', 'people', 'leads', 'town', 'codex', 'truths', 'tiers'] as const;
type Tab = (typeof TABS)[number];

/**
 * The pages this save shows, in order (difficulty plan ruling 25): 難度 only once Nightmare opens. Turning and tapping go
 * through this list, so a locked tier page is never reached.
 */
export function tabsFor(s: GameState): Tab[] {
  return TABS.filter((t) => t !== 'tiers' || tierUnlocked(s, 'nightmare'));
}
const TIER_IDS: readonly Difficulty[] = ['normal', 'nightmare', 'hell'];
/** How many rows of a list are on screen at once. */
const LIST_ROWS = 10;

/** The standee on the left: whose, and whether the person is still a silhouette. */
interface Shown { id: CharacterId; met: boolean }
/** One list on a page: its rows, what a pick does, and the detail beside the cursor. */
interface Level {
  key: string; /** No detail column at all: the list takes the whole width. */ solo?: boolean; rows: MenuItem[]; pick(id: string): void; detail(id: string | undefined): Node[]; shown(id: string | undefined): Shown | null;
  /** Roster plan Task C6: the foe whose picture stands on the left in place of a standee (a kind seen in the bestiary). */
  foe?(id: string | undefined): string | null;
}

const paras = (lines: string[]) => lines.map((text) => el('p', { text }));
/** Bond plan Task 14 (spec §4.8): her tier and points, each source against its cap (已滿 once full), and what she was offered. */
const bondBlock = (b: BondPage): HTMLElement => {
  const B = T.ui2.bond;
  const src = (k: keyof BondPage['sources']) => { const [now, cap] = b.sources[k]; return B.count(B.source[k], now, cap, now >= cap); };
  return el('div', { class: 'slx-hb-bond' }, paras([
    B.score(B.tiers[b.tier], b.points),
    ...(['memory', 'talk', 'gift', 'field'] as const).map(src),
    ...b.tastes.map((x) => B.known(itemName(x.mat), B.taste[x.taste])),
  ]));
};
const freshRight = (fresh: boolean): Pick<MenuItem, 'right' | 'rightClass'> => (fresh ? { right: H.fresh, rightClass: 'slx-fresh' } : {});

/**
 * The adventurer's handbook: five tabbed pages (Q/E or the arrows turn them). Scenes already seen can be played again here;
 * a replay changes no progress, it only drops the scene's 新 mark. Opened from the labyrinth it is the same book, and goes back there.
 */
export class HandbookScene implements Scene {
  private tab = 0;
  /** The character whose second list is open (a piece list, or a person's scenes); null on a tab's first list. */
  private sub: CharacterId | null = null;
  /** Roster plan Task C6: the bestiary filter open on the 圖鑑 page (its second list); null on the page's first list. */
  private beasts: BeastFilter | null = null;
  private cursors = new Map<string, number>();
  private view: MenuView | null = null;
  private level!: Level;
  private bodyEl!: HTMLElement;
  private closed = false;
  private talk: Dialogue;
  private playing: ReturnType<typeof playScene> | null = null;
  private sceneEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private backEl!: HTMLElement;
  private artEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private hintEl!: HTMLElement;

  constructor(private ctx: SceneCtx, charsPerSecond = textCps(ctx)) {
    this.talk = new Dialogue(charsPerSecond, () => { /* the replay owns the screen until it ends */ });
  }

  private readonly dungeon = () => this.ctx.arg === 'dungeon';

  enter(root: HTMLElement): void {
    this.artEl = el('div', { class: 'slx-status-art' });
    this.tabsEl = el('div', { class: 'slx-tabs', attrs: { role: 'tablist' } });
    this.listEl = el('div', { class: 'slx-hb-list' });
    this.detailEl = el('div', { class: 'slx-hb-detail' });
    this.hintEl = el('p', { class: 'slx-hint', text: this.dungeon() ? H.hintReadonly : H.hint });
    this.sceneEl = el('div', { class: 'slx-scene slx-status-scene slx-handbook' }, [
      this.artEl,
      (this.panelEl = win('slx-status-panel', [this.tabsEl, (this.bodyEl = el('div', { class: 'slx-hb-body' }, [this.listEl, this.detailEl])), this.hintEl])),
      (this.backEl = backControl(() => this.onAction('cancel'))),
      this.talk.el,
    ]);
    root.append(this.sceneEl);
    this.render();
  }

  exit(): void {
    this.closed = true;
    this.talk.stop();
  }

  onAction(a: UiAction): void {
    if (this.playing) { this.playing.onAction(a); return; }
    if (a === 'prev' || a === 'left') { this.turn(-1); return; }
    if (a === 'next' || a === 'right') { this.turn(1); return; }
    if (a === 'cancel') { this.back(); return; }
    this.view?.onAction(a);
  }

  private turn(d: 1 | -1): void {
    const n = tabsFor(this.ctx.game.state).length;
    this.tab = (this.tab + d + n) % n;
    this.sub = null;
    this.beasts = null;
    this.ctx.sfx.cursor();
    this.render();
  }

  private back(): void {
    this.ctx.sfx.cancel();
    if (this.sub) { this.sub = null; this.render(); return; }
    if (this.beasts) { this.beasts = null; this.render(); return; }
    this.ctx.go(this.dungeon() ? 'dungeon' : (this.ctx.from ?? 'town'));
  }

  // ---- The pages ----

  private memories(h: Handbook): Level {
    const pages = h.memories;
    if (this.sub === null) {
      return {
        key: 'memories', rows: pages.map((m): MenuItem => m.met
          ? { id: m.id, label: CHARACTERS[m.id].name, right: H.pieces(m.pieces.filter((p) => p.found).length, chainLength(m.id)), ...freshRight(m.fresh) }
          : { id: m.id, label: H.unknown }),
        pick: (id) => { if (pages.find((m) => m.id === id)!.met) { this.sub = id as CharacterId; this.render(); } else this.ctx.sfx.error(); },
        detail: () => [], solo: true, shown: (id) => (id ? { id: id as CharacterId, met: pages.find((m) => m.id === id)!.met } : null),
      };
    }
    const who = this.sub;
    const page = pages.find((m) => m.id === who)!;
    return {
      key: `memories/${who}`,
      // A found piece plays once told, or while it is still untold (story L spec §4.7: reading it here tells it, and it is new).
      rows: page.pieces.map((p): MenuItem => p.found && (p.seen || p.untold)
        ? { id: p.scene, label: STORY.scenes[p.scene].title, ...freshRight(p.fresh) }
        : { id: `hint:${p.n}`, label: H.unknown, right: p.hint }),
      pick: (id) => this.pickScene(id),
      detail: () => [], solo: true, shown: () => ({ id: who, met: page.met }),
    };
  }

  private people(h: Handbook): Level {
    const pages = h.people;
    const page = (id: string | undefined) => pages.find((p) => p.id === id);
    const detail = (p: Handbook['people'][number] | undefined): Node[] => !p ? [] : p.met
      ? [el('h4', { text: `${p.title} ${CHARACTERS[p.id].name}` }), ...paras(p.segments), ...(p.bond ? [bondBlock(p.bond)] : [])]
      : [];
    if (this.sub === null) {
      return {
        key: 'people', rows: pages.map((p): MenuItem => p.met
          ? { id: p.id, label: CHARACTERS[p.id].name, ...freshRight(p.scenes.some((e) => e.fresh)) }
          : { id: p.id, label: H.unknown }),
        pick: (id) => { if (page(id)!.scenes.length) { this.sub = id as CharacterId; this.render(); } else this.ctx.sfx.error(); },
        detail: (id) => detail(page(id)), shown: (id) => (id ? { id: id as CharacterId, met: page(id)!.met } : null),
      };
    }
    const who = this.sub;
    return {
      key: `people/${who}`, rows: page(who)!.scenes.map(this.sceneRow),
      pick: (id) => this.pickScene(id), detail: () => detail(page(who)), shown: () => ({ id: who, met: true }),
    };
  }

  private sceneRow = (e: SceneEntry): MenuItem => ({ id: e.scene, label: e.title, ...freshRight(e.fresh) });

  /**
   * The guild's leads (6c Task 16): the one to follow now (its place and the sighting, never a face), then the ones followed,
   * by name. Nothing here replays.
   */
  private leads(h: Handbook): Level {
    const L = H.leads;
    const { current, followed, allMet } = h.leads;
    const place = (l: Lead) => L.place(REGIONS[l.region].name, l.depth);
    const rows: MenuItem[] = [
      current ? { id: 'now', label: place(current), cls: 'slx-lead-now' } : { id: 'none', label: allMet ? L.allFound : L.none, disabled: true },
      ...followed.map((l): MenuItem => ({ id: l.id, label: CHARACTERS[l.id].name, right: L.found })),
    ];
    const of = (id: string | undefined) => followed.find((l) => l.id === id);
    return {
      key: 'leads', rows, pick: () => this.ctx.sfx.error(),
      detail: (id) => {
        if (id === 'now' && current) return [el('h4', { text: place(current) }), el('p', { class: 'slx-dim', text: `${L.now}・${L.heard}` }), el('p', { text: STORY.leads[current.id] })];
        const l = of(id);
        return l ? [el('h4', { text: CHARACTERS[l.id].name }), el('p', { class: 'slx-dim', text: `${place(l)}　${L.found}` }), el('p', { text: STORY.leads[l.id] })] : [];
      },
      shown: (id) => (of(id) ? { id: id as CharacterId, met: true } : null),
    };
  }

  private town(h: Handbook): Level {
    const page = (id: string | undefined) => h.town.find((p) => p.id === id);
    const npc = (id: string) => TOWN_FRAGMENTS.find((f) => f.id === id)!.npc;
    return {
      key: 'town', rows: h.town.map((p): MenuItem => p.status === 'unknown'
        ? { id: p.id, label: H.unknown, right: H.status.unknown }
        : { id: p.id, label: npc(p.id), ...(p.scene?.fresh ? freshRight(true) : { right: H.status[p.status] }) }),
      pick: (id) => { const s = page(id)?.scene; if (s) this.pickScene(s.scene); else this.ctx.sfx.error(); },
      detail: (id) => { const p = page(id); return p ? [el('h4', { text: p.status === 'unknown' ? H.unknown : npc(p.id) }), el('p', { class: 'slx-dim', text: H.status[p.status] }), ...paras(p.lines)] : []; },
      shown: () => null,
    };
  }

  /**
   * 圖鑑: the specials and sets found, then the bestiary's filters (roster plan Task C6, spec §10): 本道, 各地區 and
   * 頭目與守關者, each a row (only those that list a kind) that opens its own list of foes. While no roster foe is live
   * the page is the page it was (spec §0 item 20): the old kinds by name, each with its known weakness.
   */
  private codex(h: Handbook): Level {
    const c = h.codex;
    const bestiaryOn = ROSTER_LIVE.size > 0;
    if (this.beasts && bestiaryOn) return this.bestiary(c.monsters.filter((m) => m.filter === this.beasts), this.beasts);
    const have = (set: string) => SETS[set].pieces.filter((id) => this.ctx.game.state.codex.includes(id));
    const B = BESTIARY_UI;
    const of = (f: BeastFilter) => c.monsters.filter((m) => m.filter === f);
    const filters = BEAST_FILTERS.filter((f) => of(f).length);
    const revealed = this.ctx.game.state.revealed;
    const weakText = (w: string[] | null) => (w ? (w.length ? H.codex.weak(w.map((e) => T.element[e as keyof typeof T.element]).join('、')) : H.codex.none) : H.codex.weakUnknown);
    const rows: MenuItem[] = [
      ...c.specials.map((id): MenuItem => ({ id, label: codexName(id), cls: `slx-rarity-${SPECIALS[id].rarity}`, right: H.codex.rarity[SPECIALS[id].rarity] })),
      ...c.sets.map((id): MenuItem => ({ id, label: codexName(id), cls: 'slx-rarity-set', right: H.codex.setPieces(have(id).length, SETS[id].pieces.length) })),
      ...(bestiaryOn
        ? filters.map((f): MenuItem => ({ id: `beasts:${f}`, label: B.filters[f], right: B.count(of(f).filter((m) => m.seen).length, of(f).length) }))
        : c.monsters.map((m): MenuItem => ({ id: m.id, label: ENEMIES[m.id].name }))),
    ];
    return {
      key: 'codex', rows, shown: () => null,
      pick: (id) => { if (id.startsWith('beasts:')) { this.beasts = id.slice(7) as BeastFilter; this.render(); } else this.ctx.sfx.error(); },
      detail: (id) => {
        if (!id) return [];
        if (id.startsWith('beasts:')) {
          const list = of(id.slice(7) as BeastFilter);
          return [el('h4', { text: B.filters[id.slice(7) as BeastFilter] }), el('p', { class: 'slx-dim', text: B.count(list.filter((m) => m.seen).length, list.length) })];
        }
        if (id in SPECIALS) return [el('h4', { text: codexName(id) }), el('p', { text: SPECIALS[id].lore })];
        if (id in SETS) return [el('h4', { text: codexName(id) }), ...paras(have(id).map(codexName))];
        if (!bestiaryOn && id in ENEMIES) return [el('h4', { text: ENEMIES[id].name }), el('p', { text: weakText(revealed[id] ? [...revealed[id]] : null) })];
        return [];
      },
    };
  }

  /** One bestiary filter's foes: a kind not met is 「？？？」 and where it is met; one met shows what the bestiary knows. */
  private bestiary(list: MonsterPage[], f: BeastFilter): Level {
    const B = BESTIARY_UI;
    const of = (id: string | undefined) => list.find((m) => m.id === id);
    const weakText = (w: MonsterPage['weak']) => (w === 'prism' ? B.prism : w ? (w.length ? H.codex.weak(w.map((e) => T.element[e]).join('、')) : H.codex.none) : H.codex.weakUnknown);
    const detail = (m: MonsterPage | undefined): Node[] => {
      if (!m) return [];
      if (!m.seen) return [el('h4', { text: B.unknown }), el('p', { class: 'slx-dim', text: B.where(m.haunts) })];
      const known = m.felled
        ? [
          ...paras(m.lines),
          ...(m.mats.length ? [el('p', { class: 'slx-dim', text: B.mats(m.mats.map((id) => MATERIALS[id]?.name ?? id).join('、')) })] : []),
          ...(m.inscription ? [el('p', { class: 'slx-dim', text: B.inscription(T.gear.statName[m.inscription], !!m.inscribed) })] : []),
        ]
        : [el('p', { class: 'slx-dim', text: B.later })];
      return [
        el('h4', { text: m.name }),
        el('p', { class: 'slx-dim', text: B.where(m.haunts) }),
        el('p', { text: weakText(m.weak) }),
        el('p', { class: 'slx-dim', text: B.tally(m.seen, m.felled) }),
        ...(m.trait ? [el('p', { text: m.trait })] : []),
        ...known,
        ...(m.own ? [el('p', { class: 'slx-dim', text: B.own(codexName(m.own.id), m.own.got) })] : []),
      ];
    };
    return {
      key: `codex/${f}`,
      rows: list.map((m): MenuItem => ({ id: m.id, label: m.name, ...(m.felled ? { right: B.felledRow(m.felled) } : m.seen ? { right: B.seenRow } : {}) })),
      pick: () => this.ctx.sfx.error(), shown: () => null,
      detail: (id) => detail(of(id)),
      foe: (id) => { const m = of(id); return m && m.seen ? m.id : null; },
    };
  }

  private truths(h: Handbook): Level {
    const page = (id: string | undefined) => h.truths.find((p) => p.stage === id);
    return {
      key: 'truths', rows: h.truths.map((p): MenuItem => p.unlocked ? { id: p.stage, label: H.stages[p.stage], ...freshRight(p.scenes.some((e) => e.fresh)) } : { id: p.stage, label: H.unknown }),
      // The after page plays its scenes in a row: the finale, then the lantern festival (story depth ruling 12, Task 20).
      pick: (id) => { const ss = page(id)?.scenes ?? []; if (ss.length) void this.replay(ss.map((e) => e.scene)); else this.ctx.sfx.error(); },
      detail: (id) => { const p = page(id); return p?.text ? [el('h4', { text: H.stages[p.stage] }), el('p', { text: p.text })] : []; },
      shown: () => null,
    };
  }

  /**
   * The tiers (Task 7c): one row each, open or not, then the six affixes. The detail says what a tier changes, its numbers
   * from TIERS, and Hell's condition; an affix its line. Nothing here is picked.
   */
  private tiers(): Level {
    const P = H.tiers, N = T.ui2.tier.names;
    const s = this.ctx.game.state;
    const rows: MenuItem[] = [
      ...TIER_IDS.map((d): MenuItem => ({ id: `tier:${d}`, label: N[d], right: tierUnlocked(s, d) ? P.open : P.locked })),
      ...AFFIX_IDS.map((id): MenuItem => ({ id: `affix:${id}`, label: AFFIXES[id].name, right: P.affix })),
    ];
    const tierDetail = (d: Difficulty): Node[] => {
      if (d === 'normal') return [el('h4', { text: N.normal }), ...paras([P.normal, P.story])];
      const t = TIERS[d];
      const lines = [T.ui2.tier.what[d], P.rewards(Math.round((t.reward - 1) * 100)), P.affixes(t.eliteAffixes, t.bossAffixes, t.crowdAffixChance > 0), T.ui2.tier.suggest[d]];
      const cond = d === 'hell' ? T.ui2.tier.locked.hell(HELL_BOSS_DEPTH) : T.ui2.tier.locked.nightmare(NIGHTMARE_DEPTH);
      return [el('h4', { text: N[d] }), el('p', { class: 'slx-dim', text: `${tierUnlocked(s, d) ? P.open : P.locked}・${P.condition(cond)}` }), ...paras(lines)];
    };
    return {
      key: 'tiers', rows, pick: () => this.ctx.sfx.error(), shown: () => null,
      detail: (id) => {
        if (id?.startsWith('tier:')) return tierDetail(id.slice(5) as Difficulty);
        if (id?.startsWith('affix:')) { const a = AFFIXES[id.slice(6) as keyof typeof AFFIXES]; return [el('h4', { text: a.name }), el('p', { text: a.line }), el('p', { class: 'slx-dim', text: P.affixNote })]; }
        return [];
      },
    };
  }

  // ---- Drawing ----

  private render(): void {
    if (this.closed) return;
    const h = handbook(this.ctx.game.state);
    const tabs = tabsFor(this.ctx.game.state);
    this.tab = Math.min(this.tab, tabs.length - 1);
    const tab = tabs[this.tab];
    this.level = { memories: () => this.memories(h), people: () => this.people(h), leads: () => this.leads(h), town: () => this.town(h), codex: () => this.codex(h), truths: () => this.truths(h), tiers: () => this.tiers() }[tab]();
    this.bodyEl.classList.toggle('slx-hb-solo', !!this.level.solo);
    this.tabsEl.replaceChildren(...tabs.map((t, i) => {
      const b = el('span', { class: i === this.tab ? 'slx-tab slx-tab-sel' : 'slx-tab', text: H.tabs[t], attrs: { role: 'tab', 'aria-selected': String(i === this.tab) } });
      b.addEventListener('click', () => { if (this.playing) return; this.tab = i; this.sub = null; this.beasts = null; this.ctx.sfx.cursor(); this.render(); });
      return b;
    }));
    const key = this.level.key;
    const menu = new Menu(this.level.rows.length ? this.level.rows : [{ id: '', label: H.empty, disabled: true }], this.cursors.get(key) ?? 0);
    this.view = new MenuView(menu, {
      pick: (it) => { this.cursors.set(key, menu.cursor); this.ctx.sfx.confirm(); this.level.pick(it.id); },
      moved: () => { this.cursors.set(key, menu.cursor); this.ctx.sfx.cursor(); this.drawDetail(); },
      cancel: () => this.back(),
    }, LIST_ROWS);
    this.listEl.replaceChildren(this.view.el);
    this.drawDetail();
  }

  private drawDetail(): void {
    const id = this.view?.menu.current()?.id || undefined;
    this.detailEl.replaceChildren(...this.level.detail(id));
    const foe = this.level.foe?.(id) ?? null;
    if (foe) { this.drawFoe(foe); return; }
    const shown = this.level.shown(id);
    this.drawStandee(shown);
  }

  /**
   * Roster plan Task C6: a seen foe's own picture on the left, at a whole multiple of its size (twice for any but a boss),
   * once it has loaded; nothing until then. A foe not seen is never drawn, not even as a silhouette (ruling 18).
   */
  private drawFoe(id: string): void {
    const src = enemyArt(id);
    const here = this.ctx.art.has(src);
    awaitArt(this.artEl, 'standee', here ? [] : [src], () => { if (!this.closed) this.drawDetail(); });
    if (!here) { this.artEl.replaceChildren(); return; }
    const cur = this.artEl.firstElementChild;
    if (cur && cur.getAttribute('src') === src && cur.classList.contains('slx-hb-foe')) return;
    const cls = ENEMIES[id]?.boss ? 'slx-hb-foe' : 'slx-hb-foe slx-hb-foe-x2';
    this.artEl.replaceChildren(el('img', { class: cls, attrs: { src, alt: ENEMIES[id]?.name ?? '' } }));
  }

  /** The standee of whoever the cursor is on; a person not yet met is the same picture as a black silhouette. */
  private drawStandee(shown: Shown | null): void {
    const state = this.ctx.game.state;
    const face = shown ? artIdOf(state.party.roster[shown.id] ?? { id: shown.id, oath: undefined }) : null;
    const src = face && this.ctx.art.has(art.standee(face)) ? art.standee(face) : null;
    // A standee not here yet is drawn when it lands, if the cursor is still on her (ui2/lateArt).
    awaitArt(this.artEl, 'standee', face && !src ? [art.standee(face)] : [], () => { if (!this.closed) this.drawDetail(); });
    if (!src || !shown) { this.artEl.replaceChildren(); return; }
    // The same picture stays put, so its slide-in does not restart on every cursor move.
    const cur = this.artEl.firstElementChild;
    if (cur && cur.getAttribute('src') === src && cur.classList.contains('slx-silhouette') === !shown.met) return;
    this.artEl.replaceChildren(el('img', { class: shown.met ? 'slx-status-standee' : 'slx-status-standee slx-silhouette', attrs: { src, alt: shown.met ? CHARACTERS[shown.id].name : '' } }));
  }

  // ---- Replay ----

  private pickScene(id: string): void {
    if (!(id in STORY.scenes)) { this.ctx.sfx.error(); return; }
    void this.replay(id as SceneId);
  }

  /**
   * Plays scenes seen before, one after another, and drops each one's 新 mark as it ends. It never goes through sceneDone,
   * so no progress, reward or flag moves. Story L spec §4.7: a memory still untold is told by this read (`Game.tellEarly`):
   * seen, not new, out of the untold list and tonight's picks; a night that held it skips it.
   */
  private async replay(ids: SceneId | SceneId[]): Promise<void> {
    this.sceneEl.classList.add('slx-hb-playing');
    this.panelEl.setAttribute('inert', '');
    this.backEl.setAttribute('inert', '');
    try {
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const p = playScene(this.talk, id, storyCtx(this.ctx));
        this.playing = p;
        await p.done;
        if (!this.ctx.game.tellEarly(id)) this.ctx.game.markRead(id);
      }
    } catch (e) {
      console.error('starlantern: handbook replay failed', e);
    } finally {
      this.playing = null;
      this.sceneEl.classList.remove('slx-hb-playing');
      this.panelEl.removeAttribute('inert');
      this.backEl.removeAttribute('inert');
      this.render();
    }
  }
}
