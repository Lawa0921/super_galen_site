---
layout: post
title: "GPT-5.6 與 Codex 實戰指南：reasoning 的平衡點，比你想的低"
date: 2026-07-18
categories: [AI, 開發工具]
tags: [GPT-5.6, Codex, OpenAI, reasoning, AI 工具, 開發者工作流]
description: "3 倍成本換 3 分提升——把 reasoning 開到底是這一代最貴的迷信。這篇用實測數據找 Sol/Terra/Luna × effort 的平衡點，附 Codex 設定入口與訂閱額度攻略。"
author: "Galen"
---

# GPT-5.6 與 Codex 實戰指南：reasoning 的平衡點，比你想的低

先給你這篇文章最重要的一組數字：把 GPT-5.6 Sol 的 reasoning 從 high 拉到 max，獨立評測機構 Artificial Analysis 的智能指數從 **56 變 59——多 3 分；代價是整套評測的成本從 $955 漲到 $2,824，接近三倍**。

7 月 9 日 GPT-5.6 上線後，大家都在問「哪個模型最強、要不要開最大」。我認為問錯了。這一代把模型分成三層（Sol / Terra / Luna）、把 reasoning 切成七檔，真正該問的是：**平衡點在哪**。這篇用查證過的數據回答這件事，順便把選型、Codex 設定、訂閱額度一次整理清楚。規格與價格以官方一手文件為準（2026-07-18 查閱），社群數據都標明來源。

## 一、先看菜單：GPT-5.6 是三層，不是一個模型

| 型號 | 定位 | API 價格（每百萬 token，input / output） |
|------|------|------|
| **Sol** | 旗艦：前沿推理、長鏈路 agentic 工作 | $5.00 / $30.00 |
| **Terra** | 均衡：官方原話「GPT-5.5 等級的表現，一半的成本」 | $2.50 / $15.00 |
| **Luna** | 快與省：高量、成本敏感場景 | $1.00 / $6.00 |

三個型號的基礎規格一樣：context window 官方標示約 105 萬 token、最大輸出 128K、知識截止 2026 年 2 月中、文字＋圖片輸入。一個小地雷：API 裡的 `gpt-5.6` 是別名，**直接路由到 gpt-5.6-sol**——沒指定型號就是在付旗艦價。

訂閱層速記：ChatGPT 免費版一般對話還停在 GPT-5.5 Instant；**Codex 免費層只有 Terra，付費層三型號全開**。

## 二、reasoning effort：七個檔位，先認識再談怎麼開

這一代真正的控制桿是 `reasoning.effort`（Responses API）：

| 檔位 | 官方語意（意譯自文件） |
|------|------|
| `none` | 延遲敏感、完全不需要推理 |
| `minimal` / `low` | 高效推理，延遲小幅增加 |
| `medium` | **預設**——大多數工作負載的平衡點 |
| `high` | 困難推理、複雜除錯、深度規劃 |
| `xhigh` | 深度研究、非同步工作流、長時間任務 |
| `max` | **GPT-5.6 新增**——需要更多探索與驗證的最難任務 |

三件官方明說、但常被誤傳的事：**① Sol / Terra / Luna 支援的檔位完全相同**（含 max），Luna 也能開 xhigh——後面會看到這件事為什麼重要；**② Ultra 不是 effort 檔位**，是獨立的多 subagent 並行機制（僅限符合資格帳號、桌面版要手動開旗標），官方原話是「大多數任務不需要 Max 或 Ultra」；**③ 從 GPT-5.5 遷移「沒有精確對應」**（官方原文 no exact mapping），建議沿用舊設定後試著降一檔比較。

**錢是怎麼燒的**：reasoning token 按 **output 費率**計價（`usage.output_tokens_details.reasoning_tokens` 看得到燒了多少），xhigh 比 medium 多耗 3–5 倍 token；GPT-5.6 起 cache write 收 1.25× input 費率（舊模型免費）、cache read 仍有大折扣；Codex 的 Fast mode 收 2.5× 額度換 1.5 倍速度。

## 三、核心：效益遞減曲線——數據比信仰誠實

把各檔位的「分數 × 成本」攤開，曲線長這樣：

**便宜的那一段很陡。** 一份 26 個真實 repo 任務的實測（Stet blog，GPT-5.5 世代）：測試通過率 low/medium 都是 81%，拉到 **high 跳到 96%**——中段到 high 的提升是十幾個百分點級別的，這段錢花得值。

