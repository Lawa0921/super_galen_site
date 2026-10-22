# V7 完整骨架角色接入計畫

**Goal:** 以正式 53 骨 GameEngine 角色替換剛性人體，完成可驗證的步態、瞄準、持槍及受擊，再通過遊戲實測與效能門檻。

**Architecture:** 外層 actor 接遊戲 position/yaw；其下 visual-facing 修正來源 +Z 與遊戲 -Z，原 GLB 及每個骨節父鏈完整保留。獨立骨架模組負責型別／拓樸驗證、每實例 rest 資料與姿勢重算；姿勢與四槍校準必須另經真 GLB 動態畫面檢核才接入 presentation，不能進舊 rigid reparent 流程。

**Tech Stack:** Three.js、TypeScript、Vitest、Playwright；沿用 model-resources 的 clone/dispose 契約。

**Spec:** `../specs/2026-10-03-browser-cs-design.md`，並參考 factory character-fit/character-textures 契約。最終完整 CS2 品質目標不縮小。

## 先決事實與限制

- Source 骨名是 spine_01/02/03、neck_01；不可沿用摘要省略 underscore 的拼法。
- GLTFLoader 會 sanitize node names，不能僅靠字面 `Human.rig` 判斷。完整 53 Bone 名稱、父鏈、同一 skeleton 和模型明示的 +Z 朝向契約才是接入條件；名字本身不證明朝向或單位。
- 未辨識的 skinned 模型不得回到會 reparent Bone 的 legacy 流程。錯骨架要明確拒絕或保持未接入。
- 骨架上增加的武器 mount 必須是非 Bone，四槍使用獨立有證據的校準，第一人稱維持原有 viewmodel。
- 衣物與布料候選已通過有限 fit 姿勢檢核，完整持槍／步態仍未驗收。此階段用凍結候選驗證骨架機制，不將其發布成 runtime soldier。

## 有限實作與驗收

- [x] 建立 `skin-rig.ts` 與測試：驗完整 53 骨父鏈、骨架 sharing、拒絕缺骨／重名／錯 parent／多 skeleton，驗證失敗不得更動來源。
- [x] 使用 source GLB 衍生的骨節 transform fixture，驗 actor/visual 分層及 yaw0/π/2 前向；每骨 parent、inverse bind 與 rest local transform 保留。
- [x] 姿勢軸使用 visual rest space 轉成骨節 local；每次從 rest 重算，重複及 A→B→A 不累積。非有限、缺骨與零軸輸入原子拒絕。兩 clone/source 不互相影響。
- [x] 真 GLB 以同一模組拍攝 rest、有限左右骨節姿勢及 restore，抽驗實際 skin deformation、眼／衣／鞋與骨鏈，獨立審查。
- [ ] 下一步實作步態／aim／flinch channel 與四槍掛點，檢查手腳動作及引擎射線方向；未取得這些證據前不將基礎 pose API 稱為完整動畫。
- [ ] 分流整合 presentation/renderer；同版本 full unit、CS E2E、build、真操作與效能確認，再判斷是否符合本機角色發布門檻。

## 已驗證的前置能力

`run-20261004-v7-skin-pose/qa/verification.json` 記錄9項新骨架測試與完整118檔／1295項unit通過；build exit0。真DB607候選的全部 skinned vertices 最大單軸位移0.22950m，repeat/restore/source/second誤差0、clone rest誤差3.33e-16，53骨parent不變。獨立五圖檢核無新增 skin撕裂／骨鏈錯接；root抽驗側面pose。

這是完整pose的一次提交API。未來gait/aim/flinch須先合併所有command再applyPose；子骨會繼承已擺動的祖先，axis不是固定世界軸。新增祖先/子骨測試曾因非單位數值誤差造成angleTo假性超差；保留失敗與診斷，現在同時檢查component差與正規化後角差，未改動pose行為。

## 持槍校準的前置修正

- 後續採 fabric-budget 候選 SHA `06f2d364168d6f1a12cb534ba217b0d0022d3f2a504c404258a5ded032a81639`，8 meshes／53 bones。布料及有限 fit 姿勢已通過候選檢核，完整動畫仍待 runtime gate。
- 兩骨 IK 已涵蓋 actor 變換、可達／不可達 target、pole、腕部 orientation 與無效輸入 TDD；尚需真 GLB 的 rest quaternion、無漂移及非零 mount offset 驗證。
- Adapter 須由手掌／槍把 mount 的 TRS 反推 wrist world TRS。Pole 應固定在 rest elbow 側並遠離目標軸，或另外驗證連續 fallback，避免肘部翻側。
- 原四槍 GLB profiles 位於 `run-20261004-v7-weapon-grips/qa/profiles-v1`。狙擊槍真槍口環面（faces 888–919、兩個同心 16 頂點環）與 muzzle anchor 軸差 10.46030°，平面誤差約 1.27e-7m；這取代先前外槍管截面的約 10.8° 估計。
- 先以 root／muzzle TRS 校正真槍管軸及出口，保留全部 binary（幾何、UV、貼圖）、其他節點與世界 muzzle anchor；通過獨立 Three 量測與 viewmodel／效能驗證後，再以一致座標校準四槍握姿。

## 非零手掌掛點的約束驗證

`TwoBoneIK.solveMount` 將直接掛在腕骨下的非 Bone、單位 scale 掛點轉成腕骨目標；不移動掛點本身。以目標掛點世界旋轉乘掛點局部旋轉的 inverse 求腕部旋轉，再扣除世界 scale／旋轉後的局部位移求腕部位置。無效掛點、斷鏈、非單位旋轉與非有限輸入須在動骨架前拒絕。

驗收先以非零位移／旋轉及 actor 平移、旋轉、uniform scale 做 TDD，再載入完整 fabric-budget GLB 檢查兩臂可達、掛點世界位置／旋轉誤差、pole 與目標軸至少 3cm、重複 A→B→A、rest 還原，以及 source／第二 clone 不受污染。真圖使用原有八個 skinned meshes 與材質；診斷掛點不可稱為已量測的掌心或生產握姿。正式握點仍要從實際掌心和槍身接觸面取樣。

已完成兩骨／非零掛點 TDD、真 GLB 八次雙臂求解及五圖獨立檢核；最終來源再次拍攝的數值和全部 PNG 與已審版本一致。最大掛點誤差 7.59e-8m，重複／還原／source／second 誤差全零。完整 unit 119 檔／1304 項通過，build exit0；記錄於 `run-20261004-v7-skin-ik/qa/verification.json`。仍未實作正式 grip、手指握合、gait 或 runtime 分流。

