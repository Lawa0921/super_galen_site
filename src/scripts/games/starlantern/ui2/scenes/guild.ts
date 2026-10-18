import { CHARACTERS, titleOf } from '../../data/characters';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import type { SceneId } from '../../data/story/scenes';
import { ABSORB_CAP, SHARD_IDS, SHARD_NAMES, TOWN_FRAGMENTS, fragmentName, type ShardGrade, type TownFragmentDef, type TownFragmentId } from '../../data/story/fragments';
import { T } from '../../data/text.zh-TW';
import { MAX_ACTIVE } from '../../engine/formation';
import { activeIds } from '../../engine/party';
import { shardPrice } from '../../engine/story/fragments';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { artIdOf, standeeImg } from '../../ui/art';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, QtyView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

const name = (id: CharacterId) => CHARACTERS[id].name;
const GRADES: ShardGrade[] = ['dim', 'clear', 'vivid'];

/** Guild: recalling companions met in the labyrinth; formation, equipment and the character sheet open their own screens. */
export class GuildScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'guild', cps); }

  /** Met, off the field and not the hero: who the guild can recall. */
  private waiting(): CharacterId[] {
    const p = this.ctx.game.state.party;
    return p.recruited.filter((id) => id !== 'hero' && !p.grid.includes(id));
  }

  protected commands(): MenuItem[] {
    const g = T.ui2.guild;
    return [{ id: 'formation', label: g.formation }, { id: 'recall', label: g.recall, disabled: this.waiting().length === 0 }, { id: 'equip', label: g.equip }, { id: 'status', label: g.status }, { id: 'tree', label: g.tree }, { id: 'talent', label: g.talent }, { id: 'exchange', label: T.ui2.exchange.title }, { id: 'handbook', label: T.ui2.handbook.title }];
  }

  protected onCommand(id: string): void {
    if (id === 'recall') this.recallList();
    else if (id === 'exchange') this.exchangeMenu();
    else if (id === 'formation' || id === 'equip' || id === 'status' || id === 'handbook') this.ctx.go(id);
    else if (id === 'tree' || id === 'talent') this.ctx.go('status', `tab:${id}`);
  }

  private titled(id: CharacterId): string { return titleOf(this.ctx.game.state.party.roster[id]); }

  private faceIcon(id: CharacterId): string | undefined {
    const look = artIdOf(this.ctx.game.state.party.roster[id]);
    return this.ctx.art.has(art.portrait(look, 'normal')) ? art.portrait(look, 'normal') : undefined;
  }

  private recallList(): void {
    const ids = this.waiting();
    const info = win('slx-info');
    this.info = info;
    const show = (id: CharacterId | undefined) => this.showInfo(id);
    const v = new MenuView(new Menu(ids.map((id) => ({ id, label: `${this.titled(id)} ${name(id)}`, icon: this.faceIcon(id) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askRecall(it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); show(v.menu.current()?.id as CharacterId); },
      cancel: () => { info.remove(); this.info = undefined; this.pop(); },
    });
    show(ids[0]);
    this.stage.append(info);
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private info: HTMLElement | undefined;

  /** The info pane for `id`; `out` retitles it when the question is who steps out, not who comes back. */
  private showInfo(id: CharacterId | undefined, out = false): void {
    if (!id || !this.info) return;
    this.info.classList.toggle('slx-info-swap', out);
    this.info.replaceChildren(...[standeeImg(this.ctx.art, artIdOf(this.ctx.game.state.party.roster[id]))].filter((n): n is HTMLImageElement => !!n),
      el('p', { text: out ? T.ui2.guild.swapOut(name(id)) : `${this.titled(id)} ${name(id)}` }), el('p', { class: 'slx-desc', text: T.ui2.guild.roles[id] }));
  }

  private askRecall(id: CharacterId): void {
    const box = confirmBox(T.ui2.guild.recallAsk(name(id)), (yes) => {
      this.pop();
      if (!yes) return;
      if (activeIds(this.ctx.game.state.party).length < MAX_ACTIVE) this.finishRecall(id);
      else this.swapList(id);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  /** The field is full: who goes back to waiting (never the hero). */
  private swapList(id: CharacterId): void {
    const ids = activeIds(this.ctx.game.state.party).filter((x) => x !== 'hero');
    const v = new MenuView(new Menu(ids.map((x) => ({ id: x, label: `${this.titled(x)} ${name(x)}`, icon: this.faceIcon(x) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.finishRecall(id, it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); this.showInfo(v.menu.current()?.id as CharacterId, true); },
      cancel: () => { this.showInfo(id); this.pop(); },
    });
    this.showInfo(ids[0], true);
    this.push({ el: win('slx-list', [el('p', { text: T.ui2.guild.swapWho }), v.el]), onAction: (a) => v.onAction(a) });
  }

  private finishRecall(id: CharacterId, out?: CharacterId): void {
    if (!this.ctx.game.recall(id, out).ok) { this.ctx.sfx.error(); return; }
    this.popAll();
    this.stage.querySelector('.slx-info')?.remove();
    this.info = undefined;
    this.refresh();
    void this.say(T.ui2.guild.welcomeBack(name(id)), 'happy');
  }

  // ---- The fragment exchange: sell, absorb and give back ----

  private shards(): ShardGrade[] {
    const inv = this.ctx.game.state.inventory;
    return GRADES.filter((g) => (inv[SHARD_IDS[g]] ?? 0) > 0);
  }

  private townFragments(): TownFragmentDef[] {
    const inv = this.ctx.game.state.inventory;
    return TOWN_FRAGMENTS.filter((f) => (inv[f.item] ?? 0) > 0);
  }

  private exchangeMenu(): void {
    const x = T.ui2.exchange;
    const v = new MenuView(new Menu([
      { id: 'sell', label: x.sell, disabled: this.shards().length === 0 },
      { id: 'absorb', label: x.absorb, disabled: this.shards().length === 0 },
      { id: 'give', label: x.give, disabled: this.townFragments().length === 0 },
    ]), {
      pick: (it) => { this.ctx.sfx.confirm(); if (it.id === 'sell') this.sellShardList(); else if (it.id === 'absorb') this.absorbGradeList(); else this.giveList(); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-exchange', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** Back to the exchange menu with fresh counts, once something changed. */
  private reopenExchange(): void {
    this.popAll();
    this.refresh();
    this.exchangeMenu();
  }

  /** A refusal in the exchange's own words, then the general reason, then the plain one. */
  private exchangeFail(reason: string, own: Record<string, string>): void {
    this.ctx.sfx.error();
    void this.say(own[reason] ?? T.reasons[reason] ?? T.reasons.invalid);
  }

  private gradeRows(price: boolean): MenuItem[] {
    const inv = this.ctx.game.state.inventory;
    return this.shards().map((g) => ({
      id: g, label: SHARD_NAMES[g],
      right: price ? `${shardPrice(this.ctx.game.state, g)} G  ${T.ui2.shop.owned(inv[SHARD_IDS[g]])}` : T.ui2.shop.owned(inv[SHARD_IDS[g]]),
    }));
  }

  private sellShardList(): void {
    const v = new MenuView(new Menu(this.gradeRows(true)), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askSellQty(it.id as ShardGrade); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-exchange-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askSellQty(grade: ShardGrade): void {
    const have = this.ctx.game.state.inventory[SHARD_IDS[grade]] ?? 0;
    const price = shardPrice(this.ctx.game.state, grade);
    const q = new QtyView(have, {
      change: () => this.ctx.sfx.cursor(),
      done: (n) => {
        this.pop();
        const gold = this.ctx.game.state.gold;
        const r = this.ctx.game.sellShards(grade, n);
        if (!r.ok) { this.exchangeFail(r.reason, {}); return; }
        this.reopenExchange();
        void this.say(T.ui2.shop.sold(SHARD_NAMES[grade], n, this.ctx.game.state.gold - gold), 'happy');
      },
      cancel: () => this.pop(),
    }, price);
    this.push({ el: q.el, onAction: (a) => q.onAction(a) });
  }

  private absorbGradeList(): void {
    const v = new MenuView(new Menu(this.gradeRows(false)), {
      pick: (it) => { this.ctx.sfx.confirm(); this.absorbMemberList(it.id as ShardGrade); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-exchange-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  /** Only members the party has met can take a shard; one with a full 20 is greyed out. */
  private absorbMemberList(grade: ShardGrade): void {
    const s = this.ctx.game.state;
    const items = s.party.recruited.map((id): MenuItem => {
      const n = s.party.roster[id].absorbed?.length ?? 0;
      return { id, label: `${this.titled(id)} ${name(id)}`, icon: this.faceIcon(id), right: T.ui2.exchange.count(n, ABSORB_CAP), disabled: n >= ABSORB_CAP };
    });
    if (items.every((it) => it.disabled)) { this.exchangeFail('cap', T.ui2.exchange.absorbFail); return; }
    const v = new MenuView(new Menu(items), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askAbsorb(it.id as CharacterId, grade); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-exchange-list', [el('p', { text: T.ui2.exchange.who }), v.el]), onAction: (a) => v.onAction(a) });
  }

  private askAbsorb(id: CharacterId, grade: ShardGrade): void {
    const box = confirmBox(T.ui2.exchange.absorbAsk(SHARD_NAMES[grade], name(id)), (yes) => {
      this.pop();
      if (yes) void this.finishAbsorb(id, grade);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private async finishAbsorb(id: CharacterId, grade: ShardGrade): Promise<void> {
    const r = this.ctx.game.absorb(id, grade);
    if (!r.ok) { this.exchangeFail(r.reason, T.ui2.exchange.absorbFail); return; }
    this.reopenExchange();
    await this.say(r.line, 'happy');
    await this.say(T.ui2.exchange.gain(T.gear.statName[r.gain.stat], r.gain.amount));
  }

  private giveList(): void {
    const inv = this.ctx.game.state.inventory;
    const v = new MenuView(new Menu(this.townFragments().map((f) => ({ id: f.id, label: fragmentName(f.item) ?? f.item, right: T.ui2.shop.owned(inv[f.item]) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askGive(it.id as TownFragmentId, it.label); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-exchange-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askGive(id: TownFragmentId, label: string): void {
    const box = confirmBox(T.ui2.exchange.giveAsk(label), (yes) => {
      this.pop();
      if (yes) void this.finishGive(id);
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  /** The return plays at the guild: the owner's scene (unless the player's story setting skips it), then the reward. */
  private async finishGive(id: TownFragmentId): Promise<void> {
    const game = this.ctx.game;
    const r = game.returnFragment(id);
    if (!r.ok) { this.exchangeFail(r.reason, T.ui2.exchange.giveFail); return; }
    const scene: SceneId = `town:${id}`;
    this.popAll();
    this.refresh();
    await this.play(scene);   // recorded as played, skipped or (story off) auto; it leaves `pending` only through sceneDone
    this.exchangeMenu();
    const reward = TOWN_FRAGMENTS.find((f) => f.id === id)!.reward;
    const parts = [
      ...(reward.gold ? [`${reward.gold} G`] : []),
      ...Object.entries(reward.items ?? {}).map(([item, n]) => `${ITEMS[item]?.name ?? MATERIALS[item]?.name ?? item} ×${n}`),
    ];
    await this.say(T.ui2.exchange.reward(parts.join('、')), 'happy');
  }
}
