# 曦境戰紀

原創人類王國的桌面瀏覽器即時戰略遊戲。入口 `/games/rts`，遊戲廳 `/games` 有對應卡片。單人對抗一名遵守採集、成本、人口和視野規則的電腦對手。

## 開始與操作

選擇「雙河谷地」或「灰脊隘口」，按「開始戰役」。初始有一座領主府、五名工人、500 金與 200 木。先讓工人採金、伐木，再建兵營與民居；祭壇可招募唯一英雄。

| 輸入 | 行為 |
|---|---|
| 左鍵、拖曳 | 選取、框選我方單位 |
| Shift + 左鍵／框選 | 增補選取 |
| 右鍵 | 移動、攻擊、採集、施工／修理或設集結點 |
| A，再選地點 | 攻擊移動；也可在小地圖左鍵或右鍵指定，成功下令後退出目標模式 |
| S / H | 停止／守備 |
| Ctrl + 1–5 / 1–5 | 編隊／選取編隊 |
| 方向鍵 | 平移鏡頭 |
| W / D | 平移鏡頭 |
| A / S（未選我方部隊） | 平移鏡頭；選取部隊後改為攻擊／停止 |
| 中鍵拖曳、滾輪 | 平移、縮放 |
| Home、小地圖「主城」 | 回到主城 |
| 小地圖左鍵／右鍵 | 移動鏡頭／對已選部隊下令，選取建築時右鍵設定地面集結點 |
| Esc | 取消待選目標（放置建築時回到建造卡）；在建造卡時回到主命令卡；否則開啟暫停選單 |
| B | 選取工人時開啟建造命令卡 |

大廳與暫停選單都能查看完整科技樹。命令按鈕會列出缺少的建築、階級、資源或人口。最後五分鐘顯示倒數；暫停時間不計入三十分鐘上限。摧毀對手全部建築即勝利；雙方同時失去所有建築或時間到則和局。

選取領主府，在戰場上右鍵金礦或樹木，可讓之後訓練的工人自動採集、返城入庫。資訊區會顯示「新工人自動採集」；改點地面或小地圖就改為一般集結。資源枯竭時，工人依可見範圍尋找同類資源。牧師在待命、守備及攻擊移動時自動治療；明確移動或攻擊命令會優先執行。

選取兵種時，下方資訊旁會出現該角色的 3D 動態肖像。七種我方單位與中立掠兵都有獨立外觀；騎士顯示騎乘者特寫，攻城車顯示機械特寫。多選時顯示第一個單位；暫停或系統啟用減少動態效果時停止動畫。建築、空選取、死亡或失去視野的敵軍不保留肖像。

## 地圖

兩張地圖都是 288 × 288 公尺（2026-10-16 二次放大：192 m 版仍嫌小，面積再 2.25 倍，為最初 96 m 的 9 倍），180° 旋轉對稱，西方玩家從 (24, 144) 出發，兩主城直線相距 240 公尺。每方有：

- 主城金礦 5000 與兩片主城林地（2500＋3000）
- 北側自然擴張（金 4000＋林地 3000）與南側第三礦（金 4000＋林地 2500），各有一組中立營地看守，皆在 AI 80 公尺勘查範圍內
- 靠南側渡口的前沿礦（金 3500＋林地 2000）
- 靠中央渡口、兩方爭奪的中央富礦（金 4500＋林地 2000）

每圖共 22 處資源、10 組營地（每方 5 組：自然、第三、前沿、中央、北側渡口）、16 處地標（6 座哨站＋10 處營地遺跡），樹木約 770（谷地）／800（隘口）棵。

| 地圖 | 進攻路線 | 營地 |
|---|---|---|
| 雙河谷地 | 河道在三處渡口間左右擺盪 ±9 公尺；北、南兩座石橋（z 84／204）與中央淺灘乾石堤（z 141–146） | 自然、第三、前沿、中央富礦、北橋頭各一組（共 10） |
| 灰脊隘口 | 連續 8 公尺岩脊只留中央 6 格隘口（z 141–146）、南北 8 格繞行道（z 66–73／214–221）與地圖邊緣兩條 4 格山徑；兩道岩刺圍出隘口前的中央谷地，另一道岩牆把自然擴張與北繞行道隔開 | 自然、第三、前沿、中央富礦、北繞行道口各一組（共 10） |

