import { CHARACTERS } from '../../data/characters';
import type { SceneId } from '../../data/story/scenes';
import { NPC_NAMES, STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import type { ArtIndex } from '../../render/textures';
import type { Game } from '../../engine/game';
import type { ItemInstance } from '../../engine/types';
import { BAG_SIZE } from '../../engine/loot/bag';
import { storyStage } from '../../engine/story/events';
import { bellkeeperPool } from '../../engine/story/keeper';
import { el, itemName } from '../../ui/dom';
import { gearIconUrl } from '../gearArt';
import { fillRich, gearPart, joinParts } from '../loot';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { textCps } from '../settings';
import { playAndRecord, storyCtx } from '../story';
import { Dialogue, MenuView, backControl, confirmBox, win, type Rich, type RichPart } from '../widgets';

const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'forge', 'handbook', 'settings'] as const;

/**
 * 「平安回城。帶回了：回復藥 ×2、鐵劍、120 G。」 — the lamp's own words replace 平安回城 when it brought the party home.
 * Gear is named in its rarity colour (after its gear icon, given `idx` and the published art); gear the full bag could
 * not take is named once more as lost.
 */
export function bankedLine(b: NonNullable<Game['banked']>, idx?: ArtIndex): Rich {
  const piece = (it: ItemInstance) => gearPart(it, idx && gearIconUrl(idx, it));
  const parts: RichPart[] = Object.entries(b.items).filter(([, n]) => n > 0).map(([id, n]) => `${itemName(id)} ×${n}`);
  parts.push(...b.gear.map(piece));
  if (b.gold > 0) parts.push(T.gold(b.gold));
  const line: Rich = parts.length ? fillRich((list) => T.ui2.banked(b.viaLamp, list), joinParts(parts)) : [T.ui2.home(b.viaLamp)];
  if (b.overflow.length) line.push(...fillRich((list) => T.ui2.bankedLost(BAG_SIZE, list), joinParts(b.overflow.map(piece))));
  return line;
}

export class TownScene implements Scene {
  private view!: MenuView;
  private menuWin!: HTMLElement;
  private backEl!: HTMLElement;
  private talk: Dialogue;
  private root!: HTMLElement;
  private ask: MenuView | null = null;
  /** The story scene on screen, if any: it takes the actions while it plays. */
  private playing: ReturnType<typeof playAndRecord> | null = null;

  constructor(private ctx: SceneCtx, charsPerSecond = textCps(ctx)) {
    this.talk = new Dialogue(charsPerSecond, () => { if (this.playing) return; this.menuWin?.removeAttribute('inert'); this.backEl?.removeAttribute('inert'); });
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
    void this.arrive();
  }

  /** The queued scenes play first, with the menu out of the way; then the notice, or the day's line. */
  private async arrive(): Promise<void> {
    const game = this.ctx.game;
    try {
      for (const id of [...game.arrival]) await this.playScene(id);
    } catch (e) {
      // A broken scene must not lock the town: say so in the console and carry on to the day's line.
      console.error('starlantern: arrival scene failed', e);
    }
    const notice = game.notice;
    const banked = game.banked;
    game.notice = null;
    game.banked = null;
    // Whoever stopped following a build since (plan 8h Task 6): said after the notice, or in place of the day's line.
    const ended = game.followEnded.splice(0);
    const endedLine = ended.length ? T.build.followEnded(ended.map((id) => CHARACTERS[id].name)) : null;
    const then = (first: Promise<void>) => { void first.then(() => (endedLine ? this.speak('', endedLine) : undefined)); };
    // A safe return (walking home, or the lamp, whose notice replaces 'banked') says what came home.
    if (banked && (notice === 'banked' || notice === 'lamp')) then(this.speak('', bankedLine(banked, this.ctx.art)));
    else if (notice) then(this.speak('', T.notices[notice]));
    else if (endedLine) void this.speak('', endedLine);
    else {
      // The day's line: the town's own, told by the narrator with no plate (story polish ruling 8), and from act 2 Rin's
      // foreshadowing once she has joined.
      const stage = storyStage(game.state);
      const chose = !!game.state.party.roster.rin?.oath;
      const rinSays = game.state.party.recruited.includes('rin') ? (chose ? STORY.rinOath : STORY.rinLines[stage] ?? []) : [];
      // The bellkeeper once his arrival scene has played (engine/story/keeper.ts, story depth Task 4).
      const keeper = bellkeeperPool(game.state);
      const pool = [
        ...STORY.townLines[stage].map((text) => ({ who: '', text })),
        ...rinSays.map((text) => ({ who: CHARACTERS.rin.name, text })),
        ...keeper.map((text) => ({ who: NPC_NAMES.bellkeeper, text })),
      ];
      const pick = pool[Math.floor(game.rng() * pool.length)];
      void this.speak(pick.who, pick.text);
    }
  }

  /** Plays one arrival scene with the menu hidden (the 96px face stands over its last row) and records it. */
  private async playScene(id: SceneId): Promise<void> {
    this.menuWin.setAttribute('inert', '');
    this.backEl.setAttribute('inert', '');
    this.menuWin.classList.add('slx-cmd-hidden');
    this.backEl.classList.add('slx-cmd-hidden');
    try {
      const p = playAndRecord(this.talk, id, storyCtx(this.ctx));
      this.playing = p;
      await p.done;
    } finally {
      this.playing = null;
      this.menuWin.classList.remove('slx-cmd-hidden');
      this.backEl.classList.remove('slx-cmd-hidden');
    }
  }

  exit(): void { this.talk.stop(); }

  onAction(a: UiAction): void {
    if (this.playing) { this.playing.onAction(a); return; }
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
    if (id === 'guild' || id === 'shop' || id === 'inn' || id === 'gate' || id === 'forge' || id === 'handbook' || id === 'settings') { this.ctx.go(id); return; }
    void this.speak('', T.ui2.town.soon(label));
  }
}
