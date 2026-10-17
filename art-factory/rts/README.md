# RTS 原創資產製作入口

風格唯一來源：`docs/superpowers/specs/2026-10-04-browser-rts-design.md`。所有代理沿用 `profile.json` 指定的 registry 與來源，不另建風格庫。

## 建築與石橋：模組組裝

原始 `modular-kingdom/2026-10-08-v1` 的 13 個候選仍保留效能失敗紀錄，不可直接發布。後續 `assembly-refinement/2026-10-08-v2` 已修整並本機發布兵營、馬廄、工坊及衛兵雙 LOD；其餘模型沿既有版本。新版正式 build 的 80 單位／20 建築／動態肖像壓力門檻已通過，詳見 `docs/games/rts-handoff-2026-10-08-refinement.md`。

## 庭院細修與人物輸出合批

新版仍使用上述唯一風格來源。`runs/assembly-refinement/2026-10-08-v2/kit.json` 保存衍生庫、13 份配方與來源鎖；**本輪只輸出並發布其中三棟**，其餘配方是未重新發布的來源參考。1 m 石緣、角石和三段入口台階真正跨三棟共用；修正坡面 winding、石材山牆與工坊柱頂接合。

`tools/courtyard_refine.py` 從鎖定的 v1 庫建立衍生庫，`tools/modular_assemble.py` 產生真正 linked Blender assembly 與材質合批 GLB。`raw/before/` 留存改前模型與 registry。土面使用既有原創 dirt-road WebP 的 RGB 原樣轉 PNG，不是新風格素材。

`tools/assembly_guard_candidate.py` 僅合批核心，保留 GuardBody、劍、盾節點及完整三角面／骨架／動畫資料，30 批次降至 11；原始可編輯人物零件與動作來源不動。它不是人物造型重製器。

```powershell
python art-factory/rts/tools/assembly_guard_candidate.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python art-factory/rts/tools/courtyard_refine.py
node art-factory/rts/tools/assembly_review_package.mjs
```

以上為本 run 的來源重現命令，會重建候選；不要用來覆寫後續人工編輯的庫。發布入口 `tools/assembly_publish.py` 檢查精確候選 SHA、零 GLB errors、資料與動作保留、畫面複核、55 FPS 壓力與 35 MB 下載門檻，再同步本機 runtime。重新產生的檔案若 SHA 改變，須重新驗證，不能沿用舊報告放行。[前後比較與庫下載](http://127.0.0.1:4334/assembly-refinement/)。

## 第一版組裝來源與工具

12 建築版本與 stone-bridge 的模組候選製作入口是 `tools/modular_assemble.py`。舊生成器與來源保留作溯源。零件庫、配方與 SHA lock 位於 `runs/modular-kingdom/2026-10-08-v1/`：

- `raw/kingdom-kit.blend`：87 個 Collection assets；Blender Asset Browser 分類在同目錄 `blender_assets.cats.txt`。
- `recipes/*.json`：13 份 prefab；窗／門透過宿主註冊接點組裝，其他部件使用剛體位置。
- `raw/assemblies/*.blend`：真正 link 同一庫的可編輯組裝檔；搬移時須一起攜帶零件庫，不能只搬 assembly。
- `kit.json`：part version、geometry/material identity、socket 與來源／recipe SHA。
- `candidate/*.glb`：合批遊戲輸出；`review/*.glb` 保留拆解結構，僅供檢視，不接 runtime。

PowerShell（在 RTS worktree 執行）：

```powershell
python art-factory/rts/tools/modular_contract_test.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python art-factory/rts/tools/modular_assemble.py -- all
node art-factory/rts/tools/modular_verify.mjs
node art-factory/rts/tools/modular_review_package.mjs
node art-factory/rts/tools/modular_browser.mjs
```

只重建單棟時將 `all` 改成例如 `townhall-tier2`。現有 v1 缺來源 lock 會停止；`--init` 僅限明確新 run。`modular_extract.py` 是鎖定舊來源的首次 ingest／重現工具，**不是編輯零件後的重新發布命令**，重跑會從舊來源重建庫。

修改零件要開新 run／版本，保存原庫，更新該 part version、library／geometry hash 與相容的接點契約，再從 recipe 重建所有受影響 prefab。`tools/modular_propagation.py` 實際示範隔離版本修改一個窗格、重建兩棟、其他件保持不變；它的 qa/propagation 產物永遠不允許發布。庫、接點與配方的 lock 不得為了繞過失敗而靜默刷新。

發布須經合約 `contracts/modular-kingdom.json` 的 QA、組裝檢視與受控 `tools/publish_modular.py`；預覽 `http://127.0.0.1:4334/modular-kingdom/`。人物、植被和其他道具仍走各自現有 registry；人物必須另建立共用骨架、bind pose、裝備插槽與蒙皮接縫驗證，不能將靜態建築拆法直接套用。
