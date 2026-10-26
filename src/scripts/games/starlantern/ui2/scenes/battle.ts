import type { SoundManager } from '../../audio/SoundManager';
import type { HitExtra, PartyCue } from '../../render/BattleView';
import type { FxKey } from '../../render/artPaths';
import { ITEMS } from '../../data/items';
import { T } from '../../data/text.zh-TW';
import { LIMIT_MAX, foeDef, intentLabel, runeView, skillFor, type Action, type BattleState } from '../../engine/battle';
import { choosable, foeNotes } from '../../engine/foes';
import { autoActions } from '../../engine/builds';
import type { Combatant } from '../../engine/combatant';
import { ailmentChips, type AilmentChip } from '../../engine/ailments';
import { AFFIXES } from '../../data/affixes';
import { castCost, cueWord, fieldWords, foeWords, memberWords, whyNot, type MechCue, type MechWord } from '../../engine/mechanics/index';
import { ECHO, echoDef, echoOf } from '../../engine/mechanics/echo';
import type { BattleEnd } from '../../engine/game';
import { learnedSkills, ultimateFor } from '../../engine/progression';
import type { CharacterId, SkillDef, Target } from '../../engine/types';
import { art, enemyArt } from '../../render/artPaths';
import { el, itemName } from '../../ui/dom';
import { playCutIn } from '../../ui/cutin';
import { battleLines, fragmentLines, levelUpLines } from '../battleText';
import { fragmentItem } from '../../engine/story/fragments';
import { gearIconLate } from '../gearArt';
import { anyLanded, lateArt, noteMissing } from '../lateArt';
import { runeMark } from '../runeArt';
import { fillRich, gearLabel, gearPart, rarityClass } from '../loot';
import { RUNE_SLOT_LEVELS, RUNE_STACK } from '../../data/runes';
import { autoLine, battleLine, shownDef, withoutPowerClause } from '../skillCard';
import { clearPillars, dropMoment, skipPillar } from '../lootFx';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import { PartyBar, chipWord, type PulseOpts } from '../partyBar';
import { MorePopover, moreTrigger } from '../morePopover';
import { mechIconUrls } from '../../render/chipIcons';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, backControl, richInto, win, type Rich } from '../widgets';
import { textCps } from '../settings';
import { playAndRecord, storyCtx } from '../story';
import { playRescue } from '../rescue';
import { memScene, type SceneId } from '../../data/story/scenes';

/** Width kept clear for the command window; must match $slx-battle-left in _starlantern-ui.scss. */
export const BATTLE_LEFT = 150;
/** How long a battle waits for its foes' pictures and its backdrop before it is drawn (a late one is drawn when it lands). */
export const BATTLE_ART_WAIT_MS = 1500;
/** Past this stage x a foe's +N list is ended at its target's right edge, not centred (a long affix list stays on screen). */
const FOE_LIST_END_X = 440;
const BANNER_MS = 1100;
const WIN_MS = 1000;
/**
 * Height kept clear for the party bar; must match the .slx-partybar box in _starlantern-ui.scss. 70, not 66, since the
 * ailment words above each panel are 12px on a 14px line (legibility Task 4): the foes' HP bars stand 4px higher.
 */
export const BATTLE_BOTTOM = 70;

interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }
type Pending = { kind: 'attack' } | { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'ultimate' } | { kind: 'echo'; rec: NonNullable<BattleState['echo']> };

/** Battle: message line on top, party bar below, a command window per member, target picking, playback and results. */
export class BattleScene implements Scene {
  private root!: HTMLElement;
  private body!: HTMLElement;
  private msg!: HTMLElement;
  private cmd!: HTMLElement;
  private marker!: HTMLElement;
  /** The field bar: the barrier up and the moon (plan 8c). */
  private field = el('div', { class: 'slx-fieldbar', attrs: { role: 'status', hidden: '' } });
  /** The icons the field bar, and the foes' open lists, were last drawn without (ui2/lateArt). */
  private fieldWait = new Set<string>();
  private foeWait = new Set<string>();
  private cutin!: HTMLElement;
  private backEl!: HTMLElement;
  private note: HTMLElement | null = null;
  private bar: PartyBar;
  /** The list a tapped 「+N」 opens (touch overflow), a member's or a foe's; one at a time. */
  private more = new MorePopover();
  /** The tap targets over the foes' 「+N」 (the picture draws the words): first in the scene, under every window. */
  private foeMore = el('div', { class: 'slx-foe-more-layer' });
  private layers: Layer[] = [];
  private view: MenuView | null = null;
  private state!: BattleState;
  private index = 0;
  private actions: Record<string, Action> = {};
  private busy = false;
  private result: MenuView | null = null;
  private resultReady = false;
  /** Party values from before the round, shown until each member's own hit plays. */
  /** Each member as the round began (ailments too), shown until the playback reaches them. */
  private before: Map<string, Pick<Combatant, 'hp' | 'tp' | 'limit' | 'alive'> & { ailments: AilmentChip[]; mech: MechWord[] }> | null = null;
  private revealed = new Set<string>();
  private actLine = '';
  private cutins = 0;
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Says the rescue and the rune tutorial after the result window. */
  private talk: Dialogue;
  /** The rune tutorial is on screen (plan 8g Task 6): the dialogue takes the actions. */
  private tutoring = false;
  /** Who was rescued, speaking and joining after 繼續 (story polish Task 1): the dialogue takes the actions. */
  private rescue: ReturnType<typeof playRescue> | null = null;
  /** 繼續 was taken: the way out runs once, however often the key is pressed. */
  private picked = false;

