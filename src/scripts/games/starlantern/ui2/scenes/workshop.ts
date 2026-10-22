import { CHARACTERS } from '../../data/characters';
import { buildOf } from '../../data/builds';
import { RESERVE_CAP, RUNES, RUNE_SLOT_LEVELS, runeKey, tiersOf, type RuneRef } from '../../data/runes';
import { T } from '../../data/text.zh-TW';
import { fromMember, skillFor } from '../../engine/battle';
import { bestInBag, policyText, runeSource } from '../../engine/builds';
import { lastingBarrierLoss } from '../../engine/mechanics/runes';
import { activeIds } from '../../engine/party';
import { bagCount, socketCount, socketRune, socketable, type SocketAt, type SocketFail } from '../../engine/sockets';
import type { CharacterId, Member } from '../../engine/types';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import type { GameState } from '../../engine/state';
import { cardOf, compareCards, failWhy, previewOf, reserveLine, runeChoices, slotDots, slotStates, type Card, type RuneAction, type RuneChoice } from '../skillCard';
import { textCps } from '../settings';
import { Dialogue, MenuView, backControl, win } from '../widgets';
import { cueFrame, updateCues } from './statusTabs';

const W = T.ui2.workshop;

type Focus = 'skills' | 'slots' | 'runes';

/** How far one R/F (or one click on the card's ▲/▼) scrolls the card: about three lines. */
const CARD_STEP = 36;
/** Rows of the skill list and the rune list on screen; longer lists scroll with the cursor. */
const SKILL_ROWS = 13;
const RUNE_ROWS = 12;
/**
 * Rows the 「缺：…」 line over the rune list may take (plan 8h): it wraps in the narrow column. With a followed build's line
 * under the title, both lists lose one row more.
 */
const LACK_ROWS = 3;

const label = (r: RuneRef): string => T.rune.label(r.id, r.tier);
/** Whether the player holds any rune: in the bag, or in anyone's slot. */
const holdsRune = (s: GameState): boolean => Object.values(s.runes ?? {}).some((n) => n > 0)
  || Object.values(s.party.roster).some((m) => Object.values(m.sockets ?? {}).some((cells) => cells.some((c) => c !== null)));
/** A rune row's id: `bag:<key>`, or `move:<member>:<skill>:<slot>` for a rune in someone's slot. */
const rowOf = (c: RuneChoice): string =>
  (c.source.kind === 'bag' ? `bag:${runeKey(c.source.ref)}` : `move:${c.source.at.id}:${c.source.at.skill}:${c.source.at.slot}`);
/** A card value in a cell: each of its 「／」 parts kept on one line (「84（每個目標）」 never breaks). */
const cell = (cls: string, text: string): HTMLElement => {
  const parts = text.split(W.join);
  return el('td', { class: cls }, parts.flatMap((p, i) => [...(i ? [W.join] : []), el('span', { class: 'slx-nb', text: p })]));
};

/**
 * The skill workshop (plan 8g, spec §6.8): a member's skills on the left, the card of the skill under the cursor in the
 * middle (before and after a rune, when one is picked), its slots on the right, and in place of the slots the runes for
 * the slot picked. Everything shown comes from ui2/skillCard.ts, so a preview is what socketing will do.
 *
 * Keys, the one place they are defined:
 * - ↑↓ move in the focused column (skills, slots or runes).
 * - Tab, → or ← switch between the skills and the slots.
 * - Enter on a skill goes to its slots; a skill with one slot opens that slot's runes at once (Esc goes back to the skills).
 *   Enter on an open slot opens its runes; a slot not open yet does nothing but the error cue.
 * - Enter on a rune does what the row says: a rune that cannot go in (its reason in the foot) only plays the error cue and
 *   changes nothing; 拆下 takes the slot's rune off. After a change the slots have the focus again (the skills for a skill
 *   with one slot), on the same slot, and the foot says what happened.
 * - R/F scroll the card. Q/E change member: the focus goes back to the skills, on the first one.
 * - Esc: the runes back to the slots (or the skills), the slots back to the skills, the skills leave: to the status page's
 *   skills tab when it opened the workshop, else to the screen before (the guild).
 * - The mouse: hovering a skill or a slot moves the cursor there (and the focus); a click is that plus Enter. A slot not
 *   open yet takes no click. While the runes are open the skills wait (inert); the rune list is a MenuView.
 *
 * In the labyrinth (`phase === 'map'`) Q/E pass over the members on the field only, as the equipment screen does.
 */
