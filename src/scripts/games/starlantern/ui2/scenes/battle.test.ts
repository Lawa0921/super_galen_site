import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import type { Combatant } from '../../engine/combatant';
import type { CharacterId, ItemInstance } from '../../engine/types';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { art } from '../../render/artPaths';
import { chainLength } from '../../data/story/chains';
import { BattleScene } from './battle';
import { STORY_FIGHT_ROUNDS } from '../../engine/battle';
import { LEGACY_LINEUP, meet } from '../../engine/party';
import { T } from '../../data/text.zh-TW';
import { SKILLS } from '../../data/skills';
import { RUNE_SLOT_LEVELS } from '../../data/runes';
import { autoLine, battleLine, withoutPowerClause } from '../skillCard';
import { autoActions } from '../../engine/builds';
import { castPower } from '../../engine/sim';
import { castDef } from '../../engine/mechanics/index';
import { LIMIT_MAX } from '../../engine/battle';
import { hitAmount, type DamageSpec } from '../../engine/combatant';
import { ultimateFor } from '../../engine/progression';
import { skillFor } from '../../engine/battle';
import { ECHO, echoDef } from '../../engine/mechanics/echo';
import { CHARACTERS } from '../../data/characters';
import { AFFIXES } from '../../data/affixes';
import { SHARD_NAMES } from '../../data/story/fragments';
import { FINALE_DEPTH } from '../../data/story/scenes';
import { STORY, type ScriptLine } from '../../data/story.zh-TW';
import { DEFAULT_SETTINGS } from '../settings';
import type { SceneCtx } from '../scene';

/** The TP a skill costs now, forced for one test (plan 8c: the menu shows what the mechanics make her pay). */
const forced = vi.hoisted(() => ({ cost: null as number | null }));
vi.mock('../../engine/mechanics/index', async (orig) => {
  const m = await orig<typeof import('../../engine/mechanics/index')>();
  return { ...m, castCost: (...a: Parameters<typeof m.castCost>) => forced.cost ?? m.castCost(...a) };
});

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

