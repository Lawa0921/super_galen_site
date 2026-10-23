# 2026-10-23 夥伴對話表情樣本（serious、sad）

> 更新：使用者裁定改用 Gemini 生靜態圖（「既然 codex 不行 就先改用 gemini 生圖吧」）。結果見文末「Gemini 樣本」；下面「沒有產出任何圖片」一節是 codex 那一輪的紀錄。

- 範圍：絲嘉蕾、千鶴的 `serious`、`sad`（隱藏句數最多的兩人：34、26 句，見 `../expressions-survey.md`）。
- 工具：`tools/faces.py`（生成、後處理、對照 QA）、`tools/review_faces.py`（本頁 `review.html`）。
- 參考圖：該角色已發佈 normal 頭貼與立繪的 codex 原圖（registry `raw`），prompt 用 spec §10.5 的句型（`prompts/char-<cid>-portrait-<mood>.txt`，單行）。
- 後處理：`sl_art.py process --kind sprite`，block 用 normal 頭貼自己的 block（絲嘉蕾 11、千鶴 9），`allow_edge: [bottom]`；之後用 `faces.match_qa` 對照 normal 的畫布尺寸（±6 美術像素）、block 與色盤。
- 每次生成都在新的空資料夾：`C:\Users\bag57\art-refs\starlantern\raw\<id>\a<N>\`。codex 一次只跑一個。

## 結果：沒有產出任何圖片（pipeline 受阻）

| id | 次數 | 結果 |
|---|---|---|
| char-chizuru-portrait-serious | a1、a2 | a1：預設模型被拒；a2：`gpt-6-luna` 沒有 image_gen 工具 |
| char-chizuru-portrait-sad | a1、a2 | a1：預設模型被拒；a2：生成中途停掉（同樣的 luna 問題，沒有讓它跑完） |
| char-scarlet-portrait-serious | a1 | 預設模型被拒 |
| char-scarlet-portrait-sad | a1 | 預設模型被拒 |

1. codex 設定的預設模型是 `gpt-6-astra`（`~/.codex/config.toml` 第 1 行，2026-10-22 17:03 改過）。現在每次呼叫都回 `400 The 'gpt-6-astra' model is not supported when using Codex with a ChatGPT account.`。上一次成功生圖是 2026-10-20 18:23，當時用的是 `gpt-6.1-sol`，這個模型現在也被拒。
2. 這個帳號目前列出的模型（`~/.codex/models_cache.json`）只有 `gpt-6-luna`、`gpt-5.6-terra`、`gpt-5.6-luna`。三個都用純文字問過，都回答 `image_gen: no`。用 `gpt-6-luna` 實際跑一次（chizuru serious a2）也一樣：codex 說這個 session 沒有 `image_gen` 工具，沒有出圖。
3. 沒有改 codex 設定，也沒有改走 CLI 的 `gpt-image-*`（codex 的生圖 skill 規定要先問使用者），也沒有改用其他生圖工具（星燈迷宮的靜態圖只能用 codex）。
4. `codex_still.py` 多了一個可選的 `--model`（只影響那一次呼叫，預設行為不變，gen.json 會記下用的模型），`faces.py gen --model=…` 會把它傳下去。等帳號能用某個帶 image_gen 的模型時，不必改設定就能指定。

## 恢復之後怎麼重跑

```
python art-factory/starlantern/tools/faces.py gen --only=char-scarlet-portrait-serious,char-scarlet-portrait-sad,char-chizuru-portrait-serious,char-chizuru-portrait-sad --n=2 [--model=<有 image_gen 的模型>]
python art-factory/starlantern/tools/faces.py cand --only=char-scarlet-portrait-,char-chizuru-portrait-s
python art-factory/starlantern/tools/review_faces.py 2026-10-23-faces-sample char-scarlet-portrait-serious char-scarlet-portrait-sad char-chizuru-portrait-serious char-chizuru-portrait-sad
```

- 失敗的 a1、a2 資料夾保留當證據；下一次自動從下一個編號開始。
- 次數上限：contract 規定每個 id 最多 3 次。這次的失敗都沒有出圖，是帳號的問題，不是畫的問題，所以建議不算進上限。千鶴兩個 id 已經用掉 a1、a2 兩個編號。

## Gemini 樣本（使用者裁定，2026-10-23）

- 後端：`codex_still.py generate --backend gemini --model gemini-3-pro-image`（Nano Banana Pro，GA 版；從 API 的 model list 選出，同族還有 `gemini-3.1-flash-image`、`gemini-nano-banana-2.1` 等）。`faces.py gen --backend=gemini --model=…` 會把參數傳下去。
- 紀錄和 codex 一樣：`<stem>.prompt.txt`、`<stem>.gemini.log`（圖片 bytes 換成 sha256，沒有金鑰）、`<stem>.gen.json`（`generator: gemini/gemini-3-pro-image`、`model_version`、`usage`、輸入與輸出的 sha256）、`-magenta.png`、`.gate.json`。金鑰在執行時從 `~/.gemini/.env` 讀，不寫進任何檔案。
- 參考圖：該角色 normal 頭貼的原圖（第一張）、立繪原圖（第二張）。prompt 是同一句 spec §10.5 句型，把「用 image tool 生一次」那句換成 `Return only the image, a square picture.`。
- 每個 id 一次呼叫，一次一個，各在新的空資料夾（scarlet `a2`，chizuru `a3`，因為 codex 失敗的資料夾占掉前面的編號）。共 4 次呼叫，每次都 `STOP` 並回傳 1024×1024 PNG。
- 費用：API 只回報 token（輸出約 1313–1323 tokens／張，輸入約 690 tokens 的文字部分），沒有回報金額。以 3 Pro Image 每張約 US$0.13–0.16 估算，4 張約 US$0.6（**估計值，未對帳**）。

### 後處理差異

1. **block 換算**：base 的 block 是對 1254 px 的 codex 原圖量的；Gemini 回 1024 px，所以用 `scaled_block` = round(base block × 1024 / 1254)：絲嘉蕾 11 → 9（誤差 0.2%）、千鶴 9 → 7（實際應是 7.35，取整後**頭大約 5%**，尺寸 133×129 對 normal 127×123，剛好在 ±6 的上限）。
2. **邊緣洋紅**：Gemini 的輪廓帶的 key 色是 codex base 的約 4 倍（`magenta_spill_count` 264 對 56）。用登錄表已有的修補旗標 `defringe: strong` + `neutralize_tint: true`（`faces.postprocess_flags`，只套在 gemini 的原圖）降到 66–71（絲嘉蕾）與 1（千鶴），和 base（56、74）同一水準。

### 結果（全部 `qa_passed`，未核准、未發佈）

| id | 尺寸（normal） | 機械 QA | 對照 normal | 封閉洞（警告） |
|---|---|---|---|---|
| char-scarlet-portrait-serious a2 | 107×114（108×115） | 通過：殘留 0、半透明 0、碰邊只在底邊 | 通過：block 9／9、色盤 99% | 0 |
| char-scarlet-portrait-sad a2 | 107×114（108×115） | 通過 | 通過：色盤 99% | 0 |
| char-chizuru-portrait-serious a3 | 133×129（127×123） | 通過 | 通過（差 +6, +6，在上限） | 28 |
| char-chizuru-portrait-sad a3 | 133×129（127×123） | 通過 | 通過（差 +6, +6，在上限） | 27 |

千鶴的封閉洞逐一看過：都是 1 px，在髮飾花瓣圈、袖口蝴蝶結和幾縷頭髮之間，是真的縫，不是擦掉的色塊。

### 目視判斷（Read 看過原圖與 2×／3× 縮圖）

- 絲嘉蕾 serious：同一個人、同一個畫風，髮型、鎧甲、披風、配色、構圖幾乎一致。表情是眉頭壓低、嘴抿成一直線，原尺寸下偏淡，但讀得出來。
- 絲嘉蕾 sad：身分與畫風一致。原圖上有淚光、眉尾上揚、嘴角下垂，但縮到原尺寸後淚光不見，和 serious 很接近，**難過感偏弱**。如果要更明顯，可以用第 2 次額度重生。
- 千鶴 serious：同一個人，表情明確（皺眉、抿嘴）。頭大約 5%（block 取整），陰影比 base 稍微柔一點、像素稍糊。
- 千鶴 sad：表情最明確（眉尾上揚、淚滴、嘴角下垂）。同樣頭大 5%，陰影偏柔。
- 沒有明顯的身分漂移。Gemini 的差別在於像素不貼齊格子（後處理吸附之後還是比 codex 原圖柔），以及上面兩點後處理差異。

## codex 對照組（ChatGPT Plus 恢復後，2026-10-23）

- 帳號升級成 Plus 後，codex 預設模型 `gpt-6-astra` 可以用了（codex-cli 0.164.0，log 第 5 行），沒有指定 `--model`。
- 4 次呼叫，一次一個，各在新的空資料夾：chizuru serious/sad `a4`、scarlet serious/sad `a3`。4 張都有輸出（1254×1254），sha256 互不相同，log 裡沒有 usage／rate limit 訊息。
- 後處理和 Gemini 一樣（`faces.py cand`，base 自己的 block；codex 原圖是 1254 px，所以 block 不必換算，也不套修補旗標）。

| id | 尺寸（normal） | 機械 QA | 對照 normal | 封閉洞（警告） | 輪廓洋紅（base 56／74） |
|---|---|---|---|---|---|
| char-scarlet-portrait-serious a3 | 108×115（108×115） | 通過 | 通過：差 0, 0、block 11／11、色盤 99.8% | 0 | 66 |
| char-scarlet-portrait-sad a3 | 108×115 | 通過 | 通過：差 0, 0、色盤 99.9% | 0 | 53 |
| char-chizuru-portrait-serious a4 | 127×123（127×123） | 通過 | 通過：差 0, 0、block 9／9、色盤 99.9% | 7 | 78 |
| char-chizuru-portrait-sad a4 | 127×123 | 通過 | 通過：差 0, 0、色盤 99.9% | 11 | 87 |

### codex 與 Gemini 比較（目視，原尺寸與 2×／3×）

- **畫風與身分**：codex 比較貼近 base。畫布、頭的大小、構圖和 normal 完全一樣（差 0），像素一樣銳利。Gemini 也是同一個人，但陰影稍柔，千鶴還大了 5%。
- **絲嘉蕾 serious**：codex 較好。眉頭明顯壓低，和 normal 並排時差別一眼就看得出來；Gemini 的版本偏淡。
- **絲嘉蕾 sad**：兩張在遊戲尺寸都不夠「難過」。codex 是眼皮半垂、視線往下，但眉頭往下壓，看起來偏沉悶或不悅；Gemini 眉尾上揚、比較柔，可是縮小後很淡。建議用剩下的額度、加強眉尾上揚與嘴角下垂再生一次。
- **千鶴 serious**：codex 較好。皺眉明確，尺寸和 normal 一樣。
- **千鶴 sad**：Gemini 的表情最像難過（眉尾上揚、淚滴），codex 是垂眼、抿嘴的憂鬱，也讀得出來。codex 尺寸正確，Gemini 頭大 5%。
- 登錄表目前登記的仍是 Gemini 版（`qa_passed`，未發佈）；選用哪一版等使用者決定，之後再用 `faces.py pick` 改。
