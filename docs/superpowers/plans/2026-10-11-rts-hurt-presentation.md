# RTS 受擊呈現 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將已發布的 Hurt 動作接入非致命傷害，保持實際攻擊、施法、移動與死亡規則。

**Architecture:** 單位保留獨立、可丟棄的 hurt cue；Scene 只轉成模擬時間 age，ModelInstance 根據現有動作與實際 clip 選擇短暫 Hurt。模型正常速度 seek，死亡、攻擊及施法優先；不改 order、attackCue 或傷害數值。

**Tech Stack:** 現有 TypeScript、Three.js、Vitest、Playwright；不新增套件或美術資產。

**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md:54-62`；沿用 `docs/superpowers/plans/2026-10-09-rts-finish-plan.md` 最終驗收。

## Global Constraints

- 優先序 death > attack/cast > hurt > idle/walk/work，不遮蔽實際攻擊接觸。
- cue 最短間隔 0.60 秒、窗口 min(Hurt duration, 0.35 秒)；密集命中不得延長 cue。
- 使用模擬時間，暫停不前進；新顯示單位的過期 cue 不重播；雙 LOD 相同 age。
- 不 push／部署；主代理唯一寫入者；保留既有未提交工作。

## Review Focus

- 密集受擊與同 tick 多來源傷害，仍全數扣血而只合併呈現。
- 致死、攻擊 wind-up、施法不受 Hurt 干擾。
- 從 Hurt 回到 walk/work/idle 不延續一次播放或錯誤 timeScale。
- 缺 Hurt clip、雙 LOD 不同長度、暫停、迷霧重現均不得卡住。
- 0.35 秒只包含 recoil，不保留完整恢復段，須實看淡出觀感；不宣稱曲線分析即美術驗收。

## Task 1: 傷害到受擊片段

**Files:** 修改 `types.ts`、`hero.ts`、`state.ts`、`scene.ts`、`models.ts`；新增 `unit-reaction.ts`、`unit-reaction.test.ts`、`model-hurt.test.ts`；擴充 `presentation-integration.test.ts`。全部位於 `src/scripts/games/rts/`。

**Interfaces:** `Unit.hurtCue?:{sequence:number;startedAt:number}`；`ModelInstance.animate(name,dt,attackCue?,speed?,hurtCue?:{sequence:number;elapsed:number})`；共享 `HURT_INTERVAL`／`HURT_WINDOW` 與純選擇函式 `hurtPlayback`。

- [x] Red：真實 damageEntity 驗 cue 合併、間隔與死亡；真實 Three ModelInstance 驗 Hurt pose、age、雙 LOD、優先序與恢復。Scene 測傳遞 simulation age。

```ts
damageEntity(state,unit,10,1);
expect(unit.hurtCue).toEqual({sequence:1,startedAt:state.time});
model.animate('idle',0,undefined,0,{sequence:1,elapsed:.2});
expect(model.mixer.existingAction(hurtClip)!.time).toBeCloseTo(.2);
```

- [x] Green：非致命傷害依 time 間隔產生 cue；死亡刪除。ModelInstance 在允許的 base 動作以 Hurt clip 原速度 seek；攻擊／施法／死亡立即接管，其他動作 0.10 秒 crossfade。

```ts
const reaction=hurtPlayback(name,hurtCue,hurtDuration);
if(reaction){name='hurt';cue=reaction;}
```

- [x] 跑相關完整檔案、全套 Vitest、strict RTS TypeScript、production build。Expected：全過；傷害與命中 tick 不變。
- [x] 新增 `tests/e2e/games-rts-hurt.spec.ts`，正式模型下驗實際傷害、受擊 pose、暫停、攻擊優先及恢復，三瀏覽器截圖／實看；重跑受影響肖像與操作案例。
- [x] 獨立 consultant 檢核；60 秒正式效能重測。證據放 `tmp/rts/codex-hurt-2026-10-11/`，更新進度；本機 commit 留到總體 F 整理。

## 執行紀錄

- 前輪為 progress：迷霧修復與完整基線驗證；材質候選因無穩定收益已撤回。
- 主代理實作，唯讀 explorer 解析現行 16 GLB 的 Hurt 曲線：8 兵種峰值 0.125–0.25 秒、雙 LOD 一致。consultant 已挑戰優先序，採 attack/cast 保護。
- Ruling：沿用完整遊戲收尾授權，不追加局部批准；專用 Work/Cast 美術及最終自然對局仍另有未完成項目。

## 驗證結果

- 初始 Red 14 fail／5 pass，接入後相關測試通過。獨立 review 找到 Hurt fade 沿 RAF 推進，新增非零 Walk → Hurt age 0 重複 RAF 的 Red，實際 pose `.446879986` 漂到 `.383519993`；改用 simulation elapsed 差值後 5 檔／94 項通過，複審 APPROVE。
- 最終全站 Vitest：171 檔／1,747 項，105.27 秒；strict RTS TypeScript 加新 E2E 通過；production build 19.48 秒。不存在的 `hero.test.ts` 未納入 focused 數量；完整套件涵蓋真實英雄案例。
- 三瀏覽器 Hurt＋肖像 9／9，3.3 分鐘；另補攻城車 chassis 獨立斷言與逐兵種實際 LOD 切換後，Hurt 三瀏覽器 3／3，1.6 分鐘。兩項測試缺口經 consultant 複審關閉。這是受控呈現 fixture，不是自然對局勝負。
- 原 gameplay span 48／24 留圖；另外依單位投影 72／32 px 的診斷鏡頭驗證真實 renderer 切換高低模，沒有直接修改 visibility。主代理實看受擊／恢復、最大縮放、siege 高模、WebKit worker 低模截圖。
- 正式 60 秒／1080p／80 單位／20 建築／騎士肖像：57.47 FPS、p95 28.4 ms、max 207.7 ms，2,724 frames；零頁面錯誤，門檻通過。保留先前不同系統負載下的效能紀錄，不宣稱 Hurt 帶來效能收益。
- 首次 E2E instrumentation 受 Vite HMR 時戳模組分裂影響；確認同工作樹伺服器後重啟解決，未刪 cache。後續 fixture 修正 shared skeleton 取樣、siege 非 Bone pivot 與合法近戰距離；未因此修改戰鬥數值。
