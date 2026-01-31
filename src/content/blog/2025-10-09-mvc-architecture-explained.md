---
layout: post
title: "MVC 架構:讓你的程式碼不再像義大利麵"
date: 2025-10-09
categories: [技術, 架構設計]
tags: [MVC, 設計模式, Web開發, 軟體架構]
description: "用幽默風趣的方式解釋 MVC 架構模式,以及為什麼它能解決程式碼混亂的問題"
author: "Galen"
---

# MVC 架構:讓你的程式碼不再像義大利麵

如果你曾經接觸過軟體開發,可能或多或少聽過「MVC 架構」這個詞。也許是在面試時被問到、也許是在技術文件中看到、也許是同事隨口提起。但 MVC 到底是什麼?為什麼這麼多框架都在用它?

更重要的是:**為什麼你的程式碼需要它?**

如果你曾經打開三個月前自己寫的程式碼,卻完全看不懂在幹嘛;如果你改個畫面結果把整個邏輯搞爛;如果你的 HTML、資料庫查詢、商業邏輯全部擠在同一個檔案裡—那這篇文章就是為你寫的。

---

## 什麼是 MVC?三個臭皮匠的故事

想像你在經營一家餐廳。你有個**廚師**(Model)負責做菜和管理食材、一個**服務生**(View)負責端菜和跟客人互動、還有個**經理**(Controller)負責接單和協調兩邊。如果廚師直接跑出來跟客人收錢,服務生跑進廚房炒菜,那場面肯定一團混亂對吧?

