---
layout: post
title: "LLM 是什麼?揭開 AI 聊天機器人的神秘面紗"
date: 2025-10-10
categories: [技術, AI人工智慧]
tags: [LLM, GPT, AI, 機器學習, Transformer]
description: "用幽默風趣的方式解釋 LLM 大型語言模型,以及它如何讓 ChatGPT 變得這麼聰明"
author: "Galen"
---

# LLM 是什麼?揭開 AI 聊天機器人的神秘面紗

如果你最近曾經打開社群媒體、看過新聞、或是跟同事聊天,可能或多或少聽過「LLM」這個詞。也許是看到 ChatGPT 的新聞標題、也許是聽老闆在會議上說「我們要導入 LLM」、也許是朋友興奮地分享「我用 AI 寫了一篇報告!」

但 **LLM 到底是什麼鬼?**

更重要的是:**為什麼 ChatGPT 可以跟你聊天聊得有模有樣,卻又會在你問「1+1=?」時偶爾出錯?**

如果你曾經好奇 AI 怎麼運作、為什麼它有時候聰明得嚇人有時候又蠢得可愛、或是為什麼大家都說它「會幻覺」—那這篇文章就是為你寫的。

---

## 什麼是 LLM?一個超級愛看書的學霸

LLM 的全名是 **Large Language Model(大型語言模型)**。聽起來很厲害對吧?簡單講,它就是一個**讀過超級多書的 AI**。

想像你有個朋友,他這輩子讀了全世界所有的書、所有的網站、所有的 Reddit 討論串。當你問他問題時,他不是「真的理解」你在問什麼,而是根據**「我看過這麼多文字,統計上來說,接下來應該說這句話」**來回答你。

