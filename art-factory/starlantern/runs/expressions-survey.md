# 星燈迷宮：對話表情盤點（2026-10-23）

範圍：8 位夥伴＋洛恩（`hero`）＋凜（`rin`／`rin-oath`）的頭貼差分，對照故事台詞實際用到的表情。
方法：`npx tsx` 載入 `src/scripts/games/starlantern/data/story.zh-TW.ts` 的 `STORY`，走訪所有 `{ who, mood, text }` 台詞（797 句，其中旁白 291 句），依說話者 × `mood` 計數（沒標 `mood` 算 `normal`）。
計的是**劇本裡寫下的句數**：帶 `if` 的分歧句（例如 `met` / `notMet` 兩種版本）兩句都算，所以一輪實際看到的會少一些。

## 為什麼夥伴的沉重台詞沒有頭貼

`src/scripts/games/starlantern/ui2/story.ts:38-48`：

- `GRAVE` = `serious`、`sad`、`solemn`、`shaken`、`vow`、`distant`、`wistful`。
- `faceOrder`：說話者在 `NORMAL_SMILES` 裡（`render/artPaths.ts:58`，8 位夥伴，`normal` 頭貼都在笑），而且台詞是 `GRAVE` 的表情時，只找那一張表情圖；沒有圖就**不顯示頭貼，只顯示名字**。
- 其他沒有圖的表情（`smile`、`foresee`、`scheming`……）退回 `normal`，也就是那張笑臉。
- 洛恩和凜的 `normal` 是平靜臉，不在 `NORMAL_SMILES`，沉重台詞退回 `normal`，所以照常顯示。
- 已發佈的對話表情只有 `PUBLISHED_FACES`（`render/artPaths.ts:50-52`）：`hero`、`rin`、`rin-oath` 的 `smile`、`sad`。

## 已有的頭貼（`public/assets/games/starlantern/char/`）

| 角色 | 已有檔案 |
|---|---|
| 8 位夥伴（selene、chizuru、safira、sylvie、noel、bobby、liz、scarlet） | `<cid>-portrait.png`（normal），以及戰鬥用的 `-attack`、`-hit`、`-dying`、`-down`、`-ultimate`。**沒有任何對話表情。** |
| 洛恩 `hero` | `hero-portrait.png`、戰鬥 5 張、`hero-portrait-smile.png`、`hero-portrait-sad.png` |
| 凜 `rin` | `rin-portrait.png`、戰鬥 5 張、`rin-portrait-smile.png`、`rin-portrait-sad.png` |
| 凜（誓約後）`rin-oath` | `rin-oath-portrait.png`、戰鬥 5 張、`rin-oath-portrait-smile.png`、`rin-oath-portrait-sad.png` |

美術工廠紀錄：`art-factory/starlantern/registry.json` 的 `char-<id>-portrait*`；成品在 `art-factory/starlantern/work/char-<id>-portrait*/`。

## 每個人缺哪些表情、各幾句

「隱藏」＝沉重表情，目前**完全不顯示頭貼**。「退回笑臉」＝顯示 `normal`（夥伴是笑臉，洛恩和凜是平靜臉）。

| 角色 | 台詞數 | 沒有圖的表情（句數） | 隱藏 | 退回 normal |
|---|---|---|---|---|
| 絲嘉蕾 scarlet | 39 | serious 18、vow 8、smile 5、shaken 5、sad 3 | **34** | 5 |
| 千鶴 chizuru | 36 | solemn 17、bewildered 6、serious 5、smile 4、sad 4 | **26** | 10 |
| 希爾薇 sylvie | 30 | serious 11、smile 6、alert 4、sad 4、unguarded 2、surprised 1、blush 1 | **15** | 14 |
| 瑟蕾 selene | 35 | smile 12、foresee 11、wistful 8、sad 3、surprised 1 | **11** | 24 |
| 莎菲拉 safira | 29 | wink 10、sad 7、laugh 6、smile 4、surprised 2 | **7** | 22 |
| 波比 bobby | 28 | excited 8、grin 6、sad 5、focused 4、serious 2、smile 2、surprised 1 | **7** | 21 |
| 莉茲 liz | 38 | scheming 12、smile 9、hushed 8、surprised 3、sad 3、serious 2 | **5** | 32 |
| 諾艾兒 noel | 35 | smug 11、panic 10、pout 7、blush 4、sad 2、smile 1 | **2** | 33 |
| 洛恩 hero | 96 | distant 19、serious 16、resolve 5、surprised 1 | 0 | 41 |
| 凜 rin | 70 | serious 14、guarded 6、averted 6、surprised 2 | 0 | 28 |

### 依表情彙總（只算夥伴的隱藏台詞，共 107 句）

| 表情 | 句數 | 誰 |
|---|---|---|
| serious | 38 | scarlet 18、sylvie 11、chizuru 5、bobby 2、liz 2（noel 0） |
| sad | 31 | safira 7、bobby 5、chizuru 4、sylvie 4、scarlet 3、selene 3、liz 3、noel 2 |
| solemn | 17 | chizuru |
| vow | 8 | scarlet |
| wistful | 8 | selene |
| shaken | 5 | scarlet |

### 不隱藏、但笑臉讀起來不對的

- 莉茲 `hushed` 8 句：全是「說到家人時突然安靜」（`mem:liz:1-4`，例：「數著數著，家人的臉，就一張一張被數掉了。」），現在配笑臉。
- 洛恩 `distant` 19 句、`serious` 16 句；凜 `serious` 14 句：退回平靜臉，可以接受，但不是最佳。

## 結論

- 最該先做的是絲嘉蕾（34 句隱藏）和千鶴（26 句），兩人合計佔 107 句裡的 60 句（56%）。
- 只做 serious＋sad（8 人 16 張）能救回 69 句；加上 4 張個人專屬（scarlet vow、shaken，chizuru solemn，selene wistful）就能救回全部 107 句。提案見 `expressions-proposal.md`。
