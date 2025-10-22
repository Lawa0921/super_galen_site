---
layout: post
title: "網頁工程師的隱藏技能：用 HTML/CSS/JavaScript 就能開發 APP 遊戲"
date: 2025-10-22
categories: [技術, 遊戲開發]
tags: [HTML5, JavaScript, Phaser, Capacitor, PWA, 跨平台開發, 遊戲開發]
description: "發現網頁開發技能的新邊界：用你已經會的 HTML/CSS/JavaScript，不只能做網站，還能開發手機 APP 遊戲並上架到 App Store"
author: "Galen"
---

# 網頁工程師的隱藏技能：用 HTML/CSS/JavaScript 就能開發 APP 遊戲

如果你是網頁工程師，可能聽過這種對話：

「我想做個手機遊戲，你會嗎？」
「呃...我只會寫網頁耶，遊戲要用 Unity 或 Unreal 吧？」
「喔，那算了...」

然後你心裡想：**「明明我的 JavaScript 寫得很溜，為什麼做遊戲就要從頭學 C# 或 C++？」**

更慘的是，當你興沖沖地下載 Unity，結果發現：
- 學習曲線超級陡峭
- 介面複雜到讓人頭暈
- 打包設定像在解謎遊戲
- 光是讓遊戲在 iOS 和 Android 上都能跑就花了三天

但如果我告訴你，**你已經會的 HTML、CSS、JavaScript 技能，其實可以直接拿來開發手機 APP 遊戲，甚至上架到 App Store 和 Google Play**，你會不會想試試看？

這不是科幻小說，而是 2025 年的現實。

---

## 等等，網頁技術能做遊戲？我沒聽錯吧？

