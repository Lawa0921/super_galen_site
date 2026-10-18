import { CHARACTERS } from '../../data/characters';
import { artIdOf } from '../../ui/art';
import { CONDITIONS } from '../../data/conditions';
import { FLOORS } from '../../data/floors';
import { ITEMS } from '../../data/items';
import type { Meetable } from '../../data/meetings';
import { capacity, carried, formatWeight } from '../../data/weights';
import { T } from '../../data/text.zh-TW';
import { memScene, sceneKind, type SceneId } from '../../data/story/scenes';
import { floorOf } from '../../engine/dungeon/run';
import type { FragmentGain } from '../../engine/story/memories';
import { BAG_SIZE } from '../../engine/loot/bag';
import { step, type Dir } from '../../engine/map';
import { rowOfCell } from '../../engine/formation';
import { activeIds, statsOf } from '../../engine/party';
import { useFieldItem } from '../../engine/town';
import type { CharacterId } from '../../engine/types';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import { Minimap } from '../minimap';
import { PartyBar } from '../partyBar';
import { textCps } from '../settings';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, backControl, confirmBox, win, type Rich } from '../widgets';
import { fragmentLines, levelUpLines } from '../battleText';
import { playAndRecord, speakerOf, storyCtx } from '../story';
import { STORY } from '../../data/story.zh-TW';
import { clearPillars, dropMoment, skipPillar } from '../lootFx';
import { eventLayer, showPickUp, stairsLayer, type EventHost } from './event';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const ENCOUNTER_MS = 520;
const CONDITION_BANNER_MS = 2000;
const FLASH_MS = 450;
/** The readout turns yellow past this share of the carry limit, red at the limit. */
const HEAVY_SHARE = 0.8;
interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }

/** Labyrinth: map on the Pixi stage, party bar, floor name, encounter lamp, events as dialogue, a field menu. */
export class DungeonScene implements Scene {
  private root!: HTMLElement;
  private body!: HTMLElement;
  private bar: PartyBar;
  private lamp!: HTMLElement;
  private floorName!: HTMLElement;
  private pad!: HTMLElement;
  private backEl!: HTMLElement;
  private weightEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private minimap!: Minimap;
  private layers: Layer[] = [];
  private talk: Dialogue;
  private leaving = false;
  /** The memory scene on screen, if any: it takes the actions while it plays. */
  private playing: ReturnType<typeof playAndRecord> | null = null;
  /** Set on exit, so a line waiting on an earlier one (the depth-clear reward) never speaks on a scene that has gone. */
  private exited = false;
  /** Counts the lines said, so a follow-up line can tell that a newer one took its turn. */
  private said = 0;
  /** Banner and flash removals; cleared on exit so none outlives the scene. */
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private ctx: SceneCtx, cps = textCps(ctx)) {
    this.bar = new PartyBar(ctx.art);
    this.talk = new Dialogue(cps, () => this.syncInert());
  }

  enter(root: HTMLElement): void {
    this.root = root;
    this.exited = false;
    this.floorName = win('slx-floorname');
    this.lamp = win('slx-lamp');
    this.pad = el('div', { class: 'slx-pad' }, DIRS.map((d) => this.tapper(`slx-pad-${d}`, T.map.dirs[d], d)));
    const menuBtn = this.tapper('slx-menu-btn', T.ui2.dungeon.menuHint, 'menu');
    this.backEl = backControl(() => this.onAction('cancel'));
    this.backEl.hidden = true;
    this.hintEl = el('p', { class: 'slx-keyhint', text: T.ui2.hints.dungeon });
    this.weightEl = el('p', { class: 'slx-weight', attrs: { 'aria-live': 'polite' } });
    this.minimap = new Minimap();
    this.body = el('div', { class: 'slx-scene slx-dungeon' }, [
      this.floorName, ...this.conditionBadge(), this.lamp, menuBtn, this.minimap.el, this.backEl, this.weightEl, this.hintEl, this.pad, this.bar.el, this.talk.el,
    ]);
    root.append(this.body);
    this.ctx.stage?.show('map');
    this.refresh();
    if (this.ctx.from === 'gate') this.conditionBanner();
    void this.flushPending();   // a memory still waiting from before (the settings screen, a battle) plays now
  }

  exit(): void {
    this.exited = true;
    this.talk.stop();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    clearPillars(this.body);
    this.ctx.stage?.show(null);
  }

  onAction(a: UiAction): void {
    if (this.leaving) return;
    if (this.playing) { this.playing.onAction(a); return; }
    // Confirm or cancel ends a legendary drop's moment first (fast mode never waits on it); directions always step.
    if (!this.ctx.fast && skipPillar(this.body, a)) return;
    if (this.talk.busy()) { this.talk.onAction(a); return; }
    const top = this.layers[this.layers.length - 1];
    if (top && a === 'menu') { this.ctx.sfx.cancel(); this.popAll(); return; }   // C toggles the menu
    if (top) { top.onAction(a); return; }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { this.move(a); return; }
    if (a === 'menu' || a === 'cancel') this.openMenu();
  }

  private tapper(cls: string, text: string, action: UiAction): HTMLElement {
    const b = win(cls, [document.createTextNode(text)]);
    b.setAttribute('role', 'button');
    b.addEventListener('click', () => { if (!b.closest('[inert]')) this.onAction(action); });
    return b;
  }

  private refresh(): void {
    const g = this.ctx.game;
    this.floorName.textContent = T.map.floor(g.floor, FLOORS[g.terrain() - 1].name);
    const d = g.danger();
    this.lamp.className = `slx-win slx-lamp slx-lamp-${d}`;
    this.lamp.textContent = T.map.danger[d];
    const p = g.state.party;
    this.bar.update(activeIds(p).map((id) => {
      const m = p.roster[id];
      const st = statsOf(m);
      return { key: id, name: CHARACTERS[id].name, hp: m.hp, maxHp: st.hp, tp: m.tp, maxTp: st.tp, limit: m.limit ?? 0, alive: m.hp > 0, row: rowOfCell(p.grid.indexOf(id)), artId: artIdOf(m) };
    }));
    this.ctx.stage?.mapView.draw(g, { width: 640, height: 296 });
    this.minimap.draw(g);
    this.showWeight();
  }

  /** Carried weight against the limit; refreshed after every step, pick-up, discard and battle (the scene is re-entered). */
  private showWeight(): void {
    const g = this.ctx.game;
    const run = g.run;
    this.weightEl.hidden = !run;
    if (!run) return;
    const w = carried(g.state, run), cap = capacity(g.state.party);
    this.weightEl.textContent = T.ui2.dungeon.weight(formatWeight(w), formatWeight(cap));
    this.weightEl.classList.toggle('slx-weight-full', w >= cap);
    this.weightEl.classList.toggle('slx-weight-heavy', w < cap && w > cap * HEAVY_SHARE);
  }

  /**
   * The run condition's corner badge. Its description shows in a tooltip window on hover or keyboard focus; the field
   * menu also has a 本次狀況 line that says it, for players who only use the game keys.
   */
  private conditionBadge(): HTMLElement[] {
    const run = this.ctx.game.run;
    if (!run) return [];
    const c = CONDITIONS[run.condition];
    const tip = win('slx-condition-tip', [document.createTextNode(c.desc)]);
    tip.id = 'slx-condition-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const badge = win(`slx-condition slx-cond-${c.id}`, [document.createTextNode(c.name)]);
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-describedby', tip.id);
    const show = (on: boolean) => () => { tip.hidden = !on; };
    badge.addEventListener('mouseenter', show(true));
    badge.addEventListener('mouseleave', show(false));
    badge.addEventListener('focus', show(true));
    badge.addEventListener('blur', show(false));
    return [badge, tip];
  }

  private say(text: string | Rich, name = '', face?: { src: string; side: 'left' | 'right' }): Promise<void> {
    this.said++;
    const shown = this.talk.say(name, text, face);
    this.syncInert();
    return shown;
  }

  /** Fresh from the plaza: the run condition crosses the screen once (the corner badge keeps it on screen afterwards). */
  private conditionBanner(): void {
    const run = this.ctx.game.run;
    if (!run) return;
    const c = CONDITIONS[run.condition];
    const b = el('div', { class: `slx-banner slx-banner-condition slx-cond-${c.id}`, attrs: { role: 'status' } }, [
      el('span', { class: 'slx-banner-text', text: T.ui2.gate.banner(c.name) }),
      el('span', { class: 'slx-banner-sub', text: c.desc }),
    ]);
    this.body.append(b);
    this.later(() => b.remove(), this.ctx.fast ? 0 : CONDITION_BANNER_MS);
  }

  /** A short red flash over the whole screen (a trap went off). */
  private flash(): void {
    const f = el('div', { class: 'slx-flash-hurt', attrs: { 'aria-hidden': 'true' } });
    this.body.append(f);
    this.later(() => f.remove(), this.ctx.fast ? 0 : FLASH_MS);
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  /** The labyrinth's side of an event window. */
  private host(dir?: Dir): EventHost {
    return {
      ctx: this.ctx,
      push: (l) => this.push(l),
      pop: () => this.pop(),
      popAll: () => this.popAll(),
      say: (t) => this.say(t),
      refresh: () => this.refresh(),
      fight: () => { if (dir) this.step(dir); },
      drop: (items) => { dropMoment(this.ctx, this.body, items); },
    };
  }

  private move(dir: Dir): void {
    const g = this.ctx.game;
    // An elite is seen from the doorway: ask before stepping in, since stepping in starts the fight.
    const ahead = g.phase === 'map' ? step(g.map(), g.pos, dir) : null;
    if (ahead?.moved && ahead.tile === 'elite') {
      g.facing = dir;
      const c = floorOf(g.run!, g.floor).contents.find((x) => x.kind === 'elite' && x.at.x === ahead.pos.x && x.at.y === ahead.pos.y)
        ?? { kind: 'elite' as const, at: ahead.pos, room: -1 };
      this.ctx.sfx.cursor();
      this.push(eventLayer(this.host(dir), c));
      return;
    }
    this.step(dir);
  }

  private step(dir: Dir): void {
    const s = this.ctx.sfx;
    const r = this.ctx.game.move(dir);
    switch (r.kind) {
      case 'ignored': return;
      case 'blocked': s.bump?.(); break;
      case 'moved': s.step?.(); break;
      case 'entrance': s.step?.(); this.refresh(); this.askTown(); return;
      case 'floor': s.stairs?.(); this.refresh(); this.say(T.map.floor(r.floor, FLOORS[this.ctx.game.terrain(r.floor) - 1].name)); return;
      case 'stairs': s.step?.(); this.refresh(); this.push(stairsLayer(this.host(), r, () => this.descend())); return;
      case 'chest': case 'pickup': showPickUp(this.host(), r); return;
      case 'event': s.step?.(); this.refresh(); this.push(eventLayer(this.host(), r.content)); return;
      case 'trap':
        s.hit?.();
        this.ctx.vibrate?.(60);
        this.refresh();
        this.flash();
        this.say(r.effect === 'hurt' ? T.ui2.event.trap.hurt(r.amount) : T.ui2.event.trap.poison(r.amount, r.tp));
        return;
      case 'key': s.chest?.(); this.refresh(); this.say(T.ui2.event.key); return;
      case 'glimmer': s.chest?.(); this.refresh(); void this.found(r.gained); return;
      case 'full': this.refresh(); showPickUp(this.host(), r); return;
      case 'rescue': { void this.meeting(r.who); return; }
      case 'battle': case 'boss': this.fightOn(r.kind === 'boss'); return;
    }
    this.refresh();
  }

  /** What a glimmer held, one line at a time, then the memory scene of a piece that plays now. A glimmer always holds a piece or a shard. */
  private async found(gained: FragmentGain[]): Promise<void> {
    for (const line of fragmentLines(gained)) {
      await this.say(line);
      if (this.exited) return;
    }
    for (const g of gained) {
      if (g.kind !== 'piece' || !g.play) continue;
      await this.memory(memScene(g.id, g.n));
      if (this.exited) return;
    }
  }

  /**
   * Plays one memory scene and records it, with the pad out of the way (the portrait stands over it). A scene that fails
   * is reported in the console and the labyrinth carries on: it must never lock the screen.
   */
  private async memory(id: SceneId): Promise<void> {
    this.hideHud(true);
    try {
      const p = playAndRecord(this.talk, id, storyCtx(this.ctx));
      this.playing = p;
      await p.done;
    } catch (e) {
      console.error('starlantern: memory scene failed', e);
    } finally {
      this.playing = null;
      this.hideHud(false);
      this.syncInert();
    }
  }

  /** The pad and the two text lines under the dialogue box step aside while a scene plays. */
  private hideHud(on: boolean): void {
    for (const e of [this.pad, this.weightEl, this.hintEl]) e.classList.toggle('slx-cmd-hidden', on);
  }

  /** Memory scenes the game still holds as due: leaving the floor drops them, so they play before the party goes. */
  private waitingMemories(): SceneId[] {
    return this.ctx.game.pending.filter((id) => sceneKind(id) === 'memory');
  }

  private async flushPending(): Promise<void> {
    for (const id of this.waitingMemories()) {
      await this.memory(id);
      if (this.exited) return;
    }
  }

  /** Runs `go` now, or once the memories still waiting have played. */
  private beforeLeaving(go: () => void): void {
    if (this.waitingMemories().length === 0) { go(); return; }
    void this.flushPending().then(() => { if (!this.exited) go(); });
  }

  /** A rescue room: its lines one at a time, each with its own speaker, then the fight as for any encounter. */
  private async meeting(who: Meetable): Promise<void> {
    this.hideHud(true);
    let fighting = false;
    try {
      for (const line of STORY.meet[who].before) {
        // Each line has its own speaker: the found line is narration (no plate, no face), hers carry her portrait.
        const sp = speakerOf(line.who, this.ctx.game.state, this.ctx.art, line.mood);
        await this.say(line.text, sp.name, sp.face ? { src: sp.face, side: 'left' } : undefined);
        if (this.exited) return;   // the scene went while a line was waiting: no fight from a scene that is gone
      }
      fighting = true;
      this.fightOn(false);   // the scene leaves for the battle: the lines stay hidden under the closing bars
    } finally {
      if (!fighting) this.hideHud(false);
    }
  }

  /** A flash and closing bars before the battle (red for the boss); skipped in fast mode. */
  private fightOn(boss: boolean): void {
    this.ctx.sfx.encounter?.();
    this.leaving = true;
    this.root.setAttribute('inert', '');
    const wipe = el('div', { class: boss ? 'slx-encounter slx-encounter-boss' : 'slx-encounter', attrs: { 'aria-hidden': 'true' } },
      [0, 1, 2, 3, 4, 5].map((i) => el('span', { class: `slx-enc-bar slx-enc-bar-${i}` })));
    this.body.append(wipe);
    if (this.ctx.fast) this.ctx.go('battle');
    else setTimeout(() => this.ctx.go('battle'), ENCOUNTER_MS);
  }

  /** 前往 on the stairs window: go down and name the new floor, then pay the depth-clear exp in a second line. */
  private descend(): void {
    const r = this.ctx.game.descend();
    if (r?.kind !== 'floor') { this.refresh(); return; }
    this.ctx.sfx.stairs?.();
    this.refresh();
    const named = this.say(T.map.floor(r.floor, FLOORS[this.ctx.game.terrain(r.floor) - 1].name));
    const clear = r.clear;
    if (!clear) return;
    const lines = [T.map.cleared(clear.exp), ...levelUpLines(clear.levelUps, this.ctx.game.state.party).map((l) => l.text)];
    const turn = this.said;
    // Only after the player dismisses the floor name: not when a newer line replaced it, nor once the scene has gone.
    void named.then(() => { if (!this.exited && this.said === turn) void this.say(lines.join('\n')); });
  }

  private push(layer: Layer): void {
    layer.el.classList.add('slx-layer', `slx-depth-${this.layers.length}`);
    this.layers.push(layer);
    this.body.append(layer.el);
    this.syncInert();
  }

  private pop(): void {
    this.layers.pop()?.el.remove();
    this.syncInert();
  }

  private popAll(): void {
    while (this.layers.length) this.layers.pop()!.el.remove();
    this.syncInert();
  }

  /** Only the top window takes the pointer: the pad and lower layers are inert under a layer or a line. */
  private syncInert(): void {
    const lock = (e: HTMLElement, on: boolean) => (on ? e.setAttribute('inert', '') : e.removeAttribute('inert'));
    const busy = this.talk.busy();
    lock(this.pad, busy || this.layers.length > 0);
    lock(this.backEl, busy);
    this.backEl.hidden = this.layers.length === 0;
    this.layers.forEach((l, i) => lock(l.el, busy || i < this.layers.length - 1));
  }

  private list(items: MenuItem[], pick: (it: MenuItem) => void, cls = 'slx-list', title?: string): void {
    const v = new MenuView(new Menu(items), {
      pick: (it) => { this.ctx.sfx.confirm(); pick(it); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => { this.ctx.sfx.cancel(); this.pop(); },
    }, 10);
    this.push({ el: win(cls, [...(title ? [el('div', { class: 'slx-who', text: title })] : []), v.el]), onAction: (a) => v.onAction(a) });
  }

  /**
   * Going home banks the run pack's gear into the bag while it has slots; the rest is lost. When the run carries more gear
   * than the bag has room for, the question says how many slots are left.
   */
  private bagWarning(question: string): string {
    const g = this.ctx.game;
    const room = Math.max(0, BAG_SIZE - g.state.bag.length);
    return (g.run?.loot.gear.length ?? 0) > room ? `${question}\n${T.ui2.dungeon.bagRoom(room)}` : question;
  }

  private askTown(): void {
    const box = confirmBox(this.bagWarning(T.ui2.dungeon.askTown), (yes) => {
      this.pop();
      if (!yes) return;
      this.beforeLeaving(() => { if (this.ctx.game.returnToTown()) { this.leaving = true; this.ctx.go('town'); } });
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private openMenu(): void {
    const g = this.ctx.game;
    const d = T.ui2.dungeon;
    const lamps = g.state.inventory['return-lamp'] ?? 0;
    const cond = g.run ? CONDITIONS[g.run.condition] : null;
    this.list([
      { id: 'status', label: d.status },
      { id: 'items', label: d.items, disabled: this.usableItems().length === 0 },
      { id: 'lamp', label: d.lamp(lamps), disabled: lamps <= 0 },
      ...(cond ? [{ id: 'condition', label: d.conditionItem(cond.name) }] : []),
      { id: 'handbook', label: d.handbook },
      { id: 'settings', label: T.ui2.title.settings },
      { id: 'close', label: d.close },
    ], (it) => {
      if (it.id === 'close') { this.pop(); return; }
      if (it.id === 'condition' && cond) { this.popAll(); this.say(d.conditionLine(cond.name, cond.desc)); return; }
      if (it.id === 'lamp') { this.askLamp(); return; }
      if (it.id === 'settings') { this.popAll(); this.leaving = true; this.ctx.go('settings'); return; }
      if (it.id === 'handbook') { this.popAll(); this.leaving = true; this.ctx.go('handbook', 'dungeon'); return; }
      if (it.id === 'items') { this.itemList(); return; }
      this.statusList();
    }, 'slx-list slx-field-menu');
  }

  private askLamp(): void {
    const g = this.ctx.game;
    const box = confirmBox(this.bagWarning(T.ui2.dungeon.askLamp), (yes) => {
      this.pop();
      if (!yes) return;
      this.beforeLeaving(() => {
        if (!g.useReturnLamp()) return;
        g.notice = 'lamp';
        this.popAll();
        this.leaving = true;
        this.ctx.go('town');
      });
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private usableItems(): MenuItem[] {
    const inv = this.ctx.game.state.inventory;
    return Object.entries(inv)
      // Status cures do nothing here: members carry no poison or sleep between battles.
      .filter(([id, n]) => n > 0 && (ITEMS[id]?.target === 'ally' || ITEMS[id]?.target === 'deadAlly') && ITEMS[id].effects.some((e) => e.kind !== 'cure'))
      .map(([id, n]) => ({ id, label: ITEMS[id].name, right: `×${n}` }));
  }

  private itemList(): void {
    const items = this.usableItems();
    if (!items.length) { this.say(T.ui2.dungeon.noItems); return; }
    this.list(items, (it) => {
      const p = this.ctx.game.state.party;
      const dead = ITEMS[it.id].target === 'deadAlly';
      this.list(p.recruited.map((id) => ({
        id, label: CHARACTERS[id].name, right: `${p.roster[id].hp}/${statsOf(p.roster[id]).hp}`, disabled: dead !== (p.roster[id].hp <= 0),
      })), (who) => {
        const r = this.ctx.game.apply(useFieldItem(this.ctx.game.state, it.id, who.id as CharacterId));
        this.popAll();
        if (!r.ok) { this.ctx.sfx.error(); this.say(T.reasons[r.reason] ?? T.reasons.invalid); return; }
        this.ctx.sfx.heal?.();
        this.refresh();
        this.say(T.ui2.dungeon.used(it.label, who.label));
      }, 'slx-list', T.ui2.dungeon.who(it.label));
    });
  }

  private statusList(): void {
    const p = this.ctx.game.state.party;
    this.list(p.recruited.map((id) => {
      const m = p.roster[id];
      const st = statsOf(m);
      return { id, label: `${CHARACTERS[id].name} Lv ${m.level}`, right: `HP ${m.hp}/${st.hp}  TP ${m.tp}/${st.tp}` };
    }), (it) => { this.popAll(); this.leaving = true; this.ctx.go('status', it.id); });
  }
}
