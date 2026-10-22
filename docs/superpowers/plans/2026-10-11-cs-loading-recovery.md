# CS 載入停滯與重試恢復

本輪處理模型回應已收到 HTTP 200、但 body 長時間未完成，且原有載入流程缺少退出條件的問題。實際 trace 只涵蓋測試期限內的停滯，不能由此斷言實際請求永久不會結束。底層傳輸停止的原因仍待查證；可重試不等於網路根因已修復。

## 原始證據與修正界線

`qa/startup-response-body-audit.json` 重新逐筆檢查先前 smoke 案例的原始 trace。45 筆素材請求中，44 筆有完整 body；`environment.glb` 雖然是 200，`receive`、`bodySize`、`content.size` 都是 -1，且沒有 body hash，預期大小為 16,915,872 bytes。因此先前「所有請求 200，尚待區分解碼／GPU 預熱」的推論不夠精確：200 只證明標頭收到，目前最強證據指向 body 尚未完成。

原本 Three 的 FileLoader 會等待 stream 結束後才完成 `arrayBuffer()`；ownership wrapper 正確等待所有資源，但正常載入期間沒有中止永久 pending 的條件。只要一個 body 一直不結束，也沒有拋出錯誤，既有 retry UI 就不會出現。

## 行為與驗收

- `asset-loading.ts` 監測整批素材：任一 GLB／HDR 收到更多 bytes，或 LoadingManager 完成一個項目（含 nested image），就重新計算 30 秒無活動窗口。
- 採整批窗口，避免某一檔尚在瀏覽器連線佇列中就取消仍有下載活動的整批。沒有整批固定總時長上限；單元測試涵蓋超過 100 秒但持續前進的載入。
- 超過無活動窗口，以 `TimeoutError` 取消 ownership。既有 renderer catch 中止 LoadingManager、回收資源，再由既有錯誤介面提供重新載入；不自動無限重试。
- 成功、失敗與離開頁面都清除 timer／listener；後續 progress 不得重新啟動。已完成和取消後晚到的資源仍各回收一次。
- 後續 WebKit 原生 HTTP 小型重現找到另一個取消問題：等待 31 秒及少量記憶體配置後，Three 同型的 inline `AbortSignal.any`／Request signal 被回收，來源 controller 雖已取消，body read 仍 pending。保留 composite 參照的對照組則收到 `AbortError`。證據為 `qa/loading-webkit-native-stream-signals.json`；不推論其他 Safari 版本或作業系統也必然相同。
- 因此 outer GLB／HDR 改由 `asset-download.ts` 直接使用 renderer 持有的 signal 下載，並明確取消／解鎖 reader；完成後分別交給 GLTFLoader.parseAsync 與 HDRLoader.parse。GLTF 相對路徑、HDR HalfFloat／linear 色彩／filter／flipY 等上傳設定維持原行為，未修改相依套件或全域 fetch。
- 未更改 UI 字型、佈局、素材、藝術批准、正式發佈設定或底層網路設定。

目前活動可見性仍有限：TextureLoader 不回報 bytes，GLTF nested image 也只有完成通知；圖片網路下載、parse 或 decode 若 30 秒都沒有可觀察活動，可能進入重試。因此不能宣稱支援任意慢速圖片傳輸；此限制不同於已解決的「一個 outer GLB body 永久 pending，完全沒有退出方式」。

GLTF 解析內部的 FileLoader／ImageBitmapLoader 仍由 Three 管理，沒有一併修復它們的短命 composite signal；本次保證界線是 outer GLB／HDR 與 ownership 回收。重試仍採現有整頁重載。純 CPU parse 期間也不能被 JavaScript timer 搶佔。

