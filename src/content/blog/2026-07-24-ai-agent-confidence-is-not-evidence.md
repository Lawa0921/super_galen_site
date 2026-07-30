---
layout: post
title: "AI 說 High、Reviewer 按 Accept：這個接受率還能證明 Agent 可靠嗎？"
date: 2026-07-24
categories: [AI, 程式開發]
tags: [AI Agent, GitHub Copilot, Automation Bias, Confidence Calibration, Code Review]
description: "GitHub 開始用 confidence、rationale 與 approval 分流 agent 操作。但如果 High 會影響人是否接受建議，acceptance rate 就不能反過來當成 ground truth。"
author: "Galen"
---

想像你的 repository 每天收到上百個 issue。

AI agent 讀完內容，自動補上 label、設定優先級、指派負責人，並把它認為是重複回報的 issue 關掉。每個動作旁邊還寫著：

```text
Confidence: High
Rationale: This issue matches an existing report.
```

Reviewer 看了一眼 `High`，按下 Accept。

假設一個月後，團隊打開 dashboard：高信心建議的接受率是 96%。於是大家得到一個很舒服的結論——這套 agent 很可靠，可以再多開一點自動化。

但這裡藏著一個迴圈：

> **如果 High 會影響人是否按下 Accept，acceptance rate 就不能反過來證明 High 是準的。**

2026 年 7 月 23 日，GitHub 在 public preview 推出 [Issues agent automation controls](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/)。Agent 對 label、field、issue type、assignee 與關閉 issue 等操作附上 rationale，並把 confidence 分成 high、medium、low；repository 可以設定門檻，讓高信心操作自動套用，其餘留給人審核。

這比只有「全自動」與「全部人工」兩個開關，更接近真實工作流。

Confidence 當然可以拿來分流，但沒有實際準確率、失敗成本與獨立複核時，「High」不是工程證據，只是一個會影響 reviewer 行為的 badge。

## GitHub 新增的其實是三種不同工具

GitHub 把 rationale、confidence 與 approval 放在同一套功能裡，但三者解決的問題不同。

| 工具 | 能回答什麼 | 不能保證什麼 |
|---|---|---|
| **Rationale** | Agent 為什麼想做這個動作？ | 理由是否完整、事實是否正確 |
| **Confidence** | Agent 認為自己的判斷有多確定？ | 這個信心是否與真實正確率相符 |
| **Approval** | 這個動作是否先停下來等人決定？ | Agent 是否被技術上禁止繞過等待 |

最後一點不是吹毛求疵。GitHub 自己在[功能文件](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automation-rationale-and-approvals)裡特別警告：這裡的 approval 是 workflow convenience，不是 security control。只要 agent 本來就有修改 issue 的權限，它仍可能透過 API 直接套用變更。

換句話說，介面上的「等我按同意」與系統層的「沒有我的授權就做不到」是兩回事。

同一份文件也清楚限制了目前功能範圍：confidence 與 approval 只涵蓋 issue attributes，不包含 agent 開 PR 或 push code 等其他行動。因此不能從這次更新推論「GitHub 已經替所有 coding agent 操作建立信心閘門」。

## 信心有用，但前提是它真的被校準

假設 agent 對 100 個 High 動作判斷正確 90 次，「High」就有可以追蹤的操作意義；如果另一個 agent 只對 55 次，兩個相同的 badge 就不該得到相同權限。

這就是 **confidence calibration**：信心不是語氣，而要與長期觀察到的正確率對得上。

GitHub 目前的功能文件說明了 high、medium、low 與四種 automation level 如何互動；但截至本文查核日，這份文件與官方公告都沒有公布三個等級在不同 repository、action type 或模型上的實際準確率，也沒有提供 false positive rate。Public preview 階段有這個空白並不奇怪；它只是代表團隊不該把預設的 High 當成已替自己完成校準。

