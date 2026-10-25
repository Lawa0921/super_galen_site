import { CONDITIONS } from '../data/conditions';
import { favouredRegions, rescuesFor, type Meetable } from '../data/meetings';
import { ITEMS } from '../data/items';
import { capacity, carried, weightOf } from '../data/weights';
import { FLOORS } from '../data/floors';
import { STORY_FIGHT_ROUNDS, createBattle, planEnemies, resolveRound, rewards, writeBack, type Action, type BattleScale, type BattleState, type Difficulty } from './battle';
import { floorOf, newRun, startDepths, terrainOf, type Portal, type Run } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { applyPieces, forcedGlimmers, memoryRng, pieceDrops, pityAfterFloor, type FragmentGain } from './story/memories';
import { ACT_DEPTHS, ACT_NODES, ALONE, DEPARTURE_SCENES, FINALE_BOSS, FINALE_DEPTH, isNightSlot, memScene, type SceneId } from '../data/story/scenes';
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
import { grantRune, rollRune, runeRng, spotRuneRng } from './loot/runes';
import { RUNE_DROP } from '../data/runeEconomy';
import { tierOf } from '../data/difficulty';
import { bossKey, rollAffixes, rollCrowdAffix, tierUnlocked } from './tiers';
import { buyRune, fuseRunes, sellRunes, type RuneTradeFail } from './runeTrade';
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
import { afterWin, arrivalScenes, calendarOf, markRead, onReturn, sceneDone, settleBellkeeper, settleOpening } from './story/events';
import { NIGHT_BEATS, type ScriptLine } from '../data/story.zh-TW';
import { DAWN_BACKLOG, dawnMemory, eveMemories, nextBeat, orderNight, planNight, restoreNight } from './story/nights';
import { SPRING_AFTER, dayOf, nextDay } from './calendar';
import { newGame, type GameState } from './state';
import { craftBase, craftItem, craftSet } from './forge/craft';
import type { ForgeFail, RerollOpts } from './forge/cost';
import { dismantle, enhance, fuse, reroll } from './forge/forge';
import { castField, packEquip, packUnequip } from './field';
import { moveRune, socketRune, unsocketRune, type SocketAt, type SocketFail } from './sockets';
import type { RuneRef } from '../data/runes';
import { addItem, buy as townBuy, rest as innRest, respec as townRespec, type TownResult } from './town';
import { applyBuild, applyCost, followUp } from './builds';
import { addField, bondOf, giveGift, inDanger, nextBond, talkPoints, today, type GiveResult } from './story/bond';
import { BOND_CAP, type Companion, type Tone } from '../data/story/bond';
import { FIELD_POINTS } from '../data/story/bond';
import type { CharacterId, GearSlot, ItemInstance, Member, Pos, Slot } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed' | 'lamp' | 'banked' | 'tree-reworked';
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
  | ({ kind: 'chest'; item: string; qty: number; gear?: ItemInstance; waiting?: FullResult; fragments?: FragmentGain[] } & RuneFind)
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
  | ({ kind: 'vault'; loot: Record<string, number>; gear: ItemInstance[]; waiting?: FullResult; fragments?: FragmentGain[] } & RuneFind);
