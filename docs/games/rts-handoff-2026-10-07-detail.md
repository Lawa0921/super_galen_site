# 原創模型與地圖細修（2026-10-07）

依使用者「把建模和地圖做得更精細」完成這輪建築立面、裝備材質、石橋、岩面與地表光照細修。沿用唯一設計規格 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`，全部素材來自既有原創 Blender／生成貼圖；沒有外部角色、動作或新美術風格。

- 遊戲：<http://127.0.0.1:4324/games/rts/>
- 可旋轉模型前後比較：<http://127.0.0.1:4334/model-detail/>
- 雙地圖截圖比較：<http://127.0.0.1:4334/model-detail/maps.html>
- 工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。本輪僅修改本機，沒有 commit、push 或部署。

## 可見變更與界線

- 12 種建築版本補上石框、木構、鐵件、黃銅、布料的 PBR 表面；既有窗加入木窗扇／鉸鏈，有適用牆體的窗洞真正切入，玻璃退入牆內。木門增加鐵鉸鏈，木柱增加接合鐵件。
- 當前平橋沿用 `riverbank/2026-10-07-v1/raw/stone-bridge-level.blend`，只細修表面，沒有復用早期高橋。橋面、橋墩與通行位置保留。
- 岩石由 388 提升至 1,728 三角面，使用原創岩面亮度衍生淺浮雕，維持原分件包圍盒與地圖通行占地。
- 衛兵劍盾、弩兵木／金屬／皮革裝備補上原創材質與粗糙度／法線。兩兵種雙 LOD 的 BIN、幾何、UV、法線、骨架、權重、五段動畫及保守包圍球逐位相同。**這輪沒有重建全身或重做弩身輪廓。**
- 地表依既有草地／林地／河礫／隘口權重衍生凹凸與粗糙度，沒有增加 terrain atlas 或改通行、資源、地標位置。凹凸是原圖亮度近似，並非掃描高程。

## 資產與載入

Factory run：`art-factory/rts/runs/detail-refinement/2026-10-07-v1`。合約：`art-factory/rts/contracts/detail-refinement.json`。來源、候選及發布 SHA 位於 `qa/build.json`、`qa/structural.json`、`qa/publication.json` 和 building／prop／unit／detail-material registries。每件新模型保留 editable `.blend`；舊來源、舊 GLB 與舊 registry 保留。

18 個正式 GLB（12 建築版本、橋、岩石、兩兵種雙 LOD）共用 26 個貼圖檔，URI 是相對 `../materials/detail-v1/`。單獨拿 GLB 需一併攜帶 materials 目錄；preview 已打包完整依賴。

初測共用檔案仍被各 GLB parser 重複請求：276 次材質 request，首局資產 52,197,833 B，超過門檻。修正為 `ModelLibrary` 範圍的 `SharedMaterialLoader`，共用下載／解碼 Promise，每次回傳獨立 Texture wrapper，避免 sampler 污染，沒有啟用全域 THREE.Cache。缺少必要貼圖會回大廳重試，離開時釋放模型 wrapper 與來源 cache。

正式 gzip 靜態建置重測：**30,363,629 B** 遊戲資產，75 requests；共用材質 **26 requests／26 URLs／0 重複**，errors 為空。含其他頁面檔案共 30,604,996 B。比前輪 31,913,293 B 少 1,549,664 B；35 MB 門檻通過。這是本機 gzip host，沒有宣稱驗證部署 CDN。

重新執行 `detail_build.py` 在舊快照存在時會優先讀 `raw/previous-registries` 固定前版來源，避免在已細修模型上重複增加窗扇或變形。目前 18 個前後 preview 的舊版 SHA 均與舊 candidate 一致。腳本仍有初次建置 fallback；若移除舊快照或變動舊來源，不能保證阻止來源漂移，重建前必須保留並核對這些證據。

## 實際驗證

- Python 材質／GLB 打包測試 4/4。先紅後綠覆蓋法線方向、平面法線、移除嵌入圖片後幾何／動畫 bytes 保留及拒絕圖片／幾何共用 bufferView。
- 全套 Vitest **140 files／1,429 tests 通過**；新增地表兩項、cache 三項及 GLTF 缺圖一項回歸。
- 最終 strict type-check 涵蓋 90 個 RTS／E2E／manual TS 檔及新增 review TS，通過。這次完整列檔檢查發現 `TextureLoader` 需要 `Texture<HTMLImageElement>`，已校正載入器與測試替身的泛型；重跑相關 3 files／41 tests 通過。Production build 通過。泛型修正不變更 runtime 行為。
- Khronos validator：18 GLB **0 error**。四個人物 LOD 完整資料保留、建築與岩石 footprint、面數、26 外部圖片依賴通過。
- 9 套材質通過尺寸、完全不透明、OpenGL 法線方向與單位長度、tile 邊緣、MR 通道檢查；證據 `qa/texture-gates.json`。
- 實際 WebGL：18 模型前後比較，雙 LOD 五動作截圖，errors 為空。衛兵／弩兵未修改動作；不將這些抽樣宣稱為新增的全時間碰撞證明。
- Chromium E2E **13/13 通過**，包括真實 HTTP 材質 503 → 回大廳 → 重試成功 → 重開對局；同一貼圖兩次載入嘗試各請求一次，重開不重下。
- 雙圖 candidate／published assembly：選取、霧中物件、揭露地標、真實滑鼠採木耗盡皆成功。全景用測試視野揭露，不是自然探索或新一輪自然勝局。
- 1080p／DPR 1／80 單位＋20 建築全在畫面／騎士動態肖像，RTX 5090 Laptop GPU 的獨占 Chromium 60 秒量測：3,938 幀，**median 60.6 FPS／16.5 ms、p95 24.9 ms、max 37.6 ms**，errors 為空，通過 55 FPS 門檻。前輪同條件 median 80 FPS；這輪增加表面細節後的效能成本仍存在，不能宣稱沒有退步。四個瀏覽器載入人物檔 SHA 與 public 相符。完整記錄 `qa/performance/`。
- 首次效能腳本在開測前點到騎士前方的攻城車，未完成測量。腳本改為有限次重取即時位置、用真實滑鼠選取可見騎士；沒有更改 fixture 位置、命令或生命。失敗選取證據保留於 `qa/performance/performance-selection-failure.json/png`。
- 最終 preview：18 個模型選項、衛兵與弩兵的 Attack／暫停播放／同步旋轉、16 張地圖圖檔及遊戲大廳連結均通過，errors 為空；證據 `qa/preview-release.json`、`qa/preview-model.png`、`qa/preview-maps.png`。首次 smoke 腳本誤將大廳隱藏戰場 canvas 當成失敗，改驗實際大廳的「開始戰役」按鈕後通過。

## 獨立檢核與限制

唯讀代理依單一 review-pr 流程抽查來源、實際 GLB、材質 SHA、舊橋版本與圖面，未發現阻擋；另查 Three.js 原碼及 cache 失敗／釋放語意，無明確阻擋。真實下載已獨立抽驗；不代表整體商用品質核准。

大片淺色基座仍明顯，岩石尖角有局部 UV 拉伸；弩身仍是原輪廓，人物比例、關節與全身品質問題沒有在本輪全部處理。前輪固定相機的植被／遺跡卡仍保留。部分建築低於規格的 10k 面數目標，保留已可辨識輪廓與遊戲視角細節，沒有為湊面數增加無效細分。正式原創美術整體接受狀態仍待使用者檢視。

正常 UI 以 loading guard 阻擋同時開局；`ModelLibrary.load()` 不支援任意外部併發呼叫隔離。模型比較頁是工具用途；遊戲正常操作流程與字型未更換。
