# RTS 玩法優先交接（2026-10-07）

使用者最新優先順序：人物仍不到可用水準，先專注「操作手感與完整對局流程」。所有人物、美術、骨架與動畫修整暫停；先前弩兵候選維持 qa_failed，不發佈到 runtime。

工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。本輪開始已有約 480 項未提交修改，全部保留；沒有 commit、push 或部署。預覽使用獨立的 4324，不是外層專案的預設埠。

## 已實作

- `types.ts`／`commands.ts`：沿用地面 rally 座標，新增可選 resourceId。主城可對可見、未枯竭資源設定工人集結；資料以資源真實位置為準，拒絕時保留舊集結點；敵方 rally 仍從 TeamView 移除。
- `economy.ts`：新工人依資源集結直接採集；地面集結使用普通移動。若訓練期間資源枯竭，依既有可見同類資源重派；迷霧中只前往已知位置，不提前讀取枯竭結果。
- `input.ts`／`hud.ts`：主城右鍵礦木、建築小地圖右鍵集結、A＋小地圖左／右鍵攻擊移動；成功退模式、失敗保留，普通左鍵仍移動鏡頭。建造／施法模式小地圖左鍵聚焦、右鍵取消。建築資訊顯示資源／地面集結狀態。
- `combat.ts`：牧師只在閒置、守備與攻擊移動時自動治療，明確攻擊／普通移動優先；攻城車自動索敵至少涵蓋自身 12m 射程，保留迷霧及守備不追擊限制。
- `movement.ts`：等距接近點保留固定角度排序，避免浮點誤差讓滿載木工反覆換入口、重算路徑及原地打轉。另保留方向改變時選近側的測試。

## 驗證與證據

| 項目 | 實際結果 | 證據 |
|---|---|---|
| TDD | rally 9 項、input/combat 11 項、approach 1 項先因行為失敗 | `tmp/rts/gameplay-rally-red.log`、`gameplay-control-red.log`、`gameplay-approach-red.log` |
| 相關單元 | 4 files／60 tests passed | `tmp/rts/gameplay-control-green.log` |
| 全套 Vitest | 136 files／1,411 tests passed，35.88s，exit 0 | `tmp/rts/gameplay-full-vitest.log` |
| Strict TypeScript | RTS 全部 source、tests/e2e 的 games-rts／rts helper、tests/manual RTS，exit 0 | `tmp/rts/gameplay-types.log` |
| Chromium | 12/12：兩圖資源集結與小地圖、科技生產、採集建屋、英雄技能、載入恢復、暫停投降重開 | `tmp/rts/gameplay-browser.log` |
| 瀏覽器命令邊界複測 | 2/2：無法到達的主城地基保留 A 模式，成功下令退出；A＋右鍵也通過 | `tmp/rts/gameplay-browser-boundaries.log` |
| Production build | exit 0，30.68s | `tmp/rts/gameplay-build.log` |
| 自然河谷戰役 | 08:55 勝利，state time 535.5 | `tmp/rts/gameplay-campaign.log`、`player-observation-river.json` |
| 自然隘口戰役 | 09:39 勝利 | `tmp/rts/gameplay-pass-campaign.log`、`player-observation-pass.json` |
| 獨立唯讀檢核 | 方向 PASS，未發現可重現 P0–P3；主流程抽驗相關原碼 | consultant `rts_waist_repair_design` |

自然戰役使用實際滑鼠／鍵盤，僅加速時鐘與唯讀觀察，不注入資源、HP、命令或勝負。科技／英雄的 E2E 為明確標示的受控 fixture，不能代替自然戰役。初次隘口失敗時，訓練按鈕持有焦點，使下一輪編隊召回被 UI guard 忽略；隨後 Ctrl+3 把整組覆寫成基地新兵。僅在手動驗證腳本每輪召回前補 `canvas.focus()`，就維持原主力並完成勝利。失敗證據保留 `gameplay-pass-before-focus-fix.json/png`，不是通關證據。腳本現在也區分 win／incomplete 截圖。

Strict TS 亦修正既有 WebGL 測試函式的 `this:HTMLCanvasElement` 型別標註。沒有新增依賴、沒有不存在的 lint 指令。全工作樹 diff check 仍見既有 `tests/manual/rts-performance-fixture.ts` CRLF/whitespace，本輪未改該檔；本輪檔案單独檢查。

## 預覽與未完成

- [可玩遊戲](http://127.0.0.1:4324/games/rts/)
- [主城資源集結截圖](http://127.0.0.1:4334/gameplay-control/gameplay-river-resource-rally.png)
- [隘口資源集結截圖](http://127.0.0.1:4334/gameplay-control/gameplay-pass-resource-rally.png)
- 人物建模與動畫仍未達使用者要求；這輪沒有改人物資產。
- 窄路／局部友軍群聚的避讓仍可能持續等待，需獨立處理；兩圖自然勝利不代表所有擁擠陣形都已驗證。
- 本輪未重新做效能負載、Firefox／WebKit 或無關遊戲的全站 E2E；沒有宣稱整體遊戲已製作完成。

後續先處理群兵避讓與指令回饋，再依實際遊玩評估經濟、科技與 AI 節奏，不要重啟手套或弩兵局部美術迴圈。
