import { BUILDS, buildOf, type BuildDef } from '../../data/builds';
import { CHARACTERS } from '../../data/characters';
import { RUNES, type RuneId, type RuneTier } from '../../data/runes';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { TREES, nodeName, tierNodes } from '../../data/trees';
import { applyBuild, applyCost, buildTree, pitchOf, policyText } from '../../engine/builds';
import { MAX_LEVEL, activeIds } from '../../engine/party';
import { memoriesOf } from '../../engine/progression';
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
 * - ↑↓ move in the list; ←→ (or Tab) between the buttons when there are two (the build she follows: 停止跟隨, 套用).
 * - Enter does the button under the cursor. 套用 asks first (the inn's confirm) when it costs gold or lays out her tree or
 *   talents anew (plan 8h ruling 12); a build that only fills runes applies at once.
 * - R/F scroll the card. Q/E change member. Esc leaves: to the status sheet's tree tab when it opened this, else back.
 * - The mouse: hovering a row moves the cursor there, a click is that plus Enter; a touch tap on a row not picked yet
 *   only picks it. The buttons take a click. Under the confirm box nothing else takes the pointer.
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
  /** The row a touch tap picked: a second tap on it does it (plan 8g ruling 11). Any other action clears it. */
  private armed = '';
  private pressedBy = '';
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
  private backEl!: HTMLElement;
  private view: MenuView | null = null;
  private viewKey = '';

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
    this.cardWin = win('slx-bd-card', [
      cueFrame('slx-bd-card-frame', this.cardBody, (top) => { this.cardTop = top; }),
      el('div', { class: 'slx-bd-foot', attrs: { role: 'status', 'aria-live': 'polite' } }, [this.btns, this.footWhy, this.footMsg]),
    ]);
    this.backEl = backControl(() => this.onAction('cancel'));
    this.sceneEl = el('div', { class: 'slx-scene slx-builds' }, [
      this.head, this.listWin, this.cardWin, el('p', { class: 'slx-keyhint', text: B.hint }), this.backEl,
    ]);
    root.append(this.sceneEl);
    this.render();
  }

  exit(): void { this.box = null; }

  onAction(a: UiAction): void {
    if (this.box) { this.box.view.onAction(a); return; }
    this.armed = '';
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
  /** The buttons of the card: the build she follows can be stopped, and applied again to fill its runes. */
  private get acts(): Act[] { return this.followed === this.key ? ['stop', 'apply'] : ['apply']; }

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
    if (what === 'stop') { this.stop(); return; }
    const c = this.game.canApplyBuild(this.id, this.key);
    if (c.reason) { this.refuse(T.reasons[c.reason] ?? T.reasons.invalid); return; }
    if (c.cost > 0 || c.changes) { this.ask(c.cost); return; }
    this.apply();
  }

  private ask(cost: number): void {
    this.ctx.sfx.confirm();
    const box = confirmBox(B.askApply(CHARACTERS[this.id].name, this.build.name, cost), (yes) => {
      this.closeBox();
      if (yes) this.apply(); else this.ctx.sfx.cancel();
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
    this.done(B.applied(CHARACTERS[this.id].name, this.build.name, r.placed.length, r.missing.length), 'apply');
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
      arrow('◀', 'prev'),
      el('div', { class: 'slx-bd-name' }, [el('b', { text: CHARACTERS[this.id].name }), el('span', { text: `Lv ${this.member.level}` })]),
      arrow('▶', 'next'),
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
      pick: (it) => {
        // A touch tap on a row not picked yet only picks it; the second tap on it does its button.
        const touch = this.pressedBy === 'touch';
        this.pressedBy = '';
        if (it.id !== this.key) { this.key = it.id; this.reset(); this.render(); }
        if (touch && this.armed !== it.id) { this.armed = it.id; this.ctx.sfx.cursor(); return; }
        this.armed = '';
        this.act(this.acts[this.actAt]);
      },
      moved: () => {
        const now = this.view?.menu.current()?.id;
        this.armed = '';
        if (!now || now === this.key) return;
        this.key = now;
        this.reset();
        this.ctx.sfx.cursor();
        this.renderCard();
        this.renderFoot();
      },
    }, LIST_ROWS);
    // What pressed a row: read by `pick` above (a click event may carry no pointerType: Safari).
    this.view.el.addEventListener('pointerdown', (e) => { this.pressedBy = e.pointerType; }, true);
    this.view.el.addEventListener('click', (e) => { this.pressedBy = (e as PointerEvent).pointerType || this.pressedBy; }, true);
    this.listWin.replaceChildren(el('div', { class: 'slx-area-head', text: B.listHead }), this.view.el);
  }

  private renderCard(): void {
    const b = this.build;
    const m = this.member;
    const following = this.followed === b.key;
    const rows = runeRows(this.game.state, this.id, b);
    const { ultimates, sides } = treeMarks(m, b);
    const price = applyCost(this.game.state, this.id, b.key);
    const skills = Object.keys(b.runes);
    const out: HTMLElement[] = [
      el('div', { class: 'slx-bd-card-name' }, [el('b', { text: b.name }), ...(following ? [el('span', { class: 'slx-bd-tag', text: B.following })] : [])]),
      el('p', { class: 'slx-bd-intro', text: pitchOf(b) }),
      ...(b.scenario ? [el('p', { class: 'slx-bd-scenario', text: B.scenario[b.scenario] })] : []),
      // What is in reach and what is missing first (the user: 「缺什麼直接寫出來」), then the play and the tree.
      el('h5', { class: 'slx-bd-sub', text: B.runesHead }),
      ...(skills.length ? [el('p', { class: 'slx-bd-legend', text: `${B.have}　${B.lack}` })] : [el('p', { text: B.noRunes })]),
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
      ...(price ? [el('p', { class: 'slx-bd-cost', text: price.cost > 0 ? B.cost(price.cost) : price.changes ? B.costFree : B.costFill })] : []),
    ];
    this.cardBody.replaceChildren(...out);
    this.cardBody.scrollTop = this.cardTop;
    updateCues(this.cardBody);
  }

  private renderFoot(): void {
    const acts = this.acts;
    this.actAt = Math.min(this.actAt, acts.length - 1);
    const price = applyCost(this.game.state, this.id, this.key);
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
    this.footWhy.textContent = off ? B.townOnly : this.refused;
    this.footMsg.textContent = this.msg;
  }
}