鏡頭：開局視野 48 公尺，可在 24–60 公尺間縮放（不再能拉到 100 公尺看全圖），鍵盤／邊緣捲動在開局視野約 34 公尺／秒、最遠視野約 42 公尺／秒。小地圖仍為 192 px（每 px 1.5 公尺），視窗框依實際鏡頭四角投影。

尺寸由 `RtsMap.width/height` 推導：迷霧材質與地表遮罩（四周邊界取地圖半寬但最多 96 公尺，1 texel／公尺，288 m 圖為 480²）、小地圖、鏡頭邊界、陰影範圍（隨鏡頭移動）與尋路緩衝都不再寫死。尋路用每次查詢的格子可走性快取與 typed-array heap，路徑結果與原 A* 逐格相同（`navigation-perf.test.ts` 以原實作為對照）；地形可走性另依格網指紋跨查詢共用。建築放置檢查會先比對「不含新建築」的連通分量（同一組障礙物只算一次），新建築周圍一圈在局部範圍仍互通即可確認不會封路，證明不了才做全圖 flood（`navigation-perf.test.ts` 以暴力 flood 為對照）。

## 科技路線

| 階級 | 重點 |
|---|---|
| I：領主府 | 工人、衛兵；伐木場解鎖弩手；兵營後可建祭壇、鍛造所 |
| II：城堡 | 需兵營與鍛造所，280 金／160 木；禮拜堂出牧師，馬廄出騎士 |
| III：王城 | 需禮拜堂或馬廄，420 金／240 木；工坊出攻城車 |

鍛造所的武器、護甲各三階，按順序研發並受主城階級限制。民居增加十人口，上限八十。訓練排程會預留人口；建築被摧毀時已支付佇列全損，主動取消則依進度退款。

誓衛統領可學習破陣斬、戰地救援與三級解鎖的王旗；升級與施法遵守技能點、魔力、冷卻、視野與射程。英雄死亡後可在祭壇復活並保留等級。兩處中立營地各有兩名灰斗篷掠兵，清除後有一次性賞金。

### 擴充兵種（預覽，尚未上線）

以下單位的模擬規則已完成，但正式模型尚未發布，因此在 `catalog.ts` 以 `preview: true` 標記：正式遊戲的指令卡、訓練指令與 AI 都看不到它們；只有 `createGame(..., {rosterPreview:true})` 的對局（測試、美術審查）會開放。模型發布後移除該單位的旗標即可（`roster.test.ts` 會檢查旗標與 `REQUIRED_MODELS` 一致）。美術需求見 `art-factory/rts/contracts/roster-expansion-brief.json`。

長槍兵、遊俠與曦光法師的正式模型（`models/pikeman*.glb`、`models/ranger*.glb`、`models/mage*.glb`，遊俠另附 `models/arrow.glb` 箭矢）與訓練圖示已在本機發布供風格審核，registry 標 `user_style_approval: pending`；在使用者確認前仍維持 `preview: true`、不加入 `REQUIRED_MODELS`（`roster.test.ts` 檢查 pending 模型必須留在預覽閘門內）。審核頁 `art-factory/rts/review/roster-pikeman-20261016.html`、`roster-ranger-20261016.html`、`roster-mage-20261016.html`（含手部近景），製作流程與驗收門檻見 `art-factory/rts/contracts/roster-expansion-models.json`。

| 單位 | 建築／階級 | 費用（金／木／人） | 生命 | 攻擊 | 射程 | 速度 | 類型（攻／甲） | 特性 |
|---|---|---|---|---|---|---|---|---|
| 長槍兵 | 兵營 I | 80／10／2 | 270 | 16 | 1.1 | 3.0 | 長矛／重甲 | 對騎士 1.75 倍 |
| 遊俠 | 兵營 II＋伐木場 | 120／50／2 | 210 | 18 | 7 | 3.7 | 穿刺／輕甲 | 視野 20、可對空 |
| 曦光法師 | 禮拜堂 II＋伐木場 | 140／70／2 | 170 | 14 | 7 | 2.8 | 魔法／輕甲 | 自動施放曦光術、可對空 |
| 獅鷲騎士 | 馬廄 III＋伐木場 | 260／100／4 | 560 | 34 | 2.2 | 4.8 | 普通／空中 | 飛行、可對空 |
| 曦光賢者 | 祭壇（英雄） | 180／40／5 | 540 | 22 | 6 | 3.2 | 英雄／英雄 | 曦光爆裂、晨輝療癒、破曉（3 級） |
| 遊俠隊長 | 祭壇（英雄） | 180／40／5 | 620 | 26 | 7 | 4.2 | 英雄／英雄 | 箭雨、疾行號令、獵殺標記（3 級） |