最接近這個問題的 LLM 實證，是 2026 年 7 月發布的 preprint [ConfidenceBench](https://arxiv.org/abs/2607.20526)。研究用 200 道未公開的選擇題、三次獨立執行，測試 15 個 frontier LLM 口頭回報的信心。最準確的模型不一定校準得最好；數個模型即使答題準確率尚可，Brier score 仍比校準過的隨機基準更差。

這測的是 prompt 引導出的 verbalized confidence，不是 GitHub Issues 的 high／medium／low。它不能證明 GitHub 的 High 不準，但足以推翻一個偷懶的前提：**模型表達得很有把握，不代表這份把握天然對應到正確率。**

2026 年 AAAI 論文 [Too Sure for Our Own Good](https://doi.org/10.1609/aaai.v40i21.38798) 用 184 位參與者與邏輯題測試 AI confidence 對人類判斷的影響。研究中，校準良好的信心分數讓決策正確率提高約 20 個百分點；校準不良時只提高約 2 個百分點，並增加 automation bias 與 conservatism bias。

參與者會更常接受高信心建議，即使建議是錯的；也會因低信心而拒絕正確建議。這不是 code review 或 GitHub Issues 實驗，不能換算成「多少 bug 會被合併」，但它證明了一個更基本的介面風險：

> **人真的會使用 confidence cue，所以錯誤的 confidence 不只是沒幫助，而會系統性地改變人的行為。**

另一篇 2024 年的人機自動化研究也得到相近警告。在模擬無人載具任務中，[提高 automation transparency 改善了使用自動化建議的準確性](https://doi.org/10.1186/s41235-024-00599-x)；提供「somewhat／highly confident」沒有改善整體成果，參與者卻仍會依信心高低改變接受程度。Rationale 可以幫助理解，confidence 也能用來分流，但兩者都不能證明結果正確。

## 我現在會怎麼設定 GitHub Issues 自動化？

先問兩件事：

1. 做錯的代價有多大？
2. 做錯後能否快速、完整地恢復？

| 操作 | 建議策略 | 原因 |
|---|---|---|
| 補 label、填非關鍵 field | 可讓校準後的高信心操作自動套用 | 影響小、容易反轉 |
| 指派負責人、判斷 duplicate | 自動建議，保留抽樣或人工覆核 | 錯誤會製造噪音與責任錯置 |
| 關閉外部使用者的 issue | 預設需審核 | 錯誤會壓掉真實回報，也傷害社群信任 |

這個分層只處理 GitHub 目前支援的 issue attributes，不假裝同一套 confidence 已經涵蓋開 PR、push code 或部署。

真正影響門檻的不是 Agent 說多有把握，而是錯誤能否被發現、能否回復，以及誰承擔成本。補錯 label 通常只是噪音；關掉一個真實的 crash report，可能讓問題直接從維護者視野裡消失。

如果把範圍延伸到 code，門檻就不該沿用 issue badge。GitHub 對 Copilot cloud agent 的[安全文件](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)使用的是 branch 限制、required checks、人工 merge review、tool restriction 與 audit log。這些是獨立的技術控制，不是把 `High` 字樣放大。

## 真正的校準難題：Accept 不是 ground truth

導入 confidence-based automation 後，最小可行的監測不需要一套華麗 AI observability 平台。

先記四組資料就夠：

1. 每種 action type 被標成 high、medium、low 的數量。
2. 每個等級經抽樣複核後，實際正確與錯誤的比例。
3. false positive 與 false negative 各自造成的成本。
4. 被修改、拒絕或回滾的比例，以及模型、prompt、repository 規則改變後是否漂移。

不能直接把「人按了 Accept」當成正確。前面的研究正好說明，人會受到 confidence cue 影響；如果再用人的接受率回頭證明 confidence 很準，只是在用同一個偏差替自己背書。

比較可靠的做法，是替每種 action 先定義可檢查的正確條件，再進行不知道原始 confidence 的抽樣複核。否則 reviewer 看到 `High` 之後做出的決定，和 agent 原本的自評並不是兩份獨立證據。

不要把所有操作混成一個 accuracy。自動補錯 label 與自動關掉真正的 crash report，即使都叫「一次錯誤」，成本完全不同。

當累積足夠紀錄後，團隊才能提出可驗證的規則：

```text
假設團隊實際量到：
過去四週，dependency label 的 High precision 為 99.2%
而且錯誤可在 audit job 自動回復
→ 允許自動套用
```

相反地，如果沒有 ground truth、沒有回滾紀錄，或每次任務都不同，就不必假裝一個三段式 confidence badge 已經解決不確定性。讓 agent 提案、人看證據，往往是更省事的做法。

## 真正要校準的，不只是 Agent

完全不用 confidence 會浪費資訊。當任務重複、正誤可判定、錯誤可回復，而且獨立複核證明 High 確實比較準時，讓它自動處理低風險工作很合理。問題是，團隊不能一邊讓 `High` 影響 reviewer，一邊再拿 reviewer 的接受率證明 `High` 可靠。

GitHub 這次更新讓 agent 顯示不確定性，也讓 repository 選擇何時停下來。真正成熟的下一步，不是把接受率做成一張漂亮圖表，而是替每種操作建立不受 badge 影響的判定方式。

最後要問的也不只是「High 多常被接受」，而是：

**不知道它叫 High 的人，還會判斷這個動作是對的嗎？**

---

## 本文來源

*事實查核說明：本文資料查閱於 2026 年 7 月 24 日。GitHub 的 rationale、confidence 與 approvals 仍在 public preview，且目前只適用於 agent 對 issue attributes 的特定操作。文中對不同風險操作的自動化建議，是根據 GitHub 公開的權限模型與相關研究做出的工程判斷，不是 GitHub 的官方導入標準。ConfidenceBench 是使用 200 道未公開選擇題測量 verbalized confidence 的 preprint；AAAI 與 2024 年人機自動化研究的任務則分別是邏輯題與模擬無人載具管理。三者都不是 GitHub Issues 或 code review 實驗，因此本文不把它們的結果直接外推成 GitHub confidence 的實際準確率。*

- [Agent automation controls in GitHub Issues in public preview（GitHub Changelog）](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/)
- [About rationale, confidence, and approvals for issues（GitHub Docs）](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automation-rationale-and-approvals)
- [Risks and mitigations for GitHub Copilot cloud agent（GitHub Docs）](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)
- [ConfidenceBench: Evaluating Confidence Calibration in Large Language Models（arXiv preprint, 2026）](https://arxiv.org/abs/2607.20526)
- [Too Sure for Our Own Good: A User Study on AI Confidence and Human Reliance（AAAI 2026）](https://doi.org/10.1609/aaai.v40i21.38798)
- [Transparency improves the accuracy of automation use, but automation confidence information does not（Cognitive Research, 2024）](https://doi.org/10.1186/s41235-024-00599-x)
