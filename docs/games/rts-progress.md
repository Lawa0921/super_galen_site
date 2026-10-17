<!-- claude-roster-icons-20261017 -->
2026-10-17 Claude（feat/browser-rts-candidate，worktree rts-g）：擴編兵種訓練圖示與英雄技能圖示，待使用者確認風格。
- 訓練圖示：長槍兵、遊俠、曦光法師依目前 GLB 重新渲染（舊圖早於 b8a3dd15 握拳手部與 42bf0cdf 待機姿勢），renderer、燈光、取景與門檻都和已核准的 2026-10-16 圖示相同；run `art-factory/rts/runs/unit-train-icons/2026-10-17-roster/`。`unitIcon()` 改為回傳 `string|undefined`，訓練／復活按鈕與多選列表在 rosterPreview 下顯示圖示；獅鷲騎士、曦光賢者、遊俠隊長沒有執行期模型，維持文字按鈕。
- 技能圖示：曦光爆裂、晨輝療癒、破曉、箭雨、疾行號令、獵殺標記由 codex 內建生圖產生（洋紅底，用 `model_polish_codex_texture.py`），經確定性去背（`hero-ability-icons/2026-10-17-v1/postprocess.py`），機械 QA 六張全過：key 殘色 0、2px 外半透明 0、貼邊 0、誤刪非 key 像素 0。codex 曾自行加工 sunburst／sprint 的複本，已換回 image_gen 原始輸出並記在 gen.json。`skillIcon()` 接上施放與學習按鈕。誓衛統領的三個技能原本就有圖，本輪沒有改。
- 審核頁 `art-factory/rts/review/roster-icons-20261017.html`；遊戲內截圖 `tmp/rts/visual-roster-icons/`（`art-factory/rts/tools/roster_icons_ingame_capture.mjs`）只拍得到建築指令卡，預覽英雄／兵種沒有執行期模型，無法放進 3D 戰場。
- 驗證：vitest 全套 2,158 通過 0 失敗（--maxWorkers=2）、strict tsc 0、Chromium RTS E2E 35／35（4393，workers=1）。
<!-- /claude-roster-icons-20261017 -->
<!-- claude-render-cpu-20261017 -->
2026-10-17 Claude（feat/browser-rts-candidate，worktree rts-g）：戰場主執行緒 CPU 降耗，畫面與模擬不變。
- 瓶頸：Battlefield.render 約 80% 是 three.js renderer.render（每幀 698 draw、陰影 30 Hz）；其中材質切換時整套 uniform 重傳是可去除的部分。每個單位各自 clone 一份 TeamCloth（130 份），各 GLB 也各自載入相同的 kit 材質。
- 變更：ModelLibrary 以（來源材質、隊伍、ghost）共用隊伍布料／迷霧殘影材質（`InstanceMaterials`，隨 library 釋放）；載入時把不同資產間屬性完全相同的材質合併為一份（`material-dedupe.ts`，同一資產內不合併，skin 與完工建築批次不變）；迷霧貼圖只在新的 TeamView 快照時重掃（`FogTextureSync`）。主 pass 材質切換 257→91，draw 數 698 不變。
- 量測（LDPlayer 與其他程序佔 CPU 約 94%，只作同條件前後交替比較）：perf-timing 兩輪交替 battlefield 中位數 12.7／12.1 → 10.7／11.5 ms（較輕負載時 7.3／8.0 → 6.8／6.7 ms），GPU 1.46 ms 不變；CPU profile 每幀 Battlefield.render 約 9.7 → 8.7 ms（`tmp/rts/perf-opt/final-*-profile`）。重負載下尚未達 ≤ 8 ms，剩餘成本為 three.js 逐 draw 提交、骨架矩陣與動畫混合，進一步降耗需減少 draw（素材端合併材質／批次蒙皮）。
- 畫面：固定 RAF 時鐘於模擬 6.05 s 截圖，60 m 與 24 m 視野前後逐像素比較（`tmp/rts/visual-perf/`）：24 m 0 像素不同，60 m 僅 1 像素差 9/255。
- 驗證：vitest 210 檔／2,152 通過（27 skipped）、tsc 0、Chromium RTS E2E 35／35（埠 4393）。
<!-- /claude-render-cpu-20261017 -->
<!-- claude-map288-20261017 -->
2026-10-17 Claude（feat/browser-rts-maps-288，worktree rts-e）：使用者回饋 192 m「地圖也還是很小」，兩圖放大為 288 × 288、鏡頭最遠 60 公尺。
- 版面：起點 (24,144)／(264,144) 相距 240 m；每方主礦＋自然擴張（北）＋第三礦（南）＋南側渡口前沿礦＋中央富礦 4500，每圖 22 處資源、10 組營地、16 處地標、樹 ~770／800；雙河谷地河道在三渡口間擺盪 ±9 m（橋 z 84／204、淺灘 z 141–146）；灰脊隘口連續岩脊 x 140–147，中央隘口、南北繞行道、兩條山徑，兩道岩刺圍出隘口前中央谷地。對稱測試 0 不對稱格。
- 鏡頭 24–60 m（原 24–100），開局 48 m，平移 34 m/s（最遠 ~42 m/s）；>80 m 的總覽擷取把正交相機沿視線後移，縮圖不再被近裁切面切掉。
- 尋路：地形可走性依格網指紋跨查詢共用；canPlace 以「不含新建築」連通分量＋局部繞行證明，證不了才全圖 flood（暴力 flood 對照測試）。288 m 80 條長路徑每條 0.8–1.2 ms（192 m 為 0.65／0.51；288 m 改前 1.04／1.07；受主機負載影響），canPlace 1.0–2.1 ms（改前 12.6／12.7；每組障礙物首次 ~30 ms）。
- AI：偵察兵持續以敵方起點為第一目標；沒有已知敵方建築時，第一波到期 90 秒後全軍依序 attack-move 敵方起點與視野外金礦點；目標倒下且部隊離家 >60 m 時立即轉攻最近已知建築；工人勘查先走金礦點（自然礦 88 s 發現）。AI-vs-AI normal seed 1–3：river 983／962／1346 s、pass 1286／1059／1000 s，皆在 30 分鐘內分出勝負；難度 easy<normal<hard（8 分鐘兵數 river 9／16／21、pass 9／15／22）；20 分鐘木材未枯竭。
- 驗證：RTS vitest 727／727、全專案 1,954／1,954（`unit-source-rights.test.ts` 因未追蹤的 `runs/all-models/2026-10-14-v1/raw/baseline-unit-registry.json` 不存在而無法載入，接手前即如此）；strict tsc 0 errors；Chromium RTS E2E 35／35（workers=1，port 4395）。Firefox／WebKit 未跑。
- 效能（模擬器可能在跑，只作相對比較）：production fixture 1920×1080 60 m 視野 80 單位＋20 建築全在畫面，`tmp/rts/perf-map288-1/` median 59.9 FPS、p95 24.9 ms、world draws 839；對照 perf-bigmap-1（76 m 視野）48.1 FPS、p95 25.1 ms、859。fixture 佈局隨 60 m 上限縮為 0.8 倍，兩者視野不同。
- 縮圖：`art-factory/rts/runs/map-thumbnails/2026-10-16-map288/`（camera 144,144 span 234），取代 192 m bigmap run。
<!-- /claude-map288-20261017 -->
<!-- model-polish-r3-20261017 -->
2026-10-17 第三輪精修（同分支 `feat/browser-rts-model-polish`，未合併，待使用者在檢視間核准）：
- 下載量：production build 實測首圖原為 65.70 MB（雙河谷地）／66.25 MB（灰脊隘口），遠超 35 MB；主因是 polish-v1 外部貼圖沒有走共用載入器，每個 GLB 各下載一次（2048 裝備圖集重複 14 次）。修正後加上地標／道具共用貼圖、指令面板 PNG→WebP、中庭地面 PNG→JPEG：31.38 MB／31.91 MB（本機 gzip，未驗 CDN）。紀錄 `art-factory/rts/runs/model-polish/2026-10-17-v1/qa/download-{river,pass}.json`。
- 地標四座（兩階 LOD）：嵌入的 128–384 px 貼圖改為共用 1024：修整石→本輪 codex 原創風化石灰岩、ashlar→detail-v1 1024、木料→由原 1254 px 原圖重導的 1024 硬木、黃銅→polish-v1；GLB 每檔少 200–260 KB。道具：樹皮、年輪、金礦石重導 1024 共用；金礦岩塊 Loop 細分＋平滑法線（992→3,392 三角面）；岩石平滑法線（三角面不變）。
- 樹冠：橡樹／松樹葉片卡放大 1.22 倍，每兩張加一張內層卡（橡樹 +616、松樹 +746 三角面），橡樹也啟用 alpha-to-coverage；遊戲縮放下樹冠不再透出枝幹。
- 遺留問題：盾頂兩角的尖角摺痕（輪廓側邊起點高於頂弧 4 cm）修正、鉚釘改凸起黃銅（衛兵／騎士／指揮官，在上一輪量測的同一座標系重建並套用手部輪的位移，殘差 < 0.1 mm）；裝備圖集橡木格與弩身／法杖改胡桃色；兵營外牆加木構架與窗框十字櫺、石窗台（兵營沒有門洞，門框不適用）；工人右手袖口內的膚色碎片移除（LOD0 63、LOD1 35 三角面）；死亡動畫盾牌與身體 8 mm 貼近量測為 0、無穿地（`qa/death-clearance.json`）。
- 來源權利測試：未提交的 30 個備份 GLB／.blend（32.9 MB）改以 `art-factory/rts/manifests/unit-lineage-binaries.json` 釘選 sha256 與幾何指紋；乾淨 clone 模擬（移走所有未追蹤二進位）通過，缺檔項目以明確原因 skip。
- 驗證：glTF Validator 30 檔 0 errors；`npx vitest run --maxWorkers=2` 201 檔／2,077 項通過；strict tsc（rts-f scratchpad config）0 errors；RTS Chromium E2E 35／35（4394，workers=1）；骨架／蒙皮／動畫位元組不變。
- 審核頁：`art-factory/rts/review/model-polish-20261016.html#round3`；檢視間 http://127.0.0.1:4394/games/rts/models/ 。
- 未完成：樹冠加密後未重跑正式效能量測；死亡姿勢近拍未截到（檢視間動畫選單自動化未切換）；裝備圖集皮革極近距離顆粒感仍在。
<!-- /model-polish-r3-20261017 -->
<!-- model-polish-20261016 -->
2026-10-16 模型精修（分支 `feat/browser-rts-model-polish`，未合併，待使用者在檢視間核准）：
- 武器／盾牌：衛兵劍盾、指揮官長劍與盾、騎士長槍（含隊色燕尾旗）與盾、工人斧、掠奪者短斧改為程式原生新幾何（血槽劍身、彎曲護手、纏繩握把、柄頭；弧面鳶形盾、鍛鋼盾緣、太陽浮雕、鉚釘、橡木背板與臂帶；鬍鬚斧亮刃），沿用原手骨剛性綁定與全部動畫；弩與法杖幾何不變、換 1024 新材質。新武器共用 2048 裝備圖集（單位繪製批次反而減少：衛兵 8→6、騎士 17→14、工人 7→4）。
- 建築：兵營與城鎮大廳三階外牆加勒腳、轉角扶壁、自門頂起的壁柱、樓層腰線、主樓簷下托臂帶，併入既有第 1 階段石材 primitive（材質數、繪製批次、建造階段不變）；修整石、石板、木料改 1024 貼圖。
- 材質來源：codex 內建生圖原創材質原圖 → `art-factory/rts/tools/model_polish_textures.py` 確定性後處理；紀錄於 `art-factory/rts/runs/model-polish/2026-10-16-v1/qa/textures.json`、契約 `art-factory/rts/contracts/model-polish-2026-10-16.json`。
- 審核頁：`art-factory/rts/review/model-polish-20261016.html`；檢視間：http://127.0.0.1:4394/games/rts/models/ 。
- 驗證：glTF Validator 18 檔 0 errors（僅既有 non-root skin warnings）；`npx vitest run --maxWorkers=2` 198 檔／2,003 項通過；strict tsc 0 errors；RTS Chromium E2E 35／35（workers=1）。
- 未完成：地標貼圖解析度、遠景樹木、首圖下載預算未以 production build 重新量測（新增貼圖約 4.6 MB、GLB +0.9 MB）。
<!-- /model-polish-20261016 -->
<!-- model-polish-hands-20261016 -->
2026-10-16 手部精修（同分支，未合併，待使用者核准）：使用者近看回饋「很多的手部都不行」。七個人形單位（工人、衛兵、弩手、騎士騎手、祭司、中立掠奪者、指揮官）每隻手逐動畫、正面／3/4／背側、棚燈與遊戲光照近拍檢查。
- 修改前缺陷：手指是同心環或扁條（無指節、無拇指）、方塊掌背；盾牌手拳頭浮在皮帶旁沒握住；裸手（工人、祭司、掠奪者左手）是 TripoSR 連指手；掠奪者斧柄握處粗 10 cm；騎士右手為平板鋼片盒；腕部切口外露。
- 修改：`art-factory/rts/tools/model_hands_geometry.py`／`model_hands_build.py` 以程式原生幾何重建每隻手（每指三節膠囊、拇指含掌骨反向包握、掌心肉墊；板甲加每節鋼甲片、指節帽、掌背甲、剛性喇叭袖口；皮手套半混合袖口），在 Idle 姿勢量測實際握柄軸／半徑與手腕後閉握；盾牌加皮纏把手與托架並平移貼近拳頭、移除浮空舊皮帶；斧柄只在手內收細；被手套覆蓋的裸手三角面移除。骨架／蒙皮／動畫位元組不變，無新增貼圖，繪製批次不增加。
- 紀錄：`art-factory/rts/runs/model-polish/2026-10-16-hands-v1/qa/`（各單位 `*-hands.json`、`invariants.json`、`clearance.json`、`gltf-validator.json`、`review.json`）；審核頁 `art-factory/rts/review/model-polish-20261016.html#hands`。
- 驗證：LOD0 最高 25,578（上限 26,000），LOD1 皆不高於修改前；繪製批次 ≤ 修改前（衛兵 9→7、指揮官 8→6、騎士 14→12，其餘不變）；glTF Validator 14 檔 0 errors；腕部伸縮與身體貼近量測不劣於修改前；`model_hands_geometry_test.py` 5 項、`model-hands.test.ts` 14 項（對修改前快照 14 項全失敗）；`npx vitest run --maxWorkers=2` 2,017 項通過；strict tsc 0 errors；RTS Chromium E2E 35／35（4394，workers=1）。
- 未完成：裝備圖集皮革在極近距離仍偏粗顆粒；騎士右手從上覆握長槍、弩手右手多被弩身遮住；工人右手背側極近距離偶見 1–2 個膚色小三角穿出袖口；死亡動畫未納入貼近量測。
<!-- /model-polish-hands-20261016 -->

<!-- claude-handoff-20261016 -->
2026-10-16 Claude 接手：
- 效能門檻：同一份 build（fixture `0e02155c…`、runtime `adbd3133…`、index `937a397c…`）在外部負載較低時正式量測通過（中位數 120.5 FPS、p95 16.6 ms，`qa/perf-claude-0-prebuild/`）；LDPlayer 負載上升後同一份程式降到 p95 37.5 ms（`qa/perf-claude-1/`）。主執行緒 idle 0.7%、GC 0.3%、GPU 中位數 1.4 ms，判定 p95 失敗主因是外部 CPU 爭用。正式驗收須在模擬器關閉時重跑。
- 靜態世界與迷霧殘影凍結世界矩陣（含 SkinnedMesh 防護），`updateMatrixWorld` 含子呼叫佔比 15.4% → 9.4%（`qa/perf-claude-2-profile/`）。
- 全專案 `tsc --noEmit -p tsconfig.json` 78 → 0；`npx vitest run --maxWorkers=2` 1,897／1,897 通過；33／33 RTS Chromium E2E（workers=1）通過。
- 尚未完成：低負載環境的正式效能複測、Firefox／WebKit RTS 與全站 `test:all`、使用者外觀核准。
<!-- /claude-handoff-20261016 -->

<!-- resource-stop-20261016 -->
2026-10-16 後續修正：單位身高改用實際頂點，修復血條過高與一般鏡頭 LOD 判斷錯誤；保留全動畫裁切邊界，並快取每兵種量測。118 項相關測試、186 檔／1,892 項全套單測（最多 2 workers）、目前全部 RTS 檔案的 strict types、建置及整批模型實景測試均通過。實景包含 56 張圖、564 個靜態樣本、8 個肖像，服務資產 SHA 相符。

使用者回報 CPU 用量過高後，已停止本輪 16 個測試／瀏覽器／錄影／預覽程序，最後查核均已退出。33 項 RTS E2E 在第 9 項執行期間中止，視覺獨立複審也中止，不能視為整批完成。4340／4321 預覽已關閉。後續不得自動重啟重負載測試或預覽；一次只跑一項測試命令、最多 2 workers，關閉非必要錄影與背景掃描。最新狀態：`art-factory/rts/runs/visual-revision/2026-10-16-complete-packed-v4/qa/presentation-height/resource-stop.json`。以下為先前驗證紀錄。
<!-- /resource-stop-20261016 -->

<!-- all-models-visual-revision-20261016 -->
2026-10-16 全模型候選整合：34 個模型、46 個 GLB、99 張材質集中在 `art-factory/rts/runs/visual-revision/2026-10-16-complete-packed-v4/`。八種單位已完成握持、身體／甲片、騎乘裝備、全部既有動畫與兩級 LOD 的修整或回歸；場景部分修正橋拱、岩石／礦坑拓樸及 UV、兩種弩矢尾翼。守衛／騎士補齊動畫邊界，騎士合併完全等價的材質引用，保留原幾何、骨架權重與動畫資料。

執行端保留各 LOD 動畫時間軸，只略過獨立隱藏骨架的世界矩陣更新；小地圖改為一次像素上傳，八組實際 Canvas 比對完全一致。玩家視野資料改為先過濾後整批複製，保持模擬資料隔離與敵方資訊遮蔽。186 檔／1,889 項單元測試、33／33 項靜音 Chromium RTS E2E 與 production build 通過。46 個 GLB 格式驗證零錯誤／148 個既有警告；99 張材質在三種瀏覽器解碼完全一致。最新整批實際遊戲測試 1/1 通過，包含八種單位、隊色、完整動作取樣、遠近 LOD 與八個肖像，所有服務資產 SHA 吻合。第一張地圖實際請求的 gzip-6 下載估算 34,586,224 bytes，低於 35 MB；這是估算而非 CDN 實測。

尚未完成整批最終驗收：正式 60 秒／80 單位／20 建築壓力測試中位數 59.88 FPS，但 p95 33.4 ms 未達 <33 ms。最終 RTS 操作回歸 33／33 與 56／56 張實機截圖獨立複審通過；全域 typecheck 維持 78 個既有診斷，整站完整多瀏覽器 release gate 仍未過。使用者的整體外觀核准與正式發布均未標記通過，所有測試維持靜音。

