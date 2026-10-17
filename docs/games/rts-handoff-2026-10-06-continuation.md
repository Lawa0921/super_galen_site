# RTS 第二輪續作交接 — 2026-10-06

## 交付範圍

工作樹 `C:\Users\bag57\projects\super_galen_site\.claude\worktrees\rts`；分支 `feat/browser-rts`。本輪已將 **原創衛兵全身重整版** 與 **弩兵局部肩袖／手腕修正版** 發布到本機遊戲。前輪工兵握持修正版保留。不是全部人物的最終商用品質驗收，也沒有推送、合併或對外部署。

本機遊戲 `http://127.0.0.1:4324/games/rts/`；互動檢視 `http://127.0.0.1:4334/`。檢視頁預設顯示新版衛兵，可選三人物、兩級精細度、五動作、紅藍隊伍與視角，暫停後可拖曳時間；清單及頁首已改為真實接入狀態。

## 衛兵：模型、動作、包絡與實際接觸

最終可發布來源在 `art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/final-bounds`。同層 `surface` 是幾何重建結果，`timing-probe` 是舊高密度模型時序試驗，`final` 是尚缺部分 bounds 的中間版本；不要將這三者誤作最後發布 bytes。

重建原本破碎的胸背甲、肩側支撐面、短裙甲、髖內襯，修正抬膝卡裙甲問題。保留原創頭盔、手臂、閉合握持、劍盾及原骨架。將約九萬面的組裝候選收斂到 **LOD0 19,910／LOD1 9,901** 三角面。幾何階段 55 姿態含子幀、440 次指定裙甲／膝甲配對檢查無交叉；不是全身所有配對的連續碰撞證明。

Attack 使用所有原始攻擊通道共同的單調、連續一階導數時間映射：第 16 幀採原第 18 幀的姿勢，起手與收招端點維持。**catalog 射程 0.58、傷害接觸 16/30 秒、總時長 1.2 秒均未改大或放寬。** 其他四片段曲線以簽章驗證未改。匯出暫時將影格與 FPS 同倍放大至 240 Hz，關閉動畫簡化，保留 editable source 的原 30 FPS；修正原 Hurt 子幀匯出誤差。

實際 Three.js 對全 mesh 世界 extrema 與骨矩陣做嚴格比對，門檻仍 1e-4；兩 LOD 均通過。最終補齊每 LOD 21 個 mesh node 的 conservative bounds，實際 renderer bounds 稽核 maxOutsideDistanceM=0。最後 bounds 修正僅變更 node extras：新舊 GLB 整個 BIN 相同、刪除 bounds 後 JSON 相同，兩份 .blend 的幾何／骨架／權重／動作簽章相同；獨立 reviewer 另用 Blender 唯讀重算確認。

新 `tests/manual/rts-melee-contact-v2.ts` 不再只檢查「有扣血」，而是逐次量測實際 CPU 變形後的全三角形交會。兩 LOD 各跑單挑及四人圍攻，合計 **22 次實際命中、10 個指定接觸姿勢，triangle surface gap 都是 0 m**。每位攻擊者都確實出手，腳底無交疊；測試容差仍 1 mm。證據在最終 `qa/motion-contact-acceptance.json`，原始案例在 `tmp/rts/continuation-20261006-2/guard-v2-contact-*`。這是固定場景、guard 對 guard 的實際模擬與渲染，不是對全部敵種及所有角度的完備證明。

Khronos 每 LOD 0 errors／21 warnings，警告為既有 skinned mesh 非根節點，沒有宣稱零警告。近距離仍可見 LOD1 肘甲較粗、裙布尖折及部分金屬接縫鋸齒。

## 弩兵：局部修正版通過並接入

最終來源 `art-factory/rts/runs/original-crossbow-grip/continuation-20261006-2`，詳細 `qa/handoff.md`。重建原肩袖／腕端銜接，移除有問題的人工覆蓋袖面，保留原本有貼圖的手臂與身體。依實際減面後手套表面校正袖口，修正反向折腕與漏掉內側腕圈的權重問題。原 20 骨 hierarchy/bind、身體 packed textures、手臂區域外頂點位置均保持一致。

