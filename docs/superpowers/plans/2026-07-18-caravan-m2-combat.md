# 《商隊與劍》M2：隊伍骰子戰鬥 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作規格 §3.3 的隊伍骰子回合制戰鬥引擎（先攻、招式、命中/傷害、敵方意圖預告、撤退、歸零處理）、存檔 v2（主角＋傭兵 roster）、戰鬥 UI 與城鎮「訓練場」入口，e2e 以 URL seed 參數確定化。

**Architecture:** 戰鬥為純函式狀態機（`combat.ts`），所有隨機經注入的 `Rng`；UI 只讀 `CombatState` 渲染並呼叫動作函式。存檔以遷移表升 v2 不清檔。職業/敵人為資料檔。

**Tech Stack:** TypeScript、vitest、Playwright、DOM（無 Pixi）。

## Global Constraints

- 隨機只能來自注入的 `Rng`（`createRng(seed)`）；禁止 `Math.random()`。
- 命中：`d20 + statMod(hitStat) vs defense`；nat20 必中、nat1 必失手（沿用 check.ts 精神）。
- 屬性調整值：`statMod(v) = Math.floor((v - 10) / 2)`（D&D 式）。
- 歸零：傭兵→體質檢定 DC 10，成功＝重傷（缺席 2 趟遠征）、失敗＝死亡；主角必定重傷不死（規格 §3.3）。
- 存檔 key 不變 `caravan-save-v1`（key 含 v1 為歷史命名，schema version 欄位才是真版本）；v1→v2 遷移不清玩家檔；毀損一律回 null。
- 敘事文字繁體中文；招式敘事模板用 `{actor}`/`{target}`/`{amount}` 佔位。
- 測試 `npx vitest run <path>`；e2e `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`。
- Conventional Commits＋`Co-Authored-By: Claude <noreply@anthropic.com>`。
- M1 遺留必辦（納入對應任務）：`weightedPick` 空陣列/零權重 guard（Task 1 消費前補）；`importSave` 需與 `loadGame` 同樣跑遷移（Task 3）。

## File Structure（M2 鎖定）

```
src/scripts/games/caravan/
├── rng.ts            # modify：weightedPick guard（空/零權重丟 Error）
├── check.ts          # modify：新增 statMod()
├── combat.ts         # create：戰鬥狀態機
├── combat.test.ts    # create
├── save.ts           # modify：SaveDataV2 + 遷移 + importSave 跑遷移
├── save.test.ts      # modify：v2 案例
├── data/jobs.ts      # create：4 職業（stats 模板＋Lv1 招式）
├── data/enemies.ts   # create：3 種敵人（訓練場用）
src/pages/games/caravan.astro   # modify：戰鬥畫面＋訓練場入口＋seed 參數
tests/e2e/caravan.spec.ts       # modify：新增戰鬥流程案例
```

---

### Task 1: 戰鬥核心——statMod、型別、先攻與回合順序

**Files:**
- Modify: `src/scripts/games/caravan/check.ts`（新增 statMod）
- Modify: `src/scripts/games/caravan/rng.ts`（weightedPick guard）
- Modify: `src/scripts/games/caravan/rng.test.ts`（guard 案例）
- Create: `src/scripts/games/caravan/combat.ts`
- Create: `src/scripts/games/caravan/combat.test.ts`

**Interfaces:**
- Consumes: `Rng`/`createRng`（M1）、`Stat`/`StatBlock`（M1）
- Produces（後續任務與 M3 依賴，簽名照抄）:

