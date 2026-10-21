import { CONDITIONS } from '../data/conditions';
import { favouredRegions, rescuesFor, type Meetable } from '../data/meetings';
import { ITEMS } from '../data/items';
import { capacity, carried, weightOf } from '../data/weights';
import { FLOORS } from '../data/floors';
import { STORY_FIGHT_ROUNDS, createBattle, planEnemies, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { floorOf, newRun, startDepths, terrainOf, type Portal, type Run } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { applyPieces, forcedGlimmers, memoryRng, pieceDrops, pityAfterFloor, type FragmentGain } from './story/memories';
import { ACT_DEPTHS, ACT_NODES, FINALE_BOSS, FINALE_DEPTH, memScene, type SceneId } from '../data/story/scenes';
import { STORY } from '../data/story.zh-TW';
import { PERKS, SHARD_IDS, isFragmentItem, shardGrade, type ShardGrade, type TownFragmentId } from '../data/story/fragments';
import { absorb, fragmentItem, gainOf, hasPerk, lootFragments, returnFragment, sellShards, type AbsorbResult } from './story/fragments';
import { advance, danger, type Danger } from './encounter';
import { ALTAR_STAT_CAP_PCT, altarAt, altarHpLoss, eliteGroup, FOUNTAIN_PCT, POISON_TP_LOSS_PCT, trapDamage, VAULT_CHEST_MULT } from './events';
import { EQUIPMENT } from '../data/equipment';
import { SPECIALS } from '../data/gear';
import { applyAutoJunk, BAG_SIZE, mintUid } from './loot/bag';
import { chestHasGear, GEAR_CHANCE, lootRng, rollBossGear, rollGear, rollRareMaterial, type DropCtx } from './loot/drops';
import { itemWeight, type DropSource } from './loot/item';
import { posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { CHARACTERS } from '../data/characters';
import { MAX_ACTIVE } from './formation';
import { activeIds, awardExp, hasPassive, joinLevel, meet, placeInGrid, setFormation, START_LINEUP, statsOf, type LevelUp, type SetFormationFail } from './party';
import { raiseNode, raiseTalent, swapPair, type RaiseFail, type TalentFail } from './progression';
import { pick, type Rng } from './rng';
import { depthClearExp, depthLevel, encounterGroup } from './scaling';
import { loadGame, saveGame, type SaveStorage } from './save';
import { MAX_REACHED } from './levels';
import { rollPortals } from './portals';
import { nextLead } from './story/leads';
import { afterWin, arrivalScenes, markRead, onReturn, sceneDone, settleBellkeeper, settleOpening } from './story/events';
import { newGame, type GameState } from './state';
import { craftBase, craftItem, craftSet } from './forge/craft';
import type { ForgeResult, RerollOpts } from './forge/cost';
import { dismantle, enhance, fuse, reroll } from './forge/forge';
import { castField, packEquip, packUnequip } from './field';
import { addItem, buy as townBuy, rest as innRest, respec as townRespec, type TownResult } from './town';
import type { CharacterId, GearSlot, ItemInstance, Member, Pos, Slot } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed' | 'lamp' | 'banked';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' }
  /** Stepped into a rescue room: a fight with one extra enemy is on, and winning meets `who`. */
  | { kind: 'rescue'; who: Meetable }
  /** A new floor; `clear` is the depth-clear exp paid for the floor left by the stairs (descend), with who levelled up. */
  | { kind: 'floor'; floor: number; clear?: { exp: number; levelUps: LevelUp[] } }
  /**
   * A chest's materials, and its gear when it holds any (`chestHasGear`). Gear that does not fit stays in the opened chest:
   * `waiting` says why (as a `full` result), and `pickUpHere` takes it once there is room.
   */
  | { kind: 'chest'; item: string; qty: number; gear?: ItemInstance; waiting?: FullResult; fragments?: FragmentGain[] }
  /** Gear that waited in an opened chest or vault, taken now. */
  | { kind: 'pickup'; gear: ItemInstance }
  /** Stepped onto a fountain, merchant, altar or vault: the screen offers its choice (useFountain, buy, altar, openVault). */
  | { kind: 'event'; content: Content }
  | { kind: 'trap'; effect: 'hurt' | 'poison'; amount: number; tp: number }
  | { kind: 'key' }
  /** Stepped onto a glimmer (憶): the memory pieces it held, in order; empty when it held none. */
  | { kind: 'glimmer'; gained: FragmentGain[] }
  /** Stepped onto stairs down: the screen asks first (descend goes). `level` is the next depth's suggested level; `warn` when the party's best is below it; `rescue` while a companion on this floor still waits to be saved. */
  | { kind: 'stairs'; floor: number; level: number; warn: boolean; rescue: boolean }
  | FullResult
  /** An opened vault: its materials always; its gear in `gear`, or in `waiting` when it does not fit (see `chest`). */
  | { kind: 'vault'; loot: Record<string, number>; gear: ItemInstance[]; waiting?: FullResult; fragments?: FragmentGain[] };
/**
 * The pack cannot take the pick-up, which stays where it is until something is discarded. `item`/`qty` are the materials
 * of a chest or vault kept shut for weight (absent when only waiting gear is short); `need` is the weight over the limit
 * (0 when only the bag is short); `gear` is the piece in question; `bag` is set when the town bag (with the run pack's
 * gear) has no slot left for that gear. A bag slot never keeps a chest or vault shut: only its gear waits.
 */
export type FullResult = { kind: 'full'; item?: string; qty?: number; need: number; gear?: ItemInstance; bag?: boolean; fragments?: string[] };
export interface BattleEnd {
  /** `drops` lists only what went into the party's hands. */
  outcome: 'win' | 'lose' | 'fled'; exp: number; gold: number; drops: Record<string, number>;
  levelUps: LevelUp[];
  /** Drops that did not fit in the pack and were left behind. */
  left: Record<string, number>;
  /** Gear that went into the run pack, and gear left behind for want of weight or bag room. */
  gear: ItemInstance[]; gearLeft: ItemInstance[];
  /** A rescue won: the companion met, her join level, and whether she went to the bench for want of a field slot. */
  met?: { id: Meetable; level: number; benched: boolean };
  /** Memory pieces a boss or elite paid, in order; absent when it paid none. */
  fragments?: FragmentGain[];
  /** The part of `gold` that was Liz's left-over coins (plan 8c); absent or 0 when none. */
  coinGold?: number;
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
  /** The rescue room whose fight is on; she is met and the tile turns to floor on a win. */
  private rescueAt: { at: Pos; who: Meetable } | null = null;
  notice: Notice | null = null;
  /** Memory scenes the screen should play now (not saved). */
  pending: SceneId[] = [];
  /** The scenes the town should play on this arrival, in order (not saved: a reload rebuilds it from the queue). */
  arrival: SceneId[] = [];
  /** Whether this arrival's portal reroll is spent (not saved): `boot` sets it, so a reload grants none; `toTown` and `wipe` clear it. */
  private rerolled = false;
  /**
   * Whether Anna has passed on the guild's lead during this stay (6c Task 16): not saved, cleared by `arrive`, so the lead
   * is said once per arrival (or reload) and later visits get her usual greeting.
   */
  leadSaid = false;
  /** Which ending the clear screen is for; set on entering `clear`, dropped by restartAfterClear. */
  cleared: 'act1' | 'finale' | null = null;
  /** The finale's own scenes, once it is won (not saved): any act still owed, the bellkeeper's arrival if it waits, then the hero's memories in piece order (`finalePieces`). `finale` follows them. */
  finale: { pieces: SceneId[] } | null = null;
  /** The party stepped onto the finale's boss before Rin made her choice: no fight, and the map says why (not saved). */
  finaleWaiting = false;
  /** What the last safe return brought home; the town screen shows it, then clears it. `overflow` is gear the full bag could not take. */
  banked: { items: Record<string, number>; gold: number; viaLamp: boolean; gear: ItemInstance[]; overflow: ItemInstance[] } | null = null;

  /** `forgeSalt` is used only when there is no `state` (a new game); a loaded game keeps the salt in its save. */
  constructor(readonly rng: Rng, readonly storage: SaveStorage | null, state?: GameState, forgeSalt = 0, start?: CharacterId[]) {
    this.state = state ?? newGame(rng, forgeSalt, start);
  }

  static boot(rng: Rng, storage: SaveStorage | null, forgeSalt = 0): Game {
    if (!storage) {
      const g = new Game(rng, null, undefined, forgeSalt, START_LINEUP);
      g.arrival = arrivalScenes(g.state, { chat: false });
      return g;
    }
    const r = loadGame(storage);
    // A save from before the opening scenes (Task 10b) or the bellkeeper's arrival (continuity fix 4) is past them: they
    // count as seen and never replay late.
    const g = new Game(rng, storage, r.status === 'ok' ? settleBellkeeper(settleOpening(r.state)) : undefined, forgeSalt, START_LINEUP);
    if (r.status === 'corrupt' || r.status === 'version') g.notice = 'save-reset';
    g.rerolled = true;
    g.arrival = arrivalScenes(g.state, { chat: false });
    return g;
  }

  /** A new game that replaces the save at once: the player agreed to overwrite it, and a wipe must not bring the old run back. */
  static fresh(rng: Rng, storage: SaveStorage | null, forgeSalt = 0): Game {
    const g = new Game(rng, storage, undefined, forgeSalt, START_LINEUP);
    if (storage) saveGame(storage, g.state);
    g.arrival = arrivalScenes(g.state, { chat: false });
    return g;
  }

  map(floor = this.floor): FloorMap {
    if (!this.run) throw new Error('no run in progress');
    const m = floorOf(this.run, floor).map;
    // Once Act 1 is cleared, its room on later mainline runs holds stairs down (a rematch comes later).
    if (m.boss && this.state.story.act1Cleared && this.isStoryDepth(floor)) openStairs(m);
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
    this.run = newRun(Math.floor(this.rng() * 2 ** 31), portal.region, portal.condition, startDepth, rescuesFor(portal.region, this.state.party.recruited));
    this.pending = [];
    this.finale = null;
    if (this.state.story.fed) {   // Marta's meal counts against the altar cap like any altar buff, and is eaten
      this.run.altarBuffs.push({ ...PERKS.meal });
      this.state.story.fed = false;
    }
    this.floor = startDepth;
    this.forceGlimmers(startDepth);
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
    this.finaleWaiting = false;
    const r = step(this.map(), this.pos, dir);
    if (!r.moved) return { kind: 'blocked' };
    this.pos = r.pos;
    this.revealHere();
    switch (r.tile) {
      case 'down': return this.stairs();
      case 'entrance': return { kind: 'entrance' };
      case 'boss':
        // The mainline story boss stays as written; every other boss is the 燈喰之獸 grown by depth and region.
        if (this.isFinaleFight() && !this.state.party.roster.rin?.oath) { this.finaleWaiting = true; return { kind: 'moved' }; }
        if (this.isFinaleFight()) this.startBattle([FINALE_BOSS.base], true, true, undefined, 0, { names: { [FINALE_BOSS.base]: STORY.finaleBossName }, bossPower: FINALE_BOSS.power });
        else this.startBattle(['lanterneater'], true, !this.isStoryDepth(this.floor));
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      case 'fountain': return this.run!.usedFountain ? this.walk() : this.eventHere();
      case 'altar': return this.run!.opened.has(this.spotId()) ? this.walk() : this.eventHere();
      case 'merchant': return this.eventHere();
      // An opened vault still on the map holds gear that did not fit: stepping on it again offers that gear.
      case 'vault': return this.run!.opened.has(this.spotId()) ? this.takeWaiting() ?? this.walk() : this.eventHere();
      case 'trap': return this.springTrap();
      case 'glimmer': return this.glimmerHere() ?? this.walk();
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
      case 'rescue': {
        const c = floorOf(this.run!, this.floor).contents.find((x) => x.kind === 'rescue' && x.at.x === this.pos.x && x.at.y === this.pos.y);
        if (!c?.who) return this.walk();
        const group = encounterGroup(this.run!.region, this.floor, this.rng);
        if (c.who === 'scarlet') this.startBattle(['scarlet-foe', ...group], false, true, undefined, 1, { survive: STORY_FIGHT_ROUNDS, names: { 'scarlet-foe': CHARACTERS.scarlet.name } });   // her story fight: last it out
        else this.startBattle([...group, group[0]], false, true, undefined, 1);
        this.rescueAt = { at: { ...this.pos }, who: c.who };
        return { kind: 'rescue', who: c.who };
      }
      default: return this.walk();
    }
  }

  /**
   * The glimmer under the party: its pieces are taken, and the spot turns to plain floor. A glimmer with no piece for anyone
   * leaves one ownerless shard instead, rolled once and kept in `run.rolls`; with no room for it the glimmer stays and the
   * shard waits. Null when the content is gone.
   */
  private glimmerHere(): MoveResult | null {
    const run = this.run!;
    const here = floorOf(run, this.floor);
    const i = here.contents.findIndex((c) => c.kind === 'glimmer' && c.at.x === this.pos.x && c.at.y === this.pos.y);
    if (i < 0) { this.map().tiles[this.pos.y][this.pos.x] = 'floor'; return null; }   // no content behind the tile: drop the stale marker
    const c = here.contents[i];
    const memoKey = `frag:glimmer:${this.spotId()}`;
    const kept = run.rolls[memoKey];   // kept only when the pieces were already rolled empty
    const rng = kept ? null : memoryRng(run);
    const ids = rng ? pieceDrops(this.state.party, this.state.story.pity, { region: run.region, depth: this.floor, source: 'glimmer', who: c.owner }, rng) : [];
    if (ids.length > 0) {
      here.contents.splice(i, 1);
      this.map().tiles[this.pos.y][this.pos.x] = 'floor';
      return { kind: 'glimmer', gained: this.takePieces(ids) };
    }
    const memo = kept ?? (run.rolls[memoKey] = { item: '', qty: 0, frags: [SHARD_IDS[shardGrade(this.floor, rng!())]] });
    const item = memo.frags![0];
    const short = this.shortBy({ [item]: 1 });
    if (short > 0) return { kind: 'full', item, qty: 1, need: short };
    delete run.rolls[memoKey];
    here.contents.splice(i, 1);
    this.map().tiles[this.pos.y][this.pos.x] = 'floor';
    this.grant(item, 1);
    return { kind: 'glimmer', gained: [gainOf(item)!] };
  }

  /** Gives each chain in `ids` its next piece, in order, and works out which memory scenes play now, wait in the handbook, or queue. */
  private takePieces(ids: CharacterId[], topUp = false, finale = false): FragmentGain[] {
    if (ids.length === 0) return [];
    const run = this.run!;
    const story = this.state.story;
    const applied = applyPieces(this.state.party, ids);
    this.state.party = applied.party;
    (run.dropped[this.floor] ??= []).push(...ids);
    for (const id of ids) story.pity[id] = 0;   // a piece resets its chain's count now, so leaving the floor any way keeps it
    return applied.gained.map(({ id, n }) => {
      const scene = memScene(id, n);
      if (finale && id === 'hero') return { kind: 'piece' as const, id, n, play: false };   // the finale plays these itself: neither queued nor seen
      let play = false;
      // A top-up (and anyone else's piece in the finale fight) waits in the queue for the next return to town.
      if (topUp || finale) story.queue.push(scene);
      else if (!run.played.includes(this.floor)) { play = true; run.played.push(this.floor); this.pending.push(scene); }
      else {
        if (!story.seen.includes(scene)) story.seen.push(scene);
        if (!story.fresh.includes(scene)) story.fresh.push(scene);
      }
      return { kind: 'piece' as const, id, n, play };
    });
  }

  /** Before a depth is first made, fix the chains whose glimmer on it must hold their piece. */
  private forceGlimmers(floor: number): void {
    const run = this.run!;
    if (run.floors.has(floor)) return;
    run.glimmers[floor] = forcedGlimmers(this.state.party, this.state.story.pity, run.region, floor);
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
    if (t === 'glimmer') return this.glimmerHere();
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
    const frags = this.spotFragments(id, 'vault');
    for (const g of frags) loot[fragmentItem(g)!] = 1;
    const rareKey = `vault-rare:${id}`;
    if (!run.rolls[rareKey]) run.rolls[rareKey] = { item: rollRareMaterial(lootRng(run)), qty: 1 };
    const rare = run.rolls[rareKey];
    loot[rare.item] = (loot[rare.item] ?? 0) + rare.qty;
    const gear = this.fixedGear(`vault:${id}`, 'vault');
    const shut = this.shutFor(loot, gear);
    if (shut) return shut;
    run.opened.add(id);
    delete run.rolls[`frag:${id}`];
    for (const [item, qty] of Object.entries(loot)) this.grant(item, qty);
    const extra = frags.length ? { fragments: frags } : {};
    const r = this.offerGear(id, gear);
    if (r.waiting) return { kind: 'vault', loot, gear: [], waiting: r.waiting, ...extra };
    this.map().tiles[at.y][at.x] = 'floor';
    return { kind: 'vault', loot, gear: [r.gear!], ...extra };
  }

  /**
   * Why a chest or vault stays shut: only when its materials are over the weight limit. `need` then also counts the gear,
   * when the bag has a slot for it, so one round of discarding can take both.
   */
  private shutFor(loot: Record<string, number>, gear?: ItemInstance): FullResult | null {
    if (this.shortBy(loot) <= 0) return null;
    const [item, qty] = Object.entries(loot)[0];
    const withGear = gear && this.bagHasRoom(1) ? [gear] : [];
    const frags = Object.keys(loot).filter(isFragmentItem);
    return { kind: 'full', item, qty, need: this.shortBy(loot, withGear), ...(gear ? { gear: this.junkMarked(gear) } : {}), ...(frags.length ? { fragments: frags } : {}) };
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
    const story = this.state.story;
    story.pity = pityAfterFloor(this.state.party, story.pity, this.run.region, this.floor, this.run.dropped[this.floor] ?? []);
    const floor = this.changeFloor(this.floor + 1);
    return gained ? { ...floor, clear: { exp, levelUps: awarded!.results.filter((x) => x.levels > 0) } } : floor;
  }

  private stairs(): MoveResult {
    const floor = this.floor + 1;
    const level = depthLevel(floor);
    const best = Math.max(...activeIds(this.state.party).map((id) => this.state.party.roster[id].level));
    const waiting = floorOf(this.run!, this.floor).contents.some((c) => c.kind === 'rescue' && c.who && !this.state.party.recruited.includes(c.who));
    return { kind: 'stairs', floor, level, warn: best < level, rescue: waiting };
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
    const rescue = this.rescueAt;
    this.rescueAt = null;
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
    // Rin's first won fight queues the first-return scene for the next arrival (Task 10b).
    this.state.story = afterWin(this.state.story, b.party.map((c) => c.key));
    if (elite) this.map().tiles[elite.y][elite.x] = 'floor';   // a beaten elite is gone
    let met: BattleEnd['met'];
    if (rescue) {
      // She joins after the exp is shared, so the fight's exp is not hers, at the level the party that won has earned.
      const level = joinLevel(this.state.party, this.floor);
      this.state.party = meet(this.state.party, rescue.who, level);
      this.map().tiles[rescue.at.y][rescue.at.x] = 'floor';
      const here = floorOf(this.run!, this.floor);
      here.contents = here.contents.filter((c) => !(c.kind === 'rescue' && c.at.x === rescue.at.x && c.at.y === rescue.at.y));   // she is met: no marker stays
      met = { id: rescue.who, level, benched: !activeIds(this.state.party).includes(rescue.who) };
    }
    // Memory pieces come after exp and the meeting, and before the phase can switch to clear (the story boss pays too).
    let fragments: FragmentGain[] = [];
    const finale = b.boss && this.isFinaleFight();
    if (b.boss || elite) {
      const run = this.run!;
      const source = b.boss ? 'boss' : 'elite';
      const rng = memoryRng(run);
      const ids = pieceDrops(this.state.party, this.state.story.pity, { region: run.region, depth: this.floor, source }, rng);
      const topUp = b.boss && run.region === 'mainline' && this.floor === 25 && ids.every((id) => id === 'hero');
      fragments = this.takePieces(ids, topUp, finale);
      if (finale) this.finale = { pieces: this.finalePieces(fragments) };
      // Ownerless and townsfolk fragments ride in the run pack like materials; one that does not fit is left behind.
      for (const gain of lootFragments(this.state, run, { region: run.region, depth: this.floor, source }, rng)) {
        const item = fragmentItem(gain)!;
        if (this.shortBy({ [item]: 1 }) > 0) left[item] = (left[item] ?? 0) + 1;
        else this.grant(item, 1);
        fragments.push(gain);
      }
    }
    if (b.boss) openStairs(this.map());   // a beaten boss leaves stairs down where it stood, so the run can go deeper
    if (finale) {
      // The act-one flag rides along, so a game that skipped straight to the end still writes a save that loads.
      this.state.story.finaleCleared = true;
      this.state.story.act1Cleared = true;
      this.cleared = 'finale';
      this.phase = 'clear';
    }
    else if (b.boss && this.isStoryDepth(this.floor)) {
      const story = this.state.story;
      story.act1Cleared = true;
      if (!story.queue.includes('act1-after') && !story.seen.includes('act1-after')) story.queue.push('act1-after');
      this.cleared = 'act1';
      this.phase = 'clear';
    }
    else this.phase = 'map';
    return { battle: b, end: { outcome: 'win', ...rw, drops: taken, levelUps: awarded.results.filter((x) => x.levels > 0), left, gear, gearLeft, ...(met ? { met } : {}), ...(fragments.length ? { fragments } : {}) } };
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
      if (b.survive && b.enemies[i].alive) continue;
      const rng = lootRng(run);
      if (rng() < GEAR_CHANCE.monster) gear.push(rollGear(rng, this.dropCtx('monster')));
    }
    return { gear, rare };
  }

  private dropCtx(source: DropSource): DropCtx {
    const run = this.run!;
    return { uid: () => mintUid(this.state), depth: this.floor, region: run.region, condition: run.condition, source, seed: run.seed };
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
    const r = raiseNode(this.state.party.roster[id], node);
    if (!r.ok) return r;
    const party = this.state.party;
    this.state = { ...this.state, party: { ...party, roster: { ...party.roster, [id]: r.member } } };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * A recruited member's pair changes side for free (plan 8d; the rules: progression `swapPair`): in town and the labyrinth's
   * field, never in battle. Saved like `raiseNode`: at once in town, at the next town save in the labyrinth.
   */
  swapVariant(id: CharacterId, node: string): { ok: true } | { ok: false; reason: 'unknown' | 'empty' | 'invalid' } {
    if ((this.phase !== 'town' && this.phase !== 'map') || !this.state.party.recruited.includes(id)) return { ok: false, reason: 'invalid' };
    const r = swapPair(this.state.party.roster[id], node);
    if (!r.ok) return r;
    const party = this.state.party;
    this.state = { ...this.state, party: { ...party, roster: { ...party.roster, [id]: r.member } } };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * A new formation (the rules: party `setFormation`, which keeps the hero on the field). Saved like `raiseNode`: at once
   * in town; in the labyrinth it counts at once and is saved at the next town save. In the labyrinth only the rows move:
   * the bench is in town, so who is on the field must stay the same (`lineup`).
   */
  setFormation(grid: (CharacterId | null)[]): { ok: true } | { ok: false; reason: SetFormationFail | 'invalid' | 'lineup' } {
    if (this.phase !== 'town' && this.phase !== 'map') return { ok: false, reason: 'invalid' };
    if (this.phase === 'map') {
      const now = new Set(activeIds(this.state.party));
      const next = new Set(grid.filter((id): id is CharacterId => id !== null));
      if (next.size !== now.size || [...next].some((id) => !now.has(id))) return { ok: false, reason: 'lineup' };
    }
    const r = setFormation(this.state.party, grid);
    if (!r.ok) return r;
    this.state = { ...this.state, party: r.party };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * A recovery skill cast outside battle (the rules: field `castField`): on the map only, at the battle's TP price, with
   * no draw from any rng. Like a tree spend in the labyrinth it counts at once and is saved with the run's progress at the
   * next town save.
   */
  castInField(caster: CharacterId, skill: string, target?: CharacterId): ReturnType<typeof castField> | { ok: false; reason: 'phase' } {
    if (this.phase !== 'map' || !this.run) return { ok: false, reason: 'phase' };
    const r = castField(this.state, { caster, skill, target, depth: this.floor });
    if (r.ok) this.state = r.state;
    return r;
  }

  /**
   * Wears a piece from the run pack (the rules: field `packEquip`), on the map only; what the slot held goes back into the
   * pack. A special worn this way enters the codex at once, as banking it would (it never passes through the bag). Not
   * saved, like a cast in the field. Draws nothing.
   */
  equipFromPack(member: CharacterId, uid: number, slot?: Slot): { ok: true } | { ok: false; reason: 'phase' | 'invalid' | 'stock' | 'heavy' } {
    if (this.phase !== 'map' || !this.run) return { ok: false, reason: 'phase' };
    const r = packEquip(this.state, this.run.loot.gear, member, uid, slot);
    if (!r.ok) return r;
    if (this.packHeavier(r.state, r.pack)) return { ok: false, reason: 'heavy' };
    const worn = this.run.loot.gear.find((it) => it.uid === uid)!;
    this.state = r.state;
    this.run.loot.gear = r.pack;
    this.enterCodex(worn);
    return { ok: true };
  }

  /** Takes off a piece into the run pack (the rules: field `packUnequip`), on the map only. Not saved. Draws nothing. */
  unequipToPack(member: CharacterId, slot: Slot): { ok: true } | { ok: false; reason: 'phase' | 'invalid' | 'full' | 'heavy' } {
    if (this.phase !== 'map' || !this.run) return { ok: false, reason: 'phase' };
    const r = packUnequip(this.state, this.run.loot.gear, member, slot);
    if (!r.ok) return r;
    if (this.packHeavier(r.state, r.pack)) return { ok: false, reason: 'heavy' };
    this.state = r.state;
    this.run.loot.gear = r.pack;
    return { ok: true };
  }

  /**
   * Whether a gear change leaves the party over the weight limit and further over than before. Worn gear weighs nothing
   * and the pack's does, and strength on gear moves the limit; being over only stops pick-ups, so a change that lightens
   * the load is allowed even while still over.
   */
  private packHeavier(state: GameState, pack: ItemInstance[]): boolean {
    const run = this.run!;
    const over = (s: GameState, gear: ItemInstance[]) => carried(s, { ...run, loot: { ...run.loot, gear } }) - capacity(s.party);
    const before = over(this.state, run.loot.gear);
    const after = over(state, pack);
    return after > 0 && after > before;
  }

  /**
   * The guild recalls a companion already met: town only. `id` must be met, not the hero, and not on the field. With room on
   * the field she takes her own row (`out` is ignored); on a full field `out` (on the field, never the hero) steps out and
   * she takes the cell. Saved at once.
   */
  recall(id: CharacterId, out?: CharacterId): { ok: true } | { ok: false; reason: 'invalid' } {
    const party = this.state.party;
    const invalid = { ok: false, reason: 'invalid' } as const;
    if (this.phase !== 'town' || id === 'hero' || !party.recruited.includes(id) || party.grid.includes(id)) return invalid;
    let grid: (CharacterId | null)[];
    if (activeIds(party).length < MAX_ACTIVE) grid = placeInGrid(party.grid, id, CHARACTERS[id].row);
    else {
      if (!out || out === 'hero' || !party.grid.includes(out)) return invalid;
      grid = party.grid.map((c) => (c === out ? id : c));
    }
    this.state = { ...this.state, party: { ...party, grid } };
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /** The guild buys shards (it never sells them): town only, saved at once. */
  sellShards(grade: ShardGrade, qty: number): TownResult {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = this.apply(sellShards(this.state, grade, qty));
    if (r.ok && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return r;
  }

  /**
   * Gives townsfolk fragment `id` back to its owner: town only, saved at once so a reload can neither undo the reward nor
   * claim it again. The owner's scene is queued for the screen to play.
   */
  returnFragment(id: TownFragmentId): TownResult {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = this.apply(returnFragment(this.state, id));
    if (!r.ok) return r;
    this.pending.push(`town:${id}`);
    // Queued and saved with the reward: a reload mid-scene plays it on arrival, and nothing can lose it for good.
    const scene: SceneId = `town:${id}`;
    if (!this.state.story.queue.includes(scene) && !this.state.story.seen.includes(scene)) this.state.story.queue.push(scene);
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return r;
  }

  /** Whether Glen's perk offers a portal reroll now: town, his fragment home, and this arrival's reroll unspent. */
  canReroll(): boolean {
    return this.phase === 'town' && !this.rerolled && hasPerk(this.state, 'portal-reroll');
  }

  /**
   * Glen's reroll: new portals once per arrival, saved at once. The one player-chosen draw from `game.rng` (the stream
   * `toTown` rolls portals with). The mark is not saved; `boot` sets it, so reloading never grants another.
   */
  rerollPortals(): boolean {
    if (!this.canReroll()) return false;
    this.state.dungeon.portals = rollPortals(this.rng, favouredRegions(this.state.party.recruited), nextLead(this.state)?.region);
    this.rerolled = true;
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return true;
  }

  /** One shard into a member who was met: town only, saved at once so a reload cannot re-roll the gain. */
  absorb(id: CharacterId, grade: ShardGrade): AbsorbResult {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = absorb(this.state, id, grade);
    if (!r.ok) return r;
    this.state = r.state;
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return r;
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
    const afterFinale = this.cleared === 'finale';   // B1: the return right after the ending plays no banter
    this.cleared = null;
    this.finale = null;
    this.toTown(false, afterFinale);   // the clear banks the run pack like any safe return
  }

  /**
   * A scene is over. It must be due: on this arrival, waiting in `pending` (a dungeon memory, a returned fragment) or, for the
   * finale, one of its own scenes. It leaves that list and the story queue; town saves at once.
   */
  sceneDone(id: SceneId, how: 'played' | 'skipped' | 'auto'): boolean {
    const due = this.arrival.includes(id) || this.pending.includes(id) || (this.finale !== null && (id === 'finale' || this.finale.pieces.includes(id)));
    if (!due) return false;
    this.arrival = this.arrival.filter((s) => s !== id);
    this.pending = this.pending.filter((s) => s !== id);
    this.state = sceneDone(this.state, id, how);
    this.saveInTown();
    return true;
  }

  /** The handbook opened a scene: it is no longer new. Town saves at once. */
  markRead(id: SceneId): void {
    this.state = markRead(this.state, id);
    this.saveInTown();
  }

  private saveInTown(): void {
    if (this.phase === 'town' && this.storage && !saveGame(this.storage, this.state)) this.notice = 'save-failed';
  }

  /** What a return to town queues: acts reached, Rin's reveal; then the arrival, with one chat and one banter (B1). */
  private arrive(afterFinale = false): void {
    this.state.story = onReturn(this.state);
    this.arrival = arrivalScenes(this.state, { chat: true, afterFinale });
    this.leadSaid = false;
  }

  /** The main road's depth 30 boss is the finale until it has been beaten once (spec §8.4); after that it is an ordinary boss. */
  private isFinaleFight(): boolean {
    return this.run?.region === 'mainline' && this.floor === FINALE_DEPTH && !this.state.story.finaleCleared;
  }

  /**
   * The scenes the finale plays before itself, in story order. First every act still owed (continuity fix 1): one held back
   * by Rin's reveal, or one reached on this dive and never brought home; an act must never play after the ending. Then the
   * bellkeeper's arrival if it still waits (the finale hands her bell to him; continuity fix 4). Then the hero pieces this
   * fight filled in and any still waiting in the queue from an earlier floor (depth 25's top-up), in piece order. What is
   * taken leaves the queue, so the town does not play it again.
   */
  private finalePieces(gained: FragmentGain[]): SceneId[] {
    const story = this.state.story;
    const reached = this.state.dungeon.reached.mainline;
    const acts = ACT_NODES.filter((node) => !story.seen.includes(node) && (story.queue.includes(node) || reached >= ACT_DEPTHS[node]));
    for (const node of acts) if (!story.nodes.includes(node)) story.nodes.push(node);
    const keeper: SceneId[] = story.queue.includes('bellkeeper-arrives') ? ['bellkeeper-arrives'] : [];
    const heroNo = (id: SceneId) => Number(id.slice('mem:hero:'.length));
    const queued = story.queue.filter((id) => id.startsWith('mem:hero:'));
    const taken = new Set<SceneId>([...acts, ...keeper]);
    story.queue = story.queue.filter((id) => !id.startsWith('mem:hero:') && !taken.has(id));
    const filled = gained.flatMap((g) => (g.kind === 'piece' && g.id === 'hero' ? [memScene('hero', g.n)] : []));
    return [...acts, ...keeper, ...[...new Set([...queued, ...filled])].sort((a, b) => heroNo(a) - heroNo(b))];
  }

  /** The mainline's depth 3 holds the story boss: beating it ends Act 1. */
  private isStoryDepth(floor: number): boolean {
    return this.run?.region === 'mainline' && floor === 3;
  }

  /**
   * A safe return: what the run pack holds now counts, and the town is told what came home. Gear goes into the bag while it
   * has slots (the rest is reported as `overflow`); special items and their sets enter the codex.
   */
  private toTown(viaLamp = false, afterFinale = false): void {
    this.finaleWaiting = false;
    const loot = this.run?.loot;
    this.banked = null;
    if (loot && (loot.gold > 0 || Object.keys(loot.items).length || loot.gear.length)) {
      for (const [id, n] of Object.entries(loot.items)) addItem(this.state.inventory, id, n);
      this.state.gold += loot.gold;
      const room = Math.max(0, BAG_SIZE - this.state.bag.length);
      const gear = loot.gear.slice(0, room);
      this.state.bag.push(...gear);
      for (const it of gear) this.enterCodex(it);
      this.banked = { items: { ...loot.items }, gold: loot.gold, viaLamp, gear, overflow: loot.gear.slice(room) };
      this.notice = 'banked';
    }
    this.phase = 'town';
    this.pending = [];
    this.encounter = 0;
    this.run = null;
    this.state.dungeon.portals = rollPortals(this.rng, favouredRegions(this.state.party.recruited), nextLead(this.state)?.region);
    this.rerolled = false;
    this.arrive(afterFinale);
  }

  /** A special piece and its set enter the codex once: when banked, or when worn from the run pack. */
  private enterCodex(it: ItemInstance): void {
    const sp = it.special ? SPECIALS[it.special] : undefined;
    for (const id of [sp?.id, sp?.set]) if (id && !this.state.codex.includes(id)) this.state.codex.push(id);
  }

  private revealHere(): void {
    const run = this.run!;
    run.explored[this.floor] = reveal(run.explored[this.floor] ?? [], this.map(), this.pos, CONDITIONS[run.condition].sight);
  }

  private changeFloor(floor: number): { kind: 'floor'; floor: number } {
    const region = this.run!.region;
    this.floor = floor;
    this.forceGlimmers(floor);
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

  /** The fragments a chest or vault at spot `id` holds: rolled once from the memory stream, kept in `run.rolls` until the spot pays them out. */
  private spotFragments(id: string, source: 'chest' | 'vault'): FragmentGain[] {
    const run = this.run!;
    const key = `frag:${id}`;
    const memo = run.rolls[key] ?? (run.rolls[key] = {
      item: '', qty: 0,
      frags: lootFragments(this.state, run, { region: run.region, depth: this.floor, source }, memoryRng(run)).map((g) => fragmentItem(g)!),
    });
    return memo.frags!.map((f) => gainOf(f)!);
  }

  private openChest(): MoveResult | null {
    const run = this.run!;
    const id = this.spotId();
    if (run.opened.has(id)) return this.takeWaiting();
    if (!FLOORS[this.terrain() - 1].chestLoot.length) return null;
    const { item, qty } = this.rollChest(`chest:${id}`);
    const gear = chestHasGear(run, this.floor, this.pos) ? this.fixedGear(`chest:${id}`, 'chest') : undefined;
    const frags = this.spotFragments(id, 'chest');
    const loot: Record<string, number> = { [item]: qty };
    for (const g of frags) loot[fragmentItem(g)!] = 1;
    const shut = this.shutFor(loot, gear);
    if (shut) return shut;
    run.opened.add(id);
    delete run.rolls[`frag:${id}`];
    for (const [it, n] of Object.entries(loot)) this.grant(it, n);
    const extra = frags.length ? { fragments: frags } : {};
    if (!gear) return { kind: 'chest', item, qty, ...extra };
    return { kind: 'chest', item, qty, ...extra, ...this.offerGear(id, gear) };
  }

  private startBattle(enemyIds: string[], boss: boolean, scaled = true, elite?: string, extra = 0, opts: { survive?: number; names?: Record<string, string>; bossPower?: number } = {}): void {
    const scale = scaled && this.run ? { depth: this.floor, region: this.run.region, condition: this.run.condition, elite } : undefined;
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed, scale, depth: this.floor, altar: this.run?.altarBuffs, extra, ...opts });
    planEnemies(this.battle, this.rng);
    this.phase = 'battle';
  }

  private wipe(): void {
    // Levels and exp stay, the run pack is lost and a quarter of the gold goes; the inn save is not read back.
    this.state.gold = Math.floor(this.state.gold * 0.75);
    for (const m of Object.values(this.state.party.roster)) if (m.hp <= 0) m.hp = 1;   // the fallen are carried home
    this.banked = null;
    this.phase = 'town';
    this.pending = [];
    this.run = null;
    this.encounter = 0;
    this.notice = 'wipe';
    this.state.dungeon.portals = rollPortals(this.rng, favouredRegions(this.state.party.recruited), nextLead(this.state)?.region);
    this.rerolled = false;
    this.arrive();
  }
}
