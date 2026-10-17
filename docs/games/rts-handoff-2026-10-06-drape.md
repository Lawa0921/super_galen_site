# RTS 原創弩兵裙甲 UV 交接（2026-10-06）

[互動預覽](http://127.0.0.1:4334/crossbow-drape/) · [瀏覽器截圖](http://127.0.0.1:4334/crossbow-drape/still.png)。全原創模型、骨架與動作持續保留。本輪修復裙甲黑色碎片與貼圖斷裂，候選未替換遊戲模型，未 push/deploy；整體可商用人物、所有兵種與地圖目標仍未完成。

前份：[身體連續表面交接](rts-handoff-2026-10-06-body.md)。Run：`art-factory/rts/runs/original-crossbow-drape/2026-10-06-v1`；入口 `qa/root-review.json`、`qa/evidence-index.json`。完整人物仍標 `qa_failed`，局部裙甲 UV 機械檢查通過，`runtime_publish_allowed=false`。

## 根因與修復

腰带本身兩 LOD 各 401 姿勢的最大相對邊長變化只有 `2.88444e-5`／`8.56631e-6`。黑色碎片在無光 albedo render 仍出現，故沒有再修改骨架或腰帶權重。

從同一原創封閉母模重烘焙 albedo／隊色 mask。Smart UV、Angle Based 兩版分别檢出 127、182／167 次內部像素碰撞，均隔離到 `iterations/rejected-planar-overlap`、`rejected-abf-overlap`。改用既有工具環境 xatlas 0.0.9 分 chart；這是 UV 計算軟體，沒有引入第三方美術、骨架或動作。

第一版 xatlas 雖無重疊，仍有三個可見黑片。從正面 1000px 圖的 `(422,367)`、`(463,409)`、`(445,429)` 發射相機射線，命中原 body faces `12640/13858/13838`，z 約 1.020–1.066、material=0；這些裙甲上緣被原 `z<1.035` 全頂點選面漏掉。回歸測試先正確失敗，再補齊至 `z<1.17`。候選只更換腰帶／裙甲 face-corner UV 與獨立材質，其他幾何、皮膚權重、20 bind bones、五動作、雙手與弩均保持相同。

**早期診斷更正**：`qa/uv-baseline.json` 的 46／36 個長 UV 邊面實際在袖口；不是裙甲問題的證據。原報告保留，不將它當本次裙甲的紅燈。可靠紅燈為上述三個實際畫面位置的選區回歸，以及凍結 ABF 的真實重疊。

## 固定候選及驗證

| 檔案 | SHA-256 |
|---|---|
| original-crossbow-grip.blend | b71117a218a8eba1a45b52309fcb816a6749a5d88abd5d1d5d966bde958b9181 |
| original-crossbow-grip-lod0.glb | 713640bd356d2fa3f7020a534a2ecaddcb875e7c082f65f4f0e9d0a06cfbf7fb |
| original-crossbow-grip-lod1.glb | 81ecf0e27c8ce0b90cd4fd7da087c4d5aebe24dd0466d0572df4adbda393a965 |

| 本次實跑 | 結果 |
|---|---|
| 選面回歸 | 2 cases，修前上緣測試 fail、修後全部通過，手臂與下腿保留 |
| 原創資料保留 | source geometry/topology/weights/bind/actions 完全相同；未選角 UV、原材質圖片 bytes、非 body objects 完全相同 |
| 1024px bake | LOD0 535,032／LOD1 492,893 個內部 texel，重疊及白色來源烘焙漏點皆 0 |
| 連續 UV | 3,617／1,392 triangles，27,091 組 AABB pairs，含共享 edge；交集面積 >1e-12 UV² 的組數為 0，chart 內翻向／零面積皆 0；4 個控制案例通過 |
| Source／GLB body | 兩 LOD 各為單一封閉有向表面，邊界、非流形、繞向錯誤與退化面均 0；3,408／2,380 個 UV 重複點權重一致 |
| 匯出差異 | rest 最大偏差 0.000000523m，權重最大 L1 差 0.000000150；全角色 18,516／9,648 triangles |
| Khronos | 每 LOD 0 errors、4 個原有 skinned-mesh parent warnings |
| 瀏覽器 | 18 張藍／紅 before-after、60 張五動作雙 LOD 姿勢，逐幀／播放暫停／手機；page errors 0，GLB SHA 核對通過 |

獨立顧問另做 UV triangle clipping；主流程以 `original_crossbow_drape_uv_area.py` 重現相同 20,145／6,946 個候選 pair 及零重疊結果。獨立視覺複審與主流程確認 Rest／Hurt8／Walk10 正背面舊黑片已消失，金邊連續、未見新色偏；中央下端原有細小缺口與低模輪廓仍在，1024 bake 略柔。這不是逐幀／全部 mip 的完整視覺證明。

本輪沒有重新跑前一版的 802 姿勢袖口／武器接觸與 1,594 export 姿勢；沿用凍結来源的證據，並以本輪 geometry/skin/actions exact、全頂點 GLB parity 與瀏覽器動作補驗限制變更範圍。沒有改 app/runtime，未把歷史全站測試或效能數字算成本候選的驗收。

## 尚未解決與下一步

- 原始造型凹凸、裙甲下端鋸齒、臉與手套、原創步行／裝填自然度仍需重製。瀏覽器還有前後版本共有的投影陰影鋸齒；不能把它誤判成新 UV，也未宣稱已修復陰影。
- 新 GLB 有兩個 body 材質、每個精細度額外一張 1024 albedo／mask；LOD0 4,218,576 bytes、LOD1 3,909,320 bytes。接入遊戲前需量測新增材質 draw call、載入與群體效能，驗選取肖像與實戰。
- Runtime crossbow hashes 仍為 `0970c9c5…`／`6decb613…`，沒有偷換失敗候選。
- 兩張地圖已重新於 4324 實跑擷取，`tmp/rts/landscape-current-20261006` 保存六張圖與 assembly.json，page errors 0、fog 物件數核對通過；這只是現況證據，本輪尚未改地圖。兩圖皆為平地與相同 oak，隘口是規則石列，河流與橋頭缺少自然岸線。下一個美術包優先用原創來源補高原岩壁、松林與河岸層次；必須保存三隘口／兩橋通道與資源可達性。現有 registry 沒有 pine／cliff-face／reeds／ruins，不能聲稱已有这些資產。

## 重現

Blender 使用 `-b --python-exit-code 1 --python`，工具位於 `art-factory/rts/tools/`：

1. `original_crossbow_drape_selection_test.py`；`original_crossbow_drape_bake.py`（外部 UV Python 可用 `RTS_UV_PYTHON` 指向既有 xatlas 0.0.9 環境）。
2. bake 加 `-- --coverage-only`；`original_crossbow_drape_verify.py`；`original_crossbow_drape_uv_area.py`。
3. `original_crossbow_body_verify.py -- --run <run> --source <前份body blend>`；`original_crossbow_drape_probe.py -- --candidate`。
4. `node original_crossbow_validator.cjs <run>`；`node original_crossbow_carry_package.mjs <run> crossbow-drape`。
5. `node original_crossbow_team_surface_browser.mjs <run> crossbow-drape crossbow-body`；設定 `RTS_REVIEW_URL=http://127.0.0.1:4334/crossbow-drape/` 後執行 `original_crossbow_weapon_browser.mjs <run>`。

重製前先隔離現有候選；工具只輸出 factory／review，不發布 runtime。所有原始生成、失敗候選與必要來源皆保留。
