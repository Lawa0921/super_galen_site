import { ENEMIES } from '../../data/enemies';
import { RANKS, type QuestKind } from '../../data/guild';
import { GUILD_TEXT, type NoteKey } from '../../data/guild.zh-TW';
import { MATERIALS } from '../../data/materials';
import { numeral } from '../../data/numeral';
import { REGIONS, type RegionId } from '../../data/regions';
import { RUNE_STACK, parseRuneKey } from '../../data/runes';
import { T } from '../../data/text.zh-TW';
import { bountyLine, progressOf, rankOf, type Progress } from '../../engine/guild';
import type { ActiveQuest, GameState, GuildState, QuestOffer, QuestReward } from '../../engine/state';
import { hauntsOf } from '../../engine/story/handbook';
import type { CharacterId } from '../../engine/types';
import { art, enemyArt, type StoryMood } from '../../render/artPaths';
import { el, itemName } from '../../ui/dom';
import type { UiAction } from '../input';
import { awaitArt, lateArt, type LateArt } from '../lateArt';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { NPC_FACILITY } from '../story';
import { MenuView, confirmBox, win } from '../widgets';
import type { Layer } from './facility';
import { TRAIT_ICON, portalArt } from './gate';

const B = T.ui2.board;

/**
 * What the board needs of the guild's screen (guild quests plan ruling 14): its stage, its stack of windows and its
 * dialogue box. The guild hands these over (`GuildScene.boardHost`); the board is a layer of the guild, not a scene.
 */
export interface BoardHost {
  ctx: SceneCtx;
  stage: HTMLElement;
  push(layer: Layer): void;
  pop(silent?: boolean): void;
  popAll(): void;
  say(text: string, mood?: 'normal' | 'happy'): Promise<void>;
  speakAs(who: CharacterId, text: string, mood?: StoryMood): Promise<void>;
  /** The gold window again, after a reward. */
  refresh(): void;
}

/** Rows on screen in the board's list (spec §8.3). */
const BOARD_ROWS = 8;

type Tab = 'board' | 'active' | 'rank';
const TABS: readonly Tab[] = ['board', 'active', 'rank'];

/** The main road as a place in a row or a note: 「本道」. */
const placeName = (r: RegionId): string => (r === 'mainline' ? B.main : REGIONS[r].name);

/** The land a quest is about, for its note's {place} and its row's icon: a scout's or sweep's own, a foe's, a material's. */
function questLand(q: QuestOffer): RegionId {
  switch (q.kind) {
    case 'scout': case 'sweep': return q.target as RegionId;
    case 'hunt': return ENEMIES[q.target]?.home ?? 'mainline';
    case 'bounty': return bountyLine(q.target)?.region ?? 'mainline';
    case 'deliver': return (Object.keys(REGIONS) as RegionId[]).find((r) => REGIONS[r].material === q.target) ?? 'mainline';
  }
}

/** What a quest asks for, as its row says it after the kind (spec §8.2): 「苔蘚史萊姆 ×6」, 「霜凍之地 第 9 層」. */
function targetText(q: QuestOffer): string {
  switch (q.kind) {
    case 'hunt': return B.count(ENEMIES[q.target].name, q.n);
    case 'bounty': return ENEMIES[q.target].name;
    case 'scout': return B.depthAt(placeName(q.target as RegionId), q.n);
    case 'deliver': return B.count(MATERIALS[q.target].name, q.n);
    case 'sweep': return placeName(q.target as RegionId);
  }
}

/** A quest's row label: 【討伐】苔蘚史萊姆 ×6. */
export const questLabel = (q: QuestOffer): string => B.row(B.kinds[q.kind], targetText(q));

/** Which note a quest posts (data/guild.zh-TW.ts). */
function noteKey(q: QuestOffer): NoteKey {
  if (q.kind === 'bounty') return bountyLine(q.target)?.warden ? 'warden' : 'boss';
  if (q.kind === 'deliver') return MATERIALS[q.target].kind as NoteKey;
  return q.kind;
}