  constructor(private ctx: SceneCtx, cps = textCps(ctx)) {
    this.bar = new PartyBar(ctx.art, this.more);
    this.talk = new Dialogue(cps);
  }

  /** Behind the fade: this fight's enemy pictures and backdrop get a moment to land, so no foe is drawn without its body. */
  async prepare(): Promise<void> {
    const g = this.ctx.game, b = g.battle;
    if (!this.ctx.stage || !b) return;
    await this.ctx.art.whenReady?.([...new Set(b.enemies.map((e) => enemyArt(e.defId))), art.bg(g.terrain())], BATTLE_ART_WAIT_MS);
  }

  enter(root: HTMLElement): void {
    this.root = root;
    this.state = this.ctx.game.battle!;
    this.msg = win('slx-msg');
    this.cmd = win('slx-bcmd');
    this.marker = el('div', { class: 'slx-target', text: '▼', attrs: { hidden: '', 'aria-hidden': 'true' } });
    this.cutin = el('div', { class: 'sl-cutin', attrs: { hidden: '', 'aria-hidden': 'true' } });
    this.backEl = backControl(() => this.onAction('cancel'));
    this.body = el('div', { class: 'slx-scene slx-battle' }, [this.foeMore, this.msg, this.field, this.marker, this.bar.el, this.cmd, this.backEl, this.cutin, this.talk.el]);
    root.append(this.body);
    if (this.ctx.stage) {
      this.ctx.stage.show('battle');
      this.ctx.stage.battleView.setup(this.state, this.ctx.stage.size(), this.ctx.game.terrain(), BATTLE_LEFT, BATTLE_BOTTOM, this.ctx.game.run?.region);
      // A foe's picture that lands late raises its row: the tap targets over the +N follow at once.
      this.ctx.stage.battleView.onRowsMoved = () => this.showFoeMore();
    }
    this.msg.textContent = this.state.enemies.map((e) => e.name).join('、') + this.surviveLine();
    this.banner(this.state.boss ? T.ui2.banner.boss : T.ui2.banner.encounter, this.state.boss ? 'slx-banner-boss' : '');
    this.startRound();
  }

  /**
   * Faces and row icons that landed after they were drawn (ui2/lateArt): the party bar, the field bar and an open list of a
   * foe's row, each only when it was drawn without one of `urls`; the lists and the lines draw their own, and the picture
   * its own (BattleView).
   */
  artArrived(urls: ReadonlySet<string>): void {
    this.bar.artArrived(urls);
    if (!this.field.hidden && anyLanded(urls, this.fieldWait)) this.showField();
    if (this.more.openId?.startsWith('foe:') && anyLanded(urls, this.foeWait)) this.showFoeMore();
  }

  exit(): void {
    this.talk.stop();
    this.more.dispose();
    if (this.ctx.stage) this.ctx.stage.battleView.onRowsMoved = null;
    if (this.body) clearPillars(this.body);
    this.ctx.stage?.show(null);
  }

  onAction(a: UiAction): void {
    // An open +N list takes cancel (Esc) for itself; any other key closes it and goes on as always.
    if (this.more.onAction(a)) return;
    if (this.rescue) { this.rescue.onAction(a); return; }
    if (this.tutoring) { this.talk.onAction(a); return; }
    if (this.busy) return;
    // Confirm or cancel ends a legendary drop's moment first (fast mode never waits on it).
    if (!this.ctx.fast && skipPillar(this.body, a)) return;
    if (this.result) {
      // Long results scroll with the keys; the only option is 繼續.
      const lines = this.body.querySelector<HTMLElement>('.slx-result-lines');
      if (lines && (a === 'up' || a === 'down')) { lines.scrollTop = Math.max(0, lines.scrollTop + (a === 'down' ? 48 : -48)); return; }
      if (this.resultReady) this.result.onAction(a);
      return;
    }
    const top = this.layers[this.layers.length - 1];
    if (top) { top.onAction(a); return; }
    this.view?.onAction(a);
  }

  /** Who chooses a command this round: a sleeping or frozen member loses the turn and is skipped. */
  private actors(): Combatant[] {
    return this.state.party.filter((c) => c.alive && c.sleep === 0 && !c.frozen);
  }

  private updateBar(active: string | null): void {
    this.bar.update(this.state.party.map((c) => {
      const was = this.revealed.has(c.key) ? undefined : this.before?.get(c.key);
      const v = was || c;
      // Ailments end with the fight (a new fight starts clean), so a finished one shows none.
      const ongoing = this.state.outcome === 'ongoing';
      const ailments = was ? was.ailments : ongoing ? ailmentChips(c) : [];
      // Her mechanic's words, held like the ailments until the playback is over (plan 8c).
      const mech = was ? was.mech : ongoing ? memberWords(this.state, c) : [];
      return { key: c.key, name: c.name, hp: v.hp, maxHp: c.max.hp, tp: v.tp, maxTp: c.max.tp, limit: v.limit, alive: v.alive, row: c.row, ailments, mech, ...(c.artId ? { artId: c.artId } : {}) };
    }), active);
  }

  /** A survive fight's reminder, on a line of its own: how many rounds are left. Empty in a plain fight. */
  private surviveLine(): string {
    const s = this.state;
    return s.survive ? `\n${T.ui2.battle.survive(Math.max(0, s.survive - s.round))}` : '';
  }