目前整批候選：[實際遊戲](http://127.0.0.1:4340/games/rts/) · [模型與骨架檢視](http://127.0.0.1:4340/)。4321 的 public 版本尚未替換。最新證據：`art-factory/rts/runs/visual-revision/2026-10-16-complete-packed-v4/qa/final-acceptance.json`。以下保留歷史紀錄，不代表最新候選結果。
<!-- /all-models-visual-revision-20261016 -->

<!-- commander-assembly-refinement-20261014 -->
2026-10-14 ???????????????????????????????????????????????????????????????????????????????????????????????? detail-v1 ???Death ?????????????????????????????????????????????????????????? Death ?????????????

???992 ??????????636 ????1,272 ?????????????? 0???? 8 ?? ? 2 LOD ? 2 ?? ? 61 ??? 1,952 ??????????? 2.42 cm?70 ?????????????????????????????LOD ????????????????? E2E ? 1 ???????????????? 46/46 ????????GLB payload ????????????????? 20 ?????? Death ????????????????UV???????????????????

LOD0 / LOD1 ? 24,316 / 12,059 ???????? 35k ?????? 13 draws??? GLB ? 1.87 / 1.19 MB?????????????? gzip-6 ??? 27,954,646 bytes??? 35 MB??????????? CDN ???glTF 0 errors?10 ??????? non-root skin warnings???????????????????????????????????????????????? push?deploy???????????????????????? release gate ???

[????](http://127.0.0.1:4321/games/rts/) ? [????????](http://127.0.0.1:4337/)????????? QA?????????????`art-factory/rts/runs/commander-assembly/2026-10-14-v1/qa/completion.json`????`commander_assembly_qa.py`?`commander_assembly_collision.py`?Blender??`commander_assembly_integrity.py`?`commander_assembly_validate.mjs`?`commander_assembly_capture.mjs`?`npx playwright test --config art-factory/rts/tools/commander_assembly_playwright.config.ts`?`RTS_ASSEMBLY_PUBLISHED=1` ???????????????`node art-factory/rts/tools/commander_assembly_serve.mjs`?
<!-- /commander-assembly-refinement-20261014 -->

<!-- commander-grip-refinement-20261014 -->
2026-10-14 握劍修正已套用本機遊戲：移除原本張開且與劍柄分離的右手，改成包覆劍柄的閉合手套，劍刃由拇指側朝前；Death 只修改右手旋轉，讓劍向外放平。兩級模型均更新，最新盾牌、20 骨骨架、其他 7 段動畫、Death 其他骨骼與手部以外的身體表面／UV／權重保持不變。

驗收：原模型先因約 9.26 cm 握柄間隙失敗；修正後 496 個握持接觸取樣通過，8 段動作 × 2 LOD × 61 姿態的 976 個劍身離地取樣通過（最低約 20.94 cm）；43 張一般視角與 4 張倒地手腕追蹤近照已留存。候選與套用後的實際遊戲測試各 1 項通過，包含五基本動作、遠近模型、點選胸像與兩個 HTTP 模型雜湊核對。獨立視覺與資料檢核均放行「握姿修正」範圍。GLB 驗證 0 errors／8 個 non-root skin warnings（新增手套節點沿用相同骨架結構）。移除未引用 buffer 後，兩級檔案 1,234,792 / 870,852 bytes，比修改前小；所有有效幾何、蒙皮及動畫資料在封裝前後一致。測試 Chromium 全程使用 `--mute-audio`。

更正前輪驗收敘述：先前擺拍測試只斷言肖像容器可見，後續主相機重繪會覆蓋肖像。本輪先關閉擺拍覆寫再點選，舊版與候選都已實看正常胸像；遊戲本身沒有為此修改。

仍待精修：近景手套的指節層次與磨損；左手盾把閉合；既有 Death 盾牌入身／約 6.7 cm 入地。這些未算成完成，整體角色、遊戲人工驗收與完整 release gate 仍 pending。未 push／deploy。

預覽：[握劍前後互動對照](http://127.0.0.1:4336/) · [本機遊戲](http://127.0.0.1:4321/games/rts/)。證據與來源：`art-factory/rts/runs/commander-grip/2026-10-14-v1/`。預覽啟動：`node art-factory/rts/tools/commander_grip_serve.mjs`（沿用 4321）。重驗入口：`commander_grip_check.py`、`commander_grip_parity.py`（Blender）；`commander_grip_budget.py`；`commander_grip_validate.mjs`；`commander_grip_capture.mjs`；`commander_grip_wrist_capture.mjs`；`npx playwright test --config art-factory/rts/tools/commander_grip_playwright.config.ts`（`RTS_GRIP_PUBLISHED=1` 核對已套用模型）。
<!-- /commander-grip-refinement-20261014 -->

<!-- commander-shield-refinement-20261014 -->
2026-10-14 建模精修：指揮官的平板長方盾已改為弧面尖底盾，加入成形鋼製盾緣、黃銅嵌線、曙光浮雕、背面木補強與皮革握把；兩級模型均已套用到本機 runtime。角色本體、劍、20 骨骨架、8 段動畫與既有貼圖資料保持不變。新盾 LOD0 / LOD1 為 1,160 / 616 三角形，無非流形邊與零面積面；GLB 驗證 0 errors，6 個既有 non-root skin warnings。

驗收：舊盾先因收尖比例檢查失敗（1.000），新源檔檢查通過；8 段動作 × 2 LOD × 61 姿態共 976 次取樣；26 張近景、背面、側面、動作及紅隊 LOD1 圖；候選及發布後各 1 項實際遊戲 e2e 通過，發布後另含點選指揮官與肖像顯示；相關模型與隊色單元測試 46 / 46 通過。獨立唯讀審查放行範圍僅為盾牌。本次測試 Chromium 使用 `--mute-audio`。

仍未完成：手掌未真正握住劍／盾把、Death 動作盾入身與約 6.7 cm 入地。這輪新增入地差異最大 0.89 mm；不可將局部模型驗收擴大為整體角色或遊戲完成。後續建模應優先處理閉合握持與倒地時的裝備姿態。整體人工美術驗收、完整 release gate、外部發布均未宣稱通過。

預覽：[前後互動對照](http://127.0.0.1:4335/) · [本機遊戲](http://127.0.0.1:4321/games/rts/)。本輪來源、舊版備份、候選、逐項 QA 與發布紀錄：`art-factory/rts/runs/commander-shield/2026-10-14-v1/`。預覽重新啟動：`node art-factory/rts/tools/commander_shield_serve.mjs`（沿用 4321 開發服務）。以下音訊／GPU 與完整驗收紀錄保留為歷史，不是本輪建模工作。
<!-- /commander-shield-refinement-20261014 -->

<!-- linux-container-v1-status -->
2026-10-14 實際遊戲驗證：Windows RTS chromium 32 通過／0 失敗／0 略過；firefox 32 通過／0 失敗／0 略過。中央隘口原案單案11.016秒通過，20人於7秒模擬時間通過、11秒停穩；遊戲來源、斷言與120秒期限未修改。

Linux GPU 的原中央隘口案例通過（1/1、27.608 秒、native0），無聲 Pulse 輸出前後檢查通過；fresh collection 保留六個 project／2263 案例。完整 test:all 的 182 檔／1850 單元測試通過，但 WebKit 首案建立頁面逾時，已停止該輪（outer143、容器移除），不計完整通過。有限對照確認：移除強制 D3D12 後 WebKit 首頁通過，原 RTS 隘口仍因軟體繪圖逾時；WPE 與 GTK 的硬體路徑均在此環境無法初始化 EGL，停止同路線重試。目前 Windows production build／strict types 均 native0，preview HTTP200；沒有完整測試在執行、沒有新 commit／push／deploy。完整回歸及人工驗收仍未完成。證據：qa/linux-gpu-closeout-20261014/disposition.json、qa/game-quality-gpu-closeout-20261014；交接：tmp/rts/completion-next-steps-v12.json。
<!-- /linux-container-v1-status -->

<!-- v20-current-status -->
V20 的 Expired no-op 來源與離線測試通過，但 8 案零 PCM 整合在 46.105 秒因 Active session 缺 leaf 身分而保護性中止（native1）。受控 Job 清理前後皆0；3138 frozen inputs與9 absolute files未變。沒有完整report，不以進度標題推算通過數。沒有重跑全套。下一步評估專用、無主機音訊輸出的隔離環境，並完成獨立封裝離線修正。詳見 `art-factory/rts/runs/commercial-readiness/2026-10-12/qa/quiet-job-v20-spine/disposition.json`。
<!-- /v20-current-status -->

<!-- v19-current-status -->
V19 原始完整流程因靜音保護而中止（native1）：182 檔／1850 單元測試與已完成的 50 個 E2E 通過，但 2263 案全套未完成。正式 Chromium 已證明屬於測試 Job；中止原因是另一個 Inactive 音訊 session 的 leaf 程序已無法保留身分。不可由 opaque instance ID 推論來源。受控 Job 清理 active1→0，14 份原始證據已獨立檢核；詳見 `art-factory/rts/runs/commercial-readiness/2026-10-12/qa/full-regression-disposition-v19.json` 與 `art-factory/rts/runs/commercial-readiness/2026-10-12/qa/full-regression-result-review-v19.json`。下一步只處理此退出競態，不盲目重跑、不中止其他應用。完整驗收、本機提交與人工視覺／操作／聽感驗收尚未完成。
<!-- /v19-current-status -->

# RTS 實作紀錄

2026-10-13 UTC17:23 V18 已保護性停止，session26099 關閉：182 檔／1,850 單元全通過；第 1 個 E2E 的零 PCM 預熱因 ancestry Owned、Job membership Out 的矛盾失敗，正式預熱成功數為 0，沒有完整 report、ledger end 或 inner exit。guard 本次自行 native1，非成功後 SIGTERM；supervisor／quiet 均 native1，161.201920 秒，Job 清理前後 active0。全部 2,881 輸入／2,411 runtime／6 執行檔與契約／審查不變。後續不含瀏覽器或音訊的程序鏈實驗已證明 Node→目前 WindowsApps Python 及 assigned Python root→Node 會出現 In→Out；直接 backing module 亦同，Node→Node control 保持 In。這是精確啟動路徑的觀測，未宣稱 Windows 內部根因。保留 V18 與候選原檔，下一步評估只把正式 runner 改為 Node，靜音／Job 守門不變；不自動重跑全套。見 `qa/full-regression-disposition-v18.json`、`job-chain-v1-attempt2/`、`job-chain-v2/`。E／F 與人工驗收仍待完成。

2026-10-13 UTC17:20 V18 已啟動，正式 npm 於 UTC17:21:09 開始：Job 零音訊整合的實際結果已獨立核准；新版 102 案離線檢核、2,263 案列舉與 strict types 通過，兩份來源審查及精確契約啟動審查均通過。2,881 輸入／2,411 runtime／46 runner／6 執行檔凍結，完整原測試數與 workers1／retries0／maxFailures0、五小時界限不變。專屬 Job 在 root Resume 前完成綁定，外部程序零寫入，未知／矛盾仍停止。tool session26099 執行中，完整結果、fresh build/types、實際結果審查及本機提交尚待完成；E／F 與人工整合驗收維持未完成，不 push／deploy。見 `qa/final-full-run-contract-v18.json`、`full-run-preflight-review-v18.json`、`project-regression-v18/`。

2026-10-13 UTC16:50 Windows Job零音訊整合完成：單次8案全通過，0 skip／retry／flaky，外層44.835860秒、child／quiet／supervisor native0。14個session皆previouslyMuted=true、已驗證靜音及精確Job／root FILETIME，12次warmup與兩個WebKit生命週期gate完成，無guard error；guard在成功child退出後沿既有清理收到SIGTERM，不宣稱guard native0。Job在清理前後active processes皆0；2791輸入、2411runtime與6執行檔未變，啟動前後契約／review SHA精確相同。只跑全零PCM探針，未播放遊戲音訊，不代表全套或人工驗收；原始結果見`qa/quiet-job-v1/integration-disposition.json`，正做獨立實際證據檢核並準備V18完整驗收接線。

2026-10-14 靜音歸屬候選：已撤除需使用者協調全機排他的多餘條件。新候選以Windows Job在暫停狀態綁定quiet runner，精確FILETIME字串與保留handle交叉查證，僅對Job內且exe允許的session靜音；無法確認或證據矛盾仍中止。12個原生程序、9個跨語言membership、3個supervisor案例通過，包含父程序確實退出後的Job內外孤兒、owner crash、時間錯配、錯Job及Job close失敗；58項fake mute、21項JS proof、原32項mute／1,102項ancestry對照及9種離線runner情境通過。這些是工具證據；4variant×2的全零PCM 8案只完成列舉，尚未執行。候選契約2791輸入／2411runtime、180秒上限，具體安全檢核中；沒有重跑完整回歸，不表示遊戲已完成。見`qa/quiet-job-v1/integration-contract.json`及`tmp/rts/quiet-job-v1-plan.md`。

2026-10-13 UTC15:50 V17已保護性中止：單元182檔／1,850項通過；瀏覽器160案通過，第161案尚無結果，完整2,263案未完成。音訊守門擷取到活著的PID20260，但其父PID3620已無法查到建立時間，依原規則中止，quiet／launcher均native1。事後唯讀CIM指向雷電模擬器dnplayer.exe；兩份建立時間相差30 ticks，不將其當成精確相同身分或回溯可聽性證明。guard最後SIGTERM是失敗後清理，不是成功終局；2,756項輸入／2,411個runtime／6個執行檔未變。原始證據見`qa/full-regression-disposition-v17.json`，獨立原始證據檢核已批准保護性中止紀錄，見`qa/full-regression-result-review-v17.json`，不代表完整驗收。不直接重跑全套，先以無音訊程序驗證Windows Job範圍辨識；不能只按exe名稱略過來源不明程序。E／F、fresh build/types、本機提交及一次整體人工驗收仍未完成。

2026-10-13 UTC15:37 V17已啟動：具體契約批准，唯讀launcher檢查native0；正式命令前再次保存零測試瀏覽器／CLI／worker清冊，沒有全機持續排他承諾。唯一一輪完整test:all由既有靜音／歸屬／生命週期守門包住，五小時上限、0 retry，原1,850單元與2,263瀏覽器案例不變。launcher PID55096、quiet runner38388、guard24888，tool session60240；當下仍是靜音預檢，沒有完整結果。保持本輪輸入凍結，不再啟動其他browser工作。來源／契約缺口已修正，81項離線檢查通過，但不代表最終驗收；E／F與人工整體驗收仍待完成。

2026-10-13 UTC15:31更新：具體啟動審查發現繼承的契約誤寫maxFailures=1，實際原始完整測試一向為0。保留原命令與測試行為，修正契約並補上contract／resolved／report三方整數0核對；3個新回歸的4個負案例先Red後Green，合計81項離線檢查通過，來源複審批准。新契約凍結2,756項輸入，SHA為`5fb4224cd4037317fe93861383bda72d18bc5a3d1f3b324a75b4b884ba66edd5`。目前另一工作正在測試，V17尚未啟動；等其結束後以fresh空清冊完成最後啟動核對，無須使用者承諾全機持續排他。靜音歸屬不明仍立即中止本輪，測試最終失敗則不得驗收成功；不自動重跑。

2026-10-13 V17離線準備：新增輸出位置綁定，直接沿用V16主要驗證函式與既有guard／lifecycle。最新26個契約、34個finalizer、14個packager、4個recorder回歸通過，strict types與原2,263案列舉的來源雜湊仍有效；六個outputDir改名。審查指出的原始證據保存缺口已Red／Green修正，V16九份raw須與disposition／review映射一致並直接加入新契約；修正排程表述後的SOURCE_APPROVE_OFFLINE_ONLY已取得。原2,669個輸入、2,411個runtime與6個執行檔未變，預覽九個HTTP路徑回應200。UTC15:20最新程序清冊為零測試瀏覽器／Playwright worker，正準備凍結契約與具體啟動檢核。證據見 `qa/final-tools-v17-preparation/summary.json`及`source-review.json`；全套驗收、fresh build／types、本機提交與一次整體人工驗收仍待完成。

2026-10-13並行干擾追查：另一個CS工作於UTC14:17:40啟動跨瀏覽器測試，其原始輸出的WebKit worker PID18488出現在V16的未知音訊祖先鏈；該75案執行時段涵蓋中止時間。PID61068本身的建立時間仍缺失，不宣稱唯一根因、可聽音訊或產品修復。後續獨立檢核撤換「需使用者承諾整段全機排他」的多餘排程條件：啟動前保存無其他測試瀏覽器的fresh清冊，本thread只執行一次有界完整驗收，保留全部靜音與unknown-fatal防護。其他會話稍後啟動仍可能使本輪保護性中止；不控制其他程序、不放寬guard、不自動重跑。證據見 `qa/v16-concurrent-test-correlation.json`、`v17-nonexclusive-direction-review.json`；舊方向保留為歷史。

2026-10-13 V16終局：臺北時間22:20由靜音防護中止，launcher／quiet wrapper皆native1、未逾時，tool session 74388已關閉。單元182檔／1,850項全部通過；E2E完成106案且全數通過，第107案只有開始紀錄，沒有完整report、ledger end或inner exit。guard遇到PID61068的Inactive音訊工作階段，因程序起始時間缺失而無法確認歸屬，依unknown-fatal規則停止；既有祖先鏈未包含quiet runner PID14680，但實際建立來源及缺失原因仍未知。8次seed與1次formal暖機已確認、兩個WebKit生命週期門檻通過，不代表長程問題已修。獨立檢核確認保護性中止；事後重新雜湊2,669個輸入、2,411個runtime檔案及6個絕對執行檔均未變。證據見 `qa/full-regression-disposition-v16.json`、`full-regression-result-review-v16.json`。先唯讀追查來源，不直接重跑、不降低靜音或歸屬門檻；E／F與最後一次整體人工驗收保持未完成。

2026-10-13 V16工具準備：已完成生命週期原始紀錄檢查與完整驗收接線；26項契約、34項收尾、14項交付整理測試通過，strict types為0。清單比對仍為原2,263案，只有六個project的outputDir改變。獨立審查的三項缺口已經Red／Green修正：綁定絕對Node與PATH解析、核對瀏覽器啟動當下的執行檔SHA，以及每次非終局快照都須相隔至少250ms；source複審批准。交付明列本次綁定的原始靜音紀錄與工具來源，其他大型診斷raw保留本機索引；原2,594項V15輸入及2,411個runtime檔案未變。預覽服務PID／啟動時間一致，九個HTTP路徑回應200；沒有開啟遊戲或播放音訊。V16契約已凍結2,669项輸入，完整測試尚未啟動，待具體啟動檢核。證據見 `qa/final-tools-v16-preparation/summary.json`、`source-review.json`、`preview-check.json`及`qa/final-full-run-contract-v16.json`；E／F與整體人工驗收仍未完成。

2026-10-13 目前收尾：[本工作樹遊戲預覽](http://127.0.0.1:4321/games/rts/)（本輪未重新檢查預覽）。WebKit預檢已加入關閉後的唯讀生命週期查詢；16項原生、33項JavaScript及7種離線整合情境通過。臺北時間21:25完成唯一一輪零音訊整合，44.605218秒、8案全通過，12次預熱確認、14個原生音訊工作階段均已靜音且驗證成功。兩個WebKit各經兩次完整absence查詢，628ms／541ms後放行，順序經獨立檢核。seed／測試child／quiet wrapper／outer皆native0；原生guard沿既有流程於測試結束後主動SIGTERM並讀完輸出，不能寫成guard native0。原2,594項V15輸入與2,411個runtime檔案保持不變。證據見 `qa/quiet-lifecycle-v1/disposition.json`、`result-review.json`。下一步準備保留原2,263案與靜音條件的V16全套驗收工具，檢查兩個生命週期ticket、精確preload及終局順序後，再做具體啟動檢核。本輪不代表V15根因或持續靜音修復，也不代表整體驗收。E／F與最後一次整體人工視覺／操作／聽感驗收仍未完成。下列按日期保留的埠、效能與提交狀態是歷史紀錄，最新依本段及manifest `completion_audit` 為準。

臺北時間20:51的先行診斷只啟動兩個WebKit，15.053135秒完成，兩個原生音訊工作階段原已靜音、SetMute寫入為0，第一個關閉後2,935ms才放行第二個，guard／runner／outer均native0。原V15失敗未重現；COM／process參照及等待結束會改變時序，不能宣稱根因或修復。證據見 `qa/quiet-persistence-v1/disposition.json`、`result-review.json`。

V15已完成啟動工具10項、收尾31項、封裝11項檢查及具體獨立檢核；保留原2,263案，凍結2,594項輸入，其中全部src／tests／public共2,411檔。單次啟動於臺北時間19:38被靜音保護拒絕：第二個WebKit零音訊預檢程序的既有靜音狀態為false，雖已設為靜音並驗證成功，仍未通過靜音持續性門檻。正式npm與遊戲測試完全未啟動，靜音工具與外層啟動工具均native1，所有輸入不變，不能算完整驗收。證據見 `qa/full-regression-disposition-v15.json`。

V13保留為完整失敗證據：單元182檔／1,850項通過；E2E為2,141通過／121既有略過／1失敗，native1，唯一失敗為mobile-safari Passer 1440px回捲。後續Passer v2保留352個原前序與同worker生命週期，353案為324通過／29略過、native0、980輸入不變，已依baseline通過分支停止診斷，沒有產品修復或唯一根因宣稱。靜音工具的21項核心、32項原生、8項瀏覽器及4項故障檢查通過，獨立複核批准V14啟動。完整測試與外層靜音保護都須native0，才可進fresh build／types、證據檢核與本機commit；不push／deploy。證據見 `qa/passer-timeline-v2/review.json`、`qa/quiet-full-v3/review.json`、`qa/full-run-preflight-review-v14.json`（皆位於 `art-factory/rts/runs/commercial-readiness/2026-10-12/`）。

V14中止證據見同目錄 `qa/full-regression-disposition-v14.json`。第87案沒有記錄到遊戲斷言失敗；事後唯讀查詢已無該音訊工作階段，無法據此還原當時所屬程序。`sessionState=0`代表Inactive，並非Active或Expired；程序退出競態仍是假設，尚未證實根因。

診斷副本補上同一次程序擷取中的缺失位置與例外，沒有放寬歸屬判定。1,102項診斷檢查（含1,024組原判定對照）、原32項保護檢查、型別與四案collection通過。獨立檢核後僅執行一輪全零音訊：四種瀏覽器4案通過，headless同一browser保留兩個頁面並重建第三個12次，外層native0、無guard error、922原輸入未變。該browser只觀察到一個正式音訊PID，沒有證明原生音訊程序更替，不能據此判定V14根因或修復。證據見 `qa/quiet-ownership-v2/disposition.json`。

有限前序重現保留原單元階段、npm程序祖先鏈、87案順序／期限／設定，再接其餘三種瀏覽器的零音訊探針。13項啟動工具檢查通過，包含實際子程序逾時清除；修正輸入清單漏收Markdown／YAML的問題，凍結901個source與25個本地音訊／影片，合計1,024項並完整保留V14的922項。正式90案全部通過，前87案均workerIndex0／parallelIndex0／retry0，唯一headless正式worker PID41224；第87案47.936秒通過。四種瀏覽器均完成靜音確認，無guard error，所有輸入不變。新增媒體清單不能回溯證明V14未記錄的內容，成功也不等於根因已排除。證據見 `qa/quiet-ownership-prefix-v1/disposition.json`。

2026-10-08 後續細修：兵營、馬廄、工坊改為土質庭院，石緣／角石／台階跨三棟共用；修正屋坡 winding、補貼圖山牆與工坊四柱接合。衛兵保留劍盾、三角面及動作，材質批次 30→11；相容 LOD 共用單位自己的骨架與 mixer，迷霧逐列填入並保持同一資訊邊界。五 GLB 與一張原創土面轉檔已本機接入。正式打包 1080p／80 單位＋20 建築＋肖像 60 秒 median 59.88 FPS／p95 25 ms，首圖 gzip 資產 32.48 MB；13 Chromium E2E 通過，完整證據見 `docs/games/rts-handoff-2026-10-08-refinement.md`。人物造型沒有全面重做，馬廄草堆及整體美術仍需精進。[遊戲](http://127.0.0.1:4324/games/rts/)／[前後比較](http://127.0.0.1:4334/assembly-refinement/)。未 commit、push 或對外部署。

2026-10-08 模組零件製作：新增 87 個原創零件／尺寸變體、13 份 prefab 與真正 linked Blender 組裝來源，7 件跨建築共用，石橋內部重用橋面／欄牆。共用窗修改同步傳播兩級主城；9 Python、1,429 Vitest、13 Chromium E2E、strict TS、build、雙圖組裝與 30.38 MB 下載檢查通過。**效能未過：正式靜態建置 35.71 FPS／p95 35.5 ms，原因未明。13 個 runtime 模型與 registry 已恢復前版，模組候選保留審查，不宣稱完整發布完成。**角色／骨架尚未模組化；[拆解預覽](http://127.0.0.1:4334/modular-kingdom/)／[遊戲](http://127.0.0.1:4324/games/rts/)，證據見 `docs/games/rts-handoff-2026-10-08-modular.md`。未 commit、push 或部署。

2026-10-07 模型與地圖細修：12 種建築版本補上門窗凹槽、窗扇、鐵件與原創 PBR 材質；石橋／岩面／地表細修，衛兵與弩兵雙 LOD 僅更新裝備材質。18 GLB／26 共用貼圖本機接入，四人物幾何／骨架／動畫資料保持相同。1,429 Vitest、13 Chromium E2E、最終 strict TS、build、雙地圖組裝通過；共享貼圖缺失可回大廳重試。首局 gzip 資產 30.36 MB；1080p／80 單位＋20 建築＋動態肖像 median 60.6 FPS、p95 24.9 ms，較前輪 80 FPS 有效能成本。獨立唯讀檢核無現有產物阻擋；人物全身、弩身輪廓、淺色基座與局部 UV 拉伸仍待改善。[試玩](http://127.0.0.1:4324/games/rts/)／[模型比較](http://127.0.0.1:4334/model-detail/)／[地圖比較](http://127.0.0.1:4334/model-detail/maps.html)；證據與限制見 `docs/games/rts-handoff-2026-10-07-detail.md`。未 commit、push 或對外部署。

2026-10-07 地圖區域景觀：谷地花地／蕨叢／蘆葦、隘口灰礫／松林草叢，新增原創石拱、破塔、立石與棄車。兩張生成 atlas 本機接入，兩圖各四處遺跡具有完整 blocked/noBuild，植被遵守霧及建築遮罩。淘汰交叉 X 草卡與可建造塔外觀，獨立複審有限範圍 PASS。138 files／1,423 Vitest、strict TS、12 Chromium E2E、兩圖正式組裝與採木耗盡、build 通過；1080p／80 單位＋20 建築＋動態肖像，RTX 5090 Laptop 60 秒 median 80 FPS、p95 20.8ms。首圖資產 gzip 31.91MB 低於35MB。地標採固定視角插畫、遠景辨識與人物品質仍待改善。[前後對照](http://127.0.0.1:4334/landscape-districts/)；[遊戲](http://127.0.0.1:4324/games/rts/)；證據見 `docs/games/rts-handoff-2026-10-07-landscape.md`。

2026-10-07 玩法優先：依使用者指示暫停人物／模型／動畫修整，優先操作手感與完整對局。主城右鍵礦木可讓新工人自動採集入庫；修正等距返城入口造成的打轉；小地圖可設建築集結點及 A＋左／右鍵攻擊移動，成功退出模式、失敗保留；牧師遵守明確移動／攻擊，攻城車自動索敵涵蓋射程。136 files／1,411 Vitest、RTS strict TS、build、12 項 Chromium E2E及新增命令邊界複測 2/2 通過。自然玩家對局河谷 08:55、隘口 09:39 獲勝，未注入資源／生命／結果；隘口首次失敗是測試腳本漏切焦點導致編隊覆寫，修正後通過。獨立唯讀審查無阻擋項。人物品質仍未通過、窄路群兵避讓仍待改善。[遊戲](http://127.0.0.1:4324/games/rts/)；精確證據與限制見 `docs/games/rts-handoff-2026-10-07-gameplay.md`。

2026-10-07 弩兵指腹第三版：從實際手套表面和縮放後箭桿重做雙指夾持，改抓裸箭桿，解析修正取箭握姿。97 個持箭姿勢的手箭相交由 162 對降為 0，雙指距離／法線及非覆袖區手自交通過；完整手套仍有袖口自交，完整動作還有腕彎、骨端插值、手臂扭跳與入槽相交，保持 `qa_failed`、未替換 runtime。10 項 Python 回歸、幾何／非 Attack 保留、雙 GLB 格式、79 張瀏覽器姿勢及 20 組播放暫停通過。[第三版預覽](http://127.0.0.1:4334/crossbow-pinch-v3/)；精確證據及較 v2 惡化的指標見 `docs/games/rts-handoff-2026-10-07-pinch-surface.md`。

2026-10-07 弩兵全身第二版：新增原創上弦槓桿、腰側矢匣、雙指取箭、72 幀全身 Attack 與共用接觸骨架；保留原人體／手套幾何及四個非 Attack 動作。實際腕角 76.55°、腳底與剛體握持通過，但手箭／上軌交叉、骨端插值、袖口與上臂扭折仍失敗，維持 `qa_failed`、未替換 runtime。10 項 Python 測試、134 files／1383 Vitest、兩 GLB 格式、79 張瀏覽器姿勢與 20 組播放暫停通過，均不代表美術合格。[第二版可操作預覽](http://127.0.0.1:4334/crossbow-fullbody-v2/)；固定 hash、失敗幀與接續要求見 `docs/games/rts-handoff-2026-10-07-fullbody-crossbow.md`。

2026-10-07 弩兵整體候選：原創皮革手套、覆袖接合、可動弩弦與箭矢已組裝；保留人體 7,133／3,004 頂點、UV 與四種非 Attack 動作，LOD1 降至 9,477 三角面。完整射擊試作可讀出瞄準／放弦／拉弦／取箭／搭箭，但新裝填有手腕過折、手弩交叉，且缺上弦施力與矢匣，維持 `qa_failed`，未替換 runtime。5 項機構／連續性測試、1,383 全套測試、72 張瀏覽器姿勢、20 組播放暫停、兩圖真實動態肖像與滑鼠移動通過；這些不代表美術合格。[完整人物預覽](http://127.0.0.1:4334/crossbow-complete/)；證據與接續要求見 `docs/games/rts-handoff-2026-10-07-complete-crossbow.md`。

2026-10-07 河谷正式整合：彎河、岸坡、接地石橋、新礦位與縮圖已接入本機遊戲，純 layout 與 Three.js 分離。實際滑鼠完成雙礦採完／回城入帳、四兵種過雙橋及重開資源釋放；補修新版地形揭露的 AI 固定進攻集合點受阻。最終 134 files／1383 tests、strict TS、production build 通過；1080p 80兵／20建築／動態肖像，中位 59.88 FPS、p95 16.8ms。整體人物及美術品質仍未完成。[遊戲](http://127.0.0.1:4324/games/rts/)／[比較頁](http://127.0.0.1:4334/riverbank/)；證據與限制見 `docs/games/rts-handoff-2026-10-07-river-runtime.md`。

2026-10-07 袖口動態修整進展：弧長對應與每 LOD 三圈原創袖口骨已加入；原 36 骨與 1,800 條動作曲線保留。兩 LOD 各 1,589 姿勢的最大拉伸改善，但最小面積比仍為 0.0692／0.0989，未過關；15 mm 補償版已拒用。11 項 Python 測試、GLB 0 error／warning、66 姿勢重載、Chromium 控制通過。獨立看圖判局部改善，腕口厚度、灰模手套與整體商用品質仍未完成。[袖口候選預覽](http://127.0.0.1:4334/crossbow-cuff/)；交接見 `docs/games/rts-handoff-2026-10-07-cuff-motion.md`。未改 runtime。

2026-10-07 完整弩兵整合進展：原創可動左手已接回36骨角色，校正握把周向與手腕反折，五種動作可操作檢查。兩LOD共3178姿勢手自交／手弩／身弩為0，GLB重載66姿勢與Chromium控制通過。腕口cap內藏通過，但接片面積比0.0094–9.2478仍失敗；裝填、材質、LOD1預算與商用品質未完成，未更新runtime。[完整弩兵候選](http://127.0.0.1:4334/crossbow-articulated/)；交接見 `docs/games/rts-handoff-2026-10-07-articulated-crossbow.md`。

2026-10-07 最新局部角色進展：原創手部修正 130 個 Thumb 權重，撤回會使指縫折疊的 10 個額外跨指修改。新增五指同步 `NaturalCurl`；Blender 與實際 GLB 各 385 個連續姿勢及各 660 個局部姿勢均未測出非共面穿插，11 項數學／權重測試、strict TS、12 組 Chromium 視角與互動通過。原靜止形狀、拓樸、骨頭端點不變；GLB 最大頂點誤差 1.0411 µm。獨立檢核仍保留指節外觀、拇指對握等缺陷，未更新 runtime，完整人物與商用品質未完成。[五指動作預覽](http://127.0.0.1:4334/glove-natural/)；交接見 `docs/games/rts-handoff-2026-10-07-natural-hand.md`。

2026-10-07 最新局部角色進展：原創左手已與完整原創弩建立 SupportGrip 動作。Blender 與實際 GLB 各 385 姿勢的手自交／武器穿透均為零；8 個數學與回歸測試、15 組 Chromium 視角／姿勢及互動流程通過。原靜止幾何、全部權重與骨頭端點不變。獨立檢核仍保留「PIP 勾握、拇指對握不足」的美術缺陷，完整角色及商用品質未過關，未更新 runtime。[局部預覽](http://127.0.0.1:4334/glove-weapon-fit/)；固定來源、證據與下一步見 `docs/games/rts-handoff-2026-10-07-grip.md`。

2026-10-06 後續材質修整：弩兵舊版整面染色造成衣料三角碎片，已改成沿原創貼圖的texel遮罩。GLB幾何/動畫BIN bytes完全不變；藍紅雙隊18個前後視角與60個動作姿勢通過。完整模型仍有幾何破口，未更新runtime。最新交接`docs/games/rts-handoff-2026-10-06-surface.md`；[材質修整預覽](http://127.0.0.1:4334/crossbow-surface/)。

2026-10-06 最新局部里程碑：原創弩兵三處前臂接合段重拓撲，完整cap包含、802姿勢變形與802姿勢武器接觸通過；實際GLB/瀏覽器驗證完成。完整接面仍有14條原始boundary、肩背破面與手套材質未過關，故維持qa_failed、未更新runtime。候選來源與限制見`docs/games/rts-handoff-2026-10-06-wrist.md`；[可操作預覽](http://127.0.0.1:4334/crossbow-wrist/)。

2026-10-05 使用者複審：人物建模／動作未達可用水準，地圖過於單調。先前人物美術可用性判定撤回；下方測試與 FPS 僅代表功能／技術驗證，不代表美術品質核准。詳見 `art-factory/rts/runs/landscape-enrichment/2026-10-05/character-quality-review.md`。地圖增豐已放入本機預覽；使用者選擇人物模型與動作全部原創，先做衛兵完整重製樣本，不採第三方人物或動作包。

最新地圖里程碑：新增四種原創生成地表、林地、貼岸石群及可辨識的隘口岩帶，兩圖組裝與選單縮圖經獨立唯讀檢核通過。1,343/1,343 Vitest、RTS strict TS、production build 及三瀏覽器相關 12/12 案例通過。1080p／80 單位／20 建築／騎士肖像：59.88 FPS 中位數、p95 29.2ms；本機 gzip 首圖素材 29,352,644 bytes。最終自然玩家腳本以實際 UI 操作採集、建造、訓練及英雄技能，river 08:59、pass 北側迂迴 09:29 獲勝，未注入資源／HP／命令／結果；早期失敗路線與中央突擊戰敗證據保留。完整來源、拒絕證據與限制見該 run 的 README。原創人物 shape 與 motion 候選仍未發佈。

Plan: `docs/superpowers/plans/2026-10-04-browser-rts.md`

- 地圖最後補驗：新版地形下，AI 自然採集／建軍並摧毀閒置玩家的所有建築，river 08:24、pass 06:23，兩圖 page errors 皆空。證據在 `runs/landscape-enrichment/2026-10-05/qa/ai-campaign.log`。
- 全原創動作候選：V2 待機／行走／受擊／倒地及 V3 攻擊接觸通過獨立檢核；Attack 接觸為第 16 幀／0.533333 秒。來源、原始骨架、曲線、候選 GLB／Blender 與拒絕證據已整合，未更換 runtime 人物。V3 複審透過關鍵幀、接觸 sheet 與空間速度檢查，沒有獨立播放 MP4；原型 mesh 的建模品質仍未過關。

先前肖像里程碑（2026-10-05，後續人物美術判定已撤回）：八兵種、全部建築與兩地圖已可遊玩，新增八種 3D 動態肖像。當時 1330/1330 Vitest、strict TS、建置及三瀏覽器肖像 6/6 通過；39 個相關桌面案例分批驗證完成（非單輪全綠，詳見下方）。開啟騎士肖像的 1080p、80 單位／20 建築60秒量測為59.88FPS，首圖壓縮素材28.52MB。歷史證據在 `art-factory/rts/runs/selection-portraits/2026-10-05/verification.json`；原戰役證據保留於 `runs/final-assembly/2026-10-05/`。全站E2E先前另有5項失敗；使用者整體美術驗收尚未發生。

- 2026-10-04 使用者指示「直接開始」；原設計已獲執行授權，後續不再要求啟動確認。
- 2026-10-05 肖像擴充：使用者確認「會動的 3D 大頭貼」。共用戰場renderer，以獨立Idle模型呈現八種頭肩／騎乘者／機械特寫；暫停、減少動態效果、選取清除、迷霧、死亡與restart均有驗證。保留原始生成GLB與九宮格框架，9/9素材來源hash核對。
- 肖像TDD：4項controller先紅後綠，另補reduced-motion；瀏覽器發現dock超界25.59375px，固定grid row後通過。完整回歸38/39時發現pause後HUD跨秒延遲；2項確定性button/hidden測試先紅後綠，同步flush最終TeamView修正，唯讀consultant APPROVE。
- 暫停修正後12項非肖像pause/restart/result案例全通過；同批一項Chromium exact像素比對偶發不同。新增每個run的RGBA、world/bone矩陣、viewport/scissor/camera診斷，未放寬exact斷言；三次raw診斷及最終三瀏覽器6/6均通過，最終各paused pair所有RGBA byte相同。原失敗raw被後續run覆寫，不能宣稱已查明渲染根因；保留log與後續完整證據。
- 最終1330/1330 tests（130 files、35.91秒，4 workers）、strict TS exit0、build 18.34秒；80/20+knight portrait median59.8802FPS／p95 25ms／max91.6ms，零執行錯誤。正式build實際選工人可見動畫，42素材requests／28,517,198壓縮B，總本機傳輸28,750,624B。preview：http://localhost:4321/games/rts。
- Ruling: 主代理連續執行並整合；地圖／導航可獨立 worktree 平行處理。主工作樹其他遊戲完全不動。
- Ruling: Windows 追蹤的 53-byte node_modules link 已備份於 tmp/rts/node_modules-original-link；本機用既有安裝 junction 執行 baseline。此環境差異不加入產品 commit；正式 clean install/build 仍須另驗。
- Pre-flight: Task 1 產生 Vec2/RtsMap/Footprint 與導航；Task 2–3 消費純資料；Task 5 只經命令修改模擬。資產 id 與 catalog kind 一致。
- Baseline: 106 個 Vitest 檔案、1202 項測試通過（32.31 秒）；證據 tmp/rts/baseline-vitest.log。
- Task 1: 已整合 5bb83015；兩張地圖與中心座標 footprint 的 A*／可達性，12 項測試通過。
- Task 2–3: 純模擬初版已實作；採集、施工、隊列、科技、戰鬥、英雄、迷霧與 AI 共用命令。2026-10-04 21:37 的 RTS 45 項測試、strict TypeScript 檢查通過。
- Review: consultant 早期核心檢核提出 6 項實質問題，已補回歸修正：無路停止回報、合法目標失去後回巢、隱藏資源命令拒絕、AI 修理、枯竭轉採、跨隊營地最後擊殺歸屬。另補 overkill 不搶擊殺與偵察前不得全軍猜位置。尚待複審。
- Natural simulation 初次實證（修正前快照，須重跑）：AI 在 river 714.65 秒、pass 717.8 秒自然消滅未操作玩家基地；兩圖均採集支付成本升 III 階，無資源／血量／結果注入。原始明細 tmp/rts/sim-audit.log。
- Task 4: 概念圖已生成；guard 首版 GLB/.blend 已在隔離 art worktree 產出，但視覺 QA 未達品質，修訂中。建築包另在隔離 worktree 製作。沒有候選被冒充正式 runtime 資產。
- Task 5: 已實作 Three.js 場景、選取／框選／群組、情境右鍵、HUD、科技命令、迷霧與選圖大廳；正式角色素材尚未齊備，正常開始仍會拒絕缺失 registry，不以替身模型冒充正式美術。
- 2026-10-04 22:27 核心修正驗證：11 個 Vitest 檔案、57 項通過（46.34 秒）。修復合法出生點接網格失敗、攻擊移動索敵邊界振盪、模型部分載入失敗的延遲清理；均有先紅後綠證據。兩圖 AI 自然獲勝：river 453.05 秒、pass 473.65 秒；三級科技另於雙 AI 真實採集對抗局 582 秒完成付費升級，避免要求 AI 拖延可贏的早期戰鬥。
- Browser: 3 個大廳／小螢幕／載入失敗重試 E2E 通過（9.0 秒）。另有 1 個明確標為 candidate-art fixture 的 WebGL 操作測試通過（20.5 秒）：選主城、付費訓練、暫停不計時、完成訓練、投降與返回選圖。此測試使用未發布候選 GLB，僅證明操作整合，不代表正式美術或完整遊戲驗收。截圖 tmp/rts/lobby.png、tmp/rts/battle-candidate-integration.png。
- Art: 建築 v2 13 個候選已整合 factory，具生成石材／屋瓦材質與 Blender roundtrip QA。guard v1/v2 保留品質檢核證據；正在獨立環境試作 TripoSR 單角色，尚未取得合格正式兵種包。大廳原畫、九宮面板與地表紋理有生成原檔、確定性後處理與 hash／機械 QA。
- Task 6: 完整 UI E2E、自然玩家通關、效能、正式資產 QA、完整 regression/build 與終審仍待完成；目前不能宣稱可玩交付。
- 2026-10-04 22:38：全專案 Vitest 117 files / 1261 tests 通過（48.71 秒）；Astro production build 成功（33.06 秒）。建置使用本工作樹獨立 npm ci 安裝，僅新增 @types/three，未修改父工作樹 dependencies。PowerShell 將測試預期 stderr 警告包為 NativeCommandError，Vitest 摘要無失敗或 unhandled error；證據 tmp/rts/full-vitest.log、tmp/rts/build.log。
- 第二輪核心 review 兩個 P2 已紅→綠修正：暫時交戰遇不可達目標會保留原行軍目的地並抑制同 revision／同位置重試；建築放置保留最大單位半徑 .78 的基地連通。consultant 以唯讀記憶體案例重驗並 APPROVE。相關 commit 9911112d。
- 2026-10-04 UI review 四項已修正並由原 consultant 唯讀複審 APPROVE：命令與介面均拒絕迷霧建造；混合選取固定我方部隊優先；已觀察枯竭資源離開視野後仍隱藏；英雄三招具合法性、射程與扇形／目標預覽。非阻擋 P3：非法施放訊息固定保留四秒，游標轉合法時可能短暫與綠色預覽並存。
- RTS 六項 Chromium E2E 全過（1.2 分鐘，tmp/rts/rts-e2e-final.log）：大廳、窄螢幕、錯誤重試、訓練／暫停／投降、pass 採集建造、focused hero 三技能與重開。單位模型仍使用明確標記的測試 fixture；英雄 fixture 注入只用於技能邊界，不作自然通關證據。
- 全站 Playwright 嘗試在 5 個失敗後停止：80 passed、5 failed、3 interrupted、2067 not run（tmp/rts/full-e2e.log）。唯讀比對 base 56fb730e：兩項首頁 Skills tab 失敗、Bomber 的 Vite 504、任務頁缺導覽及標題空格斷言，相關舊原碼及測試均未改。未在 base 動態重跑，僅能說沒有 RTS runtime 改動證據，不能宣稱全站 E2E 通過。
- 23:07 全站 Vitest 初跑 1271 passed / 1 failed：舊 tetris/ffaLayout import smoke 超過 5 秒。單檔重跑 12/12 通過（1.92 秒）；保持斷言與 timeout 不變，限制 maxWorkers=4 後全站 120 files / 1272 tests 通過（41.50 秒，tmp/rts/full-vitest-bounded.log）。
- Props：oak v2 與其餘三件原創 Blender／生成貼圖道具通過 root contact sheet 與真瀏覽器組裝檢核，已發布 4 GLB。樹木 runtime 比例縮為 .48–.645，保留原 10.86m source；擴大有迷霧覆蓋的地表以消除畫面外硬切色塊。新增樹木採集 anchor、穿透樹冠選兵，picking 回歸先紅後綠 3/3。延伸採集建造 E2E 1/1 通過（54.3 秒），包含真實右鍵點樹與搬運木材入庫；證據 tmp/rts/tree-harvesting-e2e.log。
- Runtime art audit：20 個已發布檔、14,310,085 bytes，路徑／來源／SHA-256 通過；仍缺全部 8 兵種，complete_game_art_pack=false。這是本地 runtime 目錄，沒有部署或對外發布。
- Guard neural pilot v1：本機 RTX 5090 TripoSR 成功產出 watertight mesh，但 95% flat faces 與頂點色插值烘焙未達視覺品質，已記 qa_failed 並封存 ea2a7b87。只對原輸入進行一次色彩空間、平滑法線與真正 texel 神經取樣的 v2 修正；沒有把失敗候選放入 runtime。機械攻城車在獨立 worktree 製作，尚未完成正式單位包。
- UI／環境 checkpoint：23:15 全套 121 files / 1275 tests 通過（51.66 秒）；全部 6 RTS Chromium E2E 通過（1.6 分鐘，包含樹木採集），production build 成功（22.37 秒）。證據 tmp/rts/{full-vitest-reviewed-ui,rts-e2e-reviewed-ui,build-reviewed-ui}.log。
- 殘局 P1：AI 原本只重查原出生點，會漏掉未見分基地。新增 12m frontier 探索與 scout／navigation revision 拒絕快取；先紅4/5再全綠。複審又查出命令可藉未見建築造成的 path failure 推知敵情，已用共通 planningObstacles 修正 move、rally、approach 與實際移動。新測試比較相同 own-view、不同 hidden obstacle 的目的地及完整路徑，並涵蓋霧中記憶、顯影後重新規劃、不穿牆、兩圖找到並摧毀最後民居；consultant 最後 APPROVE。
- 23:27 最新完整 Vitest：123 files / 1283 tests passed（41.39 秒）；strict TypeScript 與 diff check 通過。證據 tmp/rts/full-vitest-known-navigation.log。兩圖最後民居案例是明確的殘局 fixture，不替代自然玩家開局通關。瀏覽器完整 AI 對局正在驗證，僅加速時鐘回呼、不注入資源、生命、命令或勝負。
- Guard v2 已封存 01640eda，真正逐 texel 神經色與 smooth 修正改善白化，但視覺仍未過。最後一次貼圖試點改用原創 front/back 高解析投影，側面保留 neural 色；保留各版失敗證據，不再循環同方法抽樣。

- 2026-10-05 00:00：真實瀏覽器自然戰役驗證完成。AI 摧毀玩家建築：river 08:33、pass 06:23；玩家從開局工人採集、建兵營/民居/祭壇，招募統領及衛兵，再進攻全滅敵方建築：river 13:17、pass 07:34。全部僅走滑鼠/快捷鍵 UI，未注入資源、HP、命令或勝負；Playwright 250ms 快轉每次仍消耗完整固定模擬 tick。兩支腳本 exit 0、pageerror 為空，截圖見 `tmp/rts/natural-ui-{ai,player}-win-{river,pass}.png`。仍使用明確隔離的候選美術 fixture，不能據此宣稱正式素材已完成。重現腳本保留在 `tests/manual/rts-{ai,player}-campaign.ts`，用 `node node_modules/tsx/dist/cli.mjs <script> --candidate-art`。
- 新增雙級模型載入與 48px 螢幕高度 LOD 切換；兩個骨架 mixer 同步，切換維持動畫相位。TDD：先見 2 個新測試失敗，再 5/5 通過及 strict TypeScript 通過。正式 LOD 素材的瀏覽器組裝驗證仍待完成。
- Khronos 官方 glTF Validator 2.0.0-dev.3.10 檢查 17 個正式環境 GLB：0 errors、40 warnings，全部是未預存 tangent 由渲染器計算的 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`。完整證據 `art-factory/rts/manifests/khronos-environment-qa.json`；這不是零警告報告，實際瀏覽器環境素材已目視檢查。
- Root 已逐組檢視 worker/crossbow/priest/commander/neutral-raider 十張原創正背參考圖並接受作建模輸入。角色差異、共用王國材質與安全 framing 符合方向；牧師後裙遮腿、工人圍裙開衩及掠兵皮帶差异記入 contract。各自獨立的神經網格與雙面投影開始產出，工人 front/side/back 已目視可接受進入綁骨；尚非可發佈單位。
- 00:21：LOD／點選複審修正 Three.js raycaster 仍命中隱藏 LOD 的問題（完整祖先 visible 鏈檢查，先紅後綠，consultant APPROVE）。工人 work／牧師 cast 映射五 clip contract 的 Attack，保留動畫相位。全套 123 files / 1289 tests passed（38.76 秒，tmp/rts/full-vitest-lod-action.log）；RTS 六項 E2E 通過（1.6 分鐘，tmp/rts/rts-e2e-lod-picking.log），strict TS 含 DOM.Iterable 通過，production build 34.80 秒。E2E 仍使用候選美術。
- Guard production-v1 與 siege runtime-v1 通過 root 多角度／動作檢視及真實 Three.js 的五動畫、藍紅隊色、雙 LOD 檢查，已本地發布；合計 5,971,892 bytes。Guard Khronos 0 errors / 6 warnings（NODE_SKINNED_MESH_NON_ROOT），siege 0 errors / 38 warnings（runtime tangent generation）；實際位移／骨架已另驗。
- 00:47–00:50 效能診斷：1920×1080、80 單位、20 建築全部在畫面，候選模型 fixture。舊 headless-shell 為 SwiftShader 軟體繪圖 2.14 FPS；改 Chromium new-headless + --enable-gpu 後實際 Intel Graphics D3D11，median 17.15 FPS、p95 75ms，仍不達標。另開 CDP CPU profile（tmp/rts/performance.cpuprofile）與差分診斷：關陰影約 17.12 FPS，pixel ratio .5 約 30.03 FPS；不是最終品質設定或验收。場景約 980 draw calls、757k triangles、800 textures。正式驗收尚須完整兵種與暖機後 60 秒，不能以目前短程診斷取代。
- 00:52 原創 bolt／heavy-bolt（原創 siege 弩箭衍生）各 52 triangles，合計 315,916 bytes；Khronos 0 errors / 0 warnings。實際 ProjectileLayer WebGL 驗證 -Z 箭頭、行進方向、兩種高度及消失清理，root 已看圖；取代原黃色球狀投射物。本地 runtime audit 26 files / 20,597,893 bytes，所有來源及 SHA 通過，仍缺 worker/crossbow/priest/knight/commander/neutral-raider。相關 model/picking/projectile 16 tests passed，沒有將未合格騎士候選放入 runtime。
- 01:00：實測確認 SkeletonUtils 每個 primitive 複製同骨架，80 units 產生720份。ModelInstance 在單一 variant 內以 Bone identity/order 與 inverse matrices 完全一致共用 Skeleton，保留 mesh bind transforms，並 dispose 自有 bone textures；2項回歸先紅後綠，consultant APPROVE。實際720→80骨架、806→166 GPU textures；1080p暖機後60秒為 median34.36FPS / p95 49.9ms / max154.3ms，仍未達55FPS。關MSAA為34.25FPS，關霧差分亦無改善；兩者僅診斷，正式畫質未調低。
- 01:08：ModelLibrary 支援依地圖載入專用 rock／stone-bridge、共用資產快取及 terrain 納入真正載入進度；場景不會 dispose library 共用地表貼圖。map-loading測試先紅後綠，models/projectile/picking 19 tests與 strict TS通過；main caller 每次換圖呼叫新API待UI包整合。介面補漏另在獨立 worktree：科技樹、音量與音訊生命週期、30分鐘提示及最後五分鐘倒數、具體禁用原因。
- 01:10：全套 Vitest 124 files / 1296 tests passed（49.56 秒，tmp/rts/full-vitest-projectiles-loading.log）。两图实际 Battlefield 全探索实景缩图已浏览器截图、root逐张检查并转600×360 WebP，本地registry审计28 files /20,683,613 bytes，六兵种仍未发布；未以候选美术宣稱完整交付。
- 01:43：全套 Vitest 128 files / 1310 tests passed（36.40 秒，tmp/rts/full-vitest-terrain-mask.log）。UI 完整科技樹、音量、剩餘時間與重開 canvas 已整合；consultant 複審 APPROVE，另移除不合專案規定的 !important。新增道路幾何／通行缺口、依圖延遲水面與共用地表釋放測試，先紅後綠 20/20；兩圖實際 WebGL 地表 QA errors=[]，已本地發布生成道路／河水並更新實景縮圖。
- 01:46：正式八兵種齊備。Worker/crossbow/raider v1、knight v2 與 priest/commander per-texel mask v2 通過 root 多角度、動畫與實際 Three.js 藍紅雙LOD檢查；各對 GLB 的 Khronos 都是 0 errors，skinned-parent/tangent warnings 保留報告。Runtime audit：42 files / 38,501,769 bytes、missing_required_models=[]、complete_game_art_pack=true；所有路徑及 SHA 通過。此為本地資產發布，不是外站部署或使用者美術接受。
- Priest/commander v1 因整個三角面的布料判定造成藍灰碎斑，保留原始候選與錯誤證據，runtime 使用 v2 原始 RGB + 每像素 fabric mask。Source mask texture 由 library 共用／釋放；URI 與 GPU texture 都排除 Material.clone 的 JSON 深拷貝。後一項 consultant P2 已先紅後綠修正，16/16 tests、唯讀複審 APPROVE。01:50 獨立 strict TypeScript exit 0、diff check 通過。
- 正式性能首次測試未達標：RTX 5090 Laptop / D3D11 / Chromium 145 / 1920×1080，80 units + 20 buildings 全部畫面內，暖機後60秒 median48.08FPS、p95 25.1ms、max45.8ms、errors=[]，紀錄 tmp/rts/performance-formal-before-mask-memory.json。先前同機候選 fixture 的60.24FPS不是正式素材結果；後續仍需定位瓶頸並重驗55FPS目標。
- 遊戲廳已加入必要 RTS 卡片，重用經審核的大廳原畫；E2E 入口測試先紅後加入。RTS E2E 已移除 candidate art 路由，focused hero 仍只對技能邊界建立明示情境。正式素材自然戰役、三瀏覽器流程、production build／下載量與最終交付驗證進行中。
- 02:10 正式素材自然戰役兩支腳本 exit 0：玩家從真實開局採集、建造並全滅敵方建築，river 07:46、pass 12:14；閒置玩家對 AI，river 08:33、pass 06:23。未注入資源、HP、遊戲命令或勝負，errors=[]。證據 `tmp/rts/natural-formal-{player,ai}.log`，正式截圖已存 `art-factory/rts/runs/final-assembly/2026-10-05/`。手動腳本新增 `--dedicated-gpu` 使用 Chromium new-headless，避免 Windows headless-shell 落到軟體繪圖；模擬規則不變。
- Focused tech fixture 實際 UI 支付升 II/III 階、訓練七種我方單位、依序研究三階兵刃；Chromium、Firefox、WebKit 各 1/1 通過。此資源充足的專項情境不是自然通關證據。正式 Chromium/Firefox 原八項 RTS E2E 均通過；新增無 WebGL 重試、無 AudioContext 及同頁換圖正在最後重驗。
- WebKit Windows port 缺少 AudioContext：音效改為可選能力，建立失敗與 resume/close 拒絕不阻擋戰役；5項 unit tests 覆蓋正常與無音效環境。Root 實際開局／重開 screenshot `tmp/rts/webkit-probe-restarted.png` 已確認地表、模型、陰影與 HUD 渲染，不能等同實機 Safari 測試。
- 獨立檢核發現 UI 按鈕聚焦仍能下 S 命令及 held key 持續平移；先紅5項，再以互動元素祖先 guard 與 focusin 清鍵修正，input/audio/models 28/28 綠，consultant 對產品修正 APPROVE。02:23 最新全套 Vitest **128 files / 1318 tests passed（41.73秒）**，strict TypeScript exit 0。證據 `tmp/rts/full-vitest-final-input-audio.log`。
- Knight v3／guard production-v2 以同skin同材質合併降低 draw：18→13／9→6，tri、材質與動畫樣本保留；knight24幀像素完全相同、guard10幀最多6個8-bit channel各差1級，Khronos分別0 errors／14 warnings及0 errors／4 warnings。Root Three雙LOD／隊色／五動作及consultant來源SHA複核通過，已發布；runtime42files／38,484,553B。正式calls1129→約1033但median仍48.08，未宣稱效能達標。
- 02:35 production build exit0（26.33秒）；實際本機gzip HTTP首張地圖42項美術下載 **28,355,551B**，全部本機回應28,587,636B，未載入隘口專用rock、載入river-water、errors=[]。證據 `tmp/rts/download-budget.json`、`production-build-battle.png`；只證明本機host，不代表外站CDN。
- 收尾全站E2E採5fail停止，實際exit1：78passed／5failed／3interrupted／2094notrun（`tmp/rts/full-site-final-e2e.log`）。失敗仍是兩個既有首頁頁籤、Bomber Vite504、任務所導覽與標題；沒有全站全綠宣稱。4321屬本worktree的server已停止並安全封存獨立node_modules/.vite快取後重啟，4002未觸碰；RTS專用config已保存供重現。
- 較晚CPU/GPU計時與同頁flush A/B/A已檢核：frame calls穩定，主要成本在renderer提交；同頁baseline→flush→baseline皆48.08FPS，拒絕採用無法重現的單次59.88改善。Siege普通同動畫群合併的安全下界仍29draw，未生成偽優化候選；後續僅試保留原動畫節點的rigid-skin batching，兩個非均勻縮放弓弦保留rigid，需數值/法線/Three QA後方可替換。
- 2026-10-05 最終攻城車：rigid-skin-v3 每LOD由29→8 draws（6 skin、2條原rigid弦），原三角、材質、UV、貼圖與5clips保留。每LOD195個key/midpoint姿態位置與Three法線誤差<1e-7；Khronos共0 errors／6個既有tangent warnings。Root 三瀏覽器各14個實際姿態差分全通過，涵蓋normal、shadow、實例TRS、非空ray hits與frustum edge。採用資產提供的保守sphere與enclosing box修復Death首次姿態範圍快取造成的漏選；5個回歸先紅後綠，獨立consultant APPROVE。
- 最終程式檢核：128 files／1323 tests passed（45.40秒，`tmp/rts/full-vitest-final-delivery.log`）；RTS strict TypeScript exit0；production build exit0（20.34秒，`tmp/rts/build-final-siege.log`）。資產audit為42files／40,038,641B、所有必要模型與SHA通過。173個RTS相關文字檔機密模式掃描無命中。
- 最終正式效能：Windows11 Home（NT10.0.26200）／RTX5090 Laptop D3D11／Chromium145.0.7632.6／1920×1080 DPR1、shadow/MSAA保留、80units20buildings皆可見且在畫面內、暖機6秒後各60秒，兩輪median **59.52／59.88FPS**、p95 **25／20.9ms**、max **50／79.1ms**、errors=[]。實際main-pass calls由約1033降至823；沒有candidate fixture或flush改動。證據已歸檔 `art-factory/rts/runs/final-assembly/2026-10-05/performance-final-siege{,-repeat}.json`。
- 最終建置以實際gzip HTTP載入首圖：42項美術壓縮 **28,517,198B**、全部本機回應28,749,402B、errors=[]；正式初次載入畫面與 `download-budget.json` 已歸檔至同一final-assembly。未聲稱已驗外站CDN或所有裝置，未推送／合併／部署。美術來源與root組裝QA已齊；使用者整體商業品質接受仍待預覽。
- 更新後完整RTS桌面E2E **33/33 passed，9.5分鐘**；Chromium、Firefox、Windows WebKit 各11項、0 skipped／0 unexpected／0 flaky（`tmp/rts/rts-desktop-final-siege-suite.log`）。原始JSON已歸檔final-assembly的`desktop-e2e.json`，測試程式與正式資產對應code commit `a19aa20d`；最終科技基地畫面為`tech-production-final-chromium.png`。技術驗收完備，預覽保留 `http://localhost:4321/games/rts`。


## 共享對話續作：原創模型與動作重整

- 2026-10-05 續作已核對共享對話與真實工作樹，使用 Desktop Commander 在 `feat/browser-rts` 繼續。使用者對上一轮角色模型／動作品質的否定優先於上述歷史 root 美術接受紀錄；這些舊紀錄只保留當時證據，不代表本輪完成。模型、骨架、動作繼續維持專案原創。
- 2026-10-05 當時遊戲預覽位於 `http://127.0.0.1:4324/games/rts/`，當時4321與4002屬於其他工作樹。此為歷史埠配置；2026-10-13收尾使用本工作樹的 `http://127.0.0.1:4321/games/rts/`，以 `qa/regression-server-v5` 與V13執行設定為準。RTS專用測試與手動腳本支援 `RTS_PORT`／`RTS_BASE_URL`。
- 原創 clean-arm 候選已經六面彎肘視覺檢核與 Blender／實際 Three.js 頂點 parity，最大誤差 0.00001064807 m；本地整合 commit `3f400879`。核准範圍是全身組裝零件，並非整隻衛兵或 runtime 發布。
- 衛兵攻擊改為綁定單次目標的 windup cue，傷害跟隨原創 Attack 的 16/30 秒接觸點，移動、離開射程或更換目標會取消舊 cue。Walk 可讀取原創步幅／週期，雙 LOD 共用同一 motion metadata。另修正多 primitive glTF node 的保守 skin bounds 存在父 Group 而非 child Mesh 的讀取與座標轉換問題。
- 2026-10-05 23:02 本輪完整 Vitest：132 files／1365 tests passed，32.19 秒，exit 0。證據 `tmp/rts/resume-unit-1791212527984.log`。當時 runtime 仍為舊衛兵檔案，這次結果不能替代新全身模型、最終射程及正式場景檢核。
- 全身組裝候選的肩腋破口、張掌握持、膝與裙甲尖刺尚在修正；結構 QA 的 pass 只證明機械條件，未據此核准美術或替換正式模型。最終 GLB 必須與 Blender 視覺、實際 Three.js、Khronos 及來源檔的 SHA 證據一致後才本地整合。


## 2026-10-06 Desktop Commander 接手：工兵局部正式接入、戰鬥回歸修復

完整交接：`docs/games/rts-handoff-2026-10-06.md`。工作樹仍為 `feat/browser-rts`，保留所有先前未提交工作；未 commit、push 或部署。

- **只有工兵**的新握持／手腕修正版通過固定雜湊主審與獨立複審，並經 publisher dry-run 後接入本機 runtime。手腕封口與皮膚尖片修正；LOD0／1 = 18,973／9,913。候選 `human-units-grip-refine/2026-10-05/worker/revision-20261006`；runtime 與候選 SHA 一致，其他單位 GLB 未動。這不是原身體／全部動作最終美術驗收。
- 修復短射程接近與停止容差、多人近戰末段路徑及腳底避讓。由接手 11 失敗／152 通過改善為 RTS 166 通過；全站 132 檔案／1,368 測試通過；Chromium RTS E2E 13 通過；production build 成功。
- 衛兵候選 `original-guard-assembly/revision-20261006` 改善握持、膝部與步態，但肩背、裙甲、Hurt 姿勢一致性仍受阻。實際 1v1 測得 authored contact 刀刃間距 98.884 mm、首次扣血時間間距 16.859 mm，接觸時序**未通過**。`qa/root-contact-gate.json` 明確拒絕；不要把診斷 exit 0 誤讀為幾何通過。沒有發布。
- 弩兵最新是 `original-crossbow-grip/revision-20261006-v2`，Death 左手實際 GLB 漂移由約 10.2 cm 修到 0.150 mm，但肩袖／手腕外觀與嚴格全骨骼矩陣一致性仍受阻。詳細 `qa/handoff.md`；沒有發布。
- 遊戲 `http://127.0.0.1:4324/games/rts/`。獨立互動驗收 `http://127.0.0.1:4334/`：3 人物 × 2 LOD × 5 動作共 30 組姿勢檢查、播放暫停、隊伍色、手機無溢出均通過。4334 僅服務本機靜態候選包，標示未通過項目，不代表候選全數正式接入。

後續優先：修正衛兵 Attack 姿勢／時序而非放寬接觸門檻；修復衛兵／弩兵全身瑕疵與一致性，再以最終匯出雜湊重跑視覺、實際接觸、LOD 預算與發布前檢核。詳細檔案、證據與重啟指令見上述新交接。


## 2026-10-06 第二輪續作：衛兵與弩兵局部修正版已接入

最新交接：`docs/games/rts-handoff-2026-10-06-continuation.md`。本節更新前一節的受阻狀態：衛兵已完成胸背甲／短裙甲重建、Attack 時間曲線修正、匯出精度與所有新增部件 bounds；弩兵已完成局部肩袖／腕口及嚴格骨架匯出一致性修正。獨立最終複審批准對應範圍，主審完成 dry-run 與本機發布。工兵前輪修正版保留。

- 衛兵最終 run：`original-guard-assembly/continuation-20261006-2/final-bounds`，19,910／9,901 三角面；兩 LOD 的單挑／四人圍攻共 22 次實際命中及 10 個指定接觸姿勢，triangle surface gap 都為 0，沒有放寬射程或接觸門檻。
- 弩兵最終 run：`original-crossbow-grip/continuation-20261006-2`，18,801／9,895 三角面；全骨矩陣誤差 3.29e-5 通過 1e-4 門檻；局部腕圈有號外側誤差 0.7767 mm 通過 1 mm 門檻。側面懸拳疑慮經武器隔離確認為遮蔽，腕袖實際連接。Hurt 腰带／裙甲原有角狀變形仍保留，未宣稱全身商用美術完成。
- 本輪全站 1,368 測試／132 檔案通過；兩者接入後 Chromium RTS 13 案例通過；strict TypeScript exit 0；production build 完成；三人物互動頁 30 組姿勢檢查通過。
- 最終正式資產效能：1080p、80 單位／20 建築、騎士肖像、60 秒，RTX 5090 Laptop 中位119.05 FPS、p95 16.6 ms、errors 空。瀏覽器四個新 GLB 的實際 HTTP bytes hash 已與發布檔一致；沒有 candidate override。日誌 `tmp/rts/resume-tsx-1791270397289.log` 與 `tmp/rts/performance-release-formal-dedicated-portrait.json`。
- 遊戲仍在4324，互動檢視4334已改為預設新版衛兵並顯示三者本機接入狀態。沒有 commit、push、合併或對外部署。

**最後收尾尚有一項格式問題：** `git diff --check` 將本輪修改的 `tests/manual/rts-performance-fixture.ts` CRLF 行尾判為 trailing whitespace。正規化該檔換行並重跑彙整的工具要求被安全閘阻擋，沒有另走方式執行。因此不能宣稱 git diff 檢查通過，`tmp/rts/continuation-20261006-2/release-results.json` 尚未生成。功能／模型測試、實際發布與效能結果已完成；後續接手應保留已通過的新模型與完整證據，先處理這項未完成的格式收尾。

## 2026-10-06 弩兵腰裙續作：局修已接入

最新交接 `docs/games/rts-handoff-2026-10-06-waist.md`。弩兵 source／runtime 現改用 `original-crossbow-waist/2026-10-06-v1`；前節的腰帶塌折已修正，肩腕成果保留。其他人物沒有在本輪重製，也沒有重試前節被拒絕的 performance fixture 換行修正。

- 根因是原自動綁定的相鄰腰部頂點混入不同大腿／脊柱權重。兩 body 的 2494／1573 個頂點改為連續腰腹與髖裙過渡；幾何、貼圖、20 骨 bind、五種原創動畫及腕臂、手套、弩身保持一致。匯出面數仍 18,801／9,895。
- 先紅後綠：每 LOD 401 個姿勢、2019／1271 條腰帶邊，最大相對伸長從 270% 降為約 0.0054%。受擊時腰扣塌陷解除；既有袖口 0.776707 mm 與骨矩陣 3.29018e-5 門檻維持。48 張正／側動作圖、兩 LOD／五動作／兩隊色 20 組實際瀏覽器檢查及獨立唯讀複審通過。
- 本機 publisher dry-run／publish、46 個 runtime 資產登錄與 hash 稽核通過；真實遊戲 HTTP 收到的兩個弩兵 GLB SHA 與候選完全相符。其他 unit registry 記錄未改。互動檢視 4334 已同步，截圖 `http://127.0.0.1:4334/crossbow-waist.png`。
- 最終 native return code 均 0：全站 132 檔案／1,368 測試（4 workers）、Chromium RTS 13 案例、production build、三人物 30 組姿勢／播放暫停／手機檢查。全站原預設並行的兩次執行有同一個 Tetris import smoke 5 秒超時，單檔 12 項通過；沒有改 timeout 或測試斷言，保留全部失敗。第三次全部斷言通過但 PS5 stderr 影響 shell exit 判讀，再以 hidden native subprocess 記錄真正退出碼 0。
- 原始命令、退出碼、失敗與剩餘限制彙整於本輪 `qa/release-results.json`。沒有新效能宣稱，沒有 commit、push、合併或對外部署。人物材質邊界、簡化武器與其他兵種整體美術仍需續作，不能稱為全遊戲商用品質完成。

## 2026-10-06：原創弩本體重製與持弩可達性診斷

交接 `docs/games/rts-handoff-2026-10-06-weapon.md`。武器本體改為原創曲面木托、同軸封閉鋼弩臂、實際握把與腳踏環，沿用原創生成貼圖；960／416 triangles。兩 LOD、拖曳／旋轉／重設與桌面／手機實際 Chromium 預覽通過：<http://127.0.0.1:4334/crossbow-weapon.html>。

完整人物動作仍退回。新增全弩對 body／地面檢查，確認舊持弩基準會穿胸、Death 會穿地；單改手腕或六骨前移均未解。解析二段臂與八骨肩臂診斷已定位可達範圍及殘留袖口／握把交會，停止盲目參數重試。`original-crossbow-weapon` contract 為 `qa_failed/runtime_publish_allowed=false`，獨立檢核僅同意保留武器本體。正式兩個弩兵 GLB SHA 仍與上一節腰部修正版一致；沒有發布、推送或部署，沒有把幾何／WebGL 載入成功當成動作通過。

## 2026-10-06：原創持弩、落地與肩部接縫修正

新增可切換五動作與雙 LOD 的本地候選預覽：<http://127.0.0.1:4334/crossbow-carry/>；實際截圖 <http://127.0.0.1:4334/crossbow-carry/still.png>。交接詳見 `docs/games/rts-handoff-2026-10-06-carry.md`。

原創八臂骨持弩、射擊後座與向後倒地已做出可續用基線；雙 LOD 共 802 個半幀姿勢的武器／身體及武器／手套穿透均為 0，1,594 個匯出姿勢的骨矩陣／武器頂點與來源一致。修正肩區共點權重後，原最大約 5.3cm 的裂縫降至 0.00333mm 以下。Chromium 實際 60 個正／側／背姿勢、播放暫停、時間軸、兩 LOD、手機與檔案 hashes 檢查通過。

獨立複審仍為 REQUEST CHANGES：完整腕口拓撲有分岔，三個腕口仍有邊界採樣在 glove 外；原 165 個見證點通過不足以代表整圈袖口。肩頸殘留三角外觀、手套材質、瞄準／裝填與倒地表演也待修整。合約 `partial_qa_failed/runtime_publish_allowed=false`，正式遊戲仍用上一版腰部修正模型；未修改 runtime、推送或部署，未宣稱整體人物／地圖完成。

## 2026-10-06：原創灰脊松林接入

交接 `docs/games/rts-handoff-2026-10-06-pine.md`。原創針葉生圖、枝幹建模與葉片處理形成 5,664 triangles／兩材質／1.57MB 松樹；灰脊的 92 棵景物樹與 24 棵資源樹換為 pine，河谷保留 oak。資源量、樹位、阻擋／禁建格與地表遮罩雜湊保持一致。Khronos 0 errors；原有樹皮 tangent 警告列為已觀察無異常的限制。人物、岩壁、河岸與遺跡未在此輪宣稱完成。

全站 132 檔／1,371 tests、Chromium RTS 13 項、strict RTS TypeScript、production build 皆通過。兩張圖的真實滑鼠採集及縮量枯竭通過；本機 HTTP pine hash 與來源一致，沒有候選路由。1080p／RTX 5090 Laptop／80 單位＋20 建築＋騎士肖像／各 60 秒壓力測試：灰脊中位 80 FPS、p95 24.9ms；河谷中位 79.37 FPS、p95 25ms；均零錯誤。原始證據集中於 pine run 的 `qa/release-results.json`。

實景頁 <http://127.0.0.1:4334/highland-pine/>，遊戲 <http://127.0.0.1:4324/games/rts/>。主代理與獨立檢核接受中景景物的本機接入；近看仍有分層葉片感，使用者整體美術驗收待完成。沒有 commit、push、合併或對外部署。

## 2026-10-06：原創弩兵瞄準與降弩局修

交接 `docs/games/rts-handoff-2026-10-06-attack.md`；預覽 <http://127.0.0.1:4334/crossbow-attack/>，截圖 <http://127.0.0.1:4334/crossbow-attack/still.png>。模型、骨架與動作全原創，正式人物 runtime 未替換。修正舊射擊弩軌偏側約60度、雙手插值偏離握把、袖口穿弩及過快降弩；保留 drape 幾何／UV／材質／skin／bind 與無關 clips。

5項動作檢查通過；兩LOD握持段772個1/16幀姿勢零交點，五clips1594姿勢與Attack密集1282姿勢的匯出parity／速度檢查通過，最大弩頂點速度4.44547m/s低於原等價5.76m/s門檻。雙隊／雙LOD實際132姿勢截圖、播放暫停／時間軸／手機通過，page errors 0。

獨立複審僅接受0–20和36–40幀作後續素材。完整Attack仍qa_failed：20.3125–35.6875共494個失敗姿勢（不是494個三角交點），閉拳／袖口穿入stock與rail；手指開合、弩弦／箭矢機構、遊戲釋放時序、人物整體與其他兵種及地圖美術仍待完成。全接觸檢查退出碼1保留於release-results，未宣稱完整驗收；沒有push/deploy或新效能宣稱。

## 2026-10-06：原創手部指節與開合基礎

交接 [原創手部](rts-handoff-2026-10-06-glove.md)；預覽 <http://127.0.0.1:4334/articulated-glove/>。重建左右手連續五指網格、每手 Hand＋15 指骨與 2 秒原創開合；兩骨拇指改為三骨，修正掌根與 IP 折穿，低 LOD 保留平滑關節。3 項網格回歸、四個 genus-zero 網格、388 個半幀姿勢變形、1,540 個匯出姿勢比對、48 張 Chromium 姿勢與播放暫停通過。四 GLB 均 0 errors，各一個 skinned-mesh parent warning；strict review TypeScript 與實際中文 DOM 通過。

獨立檢核接受 standalone 動作基礎，商用外觀仍未完成：圓管指形、尖 V 指蹼、掌墊／縫線／袖口與材質需修整；爪狀彎指尚未適配弩握持。contract 維持 qa_failed/runtime_publish_allowed=false。人物 50 骨整合、五動作、裝填、肖像與效能驗證、其他兵種及地圖美術仍待完成；正式人物沒有換版，沒有 push/deploy 或新的全站通過宣稱。

## 2026-10-06：改採原創獨立手套高模作雕塑基礎

交接 [手套雕塑](rts-handoff-2026-10-06-glove-sculpt.md)；[可旋轉高模](http://127.0.0.1:4334/glove-sculpt/) 與 [原創開合比較](http://127.0.0.1:4334/glove-tailoring/)。程序版圓頂指尖改善，但局部細分隔離與指根 bridge 試作都未消除橫線，停止局部盲調，保留 v1–v4 失敗證據。v4 的 4 tests、388 變形姿勢、1,540 匯出姿勢與 120 瀏覽器截圖通過，僅代表機械檢查，仍禁止 runtime。

使用原創 imagegen 左手設計與本機 Hunyuan3D 產出 629,620 triangles 的獨立高模，五指分離、掌墊／指腹／袖口更自然；唯讀顧問接受作雕塑基礎。七個 Blender 視角與實際 Chromium 旋轉、拖曳、暫停、手機、錯誤流程及 strict TS 已驗證；GLB 0 errors／0 warnings。手背厚唇、虎口與腕環需重塑，32 個近零面需清理，尚未 retopo／綁骨／製作材質／接回人物。全部維持原創，整體目標未完成；本輪無正式人物換版或對外發布。

## 2026-10-06：原創手套曲面修復可進 retopo

交接 [高模修形](rts-handoff-2026-10-06-glove-refine.md)；[旋轉預覽](http://127.0.0.1:4334/glove-refinement/) 與 [實際截圖](http://127.0.0.1:4334/glove-refinement/still.png)。保留原創來源與掌指輪廓，修整 CMC／虎口、切除假腕內蓋並建立單一平面腕環。原 Y 高度投影漏掉陡壁並產生暗槽，完整保留 v3 失敗證據；改用連通 XYZ 曲面修復後，獨立七視角複查確認暗槽與黑袋消失，條件通過作可變形 retopo 基礎。

最終 GLB SHA `1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0`，499,957 triangles。3 個 fairing 回歸、4 個實際 GLB 幾何檢查、掌指位置保留、四個 Chromium 視角／旋轉暫停／拖曳／手機／503 錯誤、strict TS 均通過，validator 0 errors／warnings／hints。來源與 preview SHA 一致；獨立工具複審問題已修正並限縮不成立的法線／拓撲宣稱。

仍為 `qa_failed/runtime_publish_allowed=false`：背側 MCP 體積與關節環、腕口厚度、原創指骨權重／開掌握持、材質與人物整合待完成。此輪未替換正式人物，沒有新的完整遊戲、全站或效能通過宣稱；其他兵種、3D 肖像與地圖美術仍在原始目標內。

## 2026-10-07：原創手部低模基底可進關節重建

交接 [低模基底](rts-handoff-2026-10-07-retopo.md)；[旋轉預覽](http://127.0.0.1:4334/glove-retopo/)／[實際截圖](http://127.0.0.1:4334/glove-retopo/still.png)。停止兩輪仍有自交的 grid-port 路線，改由已檢核原創高模重建曲面。修正數值尺度與小孔／腕環誤分類後，最終 2,461 triangles／1,250 vertices，實際 GLB SHA `532b84f70b0856260ca57a0f617f85b683c02dea956dcc1fe590bb0ac85b98fb`。

8 項靜態結構檢查、7 個 Blender 視角、4 個 Chromium 視角／旋轉暫停／拖曳／手機／503 失敗路徑及 strict TS 通過；validator 0 errors／warnings／hints。獨立視覺檢核條件接受作局部關節網格基底。舊版失敗模型與動畫證據已隔離且保留原始雜湊，當前預覽明列 0 bones／0 animations。

仍為 `qa_failed/runtime_publish_allowed=false`：MCP／PIP／DIP 關節環、腕口厚度、原創綁骨與握持變形、材質及人物接合未完成。未替換正式人物，沒有新全站／完整 RTS／效能通過宣稱；全原創、其他兵種、3D 肖像與地圖品質需求持續保留。

## 2026-10-07：原創指節環與局部變形通過，完整握持仍退回

交接 [指節與綁定](rts-handoff-2026-10-07-joints.md)；[動畫預覽](http://127.0.0.1:4334/glove-joints/)／[截圖](http://127.0.0.1:4334/glove-joints/still.png)。原創四指新增 8 個 PIP／DIP 環，2873 triangles，827 個原始掌面／虎口頂點位置保留。適配原創 16 骨與 2 秒 OpenClose；修正窄權重造成的內側翻折，5 項回歸與 330 個單關節姿勢通過。

目前動畫 GLB SHA `3392dd48a87b2d61a6d9f0ae2673cb68effb3024427985d769e86c766b416dba`。385 匯出姿勢的位置／skin parity、Chromium 12 姿勢及互動／手機／503 檢查通過，validator 0 errors／1 warning。完整 GLB 動作仍是半握 30、全握 267 個三角交叉，不能接入人物。獨立顧問只接受局部 PIP／DIP 成果；MCP／CMC、同指複合變形與實際武器握持目標是接續重點。

合約 `qa_failed/runtime_publish_allowed=false`；原創要求、全身人物／其他兵種／肖像、地圖美術與商用品質目標均未縮小。此輪無正式人物換版、push/deploy 或新的完整遊戲／效能通過宣稱。

## 2026-10-07：原創掌指根與拇指根修正

交接 [掌根綁定](rts-handoff-2026-10-07-roots.md)；[互動預覽](http://127.0.0.1:4334/glove-roots/)／[截圖](http://127.0.0.1:4334/glove-roots/still.png)。用來源曲面的連續根部權重取代固定世界座標分配，並根據實際碰撞掃掠修正中指彎曲軸，維持原 0–62° 幅度。1,456 個 rest 頂點、面、骨頭位置與第 2／3 節權重完全保留；660 個單關節／同指複合姿勢零測得交叉。

新 GLB SHA `2c50301d1f490f3432b6347a0b4a768ed832b67b2fed36c175368624dfbd517c`。左手 LOD0 的 385 個位置／skin 匯出比對、Chromium 12 個姿勢／視角與互動、strict TS 通過；匯出非 root mesh 警告已修正，validator 0 errors／warnings／hints。完整握持仍半握 30、全握 244 個三角交叉配對，`qa_failed/runtime_publish_allowed=false`。下一步依實際原創武器握把製作接觸路徑與拇指時序；原人物、肖像與地圖品質要求繼續保留。

## 2026-10-07：原創蜿蜒河谷與橋面候選

[交接與證據](rts-handoff-2026-10-07-river.md)；[可操作預覽](http://127.0.0.1:4334/riverbank/)／[工人過橋截圖](http://127.0.0.1:4334/riverbank/shots/walk-north.png)。河道改為連續蜿蜒河槽，原橋八塊鋪石調平並對齊走面；橋內淨寬 6.048m，導航、兩個擴張礦、岸坡與霧層同步。兩座橋實際 command／simulation 過橋、自然 AI 經濟與勝利、1,377 個全套測試、9 個遊戲 E2E、嚴格型別及獨立 review 通過。橋 GLB `1ba65f51…317b2`，validator 0 errors／warnings。

仍為候選，正式地圖與 registry 未換版。人物模型／骨架／動作一律維持原創；全兵種、3D 肖像與第二張圖商用品質要求未縮小。

## 2026-10-08：完整品質檢核，商用交付尚未達標

依使用者「全部修完達到商用水準再叫我看」，停止局部驗收邀請。完整範圍保留在 [修整計畫](../superpowers/plans/2026-10-08-rts-commercial-readiness.md)；機械檢查與整體品質分開記錄於 `art-factory/rts/manifests/commercial-readiness.json`。資產齊全不再自動代表完整美術或商用品質，只有所有品質門檻通過且審核雜湊完全相符才可通過。

本輪修正實際移動速度與 Walk 播放同步、20 Hz 模擬的畫面插值、終點最後一步動畫、框選及技能圈位置。原創音效加入分層音色、發射／命中／技能／採集事件與有上限的聲音資源池；靜音、重開及裝置失敗均覆蓋。全套 146 檔／1,461 項 Vitest、RTS strict TypeScript、production build 通過，相關程式修正經獨立唯讀審查。

目前素材下兩圖各完成玩家與 AI 自然勝利，沒有注入資源或結果：玩家 river 08:56／pass 10:48；AI river 07:46／pass 06:24。正式打包在本機 gzip host 的首圖素材 32,475,157 bytes，動態肖像實際播放；這不是部署 CDN 證明。WebKit 兩圖採集／集結／小地圖操作已通過；Firefox 早先受環境限制而崩潰，環境更新後完整 16 項 RTS 測試已通過。

人物候選沒有進入 runtime。統領新劍盾幾何可保留為原創組件，但完整人物仍有開掌、攻擊反向與死亡穿模；獨立審查拒絕。閉握手套 v2 雖完成正規化重拓樸，仍有 6 條破洞邊與 28 組自相交。全兵種完整動作、建築生命週期、兩圖美術、原創操作圖示、音效聽感及最後發布驗證仍未完成，`commercial_quality_approved` 保持 `false`。未 push 或部署，未提出局部預覽驗收。

後續效能修整保留正式畫質與 80 活動單位／20 建築／動態肖像負載：資源樹改為每區批次繪製，相容 LOD 移除重複空骨架。RTX 5090 Laptop 實測從 median 48.08 FPS 改善為 59.17 FPS、p95 24 ms。兩圖的樹冠點選、採集與耗盡隱藏已用實際滑鼠驗證；最新全套 1,466 測試、strict TS 與 production build 通過。此結果只解除目前版本在該硬體的效能問題，人物、美術與完整商用驗收仍未通過。

## 2026-10-09：建築指令圖示整合，角色與倒塌仍在修整

12 張建築／主城升級圖示取自本案原創 3D 模型，保留可編輯 Blender、來源 GLB／材質雜湊、原始透明渲染與確定性縮圖。獨立藝術和 HUD 審查通過後，已將 12 張 lossless WebP（共 145,158 bytes）接入本機版本，未對外部署。工人的 10 個建造命令與兩階主城升級保留中文名稱、費用、科技／資源封鎖及滑鼠子圖點擊行為。

修正第二座主城升級時、全域科技階級未變造成的按鈕不刷新；900px 寬下工人 13 個指令全部顯示，建造提示移到面板上方。先保留缺圖、階級刷新、命令被裁切、提示重疊的失敗證據，再修正通過。完整 Vitest 155 檔／1,583 項、RTS 與手動驗證腳本 strict TypeScript、production build 24.67 秒通過。三瀏覽器正式本機資產路徑驗證，包含三種寬度、每瀏覽器 30 次建造模式／Esc、付費建造取消、第二座主城連續付費升級、12 張圖示實際 HTTP 位元組與提示零重疊；證據位於 `commercial-readiness/2026-10-09/qa/building-production-icons-published-v4`。

建築特效程式已完成命中、修復、火煙、戰鬥倒塌／取消區別、暫停與迷霧清除，候選路由下三瀏覽器和 64 sprite 資源釋放檢查通過；尚未發布特效 atlas，需等正式建築 anchors 與倒塌藝術整合。house fracture-v3 雖通過 35 張實際 Battlefield 的機械檢查，仍有懸空 shared 裝飾與不完整支承驗證；其 Blender 渲染又缺外部材質，不能當 PBR 通過，已獨立退回改做完整結構組裝的低矮瓦礫終態。

正式版開局截圖另抓到「尚未解鎖的科技需求文字」讓第三排指令被裁切，滿科技測試沒有涵蓋此狀態。補上真開局六種尺寸 × 三瀏覽器，共 18 組 client clip、按鈕／文字、零捲動與提示間距檢查；讓工人指令區依內容展開，提示固定在區塊上方。正式本機圖示與付費操作三瀏覽器再次通過。最新完整 Vitest 155 檔／1,583 項、strict TS、production build 34.69 秒通過；兩圖實際 gzip 資產 34,246,745／34,801,199 bytes，包含動態工人肖像及 13 個開局指令完整顯示。35 MB 指標只計遊戲資產；全部本機傳輸為 34,499,196／35,053,650 bytes，未驗部署 CDN。

完整 E2E 原跑 47 過、1 個 WebKit 科技控制測試逾時；相同程式加 trace 單跑成功但接近 180 秒上限。原因為科技測試的數百次等待各自渲染完整畫面；改用正式 `stepGame` 的 20 Hz ticks 推進已由 UI 付費建立的 queue，再跑真 frame 刷新 HUD。Chromium／Firefox／WebKit 分別 9.786／18.144／59.295 秒通過。此為資金治具控制驗證，不冒充自然對局，也不把重跑合併稱為單次 48/48。

來源稽核新增原始／候選／來源／證據雜湊驗證；`python -O` 也不能略過 runtime 檢查。11 項來源測試、2 項最佳化子程序測試、2 項 readiness 測試及獨立複審通過；104 項現有資產通過已宣告雜湊檢查，來源資料仍未全部綁定。三張最早 ImageGen 原始檔已確認與專案內 archive 位元組相同，registry 改用可攜路徑與 SHA。

衛兵來源追查確認舊靴、舊手與取樣腿部仍含受地區條款限制的 Hunyuan 幾何依賴，需替換。最初把目前胸甲也列為直接依賴是誤判：後續程式已刪除舊胸甲，以原創參數截面重建 768／384 三角形閉殼；目前 public 與此來源屬性精確一致，保留並另補設計參考來源證據。新右手的 1,191 掌指點為專案原創 sculpt，未複製 Hunyuan 網格，但設計參考歷史仍如實保留，沒有宣稱整角權利清理完成。

右腕 v5f 唯一候選在 Attack15 產生 46／42／4 自交，114 檔失敗證據已固定匯入；停止局部推點。整體腕袖的單橋接骨試點也在 Idle54 碰護甲，並需把切環退到 110 mm，因此停止繼續幾何退讓。獨立判讀指出舊握劍軌跡不是使用者要求的不可變條件；下一步以真掌骨、前臂、握柄 landmark 檢查哪些姿勢需重做，再保留打擊節奏與命中語意製作原創動作。

house 後續 v4 預覽曾用錯 local/world 座標，v5 修正後揭露逐三角象限切割仍是直立鋸齒與大量無支承零件，兩包都拒絕。新版契約改為先製作獨立、低矮、可辨識的原創靜態廢墟；藝術通過後才實作短倒塌與瓦礫切換。現有 runtime 仍是 lifecycle v1，尚未接入 v2 或失敗素材。全兵種動作、肖像、音效聽感、最終資產與整體商用品質仍未批准，未 push／部署，也不邀請局部驗收。

## 2026-10-09：共享貼圖、開局點選與靜態建築效能

14 個兵種／LOD 模型已在本機改用 18 張原位元組共享貼圖，幾何、動畫與圖片編碼不變；弩兵兩個 LOD 因 WebKit 原生排序仍有少量像素差，保留原包裝，沒有藉修改正式排序強行通過。採用的七兵種 × 三瀏覽器 × 七視角共 147 組原生排序像素完全相同，缺圖後同一 library 重試三瀏覽器通過。兩圖實際本機 gzip 首次遊戲資產分別為 29,721,854／30,276,308 bytes，各減少 4,524,891 bytes；自然載入與驗證 HTTP 分開計算，14 個模型、18 張圖片及原弩兵兩模型的 HTTP 位元組雜湊全部相符。這不是 CDN 或角色來源權利批准。

修正戰場已顯示、第一個 RAF 尚未執行時模型尚不可點選的漏洞：啟用滑鼠前先以零 dt 建立模型與世界座標。延遲 RAF 的真 WebKit 失敗案例與單元測試先紅後綠。獨立審查另外發現首繪例外後會重用已失效的 WebGL canvas，現共用完整 teardown，替換畫布再重試；新案例確認只建立一套 input 與 RAF。沒有放寬斷言或逾時。

探索與建築位置沒變時不再重建植被矩陣，迷霧內容沒變時不再上傳貼圖。主要 CPU 改善來自已完工靜態建築的可逆矩陣快取：保存原更新旗標，位置／父節點變更會重算，施工與倒塌前解凍；動畫、骨架、morph 或沒有安全 completed representation 的模型不會套用。保留相同畫質及 80 單位／20 建築／騎士動態肖像，最新本機 RTX 5090 Laptop 60 秒量測 median **80 FPS**、p95 **20.8 ms**、最長 **37.5 ms**，WebGL context 未遺失、錯誤為零；前一個僅植被／迷霧修正版仍是 48.54 FPS，失敗報告保留。

完整 157 檔／1,595 項 Vitest、strict TypeScript、production build 通過。三瀏覽器重點 9 項全過；其餘 45 項有 44 項通過、1 項 Firefox 頁面載入逾時，未進對局。同程式／逾時、開 trace 重跑 Firefox 兩張自然地圖均通過。因此 54 個不同 RTS 案例均有通過紀錄，但不是單次全綠，導航逾時根因仍未確定。實際已發布素材的取消退款、付費修復、戰鬥摧毀、死亡不可點選與暫停／屍體移除，三瀏覽器另行通過。原始失敗、截圖、程式 SHA 與報告集中在 `art-factory/rts/runs/commercial-readiness/2026-10-09/qa/static-rendering/report.json`。

劍兵改用胸肩帶動的三姿勢，獨立檢核只批准動作方向。連續候選的 f15..24 劍對盾／胸／袖／臂甲接觸均為零，但全段粗掃在 f0 發現上臂甲／肘甲 76 組、前臂甲／肘甲 86 組交叉，停止影片與密集掃描。來源 f9 與候選 f0 的交叉 triangle pairs 相同，證明問題已存在於方向姿勢。98 檔 blocking 與 82 檔 continuous 證據已固定 SHA 匯入；兩者都未發布。下一個有限工作包核對原本肩／肘／腕解剖 frame 與固定世界 radial 的差異；顧問剛體 A/B 與 Blender 實際評估數值不一致，先停候選並核對座標轉換，不把任一零交叉結果當成組裝批准。整體商用品質仍為 `false`，沒有 commit、push 或部署。

後續已定位 A/B 分歧：顧問誤用原手臂骨 bind 代替 Armor helper 自身 bind，已撤回 hybrid 配置的可行性判斷與授權。正確矩陣與 Blender 實際評估差小於 0.285 µm。再以兩種固定方法各驗 f9／12.5／16／20／24，前四 sample 的 26 個接觸群組及三甲 containment 都為零，但兩法 f24 均出現上臂甲／胸甲 12／12／0；兩法都判 invalid。89 檔只讀診斷已驗完整 SHA 後匯入 `guard-arm-motion/2026-10-09-anatomical-armor-v1`，没有產生候選，也沒有改 mesh、skin、曲線或 runtime。下一步需要共同處理收招姿勢與上臂／胸甲接口，不能再把單換肘甲跟隨方式視為整體修復。

## 2026-10-09：專用工作／施法動畫接線與來源證據綁定

移除執行端把 `work`／`cast` 無條件改成 `attack` 的行為：每個 LOD 優先選專用 Work／Cast，缺少時才沿用 metadata 指定的 Attack，最後才回 Idle。舊素材的工作／施法／無 cue 攻擊若共用同一循環，維持播放進度；新攻擊 cue 與死亡切換仍重啟。獨立檢核另找到攻擊倍率殘留與死亡 fallback 無法恢復循環，新增三項測試先紅後修，重啟時恢復合適倍率並縮小延續條件。這是正式動作素材的接線修正，沒有把目前五動作模型宣稱成已有專用採集或施法美術。

最終相關 64 項、全站 158 檔／1,605 項 Vitest、strict TypeScript 與 production build 通過。Chromium／Firefox／WebKit 的自然採集付費建房及受控英雄三技能操作共 6／6 通過；root 實看 WebKit 建築完成與王旗目標畫面。證據與程式 SHA 已封存於 `art-factory/rts/runs/commercial-readiness/2026-10-09/qa/action-selection/report.json`。前一節 80 FPS 是先前靜態建築修正版的量測，這次動作選擇改動沒有重新量測，不把舊報告當成本版效能結果。

現有七份 registry 的 73 個素材，補上 134 個已宣告原始／來源／可編輯檔／prompt／QA 檔案雜湊。修改前 registry 及完整 runtime audit 已備份；逐欄驗證只新增 hash，沒有修改舊內容、素材位元組或批准狀態。11 項來源完整性與 2 項最佳化 Python audit 回歸通過，122 個 runtime 檔案共 55,808,901 bytes 雜湊一致。`source_binding_complete=true` 僅表示目前已宣告的路徑均綁定，並不證明歷史製作鏈、補足缺少的原創證據或解除衛兵／工人的受限來源；完整來源與商用品質依然未通過。證據：`qa/declared-source-binding/report.json`。

衛兵下一個單候選改用較小的肘甲解剖跟隨修正，並前移／抬高 f24 右肘；保留胸、左盾、命中姿勢與腳底。檢查擴至 f28／32／36 與循環接點，先通過有限姿勢才渲染。民房廢墟則改為有來源追溯的低牆、斷瓦列與斷木桁承重組件，停止完整屋面縮放與獨立直立木桿的舊方法。兩項美術仍在製作，未發布候選，整體任務持續進行。

## 2026-10-11：接手 Claude fdc46e4c，修正迷霧邊界操作

接手範圍保持完整 RTS／商用品質目標，沿用 `2026-10-09-rts-finish-plan.md`，不把單一修復當整體完成。本機分支 `feat/browser-rts`、HEAD `79789f39`，10-06 以來仍有大量未提交成果；保留原修改、來源／失敗資產及既有 `node_modules` link 刪除，不推送或部署。原對話最後的本機 commit 整理沒有完成紀錄。

現況抽驗確認 worker、guard、crossbow 已使用 `procedural-gauntlet/2026-10-09-{worker,guard-a2,crossbow-a2}`；FX atlas 在最新 `ui-registry.json` 已是 `runtime_publish_allowed:true`，不可用較早 atlas-only review 誤稱尚未接入。127 個 runtime 資產的檔案、SHA 與已宣告來源綁定全部通過；這不是整體商用品質或對外發布核准。使用說明的三個舊人物來源及舊效能數字已更正。

獨立審查抓到格線上的可見敵建築仍被攻擊命令判為不可見；建造與破陣斬預覽也繞過同一邊界契約。新增 `visibility-commands.test.ts`，真實 worker 視野的 x／z／角格、稍越界的不可見負例，以及建造／施法預覽到命令共 8 案，修正前 5 fail／3 pass，修正後全過。`isPointVisible` 保留原可見性語意，命令與 UI 共用；獨立複審 APPROVE。

修後驗證：相關 5 檔／43 項，全站 169 檔／1,731 項（109.19 秒），112 個 RTS TypeScript 檔加新 E2E spec 的 strict check，production build（23.04 秒）均通過。新瀏覽器回歸以正式模型、真滑鼠操作攻擊與建造，Chromium／Firefox／WebKit 共 6／6 通過，主代理實看 Chromium 綠色建造預覽。這是受控邊界 fixture，不冒充自然對局；完整 RTS 瀏覽器回歸另記下方結果。

本輪證據集中 `tmp/rts/codex-2026-10-11/`：`fog-red.log`、`fog-green.log`、`vitest-final.log`、`tsc-final.log`、`build-final.log`、`fog-e2e-report.json`、`fog-*-preview.png`。首次 E2E 在 webServer 120 秒啟動逾時、未跑任何案例；既有 CLI server 後續實際完成啟動，再沿用同一 worktree 的 4321 重跑。臨時 API 啟動排除 `node_modules-shared-link`、`art-factory`、`tmp` 監看後約 16 秒可啟動；臨時 server 已停止，未修改正式 Astro 設定或刪除來源。

效能仍未通過：本輪修正前正式 60 秒／1080p／80 單位／20 建築／動態騎士肖像為 48.08 FPS、p95 25.2 ms、max 37.5 ms、零頁面錯誤，目標為 median ≥55 FPS。三個 LDPlayer 執行中，未擅自關閉。CPU profile／分段計時顯示主要負載仍在 renderer 與世界矩陣更新；不能把既有 A/B「比舊版快」當成達門檻。下一個有限優化包須保留畫質、相同負載及共享 LOD 骨架：隱藏的高模骨架仍驅動低模，不能直接 detach 整個高模分支。

未完成：正式效能門檻、最終版本自然玩家／AI 兩圖勝負複驗、素材專用 Work／Cast 與完整美術／聽感核對、商用品質 manifest 依最終證據收斂、本機 commit 整理與使用者整體驗收。`commercial-readiness.json` 舊 failed 欄位部分已過時，但未經逐項驗收不改成整體通過；不請使用者做局部驗收。

迷霧修正版的正式建置 gzip 下載量：river 資產 27,569,679 bytes／全部本地傳輸 27,828,769 bytes；pass 資產 28,124,133 bytes／全部本地傳輸 28,383,223 bytes，均低於 35 MB。兩輪零頁面錯誤，動態肖像與指令卡正常；這是本地 gzip host，尚未部署驗證 CDN。證據為 `download-river.log`、`download-pass.log` 及同名前綴的報告／截圖。

完整 RTS Chromium／Firefox／WebKit 回歸 **69／69 全過，16.4 分鐘**，報告 `e2e-full-report.json`；三瀏覽器各 23 案，包含 12 建築摧毀、8 肖像、兩圖操作、科技、恢復與英雄技能。主代理實看 WebKit 肖像整合截圖。此基準在後續材質共用效能實驗之前完成，不能當作該實驗的驗證。

材質共用有限實驗未保留：5 項新測試先 4 fail／1 pass，實作後 90 項相關測試、strict TS、build 與獨立 correctness 審查通過；但 60 秒交錯為 pool 60.24／原材質 59.88／pool 59.88 FPS，p95 20.9／25.0／25.1 ms，沒有可重現收益，不能把初始 48.08→60.24 歸功優化。已依 [有限實驗紀錄](../superpowers/plans/2026-10-11-rts-material-pool.md) 撤回 production 改動，候選與證據保存在 tmp。`models.ts` SHA 完全回到實驗前，恢復後 93 項相關測試全過；迷霧修復完整保留。

剩餘動作缺口重新確認：10-09「五動作」只調整人物美術的實際鏡頭驗收，未撤銷 10-04 spec 中採金／伐木／施工與牧師／統領施法。8 單位雙 LOD 仍只有 Idle／Walk／Attack／Hurt／Death。Hurt 雖有片段，`hero.ts:damageEntity` 並未產生單位受擊事件；應另做獨立 hurt cue，保持 order／attack cue 與戰鬥平衡，死亡優先、同 tick 合併播放、依模擬時間 catch-up，驗證暫停、迷霧與 LOD。密集受擊亦不得持續遮蔽攻擊接觸或施法，需先定明呈現優先序。這是下一個有限實作包，不是既有測試已覆蓋的功能。

恢復後再做 production build（18.46 秒）及正式 60 秒效能：**59.88 FPS／p95 25.0 ms／max 229.1 ms**，3,100 frames，80 單位／20 建築全部可見、騎士動態肖像、零 pageerror，`performanceThresholdPassed:true`／`formalAcceptance:true`。`perf-restored-final/` 是迷霧修復保留、材質候選撤回後的現版證據；當次門檻通過，但保留早期 48.08 FPS 未通過結果與負載變動限制，後續動作／資產變更仍需再驗。

下一包 Hurt 經 consultant 挑戰後採 **death > attack/cast > hurt > idle/walk/work**；不能用 Hurt 覆蓋仍按模擬時間造成傷害的 Attack。建議 cue 間隔 0.60 秒、受擊片段最多正常速度 0.35 秒、約 0.10 秒淡出；同 tick／密集命中不刷新 startedAt，死亡清 cue，恢復目前基礎動作。這些是待實作並實看鏡頭的呈現常數，不能當成已驗證美術效果；先寫保留攻擊 contact、施法效果、order、暫停、LOD 與過期 cue 的 Red。當前 production 尚未接入 Hurt。

### 2026-10-11 Hurt 已接入並驗證

上述 Hurt 包已完成：真實非致命傷害產生獨立 cue，0.60 秒內的密集命中仍全數扣血但不刷新反應；死亡清除，Attack／Cast 優先，普通移動／工作於短窗口後恢復。主模型及共享 LOD 的 pose、fade 都依模擬時間，暫停與重複 RAF 不偷跑。未改 order、cooldown、技能效果與傷害 tick，未重製模型美術。

初始 Red 14 fail／5 pass；獨立檢核另抓到入場 fade 依 RAF 前進，非零 Walk pose 回歸先失敗、改用 cue age 差值後通過。最終全套 **171 檔／1,747 項**、strict RTS TypeScript／新 E2E、production build（19.48 秒）通過。三瀏覽器 Hurt＋肖像 9／9，補入 siege 車體 pivot 及實際高低模 visibility 後的 Hurt 3／3 也通過；兩次 consultant 檢核的阻擋項已關閉。根據八兵種×雙 LOD 正式模型留圖，主代理實看 gameplay 48／24 span、受擊／恢復及診斷 LOD 畫面。這些是受控呈現 fixture，不能替代自然對局。

新版正式壓力測試 **57.47 FPS／p95 28.4 ms／max 207.7 ms**，60 秒、2,724 frames、1080p、80 單位／20 建築／動態騎士肖像、零頁面錯誤，通過既有門檻。證據集中 `tmp/rts/codex-hurt-2026-10-11/`，計畫與詳細限制見 `docs/superpowers/plans/2026-10-11-rts-hurt-presentation.md`。整體 RTS 仍未完成；後續 Work／Cast、最終自然對局、美術／聽感、manifest 與本機 commit 整理繼續保留。

### 2026-10-11 Work／Cast 發布與最終整合驗證

`work-cast/2026-10-11-v2` 已經獨立審查並在本機發布六個 GLB：工人 Mine／Chop／Build、牧師 Cast、統領 CastCleave／CastMend／CastBanner。原五個片段保留，統領劍以既有握點翻正；未加入新幾何。來源、候選、原 runtime 備份、發布及 root-review 雜湊分開保存。27 項 Python QA、六個 GLB validator 零錯誤、1,152 組移動施法姿勢與來源 denylist 通過；這不等於使用者已批准整體美術。

移動施法保留 Walk 下半身與技能上半身，依模擬時間暫停。獨立審查另找到牧師 attack-move 治療會先停步一 tick，再回 Walk 的真實路徑；保存同一施法序列的最後步態，過期／新序列／死亡清除。有效 Red 4 fail／24 pass，38 項相關回歸通過。此 production 版本的全站 **174 檔／1,787 項**、strict TypeScript、build（20.17 秒）、Work／Cast 三瀏覽器 **3／3** 通過，證據在 `work-cast/2026-10-11-v2/qa/`。後續僅新增診斷與驗收測試，未改 production。

最新兩次正式 60 秒效能為 59.52／58.82 FPS、p95 22.3／24.0 ms，但 max 551.4／675.5 ms，**皆未通過 max <500 ms 門檻**。改用相關時間戳與 CPU profile 後捕捉到 540.2 ms 幀，其中至少約 300 ms 為主執行緒 idle；現有證據不能再推定是 OS、GPU 或其他應用。診斷明標非正式驗收，沒有放寬門檻。下一步加入獨立 25 ms timer heartbeat，辨識 RAF 與事件迴圈是否一起停頓；測試先 2 fail／4 pass，再 6／6 通過。

正式建置下載仍通過：river 資產 27,635,702 bytes／全部本地傳輸 27,896,280 bytes；pass 28,190,156／28,450,734 bytes，均低於 35 MB。來源政策獨立審查已通過，現行 `current-source-readiness.json` 綁定 127 個 runtime 資產與 16 個人物 GLB；不再把舊來源清理 blocker 當成現況，也不另造法律認證需求。

四個 20 人窄口瀏覽器案例 **4／4 通過**：middle-pass 7 秒、north-pass 4.75 秒、north-bridge 10.5 秒、south-bridge 7 秒讓全隊通過，最終全部 idle／存活、零重疊／pageerror。使用原地形與真正滑鼠框選／右鍵命令，但注入 20 個單位並停用 AI，明確屬 movement fixture，不能冒稱自然戰役。證據在 `commercial-readiness/2026-10-11/qa/crossings/chromium/`。

翻劍後的統領另補五舊片段×四時點：正常 48／最大縮放 24 與遠距 LOD1 診斷 96。Chromium **1／1 通過**，獨立實看 APPROVE；Death 尾端地面遮蔽在實際視距未見突兀截斷或漂浮。此證據只涵蓋 authored pose／燈光／相機與 LOD 外觀，不取代既有 runtime cue／crossfade 測試；其他七兵種保留來源幾何與舊片段，可沿用先前視覺驗證。證據 `work-cast/2026-10-11-v2/qa/commander-base-clips-v2/chromium/`；初次 fixture 的 LOD 身分假設失敗也保留，沒有改 production。

自然戰役已驗證玩家 river 6:42／pass 9:12 獲勝，正式建置上的 AI 在 river 6:20／pass 6:37 獲勝，沒有資源、HP 或勝負注入。AI 是玩家不操作的自然推進測試，不代表競技平衡。river／pass 實時音訊 410.781／560.6 秒，零缺失／無效／削波樣本，峰值 0.1254／0.1556，同時最多 6 voices／20 sources（river）、6／18（pass）。工具無法回讀音訊，**尚未做聽感批准**。pass 玩家錄音 v3 因英雄技能卡在 ready→click 間消失而中斷；新增短 timeout 後只在重新讀取可見狀態確認英雄死亡時繼續，英雄仍活則失敗。v4 完整勝利，保留英雄陣亡後的真實補兵過程。完整 source-lock、失敗軌跡、原 PCM 與波形報告保存在 `commercial-readiness/2026-10-11/qa/`；`final-natural-campaign.json` 綁定四個勝負及兩份錄音，171 個已鎖定檔案執行前後未變。

狀態清理已經 consultant 獨立檢核：`internal-feature-review.json` 綁定本版人物、動作、建築與介面證據，四項只標內部通過；舊 rejected／restricted 報告移入 manifest 的 historical 欄位並保留精確備份。四自然勝負報告另外封存。整體仍為 `in_progress`／`commercial_quality_approved:false`，正式效能失敗與聽感未驗證均保留。

含 heartbeat 診斷測試的全站重跑 **175 檔／1,793 項通過（114.50 秒）**。該輪後新增 GPU finish 工具測試，先 2 fail／6 pass，再 **8／8** 與 strict TS 通過；沒有 production 改動。原 heartbeat 最壞 548.9 ms 幀中，render 162.1 ms 後仍有約384 ms 的 RAF 缺口，但15筆 timer 仍每23.3–26.7 ms執行。另有289／309 ms的幀是同步simulation/render飽和，兩者不混為同一根因。`--finish` 診斷把 GPU 完成等待分開量測，median56.82FPS／p95 24.6ms／max321.6ms，finish最多0.8ms；本輪未重現最長缺口，**不能據此宣稱已修正或正式通過**，報告 `formalAcceptance:false`。

因 finish 診斷無法定因，續做 Chrome 跨程序 trace；串流器的初始 Red 已保留，實作後診斷工具 **11／11** 與 strict TS 通過，獨立檢核 APPROVE。首輪 `performance-chrome-stall/` 為 45.87 FPS／p95 28.7 ms／max 183.8 ms，未捕獲 ≥500 ms；64 MiB ring 發生資料覆寫，gzip 37,961,792 bytes。追蹤伴隨明顯量測擾動，不能當效能改善或正式驗收，後續需縮小事件範圍；meta 的 `elapsedWallMs` 79,729 ms 包含 trace 下載，實際量測約60秒。

縮小 Chrome trace 後，v2 為56.50FPS／p95 27.6ms／max150.5ms、無資料覆寫，仍未重現長幀；它只證明診斷擾動下降。回核原始設計第148行，要求是「無連續500ms主執行緒凍結」，不是每一個RAF間隔<500ms。consultant確認舊checker混淆兩者；新增8項測試先Red，實作25ms heartbeat lateness與Long Tasks後，相關19項及strict TS通過。精確500ms、連續短task餓死timer、窗口邊界、hidden／unsupported／overflow均不能誤pass，完整arrays另存並綁SHA。

校正後正式60.13秒：**57.80FPS／p95 28ms／max RAF206ms，最大timer lateness368.7ms／Long Task203ms**，80單位／20建築全可見、騎士肖像、零錯誤，通過原規格。本輪沒有production效能修改；先前601.1ms timer gap診斷仍保留，不保證所有環境都無抖動。證據`qa/performance-contract-review.json`與`performance-main-thread-contract/`，獨立檢核APPROVE。完整Vitest **177檔／1806項通過**；初次PowerShell將預期stderr映成shell1，保留原log，再用原生exitcode和JSON reporter確認**exit0、零失敗（93.36秒）**。舊自然戰役checkpoint裡「performance failed」是當時狀態，當前以新performance report及manifest為準。

本機整合提交 `d6c9c37` 納入643個有變更的程式、測試、runtime與來源檔，保留可編輯Blender及來源鎖定依賴；未納入既有node_modules刪除。`release-acceptance.json`整合技術證據，獨立檢核所有引用SHA及177／1806測試JSON通過；`commercial_quality_approved`與使用者整體批准仍為false。大型PCM、原生sample ledger、Chrome trace及重複高解析截圖留在本機，由`local-artifact-index.json`記錄大小／SHA，正式報告與代表截圖另行提交。沒有push／deploy；剩餘為工具無法回讀的音訊聽感及使用者整體驗收。

### 2026-10-11 收尾稽核：重新開啟全站回歸門檻

上段「剩餘僅聽感與整體驗收」不完整：回核原始設計第150行與專案 verify.md，收尾還需要 `npm run test:all` 的全瀏覽器 E2E；先前177檔／1806項只證明全套 Vitest，RTS 瀏覽器子集不能取代全站。E／F 已重新開啟，原 `release-acceptance.json` 保留為當時 checkpoint，本輪另存補充證據。

首輪全站測試揭露舊測試的固定截圖路徑會覆寫封存證據，已停止該輪，保留失敗 log。三張 tracked 統領截圖已從 `2aecd09b` 逐 byte 還原；四張未版本化的窄口起始截圖原 bytes 無法復原，新輸出已隔離並記錄 `commercial-readiness/2026-10-11/qa/project-regression-v1/overwritten-crossing-output/retention-correction.json`。窄口過橋／結束畫面、正式結果、原始音訊及其他84項索引內容未變。所有 RTS spec 的預設輸出已移到 Playwright 個別測試 outputPath，舊索引保持不變。

本輪另補取消建造退款／工人停止、Ctrl1–5群組、鏡頭輸入、重開／離開／pagehide 清理測試，26項 focused 測試通過。Fog／Hurt fixture 改用頁面實際載入的 Vite scene 模組，避免 HMR query 產生第二份類別；Chromium RTS 使用已驗證的硬體 GPU profile，非RTS瀏覽器設定保持原樣。依原規格的桌面鍵鼠範圍，手機驗證小螢幕提示與返回遊戲廳，三個桌面瀏覽器完整保留 RTS 測試。全站收集為2125項非RTS、90項桌面RTS與2項手機提示，共2217項；收集不等於執行通過。日常 `test:e2e:chromium` 指令同步保留兩個 Chromium project，修正前收集425項，修正後455項。

Bomber 桌面已啟動，但 Astro 開發工具列 entrypoint 回504；換獨立快取仍重現。暫存驗證設定停用該開發工具列，保留所有遊戲 console/network 錯誤斷言，不能宣稱預設工具列已修復。Family 測試更新已移除的主導覽入口與重複隱藏文案定位，Bomber 手機驗證既有 KEYBOARD REQUIRED／ARCADE 返回流程；focused 結果18項通過、2項沿用桌面 Firefox／WebKit 跳過。

這輪未修改正式遊戲程式或 runtime 資產；獨立檢核確認128項正式檔案 SHA 全部相符，既有 build／自然對局／效能仍對應目前 runtime。完整 `test:all` 的 Vitest 已通過179檔／1825項（121.28秒），全瀏覽器 E2E 仍在執行，不能宣稱全站驗收通過。

### 2026-10-12 全站回歸的環境停滯與最小修正

上述 `project-regression-v2` 最後停在1,105／2,217項：1,038通過、8失敗、59略過；其中RTS三桌面瀏覽器90／90通過。Astro同時無法回應本機HTTP，runner沒有繼續前進；只結束已核對歸屬的驗證程序，沒有取得完整exit／report，不宣稱全站通過。次日獨立核對22項輸入SHA全部一致，程序及4321連接埠皆已釋放，紀錄另存 `commercial-readiness/2026-10-11/qa/project-regression-v2/interruption-summary.json`；環境停滯根因仍未證實。

新伺服器將輸出導檔，排除美術工廠與暫存測試產物的監看。24項診斷為18通過、4失敗、2略過，確認Firefox的90度矩陣浮點誤差與SPJ單次滾輪未到頁尾；相應只修測試容差與等待／捲動方式。WebKit的兩個實際問題為音量首次點擊重建圖示文字節點，以及Tetris缺少WebRTC時錯誤lobby保持隱藏。

先補真實點擊／ARIA／重新開關／靜音恢復，以及WebRTC缺失時建房、加入、取消重試的測試，確認正確失敗後，正式程式僅修 `ArcadeBgm.astro` 的相同圖示不重寫、`tetris.astro` 的錯誤lobby顯示。首輪join測試定位誤寫，已另輪修正定位並重新證明lobby hidden的Red，不將定位錯誤當成產品證據。正常建房仍檢查房號；手機驗證既有鍵盤提示與PROFILE／PLAY分頁。RTS正式程式及資產未改，非RTS兩處改動需要新的驗證與build；目前六個相關spec的全瀏覽器235項仍在執行。

上述235項已結束：226通過、3失敗、6略過。失敗集中Passer測試對WebKit原生media request事件與動畫opacity精度的假設，改為實際metadata／duration及接近完成的opacity判準後，120項重跑為115通過、1失敗、4略過。唯一剩餘失敗的trace顯示外部Three／GSAP／ScrollTrigger網路失敗，`THREE is not defined`令loader保護未安裝；這是新確認的真實頁面韌性問題，不能用加長timeout掩蓋。

Tetris視覺驗證另發現錯誤文案直接顯示TypeError；先確認兩瀏覽器Red，再提供可理解的瀏覽器不支援提示。最後20項為16通過、4個行動版強制WebRTC案例依既有鍵盤限定設計略過，正常行動版提示／分頁仍實測。WebKit成功截圖已實看，錯誤提示、取消與返回重試皆通過。Passer的4個受控CDN案例先全數Red，現加入純DOM靜態正文備援、個別套件守門及無GSAP的手動voice切換；未修改人物資料、連結、圖片或正常設計。65項全瀏覽器回歸正在執行，strict TypeScript新一輪exit0；全站test:all及新build尚未完成。

Passer首輪65項為49通過、16失敗：15項是新測試錯把opacity遮罩當成display隱藏，另1項是loader已自動關閉後仍強制點擊Enter。依原契約修正測試後，第二輪63通過、2失敗，新增20個CDN案例全通過。原有WebKit1440／mobile-safari390回捲時，scrollY確實回到中點1266，但影片時間停在尾端；不能判為座標錯誤。4案例×3圈與12案例×3圈的有限診斷全部通過，沒有修改正式seek程式，也不宣稱已修此偶發失敗；正式E2E保留原10秒判準，僅在失敗後記錄trigger更新與直接seek的對照狀態。

新production build已成功（native exit0，81.828秒），strict-types-v7 exit0。2,252項瀏覽器案例的完整 `npm run test:all` 已啟動於 `2026-10-12/qa/project-regression-v3`，逐項JSONL結果與完整輸入SHA分開保留，執行期間不改來源。RTS production差異0，128個正式檔案全部matched／無缺失，共52,061,764 bytes（含7,253-byte registry）。既有音訊capture工具漏納入版控的browser／worklet兩個動態來源需隨本輪補入；配套35項測試全過，測試產物改用新暫存目錄避免覆寫歷史QA。舊版嵌套隔離目錄曾觸發Windows長路徑失敗，較短隔離及最終來源測試均通過，保留失敗log。

Guild驗證限制另記：`guild-page-verify`在repo、Windows及WSL skill目錄皆不存在，沒有拿相近的finalize skill冒充。獨立核對Hall entry、14個唯一媒體、內部連結與外部連結屬性；外部三網址因工具fetch限制未驗證live目的地，個人資料與連結均未更動。整體skill gate不宣稱通過；修正範圍的實際瀏覽器操作與受控CDN失敗已有證據。

### 2026-10-12 全站完整結果與修正複驗

`project-regression-v3` 已完整結束：179檔／1,825項單元測試通過；2,252項E2E為2,101通過、49失敗、102略過，native exit **1**，總耗時6,491.733秒。869個輸入檔案SHA於執行前後完全一致。RTS三桌面瀏覽器90項與兩個手機提示案例共92項全通過。這份原始全套結果保留，不能稱為單次 `npm run test:all` 全綠。

49項失敗已逐筆分類於 `2026-10-12/qa/full-regression-disposition-v1.json`：主要是鍵盤遊戲的手機契約、收合選單入口、單頁書本結構，以及不同時刻快照的幀差／短暫氣泡等待／超出手機畫面的固定點擊座標。相關測試保留實際手機提示、排行榜、PROFILE、返回與語言導航，書本另驗真實翻頁；Bomber仍要求共同confirmed frame的hash相同。沒有降低Passer的opacity門檻或延長等待上限。Passer本輪的影片案失敗在正向終點opacity，尚未進入反向定位；原有WebKit偶發seek風險仍未宣稱修復。

另確認兩個成員頁真實缺陷並採TDD：Passer在ScrollTrigger缺失時仍自動輪播，會覆蓋剛選取的voice；新增5.5秒持續選取與連續手動切換後先Red，再讓static fallback直接切換並停止自動輪播。Naomiao在Safari真實點擊後，入口動畫停滯會持續鎖住頁面；加入paused-GSAP與真實dblclick的Red後，以冪等入口終態、原生3.5秒timer及splash清理保證可閱讀與返回。Passer八項重點複驗與Naomiao六項複驗通過，正式人物文案、外部連結與美術均未更改。

新版全站單元179檔／1,825項通過（native exit0，156.010秒），production build exit0（77.703秒），strict TypeScript v9 exit0（6.784秒）。v8發現既有visual helper缺Page型別，僅補型別後通過；原失敗log保留。21個完整spec×所有原適用profiles共945項正在 `test-contract-validation-v1` 複驗；目前不宣稱組合驗收完成。最終集合為2,257項（新增動畫停滯案例×5profiles）。RTS正式程式與資產仍無本輪變更。

### 2026-10-12 系統中斷與正式最終全套

945項複驗已結束：834通過／5失敗／106宣告略過，native exit1，871個輸入未變。三個FFA完整spec之後以單worker重驗，3通過／12既定略過，native exit0。VIC的trace確認真實點擊確實建立14粒子，但舊測試在700ms特效消失後才查詢；改成點擊前觀察DOM新增並清理observer，保留175個案例／五個profiles及原時限，strict TypeScript v10 exit0（7.214秒）。未改VIC production。

首頁與VIC完整475項的`ui-complete-validation-v1`在325通過後受Windows關機／登出中斷：首項`Target crashed`，其後149項皆為零執行時間的worker異常退出，整輪native exit1，874個輸入不變。Windows System event1074於03:32:29.263Z啟動關機，先於03:32:35.286Z的瀏覽器崩潰，接著有登出及睡眠／恢復；見`2026-10-12/qa/ui-system-interruption-v1.json`。原Astro PID24252與4321 listener消失，僅重建本任務preview，未修改其他程式或系統設定。

獨立檢核確認原規格第150行與`docs/claude/verify.md:15`要求最後一次完整`npm run test:all`成功；來源綁定的整檔合併只能作中間診斷，不能取代此門檻。因此直接執行正式`project-regression-v4`，完整涵蓋上述中斷的兩檔、其他全站案例與全部RTS案例。`final-collection-v4`核對2,257個唯一case的project／file／titlePath／line／column均與v3完全相同；只改新輸出目錄與E2E workers2→1，Vitest維持2，原案例／profiles／assertions／timeouts／retries不變。v4執行中，E／F仍未勾選，不宣稱全綠或整體商用品味核准。

### 2026-10-12 肖像合成截圖誤判與完整重驗

v4的暫停肖像出現一次PNG精確相等失敗。保存的原始WebGL RGBA完全相同，模型姿勢、相機與viewport等狀態也相同；兩張120×216合成截圖有3,956像素不同，但4,327個變動channel皆僅差1階，alpha未變。差異位於原始framebuffer之後的頁面合成／截圖環節，確切GPU機制未證實；未修改遊戲程式或暫停行為。獨立檢核確認原encoded PNG比較過嚴，證據見`qa/portrait-comparison-fix-v1.json`。

確認本輪無法通過後，只停止本任務的npm／Playwright子程序，保留預覽伺服器。v4共記錄549項（544通過、1失敗、4既定略過），其餘未完成；原生退出碼4294967295來自主動停止，不是完整測試結果。869個來源輸入不變，原始失敗圖、JSONL、stop-request及exit均保留。

比較helper先重現1階色差與負尺寸誤判，再完成7項單元測試；正式Vitest永久納入`tests/helpers`，Playwright不會誤收。瀏覽器以Image.decode及離屏canvas解碼PNG，要求尺寸相同、完整像素資料且所有RGBA channel差值≤1；exact pose／metadata、raw差值≤1與變動比例≤0.001均保留。三瀏覽器完整肖像6／6通過，native exit0、182.609秒、871輸入不變；strict TypeScript v11 exit0。這是測試契約修正，沒有新的production修正。

正式`project-regression-v5`已啟動；`final-collection-v5`維持2,257個原案例及所有profiles／timeouts，僅肖像6個案例因helper加入而改變行號。Vitest另永久增加7項helper單元。新全套沿用1個E2E worker與2個Vitest worker，來源凍結；E／F仍等待單次完整native exit0及最後整理，不以歷史局部通過取代。

v5的180檔／1,832項單元已通過，但Firefox成員頁入口出現一次原生`locator.click` 15秒逾時，停在`performing click action`，尚未進入遮罩隱藏判斷。trace的pre-input snapshot不能證明DOM點擊已送達；約15.53秒沒有收到screencast frame，也不足以指定根因。該頁Firefox共20通過／1失敗，隨後的動畫停滯備援案例通過。保留完整失敗、圖像與雜湊於`qa/naomiao-click-triage-v1.json`；先讓本輪跑完收集其他失敗，受測來源不變，結束後再做有限輸入事件／心跳／protocol診斷。v5已不能滿足最終全綠門檻，不提高timeout、不以DOM點擊取代正式操作。

### 2026-10-12 原生點擊有限診斷與第六輪全套

v5 已完整結束：180檔／1,832項單元通過，2,257項E2E為2,135通過／121既定略過／1失敗，native exit1，11,462.031秒；871個輸入未變，RTS 92／92全部通過。唯一失敗就是上述Firefox原生入口點擊逾時，沒有其他失敗或flaky。完整結果保存於`qa/full-regression-disposition-v5.json`，不能滿足最終全綠門檻。

有限診斷以三輪×四種輸入方式、每案新context、原15秒輸入限制及retry0執行，12／12通過，native exit0、85.280秒，874個輸入與完整來源inventory均未變。9次原生輸入的27筆mouse protocol命令皆收到同session/id回應（4–138ms）；有觀測的頁面均記到click進入與production listener之後的bubble。這次隔離執行沒有重現停滯，**根因仍未確立，不宣稱修復**；fresh context及trace／protocol觀測不能還原整輪測試歷史。詳細結果與限制見`qa/naomiao-click-diagnostic-result-v1.json`，獨立唯讀檢核支持一次保持原判準的完整複驗。

正式`project-regression-v6`已啟動。收集核對全部2,257個case身分、line／column、timeouts、expectedStatus及annotations與v5完全相同，runner／config只換輸出路徑；production、assertions、retry0與1個E2E worker均不變。E／F保持未勾選，仍須本輪完整native exit0、fresh build／types、證據整理及本機commit。若相同停滯再現，停止原樣全套重試，改在完整測試脈絡診斷。

v6在Chromium的Tetris線上對戰出現兩次先後快照的confirmedFrame差11>6。為先診斷此失敗，已核對程序父子鏈與建立時間，僅停止本任務npm／Playwright子樹；preview仍保留。本輪共221案結束（220通過／1失敗），native exit1、963.307秒，871輸入未變；沒有完整report或JSONL end，**不是完整全套結果**。原始失敗trace與停止紀錄保留，詳見`qa/full-regression-disposition-v6.json`。尚未證實是同步缺陷或不同時點取樣誤判；E／F仍未完成。

### 2026-10-12 鎖步取樣修正與第七輪完整回歸

回讀v6 trace確認兩次讀取依序執行：host於453208.329–453211.818ms回cf220，guest於453213.526–453487.124ms回cf231；guest讀取約273.598ms，原先跨時間幀差≤6不能證明同時序不同步。此次沒有production同步修正，也無法事後重建v6兩端的同幀狀態。

測試改為比較共同confirmed frame的兩盤完整getState、phase／winner及雙側pendingGarbage。第一次以RAF取樣時，兩端各自每批跳6幀且固定相位不同，兩次皆沒有共同幀，保留native1原始結果。改在測試內觀察每個真正match.step完成後的狀態，原方法只執行一次並保留this／參數／錯誤，3秒／512筆有界觀測結束即還原。沒有增加模擬step或改輸入；所有共同幀必須嚴格相等，兩端皆須cf>30且持續推進，最新共同幀須仍在對局、無winner且雙盤都有真實按鍵產生的填格。

Comparator先6項Red；observer再3 fail／6 pass，最後9／9通過。正式聚焦v2兩次Chromium對戰皆通過，每次115筆／端、114個共同幀全部相等；其他profiles沿用8個宣告略過，native exit0、41.826秒、876輸入不變。strict TypeScript v15 native0、5.313秒、1,018輸入不變，獨立檢核APPROVE。原生失敗、RAF診斷、完整樣本及來源綁定見`qa/tetris-frame-fix-v1.json`；764個production／RTS資產輸入與v6相同。

正式`project-regression-v7`已啟動，來源再次凍結。原2,257個E2E身分／profiles／timeouts／annotations完全保留，只有Tetris五個profile的case行號因imports增加而移動；Vitest新增兩個helper檔、9項，預期182檔／1,841項。E／F繼續等待單次完整native0、fresh build／types與最終本機提交。先前Firefox原生click停滯仍未定因，不宣稱被這次修正解決。

### 2026-10-12 第七輪遇 Windows 重啟中斷

v7單元182檔／1,841項通過；E2E在732案後中斷，為597通過／24略過／111失敗。首錯於09:17:31.358Z為Firefox瀏覽器關閉，後110案於約2秒內皆因worker退出（3221226091）而零秒失敗；此前沒有產品assertion失敗。Windows事件顯示09:17:45.663Z啟動重啟、09:17:49.036Z關機、09:18:03.500Z開機；原runner／preview程序消失。系統事件稍晚於首錯，不能細分瀏覽器先終止或重啟流程先關閉瀏覽器的因果順序。

本輪無exit.json、完整report或ledger end，**原生退出碼未知，不得算完整exit1或通過**。復原時875個原輸入SHA均相符；Chromium與Firefox的RTS各30／30通過。原始記錄與唯讀檢核保留於`qa/full-regression-disposition-v7.json`及`qa/project-regression-v7-system-events-v1.json`。準備恢復相同preview，以新的v8輸出目錄完整重跑；不更改案例、profiles、timeout、retry0或產品來源。E／F保持未完成。

正式`project-regression-v8`已於09:47:24Z啟動，相同來源再次凍結。collection native0（16.632秒）；2,257個身分、位置、timeouts、expectedStatus及annotations與v7逐項相同，875原輸入SHA與859個source inventory路徑均吻合，獨立唯讀檢核通過。重啟後preview已確認HTTP200與正確RTS頁面節點；此HTTP檢查不取代遊戲瀏覽器測試。仍以本輪完整native0及後續fresh build／types為最終技術門檻。

v8在Firefox north-bridge案例的頁面準備階段等待`networkidle`逾時30秒；尚未執行20人fixture或通行命令，snapshot仍為正常大廳。保留trace後，核對PID、父子鏈與建立時間，僅停止本任務npm／Playwright子樹，preview與證據寫入者保留。本輪571案結束（566通過／4略過／1失敗），native1、2,505.071秒、875輸入不變，無完整report/end，不能視為完整全套結果。詳見`qa/full-regression-disposition-v8.json`；正在分析網路請求與應用程式就緒條件，尚未確認關隘模擬缺陷。E／F仍未完成。

### 2026-10-12 RTS 頁面就緒契約修正與第九輪完整驗證

v8 的 Firefox north-bridge 在 fixture 前等待 `networkidle` 逾時；trace 顯示正常 lobby、load 已完成，沒有 pageerror。三次有限 Firefox 請求生命週期觀察皆為70個請求開始／完成，無待處理請求，沒有重現歷史逾時，因此不將 HMR 或 Firefox 底層網路狀態列為已證實根因。

先寫兩個真實瀏覽器回歸：無關請求持續時 RTS 仍應可操作、RTS 模組載入失敗時靜態 lobby 不得誤報就緒。舊 `networkidle` 判準兩案皆因正確原因失敗（native1）；test-only helper 改查 DEV hook 的 `time` 方法存在（不呼叫）、lobby 可見與開始按鈕可操作後，三瀏覽器6案全通過。原七份完整spec共39案全通過，strict types native0；獨立唯讀檢核批准，所有原 gameplay／pageerror／像素／動畫斷言保留。證據為 `qa/rts-readiness-fix-v1.json`。

v9 現在以原 profiles、1個 Playwright worker、2個 Vitest worker、retry0 執行完整 `npm run test:all`；2,257個舊案例全保留，新增6案，共2,263案。尚未取得本輪結果；E／F仍未完成。仍須完整native0、fresh build／types、實際證據獨立檢核、有限交付封裝與本機commit，不push／deploy；最後一次整體品味／聽感驗收待使用者。

v9 單元182檔／1,841項通過後，Chromium Bomber solo smoke 在初始敵人數斷言讀到0（此前playing／lena／lives已通過，尚未輸入）。保留trace並核對PID／建立時間後，只停止本任務npm子樹；preview與證據寫入者保留。共87案結束（86通過／1失敗），native1、353.644秒、878輸入不變，無完整report/end，不能當作完整結果。`qa/full-regression-disposition-v9.json` 保留證據；正在判斷初始化或生成邏輯，未先放寬敵人數要求。E／F保持未完成。

Bomber 根因已確認為密集木箱造成合法出生格不足：五個固定第一層種子原先只有0～2名敵人，深層seed3也不足。先Red6fail／16pass，再限定只補基本三名敵人的可達空間，同步清除被開格的hidden道具、重算出口；足量地圖完整SHA與亂數序列不變。Bomber30檔／351項、全站182檔／1,850項、嚴格types皆native0；原Bomber跨裝置10案為4通過／6既有略過，native0。Chromium固定seed107／18各有三名敵人，原生鍵盤移動與放炸彈正常，已留截圖且主代理看過seed107。獨立審查APPROVE；歷史v9隨機seed未記錄，不冒稱重現完全相同地圖。

v10已啟動完整`npm run test:all`，保留v9全部2,263案例及metadata，878輸入綁定SHA；預期單元182檔／1,850項。完成驗證器18項、封裝檢查6項皆通過，但這些不是實際全套完成證據。仍待v10一次native0與fresh build-v10／strict-types-v19，再整理本機commit；E／F保持未完成，不push／deploy，整體人工驗收仍在最後一次進行。詳細修復證據為`qa/bomber-generation-fix-v1.json`。

最終交付指標核對：10/11的`release-acceptance.json`只作歷史單元／建置／RTS checkpoint，已由manifest的`latest_release_validation`移到`historical_release_validation`；current release指標暫為null，必須等本輪完整test:all及fresh build／types通過才可填入。`local_commit_scope`也明確區分既有d6c9c37／2aecd09b與尚待提交的本輪收尾，不提前宣稱F完成。A–D目前沒有新的反證；人工整體視覺、操作、兩圖聽感及效果混音仍留到最後一次驗收，既有四張自然勝負圖只證明結算結果，不取代完整組裝畫面的美術驗收。

v10 單元182檔／1,850項通過；E2E在Firefox naomiao77入口遮罩檢查失敗後，依PID／建立時間核對停止本任務npm子樹並保留preview。806案結束（781通過／24略過／1失敗），native1、4,695.862秒、878輸入不變，無完整report/end。此次原生click已返回，接著toBeHidden於10秒逾時，與v5原生click本身逾時不同；較晚截圖已顯示主頁，仍不能證明準時完成。根因未確立，先有限記錄事件、3500ms計時器、GSAP收尾及頁面／host心跳，不放寬斷言、不宣稱修復。詳見 `qa/full-regression-disposition-v10.json`；E／F及整體人工驗收保持未完成。

Naomiao v2有限診斷6／6通過（46.657秒、native0、881輸入不變），仍未重現v10。三次儀器化原生點擊皆送達同一入口，建立timeline並排3500ms fallback；正常動畫於點擊後1,423～1,500ms隱藏遮罩／解鎖body，未出現pageerror或十秒級心跳停頓。觀測在fallback及整段timeline結束前完成，因此不能外推故障時的收尾能力；細節及診斷工具兩項guard限制保留於 `qa/naomiao-click-diagnostic-result-v2.json`。不改產品／正式斷言，下一步改查有界前序頁面或排程情境，不將診斷通過当作修復或重啟完整門檻的理由。

Firefox 前序診斷 v3 原定保留正式集合中的317個前序案例，再執行兩個儀器化 Naomiao 案例，共319案，觀察長時間 worker 是否影響入口。這是有50分鐘上限、886輸入凍結的有限診斷，不替代完整 `test:all`；啟動紀錄、collection 與 ledger 保留於 `qa/naomiao-prefix-v3`。下段記錄後續發現的設計缺陷。

Naomiao prefix v3 因診斷設計無效而主動停止：267案結束（243通過／24既有略過），native1、2,058.951秒、886輸入及 inventory 不變，尚未執行目標案例。目標的 `trace:on` 與前序的 `retain-on-failure` 不同，而 Playwright trace 屬於 worker scope，進入目標會更換 worker／browser，無法檢驗原定的長時間使用情境。原啟動審查結論已明確撤回，停止及原因見 `qa/naomiao-prefix-disposition-v3.json`；後續改以實際 collected worker hash 驗證，不沿用無效結果。

Naomiao prefix v4 保留317個前序與2個目標，移除目標的 trace 覆寫。以 Playwright 實際 collection 驗證：v3 的兩個 worker hash 觸發 Red（native1），v4 的319案只有一個 hash，Green（native0）。reporter guard 另經 Red／Green，無效 pool 即使測試本體通過仍回傳 native1；有效319個 fixture bodies 與 strict types 皆 native0。正式診斷 onBegin 再確認319案同 pool，凍結887輸入、50分鐘上限、無 retry；持續記錄 PID／建立時間／資源。此診斷不包含此前 Chromium 的 host history，限制保留於證據。

Naomiao prefix v4 結束為 native1、2,830.124秒，319案為294通過／24既有略過／1失敗，887輸入不變。317個前序與2個目標皆使用 worker0；PID39980及建立時間相同，目標開始時 worker 已運行約45:54／46:14。兩個原始產品斷言均通過，唯一失敗為 afterEach 診斷擷取超過2秒期限。protocol 顯示 browser dump 分別於22ms／104ms返回，後續 trace snapshot 等待超時；使用安裝版本的官方 serializer 復原資料，ARCHIVE 與原成功擷取內容 deepEqual。點擊後1,492ms／1,456ms遮罩隱藏且 body 解鎖，無 pageerror。原 failed JSON 與 native1 如實保留於 `qa/naomiao-prefix-disposition-v4.json`；不能據此宣稱修復V10或完成發布門檻。有限診斷結束，不再重跑前序；下一步執行完整V11。

v11 已啟動完整 `npm run test:all`。fresh collection 的2,263案完整保留v10的 identity／location／timeout／expectedStatus／annotations 及六個 profiles；凍結878輸入，875個共用輸入SHA未變，另三個為新版 runner／config／contract。保留60個 runtime timeout 宣告、1個E2E worker、0 retry。V11 的18項 finalizer guards、7項 package guards 與 config types 皆 native0，啟動前獨立審查通過；這些僅准許啟動，不是全套完成證據。v4 不列為產品修復；仍須一次完整native0，再執行 fresh build-v11／strict-types-v20、實際證據獨立檢核及本機commit。E／F與最後一次整體人工驗收仍未完成，不push／deploy。

v11 在 Firefox Naomiao 的 cat-counter 案例再次出現入口遮罩可見性逾時；此前 ARCHIVE 與 Made with 兩個原目標均通過。原生 click 已返回，beforeEach 的 toBeHidden 仍於10秒失敗。核對PID／建立時間後只停止本任務npm子樹，保留preview及證據寫入者；814案結束（789通過／24略過／1失敗），native1、5,118.631秒、878輸入不變，無完整report/end。單元182檔／1,850項、Chromium一般433案及Chromium／Firefox各32個RTS案例通過，皆只作部分證據。較晚失敗截圖已顯示主頁，不能單憑截圖證明期限內隱藏；資源快照也不等於記憶體洩漏或逾時根因。詳見 `qa/full-regression-disposition-v11.json`。先比對本次精確trace，再設計同一長時間worker連續多次原始入口操作的有限診斷，避免afterEach trace snapshot干擾擷取；不直接重跑v4或全套，不改原始斷言／期限。E／F及最後一次整體人工驗收仍未完成。

2026-10-13：Naomiao prefix v5 有效重現同類原始斷言失敗。精確317個前序後，12個目標中的前8個通過、第9個失敗，依 maxFailures1 停止；326案為301通過／24既有略過／1失敗，native1、2,894.359秒、898輸入不變，9份串流皆有效且已關閉。失敗案的 trusted click 後1,491ms，頁面已記錄遮罩隱藏與 body 解鎖，約早於10秒期限8.68秒；該事件卻延遲15,287ms才到主機。頁面及 Node 心跳持續，trace 可見輪詢與 screencast 同時斷流，較支持 Firefox／Playwright 通訊或錄製路徑停頓，不能再把此次逾時歸因於產品動畫未完成；仍未區分精確底層原因。獨立稽核與原始時鐘對齊見 `qa/naomiao-prefix-disposition-v5.json`。

v6 已啟動一次有限單變因對照：相同317前序＋12目標、串流、影片、worker／retry／停止條件與原始10秒斷言，只將診斷額外的 `retain-on-failure` 恢復為正式 `on-first-retry`。329案 collection／單池、17項診斷 guards 與 types 通過，893輸入凍結；尚未取得終局結果。0 retry 下不會產生首次失敗 trace，原始串流與影片仍保留。V12 的2,263案候選集合及收尾工具已準備，但未建立正式啟動契約、未執行完整測試或最終封裝。E／F、fresh build／types、本機commit與最後一次整體人工驗收保持待辦。

v6 後續在第3次入口操作重現原始10秒遮罩斷言失敗，依 maxFailures1 結束：320案為295通過／24既有略過／1失敗，native1、2,616.857秒、893輸入不變；3份擷取皆有效／已關閉且同worker／PID，沒有任何trace檔。失敗案在點擊後1,497ms已隱藏遮罩，該事件僅延遲20ms送達；之後其他事件卻積壓最長14,790ms，頁面／主機心跳仍持續。這反駁了「額外trace是此類失敗必要條件」，不能再以移除trace作為已證實修復。第2案的19.393秒大部分發生在觀測hook之前，需進一步縮小Firefox／driver／錄影路徑的重現情境；尚未證實錄影是原因。證據與有效性獨立稽核見 `qa/naomiao-prefix-disposition-v6.json`。V12完整門檻未啟動，E／F與整體人工驗收仍未完成。

v7a 縮為1個原前序＋12次原入口操作，保留正式錄影／trace設定，13案全部通過，native0、59.206秒、893輸入不變。12份擷取有效且已關閉；頁面到主機最大延遲142ms、觀測hook前延遲230～425ms、點擊到隱藏1,413～1,608ms，沒有達到預先設定的診斷信號。因此依分階段規則不啟動v7b錄影關閉對照；獨立稽核見 `qa/naomiao-prefix-disposition-v7a.json`。這只證明短程新worker未重現，下一步分離context／錄影累積與長前序的影響，不據此宣稱修復或啟動全套。E／F與整體人工驗收仍未完成。

v8a 壓縮生命週期診斷因第三批20次操作超過既有單案60秒上限而無效：5通過／1逾時，native1、177.264秒、909輸入不變。60次嘗試中59次完成，59份影片皆可解碼59～128影格；3個原始入口checkpoint通過，但不能把不完整實驗算成陰性。原始失敗及獨立稽核保留於 `qa/naomiao-lifecycle-disposition-v8a.json`、`qa/v8-terminal-v9-preflight-review.json`。

獨立決策改採一次v9：以有效重現的v6為正對照，保留精確317前序＋12目標與原斷言／期限，只關閉Firefox錄影；啟動環境確認 `PW_TEST_REUSE_CONTEXT` 為空，避免同時改變context重用。329案單池、17項guards及types通過後啟動，893輸入凍結，尚無終局結果。`qa/naomiao-v9-bounded-decision.json` 固定後續有限分支：有效完整且無5秒訊號才可調整正式Firefox錄影設定；同類失敗則保留錄影、隔離該Firefox spec到fresh worker，驗證每案恰好一次後進全套。V13僅準備收尾工具，完整門檻、E／F及整體人工驗收仍未完成。

v9 長序列對照完成：317個原前序＋12個目標，共305通過／24既有略過、native0、1,259.18秒、893輸入與inventory不變；12份擷取皆valid／closed，同worker／PID30628，通訊延遲最高235ms、觀測開始延遲584ms、遮罩隱藏1,407～1,595ms，沒有預定5秒級訊號，長路徑155檔中無影片。獨立檢核批准僅Firefox project關閉錄影作為操作性處置，不宣稱唯一根因或產品修復。原分析的「Short prefix」與pending approval欄位於 `qa/naomiao-prefix-disposition-v9.json` 澄清，原檔保留。

V13現已啟動一次完整 `npm run test:all`，880輸入凍結、1個E2E worker、0 retry；2,263案的identity／location／timeout／expectedStatus／annotations與V11完全相同，其他五個profile的錄影設定保留。收尾工具補上base原始內容／限定差異、resolved設定與正式run來源SHA的完整綁定；11項mitigation、23項finalizer與9項package檢查通過，actual preflight獨立審查批准。這些是啟動證據；仍待本輪完整native0、fresh build-v13／strict-types-v22、實際證據審查與本機commit。E／F及最後一次整體人工視覺／操作／聽感驗收維持未完成，不push／deploy。

2026-10-15：全模型與必要骨架整批修正完成，已套入本機 RTS runtime。34 組模型／46 個 GLB 全部逐項驗收；實際修正 12 組／19 檔，其餘合格來源保留。修正涵蓋握劍／持斧／持杖的閉合手掌與袖口、弩兵肩骨與雙手持弩、騎士與馬匹骨架／馬鐙／韁繩、攻城機車軸連動、建築頂飾及廢墟接地。8 種動態單位共 47 段動畫、兩級 LOD 的 94 組地面掃描通過；來源、304 張模型驗收截圖與獨立審查均綁定實際 SHA。

本輪實測：全專案 Vitest 184 檔／1,870 項、資產工具 44 項、發布後來源／合併回歸 68 項、Chromium 遊戲 E2E 32 項全通過；strict RTS TypeScript 與發布後 build 通過。整批遊戲畫面測試第一次因 Chromium 在截圖時關閉而失敗，原紀錄保留；隔離重跑完整通過，未放寬產品斷言。實際 HTTP 46 檔與 built output 均匹配核准 SHA。80 單位／20 建築／騎士頭像、1920×1080 DPR1 正式 production-mode fixture 的中位數 58.4795 FPS、P95 23.9ms，量測與來源追溯全部通過。這是目前原始碼的 production-mode esbuild fixture 加建置頁面，並非 Astro game chunk 的位元完全相同副本。

效能調整保留完整模型與逐幀骨架：相容蒙皮批次合併 draw calls，遠景陰影以 30Hz 更新、近景逐幀；360 個連續移動／攻擊／死亡畫面與獨立視覺複查通過。所有測試瀏覽器皆靜音。本次完成範圍是 Windows Chromium 的本機模型包；不等於全站跨瀏覽器發布、使用者美術核准或其他商業授權完成，未 push／deploy。總驗收：`art-factory/rts/runs/all-models/2026-10-14-v1/qa/delivery.json`、`qa/test-results.json`。遊戲 `http://localhost:4321/games/rts`；34 組模型／骨架／動畫／LOD 整體檢視 `http://localhost:4338/`。

2026-10-15 整批發布後再驗：目前來源與模型在河谷／山隘均完成自然玩家勝利（06:15／08:25）及 AI 對閒置玩家勝利（06:42／07:16），三份獨立程序結果皆 native0，110 個來源／模型／測試輸入前後 SHA 不變。玩家實際採集、建造、訓練及指揮，沒有注入資源、HP 或勝負。河谷與 AI 使用固定 tick 快轉，山隘玩家使用既有正常時間模式；較早兩次山隘快轉自然敗北完整保留，不當成通過，也不將後續勝利誤稱已修復遊戲缺陷。戰役使用 current-source dev，正式建置另有兩圖實際 HTTP 載入驗證。

正式建置遊戲資產 gzip 傳輸為 28,766,187／29,320,641 bytes，全頁本地傳輸 29,031,533／29,585,987 bytes；102／100 項資產與 public、build 檔案 SHA 均一致，無候選覆寫或頁面錯誤。127 個 runtime 資產來源完整，19 個變更 GLB 的可編輯來源及匯出證據逐一符合 SHA；54 項來源回歸＋14 項蒙皮合併測試再次全部通過。文件更新最新 Blender 來源與量測條件，下載與來源政策報告經獨立唯讀審查批准。完整證據在 `art-factory/rts/runs/commercial-readiness/2026-10-15/qa/current-gameplay/`；原始全站 `test:all`、最後使用者整體接受及本機收尾 commit 仍未完成，沒有推送或部署。