/** The giver's note for this quest, its slots filled, once PR C has written it; nothing before. */
function noteOf(q: QuestOffer): string | undefined {
  const t = GUILD_TEXT.notes[noteKey(q)]?.[q.variant];
  if (!t) return undefined;
  const name = q.kind === 'hunt' || q.kind === 'bounty' ? ENEMIES[q.target].name : q.kind === 'deliver' ? MATERIALS[q.target].name : placeName(q.target as RegionId);
  return t.replaceAll('{target}', name).replaceAll('{place}', placeName(questLand(q))).replaceAll('{n}', q.n >= 1 && q.n <= 10 ? numeral(q.n) : '');
}

/** The reward's parts in order (spec §8.2): the gold, each item, the rune. */
export function rewardParts(r: QuestReward): string[] {
  const rune = r.rune ? parseRuneKey(r.rune) : null;
  return [T.gold(r.gold), ...Object.entries(r.items ?? {}).map(([id, n]) => `${itemName(id)} ×${n}`), ...(rune ? [T.rune.label(rune.id, rune.tier)] : [])];
}

/** A lamp's gift (spec §6.3): its gold, then each item. */
function giftParts(rank: number): string[] {
  const g = RANKS[rank].gift;
  return [...(g.gold ? [T.gold(g.gold)] : []), ...Object.entries(g.items ?? {}).map(([id, n]) => `${itemName(id)} ×${n}`)];
}

/** A held quest's row on the right (spec §8.2): 可回報 in gold once done, else its progress. Shared with the labyrinth's page. */
export function heldRight(s: GameState, q: ActiveQuest): Pick<MenuItem, 'right' | 'rightClass'> {
  const p = progressOf(s, q);
  return p.done ? { right: B.ready, rightClass: 'slx-fresh' } : { right: progressText(q, p) };
}

/** A held quest's progress in its row (spec §8.2): 3／6, 最深 5／9, 持有 3／8. */
function progressText(q: QuestOffer, p: Progress): string {
  return q.kind === 'scout' ? B.deepest(p.have, p.need) : q.kind === 'deliver' ? B.held(p.have, p.need) : B.progress(Math.min(p.have, p.need), p.need);
}

/** Who posted the note, by name. */
const giverName = (q: QuestOffer): string => T.ui2.facility[NPC_FACILITY[q.giver]!].npc;

/**
 * The board (spec §8.2): the tabs 布告 / 進行中 / 評等 over a list, and the detail of the row under the cursor in its own
 * window beside it. Left and right turn the tabs; the rest goes to the list (MenuView leaves left and right alone).
 */
export class BoardLayer implements Layer {
  readonly el: HTMLElement;
  private readonly head = el('p', { class: 'slx-board-head' });
  private readonly tabsEl = el('div', { class: 'slx-tabs', attrs: { role: 'tablist' } });
  private readonly listEl = el('div', { class: 'slx-board-list' });
  readonly info = win('slx-info slx-board-info');
  private view!: MenuView;
  private tab = 0;
  private cursors = new Map<Tab, number>();

  constructor(private host: BoardHost) {
    this.el = win('slx-board', [this.head, this.tabsEl, this.listEl]);
    host.stage.append(this.info);
    this.render();
  }

  private get game() { return this.host.ctx.game; }
  private get guild(): GuildState { return this.game.state.guild!; }

  onAction(a: UiAction): boolean {
    if (a === 'left' || a === 'prev') { this.turn(-1); return true; }
    if (a === 'right' || a === 'next') { this.turn(1); return true; }
    return this.view.onAction(a);
  }

  private turn(d: 1 | -1): void {
    this.tab = (this.tab + d + TABS.length) % TABS.length;
    this.host.ctx.sfx.cursor();
    this.render();
  }

  /** Off the guild's stage: the board and its detail. */
  close(): void {
    this.info.remove();
    this.host.pop();
  }

