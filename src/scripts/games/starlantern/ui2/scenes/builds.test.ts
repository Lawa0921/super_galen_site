import { describe, expect, it, vi } from 'vitest';
import { BUILDS, buildOf } from '../../data/builds';
import { CHARACTERS } from '../../data/characters';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { applyCost, buildTalents, buildTree, policyText, pitchOf } from '../../engine/builds';
import { Game } from '../../engine/game';
import { STANDARD_LINEUP, activeIds } from '../../engine/party';
import { defaultTalents, defaultTree } from '../../engine/progression';
import { constRng, memoryStorage } from '../../engine/testing';
import type { CharacterId } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import type { SceneName } from '../scene';
import { BuildsScene } from './builds';

const B = T.ui2.builds;

/** A town game of the standard five; Noel at `level` on the default tree and talents, 5000 G, this bag. */
function setup(prep: (g: Game) => void = () => undefined, arg = 'noel', from: SceneName = 'inn') {
  const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, STANDARD_LINEUP);
  game.state.gold = 5000;
  prep(game);
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const root = document.createElement('div');
  const s = new BuildsScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from, arg });
  s.enter(root);
  const press = (...as: Parameters<BuildsScene['onAction']>[0][]) => as.forEach((a) => s.onAction(a));
  const name = () => root.querySelector('.slx-bd-name')!.textContent!;
  const rows = () => [...root.querySelectorAll<HTMLElement>('.slx-bd-list [role=option]')];
  const cur = () => root.querySelector<HTMLElement>('.slx-bd-list [aria-selected=true]')?.dataset.id;
  const card = () => root.querySelector('.slx-bd-card-body')!.textContent!;
  const rune = (skill: string, id: string) => root.querySelector<HTMLElement>(`.slx-bd-rune[data-skill="${skill}"][data-rune="${id}"]`);
  const buttons = () => [...root.querySelectorAll<HTMLElement>('.slx-bd-btn')];
  const foot = () => root.querySelector('.slx-bd-foot')!.textContent!;
  const confirm = () => root.querySelector<HTMLElement>('.slx-confirm');
  const keyhint = () => root.querySelector('.slx-builds .slx-keyhint')!.textContent!;
  /** The cursor onto build `key`. */
  const to = (key: string) => { for (let i = 0; i < 8 && cur() !== key; i++) press('down'); expect(cur()).toBe(key); };
  return { game, go, sfx, root, s, press, name, rows, cur, card, rune, buttons, foot, confirm, keyhint, to };
}

/** Noel at `level`, default tree and talents (points spent), this bag. */
const noel = (level: number, runes: Record<string, number> = {}) => (g: Game) => {
  g.state.party.roster.noel = { ...g.state.party.roster.noel, level, tree: defaultTree('noel', level), talents: defaultTalents('noel', level) };
  g.state.runesOpen = true;
  g.state.runes = runes;
};
const meteor = buildOf('noel', 'meteor')!;

