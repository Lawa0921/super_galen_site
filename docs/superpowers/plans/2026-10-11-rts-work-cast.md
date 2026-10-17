# RTS 工作與施法動作計畫

沿用完整遊戲授權、10-04 spec 與 10-09 收尾計畫。主代理唯一寫入者；不推送或部署，不新增局部使用者批准關卡。使用 `game-art-asset-pipeline`，asset-level manual review=false；使用者仍在整體交付時驗收美術。

## 範圍與契約

- Worker 新增 Mine／Chop／Build（修理映射 Build）；Priest 新增 Cast；Commander 新增 CastCleave／CastMend／CastBanner。三種工作／各技能必須在 gameplay 鏡頭可辨，不能只複製 Attack 換名。
- 唯一風格來源維持 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。沿用 registry 指向的 worker procedural-gauntlet source、priest／commander masked-v2 source；保持材質、bind、rig、五個已發布 clips、TeamCloth 與 texture。v2 唯一幾何例外是把既有統領長劍繞握點 X180 旋轉，修正劍刃朝向前臂的既有錯誤；不創建新幾何。
- 原 run `art-factory/rts/runs/work-cast/2026-10-11-v1/` 保留 QA 失敗證據及原工具。現行候選在 `2026-10-11-v2/`，原 `.blend`／六個 GLB 維持 hash 鎖定。衍生 `.blend` 包含新 actions 及劍朝向修正；GLB 只追加新 animations／長劍 POSITION、NORMAL，另增加涵蓋所有動作的裁切資料。原 BIN prefix、其他幾何與舊動畫精確保存。
- 接觸／地面檢核採現行 gameplay／portrait 相機標準，不重開已撤回的毫米級造型要求；機械與瀏覽器 QA 仍須證明武器隨手、腳貼地、無可見破面。
- Work 不新增 simulation state：只有 `animation==='work'` 時才從 order 與 TeamView 可見 resource／building 選專用 clip；霧外 target 保持 generic work fallback。走近、返倉與停止時不得誤播。
- 新增獨立 `castCue {kind,sequence,startedAt}`，成功技能／牧師治療才產生；死亡清除。效果、mana、cooldown、order、傷害 tick 不變。
- Cast 由 simulation age 播放一次，完整動作壓在 0.60 秒內；優先序 death > active cast > attack > hurt > work/base。過窗不循環牧師殘留的 raw cast；普通攻擊從既有 cue age 接續，不重播。
- 已接受取捨：統領技能後若原攻擊 order 下一 tick 發出普通傷害，Cast 短窗會遮普通 Attack 前約 0.55 秒，最多一發；傷害原樣即时結算。只有 guard 使用延後 contact，這條路徑不得受影響。移動中的施法觀感仍須實看，不可用單元測試代替。

## 有限工作包與驗收

- [x] **來源與新增動畫工具。** contract/source locks；純 Python append-animation 先 Red，覆蓋保留原 binary／JSON、node remap、缺骨／bind 不符拒絕、重複名稱拒絕，再 Green。來源不覆寫，所有修正只寫衍生候選。
- [x] **七段候選動作。** 同一 `.blend` 匯出雙 LOD 動作，合併到鎖定 GLB；機械驗證舊五動作與全部非動畫資料保留、新 clip 不等同 Attack、兩 LOD 時序一致、地面／握持與 glTF validator。QA_FAILED 不接 runtime。
- [x] **呈現 Red → Green。** 真實採集／施工／修理、成功與失敗施法、重複施法、cast 中普通攻擊／死亡、pause、同 age RAF、過期與迷霧重現、兩 LOD／缺 clip、hurt 與 stale cast；既有傷害／經濟速率逐 tick 保持。
- [x] **組裝 QA 與受控本機發布。** 先候選 route 在實際 Three.js／兩 LOD／兩隊／gameplay 與 portrait 留圖。主代理實看後才更新 published GLB、unit/runtime registry、來源鏈與 audit；另做來源權限 fingerprint，保留整體使用者驗收 pending。
- [x] **新版驗證。** 全套177檔／1806項、strict RTS TS、現production build、三瀏覽器真實工作／技能及相關回歸、原規格正式效能與下載門檻通過，獨立 consultant APPROVE。自然玩家與AI兩圖勝負皆通過；完整商用品味與本機提交收尾依總計畫，不把此包稱作使用者整體批准。

