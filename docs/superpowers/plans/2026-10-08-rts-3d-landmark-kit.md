# 原創 3D 地標製作工作包

唯一美術來源：`docs/superpowers/specs/2026-10-04-browser-rts-design.md`。本工作包隸屬 `2026-10-08-rts-commercial-readiness.md`，不是另一份風格指南。

## Global Constraints

使用者要求「都修完達到商用水準再叫我看」，不向使用者徵求局部批准。所有素材原創製作，不下載第三方模型或動畫。風格為細緻風格化中古人類王國，石灰岩、深藍染布、暖黃銅、磨損木作與皮革。沿用本專案既有經記錄的生成材質來源；不套用 CS/pet。禁止用簡單幾何堆疊、固定視角卡片、色塊或假裝飾當完成美術。

平行製作位於 `C:/Users/bag57/projects/super_galen_site_rts_landmarks_commercial`，分支 `feat/rts-commercial-landmarks`，基線 `79789f39fd8e0112482ef3e389add73c2420edf4`。主要 RTS 工作樹 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts` 只供讀取最新來源；不得寫入、restore、stash、reset 或覆蓋。主代理會處理 runtime 接線與整體審查。本工作包不 commit、push、deploy 或替換 public runtime。

### Task 1: 製作四種可組裝的原創地標候選

目的：替換現有 `kingdom-ruins.webp` 的地標卡片層。只做可審查資產，不改 terrain、AI、尋路、資源、renderer 或玩法。現有地圖配置在主要工作樹 `src/scripts/games/rts/districts.ts`；每張圖四個放置點，兩種 prefab 各鏡像一對。

四種唯一 asset ID 與方向：

| ID | 地圖 | 組裝內容 |
|---|---|---|
| river-gatehouse | 雙河谷地 | 廢棄河哨門樓：有厚度與石拱楔塊的破損拱門、低牆、牆冠、殘存木柵與散落石構；屬阻擋裝飾，不暗示可穿行門洞 |
| river-shrine | 雙河谷地 | 水岸遺址：磨損階台、原創日輪祭台、破損立柱與環繞矮牆；高度低於門樓，剪影寬而低 |
| highland-watchtower | 灰脊隘口 | 高地廢塔：有內壁厚度的多面石塔、真實窗洞與破損牆頂、木梁殘架；四者最高，剪影清楚 |
| quarry-ruins | 灰脊隘口 | 採石遺跡：階狀切石工作面、楔孔與裂縫、破損木吊架/絞盤、繩索及石料；剪影橫向不對稱 |

每 prefab 水平 bounds 必須位於以原點為中心的 3.8×3.8 m footprint 內，ground pivot 在 `(0,0,0)`，Blender Z up、GLB Y up、scale1。最高點不超過5.2 m。結構地基可低於地面最多0.08 m以避免接地縫。支撐必須合理，無懸空塊、零厚面或明顯重疊閃爍。資源與功能建築辨識不得混淆；不放旗幟、可讀文字或資源icon。

以同一套可重用、可編輯的石構/木構零件組裝，保留清楚的模組命名、接合介面與來源。每種 prefab 至少有真正弧面/曲面、厚度與細節層級，不用一排未修邊方塊或材質噪聲代替形體。零件可以用原創 Blender 配方、控制網格、bevel/UV/材質生成，但完成形體必須實看。共用模組和材質減少 draw calls；不要每個小石塊獨立材質。LOD0目標6k–16k三角面，LOD1目標2k–5k，形體需要時回報理由，不以填滿面數作品質證明。每 prefab 至多4個材質，優先使用既有原創生成石、木、金屬貼圖。兩種當前地圖地標的壓縮下載合計目標≤2.0 MB；不足時提出可量化取捨，不降低成卡片。GLB大小與材質/貼圖實測回報。

所有寫入僅限自己的工作樹：

- `art-factory/rts/tools/landmark_kit_*.py`、必要的同前綴測試/Node QA；不修改共用工具。
- `art-factory/rts/contracts/landmark-kit-2026-10-08.json`（候選資產契約，不另建風格指南）。
- `art-factory/rts/runs/landmark-kit/2026-10-08-v1/` 的 raw/candidate/qa/prompts、配方快照、來源hash及報告。
- 這個工作包的 `.superpowers/sdd/` 報告。

主工作樹目前的 `prop-registry.json`、`terrain-registry.json`、`detail_build.py`、`river_bridge_build.py`、`buildings_v2_generate.py` 可唯讀參考，source `.blend` 的材質可依其已記錄來源重用。只將實際所需的來源複製到本工作包 raw inputs，保存原始路徑與 SHA。外部來源缺少權利或 prompt 證據時回報；不能自稱補齊。

驗收：

1. 原創 editable `.blend`＋LOD0/LOD1 `.glb`；凍結所有輸入、配方、材質來源與 SHA。未通過獨立審查的 runtime_publish_allowed 必須為 false。
2. 實際 Blender reimport 檢查 bounds/pivot/軸向/scale/面數/材質/UV/normal/遺失image/非預期退化及開放結構；每一有意開放邊界都需說明，不把門窗孔洞等同錯誤但牆面須有厚度。
3. glTF validator 無 error；若本工作樹缺 node 依賴，可使用主要工作樹既有只讀 node_modules 與 validator 做指定候選驗證，不安裝無關套件、不修改主要工作樹。
4. 每模型正面、背面、兩斜視近照，及固定 RTS 視角的整組地標畫面；實際查看渲染並自行修正明顯缺陷。需看GLB重匯入結果，不能只看來源Blend。
5. 新的幾何/組裝行為 helper 採先紅後綠，涵蓋成功及邊界/回歸；不要寫僅複製常數的測試。無 runtime 行為修改，不跑不相干全站測試。
6. 回報每候選的三角面、material/draw groups、下載大小、源與候選hash、具體QA結果、未完成/風險；不得宣稱整個遊戲商用或要求使用者看圖。

不派子代理、不自行叫 reviewer。完成後由主代理依單一 review-pr 入口委派獨立檢核。完整報告落在本plan的 `task-1-report.md`；回覆僅狀態、產出路徑、實測摘要與concerns。若同方法連續兩次失敗，第三次前先換方法/縮小工作包，回報失敗軌跡。
