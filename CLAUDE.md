# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是一個結合 Web3/區塊鏈整合的 RPG 風格作品集部落格。網站結合了 Jekyll 靜態網站生成器、互動式 JavaScript 功能，以及 Ethereum 智能合約，打造遊戲化的開發者作品集體驗。

## 開發指令

### 完整開發環境（推薦）
```bash
# 一鍵啟動完整開發環境（Hardhat 節點 + 合約部署 + Jekyll 伺服器）
./dev
```

這個腳本會自動：
1. 啟動 Hardhat 本地節點（端口 8545）
2. 部署智能合約到本地網路
3. 啟動 Jekyll 開發伺服器（端口 4000）
4. 顯示測試帳戶資訊和合約地址

按 Ctrl+C 可停止所有服務。

### Jekyll 開發
```bash
# 安裝依賴
bundle install

# 啟動開發伺服器（自動重載）
bundle exec jekyll serve

# 編譯為生產環境
bundle exec jekyll build
```

網站訪問地址：http://localhost:4000

### 區塊鏈開發
```bash
# 編譯智能合約
npm run compile

# 執行所有測試
npm test

# 啟動本地區塊鏈節點（Hardhat）
npm run node

# 部署到本地網路（需在另一個終端機先啟動節點）
npm run deploy:local

# 部署到 Polygon 主網（需要 .env 設定）
npm run deploy:polygon
```

### i18n 工作流程
當新增或修改翻譯 key 時：

1. 編輯 `_data/i18n/{lang}.yml` 中的 YAML 檔案（支援語言：zh-TW, zh-CN, en, ja, ko）
2. 生成前端使用的 JSON 檔案：
   ```bash
   ruby generate_i18n_json.rb
   ```
3. 重新整理瀏覽器查看變更

**重要**：修改 YAML 後不會自動反映到前端。你**必須**執行 `generate_i18n_json.rb` 才能將 YAML 轉換為 JSON。

## 架構概覽

### 前端架構

**三層載入系統：**
1. **同步層**（`i18n-manager.js`）：在 DOM 之前載入，用於立即翻譯 `data-i18n` 屬性
2. **延遲層**（大部分腳本）：使用 `defer` 屬性進行非阻塞載入
3. **事件驅動層**：管理器透過 `Promise.all()` 等待依賴，而非輪詢

**核心管理器（單例模式）：**
- `UnifiedWalletManager`：Web3 錢包連接（純 ethers.js 實作，無外部錢包庫）
- `I18nManager`：多語言支援，動態載入翻譯 key
- `GameStateManager`：透過 Cookie 持久化玩家狀態（HP/MP/SP/Gold）
- `SGTPurchaseManager`：使用 USDT 購買代幣的流程
- `NetworkMonitor`：Chain ID 偵測與網路切換
- `SimpleSGTBalance`：以事件驅動方式顯示錢包 SGT 餘額

**腳本載入順序（依賴關係關鍵）：**
```
1. i18n-manager.js（同步）
2. gamestate.js（defer）
3. security-utils.js（defer）
4. 所有其他管理器（defer）
5. main.js（defer，協調所有初始化）
```

### 區塊鏈架構

**智能合約：**
- `SuperGalenTokenV1.sol`：可升級 ERC20 代幣（UUPS 模式）
  - 購買機制：以可配置比例將 USDT 兌換為 SGT
  - 安全功能：時間鎖、基於角色的訪問控制、黑名單、最大供應量限制
  - 支援本地（MockUSDT）和 Polygon（真實 USDT 位於 0xc2132D05D31c914a87C6611C10748AEb04B58e8F）

**部署配置：**
- 本地：Chain ID 31337，20 個測試帳戶，每個帳戶 10,000 ETH
- Polygon：Chain ID 137，需要 `.env` 檔案設定 `PRIVATE_KEY` 和 `POLYGON_RPC_URL`
- 合約地址儲存於 `blockchain/deployments/deployed_addresses.json`
- 前端從 `assets/js/contracts-config.js` 載入（自動生成）

**支援的網路：**
- Localhost (31337)：使用 MockUSDT 開發
- Polygon (137)：使用真實 USDT 生產環境

### i18n 系統

**流程：**
```
YAML (_data/i18n/*.yml) → Ruby 腳本 → JSON (assets/i18n/*.json) → JS 載入器 → DOM
```

