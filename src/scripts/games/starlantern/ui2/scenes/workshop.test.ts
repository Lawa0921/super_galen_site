import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '../../data/characters';
import { RUNE_SLOT_LEVELS, type RuneRef } from '../../data/runes';
import { SKILLS } from '../../data/skills';
import { RESERVE_CAP } from '../../data/runes';
import { T } from '../../data/text.zh-TW';
import { fromMember, skillFor } from '../../engine/battle';
import { Game } from '../../engine/game';
import { STANDARD_LINEUP, activeIds } from '../../engine/party';
import { runeFits, runeWhy } from '../../engine/runes';
import { SAVE_KEY } from '../../engine/save';
import { socketCount } from '../../engine/sockets';
import { constRng, memoryStorage } from '../../engine/testing';
import type { CharacterId } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import type { SceneName } from '../scene';
import { reserveLine } from '../skillCard';
import { WorkshopScene } from './workshop';

const W = T.ui2.workshop;
const R = (id: RuneRef['id'], tier: RuneRef['tier'] = 'magic'): RuneRef => ({ id, tier });
const label = (r: RuneRef) => T.rune.label(r.id, r.tier);

/** A town game (the standard five, Sylvie met on the bench); `prep` sets members, bag and flags before the scene opens. */
function setup(prep: (g: Game) => void, arg?: string, from: SceneName = 'guild') {
  const storage = memoryStorage();
  const game = new Game(constRng(0.5), storage, undefined, 0, STANDARD_LINEUP);
  game.state.party.recruited.push('sylvie');
  prep(game);
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const root = document.createElement('div');
  const s = new WorkshopScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from, arg });
  s.enter(root);
  const press = (...as: Parameters<WorkshopScene['onAction']>[0][]) => as.forEach((a) => s.onAction(a));
  const focus = () => root.querySelector<HTMLElement>('.slx-workshop')!.dataset.focus;
  const name = () => root.querySelector('.slx-ws-name')!.textContent!;
  const skills = () => [...root.querySelectorAll<HTMLElement>('.slx-ws-skills [role=option]')];
  const skillCur = () => root.querySelector<HTMLElement>('.slx-ws-skills [aria-selected=true]')?.dataset.id;
  const slots = () => [...root.querySelectorAll<HTMLElement>('.slx-ws-slots [role=option]')];
  const runes = () => [...root.querySelectorAll<HTMLElement>('.slx-ws-runes [role=option]')];
  const runeCur = () => root.querySelector<HTMLElement>('.slx-ws-runes [aria-selected=true]')?.dataset.id;
  const row = (key: string) => root.querySelector<HTMLElement>(`.slx-ws-card tr[data-key=${key}]`);
  const foot = () => root.querySelector('.slx-ws-foot')!.textContent!;
  const panel = () => root.querySelector('.slx-ws-slots')!.textContent!;
  return { game, storage, go, sfx, root, s, press, focus, name, skills, skillCur, slots, runes, runeCur, row, foot, panel };
}
/** Noel at `level` knowing only 火之星彈 (or `tree`), runes open, this bag. */
const noel = (level: number, runes: Record<string, number>, tree: Record<string, number> = { 'fire-star': 1 }) => (g: Game) => {
  g.state.party.roster.noel = { ...g.state.party.roster.noel, level, tree };
  g.state.runesOpen = true;
  g.state.runes = runes;
};