沒錯，而且不是什麼新鮮事。你玩過的那些 HTML5 小遊戲（像是風靡一時的 [2048](https://play2048.co/)、多人對戰的 [Slither.io](http://slither.io/)、還有 [Agar.io](https://agar.io/)）其實都是用網頁技術做的。

**但這些都只能在瀏覽器玩啊？**

過去是這樣沒錯。但現在有幾個魔法工具，可以把你的 HTML5 遊戲**打包成真正的手機 APP**，讓使用者從 App Store 下載、安裝、離線玩，甚至整合推播通知、內購、廣告等功能。

這些工具包括：
- **[Capacitor](https://capacitorjs.com/)**：由 Ionic 團隊開發的跨平台 runtime
- **PWA（漸進式網頁應用）**：直接把網頁「安裝」到手機
- **[Phaser](https://phaser.io/)**：最流行的 HTML5 遊戲引擎

根據 [2025 年 HTML5 遊戲開發趨勢報告](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)，**Phaser 在 HTML5 遊戲工作室中擁有超過 65% 的市場佔有率**，而且 Phaser 5 已經支援最新的 WebGPU 加速技術。

---

## 真實案例：用網頁技術做的遊戲真的能上架嗎？

### 案例 1：2048 的病毒式傳播

還記得那個讓全世界上癮的數字拼圖遊戲 [2048](https://2048game.com/) 嗎？它的 PWA 版本在**上線不到一週就吸引了超過 400 萬用戶**，而且完全支援離線遊玩。

關鍵是：這個遊戲的核心就是 HTML + CSS + JavaScript。沒有 Unity，沒有 C++，只有你熟悉的網頁技術。

### 案例 2：Phaser 官方的 App Store 部署教學

如果你還懷疑「HTML5 遊戲能不能上架」，看看 [Phaser 官方在 2024 年 9 月發布的最新教學](https://phaser.io/news/2024/09/new-tutorial-deploying-phaser-games-to-mobile-with-capacitor)：**如何把 Phaser 遊戲部署到 iOS 和 Android App Store**。

教學內容包括：
- 如何用 Capacitor 把 HTML5 遊戲打包成原生 APP
- 如何設定觸控操作和行動裝置適配
- 如何處理 App Store 的提交流程
- 如何整合 AdMob 廣告來變現

**這不是理論，而是有官方教學的實戰技能**。

### 案例 3：Instant Games 平台的崛起

Google 和 Facebook 都推出了 **Instant Games** 平台，讓開發者用 HTML5 技術開發休閒遊戲。根據 [HTML5 遊戲開發趨勢分析](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)，這類即時遊戲正在快速成長，因為玩家**不需要下載就能立刻玩**。

---

## 技術選擇：該用哪些工具？

如果你決定踏入這個領域，以下是 2025 年最主流的技術組合：

### 🎮 遊戲引擎選擇

#### Phaser - 2D 遊戲的王者

- **官網**：https://phaser.io/
- **適合**：2D 平台遊戲、射擊遊戲、解謎遊戲、卡牌遊戲
- **市場佔有率**：65% 的 HTML5 遊戲工作室都在用
- **2025 更新**：[Phaser 5 預計在 2025 年底發布](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)，將支援 WebGPU、ECS 架構、更小的檔案體積

**為什麼選 Phaser？**
- 內建物理引擎（Arcade Physics、Matter.js）
- 完整的動畫系統
- 豐富的範例和社群支援
- 同時支援 WebGL 和 Canvas（自動回退）

#### PixiJS - 最快的 2D 渲染引擎

- **官網**：https://pixijs.com/
- **適合**：需要高效能圖形的遊戲、粒子效果豐富的應用
- **特色**：WebGL 加速、自動批次處理、記憶體管理優秀

如果你的遊戲需要同時顯示成千上萬個物件（例如粒子效果、大量敵人），PixiJS 的效能表現會讓你驚艷。

#### BabylonJS - 3D 遊戲的最佳選擇

- **官網**：https://www.babylonjs.com/
- **適合**：3D 冒險遊戲、視覺化應用、需要 VR/AR 支援的遊戲
- **2025 優勢**：根據 [LogRocket 的報告](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)，**BabylonJS 已經成為網頁 3D 遊戲的主流引擎**，擁有視覺化腳本工具、節點式材質編輯器

#### Construct - 無程式碼選項

- **官網**：https://www.construct.net/
- **適合**：快速原型製作、教學用途、不想寫程式碼的設計師
- **特色**：完全視覺化編輯器、支援匯出到 HTML5、Android、iOS、桌面

---

### 📱 打包與部署選擇

#### Capacitor - 現代化的跨平台 Runtime

[Capacitor](https://capacitorjs.com/) 是由 Ionic 團隊開發的開源工具，可以把你的 HTML5 遊戲打包成：
- iOS APP
- Android APP
- Progressive Web App (PWA)
- Electron 桌面應用

**與 Cordova 的差異**：
- Capacitor 的架構更現代化
- 更好的原生 API 支援
- 更容易整合現代前端框架（React、Vue、Angular）

**實際使用**：
```bash
# 安裝 Capacitor
npm install @capacitor/core @capacitor/cli

# 初始化專案
npx cap init

# 加入平台
npx cap add ios
npx cap add android

# 同步專案
npx cap sync

# 開啟原生 IDE
npx cap open ios     # 開啟 Xcode
npx cap open android # 開啟 Android Studio
```

根據 [Phaser 官方教學](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor)，整個流程可以在**一個下午完成**。

#### PWA - 最簡單的部署方式

如果你不想處理 App Store 的審核流程，PWA 是最快的選擇：
- 使用者可以直接「安裝」到手機主畫面
- 支援離線遊玩
- 自動更新（不需要 App Store 審核）
- 跨平台（Android、iOS、桌面都能用）

根據 [2025 年 PWA 趨勢報告](https://arramton.com/blogs/how-to-develop-progressive-web-apps)，**2025 年的 PWA 改進包括更好的檔案系統存取、HTTP/3 支援、更深入的作業系統整合**。

---

## 為什麼網頁工程師該學這個？重複利用技能的威力

### ✅ 優勢 1：零學習成本，立刻開工

如果你已經會 JavaScript：
- **不需要學新語言**：沒有 C#、C++、GDScript
- **用你熟悉的工具**：VS Code、Chrome DevTools、npm
- **豐富的生態系**：npm 上有超過 350 萬個套件
- **即時預覽**：改程式碼立刻看效果，不用等編譯

想像一下：你上午還在寫 React 網頁，下午就能用同樣的 JavaScript 技能做遊戲。**技能的可遷移性極高**。

### ✅ 優勢 2：真正的一次開發，到處執行

用 Unity 開發遊戲時，雖然號稱跨平台，但實際上：
- iOS 版本要用 Xcode 編譯
- Android 版本要處理不同裝置的相容性
- 網頁版本要處理 WebGL 支援問題

**用 Capacitor + HTML5？寫一次程式碼，直接跑在所有平台**。

```bash
# 一個指令，產生所有平台的版本
npx cap sync

# 結果：
# - iOS APP（可上架 App Store）
# - Android APP（可上架 Google Play）
# - PWA（可直接部署到網頁）
```

### ✅ 優勢 3：快速驗證創意

獨立遊戲開發最大的風險是：**花了三個月做出遊戲，結果沒人想玩**。

用 HTML5 技術的優勢：
- **快速做出原型**：Phaser 有豐富的範例，改改就能用
- **立刻測試**：丟個連結給朋友，不用他們下載 APP
- **快速迭代**：改程式碼立刻生效，不用重新編譯打包

根據 [Phaser 開發者的經驗分享](https://pandaqi.com/blog/reviews-and-thoughts/my-thoughts-on-phaser-3-engine/)，用 Phaser 做一個俄羅斯方塊原型**可能只需要 2 小時**。

### ✅ 優勢 4：UI 開發的絕對優勢

如果你要做的是卡牌遊戲、文字冒險、策略遊戲等 UI 複雜的遊戲，**HTML/CSS 的排版能力遠超傳統遊戲引擎**。

```css
/* 用 Flexbox 輕鬆做複雜排版 */
.card-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

/* 用 CSS Grid 做戰棋地圖 */
.game-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

/* 用 CSS 動畫做特效 */
.card:hover {
  transform: scale(1.1) rotate(5deg);
  transition: transform 0.3s ease;
}
```

在 Unity 裡做同樣的效果？你可能要花好幾個小時研究 UI Toolkit 或 UGUI。

---

## 實戰：30 分鐘做一個能上架的遊戲原型

讓我們用 Phaser + Capacitor 做一個超簡單的範例，證明這條路確實可行。

### 步驟 1：初始化專案

```bash
# 建立資料夾
mkdir my-html5-game
cd my-html5-game

# 初始化 npm 專案
npm init -y

# 安裝依賴
npm install phaser @capacitor/core @capacitor/cli
```

### 步驟 2：建立遊戲

建立 `index.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My HTML5 Game</title>
  <script src="node_modules/phaser/dist/phaser.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
    }
  </style>
</head>
<body>
  <script src="game.js"></script>
</body>
</html>
```

建立 `game.js`：

```javascript
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

function preload() {
  // 這裡載入遊戲資源
}

function create() {
  // 建立遊戲物件
  this.add.text(400, 300, 'Hello HTML5 Game!', {
    fontSize: '48px',
    fill: '#fff'
  }).setOrigin(0.5);

  // 加入簡單的互動
  this.input.on('pointerdown', () => {
    this.add.circle(
      Phaser.Math.Between(0, 800),
      0,
      20,
      Phaser.Display.Color.RandomRGB().color
    ).setInteractive();
  });
}

function update() {
  // 遊戲迴圈
}
```

### 步驟 3：測試遊戲

```bash
# 用任何 HTTP server 測試
npx http-server .
```

打開瀏覽器訪問 `http://localhost:8080`，點擊畫面就會出現彩色圓球掉落。

### 步驟 4：打包成手機 APP

```bash
# 初始化 Capacitor
npx cap init "MyGame" "com.example.mygame"

# 建立 www 資料夾並複製檔案
mkdir www
cp index.html game.js www/
cp -r node_modules www/

# 加入平台
npx cap add ios
npx cap add android

# 同步
npx cap sync

# 開啟原生 IDE
npx cap open ios     # macOS 上開啟 Xcode
npx cap open android # 開啟 Android Studio
```

**恭喜！你剛剛用 30 分鐘做出了一個可以上架到 App Store 的遊戲原型**。

詳細的上架流程可以參考 [Phaser 官方的完整教學](https://phaser.io/news/2024/09/new-tutorial-deploying-phaser-games-to-mobile-with-capacitor)。

---

## HTML5 遊戲開發的限制與適用場景

### ✅ 適合的遊戲類型

- **2D 休閒遊戲**：解謎、三消、平台跳躍、射擊
- **卡牌遊戲**：集換式卡牌、撲克、桌遊數位版
- **策略遊戲**：回合制戰棋、塔防、經營模擬
- **文字冒險**：視覺小說、互動故事、RPG
- **輕量 3D 遊戲**：低多邊形風格、簡單 3D 場景

根據 [HTML5 遊戲引擎比較](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)，如果你的遊戲**在瀏覽器裡能流暢運行 60 FPS，那打包成 APP 就沒問題**。

### ❌ 不適合的遊戲類型

- **重度 3D 遊戲**：需要複雜光影效果、大型開放世界
- **高競技性遊戲**：需要穩定 144 FPS 的電競遊戲
- **VR/AR 遊戲**：需要低延遲和專門的原生 API
- **大型多人線上遊戲**：需要複雜的後端架構（但這跟前端技術無關）

**重點**：HTML5 技術的限制主要在**圖形複雜度**，而不是遊戲類型。如果你的遊戲重視**玩法創意**而非**畫面炫麗**，HTML5 是完美選擇。

---

## WebGPU：未來的效能革命

如果你覺得 WebGL 的效能還不夠，好消息是 **WebGPU 在 2025 年已經成熟**。

根據 [HTML5 遊戲開發趨勢報告](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)：

> WebGPU 提供了低階的圖形硬體存取，效能顯著超越 WebGL。Phaser 5 已經支援 WebGPU 加速。

這意味著：
- **更高的 FPS**：複雜場景也能維持 60 FPS
- **更複雜的視覺效果**：粒子系統、光影效果、後處理
- **接近原生遊戲的效能**：與 Unity 的效能差距正在縮小

根據 [LogRocket 的效能分析](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)，**JavaScript 引擎的效能已經接近原生水準**，最新的 V8 和 SpiderMonkey 實作提供了近乎原生的執行速度。

---

## 實際上線：從原型到發布

### 變現選項

用 HTML5 技術做遊戲，一樣可以賺錢：

1. **廣告收益**：整合 [AdMob](https://admob.google.com/)（參考 [Pandaqi 的教學](https://pandaqi.com/blog/tutorials/deploy-phaser-game-for-mobile/)）
2. **內購**：透過 Capacitor 的 [In-App Purchase 插件](https://capacitorjs.com/docs/plugins)
3. **付費下載**：在 App Store 設定價格
4. **訂閱制**：整合訂閱管理

### 發布管道

- **App Store**：iOS 使用者，市場較小但付費意願高
- **Google Play**：Android 使用者，市場龐大
- **PWA 直接部署**：觸及不想下載 APP 的使用者
- **Facebook Instant Games**：不需下載就能玩
- **網頁遊戲平台**：[Itch.io](https://itch.io/)、[Newgrounds](https://www.newgrounds.com/)

根據 [LogRocket 的 2025 年報告](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)：
> 主要遊戲發行商已經建立專門的 HTML5 部門，因為 HTML5 遊戲能觸及不需要下載的廣大用戶群。

---

## 結語：擴張你的技能邊界

如果你是網頁工程師，你可能從來沒想過：**你已經具備做遊戲的技能了**。

你不需要：
- 學習 Unity 的複雜介面
- 理解 C++ 的記憶體管理
- 處理平台特定的編譯問題
- 成為圖形程式設計專家

你只需要：
- 你已經會的 HTML/CSS/JavaScript
- 一個遊戲引擎（Phaser、PixiJS、BabylonJS）
- 一個打包工具（Capacitor、PWA）
- 一個好點子和願意嘗試的心

**工具不是重點，創意才是**。《Minecraft》最初也只是一個簡單的 Java 程式，《Stardew Valley》是一個人用 C# 做出來的，《Undertale》用的是 GameMaker Studio。

如果 HTML5 技術能讓你更快地把創意變成現實，那就是對的工具。

記住：**好的工程師不是會最多語言的人，而是能用現有技能創造最大價值的人**。你的 JavaScript 技能，不只能做網站，還能做遊戲、做桌面應用、做伺服器、做區塊鏈應用。

**技能的邊界，由你自己定義**。

---

## 延伸閱讀與資源

### 官方文件
- [Phaser 官方網站](https://phaser.io/)
- [Phaser 學習資源](https://phaser.io/learn)
- [Capacitor 官方文件](https://capacitorjs.com/)
- [PixiJS 教學指南](https://pixijs.com/guides)
- [BabylonJS 遊戲開發指南](https://doc.babylonjs.com/)

### 實戰教學
- [Phaser + Capacitor 完整教學](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor)
- [部署 Phaser 遊戲到手機（含 AdMob）](https://pandaqi.com/blog/tutorials/deploy-phaser-game-for-mobile/)
- [用 Phaser 和 Capacitor 建立原生 HTML5 遊戲](https://www.joshmorony.com/create-native-html5-games-with-phaser-and-capacitor/)

### 技術趨勢與比較
- [HTML5 遊戲開發：2025 年趨勢與工具](https://medium.com/@playgama-dev/html5-game-development-trends-and-tools-for-2025-fe54af43ca70)
- [2025 年最佳 JavaScript 和 HTML5 遊戲引擎](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)
- [PWA 遊戲開發指南](https://meliorgames.com/game-development/pwa-game-development-how-to-create-a-progressive-web-game/)
- [漸進式網頁應用程式：2025 年完整指南](https://arramton.com/blogs/how-to-develop-progressive-web-apps)