狙擊槍局部校正已在本機接入，runtime SHA `5b7a730821e88bb4c26769ef95de710274c08f3b0291776026d39133981eb2f1`。初次 CS E2E 35 pass／1 renderer module-fetch failure，單項及凍結來源後整套重跑分別 1 pass、36 pass／104 skip；原因仍未證實，完整紀錄保留。Intel Graphics／D3D11 同設備 before/after 高低畫質各120秒，狙擊槍交戰樣本 worst16.8ms；校正版完整 high 流程最初手槍階段仍有一次50ms長幀。以上是局部 gate，不等於整體 CS2 品質達標。

## 真步槍握持校準（候選，尚未接入遊戲）

來源及完整失敗軌跡集中於 `contracts/rifle-grip-v7.asset-contract.json` 和 `runs/run-20261004-v7-rifle-grip`。掌面選擇經四張雙面照片與獨立 GLB accessor 抽驗：右 face16127、左 face4776 的三個頂點全部為該側 hand 骨權重1。固定掛點因此不受指節彎曲拉動；以真 skinned triangle 而非骨原點量測接觸。

assembly-v1/v2 的左臂不可達；v3 透過真護木後方接觸點及上身站姿解決可達性，但手指仍穿槍。v4 把左掌移回護木內、保留右掌前向、調整肩托與屈曲，獨立八圖審查確認有改善；右掌根與下三指穿握把、食指塞入護圈仍是阻擋項。v5 的單純掌面 roll 惡化其他接觸，已拒絕，不是後續基線。

下一步以 v4 為基線，分別約束真正的掌根接觸與指尖目標。v6 先將右食指 01/02/03 接入既有兩骨／非零掛點求解，以實際 skin vertex6903 接近真扳機 side face4849；這只是指尖側面接觸，不能稱為指腹壓扳機動畫。每次仍從完整 rest pose 重算，保留全部骨長、位置、scale、父鏈與來源資產。右掌根及下三指未修完，不發布完整握姿。

新增離線最近三角面工具 `cs_surface_distance_v7.mjs`，四項 Node 測試經 RED→GREEN。負的 nearest-face signed distance 是診斷訊號，不是閉合實體的 inside 證明；必須結合來源拓樸或多視角。這些逐頂點檢核不在遊戲 render loop 執行。

v6 的食指局部修正經四圖獨立檢核通過。另以原始握把拓樸核對：284 面／144 個焊接頂點、426 邊均雙面反向共用，三個問題頂點各七方向射線均證實在封閉體內。v7 改用純 hand 權重的掌根 vertex8373（face15792）對真槍面1760，掌根最深負距由約7.97mm改善至0.20mm，兩圖局部檢核通過；食指目標仍精確、雙臂可達且無漂移。

v7 的下三指仍穿入，因此整體仍 FAIL。v8 嘗試只對三指末端施加接觸點 IK，雖末端精確但中段穿入增加，已拒絕，下一輪基線保持 v7。停止固定 curl／單一末端接觸的試誤，下一步必須以整段指節、皮膚厚度與已證閉合的握把體積約束求解。手套、步態、動畫過渡及 runtime 分流仍未完成。

## 整指約束校準與來源判斷更正

本輪凍結 v7 的雙臂、掌根、左手與食指目標，只搜尋右 middle/ring/pinky 四個 FK 自由度。新 config 將 fingerPlaneNormal 固定為原掌面基底，避免掌根接觸點的法線暗中改變屈曲軸。MCP/PIP/DIP 限於20–80/30–100/10–60度，DIP/PIP 比0.25–0.75；MCP 側張相對原骨架 rest，middle/ring/pinky 分別±8/10/15度，不是舊 alignFingerSpread 的增量。這是本模型校準範圍，不是通用生理解剖數據。

每指最多3000次 deterministic evaluation，先評全部初始姿勢。v9採四角度，v10以耦合 DIP 參數和24組固定初始姿勢搜尋；兩次皆未通過指腹接觸。v10的三指仍有0.18–0.20mm的保守代理穿入與13/13/15個交叉面，指腹接觸全部為零，不能發布。獨立八圖檢核確認「退穿入、失接觸」，因此不繼續第三次盲調相同手指自由度。

獨立解析發現原握把雖是284面、144點、426邊的 manifold，仍有12組不共頂點的自相交。root直接解析凍結 GLB 並套用完整 ancestor 矩陣，抽驗 faces1485/1670 交線長14.0058567mm，證據在 `qa/root-self-intersection.json`。**更正前文與舊v7/v9報告：拓樸閉合加奇數射線不能證明這份自相交來源的實體內外。** 舊數值保留為歷史診斷，不再作最終真值。

新 gate 採包含全部原 component 頂點的保守凸包，逐皮膚三角形做 half-space clipping；原 author surface 只提供距離與接觸法線。影響範圍進一步納入任一指節權重>0的全部頂點與相鄰面，最後以三指共同姿勢重算碰撞與接觸，防止共享 skin 權重使舊結果失效。搜尋評分第一順位亦已納入完整面交叉，不再用固定零分。

候選幾何門檻：穿入超過0.25mm的頂點為零、交叉面為零、至少兩節的預定掌側 patch 各有3頂點／2面在1.5mm內且法線相對。這只涵蓋三指對握把的有限接觸，不能取代拇指、掌根、指間、其他槍身、動畫與效能驗收。v10凍結重播只稽核同一份完整 commands，沒有再次尋優；8張圖與已審v10逐byte相同，骨架不漂移、來源與第二clone不受影響。

下一步先量原接觸面到凸包的間隙；若超過1.5mm，建立經驗證的局部凸形碰撞片；否則有限調整掌根沿握把滑動與小幅 roll。保留原手指角度限制及可見資產，不以放寬門檻掩蓋失敗。

## 分段碰撞代理與掌根框架（下一有限工作包）

真指腹 probe 顯示 ring vertex7512 對 face1755 距5.384mm，其中單一凸包已包住5.266mm；pinky vertex7732 對 face1752 距5.105mm，凸包包住3.275mm。全握把的平均間隙不足以決定這些實際接觸區。先用沿 weapon Y 的28段凸包聯集，每段名義寬≤4mm、相鄰重疊20μm，原三角面完整裁入各段再取凸包，保守覆蓋原表面；不更改可見槍械。

切片之後，原v10同姿的三指交叉面從13/13/15變成0/0/0，8PNG逐byte不變，原表面至代理沿法線出口的間隙近零，接觸仍未通過。這是修正過度保守的碰撞證據，不是新握姿。每piece的支撐面margin僅作membership符號，不再稱聯集穿入深度或用作毫米gate；搜尋改用交叉面數、各piece裁切面積總和及inside頂點數。piece重疊可能重複計入面積，明示為尋優penalty而非物理面積。

