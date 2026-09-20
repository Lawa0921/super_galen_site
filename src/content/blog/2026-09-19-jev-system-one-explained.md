---
layout: post
title: "Jev 連《殺戮尖塔 2》都能打：AI 判斷跟上遊戲速度了"
date: 2026-09-19
categories: [AI, 開發工具]
tags: [Jev, TypeSafe AI, System One, AI 自動化, 結構化輸出]
description: "Jev 已被接進《殺戮尖塔 2》做即時決策。我對照遊戲示範與第三方測試，看看又快、又準、又便宜的 AI 判斷能改變什麼。"
author: "Galen"
---

[TypeSafe 發表 Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) 時，說它能在某些流程裡快 **193.6 倍**、便宜 **444.6 倍**。我自己試用下來，感覺也確實是**快、準、省**；但這種數字大到我反而不知道該拿來做什麼。

然後我看到有人讓它打《殺戮尖塔 2》。

一個要看手牌、敵人意圖、血量與下一步選項的遊戲，模型每做一次決定就要等一次。等兩三秒，玩家已經會覺得卡；如果每步都要花錢，整場跑完也會痛。Jev 能在這裡派上用場，比「客服信件分類又快了一點」更讓我有感。

我原先把 Jev 想成便宜的分類器，現在比較想把它當成**可以反覆呼叫的決策零件**。遊戲只是最容易看懂的示範；產品裡也到處是「看一下現在的狀態，從合法動作挑下一步」的時刻。

## 它真的能打《殺戮尖塔 2》嗎？

