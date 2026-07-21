---
layout: post
title: "AI 真正進入 Unity，不是因為更會寫 C#：缺的其實是驗證迴圈"
date: 2026-07-21
categories: [AI, 遊戲開發, 程式開發]
tags: [Unity CLI, Unity Pipeline, AI Agent, GameDevBench, 遊戲測試, MCP]
description: "Unity CLI 與 Pipeline 讓 AI agent 能觀察 Editor、修改場景、執行測試並讀回結果。真正的突破不是又多一個程式碼生成器，而是遊戲開發終於有了 agent 可用的回饋迴圈。"
author: "Galen"
---

你把一個 bug 丟給 AI：「角色有時會穿過地板。」

它寫出一段看起來合理的 C#，然後告訴你問題修好了。

但它沒有開啟場景、沒有進入 Play Mode，也沒有看見角色又一次掉進虛空。

這正是 AI coding 搬進遊戲開發後最常見的錯覺：**會改程式碼，不等於會修改一個正在運作的遊戲。**

2026 年 7 月 20 日，Unity 發布新的 [Unity CLI](https://unity.com/blog/meet-the-unity-cli) 與實驗中的 `com.unity.pipeline` package；Unity 也在 7 月 21 日舉辦的 [Unite Seoul](https://unity.com/events/unite-2026) 期間，把這套開發工具放進更大的 Unity Production Pipeline 敘事。官方示範裡，AI agent 接到「角色偶爾穿地板」的回報後，直接檢查執行中的場景，找到被停用的 collider，修正狀態，再重新進入 Play Mode 確認結果。

乍看之下，新聞標題可以寫成「AI 現在會操作 Unity 了」。

但真正重要的不是 AI 多學會一組 Unity 指令，而是 Unity 這次把遊戲引擎裡的**觀察、行動與驗證**整理成 agent 可以程式化呼叫的介面。

我的觀點是：

> 下一階段的 AI 遊戲開發，競爭焦點不只是哪個模型最會寫 C#，而是哪套工作流能讓模型最快發現自己寫錯了。

## 先拆開三個容易混在一起的東西

Unity 這次同時談 CLI、Pipeline package 與 Production Pipeline，很容易讓人誤以為「整個 Unity production 已經能交給 agent」。實際狀態沒有那麼簡單。

| 層次 | 現在能做什麼 | 目前限制 |
|---|---|---|
| **Unity CLI** | 從 terminal 安裝 Editor 與 modules、開啟專案、處理登入，輸出 JSON／TSV 與明確 exit code | 官方仍標示為 experimental |
| **`com.unity.pipeline`** | 透過本機 API 控制執行中的 Editor 或 development build，呼叫註冊指令、跑測試、觸發 import，甚至執行即時 C# | Unity 6.0 以上；package 仍是 experimental |
| **Unity Production Pipeline** | 讓 web app、DCC 工具、自動化系統與 agent 透過統一 API 存取專案、資產、build 與協作流程 | closed beta 期間，官方文件明確寫著 Pipeline REST APIs 仍是 **read-only** |

也就是說，可在本機形成回饋迴圈的開發工具已經可以試用；截至本文查核日，官方仍將 Unity Production Pipeline 標示為 beta，並明文說 closed beta 期間的 Pipeline REST APIs 是 read-only。Unity 官方論壇表示 closed beta 會持續收團隊，目標在 11 月 general availability，但 roadmap 本身不是交付承諾。

這個區分很重要。今天可以認真討論的是「agent 如何操作一個開著的 Unity 專案」，不是「無人工作室已經成立」。

## 遊戲開發為什麼比一般 coding agent 更難？

一般程式碼任務常能縮成一條文字鏈：讀 issue、搜尋 repository、修改檔案、跑 test、看 exit code。

遊戲專案多了另一個世界。

一個角色能不能跳，不只取決於 `PlayerController.cs` 是否編譯；還可能取決於 scene 裡掛了哪個 component、collider 尺寸、layer collision matrix、Animator transition、Prefab override、物理更新時機，以及多人遊戲中誰擁有 authoritative state。

程式碼只是遊戲狀態的一部分。更麻煩的是，很多錯誤只有「玩起來」才存在：

- 動畫有播放，但 sprite 用錯方向。
- 按鈕能點，但回饋慢到玩家以為沒反應。
- 敵人會追蹤玩家，但轉彎時一直撞牆。
- 關卡可以通關，但攝影機在最後一段遮住出口。
- 多人同步在單機測試正常，上線後卻只有 host 看得到結果。

2026 年的 preprint [GameDevBench v2](https://arxiv.org/abs/2602.11103v2) 把 333 個真實教學衍生任務放進 Godot，測試 agent 修改動畫、shader、collision、scene layout 與遊戲邏輯的能力。論文摘要中，最佳 agent 與方法也只完成 53.8% 的任務；在 8 個 agent 使用各自 native harness 且開啟 multimodal feedback 的結果中，平均成功率從偏 gameplay logic 的 51.4%，降到更依賴視覺理解的 2D graphics 任務的 33.0%。

更值得注意的是，研究者沒有先換模型，只是補上 screenshot 與 video feedback。以 full task set 的其中一組結果為例，GPT-5.4 的成功率便從 41.1% 提升到 52.0%。

另一篇 7 月發布的 preprint [GameEngineBench v2](https://arxiv.org/abs/2607.03525v2) 則用九個真實 Unreal Engine 5 repositories 建立 110 個 C++ 任務。在它結合 runtime tests 與 LLM judge 的評估 protocol 下，最強設定的 pass@1 是 55.5%，而且有 31 題所有受測設定都無法解出。作者指出，patch 即使能編譯，仍可能因為 object lifecycle、network replication 或 engine subsystem 的互動而失敗。

這兩組數字不能直接拿來比較 Unity CLI 的成效：引擎、模型、任務與評分方法都不同，而且它們都是 preprint。它們共同支持的只有一個較保守、但很關鍵的結論：

> 遊戲 agent 的問題不只是「不知道該寫什麼」，而是「看不見修改後的世界發生了什麼」。

## Unity CLI 補的不是 terminal，而是閉環

如果只把 Unity CLI 理解成「不用 Unity Hub 也能安裝 Editor」，那它只是方便一點的開發工具。

對 agent 而言，真正有價值的是三個介面特性。

### 1. 結果變得可機器判讀

CLI 可以輸出 JSON 或 TSV，並把正常結果、錯誤與 exit code 分開。這聽起來很普通，卻是可靠自動化的地基。

人可以從一大段 Console log 裡猜出「大概有兩個 warning、一個真正的 error」；agent 更需要穩定 schema，才能判斷下一步是繼續、重試或停下來求助。

### 2. Editor 會說明自己有哪些能力

安裝 `com.unity.pipeline` 後，`unity command` 可以列出目前 Editor 暴露的 commands。專案也能用 `[CliCommand]` 把自己的 static method 變成可呼叫工具。

這代表團隊不必期待通用模型記住每個專案的暗號，而能明確提供：

```text
validate-scenes
run-playmode-tests
build-development-player
capture-gameplay-screenshot
inspect-active-colliders
```

這些名字只是建議，不是 Unity 內建指令。重點在於：agent 看到的是團隊定義、可重複執行、輸出可預期的能力，而不是每次都臨時拼一段 Editor script。

### 3. Agent 能對執行中的狀態提問

`unity command eval` 可以在 running Editor 或 Player 裡執行 C#，不必經過完整的 project recompile 與 domain reload。官方說它透過 Roslyn 編譯、在 Editor main thread 執行，能觸及專案可用的 engine 與 editor APIs。

於是工作流可以從：

```text
生成 patch → 人類打開 Unity → 人類複製錯誤 → AI 再猜一次
```

變成：

```text
觀察 scene/runtime → 修改 → 跑測試 → 進 Play Mode → 讀取結果 → 再修改
```

這才是從 assistant 到 agent 的分界。不是回答變長、推理模式變多，而是它能用外部世界的結果修正自己的判斷。

## 「能驗證」還不等於「知道遊戲好不好」

閉環很重要，但不能把所有 feedback 混成同一件事。

至少要分成三層：

| 驗證層 | 可以回答的問題 | 回答不了的問題 |
|---|---|---|
| **Build health** | 能否編譯、import、打包？ | 遊戲是否真的可玩？ |
| **Runtime behavior** | collider 是否啟用、事件是否觸發、狀態是否同步？ | 操作是否舒服、節奏是否合理？ |
| **Play experience** | 玩家是否看得懂、按鍵是否有回饋、關卡是否有趣？ | 不同玩家長期會不會喜歡？ |

Unity CLI 與 Pipeline package 直接強化前兩層。它們也能幫 agent 啟動 build、擷取狀態，為第三層提供材料；但 engine state 不是玩家經驗本身。

[GUI Agents for Continual Game Generation v1](https://arxiv.org/abs/2605.28258v1) 這篇 preprint 更進一步，讓一個 GUI agent 實際用滑鼠與鍵盤玩 browser games，再把觀察交回 coding agent。這個 Play2Code 迴圈得到 66.8% 的 rubric pass rate，比 single-pass baseline 高 37.1 個百分點，也比另一個 agentic-coding baseline 高 14.6 個百分點。

這項研究目前只測 HTML-based games；作者把 native engine 與 3D games 明列為未來工作，因此它不能直接證明同樣增益會出現在 Unity 專案。

但作者同時發現，不同 GUI agent backbones 關注的問題類型並不相同，呈現出作者所稱、類似人類測試者的 idiosyncratic feedback。這提醒我們：自動 playtest 可以抓「按鈕沒反應」或「勝利條件沒觸發」，卻不能把某個 agent 的關注偏好偽裝成所有玩家的樂趣。

所以合理的分工不是 AI 取代 playtester，而是：

- 機器大量清掉可重現的 build 與 runtime 問題。
- GUI agent 探索互動路徑，留下可追蹤的操作紀錄。
- 人類把時間留給手感、節奏、情緒、驚喜與「這到底好不好玩」。

## 最大風險也藏在同一個入口

能執行任意 C# 是強大的除錯能力，也是非常寬的權限。

Unity 說 `eval` 由 security token 保護；development Player 的 runtime control 預設關閉、只允許 localhost，且不應放進 production。不過這篇官方文章沒有說明 token 是否具備 capability scopes 或 method-level authorization，因此不能只憑「有 token」就把 `eval` 視為 sandbox。

如果 agent 可以呼叫專案內所有 API，它理論上也可能刪除 assets、改寫 scene、觸發昂貴 build，或把錯誤狀態保存回版本控制。這不是 Unity 已發生的安全事件，而是從能力範圍推導出的工程風險。

因此我會把 Unity 的兩種入口分工得很清楚：

- **已知、重複的工作走 `[CliCommand]`**：把可執行範圍縮成明確 method，並由團隊在 method 內實作輸入驗證、輸出格式與副作用限制。
- **未知問題才暫時用 `eval` 探索**：把它當 debugger，不把它當 production automation API。

再加上三條很無聊、卻比「全自動」更重要的規則：

1. Agent 的修改必須落在獨立 branch 或可回復的 workspace。
2. destructive commands、正式 build 與 deployment 要有明確 approval gate。
3. 每次成功都要留下驗證證據，不接受「程式碼看起來正確」。

真正成熟的 agent workflow，不是給模型最大權限，而是給它**剛好足以完成並證明任務的權限**。

## 小型團隊現在最值得做的，不是打造無人工作室

Unity 的 announcement 很容易誘發一份宏大的 roadmap：自動生 asset、自動寫 gameplay、自動 build、自動上架。

先不要。

對小型團隊，最有價值的第一步可能只是挑一個每天重複、結果可判定的流程，例如：

```text
檢查所有 scenes 的 missing references
→ 執行 EditMode / PlayMode tests
→ 啟動 development build
→ 驗證角色能出生、移動並完成一個最短關卡
→ 輸出結構化報告與截圖
```

這條流程不會替你發明下一款神作，卻能讓 agent 對「完成」提出證據。當這條路穩定後，再逐步開放 prefab 修改、asset import、runtime inspection 與視覺回歸。

這也符合目前工具的真實成熟度：Unity CLI 與本機 Pipeline package 已可實驗，Production Pipeline 仍在 closed beta，REST APIs 暫時 read-only。現在適合建立可觀察、可回復的小閉環，不適合把整條 production chain 綁在尚未穩定的介面上。

## AI 遊戲開發的下一個 benchmark，應該是「多久發現自己錯了」

過去我們常問：模型一次能產生多完整的遊戲？

這個問題會獎勵漂亮的 first draft，卻忽略遊戲開發真正消耗時間的地方：整合、執行、遊玩、發現不對，再回頭修改。

Unity CLI 的意義，是把這段原本困在 GUI 與人工傳話裡的迴圈，變成可由工具呼叫、可讀取結果、可持續修正的 execution surface。

它不會讓模型突然懂得什麼叫好玩，也不會消除引擎整合的複雜度。相反地，它把那些複雜度更誠實地暴露給 agent，迫使 agent 面對實際執行結果，而不是停在語法正確的答案裡。

當兩個模型都能寫出角色控制器，真正拉開差距的，可能不再是誰第一版寫得更快，而是：

- 誰能看見角色沒有落在地面上。
- 誰知道該檢查 collider、layer 還是 network authority。
- 誰能修改後重新遊玩。
- 誰在證據不足時不會宣稱完成。

**會寫，是生成能力。會發現自己寫錯，才是工程能力。**

Unity 這次真正交給 AI agent 的，不只是一個 terminal。

而是一面鏡子。

## 帶走三句話

1. **Unity CLI 的關鍵不是命令列，而是讓 agent 能觀察、行動、驗證，再根據結果修正。**
2. **本文引用的遊戲 benchmark 顯示，在特定實驗設定中，視覺或 runtime feedback 能明顯改善部分 agent，但目前離可靠的全自動遊戲開發仍很遠。**
3. **先把安全、可回復、可判定的驗證流程交給 agent；創意方向與玩家感受仍要由人負責。**

---

## 本文來源

*事實查核說明：本文資料查閱於 2026 年 7 月 21 日。Unity CLI 與 `com.unity.pipeline` 皆由官方標示為 experimental；Unity Production Pipeline 為 beta，Pipeline REST APIs 在 closed beta 期間為 read-only。文中對權限分層、`eval` 使用方式與小型團隊導入順序的建議，是根據官方公布的能力範圍所做的工程判斷，不是 Unity 的官方安全指南。三篇 agent benchmark 均為 arXiv preprint；本文數字分別鎖定 GameDevBench v2、GameEngineBench v2 與 GUI Agents for Continual Game Generation v1，只代表各自的模型、引擎、任務與評估設定，不宜橫向排名。*

- [Meet the Unity CLI: manage Unity from your terminal（Unity）](https://unity.com/blog/meet-the-unity-cli)
- [Unite 2026：Seoul 活動日期（Unity）](https://unity.com/events/unite-2026)
- [Unity CLI 使用文件（Unity Docs）](https://docs.unity.com/en-us/unity-cli/use-unity-cli)
- [Unity Pipeline package：local HTTP API 與 Unity 6.0 需求（Unity Docs）](https://docs.unity.com/en-us/unity-production-pipeline/local-tools-cli/unity-pipeline-package)
- [Unity Pipeline architecture（Unity Docs）](https://docs.unity.com/en-us/unity-production-pipeline/overview)
- [Unity Pipeline APIs：closed beta 期間為 read-only（Unity Docs）](https://docs.unity.com/en-us/unity-production-pipeline/pipeline-api)
- [Opening your Unity production to the whole team（Unity Discussions，Official）](https://discussions.unity.com/t/opening-your-unity-production-to-the-whole-team-closed-beta-is-live/1731109)
- [GameDevBench: Evaluating Agentic Capabilities Through Game Development v2（arXiv）](https://arxiv.org/abs/2602.11103v2)
- [GameEngineBench: Evaluating Coding Agents on Real C++ Runtime Environments v2（arXiv）](https://arxiv.org/abs/2607.03525v2)
- [GUI Agents for Continual Game Generation v1（arXiv）](https://arxiv.org/abs/2605.28258v1)
