# Gorden Ting - 個人作品集部落格 🎮

這是一個採用 RPG 遊戲風格設計的個人技術部落格，展示全端開發者的技能與經歷。

## 🎯 特色功能

- **RPG 風格介面**: 完整的角色狀態系統，包含等級、HP/MP/EXP 條
- **技能樹系統**: 互動式技能樹展示技術能力
- **多功能 Tab**: 10個不同面板展示個人資訊
- **像素風格設計**: 支援像素化頭像顯示
- **響應式設計**: 支援桌面、平板、手機設備

## 📁 專案結構

```
my-portfolio-blog/
├── _config.yml          # Jekyll 配置
├── _layouts/            # 頁面模板
├── _posts/              # 部落格文章
├── assets/
│   ├── css/
│   │   └── main.css     # 主要樣式文件
│   ├── js/
│   │   ├── main.js      # 主要 JavaScript
│   │   ├── skill-tree.js # 技能樹系統
│   │   └── advanced-animations.js # 進階動畫
│   └── images/
│       └── avatar.png   # 個人頭像 (像素風格)
└── index.html           # 首頁
```

## 🖼️ 頭像設置

請將您的像素風格頭像保存為 `assets/images/avatar.png`：

1. 建議尺寸：512x512 像素或更大
2. 格式：JPG 或 PNG
3. 風格：像素藝術風格（如 8-bit、16-bit 遊戲角色）
4. 系統會自動應用像素化濾鏡和發光效果

## 🚀 本地開發

1. 安裝 Jekyll:
   ```bash
   gem install jekyll bundler
   ```

2. 安裝依賴:
   ```bash
   bundle install
   ```

3. 啟動開發伺服器:
   ```bash
   bundle exec jekyll serve
   ```

4. 開啟瀏覽器訪問: http://localhost:4000

## 🎮 RPG 介面功能

### 角色狀態面板
- 顯示開發者等級和經驗值
- HP: 工作熱忱與精力
- MP: 創意與學習能力
- EXP: 累積的技術經驗

### 技能樹系統
- **前端技術**: React, Vue.js, HTML5, CSS3
- **後端技術**: Node.js, Python, API 開發
- **DevOps**: Docker, Kubernetes, CI/CD
- **行動開發**: React Native, Flutter
- **個人技能**: 專案管理、技術寫作、教學

### 10 個功能面板
1. 🗡️ 角色狀態 - 屬性點數與開發者數據
2. 🎨 技能 - 互動式技能樹
3. 📖 背景故事 - 個人簡介與職涯歷程
4. 🎒 物品欄 - 開發工具與裝備
5. ⚡ 任務 - 進行中的專案與目標
6. 🏆 成就 - 獲得的獎項與認證
7. 👥 夥伴 - 合作過的團隊成員
8. 🗺️ 地圖 - 探索過的技術領域
9. ⭐ 聲望 - 在各技術社群的貢獻度
10. 📝 日誌 - 部落格文章與技術分享

## 🔧 自訂設定

### 修改個人資訊
編輯 `index.html` 中的以下區段：
- 角色名稱: `.player-name`
- 職業稱號: `.player-title`
- 等級: `.level-badge`
- 資源條數值: `.bar-fill` 的 `width` 屬性

### 社群連結
在 `_config.yml` 中更新社群媒體連結：
```yaml
github_username: your-username
linkedin_url: https://linkedin.com/in/your-profile
medium_url: https://medium.com/@your-profile
facebook_url: https://facebook.com/your-profile
```

## 📱 響應式設計

- **桌面版**: 完整的 RPG 介面體驗
- **平板版**: 調整版面配置，保持核心功能
- **手機版**: 簡化 Tab 標籤，優化觸控體驗

## 🎨 主題色彩

- **主色調**: 金色 (#ffd700) - 代表成就與價值
- **背景**: 深藍漸層 - 營造科技感與深度
- **強調色**: 藍紫色漸層 - 增加視覺層次

## 🔮 技術特色

- **純 CSS 動畫**: 無需額外 JavaScript 框架
- **Canvas 技能樹**: 自繪製的互動式技能節點
- **像素化效果**: CSS 濾鏡實現復古遊戲風格
- **發光特效**: 多層陰影營造霓虹光效
- **流暢過渡**: 所有交互都有平滑動畫效果

---

🚀 **開始你的 RPG 開發者之旅！** 🎮