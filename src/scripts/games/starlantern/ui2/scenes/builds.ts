import { BUILDS, buildOf, type BuildDef } from '../../data/builds';
import { CHARACTERS } from '../../data/characters';
import { RUNES, type RuneId, type RuneTier } from '../../data/runes';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { TREES, nodeName, tierNodes } from '../../data/trees';
import { applyBuild, applyCost, buildTree, pitchOf, policyText } from '../../engine/builds';
import { MAX_LEVEL, activeIds } from '../../engine/party';
import { memoriesOf } from '../../engine/progression';
import type { GameState } from '../../engine/state';
import type { CharacterId, Member } from '../../engine/types';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, backControl, confirmBox, win } from '../widgets';
import { cueFrame, updateCues } from './statusTabs';

const B = T.ui2.builds;

/** How far one R/F scrolls the card: about three lines. */
const CARD_STEP = 36;
/** Rows of the build list on screen (the hero's six fit). */
const LIST_ROWS = 10;

type Act = 'apply' | 'stop';
/** One card's worked-out parts. */
interface Sel { rows: RuneRow[]; price: ReturnType<typeof applyCost>; marks: { ultimates: string[]; sides: string[] } }
/** One suggested rune on the card: in reach (`have`: worn or in the bag), lacking, or waiting for a slot or skill. */
interface RuneRow { skill: string; id: RuneId; state: 'have' | 'lack' | 'later'; text: string; tier?: RuneTier }

/**
 * What applying `b` would leave on each of its suggested runes: the engine's own apply on the state as it is (gold aside,
 * so a card short of gold still says what it would do). Never changes the game.
 */
function runeRows(state: Parameters<typeof applyBuild>[0], id: CharacterId, b: BuildDef): RuneRow[] {
  const r = applyBuild({ ...state, gold: Number.MAX_SAFE_INTEGER }, id, b.key);
  if (!r.ok) return [];
  const after = r.state.party.roster[id];
  return Object.entries(b.runes).flatMap(([skill, ids]) => ids.flatMap((rid, slot): RuneRow[] => {
    const name = RUNES[rid].name;
    const held = after.sockets?.[skill]?.[slot];
    if (held?.id === rid) return [{ skill, id: rid, state: 'have', text: T.rune.label(rid, held.tier), tier: held.tier }];
    const miss = r.missing.find((x) => x.skill === skill && x.id === rid);
    if (miss) return [{ skill, id: rid, state: 'lack', text: 'from' in miss ? T.build.missing(name, T.build.from[miss.from]) : T.build.refused(name) }];
    const later = r.later.find((x) => x.skill === skill && x.id === rid);
    if (later) return [{ skill, id: rid, state: 'later', text: 'memories' in later ? T.build.laterMemories(name, later.memories) : T.build.later(name, later.level) }];
    return [];
  }));
}

/** The tree `b` lays out for `m` at the top level: the ultimates it reaches and the B sides of pairs it takes. */
function treeMarks(m: Member, b: BuildDef): { ultimates: string[]; sides: string[] } {
  const full = buildTree(m.id, MAX_LEVEL, b, memoriesOf(m));
  const branches = TREES[m.id].branches;
  const ultimates = branches.flatMap((br) => tierNodes(br, 4)).filter((n) => (full[n.id] ?? 0) > 0).map((n) => nodeName(n.id));
  const sides = branches.flatMap((br) => br.nodes.flatMap((n) => (n.pair && (full[n.pair.id] ?? 0) > 0 ? [nodeName(n.pair.id)] : [])));
  return { ultimates, sides };
}