function setup(prep?: (game: Game) => void, extra: Partial<SceneCtx> = {}, lineup = LEGACY_LINEUP) {
  const game = new Game(constRng(0.99), null, undefined, 0, lineup);
  expect(game.depart({ region: 'mainline', condition: 'plain' }, 1)).toEqual({ ok: true });
  game.encounter = 99;
  expect(game.move('right').kind).toBe('battle');
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true, ...extra });
  s.enter(root);
  const labels = () => [...root.querySelectorAll('.slx-bcmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const heading = () => root.querySelector('.slx-bcmd .slx-who')!.textContent;
  return { game, go, root, s, labels, heading };
}

describe('BattleScene', () => {
  it('a survive fight shows how many rounds are left', async () => {
    const { s, root, game } = setup((g) => { g.battle!.survive = STORY_FIGHT_ROUNDS; });
    expect(root.querySelector('.slx-msg')!.textContent).toContain(T.ui2.battle.survive(STORY_FIGHT_ROUNDS));
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    await flush();
    expect(game.battle!.round).toBe(1);
    expect(root.querySelector('.slx-msg')!.textContent).toContain(T.ui2.battle.survive(STORY_FIGHT_ROUNDS - 1));
    s.exit?.();
  });
  it('a plain fight shows no survive line', () => {
    const { root } = setup();
    expect(root.querySelector('.slx-msg')!.textContent).not.toContain('撐過去');
  });
  it('lists the commands for the first member and adds the ultimate when the gauge is full', () => {
    const plain = setup();
    expect(plain.labels()).toEqual(['攻擊', '技能', '防禦', '道具', '逃跑', '自動', '全員攻擊']);
    expect(plain.heading()).toBe('絲嘉蕾 的行動');
    const full = setup((g) => { g.battle!.party[0].limit = 100; });
    expect(full.labels()).toContain('絕技：紅蓮劫火');
  });

  it('collects one action per member, submits once, and ignores input while the round plays', async () => {
    const { game, s } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    s.onAction('confirm');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(Object.values(submit.mock.calls[0][0]).every((a) => a.kind === 'defend')).toBe(true);
    await flush();
  });

  it('a frozen member is skipped when choosing commands', () => {
    const { heading } = setup((g) => { g.battle!.party[0].frozen = true; });
    expect(heading()).toBe('千鶴 的行動');
  });

  it("the bar shows each member's ailments", () => {
    const { root } = setup((g) => { g.battle!.party[1].poison = true; g.battle!.party[1].burn = { tick: 4, turns: 2, src: 'e0' }; });
    const row = root.querySelector('.slx-partybar [data-key=chizuru] .slx-pm-ail')!;
    expect(row.textContent).toContain('中毒');
    expect(row.textContent).toContain('灼燒2');
    // Scarlet's row holds her embers only: no ailment.
    expect(root.querySelector('.slx-partybar [data-key=scarlet] .slx-pm-ail')!.textContent).toBe('餘燼0');
  });

  it('the words leave the bar once the fight is over', async () => {
    const { s, root, game } = setup((g) => { g.battle!.party[1].poison = true; });
    const row = () => root.querySelector('.slx-partybar [data-key=chizuru] .slx-pm-ail')!;
    expect(row().textContent).toContain('中毒');
    for (const e of game.battle!.enemies) { e.hp = 0; e.alive = false; }
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    await flush();
    expect(root.querySelector('.slx-result')).not.toBeNull();
    expect(row().textContent).toBe('');
  });

  it("a lost fight clears the enemies' ailment words", async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) { e.max.atk = 9999; e.max.spd = 99; e.poison = true; e.max.hp = 9999; e.hp = 9999; }
    for (const m of game.battle!.party) { m.hp = 1; m.poison = true; }   // the round-end tick fells everyone left
    const showAilments = vi.fn();
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, showIntents: vi.fn(), syncHp: vi.fn(), showAilments, play: vi.fn() } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    expect(showAilments.mock.calls.at(-1)![0]).toMatchObject({ e0: [{ id: 'poison' }] });
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    await flush();
    expect(game.battle?.outcome ?? 'lose').toBe('lose');
    expect(root.querySelector('.slx-result')).not.toBeNull();
    const last = showAilments.mock.calls.at(-1)![0] as Record<string, unknown[]>;
    expect(Object.values(last).flat()).toEqual([]);
  });

  it("a fled fight clears the enemies' ailment words", async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) e.poison = true;
    (game as unknown as { rng: () => number }).rng = constRng(0.01);   // the escape roll succeeds
    const showAilments = vi.fn();
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, showIntents: vi.fn(), syncHp: vi.fn(), showAilments, play: vi.fn() } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    expect(showAilments.mock.calls.at(-1)![0]).toMatchObject({ e0: [{ id: 'poison' }] });
    for (let i = 0; i < 4; i++) s.onAction('down');
    s.onAction('confirm');   // 逃跑
    for (let i = 0; i < 4; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // the rest defend
    await flush();
    const last = showAilments.mock.calls.at(-1)![0] as Record<string, unknown[]>;
    expect(Object.values(last).flat()).toEqual([]);
    expect(showAilments.mock.calls.length).toBeGreaterThan(1);
  });

  it('goes back to the previous member on cancel', () => {
    const { s, heading } = setup();
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    expect(heading()).toBe('千鶴 的行動');
    s.onAction('cancel');
    expect(heading()).toBe('絲嘉蕾 的行動');
  });

  it('offers a 返回 control only when there is something to go back to', () => {
    const { s, root, heading } = setup();
    const back = root.querySelector('.slx-back') as HTMLElement;
    expect(back.hidden).toBe(true);
    s.onAction('down'); s.onAction('confirm');                        // 技能 opens a sub-list
    expect(back.hidden).toBe(false);
    back.click();
    expect(root.querySelector('.slx-bsub')).toBeNull();
    expect(back.hidden).toBe(true);
    s.onAction('down'); s.onAction('confirm');                        // 防禦: next member
    expect(back.hidden).toBe(false);
    back.click();
    expect(heading()).toBe('絲嘉蕾 的行動');
  });

  it('describes the skill under the cursor', () => {
    const { s, root } = setup();
    s.onAction('down'); s.onAction('confirm');
    const note = root.querySelector('.slx-bnote') as HTMLElement;
    expect(note.textContent!.length).toBeGreaterThan(0);
    s.onAction('cancel');
    expect(root.querySelector('.slx-bnote')).toBeNull();
  });

  it('lights the party member under the cursor when an item targets an ally', () => {
    const { s, root } = setup((g) => { g.battle!.inventory = { potion: 1 }; });
    for (let i = 0; i < 3; i++) s.onAction('down');
    s.onAction('confirm');                                // 道具
    s.onAction('confirm');                                // 回復藥 → choose who
    const active = () => root.querySelector('.slx-pm-active')!.getAttribute('data-key');
    const first = active();
    s.onAction('down');
    expect(active()).not.toBe(first);
    s.onAction('cancel'); s.onAction('cancel');
    expect(active()).toBe('scarlet');
  });

  it('does not offer the last potion twice in one round', () => {
    const { s, root } = setup((g) => { g.battle!.inventory = { potion: 1 }; });
    for (let i = 0; i < 3; i++) s.onAction('down');
    s.onAction('confirm'); s.onAction('confirm'); s.onAction('confirm');   // 絲嘉蕾 uses it
    const item = [...root.querySelectorAll('.slx-bcmd [role=option]')].find((o) => o.textContent === '道具')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it("the hero's echo command names what it repeats, greyed when there is nothing (plan 8c Task 6)", () => {
    const lineup: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
    const options = (root: HTMLElement) => [...root.querySelectorAll('.slx-bcmd [role=option]')];
    /** Everyone before `name` defends; then the command list of `name`. */
    const listOf = (name: string, prep?: (g: Game) => void) => {
      const { root, s, heading } = setup(prep, {}, lineup);
      for (let i = 0; i < 5 && heading() !== T.cmd.choose(name); i++) {
        for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'defend'; k++) s.onAction('down');
        s.onAction('confirm');
      }
      expect(heading()).toBe(T.cmd.choose(name));
      return options(root).map((o) => [o.querySelector('.slx-label')!.textContent, o.getAttribute('aria-disabled')]);
    };
    expect(listOf('洛恩')).toContainEqual(['殘響', 'true']);
    const some = listOf('洛恩', (g) => { g.battle!.echo = { by: 'noel', round: g.battle!.round, def: SKILLS['fire-star'], cost: 5 }; });
    expect(some).toContainEqual(['殘響：火之星彈', 'false']);
    // On the command, the note says what it repeats and at what power.
    {
      const { root, s, heading } = setup((g) => { g.battle!.echo = { by: 'noel', round: g.battle!.round, def: SKILLS['fire-star'], cost: 5 }; }, {}, lineup);
      expect(heading()).toBe(T.cmd.choose('洛恩'));
      for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'echo'; k++) s.onAction('down');
      expect(root.querySelector('.slx-bnote')?.textContent).toContain('70%');
      expect(root.querySelector('.slx-bnote')?.textContent).not.toContain(T.cmd.echoDropped);
    }
    // A record whose mechanic extras were dropped says so on the note (8d final review).
    {
      const def = { ...SKILLS.provoke, name: '挑釁・高喊' };
      const { root, s, heading } = setup((g) => { g.battle!.echo = { by: 'scarlet', round: g.battle!.round, def, cost: 3, dropped: true }; }, {}, lineup);
      expect(heading()).toBe(T.cmd.choose('洛恩'));
      for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'echo'; k++) s.onAction('down');
      expect(root.querySelector('.slx-bnote')?.textContent).toContain(T.cmd.echoDropped);
    }
    // Chosen, it submits the record the menu showed: a later cast that round (a faster companion's) is not what he repeats.
    {
      const { game, root, s, heading } = setup((g) => { g.battle!.echo = { by: 'noel', round: g.battle!.round, def: SKILLS['fire-star'], cost: 5 }; }, {}, lineup);
      const submit = vi.spyOn(game, 'submitRound');
      expect(heading()).toBe(T.cmd.choose('洛恩'));
      for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'echo'; k++) s.onAction('down');
      s.onAction('confirm');
      if (root.querySelector('.slx-btarget')) s.onAction('confirm');
      game.battle!.echo = { by: 'selene', round: game.battle!.round + 1, def: SKILLS.moonlight, cost: 5 };
      for (let i = 0; i < 6 && submit.mock.calls.length === 0; i++) {
        for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'defend'; k++) s.onAction('down');
        s.onAction('confirm');
      }
      expect(submit).toHaveBeenCalled();
      const hero = submit.mock.calls[0][0].hero as { kind: string; rec?: { def: { id: string } } };
      expect(hero.kind).toBe('echo');
      expect(hero.rec?.def.id).toBe('fire-star');
      expect(game.battle!.log).toContainEqual({ type: 'act', actor: 'hero', label: '殘響・火之星彈' });
    }
    // Short of the TP Noel paid: greyed.
    const poor = listOf('洛恩', (g) => {
      g.battle!.echo = { by: 'noel', round: g.battle!.round, def: SKILLS['fire-star'], cost: 5 };
      g.battle!.party.find((c) => c.key === 'hero')!.tp = 4;
    });
    expect(poor).toContainEqual(['殘響：火之星彈', 'true']);
    // Nobody else has the command.
    for (const name of ['凜', '千鶴']) expect(listOf(name).some(([t]) => t?.startsWith('殘響')), name).toBe(false);
  });

  it('disables items when there are none to use in battle', () => {
    const { root } = setup((g) => { g.state.inventory = {}; g.battle!.inventory = {}; });
    const item = [...root.querySelectorAll('.slx-bcmd [role=option]')].find((o) => o.textContent === '道具')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it('全員攻擊 keeps what earlier members already chose and attacks with the rest', () => {
    const { game, s, root } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 絲嘉蕾: 防禦
    for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'auto'; k++) s.onAction('down');
    s.onAction('confirm');                                           // 全員攻擊 for the rest
    const sent = Object.values(submit.mock.calls[0][0]);
    expect(sent[0].kind).toBe('defend');
    expect(sent.slice(1).every((a) => a.kind === 'attack')).toBe(true);
  });

  it('全員攻擊 sends an attack for everyone at once', () => {
    const { game, s, root } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'auto'; k++) s.onAction('down');
    s.onAction('confirm');
    expect(Object.values(submit.mock.calls[0][0]).every((a) => a.kind === 'attack')).toBe(true);
  });

  it('a legendary that makes 月光 hit all allies skips the target pick', () => {
    const toSelene = (s: BattleScene) => {
      for (let i = 0; i < 4; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×4
      s.onAction('down'); s.onAction('confirm');                                                       // 技能
      s.onAction('confirm');                                                                           // 月光
    };
    const plain = setup();
    const plainSubmit = vi.spyOn(plain.game, 'submitRound');
    toSelene(plain.s);
    expect(plainSubmit).not.toHaveBeenCalled();                                                         // asks whom to heal
    expect(plain.root.querySelector('.slx-btarget')).not.toBeNull();
    const crowned = setup((g) => { g.battle!.party.find((c) => c.key === 'selene')!.powers = ['lg-selene']; });
    const submit = vi.spyOn(crowned.game, 'submitRound');
    toSelene(crowned.s);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].selene).toEqual({ kind: 'skill', skill: 'moonlight', target: undefined });
  });

  it('the skill list shows the reduced TP cost and greys by it', () => {
    // 絲嘉蕾 with 鐵壁 in her tree knows it (4 TP); she has 3 TP.
    const wall = (prep: (c: Combatant) => void) => {
      const { s, root } = setup((g) => { g.state.party.roster.scarlet.tree = { provoke: 1, 'iron-wall': 1 }; const c = g.battle!.party[0]; c.tp = 3; prep(c); });
      s.onAction('down'); s.onAction('confirm');                                                       // 技能
      const opt = root.querySelector('.slx-bsub [data-id="iron-wall"]')!;
      return [opt.querySelector('.slx-right')!.textContent, opt.getAttribute('aria-disabled')];
    };
    expect(wall(() => {})).toEqual(['4 TP', 'true']);
    expect(wall((c) => { c.x.tpCost = 25; })).toEqual(['3 TP', 'false']);
  });

  it('lists only the drops taken and names what a full pack left behind', async () => {
    const { game, s, root } = setup();
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: { moss: 1 }, levelUps: [], left: { 'bat-wing': 2, 'thorn-fang': 1 }, gear: [], gearLeft: [] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).toContain('發光苔 ×1');
    expect(lines).toContain('背包已滿，留下了 蝙蝠翼膜 ×2');
    expect(lines).toContain('背包已滿，留下了 荊棘牙 ×1');
    expect(lines).not.toContain('蝙蝠翼膜 ×2');
  });

  it('a won rescue keeps the result list to the spoils', async () => {
    const run = async (benched: boolean) => {
      const { game, s, root } = setup();
      const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], met: { id: 'selene' as const, level: 4, benched } };
      vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
      for (let i = 0; i < 5; i++) s.onAction('down');
      s.onAction('confirm');
      await flush();
      return [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent ?? '');
    };
    for (const benched of [false, true]) {
      const got = await run(benched);
      expect(got).toContain(T.battle.exp(5));
      // Who joined, and her words, are told in the dialogue box after 繼續 (story polish Task 1), never in the list.
      expect(got).not.toContain(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));
      expect(got).not.toContain(T.ui2.rescue.benched(CHARACTERS.selene.name, 4));
      for (const l of STORY.meet.selene.after) expect(got.join('\n'), l.text).not.toContain(l.text);
    }
  });

  it('a won fight lists the memories found', async () => {
    const { game, s, root } = setup();
    const fragments = [
      { kind: 'piece' as const, id: 'rin' as const, n: 2, play: false },
      { kind: 'shard' as const, grade: 'clear' as const },
      { kind: 'town' as const, id: 'marta' as const },
    ];
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], met: { id: 'selene' as const, level: 4, benched: false }, fragments };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).not.toContain(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));   // the join line is said after 繼續 (story polish Task 1)
    expect(lines[0]).toBe(T.ui2.memory.piece(CHARACTERS.rin.name, 2));
    expect(lines[1]).toBe(T.ui2.memory.shard(SHARD_NAMES.clear));
    expect(lines[2]).toBe(T.ui2.memory.town('瑪莎的記憶碎片'));
  });

  it('a fragment that did not fit is told once, as left behind', async () => {
    const { game, s, root } = setup();
    const fragments = [{ kind: 'shard' as const, grade: 'dim' as const }, { kind: 'town' as const, id: 'marta' as const }];
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: { 'shard-dim': 1 }, gear: [], gearLeft: [], fragments };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).not.toContain(T.ui2.memory.shard(SHARD_NAMES.dim));
    expect(lines).toContain(T.battle.leftBehind(SHARD_NAMES.dim, 1));
    expect(lines).toContain(T.ui2.memory.town('瑪莎的記憶碎片'));   // the one that fit is still told as found
    expect(lines.filter((l) => l?.includes(SHARD_NAMES.dim))).toHaveLength(1);
  });

  it('the result lists the points a level-up brings', async () => {
    const { game, s, root } = setup();
    game.state.party.roster.noel.level = 6;
    game.state.party.roster.liz.level = 5;
    game.state.party.roster.chizuru.level = 8;
    const levelUps = [
      { id: 'noel' as const, levels: 2, points: { skill: 1, talent: 1 } },
      { id: 'liz' as const, levels: 1, points: { skill: 1, talent: 0 } },
      { id: 'chizuru' as const, levels: 1, points: { skill: 0, talent: 1 } },
    ];
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps, left: {}, gear: [], gearLeft: [] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).toEqual([
      '經驗值 +5', '金錢 +7',
      '諾艾兒 升到 Lv 6', '諾艾兒 獲得技能點 1（狀態→技能樹）、天賦點 1（狀態→天賦）',
      '莉茲 升到 Lv 5', '莉茲 獲得技能點 1（狀態→技能樹）',
      '千鶴 升到 Lv 8', '千鶴 獲得天賦點 1（狀態→天賦）',
    ]);
  });

  it('shows no left-behind line when everything fit', async () => {
    const { game, s, root } = setup();
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: { moss: 1 }, levelUps: [], left: {}, gear: [], gearLeft: [] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).toEqual(['經驗值 +5', '金錢 +7', '發光苔 ×1']);
  });

  it('shows the results after a win and returns to the labyrinth', async () => {
    const { go, s, root } = setup((g) => { for (const e of g.battle!.enemies) e.hp = 1; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-result')!.textContent).toContain('勝利');
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
  });

  it('opens with an encounter banner and closes a win with a victory banner before the results', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
      game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
      for (const e of game.battle!.enemies) e.hp = 1;
      const root = document.createElement('div');
      const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: false });
      s.enter(root);
      expect(root.querySelector('.slx-banner')!.textContent).toBe('遭遇！');
      await vi.advanceTimersByTimeAsync(1500);
      expect(root.querySelector('.slx-banner')).toBeNull();
      for (let i = 0; i < 5; i++) s.onAction('down');
      s.onAction('confirm');
      for (let t = 0; t < 100 && !root.querySelector('.slx-banner'); t++) await vi.advanceTimersByTimeAsync(50);
      expect(root.querySelector('.slx-banner')!.textContent).toBe('勝利！');
      expect(root.querySelector('.slx-result')).toBeNull();          // the banner first, then the rewards
      await vi.advanceTimersByTimeAsync(1200);
      expect(root.querySelector('.slx-result')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks level-ups in the results so they stand out', async () => {
    const { s, root } = setup((g) => { for (const e of g.battle!.enemies) e.hp = 1; g.state.party.roster.scarlet.exp = 999; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const ups = [...root.querySelectorAll('.slx-result .slx-levelup')].map((e) => e.textContent);
    expect(ups.some((t) => t!.includes('絲嘉蕾'))).toBe(true);
  });

  it('shows the wipe and returns to town after a loss', async () => {
    const { go, s, root } = setup((g) => {
      g.battle!.party.forEach((c, i) => { c.hp = i === 0 ? 1 : 0; c.alive = i === 0; });   // one member left standing
      for (const e of g.battle!.enemies) { e.max.atk = 999; e.max.spd = 99; }
    });
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');                              // 防禦
    await flush();
    expect(root.querySelector('.slx-result')!.textContent).toContain('全滅');
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('town');
  });
});

