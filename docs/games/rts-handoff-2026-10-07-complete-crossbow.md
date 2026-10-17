# 原創弩兵整體候選：模型材質與裝填試作

目標仍是原創人類王國、完整兵種科技、兩張地圖、對戰 AI 與每兵種動態 3D 肖像，所有模型／骨架／動作原創且達商用品質。本輪只完成可檢查的整體弩兵候選；**`qa_failed`，沒有替換正式人物，沒有完成整體目標**。

## 可操作畫面

- [完整弩兵五種動作、兩 LOD、兩隊與視角](http://127.0.0.1:4334/crossbow-complete/)
- [實際河谷中的候選人物與動態肖像截圖](http://127.0.0.1:4334/crossbow-complete/shots/river-portrait-and-army.png)
- [目前正式本機遊戲](http://127.0.0.1:4324/games/rts/)仍使用先前 published 模型。

`qa/assembly` 使用 Playwright 只在該瀏覽器攔截兩個 crossbow GLB，載入真正的 Battlefield 與 SelectionPortrait。準備三位弩兵是受控組裝情境，滑鼠選取與移動是真實操作；不是自然戰役、射擊同步或正式發佈驗收。

## 成果與來源

工廠 run：`art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1/`。

- 以原 `cuff-bands.blend` 的完整原創人體為來源，移除失敗的短布接片；從原手套 37 點邊界延伸有厚度的皮袖口，罩住原衣袖。
- 雙手使用本專案既有原創生成 `leather-512.png`，重新展開 UV。沒有新外部貼圖、模型、骨架或動作來源。
- 新增 `BowString`／`LoadedBolt` 骨頭；箭矢取自本專案原創 `projectiles/.../bolt.blend`，按箭槽調整長度與直徑。
- 在原 24 FPS／40 frame Attack 內做舉弩、放弦、降弩、拉弦、取箭、放上軌與回握試作。手指開合修正為連續曲線。
- LOD0 20,247 三角面，略高於 20k 目標；LOD1 9,477。檔案分別 6,542,316／6,148,168 bytes，尚未進行這版效能及下載預算驗收。

| 產物 | SHA-256 |
|---|---|
| LOD0 GLB | `22fb11f67ca45e5f8d15dafda7fd31b2e3099f718486a0e51e7e5d231e7e6d01` |
| LOD1 GLB | `c320b0bc94a372559e7b93e18ac7fd96e437969f578856cb92846011e51632ed` |

原檔為 `candidate/complete-crossbow.blend`，包含遠景手部派生的原檔為 `candidate/complete-crossbow-export.blend`；實際 hash 見 `qa/root-review.json`。初步 `qa/whole-figure` 圖為較粗箭桿／修正手指曲線前的版本；最終圖在 `qa/browser`，不可混用版本。

## 實際檢查

- 5 項原創機構／手指連續性 Python 測試通過，已有先失敗輸出 `motion-red.log`／`finger-continuity-red.log`。
- `preservation.json`：保留人體 LOD0 7,133 vertices／14,183 faces，LOD1 3,004／5,941，位置、權重、面與 UV 完全相同；四種非 Attack 動作曲線相同。
- 兩個 GLB validator 均為 0 errors／0 warnings／0 infos。
- `browser/report.json`：兩隊、兩 LOD、五種動作共 20 組播放／暫停，72 張姿勢圖、手機畫面，0 page errors。
- `assembly/report.json`：兩圖實際候選 hash、選取、移動、大頭貼骨架隨時間變化通過；根代理已看過最終空地全身及肖像截圖。
- 新手動驗證檔 strict TypeScript 通過；Vitest **134 files／1,383 tests** 通過。沒有 runtime 程式修改，這輪沒有重跑 production build、全站 E2E、自然戰役或效能測試；上一河谷里程碑的結果不可當成本候選通過。

## 失敗與下一步

`qa/deformation.json` 的密集 Blender 評估顯示，Idle／Walk／Hurt／Death 的覆袖面積比下限為 0.938、腕彎至多 67.95°；新 **Attack** 仍有最小面積比 **0.01027**、最大腕彎 **153.73°**。Attack frame 24／29／36 的手弩 BVH 重疊配對為 366／394／496；這是交叉調查訊號，尚未逐面分類。不可因匯出與 UI 檢查成功，宣稱碰撞或模型可用。

獨立看圖確認皮革／輪廓與整個機構狀態有明顯改善，但以下三項仍阻擋整體品質：

1. 懸空單手拉大型金屬弩，沒有相應身體受力。先重做一套合理上弦機構與全身關鍵姿勢：原創槓桿／絞盤，或腳踩踏環的雙手上弦；不再只修改手部曲線。
2. 箭矢在腰側出現但沒有收納來源。需原創腰側短矢匣與真實取箭、抽出、旋轉和落軌路徑。
3. 瞄準及放弦仍缺頭部對準、胸廓／骨盆／腳步重量轉移。完整姿勢定好後再修腕部、手指、衣袖與碰撞。

正式 runtime 的 projectile 目前在 attack 開始便建立，候選放弦是 frame 12／0.5 秒。候選動作合格後，需另做 TDD 對齊 simulation 與動畫，現在未聲稱同步。實際 GLB 密集頂點 parity、連續碰撞、完整角色美術與效能驗收仍未完成。

衛兵整體甲胄仍有圓筒／球殼堆疊與塑膠感，需要原創整體重塑；本輪不以弩兵局部改善縮小其他兵種要求。