```ts
// check.ts 新增
export function statMod(value: number): number;  // Math.floor((value-10)/2)

// combat.ts
export interface Move {
  id: string; name: string;
  kind: 'attack' | 'guard' | 'support';
  target: 'enemy' | 'ally' | 'self';
  hitStat: Stat;
  damage?: { dice: number; sides: number; bonusStat?: Stat };
  heal?: { dice: number; sides: number; bonusStat?: Stat };
  narration: string; // 例：「{actor}的巨劍劈向{target}，造成 {amount} 點傷害！」
}
export interface CombatantBase {
  id: string; name: string; stats: StatBlock;
  maxHp: number; hp: number; defense: number; moves: Move[];
}
export interface PartyMember extends CombatantBase { isProtagonist?: boolean; }
export interface EnemyUnit extends CombatantBase { intents: Array<{ weight: number; moveId: string }>; }
export interface CombatEvent { kind: 'action'|'damage'|'heal'|'down'|'info'|'retreat'|'victory'|'defeat'; text: string; }
export interface CombatState {
  round: number;
  order: string[];                      // 先攻序（id），高到低
  turnIndex: number;                    // order 中目前行動者索引
  party: PartyMember[]; enemies: EnemyUnit[];
  guarding: Record<string, boolean>;    // 架盾中（受擊防禦+4，行動者輪到時解除）
  enemyIntents: Record<string, string>; // enemyId -> 預告的 moveId
  log: CombatEvent[];
  outcome: 'ongoing' | 'victory' | 'defeat' | 'retreated';
}
export function startCombat(rng: Rng, party: PartyMember[], enemies: EnemyUnit[]): CombatState;
export function currentActor(state: CombatState): { side: 'party' | 'enemy'; id: string } | null;
export function advanceTurn(state: CombatState): void;  // turnIndex 前進；跳過 hp<=0；繞回時 round+1；行動者 guarding 解除
```

規則：先攻 = `d20 + statMod(dex)`，同分穩定排序（依傳入順序）；`startCombat` 為每個敵人 `weightedPick` 一個意圖存入 `enemyIntents` 並在 log 推入 `info`（「戰鬥開始！」）；`currentActor` 在 outcome!=='ongoing' 回 null；hp<=0 的行動者被 `advanceTurn` 跳過。

- [ ] **Step 1: rng guard 失敗測試** —— `rng.test.ts` 新增：

```ts
  it('weightedPick 空陣列或總權重 0 擲出 Error（M1 遺留 guard）', () => {
    const rng = createRng(1);
    expect(() => rng.weightedPick([])).toThrow();
    expect(() => rng.weightedPick([{ weight: 0, value: 'x' }])).toThrow();
  });
```

Run: `npx vitest run src/scripts/games/caravan/rng.test.ts` → FAIL（現行 fallback 不丟錯）

- [ ] **Step 2: rng.ts 修 weightedPick** —— 函式開頭加：

```ts
      const total = items.reduce((sum, it) => sum + it.weight, 0);
      if (items.length === 0 || total <= 0) {
        throw new Error('weightedPick: 空清單或總權重為 0');
      }
```

（原本函式內已計算 total，改為開頭先算並 guard，其餘沿用。）
Run: 同上 → PASS（8 tests）

- [ ] **Step 3: combat 核心失敗測試**

```ts
// src/scripts/games/caravan/combat.test.ts
import { describe, it, expect } from 'vitest';
import { statMod } from './check';
import { startCombat, currentActor, advanceTurn } from './combat';
import type { PartyMember, EnemyUnit, Move } from './combat';
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
```

Run: `npx vitest run src/scripts/games/caravan/combat.test.ts` → FAIL（模組不存在）

- [ ] **Step 4: 實作**

check.ts 追加：

```ts
/** D&D 式屬性調整值 */
export function statMod(value: number): number {
  return Math.floor((value - 10) / 2);
}
```

combat.ts（本任務範圍：型別＋startCombat/currentActor/advanceTurn；動作結算留 Task 2）：

