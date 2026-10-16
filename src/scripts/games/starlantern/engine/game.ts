import { CONDITIONS } from '../data/conditions';
import { FLOORS } from '../data/floors';
import { createBattle, planEnemies, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { floorOf, newRun, startDepths, terrainOf, type Portal, type Run } from './dungeon/run';
import { advance, danger, type Danger } from './encounter';
import { posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { activeIds, awardExp, hasPassive } from './party';
import { pick, type Rng } from './rng';
import { loadGame, saveGame, type SaveStorage } from './save';
import { newGame, type GameState } from './state';
import { addItem, rest as innRest, type TownResult } from './town';
import type { CharacterId, Pos } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed' | 'lamp';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' } | { kind: 'floor'; floor: number } | { kind: 'chest'; item: string; qty: number };
export interface BattleEnd {
  outcome: 'win' | 'lose' | 'fled'; exp: number; gold: number; drops: Record<string, number>;
  levelUps: { id: CharacterId; levels: number; learned: string[] }[];
}

/** Turn a floor's boss tile into stairs down. */
function openStairs(m: FloorMap): void {
  if (!m.boss) return;
  m.tiles[m.boss.y][m.boss.x] = 'down';
  m.down = m.boss;
  m.boss = null;
}

export class Game {
  state: GameState;
  phase: Phase = 'town';
  /** The current run, from departure until back in town. */
  run: Run | null = null;
  /** Current depth of the run. */
  floor = 1;
  pos: Pos = { x: 0, y: 0 };
  facing: Dir = 'down';
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

  /** A new game that replaces the save at once: the player agreed to overwrite it, and a wipe must not bring the old run back. */
  static fresh(rng: Rng, storage: SaveStorage | null): Game {
    const g = new Game(rng, storage);
    if (storage) saveGame(storage, g.state);
    return g;
  }

  map(floor = this.floor): FloorMap {
    if (!this.run) throw new Error('no run in progress');
    const m = floorOf(this.run, floor).map;
    // Once the story boss is beaten, its room on later mainline runs holds stairs down (a rematch comes later).
    if (m.boss && this.state.dungeon.bossDefeated && this.isStoryDepth(floor)) openStairs(m);
    return m;
  }

  /** Tile theme (1-3) of the current depth: picks the art, the floor name, the encounter table and the chest loot. */
  terrain(floor = this.floor): 1 | 2 | 3 {
    return terrainOf(this.run?.region ?? 'mainline', floor);
  }

  danger(): Danger {
    return danger(this.encounter);
  }

  onEntrance(): boolean {
    return this.phase === 'map' && tileAt(this.map(), this.pos) === 'entrance';
  }

  /** Start a new run through a gate: a fresh labyrinth every time. */
  depart(portal: Portal, startDepth: number): { ok: true } | { ok: false; reason: 'locked' | 'party-down' | 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    if (!startDepths(portal.region, this.state.dungeon.reached[portal.region]).includes(startDepth)) return { ok: false, reason: 'locked' };
    if (!activeIds(this.state.party).some((id) => this.state.party.roster[id].hp > 0)) return { ok: false, reason: 'party-down' };
    this.run = newRun(Math.floor(this.rng() * 2 ** 31), portal.region, portal.condition, startDepth);
    this.floor = startDepth;
    this.pos = { ...this.map().entrance };
    this.facing = 'down';
    this.encounter = 0;
    this.phase = 'map';
    this.revealHere();
    return { ok: true };
  }

  move(dir: Dir): MoveResult {
    if (this.phase !== 'map') return { kind: 'ignored' };
    this.facing = dir;
    const r = step(this.map(), this.pos, dir);
    if (!r.moved) return { kind: 'blocked' };
    this.pos = r.pos;
    this.revealHere();
    switch (r.tile) {
      case 'down': return this.changeFloor(this.floor + 1);
      case 'entrance': return { kind: 'entrance' };
      case 'boss':
        this.startBattle(['lanterneater'], true);
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      default: {
        const mod = (hasPassive(this.state.party, 'encounterDown') ? 0.5 : 1) * CONDITIONS[this.run!.condition].encounterMul;
        const f = FLOORS[this.terrain() - 1];
        const g = advance(this.encounter, this.rng, f.rate, mod);
        this.encounter = g.value;
        if (!g.encounter) return { kind: 'moved' };
        this.startBattle(pick(this.rng, f.encounters), false);
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
    if (b.boss) openStairs(this.map());   // a beaten boss leaves stairs down where it stood, so the run can go deeper
    if (b.boss && this.isStoryDepth(this.floor)) { this.state.dungeon.bossDefeated = true; this.phase = 'clear'; }
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
    if (this.phase !== 'clear') return;
    this.phase = 'town';
    this.run = null;
  }

  /** The mainline's depth 3 holds the story boss: beating it clears the game. */
  private isStoryDepth(floor: number): boolean {
    return this.run?.region === 'mainline' && floor === 3;
  }

  private toTown(): void {
    this.phase = 'town';
    this.encounter = 0;
    this.run = null;
  }

  private revealHere(): void {
    const run = this.run!;
    run.explored[this.floor] = reveal(run.explored[this.floor] ?? [], this.map(), this.pos);
  }

  private changeFloor(floor: number): MoveResult {
    const region = this.run!.region;
    this.floor = floor;
    this.pos = { ...this.map().entrance };
    this.state.dungeon.reached[region] = Math.max(this.state.dungeon.reached[region], floor);
    this.revealHere();
    return { kind: 'floor', floor };
  }

  private openChest(): MoveResult | null {
    const run = this.run!;
    const id = `${this.floor}:${posKey(this.pos)}`;
    if (run.opened.has(id)) return null;
    const table = FLOORS[this.terrain() - 1].chestLoot;
    if (!table.length) return null;
    const loot = pick(this.rng, table);
    const qty = Math.max(1, Math.round(loot.qty * CONDITIONS[run.condition].dropMul));
    run.opened.add(id);
    addItem(this.state.inventory, loot.item, qty);
    return { kind: 'chest', item: loot.item, qty };
  }

  private startBattle(enemyIds: string[], boss: boolean): void {
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed });
    planEnemies(this.battle, this.rng);
    this.phase = 'battle';
  }

  private wipe(): void {
    const r = this.storage ? loadGame(this.storage) : { status: 'empty' as const };
    this.state = r.status === 'ok' ? r.state : newGame();
    this.phase = 'town';
    this.run = null;
    this.encounter = 0;
    this.notice = 'wipe';
  }
}
