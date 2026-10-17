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

# RTS 收尾計畫（Claude 接手 Codex session 01a105df）

2026-10-13 UTC17:23 V18 已保護性停止，session26099 關閉：182 檔／1,850 單元全通過；第 1 個 E2E 的零 PCM 預熱因 ancestry Owned、Job membership Out 的矛盾失敗，正式預熱成功數為 0，沒有完整 report、ledger end 或 inner exit。guard 本次自行 native1，非成功後 SIGTERM；supervisor／quiet 均 native1，161.201920 秒，Job 清理前後 active0。全部 2,881 輸入／2,411 runtime／6 執行檔與契約／審查不變。後續不含瀏覽器或音訊的程序鏈實驗已證明 Node→目前 WindowsApps Python 及 assigned Python root→Node 會出現 In→Out；直接 backing module 亦同，Node→Node control 保持 In。這是精確啟動路徑的觀測，未宣稱 Windows 內部根因。保留 V18 與候選原檔，下一步評估只把正式 runner 改為 Node，靜音／Job 守門不變；不自動重跑全套。見 `qa/full-regression-disposition-v18.json`、`job-chain-v1-attempt2/`、`job-chain-v2/`。E／F 與人工驗收仍待完成。

2026-10-13 UTC17:20 V18 已啟動，正式 npm 於 UTC17:21:09 開始：Job 零音訊整合的實際結果已獨立核准；新版 102 案離線檢核、2,263 案列舉與 strict types 通過，兩份來源審查及精確契約啟動審查均通過。2,881 輸入／2,411 runtime／46 runner／6 執行檔凍結，完整原測試數與 workers1／retries0／maxFailures0、五小時界限不變。專屬 Job 在 root Resume 前完成綁定，外部程序零寫入，未知／矛盾仍停止。tool session26099 執行中，完整結果、fresh build/types、實際結果審查及本機提交尚待完成；E／F 與人工整合驗收維持未完成，不 push／deploy。見 `qa/final-full-run-contract-v18.json`、`full-run-preflight-review-v18.json`、`project-regression-v18/`。

2026-10-13 UTC16:50 Job零音訊整合已完成：8案全通過，44.835860秒，child／quiet／supervisor native0，無guard error；14個session的Job／FILETIME／靜音readback均有效且全previouslyMuted，12次warmup及兩lifecycle gate完成。guard是成功child後SIGTERM清理，Job清理前後均0個active process；2791輸入／2411runtime／6執行檔與契約及review SHA不變。見`qa/quiet-job-v1/integration-disposition.json`。下一步獨立actual result review，再準備V18的原完整test:all及Job證據契約；尚未重跑全套，E／F與人工驗收仍未完成。

2026-10-14 下一有限里程碑：Windows Job候選已完成無音訊TDD與接線，12原生程序／9原生membership／3supervisor／21JS測試通過；58fake mute、原32mute／1102ancestry assertions與9離線runner情境亦通過。具體單次全零PCM整合契約為`qa/quiet-job-v1/integration-contract.json`，2791輸入、2411runtime、4variant共8案、180秒、workers1／retries0；當時只列舉與--check通過，正在做獨立啟動檢核。測試程序必須在Resume前加入專用Job，外部程序零音訊寫入；unknown與矛盾仍fatal。不需要使用者安排整段排他時段，不直接重跑完整套件。E／F、fresh build/types、本機提交及人工整體驗收維持未完成。

2026-10-13 UTC15:50 V17已中止並關閉session60240：單元182檔／1,850項、瀏覽器160案通過，但第161案無結果，沒有完整report、ledger end或inner exit。活著的音訊PID20260缺少父程序3620建立時間，守門依原規則停止；事後查詢與外部dnplayer.exe高度相關，不能用opaque instanceId或exe白名單代替歸屬證明。quiet／launcher native1，guard是失敗後SIGTERM清理；2,756輸入、2,411runtime與6執行檔不變。證據見`qa/full-regression-disposition-v17.json`。下一個有限里程碑為獨立結果檢核及不含音訊的Windows Job身分／隔離測試；候選先TDD與安全檢核，再考慮零音訊整合，不自動重跑全套。E／F與人工驗收仍未完成，不push／deploy。