```ts
import type { Rng } from './rng';
import type { Stat, StatBlock } from './types';
import { statMod } from './check';

// ……（上方 Interfaces 區塊的型別定義照抄）……

export function startCombat(rng: Rng, party: PartyMember[], enemies: EnemyUnit[]): CombatState {
  const all = [...party.map((p) => ({ id: p.id, dex: p.stats.dex, side: 0 as const })),
               ...enemies.map((e) => ({ id: e.id, dex: e.stats.dex, side: 1 as const }))];
  const rolled = all.map((c, index) => ({ ...c, index, init: rng.d20() + statMod(c.dex) }));
  rolled.sort((a, b) => b.init - a.init || a.index - b.index);
  const state: CombatState = {
    round: 1, order: rolled.map((r) => r.id), turnIndex: 0,
    party, enemies, guarding: {}, enemyIntents: {}, log: [], outcome: 'ongoing',
  };
  for (const enemy of enemies) {
    state.enemyIntents[enemy.id] = rng.weightedPick(
      enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
    );
  }
  state.log.push({ kind: 'info', text: '戰鬥開始！' });
  return state;
}

function findCombatant(state: CombatState, id: string): { side: 'party' | 'enemy'; unit: CombatantBase } | null {
  const p = state.party.find((m) => m.id === id);
  if (p) return { side: 'party', unit: p };
  const e = state.enemies.find((m) => m.id === id);
  if (e) return { side: 'enemy', unit: e };
  return null;
}

export function currentActor(state: CombatState): { side: 'party' | 'enemy'; id: string } | null {
  if (state.outcome !== 'ongoing') return null;
  const id = state.order[state.turnIndex];
  const found = findCombatant(state, id);
  if (!found) return null;
  return { side: found.side, id };
}

export function advanceTurn(state: CombatState): void {
  for (let step = 0; step < state.order.length; step++) {
    state.turnIndex += 1;
    if (state.turnIndex >= state.order.length) {
      state.turnIndex = 0;
      state.round += 1;
    }
    const id = state.order[state.turnIndex];
    const found = findCombatant(state, id);
    if (found && found.unit.hp > 0) {
      delete state.guarding[id];  // 輪到自己時解除架盾
      return;
    }
  }
}
```

Run: `npx vitest run src/scripts/games/caravan/` → 全綠（8 rng + 5 check + 12 save + 9 combat = 34）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/caravan/rng.ts src/scripts/games/caravan/rng.test.ts src/scripts/games/caravan/check.ts src/scripts/games/caravan/combat.ts src/scripts/games/caravan/combat.test.ts
git commit -m "feat(caravan): 戰鬥核心——statMod/先攻/回合序/意圖預告＋weightedPick guard（M2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 戰鬥動作結算——命中/傷害/架盾/治療/倒地/撤退/勝敗

**Files:**
- Modify: `src/scripts/games/caravan/combat.ts`
- Modify: `src/scripts/games/caravan/combat.test.ts`

**Interfaces:**
- Consumes: Task 1 全部
- Produces:

```ts
export function partyAct(rng: Rng, state: CombatState, actorId: string, moveId: string, targetId: string): void;
export function enemyAct(rng: Rng, state: CombatState, enemyId: string): void;   // 用 enemyIntents 的招式，目標=hp 最低的存活隊員；行動後重新預告
export function attemptRetreat(rng: Rng, state: CombatState): void;              // outcome='retreated'；殿後者（先攻最低的存活隊員）受一次敵方首個存活者的攻擊
export function resolveCasualties(rng: Rng, state: CombatState): Array<{ id: string; fate: 'injured' | 'dead' }>;
```

規則（皆為 Global Constraints 的具體化）：
- 攻擊：`d20 + statMod(hitStat)` vs 目標 `defense`（架盾中 +4）；nat20 必中、nat1 必失手；命中傷害 = `dice×sides 加總 + statMod(bonusStat ?? 無)`（最低 1）；未命中 log `action`「…落空」。
- `kind:'guard'`：設 `guarding[actorId]=true`，log `action`。
- `kind:'support'` 有 `heal`：治療目標 `heal 骰 + statMod(bonusStat)`（不超過 maxHp），log `heal`。
- hp 歸零：`down` log（「{name}倒下了！」）；行動後檢查：敵全滅→`victory`＋log；隊全滅→`defeat`＋log。
- 每個 party/enemy 行動函式結尾（若 outcome 仍 ongoing）自動 `advanceTurn`。
- `resolveCasualties`：對 hp<=0 的隊員——主角（isProtagonist）一律 `injured`；傭兵擲 `d20 + statMod(con)` vs DC 10，過=injured、不過=dead。

- [ ] **Step 1: 失敗測試**（追加到 combat.test.ts；沿用 scriptedRng/makeMember/makeEnemy/strike）

```ts
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
    const state = startCombat(scriptedRng([5, 6, 15]), [a, b], [makeEnemy('foe', 10)]);
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
```

Run: `npx vitest run src/scripts/games/caravan/combat.test.ts` → FAIL（函式未定義）

- [ ] **Step 2: 實作**（combat.ts 追加）

