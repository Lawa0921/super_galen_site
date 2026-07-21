import { describe, it, expect } from 'vitest';
import { statMod } from './check';
import { startCombat, currentActor, advanceTurn, partyAct, enemyAct, attemptRetreat, resolveCasualties, useItemInCombat } from './combat';
import type { PartyMember, EnemyUnit, Move, CombatState } from './combat';
import { createRng } from './rng';
import type { Rng } from './rng';

/** 依序回傳指定骰值的假 RNG（骰完循環）；next 固定 0（weightedPick 取第一個非零權重項） */
export function scriptedRng(dies: number[]): Rng {
  let i = 0;
  const take = () => dies[i++ % dies.length];
  return {
    next: () => 0,
    roll: take,
    d20: take,
    pick: (arr) => arr[0],
    weightedPick: (items) => {
      const hit = items.find((it) => it.weight > 0);
      if (!hit) throw new Error('weightedPick: 空清單或總權重為 0');
      return hit.value;
    },
  };
}

const strike: Move = { id: 'strike', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}揮擊{target}，造成 {amount} 點傷害！' };

export function makeMember(id: string, dex: number, extra: Partial<PartyMember> = {}): PartyMember {
  return { id, name: id, stats: { str: 14, dex, int: 10, cha: 10, con: 12 },
    maxHp: 20, hp: 20, defense: 12, moves: [strike], ...extra };
}
export function makeEnemy(id: string, dex: number, extra: Partial<EnemyUnit> = {}): EnemyUnit {
  return { id, name: id, stats: { str: 12, dex, int: 8, cha: 6, con: 10 },
    maxHp: 10, hp: 10, defense: 10, moves: [strike], intents: [{ weight: 1, moveId: 'strike' }], ...extra };
}

describe('statMod', () => {
  it('D&D 式調整值', () => {
    expect(statMod(10)).toBe(0);
    expect(statMod(14)).toBe(2);
    expect(statMod(8)).toBe(-1);
    expect(statMod(20)).toBe(5);
  });
});

