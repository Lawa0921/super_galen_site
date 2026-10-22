# CS 城市延伸實作計畫

**Goal:** 細化建築五金、石柱與欄杆模型，補齊四方邊界外可見城市／地面／後排天際線，保留既有行動範圍。
**Architecture:** 固定 V31 baseline／原作者 source ownership → local collection assets／scene recipe → source-owned 外移及材質合批 → 候選畫面與原生遊玩驗收。
**Tech Stack:** Python/NumPy、Blender、glTF、既有Three.js／Playwright。
**Spec:** `docs/superpowers/specs/2026-10-08-cs-city-extension-design.md`

一位主要寫入者；其餘代理唯讀。保留既有變更，不修改歷史 run，不對外部署。沿用既有材質與地圖物理；最終環境 150k tris／32 primitives／runtime 28MB，背景驗收。

- [x] `test_cs_city_extension_v32.py` TDD：環形地面、UV、繞序、非法範圍、source transform、逐面一對一映射與追加頂點去重。
- [x] `author_cs_city_v32.py`、`cook_cs_city_v32.py`：作者 ownership、8 種新增零件、完整外景配方與候選輸出；所有舊面與材質驗證。
- [x] Blender 重開：35 個 collection assets、79 個 linked instances、30 張 packed textures；108 條眼高／9 條地面幾何射線通過。15 個原生玩家鏡位。
- [x] 驗證四邊可站／不可站與連續步進不越界；144 檔／1,474 unit、382 Python、59 CS E2E、build 通過。最終高低畫質各 240 秒，存活／觀戰／跨回合皆覆蓋；local registry、來源與證據已封存，preview 的 15 組視角／25 張圖已實際開啟驗證。
- [x] 修正重複 drawing-buffer／composer／SSAO 配置，6 個單元回歸與真 WebGL 呼叫次數驗證通過；另 9 個封存／HMR 工具測試通過，獨立複審 PASS。

效能限制：最終高／低 P95 為 24.9／16.8ms，仍出現 733.4／604.1ms 最長幀。初次低畫質 25ms 超標、後續變動、中斷與無效量測均保留；不宣稱所有卡頓已解決或優於 V31。完整結果在 `art-factory/cs/runs/run-20261008-v32-city-extension/qa/review.json`。

主要風險：背景被近圈完全遮住；角落天空縫；地面接縫與z-fighting；source變形／法線錯誤；外景誤入可行走區；增加幾何造成持續低幀率。上述項目須分別以實際玩家鏡位、幾何測試與原生效能證據判定。
