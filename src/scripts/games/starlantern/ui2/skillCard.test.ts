import { describe, expect, it } from 'vitest';
import { RESERVE_CAP, RUNE_IDS, RUNES, tiersOf, type RuneId, type RuneRef } from '../data/runes';
import { SKILLS } from '../data/skills';
import { CHARACTERS } from '../data/characters';
import { T } from '../data/text.zh-TW';
import { createBattle, fromMember, skillFor } from '../engine/battle';
import { castCost } from '../engine/mechanics/index';
import { Game } from '../engine/game';
import { mulberry32 } from '../engine/rng';
import { defaultTree } from '../engine/progression';
import { STANDARD_LINEUP } from '../engine/party';
import { reservedTpPct, socketCount, socketRune, socketable, type SocketAt } from '../engine/sockets';
import { runeWhy, runeFits } from '../engine/runes';
import { newGame, type GameState } from '../engine/state';
import type { CharacterId, Member } from '../engine/types';
import {
  battleLine, cardOf, compareCards, previewOf, reserveLine, runeChoices, slotStates, type RuneAction,
} from './skillCard';

const W = T.ui2.workshop;
const R = (id: RuneId, tier: RuneRef['tier'] = 'magic'): RuneRef => ({ id, tier });
const ok = (r: { ok: true; state: GameState } | { ok: false; reason: string }): GameState => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.state;
};
/** A town game state: the standard five plus Sylvie and Safira recruited, these members at `level` on their default build. */
const stateAt = (level: number, ids: CharacterId[], runes: Record<string, number> = {}): GameState => {
  const s = newGame(undefined, 0, STANDARD_LINEUP);
  for (const id of ['sylvie', 'safira'] as const) if (!s.party.recruited.includes(id)) s.party.recruited.push(id);
  for (const id of ids) s.party.roster[id] = { ...s.party.roster[id], level, tree: defaultTree(id, level) };
  return { ...s, runes };
};
const learn = (s: GameState, id: CharacterId, tree: Record<string, number>): void => {
  s.party.roster[id] = { ...s.party.roster[id], tree: { ...s.party.roster[id].tree, ...tree } };
};
const member = (s: GameState, id: CharacterId): Member => s.party.roster[id];
const learnOnly = (s: GameState, id: CharacterId, tree: Record<string, number>): void => {
  s.party.roster[id] = { ...s.party.roster[id], tree };
};
const lineOf = (c: ReturnType<typeof compareCards>, key: string) => c.lines.find((l) => l.key === key);
/** A fight opened from `s` with `id` on the field (in the hero's cell when she is not): the battle and her in it. */
const battleOf = (s: GameState, id: CharacterId) => {
  const grid = s.party.grid.includes(id) ? s.party.grid : s.party.grid.map((x) => (x === 'hero' ? id : x));
  const b = createBattle({ party: { ...s.party, grid }, enemyIds: ['slime'], inventory: {}, revealed: {} });
  return { s: b, c: b.party.find((x) => x.key === id)! };
};

