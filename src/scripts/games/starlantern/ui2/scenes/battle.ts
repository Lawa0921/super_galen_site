import type { SoundManager } from '../../audio/SoundManager';
import type { PartyCue } from '../../render/BattleView';
import { CHARACTERS } from '../../data/characters';
import { ITEMS } from '../../data/items';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { LIMIT_MAX, type Action, type BattleState } from '../../engine/battle';
import type { Combatant } from '../../engine/combatant';
import type { BattleEnd } from '../../engine/game';
import { learnedSkills } from '../../engine/party';
import type { CharacterId, Target } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el, itemName } from '../../ui/dom';
import { playCutIn } from '../../ui/cutin';
import { battleLines } from '../battleText';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import { PartyBar } from '../partyBar';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, backControl, win } from '../widgets';

/** Width kept clear for the command window; must match $slx-battle-left in _starlantern-ui.scss. */
export const BATTLE_LEFT = 150;
/** Height kept clear for the party bar; must match the .slx-partybar box in _starlantern-ui.scss. */
export const BATTLE_BOTTOM = 66;

interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }
type Pending = { kind: 'attack' } | { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'ultimate' };

/** Battle: message line on top, party bar below, a command window per member, target picking, playback and results. */
export class BattleScene implements Scene {
  private root!: HTMLElement;
  private body!: HTMLElement;
  private msg!: HTMLElement;
  private cmd!: HTMLElement;
  private marker!: HTMLElement;
  private cutin!: HTMLElement;
  private backEl!: HTMLElement;
  private note: HTMLElement | null = null;
  private bar: PartyBar;
  private layers: Layer[] = [];
  private view: MenuView | null = null;
  private state!: BattleState;
  private index = 0;
  private actions: Record<string, Action> = {};
  private busy = false;
  private result: MenuView | null = null;
  private resultReady = false;
  /** Party values from before the round, shown until each member's own hit plays. */
  private before: Map<string, Pick<Combatant, 'hp' | 'tp' | 'limit' | 'alive'>> | null = null;
  private revealed = new Set<string>();
  private actLine = '';

  constructor(private ctx: SceneCtx) {
    this.bar = new PartyBar(ctx.art);
  }

  enter(root: HTMLElement): void {
    this.root = root;
    this.state = this.ctx.game.battle!;
    this.msg = win('slx-msg');
    this.cmd = win('slx-bcmd');
    this.marker = el('div', { class: 'slx-target', text: '▼', attrs: { hidden: '', 'aria-hidden': 'true' } });
    this.cutin = el('div', { class: 'sl-cutin', attrs: { hidden: '', 'aria-hidden': 'true' } });
    this.backEl = backControl(() => this.onAction('cancel'));
    this.body = el('div', { class: 'slx-scene slx-battle' }, [this.msg, this.marker, this.bar.el, this.cmd, this.backEl, this.cutin]);
    root.append(this.body);
    if (this.ctx.stage) {
      this.ctx.stage.show('battle');
      this.ctx.stage.battleView.setup(this.state, this.ctx.stage.size(), this.ctx.game.floor, BATTLE_LEFT, BATTLE_BOTTOM);
    }
    this.msg.textContent = this.state.enemies.map((e) => e.name).join('、');
    this.startRound();
  }

  exit(): void {
    this.ctx.stage?.show(null);
  }

