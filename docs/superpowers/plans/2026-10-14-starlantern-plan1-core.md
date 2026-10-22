# 《星燈迷宮》計畫一：核心可玩版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 刪除舊的 lantern-hollow 原型，做出用色塊頂替美術、可以從城鎮一路玩到第 3 層頭目並通關的《星燈迷宮》DRPG。

**Architecture:** `engine/` 是不碰 DOM 的純邏輯（亂數由外部注入，全部 TDD）；`data/` 是純資料表；`Game` 類別把城鎮、地圖、戰鬥串成狀態機。畫面用一個 PixiJS 畫布畫地圖與戰鬥敵人，城鎮選單、戰鬥指令、HUD 用 DOM。美術（計畫二）之後才換上，本計畫全部用色塊頂替。

**Tech Stack:** Astro 頁面、TypeScript、PixiJS ^8.18.1、Vitest（happy-dom）、Playwright（chromium）、SCSS。

**Spec:** `docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md`

**範圍：** 規格書第 9 節交付順序的步驟 1–3 與 e2e。美術（步驟 4–5 的美術部分）另寫計畫二。

## Global Constraints

- 路由 `/games/starlantern`，頁面加 `<meta name="robots" content="noindex" />`；第一版不加入 `/games` 大廳。
- 程式放 `src/scripts/games/starlantern/`；樣式 `src/styles/_starlantern.scss`，從頁面 frontmatter import；class 前綴 `sl-`。
- SCSS 禁用 `!important`；全站禁用行內樣式（不寫 `style="..."`，也不用 JS 設 `element.style`）。數值條用 `<meter>`。
- 測試一律 `npx vitest run <path>`，不要用 `npm test`（會進 watch 模式卡住）。e2e 用 `npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。
- 測試瀏覽器 headless，加 `--mute-audio`。
- 不跑 prettier、eslint。
- 文字集中在 `data/text.zh-TW.ts`，只做繁體中文。
- 存檔 localStorage 鍵 `starlantern-save`，壞檔備份鍵 `starlantern-save-backup`，版本號 `1`。
- `engine/` 不得 import DOM、Pixi 或 `Math.random`；亂數一律用注入的 `Rng`。
- 測試檔放在原始碼旁（`foo.ts` 配 `foo.test.ts`），import 用相對路徑、不帶 `.ts`。
- 不碰智能合約、`.env`、`npm run deploy:polygon`。
- **Commit：** repo 規則是「使用者要求才 commit」。每個任務最後的 commit 步驟，只有在使用者明確授權依本計畫逐任務 commit 時才執行；否則略過並在回報中註明。
- 色塊只是開發用的暫代畫面，計畫二會換成 codex 生成並經核准的美術，不得把色塊當正式美術發布。

## Review Focus

1. 存檔壞掉、版本不符、或瀏覽器禁止 localStorage（隱私模式）：遊戲不能崩潰，要提示並開新檔，壞檔留在備份鍵。→ Task 9 測試。
2. 出戰成員全部倒下時按「出發」：要拒絕並說明原因，不能進迷宮後立刻全滅。→ Task 10 測試。
3. 戰鬥中 TP 不足、指定的目標已經死亡、多段攻擊打到一半目標就倒下：不能報錯或空打，要正確改選目標或停止。→ Task 7 測試。
4. 戰鬥中或城鎮裡按方向鍵：地圖不能移動。→ Task 10 測試。
5. 錢不夠時買東西、住宿、復活：回傳失敗原因，狀態完全不變。→ Task 8 測試。

---

## 檔案結構

```
src/pages/games/starlantern.astro            頁面骨架（noindex）
src/styles/_starlantern.scss                 樣式
src/scripts/games/starlantern/
  client.ts                                  掛載：組裝 Game、Pixi、DOM、輸入
  engine/
    types.ts                                 共用型別
    rng.ts            (+ .test)              mulberry32、randInt、pick
    map.ts            (+ .test)              解析樓層、移動、迷霧、可達性
    encounter.ts      (+ .test)              遇敵值、指示燈
    party.ts          (+ .test)              能力值、編隊、經驗、升級、被動技能
    combatant.ts      (+ .test)              戰鬥單位、能力值增減、傷害公式
    skills.ts         (+ .test)              效果執行 applyEffect
    battle.ts         (+ .test)              建立戰鬥、回合解算、獎勵、寫回隊伍
    state.ts                                 GameState、newGame
    town.ts           (+ .test)              商店、解鎖、裝備、旅館
    save.ts           (+ .test)              存讀檔與驗證
    game.ts           (+ .test)              狀態機
    testing.ts                               測試專用建構器（runtime 不 import）
  data/
    characters.ts skills.ts enemies.ts items.ts equipment.ts materials.ts floors.ts text.zh-TW.ts
    data.test.ts                             資料完整性
  input/keymap.ts     (+ .test)
  audio/SoundManager.ts                      併入 ../audio-sfx-volume.test.ts
  render/app.ts MapView.ts BattleView.ts     Pixi
  ui/dom.ts town.ts hud.ts battleMenu.ts clear.ts   DOM
tests/e2e/starlantern.spec.ts
art-factory/starlantern/reference/           從舊原型保留的造型參考（非 runtime）
```

---

### Task 0: 備份並刪除舊原型、開新分支

**Files:**
- Delete: `src/pages/games/lantern-hollow.astro`, `src/scripts/games/lantern-hollow/`, `src/styles/_lantern-hollow.scss`, `tests/e2e/lantern-hollow.spec.ts`, `docs/lantern-hollow-poc.md`, `docs/superpowers/plans/2026-10-12-lantern-hollow.md`, `docs/superpowers/plans/2026-10-12-lantern-hollow-v2.md`, `docs/superpowers/specs/2026-10-12-lantern-hollow-design.md`, `docs/superpowers/specs/2026-10-12-lantern-hollow-v2-design.md`, `art-factory/lantern-hollow/`, `public/assets/games/lantern-hollow/`
- Move: `art-factory/lantern-hollow/runs/pixellab/{lineup1,lineup2,knight,keypose1}` → `art-factory/starlantern/reference/`
- Create: `art-factory/starlantern/README.md`

背景：這些檔案在 git 裡只有 intent-to-add（` A`）或 untracked（`??`），HEAD 沒有它們，所以 `git restore` 救不回來，刪之前一定要先打包備份。index 裡另外有一筆 `node_modules` symlink 的 intent-to-add 紀錄，和本任務無關，不要動。

- [ ] **Step 1: 開新分支**

```powershell
git switch -c feat/starlantern
```
Expected: `Switched to a new branch 'feat/starlantern'`。未追蹤檔案會留在工作樹。

- [ ] **Step 2: 停掉佔用舊資料夾的預覽伺服器（port 4346）**

```powershell
$c = Get-NetTCPConnection -LocalPort 4346 -State Listen -ErrorAction SilentlyContinue
if ($c) { Get-Process -Id $c.OwningProcess | Select-Object Id, ProcessName, Path }
```
確認是 `python`（`http.server`）後再 `Stop-Process -Id <Id> -Confirm:$false`。若是別的程式就停手回報。

- [ ] **Step 3: 打包備份到 repo 外**

```powershell
New-Item -ItemType Directory -Force C:\Users\bag57\art-refs\backups | Out-Null
tar.exe -a -cf C:\Users\bag57\art-refs\backups\lantern-hollow-2026-10-14.zip src/pages/games/lantern-hollow.astro src/scripts/games/lantern-hollow src/styles/_lantern-hollow.scss tests/e2e/lantern-hollow.spec.ts docs/lantern-hollow-poc.md docs/superpowers/plans/2026-10-12-lantern-hollow.md docs/superpowers/plans/2026-10-12-lantern-hollow-v2.md docs/superpowers/specs/2026-10-12-lantern-hollow-design.md docs/superpowers/specs/2026-10-12-lantern-hollow-v2-design.md art-factory/lantern-hollow
(tar.exe -tf C:\Users\bag57\art-refs\backups\lantern-hollow-2026-10-14.zip | Measure-Object -Line).Lines
(Get-ChildItem -Recurse -File src/scripts/games/lantern-hollow, art-factory/lantern-hollow | Measure-Object).Count
```
Expected: zip 內的檔案行數 ≥ 第二個數字 + 7（另外 7 個單檔加資料夾項目）。不符就停手回報，不要往下刪。

- [ ] **Step 4: 搬出要保留的造型參考**

```powershell
New-Item -ItemType Directory -Force art-factory/starlantern/reference | Out-Null
foreach ($d in 'lineup1','lineup2','knight','keypose1') { Move-Item art-factory/lantern-hollow/runs/pixellab/$d art-factory/starlantern/reference/$d }
Get-ChildItem art-factory/starlantern/reference
```
Expected: 列出 4 個資料夾。

- [ ] **Step 5: 寫 `art-factory/starlantern/README.md`**

```markdown
# Starlantern art factory

- `reference/`：從舊 lantern-hollow 原型保留的造型參考（8 人並排圖 lineup1、lineup2，火焰騎士 knight、keypose1）。只供 codex 生成時當參考，不是 runtime 素材，也不得直接發布。
- 正式素材流程見 `docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md` 第 5 節，由計畫二建立。
- 舊原型完整備份：`C:\Users\bag57\art-refs\backups\lantern-hollow-2026-10-14.zip`。
```

- [ ] **Step 6: 從 index 移除並刪檔**

```powershell
git rm -r -q --cached --ignore-unmatch src/pages/games/lantern-hollow.astro src/scripts/games/lantern-hollow src/styles/_lantern-hollow.scss tests/e2e/lantern-hollow.spec.ts docs/lantern-hollow-poc.md docs/superpowers/plans/2026-10-12-lantern-hollow.md docs/superpowers/specs/2026-10-12-lantern-hollow-design.md art-factory/lantern-hollow public/assets/games/lantern-hollow
Remove-Item -Recurse -Force -Confirm:$false src/pages/games/lantern-hollow.astro, src/scripts/games/lantern-hollow, src/styles/_lantern-hollow.scss, tests/e2e/lantern-hollow.spec.ts, docs/lantern-hollow-poc.md, docs/superpowers/plans/2026-10-12-lantern-hollow.md, docs/superpowers/plans/2026-10-12-lantern-hollow-v2.md, docs/superpowers/specs/2026-10-12-lantern-hollow-design.md, docs/superpowers/specs/2026-10-12-lantern-hollow-v2-design.md, art-factory/lantern-hollow, public/assets/games/lantern-hollow
```

- [ ] **Step 7: 驗證**

```powershell
git status --short | Select-String 'lantern-hollow'
Select-String -Path src/**/*.ts, src/**/*.astro, src/**/*.scss, tests/**/*.ts -Pattern 'lantern-hollow' -List
npx vitest run
```
Expected: 前兩個指令沒有輸出；vitest 全部 PASS（舊原型的測試已不存在）。

- [ ] **Step 8: Commit（需使用者授權）**

```powershell
git add art-factory/starlantern docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md docs/superpowers/plans/2026-10-14-starlantern-plan1-core.md
git commit -m "chore(starlantern): remove lantern-hollow prototype, keep art references"
```

---

### Task 1: 共用型別、亂數與資料表

**Files:**
- Create: `src/scripts/games/starlantern/engine/types.ts`, `engine/rng.ts`, `engine/rng.test.ts`
- Create: `data/characters.ts`, `data/skills.ts`, `data/enemies.ts`, `data/items.ts`, `data/equipment.ts`, `data/materials.ts`, `data/floors.ts`, `data/data.test.ts`

（以下路徑都相對於 `src/scripts/games/starlantern/`。）

**Interfaces:**
- Produces: 全部型別（見 `types.ts`）；`Rng`、`mulberry32(seed)`、`randInt(rng,min,max)`、`pick(rng,xs)`；`CHARACTER_IDS`、`CHARACTERS`、`SKILLS`、`ENEMIES`、`ITEMS`、`EQUIPMENT`、`MATERIALS`、`FLOORS`。

- [ ] **Step 1: 寫 `engine/types.ts`**

```ts
export type Element = 'phys' | 'fire' | 'ice' | 'thunder';
export type StatKey = 'hp' | 'tp' | 'atk' | 'def' | 'mag' | 'res' | 'spd';
export type BuffStat = Exclude<StatKey, 'hp' | 'tp'>;
export type Stats = Record<StatKey, number>;
export type Row = 'front' | 'back';
export type CharacterId = 'noel' | 'chizuru' | 'liz' | 'sylvie' | 'scarlet' | 'selene' | 'safira' | 'bobby';
/** Who an action hits, seen from the actor's side. */
export type Target = 'enemy' | 'enemies' | 'ally' | 'allies' | 'self' | 'deadAlly';
export type Passive = 'encounterDown' | 'dropBoost' | 'itemBoost';
export interface Pos { x: number; y: number }

export type Effect =
  | { kind: 'damage'; power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean; hits?: number }
  | { kind: 'heal'; power: number }
  | { kind: 'restore'; hp?: number; tp?: number }
  | { kind: 'revive'; hpPct: number }
  | { kind: 'cure' }
  | { kind: 'inflict'; status: 'poison' | 'sleep'; chance: number }
  | { kind: 'buff'; stat: BuffStat; pct: number; turns: number }
  | { kind: 'taunt'; turns: number }
  | { kind: 'turret'; power: number; turns: number };

export interface SkillDef {
  id: string; name: string; owner: CharacterId; learnLevel: number; tp: number; hpCost?: number;
  target: Target; effects: Effect[]; passive?: Passive; desc: string;
}
export interface CharacterDef {
  id: CharacterId; title: string; name: string; row: Row; melee: boolean; base: Stats; growth: Stats; skills: string[];
}
export interface EnemySkill { name: string; chance: number; target: Target; effects: Effect[] }
export interface EnemyDef {
  id: string; name: string; floor: 1 | 2 | 3; boss?: boolean; stats: Stats; weak: Element[]; resist: Element[];
  exp: number; gold: number; drops: { mat: string; chance: number }[]; skills: EnemySkill[];
}
export interface ItemDef {
  id: string; name: string; price: number; target: Target | null; effects: Effect[]; battle: boolean; returnToTown?: boolean; desc: string;
}
export type Slot = 'weapon' | 'armor' | 'accessory';
export interface EquipDef { id: string; name: string; slot: Slot; price: number; bonus: Partial<Stats>; unlock?: { mat: string; qty: number }[] }
export interface MaterialDef { id: string; name: string; price: number }
export interface FloorDef {
  id: 1 | 2 | 3; name: string; rows: string[]; encounters: string[][]; rate: [number, number]; chestLoot: { item: string; qty: number }[];
}
export interface Member { id: CharacterId; level: number; exp: number; hp: number; tp: number; equip: Partial<Record<Slot, string>> }
export interface Party {
  roster: Record<CharacterId, Member>; recruited: CharacterId[]; front: (CharacterId | null)[]; back: (CharacterId | null)[];
}
```

- [ ] **Step 2: 寫亂數的失敗測試 `engine/rng.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, pick } from './rng';

