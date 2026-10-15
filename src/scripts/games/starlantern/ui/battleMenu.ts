import { CHARACTERS } from '../data/characters';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { Action, BattleState } from '../engine/battle';
import type { BattleEvent, Combatant } from '../engine/combatant';
import type { BattleEnd, Game } from '../engine/game';
import { learnedSkills } from '../engine/party';
import type { CharacterId, Target } from '../engine/types';
import { button, el, itemName, meter } from './dom';

type Pending = { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'attack' };
type Mode = { view: 'root' } | { view: 'skills' } | { view: 'items' } | { view: 'target'; pick: 'enemy' | 'ally' | 'deadAlly'; pending: Pending };

export class BattleMenu {
  private state: BattleState | null = null;
  private actions: Record<string, Action> = {};
  private index = 0;
  private mode: Mode = { view: 'root' };

  constructor(private root: HTMLElement, private game: Game, private onSubmit: (a: Record<string, Action>) => void) {}

  show(state: BattleState): void {
    this.state = state;
    this.actions = {};
    this.index = 0;
    this.mode = { view: 'root' };
    this.render();
  }

  showLog(state: BattleState): void {
    this.state = state;
    this.root.replaceChildren(this.enemyList(), this.partyBar(null), this.log(state.log));
  }

  showResult(end: BattleEnd, state: BattleState, onContinue: () => void): void {
    this.state = state;
    const lines: string[] = [];
    if (end.outcome === 'win') {
      lines.push(T.battle.exp(end.exp), T.battle.gold(end.gold));
      for (const [id, n] of Object.entries(end.drops)) lines.push(T.battle.drop(itemName(id), n));
      for (const u of end.levelUps) {
        const name = CHARACTERS[u.id].name;
        lines.push(T.battle.levelUp(name, this.game.state.party.roster[u.id].level));
        for (const s of u.learned) lines.push(T.battle.learned(name, SKILLS[s].name));
      }
    }
    const title = end.outcome === 'win' ? T.battle.win : end.outcome === 'lose' ? T.battle.lose : T.battle.fled;
    this.root.replaceChildren(
      this.log(state.log),
      el('div', { id: 'sl-result', class: 'sl-panel' }, [el('h3', { text: title }), ...lines.map((l) => el('p', { text: l }))]),
      button(T.battle.cont, onContinue, { id: 'sl-continue' }),
    );
  }

  private actors(): Combatant[] {
    return this.state!.party.filter((c) => c.alive && c.sleep === 0);
  }

  private choose(action: Action): void {
    const actor = this.actors()[this.index];
    this.actions[actor.key] = action;
    this.mode = { view: 'root' };
    this.index += 1;
    if (this.index >= this.actors().length) this.onSubmit(this.actions);
    else this.render();
  }

  private finish(p: Pending, target?: string): void {
    if (p.kind === 'attack') this.choose({ kind: 'attack', target: target ?? this.firstEnemy() });
    else if (p.kind === 'skill') this.choose({ kind: 'skill', skill: p.skill, target });
    else this.choose({ kind: 'item', item: p.item, target });
  }

  private firstEnemy(): string {
    return this.state!.enemies.find((e) => e.alive)?.key ?? 'e0';
  }

  private withTarget(target: Target | null, p: Pending): void {
    const living = this.state!.enemies.filter((e) => e.alive);
    if (target === 'enemy') {
      if (living.length === 1) this.finish(p, living[0].key);
      else { this.mode = { view: 'target', pick: 'enemy', pending: p }; this.render(); }
    } else if (target === 'ally' || target === 'deadAlly') {
      this.mode = { view: 'target', pick: target, pending: p };
      this.render();
    } else {
      this.finish(p);
    }
  }

  private render(): void {
    const actor = this.actors()[this.index];
    if (!actor) { this.onSubmit(this.actions); return; }
    this.root.replaceChildren(this.enemyList(), this.partyBar(actor.key), this.panel(actor));
  }