/**
 * The suggested builds (plan 8h Task 7, spec §16): a member's builds on the left, the card of the one under the cursor on
 * the right (what it does, where it shines, its play, its tree, each suggested rune and whether it is in reach, what
 * applying costs), the buttons under it.
 *
 * Keys, the one place they are defined:
 * - ↑↓ move in the list; ←→ (or Tab) between the buttons when there are two (the build she follows: 套用, 停止跟隨).
 * - Enter does the button under the cursor; a row itself only picks (Task 7 review). 套用 asks first (the inn's confirm)
 *   when it costs gold, changes her tree or talents, or takes a worn rune off its slot (plan 8h ruling 12); a build that
 *   only fills runes applies at once. 停止跟隨 always asks first.
 * - R/F scroll the card. Q/E change member. Esc leaves: to the status sheet's tree tab when it opened this, else back.
 * - The mouse and touch: hovering or tapping a row moves the cursor there; the buttons take a click. Under the confirm box
 *   nothing else takes the pointer.
 *
 * In town everything applies. In the labyrinth (`phase === 'map'` with a run) the screen only reads: the buttons are grey,
 * the foot says 回城後才能套用, and Q/E pass over the members on the field.
 */
export class BuildsScene implements Scene {
  private id!: CharacterId;
  private key = 'standard';
  /** The button under the cursor (an index into `acts`). */
  private actAt = 0;
  private msg = '';
  private refused = '';
  private cardTop = 0;
  private box: ReturnType<typeof confirmBox> | null = null;