2026-10-13 UTC15:37 V17已啟動：exact contract review批准，launcher --check為0；兩份新的fresh程序清冊確認零測試瀏覽器／Playwright worker後，執行唯一完整test:all。沿用全部靜音、精確歸屬與生命週期防護，2,756項輸入凍結，原1,850單元／2,263瀏覽器案例、workers1、retries0、maxFailures0不變，五小時外層界限。tool session60240正在執行，尚無完整結果；任何guard failure立即停止本輪owned tree，不自動重跑。E需本輪完整native0＋fresh build/types及獨立結果檢核，F需實際本機提交；人工整體驗收仍未完成，不push／deploy。

2026-10-13 UTC15:31更新：V17具體審查的maxFailures紀錄缺口已修正，完整測試維持原本0設定，finalizer拒絕contract／resolved／report不一致、缺欄及布林值。新增3項回歸先Red後Green，最新共81項離線檢查通過，來源複審批准；2,756項輸入的新契約SHA為`5fb4224cd4037317fe93861383bda72d18bc5a3d1f3b324a75b4b884ba66edd5`。另一工作目前仍在測試，未啟動V17；具體啟動核對與fresh空程序清冊仍待完成，不再等待使用者排程承諾。E／F及最終人工整體驗收未完成。

2026-10-13後續方向：原始session輸出已將同時執行的CS WebKit worker PID18488對上V16未知音訊祖先鏈，形成並行干擾的強證據；PID61068的直接建立身分與唯一根因仍未證實。獨立檢核已撤換「需使用者協調整段全機排他」的多餘條件，改為啟動前fresh程序清冊確認無其他測試瀏覽器／Playwright worker、本thread只啟動一次五小時有界且零retry的完整驗收。全部quiet／lifecycle與unknown-fatal防護保留，不控制其他程序；外部工作稍後開始仍可能造成保護性中止且不得自動重跑。證據見 `qa/v16-concurrent-test-correlation.json`、`v17-nonexclusive-direction-review.json`；仍需具體契約啟動檢核。

V17最新來源已重跑26／34／14／4個工具回歸通過，strict types及原2,263案列舉的來源雜湊仍有效；直接沿用V16主要validators與既有guard／lifecycle。原2,669個輸入、2,411個runtime檔案及6個執行檔保持不變。九份V16原始證據的凍結缺口已Red／Green修正，排程表述更新後的來源複審批准。UTC15:20的fresh程序清冊為零測試瀏覽器／worker，預覽九個HTTP路徑回應200；正準備凍結契約與具體啟動檢核。`qa/final-tools-v17-preparation/summary.json`及`source-review.json`記錄實際離線結果，不代表完整驗收。

2026-10-13最新狀態：V16於臺北時間22:20因音訊程序歸屬不明而保護性中止，launcher／quiet wrapper皆native1，tool session 74388已關閉。單元182檔／1,850項通過；E2E完成106／2,263案且全通過，第107案未完成，無report／ledger end／inner exit。PID61068在Inactive快照中缺少起始時間，不能確認建立來源或全程無聲；不放寬unknown-fatal判定。獨立結果檢核及事後2,669個輸入／2,411個runtime檔案／6個執行檔重驗已完成，來源不變。74個工具測試與預檢通過不能取代完整test:all。下一步唯讀追查精確程序來源，不直接重跑；E／F與最終一次整體人工驗收仍待完成，不push／deploy。證據在 `qa/full-regression-disposition-v16.json`、`full-regression-result-review-v16.json`、`project-regression-v16/`。

