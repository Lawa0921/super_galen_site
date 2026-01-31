---
layout: post
title: "BDD：讓測試會說人話的魔法"
date: 2025-11-16
categories: [技術, 軟體開發]
tags: [BDD, 測試, 敏捷開發, TDD, Cucumber]
description: "用幽默風趣的方式解釋 BDD（行為驅動開發），以及為什麼它能讓你的測試從「火星文」變成「人話」"
author: "Galen"
---

# BDD：讓測試會說人話的魔法

如果你寫過測試，可能遇過這些崩潰時刻：

- **PM 看著你的測試程式碼**：「這個 `test_user_authentication_with_valid_credentials()` 是在測什麼？」你：「呃...就是...登入啊...」PM：「所以有測試忘記密碼的情況嗎？」你：「（翻遍 500 行測試程式碼）...應該有吧？」

- **測試全過了，但功能炸了**：你的測試寫得密密麻麻，100% 覆蓋率，綠燈滿天飛。結果上線第一天，客戶抱怨：「為什麼我輸入錯誤密碼三次會被永久封鎖？」你：「蛤？測試沒有涵蓋這個？」

- **接手別人的專案**：你打開測試檔案，看到一堆 `testCase1()`、`testCase2()`、`testCase99()`，完全不知道在測什麼。註解？不存在的。文件？早就過期了。

這些問題的根源是什麼？**測試程式碼只有程式設計師看得懂，其他人看到都是火星文**。

但如果測試長這樣呢？

```gherkin
場景：使用者輸入錯誤密碼三次
  假如 使用者已經註冊帳號
  當 使用者輸入錯誤密碼
  而且 使用者再次輸入錯誤密碼
  而且 使用者第三次輸入錯誤密碼
  那麼 系統應該鎖定帳號 15 分鐘
  而且 系統應該發送「帳號暫時鎖定」的通知信
```

**PM 看得懂、測試人員看得懂、產品經理看得懂、甚至你老闆都看得懂**。

