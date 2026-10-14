import { FLOORS } from '../data/floors';
import { createBattle, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { advance, danger, type Danger } from './encounter';
import { parseFloor, posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { activeIds, awardExp, hasPassive } from './party';
import { pick, type Rng } from './rng';
import { loadGame, saveGame, type SaveStorage } from './save';
import { newGame, type GameState } from './state';
import { addItem, rest as innRest, type TownResult } from './town';
import type { CharacterId, Pos } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' } | { kind: 'floor'; floor: number } | { kind: 'chest'; item: string; qty: number };
export interface BattleEnd {
  outcome: 'win' | 'lose' | 'fled'; exp: number; gold: number; drops: Record<string, number>;
  levelUps: { id: CharacterId; levels: number; learned: string[] }[];
}

const MAPS: FloorMap[] = FLOORS.map((f) => parseFloor(f.rows));

export class Game {
  state: GameState;
  phase: Phase = 'town';
  floor = 1;
  pos: Pos = { x: 0, y: 0 };
  encounter = 0;
  battle: BattleState | null = null;
  notice: Notice | null = null;

  constructor(readonly rng: Rng, readonly storage: SaveStorage | null, state?: GameState) {
    this.state = state ?? newGame();
  }

  static boot(rng: Rng, storage: SaveStorage | null): Game {
    if (!storage) return new Game(rng, null);
    const r = loadGame(storage);
    const g = new Game(rng, storage, r.status === 'ok' ? r.state : undefined);
    if (r.status === 'corrupt' || r.status === 'version') g.notice = 'save-reset';
    return g;
  }

  map(floor = this.floor): FloorMap {
    return MAPS[floor - 1];
  }

  danger(): Danger {
    return danger(this.encounter);
  }

  onEntrance(): boolean {
    return this.phase === 'map' && tileAt(this.map(), this.pos) === 'entrance';
  }

  depart(floor: number): { ok: true } | { ok: false; reason: 'locked' | 'party-down' | 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    if (floor < 1 || floor > this.state.dungeon.reachedFloor) return { ok: false, reason: 'locked' };
    if (!activeIds(this.state.party).some((id) => this.state.party.roster[id].hp > 0)) return { ok: false, reason: 'party-down' };
    this.floor = floor;
    this.pos = { ...this.map().entrance };
    this.encounter = 0;
    this.phase = 'map';
    this.revealHere();
    return { ok: true };
  }

  move(dir: Dir): MoveResult {
    if (this.phase !== 'map') return { kind: 'ignored' };
    const r = step(this.map(), this.pos, dir);
    if (!r.moved) return { kind: 'blocked' };
    this.pos = r.pos;
    this.revealHere();
    switch (r.tile) {
      case 'down': return this.changeFloor(this.floor + 1, 'entrance');
      case 'up': return this.changeFloor(this.floor - 1, 'down');
      case 'entrance': return { kind: 'entrance' };
      case 'boss':
        if (this.state.dungeon.bossDefeated) return { kind: 'moved' };
        this.startBattle(['lanterneater'], true);
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      default: {
        const mod = hasPassive(this.state.party, 'encounterDown') ? 0.5 : 1;
        const g = advance(this.encounter, this.rng, FLOORS[this.floor - 1].rate, mod);
        this.encounter = g.value;
        if (!g.encounter) return { kind: 'moved' };
        this.startBattle(pick(this.rng, FLOORS[this.floor - 1].encounters), false);
        return { kind: 'battle' };
      }
    }
  }

  returnToTown(): boolean {
    if (!this.onEntrance()) return false;
    this.toTown();
    return true;
  }

  useReturnLamp(): boolean {
    if (this.phase !== 'map' || (this.state.inventory['return-lamp'] ?? 0) <= 0) return false;
    addItem(this.state.inventory, 'return-lamp', -1);
    this.toTown();
    return true;
  }

  submitRound(actions: Record<string, Action>): { battle: BattleState; end: BattleEnd | null } | null {
    if (this.phase !== 'battle' || !this.battle) return null;
    const b = resolveRound(this.battle, actions, this.rng);
    this.battle = b;
    this.state.inventory = { ...b.inventory };
    this.state.revealed = structuredClone(b.revealed);
    this.state.party = writeBack(this.state.party, b);
    if (b.outcome === 'ongoing') return { battle: b, end: null };
    this.battle = null;
    const empty: BattleEnd = { outcome: b.outcome, exp: 0, gold: 0, drops: {}, levelUps: [] };
    if (b.outcome === 'fled') { this.phase = 'map'; return { battle: b, end: empty }; }
    if (b.outcome === 'lose') { this.wipe(); return { battle: b, end: empty }; }
    const rw = rewards(b, this.rng, hasPassive(this.state.party, 'dropBoost'));
    this.state.gold += rw.gold;
    for (const [mat, n] of Object.entries(rw.drops)) addItem(this.state.inventory, mat, n);
    const survivors = b.party.filter((c) => c.alive).map((c) => c.key as CharacterId);
    const awarded = awardExp(this.state.party, rw.exp, survivors);
    this.state.party = awarded.party;
    if (b.boss) { this.state.dungeon.bossDefeated = true; this.phase = 'clear'; }
    else this.phase = 'map';
    return { battle: b, end: { outcome: 'win', ...rw, levelUps: awarded.results.filter((x) => x.levels > 0) } };
  }

  rest(): TownResult {
    const r = innRest(this.state);
    if (!r.ok) return r;
    this.state = r.state;
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  apply(r: TownResult): TownResult {
    if (r.ok) this.state = r.state;
    return r;
  }

  restartAfterClear(): void {
    if (this.phase === 'clear') this.phase = 'town';
  }

  private toTown(): void {
    this.phase = 'town';
    this.encounter = 0;
  }

  private revealHere(): void {
    const key = String(this.floor);
    this.state.dungeon.explored[key] = reveal(this.state.dungeon.explored[key] ?? [], this.map(), this.pos);
  }

  private changeFloor(floor: number, at: 'entrance' | 'down'): MoveResult {
    this.floor = floor;
    const m = this.map();
    this.pos = { ...(at === 'entrance' ? m.entrance : m.down ?? m.entrance) };
    this.state.dungeon.reachedFloor = Math.max(this.state.dungeon.reachedFloor, floor);
    this.revealHere();
    return { kind: 'floor', floor };
  }

  private openChest(): MoveResult | null {
    const id = `${this.floor}:${posKey(this.pos)}`;
    if (this.state.dungeon.opened.includes(id)) return null;
    const index = this.map().chests.findIndex((c) => c.x === this.pos.x && c.y === this.pos.y);
    const loot = FLOORS[this.floor - 1].chestLoot[index];
    if (!loot) return null;
    this.state.dungeon.opened.push(id);
    addItem(this.state.inventory, loot.item, loot.qty);
    return { kind: 'chest', item: loot.item, qty: loot.qty };
  }

  private startBattle(enemyIds: string[], boss: boolean): void {
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed });
    this.phase = 'battle';
  }

  private wipe(): void {
    const r = this.storage ? loadGame(this.storage) : { status: 'empty' as const };
    this.state = r.status === 'ok' ? r.state : newGame();
    this.phase = 'town';
    this.encounter = 0;
    this.notice = 'wipe';
  }
}
