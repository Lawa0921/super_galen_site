# CS 模組化組裝實作計畫

**Goal:** 以可重用資產庫與接點配方製作並交付西側城牆，作為既有遊戲的第一個完整模組化切片。
**Architecture:** 原始授權 glTF → canonical part catalog／Blender collections → socket prefab／scene recipe → 局部靜態合併 → 本機 environment.glb。來源可編輯且不依賴已合併地圖反向拆分。
**Tech Stack:** Python／NumPy、Blender 5.2、glTF 2.0、既有 Three.js／Playwright。
**Spec:** `docs/superpowers/specs/2026-10-08-cs-modular-assembly-design.md`

## 約束

一位主要寫入者，保留既有修改；原創舊城風格、核准 CC0 來源、背景測試。Y-up 公尺，整個 kit 共同 uniform scale；32 environment primitives、90k triangles、28MB runtime 上限。不可行走 gate 不標為 physics ready。不得啟用原生桌面 helper 或新增可見終端。

## 任務與驗收

- [x] `source/cs_kit_assembly_v31.py` + `test_cs_kit_assembly_v31.py`：先 RED，再實作接點圖解析、相容性、重複 socket／循環／非法 transform 拒絕、世界 bounds 與邊界外景驗證。輸出各 instance matrix 與接縫證據。
- [x] `source/build_cs_kit_v31.py`、`contracts/modular-kit-v31.asset-contract.json`、run 的 catalog／recipes：從固定 SHA 的官方來源建立四種零件，保留 geometry/material 語意、建立 Blender assets/instances，輸出實際 bounds、source anchors 和授權。兩短牆方案因材質黑縫拒絕並隔離；現行 prefab 引用同庫原生 16m 長牆，通過法線、來源資料與碰撞用途檢查。
- [x] 編譯候選 environment：保留全部其他 mesh、材質、圖片與既有物理；只替換唯一獨立西牆節點，控制 primitive 與檔案預算。源碼快照、候選 hash 與 reviewer 結果綁定；重建四項輸出 byte-identical。
- [x] 背景查看零件庫、整體組件和遊戲鏡位；375 Python、142檔／1459 unit、60 CS Chromium E2E 與 build 通過。高低畫質各180秒原生操作、獨立檢核後更新本機 runtime registry。`qa/preview.html` 通過桌面／窄螢幕驗收，其他模型家族仍待遷移。

高風險輸入：重複 ID、前向參照與循環、相容 family 但方向錯誤、碰撞越界、source SHA 改變、舊環境 hash 不匹配。這些輸入必須在寫出 runtime 之前被拒絕。素材形狀與接縫需額外實際看圖，不用數值通過取代美術驗收。