> 接續 `2026-10-08-rts-commercial-readiness.md`。授權沿用使用者原需求及「全部修完達到商用水準再叫我看」。主代理（Claude）只拆解、指揮、審核；實作由 subagent 執行，同一時間每組檔案只有一個寫入者。

**接手前備份：** `refs/backup/codex-handoff-2026-10-09`（e59d9ee），內容是 10-06 之後所有未提交的原始碼、文件、測試、runtime 資產與工具。不含 `art-factory/rts/runs`、`.blend` 與 `node_modules-shared-link`；這些仍留在磁碟上。

## 驗收標準重新定錨

先前人物工作卡在毫米級的腕縫與袖口接觸迭代：衛兵手部 v1–v5f 全部 finite-fail，進度停滯好幾天。實測遊戲畫面，人物在最大縮放下約 40 px 高，近距離畫面只有 `portrait.ts` 的即時肖像。因此人物美術的驗收改為：

1. **遊戲鏡頭**：1080p、預設與最大縮放下，五個動作都要剪影清楚，兵種可以辨識，握持時武器不脫手、看起來不浮空，腳要貼地。
2. **肖像鏡頭**：以 `PORTRAIT_FRAMING` 的實際框構圖做 Idle 循環檢查，不能有明顯穿模、破面、拉伸或缺貼圖。
3. **來源**：runtime 不得含有 Hunyuan 衍生幾何。TripoSR（MIT）的本機生成身體可以保留，但要在 provenance 中記錄。
4. 只有在上述兩個鏡頭下看得到的缺陷才算 blocker；任何量測都要附上該鏡頭的截圖證據。

## 工作項

- [x] **A. 來源清理**：worker／crossbow 的握把與 guard 的手、靴子、腿甲已換成原創程序化來源，runtime／registry／provenance 已更新並經 gameplay／portrait 驗收。10-11 Work／Cast 衍生版仍追溯同一來源並保留幾何 denylist 回歸，來源測試53項通過。
- [x] **B. 建築摧毀**：已接入通用沉降、傾斜、揚塵 FX 與依佔地縮放的兩種原創瓦礫。12 棟的摧毀、暫停、重開與 dispose 已納入三瀏覽器驗證；10-11 完整 RTS 基準69／69通過。
- [x] **C. HUD 指令卡**：目前 `hud.ts`／`input.ts` 已採 WC3 式「建造」子選單、B／Esc 切換，以及最多12格的固定三列。早期 `natural-command-layout-independent-review.json` 是同區域13指令版本的歷史證據；最終現檔有 submenu，不能沿用舊報告描述。10-11的全套與三瀏覽器基準已涵蓋現版。
- [x] **D. 對局品質**：狹口群體移動、AI 全科技流程、兩張地圖實際打到自然勝負。10-11 四個 20 人窄口案例通過；玩家 river 6:42／pass 9:12、AI river 6:20／pass 6:37，來源與結果見 `commercial-readiness/2026-10-11/qa/final-natural-campaign.json`。AI 勝利對手為不操作的玩家，不宣稱競技平衡。
- [ ] **E. 技術發布門檻**：RTS三瀏覽器、正式效能與兩圖下載已有通過證據；最終全站`npm run test:all`仍須取得一次native exit0。full v3為exit1，整檔複驗與合併工具只作中間證據，不取代原完成契約。10/12 UI複驗受Windows關機／登出中斷，原紀錄保留。full v4確認肖像合成截圖的1階色差誤判後主動停止，549項已結束（544通過／1失敗／4略過），native 4294967295，不能算完整執行。修正僅容許解碼PNG最多1階色差，模型姿勢與原始WebGL嚴格檢查保留；7項單元與三瀏覽器完整肖像6項皆通過。完整v5為180檔／1,832項單元通過、2,257項E2E中2,135通過／121略過／1個Firefox原生click逾時，native1；RTS 92／92通過。有限輸入／心跳／protocol診斷12／12通過但未重現，根因未確立，不宣稱修復。正式v6因Chromium Tetris兩次快照幀差11>6而主動停止；221案為220通過／1失敗，native1、871輸入不變，但沒有完整report/end。trace證實跨時間取樣，已改成觀察原始模擬步驟、比較全部共同confirmed frame完整state；9項helper、兩次Chromium各114個共同幀及strict types通過，production未改。v7於Windows重啟期間中斷：597通過／24略過後出現瀏覽器關閉與110項零秒worker退出；沒有exit/report/end，不能視為完整結果。復原875輸入SHA一致，v8於Firefox north-bridge頁面準備等待networkidle逾時後停止；566通過／4略過／1失敗、native1、875輸入不變，無完整report/end。已修正test-only RTS就緒契約：兩案Red後三瀏覽器6案與原七spec39案全通過、types0，原產品／斷言不變；歷史網路底層觸發未重現。v9共2,263案於Chromium Bomber初始敵人數為0失敗後停止：86通過／1失敗、native1、878輸入不變，無完整report/end；已確認密集木箱造成敵人出生格不足，限定補基本三人；Red6fail後Bomber351項、全站1,850項、固定種子瀏覽器操作、types與原跨裝置4通過／6既有略過均通過。v10於Firefox naomiao77點擊返回後遮罩可見性逾時停止：781通過／24略過／1失敗、native1、878輸入不變，無完整report/end；根因未確立，先有限診斷，仍須後續一次完整native0及fresh build／types。商業聽感與使用者整體品味仍未批准。
- [ ] **F. 整理 commit**：程式／正式資產／可編輯來源已整合為本機 `d6c9c37`，既有文件／證據為 `2aecd09b`；本次收尾稽核的測試與證據補充尚待驗證後提交，不推送。大型原始錄音、sample ledger、Chrome trace仍留在本機；舊測試覆寫四張非必要起始截圖的保存缺失另有 `retention-correction.json`，不改寫原索引。整體驗收一次進行，聽感仍明示未經工具批准。

