import { CONDITIONS } from '../data/conditions';
import { ITEMS } from '../data/items';
import { capacity, carried, weightOf } from '../data/weights';
import { FLOORS } from '../data/floors';
import { createBattle, planEnemies, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { floorOf, newRun, startDepths, terrainOf, type Portal, type Run } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { advance, danger, type Danger } from './encounter';
import { ALTAR_STAT_CAP_PCT, altarAt, altarHpLoss, eliteGroup, FOUNTAIN_PCT, POISON_TP_LOSS_PCT, trapDamage, VAULT_CHEST_MULT } from './events';
import { EQUIPMENT } from '../data/equipment';
import { SPECIALS } from '../data/gear';
import { applyAutoJunk, BAG_SIZE, mintUid } from './loot/bag';
import { chestHasGear, GEAR_CHANCE, lootRng, rollBossGear, rollGear, rollRareMaterial, type DropCtx } from './loot/drops';
import { itemWeight, type DropSource } from './loot/item';
import { posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { activeIds, awardExp, hasPassive, setFormation, START_LINEUP, statsOf, type LevelUp, type SetFormationFail } from './party';
import { raiseNode, raiseTalent, type RaiseFail, type TalentFail } from './progression';
import { pick, type Rng } from './rng';
import { depthClearExp, depthLevel, encounterGroup } from './scaling';
import { loadGame, saveGame, type SaveStorage } from './save';
import { MAX_REACHED } from './levels';
import { rollPortals } from './portals';
import { newGame, type GameState } from './state';
import { craftBase, craftItem, craftSet } from './forge/craft';
import type { ForgeResult, RerollOpts } from './forge/cost';
import { dismantle, enhance, fuse, reroll } from './forge/forge';
import { addItem, buy as townBuy, rest as innRest, respec as townRespec, type TownResult } from './town';
import type { CharacterId, GearSlot, ItemInstance, Member, Pos } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed' | 'lamp' | 'banked';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' }
  /** A new floor; `clear` is the depth-clear exp paid for the floor left by the stairs (descend), with who levelled up. */
  | { kind: 'floor'; floor: number; clear?: { exp: number; levelUps: LevelUp[] } }
  /**
   * A chest's materials, and its gear when it holds any (`chestHasGear`). Gear that does not fit stays in the opened chest:
   * `waiting` says why (as a `full` result), and `pickUpHere` takes it once there is room.
   */
  | { kind: 'chest'; item: string; qty: number; gear?: ItemInstance; waiting?: FullResult }
  /** Gear that waited in an opened chest or vault, taken now. */
  | { kind: 'pickup'; gear: ItemInstance }
  /** Stepped onto a fountain, merchant, altar or vault: the screen offers its choice (useFountain, buy, altar, openVault). */
  | { kind: 'event'; content: Content }
  | { kind: 'trap'; effect: 'hurt' | 'poison'; amount: number; tp: number }
  | { kind: 'key' }
  /** Stepped onto stairs down: the screen asks first (descend goes). `level` is the next depth's suggested level; `warn` when the party's best is below it. */
  | { kind: 'stairs'; floor: number; level: number; warn: boolean }
  | FullResult
  /** An opened vault: its materials always; its gear in `gear`, or in `waiting` when it does not fit (see `chest`). */
  | { kind: 'vault'; loot: Record<string, number>; gear: ItemInstance[]; waiting?: FullResult };
/**
 * The pack cannot take the pick-up, which stays where it is until something is discarded. `item`/`qty` are the materials
 * of a chest or vault kept shut for weight (absent when only waiting gear is short); `need` is the weight over the limit
 * (0 when only the bag is short); `gear` is the piece in question; `bag` is set when the town bag (with the run pack's
 * gear) has no slot left for that gear. A bag slot never keeps a chest or vault shut: only its gear waits.
 */
export type FullResult = { kind: 'full'; item?: string; qty?: number; need: number; gear?: ItemInstance; bag?: boolean };
export interface BattleEnd {
  /** `drops` lists only what went into the party's hands. */
  outcome: 'win' | 'lose' | 'fled'; exp: number; gold: number; drops: Record<string, number>;
  levelUps: LevelUp[];
  /** Drops that did not fit in the pack and were left behind. */
  left: Record<string, number>;
  /** Gear that went into the run pack, and gear left behind for want of weight or bag room. */
  gear: ItemInstance[]; gearLeft: ItemInstance[];
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
  /** What the last safe return brought home; the town screen shows it, then clears it. `overflow` is gear the full bag could not take. */
  banked: { items: Record<string, number>; gold: number; viaLamp: boolean; gear: ItemInstance[]; overflow: ItemInstance[] } | null = null;

  /** `forgeSalt` is used only when there is no `state` (a new game); a loaded game keeps the salt in its save. */
  constructor(readonly rng: Rng, readonly storage: SaveStorage | null, state?: GameState, forgeSalt = 0, start?: CharacterId[]) {
    this.state = state ?? newGame(rng, forgeSalt, start);
  }

  static boot(rng: Rng, storage: SaveStorage | null, forgeSalt = 0): Game {
    if (!storage) return new Game(rng, null, undefined, forgeSalt, START_LINEUP);
    const r = loadGame(storage);
    const g = new Game(rng, storage, r.status === 'ok' ? r.state : undefined, forgeSalt, START_LINEUP);
    if (r.status === 'corrupt' || r.status === 'version') g.notice = 'save-reset';
    return g;
  }

  /** A new game that replaces the save at once: the player agreed to overwrite it, and a wipe must not bring the old run back. */
  static fresh(rng: Rng, storage: SaveStorage | null, forgeSalt = 0): Game {
    const g = new Game(rng, storage, undefined, forgeSalt, START_LINEUP);
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
      case 'down': return this.stairs();
      case 'entrance': return { kind: 'entrance' };
      case 'boss':
        // The mainline story boss stays as written; every other boss is the 燈喰之獸 grown by depth and region.
        this.startBattle(['lanterneater'], true, !this.isStoryDepth(this.floor));
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      case 'fountain': return this.run!.usedFountain ? this.walk() : this.eventHere();
      case 'altar': return this.run!.opened.has(this.spotId()) ? this.walk() : this.eventHere();
      case 'merchant': return this.eventHere();
      // An opened vault still on the map holds gear that did not fit: stepping on it again offers that gear.
      case 'vault': return this.run!.opened.has(this.spotId()) ? this.takeWaiting() ?? this.walk() : this.eventHere();
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

  /**
   * A trap hurts every living member (never below 1 HP) and is spent. Poison hurts less but also drains 20% of max TP:
   * members carry no lasting status outside battle, so "poison" is HP damage plus a TP drain. `tp` is the largest drain dealt (0 for hurt).
   */
  private springTrap(): MoveResult {
    const effect = this.rng() < 0.5 ? 'hurt' : 'poison';
    const amount = trapDamage(effect, this.floor);
    let tp = 0;
    for (const m of this.livingMembers()) {
      m.hp = Math.max(1, m.hp - amount);
      if (effect === 'poison') {
        const drain = Math.min(m.tp, Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100));
        m.tp -= drain;
        tp = Math.max(tp, drain);
      }
    }
    this.map().tiles[this.pos.y][this.pos.x] = 'floor';
    return { kind: 'trap', effect, amount, tp };
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
    this.map().tiles[this.pos.y][this.pos.x] = 'floor';   // a spent fountain leaves no marker
    return true;
  }

  /**
   * Buy from the merchant the party stands at: only his three items, at the shop price, and only what fits. Gear goes into
   * the run pack like chest gear (weight and a bag slot), so a wipe loses it like any other run loot.
   */
  buy(merchantAt: Pos, item: string): TownResult | { ok: false; reason: 'full' } {
    const c = this.contentAt('merchant', merchantAt);
    if (!c || !c.stock?.includes(item)) return { ok: false, reason: 'invalid' };
    const e = EQUIPMENT[item];
    const probe: ItemInstance | undefined = e ? { uid: 0, base: item, rarity: 'common', ilvl: e.ilvl, affixes: [], enhance: 0 } : undefined;
    if (probe ? this.wontFit({}, [probe]) : this.shortBy({ [item]: 1 }) > 0) return { ok: false, reason: 'full' };
    const r = this.apply(townBuy(this.state, item));
    // The town buy puts gear in the bag; in the labyrinth it belongs in the run pack. Bought gear is never auto-junked.
    if (r.ok && probe) this.run!.loot.gear.push(this.state.bag.pop()!);
    return r;
  }

  /**
   * Try again to take what lies under the party after the pack was too full: a shut chest or vault, or the gear waiting in
   * an opened one; null when nothing is here.
   */
  pickUpHere(): MoveResult | null {
    if (this.phase !== 'map' || !this.run) return null;
    if (this.run.opened.has(this.spotId())) return this.takeWaiting();
    const t = tileAt(this.map(), this.pos);
    if (t === 'chest') return this.openChest();
    if (t === 'vault') return this.openVault(this.pos);
    return null;
  }

  /** The gear waiting in the opened chest or vault under the party: taken when it fits, else why not; null when none waits. */
  private takeWaiting(): MoveResult | null {
    const id = this.spotId();
    const gear = this.run!.waiting[id];
    if (!gear) return null;
    const r = this.offerGear(id, gear);
    if (r.waiting) return r.waiting;
    if (tileAt(this.map(), this.pos) === 'vault') this.map().tiles[this.pos.y][this.pos.x] = 'floor';   // an emptied vault is spent
    return { kind: 'pickup', gear: r.gear! };
  }

  /** Gear from an opened chest or vault: packed when it fits; otherwise left waiting at spot `id`, with the reason. */
  private offerGear(id: string, gear: ItemInstance): { gear?: ItemInstance; waiting?: FullResult } {
    const short = this.wontFit({}, [gear]);
    if (short) {
      this.run!.waiting[id] = gear;
      return { waiting: { kind: 'full', ...short, gear: this.junkMarked(gear) } };
    }
    delete this.run!.waiting[id];
    return { gear: this.pack(gear) };
  }

  /** Accept or decline the altar the party stands at. Accepting pays its cost and adds its bonus for the whole run; each altar works once. */
  altar(at: Pos, accept: boolean): boolean {
    if (!accept || !this.contentAt('altar', at) || this.run!.opened.has(this.spotId(at))) return false;
    const def = altarAt(this.run!, this.floor, at);
    const members = this.livingMembers();
    const loss = (m: Member) => (def.cost.hpPct ? altarHpLoss(statsOf(m).hp, def.cost.hpPct) : 0);
    if (this.state.gold < (def.cost.gold ?? 0) || members.some((m) => m.hp - loss(m) < 1)) return false;
    // Run-long bonuses are capped per stat (ALTAR_STAT_CAP_PCT): an altar that would pass the cap is refused.
    const held = this.run!.altarBuffs.filter((b) => b.stat === def.gain.stat).reduce((n, b) => n + b.pct, 0);
    if (held + def.gain.pct > ALTAR_STAT_CAP_PCT) return false;
    this.state.gold -= def.cost.gold ?? 0;
    for (const m of members) m.hp -= loss(m);
    this.run!.altarBuffs.push({ ...def.gain });
    this.run!.opened.add(this.spotId(at));
    this.map().tiles[at.y][at.x] = 'floor';   // an accepted altar is spent
    return true;
  }

  /**
   * Open the vault the party stands at: needs this floor's key. Pays three chests' worth of materials, one rare material
   * and one piece of vault gear. Only the materials' weight keeps it shut; gear that does not fit waits on the vault tile.
   */
  openVault(at: Pos): MoveResult | null {
    if (!this.contentAt('vault', at) || tileAt(this.map(), at) !== 'vault' || !this.run!.keys.has(this.floor)) return null;
    const run = this.run!;
    const id = this.spotId(at);
    if (run.opened.has(id)) return null;   // opened already: only its waiting gear is left (pickUpHere)
    const loot: Record<string, number> = {};
    if (FLOORS[this.terrain() - 1].chestLoot.length) {
      const one = this.rollChest(`vault:${id}`);
      loot[one.item] = one.qty * VAULT_CHEST_MULT;
    }
    const rareKey = `vault-rare:${id}`;
    if (!run.rolls[rareKey]) run.rolls[rareKey] = { item: rollRareMaterial(lootRng(run)), qty: 1 };
    const rare = run.rolls[rareKey];
    loot[rare.item] = (loot[rare.item] ?? 0) + rare.qty;
    const gear = this.fixedGear(`vault:${id}`, 'vault');
    const shut = this.shutFor(loot, gear);
    if (shut) return shut;
    run.opened.add(id);
    for (const [item, qty] of Object.entries(loot)) this.grant(item, qty);
    const r = this.offerGear(id, gear);
    if (r.waiting) return { kind: 'vault', loot, gear: [], waiting: r.waiting };
    this.map().tiles[at.y][at.x] = 'floor';
    return { kind: 'vault', loot, gear: [r.gear!] };
  }

  /**
   * Why a chest or vault stays shut: only when its materials are over the weight limit. `need` then also counts the gear,
   * when the bag has a slot for it, so one round of discarding can take both.
   */
  private shutFor(loot: Record<string, number>, gear?: ItemInstance): FullResult | null {
    if (this.shortBy(loot) <= 0) return null;
    const [item, qty] = Object.entries(loot)[0];
    const withGear = gear && this.bagHasRoom(1) ? [gear] : [];
    return { kind: 'full', item, qty, need: this.shortBy(loot, withGear), ...(gear ? { gear: this.junkMarked(gear) } : {}) };
  }

  /**
   * Go down the stairs the party stands on; null when not on stairs. Taking the stairs clears the floor left behind, and
   * the first clear of a depth in a region (the depth is at or past its `reached`) pays the depth-clear exp as a fight
   * does (the bench gets half, the downed nothing). A depth cleared before pays nothing: levels outlive runs and wipes,
   * so the party already has what the grant was for. `clear` is set only when someone gained exp.
   */
  descend(): MoveResult | null {
    if (this.phase !== 'map' || !this.run || tileAt(this.map(), this.pos) !== 'down') return null;
    // At the recorded cap (MAX_REACHED) the depth can no longer be told apart from a repeat, so deeper floors pay nothing.
    const first = this.floor < MAX_REACHED && this.floor >= this.state.dungeon.reached[this.run.region];
    const exp = first ? Math.round(depthClearExp(this.floor) * CONDITIONS[this.run.condition].expMul) : 0;
    const before = this.state.party.roster;
    const standing = activeIds(this.state.party).filter((id) => before[id].hp > 0);
    const awarded = exp > 0 ? awardExp(this.state.party, exp, standing) : null;
    const gained = awarded?.results.some(({ id }) => {
      const m = awarded.party.roster[id];
      return m.level !== before[id].level || m.exp !== before[id].exp;
    });
    if (awarded) this.state.party = awarded.party;
    const floor = this.changeFloor(this.floor + 1);
    return gained ? { ...floor, clear: { exp, levelUps: awarded!.results.filter((x) => x.levels > 0) } } : floor;
  }

  private stairs(): MoveResult {
    const floor = this.floor + 1;
    const level = depthLevel(floor);
    const best = Math.max(...activeIds(this.state.party).map((id) => this.state.party.roster[id].level));
    return { kind: 'stairs', floor, level, warn: best < level };
  }

  returnToTown(): boolean {
    if (!this.onEntrance()) return false;
    this.toTown();
    return true;
  }

  useReturnLamp(): boolean {
    if (this.phase !== 'map' || (this.state.inventory['return-lamp'] ?? 0) <= 0) return false;
    addItem(this.state.inventory, 'return-lamp', -1);
    this.toTown(true);
    return true;
  }

  /** Throw away up to `qty` of an item: the run pack first, then the consumables brought along. Returns how many went. */
  discard(id: string, qty: number): number {
    const run = this.run;
    if (this.phase !== 'map' || !run || !Number.isInteger(qty) || qty <= 0) return 0;
    let left = qty;
    const fromPack = Math.min(left, run.loot.items[id] ?? 0);
    addItem(run.loot.items, id, -fromPack);
    left -= fromPack;
    if (ITEMS[id]) {
      const fromBag = Math.min(left, this.state.inventory[id] ?? 0);
      addItem(this.state.inventory, id, -fromBag);
      left -= fromBag;
    }
    return qty - left;
  }

  /** Throw away a piece of gear from the run pack; false when there is no such piece or the party is not on the map. */
  discardGear(uid: number): boolean {
    const gear = this.run?.loot.gear;
    if (this.phase !== 'map' || !gear) return false;
    const i = gear.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    gear.splice(i, 1);
    return true;
  }

  /** Hands out the next item uid (for the debug hooks). */
  mintUid(): number {
    return mintUid(this.state);
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
    const empty: BattleEnd = { outcome: b.outcome, exp: 0, gold: 0, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [] };
    const elite = this.eliteAt;
    this.eliteAt = null;
    if (b.outcome === 'fled') { this.phase = 'map'; return { battle: b, end: empty }; }
    if (b.outcome === 'lose') { this.wipe(); return { battle: b, end: empty }; }
    const rw = rewards(b, this.rng, hasPassive(this.state.party, 'dropBoost'), CONDITIONS[this.run!.condition].dropMul);
    this.run!.loot.gold += rw.gold;
    const found = this.battleGear(b, elite !== null);
    const drops = { ...rw.drops };
    if (found.rare) drops[found.rare] = (drops[found.rare] ?? 0) + 1;
    const taken: Record<string, number> = {};
    const left: Record<string, number> = {};
    for (const [mat, n] of Object.entries(drops)) {
      const room = Math.max(0, Math.floor((capacity(this.state.party) - carried(this.state, this.run!)) / weightOf(mat)));
      const take = Math.min(n, room);
      if (take > 0) { this.grant(mat, take); taken[mat] = take; }
      if (take < n) left[mat] = n - take;
    }
    const gear: ItemInstance[] = [];
    const gearLeft: ItemInstance[] = [];
    for (const it of found.gear) {
      if (this.wontFit({}, [it])) gearLeft.push(it);
      else gear.push(this.pack(it));
    }
    const survivors = b.party.filter((c) => c.alive).map((c) => c.key as CharacterId);
    const awarded = awardExp(this.state.party, rw.exp, survivors);
    this.state.party = awarded.party;
    if (elite) this.map().tiles[elite.y][elite.x] = 'floor';   // a beaten elite is gone
    if (b.boss) openStairs(this.map());   // a beaten boss leaves stairs down where it stood, so the run can go deeper
    if (b.boss && this.isStoryDepth(this.floor)) { this.state.dungeon.bossDefeated = true; this.phase = 'clear'; }
    else this.phase = 'map';
    return { battle: b, end: { outcome: 'win', ...rw, drops: taken, levelUps: awarded.results.filter((x) => x.levels > 0), left, gear, gearLeft } };
  }

  /**
   * Gear a won fight drops, all from the loot rng: a boss its two pieces (a repeat kill of the same region and depth rolls
   * on repeat odds); an elite one piece and a rare material, and then each escort rolls like an ordinary monster; and an
   * ordinary fight a GEAR_CHANCE.monster roll per monster. An elite fight never pays less than an ordinary one.
   */
  private battleGear(b: BattleState, elite: boolean): { gear: ItemInstance[]; rare?: string } {
    const run = this.run!;
    if (b.boss) {
      const key = `${run.region}:${Math.min(this.floor, MAX_REACHED)}`;
      const kills = this.state.dungeon.bossKills;
      const gear = rollBossGear(lootRng(run), { ...this.dropCtx('boss'), bossRepeat: (kills[key] ?? 0) > 0 });
      kills[key] = (kills[key] ?? 0) + 1;
      return { gear };
    }
    const gear: ItemInstance[] = [];
    let rare: string | undefined;
    if (elite) {
      const rng = lootRng(run);
      gear.push(rollGear(rng, this.dropCtx('elite')));
      rare = rollRareMaterial(rng);
    }
    // In an elite fight the first enemy is the elite; the rest are escorts.
    for (let i = elite ? 1 : 0; i < b.enemies.length; i++) {
      const rng = lootRng(run);
      if (rng() < GEAR_CHANCE.monster) gear.push(rollGear(rng, this.dropCtx('monster')));
    }
    return { gear, rare };
  }

  private dropCtx(source: DropSource): DropCtx {
    const run = this.run!;
    return { uid: () => mintUid(this.state), depth: this.floor, region: run.region, condition: run.condition, source };
  }

  /** The inn: town only, so a run can never rest (or save) mid-labyrinth. */
  rest(): TownResult {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = innRest(this.state);
    if (!r.ok) return r;
    this.state = r.state;
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  /** The inn's respec: town only, and saved like a night's rest so a reload cannot undo a paid reset. */
  respec(id: CharacterId): TownResult {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = this.apply(townRespec(this.state, id));
    if (r.ok) this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  /**
   * One skill point into a recruited member's tree node (the rules: progression `raiseNode`). In town the spend is saved
   * at once, so it never waits for the inn; a run is never saved mid-labyrinth, so in the labyrinth the spend counts at
   * once and is saved with the rest of the run's progress (levels and exp) at the next town save. Only a failed save
   * leaves a notice: a spend is too small a thing to announce.
   */
  raiseNode(id: CharacterId, node: string): { ok: true } | { ok: false; reason: RaiseFail | 'invalid' } {
    if ((this.phase !== 'town' && this.phase !== 'map') || !this.state.party.recruited.includes(id)) return { ok: false, reason: 'invalid' };
    // Plan 6a: no memory source yet, so the abyss nodes stay shut (6b changes this to `state.memories.hero`).
    const r = raiseNode(this.state.party.roster[id], node, 0);
    if (!r.ok) return r;
    const party = this.state.party;
    this.state = { ...this.state, party: { ...party, roster: { ...party.roster, [id]: r.member } } };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * A new formation (the rules: party `setFormation`, which keeps the hero on the field). Saved like `raiseNode`: at once
   * in town; in the labyrinth it counts at once and is saved at the next town save.
   */
  setFormation(grid: (CharacterId | null)[]): { ok: true } | { ok: false; reason: SetFormationFail | 'invalid' } {
    if (this.phase !== 'town' && this.phase !== 'map') return { ok: false, reason: 'invalid' };
    const r = setFormation(this.state.party, grid);
    if (!r.ok) return r;
    this.state = { ...this.state, party: r.party };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * One talent point into a recruited member's board node (the rules: progression `raiseTalent`). Saved like `raiseNode`:
   * at once in town; in the labyrinth the spend counts at once and is saved at the next town save.
   */
  raiseTalent(id: CharacterId, node: string): { ok: true } | { ok: false; reason: TalentFail | 'invalid' } {
    if ((this.phase !== 'town' && this.phase !== 'map') || !this.state.party.recruited.includes(id)) return { ok: false, reason: 'invalid' };
    const r = raiseTalent(this.state.party.roster[id], node);
    if (!r.ok) return r;
    const party = this.state.party;
    this.state = { ...this.state, party: { ...party, roster: { ...party.roster, [id]: r.member } } };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * One forge action: town only (checked here, once), applied, then saved at once so a reload can neither undo a paid
   * action nor re-draw an enhance or reroll (the engine's forgeRng owns forgeDraws; no rng is passed in).
   */
  private forgeAct<O>(run: (s: GameState) => ForgeResult<O>): ForgeResult<O> {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    const r = run(this.state);
    if (!r.ok) return r;
    this.state = r.state;
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }
  dismantle(uids: number[]) { return this.forgeAct((s) => dismantle(s, uids)); }
  enhance(uid: number) { return this.forgeAct((s) => enhance(s, uid)); }
  reroll(uid: number, index: number, o: RerollOpts) { return this.forgeAct((s) => reroll(s, uid, index, o)); }
  fuse(uids: number[], slot?: GearSlot) { return this.forgeAct((s) => fuse(s, uids, slot)); }
  craftItem(id: string, qty: number) { return this.forgeAct((s) => craftItem(s, id, qty)); }
  craftBase(slot: GearSlot) { return this.forgeAct((s) => craftBase(s, slot)); }
  craftSet(pieceId: string) { return this.forgeAct((s) => craftSet(s, pieceId)); }

  apply(r: TownResult): TownResult {
    if (r.ok) this.state = r.state;
    return r;
  }

  restartAfterClear(): void {
    if (this.phase !== 'clear') return;
    this.toTown();   // the clear banks the run pack like any safe return
  }

  /** The mainline's depth 3 holds the story boss: beating it clears the game. */
  private isStoryDepth(floor: number): boolean {
    return this.run?.region === 'mainline' && floor === 3;
  }

  /**
   * A safe return: what the run pack holds now counts, and the town is told what came home. Gear goes into the bag while it
   * has slots (the rest is reported as `overflow`); special items and their sets enter the codex.
   */
  private toTown(viaLamp = false): void {
    const loot = this.run?.loot;
    this.banked = null;
    if (loot && (loot.gold > 0 || Object.keys(loot.items).length || loot.gear.length)) {
      for (const [id, n] of Object.entries(loot.items)) addItem(this.state.inventory, id, n);
      this.state.gold += loot.gold;
      const room = Math.max(0, BAG_SIZE - this.state.bag.length);
      const gear = loot.gear.slice(0, room);
      this.state.bag.push(...gear);
      for (const it of gear) {
        const sp = it.special ? SPECIALS[it.special] : undefined;
        for (const id of [sp?.id, sp?.set]) if (id && !this.state.codex.includes(id)) this.state.codex.push(id);
      }
      this.banked = { items: { ...loot.items }, gold: loot.gold, viaLamp, gear, overflow: loot.gear.slice(room) };
      this.notice = 'banked';
    }
    this.phase = 'town';
    this.encounter = 0;
    this.run = null;
    this.state.dungeon.portals = rollPortals(this.rng);
  }

  private revealHere(): void {
    const run = this.run!;
    run.explored[this.floor] = reveal(run.explored[this.floor] ?? [], this.map(), this.pos, CONDITIONS[run.condition].sight);
  }

  private changeFloor(floor: number): { kind: 'floor'; floor: number } {
    const region = this.run!.region;
    this.floor = floor;
    this.pos = { ...this.map().entrance };
    this.state.dungeon.reached[region] = Math.min(MAX_REACHED, Math.max(this.state.dungeon.reached[region], floor));
    this.revealHere();
    return { kind: 'floor', floor };
  }

  /** The single place loot enters the party's hands: consumables go to the inventory for use on the road, the rest into the run pack. */
  private grant(item: string, qty: number): void {
    addItem(ITEMS[item] ? this.state.inventory : this.run!.loot.items, item, qty);
  }

  /** How much weight `loot` and `gear`, taken together, are over the limit by (0 or less when they fit). */
  private shortBy(loot: Record<string, number>, gear: ItemInstance[] = []): number {
    const add = Object.entries(loot).reduce((w, [id, n]) => w + n * weightOf(id), 0) + gear.reduce((w, it) => w + itemWeight(it), 0);
    return carried(this.state, this.run!) + add - capacity(this.state.party);
  }

  /** Whether the town bag, with the run pack's gear already promised to it, has `n` more slots. */
  private bagHasRoom(n: number): boolean {
    return this.state.bag.length + (this.run?.loot.gear.length ?? 0) + n <= BAG_SIZE;
  }

  /** Why a pick-up does not fit (weight over the limit and/or no bag slot), or null when it does. */
  private wontFit(loot: Record<string, number>, gear: ItemInstance[]): { need: number; bag?: true } | null {
    const need = this.shortBy(loot, gear);
    const bag = !this.bagHasRoom(gear.length);
    if (need <= 0 && !bag) return null;
    return bag ? { need: Math.max(0, need), bag: true } : { need };
  }

  /** Gear as it would be picked up now: marked by the auto-junk setting. */
  private junkMarked(it: ItemInstance): ItemInstance {
    return applyAutoJunk(it, this.state.autoJunk);
  }

  /** Puts picked-up gear into the run pack, marked by the auto-junk setting; returns what went in. */
  private pack(it: ItemInstance): ItemInstance {
    const taken = this.junkMarked(it);
    this.run!.loot.gear.push(taken);
    return taken;
  }

  /** Chest and vault gear: rolled from the loot rng the first time, then the same piece every time the spot is tried. */
  private fixedGear(key: string, source: DropSource): ItemInstance {
    const run = this.run!;
    const kept = run.gearRolls[key];
    if (kept) return kept;
    const it = rollGear(lootRng(run), this.dropCtx(source));
    run.gearRolls[key] = it;
    return it;
  }

  /** Rolled once per spot and remembered, so a chest that did not fit rolls the same when the party comes back. */
  private rollChest(key: string): { item: string; qty: number } {
    const kept = this.run!.rolls[key];
    if (kept) return kept;
    const loot = pick(this.rng, FLOORS[this.terrain() - 1].chestLoot);
    const rolled = { item: loot.item, qty: Math.max(1, Math.round(loot.qty * CONDITIONS[this.run!.condition].dropMul)) };
    this.run!.rolls[key] = rolled;
    return rolled;
  }

  private openChest(): MoveResult | null {
    const run = this.run!;
    const id = this.spotId();
    if (run.opened.has(id)) return this.takeWaiting();
    if (!FLOORS[this.terrain() - 1].chestLoot.length) return null;
    const { item, qty } = this.rollChest(`chest:${id}`);
    const gear = chestHasGear(run, this.floor, this.pos) ? this.fixedGear(`chest:${id}`, 'chest') : undefined;
    const shut = this.shutFor({ [item]: qty }, gear);
    if (shut) return shut;
    run.opened.add(id);
    this.grant(item, qty);
    if (!gear) return { kind: 'chest', item, qty };
    return { kind: 'chest', item, qty, ...this.offerGear(id, gear) };
  }

  private startBattle(enemyIds: string[], boss: boolean, scaled = true, elite?: string, extra = 0): void {
    const scale = scaled && this.run ? { depth: this.floor, region: this.run.region, condition: this.run.condition, elite } : undefined;
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed, scale, depth: this.floor, altar: this.run?.altarBuffs, extra });
    planEnemies(this.battle, this.rng);
    this.phase = 'battle';
  }

  private wipe(): void {
    // Levels and exp stay, the run pack is lost and a quarter of the gold goes; the inn save is not read back.
    this.state.gold = Math.floor(this.state.gold * 0.75);
    for (const m of Object.values(this.state.party.roster)) if (m.hp <= 0) m.hp = 1;   // the fallen are carried home
    this.banked = null;
    this.phase = 'town';
    this.run = null;
    this.encounter = 0;
    this.notice = 'wipe';
    this.state.dungeon.portals = rollPortals(this.rng);
  }
}
