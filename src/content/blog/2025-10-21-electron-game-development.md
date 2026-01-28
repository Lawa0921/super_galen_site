---
layout: post
title: "用 Electron 做遊戲？聽起來瘋狂，但可能比你想的更實際"
date: 2025-10-21
categories: [技術, 遊戲開發]
tags: [Electron, WebGL, 遊戲開發, 跨平台, Phaser, PixiJS]
description: "探討用 Electron + WebGL 開發遊戲的可能性，從 HTML5 遊戲到 Steam 發行，一次滿足 Windows、Mac、Linux 三平台"
author: "Galen"
---

# 用 Electron 做遊戲？聽起來瘋狂，但可能比你想的更實際

如果你曾經夢想做一款自己的遊戲，可能聽過 Unity、Unreal Engine、Godot 這些大名鼎鼎的遊戲引擎。也許你興沖沖地下載了其中一個，結果發現：**學習曲線陡峭、打包設定複雜、還要學一門新的程式語言**（C#、C++、GDScript）。

然後你可能想：「我只是想做個小遊戲而已，為什麼這麼麻煩？」

**更慘的是跨平台問題**：同一款遊戲要在 Windows、macOS、Linux 上跑，你得處理不同平台的編譯設定、路徑問題、圖形 API 差異。光是讓遊戲在三個平台上正常運行，就可能耗掉你好幾天的時間。

但如果我告訴你，**有一種方式可以用你可能已經會的網頁技術（HTML、CSS、JavaScript）來做遊戲，而且一次開發就能在三個平台上運行**，你會不會想試試看？

這就是 Electron + WebGL 的魔法。

---

## Electron 做遊戲？這不是工具軟體的框架嗎？