  private startRound(): void {
    if (this.state.survive && this.state.round > 0) this.msg.textContent += this.surviveLine();
    this.index = 0;
    this.actions = {};
    this.showIntents();
    this.renderCommands();
  }

  private renderCommands(): void {
    const actor = this.actors()[this.index];
    if (!actor) { void this.submit(); return; }
    this.updateBar(actor.key);
    const ult = ultimateFor(actor.defId as CharacterId, actor.ranks, actor);
    const skills = this.skillItems(actor);
    const items = this.itemItems();
    const list: MenuItem[] = [
      { id: 'attack', label: T.cmd.attack },
      { id: 'skill', label: T.cmd.skill, disabled: !skills.some((s) => !s.disabled) },
      ...this.echoItem(actor),
      { id: 'defend', label: T.cmd.defend },
      { id: 'item', label: T.cmd.item, disabled: items.length === 0 },
      ...(actor.limit >= LIMIT_MAX && ult ? [{ id: 'ultimate', label: T.cmd.ultimate(ult.name) }] : []),
      { id: 'escape', label: T.cmd.escape, disabled: this.state.boss },
      // 自動 (plan 8h ruling 15): its note is the round it will play for whoever has no command yet.
      { id: 'policy', label: T.cmd.policy, note: autoLine(this.state, this.ctx.game.state.party, this.actors().slice(this.index).map((c) => c.key)) },
      { id: 'auto', label: T.cmd.auto },
    ];
    this.view = new MenuView(new Menu(list), {
      pick: (it) => { this.ctx.sfx.confirm(); this.command(it.id, actor); },
      moved: () => { this.ctx.sfx.cursor(); this.showNote(this.view?.menu.current()?.note); },
      cancel: () => this.back(),
    });
    this.cmd.replaceChildren(el('div', { class: 'slx-who', text: T.cmd.choose(actor.name) }), this.view.el);
    this.syncBack();
  }

  /** Each living enemy's announced move, over its head. */
  private showIntents(): void {
    const s = this.state;
    this.ctx.stage?.battleView.showIntents?.(Object.fromEntries(s.enemies.filter((e) => e.alive).map((e) => [e.key, intentLabel(s, e.key)])));
    this.showAilments();
  }

  /** The field bar (plan 8c): the barrier up and the moon, as words in their colours; hidden when there are none. */
  private showField(): void {
    const words = this.state.outcome === 'ongoing' ? fieldWords(this.state) : [];
    // Each with its 14px icon in front once loaded (art step 9, G4): the barrier's kind, the moon's phase now.
    const art = noteMissing(this.ctx.art, (this.fieldWait = new Set()));
    this.field.replaceChildren(...words.map((w) => chipWord(art, `slx-mech slx-mech-${w.tone}`, w.text, mechIconUrls(w))));
    this.field.hidden = words.length === 0;
  }

  /** Each living enemy's ailments by its name; none once the fight is over (won, lost or fled). The field bar with them. */
  private showAilments(): void {
    this.showField();
    const s = this.state;
    const live = s.outcome === 'ongoing' ? s.enemies.filter((e) => e.alive) : [];
    const chips = Object.fromEntries(live.map((e) => [e.key, ailmentChips(e)]));
    const words = Object.fromEntries(live.map((e) => [e.key, foeWords(s, e)]));
    // An elite's or a boss's affixes lead its row (difficulty plan Task 7b); a fight with none calls it as before.
    const tagged = live.filter((e) => e.affixes?.length);
    if (tagged.length) this.ctx.stage?.battleView.showAilments?.(chips, words, Object.fromEntries(tagged.map((e) => [e.key, e.affixes!.map((a) => AFFIXES[a].name)])));
    else this.ctx.stage?.battleView.showAilments?.(chips, words);
    this.showFoeMore();
  }

  /**
   * A tap target over each foe's 「+N」 (touch overflow): the picture draws the +N; this lays a bare button on it (centred,
   * in 2 px steps: classes, never an inline style) that lists the foe's whole row. First in the scene, so every window
   * covers it, and it lets every other tap through. An open list follows the redraw, and closes with the fold.
   */
  private showFoeMore(): void {
    const rows = this.ctx.stage?.battleView.foldedRows?.() ?? [];
    const step = (v: number) => Math.round(v / 2);
    const art = noteMissing(this.ctx.art, (this.foeWait = new Set()));
    const listOf = (r: (typeof rows)[number]) => r.words.map((w) => chipWord(art, w.cls, w.text, w.icons));
    const hits = rows.map((r) => {
      const id = `foe:${r.key}`;
      const cx = r.at.x + r.at.width / 2;
      // Far right, its list ends at the target's right edge (as the last two members' do), so it stays on the screen.
      const end = cx > FOE_LIST_END_X ? ' slx-foe-more-end' : '';
      const hit: HTMLElement = moreTrigger(r.more, () => this.more.toggle(id, hit, hit, listOf(r)),
        `slx-foe-more slx-at-x-${step(cx)} slx-at-y-${step(r.at.y + r.at.height / 2)}${end}`, false);
      hit.title = r.words.map((w) => w.text).join('、');
      return { id, hit, r };
    });
    this.foeMore.replaceChildren(...hits.map((h) => h.hit));
    const open = this.more.openId;
    if (!open?.startsWith('foe:')) return;
    const now = hits.find((h) => h.id === open);
    if (now) this.more.show(open, now.hit, now.hit, listOf(now.r)); else this.more.close();
  }