  private sceneEl!: HTMLElement;
  private head!: HTMLElement;
  private listWin!: HTMLElement;
  private cardWin!: HTMLElement;
  private cardBody!: HTMLElement;
  private btns!: HTMLElement;
  private footWhy!: HTMLElement;
  private footMsg!: HTMLElement;
  /** How to stop following, beside the buttons while the card is the build she follows (story depth Task 20). */
  private footNote!: HTMLElement;
  private backEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private view: MenuView | null = null;
  private viewKey = '';
  /**
   * What each card shows (its runes, price and tree marks), worked out once per member and build for the state it was
   * worked out on: a cursor move back to a card, or a redraw, clones no state again (plan 8h final review).
   */
  private seen: { state: GameState | null; cards: Map<string, Sel> } = { state: null, cards: new Map() };

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const list = this.members;
    const who = this.ctx.arg as CharacterId;
    this.id = list.includes(who) ? who : list.includes('hero') ? 'hero' : list[0];
    this.key = this.followed ?? 'standard';
    this.head = win('slx-bd-head');
    this.listWin = win('slx-bd-list');
    this.cardBody = el('div', { class: 'slx-bd-card-body' });
    this.btns = el('div', { class: 'slx-bd-btns' });
    this.footWhy = el('p', { class: 'slx-bd-why' });
    this.footMsg = el('p', { class: 'slx-bd-msg' });
    this.footNote = el('p', { class: 'slx-bd-note' });
    this.cardWin = win('slx-bd-card', [
      cueFrame('slx-bd-card-frame', this.cardBody, (top) => { this.cardTop = top; }),
      el('div', { class: 'slx-bd-foot', attrs: { role: 'status', 'aria-live': 'polite' } }, [this.btns, this.footNote, this.footWhy, this.footMsg]),
    ]);
    this.backEl = backControl(() => this.onAction('cancel'));
    this.hintEl = el('p', { class: 'slx-keyhint' });
    this.sceneEl = el('div', { class: 'slx-scene slx-builds' }, [this.head, this.listWin, this.cardWin, this.hintEl, this.backEl]);
    root.append(this.sceneEl);
    this.render();
  }

  exit(): void { this.box = null; }

  onAction(a: UiAction): void {
    if (this.box) { this.box.view.onAction(a); return; }
    switch (a) {
      case 'prev': case 'next': this.page(a === 'next' ? 1 : -1); return;
      case 'scrollUp': case 'scrollDown': this.scrollCard(a === 'scrollDown' ? CARD_STEP : -CARD_STEP); return;
      case 'left': case 'right': case 'swap': {
        const n = this.acts.length;
        if (n < 2) return;
        this.actAt = (this.actAt + (a === 'left' ? n - 1 : 1)) % n;
        this.ctx.sfx.cursor();
        this.renderFoot();
        return;
      }
      case 'up': case 'down': this.view?.onAction(a); return;
      case 'confirm': this.act(this.acts[this.actAt]); return;
      case 'cancel': this.back(); return;
      default:
    }
  }

  private get game() { return this.ctx.game; }
  private get member(): Member { return this.game.state.party.roster[this.id]; }
  /** In the labyrinth: the map phase with a run (as the workshop reads it). */
  private get field(): boolean { return this.game.phase === 'map' && !!this.game.run; }
  private get town(): boolean { return this.game.phase === 'town'; }
  private get members(): CharacterId[] {
    const p = this.game.state.party;
    return this.field ? activeIds(p) : p.recruited;
  }
  /** The build she follows, if it is one of hers. */
  private get followed(): string | undefined {
    const k = this.member.build;
    return k !== undefined && buildOf(this.id, k) ? k : undefined;
  }
  private get build(): BuildDef { return buildOf(this.id, this.key) ?? BUILDS[this.id][0]; }
  /** The card under the cursor, from `seen` while the state is the same. */
  private get sel(): Sel {
    const s = this.game.state;
    if (this.seen.state !== s) this.seen = { state: s, cards: new Map() };
    const k = `${this.id}|${this.key}`;
    let c = this.seen.cards.get(k);
    if (!c) {
      const b = this.build;
      c = { rows: runeRows(s, this.id, b), price: applyCost(s, this.id, b.key), marks: treeMarks(this.member, b) };
      this.seen.cards.set(k, c);
    }
    return c;
  }
  /** The buttons of the card: the build she follows can be applied again (to fill its runes) and stopped. */
  private get acts(): Act[] { return this.followed === this.key ? ['apply', 'stop'] : ['apply']; }
  /** 「目前 Lv N，建議 Lv M 以上」 when she is below the build's suggested level, else ''. */
  private get under(): string {
    const min = this.build.minLevel;
    return min !== undefined && this.member.level < min ? B.underLevel(this.member.level, min) : '';
  }

  private page(d: 1 | -1): void {
    const list = this.members;
    if (list.length < 2) return;
    this.id = list[(list.indexOf(this.id) + d + list.length) % list.length];
    this.key = this.followed ?? 'standard';
    this.reset();
    this.ctx.sfx.cursor();
    this.render();
  }

  /** A new build or member under the cursor: the first button, nothing said, the card at its top. */
  private reset(): void {
    this.actAt = 0;
    this.msg = '';
    this.refused = '';
    this.cardTop = 0;
  }

  private back(): void {
    this.ctx.sfx.cancel();
    if (this.ctx.from === 'status') this.ctx.go('status', `tab:tree:${this.id}`);
    else this.ctx.go(this.ctx.from ?? 'inn');
  }

  private act(what: Act): void {
    if (!this.town) { this.refuse(B.townOnly); return; }
    const name = CHARACTERS[this.id].name;
    if (what === 'stop') { this.ask(B.askStop(name, this.build.name), () => this.stop()); return; }
    const c = this.game.canApplyBuild(this.id, this.key);
    if (c.reason) { this.refuse(T.reasons[c.reason] ?? T.reasons.invalid); return; }
    if (c.cost > 0 || c.changes || c.strips) {
      const notes = [c.moves ? B.reassign : c.changes ? B.addPoints : '', c.strips ? B.strip(name) : '', this.under].filter((n) => n);
      this.ask(B.askApply(name, this.build.name, c.cost, notes), () => this.apply());
      return;
    }
    this.apply();
  }

  /** The inn's confirm, on 否 first; `yes` runs on 是. */
  private ask(question: string, yes: () => void): void {
    this.ctx.sfx.confirm();
    const box = confirmBox(question, (ok) => {
      this.closeBox();
      if (ok) yes(); else this.ctx.sfx.cancel();
    });
    box.view.menu.setCursor(1); box.view.render();
    this.box = box;
    this.sceneEl.append(box.el);
    this.lock(true);
  }

  private closeBox(): void {
    this.box?.el.remove();
    this.box = null;
    this.lock(false);
  }

  /** Under the confirm box the windows and 返回 take no pointer. */
  private lock(on: boolean): void {
    for (const w of [this.head, this.listWin, this.cardWin, this.backEl]) w.toggleAttribute('inert', on);
  }

  private apply(): void {
    const r = this.game.applyBuild(this.id, this.key);
    if (!r.ok) { this.refuse(T.reasons[r.reason] ?? T.reasons.invalid); return; }
    this.done(B.applied(CHARACTERS[this.id].name, this.build.name, r.placed.length, r.missing.length, r.returned), 'apply');
  }

  private stop(): void {
    this.game.stopFollowing(this.id);
    // Said here: the town has nothing to repeat.
    this.game.followEnded = this.game.followEnded.filter((x) => x !== this.id);
    this.done(B.stopped(CHARACTERS[this.id].name, this.build.name), 'stop');
  }

  /** A change made: the cue, the line (and a failed save), the cursor on the same button where it still is. */
  private done(msg: string, what: Act): void {
    this.ctx.sfx.confirm();
    const failed = this.game.notice === 'save-failed';
    this.game.notice = null;
    this.msg = failed ? `${msg}${T.notices['save-failed']}` : msg;
    this.refused = '';
    this.actAt = Math.max(0, this.acts.indexOf(what));
    this.render();
  }

  private refuse(why: string): void {
    this.ctx.sfx.error();
    this.refused = why;
    this.msg = '';
    this.renderFoot();
  }

  private scrollCard(px: number): void {
    const b = this.cardBody;
    b.scrollTop = Math.max(0, Math.min(Math.max(0, b.scrollHeight - b.clientHeight), b.scrollTop + px));
    this.cardTop = b.scrollTop;
    updateCues(b);
  }

  // ---- drawing ----

  private render(): void {
    this.renderHead();
    this.renderList();
    this.renderCard();
    this.renderFoot();
  }

  private renderHead(): void {
    const arrow = (text: string, a: UiAction) => {
      const b = el('span', { class: 'slx-status-arrow', text, attrs: { role: 'button' } });
      b.addEventListener('click', () => { if (!b.closest('[inert]')) this.onAction(a); });
      return b;
    };
    this.head.replaceChildren(
      arrow('←', 'prev'),
      el('div', { class: 'slx-bd-name' }, [el('b', { text: CHARACTERS[this.id].name }), el('span', { text: `Lv ${this.member.level}` })]),
      arrow('→', 'next'),
      el('span', { class: 'slx-bd-title', text: B.title }),
    );
  }

  private renderList(): void {
    const followed = this.followed;
    const items: MenuItem[] = BUILDS[this.id].map((b) => ({ id: b.key, label: b.name, ...(b.key === followed ? { right: B.following } : {}) }));
    const sig = `${this.id}|${items.map((it) => `${it.id}:${it.right ?? ''}`).join(',')}`;
    const at = Math.max(0, items.findIndex((it) => it.id === this.key));
    if (this.view && sig === this.viewKey) {
      this.view.menu.setCursor(at);
      this.view.render();
      return;
    }
    this.viewKey = sig;
    this.view = new MenuView(new Menu(items, at), {
      // A row only picks (Task 7 review): what it does is on the buttons.
      pick: (it) => {
        if (it.id === this.key) return;
        this.key = it.id;
        this.reset();
        this.ctx.sfx.cursor();
        this.render();
      },
      moved: () => {
        const now = this.view?.menu.current()?.id;
        if (!now || now === this.key) return;
        this.key = now;
        this.reset();
        this.ctx.sfx.cursor();
        this.renderCard();
        this.renderFoot();
      },
    }, LIST_ROWS);
    this.listWin.replaceChildren(el('div', { class: 'slx-area-head', text: B.listHead }), this.view.el);
  }

  private renderCard(): void {
    const b = this.build;
    const following = this.followed === b.key;
    const { rows, price, marks: { ultimates, sides } } = this.sel;
    const skills = Object.keys(b.runes);
    const out: HTMLElement[] = [
      el('div', { class: 'slx-bd-card-name' }, [el('b', { text: b.name }), ...(following ? [el('span', { class: 'slx-bd-tag', text: B.following })] : [])]),
      el('p', { class: 'slx-bd-intro', text: pitchOf(b) }),
      ...(this.under ? [el('p', { class: 'slx-bd-under', text: this.under })] : []),
      ...(b.scenario ? [el('p', { class: 'slx-bd-scenario', text: B.scenario[b.scenario] })] : []),
      // What is in reach and what is missing first (the user: 「缺什麼直接寫出來」), then the play and the tree.
      el('h5', { class: 'slx-bd-sub', text: B.runesHead }),
      ...(skills.length ? [el('p', { class: 'slx-bd-legend', text: B.have })] : [el('p', { text: B.noRunes })]),
      ...skills.map((skill) => el('div', { class: 'slx-bd-skill' }, [
        el('span', { class: 'slx-bd-skill-name', text: SKILLS[skill]?.name ?? skill }),
        ...rows.filter((r) => r.skill === skill).map((r) => el('span', {
          class: `slx-bd-rune slx-bd-${r.state}${r.tier ? ` slx-rarity-${r.tier}` : ''}`,
          attrs: { 'data-skill': skill, 'data-rune': r.id, 'data-state': r.state },
          text: r.state === 'have' ? `◆${r.text}` : r.state === 'lack' ? `○${r.text}` : r.text,
        })),
      ])),
      el('h5', { class: 'slx-bd-sub', text: B.policyHead }),
      el('ul', { class: 'slx-bd-policy' }, policyText(b).map((line) => el('li', { text: line }))),
      el('h5', { class: 'slx-bd-sub', text: B.treeHead(MAX_LEVEL) }),
      el('p', { class: 'slx-bd-tree', text: ultimates.length ? B.ultimate(ultimates) : B.noUltimate }),
      ...(sides.length ? [el('p', { class: 'slx-bd-tree', text: B.sides(sides) })] : []),
      el('p', { class: 'slx-bd-follow', text: following ? B.followingNow : B.follow }),
      ...(price ? [el('p', { class: 'slx-bd-cost', text: price.cost > 0 ? B.cost(price.cost) : price.changes ? B.costFree : price.strips ? B.costStrip : B.costFill })] : []),
    ];
    this.cardBody.replaceChildren(...out);
    this.cardBody.scrollTop = this.cardTop;
    updateCues(this.cardBody);
  }

  private renderFoot(): void {
    const acts = this.acts;
    this.actAt = Math.min(this.actAt, acts.length - 1);
    const price = this.sel.price;
    const off = !this.town;
    this.btns.replaceChildren(...acts.map((a, i) => {
      const text = a === 'stop' ? B.stopFollow : price && price.cost > 0 ? B.apply(price.cost) : B.applyFree;
      const btn = el('span', {
        class: `slx-bd-btn${i === this.actAt ? ' slx-sel' : ''}`,
        text,
        attrs: { role: 'button', 'data-act': a, 'aria-disabled': String(off) },
      });
      btn.addEventListener('pointermove', () => {
        if (btn.closest('[inert]') || this.actAt === i) return;
        this.actAt = i;
        this.renderFoot();
      });
      btn.addEventListener('click', () => {
        if (btn.closest('[inert]')) return;
        this.actAt = i;
        this.act(a);
      });
      return btn;
    }));
    this.footNote.textContent = this.followed === this.key ? B.stopHint : '';
    this.footWhy.textContent = off ? B.townOnly : this.refused;
    this.hintEl.textContent = acts.length > 1 ? B.hint : B.hintOne;
    this.footMsg.textContent = this.msg;
  }
}
