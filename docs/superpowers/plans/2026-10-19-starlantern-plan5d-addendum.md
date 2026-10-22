# 星燈迷宮 計畫 5d 補遺：對照現況的修正、與 5e／5f 的排序、核准關卡

> 本文件**不取代** `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`（未追蹤，本文件不修改它）。執行 5d 時，凡與下列條目衝突之處，一律以本補遺為準。
> 觸發：使用者 2026-10-19「裝備應該要有對應的 icon 不是只有一個文字」。5d 正是這個要求的計畫；本補遺只修正 5d 寫成之後（6a–6c、名冊 spec、表情 spec）變得過時的部分。

## 讀過的現況（2026-10-19）
- `render/artPaths.ts`：`allArtUrls()` 是 **246**（`artPaths.test.ts` 釘住）；`published.test.ts` 的下限仍是 166；`registry.json` 有 246 個 `published`。
- 這 246 個裡面，5d 的東西一件都還沒有：沒有 `gear-*`、`ui-rarity-*`、`scene-forge`；`sl_art.py` 也沒有 `fit_side`、`process_gear_cell`、`nine_slice`、`silhouette`、`retire`；`gear_art.py`、`review_gear.py` 不存在。
- 裝備資料沒變：`EQUIPMENT` 25 件、`SPECIALS` 44 件（角色傳說 8、地區傳說 6、地區獨特 6、套裝 6×4）、5d 列的 12 種新素材也都還沒有圖示。舊的 15 件底材圖示（`icon-<base>`）仍是 `published`。
- 裝備目前在哪裡只有文字：
  - 裝備頁的背包格與人形格（`equip.ts` 的 `short(itemName(it))`，前四個字）；
  - 狀態頁的裝備欄（`statusTabs.ts` 的 `gearLabel`）；
  - 戰利品、寶箱與回城的文字行（`gearPart`：`battle.ts`、`event.ts`、`town.ts`）；
  - 鍛造屋的清單。
  只有商店的裝備列和傳送門的限定裝備，會在舊圖示存在時用 `art.icon(id)`。
- 計畫 6f（`2026-10-19-starlantern-plan6f-field.md`）讓裝備頁在迷宮裡也能用（冒險背包模式），和城鎮共用同一套格子的繪製。

## 1. 5d 過時的地方與確切修正