## 已撤回的疑點

- 2026-10-09 18:5x 曾懷疑「開局 1.5 分鐘被判負」。兩次重現都沒有發生；原因是截圖間隔了十多分鐘真實時間，玩家沒有操作，被 AI 正常擊敗。這不是 bug。

## 2026-10-11 狀態核對

Codex 接手後由主代理整合與寫入，子代理唯讀調查／獨立檢核；頁首的 Claude 派工敘述是原交接背景。A–C 已依現檔、測試與獨立 crosswalk 確認完成，沒有因舊 checkbox 重做素材或 UI。

D 的四窄口×20衛兵群體回歸、實際瀏覽器群組操作與 AI 付費三級科技測試通過；Hurt／Work／Cast 新版的自然玩家與 AI 兩圖勝負也已全部通過，玩家錄音兩份原始 PCM 機械 QA 完整。E 的祭司步態修正版為174檔／1787項、strict TS／build／三瀏覽器皆通過，下載 river／pass 27.64／28.19 MB；最新兩輪正式效能 median／p95 達標，但最大單幀551／675ms未通過500ms限制。後續 heartbeat 診斷在549ms RAF停頓中仍持續執行25ms timer，接著追查瀏覽器繪圖排程，尚無已證實的 production 修正。音訊聽感受工具輸入限制、最終 readiness 證據收斂仍未完成。F 尚未執行，不 push／deploy；整體使用者驗收仍在最後一次進行。

後續依原始 spec:148 校正驗收工具，保留上述歷史結果。正式60.13秒為57.80FPS／p95 28ms，最大timer lateness368.7ms／Long Task203ms，全數通過；checker經先紅後綠與獨立審查，沒有降低500ms限制或修改production。全套177檔／1806項以JSON reporter確認成功、native exit0（93.36秒）。F進入有限來源封裝與本機提交；兩圖聽感仍無法由工具回讀，將留到一次整體驗收，不冒稱商用品味核准。

