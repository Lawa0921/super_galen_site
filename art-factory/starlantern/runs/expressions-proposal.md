# 星燈迷宮：夥伴對話表情提案（精簡版，2026-10-23）

依據：`expressions-survey.md` 的句數；表情 id 與完整清單沿用 `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md` §10（每人 ≥ 8 種，共 73 張）。
這份提案只排**順序**和**這一輪先做哪些**，不新增或改名任何表情 id：劇本已經照 §10.2 一句一句標好了，圖到了就會自動接上，不必重標台詞。

## 沉重表情怎麼對應

使用者建議的小集合（serious、sad、shaken/hurt、gentle-wistful），對到劇本裡已有的 id：

| 小集合 | 劇本的 id | 誰用 | 句數 |
|---|---|---|---|
| serious 嚴肅 | `serious` | 全部夥伴（諾艾兒 0 句） | 38 |
| sad 難過 | `sad` | 全部夥伴 | 31 |
| shaken/hurt 動搖 | `shaken` | 絲嘉蕾 | 5 |
| gentle-wistful 欲言又止 | `wistful` | 瑟蕾 | 8 |
| （個人）祈禱 | `solemn` | 千鶴 | 17 |
| （個人）起誓 | `vow` | 絲嘉蕾 | 8 |

不建議把 `solemn`、`vow` 併進 `serious`：千鶴的 `solemn` 是閉眼、端正的祈禱（終幕「謹以此段，奉於燈前」），絲嘉蕾的 `vow` 是手按胸口起誓。17 句和 8 句都是她們故事的高潮，值得各自一張。

## 每位夥伴的清單

「第一輪」＝讓目前隱藏的 107 句全部有臉，加上莉茲那 8 句配錯笑臉的 `hushed`。「之後」＝ §10.4 其餘的表情，依句數排。

| 夥伴 | 第一輪（沉重） | 個人專屬的理由（故事線） | 之後 |
|---|---|---|---|
| 絲嘉蕾 scarlet | serious、sad、`shaken`、`vow`（4） | 在城門前轉身的騎士：`shaken`＝「我轉身了……我逃了」（mem 3）；`vow`＝「這一次，誰也別想從他背後過去」（rin-confess、hero-alone） | smile、surprised、blush |
| 千鶴 chizuru | serious、sad、`solemn`（3） | 封印念到一半就被凍住的巫女：`solemn`＝閉眼祈禱、「鈴在此處，此處便是神社」 | `bewildered` 6、smile、surprised、blush |
| 希爾薇 sylvie | serious、sad（2） | 沒守住林子的守林人；嚴肅句 11 句（「箭筒要滿」） | `alert` 4、`unguarded` 2、smile 6、surprised、blush |
| 瑟蕾 selene | sad、`wistful`（2） | 看得見未來卻不敢說出口：`wistful`＝「也許是我不敢看吧」（mem 2、4、5） | `foresee` 11、smile 12、serious、surprised、blush |
| 莎菲拉 safira | sad（1） | 笑聲底下是「那座城是我先看見的」的罪惡感，由 `sad` 承擔（spec §10.2） | `wink` 10、`laugh` 6、smile、serious、surprised、blush |
| 波比 bobby | sad、serious（2） | 造錯燈的那一族：「每修好一台，就像替祖先道一次歉」 | `excited` 8、`grin` 6、`focused` 4、smile、surprised、blush |
| 莉茲 liz | sad、serious、`hushed`（3） | 數金幣數到忘了家人的臉：`hushed` 8 句現在配的是笑臉 | `scheming` 12、smile 9、surprised、blush |
| 諾艾兒 noel | sad（1） | 「老師不教我，是怕我把自己燒光」；她只有 2 句沉重 | `smug` 11、`panic` 10、`pout` 7、blush 4、smile、serious、surprised |

第一輪合計 **18 張**（含這次的樣本 4 張），救回 107 句隱藏台詞＋8 句配錯的 `hushed`。

## 這次的樣本

- 絲嘉蕾、千鶴的 `serious`、`sad`，各 2 次生成，在審核頁並排原本的 normal 頭貼。
- 使用者看過畫風與「是不是同一個人」之後，才照同一套做法做第一輪其餘 14 張。

## 全套的量

- spec §10.4：還沒做的對話表情共 **73 張**（洛恩 5、凜 5、凜誓約後 5、夥伴 58）。扣掉這次樣本的 4 張，剩 **69 張**。
- 依目前做法每張 2 次生成，約 **140 次** codex 生成（每次約 2–4 分鐘，codex 不能並行，約 5–9 小時）；失敗重生成另計，每個 id 最多 3 次。