describe('BattleScene sound and failure safety', () => {
  afterEach(() => vi.useRealTimers());
  it('calls sound methods on their own object (a real SoundManager uses this)', async () => {
    class Sfx { hits = 0; cursor() {} confirm() {} cancel() {} error() {} hit() { this.hits++; } }
    const sfx = new Sfx();
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) e.hp = 1;
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: async (_s: unknown, fx: { hit(): void }) => { fx.hit(); } } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(sfx.hits).toBe(1);
    expect(root.querySelector('.slx-result')).not.toBeNull();
  });

  it('updates the HP of a member the moment they are hit, and hides the command window while the round plays', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) { e.max.atk = 999; e.max.spd = 99; }
    const root = document.createElement('div');
    let seen = '';
    let expected = '';
    let before = '';
    let cmdHidden = false;
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (end: { party: { key: string; hp: number; max: { hp: number } }[] }, _fx: unknown, on: (k: string, cue: string) => Promise<void>) => {
        const hurt = end.party.find((c) => c.hp < c.max.hp)!;   // whoever the enemies hit this round
        const key = hurt.key;
        before = root.querySelector(`.slx-pm[data-key="${key}"] .slx-pm-num`)!.textContent!;
        expected = `${hurt.hp}/${hurt.max.hp}`;
        await on(key, 'hit');
        seen = root.querySelector(`.slx-pm[data-key="${key}"] .slx-pm-num`)!.textContent!;
        cmdHidden = (root.querySelector('.slx-bcmd') as HTMLElement).hidden;
      } } };
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(expected).not.toBe(before);   // the hit really lands this round
    expect(seen).toBe(expected);
    expect(cmdHidden).toBe(true);
  });

  it('ignores input for a moment after the results appear, so a held key cannot skip them', async () => {
    vi.useFakeTimers();
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) e.hp = 1;
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: false });
    s.enter(root);
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    for (let t = 0; t < 100 && !root.querySelector('.slx-result'); t++) await vi.advanceTimersByTimeAsync(50);
    s.onAction('confirm');
    (root.querySelector('.slx-result [role=option]') as HTMLElement).click();   // the mouse is held back too
    expect(go).not.toHaveBeenCalled();
    expect((root.querySelector('.slx-bcmd') as HTMLElement).hidden).toBe(true);   // no empty command window behind the results
    await vi.advanceTimersByTimeAsync(400);
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
    vi.useRealTimers();
  });

  it('scrolls long results with the up and down keys', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) e.hp = 1;
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const lines = root.querySelector('.slx-result-lines') as HTMLElement;
    s.onAction('down');
    expect(lines.scrollTop).toBeGreaterThan(0);
    s.onAction('up');
    expect(lines.scrollTop).toBe(0);
  });

  it('takes each hit off the shown HP in turn when the amount is known', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const key = game.battle!.party[0].key;
    const max = game.battle!.party[0].max.hp;
    const seen: string[] = [];
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (_s: unknown, _fx: unknown, on: (k: string, cue: string, name?: string, amount?: number) => Promise<void>) => {
        const num = () => root.querySelector(`.slx-pm[data-key="${key}"] .slx-pm-num`)!.textContent!;
        await on(key, 'hit', undefined, 5); seen.push(num());
        await on(key, 'hit', undefined, 7); seen.push(num());
      } } };
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(seen).toEqual([`${max - 5}/${max}`, `${max - 12}/${max}`]);
  });

  it('shows each message line at the moment its event plays, keeping the action above its result', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const seen: string[] = [];
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (end: { log: { type: string }[] }, _fx: unknown, _on: unknown, onLine: (i: number) => void) => {
        const act = end.log.findIndex((e) => e.type === 'act');
        onLine(act); seen.push(root.querySelector('.slx-msg')!.textContent!);
        onLine(act + 1); seen.push(root.querySelector('.slx-msg')!.textContent!);
      } } };
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let k = 0; k < 9 && root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'auto'; k++) s.onAction('down');
    s.onAction('confirm');                                   // 全員攻擊
    await flush();
    expect(seen[0]).toMatch(/：攻擊$/);                      // only the action so far
    expect(seen[1].split('\n')).toHaveLength(2);           // action, then what it did
    expect(seen[1].split('\n')[0]).toBe(seen[0]);
  });

  it('shakes the whole screen and reddens its edges on a heavy hit to the party, lightly on a small one', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const screen = document.createElement('div');
    screen.className = 'slx-screen';
    const root = document.createElement('div');
    screen.append(root);
    const key = game.battle!.party[0].key;
    const max = game.battle!.party[0].max.hp;
    const seen: { shake: string; vignette: boolean; fx: string | null }[] = [];
    const look = () => seen.push({
      shake: [...screen.classList].find((c) => c.startsWith('slx-shake')) ?? '',
      vignette: !!root.querySelector('.slx-vignette'),
      fx: root.querySelector(`.slx-pm[data-key="${key}"] .slx-pm-fxa`)?.className ?? root.querySelector(`.slx-pm[data-key="${key}"] .slx-pm-fx`)?.getAttribute('src') ?? null,
    });
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (_s: unknown, _fx: unknown, on: (k: string, cue: string, name?: string, amount?: number, extra?: unknown) => Promise<void>) => {
        await on(key, 'hit', undefined, 1, { fx: 'slash', weak: false }); look();
        await on(key, 'hit', undefined, Math.ceil(max / 3), { fx: 'fire', weak: false }); look();
      } } };
    const fxArt = { has: (u: string) => u.includes('/fx/') };
    const s = new BattleScene({ game, art: fxArt, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(seen[0]).toMatchObject({ shake: 'slx-shake-s', vignette: false });
    expect(seen[0].fx).toContain('slash');
    expect(seen[1]).toMatchObject({ shake: 'slx-shake-l', vignette: true });
    expect(root.querySelector('.slx-eflash-fire')).not.toBeNull();   // the fire hit also tints the screen
  });

  it('throws a P5R-style cut-in for party actions: an eye strip for attacks, a bust for skills, none for defending or enemies', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const cutin = vi.fn();
    const seen: (string | null)[] = [];
    const look = () => { const c = root.querySelector('.slx-acut'); seen.push(c ? `${c.className}|${c.textContent}` : null); c?.remove(); };
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (end: { log: { type: string; actor?: string; label?: string }[] }, _fx: unknown, _on: unknown, onLine: (i: number) => void) => {
        end.log.push({ type: 'act', actor: 'scarlet', label: '攻擊' }, { type: 'act', actor: 'scarlet', label: '挑釁' },
          { type: 'act', actor: 'scarlet', label: '防禦' }, { type: 'act', actor: 'e0', label: '攻擊' });
        const n = end.log.length;
        for (const i of [n - 4, n - 3, n - 2, n - 1]) { onLine(i); look(); }
      } } };
    const s = new BattleScene({ game, art: { has: () => true }, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), cutin }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(seen[0]).toMatch(/slx-acut-eyes/);
    expect(seen[1]).toMatch(/slx-acut-bust/);
    expect(seen[1]).toContain('挑釁');
    expect(seen[1]).toMatch(/slx-aura-scarlet/);
    expect(seen[2]).toBeNull();
    expect(seen[3]).toBeNull();
    expect(cutin).toHaveBeenCalledTimes(2);
  });

  it('shows the intents of the enemies while the player chooses and clears them while the round plays', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const shown: Record<string, string>[] = [];
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, highlight: vi.fn(),
      showIntents: (m: Record<string, string>) => shown.push(m), play: async () => {} } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    expect(Object.values(shown[0]).every((t) => t.length > 0)).toBe(true);
    expect(Object.keys(shown[0])).toEqual(game.battle!.enemies.map((e) => e.key));
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(shown.some((m) => Object.keys(m).length === 0)).toBe(true);    // cleared for playback
    expect(Object.keys(shown[shown.length - 1]).length).toBeGreaterThan(0); // next round's plan
  });

  it('lights the enemy under the target cursor and lets go when the list closes', () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const highlight = vi.fn();
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: vi.fn(), anchor: () => null, highlight } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    s.onAction('confirm');                                   // 攻擊 → target list
    expect(highlight).toHaveBeenLastCalledWith('e0');
    s.onAction('down');
    expect(highlight).toHaveBeenLastCalledWith('e1');
    s.onAction('cancel');
    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it('buzzes the device on a heavy hit to the party', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const key = game.battle!.party[0].key;
    const max = game.battle!.party[0].max.hp;
    const vibrate = vi.fn();
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (_s: unknown, _fx: unknown, on: (k: string, cue: string, name?: string, amount?: number, extra?: unknown) => Promise<void>) => {
        await on(key, 'hit', undefined, 1, { fx: null, weak: false });
        await on(key, 'hit', undefined, Math.ceil(max / 2), { fx: null, weak: false });
      } } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true, vibrate });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('puts the target arrow just above the enemy under the cursor', () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: vi.fn(), anchor: (k: string) => ({ x: 300, y: k === 'e0' ? 200 : 140 }) } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    s.onAction('confirm');                                   // 攻擊: pick a target
    const marker = root.querySelector('.slx-target') as HTMLElement;
    expect(marker.classList.contains('slx-ty-20')).toBe(true);
    s.onAction('down');
    expect(marker.classList.contains('slx-ty-14')).toBe(true);
  });

  it('unlocks the screen and offers commands again if playback throws', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: async () => { throw new Error('boom'); } } };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.querySelectorAll('.slx-bcmd [role=option]').length).toBeGreaterThan(0);
    err.mockRestore();
  });
});