2026-10-12：v4 同一個長時間運行的 worker 中，兩個 Naomiao 原始斷言均通過；唯一失敗為 afterEach 診斷擷取逾時，native1如實保留，不宣稱修復v10。v11 已啟動完整2,263案、凍結878輸入，原案例與斷言均保留。E／F仍未完成；尚需一次完整 `test:all` native0、fresh build-v11／strict-types-v20、實際證據獨立檢核與本機commit，最後一次整體人工驗收仍待進行。

v11 後續於 Firefox Naomiao cat-counter 的原始入口隱藏斷言失敗後停止：789通過／24略過／1失敗、native1、878輸入不變，沒有完整report/end；前兩個原目標與Chromium／Firefox各32個RTS案例通過，不取代完整門檻。根因仍未確立，正在讀本次trace並規劃同worker多次入口的有限診斷。E／F保持未完成，不啟動新的全套重試、不放寬期限或斷言；尚待完整native0、fresh build／types、封裝檢核、本機commit及一次整體人工驗收。

2026-10-13：v5 串流診斷有效重現第9次入口斷言失敗：301通過／24略過／1失敗、native1、898輸入不變。頁面於點擊後1,491ms已隱藏遮罩，但事件延遲15,287ms才送至測試主機；頁面／Node心跳持續。獨立稽核支持通訊／錄製路徑停頓，尚未確立唯一底層原因。v6 正執行同317前序＋12目標、同串流與期限的單變因對照，只恢復正式base trace設定；尚無終局結果，不宣稱產品修復。V12候選工具僅已準備，完整測試未啟動，E／F與一次整體人工驗收仍未完成。

v6 終局仍在第3次入口出現相同原始斷言失敗：295通過／24略過／1失敗、native1、893輸入不變、3份擷取皆有效且無trace。遮罩於點擊後1,497ms已隱藏並及時送達，後續事件仍有14,790ms通訊積壓。額外trace並非必要原因，需先縮小Firefox／driver／錄影路徑診斷；不把移除trace當成產品修復，也不據此啟動V12。E／F與整體人工驗收維持待辦。

v7a 短程13案全部通過，native0、59.206秒、893輸入不變；12份有效擷取的最大通訊延遲142ms，未出現預定信號，因此不啟動v7b。短程通過不能排除長前序累積問題；改採有界的context／錄影生命週期診斷，完整門檻仍待通過，E／F與一次整體人工驗收不變。

v8a 因壓縮批次超過單案60秒預算而無效，native1、5通過／1逾時、909輸入不變，不能當陰性。獨立決策批准一次v9 exact317＋12錄影關閉對照，保留原始斷言／期限並固定不重用context，893輸入凍結；尚無終局。依實際結果選擇Firefox錄影設定或fresh worker隔離，再重建完整collection／契約進一次全套；不擴張無限診斷。V13收尾工具僅為候選，E／F與整體人工驗收維持待辦。

v9 長序列對照完成：317個原前序＋12個目標，共305通過／24既有略過、native0、1,259.18秒、893輸入與inventory不變；12份擷取皆valid／closed，同worker／PID30628，通訊延遲最高235ms、觀測開始延遲584ms、遮罩隱藏1,407～1,595ms，沒有預定5秒級訊號，長路徑155檔中無影片。獨立檢核批准僅Firefox project關閉錄影作為操作性處置，不宣稱唯一根因或產品修復。原分析的「Short prefix」與pending approval欄位於 `qa/naomiao-prefix-disposition-v9.json` 澄清，原檔保留。

