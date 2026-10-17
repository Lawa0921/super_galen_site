# RTS 原創模型與地圖細節實作計畫

> **For agentic workers:** Use superpowers:executing-plans. Root is the sole writer; the existing audit agent is read-only.

**Goal:** 提升遊戲視角與近景的原創建築、裝備及岩岸材質／立體細節。

**Architecture:** 從 registry 指定的已發布 Blender/GLB 複製新候選。建築增加有功能的門窗／結構細節並覆用原創生成材質；武器以不變骨架、動作、握持資料為硬限制。地面依現有分區遮罩增加法線與粗糙度，保留地圖通行與經濟資料。

**Tech Stack:** Blender 5.2, Python/Pillow, Three.js, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-10-04-browser-rts-design.md

## 範圍與驗收

- 全原創；沿用石灰岩、深藍、黃銅與舊皮革。來源、衍生、候選、QA、發布記錄集中於 factory。
- 不換骨架／動畫，不動地圖阻擋、採集、建造和對局邏輯。
- 保留 editable Blender、原始來源與前版；正式 GLB 來源及 SHA 可追溯。
- 建築 ≤ 20k triangles、單檔目標 ≤ 1.5 MiB；地圖岩石提高輪廓而非任意細分。
- 1080p / 80 單位 / 20 建築 / 動態肖像 ≥ 55 median FPS；首局壓縮遊戲資產 ≤ 35 MB。
- 實際 WebGL 同視角前後比較，雙地圖操作、瀏覽器無錯誤、相關 unit/E2E/type-check/build 通過。

## 實作步驟

- [x] 原創材質與建築：建立 detail-refinement 合約；從既有 generated stone/slate/wood/steel/cloth 來源衍生 PBR；先 townhall/barracks 立面與窗框細節候選，近景檢視後拓展同系建築。
- [x] 裝備：為衛兵劍盾與弩兵武器建立 PBR 候選，沿用原 UV；以原 GLB 動畫／skin／position 資料相等驗證保留動作、接觸與 LOD，不移入已拒絕整角候選。
- [x] 岩岸與地面：細修既有岩石真 3D 輪廓；先寫地表細節成功／缺材 fallback 回歸測試，見紅後實作遮罩一致的法線／粗糙度。
- [x] 組裝：獨立 candidate route 實際地圖／近景檢視；通過後本機發布與 registry 雜湊回寫。新 review 子頁提供建築、人物與雙地圖。
- [x] 完整驗證：相關／全套既有測試、strict TS、Chromium 操作、build、壓縮載入與獨占 GPU 效能。唯讀獨立代理抽查來源、動畫保留、圖面及剩餘風險。

下載初測超出預算，增補 `ModelLibrary` 範圍的共享材質載入器與失敗重試，採先紅後綠驗證。最終資產 30.36 MB、median 60.6 FPS；完整證據與仍存在的美術／再生限制見 `docs/games/rts-handoff-2026-10-07-detail.md`。

## Review Focus

- 重複材質的下載成本、UV 縮放、金屬過亮與石材被照白。
- 門窗凹凸在 RTS 視角是否可見，而非僅 Blender 近景。
- 武器 UV／PBR 不能改變權重、握持、動作時間或隊伍色。
- 岩石維持原通行占地，法線不得造成地表視覺翻面或破壞河岸遮罩。
- 原生成貼圖只做 deterministic 衍生；使用者整體品質接受仍待 review，不能以機械通過取代。