describe('BattleScene loot and stat cues', () => {
  const gearOf = (uid: number, base: string, rarity: ItemInstance['rarity']): ItemInstance => ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0 });

  it('won gear is listed with its rarity class; gear left behind is named', async () => {
    const { game, s, root } = setup();
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {},
      gear: [gearOf(1, 'iron-sword', 'rare'), gearOf(2, 'cloth-robe', 'common')], gearLeft: [gearOf(3, 'hunter-bow', 'magic')] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const sword = [...root.querySelectorAll('.slx-result-lines p')].find((p) => p.textContent!.includes('鐵劍'))!;
    expect(sword.classList.contains('slx-rarity-rare')).toBe(true);
    const robe = [...root.querySelectorAll('.slx-result-lines p')].find((p) => p.textContent!.includes('布袍'))!;
    expect(robe.classList.contains('slx-rarity-common')).toBe(true);
    const lines = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    expect(lines).toContain('背包已滿，留下了 獵弓・魔法');
    expect(lines).toContain('鐵劍・稀有');
    expect(lines).toContain('布袍');   // common carries no word
    expect(root.querySelector('.slx-result-lines .slx-rarity-magic')!.textContent).toBe('獵弓・魔法');
  });

  it('won gear and gear left behind show their gear icon when published', async () => {
    const published = [art.gear('iron-sword'), art.gear('hunter-bow')];
    const { game, s, root } = setup(undefined, { art: { has: (u) => published.includes(u) } });
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {},
      gear: [gearOf(1, 'iron-sword', 'rare'), gearOf(2, 'cloth-robe', 'common')], gearLeft: [gearOf(3, 'hunter-bow', 'magic')] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const line = (t: string) => [...root.querySelectorAll('.slx-result-lines p')].find((p) => p.textContent!.includes(t))!;
    const sword = line('鐵劍');
    expect(sword.querySelector('img.slx-gear-ico')!.getAttribute('src')).toBe(art.gear('iron-sword'));
    expect(sword.classList.contains('slx-rarity-rare')).toBe(true);
    expect(sword.textContent).toBe('鐵劍・稀有');
    expect(line('布袍').querySelector('img')).toBeNull();                       // no art: the name alone
    expect(line('獵弓').querySelector('img.slx-gear-ico')!.getAttribute('src')).toBe(art.gear('hunter-bow'));
    expect(line('獵弓').textContent).toBe('背包已滿，留下了 獵弓・魔法');
  });

  it('the result names each rune found (plan 8f Task 3)', async () => {
    const { game, s, root } = setup();
    const spread = { id: 'spread' as const, tier: 'magic' as const };
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: { moss: 1 }, levelUps: [], left: {},
      gear: [gearOf(1, 'iron-sword', 'rare')], gearLeft: [], runes: [spread, { id: 'twin-cast' as const, tier: 'legendary' as const }],
      runeGold: [{ rune: spread, gold: 60, at: 1 }] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    const ps = [...root.querySelectorAll('.slx-result-lines p')];
    const texts = ps.map((p) => p.textContent);
    const got = ps.find((p) => p.textContent === '得到符文：擴散（魔法）')!;
    expect(got.classList.contains('slx-loot-rune')).toBe(true);
    expect(got.classList.contains('slx-rarity-magic')).toBe(true);
    expect(ps.find((p) => p.textContent === '得到符文：雙重詠唱（傳說）')!.classList.contains('slx-rarity-legendary')).toBe(true);
    const paid = ps.find((p) => p.textContent === '擴散（魔法）已經 99 個，換成 60 G')!;
    expect(paid.classList.contains('slx-loot-rune')).toBe(true);
    // After the gear, before the materials; each rune once.
    expect(texts.indexOf('得到符文：擴散（魔法）')).toBeGreaterThan(texts.indexOf('鐵劍・稀有'));
    expect(texts.indexOf('擴散（魔法）已經 99 個，換成 60 G')).toBeLessThan(texts.findIndex((t) => t!.includes('發光苔')));
    expect(texts.filter((t) => t!.includes('擴散（魔法）'))).toHaveLength(2);
    // In the order they dropped: the one paid as gold stands where it fell, between the two found.
    expect(ps.filter((p) => p.classList.contains('slx-loot-rune')).map((p) => p.textContent))
      .toEqual(['得到符文：擴散（魔法）', '擴散（魔法）已經 99 個，換成 60 G', '得到符文：雙重詠唱（傳說）']);
  });

  it('a win without runes shows no rune line (plan 8f Task 3)', async () => {
    const { s, root } = setup((g) => { for (const e of g.battle!.enemies) e.hp = 1; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-result')!.textContent).toContain('勝利');
    expect(root.querySelector('.slx-loot-rune')).toBeNull();
  });

  it('the first boss names its rune once, behind the victory banner (plan 8f Task 3)', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
      game.state.dungeon.reached.iron = 5;
      game.state.runeTutorialSeen = true;   // the rune tutorial after this result has its own tests (plan 8g Task 6)
      expect(game.depart({ region: 'iron', condition: 'plain' }, 5)).toEqual({ ok: true });
      const at = game.map().boss!;
      const from = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy })).find((p) => game.map().tiles[p.y]?.[p.x] === 'floor')!;
      game.pos = from;
      const dir = at.x > from.x ? 'right' : at.x < from.x ? 'left' : at.y > from.y ? 'down' : 'up';
      expect(game.move(dir)).toEqual({ kind: 'boss' });
      for (const e of game.battle!.enemies) e.hp = 1;
      const root = document.createElement('div');
      const go = vi.fn();
      const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: false });
      s.enter(root);
      await vi.advanceTimersByTimeAsync(1500);
      s.onAction('up');   // 全員攻擊, the last command
      s.onAction('confirm');
      for (let t = 0; t < 200 && !root.querySelector('.slx-result'); t++) await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(3000);
      const lines = () => [...root.querySelectorAll('.slx-loot-rune')].map((p) => p.textContent);
      expect(root.querySelectorAll('.slx-result')).toHaveLength(1);
      expect(lines()).toEqual(['得到符文：擴散（魔法）']);
      expect(game.state.runesOpen).toBe(true);
      s.onAction('confirm');
      expect(go).toHaveBeenCalledWith('dungeon');
      expect(lines()).toEqual(['得到符文：擴散（魔法）']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the best drop raises one pillar and plays loot once', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const loot = vi.fn();
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), loot }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
    s.enter(root);
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {},
      gear: [gearOf(1, 'iron-sword', 'magic'), gearOf(2, 'cloth-robe', 'rare'), gearOf(3, 'hunter-bow', 'common')], gearLeft: [gearOf(4, 'hunter-bow', 'legendary')] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    // Gear left behind is not a drop: the rare piece is the best one won. The pillar stands on the result window.
    expect(root.querySelectorAll('.slx-pillar').length).toBe(1);
    expect(root.querySelector('.slx-result > .slx-pillar')!.classList.contains('slx-rarity-rare')).toBe(true);
    expect(loot).toHaveBeenCalledTimes(1);
    expect(loot).toHaveBeenCalledWith('rare', 150);
  });

  it('confirm or cancel skips a legendary moment over the results; other keys pass; the next confirm goes on', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
      game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
      const root = document.createElement('div');
      const go = vi.fn();
      const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), loot: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: false });
      s.enter(root);
      const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [gearOf(1, 'iron-sword', 'legendary')], gearLeft: [] };
      vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
      for (let i = 0; i < 5; i++) s.onAction('down');
      s.onAction('confirm');
      await vi.advanceTimersByTimeAsync(1400);   // the win banner, then the results and their input guard
      expect(root.querySelector('.slx-result > .slx-pillar-legend')).not.toBeNull();
      s.onAction('down');   // scrolls the lines; not a skip
      expect(root.querySelector('.slx-pillar-legend')).not.toBeNull();
      s.onAction('confirm');
      expect(root.querySelector('.slx-pillar')).toBeNull();
      expect(go).not.toHaveBeenCalled();   // the key went to the skip
      s.onAction('confirm');
      expect(go).toHaveBeenCalledWith('dungeon');
    } finally { vi.useRealTimers(); }
  });

  it('fast mode never spends a key on the legendary moment', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const go = vi.fn();
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), loot: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
    s.enter(root);
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [gearOf(1, 'iron-sword', 'unique')], gearLeft: [] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-pillar-legend')).not.toBeNull();
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
  });

  it('a win with only common gear, or none, raises no pillar and plays no loot cue', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const loot = vi.fn();
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), loot }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
    s.enter(root);
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [gearOf(1, 'cloth-robe', 'common')], gearLeft: [] };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-result')).not.toBeNull();
    expect(root.querySelector('.slx-pillar')).toBeNull();
    expect(loot).not.toHaveBeenCalled();
  });

  it('shows MISS, crit and TP pops on the struck member, and no message line for TP regen', async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const key = game.battle!.party[0].key;
    const found: string[] = [];
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (_s: unknown, _fx: unknown, on: (k: string, cue: string, name?: string, amount?: number, extra?: object) => Promise<void>) => {
        const panel = () => root.querySelector(`.slx-pm[data-key="${key}"]`)!;
        await on(key, 'miss'); found.push(panel().querySelector('.slx-pm-miss')?.textContent ?? '');
        await on(key, 'hit', undefined, 5, { fx: null, weak: false, crit: true }); found.push(panel().querySelector('.slx-pm-crit')?.textContent ?? '');
        await on(key, 'tp', undefined, 3); found.push(panel().querySelector('.slx-pm-pop-tp')?.textContent ?? '');
      } } };
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(found).toEqual(['MISS', '暴擊！', '+3 TP']);
  });

  it('without a stage, the message window never shows a TP regen line', async () => {
    const { game, s, root } = setup();
    const key = game.battle!.party[0].key;
    vi.spyOn(game, 'submitRound').mockImplementation(() => ({ battle: { ...game.battle!, log: [
      { type: 'act', actor: key, label: '防禦' }, { type: 'tp', target: key, amount: 3, regen: true },
    ] }, end: null }));
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(root.querySelector('.slx-msg')!.textContent).toBe(`${game.battle!.party[0].name}：防禦`);   // no blank second line
  });
});