有兩個公開案例。[Paul Wei 的操作影片與貼文](https://x.com/coolish/status/2100570517954838897)說，他先前用 GPT-6 Astra 代打，能力強但動作慢；換成 Jev 後，**每次行動判斷約 0.7 秒**，快到他看不清畫面就已經操作完。這是作者提供的單次示範與計時，沒有公開同條件的勝率比較。

[另一位開發者的實作紀錄](https://www.reddit.com/r/ArtificialInteligence/comments/1wkjatd/i_hooked_jev_up_to_slay_the_spire_2_it_made_it_to/)更能看出接法：程式讀取遊戲狀態，把可選動作交給 Jev；Jev 選下一步，程式負責真的按下去。作者說它打到第一章 Boss 才輸，整體跑了約一小時、API 費用約 **US$0.03**，還刻意把兩步間隔限制在三秒，因為原本快得難以觀看。他也明說，藥水和少見互動還沒接好，策略混用了通用規則與社群卡牌排行。

所以「Jev 能打」已經有實際示範；「Jev 很會打」還沒有同樣強的證據。我覺得更值得關注的是：**一個模型已經便宜、快速到可以塞進遊戲的連續決策迴圈，讓程式反覆問它下一步，而不是等它寫一篇攻略。**

## 從遊戲回到你的產品

一封顧客來信進來，你得決定它屬於帳務還是技術、是否急迫、顧客有沒有要求退款。你可以寫關鍵字規則；碰到「我又被扣了一次錢」這種沒寫到「退款」的句子，規則就開始脆弱。你也可以每封都叫大型語言模型讀一遍，但量一大，延遲、費用和覆核都得算進去。

Jev 的做法是給它一份 `state`，再附上幾個答案範圍明確的問題。它把自己稱為 **System One Model**；[官方文件](https://docs.typesafe.ai/primitives)目前提供三種問題：`Choice` 從指定選項挑一個，`Score` 評分，`Noul` 回答某個敘述為真的機率。同一份訊息可以一次問完多題，程式再根據答案分派、補問或轉人工。

如果用 [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)，大概長這樣：

```ts
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { message: "I was charged twice. Please fix this ASAP." },
  questions: {
    team: choice("Which team should handle this message?", {
      billing: "Charges, invoices, or payment problems",
      technical: "Bugs or integration failures",
      other: "None of the above",
    }),
    urgent: noul("Does the message express urgency?"),
  },
});

console.log(response.answers.team.choice);
console.log(response.answers.team.probabilities);
console.log(response.answers.urgent.noul);
```

這段是依官方介面寫的示意，不是下面公開測試的原始程式或輸出。

我在意的是 `probabilities`。假設帳務 0.51、技術 0.49，你就知道這封信不適合直接丟給某個部門。官方的 `confidence` 是選項分布有多集中，**不是這次答對的保證書**；`Noul` 則回傳機率，沒有另一個 `confidence` 欄位。[官方對兩者的說明](https://docs.typesafe.ai/confidence)

把模型放進流程的關鍵，是程式能利用這些訊號決定何時停下來交給人。否則只是把「看起來很確定的錯誤」自動化。

## 除了能打遊戲，數字撐得住嗎？

我想看的其實很直白：速度、準確率、費用能不能**同時**過關。只快但常選錯牌，遊戲很快就結束；只準但每步要等三秒，也做不成流暢的操作。

一份 [100 則合成評論的測試](https://github.com/mameli/jev-vs-luna)，每則重複三次、同時抽五個欄位，Jev 的欄位正確率 **96.13%**，GPT-5.6 Luna 無 reasoning 是 **97.13%**；成功請求的等待時間中位數 **0.647 對 1.556 秒**，已知費用約低 **4.9 倍**。在這組任務裡，Jev 的確呈現出「品質接近、明顯更快、更便宜」的組合。樣本只有 100 則不同評論，還不能把這組比例直接搬到任何產品上。

另一份 [49 個任務、每個模型共 8,225 筆資料的公開測試](https://github.com/OmarMujahid/jev-decision-bench)比較 Jev 與 Luna 的無／低 reasoning 設定。依作者判準，Jev 在 29 題領先、13 題相近、7 題落後；但 95% 信賴區間完全不重疊的只有 7 題，其中 Jev 贏 6 題。方向讓人想試，幅度仍要看自己的任務。

這份測試也說明為什麼只看一個「快幾倍」容易誤會。作者報的服務端中位時間約 **105 對 710 毫秒**，每千筆費用約 **US$0.04 對 US$0.16**。我從[逐筆結果檔](https://github.com/OmarMujahid/jev-decision-bench/tree/main/results)重算兩邊各 8,225 筆 `wall_ms`，請求端等待中位數是 **977 對 1021 毫秒**；在這個環境，其他請求開銷吃掉了大半服務端優勢。但上面的評論測試和遊戲示範，也確實顯示 Jev 能把實際等待壓到一秒內。**快慢要量你真正要走的那條路。**

至於官方的 **193.6 倍快、444.6 倍便宜**，[TypeSafe 的 workflow 評測](https://evals.typesafe.ai/)把四種流程拆成小問題，用高階模型的答案共識當參考標籤。發表文章也說展示用輸入偏短，倍率可能位於實務收益的高端。我會把它當成產品設計的可能性，不當成每次 API 呼叫的保證。

## 準確率取決於你怎麼問

最能提醒我問題設計有多重要的，是[另一份 2,000 封合成釣魚郵件測試](https://github.com/anisselbd/jev-phishing-bench)。直接問「這是不是釣魚郵件」，Jev 答對 **62.6%**，Claude Haiku 4.5 是 **81.3%**。Jev 的請求中位數 **239 對 687 毫秒**，每千封定價約 **US$0.038 對 US$0.462**，但這個問法判得不夠好。

有趣的是，把問題拆成五個訊號，再交給程式做分類，Jev 在留出的測試集達 **95.0%**；同樣做法配 Haiku 是 **93.2%**，這份資料不足以證明兩者真有差距。更讓我停下來想的是：針對這份資料寫的**簡單網址規則就有 91.8%**。

同一個模型，換個問法，結果可以差這麼多。Jev 的便宜與速度，讓你負擔得起把大問題拆成幾個小判斷；程式再把它們組回來。遊戲裡先整理合法動作、再讓模型選，走的也是這條路。這也提醒我：**準確率是模型、問題設計與程式規則一起做出來的結果。**

## 我會把 Jev 放在哪裡？

《殺戮尖塔 2》讓我想到的第一類，是**每幾秒就要選一次動作**的流程：遊戲代理、互動介面、工具路由，或先決定哪些事件值得交給較慢的模型。第二類才是大量分類、評分和分派。只要程式能整理好當前狀態與合法選項，Jev 就能一直當那個「下一步選什麼」的判斷器。

寫回信、摘要或解釋理由仍需要生成式 LLM；金額和日期則交給普通程式碼。現有模型配合 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 也能嚴格限制 JSON 欄位與選項。若要替換已在跑的流程，我會讓 Jev 和這些現有做法處理同一批資料，比較品質、端到端等待與總成本。

這裡還有幾個現實限制。[TypeSafe 自己列出的失敗模式](https://docs.typesafe.ai/model-jaggedness/jev-1.13)包括計數、金額與日期判斷不穩、無關文字干擾、對抗性內容可能影響答案；這些都不該交給它當最後一道關卡。官方也說英文表現最好，繁中等 CJK 語言尚未達到同樣水準。一份[第三方測試](https://github.com/OmarMujahid/jev-decision-bench/blob/main/RESULTS.md)雖在 150 筆中文自然語言推論題測得 Jev 79.3%、Luna 無 reasoning 74.7%，信賴區間仍重疊，而且這不是台灣客服資料。

價格確實有誘惑力。[截至 2026 年 9 月的官方規格](https://docs.typesafe.ai/models)列出 `jev-1.13.0` 的輸入每百萬 token **US$0.042**、輸出不另收費，且目前只支援文字。假設一天 100 萬筆、每筆連同問題共 500 個計費輸入 token，輸入費的紙上算術是 **US$21／日**。這沒有算速率限制、系統成本、人工覆核和誤判；我會把它當成「值得做實驗」的理由，不會拿它當正式上線預算。

若要驗證高頻流程，我會記錄每一步看到的狀態、合法動作、Jev 的選擇、實際結果、等待時間與費用。玩得很快是一回事；能不能穩定打完一局，或在真實產品裡少讓人收拾錯誤，是下一個要回答的問題。

Jev 真正有趣的地方，是把「有點模糊、但一整天都在發生」的判斷壓到能反覆呼叫的成本和速度。《殺戮尖塔 2》把這件事演給我們看：**當 AI 的下一步來得夠快、夠便宜，產品可以開始設計一整串決策，而不只是在某個按鈕後面等一次回答。**

---

## 本文來源

*事實查核說明：資料查閱於 2026 年 9 月 20 日。「快、準、省」是我的試用感受，本文沒有提供個人測試的樣本數與原始紀錄，不能據此推算通用勝率。遊戲示範的速度、進度與費用由各自作者自述，尚無同條件多次對照。官方倍率來自 TypeSafe 自設的 workflow 評測；三份第三方測試的任務、對照模型及統計方法不同。我只從跨任務測試公開的逐筆紀錄重算 `wall_ms` 中位數；另兩份沒有提交逐筆 API 回應，文中準確率採用原作者報告。*

- [TypeSafe：Introducing System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [TypeSafe：Primitives、Confidence、Models 與 Jev 1.13 失敗模式](https://docs.typesafe.ai/primitives)
- [Jev Decision Bench：49 個任務與逐筆結果](https://github.com/OmarMujahid/jev-decision-bench)
- [Jev vs Luna：合成評論欄位測試](https://github.com/mameli/jev-vs-luna)
- [Jev Phishing Bench：合成郵件測試](https://github.com/anisselbd/jev-phishing-bench)
- [Paul Wei：Jev 玩《殺戮尖塔 2》的示範](https://x.com/coolish/status/2100570517954838897)
- [另一位開發者的 Jev《殺戮尖塔 2》實作紀錄](https://www.reddit.com/r/ArtificialInteligence/comments/1wkjatd/i_hooked_jev_up_to_slay_the_spire_2_it_made_it_to/)
