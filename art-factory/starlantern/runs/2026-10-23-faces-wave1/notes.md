# 2026-10-23 夥伴對話表情第一輪（18 張，codex）

- 依據：`../expressions-proposal.md` 第一輪；使用者 2026-10-23 決定全部用 codex（「當然是用 codex 的」）。
- 生成：`faces.py gen`，codex 預設模型 `gpt-6-astra`（codex-cli 0.164.0），一次一個，各在新的空資料夾，每個 id 一次。共 **16 次呼叫**（重做 2 張 sad＋14 張新的），全部有輸出，沒有遇到 usage limit。serious 沿用樣本的 codex 版本（scarlet a3、chizuru a4）。
- prompt：`sad` 加強成「眉頭內側上揚、眼睛濕潤帶一滴淚、嘴角明顯下垂、頭微低，小尺寸也要看得出來」；`hushed`、`shaken` 也加上同樣的提示（`faces.FACES`）。其餘照 spec §10.5。
- 後處理：`sl_art.py process --kind sprite`，用 normal 頭貼自己的 block，`allow_edge: [bottom]`；`faces.match_qa` 對照 normal。codex 的圖不套 Gemini 用的修補旗標（`registry_fields` 會把它們清成 null）。
- 登錄表：18 個 `char-<cid>-portrait-<mood>`，`status: qa_passed`、`generator: codex/gpt-6-astra`、`batch: faces-<cid>`、`depends_on` 是該角色的 normal 頭貼與立繪。runtime 路徑已填，但**圖還沒發佈**（不在 `public/`），要等使用者核准。
- 被淘汰但保留的：Gemini 候選（scarlet serious/sad a2、chizuru serious/sad a3）、第一版 sad prompt 的 codex 候選（scarlet sad a3、chizuru sad a4），以及沒有出圖的 a1、a2，都記在各自的 `rejected_attempts`，檔案留在 `work/<id>/cand/`，不在 runtime 路徑。

## QA

18 張全部通過：magenta 殘留 0、半透明 0、只碰底邊；尺寸和 normal 完全一樣（差 0, 0），block 相同，normal 色盤占 99.6–99.9%。封閉洞警告 0–13 個（千鶴最多，在髮飾花圈和蝴蝶結裡），都是 1 px 的真縫。

## 目視判斷（原尺寸、2×、3×）

- 讀得很清楚：scarlet sad、shaken；chizuru serious、sad、solemn（閉眼）；sylvie serious、sad；safira sad；liz sad（有淚）、hushed；bobby serious。
- 比較弱：
  - **scarlet vow**：和 serious 很像，按在胸口的手在原尺寸下幾乎看不出來。
  - **selene sad 與 wistful**：兩張都是垂眼，差別小；wistful 的淺笑又接近她本來就在笑的 normal。
  - **noel sad**、**bobby sad**：看得出難過（眉尾上揚、嘴角下垂），但比其他人淡，沒有明顯的淚。
- 每個 id 都還有 1 次額度，如果使用者覺得上面幾張不夠，可以再生一次。

## 接進遊戲（2026-10-23）

- 使用者核准第一輪 18 張先接進遊戲看看（「可以先這樣接進去看看」）。比較弱的幾張（scarlet vow、selene wistful、noel 與 bobby 的 sad）先照現在的用，之後可能重做。
- 發佈：`sl_art.py approve`（`approved_by` 記下日期與原話）→ `sl_art.py publish --approved`。18 張複製到 `public/assets/games/starlantern/char/<cid>-portrait-<mood>.png`，manifest 從 410 筆變成 428 筆。Gemini 和其他淘汰的候選都不在 runtime 路徑。
- 程式：`render/artPaths.ts` 的 `PUBLISHED_FACES` 加上這 18 張；`ui2/story.ts` 的 `faceOrder` 讓夥伴的沉重台詞先找自己那張表情，找不到再照 `GRAVE_FALLBACK` 往下找（shaken→sad、solemn→serious、vow→serious、distant→wistful→sad、wistful→sad），都沒有才隱藏頭貼。莉茲的 `hushed` 用她的 hushed 頭貼。洛恩和凜不變。
- 涵蓋：劇本裡夥伴的沉重台詞 107 句，**107 句都有臉，0 句隱藏**；莉茲的 hushed 8 句也都有臉（`ui2/storyFaces.test.ts`）。莎菲拉和諾艾兒沒有 serious 台詞，所以缺 serious 頭貼也不影響。
- 遊戲內截圖（1280×720，headless、靜音）：`ingame/scarlet-sad.png`、`chizuru-solemn.png`、`selene-wistful.png`、`liz-hushed.png`、`bobby-serious.png`。這些都是回憶場景，所以頭貼套用遊戲原本的回憶色調（偏褐）。現在沒有任何沉重台詞還會隱藏頭貼，所以沒有「隱藏」的截圖。
