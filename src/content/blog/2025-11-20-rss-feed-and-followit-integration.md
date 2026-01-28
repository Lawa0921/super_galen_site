---
layout: post
title: "RSS Feed：讓讀者不用追蹤你，也能準時收到文章的魔法"
date: 2025-11-20
categories: [技術, Web開發]
tags: [RSS, Jekyll, follow.it, 部落格, 訂閱系統]
description: "用幽默風趣的方式解釋 RSS feed，以及如何用 follow.it 讓讀者透過 Email 自動收到你的新文章"
author: "Galen"
---

# RSS Feed：讓讀者不用追蹤你，也能準時收到文章的魔法

你花了一個週末寫了一篇超棒的技術文章，修圖、寫程式碼範例、查資料、校稿，終於發布了。然後...

**沒人看到**。

你把連結貼到 Facebook、Twitter、LinkedIn、Threads，貼到各大論壇，拜託朋友分享。結果三天後只有 47 個瀏覽，其中 23 個是你自己重新整理頁面檢查排版。

**問題出在哪？**

- ❌ Facebook 演算法覺得你的文章「互動率不夠高」，不推給你的追蹤者
- ❌ Twitter 的時間軸太快，你的貼文 2 小時後就沉到第 500 則了
- ❌ LinkedIn 上大家只想看「5 個成為百萬富翁的秘訣」，不想看你的 TypeScript 教學
- ❌ 你沒有 1 萬個粉絲，演算法根本不鳥你

**但讀者其實想看你的文章**。他們只是：
1. 不知道你發了新文章（淹沒在社群媒體的雜訊中）
2. 懶得每天去你的部落格查看「有沒有更新」
3. 不想加你好友或追蹤（太尷尬了）

**解決方案？RSS Feed + Email 訂閱**。

想像一下：你發布新文章，系統自動通知所有訂閱者「嘿，Galen 發新文章了！」。不用演算法決定、不用求人分享、不用靠運氣。**讀者主動訂閱，你主動送達**。