describe('BattleScene after the oath', () => {
  it("after her oath Rin's ultimate cut-in uses rin-oath", async () => {
    const game = new Game(constRng(0.99), null, undefined, 0, ['rin', 'hero', 'scarlet'] as never);
    game.state.party.roster.rin = { ...game.state.party.roster.rin, memories: chainLength('rin'), oath: true };
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const root = document.createElement('div');
    const faces: (string | null)[] = [];
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null,
      play: async (_s: unknown, _fx: unknown, on: (k: string, cue: string, name?: string) => Promise<void>) => {
        const done = on('rin', 'ultimate', '破鐘・黎明之刃');
        faces.push(root.querySelector('.sl-cutin__face')?.getAttribute('src') ?? null);
        await done;
      } } };
    const s = new BattleScene({ game, art: { has: () => true }, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await vi.waitFor(() => expect(faces.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(faces[0]).toBe(art.portrait('rin-oath', 'ultimate'));
    s.exit?.();
  });
});

describe('BattleScene story', () => {
  const instant: Partial<SceneCtx> = { settings: { get: () => ({ ...DEFAULT_SETTINGS, textSpeed: 'instant' }) } };
  const win = (game: Game, fragments: { kind: 'piece'; id: 'rin'; n: number; play: boolean }[]) => {
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], fragments };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
  };
  const fight = async (s: BattleScene) => { for (let i = 0; i < 5; i++) s.onAction('down'); s.onAction('confirm'); await flush(); };
  const talkHidden = (root: HTMLElement) => root.querySelector('.slx-talk')!.hasAttribute('hidden');

  it('the finale boss shows its own name', () => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.state.dungeon.reached.mainline = FINALE_DEPTH;
    game.state.party = meet(game.state.party, 'rin', 1);   // the finale starts once Rin has made her choice
    Object.assign(game.state.party.roster.rin, { memories: chainLength('rin'), oath: true });
    expect(game.depart({ region: 'mainline', condition: 'plain' }, FINALE_DEPTH)).toEqual({ ok: true });
    const boss = game.map().boss!;
    game.pos = { x: boss.x - 1, y: boss.y };
    if (game.map().tiles[boss.y][boss.x - 1] === 'wall') game.pos = { x: boss.x + 1, y: boss.y };
    game.move(game.pos.x < boss.x ? 'right' : 'left');
    expect(game.phase).toBe('battle');
    const root = document.createElement('div');
    new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }).enter(root);
    expect(root.querySelector('.slx-msg')!.textContent).toContain(STORY.finaleBossName);
  });

  it('a played memory follows the result window', async () => {
    const { game, go, s, root } = setup((g) => { g.pending.push('mem:rin:1'); }, instant);
    win(game, [{ kind: 'piece', id: 'rin', n: 1, play: true }]);
    await fight(s);
    s.onAction('confirm');   // 繼續
    await flush();
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-talk--memory')).not.toBeNull();
    expect((root.querySelector('.slx-result') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('.slx-msg') as HTMLElement).hidden).toBe(true);   // the foes' names gone with them (Task 6 review)
    for (let i = 0; i < 40 && !talkHidden(root); i++) { s.onAction('confirm'); await flush(); }
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(game.state.story.seen).toContain('mem:rin:1');
    expect(game.pending).toEqual([]);
  });

  it('a memory that does not play now leaves at once', async () => {
    const { game, go, s, root } = setup(undefined, instant);
    win(game, [{ kind: 'piece', id: 'rin', n: 2, play: false }]);
    await fight(s);
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
  });

  it('after a played memory a clear still goes to the clear screen', async () => {
    const { game, go, s, root } = setup((g) => { g.pending.push('mem:rin:2'); }, instant);
    win(game, [{ kind: 'piece', id: 'rin', n: 2, play: true }]);
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'clear'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end: { outcome: 'win', exp: 1, gold: 1, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], fragments: [{ kind: 'piece', id: 'rin', n: 2, play: true }] } }; });
    await fight(s);
    s.onAction('confirm');
    await flush();
    for (let i = 0; i < 40 && !talkHidden(root); i++) { s.onAction('confirm'); await flush(); }
    expect(go).toHaveBeenCalledWith('clear');
  });

  it('a memory that fails to record does not lock the result', async () => {
    const { game, go, s, root } = setup((g) => { g.pending.push('mem:rin:1'); }, instant);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(game, 'sceneDone').mockImplementation(() => { throw new Error('boom'); });
    win(game, [{ kind: 'piece', id: 'rin', n: 1, play: true }]);
    await fight(s);
    s.onAction('confirm');
    await flush();
    for (let i = 0; i < 40 && !talkHidden(root); i++) { s.onAction('confirm'); await flush(); }
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  // Story polish Task 1 (S1 A1): who joins, and her words, play in the dialogue box after 繼續, not in the result list.
  const rescueWin = (game: Game, benched = false, fragments: { kind: 'piece'; id: 'rin'; n: number; play: boolean }[] = []) => {
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], met: { id: 'selene' as const, level: 4, benched }, fragments };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
  };
  const plateOf = (root: HTMLElement) => root.querySelector('.slx-talk .slx-name')!.textContent ?? '';
  const textOf = (root: HTMLElement) => root.querySelector('.slx-talk .slx-text')!.textContent ?? '';
  /** Reads the dialogue to its end, one confirm a line: the plates and the lines, in order. */
  const readOut = async (s: BattleScene, root: HTMLElement) => {
    const plates: string[] = [], texts: string[] = [];
    for (let i = 0; i < 20 && !talkHidden(root); i++) { plates.push(plateOf(root)); texts.push(textOf(root)); s.onAction('confirm'); await flush(); }
    return { plates, texts };
  };
  const joinedLine = (benched = false) => (benched ? T.ui2.rescue.benched : T.ui2.rescue.joined)(CHARACTERS.selene.name, 4);
  /** Puts `lines` in Selene's after-lines for the test, and back after it. */
  const withAfter = async (lines: ScriptLine[], fn: () => Promise<void>) => {
    const after = STORY.meet.selene.after;
    const saved = [...after];
    after.splice(0, after.length, ...lines);
    try { await fn(); } finally { after.splice(0, after.length, ...saved); }
  };
  const three: ScriptLine[] = [{ who: 'selene', text: '謝謝你們。' }, { who: 'narrator', text: '她收起了劍。' }, { who: 'selene', text: '我是瑟蕾。' }];

  it('her words play in the dialogue box after 繼續, her plate once she has said her name, then the join line', async () => {
    await withAfter(three, async () => {
      const { game, go, s, root } = setup(undefined, instant);
      rescueWin(game);
      await fight(s);
      expect(talkHidden(root)).toBe(true);   // nothing said over the result window
      s.onAction('confirm');                 // 繼續
      await flush();
      expect((root.querySelector('.slx-result') as HTMLElement).hidden).toBe(true);
      const { plates, texts } = await readOut(s, root);
      expect(plates).toEqual([T.ui2.rescue.stranger, '', CHARACTERS.selene.name, '']);
      expect(texts).toEqual(['謝謝你們。', '她收起了劍。', '我是瑟蕾。', joinedLine()]);
      expect(go).toHaveBeenCalledTimes(1);
      expect(go).toHaveBeenCalledWith('dungeon');
    });
  });

  it('a benched rescue ends on the bench line', async () => {
    const { game, s, root } = setup(undefined, instant);
    rescueWin(game, true);
    await fight(s);
    s.onAction('confirm');
    await flush();
    const { texts } = await readOut(s, root);
    expect(texts).toEqual([...STORY.meet.selene.after.map((l) => l.text), joinedLine(true)]);
    expect(texts).not.toContain(joinedLine());
  });

  it('cancel during her words goes straight to the join line, then the memories', async () => {
    const { game, go, s, root } = setup((g) => { g.pending.push('mem:rin:1'); }, instant);
    rescueWin(game, false, [{ kind: 'piece', id: 'rin', n: 1, play: true }]);
    await fight(s);
    s.onAction('confirm');   // 繼續
    await flush();
    expect(textOf(root)).toBe(STORY.meet.selene.after[0].text);
    s.onAction('cancel');
    await flush();
    expect(textOf(root)).toBe(joinedLine());
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-talk--memory')).not.toBeNull();   // her memory follows the join line
    expect(go).not.toHaveBeenCalled();
    for (let i = 0; i < 40 && !talkHidden(root); i++) { s.onAction('confirm'); await flush(); }
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(game.state.story.seen).toContain('mem:rin:1');
  });

  it('confirm on the join line leaves exactly once', async () => {
    const { game, go, s, root } = setup(undefined, instant);
    rescueWin(game);
    await fight(s);
    s.onAction('confirm');   // 繼續
    await flush();
    for (let i = 0; i < 20 && textOf(root) !== joinedLine(); i++) { s.onAction('confirm'); await flush(); }
    expect(textOf(root)).toBe(joinedLine());
    expect(go).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) s.onAction('confirm');   // a held key on the join line
    await flush();
    s.onAction('confirm');                               // and once more, on what was the result menu
    await flush();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('dungeon');
  });

  it('her words play whatever the story setting', async () => {
    const none: Partial<SceneCtx> = { settings: { get: () => ({ ...DEFAULT_SETTINGS, textSpeed: 'instant', story: 'none' }) } };
    const { game, go, s, root } = setup(undefined, none);
    rescueWin(game);
    await fight(s);
    s.onAction('confirm');
    await flush();
    const { texts } = await readOut(s, root);
    expect(texts).toEqual([...STORY.meet.selene.after.map((l) => l.text), joinedLine()]);
    expect(go).toHaveBeenCalledWith('dungeon');
  });

  it('Esc while her line is still typing jumps to the join line, and Esc on the join line finishes it before it closes it', async () => {
    const { game, go, s, root } = setup();   // no settings: the default speed, so every line types out
    rescueWin(game);
    await fight(s);
    s.onAction('confirm');   // 繼續
    await flush();
    const first = STORY.meet.selene.after[0].text;
    expect(textOf(root).length).toBeLessThan(first.length);   // her first line is still typing
    s.onAction('cancel');
    await flush();
    const join = joinedLine();
    expect(talkHidden(root)).toBe(false);
    expect(plateOf(root)).toBe('');                              // the narrator's join line, not more of her words
    expect(join.startsWith(textOf(root))).toBe(true);
    expect(textOf(root).length).toBeLessThan(join.length);      // and it is typing in turn
    s.onAction('cancel');                                        // Esc on a typing join line only finishes it
    await flush();
    expect(textOf(root)).toBe(join);
    expect(talkHidden(root)).toBe(false);
    expect(go).not.toHaveBeenCalled();
    s.onAction('cancel');                                        // read: Esc closes it as confirm does
    await flush();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('dungeon');
    s.exit?.();
  });
});