**貴的那一段很平，甚至倒退。** 同一份實測再往上拉 xhigh，通過率**掉回 92%**——overthinking 是真實的失敗模式，它會想出「更聰明」的改法然後改過頭。到了 GPT-5.6 世代，Artificial Analysis 的數據把上緣量得更清楚：**Sol high→max 是 +3 分（56→59）、成本 ×2.96**；他們自己的總結是「default 拉到 max，各層級約 +2 到 +4 個百分點，且最高檔位效益遞減」。

**Ultra 是遞減曲線的盡頭。** 官方自己公布的數字：BrowseComp 從 90.4% 到 92.2%，**+1.8 個百分點**；第三方實測 Terminal-Bench 2.1 是 88.8% → 91.9%，原句就是「**約 3 倍成本，換 3.1 分**」。而在 Codex 裡實際跑，subagent 繼承父任務的模型與 effort、無法覆寫，token 消耗被乘 **6–12 倍**。OpenAI 官方則明確表示**不承諾固定成本倍率或線性品質回報**——連他們自己都不敢給你匯率。

所以平衡點在哪？我的判讀：

- **medium 起手**——它是官方預設不是沒原因的
- **high 是甜蜜點**——多個獨立來源共識，效益陡峭段的頂端、性價比峰值
- **xhigh / max 是特殊武器**——用之前問自己一句：這個任務值不值得用 3 倍成本買最後 3 分？值得的任務存在（推理鏈很深的難題），但它不是日常
- **Ultra 預設別碰**——只有「可拆成平行子任務」的工作才有意義，而且現階段它是額度黑洞

三個誠實註記，免得平衡點變成新的教條：

1. **反向查核做過了**：目前找不到 GPT-5.6 上「max 遠勝 high」的可信案例。網路流傳的大跳升數據（+20 幾個百分點）是舊世代 GPT-5 的 low→high 實驗，模型和檔位都不同，別被誤用。
2. **平衡點不等於一味降檔。** CodeRabbit 的數據：某類任務 Sol 成功率 63.7%、平均輸出 2.1 萬 token；Terra 成功率 40.7% 卻燒 5.6 萬 token——失敗重試加起來，「便宜」反而更貴。任務夠難時，一次到位才是省。
3. **曲線要自己畫。** Sebastian Raschka 的觀點：三模型 × 六檔位是 72 種組合，「Luna 開 xhigh」在某些任務上比「Sol 開 medium」又好又便宜——推理階段的算力有時比模型大小更有影響。別把型號當階級。

實務鐵則收尾：**一次只調一個變數**。失敗了先升 effort 或先換模型，擇一；同時動兩個，你永遠不知道是誰起了作用。

## 四、Codex 現在長什麼樣：一張產品地圖

如果你對 Codex 的印象還停在「終端機裡的 CLI」，更新一下：

- **CLI**：`npm i -g @openai/codex`（小心 `npm i -g codex` 是 2012 年的無關套件）
- **IDE**：VS Code 官方 extension（任務可甩給雲端續跑）、JetBrains、Xcode
- **Codex web / cloud**：背景多任務並行，可由 GitHub PR、Linear issue、Slack 觸發
- **手機 App**（Codex Remote）：6 月底 GA，QR 配對管理雲端任務
- **桌面**：7 月 9 日起原獨立 macOS Codex App **併入新版 ChatGPT 桌面 App**（macOS / Windows），Chat / Work / Codex 三模式；舊版改名 ChatGPT Classic

方向很清楚：Codex 正在從「一個工具」變成「一層無所不在的執行環境」。同一個任務有「本機互動」和「雲端背景」兩種姿勢——選對姿勢比選對模型影響還大。

## 五、在 Codex 裡設定 reasoning：所有入口一次列清

**config.toml**（個人偏好 `~/.codex/config.toml`，repo 專屬 `.codex/config.toml`）：

- `model_reasoning_effort`：主要的 effort 設定
- `plan_mode_reasoning_effort`：Plan 模式專用覆寫——規劃用高檔想清楚、執行用低檔動手，這個設計很聰明
- `model_reasoning_summary`（`auto/concise/detailed/none`）、`model_verbosity`：推理摘要與輸出詳細度