下一候選有限採右 palmRoll +10度：由真掌根face與掛點基底推得原法線偏角10.023度，此roll預測降到約1.43度。保留既有掌根點、手指角度範圍與食指扳機目標，重新有界求解三指，最多3000次／指。最終另外檢查整個右掌與五指的所有正權重頂點／相鄰面，防止三指改善但掌或拇指穿入。這仍是候選；需真skin法線、雙臂／食指可達、完整無漂移和多視角檢核才可判定。

v12 真校準結果：掌根法線偏角1.425度，雙臂與扳機食指可達；middle/ring各兩段patch通過，三指皆零inside／cross，小指只有末節patch通過。整右手仍12inside／29cross。獨立來源權重抽驗確認這12頂點與29面都主要受thumb02/03影響；獨立12張比較圖確認中指／無名指握合改善、腕線無回歸。此候選總gate仍FAIL。

v13 因此固定整掌、下三指及thumb01=25度，只搜尋thumb02∈[5,25]、03∈[0,20]度，最多600次。374次選定[25,25,0]，整右手降到2inside／6cross，中指／無名指原有patch未退；拇指仍零接觸，獨立8圖僅通過局部退出槍體的改善。兩個角度達邊界，下一步先量remaining頂點對thumb01兩種軸的小角度響應，不盲目加大02/03範圍。

離線thumb API另補輸出重入回歸：初始角度上限80度，輸出也限制80度，避免原先可能輸出90卻無法再次作input。這不改變v13的實際25/25/0解。分段proxy以ray interval union量沿表面法線的真正出口，避免將內部slab cap誤認為外表面；相關TDD涵蓋接縫、完整面穿越、旋轉／縮放下原面覆蓋、有限輸入及凹槽保持。

v13剩餘兩個頂點為重合的7838／7839，權重thumb02=.8392、thumb03=.1608；對原face1657平面向內約0.1504mm。獨立解析顯示原thumb01 curl軸幾乎不提供有效退出方向；改以真掌法線的visual-rest軸，在原curl之前加入固定小幅splay。有限測試−0.5／−1／−2度，全部保留thumb curl[25,25,0]。v14仍有3個交叉面；v15及v16的整右手1916頂點／3388相鄰面均零inside／cross。v15是掃描中最小的零碰撞變化，拇指接觸距離也比v16小，因此選作新的未完成局部基線，沒有擴大手指角度搜尋範圍。

新thumb命令選取工具採RED→GREEN：只有明訂單位軸、角度與順序的±2度內splay才允許thumb01有兩條命令，且splay不會被curl fitting覆寫。最終工具32項通過。v15凍結重播的全部mechanics與8張PNG逐byte相同；骨架、source、第二clone仍零漂移，中指／無名指／小指完整接觸報告及雙臂／食指檢查與v12相同。獨立10圖檢核確認無新虎口折角、腕線或持槍高度回歸。完整握姿仍FAIL：拇指0接觸patch，小指只有1節，另未驗指間、其他槍身與動畫。

本工作包完整unit實跑119檔／1304項通過（maxWorkers=2，47.65秒），build exit0（20.71秒）；其後只改離線thumb helper，已另重跑32項工具測試。新版比較頁實際開啟，12圖decode、點圖返回、390px無橫向溢出且零pageerror，桌面與手機截圖已存。精確版本、來源SHA、原contract快照、RED/GREEN及測試logs集中於`qa/sliced-verification.json`與`qa/sliced-independent-review.json`。這不是新FPS或整體CS2品質通過證據，候選仍未接入runtime。

## 拇指來源分類修正（v17，同姿稽核）

進一步原GLB抽驗發現v15的v7838與v7839位置相同、UV不同，都距握把face1657約0.305mm；但前者位於掌側外緣、後者位於指背。共用手掌normal>.4遮罩同時漏掉它們，不能靠加大角度或統一放寬法線門檻修正。`thumb-anatomy-v1`四向原材質與原面線框共8圖，獨立辨認指甲face14462、指背面14496及掌側面14555；指甲面本身不屬thumb02權重島。

對三頂點thumb02權重皆≥.5的133個原面，以原index共邊分為掌側／側腹53面（seed14555）和指背80面（seed14496）。原索引保留UV seam，不按位置焊接；鎖定來源SHA、mesh、正負seed與兩島數量，來源或拓樸不符即拒絕。只替換thumb02分類，其餘指節、1.5mm距離、相向法線、3點／2面及整手碰撞門檻不變。v17因此保持v15完全相同姿勢，拇指02取得5個不同位置頂點／6個接觸面，距離0.305–1.428mm；背側v7839仍排除。中指／無名指維持通過，整手無碰撞，小指仍只有末節，完整握姿未通過。

獨立檢核另指出指定thumb02時，舊gate可能被其他節的接觸代替；已RED→GREEN修正為指定節與節數同時通過。最終35項離線工具測試通過。v15→v17→最終gate稽核的8張PNG逐byte相同，除接觸分類報告外姿勢、雙臂、食指及其他手指mechanics不變。不得把分類修正說成新的外觀改善。

## 步態前置：雙腿可達性與原鞋底變形

新增`TwoBoneIK.canSolveMount()`：與solveMount共用真掛點換算及reach margin，但只更新matrix cache與scratch、不改任何骨local TRS或endError；共線pole會拒絕，既有solve保留fallback。多鏈使用時先一次提交完整FK、更新世界矩陣，兩腿都preflight通過後才解算；query不是reservation，中間不可改目標或共同祖先。3項新TDD含旋轉／縮放／非零mount、單腿不可達、退化與無效輸入，12項IK測試通過，獨立檢核通過。

真fabric-budget的鞋子`shoes04`已量測，不能拿foot或ball骨原點當鞋底。純foot權重後跟探針v1609/v1690只在y=.038812m；真正低鞋底約y=−.002213m且含calf混權。24組真角色雙腿query/solve（yaw0/π÷2、scale1/1.15、visual下沉0/2/4cm、前後半步0/10/15/20cm）確認：原站姿直腿對10cm半步已不可達，下沉2cm可達15cm，下沉4cm可達20cm。已拒絕樣本包含一腳可達一腳不可達，兩腳都不套clamp；通過樣本的真rigid heel skin與mount誤差<1e−6m。這只是可達範圍，不是完整腳掌著地。