describe('BattleScene mechanics (plan 8c)', () => {
  const stageWith = (play = vi.fn()) => {
    const showAilments = vi.fn();
    return { showAilments, stage: { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, showIntents: vi.fn(), syncHp: vi.fn(), showAilments, play } } };
  };

  it("the bar shows each member's mechanic, and each foe's words go to the picture", () => {
    const { showAilments, stage } = stageWith();
    const { root } = setup((g) => {
      const noel = g.battle!.party.find((c) => c.key === 'noel')!;
      noel.mech = { kind: 'heat', heat: 3 };
      g.battle!.enemies[0].exposed = 2;
    }, { stage: stage as never });
    const row = root.querySelector('.slx-partybar [data-key=noel] .slx-pm-ail')!;
    expect(row.querySelector('.slx-mech-heat')!.textContent).toBe('熱度3');
    expect(root.querySelector('.slx-partybar [data-key=scarlet] .slx-mech-embers')!.textContent).toBe('餘燼0');
    expect(root.querySelector('.slx-partybar [data-key=selene] .slx-pm-ail')!.textContent).toBe('');
    expect(showAilments.mock.calls.at(-1)![1]).toMatchObject({ e0: [{ tone: 'expose', text: '弱點2' }] });
  });

  it('skill costs in the menu are the cost she pays now', () => {
    const { s, root } = setup();
    forced.cost = 1;
    try {
      s.onAction('down'); s.onAction('confirm');   // 技能
      const rights = [...root.querySelectorAll('.slx-bsub [role=option] .slx-right')].map((e) => e.textContent);
      expect(rights.length).toBeGreaterThan(0);
      expect(new Set(rights)).toEqual(new Set([T.cmd.tp(1)]));
    } finally { forced.cost = null; }
  });

  it('a mech event pops its word over the member', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const play = vi.fn(async (_s: unknown, _sfx: unknown, onParty: (k: string, cue: string, name?: string) => void) => { onParty('noel', 'mech', 'overload'); });
    const { stage } = stageWith(play);
    const { s, root } = setup(undefined, { stage: stage as never });
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    await flush();
    expect(play).toHaveBeenCalled();
    const pop = root.querySelector('.slx-partybar [data-key=noel] .slx-pm-cue');
    expect(pop?.textContent).toBe(T.mech.cue.overload);
    expect(pop?.classList.contains('slx-mech-heat')).toBe(true);
    vi.useRealTimers();
  });
});

describe('BattleScene art (no placeholder)', () => {
  it("waits, up to the cap, for this fight's enemy pictures and backdrop before drawing it", async () => {
    const { BATTLE_ART_WAIT_MS } = await import('./battle');
    const { enemyArt, art: paths } = await import('../../render/artPaths');
    const whenReady = vi.fn(async () => {});
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.depart({ region: 'mainline', condition: 'plain' }, 1); game.encounter = 99; game.move('right');
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, showIntents: vi.fn(), syncHp: vi.fn(), showAilments: vi.fn(), play: vi.fn() } };
    const s = new BattleScene({ game, art: { has: () => false, whenReady }, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    await s.prepare!();
    expect(BATTLE_ART_WAIT_MS).toBe(1500);
    const urls = [...new Set(game.battle!.enemies.map((e) => enemyArt(e.defId))), paths.bg(game.terrain())];
    expect(whenReady).toHaveBeenCalledWith(urls, BATTLE_ART_WAIT_MS);
    // Without a picture layer there is nothing to wait for.
    const bare = new BattleScene({ game, art: { has: () => false, whenReady }, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
    await bare.prepare!();
    expect(whenReady).toHaveBeenCalledTimes(1);
  });
});

describe('BattleScene field bar (plan 8c)', () => {
  it('the field bar shows the barrier and the moon', () => {
    const { root, s } = setup((g) => {
      g.battle!.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }];
      g.battle!.moon = { phase: 'full' };
    });
    const bar = root.querySelector<HTMLElement>('.slx-fieldbar')!;
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.hidden).toBe(false);
    expect([...bar.children].map((c) => [c.className, c.textContent])).toEqual([['slx-mech slx-mech-ward', '守之結界3'], ['slx-mech slx-mech-moon', '月相：滿月→下弦']]);
    s.exit?.();
    const plain = setup((g) => { delete g.battle!.barriers; delete g.battle!.moon; });
    const none = plain.root.querySelector<HTMLElement>('.slx-fieldbar')!;
    expect(none.hidden).toBe(true);
    expect(none.children).toHaveLength(0);
  });
});

describe('BattleScene coins (plan 8c)', () => {
  it("Liz's left-over coins are a line under the gold", async () => {
    const { s, root } = setup((g) => {
      const liz = g.battle!.party.find((c) => c.key === 'liz')!;
      liz.mech = { kind: 'coins', coins: 6 };
      for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    });
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    await flush();
    expect(root.querySelector('.slx-result')).not.toBeNull();
    expect(root.querySelector('.slx-result')!.textContent).toContain(T.battle.coinGold(12));
  });
});

describe('BattleScene empty resources (plan 8c)', () => {
  it('a skill with nothing to spend is shown, greyed, with the reason in place of its TP', () => {
    const { s, root, game } = setup((g) => {
      for (const c of g.battle!.party) if (c.key !== 'liz' && c.key !== 'chizuru') c.frozen = true;
      g.state.party.roster.liz.tree = { ...g.state.party.roster.liz.tree, jackpot: 1 };
      g.state.party.roster.chizuru.tree = { ...g.state.party.roster.chizuru.tree, 'great-barrier': 1 };
      for (const c of g.battle!.party) { c.ranks = { ...c.ranks, jackpot: 1, 'great-barrier': 1 }; c.tp = c.max.tp; }
      g.battle!.party.find((c) => c.key === 'liz')!.mech = { kind: 'coins', coins: 0 };
      delete g.battle!.barriers;
    });
    // The skill list as the menu builds it (a long list scrolls, so it is read whole).
    const list = (key: string) => (s as unknown as { skillItems(a: Combatant): { label: string; right?: string; disabled?: boolean }[] })
      .skillItems(game.battle!.party.find((c) => c.key === key)!);
    const gb = list('chizuru').find((i) => i.label === '大結界')!;
    expect([gb.disabled, gb.right]).toEqual([true, T.mech.noBarrier]);
    const jp = list('liz').find((i) => i.label === '一擲千金')!;
    expect([jp.disabled, jp.right]).toEqual([true, T.mech.noCoins]);
    // With coins and a barrier, both are offered again at their TP.
    game.battle!.party.find((c) => c.key === 'liz')!.mech = { kind: 'coins', coins: 3 };
    game.battle!.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }];
    expect(list('liz').find((i) => i.label === '一擲千金')!.disabled).toBe(false);
    expect(list('chizuru').find((i) => i.label === '大結界')!.right).toBe(T.cmd.tp(12));
    expect(root).toBeDefined();
  });

  it('the sim never casts one either', async () => {
    const { choose, partyAt } = await import('../../engine/sim');
    const { makeBattle, makeCombatant } = await import('../../engine/testing');
    const party = partyAt(50, { ids: ['hero', 'rin', 'liz', 'chizuru', 'selene'] });
    party.roster.liz.tree = { ...party.roster.liz.tree, jackpot: 1 };
    const s = makeBattle([makeCombatant({ key: 'liz', side: 'party', defId: 'liz', mech: { kind: 'coins', coins: 0 }, ranks: { ...party.roster.liz.tree }, tp: 99, max: { hp: 100, tp: 99, atk: 20, def: 20, mag: 20, res: 20, spd: 10 } })],
      [makeCombatant({ key: 'e0', side: 'enemy' })]);
    expect(choose(s, party, { liz: [{ kind: 'spend-at', gauge: 'coins', min: 0, skill: 'jackpot' }] }).liz).not.toMatchObject({ skill: 'jackpot' });
  });
});

