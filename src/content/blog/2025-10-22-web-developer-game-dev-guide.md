---
layout: post
title: "網頁工程師做遊戲？你已經會 80% 了"
date: 2025-10-22
categories: [技術, 遊戲開發]
tags: [遊戲開發, WebGL, WebGPU, JavaScript, Electron, 網頁開發]
description: "給網頁工程師的遊戲開發指南：用你既有的 HTML/CSS/JavaScript 技能，10 分鐘做出第一款遊戲"
author: "Galen"
---

# 網頁工程師做遊戲？你已經會 80% 了

如果你是網頁工程師,可能偶爾會萌生「做個遊戲」的念頭。也許是在玩某款獨立遊戲時想著「這個我也做得出來吧?」,也許是看到朋友用 Unity 做了個小遊戲覺得很酷,也許只是單純想試試看不一樣的開發領域。

然後你打開 Unity 或 Unreal Engine 的教學,**看到滿滿的 C#、C++、複雜的場景編輯器、一堆專有名詞**,心想:「算了,我還是回去寫網頁好了。」

但如果我告訴你:**你已經會的 HTML、CSS、JavaScript,就能直接拿來做遊戲了呢?**

而且不是玩具級別的小遊戲,是可以發布到 Steam、能賺錢、有數百萬玩家在玩的那種遊戲。

---

## 為什麼網頁工程師特別適合做遊戲?

### 1. 你的技能直接轉換

還記得你學網頁開發時,花多久才搞懂 HTML、CSS、JavaScript、DOM 操作、事件監聽、非同步處理這一整套?**這些技能在遊戲開發中完全適用**。

| 你已經會的技能 | 在遊戲開發中的應用 | 學習成本 |
|--------------|-----------------|---------|
| HTML/CSS | 遊戲 UI/HUD 設計 | 0% |
| JavaScript | 遊戲邏輯、關卡腳本 | 0% |
| DOM 操作 | 場景物件管理 | 5% |
| CSS 動畫 | 角色動畫、過場效果 | 10% |
| Canvas API | 2D 遊戲繪製 | 20% |
| 事件監聽 | 玩家輸入處理 | 0% |
| Fetch API | 遊戲資源載入 | 0% |
| LocalStorage | 遊戲存檔系統 | 0% |
| 響應式設計 | 多解析度支援 | 5% |

**平均學習成本: 4%**。沒錯,你已經會 96% 了。

### 2. 開發速度飛快

使用 JavaScript 遊戲引擎開發**明顯更快**。原因很簡單:

- **不用編譯**:改個變數立刻看到效果
- **Chrome DevTools**:你早就熟悉的除錯工具
- **熱重載**:存檔就更新,不用重啟遊戲
- **npm 生態系**:需要什麼功能,npm install 就有
- **零學習曲線**:不用學新的 IDE 或場景編輯器

