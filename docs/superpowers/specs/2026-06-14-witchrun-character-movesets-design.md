# Witch Run 角色專屬招式設計

**日期**：2026-06-14
**分支**：`feat/witchrun-character-select`（接續選角系統）
**範圍**：4 角色各自不同的**主射**與**爆彈**，讓玩法分化（OVERDRIVE 維持全角共用）。利用既有積木（pierce/spread/homing/freeze/clear/dmg），走 TDD。

## 決策（已與使用者確認）

- 差異範圍：**主射 + 爆彈都不同**；OVERDRIVE 共用（遊戲招牌擦彈超載機制不動）。
- 招式對齊各角人設與既有數值差異（Volt 玻璃大砲、Gale 機動、Frost 控場、Mira 平衡）。

## 招式表

| 角色 | 主射 `shotType` | 爆彈 `bombType` | 定位 |
|------|------|------|------|
| Mira | `balanced`：power 分道直射（現行基準） | `inferno`：全屏火傷＋清彈＋短無敵（現行） | 全能基準 |
| Gale | `pierce`：射速×0.6 間隔、彈道窄、穿透+1、單發傷害×0.7 | `gust`：清全屏彈＋較長無敵(1.8s)＋短衝刺加速、直傷低(×0.25) | 機動 DPS／逃生 |
| Frost | `fan`：間隔×1.4、一次射 power+2 枚角度冰刃(±扇形)、單發傷害×1.3 | `freeze`：全場敵人與敵彈凍結 2.5s、直傷低(×0.3) | 範圍／控場 |
| Volt | `chain`：直射雷彈、命中後跳最近的另一敵（鏈深 2、遞減×0.6） | `storm`：全場高額雷擊(×2 inferno)＋自機周邊清彈 | 連鎖爆發／秒傷 |

## 引擎設計

- **`characters.ts`**：`CharacterDef` 加 `shotType: 'balanced'|'pierce'|'fan'|'chain'` 與 `bombType: 'inferno'|'gust'|'freeze'|'storm'`。四角填上表值（mira=現行基準，回歸保護）。
- **`game.ts autoFire`** 依 `this.charDef.shotType` 分支：
  - `balanced`：現行（power 道、間隔 FIRE_INTERVAL_MS、spread 12）。
  - `pierce`：間隔 ×0.6、spread 8、每彈 `pierceLeft = max(1, relicPierce)`、dmg ×0.7。
  - `fan`：間隔 ×1.4、發射 `power+2` 枚，vx 依角度展開（±約 12°/枚），dmg ×1.3。
  - `chain`：發射較少道（如 max(1,power-1)）直彈並標記 `chainLeft=2`，dmg 略降。
  - 既有 relic 修正（atkMult/pierce/familiar/split/crit/od）仍疊加於各型之上。
- **連鎖雷**：`PlayerBullet` 加 `chainLeft: number`（pool 初始化 0）。`resolvePlayerHits` 命中敵的「回收」分支：若 `chainLeft>0`，呼叫 `chainTo(b, hitEnemy)`——找最近的**另一**隻 alive 敵（半徑內），於命中點生成一發朝它的快彈，`chainLeft-1`、dmg ×0.6。boss 命中不連鎖。
- **爆彈**：`useInferno` 改名 `useBomb`，依 `this.charDef.bombType` 分派：
  - `inferno`：現行。
  - `gust`：`enemyBullets.clearAll()`；`invulnMs = max(_, 1800)`；設 `dashMs`（新欄位，>0 時 movePlayer 速度 ×1.5）；對全敵/boss `INFERNO_DMG×0.25`。
  - `freeze`：`freezeMs = max(_, 2500)`；對全敵/boss `INFERNO_DMG×0.3`；清自機周邊彈（HIT_CLEAR_R）。
  - `storm`：對全敵/boss `INFERNO_DMG×2`；清自機周邊彈（HIT_CLEAR_R）；短無敵。
  - 皆 `bombs--`、保留發出 `inferno` 事件（共用震屏/音效；distinct SFX 列為後續）。
- **freeze 擴及敵人**：`freezeMs>0` 時，跳過敵人 `stepEnemy`（移動/開火）與 boss `step`（既有 bullet freeze 維持）。**風險**：chronos 遺物也用 freezeMs（overdrive 時 1.5s）→ 會順帶凍敵。TDD 時跑既有 relics/game 測試；若有測試鎖定「chronos 只凍彈」則改用獨立 `enemyFreezeMs` 欄位區隔。

## 測試（TDD）

- `characters.test.ts`：四角 `shotType`/`bombType` 正確（mira=balanced/inferno）。
- 主射：
  - `pierce`（Gale）：射出的彈 `pierceLeft≥1`、射速間隔較短。
  - `fan`（Frost）：一次產生 >power 枚且有非零 vx（角度展開）。
  - `chain`（Volt）：命中一敵後，場上有第二發朝另一敵（或 `chainLeft` 遞減邏輯單元測試）。
- 爆彈：
  - `gust`：用後 `invulnMs≥1800`、敵彈清空、直傷低於 inferno。
  - `freeze`：用後 freeze 生效（step 後敵人位置不變、敵彈不前進）。
  - `storm`：對 boss 造成的傷害約 2× inferno。
- 回歸：mira 行為＝現行（既有 game.test 全綠）；relics freeze 相關測試全綠。

## 不做（YAGNI）

- OVERDRIVE 不分角色。
- 不加新音效/特效素材（爆彈 SFX/VFX 沿用，distinct 化列後續）。
- 不改關卡/Boss/敵人；不動 i18n。

## 全域驗收

- `npm run test -- --run src/scripts/games/witchrun/engine` 全綠（含新測試）。
- `witchrun.spec.ts` + games-hall e2e 全綠；`npm run build` 成功。
- 手動/截圖確認 4 角主射與爆彈表現不同。4321：`/games/witchrun`。