  /** Draws the head, the tabs, the current tab's rows and the detail again (after any change). */
  render(): void {
    const g = this.guild;
    const rank = rankOf(g.merit);
    const next = RANKS[rank + 1]?.merit;
    this.head.textContent = B.head(B.rankNames[rank], g.merit, next);
    const names = [B.tabs.board, B.tabs.active(g.active.length, RANKS[rank].cap), B.tabs.rank];
    this.tabsEl.replaceChildren(...names.map((name, i) => {
      const t = el('span', { class: i === this.tab ? 'slx-tab slx-tab-sel' : 'slx-tab', text: name, attrs: { role: 'tab', 'aria-selected': String(i === this.tab) } });
      t.addEventListener('click', () => { if (t.closest('[inert]') || i === this.tab) return; this.tab = i; this.host.ctx.sfx.cursor(); this.render(); });
      return t;
    }));
    const tab = TABS[this.tab];
    const items = this.rows(tab);
    const menu = new Menu(items, this.cursors.get(tab) ?? (tab === 'rank' ? rankOf(g.merit) : 0));
    this.view = new MenuView(menu, {
      pick: (it) => { this.cursors.set(tab, menu.cursor); this.pick(tab, it.id); },
      moved: () => { this.cursors.set(tab, menu.cursor); this.host.ctx.sfx.cursor(); this.drawDetail(); },
      cancel: () => this.close(),   // the guild's pop sounds the cancel cue
    }, BOARD_ROWS);
    this.listEl.replaceChildren(this.view.el);
    this.drawDetail();
  }

  private rows(tab: Tab): MenuItem[] {
    const g = this.guild;
    if (tab === 'board') {
      return g.offers.length ? g.offers.map((o) => ({ id: o.id, label: questLabel(o), right: T.gold(o.reward.gold), icon: this.icon(o) }))
        : [{ id: '', label: B.emptyBoard, disabled: true }];
    }
    if (tab === 'active') {
      return g.active.length ? g.active.map((q) => ({ id: q.id, label: questLabel(q), icon: this.icon(q), ...heldRight(this.game.state, q) }))
        : [{ id: '', label: B.emptyActive, disabled: true }];
    }
    const now = rankOf(g.merit);
    return RANKS.map((r, i) => ({ id: String(i), label: B.rankNames[i], ...(i === now ? { right: B.current, rightClass: 'slx-fresh' } : { right: B.rankFrom(r.merit) }) }));
  }

  /** A delivery's material icon; a scout's or sweep's land's (none on the main road); none for a foe (spec §8.2). */
  private icon(q: QuestOffer): LateArt | undefined {
    if (q.kind === 'deliver') return lateArt(this.host.ctx.art, art.icon(q.target));
    if (q.kind !== 'scout' && q.kind !== 'sweep') return undefined;
    const k = TRAIT_ICON[q.target as RegionId];
    return k ? lateArt(this.host.ctx.art, portalArt.trait(k)) : undefined;
  }

  /** A note asks to be taken; a held quest opens its small menu; a lamp on the rank tab is only read. */
  private pick(tab: Tab, id: string): void {
    if (tab === 'board') this.take(id);
    else if (tab === 'active') this.heldMenu(id);
  }