## 設計檢核

2026-10-11 consultant 依 spec → economy/combat/hero → view/scene/models → assets 追查：只做通用 Work／Cast 不足；統領目前 cast 下一 tick 即被清掉，牧師可能循環 1.8 秒。裁決採七個專用 named clips、可見 view 推導工作語意、0.60 秒 cast cue，不新增重複 work state。詳細反例與來源待寫入本包 QA；無外部阻礙。

## 2026-10-11 實作與候選證據（仍未發布）

- 程式 Red：新模型／simulation 測試 18 fail／1 pass；場景 routing 1 fail／5 pass。Green：相關 7 files／114 tests。全站 173 files／1767 tests 通過（93.44s），RTS 118 TS files 加新 E2E strict check 通過，Astro build 通過（26.68s）。證據在 v2 `qa/vitest-full.log`、`typescript.log`、`build-site.log`；初次 Red 在 v1 `qa/`。
- `castCue` 僅成功技能／治療產生，死亡清除。場景用可見 TeamView 推導 Mine／Chop／Build；模型依 simulation age 播 .6s Cast，保留傷害／經濟／mana／cooldown 原語意。readonly consultant 已核准此範圍；10/07 牧師明示 order 優先規則仍保持。
- v1 實景診斷確認武器未遺失、culling／DoubleSide 不是根因：牧師把杖尾伸向目標；統領既有劍刃朝手腕。v2 牧師逐 frame 解父骨矩陣保持 Hand_R 的 Idle 世界方向；統領在雙 LOD GLB 及 editable blend 同步繞 leather-grip bounds 中心 X180。獨立顧問已確認兩缺口關閉。
- 19 個 Python 測試通過（animation append 8、bounds 5、rigid transform 2、candidate 4）；6 GLB validator 零錯誤。bounds 審查後補了實際時間序列密度驗證，normal／`-O` 都通過。candidate 4 tests 鎖定舊 BIN、允許例外外完整 JSON、每個劍頂點的旋轉、雙 LOD 曲線及原來源 hash。
- v2 `qa/diagnosis/report.json`：原 exported key + 60Hz + bind pose 全動作裁切檢查六 GLB 全 pass；`ground.json` 全非 Death 動作零超界、最低全模型 -1.673mm（既有身體基線，在 15mm 門檻內）、牧師 Cast 杖身相對垂直最大約 1.000006°（Idle 本身 1°）。Death 仍納入 bounds，ground 的倒地姿勢不以站立門檻判斷。
- 候選路由三瀏覽器 E2E 3/3 通過（1.5m）：真實 gather/resume/repair/cast、八個示範角色、兩 LOD、暫停 pose/time 穩定、技能過窗回 Idle、實際資源模型同框與三種肖像。圖及 evidence 在 v2 `qa/gameplay-candidate/{chromium,firefox,webkit}/`。這是 staged assembly，不能當自然對局成果。
- **下一個驗收項：移動中 Cast。** 新 clip 的腿仍是 Idle；需補實景與 regression，確認是否滑步，必要時組合既有 Walk 的下半身與 Cast 上半身，不能藉由停下 simulation movement 修飾。處理完才做受控本機發布、registry/source audit、發布後 E2E、正式效能／下載門檻與總計畫收尾。

## 2026-10-11 移動組裝與本機換版

