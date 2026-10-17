# 原創人物品質重製

使用者已要求直接實作，並明確選擇「模型與動作全部維持原創製作」。沿用唯一美術指南 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`，不採第三方角色、骨架、動作或動捕包。

先以王國衛兵完成一個可檢視的完整樣本，再將通過的製作方法用於其餘兵種。現有八兵種是待替換的比較基準；先前功能測試、GLB validator 與骨骼位移數據不構成人物美術接受。

1. 原創形體：隔離環境評估本地生成能力，保留來源概念圖、模型版本／權重 hash、license 與後處理。至少檢查正側背、手部、头肩、武器分離與可綁骨性；不以面數或 watertight 判定外觀合格。
2. 原創動作：依實際骨軸做腿與手臂控制，輸出 Idle、3 m/s 移動、1.2 s Attack、Hurt、Death。候選留在 factory，不進 runtime。
3. 品質門檻：持械接觸與淨空、帶地面參考的連續移動、攻擊目標平面接觸、分段倒地與接地、近距離可見的呼吸／頭肩動作。腳滑、速度、接觸時點等數值必須與視覺一致。
4. Runtime 契約：通過候選後才加入 stride／cycle／contact metadata。移動播放速度匹配實際位移；攻擊每次重新開始，傷害／發射時點與接觸 marker 對齊；Hurt 可觸發、Death 播完停住。維持模擬確定性、迷霧與 LOD 同步。
5. 驗收：行為先紅後綠；全套 Vitest、strict TS、真實瀏覽器戰鬥與肖像、獨立視覺檢核，再做實際負載效能。只有通過的候選才能替換 runtime 與 registry。

第一版動作候選已退回：Attack 接觸幀劍刃仍垂地、Death 腰部後折且装备懸空、Walk 劍尖淨空不足且上身僵硬、Idle 可見度不足。第二版須以接觸空間與實際姿態補驗；Root rotation 為零不能代表可信倒地。

動作候選進度：第二版 Idle／Walk／Hurt／Death 已獨立接受；第三版只將 Attack 接觸 marker 改到首次向前穿入目標的 frame 16（0.533333 秒），刀身重心速度 4.131 m/s，獨立複審接受。來源及 QA 保留於 `art-factory/rts/runs/original-guard-motion/2026-10-05/revision-v3-attack/`。這些動作仍使用既有原型形體，不能據此重新核准角色模型，尚未接入 runtime。

限制：目前原型沒有 facial rig，不宣稱眨眼或口型；模型、動作、runtime 整合三個階段分別驗收，不把其中一項通過描述為全部人物重製完成。

後續 runtime 接觸校準（尚未實作）：原型 V3 GLB 在 Three CPU skin 的第 16 幀，劍網格最前端為單位原點前方 0.9836m，30fps 全段樣本最大 1.0943m；目前 `guard.range=1.6`、registry scale=1。原先 0.62m 目標平面的候選 QA 無法證明戰場合法距離上的實際接觸。另對目前 published guard 舊動作獨立量測，30fps 樣本最大為 1.2099m；不要把 V3 候選數字當成已上線動作。證據分別在 motion run 的 `qa/runtime-reach-diagnostic.json` 與 `qa/published-reach-diagnostic.json`。完成新形體、骨架與握持後，必須重測實際 blade reach，再校準接戰距離和 contact marker，不能只套用舊數值。

20Hz 模擬負責傷害結算，renderer 只播放；0.533333s marker 最早在跨過它的 0.55s tick 生效。待擊資料留在 GameState 內，不透過 TeamView 洩漏目標或傷害。攻擊 cue 需要 sequence，讓連續同名 Attack 重播且雙 LOD 同步；暫停不前進，Death 播完停住。取消指令、攻擊者死亡、目標先死、同 tick 互殺、目標離開接觸距離／視野都需明確規則與回歸測試；其他兵種的攻擊與技能時序先維持既有行為。

瀏覽器基線：`tests/manual/rts-melee-contact.ts` 在實際頁面使用 published GLB、正式 `stepGame`／`Battlefield.render`，固定兩名衛兵，攻擊者原點到目標模擬表面的距離為合法射程最外緣內側 1mm，以 20Hz 逐步量測 29 個樣本。第 1 tick（0.05s）目標已從 320 HP 降到 302.142857，當下攻擊劍與防守者全部可見幾何沿攻擊軸仍有 1.695285m 的正分離間隙。證據位於 motion run 的 `qa/published-runtime-contact/`，記錄 HEAD、script／registry／兩 LOD 檔案與瀏覽器 response hash，page errors 為空。這是人工安排的接觸時序診斷；QA 特寫隱藏非交戰場景物件，不代表自然通關。負投影間隙只代表單軸範圍重疊，不能當成三維接觸成功。

貼圖準備：四視圖來源 hash、alpha bbox、局部 landmark 搜尋帶、遮蔽面語意 fallback 與 canonical 相機方向，已整理於 `art-factory/rts/runs/original-guard-materials/2026-10-05/qa/projection-source-contract.json`。Raw Hunyuan 匯入 Blender 面向 -Y；retopo 約定 +Y，需先轉 180° Z。原圖的站姿、左右鞋底與手臂角度並非已配準，禁止只套全身 bbox 縮放。這份來源對位資料尚未產出 UV 貼圖或授權 runtime。

重拓樸退回：`original-guard-retopo-review/2026-10-05/snapshot-v1/qa/rejection.json` 凍結舊 GLB／Blend 的獨立退回證據。全局 octree remesh 破壞甲片輪廓，body／雙手不封閉，握持穿入實際量測超過 11mm；舊 QA 的 pass 字樣由 rejection record 明確取代，沒有進 runtime。

新方法局部驗證：`original-guard-arm-cage/2026-10-05` 從已接受高模取右臂截面，建立 994 點／1984 triangles 的原創 cage 與五骨支撐肘。原始兩骨彎肘最小截面比 0.7071，支撐肘為 0.9280；但獨立視覺檢核仍退回整條 deforming-armor cage：甲緣被橋接、內肘折回、扭腕使硬甲橡膠化。只保留截面採樣方法，下一個有限工作是原甲分件＋局部柔性袖，不重跑全局 remesh。合約 `contracts/original-guard-arm-cage.json` 維持 qa_failed/runtime false。

該方法工具 10 個測試先紅後綠；Blender 真實 LBS 與 Chromium 匯出的 GLB 四姿勢逐點比對已通過，每姿勢 994 頂點，最大偏差 2.789e-7m，page errors 為空。此驗證曾抓出起始 frame1 的 1/30 秒偏移，改成 frame0 後重建重驗，舊錯誤 GLB 留在 `qa/rejected-export-frame-offset/`。這是播放一致性證據，沒有解除幾何／美術退回。

本地預覽變更：原 4321 RTS dev server 已不在，該埠目前由 `super_galen_site_sol61_article` 佔用。保留該服務；Astro 新服務啟動逾時後，使用 loopback-only QA 靜態服務在 4322 提供現有 production build 與 factory 審查頁。遊戲 `/games/rts/` 與 `/art-factory/rts/runs/original-guard-arm-cage/2026-10-05/review.html` 均實際回應 200。此服務無 HMR；產品程式及 runtime 角色未在本輪修改。

原創手部來源：`original-guard-grip-study/2026-10-05` 保存從原角色衍生的握柄三格圖、prompt 與 source hash。獨立檢核為 PARTIAL：中格可參考拇指蹼與握柄接觸，左右格可參考背甲／拇指側造型；三格腕部高度不一致，禁止当作配準三視圖或同姿勢多視圖重建輸入。尚未去背、未建手部網格，不提供 runtime 核准。

後續握拳來源試作：`original-guard-right-grip-shape/2026-10-05` 只用中格，固定裁切／去背後以同一 pinned Hunyuan checkpoint 生成粗形。獨立六面檢查為 PARTIAL：輸入面四指輪廓可參考，背面圓鈕指端、融合虎口與封閉腕口需重建。合約 qa_failed；不得直接減面裝到角色。來源、裁切、工具與模型 hash、既有 license 依據都在 qa/provenance.json。Chromium 桌面／手機檢視七張原圖與渲染，逐檔 HTTP hash 相符，errors=[]。

分件臂甲試作：`original-guard-arm-articulation/2026-10-05` 的三片硬甲保持剛性，前臂實測 roll 約45°，四姿勢跨件相交0；但內外薄殼真實穿刺仍未解。原始 GLB 在 Chromium 四姿勢、每姿勢1750匯出頂點的逐物件比較最大偏差3.543e-7m，errors=[]。外形仍有甲緣變直及袖口縫隙，獨立幾何與視覺檢核維持 qa_failed。預覽與判定位於 `original-guard-arm-articulation-review/2026-10-05`。

局部內殼求解：`original-guard-arm-local-shell/2026-10-05` 保留外層，約束2mm內殼；96個局部點中92個有解，4個不滿足限制。獨立線性可行性檢查：3點的相鄰法向厚度條件矛盾，1點最小位移20.349mm超過6mm上限。此有限方法已停止、無新模型；下一步必須局部重建對應原始表面的凹折 patch，固定周界，不繼續重試縮薄或更换法向。位置在獨立 decision.md 與原始 pose-report 的面索引中。

原表面局部修補結果：`original-guard-arm-surface-patch/2026-10-05` 以最多6mm外層位移嘗試局部修補；袖部自交消除，但上臂16／前臂22個內外殼穿刺仍在，局部厚度也低於1.5mm門檻，維持 qa_failed。此截面 cage／內殼／fairing 路線停止；改以原始高模最大封閉連通體評估保形 QuadriFlow，與已退回的全局 octree remesh 分開記錄。新方法仍須正側背與局部細節驗收，不能把重新分配面數当作已修好融合手指或裙甲。

攻擊事件播放已實作：每次出手產生 sequence／startedAt，雙 LOD 依模擬時間重新起播、單次夾止；取消指令、死亡、施法及失去合法交戰條件清除舊事件。補上低幀率追時、淡入時鐘、不同長度進場及退出後重播倍率回歸，以單次 mixer update 同步。相關41項、全套1357項／132檔、strict TS、production build 通過；正式頁面與瀏覽器時序證據在 `attack-cue-runtime/2026-10-05`。獨立源碼複審 APPROVE。80單位效能尚未通過：一次60秒中位40.16FPS／p95 33.4ms，同頁新版／舊版／新版對照皆約40FPS，不能把跨進程FPS差距直接歸因於播放同步。這只完成播放行為修正，近戰仍立即扣血，接觸距離與傷害 marker 必須依最終原創模型重新校準。

QuadriFlow 前置條件診斷：未縮放的兩次試作已凍結於 `original-guard-quadri/2026-10-05`。獨立 consultant 對照本機 Blender 5.2.1 build `9e2066aef7ef` 的固定原碼，證實4632條正長微邊命中逐分量1e-4門檻，於solver前被拒；局部共面dissolve不會解決此條件。主流程另抽驗全部659043條邊，對mesh data座標同比×2048後命中0，縮回後219665頂點bit-exact。後續新包 `original-guard-quadri-scaled/2026-10-05` 先驗精確precheck再只執行一次，結果仍須外形、表面距離與拓樸驗收；此診斷不是模型接受。

縮放後已解出10694點／10696四邊面。首跑在存檔前遇到 World 初始化錯誤，原證據保留；一次相同設定的保存流程修正重建已先存 raw NPZ／Blend／GLB，再獨立完成渲染。雙向表面中心取樣p95約3.57／3.23mm，並非全表面誤差上限。獨立檢查接受其整體輪廓作局修母體：11個零面積面均為精確重合對角點，16條邊界形成四個小洞；只清理列舉點面，不再全身重解。手、甲袖與裙甲融合仍須局部建模，未達rig-ready。八角度平滑／平面對照、獨立判定及桌面／手機實測位於 `original-guard-quadri-scaled-review/2026-10-05`。

下一個有限範圍是 `original-guard-quadri-repair`：固定其餘頂點及面，精確清理11個坍縮面與四洞；手／裙暫時封口須列出索引供後續ROI替換，不把閉合宣稱為可綁骨。臂甲後續改用保留外表面的封閉實體切件與藏入甲緣的端面，避開先前已證明不可行的平行薄內殼；柔性袖仍需獨立重建與四姿勢驗收。

握柄通道局部修整：`original-guard-grip-channel/2026-10-05` 從既有原創手套來源保留最大封閉元件，擬合四段外露握柄，僅做一次局部Boolean差集。通道軸線已貫通、310209個外部頂點數值座標保持不變，boundary/nonmanifold/winding與真零面積面皆0；20個微小正面積面與IEEE signed-zero誤判已另作數值診斷。4項工具測試與桌面/手機10張對照圖、2個模型HTTP核對通過。獨立檢核接受此局部步驟；仍是高模候選，圓形指端、腕口、實際武器與角色比例、重拓樸與骨架未完成，未進runtime。下一個有限範圍是原創武器握持fit，只修通道/四指腹ROI，驗全長無穿刺與四段接觸，再接腕口。

全身局修已停止：`original-guard-quadri-repair/2026-10-05` 的指定weld、11面刪除與三個三角洞成功；裙甲七邊洞各有效固定點三角化仍至少6組真穿刺。唯一固定21邊外圈修正也出現15組patch/rest穿刺與10組patch自交，維持qa_failed。兩版模型及真線段/三角交點證據已凍結；主流程重驗4/4工具測試與40個SHA一致。不再擴圈填洞，需以裙板/骨盆分件設計處理。獨立手臂工作包改用原Quadri外表面切件，避免再做全臂截面loft。

封閉實體臂甲結果：`original-guard-solid-arm/2026-10-05` 四件封閉、繞向正常、七姿勢 self=0；肘甲／前臂仍在 bend90／combined 有49／37組真交，過渡姿勢最高93組，其中24組是外表面穿刺，維持 qa_failed。獨立審查要求先固定形狀檢查 hinge pivot 與肘甲跟隨率，不能先假定必須削甲；`original-guard-arm-hinge` 採最多40組有限機構診斷。完整未切 Quadri 面數已修正為56／71／153，其餘為裁切來源面；原 Blend／GLB 與頂點未更動，主流程重跑6/6測試通過。

原創前布片分件：`original-guard-tabard/2026-10-05` 以原始高模表面投射重拓樸，650點／1296三角面、沿Y軸名義3mm背面偏移與三個原創控制骨；不是全表面最小法向厚度證明。首版前後自動四邊面三角化互穿，保留於 rejected；唯一拓樸修正固定前後相同對角線，頂點／權重完全不變，0–20幀自交與固定上緣位移皆0。5/5工具測試；2304個前面內部取樣p95 1.067mm、最大4.267mm（非全表面上限）。Chromium 桌面／手機操作與9個HTTP資產核對通過，五姿勢各650點對Blender最大1.029e-7m，errors=[]。3D可旋轉／暫停／逐幀預覽在該run/review.html；獨立檢核接受局部幾何與原創擺動試作。尚無正式材質、縫邊、身體與雙腿接合，不是正式步行動畫或完整角色；組裝時須補驗略內縮的外緣與腰帶覆蓋。

布片瀏覽器證據修正：獨立檢核抓出一版桌面截圖實際為空白，舊數值／pageerror檢查不足，退回證據保留於 `qa/rejected-browser-capture/`。新增實際像素門檻能以exit1攔下原空白圖；兩次新瀏覽器重驗桌面／手機均有模型、白底比例0。獨立複審確認門檻與新截圖有效。模型／骨架／相機沒有因此更動，間歇畫面擷取問題的根因仍未確定，不能宣稱渲染問題已根治。

原創握劍fit：`original-guard-grip-fit/2026-10-05` 以手套0.90等比縮放、軸向90度與剛體對位接到原創劍柄；來源局部網格不變。全劍真三角交會及劍頂點包含皆0。獨立檢核接受有限握持；補充角向檢查排除反側4／6／5／5個樣點，四個指腹側縱向区仍各有6／5／6／5個樣點落在0.3–0.8mm間隙，這是幾何代理而非完整指腹辨識。5/5工具測試、hash驗證與六圖兩模型HTTP瀏覽器檢視通過。護手／柄首為取樣間隙；圓鈕指端、虎口、腕口、低模及整體比例尚待完成，劍亦僅為原創尺寸參照。

固定形狀hinge診斷：36組機構參數×14姿勢無全表面零交會解。最佳t=.48、global_anatomical軸、肘甲跟隨率0；只在combined90+roll45留4組上／前臂外表面交會。可見性檢查25張圖與射線證據確認內肘前臂近端封口露出平切邊與黑缺口，獨立複審退回；不能將478個跨姿勢封口交會總數當成478個可見洞。新 `original-guard-elbow-rim` 只修已定位的前臂近端局部，固定最佳hinge與其餘原始形狀，不重做參數搜尋。四個極小外表面交會尚未證明完全遮蔽，保留未解狀態。

下一個手套候選 `original-guard-grip-low` 從凍結握持高模保形減面，目標全手不超過12000 triangles；需同鏡頭六面與wire、完整武器穿刺／包含、四區接觸及雙向取樣距離驗證。此步不會自動解除原有造型、腕口與整體人物美術限制。

原創肖像工作包 `original-guard-portrait-study`：沿用同一原創頭盔／胸肩來源，裁取上半身並保形減面，製作獨立胸部／頭部控制與4秒循環轉頭、呼吸試作；封閉頭盔無裸露五官，不宣稱眨眼口型。先測權重與循環邊界，驗頭盔剛性、正側背形狀、GLB與Blender姿勢一致，再提供固定相機的實際3D動作頁。只在factory檢閱，正式材質、全身組裝與人物接受仍未完成。

肖像候選已於 `ab94ee2f` 保存：7999點／15998三角面、兩個原創控制骨；九個取樣姿勢自交0，1803個剛性頭盔點的邊長誤差<0.2微米。4/4工具測試、strict TS與實際Chromium通過；五姿勢各7999點匯出比對最大2.43微米，相同相機的左右轉頭圖有6.23%可見像素變化。桌面／手機與9個HTTP引用核對完成；待獨立檢閱。胸徽模糊、甲緣融合與正式材質仍未修完，不能升格為完整模型核准。

肘部cap-only局修 `09daedb2`：只改四個封口面、保留全部原外表面；原接觸後退4.63mm且該處交會清零，黑槽卻擴大，獨立檢核維持qa_failed。根因是原外rim缺少前景疊接，不再退cap或搜尋pivot。下一包 `original-guard-elbow-lip` 僅放寬近端兩段rim及相鄰113／114面，朝couter形成局部硬甲lip，以同鏡可見開口與完整側面判斷，內藏cap總交會數不是美術門檻。

肖像後續：`06b9b7b9` 將鏡頭拉近為頭肩特寫（候選模型／動作不變），先紅後綠的構圖檢查確認頭盔範圍約占高度52.6%，五姿勢仍在畫面內，轉頭約10.5%像素變化。獨立顧問有限接受保形與原創肖像動作；剛性僅證明Head權重1的1803點及其內部邊，不能聲稱下緣盔裙全剛性。俯仰1.5°是公式係數，最大為3°，已更正審查文字。

手套低模 `440aa00e`：一次減面與唯一通道保護修正後11846三角面、4302個通道點原位；全劍三角交叉0、劍頂點在手套內0，四區接觸6／6／6／5。仍qa_failed：31個低面中心與最近高面法線dot<-0.2是取樣方向差，不等同自身繞向錯誤；全域自交及逐封閉劍件包含尚未量測。joined劍三射線曾誤報一點，局部逐15件及5條相鄰邊已反證；劍另有1件開放殼，不以整體奇偶假陽性指控原fit穿刺。主流程3項測試、hash與15個HTTP引用畫廊通過，獨立造型判斷待回報。

兩段護唇 `39681556` 仍失敗：黑槽未解且bend60／75新添三組可見外表面穿越，模型封閉與剛性不構成美術通過。停止逐面外擴，另由獨立架構顧問檢查完整近端關節範圍、實際遊戲可見性及3mm內藏門檻的適用性，之後採完整局部關節設計，不繼續原路微調。

手套補驗已收束：14個封閉劍件對全5897手套點的solid-angle體積聯集內含與表面點皆0；另1件開殼不作體積結論。低模18組非共頂點交會，獨立從GLB重現16組，集中成4個可修復減面群；另外2組為極小面／輸出精度差。31筆最近高面法線差本身不是FAIL充分理由；真正阻斷是局部自交與碎面。來源對應局部未見相同交會，但沒有宣稱來源全域self0。下一包限4群加一圈、固定通道與周界，禁止再次全域減面。

關節架構檢核已退回小lip路線。新有限包 `original-guard-articulated-elbow` 改完整t=.37–.72的局部couter／前臂護口／柔性袖，保持ROI外原形與既定軸；只允許完整一版加一次影像指向修正。正式尺寸影像取代無依據3mm藏深，內藏return交疊不以總數當洞數；全身五動作整合仍另需驗收。

肖像材質試作 `original-guard-portrait-material` 沿用既有原創四視圖，以獨立頭盔／胸甲／肩部定位投射到不改形的已驗動作半身像。首版visor與下緣錯位已凍結退回；唯一局部landmark修正改善正面，肩甲拉條、背盔黑帶與冠頂接縫仍遭獨立退回。4/4工具測試、Blender五姿勢原7999點完全不變；Chromium五姿勢各11911個UV分裂匯出點最大誤差2.43微米，桌面／手機、9個HTTP資產與可見轉頭通過。這不是PBR掃描或幾何細節修復，仍不進runtime；下一包必須語義面mask與分甲片UV，不再微調全局座標。

原創關節完整局部兩版已在 `c4291a77` 凍結：第二版190格點加348中點CPU硬甲presentation crossing0、6測試通過；端緣鋸齒、白色端面與背景縫仍退回。獨立檢核另確認三項證據缺口：CPU布袖變形不同於輸出骨架，self0不能外推到Blend/GLB；上臂保形fingerprint是來源自比；方形world24m/portrait圖不是真實browser尺寸。decision已收窄宣稱，原失敗QA保留，下一包須連續控制曲面先設計再分件、真實輸出逐點驗證及實際browser截圖。

現行runtime未改碼重測：`attack-cue-runtime/2026-10-05/qa/load-recheck` 保存1080p、80單位／20建築與knight動態肖像的60秒結果，中位59.88FPS、p95 25ms、pageerrors0。這是本次條件下通過，不能將先前約40FPS與此次差異當成程式優化或所有硬體保證。

不同材質來源方法試作 `original-guard-matched-paint`：內建imagegen直接編輯原模型正面固定鏡頭，以原創概念圖只作材質參考。已保存原圖、完整prompt、外框對齊及實際瀏覽器比較；只生成正面，尚未烘焙。外框對齐與亮度閾值mask不是甲片／眼縫精確配準證明，須先確認來源可用，不能因生成圖漂亮就替換模型。

此上色來源已獨立判定partial-reference：銀鋼／黃銅／布料語言可參考，但visor、pauldron roundel與sun crest不對位，整圖投射退回。4項後處理測試先紅後綠、重製SHA相同，桌面／手機3圖HTTP核對及原图連結操作通過；未貼到模型。下一次若試材質，僅能在真實3D語義mask內測寬廣鋼面，排除所有不匹配地標。

握柄局修 `895be569` 已独立有限接受：七次換邊使Blend主要四群／strict self18→0，5897頂點bitexact、11846三角面及contact6/6/6/5不變。GLB仍有2組與baseline座標逐位同的微量交會，high→low取樣p95 +1.499µm，明列數值例外，不宣稱GLB strict zero。11相關測試、33原證據hash與桌面／手機29個HTTP引用及2下載通過。指端、虎口、腕口與runtime仍未接受。手臂下一包 `original-guard-arm-production` 已在獨立worktree開工，尚無可接受候選。

分區材質 `original-guard-semantic-material` 的兩版已退回：原創 surface tiles、重建 UV 與 triplanar 採樣可保留；全域 mask 的頭盔藍斑改成整面標籤後，領口碎三角與黃銅鋸齒仍不合格。9 個工具及 2 個表面處理測試通過，1,090,853 個 2048 texel 中心無衝突，Blender 五姿勢不變，Chromium 五姿勢最大差 2.423µm；不能據此核准外觀。停止第三次 mask 修正，先重製有清楚分件及連續材質邊界的原創造型。

整段原面肘甲 `original-guard-arm-production` 同樣於兩版後退回：bend75 可見三片互穿與黑縫，combined 出現黑楔口。六測試及原面84/84保留不代表可動外觀通過。瀏覽器初測62–64mm差異已定位為30/24FPS姿勢時間錯置；改依GLB duration與來源frame區間換算後，五姿勢與結尾返回idle最大差9.032µm、12項時間／對應測試通過，模型binary未改。下一輪重設原創甲片和柔性肘區，以完整人物品質優先，不再要求保存未核准神經來源的破損局部外形；正式人物、完整動作及 runtime 整合仍未完成。
