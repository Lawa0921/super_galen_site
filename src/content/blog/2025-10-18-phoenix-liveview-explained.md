---
layout: post
title: "Phoenix LiveView：讓你的網頁像聊天室一樣即時"
date: 2025-10-18
categories: [技術, Web開發]
tags: [Phoenix, LiveView, Elixir, 即時應用, Web開發]
description: "用幽默風趣的方式解釋 Phoenix LiveView，以及為什麼它能讓你只用一種語言就打造即時互動網站"
author: "Galen"
---

# Phoenix LiveView：讓你的網頁像聊天室一樣即時

如果你用過現代網站，可能會注意到有些網站「感覺很快」—按個讚立刻顯示、留言即時出現、購物車數量瞬間更新，完全不用等頁面重新整理。也許是 Facebook 的動態牆、也許是線上協作工具、也許是即時聊天室。

但你知道嗎？**這些「即時更新」的背後，傳統上需要前端工程師和後端工程師寫兩套程式碼，用不同語言，還要小心翼翼地讓它們溝通**。

如果我告訴你，有個框架讓你**只用一種語言**就能做到這些，而且**不用寫複雜的 JavaScript**，你相信嗎？

這就是 [Phoenix LiveView](https://hexdocs.pm/phoenix_live_view/welcome.html) 的魔法。

---

## 傳統方式 vs LiveView：郵件 vs 電話

想像你要跟朋友討論晚餐吃什麼。

### 傳統方式（像寄信）

你傳訊息：「要吃什麼？」
等手機重新整理...
朋友回覆：「義大利麵？」
你又傳：「好啊，幾點？」
等手機重新整理...
朋友回覆：「7點」

**這就是傳統的前後端分離架構：**
- 前端用 React/Vue 寫 JavaScript
- 後端用 Rails/Django/Node.js 寫 API
- 每次互動都要「寄信」（HTTP 請求）然後等回覆
- 兩邊要維護兩套程式碼，還要確保格式對得上

### LiveView 方式（像打電話）

你打電話給朋友，**即時討論**：
「要吃什麼？」「義大利麵」「好，幾點？」「7點」
搞定！

**這就是 Phoenix LiveView 的運作方式：**
- 只用 **Elixir** 一種語言寫後端邏輯
- 透過 **WebSocket** 保持連線
- 畫面變化自動推送到瀏覽器
- 不用寫 API、不用寫一堆 JavaScript

---

## LiveView 的超能力：用一種語言統治全部

### 超能力 1：真正的即時互動

LiveView 透過 [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) 技術，讓伺服器和瀏覽器保持**持續連線**。這意味著：

- **按讚立刻更新**：不用重新整理頁面
- **多人同時編輯**：就像 Google Docs 那樣
- **即時聊天**：訊息秒傳

傳統方式要用 JavaScript 輪詢（polling）或手動建立 WebSocket 連線，**LiveView 自動幫你處理好**。

### 超能力 2：只用一種語言（Elixir）

看看傳統方式要寫多少東西：

```javascript
// 前端（React）- JavaScript
const [count, setCount] = useState(0);

const increment = async () => {
  const response = await fetch('/api/increment', { method: 'POST' });
  const data = await response.json();
  setCount(data.count);
};
```

```ruby
# 後端（Rails）- Ruby
class CountersController < ApplicationController
  def increment
    @counter = Counter.find(params[:id])
    @counter.increment!
    render json: { count: @counter.value }
  end
end
```

**兩種語言、兩個檔案、還要確保格式一致**。

現在看看 LiveView 的做法：

```elixir
# 只要一個檔案（Elixir）
defmodule MyAppWeb.CounterLive do
  use Phoenix.LiveView

  def mount(_params, _session, socket) do
    {:ok, assign(socket, count: 0)}
  end

  def handle_event("increment", _params, socket) do
    {:noreply, update(socket, :count, &(&1 + 1))}
  end

  def render(assigns) do
    ~H"""
    <div>
      <p>目前數字: <%= @count %></p>
      <button phx-click="increment">+1</button>
    </div>
    """
  end
end
```

**一種語言、一個檔案、自動即時更新**。點擊按鈕時，LiveView 自動：
1. 觸發 `increment` 事件
2. 更新 `count` 狀態
3. **只更新變化的部分**推送到瀏覽器

不用寫 API、不用處理 JSON、不用管狀態同步。

### 超能力 3：聰明的部分更新

LiveView 不會像傳統方式那樣每次都重新整理整個頁面。它只傳送**變化的部分**。

假設你有個待辦清單，新增一個項目：
- **傳統方式**：重新下載整個 HTML（200KB）
- **LiveView**：只傳送新的那一行（2KB）

這就是為什麼 LiveView 即使透過伺服器運作，**速度還是超快**。

### 超能力 4：高並發能力（感謝 Elixir）

LiveView 建構在 [Elixir](https://elixir-lang.org/) 語言之上，而 Elixir 運行在 Erlang 虛擬機（BEAM）上。BEAM 的特色是：

- **輕量級進程**：每個 LiveView 連線只用幾 KB 記憶體
- **超強並發**：單台伺服器可以處理**數百萬個連線**
- **容錯設計**：一個連線掛掉不會影響其他人

這就是為什麼 Discord、WhatsApp 這些需要處理大量即時連線的服務都用 Erlang/Elixir。

---

## LiveView 適合做什麼？

### 絕配場景

1. **即時聊天室**：訊息即時送達，不用輪詢
2. **協作工具**：多人同時編輯，像 Google Docs
3. **即時儀表板**：股價、監控數據即時更新
4. **互動表單**：輸入時立刻驗證，不用等提交
5. **遊戲**：簡單的多人線上遊戲

### 不適合的場景

- **極度複雜的 UI 動畫**：這種還是 React/Vue 比較適合
- **完全離線的應用**：LiveView 需要網路連線
- **純靜態內容網站**：如果網站內容完全不需要互動，靜態生成（如 Jekyll、Hugo）更適合

---

## 和其他框架比起來如何？

| 特性 | LiveView | React/Vue | 傳統 MVC |
|------|----------|-----------|----------|
| 語言數量 | 1 種（Elixir） | 2 種（JS + 後端） | 1 種（但不即時） |
| 即時更新 | 內建 | 需要額外設定 | 需要輪詢或手動 WebSocket |
| 學習曲線 | 中等（要學 Elixir） | 陡峭（前後端都要會） | 平緩 |
| 並發能力 | 極強 | 看後端 | 看後端 |
| 適合場景 | 即時互動應用 | 複雜 UI | 傳統網站 |

---

## 實戰案例：按讚功能

假設你要做個「按讚」功能，點擊後立刻更新數字。

**傳統方式需要：**
1. 前端點擊事件處理（JavaScript）
2. 發送 API 請求（Fetch/Axios）
3. 後端接收請求更新資料庫
4. 回傳 JSON
5. 前端更新畫面

**LiveView 只需要：**

```elixir
defmodule MyAppWeb.PostLive do
  use Phoenix.LiveView

  def handle_event("like", _params, socket) do
    # 更新資料庫
    post = Posts.add_like(socket.assigns.post)
    # 畫面自動更新
    {:noreply, assign(socket, post: post)}
  end

  def render(assigns) do
    ~H"""
    <button phx-click="like">
      ❤️ <%= @post.likes %> 人按讚
    </button>
    """
  end
end
```

點擊按鈕 → LiveView 自動呼叫 `like` 事件 → 更新資料 → 畫面即時更新。

**沒有 API、沒有 JSON、沒有狀態管理地獄**。

---

## 結語

下次當你需要做即時互動功能時，想想看：

- 你真的需要前後端分離嗎？
- 你真的想維護兩套程式碼嗎？
- 你真的想花時間對 API 格式嗎？

如果答案是「不想」，那 [Phoenix LiveView](https://hexdocs.pm/phoenix_live_view/welcome.html) 可能就是你要的解答。

LiveView 從 2019 年發布以來，已經被用在無數生產環境中，證明了**「不一定要前後端分離才能做出好的即時應用」**。

記住：**好的工具不是讓你寫更多程式碼，而是讓你用更少的程式碼做更多的事**。

---

## 參考資料

- [Phoenix LiveView 官方文件](https://hexdocs.pm/phoenix_live_view/welcome.html)
- [Phoenix LiveView GitHub](https://github.com/phoenixframework/phoenix_live_view)
- [Phoenix Framework 官網](https://www.phoenixframework.org/)
- [Programming Phoenix LiveView（書籍）](https://pragprog.com/titles/liveview/programming-phoenix-liveview/)
- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Elixir 官網](https://elixir-lang.org/)