export class WorkshopScene implements Scene {
  private id!: CharacterId;
  private skill = '';
  private slot = 0;
  private focus: Focus = 'skills';
  /** The rune row under the cursor, by id: kept while the list is drawn again. */
  private runeCur = '';
  /** The rune row a touch tap picked: a second tap on it does it (plan 8g ruling 11). Any other action clears it. */
  private armed = '';
  /** What pressed the rune row being clicked: a touch tap only picks the row the first time. */
  private pressedBy = '';
  /** What the last action did, or why it was refused; cleared by the next move. */
  private msg = '';
  private refused = '';
  private cardTop = 0;

  private sceneEl!: HTMLElement;
  private head!: HTMLElement;
  private skillsWin!: HTMLElement;
  private cardWin!: HTMLElement;
  private cardBody!: HTMLElement;
  private footWhy!: HTMLElement;
  private footMsg!: HTMLElement;
  private slotsWin!: HTMLElement;
  private skillView: MenuView | null = null;
  private backEl!: HTMLElement;
  /** The narrator's box for the rune tutorial (plan 8g Task 6); hidden unless it plays. */
  private talk!: Dialogue;
  /** The tutorial's pages still to come while it plays (it takes the keys); null when it is not playing. */
  private tutorial: string[] | null = null;
  private skillKey = '';
  private runeView: MenuView | null = null;
  private runeKeyOf = '';

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const [who, skill] = (this.ctx.arg ?? '').split(':');
    const list = this.members;
    this.id = list.includes(who as CharacterId) ? (who as CharacterId) : list.includes('hero') ? 'hero' : list[0];
    const skills = this.skills;
    this.skill = skills.includes(skill) ? skill : skills[0] ?? '';

