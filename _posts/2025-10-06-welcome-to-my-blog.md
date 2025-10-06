---
layout: post
title: "歡迎來到我的技術部落格"
date: 2025-10-06
categories: [技術, 專案]
tags: [Jekyll, Web3, Blockchain, 全端開發]
description: "一個結合 Jekyll、Web3 與 RPG 遊戲風格的技術作品集部落格 - 技術選型與架構決策"
---

# 歡迎來到我的技術部落格

這是一個融合**靜態網站生成**、**區塊鏈整合**和**遊戲化介面**的技術作品集。這篇文章將分享我的技術選型理念，以及每個技術決策背後的考量。

---

## 🎯 核心理念

**問題**：如何打造一個既能展示技術實力，又不會讓人覺得無聊的作品集？

**答案**：把履歷變成 RPG 遊戲，把技術棧變成可互動的系統。訪客不只是「閱讀」作品集，而是「探索」一個遊戲世界。

---

## 🛠️ 技術棧與選型理由

### 1. Jekyll - 靜態網站生成器

**為什麼選擇 Jekyll？**

我需要一個能快速部署、零維護成本的部落格系統。Jekyll 完美符合：

- **零成本部署**：直接託管在 GitHub Pages，省去伺服器費用
- **安全性高**：沒有資料庫，沒有後端，不會被 SQL injection
- **速度極快**：純靜態 HTML，載入速度直接受限於 CDN
- **Markdown 撰寫**：專注內容，不用處理複雜的 CMS 介面

**使用的插件與理由：**

```ruby
gem "jekyll-feed"       # 自動生成 RSS，讓讀者能訂閱
gem "jekyll-seo-tag"    # 自動處理 Open Graph、Twitter Card 等 SEO meta
gem "jekyll-sitemap"    # 自動生成 sitemap.xml 給搜尋引擎爬
gem "jekyll-paginate"   # 文章分頁，避免首頁太長
```

這些插件幫我自動處理了所有 SEO 與 RSS 的瑣事，讓我專注在內容撰寫上。

**Liquid 模板的實際應用：**

Jekyll 的 Liquid 模板讓我能在靜態網站中實現動態邏輯，例如根據語言顯示不同的導航列、根據分類過濾文章等。

---

### 2. Hardhat + Ethers.js - Web3 技術棧

**為什麼需要區塊鏈整合？**

我想展示 Web3 開發能力，同時為作品集加入「代幣經濟」這個實驗性功能。訪客可以用 USDT 購買我的代幣 (SGT)，象徵性地「投資」我的技術服務。

**為什麼選擇 Hardhat？**

在 Truffle、Foundry、Hardhat 三者之間，我選擇 Hardhat 因為：

- **優秀的錯誤訊息**：當合約 revert 時，能清楚看到原因
- **活躍的社群**：大部分 OpenZeppelin 文件都以 Hardhat 為範例
- **內建測試框架**：整合 Mocha/Chai，不需要複雜設定
- **JavaScript 原生支援**：使用熟悉的 JavaScript 編寫測試和腳本

**為什麼選擇 Ethers.js 而非 Web3.js？**

- **更小的 bundle size**：Ethers.js 只有 88KB，Web3.js 超過 400KB
- **更現代的 API**：async/await 風格，不用處理 callback hell
- **更好的文件**：Richard Moore 的文件寫得非常清楚

**依賴項與用途：**

```json
{
  "@openzeppelin/contracts": "^5.4.0",           // 經過審計的標準合約
  "@openzeppelin/contracts-upgradeable": "^5.4.0", // UUPS 升級模式
  "@openzeppelin/hardhat-upgrades": "^3.9.1",    // 升級部署工具
  "ethers": "^6.15.0",                           // 前端錢包互動
  "hardhat": "^2.26.3"                           // 開發環境
}
```

**為什麼選擇 UUPS？**

使用 OpenZeppelin 的 UUPS (Universal Upgradeable Proxy Standard) 可升級模式，讓合約邏輯可以升級，同時保持合約地址和狀態不變。這對長期維護的代幣合約很重要。

**Solidity 編譯器版本：**

合約使用 Solidity 0.8.19，這是一個穩定且被 OpenZeppelin 完整支援的版本。Hardhat 配置中也設定了 0.8.20 和 0.8.22 編譯器，以確保能編譯不同版本的依賴套件。

