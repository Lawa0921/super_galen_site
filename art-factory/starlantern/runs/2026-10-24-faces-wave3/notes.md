# 2026-10-24 對話表情第三輪（莎菲拉 serious、諾艾兒 pout＋瑟蕾 wistful 再試一次，codex）

- 依據：`ui2/storyFaces.test.ts` 的整份劇本統計還有 `'heavy hidden': 5`（註解：「The 5 still hidden are companions' (Safira, Noel: no serious face)」）。重場景裡，夥伴的心情沒有自己的臉時找 `NEAR_FACE`；`surprised` 與 `pout` 都對到 `serious`，而莎菲拉、諾艾兒只發佈了 `sad`，所以這 5 句只顯示名牌。
- 5 句（逐句列舉：在暫存區用 tsx 跑 `speakerOf(..., heavy)`，和測試同一套 `allArtUrls()`；結果和測試的 5 相同）：

| 場景 | 說話者 | 標籤 | 台詞 | 這一輪給的臉 |
|---|---|---|---|---|
| mem:safira:4 | 莎菲拉 | surprised | 「做決定的……不是我？」 | serious（`NEAR_FACE` surprised → serious） |
| mem:noel:1 | 諾艾兒 | pout | 「幹嘛那樣看我。是借的啦，只是沒說一聲。」 | pout（自己的臉） |
| mem:noel:2 | 諾艾兒 | pout | 「小氣鬼。老師一定是怕我太厲害。」 | pout |
| finale | 諾艾兒 | pout | 「袖子裡這一片，藏到今天了。拿去吧，本小姐自己交出去。」（看過 group:act2 才出現） | pout |
| finale | 諾艾兒 | pout | 「旅館的燈一暗，都是本小姐點小雷光，你每次都說剛好。這次不點雷光了，這一段，本小姐親手交出去。」（沒看過 group:act2 才出現；和上一句二選一） | pout |

- 選表情：
  - 莎菲拉 → `serious`。她的這句只出現一次，`serious` 也是重場景裡 surprised／bewildered／focused／alert／guarded／resolve／pout 共用的備援臉，之後再有重場景台詞也用得到。
  - 諾艾兒 → `pout`，不是 `serious`。4 句劇本本來就標 `pout`（`SPECIAL_MOODS_OF.noel` 已有），用自己的臉是完全對應，不是借臉；她另外 3 句輕場景的 pout（chat:noel:2、banter:noel-rin:1、banter:noel-selene:2）現在借帶笑的 normal，有了 pout 也一起換掉。`serious` 套在「小氣鬼。老師一定是怕我太厲害。」這種賭氣句不像她。prompt 要的是「賭氣、倔強」而不是可愛的嘟嘴（no smile、no blush、眼睛別開），放在重場景也不會輕佻。
  - 如果要改成諾艾兒 `serious`，是另外一張圖，這一輪沒有生。
- 瑟蕾 `wistful`：第一輪 a1 在遊戲裡，第二輪 a2 已淘汰；使用者破例多給一次（a3）。目標：看得出的淺笑＋往下、往遠處的視線，和 normal、sad 分得開。

## 生成

- `faces.py gen --wave=3`（`faces.WAVE3`、`WAVE3_FACES`、`WAVE3_REDO`；每個 job 帶 `max_attempts`：新表情 2、瑟蕾 3，`gen` 不會超過），codex 預設模型 `gpt-6-astra`（log 標頭），一次一個、各在新的空資料夾 `raw/<id>/a<N>/`。
- 共 **3 次呼叫**：莎菲拉 serious a1、諾艾兒 pout a1、瑟蕾 wistful a3。全部有輸出，log 沒有 usage／rate limit 訊息，沒有撞到上限，沒有用 Gemini。
- 兩張新表情的 a1 看過後都讀得出來，沒有生 a2（`WAVE3_NOTES` 是空的）。
- 後處理：和前兩輪相同（`faces.py cand`，`sl_art.py process --kind sprite`，base 自己的 block，`allow_edge: [bottom]`）＋ `match_qa` 對照 normal。瑟蕾只處理 a3（a1、a2 的 `cand/` 是已提交的證據，沒有重跑）。

## QA（全部通過）

