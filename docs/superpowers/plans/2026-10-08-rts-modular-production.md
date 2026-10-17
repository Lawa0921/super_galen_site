# RTS 模組組裝實作計畫

> **For agentic workers:** Use superpowers:executing-plans. Root 為唯一寫入者，既有 audit agent 唯讀檢核。

**Goal:** 讓 12 建築版本與石橋由可連結零件庫及配方重建，實證跨建築共用與更新。
**Architecture:** 原創來源鎖定 → 語意部件 collection library → 經驗證 JSON recipe → linked Blender assembly → 合批 GLB；runtime 邏輯不另加組裝引擎。
**Tech Stack:** Blender 5.2、Python/numpy、Three.js、Playwright、Vitest。
**Spec:** `docs/superpowers/specs/2026-10-08-rts-modular-production.md`

## 約束與 Review Focus

- 不覆蓋前輪來源；不改角色、導航、玩法、字型。來源 SHA 必須 match，缺失不得 fallback 到另一版本。
- 所有物件恰好收錄一次，collection instance 匯出不得漏掉；保存材質／UV／normals／world matrix。
- 門窗插槽與原牆洞一致；同名而不同尺寸／材質不錯誤去重；屋頂不以縮放冒充變體。
- bridge 保持已校準平橋，不使用舊高橋 generator；catalog footprint 保留。
- 真共用與重建傳播實驗是硬驗收；不是僅有文件或分資料夾。

## 任務

- [x] `modular_contract.py` + `modular_contract_test.py`：先紅後綠，實作 recipe/part/socket/rigid transform/來源 lock/路徑校驗；成功組裝與缺件／不相容／尺度／版本／漂移邊界。
- [x] `modular_extract.py`：來源13模型、語意group、normalized pivot、fingerprint去重、Blender collection assets/catalogs、source lock、manifest/recipes；只輸出候選。
- [x] `modular_assemble.py`：link library、create collection instances、保存source，再將evaluated meshes實體化合批export；記錄bounds/面数/材質與source parity。
- [x] `modular_verify.mjs`/review tooling：13重建、validator、共用件隔離修改傳播、瀏覽器explode/catalog、既有雙圖組裝與相關檢查；唯讀代理獨立抽驗。
- [ ] 本機受控發布registry與13 GLB；實測preview、full Vitest、strict TS、E2E、build、performance/download；交接明列已／未遷移。

主代理沿既有隔離 worktree 執行；不 commit/push/deploy。不新增第二份美術指南。

## 本輪結果

前四項完成。最後一項的功能、建置、下載均通過，但 55 FPS 壓力門檻未過（正式靜態建置 35.71 FPS），不勾選完整發布驗收。已撤回本輪 13 GLB 的 runtime 替換，保留原創模組庫、組裝來源及可操作候選預覽。根因、失敗時序及限制見 `docs/games/rts-handoff-2026-10-08-modular.md`。