  /**
   * A foe's target note, a line each: its whole intent (the picture may shorten it to fit its slot), then its affixes
   * (Task 7b). None when it has neither, so the note stays away.
   */
  private targetNote(e: Combatant): string | undefined {
    const intent = intentLabel(this.state, e.key);
    const lines = [...(intent ? [T.ui2.battle.intentNote(intent)] : []), ...(e.affixes ?? []).map((a) => T.ui2.tier.affixLine(AFFIXES[a].name, AFFIXES[a].line)),
      // The roster's foe mechanics, a line each (roster plan B6); none for the old roster.
      ...foeNotes(this.state, e, (c) => foeDef(this.state, c))];
    return lines.length ? lines.join('\n') : undefined;
  }

  /** 返回 shows only when cancel would do something: close a sub-list or go back to the previous member. */
  private syncBack(): void {
    this.backEl.hidden = this.busy || !!this.result || (this.layers.length === 0 && this.index === 0);
  }

  private back(): void {
    if (this.index === 0) return;
    this.ctx.sfx.cancel();
    this.index -= 1;
    delete this.actions[this.actors()[this.index].key];
    this.renderCommands();
  }

  private command(id: string, actor: Combatant): void {
    if (id === 'attack') { this.withTarget('enemy', { kind: 'attack' }); return; }
    if (id === 'defend') { this.choose({ kind: 'defend' }); return; }
    if (id === 'escape') { this.choose({ kind: 'escape' }); return; }
    if (id === 'policy') {
      // Who has no command yet plays what the note said (autoActions); earlier members' choices stay.
      Object.assign(this.actions, autoActions(this.state, this.ctx.game.state.party, this.actors().filter((c) => !this.actions[c.key]).map((c) => c.key)));
      void this.submit();
      return;
    }
    if (id === 'auto') {
      const target = this.state.enemies.find((e) => e.alive)?.key ?? 'e0';
      for (const c of this.actors()) this.actions[c.key] ??= { kind: 'attack', target };   // keep earlier members' choices
      void this.submit();
      return;
    }
    if (id === 'ultimate') { this.withTarget(ultimateFor(actor.defId as CharacterId, actor.ranks, actor).target, { kind: 'ultimate' }); return; }
    if (id === 'echo') {
      const rec = echoOf(this.state, this.state.round + 1);
      if (rec) this.withTarget(echoDef(rec).target, { kind: 'echo', rec });
      return;
    }
    if (id === 'skill') {
      // Only known skills are listed (skillItems), so the lookup always finds one; the fallback is never reached.
      this.subList(this.skillItems(actor), (it) => this.withTarget(skillFor(actor, it.id)?.target ?? 'enemy', { kind: 'skill', skill: it.id }));
      return;
    }
    if (id === 'item') this.subList(this.itemItems(), (it) => this.withTarget(ITEMS[it.id].target, { kind: 'item', item: it.id }));
  }

  /**
   * The hero's 殘響 (plan 8c Task 6): the companion skill it would repeat in the coming round and its TP; 「殘響」 greyed when
   * there is none (or he is short of TP). Nobody else has the command.
   */
  private echoItem(actor: Combatant): MenuItem[] {
    if (actor.defId !== 'hero') return [];
    const rec = echoOf(this.state, this.state.round + 1);
    if (!rec) return [{ id: 'echo', label: T.cmd.echo(), disabled: true }];
    const def = echoDef(rec);
    // What it repeats in numbers, not the repeated skill's words (they may name a mechanic it leaves out; plan 8g ruling 12).
    return [{ id: 'echo', label: T.cmd.echo(def.name), right: T.cmd.tp(rec.cost), disabled: actor.tp < rec.cost, note: T.cmd.echoNote(ECHO.powerPct, battleLine(def)) + (rec.dropped ? T.cmd.echoDropped : '') }];
  }

  private skillItems(actor: Combatant): MenuItem[] {
    const m = this.ctx.game.state.party.roster[actor.key as CharacterId];
    return (m ? learnedSkills(m) : [])
      // As this member casts them: a worn power may change the target; tpCost and her mechanic set what each costs now.
      .flatMap((s) => skillFor(actor, s) ?? [])
      .filter((sk) => !sk.passive)
      .map((sk) => {
        const cost = castCost(this.state, actor, sk.id);
        // A skill that would spend an empty resource (no coins, no barrier) is greyed, its reason in place of the TP.
        const why = whyNot(this.state, actor, sk);
        // Each rune that works on it as its own 14px icon (plan 8g ruling 12; art step 9), and its final numbers before its words.
        const working = runeView(actor, sk.id, actor.runes?.[sk.id] ?? [])?.states.filter((x) => x.miss === null) ?? [];
        // Its 16px native icon before the name once loaded (art step 9); the name alone until then. Decorative (alt "").
        const icon = lateArt(this.ctx.art, art.skillIcon(sk.id, 16));
        return {
          id: sk.id, label: sk.name, right: why ?? T.cmd.tp(cost), disabled: !!why || actor.tp < cost, note: this.noteOf(sk, actor),
          icon, iconCls: 'slx-skill-menu-ico',
          ...(working.length ? { marks: working.map((x) => runeMark(x.ref, 14)) } : {}),
        };
      });
  }

