---
layout: post
title: "歡迎來到 SuperGalen's Dungeon！"
date: 2024-08-23
categories: general
tags: [技術架構, Jekyll, Web3, RPG, 全端開發]
---

歡迎來到我的 RPG 風格技術部落格！這不只是一個普通的部落格，而是一個結合了靜態網站生成、Web3 區塊鏈整合、多語言支援，以及遊戲化互動體驗的完整作品集。

## 🎮 專案理念

作為一個全端開發者，我想要打造一個能展現技術實力、同時又有趣好玩的個人網站。於是，我將傳統的履歷和作品集，轉化成了一個 RPG 遊戲介面，讓訪客可以像探索遊戲世界一樣，了解我的技能、經歷和專案。

## 🛠️ 核心技術棧

### 1. Jekyll 靜態網站生成器

**用途：** 網站的核心框架，負責將 Markdown 文章轉換為靜態 HTML 頁面。

**為什麼選擇 Jekyll？**
- ✅ **零成本部署** - 可以免費託管在 GitHub Pages
- ✅ **快速載入** - 靜態網站沒有資料庫查詢，載入速度極快
- ✅ **Markdown 撰寫** - 使用 Markdown 寫文章，簡單直觀
- ✅ **Liquid 模板引擎** - 強大的模板系統，支援變數、迴圈、條件判斷

**關鍵插件：**
```ruby
gem "jekyll-feed"       # 自動生成 RSS feed
gem "jekyll-seo-tag"    # SEO 優化標籤
gem "jekyll-sitemap"    # 自動生成 sitemap.xml
gem "jekyll-paginate"   # 文章分頁功能
```

### 2. Hardhat + Ethers.js - Web3 開發框架

**用途：** 智能合約開發、測試、部署，以及前端錢包連接。

**技術亮點：**
- **Hardhat** - 專業的 Solidity 開發環境
  - 本地區塊鏈節點（Chain ID 31337）
  - 內建 20 個測試帳戶，每個帳戶 10,000 ETH
  - 支援合約編譯、測試、部署一條龍

- **Ethers.js v6** - 現代化的 Web3 庫
  - 純 ethers.js 實作，無需 WalletConnect SDK
  - 支援 MetaMask 和瀏覽器注入錢包
  - 自動網路偵測和切換提示

**智能合約：SuperGalenTokenV1**
```solidity
// 可升級的 ERC20 代幣（UUPS 模式）
contract SuperGalenTokenV1 is
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // 使用 USDT 購買 SGT 代幣
    function buyTokensWithUSDT(uint256 usdtAmount) external;

    // 時間鎖保護的管理功能
    // - Treasury 變更需要 24 小時
    // - MintRatio 變更限制為 10%，冷卻期 1 小時
    // - MaxSupply 變更需要 7 天冷卻期
}
```

**測試覆蓋：** 76 個測試案例，涵蓋代幣鑄造、購買流程、角色權限、時間鎖機制等。

### 3. SCSS 模組化樣式系統

**用途：** 維護可擴展的 CSS 架構，支援主題切換和響應式設計。

**架構設計：**
```scss
// assets/css/main.scss
@import "variables";      // CSS 變數定義
@import "base";          // 全局樣式重置
@import "animations";    // 動畫定義
@import "theme";         // Dark/Light 主題
@import "layout";        // 佈局容器
@import "header";        // Header 樣式
@import "footer";        // Footer 樣式
// ... 22 個模組化 SCSS 檔案
```

**主題系統：**
- Dark Mode（預設）：深藍漸層背景 + 金色強調色（#ffd700）
- Light Mode：白色背景 + 藍色強調色（#2563eb）
- 透過 `[data-theme="light"]` 選擇器切換樣式

### 4. 多語言系統（i18n）

**用途：** 支援繁體中文、簡體中文、英文、日文、韓文五種語言。

**工作流程：**
```
YAML (_data/i18n/*.yml)
  → Ruby 腳本轉換
  → JSON (assets/i18n/*.json)
  → JavaScript 載入器
  → DOM 渲染
```

**使用方式：**
```html
<!-- HTML 文字翻譯 -->
<span data-i18n="journal.title">日誌</span>

<!-- JavaScript 翻譯 -->
const text = I18nManager.t('skills.backend');
```

**關鍵腳本：** `generate_i18n_json.rb` - 將 YAML 翻譯檔轉換為前端可用的 JSON。

### 5. 遊戲狀態管理系統

**用途：** 使用 Cookie 持久化玩家的 RPG 數據。

**GameStateManager 功能：**
```javascript
// 管理玩家狀態
- HP/MP/SP 能量條與最大值
- 金幣貨幣系統
- 死亡/復活機制（60 秒倒數，復活時 HP/SP 為 10%）
- 最後訪問時間戳

// 使用範例
const hp = GameStateManager.getState('hp');
GameStateManager.setState('gold', 1000);
```

### 6. 前端架構 - 事件驅動與延遲載入

**三層載入策略：**