- **英雄**：每種英雄各限一名；可擁有的英雄數＝主城階級（I 一名、II 兩名、III 三名）。陣亡英雄保留名額並可在祭壇復活，等級、經驗、技能各自獨立；擊殺經驗分給 12 公尺內所有我方英雄。
- **空中層**：飛行單位直線飛行，不受地形、建築與地面單位阻擋（仍限地圖範圍內），也不阻擋地面單位；建築可蓋在其下方。只有 `targetsAir` 的單位（弩手、遊俠、曦光法師、獅鷲騎士、兩名新英雄）與守望塔能攻擊飛行單位；近戰地面單位與破陣斬打不到空中。視野為不受地形遮擋的圓形（現有規則本來就沒有視線遮蔽）。場景可讀 `UNITS[kind].flying` 加高度。
- **曦光術**（法師自動施放）：45 魔力、冷卻 8 秒、射程 7，半徑 2.5 內至少兩名敵人時施放，造成 40 魔法傷害並減速 4 秒（移動速度 ×0.6）。疾行號令為 ×1.5 移速；獵殺標記使目標承受傷害 ×1.25。
- **AI**：開放預覽時改用擴充配比，並依「自己視野看過」的敵軍（不透視迷霧）調整：看到騎士多出長槍兵、看到飛行單位提高對空單位並多蓋一座守望塔，看到大量輕甲加開法師；主城升階後招募第二、第三名英雄。
- **AI 空中**（`AI_PROFILES[*].air`）：III 階有馬廄後保持獅鷲數量下限（簡單 0／普通 1／困難 2），不夠錢時已有 3 名以上士兵就存錢；對手看過的部隊幾乎沒有對空（對空占比 < 20%）時獅鷲權重 ×3，對空占比 > 50% 時 ×0.4。普通／困難的獅鷲會獵殺看得到的敵方工人、在對方對空稀薄時飛向敵方主城（分基地優先），血量 < 45% 或附近有兩名以上對空或守望塔就撤回；基地遇襲時一律回防。看到敵方獅鷲後，對空需求＝ceil(獅鷲數 × 1.5 × 難度係數 0.5／1／1.5)，不足時只訓練對空單位（建築忙碌時等待）。
- **技能音效**（Web Audio 合成，無音檔）：曦光爆裂、晨輝療癒、破曉、箭雨、疾行號令、獵殺標記與法師曦光術各有獨立音色，依實際 `castCue` 序號觸發一次；每種有冷卻間隔，同時最多 3 個技能聲部，不會壓過警告與指令音。統領三技能沿用原本音效。

#### 傷害類型矩陣

原有七種單位、中立掠兵與建築之間的組合全部維持 1.0，既有平衡不變；倍率只作用在新組合上。

| 攻擊＼護甲 | 輕甲 | 重甲 | 騎兵 | 空中 | 城防 | 英雄 |
|---|---|---|---|---|---|---|
| 普通（衛兵、工人、牧師、騎士、掠兵、獅鷲） | 1 | 1 | 1 | 1 | 1 | 1 |
| 穿刺（弩手、遊俠、守望塔） | 1 | 1 | 1 | 1.5 | 1 | 1 |
| 長矛（長槍兵） | 1 | 1 | 1.75 | 1 | 0.6 | 1 |
| 攻城（攻城車，另有對建築 ×2.7） | 1 | 1 | 1 | 1 | 1 | 1 |
| 魔法（曦光法師、曦光術） | 1.25 | 0.8 | 1 | 1.25 | 0.5 | 0.75 |
| 英雄（三名英雄的普攻） | 1 | 1 | 1 | 1 | 1 | 1 |

護甲類型：輕甲＝工人、弩手、牧師、遊俠、法師、掠兵；重甲＝衛兵、長槍兵、攻城車；騎兵＝騎士；空中＝獅鷲騎士；城防＝所有建築；英雄＝三名英雄。倍率先套用，再套用原本的護甲值減傷。

## 開發與驗證