    this.head = win('slx-ws-head');
    this.skillsWin = win('slx-ws-skills');
    this.cardBody = el('div', { class: 'slx-ws-card-body' });
    this.footWhy = el('p', { class: 'slx-ws-why' });
    this.footMsg = el('p', { class: 'slx-ws-msg' });
    this.cardWin = win('slx-ws-card', [
      cueFrame('slx-ws-card-frame', this.cardBody, (top) => { this.cardTop = top; }),
      el('div', { class: 'slx-ws-foot', attrs: { role: 'status', 'aria-live': 'polite' } }, [this.footWhy, this.footMsg]),
    ]);
    this.slotsWin = win('slx-ws-slots');
    this.backEl = backControl(() => this.onAction('cancel'));
    // A dismissed page brings up the next at once (synchronously), so the keys never reach the screen in between.
    this.talk = new Dialogue(textCps(this.ctx), () => this.nextPage());
    this.sceneEl = el('div', { class: 'slx-scene slx-workshop' }, [
      this.head, this.skillsWin, this.cardWin, this.slotsWin,
      el('p', { class: 'slx-keyhint', text: W.hint }), this.backEl, this.talk.el,
    ]);
    root.append(this.sceneEl);
    this.render();
    // A player who already holds runes and has never read the rune tutorial reads it here first (plan 8g ruling 13).
    if (!this.game.state.runeTutorialSeen && holdsRune(this.game.state)) {
      this.tutorial = T.rune.tutorial(RUNE_SLOT_LEVELS, T.ui2.guild.workshop, T.ui2.dungeon.workshop);
      this.lock(true);
      this.nextPage();
    }
  }

  /** The tutorial's next page, or once it is read, the flag (saved at once in town) and the screen back. */
  private nextPage(): void {
    if (!this.tutorial) return;
    const line = this.tutorial.shift();
    if (line !== undefined) { void this.talk.say('', line); return; }
    this.tutorial = null;
    this.lock(false);
    this.game.seeRuneTutorial();
    this.render();
  }

  /** While the tutorial plays, the windows and 返回 under it take no pointer. */
  private lock(on: boolean): void {
    for (const w of [this.head, this.skillsWin, this.cardWin, this.slotsWin, this.backEl]) w.toggleAttribute('inert', on);
  }

  exit(): void { this.talk.stop(); }

  onAction(a: UiAction): void {
    if (this.tutorial) { this.talk.onAction(a); return; }
    this.armed = '';
    if (a !== 'confirm') { this.refused = ''; }
    switch (a) {
      case 'prev': case 'next': this.page(a === 'next' ? 1 : -1); return;
      case 'scrollUp': case 'scrollDown': this.scrollCard(a === 'scrollDown' ? CARD_STEP : -CARD_STEP); return;
      case 'swap': case 'left': case 'right':
        if (this.focus === 'runes') return;
        this.focus = this.focus === 'skills' ? 'slots' : 'skills';
        if (this.focus === 'slots') this.slot = Math.min(this.slot, Math.max(0, this.open - 1));
        this.ctx.sfx.cursor();
        this.render();
        return;
      case 'up': case 'down': this.move(a === 'down' ? 1 : -1); return;
      case 'confirm': this.pick(); return;
      case 'cancel': this.back(); return;
      default:
    }
  }

  private get game() { return this.ctx.game; }
  private get member(): Member { return this.game.state.party.roster[this.id]; }
  /** Who Q/E pass over: everyone recruited, or in the labyrinth the members on the field (the bench is in town). */
  private get members(): CharacterId[] {
    const p = this.game.state.party;
    return this.field ? activeIds(p) : p.recruited;
  }
  /** In the labyrinth: the map phase with a run (as the equipment screen reads it). */
  private get field(): boolean { return this.game.phase === 'map' && !!this.game.run; }
  private get skills(): string[] { return socketable(this.member); }
  /** Her open slots on every skill (socketCount). */
  private get open(): number { return socketCount(this.member.level); }
  private get at(): SocketAt { return { id: this.id, skill: this.skill, slot: this.slot }; }

  private page(d: 1 | -1): void {
    const list = this.members;
    if (list.length < 2) return;
    this.id = list[(list.indexOf(this.id) + d + list.length) % list.length];
    this.skill = this.skills[0] ?? '';
    this.slot = 0;
    this.focus = 'skills';
    this.msg = '';
    this.cardTop = 0;
    this.ctx.sfx.cursor();
    this.render();
  }

  private move(d: 1 | -1): void {
    if (this.focus === 'skills') { this.skillView?.onAction(d > 0 ? 'down' : 'up'); return; }
    if (this.focus === 'runes') { this.runeView?.onAction(d > 0 ? 'down' : 'up'); return; }
    const next = this.slot + d;
    if (next < 0 || next >= this.open) return;
    this.slot = next;
    this.msg = '';
    this.ctx.sfx.cursor();
    this.render();
  }

  private pick(): void {
    if (this.focus === 'skills') {
      if (!this.skill) { this.ctx.sfx.error(); return; }
      this.ctx.sfx.confirm();
      this.slot = Math.min(this.slot, Math.max(0, this.open - 1));
      this.toSlots();
      return;
    }
    if (this.focus === 'slots') {
      if (this.slot >= this.open) { this.ctx.sfx.error(); return; }
      this.ctx.sfx.confirm();
      this.openRunes();
      return;
    }
    this.act();
  }

  /** From a skill: its slots, or with one slot its runes at once. */
  private toSlots(): void {
    this.msg = '';
    if (this.open === 1) { this.slot = 0; this.openRunes(); return; }
    this.focus = 'slots';
    this.render();
  }

  private openRunes(): void {
    this.focus = 'runes';
    this.runeCur = '';
    this.msg = '';
    this.cardTop = 0;
    this.render();
  }

  private back(): void {
    this.ctx.sfx.cancel();
    this.msg = '';
    if (this.focus === 'runes') { this.focus = this.open === 1 ? 'skills' : 'slots'; this.render(); return; }
    if (this.focus === 'slots') { this.focus = 'skills'; this.render(); return; }
    if (this.ctx.from === 'status') this.ctx.go('status', `tab:skills:${this.id}`);
    else this.ctx.go(this.ctx.from ?? 'guild');
  }

  /** The slot's choices: the bag, then what the others hold (runeChoices' order). */
  private choices(): readonly RuneChoice[] {
    if (!this.game.state.runesOpen || !this.skill || this.slot >= this.open) return [];
    // In the labyrinth only the members on the field change runes, so only they hand one over (final review).
    return runeChoices(this.game.state, this.at, this.field ? activeIds(this.game.state.party) : undefined);
  }

  private choiceOf(rowId: string): RuneChoice | undefined {
    return this.choices().find((c) => rowOf(c) === rowId);
  }

  /** The rune now in the picked slot. */
  private held(): RuneRef | null {
    return this.member.sockets?.[this.skill]?.[this.slot] ?? null;
  }

  /** Enter on a rune row: take the slot's rune off, or put the row's rune in; a refusal changes nothing. */
  private act(): void {
    const row = this.runeView?.menu.current();
    if (!row) { this.ctx.sfx.error(); return; }
    const g = this.game;
    const held = this.held();
    const name = cardOf(this.member, this.skill)?.name ?? this.skill;
    if (row.id === 'remove') {
      const r = g.unsocketRune(this.id, this.skill, this.slot);
      if (!r.ok) { this.refuse(this.failWords(r.reason)); return; }
      this.done(W.removed(held ? label(held) : ''));
      return;
    }
    const choice = this.choiceOf(row.id);
    if (!choice) { this.refuse(''); return; }
    if (choice.why !== null) { this.refuse(choice.why); return; }
    const ref = choice.source.ref;
    const back = held ? W.backToBag(label(held)) : '';
    if (choice.source.kind === 'socket') {
      const from = choice.source.at;
      const giver = this.game.state.party.roster[from.id];
      const skill = skillFor(fromMember(giver, 0), from.skill)?.name ?? from.skill;
      const r = g.moveRune(from, this.at);
      if (!r.ok) { this.refuse(this.failWords(r.reason)); return; }
      this.done(W.moved(label(ref), CHARACTERS[from.id].name, skill) + back);
      return;
    }
    const r = g.socketRune(this.id, this.skill, this.slot, ref);
    if (!r.ok) { this.refuse(this.failWords(r.reason)); return; }
    this.done(W.socketed(label(ref), name) + back);
  }

  private failWords(reason: SocketFail | 'empty'): string {
    const F = T.rune.fail;
    if (reason === 'reserve') return F.reserve(RESERVE_CAP);
    const words = F[reason];
    return typeof words === 'string' ? words : '';
  }

  private refuse(why: string): void {
    this.ctx.sfx.error();
    this.refused = why;
    this.render();
  }

  private done(msg: string): void {
    this.ctx.sfx.confirm();
    this.msg = msg;
    this.refused = '';
    this.focus = this.open === 1 ? 'skills' : 'slots';
    this.cardTop = 0;
    this.render();
  }

  private scrollCard(px: number): void {
    const b = this.cardBody;
    b.scrollTop = Math.max(0, Math.min(Math.max(0, b.scrollHeight - b.clientHeight), b.scrollTop + px));
    this.cardTop = b.scrollTop;
    updateCues(b);
  }

  // ---- drawing ----

  private render(): void {
    this.sceneEl.dataset.focus = this.focus;
    this.skillsWin.classList.toggle('slx-area-on', this.focus === 'skills');
    this.slotsWin.classList.toggle('slx-area-on', this.focus !== 'skills');
    this.skillsWin.toggleAttribute('inert', this.focus === 'runes');
    this.renderHead();
    this.renderSkills();
    if (this.focus === 'runes') this.renderRunes(); else this.renderSlots();
    this.renderCard();
  }

  private renderHead(): void {
    const m = this.member;
    const arrow = (text: string, a: UiAction) => {
      const b = el('span', { class: 'slx-status-arrow', text, attrs: { role: 'button' } });
      b.addEventListener('click', () => { if (!b.closest('[inert]')) this.onAction(a); });
      return b;
    };
    const held = reserveLine(m);
    const b = this.followed;
    this.sceneEl.classList.toggle('slx-ws-following', !!b);
    this.head.replaceChildren(
      arrow('←', 'prev'),
      el('div', { class: 'slx-ws-name' }, [el('b', { text: CHARACTERS[this.id].name }), el('span', { text: `Lv ${m.level}` })]),
      arrow('→', 'next'),
      ...(held ? [el('span', { class: 'slx-ws-reserve', text: held })] : []),
      el('span', { class: 'slx-ws-title', text: W.title }),
      // The build she follows, its name and the first rule of its play (plan 8h ruling 14), on a line of its own.
      ...(b ? [el('p', { class: 'slx-ws-follow', text: W.following(b.name, policyText(b)[0]) })] : []),
    );
  }

  /** The suggested build she follows, if it is one of hers. */
  private get followed() {
    const k = this.member.build;
    return k === undefined ? undefined : buildOf(this.id, k);
  }

  /**
   * Over the rune list (plan 8h ruling 14): the runes her build suggests for this skill's open slots that are not in them.
   * 「缺：…」 what the bag lacks, with where it is found; 「可裝：…（袋子裡有）」 what the bag holds (final review); a rune
   * in the bag that its slot would refuse says why instead (Task 7 review). '' when nothing is missing or she follows none.
   */
  private lacking(): string {
    const b = this.followed;
    if (!b) return '';
    const s = this.game.state;
    const worn = (this.member.sockets?.[this.skill] ?? []).flatMap((r) => (r ? [r.id] : []));
    const lack: [string, string][] = [];
    const ready: [string, string][] = [];
    const refused: string[] = [];
    (b.runes[this.skill] ?? []).slice(0, this.open).forEach((id, slot) => {
      if (worn.includes(id)) return;
      const ref = bestInBag(s, id);
      if (!ref) { lack.push([RUNES[id].name, T.build.from[runeSource(id)]]); return; }
      const put = socketRune(s, this.id, this.skill, slot, ref);
      if (put.ok) ready.push([RUNES[id].name, W.inBag]);
      else refused.push(W.refusedWhy(RUNES[id].name, failWhy(put.reason, s, { id: this.id, skill: this.skill, slot }, ref)));
    });
    return [...(lack.length ? [W.lacking(lack)] : []), ...(ready.length ? [W.ready(ready)] : []), ...refused].join('　');
  }

  /** ◆ a working rune, ◇ a rune that does nothing, ○ an empty slot; slots not open yet are not drawn (skillCard slotDots). */
  private dots(skill: string): string {
    return slotDots(this.member, skill);
  }

  private renderSkills(): void {
    const skills = this.skills;
    if (!skills.length) {
      this.skillView = null;
      this.skillKey = '';
      this.skillsWin.replaceChildren(el('div', { class: 'slx-area-head', text: W.skillsHead }), el('p', { class: 'slx-desc', text: W.noSkills }));
      return;
    }
    const c = fromMember(this.member, 0);
    const items: MenuItem[] = skills.map((k) => ({ id: k, label: skillFor(c, k)?.name ?? k, right: this.dots(k) }));
    const key = `${this.id}|${items.map((it) => `${it.id}:${it.label}:${it.right}`).join(',')}`;
    if (!this.skillView || key !== this.skillKey) {
      this.skillKey = key;
      this.skillView = new MenuView(new Menu(items, Math.max(0, skills.indexOf(this.skill))), {
        pick: (it) => {
          if (it.id !== this.skill) { this.skill = it.id; this.slot = 0; this.cardTop = 0; }
          this.focus = 'skills';
          this.pick();
        },
        moved: () => {
          const now = this.skillView?.menu.current()?.id;
          if (!now || now === this.skill) return;
          this.skill = now;
          this.slot = 0;
          this.msg = '';
          this.cardTop = 0;
          if (this.focus !== 'runes') this.focus = 'skills';
          this.ctx.sfx.cursor();
          this.render();
        },
      }, this.followed ? SKILL_ROWS - 1 : SKILL_ROWS);
      this.skillsWin.replaceChildren(el('div', { class: 'slx-area-head', text: W.skillsHead }), this.skillView.el);
    } else {
      this.skillView.menu.setCursor(Math.max(0, skills.indexOf(this.skill)));
      this.skillView.render();
    }
  }

  private renderSlots(): void {
    this.runeView = null;
    this.runeKeyOf = '';
    const open = this.open;
    const states = this.skill ? slotStates(this.member, this.skill) : [];
    const rows = RUNE_SLOT_LEVELS.map((lv, i) => {
      const s = states[i];
      const sel = this.focus === 'slots' && i === this.slot;
      const locked = i >= open;
      const right = locked ? W.slotLocked(lv) : s?.ref ? label(s.ref) : W.slotEmpty;
      const li = el('li', {
        class: `slx-opt slx-ws-slot${sel ? ' slx-sel' : ''}${s?.state === 'off' ? ' slx-ws-off' : ''}`,
        attrs: { role: 'option', 'aria-selected': String(sel), 'aria-disabled': String(locked), 'data-id': `slot:${i}` },
      }, [
        el('span', { class: 'slx-label', text: W.slot(i + 1) }),
        el('span', { class: `slx-right${s?.ref ? ` slx-rarity-${s.ref.tier}` : ''}`, text: right }),
        ...(s?.state === 'off' && s.why ? [el('span', { class: 'slx-ws-sub', text: W.off(s.why) })] : []),
      ]);
      if (!locked) {
        li.addEventListener('pointermove', () => {
          if (li.closest('[inert]') || (this.focus === 'slots' && this.slot === i)) return;
          this.focus = 'slots';
          this.slot = i;
          this.msg = '';
          this.ctx.sfx.cursor();
          this.render();
        });
        li.addEventListener('click', () => {
          if (li.closest('[inert]')) return;
          this.focus = 'slots';
          this.slot = i;
          this.pick();
        });
      }
      return li;
    });
    this.slotsWin.replaceChildren(
      el('div', { class: 'slx-area-head', text: W.slotsHead }),
      ...(open === 0 ? [el('p', { class: 'slx-desc', text: W.noSlots(RUNE_SLOT_LEVELS[0]) })] : []),
      el('ul', { class: 'slx-menu', attrs: { role: 'listbox' } }, rows),
    );
  }

  private renderRunes(): void {
    const held = this.held();
    const open = !!this.game.state.runesOpen;
    const choices = this.choices();
    const row = (c: RuneChoice): MenuItem => ({
      id: rowOf(c),
      // The name may be cut; its tier stays whole beside it (final review).
      label: RUNES[c.source.ref.id].name,
      tail: T.rune.tierTag(c.source.ref.tier),
      cls: `slx-rarity-${c.source.ref.tier}${c.why !== null ? ' slx-ws-unfit' : ''}`,
      // The bag's count; for a rune in a slot, who holds it, or on her own other skill, which skill (two 常駐 rows apart).
      right: c.source.kind === 'bag' ? T.rune.bag(c.source.count)
        : c.source.at.id === this.id ? skillFor(fromMember(this.member, 0), c.source.at.skill)?.name ?? c.source.at.skill
          : CHARACTERS[c.source.at.id].name,
      ...(c.why !== null ? { rightClass: 'slx-lack' } : {}),
    });
    const moves = choices.filter((c) => c.section === 'move');
    const items: MenuItem[] = [
      ...(held ? [{ id: 'remove', label: W.remove }] : []),
      ...choices.filter((c) => c.section === 'bag').map(row),
      ...(moves.length ? [{ id: 'head:others', label: W.fromOthers, disabled: true, cls: 'slx-list-head' }] : []),
      ...moves.map(row),
    ];
    const lack = this.lacking();
    const key = `${this.id}|${this.skill}|${this.slot}|${lack}|${items.map((it) => `${it.id}:${it.right}:${it.cls ?? ''}`).join(',')}`;
    // The same row when it is still there, else the first: a list is only built anew when it opens.
    const idx = Math.max(0, items.findIndex((it) => it.id === this.runeCur));
    if (!this.runeView || key !== this.runeKeyOf) {
      this.runeKeyOf = key;
      this.runeView = items.length ? new MenuView(new Menu(items, idx), {
        pick: (it) => {
          // A touch tap on a row not picked yet only picks it (and previews it); the second tap on it does it.
          const touch = this.pressedBy === 'touch';
          this.pressedBy = '';
          if (touch && this.armed !== it.id) {
            this.armed = it.id;
            this.runeCur = it.id;
            this.refused = '';
            this.msg = '';
            this.cardTop = 0;
            this.ctx.sfx.cursor();
            this.renderCard();
            return;
          }
          this.armed = '';
          this.act();
        },
        moved: () => {
          this.armed = '';
          this.runeCur = this.runeView?.menu.current()?.id ?? '';
          this.refused = '';
          this.msg = '';
          this.cardTop = 0;
          this.ctx.sfx.cursor();
          this.renderCard();
        },
      }, RUNE_ROWS - (this.followed ? 1 : 0) - (lack ? LACK_ROWS : 0)) : null;
      // What pressed a row: read by `pick` above (a click event may carry no pointerType: Safari).
      this.runeView?.el.addEventListener('pointerdown', (e) => { this.pressedBy = e.pointerType; }, true);
      this.runeView?.el.addEventListener('click', (e) => { this.pressedBy = (e as PointerEvent).pointerType || this.pressedBy; }, true);
      const empty = !open ? T.rune.fail.closed : choices.length ? '' : W.emptyBag;
      this.slotsWin.replaceChildren(el('div', { class: 'slx-ws-runes' }, [
        el('div', { class: 'slx-area-head', text: W.pick(this.slot + 1) }),
        ...(lack ? [el('p', { class: 'slx-ws-lack', text: lack })] : []),
        ...(this.runeView ? [this.runeView.el] : []),
        ...(empty ? [el('p', { class: 'slx-desc', text: empty })] : []),
      ]));
    } else this.runeView.render();
    this.runeCur = this.runeView?.menu.current()?.id ?? '';
  }

  /** What the rune row under the cursor would do: the engine's own result on a copy of the state. */
  private preview(): { after: Member; choice?: RuneChoice } | null {
    if (this.focus !== 'runes' || !this.runeCur) return null;
    const choice = this.runeCur === 'remove' ? undefined : this.choiceOf(this.runeCur);
    const act: RuneAction | null = this.runeCur === 'remove' ? { kind: 'remove' }
      : choice?.source.kind === 'socket' ? { kind: 'move', from: choice.source.at } : choice ? { kind: 'bag', ref: choice.source.ref } : null;
    if (!act) return null;
    const r = previewOf(this.game.state, this.at, act);
    return r.ok ? { after: r.state.party.roster[this.id], choice } : { after: this.member, choice };
  }

  private renderCard(): void {
    const m = this.member;
    const now = this.skill ? cardOf(m, this.skill) : undefined;
    const out: HTMLElement[] = [];
    let why = this.refused;
    if (now) {
      const p = this.preview();
      const after = p ? cardOf(p.after, this.skill) : undefined;
      // In a preview the name and tags are the after card's: ［單體］ never stands beside a target of 全體.
      const shown = after ?? now;
      out.push(el('div', { class: 'slx-ws-card-name' }, [
        el('b', { text: shown.name }),
        el('span', { class: 'slx-ws-tags' }, shown.tags.map((t) => el('span', { class: 'slx-ws-tag', text: `［${t}］` }))),
      ]));
      out.push(after ? this.table(now, after) : this.single(now));
      const ref = p?.choice?.source.ref;
      if (ref) out.push(el('p', { class: `slx-ws-rune-text slx-rarity-${ref.tier}` }, [el('b', { text: label(ref) }), el('span', { text: RUNES[ref.id].text(ref.tier) })]));
      for (const n of p?.choice?.notes ?? []) if (n !== W.barrierClash) out.push(el('p', { class: 'slx-ws-note', text: n }));
      // Ruling 10, now and in the preview: the barriers her lasting runes raise that a fight's start would replace.
      if (lastingBarrierLoss(fromMember(p?.after ?? m, 0)) > 0) out.push(el('p', { class: 'slx-ws-warn', text: W.barrierClash }));
      // A rune already in the slot comes out with this pick: it goes back to the bag (final review).
      const inSlot = this.held();
      if (p?.choice && p.choice.why === null && inSlot) out.push(el('p', { class: 'slx-ws-swapout', text: W.swapOut(label(inSlot)) }));
      if (p?.choice?.giver) out.push(el('p', { class: 'slx-ws-giver', text: p.choice.giver }));
      const own = p?.choice?.owned;
      if (own) out.push(el('p', { class: 'slx-ws-owned', text: W.owned(own.all, own.bag, own.socketed) }));
      if (!why && p?.choice?.why) why = p.choice.why;
    } else out.push(el('p', { class: 'slx-desc', text: W.noSkills }));
    this.cardBody.replaceChildren(...out);
    this.cardBody.scrollTop = this.cardTop;
    updateCues(this.cardBody);
    this.footWhy.textContent = why;
    this.footMsg.textContent = this.msg;
  }

  /** The card alone: one column, 現在. */
  private single(card: Card): HTMLElement {
    const rows = card.rows.map((r) => el('tr', { attrs: { 'data-key': r.key } }, [el('th', { text: W.row[r.key] }), cell('slx-ws-now', r.text)]));
    return el('div', {}, [
      el('table', { class: 'slx-ws-table' }, [el('thead', {}, [el('tr', {}, [el('th'), el('th', { text: W.now })])]), el('tbody', {}, rows)]),
      ...(card.adds.length ? [el('ul', { class: 'slx-ws-adds' }, card.adds.map((a) => el('li', { text: a })))] : []),
    ]);
  }

  /** Before and after side by side, the rows that change lit; the 附加 lines with what is added and taken away. */
  private table(before: Card, after: Card): HTMLElement {
    const c = compareCards(before, after);
    const rows = c.lines.map((l) => el('tr', { class: l.changed ? 'slx-changed' : '', attrs: { 'data-key': l.key } }, [
      el('th', { text: l.label }), cell('slx-ws-before', l.before), cell('slx-ws-after', l.after),
    ]));
    const adds = [
      ...c.kept.map((a) => el('li', { text: a })),
      ...c.added.map((a) => el('li', { class: 'slx-ws-add', text: W.added(a) })),
      ...c.removed.map((a) => el('li', { class: 'slx-ws-lost', text: W.lost(a) })),
    ];
    return el('div', {}, [
      el('table', { class: 'slx-ws-table slx-ws-two' }, [
        el('thead', {}, [el('tr', {}, [el('th'), el('th', { text: W.before }), el('th', { text: W.after })])]), el('tbody', {}, rows),
      ]),
      ...(adds.length ? [el('ul', { class: 'slx-ws-adds' }, adds)] : []),
    ]);
  }
}
