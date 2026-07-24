---
layout: post
title: "AI 說「高信心」時，誰更容易出錯？Agent 自動化缺的不是膽量，而是證據"
date: 2026-07-24
categories: [AI, 程式開發, 心理學, 遊戲開發]
tags: [AI Agent, GitHub Copilot, Automation Bias, Confidence Calibration, Code Review, Godot]
description: "GitHub 開始用 confidence、rationale 與 approval 分流 agent 操作，但心理學研究提醒我們：信心標籤會改變人的判斷，只有校準過才有用。真正可靠的自動化，應按風險配置權限，並用測試與可回復性取代自信。"
author: "Galen"
---

想像你的 repository 每天收到上百個 issue。

AI agent 讀完內容，自動補上 label、設定優先級、指派負責人，並把它認為是重複回報的 issue 關掉。每個動作旁邊還寫著：

```text
Confidence: High
Rationale: This issue matches an existing report.
```

看起來很合理。真正危險的問題卻不是「AI 有沒有解釋」，而是：

> 當 AI 說自己很有把握時，人會不會反而少查一次？

2026 年 7 月 23 日，GitHub 在 public preview 推出 [Issues agent automation controls](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/)。Agent 對 label、field、issue type、assignee 與關閉 issue 等操作附上 rationale，並把 confidence 分成 high、medium、low；repository 可以設定門檻，讓高信心操作自動套用，其餘留給人審核。

這是一個值得肯定的方向。它承認 agent 不該只有「全自動」與「全部人工」兩種模式。

但我的觀點是：

> **Confidence 適合決定先看哪一筆，不適合決定哪一筆不必驗證。**

如果沒有實際準確率、失敗成本與獨立證據，「High」只是一個會影響人類判斷的介面元素。

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

假設 agent 對 100 個動作都標示 high confidence，其中 90 個最後被證明正確，那麼「High」至少有一個可以追蹤的操作意義。

如果另一個 agent 同樣標示 High，實際只對 55 個，兩個相同的 badge 就不該得到相同權限。

這就是 **confidence calibration**：信心不是語氣，而要與長期觀察到的正確率對得上。

GitHub 目前的功能文件說明了 high、medium、low 與四種 automation level 如何互動，但這份文件沒有公布這三個等級在不同 repository、action type 或模型上的實際準確率，也沒有提供 false positive rate。Public preview 階段有這個空白並不奇怪；它只是代表團隊不該把預設的 High 當成已替自己完成校準。