  onAction(a: UiAction): void {
    if (this.busy) return;
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

  private actors(): Combatant[] {
    return this.state.party.filter((c) => c.alive && c.sleep === 0);
  }

  private updateBar(active: string | null): void {
    this.bar.update(this.state.party.map((c) => {
      const v = (!this.revealed.has(c.key) && this.before?.get(c.key)) || c;
      return { key: c.key, name: c.name, hp: v.hp, maxHp: c.max.hp, tp: v.tp, maxTp: c.max.tp, limit: v.limit, alive: v.alive, row: c.row };
    }), active);
  }

  private startRound(): void {
    this.index = 0;
    this.actions = {};
    this.renderCommands();
  }

  private renderCommands(): void {
    const actor = this.actors()[this.index];
    if (!actor) { void this.submit(); return; }
    this.updateBar(actor.key);
    const ult = ULTIMATES[actor.defId as CharacterId];
    const skills = this.skillItems(actor);
    const items = this.itemItems();
    const list: MenuItem[] = [
      { id: 'attack', label: T.cmd.attack },
      { id: 'skill', label: T.cmd.skill, disabled: !skills.some((s) => !s.disabled) },
      { id: 'defend', label: T.cmd.defend },
      { id: 'item', label: T.cmd.item, disabled: items.length === 0 },
      ...(actor.limit >= LIMIT_MAX && ult ? [{ id: 'ultimate', label: T.cmd.ultimate(ult.name) }] : []),
      { id: 'escape', label: T.cmd.escape, disabled: this.state.boss },
      { id: 'auto', label: T.cmd.auto },
    ];
    this.view = new MenuView(new Menu(list), {
      pick: (it) => { this.ctx.sfx.confirm(); this.command(it.id, actor); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.back(),
    });
    this.cmd.replaceChildren(el('div', { class: 'slx-who', text: T.cmd.choose(actor.name) }), this.view.el);
    this.syncBack();
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
    if (id === 'auto') {
      const target = this.state.enemies.find((e) => e.alive)?.key ?? 'e0';
      for (const c of this.actors()) this.actions[c.key] ??= { kind: 'attack', target };   // keep earlier members' choices
      void this.submit();
      return;
    }
    if (id === 'ultimate') { this.withTarget(ULTIMATES[actor.defId as CharacterId].target, { kind: 'ultimate' }); return; }
    if (id === 'skill') { this.subList(this.skillItems(actor), (it) => this.withTarget(SKILLS[it.id].target, { kind: 'skill', skill: it.id })); return; }
    if (id === 'item') this.subList(this.itemItems(), (it) => this.withTarget(ITEMS[it.id].target, { kind: 'item', item: it.id }));
  }

  private skillItems(actor: Combatant): MenuItem[] {
    return learnedSkills(actor.key as CharacterId, this.ctx.game.state.party.roster[actor.key as CharacterId]?.level ?? 1)
      .filter((s) => !SKILLS[s].passive)
      .map((s) => ({ id: s, label: SKILLS[s].name, right: T.cmd.tp(SKILLS[s].tp), disabled: actor.tp < SKILLS[s].tp, note: SKILLS[s].desc }));
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
    if (target === 'enemy') {
      const living = this.state.enemies.filter((e) => e.alive);
      if (living.length === 1) { this.finish(p, living[0].key); return; }
      this.subList(living.map((e) => ({ id: e.key, label: e.name })), (it) => this.finish(p, it.id), 'slx-bsub slx-btarget');
      return;
    }
    if (target === 'ally' || target === 'deadAlly') {
      const pool = this.state.party.filter((c) => (target === 'ally' ? c.alive : !c.alive));
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
    this.marker.setAttribute('hidden', '');
    this.showNote(undefined);
    this.updateBar(this.actors()[this.index]?.key ?? null);
    const top = this.layers[this.layers.length - 1];
    if (top) top.el.removeAttribute('inert'); else this.cmd.removeAttribute('inert');
    this.syncBack();
  }

  private clearLayers(): void {
    while (this.layers.length) this.layers.pop()!.el.remove();
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
  }

  private sfxAdapter(): SoundManager {
    const s = this.ctx.sfx;
    // Bind each cue to its owner: SoundManager methods use `this`.
    const call = (k: 'hit' | 'weak' | 'heal' | 'ko' | 'ultimate') => () => { s[k]?.call(s); };
    return { hit: call('hit'), weak: call('weak'), heal: call('heal'), ko: call('ko'), ultimate: call('ultimate') } as unknown as SoundManager;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.syncBack();
    this.root.setAttribute('inert', '');
    this.cmd.replaceChildren();
    this.cmd.hidden = true;
    this.view = null;
    this.before = new Map(this.state.party.map((c) => [c.key, { hp: c.hp, tp: c.tp, limit: c.limit, alive: c.alive }]));
    this.revealed.clear();
    this.updateBar(null);
    const r = this.ctx.game.submitRound(this.actions);
    if (!r) { this.busy = false; this.before = null; this.cmd.hidden = false; this.root.removeAttribute('inert'); this.renderCommands(); return; }
    this.state = r.battle;
    const names = new Map([...r.battle.party, ...r.battle.enemies].map((c) => [c.key, c.name]));
    const lines = battleLines(r.battle.log, (k) => names.get(k) ?? k);
    try {
      // With a stage, each line is shown by the playback itself at the moment its event is drawn.
      if (this.ctx.stage) await this.ctx.stage.battleView.play(r.battle, this.sfxAdapter(), (key, cue, name, amount) => this.onParty(key, cue, name, amount), (i) => this.showLine(lines, r.battle.log, i));
      else await this.playLines(lines);
    } catch (err) {
      // A broken animation must never strand the player: log it and carry on with the round's result.
      console.error('[starlantern] battle playback failed', err);
    }
    this.before = null;
    this.updateBar(null);
    this.busy = false;
    this.cmd.hidden = !!r.end;
    this.root.removeAttribute('inert');
    if (r.end) this.showResult(r.end);
    else this.startRound();
  }

  /** Message window: the action on top, what it did underneath. */
  private showLine(lines: string[], log: BattleState['log'], i: number): void {
    if (log[i]?.type === 'act') { this.actLine = lines[i]; this.msg.textContent = lines[i]; return; }
    this.msg.textContent = this.actLine ? `${this.actLine}\n${lines[i]}` : lines[i];
  }

  private async playLines(lines: string[]): Promise<void> {
    if (this.ctx.fast) { this.msg.textContent = lines.slice(-2).join('\n'); return; }
    for (const line of lines) {
      this.msg.textContent = line;
      await new Promise((res) => setTimeout(res, 420));
    }
  }

  private async onParty(key: string, cue: PartyCue, name?: string, amount?: number): Promise<void> {
    if (cue === 'ultimate') {
      this.ctx.sfx.ultimate?.();
      const ult = art.portrait(key, 'ultimate');
      const portrait = this.ctx.art.has(ult) ? ult : this.ctx.art.has(art.portrait(key, 'normal')) ? art.portrait(key, 'normal') : null;
      await playCutIn(this.cutin, { name: name ?? '', portrait, fast: !!this.ctx.fast });
      return;
    }
    const shown = this.before?.get(key);
    if (cue === 'hit' || cue === 'heal') {
      // Take each hit off (or add each heal to) the pre-round value as it plays; without an amount, show the round's result.
      const max = this.state.party.find((c) => c.key === key)?.max.hp ?? 0;
      if (shown && amount !== undefined) {
        shown.hp = cue === 'hit' ? Math.max(0, shown.hp - amount) : Math.min(max, shown.hp + amount);
        shown.alive = shown.hp > 0;
      } else this.revealed.add(key);
      this.updateBar(null);
    }
    this.bar.pulse(key, cue === 'acting' ? 'attack' : cue, amount);
  }

  private showResult(end: BattleEnd): void {
    const lines: string[] = [];
    if (end.outcome === 'win') {
      this.ctx.sfx.win?.();
      lines.push(T.battle.exp(end.exp), T.battle.gold(end.gold));
      for (const [id, n] of Object.entries(end.drops)) lines.push(T.battle.drop(itemName(id), n));
      for (const u of end.levelUps) {
        const who = CHARACTERS[u.id].name;
        lines.push(T.battle.levelUp(who, this.ctx.game.state.party.roster[u.id].level));
        for (const s of u.learned) lines.push(T.battle.learned(who, SKILLS[s].name));
      }
    } else if (end.outcome === 'lose') this.ctx.sfx.lose?.();
    const title = end.outcome === 'win' ? T.battle.win : end.outcome === 'lose' ? T.battle.lose : T.battle.fled;
    this.result = new MenuView(new Menu([{ id: 'ok', label: T.battle.cont }]), {
      pick: () => {
        if (!this.resultReady) return;   // clicks too, not just keys
        this.ctx.sfx.confirm();
        if (end.outcome === 'lose') this.ctx.go('town');
        else if (this.ctx.game.phase === 'clear') this.ctx.go('clear');
        else this.ctx.go('dungeon');
      },
    });
    // A held or repeated key must not skip the rewards: accept input after a short beat.
    this.resultReady = !!this.ctx.fast;
    if (!this.resultReady) setTimeout(() => { this.resultReady = true; }, 300);
    this.body.append(win('slx-result', [el('h3', { text: title }), el('div', { class: 'slx-result-lines' }, lines.map((l) => el('p', { text: l }))), this.result.el]));
  }
}