describe('BattleScene: the rune tutorial (plan 8g Task 6)', () => {
  const instant: Partial<SceneCtx> = { settings: { get: () => ({ ...DEFAULT_SETTINGS, textSpeed: 'instant' }) } };
  const pages = () => T.rune.tutorial(RUNE_SLOT_LEVELS, T.ui2.guild.workshop, T.ui2.dungeon.workshop);
  const spread = { id: 'spread' as const, tier: 'magic' as const };
  /** The next round wins, with these runes found. */
  const winWith = (game: Game, runes?: (typeof spread)[]) => {
    const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], ...(runes ? { runes } : {}) };
    vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
  };
  const fight = async (s: BattleScene) => { for (let i = 0; i < 5; i++) s.onAction('down'); s.onAction('confirm'); await flush(); };
  const said = (root: HTMLElement) => root.querySelector('.slx-talk .slx-text')!.textContent;
  const talkHidden = (root: HTMLElement) => root.querySelector('.slx-talk')!.hasAttribute('hidden');

  it('the first rune found plays the rune tutorial once', async () => {
    for (const extra of [instant, { ...instant, fast: true }]) {
      const { game, go, s, root } = setup(undefined, extra);
      winWith(game, [spread]);
      await fight(s);
      s.onAction('confirm');                                                 // 繼續
      await flush();
      expect(go).not.toHaveBeenCalled();
      expect((root.querySelector('.slx-result') as HTMLElement).hidden).toBe(true);
      expect((root.querySelector('.slx-msg') as HTMLElement).hidden).toBe(true);
      expect(root.querySelector('.slx-talk .slx-name')!.hasAttribute('hidden')).toBe(true);   // narration: no name
      const seen: string[] = [];
      for (let i = 0; i < 10 && !talkHidden(root); i++) { seen.push(said(root)!); s.onAction('confirm'); await flush(); }
      expect(seen).toEqual(pages());
      expect(game.state.runeTutorialSeen).toBe(true);
      expect(go).toHaveBeenCalledWith('dungeon');
    }
    // The next rune found: no tutorial.
    const again = setup((g) => { g.state.runeTutorialSeen = true; }, instant);
    winWith(again.game, [spread]);
    await fight(again.s);
    again.s.onAction('confirm');
    expect(again.go).toHaveBeenCalledWith('dungeon');
    expect(talkHidden(again.root)).toBe(true);
  });

  it('a tutorial that fails still leaves the battle', async () => {
    const { game, go, s } = setup(undefined, instant);
    winWith(game, [spread]);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(game, 'seeRuneTutorial').mockImplementation(() => { throw new Error('broken'); });
    try {
      await fight(s);
      s.onAction('confirm');
      for (let i = 0; i < 10 && !go.mock.calls.length; i++) { s.onAction('confirm'); await flush(); }
      expect(go).toHaveBeenCalledWith('dungeon');
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it('no rune, no tutorial', async () => {
    const { game, go, s, root } = setup(undefined, instant);
    winWith(game);
    await fight(s);
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(talkHidden(root)).toBe(true);
    expect(game.state.runeTutorialSeen).toBeUndefined();
  });

  it('the tutorial names the slot levels it is given, never typed in', () => {
    const say = (levels: readonly number[]) => T.rune.tutorial(levels, T.ui2.guild.workshop, T.ui2.dungeon.workshop).join('');
    for (const n of RUNE_SLOT_LEVELS) expect(say(RUNE_SLOT_LEVELS)).toContain(String(n));
    const moved = say([6, 21, 36]);
    for (const n of [6, 21, 36]) expect(moved).toContain(String(n));
    for (const n of RUNE_SLOT_LEVELS) expect(moved).not.toContain(`${n}`);
    expect(say(RUNE_SLOT_LEVELS)).toContain(T.ui2.guild.workshop);
    const pages = T.rune.tutorial(RUNE_SLOT_LEVELS, T.ui2.guild.workshop, T.ui2.dungeon.workshop);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBeLessThanOrEqual(4);
  });
});

describe('BattleScene: the skill menu in numbers (plan 8g Task 7)', () => {
  /** Everyone before `name` defends; then `name`'s skill list, its rows by id and the note shown for the first. */
  const skillsOf = (name: string, prep?: (g: Game) => void, lineup: CharacterId[] = [...LEGACY_LINEUP]) => {
    const w = setup(prep, {}, lineup);
    for (let i = 0; i < 5 && w.heading() !== T.cmd.choose(name); i++) {
      for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'defend'; k++) w.s.onAction('down');
      w.s.onAction('confirm');
    }
    expect(w.heading()).toBe(T.cmd.choose(name));
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'skill'; k++) w.s.onAction('down');
    w.s.onAction('confirm');
    const row = (id: string) => w.root.querySelector<HTMLElement>(`.slx-bsub [data-id="${id}"]`);
    return { ...w, row, note: () => w.root.querySelector('.slx-bnote')?.textContent ?? '' };
  };

  it('the skill menu shows the final numbers and the runes that work', () => {
    // 火之星彈 with 擴散 (works) and 重擊 (does not: it needs a skill of more than one hit).
    const runes = { 'fire-star': [{ id: 'spread' as const, tier: 'magic' as const }, { id: 'heavy' as const, tier: 'magic' as const }] };
    const w = skillsOf('諾艾兒', (g) => {
      g.state.party.roster.noel.tree = { 'fire-star': 1, 'ice-star': 1 };
      const c = g.battle!.party.find((x) => x.key === 'noel')!;
      c.ranks = { 'fire-star': 1, 'ice-star': 1 };
      c.runes = runes;
    });
    const fire = w.row('fire-star')!;
    expect(fire.querySelector('.slx-badge')!.textContent).toBe(T.cmd.runeMark);
    expect(w.row('ice-star')!.querySelector('.slx-badge')).toBeNull();
    const c = w.game.battle!.party.find((x) => x.key === 'noel')!;
    const def = skillFor(c, 'fire-star')!;
    expect(battleLine(def)).toBe('敵方全體・威力 84・火');
    // The note under the cursor (the first skill): the summary first, then the skill's words.
    expect(w.note()).toBe(T.cmd.noteWith(battleLine(def), def.desc));
    expect(w.note().startsWith('敵方全體・威力 84・火')).toBe(true);
  });

  it('the echo says what it repeats, in numbers', () => {
    const lineup: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
    const def = { ...SKILLS.provoke, name: '挑釁・高喊' };
    const w = setup((g) => { g.battle!.echo = { by: 'scarlet', round: g.battle!.round, def, cost: 3, dropped: true }; }, {}, lineup);
    expect(w.heading()).toBe(T.cmd.choose('洛恩'));
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'echo'; k++) w.s.onAction('down');
    const note = w.root.querySelector('.slx-bnote')!.textContent!;
    const rec = w.game.battle!.echo!;
    expect(note).toBe(T.cmd.echoNote(ECHO.powerPct, battleLine(echoDef(rec))) + T.cmd.echoDropped);
    expect(note.startsWith(`重現（已含 ${ECHO.powerPct}%）：`)).toBe(true);
    expect(note).not.toContain(def.desc);
  });
});

describe('BattleScene: the summary is what the battle does (plan 8g Task 7 review)', () => {
  const lineup: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
  const echoNoteOf = (def: (typeof SKILLS)[string]) => {
    const w = setup((g) => { g.battle!.echo = { by: 'noel', round: g.battle!.round, def, cost: 5 }; }, {}, lineup);
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'echo'; k++) w.s.onAction('down');
    return w.root.querySelector('.slx-bnote')!.textContent!;
  };

  it('the echo states its power once, already at its percent', () => {
    const fire = SKILLS['fire-star'];
    const p = (fire.effects[0] as { power: number }).power;
    const once = Math.round((p * ECHO.powerPct) / 100);
    const twice = Math.round((once * ECHO.powerPct) / 100);
    const note = echoNoteOf(fire);
    expect(note).toBe(T.cmd.echoNote(ECHO.powerPct, `敵方單體・威力 ${once}・火`));
    expect(note).not.toContain(`威力 ${twice}`);
    const heal = SKILLS.moonlight;
    const h = (heal.effects[0] as { power: number }).power;
    expect(echoNoteOf(heal)).toBe(T.cmd.echoNote(ECHO.powerPct, `我方單體・回復 ${Math.round((h * ECHO.powerPct) / 100)}`));
  });

  it("an abyss skill's summary has the depth's bonus in it", () => {
    // 深淵・劍 at a depth with a bonus: the battle's own power (castDef's bonus) is the number shown.
    const w = setup((g) => {
      g.state.party.roster.hero.tree = { ...g.state.party.roster.hero.tree, 'abyss-sword': 1 };
      const c = g.battle!.party.find((x) => x.key === 'hero')!;
      c.ranks = { ...c.ranks, 'abyss-sword': 1 };
      g.battle!.abyss = 20;
    }, {}, lineup);
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'skill'; k++) w.s.onAction('down');
    w.s.onAction('confirm');
    for (let k = 0; k < 12 && w.root.querySelector('.slx-bsub .slx-sel')?.getAttribute('data-id') !== 'abyss-sword'; k++) w.s.onAction('down');
    const c = w.game.battle!.party.find((x) => x.key === 'hero')!;
    const base = (skillFor(c, 'abyss-sword')!.effects.find((e) => e.kind === 'damage') as { power: number }).power;
    const withBonus = Math.round((base * 120) / 100);
    expect(withBonus).not.toBe(base);
    expect(w.root.querySelector('.slx-bnote')!.textContent).toContain(`威力 ${withBonus}`);
  });
});

describe('BattleScene: one kind of 威力 on a note (plan 8g final review)', () => {
  it("a note whose summary gives the final power drops the words' power multiplier", () => {
    const lineup: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
    const w = setup((g) => {
      g.state.party.roster.noel.tree = { 'fire-star': 1, 'noel-star-heavy': 1 };
      const c = g.battle!.party.find((x) => x.key === 'noel')!;
      c.ranks = { 'fire-star': 1, 'noel-star-heavy': 1 };
    }, {}, lineup);
    for (let i = 0; i < 5 && w.heading() !== T.cmd.choose('諾艾兒'); i++) {
      for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'defend'; k++) w.s.onAction('down');
      w.s.onAction('confirm');
    }
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'skill'; k++) w.s.onAction('down');
    w.s.onAction('confirm');
    const c = w.game.battle!.party.find((x) => x.key === 'noel')!;
    const def = skillFor(c, 'fire-star')!;
    expect(def.desc).toContain(`威力 ${T.mult(130)}`);
    const note = w.root.querySelector('.slx-bnote')!.textContent!;
    expect(note).toBe(T.cmd.noteWith(battleLine(def), withoutPowerClause(def.desc)));
    expect(note).not.toContain('×');
    expect(note).toContain('每次熱度 +2');
  });
});