  /**
   * A skill's note: its final numbers, then its words; when the summary gives the final power (damage, a heal, a device),
   * the words' power multiplier goes, so one line never shows two kinds of 威力 (plan 8g final review).
   */
  private noteOf(sk: SkillDef, actor: Combatant): string {
    // As she casts it this moment, as perform does (plan 8h ruling 11h): the depth's bonus, then her heat, coins or barrier;
    // and Safira's beat, which the engine adds on each hit (shownDef).
    const shown = shownDef(this.state, actor, sk);
    const final = shown.effects.some((e) => e.kind === 'damage' || e.kind === 'heal' || e.kind === 'device');
    return T.cmd.noteWith(battleLine(shown), final ? withoutPowerClause(sk.desc) : sk.desc);
  }

  private itemItems(): MenuItem[] {
    // Count what earlier members already plan to use this round, so the last potion is not promised twice.
    const planned = (id: string) => Object.values(this.actions).filter((a) => a.kind === 'item' && a.item === id).length;
    return Object.entries(this.state.inventory).map(([id, n]) => [id, n - planned(id)] as const).filter(([id, n]) => ITEMS[id]?.battle && n > 0)
      .map(([id, n]) => ({ id, label: ITEMS[id].name, right: `×${n}`, note: ITEMS[id].desc }));
  }

  private subList(items: MenuItem[], pick: (it: MenuItem) => void, cls = 'slx-bsub'): MenuView {
    const v = new MenuView(new Menu(items), {
      pick: (it) => { this.ctx.sfx.confirm(); pick(it); },
      moved: () => { this.ctx.sfx.cursor(); this.onSubMoved(v); },
      cancel: () => { this.ctx.sfx.cancel(); this.popLayer(); },
    }, 6);
    this.pushLayer({ el: win(cls, [v.el]), onAction: (a) => v.onAction(a) });
    this.onSubMoved(v);
    v.el.addEventListener('pointerover', () => this.onSubMoved(v));
    return v;
  }

  private onSubMoved(v: MenuView): void {
    const c = v.menu.current();
    this.showNote(c?.note);
    const e = c ? this.state.enemies.findIndex((x) => x.key === c.id) : -1;
    this.ctx.stage?.battleView.highlight?.(e >= 0 ? c!.id : null);
    // An ally target lights that member's panel; anything else keeps the acting member lit.
    const ally = c && this.state.party.some((x) => x.key === c.id) ? c.id : null;
    this.updateBar(ally ?? this.actors()[this.index]?.key ?? null);
    if (e < 0) { this.marker.setAttribute('hidden', ''); return; }
    // Height comes from the enemy's sprite (10 px step classes, no inline styles); without a stage the stylesheet default applies.
    const y = this.ctx.stage?.battleView.anchor(c!.id)?.y;
    const ty = y === undefined ? '' : ` slx-ty-${Math.max(4, Math.min(30, Math.round(y / 10)))}`;
    this.marker.className = `slx-target slx-target-${this.state.enemies.length}-${e}${ty}`;
    this.marker.removeAttribute('hidden');
  }

  private withTarget(target: Target | null, p: Pending): void {
    // Whom she may pick (roster plan B10, M28): from inside a foe, that foe and herself; no one picks a member inside a
    // foe but by an item. With no one inside, every living one as ever.
    const actor = this.actors()[this.index];
    if (target === 'enemy') {
      const living = actor ? choosable(this.state, actor, 'foe') : this.state.enemies.filter((e) => e.alive);
      if (living.length === 1) { this.finish(p, living[0].key); return; }
      this.subList(living.map((e) => { const note = this.targetNote(e); return { id: e.key, label: e.name, ...(note ? { note } : {}) }; }), (it) => this.finish(p, it.id), 'slx-bsub slx-btarget');
      return;
    }
    if (target === 'ally' || target === 'deadAlly') {
      const pool = target === 'ally' && actor ? choosable(this.state, actor, 'ally', p.kind === 'item') : this.state.party.filter((c) => (target === 'ally' ? c.alive : !c.alive));
      if (!pool.length) { this.ctx.sfx.error(); return; }
      this.subList(pool.map((c) => ({ id: c.key, label: c.name, right: `${c.hp}/${c.max.hp}` })), (it) => this.finish(p, it.id), 'slx-bsub slx-btarget');
      return;
    }
    this.finish(p);
  }

  private finish(p: Pending, target?: string): void {
    if (p.kind === 'attack') this.choose({ kind: 'attack', target: target ?? this.state.enemies.find((e) => e.alive)?.key ?? 'e0' });
    else if (p.kind === 'skill') this.choose({ kind: 'skill', skill: p.skill, target });
    else if (p.kind === 'item') this.choose({ kind: 'item', item: p.item, target });
    else if (p.kind === 'echo') this.choose(target ? { kind: 'echo', target, rec: p.rec } : { kind: 'echo', rec: p.rec });
    else this.choose(target ? { kind: 'ultimate', target } : { kind: 'ultimate' });
  }

  private choose(action: Action): void {
    this.clearLayers();
    const actor = this.actors()[this.index];
    this.actions[actor.key] = action;
    this.index += 1;
    if (this.index >= this.actors().length) void this.submit();
    else this.renderCommands();
  }

  private pushLayer(l: Layer): void {
    this.layers.push(l);
    this.body.append(l.el);
    this.cmd.setAttribute('inert', '');
    this.layers.forEach((x, i) => (i < this.layers.length - 1 ? x.el.setAttribute('inert', '') : x.el.removeAttribute('inert')));
    this.syncBack();
  }

