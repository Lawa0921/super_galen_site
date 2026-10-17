# 原創弩兵握持候選交接

原始目標仍是原創人類王國 RTS、對戰電腦、兩張小地圖、所有兵種會動的 3D 大頭貼與可商用角色。使用者明確要求模型、骨架、動作全部原創。此輪是局部角色製作進展，整體目標未完成；沒有修改或發布 runtime。

## 固定產物

- Run：`art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1`
- Blender：`candidate/support-grip.blend`，SHA `b05805b24108e02925367df76c4d8c9a98400fe7286df3e69cd0ee130b4d8da0`
- GLB：`candidate/support-grip.glb`，SHA `fda440046273653881e0a233d616628ac83c5fe8a2620700cb2c2f003c1d33b1`
- Preview：<http://127.0.0.1:4334/glove-weapon-fit/>
- 截圖：<http://127.0.0.1:4334/glove-weapon-fit/still.png>
- 原遊戲：<http://127.0.0.1:4324/games/rts/>；本輪未重新驗收整個遊戲或效能。

## 實際結果

8 個數學／回歸測試通過，包含先紅後綠的「所有頂點在物件外，但三角面仍穿透」案例及根骨 swing。源 Blender、實際 GLB 各 385 個姿勢（含 key 之間），手部自交與完整武器相交皆為零。碰撞檢查範圍是非共面三角面穿越，不能冒稱數學上連續碰撞證明。

五指各三個實際接觸頂點距握把 0.700–1.486 毫米，法向對向值至少 0.674；兩個遠端掌墊區的平均間距低於 3 毫米。原靜止表面、拓樸、全部權重、骨頭端點保持不變。GLB 最大表面誤差 1.929 微米、武器頂點誤差 0。385 姿勢結果與候選 SHA 在 `qa/actual-surface.json`、`qa/actual-export.json`。

Chromium 15 組視角／姿勢、播放／暫停、實際蒙皮變化、時間軸、滑鼠旋轉、390×844 窄版、模型載入 503 錯誤回饋通過。GLB validator 錯誤、警告、資訊與提示均為 0；檢查頁 TypeScript strict 通過。這些是局部 factory 頁驗收，不是全站或整局驗收。

## 判斷與未完成

獨立檢核接受為局部原創握持候選進展，但保留 P2：四指 MCP 幾乎未彎、主要以 PIP 勾住握把；拇指對握感不足。這會阻擋動態肖像與商用品質。因此 contract 與 screen manifest 為 `qa_failed`、`runtime_publish_allowed: false`。

下一步須改善自然握持（MCP／拇指 opposition），並維持目前實際接觸與穿透驗證；再套回完整弩兵，檢查前臂、袖口與裝填箭矢動作。完整角色材質、其他兵種、地形岩岸／遺跡仍未全部達標。不能因本輪機械檢查通過而略過這些要求。

## 可重現流程與陷阱

工具依序：`original_glove_grip_extract.py` → `original_glove_grip_solve.py` → `original_glove_grip_path.py` → `original_glove_grip_build.py` → `original_glove_grip_export.py` → `original_glove_grip_export_verify.py`／`original_glove_grip_contact_verify.py` → `original_glove_grip_package.mjs` → `original_glove_grip_browser.mjs`。Blender 工具使用 5.2.1；數值工具使用專案外既有 Hunyuan venv 的 Python／NumPy／SciPy。不要重跑前輪已封存的 roots/joints 建置。

Solver 以封存的 `iterations/contact-pads-v5/grip-target.json` 為固定 seed。最終 target SHA `fea0a2861ed66ad0dd2437193573c4c4d5b932b53c30c9b19681548cc154432a`，重跑求解與路徑選擇後 JSON 完全相同。握把 source +Y 經兩次剛體旋轉成手部橫向；完整武器幾何／UV／材質一併保留。

最初使用 armature 物件平移，GLB inverse bind 產生 5 毫米偏移，已隔離該版。最終保持 armature 物件為 identity，把進退放在 Hand_L 根骨；附帶匯入的舊 Idle action 已移除，最終只有 SupportGrip。早期 penalty-only、vertex-only、過低 palm 接觸目標與 thumb-only 進退失敗皆保留為診斷，不能恢復為候選或 runtime。