describe('the skill card (plan 8g Task 3)', () => {
  it("the spec's card: 火之星彈 with 擴散（魔法）", () => {
    // 火之星彈 alone (her Lv5 default build takes 連星, two hits at its percent: not the spec's card).
    const s = stateAt(5, ['noel'], { 'spread@magic': 1 });
    learnOnly(s, 'noel', { 'fire-star': 1 });
    const r = previewOf(s, { id: 'noel', skill: 'fire-star', slot: 0 }, { kind: 'bag', ref: R('spread') });
    if (!r.ok) throw new Error(r.reason);
    const c = compareCards(cardOf(member(s, 'noel'), 'fire-star')!, cardOf(r.state.party.roster.noel, 'fire-star')!);
    expect(lineOf(c, 'target')).toMatchObject({ before: '單體', after: '全體', changed: true });
    expect(lineOf(c, 'power')).toMatchObject({ before: '140', after: '84（每個目標）', changed: true });
    expect(lineOf(c, 'tp')).toMatchObject({ before: '4', after: '4', changed: false });
    expect(lineOf(c, 'hits')).toMatchObject({ before: '1', after: '1', changed: false });
    expect(lineOf(c, 'element')).toMatchObject({ before: '火', after: '火', changed: false });
    expect(c.lines.filter((l) => l.changed).map((l) => l.key)).toEqual(['target', 'power']);
    expect(c.changes).toBe(2);
    // The rows come in their order, each named.
    expect(c.lines.map((l) => l.key)).toEqual(['target', 'hits', 'element', 'power', 'tp']);
    expect(c.lines.map((l) => l.label)).toEqual(['目標', '段數', '屬性', '威力', 'TP']);
    // Nothing passed in changed.
    expect(s.party.roster.noel.sockets).toBeUndefined();
    expect(s.runes).toEqual({ 'spread@magic': 1 });
  });

  it('the preview is the result', () => {
    const ids: CharacterId[] = ['noel', 'sylvie', 'chizuru', 'safira', 'rin'];
    const bag: Record<string, number> = { 'lasting@common': 3 };
    for (const id of RUNE_IDS) { const t = tiersOf(id).includes('magic') ? 'magic' : tiersOf(id)[0]; bag[`${id}@${t}`] = (bag[`${id}@${t}`] ?? 0) + 1; }
    let s = stateAt(35, ids, bag);
    learn(s, 'safira', { 'war-dance': 1, mirage: 1, 'desert-festival': 1 });
    learn(s, 'chizuru', { ward: 1, 'purify-ward': 1 });
    learn(s, 'rin', { 'rin-mark-hone': 3 });
    // Runes already in place: the neighbour cases, a lasting on two of one member's skills, 常駐 at the cap.
    s = ok(socketRune(s, 'noel', 'ice-star', 1, R('flame')));
    s = ok(socketRune(s, 'noel', 'fire-star', 0, R('spread')));
    s = ok(socketRune(s, 'chizuru', 'ward', 0, R('lasting', 'common')));
    for (const k of ['war-dance', 'mirage', 'desert-festival']) s = ok(socketRune(s, 'safira', k, 0, k === 'war-dance' ? R('lasting') : R('lasting', 'common')));
    s = ok(socketRune(s, 'rin', 'rin-mark', 0, R('charge')));
    expect(reservedTpPct(member(s, 'safira'))).toBe(RESERVE_CAP);
    const game = new Game(mulberry32(1), { getItem: () => null, setItem: () => undefined }, s);
    let checked = 0, refused = 0, moves = 0;
    const seen = { lastingOwn: false, rinMark: false, warDance: false, neighbour: false, group: false, reserve: false, blood: false, twin: false };
    for (const id of ids) {
      for (const skill of socketable(member(s, id))) {
        for (let slot = 0; slot < socketCount(member(s, id).level); slot++) {
          const at: SocketAt = { id, skill, slot };
          for (const ch of runeChoices(s, at)) {
            const act: RuneAction = ch.source.kind === 'bag' ? { kind: 'bag', ref: ch.source.ref } : { kind: 'move', from: ch.source.at };
            const preview = previewOf(s, at, act);
            game.state = s;
            const real = ch.source.kind === 'bag'
              ? game.socketRune(id, skill, slot, ch.source.ref)
              : game.moveRune(ch.source.at, at);
            if (ch.why === null) {
              expect(real.ok, `${id}.${skill}#${slot} ${ch.source.ref.id}`).toBe(true);
              if (!preview.ok) throw new Error('preview refused');
              const card = cardOf(member(game.state, id), skill)!;
              expect(card).toEqual(cardOf(member(preview.state, id), skill));
              expect(ch.changes).toBe(compareCards(cardOf(member(s, id), skill)!, card).changes);
              // The card is what a fight opened now would cast.
              const inBattle = battleOf(game.state, id);
              const def = skillFor(inBattle.c, skill)!;
              const dmg = def.effects.filter((e) => e.kind === 'damage') as { hits?: number; power: number; element: keyof typeof T.element }[];
              const row = (k: string) => card.rows.find((r) => r.key === k)?.text;
              expect(row('target')).toBe(W.target[def.target]);
              if (dmg.length) {
                expect(row('hits')).toBe([...new Set(dmg.map((e) => String(e.hits ?? 1)))].join(W.join));
                expect(row('element')).toBe([...new Set(dmg.map((e) => T.element[e.element]))].join(W.join));
                const power = [...new Set(dmg.map((e) => String(Math.round(e.power))))].join(W.join);
                expect(row('power')).toBe(def.target === 'enemies' || def.target === 'allies' ? W.each(power) : power);
              }
              expect(row('tp'), `${id}.${skill} ${ch.source.ref.id}`).toBe(String(castCost(inBattle.s, inBattle.c, skill)));
              if (ch.source.ref.id === 'blood-price' && slotStates(member(game.state, id), skill)[slot].state === 'on') {
                seen.blood = true;
                expect(row('tp')).toBe('0');
                expect(row('hp')).toBeDefined();
              }
              if (ch.source.ref.id === 'twin-cast' && slotStates(member(game.state, id), skill)[slot].state === 'on') {
                seen.twin = true;
                expect(card.adds).toContain(W.add.twice);
              }
              if (ch.source.kind === 'socket') {
                moves++;
                const from = ch.source.at;
                const lines = compareCards(cardOf(member(s, from.id), from.skill)!, cardOf(member(game.state, from.id), from.skill)!);
                const lost = [...lines.lines.filter((l) => l.changed).map((l) => W.giverRow(l.label, l.before, l.after)), ...lines.removed.map(W.giverLost)];
                const same = from.id === id && from.skill === skill;
                expect(ch.giver).toBe(same ? undefined : W.giver(CHARACTERS[from.id].name, skillFor(fromMember(member(s, from.id), 0), from.skill)!.name, lost));
                const worked = slotStates(member(s, from.id), from.skill)[from.slot].state === 'on';
                const works = slotStates(member(game.state, id), skill)[slot].state === 'on';
                const empty = !member(s, id).sockets?.[skill]?.[slot];
                if (from.id === id && ch.source.ref.id === 'lasting' && from.skill !== skill && worked && works && empty) {
                  seen.lastingOwn = true;
                  // The held TP counts once: the same as with the rune in its old place.
                  expect(card.rows.find((r) => r.key === 'tpMax')).toEqual(cardOf(member(s, id), from.skill)!.rows.find((r) => r.key === 'tpMax'));
                }
              }
              if (id === 'rin' && skill === 'rin-mark') seen.rinMark = true;
              if (id === 'safira' && skill === 'war-dance' && ch.source.ref.id === 'lasting') seen.warDance = true;
              if (id === 'noel' && skill === 'ice-star' && slot === 0 && ch.source.ref.id === 'ignite') seen.neighbour = true;
              checked++;
            } else {
              refused++;
              if (real.ok) expect(slotStates(member(game.state, id), skill)[slot].state, `${id}.${skill}#${slot} ${ch.source.ref.id}`).toBe('off');
              if (ch.why.startsWith(T.rune.fail.group(''))) seen.group = true;
              if (ch.why === T.rune.fail.reserve(RESERVE_CAP)) seen.reserve = true;
            }
          }
        }
      }
    }
    expect(seen).toEqual({ lastingOwn: true, rinMark: true, warDance: true, neighbour: true, group: true, reserve: true, blood: true, twin: true });
    expect(checked).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(100);
    expect(moves).toBeGreaterThan(20);
    // 凜's 暗記 costs her 熟記's TP, whatever a rune adds (treeCost).
    const charged = cardOf(member(s, 'rin'), 'rin-mark')!;
    expect(charged.rows.find((r) => r.key === 'tp')?.text).toBe('3');
  }, 120000);

  it('misfits say why, and an element rune can make an ailment fit', () => {
    const s = stateAt(20, ['noel'], { 'focus@magic': 1, 'ignite@magic': 1, 'flame@magic': 1 });
    const pick = (st: GameState, at: SocketAt, id: RuneId) => runeChoices(st, at).find((c) => c.source.ref.id === id)!;
    expect(pick(s, { id: 'noel', skill: 'fire-star', slot: 0 }, 'focus').why).toBe('需要：全體＋傷害，或全體＋治療');
    expect(pick(s, { id: 'noel', skill: 'ice-star', slot: 0 }, 'ignite').why).toContain(T.rune.why.fromRune);
    const lit = ok(socketRune(s, 'noel', 'ice-star', 1, R('flame')));
    expect(pick(lit, { id: 'noel', skill: 'ice-star', slot: 0 }, 'ignite').why).toBeNull();
  });

  it('the bag first, then what others hold', () => {
    let s = stateAt(20, ['noel', 'chizuru'], { 'spread@magic': 2, 'focus@magic': 1, 'drain@magic': 1, 'tear@magic': 1 });
    s = ok(socketRune(s, 'chizuru', 'pierce', 0, R('spread')));
    s = ok(socketRune(s, 'noel', 'ice-star', 0, R('drain')));
    const list = runeChoices(s, { id: 'noel', skill: 'fire-star', slot: 0 });
    const firstMove = list.findIndex((c) => c.section === 'move');
    expect(firstMove).toBeGreaterThan(0);
    expect(list.slice(firstMove).every((c) => c.section === 'move')).toBe(true);
    for (const part of [list.slice(0, firstMove), list.slice(firstMove)]) {
      const fits = part.map((c) => c.why === null);
      expect(fits).toEqual([...fits].sort((a, b) => Number(b) - Number(a)));
      for (let i = 1; i < part.length; i++) {
        if ((part[i - 1].why === null) === (part[i].why === null)) expect(part[i - 1].changes).toBeGreaterThanOrEqual(part[i].changes);
      }
    }
    const fromChizuru = list.find((c) => c.source.kind === 'socket' && c.source.at.id === 'chizuru')!;
    expect(fromChizuru.source).toEqual({ kind: 'socket', ref: R('spread'), at: { id: 'chizuru', skill: 'pierce', slot: 0 } });
    const pierce = skillFor(fromMember(member(s, 'chizuru'), 0), 'pierce')!.name;
    expect(fromChizuru.giver!.startsWith(`移走後 ${CHARACTERS.chizuru.name}・${pierce}：目標 全體 → 單體；`)).toBe(true);
    const own = list.find((c) => c.source.kind === 'socket' && c.source.at.id === 'noel')!;
    expect(own.source).toEqual({ kind: 'socket', ref: R('drain'), at: { id: 'noel', skill: 'ice-star', slot: 0 } });
    // Each bag row: the count, and 持有 split.
    const spreadRow = list.find((c) => c.section === 'bag' && c.source.ref.id === 'spread')!;
    expect(spreadRow.source).toEqual({ kind: 'bag', ref: R('spread'), count: 1 });
    expect(spreadRow.owned).toEqual({ all: 2, bag: 1, socketed: 1 });
  });

  it('choices follow a state changed in place: the party, the bag, a fight in the field', () => {
    const s = stateAt(20, ['noel'], { 'spread@magic': 1 });
    const at: SocketAt = { id: 'noel', skill: 'fire-star', slot: 0 };
    const first = runeChoices(s, at);
    expect(Object.isFrozen(first)).toBe(true);
    s.runes = { ...s.runes, 'drain@magic': 1 };
    const bag = runeChoices(s, at);
    expect(bag).not.toBe(first);
    expect(bag.some((c) => c.source.ref.id === 'drain')).toBe(true);
    s.party = { ...s.party, roster: { ...s.party.roster, noel: { ...member(s, 'noel'), sockets: { 'ice-star': [R('focus')] } } } };
    const party = runeChoices(s, at);
    expect(party).not.toBe(bag);
    expect(party.some((c) => c.section === 'move' && c.source.ref.id === 'focus')).toBe(true);
    // A rune a fight hands out while the workshop is open in the field: the same state object, a new bag.
    const g = new Game(mulberry32(1), { getItem: () => null, setItem: () => undefined }, s);
    g.phase = 'map';
    const open = runeChoices(g.state, at);
    (g as unknown as { giveRune: (r: RuneRef) => void }).giveRune(R('venom'));
    expect(g.state).toBe(s);
    const after = runeChoices(g.state, at);
    expect(after).not.toBe(open);
    expect(after.some((c) => c.source.ref.id === 'venom')).toBe(true);
  });

  it("the giver line: 「移走後」, each changed row by name, what she loses in 「」, joined with 「；」", () => {
    // Sylvie's 雙重詠唱 and 彈射 moved onto Noel: she pays less TP and loses the lines they gave her.
    let s = stateAt(20, ['noel', 'sylvie'], { 'twin-cast@legendary': 1, 'bounce@magic': 1 });
    learnOnly(s, 'sylvie', { 'aimed-shot': 1 });
    s = ok(socketRune(s, 'sylvie', 'aimed-shot', 0, R('twin-cast', 'legendary')));
    s = ok(socketRune(s, 'sylvie', 'aimed-shot', 1, R('bounce')));
    const aimed = skillFor(fromMember(member(s, 'sylvie'), 0), 'aimed-shot')!.name;
    const pick = (slot: number) => runeChoices(s, { id: 'noel', skill: 'fire-star', slot: 0 })
      .find((c) => c.source.kind === 'socket' && c.source.at.id === 'sylvie' && c.source.at.slot === slot)!;
    const tp = (st: GameState) => cardOf(member(st, 'sylvie'), 'aimed-shot')!.rows.find((r) => r.key === 'tp')!.text;
    const after = ok(previewOf(s, { id: 'noel', skill: 'fire-star', slot: 0 }, { kind: 'move', from: { id: 'sylvie', skill: 'aimed-shot', slot: 0 } }));
    expect(pick(0).giver).toBe(`移走後 ${CHARACTERS.sylvie.name}・${aimed}：TP ${tp(s)} → ${tp(after)}；少了「${W.add.twice}」`);
    const bounce = RUNES.bounce.mod('magic').bounce!;
    expect(pick(1).giver).toBe(`移走後 ${CHARACTERS.sylvie.name}・${aimed}：少了「${W.add.bounce(bounce.bounces, bounce.dropPct)}」`);
  });

  it('a move between two slots of one skill names no giver', () => {
    const s = ok(socketRune(stateAt(20, ['noel'], { 'spread@magic': 1 }), 'noel', 'fire-star', 0, R('spread')));
    const own = runeChoices(s, { id: 'noel', skill: 'fire-star', slot: 1 }).find((c) => c.section === 'move')!;
    expect(own.source).toEqual({ kind: 'socket', ref: R('spread'), at: { id: 'noel', skill: 'fire-star', slot: 0 } });
    expect(own.giver).toBeUndefined();
  });

  it('choices are cached per state and slot', () => {
    const s = stateAt(20, ['noel'], { 'spread@magic': 1, 'drain@magic': 1 });
    const at: SocketAt = { id: 'noel', skill: 'fire-star', slot: 0 };
    expect(runeChoices(s, at)).toBe(runeChoices(s, at));
    expect(runeChoices(s, { ...at, slot: 1 })).not.toBe(runeChoices(s, at));
    const next = ok(socketRune(s, 'noel', 'fire-star', 0, R('spread')));
    const again = runeChoices(next, at);
    expect(again).not.toBe(runeChoices(s, at));
    expect(again.some((c) => c.source.ref.id === 'spread' && c.section === 'bag')).toBe(false);
  });

  it('the cards say what was added and taken away', () => {
    const s = stateAt(20, ['rin', 'noel'], { 'venom@magic': 1, 'on-crit@magic': 1, 'spread@magic': 1 });
    learn(s, 'rin', { 'rin-venom-needle': 1 });
    const at = (id: CharacterId, skill: string): SocketAt => ({ id, skill, slot: 0 });
    const venom = previewOf(s, at('rin', 'rin-venom-needle'), { kind: 'bag', ref: R('venom') });
    if (!venom.ok) throw new Error(venom.reason);
    const v = compareCards(cardOf(member(s, 'rin'), 'rin-venom-needle')!, cardOf(member(venom.state, 'rin'), 'rin-venom-needle')!);
    const base = (SKILLS['rin-venom-needle'].effects.find((e) => e.kind === 'inflict') as { chance: number }).chance * 100;
    const rune = RUNES.venom.mod('magic').inflict!.chance * 100;
    expect(v.kept).toContain(W.add.inflict(Math.round(Math.max(base, rune)), T.ailment.poison));
    expect(v.removed).toEqual([]);
    // Taking 擴散 off: the target goes back, nothing is taken away from the list.
    const spread = ok(socketRune(s, 'noel', 'fire-star', 0, R('spread')));
    const off = previewOf(spread, at('noel', 'fire-star'), { kind: 'remove' });
    if (!off.ok) throw new Error(off.reason);
    const o = compareCards(cardOf(member(spread, 'noel'), 'fire-star')!, cardOf(member(off.state, 'noel'), 'fire-star')!);
    expect(lineOf(o, 'target')).toMatchObject({ before: '全體', after: '單體' });
    expect(o.removed).toEqual([]);
    // A trigger rune adds one line with its power.
    const crit = previewOf(s, at('noel', 'fire-star'), { kind: 'bag', ref: R('on-crit') });
    if (!crit.ok) throw new Error(crit.reason);
    const c = compareCards(cardOf(member(s, 'noel'), 'fire-star')!, cardOf(member(crit.state, 'noel'), 'fire-star')!);
    expect(c.added).toEqual([W.add.trigger(W.add.when.crit, RUNES['on-crit'].mod('magic').trigger!.pct)]);
    // Removing from an empty slot is refused.
    expect(previewOf(s, at('noel', 'fire-star'), { kind: 'remove' })).toEqual({ ok: false, reason: 'empty' });
  });

  it('held TP shows only when 常駐 works', () => {
    const s = stateAt(35, ['safira'], { 'lasting@magic': 2 });
    learn(s, 'safira', { 'war-dance': 1 });
    const worn = ok(socketRune(s, 'safira', 'war-dance', 0, R('lasting')));
    const m = member(worn, 'safira');
    const party = { ...worn.party, grid: worn.party.grid.map((id) => (id === 'hero' ? 'safira' : id === 'safira' ? 'hero' : id)) };
    const fight = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const inFight = fight.party.find((c) => c.key === 'safira')!;
    const card = cardOf(m, 'war-dance')!;
    expect(card.rows.find((r) => r.key === 'tpMax')?.text).toBe(String(inFight.max.tp));
    expect(reserveLine(m)).toBe(W.reserve(fromMember(m, 0).max.tp, inFight.max.tp, RUNES.lasting.mod('magic').lasting!.reservePct));
    // A 常駐 on a skill she has not learned does nothing: no held TP, though the cap still counts it.
    const unlearned = Object.keys(SKILLS).find((k) => SKILLS[k].owner === 'safira' && !SKILLS[k].passive && !socketable(member(s, 'safira')).includes(k))!;
    expect(unlearned).toBeDefined();
    const idle: Member = { ...member(s, 'safira'), sockets: { [unlearned]: [R('lasting')] } };
    expect(reservedTpPct(idle)).toBe(30);
    expect(cardOf(idle, 'war-dance')!.rows.some((r) => r.key === 'tpMax')).toBe(false);
    expect(reserveLine(idle)).toBeNull();
    // Without it the row is not there either; compared, the side without it reads her plain max TP.
    const plain = cardOf(member(s, 'safira'), 'war-dance')!;
    expect(plain.rows.some((r) => r.key === 'tpMax')).toBe(false);
    expect(plain.tpPlain).toBe(String(fromMember(member(s, 'safira'), 0).max.tp));
    const cmp = compareCards(plain, card);
    expect(lineOf(cmp, 'tpMax')).toMatchObject({ before: plain.tpPlain, after: String(inFight.max.tp), changed: true });
  });

  it('two lasting barriers warn', () => {
    let s = stateAt(35, ['chizuru'], { 'lasting@common': 2 });
    learn(s, 'chizuru', { ward: 1, 'purify-ward': 1 });
    s = ok(socketRune(s, 'chizuru', 'ward', 0, R('lasting', 'common')));
    const lasting = runeChoices(s, { id: 'chizuru', skill: 'purify-ward', slot: 0 }).find((c) => c.section === 'bag' && c.source.ref.id === 'lasting')!;
    expect(lasting.why).toBeNull();
    expect(lasting.notes).toContain(W.barrierClash);
    expect(lasting.notes).toContain(T.rune.lastingBarrier);
    // On the same skill's other slot nothing clashes: one barrier.
    const one = stateAt(35, ['chizuru'], { 'lasting@common': 1 });
    learn(one, 'chizuru', { ward: 1, 'purify-ward': 1 });
    const alone = runeChoices(one, { id: 'chizuru', skill: 'ward', slot: 0 }).find((c) => c.source.ref.id === 'lasting')!;
    expect(alone.notes).not.toContain(W.barrierClash);
  });

  it('slots tell what works', () => {
    const s = stateAt(35, ['noel'], { 'spread@magic': 1 });
    learn(s, 'noel', { 'flame-wave': 1, 'noel-wave-focus': 1 });
    const on = ok(socketRune(s, 'noel', 'flame-wave', 0, R('spread')));
    expect(slotStates(member(on, 'noel'), 'flame-wave')).toEqual([{ state: 'on', ref: R('spread') }, { state: 'empty' }, { state: 'empty' }]);
    // The variant taken away: 擴散 stays in its slot, greyed, with its reason.
    const tree = { ...member(on, 'noel').tree };
    delete tree['noel-wave-focus'];
    const after: Member = { ...member(on, 'noel'), tree };
    const why = runeWhy(runeFits(skillFor(fromMember(after, 0), 'flame-wave')!, 'spread', [])!);
    expect(slotStates(after, 'flame-wave')[0]).toEqual({ state: 'off', ref: R('spread'), why });
    expect(after.sockets).toEqual({ 'flame-wave': [R('spread')] });
    expect(slotStates({ ...member(s, 'noel'), level: 4 }, 'fire-star')).toEqual([]);
    expect(slotStates({ ...member(s, 'noel'), level: 20 }, 'fire-star')).toHaveLength(2);
  });

  it('a revive shows the HP it brings back, in percent', () => {
    const s = stateAt(20, ['selene']);
    learn(s, 'selene', { rebirth: 1 });
    const hpPct = (SKILLS.rebirth.effects.find((e) => e.kind === 'revive') as { hpPct: number }).hpPct;
    expect(cardOf(member(s, 'selene'), 'rebirth')!.rows.find((r) => r.key === 'heal')?.text).toBe(W.pct(Math.round(hpPct * 100)));
  });

  it('the battle line', () => {
    const plain = stateAt(5, ['noel'], { 'spread@magic': 1 });
    learnOnly(plain, 'noel', { 'fire-star': 1 });
    const spread = ok(socketRune(plain, 'noel', 'fire-star', 0, R('spread')));
    expect(battleLine(skillFor(fromMember(member(spread, 'noel'), 0), 'fire-star')!)).toBe('全體・威力 84・火');
    const heal = (SKILLS.moonlight.effects[0] as { power: number }).power;
    expect(battleLine(SKILLS.moonlight)).toBe(`單體・${W.battle.heal(heal)}`);
    expect(battleLine(SKILLS['war-dance'])).toBe('全體');
  });
});