  private panel(actor: Combatant): HTMLElement {
    const back = button(T.cmd.back, () => {
      if (this.mode.view !== 'root') this.mode = { view: 'root' };
      else if (this.index > 0) this.index -= 1;
      this.render();
    }, { id: 'sl-cmd-back', disabled: this.mode.view === 'root' && this.index === 0 });
    const head = el('h3', { text: T.cmd.choose(actor.name) });
    if (this.mode.view === 'skills') {
      const m = this.game.state.party.roster[actor.key as CharacterId];
      const list = learnedSkills(m.id, m.level).filter((s) => !SKILLS[s].passive).map((s) => {
        const def = SKILLS[s];
        const b = button(`${def.name}（${T.cmd.tp(def.tp)}）`, () => this.withTarget(def.target, { kind: 'skill', skill: s }), { disabled: actor.tp < def.tp });
        b.dataset.skill = s;
        b.title = def.desc;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [...list, back])]);
    }
    if (this.mode.view === 'items') {
      const list = Object.entries(this.state!.inventory).filter(([id, n]) => ITEMS[id]?.battle && n > 0).map(([id, n]) => {
        const b = button(`${ITEMS[id].name} ×${n}`, () => this.withTarget(ITEMS[id].target, { kind: 'item', item: id }));
        b.dataset.item = id;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [...list, back])]);
    }
    if (this.mode.view === 'target') {
      const { pick, pending } = this.mode;
      const pool = pick === 'enemy' ? this.state!.enemies.filter((e) => e.alive)
        : pick === 'ally' ? this.state!.party.filter((c) => c.alive) : this.state!.party.filter((c) => !c.alive);
      const list = pool.map((c) => {
        const b = button(c.name, () => this.finish(pending, c.key));
        b.dataset.target = c.key;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [el('h3', { text: T.cmd.target }), el('div', { class: 'sl-row' }, [...list, back])]);
    }
    const hasItems = Object.entries(this.state!.inventory).some(([id, n]) => ITEMS[id]?.battle && n > 0);
    return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [
      button(T.cmd.attack, () => this.withTarget('enemy', { kind: 'attack' }), { id: 'sl-cmd-attack' }),
      button(T.cmd.skill, () => { this.mode = { view: 'skills' }; this.render(); }, { id: 'sl-cmd-skill' }),
      button(T.cmd.defend, () => this.choose({ kind: 'defend' }), { id: 'sl-cmd-defend' }),
      button(T.cmd.item, () => { this.mode = { view: 'items' }; this.render(); }, { id: 'sl-cmd-item', disabled: !hasItems }),
      button(T.cmd.escape, () => this.choose({ kind: 'escape' }), { id: 'sl-cmd-escape', disabled: this.state!.boss }),
      back,
      button(T.cmd.auto, () => {
        const target = this.firstEnemy();
        for (const c of this.actors()) this.actions[c.key] = { kind: 'attack', target };
        this.onSubmit(this.actions);
      }, { id: 'sl-auto' }),
    ])]);
  }

  private enemyList(): HTMLElement {
    const s = this.state!;
    return el('div', { class: 'sl-row' }, s.enemies.map((e) => {
      const known = (s.revealed[e.defId] ?? []).filter((x) => e.weak.includes(x)).map((x) => T.element[x]).join('、');
      return el('span', { class: e.alive ? 'sl-member' : 'sl-member sl-member--down' }, [
        `${e.name}${known ? `　${T.battle.weak(known)}` : ''}`,
      ]);
    }));
  }

  private partyBar(activeKey: string | null): HTMLElement {
    return el('div', { class: 'sl-party' }, this.state!.party.map((c) => {
      const cls = ['sl-member', c.key === activeKey ? 'sl-member--active' : '', c.alive ? '' : 'sl-member--down'].filter(Boolean).join(' ');
      const tags = [c.poison ? T.battle.poison : '', c.sleep > 0 ? T.battle.sleep : ''].filter(Boolean).join(' ');
      return el('div', { class: cls, attrs: { 'data-key': c.key } }, [
        el('div', { text: `${c.name}${tags ? ` ${tags}` : ''}` }),
        `HP ${c.hp}/${c.max.hp}`, meter(c.hp, c.max.hp, 'sl-hp'),
        `TP ${c.tp}/${c.max.tp}`, meter(c.tp, c.max.tp, 'sl-tp'),
      ]);
    }));
  }

  private log(events: BattleEvent[]): HTMLElement {
    const name = (key: string) => [...this.state!.party, ...this.state!.enemies].find((c) => c.key === key)?.name ?? key;
    const lines = events.map((e) => {
      switch (e.type) {
        case 'act': return T.log.act(name(e.actor), e.label);
        case 'damage': return T.log.damage(name(e.target), e.amount, e.mult);
        case 'ko': return T.log.ko(name(e.target));
        case 'heal': return T.log.heal(name(e.target), e.amount);
        case 'tp': return T.log.tp(name(e.target), e.amount);
        case 'revive': return T.log.revive(name(e.target));
        case 'cure': return T.log.cure(name(e.target));
        case 'status': return T.log.status(name(e.target), e.status);
        case 'resist': return T.log.resist(name(e.target));
        case 'buff': return T.log.buff(name(e.target), e.stat, e.pct);
        case 'taunt': return T.log.taunt(name(e.target));
        case 'turret': return T.log.turret(name(e.target));
        case 'asleep': return T.log.asleep(name(e.actor));
        case 'no-tp': return T.log.noTp(name(e.actor));
        case 'escape': return T.log.escape(e.success);
        case 'poison-tick': return T.log.poison(name(e.target), e.amount);
      }
    });
    return el('div', { class: 'sl-log', attrs: { 'aria-live': 'polite' } }, lines.map((l) => el('div', { text: l })));
  }
}
