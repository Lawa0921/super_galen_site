# RTS 完整交付品質修整計畫

> 主代理是目前 worktree 唯一寫入者；其他代理只做唯讀盤點及獨立審查。依 `superpowers:executing-plans` 逐項實作，以原需求與本輪「全部修完達到商用水準再叫我看」為授權，不再要求局部啟動或局部美術驗收。

**Goal:** 完成既定單人、原創人類王國、兩張地圖的完整遊戲品質檢核與修整，消除已知阻擋後才提出整體驗收。

**Architecture:** 沿用現有 Three.js／TypeScript 模擬、原創 Blender 來源及資產工廠。修正回到目前正式來源另開 run；不從淘汰的人物手部試作繼續堆疊，不用編譯、面數或局部測試代替完整品質。

**Tech Stack:** Astro、Three.js、TypeScript、Vitest、Playwright、Blender、Python。

**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md` 是唯一產品及美術方向，仍保留全兵種、動態肖像、兩圖與完整經濟對局。

## 共通驗收

- 每個兵種的原創來源、雙 LOD、完整動作、握持、接地、比例、肖像與遊戲尺度必須一起檢核。每個已知缺陷要有改前證據、修正與複核，不能只將狀態改為通過。
- 建築按零件／配方組裝，驗屋面、柱樑、地基、入口、施工、完成、受擊與摧毀；兩圖檢查區域特色、路網、視覺遮擋與迷霧。
- 操作／戰鬥／經濟修改先有失敗測試。正常與邊界／回歸案例通過後，實跑採集至勝負的自然對局。
- 正式打包 1080p、80 活動單位、20 建築、動態肖像、60 秒，median ≥55 FPS、p95 <33 ms、無連續 500 ms 凍結；首圖壓縮資產 ≤35 MB。記錄實測硬體，不宣稱未測裝置性能。
- 最終全套 Vitest、RTS strict TS、production build、Chromium／Firefox／WebKit 實際流程及專案完整回歸；無 blocker 才交付。測試或工具受限須保持未驗證，不能列作通過。

## 工作順序

- [ ] 盤點八兵種正式來源及目前品質缺口；建立逐項證據，保留原版與失敗候選。
- [ ] 修正動作播放速度、出手／命中時序、工作與施法的完整動作生命週期；驗證停止、改令、死亡、暫停及 LOD 切換。
- [ ] 從正式 `.blend` 修整全兵種握持、全身動作、材質及人物肖像；完成連續姿勢而非零星截圖檢核。
- [ ] 完成其餘建築與兩圖的場景組裝細修；美術與可達性共同通過。
- [ ] 檢核群體移動、狹口、AI、自動採集、完整科技、自然勝負、錯誤恢復與重開資源釋放。
- [ ] 執行完整發布門檻、來源檢核及獨立審查，再提出一次完整驗收。

## 目前狀態

整體 **未達商用驗收**。先前 `assembly-refinement` 只改善三棟建築、衛兵批次及部分效能，不代表人物或全遊戲合格。最新原創人物盤點確認弩兵射擊握持、其他人型開掌、騎士蹄部等仍有缺口。

早先受限環境拒絕 Blender MCP 查詢、WSL 共用規則讀取；Windows Store `python.exe` 無法啟動。Vitest 使用 native config loader，Python 使用 Blender 內附版本。環境更新為完整檔案權限後，WSL 共用規則可讀，Firefox 完成 16 項 RTS 流程測試；未更改系統權限或停用瀏覽器沙箱。Blender 美術作業使用背景 CLI。

2026-10-08 本輪已修正依實際速度播放 Walk、20 Hz 模擬的畫面插值、終點提前待機、框選與技能預覽位置偏差；原創音效改為分層音色、完整事件辨識及有上限的 voice pool。全套 146 個檔案／1,461 個 Vitest 測試、RTS strict TypeScript 與 production build 通過。WebKit 兩圖採集／集結／小地圖操作通過；完整瀏覽器矩陣另記錄實際報告，不能引用過期的 e2e-report.json。

人物仍未合格：commander-equipment v3 全身審查拒絕，證據在 run 的 `qa/independent-review.json`。closed-gauntlet v1 三次 remesh 取消；v2 正規化後完成 remesh，但有 6 條破洞邊與 28 組嚴格自相交，狀態 `qa_failed`。兩者都未進 runtime。下一步需要全手拓樸、握持姿態與完整全身動作製作，不能繼續用局部插槽平移或自動重拓樸通過來代替人物品質。

效能修整：正式 80 單位／20 建築／1080p／動態騎士肖像曾量到 median 48.08 FPS，未達 55 FPS 門檻。CPU profile 證明主要耗時是 Three 繪製提交與階層矩陣，而非植被迴圈。木材區每圖 24 棵樹改為按資源區與 primitive 實例化；保留可點選樹冠、探索範圍、耗盡隱藏、原始材質與陰影。相容雙 LOD 刪除不再使用的純骨骼分支，保留帶附件分支。正式同負載重測為 median 59.17 FPS、p95 24 ms、max 217.2 ms，僅代表此 RTX 5090 Laptop 環境與目前素材。兩圖實際點選／採集／耗盡、全套 146 檔／1,466 測試、strict TS 與 build 通過；三瀏覽器受影響流程 15／15 通過、exit 0，獨立唯讀審查 APPROVE，仍不代表完整商用品質。

原創閉握手套直接減面 v1 仍有 LOD0 8／LOD1 6 組自相交。獨立幾何檢核定位到握柄孔內壁與腕側；原始高模局部 2,098 個三角形無交錯，最嚴重的低模交線長 5.6–7.4 mm。下一候選從原始高模重做，保護量測到的交錯區域，保持原有幾何 QA 門檻；舊失敗候選只作定位證據，不作新表面來源。

受保護直接減面 v2 鎖住 184 個來源頂點後，仍有 LOD0 7／LOD1 5 組交錯，LOD1 最大來源偏差 2.72 mm。獨立顧問要求停止直接減面／QuadriFlow 路線；下一製程是單一 guard 右手的可編輯語意 quad cage、實際武器通道及固定腕接口，通過全身完整動作後再製作 LOD1。原始雕塑的指端與腕口外形也未被批准，不能將來源投影等同成品。兩輪候選都保留為拒絕證據，未發布。

組件分類回歸已修正：`Bridge thick stone road deck` 原先因 `bridge` 內含 `ridge` 被誤列為屋頂；現在比對完整構件詞。Blender 真實分類器 2 項測試與既有 9 項 assembly contract 測試通過。既有 kit／recipe 的歷史輸出未被重寫，需在後續分階段施工資產新 run 重新提取並驗證。

重新使用既有模組的路線也已檢查。以目前 registry 鎖定的 `detail-refinement/2026-10-07-v1/raw/guard.blend`（SHA `f18bd5b1…94a77cf`）為準，右手確實已是獨立閉握 mesh，並非開掌；但 LOD0／LOD1 分別有 92／57 組嚴格自相交，最大交線 10.0／13.3 mm，不能直接作乾淨模組重用。舊 `final-bounds` 檔僅是 upstream，來源指向已更正。下一實驗的來源、武器、腕接口與 gate 固定在 `contracts/guard-right-hand-cage.json`；仍維持原創與完整角色驗收。

新製程先完成來源曲面量測，尚未產出 cage：`tools/guard_hand_surface_chart.py` 對握柄軸 48 個方向、各 321 個軸向切面做內外雙向 raycast。角度索引 7–14 出現 2–5 個分離區間，證實指間空隙不能用單一環繞 loft 自動補滿。量測檔 `runs/guard-right-hand-cage/2026-10-08-v1/raw/surface-chart.json` 只作可編輯指部／拇指／掌部 patch 的建模依據，沒有 runtime 網格或品質通過宣稱。

後續 all-hit 控制量測確認 84 個取樣點包含多層表面，最大殼間空隙 39.53 mm。獨立審查指出 first/last ray 配對及自動封邊會形成假橋，已移除自動封邊：語意分區、四邊連續性、內部取樣與 seam 許可都必須明確，未知邊界保持開放。10 項拓樸回歸與 5 項相鄰 entry/exit 配對測試均先紅後綠。

第一個有形產物是 `guard-right-hand-cage/2026-10-08-v1/candidate/finger-band-02-open-patch.blend`，僅 θ67.5–97.5°、軸心世界 z 0.130–0.158 m 的單指局部。實際全手／局部／獨立曲面渲染已檢視；front 方向由原 render camera `(0,1,.22)` 抽驗，否決盤點中錯誤的 θ180° 推論。原始雕塑沒有解剖標籤，仍使用空間 band ID。兩級加密後 1,714 quad／3,428 tri、288 條預期開放邊、0 嚴格自交／退化／翻面，取樣雙向最大偏差 0.336／0.365 mm，低於預設 0.5 mm。這是密集量測種子，單一小區塊已佔全手 5,000 tri 預算大半，**不能直接複製成完整遊戲手模**。下一步應按指節流向人工整理控制線、修正指端造型，再將高頻細節烘焙；腕部、閉合接縫、材質、骨架與完整動作仍未完成。runtime 未替換。

獨立審查僅接受保留這個局部量測證據，仍禁止直接擴展全手：branch 目前只是固定空間 ROI，尚非經檢視的 source-face ownership；cell 內探針與角點的分支連續性、對應來源面集合的偏差仍待補。已修正 QA 的連通性名詞與實測門檻：cell domain 為 1，但實際 inner／outer mesh 為 2、boundary loops 為 2、邊界 degree 全為 2。15 項 helper 測試通過；兩條實際指縫空 ray 對 source 與 patch 均無命中；原始 0.0774 mm 薄層樣本被 `thin_interval` 拒絕。完整審查與未完成要求保存在 `qa/independent-open-patch-review.json`，這些結果不構成人物商用品質或整手拓樸通過。

v2 已補固定來源面選區：原高模 inner 159／outer 2,852 個 triangle ID，各自單一連通元件、互不重疊。主代理與獨立顧問核對外觀及孔內近照，批准 SHA `fbe8e9fc…91b057fc` 作這塊指部 patch 的 ownership；僅對應單指局部，未批准解剖或全手。新控制網格用手工非均勻 6×10 曲線點、inner／outer 各四條命名邊界，共 180 tri（局部預算 216；全手分配仍為 5,000）。1,497 個 ray 取樣與 1,642 條有界來源面路徑均限定在已核對的面集合；內部探針亦與角點連通，偏差改用各自 owned BVH。雙向最大 0.409／0.427 mm，0 交錯／翻面／退化、2 mesh／2 loops，所有邊界都有名稱。這是較小且重畫曲線邊界的 control domain，不能將與 v1 的面數差宣稱為等覆蓋 LOD 減面。實際候選及三視圖已完成，局部 cage 獨立複核與相鄰手指仍待完成。helper 20 項測試先紅後綠。

本輪全專案 Vitest 在預設併行時有一項未改動的 Tetris Pixi import 超過 5,000 ms；保留逾時門檻並以 `--maxWorkers 4` 重跑，146 檔／1,466 項全通過、exit 0，記錄在 `tmp/rts/commercial-hand-authoring-vitest-bounded.log`。沒有更動 Tetris 或正式 runtime 模型。施工資料契約另已唯讀盤點，見 `qa/construction-data-inventory.json`：現在整棟下沉顯示進度，已合併 GLB 缺零件 identity，後續需從原創 recipe 重出有 metadata 的分階段組件；不可直接把未批准 review exports 當正式模型。

v2 局部控制網格已獲獨立唯讀 APPROVE：1,497 個完整 ray records、1,642 條 owned-face 路徑、120 控制頂點、90 quads／180 tris、56 條全數命名 boundary edges、QA 與三張渲染雜湊皆核對一致。最終候選 SHA `5b158783…ad93f74e`，詳細範圍在 `qa/independent-owned-control-review.json`。此核准只到這一塊開放式 source-owned 控制網格，下一個有限實驗是相鄰手指及完整指縫，仍不能擴稱全手、runtime 或商用品質。原始雕塑的完整指端造型、腕口、武器接觸與全角色動作仍未通過。

v3 完成相鄰 band03 的原創 180-triangle 控制網格；雙向 owned-source 偏差最大 0.455／0.439 mm，1,497 條 ray 與 1,642 條路徑重新核對，沒有外來面或跨層配對。v4 組合 360 triangles、4 components／4 boundary loops、112 條具名邊界，嚴格交錯與非相鄰接觸皆為 0。但獨立審查發現最初 cell gate 只看總數，band03 實際沒有穩定 cell；已修為每個輸入 branch 加 sampled-air 都必須有 accepted cell。原 v4 現在保留 `qa_incomplete_branch_coverage`，不再冒稱雙指取樣通過。

v5 僅把取樣域延伸至 z 0.178 m，未改模型、容差或兩層細化上限。band02／03 各有 20／92 個 accepted cells，另有 28 個 sampled-air cells；1,917 條 ray 中 1,888 可完整配對，0 違規、最大徑向空隙侵入 0.325 mm，296 個 transition cells 仍未驗證。來源、candidate、ownership、provenance、control policy 與座標 frame 都鎖 SHA，candidate 頂點／polygon 順序與 provenance 亦實測一致。保留 patch 的最短距離 11.001 mm 與完整 owned source 的 0.610 mm 屬於不同覆蓋域，不能相減，也不證明完整解剖指縫。42 項 Python helper 測試及全專案 146 檔／1,466 項 Vitest 通過（exit 0），正式 runtime 素材未替換。

下一個有限產出改為完整 `R_F02` 握持手指，而非繼續累積局部 patch。以 v2 接受區作核心，先確認解剖方向與實際握柄座標，再作者製作側面、扁圓指端、指根／關節與唯一 `R_F02_PALM_IFACE`；上限 650 triangles，完成時僅一個連通元件與一個掌部接口邊界，0 交錯／非預期接觸／退化，並核對實際 12 邊、22 mm 劍柄。完整定義已記入既有 hand contract。通過後才能依同一拓樸規則製作其餘手指、掌部 web、拇指與腕口，再進 UV／材質／LOD／整角色動作；局部測試綠燈不替代這些形體工作。

v6 已產出第一個完整表面候選（418 tri、1 component、唯一 22-edge 掌部接口，0 交錯／接觸／退化，120 個接受區頂點不動），但主代理實看四視圖後拒絕外形：指端尖錐、指根像長折片，且來源對照顯示近端延伸跨進掌前空間，角度對應的近端／遠端方向可能反置。拒絕證據保留於 `v6-digit02-shape/qa/root-shape-review.json`；不得以拓樸綠燈批准。下一步先做有限的原始周向截面與連接方向核對，再修正指根方向及扁圓指端；不再沿未確認的語意累加幾何。

獨立截面確認 v6 方向確實相反：原始 z=0.145 m 的指體從 θ67.5° 向下降角連續延伸，θ110–140° 全無來源交點。v7 保留 120 個接受區頂點，將指根改為 45／15／−15／−30° 四截面，指尖由高角端向 101／106° 短延伸，再用寬鈍 quad-strip 封端。504 tri、1 component、唯一 22-edge 掌接口，0 交錯／接觸／退化／winding error；主代理另重算 boundary loop=1、Euler=1，五張渲染 hash 一致且已完整取景。獨立審查有限批准 SHA `f50cf4e7…61db883` 作為實際握柄適配的固定輸入，**仍不是完成的手指**：掌接口上緣的角狀隆起要在掌部接合時修正，實際 12 邊／22 mm 握柄的 transform、接觸及穿透尚未驗證。下一步直接做 grip fit，無需重做方向探針。

v8 已對當前 registry guard SHA `f18bd5b1…4a77cf` 的真實 WornLeather 握柄實測，僅重現舊 scale=0.9／spin=90° 作診斷，沒有宣稱此舊位置為當前核准 socket。來源 inner core 對柄的精確最短距離為 2.475 mm，630 個樣本為 2.488–3.300 mm，0 個符合舊 0.3–0.8 mm 接觸範圍；全指最短距離 1.720 mm，沒有指部頂點進入凸握柄。這是「無穿插但未握實」，不是 fit 通過。原始 bore 27.285 mm 與實際 22 mm 柄存在尺寸契約衝突；下一步需先明定 current hand/grip frame，若要重做 inner grip zone 必須建立明確的新 authoring stage，保留 v7 與 0.5 mm source-following 原始證據，不能偷偷放寬偏差或靠 socket 位移／任意縮放硬套。

v8 獨立檢核確認診斷有效，下一個有限產出是凍結 **當前 Hand_R bind frame、wrist plane/socket、實際柄的 axis/center/basis，以及唯一 source-to-character transform/尺度**，而非先在暫定 frame 改內面。之後才保留 outer 形體、明確將舊 INNER 改列被取代的 shape reference，作者重做 grip-derived INNER。另修正診斷狀態只看離散樣本的小缺口，現在精確三角最短距離也必須超過門檻才能宣告過大空隙；窄接觸回歸先 RED，45 項 helper tests 全 GREEN，實際 Blender 重新量測結論相同。所有商用品質 gates 仍未通過，正式 runtime 未替換。

v9 從當前 guard 真正布袖的末端取出 12 點／10 tri 接口；金屬 WristCuff 是非週期薄殼，不能充當 body seam。加強 validator 後另揭露右布袖兩端共 26 條錯向邊，來源不予通過，證據保留。接縫須共用原始頂點與 Forearm_R 權重，不能用同座標雙圈冒充焊接。

追查動作發現 revision-20261006 的 IK 使用 `Fskin*W=Hskin*Q`，保留武器動作但 Q 與 rest 腕點 W 不同（右 127.629 mm、左 205.736 mm）。因此不能直接以旧 Hand skin 做袖口權重過渡，也不能只刪 location。v12 以 `p'=p+W-Q`、`S'=S*T(Q-W)` 修正八個剛體資產的 bind 表示，保留原旋轉曲線及所有其餘骨架／動作，僅重建必要的 location；最大 posed-world 誤差 0.014974 mm < 0.05 mm，24,453 個高密度影格比對及 120 次 modifier 抽查。獨立另查 280 次非網格子幀，最大 0.012478 mm。右袖 22 個 cap polygons 修正朝向，左袖未變，完整 socket gate 通過。v10／v11 誤差失敗未存候選，均保留 QA；v12 僅核准 canonical bind source，沒有替換 runtime 或批准原手套造型。

目前 source 動作另有真實 IK 插值裂縫：Attack_R 27.62 mm（retime 後整數 frame 13 也有 25.57 mm，不能沿用早先「全整數通過」的錯誤概括）、Death 雙側 2.67–3.03 mm，Hurt 左 0.0544 mm。全為 LINEAR，不是 Bezier overshoot。v13 preflight 已確認固定骨長重解全部 reachable、pole 不退化；首個均勻 960 Hz 修復將關節縫合，但 Attack 武器軌跡誤差 0.32038 mm 超標，未保存候選。下一候選 v14 依完整 local quaternion/support 軌跡自適應保留關鍵幀，另以中間子幀比對，不放寬 0.05 mm 門檻。只改 Attack 右、Hurt／Death 雙側，Idle／Walk 鎖定。仍須 reload／GLB 插值、袖甲碰撞與動作視覺檢核，之後才凍結手部造型 frame 並重做 inner 接觸面。

v14 失敗後已查明真正原因：Blender 的 `keyframe_insert` 會把相差 1/128 frame 的 keys 合併，`FCurve.update()` 也有去重行為；不是再提高取樣率能修。實際 Blender 回歸先重現 2 個失敗，再改為 exact key array＋sort／handles_recalc，3 tests 全通過。v15 直接寫 adaptive 使用的同一組 local values／quaternion sign，寫後以所有 control samples 的 `fc.evaluate()` 再驗最大誤差 8.241e−7 < 1e−6。五動作 48,901 個影格（7680 Hz）中最大腕縫 0.000282 mm、武器／手模型世界軌跡誤差 0.017441 mm < 0.05 mm；Idle／Walk 誤差 0、上臂根點誤差 0、模型／權重／rest bones／非目標曲線簽章不變。候選 SHA `6d2d2dcd…614361c4` 只獲局部 code/QA 核准，四張內部渲染顯示固定 Attack witness 腕口裂縫已修，原手套外形與材質仍未接受。下一步是 saved-file reload＋GLB 真正插值／袖甲碰撞驗證，然後繼續完整手部製作；商用 gates 與 runtime 替換狀態未改。

v15 已獲 saved-file 獨立重載核准：48,901 個腕接點與另外 21 個任意子幀的實際 modifier 頂點一致；但碰撞審查拒絕。Attack 13.09375 的上臂甲／前臂甲交叉由 28 增至 63 pairs，交叉區擴大；Death 15.375–15.5 另延長袖布穿甲。v21 的四張固定相機隔離圖已實看，確認內肘金屬邊緣相咬。骨架連續不等於完整動作合格，需從原創甲片配方修整內肘避讓／關節結構，不能把原有交叉當允許例外。

匯出驗證揭露另外三個真實問題：原始 TabardDrape 的 Idle／Death 有 36 個反號區間；Blender direct exporter 在 basis decomposition 後會讓 Thigh_R 等 CUBICSPLINE quaternion 反號，造成 Death 腿部最高 1.501 m 偏差；exporter 在 primitive 建立前固定丟棄 ≤1e−4 權重。v17 僅統一披風鍵值與 handles 的正負號，所有原始 key 旋轉、其餘曲線與 mesh 不變，候選 SHA `cb1f0bf3…f5a751`。v19 使用明確 `_RTS_SOURCE_VERTEX`、實際 skin joint palette 補回來源權重，完整頂點／有向三角形／inverse-bind gate 通過，但直接 cubic 匯出仍有 0.499 mm 誤差，保留失敗報告。

v20 改由已量測的 Blender 世界骨姿態建立實際 glTF parent-local TRS，以 spherical quaternion interpolation 做自適應減鍵，控制 3840 Hz、獨立中間點 QA 7680 Hz。真實來源有微量 local shear，獨立確認不是 float32 錯誤；其投影 residual 保留為診斷，原 0.05 mm 世界空間門檻未變。Chromium 的實際 GLTFLoader／AnimationMixer 對 48,901 時點×25 骨×2 LOD 通過，含 static skin 誤差的保守 point bound 最大 0.003034 mm；34 個任意 off-grid 時點的全模型頂點 extrema 最大 0.001524 mm。獨立僅批准 geometry／skin／animation parity。輸出不含正式材質，尚未替換 runtime；最終檔案大小／效能、護甲碰撞、完整手形與全角色視覺仍未批准。

本輪驗證：69 個 Python authoring helper tests、16 個 Node export helper tests、全專案 146 檔／1,466 個 Vitest 全通過（exit 0）；後者 40.12 秒，`tmp/rts/commercial-wrist-export-vitest.log`。新工具與固定來源保存在 v20 raw／qa。正式 guard 原始 SHA `f18bd5b1…94a77cf` 未變。下一有限產出是修整已定位的內肘甲片避讓輪廓並保留已驗證的動畫／蒙皮，再繼續完整手部與角色製作。

v22 完成五動作、雙側、雙 LOD 的 1/64-frame 護甲交叉包絡。Idle/Walk 幾乎全時交叉，Death 左臂交點深入 Upper u≈0.542／Fore u≈0.448，初始末／首 25% 缺口方案因此否決；不能任意加深。同時補齊實際來源鏈：clean-arm 左右 7,608 tri → assembly 6,846 → surface-v2 2,900；後段另有預算減面，不能用當前 assembly 的 .90 單獨解釋最終網格。後續需重製可編輯的 Upper／Fore／couter 分節模組，保護其餘已組裝島。

動態 hinge-frame 診斷另外揭露 Attack_R 13.1f 急轉：真正 Blender v17 肘頭峰速 22.716 m/s、Hand 12.229 m/s。v12 已有 17.575 m/s 肘速，source pole offset 最小 81.9 mm，並非退化或 quaternion 近零；retime 在此段約 1.32–1.36 倍，只能解釋加速，不能獨自解釋全部上游急轉。局部腕縫及匯出 parity 通過不代表動作自然。單純 helper-roll 會跟著急轉且增加多處甲片交叉，未保存 helper 候選。v24 固定舊 Handworld 的 pole 修整仍有 12.088 m/s 峰速與 235.7 mm 肘移位，僅保留 preflight。

v25 改為明確新作者動作，只改 Attack_R 9–18f 的 Upper/Fore/Hand 與衍生 ElbowSupport，採 body-space Hermite 手軌跡、明確 anatomical pole 與連續 quaternion 曲線。其他動作、左臂、軀幹、腿、rest、mesh 與 window 外 world pose 全保留；遊戲 1.2 秒及 frame16 命中契約不改。舊 Handworld 保護只適用 v12/v15 的表示修復，不再強迫保留已證實失敗的揮擊路徑。候選 SHA `a57e17a5…103c35`：7680 Hz 腕縫 0、bake 對作者 plan 的保守 2 m 點誤差 0.023618 mm、window 外誤差 0；肘／手峰速降至 11.435／6.087 m/s，但仍需特別檢查新 10.69f 峰值，不能以降速作視覺批准。

v25 目前只有程式與範圍的獨立核准。重載後 frame16 劍實際頂點差最大 0.5623 µm；40 個時點×雙 LOD 的劍／右手對胸、裙、腿與盾表面 strict crossings，before/after 均 0，尚非 dense/contact/containment 完整證明。全片 0–36 每 1/4 frame、兩視角×before/after 共 580 張真實渲染已轉成 1×／0.25× 影片，Chromium 實際播放與精確 seek 已驗；影片解碼通過與動作視覺批准分開紀錄。新增 helper 測試先紅後綠，Python 共 81 tests 通過。正式 runtime 未改；v20 parity 不可沿用成新 v25 source 的批准，後續仍需新的匯出比對與完整角色檢核。

後續獨立逐格審查已有限批准 v25 Attack_R9–18：10.7f 是連續外抬，13.1f 急轉沒有轉移到前段，16–18f 接回無新 pop；此範圍沒有待修 P1/P2。批准記於 `v25/qa/independent-motion-review.json`，仍不批准護甲、完整角色或 runtime。原灰色肘面已定位為 component2 的閉合 ElbowArmor（75v/146tri），肩部黑區 ray 命中 component0 的閉合 ShoulderSpaulder，並非真正破洞。接下來重製 Upper/Fore/couter 分節護甲，保持 v25 動作與其他組裝島，再處理完整手部與最終匯出。

v26 已做具語意頂點、2.5 mm 厚度、深屈側缺口與凸肘杯的原創分節殼體。30 個理想彎曲／LOD／pair 案例 strict crossing 為0，但9個實際姿態×雙側×双LOD揭露114個接口交叉案例，近看有明顯肩縫相切及袖布外穿，未存候選或替換 runtime。獨立追查確認原 Shoulder/Sleeve、Cuff/Sleeve、Upper/Shoulder、Fore/Sleeve 本來已交叉，故不能把舊三接口凍結成品質邊界；下步須連同肩 collar、前臂袖套、腕口一致修整，保留真正12點 canonical wrist seam 與非手臂資產。交線半徑不是完整外表面包絡，也不能加1 mm就當作合格甲片外徑。

護甲 frame 檢查另找出 v25 未改的 Attack_R1–3f 真實急轉：1→2f 肘點位移263.7 mm，原骨長軸也高速旋轉，並非單純 helper roll 或直臂奇異。獨立要求最小擴展0–4f authoring，9–18批准仍有效。v27 Cartesian pole 候選將肘峰8.829提高至10.524 m/s，未採用且保留來源。v28 改以 rotation-minimizing reach frame 中的明確角弧控制 pole；來源 SHA `a57e17a5…103c35`，候選 `499ec8f4…b617a8`。0–4肘／手峰5.916／2.844 m/s，7680 Hz腕縫0、作者plan點誤差8.94 µm、窗外bound0，frame16雙LOD實際劍／手頂點差0。這些量測不替代視覺核准。

v28 兩視角全片每1/4f共290張實際渲染完成，以v25作before轉成1×／0.25×比較影片；四部影片在Chromium實際播放與十個精確seek通過。0–4每1/16f、雙LOD手／劍對身體表面strict crossing before/after皆0，仍非完整 inclusive/containment gate。89個Python helper tests通過（新增測試先紅後綠）；v28仍待獨立動作決定，GLB parity與整合商用驗收未完成。


v29 修正 Attack_R0–4 的 frame4 接合導數，改用保留曲線外側的單邊導數；實際儲存 Blender 回歸 2 項通過，獨立審查關閉 v28 P2。這是有限動作核准，未核准新模型或 runtime。v30-v3 的雙 LOD 保留腕口 .92 接合輪廓後，30 組理想姿態與九個實際姿態／雙側的 strict crossing 均為 0；完整連續碰撞、helper 動畫與儲存 rig 尚未完成。Python authoring helper 92 tests 通過（0.565 秒）。四組原創地標另在隔離 worktree 依 `2026-10-08-rts-3d-landmark-kit.md` 製作，整合與獨立審查待辦；正式 runtime 尚未替換。




2026-10-09 evidence update: four original3D landmark prefabs and48px LODs were locally integrated; map_art independently passed, including two-map overview/base/crossings/forest. Prior148files/1476tests, strictTS, productionbuild and targeted three-browser checks passed. Actual gzip firstloads33,606,616/34,161,070bytes;80units20buildings1080pDPR1/60s measured median59.880FPS,p9520.9ms onRTX5090Laptop. This remains pre-final-character evidence, not commercial completion.

v33 saved armor: independent limited helper-motion review and full actual-modifier inter-part QA approved12229poses/733740pairs at1/64; helper actual-plate plan fidelity maximum0.067563mm. Internal left sleeve self-intersection atDeath48 remains a separate failed gate. v34 finite10mm cloth relief saved with fixed skin/actions/rest/othermeshes, but actualModifierDeath15.5LOD1 reveals4strict/2contact, so candidate rejected before full sweep. Next work examines coarsecloth topology rather than further blind displacement trials.

Buildingstage assets: barracks/stable/workshop original editable sources, four cumulative stages, exact completed geometry/UV/material correspondence; independent asset and URI-only package reviews approved.21 sharedtextures reused without duplicatepayload. OptimizedPython review/hash gatingP2 fixed with RED/GREEN4tests. Runtime8file isolated delivery fixesconstructor rollback and exactv1thresholds; independent rereview and main integration/browser/performance remain pending. Overall commercial gates remain false.

2026-10-09 integration: three staged buildings locally published after exact-source asset/package/code/browser reviews. Root saw18 stage views, live mouse/fog/hidden-picking checks passed with0finalrequestfailure;GPU completed drawcalls11/12/10,21sharedtextures loadedonce. Publication helper review required complete evidence/code/browser hash binding and failure rollback;27tests passed, then local publication succeeded.150files1514Vitest tests, RTSstrictTS,31.36s productionbuild,83fileassetregistry passed. Built3GLB bytes match reviewed/runtimeSHA. Threebrowser regression and updated production budgets running; no external deployment and commercial gates remain incomplete.

v35 shared leftcloth: 12229pose fullself originally0reported and733740interpart0fail. Independent review approved reconstruction/interpart and withdrew Death48visualblackV P2 after samecamera/sourcecomparison/geometryrays established exterior negative space. SelfQA review found omitted coplanar then noncoplanar incident contact beyond sharedsimplex; isolated correction uses explicit contactwitnesses plus regression and batch parity/profile before rerunning fullself. Do not count originalselfreport as complete contact coverage. Wholehand/fullcharacter/export remain pending.

2026-10-09 建築整合複核：三瀏覽器單次完整回歸48/48通過，無失敗、略過或flaky；正式80單位/20建築/動態肖像1080p測得median58.480FPS、p9523.5ms、max40.8ms（RTX5090Laptop）。兩圖本機productiongzip資產33,655,493／34,209,947bytes，皆≤35MB。後發布證據與SHA保存於building-stages QA，未外部部署，尚未包含最終角色。

Incident-contact檢查工具已獨立批准並整合；root真Blender26tests通過、五個見證姿態全部0fail。12,229姿態完整重驗已啟動，原漏incident的self報告封存並標記coverage不足，不沿用作完整批准。原創手部下一包於隔離worktree製作來源語意腕口、掌殼、拇指鞍及四個MCP接口；全右手≤5000tri、衛兵全身另需符合spec一般單位8k–20k目標與實測。整體商用仍未完成。

v35 corrected self QA 正式完成並獲獨立限定批准：12,229 poses／48,916 袖布檢查／20 rigid rest 三路檢查皆 0 fail，21 個凍結工具 SHA 一致。整體手部、body/weapon、export/runtime 仍待完成。其餘九棟來源盤點獨立批准，尚未有候選；伐木場既有圖片可見近側封閉山牆，不能把 normal 朝下或沒有 named gable 直接當成破洞證據。下一步保留正式 GLB attributes 做逐三角面 source mapping 與分期。

真實時間雙河谷地玩家自然勝利 09:37，未注入資源或結果。音訊 10 種 cue 實際調用，最高 6 voices／17 sources；MediaRecorder 解碼時間少 2.392 秒，錄音維持失敗。改用 AudioWorklet 實收連續 PCM 與 WAV 原始證據，不補零改判。


2026-10-09 整合里程碑：六張原創科技／技能圖示已接入 typed action，補上 disabled child click 保護。900px 改三欄與264px dock，九個英雄按鈕完整可見；三瀏覽器27個畫面、144個版面項目與真實研究／學習／施法操作通過，獨立 HUD 審查通過。WebKit resize 後 screenshot 的 world 空白另列未結案，不將 HUD 通過當成整體畫面通過。

自然 pass 對局失敗已定位為每tick周界點切換與A*起點回接造成的單兵振盪，另有群體重複佔位。新增 building-only 接敵槽位、失效與停滯重選；保留真RED及初版unit-target回歸。53項相關測試與獨立review通過，完整單元152檔／1529項通過，strict TypeScript通過。真實時間兩張圖分別09:09／09:46獲勝；559.949333／594.76秒float32 PCM與量測時長完全一致，0 clipping／nonfinite／capture errors。這仍不是音效聽感驗收。

伐木場與剩餘8棟施工階段均已本地發布；剩餘8棟64,726 triangles保留逐角POSITION/NORMAL/UV0/UV1及material/winding，runtime僅剪未引用accessor/view/BIN，17個pruner tests及8 validator0/0。實際主遊戲48個階段、16次點選、8個隱藏上部穿透選工人、4個fog狀態通過。兩張正式production首圖實際下載34,124,749／34,679,203 bytes（本地gzip，無candidate override）；92資產路徑檢核通過，build15.95秒。48-case三瀏覽器post-publication矩陣正在執行，repair/hit/destruction仍未做完。

手部製程升級：原616face cage的固定內格／端點導致盒掌與長帶拇指，兩輪anatomy均拒絕；撤除方案自訂面數與PAD百分比硬gate，保留原創、真柄、Wc/Cc、Hand_R及真袖口。新完整soft-glove sculpt已取得可保留的藝術基礎，但後置boolean造成規則槽、collar zipper造成翻面與自交，當前GLB仍拒絕。依獨立審查從乾淨QF base只清理掌／web、指端、真collar；先完整clay，再全角色RTS/portrait與五動作，未批准任何新手部runtime。使用者要求只看完成品仍持續適用，整體commercial gates尚未通過。


2026-10-09 post-publication48-case browser matrix completed: Chromium/Firefox/WebKit48 expected,0 failed/skipped/flaky,852.295s。glove v2已獨立有限批准clay→wholebody fitting；2468tri、單28-edge真腕口、拓樸/三類self/柄/靜態真cuff皆0，GLB2468tri完全配對，186固定檔SHA主樹匯入全核。後續僅在新v3裝配真袖口與蒙皮、實看RTS/portrait和5動作；UV/PBR/LOD/整角預算/runtime仍未批准。


All12 staged building production load:80units20buildings+animated portrait1080p60s,median57.8035FPS/p95 24ms/max46.4ms,RTX5090Laptop；此為lifecycle simulation修改前資產性能。Windows headlessWebKit resize snapshot已用獨立WebGL2重現；QA每次完整world+portrait frame後一次nativePNG刷新，19頁面/command圖+10native圖、真研究/技能操作通過，沒有改productionrenderer或宣稱Safari驗收。353檔診斷包固定匯入。

建築lifecycle資料先行TDD：bounded16 impacts含真來源、paidrepair cue、施工health正規化、fog integrity snapshot、取消即移除且不播戰鬥死亡、dead不可pick；3browser實際click cancel/refund、workerrepair、guard真命中、pause/expiry皆過。完整suite進行中；倒塌pilot/共用FX尚未核准。

glove v3兩輪完整裝配失敗並固定153檔/45helper依賴：不是pivot錯，而是Forearm來源切縫與剛性cuff進入Hand_R掌/柄的動態包絡。獨立REVISE，最差Attack16 source seam -6.192mm；DQS對純Hand點無效且非glTF標準。新v4明確放開右distal sleeve/cuff/collar/gusset，以五clip swept envelope重選接口，保留已准掌指及全動作/劍路，不再第三輪盲試v3。


建築 lifecycle facts 完整驗證153檔/1540項、127.80秒，strict TS與production build17.14秒通過。後續analytic presentation已先RED再GREEN：98項相關測試，包含replacement排除活體batch、完整role/cluster/stage绑定、變換父節點下的scene-space pivot、還原與暫停；真fracture資產與獨立code review待完成，不能沿用前一輪全套測試作新版本完成證據。

v4腕接口兩候選固定338檔匯入全核，第二candidate19姿態self/柄0，但cuff/gusset6fail、新gusset/原護臂19fail。原v35袖/護臂0、原真柄/護臂8fail，主代理實看Attack16可见護臂穿柄並包住掌根。這是固定護臂與完整劍路的接口衝突，不再盲改權重；獨立最小設計修訂檢核中，整角與runtime仍未批准。


Analytic lifecycle版本完整154檔/1562項Vitest通過33.45秒（maxWorkers4，未改timeout），strict TS及production build20.67秒通過。獨立程式檢核進行中。v4手部獨立REVISE：19/19 gusset/甲實際strict102–136pairs，原柄/甲8姿態失敗且Attack16可見。v5授權僅右distal bracer ROI+鄰面與非對稱皮革接合；取消獨立短cuff與uniform環權重，保留掌指、rig/actions/劍路。先真材質/鏡頭有限設計關卡，通過後才雙LOD/dense/export。


建築lifecycle獨立審查無P1、1個P2：合法雙LOD未比對實際recipe與綁定。新增4真RED＋可接受重排/簡化案例，canonical signature涵蓋cluster recipe/語意parts/role關係；103相關測試與完整154檔/1567項通過35.44秒，strictTS、build19.55秒通過，待限定複審。三瀏覽器實際命令重驗先抓到Firefox fixture top-level async import尚未mount便先click，獨立300ms控制實驗重現disabled DOM被clone；加明確mounted等待後3browser全過，原失敗證據保留，未改production。


獨立複審已關閉建築lifecycle LOD P2，限定程式批准。四FX atlas44966B固定186檔匯入，原生soft alpha、真v3逐種camera證據已實看；獨立美術審查中，未runtime。v5 open bracer19姿態完整劍/甲及甲/袖鄰甲全0，設計有限保留，但4姿態皮革失敗；固定122檔匯入。第二候選前補完整劍來源檢查揭露固定掌指/24mm WarmBrass環341strict，22mm皮革柄沒有此衝突，rest与Attack16一致。v5b83檔證據固定匯入，未製作第二候選，須先解來源邊界，不能只patch皮革。


v5c來源低凸握柄環固定96檔匯入全SHA核對；只168頂點變動，rest+19姿態固定掌/完整劍三類接觸0，root實看同鏡頭握持與完整劍，獨立審查中。舊bellows自交/穿柄仍待局部patch，23022tri/原劍刃端拓樸另待處理。四FX atlas已獨立有限批准，root完成事件timeline、64sprite池、4共享image atlas view、條件載入與world anchors、visible-only scene integration。9核心測試真8RED→9GREEN，另5整合RED→84GREEN；完整155檔1581項28.64秒、strictTS、build16.82秒通過。候選browser routeoverride harness已補實際命令/各效果nativeframe/pause/fog，等原創house合法anchors；未runtime發布，整體未商用完成。


建築FX三瀏覽器真命令、暫停、迷霧、64sprite壓力與3次資源釋放通過；house b7b5實GLTF預檢與35張各施工期倒塌機械檢查通過，屋頂終態仍有直立大片與anchors語意疑慮，藝術未批准。62fe缺rtsConstruction與browser-v2 QA helper錯誤另保留，不算產品通過。完整155檔1581測試31.54秒通過。v5d412檔證明原固定腕縫撞舊長劍尾，未耗第二bellows候選；獨立審查限定改原創短尾帽v5e，先分層接觸gate，舊bellows碰柄/自交仍pending。12原創建築production icons143檔全SHA匯入並獨立藝術有限批准，待HUD整合。所有新候選仍未public發布，整體未商用完成。


12建築WebP圖示完成typed HUD、第二座主城tier刷新、900px13命令全可見。新行為3RED→6GREEN；另捕捉selectedtier真RED；155檔1583測試30.30秒、strictTS通過。browser-v3三瀏覽器三尺寸、每瀏覽器30次建造模式/付費建造取消/兩次主城升級通過，獨立整合有限批准後本機public發布12張145158B，仍待無route HTTP驗證/合併budget。house b7獨立REVISE屋頂/支承/anchor，v3重做。v5e真Grip端環與frozenbellows矛盾，獨立限定jointtail+bellows一個最終候選，保留sourcePBR UV選擇旗標，未finite/wholeart批准。