---

### 3. SCSS - 樣式架構

**為什麼用 SCSS 而非 Tailwind？**

我評估了幾個選項：

| 方案 | 優點 | 缺點 | 為何不選 |
|------|------|------|---------|
| CSS-in-JS | 元件化、動態樣式 | 需要 React/Vue | 這是靜態網站 |
| Tailwind | 快速開發、utility-first | HTML 冗長、客製化困難 | RPG 風格需要大量客製 |
| SCSS | 變數、巢狀、mixins | 需要編譯 | ✅ 選擇這個 |

**SCSS 的關鍵優勢：**

```scss
// 主題變數統一管理
[data-theme="dark"] {
    --primary: #ffd700;
    --bg: #0a192f;
}

// 響應式 mixin 重用
@mixin mobile {
    @media (max-width: 768px) { @content; }
}

// 模組化匯入
@import "variables";  // 全域變數
@import "theme";      // 主題定義
@import "components"; // 元件樣式
```

我把樣式拆成 33 個模組，每個模組負責一個功能（header、footer、game-tabs 等），這樣修改 A 功能時不會影響到 B。

---

### 4. i18n 多語言系統

**為什麼需要多語言？**

我的目標受眾包括台灣、中國、日本、韓國的開發者，而且我會日文，所以決定支援 5 種語言。

**為什麼用 YAML + Ruby 而非前端 i18n 庫？**

我比較了幾個方案：

- **i18next**：功能強大但 bundle 太大（45KB）
- **vue-i18n**：需要 Vue 框架
- **自建系統**：YAML → Ruby 腳本 → JSON → 前端載入

我選擇自建系統，因為：
1. **零 runtime 依賴**：所有翻譯在編譯時處理
2. **YAML 易讀**：翻譯者不需要懂 JavaScript
3. **Jekyll 整合**：Ruby 腳本可以直接執行

**工作流程：**

```bash
# 1. 編輯 YAML（人類友善格式）
_data/i18n/zh-TW.yml

# 2. 執行轉換腳本
ruby generate_i18n_json.rb

# 3. 前端載入 JSON
fetch('/assets/i18n/zh-TW.json')
```

**為什麼要同步載入 i18n-manager.js？**

如果 i18n 是 `defer` 載入，會出現「英文閃一下變中文」的問題（FOUC - Flash of Unstyled Content）。所以我讓 i18n-manager.js 在 DOM 解析前就載入，這樣首次渲染就是正確語言。

---

### 5. 動畫系統

**為什麼同時用 Anime.js 和 GSAP？**

| 功能 | Anime.js | GSAP | 選擇 |
|------|----------|------|------|
| 簡單進場動畫 | ✅ 9KB | ❌ 50KB | Anime.js |
| 複雜時間軸 | ❌ 功能有限 | ✅ 強大 | GSAP |
| SVG 動畫 | ⚠️ 基礎支援 | ✅ 完整支援 | GSAP |

我用 Anime.js 處理 90% 的簡單動畫（元素進場、數字滾動），用 GSAP 處理複雜的技能樹動畫。

**為什麼不全部用 GSAP？**

GSAP 太大了（50KB）。對於這個專案，Anime.js 的 9KB 已經足夠大部分需求。

---

### 6. 前端架構設計

**問題：如何管理 22 個 JavaScript 模組的依賴關係？**

我使用了**三層載入策略**：

**1. 同步層（阻塞載入）**
- `i18n-manager.js`：必須在 DOM 前載入，避免翻譯閃爍
- 主題腳本：避免「白色閃一下變黑色」

**2. 延遲層（defer 載入）**
- 所有其他腳本：使用 `defer` 屬性非阻塞載入
- CDN 資源：Anime.js、GSAP 都用 defer

**3. 事件驅動層（Promise.all）**
```javascript
// 不用輪詢，用 Promise 等待依賴就緒
Promise.all([
    window.walletManager?.isReady,
    window.i18nManager?.isReady,
    window.gameState?.isReady
]).then(() => {
    console.log('系統初始化完成');
});
```

**為什麼不用 Webpack/Vite？**

- Jekyll 已經處理了靜態資源
- 我不需要 tree-shaking（腳本總共才 100KB）
- 不需要 HMR（Jekyll 已經有 auto-reload）
- 部署更簡單（不需要 build step）