相容性判定限於本機 Windows Playwright WebKit 26.0 的小型重現。[DOM 標準的 GC 規則](https://dom.spec.whatwg.org/#garbage-collection-2) 要求仍有來源，且有 abort listener 或待執行 abort algorithm 的未取消相依 signal 保持存活；因此不是將弱參照造成取消失效視為 API 的預期行為，也不泛稱所有 `AbortSignal.any()` 使用都不安全。既有公開 WebKit 的 reason／GC 問題與本次症狀並非已證實同一缺陷，沒有据此套用其他版本的修復結論或對外發布 bug report。

## TDD 與獨立檢核

- `qa/loading-recovery-red.json`：保留真實 renderer 和 Three loaders，僅令首次 environment response 收到第一段資料後停止；舊版等待 40 秒後 load-error 仍 hidden，測試因正確原因失敗。
- `qa/loading-watchdog-red.json`：既有取消邏輯遺失 TimeoutError 身分；watchdog API 尚不存在。`qa/loading-watchdog-green.json`：12 項通過，涵蓋無進度、持續進度、重複／倒退／非法 bytes、nested completion、取消原因、一次釋放與計時清理。
- `qa/loading-recovery-green.json`：首次 Chromium 實跑恢復通過，重試後開始按鈕啟用，且可進入 shop。
- 獨立檢核指出整批窗口需從最後活動算起；最終 E2E 等待上限改為 60 秒，並額外捕捉 `TimeoutError` 與首批 bytes 後至少 30 秒的時間，排除其他素材提早失敗造成假綠。此變更有單獨雜湊收據 `qa/loading-e2e-review-revision.json`。
- 第一輪 `qa/verify-loading-recovery.py` 的全套 unit 1,687 項與 build 通過，CS Chromium 39 通過、3 失敗、31 未執行。失敗分別為外部網路變動，以及 ownership 測試模組漏轉出新 watchdog（已補 export）；不能將此輪寫成全綠。
- 舊 synthetic stream 測試在 Firefox／mobile Chrome 通過、WebKit／mobile Safari 未收到取消。測試改用本地原生 HTTP body；伺服器永不結束回應，瀏覽器的原始 reader 必須收到 abort rejection 或 done:true，再同時驗 TimeoutError、至少 30 秒、retry reload 與進入 shop。Observer 不持有 Request／signal，不替換 Response 或 stream。伺服器 socket close 僅記錄，不作跨瀏覽器 gate：小型對照組即使 client read 已拒絕也沒有立即 close。
- 新 downloader 單元測試初始因缺少模組失敗（0 項執行，不能算通過）；實作後與 ownership/watchdog 合併 19 項通過，涵蓋 bytes／progress、HTTP／transport 錯誤、取消 pending read、reader cleanup、HDR 像素與設定、malformed HDR。
- 最終驗證入口為 `qa/verify-loading-download.py`，使用既有乾淨依賴快照、單一 browser worker，依序跑原生下載恢復五瀏覽器、全套 unit、build 與完整 CS Chromium。以 `qa/loading-download-verification.json` 的實際結果為準；未完成項目不得由前一版結果代替。
- 舊 loader 在相同原生 HTTP／reader observer 測試中，TimeoutError 出現後讀取仍未結束：`qa/loading-reader-old-loader-recheck.json` 是有效 Red。前一輪 `loading-reader-old-loader.json` 則卡於導覽（CSS 請求約 20 秒），未進入斷言，不作 Red 證據；未修改導航 timeout 掩蓋它。
- 修正版五 project 全部通過：Chromium／Firefox／mobile Chrome 的 pending read 以 done:true 結束，WebKit／mobile Safari 收到 AbortError；全部讀到 65,536 bytes、首段回應後 30.5–33.5 秒產生 TimeoutError，重試並進入 shop。`qa/loading-native-boundaries.json` 保留逐項資料；0 skipped、0 flaky。這是載入恢復驗收，不是完整五瀏覽器遊玩驗收。
- 修正版全套 Vitest 172 檔／1,694 項通過，build exit 0；產物 30 個 CS runtime 檔、33,215,561 bytes 與來源一致，564 個 JS/MJS 無開發候選識別，3,191 個輸出檔無候選原檔 hash（`qa/loading-production-exclusion.json`）。
- 同版本完整 CS Chromium 為 72 通過、1 失敗、0 skipped：smoke 案例在 60 秒測試期限內未啟用開始按鈕。45 個素材仍只有 `environment.glb` body 未完成，沒有 TimeoutError 或 loading-error UI。原 trace 沒有 chunk 或 heartbeat 紀錄，不能區分持續收到少量 bytes 與 timer／主執行緒延遲，也不能宣稱這次修復已消除原始啟動問題。保留 `qa/loading-download-cs-chromium.json`，整體 wrapper exit 1。
- 為下一次失敗補上測試內觀測：原生 downloader 的 bytes／chunks／完成時刻、watchdog 最後活動／最大活動間隔／deadline、1Hz heartbeat 最大間隔與 visibility。既有 readiness、timeout、retry 和遊戲斷言未改；不持有 Request／reader／composite signal。觀測仍新增模組請求及 microtasks，可能改變時序，未重現不等於排除問題。
- grenade 整檔觀測重驗 2 通過；再以原失敗前的 FX 失敗、離頁取消加 smoke／flash 順序重播，4 通過（56.69 秒）。兩次 environment 都完整收到 16,915,872 bytes，下載約 590／889ms；watchdog 最大活動間隔約 115／90ms。`qa/loading-cancel-sequence-summary.json` 保留資料。這些是有觀測下未重現，不覆蓋完整跑次的失敗，也不合併宣稱完整套件全綠。
- Windows 事件交叉檢查：最新失敗窗口 UTC 12:47:17–12:48:18，已啟用的 System、WLAN AutoConfig、NetworkProfile、DHCP Admin 都沒有事件，主代理已直接複核且查詢無錯誤。先前其他跑次的 WLAN 變化不能套用到此次失敗；NDIS／TCPIP Operational 日誌未啟用，仍不能排除未記錄的底層變化。`qa/loading-network-failure-window.json` 只保留事件 ID／種類／時間，不含網路名稱等使用者資料。

## 全站跑次的新證據：持續慢速傳輸

- `qa/fullsite-current.json` 同一來源全站 inventory 2,510 項，1 worker、0 retry、maxFailures=3；914.24 秒後停止，92 通過、3 失敗。其餘 2,415 項全部 `results: []`，是未執行（Chromium 407、其他四 project 各 502），不是有驗證的平台 skip。既有 1,694 項 unit 與 build 不因此變成全站通過。
- 本次 smoke 明確捕捉到 environment 持續傳輸：9.600 秒開始，59.099 秒已讀 14,614,528／16,915,872 bytes（86.4%）、277 chunks，約 295 KB/s。整批最大活動間隔 2.186 秒、heartbeat 最大 1.095 秒、全程 visible；最後一次活動後 1.14 秒即到測試截止。按照 30 秒無活動契約，watchdog 正確不觸發，並非已證明 timer 失效或背景節流。獨立 consultant 直接解碼原附件複核一致；`qa/fullsite-current-failures.json` 保留完整值。
- 另外兩案需分開：主站 baseline 有大量 scripts／圖片延遲及截止時未完成的影片請求；death-record 則有 casing／grenades／sky 三個 `ERR_NETWORK_CHANGED`，進入既有 loading-error 路徑。主代理抽驗原 trace 的 85／100 筆請求；不將沒有 chunk telemetry 的舊跑次一概歸因此次慢速模式。
- 原生 Windows curl 對既有 4002 preview 讀同一份 16.9 MB 地圖只需 0.204／0.211／0.212 秒，直接磁碟讀約 0.0195 秒（`qa/loading-transport-first-probe.json`）。這是不同時間及伺服器的控制資料，不能排除失敗當下共用主機問題。第一次 Cygwin curl 的 `%{json}` 被改成 `%json`，解析失敗，不作量測結果。
- 另起同來源 4005 fresh server，獨立 Node HTTP 在 IPv6 讀取約 111／114ms；三次 Chromium trace on／off／on 的 environment 皆在 409–699ms 完成，沒有 page error，也沒有觸發 >8 秒的條件式並行比較（`qa/loading-transport-comparison.json`）。未重現不等於 trace／IPv6 或主機負載已被排除；fresh server 的啟動本身約 76 秒，不能把不同時段的資源快照反推原失敗。
- 下一輪 `qa/verify-paired-transport.py` 僅修改隔離 snapshot 的觀測層，沿原 death-record／feedback／grenade 順序，在 environment 已慢超過 8 秒且未完時啟動另一個獨立 Node Worker HTTP client 抓同源同檔，並記錄 server event-loop／CPU／host CPU／RAM。原遊戲斷言與 timeout 不改；結束後還原 snapshot 原檔。此跑次屬診斷，結果不得混入 canonical acceptance。額外一條 HTTP 會增加負載，因此比較仍需保留限制。

## 有限序列診斷與主機負載

- paired 跑次為 15 過／1 失敗，屬隔離 snapshot 診斷，不納入 canonical acceptance。失敗轉到 feedback 的第 341 行案例；122 requests 都是 200，environment 的 trace body 仍未完成記錄。此案沒有 bytes observer，不能將前次 smoke 的持續慢傳模式直接套用。兩個有 observer 的 grenade 案皆在約 1.35／1.84 秒完成 environment，沒有觸發另一條 HTTP，因此本次並未取得同步傳輸對照。
- `qa/loading-paired-summary.json` 從原 report／trace／server metrics 重算。255 個非等距樣本的 host CPU 中位 99.05%，依 interval 加權平均 97.79%；server event-loop 最長 3.288 秒。失敗與通過案例都有高度負載及 lag，不能據此判定根因；同步寫入 metrics 也可能擾動量測。只確認 grenade spec 已還原，snapshot 的診斷 helper/config 刻意保留。
- UTC 13:53:33–13:54:04，未啟動本流程 browser/server 的 preflight 四筆 CPU 為 87／96／75／98%。可用 RAM 約 12.6–14.9 GB，Pages Input/sec 為 3263／0／27／347，磁碟 queue 均為 0。這不能反推先前失敗時的 paging／程序歸因。當前另有模擬器、Java 編譯與無法證明歸屬的 Playwright 工作；沒有終止或誤當孤兒清理。完整資料為 `qa/loading-host-preflight.json`。
- 下一個實驗限於原來的九案 prefix：death-record、feedback 前七個通過案例及原失敗案。`qa/verify-loading-prefix.py` 預設只列 inventory；已核對九案順序與兩個原 spec 精確還原，實際測試數為零。`--run` 才會執行，原 30 秒 click gate／遊戲斷言不變，全部九案加 observer；8 秒 timer 改為不依賴新 chunk 才觸發。若 renderer 尚未呼叫 fetch、或 main thread 飢餓，仍有觀測缺口。獨立檢核確認方法可用，但需先做資源控制，不能把再次飽和的結果當成 quiet 對照。
- 使用者已回覆資源調整由主流程自行決定。準備了精確三 PID、原優先序／creation identity 檢查、獨立 hidden watchdog 與 finally 復原的短暫排程調整；但 Windows ExecutionPolicy 在腳本 body 執行前拒絕，三程序 read-back 仍為 Normal。沒有在拒絕後變更或繞過執行原則，沒有調整模擬器或未知 Playwright 工作。首份唯讀 preflight 曾使用 process-scoped `ExecutionPolicy Bypass`，未修改持久化原則；後續不再沿用該啟動方式。
- 改成一次現有混合負載下的 prefix 傳輸診斷，global cap 240 秒，僅求取得同步傳輸資料，不當作 quiet／效能對照。結果在 plugin setup／teardown 達到上限，**九案皆未執行、零測試通過**，沒有建立 server metrics，更沒有 paired 下載結果。原 report／log 保留於 `qa/loading-prefix-run.json`／`.log`；次要報告 parser 原本將空 inventory 視為 assertion failure，已以真實 setup-failure、list-only 及非法空報告檢查修正，沒有重跑瀏覽器。
- 兩份 canonical spec 精確還原後，依 PID＋creation epoch＋命令用途清理本次 server、Python wrapper 與 RTK wrapper，terminal session 最終 exit 1；4005 沒有 listener。Windows 的已結束程序物件一度仍可枚舉，已用 `HasExited=true` 區分，沒有重複終止未知程序。詳 `qa/loading-prefix-setup-failure.json`。本輪停止增加測試負載；後續需有新的環境或伺服器啟動證據，不能原樣重跑或放寬遊戲 deadline。

## 診斷副作用紀錄

先前 MSYS curl 把 `NUL` 當成一般檔，覆寫 worktree 原有未追蹤 `NUL`；原內容未事先保存。已檢查 fixture intake、已知乾淨快照與 main root，未找到能證實相同的副本，因此目前原檔未恢復；沒有用別份 HTML 猜測替換或刪除。現有檔與不同的 main-root 檔已記錄 bytes／SHA256，詳 `qa/nul-overwrite-incident.json`，使用者已被告知。後續需要 NUL device 的 curl 呼叫使用 Windows 原生明確路徑。

本文件的 `qa/` 指 `art-factory/cs/runs/run-20261011-continuation/qa/`。原始錯誤、診斷與各輪結果都保留；整體商用品質仍需完整跨瀏覽器、長幀、素材選用及美術批准等剩餘驗收。

## 2026-10-12 最新完整 CS 跑次與恢復測試修正

- 隔夜程序已結束，原生 Node 匯入 Astro 成功。原有 73 項 CS Chromium 跑次為 18 通過、1 失敗、54 未執行，390.29 秒，exit 1。原有 smoke／flash 與 HUD 案例這次通過；不能據此消除歷史載入失敗。
- 新失敗在 `games-cs-loading.spec.ts:85`：首次刻意停滯的 HTTP 已讀 65,536 bytes，約 42.28 秒後正確產生 TimeoutError，reader 結束且顯示 retry；重試後 30 秒內開始按鈕仍未啟用。Trace 顯示第二次走正常來源、當時 environment body 尚未完成，約斷言失敗後 2.6 秒的收尾快照已可開始。這不是再次注入 stall，也不支持永久卡死；各段時間占比和底層慢速原因仍未確定。
- 原恢復測試把正常下載的總等待限為 30 秒，與 production 的「30 秒整批無活動」契約不同。以本輪錯誤作 Red 證據，retry 總窗修為 60 秒、整案 180 秒包含兩個窗口與收尾；新增完整 bytes 等於實體檔大小、finite reader done、無 reader／loading error，再進 shop。Production watchdog 與 runtime 沒有修改，這也不是載入效能核准。
- Observer 保留 time origin、fetch／headers／first-last chunk／done 時間；無論成功或失敗，都在 stall server 清理前容錯附上 final telemetry。獨立唯讀審查 PASS，無新 P1／P2；實跑入口為 `qa/verify-loading-retry-oct12.mjs`。
- `qa/cs-current-oct12-audit.json` 比對本輪時間、73 案名稱、10 個 spec 與實際 Chromium test instances；雙向比對來源集合，加四個 fixture／calibration 與 manifest，共 770 檔相同。快照唯一額外 spec 是明確 testIgnore 的 startup diagnostic，另存其 hash 與三個執行設定 hash。
- 原失敗 trace、截圖、video 與 error-context 已封存到 `qa/cs-current-oct12-failure/`。全站五 project 與效能驗收仍未完成。
- 修正版 focused 五 project：5 通過、0 skip／flaky／未執行，334.54 秒。每次 retry 均完整收到 16,915,872 bytes 並進 shop；本次各 browser body 約 259–1,559ms，不能回推歷史慢傳已消失。逐段資料見 `qa/loading-retry-oct12-boundaries.json`。
- 新全站跑次已結束：fresh inventory 為 2,510 案／49 spec，2,280 個來源與 public 檔案在執行前後集合及內容皆一致；單 worker、0 retry，858.81 秒後達三個失敗上限而停止。103 通過、3 失敗、2,404 未執行，沒有 intentional skip／flaky；不能視為全站通過。權威收據為 `qa/fullsite-oct12-verification.json`，三案共 11 份原始附件已逐檔核對 hash 封存，見 `qa/fullsite-oct12-audit.json`。
- Bomber 在建立房間前的 dynamic import 等待逾時：`bomberNetMain.ts` 回應耗時 21.60 秒，其三個依賴在 trace 結束前尚未完成，沒有 `/api/signal` request。不能據此判成配對 API 或 WebRTC bug。
- CS feedback 案在點擊開始前，grenades／sky 的網路請求明確報 `ERR_NETWORK_CHANGED`，UI 已顯示 loading error；environment 隨後為 `ERR_ABORTED`。另一個 renderer 案也在正常 production 首頁等待開始，environment headers 為 200、但 body 尚無完成紀錄；尚未走到 `?skinCandidate=1`，不是候選模型驗證失敗。主代理已抽驗原 trace，底層網路變化／慢傳原因仍未確定。
- 下一個有限步驟使用已打包 static preview，移除 dev module graph 的因素。新 QA 腳本保留真實鍵鼠、完整比賽／重開／换隊，僅觀測 DOM、RAF 與 canvas，沒有 renderer hook。預檢 2,636 個 static 檔案共 329,960,619 bytes，HTML 與伺服器回應 hash 相同；這只是產物身分預檢，尚非實玩或效能通過。
- 上述 production static 實跑現已完成：high 攻方／low 守方各 300 秒，功能 gates 與收尾均通過。開始可用時間 5.033／3.499 秒；同一 environment body 的 Resource Timing encoded bytes 均為 16,915,872，duration 399.3／359.4ms。這是兩個正式打包版本成功樣本，不證明歷史慢傳或 `ERR_NETWORK_CHANGED` 已修復。詳細幀時間、自然觀戰、畫面與方法限制見 continuation 計畫最新段落及 `run-20261012-production-static/qa/summary.json`。
