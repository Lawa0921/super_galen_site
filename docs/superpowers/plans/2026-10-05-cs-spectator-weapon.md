# 隊友觀戰武器呈現

**目標：** 死亡後的隊友視角共用同一 actor 來源驅動鏡頭、第一人稱槍、瞄準、換彈、槍口特效與彈藥 HUD。沿用已核准 GLB，不接入被拒角色候選。

**規格：** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`。維持死亡輸入封鎖、0.65 秒死亡視角與下一回合恢復。主代理唯一寫入；沿用目前隔離 worktree。不提交或發布。

**資料契約：** `selectViewActor` 的結果是呈現對象，`actors[0]` 繼續持有玩家控制與勝負身份。活玩家用本機即時 aim，觀戰用隊友 actor.aim；scope 與 gun visibility 同一影格更新。切換對象重設武器慣性與舊視角彈殼/槍口光，保留世界彈痕與事件序號。換彈音效切換時從現有進度開始，不補播前一階段。

- [x] 先新增失敗測試：隊友射擊的第一人稱 muzzle/casing、切換不帶走舊特效；換彈 cue 對象切換；瀏覽器武器/HUD/ADS/reload 同步及死者輸入邊界。
- [x] 修改 renderer、client、combat-effects、feedback，保持既有資產、物件池與傷害規則。
- [x] 通過相關 unit、完整 Vitest（133 檔／1384 項）、全部 CS Chromium（41 項）與 build；實際截圖檢查四槍、狙擊鏡及換彈，縮小觀戰卡。獨立檢核未發現確定缺陷。
- [x] 保存本輪前後 hash、diff 與驗收結果至 `tmp/cs-spectator-weapon-v1`，交付 4002 預覽；不把有限效能樣本宣稱為所有硬體保證。

**未通過的效能條件：** 初次高／低畫質各 60 秒，觀戰段均無慢幀，但存活／回合結束段分別出現最長 3599.8／2350 ms RAF 間隔；long task 記錄為 0。未改程式的低畫質 CPU 診斷另跑 60 秒未重現，最慢 16.8 ms。保留兩組證據，不宣稱效能修好。下一步應改以 browser compositor／GPU tracing 加獨立計時器心跳辨別 RAF 排程與主執行緒活動，不再反覆原路量測直到取綠。

**後續美術診斷：** anchor-wrap 已封存拒絕。獨立顧問建議 primary final 固定掌位/手指，以既有 palmRoll 繞 targetLong 測量 −10/−5/0/+5/+10 度五姿勢；不追加 finger fit，不混入 yaw，不放寬兩節接觸門檻。該診斷尚未執行，需獨立契約。