  private popLayer(): void {
    this.layers.pop()?.el.remove();
    this.ctx.stage?.battleView.highlight?.(null);
    this.marker.setAttribute('hidden', '');
    this.showNote(undefined);
    this.updateBar(this.actors()[this.index]?.key ?? null);
    const top = this.layers[this.layers.length - 1];
    if (top) top.el.removeAttribute('inert'); else this.cmd.removeAttribute('inert');
    this.syncBack();
  }

  private clearLayers(): void {
    while (this.layers.length) this.layers.pop()!.el.remove();
    this.ctx.stage?.battleView.highlight?.(null);
    this.marker.setAttribute('hidden', '');
    this.showNote(undefined);
    this.cmd.removeAttribute('inert');
    this.syncBack();
  }

  /** One-line description of the skill or item under the cursor, under the sub-list. */
  private showNote(text: string | undefined): void {
    if (!text) { this.note?.remove(); this.note = null; return; }
    if (!this.note) { this.note = win('slx-bnote'); this.body.append(this.note); }
    this.note.textContent = text;
    // 自動's note: one member a line (plan 8h Task 8 review).
    this.note.classList.toggle('slx-bnote-lines', text.includes('\n'));
  }

  private sfxAdapter(): SoundManager {
    const s = this.ctx.sfx;
    // Bind each cue to its owner: SoundManager methods use `this`.
    const call = (k: 'hit' | 'weak' | 'heal' | 'ko' | 'ultimate') => () => { s[k]?.call(s); };
    return { hit: call('hit'), weak: call('weak'), heal: call('heal'), ko: call('ko'), ultimate: call('ultimate'), element: (fx: string) => { s.element?.call(s, fx); } } as unknown as SoundManager;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.syncBack();
    this.root.setAttribute('inert', '');
    this.cmd.replaceChildren();
    this.cmd.hidden = true;
    this.ctx.stage?.battleView.showIntents?.({});
    this.view = null;
    this.before = new Map(this.state.party.map((c) => [c.key, { hp: c.hp, tp: c.tp, limit: c.limit, alive: c.alive, ailments: ailmentChips(c), mech: memberWords(this.state, c) }]));
    this.revealed.clear();
    this.updateBar(null);
    const r = this.ctx.game.submitRound(this.actions);
    if (!r) { this.busy = false; this.before = null; this.cmd.hidden = false; this.root.removeAttribute('inert'); this.renderCommands(); return; }
    this.state = r.battle;
    const names = new Map([...r.battle.party, ...r.battle.enemies].map((c) => [c.key, c.name]));
    const remnants = new Set(r.battle.enemies.filter((e) => foeDef(r.battle, e)?.remnant).map((e) => e.key));
    const lines = battleLines(r.battle.log, (k) => names.get(k) ?? k, (k) => remnants.has(k));
    try {
      // With a stage, each line is shown by the playback itself at the moment its event is drawn.
      if (this.ctx.stage) await this.ctx.stage.battleView.play(r.battle, this.sfxAdapter(), (key, cue, name, amount, extra) => this.onParty(key, cue, name, amount, extra), (i) => this.showLine(lines, r.battle.log, i));
      else await this.playLines(lines);
    } catch (err) {
      // A broken animation must never strand the player: log it and carry on with the round's result.
      console.error('[starlantern] battle playback failed', err);
    }
    this.before = null;
    this.updateBar(null);
    this.ctx.stage?.battleView.syncHp?.(r.battle);
    this.showAilments();
    this.busy = false;
    this.cmd.hidden = !!r.end;
    this.root.removeAttribute('inert');
    if (r.end) this.showResult(r.end);
    else this.startRound();
  }

  /** The whole screen jolts when the party is hit; a heavy hit also reddens its edges. */
  private impact(heavy: boolean, fx: FxKey | null = null): void {
    if (fx === 'fire' || fx === 'ice' || fx === 'thunder') {
      const f = el('div', { class: `slx-eflash slx-eflash-${fx}`, attrs: { 'aria-hidden': 'true' } });
      this.body.append(f);
      setTimeout(() => f.remove(), 320);
    }
    const screen = this.root.closest<HTMLElement>('.slx-screen') ?? this.root;
    screen.classList.remove('slx-shake-s', 'slx-shake-l');
    void screen.offsetWidth;
    screen.classList.add(heavy ? 'slx-shake-l' : 'slx-shake-s');
    // A newer shake owns the clean-up: an older timer must not cut it short.
    if (this.shakeTimer) clearTimeout(this.shakeTimer);
    this.shakeTimer = setTimeout(() => { this.shakeTimer = null; screen.classList.remove('slx-shake-s', 'slx-shake-l'); }, 450);
    if (!heavy) return;
    const v = el('div', { class: 'slx-vignette', attrs: { 'aria-hidden': 'true' } });
    this.body.append(v);
    setTimeout(() => v.remove(), 600);
  }

