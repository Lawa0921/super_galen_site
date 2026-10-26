# 2026-10-24 對話表情第二輪（洛恩、凜兩套＋第一輪重做 4 張，codex）

- 依據：`ui2/story.ts` 的 `CALM_NORMALS` 註解與 PR #312（洛恩重場景的頭貼隱藏、凜退回平靜的 normal，真正的修法是第二批表情）；使用者 2026-10-24 指示，codex（「當然是用 codex 的」）。
- 範圍（`faces.WAVE2`，劇本句數取自 `data/story.zh-TW.ts`）：洛恩 `serious`（15 句）、`distant`（18 句）；凜與凜（誓約後）各 `serious`、`guarded`（兩套合計 16、7 句）。`distant` 只屬於洛恩、`guarded` 只屬於凜（`SPECIAL_MOODS_OF`），所以是 6 張。凜兩套照 spec §10.5 各自附自己的 normal 頭貼與立繪原圖，prompt 另外鎖住領口鈴鐺（`rin` 有裂痕，`rin-oath` 敲平、無裂痕）。洛恩加一句「頭貼不帶劍」；他的 normal 帶微笑，所以 serious 明講 no smile。
- 重做（`faces.REDO`，各用掉最後 1 次額度 a2）：絲嘉蕾 `vow`、瑟蕾 `wistful`、諾艾兒 `sad`、波比 `sad`。核准版 a1 仍在登錄表與 `public/`，沒有動；a2 只在 `work/<id>/cand/a2/`，等使用者選。
- 生成：`faces.py gen --wave=2`，codex 預設模型 `gpt-6-astra`（codex-cli 0.164.0，log 標頭），一次一個、各在新的空資料夾 `raw/<id>/a<N>/`。共 **12 次呼叫**（新 6 張 a1、重做 4 張 a2、洛恩 distant 與凜誓約後 serious 的 a2），全部有輸出，log 沒有 usage／rate limit 訊息，沒有撞到上限。
- a2 的修正句（`faces.WAVE2_NOTES`，看過 a1 後加上）：洛恩 distant a1 視線往下、嘴微張，原尺寸像他的 sad，a2 要求視線平、看向遠方；凜（誓約後）serious a1 在原尺寸太接近 normal，a2 要求眉壓低、眼微瞇。
- 後處理：和第一輪相同（`faces.py cand`，`sl_art.py process --kind sprite`，base 自己的 block，`allow_edge: [bottom]`，codex 不套修補旗標）＋ `match_qa` 對照 normal。codex 原圖的 gate「碰邊」都是底邊，和第一輪一樣，後處理允許。

## QA（全部通過）

| id | 次數 | 機械 QA | 對照 normal（差、block、色盤） | 封閉洞 |
|---|---|---|---|---|
| hero serious | a1（選定） | 通過 | 111×113，差 0,0，11／11，100% | 0 |
| hero distant | a2（選定）；a1 淘汰 | 通過 | 111×113，差 0,0，100% | 1 |
| rin serious | a1（選定） | 通過 | 101×113，差 0,+1，99.9% | 0 |
| rin guarded | a1（選定） | 通過 | 101×112，差 0,0，99.8% | 0 |
| rin-oath serious | a2（選定）；a1 淘汰 | 通過 | 101×114，差 0,+2，99.9% | 2 |
| rin-oath guarded | a1（選定） | 通過 | 102×112，差 +1,0，99.8% | 0 |
| scarlet vow | a2（候選） | 通過 | 108×115，差 0,0，99.5% | 1 |
| selene wistful | a2（候選） | 通過 | 123×114，差 0,0，99.9% | 12 |
| noel sad | a2（候選） | 通過 | 118×119，差 0,0，99.8% | 4 |
| bobby sad | a2（候選） | 通過 | 123×121，差 +1,0，99.6% | 1 |

magenta 殘留 0、半透明 0、只碰底邊。封閉洞是 1 px 的縫（瑟蕾在頭髮與帽飾，和第一輪 a1 的 11 個同一處）。

## 登錄表

