# RTS 材質共用有限效能實驗

**結果：實驗結束，未保留 production 改動。** 交錯量測無可重現收益；`models.ts` 已逐位元恢復實驗前版本，候選程式與 5 項測試移至 `tmp/rts/codex-2026-10-11/` 保存。此文件記錄已否決方向，避免下次重做。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在相同正式資產、80 單位／20 建築／動態肖像下，驗證 library 內共用陣營材質是否降低渲染成本。

**Architecture:** 原材質物件、team、ghost 是快取鍵。`ModelLibrary` 擁有快取，存活至 library disposal；直接建立的 `ModelInstance` 則擁有自己的快取。材質設定完成後不再逐 instance 修改。不同 skeleton、動畫、LOD、模型及 GPU texture 所有權維持原契約。

**Tech Stack:** 現有 TypeScript、Three.js、Vitest、Playwright，不新增依賴。

**Spec:** `docs/superpowers/plans/2026-10-09-rts-finish-plan.md` 的 E 發布門檻；原始設計 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。

## Global Constraints

- 正式效能 median ≥55 FPS、p95 <33 ms；未達標不宣稱完成。
- 不調降畫質、單位數、地圖可見範圍、陰影、LOD 或肖像品質。
- 不停止使用者 LDPlayer；不 push 或部署；保留 inherited dirty work。
- 若共用沒有可重現收益，回復本實驗的原始碼與測試，保存測量證據。

## Review Focus

- 同名但不同來源物件／LOD 不得誤共用；同一來源在 mesh 陣列及多 instance 應共用。
- 紅藍中立陣營、ghost 與正式材質不得互相污染。
- instance／portrait 結束不得釋放另一 instance 使用中的材質。
- constructor 失敗與 library 重複 dispose／重新 load 不得留下失效快取或洩漏。
- mask texture 仍由來源 library 釋放；動畫、骨架及肖像燈光不得變成共享狀態。

## Task 1: 材質快取與測量

**Files:** `src/scripts/games/rts/models.ts`、新增 `model-material-pool.test.ts`；結果記入 `docs/games/rts-progress.md`。

**Interfaces:** `ModelLibrary.instantiate(id,team,ghost)` 不變。內部 pool 提供 `get(original:THREE.Material,team:TeamId|-1,ghost:boolean):THREE.Material` 與 `dispose():void`。`ModelInstance` 最後一個 optional constructor 參數接收 library pool；未提供時自行擁有。

- [ ] 先透過實際 `ModelLibrary.load/instantiate/dispose` API 建測試：同 source/team 的兩 instance material reference 相等；team／ghost 分離；不同來源同名分離；一個 instance 結束不 dispose pooled material，library 結束恰好一次。使用既有 GLTFLoader／TextureLoader mocks，不能直接寫入 private cache。

```ts
const first=library.instantiate('guard',0),second=library.instantiate('guard',0);
const a=(first.root.getObjectByName('Cloth') as THREE.Mesh).material;
const b=(second.root.getObjectByName('Cloth') as THREE.Mesh).material;
expect(a).toBe(b);
const disposed=vi.spyOn(a as THREE.Material,'dispose');
first.dispose();expect(disposed).not.toHaveBeenCalled();
second.dispose();expect(disposed).not.toHaveBeenCalled();
library.dispose();library.dispose();expect(disposed).toHaveBeenCalledOnce();
```

- [ ] 跑 focused Red：`rtk proxy node node_modules/vitest/vitest.mjs run src/scripts/games/rts/model-material-pool.test.ts --maxWorkers=2`。Expected：材質 reference／instance disposal 契約失敗。
- [ ] 最小實作：Map 以原材質 identity 索引；非 TeamCloth 且非 ghost 直接回傳來源；其餘 clone 一次，沿用 configureTeamMaterial 及 ghost 設定。library dispose 所有 cached clones 並 clear；instance 僅 dispose 自己建立的 pool。

```ts
const key=`${team}:${ghost}`;
let variants=this.variants.get(original);
const existing=variants?.get(key);if(existing)return existing;
const material=original.clone() as THREE.MeshStandardMaterial;
// Apply the existing team/ghost setup before caching; dispose this clone if setup throws.
if(!variants){variants=new Map();this.variants.set(original,variants);}
variants.set(key,material);return material;
```

- [ ] Green 跑新增測試、models、model-construction、team-material、portrait 測試。Expected：全過，尤其 constructor rollback。
- [ ] 跑 production build，既有 `rts-production-performance.ts --dedicated-gpu --portrait` 60 秒；沿用正式發布 fixture，保留 SHA 與零錯誤驗證。比較基準 48.08 FPS／p95 25.2 ms，必要時原版與新版交錯驗證。
- [ ] 有收益才保留；全套 Vitest、RTS strict TS、建置、受影響三瀏覽器及獨立審查通過後記錄結果。本地 commit 併入既有 F 整理，避免把引用的 inherited untracked modules 遺漏在提交外。

## 執行紀錄

- 2026-10-11：主代理為單一寫入者；唯讀 explorer 已核對所有權及呼叫點，consultant 提議此有限實驗。前一輪完整 69 案瀏覽器回歸尚在執行，先建立測試，待其結束才改 production code。
- Ruling：不使用 lease/refcount，因 pool 與 source GLTF 共存活，避免最後一個單位死亡／肖像切換時反覆重建。代價是已用過的有限 team/ghost variants 保留至 library disposal，受來源材質數量上限約束。
- Ruling：沿用使用者既有完整遊戲收尾授權與目前 worktree；不增加局部確認流程。
- Red：新增 5 項測試，4 fail／1 pass，失敗為跨 instance reference 不同與 instance 過早 dispose，與假說一致；`tmp/rts/codex-2026-10-11/material-red.log`。
- Green：5 檔 90 項通過；strict TS 與 22.45 秒 production build 通過。獨立 consultant 僅對 correctness／ownership APPROVE，未宣稱性能收益。
- 60 秒交錯量測順序：pool 60.24 FPS／p95 20.9 ms／3,195 frames；原材質 diagnostic override 59.88 FPS／p95 25.0 ms／3,092 frames；pool 再測 59.88 FPS／p95 25.1 ms／2,951 frames。均保留 80 單位、20 建築、1080p、騎士動態肖像、全部可見、陰影與正式資產，零頁面錯誤。原材質 override 已明標 `formalAcceptance:false`，不當作現版正式驗收。
- Ruling：先前 48.08 FPS 與首輪 60.24 FPS 不能直接歸因材質池；交錯結果沒有穩定改善，所以撤回。候選為 `models-material-pool-candidate.ts`、`model-material-pool.test.ts`；log/report 各為 `perf-material-pool`、`perf-material-old-comparison`、`perf-material-pool-repeat`。
- 回復核對：`models.ts` SHA256 `ac2ab70832cf8bbda6f8fd7f5ff2c08433fa46b7ab20c4d492cd60e8e13eed9c`，與實驗前備份相同。恢復後 5 檔 93 項通過，含迷霧修復與原有模型／施工／肖像測試。因候選未保留，不再為候選重跑完整回歸或整理 commit。
- 恢復後正式建置 18.46 秒、60 秒正式效能 59.88 FPS／p95 25.0 ms／max 229.1 ms、零錯誤，當次門檻通過；`perf-restored-final/`。此結果證實先前性能差異不能直接歸功於已撤回的材質池。