原鞋底三姿勢probe保持ball rest，只轉foot的visual-rest X±10度。全部腿骨權重分類後，每腳224面／135點的向下低包絡候選相對純foot剛體預測最大漂移左11.388mm、右12.112mm；更嚴格近水平低面99面／74點也仍有左11.171mm、右11.881mm最大漂移。獨立六圖未見撕裂，但候選含下緣倒角，尚不能定解剖接觸frame。全候選的面積加權平面統計僅作描述，不是腳掌接地frame；下一步先按連通與高度分heel／forefoot接觸patch，再決定權重修正或依姿勢補償，不能把整鞋底當固定剛體。

本工作包完整unit119檔／1307項通過（maxWorkers=2，50.09秒），build exit0（17.04秒）。原雙臂真GLB回歸的完整mechanics與5PNG逐byte相同。鞋底平面另有2項解析／細分一致性檢查通過。新14圖檢核頁與原12圖握姿頁都已實際decode、點圖返回、手機無溢出，並存桌面／手機截圖。完整步態、aim/flinch整合、四槍握姿、runtime角色替換與新FPS驗收仍未完成；目標保持active。

## 鞋底來源權重修正候選（2026-10-05）

按原 index 共邊拆分近水平鞋底，每腳99面分為前掌81、後跟16及隔離2面。四向／姿勢標記檢核支持81/16作接觸診斷，不把它們冒充完整鞋底。原始 ball 骨獨立轉動±10度時，後跟中心仍漂移6.56–6.57mm；因此保留全部ball權重不能解決後跟問題。

`sole-weights-v1.glb` 將完整224面底部編輯核心的calf權重移給foot，按同側原面邊長最短距離以30mm smoothstep過渡；後跟16面另把ball移給foot，以40mm過渡。前掌55接觸點距後跟最短63.587mm，其ball權重逐byte保留。相同bind位置的UV seam點共用factor、修改後joint/weight完全一致。原幾何左右自身約有1.85μm差異，但左右factor仍完全相同。

四個近乎純ball的過渡點417/499/1188/1270沒有foot欄位。契約明訂只將這四点原零權重slot填入foot；不增第五影響、不替換非零joint。獨立逐byte比對確認原17,330,640-byte檔案僅有5513個WEIGHTS bytes及這4個JOINT bytes改變；geometry、JSON、貼圖、材質、骨架與其他mesh保持完全相同。候選SHA `ceed6a8d8936bdf1eef464f8ed50d602fc7a2255bf1d483f2d423ddd953113e1`，左右各328個頂點權重改動。

真Three.js完整蒙皮捕捉原版／候選、foot／ball／膝踝組合共6組，每組3姿勢與側／底原材質及patch標記。所有1704鞋點rest最大差4.48e−8m；foot全部224面最大漂移3.69e−10m，含thigh−12/calf+28組合最大2.26e−9m；ball-only後跟最大漂移3.53e−17m，前掌反應在1μm內保持。全鞋原有拓樸無新增翻面或塌面。面積比.644–1.445、normal點積最低.862只作形變診斷，不作材質伸縮品質gate；獨立44張局部影像未見新鞋面折尖、撕裂或褲口穿插，原有內踝亮色縫仍存在。

新離線工具9項＋patch解析4項＋既有平面2項驗證；patch檢查增有向原面法線，避免近共面鏡射被best-rigid-fit及向上翻normal掩蓋。原index分島拒絕同向共享邊、重複face與退化索引。候選只通過這些有限姿勢的接觸穩定、payload與局部視覺回歸，**不是完整鞋形、步態、地面接觸或FPS通過**。26圖比較頁已實際decode、點圖返回及390px溢出檢查。

小指只讀診斷另確認中節v7710至握把face1754距4.550mm；排除面最近仍5.037mm，不是thumb式遮罩漏面。末節已距0.095mm，單一MCP/PIP正向curl會先讓末節穿入。保留v17完整grip FAIL，下一有限包須用耦合姿勢或新支撐面證據，不能只擴單軸角度界。

## 可播放的定速步態校正（2026-10-05）

新增`sole-contact.ts`：全部224面／135點底部資料先轉成同一sole anchor的actor-aligned局部座標。actor/world +X pitch θ>0抬起−Z鞋尖；toe-off θ<0時ball world counterrotation β=−θ，因visual yaw π，提交的visual-rest ball command為+θ。修正先前顧問將world pitch與visual command正負混用的敘述。校正使用完整foot/ball混權表面，分正負branch以細梯形積分支撐點的Z速度；0.25° LUT查值為常數時間，每幀不掃skin。它不是把ball骨原點當鞋底。

新增`steady-gait.ts`和`qa/gait-preview.html`供互動診斷。walk/run的同腳完整cycleDistance為.6/1.3m，duty為.62/.42，兩腳相差半週期；stance的世界基準點固定，swing用quintic位置、連續抬脚與heel/flat/toe pitch。兩腿在完整ball FK後同時preflight，皆可達才solve。這個解析預览只處理平地定速，不是有起停／急轉／重生事件的正式控制器；不能直接放進renderer以全域time取代actor狀態。

真skin v1/v2/v3在接近平腳時出現patch分類失配。抽驗固定是前掌v222/v993，原面1341/1346、2748/2755皆朝下normalY約−.999；前掌本來比heel低1.44mm，不能以pitch>0就推heel。新TDD先證明小正角仍由前掌承重，再令LUT保留每knot的解剖support mask；內插cell包含起點及32個積分substep的patch聯集，避免漏掉只在cell中段成為最低點的第三支點。這是有限取樣而非解析完整包絡，獨立真skin最低點仍必須落在原81/16區。沒有放寬或補造解剖patch。

顧問指出原run固定drop10cm使輪廓過蹲。真121phase×2mm預檢量得最大所需drop46mm，將run drop降至60mm，保留14mm量測餘裕；沒有用clamp硬拉骨長。`steady-v4` walk/run×yaw0/π÷2×scale1/1.15各241幀，共1928姿勢均可達，source/second零漂移、53骨parent/position/scale不變。全部鞋子最深穿地約6.91e−8m、最大mount error7.70e−8m、解剖support失配0。0.5mm ground band內相同vertex連續episode相對首點最大位移46.9μm；這不是整stance所有頂點的總滑移或FPS證據。

Preview按鈕支援播放／暫停、walk/run、3視角與phase拖桿。暫停時切動作未立即更新曾由browser assertion證明失敗，現已修正並驗證；暫停後resize也重新繪製。v1的preview self-shadow acne保留為診斷歷史，v2之後只有ground接收陰影。正式runtime lighting未動。

`steady-v5` 補上cell中段支撐點RED→GREEN回歸，並在不可達影格清除contact episode，避免跨失敗影格續計。重新實跑1928姿勢、播放／暫停／動作切換／手機resize。完整unit為121檔1317項通過（57.41秒），build exit0（23.92秒）。這個候選依然不代表實際遊戲的效能或完整角色動作通過。

