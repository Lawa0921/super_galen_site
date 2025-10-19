---
layout: post
title: "WebSocket：網頁終於學會打電話了"
date: 2025-10-19
categories: [技術, Web開發]
tags: [WebSocket, 網路協定, 即時通訊, Web開發]
description: "用幽默風趣的方式解釋 WebSocket 是什麼，以及為什麼它讓網頁從「寄信」進化成「打電話」"
author: "Galen"
---

# WebSocket：網頁終於學會打電話了

如果你用過 Facebook、Discord、線上遊戲、或是股票看盤軟體，你可能會注意到一件事：**畫面會自己動**。朋友傳訊息瞬間出現、股價跳動不用刷新、遊戲角色即時移動—這些看似理所當然的功能，背後其實藏著一個關鍵技術。

在這些功能出現之前，網頁是這樣運作的：你按「重新整理」，網頁才會更新。想看新訊息？按重新整理。想看股價變化？按重新整理。就像你每隔 10 秒就要**打電話問朋友「有新訊息嗎？」「有新訊息嗎？」「有新訊息嗎？」**—煩不煩？

但現在，網頁終於學會了一個更聰明的方法：**打開電話線，讓對方有事就直接說**。

這就是 [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) 的魔法。

---

## 傳統方式 vs WebSocket：寄信 vs 打電話（再次登場）

### 傳統 HTTP：像寄明信片

想像你要追蹤快遞包裹的位置：

**你**：「包裹到哪了？」（發送 HTTP 請求）
→ 等待郵差送信...
**快遞公司**：「在台北」（收到回應）

過了 5 分鐘，你又想知道：

**你**：「包裹到哪了？」（又發送一次請求）
→ 等待郵差送信...
**快遞公司**：「還在台北」（收到回應）

再過 5 分鐘...

**你**：「包裹到哪了？」
**快遞公司**：「還在台北」

**這就是傳統的 HTTP 輪詢（Polling）**：
- 每次想要新資訊都要發送一個完整的請求
- 即使沒有新資訊，也要經歷完整的「問-答」流程
- 浪費頻寬、浪費電力、浪費時間

### WebSocket：像打電話

現在用 WebSocket 的方式：

**你**：「喂，我想追蹤包裹，有變化再跟我說」（建立連線）
**快遞公司**：「好，保持通話」

*（5 分鐘後，包裹移動了）*

**快遞公司**：「包裹到桃園了」（主動推送）
**你**：「收到！」

*（10 分鐘後）*

**快遞公司**：「包裹到新竹了」（主動推送）
**你**：「收到！」

**電話一直開著，有事就說**—不用一直問、不用等待、不用浪費。

---

## WebSocket 的超能力：持久連線

### 超能力 1：雙向通訊

HTTP 是請求-回應模型：
- **你問** → 伺服器答
- **你問** → 伺服器答
- **你問** → 伺服器答
- 伺服器不能主動說話，只能等你問

WebSocket 是雙向對話：
- **你說** ↔ **伺服器說**
- 雙方隨時都可以說話，不用等對方問

就像真正的對話，而不是一問一答的面試。

### 超能力 2：超低延遲