---

### 7. 狀態管理

**為什麼用 Cookie 而非 localStorage？**

Cookie 可以設定過期時間（我設定為 7 天），這樣玩家狀態會自動過期，避免佔用過多儲存空間。而且 Cookie 在跨頁面時更穩定。

**為什麼不用 Redux/Vuex？**

這不是一個 SPA，每次換頁都會重新載入。用 Redux 會增加 45KB bundle size，但完全用不到 time-travel debugging 等功能。

**簡單的狀態管理：**

```javascript
class GameStateManager {
    save() {
        document.cookie = `gameState=${JSON.stringify(this.state)}; max-age=604800`; // 7 天
    }

    load() {
        const cookie = document.cookie.match(/gameState=([^;]+)/);
        return cookie ? JSON.parse(cookie[1]) : this.defaultState;
    }
}
```

---

## 🚀 效能優化決策

### 消除渲染阻塞

**Font Awesome 的非同步載入技巧：**
```html
<link rel="stylesheet" href="font-awesome.css"
      media="print" onload="this.media='all'">
```

這個技巧讓 CSS 以低優先級載入，不會阻塞首屏渲染。

### 懶載入

使用 `lazy-loader.js` 管理大型套件的動態載入，只有在實際需要時才載入相關功能，減少初始載入時間。

---

## 🔐 安全性考量

### 智能合約安全

**為什麼用 OpenZeppelin？**

自己寫 ERC20 容易出錯。OpenZeppelin 的合約經過：
- 多次獨立審計
- 數百個專案的實戰驗證
- 持續的安全更新

**為什麼需要 ReentrancyGuard？**

雖然我的合約遵循 CEI 模式（Checks-Effects-Interactions），但多加一層保護不會有壞處，Gas 成本只增加幾百 wei。

**為什麼需要時間鎖（Timelock）？**

關鍵操作（如變更 Treasury 地址、升級合約）需要 24 小時至 7 天的等待期，這讓用戶有時間發現異常並撤出資金。

### 前端安全

**為什麼用 CSP（Content Security Policy）？**

```html
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
```

強制所有 HTTP 請求升級為 HTTPS，防止中間人攻擊。

---

## 📊 開發體驗優化

### 一鍵啟動腳本

**為什麼需要 `./dev` 腳本？**

開發時需要同時啟動：
1. Hardhat 本地區塊鏈（端口 8545）
2. 部署智能合約
3. Jekyll 開發伺服器（端口 4000）

每次都手動執行這三步很麻煩，所以我寫了一個 Bash 腳本整合所有步驟。

### 測試策略

**為什麼寫了 52 個測試？**

智能合約一旦部署就無法修改（即使用了可升級模式，升級也有風險）。所以我測試了：
- 所有正常流程
- 所有邊界條件（0 金額、最大值、溢位）
- 所有錯誤處理（餘額不足、權限不足）
- 所有安全機制（重入攻擊、時間鎖）

測試覆蓋率 100%，每次部署前都會跑完所有測試。

---

## 💡 技術取捨

### 不選擇 React/Vue 的原因

- **過度設計**：這是個部落格，不是 Gmail
- **SEO 複雜**：需要 SSR 或 prerender
- **Bundle size**：React 16KB + ReactDOM 40KB，對於靜態網站太重
- **學習曲線**：協作者需要學 JSX/Vue template

### 不選擇 Next.js/Nuxt 的原因

- **需要 Node.js 伺服器**：失去靜態部署的優勢
- **複雜度**：為了部落格功能引入全端框架
- **成本**：Vercel 免費額度有限，GitHub Pages 完全免費

---

## 結語

這個專案的技術選型圍繞三個原則：

1. **簡單優先**：能用靜態就不用動態，能用 CSS 就不用 JS
2. **效能優先**：每增加一個依賴都要問「值得嗎？」
3. **安全優先**：智能合約絕不省測試

**技術棧總結：**
- **前端**：Jekyll + SCSS + Vanilla JS（零框架）
- **區塊鏈**：Hardhat + Ethers.js + OpenZeppelin
- **動畫**：Anime.js（輕量） + GSAP（複雜場景）
- **多語言**：YAML → Ruby → JSON（零 runtime）

如果你對技術選型有任何疑問，歡迎透過 [GitHub Issues](https://github.com/Lawa0921) 討論！