LOD0／LOD1 **18,801／9,895** 三角面。全部骨矩陣 source／GLB 最大誤差 **3.2901763916e-5**，低於未放寬的 1e-4 門檻；實際袖口有號向外距離最大 **0.7767 mm**，符合既有 1 mm 門檻，不是零穿透宣稱。13 個相關測試及 20 組實際瀏覽器片段／隊伍／LOD 檢查通過；另以共用發布用 Three 稽核與 Khronos 重跑，兩 LOD 共 0 errors／8 warnings。

獨立複審最初將遮蔽輪廓視為可能斷腕，後續在 **最終固定 hash** 的瀏覽器記憶體中暫時隱藏武器，從另一側看到前臂連續進入手套，關閉本輪局部阻擋。腰前棕色端頭已定位為 `CrossbowWeapon` 的握柄結構，舊版也有，不是已證實的新游離人體 polygon。這些 isolate 操作只用於診斷，未保存到模型或正常遊戲。

**仍未修正的繼承問題：Hurt 時腰帶／裙甲存在角狀變形；厚手套與弩身遮蔽在极近側視角較不易辨識。** 本輪只批准肩袖、腕口及匯出一致性的局部替換，不等於全身或武器美術最終接受。

## 固定發布雜湊

| 資產 | SHA-256 |
|---|---|
| Guard editable .blend | `312cddb12c8fbe02b195f8a8eeda7712bdae8d697e1f7d862bdbb9045d87521e` |
| Guard LOD0／runtime guard.glb | `b86270df5781e3df6ae2f4c7a12f5244edea31a7ad8530615d53cb259c2a8de5` |
| Guard LOD1／runtime guard-lod1.glb | `e4dbcddb433ace40b7e7fcc9a8665191d9056c591b60453c463781ef6019a2b6` |
| Crossbow editable .blend | `ac7c8b91f31ac44222e1f1924939828630cbaadec9b380f5280123bc499cae55` |
| Crossbow LOD0／runtime crossbow.glb | `d49f9a07b11f99c0715fd1399004e7d2b252f9ceba849c7cf2e4edd2fc8d8e5d` |
| Crossbow LOD1／runtime crossbow-lod1.glb | `2544fcbc53de156ebdf3c55c671f3b336c64ac41428a39cc3d0035d28828086b` |

## 審查、發布與後续證據

完整獨立複審：`tmp/rts/continuation-20261006-2/final-review-detail.md`；其中 Guard G1／G2 與 Crossbow C1 已關閉，C2 的物件歸屬與剩餘腰裙限制已釐清。主審固定 hash 的 `root-review.json`、`publication.json`、`publication-scope.json` 位於各最終 run/qa。發布先 dry-run，再執行；衛兵額外走 `publish_original_guard_v2.py` 的面數／严格姿勢／四個物理接觸案例門檻，不僅靠 approval 字串。

本輪 runtime 僅更換 guard、guard-lod1、crossbow、crossbow-lod1 四個 GLB，工兵與其他模型保留。各自對應 registry／contract 已更新；發布前備份在 `tmp/rts/continuation-20261006-2/before-guard-publication` 與 `before-crossbow-publication`。既有未提交檔案不 reset、stash、clean 或任意加入 commit。

完整應用程式測試與效能最終結果見 `tmp/rts/continuation-20261006-2/release-results.json`（收尾檢核生成）。最新 60 秒正式資產效能不是 candidate override：1920×1080 DPR1、80 單位／20 建築全可見、騎士動態肖像、陰影保留；RTX 5090 Laptop 實測中位 **119.05 FPS**、p95 **16.6 ms**、5887 frames，errors 空。瀏覽器實際收到的四個新 GLB hash 與磁碟／候選完全一致。來源 `tmp/rts/performance-release-formal-dedicated-portrait.json`，不是跨硬體保證或嚴格前後效能因果比較。

首輪正式效能重跑曾在啟動戰場時逾時，未產生可用 FPS；保留 `tmp/rts/resume-tsx-1791270103265.log`。新增效能 fixture 完成安裝訊號、點開始前的等待、啟動失敗診斷，以及實際 HTTP 資產 hash 檢核後重跑成功；沒有放寬 FPS 或減少負載。不單憑成功重跑聲稱已完全證明逾時根因。較早 LOD0 group 被 Vite 開發熱重載中斷，也保留失敗並完成同最終 bytes 的重跑。

後續美術重點應是弩兵既有腰帶／裙甲變形、全身造型與武器可讀性，再擴展到其他兵種；不要重做已通過的衛兵時序或退回舊候選。