這就是 [LLM 的本質](https://aws.amazon.com/what-is/large-language-model/):**一個超級強大的「接龍高手」**。

### LLM 的三個關鍵特徵

**1. Large(大型)** - 模型參數動輒幾百億、幾千億
  - GPT-3 有 1750 億個參數
  - GPT-4 據傳有 1.76 兆個參數(OpenAI 沒公開確切數字)
  - 這些「參數」就像大腦的神經連結,越多越聰明

**2. Language(語言)** - 專門處理文字
  - 可以寫文章、翻譯、寫程式、聊天
  - 不只是英文,支援上百種語言
  - 甚至能寫詩、編笑話(雖然笑話通常不太好笑)

**3. Model(模型)** - 用深度學習訓練出來的
  - 不是人工寫規則
  - 是「餵它一堆資料,讓它自己學」
  - 就像教小孩說話:聽多了就會了

---

## LLM 怎麼學習?三個月讀完全世界的書

### 第一階段:瘋狂閱讀(Pre-training)

LLM 的訓練過程像這樣:

1. **餵資料** - 把整個網際網路的文字都丟給它([來源](https://www.cloudflare.com/learning/ai/what-is-large-language-model/))
   - Wikipedia 全部文章
   - GitHub 上所有程式碼
   - Reddit、論壇討論串
   - 書籍、新聞、部落格

2. **玩「填空遊戲」** - 訓練時會故意遮住某些字,讓模型猜
   ```
   問題:「太陽從____升起」
   模型猜:「東方」(正確!)
   問題:「Hello, my name is ____」
   模型猜:「John」、「Alice」、「ChatGPT」(都有可能)
   ```

3. **調整參數** - 猜錯了就調整內部的「神經連結」,猜對了就加強
   - 這個過程要重複幾兆次
   - 用幾千顆 GPU 跑幾個月
   - 燒掉幾百萬美金的電費

### 第二階段:學禮貌(Fine-tuning)

Pre-training 出來的模型很聰明,但不一定「好用」。所以還需要:

**人類回饋強化學習(RLHF - Reinforcement Learning from Human Feedback)**
- 真人標記哪些回答好、哪些回答爛
- 教它「不要說髒話」、「不要編造假新聞」
- 讓它變得像個有禮貌的助手

這就是為什麼 ChatGPT 不會罵你,但早期版本的 AI 可能會。

---

## Transformer:LLM 的大腦結構

LLM 的核心技術叫做 **Transformer**([來源](https://developers.google.com/machine-learning/crash-course/llm/transformers)),是 Google 在 2017 年發明的。

### Transformer 的革命性設計

**傳統方法(RNN)** - 像讀書一樣,一個字一個字慢慢看:
```
輸入:「我愛吃蘋果」
處理:我 → 愛 → 吃 → 蘋 → 果(超慢!)
```

**Transformer** - 像掃描整頁書,一次看完:
```
輸入:「我愛吃蘋果」
處理:同時看所有字,理解「我」和「蘋果」的關係
```

### 自注意力機制(Self-Attention)

這是 Transformer 的核心魔法([來源](https://bea.stollnitz.com/blog/gpt-transformer/)):

```
句子:「小明把球傳給小華,他很開心」

注意力機制會計算:
- 「他」跟「小明」的關係:30%
- 「他」跟「小華」的關係:60%
- 「他」跟「球」的關係:5%

所以模型知道「他」應該是指「小華」
```

這就是為什麼 LLM 能理解上下文,不會搞混「蘋果電腦」和「水果蘋果」。

---

## Token 和 Parameter:LLM 的兩個關鍵數字

### Token(代幣):LLM 的「視力單位」

LLM 不是「讀字」,而是「讀 Token」([來源](https://www.koyeb.com/blog/what-are-large-language-models)):

```
「Hello World」會被切成:
- Token 1: "Hello"
- Token 2: " World"(空格也算)

「台灣」可能被切成:
- Token 1: "台"
- Token 2: "灣"
```

**為什麼重要?**
- ChatGPT 有 Token 限制(例如 GPT-3.5 是 4096 tokens)
- 超過限制就會「失憶」,忘記對話開頭
- 這就是為什麼聊太久它會開始答非所問

### Parameter(參數):LLM 的「腦容量」

參數就像神經連結的數量([來源](https://www.projectpro.io/article/llm-parameters/1029)):

| 模型 | 參數數量 | 比喻 |
|------|---------|------|
| GPT-2 | 1.5 billion | 國中生 |
| GPT-3 | 175 billion | 大學教授 |
| GPT-4 | ~1.76 trillion | 圖書館館長 |

**更多參數 = 更聰明?**
- ✅ 通常是,但也更貴、更慢
- ❌ 不代表「更正確」,只是「更會唬爛」

---

## LLM 的三大能力

### 1. 文字生成(Text Generation)
```
提示:「寫一首關於程式設計師的詩」
輸出:
  鍵盤敲到深夜時
  Bug 依然不肯離
  咖啡續杯第三次
  明天再說 README
```

### 2. 問答(Question Answering)
```
問題:「為什麼天空是藍色的?」
答案:「因為大氣層散射陽光時,藍光波長較短容易散射...」
```

### 3. 翻譯與摘要
```
輸入:一篇 5000 字的技術文章
輸出:「這篇文章在講 MVC 架構,主要分成 Model、View、Controller 三層...」
```

---

## LLM 的兩大限制

### 限制 1:會「幻覺」(Hallucination)

LLM 有時候會**一本正經地胡說八道**:

```
你:「請問莎士比亞的代表作『哈姆雷特與小叮噹』在講什麼?」
LLM:「這部作品探討了王子哈姆雷特遇到機器貓小叮噹後...」
```

**為什麼?** 因為它不是「查資料庫」,而是「統計上最可能的接龍」。如果訓練資料裡剛好有類似的胡扯文章,它就會認真地瞎掰。

### 限制 2:沒有「真正的理解」

```
你:「1 + 1 = ?」
LLM:「2」

你:「如果有 1 顆蘋果,再拿 1 顆,總共幾顆?」
LLM:「2 顆」

你:「如果我有 1 億元,再借你 1 億元,我還有幾億元?」
LLM:「0 億元」(正確!)

你:「如果我有 1 個女朋友,再追 1 個女朋友,我會有幾個女朋友?」
LLM:「2 個」(錯!你會有 0 個,因為會被發現然後都分手)
```

LLM 不懂「社會常識」,只懂「統計規律」。

---

## 常見的 LLM 有哪些?

| 模型 | 開發者 | 特色 |
|------|--------|------|
| GPT-4 | OpenAI | 最聰明,但要付費 |
| Claude | Anthropic | 擅長長文本,有「憲法式 AI」 |
| Gemini | Google | 多模態,可以看圖 |
| Llama 3 | Meta | 開源,可以自己跑 |
| 通義千問 | 阿里巴巴 | 中文能力強 |

---

## 結語

下次當你跟 ChatGPT 聊天時,記住:

- 它不是真的「懂」你在說什麼
- 它只是個超級厲害的「接龍高手」
- 但這個「接龍」已經厲害到可以寫程式、寫文章、當你的顧問

LLM 從 2017 年的 Transformer 論文開始,短短幾年就改變了世界。雖然它還有很多限制,但已經夠強大到讓我們重新思考:**什麼是智慧?什麼是理解?**

也許有一天,LLM 會真的「理解」這個世界。但現在,它只是個讀了一整座圖書館的聰明鸚鵡—而這已經夠驚人了。

記住:**LLM 是工具,不是魔法。懂得它的原理,才能用得更好**。

---

## 參考資料

- [什麼是大型語言模型(LLM)? - AWS](https://aws.amazon.com/what-is/large-language-model/)
- [什麼是 LLM? - Cloudflare](https://www.cloudflare.com/learning/ai/what-is-large-language-model/)
- [LLM 簡介 - Google Developers](https://developers.google.com/machine-learning/crash-course/llm/transformers)
- [GPT Transformer 架構詳解 - Bea Stollnitz](https://bea.stollnitz.com/blog/gpt-transformer/)
- [理解 LLM 的 Token 和參數 - Koyeb](https://www.koyeb.com/blog/what-are-large-language-models)
- [LLM 參數深度解析 - ProjectPro](https://www.projectpro.io/article/llm-parameters/1029)
- [什麼是 GPT? - IBM](https://www.ibm.com/think/topics/gpt)
- [Transformer 架構教學 - Hugging Face](https://huggingface.co/learn/llm-course/chapter1/4)
