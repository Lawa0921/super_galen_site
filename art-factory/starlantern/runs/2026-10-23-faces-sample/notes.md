# 2026-10-23 夥伴對話表情樣本（serious、sad）

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