- 6 張新表情 `status: qa_passed`、`generator: codex/gpt-6-astra`、`batch: faces-<artId>`、`depends_on` 是該套的 normal 頭貼與立繪。和第一輪一樣 runtime 路徑已填，**圖還沒發佈**（不在 `public/`）。所以 `artPaths.test.ts` 的「registry runtime 與 `allArtUrls()` 完全相同」在發佈前是紅的（434 對 428），第一輪的 e27e73ac2 也是同樣狀態；發佈那個 commit 把 6 張加進 `PUBLISHED_FACES` 就會綠。
- 淘汰：hero distant a1、rin-oath serious a1，原因記在 `rejected_attempts`。
- 重做的 4 個 id 只有登錄表外的候選；使用者選了新版才 `faces.py pick --wave=2 --id <id> --attempt 2`。
- 第一輪 4 個 id 的 `cand/a1/cand-registry.json` 因為重跑 `cand`，`generator` 從 `codex` 補成 `codex/gpt-6-astra`（log 讀出的模型），圖檔 bytes 不變。

## 目視判斷（Read 看原尺寸、3×、5× 臉部特寫）

- 身分與畫風：12 張都是同一個人、同一個畫風，服裝、髮型、配色、構圖和 normal 一致，像素一樣銳利。凜兩套的鈴鐺沒有混用（有裂痕的鈴／敲平的圓片）。
- 洛恩 serious：微笑拿掉了，眉壓低、嘴成一直線，讀得出來；原尺寸下差別不大，因為他的 normal 本來就只是淡淡的笑。
- 洛恩 distant（a2）：視線平、看向側邊遠處，沒有笑，和 sad（眉頭皺、眼半閉）分得開；原尺寸偏淡。a1 比較像難過。
- 凜 serious：眉頭明顯壓低、正面直視，最清楚的一張。
- 凜 guarded（兩套）：半垂眼＋手握短刀柄在胸前，原尺寸靠刀和手一眼就認得出是「戒備」。
- 凜（誓約後）serious（a2）：眉壓低、眼微瞇，比 a1 明確，但仍比凜（有裂痕）那張 serious 淡一點。
- 重做：
  - 絲嘉蕾 vow **新的較好**：金邊鐵手套平按在胸口、清楚可見，表情是抬頭、睜眼的端正，不再像皺眉的 serious。
  - 諾艾兒 sad **新的較好**：眉尾上揚、臉頰一道明顯的淚痕、嘴角下垂。
  - 波比 sad **新的較好**：眉頭上揚、垂眼、臉頰有淚痕，比舊版的皺眉清楚。
  - 瑟蕾 wistful **沒有比較好**：還是垂眼、小嘴，看不出淺笑，和舊版、normal 都很接近。額度已用完（a2），建議保留舊版，或由使用者決定是否破例再給一次。

## 核准與接進遊戲（2026-10-24）

- 使用者對建議回「繼續」：6 張新表情全部採用；重做的絲嘉蕾 vow、諾艾兒 sad、波比 sad 用 a2 換掉舊版；瑟蕾 wistful 保留第一輪 a1。
- 發佈：重做的 3 個 id 先 `faces.py pick --wave=2 --attempt 2`，舊的 a1 記進 `rejected_attempts`（「被第二輪 a2 取代」，檔案留在 `work/<id>/cand/a1` 與 raw 當證據）；瑟蕾 wistful 的 a2 記為淘汰，留在 `work/…/cand/a2`，不在 runtime 路徑。9 個 id 用 `sl_art` approve（`approved_by` 記日期與原話「繼續」）→ `publish --approved`。manifest 從 428 筆變成 434 筆；3 張重做直接覆蓋同名 runtime 檔（逐位元組對照過是 a2），瑟蕾 wistful 對照過仍是 a1。
- 程式：`render/artPaths.ts` 的 `PUBLISHED_FACES` 加上 hero serious/distant、rin 與 rin-oath 的 serious/guarded。`ui2/story.ts` 的對應表本來就有：重場景裡 resolve、surprised、guarded 先找自己的臉、再找 serious，averted 找 sad（垂眼，不是戒備）。凜用哪一套和她的 normal 同一條規則（`artIdOf`：誓約前有裂痕的鈴、誓約後敲平的鈴），兩套不混用。拿掉「洛恩重場景隱藏頭貼是刻意的」那段註解。
- 涵蓋（`ui2/storyFaces.test.ts`，重場景裡洛恩與凜的 107 句，每句照它自己的時期算：帶 `if.oath: true` 的句子用誓約後那一套）：
  - 之前：洛恩 18 句不顯示頭貼（serious、resolve、surprised），另外 18 句 distant 借他的 sad；凜 20 句退回平靜的 normal。
  - 之後：107 句都顯示自己的臉（95 句）或接近的臉（12 句），0 句隱藏、0 句退回 normal。