**互動中即時切換**：`/model`（模型＋effort 一起選）或 `/reasoning`（單獨切 effort）。**啟動時指定**：`codex -m gpt-5.6-terra`；任意設定用 `-c`，如 `codex -c model_reasoning_effort='"high"'`；不同情境用 `--profile` 疊層。

**邊界與預設**：IDE 跟 CLI 讀寫同一份 config.toml；**雲端任務目前不能逐任務選 effort**（官方明說）。什麼都不設的時候，CLI 開場就告訴你預設值：`gpt-5.6-sol` + medium——**出廠預設就是旗艦**。順帶闢個謠：「Codex 會自動依任務在 Terra 和 Sol 之間切換」是不存在的功能，GitHub 上的自動選模型 feature request 至今還開著沒人理。

## 六、訂閱用戶：預設就用 Sol，撞牆才有選擇題

前面的計價全是 API 視角——按量付費，每一檔 effort 都是錢。但多數用 Codex 的人是掛 ChatGPT 訂閱在跑的：月費固定，**額度沒撞頂之前，降檔省下的是零元**。這章用訂閱的腦袋重講一次。

**先講大家實際上怎麼用**：所有介面的出廠預設都是 **Sol + medium**，受訪的重度使用者也直說 Sol 就是日常主力（Every 的訪談，多位具名使用者：「至少 80% 的日常任務都交給 Sol」），沒有人在精算降檔。有趣的是，官方文案明明寫「Terra for everyday work, Sol when it's worth it」，**但 OpenAI 自己的預設值根本沒把你導向 Terra**。所以：如果你一直用預設 Sol 而且覺得很好——你沒做錯任何事。注意第三章的平衡點對你一樣成立，只是單位從「錢」換成「額度」：把 effort 開到 max 一樣是用 3 倍額度買 3 分。

**模型選擇對訂閱用戶有沒有意義？有，但只在撞牆時。** 官方 rate card 白紙黑字、卻很少人知道：**額度扣點按模型加權，比例正好跟 API 價格一致——Sol : Terra : Luna = 5 : 2.5 : 1**（官方訊息數估計對得上：Plus 每 5 小時窗 Sol 約 15–90 則、Terra 20–110、Luna 50–280）。翻譯：**切到 Terra，同樣額度直接變兩倍；Luna 變五倍。** 這是訂閱用戶唯一真正有感的槓桿——而且只在常態性撞上限時才值得拉。

**撞牆時，先查三個倍率，再考慮切模型**：Fast mode 收 **2.5 倍**額度（買到 1.5 倍速度，匯率自己想清楚）；**雲端任務約是本機的 3.5–5 倍**（社群共識；官方只確認共用同一池）；**Ultra 6–12 倍**。額度不明不白消失，八成是這三個，不是你模型選錯。

**方案速覽**（官方 rate card，2026-07-18 查閱）：Plus（$20）基準；Pro $100 版 5 倍、$200 版 20 倍；Free/Go 有 Codex 但額度未公布（`/status` 自己看）；Enterprise/Edu 月度視窗；新開的 Business 方案已不再提供 Codex seat。基準制度是「5 小時滾動窗＋週上限」——**時效注意**：2026-07-12 起官方因需求爆量「**暫時**」移除 Plus/Pro/Business 的 5 小時上限只留週上限，你讀到這篇時可能又變了，動手前查一次 Help Center。

**額度真的用完**：Plus/Pro 可加購 credits（效期 12 個月、可自動加購）；Free/Go 不能。或掛 API key 當溢出閥改按 token 計價。該訂閱還是全走 API？官方沒給公式，社群測算方向是重度互動開發選訂閱、大量自動化雲端任務先算 API——數字各家差很大，別照抄。

**一句話版本**：訂閱用戶的正確姿勢是「**用預設 Sol 用到撞牆；撞牆先關 Fast mode、收斂雲端任務和 Ultra；還不夠，再切 Terra 讓額度翻倍**」。

## 七、其餘最佳實踐：官方文件裡最值錢的幾條

**1. AGENTS.md 是你的制度層，不是說明書。** 從全域（`~/.codex/`）到 repo 逐層疊加讀取，越靠近當前目錄權重越高，預設疊到 32KiB。官方明講：**短而準勝過長而空泛**——只寫程式碼看不出來的事，等 agent 重複犯同一種錯才加規則。我自己的 AGENTS.md 就是這樣長出來的：每條規則背後都是一次真實的翻車。

