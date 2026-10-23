import { CHARACTERS } from '../../data/characters';
import { sceneKind, type SceneId } from '../../data/story/scenes';
import { NIGHT_PLACE, NPC_NAMES, STORY, type ScriptLine } from '../../data/story.zh-TW';
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
import { playAndRecord, playBeat, playNight, shouldPlay, storyCtx, type SceneOpts } from '../story';
import { Dialogue, MenuView, backControl, confirmBox, win, type Rich, type RichPart } from '../widgets';

const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'forge', 'handbook', 'settings'] as const;
/** The notices of a return home: the day's line still follows them (staging S2). The others are about the interface. */
const RETURNS: ReadonlySet<NonNullable<Game['notice']>> = new Set(['banked', 'lamp', 'wipe']);

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
  /** The place plate and the gold: the town's HUD, put away while a story scene plays (staging S1). */
  private hud: HTMLElement[] = [];
  private talk: Dialogue;
  private root!: HTMLElement;
  private ask: MenuView | null = null;
  /** The story scene (or a night's beat) on screen, if any: it takes the actions while it plays. */
  private playing: { onAction(a: UiAction): void } | null = null;
  /** Story L: a night is still to be told after the day's lines, so closing them leaves the menu shut. */
  private nightAhead = false;
  /** Story L: the night is on; the HUD and the menu stay away from its first memory to its last. */
  private inNight = false;

  constructor(private ctx: SceneCtx, charsPerSecond = textCps(ctx)) {
    this.talk = new Dialogue(charsPerSecond, () => { if (this.playing || this.nightAhead) return; this.menuWin?.removeAttribute('inert'); this.backEl?.removeAttribute('inert'); });
  }

  enter(root: HTMLElement): void {
    this.root = root;
    const t = T.ui2.town;
    const menu = new Menu(FACILITIES.map((id) => ({ id, label: t.facilities[id] })));
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id, it.label), moved: () => this.ctx.sfx.cursor(), cancel: () => { this.ctx.sfx.cancel(); this.askTitle(); } });
    const bg = this.ctx.art.has(art.scene('town')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('town'), alt: '' } })] : [];
    root.append(el('div', { class: 'slx-scene slx-town' }, [
      ...bg,
      ...(this.hud = [win('slx-place', [document.createTextNode(t.place)]), win('slx-gold', [document.createTextNode(`${this.ctx.game.state.gold} G`)])]),
      (this.menuWin = win('slx-town-menu', [this.view.el])),
      (this.backEl = backControl(() => this.onAction('cancel'))),
      el('p', { class: 'slx-keyhint', text: T.ui2.hints.town }),
      this.talk.el,
    ]));
    void this.arrive();
  }

  /**
   * The queued scenes play first, with the menu out of the way; then the notice, who stopped following a build, and the
   * day's line. A return home (`RETURNS`) used to replace the day's line with what came home, and a return is nearly every
   * visit, so about 60 written lines (the town's, Rin's, the bellkeeper's) were almost never seen: now it follows the
   * notice (staging S2). Only an interface notice (saved, save failed...) still stands alone.
   * Story L spec §4.5: the night comes last (`playNight`). A memory the day owes (Lorne's, Rin's) is in the day's list,
   * ahead of the scene that needs it, under the night's card all the same: it is the night of the return.
   */
  private async arrive(): Promise<void> {
    const game = this.ctx.game;
    this.nightAhead = game.night.some((id) => shouldPlay(id, storyCtx(this.ctx).mode));
    try {
      for (const id of [...game.arrival]) await this.playScene(id, sceneKind(id) === 'memory' ? { place: NIGHT_PLACE } : {});
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
    const says: { who: string; text: string | Rich }[] = [];
    // A safe return (walking home, or the lamp, whose notice replaces 'banked') says what came home.
    if (banked && (notice === 'banked' || notice === 'lamp')) says.push({ who: '', text: bankedLine(banked, this.ctx.art) });
    else if (notice) says.push({ who: '', text: T.notices[notice] });
    if (endedLine) says.push({ who: '', text: endedLine });
    // The day's line. With nothing before it, it is drawn from the game rng as it always was; after a notice it is picked
    // without a draw, so the rng stream (the next portal roll, the next run's seed) is what it was before staging S2.
    if (!notice || RETURNS.has(notice)) says.push(this.dayLine(says.length === 0));
    for (const l of says) await this.speak(l.who, l.text);
    await this.playNight();
  }

  /**
   * Story L spec §4.5, §4.4.1: the night's memories, after the day's lines, under the night's card (`NIGHT_PLACE`) with the
   * town put away until the last one ends. Between two memories the night's beat (`Game.takeBeat`), with its speaker's
   * plate and face. One the story setting does not show is recorded as auto (new in the handbook), with no beat around it.
   */
  private async playNight(): Promise<void> {
    const shown = this.nightAhead;
    if (shown) { this.inNight = true; this.putAway(true); }
    try {
      await playNight([...this.ctx.game.night], storyCtx(this.ctx), (id, o) => this.playScene(id, o), (line) => this.sayBeat(line));
    } catch (e) {
      console.error('starlantern: night scene failed', e);
    } finally {
      this.nightAhead = false;
      this.inNight = false;
      this.talk.setPlace(null);
      if (shown) {
        this.putAway(false);
        this.menuWin.removeAttribute('inert');
        this.backEl.removeAttribute('inert');
      }
    }
  }

  /** The beat between two memories (spec §4.4.1): one line, the night's card kept up. */
  private async sayBeat(line: ScriptLine): Promise<void> {
    const p = playBeat(this.talk, line, storyCtx(this.ctx));
    this.playing = p;
    try { await p.done; } finally { this.playing = null; }
  }

  /** The menu, 返回 and the HUD out of the way of a story scene (staging S1), or back. */
  private putAway(on: boolean): void {
    if (on) { this.menuWin.setAttribute('inert', ''); this.backEl.setAttribute('inert', ''); }
    for (const e of [this.menuWin, this.backEl, ...this.hud]) e.classList.toggle('slx-cmd-hidden', on);
  }

  /**
   * The day's line: the town's own, told by the narrator with no plate (story polish ruling 8), from act 2 Rin's
   * foreshadowing once she has joined, and the bellkeeper once his arrival scene has played (engine/story/keeper.ts, story
   * depth Task 4). `draw`: pick with the game rng; otherwise by the gold and the scenes seen, which change from one return
   * to the next (staging S2: no draw the old code did not make). A return that changes neither repeats the last pick: the
   * save keeps no count of returns or visits to mix in, and none is added just for this (staging review 3).
   */
  private dayLine(draw: boolean): { who: string; text: string } {
    const s = this.ctx.game.state;
    const stage = storyStage(s);
    const chose = !!s.party.roster.rin?.oath;
    const rinSays = s.party.recruited.includes('rin') ? (chose ? STORY.rinOath : STORY.rinLines[stage] ?? []) : [];
    const pool = [
      ...STORY.townLines[stage].map((text) => ({ who: '', text })),
      ...rinSays.map((text) => ({ who: CHARACTERS.rin.name, text })),
      ...bellkeeperPool(s).map((text) => ({ who: NPC_NAMES.bellkeeper, text })),
    ];
    const i = draw ? Math.floor(this.ctx.game.rng() * pool.length) : (s.gold + s.story.seen.length) % pool.length;
    return pool[i];
  }

  /**
   * Plays one arrival scene with the menu hidden (the face stands over its last row) and records it. The HUD goes too
   * (staging S1): the place plate would say 露米亞 over an inn at night, and the gold has nothing to do with a scene.
   */
  private async playScene(id: SceneId, o: SceneOpts = {}): Promise<void> {
    // One the story setting does not show is only recorded (auto): the town stays as it is.
    if (!shouldPlay(id, storyCtx(this.ctx).mode)) { await playAndRecord(this.talk, id, storyCtx(this.ctx), o).done; return; }
    this.putAway(true);
    try {
      const p = playAndRecord(this.talk, id, storyCtx(this.ctx), o);
      this.playing = p;
      await p.done;
    } finally {
      this.playing = null;
      if (!this.inNight) this.putAway(false);
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
