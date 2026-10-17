# 原創手部同步開合交接

原始目標仍是八兵種原創人類王國、動態 3D 肖像、對電腦與兩張地圖，模型與動作須達可商用品質。使用者不接受第三方人物、骨架或動作素材；本輪均沿用專案原創來源。

工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。大量既有未提交工作保留；本輪未 push／部署，未更換遊戲 runtime 模型。

## 本輪可接續版本

Run：`art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1`。

- `candidate/natural-hand.blend`：`63bbe419750aa77048c80fb2acd68a8b338e8c96c52b61356b8ece6a5ef56060`
- `candidate/natural-hand.glb`：`a48cfe9a6df74c2eef6703a6ae737b8f12edc70d9ff3da1bc47d4f0f2194f72f`
- `raw/hand.json`：`95a988396b852ca5436ff6f947bf2425f986557a43cfa64a99edd2b98e8d6646`
- [預覽](http://127.0.0.1:4334/glove-natural/)；[截圖](http://127.0.0.1:4334/glove-natural/still.png)。已用 Chromium 實際載入與操作。

模型 1456 vertices／2873 triangles／16 bones；只有原創兩秒 `NaturalCurl`，不含武器、正式皮革或人物接合。靜止幾何、三角拓樸與骨頭端點 exact 不變；130 頂點權重修正僅發生於原含 Thumb 權重的區域，其他原權重 exact。Blender float 權重誤差上限 2.9631e-8。

原始手來源仍為 `original-glove-joints/2026-10-07-v2/candidate/joint-rig.blend`，SHA `5871ce5ed506c7e29ae1aa06e7a3d6edf855f11af595ee691d47799f1c30c2e1`。原高模 Thumb component 的 36 seeds 經低模測地距離分出 114 shaft 頂點；局部軸重綁由 `original_glove_thumb_{ownership,skin,bind}.py` 重現。

## 根因與撤回

914／919 食指根部誤帶 Thumb3 36.63%／19.69%，確實會拉扯虎口。最初修復同時清掉 10 個非 Thumb 指縫權重；唯讀 consultant 發現這製造 1111／2065 真穿插。相同姿勢從 +0.156372 mm 分離變為 −0.081173 mm；兩項回歸測試先紅後綠，現已保留非 Thumb 混合。拒絕來源與證據在 `iterations/rejected-foreign-web-repair/`。

修正後 81 個同步姿勢中 16 個 SAT 零交叉，選用四指 30°／35°／20°、Thumb 20°／30°／20°的有限開合，並以實際 Blender／GLB 補驗 shared-vertex 接觸及連續取樣。這個姿勢只作變形樣本，不是完成的自然包握。

## 實際驗證

- 6 項 Thumb 權重與真實指縫回歸、5 項三角形 SAT 測試通過。
- `natural-motion-source.json` 與 `natural-motion-glb.json`：各 385 個連續取樣零非共面自交、零面積面片；來源骨長與迴圈端點檢查通過。GLB 最大曲面誤差 1.0410858e-6 m，skin matrix 9.08971e-7。
- `isolated-and-compound{,-glb}.json`：新版來源及實際 GLB 各 660 個單關節／局部複合姿勢通過。
- `natural-binding-preservation.json`：實際 Blender 幾何／骨架／權重符合上述來源契約。
- `natural-browser/report.json`：12 組姿勢／視角、真實 skin 播放／暫停、時間滑桿、拖曳、390×844、503 載入錯誤通過，page errors 為空。
- `natural-gltf-validator.json`：errors／warnings／infos／hints 均 0。`original_glove_natural_scene.ts` strict TypeScript exit 0。
- 本輪沒有修改 gameplay；未重跑全遊戲功能／效能驗收，既有歷史結果不能代替最終整合檢查。

## 品質界線與下一步

獨立檢核接受無穿插的同步彎曲局部進展，仍保留指腹球形、掌側溝、拇指缺少 opposition，以及原掌根 facet／腕口凹帶。`volume-probe.json` 是同姿勢 LBS／DQ 診斷：PIP 面積約 95.2–95.4%／99.7–100%，DIP 約 98.47–98.48%／99.8–100%，兩者零穿插、同視角外觀差異小。不能據此斷定主要外觀問題是嚴重 LBS 塌陷，也不能把 DQ 當成已匯出的改善。診斷腳本保存於本 run 的 `qa/volume-probe.py`。

接續先處理原創關節輪廓與拇指對握，確認外觀再整合真實握弩／全身。不要重跑相同失敗全域 SLSQP：`support-grip.blend`、`raw/grip-target.json`、`actual-surface.json` 仍是舊失敗實驗；新的同步開合沒有解決 weapon fit。所有工廠局部成果仍 `runtime_publish_allowed=false`，本輪不是完整角色、八兵種或地圖的商用驗收。