V13現已啟動一次完整 `npm run test:all`，880輸入凍結、1個E2E worker、0 retry；2,263案的identity／location／timeout／expectedStatus／annotations與V11完全相同，其他五個profile的錄影設定保留。收尾工具補上base原始內容／限定差異、resolved設定與正式run來源SHA的完整綁定；11項mitigation、23項finalizer與9項package檢查通過，actual preflight獨立審查批准。這些是啟動證據；仍待本輪完整native0、fresh build-v13／strict-types-v22、實際證據審查與本機commit。E／F及最後一次整體人工視覺／操作／聽感驗收維持未完成，不push／deploy。

V13終局（2026-10-13臺北時間06:44）：本輪完整跑完，單元182檔／1,850項通過；E2E 2,263案為2,141通過／121既有略過／1失敗，native1，11,350.501秒，880輸入不變、0 retry／flaky。Chromium／Firefox／WebKit的RTS各32案全通過；唯一失敗為mobile-safari下Passer 1440px影片回捲，10秒opacity>.99斷言最後取樣0.9003，其他九組寬度／瀏覽器組合通過。完整report／ledger／截圖／影片已保留，見 `qa/full-regression-disposition-v13.json`。無法由單次末值認定永久停滯，下一步為一次原前序時間線baseline，分開記錄捲到底、reveal開始與opacity到1；先被動觀察再考慮受限診斷介入，只有證據成立才做第二次背景影片對照。不放寬門檻，不盲目全套重試；本輪不能啟動成功收尾工具，E／F與一次整體人工驗收仍待完成。

V14啟動（2026-10-13）：Passer v2的353案baseline已有效通過並經獨立檢核，依預定分支停止診斷；未做產品修復或背景影片對照。遵守使用者「測試不要發出聲音」，四種測試瀏覽器採精確程序範圍的靜音保護，無聲素材實測與故障停止檢查通過後，才啟動新一輪完整 `test:all`。本輪922輸入凍結、原2,263案及metadata不變；6項接線檢查、25項finalizer、9項packager及型別檢查通過，actual preflight批准。正式結果仍待完成，內外層皆native0才可進fresh build-v14／strict-types-v23與後續提交；E／F及最後一次人工整體驗收保持未完成，不push／deploy。

V14中止（2026-10-13臺北時間17:40）：單元182檔／1,850項通過，瀏覽器86案通過；第87案Tetris FFA執行中，靜音保護因PID40616的Inactive音訊工作階段無法確認所屬程序而停止，外層native1。沒有瀏覽器end或內層exit，不補造終局、不執行成功收尾；922輸入不變。未記錄到遊戲斷言失敗，事後唯讀查詢無殘留工作階段，程序退出競態尚未證實。先加入不改變判定的有限診斷，再以全零音訊檢查context建立／關閉；保留未知來源即停止及原靜音保護，不直接重跑全套。證據見 `qa/full-regression-disposition-v14.json`，E／F與整體人工驗收保持未完成。

靜音歸屬短程診斷（2026-10-13）：獨立副本新增同snapshot的具體失敗位置、擷取例外與可解析error紀錄；1,102項診斷及原32項保護檢查通過。經獨立檢核的一輪全零音訊測試為四種瀏覽器4案通過，headless同browser的兩個anchor持續運行、第三個context關閉重建12次，outer native0、無guard error、原922輸入不變。僅觀察到一個headless音訊PID，未重現V14，不能宣稱原生程序退出競態已排除。下一步準備原V14 Chromium順序至第87案、加其餘三variant後續零音訊確認的有限診斷；完整套件尚未重啟，E／F仍未完成。證據見 `qa/quiet-ownership-v2/disposition.json`。

原前序有限重現（2026-10-13）：13項啟動工具檢查通過，經獨立檢核僅執行一輪。保留原unit／npm程序鏈及Chromium87案順序、metadata、期限，再接三個零音訊探針；單元182檔／1,850項與瀏覽器90案全部通過，quiet／inner／outer皆native0。前87案同workerIndex0／parallelIndex0／retry0，第87案47.936秒通過，四種瀏覽器完成靜音確認、無guard error。1,024項輸入（含全部901個source、25個本地音訊／影片及原V14的922項）保持不變。未重現未知歸屬，不能宣稱根因或產品修復。實際結果已獨立批准，下一步只準備一次完整2,263案preflight，沿用診斷guard並凍結全部src／tests／public檔案，具體啟動另行檢核；不重跑prefix或zero churn。完整門檻、fresh build／types、提交及整體人工驗收仍待完成，E／F保持未勾選。證據見 `qa/quiet-ownership-prefix-v1/disposition.json`、`review.json`。