這就是 [RSS (Really Simple Syndication)](https://en.wikipedia.org/wiki/RSS) 的魔法。

---

## 什麼是 RSS？報紙訂閱 vs 每天去報攤

### 傳統方式：每天去報攤查看

沒有 RSS 的時代，讀者想追蹤你的部落格，流程是這樣：

1. **週一**：打開瀏覽器，輸入你的網址，看一下「有沒有新文章」→ 沒有
2. **週二**：再打開一次，看一下 → 還是沒有
3. **週三**：再打開一次 → 終於有了！但你已經沒耐心了，關掉視窗
4. **週四**：忘記你的存在

這就像**每天走去報攤問老闆「今天有新的科技雜誌嗎？」**，老闆說「沒有」，你明天再來。**累死**。

### RSS 方式：訂閱報紙送到家

有了 RSS，流程變成：

1. **讀者訂閱你的 RSS feed**（一次性動作）
2. **你發布新文章** → RSS feed 自動更新
3. **讀者的 RSS 閱讀器**（或 Email）自動收到通知：「Galen 發新文章了！」
4. **讀者點開就看**，不用主動去查

這就像**訂閱報紙，郵差每天送到你家門口**。你不用出門，也不會錯過任何一期。

---

## RSS 的核心概念：一個 XML 檔案搞定一切

RSS 的本質超級簡單：**一個 XML 格式的檔案，列出你部落格的所有文章**。

範例 RSS feed（`/feed.xml`）：

```xml
<rss version="2.0">
  <channel>
    <title>Galen 的技術部落格</title>
    <item>
      <title>單機遊戲存檔：JSON vs SQLite 技術選型</title>
      <link>https://supergalen.com/2025/11/19/...</link>
      <pubDate>Tue, 19 Nov 2025 00:00:00 +0800</pubDate>
    </item>
    <!-- 更多文章... -->
  </channel>
</rss>
```

就這樣！**讀者的 RSS 閱讀器會定期檢查這個檔案，看有沒有新的 `<item>`**。

---

## RSS vs 社群媒體：誰才是真正的訂閱？

| 特性 | 社群媒體追蹤 | RSS 訂閱 |
|------|------------|---------|
| **演算法控制** | ✅ 有（平台決定要不要給你看） | ❌ 無（100% 送達） |
| **廣告干擾** | ✅ 有（一堆贊助貼文） | ❌ 無 |
| **隱私追蹤** | ✅ 有（平台知道你看了什麼） | ❌ 無 |
| **跨平台** | ❌ 綁死單一平台 | ✅ 任何閱讀器都能用 |
| **永久性** | ❌ 平台倒了就沒了 | ✅ 只要檔案在就有 |
| **控制權** | ❌ 平台說了算 | ✅ 你說了算 |

**結論**：社群媒體是「租房子」（平台說拆就拆），RSS 是「自己的土地」（永遠屬於你）。

---

## Jekyll 的 RSS Feed：開箱即用

好消息：如果你用 [Jekyll](https://jekyllrb.com/) 建部落格（就像 GitHub Pages），**RSS feed 幾乎不用設定就有了**。

### 檢查是否已安裝 jekyll-feed

打開你的 `Gemfile`：

```ruby
group :jekyll_plugins do
  gem "jekyll-feed"  # 如果有這行，你已經有 RSS 了！
end
```

打開 `_config.yml`：

```yaml
plugins:
  - jekyll-feed  # 如果有這行，plugin 已啟用
```

### 訪問你的 RSS feed

啟動 Jekyll：

```bash
bundle exec jekyll serve
```

訪問 `http://localhost:4000/feed.xml`，你應該會看到一個 XML 檔案，列出你所有的文章。

**恭喜！你已經有 RSS feed 了**。

### 自訂 RSS feed 設定

在 `_config.yml` 加入這些設定：

```yaml
# 網站基本資訊
title: "Galen 的技術部落格"
description: "分享 Web 開發、遊戲開發、區塊鏈技術"
url: "https://supergalen.com"
author:
  name: "Galen"
  email: "your-email@example.com"

# RSS feed 設定
feed:
  posts_limit: 20  # 包含最新 20 篇文章（預設 10 篇）
  excerpt_only: false  # 包含完整文章內容（預設只有摘要）
```

重新啟動 Jekyll，你的 RSS feed 就更新了！

---

## 問題來了：讀者不知道怎麼用 RSS

你：「太好了！我有 RSS feed 了！」

讀者：「R... S... S 是什麼？能吃嗎？」

**現實情況**：大部分人（尤其非技術背景）**根本不知道 RSS 是什麼**，更不知道怎麼用 RSS 閱讀器。

你需要的是：**把 RSS feed 轉成 Email 訂閱**。

為什麼？因為：
- ✅ 每個人都有 Email
- ✅ 每個人都知道怎麼用 Email
- ✅ Email 不需要安裝 App
- ✅ Email 可以在手機、電腦、平板上看

---

## 救星登場：follow.it

[follow.it](https://follow.it/) 是一個免費服務，做一件超簡單的事：

**「監控你的 RSS feed，有新文章就自動發 Email 給訂閱者」**

### follow.it 的超能力

1. **RSS to Email**：自動把 RSS 文章轉成漂亮的 Email
2. **無限訂閱者**：免費方案無訂閱人數限制
3. **自動化**：每小時檢查你的 RSS，有新文章就發
4. **自訂樣式**：可以調整 Email 的外觀
5. **統計數據**：看多少人打開 Email、點擊連結

### 替代方案比較

| 服務 | 免費方案限制 | 自動化 | 特點 |
|------|------------|--------|------|
| **follow.it** | 無限訂閱者 | ✅ 完全自動 | 設定簡單、現代化介面、統計數據完整 |
| **Mailchimp** | 500 訂閱者 | ❌ 手動發送 | 功能強大、行銷工具豐富，但設定複雜 |
| **EmailOctopus** | 2500 訂閱者 | ❌ 手動發送 | 價格便宜、API 靈活，但需要技術能力 |
| **Blogtrottr** | 無限訂閱者 | ✅ 自動但陽春 | 功能陽春、缺乏自訂選項、無統計數據 |

**結論**：如果你只想要「發新文章 → 自動寄 Email」且需要基本的訂閱者管理，**follow.it 是最佳選擇**。

---

## 實戰操作：30 分鐘整合 follow.it

### 步驟 1：註冊 follow.it

1. 訪問 https://follow.it/
2. 點擊「Get Started」註冊帳號
3. 填寫你的部落格資訊：
   - **Site URL**: `https://supergalen.com`
   - **RSS Feed URL**: `https://supergalen.com/feed.xml`
4. 點擊「Create」

### 步驟 2：驗證網站所有權

follow.it 會給你一個驗證碼，要求你加到網站的 `<head>` 區域：

```html
<meta name='follow.it-verification' content='你的驗證碼' />
```

**在 Jekyll 中操作**：

打開 `_layouts/default.html`（或你的主版面檔案），在 `<head>` 區加入：

```html
<head>
  <!-- 其他 meta 標籤 -->
  <meta name='follow.it-verification' content='你的驗證碼' />
</head>
```

重新部署網站，回到 follow.it 點擊「Verify」。

### 步驟 3：自訂訂閱表單樣式

follow.it 會自動生成一個訂閱表單的 HTML 代碼。

**預設表單**（陽春但有用）：

```html
<form action="https://api.follow.it/subscription-form/你的ID/submit" method="post">
  <input type="email" name="email" placeholder="Enter your email" required />
  <button type="submit">Subscribe</button>
</form>
```

**自訂樣式表單**（融入你的網站設計）：

如果你想客製化表單外觀，核心就是保留 follow.it 的 API 端點，自己做 UI：

```html
<form action="https://api.follow.it/subscription-form/你的ID/submit" method="post">
  <input type="email" name="email" required />
  <button type="submit">訂閱</button>
</form>
```

剩下就是自由發揮 CSS/JS 了。你可以做成浮動按鈕、彈出視窗、側邊欄，隨便你。完整範例可參考 [GitHub](https://github.com/Lawa0921/my-portfolio-blog/tree/master/assets)。

### 步驟 4：加入到你的部落格

**建議放置位置**：
- 首頁：浮動按鈕（右下角）
- 文章底部：inline 訂閱區塊（讀完文章自然想訂閱）
- 側邊欄：固定位置（如果有 sidebar）

在 Jekyll 中使用 `{% raw %}{% include newsletter-subscribe.html %}{% endraw %}` 引入表單即可。

---

## 測試驗證：確保一切正常

### 測試 1：RSS feed 是否正常

訪問 `https://你的網址/feed.xml`，檢查：

- ✅ 能正常打開（不是 404）
- ✅ 包含你的最新文章
- ✅ `<link>` 標籤指向正確的文章 URL
- ✅ `<pubDate>` 格式正確

### 測試 2：Email 訂閱是否有效

1. 用自己的 Email 測試訂閱
2. 發布一篇新文章（或更新舊文章的 `date`）
3. 等待 follow.it 自動檢查（每小時一次）
4. 檢查信箱是否收到通知

**注意**：follow.it Dashboard 的功能和介面會更新，具體操作請參考[官方文件](https://follow.it/docs)。

---

## 常見問題

### Q：follow.it 多久檢查一次 RSS？

**A：每小時一次**。如果你想要即時通知，可以升級到付費方案（但通常不需要）。

### Q：訂閱者會看到我的完整文章嗎？

**A：取決於你的 RSS 設定**。如果 `_config.yml` 設定 `excerpt_only: true`，Email 只包含摘要+連結。如果 `excerpt_only: false`，包含完整文章。

**建議**：只發摘要，引導讀者回到你的網站（增加流量、互動）。

### Q：follow.it 會插入廣告嗎？

**A：免費方案會在 Email 底部加上「Powered by follow.it」連結**，但**不會插入第三方廣告**。付費方案可以移除。

### Q：讀者可以退訂嗎？

**A：可以**。每封 Email 底部都有「Unsubscribe」連結，符合 GDPR 和 CAN-SPAM 法規。

### Q：我可以看到訂閱統計嗎？

**A：可以**。follow.it Dashboard 提供：
- 訂閱人數
- Email 開信率
- 點擊率
- 退訂率

---

## 結語：RSS 不死，只是被遺忘了

RSS 從 1999 年誕生至今，已經 25 年了。雖然 Google Reader 在 2013 年關閉讓很多人以為「RSS 死了」，但**RSS 從未死去，只是被社群媒體的演算法淹沒了**。

根據 [The Verge 的報導](https://www.theverge.com/23718494/rss-feed-reader-how-to-sync-browsers)，近年來 RSS 使用率正在回升，原因是：

1. **演算法疲勞**：人們厭倦了被演算法控制
2. **隱私意識**：不想被追蹤、不想看廣告
3. **資訊自主權**：想要自己決定看什麼、何時看

**RSS + Email 訂閱的組合拳**，讓你：
- ✅ 擁有讀者名單（不被平台綁架）
- ✅ 100% 送達率（不被演算法過濾）
- ✅ 直接溝通管道（不需要付費推廣）

下次當你發布新文章時，不用再祈禱演算法賞臉。**你的讀者會準時收到通知，因為他們主動選擇訂閱你**。

這才是真正的「訂閱」，不是嗎？

---

## 延伸閱讀

- [RSS 完整介紹 - Wikipedia](https://en.wikipedia.org/wiki/RSS)
- [Jekyll Feed 插件文件](https://github.com/jekyll/jekyll-feed)
- [follow.it 官方網站](https://follow.it/)
- [RSS 的復興：為什麼人們又開始用 RSS - The Verge](https://www.theverge.com/23718494/rss-feed-reader-how-to-sync-browsers)
- [如何選擇 RSS 閱讀器 - Lifehacker](https://lifehacker.com/the-best-rss-readers-5556571)
- [Email 訂閱最佳實踐 - Mailchimp](https://mailchimp.com/resources/email-marketing-best-practices/)

---

**實戰挑戰**：現在就去你的部落格加上 RSS feed 和 follow.it 訂閱按鈕。30 分鐘後，用自己的 Email 測試訂閱，發一篇新文章，看看會不會收到通知。如果成功了，恭喜你擁有了自己的讀者群！
