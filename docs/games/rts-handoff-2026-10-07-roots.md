# 原創掌指根修正交接（2026-10-07）

本輪修正原創手部的 MCP／CMC 權重與中指彎曲方向。**660 個局部姿勢通過；完整握持仍失敗，整體 `qa_failed/runtime_publish_allowed=false`。** 全原創、可商用人物、每兵種 3D 肖像與兩張地圖的要求沒有縮小；此輪未更換人物 runtime、push 或部署。

[互動預覽](http://127.0.0.1:4334/glove-roots/)／[實際 Chromium 截圖](http://127.0.0.1:4334/glove-roots/still.png)。預覽明列完整握持未通過。Run `art-factory/rts/runs/original-glove-joints/2026-10-07-v2`，工作樹 `.claude/worktrees/rts`、`feat/browser-rts`。

| 來源／當前候選 | SHA-256 |
|---|---|
| 不變的 v1 原創綁定來源 | `ebd8bc8b462538eec0bd9829ce29c8d42ace7ee2083582e2e9ea2d68e99da5bc` |
| 當前 `candidate/joint-rig.blend` | `5871ce5ed506c7e29ae1aa06e7a3d6edf855f11af595ee691d47799f1c30c2e1` |
| 當前 `candidate/glove-l-lod0.glb` | `2c50301d1f490f3432b6347a0b4a768ed832b67b2fed36c175368624dfbd517c` |

## 根因與修正

原始紅燈把每指根部與同指第 2／3 節複合彎曲分開，90 個姿勢中有 9 個根部姿勢交叉；distal compound 全部為零。原根部用世界 Z 與 XY Gaussian 分配，接近指蹼時有跨指權重不連續。

新版本在實際來源網格上解正權重 harmonic 場，只重分 `Hand` 和五個 `Digit1` 的剩餘權重；**所有 `Digit2/3` 權重逐點保留**。第 2 節中央環往末端、拇指遠端與腕部是固定邊界；近端與指蹼連續求解。先把固定邊界設在切口的版本仍失敗，已保留在 `iterations/rejected-port-anchored-root-v1`。每點最多四個正規化權重，不是讓 GLB 匯出時才截斷。

食指、無名指、小指與拇指的根部問題因此消除。剩餘中指的獨立剛體掃掠證明，原本依全掌方向推算的 hinge 軸會讓中指撞食指，並非只要繼續擴權重就能消除。來源指節排列方向能避開剛體接觸，但完整皮膚又會擠到無名指側指蹼。因此在兩個來源方向間做 9 方向 × 33 姿勢的有限掃掠，維持完整 0–62° 幅度；混合係數 `.375–.75` 的已取樣方向都沒有測得交叉。取區間中點 `.5625` 作本版中指軸，再另跑完整局部回歸。這是離散取樣證據，不是連續無碰撞的數學證明。

## 實際驗證

- `qa/preservation.json` 六項通過：1,456 個 rest 頂點、所有面、骨頭 head／tail／parent 完全一致；所有 `Digit2/3` 權重誤差 0；其他骨軸不變；最多四個正規化權重。
- `qa/isolated-and-compound.json`：五指 ×（根部、第 2 節、第 3 節、distal compound）× 33 角度，**660 個實際 Blender 姿勢，全部零測得交叉**。`qa/isolated-and-compound-glb.json` 另將最終 `.5625` 軸轉入實際 GLB 的 rig 座標，以同一組 660 姿勢重驗三角曲面，亦全為零，包含指蹼。兩份皆固定最終來源 SHA；舊 envelope 僅保留作選方向的歷史診斷。這不涵蓋全關節握持、武器接觸，也不是隔離姿勢逐頂點 source／GLB parity。
- `qa/actual-export.json`：左手 LOD0，OpenClose 的 385 個 1/8 幀姿勢 source → GLB 比對通過；最大 skin matrix 誤差 `1.35042e-6`，頂點位置誤差 `1.96729e-6 m`。只驗 skin／頂點，不驗變形後三角化相同。
- 匯出時暫時解除 skinned mesh 的 parent、保留 world transform 與 armature modifier。實際 GLB 通過上項 parity；validator **0 errors／0 warnings／0 hints**，前版 non-root skinned mesh warning 已消除。
- Chromium 實際 12 姿勢／視角、播放暫停、skin 頂點變動、時間軸、拖曳、手機無溢出、中文與真實 503 失敗路徑通過，0 page errors。獨立預覽 strict TS 通過。

完整動作依然失敗：Blender 半握 30、全握 242／240；重新匯入實際 GLB 半握 30、全握 244／244 個三角交叉配對，兩條命令退出碼均為 1。這些不是穿透深度或失敗姿勢數。當前過深的握拳姿勢只是保留的失敗基準，不能作人物握持成品。

命令、退出碼、來源與限制集中在 `qa/release-results.json`；獨立檢核與封存指紋放在同一 QA 目錄。失敗迭代、診斷紅面圖片與目前正常材質預覽分開標記，不當作正式美術。

## 下一個實作包

從既有原創弩的 `support_grip`／`trigger_grip` 實際幾何取得握把大小與變換；`original_crossbow_weapon_build.py` 的 support grip 半徑為 `.0135 m`，最終以匯出幾何核對。把握把轉入本手部局部座標後，以掌面、指腹與拇指的接觸點原創製作握持路徑，獨立安排拇指對掌時序，再驗整段動作與武器碰撞。

不要再用固定舊 curl 當接觸目標，也不要為消除全手碰撞改壞已通過的局部綁定。腕口厚度、皮革材質／UV、左右手／人物接合、弩兵裝填和射擊、其他兵種與肖像、地圖岩壁／河岸／遺跡仍待完成；此輪沒有新的全站、完整 RTS 或效能通過宣稱。