  /**
   * P5R-style flourish when a party member acts: an eye strip for a plain attack, a slanted bust with the move's name for
   * anything else, entering from a different edge each time. Defending stays quiet; ultimates have their own full cut-in.
   */
  private actionCutIn(actorKey: string, label: string, ultimate: boolean): void {
    const actor = this.state.party.find((c) => c.key === actorKey);
    if (!actor || ultimate || label === T.cmd.defend) return;
    const id = actor.defId;
    const eyes = label === T.cmd.attack;
    const pos = eyes ? (this.cutins % 2 ? 'bottom' : 'top') : (this.cutins % 2 ? 'right' : 'left');
    this.cutins++;
    // The attack face carries the expression; both the strip and the bust use it.
    const face = actor.artId ?? id;
    const pic = this.ctx.art.has(art.portrait(face, 'attack')) ? art.portrait(face, 'attack') : art.portrait(face, 'normal');
    const c = el('div', { class: `slx-acut slx-acut-${eyes ? 'eyes' : 'bust'} slx-acut-${pos} slx-aura-${id}`, attrs: { 'aria-hidden': 'true' } }, [
      el('div', { class: 'slx-acut-band' }),
      el('div', { class: 'slx-acut-pic' }, this.ctx.art.has(pic) ? [el('img', { attrs: { src: pic, alt: '' } })] : []),
      ...(eyes ? [] : [el('span', { class: 'slx-acut-label', text: label })]),
    ]);
    this.body.append(c);
    this.ctx.sfx.cutin?.();
    // Gone before the hit lands (the action line holds 420 ms), so it never covers the impact.
    setTimeout(() => c.remove(), this.ctx.fast ? 0 : 460);
  }

  /** Message window: the action on top, what it did underneath. */
  private showLine(lines: string[], log: BattleState['log'], i: number): void {
    const ev = log[i];
    if (ev?.type === 'act') { this.actLine = lines[i]; this.msg.textContent = lines[i]; this.actionCutIn(ev.actor, ev.label, !!ev.ultimate); return; }
    this.msg.textContent = this.actLine ? `${this.actLine}\n${lines[i]}` : lines[i];
  }

  private async playLines(all: string[]): Promise<void> {
    const lines = all.filter(Boolean);   // TP regen has no line
    if (this.ctx.fast) { this.msg.textContent = lines.slice(-2).join('\n'); return; }
    for (const line of lines) {
      this.msg.textContent = line;
      await new Promise((res) => setTimeout(res, 420));
    }
  }

  private async onParty(key: string, cue: PartyCue, name?: string, amount?: number, extra?: HitExtra): Promise<void> {
    if (cue === 'ultimate') {
      this.ctx.sfx.ultimate?.();
      const face = this.state.party.find((c) => c.key === key)?.artId ?? key;
      const ult = art.portrait(face, 'ultimate');
      const portrait = this.ctx.art.has(ult) ? ult : this.ctx.art.has(art.portrait(face, 'normal')) ? art.portrait(face, 'normal') : null;
      await playCutIn(this.cutin, { name: name ?? '', portrait, fast: !!this.ctx.fast });
      return;
    }
    if (cue === 'mech') { this.bar.cue(key, cueWord(name as MechCue)); return; }
    const shown = this.before?.get(key);
    if (cue === 'tp' && shown && amount) {
      const max = this.state.party.find((c) => c.key === key)?.max.tp ?? shown.tp + amount;
      shown.tp = Math.min(max, shown.tp + amount);
      this.updateBar(null);
    }
    if (cue === 'hit' || cue === 'heal') {
      // Take each hit off (or add each heal to) the pre-round value as it plays; without an amount, show the round's result.
      const max = this.state.party.find((c) => c.key === key)?.max.hp ?? 0;
      if (shown && amount !== undefined) {
        shown.hp = cue === 'hit' ? Math.max(0, shown.hp - amount) : Math.min(max, shown.hp + amount);
        shown.alive = shown.hp > 0;
      } else this.revealed.add(key);
      this.updateBar(null);
    }
    let opts: PulseOpts = {};
    if (cue === 'hit') {
      const max = this.state.party.find((c) => c.key === key)?.max.hp ?? 1;
      const heavy = !!extra?.weak || !!extra?.crit || (amount ?? 0) >= max / 4;
      this.impact(heavy, extra?.fx ?? null);
      if (heavy) this.ctx.vibrate?.(60);
      const fxKey = extra?.fx ?? null;
      const still = fxKey ? art.fx(fxKey) : null;
      opts = {
        heavy, weak: extra?.weak, crit: extra?.crit, resist: extra?.resist,
        fxAnim: fxKey && this.ctx.art.has(art.fxAnim(fxKey)) ? fxKey : undefined,
        fx: still && this.ctx.art.has(still) ? still : undefined,
      };
    }
    this.bar.pulse(key, cue === 'acting' ? 'attack' : cue, amount, opts);
  }

  /** A slanted banner across the middle of the screen; it plays over the battle and leaves on its own. */
  private banner(text: string, cls = '', ms = BANNER_MS): void {
    const b = el('div', { class: `slx-banner ${cls}`.trim(), attrs: { role: 'status' } }, [el('span', { class: 'slx-banner-text', text })]);
    this.body.append(b);
    setTimeout(() => b.remove(), this.ctx.fast ? 0 : ms);
  }

  /** A win shows 勝利！ first, then the rewards. */
  private showResult(end: BattleEnd): void {
    if (end.outcome !== 'win' || this.ctx.fast) { this.renderResult(end); return; }
    this.ctx.sfx.win?.();
    this.banner(T.ui2.banner.win, 'slx-banner-win', WIN_MS);
    setTimeout(() => this.renderResult(end, false), WIN_MS);
  }

