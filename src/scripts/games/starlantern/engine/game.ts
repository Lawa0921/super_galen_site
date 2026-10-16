import { CONDITIONS } from '../data/conditions';
import { FLOORS } from '../data/floors';
import { createBattle, planEnemies, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { floorOf, newRun, startDepths, terrainOf, type Portal, type Run } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { advance, danger, type Danger } from './encounter';
import { altarAt, altarHpLoss, eliteGroup, FOUNTAIN_PCT, POISON_TP_LOSS_PCT, trapDamage, VAULT_CHEST_MULT, VAULT_PLACEHOLDER } from './events';
import { posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { activeIds, awardExp, hasPassive, statsOf } from './party';
import { pick, type Rng } from './rng';
import { encounterGroup } from './scaling';
import { loadGame, saveGame, type SaveStorage } from './save';
import { newGame, type GameState } from './state';
import { addItem, buy as townBuy, rest as innRest, type TownResult } from './town';
import type { CharacterId, Member, Pos } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed' | 'lamp';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' } | { kind: 'floor'; floor: number } | { kind: 'chest'; item: string; qty: number }
  /** Stepped onto a fountain, merchant, altar or vault: the screen offers its choice (useFountain, buy, altar, openVault). */
  | { kind: 'event'; content: Content }
  | { kind: 'trap'; effect: 'hurt' | 'poison'; amount: number }
  | { kind: 'key' }
  | { kind: 'vault'; loot: Record<string, number> };
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
  /** The elite tile whose fight is on; it turns to floor on a win. */
  private eliteAt: Pos | null = null;
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
        // The mainline story boss stays as written; every other boss is the 燈喰之獸 grown by depth and region.
        this.startBattle(['lanterneater'], true, !this.isStoryDepth(this.floor));
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      case 'fountain': return this.run!.usedFountain ? this.walk() : this.eventHere();
      case 'altar': return this.run!.opened.has(this.spotId()) ? this.walk() : this.eventHere();
      case 'merchant': case 'vault': return this.eventHere();
      case 'trap': return this.springTrap();
      case 'key': {
        this.run!.keys.add(this.floor);
        this.map().tiles[this.pos.y][this.pos.x] = 'floor';
        return { kind: 'key' };
      }
      case 'elite': {
        const group = eliteGroup(this.run!, this.floor);
        this.startBattle(group, false, true, group[0]);
        this.eliteAt = { ...this.pos };
        return { kind: 'battle' };
      }
      default: return this.walk();
    }
  }

  /** An ordinary step: fills the encounter gauge and may start a battle. Event tiles never come through here, so one step triggers one thing. */
  private walk(): MoveResult {
    const mod = (hasPassive(this.state.party, 'encounterDown') ? 0.5 : 1) * CONDITIONS[this.run!.condition].encounterMul;
    const f = FLOORS[this.terrain() - 1];
    const g = advance(this.encounter, this.rng, f.rate, mod);
    this.encounter = g.value;
    if (!g.encounter) return { kind: 'moved' };
    this.startBattle(encounterGroup(this.run!.region, this.floor, this.rng), false);
    return { kind: 'battle' };
  }

  private spotId(at: Pos = this.pos): string {
    return `${this.floor}:${posKey(at)}`;
  }

  /** The content of `kind` at `at`, only when the party stands on it. */
  private contentAt(kind: Content['kind'], at: Pos): Content | undefined {
    if (this.phase !== 'map' || !this.run || this.pos.x !== at.x || this.pos.y !== at.y) return undefined;
    return floorOf(this.run, this.floor).contents.find((c) => c.kind === kind && c.at.x === at.x && c.at.y === at.y);
  }

  private eventHere(): MoveResult {
    const c = floorOf(this.run!, this.floor).contents.find((x) => x.at.x === this.pos.x && x.at.y === this.pos.y);
    return c ? { kind: 'event', content: c } : this.walk();
  }

  private livingMembers() {
    return this.state.party.recruited.map((id) => this.state.party.roster[id]).filter((m) => m.hp > 0);
  }

  /** A trap hurts every living member (never below 1 HP); poison hurts less but also drains TP. The tile is spent. */
  private springTrap(): MoveResult {
    const effect = this.rng() < 0.5 ? 'hurt' : 'poison';
    const amount = trapDamage(effect, this.floor);
    for (const m of this.livingMembers()) {
      m.hp = Math.max(1, m.hp - amount);
      if (effect === 'poison') m.tp = Math.max(0, m.tp - Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100));
    }
    this.map().tiles[this.pos.y][this.pos.x] = 'floor';
    return { kind: 'trap', effect, amount };
  }

  /** Heal the party's HP and TP by 30% of their maximums; once per run, standing on a fountain. */
  useFountain(): boolean {
    if (this.phase !== 'map' || !this.run || this.run.usedFountain || tileAt(this.map(), this.pos) !== 'fountain') return false;
    for (const m of this.livingMembers()) {
      const max = statsOf(m);
      m.hp = Math.min(max.hp, m.hp + Math.floor((max.hp * FOUNTAIN_PCT) / 100));
      m.tp = Math.min(max.tp, m.tp + Math.floor((max.tp * FOUNTAIN_PCT) / 100));
    }
    this.run.usedFountain = true;
    return true;
  }

  /** Buy from the merchant the party stands at: only his three items, at the shop price. */
  buy(merchantAt: Pos, item: string): TownResult {
    const c = this.contentAt('merchant', merchantAt);
    if (!c || !c.stock?.includes(item)) return { ok: false, reason: 'invalid' };
    return this.apply(townBuy(this.state, item));
  }

  /** Accept or decline the altar the party stands at. Accepting pays its cost and adds its bonus for the whole run; each altar works once. */
  altar(at: Pos, accept: boolean): boolean {
    if (!accept || !this.contentAt('altar', at) || this.run!.opened.has(this.spotId(at))) return false;
    const def = altarAt(this.run!, this.floor, at);
    const members = this.livingMembers();
    const loss = (m: Member) => (def.cost.hpPct ? altarHpLoss(statsOf(m).hp, def.cost.hpPct) : 0);
    if (this.state.gold < (def.cost.gold ?? 0) || members.some((m) => m.hp - loss(m) < 1)) return false;
    this.state.gold -= def.cost.gold ?? 0;
    for (const m of members) m.hp -= loss(m);
    this.run!.altarBuffs.push({ ...def.gain });
    this.run!.opened.add(this.spotId(at));
    return true;
  }

  /** Open the vault the party stands at: needs this floor's key. Pays three chests' worth plus a stand-in for plan 5's rare materials. */
  openVault(at: Pos): MoveResult | null {
    if (!this.contentAt('vault', at) || tileAt(this.map(), at) !== 'vault' || !this.run!.keys.has(this.floor)) return null;
    const loot: Record<string, number> = {};
    if (FLOORS[this.terrain() - 1].chestLoot.length) {
      const one = this.rollChest();
      loot[one.item] = one.qty * VAULT_CHEST_MULT;
    }
    // TODO(plan 5): rare materials replace this placeholder.
    loot[VAULT_PLACEHOLDER.item] = (loot[VAULT_PLACEHOLDER.item] ?? 0) + VAULT_PLACEHOLDER.qty;
    for (const [item, qty] of Object.entries(loot)) this.grant(item, qty);
    this.map().tiles[at.y][at.x] = 'floor';
    return { kind: 'vault', loot };
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
    const elite = this.eliteAt;
    this.eliteAt = null;
    if (b.outcome === 'fled') { this.phase = 'map'; return { battle: b, end: empty }; }
    if (b.outcome === 'lose') { this.wipe(); return { battle: b, end: empty }; }
    const rw = rewards(b, this.rng, hasPassive(this.state.party, 'dropBoost'));
    this.state.gold += rw.gold;
    for (const [mat, n] of Object.entries(rw.drops)) addItem(this.state.inventory, mat, n);
    const survivors = b.party.filter((c) => c.alive).map((c) => c.key as CharacterId);
    const awarded = awardExp(this.state.party, rw.exp, survivors);
    this.state.party = awarded.party;
    if (elite) this.map().tiles[elite.y][elite.x] = 'floor';   // a beaten elite is gone
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

  /** The single place loot enters the party's hands (chests and vaults). */
  private grant(item: string, qty: number): void {
    addItem(this.state.inventory, item, qty);
  }

  private rollChest(): { item: string; qty: number } {
    const loot = pick(this.rng, FLOORS[this.terrain() - 1].chestLoot);
    return { item: loot.item, qty: Math.max(1, Math.round(loot.qty * CONDITIONS[this.run!.condition].dropMul)) };
  }

  private openChest(): MoveResult | null {
    const run = this.run!;
    const id = this.spotId();
    if (run.opened.has(id)) return null;
    if (!FLOORS[this.terrain() - 1].chestLoot.length) return null;
    const { item, qty } = this.rollChest();
    run.opened.add(id);
    this.grant(item, qty);
    return { kind: 'chest', item, qty };
  }

  private startBattle(enemyIds: string[], boss: boolean, scaled = true, elite?: string): void {
    const scale = scaled && this.run ? { depth: this.floor, region: this.run.region, condition: this.run.condition, elite } : undefined;
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed, scale, altar: this.run?.altarBuffs });
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
