# Dungeon Arcade — WITCH RUN（像素縱向彈幕射擊）設計文件

- 日期：2026-06-11
- 狀態：設計已核可（概念：魔女夜飛行；機制：擦彈超載＋層間遺物）
- 路由：`/games/witchrun`（Dungeon Arcade 第三款遊戲，取代入口頁 COMING SOON 卡）

## 1. 目標與動機

為 `/games` 遊戲室新增第三款遊戲：雷電式縱向捲軸彈幕射擊（shmup / bullet hell），
像素風格，單機 solo 模式（同 bomber，不進線上 ELO 排行榜）。

差異化重點：不做「純雷電復刻」，以兩個輕量機制疊加提供現代手感與重玩價值：

1. **擦彈超載（Graze Overdrive）**——風險回報，獎勵在彈幕中跳舞。
2. **層間遺物（Relic Draft）**——輕 roguelite，每局 build 不同。

## 2. 故事背景（已定案：魔女夜飛行 WITCH RUN）

Dungeon Bomber 後日談。月蝕之夜，廢棄百年的「亡鐘塔」無人自鳴——塔內亡鐘甦醒、
詛咒外溢。爆彈魔女 **Mira**（bomber 客串主角，THE BOMB-WITCH，主色 `#ff5a4d`）
受公會委託騎掃帚夜飛出擊，沿鐘塔豎井一路向上突破，在亡鐘敲滿十二響之前抵達
鐘樓頂將它封印。

縱向向上捲動 = 「往塔頂爬升」，與雷電縱捲同構且敘事自洽。

## 3. 關卡結構（4 關 + 最終 Boss，單局約 10–12 分鐘）

| 關卡 | 場景 | 敵群語言 | Boss |
|---|---|---|---|
| 1 | 塔基墓園 GRAVEYARD GATE | 蝙蝠群、浮遊鬼火、墓園妖精 | 石像鬼門衛 Gargoyle Warden |
| 2 | 藏書螺旋 LIBRARY SPIRE | 飛行魔導書、紙頁刃、咒文符彈 | 禁書魔典 The Grimoire |
| 3 | 鐘匠工坊 CLOCKWORK FOUNDRY | 齒輪鋸、發條天使、蒸汽噴口 | 發條鐘匠 The Bellwright |
| 4 | 鐘樓頂 THE BELFRY | 月蝕妖精、鐘聲音波環 | 亡鐘 THE DEAD BELL（三階段） |

- 每關節奏：道中敵群波次（~2 分鐘）→ Boss 戰。
- 最終 Boss 招牌彈幕「**鐘聲波紋**」：每敲一響，以鐘為圓心擴散同心圓彈環，
  玩家找環上缺口穿越——視覺與主題合一。
- 敵彈語言與場景材質一致：咒文符彈、音波環、紙頁刃、齒輪、鬼火。

## 4. 核心機制

### 4.1 操作

- 八方向移動、自動連射魔彈。
- 按住 `Shift`（觸控：第二指按住）進入**低速精密模式**：移速減半、
  顯示 Mira 胸針上的發光判定點（判定點遠小於 sprite，標準彈幕設計）。
- `X`/`K`：爆炎術（Bomb）。鍵盤 `WASD`/方向鍵移動；觸控為拖曳相對移動＋
  自動射擊＋畫面爆炎按鈕。

### 4.2 爆炎術（Bomb）

- 庫存制 ×3（每局起始），沿用 Mira 在 bomber 的招牌技。
- 以自身為中心大範圍爆炎：清除全屏敵彈、對範圍敵人造成大量傷害、短暫無敵。

### 4.3 擦彈超載 OVERDRIVE

- 敵彈貼身掠過（擦彈判定半徑 > 被彈判定）累積超載槽。
- 滿槽**手動引爆** → 清屏衝擊波 + 3 秒火力全開 + 得分倍率窗口。
- 被彈時超載槽清空（懲罰與風險對應）。

### 4.4 層間遺物（Relic Draft）

每破一關 Boss，從隨機 3 個遺物中選 1，效果持續到本局結束。遺物池 9 種：

| 遺物 | 效果 |
|---|---|
| 裂變魔彈 | 魔彈命中後分裂出 2 顆斜向小彈 |
| 影子使魔 | 僚機複製本體 50% 攻擊 |
| 貪婪磁石 | 擦彈額外吸取金幣、拾取範圍擴大 |
| 月光護符 | 殘機 +1（即時生效） |
| 咒速羽毛 | 移速 +20%、被彈判定縮小 15% |
| 爆炎觸媒 | 爆炎庫存 +1，爆炎後留下持續火場 |
| 回音鈴 | OVERDRIVE 持續時間 +50% |
| 血色契約 | 攻擊力 +50%，殘機上限 -1 |
| 星屑掃帚 | 低速模式中自動擦彈微吸附（擦彈累積 +30%） |

### 4.5 命數與計分