describe('WorkshopScene (plan 8g Task 4a)', () => {
  it('opens on the member and skill it was given', () => {
    const w = setup(noel(20, {}, { 'fire-star': 1, 'ice-star': 1 }), 'noel:ice-star');
    expect(w.name()).toContain(CHARACTERS.noel.name);
    expect(w.skillCur()).toBe('ice-star');
    expect(w.focus()).toBe('skills');
    const dots = w.skills().find((r) => r.dataset.id === 'ice-star')!.querySelector('.slx-right')!.textContent!;
    expect([...dots].length).toBe(socketCount(20));
    // No argument: the hero, on his first skill that takes runes.
    const plain = setup(() => undefined);
    expect(plain.name()).toContain(CHARACTERS.hero.name);
    expect(plain.skillCur()).toBe(plain.skills()[0]?.dataset.id);
    // A member alone: her first skill.
    expect(setup(noel(20, {}), 'noel').skillCur()).toBe('fire-star');
  });

  it('socket a rune with the keys, seeing before and after first', () => {
    const w = setup(noel(20, { 'spread@magic': 1 }), 'noel:fire-star');
    expect(w.row('target')!.querySelectorAll('td')).toHaveLength(1);       // no rune picked: one column, 現在
    w.press('confirm');
    expect(w.focus()).toBe('slots');
    w.press('confirm');
    expect(w.focus()).toBe('runes');
    expect(w.runeCur()).toBe('bag:spread@magic');
    const target = w.row('target')!;
    expect(target.classList.contains('slx-changed')).toBe(true);
    expect([...target.querySelectorAll('td')].map((t) => t.textContent)).toEqual(['單體', '全體']);
    expect(w.row('power')!.querySelector('.slx-ws-after')!.textContent).toBe('84（每個目標）');
    expect(w.row('tp')!.classList.contains('slx-changed')).toBe(false);
    expect(w.root.querySelector('.slx-ws-card')!.textContent).toContain(W.before);
    expect(w.root.querySelector('.slx-ws-card')!.textContent).toContain(W.after);
    w.press('confirm');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    expect(w.game.state.runes ?? {}).toEqual({});
    expect(w.foot()).toContain(W.socketed(label(R('spread')), SKILLS['fire-star'].name));
    expect(w.focus()).toBe('slots');
    expect(w.slots()[0].getAttribute('aria-selected')).toBe('true');
    expect(w.skills()[0].querySelector('.slx-right')!.textContent).toBe('◆○');
    // Saved at once in town.
    expect(JSON.parse(w.storage.getItem(SAVE_KEY)!).party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
  });

  it('one slot goes straight to the runes', () => {
    const w = setup(noel(5, { 'spread@magic': 1 }), 'noel:fire-star');
    w.press('confirm');
    expect(w.focus()).toBe('runes');
    w.press('cancel');
    expect(w.focus()).toBe('skills');
    expect(w.go).not.toHaveBeenCalled();
  });

  it('a swap sends the old rune to the bag and says so', () => {
    const w = setup((g) => {
      noel(5, { 'spread@magic': 1 })(g);
      g.state.party.roster.noel.sockets = { 'fire-star': [R('multistrike')] };
    }, 'noel:fire-star');
    w.press('confirm');
    expect(w.runes().map((r) => r.dataset.id)).toEqual(['remove', 'bag:spread@magic']);
    w.press('down', 'confirm');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    expect(w.game.state.runes).toEqual({ 'multistrike@magic': 1 });
    expect(w.foot()).toContain(W.socketed(label(R('spread')), SKILLS['fire-star'].name) + W.backToBag(label(R('multistrike'))));
    expect(w.focus()).toBe('skills');                                 // one slot: back to the skills
    w.press('confirm');
    expect(w.runeCur()).toBe('remove');
    w.press('confirm');
    expect(w.game.state.party.roster.noel.sockets).toBeUndefined();
    expect(w.game.state.runes).toEqual({ 'multistrike@magic': 1, 'spread@magic': 1 });
    expect(w.foot()).toContain(W.removed(label(R('spread'))));
  });

  it('a misfit can be read but not socketed', () => {
    const w = setup(noel(20, { 'focus@magic': 1 }), 'noel:fire-star');
    w.press('confirm', 'confirm');
    expect(w.runeCur()).toBe('bag:focus@magic');
    const why = runeWhy(runeFits(SKILLS['fire-star'], 'focus', [])!);
    expect(w.foot()).toContain(why);
    const before = JSON.stringify(w.game.state);
    const saved = w.storage.getItem(SAVE_KEY);
    w.press('confirm');
    expect(w.sfx.error).toHaveBeenCalled();
    expect(JSON.stringify(w.game.state)).toBe(before);
    expect(w.storage.getItem(SAVE_KEY)).toBe(saved);
    expect(w.foot()).toContain(why);
    expect(w.focus()).toBe('runes');
  });

  it('a rune that stopped working stays, with its reason', () => {
    // 擴散 on 火焰波 while 聚焰 made it hit one foe; the variant gone, it hits them all and 擴散 no longer works.
    const w = setup((g) => {
      noel(20, {}, { 'flame-wave': 1 })(g);
      g.state.party.roster.noel.sockets = { 'flame-wave': [R('spread')] };
    }, 'noel:flame-wave');
    const m = w.game.state.party.roster.noel;
    const why = runeWhy(runeFits(skillFor(fromMember(m, 0), 'flame-wave')!, 'spread', [])!);
    expect(w.skills().find((r) => r.dataset.id === 'flame-wave')!.querySelector('.slx-right')!.textContent).toBe('◇○');
    expect(w.panel()).toContain(label(R('spread')));
    expect(w.panel()).toContain(W.off(why));
    expect(m.sockets).toEqual({ 'flame-wave': [R('spread')] });
  });

  it('no slots yet, no runes yet', () => {
    const low = setup(noel(4, {}), 'noel:fire-star');
    expect(low.panel()).toContain(W.noSlots(RUNE_SLOT_LEVELS[0]));
    const closed = setup((g) => { noel(5, {})(g); delete g.state.runesOpen; }, 'noel:fire-star');
    closed.press('confirm');
    expect(closed.root.querySelector('.slx-ws-runes')!.textContent).toContain(T.rune.fail.closed);
    const empty = setup(noel(5, {}), 'noel:fire-star');
    empty.press('confirm');
    expect(empty.root.querySelector('.slx-ws-runes')!.textContent).toContain(W.emptyBag);
  });

  it('Esc walks back out', () => {
    const w = setup(noel(20, { 'spread@magic': 1 }), 'noel:fire-star', 'status');
    w.press('confirm', 'confirm');
    expect(w.focus()).toBe('runes');
    w.press('cancel');
    expect(w.focus()).toBe('slots');
    w.press('cancel');
    expect(w.focus()).toBe('skills');
    expect(w.go).not.toHaveBeenCalled();
    w.press('cancel');
    expect(w.go).toHaveBeenCalledWith('status', 'tab:skills:noel');
    const g = setup(noel(20, {}), 'noel');
    g.press('cancel');
    expect(g.go).toHaveBeenCalledWith('guild');
    // Opened from the labyrinth's field menu: back to the labyrinth.
    const d = setup((x) => { noel(20, {})(x); x.phase = 'map'; Object.assign(x, { run: {} }); }, 'noel', 'dungeon');
    d.press('cancel');
    expect(d.go).toHaveBeenCalledWith('dungeon');
  });

  it('Q/E in the labyrinth passes over the bench', () => {
    /** Pages with E through `ids` and back to the first: each page shows the next one's name. */
    const walks = (w: ReturnType<typeof setup>, ids: CharacterId[]) => {
      for (const id of [...ids, ids[0]]) { expect(w.name()).toContain(CHARACTERS[id].name); w.press('next'); }
    };
    const town = setup(() => undefined, 'hero');
    walks(town, town.game.state.party.recruited);
    const field = setup((g) => { g.phase = 'map'; Object.assign(g, { run: {} }); }, 'hero');
    // The map phase with no run (between screens) is not the labyrinth: everyone recruited.
    const between = setup((g) => { g.phase = 'map'; }, 'hero');
    walks(between, between.game.state.party.recruited);
    const active = activeIds(field.game.state.party);
    expect(active).not.toContain('sylvie');
    walks(field, active);
    // A new member: back to the skills, on the first one.
    field.press('confirm');
    field.press('next');
    expect(field.focus()).toBe('skills');
    expect(field.skillCur()).toBe(field.skills()[0]?.dataset.id);
  });

  it('clicks pick a skill and a slot', () => {
    const w = setup(noel(20, { 'spread@magic': 1 }, { 'fire-star': 1, 'ice-star': 1 }), 'noel:fire-star');
    w.skills().find((r) => r.dataset.id === 'ice-star')!.click();
    expect(w.skillCur()).toBe('ice-star');
    expect(w.focus()).toBe('slots');
    // The third slot opens at Lv35: a click does nothing.
    const locked = w.slots().find((r) => r.dataset.id === 'slot:2')!;
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    locked.click();
    expect(w.focus()).toBe('slots');
    w.slots().find((r) => r.dataset.id === 'slot:1')!.click();
    expect(w.focus()).toBe('runes');
    expect(w.root.querySelector('.slx-ws-runes')!.textContent).toContain(W.pick(2));
  });

  it('two lasting barriers warn, now and in a preview', () => {
    const w = setup((g) => {
      const m = g.state.party.roster.chizuru;
      g.state.party.roster.chizuru = { ...m, level: 20, tree: { ward: 1, 'purify-ward': 1 }, sockets: { ward: [R('lasting', 'common')], 'purify-ward': [R('lasting', 'common')] } };
      g.state.runesOpen = true;
    }, 'chizuru:ward');
    expect(w.root.querySelector('.slx-ws-card')!.textContent).toContain(W.barrierClash);
    // Her TP held in battle on the title row.
    expect(w.root.querySelector('.slx-ws-head')!.textContent).toContain(reserveLine(w.game.state.party.roster.chizuru)!);
  });
});

describe('WorkshopScene: moves, mouse and touch (plan 8g Task 4b)', () => {
  /** Noel (火之星彈) and Sylvie (瞄準射擊) at Lv 20, runes open, 彈射 in Sylvie's first slot. */
  const pair = (bag: Record<string, number> = {}, noelSockets?: Record<string, (RuneRef | null)[]>) => (g: Game) => {
    noel(20, bag)(g);
    const s = g.state.party.roster.sylvie;
    g.state.party.roster.sylvie = { ...s, level: 20, tree: { 'aimed-shot': 1 }, sockets: { 'aimed-shot': [R('bounce')] } };
    if (noelSockets) g.state.party.roster.noel.sockets = noelSockets;
  };
  const tap = (node: HTMLElement, pointerType: string) => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }));
    node.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType }));
  };
  const runeRow = (w: ReturnType<typeof setup>, id: string) => w.runes().find((r) => r.dataset.id === id)!;
  const moveId = 'move:sylvie:aimed-shot:0';
  /** ↓ until the rune cursor is on `id` (at most once round the list). */
  const downTo = (w: ReturnType<typeof setup>, id: string) => {
    for (let i = 0; i < 30 && w.runeCur() !== id; i++) w.press('down');
    expect(w.runeCur()).toBe(id);
  };

  it('move from another member, and the card says what she loses', () => {
    const w = setup(pair({ 'spread@magic': 1 }), 'noel:fire-star');
    w.press('confirm', 'confirm');
    const ids = w.runes().map((r) => r.dataset.id);
    expect(ids).toEqual(['bag:spread@magic', 'head:others', moveId]);
    expect(runeRow(w, 'head:others').textContent).toContain(W.fromOthers);
    expect(runeRow(w, 'head:others').getAttribute('aria-disabled')).toBe('true');
    expect(runeRow(w, moveId).querySelector('.slx-right')!.textContent).toBe(CHARACTERS.sylvie.name);
    w.press('down');
    expect(w.runeCur()).toBe(moveId);                                 // the heading takes no cursor
    const aimed = skillFor(fromMember(w.game.state.party.roster.sylvie, 0), 'aimed-shot')!.name;
    expect(w.root.querySelector('.slx-ws-giver')!.textContent).toContain(`${CHARACTERS.sylvie.name}・${aimed}`);
    w.press('confirm');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('bounce')] });
    expect(w.game.state.party.roster.sylvie.sockets).toBeUndefined();
    expect(w.foot()).toContain(W.moved(label(R('bounce')), CHARACTERS.sylvie.name, aimed));
  });

  it('a refused move says why', () => {
    // Noel already holds 90% in 常駐; one more from Sylvie would pass the cap.
    const w = setup((g) => {
      noel(35, {}, { 'fire-star': 1, 'ice-star': 1, 'thunder-star': 1, hex: 1 })(g);
      g.state.party.roster.noel.sockets = { 'ice-star': [R('lasting', 'common')], 'thunder-star': [R('lasting', 'common')], hex: [R('lasting', 'common')] };
      const s = g.state.party.roster.sylvie;
      g.state.party.roster.sylvie = { ...s, level: 20, tree: { 'aimed-shot': 1 }, sockets: { 'aimed-shot': [R('lasting', 'common')] } };
    }, 'noel:fire-star');
    w.press('confirm', 'confirm');
    const id = 'move:sylvie:aimed-shot:0';
    downTo(w, id);
    expect(w.foot()).toContain(T.rune.fail.reserve(RESERVE_CAP));
    const before = JSON.stringify(w.game.state.party);
    w.press('confirm');
    expect(w.sfx.error).toHaveBeenCalled();
    expect(JSON.stringify(w.game.state.party)).toBe(before);
    expect(w.foot()).toContain(T.rune.fail.reserve(RESERVE_CAP));
  });

  it('a move into a filled slot sends the old rune to the bag', () => {
    const w = setup(pair({}, { 'fire-star': [R('drain')] }), 'noel:fire-star');
    w.press('confirm', 'confirm');
    expect(w.runes().map((r) => r.dataset.id)).toEqual(['remove', 'head:others', moveId]);
    w.press('down', 'confirm');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('bounce')] });
    expect(w.game.state.runes).toEqual({ 'drain@magic': 1 });
    expect(w.foot()).toContain(W.backToBag(label(R('drain'))));
  });

  it('hover previews, a touch needs a second tap', () => {
    const w = setup(noel(20, { 'spread@magic': 1, 'drain@magic': 1 }), 'noel:fire-star');
    w.press('confirm', 'confirm');
    const first = w.runeCur()!;
    const other = w.runes().find((r) => r.dataset.id !== first && r.getAttribute('aria-disabled') !== 'true')!.dataset.id!;
    const before = JSON.stringify(w.game.state);
    runeRow(w, other).dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(w.runeCur()).toBe(other);
    expect(JSON.stringify(w.game.state)).toBe(before);
    const target = () => w.row('target')!.querySelector('.slx-ws-after')?.textContent;
    expect(target()).toBe(other === 'bag:spread@magic' ? '全體' : '單體');
    // A touch: the first tap only moves there; a second tap on that row does it.
    tap(runeRow(w, 'bag:spread@magic'), 'touch');
    expect(w.runeCur()).toBe('bag:spread@magic');
    expect(JSON.stringify(w.game.state)).toBe(before);
    w.press('down');                                                    // another action: the tap no longer counts
    tap(runeRow(w, 'bag:spread@magic'), 'touch');
    expect(JSON.stringify(w.game.state)).toBe(before);
    tap(runeRow(w, 'bag:spread@magic'), 'touch');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    // A mouse click does it at once.
    w.press('down', 'confirm');                                         // slot 2's runes
    tap(runeRow(w, 'bag:drain@magic'), 'mouse');
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread'), R('drain')] });
  });

  it('a rune in another of her own skills is named by that skill', () => {
    const w = setup((g) => {
      noel(20, {}, { 'fire-star': 1, 'ice-star': 1, 'thunder-star': 1 })(g);
      g.state.party.roster.noel.sockets = { 'ice-star': [R('lasting', 'common')], 'thunder-star': [R('lasting', 'common')] };
    }, 'noel:fire-star');
    w.press('confirm', 'confirm');
    const right = (id: string) => runeRow(w, id).querySelector('.slx-right')!.textContent;
    expect(right('move:noel:ice-star:0')).toBe(SKILLS['ice-star'].name);
    expect(right('move:noel:thunder-star:0')).toBe(SKILLS['thunder-star'].name);
  });

  it('the cursor stays in the list when it shrinks', () => {
    const inList = (w: ReturnType<typeof setup>) => {
      const rows = w.runes();
      const cur = w.runeCur();
      expect(rows.some((r) => r.dataset.id === cur)).toBe(true);
    };
    const w = setup(pair({ 'drain@magic': 1, 'spread@magic': 1 }), 'noel:fire-star');
    w.press('confirm', 'confirm');
    downTo(w, 'bag:drain@magic');
    w.press('confirm');                                                 // the bag's only 吸血 goes in
    expect(w.game.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('drain')] });
    w.press('down', 'confirm');                                         // slot 2's runes
    inList(w);
    downTo(w, moveId);
    w.press('confirm');                                                 // Sylvie's row is gone after the move
    expect(w.game.state.party.roster.sylvie.sockets).toBeUndefined();
    w.press('up', 'confirm');                                           // slot 1's runes again
    inList(w);
    expect(w.runes().some((r) => r.dataset.id === moveId)).toBe(false);
    // To a member with fewer skills and back: nothing breaks.
    w.press('cancel', 'cancel', 'next', 'prev', 'confirm', 'confirm');
    inList(w);
  });
});
