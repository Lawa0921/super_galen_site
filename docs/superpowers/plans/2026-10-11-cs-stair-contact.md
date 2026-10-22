# 正式角色樓梯腳部接觸

目標：修正正式 soldier 在樓梯移動時鞋尖穿入下一階的可見問題，保留角色碰撞根位置、上身／武器、既有模型來源與平地動作。

## 已有證據

- 正式模型 SHA256：`a0fef53119a2d172078b2a64ea370050472638df2c61960afc46bb723f2e47e2`。
- `art-factory/cs/runs/run-20261011-continuation/qa/probe-stair-feet.mts` 以現行 `stepMatch` 與 `createTacticalActor`，在 x=19 南北各走 270 幀；逐一檢查 1,704 個正式鞋子頂點。
- 北向 frame 72 的鞋尖位於下一階 z=16.4991、y=2.23386，階面 2.4m，穿入 0.16614m；南向 frame 8 穿入 0.14537m。完整報告 `qa/stair-feet-probe.json`。
- 平地已有最深約 24.5mm 的鞋底偏差；這一輪不能以未經確認的 0.5mm 全域門檻假裝原動作已達標。
- 獨立 consultant 認為可用局部腿部 overlay 處理。原碰撞半徑比延伸中的鞋尖短，因此 actor 支撐面正確並不保證鞋尖離開上一階立面。

## 有限範圍

主代理是唯一寫入者。範圍為新的 `terrain-leg-pose.ts`、對應測試、`tactical-actor.ts` 的 layer 順序與最小必要 renderer QA；模型二進位、動作 bake、碰撞與地圖規則維持既有來源。

1. 先用 `capture_cs_actor_motion_v33.mjs` 的正式 GameRenderer、原光照和第三人稱近景方式，取得兩個最差姿勢前／當下／後各三幀，side 與 oblique 視角。必須以完整 engine 路徑累積 gait phase，不能只把 actor 瞬移到報告座標。
2. 寫真實鞋網格的 Red：雙向各 270 幀，要求樓梯穿入不再比同跑次平地 envelope 更差，並記錄絕對數值。增加平地完全 no-op、airborne／死亡／reset／teleport、暫停重複更新及不可達 rollback 測試。
3. 初始化時從正式 `Human.shoes04` 的真實 topology 選取低鞋底相交三角面；以位置及全部蒙皮權重完全相同作 seam 去重，每側 173 點／291 面。runtime 先檢查 nearby higher-tread，再轉換固定鞋底子集，以 AABB 過濾後將真實三角面裁切至 tread XZ 範圍。平地不做蒙皮取樣，不掃全鞋 1,704 點。
4. 以既有 TwoBoneIK 與 rigid identity mount 做可達性 preflight，再修需要抬升的腿。只擁有 thigh／calf／foot 的旋轉；所有需要修正的腿先預檢，再以 `solveMount` 提交，任一回傳 false 還原全部已套用旋轉。正式行走目前觀測到每幀最多一腿需要抬升；不為雙腿事件製造不合理姿勢。
5. 順序：`gait/flinch → crouch → terrain → aim`。下一幀必須先 `terrain.restore()` 再 `crouch.restore()`。保持 actor root、visual.position、pelvis、spine、chest 與武器 transform 和對照一致。
6. Green 後以正式 GameRenderer 重拍同姿勢與短連續序列，檢查鞋尖、腳跟懸空、膝蓋方向、動作突跳及上身漂移。最多固定 probes／有限 IK；用五角色樓梯場景比較 renderer CPU，不能僅靠 noisy RAF 宣告效能通過。

## 驗收與停止條件

- 相關整檔測試與全套 Vitest 通過；實際 renderer 有圖、`glError=0`、無 page error；既有平地、蹲伏、瞄準、受擊與換槍流程回歸通過。
- 數值減少穿階卻造成明顯腳跟懸空、膝蓋反折或目標突跳，不能視為完成。兩輪局部調整仍未收斂時，保留診斷並換方法，不重試舊 gait／directional candidate 路線。
- 此修正不代表完整角色美術、長幀或商用品質已通過；來源與整體人審仍按既有紀錄處理。

