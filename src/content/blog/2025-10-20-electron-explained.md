---
layout: post
title: "Electron：用網頁技術做桌面軟體的神奇魔法"
date: 2025-10-20
categories: [技術, Web開發]
tags: [Electron, 桌面應用, JavaScript, 跨平台開發]
description: "用幽默風趣的方式解釋 Electron，以及為什麼 VS Code、Discord、Slack 都選擇用它來開發桌面應用程式"
author: "Galen"
---

# Electron：用網頁技術做桌面軟體的神奇魔法

如果你是個程式設計師，可能每天都在用 VS Code 寫程式、用 Discord 跟朋友聊天、用 Slack 跟同事協作、用 Notion 做筆記、用 Postman 測試 API。這些軟體看起來就是一般的桌面應用程式，可以開視窗、可以接收通知、可以跨平台執行。

但如果我告訴你，**這些軟體其實都是用網頁技術（HTML、CSS、JavaScript）做出來的**，你會不會覺得不可思議？

這就是 [Electron](https://www.electronjs.org/) 的魔法。它讓你用做網頁的技術，就能開發出真正的桌面應用程式。不需要學 C++、不需要學 Swift、不需要學 C#，**用你熟悉的網頁技術，一次開發，到處執行**。

---

## 什麼是 Electron？打包整個瀏覽器給你

想像一下這個情境：你有一個很棒的網頁應用程式，但使用者抱怨「為什麼要開瀏覽器才能用？我想要一個桌面軟體！」

傳統做法：
- **Windows**：用 C# 或 C++ 重寫一次
- **macOS**：用 Swift 或 Objective-C 重寫一次
- **Linux**：用 C++ 或 Python 重寫一次

結果？**同樣的功能寫三次，維護成本爆炸，修 Bug 修到天荒地老**。

Electron 的做法：「我直接**把整個瀏覽器打包進你的應用程式裡**，這樣你的網頁應用程式就變成桌面軟體了！」

是的，你沒聽錯。Electron 應用程式裡面**真的包含了一個完整的 Chromium 瀏覽器**（就是 Google Chrome 的開源版本）。這就是為什麼 VS Code 安裝包有 100 多 MB—因為裡面裝了一整個瀏覽器。

---

## Electron 的核心架構：兩個世界的橋樑

Electron 由兩個主要部分組成：

### Chromium（瀏覽器引擎）
負責顯示 UI 和執行網頁程式碼。你可以用 HTML 寫界面、用 CSS 美化樣式、用 JavaScript 處理互動—**就像在寫網頁一樣**。

### Node.js（系統存取層）
負責存取作業系統功能。想要讀寫檔案？想要執行系統指令？想要接收鍵盤快捷鍵？Node.js 都可以做到。

這兩個部分透過 Electron 的 [IPC（Inter-Process Communication）機制](https://www.electronjs.org/docs/latest/tutorial/ipc)連接起來，讓你可以**在網頁 JavaScript 中呼叫系統功能**。

用比喻來說：
- **Chromium** 是「豪華裝潢的房子」，讓使用者看到漂亮的界面
- **Node.js** 是「水電管線系統」，讓你能接上真正的功能
- **IPC** 是「開關和插座」，讓房子和管線能溝通

---

## 為什麼需要 Electron？傳統桌面開發的痛點

### 痛點 1：跨平台開發成本超高

假設你要做一個簡單的 To-Do List 桌面應用：

```
Windows 版本（C#/.NET）：
- 學習 WPF 或 WinForms
- 學習 XAML 語法
- 只能在 Windows 上運行

macOS 版本（Swift）：
- 學習 SwiftUI 或 AppKit
- 學習 Xcode 工具
- 只能在 Mac 上運行

Linux 版本（C++/GTK）：
- 學習 GTK 框架
- 處理各種發行版的相容性問題
- 只能在 Linux 上運行
```

**結果：同樣的功能寫三次，三種不同的語言，三套不同的工具鏈，維護成本三倍**。

### 痛點 2：UI 開發效率低

傳統桌面開發的 UI 設計：
- 拖拉元件（Button、Label、TextBox）
- 設定屬性（字體、顏色、位置）
- 寫事件處理函式
- **稍微複雜的排版就要寫一堆程式碼**

網頁技術的 UI 設計：
- 用 HTML 寫結構（語意清楚）
- 用 CSS 做排版（Flexbox、Grid 超好用）
- 用 JavaScript 處理互動
- **豐富的 CSS 框架隨你選（Tailwind、Bootstrap、Material UI）**

### 痛點 3：更新和部署麻煩

傳統桌面軟體：
- 要做安裝包（.exe、.dmg、.deb）
- 每次更新都要使用者重新下載安裝
- 修個小 Bug 就要發一個新版本

Electron 應用：
- 可以用 [electron-builder](https://www.electron.build/) 自動打包
- 可以整合 [electron-updater](https://www.electron.build/auto-update) 做自動更新
- **使用者打開軟體就自動更新，像網頁一樣方便**

---

## Electron 的實際運作方式

一個 Electron 應用程式有兩個核心概念：

### Main Process（主進程）
- 就像應用程式的「大腦」
- 負責管理視窗、系統選單、檔案存取
- 用 Node.js 執行
- **一個應用程式只有一個 Main Process**

### Renderer Process（渲染進程）
- 就像應用程式的「臉」
- 負責顯示 UI，每個視窗就是一個 Renderer Process
- 用 Chromium 執行
- **一個應用程式可以有多個 Renderer Process**

### 簡單的 Electron 應用程式

> **⚠️ 安全提醒**：下面的範例為了教學目的使用了簡化的設定。在生產環境中，**請勿使用 `nodeIntegration: true`**，這會帶來嚴重的安全風險。正確的做法請參考 [Electron 安全最佳實踐](https://www.electronjs.org/docs/latest/tutorial/security)，使用 `contextBridge` 和 `preload` script。

```javascript
// main.js（Main Process）
const { app, BrowserWindow } = require('electron')

function createWindow() {
  // 建立一個視窗
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true  // ⚠️ 教學用，生產環境請勿使用
    }
  })

  // 載入 HTML 檔案
  win.loadFile('index.html')
}

// 當 Electron 啟動完成後，建立視窗
app.whenReady().then(createWindow)
```

```html
<!-- index.html（Renderer Process）-->
<!DOCTYPE html>
<html>
<head>
  <title>我的第一個 Electron 應用</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      text-align: center;
      padding: 50px;
    }
    button {
      font-size: 20px;
      padding: 10px 20px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>Hello Electron!</h1>
  <button onclick="alert('你點擊了按鈕！')">點我</button>
</body>
</html>
```

**就這麼簡單！你已經有一個可以執行的桌面應用程式了**。執行 `electron .` 就能看到視窗。

---

## Electron 的真實案例

Electron 不是玩具，它被用在許多你每天都在用的應用程式中：

| 應用程式 | 用途 | 為什麼選 Electron |
|---------|------|------------------|
| **VS Code** | 程式碼編輯器 | 需要跨平台、豐富的擴充生態、快速迭代 |
| **Discord** | 語音聊天軟體 | 需要即時通訊、跨平台、快速更新 |
| **Slack** | 團隊協作平台 | 網頁版已經很成熟，直接打包成桌面版 |
| **Notion** | 筆記軟體 | 複雜的富文本編輯，用網頁技術最方便 |
| **Figma Desktop** | 設計工具 | 核心是網頁應用，桌面版提供更好的效能 |
| **Obsidian** | Markdown 筆記 | 需要檔案系統存取，Electron 提供完美的橋樑 |
| **Postman** | API 開發測試工具 | 需要跨平台、本地資料儲存、系統整合 |

根據 [Electron 官方應用目錄](https://www.electronjs.org/apps)，已經有數百個知名應用程式使用 Electron 開發，涵蓋生產力工具、開發工具、音樂、影片等各種類別。

---

## Electron 的優勢：為什麼開發者愛用？

### ✅ 優勢 1：跨平台開發超簡單

一次開發，自動支援 Windows、macOS、Linux：

```json
// package.json
{
  "scripts": {
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  }
}
```

跑三個指令，就能產生三個平台的安裝包。**不需要改任何程式碼**。

### ✅ 優勢 2：開發速度快

如果你已經會網頁開發：
- **零學習成本**：HTML、CSS、JavaScript 直接用
- **豐富的生態系**：npm 上有超過 350 萬個套件隨你選
- **熱門框架都能用**：React、Vue、Angular、Svelte 任選
- **開發工具完善**：Chrome DevTools 直接用

### ✅ 優勢 3：UI/UX 設計彈性大

用 CSS 做 UI 排版比傳統桌面開發容易太多：

```css
/* 用 Flexbox 輕鬆做響應式排版 */
.sidebar {
  display: flex;
  flex-direction: column;
  width: 250px;
  background: #2c3e50;
}

/* 用 CSS Grid 做複雜佈局 */
.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

/* 用 CSS 變數做主題切換 */
:root {
  --primary-color: #3498db;
  --bg-color: #ffffff;
}

[data-theme="dark"] {
  --primary-color: #2980b9;
  --bg-color: #1e1e1e;
}
```

### ✅ 優勢 4：自動更新超方便

整合 [electron-updater](https://www.electron.build/auto-update) 後，使用者打開應用程式就會自動檢查更新：

```javascript
const { autoUpdater } = require('electron-updater')

autoUpdater.checkForUpdatesAndNotify()
```

**就這一行！使用者永遠使用最新版本，不用手動下載安裝**。

---

## Electron 的劣勢：沒有完美的技術

### ❌ 劣勢 1：檔案大小驚人

因為包含了整個 Chromium 和 Node.js：
- **空白 Electron 應用**：約 40-50 MB（高度優化）到 100+ MB（未優化）
- **VS Code**：約 90-240 MB（依平台和版本而異）
- **Discord**：約 80-100 MB

對比傳統桌面應用：
- **Notepad++**（純 C++）：約 4-7 MB
- **7-Zip**（純 C++）：約 1.5 MB

**解決方案**：
- 使用者只下載一次，之後自動更新只下載差異檔案
- 現代硬碟容量大，100 MB 其實不算什麼
- 開發成本降低帶來的好處遠大於檔案大小的缺點

### ❌ 劣勢 2：記憶體消耗較高

每個視窗都是一個獨立的 Chromium 進程：
- **Electron 應用**：100-300 MB RAM
- **原生應用**：20-50 MB RAM

**解決方案**：
- 現代電腦記憶體至少 8 GB，這不是問題
- 如果真的在意效能，可以用 [BrowserView](https://www.electronjs.org/docs/latest/api/browser-view) 減少進程數量

### ❌ 劣勢 3：啟動速度較慢

需要啟動 Chromium 引擎：
- **Electron 應用**：1-3 秒
- **原生應用**：0.5-1 秒

**解決方案**：
- 使用 [V8 Snapshot](https://www.electronjs.org/docs/latest/tutorial/performance#4-use-v8-snapshot) 加速啟動
- 實作 [Lazy Loading](https://www.electronjs.org/docs/latest/tutorial/performance#5-lazy-load-large-resources)，按需載入功能

---

## 何時該用 Electron？

### ✅ 適合的場景

- **已經有網頁版應用**：直接打包成桌面版，省下重寫的成本
- **需要跨平台支援**：Windows、Mac、Linux 一次搞定
- **快速開發 MVP**：用熟悉的網頁技術，幾天就能做出原型
- **團隊熟悉網頁技術**：不需要學新語言，立刻開工
- **需要複雜的 UI**：網頁技術的排版能力遠超傳統桌面 UI 框架
- **需要頻繁更新**：自動更新機制讓發版變輕鬆

### ❌ 不適合的場景

- **極致效能需求**：遊戲、影片編輯、3D 建模等，用 C++ 更合適
- **記憶體受限環境**：嵌入式系統、老舊電腦等
- **極簡工具**：如果只是做個計算機，Electron 太重了
- **需要底層硬體存取**：驅動程式、系統核心模組等，用系統原生語言

---

## 實戰：10 分鐘做一個 Markdown 編輯器

> **⚠️ 重要提醒**：這個實戰範例使用了簡化的安全設定以便快速學習。在實際開發中，請參考 [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)使用安全的架構（preload script + contextBridge）。

讓我們做一個簡單但實用的應用程式：

### 步驟 1：初始化專案

```bash
mkdir markdown-editor
cd markdown-editor
npm init -y
npm install electron --save-dev
npm install marked --save  # Markdown 解析器
```

### 步驟 2：建立 Main Process

```javascript
// main.js
const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,        // ⚠️ 教學用，生產環境不安全
      contextIsolation: false       // ⚠️ 教學用，生產環境不安全
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

### 步驟 3：建立 UI

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Markdown 編輯器</title>
  <style>
    body {
      margin: 0;
      font-family: 'Segoe UI', Arial, sans-serif;
      display: flex;
      height: 100vh;
    }
    #editor, #preview {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
    }
    #editor {
      background: #2c3e50;
      color: #ecf0f1;
      border: none;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      resize: none;
    }
    #preview {
      background: #ecf0f1;
      border-left: 1px solid #bdc3c7;
    }
  </style>
</head>
<body>
  <textarea id="editor" placeholder="在這裡輸入 Markdown..."></textarea>
  <div id="preview"></div>

  <script>
    const { marked } = require('marked')
    const editor = document.getElementById('editor')
    const preview = document.getElementById('preview')

    editor.addEventListener('input', () => {
      preview.innerHTML = marked.parse(editor.value)
    })

    // 預設內容
    editor.value = '# Hello Markdown!\n\n開始編輯吧！'
    preview.innerHTML = marked.parse(editor.value)
  </script>
</body>
</html>
```

### 步驟 4：執行應用

```bash
npx electron .
```

**恭喜！你在 10 分鐘內做出了一個跨平台的 Markdown 編輯器**。

想要打包成安裝檔？

```bash
npm install electron-builder --save-dev
npx electron-builder --win  # Windows 安裝檔
npx electron-builder --mac  # macOS 安裝檔
npx electron-builder --linux  # Linux 安裝檔
```

---

## Electron 的常見誤區

### 誤區 1：Electron 應用都很慢

❌ **錯誤：** Electron = 慢，原生應用 = 快
✅ **事實：** VS Code 速度飛快，Atom 已經被淘汰

**關鍵在於開發者如何優化**：
- 不好的 Electron 應用：到處用 `setInterval`、沒有虛擬滾動、載入一堆沒用的套件
- 好的 Electron 應用：按需載入、使用 Web Worker、做好快取

VS Code 就是最佳範例—它用 Electron，但效能超越許多原生編輯器。

### 誤區 2：Electron 只適合小專案

❌ **錯誤：** 大型應用不該用 Electron
✅ **事實：** Microsoft Teams、Slack、Figma 都是大型企業級應用

Electron 的架構設計允許你做出**企業級應用**：
- 支援多視窗管理
- 支援系統整合（通知、選單、快捷鍵）
- 支援自動更新和遠端除錯
- 支援原生模組（可以用 C++ 寫擴充）

### 誤區 3：Electron 不安全

❌ **錯誤：** 網頁技術 = 不安全
✅ **事實：** 正確設定的 Electron 應用非常安全

Electron 提供了完整的安全機制：
- **Context Isolation**：隔離 Renderer Process 和 Main Process
- **Content Security Policy**：防止 XSS 攻擊
- **禁用 Node Integration**：Renderer Process 預設不能存取 Node.js
- **使用 Preload Script**：提供安全的 API 橋樑

參考 [Electron 官方安全指南](https://www.electronjs.org/docs/latest/tutorial/security)，遵循最佳實踐即可。

---

## Electron 的未來：持續進化

Electron 從 2013 年由 GitHub 團隊開發（當時叫 Atom Shell）至今，已經發展超過 10 年。它不是停滯不前的技術，而是持續在進化：

- **效能優化**：每個新版本都在減少記憶體使用和啟動時間
- **安全強化**：預設啟用更多安全機制
- **API 改進**：更符合現代 Web 標準
- **Chromium 更新**：每 8 週發布新版本，與 Chromium 保持同步

根據 [Electron 官方部落格](https://www.electronjs.org/blog)，未來重點包括：
- 升級至 Node.js 22 生態系統
- 從 BrowserView 遷移至 WebContentsView
- 持續改進效能和安全性

---

## 結語

下次當你打開 VS Code、Discord、Slack 時，想想它們其實都是「網頁」：
- 用 **HTML** 寫結構
- 用 **CSS** 做美化
- 用 **JavaScript** 加功能
- 用 **Electron** 打包成桌面應用

**Electron 的核心價值不是「完美」，而是「實用」**：
- 讓前端工程師也能做桌面應用
- 讓跨平台開發不再是夢魘
- 讓快速迭代成為可能

檔案大一點？記憶體多用一點？**如果能換來幾倍的開發速度和更低的維護成本，這個交易划算**。

記住：**好的工具不是萬能的，而是在特定場景下做出最好的權衡**。Electron 就是在「開發效率」和「跨平台支援」上做到極致的工具。

---

## 參考資料

- [Electron 官方網站](https://www.electronjs.org/)
- [Electron 文件](https://www.electronjs.org/docs/latest/)
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron 效能優化](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron IPC 機制](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [electron-builder 打包工具](https://www.electron.build/)
- [electron-updater 自動更新](https://www.electron.build/auto-update)
- [Electron 應用程式列表](https://www.electronjs.org/apps)
- [Electron 的歷史與發展](https://www.electronjs.org/blog/electron-2-0)
- [VS Code 如何優化 Electron 效能](https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation)
