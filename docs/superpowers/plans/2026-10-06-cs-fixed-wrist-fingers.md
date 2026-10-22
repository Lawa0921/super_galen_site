# 固定掌位的離線手指校正

> **For agentic workers:** Use superpowers:executing-plans for the root implementation; consultants are read-only.

**Goal:** 在已無掌部穿模的姿勢上重現 runtime 手指 FK，為有限次離線校正提供可信 evaluator。

**Architecture:** 從原 GLB 還原 local rest 與 visual-rest axis；只重播左手 15 根指骨，固定兩手腕及其餘骨骼。以原始四槽 LBS、槍面及既有接觸門檻驗證。右食指經 runtime IK，故保留其實測矩陣，不宣称以命令重建它。

**Tech Stack:** Node、Three、既有 art-factory QA。

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`；延續 `character-envelope-grip-v7.asset-contract.json`。

## 限制與驗收

- 原 GLB／材質／權重／既有封存包不改；不增加 runtime 運算。
- 左手 wrist 與其餘 38 根骨骼固定；42 命令中只有 19 個左手指命令可改。
- runtime 按 command 順序 post-multiply，從 rest 重算，不能合併 Euler 或改用 DQ skin。
- 基準須重現 15 根左指骨矩陣（誤差 ≤ 2e-10）、145 對左手穿模及原 pad contact 摘要；不能因 palm pass 就進 runtime。
- 後續 pose 必須維持 palm+boundary 最小 1–2 mm、零手槍／指間穿模、每長指至少兩節通過原 distributed contact，另經多角度視覺審查。

## 執行

- [x] `cs_finger_replay_v7.test.mjs`：先寫並確認失敗，涵蓋 rest 軸／先後順序、子節繼承、不累積、非法輸入不影響已保存基準。
- [x] `cs_finger_replay_v7.mjs`：GLB node hierarchy + rest quaternion + fixed-wrist FK，保留非左指矩陣與命令。
- [x] 新 `tmp/cs-finger-replay-v1/`：原資產 hashes、baseline FK／LBS／crossings／pad contact 對比及成本紀錄。
- [x] 獨立唯讀檢核並執行相關 Node tests；任何不一致先診斷，不能以放寬門檻繼續。
- [x] 只有 baseline 全通過才建立新有限 pose run；不得修改已封存 envelope packet。

## 本輪結果與下一步

`run-20261006-v7-fixed-wrist` 完成 1869／最多 2000 次離線評估；crossings 145→4，四對全在食指。全掌最低距離 1.048668712 mm；真瀏覽器與離線 53 骨矩陣誤差為 0。食指 0 節、中／無名／小指各 1 節通過，完整握姿拒絕，未整合 runtime。相關 41 Node tests 通過；多角度、桌面與手機操作完成。獨立 review 指出應先檢查共同 wrist frame／掌長軸與護木截面可達性，不能將有限搜尋失敗解讀為全域不可解，也不直接再跑同批 seeds。

## Review focus

右手 IK 與 FK 的差異；非單位來源 quaternion／微量 scale；同骨多命令順序；混權 palm boundary 隨指骨變形；有號最近面距離不是封閉體穿透證明。