下一步必須加入每actor的stance/swing狀態、停止settle、轉向重排與teleport reset；依碰撞後world位移算速度，不能使用`Actor.moving`猜測。再合併持槍上身、aim/flinch，驗連續動作與5名bot的CPU/GPU成本後才接入runtime。這些完成前，整體CS2品質目標仍未達成。

## 急停落腳的有限工作包

先補固定朝向、平地、actor已停止後的收腳控制器。以停止當下兩腳的完整sample和body沿路距離建立複製輸入的快照plan，再按經過時間取樣；plan未deep freeze，呼叫端必須唯讀且output不得與plan內容alias，現有preview使用獨立leg.sample。距離單位均為套actor scale前的公尺。初段180ms讓空中腳回到body neutral並落地，既有stance錨點固定且透過sole LUT滾至平腳；水平移動超過15mm的空中腳加45mm抬腳bell，避免近地急停時沿地滑移。其後偏離neutral超過15mm的腳按距離由大到小、同距左腳優先，逐腳用240ms及45mm抬腳弧線收穩。組裝仍先双腿preflight才solve，任一姿勢不可達即拒整個候選。

驗收包含起點與段界位置／pitch連續、空中腳落地、支撐錨點固定、近地swing不滑回、最後idle不漂、有限輸入校驗，以及真skin的多停止相位／walk/run／yaw/scale可達性。急停瞬間不宣稱速度C1，起步／轉向／teleport／持槍和正式runtime整合另做。預覽和測試不得將播放暫停鍵冒充此控制器。

`stop-gait.ts` 最初4測試為3 fail／1 pass；追加近地bell反例後5測試為4 fail／1 pass，實作後5項全通過。`stop-v1` 實際UI抓出重播onclick重設previous後，pending rAF timestamp可能較舊，負dt觸發invalid time；時間差夾至非負後，`stop-v2` 實際操作播放急停、切動作、停止相位／進度slider與手機resize，零pageerror與橫向溢出。

`stop-v2` 共56組／2904個真skin姿勢：walk/run、7停止相位（含stance/swing邊界兩側及run雙腳flight）、yaw0/π÷2、scale1/1.15，全數双腿可達，t=0 target與原移動姿勢完全相同。最深鞋底約−6.49e−8m、最大mount error7.56e−8m、stance原解剖patch失配0；每組最後加1秒後雙腳皆flat stance，source/second/rest及bone parent/local invariants不變。獨立18圖條件通過；3張靜態進度不當作整段速度或無pop證明。

共用preview抽出poseFeet後，`steady-stop-regression-v1`完整1928姿勢mechanics與steady-v5相等、12角色PNG逐byte不變。停步plan尚不能處理移動中的actor或重新起步，不能直接當正式runtime locomotion；下一包從收穩後錨點重新起步，再做轉向及reset。

## 從站姿起步與停止後重新起步

本包固定朝向／平地，承接stop末態的flat stance與距body不超過15mm的每腳沿路錨點。以碰撞後真正前進距離推進，不接input moving或全域時間。virtual cycle從duty/2開始，左腳位於支撐中段，保留已落地錨點；右腳首步用半個步長、半個swing區間，從原錨點以quintic水平插值和半高度bell抬腳落至下個steady錨點。其後接既有steady。左脚±15mm的初始偏移保持到離地，再於第一個完整swing歸零；不能起步時瞬移至標準腳位。

先做TDD與真skin多起步相位／偏移／yaw/scale，再接可操作起步→停止收腳→重新起步預覽。驗收0位移不走步、首步與第一cycle接續、stance錨點固定、停止可接既有stop plan、來源／第二clone不漂及原steady/stop回歸。此包不宣稱轉向、急停未收穩前改向、teleport、四槍或正式runtime通過。

實作後6項起步測試通過，含非對稱左+14mm／右−13mm來源anchor、run的.21D至.29D雙腳flight、兩個首步seam±epsilon、途中stop再restart與錯誤輸入。RED分別為5測試4fail/1pass及新增flight後6測試5fail/1pass，GREEN連同steady/stop/sole為4檔21項。

`start-v1` 真skin以walk/run×5組offset（neutral及±15mm四組極值）×yaw0/π÷2×scale1/1.15共40組／4960姿勢，全部可達；stop及restart的t=0 target delta皆0、最低鞋底−6.15e−8m、最大mount error7.78e−8m、stance原patch失配0、source/second/rest及bone parent/local不漂。獨立20張圖條件通過，仍只證明有限下半身候選。

新`locomotion-preview.html`真UI完成3次起步、前方0.5m模擬阻擋後自動收脚、2次手動急停與收穩後再起步、手機390px無溢出。模擬barrier先clamp實際body，下一個零位移frame才建立stop快照；這不是正式engine碰撞驗收，收穩前重新移動仍不支援。`travel`單調性由呼叫端保證，plan未freeze且output須與plan分離。

共用preview新增API後，原steady1928姿勢與stop2904姿勢的完整mechanics完全相同，12+18角色PNG逐byte不變。完整unit123檔1328項通過（54.89秒），build exit0（20.09秒）。接下來先將既有持槍上身與下半身同頁組裝、檢查整體輪廓，再補世界錨點轉向／reset與實戰成本；既有v17小指握姿gate未通過，不能因組裝而改稱通過。

## 凍結持槍上身與步態組裝

以v17 SHA `a643bc94b294e916e8f6ff61366af456684802bb975dc8a8c8a060deba62551f` 的3筆身體、39筆手指commands、雙掌frame／面點／pole與右index vertex6903掛點組裝原rifle SHA `d05c45cd422d5d00e3572001605a97065b98e8f68bae8a28e6d2aa896211a37c`。不重跑fit/search。helper只初始化掛點、公開commands、預檢及解算，不自行applyPose/restore；caller合併ball與上身後一次applyPose，再預檢兩腿／雙臂、解四條不相交鏈，最後重新計算及預檢index鏈。

掌面clearance是actor scale1時的公尺，組裝時乘actor world uniform scale，不乘rifle .82；index target已經weaponRoot.localToWorld，不再加倍率。source骨長、parent與locals不改。任何index拒絕須標整體失敗且不render半成姿勢，下一次完整pose重建。真skin驗肩肘可達、掌／index誤差、手相對槍的凍結幾何、鞋底／腿回歸與多視角衣槍穿插；v17小指及完整grip gate仍FAIL，僅整合候選，尚不替換runtime。