這就是 [BDD（Behavior-Driven Development，行為驅動開發）](https://cucumber.io/docs/bdd/)的魔法。

**重要**：BDD 不只是測試工具，更是一種**協作驅動的開發方法論**。它的核心是透過跨角色協作（開發、測試、PM）建立對需求的共同理解，然後用可執行的規格來驗證系統行為。

---

## 什麼是 BDD？協作驅動的開發方法論

根據 [Cucumber 官方文件](https://cucumber.io/docs/bdd/)，BDD 的核心是：

> "透過鼓勵跨角色協作，建立對問題的共同理解，進行快速小規模迭代，產生自動檢驗的系統文件"

BDD 有三個階段：
1. **Discovery（探索）** - 團隊討論具體例子以理解需求
2. **Formulation（表述）** - 將例子文件化為可執行的規格
3. **Automation（自動化）** - 實現測試驅動開發

簡單來說：**BDD 把測試變成所有人都能看懂的故事書**。

### TDD vs BDD：寫食譜 vs 說故事

如果你聽過 [TDD（Test-Driven Development，測試驅動開發）](https://martinfowler.com/bliki/TestDrivenDevelopment.html)，可能知道它的流程是：

1. **寫測試**（紅燈）
2. **寫程式碼讓測試通過**（綠燈）
3. **重構**（保持綠燈）

TDD 的測試長這樣：

```javascript
describe('User authentication', () => {
  it('should return token when credentials are valid', () => {
    const user = new User('john@example.com', 'password123');
    const result = authenticate(user);
    expect(result.token).toBeDefined();
    expect(result.success).toBe(true);
  });
});
```

**這是「寫食譜」**：告訴廚師（程式設計師）每個步驟怎麼做，但不會告訴客人（PM、客戶）為什麼要這樣做。

BDD 的測試長這樣：

```gherkin
功能：使用者登入
  作為一個 註冊使用者
  我想要 用帳號密碼登入
  以便 存取我的個人資料

  場景：使用正確的帳號密碼登入
    假如 我已經用 "john@example.com" 和密碼 "password123" 註冊
    當 我用 "john@example.com" 和 "password123" 登入
    那麼 我應該看到歡迎訊息 "歡迎回來，John"
    而且 我應該能存取個人資料頁面
```

**這是「說故事」**：從使用者的角度描述行為，所有人都能理解**為什麼**要做這件事、**預期**會發生什麼。

---

## BDD 的三大支柱：Given-When-Then

BDD 使用一種叫做 [Gherkin](https://cucumber.io/docs/gherkin/reference/) 的語言，結構超級簡單：

### Given（假如）：設定場景

描述**初始狀態**，像是餐廳的背景設定：

```gherkin
假如 我是一個已登入的使用者
假如 我的購物車有 3 件商品
假如 我的帳戶餘額是 1000 元
```

這就像點餐前先說：「我要一個靠窗的位子、要兒童椅、對花生過敏」。

### When（當）：觸發行為

描述**使用者做了什麼**：

```gherkin
當 我點擊「結帳」按鈕
當 我輸入優惠碼 "SAVE20"
當 我選擇「信用卡」付款方式
```

這就是你跟服務生說：「我要點一份義大利麵，不要洋蔥，辣度小辣」。

### Then（那麼）：驗證結果

描述**預期會發生什麼**：

```gherkin
那麼 我應該看到訂單確認頁面
而且 我的帳戶餘額應該扣除 800 元
而且 我應該收到訂單確認信
```

這就是你期待：「義大利麵應該沒有洋蔥、溫度要燙口、15 分鐘內上桌」。

---

## 真實案例：網路商店結帳流程

讓我們用一個完整的例子，看看 BDD 如何運作。

### 第一步：寫 Feature 檔案（.feature）

這是用 Gherkin 語言寫的規格，**所有人都能看懂**：

```gherkin
# features/checkout.feature
功能：購物車結帳
  作為一個 線上購物者
  我想要 結帳並付款
  以便 完成我的訂單

  場景：成功使用優惠碼結帳
    假如 我的購物車有以下商品：
      | 商品名稱    | 數量 | 單價 |
      | 機械鍵盤    | 1    | 3000 |
      | 滑鼠墊      | 2    | 500  |
    當 我輸入優惠碼 "WELCOME20"
    而且 我選擇「信用卡」付款
    而且 我點擊「確認結帳」按鈕
    那麼 我應該看到訂單總金額是 3200 元
    # (3000 + 500*2) * 0.8 = 3200
    而且 我應該看到折扣金額 800 元
    而且 我應該收到訂單確認信到 "user@example.com"

  場景：使用無效的優惠碼
    假如 我的購物車有商品總價 5000 元
    當 我輸入優惠碼 "EXPIRED123"
    那麼 我應該看到錯誤訊息 "優惠碼已過期或無效"
    而且 訂單總金額應該保持 5000 元
```

### 第二步：執行測試（會失敗，因為還沒寫程式碼）

使用 [Cucumber](https://github.com/cucumber/cucumber-js) 工具執行：

```bash
$ npm run test:bdd

場景：成功使用優惠碼結帳
  假如 我的購物車有以下商品：  # ⚠️  未定義
  當 我輸入優惠碼 "WELCOME20"  # ⚠️  未定義
  ...

你需要實作這些步驟：
```

### 第三步：實作步驟定義（Step Definitions）

這是**唯一需要寫程式碼的地方**：

```javascript
// features/step_definitions/checkout_steps.js
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('chai');

// 這是「假如」的實作
Given('我的購物車有以下商品：', function (dataTable) {
  this.cart = [];
  const items = dataTable.hashes(); // 把表格轉成物件陣列
  items.forEach(item => {
    this.cart.push({
      name: item['商品名稱'],
      quantity: parseInt(item['數量']),
      price: parseInt(item['單價'])
    });
  });
});

// 這是「當」的實作
When('我輸入優惠碼 {string}', async function (couponCode) {
  this.discount = await applyCoupon(couponCode, this.cart);
});

When('我點擊「確認結帳」按鈕', async function () {
  this.order = await checkout(this.cart, this.discount);
});

// 這是「那麼」的實作
Then('我應該看到訂單總金額是 {int} 元', function (expectedTotal) {
  expect(this.order.total).to.equal(expectedTotal);
});

Then('我應該收到訂單確認信到 {string}', async function (email) {
  const sentEmails = await getEmailLog();
  const confirmationEmail = sentEmails.find(e =>
    e.to === email && e.subject.includes('訂單確認')
  );
  expect(confirmationEmail).to.exist;
});
```

### 第四步：執行測試，看結果

```bash
$ npm run test:bdd

功能：購物車結帳

  場景：成功使用優惠碼結帳
    ✓ 假如 我的購物車有以下商品：
    ✓ 當 我輸入優惠碼 "WELCOME20"
    ✓ 而且 我選擇「信用卡」付款
    ✓ 而且 我點擊「確認結帳」按鈕
    ✓ 那麼 我應該看到訂單總金額是 3200 元
    ✓ 而且 我應該看到折扣金額 800 元
    ✓ 而且 我應該收到訂單確認信到 "user@example.com"

  場景：使用無效的優惠碼
    ✓ 假如 我的購物車有商品總價 5000 元
    ✓ 當 我輸入優惠碼 "EXPIRED123"
    ✓ 那麼 我應該看到錯誤訊息 "優惠碼已過期或無效"
    ✓ 而且 訂單總金額應該保持 5000 元

2 scenarios (2 passed)
11 steps (11 passed)
```

**PM 一看就知道測試涵蓋了哪些情境、有沒有漏測**。

---

## BDD 的超能力：溝通、文件、測試三合一

### 超能力 1：活的文件（Living Documentation）

傳統文件的問題：
```
❌ 寫了就過期
❌ 程式碼改了，文件忘了更新
❌ 文件說一套，程式碼做一套
```

BDD 的 Feature 檔案：
```
✅ 測試會執行這些規格，確保「文件 = 實作」
✅ 程式碼改了，測試會失敗，逼你更新規格
✅ 自動生成 HTML 文件，永遠最新
```

你可以用 [Cucumber HTML Reporter](https://www.npmjs.com/package/cucumber-html-reporter) 自動生成漂亮的文件：

```bash
$ npm run test:bdd -- --format json:cucumber-report.json
$ node generate-report.js
```

結果會產生一個 HTML 網頁，PM 可以直接點開看所有測試場景和結果。

### 超能力 2：三方會談（Three Amigos）

BDD 最強大的地方不是工具，而是**工作流程**。在寫程式碼前，先開一個會議，三種角色一起討論：

1. **產品經理/PM**：「使用者應該看到什麼？」
2. **開發人員**：「技術上怎麼實作？會有什麼限制？」
3. **測試人員**：「有哪些邊界情況要測試？」

大家用 Gherkin 語言**一起寫規格**，討論過程中就會發現問題：

```gherkin
# 第一版（PM 寫的）
場景：使用者登入
  當 使用者登入
  那麼 使用者應該看到首頁

# 開發人員：「用什麼登入？帳號密碼還是 Google？」
# 測試人員：「密碼錯誤怎麼辦？」

# 第二版（三方討論後）
場景：使用帳號密碼登入成功
  假如 使用者已經用 "test@example.com" 註冊
  而且 密碼是 "SecurePass123"
  當 使用者在登入頁面輸入 "test@example.com" 和 "SecurePass123"
  而且 點擊「登入」按鈕
  那麼 使用者應該被導向到個人儀表板頁面
  而且 使用者應該看到歡迎訊息 "歡迎回來，Test User"

場景：輸入錯誤密碼
  假如 使用者已經用 "test@example.com" 註冊
  而且 密碼是 "SecurePass123"
  當 使用者輸入 "test@example.com" 和 "WrongPassword"
  那麼 使用者應該看到錯誤訊息 "帳號或密碼錯誤"
  而且 使用者應該停留在登入頁面
```

**在寫程式碼前就發現問題，省下無數次的「這不是我要的」**。

### 超能力 3：回歸測試的安全網

假設你要重構程式碼，傳統測試可能要改一堆：

```javascript
// 舊測試（綁死實作細節）
it('should call UserRepository.findByEmail', () => {
  const spy = jest.spyOn(UserRepository, 'findByEmail');
  authenticate('test@example.com', 'password');
  expect(spy).toHaveBeenCalled(); // 💥 重構後這個測試會壞
});
```

BDD 測試只關心**行為**，不管實作：

```gherkin
場景：使用正確的帳號密碼登入
  假如 使用者已經註冊 "test@example.com"
  當 使用者用 "test@example.com" 和正確密碼登入
  那麼 使用者應該登入成功
```

只要**行為不變**，你怎麼重構內部實作都不會影響測試。

---

## 實戰工具：JavaScript/TypeScript 生態系

### 工具 1：Cucumber.js

最經典的 BDD 工具，支援多種語言（JavaScript、Java、Ruby、Python）。

安裝：
```bash
npm install --save-dev @cucumber/cucumber chai
```

設定 `cucumber.js`：
```javascript
module.exports = {
  default: {
    require: ['features/step_definitions/**/*.js'],
    format: ['progress', 'html:cucumber-report.html'],
    publishQuiet: true
  }
};
```

執行：
```bash
npx cucumber-js
```

### 工具 2：Jest + jest-cucumber

如果你已經在用 [Jest](https://jestjs.io/)，可以用 [jest-cucumber](https://www.npmjs.com/package/jest-cucumber) 讓 Jest 支援 Gherkin：

```bash
npm install --save-dev jest-cucumber
```

```javascript
// checkout.spec.js
import { defineFeature, loadFeature } from 'jest-cucumber';

const feature = loadFeature('./features/checkout.feature');

defineFeature(feature, test => {
  test('成功使用優惠碼結帳', ({ given, when, then, and }) => {
    let cart;
    let order;

    given('我的購物車有以下商品：', (table) => {
      cart = table.map(row => ({
        name: row.商品名稱,
        quantity: parseInt(row.數量),
        price: parseInt(row.單價)
      }));
    });

    when('我輸入優惠碼 "WELCOME20"', async () => {
      order = await checkout(cart, 'WELCOME20');
    });

    then('我應該看到訂單總金額是 3200 元', () => {
      expect(order.total).toBe(3200);
    });
  });
});
```

### 工具 3：Playwright + Cucumber（E2E 測試）

如果你要測試整個使用者流程（包括 UI），可以結合 [Playwright](https://playwright.dev/)：

```gherkin
場景：使用者從瀏覽商品到完成結帳
  假如 我在商品列表頁面
  當 我點擊「機械鍵盤」商品
  而且 我點擊「加入購物車」按鈕
  而且 我點擊購物車圖示
  而且 我點擊「前往結帳」按鈕
  而且 我填寫配送地址 "台北市信義區信義路五段7號"
  而且 我選擇「信用卡」付款
  而且 我點擊「確認訂購」按鈕
  那麼 我應該看到「訂單成立」的訊息
  而且 我應該在 1 分鐘內收到訂單確認信
```

步驟定義：
```javascript
const { Given, When, Then } = require('@cucumber/cucumber');
const { chromium } = require('playwright');

Given('我在商品列表頁面', async function () {
  this.browser = await chromium.launch();
  this.page = await this.browser.newPage();
  await this.page.goto('https://example.com/products');
});

When('我點擊「機械鍵盤」商品', async function () {
  await this.page.click('text=機械鍵盤');
});

Then('我應該看到「訂單成立」的訊息', async function () {
  await this.page.waitForSelector('text=訂單成立');
});
```

---

## BDD 的陷阱與最佳實踐

### 陷阱 1：寫成「How」而不是「What」

❌ **錯誤範例（描述實作細節）**：
```gherkin
場景：使用者登入
  當 使用者在 email 欄位輸入 "test@example.com"
  而且 使用者在 password 欄位輸入 "password123"
  而且 使用者點擊 id 為 "login-button" 的按鈕
  而且 系統呼叫 POST /api/auth/login API
  而且 API 回傳 200 狀態碼和 JWT token
  那麼 使用者應該被導向 /dashboard 路徑
```

這樣寫綁死了實作細節，改個按鈕 ID 測試就壞了。

✅ **正確範例（描述行為）**：
```gherkin
場景：使用者登入
  假如 使用者已經註冊帳號 "test@example.com"
  當 使用者用正確的帳號密碼登入
  那麼 使用者應該成功登入
  而且 使用者應該看到個人儀表板
```

**原則：描述使用者看到什麼、做了什麼、得到什麼結果，不要描述系統內部怎麼運作**。

### 陷阱 2：場景太長太複雜

❌ **錯誤範例**：
```gherkin
場景：完整的購物流程
  假如 使用者註冊新帳號 "new@example.com"
  而且 使用者登入
  而且 使用者瀏覽商品列表
  而且 使用者將「鍵盤」加入購物車
  而且 使用者將「滑鼠」加入購物車
  而且 使用者將「螢幕」加入購物車
  而且 使用者修改「鍵盤」數量為 2
  而且 使用者移除「螢幕」
  而且 使用者輸入優惠碼 "SAVE20"
  而且 使用者選擇「超商取貨」
  而且 使用者選擇「711 台北市政府門市」
  而且 使用者填寫收件人資訊
  而且 使用者選擇「貨到付款」
  當 使用者確認結帳
  那麼... （還有一堆驗證）
```

這種場景：
- 太長，難以維護
- 一個步驟失敗，後面全部跳過
- 不知道到底在測什麼

✅ **正確範例（拆成多個小場景）**：
```gherkin
場景：將商品加入購物車
  假如 使用者在商品列表頁面
  當 使用者將「機械鍵盤」加入購物車
  那麼 購物車應該有 1 件商品

場景：修改購物車商品數量
  假如 購物車有 1 件「機械鍵盤」
  當 使用者將數量改為 2
  那麼 購物車應該有 2 件「機械鍵盤」

場景：使用優惠碼結帳
  假如 購物車總價是 5000 元
  當 使用者輸入優惠碼 "SAVE20"
  那麼 折扣後金額應該是 4000 元
```

**原則：一個場景測一個行為，保持簡單**。

### 最佳實踐：重複使用步驟定義

好的步驟定義應該是**可重複使用**的：

```javascript
// 好的設計：參數化
Given('使用者已經用 {string} 註冊', function (email) {
  this.user = registerUser(email);
});

When('使用者用 {string} 和 {string} 登入', function (email, password) {
  this.result = login(email, password);
});

// 這樣多個場景可以重複使用相同的步驟
```

---

## 何時該用 BDD？何時不該用？

### ✅ 適合用 BDD 的情況：

1. **需要多方溝通的專案**
   - 有 PM、設計師、測試人員、開發人員的團隊
   - 需求經常變動或不明確
   - 需要向非技術人員展示進度

2. **複雜的業務邏輯**
   - 金流、物流、訂單系統
   - 會員等級、優惠規則、權限管理
   - 需要精確定義「在什麼情況下，做什麼，會得到什麼結果」

3. **長期維護的專案**
   - 需要活的文件
   - 經常有新人加入團隊
   - 回歸測試成本高

### ❌ 不適合用 BDD 的情況：

1. **技術細節測試**
   - 演算法效能測試（「排序 100 萬筆資料要在 1 秒內完成」）
   - 單元測試（「這個函式應該回傳正確的型別」）
   - 用傳統的 TDD 更適合

2. **小團隊或個人專案**
   - 只有你一個開發者
   - 需求非常明確且不會變動
   - 用 BDD 反而增加維護成本

3. **原型開發或實驗性專案**
   - 快速驗證想法
   - 規格尚未確定
   - 寫 BDD 規格的時間比寫程式碼還久

---

## 總結：BDD 讓測試變成團隊共同語言

BDD 不只是測試工具，更是一種**溝通方式**。它的核心價值是：

1. **用自然語言描述行為** → PM、測試、開發都能看懂
2. **在寫程式碼前就討論清楚** → 減少「這不是我要的」
3. **測試即文件** → 永遠最新、永遠正確
4. **關注行為而非實作** → 重構時測試不會壞

如果你的團隊常常遇到這些問題：
- ❌ 需求理解不一致
- ❌ 測試沒人看得懂
- ❌ 文件永遠過期
- ❌ 上線才發現漏測

試試看 BDD，讓你的測試從「火星文」變成「人話」。

---

## 延伸閱讀

- [Cucumber 官方文件](https://cucumber.io/docs/bdd/) - BDD 的起源和最佳實踐
- [Gherkin 語法參考](https://cucumber.io/docs/gherkin/reference/) - Given-When-Then 的完整語法
- [The BDD Books](https://cucumber.io/docs/bdd/books/) - BDD 經典書籍推薦
- [jest-cucumber GitHub](https://github.com/bencompton/jest-cucumber) - Jest + BDD 的整合方案
- [Playwright 官方文件](https://playwright.dev/) - E2E 測試工具
- [Martin Fowler: Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html) - TDD 的經典文章

---

**下次開會時，試著用 Given-When-Then 描述需求，你會發現很多「我以為」的誤會在寫程式碼前就被抓出來了**。
