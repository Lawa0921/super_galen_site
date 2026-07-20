---
layout: post
title: "AI 讓程式碼暴增 180%，真正出貨只多 30%：瓶頸搬去哪了？"
date: 2026-07-19
categories: [AI, 軟體開發]
tags: [AI Coding, Coding Agent, 開發者生產力, 軟體工程, GitHub, Code Review]
description: "AI coding 工具讓 commits 增加 180%，releases 卻只增加 30%。問題不是 AI 不會寫，而是 review、整合、測試與產品採用成了新的瓶頸。"
author: "Galen"
---

先給你三個數字：**commits 增加 180%、projects 增加 50%、releases 只增加 30%。**

這不是三份研究拼起來的標題，而是同一份研究裡，AI coding 工具從「寫 code」一路走到「真的出貨」之後，逐層縮水的結果。

大家都在問：「AI 到底讓工程師快了幾倍？」我認為問錯了。真正該問的是：**AI 多寫出來的 code，有多少活著走到 production，又有多少真的被使用者用到？**

## 180% 到底在量什麼？

2026 年 5 月，一份 [NBER working paper](https://www.nber.org/papers/w35275) 分析超過 10 萬名 GitHub 開發者，並結合 AI 工具的使用紀錄，比較 autocomplete、interactive agent 和 autonomous agent 三代工具。

研究者使用 matched event study，替採用者尋找過去活動軌跡相近的控制組，再比較採用前後的變化。結果是：autocomplete 讓 commits 增加約 40%；加上 interactive agent，累計來到 140%；再加 autonomous agent，累計約 180%。

如果故事停在這裡，AI 已經把工程師變成三倍速印表機。

但軟體不是印出來就算完成。

一段 code 要產生價值，還得經過 commit、pull request、project、release，最後才輪到使用者。沿著這條路往後看，projects 只增加約 50%，releases 更只增加約 30%。

研究者又查看 Apple App Store、Google Play、Chrome Web Store 和 SourceForge。新軟體確實變多了，但這些新產品在前三個月得到的總使用量並沒有增加。

一句話版本：**AI 已經證明自己很會增加軟體供給，還沒證明它能等比例增加軟體價值。**

## Code 多了，產品為什麼沒等比例變多？

一個功能可以拆成十個 commits，也可以 squash 成一個。一個 release 可以包含五個 features，也可以只修一個 typo。

所以，commits 增加 180%、releases 增加 30%，不能直接解讀成另外 150 個百分點全部死在 code review。

這份研究能證明的是：**產碼增幅沒有等比例轉成 releases 和使用量。**它不能單靠漏斗差距告訴我們，每一段損耗究竟發生在哪裡。

可能是 PR 變多，reviewer 沒有變多；也可能是 CI、integration 和 regression testing 跟不上。更上游一點，團隊可能只是更快做出沒人需要的功能；更下游一點，產品上架了，使用者卻根本沒看見。

所以我不會把這篇研究讀成「AI 沒用」。

我的判讀是：**AI 先加速最容易量化的產碼環節，於是整條流程裡原本被遮住的慢速環節，全都亮了起來。**

AI 與其說是瓶頸搬運工，不如說是瓶頸顯影劑。

## 所以 AI 到底讓人變快，還是變慢？

答案很討厭：看人、看任務，也看你量的是哪一段。

[METR 在 2025 年初的隨機實驗](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) 找來 16 位資深開源維護者，處理自己熟悉 repository 裡的 246 個真實 issues。允許使用 AI 時，他們的完成時間反而增加 19%。

更有趣的是，這些開發者事前預期自己會快 24%，實驗結束後仍然覺得自己快了 20%。

**體感很快，時鐘不同意。**

但這個 19% 也不能亂用。樣本是熟悉大型 repository 的資深維護者，工具則是 2025 年初的 Cursor 與 Claude 3.5／3.7。METR 後來直接標示原結果已經過時；[2026 年更新](https://metr.org/blog/2026-02-24-uplift-update/) 的原始方向已轉為加速，只是研究設計面臨新的選擇偏誤與多 agent 計時問題，還無法給出可靠的新百分比。

另一邊，Microsoft、Accenture 與一家 Fortune 100 公司的 field experiments，共隨機提供 4,867 名開發者早期 GitHub Copilot。對實際採用工具的人來說，每週完成的 pull requests 約增加 26%，較低經驗的開發者增益通常更明顯。[完整研究](https://demirermert.github.io/Papers/Demirer_AI_productivity.pdf)

只是品質訊號不一致：Microsoft 的品質 proxy 沒有明顯惡化，Accenture 的 build success rate 卻下降約 17%。而且這批實驗測的是 2022–2023 年的 autocomplete，不是今天能自己改十幾個檔案的 autonomous agent。

把兩組研究放在一起看，最穩的結論不是「AI 一定加速」或「AI 一定拖慢」，而是：**省下多少打字時間，最後要扣掉多少解釋、等待、驗證與修錯成本。**

## 瓶頸真的被照出來時，長什麼樣子？

2026 年 6 月，Godot Foundation 更新 contribution policy，直接把 code review 稱為專案最大的瓶頸。[Godot 官方說明](https://godotengine.org/article/contribution-policy-2026/)

原因並不複雜。AI 降低了送出 PR 的成本，qualified reviewers 卻沒有跟著增加。作者可以同時叫幾個 agents 開工，maintainer 還是一雙眼睛、一顆腦袋，而且最後要替合併進去的 code 負責。

這是單一 volunteer project 的現場觀察，不能直接外推到所有公司。但它把問題拍得很清楚：

> 高速印表機接在人工裝訂線前面，不會自動增加成書數量，只會先把走道塞滿。

企業裡也有類似的裝訂線，只是名稱不同：security review、QA、法遵、跨服務整合、deployment window，或某個只有兩個人理解的 legacy module。

[DORA 對 2025–2026 資料的解讀](https://dora.dev/insights/balancing-ai-tensions/) 因此把 AI 視為 organizational amplifier。小批次、測試、internal platform 與文件健全，它會放大好流程；基礎設施混亂，它也會更快把混亂送到下一站。

## 真正成功的做法，是讓人換位置

這裡有一個我很喜歡的反例。

一篇 2026 年 ICSE 產業研究，在一套 152 萬行、演進超過十年的 C++ 系統 PicoScenes 上，採用三段式流程：LLM 先協助 prototype，工程師負責 diagnosis，最後再由 LLM 執行 refactoring。

三項代表性功能的平均實作時間減少 68.3%，平均 cyclomatic complexity 降低 28.2%，defect rate 減半。[ICSE 論文](https://doi.org/10.1145/3786583.3786872)

看起來是 AI 的大勝利，但最值得看的其實是 AI-only：compilation pass rate 只有 73%，test pass rate 更只有 62%。

Expert–AI hybrid 裡，人類負責 architecture、hardware-aware diagnosis 與 validation，AI 處理重複實作和重構。

這份研究只有單一系統、四位資深成員，速度比較也只涵蓋三項功能，不能外推成「所有團隊都會快 68.3%」。但它示範了一件重要的事：

**AI 不是取代完整開發流程，而是提高其中一段的吞吐量。要讓吞吐量變成出貨量，人必須站在架構、診斷與驗證的位置。**

真正值得抄的不是他們用了哪個模型，而是他們把 AI 放在什麼位置。

## 不要再量 AI 寫多少，去量東西卡在哪裡

如果團隊只看 generated LOC、acceptance rate 或 agent PR 數量，幾乎一定會得到一張很好看的簡報。

我會同時看四組指標：

| 面向 | 該看的指標 | 真正要回答的問題 |
|---|---|---|
| **Flow** | change lead time、PR completion time、deployment frequency | 工作卡在哪一站？ |
| **Quality** | CI first-pass success、change fail rate、production incidents | 速度是否換來更多返工？ |
| **Product** | feature adoption、retention、task success、CSAT | 使用者真的得到價值嗎？ |
| **Attention** | reviewer hours、等待 domain expert 的時間、每個 shipped outcome 的人工成本 | 最稀缺的人類時間花在哪裡？ |

最好再把 change lead time 拆成 coding、waiting for review、CI、返工與等待發布。否則你只知道整條路塞車，不知道塞在哪個交流道。

AI 讓 PR 更快完成，若同時讓返工與事故增加，只是把時間從白天搬到凌晨。

而 release 只是工程流程的終點，不是產品價值的終點。

## 我現在怎麼用 Coding Agent？

我的規則沒有很華麗，只有三條：

1. **任務要小、可測、可 rollback。** 一次只交付一段能獨立驗證的改動，不把半個產品丟進 prompt。
2. **送 PR 前，我必須能解釋每個關鍵決策。** 看不懂的 code 不是省下來的時間，而是延後付款的債。
3. **把 AI 放到真正的瓶頸。** 如果團隊已經 code 太多、review 不完，再加一個產碼 agent 不是自動化，而是加壓。

AI coding 當然會繼續變快。真正拉開團隊差距的，可能不再是誰打字最快，而是誰最早看見下一個瓶頸，並把工具移到那裡。

## 帶走三句話

1. **commits 增加，不等於產品價值增加。**
2. **AI 是瓶頸顯影劑，也是既有工程系統的放大器。**
3. **別再問 AI 幫你寫了多少 code；去看有多少使用者真的用到了。**

---

## 本文來源

*事實查核說明：本文資料查閱於 2026 年 7 月 19 日。NBER 研究是尚未完成同行評審的 working paper，使用 Microsoft 內部 telemetry，且作者揭露與 Microsoft 的顧問關係；DORA 資料主要是觀察性研究；Godot 屬官方實務案例；PicoScenes 是單一系統研究。文中的「瓶頸顯影劑」是我的綜合判讀，不是任何單一研究的原句或已證實因果模型。*

- [Writing Code vs. Shipping Code: Productivity Effects Across Generations of AI Coding Tools（NBER Working Paper 35275）](https://www.nber.org/papers/w35275)
- [The Effects of Generative AI on High-Skilled Work: Evidence from Three Field Experiments with Software Developers](https://demirermert.github.io/Papers/Demirer_AI_productivity.pdf)
- [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [Less Effort, More Productivity: Lessons Learned from Developing Millions of Lines of Code with Large Language Model](https://doi.org/10.1145/3786583.3786872)
- [Writing code versus shipping code：作者的 CEPR 解說](https://cepr.org/voxeu/columns/writing-code-versus-shipping-code-productivity-effects-across-generations-ai-coding)
- [METR：2026 Developer Productivity Experiment Uplift Update](https://metr.org/blog/2026-02-24-uplift-update/)
- [DORA：Balancing the tensions emerging from AI-assisted software development](https://dora.dev/insights/balancing-ai-tensions/)
- [Godot Contribution Policy Changes](https://godotengine.org/article/contribution-policy-2026/)