- 殘機 3；中彈 −1 命、火力降一級、短暫無敵 + 自動小清屏（防連死）。
- 全滅：可續關（分數歸零）或回標題。
- 計分：擊破分 + 金幣星屑拾取 + 擦彈連鎖倍率；OVERDRIVE 期間倍率加成。
- 紀錄：本地最高分（localStorage），不進線上 ELO 榜。

## 5. 美術方向（像素風，Gemini / nanobanana 產圖）

- **調色**：深靛藍月夜為底、月蝕橙紅為光源、Mira 緋紅 `#ff5a4d` 為主角色焦點；
  與 bomber 的角色識別一致。
- **主角**：Mira 騎掃帚背影（俯視縱捲視角），帽尖飄動、掃帚尾星火粒子，
  左右傾斜各一幀（移動傾斜）。
- **素材清單**：
  - Mira 飛行 sprite sheet（直飛/左傾/右傾）
  - 4 關道中敵兵 sprite（每關 2–3 種）
  - 4 隻 Boss sprite（亡鐘需三階段形態差分）
  - 直式捲動背景 ×4（可上下無縫平鋪）
  - 子彈圖集：魔彈（自機）、咒文符彈、音波環、紙頁刃、齒輪、鬼火
  - 特效：爆炎、擊破爆裂、OVERDRIVE 衝擊波（黑底 additive 轉 alpha 流程）
  - 入口頁卡片 `card-witchrun.webp`、Boss 登場立繪、標題 logo
- **音效**：Web Audio 合成（SoundManager 模式）：射擊、擦彈 tick、超載引爆、
  爆炎、鐘聲（最終 Boss）、Boss 警報。

## 6. 架構：邏輯與渲染分離（沿用 bomber / tetris 模式）

```
src/pages/games/witchrun.astro        # 頁面殼：標題畫面、HUD DOM、code-split 載入
src/scripts/games/witchrun/
├── engine/                           # 純 TS 邏輯，每模組配 .test.ts（TDD）
│   ├── constants.ts                  # 場域尺寸、速度、判定半徑等
│   ├── rng.ts                        # 種子化隨機（可重現、可測）
│   ├── player.ts                     # 移動、低速模式、被彈、無敵幀
│   ├── bullet.ts                     # 子彈池、運動模型（直線/加速/角速度）
│   ├── pattern.ts                    # 彈幕模式產生器（扇形/環形/瞄準/螺旋/鐘波）
│   ├── collision.ts                  # 點對圓判定、擦彈判定（雙半徑）
│   ├── graze.ts                      # 擦彈累積、OVERDRIVE 槽與引爆
│   ├── relics.ts                     # 遺物定義、抽選、效果套用
│   ├── enemy.ts                      # 道中敵行為（路徑、射擊週期）
│   ├── boss.ts                       # Boss 階段機（血條閾值切 phase）
│   ├── stage.ts                      # 關卡腳本（時間軸波次表）
│   ├── scoring.ts                    # 計分、倍率、金幣
│   └── game.ts                       # 固定時間步進總迴圈、狀態機
├── render/                           # PixiJS（PixiStage 模式）
│   ├── PixiStage.ts
│   ├── BulletView.ts                 # ParticleContainer + sprite 池（撐數百顆）
│   ├── EntityView.ts                 # 自機/敵機/Boss
│   ├── BackgroundView.ts             # 直式無縫捲動
│   ├── HudView.ts                    # 超載槽、殘機、爆炎、分數
│   └── assets.ts
├── input/                            # 鍵盤 keymap + 觸控
└── audio/                            # SoundManager（Web Audio 合成）
```

- 引擎固定時間步進（deterministic），邏輯可完全離線測試。
- 效能要點：子彈全部走物件池；渲染層 ParticleContainer；
  碰撞用自機為中心的局部檢查（彈幕只需對自機判定）。

## 7. 測試策略

- **單元（vitest，TDD）**：engine 每個模組——彈道運動、雙半徑擦彈判定、
  超載槽累積/清空/引爆、遺物效果疊加、Boss 階段切換、波次時間軸、計分倍率。
- **E2E（Playwright）**：頁面載入、標題畫面開局、HUD 顯現、暫停/續關流程。
- 渲染層不做單元測試（與 bomber 一致），靠 E2E + 人工驗收。

## 8. v1 MVP 切割（建議實作階段）

1. 引擎核心：player + bullet + collision + graze + game loop（TDD）
2. 彈幕模式庫 pattern + 道中敵 enemy + stage 腳本（先做第 1 關）
3. OVERDRIVE + 爆炎 + 計分 + 遺物系統
4. PixiJS 渲染層 + 佔位素材可玩
5. Gemini 產圖全套素材 + 音效合成
6. 第 2–4 關 + 四 Boss + 最終鐘波彈幕
7. 觸控支援、入口頁卡片、E2E、效能驗證

## 9. 不包含（YAGNI，延後）

- 線上排行榜 / 分數上傳
- 多角色選擇（v1 只有 Mira；其他 bomber 角色留作未來擴充）
- 雙人協力、難度選擇（v1 單一難度，曲線靠關卡設計）
- 重播系統