  /**
   * Spec §8.4: a note is taken on a 是 (the question's first answer). A full hand takes nothing: the error cue, and Anna's
   * line once PR C has written it. Taken, it moves to the held tab, saved at once (Game.acceptQuest), and the guild's box
   * says so (her words once written, the interface's until then). Nothing draws.
   */
  private take(id: string): void {
    const g = this.guild;
    const o = g.offers.find((x) => x.id === id);
    if (!o) return;
    const { ctx } = this.host;
    if (g.active.length >= RANKS[rankOf(g.merit)].cap) { this.refuse('full'); return; }
    ctx.sfx.confirm();
    const label = questLabel(o);
    const box = confirmBox(B.acceptAsk(label), (yes) => {
      this.host.pop();
      if (!yes) return;
      const r = this.game.acceptQuest(id);
      this.render();
      if (!r.ok) { this.refuse(r.reason); return; }
      void this.host.say(GUILD_TEXT.anna.accepted ?? B.accepted(label));
    });
    this.host.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  /** A refusal: the error cue, then Anna's own line for a full hand once written, else the general reason. */
  private refuse(reason: string): void {
    this.host.ctx.sfx.error();
    const line = reason === 'full' ? GUILD_TEXT.anna.full : T.reasons[reason] ?? T.reasons.invalid;
    if (line) void this.host.say(line);
  }

  /** Spec §8.4: a held quest's small menu: 回報 when it is done (a delivery with its goods in stock), 放棄, 返回. */
  private heldMenu(id: string): void {
    const q = this.guild.active.find((x) => x.id === id);
    if (!q) return;
    this.host.ctx.sfx.confirm();
    const done = progressOf(this.game.state, q).done;
    const v = new MenuView(new Menu([...(done ? [{ id: 'turnIn', label: B.turnIn }] : []), { id: 'abandon', label: B.abandon }, { id: 'back', label: B.back }]), {
      pick: (it) => {
        if (it.id === 'back') { this.host.pop(); return; }
        this.host.ctx.sfx.confirm();
        if (it.id === 'turnIn') { this.host.pop(true); void this.turnIn(q); } else this.askAbandon(q);
      },
      moved: () => this.host.ctx.sfx.cursor(),
      cancel: () => this.host.pop(),
    });
    this.host.push({ el: win('slx-list slx-board-menu', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** Dropping asks again, 否 first; on 是 the quest goes (free, saved at once) and the small menu with it. */
  private askAbandon(q: ActiveQuest): void {
    const box = confirmBox(B.abandonAsk(questLabel(q)), (yes) => {
      this.host.pop();
      if (!yes) return;
      this.host.pop(true);
      const r = this.game.abandonQuest(q.id);
      this.render();
      if (!r.ok) this.refuse(r.reason);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.host.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  /**
   * Spec §8.4: turned in (saved at once, Game.turnInQuest), the list and the gold first, then in the guild's box: the
   * giver's thanks behind 「〇〇留了話：」 and the companion's word in her own name (each once PR C writes it), the reward,
   * a rune past its stack as the gold it became, and for each lamp reached its stamp (once written), the new rank and its
   * gift. Nothing draws.
   */
  private async turnIn(q: ActiveQuest): Promise<void> {
    const r = this.game.turnInQuest(q.id);
    this.render();
    if (!r.ok) { this.refuse(r.reason); return; }
    this.host.refresh();
    const thanks = GUILD_TEXT.thanks[q.giver]?.[q.variant];
    if (thanks) await this.host.say(`${B.note(giverName(q))}${thanks}`, 'happy');
    const remark = r.remark ? GUILD_TEXT.remarks[r.remark] : undefined;
    if (r.remark && remark) await this.host.speakAs(r.remark, remark);
    await this.host.say(T.ui2.exchange.reward(rewardParts(r.reward).join('、')), 'happy');
    const rune = r.reward.rune ? parseRuneKey(r.reward.rune) : null;
    if (rune && r.runeGold) await this.host.say(T.rune.overStack(T.rune.label(rune.id, rune.tier), RUNE_STACK, r.runeGold));
    for (const k of r.rankUps) {
      const stamp = GUILD_TEXT.anna.stamp[k as 1 | 2 | 3 | 4];
      if (stamp) await this.host.say(stamp, 'happy');
      await this.host.say(B.rankUp(B.rankNames[k]));
      const parts = giftParts(k);
      if (parts.length) await this.host.say(B.gift(parts.join('、')), 'happy');
    }
  }

  /** The quest under the cursor on the board or held tab (none on an empty list). */
  private current(): { q: QuestOffer | ActiveQuest; held: boolean } | null {
    const id = this.view.menu.current()?.id;
    const tab = TABS[this.tab];
    if (!id || tab === 'rank') return null;
    const g = this.guild;
    const q = tab === 'board' ? g.offers.find((o) => o.id === id) : g.active.find((o) => o.id === id);
    return q ? { q, held: tab === 'active' } : null;
  }

  /**
   * The detail (spec §8.2): the giver's face and the foe once their pictures have landed (never a stand-in), then who
   * posted it, the note (once written), the target, where it haunts, the progress of a held quest, the reward, the merit.
   */
  private drawDetail(): void {
    if (TABS[this.tab] === 'rank') { this.drawRank(); return; }
    const cur = this.current();
    if (!cur) { this.info.replaceChildren(); awaitArt(this.info, 'art', [], () => {}); return; }
    const { q, held } = cur;
    const idx = this.host.ctx.art;
    const pictures: HTMLElement[] = [];
    const missing: string[] = [];
    const face = art.npc(NPC_FACILITY[q.giver]!, 'normal');
    if (idx.has(face)) pictures.push(el('img', { class: 'slx-board-face', attrs: { src: face, alt: '' } }));
    else missing.push(face);
    if (q.kind === 'hunt' || q.kind === 'bounty') {
      const src = enemyArt(q.target);
      if (idx.has(src)) pictures.push(el('img', { class: ENEMIES[q.target].boss ? 'slx-hb-foe' : 'slx-hb-foe slx-hb-foe-x2', attrs: { src, alt: ENEMIES[q.target].name } }));
      else missing.push(src);
    }
    const note = noteOf(q);
    const haunts = q.kind === 'hunt' || q.kind === 'bounty' ? hauntsOf(ENEMIES[q.target])
      : q.kind === 'deliver' ? (questLand(q) !== 'mainline' ? REGIONS[questLand(q)].name : undefined) : REGIONS[q.target as RegionId].name;
    const p = (text: string, cls?: string) => el('p', { text, ...(cls ? { class: cls } : {}) });
    this.info.replaceChildren(
      ...(pictures.length ? [el('div', { class: 'slx-board-art' }, pictures)] : []),
      p(B.giver(giverName(q))),
      ...(note ? [p(note, 'slx-board-note')] : []),
      p(B.target(q.kind === 'sweep' ? B.natives(placeName(q.target as RegionId), q.n) : targetText(q))),
      ...(haunts ? [p(B.haunts(haunts))] : []),
      ...(held ? [p(B.progressLine(progressText(q, progressOf(this.game.state, q as ActiveQuest))))] : []),
      p(B.reward(rewardParts(q.reward).join('、'))),
      p(B.merit(q.merit)),
    );
    // What has not landed is drawn when it does, if the cursor is still here (ui2/lateArt).
    awaitArt(this.info, 'art', missing, () => this.drawDetail());
  }

  /** The rank tab's detail: where the party stands, then what the lamp under the cursor brings. */
  private drawRank(): void {
    awaitArt(this.info, 'art', [], () => {});
    const g = this.guild;
    const now = rankOf(g.merit);
    const i = Number(this.view.menu.current()?.id ?? now);
    const r = RANKS[i];
    const gift = giftParts(i);
    const p = (text: string, cls?: string) => el('p', { text, ...(cls ? { class: cls } : {}) });
    this.info.replaceChildren(
      p(B.rankNow(B.rankNames[now])), p(B.merit(g.merit)),
      p(RANKS[now + 1] ? B.rankNext(B.rankNames[now + 1], RANKS[now + 1].merit) : B.rankTop),
      el('h4', { text: B.rankNames[i] }),
      p(B.perks(r.kinds.map((k: QuestKind) => B.kinds[k]).join('、'))),
      p(B.offers(r.offers)), p(B.cap(r.cap)),
      ...(r.runeBounty ? [p(B.runeBounty)] : []),
      ...(r.doubleBounty ? [p(B.doubleBounty)] : []),
      ...(gift.length ? [p(B.gift(gift.join('、')))] : []),
    );
  }
}

/**
 * The board opened at the guild (spec §8.1): today's board is posted if none is yet and marked seen (Game.openBoard, the
 * board's own stream only), the window goes up, and the first time Anna tells how it works (once PR C has written it).
 */
export function openBoard(host: BoardHost): BoardLayer | null {
  const r = host.ctx.game.openBoard();
  if (!r.ok) { host.ctx.sfx.error(); return null; }
  const layer = new BoardLayer(host);
  host.push(layer);
  void (async () => {
    if (r.first) for (const line of GUILD_TEXT.anna.intro) await host.say(line);
    else if (!host.ctx.game.state.guild!.offers.length && GUILD_TEXT.anna.empty) await host.say(GUILD_TEXT.anna.empty);
  })();
  return layer;
}
