# RTS 原創模組零件製作交接（2026-10-08）

首批 12 個建築版本與石橋已改由同一套原創 Blender 零件庫及 13 份組裝配方重建，形成可操作的候選預覽。**效能驗收未過，先前本機接入已撤回；13 個遊戲模型及 building registry 已恢復本輪前版。**這是製作流程遷移；整體美術及全遊戲模組化尚未完成。

- [旋轉、拆解、單件檢視與下載零件庫](http://127.0.0.1:4334/modular-kingdom/)
- [本機遊戲](http://127.0.0.1:4324/games/rts/)
- [最新瀏覽器拆解截圖](../../art-factory/rts/runs/modular-kingdom/2026-10-08-v1/qa/review-final.png)
- [暫時接入時的河谷截圖（非目前 runtime）](../../art-factory/rts/runs/modular-kingdom/2026-10-08-v1/qa/published/river-base.png)

## 已完成的組裝流程

Run：`art-factory/rts/runs/modular-kingdom/2026-10-08-v1`。唯一風格指南仍為 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。製作入口與命令見 `art-factory/rts/README.md`。

`鎖定原創來源 → Collection 零件庫 → JSON prefab → linked Blender assembly → 材質合批 GLB`。原始零件可編輯、具版本與來源 SHA；組裝檔真正連結共用庫，遊戲輸出另做合批。未更換 Three.js 或遊戲引擎。

- 庫有 **87 個零件／尺寸變體**，不是 87 個皆可跨建築互換的標準件。
- **7 件跨 prefab 共用**：兩種主城窗、一種主城門、四種基座。二階與三階主城的門窗是相同 Collection 資產。
- 石橋用 8 個零件組成 33 個位置，包含 8 塊橋面與 20 段欄牆的內部重複使用；橋件沒有宣稱與建築共用。
- 門窗由宿主的已註冊接點定位，驗證位置、方向、介面、版本及剛體矩陣；拒絕非均勻縮放、鏡像、循環、缺件、路徑越界和來源漂移。
- Blender 使用公尺、Z-up、朝 -Y；GLB 轉為 Y-up、朝 +Z。舊件錨點以 1 cm 對齊並記錄幾何偏移，新結構名義尺寸規則為 1 m；尚不是可任意拼接的新牆體網格套件。
- 同名但不同尺寸的屋頂保留各自變體，沒有拉伸屋頂假裝共用。

來源庫 SHA：`c34fe80c090d70464783bf82c37c4b0dd277a0ee44054cc0c0322fb5cfa9ce7f`。`kit.json` 鎖定庫、source-lock 及全部 recipe；source-lock 再鎖原始 Blender 和前版 GLB。缺鎖即停止，現有 run 不能用 `--init` 靜默重設。

唯一 UV 例外是城堡尖拱窗飾框：原本整棟投射導致相同窗件 UV 不同，改為零件局部投射，維持每公尺 0.5 次重複密度。其餘來源幾何、法線與 UV 保留。GLB 共 5,686,948 B，較前版多 111,796 B；13 件三角面數及合批數完全一致，最大世界座標表面誤差 0.000000584 m。

## 真共用的驗證

在隔離的 `qa/propagation` 複製庫中，把同一窗件的一條窗格移動 4 cm，提升該 part version，再從兩份原配方重建。二、三階主城均僅 `window-00` 改變；其餘 9／11 個位置不變，原庫 SHA 不變。這份變形測試來源與 GLB 明確禁止進入 runtime。

唯讀代理 `rts_building_detail_audit` 在撤回前抽查 13 個 public／candidate／registry SHA、recipe、source-lock、linked assembly 及傳播結果，實際開啟二階主城 Blender 組裝檔核對同庫連結，未發現組裝與來源阻擋。後續複審明列效能為阻擋。接點漂移與來源鎖缺失的早期問題已補失敗測試再修正。詳見 `qa/independent-review.json`。

## 實際驗證

- Python contract：**9/9**；包含成功組裝、來源／路徑、介面、矩陣、循環、接點位置與方向邊界，有先紅後綠紀錄。
- 全套 Vitest：**140 files／1,429 tests** 通過，獨立執行 38.24 秒。
- Chromium RTS E2E：**13/13** 通過，包含雙圖、採集／建造／訓練、科技、英雄、暫停／重開與材質 503 重試。
- RTS strict TypeScript 檢查及 production build 通過。沒有宣稱不存在的 ESLint／Prettier 檢查。
- Khronos validator：13 GLB **0 errors**。仍有 97 個 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings，材質切線由 runtime 產生，不能報成零警告。
- 預覽全部 13 個選項可載入、旋轉、拆解、還原，兩主城可單獨查看共用窗，庫與配方可下載，瀏覽器錯誤為空。
- 發布前後兩張地圖的選取、迷霧及實際採木耗盡檢查通過；全景有測試視野揭露，不是本輪新做的自然玩家勝局。
- 正式 build 的本機 gzip 首圖素材 **30,378,905 B／75 requests**，低於 35 MB。26 張共用材質共 26 requests，沒有重複下載；含其他頁面檔案 30,620,272 B。工人肖像確實有動畫，errors 為空。未驗證部署 CDN 壓縮。
- **效能未通過**。1080p／DPR 1、80 單位＋20 建築及騎士動態肖像，RTX 5090 Laptop，60 秒：首輪 median **42.02 FPS**／p95 **35.4 ms**；等待已知外部 benchmark 結束後 **38.02 FPS**／**35.6 ms**；暫停本工作樹 dev server、改用正式靜態 host 與打包 fixture 後 **35.71 FPS**／**35.5 ms**／max **45.6 ms**。55 FPS／p95 <33 ms 門檻均未放寬。每輪實際載入 17 模型的 SHA 與當時 public 一致，errors 為空。
- 舊 GLB 的同腳本診斷為 **34.97 FPS**，但與另一工作樹 CS benchmark 重疊，不能當成隔離 A/B 證據。first 結束約 3.3 秒後該 CS 程序才啟動，因此不能用它解釋 first 42 FPS；先前口頭推測已按時間戳補正。
- 13 GLB 的 node／mesh／primitive／索引、材質／貼圖、階層／變換及 shader 設定一致，頂點 +2.29%；獨立審查未找到新模型觸發不同逐幀 CPU 路徑的證據。短時 timing 的 animate／battlefield／hud wrapper 計數為 0，未捕捉實際呼叫，不能據此排除成本。render／GPU 數值混合 world 與 portrait，不能當整幀成本。**根因未查明，不宣稱環境是唯一原因或效能沒有退步。**
- 各輪 `qa/performance*`、失敗 log、舊模型路由診斷與正式靜態 host 均保留。正式 host 首次遇舊 fixture 替換器不支援 CRLF，僅在診斷副本正規化換行後執行。其他工作樹及使用者程序未停止，本工作樹 4324 dev server 已恢復。

完整命令、結果及固定證據見 `qa/verification.json`、`qa/logs/` 和 `qa/code-snapshot.json`。

曾有兩個環境性失敗：預設 Playwright 配置連到其他 worktree 的 4002 port，RTS 頁面回 404；改用現有 RTS 專用配置與 4324 port 後 13/13 通過。另在多個重型程序並行時，既有 Tetris import 測試超過 5 秒；停止並行負載後完整 1,429 項通過，沒有放寬 timeout 或修改斷言。失敗 log 一併保存。

## 範圍與後續製作界線

角色身體、共用骨架、裝備插槽、蒙皮接縫及動畫尚未遷移至此庫；植被與其他地標仍沿原 registry。既有角色品質、建築基座、地標卡片和局部材質問題不會因換製作流程而自動解決。整體美術仍待使用者檢視。

接點驗證目前鎖定已登記的宿主開口位置，沒有從任意牆面網格自動推算接縫。新牆、屋頂尺寸族、人物骨架模組及跨模組 LOD 接縫須另有契約和驗證。

新版本應保存舊庫、修改零件及版本／hash，再重建受影響的 prefab；不要用首次來源匯入器 `modular_extract.py` 覆蓋人工修改。發布只允許經 QA 的合批產物。目前 contract、root-review、modular registry 與 preview 均明列效能失敗及禁止 runtime 發布。`qa/publication-initial.json` 保存暫時發布證據，`qa/publication.json` 記錄撤回及 13 個恢復 SHA。未 commit、push 或對外部署。

採用的製作慣例參照 [Blender Collection Instances](https://docs.blender.org/manual/en/5.2/scene_layout/object/properties/instancing/collection.html)、[Blender Asset Libraries](https://docs.blender.org/manual/en/latest/files/asset_libraries/index.html) 與 [Epic 靜態網格管線的 pivot／socket／LOD 規則](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine)。這些是工程做法參考，並非任何「業界標準認證」。