- 已關閉上節移動缺口。`cast-locomotion.ts` 快取 Root／Pelvis／雙腿的 WalkLower 與上半身軌；施法上半身依 cue age，腿依實際速度與 dt。入場上半身的 Walk 樣本固定在入場 phase，出場 0.15s 淡回相同 phase 的完整 Walk；shared LOD 只更新一個 mixer。
- 新 regression 初次 8 fail／1 pass；另以 Red 捕捉出場死亡殘留與 partial clip 沿用舊技能。修後 13 個 locomotion 案例覆蓋四技能、同 age、pause、新序列、走停切換、death/attack/hurt、共享與獨立 LOD。consultant 複審 APPROVE。
- `qa/moving/report.json`：8 個 walk phases × 36 個 60Hz cast samples × 4 技能，每次檢兩隊雙 LOD，共 1,152 組姿勢，零 bounds excess／pageerror。最低頂點 priest 0.011048m、commander 0.012771m；牧師 entry 沿用 Walk，杖最大15°，穩態代表幀約1°。主代理與唯讀視覺顧問實看實景及代表姿勢；有限組裝核准，不替代整體品味驗收。
- 候選及正式路徑各三瀏覽器 3/3 通過：四種真實工作／四種移動施法、雙 LOD、三種選取肖像、實際 pause/resume 與返回 Walk。`qa/e2e-moving-three-browsers.json`、`qa/e2e-published-three-browsers.json`；正式一輪 1.7m。先前 debug pause 只設 state，沒有暫停 clock，測試已改用真正暫停按鈕；沒有因此修改 production pause。
- 本機六 GLB 於 `qa/root-review.json` 逐一綁定、publisher dry-run 後接入；publisher 8 tests 包含 hash／契約拒絕、部分寫入與 replace 失敗復原，與其他 Python gates 合計27 tests。`raw/runtime-before-publish/` 保留九個正式目標原件；unit registry 保留完整 `work_cast_previous` 與 source-lock hash。root-review 與原 build/WebGL/source-lock 是各階段證據，歷史候選 flag 不代表當前發布狀態；當前狀態以 contract/registry 為準。
- runtime audit：127 件實檔及已宣告來源 SHA 通過、`source_binding_complete:true`。來源測試改驗 worker 精確八段 clips，追溯衍生 source → locked 原始 `.blend`／GLB，逐 primitive fingerprint 與原 worker 相同；未弱化受限幾何 denylist。舊 `published-unit-source-audit.json` 的16個hash過時，新增回歸先失敗後以現檔/registry重算，保留舊報告及原 rights 判斷；53項來源測試通過。
- 正式 build 26.26s 通過；strict 120 RTS TS files 加 E2E／QA tools 通過。換版前完整174 files／1,780 tests，換版後新增來源報告回歸的完整重跑174 files／1,781 tests通過（116.44s）。
- 換版時正式效能：60秒、1080p／80 units／20 buildings／動態騎士肖像、3,708 frames，median 60.61 FPS、p95 18.9ms、max174.8ms，零pageerror、門檻通過。`qa/performance/`；保留先前量測波動，不宣稱此次改動帶來效能改善。兩圖新版下載驗證通過：資產 river 27,635,702／pass 28,190,156 bytes，含程式全部本地傳輸27,896,233／28,450,687 bytes。
- 整體剩餘：最新版本自然對局、美術／聽感總檢、commercial-readiness manifest與本機 commits，仍依10-09總計畫；不push/deploy，也不要求使用者做局部驗收。

## 2026-10-11 祭司停步後的步態連續性

獨立追查確認 Hero 真實指令不會先 render raw Cast，但 attack-move 祭司的治療 tick 會停步，下一 tick 恢復 Walk。新增真實兩 tick 狀態回歸，並將動畫測試加入非零 Walk → full Cast → 同 cue 移動、shared／independent LOD、原停步／恢復的精確 lower pose 比較。有效 Red 為4 fail／24 pass。`models.ts` 以同一施法序列保存最後步態，過期、新序列與死亡清除；未改治療／移動規則。38項相關測試與 consultant APPROVE。

此修正版全站174檔／1787項通過（111.23s），strict TS、build（20.17s）、正式素材三瀏覽器3／3通過（1.5m）。`qa/gameplay-priest-resume/` 保留新圖，未覆寫 root-review 已綁定的舊證據。主代理實看移動 gameplay 與牧師／統領實際肖像。

下載仍為 river 27,635,702／pass 28,190,156資產bytes，程式增加47bytes；全部本地傳輸27,896,280／28,450,734bytes，皆通過。效能首次59.52FPS／p95 22.3ms／max551.4ms，複驗58.82FPS／p95 24.0ms／max675.5ms；兩次都因max須小於500ms而失敗。原報告完整保留，下一步改用CPU profile診斷，不把早期通過結果當成本次通過。