describe('BuildsScene (plan 8h Task 7)', () => {
  it('lists her builds, the standard first, and opens on the member it was given', () => {
    const w = setup(noel(35));
    expect(w.name()).toContain(CHARACTERS.noel.name);
    expect(w.rows().map((r) => r.dataset.id)).toEqual(BUILDS.noel.map((b) => b.key));
    expect(w.rows().map((r) => r.querySelector('.slx-label')!.textContent)).toEqual(BUILDS.noel.map((b) => b.name));
    expect(w.cur()).toBe('standard');
    // No member given: the hero.
    expect(setup(noel(35), '').name()).toContain(CHARACTERS.hero.name);
  });

  it('the card says what the build does and what is missing', () => {
    const w = setup(noel(35, { 'spread@magic': 1 }));
    w.to('meteor');
    const card = w.card();
    expect(card).toContain(meteor.name);
    expect(card).toContain(pitchOf(meteor));                    // 「（建議 Lv 40 以上）」 after the line
    expect(card).toContain(T.build.minLevel(40));
    expect(card).toContain(B.scenario.crowd);
    for (const line of policyText(meteor)) expect(card).toContain(line);
    expect(policyText(meteor).join('')).toContain(SKILLS.inferno.name);
    // 擴散 is in the bag: the filled-slot icon and its tier; 點燃 is not: the empty-slot icon and where it is found; 連擊 the shop sells.
    const spread = w.rune('fire-star', 'spread')!;
    expect(spread.dataset.state).toBe('have');
    expect([...spread.querySelectorAll('[data-mark]')].map((e) => e.getAttribute('data-mark'))).toEqual(['filled']);
    expect(spread.querySelector('img')!.getAttribute('alt')).toBe(B.haveMark);
    expect(spread.textContent).toContain(T.rune.label('spread', 'magic'));
    const ignite = w.rune('fire-star', 'ignite')!;
    expect(ignite.dataset.state).toBe('lack');
    expect([...ignite.querySelectorAll('[data-mark]')].map((e) => e.getAttribute('data-mark'))).toEqual(['empty']);
    expect(ignite.querySelector('img')!.getAttribute('alt')).toBe(B.lackMark);
    expect(card).not.toMatch(/[◆◇○]/);
    expect(ignite.textContent).toContain(T.build.missing('點燃', T.build.from.drop));
    expect(ignite.textContent).toContain('打怪、寶箱掉落');
    expect(w.rune('fire-star', 'multistrike')!.textContent).toContain(T.build.missing('連擊', T.build.from.shop));
    // The legend (the filled-slot icon only: 缺 is said once, on the row), what following means, and the price.
    expect(card).toContain(B.have);
    expect(w.root.querySelector('.slx-bd-legend')!.textContent).not.toContain('缺');
    expect(card).toContain(B.follow);
    const cost = applyCost(w.game.state, 'noel', 'meteor')!.cost;
    expect(cost).toBeGreaterThan(0);
    expect(w.buttons()[0].textContent).toBe(B.apply(cost));
    // Below the build's suggested level, the card says so.
    expect(card).toContain(B.underLevel(35, 40));
    const high = setup(noel(45));
    high.to('meteor');
    expect(high.root.querySelector('.slx-bd-under')).toBeNull();
    // The standard build: no runes.
    w.press('up');
    expect(w.card()).toContain(B.noRunes);
    expect(w.root.querySelectorAll('.slx-bd-rune')).toHaveLength(0);
  });

  it('every card of every member names each of its suggested runes once', () => {
    for (const level of [1, 20, 50]) {
      const w = setup((g) => {
        g.state.party.recruited = [...new Set([...g.state.party.recruited, ...(Object.keys(BUILDS) as CharacterId[])])];
        for (const id of g.state.party.recruited) g.state.party.roster[id] = { ...g.state.party.roster[id], level, tree: defaultTree(id, level), talents: defaultTalents(id, level) };
      }, 'hero');
      const order = w.game.state.party.recruited;
      expect(order[0]).toBe('hero');
      expect([...order].sort()).toEqual(Object.keys(BUILDS).sort());
      for (const id of order) {
        expect(w.name()).toContain(CHARACTERS[id].name);
        for (const b of BUILDS[id]) {
          w.to(b.key);
          const want = Object.entries(b.runes).flatMap(([skill, ids]) => ids.map((r) => `${skill}/${r}`));
          const got = [...w.root.querySelectorAll<HTMLElement>('.slx-bd-rune')].map((r) => `${r.dataset.skill}/${r.dataset.rune}`);
          expect(got, `${id}/${b.key} at Lv ${level}`).toEqual(want);
          expect(w.card(), `${id}/${b.key}`).toContain(b.name);
          for (let i = 0; i < 8 && w.cur() !== 'standard'; i++) w.press('up');
        }
        w.press('next');
      }
    }
  });

  it('a low level says when a slot opens, apart from what is missing', () => {
    const w = setup(noel(20, {}));
    w.to('meteor');
    const multi = w.rune('fire-star', 'multistrike')!;
    expect(multi.dataset.state).toBe('later');
    expect(multi.textContent).toContain(T.build.later('連擊', 35));
    expect(multi.querySelector('[data-mark]')).toBeNull();
    expect(w.rune('fire-star', 'ignite')!.dataset.state).toBe('lack');
  });

  it('apply in town asks first when it costs or changes the tree, and a no changes nothing', () => {
    const w = setup(noel(35, { 'spread@magic': 1 }));
    w.to('meteor');
    const before = structuredClone(w.game.state);
    const cost = applyCost(w.game.state, 'noel', 'meteor')!.cost;
    w.press('confirm');
    const box = w.confirm()!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain(`${cost} G`);
    expect(box.textContent).toContain(B.reassign);
    expect(box.textContent).toContain(B.underLevel(35, 40));   // below 暴走流星's suggested level
    expect(box.textContent).not.toContain('回到袋子');           // she wears nothing
    expect(w.root.querySelector('.slx-bd-list')!.closest('[inert]')).not.toBeNull();   // the screen waits under it
    expect(box.querySelector('[aria-selected=true]')!.textContent).toBe('否');
    w.press('confirm');                                         // 否
    expect(w.confirm()).toBeNull();
    expect(w.game.state).toEqual(before);
    w.press('confirm', 'up', 'confirm');                        // 是
    const m = w.game.state.party.roster.noel;
    expect(m.build).toBe('meteor');
    expect(m.sockets?.['fire-star']?.[0]).toEqual({ id: 'spread', tier: 'magic' });
    expect(w.game.state.gold).toBe(5000 - cost);
    expect(w.foot()).toContain(B.applied(CHARACTERS.noel.name, meteor.name, 1, 2, 0));
    expect(w.rows().find((r) => r.dataset.id === 'meteor')!.textContent).toContain(B.following);
    expect(w.card()).toContain(B.followingNow);
    expect(w.game.notice).toBeNull();                           // saved, and said here: nothing for the town to repeat
  });

  it('runes coming off ask first, even when her tree is the build\'s (Task 7 review)', () => {
    const w = setup((g) => {
      noel(35, { 'spread@magic': 1 })(g);
      g.applyBuild('noel', 'meteor'); g.notice = null;
      g.state.party.roster.noel.sockets = { ...g.state.party.roster.noel.sockets, 'ice-star': [{ id: 'thrift', tier: 'magic' }] };
    });
    expect(w.cur()).toBe('meteor');
    expect(w.card()).toContain(B.costStrip);
    expect(w.card()).not.toContain(B.costFill);
    w.press('confirm');                                         // 套用 (the first button)
    const box = w.confirm()!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain(B.strip(CHARACTERS.noel.name));
    expect(box.textContent).not.toContain(B.reassign);
    expect(box.textContent).not.toContain(B.addPoints);
    w.press('up', 'confirm');                                   // 是
    expect(w.game.state.runes).toEqual({ 'thrift@magic': 1 });
    expect(w.foot()).toContain(B.applied(CHARACTERS.noel.name, meteor.name, 1, 2, 1));
  });

  it('points only added: the confirm says it fills them in (Task 7 review)', () => {
    const w = setup((g) => {
      noel(35)(g);
      g.state.party.roster.noel = { ...g.state.party.roster.noel, tree: buildTree('noel', 10, meteor), talents: buildTalents('noel', 10, meteor) };
    });
    w.to('meteor');
    expect(w.card()).toContain(B.costFree);
    w.press('confirm');
    const box = w.confirm()!;
    expect(box.textContent).toContain(B.addPoints);
    expect(box.textContent).toContain('補上技能點');
    expect(box.textContent).not.toContain('重新分配');
  });

  it('a build that only fills runes applies at once, and gold short is refused', () => {
    const s = setup((g) => { noel(35)(g); g.applyBuild('noel', 'meteor'); g.notice = null; g.state.runes = { 'ignite@magic': 1 }; });
    expect(s.cur()).toBe('meteor');
    // The build she follows: 套用 first (free: nothing moves, nothing comes off), then 停止跟隨.
    expect(s.buttons().map((b) => b.dataset.act)).toEqual(['apply', 'stop']);
    expect(s.buttons()[0].textContent).toBe(B.applyFree);
    expect(s.card()).toContain(B.costFill);
    s.press('confirm');
    expect(s.confirm()).toBeNull();
    expect(s.game.state.party.roster.noel.sockets?.['fire-star']?.[1]).toEqual({ id: 'ignite', tier: 'magic' });
    expect(s.game.state.party.roster.noel.build).toBe('meteor');
    // Short of gold for a build that moves her points: the error cue and the reason, nothing asked.
    const poor = setup((g) => { noel(35)(g); g.state.gold = 0; });
    poor.to('meteor');
    poor.press('confirm');
    expect(poor.confirm()).toBeNull();
    expect(poor.sfx.error).toHaveBeenCalled();
    expect(poor.foot()).toContain(T.reasons.gold);
    expect(poor.game.state.party.roster.noel.build).toBeUndefined();
  });

  it('read-only in the labyrinth', () => {
    const w = setup((g) => { noel(35, { 'spread@magic': 1 })(g); g.phase = 'map'; Object.assign(g, { run: {} }); });
    w.to('meteor');
    const btn = w.buttons()[0];
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(w.foot()).toContain(B.townOnly);
    const before = structuredClone(w.game.state);
    w.press('confirm');
    btn.click();
    expect(w.sfx.error).toHaveBeenCalledTimes(2);
    expect(w.confirm()).toBeNull();
    expect(w.game.state).toEqual(before);
    // The card still says what is missing.
    expect(w.rune('fire-star', 'ignite')!.dataset.state).toBe('lack');
  });

  it('the stop instruction sits by the buttons, not on the card (story depth Task 20)', () => {
    const w = setup((g) => { noel(35)(g); g.applyBuild('noel', 'meteor'); g.notice = null; });
    expect(w.card()).toContain(B.followingNow);
    expect(w.card()).not.toContain(B.stopFollow);                 // the card says what following does, the foot how to stop
    expect(w.foot()).toContain(B.stopHint);
    expect(B.stopHint).toContain(`「${B.stopFollow}」`);
    expect(w.root.querySelector('.slx-bd-foot .slx-bd-note')!.textContent).toBe(B.stopHint);
    // Not following that build: no stop to explain.
    const other = setup(noel(35));
    expect(other.foot()).not.toContain(B.stopHint);
  });

  it('stop following is its own button, and asks first', () => {
    const w = setup((g) => { noel(35)(g); g.applyBuild('noel', 'meteor'); g.notice = null; });
    expect(w.cur()).toBe('meteor');                             // it opens on the build she follows
    expect(w.card()).toContain(B.followingNow);
    expect(w.buttons().map((b) => b.textContent)).toEqual([B.applyFree, B.stopFollow]);
    expect(w.keyhint()).toBe(B.hint);                           // two buttons: ←→ between them
    // Enter or a click on the row of the build she follows never stops it.
    w.rows().find((r) => r.dataset.id === 'meteor')!.click();
    w.press('confirm');
    expect(w.game.state.party.roster.noel.build).toBe('meteor');
    const tree = { ...w.game.state.party.roster.noel.tree };
    w.press('right', 'confirm');                                // 停止跟隨: asked first
    const box = w.confirm()!;
    expect(box.textContent).toContain(B.askStop(CHARACTERS.noel.name, meteor.name));
    expect(box.querySelector('[aria-selected=true]')!.textContent).toBe('否');
    w.press('confirm');                                         // 否
    expect(w.game.state.party.roster.noel.build).toBe('meteor');
    w.buttons()[1].click();
    w.press('up', 'confirm');                                   // 是
    expect(w.game.state.party.roster.noel.build).toBeUndefined();
    expect(w.game.state.party.roster.noel.tree).toEqual(tree);   // her points stay
    expect(w.foot()).toContain(B.stopped(CHARACTERS.noel.name, meteor.name));
    expect(w.game.followEnded).toEqual([]);                     // said here, not again in town
    expect(w.rows().find((r) => r.dataset.id === 'meteor')!.textContent).not.toContain(B.following);
    expect(w.keyhint()).toBe(B.hintOne);                        // one button: no ←→
    expect(w.keyhint()).not.toContain('←→');
  });

  it('Q/E change member, Esc goes back where it came from', () => {
    const w = setup(noel(35));
    const list = w.game.state.party.recruited;
    w.press('next');
    expect(w.name()).toContain(CHARACTERS[list[(list.indexOf('noel') + 1) % list.length]].name);
    expect(w.cur()).toBe('standard');
    w.press('prev');
    expect(w.name()).toContain(CHARACTERS.noel.name);
    w.press('cancel');
    expect(w.go).toHaveBeenCalledWith('inn');
    const st = setup(noel(35), 'noel', 'status');
    st.press('cancel');
    expect(st.go).toHaveBeenCalledWith('status', 'tab:tree:noel');
    // In the labyrinth Q/E pass over the members on the field.
    const field = setup((g) => { g.phase = 'map'; Object.assign(g, { run: {} }); }, 'hero', 'status');
    const seen = new Set<CharacterId>();
    for (let i = 0; i < 8; i++) { field.press('next'); seen.add(Object.values(CHARACTERS).find((c) => field.name().includes(c.name))!.id as CharacterId); }
    expect([...seen].sort()).toEqual([...activeIds(field.game.state.party)].sort());
  });

  it('a row only picks: the mouse and a touch tap move the cursor, the buttons act (Task 7 review)', () => {
    const w = setup(noel(35));
    const row = () => w.rows().find((r) => r.dataset.id === 'meteor')!;
    row().dispatchEvent(new Event('pointermove'));
    expect(w.cur()).toBe('meteor');
    const tap = () => {
      const pd = new Event('pointerdown', { bubbles: true }) as Event & { pointerType: string };
      Object.defineProperty(pd, 'pointerType', { value: 'touch' });
      row().dispatchEvent(pd);
      row().click();
    };
    w.press('up');
    tap();
    expect(w.cur()).toBe('meteor');
    tap();
    row().click();
    expect(w.confirm()).toBeNull();
    // The buttons take clicks; nothing under the confirm box does.
    w.buttons()[0].click();
    expect(w.confirm()).not.toBeNull();
    w.rows().find((r) => r.dataset.id === 'standard')!.click();
    expect(w.cur()).toBe('meteor');
    w.press('cancel');
    expect(w.confirm()).toBeNull();
  });
});