專案採 Astro + Three.js。遊戲規則在 `src/scripts/games/rts/`，以 20 Hz 固定 tick 模擬。數值與科技以 `catalog.ts` 為唯一來源；顯示層不直接改動經濟或戰鬥結果。頁面使用既有 BaseLayout 與字型。

```powershell
node node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4321
node node_modules/vitest/vitest.mjs run --maxWorkers=4
node node_modules/@playwright/test/cli.js test --config=playwright.rts.config.ts
node node_modules/astro/bin/astro.mjs build
```

全站預設 Playwright config 使用 4002；RTS 專用 `playwright.rts.config.ts` 預設使用 4321，可透過 `RTS_PORT` 指定其他埠，涵蓋 Chromium、Firefox、WebKit 三個桌面引擎，可加 `--project=chromium` 限縮。多人工作樹環境要確認伺服器的實際工作樹，不能誤用其他分支的 server。Windows Chromium 使用 new-headless 啟用 GPU；實機 Safari 仍需另驗。

例如已在本工作樹啟動 4324 的預覽，可讓 RTS 測試與手動驗證共用該服務：

```powershell
$env:RTS_PORT = '4324'
$env:RTS_BASE_URL = 'http://127.0.0.1:4324'
```

下列長程腳本使用 `RTS_BASE_URL`，未設定時預設為 4321；必須先在對應埠啟動本工作樹的 RTS 服務：

```powershell
node node_modules/tsx/dist/cli.mjs tests/manual/rts-player-campaign.ts
node node_modules/tsx/dist/cli.mjs tests/manual/rts-ai-campaign.ts
node node_modules/tsx/dist/cli.mjs tests/manual/rts-performance.ts --dedicated-gpu
node node_modules/tsx/dist/cli.mjs tests/manual/rts-performance.ts --dedicated-gpu --portrait
```

前兩個腳本只以真實滑鼠／鍵盤操作，快轉時鐘仍逐次執行固定模擬 tick，不注入資源、HP 或勝負。效能腳本則是明示的 80 單位／20 建築耐久交戰情境，不能作自然通關證據。`--candidate-art` 僅用於保留的早期診斷，正式驗收不帶此參數。

`tests/e2e/games-rts-tech.spec.ts` 使用有資源與完成建築的專注測試情境，驗證付費升階、七種我方單位的訓練與連續研究；英雄技能測試也有獨立 fixture。兩者不替代自然戰役。

`games-rts-portrait.spec.ts` 以正式 GLB 驗證八種肖像的畫面變化、暫停、隊色、迷霧、死亡與重開，以及 DPR 1.5／窄版／減少動態效果。肖像與戰場共用一個 WebGL context；效能腳本的 `--portrait` 會實際點選騎士，分別記錄主戰場與肖像 draw calls。

建置後的實際壓縮傳輸稽核：

```powershell
node node_modules/tsx/dist/cli.mjs tests/manual/rts-download-budget.ts
```

這會在隨機 loopback 埠提供 `.vercel/output/static`，對可壓縮內容啟用 gzip level 6，實際載入河谷並記錄 HTTP body bytes。它只證明該本機 host 設定；外站／CDN 的壓縮與部署仍需另驗。

## 原始素材與限制

唯一設計來源是 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。原創生成圖、prompts、Blender 原檔、各版候選／失敗證據、glTF validator 與 WebGL 五動作圖都保存在 `art-factory/rts/`。

| 資產 | 正式來源目錄 |
|---|---|
| 建築 | 施工組裝來源在 `runs/building-stages/2026-10-08-v1`、`runs/building-stages-remaining/2026-10-09-v2`；二、三級主城頂飾修正版在 `runs/all-models/2026-10-14-v1/raw/townhall-tier2-finials.blend` 與 `townhall-tier3-finials.blend`，逐棟路徑見 `manifests/building-registry.json` |
| 衛兵 | `runs/all-models/2026-10-14-v1/raw/guard-assembly.blend` |
| 工人 | `runs/all-models/2026-10-14-v1/raw/worker-assembly.blend` |
| 弩手 | `runs/all-models/2026-10-14-crossbow/final/raw/crossbow-assembly.blend` |
| 掠兵 | `runs/all-models/2026-10-14-v1/raw/neutral-raider-assembly.blend` |
| 牧師 | `runs/all-models/2026-10-14-v1/raw/priest-assembly.blend` |
| 統領 | `runs/commander-assembly/2026-10-14-v1/raw/commander-assembly.blend`；前版動作來源保留於 `runs/work-cast/2026-10-11-v2` |
| 騎士 | `runs/all-models/2026-10-15-knight-mouth/raw/knight-lod0.blend` 與 `knight-lod1.blend` |
| 攻城車 | `runs/all-models/2026-10-14-props/final/raw/siege-lod0.blend` 與 `siege-lod1.blend` |
| 石塊 | `runs/all-models/2026-10-14-props/raw/repaired/rock.blend` |
| 廢墟 | `runs/all-models/2026-10-14-v1/raw/rubble-a-settled.blend` 與 `rubble-b-settled.blend` |
| 土徑與河水 | `runs/terrain-detail/2026-10-05-v1` |