根據 [HTML5 WebSocket 的研究](https://www.websocket.org/quantum.html)，WebSocket 相較於 HTTP 輪詢：
- **減少 500-1000 倍的不必要標頭流量**
- **延遲減少 3 倍**

為什麼？因為 HTTP 每次請求都要帶著一大堆「禮貌用語」：

```
GET /api/messages HTTP/1.1
Host: example.com
User-Agent: Mozilla/5.0...
Accept: application/json
Accept-Language: zh-TW,zh;q=0.9
Cookie: session=abc123def456...
...（還有一堆）
```

**光是這些標頭通常就有 700-800 bytes，甚至可能達到 1-2 KB**（取決於 Cookie 大小），只是為了問「有新訊息嗎？」。

WebSocket 建立連線後，傳送訊息只要：
```
"新訊息來了！"
```

就這樣，**只需要 2-14 bytes 的框架標頭加上訊息本身**，比 HTTP 請求輕量太多了。

### 超能力 3：伺服器主動推送

HTTP 的痛點：**伺服器不能主動聯絡你**。

想像你在等披薩外送：

**傳統方式（HTTP 輪詢）**：
你每隔 5 分鐘打電話問：「到了嗎？」「到了嗎？」「到了嗎？」

**WebSocket 方式**：
你跟店家說：「到了再打給我」，然後該幹嘛幹嘛。

伺服器可以**在事情發生時立刻告訴你**，而不是等你問。

---

## WebSocket 實際上怎麼運作？

### 步驟 1：握手（Handshake）

WebSocket 的建立過程像是打電話前的確認：

**瀏覽器**：「喂，我想建立 WebSocket 連線」（HTTP 請求）
```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

**伺服器**：「好，升級成 WebSocket！」（HTTP 回應）
```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

從這一刻起，**HTTP 功成身退**，連線升級成 WebSocket。

### 步驟 2：持續通訊

連線建立後，雙方可以隨時傳送訊息：

```javascript
// 瀏覽器端
const socket = new WebSocket('wss://example.com/chat');

// 連線成功
socket.onopen = () => {
  console.log('電話接通了！');
  socket.send('哈囉，我是小明');
};

// 收到訊息
socket.onmessage = (event) => {
  console.log('收到訊息:', event.data);
};

// 連線關閉
socket.onclose = () => {
  console.log('電話掛斷了');
};
```

就這麼簡單！不用處理 HTTP 請求、不用解析標頭、不用輪詢。

### 步驟 3：關閉連線

當不需要時，任一方都可以掛斷電話：
```javascript
socket.close();
```

---

## 實際案例：誰在用 WebSocket？

### 1. WhatsApp Web

當你在電腦上用 [WhatsApp Web](https://web.whatsapp.com/) 時，它透過 WebSocket 跟你的手機保持連線。有新訊息時，手機立刻透過 WebSocket 推送到電腦—**不用重新整理、不用輪詢**。

### 2. Discord

[Discord](https://discord.com/) 每秒處理**數百萬條訊息**，全部透過 WebSocket 即時傳送。如果用傳統 HTTP 輪詢，伺服器早就爆炸了。

### 3. 線上股票看盤

股價每秒變化數十次。如果用 HTTP 每秒輪詢 10 次，**每個用戶每秒產生 10 個請求**。1 萬個用戶 = 每秒 10 萬個請求。

用 WebSocket？1 萬個用戶 = 1 萬個持久連線，股價變化時**只推送一次**。

**效率差距：100 倍以上**。

### 4. 多人線上遊戲

想像玩《Among Us》或任何即時對戰遊戲，其他玩家的移動要立刻顯示在你的畫面上。WebSocket 的低延遲特性讓這成為可能—**延遲只有幾毫秒**。

---

## WebSocket 適合做什麼？

### ✅ 絕配場景

1. **即時聊天**：訊息要秒傳，不能等
2. **協作工具**：Google Docs 那種多人同時編輯
3. **即時遊戲**：玩家動作要即時同步
4. **即時通知**：新訂單、新留言立刻提醒
5. **即時資料**：股價、匯率、體育比分

### ❌ 不適合的場景

- **一次性請求**：只是載入一個網頁，不需要即時更新
- **靜態資料**：部落格文章、新聞內容，用傳統 HTTP 就好
- **大檔案傳輸**：下載檔案還是 HTTP 比較穩定

**判斷原則**：如果需要**持續、雙向、即時**的通訊，用 WebSocket。否則，HTTP 更簡單。

---

## WebSocket vs 其他即時方案

| 方案 | 原理 | 優點 | 缺點 |
|------|------|------|------|
| **短輪詢** | 每隔幾秒發送 HTTP 請求 | 簡單 | 浪費頻寬、延遲高 |
| **長輪詢** | HTTP 請求保持等待直到有資料 | 比短輪詢好 | 伺服器負擔重 |
| **SSE** | 伺服器單向推送 | 簡單、適合通知 | 只能伺服器→客戶端 |
| **WebSocket** | 雙向持久連線 | 低延遲、雙向、高效 | 需要伺服器支援 |

---

## 動手試試：5 分鐘建立 WebSocket 連線

想體驗 WebSocket 有多簡單嗎？打開瀏覽器的開發者工具（F12），在 Console 輸入：

```javascript
// 連接到公開的 WebSocket 測試伺服器（由 Ably 贊助）
const socket = new WebSocket('wss://echo.websocket.org/');

socket.onopen = () => {
  console.log('✅ 連線成功！');
  socket.send('哈囉 WebSocket！');
};

socket.onmessage = (event) => {
  console.log('📨 收到回應:', event.data);
};

socket.onerror = (error) => {
  console.log('❌ 錯誤:', error);
};
```

按下 Enter，你會看到：
```
✅ 連線成功！
📨 收到回應: 哈囉 WebSocket！
```

恭喜！你剛剛建立了你的第一個 WebSocket 連線！

---

## 結語

下次當你在用即時聊天、看股價跳動、或玩線上遊戲時，記得：

- 背後是 **WebSocket** 在默默工作
- 它讓網頁從「一問一答」變成「持續對話」
- 它讓伺服器可以主動告訴你「有事發生了」

WebSocket 在 [2011 年成為正式標準（RFC 6455）](https://datatracker.ietf.org/doc/html/rfc6455)，至今已經 14 年了。它不是什麼新技術，但它**改變了網頁的運作方式**—讓即時互動從「昂貴的奢侈品」變成「隨手可得的基本功能」。

記住：**好的技術不是讓你寫更多程式碼，而是讓不可能的事變成可能**。

網頁終於學會打電話了，你準備好接聽了嗎？

---

## 參考資料

- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [RFC 6455 - WebSocket 協定規範](https://datatracker.ietf.org/doc/html/rfc6455)
- [WebSocket vs HTTP 效能比較](https://www.websocket.org/quantum.html)
- [WHATWG WebSocket 標準](https://websockets.spec.whatwg.org/)
- [WebSocket vs HTTP 深度比較](https://ably.com/topic/websockets-vs-http)
