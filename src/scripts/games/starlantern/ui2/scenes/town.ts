import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import type { Game } from '../../engine/game';
import { BAG_SIZE } from '../../engine/loot/bag';
import { el, itemName } from '../../ui/dom';
import { fillRich, gearPart, joinParts } from '../loot';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { textCps } from '../settings';
import { Dialogue, MenuView, backControl, confirmBox, win, type Rich, type RichPart } from '../widgets';

const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'settings'] as const;

/**
 * 「平安回城。帶回了：回復藥 ×2、鐵劍、120 G。」 — the lamp's own words replace 平安回城 when it brought the party home.
 * Gear is named in its rarity colour; gear the full bag could not take is named once more as lost.
 */
export function bankedLine(b: NonNullable<Game['banked']>): Rich {
  const parts: RichPart[] = Object.entries(b.items).filter(([, n]) => n > 0).map(([id, n]) => `${itemName(id)} ×${n}`);
  parts.push(...b.gear.map(gearPart));
  if (b.gold > 0) parts.push(T.gold(b.gold));
  const line: Rich = parts.length ? fillRich((list) => T.ui2.banked(b.viaLamp, list), joinParts(parts)) : [T.ui2.home(b.viaLamp)];
  if (b.overflow.length) line.push(...fillRich((list) => T.ui2.bankedLost(BAG_SIZE, list), joinParts(b.overflow.map(gearPart))));
  return line;
}

export class TownScene implements Scene {
  private view!: MenuView;
  private menuWin!: HTMLElement;
  private backEl!: HTMLElement;
  private talk: Dialogue;
  private root!: HTMLElement;
  private ask: MenuView | null = null;

  constructor(private ctx: SceneCtx, charsPerSecond = textCps(ctx)) {
    this.talk = new Dialogue(charsPerSecond, () => { this.menuWin?.removeAttribute('inert'); this.backEl?.removeAttribute('inert'); });
  }

  enter(root: HTMLElement): void {
    this.root = root;
    const t = T.ui2.town;
    const menu = new Menu(FACILITIES.map((id) => ({ id, label: t.facilities[id] })));
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id, it.label), moved: () => this.ctx.sfx.cursor(), cancel: () => { this.ctx.sfx.cancel(); this.askTitle(); } });
    const bg = this.ctx.art.has(art.scene('town')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('town'), alt: '' } })] : [];
    root.append(el('div', { class: 'slx-scene slx-town' }, [
      ...bg,
      win('slx-place', [document.createTextNode(t.place)]),
      win('slx-gold', [document.createTextNode(`${this.ctx.game.state.gold} G`)]),
      (this.menuWin = win('slx-town-menu', [this.view.el])),
      (this.backEl = backControl(() => this.onAction('cancel'))),
      el('p', { class: 'slx-keyhint', text: T.ui2.hints.town }),
      this.talk.el,
    ]));
    const notice = this.ctx.game.notice;
    const banked = this.ctx.game.banked;
    this.ctx.game.notice = null;
    this.ctx.game.banked = null;
    // A safe return (walking home, or the lamp, whose notice replaces 'banked') says what came home.
    if (banked && (notice === 'banked' || notice === 'lamp')) void this.speak('', bankedLine(banked));
    else if (notice) void this.speak('', T.notices[notice]);
    else void this.speak(t.place.split(' ').pop() ?? '', t.lines[Math.floor(this.ctx.game.rng() * t.lines.length)]);
  }

  exit(): void { this.talk.stop(); }

  onAction(a: UiAction): void {
    if (this.talk.busy()) { this.talk.onAction(a); return; }
    if (this.ask) { this.ask.onAction(a); return; }
    this.view.onAction(a);
  }

  /** Leaving for the title drops unsaved progress, so it is a question with 否 as the default. */
  private askTitle(): void {
    if (this.ask) return;
    const box = confirmBox(T.ui2.town.toTitle, (yes) => {
      box.el.remove();
      this.ask = null;
      this.menuWin.removeAttribute('inert');
      this.backEl.removeAttribute('inert');
      if (yes) this.ctx.go('title');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.ask = box.view;
    this.menuWin.setAttribute('inert', '');
    this.backEl.setAttribute('inert', '');
    this.root.querySelector('.slx-town')!.append(box.el);
  }

  /** The menu ignores the pointer while a line is on screen, matching the keyboard. */
  private async speak(name: string, text: string | Rich): Promise<void> {
    this.menuWin.setAttribute('inert', '');
    this.backEl.setAttribute('inert', '');
    await this.talk.say(name, text);
  }

  private pick(id: string, label: string): void {
    this.ctx.sfx.confirm();
    if (id === 'guild' || id === 'shop' || id === 'inn' || id === 'gate' || id === 'settings') { this.ctx.go(id); return; }
    void this.speak('', T.ui2.town.soon(label));
  }
}