| # | 5d 原文 | 現況 | 修正 |
|---|---|---|---|
| S1 | 「`allArtUrls` 目前是 219」；樣本後 259；全部後 428 | 6a 加了洛恩、凜誓約後的立繪與頭貼；6c-moods 加了 `PUBLISHED_FACES` 的 6 張，所以現在是 **246** | 所有數字以 246 為基準重算（見 S3 的新數字）。Task 5 Step 1／4 的「仍是 219」改成「仍是 246」。 |
| S2 | 技能圖示 47 個（計畫 5b 的樹技能），7 張 `sheet-skill-<cid>` | `NO_ICON_YET` 另有 6a 的凜 10 個與洛恩 21 個（後者用 `owner === 'hero'` 篩出），共 **78 個** | 新增 `sheet-skill-rin-1`、`-2`（3×2，6＋4，丟棄 2 格）與 `sheet-skill-hero-1`…`-4`（3×2，6＋6＋6＋3，丟棄 3 格），丟棄格照 noel 的先例。`reference/crops/` 沒有 hero 與 rin，配色參考改附已核准的 `char-hero-standee`、`char-rin-standee`（凜用誓約前的樣子）。`gearArt.test.ts` 的技能集合不寫死數字，改成「`SKILLS` 裡目前不在 `allArtUrls()` 的 id」。 |
| S3 | 批次：樣本（含 `sheet-skill-scarlet`）→ 量產（裝備、素材、技能一起） | 使用者這次要的是「裝備」的圖示。技能已經有 27 個核准的圖示，畫風早就定了，不需要再放進風格樣本 | 分成三批，裝備不等技能：<br>**樣本 sample**：`sheet-gear-1`、`sheet-mat-1`、`sheet-rarity-frames`、`scene-forge`、`npc-forge`，共 32 件（9×2＋6＋6＋1＋1）。url 加 32、加 3 個剪影、減 1 件退役 → **280**。<br>**裝備量產 main-gear**：`sheet-gear-2`…`-8`、`sheet-mat-2`、`npc-forge-happy`，共 127 件（60×2＋6＋1）。加 15 個剪影、減 14 件退役 → **408**。<br>**技能 skills**：全部 14 張技能表（`sheet-skill-scarlet`、其餘 7 位夥伴、凜 2 張、洛恩 4 張），78 件 → **486**。<br>`gear_art.py` 的 `batch` 值改成 `sample \| main-gear \| skills`，`gen --batch=main-gear\|skills` 在沒有 `style_approved` 時照樣拒絕。`published.test.ts` 的下限，每批發布時設成發布後的實際件數（280、408、486），不再用 5d 從 166 推出的 206／375。 |
| S4 | 「已知衝突 4」：風格核准後，量產批由「機械 QA＋獨立代理視覺檢查」直接發布；Task 9 Step 6、Task 10 Step 1 的 `approve --by "style approved; reviewed by fresh agent"` | 5d 引用的「只有風格找使用者看」是**另一個專案（案上仙途）**的記憶，不適用星燈迷宮。本專案的規定是：美術要經使用者在審核頁核准才能發布（AGENTS.md 的 approval → publish） | 刪除衝突 4 的做法。**每一批**（sample、main-gear、skills）都要使用者在審核頁核准之後，才可以 `approve` 與 `publish`。`--by` 寫使用者的原話與日期。獨立代理的視覺檢查仍然要做，但它是交給使用者之前的前置步驟，不能取代使用者的核准。 |
| S5 | 已知衝突 1：「規格的雙刀、魔導書、彎刀、扳手，資料沒有」 | 6a 加了 `WEAPON_KINDS`：`crystal-blade` 現在是 `dagger`、`star-saber` 是 `scimitar`；`wrench`、`tome` 仍然沒有底材 | `GEAR_DESC` 照武器種類畫：晶刃畫成短刃，星紋軍刀畫成彎刀。它們是洛恩的武器專精依據，在 24px 下必須認得出是哪一種。扳手與魔導書仍然不在 5d 的範圍。 |
| S6 | Task 2 的 vitest：「裝備格的集合＝`EQUIPMENT`＋`SPECIALS`（69）」、「素材格＝`MATERIALS` 去掉已有圖的 10 種」 | 名冊 spec §11.1：7b 會把 `gear.roster.ts`（39 件專屬獨特）與 `materials.roster.ts`（98 種）合併進 `SPECIALS`、`MATERIALS`。到時這兩個測試會紅，而那些圖歸 5f | 兩個測試都扣掉名冊的 id：從 `data/*.roster.ts` 匯出的 id 集合；檔案還不存在時就是空集合。Task 5 改 `NO_ICON_YET` 時，保留名冊 spec 規定的「新素材在 `ROSTER_ART` 之前一律視為沒圖」這條路徑，不可以寫成只列 5d 的 id。 |
| S7 | Task 6 只考慮城鎮的裝備頁 | 6f 讓同一個 `EquipScene` 在迷宮裡顯示冒險背包 | Task 6 多一個測試：`phase === 'map'` 時，冒險背包的格子也有 `.slx-gear-ico`。6f 與 5d Task 6 都會改 `equip.ts`，兩者依序合併，後合併的那一個重跑 `equip.test.ts`。 |
| S8 | `artPaths.test.ts` 的總數由 5d 一個計畫推進 | 5e（表情 73 張 → 319）與 5f（＋100 敵人圖＋98 素材圖示，加上 39 件專屬獨特 ×2 張 = 78）也會改同一個數字 | 總數用「發布當下的實際值＋這批的件數」計算，在 commit 訊息與測試註解寫出算式。不要抄本補遺的絕對數字：本補遺的 280／408／486 只在 5d 先於 5e、5f 發布時成立。 |

下列各點仍然正確，不必修正：
- 檔名與 runtime 路徑（`gear/<id>.png`、`-large`、`-silhouette`、`ui/rarity-<r>.png`）；
- 九宮格外框、剪影改成美術檔（`.slx-codex-silhouette { filter: brightness(0) }` 仍在，照 5d 刪除）；
- 特殊裝備不借底材圖、沒有圖時只顯示文字；
- e2e 用 4352 埠、dev server 4354；
- 25／44／12 這三個數量。

## 2. 名冊的 98 種素材圖示與 39 件專屬獨特：留給 5f，不併入 5d
**裁定：不併入 5d。** 5d 只負責提供 5f 會用到的工具與風格錨點。

理由：
1. 這些 id 要等 7a／7b 的資料檔合併之後才存在。5d 的交叉比對測試建立在現在的資料上，先畫等於畫沒有資料的東西。
2. 名冊 spec §11.1 把每個 id 的圖示、裝備圖和它的敵人圖綁在 `ROSTER_ART` 一起發布。5d 先發布它們，就會打斷這個綁定，`allArtUrls` 的規則也要另外開例外。
3. 數量是 5d 的 2 倍（137 件對 69 件）。使用者現在要的是「現有裝備的圖示」，併進來只會延後它。
4. 5f 的批次跟著敵人圖的 R0–R4 輪次走（每輪 1–2 張 5×4 的工作表），和 5d 的節奏不同。