describe('BattleScene: 自動 (plan 8h Task 8)', () => {
  const lineup: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
  const toCmd = (w: ReturnType<typeof setup>, id: string) => {
    for (let k = 0; k < 12 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== id; k++) w.s.onAction('down');
    expect(w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id')).toBe(id);
  };
  const note = (w: ReturnType<typeof setup>) => w.root.querySelector('.slx-bnote')?.textContent ?? '';

  it('auto plays the round as the note said', () => {
    // Noel follows 暴走流星; Chizuru's gauge is full (自動 fires an ultimate first).
    const w = setup((g) => {
      g.state.party.roster.noel.build = 'meteor';
      g.battle!.party.find((c) => c.key === 'chizuru')!.limit = LIMIT_MAX;
    }, {}, lineup);
    const submit = vi.spyOn(w.game, 'submitRound');
    toCmd(w, 'defend');
    w.s.onAction('confirm');                                   // 洛恩: 防禦
    toCmd(w, 'policy');
    const b = w.game.battle!;
    const party = w.game.state.party;
    const who = b.party.filter((c) => c.alive && c.sleep === 0 && !c.frozen).map((c) => c.key).filter((k) => k !== 'hero');
    const want = autoActions(b, party, who);
    // The note is the round 自動 plays, member by member.
    expect(note(w)).toBe(autoLine(b, party, who));
    expect(note(w).split('\n')).toHaveLength(who.length);   // one member a line
    expect(w.root.querySelector('.slx-bnote')!.classList.contains('slx-bnote-lines')).toBe(true);
    const chizuru = b.party.find((c) => c.key === 'chizuru')!;
    expect(want.chizuru.kind).toBe('ultimate');
    expect(note(w)).toContain(T.cmd.policyPart(chizuru.name, T.cmd.ultimate(ultimateFor('chizuru', chizuru.ranks, chizuru).name)));
    for (const k of who) {
      const c = b.party.find((x) => x.key === k)!;
      const a = want[k];
      const what = a.kind === 'skill' ? T.cmd.policySkill(skillFor(c, a.skill)!.name, battleLine(castDef(b, c, skillFor(c, a.skill)!)))
        : a.kind === 'attack' ? T.cmd.attack : a.kind === 'ultimate' ? T.cmd.ultimate(ultimateFor(c.defId as CharacterId, c.ranks, c).name) : '';
      expect(note(w), k).toContain(T.cmd.policyPart(c.name, what));
    }
    expect(note(w)).not.toContain(T.cmd.policyPart(b.party.find((c) => c.key === 'hero')!.name, ''));   // 洛恩 has chosen
    w.s.onAction('confirm');                                   // 自動
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toEqual({ ...want, hero: { kind: 'defend' } });
  });

  it('the summary counts heat, coins and the barrier, as the battle casts them', () => {
    const skillNote = (prep: (g: Game) => void, who: string, skill: string, lu: CharacterId[] = lineup) => {
      const w = setup(prep, {}, lu);
      for (let i = 0; i < 5 && w.heading() !== T.cmd.choose(who); i++) { toCmd(w, 'defend'); w.s.onAction('confirm'); }
      expect(w.heading()).toBe(T.cmd.choose(who));
      toCmd(w, 'skill');
      w.s.onAction('confirm');
      for (let k = 0; k < 12 && w.root.querySelector('.slx-bsub .slx-sel')?.getAttribute('data-id') !== skill; k++) w.s.onAction('down');
      expect(w.root.querySelector('.slx-bsub .slx-sel')?.getAttribute('data-id')).toBe(skill);
      return { w, text: note(w) };
    };
    const engine = (w: ReturnType<typeof setup>, key: string, skill: string) => {
      const b = w.game.battle!;
      const c = b.party.find((x) => x.key === key)!;
      return { line: battleLine(castDef(b, c, skillFor(c, skill)!)), power: castPower(b, c, skillFor(c, skill)!) };
    };
    // Noel's heat: 3 points, 8% each, on 火之星彈's 140.
    const heat = (n: number) => skillNote((g) => {
      g.state.party.roster.noel.tree = { 'fire-star': 1 };
      const c = g.battle!.party.find((x) => x.key === 'noel')!;
      c.ranks = { 'fire-star': 1 };
      c.mech = { kind: 'heat', heat: n } as never;
    }, '諾艾兒', 'fire-star');
    const hot = heat(3);
    expect(hot.text.startsWith('敵方單體・威力 174・火')).toBe(true);
    expect(engine(hot.w, 'noel', 'fire-star')).toEqual({ line: '敵方單體・威力 174・火', power: 174 });
    expect(heat(0).text.startsWith('敵方單體・威力 140・火')).toBe(true);
    // Liz's coins: 大手筆 with 6 coins, 5% a coin, on its 160.
    const coins = skillNote((g) => {
      g.state.party.roster.liz.tree = { ...g.state.party.roster.liz.tree, 'fortune-strike': 1 };
      const c = g.battle!.party.find((x) => x.key === 'liz')!;
      c.ranks = { ...c.ranks, 'fortune-strike': 1 };
      c.mech = { kind: 'coins', coins: 6 } as never;
    }, '莉茲', 'fortune-strike', [...LEGACY_LINEUP]);
    expect(coins.text.startsWith('敵方單體・威力 208・物理')).toBe(true);
    expect(engine(coins.w, 'liz', 'fortune-strike').power).toBe(208);
    // Chizuru's barrier: 天之逆鉾 releasing three rounds, 10% a round, on its 330.
    const spear = skillNote((g) => {
      g.state.party.roster.chizuru.tree = { ...g.state.party.roster.chizuru.tree, 'heaven-spear': 1 };
      const c = g.battle!.party.find((x) => x.key === 'chizuru')!;
      c.ranks = { ...c.ranks, 'heaven-spear': 1 };
      c.tp = c.max.tp = 99;
      g.battle!.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }];
    }, '千鶴', 'heaven-spear');
    expect(spear.text.startsWith('敵方單體・威力 429・物理')).toBe(true);
    expect(engine(spear.w, 'chizuru', 'heaven-spear').power).toBe(429);
  });
});

describe("BattleScene: Safira's beat in her numbers (plan 8h Task 8 review)", () => {
  /** Safira leads; her 刃舞 note at `beat`, and the engine's hit at that beat. */
  const at = (beat: number) => {
    const w = setup((g) => {
      g.state.party.roster.safira.tree = { ...g.state.party.roster.safira.tree, 'blade-dance': 1 };
      const c = g.battle!.party.find((x) => x.key === 'safira')!;
      c.ranks = { ...c.ranks, 'blade-dance': 1 };
      c.mech = { kind: 'beat', beat, last: '' } as never;
    }, {}, ['safira', 'rin', 'chizuru', 'noel', 'selene']);
    for (let k = 0; k < 9 && w.root.querySelector('.slx-bcmd .slx-sel')?.getAttribute('data-id') !== 'skill'; k++) w.s.onAction('down');
    w.s.onAction('confirm');
    for (let k = 0; k < 12 && w.root.querySelector('.slx-bsub .slx-sel')?.getAttribute('data-id') !== 'blade-dance'; k++) w.s.onAction('down');
    expect(w.root.querySelector('.slx-bsub .slx-sel')?.getAttribute('data-id')).toBe('blade-dance');
    const text = w.root.querySelector('.slx-bnote')!.textContent!;
    const shown = Number(/威力 (\d+)/.exec(text)![1]);
    const b = w.game.battle!;
    const c = b.party.find((x) => x.key === 'safira')!;
    const foe = b.enemies[0];
    const spec = skillFor(c, 'blade-dance')!.effects.find((e) => e.kind === 'damage') as unknown as DamageSpec;
    const r = { variance: 1, crit: false, blocked: false };
    // What one hit of hers does at this beat, and what a hit of the shown power does with no beat at all.
    const real = hitAmount(c, foe, spec, r).amount;
    const flat = hitAmount({ ...c, mech: { kind: 'beat', beat: 0, last: '' } } as never, foe, { ...spec, power: shown }, r).amount;
    return { shown, real, flat, base: spec.power };
  };

  it('the menu power at beat 0 is the skill\'s own, and at beat 3 it carries the beat, as the engine hits', () => {
    const zero = at(0);
    expect(zero.shown).toBe(zero.base);
    expect(zero.flat).toBe(zero.real);
    const three = at(3);
    expect(three.shown).toBe(Math.round((three.base * 130) / 100));
    expect(three.flat).toBe(three.real);
  });
});

describe('BattleScene affixes (difficulty plan Task 7b)', () => {
  /** Two foes at least, the first wearing 灼熱 and 霜縛, as a Nightmare elite would. */
  const affixed = (g: Game) => {
    const b = g.battle!;
    if (b.enemies.length < 2) b.enemies.push({ ...structuredClone(b.enemies[0]), key: 'e1' });
    b.enemies[0].affixes = ['scorch', 'frostbind'];
  };
  const stageWith = (showAilments: ReturnType<typeof vi.fn>) => ({ show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), anchor: () => null, highlight: vi.fn(), showIntents: vi.fn(), syncHp: vi.fn(), showAilments, play: vi.fn() } });

  it('the target note says each affix in a line', () => {
    const { s, root } = setup(affixed);
    s.onAction('confirm');                                   // 攻擊: whom?
    expect(root.querySelector('.slx-btarget [aria-selected=true]')!.getAttribute('data-id')).toBe('e0');
    const note = root.querySelector('.slx-bnote')!;
    expect(note.textContent!.split('\n')).toEqual([T.ui2.tier.affixLine(AFFIXES.scorch.name, AFFIXES.scorch.line), T.ui2.tier.affixLine(AFFIXES.frostbind.name, AFFIXES.frostbind.line)]);
    expect(note.classList.contains('slx-bnote-lines')).toBe(true);
    s.onAction('down');                                      // a foe with no affixes: no note, as before
    expect(root.querySelector('.slx-bnote')).toBeNull();
    const plain = setup((g) => { const b = g.battle!; if (b.enemies.length < 2) b.enemies.push({ ...structuredClone(b.enemies[0]), key: 'e1' }); });
    plain.s.onAction('confirm');
    expect(plain.root.querySelector('.slx-btarget')).not.toBeNull();
    expect(plain.root.querySelector('.slx-bnote')).toBeNull();
  });

  it('the picture gets each foe\'s affix names; a fight without affixes calls it as before', () => {
    const showAilments = vi.fn();
    setup(affixed, { stage: stageWith(showAilments) as never });
    const call = showAilments.mock.calls.at(-1)!;
    expect(call[2]).toEqual({ e0: [AFFIXES.scorch.name, AFFIXES.frostbind.name] });
    const plainCalls = vi.fn();
    setup(undefined, { stage: stageWith(plainCalls) as never });
    expect(plainCalls.mock.calls.at(-1)!).toHaveLength(2);
  });
});