`rifle-gait-v1` 40組4960姿勢全部可達，掌面最大誤差5.59e−8m、食指尖1.09e−8m；十指相對v17凍結幾何差1.18e−7 weapon-root局部公尺（非world公尺）。故意令index不可達時畫布逐byte不變，還原後成功重建。未持槍回歸4960姿勢mechanics與20張PNG完全不變。獨立審查30張持槍圖通過有限範圍；完整unit124檔1332項、build20.82秒通過。證據已歸檔`qa/rifle-gait-verification-v1.json`，full-grip與runtime gate保持false。

## 真遊戲場景中的候選成本診斷

下一有限包以`DEV && ?skinCandidate=1`才載入SHA固定的sole候選與v17握姿。只替換持rifle的bot，其他武器用原角色；舊角色public檔不變。先以一次解算的中性持槍prototype建立獨立骨架，量實際場景、陰影、skin與材質成本，不在這包加入未驗過的转向步態。候選頁顯示移動、轉向與受擊動畫尚未接入；這些成本與完整動畫品質仍未驗收。

驗收：無開關／production不請求候選；來源bytes SHA錯誤拒絕；五bot的skin instance/palette獨立；rifle切smg再切回正確釋放舊instance、不釋放共享材質貼圖來源；load途中取消不重複釋放借用rifle geometry；保留held-weapon/muzzle供既有射擊效果；high/low程式預熱；真UI購買、部署、移動、射擊、暫停可用。效能分別記常駐數、visible旗標數與真正提交render的角色數，以固定場景比較渲染成本，再記真對局數據，不將中性pose成本外推為完整步態FPS。

實作以一次解算的prototype複製完整skin，各clone有獨立bones/palette/material；SkinnedMesh.copy複製已求出的靜態bounds，避免每次建立bot又掃全部vertex。切換到非rifle時移除並dispose instance；來源geometry/maps只在renderer結束統一去重釋放。載入途中取消有獨立release，不再次dispose借用的rifle geometry；此邊界由真RED（2次）到GREEN（1次）驗證。

真引擎bot射擊驗trace及flash到held-weapon/muzzle的距離皆0。首次入局shader gate曾失敗：一般compile未覆蓋skin shadow與normal pass。離屏渲染補normal後，depth仍有3個新key；抽出program cache key確認唯一差值是numDirLightShadows 0→1。Three r182的shadow render早於setupLights，而一般compile最後一輪low留下0；alpha-tested depth material又會快取這個初始key。因此離屏warmup強制high後先compile場景建立正確light state，再真正render shadow及normal。最終首次入局新增program為0。這項修正只作用於DEV候選。

效能v1因pending上限與結尾丟棄造成GPU query樣本偏差，v2的finish/yield沒有取得有效query，兩者均保留失敗證據且不作驗收。v3改fenceSync/flush加8ms非同步clientWaitSync，每frame等待GPU signal後讀query。正序與反序各high/low×legacy/candidate共8組，每組240有效query、0disjoint、實際draw五bot。候選每幀high三角總數1,525,451、draw250，legacy438,821、draw595；low候選516,718／84，legacy154,508／199。兩輪候選GPU時間都較高，跨輪絕對值差異大。這是序列化render成本、不是自然FPS；polling會增加completion wall，不污染GPU query。完整步態IK、真對局FPS與效能可接受性仍未通過。

v3保存當時renderer/source快照；其後僅補load-time高畫質light-state compile，steady render未變。完整unit125檔1335項通過（61.95秒），build32.99秒通過；掃描58份production script及候選binary均無候選內容。DEV預覽為`http://localhost:4002/games/cs?skinCandidate=1`；原遊戲入口仍使用既有角色。候選仍未滿足隊色、完整grip及gait/turn/aim/hit動畫要求。

完整CS Chromium三檔33項通過（2.0分鐘），包含命中／受擊HUD、購買／部署／移動／換彈／暫停、資產失敗及候選生命週期。最終證據為`qa/runtime-gameplay-verification-v1.json`，94筆歷史／新hash按snapshot映射一致。其他瀏覽器及全站E2E未重跑。

下個有限包先做遠距LOD：唯讀GLB拆解且root抽驗共76,562 tri，其中vest37,056、body22,700、teeth7,120、tongue448。低畫質五人tri增量362,210恰為5×(76,562−4,120)，高畫質為其3倍。先以距離足夠遠才隱藏teeth/tongue的可逆診斷測省7,568 tri/人，再評估vest來源衍生簡化。近距原模型保持；不得改body的掌／指vertex索引或鞋子的contact streams，不直接刪vest連通島。角色與vest授權沿既有registry；正式LOD仍需多姿勢、切換pop、geometry/UV/weights與同條件效能驗收。

## 遠距衣物LOD實作範圍

沿用game-art-asset-pipeline，先在新character-lod-v7契約下生成原vest index-only sidecar，不重新匯出整個GLB。遠距geometry共用原position/normal/UV/joints/weights BufferAttributes，改用簡化後indices；近距仍原geometry。這能保護body及鞋底原ID與所有貼圖，並避免多下載一份17MB角色。工具固定meshoptimizer1.3.0，npm包SHA512已核對，位於tmp工具目錄，並非新增production相依。

依官方skinned mesh建議，骨編號不能当作連續數值直接加進誤差；先用Regularize與normal/UV品質約束，實際變形誤差另以真skin姿勢驗證。若休息姿勢表面誤差合格但變形/輪廓/alpha失敗，候選拒絕或縮小simplification，不以達到50%三角目標覆蓋品質gate。此候選仍未解決角色美術、握姿和完整動畫的剩餘要求。

實作結果：牙齒／舌頭省略暫緩，先交付單一背心LOD。v1半面數有2個面與authored normals反向，30%版有39個；不能因遠距看不出而放行。v2鎖定原始一環35個頂點，半面數仍達18,528 tri、111,168 bytes，11個真skin姿勢的source與LOD反向面皆0。30%版加鎖後仍有6個反向面，本輪不使用。v1只保留作失敗證據和已鎖SHA的重建seed。工具SHA、seed SHA、異常face IDs、lock IDs、原GLB與輸出SHA都列在build-v2-verified.json。

有限雙向表面取樣最大差0.508mm；法線最近面搜尋可能跨袋口薄層，因此角度原數據保留作診斷，不能當winding gate。另補normalized cosine與面積，11姿勢最小cosine0.05533、最小面積8.138e-10m²，這些也不是連續姿態、衣物交面或完整fit通過。獨立review實看24張同鏡位圖，有限認可半面数的8m外觀；既有握姿與衣物fit限制仍在。

