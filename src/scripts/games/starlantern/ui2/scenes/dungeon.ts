import { CHARACTERS } from '../../data/characters';
import { FLOORS } from '../../data/floors';
import { ITEMS } from '../../data/items';
import { T } from '../../data/text.zh-TW';
import type { Dir } from '../../engine/map';
import { rowOfCell } from '../../engine/formation';
import { activeIds, statsOf } from '../../engine/party';
import { useFieldItem } from '../../engine/town';
import type { CharacterId } from '../../engine/types';
import { el, itemName } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import { PartyBar } from '../partyBar';
import { textCps } from '../settings';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, backControl, confirmBox, win } from '../widgets';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
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
  private layers: Layer[] = [];
  private talk: Dialogue;
  private leaving = false;

  constructor(private ctx: SceneCtx, cps = textCps(ctx)) {
    this.bar = new PartyBar(ctx.art);
    this.talk = new Dialogue(cps, () => this.syncInert());
  }

  enter(root: HTMLElement): void {
    this.root = root;
    this.floorName = win('slx-floorname');
    this.lamp = win('slx-lamp');
    this.pad = el('div', { class: 'slx-pad' }, DIRS.map((d) => this.tapper(`slx-pad-${d}`, T.map.dirs[d], d)));
    const menuBtn = this.tapper('slx-menu-btn', T.ui2.dungeon.menuHint, 'menu');
    this.backEl = backControl(() => this.onAction('cancel'));
    this.backEl.hidden = true;
    const hint = el('p', { class: 'slx-keyhint', text: T.ui2.hints.dungeon });
    this.body = el('div', { class: 'slx-scene slx-dungeon' }, [this.floorName, this.lamp, menuBtn, this.backEl, hint, this.pad, this.bar.el, this.talk.el]);
    root.append(this.body);
    this.ctx.stage?.show('map');
    this.refresh();
  }

  exit(): void {
    this.talk.stop();
    this.ctx.stage?.show(null);
  }

  onAction(a: UiAction): void {
    if (this.leaving) return;
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
    this.floorName.textContent = T.map.floor(g.floor, FLOORS[g.floor - 1].name);
    const d = g.danger();
    this.lamp.className = `slx-win slx-lamp slx-lamp-${d}`;
    this.lamp.textContent = T.map.danger[d];
    const p = g.state.party;
    this.bar.update(activeIds(p).map((id) => {
      const m = p.roster[id];
      const st = statsOf(m);
      return { key: id, name: CHARACTERS[id].name, hp: m.hp, maxHp: st.hp, tp: m.tp, maxTp: st.tp, limit: m.limit ?? 0, alive: m.hp > 0, row: rowOfCell(p.grid.indexOf(id)) };
    }));
    this.ctx.stage?.mapView.draw(g, { width: 640, height: 296 });
  }

  private say(text: string): void {
    void this.talk.say('', text);
    this.syncInert();
  }

  private move(dir: Dir): void {
    const s = this.ctx.sfx;
    const r = this.ctx.game.move(dir);
    switch (r.kind) {
      case 'ignored': return;
      case 'blocked': s.bump?.(); break;
      case 'moved': s.step?.(); break;
      case 'entrance': s.step?.(); this.refresh(); this.askTown(); return;
      case 'floor': s.stairs?.(); this.refresh(); this.say(T.map.floor(r.floor, FLOORS[r.floor - 1].name)); return;
      case 'chest': s.chest?.(); this.refresh(); this.say(T.map.chest(itemName(r.item), r.qty)); return;
      case 'battle': case 'boss':
        s.encounter?.();
        this.leaving = true;
        this.root.setAttribute('inert', '');
        this.ctx.go('battle');
        return;
    }
    this.refresh();
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

  private askTown(): void {
    const box = confirmBox(T.ui2.dungeon.askTown, (yes) => {
      this.pop();
      if (yes && this.ctx.game.returnToTown()) { this.leaving = true; this.ctx.go('town'); }
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private openMenu(): void {
    const g = this.ctx.game;
    const d = T.ui2.dungeon;
    const lamps = g.state.inventory['return-lamp'] ?? 0;
    this.list([
      { id: 'status', label: d.status },
      { id: 'items', label: d.items, disabled: this.usableItems().length === 0 },
      { id: 'lamp', label: d.lamp(lamps), disabled: lamps <= 0 },
      { id: 'settings', label: T.ui2.title.settings },
      { id: 'close', label: d.close },
    ], (it) => {
      if (it.id === 'close') { this.pop(); return; }
      if (it.id === 'lamp') { this.askLamp(); return; }
      if (it.id === 'settings') { this.popAll(); this.leaving = true; this.ctx.go('settings'); return; }
      if (it.id === 'items') { this.itemList(); return; }
      this.statusList();
    }, 'slx-list slx-field-menu');
  }

  private askLamp(): void {
    const g = this.ctx.game;
    const box = confirmBox(T.ui2.dungeon.askLamp, (yes) => {
      this.pop();
      if (!yes || !g.useReturnLamp()) return;
      g.notice = 'lamp';
      this.popAll();
      this.leaving = true;
      this.ctx.go('town');
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