V15預檢拒絕（2026-10-13臺北時間19:38）：啟動10項、收尾31項、封裝11項與型別檢查通過；原2,263案設定不變，2,594項輸入包含全部src／tests／public的2,411檔，具體啟動已獨立批准。正式npm開始前，第二個WebKit零音訊預檢回報previouslyMuted=false；雖已靜音並驗證，持續性門檻仍拒絕啟動。共8個零音訊預檢完成，quiet／launcher均native1，沒有正式unit／E2E結果，全部輸入未變。此原因不同於V14歸屬不明，尚無底層根因結論；下一步僅有限唯讀／離線取證，不盲目重跑、不放寬靜音條件。E／F及整體人工驗收保持未完成。證據見 `qa/full-regression-disposition-v15.json`。

靜音持續性有限診斷（2026-10-13臺北時間20:51）：先完成438項observer、14項registration、8項native adapter、1,102項ownership parity、32項mute guard及6項sequence檢查；隔離故障檢查確認晚到錯誤會拒絕，guard／browser關閉卡住均由有界外層停止。具體命令經獨立檢核後只執行一次兩個WebKit的全零音訊診斷，15.053135秒完成，guard／runner／outer均native0。兩個native session原已靜音，SetMute寫入為0；第一個browser關閉後兩次fresh complete absent scans通過，2,935ms後才啟動第二個。兩個native session的Expired與程序退出均有紀錄；23項診斷／執行檔與2,594項V15輸入（含2,411個runtime檔案）未變。結果已獨立核准，僅代表未重現；保留COM／process參照與等待結束是時序介入，不能當成根因或修復。下一步準備生命週期等待的操作性防護候選，保留15秒界限、unknown fatal、精確歸屬、formal前previouslyMuted=true與零重試，先離線故障檢查及有限零音訊預檢再審；不直接啟動全套。E／F及整體人工驗收未完成。證據見 `qa/quiet-persistence-v1/disposition.json`、`result-review.json`。

WebKit生命週期防護整合（2026-10-13臺北時間21:25）：採短暫getter-only快照，保留原guard，避免全套期間累積新的COM／process觀察器。兩個WebKit各以已確認ticket綁定close，後續permit與formal都須等精確instance的fresh Expired或兩個完整absence查詢。補足獨立審查指出的15秒自身deadline／AbortSignal及原生資料缺欄拒絕，Red證據保留；16項原生、33項JavaScript、7種離線整合情境通過。經具體檢核僅實跑一輪四variant零音訊8案，全通過、0 retry／skip／flaky，44.605218秒。12次預熱確認，14個session均verified及previouslyMuted；兩gate於628ms／541ms完成，各自兩次absence間隔402.5417ms／397.6599ms，順序正確。seed／smoke child／quiet wrapper／outer皆native0；native guard沿既有cleanup於最後child成功後主動SIGTERM，結果已明記並經獨立核准，不能宣稱guard native0。20項候選輸入、6個執行檔、2,594項V15輸入及2,411個runtime檔案未變。下一步僅準備V16，完整2,263案、期限、0 retry及全部原驗收要求不變；contract／finalizer須驗兩個lifecycle ticket與順序、精確preload，並接受且只接受已審版本的預期guard終止語意。E／F及整體人工驗收仍未完成，不push／deploy。證據見 `qa/quiet-lifecycle-v1/disposition.json`、`result-review.json`、`full-successor-preparation.json`。