想做個俄羅斯方塊?用 [Phaser.js](https://phaser.io/) 可能幾小時就能做出原型。想做個卡牌遊戲?HTML/CSS 的排版能力遠超傳統遊戲引擎的 UI 系統。

根據 [LogRocket 的 2025 年調查](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/),JavaScript 遊戲引擎因為「零編譯時間」和「即時預覽」,大幅縮短了開發迭代週期。

### 3. 一次開發,到處執行（真的）

用 Electron 打包你的 HTML5 遊戲,一個指令就能產生:

```bash
npm run build

# 產生結果:
# dist/MyGame-1.0.0.exe         (Windows)
# dist/MyGame-1.0.0.dmg         (macOS)
# dist/MyGame-1.0.0.AppImage    (Linux)
```

**不用處理平台差異、不用學三套 API、不用擔心相容性問題**。Chromium 引擎幫你搞定一切。

---

## WebGL vs WebGPU:該選哪個?

### WebGL:穩定成熟的老兵

[WebGL](https://www.khronos.org/webgl/) 是基於 OpenGL ES 2.0/3.0 的瀏覽器圖形 API,從 2011 年就存在了。

**優勢:**
- ✅ **超高相容性**:幾乎所有主流瀏覽器都支援（WebGL 1.0 接近 100%,WebGL 2.0 達 92% - [來源](https://www.lambdatest.com/web-technologies/webgl2)）
- ✅ **成熟的生態系**:無數教學、範例、遊戲引擎
- ✅ **學習資源豐富**:遇到問題 Google 一下就有答案
- ✅ **效能足夠**:大部分 2D 遊戲和輕量 3D 遊戲完全夠用

**劣勢:**
- ❌ 效能受限於設計時代（2011 年的技術）
- ❌ 不支援 compute shaders（無法做複雜的物理運算和 AI）
- ❌ GPU 記憶體控制較間接

### WebGPU:新時代的火箭

[WebGPU](https://www.w3.org/TR/webgpu/) 是 2025 年剛成熟的次世代圖形 API,基於 Vulkan、Metal、DirectX 12 的設計。

**驚人的效能提升:**

根據 [Markaicode 的測試](https://markaicode.com/webgpu-replaces-webgl-performance-boost/),WebGPU 在複雜 3D 場景中比 WebGL **快 1000%**（沒錯,是 10 倍）。[IEEE 的研究](https://ieeexplore.ieee.org/document/10585437/)也證實 WebGPU 在 Godot 引擎中的 CPU 和 GPU 幀時間都更快。

**優勢:**
- ✅ **極致效能**:直接訪問 GPU 資源,減少開銷
- ✅ **Compute Shaders**:可做複雜的物理模擬、AI 計算、粒子系統
- ✅ **更精細的控制**:直接管理 GPU 記憶體和緩衝區
- ✅ **未來趨勢**:各大引擎都在遷移到 WebGPU

**劣勢:**
- ❌ 瀏覽器支援還在普及中（2025 年主流瀏覽器已支援）
- ❌ 學習曲線稍陡（更低階的 API）
- ❌ 教學資源相對少

### 我該選哪個?

| 如果你想做... | 推薦選擇 | 原因 |
|------------|---------|-----|
| 2D 平台遊戲、解謎遊戲 | WebGL | 效能足夠,相容性高 |
| 卡牌、棋類、文字遊戲 | WebGL | 甚至不需要 3D 圖形 |
| 輕量 3D 冒險遊戲 | WebGL | 成熟的引擎支援 |
| 複雜 3D 遊戲、開放世界 | WebGPU | 效能優勢明顯 |
| 需要物理模擬的遊戲 | WebGPU | Compute shaders 加速 |
| 想學最新技術 | WebGPU | 未來 3-5 年的主流 |

**新手建議:先用 WebGL 做第一款遊戲,熟悉遊戲開發流程後再考慮 WebGPU。**

---

## 遊戲引擎選擇:不用重新發明輪子

### 🎮 Phaser.js - 2D 遊戲之王

- **官網**:[phaser.io](https://phaser.io/)
- **適合**:平台跳躍、射擊、解謎、卡牌、RPG
- **特色**:物理引擎內建、動畫系統完整、超多範例
- **學習曲線**:★☆☆☆☆（超簡單）

```javascript
// 10 行程式碼做一個彈跳球
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: { default: 'arcade' },
  scene: { create: create }
}

function create() {
  const ball = this.add.circle(400, 300, 20, 0xff0000)
  this.physics.add.existing(ball)
  ball.body.setBounce(1).setVelocity(200, 300)
}

new Phaser.Game(config)
```

### 🚀 PixiJS - 高效能 2D 引擎

- **官網**:[pixijs.com](https://pixijs.com/)
- **適合**:視覺效果豐富的遊戲、粒子系統、大量精靈
- **特色**:WebGL 加速、記憶體管理優秀、效能極致
- **學習曲線**:★★☆☆☆（中等）

### 🌐 Three.js - 3D 入門首選

- **官網**:[threejs.org](https://threejs.org/)
- **適合**:3D 冒險、第一人稱、體素遊戲
- **特色**:輕量級、範例超多、社群龐大
- **學習曲線**:★★★☆☆（中等偏易）

### 🎨 Babylon.js - 完整 3D 引擎

- **官網**:[babylonjs.com](https://www.babylonjs.com/)
- **適合**:複雜 3D 遊戲、物理引擎、VR/AR
- **特色**:功能完整、效能優異、支援 WebGPU
- **學習曲線**:★★★★☆（較複雜但功能強）

---

## 10 分鐘實戰:你的第一款遊戲

讓我們用 Phaser.js + Electron 做一個完整的遊戲原型:

### 步驟 1:初始化專案

```bash
mkdir my-first-game
cd my-first-game
npm init -y
npm install electron phaser --save
```

### 步驟 2:主程式（main.js）

```javascript
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

### 步驟 3:遊戲程式（game.js）

```javascript
// 一個簡單的接球遊戲
class GameScene extends Phaser.Scene {
  create() {
    // 玩家板子
    this.paddle = this.add.rectangle(400, 550, 100, 20, 0xffd700)
    this.physics.add.existing(this.paddle)
    this.paddle.body.setImmovable(true)

    // 球
    this.ball = this.add.circle(400, 300, 10, 0xff6b6b)
    this.physics.add.existing(this.ball)
    this.ball.body.setBounce(1).setVelocity(200, 300)

    // 碰撞檢測
    this.physics.add.collider(this.ball, this.paddle)

    // 滑鼠控制
    this.input.on('pointermove', (pointer) => {
      this.paddle.x = pointer.x
    })

    // 分數
    this.score = 0
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '24px',
      fill: '#fff'
    })
  }

  update() {
    // 球掉出畫面就重置
    if (this.ball.y > 600) {
      this.ball.setPosition(400, 300)
      this.ball.setVelocity(200, 300)
    }
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 } }
  },
  scene: GameScene
}

new Phaser.Game(config)
```

### 步驟 4:HTML 檔案（index.html）

```html
<!DOCTYPE html>
<html>
<head>
  <title>我的第一款遊戲</title>
  <script src="node_modules/phaser/dist/phaser.min.js"></script>
</head>
<body>
  <script src="game.js"></script>
</body>
</html>
```

### 步驟 5:執行

```bash
npx electron .
```

**恭喜!你剛剛做出了一款完整的遊戲原型。**（實際時間會因熟悉度而異,但整個流程確實可以在 10-30 分鐘內完成）

想打包成可執行檔發給朋友玩?

```bash
npm install electron-builder --save-dev
npx electron-builder --win --mac --linux
```

---

## 真實案例:這條路真的可行

### 市場規模驚人

根據多家市場研究機構的報告（[Meta Stat Insight](https://www.metastatinsight.com/report/html5-games-market)、[Business Research Insights](https://www.businessresearchinsights.com/market-reports/html5-games-market-122374)）,HTML5 遊戲市場正在**快速成長**:

- 市場規模估計從 **10-20 億美元起跳**（保守估計）
- **年複合成長率（CAGR）達 7-17%**
- 預計 2030 年將達到 **數十億美元規模**

不同研究機構的具體數字有差異,但共識是:**這是一個快速成長、前景看好的市場**。

### 你已經知道的成功案例

這些純 HTML5/JavaScript 遊戲你一定聽過:

- **[Slither.io](http://slither.io/)**:最高同時在線 **50 萬玩家**,開發者 Steven Howse 用純 JavaScript 開發（[來源](https://dev.to/gamh5games/the-rise-of-html5-games-how-browser-gaming-is-evolving-in-2025-35dm)）
- **[Agar.io](http://agar.io/)**:19 歲巴西開發者 Matheus Valadares 用 JavaScript + C++ 做的,只在 4chan 發了一篇貼文宣傳,就達到**每天 500 萬玩家**（[來源](https://en.wikipedia.org/wiki/Agar.io)）
- **[2048](https://play2048.co/)**:19 歲義大利開發者 Gabriele Cirulli **週末做的小遊戲**,發布後一週內就有 **400 萬訪客**（[來源](https://en.wikipedia.org/wiki/2048_(video_game))）
- **The Supernatural Power Troll**:獨立開發者用 Phaser.js + Electron 發布到 [Steam](https://store.steampowered.com/),證明 HTML5 遊戲可以商業化

這些遊戲的共通點:**都是用你已經會的技術做的**。

而且根據 [HTML5 遊戲開發趨勢報告](https://dev.to/gamh5games/the-rise-of-html5-games-how-browser-gaming-is-evolving-in-2025-35dm),主要遊戲發行商已經建立專門的 HTML5 部門,認可這項技術的潛力。

---

## 結語:開始你的遊戲開發之旅

如果你是網頁工程師,做遊戲的門檻比你想像的低太多了:

- ✅ **技能直接轉換**:HTML/CSS/JavaScript 就能做
- ✅ **開發速度快**:改程式碼立刻看效果
- ✅ **跨平台支援**:一次開發,三平台執行
- ✅ **市場潛力大**:快速成長的遊戲市場（年複合成長率 7-17%）
- ✅ **成功案例多**:從獨立開發到商業成功都有

你不需要學 C++、不需要學 Unity、不需要理解複雜的場景編輯器。**你只需要用你已經會的技能,加上一點遊戲開發的知識,就能做出真正的遊戲**。

記住:[Minecraft](https://www.minecraft.net/) 最初只是一個人用 Java 做的小專案,[Stardew Valley](https://www.stardewvalley.net/) 是一個人用 C# 做了四年,[Undertale](https://undertale.com/) 用的是 GameMaker Studio。

**工具不是重點,創意才是**。

如果你心中有個遊戲的點子,**今天就開始做吧**。10 分鐘後,你就能看到你的第一款遊戲在螢幕上運行了。

---

## 延伸閱讀

- [Phaser 官方教學](https://phaser.io/learn)
- [PixiJS 完整指南](https://pixijs.com/guides)
- [Three.js 互動範例](https://threejs.org/examples/)
- [Babylon.js 遊戲開發文件](https://doc.babylonjs.com/)
- [HTML5 Game Development Trends 2025](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)
- [Best JavaScript Game Engines 2025](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)
- [WebGPU vs WebGL Performance](https://markaicode.com/webgpu-replaces-webgl-performance-boost/)
- [Electron 官方文件](https://www.electronjs.org/docs/latest/)