## 實作與驗證進度

- `stair-contact-red-corrected.json`：2 個真實穿階 Red、2 個 composition／pause 控制通過。最初 quaternion 比較的非單位 world decomposition 誤差已在測試端 normalize 修正，未放寬穿階斷言。
- 第一版每側五點取樣改善至 -43.04／-50.82mm，仍不合格。`stair-feet-first-probes.json` 證實鞋底跨過階界、相鄰 probes 分處兩側而漏掉中間表面。獨立 geometry 檢核排除 IK reach，故改用真實 triangle clipping；沒有繼續加密任意點或膨脹 capsule。
- `terrain-contact.test.ts` 覆蓋三個頂點皆在階面外但三角面相交、1mm 邊界掃描、完全未相交及投影退化。角色測試涵蓋平地零蒙皮取樣、騰空／不受支撐／死亡／非 live、不可達預檢、失敗 rollback、骨長／腳掌方向、暫停／瞬移，以及逐腿斜向站行／蹲行的穿入、接觸高度及絕對軌跡。
- 新版全套 Vitest：170 檔、1,675 項通過，2 workers；`qa/stair-full-vitest.json`。正式模型未更動。
- exact 1,704 頂點重測：北向最深 -24.52mm，位於既有平地；南向 -6.87mm，位於同高度支撐面。原先額外穿入下一階的 145～166mm 已移除，仍沿用既有平地 30mm envelope；`qa/stair-feet-surface-probe.json`。
- 正式 GameRenderer before／after 各 24 張、411 幀，頁面與 WebGL error 皆 0、切換檢視未改變骨骼姿勢；`qa/stair-visual-{before,after}-v2/` 含 PNG 與 `walkthrough.webm`。初版部分 oblique 鏡頭位於南側階面內，不能驗收，保留在無 v2 的目錄；v2 改至各階梯下坡側。
- 單看 correction 0→168.8→0mm 不能判斷 pop：北向 frame71→72→73 原始右腳 worldY 為 2.3203→2.3022→2.4888，修正後 2.3203→2.4710→2.4888；原 actor 下一幀升階 200mm。逐腿測試比較絕對軌跡，沒有放寬為任意 lift 門檻。
- 五角色純 pose CPU 初測 mean 0.040→0.162ms、p95 0.067→0.545ms，平地 mean 0.044→0.043ms；當時全站 E2E 並行，此數字不是完整 renderer／長幀驗收。正式 renderer ABBA 對照、受影響 CS E2E、最終獨立視覺檢核仍在進行。
- 舊 snapshot 全站 E2E 已停止以驗證已改版 runtime：Chromium 497 筆中 494 過、3 失敗；Firefox 前 66 筆 63 過、1 失敗、2 skip；其餘 1,922 筆未有結果。不是全站通過，詳 `qa/clean-release-interruption.json`。4004 的原始版本 before 對照伺服器已在拍攝／profiling 後停止，4002 為目前 preview，所有 QA 圖片與影片仍可由 4002 存取。

最終機械驗證：`qa/stair-final-verification.json` 的 full Vitest／build／gameplay 均 exit 0；1,675 單元測試，gameplay 的 Chromium／Firefox 共 15 過、5 個既有 skip。完整 72 CS Chromium 首跑中的唯一失敗是舊 crouch test 提早取得加速途中速度，修改其穩定速度前置條件後整檔重驗通過，runtime 速度未改。相同 runtime 合併覆蓋 72 Chromium／5 Firefox 通過，詳 `qa/stair-cs-coverage.json`。

獨立檢核：程式 delta PASS、48 張 v2 靜態畫面未見新的穿透／整腳懸空／膝反折；逐腿各自 contact count 與 finite gap 保護已補齊。`qa/stair-independent-review.json` 保留限制：靜態圖、最大步幅包絡與短跑 CPU 對照不能批准連續動畫自然度或持續長幀。`qa/stair-motion-envelope.json` 為額外相鄰幀數值診斷，不另立美術標準。整體商用目標仍未完成。
