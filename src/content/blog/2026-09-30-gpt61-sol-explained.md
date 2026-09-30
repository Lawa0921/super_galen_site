---
layout: post
title: "GPT-6.1 Sol 來了：模型升級了，我可以少收尾一點嗎？"
date: 2026-09-30
categories: [AI, 開發工具]
tags: [GPT-6.1 Sol, OpenAI, Codex, Claude, AI Agent, 開發者工作流]
description: "OpenAI 幫 Codex 換了顆新腦袋，主打接近 Astra、價格更低。但以我的使用經驗，同樣用量下 Claude 能解決更多問題，還更快、更可靠。Sol 6.1 到底改了什麼？來看看新技能，順便算一下錢。"
author: "Galen"
---

OpenAI 又幫 Codex 換了顆腦袋，這次叫 [GPT-6.1 Sol](https://learn.chatgpt.com/docs/changelog)，9 月 29 日上線。官方主打接近 Astra 的能力，價格比較親民。

聽起來不錯。畢竟身為一個技能樹到處亂點的人，我很需要能幫忙做事的 AI。（手上的坑已經夠多了，真的。）

不過先講我的感想：**Claude 比 Codex 好用多了。同樣的用量，Claude 能幫我解決更多問題，而且更快、更可靠。**

這是我目前用下來的心得，不是這次 Sol 6.1 的對照實測。新模型剛上，總不能看完更新公告，就假裝自己已經帶它打完一輪副本。

所以這篇來看看 Sol 6.1 到底多了什麼本事，以及我最在意的：換了這顆腦袋，能不能讓我少收尾一點。

## Sol 6.1 是什麼？先認一下新隊友

**Sol 6.1 是模型，Codex 是拿來工作的工具。** 你可以把 Sol 想成 Codex 裡負責思考的那顆腦袋；它能讀哪些檔案、跑哪些指令，還要看外面接了什麼工具、開了什麼權限。

這次 OpenAI 給它的任務，是複雜的程式開發、電腦操作，以及文件等專業工作。官方說能力接近 Astra，但「接近」有範圍，不能自行翻譯成每一項都打平。[官方模型說明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

規格先看這幾個就好：

- **吃文字，也吃圖片，輸出文字。** 可以把截圖和需求一起交給它看。
- **Context window 105 萬 tokens，最多輸出 12.8 萬 tokens。** 能放進去的資料很多，適合需要讀大量內容的工作。
- **支援工具呼叫。** 搜尋、執行程式、操作電腦都在支援範圍內，實際能用哪些仍看環境。

Context 可以想成它眼前攤開來看的資料。桌子變大，確實比較好做事；但把整個專案倒上去，不代表它就全部讀懂了。

我的瀏覽器也能開幾十個分頁，知識並沒有因此自動進入腦袋。可惜。

## 價格只要五分之一？先看你拿誰來比

這次價格滿值得看，但比較對象要搞清楚，不然很容易開心太早。

下面是 **API 的 Standard 模式、短上下文費率，單位是美元／百萬 tokens**。輸入欄是未快取輸入，快取欄是快取讀取：

| 模型 | 輸入 | 快取 | 輸出 |
|---|---:|---:|---:|
| GPT-6 Sol | $2.00 | $0.20 | $10.00 |
| GPT-6.1 Sol | $2.00 | $0.10 | $10.00 |
| GPT-6 Astra | $10.00 | $1.00 | $50.00 |

來源：[OpenAI 價目表](https://developers.openai.com/api/docs/pricing)、[上一代 GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)。

**跟 Astra 比，Sol 6.1 的未快取輸入和輸出單價都是五分之一。跟舊 Sol 比，這兩項沒降，降的是快取讀取。**

如果本來就在用 Sol，看到「五分之一」就開始規劃省下來的錢，先把購物車關掉。

假設一筆請求用了 10 萬個未快取輸入 tokens，加上 1 萬個計費輸出 tokens，沒有快取寫入、工具費或其他加價：Sol 6.1 是 **$0.30**，Astra 是 **$1.50**。這只是照指定用量算錢，不代表它們解同一個問題會用掉一樣多的 tokens。

另外有幾項要一起算：輸入超過 **272K tokens**，整筆請求會改用較高的長上下文費率；**Fast 是 Standard 費率的兩倍**；快取寫入則是每百萬 tokens **$2.50**。[完整費率](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

至於訂閱 ChatGPT 跑 Codex，要看方案自己的額度規則。這張表不能直接換算成「我的月費可以問幾次」，也還沒比到 Claude。

## Token 便宜很好，重跑也要算錢

假設請 AI 修一個 bug，第一輪沒修好，第二輪補了說明，第三輪終於能跑，結果旁邊又壞一個。最後自己捲起袖子改。

這幾輪的用量照算，自己的時間也照花。修 bug 還附贈新 bug，我自己就會了，不需要付費解鎖。

所以我看 AI 好不好用，滿現實的：同樣的用量，能幫我清掉多少工作？從丟需求到真的能用，要等多久？拿回來的東西靠不靠得住，還得花多少時間補救？

**Claude 目前讓我覺得比較好用，就是因為這幾件事它做得更好。** 解決的問題更多，速度更快，也比較可靠。這是每天拿來做事時會直接感受到的差距。

如果能用這個價格把事情做好，當然值得試。只是模型的每個 token 變便宜，跟我做完一件事變省，中間還隔著幾輪重跑，以及一個正在等它的我。

真要把這個差距量成數字，就得先說清楚「同樣用量」是同一筆預算、實際費用，還是各自方案的額度。兩邊介面上的百分比不是通用貨幣，不能拿來直接除一除，就宣布誰輾壓誰。

## 想用新模型，這幾個坑先避開

Sol 6.1 首波開放 **Plus、Pro、Business、Enterprise、Edu**，入口在 Codex、ChatGPT Work 和 API。一般 Chat 模式沒有，Free／Go 也不在首波範圍；Enterprise／Edu 需要管理員啟用，實際還是看帳號與客戶端。[可用性說明](https://learn.chatgpt.com/docs/models)

用 Codex CLI 的話：

```bash
codex --model gpt-6.1-sol
```

已經開著互動 session，就用 `/model` 選；桌面版看模型選單或 Advanced 設定。找不到先查版本和工作區權限。[設定方式](https://learn.chatgpt.com/docs/models)

自己接 API 的人，多看兩眼再改設定：

**舊 Sol 的 `none` 不能直接搬過來。** Sol 6.1 支援 `low`、`medium`、`high`、`xhigh`、`max`，預設是 `medium`，沒有 `none` 或 `minimal`。

**要用工具呼叫，走 Responses API。** Sol 6.1 的 Chat Completions 只支援不帶工具的請求。只改模型名稱就收工，很可能第一個任務還沒跑，先幫自己新增一張 bug 單。[API 遷移指引](https://developers.openai.com/api/docs/guides/latest-model)

速度模式目前有 Standard 和 Fast，Sol 6.1 的 Ultrafast 還沒上。介面裡的 Ultra 則涉及多 agent 並行，跟 Ultrafast 是兩件事。[模式說明](https://learn.chatgpt.com/docs/models)

## 新隊友可以試，主力先不換

Sol 6.1 值不值得用，拿自己熟悉的工作試最準：一個知道怎麼驗收的 bug、一段需要整理的程式，交給 Claude 和使用 Sol 6.1 的 Codex 各做一次。

兩邊從一樣的檔案開始，用各自獨立的副本。別讓後跑的直接撿前一輪修好的成果，那叫抄作業。把模型、推理設定、工具權限記下來，再看花費、完成時間，以及自己介入幾次。失敗和放棄的也要算進去。

我目前還是會把 Claude 放在主力的位置。Sol 6.1 如果能讓 Codex 用同樣的用量做完更多事、少讓我操心，我很樂意換手用。

**幫我把事情做完，讓我早點關電腦，比模型名字後面多了幾個數字實在。**

---

## 資料從哪來

*規格與價格查閱於 2026 年 9 月 30 日，以官方文件為準。Claude 的部分是我的使用心得，沒有附上固定預算或固定 token 數的對照測試；上面的美元試算是算術示例。*

- [GPT-6.1 Sol 模型規格與費率](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [GPT-6 Sol 模型規格與費率](https://developers.openai.com/api/docs/models/gpt-6-sol)
- [OpenAI API 價目表](https://developers.openai.com/api/docs/pricing)
- [GPT-6 使用與遷移指引](https://developers.openai.com/api/docs/guides/latest-model)
- [ChatGPT Work 與 Codex 的模型、設定及可用性](https://learn.chatgpt.com/docs/models)
- [ChatGPT 與 Codex 更新紀錄](https://learn.chatgpt.com/docs/changelog)