這就是 [MVC(Model-View-Controller)架構模式](https://en.wikipedia.org/wiki/Model–view–controller)的核心概念:**讓每個人做好自己的事,互不干擾**。

MVC 是 1979 年由 Trygve Reenskaug 在 Xerox PARC 研究中心開發 Smalltalk-79 時發明的([來源](https://dev.to/dmitry-kabanov/model-view-controller-mvc-origins-of-design-pattern-1677))。當時他面對複雜的使用者介面,就想:「能不能把這坨程式碼分成幾塊,讓人看得懂?」於是 MVC 就誕生了。

---

## 三劍客各司其職

### Model(資料管家)
負責處理**資料和商業邏輯**,就像餐廳廚師管理食材庫存和烹飪技術。

**Model 的責任:**
- 與資料庫互動(讀取、儲存、更新、刪除)
- 執行商業規則(例如:訂單金額必須大於 0)
- 資料驗證(例如:Email 格式是否正確)
- 不管 UI 長什麼樣

### View(門面擔當)
負責**呈現畫面**給使用者看,就像服務生端上精美的餐點。

**View 的責任:**
- 顯示資料(HTML、JSON、PDF 等)
- 處理畫面排版和樣式
- 只管顯示,不管資料從哪來
- 不處理任何商業邏輯

### Controller(交通警察)
接收**使用者請求**,決定要叫 Model 做什麼,再把結果交給 View 顯示。

**Controller 的責任:**
- 接收 HTTP 請求(GET、POST、PUT、DELETE)
- 決定要呼叫哪個 Model 方法
- 選擇用哪個 View 來顯示結果
- 處理路由和導向

這種[關注點分離(Separation of Concerns)](https://www.geeksforgeeks.org/system-design/mvc-design-pattern/)的設計,讓你可以改 UI 而不動資料庫邏輯,或是調整商業規則而不影響畫面—**工程師的夢想成真**!

---

## 為什麼需要 MVC?沒有它會怎樣?

### 沒有 MVC 的慘況

想像你寫了一個使用者註冊功能,把所有程式碼塞在一個檔案裡:

```php
<?php
// 一坨義大利麵程式碼
if ($_POST['register']) {
    $email = $_POST['email'];

    // 驗證邏輯混在一起
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo "<p style='color:red'>Email 格式錯誤!</p>";  // HTML 混在 PHP 裡
        exit;
    }

    // 資料庫邏輯混在一起
    $conn = mysqli_connect("localhost", "user", "pass", "db");
    $sql = "INSERT INTO users (email) VALUES ('$email')";  // SQL Injection 風險!
    mysqli_query($conn, $sql);

    // 又是 HTML 混在一起
    echo "<html><body><h1>註冊成功!</h1></body></html>";
}
?>
```

**問題爆炸:**
1. **UI 設計師改不了畫面** - HTML 和 PHP 混在一起
2. **安全性漏洞** - SQL Injection 隨便打
3. **無法重複使用** - 要在其他地方註冊使用者?複製貼上整段 code
4. **無法測試** - 怎麼測試這一坨?
5. **三個月後看不懂** - 自己寫的都看不懂了

### 有 MVC 的優雅解法

同樣的功能,用 MVC 分層:

```ruby
# Model (app/models/user.rb)
class User < ApplicationRecord
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
end

# Controller (app/controllers/users_controller.rb)
class UsersController < ApplicationController
  def create
    @user = User.new(user_params)
    if @user.save
      redirect_to success_path
    else
      render :new
    end
  end
end

# View (app/views/users/new.html.erb)
<%= form_with model: @user do |f| %>
  <%= f.email_field :email %>
  <%= f.submit "註冊" %>
<% end %>
```

**好處立刻顯現:**
- ✅ **設計師可以獨立修改 View**
- ✅ **驗證邏輯寫在 Model,可重複使用**
- ✅ **Controller 超級乾淨,只負責協調**
- ✅ **容易測試每個部分**
- ✅ **三年後回來看還是清楚**

---

## MVC 的實際運作流程

假設使用者想看「所有已發布的文章」:

```
1. 使用者訪問 /posts
   ↓
2. Controller 接收請求
   ↓
3. Controller 問 Model:"給我所有已發布的文章"
   ↓
4. Model 去資料庫查詢
   ↓
5. Model 回傳資料給 Controller
   ↓
6. Controller 把資料交給 View
   ↓
7. View 產生 HTML
   ↓
8. 使用者看到漂亮的文章列表
```

整個流程中:
- **Model 不需要知道畫面長怎樣**
- **View 不需要知道資料從哪來**
- **Controller 只負責當中間人**

---

## 常見的 MVC 框架

MVC 不是特定框架專屬的,它是一種**設計模式**,被廣泛應用在各種語言和框架中:

| 語言 | 框架 | 特色 |
|------|------|------|
| Ruby | Ruby on Rails | Convention over Configuration,開發速度快 |
| Python | Django | "Batteries included",內建超多功能 |
| PHP | Laravel | 優雅的語法,豐富的生態系 |
| C# | ASP.NET MVC | 微軟官方支援,與 .NET 整合 |
| Elixir | Phoenix | 高並發,即時通訊強項 |
| Java | Spring MVC | 企業級應用標配 |

我自己常用的是 **Ruby on Rails** 和 **Phoenix**,它們都遵循 MVC 架構,但各有特色:
- **Rails** 適合快速開發 MVP,社群資源豐富
- **Phoenix** 適合需要高並發的即時應用(聊天室、線上遊戲等)

---

## MVC 的變體:不只一種分層方式

MVC 的核心概念「分層管理」太好用了,後來衍生出很多變體:

### MVVM (Model-View-ViewModel)
用在 Vue.js、Angular 等前端框架。ViewModel 負責處理 View 的狀態和邏輯。

### MVP (Model-View-Presenter)
用在 Android 開發。Presenter 取代 Controller,更強調測試性。

### Flux/Redux
React 生態系的單向資料流。雖然架構不同,但核心精神一樣:**把邏輯分層管理**。

它們的共同點?**都在解決同一個問題:如何讓程式碼不會變成一團糾纏的義大利麵**。

---

## 何時該用 MVC?

### ✅ 適合的場景
- **多人協作**:前端設計師改 View,後端工程師改 Model,不會互相踩到
- **長期維護**:三年後回來改程式碼,還能快速找到該改哪裡
- **複雜業務邏輯**:當你的 if-else 開始超過三層,該考慮重構了
- **需要多種輸出格式**:同樣的資料要輸出成 HTML、JSON、PDF?換 View 就好

### ❌ 不適合的場景
- **超簡單的網頁**:如果只是一個靜態頁面,用 MVC 反而太重
- **極致效能需求**:分層會帶來一些額外開銷(但通常可以忽略)
- **原型快速測試**:先把功能做出來,之後再重構成 MVC 也可以

---

## MVC 的常見誤區

### 誤區 1:Model 只是資料庫的對應
❌ **錯誤理解:** Model = 資料庫的表格
✅ **正確理解:** Model = 商業邏輯 + 資料存取

例如「計算訂單總金額」的邏輯應該寫在 Model,不是 Controller。

### 誤區 2:Controller 可以寫商業邏輯
❌ **錯誤:** 在 Controller 寫一堆 if-else 判斷
✅ **正確:** Controller 保持輕薄,複雜邏輯移到 Model

Controller 應該像交通警察,只負責指揮,不負責開車。

### 誤區 3:View 完全不能有邏輯
❌ **極端:** View 連 for 迴圈都不能寫
✅ **合理:** View 可以有**顯示邏輯**(迴圈、條件顯示),但不能有**商業邏輯**

顯示邏輯:「如果是 VIP 會員,顯示金色徽章」- OK
商業邏輯:「計算 VIP 折扣價格」- 不 OK,應該在 Model

---

## 實戰技巧:讓 MVC 更好用

### 技巧 1:Fat Model, Skinny Controller
把邏輯寫在 Model,Controller 只做協調。

```ruby
# ❌ 不好:邏輯塞在 Controller
class OrdersController < ApplicationController
  def create
    @order = Order.new(order_params)
    @order.total = @order.items.sum(&:price) * 0.9  # 折扣計算
    @order.save
  end
end

# ✅ 好:邏輯放在 Model
class Order < ApplicationRecord
  before_save :calculate_total

  def calculate_total
    self.total = items.sum(&:price) * discount_rate
  end
end

class OrdersController < ApplicationController
  def create
    @order = Order.new(order_params)
    @order.save
  end
end
```

### 技巧 2:使用 Partial View 避免重複
如果多個頁面都要顯示「使用者卡片」,抽成 Partial:

```erb
<!-- _user_card.html.erb -->
<div class="user-card">
  <h3><%= user.name %></h3>
  <p><%= user.email %></p>
</div>

<!-- 在其他 View 中重複使用 -->
<%= render 'user_card', user: @user %>
```

### 技巧 3:用 Service Object 處理跨 Model 邏輯
如果邏輯涉及多個 Model,別硬塞在其中一個 Model,用 Service Object:

```ruby
# app/services/order_checkout_service.rb
class OrderCheckoutService
  def initialize(order, payment_method)
    @order = order
    @payment_method = payment_method
  end

  def call
    ActiveRecord::Transaction do
      @order.process!
      @payment_method.charge!(@order.total)
      NotificationMailer.order_confirmed(@order).deliver_later
    end
  end
end

# Controller 超級乾淨
class OrdersController < ApplicationController
  def checkout
    service = OrderCheckoutService.new(@order, params[:payment_method])
    service.call
  end
end
```

---

## 結語

下次當你的程式碼變成義大利麵時,想想 MVC 這三個好朋友:
- 讓 **Model** 管資料和商業邏輯
- 讓 **View** 管畫面顯示
- 讓 **Controller** 當交通警察

你的未來自己(還有接手的同事)會感謝你的!

MVC 從 1979 年誕生以來,已經 40 多年了。雖然出現了很多新的架構模式,但 MVC 的核心精神—**關注點分離**—依然是軟體設計的基石。

記住:**好的架構不是讓程式碼變複雜,而是讓複雜的問題變簡單**。

---

## 參考資料

- [MVC 起源與歷史 - Wikipedia](https://en.wikipedia.org/wiki/Model–view–controller)
- [MVC 設計模式起源 - DEV Community](https://dev.to/dmitry-kabanov/model-view-controller-mvc-origins-of-design-pattern-1677)
- [MVC 設計模式詳解 - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/mvc-design-pattern/)
- [MVC 架構完整解析 - FreeCodeCamp](https://www.freecodecamp.org/news/the-model-view-controller-pattern-mvc-architecture-and-frameworks-explained/)
- [關注點分離原則 - Wikipedia](https://en.wikipedia.org/wiki/Separation_of_concerns)