describe('rng', () => {
  it('mulberry32 is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs).not.toEqual(Array.from({ length: 50 }, () => c()));
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('randInt covers both ends inclusively', () => {
    expect(randInt(() => 0, 3, 7)).toBe(3);
    expect(randInt(() => 0.9999, 3, 7)).toBe(7);
  });
  it('pick indexes by rng', () => {
    expect(pick(() => 0, ['a', 'b', 'c'])).toBe('a');
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/rng.test.ts`
Expected: FAIL，`Failed to resolve import "./rng"`。

- [ ] **Step 4: 寫 `engine/rng.ts`**

```ts
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/rng.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 6: 寫資料完整性的失敗測試 `data/data.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';
import { EQUIPMENT } from './equipment';
import { MATERIALS } from './materials';
import { FLOORS } from './floors';

describe('data integrity', () => {
  it('matches the spec content counts', () => {
    expect(CHARACTER_IDS).toHaveLength(8);
    const enemies = Object.values(ENEMIES);
    expect(enemies.filter((e) => !e.boss)).toHaveLength(8);
    expect(enemies.filter((e) => e.boss).map((e) => e.id)).toEqual(['lanterneater']);
    expect(Object.keys(EQUIPMENT)).toHaveLength(15);
    expect(Object.keys(MATERIALS)).toHaveLength(10);
    expect(FLOORS.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('gives every character 3–4 owned skills with one usable at level 1', () => {
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id];
      expect(c.id).toBe(id);
      expect(c.skills.length).toBeGreaterThanOrEqual(3);
      expect(c.skills.length).toBeLessThanOrEqual(4);
      for (const s of c.skills) {
        expect(SKILLS[s], `${id}:${s}`).toBeDefined();
        expect(SKILLS[s].owner).toBe(id);
      }
      expect(c.skills.some((s) => SKILLS[s].learnLevel === 1 && !SKILLS[s].passive)).toBe(true);
    }
  });

  it('keeps skill ids keyed by their own id and passives effect-free', () => {
    for (const [k, s] of Object.entries(SKILLS)) {
      expect(s.id).toBe(k);
      if (s.passive) { expect(s.effects).toEqual([]); expect(s.tp).toBe(0); }
      else expect(s.effects.length).toBeGreaterThan(0);
    }
  });

  it('only Selene heals or revives', () => {
    const healers = Object.values(SKILLS).filter((s) => s.effects.some((e) => e.kind === 'heal' || e.kind === 'revive'));
    expect(new Set(healers.map((s) => s.owner))).toEqual(new Set(['selene']));
  });

  it('never reuses an id across items, materials and equipment', () => {
    const ids = [...Object.keys(ITEMS), ...Object.keys(MATERIALS), ...Object.keys(EQUIPMENT)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every cross reference', () => {
    for (const e of Object.values(ENEMIES)) for (const d of e.drops) expect(MATERIALS[d.mat], `${e.id} drop ${d.mat}`).toBeDefined();
    for (const q of Object.values(EQUIPMENT)) for (const u of q.unlock ?? []) expect(MATERIALS[u.mat], `${q.id} unlock ${u.mat}`).toBeDefined();
    for (const f of FLOORS) {
      for (const group of f.encounters) for (const id of group) {
        expect(ENEMIES[id], `floor ${f.id} enemy ${id}`).toBeDefined();
        expect(ENEMIES[id].boss).toBeFalsy();
        expect(ENEMIES[id].floor).toBe(f.id);
      }
      for (const l of f.chestLoot) expect(ITEMS[l.item] ?? MATERIALS[l.item] ?? EQUIPMENT[l.item], `floor ${f.id} chest ${l.item}`).toBeDefined();
    }
  });

  it('places every normal enemy in some encounter group', () => {
    const used = new Set(FLOORS.flatMap((f) => f.encounters.flat()));
    for (const e of Object.values(ENEMIES)) if (!e.boss) expect(used.has(e.id), e.id).toBe(true);
  });
});
```

- [ ] **Step 7: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/data/data.test.ts`
Expected: FAIL，`Failed to resolve import "./characters"`。

- [ ] **Step 8: 寫 `data/characters.ts`**

```ts
import type { CharacterDef, CharacterId } from '../engine/types';

export const CHARACTER_IDS: CharacterId[] = ['noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby'];

const s = (hp: number, tp: number, atk: number, def: number, mag: number, res: number, spd: number) => ({ hp, tp, atk, def, mag, res, spd });

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  noel: { id: 'noel', title: '見習魔女', name: '諾艾兒', row: 'back', melee: false,
    base: s(28, 30, 6, 5, 14, 10, 9), growth: s(4, 4, 1, 1, 3, 2, 1), skills: ['fire-star', 'ice-star', 'hex', 'thunder-star'] },
  chizuru: { id: 'chizuru', title: '巫女槍兵', name: '千鶴', row: 'front', melee: true,
    base: s(42, 16, 12, 11, 5, 7, 8), growth: s(6, 2, 2, 2, 1, 1, 1), skills: ['sweep', 'ward', 'pierce'] },
  liz: { id: 'liz', title: '尋寶獵人', name: '莉茲', row: 'front', melee: true,
    base: s(34, 14, 11, 8, 4, 6, 13), growth: s(5, 2, 2, 1, 1, 1, 2), skills: ['twin-slash', 'stealth', 'treasure-sense', 'triple-slash'] },
  sylvie: { id: 'sylvie', title: '森林遊俠', name: '希爾薇', row: 'back', melee: false,
    base: s(30, 16, 12, 6, 5, 7, 12), growth: s(4, 2, 2, 1, 1, 1, 2), skills: ['aimed-shot', 'pin-shot', 'arrow-rain'] },
  scarlet: { id: 'scarlet', title: '火焰騎士', name: '絲嘉蕾', row: 'front', melee: true,
    base: s(48, 14, 13, 13, 6, 6, 7), growth: s(7, 2, 2, 2, 1, 1, 1), skills: ['provoke', 'flame-burst', 'iron-wall'] },
  selene: { id: 'selene', title: '月之法師', name: '瑟蕾', row: 'back', melee: false,
    base: s(26, 32, 5, 5, 13, 12, 9), growth: s(4, 4, 1, 1, 3, 2, 1), skills: ['moonlight', 'cleanse', 'dream', 'rebirth'] },
  safira: { id: 'safira', title: '沙漠舞劍士', name: '莎菲拉', row: 'front', melee: true,
    base: s(36, 16, 12, 8, 5, 7, 14), growth: s(5, 2, 2, 1, 1, 1, 2), skills: ['blade-dance', 'war-dance', 'mirage'] },
  bobby: { id: 'bobby', title: '技師', name: '波比', row: 'back', melee: false,
    base: s(32, 22, 9, 8, 10, 8, 8), growth: s(5, 3, 1, 1, 2, 1, 1), skills: ['turret', 'tinker', 'barrier'] },
};
```

- [ ] **Step 9: 寫 `data/skills.ts`**

```ts
import type { SkillDef } from '../engine/types';

const LIST: SkillDef[] = [
  { id: 'fire-star', name: '火之星彈', owner: 'noel', learnLevel: 1, tp: 4, target: 'enemy', desc: '火屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'fire', scale: 'mag', melee: false }] },
  { id: 'ice-star', name: '冰之星彈', owner: 'noel', learnLevel: 2, tp: 4, target: 'enemy', desc: '冰屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'ice', scale: 'mag', melee: false }] },
  { id: 'hex', name: '衰弱咒', owner: 'noel', learnLevel: 4, tp: 5, target: 'enemy', desc: '降低攻擊並可能中毒',
    effects: [{ kind: 'buff', stat: 'atk', pct: -25, turns: 3 }, { kind: 'inflict', status: 'poison', chance: 0.5 }] },
  { id: 'thunder-star', name: '雷之星彈', owner: 'noel', learnLevel: 6, tp: 4, target: 'enemy', desc: '雷屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'thunder', scale: 'mag', melee: false }] },

  { id: 'sweep', name: '橫掃', owner: 'chizuru', learnLevel: 1, tp: 5, target: 'enemies', desc: '攻擊全體敵人',
    effects: [{ kind: 'damage', power: 80, element: 'phys', scale: 'atk', melee: true }] },
  { id: 'ward', name: '結界', owner: 'chizuru', learnLevel: 3, tp: 6, target: 'allies', desc: '我方全體防禦提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 3 }] },
  { id: 'pierce', name: '貫槍', owner: 'chizuru', learnLevel: 5, tp: 5, target: 'enemy', desc: '單體強力突刺',
    effects: [{ kind: 'damage', power: 170, element: 'phys', scale: 'atk', melee: true }] },

  { id: 'twin-slash', name: '雙刃', owner: 'liz', learnLevel: 1, tp: 4, target: 'enemy', desc: '連砍 2 次',
    effects: [{ kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true, hits: 2 }] },
  { id: 'stealth', name: '潛行', owner: 'liz', learnLevel: 2, tp: 0, target: 'self', desc: '被動：遇敵率減半', effects: [], passive: 'encounterDown' },
  { id: 'treasure-sense', name: '尋寶直覺', owner: 'liz', learnLevel: 4, tp: 0, target: 'self', desc: '被動：素材掉落率加倍', effects: [], passive: 'dropBoost' },
  { id: 'triple-slash', name: '三連刃', owner: 'liz', learnLevel: 6, tp: 7, target: 'enemy', desc: '連砍 3 次',
    effects: [{ kind: 'damage', power: 55, element: 'phys', scale: 'atk', melee: true, hits: 3 }] },

  { id: 'aimed-shot', name: '瞄準射擊', owner: 'sylvie', learnLevel: 1, tp: 5, target: 'enemy', desc: '單體高傷害射擊',
    effects: [{ kind: 'damage', power: 170, element: 'phys', scale: 'atk', melee: false }] },
  { id: 'pin-shot', name: '釘足箭', owner: 'sylvie', learnLevel: 3, tp: 4, target: 'enemy', desc: '射擊並降低速度',
    effects: [{ kind: 'damage', power: 90, element: 'phys', scale: 'atk', melee: false }, { kind: 'buff', stat: 'spd', pct: -30, turns: 3 }] },
  { id: 'arrow-rain', name: '箭雨', owner: 'sylvie', learnLevel: 6, tp: 7, target: 'enemies', desc: '射擊全體敵人',
    effects: [{ kind: 'damage', power: 75, element: 'phys', scale: 'atk', melee: false }] },

  { id: 'provoke', name: '挑釁', owner: 'scarlet', learnLevel: 1, tp: 3, target: 'self', desc: '3 回合內吸引敵人單體攻擊',
    effects: [{ kind: 'taunt', turns: 3 }] },
  { id: 'flame-burst', name: '爆炎斬', owner: 'scarlet', learnLevel: 3, tp: 3, hpCost: 0.15, target: 'enemy', desc: '消耗 15% HP 的火屬性重擊',
    effects: [{ kind: 'damage', power: 220, element: 'fire', scale: 'atk', melee: true }] },
  { id: 'iron-wall', name: '鐵壁', owner: 'scarlet', learnLevel: 5, tp: 4, target: 'self', desc: '自身防禦大幅提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 40, turns: 3 }] },

  { id: 'moonlight', name: '月光', owner: 'selene', learnLevel: 1, tp: 5, target: 'ally', desc: '回復一名隊友 HP',
    effects: [{ kind: 'heal', power: 120 }] },
  { id: 'cleanse', name: '淨化', owner: 'selene', learnLevel: 2, tp: 3, target: 'ally', desc: '解除毒與睡眠', effects: [{ kind: 'cure' }] },
  { id: 'dream', name: '夢境', owner: 'selene', learnLevel: 4, tp: 6, target: 'enemies', desc: '可能使全體敵人睡眠',
    effects: [{ kind: 'inflict', status: 'sleep', chance: 0.6 }] },
  { id: 'rebirth', name: '月之再生', owner: 'selene', learnLevel: 6, tp: 10, target: 'deadAlly', desc: '復活倒下的隊友',
    effects: [{ kind: 'revive', hpPct: 0.3 }] },

  { id: 'blade-dance', name: '刃舞', owner: 'safira', learnLevel: 1, tp: 5, target: 'enemy', desc: '連砍 3 次',
    effects: [{ kind: 'damage', power: 50, element: 'phys', scale: 'atk', melee: true, hits: 3 }] },
  { id: 'war-dance', name: '戰舞', owner: 'safira', learnLevel: 3, tp: 7, target: 'allies', desc: '我方全體攻擊提升',
    effects: [{ kind: 'buff', stat: 'atk', pct: 25, turns: 3 }] },
  { id: 'mirage', name: '幻步', owner: 'safira', learnLevel: 5, tp: 5, target: 'allies', desc: '我方全體速度提升',
    effects: [{ kind: 'buff', stat: 'spd', pct: 30, turns: 3 }] },

  { id: 'turret', name: '設置砲台', owner: 'bobby', learnLevel: 1, tp: 8, target: 'self', desc: '3 回合內每回合結束時砲擊一名敵人',
    effects: [{ kind: 'turret', power: 70, turns: 3 }] },
  { id: 'tinker', name: '改造', owner: 'bobby', learnLevel: 2, tp: 0, target: 'self', desc: '被動：戰鬥中道具效果加倍', effects: [], passive: 'itemBoost' },
  { id: 'barrier', name: '護盾裝置', owner: 'bobby', learnLevel: 4, tp: 6, target: 'allies', desc: '我方全體防禦提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 25, turns: 3 }] },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(LIST.map((s) => [s.id, s]));
```

- [ ] **Step 10: 寫 `data/materials.ts`**

```ts
import type { MaterialDef } from '../engine/types';

const LIST: MaterialDef[] = [
  { id: 'moss', name: '發光苔', price: 6 },
  { id: 'bat-wing', name: '蝙蝠翼膜', price: 7 },
  { id: 'thorn-fang', name: '荊棘牙', price: 10 },
  { id: 'crystal-shell', name: '晶殼碎片', price: 16 },
  { id: 'ice-crystal', name: '冰晶核', price: 18 },
  { id: 'lizard-scale', name: '蜥蜴鱗', price: 18 },
  { id: 'star-stone', name: '星紋石', price: 30 },
  { id: 'dusk-cloth', name: '暮影布', price: 32 },
  { id: 'old-coin', name: '古代銀幣', price: 40 },
  { id: 'ancient-gear', name: '古代齒輪', price: 60 },
];

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(LIST.map((m) => [m.id, m]));
```

- [ ] **Step 11: 寫 `data/items.ts`**

```ts
import type { ItemDef } from '../engine/types';

const LIST: ItemDef[] = [
  { id: 'potion', name: '回復藥', price: 20, target: 'ally', battle: true, desc: '回復 60 HP', effects: [{ kind: 'restore', hp: 60 }] },
  { id: 'ether', name: 'TP 藥', price: 50, target: 'ally', battle: true, desc: '回復 20 TP', effects: [{ kind: 'restore', tp: 20 }] },
  { id: 'antidote', name: '解毒藥', price: 15, target: 'ally', battle: true, desc: '解除毒與睡眠', effects: [{ kind: 'cure' }] },
  { id: 'phoenix', name: '復活羽毛', price: 120, target: 'deadAlly', battle: true, desc: '以一半 HP 復活', effects: [{ kind: 'revive', hpPct: 0.5 }] },
  { id: 'return-lamp', name: '歸還之燈', price: 60, target: null, battle: false, returnToTown: true, desc: '在迷宮中使用，立刻回城', effects: [] },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((i) => [i.id, i]));
```

- [ ] **Step 12: 寫 `data/equipment.ts`**

```ts
import type { EquipDef } from '../engine/types';

const LIST: EquipDef[] = [
  { id: 'wooden-staff', name: '木杖', slot: 'weapon', price: 30, bonus: { mag: 3 } },
  { id: 'iron-sword', name: '鐵劍', slot: 'weapon', price: 40, bonus: { atk: 4 } },
  { id: 'hunter-bow', name: '獵弓', slot: 'weapon', price: 40, bonus: { atk: 4 } },
  { id: 'thorn-spear', name: '荊棘槍', slot: 'weapon', price: 90, bonus: { atk: 7 }, unlock: [{ mat: 'thorn-fang', qty: 4 }] },
  { id: 'crystal-blade', name: '晶刃', slot: 'weapon', price: 160, bonus: { atk: 9 }, unlock: [{ mat: 'crystal-shell', qty: 3 }] },
  { id: 'frost-staff', name: '霜杖', slot: 'weapon', price: 160, bonus: { mag: 9 }, unlock: [{ mat: 'ice-crystal', qty: 3 }] },
  { id: 'star-saber', name: '星紋軍刀', slot: 'weapon', price: 320, bonus: { atk: 15 }, unlock: [{ mat: 'star-stone', qty: 3 }] },
  { id: 'cloth-robe', name: '布袍', slot: 'armor', price: 30, bonus: { def: 2, res: 3 } },
  { id: 'leather-vest', name: '皮背心', slot: 'armor', price: 40, bonus: { def: 4 } },
  { id: 'scale-mail', name: '鱗甲', slot: 'armor', price: 180, bonus: { def: 9 }, unlock: [{ mat: 'lizard-scale', qty: 3 }] },
  { id: 'dusk-mantle', name: '暮影斗篷', slot: 'armor', price: 300, bonus: { def: 6, res: 10 }, unlock: [{ mat: 'dusk-cloth', qty: 3 }] },
  { id: 'moss-charm', name: '苔光護符', slot: 'accessory', price: 50, bonus: { hp: 15 }, unlock: [{ mat: 'moss', qty: 3 }] },
  { id: 'bat-earring', name: '蝠翼耳飾', slot: 'accessory', price: 60, bonus: { spd: 3 }, unlock: [{ mat: 'bat-wing', qty: 3 }] },
  { id: 'crystal-pendant', name: '晶核墜飾', slot: 'accessory', price: 140, bonus: { res: 6 }, unlock: [{ mat: 'ice-crystal', qty: 2 }] },
  { id: 'gear-ring', name: '齒輪戒指', slot: 'accessory', price: 200, bonus: { tp: 10 }, unlock: [{ mat: 'ancient-gear', qty: 1 }] },
];

export const EQUIPMENT: Record<string, EquipDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
```

- [ ] **Step 13: 寫 `data/enemies.ts`**

```ts
import type { EnemyDef } from '../engine/types';

const s = (hp: number, atk: number, def: number, mag: number, res: number, spd: number) => ({ hp, tp: 0, atk, def, mag, res, spd });

const LIST: EnemyDef[] = [
  { id: 'slime', name: '苔蘚史萊姆', floor: 1, stats: s(30, 9, 5, 5, 5, 5), weak: ['fire'], resist: [], exp: 6, gold: 4,
    drops: [{ mat: 'moss', chance: 0.6 }],
    skills: [{ name: '酸液', chance: 0.3, target: 'enemy', effects: [{ kind: 'inflict', status: 'poison', chance: 0.4 }] }] },
  { id: 'bat', name: '遺跡蝙蝠', floor: 1, stats: s(22, 10, 4, 3, 4, 14), weak: ['thunder'], resist: [], exp: 6, gold: 5,
    drops: [{ mat: 'bat-wing', chance: 0.5 }], skills: [] },
  { id: 'wolf', name: '荊棘狼', floor: 1, stats: s(40, 13, 7, 3, 5, 11), weak: ['fire'], resist: ['ice'], exp: 10, gold: 8,
    drops: [{ mat: 'thorn-fang', chance: 0.5 }],
    skills: [{ name: '咆哮', chance: 0.2, target: 'self', effects: [{ kind: 'buff', stat: 'atk', pct: 25, turns: 3 }] }] },
  { id: 'beetle', name: '晶殼甲蟲', floor: 2, stats: s(70, 16, 18, 4, 6, 6), weak: ['thunder'], resist: ['phys'], exp: 18, gold: 14,
    drops: [{ mat: 'crystal-shell', chance: 0.5 }], skills: [] },
  { id: 'wisp', name: '冰晶精靈', floor: 2, stats: s(50, 8, 6, 18, 16, 13), weak: ['fire'], resist: ['ice'], exp: 20, gold: 15,
    drops: [{ mat: 'ice-crystal', chance: 0.5 }],
    skills: [{ name: '冰霧', chance: 0.5, target: 'enemies', effects: [{ kind: 'damage', power: 70, element: 'ice', scale: 'mag', melee: false }] }] },
  { id: 'lizard', name: '洞窟蜥蜴', floor: 2, stats: s(85, 20, 12, 4, 8, 10), weak: ['ice'], resist: [], exp: 22, gold: 16,
    drops: [{ mat: 'lizard-scale', chance: 0.5 }],
    skills: [{ name: '甩尾', chance: 0.3, target: 'enemies', effects: [{ kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true }] }] },
  { id: 'golem', name: '神殿石像', floor: 3, stats: s(140, 26, 24, 4, 10, 5), weak: ['thunder'], resist: ['phys'], exp: 40, gold: 30,
    drops: [{ mat: 'star-stone', chance: 0.5 }], skills: [] },
  { id: 'shade', name: '暮影法師', floor: 3, stats: s(90, 12, 10, 28, 20, 15), weak: ['phys'], resist: ['fire'], exp: 42, gold: 32,
    drops: [{ mat: 'dusk-cloth', chance: 0.5 }],
    skills: [
      { name: '暮色搖籃曲', chance: 0.25, target: 'enemies', effects: [{ kind: 'inflict', status: 'sleep', chance: 0.4 }] },
      { name: '影炎', chance: 0.4, target: 'enemy', effects: [{ kind: 'damage', power: 130, element: 'fire', scale: 'mag', melee: false }] },
    ] },
  { id: 'lanterneater', name: '燈喰之獸', floor: 3, boss: true, stats: s(900, 34, 20, 30, 20, 12), weak: ['ice'], resist: ['fire'], exp: 300, gold: 0,
    drops: [],
    skills: [
      { name: '吞光', chance: 0.35, target: 'enemies', effects: [{ kind: 'damage', power: 110, element: 'fire', scale: 'mag', melee: false }] },
      { name: '碾壓', chance: 0.3, target: 'enemy', effects: [{ kind: 'damage', power: 160, element: 'phys', scale: 'atk', melee: true }] },
    ] },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
```

- [ ] **Step 14: 寫 `data/floors.ts`**

圖例：`#` 牆、`.` 地板、`D` 門、`E` 入口兼回城點、`<` 上樓、`>` 下樓、`T` 寶箱、`B` 頭目房。寶箱內容依 `T` 由上到下、由左到右的出現順序對應 `chestLoot`。

```ts
import type { FloorDef } from '../engine/types';

export const FLOORS: FloorDef[] = [
  { id: 1, name: '林間遺跡', rate: [6, 12], chestLoot: [{ item: 'old-coin', qty: 2 }],
    encounters: [['slime', 'slime'], ['bat', 'bat', 'slime'], ['wolf'], ['wolf', 'bat']],
    rows: [
      '###############',
      '#E....#.......#',
      '#.###.#.#####.#',
      '#.#T#...#...#.#',
      '#.#.#####.#.#.#',
      '#.....D...#...#',
      '#####.#####.###',
      '#.....#...#...#',
      '#.###.#.#.#.#.#',
      '#...#...#...#>#',
      '###############',
    ] },
  { id: 2, name: '水晶洞窟', rate: [7, 13], chestLoot: [{ item: 'ether', qty: 2 }],
    encounters: [['beetle'], ['wisp', 'wisp'], ['lizard', 'beetle'], ['wisp', 'lizard']],
    rows: [
      '###############',
      '#E<...#.....T.#',
      '#.###.#.###.###',
      '#...#...#.....#',
      '###.#####.###.#',
      '#...#.....#...#',
      '#.###.###.#.###',
      '#.....#...#...#',
      '#.#####.#####.#',
      '#.......D....>#',
      '###############',
    ] },
  { id: 3, name: '星燈神殿', rate: [8, 14], chestLoot: [{ item: 'ancient-gear', qty: 1 }],
    encounters: [['golem'], ['shade', 'shade'], ['golem', 'shade']],
    rows: [
      '###############',
      '#E<.....#.....#',
      '#.#####.#.###.#',
      '#.#...#...#T#.#',
      '#.#.#.#####.#.#',
      '#...#.......#.#',
      '#####.#####.#.#',
      '#.....#...#...#',
      '#.#####.#.#####',
      '#.#.....#.....#',
      '#.#.###D#####.#',
      '#...#.....B...#',
      '###############',
    ] },
];
```

- [ ] **Step 15: 跑資料測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/data/data.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 16: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern
git commit -m "feat(starlantern): add core types, rng and data tables"
```

---

### Task 2: 地圖（解析、移動、迷霧、可達性）

**Files:**
- Create: `engine/map.ts`, `engine/map.test.ts`

**Interfaces:**
- Consumes: `Pos`（types）、`FLOORS`（data/floors）。
- Produces:
  - `type Tile = 'wall'|'floor'|'door'|'up'|'down'|'chest'|'entrance'|'boss'`
  - `type Dir = 'up'|'down'|'left'|'right'`
  - `interface FloorMap { width; height; tiles: Tile[][]; entrance: Pos; up: Pos|null; down: Pos|null; boss: Pos|null; chests: Pos[] }`
  - `parseFloor(rows: readonly string[]): FloorMap`（格式錯誤丟 `Error`）
  - `posKey(p: Pos): string` → `"x,y"`
  - `tileAt(map, p): Tile`（超出範圍視為 `'wall'`）
  - `step(map, pos, dir): { pos: Pos; moved: boolean; tile: Tile }`
  - `reveal(explored: readonly string[], map, pos, radius = 1): string[]`
  - `reachable(map, from: Pos): Set<string>`

- [ ] **Step 1: 寫失敗測試 `engine/map.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseFloor, step, reveal, reachable, posKey, tileAt } from './map';
import { FLOORS } from '../data/floors';

const SMALL = ['#####', '#E.T#', '#D#>#', '#####'];

describe('parseFloor', () => {
  it('reads tiles and landmarks', () => {
    const m = parseFloor(SMALL);
    expect([m.width, m.height]).toEqual([5, 4]);
    expect(m.entrance).toEqual({ x: 1, y: 1 });
    expect(m.down).toEqual({ x: 3, y: 2 });
    expect(m.up).toBeNull();
    expect(m.chests).toEqual([{ x: 3, y: 1 }]);
    expect(m.tiles[2][1]).toBe('door');
  });
  it('rejects ragged rows, unknown glyphs and missing or duplicate entrances', () => {
    expect(() => parseFloor(['###', '#E'])).toThrow(/width/);
    expect(() => parseFloor(['#E?#'])).toThrow(/unknown/);
    expect(() => parseFloor(['#..#'])).toThrow(/entrance/);
    expect(() => parseFloor(['#EE#'])).toThrow(/entrance/);
  });
});

describe('step', () => {
  const m = parseFloor(SMALL);
  it('moves onto open tiles, doors included', () => {
    expect(step(m, { x: 1, y: 1 }, 'right')).toEqual({ pos: { x: 2, y: 1 }, moved: true, tile: 'floor' });
    expect(step(m, { x: 1, y: 1 }, 'down')).toEqual({ pos: { x: 1, y: 2 }, moved: true, tile: 'door' });
  });
  it('is blocked by walls and the map edge', () => {
    expect(step(m, { x: 1, y: 1 }, 'up')).toEqual({ pos: { x: 1, y: 1 }, moved: false, tile: 'entrance' });
    expect(tileAt(m, { x: -1, y: 0 })).toBe('wall');
  });
});

describe('reveal', () => {
  const m = parseFloor(SMALL);
  it('adds the 3x3 block around the position without duplicates', () => {
    const a = reveal([], m, { x: 1, y: 1 });
    expect(a).toHaveLength(9);
    expect(reveal(a, m, { x: 1, y: 1 })).toHaveLength(9);
  });
  it('clips at the map edge', () => {
    expect(reveal([], m, { x: 0, y: 0 })).toHaveLength(4);
  });
});

describe('shipped floors', () => {
  const maps = FLOORS.map((f) => parseFloor(f.rows));
  it('all parse and have one chest entry per T', () => {
    maps.forEach((m, i) => expect(m.chests.length).toBe(FLOORS[i].chestLoot.length));
  });
  it('connect the entrance to every landmark', () => {
    maps.forEach((m, i) => {
      const r = reachable(m, m.entrance);
      for (const p of [m.down, m.up, m.boss, ...m.chests]) if (p) expect(r.has(posKey(p)), `floor ${i + 1} ${posKey(p)}`).toBe(true);
    });
  });
  it('have stairs and a boss where the run needs them', () => {
    expect(maps[0].down && maps[1].down).toBeTruthy();
    expect(maps[1].up && maps[2].up).toBeTruthy();
    expect(maps[0].up).toBeNull();
    expect(maps[2].down).toBeNull();
    expect(maps[2].boss).toEqual({ x: 10, y: 11 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/map.test.ts`
Expected: FAIL，`Failed to resolve import "./map"`。

- [ ] **Step 3: 寫 `engine/map.ts`**

```ts
import type { Pos } from './types';

export type Tile = 'wall' | 'floor' | 'door' | 'up' | 'down' | 'chest' | 'entrance' | 'boss';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface FloorMap {
  width: number; height: number; tiles: Tile[][];
  entrance: Pos; up: Pos | null; down: Pos | null; boss: Pos | null; chests: Pos[];
}

const GLYPHS: Record<string, Tile> = { '#': 'wall', '.': 'floor', D: 'door', '<': 'up', '>': 'down', T: 'chest', E: 'entrance', B: 'boss' };
export const DELTA: Record<Dir, Pos> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export const posKey = (p: Pos): string => `${p.x},${p.y}`;

export function parseFloor(rows: readonly string[]): FloorMap {
  const width = rows[0]?.length ?? 0;
  let entrance: Pos | null = null;
  let up: Pos | null = null, down: Pos | null = null, boss: Pos | null = null;
  const chests: Pos[] = [];
  const tiles = rows.map((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} width ${row.length} != ${width}`);
    return [...row].map((ch, x) => {
      const t = GLYPHS[ch];
      if (!t) throw new Error(`unknown glyph '${ch}' at ${x},${y}`);
      if (t === 'entrance') {
        if (entrance) throw new Error('more than one entrance');
        entrance = { x, y };
      }
      if (t === 'up') up = { x, y };
      if (t === 'down') down = { x, y };
      if (t === 'boss') boss = { x, y };
      if (t === 'chest') chests.push({ x, y });
      return t;
    });
  });
  if (!entrance) throw new Error('floor has no entrance');
  return { width, height: rows.length, tiles, entrance, up, down, boss, chests };
}

export function tileAt(map: FloorMap, p: Pos): Tile {
  return map.tiles[p.y]?.[p.x] ?? 'wall';
}

export function step(map: FloorMap, pos: Pos, dir: Dir): { pos: Pos; moved: boolean; tile: Tile } {
  const next = { x: pos.x + DELTA[dir].x, y: pos.y + DELTA[dir].y };
  const t = tileAt(map, next);
  if (t === 'wall') return { pos, moved: false, tile: tileAt(map, pos) };
  return { pos: next, moved: true, tile: t };
}

export function reveal(explored: readonly string[], map: FloorMap, pos: Pos, radius = 1): string[] {
  const set = new Set(explored);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = pos.x + dx, y = pos.y + dy;
      if (x >= 0 && y >= 0 && x < map.width && y < map.height) set.add(posKey({ x, y }));
    }
  }
  return [...set];
}

export function reachable(map: FloorMap, from: Pos): Set<string> {
  const seen = new Set([posKey(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of Object.values(DELTA)) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (tileAt(map, n) === 'wall' || seen.has(posKey(n))) continue;
      seen.add(posKey(n));
      queue.push(n);
    }
  }
  return seen;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/map.test.ts`
Expected: PASS（10 tests）。若「connect the entrance」失敗，修 `data/floors.ts` 的地圖，不要改測試。

- [ ] **Step 5: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/map.ts src/scripts/games/starlantern/engine/map.test.ts
git commit -m "feat(starlantern): grid map parsing, movement, fog reveal"
```

---

### Task 3: 遇敵值與指示燈

**Files:**
- Create: `engine/encounter.ts`, `engine/encounter.test.ts`

**Interfaces:**
- Consumes: `Rng`、`randInt`（rng）。
- Produces: `type Danger = 'green'|'yellow'|'red'`；`YELLOW_AT = 40`、`RED_AT = 75`、`ENCOUNTER_MAX = 100`；`danger(value): Danger`；`advance(value, rng, rate: [number, number], modifier = 1): { value: number; encounter: boolean }`。

規則：每步加 `round(randInt(rate) × modifier)`，上限 100。到 100 必定遇敵；到 40 以上時再擲一次亂數，小於 `(值 − 40) / 120` 就遇敵。遇敵後歸零。`advance` 依序用掉 rng：第 1 次決定增加量，第 2 次（只有值 ≥ 40 且 < 100 時）決定是否遇敵。

- [ ] **Step 1: 寫失敗測試 `engine/encounter.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { advance, danger } from './encounter';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('danger', () => {
  it('maps the value to the indicator colour', () => {
    expect(danger(0)).toBe('green');
    expect(danger(39)).toBe('green');
    expect(danger(40)).toBe('yellow');
    expect(danger(74)).toBe('yellow');
    expect(danger(75)).toBe('red');
  });
});

describe('advance', () => {
  it('adds a step amount below the yellow line without rolling', () => {
    expect(advance(0, seq(0.5), [6, 14])).toEqual({ value: 10, encounter: false });
  });
  it('always triggers at the cap and resets', () => {
    expect(advance(95, seq(0.5), [6, 14])).toEqual({ value: 0, encounter: true });
  });
  it('rolls once past the yellow line', () => {
    expect(advance(50, seq(0, 0), [6, 14])).toEqual({ value: 0, encounter: true });
    expect(advance(50, seq(0, 0.99), [6, 14])).toEqual({ value: 56, encounter: false });
  });
  it('scales the gain by the modifier (stealth)', () => {
    expect(advance(0, seq(0.5), [6, 14], 0.5)).toEqual({ value: 5, encounter: false });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/encounter.test.ts`
Expected: FAIL，`Failed to resolve import "./encounter"`。

- [ ] **Step 3: 寫 `engine/encounter.ts`**

```ts
import { randInt, type Rng } from './rng';

export type Danger = 'green' | 'yellow' | 'red';
export const YELLOW_AT = 40;
export const RED_AT = 75;
export const ENCOUNTER_MAX = 100;

export function danger(value: number): Danger {
  return value >= RED_AT ? 'red' : value >= YELLOW_AT ? 'yellow' : 'green';
}

export function advance(value: number, rng: Rng, rate: [number, number], modifier = 1): { value: number; encounter: boolean } {
  const v = Math.min(ENCOUNTER_MAX, value + Math.round(randInt(rng, rate[0], rate[1]) * modifier));
  if (v >= ENCOUNTER_MAX) return { value: 0, encounter: true };
  if (v >= YELLOW_AT && rng() < (v - YELLOW_AT) / 120) return { value: 0, encounter: true };
  return { value: v, encounter: false };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/encounter.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/encounter.ts src/scripts/games/starlantern/engine/encounter.test.ts
git commit -m "feat(starlantern): encounter gauge"
```

---

### Task 4: 隊伍（能力值、編隊、經驗、升級、被動技能）

**Files:**
- Create: `engine/party.ts`, `engine/party.test.ts`

**Interfaces:**
- Consumes: `CHARACTERS`、`CHARACTER_IDS`、`SKILLS`、`EQUIPMENT`；型別 `Member`、`Party`、`Stats`、`CharacterId`、`Passive`。
- Produces:
  - `MAX_LEVEL = 20`；`STARTING_RECRUITS: CharacterId[]`（`scarlet, chizuru, liz, noel, selene`）
  - `expToNext(level): number` = `floor(15 × level^1.6)`（Lv1→15、Lv2→45）
  - `statsOf(m: Member): Stats`（等級成長加裝備加成）
  - `newMember(id): Member`；`newParty(): Party`（前排 scarlet、chizuru、liz；後排 noel、selene）
  - `recruit(p, id): Party`
  - `setFormation(p, front, back): { ok: true; party: Party } | { ok: false; reason: 'size'|'not-recruited'|'duplicate'|'empty' }`
  - `activeIds(p): CharacterId[]`
  - `learnedSkills(id, level): string[]`
  - `gainExp(m, amount): { member: Member; levels: number; learned: string[] }`
  - `awardExp(p, amount, survivors: CharacterId[]): { party: Party; results: { id: CharacterId; levels: number; learned: string[] }[] }`
  - `hasPassive(p, passive: Passive): boolean`（出戰中、存活、已學會）

- [ ] **Step 1: 寫失敗測試 `engine/party.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  expToNext, statsOf, newMember, newParty, recruit, setFormation, activeIds,
  learnedSkills, gainExp, awardExp, hasPassive, MAX_LEVEL,
} from './party';

describe('stats', () => {
  it('grows per level and adds equipment', () => {
    const m = newMember('scarlet');
    expect(statsOf(m).hp).toBe(48);
    expect(statsOf({ ...m, level: 3 }).hp).toBe(62);
    expect(statsOf({ ...m, equip: { weapon: 'iron-sword' } }).atk).toBe(13 + 4);
  });
  it('starts members at full HP/TP', () => {
    const m = newMember('noel');
    expect([m.level, m.hp, m.tp]).toEqual([1, 28, 30]);
  });
});

describe('formation', () => {
  it('starts with the spec front/back split', () => {
    const p = newParty();
    expect(p.front).toEqual(['scarlet', 'chizuru', 'liz']);
    expect(p.back).toEqual(['noel', 'selene']);
    expect(activeIds(p)).toHaveLength(5);
    expect(Object.keys(p.roster)).toHaveLength(8);
  });
  it('accepts a valid change with empty slots', () => {
    const r = setFormation(newParty(), ['scarlet', null, 'liz'], ['noel', null]);
    expect(r.ok && activeIds(r.party)).toEqual(['scarlet', 'liz', 'noel']);
  });
  it('rejects bad formations', () => {
    const p = newParty();
    expect(setFormation(p, ['scarlet', 'liz'], ['noel', null])).toEqual({ ok: false, reason: 'size' });
    expect(setFormation(p, ['bobby', null, null], [null, null])).toEqual({ ok: false, reason: 'not-recruited' });
    expect(setFormation(p, ['liz', 'liz', null], [null, null])).toEqual({ ok: false, reason: 'duplicate' });
    expect(setFormation(p, [null, null, null], [null, null])).toEqual({ ok: false, reason: 'empty' });
  });
  it('recruits once', () => {
    const p = recruit(newParty(), 'bobby');
    expect(p.recruited).toContain('bobby');
    expect(recruit(p, 'bobby').recruited.filter((id) => id === 'bobby')).toHaveLength(1);
  });
});

describe('experience', () => {
  it('uses the curve', () => {
    expect(expToNext(1)).toBe(15);
    expect(expToNext(2)).toBe(45);
  });
  it('levels up, carries over, raises current HP by the gain and learns skills', () => {
    const r = gainExp(newMember('noel'), 15 + 45 + 3);
    expect([r.member.level, r.member.exp, r.levels]).toEqual([3, 3, 2]);
    expect(r.member.hp).toBe(28 + 8);
    expect(r.learned).toEqual(['ice-star']);
  });
  it('keeps a downed member at 0 HP', () => {
    expect(gainExp({ ...newMember('liz'), hp: 0 }, 100).member.hp).toBe(0);
  });
  it('stops at the level cap', () => {
    const r = gainExp(newMember('liz'), 10_000_000);
    expect([r.member.level, r.member.exp]).toEqual([MAX_LEVEL, 0]);
  });
  it('gives survivors full, the bench half, and downed actives nothing', () => {
    const p = recruit(newParty(), 'sylvie');
    const { party } = awardExp(p, 10, ['scarlet', 'chizuru', 'noel', 'selene']);
    expect(party.roster.scarlet.exp).toBe(10);
    expect(party.roster.sylvie.exp).toBe(5);
    expect(party.roster.liz.exp).toBe(0);
    expect(party.roster.bobby.exp).toBe(0); // not recruited
  });
});

describe('skills and passives', () => {
  it('learns by level', () => {
    expect(learnedSkills('liz', 1)).toEqual(['twin-slash']);
    expect(learnedSkills('liz', 4)).toEqual(['twin-slash', 'stealth', 'treasure-sense']);
  });
  it('only counts living active members who learned the passive', () => {
    const p = newParty();
    expect(hasPassive(p, 'encounterDown')).toBe(false);
    p.roster.liz.level = 2;
    expect(hasPassive(p, 'encounterDown')).toBe(true);
    p.roster.liz.hp = 0;
    expect(hasPassive(p, 'encounterDown')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/party.test.ts`
Expected: FAIL，`Failed to resolve import "./party"`。

- [ ] **Step 3: 寫 `engine/party.ts`**

```ts
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { SKILLS } from '../data/skills';
import { EQUIPMENT } from '../data/equipment';
import type { CharacterId, Member, Party, Passive, Slot, StatKey, Stats } from './types';

export const MAX_LEVEL = 20;
export const STARTING_RECRUITS: CharacterId[] = ['scarlet', 'chizuru', 'liz', 'noel', 'selene'];
const STAT_KEYS: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

export const expToNext = (level: number): number => Math.floor(15 * level ** 1.6);

export function statsOf(m: Member): Stats {
  const def = CHARACTERS[m.id];
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = def.base[k] + def.growth[k] * (m.level - 1);
  for (const slot of SLOTS) {
    const id = m.equip[slot];
    const bonus = id ? EQUIPMENT[id]?.bonus : undefined;
    if (bonus) for (const k of STAT_KEYS) out[k] += bonus[k] ?? 0;
  }
  return out;
}

export function newMember(id: CharacterId): Member {
  const m: Member = { id, level: 1, exp: 0, hp: 0, tp: 0, equip: {} };
  const s = statsOf(m);
  return { ...m, hp: s.hp, tp: s.tp };
}

export function newParty(): Party {
  return {
    roster: Object.fromEntries(CHARACTER_IDS.map((id) => [id, newMember(id)])) as Record<CharacterId, Member>,
    recruited: [...STARTING_RECRUITS],
    front: ['scarlet', 'chizuru', 'liz'],
    back: ['noel', 'selene'],
  };
}

export function recruit(p: Party, id: CharacterId): Party {
  return p.recruited.includes(id) ? p : { ...p, recruited: [...p.recruited, id] };
}

export function activeIds(p: Party): CharacterId[] {
  return [...p.front, ...p.back].filter((id): id is CharacterId => id !== null);
}

export function setFormation(
  p: Party, front: (CharacterId | null)[], back: (CharacterId | null)[],
): { ok: true; party: Party } | { ok: false; reason: 'size' | 'not-recruited' | 'duplicate' | 'empty' } {
  if (front.length !== 3 || back.length !== 2) return { ok: false, reason: 'size' };
  const ids = [...front, ...back].filter((id): id is CharacterId => id !== null);
  if (ids.some((id) => !p.recruited.includes(id))) return { ok: false, reason: 'not-recruited' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate' };
  if (ids.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, party: { ...p, front: [...front], back: [...back] } };
}

export function learnedSkills(id: CharacterId, level: number): string[] {
  return CHARACTERS[id].skills.filter((s) => SKILLS[s].learnLevel <= level);
}

export function gainExp(m: Member, amount: number): { member: Member; levels: number; learned: string[] } {
  let level = m.level;
  let exp = m.exp + amount;
  while (level < MAX_LEVEL && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level++;
  }
  if (level === MAX_LEVEL) exp = 0;
  const before = statsOf(m);
  const next: Member = { ...m, level, exp };
  const after = statsOf(next);
  next.hp = m.hp > 0 ? Math.min(after.hp, m.hp + after.hp - before.hp) : 0;
  next.tp = Math.min(after.tp, m.tp + after.tp - before.tp);
  const had = new Set(learnedSkills(m.id, m.level));
  return { member: next, levels: level - m.level, learned: learnedSkills(m.id, level).filter((s) => !had.has(s)) };
}

export function awardExp(
  p: Party, amount: number, survivors: CharacterId[],
): { party: Party; results: { id: CharacterId; levels: number; learned: string[] }[] } {
  const active = activeIds(p);
  const roster = { ...p.roster };
  const results: { id: CharacterId; levels: number; learned: string[] }[] = [];
  for (const id of p.recruited) {
    const share = !active.includes(id) ? Math.floor(amount / 2) : survivors.includes(id) ? amount : 0;
    if (share <= 0) continue;
    const r = gainExp(roster[id], share);
    roster[id] = r.member;
    results.push({ id, levels: r.levels, learned: r.learned });
  }
  return { party: { ...p, roster }, results };
}

export function hasPassive(p: Party, passive: Passive): boolean {
  return activeIds(p).some((id) => {
    const m = p.roster[id];
    return m.hp > 0 && learnedSkills(id, m.level).some((s) => SKILLS[s].passive === passive);
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/party.test.ts`
Expected: PASS（13 tests）。

- [ ] **Step 5: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/party.ts src/scripts/games/starlantern/engine/party.test.ts
git commit -m "feat(starlantern): party stats, formation, exp and passives"
```

---

### Task 5: 戰鬥單位與傷害公式

**Files:**
- Create: `engine/combatant.ts`, `engine/combatant.test.ts`, `engine/testing.ts`

**Interfaces:**
- Consumes: `Rng`；型別 `Stats`、`Row`、`Element`、`BuffStat`。
- Produces:
  - `interface Buff { stat: BuffStat; pct: number; turns: number }`
  - `interface Combatant { key; side: 'party'|'enemy'; defId; name; max: Stats; hp; tp; row: Row; melee: boolean; weak: Element[]; resist: Element[]; boss: boolean; alive: boolean; poison: boolean; sleep: number; buffs: Buff[]; taunt: number; turret: { power: number; turns: number } | null; defending: boolean }`
  - `type BattleEvent`（見程式碼）
  - `MAX_BUFFS = 3`、`SLEEP_TURNS = 3`
  - `stat(c, s: BuffStat): number`（增減益加總，最低乘 0.25，結果至少 1）
  - `addBuff(c, b: Buff): void`（同能力同方向就刷新；滿 3 個就擠掉最舊的）
  - `elementMult(t, el): number`（弱點 1.5、抗性 0.5）
  - `interface DamageSpec { power; element; scale: 'atk'|'mag'; melee }`
  - `calcDamage(a, t, spec, rng): { amount: number; mult: number }`
  - `dealDamage(t, amount): void`（扣血、吵醒、歸零就倒下並清除狀態）
  - `testing.ts`：`makeCombatant(p)`、`constRng(v)`、`memoryStorage(seed?)`（`makeBattle` 在 Task 7 加入）

傷害公式：`基礎 = 攻方能力 × power/100 × 60/(40 + 守方能力)`。`scale` 為 `atk` 時守方用 `def`，為 `mag` 時用 `res`。倍率連乘：屬性倍率；近戰且攻方在後排 ×0.5；近戰且守方在後排 ×0.5；守方防禦中 ×0.5。最後乘亂數 `0.9 + rng() × 0.2`，取整，最低 1。`mult` 只回傳屬性倍率，給畫面顯示「弱點」或「抗性」。

- [ ] **Step 1: 寫 `engine/testing.ts`（測試專用，runtime 不 import）**

```ts
import type { Combatant } from './combatant';

export function makeCombatant(p: Partial<Combatant> & { key: string; side: Combatant['side'] }): Combatant {
  const max = { hp: 100, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10, ...p.max };
  return {
    defId: p.side === 'enemy' ? 'slime' : 'scarlet', name: p.key, hp: max.hp, tp: max.tp, row: 'front', melee: true,
    weak: [], resist: [], boss: false, alive: true, poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false,
    ...p, max,
  };
}

export const constRng = (v: number) => () => v;

export function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}
```

- [ ] **Step 2: 寫失敗測試 `engine/combatant.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { addBuff, calcDamage, dealDamage, stat, MAX_BUFFS } from './combatant';
import { constRng, makeCombatant } from './testing';

const rng = constRng(0.5); // variance factor exactly 1.0
const phys = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: true };

describe('calcDamage', () => {
  const a = makeCombatant({ key: 'a', side: 'party' });
  const t = makeCombatant({ key: 't', side: 'enemy' });
  it('uses the base formula', () => {
    expect(calcDamage(a, t, phys, rng)).toEqual({ amount: 20, mult: 1 });
  });
  it('applies weakness and resistance', () => {
    const fire = { ...phys, element: 'fire' as const };
    expect(calcDamage(a, { ...t, weak: ['fire'] }, fire, rng)).toEqual({ amount: 30, mult: 1.5 });
    expect(calcDamage(a, { ...t, resist: ['fire'] }, fire, rng)).toEqual({ amount: 10, mult: 0.5 });
  });
  it('halves melee from or into the back row, but not ranged', () => {
    expect(calcDamage({ ...a, row: 'back' }, t, phys, rng).amount).toBe(10);
    expect(calcDamage(t, { ...a, row: 'back' }, phys, rng).amount).toBe(10);
    expect(calcDamage({ ...a, row: 'back' }, t, { ...phys, melee: false }, rng).amount).toBe(20);
  });
  it('halves damage into a defending target', () => {
    expect(calcDamage(a, { ...t, defending: true }, phys, rng).amount).toBe(10);
  });
  it('uses mag against res for magic', () => {
    const caster = makeCombatant({ key: 'c', side: 'party', max: { mag: 40 } as never });
    expect(calcDamage(caster, t, { ...phys, scale: 'mag', melee: false }, rng).amount).toBe(40);
  });
  it('never deals less than 1', () => {
    const tank = makeCombatant({ key: 'k', side: 'enemy', max: { def: 9999 } as never });
    expect(calcDamage(a, tank, phys, rng).amount).toBe(1);
  });
});

describe('buffs', () => {
  it('modify stats with a floor of 25%', () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    addBuff(c, { stat: 'atk', pct: 50, turns: 3 });
    expect(stat(c, 'atk')).toBe(30);
    const d = makeCombatant({ key: 'b', side: 'party' });
    addBuff(d, { stat: 'atk', pct: -100, turns: 3 });
    expect(stat(d, 'atk')).toBe(5);
  });
  it('refresh the same stat and direction instead of stacking', () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    addBuff(c, { stat: 'atk', pct: 25, turns: 1 });
    addBuff(c, { stat: 'atk', pct: 25, turns: 3 });
    expect(c.buffs).toEqual([{ stat: 'atk', pct: 25, turns: 3 }]);
  });
  it(`cap at ${MAX_BUFFS}, dropping the oldest`, () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    for (const s of ['atk', 'def', 'spd', 'res'] as const) addBuff(c, { stat: s, pct: 10, turns: 3 });
    expect(c.buffs.map((b) => b.stat)).toEqual(['def', 'spd', 'res']);
  });
});

describe('dealDamage', () => {
  it('wakes a sleeper', () => {
    const c = makeCombatant({ key: 'a', side: 'party', sleep: 2 });
    dealDamage(c, 5);
    expect([c.hp, c.sleep, c.alive]).toEqual([95, 0, true]);
  });
  it('knocks out at 0 and clears statuses', () => {
    const c = makeCombatant({ key: 'a', side: 'party', poison: true, taunt: 2, buffs: [{ stat: 'atk', pct: 10, turns: 2 }] });
    dealDamage(c, 500);
    expect(c).toMatchObject({ hp: 0, alive: false, poison: false, taunt: 0, buffs: [], turret: null });
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/combatant.test.ts`
Expected: FAIL，`Failed to resolve import "./combatant"`。

- [ ] **Step 4: 寫 `engine/combatant.ts`**

```ts
import type { Rng } from './rng';
import type { BuffStat, Element, Row, Stats } from './types';

export interface Buff { stat: BuffStat; pct: number; turns: number }

export interface Combatant {
  key: string; side: 'party' | 'enemy'; defId: string; name: string;
  max: Stats; hp: number; tp: number; row: Row; melee: boolean;
  weak: Element[]; resist: Element[]; boss: boolean; alive: boolean;
  poison: boolean; sleep: number; buffs: Buff[]; taunt: number;
  turret: { power: number; turns: number } | null; defending: boolean;
}

export type BattleEvent =
  | { type: 'act'; actor: string; label: string }
  | { type: 'damage'; target: string; amount: number; element: Element; mult: number }
  | { type: 'ko'; target: string }
  | { type: 'heal'; target: string; amount: number }
  | { type: 'tp'; target: string; amount: number }
  | { type: 'revive'; target: string }
  | { type: 'cure'; target: string }
  | { type: 'status'; target: string; status: 'poison' | 'sleep' }
  | { type: 'resist'; target: string }
  | { type: 'buff'; target: string; stat: BuffStat; pct: number }
  | { type: 'taunt'; target: string }
  | { type: 'turret'; target: string }
  | { type: 'asleep'; actor: string }
  | { type: 'no-tp'; actor: string }
  | { type: 'escape'; success: boolean }
  | { type: 'poison-tick'; target: string; amount: number };

export const MAX_BUFFS = 3;
export const SLEEP_TURNS = 3;

export function stat(c: Combatant, s: BuffStat): number {
  const pct = c.buffs.filter((b) => b.stat === s).reduce((sum, b) => sum + b.pct, 0);
  return Math.max(1, Math.floor(c.max[s] * Math.max(0.25, 1 + pct / 100)));
}

export function addBuff(c: Combatant, b: Buff): void {
  const i = c.buffs.findIndex((x) => x.stat === b.stat && Math.sign(x.pct) === Math.sign(b.pct));
  if (i >= 0) { c.buffs[i] = { ...b }; return; }
  if (c.buffs.length >= MAX_BUFFS) c.buffs.shift();
  c.buffs.push({ ...b });
}

export function elementMult(t: Combatant, el: Element): number {
  return t.weak.includes(el) ? 1.5 : t.resist.includes(el) ? 0.5 : 1;
}

export interface DamageSpec { power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean }

export function calcDamage(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): { amount: number; mult: number } {
  const atk = stat(a, spec.scale);
  const def = stat(t, spec.scale === 'atk' ? 'def' : 'res');
  const el = elementMult(t, spec.element);
  let mult = el;
  if (spec.melee && a.row === 'back') mult *= 0.5;
  if (spec.melee && t.row === 'back') mult *= 0.5;
  if (t.defending) mult *= 0.5;
  const base = ((atk * spec.power) / 100) * (60 / (40 + def));
  return { amount: Math.max(1, Math.floor(base * mult * (0.9 + rng() * 0.2))), mult: el };
}

export function dealDamage(t: Combatant, amount: number): void {
  t.hp = Math.max(0, t.hp - amount);
  t.sleep = 0;
  if (t.hp === 0) {
    t.alive = false;
    t.poison = false;
    t.buffs = [];
    t.taunt = 0;
    t.turret = null;
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/combatant.test.ts`
Expected: PASS（11 tests）。

- [ ] **Step 6: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/combatant.ts src/scripts/games/starlantern/engine/combatant.test.ts src/scripts/games/starlantern/engine/testing.ts
git commit -m "feat(starlantern): combatant stats, buffs and damage formula"
```

---

### Task 6: 技能效果執行

**Files:**
- Create: `engine/skills.ts`, `engine/skills.test.ts`

**Interfaces:**
- Consumes: `calcDamage`、`dealDamage`、`addBuff`、`stat`、`SLEEP_TURNS`、`Combatant`、`BattleEvent`；`Effect`、`Element`。
- Produces:
  - `interface EffectContext { rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[] }`
  - `applyEffect(actor: Combatant, target: Combatant, eff: Effect, ctx: EffectContext): void`

規則：
- `damage`：打 `hits` 次（預設 1），目標倒下就停。打到敵人時把屬性記進 `revealed[target.defId]`。
- `heal`：`floor(power/100 × (施法者 mag × 2 + 10))`，不超過上限，倒下的目標無效。
- `restore`（道具）：固定量，`itemBoost` 時加倍。
- `revive`：只對倒下的目標，HP 設為 `max(1, floor(上限 × hpPct))`。
- `inflict`：機率 `chance`，頭目減半；毒設 `poison = true`，睡眠設 `sleep = SLEEP_TURNS`；失敗記 `resist`。
- `taunt`、`turret` 作用在施放者身上。

- [ ] **Step 1: 寫失敗測試 `engine/skills.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { applyEffect, type EffectContext } from './skills';
import { constRng, makeCombatant } from './testing';

const ctx = (over: Partial<EffectContext> = {}): EffectContext => ({ rng: constRng(0.5), itemBoost: false, revealed: {}, log: [], ...over });
const party = (over = {}) => makeCombatant({ key: 'p', side: 'party', ...over });
const enemy = (over = {}) => makeCombatant({ key: 'e0', side: 'enemy', ...over });

describe('applyEffect', () => {
  it('damages, reveals the element and logs the multiplier', () => {
    const c = ctx(); const t = enemy({ weak: ['fire'] });
    applyEffect(party(), t, { kind: 'damage', power: 100, element: 'fire', scale: 'mag', melee: false }, c);
    expect(t.hp).toBe(70);
    expect(c.revealed).toEqual({ slime: ['fire'] });
    expect(c.log).toEqual([{ type: 'damage', target: 'e0', amount: 30, element: 'fire', mult: 1.5 }]);
  });
  it('stops multi-hit attacks once the target falls', () => {
    const c = ctx(); const t = enemy({ hp: 5 });
    applyEffect(party(), t, { kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true, hits: 3 }, c);
    expect(c.log.map((e) => e.type)).toEqual(['damage', 'ko']);
  });
  it('heals by magic and caps at max HP', () => {
    const c = ctx(); const t = party({ hp: 10 });
    applyEffect(party(), t, { kind: 'heal', power: 120 }, c);
    expect(t.hp).toBe(70);
    const u = party({ hp: 90 });
    applyEffect(party(), u, { kind: 'heal', power: 120 }, c);
    expect(u.hp).toBe(100);
    expect(c.log.at(-1)).toEqual({ type: 'heal', target: 'p', amount: 10 });
  });
  it('does not heal the fallen', () => {
    const t = party({ hp: 0, alive: false });
    applyEffect(party(), t, { kind: 'heal', power: 120 }, ctx());
    expect(t.hp).toBe(0);
  });
  it('doubles item restores with itemBoost', () => {
    const t = party({ hp: 10, max: { hp: 200 } as never });
    applyEffect(party(), t, { kind: 'restore', hp: 60 }, ctx({ itemBoost: true }));
    expect(t.hp).toBe(130);
  });
  it('revives only the fallen', () => {
    const dead = party({ hp: 0, alive: false });
    applyEffect(party(), dead, { kind: 'revive', hpPct: 0.3 }, ctx());
    expect([dead.alive, dead.hp]).toEqual([true, 30]);
    const alive = party({ hp: 50 });
    applyEffect(party(), alive, { kind: 'revive', hpPct: 0.3 }, ctx());
    expect(alive.hp).toBe(50);
  });
  it('cures poison and sleep', () => {
    const t = party({ poison: true, sleep: 2 });
    applyEffect(party(), t, { kind: 'cure' }, ctx());
    expect([t.poison, t.sleep]).toEqual([false, 0]);
  });
  it('inflicts by chance, halved against bosses', () => {
    const t = enemy();
    applyEffect(party(), t, { kind: 'inflict', status: 'sleep', chance: 0.6 }, ctx({ rng: constRng(0) }));
    expect(t.sleep).toBe(3);
    const boss = enemy({ boss: true }); const c = ctx({ rng: constRng(0.4) });
    applyEffect(party(), boss, { kind: 'inflict', status: 'poison', chance: 0.6 }, c);
    expect(boss.poison).toBe(false);
    expect(c.log).toEqual([{ type: 'resist', target: 'e0' }]);
  });
  it('puts taunt and turret on the actor', () => {
    const a = party();
    applyEffect(a, a, { kind: 'taunt', turns: 3 }, ctx());
    applyEffect(a, a, { kind: 'turret', power: 70, turns: 3 }, ctx());
    expect([a.taunt, a.turret]).toEqual([3, { power: 70, turns: 3 }]);
  });
  it('applies buffs to the target', () => {
    const t = enemy();
    applyEffect(party(), t, { kind: 'buff', stat: 'spd', pct: -30, turns: 3 }, ctx());
    expect(t.buffs).toEqual([{ stat: 'spd', pct: -30, turns: 3 }]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/skills.test.ts`
Expected: FAIL，`Failed to resolve import "./skills"`。

- [ ] **Step 3: 寫 `engine/skills.ts`**

```ts
import { addBuff, calcDamage, dealDamage, stat, SLEEP_TURNS, type BattleEvent, type Combatant } from './combatant';
import type { Rng } from './rng';
import type { Effect, Element } from './types';

export interface EffectContext { rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[] }

function reveal(revealed: Record<string, Element[]>, defId: string, el: Element): void {
  const list = revealed[defId] ?? (revealed[defId] = []);
  if (!list.includes(el)) list.push(el);
}

function gainHp(t: Combatant, amount: number): number {
  const before = t.hp;
  t.hp = Math.min(t.max.hp, t.hp + amount);
  return t.hp - before;
}

export function applyEffect(actor: Combatant, target: Combatant, eff: Effect, ctx: EffectContext): void {
  switch (eff.kind) {
    case 'damage': {
      for (let i = 0; i < (eff.hits ?? 1) && target.alive; i++) {
        const { amount, mult } = calcDamage(actor, target, eff, ctx.rng);
        dealDamage(target, amount);
        if (target.side === 'enemy') reveal(ctx.revealed, target.defId, eff.element);
        ctx.log.push({ type: 'damage', target: target.key, amount, element: eff.element, mult });
        if (!target.alive) ctx.log.push({ type: 'ko', target: target.key });
      }
      return;
    }
    case 'heal': {
      if (!target.alive) return;
      const amount = gainHp(target, Math.floor((eff.power / 100) * (stat(actor, 'mag') * 2 + 10)));
      ctx.log.push({ type: 'heal', target: target.key, amount });
      return;
    }
    case 'restore': {
      if (!target.alive) return;
      const k = ctx.itemBoost ? 2 : 1;
      if (eff.hp) ctx.log.push({ type: 'heal', target: target.key, amount: gainHp(target, eff.hp * k) });
      if (eff.tp) {
        const before = target.tp;
        target.tp = Math.min(target.max.tp, target.tp + eff.tp * k);
        ctx.log.push({ type: 'tp', target: target.key, amount: target.tp - before });
      }
      return;
    }
    case 'revive': {
      if (target.alive) return;
      target.alive = true;
      target.hp = Math.max(1, Math.floor(target.max.hp * eff.hpPct));
      ctx.log.push({ type: 'revive', target: target.key });
      return;
    }
    case 'cure': {
      if (!target.alive) return;
      target.poison = false;
      target.sleep = 0;
      ctx.log.push({ type: 'cure', target: target.key });
      return;
    }
    case 'inflict': {
      if (!target.alive) return;
      if (ctx.rng() < eff.chance * (target.boss ? 0.5 : 1)) {
        if (eff.status === 'poison') target.poison = true;
        else target.sleep = SLEEP_TURNS;
        ctx.log.push({ type: 'status', target: target.key, status: eff.status });
      } else {
        ctx.log.push({ type: 'resist', target: target.key });
      }
      return;
    }
    case 'buff': {
      if (!target.alive) return;
      addBuff(target, { stat: eff.stat, pct: eff.pct, turns: eff.turns });
      ctx.log.push({ type: 'buff', target: target.key, stat: eff.stat, pct: eff.pct });
      return;
    }
    case 'taunt': {
      actor.taunt = eff.turns;
      ctx.log.push({ type: 'taunt', target: actor.key });
      return;
    }
    case 'turret': {
      actor.turret = { power: eff.power, turns: eff.turns };
      ctx.log.push({ type: 'turret', target: actor.key });
      return;
    }
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/skills.test.ts`
Expected: PASS（10 tests）。

- [ ] **Step 5: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/skills.ts src/scripts/games/starlantern/engine/skills.test.ts
git commit -m "feat(starlantern): skill effect resolution"
```

---

### Task 7: 戰鬥回合解算

**Files:**
- Create: `engine/battle.ts`, `engine/battle.test.ts`
- Modify: `engine/testing.ts`（加 `makeBattle`）

**Interfaces:**
- Consumes: Task 4 的 `statsOf`、`activeIds`、`hasPassive`；Task 5 全部；Task 6 的 `applyEffect`；`CHARACTERS`、`ENEMIES`、`SKILLS`、`ITEMS`；`pick`。
- Produces:
  - `type Action = { kind: 'attack'; target: string } | { kind: 'skill'; skill: string; target?: string } | { kind: 'defend' } | { kind: 'item'; item: string; target?: string } | { kind: 'escape' }`
  - `type Outcome = 'ongoing'|'win'|'lose'|'fled'`
  - `interface BattleState { round; party: Combatant[]; enemies: Combatant[]; boss: boolean; inventory: Record<string, number>; revealed: Record<string, Element[]>; itemBoost: boolean; log: BattleEvent[]; outcome: Outcome }`
  - `createBattle(o: { party: Party; enemyIds: string[]; boss?: boolean; inventory: Record<string, number>; revealed: Record<string, Element[]> }): BattleState`
  - `turnOrder(cs: Combatant[], rng): Combatant[]`
  - `escapeChance(s): number`
  - `resolveRound(prev: BattleState, actions: Record<string, Action>, rng): BattleState`（不改動 `prev`；`log` 只含本回合事件）
  - `rewards(s, rng, dropBoost: boolean): { exp: number; gold: number; drops: Record<string, number> }`
  - `writeBack(p: Party, s: BattleState): Party`

回合規則：
1. 已分出勝負就直接回傳。
2. 選「防禦」的隊員整回合 `defending = true`。
3. 有任何存活隊員選「逃跑」：頭目戰必失敗，否則以 `escapeChance` 擲骰（`0.5 + (我方平均速度 − 敵方平均速度)/50`，夾在 0.1–0.95），成功就 `fled` 並結束。
4. 敵人在排序前決定行動：依序以各技能的 `chance` 擲骰，都沒中就普通攻擊；單體目標優先選有挑釁的隊員，否則隨機。
5. 依 `速度 × (1 + rng × 0.25)` 由高到低行動，同分維持原順序（我方在前）。
6. 輪到時：倒下的跳過；睡著的跳過並把 `sleep` 減 1；技能 TP 不足記 `no-tp`；指定的目標已倒下就重選（挑釁者優先，否則隨機）。每次行動後檢查勝敗，分出就立刻結束。
7. 回合結束：砲台開火（`scale: 'mag'`、物理、非近戰）並減 1；毒扣上限的 10%（至少 1）；增益減益與挑釁回合數減 1；清除防禦。

- [ ] **Step 1: 在 `engine/testing.ts` 末尾加上 `makeBattle`**

```ts
import type { BattleState } from './battle';

export function makeBattle(party: Combatant[], enemies: Combatant[], extra: Partial<BattleState> = {}): BattleState {
  return { round: 0, party, enemies, boss: false, inventory: {}, revealed: {}, itemBoost: false, log: [], outcome: 'ongoing', ...extra };
}
```
（把這個 `import type` 移到檔案頂端，和原本的 `import type { Combatant }` 放在一起。）

- [ ] **Step 2: 寫失敗測試 `engine/battle.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createBattle, escapeChance, resolveRound, rewards, turnOrder, writeBack } from './battle';
import { newParty } from './party';
import { constRng, makeBattle, makeCombatant } from './testing';

const rng = constRng(0.5); // enemies never use skills (all chances < 0.5), variance 1.0
const P = (key: string, over = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over = {}) => makeCombatant({ key, side: 'enemy', ...over });

describe('createBattle', () => {
  it('builds rows from the formation and letters duplicate enemies', () => {
    const party = newParty();
    party.roster.liz.hp = 0;
    const s = createBattle({ party, enemyIds: ['slime', 'slime', 'bat'], inventory: { potion: 2 }, revealed: {} });
    expect(s.party.map((c) => [c.key, c.row])).toEqual([
      ['scarlet', 'front'], ['chizuru', 'front'], ['liz', 'front'], ['noel', 'back'], ['selene', 'back'],
    ]);
    expect(s.party.find((c) => c.key === 'liz')!.alive).toBe(false);
    expect(s.enemies.map((e) => [e.key, e.name])).toEqual([['e0', '苔蘚史萊姆 A'], ['e1', '苔蘚史萊姆 B'], ['e2', '遺跡蝙蝠']]);
    expect(s.outcome).toBe('ongoing');
  });
});

describe('turnOrder', () => {
  it('sorts by speed and keeps input order on ties', () => {
    const order = turnOrder([P('slow', { max: { spd: 5 } as never }), E('e0'), P('fast', { max: { spd: 30 } as never }), P('tie')], rng);
    expect(order.map((c) => c.key)).toEqual(['fast', 'e0', 'tie', 'slow']);
  });
});

describe('resolveRound', () => {
  it('does not mutate the previous state and logs only this round', () => {
    const prev = makeBattle([P('p')], [E('e0')]);
    const next = resolveRound(prev, { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(prev.enemies[0].hp).toBe(100);
    expect(next.enemies[0].hp).toBe(80);
    expect(next.round).toBe(1);
  });
  it('wins when the last enemy falls, before it can act', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 1 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.outcome).toBe('win');
    expect(s.party[0].hp).toBe(100);
  });
  it('loses when the party falls', () => {
    const s = resolveRound(makeBattle([P('p', { hp: 5 })], [E('e0', { max: { spd: 20 } as never })]), { p: { kind: 'defend' } }, rng);
    expect(s.outcome).toBe('lose');
  });
  it('halves enemy damage on a defending member', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
  });
  it('retargets when the chosen enemy is already down', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 0, alive: false }), E('e1', { sleep: 3 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.enemies[1].hp).toBe(80);
  });
  it('refuses a skill without enough TP', () => {
    const s = resolveRound(makeBattle([P('p', { tp: 0 })], [E('e0', { sleep: 3 })]), { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, rng);
    expect(s.log).toContainEqual({ type: 'no-tp', actor: 'p' });
    expect(s.enemies[0].hp).toBe(100);
  });
  it('spends TP and the HP cost of skills', () => {
    // the faster sleeper skips its turn first, so the hit that wakes it lands after it would have acted
    const s = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 3, max: { spd: 20 } as never })]), { p: { kind: 'skill', skill: 'flame-burst', target: 'e0' } }, rng);
    expect(s.party[0].tp).toBe(17);
    expect(s.party[0].hp).toBe(85);
  });
  it('skips sleeping actors, and damage wakes them', () => {
    const asleep = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'defend' } }, rng);
    expect(asleep.log).toContainEqual({ type: 'asleep', actor: 'e0' });
    expect(asleep.enemies[0].sleep).toBe(1);
    expect(asleep.party[0].hp).toBe(100);
    const woken = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(woken.party[0].hp).toBe(80);
  });
  it('ticks poison at round end', () => {
    const s = resolveRound(makeBattle([P('p', { poison: true })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.log).toContainEqual({ type: 'poison-tick', target: 'p', amount: 10 });
  });
  it('expires buffs and fires turrets at round end', () => {
    const s = resolveRound(
      makeBattle([P('p', { buffs: [{ stat: 'atk', pct: 50, turns: 1 }], turret: { power: 100, turns: 1 } })], [E('e0', { sleep: 3 })]),
      { p: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].buffs).toEqual([]);
    expect(s.party[0].turret).toBeNull();
    expect(s.enemies[0].hp).toBe(80);
  });
  it('consumes items and ignores empty stock', () => {
    const used = resolveRound(makeBattle([P('p', { hp: 50 })], [E('e0', { sleep: 3 })], { inventory: { potion: 1 } }), { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect([used.party[0].hp, used.inventory.potion]).toEqual([100, 0]);
    const empty = resolveRound(used, { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect(empty.inventory.potion).toBe(0);
  });
  it('sends single-target enemy attacks at a taunting member', () => {
    const s = resolveRound(makeBattle([P('p1', { taunt: 2 }), P('p2')], [E('e0')]), { p1: { kind: 'defend' }, p2: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.party[1].hp).toBe(100);
  });
  it('flees on a good roll but never from a boss', () => {
    const fled = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'escape' } }, constRng(0.1));
    expect(fled.outcome).toBe('fled');
    const boss = resolveRound(makeBattle([P('p')], [E('e0')], { boss: true }), { p: { kind: 'escape' } }, constRng(0.1));
    expect(boss.outcome).toBe('ongoing');
    expect(boss.log[0]).toEqual({ type: 'escape', success: false });
  });
  it('clamps escape chance', () => {
    expect(escapeChance(makeBattle([P('p', { max: { spd: 1 } as never })], [E('e0', { max: { spd: 999 } as never })]))).toBe(0.1);
  });
});

describe('after battle', () => {
  it('sums rewards and rolls drops, doubled by dropBoost', () => {
    const s = makeBattle([P('p')], [E('e0', { defId: 'slime' }), E('e1', { defId: 'bat' })]);
    expect(rewards(s, constRng(0), false)).toEqual({ exp: 12, gold: 9, drops: { moss: 1, 'bat-wing': 1 } });
    expect(rewards(s, constRng(0.99), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), true).drops).toEqual({ moss: 1, 'bat-wing': 1 });
  });
  it('writes HP and TP back to the roster', () => {
    const party = newParty();
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    s.party[0].hp = 7; s.party[0].tp = 1;
    const p = writeBack(party, s);
    expect([p.roster.scarlet.hp, p.roster.scarlet.tp]).toEqual([7, 1]);
    expect(party.roster.scarlet.hp).toBe(48);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/battle.test.ts`
Expected: FAIL，`Failed to resolve import "./battle"`。

- [ ] **Step 4: 寫 `engine/battle.ts`**

```ts
import { CHARACTERS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { stat, dealDamage, type BattleEvent, type Combatant } from './combatant';
import { hasPassive, statsOf } from './party';
import { pick, type Rng } from './rng';
import { applyEffect, type EffectContext } from './skills';
import type { CharacterId, Element, Member, Party, Row, Target } from './types';

export type Action =
  | { kind: 'attack'; target: string }
  | { kind: 'skill'; skill: string; target?: string }
  | { kind: 'defend' }
  | { kind: 'item'; item: string; target?: string }
  | { kind: 'escape' };
export type Outcome = 'ongoing' | 'win' | 'lose' | 'fled';

export interface BattleState {
  round: number; party: Combatant[]; enemies: Combatant[]; boss: boolean;
  inventory: Record<string, number>; revealed: Record<string, Element[]>; itemBoost: boolean;
  log: BattleEvent[]; outcome: Outcome;
}

type EnemyAction = { kind: 'attack'; target?: string } | { kind: 'enemy-skill'; index: number; target?: string };

const fresh = () => ({ poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false });

function fromMember(m: Member, row: Row): Combatant {
  const def = CHARACTERS[m.id];
  return { ...fresh(), key: m.id, side: 'party', defId: m.id, name: def.name, max: statsOf(m), hp: m.hp, tp: m.tp,
    row, melee: def.melee, weak: [], resist: [], boss: false, alive: m.hp > 0 };
}

function fromEnemy(id: string, key: string, name: string): Combatant {
  const d = ENEMIES[id];
  return { ...fresh(), key, side: 'enemy', defId: id, name, max: { ...d.stats }, hp: d.stats.hp, tp: d.stats.tp,
    row: 'front', melee: true, weak: [...d.weak], resist: [...d.resist], boss: !!d.boss, alive: true };
}

export function createBattle(o: {
  party: Party; enemyIds: string[]; boss?: boolean; inventory: Record<string, number>; revealed: Record<string, Element[]>;
}): BattleState {
  const party: Combatant[] = [];
  for (const id of o.party.front) if (id) party.push(fromMember(o.party.roster[id], 'front'));
  for (const id of o.party.back) if (id) party.push(fromMember(o.party.roster[id], 'back'));
  const counts: Record<string, number> = {};
  for (const id of o.enemyIds) counts[id] = (counts[id] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const enemies = o.enemyIds.map((id, i) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    const name = counts[id] > 1 ? `${ENEMIES[id].name} ${String.fromCharCode(64 + n)}` : ENEMIES[id].name;
    return fromEnemy(id, `e${i}`, name);
  });
  return {
    round: 0, party, enemies, boss: !!o.boss, inventory: { ...o.inventory }, revealed: structuredClone(o.revealed),
    itemBoost: hasPassive(o.party, 'itemBoost'), log: [], outcome: 'ongoing',
  };
}

export function turnOrder(cs: Combatant[], rng: Rng): Combatant[] {
  return cs
    .map((c, i) => ({ c, i, k: stat(c, 'spd') * (1 + rng() * 0.25) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.c);
}

const living = (cs: Combatant[]) => cs.filter((c) => c.alive);
const avgSpd = (cs: Combatant[]) => living(cs).reduce((s, c) => s + stat(c, 'spd'), 0) / Math.max(1, living(cs).length);

export function escapeChance(s: BattleState): number {
  return Math.min(0.95, Math.max(0.1, 0.5 + (avgSpd(s.party) - avgSpd(s.enemies)) / 50));
}

function pickTarget(list: Combatant[], key: string | undefined, rng: Rng): Combatant | null {
  const chosen = list.find((c) => c.key === key && c.alive);
  if (chosen) return chosen;
  const alive = living(list);
  if (!alive.length) return null;
  return alive.find((c) => c.taunt > 0) ?? pick(rng, alive);
}

function resolveTargets(s: BattleState, actor: Combatant, target: Target | null, chosen: string | undefined, rng: Rng): Combatant[] {
  const allies = actor.side === 'party' ? s.party : s.enemies;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  switch (target) {
    case 'enemy': { const t = pickTarget(foes, chosen, rng); return t ? [t] : []; }
    case 'enemies': return living(foes);
    case 'ally': {
      const t = allies.find((c) => c.key === chosen && c.alive)
        ?? living(allies).sort((a, b) => a.hp / a.max.hp - b.hp / b.max.hp)[0];
      return t ? [t] : [];
    }
    case 'allies': return living(allies);
    case 'self': return [actor];
    case 'deadAlly': {
      const t = allies.find((c) => c.key === chosen && !c.alive) ?? allies.find((c) => !c.alive);
      return t ? [t] : [];
    }
    default: return [];
  }
}

function chooseEnemyActions(s: BattleState, rng: Rng): Map<string, EnemyAction> {
  const out = new Map<string, EnemyAction>();
  for (const e of living(s.enemies)) {
    const skills = ENEMIES[e.defId]?.skills ?? [];
    const index = skills.findIndex((sk) => rng() < sk.chance);
    const target = pickTarget(s.party, undefined, rng)?.key;
    out.set(e.key, index >= 0 ? { kind: 'enemy-skill', index, target } : { kind: 'attack', target });
  }
  return out;
}

function checkOutcome(s: BattleState): boolean {
  if (!living(s.enemies).length) s.outcome = 'win';
  else if (!living(s.party).length) s.outcome = 'lose';
  return s.outcome !== 'ongoing';
}

function perform(s: BattleState, actor: Combatant, act: Action | EnemyAction, ctx: EffectContext, rng: Rng): void {
  const physical = (t: Combatant) =>
    applyEffect(actor, t, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: actor.melee }, ctx);
  switch (act.kind) {
    case 'attack': {
      const t = pickTarget(actor.side === 'party' ? s.enemies : s.party, act.target, rng);
      if (!t) return;
      s.log.push({ type: 'act', actor: actor.key, label: '攻擊' });
      physical(t);
      return;
    }
    case 'enemy-skill': {
      const sk = ENEMIES[actor.defId].skills[act.index];
      s.log.push({ type: 'act', actor: actor.key, label: sk.name });
      for (const t of resolveTargets(s, actor, sk.target, act.target, rng)) for (const eff of sk.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'skill': {
      const def = SKILLS[act.skill];
      if (!def || def.passive) return;
      if (actor.tp < def.tp) { s.log.push({ type: 'no-tp', actor: actor.key }); return; }
      actor.tp -= def.tp;
      if (def.hpCost) actor.hp = Math.max(1, actor.hp - Math.floor(actor.max.hp * def.hpCost));
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'item': {
      const def = ITEMS[act.item];
      if (!def || !def.battle || (s.inventory[act.item] ?? 0) <= 0) return;
      s.inventory[act.item] -= 1;
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'defend':
      s.log.push({ type: 'act', actor: actor.key, label: '防禦' });
      return;
    case 'escape':
      return;
  }
}

function endOfRound(s: BattleState, ctx: EffectContext, rng: Rng): void {
  for (const c of living(s.party)) {
    if (!c.turret) continue;
    const t = pickTarget(s.enemies, undefined, rng);
    if (t) {
      s.log.push({ type: 'act', actor: c.key, label: '砲台' });
      applyEffect(c, t, { kind: 'damage', power: c.turret.power, element: 'phys', scale: 'mag', melee: false }, ctx);
    }
    c.turret = c.turret.turns > 1 ? { ...c.turret, turns: c.turret.turns - 1 } : null;
  }
  for (const c of [...s.party, ...s.enemies]) {
    if (c.alive && c.poison) {
      const amount = Math.max(1, Math.floor(c.max.hp * 0.1));
      dealDamage(c, amount);
      s.log.push({ type: 'poison-tick', target: c.key, amount });
      if (!c.alive) s.log.push({ type: 'ko', target: c.key });
    }
    c.buffs = c.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    c.taunt = Math.max(0, c.taunt - 1);
    c.defending = false;
  }
}

export function resolveRound(prev: BattleState, actions: Record<string, Action>, rng: Rng): BattleState {
  const s = structuredClone(prev);
  s.log = [];
  if (s.outcome !== 'ongoing' || checkOutcome(s)) return s;
  s.round += 1;
  const ctx: EffectContext = { rng, itemBoost: s.itemBoost, revealed: s.revealed, log: s.log };
  for (const c of s.party) c.defending = c.alive && actions[c.key]?.kind === 'defend';
  if (s.party.some((c) => c.alive && actions[c.key]?.kind === 'escape')) {
    const success = !s.boss && rng() < escapeChance(s);
    s.log.push({ type: 'escape', success });
    if (success) { s.outcome = 'fled'; return s; }
  }
  const enemyActs = chooseEnemyActions(s, rng);
  for (const actor of turnOrder([...living(s.party), ...living(s.enemies)], rng)) {
    if (!actor.alive) continue;
    if (actor.sleep > 0) { actor.sleep -= 1; s.log.push({ type: 'asleep', actor: actor.key }); continue; }
    const act = actor.side === 'party' ? actions[actor.key] : enemyActs.get(actor.key);
    if (act) perform(s, actor, act, ctx, rng);
    if (checkOutcome(s)) return s;
  }
  endOfRound(s, ctx, rng);
  checkOutcome(s);
  return s;
}

export function rewards(s: BattleState, rng: Rng, dropBoost: boolean): { exp: number; gold: number; drops: Record<string, number> } {
  let exp = 0, gold = 0;
  const drops: Record<string, number> = {};
  for (const e of s.enemies) {
    const d = ENEMIES[e.defId];
    exp += d.exp;
    gold += d.gold;
    for (const drop of d.drops) if (rng() < Math.min(1, drop.chance * (dropBoost ? 2 : 1))) drops[drop.mat] = (drops[drop.mat] ?? 0) + 1;
  }
  return { exp, gold, drops };
}

export function writeBack(p: Party, s: BattleState): Party {
  const roster = { ...p.roster };
  for (const c of s.party) {
    const id = c.key as CharacterId;
    roster[id] = { ...roster[id], hp: c.alive ? c.hp : 0, tp: c.tp };
  }
  return { ...p, roster };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/battle.test.ts`
Expected: PASS（17 tests）。

- [ ] **Step 6: 跑整個 engine 確認沒有回歸**

Run: `npx vitest run src/scripts/games/starlantern`
Expected: 全部 PASS。

- [ ] **Step 7: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine
git commit -m "feat(starlantern): battle round resolution, rewards and write-back"
```

---

### Task 8: 遊戲狀態與城鎮（商店、解鎖、裝備、旅館）

**Files:**
- Create: `engine/state.ts`, `engine/town.ts`, `engine/town.test.ts`

**Interfaces:**
- Consumes: `newParty`、`statsOf`；`MATERIALS`、`ITEMS`、`EQUIPMENT`；型別 `Party`、`Element`、`CharacterId`、`Slot`。
- Produces:
  - `SAVE_VERSION = 1`
  - `interface DungeonProgress { reachedFloor: number; explored: Record<string, string[]>; opened: string[]; bossDefeated: boolean }`（`explored` 以樓層號字串為鍵；`opened` 元素格式 `"樓層:x,y"`）
  - `interface GameState { version: 1; gold; inventory: Record<string, number>; sold: Record<string, number>; party: Party; dungeon: DungeonProgress; revealed: Record<string, Element[]> }`
  - `newGame(): GameState`（150 金錢、回復藥 ×3、歸還之燈 ×1）
  - `type TownResult = { ok: true; state: GameState } | { ok: false; reason: 'gold'|'locked'|'stock'|'invalid' }`
  - `addItem(inv, id, qty): void`
  - `sell(s, matId, qty)`、`isUnlocked(s, equipId)`、`buy(s, id)`、`equip(s, memberId, equipId)`、`unequip(s, memberId, slot)`
  - `innCost(p: Party)` = `10 + 2 × 已招募成員等級總和`；`rest(s)`
  - `reviveCost(level)` = `20 × level`；`revive(s, memberId)`
  - 所有函式都不改動傳入的 `s`。失敗時回傳原因，狀態不變。

- [ ] **Step 1: 寫 `engine/state.ts`**

```ts
import { newParty } from './party';
import type { Element, Party } from './types';

export const SAVE_VERSION = 1;

export interface DungeonProgress {
  reachedFloor: number;
  explored: Record<string, string[]>;
  opened: string[];
  bossDefeated: boolean;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  gold: number;
  inventory: Record<string, number>;
  sold: Record<string, number>;
  party: Party;
  dungeon: DungeonProgress;
  revealed: Record<string, Element[]>;
}

export function newGame(): GameState {
  return {
    version: SAVE_VERSION, gold: 150, inventory: { potion: 3, 'return-lamp': 1 }, sold: {}, party: newParty(),
    dungeon: { reachedFloor: 1, explored: {}, opened: [], bossDefeated: false }, revealed: {},
  };
}
```

- [ ] **Step 2: 寫失敗測試 `engine/town.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { buy, equip, innCost, isUnlocked, rest, revive, reviveCost, sell, unequip } from './town';
import { statsOf } from './party';

const withInv = (inv: Record<string, number>, gold = 150) => ({ ...newGame(), inventory: inv, gold });

describe('shop', () => {
  it('sells materials for gold and records the sale', () => {
    const r = sell(withInv({ moss: 3 }), 'moss', 2);
    expect(r.ok && [r.state.gold, r.state.inventory.moss, r.state.sold.moss]).toEqual([150 + 12, 1, 2]);
  });
  it('refuses to sell what you do not have, or non-materials', () => {
    const s = withInv({ moss: 1 });
    expect(sell(s, 'moss', 2)).toEqual({ ok: false, reason: 'stock' });
    expect(sell(s, 'potion', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(sell(s, 'moss', 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(s.inventory.moss).toBe(1);
  });
  it('unlocks equipment once enough materials were sold', () => {
    let s = withInv({ moss: 3 });
    expect(isUnlocked(s, 'moss-charm')).toBe(false);
    expect(isUnlocked(s, 'iron-sword')).toBe(true);
    const r = sell(s, 'moss', 3);
    if (!r.ok) throw new Error('sell failed');
    s = r.state;
    expect(isUnlocked(s, 'moss-charm')).toBe(true);
  });
  it('buys items and unlocked equipment', () => {
    const r = buy(withInv({}), 'potion');
    expect(r.ok && [r.state.gold, r.state.inventory.potion]).toEqual([130, 1]);
  });
  it('refuses locked gear, unknown ids and purchases you cannot afford, leaving state unchanged', () => {
    const s = withInv({}, 10);
    expect(buy(s, 'moss-charm')).toEqual({ ok: false, reason: 'locked' });
    expect(buy(s, 'nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(buy(s, 'potion')).toEqual({ ok: false, reason: 'gold' });
    expect(s.gold).toBe(10);
  });
});

describe('equipment', () => {
  it('equips from inventory and returns the old piece', () => {
    const a = equip(withInv({ 'iron-sword': 1, 'thorn-spear': 1 }), 'scarlet', 'iron-sword');
    if (!a.ok) throw new Error('equip failed');
    expect(a.state.party.roster.scarlet.equip.weapon).toBe('iron-sword');
    expect(a.state.inventory['iron-sword'] ?? 0).toBe(0);
    const b = equip(a.state, 'scarlet', 'thorn-spear');
    expect(b.ok && b.state.inventory['iron-sword']).toBe(1);
  });
  it('refuses missing stock and unknown gear', () => {
    expect(equip(withInv({}), 'scarlet', 'iron-sword')).toEqual({ ok: false, reason: 'stock' });
    expect(equip(withInv({ potion: 1 }), 'scarlet', 'potion')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('unequips and clamps HP to the new maximum', () => {
    const a = equip(withInv({ 'moss-charm': 1 }), 'scarlet', 'moss-charm');
    if (!a.ok) throw new Error('equip failed');
    a.state.party.roster.scarlet.hp = 63;
    const b = unequip(a.state, 'scarlet', 'accessory');
    expect(b.ok && [b.state.party.roster.scarlet.hp, b.state.inventory['moss-charm']]).toEqual([48, 1]);
    expect(unequip(b.ok ? b.state : a.state, 'scarlet', 'accessory')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('inn', () => {
  it('charges by level and restores the living to full', () => {
    const s = newGame();
    s.party.roster.scarlet.hp = 3;
    s.party.roster.noel.tp = 0;
    s.party.roster.liz.hp = 0;
    expect(innCost(s.party)).toBe(20);
    const r = rest(s);
    if (!r.ok) throw new Error('rest failed');
    expect(r.state.gold).toBe(130);
    expect(r.state.party.roster.scarlet.hp).toBe(48);
    expect(r.state.party.roster.noel.tp).toBe(30);
    expect(r.state.party.roster.liz.hp).toBe(0);
  });
  it('refuses to rest without gold', () => {
    expect(rest({ ...newGame(), gold: 5 })).toEqual({ ok: false, reason: 'gold' });
  });
  it('revives a fallen member at full HP for a fee', () => {
    const s = newGame();
    s.party.roster.liz.hp = 0;
    const r = revive(s, 'liz');
    expect(r.ok && [r.state.gold, r.state.party.roster.liz.hp]).toEqual([150 - reviveCost(1), statsOf(s.party.roster.liz).hp]);
    expect(revive(newGame(), 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(revive({ ...s, gold: 0 }, 'liz')).toEqual({ ok: false, reason: 'gold' });
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/town.test.ts`
Expected: FAIL，`Failed to resolve import "./town"`。

- [ ] **Step 4: 寫 `engine/town.ts`**

```ts
import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { statsOf } from './party';
import type { GameState } from './state';
import type { CharacterId, Member, Party, Slot } from './types';

export type TownResult = { ok: true; state: GameState } | { ok: false; reason: 'gold' | 'locked' | 'stock' | 'invalid' };

const fail = (reason: 'gold' | 'locked' | 'stock' | 'invalid'): TownResult => ({ ok: false, reason });

export function addItem(inv: Record<string, number>, id: string, qty: number): void {
  const n = (inv[id] ?? 0) + qty;
  if (n > 0) inv[id] = n;
  else delete inv[id];
}

function clampToMax(m: Member): void {
  const s = statsOf(m);
  m.hp = Math.min(m.hp, s.hp);
  m.tp = Math.min(m.tp, s.tp);
}

export function sell(s: GameState, matId: string, qty: number): TownResult {
  const mat = MATERIALS[matId];
  if (!mat || !Number.isInteger(qty) || qty <= 0) return fail('invalid');
  if ((s.inventory[matId] ?? 0) < qty) return fail('stock');
  const n = structuredClone(s);
  addItem(n.inventory, matId, -qty);
  n.sold[matId] = (n.sold[matId] ?? 0) + qty;
  n.gold += mat.price * qty;
  return { ok: true, state: n };
}

export function isUnlocked(s: GameState, equipId: string): boolean {
  const e = EQUIPMENT[equipId];
  return !!e && (e.unlock ?? []).every((u) => (s.sold[u.mat] ?? 0) >= u.qty);
}

export function buy(s: GameState, id: string): TownResult {
  const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price;
  if (price === undefined) return fail('invalid');
  if (EQUIPMENT[id] && !isUnlocked(s, id)) return fail('locked');
  if (s.gold < price) return fail('gold');
  const n = structuredClone(s);
  n.gold -= price;
  addItem(n.inventory, id, 1);
  return { ok: true, state: n };
}

export function equip(s: GameState, memberId: CharacterId, equipId: string): TownResult {
  const e = EQUIPMENT[equipId];
  if (!e) return fail('invalid');
  if ((s.inventory[equipId] ?? 0) <= 0) return fail('stock');
  const n = structuredClone(s);
  const m = n.party.roster[memberId];
  const prev = m.equip[e.slot];
  if (prev) addItem(n.inventory, prev, 1);
  addItem(n.inventory, equipId, -1);
  m.equip[e.slot] = equipId;
  clampToMax(m);
  return { ok: true, state: n };
}

export function unequip(s: GameState, memberId: CharacterId, slot: Slot): TownResult {
  const prev = s.party.roster[memberId].equip[slot];
  if (!prev) return fail('invalid');
  const n = structuredClone(s);
  const m = n.party.roster[memberId];
  delete m.equip[slot];
  addItem(n.inventory, prev, 1);
  clampToMax(m);
  return { ok: true, state: n };
}

export function innCost(p: Party): number {
  return 10 + 2 * p.recruited.reduce((sum, id) => sum + p.roster[id].level, 0);
}

export function rest(s: GameState): TownResult {
  const cost = innCost(s.party);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  n.gold -= cost;
  for (const id of n.party.recruited) {
    const m = n.party.roster[id];
    if (m.hp <= 0) continue;
    const st = statsOf(m);
    m.hp = st.hp;
    m.tp = st.tp;
  }
  return { ok: true, state: n };
}

export const reviveCost = (level: number): number => 20 * level;

export function revive(s: GameState, memberId: CharacterId): TownResult {
  const m = s.party.roster[memberId];
  if (!m || m.hp > 0) return fail('invalid');
  const cost = reviveCost(m.level);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  const st = statsOf(n.party.roster[memberId]);
  n.gold -= cost;
  n.party.roster[memberId].hp = st.hp;
  n.party.roster[memberId].tp = st.tp;
  return { ok: true, state: n };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/town.test.ts`
Expected: PASS（11 tests）。

- [ ] **Step 6: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/state.ts src/scripts/games/starlantern/engine/town.ts src/scripts/games/starlantern/engine/town.test.ts
git commit -m "feat(starlantern): game state, shop unlocks, equipment and inn"
```

---

### Task 9: 存讀檔

**Files:**
- Create: `engine/save.ts`, `engine/save.test.ts`

**Interfaces:**
- Consumes: `GameState`、`SAVE_VERSION`、`newGame`；`CHARACTER_IDS`；`MAX_LEVEL`。
- Produces:
  - `SAVE_KEY = 'starlantern-save'`、`BACKUP_KEY = 'starlantern-save-backup'`
  - `type SaveStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `saveGame(storage, s): boolean`（寫入失敗回傳 `false`，不丟例外）
  - `type LoadResult = { status: 'ok'; state: GameState } | { status: 'empty' } | { status: 'corrupt' } | { status: 'version' }`
  - `loadGame(storage): LoadResult`（`corrupt`、`version` 時把原始字串複製到 `BACKUP_KEY`）

- [ ] **Step 1: 寫失敗測試 `engine/save.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, loadGame, saveGame } from './save';
import { newGame } from './state';
import { memoryStorage } from './testing';

describe('save', () => {
  it('round-trips a game', () => {
    const st = memoryStorage();
    const g = newGame();
    g.gold = 777;
    g.dungeon.explored['1'] = ['1,1'];
    expect(saveGame(st, g)).toBe(true);
    expect(loadGame(st)).toEqual({ status: 'ok', state: g });
  });
  it('reports an empty slot', () => {
    expect(loadGame(memoryStorage())).toEqual({ status: 'empty' });
  });
  it('backs up unreadable JSON', () => {
    const st = memoryStorage({ [SAVE_KEY]: '{oops' });
    expect(loadGame(st)).toEqual({ status: 'corrupt' });
    expect(st.map.get(BACKUP_KEY)).toBe('{oops');
  });
  it('backs up a different version', () => {
    const raw = JSON.stringify({ ...newGame(), version: 0 });
    const st = memoryStorage({ [SAVE_KEY]: raw });
    expect(loadGame(st)).toEqual({ status: 'version' });
    expect(st.map.get(BACKUP_KEY)).toBe(raw);
  });
  it('rejects structurally broken saves', () => {
    const g = newGame() as unknown as { party: { roster: Record<string, unknown> } };
    delete g.party.roster.bobby;
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(g) }))).toEqual({ status: 'corrupt' });
    const h = { ...newGame(), gold: -5 };
    expect(loadGame(memoryStorage({ [SAVE_KEY]: JSON.stringify(h) }))).toEqual({ status: 'corrupt' });
    expect(loadGame(memoryStorage({ [SAVE_KEY]: 'null' }))).toEqual({ status: 'corrupt' });
  });
  it('survives storage that throws (private mode)', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(saveGame(throwing, newGame())).toBe(false);
    expect(loadGame(throwing)).toEqual({ status: 'empty' });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/save.test.ts`
Expected: FAIL，`Failed to resolve import "./save"`。

- [ ] **Step 3: 寫 `engine/save.ts`**

```ts
import { CHARACTER_IDS } from '../data/characters';
import { MAX_LEVEL } from './party';
import { SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'starlantern-save';
export const BACKUP_KEY = 'starlantern-save-backup';

export type SaveStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type LoadResult = { status: 'ok'; state: GameState } | { status: 'empty' } | { status: 'corrupt' } | { status: 'version' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isCounts = (v: unknown) => isObj(v) && Object.values(v).every(isCount);
const isIdList = (v: unknown, nullable = false) =>
  Array.isArray(v) && v.every((x) => (nullable && x === null) || CHARACTER_IDS.includes(x));

function isValid(d: Record<string, unknown>): boolean {
  if (!isCount(d.gold) || !isCounts(d.inventory) || !isCounts(d.sold) || !isObj(d.revealed)) return false;
  const p = d.party;
  if (!isObj(p) || !isObj(p.roster) || !isIdList(p.recruited)) return false;
  if (!isIdList(p.front, true) || !isIdList(p.back, true) || (p.front as unknown[]).length !== 3 || (p.back as unknown[]).length !== 2) return false;
  for (const id of CHARACTER_IDS) {
    const m = (p.roster as Record<string, unknown>)[id];
    if (!isObj(m) || m.id !== id || !isObj(m.equip)) return false;
    if (!Number.isInteger(m.level) || (m.level as number) < 1 || (m.level as number) > MAX_LEVEL) return false;
    if (!isCount(m.exp) || !isCount(m.hp) || !isCount(m.tp)) return false;
  }
  const g = d.dungeon;
  if (!isObj(g) || !Number.isInteger(g.reachedFloor) || (g.reachedFloor as number) < 1 || (g.reachedFloor as number) > 3) return false;
  return isObj(g.explored) && Array.isArray(g.opened) && typeof g.bossDefeated === 'boolean';
}

export function saveGame(storage: SaveStorage, s: GameState): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function backup(storage: SaveStorage, raw: string): void {
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* storage full or denied: nothing more we can do */ }
}

export function loadGame(storage: SaveStorage): LoadResult {
  let raw: string | null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { status: 'empty' }; }
  if (raw === null) return { status: 'empty' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { backup(storage, raw); return { status: 'corrupt' }; }
  if (!isObj(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  if (data.version !== SAVE_VERSION) { backup(storage, raw); return { status: 'version' }; }
  if (!isValid(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  return { status: 'ok', state: data as unknown as GameState };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/save.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 5: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/save.ts src/scripts/games/starlantern/engine/save.test.ts
git commit -m "feat(starlantern): versioned save with corruption backup"
```

---

### Task 10: 遊戲狀態機 `Game`

**Files:**
- Create: `engine/game.ts`, `engine/game.test.ts`

**Interfaces:**
- Consumes: Task 2–9 全部；`FLOORS`；`pick`。
- Produces:
  - `type Phase = 'town'|'map'|'battle'|'clear'`
  - `type Notice = 'save-reset'|'wipe'|'saved'|'save-failed'`
  - `type MoveResult = { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' } | { kind: 'entrance' } | { kind: 'floor'; floor: number } | { kind: 'chest'; item: string; qty: number }`
  - `interface BattleEnd { outcome: 'win'|'lose'|'fled'; exp: number; gold: number; drops: Record<string, number>; levelUps: { id: CharacterId; levels: number; learned: string[] }[] }`
  - `class Game`：
    - 欄位（皆 public，可讀）：`state: GameState`、`phase: Phase`、`floor: number`、`pos: Pos`、`encounter: number`、`battle: BattleState | null`、`notice: Notice | null`
    - `constructor(rng: Rng, storage: SaveStorage | null, state?: GameState)`
    - `static boot(rng, storage): Game`
    - `map(floor = this.floor): FloorMap`
    - `danger(): Danger`
    - `onEntrance(): boolean`
    - `depart(floor): { ok: true } | { ok: false; reason: 'locked'|'party-down'|'phase' }`
    - `move(dir: Dir): MoveResult`
    - `returnToTown(): boolean`（只在入口格）
    - `useReturnLamp(): boolean`
    - `submitRound(actions: Record<string, Action>): { battle: BattleState; end: BattleEnd | null } | null`
    - `rest(): TownResult`（成功後存檔並設 `notice`）
    - `apply(r: TownResult): TownResult`（城鎮操作成功時套用新狀態）
    - `restartAfterClear(): void`（通關畫面回城鎮）

狀態切換：
- 城鎮 →（`depart`）→ 地圖。出戰成員全倒則拒絕（`party-down`）；樓層超過已到達則拒絕（`locked`）。
- 地圖：只在 `phase === 'map'` 時移動。走到地板或門才累積遇敵；樓梯、入口、寶箱、頭目格不累積。`>` 到下一層入口並更新 `reachedFloor`；`<` 到上一層的 `>`；`B`（頭目未擊敗）開頭目戰。
- 戰鬥：勝利 → 發獎勵（金錢、素材、經驗）並回地圖；頭目勝利 → `bossDefeated = true`，`phase = 'clear'`；逃跑 → 回地圖；全滅 → 讀上次存檔（沒有就開新檔），回城鎮並設 `notice = 'wipe'`。
- 迷宮內的探索紀錄、HP、道具在住旅館存檔前都只存在記憶體；全滅就回到上次存檔。

- [ ] **Step 1: 寫失敗測試 `engine/game.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SAVE_KEY, saveGame } from './save';
import { newGame } from './state';
import { constRng, memoryStorage } from './testing';
import { mulberry32 } from './rng';

const calm = () => constRng(0.99); // step gain 12 on floor 1, never rolls an early encounter
const inMap = (floor = 1, rng = calm(), storage = memoryStorage()) => {
  const g = new Game(rng, storage);
  g.state.dungeon.reachedFloor = 3;
  expect(g.depart(floor)).toEqual({ ok: true });
  return g;
};

describe('boot', () => {
  it('starts a new game in town on an empty slot', () => {
    const g = Game.boot(calm(), memoryStorage());
    expect([g.phase, g.notice, g.state.gold]).toEqual(['town', null, 150]);
  });
  it('flags a reset when the save is unreadable', () => {
    const g = Game.boot(calm(), memoryStorage({ [SAVE_KEY]: '{bad' }));
    expect([g.phase, g.notice]).toEqual(['town', 'save-reset']);
  });
  it('works without storage', () => {
    expect(Game.boot(calm(), null).phase).toBe('town');
  });
});

describe('departing', () => {
  it('enters a reached floor at its entrance and reveals around it', () => {
    const g = inMap(1);
    expect([g.phase, g.pos]).toEqual(['map', { x: 1, y: 1 }]);
    expect(g.state.dungeon.explored['1']).toContain('2,2');
    expect(g.onEntrance()).toBe(true);
  });
  it('refuses unreached floors and a downed party', () => {
    const g = new Game(calm(), null);
    expect(g.depart(2)).toEqual({ ok: false, reason: 'locked' });
    for (const id of ['scarlet', 'chizuru', 'liz', 'noel', 'selene'] as const) g.state.party.roster[id].hp = 0;
    expect(g.depart(1)).toEqual({ ok: false, reason: 'party-down' });
    expect(g.phase).toBe('town');
  });
});

describe('moving', () => {
  it('ignores movement outside the map phase', () => {
    expect(new Game(calm(), null).move('right')).toEqual({ kind: 'ignored' });
  });
  it('is blocked by walls without filling the gauge', () => {
    const g = inMap(1);
    expect(g.move('up')).toEqual({ kind: 'blocked' });
    expect(g.encounter).toBe(0);
  });
  it('fills the gauge on floor tiles and starts a battle at the cap', () => {
    const g = inMap(1);
    expect(g.move('right')).toEqual({ kind: 'moved' });
    expect(g.encounter).toBe(12);
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    expect(g.phase).toBe('battle');
    expect(g.battle!.enemies.every((e) => e.defId !== 'lanterneater')).toBe(true);
    expect(g.move('right')).toEqual({ kind: 'ignored' });
  });
  it('opens a chest once', () => {
    const g = inMap(1);
    g.pos = { x: 3, y: 4 };
    expect(g.move('up')).toEqual({ kind: 'chest', item: 'old-coin', qty: 2 });
    expect(g.state.inventory['old-coin']).toBe(2);
    g.move('down');
    expect(g.move('up')).toEqual({ kind: 'moved' });
    expect(g.state.inventory['old-coin']).toBe(2);
  });
  it('takes stairs down and back up', () => {
    const g = new Game(calm(), null);
    g.depart(1);
    g.pos = { x: 13, y: 8 };
    expect(g.move('down')).toEqual({ kind: 'floor', floor: 2 });
    expect([g.floor, g.pos, g.state.dungeon.reachedFloor]).toEqual([2, { x: 1, y: 1 }, 2]);
    expect(g.move('right')).toEqual({ kind: 'floor', floor: 1 });
    expect([g.floor, g.pos]).toEqual([1, { x: 13, y: 9 }]);
  });
  it('halves the gauge gain with stealth', () => {
    const g = inMap(1);
    g.state.party.roster.liz.level = 2;
    g.move('right');
    expect(g.encounter).toBe(6);
  });
});

describe('returning to town', () => {
  it('only from the entrance tile', () => {
    const g = inMap(1);
    g.move('right');
    expect(g.returnToTown()).toBe(false);
    g.move('left');
    expect(g.returnToTown()).toBe(true);
    expect([g.phase, g.encounter]).toEqual(['town', 0]);
  });
  it('anywhere with a return lamp, which is consumed', () => {
    const g = inMap(1);
    g.move('right');
    expect(g.useReturnLamp()).toBe(true);
    expect([g.phase, g.state.inventory['return-lamp'] ?? 0]).toEqual(['town', 0]);
    g.depart(1);
    expect(g.useReturnLamp()).toBe(false);
  });
});

describe('battles', () => {
  const startBattle = (seed = 1, storage = memoryStorage()) => {
    const g = inMap(1, mulberry32(seed), storage);
    g.encounter = 99;
    expect(g.move('right')).toEqual({ kind: 'battle' });
    return g;
  };
  it('pays out on victory and returns to the map', () => {
    const g = startBattle();
    for (const e of g.battle!.enemies) e.hp = 1;
    const gold = g.state.gold;
    const actions = Object.fromEntries(g.battle!.party.map((c) => [c.key, { kind: 'attack' as const, target: 'e0' }]));
    const r = g.submitRound(actions)!;
    expect(r.end!.outcome).toBe('win');
    expect(g.phase).toBe('map');
    expect(g.battle).toBeNull();
    expect(g.state.gold).toBe(gold + r.end!.gold);
    const sc = g.state.party.roster.scarlet; // a floor-1 fight gives < 60 exp, so at most one level-up (15 exp)
    expect(sc.exp + (sc.level - 1) * 15).toBe(r.end!.exp);
  });
  it('keeps fighting while the outcome is open', () => {
    const g = startBattle();
    const r = g.submitRound({})!;
    expect(r.end).toBeNull();
    expect(g.phase).toBe('battle');
  });
  it('reloads the inn save on a wipe', () => {
    const storage = memoryStorage();
    saveGame(storage, { ...newGame(), gold: 999 });
    const g = startBattle(1, storage);
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    const r = g.submitRound({})!;
    expect(r.end!.outcome).toBe('lose');
    expect([g.phase, g.notice, g.state.gold]).toEqual(['town', 'wipe', 999]);
  });
  it('starts over when wiping without a save', () => {
    const g = startBattle();
    g.state.gold = 5;
    for (const c of g.battle!.party) { c.hp = 0; c.alive = false; }
    g.submitRound({});
    expect([g.phase, g.state.gold]).toEqual(['town', 150]);
  });
  it('clears the game after the boss', () => {
    const g = inMap(3);
    g.pos = { x: 9, y: 11 };
    expect(g.move('right')).toEqual({ kind: 'boss' });
    expect(g.battle!.boss).toBe(true);
    for (const e of g.battle!.enemies) { e.hp = 0; e.alive = false; }
    expect(g.submitRound({})!.end!.outcome).toBe('win');
    expect([g.phase, g.state.dungeon.bossDefeated]).toEqual(['clear', true]);
    g.restartAfterClear();
    expect(g.phase).toBe('town');
  });
});

describe('inn', () => {
  it('saves after resting', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage);
    expect(g.rest().ok).toBe(true);
    expect(g.notice).toBe('saved');
    expect(storage.map.has(SAVE_KEY)).toBe(true);
  });
  it('reports a failed save without losing the rest', () => {
    const g = new Game(calm(), { getItem: () => null, setItem: () => { throw new Error('full'); } });
    expect(g.rest().ok).toBe(true);
    expect([g.notice, g.state.gold]).toEqual(['save-failed', 130]);
  });
  it('does not save when the rest is refused', () => {
    const storage = memoryStorage();
    const g = new Game(calm(), storage);
    g.state.gold = 0;
    expect(g.rest()).toEqual({ ok: false, reason: 'gold' });
    expect(storage.map.has(SAVE_KEY)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/game.test.ts`
Expected: FAIL，`Failed to resolve import "./game"`。

- [ ] **Step 3: 寫 `engine/game.ts`**

```ts
import { FLOORS } from '../data/floors';
import { createBattle, resolveRound, rewards, writeBack, type Action, type BattleState } from './battle';
import { advance, danger, type Danger } from './encounter';
import { parseFloor, posKey, reveal, step, tileAt, type Dir, type FloorMap } from './map';
import { activeIds, awardExp, hasPassive } from './party';
import { pick, type Rng } from './rng';
import { loadGame, saveGame, type SaveStorage } from './save';
import { newGame, type GameState } from './state';
import { addItem, rest as innRest, type TownResult } from './town';
import type { CharacterId, Pos } from './types';

export type Phase = 'town' | 'map' | 'battle' | 'clear';
export type Notice = 'save-reset' | 'wipe' | 'saved' | 'save-failed';
export type MoveResult =
  | { kind: 'ignored' } | { kind: 'blocked' } | { kind: 'moved' } | { kind: 'battle' } | { kind: 'boss' }
  | { kind: 'entrance' } | { kind: 'floor'; floor: number } | { kind: 'chest'; item: string; qty: number };
export interface BattleEnd {
  outcome: 'win' | 'lose' | 'fled'; exp: number; gold: number; drops: Record<string, number>;
  levelUps: { id: CharacterId; levels: number; learned: string[] }[];
}

const MAPS: FloorMap[] = FLOORS.map((f) => parseFloor(f.rows));

export class Game {
  state: GameState;
  phase: Phase = 'town';
  floor = 1;
  pos: Pos = { x: 0, y: 0 };
  encounter = 0;
  battle: BattleState | null = null;
  notice: Notice | null = null;

  constructor(readonly rng: Rng, readonly storage: SaveStorage | null, state?: GameState) {
    this.state = state ?? newGame();
  }

  static boot(rng: Rng, storage: SaveStorage | null): Game {
    if (!storage) return new Game(rng, null);
    const r = loadGame(storage);
    const g = new Game(rng, storage, r.status === 'ok' ? r.state : undefined);
    if (r.status === 'corrupt' || r.status === 'version') g.notice = 'save-reset';
    return g;
  }

  map(floor = this.floor): FloorMap {
    return MAPS[floor - 1];
  }

  danger(): Danger {
    return danger(this.encounter);
  }

  onEntrance(): boolean {
    return this.phase === 'map' && tileAt(this.map(), this.pos) === 'entrance';
  }

  depart(floor: number): { ok: true } | { ok: false; reason: 'locked' | 'party-down' | 'phase' } {
    if (this.phase !== 'town') return { ok: false, reason: 'phase' };
    if (floor < 1 || floor > this.state.dungeon.reachedFloor) return { ok: false, reason: 'locked' };
    if (!activeIds(this.state.party).some((id) => this.state.party.roster[id].hp > 0)) return { ok: false, reason: 'party-down' };
    this.floor = floor;
    this.pos = { ...this.map().entrance };
    this.encounter = 0;
    this.phase = 'map';
    this.revealHere();
    return { ok: true };
  }

  move(dir: Dir): MoveResult {
    if (this.phase !== 'map') return { kind: 'ignored' };
    const r = step(this.map(), this.pos, dir);
    if (!r.moved) return { kind: 'blocked' };
    this.pos = r.pos;
    this.revealHere();
    switch (r.tile) {
      case 'down': return this.changeFloor(this.floor + 1, 'entrance');
      case 'up': return this.changeFloor(this.floor - 1, 'down');
      case 'entrance': return { kind: 'entrance' };
      case 'boss':
        if (this.state.dungeon.bossDefeated) return { kind: 'moved' };
        this.startBattle(['lanterneater'], true);
        return { kind: 'boss' };
      case 'chest': return this.openChest() ?? { kind: 'moved' };
      default: {
        const mod = hasPassive(this.state.party, 'encounterDown') ? 0.5 : 1;
        const g = advance(this.encounter, this.rng, FLOORS[this.floor - 1].rate, mod);
        this.encounter = g.value;
        if (!g.encounter) return { kind: 'moved' };
        this.startBattle(pick(this.rng, FLOORS[this.floor - 1].encounters), false);
        return { kind: 'battle' };
      }
    }
  }

  returnToTown(): boolean {
    if (!this.onEntrance()) return false;
    this.toTown();
    return true;
  }

  useReturnLamp(): boolean {
    if (this.phase !== 'map' || (this.state.inventory['return-lamp'] ?? 0) <= 0) return false;
    addItem(this.state.inventory, 'return-lamp', -1);
    this.toTown();
    return true;
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
    const empty: BattleEnd = { outcome: b.outcome, exp: 0, gold: 0, drops: {}, levelUps: [] };
    if (b.outcome === 'fled') { this.phase = 'map'; return { battle: b, end: empty }; }
    if (b.outcome === 'lose') { this.wipe(); return { battle: b, end: empty }; }
    const rw = rewards(b, this.rng, hasPassive(this.state.party, 'dropBoost'));
    this.state.gold += rw.gold;
    for (const [mat, n] of Object.entries(rw.drops)) addItem(this.state.inventory, mat, n);
    const survivors = b.party.filter((c) => c.alive).map((c) => c.key as CharacterId);
    const awarded = awardExp(this.state.party, rw.exp, survivors);
    this.state.party = awarded.party;
    if (b.boss) { this.state.dungeon.bossDefeated = true; this.phase = 'clear'; }
    else this.phase = 'map';
    return { battle: b, end: { outcome: 'win', ...rw, levelUps: awarded.results.filter((x) => x.levels > 0) } };
  }

  rest(): TownResult {
    const r = innRest(this.state);
    if (!r.ok) return r;
    this.state = r.state;
    this.notice = this.storage && saveGame(this.storage, this.state) ? 'saved' : 'save-failed';
    return r;
  }

  apply(r: TownResult): TownResult {
    if (r.ok) this.state = r.state;
    return r;
  }

  restartAfterClear(): void {
    if (this.phase === 'clear') this.phase = 'town';
  }

  private toTown(): void {
    this.phase = 'town';
    this.encounter = 0;
  }

  private revealHere(): void {
    const key = String(this.floor);
    this.state.dungeon.explored[key] = reveal(this.state.dungeon.explored[key] ?? [], this.map(), this.pos);
  }

  private changeFloor(floor: number, at: 'entrance' | 'down'): MoveResult {
    this.floor = floor;
    const m = this.map();
    this.pos = { ...(at === 'entrance' ? m.entrance : m.down ?? m.entrance) };
    this.state.dungeon.reachedFloor = Math.max(this.state.dungeon.reachedFloor, floor);
    this.revealHere();
    return { kind: 'floor', floor };
  }

  private openChest(): MoveResult | null {
    const id = `${this.floor}:${posKey(this.pos)}`;
    if (this.state.dungeon.opened.includes(id)) return null;
    const index = this.map().chests.findIndex((c) => c.x === this.pos.x && c.y === this.pos.y);
    const loot = FLOORS[this.floor - 1].chestLoot[index];
    if (!loot) return null;
    this.state.dungeon.opened.push(id);
    addItem(this.state.inventory, loot.item, loot.qty);
    return { kind: 'chest', item: loot.item, qty: loot.qty };
  }

  private startBattle(enemyIds: string[], boss: boolean): void {
    this.battle = createBattle({ party: this.state.party, enemyIds, boss, inventory: this.state.inventory, revealed: this.state.revealed });
    this.phase = 'battle';
  }

  private wipe(): void {
    const r = this.storage ? loadGame(this.storage) : { status: 'empty' as const };
    this.state = r.status === 'ok' ? r.state : newGame();
    this.phase = 'town';
    this.encounter = 0;
    this.notice = 'wipe';
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/game.test.ts`
Expected: PASS（22 tests）。

- [ ] **Step 5: 跑整個 starlantern 測試**

Run: `npx vitest run src/scripts/games/starlantern`
Expected: 全部 PASS。

- [ ] **Step 6: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/engine/game.ts src/scripts/games/starlantern/engine/game.test.ts
git commit -m "feat(starlantern): game state machine tying town, map and battle"
```

---

### Task 11: 文字、按鍵對應、音效

**Files:**
- Create: `data/text.zh-TW.ts`, `input/keymap.ts`, `input/keymap.test.ts`, `audio/SoundManager.ts`
- Modify: `src/scripts/games/audio-sfx-volume.test.ts`（CASES 加一筆）

**Interfaces:**
- Produces:
  - `T`（全部介面文字）
  - `type InputAction = 'up'|'down'|'left'|'right'|'confirm'|'cancel'`；`mapKey(key): InputAction | null`；`bindKeys(target: Window, handler): () => void`（焦點在 `input`、`select`、`textarea` 時不處理）
  - `class SoundManager`：無參數建構子、`ensure()`、`master` 欄位、`toggle()`，音效方法 `step() bump() stairs() chest() encounter() menu() hit() weak() heal() ko() win() lose()`

- [ ] **Step 1: 寫 `data/text.zh-TW.ts`**

```ts
import type { BuffStat, Slot, StatKey } from '../engine/types';

const STAT: Record<StatKey, string> = { hp: 'HP', tp: 'TP', atk: '攻擊', def: '防禦', mag: '魔力', res: '魔防', spd: '速度' };
const SLOT: Record<Slot, string> = { weapon: '武器', armor: '防具', accessory: '飾品' };

export const T = {
  stat: STAT,
  slot: SLOT,
  gold: (n: number) => `${n} G`,
  tabs: { guild: '公會', shop: '商店', inn: '旅館', depart: '出發' },
  guild: {
    formation: '編隊', front: (i: number) => `前排 ${i}`, back: (i: number) => `後排 ${i}`, none: '（空）',
    recruit: (title: string, name: string) => `招募 ${title} ${name}`, members: '隊員與裝備', unequipped: '（未裝備）',
    level: (lv: number) => `Lv ${lv}`,
  },
  shop: {
    sell: '賣出素材', sellOne: '賣 1 個', sellAll: '全部賣出', buy: '購買', nothing: '沒有可賣的素材',
    needs: (name: string, n: number) => `需賣出 ${name} ×${n}`, price: (name: string, n: number) => `${name}（${n} G）`,
  },
  inn: { rest: (cost: number) => `住宿並存檔（${cost} G）`, revive: (name: string, cost: number) => `復活 ${name}（${cost} G）` },
  departTo: (n: number, name: string) => `前往第 ${n} 層：${name}`,
  reasons: {
    gold: '金錢不足', locked: '尚未解鎖', stock: '數量不足', invalid: '無法執行', phase: '現在不能這麼做',
    'party-down': '出戰成員全部倒下，無法出發', size: '編隊格數錯誤', 'not-recruited': '尚未招募',
    duplicate: '同一人不能重複上陣', empty: '至少要有一人出戰',
  } as Record<string, string>,
  notices: {
    'save-reset': '存檔無法讀取，已開始新遊戲', wipe: '全滅……已回到上次住宿的時間點',
    saved: '已存檔', 'save-failed': '存檔失敗：瀏覽器不允許儲存',
  },
  map: {
    returnTown: '回城', lamp: (n: number) => `歸還之燈 ×${n}`,
    danger: { green: '安全', yellow: '注意', red: '危險' },
    floor: (n: number, name: string) => `第 ${n} 層　${name}`,
    chest: (name: string, qty: number) => `打開寶箱：${name} ×${qty}`,
    dirs: { up: '↑', down: '↓', left: '←', right: '→' },
  },
  cmd: {
    attack: '攻擊', skill: '技能', defend: '防禦', item: '道具', escape: '逃跑', auto: '全員攻擊', back: '返回',
    choose: (name: string) => `${name} 的行動`, target: '選擇目標', tp: (n: number) => `${n} TP`,
  },
  battle: {
    win: '勝利！', lose: '全滅……', fled: '成功逃跑', cont: '繼續', poison: '毒', sleep: '睡眠',
    exp: (n: number) => `經驗值 +${n}`, gold: (n: number) => `金錢 +${n}`, drop: (name: string, n: number) => `${name} ×${n}`,
    levelUp: (name: string, lv: number) => `${name} 升到 Lv ${lv}`, learned: (name: string, skill: string) => `${name} 學會了「${skill}」`,
    weak: (els: string) => `已知弱點：${els}`,
  },
  element: { phys: '物理', fire: '火', ice: '冰', thunder: '雷' },
  log: {
    act: (who: string, label: string) => `${who}：${label}`,
    damage: (who: string, n: number, mult: number) => `${who} 受到 ${n} 傷害${mult > 1 ? '（弱點）' : mult < 1 ? '（抗性）' : ''}`,
    ko: (who: string) => `${who} 倒下了`,
    heal: (who: string, n: number) => `${who} 回復 ${n} HP`,
    tp: (who: string, n: number) => `${who} 回復 ${n} TP`,
    revive: (who: string) => `${who} 復活了`,
    cure: (who: string) => `${who} 的異常狀態解除了`,
    status: (who: string, s: 'poison' | 'sleep') => `${who}${s === 'poison' ? '中毒了' : '睡著了'}`,
    resist: (who: string) => `${who} 沒有受到影響`,
    buff: (who: string, stat: BuffStat, pct: number) => `${who} 的${STAT[stat]}${pct > 0 ? '提升' : '下降'}了`,
    taunt: (who: string) => `${who} 吸引了敵人的注意`,
    turret: (who: string) => `${who} 設置了砲台`,
    asleep: (who: string) => `${who} 正在睡覺`,
    noTp: (who: string) => `${who} 的 TP 不足`,
    escape: (ok: boolean) => (ok ? '成功逃跑了' : '逃跑失敗'),
    poison: (who: string, n: number) => `${who} 因毒受到 ${n} 傷害`,
  },
  clear: { title: '星燈重新亮起', body: '燈喰之獸倒下了。暮霧散去，露米亞迎來久違的晨光。', back: '回到城鎮' },
};
```

- [ ] **Step 2: 寫按鍵的失敗測試 `input/keymap.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { bindKeys, mapKey } from './keymap';

describe('keymap', () => {
  it('maps arrows, WASD, confirm and cancel', () => {
    expect(mapKey('ArrowUp')).toBe('up');
    expect(mapKey('d')).toBe('right');
    expect(mapKey('S')).toBe('down');
    expect(mapKey('Enter')).toBe('confirm');
    expect(mapKey('Escape')).toBe('cancel');
    expect(mapKey('q')).toBeNull();
  });
  it('dispatches handled keys, ignores form fields and unbinds', () => {
    const fn = vi.fn();
    const off = bindKeys(window, fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    const sel = document.createElement('select');
    document.body.append(sel);
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(fn.mock.calls).toEqual([['left']]);
    sel.remove();
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/input/keymap.test.ts`
Expected: FAIL，`Failed to resolve import "./keymap"`。

- [ ] **Step 4: 寫 `input/keymap.ts`**

```ts
export type InputAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';

const KEYS: Record<string, InputAction> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  Enter: 'confirm', ' ': 'confirm', z: 'confirm', Z: 'confirm', Escape: 'cancel', x: 'cancel', X: 'cancel',
};

export function mapKey(key: string): InputAction | null {
  return KEYS[key] ?? null;
}

export function bindKeys(target: Window, handler: (a: InputAction) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
    const a = mapKey(e.key);
    if (!a) return;
    e.preventDefault();
    handler(a);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/input/keymap.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 6: 音量測試先加上 starlantern（Red）**

先讀 `src/scripts/games/audio-sfx-volume.test.ts` 和 `src/scripts/games/witchrun/audio/SoundManager.ts`，了解假 `AudioContext` 提供哪些方法。然後在 import 區加：

```ts
import { SoundManager as Starlantern } from './starlantern/audio/SoundManager';
```
並在 `CASES` 陣列最後加：
```ts
  { name: 'starlantern', Cls: Starlantern, base: 1.0 },
```

Run: `npx vitest run src/scripts/games/audio-sfx-volume.test.ts`
Expected: FAIL，`Failed to resolve import "./starlantern/audio/SoundManager"`。

- [ ] **Step 7: 寫 `audio/SoundManager.ts`**

`ensure()` 建立 `AudioContext` 與 `master` 的方式要和 witchrun 的寫法一致，假 `AudioContext` 才對得上。若 witchrun 的寫法和下方不同，以 witchrun 為準調整。

```ts
const BASE = 1.0;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private sfxVolume = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', (e) => {
        this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
        if (this.master) this.master.gain.value = BASE * this.sfxVolume;
      });
    }
  }

  ensure(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = BASE * this.sfxVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.12, freqEnd?: number): void {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const end = t + durMs / 1000;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, end);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(end);
  }

  step(): void { this.blip(180, 40, 'triangle', 0.06); }
  bump(): void { this.blip(90, 70, 'square', 0.08); }
  stairs(): void { this.blip(330, 160, 'triangle', 0.1, 660); }
  chest(): void { this.blip(660, 90, 'square', 0.1); this.blip(990, 160, 'square', 0.08); }
  encounter(): void { this.blip(220, 260, 'sawtooth', 0.12, 880); }
  menu(): void { this.blip(520, 40, 'square', 0.06); }
  hit(): void { this.blip(160, 90, 'square', 0.12, 60); }
  weak(): void { this.blip(240, 140, 'sawtooth', 0.14, 70); }
  heal(): void { this.blip(520, 220, 'sine', 0.1, 1040); }
  ko(): void { this.blip(300, 300, 'triangle', 0.12, 50); }
  win(): void { this.blip(523, 120, 'square', 0.1); this.blip(784, 260, 'square', 0.1); }
  lose(): void { this.blip(220, 500, 'triangle', 0.12, 55); }
}
```

- [ ] **Step 8: 跑音量測試確認通過**

Run: `npx vitest run src/scripts/games/audio-sfx-volume.test.ts`
Expected: PASS（含 starlantern 的案例）。

- [ ] **Step 9: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern/data/text.zh-TW.ts src/scripts/games/starlantern/input src/scripts/games/starlantern/audio src/scripts/games/audio-sfx-volume.test.ts
git commit -m "feat(starlantern): ui text, key bindings and synth sfx"
```

---

### Task 12: 頁面、樣式與城鎮選單

**Files:**
- Create: `src/pages/games/starlantern.astro`, `src/styles/_starlantern.scss`
- Create: `ui/dom.ts`, `ui/town.ts`, `ui/town.test.ts`

**Interfaces:**
- Consumes: `Game`、`T`、資料表、town 函式、party 函式。
- Produces:
  - `ui/dom.ts`：`interface UiHooks { refresh(): void; say(msg: string): void; sfx: SoundManager; move(dir: Dir): void }`；`el(tag, opts?, children?)`；`button(label, onClick, opts?)`；`meter(value, max, cls)`；`itemName(id): string`
  - `ui/town.ts`：`type TownTab = 'guild'|'shop'|'inn'|'depart'`；`renderTown(root: HTMLElement, game: Game, ui: UiHooks): void`
  - DOM id（e2e 依賴，不可改名）：`#sl-tab-guild`、`#sl-tab-shop`、`#sl-tab-inn`、`#sl-tab-depart`、`#sl-depart-<n>`、`#sl-rest`、`#sl-revive-<id>`、`#sl-recruit-<id>`；編隊下拉選單在 `.sl-formation select`。

- [ ] **Step 1: 寫 `ui/dom.ts`**

```ts
import type { SoundManager } from '../audio/SoundManager';
import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import type { Dir } from '../engine/map';

export interface UiHooks { refresh(): void; say(msg: string): void; sfx: SoundManager; move(dir: Dir): void }

interface ElOpts { id?: string; class?: string; text?: string; attrs?: Record<string, string> }

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts: ElOpts = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.id) node.id = opts.id;
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function button(label: string, onClick: () => void, opts: { id?: string; class?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = el('button', { id: opts.id, class: opts.class ?? 'sl-btn', text: label, attrs: { type: 'button' } });
  b.disabled = !!opts.disabled;
  b.addEventListener('click', onClick);
  return b;
}

export function meter(value: number, max: number, cls: string): HTMLMeterElement {
  const m = el('meter', { class: cls });
  m.min = 0;
  m.max = Math.max(1, max);
  m.value = value;
  return m;
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? MATERIALS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
}
```

- [ ] **Step 2: 寫城鎮的失敗測試 `ui/town.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderTown } from './town';
import { Game } from '../engine/game';
import { constRng, memoryStorage } from '../engine/testing';
import type { UiHooks } from './dom';

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.99), storage);
  const root = document.createElement('div');
  const hooks: UiHooks = { refresh: vi.fn(() => renderTown(root, game, hooks)), say: vi.fn(), move: vi.fn(), sfx: { menu: vi.fn(), bump: vi.fn() } as never };
  renderTown(root, game, hooks);
  const click = (sel: string) => (root.querySelector(sel) as HTMLButtonElement).click();
  return { game, root, hooks, click, storage };
}

describe('town ui', () => {
  it('lists only reached floors and departs', () => {
    const { game, root, click } = setup();
    click('#sl-tab-depart');
    expect(root.querySelectorAll('[id^="sl-depart-"]')).toHaveLength(1);
    click('#sl-depart-1');
    expect(game.phase).toBe('map');
  });
  it('explains why departure is refused', () => {
    const { game, click, hooks } = setup();
    for (const id of ['scarlet', 'chizuru', 'liz', 'noel', 'selene'] as const) game.state.party.roster[id].hp = 0;
    click('#sl-tab-depart');
    click('#sl-depart-1');
    expect(game.phase).toBe('town');
    expect(hooks.say).toHaveBeenCalledWith('出戰成員全部倒下，無法出發');
  });
  it('rests and saves at the inn', () => {
    const { game, click, storage } = setup();
    click('#sl-tab-inn');
    click('#sl-rest');
    expect(game.state.gold).toBe(130);
    expect(storage.map.has('starlantern-save')).toBe(true);
  });
  it('rejects a duplicate formation and keeps the old one', () => {
    const { game, root, click, hooks } = setup();
    click('#sl-tab-guild');
    const selects = root.querySelectorAll<HTMLSelectElement>('.sl-formation select');
    expect(selects).toHaveLength(5);
    selects[1].value = 'scarlet';
    selects[1].dispatchEvent(new Event('change'));
    expect(game.state.party.front).toEqual(['scarlet', 'chizuru', 'liz']);
    expect(hooks.say).toHaveBeenCalledWith('同一人不能重複上陣');
  });
  it('recruits a new member', () => {
    const { game, click } = setup();
    click('#sl-tab-guild');
    click('#sl-recruit-bobby');
    expect(game.state.party.recruited).toContain('bobby');
  });
  it('sells materials and shows locked gear as disabled', () => {
    const { game, root, click } = setup();
    game.state.inventory.moss = 2;
    click('#sl-tab-shop');
    click('#sl-sell-all-moss');
    expect(game.state.inventory.moss ?? 0).toBe(0);
    expect((root.querySelector('#sl-buy-moss-charm') as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/ui/town.test.ts`
Expected: FAIL，`Failed to resolve import "./town"`。

- [ ] **Step 4: 寫 `ui/town.ts`**

```ts
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { FLOORS } from '../data/floors';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { recruit, setFormation, statsOf } from '../engine/party';
import { buy, equip, innCost, isUnlocked, reviveCost, revive, sell, unequip, type TownResult } from '../engine/town';
import type { CharacterId, Slot } from '../engine/types';
import { button, el, itemName, meter, type UiHooks } from './dom';

export type TownTab = 'guild' | 'shop' | 'inn' | 'depart';
let tab: TownTab = 'guild';
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

function report(r: TownResult, ui: UiHooks): void {
  if (!r.ok) { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
  else ui.sfx.menu();
  ui.refresh();
}

function guild(game: Game, ui: UiHooks): HTMLElement {
  const p = game.state.party;
  const slots = [...p.front, ...p.back];
  const selects = slots.map((cur, i) => {
    const s = el('select', { attrs: { 'aria-label': i < 3 ? T.guild.front(i + 1) : T.guild.back(i - 2) } });
    s.append(el('option', { text: T.guild.none, attrs: { value: '' } }));
    for (const id of p.recruited) s.append(el('option', { text: CHARACTERS[id].name, attrs: { value: id } }));
    s.value = cur ?? '';
    s.addEventListener('change', () => {
      const ids = selects.map((x) => (x.value || null) as CharacterId | null);
      const r = setFormation(game.state.party, ids.slice(0, 3), ids.slice(3));
      if (r.ok) { game.state.party = r.party; ui.sfx.menu(); }
      else { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
      ui.refresh();
    });
    return s;
  });
  const formation = el('div', { class: 'sl-formation' }, [
    el('h3', { text: T.guild.formation }),
    el('div', { class: 'sl-row' }, selects.slice(0, 3).map((s, i) => el('label', {}, [T.guild.front(i + 1), s]))),
    el('div', { class: 'sl-row' }, selects.slice(3).map((s, i) => el('label', {}, [T.guild.back(i + 1), s]))),
  ]);
  const recruits = el('div', { class: 'sl-row' }, CHARACTER_IDS.filter((id) => !p.recruited.includes(id)).map((id) =>
    button(T.guild.recruit(CHARACTERS[id].title, CHARACTERS[id].name), () => {
      game.state.party = recruit(game.state.party, id);
      ui.sfx.menu();
      ui.refresh();
    }, { id: `sl-recruit-${id}` })));
  const members = p.recruited.map((id) => {
    const m = p.roster[id];
    const st = statsOf(m);
    const gear = SLOTS.map((slot) => {
      const s = el('select', { attrs: { 'aria-label': `${CHARACTERS[id].name} ${T.slot[slot]}` } });
      s.append(el('option', { text: m.equip[slot] ? itemName(m.equip[slot]!) : T.guild.unequipped, attrs: { value: m.equip[slot] ?? '' } }));
      if (m.equip[slot]) s.append(el('option', { text: T.guild.unequipped, attrs: { value: '' } }));
      for (const [eid, n] of Object.entries(game.state.inventory)) {
        if (EQUIPMENT[eid]?.slot === slot && n > 0) s.append(el('option', { text: `${itemName(eid)} ×${n}`, attrs: { value: eid } }));
      }
      s.addEventListener('change', () => report(s.value ? game.apply(equip(game.state, id, s.value)) : game.apply(unequip(game.state, id, slot)), ui));
      return el('label', {}, [T.slot[slot], s]);
    });
    return el('article', { class: 'sl-card' }, [
      el('h4', { text: `${CHARACTERS[id].title} ${CHARACTERS[id].name} ${T.guild.level(m.level)}` }),
      el('div', { class: 'sl-bars' }, [`HP ${m.hp}/${st.hp}`, meter(m.hp, st.hp, 'sl-hp'), `TP ${m.tp}/${st.tp}`, meter(m.tp, st.tp, 'sl-tp')]),
      el('p', { class: 'sl-stats', text: (['atk', 'def', 'mag', 'res', 'spd'] as const).map((k) => `${T.stat[k]} ${st[k]}`).join('　') }),
      el('div', { class: 'sl-row' }, gear),
    ]);
  });
  return el('div', {}, [formation, recruits, el('h3', { text: T.guild.members }), el('div', { class: 'sl-cards' }, members)]);
}

function shop(game: Game, ui: UiHooks): HTMLElement {
  const mats = Object.entries(game.state.inventory).filter(([id, n]) => MATERIALS[id] && n > 0);
  const sellList = mats.length
    ? mats.map(([id, n]) => el('div', { class: 'sl-row' }, [
      `${T.shop.price(MATERIALS[id].name, MATERIALS[id].price)} ×${n}`,
      button(T.shop.sellOne, () => report(game.apply(sell(game.state, id, 1)), ui), { id: `sl-sell-${id}` }),
      button(T.shop.sellAll, () => report(game.apply(sell(game.state, id, n)), ui), { id: `sl-sell-all-${id}` }),
    ]))
    : [el('p', { text: T.shop.nothing })];
  const goods = [...Object.values(ITEMS), ...Object.values(EQUIPMENT)].map((g) => {
    const locked = 'slot' in g && !isUnlocked(game.state, g.id);
    const need = locked ? (g.unlock ?? []).map((u) => T.shop.needs(MATERIALS[u.mat].name, u.qty)).join('、') : '';
    return el('div', { class: 'sl-row' }, [
      button(T.shop.price(g.name, g.price), () => report(game.apply(buy(game.state, g.id)), ui), { id: `sl-buy-${g.id}`, disabled: locked }),
      el('span', { class: 'sl-note', text: need || `${game.state.inventory[g.id] ?? 0}` }),
    ]);
  });
  return el('div', {}, [el('h3', { text: T.shop.sell }), ...sellList, el('h3', { text: T.shop.buy }), ...goods]);
}

function inn(game: Game, ui: UiHooks): HTMLElement {
  const p = game.state.party;
  const dead = p.recruited.filter((id) => p.roster[id].hp <= 0);
  return el('div', {}, [
    button(T.inn.rest(innCost(p)), () => report(game.rest(), ui), { id: 'sl-rest' }),
    ...dead.map((id) => button(T.inn.revive(CHARACTERS[id].name, reviveCost(p.roster[id].level)),
      () => report(game.apply(revive(game.state, id)), ui), { id: `sl-revive-${id}` })),
  ]);
}

function depart(game: Game, ui: UiHooks): HTMLElement {
  return el('div', {}, FLOORS.filter((f) => f.id <= game.state.dungeon.reachedFloor).map((f) =>
    button(T.departTo(f.id, f.name), () => {
      const r = game.depart(f.id);
      if (!r.ok) { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
      ui.refresh();
    }, { id: `sl-depart-${f.id}` })));
}

export function renderTown(root: HTMLElement, game: Game, ui: UiHooks): void {
  const tabs = (Object.keys(T.tabs) as TownTab[]).map((t) => {
    const b = button(T.tabs[t], () => { tab = t; ui.refresh(); }, { id: `sl-tab-${t}`, class: t === tab ? 'sl-tab sl-tab--on' : 'sl-tab' });
    b.setAttribute('aria-pressed', String(t === tab));
    return b;
  });
  const body = tab === 'guild' ? guild(game, ui) : tab === 'shop' ? shop(game, ui) : tab === 'inn' ? inn(game, ui) : depart(game, ui);
  root.replaceChildren(el('nav', { class: 'sl-tabs' }, tabs), el('div', { class: 'sl-panel' }, [body]));
}
```

注意：`tab` 是模組層級變數，測試之間會互相影響，所以每個測試開頭都明確點一次分頁。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/ui/town.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 6: 寫頁面 `src/pages/games/starlantern.astro`**

```astro
---
import '../../styles/_starlantern.scss';
---
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>星燈迷宮 Starlantern</title>
  </head>
  <body class="sl-body">
    <main class="sl" id="sl-root" data-phase="town">
      <header class="sl-top">
        <h1 class="sl-title">星燈迷宮</h1>
        <span class="sl-gold" id="sl-gold"></span>
      </header>
      <p class="sl-notice" id="sl-notice" role="status" hidden></p>
      <section class="sl-town" id="sl-town"></section>
      <section class="sl-stage"><canvas id="sl-canvas"></canvas></section>
      <section class="sl-hud" id="sl-hud"></section>
      <section class="sl-battle" id="sl-battle"></section>
      <section class="sl-clear" id="sl-clear"></section>
    </main>
    <script>
      import { mountStarlantern } from '../../scripts/games/starlantern/client';
      void mountStarlantern();
    </script>
  </body>
</html>
```

- [ ] **Step 7: 寫 `src/styles/_starlantern.scss`**

```scss
$sl-bg: #0d0f1a;
$sl-panel: #1a1e2e;
$sl-line: #39405a;
$sl-text: #e8e6f0;
$sl-dim: #9aa0b8;
$sl-gold: #ffd166;

.sl-body {
  margin: 0;
  background: $sl-bg;
  color: $sl-text;
  font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
}

.sl {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
}

.sl-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.sl-title { margin: 0 0 8px; font-size: 1.5rem; }
.sl-gold { color: $sl-gold; font-weight: 700; }

.sl-notice {
  margin: 0 0 8px;
  padding: 8px 12px;
  border: 1px solid $sl-line;
  background: $sl-panel;
}

.sl-town, .sl-stage, .sl-hud, .sl-battle, .sl-clear { display: none; }
.sl[data-phase='town'] .sl-town,
.sl[data-phase='map'] .sl-stage,
.sl[data-phase='map'] .sl-hud,
.sl[data-phase='battle'] .sl-stage,
.sl[data-phase='battle'] .sl-battle,
.sl[data-phase='clear'] .sl-clear { display: block; }

.sl-stage {
  height: 360px;
  border: 1px solid $sl-line;
  canvas { display: block; width: 100%; height: 100%; }
}

.sl-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sl-tab, .sl-btn {
  padding: 8px 12px;
  border: 1px solid $sl-line;
  background: $sl-panel;
  color: $sl-text;
  font: inherit;
  cursor: pointer;
  &:disabled { color: $sl-dim; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid $sl-gold; }
}
.sl-tab--on { border-color: $sl-gold; color: $sl-gold; }

.sl-panel { margin-top: 8px; padding: 12px; border: 1px solid $sl-line; background: $sl-panel; }
.sl-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
.sl-row label { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; color: $sl-dim; }
.sl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.sl-card { padding: 8px; border: 1px solid $sl-line; }
.sl-card h4 { margin: 0 0 4px; }
.sl-bars { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: center; font-size: 0.85rem; }
.sl-stats, .sl-note { font-size: 0.85rem; color: $sl-dim; }
.sl-hp, .sl-tp { width: 100%; }

.sl-hud { margin-top: 8px; }
.sl-danger { padding: 2px 8px; border-radius: 999px; font-weight: 700; color: $sl-bg; }
.sl-danger--green { background: #7bd389; }
.sl-danger--yellow { background: $sl-gold; }
.sl-danger--red { background: #ef476f; }
.sl-pad { display: grid; grid-template-columns: repeat(3, 48px); gap: 4px; }
.sl-pad .sl-btn { min-height: 44px; }
.sl-pad-up { grid-column: 2; }
.sl-pad-left { grid-column: 1; grid-row: 2; }
.sl-pad-right { grid-column: 3; grid-row: 2; }
.sl-pad-down { grid-column: 2; grid-row: 3; }

.sl-battle { margin-top: 8px; }
.sl-party { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.sl-member { padding: 4px; border: 1px solid $sl-line; font-size: 0.8rem; }
.sl-member--active { border-color: $sl-gold; }
.sl-member--down { opacity: 0.45; filter: grayscale(1); }
.sl-log { min-height: 4.5em; margin: 6px 0; padding: 6px 8px; border: 1px solid $sl-line; font-size: 0.85rem; color: $sl-dim; }

.sl-clear { padding: 24px; text-align: center; }

@media (max-width: 640px) {
  .sl-stage { height: 260px; }
  .sl-party { grid-template-columns: repeat(3, 1fr); }
}
```

- [ ] **Step 8: Commit（需使用者授權）**

```powershell
git add src/pages/games/starlantern.astro src/styles/_starlantern.scss src/scripts/games/starlantern/ui
git commit -m "feat(starlantern): page shell, styles and town menus"
```

---

### Task 13: 地圖畫面、HUD 與掛載程式

**Files:**
- Create: `render/app.ts`, `render/MapView.ts`, `ui/hud.ts`, `ui/hud.test.ts`, `ui/clear.ts`, `client.ts`

**Interfaces:**
- Consumes: `Game`、`UiHooks`、`bindKeys`、`SoundManager`、`T`。
- Produces:
  - `createApp(canvas): Promise<Application>`
  - `class MapView { root: Container; draw(game, size: { width: number; height: number }): void; update(dt: number): void }`
  - `renderHud(root, game, ui): void`；DOM id：`#sl-return`、`#sl-lamp`、`.sl-danger`、方向鍵 `[data-dir]`
  - `renderClear(root, game, ui): void`；DOM id：`#sl-clear-back`
  - `mountStarlantern(): Promise<void>`；URL 參數 `seed`（正整數，固定亂數）與 `fast=1`（戰鬥動畫不等待）；`window.__starlanternDebug = { game }`

- [ ] **Step 1: 寫 HUD 的失敗測試 `ui/hud.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHud } from './hud';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import type { UiHooks } from './dom';

function setup() {
  const game = new Game(constRng(0.99), null);
  game.depart(1);
  const root = document.createElement('div');
  const hooks: UiHooks = { refresh: vi.fn(() => renderHud(root, game, hooks)), say: vi.fn(), move: vi.fn(), sfx: { menu: vi.fn(), bump: vi.fn() } as never };
  renderHud(root, game, hooks);
  return { game, root, hooks };
}

describe('hud', () => {
  it('enables return only on the entrance', () => {
    const { game, root, hooks } = setup();
    expect((root.querySelector('#sl-return') as HTMLButtonElement).disabled).toBe(false);
    game.move('right');
    hooks.refresh();
    expect((root.querySelector('#sl-return') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the danger colour', () => {
    const { game, root, hooks } = setup();
    game.encounter = 80;
    hooks.refresh();
    expect(root.querySelector('.sl-danger')!.className).toContain('sl-danger--red');
  });
  it('routes the touch pad through ui.move', () => {
    const { root, hooks } = setup();
    (root.querySelector('[data-dir="left"]') as HTMLButtonElement).click();
    expect(hooks.move).toHaveBeenCalledWith('left');
  });
  it('uses the lamp', () => {
    const { game, root } = setup();
    (root.querySelector('#sl-lamp') as HTMLButtonElement).click();
    expect(game.phase).toBe('town');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/ui/hud.test.ts`
Expected: FAIL，`Failed to resolve import "./hud"`。

- [ ] **Step 3: 寫 `ui/hud.ts`**

```ts
import { CHARACTERS } from '../data/characters';
import { FLOORS } from '../data/floors';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import type { Dir } from '../engine/map';
import { activeIds, statsOf } from '../engine/party';
import { button, el, meter, type UiHooks } from './dom';

const DIRS: Dir[] = ['up', 'left', 'right', 'down'];

export function renderHud(root: HTMLElement, game: Game, ui: UiHooks): void {
  const d = game.danger();
  const party = activeIds(game.state.party).map((id) => {
    const m = game.state.party.roster[id];
    const st = statsOf(m);
    return el('div', { class: m.hp > 0 ? 'sl-member' : 'sl-member sl-member--down' }, [
      el('div', { text: CHARACTERS[id].name }), meter(m.hp, st.hp, 'sl-hp'), meter(m.tp, st.tp, 'sl-tp'),
    ]);
  });
  const pad = el('div', { class: 'sl-pad' }, DIRS.map((dir) => {
    const b = button(T.map.dirs[dir], () => ui.move(dir), { class: `sl-btn sl-pad-${dir}` });
    b.dataset.dir = dir;
    return b;
  }));
  const lamps = game.state.inventory['return-lamp'] ?? 0;
  root.replaceChildren(
    el('div', { class: 'sl-row' }, [
      el('strong', { text: T.map.floor(game.floor, FLOORS[game.floor - 1].name) }),
      el('span', { class: `sl-danger sl-danger--${d}`, text: T.map.danger[d] }),
      button(T.map.returnTown, () => { if (game.returnToTown()) ui.sfx.menu(); ui.refresh(); }, { id: 'sl-return', disabled: !game.onEntrance() }),
      button(T.map.lamp(lamps), () => { if (game.useReturnLamp()) ui.sfx.menu(); ui.refresh(); }, { id: 'sl-lamp', disabled: lamps <= 0 }),
    ]),
    el('div', { class: 'sl-party' }, party),
    pad,
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/ui/hud.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: 寫 `ui/clear.ts`**

```ts
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { button, el, type UiHooks } from './dom';

export function renderClear(root: HTMLElement, game: Game, ui: UiHooks): void {
  root.replaceChildren(
    el('h2', { text: T.clear.title }),
    el('p', { text: T.clear.body }),
    button(T.clear.back, () => { game.restartAfterClear(); ui.refresh(); }, { id: 'sl-clear-back' }),
  );
}
```

- [ ] **Step 6: 寫 `render/app.ts`**

```ts
import { Application } from 'pixi.js';

export async function createApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas, resizeTo: canvas.parentElement ?? window, background: '#0d0f1a', antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  return app;
}
```

- [ ] **Step 7: 寫 `render/MapView.ts`（色塊暫代，計畫二換成圖塊）**

```ts
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../engine/game';
import type { Tile } from '../engine/map';

const COLORS: Record<Tile, number> = {
  wall: 0x2a2d3a, floor: 0x5b6150, door: 0x9c6644, up: 0x8ecae6, down: 0x219ebc, chest: 0xe9c46a, entrance: 0x90be6d, boss: 0xd62828,
};
const FOG = 0x05060a;

export class MapView {
  readonly root = new Container();
  private tiles = new Graphics();
  private marker = new Graphics();
  private target = { x: 0, y: 0 };

  constructor() {
    this.root.addChild(this.tiles, this.marker);
  }

  draw(game: Game, size: { width: number; height: number }): void {
    const map = game.map();
    const seen = new Set(game.state.dungeon.explored[String(game.floor)] ?? []);
    const cell = Math.max(8, Math.floor(Math.min(size.width / map.width, size.height / map.height)));
    this.root.x = Math.floor((size.width - cell * map.width) / 2);
    this.root.y = Math.floor((size.height - cell * map.height) / 2);
    this.tiles.clear();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        let t = map.tiles[y][x];
        if (t === 'chest' && game.state.dungeon.opened.includes(`${game.floor}:${x},${y}`)) t = 'floor';
        this.tiles.rect(x * cell, y * cell, cell, cell).fill(seen.has(`${x},${y}`) ? COLORS[t] : FOG);
      }
    }
    this.marker.clear().circle(cell / 2, cell / 2, cell * 0.35).fill(0xffd166).stroke({ width: 2, color: 0x1d1d1d });
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    this.target = { x: tx, y: ty };
  }

  /** Slide the marker toward its tile; called from the Pixi ticker. */
  update(dt: number): void {
    const k = Math.min(1, 0.35 * dt);
    this.marker.x += (this.target.x - this.marker.x) * k;
    this.marker.y += (this.target.y - this.marker.y) * k;
  }
}
```

- [ ] **Step 8: 寫 `client.ts`（戰鬥部分先留介面，Task 14 補上 `BattleView` 與 `BattleMenu`）**

```ts
import { SoundManager } from './audio/SoundManager';
import { FLOORS } from './data/floors';
import { T } from './data/text.zh-TW';
import type { Action } from './engine/battle';
import { Game } from './engine/game';
import type { Dir } from './engine/map';
import { mulberry32 } from './engine/rng';
import { bindKeys } from './input/keymap';
import { createApp } from './render/app';
import { BattleView } from './render/BattleView';
import { MapView } from './render/MapView';
import { BattleMenu } from './ui/battleMenu';
import { renderClear } from './ui/clear';
import { itemName, type UiHooks } from './ui/dom';
import { renderHud } from './ui/hud';
import { renderTown } from './ui/town';

function params(): { seed: number; fast: boolean } {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed'));
  return { seed: Number.isInteger(seed) && seed > 0 ? seed : Date.now() >>> 0, fast: q.get('fast') === '1' };
}

function safeStorage(): Storage | null {
  try {
    localStorage.setItem('starlantern-probe', '1');
    localStorage.removeItem('starlantern-probe');
    return localStorage;
  } catch {
    return null;
  }
}

export async function mountStarlantern(): Promise<void> {
  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const root = byId('sl-root');
  const notice = byId('sl-notice');
  const { seed, fast } = params();
  const game = Game.boot(mulberry32(seed), safeStorage());
  const sfx = new SoundManager();
  const mapView = new MapView();
  const battleView = new BattleView(fast);
  const app = await createApp(byId('sl-canvas') as HTMLCanvasElement).catch((err: unknown) => {
    console.error('[starlantern] renderer failed; the game stays playable without the canvas', err);
    return null;
  });
  if (app) {
    app.stage.addChild(mapView.root, battleView.root);
    app.ticker.add((t) => mapView.update(t.deltaTime));
  }
  let busy = false;
  let showingResult = false;

  const size = () => {
    app?.resize();
    return app ? { width: app.screen.width, height: app.screen.height } : { width: 0, height: 0 };
  };
  const say = (msg: string) => { notice.textContent = msg; notice.hidden = !msg; };

  const hooks: UiHooks = { refresh, say, sfx, move: onMove };
  const menu = new BattleMenu(byId('sl-battle'), game, (actions) => void playRound(actions));

  function refresh(): void {
    if (game.notice) { say(T.notices[game.notice]); game.notice = null; }
    byId('sl-gold').textContent = T.gold(game.state.gold);
    if (!showingResult) root.dataset.phase = game.phase;
    mapView.root.visible = root.dataset.phase === 'map';
    battleView.root.visible = root.dataset.phase === 'battle';
    if (root.dataset.phase === 'town') renderTown(byId('sl-town'), game, hooks);
    if (root.dataset.phase === 'map') { renderHud(byId('sl-hud'), game, hooks); mapView.draw(game, size()); }
    if (root.dataset.phase === 'clear') renderClear(byId('sl-clear'), game, hooks);
  }

  function onMove(dir: Dir): void {
    if (busy) return;
    const r = game.move(dir);
    switch (r.kind) {
      case 'ignored': return;
      case 'blocked': sfx.bump(); break;
      case 'moved': case 'entrance': sfx.step(); break;
      case 'floor': sfx.stairs(); say(T.map.floor(r.floor, FLOORS[r.floor - 1].name)); break;
      case 'chest': sfx.chest(); say(T.map.chest(itemName(r.item), r.qty)); break;
      case 'battle': case 'boss':
        sfx.encounter();
        refresh();
        battleView.setup(game.battle!, size());
        menu.show(game.battle!);
        return;
    }
    refresh();
  }

  async function playRound(actions: Record<string, Action>): Promise<void> {
    if (busy) return;
    busy = true;
    const r = game.submitRound(actions);
    if (!r) { busy = false; return; }
    menu.showLog(r.battle);
    await battleView.play(r.battle, sfx);
    busy = false;
    if (!r.end) { menu.show(r.battle); return; }
    showingResult = true;
    if (r.end.outcome === 'win') sfx.win(); else if (r.end.outcome === 'lose') sfx.lose(); else sfx.menu();
    menu.showResult(r.end, r.battle, () => { showingResult = false; refresh(); });
  }

  bindKeys(window, (a) => {
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') onMove(a);
  });
  window.addEventListener('resize', () => {
    if (root.dataset.phase === 'map') mapView.draw(game, size());
  });
  (window as unknown as { __starlanternDebug?: { game: Game } }).__starlanternDebug = { game };
  refresh();
}
```

`client.ts` 要等 Task 14 寫完 `BattleView`、`BattleMenu` 才能編譯，所以本任務先不跑頁面；Task 14 結束時一起驗證。

- [ ] **Step 9: Commit（需使用者授權，可和 Task 14 合併）**

```powershell
git add src/scripts/games/starlantern/render src/scripts/games/starlantern/ui src/scripts/games/starlantern/client.ts
git commit -m "feat(starlantern): map view, hud and client wiring"
```

---

### Task 14: 戰鬥畫面與指令選單

**Files:**
- Create: `render/BattleView.ts`, `ui/battleMenu.ts`, `ui/battleMenu.test.ts`

**Interfaces:**
- Consumes: `BattleState`、`Action`、`BattleEnd`、`Combatant`、`BattleEvent`、`Game`、`learnedSkills`、`SKILLS`、`ITEMS`、`T`。
- Produces:
  - `class BattleView { root: Container; constructor(fast = false); setup(state, size): void; play(state, sfx): Promise<void> }`
  - `class BattleMenu { constructor(root, game, onSubmit: (a: Record<string, Action>) => void); show(state): void; showLog(state): void; showResult(end, state, onContinue): void }`
  - DOM id（e2e 依賴）：`#sl-auto`、`#sl-cmd-attack`、`#sl-cmd-skill`、`#sl-cmd-defend`、`#sl-cmd-item`、`#sl-cmd-escape`、`#sl-cmd-back`、目標按鈕 `[data-target]`、`#sl-result`、`#sl-continue`、`.sl-log`

選單流程：依序替每位「存活且沒睡著」的隊員選行動。攻擊 → 選敵人（只剩一隻就直接選）；技能 → 列出已學會且非被動的技能（TP 不足的停用）→ 依技能目標選敵人、隊友或倒下的隊友；道具 → 列出戰鬥可用且有庫存的道具 → 選目標；防禦、逃跑直接記下（頭目戰停用逃跑）。「返回」回到上一位。「全員攻擊」讓所有人攻擊第一隻存活的敵人並送出。全部選完就送出。

- [ ] **Step 1: 寫失敗測試 `ui/battleMenu.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { BattleMenu } from './battleMenu';
import { Game } from '../engine/game';
import { createBattle } from '../engine/battle';
import { constRng } from '../engine/testing';

function setup(enemyIds = ['slime', 'bat'], boss = false) {
  const game = new Game(constRng(0.5), null);
  const state = createBattle({ party: game.state.party, enemyIds, boss, inventory: { potion: 1 }, revealed: {} });
  const root = document.createElement('div');
  const submit = vi.fn();
  const menu = new BattleMenu(root, game, submit);
  menu.show(state);
  const q = <T extends Element = HTMLButtonElement>(sel: string) => root.querySelector(sel) as T | null;
  return { root, submit, menu, state, q };
}

describe('battle menu', () => {
  it('auto-attacks with every able member', () => {
    const { q, submit } = setup();
    q('#sl-auto')!.click();
    expect(submit).toHaveBeenCalledTimes(1);
    const actions = submit.mock.calls[0][0];
    expect(Object.keys(actions)).toEqual(['scarlet', 'chizuru', 'liz', 'noel', 'selene']);
    expect(actions.scarlet).toEqual({ kind: 'attack', target: 'e0' });
  });
  it('walks member by member and submits after the last', () => {
    const { q, root, submit } = setup();
    expect(root.textContent).toContain('絲嘉蕾 的行動');
    q('#sl-cmd-attack')!.click();
    q('[data-target="e1"]')!.click();
    expect(root.textContent).toContain('千鶴 的行動');
    q('#sl-cmd-back')!.click();
    expect(root.textContent).toContain('絲嘉蕾 的行動');
    for (let i = 0; i < 5; i++) q('#sl-cmd-defend')!.click();
    expect(submit.mock.calls[0][0].scarlet).toEqual({ kind: 'defend' });
  });
  it('skips the target step when one enemy is left', () => {
    const { q, submit } = setup(['slime']);
    q('#sl-cmd-attack')!.click();
    for (let i = 0; i < 4; i++) q('#sl-cmd-defend')!.click();
    expect(submit.mock.calls[0][0].scarlet).toEqual({ kind: 'attack', target: 'e0' });
  });
  it('disables skills the member cannot afford', () => {
    const { q, state, menu, root } = setup();
    state.party[0].tp = 0;
    menu.show(state);
    q('#sl-cmd-skill')!.click();
    const skill = root.querySelector<HTMLButtonElement>('[data-skill="provoke"]')!;
    expect(skill.disabled).toBe(true);
  });
  it('picks an ally for healing skills', () => {
    const { q, submit, root } = setup();
    for (let i = 0; i < 4; i++) q('#sl-cmd-defend')!.click();
    q('#sl-cmd-skill')!.click();
    root.querySelector<HTMLButtonElement>('[data-skill="moonlight"]')!.click();
    q('[data-target="scarlet"]')!.click();
    expect(submit.mock.calls[0][0].selene).toEqual({ kind: 'skill', skill: 'moonlight', target: 'scarlet' });
  });
  it('disables escape against the boss', () => {
    const { q } = setup(['lanterneater'], true);
    expect(q('#sl-cmd-escape')!.disabled).toBe(true);
  });
  it('skips sleeping members', () => {
    const { q, state, menu, submit } = setup();
    state.party[0].sleep = 2;
    menu.show(state);
    q('#sl-auto')!.click();
    expect(submit.mock.calls[0][0].scarlet).toBeUndefined();
  });
  it('shows the result and continues', () => {
    const { root, menu, state } = setup();
    const done = vi.fn();
    menu.showResult({ outcome: 'win', exp: 12, gold: 9, drops: { moss: 1 }, levelUps: [{ id: 'noel', levels: 1, learned: ['ice-star'] }] }, state, done);
    expect(root.querySelector('#sl-result')!.textContent).toContain('勝利');
    expect(root.textContent).toContain('發光苔 ×1');
    expect(root.textContent).toContain('諾艾兒 學會了「冰之星彈」');
    (root.querySelector('#sl-continue') as HTMLButtonElement).click();
    expect(done).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/ui/battleMenu.test.ts`
Expected: FAIL，`Failed to resolve import "./battleMenu"`。

- [ ] **Step 3: 寫 `ui/battleMenu.ts`**

```ts
import { CHARACTERS } from '../data/characters';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { Action, BattleState } from '../engine/battle';
import type { BattleEvent, Combatant } from '../engine/combatant';
import type { BattleEnd, Game } from '../engine/game';
import { learnedSkills } from '../engine/party';
import type { CharacterId, Target } from '../engine/types';
import { button, el, itemName, meter } from './dom';

type Pending = { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'attack' };
type Mode = { view: 'root' } | { view: 'skills' } | { view: 'items' } | { view: 'target'; pick: 'enemy' | 'ally' | 'deadAlly'; pending: Pending };

export class BattleMenu {
  private state: BattleState | null = null;
  private actions: Record<string, Action> = {};
  private index = 0;
  private mode: Mode = { view: 'root' };

  constructor(private root: HTMLElement, private game: Game, private onSubmit: (a: Record<string, Action>) => void) {}

  show(state: BattleState): void {
    this.state = state;
    this.actions = {};
    this.index = 0;
    this.mode = { view: 'root' };
    this.render();
  }

  showLog(state: BattleState): void {
    this.state = state;
    this.root.replaceChildren(this.enemyList(), this.partyBar(null), this.log(state.log));
  }

  showResult(end: BattleEnd, state: BattleState, onContinue: () => void): void {
    this.state = state;
    const lines: string[] = [];
    if (end.outcome === 'win') {
      lines.push(T.battle.exp(end.exp), T.battle.gold(end.gold));
      for (const [id, n] of Object.entries(end.drops)) lines.push(T.battle.drop(itemName(id), n));
      for (const u of end.levelUps) {
        const name = CHARACTERS[u.id].name;
        lines.push(T.battle.levelUp(name, this.game.state.party.roster[u.id].level));
        for (const s of u.learned) lines.push(T.battle.learned(name, SKILLS[s].name));
      }
    }
    const title = end.outcome === 'win' ? T.battle.win : end.outcome === 'lose' ? T.battle.lose : T.battle.fled;
    this.root.replaceChildren(
      this.log(state.log),
      el('div', { id: 'sl-result', class: 'sl-panel' }, [el('h3', { text: title }), ...lines.map((l) => el('p', { text: l }))]),
      button(T.battle.cont, onContinue, { id: 'sl-continue' }),
    );
  }

  private actors(): Combatant[] {
    return this.state!.party.filter((c) => c.alive && c.sleep === 0);
  }

  private choose(action: Action): void {
    const actor = this.actors()[this.index];
    this.actions[actor.key] = action;
    this.mode = { view: 'root' };
    this.index += 1;
    if (this.index >= this.actors().length) this.onSubmit(this.actions);
    else this.render();
  }

  private finish(p: Pending, target?: string): void {
    if (p.kind === 'attack') this.choose({ kind: 'attack', target: target ?? this.firstEnemy() });
    else if (p.kind === 'skill') this.choose({ kind: 'skill', skill: p.skill, target });
    else this.choose({ kind: 'item', item: p.item, target });
  }

  private firstEnemy(): string {
    return this.state!.enemies.find((e) => e.alive)?.key ?? 'e0';
  }

  private withTarget(target: Target | null, p: Pending): void {
    const living = this.state!.enemies.filter((e) => e.alive);
    if (target === 'enemy') {
      if (living.length === 1) this.finish(p, living[0].key);
      else { this.mode = { view: 'target', pick: 'enemy', pending: p }; this.render(); }
    } else if (target === 'ally' || target === 'deadAlly') {
      this.mode = { view: 'target', pick: target, pending: p };
      this.render();
    } else {
      this.finish(p);
    }
  }

  private render(): void {
    const actor = this.actors()[this.index];
    if (!actor) { this.onSubmit(this.actions); return; }
    this.root.replaceChildren(this.enemyList(), this.partyBar(actor.key), this.panel(actor));
  }

  private panel(actor: Combatant): HTMLElement {
    const back = button(T.cmd.back, () => {
      if (this.mode.view !== 'root') this.mode = { view: 'root' };
      else if (this.index > 0) this.index -= 1;
      this.render();
    }, { id: 'sl-cmd-back', disabled: this.mode.view === 'root' && this.index === 0 });
    const head = el('h3', { text: T.cmd.choose(actor.name) });
    if (this.mode.view === 'skills') {
      const m = this.game.state.party.roster[actor.key as CharacterId];
      const list = learnedSkills(m.id, m.level).filter((s) => !SKILLS[s].passive).map((s) => {
        const def = SKILLS[s];
        const b = button(`${def.name}（${T.cmd.tp(def.tp)}）`, () => this.withTarget(def.target, { kind: 'skill', skill: s }), { disabled: actor.tp < def.tp });
        b.dataset.skill = s;
        b.title = def.desc;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [...list, back])]);
    }
    if (this.mode.view === 'items') {
      const list = Object.entries(this.state!.inventory).filter(([id, n]) => ITEMS[id]?.battle && n > 0).map(([id, n]) => {
        const b = button(`${ITEMS[id].name} ×${n}`, () => this.withTarget(ITEMS[id].target, { kind: 'item', item: id }));
        b.dataset.item = id;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [...list, back])]);
    }
    if (this.mode.view === 'target') {
      const { pick, pending } = this.mode;
      const pool = pick === 'enemy' ? this.state!.enemies.filter((e) => e.alive)
        : pick === 'ally' ? this.state!.party.filter((c) => c.alive) : this.state!.party.filter((c) => !c.alive);
      const list = pool.map((c) => {
        const b = button(c.name, () => this.finish(pending, c.key));
        b.dataset.target = c.key;
        return b;
      });
      return el('div', { class: 'sl-panel' }, [el('h3', { text: T.cmd.target }), el('div', { class: 'sl-row' }, [...list, back])]);
    }
    const hasItems = Object.entries(this.state!.inventory).some(([id, n]) => ITEMS[id]?.battle && n > 0);
    return el('div', { class: 'sl-panel' }, [head, el('div', { class: 'sl-row' }, [
      button(T.cmd.attack, () => this.withTarget('enemy', { kind: 'attack' }), { id: 'sl-cmd-attack' }),
      button(T.cmd.skill, () => { this.mode = { view: 'skills' }; this.render(); }, { id: 'sl-cmd-skill' }),
      button(T.cmd.defend, () => this.choose({ kind: 'defend' }), { id: 'sl-cmd-defend' }),
      button(T.cmd.item, () => { this.mode = { view: 'items' }; this.render(); }, { id: 'sl-cmd-item', disabled: !hasItems }),
      button(T.cmd.escape, () => this.choose({ kind: 'escape' }), { id: 'sl-cmd-escape', disabled: this.state!.boss }),
      back,
      button(T.cmd.auto, () => {
        const target = this.firstEnemy();
        for (const c of this.actors()) this.actions[c.key] = { kind: 'attack', target };
        this.onSubmit(this.actions);
      }, { id: 'sl-auto' }),
    ])]);
  }

  private enemyList(): HTMLElement {
    const s = this.state!;
    return el('div', { class: 'sl-row' }, s.enemies.map((e) => {
      const known = (s.revealed[e.defId] ?? []).filter((x) => e.weak.includes(x)).map((x) => T.element[x]).join('、');
      return el('span', { class: e.alive ? 'sl-member' : 'sl-member sl-member--down' }, [
        `${e.name}${known ? `　${T.battle.weak(known)}` : ''}`,
      ]);
    }));
  }

  private partyBar(activeKey: string | null): HTMLElement {
    return el('div', { class: 'sl-party' }, this.state!.party.map((c) => {
      const cls = ['sl-member', c.key === activeKey ? 'sl-member--active' : '', c.alive ? '' : 'sl-member--down'].filter(Boolean).join(' ');
      const tags = [c.poison ? T.battle.poison : '', c.sleep > 0 ? T.battle.sleep : ''].filter(Boolean).join(' ');
      return el('div', { class: cls }, [
        el('div', { text: `${c.name}${tags ? ` ${tags}` : ''}` }),
        `HP ${c.hp}/${c.max.hp}`, meter(c.hp, c.max.hp, 'sl-hp'),
        `TP ${c.tp}/${c.max.tp}`, meter(c.tp, c.max.tp, 'sl-tp'),
      ]);
    }));
  }

  private log(events: BattleEvent[]): HTMLElement {
    const name = (key: string) => [...this.state!.party, ...this.state!.enemies].find((c) => c.key === key)?.name ?? key;
    const lines = events.map((e) => {
      switch (e.type) {
        case 'act': return T.log.act(name(e.actor), e.label);
        case 'damage': return T.log.damage(name(e.target), e.amount, e.mult);
        case 'ko': return T.log.ko(name(e.target));
        case 'heal': return T.log.heal(name(e.target), e.amount);
        case 'tp': return T.log.tp(name(e.target), e.amount);
        case 'revive': return T.log.revive(name(e.target));
        case 'cure': return T.log.cure(name(e.target));
        case 'status': return T.log.status(name(e.target), e.status);
        case 'resist': return T.log.resist(name(e.target));
        case 'buff': return T.log.buff(name(e.target), e.stat, e.pct);
        case 'taunt': return T.log.taunt(name(e.target));
        case 'turret': return T.log.turret(name(e.target));
        case 'asleep': return T.log.asleep(name(e.actor));
        case 'no-tp': return T.log.noTp(name(e.actor));
        case 'escape': return T.log.escape(e.success);
        case 'poison-tick': return T.log.poison(name(e.target), e.amount);
      }
    });
    return el('div', { class: 'sl-log', attrs: { 'aria-live': 'polite' } }, lines.map((l) => el('div', { text: l })));
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/starlantern/ui/battleMenu.test.ts`
Expected: PASS（8 tests）。

- [ ] **Step 5: 寫 `render/BattleView.ts`（色塊暫代，計畫二換成敵人圖與背景）**

```ts
import { Container, Graphics, Text } from 'pixi.js';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';

const PALETTE = [0x7fb069, 0x8e7dbe, 0xd1495b, 0x66a1d2, 0xe0a458, 0x5c946e, 0xb56576, 0x6d6875, 0xc44536];

function colorFor(defId: string): number {
  let h = 0;
  for (const ch of defId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export class BattleView {
  readonly root = new Container();
  private sprites = new Map<string, Container>();

  constructor(private fast = false) {}

  setup(state: BattleState, size: { width: number; height: number }): void {
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.sprites.clear();
    this.root.addChild(new Graphics().rect(0, 0, size.width, size.height).fill(0x141826));
    const n = state.enemies.length;
    const w = Math.min(160, size.width / (n + 1));
    const h = w * 1.2;
    state.enemies.forEach((e, i) => {
      const c = new Container();
      const label = new Text({ text: e.name, style: { fill: 0xffffff, fontSize: 14 } });
      label.anchor.set(0.5, 0);
      c.addChild(new Graphics().roundRect(-w / 2, -h, w, h, 12).fill(colorFor(e.defId)), label);
      c.x = (size.width * (i + 1)) / (n + 1);
      c.y = size.height * 0.8;
      this.root.addChild(c);
      this.sprites.set(e.key, c);
    });
  }

  async play(state: BattleState, sfx: SoundManager): Promise<void> {
    for (const ev of state.log) {
      const s = 'target' in ev ? this.sprites.get(ev.target) : undefined;
      if (ev.type === 'damage') {
        if (ev.mult > 1) sfx.weak(); else sfx.hit();
        if (s) this.popup(s, String(ev.amount), ev.mult > 1 ? 0xffd166 : 0xffffff);
      }
      if (ev.type === 'heal') sfx.heal();
      if (ev.type === 'ko') { sfx.ko(); if (s) s.alpha = 0.15; }
      await this.wait(ev.type === 'act' ? 260 : 160);
    }
    for (const e of state.enemies) {
      const s = this.sprites.get(e.key);
      if (s) s.alpha = e.alive ? 1 : 0.15;
    }
  }

  private popup(s: Container, text: string, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 22, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5);
    t.y = -s.height - 12;
    s.addChild(t);
    const x0 = s.x;
    s.x = x0 + 6;
    setTimeout(() => { s.x = x0; }, 60);
    setTimeout(() => { s.removeChild(t); t.destroy(); }, this.fast ? 0 : 500);
  }

  private wait(ms: number): Promise<void> {
    return this.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
```

- [ ] **Step 6: 型別檢查**

repo 沒有 type-check 腳本，用 tsc 檢查並只看本遊戲的錯誤：
```powershell
npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String 'starlantern'
```
Expected: 沒有輸出。有錯誤就修到沒有為止。

- [ ] **Step 7: 實際開頁面手動走一次**

```powershell
npx astro dev --port 4002
```
（背景執行）用 Playwright MCP 以 headless、`--mute-audio` 開 `http://localhost:4002/games/starlantern?seed=7`：
城鎮四個分頁都能切換 → 出發第 1 層 → 方向鍵移動、色塊地圖與迷霧更新 → 遇敵進戰鬥 → 「全員攻擊」打贏 → 結果畫面「繼續」回地圖 → 走回入口「回城」→ 旅館住宿出現「已存檔」。
截圖存到 `tmp/starlantern/`（已被 gitignore）。console 不得有錯誤。完成後停掉 dev server。

- [ ] **Step 8: Commit（需使用者授權）**

```powershell
git add src/scripts/games/starlantern
git commit -m "feat(starlantern): battle view and command menu"
```

---

### Task 15: E2E 主流程與全套驗證

**Files:**
- Create: `tests/e2e/starlantern.spec.ts`

- [ ] **Step 1: 寫 e2e `tests/e2e/starlantern.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--mute-audio'] } });

test.describe('starlantern', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

  test('城鎮 → 出發 → 戰鬥勝利 → 回城住宿存檔 → 重新載入', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/starlantern?seed=7&fast=1');
    const root = page.locator('#sl-root');
    await page.waitForFunction(() => Boolean((window as unknown as { __starlanternDebug?: unknown }).__starlanternDebug), undefined, { timeout: 20000 });
    await expect(root).toHaveAttribute('data-phase', 'town');

    await page.click('#sl-tab-guild');
    await expect(page.locator('.sl-formation select')).toHaveCount(5);
    await page.click('#sl-tab-depart');
    await page.click('#sl-depart-1');
    await expect(root).toHaveAttribute('data-phase', 'map');

    for (let i = 0; i < 200 && (await root.getAttribute('data-phase')) === 'map'; i++) {
      await page.keyboard.press(i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    await expect(root).toHaveAttribute('data-phase', 'battle');

    for (let i = 0; i < 60 && !(await page.locator('#sl-continue').isVisible()); i++) {
      const auto = page.locator('#sl-auto');
      if (await auto.isVisible()) await auto.click();
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('#sl-result')).toContainText('勝利');
    await page.click('#sl-continue');
    await expect(root).toHaveAttribute('data-phase', 'map');

    await page.click('#sl-lamp');
    await expect(root).toHaveAttribute('data-phase', 'town');
    await page.click('#sl-tab-inn');
    await page.click('#sl-rest');
    await expect(page.locator('#sl-notice')).toContainText('已存檔');
    const gold = await page.locator('#sl-gold').textContent();

    await page.reload();
    await expect(root).toHaveAttribute('data-phase', 'town');
    await expect(page.locator('#sl-gold')).toHaveText(gold ?? '');
    expect(await page.evaluate(() => localStorage.getItem('starlantern-save'))).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('壞掉的存檔會提示並開新檔', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.setItem('starlantern-save', '{bad'));
    await page.reload();
    await expect(page.locator('#sl-notice')).toContainText('存檔無法讀取');
    expect(await page.evaluate(() => localStorage.getItem('starlantern-save-backup'))).toBe('{bad');
    await expect(page.locator('#sl-gold')).toHaveText('150 G');
  });
});
```

- [ ] **Step 2: 跑 e2e**

Run: `npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`
Expected: 2 passed。
若第一個測試在戰鬥中全滅（結果顯示「全滅」），代表 seed 7 抽到的戰鬥對 Lv1 太難：先檢查是不是數值錯誤（例如敵人攻擊過高）；確認數值合理後才換 seed，並在 commit 訊息註明換過。

- [ ] **Step 3: 全套單元測試**

Run: `npx vitest run`
Expected: 全部 PASS，包含 `audio-sfx-volume.test.ts` 的 starlantern 案例。

- [ ] **Step 4: 型別檢查**

```powershell
npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String 'starlantern'
```
Expected: 沒有輸出。

- [ ] **Step 5: 規則檢查**

```powershell
Select-String -Path src/styles/_starlantern.scss -Pattern '!important'
Select-String -Path src/scripts/games/starlantern/**/*.ts, src/pages/games/starlantern.astro -Pattern 'style=|\.style\.|Math\.random' | Where-Object { $_.Path -notmatch '\.test\.ts$' }
Select-String -Path src/scripts/games/starlantern/engine/*.ts -Pattern "from 'pixi.js'|document\.|window\." | Where-Object { $_.Path -notmatch '\.test\.ts$' }
```
Expected: 三個指令都沒有輸出。

- [ ] **Step 6: 交給沒看過過程的審查代理驗收**

派一個 fresh-context 審查代理，給它規格書與本計畫路徑，請它：讀 diff、跑 `npx vitest run` 和 e2e、用 headless（`--mute-audio`）實際從城鎮玩到第 1 層一場戰鬥，回報規格書第 1–4、6–8 節中本計畫範圍內有哪些沒做到。依結果修正後再回報使用者。

- [ ] **Step 7: Commit（需使用者授權）**

```powershell
git add tests/e2e/starlantern.spec.ts
git commit -m "test(starlantern): e2e main loop and corrupt-save recovery"
```

---

## 計畫二預告（不在本計畫內）

美術：依規格書第 5 節，用 codex 生成 1 位角色立繪與頭貼、1 種敵人、1 層圖塊做樣本給使用者核准 → 量產 → 發布到 `public/assets/games/starlantern/` → `MapView`、`BattleView`、HUD、城鎮換上正式美術（素材載入失敗時退回本計畫的色塊）→ 數值平衡（實際通關一次，記錄每層所需等級與時間，目標 30–60 分鐘）。