```ts
function fillNarration(template: string, actor: string, target: string, amount: number): string {
  return template.replace('{actor}', actor).replace('{target}', target).replace('{amount}', String(amount));
}

function rollDice(rng: Rng, dice: number, sides: number): number {
  let sum = 0;
  for (let i = 0; i < dice; i++) sum += rng.roll(sides);
  return sum;
}

function checkOutcome(state: CombatState): void {
  if (state.enemies.every((e) => e.hp <= 0)) {
    state.outcome = 'victory';
    state.log.push({ kind: 'victory', text: '敵人被擊潰了！' });
  } else if (state.party.every((p) => p.hp <= 0)) {
    state.outcome = 'defeat';
    state.log.push({ kind: 'defeat', text: '商隊的旗幟倒下了……' });
  }
}

function applyDamage(state: CombatState, target: CombatantBase, amount: number): void {
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) state.log.push({ kind: 'down', text: `${target.name}倒下了！` });
}

function performMove(rng: Rng, state: CombatState, actor: CombatantBase, move: Move, target: CombatantBase): void {
  if (move.kind === 'guard') {
    state.guarding[actor.id] = true;
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, actor.name, 0) });
    return;
  }
  if (move.kind === 'support' && move.heal) {
    const amount = Math.max(1, rollDice(rng, move.heal.dice, move.heal.sides)
      + (move.heal.bonusStat ? statMod(actor.stats[move.heal.bonusStat]) : 0));
    const applied = Math.min(amount, target.maxHp - target.hp);
    target.hp += applied;
    state.log.push({ kind: 'heal', text: fillNarration(move.narration, actor.name, target.name, applied) });
    return;
  }
  // attack
  const die = rng.d20();
  const defense = target.defense + (state.guarding[target.id] ? 4 : 0);
  const hit = die === 20 ? true : die === 1 ? false : die + statMod(actor.stats[move.hitStat]) >= defense;
  if (!hit) {
    state.log.push({ kind: 'action', text: `${actor.name}的${move.name}落空了！` });
    return;
  }
  const dmgSpec = move.damage ?? { dice: 1, sides: 4 };
  const amount = Math.max(1, rollDice(rng, dmgSpec.dice, dmgSpec.sides)
    + (dmgSpec.bonusStat ? statMod(actor.stats[dmgSpec.bonusStat]) : 0));
  state.log.push({ kind: 'damage', text: fillNarration(move.narration, actor.name, target.name, amount) });
  applyDamage(state, target, amount);
}

export function partyAct(rng: Rng, state: CombatState, actorId: string, moveId: string, targetId: string): void {
  const actor = state.party.find((p) => p.id === actorId);
  const move = actor?.moves.find((m) => m.id === moveId);
  const targetFound = [...state.party, ...state.enemies].find((c) => c.id === targetId);
  if (!actor || !move || !targetFound || state.outcome !== 'ongoing') return;
  performMove(rng, state, actor, move, targetFound);
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

export function enemyAct(rng: Rng, state: CombatState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || state.outcome !== 'ongoing') return;
  const moveId = state.enemyIntents[enemyId] ?? enemy.moves[0].id;
  const move = enemy.moves.find((m) => m.id === moveId) ?? enemy.moves[0];
  const alive = state.party.filter((p) => p.hp > 0);
  if (alive.length === 0) return;
  const target = alive.reduce((low, p) => (p.hp < low.hp ? p : low), alive[0]);
  performMove(rng, state, enemy, move, target);
  state.enemyIntents[enemyId] = rng.weightedPick(
    enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
  );
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

export function attemptRetreat(rng: Rng, state: CombatState): void {
  if (state.outcome !== 'ongoing') return;
  const aliveParty = state.party.filter((p) => p.hp > 0);
  const aliveEnemy = state.enemies.find((e) => e.hp > 0);
  if (aliveParty.length > 0 && aliveEnemy) {
    // 殿後者 = order 中最後出現的存活隊員（先攻最低）
    const rear = [...state.order].reverse()
      .map((id) => aliveParty.find((p) => p.id === id))
      .find((p) => p !== undefined)!;
    state.log.push({ kind: 'retreat', text: `${rear.name}殿後掩護撤退……` });
    performMove(rng, state, aliveEnemy, aliveEnemy.moves[0], rear);
  }
  state.outcome = 'retreated';
  state.log.push({ kind: 'retreat', text: '商隊撤出了戰鬥。' });
}

export function resolveCasualties(rng: Rng, state: CombatState): Array<{ id: string; fate: 'injured' | 'dead' }> {
  const fates: Array<{ id: string; fate: 'injured' | 'dead' }> = [];
  for (const member of state.party) {
    if (member.hp > 0) continue;
    if (member.isProtagonist) {
      fates.push({ id: member.id, fate: 'injured' });
    } else {
      const roll = rng.d20() + statMod(member.stats.con);
      fates.push({ id: member.id, fate: roll >= 10 ? 'injured' : 'dead' });
    }
  }
  return fates;
}
```