1. **同步層** - `i18n-manager.js`
   - 在 DOM 解析前立即載入
   - 用於翻譯 `data-i18n` 屬性

2. **延遲層** - 所有其他腳本使用 `defer`
   - 非阻塞載入，優化首屏渲染
   - CDN 資源（Anime.js, GSAP）使用 defer

3. **事件驅動層** - 使用 `Promise.all()` 等待依賴
   - 無輪詢機制，提升效能
   - 各管理器間透過事件通訊

**核心管理器（單例模式）：**
- `UnifiedWalletManager` - Web3 錢包連接
- `I18nManager` - 多語言支援
- `GameStateManager` - 遊戲狀態持久化
- `SGTPurchaseManager` - 代幣購買流程
- `NetworkMonitor` - 鏈偵測與切換
- `SimpleSGTBalance` - 錢包餘額顯示

### 7. RPG 互動介面

**10 個功能頁籤：**
1. **狀態** - 顯示技能屬性與數值
2. **技能** - Canvas 繪製的技能樹
3. **背景故事** - 個人簡介與職涯歷程
4. **物品欄** - 開發工具展示
5. **任務** - 進行中的專案
6. **成就** - 技術里程碑
7. **夥伴** - 團隊成員介紹
8. **地圖** - 探索過的技術領域
9. **聲望** - 社群貢獻度
10. **日誌** - 技術部落格文章

### 8. 動畫與視覺效果

**使用的動畫庫：**
- **Anime.js** - 元素進入動畫、滾動觸發效果
- **GSAP** - 複雜的時間軸動畫
- **CSS Animations** - 載入動畫、粒子效果

**賽博龐克風格特效：**
- 掃描線動畫（scanLine）
- 文字發光效果（glowPulse）
- 懸停波紋效果
- 粒子飄浮動畫

## 🚀 效能優化策略

1. **消除渲染阻塞**
   - 所有 CDN 腳本使用 `defer` 屬性
   - Font Awesome 使用 `media="print"` 延遲載入技巧

2. **靜態生成**
   - Jekyll 預先生成所有 HTML，無需伺服器端渲染
   - 可直接部署到 CDN（Cloudflare Pages, Netlify）

3. **模組化 CSS**
   - SCSS 編譯為單一壓縮 CSS 檔案
   - 減少 HTTP 請求

4. **智能合約優化**
   - 使用 OpenZeppelin 經過審計的合約庫
   - SafeERC20 防止代幣轉帳失敗
   - 時間鎖機制保護關鍵操作

## 🔐 安全性考量

**智能合約安全：**
- ✅ 基於角色的訪問控制（RBAC）
- ✅ 時間鎖保護管理員操作
- ✅ 黑名單功能防止惡意地址
- ✅ 溢位/下溢保護
- ✅ 76 個測試案例確保功能正確性

**前端安全：**
- ✅ 絕不在前端存儲私鑰
- ✅ 使用 MetaMask 簽名交易
- ✅ 輸入驗證與清理
- ✅ CSP（Content Security Policy）標頭

## 🌐 支援的區塊鏈網路

- **Localhost (31337)** - 本地開發，使用 MockUSDT
- **Polygon (137)** - 生產環境，使用真實 USDT

## 📦 一鍵啟動開發環境

```bash
# 啟動 Hardhat 節點 + 部署合約 + Jekyll 伺服器
./dev
```

這個腳本會自動：
1. 啟動本地區塊鏈（端口 8545）
2. 部署智能合約
3. 啟動 Jekyll 開發伺服器（端口 4000）
4. 顯示測試帳戶和合約地址

## 🎯 未來計畫

在這個部落格上，我將持續分享：

- 📝 **全端開發經驗** - React, Ruby on Rails, Elixir/Phoenix
- ⛓️ **Web3 整合教學** - 智能合約、DApp 開發
- 🎨 **前端架構設計** - 狀態管理、效能優化
- 🔧 **DevOps 實踐** - CI/CD, Docker, Kubernetes
- 🎮 **互動式專案展示** - 實作有趣的網頁實驗

## 💡 技術啟發

這個專案結合了：
- **傳統 Web 開發**（Jekyll, SCSS, JavaScript）
- **現代前端框架思維**（狀態管理、模組化、事件驅動）
- **Web3 技術**（智能合約、錢包連接、區塊鏈交互）
- **遊戲化設計**（RPG 介面、成就系統、狀態持久化）

如果你對這些技術有興趣，歡迎透過[聯繫頁面](/services/2025/10/05/consulting-services.html)與我交流，或在 [GitHub](https://github.com/Lawa0921) 上查看我的開源專案！

---

**技術棧總結：**
- 🎨 前端：Jekyll + SCSS + Vanilla JavaScript
- ⛓️ 區塊鏈：Hardhat + Solidity + Ethers.js
- 🌐 多語言：YAML → Ruby → JSON → i18n Manager
- 🎮 互動：RPG 系統 + Canvas 繪圖 + 動畫庫
- 🚀 部署：GitHub Pages / Polygon Mainnet

讓我們一起探索技術的無限可能！🚀