5d 要交給 5f 的東西（寫進 5d 的 contract 段落）：
- `process_gear_cell` 接受任何 id，不寫死 69 件；
- `sheet-gear-1` 的核准原圖，作為 5f 專屬獨特的風格錨點；
- `ui-rarity-unique` 外框，5f 的 39 件專屬獨特直接沿用，不另畫；
- 素材圖示的規格，和 contract 的「圖示」列相同（`--height 32`、24×24 框）。5f 的素材工作表附 5d 已核准的素材圖當參考。

## 3. 5d、5e、5f 的執行順序
codex 生成一次只能跑一張（`codex_still` 不能並行），所以「並行」只指程式碼與審核的等待時間，生成本身永遠排成一列。

1. **5d 的程式碼任務**（不需要美術，沒有圖時退回文字）：Task 1–3（工具與審核頁）、Task 5（路徑）、Task 6–7（介面）。
   - Task 6 和 6f 都改 `equip.ts`：建議 6f 的 Task 4 先合併，再做 5d Task 6（S7）。
2. **5d 樣本批生成** → 關卡 G1（使用者看風格）。
3. **等 G1 的時候**：生成 5e 的第 1 批（洛恩與凜的兩套表情；表情 spec §11.4 的順序）。這一批照 5e 自己的核准規則走。
4. **G1 通過之後**：生成 5d 的裝備量產批 → 關卡 G2 → 發布。這一步完成時，使用者的第 3 個要求就達成了：背包、人形、詳情、清單、戰利品都有圖示。
5. **5d 的技能批** → 關卡 G3 → 發布。5e 的其餘批次，排在 5d 每批之間的等待時間。
6. **5f 的 R0**：前提是 5d 的工具已經合併，而且 G1 已經通過（5f 的專屬獨特要用 gear-cell 工具與已核准的錨點）。5f 的敵人圖不依賴 5d，但 R0 的圖示表含 2 件專屬獨特，所以整個 R0 排在 G1 之後。
7. **發布的 commit 依序合併**。5d、5e、5f 的每一次發布都要改 `artPaths.test.ts` 的總數與 `registry.json`；後合併的那一個用當下的實際值重算（S8）。

## 4. 使用者核准關卡
每一關都要照下面的程序走：
1. 用審核頁的腳本產生 HTML；
2. 主對話用 Artifact 工具發布成網址（`files` 帶 `img/*`，超過 255 檔就分兩次發布到同一個 url）；
3. 派一個沒參與生成的代理先做視覺檢查，修完再發布到同一個網址；
4. 把網址交給使用者；
5. 使用者核准之後，才可以 `approve --by "<使用者原話> <日期>"` 與 `publish`。使用者提出異議的件，記進 `rejected_attempts`，重做之後再回到第 1 步。

| 關卡 | 內容 | 要請使用者決定的事 |
|---|---|---|
| **G1** 5d 樣本 | 9 件裝備（大圖＋小圖示）、6 種素材、5 種稀有度外框＋傳說光暈、鍛造屋、多蘭 | 裝備圖的畫風與大小比例；外框與光暈；多蘭的外型；15 件舊底材圖示是否全部換新（5d 衝突 2） |
| **G2** 5d 裝備量產 | 60 件裝備、6 種地區素材、多蘭笑臉、15 個剪影 | 逐件確認；特別看每套 4 件是否一致、24px 下有沒有兩件分不出來 |
| **G3** 5d 技能 | 78 個技能圖示 | 和既有的 27 個技能圖示並排，確認一致 |
| 5e 每一批 | 表情差分 | 照表情 spec §10.5 |
| 5f R0 與每一輪 | 敵人圖、素材圖示、專屬獨特 | 名冊 spec §13.5 寫「R1 以後照 5d 自行發布」，同樣受 S4 修正：每一輪都要使用者核准 |

**每一關都要通過的機械條件**（AGENTS.md 的 Game Art Asset Policy；`sl_art.py` 自動檢查，不通過就不能送審）：
- 只用生成的美術（codex）。不可以用色塊、線條、佔位幾何、假圖示、假外框，也不可以用 CSS 或 `::before`／`::after` 畫物品、外框或剪影。剪影只能由已核准的圖確定性轉出。
- 透明素材畫在純 magenta `#FF00FF` 上，並通過 alpha QA：
  - 沒有 key 色殘留；
  - 沒有半透明的霧邊；
  - 主體不碰畫布邊、不被原圖畫布切到；
  - 16px 以下的封閉洞只列為警告，被過度擦除的內部要人工看。
  - 九宮格另外檢查 `center_clear`、`ring_closed`、`edge_repeat`。
- 圖片裡沒有任何文字或數字；prompt 寫 `No text`。
- prompt 不寫任何作品名或畫師名，並加上原創句。
- 被淘汰的版本不可以留在 `public/`，原因記在 `rejected_attempts`。`runtime` 只在發布的 commit 寫入，和 `NO_ICON_YET` 的刪除放在同一個 commit。