Run: `npx vitest run src/scripts/games/caravan/` → 全綠（43 tests）

- [ ] **Step 3: Commit**

```bash
git add src/scripts/games/caravan/combat.ts src/scripts/games/caravan/combat.test.ts
git commit -m "feat(caravan): 戰鬥動作結算——命中/傷害/架盾/治療/倒地/撤退/勝敗/傷亡（M2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 存檔 v2——roster schema 與遷移

**Files:**
- Modify: `src/scripts/games/caravan/save.ts`
- Modify: `src/scripts/games/caravan/save.test.ts`

**Interfaces:**
- Consumes: `StatBlock`（M1）
- Produces:

```ts
export interface CompanionRecord {
  id: string; name: string; job: 'swordsman' | 'ranger' | 'mage' | 'cleric';
  level: number; xp: number; stats: StatBlock; maxHp: number;
  injuredForTrips: number;   // >0 表示重傷缺席剩餘趟數
}
export interface SaveDataV2 {
  version: 2; createdAt: number; gold: number; flags: Record<string, boolean>;
  protagonist: CompanionRecord; companions: CompanionRecord[];
}
export type SaveData = SaveDataV2;         // 對外別名，後續版本跟著改
// CURRENT_VERSION = 2；MIGRATIONS[1] = v1→v2（補 protagonist 預設值與空 companions）
// newGame() 直接產 v2；isValidSaveShape 驗 v2 形狀（含 protagonist/companions）
// importSave 修正：解碼後與 loadGame 走同一條遷移＋驗證路徑（M1 遺留問題）
```

v1→v2 預設主角：`{ id: 'protagonist', name: '你', job: 'swordsman', level: 1, xp: 0, stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22, injuredForTrips: 0 }`。

- [ ] **Step 1: 失敗測試** —— save.test.ts：既有 v1 形狀案例改為透過「寫入 v1 檔→loadGame 應遷移成 v2」表達；新增：

```ts
  it('newGame 產出 v2：含預設主角與空傭兵清單', () => {
    const s = newGame(1000);
    expect(s.version).toBe(2);
    expect(s.protagonist.name).toBe('你');
    expect(s.protagonist.job).toBe('swordsman');
    expect(s.companions).toEqual([]);
    expect(s.gold).toBe(200);
  });

  it('v1 舊檔 loadGame 自動遷移為 v2 且保留原金幣與旗標', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, createdAt: 5, gold: 777, flags: { met: true } }));
    const s = loadGame();
    expect(s?.version).toBe(2);
    expect(s?.gold).toBe(777);
    expect(s?.flags).toEqual({ met: true });
    expect(s?.protagonist.id).toBe('protagonist');
  });

  it('v2 檔缺 protagonist → 視為毀損回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, createdAt: 1, gold: 5, flags: {}, companions: [] }));
    expect(loadGame()).toBeNull();
  });

  it('importSave 對 v1 字串也會遷移（與 loadGame 同路徑）', () => {
    const v1 = btoa(encodeURIComponent(JSON.stringify({ version: 1, createdAt: 5, gold: 42, flags: {} })));
    const s = importSave(v1);
    expect(s?.version).toBe(2);
    expect(s?.gold).toBe(42);
  });
