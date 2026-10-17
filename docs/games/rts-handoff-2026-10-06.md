# RTS 接手紀錄 — 2026-10-06

## 實際交付狀態

工作樹：`C:\Users\bag57\projects\super_galen_site\.claude\worktrees\rts`；分支 `feat/browser-rts`。本次只接手原創 RTS 工兵、衛兵、弩兵與相關戰鬥回歸，未修改其他專案或工作樹。既有大量未提交工作保留，沒有 reset、stash、clean、commit、push 或遠端部署。

**只有工兵的局部握持／手腕修正版已替換到本機遊戲。衛兵與弩兵仍是受阻候選，不能宣稱全部角色完成或全部美術核准。** 工兵批准範圍也不是原身體及五種動作的最終商業品質或使用者美術驗收。

本機遊戲：`http://127.0.0.1:4324/games/rts/`。獨立互動驗收頁：`http://127.0.0.1:4334/`。均需在 SuperGalen0921 本機開啟；沒有公開部署。4334 只服務 `tmp/rts/handoff-20261006/review-site` 靜態包，不公開整個工作樹。4321、4002 為其他工作，不應停止。

## 工兵：已接入與驗證

候選根目錄：`art-factory/rts/runs/human-units-grip-refine/2026-10-05/worker/revision-20261006`。上一版留在父層，沒有覆寫失敗證據。

修復原 LOD1 手腕切面 32 條開放邊、沒有封口仍標示通過的錯誤，以及皮膚突出手套的尖片。以原創手套的實際 BVH 徑向包絡修整原前臂，1 mm 內縮、80 mm 平滑過渡；手腕切面綁定 Hand_R，與原前臂權重平滑銜接。沒有換用第三方手部或動畫。局部接縫焊接限定 0.25 mm；封口、邊界量測缺失或失敗均直接拒絕。

LOD0 為 **18,973** 三角面；LOD1 從 10,787 降至 **9,913**。實際候選幾何回歸先在舊版本失敗，再在新版通過；五片段各五個時刻、兩級模型的手腕最大變換誤差為 `1.336050319703616e-7 m`。實際 Chromium WebGL 載入五動作、兩級精細度與紅藍隊伍成功。Khronos 共 0 errors、6 warnings，並不是零警告。

主審檢視近景與實際 Three 圖像，獨立只讀複審核准這組固定雜湊的局部替換。`publish_remaining_units.py` 的 dry-run 先通過，之後正式執行本機 publish。全 runtime GLB 前後比對確認僅 `worker.glb`、`worker-lod1.glb` 改變；工兵對應 model-registry、unit-registry、human-units contract 已更新。其他模型位元組未動。

固定 SHA-256：

| 檔案 | SHA-256 |
|---|---|
| candidate/worker-grip-refine.blend | `a516300c3091fa269353d147732749b0b4148270ee4cda9f2c4cd45c78642896` |
| LOD0 / runtime worker.glb | `97f8f52ecff8b3125bf4c7cf2662ab24408f8fa43b405e10f28fc1569097d0df` |
| LOD1 / runtime worker-lod1.glb | `56df9200cce78674d4ba7dd6ebcc2293a04b3da31a783ce396298c80b63691ce` |

同候選 `qa/`：`grip-refine.json`、`wrist-regression.json`、`production-verify.json`、`three.json`、`khronos.json`、`root-review.json`、`publication.json`、`publication-scope-check.json` 與圖像。來源欄位已拆分 worker source 與 grip source 的 path/hash，避免舊版含糊的來源配對。`root-review.json` 僅准工兵本次局部替換。

## 遊戲邏輯：已修復

接手實跑為 11 失敗／152 通過。根因包括短射程接近目標的周界點、過大的停止容差，以及多人近戰末段路徑與腳底避讓。已調整 `movement.ts`、`combat.ts`，保留目標綁定攻擊、16/30 秒接觸、取消與同時傷害結算。新增短射程接近工兵／建物、群體近戰站位回歸。

`combat.test.ts` 距離 fixture 改從 catalog 推導；`campaign.test.ts` 復活測試保存致命 tick 前實際已取得 XP，沒有放寬斷言或 timeout。RTS 166/166 通過。舊檔與實跑紅燈在 `tmp/rts/handoff-20261006` 保留。

## 衛兵：候選改善，但命中與美術仍受阻

候選：`art-factory/rts/runs/original-guard-assembly/revision-20261006`。新增原創閉合握持、修正膝部反向權重與肘膝甲方向、改善靴底支撐步態。Blender、GLB、五動作、原來源備份與 Three 步行診斷已保留。Khronos 0 errors／34 warnings。

仍有肩背破面、盾手輪廓、裙甲穿插；Hurt 的 Blender／Three 姿勢比對差 3.98 mm。它也是尚待預算收斂的高密度全身候選，不能當成可直接量產的大量部隊資產。

