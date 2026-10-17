# RTS 弩兵腰裙續作 — 2026-10-06

繼承 `rts-handoff-2026-10-06-continuation.md` 的衛兵、工兵與弩兵肩腕成果。此次只將弩兵腰帶／裙身綁定修正接入本機；模型與動作維持原創。沒有 push、合併或對外部署。完整商用人物美術仍未完成。

最新弩兵 run：`art-factory/rts/runs/original-crossbow-waist/2026-10-06-v1`。Blender source 為 `candidate/original-crossbow-grip.blend`，不是上一輪 grip run。來源追溯、合約、原始失敗、候選與獨立審查均保留。

| 項目 | SHA-256 |
|---|---|
| 上一輪 source | `ac7c8b91f31ac44222e1f1924939828630cbaadec9b380f5280123bc499cae55` |
| 本輪 Blend | `6936e824a34253f6c60dbdb9fc3b707ed9d7eb9fd51081b562ba4fd490315fdc` |
| LOD0／crossbow.glb | `0970c9c51ebc03e8b01528db721291cc801faddf0f60a8e3ebf161ef8bea4c58` |
| LOD1／crossbow-lod1.glb | `6decb6135b3b42a35a6cf67f5dc04df2b1699e1224cdba89752a66e807385ccf` |

原自動綁定把相鄰腰部頂點分派給差異很大的脊柱／大腿權重，Hurt 會扭曲帶扣，Walk 腰帶邊最大相對伸長 270%。新修正讓腰帶核心跟隨 SpineLower，上腹與髖裙使用連續權重過渡。僅兩個 body 的 2494／1573 頂點權重改變；全部 mesh 幾何、UV、材質索引、packed textures、20 骨 bind、五動作曲線及已修腕臂／手套／武器保持一致。源檔重新打開驗證；匯出每 LOD 44 個受保護 attribute／index payload 與 600 個動畫 accessor payload 逐位相同。

測量證據：`qa/regression-before.json` 因原變形正確失敗，`waist-regression.json` 每 LOD 401 個半幀姿勢、2019／1271 條既有腰帶邊，最大相對誤差 0.00005402（約 0.0054%）。`actual-export-verification.json` 最大骨矩陣誤差 3.29018e-5，門檻 1e-4 未改；`wrist-verification.json` 袖口最大有號外側距離 0.776707 mm，既有 1 mm 門檻未改。兩級面數仍為 18,801／9,895，Khronos 每檔 0 errors／4 warnings。

實際 Three.js 檢視涵蓋 20 個片段／LOD／隊伍組合，以及 Hurt 4/8/12、Walk 0/10/20/30/40、Attack、Idle、Death 的 48 張正／側面姿勢。固定相機對比位於 `qa/comparison`；完整檢視在 `qa/waist-poses`。顧問唯讀複審批准局修範圍，主流程另作 root-review、publisher dry-run、本機發布與 46 個 runtime 美術檔的 registry/hash 稽核。發布前備份在 `tmp/rts/crossbow-waist-resume/before-publication`。

目前 preview：[遊戲](http://127.0.0.1:4324/games/rts/)、[三人物互動檢視](http://127.0.0.1:4334/)。弩兵材質 mask 鋸齒、簡化弩身、五官與手套細節仍未達全身最終接受；此次不把局部回歸通過當成商用品質完成。其餘角色、兩張地圖及整體美術仍需續作。地圖最新現有來源為 `landscape-enrichment/2026-10-05/qa/after-v3`；河岸草地偏空、山口岩帶重複與樹叢變化是下一批可見改善點。

本輪應用測試的實際最終結果另記 `qa/release-results.json`。首次及第二次預設全並行測試皆有同一個 Tetris Pixi import smoke 的 5 秒超時（1367 通過／1 失敗）；單檔 12 項通過。第三次改用 4 workers，保留原測試條件與 timeout；所有日誌均保留於 `tmp/rts/crossbow-waist-resume`，不得刪除失敗或宣稱原預設執行全綠。既有 performance fixture 的 CRLF 格式／先前被拒絕的換行修正未在本輪重試或覆蓋。