```

既有測試調整原則：斷言意圖不變（毀損回 null、未來版本回 null、往返相等），只把「合法檔」樣本從 v1 換成 `newGame()` 產出的 v2；`{"version":1,...}` 完整 v1 檔案例改斷言「遷移成功」而非 null。
Run: `npx vitest run src/scripts/games/caravan/save.test.ts` → FAIL

- [ ] **Step 2: 實作** —— save.ts：加 `CompanionRecord`/`SaveDataV2`；`CURRENT_VERSION = 2`；`MIGRATIONS[1] = (old) => ({ ...old, version: 2, protagonist: DEFAULT_PROTAGONIST(), companions: [] })`；`newGame` 回 v2；`isValidSaveShape` 改驗 v2（version/createdAt/gold number、flags 物件、protagonist 物件含 stats、companions 陣列）；**importSave 與 loadGame 抽共用 `parseAndMigrate(raw: unknown)`**（遷移→shape 驗證→未來版本回 null），兩邊都走它。`SaveDataV1` 型別保留供遷移測試參考可移除——以最終程式碼乾淨為準（不留死型別，v1 形狀只存在於遷移函式輸入）。

Run: `npx vitest run src/scripts/games/caravan/save.test.ts` → PASS；`npx vitest run src/scripts/games/caravan/` 全綠

- [ ] **Step 3: 檢查 caravan.astro 的消費端**——M1 外殼頁只讀 `save.gold`，v2 仍有 gold 欄位，無需改動；確認 `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1` 仍 4/4 綠（存檔相容驗證）。

- [ ] **Step 4: Commit**

```bash
git add src/scripts/games/caravan/save.ts src/scripts/games/caravan/save.test.ts
git commit -m "feat(caravan): 存檔 v2——主角/傭兵 roster、v1 自動遷移、importSave 遷移對齊（M2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 職業/敵人資料、戰鬥 UI 與訓練場入口

**Files:**
- Create: `src/scripts/games/caravan/data/jobs.ts`
- Create: `src/scripts/games/caravan/data/enemies.ts`
- Modify: `src/pages/games/caravan.astro`
- Modify: `tests/e2e/caravan.spec.ts`

**Interfaces:**
- Consumes: `Move`/`PartyMember`/`EnemyUnit`/`startCombat`/`partyAct`/`enemyAct`/`attemptRetreat`/`currentActor`（Task 1-2）、`loadGame`/`saveGame`/`CompanionRecord`（Task 3）、`createRng`（M1）
- Produces:

```ts
// data/jobs.ts
export type JobId = 'swordsman' | 'ranger' | 'mage' | 'cleric';
export interface JobDef { id: JobId; name: string; baseStats: StatBlock; baseMaxHp: number; defense: number; moves: Move[] }
export const JOBS: Record<JobId, JobDef>;
export function memberFromRecord(record: CompanionRecord): PartyMember;  // 用 JOBS[record.job] 的 moves/defense＋record 的 stats/maxHp

// data/enemies.ts
export const TRAINING_ENCOUNTER: () => EnemyUnit[];   // 每次呼叫回傳全新物件（哥布林斥候×2）
```

職業招式（各 2 招＋通用「揮擊」，繁中敘事模板自行撰寫，數值如下）：
- 劍士 swordsman：重斬（1d10+str）、架盾（guard）；base str14/dex10/int8/cha10/con14、HP26、def14
- 游俠 ranger：疾射（1d8+dex）、瞄準射擊（1d6+dex，命中用 dex）；base str10/dex16/int10/cha10/con10、HP20、def13
- 法師 mage：火球（2d6+int）、冰刺（1d8+int）；base str8/dex10/int16/cha10/con8、HP16、def11
- 教士 cleric：聖擊（1d6+cha）、治癒（heal 1d8+cha）；base str10/dex8/int12/cha16/con12、HP22、def12
- 敵人：哥布林斥候（HP8/def11/短刀 1d6+str、str10 dex14）意圖全攻擊。

UI（`caravan.astro` 追加 `#screen-combat` section＋城鎮加 `#btn-training`「訓練場」按鈕）：

DOM 合約（e2e 與 M3 依賴）：`#screen-combat`（初始 hidden）、`#combat-enemies`（每敵一個 `.combat-unit`，含 `.unit-name` 與 `.unit-hp` 文字「HP x/y」與意圖 `.unit-intent`）、`#combat-party`（同構）、`#combat-log`（每個 CombatEvent 一個 `<p>`）、`#combat-actions`（目前行動隊員的招式按鈕 `.move-btn`，`data-move-id`；敵方目標用 `#combat-targets` 的 `.target-btn`，`data-target-id`；單一敵人時點招式直接打它——簡化：**M2 固定單目標自動指向第一個存活敵人**，`#combat-targets` 留待 M3 多目標時加）、`#btn-retreat`、戰後 `#combat-result`（顯示勝利/敗北/撤退文案與「返回城鎮」`#btn-combat-back`）。

