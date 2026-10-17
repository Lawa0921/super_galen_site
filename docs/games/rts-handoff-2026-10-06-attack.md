# 原創弩兵射擊動作局修交接

模型、骨架與動作全部維持原創。這輪修正弩兵原本約 60 度偏側的弩軌，完成朝前舉弩、瞄準、短促後座、降弩與恢復握持。**完整 Attack 仍為 `qa_failed`**：左手射後手勢穿模，沒有手指開合或可動弩弦，不能接入正式遊戲，也沒有宣稱整體人物可商用品質完成。

[可操作預覽](http://127.0.0.1:4334/crossbow-attack/) · [實際瀏覽器截圖](http://127.0.0.1:4334/crossbow-attack/still.png) · [瀏覽器播放錄影](http://127.0.0.1:4334/crossbow-attack/playback.webm)。預覽點「射擊」再「播放」，可切換兩個 LOD、藍／紅隊和視角。遊戲仍在 [4324](http://127.0.0.1:4324/games/rts/)，人物 runtime 未換版；松林進展另見 [pine 交接](rts-handoff-2026-10-06-pine.md)。沒有 commit、push、merge 或對外部署。

工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`；分支 `feat/browser-rts`。既有大量未提交修改保留。Run：`art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1`；入口為 `qa/root-review.json`、`qa/release-results.json`、`qa/evidence-index.json`。

## 固定版本與保留範圍

來源為上一輪 drape blend，SHA `b71117a218a8eba1a45b52309fcb816a6749a5d88abd5d1d5d966bde958b9181`。沒有引入第三方模型、骨架、mocap 或動畫。原 body／裙甲／雙手／弩的幾何、拓樸、UV、權重、材質指派、實際引用貼圖與隊色 mask、20 根 bind bones、所有非 Attack clips 都保持相同。Attack 只修改明列的肩臂八骨與胸／頸／頭，共 11 骨曲線。

| 最終檔案 | SHA-256 |
|---|---|
| original-crossbow-grip.blend | 5ab95a9b070d33a83ccc871ce092414ad513804152fc38e73f70b02556117c37 |
| original-crossbow-grip-lod0.glb | 964212a28675df22310e600b6759e34c13dbc292d229dc42b603da25302c76ba |
| original-crossbow-grip-lod1.glb | 49e604afcf3a4ab1dfc0c402e7238d2691ba5ad0fbb5be1ddb4f46acf23693af |

Blender 保存會移除三個未被任何 mesh 材質槽引用的 orphan bake helpers：`QABake_mask_0/1` 與 `TeamClothMasked_crossbow_original.002`。驗證比較所有 mesh 引用材質，沒有略過實際使用的貼圖或 mask；來源檔未改。清單與理由記於 `qa/unused-materials.json`。

## 修正及實際驗證

- 舊版測試 2 fail／1 pass：弩軌整段偏側約 60 度、左手沒有獨立射後手勢。新瞄準段弩軌朝前，誤差小於 3 度，舉弩超過 18cm；局部動作測試共 5 項通過。
- 分開插值兩手會讓左拳離開握把；改為握持段依 `Hand_L = Hand_R @ relative` 求解。新增兩項回歸曾因握持偏移與端點差異正確失敗，修後通過。0／40 幀的手臂矩陣回到 Idle。
- 原固定肘向讓袖口捲入握把。量測可達肘平面後調整前臂接近方向，沒有拉長骨骼或平移武器掩蓋問題。
- 整數幀關鍵影格仍會在中間插值時偏離抓握；現以每 1/8 幀解算、烘焙與匯出，原始時間仍是 24 FPS、40 幀／1.6667 秒。
- 首次降弩 14→18 幀過快。保留失敗候選於 `iterations/rejected-fast-lower`，改為 14→20 幀；手勢為 25／31，36 回到握持。速度門檻改按採樣間隔換算，保留原有等價 5.76m/s 上限，避免加密採樣把快速動作誤判為通過。

| 檢查 | 實際結果 |
|---|---|
| 資料保留 | geometry／UV／skin／bind／引用圖片與 mask 全相同；未修改 clips 與 Attack 白名單外曲線相同 |
| 全弩對 body／兩手接觸，每 1/16 幀 | 雙 LOD 共 1,282 個姿勢；握持段 0–20、36–40 的 772 個姿勢零交點。其餘 494 個失敗姿勢在 20.3125–35.6875，整體仍 fail |
| 五 clips 匯出，每 1/4 幀 | 兩 LOD 共 1,594 個姿勢，骨矩陣／武器頂點 parity、武器離地與速度限制通過 |
| Attack 匯出，每 1/16 幀 | 兩 LOD 共 1,282 個姿勢；最大骨矩陣差 3.22e-6、武器頂點差 1.59e-6m；最大頂點速度 4.44547m/s，小於 5.76m/s |
| Khronos | 每 LOD 0 errors、4 個既有 skinned-mesh parent warnings |
| 真實 Chromium | 雙隊／雙 LOD／11 幀／3 視角共 132 張姿勢圖，播放暫停、拖曳時間軸、手機尺寸通過，page errors 0；另錄製 4.2 秒播放 |

494 是失敗的「幀／LOD 採樣」數，不是三角交叉的總數。接觸檢查針對全弩對 body 與兩手的非共面三角交叉，不等於全身自交或機械運作驗證。`contact-coarse.json` 是較早候選的歷史證據；最終以 `contact-dense.json` 與固定 SHA 為準。

唯讀顧問獨立核對最終三個 hashes、132 圖報告、指定姿勢、dense contact 及兩份 export 報告，接受 0–20 與 36–40 的局部進展，未批准整條 Attack 或 runtime。沒有新增腕肩破裂的離散圖證據；仍不可把這份抽查當全角色外觀驗收。

本輪沒有改 app/runtime，未重跑全站 Vitest／RTS E2E／production build 或效能測試，亦未引用舊版通過數作本候選驗收。Python／Blender 工具、實際 GLB 與瀏覽器檢查的命令、原始 log hash、真實退出碼列於 `qa/release-results.json`；完整接觸檢查的退出碼 **1** 原樣保留。

## 後續原創製作

先處理左手拓樸與手指開合，再做抓弦／拉弦／放箭機構。原手套全部 rigid skin 到單一 Hand bone，沒有 finger groups、finger bones 或 shape keys；直接移動閉拳不足以裝填。需要可追溯的掌／拇指／指節分區與張手姿勢，不能只把全拳移到弦附近或放寬穿模門檻。形狀鍵或新增原創指骨都須重新驗證 mesh、bind、匯出與 runtime 契約；目前尚未選用或完成其中任一路徑。

臉部、手套雕塑與材質、射擊表演、Walk、其他兵種、岩壁／河岸／遺跡仍未達完整驗收。新射擊預定釋放在 frame 12（0.5 秒），遊戲目前遠程投射物仍在攻擊開始時產生；資產通過後須另做 projectile cue 同步、遊戲場景／3D 肖像與效能驗收。原始整體目標繼續保持 active，未要求使用者改用外部素材。