  /** The rune tutorial, told by the narrator with the result window out of the way; once read, its flag is set. */
  private async runeTutorial(): Promise<void> {
    const box = this.body.querySelector<HTMLElement>('.slx-result');
    if (box) box.hidden = true;
    this.msg.hidden = true;
    this.talk.setStyle('plain');
    this.tutoring = true;
    // A tutorial that fails is reported and over: it must never lock the way out.
    try {
      for (const line of T.rune.tutorial(RUNE_SLOT_LEVELS, T.ui2.guild.workshop, T.ui2.dungeon.workshop)) await this.talk.say('', line);
      this.ctx.game.seeRuneTutorial();
    } catch (e) {
      console.error('starlantern: rune tutorial failed', e);
    } finally {
      this.tutoring = false;
    }
  }

  private leave(): void {
    this.ctx.go(this.ctx.game.phase === 'clear' ? 'clear' : 'dungeon');
  }

  private renderResult(end: BattleEnd, fanfare = true): void {
    // `cls` styles the whole line: a level-up, or a piece of gear in its rarity colour.
    const lines: { text: string | Rich; cls?: string }[] = [];
    if (end.outcome === 'win') {
      if (fanfare) this.ctx.sfx.win?.();
      // A fragment that did not fit is told once, by its 留下 line below, not also as found.
      const unplaced = { ...end.left };
      const found = (end.fragments ?? []).filter((g) => {
        const id = fragmentItem(g);
        if (id === undefined || !(unplaced[id] > 0)) return true;
        unplaced[id]--;
        return false;
      });
      for (const l of fragmentLines(found)) lines.push({ text: l });
      lines.push({ text: T.battle.exp(end.exp) }, { text: T.battle.gold(end.gold) });
      if (end.coinGold) lines.push({ text: T.battle.coinGold(end.coinGold) });
      if (end.returned) lines.push({ text: T.battle.returned(end.returned) });
      // Won gear reads after its gear icon once that is published and loaded (the line keeps its rarity colour either way).
      for (const it of end.gear) lines.push({ text: [{ text: gearLabel(it), cls: 'slx-loot-name', icon: gearIconLate(this.ctx.art, it) }], cls: `slx-loot-gear ${rarityClass(it)}` });
      // Runes after the gear, each once and in the order they dropped, in its tier's colour (plan 8f); one past the stack
      // says the gold it became, where it fell.
      const kept = [...(end.runes ?? [])];
      const paid = end.runeGold ?? [];
      const total = kept.length + paid.length;
      for (let at = 0; at < total; at++) {
        const g = paid.find((x) => x.at === at);
        const r = g ? g.rune : kept.shift();
        if (!r) continue;
        const label = T.rune.label(r.id, r.tier);
        lines.push({ text: g ? T.rune.overStack(label, RUNE_STACK, g.gold) : T.rune.got(label), cls: `slx-loot-rune ${rarityClass({ rarity: r.tier })}` });
      }
      for (const [id, n] of Object.entries(end.drops)) lines.push({ text: T.battle.drop(itemName(id), n) });
      for (const [id, n] of Object.entries(end.left)) lines.push({ text: T.battle.leftBehind(itemName(id), n) });
      for (const it of end.gearLeft) lines.push({ text: fillRich(T.battle.gearLeft, [gearPart(it, gearIconLate(this.ctx.art, it))]), cls: 'slx-loot-left' });
      lines.push(...levelUpLines(end.levelUps, this.ctx.game.state.party));
    } else if (end.outcome === 'lose') this.ctx.sfx.lose?.();
    const title = end.outcome === 'win' ? T.battle.win : end.outcome === 'lose' ? T.battle.lose : T.battle.fled;
    this.result = new MenuView(new Menu([{ id: 'ok', label: T.battle.cont }]), {
      pick: () => {
        if (!this.resultReady || this.picked) return;   // clicks too, not just keys; and only once
        this.picked = true;
        this.ctx.sfx.confirm();
        if (end.outcome === 'lose') { this.ctx.go('town'); return; }
        // The battle that first gave a rune tells the rune tutorial once (plan 8g ruling 13). A memory piece found here is
        // only a line in the list: it is told at night in town (story L spec §4.2).
        const tutorial = !!end.runes?.length && !this.ctx.game.state.runeTutorialSeen;
        if (!end.met && !tutorial) { this.leave(); return; }
        // Who was rescued speaks first, in the dialogue box, and joins after her last line; then the rune tutorial (Task 1).
        if (end.met) { this.body.querySelector<HTMLElement>('.slx-result')!.hidden = true; this.msg.hidden = true; this.rescue = playRescue(this.talk, end.met, storyCtx(this.ctx)); }
        const met = (this.rescue?.done ?? Promise.resolve()).catch((e) => console.error('starlantern: rescue failed', e)).finally(() => { this.rescue = null; });
        void met.then(() => (tutorial ? this.runeTutorial() : undefined)).then(() => this.leave());
      },
    });
    // A held or repeated key must not skip the rewards: accept input after a short beat.
    this.resultReady = !!this.ctx.fast;
    if (!this.resultReady) setTimeout(() => { this.resultReady = true; }, 300);
    const box = win('slx-result', [el('h3', { text: title }), el('div', { class: 'slx-result-lines' }, lines.map((l) => { const p = el('p', { class: l.cls }, typeof l.text === 'string' ? [l.text] : []); if (typeof l.text !== 'string') richInto(p, l.text); return p; })), this.result.el]);
    this.body.append(box);
    // The gear won (not the gear left behind) raises one pillar, for its best piece. It stands on the result window, where
    // the loot is listed: the defeated enemies are gone by now, and their place is under this window.
    if (end.outcome === 'win') dropMoment(this.ctx, box, end.gear);
  }
}
