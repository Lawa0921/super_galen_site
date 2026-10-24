# 2026-10-24 對話表情第四波：樣本 4 張（好感度計畫 Task A，codex）

- 依據：`docs/superpowers/plans/2026-10-24-starlantern-affinity.md` 的 Task A，spec `2026-10-18-starlantern-affinity-expressions-design.md` §0 D18、§10.2、§10.5。第四波共 14 張：九位夥伴的 `blush`、凜兩套的 `averted`、希爾薇 `unguarded`、諾艾兒 `smug`、波比 `excited`。沒有它遊戲照樣完整（喜悅類借微笑的 normal，`averted`、`unguarded` 在重場景借 sad）。
- 凜的 `blush` 只做誓約後（`rin-oath`）一套：她的心契與戀愛都在選擇之後。凜誓約前（`rin`）的 `averted` 是迴避、心虛；誓約後的是害羞（spec §10.2），所以兩套是兩種表情。
- 這一輪只做 4 張給使用者看畫風（不發佈）：

| id | 為什麼選它 |
|---|---|
| noel blush | 劇本已有 4 句 blush；要和她已發佈的 pout（也是斜眼）分得開 |
| safira blush | 深膚色上的粉紅臉紅，色盤最難的一張 |
| rin-oath averted | 不是 blush 的新表情；誓約後害羞的那一種 |
| bobby excited | 劇本已有 8 句；粉紅髮色上的「眼睛發亮」 |

- 每張臉服務的台詞（劇本裡已有的，由 `review_faces.script_lines` 從 `data/story.zh-TW.ts` 逐句列出）與其他用途（心契、戀愛、送禮反應），完整列在 `review.html` 第三部分。

## 生成

- `faces.py gen --wave=4 --n=1 --only=<id>`，一次一個 codex 呼叫，各在新的空資料夾 `raw/<id>/a<N>/`；`WAVE4_MAX = 2`。codex 模型 `gpt-6-astra`（log 標頭）。
- 共 **5 次呼叫**：四張各 a1，凜 averted 另有 a2（`WAVE4_NOTES` 的修正句）。全部有輸出；log 沒有 usage／rate limit 訊息；沒有用 Gemini。
- 凜 averted 的 a1、a2 在 codex_still 的原始閘門顯示「foreground touches the canvas edge」：那是身體碰底邊（頭貼本來就這樣），後處理的 `allow_edge: [bottom]` 判定碰邊 0。
- 後處理：`faces.py cand --wave=4`（`sl_art.py process --kind sprite`，base 自己的 block，`allow_edge: [bottom]`）＋ `match_qa` 對照 normal。

## QA（全部通過）

| id | 次數 | 機械 QA | 對照 normal（尺寸、差、block、色盤） | 封閉洞 |
|---|---|---|---|---|
| noel blush | a1 | magenta 0、半透明 0、碰邊 0 | 118×119，差 0,0，10／10，99.6% | 5 |
| safira blush | a1 | magenta 0、半透明 0、碰邊 0 | 121×122，差 0,0，9／9，99.4% | 6 |
| rin-oath averted | a1 | magenta 0、半透明 0、碰邊 0 | 101×112，差 0,0，11／11，99.9% | 0 |
| rin-oath averted | a2 | magenta 0、半透明 0、碰邊 0 | 101×112，差 0,0，11／11，100% | 2 |
| bobby excited | a1 | magenta 0、半透明 0、碰邊 0 | 122×121，差 0,0，10／10，99.5% | 4 |

尺寸與該角色的 normal 完全相同。封閉洞都是小洞（警告，不是失敗），位置在頭髮、帽簷、飾品的縫，和前三輪同類。

## 目視判斷（原尺寸、2×、3×、5× 臉部特寫）

- 身分與畫風：5 張都是同一個人、同一個畫風；服裝、髮型、飾品、配色與 normal 一致；凜的領口是敲平的鐘（誓約後），沒有混到裂痕版本。
- 諾艾兒 blush（a1）：雙頰一排硬邊粉紅點、眼睛往旁邊、小小的笑。和 pout（皺眉、無笑）分得開；在 192px 的對話框裡看得出臉紅，但比莎菲拉的淡。可用。
- 莎菲拉 blush（a1）：深膚色上一條明顯的玫瑰粉色帶（雙頰＋鼻樑），眼皮半垂往旁邊、閉嘴淺笑。最清楚的一張。可用。
- 凜（誓約後）averted：a1 只把眼珠移到旁邊，頭沒轉，原尺寸看不太出在迴避 → 生 a2（修正句：整個頭轉開約四分之一、下巴微低、視線往下往旁邊）。a2 一眼看得出在避開視線，**建議 a2**。a2 看起來比較接近「心虛／低落」而不是明顯的害羞（沒有臉紅是刻意的，要和 blush 分開）；這一點請使用者判斷。
- 波比 excited（a1）：眼睛睜大帶高光、張嘴露齒的大笑、護目鏡保持原樣。和 normal 的淺笑分得很開。可用。

## 登錄表與 runtime

- 沒有跑 `pick`、沒有寫 `registry.json`、沒有動 `public/`、manifest、`PUBLISHED_FACES` 或 `src/`。候選只在 `work/<id>/cand/a<N>/`（含 `cand-registry.json`、`qa.json`、`match.json`）。
- 使用者核准後：`faces.py pick --wave=4 --id <id> --attempt <N>` → approve → publish，`PUBLISHED_FACES` 與 `artPaths.test.ts` 同一個 commit；其餘 10 張照同一套 prompt 句型加進 `faces.WAVE4`。

## 審核頁

- `review.html`：一、四張樣本和該角色每張已發佈的臉並排（原尺寸＋2×），附用途與 QA；二、劇本台詞放在遊戲對話框樣式裡（每張最多 4 句；左：現在借的臉，右：新表情）；莎菲拉 blush 劇本裡還沒有台詞，對話框放一句標明「示意」的說明，不代寫心契／戀愛台詞；三、Task A 全部 14 張與各自服務的台詞與用途。
- `montage.png`：3× 總覽。
- 產生：`python art-factory/starlantern/tools/review_faces.py wave4 2026-10-24-faces-wave4-sample`。字型引用 `public/assets/fonts/cubic-11/`，從 repo 內開檔才載得到。