流程碼（頁內 script 追加，關鍵邏輯）：seed 來源 `new URLSearchParams(location.search).get('seed')`，有值用 `createRng(Number(seed))`，否則 `createRng(Date.now())`；`#btn-training` 點擊→`startCombat(rng, [memberFromRecord(save.protagonist)], TRAINING_ENCOUNTER())`→渲染循環：`render(state)` 更新 HP/意圖/log/按鈕；輪到敵方時 `setTimeout(() => { enemyAct(rng, state, id); render(state); }, 600)`；隊員招式點擊→`partyAct(rng, state, actorId, moveId, 第一個存活敵人id)`→render；outcome 非 ongoing→顯示 `#combat-result`；返回城鎮恢復 `#screen-town`（訓練場不結算傷亡、不動存檔——純模擬）。

- [ ] **Step 1: 失敗 e2e**（caravan.spec.ts 追加 describe）

```ts
test.describe('商隊與劍：訓練場戰鬥', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/games/caravan?seed=42');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
  });

  test('訓練場開戰：戰鬥畫面、敵我單位與意圖預告可見', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    await expect(page.locator('#combat-enemies .combat-unit')).toHaveCount(2);
    await expect(page.locator('#combat-party .combat-unit')).toHaveCount(1);
    await expect(page.locator('#combat-enemies .unit-intent').first()).not.toBeEmpty();
    await expect(page.locator('#combat-log p').first()).toContainText('戰鬥開始');
  });

  test('打到分出勝負：點招式推進、log 累積、結果面板出現、可返回城鎮', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    for (let i = 0; i < 40; i++) {
      const result = page.locator('#combat-result');
      if (await result.isVisible()) break;
      const move = page.locator('#combat-actions .move-btn').first();
      if (await move.isVisible().catch(() => false)) {
        await move.click();
      }
      await page.waitForTimeout(250);
    }
    await expect(page.locator('#combat-result')).toBeVisible();
    const logCount = await page.locator('#combat-log p').count();
    expect(logCount).toBeGreaterThan(3);
    await page.click('#btn-combat-back');
    await expect(page.locator('#screen-town')).toBeVisible();
  });

  test('撤退：點撤退鈕出現撤退結果', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    await page.locator('#btn-retreat').click();
    await expect(page.locator('#combat-result')).toBeVisible();
    await expect(page.locator('#combat-result')).toContainText('撤');
  });
});
```

Run: `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1` → 新 describe 3 案例 FAIL（#btn-training 不存在）、原 4 案例仍 PASS

- [ ] **Step 2: 實作 data 檔與 UI**（照上方 Interfaces 與流程碼規格；樣式沿 M1 文庫本基調，戰鬥單位卡淡框、意圖用小字斜體、log 區固定高度可捲動；禁 `!important`／行內 style）

- [ ] **Step 3: e2e 轉綠**

Run: `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1` → 7/7 PASS

- [ ] **Step 4: 全套確認**

Run: `npx vitest run > /tmp/claude-vitest.log 2>&1; tail -5 /tmp/claude-vitest.log` → 全綠

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/caravan/data/ src/pages/games/caravan.astro tests/e2e/caravan.spec.ts
git commit -m "feat(caravan): 職業/敵人資料＋戰鬥 UI＋訓練場——seed 參數確定化 e2e（M2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## M2 完成判準

- [ ] `npx vitest run` 全套綠；caravan 引擎測試 ≥43
- [ ] `npx playwright test tests/e2e/caravan.spec.ts --project=chromium` 7/7
- [ ] 實跑：訓練場打一場到勝負＋撤退一次
- [ ] diff 只含 M2 改動

## M3 預告

遠征事件鏈將消費：`CombatState` 整合（遭遇事件→startCombat→結算 resolveCasualties 寫回存檔）、`EventCard` schema（規格 §3.2）、迷宮房卡。存檔 v3：遠征中途狀態。