2026 年 AAAI 論文 [Too Sure for Our Own Good](https://doi.org/10.1609/aaai.v40i21.38798) 用 184 位參與者與邏輯題測試 AI confidence 對人類判斷的影響。研究中，校準良好的信心分數讓決策正確率提高約 20 個百分點；校準不良時只提高約 2 個百分點，並增加 automation bias 與 conservatism bias。

參與者會更常接受高信心建議，即使建議是錯的；也會因低信心而拒絕正確建議。

這個結果不是在 code review 或 GitHub Issues 上測得，不能直接換算成「High confidence 會讓多少 bug 被合併」。它證明的是一個更基本的介面風險：

> **人真的會使用 confidence cue，所以錯誤的 confidence 不只是沒幫助，而會系統性地改變人的行為。**

## 我們甚至會替 AI 腦補更多自信

風險不只來自 agent 顯示的 badge，也來自人如何閱讀機器的行為。

2026 年刊於 Communications Psychology 的研究 [Beliefs about accuracy shape confidence attributions to humans and artificial agents](https://www.nature.com/articles/s44271-026-00445-4)，做了七個 preregistered experiments。參與者觀看人類與 AI 做知覺判斷，再評估決策者看起來多有信心。

即使人類與 AI 的準確率、反應時間和行為完全相同，參與者仍持續認為 AI 更有信心。研究者再透過實驗操弄發現，這種差異部分來自人們對 agent 能力的既有信念。

這不表示所有人都盲信 AI；研究測量的是「看起來多有信心」，不是所有情境下的服從率。但它提醒產品設計者：一個冷靜、結構化、附理由的自動化介面，本身就可能讓使用者感覺它比實際更確定。

另一篇 2024 年的人機自動化研究也提供了有用的對照。在模擬無人載具任務中，[提高 automation transparency 改善了使用自動化建議的準確性](https://doi.org/10.1186/s41235-024-00599-x)；單獨顯示「somewhat／highly confident」則沒有帶來整體正確率提升，雖然參與者確實會依信心高低改變接受建議的程度。

所以 rationale 可能有價值，confidence 也能用來分流；但兩者都不是 correctness proof。

## Godot 遇到的是另一端：生成變便宜，審查沒有

把鏡頭從企業 repository 移到開源遊戲引擎，問題會更清楚。

Godot Foundation 在 2026 年 6 月宣布[收緊貢獻政策](https://godotengine.org/article/contribution-policy-2026/)。官方描述的瓶頸不是沒有人送 PR，而是合格 reviewer 太少；AI 讓產生 contribution 的成本下降，review effort 與 reviewer 數量卻沒有同步改善。

Godot 因而採取非常保守的界線：禁止 autonomous AI agent 與 vibe coding、禁止用 AI 產生大段程式碼，並要求 AI 使用必須揭露。這是 Godot 對自己社群、維護能力與風險做出的政策選擇，不代表所有專案都該照抄。

但它揭露了一個 agent 經濟學：

```text
產生變更的成本 ↓
需要審查的變更量 ↑
可靠審查的供給不變
```

如果自動化只是把更多「High confidence」工作推進 queue，卻沒有降低每筆驗證成本，最後省下的是 agent 的時間，燒掉的是 maintainer 的注意力。

GitHub 的 confidence controls 正好可以回應這個瓶頸，但前提不是「相信 High」，而是讓團隊把有限審查時間花在**高風險、低可回復、缺乏證據**的操作上。

## 實務上，先按風險分層，不要先按信心分層

我會先問兩件事：

1. 做錯的代價有多大？
2. 做錯後能否快速、完整地恢復？

再決定 confidence 可以擁有多少權力。

| 操作 | 建議策略 | 原因 |
|---|---|---|
| 補 label、填非關鍵 field | 可讓校準後的高信心操作自動套用 | 影響小、容易反轉 |
| 指派負責人、判斷 duplicate | 自動建議，保留抽樣或人工覆核 | 錯誤會製造噪音與責任錯置 |
| 關閉外部使用者的 issue | 預設需審核 | 錯誤會壓掉真實回報，也傷害社群信任 |
| 修改程式碼、升級 dependency | Agent 可開 branch／draft PR，必須跑測試與 security checks | Confidence 不能證明執行結果 |
| 合併、部署、刪資料、改權限 | 使用真正的 server-side permission 與獨立 approval | 高衝擊，不能靠自我評分放行 |

這個分層故意很無聊。可靠的 agent system 通常不是靠更會說明的 agent，而是靠幾個清楚的邊界：

- **Least privilege**：只給完成任務需要的工具與 repository scope。
- **Staged writes**：先產生 suggestion、branch 或 draft PR，不直接改正式狀態。
- **Independent evidence**：測試、static analysis、security scan、可重現步驟與實際執行結果。
- **Audit trail**：記錄誰啟動 agent、用了什麼輸入、做了什麼變更。
- **Rollback**：在開放自動套用前，先確認失敗能否完整復原。

這也呼應 GitHub 自己的[安全文件](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)：限制 agent 可推送的 branch、要求人類 review 才能 merge、限制 tools、預設忽略不受信任使用者觸發的事件，才是實際縮小 blast radius 的控制。

## 團隊要量的不是「High 有幾筆」，而是「High 錯幾筆」

導入 confidence-based automation 後，最小可行的監測不需要一套華麗 AI observability 平台。

先記四個數字就夠：

1. 每種 action type 被標成 high、medium、low 的數量。
2. 每個等級最後被接受、修改、拒絕或回滾的比例。
3. false positive 與 false negative 各自造成的成本。
4. 模型、prompt、repository 規則改變後，以上數字是否漂移。

不要把所有操作混成一個 accuracy。自動補錯 label 與自動關掉真正的 crash report，即使都叫「一次錯誤」，成本完全不同。

當累積足夠紀錄後，團隊才能提出可驗證的規則：

```text
過去四週，dependency label 的 High precision 為 99.2%
而且錯誤可在 audit job 自動回復
→ 允許自動套用
```

相反地，如果沒有 ground truth、沒有回滾紀錄，或每次任務都不同，就不必假裝一個三段式 confidence badge 已經解決不確定性。讓 agent 提案、人看證據，往往是更省事的做法。

## 這不是反對自動化，而是反對把感覺當閘門

完全不使用 confidence 也會浪費資訊。當某種任務重複、正誤可判定、錯誤可回復，而且歷史資料證明 confidence 被良好校準時，讓高信心操作自動通過很合理。

真正的分界不是人工對 AI，而是：

- **可量測的可靠性**，對上只有模型自評的可靠感。
- **獨立執行證據**，對上聽起來合理的 rationale。
- **技術權限邊界**，對上介面裡的 approval 按鈕。

GitHub 這次更新最有價值的地方，不是 agent 終於敢說「High」，而是團隊終於能把不確定性顯示出來、留下理由並選擇何時停下。

下一步不該是把所有 High 全部自動套用。

而是回頭問：**在我們自己的歷史紀錄裡，High 到底代表多常正確？做錯時，又是誰付代價？**

## 帶走三句話

1. **Confidence 是審查 queue 的排序訊號，不是正確性證明；沒有校準資料時尤其如此。**
2. **Rationale、approval 與 permission 是三種不同控制；真正的安全邊界必須在 server-side 權限與可執行的驗證上。**
3. **Agent 讓生成變便宜後，工程瓶頸會移到 review；最值得自動化的是可判定、低風險、可回復的工作。**

---

## 本文來源

*事實查核說明：本文資料查閱於 2026 年 7 月 24 日。GitHub 的 rationale、confidence 與 approvals 仍在 public preview，且目前只適用於 agent 對 issue attributes 的特定操作。文中對不同風險操作的自動化建議，是根據 GitHub 公開的權限模型、Godot 的維護經驗與人機決策研究做出的工程判斷，不是 GitHub 或 Godot 的官方導入標準。AAAI 與 Communications Psychology 研究的任務分別是邏輯題與知覺／知識判斷；2024 年研究使用模擬無人載具管理任務，三者都不是 GitHub code review 實驗，因此本文不將其效果量直接外推到軟體開發。*

- [Agent automation controls in GitHub Issues in public preview（GitHub Changelog）](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/)
- [About rationale, confidence, and approvals for issues（GitHub Docs）](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automation-rationale-and-approvals)
- [Risks and mitigations for GitHub Copilot cloud agent（GitHub Docs）](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)
- [Changes to our Contribution Policies（Godot Engine）](https://godotengine.org/article/contribution-policy-2026/)
- [Too Sure for Our Own Good: A User Study on AI Confidence and Human Reliance（AAAI 2026）](https://doi.org/10.1609/aaai.v40i21.38798)
- [Beliefs about accuracy shape confidence attributions to humans and artificial agents（Communications Psychology, 2026）](https://www.nature.com/articles/s44271-026-00445-4)
- [Transparency improves the accuracy of automation use, but automation confidence information does not（Cognitive Research, 2024）](https://doi.org/10.1186/s41235-024-00599-x)