**使用模式：**
- HTML 文字：`<span data-i18n="key.path">預設文字</span>`
- HTML 提示：`<div data-i18n-title="key.path" title="預設">...</div>`
- JavaScript：`I18nManager.t('key.path')` 或 `window.i18n.t('key.path')`

**支援語言：** zh-TW（預設）、zh-CN、en、ja、ko

### RPG 遊戲系統

**持久化狀態（基於 Cookie）：**
- HP/MP/SP 能量條與最大值
- 金幣貨幣
- 死亡/復活機制（60 秒倒數，復活時 HP/SP 為 10%）
- 最後訪問時間戳

**10 個互動頁籤：**
1. 狀態（帶提示的屬性）
2. 技能（基於 Canvas 的技能樹）
3. 背景故事（個人簡介與職涯歷程）
4. 物品欄（開發工具）
5. 任務（進行中的專案）
6. 成就
7. 夥伴（團隊成員）
8. 地圖（探索過的技術領域）
9. 聲望（社群貢獻度）
10. 日誌（部落格文章）

## 檔案結構（關鍵區域）

```
├── dev                            # 一鍵啟動完整開發環境腳本
├── _layouts/default.html          # 主要版面配置，包含腳本載入順序
├── index.html                     # 單頁應用程式，包含所有頁籤
├── _data/i18n/                    # 翻譯 YAML 檔案
├── assets/
│   ├── css/main.scss             # SCSS 入口點（匯入所有 partials）
│   ├── js/
│   │   ├── gamestate.js          # 基於 Cookie 的遊戲狀態持久化
│   │   ├── i18n-manager.js       # 翻譯系統（必須同步載入）
│   │   ├── unified-wallet-manager.js  # Web3 錢包整合
│   │   ├── sgt-purchase-manager.js    # 代幣購買 UI/邏輯
│   │   └── main.js               # 協調所有管理器初始化
│   └── i18n/*.json               # 生成的翻譯檔案（請勿直接編輯）
├── blockchain/
│   ├── contracts/                # Solidity 智能合約
│   ├── scripts/                  # 部署腳本
│   ├── test/                     # 合約測試（76 個測試）
│   └── deployments/              # 已部署的合約地址
├── generate_i18n_json.rb         # YAML→JSON 轉換器（修改 YAML 後必須執行）
└── hardhat.config.js             # 區塊鏈配置與網路設定
```

## 測試

所有區塊鏈測試位於 `blockchain/test/`：
```bash
# 執行全部 76 個測試
npm test

# 執行特定測試檔案
npx hardhat test blockchain/test/SuperGalenTokenV1.test.js
```

測試涵蓋範圍：
- 代幣鑄造/銷毀與安全限制
- USDT 購買流程與邊界情況
- 基於角色的訪問控制
- 時間鎖機制（Treasury、MintRatio、MaxSupply）
- 黑名單功能
- 溢位/下溢保護

## 關鍵注意事項

### 效能
- **消除渲染阻塞**：除了 i18n-manager.js 外，所有 CDN 腳本都使用 `defer`
- **無輪詢機制**：透過 `Promise.all()` 進行事件驅動的依賴載入
- **Font Awesome 技巧**：使用 `media="print" onload="this.media='all'"` 實現非同步 CSS 載入

### 安全性
- 絕不提交 `.env` 檔案（包含私鑰）
- 合約使用 SafeERC20 進行代幣轉帳
- Treasury 變更需要 24 小時時間鎖
- MintRatio 變更限制為 20%，冷卻期 1 小時
- MaxSupply 變更需要 7 天冷卻期

### Web3 整合
- 純 ethers.js 實作（無 WalletConnect SDK 臃腫）
- 支援 MetaMask 和瀏覽器注入的錢包
- 自動網路偵測和切換提示
- 合約配置在動態配置載入失敗時有預設回退值

### CSS 架構
- SCSS 模組化，在 `assets/css/main.scss` 中匯入
- 絕不使用 `!important` 或行內樣式
- 響應式斷點適配桌面/平板/手機
- RPG 主題：金色（#ffd700）、深藍漸層背景

### 開發工作流程
1. 修改 YAML 翻譯 → 必須執行 `ruby generate_i18n_json.rb`
2. 修改智能合約 → 必須執行 `npm run compile` 然後 `npm test`
3. Jekyll 監控大部分檔案但不包括 JSON → i18n 變更需要手動重新整理
4. 本地區塊鏈 → 必須在另一個終端機保持 `npm run node` 運行（或使用 `./dev` 一鍵啟動）