DEV skinCandidate路徑使用同源BufferAttributes、不同index geometry。各角色只換自己的mesh geometry；78°垂直FOV下8m進LOD、低於7m恢復，依當幀相機FOV補償開鏡並使用實際觀戰相機。所有角色最後都回原版時，休眠LOD geometry仍由factory持有並在結束釋放一次；換槍移除單一actor不釋放共享geometry。全套unit126檔1339項、離線Node11項、CS Chromium三檔34項與build均通過。

固定五bot距離12m的8組GPU對照，各240有效query、0disjoint、0新增shader。三角面總數high由1,525,451降至1,247,531（18.22%）、low由516,718降至424,078（17.93%），draw calls不變。GPU耗時正反序结果不一致，尚不能主張FPS改善。預覽與證據集中於run-20261005-v7-character-lod；角色完整動畫與自然遊戲效能仍是下一階段工作。

## 實戰速度與凍結上身的有限候選

原步態在引擎2.6／5.3 m/s會超過每秒8步。新optional cruise swing用平滑速度起落、中央等速，保留原預設profile；1.4m walk與2.65m run的候選分別約3.71／4步每秒。40組4,960個真skin起停姿勢通過可達、腳底、C0銜接與握槍檢核，但獨立靜態檢視仍見長跨步、深蹲與上身僵硬，不能接成正式自然動作。來源及拒絕證據集中於run-20261005-v7-world-gait。

為避免每幀重解39指節命令、雙臂和食指IK，新增mountRifleToChest：一次校準後，只將非Bone武器掛到spine_03，再從rig.model建立新的neutral rest。原父骨鏈、bind inverse與共享幾何不改；禁止重播舊stance closure或finger commands。真正GLB的108組胸椎／pelvis／actor變換驗證接觸與muzzle attachment，兩個clone與原來源零漂。真步槍3個geometry／7張texture的中間釋放計數0、owner最終各1。逐clone材質dispose計數尚未在此probe獨立補齊，不能聲稱所有資源均有逐件生命週期證據。

新預覽以?frozen=1選用此路徑；另4,960姿勢零拒絕，真手指頂點對v17的weapon-local最大差約1.18e-8m。原動態IK路徑的4,960姿勢量測與32张姿勢／拒絕PNG逐byte不變。CPU合成基準只比較五角色姿勢更新、不含render或bone palette上傳，因此不是FPS驗收。正式遊戲候選仍是中性姿勢，world anchors、轉向、側移、跳躍、瞄準、受擊及自然起停尚未完成。

下一步已從Quaternius官方免費Standard取得UAL1原始archive與CC0授權，另契約character-motion-source-v7登記43個實際clips。Jog_Fwd_Loop、Sprint_Loop、Walk_Loop可作下半身retarget候選；來源rest軸與現有角色不同，不可直接複製局部quaternion。Root-motion檔的局部位移看似偏大，須先核對祖先scale、實際cycle及脚步滑動，不能直接視為可信物理步距。保留現有寫實模型、衣物和持槍校準；來源mannequin不進遊戲。

## 動作捕捉與骨段校準的有限包

UAL1 經 rest-aware rotation transfer 與唯一一次骨盆／下背補償後，Jog 與 Sprint 仍呈現過度跨跳、深收腿輪廓，獨立檢視予以淘汰。Walk／Idle 保留為接地待修候選。两版各 484 姿勢的骨架、來源隔離與握槍檢查通過，但不等於自然動作驗收；紀錄集中於 `run-20261005-v7-retarget`，不再繼續微調兩個已淘汰跑步 clip。

替代来源為 CMU 官方 subject 16 的 walk 31 與 run/jog 35（120 Hz）。原始 ASF／AMC、官方使用條款及 SHA 固定於 `run-20261005-v7-cmu-motion`；不得直接轉售原始或轉換後 motion data。先前建議的 86_23／86_34 不在官網清單且 HTTP 404，已撤回，未下载到候選。

先以 6 個 TDD 案例建立 ASF／AMC FK：骨軸 `C·M·C⁻¹`、XYZ 固定軸次序 `Rz·Ry·Rx`、保留固定髖偏移與公尺換算。對独立純矩陣 FK 的 6 幀／18 座標，最大差 0.617 微米（對照值四捨五入至 6 位小數）。來源共有 586 幀，所有來源骨長保持；這不代表鞋底接地或 seamless loop 通過。

CMU 零姿勢大腿外張 20°，而 target 只外張約 4°；直接搬 world rest-delta 會使原本近垂直的腿向內偏約 15.8°。新 offline absolute segment adapter 以 source direction／膝旋轉參考與 target 真實 child offset 建立基底，固定校準後轉移完整世界方向與 twist，不更改既有 rotation-retarget 語意。4 個 TDD 覆蓋左右反例、反序父子鏈、frame 分離及原子拒絕。現階段只處理 thigh／calf／foot 各左右 6 段；target ball 無末端骨，不猜其局部軸，腳趾轉換另列待辦。

真正角色 586 姿勢的最大骨段方向誤差 4.72e-8 rad、參考軸誤差 7.46e-8 rad，手對槍位置差小於 1.8e-15 m，來源與第二角色漂移 0，local position／scale／parents 保持。首次 QA 暴露 visual 移動後的 attached bindMatrixInverse 未刷新；改用 updateMatrixWorld 提交完整角色後，同一檢查通過，失敗紀錄保留。32 張姿勢圖、播放到片尾／重新播放／暫停、桌面與行動版截圖及影片在 `qa/segment-v2`。實際腳底最深仍穿地 11.7 mm；完整錄製片段播完停止，不偽装為無縫循環。

後續驗收依序為：獨立自然動作檢視、腳趾末端解剖基底、foot-contact 校正、有限 loop 切段與速度接縫、符合引擎 2.6／5.3 m/s 的步幅與頻率，最後才是起停／轉向／側移及 5 角色實戰效能。這些動作仍是工廠候選；完整 runtime 動畫、FPS 與 CS2 畫質目標尚未達成。


### 2026-10-05：動作循環與實戰效能

沿用原角色的 53 骨架，將 CMU walk 236→364、run 26→121 切為循環，以 8 幀重疊校正接縫，並由真實鞋底幾何校準 ball 方向。12 骨姿勢離線烘焙，runtime 依实际移動距離取樣；run 另加半週期對齊。五 bot 已接入 `skinCandidate=1` 開發路徑。

已驗證來源隔離、握槍相對姿態、循環速度接縫及兩個混合速度；1,354 項 Vitest、36 項 CS Chromium、17 項離線 Node 與 build 通過。接地、側移、轉向、瞄準與受擊姿勢仍待驗收，不能視為達到 CS2 品質。