/** A rune paid as gold: the player already owned RUNE_STACK of it (plan 8f ruling 7). The gold went straight to `state.gold`. */
export interface RuneGold { rune: RuneRef; gold: number }
/** The rune a chest or vault held (plan 8f): `rune` went into the bag, or `runeGold` says it was paid as gold. */
export type RuneFind = { rune?: RuneRef; runeGold?: RuneGold };
/** A rune a fight paid as gold; `at` is its place among the fight's runes, found and paid together (drop order). */
export interface BattleRuneGold extends RuneGold { at: number }
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
  /** Runes the fight dropped into the bag, in order (plan 8f); absent when none. */
  runes?: RuneRef[];
  /** Runes paid as gold for want of room (RUNE_STACK); their gold is in `state.gold`, not in `gold` or the run pack. */
  runeGold?: BattleRuneGold[];
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
  /** Bond plan ruling 3: who this fight has seen out of danger (at its start or after a round). Not saved. */
  private safeSeen = new Set<CharacterId>();
  /** Bond plan ruling 3: who dropped into danger during this fight, from out of it (`safeSeen`). Not saved. */
  private endangered = new Set<CharacterId>();
  /** Bond plan Task 8: the pending bond scenes whose choice has counted (once each). Not saved. */
  private choiceCounted = new Set<SceneId>();
  /**
   * The tier the fight on now is played and paid at (difficulty plan ruling 17): the run's at `startBattle`, none for a
   * story fight or a Normal run. The fight's scale, affixes, gear, runes and boss-kill key read it, never `run.difficulty`;
   * the fight's end clears it.
   */
  private fightTier: Difficulty | undefined = undefined;
  notice: Notice | null = null;
  /**
   * Who stopped following their builds since the town last said so, in order (plan 8h Task 6): a queue of its own, so a
   * later notice ('banked') never drops it. The town reads and empties it.
   */
  followEnded: CharacterId[] = [];
  /** Scenes the screen should play now (not saved): a returned townsfolk fragment. A memory never waits here (story L). */
  pending: SceneId[] = [];
  /** The scenes the town should play on this arrival, in order (not saved: a reload rebuilds it from the queue). */
  arrival: SceneId[] = [];
  /**
   * Story L spec §4.5, §4.6: this return's night, the memories the town tells after the day's notices, in order. Not saved:
   * `story.tonight` keeps the picks, and a reload rebuilds it from what tonight still holds untold.
   */
  night: SceneId[] = [];
  /**
   * Story L spec §4.8: the eve's memories, up to three companions' (`eveMemories`), picked when its line is said on a
   * departure, or by the finale's fallback. Not saved: a reload after the line leaves them untold.
   */
  eve: SceneId[] = [];
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

  /**
   * `previous`: the game this boot replaces (the page boots once for the title, then again on 繼續). A rework notice it
   * still owes carries over: its boot already saved the migrated game, so this boot reads version 9 and would say nothing.
   */
  static boot(rng: Rng, storage: SaveStorage | null, forgeSalt = 0, previous?: Game): Game {
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
    // An older save brought up to this version: the trees were respent on the standard build (plan 8d), so say so once,
    // and save the result at once (only a clean migration; loadGame has already kept the old text in V8_KEY), so the
    // next load is version 9 and the free respec is not handed out again.
    if (r.status === 'ok' && r.migrated) {
      g.notice = 'tree-reworked';
      saveGame(storage, g.state);
    }
    if (r.status === 'ok' && previous?.notice === 'tree-reworked') g.notice = 'tree-reworked';
    g.rerolled = true;
    const day = arrivalScenes(g.state, { chat: false });
    // Story L spec §4.6: the night is not picked again; what tonight still holds untold plays, the owed ones first. A
    // group scene the reaction slot holds again leads the night (spec §5.3).
    const plan = restoreNight(g.state, day);
    g.arrival = [...plan.before, ...day.filter((id) => !isNightSlot(id))];
    g.night = orderNight([...day.filter(isNightSlot), ...plan.night]);
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

  /** Why a departure through `portal` at `startDepth` would be refused, or null when it may go (story depth plan ruling 7). */
  departCheck(portal: Portal, startDepth: number): 'locked' | 'party-down' | 'phase' | null {
    if (this.phase !== 'town') return 'phase';
    if (!startDepths(portal.region, this.state.dungeon.reached[portal.region]).includes(startDepth)) return 'locked';
    if (!activeIds(this.state.party).some((id) => this.state.party.roster[id].hp > 0)) return 'party-down';
    return null;
  }

  /**
   * The scenes a departure plays first, in order, in town and with no scene that plays alone waiting; the others keep
   * waiting for a later departure. Story L spec §4.8: the night before the descent, whenever it is queued; then the lone
   * morning (story depth plan ruling 6), once his ninth piece and the bellkeeper's arrival are both seen.
   */
  departScenes(): SceneId[] {
    const story = this.state.story;
    if (this.phase !== 'town') return [];
    const ready = (id: SceneId): boolean => id !== 'hero-alone' || (story.seen.includes('mem:hero:9') && story.seen.includes('bellkeeper-arrives'));
    const alone = ALONE.some((id) => story.queue.includes(id));
    const scenes = alone ? [] : DEPARTURE_SCENES.filter((id) => story.queue.includes(id) && ready(id));
    // 【控制者裁定 2026-10-24】 The dawn before departure: the return's pick, while still untold and the backlog is at
    // least DAWN_BACKLOG; the eve takes its own departure. It comes before the lone morning. A reveal or confession still
    // waiting (`ALONE`) blocks it: that morning is Lorne's and Rin's silence; the piece stays untold, still 新.
    const untold = story.untold ?? [];
    const dawn = !alone && story.dawn && untold.includes(story.dawn) && untold.length >= DAWN_BACKLOG && !scenes.includes('finale-eve') ? story.dawn : null;
    return dawn ? [dawn, ...scenes] : scenes;
  }

  /** The tier the next departure plays at (difficulty plan ruling 18): the one last chosen, Normal until then. */
  tier(): Difficulty {
    return this.state.dungeon.tier ?? 'normal';
  }

  /**
   * Choose the tier of the next departures (ruling 18): in town only, and only an unlocked one. Written down, Normal too,
   * and saved at once like the inn's respec.
   */
  chooseTier(t: Difficulty): { ok: true } | { ok: false; reason: 'invalid' | 'locked' } {
    if (this.phase !== 'town' || !(t === 'normal' || t === 'nightmare' || t === 'hell')) return { ok: false, reason: 'invalid' };
    if (!tierUnlocked(this.state, t)) return { ok: false, reason: 'locked' };
    this.state.dungeon.tier = t;
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /** Start a new run through a gate: a fresh labyrinth every time, at the chosen tier. */
  depart(portal: Portal, startDepth: number): { ok: true } | { ok: false; reason: 'locked' | 'party-down' | 'phase' } {
    const refused = this.departCheck(portal, startDepth);
    if (refused) return { ok: false, reason: refused };
    this.run = newRun(Math.floor(this.rng() * 2 ** 31), portal.region, portal.condition, startDepth, rescuesFor(portal.region, this.state.party.recruited), this.tier());
    this.pending = [];
    this.eve = [];
    this.finale = null;
    delete this.state.story.dawn;   // a departure leaves no dawn pick behind: the next return picks again
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
        if (this.isFinaleFight()) this.startBattle([FINALE_BOSS.base], true, true, undefined, 0, { names: { [FINALE_BOSS.base]: STORY.finaleBossName }, bossPower: FINALE_BOSS.power, story: true });
        else if (this.isStoryDepth(this.floor)) this.startBattle(['lanterneater'], true, false, undefined, 0, { story: true });
        else this.startBattle(['lanterneater'], true);
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
        if (c.who === 'scarlet') this.startBattle(['scarlet-foe', ...group], false, true, undefined, 1, { survive: STORY_FIGHT_ROUNDS, names: { 'scarlet-foe': CHARACTERS.scarlet.name }, story: true });   // her story fight: last it out
        else this.startBattle([...group, group[0]], false, true, undefined, 1, { story: true });
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
    const ids = rng ? pieceDrops(this.state.party, this.state.story.pity, { region: run.region, depth: this.floor, source: 'glimmer', who: c.owner, cal: calendarOf(this.state) }, rng) : [];
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

  /**
   * Gives each chain in `ids` its next piece, in order. Its effects land now (the count, the stats, the pity reset); its scene
   * waits in `story.untold`, in pickup order, for a night in town or the handbook (story L spec §4.2). The finale fight's hero
   * pieces are the finale's own (`finalePieces`): neither untold nor seen.
   */
  private takePieces(ids: CharacterId[], finale = false): FragmentGain[] {
    if (ids.length === 0) return [];
    const run = this.run!;
    const story = this.state.story;
    const applied = applyPieces(this.state.party, ids);
    this.state.party = applied.party;
    (run.dropped[this.floor] ??= []).push(...ids);
    for (const id of ids) story.pity[id] = 0;   // a piece resets its chain's count now, so leaving the floor any way keeps it
    return applied.gained.map(({ id, n }) => {
      if (!(finale && id === 'hero')) (story.untold ??= []).push(memScene(id, n));
      return { kind: 'piece' as const, id, n };
    });
  }

  /**
   * Before a depth is first made, fix the chains whose glimmer on it must hold their piece. Under today's moon (time and
   * moon ruling 3): a dive is one day, so the moon at the glimmer's making is the moon at its pickup.
   */
  private forceGlimmers(floor: number): void {
    const run = this.run!;
    if (run.floors.has(floor)) return;
    run.glimmers[floor] = forcedGlimmers(this.state.party, this.state.story.pity, run.region, floor, calendarOf(this.state));
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
    const extra = { ...(frags.length ? { fragments: frags } : {}), ...this.spotRune(at, 'vault') };
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
    if (awarded) {
      const was = this.state.party;
      this.state.party = awarded.party;
      this.state = followUp(this.state, this.state.party.recruited, was);
    }
    this.earnField(standing, FIELD_POINTS.floor);   // bond plan Task 5: a floor gone down together, whoever stands on the field
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
    this.watchDanger(b);
    if (b.outcome === 'ongoing') return { battle: b, end: null };
    this.battle = null;
    const empty: BattleEnd = { outcome: b.outcome, exp: 0, gold: 0, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [] };
    const elite = this.eliteAt;
    this.eliteAt = null;
    const rescue = this.rescueAt;
    this.rescueAt = null;
    const tier = this.fightTier;
    this.fightTier = undefined;
    if (b.outcome === 'fled') { this.phase = 'map'; return { battle: b, end: empty }; }
    if (b.outcome === 'lose') { this.wipe(); return { battle: b, end: empty }; }
    const rw = rewards(b, this.rng, hasPassive(this.state.party, 'dropBoost'), CONDITIONS[this.run!.condition].dropMul);
    this.run!.loot.gold += rw.gold;
    const found = this.battleGear(b, elite !== null, tier);
    const runes = this.battleRunes(b, elite !== null, tier);
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
    const was = this.state.party;
    this.state.party = awarded.party;
    // Followers lay out their builds at their level and memories now; only the rune slots opened since the last fight
    // take its runes from the bag, so one she emptied by hand stays empty (plan 8h ruling 13, final review I3).
    this.state = followUp(this.state, this.state.party.recruited, was);
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
    // Bond plan Task 5 (spec §4.3): a boss or an elite won with her in it; then her life saved. A rescue gives none (she
    // joins after it). Both share the dive's cap.
    if (!rescue) {
      if (b.boss || elite) this.earnField(b.party.map((c) => c.key as CharacterId), FIELD_POINTS.strong);
      this.earnField(b.party.filter((c) => c.alive && c.hp > 0 && this.endangered.has(c.key as CharacterId)).map((c) => c.key as CharacterId), FIELD_POINTS.saved);
    }
    // Memory pieces come after exp and the meeting, and before the phase can switch to clear (the story boss pays too).
    let fragments: FragmentGain[] = [];
    const finale = b.boss && this.isFinaleFight();
    if (b.boss || elite) {
      const run = this.run!;
      const source = b.boss ? 'boss' : 'elite';
      const rng = memoryRng(run);
      const ids = pieceDrops(this.state.party, this.state.story.pity, { region: run.region, depth: this.floor, source, cal: calendarOf(this.state) }, rng);
      fragments = this.takePieces(ids, finale);
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
      // time and moon ruling 6: spring comes one turn of the moon after the finale's dive
      this.state.story.springDay = dayOf(this.state) + SPRING_AFTER;
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
    return { battle: b, end: { outcome: 'win', ...rw, drops: taken, levelUps: awarded.results.filter((x) => x.levels > 0), left, gear, gearLeft, ...(met ? { met } : {}), ...(fragments.length ? { fragments } : {}), ...(runes.runes.length ? { runes: runes.runes } : {}), ...(runes.gold.length ? { runeGold: runes.gold } : {}) } };
  }

  /**
   * Gear a won fight drops, all from the loot rng: a boss its two pieces (a repeat kill of the same region and depth rolls
   * on repeat odds); an elite one piece and a rare material, and then each escort rolls like an ordinary monster; and an
   * ordinary fight a GEAR_CHANCE.monster roll per monster. An elite fight never pays less than an ordinary one. All at
   * the fight's `tier` (difficulty plan Task 6a-prime): its drops, and its boss-kill key, so a story fight pays and counts
   * as Normal.
   */
  private battleGear(b: BattleState, elite: boolean, tier: Difficulty | undefined): { gear: ItemInstance[]; rare?: string } {
    const run = this.run!;
    if (b.boss) {
      const key = bossKey(tier, run.region, Math.min(this.floor, MAX_REACHED));
      const kills = this.state.dungeon.bossKills;
      const gear = rollBossGear(lootRng(run), { ...this.dropCtx('boss', tier), bossRepeat: (kills[key] ?? 0) > 0 });
      kills[key] = (kills[key] ?? 0) + 1;
      return { gear };
    }
    const gear: ItemInstance[] = [];
    let rare: string | undefined;
    if (elite) {
      const rng = lootRng(run);
      gear.push(rollGear(rng, this.dropCtx('elite', tier)));
      rare = rollRareMaterial(rng);
    }
    // In an elite fight the first enemy is the elite; the rest are escorts.
    for (let i = elite ? 1 : 0; i < b.enemies.length; i++) {
      if (b.survive && b.enemies[i].alive) continue;
      const rng = lootRng(run);
      if (rng() < GEAR_CHANCE.monster) gear.push(rollGear(rng, this.dropCtx('monster', tier)));
    }
    return { gear, rare };
  }

  /**
   * The runes a won fight drops (plan 8f rulings 1, 5, 12), from the rune stream alone. Before runes are open nothing is
   * drawn: a boss then opens them and gives a magic 擴散, any other fight nothing. After: one stream for the fight; a boss
   * rolls its one rune with no drop draw (no other foe of a boss fight rolls); in an elite fight the first foe draws at the
   * elite rate and rolls on the elite row, the escorts like ordinary foes; an ordinary foe draws at the monster rate. A foe
   * still standing at the end of a fight to last out drops nothing (as battleGear). On a higher `tier` (the fight's), the
   * drop chances times its `runeDrop` and the roll with its `runeTierMul` and `runeLegendary`; Normal draws as before.
   */
  private battleRunes(b: BattleState, elite: boolean, tier: Difficulty | undefined): { runes: RuneRef[]; gold: BattleRuneGold[] } {
    const out: { runes: RuneRef[]; gold: BattleRuneGold[] } = { runes: [], gold: [] };
    const give = (r: RuneRef) => {
      const at = out.runes.length + out.gold.length;
      const f = this.giveRune(r);
      if (f.rune) out.runes.push(f.rune);
      if (f.runeGold) out.gold.push({ ...f.runeGold, at });
    };
    if (!this.state.runesOpen) {
      if (b.boss) {
        this.state.runesOpen = true;
        give({ id: 'spread', tier: 'magic' });
      }
      return out;
    }
    const run = this.run!;
    const rng = runeRng(run);
    const t = tierOf(tier);
    const roll = (source: DropSource) => give(t ? rollRune(rng, source, depthLevel(this.floor), run.condition, t.runeTierMul, t.runeLegendary) : rollRune(rng, source, depthLevel(this.floor), run.condition));
    if (b.boss) { roll('boss'); return out; }
    for (let i = 0; i < b.enemies.length; i++) {
      const first = elite && i === 0;
      if (!first && b.survive && b.enemies[i].alive) continue;
      const chance = first ? RUNE_DROP.elite : RUNE_DROP.monster;
      if (rng() < (t ? chance * t.runeDrop : chance)) roll(first ? 'elite' : 'monster');
    }
    return out;
  }

  /**
   * The rune of the chest or vault at `at`, once runes are open (plan 8f rulings 3, 12): one drop draw and then its roll,
   * on the spot's own stream, so a chest kept shut for weight rolls the same when it opens. Called once, as it opens. Not
   * a fight: it reads the run's tier (difficulty plan Task 6a-prime).
   */
  private spotRune(at: Pos, source: 'chest' | 'vault'): RuneFind {
    if (!this.state.runesOpen) return {};
    const run = this.run!;
    const rng = spotRuneRng(run, this.floor, at);
    const t = tierOf(run.difficulty);
    if (rng() >= (t ? RUNE_DROP[source] * t.runeDrop : RUNE_DROP[source])) return {};
    return this.giveRune(t ? rollRune(rng, source, depthLevel(this.floor), run.condition, t.runeTierMul, t.runeLegendary) : rollRune(rng, source, depthLevel(this.floor), run.condition));
  }

  /**
   * One rune into the bag, or, when RUNE_STACK of it are owned, its sell price straight into `state.gold` (plan 8f rulings
   * 4, 7). Neither rides in the run pack: a wipe keeps the rune, and the gold stays in `state.gold`, where a wipe takes its
   * quarter as it does of all gold. Only a town save writes them down.
   */
  private giveRune(r: RuneRef): RuneFind {
    const g = grantRune(this.state, r);
    this.state.gold = g.state.gold;
    if (g.state.runes) this.state.runes = g.state.runes;
    return g.gold ? { runeGold: { rune: r, gold: g.gold } } : { rune: r };
  }

  /** A drop's context at `tier` (a fight's, or the run's for a chest or vault): the tier is written only above Normal. */
  private dropCtx(source: DropSource, tier: Difficulty | undefined): DropCtx {
    const run = this.run!;
    return { uid: () => mintUid(this.state), depth: this.floor, region: run.region, condition: run.condition, source, seed: run.seed, ...(tierOf(tier) ? { difficulty: tier } : {}) };
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
    if (!r.ok) return r;
    this.endFollowing(id);
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  /** What applying build `key` to `id` would cost and change (builds `applyCost`), and why it cannot go (town only). */
  canApplyBuild(id: CharacterId, key: string): { cost: number; changes: boolean; moves: boolean; strips: boolean; reason: 'invalid' | 'gold' | null } {
    const price = this.phase === 'town' ? applyCost(this.state, id, key) : null;
    if (!price) return { cost: 0, changes: false, moves: false, strips: false, reason: 'invalid' };
    return { ...price, reason: this.state.gold < price.cost ? 'gold' : null };
  }

  /**
   * One-click apply of a suggested build (plan 8h ruling 12; the rules: builds `applyBuild`): town only, saved at once like
   * the inn's respec. She follows the build from then on.
   */
  applyBuild(id: CharacterId, key: string): ReturnType<typeof applyBuild> {
    if (this.phase !== 'town') return { ok: false, reason: 'invalid' };
    const r = applyBuild(this.state, id, key);
    if (!r.ok) return r;
    this.state = r.state;
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  /** She stops following her build (her points stay as they are). Saved at once in town. */
  stopFollowing(id: CharacterId): void {
    if (!this.endFollowing(id)) return;
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
  }

  /**
   * A change by hand (a point, a side, a talent, a reset) ends her following a build (plan 8h ruling 2); she joins the
   * `followEnded` queue the town reads. Whether she was following.
   */
  private endFollowing(id: CharacterId): boolean {
    const m = this.state.party.roster[id];
    if (!m?.build) return false;
    const { build: _gone, ...rest } = m;
    this.state = { ...this.state, party: { ...this.state.party, roster: { ...this.state.party.roster, [id]: rest } } };
    if (!this.followEnded.includes(id)) this.followEnded.push(id);
    return true;
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
    this.endFollowing(id);
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /** Why `swapVariant(id, node)` would be turned down now, or null when it would change the side; changes nothing. */
  canSwapVariant(id: CharacterId, node: string): 'unknown' | 'empty' | 'invalid' | null {
    if ((this.phase !== 'town' && this.phase !== 'map') || !this.state.party.recruited.includes(id)) return 'invalid';
    const r = swapPair(this.state.party.roster[id], node);
    return r.ok ? null : r.reason;
  }

  /**
   * A recruited member's pair changes side for free (plan 8d; the rules: progression `swapPair`): in town and the labyrinth's
   * field, never in battle. Saved like `raiseNode`: at once in town, at the next town save in the labyrinth.
   */
  swapVariant(id: CharacterId, node: string): { ok: true } | { ok: false; reason: 'unknown' | 'empty' | 'invalid' } {
    const why = this.canSwapVariant(id, node);
    if (why) return { ok: false, reason: why };
    const r = swapPair(this.state.party.roster[id], node);
    if (!r.ok) return r;
    const party = this.state.party;
    this.state = { ...this.state, party: { ...party, roster: { ...party.roster, [id]: r.member } } };
    this.endFollowing(id);
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /** Runes change slots only in town and the labyrinth's field, never in battle (plan 8e); elsewhere `invalid`. */
  private runesChangeable(): boolean {
    return this.phase === 'town' || this.phase === 'map';
  }

  /** Why `socketRune(...)` would be turned down now, or null when it would go in; changes nothing. */
  canSocketRune(id: CharacterId, skill: string, slot: number, r: RuneRef): SocketFail | null {
    if (!this.runesChangeable()) return 'invalid';
    const out = socketRune(this.state, id, skill, slot, r);
    return out.ok ? null : out.reason;
  }

  /**
   * A rune from the bag into a slot of a recruited member's skill (plan 8e; the rules: sockets `socketRune`), what the slot
   * held back to the bag: free, in town and the labyrinth's field, never in battle. Saved like `swapVariant`: at once in
   * town, at the next town save in the labyrinth; only a failed save leaves a notice.
   */
  socketRune(id: CharacterId, skill: string, slot: number, r: RuneRef): { ok: true } | { ok: false; reason: SocketFail } {
    if (!this.runesChangeable()) return { ok: false, reason: 'invalid' };
    return this.runesMoved(socketRune(this.state, id, skill, slot, r));
  }

  /** The rune in a slot back to the bag (the rules: sockets `unsocketRune`), when and saved as `socketRune`. */
  unsocketRune(id: CharacterId, skill: string, slot: number): { ok: true } | { ok: false; reason: 'invalid' | 'empty' } {
    if (!this.runesChangeable()) return { ok: false, reason: 'invalid' };
    return this.runesMoved(unsocketRune(this.state, id, skill, slot));
  }

  /** Why `moveRune(from, to)` would be turned down now, or null when it would go; changes nothing. */
  canMoveRune(from: SocketAt, to: SocketAt): SocketFail | 'empty' | null {
    if (!this.runesChangeable()) return 'invalid';
    const out = moveRune(this.state, from, to);
    return out.ok ? null : out.reason;
  }

  /**
   * A rune from one slot straight into another, of any recruited member's skill (plan 8g; the rules: sockets
   * `moveRune`): when and saved as `socketRune`. A refusal leaves both slots as they were.
   */
  moveRune(from: SocketAt, to: SocketAt): { ok: true } | { ok: false; reason: SocketFail | 'empty' } {
    if (!this.runesChangeable()) return { ok: false, reason: 'invalid' };
    return this.runesMoved(moveRune(this.state, from, to));
  }

  /**
   * The rune tutorial has been shown (plan 8g ruling 13). Saved at once in town (only a failed save leaves a notice);
   * anywhere else it counts at once and is saved at the next town save.
   */
  seeRuneTutorial(): void {
    this.state = { ...this.state, runeTutorialSeen: true };
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
  }

  /** Buy runes at Orik's (engine/runeTrade buyRune): town only (plan 8f ruling 14), saved at once; a failed save leaves a notice. */
  buyRune(r: RuneRef, qty = 1): { ok: true } | { ok: false; reason: RuneTradeFail | 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    return this.runesMoved(buyRune(this.state, r, qty));
  }

  /** Sell runes from the bag to Orik (engine/runeTrade sellRunes): when and saved as `buyRune`. */
  sellRune(r: RuneRef, qty: number): { ok: true } | { ok: false; reason: RuneTradeFail | 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    return this.runesMoved(sellRunes(this.state, r, qty));
  }

  private runesMoved<R extends string>(r: { ok: true; state: GameState } | { ok: false; reason: R }): { ok: true } | { ok: false; reason: R } {
    if (!r.ok) return r;
    this.state = r.state;
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

  /**
   * Bond plan Task 9 (spec §8.2): her next heart-to-heart (`nextBond`), in town and once a day (`today`): it waits in
   * `pending` for the screen to play it, and is today's talk once done. Null when none may open now. Not saved: a talk cut
   * short (a reload before its end) counts nothing.
   */
  openBond(c: Companion): SceneId | null {
    if (this.phase !== 'town' || today(this.state).talked) return null;
    const id = nextBond(this.state, c);
    if (!id) return null;
    if (!this.pending.includes(id)) this.pending.push(id);
    return id;
  }

  /**
   * Bond plan Task 8 (spec §7.4): the choice of a bond scene that is playing, before its `sceneDone`: her talk points
   * (`talkPoints`; `null` for skipped) up to BOND_CAP.talk. Only for a bond scene in `pending`, not yet seen, once.
   */
  bondChoice(id: SceneId, tone: Tone | null): boolean {
    if (!id.startsWith('bond:') || !this.pending.includes(id) || this.state.story.seen.includes(id) || this.choiceCounted.has(id)) return false;
    const c = id.split(':')[1] as Companion;
    const m = this.state.party.roster[c];
    if (!m || !this.state.party.recruited.includes(c)) return false;
    this.choiceCounted.add(id);
    const b = bondOf(m);
    const party = this.state.party;
    this.state.party = { ...party, roster: { ...party.roster, [c]: { ...m, bond: { ...b, gifts: { ...b.gifts }, talk: Math.min(BOND_CAP.talk, b.talk + talkPoints(c, tone)) } } } };
    return true;
  }

  /** Bond plan Task 6: one gift to a companion (`giveGift`), town only, saved at once like a shard absorbed. */
  give(c: Companion, mat: string): GiveResult | { ok: false; reason: 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    const r = giveGift(this.state, c, mat);
    if (!r.ok) return r;
    this.state = r.state;
    if (!(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return r;
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
    this.endFollowing(id);
    if (this.phase === 'town' && !(this.storage && saveGame(this.storage, this.state))) this.notice = 'save-failed';
    return { ok: true };
  }

  /**
   * One forge action: town only (checked here, once), applied, then saved at once so a reload can neither undo a paid
   * action nor re-draw an enhance or reroll (the engine's forgeRng owns forgeDraws; no rng is passed in).
   */
  private forgeAct<O, R extends string = ForgeFail>(run: (s: GameState) => { ok: true; state: GameState; out: O } | { ok: false; reason: R }):
    { ok: true; state: GameState; out: O } | { ok: false; reason: R | 'phase' } {
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
  /** Three runes of a kind into one of the next tier (engine/runeTrade fuseRunes; plan 8f Task 5): a forge action, town only. */
  fuseRune(r: RuneRef) {
    return this.forgeAct((s) => {
      const f = fuseRunes(s, r);
      return f.ok ? { ok: true as const, state: f.state, out: f.made } : f;
    });
  }

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
    const due = this.arrival.includes(id) || this.night.includes(id) || this.eve.includes(id) || this.pending.includes(id)
      || (this.finale !== null && (id === 'finale' || this.finale.pieces.includes(id))) || this.departScenes().includes(id);
    if (!due) return false;
    // Story L spec §4.8: the eve's line said on a departure, its memories are picked (they stay untold until each is told).
    const eve = id === 'finale-eve' && !this.finale;
    this.arrival = this.arrival.filter((s) => s !== id);
    this.night = this.night.filter((s) => s !== id);
    this.eve = this.eve.filter((s) => s !== id);
    this.pending = this.pending.filter((s) => s !== id);
    this.choiceCounted.delete(id);
    this.state = sceneDone(this.state, id, how);
    if (eve) {
      this.eve = eveMemories(this.state);
      const story = this.state.story;
      if (story.tonight) story.tonight = story.tonight.filter((t) => !this.eve.includes(t));
      delete story.dawn;   // the eve takes its own departure: no dawn after it, nor on a reload
    }
    // Inside the finale, a scene its own list covers never waits in the queue (Task 3 review): the keeper her confession
    // queues is the finale's to play, and leaving the ending early must not leave him for the town after the festival.
    const covered = this.finale?.pieces;
    if (covered) this.state.story.queue = this.state.story.queue.filter((q) => !covered.includes(q));
    this.saveInTown();
    return true;
  }

  /**
   * Story L spec §4.7: the handbook played a memory still untold. It is told: seen (not new: the player chose to read it),
   * out of `untold` and tonight's picks. Town saves at once; the labyrinth waits for the next save in town. False, and nothing
   * changes, for anything not untold.
   */
  tellEarly(id: SceneId): boolean {
    const story = this.state.story;
    if (!story.untold?.includes(id)) return false;
    story.untold = story.untold.filter((u) => u !== id);
    if (story.tonight) story.tonight = story.tonight.filter((u) => u !== id);
    if (story.dawn === id) delete story.dawn;
    if (!story.seen.includes(id)) story.seen.push(id);
    this.night = this.night.filter((u) => u !== id);   // a night that held it skips it, and calls no one else
    this.eve = this.eve.filter((u) => u !== id);
    this.saveInTown();
    return true;
  }

  /**
   * Story L spec §4.4.1: the beat said between memories `prev` and `next` of a night, or null when there is none (no pool,
   * or no line fits). The cursor moves past it, so a reload gives the next line, not the same one; town saves at once.
   */
  takeBeat(prev: SceneId, next: SceneId): ScriptLine | null {
    const r = nextBeat(this.state, prev, next);
    if (!r) return null;
    this.state.story.beat = (r.at + 1) % NIGHT_BEATS.lines.length;
    this.saveInTown();
    return r.line;
  }

  /** The handbook opened a scene: it is no longer new. Town saves at once. */
  markRead(id: SceneId): void {
    this.state = markRead(this.state, id);
    this.saveInTown();
  }

  private saveInTown(): void {
    if (this.phase === 'town' && this.storage && !saveGame(this.storage, this.state)) this.notice = 'save-failed';
  }

  /**
   * What a return to town queues: acts reached, Rin's reveal; then the arrival, with one chat and one banter (B1). Story L
   * spec §4.6: then the night (`planNight`), kept in `story.tonight`; the memories the day owes lead the arrival.
   */
  private arrive(afterFinale = false): void {
    this.state.story = onReturn(this.state);
    const day = arrivalScenes(this.state, { chat: true, afterFinale });
    const plan = planNight(this.state, day);
    this.state.story.tonight = [...plan.before, ...plan.night];
    // 【控制者裁定 2026-10-24】 the dawn before the next departure, picked now and saved with the return
    const dawn = dawnMemory(this.state, [...plan.before, ...plan.night]);
    if (dawn) this.state.story.dawn = dawn;
    else delete this.state.story.dawn;
    // Story L spec §4.5: a group scene in the reaction slot is the night's first item, after the day's notices; after the
    // finale the slot may hold the spring festival instead (time and moon ruling 7). The night in `NIGHT_RANK` order.
    const slot = day.filter(isNightSlot);
    // Task 7 review: the season's scene this return decided, saved with it, so a reload plays the same night
    const festival = slot.find((id) => id.startsWith('season:'));
    if (festival) this.state.story.festival = festival;
    else delete this.state.story.festival;
    this.arrival = [...plan.before, ...day.filter((id) => !isNightSlot(id))];
    this.night = orderNight([...slot, ...plan.night]);
    this.leadSaid = false;
    // time and moon (ruling 1): the return and its night end the dive's day; the town wakes on the next, saved with it
    this.state.story.day = nextDay(dayOf(this.state));
  }

  /** The main road's depth 30 boss is the finale until it has been beaten once (spec §8.4); after that it is an ordinary boss. */
  private isFinaleFight(): boolean {
    return this.run?.region === 'mainline' && this.floor === FINALE_DEPTH && !this.state.story.finaleCleared;
  }

  /**
   * The scenes the finale plays before itself, in story order. First every act still owed (continuity fix 1): one held back
   * by Rin's reveal, or one reached on this dive and never brought home; an act must never play after the ending. Then her
   * confession if it still waits, and the bellkeeper's arrival if it waits or the confession does (the finale hands her bell
   * to him; continuity fix 4; story depth plan ruling 8: playing the confession queues him, and the finale plays him itself).
   * Then the hero pieces this fight filled in and any still waiting in the queue from an earlier floor (depth 25's top-up),
   * in piece order. What is taken leaves the queue, so the town does not play it again. A lone morning not seen yet is
   * answered by the finale, queued or not (no return may have come between her choice, his ninth piece and the bottom;
   * design §9.3.5): it counts as seen, and new, so the handbook offers it.
   * Story L spec §4.8: the night before the descent, when no departure told it, comes first of all, its line and then up to
   * three companions' untold memories (`eve`, `eveMemories`).
   */
  private finalePieces(gained: FragmentGain[]): SceneId[] {
    const story = this.state.story;
    const reached = this.state.dungeon.reached.mainline;
    const acts = ACT_NODES.filter((node) => !story.seen.includes(node) && (story.queue.includes(node) || reached >= ACT_DEPTHS[node]));
    for (const node of acts) if (!story.nodes.includes(node)) story.nodes.push(node);
    const confess: SceneId[] = story.queue.includes('rin-confess') ? ['rin-confess'] : [];
    const keeper: SceneId[] = story.queue.includes('bellkeeper-arrives') || confess.length ? ['bellkeeper-arrives'] : [];
    const heroNo = (id: SceneId) => Number(id.slice('mem:hero:'.length));
    // story L spec §4.8: his pieces still untold (depth 25's top-up) are the finale's to play, and leave untold and tonight
    const untoldHero = (story.untold ?? []).filter((id) => id.startsWith('mem:hero:'));
    if (story.untold) story.untold = story.untold.filter((id) => !id.startsWith('mem:hero:'));
    if (story.tonight) story.tonight = story.tonight.filter((id) => !id.startsWith('mem:hero:'));
    delete story.dawn;   // no departure is left before the town
    const queued = [...story.queue.filter((id) => id.startsWith('mem:hero:')), ...untoldHero];
    const taken = new Set<SceneId>([...acts, ...confess, ...keeper]);
    story.queue = story.queue.filter((id) => !id.startsWith('mem:hero:') && !taken.has(id));
    const eveOwed = !story.seen.includes('finale-eve');
    this.eve = eveOwed ? eveMemories(this.state) : [];
    for (const id of DEPARTURE_SCENES) {
      story.queue = story.queue.filter((q) => q !== id);
      if (id === 'finale-eve' || story.seen.includes(id)) continue;   // the eve is played, not counted
      story.seen.push(id);
      if (!story.fresh.includes(id)) story.fresh.push(id);
    }
    const filled = gained.flatMap((g) => (g.kind === 'piece' && g.id === 'hero' ? [memScene('hero', g.n)] : []));
    const eve: SceneId[] = eveOwed ? ['finale-eve', ...this.eve] : [];
    return [...eve, ...acts, ...confess, ...keeper, ...[...new Set([...queued, ...filled])].sort((a, b) => heroNo(a) - heroNo(b))];
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
    const it = rollGear(lootRng(run), this.dropCtx(source, run.difficulty));
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
    const extra = { ...(frags.length ? { fragments: frags } : {}), ...this.spotRune(this.pos, 'chest') };
    if (!gear) return { kind: 'chest', item, qty, ...extra };
    return { kind: 'chest', item, qty, ...extra, ...this.offerGear(id, gear) };
  }

  /**
   * `story`: the finale, a rescue fight (Scarlet's too) or the depth-3 story boss, always played and paid as Normal
   * (difficulty plan ruling 17). Otherwise the run's tier: its scale, and the affixes keyed by the spot (engine/tiers.ts)
   * on an elite (this tile), a boss (the depth) or, on Hell, one foe of a plain crowd (this tile).
   */
  private startBattle(enemyIds: string[], boss: boolean, scaled = true, elite?: string, extra = 0, opts: { survive?: number; names?: Record<string, string>; bossPower?: number; story?: true } = {}): void {
    const { story, ...rest } = opts;
    const run = this.run;
    this.fightTier = story ? undefined : run?.difficulty;
    const t = tierOf(this.fightTier);
    let scale: BattleScale | undefined = scaled && run ? { depth: this.floor, region: run.region, condition: run.condition, elite } : undefined;
    if (scale && run && t) {
      scale = { ...scale, difficulty: this.fightTier };
      if (elite) scale.affixes = rollAffixes(run.seed, this.floor, t.eliteAffixes, this.pos);
      else if (boss) scale.affixes = rollAffixes(run.seed, this.floor, t.bossAffixes);
      else {
        const crowd = rollCrowdAffix(run.seed, this.floor, this.pos, t.crowdAffixChance);
        if (crowd) scale.crowdAffix = crowd;
      }
    }
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed, scale, depth: this.floor, altar: this.run?.altarBuffs, extra, ...rest });
    planEnemies(this.battle, this.rng);
    this.phase = 'battle';
    // Bond plan ruling 3: who starts this fight out of danger. One who starts in it is not saved by living through it.
    this.safeSeen.clear();
    this.endangered.clear();
    for (const c of this.battle.party) if (c.alive && !inDanger(c)) this.safeSeen.add(c.key as CharacterId);
  }

  /** Bond plan ruling 3, after a round: one in danger who was seen out of it is endangered; one out of it is seen so. */
  private watchDanger(b: BattleState): void {
    for (const c of b.party) {
      const id = c.key as CharacterId;
      if (!c.alive || inDanger(c)) { if (this.safeSeen.has(id)) this.endangered.add(id); }
      else this.safeSeen.add(id);
    }
  }

  /** Bond plan Task 5: field points for `ids` on this dive (engine/story/bond.ts `addField`). */
  private earnField(ids: readonly CharacterId[], pts: number): void {
    const run = this.run;
    if (!run || !ids.length) return;
    const r = addField(this.state.party, run, ids, pts);
    this.state.party = r.party;
    for (const [id, n] of Object.entries(r.gained) as [CharacterId, number][]) run.bond[id] = (run.bond[id] ?? 0) + n;
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