是的，Electron 最出名的是像 VS Code、Discord、Slack 這類生產力工具。但其實 Electron 的核心就是「把瀏覽器打包成桌面應用」，而現代瀏覽器的 [WebGL](https://www.khronos.org/webgl/) 技術已經非常成熟，**效能足以支撐大部分 2D 遊戲，甚至一些輕量級 3D 遊戲**。

想像一下：你在瀏覽器裡玩過的那些 HTML5 小遊戲（像 [2048](https://play2048.co/)、[Slither.io](http://slither.io/)），如果把它們打包成桌面應用，再加上更好的效能優化、本地資料儲存、系統整合（快捷鍵、全螢幕、成就系統），**它們就變成了一款「真正的」桌面遊戲**。

事實上，已經有人這麼做了。

---

## 真實案例：有人真的用 Electron 發布遊戲到 Steam

### 案例 1：The Supernatural Power Troll

一位開發者 Jack Le Hamster 用 [Phaser.js](https://phaser.io/)（一個超流行的 HTML5 遊戲引擎）開發了《The Supernatural Power Troll》，然後用 Electron 打包，**成功發布到 Steam 上**。

他還寫了一篇完整的教學：[Publishing Web Games on Steam with Electron](https://phaser.io/news/2025/03/publishing-web-games-on-steam-with-electron)（2025 年 3 月發布）。

教學包含：
- 如何把 HTML5 遊戲打包成 Electron 應用
- 如何設定自訂圖示和應用程式名稱
- 如何用 [electron-builder](https://www.electron.build/) 自動建構 Windows、macOS、Linux 三個平台的版本
- 如何上傳到 Steam 的 Steamworks

**重點：他用 GitHub Actions 自動化整個流程，一次 commit 就能產生三個平台的安裝檔**。

### 案例 2：Crystalline Bliss

開發者 Lucas Johnson 用他自己開發的 [Divine Voxel Engine](https://github.com/Divine-Star-Software/DivineVoxelEngine)（基於 [BabylonJS](https://www.babylonjs.com/) 的體素引擎）開發了一款 3D 解謎遊戲《Crystalline Bliss》，同樣透過 Electron 打包成桌面應用並發布到 Steam。完整經驗分享在 [DEV Community](https://dev.to/lucasdamianjohnson/i-finally-published-my-first-game-to-steam-using-electron-my-own-voxel-engine-2ikc)。

### 案例 3：Pixitron Engine

[Pixitron](https://github.com/LAGameStudio/pixitron) 是一個基於 Electron + [PixiJS](https://pixijs.com/) 的跨平台遊戲引擎，專門為了簡化「HTML5 遊戲轉桌面應用」而設計。它提供了開箱即用的專案範本，讓你專注在遊戲邏輯上，而不是打包設定。

---

## 為什麼選 Electron + WebGL？跨平台的真正意義

### ✅ 優勢 1：真正的一次開發，到處執行

用 Unity 開發遊戲時，雖然號稱跨平台，但實際上：
- Windows 版本要測試 DirectX 和 OpenGL
- macOS 版本要測試 Metal
- Linux 版本要處理各種發行版的依賴問題

**用 Electron + WebGL？寫一次程式碼，Chromium 引擎自動幫你處理所有平台的圖形 API 差異**。

```bash
# 一個指令，產生三個平台的安裝檔
npm run build

# 產生結果：
# dist/MyGame-1.0.0.exe         (Windows)
# dist/MyGame-1.0.0.dmg         (macOS)
# dist/MyGame-1.0.0.AppImage    (Linux)
```

### ✅ 優勢 2：開發速度飛快

如果你已經會 JavaScript：
- **零學習成本**：直接用你熟悉的 HTML/CSS/JavaScript
- **豐富的生態系**：npm 上有超過 350 萬個套件
- **熱重載**：改程式碼立刻看到效果，不用等編譯
- **Chrome DevTools**：強大的除錯工具

想要做個俄羅斯方塊？用 Phaser.js 可能 2 小時就做完了。想要做個卡牌遊戲？HTML/CSS 的排版能力遠超傳統遊戲引擎的 UI 系統。

### ✅ 優勢 3：適合獨立開發者和小團隊

你不需要：
- 學 C++ 的記憶體管理
- 處理 Unity 的複雜 Scene 系統
- 理解 Unreal Engine 的藍圖或材質編輯器

你只需要：
- 一個瀏覽器
- 一個文字編輯器
- 基本的 JavaScript 知識

**降低門檻 = 更多人能做遊戲 = 更多有趣的創意遊戲誕生**。

---

## 技術選擇：該用哪個遊戲引擎？

Electron 只是容器，真正處理遊戲邏輯和繪圖的是 WebGL 遊戲引擎。以下是幾個熱門選擇：

### 🎮 Phaser.js - 2D 遊戲的王者

- **官網**：https://phaser.io/
- **適合**：2D 平台遊戲、射擊遊戲、解謎遊戲、卡牌遊戲
- **特色**：物理引擎內建、動畫系統完整、豐富的範例和社群支援
- **效能**：經過高度優化，可以流暢處理數百個精靈（sprites）

**推薦教學**：[Publishing Web Games on Steam with Electron](https://gamedevjs.com/tutorials/publishing-web-games-on-steam-with-electron/)

### 🚀 PixiJS - 最快的 2D 渲染引擎

- **官網**：https://pixijs.com/
- **適合**：需要高效能 2D 圖形的遊戲、視覺效果豐富的應用
- **特色**：WebGL 加速、自動批次處理、記憶體管理優秀
- **效能測試結果**：在基準測試中達到 **47 FPS**（渲染大量精靈時）

如果你的遊戲需要同時顯示成千上萬個粒子或物件，PixiJS 是最佳選擇。

### 🌐 Three.js - 3D 遊戲入門首選

- **官網**：https://threejs.org/
- **適合**：3D 冒險遊戲、第一人稱視角、體素遊戲
- **特色**：輕量級、學習曲線平緩、範例超多
- **社群**：有龐大的社群和無數教學資源

### 🎨 Babylon.js - 完整的 3D 遊戲引擎

- **官網**：https://www.babylonjs.com/
- **適合**：複雜的 3D 遊戲、需要物理引擎、需要 VR/AR 支援
- **特色**：功能完整、效能優異、官方維護積極
- **效能測試結果**：在 2D 測試中達到 **56 FPS**（即使是 3D 引擎也能高效處理 2D）

根據 [GitHub 的效能測試](https://github.com/Shirajuki/js-game-rendering-benchmark)，Babylon.js 的效能甚至超越了專門的 2D 引擎。

---

## 實戰：5 分鐘做一個 Electron 遊戲原型

讓我們用 Phaser.js 做一個超簡單的範例：

### 步驟 1：初始化專案

```bash
mkdir my-electron-game
cd my-electron-game
npm init -y
npm install electron phaser --save
```

### 步驟 2：建立主程式

```javascript
// main.js
const { app, BrowserWindow } = require('electron')

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(createWindow)
```

### 步驟 3：建立遊戲

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>My Electron Game</title>
  <script src="node_modules/phaser/dist/phaser.min.js"></script>
</head>
<body>
  <script>
    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 300 } }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    }

    const game = new Phaser.Game(config)

    function preload() {
      // 載入資源
    }

    function create() {
      // 建立遊戲物件
      this.add.text(400, 300, 'Hello Electron Game!', {
        fontSize: '32px',
        fill: '#fff'
      }).setOrigin(0.5)
    }

    function update() {
      // 遊戲迴圈
    }
  </script>
</body>
</html>
```

### 步驟 4：執行

```bash
npx electron .
```

**恭喜！你剛剛做出了一個跨平台的遊戲原型**。

想要打包成可執行檔？

```bash
npm install electron-builder --save-dev
npx electron-builder --win --mac --linux
```

---

## Electron 遊戲開發的限制與適用場景

### ✅ 適合的遊戲類型

- **2D 遊戲**：平台跳躍、射擊、解謎、策略、卡牌、RPG
- **輕量 3D 遊戲**：低多邊形風格、體素遊戲、簡單 3D 場景
- **獨立遊戲**：實驗性玩法、視覺小說、互動故事
- **休閒遊戲**：三消、益智、文字遊戲
- **桌遊數位版**：西洋棋、撲克、大富翁

### ❌ 不適合的遊戲類型

- **AAA 級 3D 遊戲**：需要極致畫面和複雜光影效果
- **高效能動作遊戲**：需要穩定 144 FPS 的競技遊戲
- **大型開放世界**：需要串流載入和複雜場景管理
- **VR/AR 遊戲**：需要低延遲和專門的 API 支援

**簡單來說**：如果你的遊戲在瀏覽器裡能流暢運行，那用 Electron 打包成桌面版就沒問題。

---

## WebGPU：未來的效能革命

如果你覺得 WebGL 還不夠快，好消息是 **WebGPU** 在 2025 年已經成熟。根據 [HTML5 Game Development Trends 2025](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)：

> WebGPU 提供了低階的圖形硬體存取，效能顯著超越 WebGL。

這意味著未來的 Electron 遊戲可以接近原生遊戲的效能，甚至可以開發更複雜的 3D 遊戲。

---

## 真實世界的成功故事

### 📊 市場接受度

根據 [LogRocket 的 2025 年報告](https://blog.logrocket.com/top-6-javascript-and-html5-game-engines/)：
- 主要遊戲發行商已經建立專門的 HTML5 部門
- HTML5 遊戲能觸及不需要下載的廣大用戶群
- Electron 打包讓這些遊戲能進入 Steam、Epic Games Store

---

## 結語：降低門檻，讓創意飛翔

Electron 遊戲開發的核心價值不是「取代 Unity」，而是**降低遊戲開發的門檻**。

如果你是：
- 網頁開發者想要試試遊戲開發
- 獨立開發者想要快速做出原型
- 小團隊需要跨平台但預算有限
- 想做實驗性或藝術性遊戲的創作者

**Electron + WebGL 可能是你最好的選擇**。

你不需要成為圖形程式設計專家，不需要理解 GPU 管線，不需要處理平台特定的編譯問題。**你只需要一個好點子、基本的 JavaScript 知識，和願意嘗試的心**。

記住：《Minecraft》最初也只是一個簡單的 Java 程式，《Stardew Valley》是一個人用 C# 做出來的，《Undertale》用的是 GameMaker Studio。**工具不是重點，創意才是**。

如果 Electron 能讓你更快地把創意變成現實，那就是對的工具。

---

## 延伸閱讀

- [Phaser 官方文件](https://phaser.io/learn)
- [PixiJS 教學](https://pixijs.com/guides)
- [Three.js 範例](https://threejs.org/examples/)
- [Babylon.js 遊戲開發指南](https://doc.babylonjs.com/)
- [Electron 官方文件](https://www.electronjs.org/docs/latest/)
- [Publishing Web Games on Steam with Electron - 完整教學](https://gamedevjs.com/tutorials/publishing-web-games-on-steam-with-electron/)
- [HTML5 Game Development: Trends and Tools for 2025](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)
- [JavaScript Game Rendering Benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)