**本次主審另外在實際 stepGame＋Battlefield 中量到命中時序失敗。** 使用固定候選 GLB 路由，沒有改 public guard 或 registry。1v1 的首次扣血在 sim time 0.6 秒，攻擊 elapsed 0.55 秒時刀刃到對方表面仍差 **16.859 mm**；在指定接觸 elapsed 16/30 秒時差 **98.884 mm**。粗取樣到 elapsed 0.566667 秒才出現交會。同時刻 clone／live 劍頂點差為 0，不能把這個失敗推給檢查器姿勢不一致。

證據：`tmp/rts/handoff-20261006/guard-contact-final/contact-diagnostic.json` 與 `root-contact-gate.json`；後者也已抄存候選 `qa/root-contact-gate.json`。這是 staged 1v1，不是自然遊戲勝利驗收。診斷命令 exit 0 只代表載入、傷害與幾何算法 fixture 正常，**不代表刀刃接觸通過**。主審 gate 明確 `passed:false`。

下一步需先修正原創 Attack 姿勢／時間曲線並維持原約定接觸點，再做群體、兩級模型與不同目標的實際接觸確認；不可僅增加射程或放寬表面距離閾值掩蓋問題。全部候選目前未發布。

## 弩兵：Death 匯出漂移已大幅修正，但仍不得發布

最新候選：`art-factory/rts/runs/original-crossbow-grip/revision-20261006-v2`，不是上一輪 revision-20261006。詳細穩定交接在該目錄 `qa/handoff.md`，量測在 `qa/measured-verification.json`。

雙手握點與原弩位置已調整；第二輪修正實際 GLB 的 Death 左手漂移，從約 0.102 m 降至 **0.150 mm**，並處理局部袖口幾何。十項相關測試通過；LOD0／1 為 17,996／8,494 三角面；各檔 Khronos 0 errors／6 warnings。

肩袖／手腕仍有視覺瑕疵，嚴格全骨骼矩陣一致性檢查仍失敗。不能以握點距離通過代替整個動作骨架／全身視覺通過。沒有 root approval，public crossbow 保留原版本。

## 互動驗收頁與完整測試

新頁面可切換三人物、五動作、兩級精細度、紅藍隊伍、四視角、縮放、播放／暫停及時間拖曳；實際 GLB 雜湊必須符合凍結清單。使用遊戲的 ModelInstance 並直接設定動畫片段時間，不拿靜態截圖充作完整動作確認。30 組檢查包含不同時刻姿勢確實變化、暫停姿勢固定、檔案雜湊、播放、隊伍切換、390 px 無橫向溢出；全部通過，沒有頁面 JS 例外。

可維護來源：`art-factory/rts/review/handoff-20261006.{html,css,json}`、`art-factory/rts/tools/handoff_review_scene.ts`、`handoff_review_smoke.ts`、`handoff_review_package.mjs`。4334 靜態包在 `tmp/rts/handoff-20261006/review-site`，不會加入正式遊戲 registry。重新包裝可執行 `node art-factory/rts/tools/handoff_review_package.mjs`；服務重啟可用 `python -m http.server 4334 --bind 127.0.0.1 --directory tmp/rts/handoff-20261006/review-site`，已有同埠程序時不要重啟或殺掉不明程序。

實際結果與日誌：

| 檢查 | 結果 | 證據 |
|---|---|---|
| 接手 RTS baseline | 11 失敗、152 通過 | `tmp/rts/resume-unit-1791264786354.log` |
| 修正後全站 Vitest | 132 檔案、1,368 測試通過，0 失敗 | `tmp/rts/resume-unit-1791266396430.log` |
| Chromium RTS E2E | 13 通過 | `tmp/rts/resume-e2e-1791266542239.log`、`tmp/rts/e2e-report.json` |
| 正式 production build | exit 0，完成 | `tmp/rts/resume-build-1791266860512.log` |
| 三人物互動檢視 | 30 組姿勢等檢查通過 | `tmp/rts/handoff-20261006/review-qa/report.json` |
| 最終本機 worker 雜湊、兩個 HTTP 端點 | 一致、200 | `tmp/rts/handoff-20261006/final-state.json` |

E2E 包括實際採集付費建屋、訓練、研究、暫停／投降、模型與 WebGL 失敗重試、英雄技能、選取與肖像。Firefox／WebKit 本次未跑。production build 成功不代表已部署。

部分 CLI agent 把細節報告與最後摘要寫到同一路徑，造成最後摘要覆寫其自行產生的詳細 markdown；因此應以本交接及上述實際 JSON／日誌／圖像為準，不要依賴 guard-result.md 等摘要中的自我連結。弩兵 v2 的 `qa/handoff.md` 已分開保存，沒有此問題。