**2. Prompt 四要素：Goal / Context / Constraints / Done-when。** 最不該省的是最後一個——**驗收條件寫死**。沒寫 done-when 的任務，agent 會用「看起來完成了」交差。

**3. 權限先保守後放寬。** Sandbox 三段（read-only → workspace-write → danger-full-access）、approval 三種（untrusted → on-request → never）。

**4. 模糊任務先進 Plan 模式**，搭配 `plan_mode_reasoning_effort` 高檔規劃、低檔執行。

**5. 並行靠 git worktree**：一個 chat 只做一件連貫的事，探索交給 subagent。

**6. MCP 節制地接**：先接一兩個解決具體痛點的。

**7. 三個已知的雷**（社群回報）：等 stdin 的互動式指令容易卡死；**長對話 compaction 後品質下降是官方承認的**（必要時調低 `model_auto_compact_token_limit` 或直接開新對話）；context 太長它會重複做過的事——把犯錯模式寫回 AGENTS.md，然後重開。

## 八、那 Claude Code 呢？

社群比較文方向一致：**Codex 強在「丟出去自動跑、回來審結果」，Claude Code 強在「終端機裡每步可插話」**。兩個提醒：「XX% 開發者偏好」類數字都是各家自報、方法論不可查證；多數比較文寫於 GPT-5.5 時代，看比較文先看日期。我的答案很無聊但實用：**兩個都用，按工作型態分工**——這行每兩個月換一次牌桌，把工作流綁死在單一工具上比選錯模型危險。

## 帶走三句話

1. **平衡點比你想的低：medium 起手、high 是甜蜜點；xhigh/max 是「3 倍成本換 3 分」的特殊武器；Ultra 預設別碰。**
2. **API 用戶精算（日常 Terra、難題才 Sol）；訂閱用戶不用算（預設 Sol 用到撞牆，撞牆先關 Fast mode、收雲端與 Ultra，再切 Terra）**——兩種帳本，兩種答案。
3. **一次只調一個變數**，加上 AGENTS.md 短而準、驗收條件寫死——設定做好，比追新模型有感得多。

---

## 本文來源

事實查核說明：規格、價格、參數名、額度機制以 OpenAI 官方一手文件為準（2026-07-18 查閱，參數名逐字核對）；部分 openai.com 頁面有機器人防護，經替代管道讀取原文核實。效益數據來自獨立評測與具名實測，均已標明；分數提升的單位是「百分點」（評測分數的絕對差），引用時請勿與相對百分比混用。

**官方來源**：
- Reasoning 指南：https://developers.openai.com/api/docs/guides/reasoning
- 模型目錄（三型號規格與檔位）：https://developers.openai.com/api/docs/models
- GPT-5.6 使用指引：https://developers.openai.com/api/docs/guides/latest-model
- Codex 設定參考：https://learn.chatgpt.com/docs/config-file/config-reference
- Codex 最佳實踐／AGENTS.md：https://developers.openai.com/codex/learn/best-practices
- GPT-5.6 發布：https://openai.com/index/gpt-5-6/
- Codex rate card（訂閱額度加權）：https://help.openai.com/en/articles/20001106-codex-rate-card
- Codex 官方定價頁（各方案訊息數區間）：https://chatgpt.com/codex/pricing/
- Credits 加購機制：https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-freegopluspro
- 5 小時上限暫時移除的官方社群討論：https://community.openai.com/t/clarification-on-the-temporary-removal-of-the-codex-five-hour-limit/1386911

**獨立評測與實測（文中已標註）**：
- Artificial Analysis：GPT-5.6 總評 https://artificialanalysis.ai/articles/gpt-5-6-has-landed 、Sol high/max 模型頁 https://artificialanalysis.ai/models/gpt-5-6-sol-high
- Terminal-Bench Ultra 成本效益：https://the-agent-report.com/2026/07/gpt-5-6-sol-terra-luna-benchmarks-pricing-analysis/
- Effort 曲線 26 任務實測：https://www.stet.sh/blog/gpt-55-codex-graphql-reasoning-curve
- 模型×effort 決策：https://agiflow.io/blog/codex-model-thinking-effort-guide
- 72 種組合的取捨：https://sebastianraschka.com/blog/2026/gpt-5-6-configurations.html
- Ultra subagent 成本實測：https://tokenkarma.app/blog/codex-sol-ultra-subagent-token-cost-2026/
- 重度使用者訪談：https://every.to/vibe-check/gpt-5-6-sol