上述路徑相對於 `art-factory/rts/`。實際載入清單是 `public/assets/games/rts/model-registry.json`，完整來源與 hash 在 `art-factory/rts/manifests/`；執行 `python art-factory/rts/tools/audit_runtime.py` 可檢查沒有遺漏、未登錄或 hash 不符的 runtime 美術。

10-15 已整批驗收並套入 34 組模型、46 個 GLB，包含 8 種動態單位的 47 段動畫。握持、手腕、騎乘、韁繩與接地修正版的逐檔來源在 `runs/all-models/2026-10-14-v1/candidate-sources.json`；完整清單與驗收在同目錄的 `qa/published-model-coverage.json`、`qa/delivery.json`。工人、衛兵與弩手仍保留 10-09 來源清理追溯；雙 LOD 的實際來源與 SHA 以 `unit-registry.json` 為準。受限舊幾何的回歸檢查會比對幾何指紋，不只依模型名稱判定。

工人有 Mine／Chop／Build、牧師有 Cast、統領有三種專用技能；原五動作保留，缺少專用片段的舊素材仍有 Attack fallback。移動施法使用 Walk 下半身、技能上半身，施法與受擊依模擬時間暫停。首輪數值不宣稱競技平衡，程式／機械 QA 也不等於使用者已接受整體商業美術品質。

10-15 整批修整後，80 單位＋20 建築＋騎士肖像在同機 1080p 的 60 秒量測為 **58.48 FPS／p95 23.9 ms**；來源鎖定的 production-mode fixture 使用正式建置頁面，但不是 Astro 遊戲 chunk 的相同位元組。遠景陰影以 30 Hz 更新，近景陰影與骨架動畫逐幀更新；完整條件見 `runs/all-models/2026-10-14-v1/qa/test-results.json`。另以實際正式建置 HTTP 載入兩圖，遊戲資產 gzip 傳輸為 **28.77／29.32 MB**（全頁本地傳輸 **29.03／29.59 MB**），模型與共用貼圖解碼後 SHA 均相符；證據在 `runs/commercial-readiness/2026-10-15/qa/current-gameplay/download-{river,pass}/download-budget.json`，不代表外站 CDN 傳輸。

2026-10-11 Work／Cast 與祭司步態修正版，在本機 RTX 5090 Laptop／Chromium、1080p、80 單位＋20 建築＋騎士動態肖像正式量測 60.13 秒：**57.80 FPS／p95 28.0 ms**，最大計時器延遲 **368.7 ms**、最長 Long Task **203 ms**，通過原規格「無連續 500 ms 主執行緒凍結」。全部單位／建築可見、零頁面錯誤；證據在 `art-factory/rts/runs/work-cast/2026-10-11-v2/qa/performance-main-thread-contract/`。先前 551.4／675.5 ms 的 RAF 間隔報告保留；畫面間隔不等於主執行緒凍結，因此新工具另收 25 ms timer 與 Long Tasks，最大 RAF 仍列診斷。未修改遊戲程式或宣稱解決所有環境抖動。正式建置兩圖全部本地 gzip 傳輸為 27.90／28.45 MB，低於 35 MB；本機結果不代表所有裝置或外站 CDN。

同日較早基準為 48.08 FPS、未達門檻，保留在 `perf-baseline/`。三個 LDPlayer 未擅自關閉，量測有系統負載變動；中間的材質共用實驗在交錯量測中沒有穩定收益，已完整撤回，不能將 48→60 FPS 宣稱為程式優化成果。後續動作／資產變更後仍須再驗最終版本。

最新執行結果與既有全站失敗記於 `docs/games/rts-progress.md`。本分支尚未對外部署或推送。
