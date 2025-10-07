# 🚀 SEO 與社群分享優化指南

## 📊 已實現的功能

### 1. Open Graph Meta 標籤（Facebook、LinkedIn、Threads）
網站現在支援完整的 Open Graph 協議，當你分享連結到社群媒體時會顯示：

```html
<meta property="og:type" content="website">
<meta property="og:url" content="你的頁面網址">
<meta property="og:title" content="頁面標題 | SuperGalen's Dungeon">
<meta property="og:description" content="頁面描述">
<meta property="og:image" content="分享預覽圖片">
<meta property="og:site_name" content="SuperGalen's Dungeon">
<meta property="og:locale" content="zh_TW">
```

### 2. Twitter Card 標籤
Twitter/X 平台的分享卡片：

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="頁面標題">
<meta name="twitter:description" content="描述">
<meta name="twitter:image" content="預覽圖片">
<meta name="twitter:creator" content="@SuperGalen">
```

### 3. 結構化資料（JSON-LD）
Google 搜尋結果會顯示更豐富的資訊：

- 網站名稱和描述
- 作者資訊
- 社群連結
- 文章發布日期
- 關鍵字

### 4. SEO 優化
- ✅ Canonical URLs（避免重複內容）
- ✅ Meta Description
- ✅ 關鍵字標籤
- ✅ robots.txt
- ✅ Sitemap（自動生成）

---

## 🎨 圖片狀態與準備建議

### 目前圖片配置

**已存在的圖片：**
- ✅ `assets/images/site_icon.png` - 目前用作預設分享圖（臨時方案）
- ✅ `assets/images/avatar.png` - 作者頭像

**建議新增的圖片（可選）：**
1. **`assets/images/og-image.png`** - 專用預設分享圖片
   - 尺寸：1200 x 630 像素
   - 格式：PNG 或 JPG
   - 內容建議：網站 logo + 標語 + 視覺元素
   - 優先級：⭐⭐⭐ 高（顯著提升社群分享視覺效果）

2. **`assets/images/twitter-card.png`** - Twitter 專用分享圖片
   - 尺寸：1200 x 628 像素
   - 格式：PNG 或 JPG
   - 優先級：⭐⭐ 中（可與 og-image 共用）

### 部落格文章圖片
每篇文章可以有自己的分享圖片：

```markdown
---
title: "文章標題"
image: "/assets/images/posts/article-cover.png"
---
```

**注意**：如果文章未指定 `image`，會自動使用 `site_icon.png` 作為 fallback。

建議尺寸：1200 x 630 像素

---

## 📝 文章 Front Matter 完整範例

```yaml
---
layout: post
title: "你的文章標題"
date: 2025-10-06
categories: [技術, 專案]
tags: [Jekyll, Web3, Blockchain, 全端開發]
description: "這段描述會顯示在搜尋結果和社群分享預覽中（建議 150-160 字）"
image: "/assets/images/posts/your-article-cover.png"  # 可選，未指定則使用預設圖
author: "Galen"
---
```

---

## 🔍 如何測試社群分享效果

### Facebook/LinkedIn/Threads
1. 訪問 [Facebook 分享偵錯工具](https://developers.facebook.com/tools/debug/)
2. 輸入你的網址
3. 點擊「偵錯」查看預覽
4. 如果有快取問題，點擊「重新抓取」

### Twitter/X
1. 訪問 [Twitter Card Validator](https://cards-dev.twitter.com/validator)
2. 輸入你的網址
3. 查看預覽卡片

### Google 搜尋
1. 訪問 [Google Rich Results Test](https://search.google.com/test/rich-results)
2. 輸入你的網址
3. 查看結構化資料是否正確

---

## 🎯 當前設定

### 網站描述（_config.yml）
```yaml
description: >-
  全端工程師的 RPG 風格作品集 ⚔️ | 結合 Web3/區塊鏈的互動式履歷體驗 |
  探索技能樹、完成任務、收集成就 | Ruby on Rails × Phoenix × Solidity
tagline: "在代碼與冒險之間，找到屬於開發者的故事"
```

### SEO 關鍵字
- 全端工程師
- Web3開發
- 區塊鏈
- Ruby on Rails
- Phoenix
- Elixir
- Solidity
- JavaScript
- 作品集
- Portfolio
- 互動式履歷

---

## 💡 優化建議

### 1. 圖片優化技巧
- 使用高對比度的配色（在小縮圖中更清晰）
- 加入網站 Logo 增加品牌識別度
- 文字不要太小（在手機上要能閱讀）
- 避免純文字，加入視覺元素

### 2. 描述撰寫技巧
- 前 150 字最重要（會顯示在搜尋結果）
- 使用行動呼籲（如：探索、了解、查看）
- 包含關鍵字但要自然
- 避免重複標題內容

### 3. 標題優化
- 保持在 50-60 字元以內
- 包含主要關鍵字
- 使用有吸引力的詞彙
- 避免過度使用符號

---

## 🚦 分享預覽範例

### 當你分享首頁到 Facebook/LinkedIn
```
┌─────────────────────────────────────┐
│  [og-home.png 預覽圖]                │
├─────────────────────────────────────┤
│ SuperGalen's Dungeon                 │
│ 全端工程師的 RPG 風格作品集 ⚔️        │
│ 探索技能樹、完成任務、收集成就...     │
│                                       │
│ supergalen.com                        │
└─────────────────────────────────────┘
```

### 當你分享部落格文章到 Twitter
```
┌─────────────────────────────────────┐
│  [文章封面圖]                         │
├─────────────────────────────────────┤
│ 歡迎來到我的技術部落格                │
│ 一個結合 Jekyll、Web3 與 RPG...       │
│                                       │
│ supergalen.com  @SuperGalen           │
└─────────────────────────────────────┘
```

---

## 📈 效果追蹤

建議安裝以下工具追蹤效果：

1. **Google Analytics 4** - 追蹤流量來源
2. **Google Search Console** - 監控搜尋表現
3. **Facebook Pixel**（可選）- 追蹤社群流量

---

## ✅ Checklist

部署前確認：

- [x] 預設分享圖配置（目前使用 site_icon.png）
- [ ] （可選）準備專用分享圖片（og-image.png，建議 1200x630）
- [ ] 已測試 Facebook 分享預覽
- [ ] 已測試 Twitter 分享預覽
- [ ] 已測試 Google Rich Results
- [x] robots.txt 設定正確
- [x] Sitemap 自動生成
- [x] 所有文章都有 description
- [x] _config.yml 資訊完整

---

## 🎨 快速產生分享圖片的工具

推薦以下線上工具：

1. **Canva** - https://www.canva.com/
   - 範本：社群媒體 → Facebook Post (1200x630)
   - 有現成的設計範本

2. **Figma** - https://www.figma.com/
   - 專業設計工具
   - 可以設定精確尺寸

3. **Photopea** - https://www.photopea.com/
   - 免費的線上 Photoshop
   - 支援 PSD 格式

---

## 📚 參考資源

- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards Documentation](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Schema.org](https://schema.org/)
- [Google Search Central](https://developers.google.com/search)