同一 Intel／D3D11 環境在 1080p 高畫質曾有秒級 RAF 停頓，CPU profile 同期主要閒置。GPU query 與 1080p／900p 對照支持降低像素負擔，但沒有隔離成單一驅動根因，query availability 也不等於輸入延遲。高畫質 3D 上限改為 1600×900，保留陰影、材質與 AO；E2E 覆蓋 4K CSS resize、AO 尺寸與低画質。無覆寫的最終實戰量測 high／low 均約 60 FPS，限此裝置與測試時段。

### 2026-10-05：接地與混合姿勢

新候選集中於 `run-20261005-v7-cmu-contact`。量測使用真鞋底 135 頂點／腳與原索引三角形，納入角色世界前進量。支撐速度以面積加權、距最低面 2 mm 的連續權重計算，不把最低頂點身份切換誤當滑步。

純走跑 v2 保留腳掌世界方向與腳趾彎曲，以雙腿共同預檢後的離線 IK 烘焙修正。512 幀可達，骨盆下沉 walk 18.25 mm、run 16.39 mm；正式 consumer 的 1,024 相位、兩循環量測顯示支撐滑移 RMS 明顯下降。有限視覺抽驗未見新增膝反折或握槍漂移。然而直接混合這兩個修正 clip，在 2.6／3 m/s 仍穿地 10.5／21.8 mm，因此尚未進 runtime。

已增加可選的烘焙混合節點 consumer，維持每幀兩份 pose 取樣，不加入 runtime IK 或鞋底頂點掃描。候選生成另比較關節插值、末端位置插值、接觸事件相位對齊；全段雙腿可達、接觸時序、骨盆位移、相鄰節點內插與視覺動作必須同時通過。40 mm 骨盆修正門檻保留，失敗的候選不替換現有遊戲資料。

### 2026-10-05：共同身體軌跡接入開發版

支撐腳帶動身體的 retiming 候選及 global-strike body reference 均淘汰：相對現有同相位遊戲姿勢的總下沉分別達 52.23／51.21 mm。只把 pure drop 與額外 IK drop 相加會漏掉 body retiming，不能當作 40 mm gate。相關失敗與被撤回的座標 finding 均保留。

新版本固定現有 consumer 的上半身時序，只有腳端點依 contact time warp；共同 visual offset 以六組 Fourier harmonics、兩腿 reach balls 與固定界限做離線求解。白化 Dykstra 的兩個最緊節點經獨立零起點 SQP 核對，root correction 最大差約 3.5 奈米。純來源 body 重採樣有 7.86 微米／0.000225 rad 以內差異，未宣稱完全逐位元相同。

21 節點、256 間隔的六位量化資料為 3,117,944 bytes，SHA 15132eadb5a63f972399717233b9e4e85af8f810403fc3d930280f1cced9866b。壓縮相對 full bake 的最大角差 0.01353 rad，另以正式 consumer 驗 65×1024 真 skin 姿勢：最小鞋底 +0.104 mm、相對 current runtime 最大下沉 29.9734 mm。每幀仍取兩份 pose，IK、contact 頂點掃描與求解皆留在離線。

已切入 DEV skinCandidate。1,358 Vitest、35 離線 Node、4 Python oracle 測試、36 CS Chromium 與 build 通過。五 bot 真實控制流程 high 625／low 624 幀，平均 16.666 ms、p95 16.8／16.7 ms，限目前 Intel D3D11 裝置。證據與比較頁在 run-20261005-v7-cmu-body-track。轉向、側移、起停、受擊／瞄準姿勢及整體 CS2 品質仍未完成，正式美術發布仍未核准。

### 2026-10-05：新版角色的短促受擊反應

真引擎命中原本已有伤害／HUD／音效，但候選骨架分支未接收 renderer 已計算的 flinch。現在把該事件傳入候選，先還原上次疊加、更新走跑，再以 actor 空間的小幅轉動分配至三節脊椎；雙腳分支與槍手相對姿勢不變。低階 API 只接受 bounded flinch，不包含瞄準。

最初完整 spine aim 在 0.6／1.54 rad 出現不自然後仰，已淘汰並封存，沒有進入遊戲。後續瞄準應改由肩與雙臂、有限頭部跟隨處理，需雙手可達性與實際皮膚檢查，不能直接旋轉腰背替代。

本包 432 組真皮膚姿勢的鞋位移為零；真引擎射擊量得 22 傷害、約 0.07063 rad 的身體反應，15 個模擬 tick 內單調衰減至零，重複繪製與回合重設無殘留。完整 1,363 Vitest、既有硬體設定下的 37 CS Chromium、build 與獨占五 bot 實戰驗證記於 run-20261005-v7-combat-pose/qa/verification-v1.json。通用 headless 設定實際使用 SwiftShader，該次 34/37 通過，兩項渲染逾時與一次換彈延遲完整保留，未宣称已解決軟體渲染效能。高畫質平均約 16.693 ms、p95 16.7 ms，但 623 幀中有一次轉向幀 33.3 ms，不宣稱完全零掉幀。正式美術發布與整體 CS2 品質仍未完成。

側移來源已在 CMU 官方 subject 69 確認：69_42、69_48 為側走加轉身，69_34 為後退加轉身；本輪僅核對目錄，尚未下载或核准片段。

### 2026-10-05：雙臂瞄準的可行性與拒絕

在 `run-20261005-v7-rifle-aim` 建立肩 pivot、雙腕原子 preflight、真槍 bore 驗證及有限頭部跟隨。第一版極角不可達；第二版加入共同可達球投影與 actor-relative bore 補償，數學可達但槍穿軀幹；第三版平滑身前避讓改善穿插，卻留下折腕與槍托離肩。獨立審查拒絕接入。

最後以 TDD 修正肘 pole 的座標系，讓它跟隨 clavicle 而不是整把槍旋轉。160 個離散樣本全可達，真 skin 握點相對誤差最大約 1.06e-7m、實際 muzzle −Z 相對射線誤差約 4.72e-8rad，鞋底零位移。肘後翻改善，但完整極角姿勢仍未通過；沒有接入 DEV/runtime，也沒有新的瞄準效能宣稱。

本輪完整 Vitest 132 檔／1,375 項通過，build 通過。診斷頁播放／暫停、角度、受擊、相位與版本比較操作通過；第一次 UI automation 的 range 值 `.3` 格式不被瀏覽器接受，改為 `0.3` 後通過，失敗紀錄保留。未跑新實戰 E2E／效能或 dense 連續性，原因是視覺已拒絕且遊戲動作分支沒有改動。下一步先定義真槍托接觸、肩窩與腕約束，再處理有限上身／肩帶協調。完整 CS2 品質目標維持 active。