describe('startCombat / 先攻與回合', () => {
  it('先攻 = d20 + statMod(dex)，高到低排序', () => {
    // hero dex14(+2), foe dex10(+0)：骰 5(hero)=7、10(foe)=10 → foe 先
    const state = startCombat(scriptedRng([5, 10]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    expect(state.order).toEqual(['foe', 'hero']);
    expect(currentActor(state)).toEqual({ side: 'enemy', id: 'foe' });
  });

  it('同分依傳入順序穩定（隊伍在前）', () => {
    const state = startCombat(scriptedRng([10, 10]), [makeMember('hero', 10)], [makeEnemy('foe', 10)]);
    expect(state.order).toEqual(['hero', 'foe']);
  });

  it('三方同分：隊伍成員全部排在敵人前（傳入順序穩定）', () => {
    const state = startCombat(scriptedRng([10, 10, 10]),
      [makeMember('p1', 10), makeMember('p2', 10)], [makeEnemy('e1', 10)]);
    expect(state.order).toEqual(['p1', 'p2', 'e1']);
  });

  it('開場為每個敵人預告意圖並記 log', () => {
    const state = startCombat(scriptedRng([10, 5]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    expect(state.enemyIntents['foe']).toBe('strike');
    expect(state.log.some((e) => e.kind === 'info')).toBe(true);
    expect(state.round).toBe(1);
    expect(state.outcome).toBe('ongoing');
  });

  it('advanceTurn 跳過倒地者並在繞回時 round+1', () => {
    const state = startCombat(scriptedRng([15, 10, 5]),
      [makeMember('a', 14), makeMember('b', 10)], [makeEnemy('foe', 10)]);
    // 先攻：a=17, foe=10, b=6 → order [a, foe, b]
    expect(state.order).toEqual(['a', 'foe', 'b']);
    state.enemies[0].hp = 0;               // foe 倒地
    advanceTurn(state);                    // 從 a 前進，跳過 foe
    expect(currentActor(state)).toEqual({ side: 'party', id: 'b' });
    advanceTurn(state);                    // b → 繞回 a
    expect(currentActor(state)).toEqual({ side: 'party', id: 'a' });
    expect(state.round).toBe(2);
  });

  it('行動者輪到時解除自己的架盾標記', () => {
    const state = startCombat(scriptedRng([15, 5]), [makeMember('a', 14)], [makeEnemy('foe', 10)]);
    state.guarding['a'] = true;
    advanceTurn(state);                    // foe
    advanceTurn(state);                    // 繞回 a → a 的架盾解除
    expect(state.guarding['a']).toBeFalsy();
  });
});

describe('動作結算', () => {
  function freshState(dies: number[]) {
    // hero 先攻（骰 15+2 vs 5+0）
    return { rng: scriptedRng(dies), state: startCombat(scriptedRng([15, 5]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]) };
  }

  it('攻擊命中：d20+statMod(str) >= defense，傷害=骰+statMod、log damage、輪到敵方', () => {
    const { state } = freshState([]);
    // 命中骰 10+2=12 >= 10；傷害骰 4 + str(+2) = 6
    partyAct(scriptedRng([10, 4]), state, 'hero', 'strike', 'foe');
    expect(state.enemies[0].hp).toBe(4);
    expect(state.log.some((e) => e.kind === 'damage' && e.text.includes('6'))).toBe(true);
    expect(currentActor(state)).toEqual({ side: 'enemy', id: 'foe' });
  });

  it('攻擊未中：不扣血、log 落空', () => {
    const { state } = freshState([]);
    partyAct(scriptedRng([5]), state, 'hero', 'strike', 'foe'); // 5+2=7 < 10
    expect(state.enemies[0].hp).toBe(10);
    expect(state.log.at(-1)?.text).toContain('落空');
  });

  it('nat1 必失手即使修正足夠；nat20 必中', () => {
    const a = freshState([]).state;
    a.enemies[0].defense = 1;
    partyAct(scriptedRng([1, 6]), a, 'hero', 'strike', 'foe');
    expect(a.enemies[0].hp).toBe(10);
    const b = freshState([]).state;
    b.enemies[0].defense = 30;
    partyAct(scriptedRng([20, 4]), b, 'hero', 'strike', 'foe');
    expect(b.enemies[0].hp).toBe(4);
  });

  it('架盾使受擊方 defense +4', () => {
    const state = startCombat(scriptedRng([5, 15]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    // foe 先動；hero 設架盾
    state.guarding['hero'] = true;
    // foe 攻 hero：骰 13+1(str12)=14 < 12+4 → 未中
    enemyAct(scriptedRng([13, 3]), state, 'foe');
    expect(state.party[0].hp).toBe(20);
  });

  it('治療不超過 maxHp、log heal', () => {
    const healMove: Move = { id: 'heal', name: '治癒', kind: 'support', target: 'ally', hitStat: 'cha',
      heal: { dice: 1, sides: 8, bonusStat: 'cha' }, narration: '{actor}治癒了{target}，恢復 {amount} 點！' };
    const cleric = makeMember('cleric', 10, { moves: [healMove], stats: { str: 8, dex: 10, int: 10, cha: 16, con: 10 } });
    const state = startCombat(scriptedRng([15, 5]), [cleric], [makeEnemy('foe', 10)]);
    cleric.hp = 15;
    partyAct(scriptedRng([6]), state, 'cleric', 'heal', 'cleric'); // 6 + cha(+3) = 9 → cap 至 20
    expect(cleric.hp).toBe(20);
    expect(state.log.some((e) => e.kind === 'heal')).toBe(true);
  });

  it('敵方全滅 → victory；隊伍全滅 → defeat', () => {
    const { state } = freshState([]);
    state.enemies[0].hp = 3;
    partyAct(scriptedRng([10, 4]), state, 'hero', 'strike', 'foe'); // 6 傷 → 倒地
    expect(state.outcome).toBe('victory');
    expect(currentActor(state)).toBeNull();

    const s2 = startCombat(scriptedRng([5, 15]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    s2.party[0].hp = 1;
    enemyAct(scriptedRng([15, 6]), s2, 'foe'); // 命中 → hero 倒地
    expect(s2.outcome).toBe('defeat');
  });

  it('enemyAct 用預告招式攻擊 hp 最低隊員並重新預告', () => {
    const a = makeMember('a', 14); const b = makeMember('b', 12);
    b.hp = 5;
    const state = startCombat(scriptedRng([5, 15, 6]), [a, b], [makeEnemy('foe', 10)]);
    expect(currentActor(state)?.id).toBe('foe');
    enemyAct(scriptedRng([15, 3]), state, 'foe');   // 攻 b（hp 最低）：15+1=16 >= 12 → 3+1=4 傷
    expect(b.hp).toBe(1);
    expect(state.enemyIntents['foe']).toBe('strike'); // 重新預告
  });

  it('attemptRetreat：outcome=retreated、殿後者（先攻最低存活）受一擊', () => {
    const a = makeMember('a', 14); const b = makeMember('b', 8);
    const state = startCombat(scriptedRng([15, 5, 10]), [a, b], [makeEnemy('foe', 10)]);
    attemptRetreat(scriptedRng([18, 4]), state);    // foe 攻殿後者 b：18+1 命中、4+1=5 傷
    expect(state.outcome).toBe('retreated');
    expect(b.hp).toBe(15);
    expect(state.log.some((e) => e.kind === 'retreat')).toBe(true);
  });

  it('EnemyUnit.loot 為選填欄位（型別使用 fixture，M3 Task 3 消費）', () => {
    const foe = makeEnemy('foe', 10, { loot: { gold: [5, 10], itemId: 'iron-ore', itemChance: 0.5 } });
    expect(foe.loot?.gold).toEqual([5, 10]);
    expect(foe.loot?.itemId).toBe('iron-ore');
    expect(foe.loot?.itemChance).toBe(0.5);
  });

  it('enemyAct：治療意圖鎖定敵方（含自己）中扣血最多者，玩家隊不受影響', () => {
    const healMove: Move = { id: 'heal', name: '傷患照護', kind: 'support', target: 'ally', hitStat: 'cha',
      heal: { dice: 1, sides: 8, bonusStat: 'cha' }, narration: '{actor}治癒了{target}，恢復 {amount} 點！' };
    const healer = makeEnemy('healer', 10, { moves: [strike, healMove], intents: [{ weight: 1, moveId: 'heal' }],
      stats: { str: 8, dex: 10, int: 10, cha: 16, con: 10 } });
    const warrior = makeEnemy('warrior', 8, { hp: 4 }); // maxHp 10, hp 4 → 缺 6，全場最大缺口
    const hero = makeMember('hero', 14);
    const state = startCombat(scriptedRng([5, 15, 10]), [hero], [healer, warrior]);
    expect(state.enemyIntents['healer']).toBe('heal');
    enemyAct(scriptedRng([6]), state, 'healer'); // 6 + cha(+3) = 9 → applied = min(9, 10-4=6) = 6
    expect(warrior.hp).toBe(10);
    expect(hero.hp).toBe(20);
    expect(state.log.some((e) => e.kind === 'heal')).toBe(true);
  });

  it('attemptRetreat：敵人無 attack 招時不執行攻擊，殿後者 hp 不變、outcome 仍 retreated', () => {
    const healMove: Move = { id: 'heal', name: '祝禱', kind: 'support', target: 'ally', hitStat: 'cha',
      heal: { dice: 1, sides: 8, bonusStat: 'cha' }, narration: '{actor}治癒了{target}！' };
    const foe = makeEnemy('foe', 10, { moves: [healMove], intents: [{ weight: 1, moveId: 'heal' }] });
    const a = makeMember('a', 14); const b = makeMember('b', 8);
    const state = startCombat(scriptedRng([15, 5, 10]), [a, b], [foe]);
    attemptRetreat(scriptedRng([]), state);
    expect(state.outcome).toBe('retreated');
    expect(a.hp).toBe(20);
    expect(b.hp).toBe(20);
    expect(state.log.every((e) => e.kind === 'info' || e.kind === 'retreat')).toBe(true);
  });

  it('enemyAct：guard 意圖目標＝自己（設 guarding），不影響隊伍血量（M5 Task 1 架盾 AI 路徑鎖定）', () => {
    const guardMove: Move = { id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
      narration: '{actor}舉盾穩守，蓄勢以待。' };
    const foe = makeEnemy('foe', 10, { moves: [strike, guardMove], intents: [{ weight: 1, moveId: 'guard' }] });
    const hero = makeMember('hero', 14);
    const state = startCombat(scriptedRng([5, 15]), [hero], [foe]);
    expect(state.enemyIntents['foe']).toBe('guard');
    enemyAct(scriptedRng([]), state, 'foe');
    expect(state.guarding['foe']).toBe(true);
    expect(hero.hp).toBe(20);
    expect(foe.hp).toBe(10);
    expect(state.log.some((e) => e.kind === 'action' && e.text.includes('舉盾穩守'))).toBe(true);
  });

  it('resolveCasualties：主角必重傷；傭兵過 DC10 重傷、不過死亡', () => {
    const boss = makeMember('boss', 10, { isProtagonist: true });
    const merc1 = makeMember('m1', 10); const merc2 = makeMember('m2', 10);
    const state = startCombat(scriptedRng([10, 9, 8, 5]), [boss, merc1, merc2], [makeEnemy('foe', 10)]);
    boss.hp = 0; merc1.hp = 0; merc2.hp = 0;
    // merc1 擲 12+1(con12)=13 >= 10 → injured；merc2 擲 3+1=4 → dead
    const fates = resolveCasualties(scriptedRng([12, 3]), state);
    expect(fates).toEqual([
      { id: 'boss', fate: 'injured' },
      { id: 'm1', fate: 'injured' },
      { id: 'm2', fate: 'dead' },
    ]);
  });
});

describe('戰鬥狀態效果（M7）', () => {
  const poisonMove: Move = {
    id: 'venom', name: '毒牙', kind: 'attack', target: 'enemy', hitStat: 'str',
    damage: { dice: 1, sides: 4 },
    applyStatus: { kind: 'poison', duration: 2, potency: 2 },
    narration: '{actor}咬中{target}，造成 {amount} 點傷害！',
  };
  const stunMove: Move = {
    id: 'slam', name: '重壓', kind: 'attack', target: 'enemy', hitStat: 'str',
    damage: { dice: 1, sides: 4 },
    applyStatus: { kind: 'stun', duration: 1 },
    narration: '{actor}重壓{target}，造成 {amount} 點傷害！',
  };

  const mkParty = (): PartyMember[] => [{
    id: 'hero', name: '英雄', stats: { str: 14, dex: 20, int: 10, cha: 10, con: 14 },
    maxHp: 30, hp: 30, defense: 5, isProtagonist: true,
    moves: [{ id: 'hit', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 4 }, narration: '{actor}攻擊{target}，{amount} 傷害' }],
  }];
  const mkEnemy = (moves: Move[], hp = 20): EnemyUnit => ({
    id: 'foe', name: '敵人', stats: { str: 14, dex: 1, int: 8, cha: 8, con: 10 },
    maxHp: hp, hp, defense: 1, moves,
    intents: moves.map((m) => ({ weight: 1, moveId: m.id })),
  });

  function freshState(enemyMoves: Move[]): CombatState {
    // dex 20 vs 1：hero 必先攻
    return startCombat(createRng(7), mkParty(), [mkEnemy(enemyMoves)]);
  }

  it('攻擊命中附加中毒；中毒者行動前發作扣血、持續遞減、歸零解除', () => {
    const rng = createRng(3);
    const state = freshState([poisonMove]);
    // 敵人對英雄上毒（直接 performMove 路徑：敵人行動）
    state.turnIndex = state.order.indexOf('foe');
    enemyAct(rng, state, 'foe');
    const hero = state.party[0];
    expect(hero.statuses?.some((s) => s.kind === 'poison')).toBe(true);
    const hpAfterBite = hero.hp;
    // 英雄行動：毒發作 -2
    partyAct(rng, state, 'hero', 'hit', 'foe');
    expect(hero.hp).toBe(hpAfterBite - 2);
    expect(hero.statuses?.find((s) => s.kind === 'poison')?.remaining).toBe(1);
    expect(state.log.some((l) => l.text.includes('毒'))).toBe(true);
    // 第二次行動：再 -2 且解除
    state.turnIndex = state.order.indexOf('hero');
    partyAct(rng, state, 'hero', 'hit', 'foe');
    expect(hero.hp).toBe(hpAfterBite - 4);
    expect(hero.statuses?.some((s) => s.kind === 'poison')).toBe(false);
  });

  it('暈眩：行動被跳過（不出招），輪替照常、狀態解除', () => {
    const rng = createRng(3);
    const state = freshState([stunMove]);
    state.turnIndex = state.order.indexOf('foe');
    enemyAct(rng, state, 'foe');
    const hero = state.party[0];
    expect(hero.statuses?.some((s) => s.kind === 'stun')).toBe(true);
    const foeHpBefore = state.enemies[0].hp;
    partyAct(rng, state, 'hero', 'hit', 'foe');
    expect(state.enemies[0].hp).toBe(foeHpBefore); // 沒出招
    expect(state.log.some((l) => l.text.includes('暈'))).toBe(true);
    expect(hero.statuses?.some((s) => s.kind === 'stun')).toBe(false);
    expect(state.order[state.turnIndex]).not.toBe('hero'); // 輪替發生
  });

  it('強化：出手傷害 +potency、次數遞減歸零解除', () => {
    const rng = scriptedRng([10, 3]); // d20=10 必中（defense 1）、傷害骰 3
    const state = freshState([poisonMove]);
    const hero = state.party[0];
    hero.statuses = [{ kind: 'strength', remaining: 1, potency: 5 }];
    const foeHpBefore = state.enemies[0].hp;
    partyAct(rng, state, 'hero', 'hit', 'foe');
    const dealt = foeHpBefore - state.enemies[0].hp;
    expect(dealt).toBe(3 + 5); // 傷害骰 3（hit 招無 bonusStat）+ 強化 5
    expect(hero.statuses.some((s) => s.kind === 'strength')).toBe(false);
  });

  it('毒可以致死並觸發倒下與勝負判定', () => {
    const rng = createRng(3);
    const state = freshState([poisonMove]);
    const hero = state.party[0];
    hero.hp = 2;
    hero.statuses = [{ kind: 'poison', remaining: 3, potency: 2 }];
    partyAct(rng, state, 'hero', 'hit', 'foe');
    expect(hero.hp).toBe(0);
    expect(state.outcome).toBe('defeat');
  });

  it('蜘蛛毒牙與鹽晶洞主重壓帶狀態（資料接線）', async () => {
    const { ENCOUNTERS } = await import('./data/enemies');
    const spider = ENCOUNTERS.enc_mine_spiders()[0];
    expect(spider.moves.some((m) => m.applyStatus?.kind === 'poison')).toBe(true);
    const boss = ENCOUNTERS.enc_salt_cavern_boss()[0];
    expect(boss.moves.some((m) => m.applyStatus?.kind === 'stun')).toBe(true);
  });
});

describe('Boss 激怒機制（M10）', () => {
  const mkHero = (): PartyMember[] => [{
    id: 'hero', name: '英雄', stats: { str: 16, dex: 20, int: 10, cha: 10, con: 14 },
    maxHp: 30, hp: 30, defense: 5, isProtagonist: true,
    moves: [{ id: 'hit', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}攻擊{target}，{amount} 傷害' }],
  }];
  const mkBoss = (): EnemyUnit => ({
    id: 'boss', name: '魔王', stats: { str: 14, dex: 1, int: 8, cha: 8, con: 14 },
    maxHp: 20, hp: 20, defense: 1,
    enrage: { threshold: 0.5, potency: 3 },
    moves: [{ id: 'smash', name: '猛擊', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 6 }, narration: '{actor}猛擊{target}，{amount} 傷害' }],
    intents: [{ weight: 1, moveId: 'smash' }],
  });

  it('HP 降至門檻以下觸發激怒（獲得強化＋log），且只觸發一次', () => {
    const state = startCombat(createRng(9), mkHero(), [mkBoss()]);
    const boss = state.enemies[0];
    state.turnIndex = state.order.indexOf('hero');
    // 打到半血以下（scriptedRng：命中骰 15、傷害骰足以過半）
    partyAct(scriptedRng([15, 6]), state, 'hero', 'hit', 'boss'); // 6+3(str16 mod)=9 → hp 11
    expect(boss.statuses?.some((s) => s.kind === 'strength')).toBeFalsy(); // 11/20 > 0.5 未觸發
    state.turnIndex = state.order.indexOf('hero');
    partyAct(scriptedRng([15, 3]), state, 'hero', 'hit', 'boss'); // -6 → hp 5 ≤ 50%
    expect(boss.statuses?.some((s) => s.kind === 'strength')).toBe(true);
    expect(state.log.some((l) => l.text.includes('激怒'))).toBe(true);
    const strengthCount = boss.statuses!.filter((s) => s.kind === 'strength').length;
    state.turnIndex = state.order.indexOf('hero');
    partyAct(scriptedRng([15, 1]), state, 'hero', 'hit', 'boss'); // 再打不重複觸發
    expect(boss.statuses!.filter((s) => s.kind === 'strength').length).toBe(strengthCount);
  });

  it('三大 boss 資料皆帶 enrage；一般小怪不帶', async () => {
    const { ENCOUNTERS } = await import('./data/enemies');
    for (const encId of ['enc_mine_overseer', 'enc_goblin_den_chief', 'enc_salt_cavern_boss']) {
      expect(ENCOUNTERS[encId]()[0].enrage, `${encId} 缺 enrage`).toBeDefined();
    }
    expect(ENCOUNTERS.enc_wolf_pair()[0].enrage).toBeUndefined();
  });
});

describe('M11 戰鬥道具（useItemInCombat）', () => {
  const healer = (): PartyMember => ({
    id: 'p1', name: '你', stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 },
    maxHp: 22, hp: 10, defense: 14, isProtagonist: true,
    moves: [{ id: 'strike', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}攻擊{target}造成{amount}點傷害' }],
  });
  const foe = (): EnemyUnit => ({
    id: 'e1', name: '哥布林', stats: { str: 10, dex: 10, int: 8, cha: 6, con: 10 },
    maxHp: 8, hp: 8, defense: 10, xp: 10,
    moves: [{ id: 'stab', name: '短刀', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4, bonusStat: 'str' }, narration: '{actor}刺向{target}造成{amount}點傷害' }],
    intents: [{ moveId: 'stab', weight: 1 }],
  });

  it('治療道具：目標回血不超過 maxHp、消耗行動（輪到下一位）、寫入 log', () => {
    const state = startCombat(scriptedRng([20, 1]), [healer()], [foe()]);
    useItemInCombat(state, 'p1', { kind: 'heal', amount: 6, name: '藥草' }, 'p1');
    const unit = state.party[0];
    expect(unit.hp).toBe(16);
    expect(state.log.some((e) => e.text.includes('藥草'))).toBe(true);
    expect(currentActor(state)?.side).toBe('enemy'); // 行動已消耗
  });

  it('治療不溢出 maxHp', () => {
    const member = healer(); member.hp = 20;
    const state = startCombat(scriptedRng([20, 1]), [member], [foe()]);
    useItemInCombat(state, 'p1', { kind: 'heal', amount: 12, name: '繃帶' }, 'p1');
    expect(state.party[0].hp).toBe(22);
  });

  it('解毒道具：清除目標身上的 poison，保留其他狀態', () => {
    const member = healer();
    member.statuses = [
      { kind: 'poison', remaining: 2, potency: 2 },
      { kind: 'strength', remaining: 2, potency: 3 },
    ];
    const state = startCombat(scriptedRng([20, 1]), [member], [foe()]);
    useItemInCombat(state, 'p1', { kind: 'cure', name: '解毒劑' }, 'p1');
    const statuses = state.party[0].statuses ?? [];
    expect(statuses.some((st) => st.kind === 'poison')).toBe(false);
    expect(statuses.some((st) => st.kind === 'strength')).toBe(true);
  });

  it('強化道具：附加 strength 狀態', () => {
    const state = startCombat(scriptedRng([20, 1]), [healer()], [foe()]);
    useItemInCombat(state, 'p1', { kind: 'buff', status: { kind: 'strength', duration: 2, potency: 2 }, name: '行軍補劑' }, 'p1');
    const statuses = state.party[0].statuses ?? [];
    expect(statuses.some((st) => st.kind === 'strength' && st.potency === 2)).toBe(true);
  });

  it('對倒下的隊友使用丟錯；戰鬥已結束丟錯', () => {
    const member = healer(); member.hp = 0;
    const ally = healer(); ally.id = 'p2'; ally.name = '甲';
    const state = startCombat(scriptedRng([20, 1]), [ally, member], [foe()]);
    expect(() => useItemInCombat(state, 'p2', { kind: 'heal', amount: 6, name: '藥草' }, 'p1')).toThrow();
    state.outcome = 'victory';
    expect(() => useItemInCombat(state, 'p2', { kind: 'heal', amount: 6, name: '藥草' }, 'p2')).toThrow();
  });
});

describe('M15 戰術戰鬥：屬性弱點與破防', () => {
  const attacker = (): PartyMember => ({
    id: 'p1', name: '你', stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 },
    maxHp: 22, hp: 22, defense: 14, isProtagonist: true,
    moves: [
      { id: 'slash-hit', name: '斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
        damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}造成{amount}點傷害' },
      { id: 'blunt-hit', name: '鈍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'blunt',
        damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}砸向{target}造成{amount}點傷害' },
      { id: 'plain-hit', name: '普擊', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}擊向{target}造成{amount}點傷害' },
    ],
  });
  const foe = (over: Partial<EnemyUnit> = {}): EnemyUnit => ({
    id: 'e1', name: '哥布林', stats: { str: 10, dex: 10, int: 8, cha: 6, con: 10 },
    maxHp: 40, hp: 40, defense: 5, xp: 10,
    weaknesses: ['slash'], resists: ['blunt'], maxPoise: 2,
    moves: [{ id: 'stab', name: '短刀', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4, bonusStat: 'str' }, narration: '{actor}刺向{target}造成{amount}點傷害' }],
    intents: [{ moveId: 'stab', weight: 1 }],
    ...over,
  });

  // scriptedRng：d20 與 damage roll 共用序列——[10(命中), 4(傷害骰)] 基礎傷 4+1(str mod)=5
  it('弱點 ×1.5（進位）＋「擊中弱點」log；抗性 ×0.5；中性不變', () => {
    const s1 = startCombat(scriptedRng([10, 4, 1]), [attacker()], [foe()]);
    partyAct(scriptedRng([10, 4]), s1, 'p1', 'slash-hit', 'e1');
    expect(s1.enemies[0].hp).toBe(40 - 8); // round(5×1.5)=8
    expect(s1.log.some((e) => e.text.includes('擊中弱點'))).toBe(true);

    const s2 = startCombat(scriptedRng([10, 4, 1]), [attacker()], [foe()]);
    partyAct(scriptedRng([10, 4]), s2, 'p1', 'blunt-hit', 'e1');
    expect(s2.enemies[0].hp).toBe(40 - 3); // round(5×0.5)=3（min 1 保底不觸發）
    expect(s2.log.some((e) => e.text.includes('效果不佳'))).toBe(true);

    const s3 = startCombat(scriptedRng([10, 4, 1]), [attacker()], [foe()]);
    partyAct(scriptedRng([10, 4]), s3, 'p1', 'plain-hit', 'e1');
    expect(s3.enemies[0].hp).toBe(40 - 5);
  });

  it('破防：弱點命中削 1 護勢、中性不削；歸零→暈眩＋護勢重置＋「破防」log', () => {
    const state = startCombat(scriptedRng([10, 4, 1]), [attacker()], [foe()]);
    expect(state.enemies[0].poise).toBe(2);
    partyAct(scriptedRng([10, 4]), state, 'p1', 'slash-hit', 'e1');
    expect(state.enemies[0].poise).toBe(1);
    // 中性攻擊不削
    partyAct(scriptedRng([10, 4]), state, 'p1', 'plain-hit', 'e1');
    expect(state.enemies[0].poise).toBe(1);
    // 第二次弱點命中 → 破防
    partyAct(scriptedRng([10, 4]), state, 'p1', 'slash-hit', 'e1');
    expect(state.enemies[0].poise).toBe(2); // 重置
    expect((state.enemies[0].statuses ?? []).some((st) => st.kind === 'stun')).toBe(true);
    expect(state.log.some((e) => e.text.includes('破防'))).toBe(true);
  });

  it('落空不削護勢也不觸發弱點', () => {
    const state = startCombat(scriptedRng([2, 4, 1]), [attacker()], [foe()]);
    partyAct(scriptedRng([2]), state, 'p1', 'slash-hit', 'e1'); // d20=2+1 < defense 5? 3<5 落空
    expect(state.enemies[0].hp).toBe(40);
    expect(state.enemies[0].poise).toBe(2);
  });
});
