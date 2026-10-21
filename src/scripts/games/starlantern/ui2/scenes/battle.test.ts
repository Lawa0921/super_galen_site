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
import { CHARACTERS } from '../../data/characters';
import { SHARD_NAMES } from '../../data/story/fragments';
import { FINALE_DEPTH } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
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
    expect(plain.labels()).toEqual(['攻擊', '技能', '防禦', '道具', '逃跑', '全員攻擊']);
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
    const { game, s } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 絲嘉蕾: 防禦
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');                                           // 全員攻擊 for the rest
    const sent = Object.values(submit.mock.calls[0][0]);
    expect(sent[0].kind).toBe('defend');
    expect(sent.slice(1).every((a) => a.kind === 'attack')).toBe(true);
  });

  it('全員攻擊 sends an attack for everyone at once', () => {
    const { game, s } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    for (let i = 0; i < 5; i++) s.onAction('down');
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

  it('a won rescue lists who joined', async () => {
    const run = async (benched: boolean) => {
      const { game, s, root } = setup();
      const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], met: { id: 'selene' as const, level: 4, benched } };
      vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
      for (let i = 0; i < 5; i++) s.onAction('down');
      s.onAction('confirm');
      await flush();
      return [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
    };
    const joined = await run(false);
    expect(joined[0]).toBe(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));   // first, so the list's scroll never hides it
    expect(joined.length).toBeGreaterThan(2);
    const benched = await run(true);
    expect(benched[0]).toBe(T.ui2.rescue.benched(CHARACTERS.selene.name, 4));
    expect(benched).not.toContain(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));
  });

  it("a meeting's after-lines show who speaks", async () => {
    const lines = STORY.meet.selene.after;
    const saved = [...lines];
    lines.splice(0, lines.length, { who: 'selene', text: '謝謝你們。' }, { who: 'narrator', text: '她收起了劍。' });
    try {
      const { game, s, root } = setup();
      const end = { outcome: 'win' as const, exp: 5, gold: 7, drops: {}, levelUps: [], left: {}, gear: [], gearLeft: [], met: { id: 'selene' as const, level: 4, benched: false } };
      vi.spyOn(game, 'submitRound').mockImplementation(() => { game.phase = 'map'; return { battle: { ...game.battle!, outcome: 'win', log: [] }, end }; });
      for (let i = 0; i < 5; i++) s.onAction('down');
      s.onAction('confirm');
      await flush();
      const got = [...root.querySelectorAll('.slx-result-lines p')].map((p) => p.textContent);
      expect(got).toContain(T.battle.saidBy(CHARACTERS.selene.name, '謝謝你們。'));
      expect(got).toContain('她收起了劍。');
      expect(got).not.toContain(T.battle.saidBy('', '她收起了劍。'));
    } finally {
      lines.splice(0, lines.length, ...saved);
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
    const joined = lines.indexOf(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));
    expect(joined).toBe(0);
    expect(lines[joined + 1]).toBe(T.ui2.memory.piece(CHARACTERS.rin.name, 2));
    expect(lines[joined + 2]).toBe(T.ui2.memory.shard(SHARD_NAMES.clear));
    expect(lines[joined + 3]).toBe(T.ui2.memory.town('瑪莎的記憶碎片'));
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
    for (let i = 0; i < 5; i++) s.onAction('down');
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