| id | 次數 | 機械 QA | 對照 normal（尺寸、差、block、色盤） | 封閉洞 |
|---|---|---|---|---|
| safira serious | a1（候選） | 通過：magenta 0、半透明 0、碰邊 0 | 121×122，差 0,0，9／9，99.9% | 5 |
| noel pout | a1（候選） | 通過：magenta 0、半透明 0、碰邊 0 | 118×119，差 0,0，10／10，99.8% | 4 |
| selene wistful | a3（淘汰） | 通過：magenta 0、半透明 0、碰邊 0 | 123×114，差 0,0，10／10，99.9% | 9 |

封閉洞逐像素對照過 normal：莎菲拉在耳環圈內、辮子縫，和她的 normal 同一處（normal 8 px、這張 10 px，多 2 個 1 px）；諾艾兒的 38 px 和 normal 完全同位置（帽簷與頭髮之間）；瑟蕾和第一、二輪一樣在頭髮與帽飾。

## 登錄表

- 使用者要的 `status: review` **不存在**：`sl_art.py` 會寫的狀態只有 `processed`、`qa_passed`、`qa_failed`、`approved`、`published`、`rejected`、`retired`（登錄表另有舊的 `unused`）。沒有自創狀態，也沒有跑 `pick`（`pick` 會寫 `qa_passed`）。
- 所以兩張新表情**沒有進 `registry.json`**，只有 `work/<id>/cand/a1/` 的候選（含 `cand-registry.json`、`qa.json`、`match.json`），和第二輪重做的候選一樣。使用者核准後才 `faces.py pick --wave=3 --id <id> --attempt 1`，再 approve／publish。
- 瑟蕾 a3 用 `faces.py note` 記進 `rejected_attempts.a3`（只改這一個欄位），圖留在 `work/char-selene-portrait-wistful/cand/a3/` 當證據，不在 runtime 路徑；遊戲中的 a1 沒動。
- 沒有動 `public/`、manifest、`PUBLISHED_FACES` 或 `src/`。

## 目視判斷（Read 看原尺寸、4×、7× 臉部特寫）

- 身分與畫風：3 張都是同一個人、同一個畫風，服裝、髮型、飾品、配色、構圖和 normal 一致，像素一樣銳利。
- 莎菲拉 serious（a1）：笑容拿掉了，眉壓低、嘴是平的一字（嘴角微下），眼神直視。和 normal（笑）、sad（淚痕）在原尺寸都分得開；配「做決定的……不是我？」讀起來是發燒中慢慢意識到的沉重，可用。
- 諾艾兒 pout（a1）：眼睛斜向一邊、眉頭壓低，嘴是很小的抿嘴。原尺寸靠斜眼和皺眉讀得出「賭氣、不服」；嘟嘴本身很小，看不太出「嘟」，但整體情緒對。重場景（回憶裡偷書、終章交出記憶）不顯得輕佻。
- 瑟蕾 wistful（a3）：**淘汰**。眼皮更低、視線往下，比 a1 更像在回想，但要的淺笑在原尺寸看不到，嘴只是一個小點；和 a1、a2 很接近，沒有「明顯比較好」。依授權只有這一次，a1 保留。
- 結論：莎菲拉 serious、諾艾兒 pout 可以給使用者看；瑟蕾 wistful 維持第一輪 a1。

## 審核頁

- `review.html`：一、兩張新表情和該角色每張已發佈的臉（normal、sad）並排，原尺寸＋2×，附它要解決的台詞與 QA；二、瑟蕾 wistful：遊戲中 a1、淘汰的 a2 與 a3、normal、sad；三、5 句台詞放在遊戲對話框樣式裡（照 `_starlantern-ui.scss` 的 `.slx-screen`／`.slx-talk`／`.slx-name`／`.slx-talk-face` 與 `ui/window.png` 框、Cubic 11 12px，640×360 舞台 1×），左邊是現在（只有名牌），右邊是用新表情。字型直接引用 `public/assets/fonts/cubic-11/`，從 repo 內開檔才載得到。
- `montage.png`：3× 總覽。
- 產生：`python art-factory/starlantern/tools/review_faces.py wave3 2026-10-24-faces-wave3`。
