# 星燈迷宮 季節、日夜、月相（第 4 項）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 遊戲有一本確定性的日曆：一天是一次出發（或在旅館多住一晚），月相由天數推出，四天一輪；季節跟著劇情走（第三幕之前是秋，第三、四幕是冬，終幕之後一個月相週期入春）。日曆只影響劇情與畫面：
- 瑟蕾的第 2、4 片只在滿月掉，第 5 片只在新月掉；
- 凜的揭露由劇情指定在夜晚；
- 城鎮看得到季節與月相；
- 夜晚的暗幕隨月相變色；
- 瑟蕾的夜晚拍子不再說錯月亮；
- 終幕之後的第一個春天，千鶴的小祠辦春祭。

另外修兩個舊帳：`useFieldItem` 會把祭壇留下的超量 HP 壓回上限（要修）；技能分頁的 TP 與 `fieldCost` 同價（已查證是對的，只加守門測試）。戰鬥模擬逐位元不動。

**Architecture:**
- **日曆是純資料**：`story.day` 一個整數存在存檔裡。月相、季節、時段都由純函式推出，不讀現實時鐘（story-world spec §11.1、§12）。
  - `engine/calendar.ts`：天數算術，沒有其他依賴；
  - `engine/story/events.ts`：`calendarOf(s)`，它需要 `storyStage`。
- **碎片過濾帶日曆、期望值不帶**：
  - `PieceCtx.cal?` 沒給時，`when` 一律成立。
  - `expectedMemories`、`memoryPace`、模擬閘門都不給日曆，所以模擬逐位元不變。
  - 只有 `Game` 給日曆。
- **保底不看月亮**：
  - `pityAfterFloor` 照舊不帶日曆，所以瑟蕾在等月亮的那幾層，保底照樣累積；
  - `forcedGlimmers` 帶日曆，所以月相對上的第一層，她的光點一定出現。
- **時段是演出用的**：
  - 迷宮裡一律算白天；
  - 回城那一夜，以及劇情指定在夜晚的場景（`SCENE_TIME`），算夜晚。
  - 夜晚的暗幕加上月相的色調（只用 CSS）。
- **寫作任務**照 Story L 的 W 步驟做，加一位全新讀者冷讀。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`（下稱 world §），以 §11.1 為主，也讀 §5.2、§6 瑟蕾、§12。還要讀：
- `docs/superpowers/specs/2026-10-23-starlantern-story-structure-design.md`（下稱 L §），§4（夜晚、清晨、下潛前的那一夜）、§11、§12；
- `docs/superpowers/plans/2026-10-23-starlantern-story-structure.md`（下稱 L 計畫），格式、收尾 G、W 步驟都沿用它；
- `docs/superpowers/story/starlantern-style-bible.md`（聖經）、`docs/superpowers/story/starlantern-lore-ledger.md`（帳本），特別是 I-61、I-118、I-158、I-195；
- `docs/superpowers/plans/2026-10-19-starlantern-plan6f-field.md:499-501`（兩個舊帳）。

**範圍外**：
- 月相或季節影響戰鬥、掉落數值或商店（裁定 9）；
- 採集（第 5 項）；
- 新美術、新字級；
- 舊存檔遷移（使用者：遊戲還沒上線）；
- 季節在終幕之後繼續輪轉（裁定 6）；
- 城鎮選單的日夜切換（裁定 8）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-24-starlantern-time-moon/`，下稱 SDD。行號是 `5fb74d460` 的位置，只用來定位，動手時一律用內容找。

## 計畫裁定

使用者把劇情的決定權交給我們（「你應該要作為專業編劇編寫適當的劇情」）。下面每一條都是定案，不是待問的問題。標「設計者裁定」。

1. **設計者裁定：一天是什麼**。
   - `story.day`：今天是第幾天。新遊戲沒有這個欄位，讀成 1。
     - 序章那一夜是第 0 天的夜晚；
     - 第一次出發在第 1 天。
   - **一天＝一次出發**。回城的那一夜屬於出發的那一天。
     - `Game.arrive` 把回城的白天和夜晚都排好（L §4.6）之後，`story.day += 1`，和回城一起存檔。
     - 所以城鎮選單永遠是「隔天早上」：和現在的清晨（L §4.8.1）、旅館的「──隔天早上」一致。
   - **在旅館多住一晚，也是一天**。`rest` 讓 `story.day += 1`，和住宿一起存檔。
     - 這一晚沒有回憶：夜晚的排程只在回城時做，L 的規則一條都不動。
     - 想等滿月的玩家可以花錢等，這是給玩家的掌控感。
   - **不推進天數的事**：
     - 讀檔（`Game.boot`）；
     - 出發。迷宮裡沒有存檔，讀檔回到城裡，再出發還是同一天；
     - 在迷宮裡走幾層都一樣：一趟就是一天。
   - 全滅（`wipe`）、歸還之燈、走回城、終幕通關後的回城，都走 `arrive`，都算一天。
   - 上限 `MAX_DAY = 999999`，到頂就停在那裡。理由同 `MAX_PITY`：長期遊玩也不會寫出讀不回來的存檔。
2. **設計者裁定：月相**。
   - 順序 `MOON_ORDER = ['new', 'waxing', 'full', 'waning']`（沿用 `data/story/chains.ts:4` 的 `MoonPhase`）。
   - **四天一輪**，一天一相：`moonOf(day) = MOON_ORDER[((day + MOON_EPOCH) % 4 + 4) % 4]`，`MOON_EPOCH = 2`。
     - 所以第 0 天（序章那一夜）是滿月，第 1 天是下弦，第 2 天新月，第 3 天上弦，第 4 天又是滿月。
   - **為什麼是四天**：試過八天一輪、每相兩天。照劇情結構 Task 6 的三種玩家（每層、每兩層、每三層回城）推算：
     - 每三層回城的玩家，瑟蕾第 2 片要到約第 22 層才掉，第 5 片落在終幕之後；
     - 四天一輪時，推算是第 5 片在第 18／19／28 層（每層／每兩層／每三層）。
     - Task 3 實測這組數字。
   - **今天的月亮**：`moonOf(day)`。它照著這一天的出發，也照著這一天結束的那一夜。
   - **今晚的月亮**：`tonightMoon(s) = moonOf(dayOf(s) - 1)`。
     - 回城時天數已經加一，所以剛回城、正在說的那一夜，就是前一天的夜晚。
     - 下潛前的那一夜（`finale-eve`）在出發時播，說的也是前一晚。
     - 終幕清單裡的那一夜，是在迷宮裡播的，同樣是前一晚。
     - 序章那一夜：新遊戲讀成第 1 天，所以是 `moonOf(0)`，滿月。
   - 名稱沿用戰鬥的用字（`data/text.zh-TW.ts:210`）：新月、上弦、滿月、下弦。
     - 日曆的 `waxing` 對應戰鬥的 `first`；
     - 一個測試釘住兩邊同名，不讓兩套月相的叫法分岔。
3. **設計者裁定：碎片怎麼過濾**。
   - `data/story/chains.ts` 新增 `interface CalendarNow { moon: MoonPhase; season: Season; time: 'day' | 'night' }`。
   - `whenHolds(w?: When, cal?: CalendarNow)`：
     - 沒有 `w` 或沒有 `cal` 時成立；
     - 否則 `moon`、`time`、`season` 三個欄位，有寫的都要符合。
   - `PieceCtx` 多一個 `cal?: CalendarNow`。`eligible` 把它交給 `whenHolds`。
   - `Game` 在三個地方給 `calendarOf(this.state)`，時段是 `day`，因為迷宮裡一律算白天：
     - 光點拾取（`game.ts:377`）；
     - 強制光點（`:417`）；
     - 菁英與頭目（`:744`）。
   - 一趟裡天數不變，所以生成光點時和拾取時看到的是同一個月亮。
   - **保底**：`pityAfterFloor`（`:622`）照舊不帶日曆。
     - 瑟蕾在深度與地區都符合、只差月亮的那幾層，保底照樣加一。
     - 月相對上的那一趟，`forcedGlimmers(…, cal)` 在第一層就替她放光點。
     - 寫進說明：「月亮沒到的晚上，她在等；等夠了，滿月那一趟的第一層，一定有她的光點。」
   - **【審查修正 1】月相保底不佔兩條的上限**：
     - `forcedGlimmers` 一層最多強制兩條（`FORCED_GLIMMERS.max`），依 `CHARACTER_IDS` 順序取（`memories.ts:93-101`）。洛恩、凜、千鶴、波比都可能排在瑟蕾前面把位置佔滿，「第一層一定有她」就不成立。
     - 裁定：**只有給了 `cal` 時**，「在等月亮」的那一條另外加在上限之外。條件是：下一片有 `when.moon`、`cal.moon` 符合、`eligible`、保底 ≥ `MEMORY_PITY`。
       - 所以那一層最多三個強制光點。實際上只有瑟蕾有月相條件，最多多一個。
       - 結果順序：照舊的前兩條在前，月相那一條接在後面，不重複。
     - 不給 `cal` 的路徑（`expectedMemories`、`memoryPace`、`walkFloor` 的預設、模擬閘門）完全照舊，所以模擬逐位元相同。
     - 下潛快照：`Game` 會給 `cal`，但快照裡瑟蕾沒有被遇見（`dive.json` 的 `selene: 0`），沒有任何一條在等月亮，所以快照不變。Task 2 要在報告裡寫出這兩件事的查證（grep 呼叫點與快照內容）。
   - **期望值不帶日曆**：
     - `expectedMemories`、`memoryPace`、`walkFloor` 的預設行為不變，`knobs()` 不變，模擬閘門逐位元相同。
     - 代價：期望值裡的瑟蕾比實際早拿到第 2、4、5 片。這和「寶箱與寶庫的碎晶沒算進去」是同一類已知的誤差，寫進 `expect.ts` 的說明。Task 3 量出差多少。
4. **設計者裁定：瑟蕾的碎片表不變**（world §11.1 的提案照用）：
   - 第 2、4 片滿月；
   - 第 5 片新月；
   - 第 1、3 片不限。
   - 手冊對未找到的那幾片，提示多一段月相：`本道、霜凍之地・深處・滿月`。
   - **【審查修正 3】終幕時第 5 片還沒掉**：什麼都不會錯過。
     - 第 5 片的條件在終幕之後照舊：本道或霜凍之地、第 15 層以後、新月。終幕之後照常出發就會掉，回憶照 L 的規則在之後的夜晚說，手冊照舊標新。
     - 審查已查證：
       - 等瑟蕾集滿的閒聊 `banter:rin-selene:2`、`banter:noel-selene:3` 不會過期，晚一點照樣播；
       - 瑟蕾不在 `HOME_OWNERS`，沒有歸鄉場景會因此錯過；
       - 終幕裡她的台詞本來就有「集滿」與「沒集滿」兩種讀法（L）。
     - 所以不加任何補救規則，也不在終幕強制給第 5 片。
   - 提示用「新月」兩個字。帳本 I-158 要擋的是瑟蕾**自己說出口**的「新月」，因為那是她第 5 片的揭露；介面上的月相名稱不揭露第 5 片的內容。城鎮的日曆本來就會顯示「新月」。
5. **設計者裁定：劇情指定時段（world §5.2、§11.1）**。
   - `data/story/scenes.ts` 新增 `SCENE_TIME: Partial<Record<SceneId, 'night'>>`，與 `sceneTime(id): 'day' | 'night'`：
     - 回憶一律算夜晚（L：回憶在城裡的夜晚說）；
     - `SCENE_TIME` 裡的算夜晚；
     - 其他算白天。
   - `SCENE_TIME` 只放兩個：
     - `'rin-reveal'`：觸發它的那次回城就是那一夜；
     - `'season:spring'`：春祭在晚上（裁定 7）。
   - 效果：
     - 城鎮播一個夜晚的場景時，暗幕帶今晚的月色（裁定 8）；
     - `calendarOf(s, sceneTime(id))` 的 `time` 是 `night`，留給第 5 項。
   - 不改揭露的排程（L 的 `ALONE`、必需回憶、清晨的擋法都不動），也不改它的台詞。
     - 揭露的第一句寫的是「窗外星燈的光很淡」，沒有說月亮，所以任何月相都說得通。
     - 這一場不強迫月相。強迫月相，日曆就會跳號。
6. **設計者裁定：季節跟著劇情走**。
   - 劇本裡現在式的季節是秋到冬：
     - 希爾薇說波比像「入冬前的松鼠」（`banter:bobby-sylvie:1`）；
     - 千鶴說「這一回，我會等到春祭」（`home:chizuru`，I-118）。
   - 如果季節照天數走，一個走得慢的玩家會在夏天聽到入冬的台詞。所以：
     - `storyStage` 是 `prologue`、`act1`、`act2`：秋；
     - `act3`、`act4`：冬；
     - `after`（終幕通關）：冬，直到 `story.springDay`；從那一天起是春，之後一直是春。
   - `springDay`：
     - 終幕通關時（`game.ts:758`）寫入 `dayOf(state) + SPRING_AFTER`，`SPRING_AFTER = 4`，也就是一個月相週期。
     - 終幕之後的第一個晚上是星燈祭（`epilogue`），還是冬天；過一輪月亮，春天才來。
   - `finaleCleared` 為真而 `springDay` 不存在時，讀成已經是春天。這是讀取的預設值，不是遷移。
   - 終幕之後不再輪轉季節。第 5 項需要時，只要改 `seasonAt` 這一個函式。
   - `When.season` 照樣實作並有測試，但這次沒有碎片使用它。
7. **設計者裁定：春祭（季節的劇情回報）**。
   - 場景 id `season:spring`，種類照 `home`：
     - 劇情播放設定的處理和歸鄉相同；
     - 手冊放在千鶴那一頁、`home:chizuru` 的後面，標題「春祭」；
     - 句數上限 10，調性輕。
   - **【審查修正 4】何時、排在哪裡**：它是**夜晚**的場景，不進白天的 `story.queue`。
     - **條件**：三個都成立的第一次回城，播一次。
       - 這次回城的那一夜是春天（用出發那一天算）；
       - `home:chizuru` 在**這次回城之前**已經看過，所以它一定在歸鄉之後的回城；
       - `season:spring` 還沒看過。
       - 千鶴還沒集滿就等著。終幕之後一直是春天，所以它不會錯過。
     - **怎麼排**：走 L 的反應槽（`arrivalScenes`，`events.ts:287-299`）。
       - 新函式 `nextSeasonScene(s): SceneId | null`。只在終幕之後會有值；終幕之後 `nextReaction` 一律是 `null`，所以兩者不會搶同一個槽。
       - 槽裡有它時，和群戲一樣：白天清單回傳 `[...list, 'season:spring']`，**沒有回城對話，也沒有閒聊**（含 `afterFinaleBanters`）。
       - `Game.arrive` 與 `Game.boot` 把槽裡的夜晚場景（群戲或季節場景，`isNightSlot`）移到 `night` 的最前面。
       - 讀檔時，`arrivalScenes(chat: false)` 會重算出同一個結果：春天只會往後延續，而 `home:chizuru` 已經看過，條件不會變。
     - **算重的夜晚**：`planNight` 在白天清單有季節場景時，`night` 回憶是空的。
       - 未說的回憶留到下一次回城；
       - 必需回憶（`before`）規則不變。終幕之後沒有幕、揭露或坦白，實際上是空的。
       - 清晨（`dawn`）照 L §4.8.1 照常挑。它是隔天早上的事，不和春祭疊在同一夜。
     - **順序**（整次到站，由前到後）：
       1. 白天的 `queue`，照 `rank`（`events.ts:92`），歸鄉 `home:*` 照舊排在所有劇情場景之後；
       2. 白天的尾巴（通知、當天的一句）；
       3. 夜晚：群戲 `group:*`（終幕之後不會有）、`season:spring`、今晚的回憶（有春祭的那一夜沒有回憶）。
       - 實作上給夜晚一個明確的排序 `NIGHT_RANK = { group: 0, season: 1, memory: 2 }`，`Game.night` 照它排，並有測試。
   - **為什麼是千鶴**：
     - 她第 1 片之後一直說「春祭之前，回來」；
     - 她在群戲 `group:act4` 唱到「提燈的人」就停了（I-195）；
     - 終幕裡她說後半改成了「提燈的人，會回來」（`story.zh-TW.ts:1369`）。
     - 春祭是第一次當著全鎮把改過的歌唱完，而這一次「會回來」變成「回來了」。燈已經點亮，提燈的人就坐在祠前。
   - **調性**：日常、有梗、溫暖；不是第二個結局。
   - **劇本大綱**（Task 8 寫成句子；這裡定的是情節，不是字句）：
     1. 旁白（地點卡「鎮邊小祠・春祭之夜」，夜晚）：冬天過去了。小祠前掛滿紙燈。祠前的供品堆成一座小山，全是白蘿蔔（回呼 `home:chizuru` 賣菜婆婆的第一根白蘿蔔）。
     2. 千鶴照她那個年代的規矩宣布祭典開始，被一堆白蘿蔔弄得有點亂了禮數。
     3. 一位夥伴或鎮民吐槽白蘿蔔（`if: { met }` 的讀法；鎮民可以是瑪莎）。
     4. 千鶴起頭唱「春祭的燈，誰提下去？提燈的人，不留名字──」，鎮上的孩子跟著唱。
     5. 唱到她以前不唱的那一段。
        - 看過 `group:act4` 的讀法：她停一拍。終幕裡她已經對洛恩說過「後半我改了」（`story.zh-TW.ts:1369`，`if: { met: 'chizuru', seen: 'group:act4' }`），這裡兌現。
        - **【審查修正 10】沒看過 `group:act4` 的讀法**：終幕走的是 `:1370`（在紙上添一道），沒有鋪陳改歌詞。所以這個讀法在第 4 拍之前**多一句鋪陳**：千鶴對孩子們說，這首歌原本的後半，提燈的那位沒有回來；今年起，她把它改了。之後直接唱下去。
        - 兩種讀法都 ≤ 10 句。這一句鋪陳放在春祭裡，不動終幕與 `home:chizuru`：歸鄉在 I-118 已經是四句的上限，終幕的兩種讀法也都已經定稿。
     6. 千鶴把最後一句唱成「回來了」，看著洛恩。
     7. 洛恩一句吐槽或一句短話，不說教。
     8. 千鶴：歌是活人唱的，活人改得。這是她的弧線：不再守著回不去的地方，而是為了現在的人（world §6）。
     9. 旁白：屋簷下的鈴響了一聲，孩子們把新的那一句又唱了一遍。
   - 帳本新增 I-200（春祭）。
8. **設計者裁定：看得到的日曆**。
   - **城鎮 HUD**：
     - 在 `.slx-place`（「邊境小鎮 露米亞」）下面，另開一個 HUD 視窗 `.slx-calendar`，內容是 `秋・下弦`（季節・今天的月相）；
     - 12px／行高 16；
     - 不放天數：數字對玩家沒有用，而且會帶出阿拉伯數字；
     - 場景播放時，和其他 HUD 一起收起。
     - **【審查修正 9】到站的場景播完、HUD 重新出現時，重算一次日曆的文字**。這次到站可能剛播完第三幕（季節由秋變冬），或剛播完終幕之後的場景。所以第三幕那一次回城，選單一出現就是「冬」。
   - **夜晚的暗幕**：`Dialogue` 多一個 `moon: MoonPhase | null`。
     - 有月相而且是夜晚的地點卡時，暗幕加 `slx-moon-<phase>`。
     - 滿月偏亮偏藍，新月更暗；上弦、下弦用原本的暗幕。
     - 只用 CSS 的背景色，沒有圖。
     - 手冊重看、迷宮裡沒有月相，用原本的暗幕。
     - **【審查修正 8】下潛前的那一夜也帶月色**。它說的是出發前一晚，月相是 `tonightMoon(s)`。有兩條路徑：
       - 出發時（`ui2/scenes/gate.ts:354` 的 `tellNight`）；
       - 終幕清單（`ui2/scenes/clear.ts:59` 的 `playNight`）。
       - 兩條路徑都在播之前設 `talk.moon = tonightMoon(state)`，播完設回 `null`。
   - **城鎮選單不分日夜**：選單永遠是隔天早上（裁定 1）。夜晚就是那一串場景。
     - world §11.1 說的「城鎮台詞依時段切換的欄位」，就是 `calendarOf(s, time).time`；
     - 這次沒有任何台詞使用它，留給第 2、5 項。
   - **旅館**：住宿的流程與文字不變，回到城鎮時 HUD 已經換成隔天的月相。
9. **設計者裁定：戰鬥與月相**。
   - 戰鬥裡瑟蕾的月相（`engine/mechanics/moon.ts`，plan 8c ruling 16）每一場都從上弦開始，和日曆**無關**。
     - 讓日曆決定戰鬥的起始月相，等於把日曆變成平衡旋鈕，一般難度的數字就不會逐位元相同。
     - world spec 也沒有要求日曆影響戰鬥。
   - 戰鬥不讀 `story.day`。
     - **【審查修正 5】** `createBattle`（`game.ts:1540`）根本不收 `GameState`，在它上面寫守門測試等於什麼都沒測。
     - 所以守門測試寫在 `Game` 這一層（Task 2）：
       - 兩個 `Game`，同一個 rng 種子、同一份狀態，只差 `story.day`（例如 1 與 2，月相不同）；
       - 隊伍有瑟蕾，她持有 0 片，下一片沒有月相條件，所以兩邊的樓層生成一樣；
       - 走同樣的路進同一場戰鬥（經過 `startBattle`）；
       - 兩邊的 `g.battle` 全等，瑟蕾戰鬥裡的 `moon.phase` 都是 `first`（上弦）；
       - 再各打三回合 `submitRound({})`，每回合的 `log` 全等。
   - 寫進 `moon.ts` 的檔頭說明：天上的月亮是劇情的，戰鬥裡的月亮是瑟蕾的。
10. **設計者裁定：瑟蕾的夜晚拍子**（L §4.4.1 的 `NIGHT_BEATS`）。
    - `NightBeat` 多一個可選的 `moon?: MoonPhase[]`。`nextBeat` 的 `fits` 多一條：有 `moon` 的句子，只在 `tonightMoon(s)` 在清單裡時符合。
    - 游標規則不變：不符合的句子跳過，不消耗。
    - 瑟蕾現有的六句（`story.zh-TW.ts:197-203`）照內容標月相：
      - 「缺了右邊一角」：只有下弦；
      - 「月亮往西邊走了一點」「月亮剛才也在聽」「月光照進來」「今晚的月亮，適合說話」：新月以外；
      - 「數星星」：不限。
    - **【審查修正 7】不只瑟蕾**：池子裡每一句寫到月亮的句子都要標月相，旁白也一樣。已知的一句：
      - 旁白「月光從窗縫斜斜照進來，落在地板上，慢慢挪了一寸。」（`story.zh-TW.ts:229`）：新月以外。
      - Task 6 的稽核要掃過整個池子（八位夥伴各六句、旁白十二句），找出其他寫到月亮或月光的句子，一律標上。
    - 新增兩句，池子從 60 句變 62 句（八位夥伴各六句，加旁白十二句；瑟蕾變八句）：
      - **新月一句**：月亮不在。用「月亮請假」，回呼絲嘉蕾閒聊裡「它每個月總要請假幾晚」。不說「新月」（I-158）。
      - **滿月一句**：月亮很亮，她不讀，只看大家。不提銀盆，那是她的回憶。
11. **設計者裁定：季節台詞的稽核**。
    - `banter:bobby-sylvie:1` 的最後一句「今年核桃熟得早，冬天會很冷，多藏幾顆也好。」只在入冬前說得通。終幕之後才遇見波比的玩家，可能在春天聽到它。
    - 改成不分季節、又接得上希爾薇的弧線（她的種子讓林子重新長起來，I-118）：松鼠藏的核桃，有一半會忘了藏在哪，後來長成了樹。
    - 「入冬前的松鼠就長這樣」是比喻，不分季節，留著。
    - Task 6 用 grep 稽核所有現在式（不是 `past`）而且會在城裡播的句子，找出寫死季節或月相的地方，結果記進 SDD。只改真的會說錯的句子，每一處寫理由。
12. **設計者裁定：存檔**。
    - `StoryState` 新增兩個選用欄位：
      - `day?: number`：缺少時讀成 1；
      - `springDay?: number`：缺少時見裁定 6。
    - 不升 `SAVE_VERSION`，不寫遷移。
    - `isStory` 的檢查：
      - `day` 是 1 到 `MAX_DAY` 的整數；
      - `springDay` 是 1 到 `MAX_DAY + SPRING_AFTER` 的整數，而且只有 `finaleCleared` 為真時才可以有。
    - 同一輪遊戲裡，讀檔前後的月相、季節、碎片過濾、今晚的拍子都一樣。
13. **設計者裁定：兩個舊帳**。
    - **(a) 技能分頁的 TP**：已查證是對的，不改程式。
      - `ui2/scenes/statusTabs.ts:329` 算的是 `treeCost(m, sk, skillCost(fromMember(m, 0), sk))`；
      - `fieldCost(m, sk)`（`engine/field.ts:41`）就是 `skillCost(fromMember(m, 0), sk)`；
      - `fromMember` 已經算進 `teachers-gift`（`engine/battle.ts:131`）；
      - `treeCost` 只對凜的 `rin-mark` 有作用，而它不是迷宮技能。
      - 6f 計畫寫完之後已經修好。Task 10 只加一個守門測試，讓它不會再分岔。
    - **(b) `useFieldItem`**：已查證還是錯的。
      - `engine/town.ts:262-263` 用的是 `Math.min(max, hp + x)`，祭壇留下的超量 HP 會被壓回上限。
      - 改成和 `castField` 一樣只升不降：`Math.max(現值, Math.min(上限, 現值 + x))`，TP 同理。
      - 道具照舊會消耗：現在對滿 HP 的人用藥也會消耗，這次不改這個行為。
14. **停止規則**：
    - 模擬閘門不是 `identical`，或 `cmp` 與 `contribution.8d-final.160.json` 有差：停下來回報 BLOCKED。
    - 改動碰到戰鬥、裝備或素材掉落、金錢的數字：停下來回報 BLOCKED。
    - 下潛快照（`engine/storyL.dive.test.ts`）變了：停下來回報 BLOCKED。快照裡瑟蕾沒有被遇見（`dive.json` 的 `selene: 0`），所以它不應該變。
    - Task 3 量到瑟蕾第 5 片在任何一種玩家晚於第 30 層：停下來回報 NEEDS_CONTEXT，附數字，不自行調參。
    - 要改帳本既有 I 條目的事實或揭露時機：停下來回報 NEEDS_CONTEXT。新增條目，或寫「取代 I-xx 裡某句的引文」，可以直接做。

## Global Constraints

**使用者的方向（最高依據）**
- 「你應該要作為專業編劇編寫適當的劇情，並且驅動他們各自的人性，讓他們在故事當中有衝突和掙扎」。
- 日常輕快、有梗、日系 RPG；沉重留給回憶；「……」少用。
- 只有畫風要找使用者看；技術規格與劇情由我們決定。這份計畫沒有新美術。

**分支與基準**
- 分支 `feat/starlantern-time-moon`，從 `origin/master` 開出（寫計畫時是 `5fb74d460`）。這份計畫是分支上的第一個 commit。
- 基準提交 `<BASE>` 記在 SDD `baseline.md`。
- 開工前跑 `git status`。要改的檔案若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。

**模擬閘門**
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 檢查：
  - 最後一行必須是 `gate: identical`（Task 0 的 `gate-0` 不比對）；
  - `cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- 時機：Task 0、1、2、7、9、11 各跑一次。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`（`prev: 'contribution.8d-final.160.json'`、`changed: []`）。不錄新表，不覆寫 `engine/__fixtures__/`。
- 不加任何新的亂數抽取，不用 `Math.random`，不讀 `Date`。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。只有 Task 10 例外：行為已經正確，它的測試一寫就是綠的，報告要註明。
- **vitest**：
  - 單檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
  - 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。
  - 不可以用 `npm run test`。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。
  - `src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下必須是 0 個；
  - 全 repo 總數不可以多於 `baseline.md` 記下的數字。
- **e2e**：`E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts`，三個專案 `chromium`、`chromium-dpr125`、`chromium-dpr150` 都要跑。
  - 一律 headless；spec 已經 `--mute-audio`（`starlantern.spec.ts:25`），新的測試不可以拿掉；
  - 只用 4352，絕不用 4354；
  - 不結束任何程序；
  - 不用 Playwright MCP 或任何瀏覽器 MCP 工具。
- **重的工作（閘門、e2e、全套）之前**：
  - PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 必須 ≥ 6291456（KB），不足就等；
  - 一次只跑一套重的工作。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：
  - 每個任務的 Files 列出已知會紅的既有測試，只照新的行為改；
  - 不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；
  - 全套跑出沒列到的紅燈，停下來回報 NEEDS_CONTEXT；
  - `data/story/story.test.ts` 裡 `expect(` 的數量不可以比 `baseline.md` 記下的少。

**文字**
- 劇情只放 `data/story.zh-TW.ts`，介面文字只放 `data/text.zh-TW.ts`。
- 每句 ≤ `MAX_LINE_CHARS`＝60；場景照最壞情況播出的句數計，不超過 `lineCap(id)`。
- 全形標點，對白「」，引號裡用『』，省略號「……」，破折號「──」；劇情文字不出現英文字母與阿拉伯數字（`numeral()`）。
- 台灣用語；過去的人物對女性說話用「妳」。
- 表情只用 `moodsFor(說話者)` 已有的。沒有新美術、沒有佔位圖。

**易讀性與樣式**
- 字級只有 12／24px，行高 ≥ 14（`ui2/typeScale.test.ts` 守門）。
- 整數倍縮放：不加 `transform: scale`，不用非整數的 `zoom`。
- SCSS 只改 `src/styles/_starlantern-ui.scss`；禁 `!important`、禁行內樣式。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat`；整檔被改寫就是換行壞了；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF）
- LF：
  - `data/story.zh-TW.ts`、`data/story/{chains,scenes,story.test,voice.test,voiceGates}.ts`；
  - `engine/story/{events,events.test,expect,handbook,handbook.test,memories,memories.test,nights,nights.test}.ts`、`engine/field.test.ts`；
  - `ui2/story.ts`、`ui2/story.test.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/{gate,clear}.test.ts`；
  - `docs/superpowers/story/*.md`。
- CRLF：
  - `engine/state.ts`、`engine/testing.ts`、`engine/game.test.ts`、`engine/town.test.ts`；
  - `ui2/scenes/town.ts`、`ui2/scenes/clear.ts`。
- 混用（新行照相鄰行）：
  - `data/text.zh-TW.ts`；
  - `engine/game.ts`、`engine/save.ts`、`engine/save.test.ts`、`engine/town.ts`；
  - `ui2/widgets.ts`、`ui2/widgets.test.ts`、`ui2/main.ts`、`ui2/scenes/{gate,inn,inn.test,status.test,town.test}.ts`；
  - `src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。
- 新檔：`engine/calendar.ts`、`engine/calendar.test.ts`、`engine/story/calendar.pace.test.ts`，一律 LF。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push。

**收尾 G（每個任務）**
1. 全套全綠（含 `engine/storyL.dive.test.ts`）；tsc 符合上面的條件。
2. 動到 `ui2/`、`src/styles/` 或 `tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
3. 報告：
   - 新增與修改的測試名；
   - 全套的兩行、tsc 數字、e2e 結果（沒跑就寫理由）；
   - 閘門結果（該跑的任務）；
   - 改了哪些既有斷言；
   - 偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。冷讀與全分支審查由控制者另派全新脈絡的讀者，模型照使用者偏好用 Opus 5.5。子代理一律不准用瀏覽器 MCP。

## 寫作任務的固定步驟（Task 6、Task 8 的 W1–W7）

沿用 L 計畫的 W 步驟，精簡如下：
- [ ] **W1 紅**：
  - 寫本任務列出的新測試或釘子；新的鍵加進 `data/story/voice.test.ts` 的 `POLISHED`；
  - 跑 `voice.test.ts`、`story.test.ts`、`data/terms.test.ts`；
  - 失敗清單存成 SDD `task-<N>-red.txt`。
- [ ] **W2 改寫前的朗讀稿**：`STORY_DUMP=<SDD>/task-<N>-before.md STORY_DUMP_KEYS='<前綴,…>' rtk proxy npx vitest run src/scripts/games/starlantern/data/story/readAloud.test.ts`。新場景沒有改寫前的稿，就跳過這一步。
- [ ] **W3 寫**：照本計畫的裁定、聖經與帳本寫。想像自己出聲念一遍。帳本的新條目在同一個 commit 加。
- [ ] **W4 釘子**：被改到的釘死整句，改用 `pinBeat`（`data/story/voiceGates.ts`）釘情節要點。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 改寫後的朗讀稿**：同 W2，存成 `task-<N>-after.md`。
- [ ] **W7 冷讀**：控制者派一位沒讀過設計文件的全新讀者，只給 `task-<N>-after.md`。及格條件：
  - 讀者說得出每一段在講什麼；
  - 沒有一句讓他出戲；
  - 沒有一句他認為「說錯了季節或月亮」。
  - 不及格就回到 W3。

## Review Focus

1. **讀檔前後同一個月亮**：回城、存檔、讀檔，HUD 的月相、今晚的拍子、碎片過濾都相同；出發後讀檔回城，再出發還是同一天。→ Task 1 `a reload keeps the day`；Task 2 `a reload mid-town departs under the same moon`。
2. **月相沒到時瑟蕾不會卡死**：保底不看月亮；月相對上的第一層一定有她的光點。→ Task 2 `pity waits through the wrong moon; the right moon's first floor holds her glimmer`；Task 3 的實測。
3. **模擬與快照逐位元不變**：期望值不帶日曆；戰鬥不讀天數。→ Task 2 `two states a day apart fight the same battle`；每個該跑閘門的任務。
4. **L 的夜晚排程一條都沒變**：住宿不播回憶；清晨、下潛前的那一夜、揭露那天的擋法照舊。→ Task 1 `a night at the inn tells no memory and keeps tonight and the dawn`；L 的既有測試全綠。
5. **凜的揭露在夜晚**：揭露那一場的時段是夜晚、帶今晚的月色；揭露的台詞沒動。→ Task 5 `the reveal plays at night, under tonight's moon`。
6. **春祭不會錯過也不會早到**：終幕之前、春天之前、千鶴歸鄉之前都不播；三個條件都成立的第一次回城播一次。→ Task 7 `the spring festival waits for spring and the shrine`。

---

## 檔案結構

**新增**：
- `engine/calendar.ts`（＋`calendar.test.ts`）：`MOON_ORDER`、`MOON_EPOCH`、`MAX_DAY`、`SPRING_AFTER`、`dayOf`、`moonOf`、`tonightMoon`、`seasonAt`、`nextDay`。純函式，只依賴型別。
- `engine/story/calendar.pace.test.ts`：Task 3 的實測。

**修改**：
- 資料：
  - `data/story/chains.ts`：`CalendarNow`、`whenHolds(w, cal)`；
  - `data/story/scenes.ts`：`SCENE_TIME`、`sceneTime`、`season:spring` 的 id（`SEASON_SCENES` 註冊表）、`sceneKind`、`lineCap`；
  - `data/text.zh-TW.ts`：日曆名稱、HUD、手冊提示；
  - `data/story.zh-TW.ts`：拍子的月相、兩句新拍子、核桃句、春祭、地點卡、`NightBeat.moon`。
- 引擎：
  - `engine/state.ts`、`engine/save.ts`：`day`、`springDay`；
  - `engine/story/events.ts`：`calendarOf`、`arrivalScenes` 的反應槽與 `nextSeasonScene`（春祭，夜晚）；
  - `engine/story/memories.ts`：`PieceCtx.cal`、`eligible`、`forcedGlimmers(…, cal?)`；
  - `engine/story/expect.ts`：`walkFloor(…, cal?)`，預設不帶；只改說明與這個選用參數；
  - `engine/story/nights.ts`：`nextBeat` 的月相；`planNight`（春祭那一夜沒有回憶）；
  - `engine/story/handbook.ts`：月相提示、春祭的位置；
  - `engine/game.ts`：`arrive`、三個掉落點、終幕寫 `springDay`；
  - `engine/town.ts`：`rest` 推進天數、`useFieldItem` 只升不降；
  - `engine/mechanics/moon.ts`：只改檔頭說明（裁定 9）。
- 介面：
  - `ui2/widgets.ts`：`Dialogue.moon`、暗幕的月色；
  - `ui2/scenes/{gate,clear}.ts`：下潛前的那一夜帶月色；
  - `ui2/scenes/town.ts`：HUD 的日曆、夜晚與夜晚場景的月色；
  - `ui2/scenes/handbook.ts`：春祭的列（若手冊的列由引擎決定，就只改引擎）。
- 樣式：`src/styles/_starlantern-ui.scss`（`.slx-calendar`、`.slx-moon-*`、HUD 收起的清單）。
- 文件：`docs/superpowers/story/starlantern-lore-ledger.md`（I-200 起）。
- e2e：`tests/e2e/starlantern.spec.ts`。

---

### Task 0：基準

**Files:** SDD `baseline.md`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下：
  - `git rev-parse HEAD`；
  - tsc 總數與 starlantern 底下的數字；
  - 全套兩行；
  - `story.test.ts` 的 `expect(` 數；
  - `NIGHT_BEATS.lines.length`（寫計畫時是 60：八位夥伴各六句，加旁白十二句）。
- [ ] **Step 2**：閘門錄 `gate-0`。vitest 必須通過，`cmp` 必須沒有輸出；有輸出就停下回報 BLOCKED。
- [ ] **Step 3**：e2e 三個專案各跑一次，通過數與失敗的測試名記進 `baseline.md`。
- [ ] **Step 4：查證兩個舊帳**，結果與行號寫進 `baseline.md`：
  - (a) `statusTabs.ts` 的技能分頁 TP 算式、`fieldCost` 的算式、`fromMember` 對 `teachers-gift` 的處理，三者是否等價。預期等價（裁定 13）；不等價就把 Task 10 改成 TDD 修正，並回報。
  - (b) `useFieldItem` 是否仍用 `Math.min(max, …)`。預期仍是；已修好就刪掉 Task 9，並回報。
- [ ] **Step 5**：在 `tests/e2e/starlantern.spec.ts` 用 Grep 找 `.slx-place`、`slx-veil-night`、`住一晚`、`隔天早上`、`核桃`，記進 `baseline.md`，後面的任務要看。
- [ ] **Step 6**：commit `baseline.md`，訊息 `chore(starlantern): time and moon baseline`。

---

### Task 1：日曆核心、天數與存檔

**Files:**
- Create：`engine/calendar.ts`、`engine/calendar.test.ts`。
- Modify：
  - `engine/state.ts:29-75`（`StoryState`：`day?`、`springDay?`）；
  - `engine/save.ts:94-110`（`isStory`）；
  - `engine/story/events.ts`（`calendarOf`）；
  - `engine/game.ts:1318-1332`（`arrive`）；
  - `engine/town.ts:187-200`（`rest`）。
- Test：`engine/calendar.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`engine/town.test.ts`、`engine/story/events.test.ts`。
- 已知會紅：預期沒有。如果有測試把整個 `story` 物件 `toEqual` 一個寫死的值，而回城或住宿之後的狀態也被拿來比，就加上 `day`，並在報告列出來。

**Interfaces:**
- Produces（`engine/calendar.ts`）：
  - `MOON_ORDER: readonly MoonPhase[]`、`MOON_EPOCH = 2`、`MAX_DAY = 999999`、`SPRING_AFTER = 4`；
  - `dayOf(s: GameState): number`：`s.story.day ?? 1`；
  - `nextDay(day: number): number`：`Math.min(MAX_DAY, day + 1)`；
  - `moonOf(day: number): MoonPhase`（裁定 2，負數也要對）；
  - `tonightMoon(s: GameState): MoonPhase`：`moonOf(dayOf(s) - 1)`；
  - `seasonAt(stage: Stage, day: number, finaleCleared: boolean, springDay?: number): Season`（裁定 6）。
- Produces（`engine/story/events.ts`）：`calendarOf(s: GameState, time: 'day' | 'night' = 'day'): CalendarNow & { day: number }`。
- Produces（`data/story/chains.ts`）：`CalendarNow`（裁定 3）。本任務只加型別，`whenHolds` 在 Task 2 改。
- `Game.arrive`：照現在的順序排好白天、今晚、清晨之後，`story.day = nextDay(dayOf(state))`。
- `rest`：`n.story.day = nextDay(dayOf(s))`。

- [ ] **Step 1：寫失敗的測試**
  - `calendar.test.ts`：
    - `the moon turns once every four days, full on day 0`：0 到 8 天依序是滿月、下弦、新月、上弦、滿月……；`moonOf(-1)` 是上弦；
    - `a new game reads as day 1, and its first night is a full moon`：`dayOf(newGame())` 是 1，`tonightMoon(newGame())` 是 `full`；
    - `the days stop at MAX_DAY`；
    - `autumn until act 3, winter through act 4 and the finale, spring SPRING_AFTER days after it`：每個 `Stage` 各一例；`after` 而 `springDay` 不存在時是春；
    - `the calendar names match the battle's`：`T.ui2.calendar.moon.full === T.mech…phase.full`，`new`、`waning` 相同，`waxing` 對 `first`。名稱在 Task 4 才加，所以這一條放在 Task 4 寫。
  - `events.test.ts`：`calendarOf reads the day, the stage and the time given`。
  - `game.test.ts`（新 `describe('time and moon: the day (Task 1)')`）：
    - `a return ends the day: walking home, the lamp, a wipe and the finale's clear each add one`；
    - `a departure keeps the day, and a reload of the town save departs on the same day`；
    - `a reload keeps the day`：`Game.boot` 不加天數；
    - `the night planned on a return is the night of the dive's day`：`arrive` 之後 `tonightMoon` 等於出發那天的 `moonOf`。
  - `town.test.ts`：`a night at the inn is one day, saved with the rest`。
  - `game.test.ts`：`a night at the inn tells no memory and keeps tonight and the dawn`：住宿前後 `story.untold`、`story.tonight`、`story.dawn` 不變，`Game.night` 不變。
  - `save.test.ts`：
    - `day and springDay save and load`；
    - `a day below 1, a fraction, or above MAX_DAY is refused`；
    - `springDay without the finale cleared is refused`；
    - `a save without day reads as day 1`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。`calendar.ts` 不 import `events.ts`，避免循環：`seasonAt` 吃 `stage`，由 `calendarOf` 傳進去。
- [ ] **Step 4：執行**全套、閘門 `gate-1`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): a calendar of days — a dive or a night at the inn is a day, saved with the town`。

---

### Task 2：月相過濾碎片

**Files:**
- Modify：
  - `data/story/chains.ts:10`（`whenHolds`）；
  - `engine/story/memories.ts:20`（`PieceCtx`）、`:39-50`（`eligible`）、`:93-101`（`forcedGlimmers`）；
  - `engine/story/expect.ts:101-127`（`walkFloor` 的選用 `cal`；說明裡記下日曆不進期望值）；
  - `engine/game.ts:377`、`:417`、`:744`；
  - `engine/mechanics/moon.ts:1-7`（只改說明，裁定 9）。
- Test：`data/story/story.test.ts`、`engine/story/memories.test.ts`、`engine/story/expect.test.ts`、`engine/game.test.ts`。
- 已知會紅：`story.test.ts:112-113` 不會紅（沒有日曆仍成立），保留它，另外加有日曆的例子。

**Interfaces:**
- `whenHolds(w?: When, cal?: CalendarNow): boolean`。
- `PieceCtx.cal?: CalendarNow`。
- `forcedGlimmers(p, pity, region, depth, cal?)`：給了 `cal` 時，在等月亮的那一條加在 `FORCED_GLIMMERS.max` 之外（裁定 3【審查修正 1】）；不給時與現在逐位元相同。
- `pityAfterFloor`：簽章與行為都不變（裁定 3）。
- `walkFloor(s, pity, region, depth, run, cal?)`：不給 `cal` 時，結果與現在逐位元相同。

- [ ] **Step 1：寫失敗的測試**
  - `story.test.ts`：`whenHolds checks the moon, the time and the season given a calendar, and holds without one`。
  - `memories.test.ts`（新 `describe('time and moon: the moon gates (Task 2)')`）：
    - `Selene's second piece drops only under a full moon`：已遇見、持有 1 片、本道第 6 層；`cal` 是滿月時 `eligible`，下弦時不是，不給 `cal` 時是；
    - `her fifth piece drops only under a new moon`；
    - `pity waits through the wrong moon; the right moon's first floor holds her glimmer`：
      - 下弦的兩層 `pityAfterFloor` 讓她的保底到 `MEMORY_PITY`；
      - `forcedGlimmers(…, 下弦)` 不含她；
      - `forcedGlimmers(…, 滿月)` 含她。
    - `a floor may force three glimmers when one waits on the moon`：
      - 洛恩、凜、千鶴都到期（佔滿兩條的上限還多一條），瑟蕾在等滿月且保底到期；
      - `forcedGlimmers(…, 滿月)` 長度是 3：照舊的前兩條，加上瑟蕾；千鶴照舊被上限擋下；
      - 同樣的輸入不給 `cal`：與現在的結果相同（兩條，不含瑟蕾）。
    - `with no calendar the cap is two, as before`。
  - `expect.test.ts`（【審查修正 6】：沒有「全部成立」的日曆，改成逐一月相）：
    - `walkFloor matches the calendar-free floor under every moon when no moon piece is due`：沒有瑟蕾的隊伍，新月、上弦、滿月、下弦四個 `cal` 各跑一次，結果都和不給 `cal` 的相同；
    - `with Selene's second piece due, only the full moon's floor gives it`：四個月相各跑一次，只有滿月的那一層她拿到第 2 片，其他三個月相的那一層她沒拿到，保底照舊加一；
    - `the expectation takes no calendar`：`memoryPace('selene')` 與 Task 0 時相同（在測試裡寫死 Task 0 量到的陣列）。
  - `game.test.ts`（新 `describe('time and moon: the moon in the labyrinth (Task 2)')`）：
    - `a glimmer planted for Selene's second piece pays under a full moon and leaves a shard under any other`：用 `plantGlimmer`；
    - `the moon of a dive is its day's, the same at the glimmer's making and its pickup`；
    - `a reload mid-town departs under the same moon`。
  - `game.test.ts`：`two games a day apart fight the same battle`（【審查修正 5】，寫法見裁定 9）：比的是 `Game` 經過 `startBattle` 產生的 `g.battle`，不是直接呼叫 `createBattle`。
- [ ] **Step 2：執行**，確認紅（`two games a day apart…` 那一條一寫就綠，報告註明它是守門）。
- [ ] **Step 3：實作**。`Game` 傳 `calendarOf(this.state)`。`expect.ts` 的三個呼叫點只多傳 `cal`，不給時是 `undefined`。
- [ ] **Step 4：執行**全套、`engine/storyL.dive.test.ts`、閘門 `gate-2`。報告寫出【審查修正 1】的查證：
  - `forcedGlimmers` 的每一個呼叫點（grep），哪些給 `cal`。只有 `game.ts` 可以給；
  - `dive.json` 裡瑟蕾是 0 片、沒有被遇見。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): Selene's moon pieces wait for their moon; the expectation and the sim stay calendar-free`。

---

### Task 3：實測瑟蕾的月相延遲

**Files:**
- Create：`engine/story/calendar.pace.test.ts`。
- SDD：`task-3-report.md`。

**Interfaces:**
- Consumes：Task 2 的 `walkFloor(…, cal)`；L 計畫 Task 6 的腳本（`engine/story/events.test.ts` 約 958 行的 `scriptedPlay`），只讀它決定每一趟走哪幾層的規則，不從測試檔匯入，要用就複製。
- 腳本：
  - 三種玩家：每層、每兩層、每三層回城；出發深度照遊戲規則（1 或 5 的倍數）；
  - 每一趟是一天，從第 1 天起；
  - 不住旅館；
  - 每一層用 `walkFloor(…, calendarOf 推出的 cal)`；
  - 只看本道（瑟蕾的家）。【審查修正 1】隊伍要有會搶強制光點位置的人：
    - 洛恩、凜從第 1 層起；
    - 千鶴從第 1 層起（她的碎片也掉在本道；提早加入是最壞的情況）；
    - 瑟蕾在她的相遇深度加入，波比在他的相遇深度（本道第 6 層）加入。
- 產出：每種玩家，瑟蕾每一片的掉落深度與天數，以及不帶日曆的對照。

- [ ] **Step 1**：寫 `calendar.pace.test.ts`，它是量測而不是門檻：
  - 量到的數字用 `console.log` 印出，寫進報告；
  - 硬性斷言只有兩條：
    - `Selene's fifth piece drops by depth 30 for every player`（停止規則，裁定 14）；
    - `each moon piece drops on the first floor of its moon once her pity is due`：即使同一層洛恩、凜、千鶴、波比也到期。
- [ ] **Step 2：執行**。第一條不成立就停下回報 NEEDS_CONTEXT，附三種玩家的數字。不調參數。
- [ ] **Step 3**：`task-3-report.md` 記下表格（片號 × 玩家 × 有無日曆），和裁定 2 的推算（18／19／28）比較。
- [ ] **Step 4：收尾 G，commit**：`test(starlantern): measure how long Selene's pieces wait for their moon`。

---

### Task 4：城鎮看得到日曆，手冊看得到月相

**Files:**
- Modify：
  - `data/text.zh-TW.ts:614`（`pieceHint`）、`:636` 附近（`T.ui2.town.calendar`）、新增 `T.ui2.calendar`；
  - `engine/story/handbook.ts:40-43`（`hintOf`）；
  - `ui2/scenes/town.ts:66-67`（HUD）；
  - `src/styles/_starlantern-ui.scss:163`、`:208`。
- Test：`engine/calendar.test.ts`（Task 1 留下的同名測試）、`engine/story/handbook.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/inn.test.ts`、`ui2/typeScale.test.ts`（應該不用改）、`tests/e2e/starlantern.spec.ts`。
- 已知會紅：手冊測試若把瑟蕾第 2、4、5 片的提示整句寫死，改成帶月相的版本。`town.test.ts:24` 不應該紅：日曆是另一個視窗，`.slx-place` 的文字不變。

**Interfaces:**
- `T.ui2.calendar = { moon: { new: '新月', waxing: '上弦', full: '滿月', waning: '下弦' }, season: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } }`。
- `T.ui2.town.calendar(season: string, moon: string): string`，結果是「秋・下弦」。
- `pieceHint(regions, deep, moon?: string)`，結果是「本道、霜凍之地・深處・滿月」。有多個月相時用「、」接。
- HUD：`win('slx-calendar', …)` 接在 `.slx-place` 後面，加進 `this.hud`，所以場景播放時跟著收起。
- `TownScene.refreshCalendar()`：在 `arrive` 的最後（`playNight` 結束之後）呼叫，用當下的狀態重寫 `.slx-calendar` 的文字。

- [ ] **Step 1：寫失敗的測試**
  - `calendar.test.ts`：`the calendar names match the battle's`（Task 1 留下的）。
  - `handbook.test.ts`：`a moon piece not found yet says its moon in the hint`：瑟蕾第 2、4 片寫「滿月」，第 5 片寫「新月」，第 1、3 片沒有月相。
  - `town.test.ts`：
    - `the town shows the season and today's moon under its name`：新遊戲是「秋・下弦」；`story.day = 4` 是「秋・滿月」；第三幕之後是冬；
    - `the calendar goes away with the HUD while a scene plays`；
    - `the calendar is read again when the return's scenes end`（【審查修正 9】）：本道到了第三幕的深度後回城，第三幕播完、選單出現時是「冬」，不是到站時的「秋」。
  - `inn.test.ts`：`after a night at the inn the town shows the next day's moon`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
  - `.slx-calendar`：12px（`$slx-fs`）、行高 16，位置在 `.slx-place` 正下方（`left: 12px`），手機寬度不換行（`white-space: nowrap`）；
  - 把 `.slx-town .slx-calendar.slx-cmd-hidden` 加進 `:208` 那一串。
- [ ] **Step 4：e2e** 新增 `the town shows the season and the moon, and a night at the inn turns it (time and moon)`：
  - 新遊戲到城鎮，`.slx-calendar` 是「秋・下弦」；
  - 去旅館住一晚，回城鎮，變成「秋・新月」；
  - 同一則在 390×844 觸控（`asPhone`）也跑：`.slx-calendar` 的 `scrollWidth <= clientWidth`，而且不和 `.slx-gold` 重疊（比較兩者的 `getBoundingClientRect`）。
- [ ] **Step 5：執行**全套、e2e 三個專案。
- [ ] **Step 6：收尾 G，commit**：`feat(starlantern): the town shows the season and the moon; the handbook says which moon a piece waits for`。

---

### Task 5：夜晚的月色與劇情指定時段

**Files:**
- Modify：
  - `data/story/scenes.ts`（`SCENE_TIME`、`sceneTime`）；
  - `ui2/widgets.ts:215-224`（`Dialogue.moon`、`setPlace`）；
  - `ui2/scenes/town.ts:80-125`（`arrive`、`playNight`）；
  - `ui2/scenes/gate.ts:347-360`（下潛前的那一夜，`tellNight`）；
  - `ui2/scenes/clear.ts:50-60`（終幕清單裡的那一夜）；
  - `src/styles/_starlantern-ui.scss:197`。
- Test：`data/story/story.test.ts`、`ui2/widgets.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/gate.test.ts`、`ui2/scenes/clear.test.ts`、`tests/e2e/starlantern.spec.ts`。
- 已知會紅：`widgets.test.ts` 若斷言暗幕的 `className` 整串相等，改成包含 `slx-veil-night`，月色另外斷言。

**Interfaces:**
- `SCENE_TIME: Partial<Record<SceneId, 'night'>> = { 'rin-reveal': 'night' }`。`'season:spring'` 在 Task 7 加。
- `sceneTime(id: SceneId): 'day' | 'night'`：回憶與 `SCENE_TIME` 的是 `night`。
- `Dialogue.moon: MoonPhase | null`（預設 `null`）。`setPlace` 在夜晚的地點卡、而且 `moon` 不是 `null` 時，加上 `slx-moon-<phase>`；換卡或收卡時拿掉。
- `TownScene.arrive`：
  - 開始時設 `talk.moon = tonightMoon(state)`；
  - `playNight` 結束時設回 `null`。
- `GateScene` 的下潛前的那一夜（`tellNight`）與 `ClearScene` 終幕清單裡的那一夜：播之前設 `talk.moon = tonightMoon(state)`，播完設回 `null`（【審查修正 8】）。
  - 所以必需回憶、揭露、夜晚的回憶、群戲、春祭都帶今晚的月色；白天、帶非夜晚地點卡的場景沒有暗幕，也就不受影響。

- [ ] **Step 1：寫失敗的測試**
  - `story.test.ts`：`memories and the reveal are night scenes; the day's scenes are not`。
  - `widgets.test.ts`：
    - `a night card under a moon tints the veil; a day card or no moon does not`；
    - `the tint goes with the card`。
  - `town.test.ts`：
    - `the night's memories are told under tonight's moon`：
      - 【審查修正 9】出發前設 `story.day = 4`（第 4 天是滿月）。回城時 `arrive` 先排好今晚，再加一成 5；
      - 所以夜晚播放時存檔裡是 `story.day = 5`，`tonightMoon` 是 `moonOf(4)`＝滿月；
      - 暗幕有 `slx-moon-full`。
      - 測試直接造城鎮狀態、不走回城時，就直接設 `story.day = 5`（回城加一之後的值），並在測試裡註明。
    - `the reveal plays at night, under tonight's moon`：凜持有第 7 片，回城；揭露播放時暗幕有今晚的月色類別；
    - `the handbook replays a night with the plain veil`。
  - `gate.test.ts`：`the eve is told under the night before's moon`（【審查修正 8】）：`finale-eve` 與它的回憶播放時，暗幕有 `slx-moon-<tonightMoon>`；播完 `talk.moon` 回到 `null`。
  - `clear.test.ts`：`the eve in the finale's list wears the same moon`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。CSS 只加兩條：
  - `.slx-veil-night.slx-moon-full { background: rgba(14, 24, 58, 0.5); }`：比原本亮一點、藍一點；
  - `.slx-veil-night.slx-moon-new { background: rgba(2, 4, 16, 0.66); }`：比原本暗；
  - 上弦、下弦沿用 `.slx-veil-night`。
  - 不加圖，不加文字，不加動畫。
- [ ] **Step 4：e2e** 新增 `a return's night wears its moon (time and moon)`：
  - 用 debug 鉤子把 `story.day` 設成讓「今晚」是滿月的值，給凜一片未說的碎片，用歸還之燈回城；
  - 回憶播放時 `.slx-veil-night.slx-moon-full` 可見；
  - 播完才看得到城鎮選單。
  - 插在 L Task 3c 那一則之後，寫法照它。
- [ ] **Step 5：執行**全套、e2e 三個專案。
- [ ] **Step 6：收尾 G，commit**：`feat(starlantern): nights wear their moon, and Rin's reveal is set at night`。

---

### Task 6：寫作：瑟蕾的月相拍子與季節稽核

**Files:**
- Modify：
  - `data/story.zh-TW.ts:149-160`（`NightBeat.moon`）、`:197-203`（瑟蕾的拍子）、`:1614-1621`（`banter:bobby-sylvie:1`）；
  - `engine/story/nights.ts:213-230`（`nextBeat`）；
  - `docs/superpowers/story/starlantern-lore-ledger.md`（I-201：拍子的月相；I-202：核桃句，取代 I-158 裡那一句的引文）。
- Test：`engine/story/nights.test.ts`、`data/story/story.test.ts`（`:3446-3510` 的拍子測試）、`data/story/voice.test.ts`。
- 已知會紅：`story.test.ts` 的拍子測試若寫死每人的句數或總數 60，照新的數字（瑟蕾 8 句，總數 62）改。釘死核桃整句的測試改用 `pinBeat`。

**Interfaces:**
- `NightBeat.moon?: MoonPhase[]`。
- `nextBeat` 的 `fits`：有 `moon` 的句子只在 `tonightMoon(s)` 在清單裡時符合（裁定 10）。

- [ ] **Step 1（引擎，TDD）**：`nights.test.ts`：
  - `a beat whose moon is not tonight's is passed over, and the cursor lands after the one said`；
  - `a beat with no moon fits any night`；
  - `the eve's beats read the night before the departure`。
  - 實作 `nextBeat`。
- [ ] **Step 2（寫作）**：照 W1–W7 做：
  - 瑟蕾六句加 `moon`（裁定 10）；旁白「月光從窗縫斜斜照進來」加 `moon`（新月以外，【審查修正 7】）；稽核找到的其他寫到月亮的拍子也加；
  - 加一條守門：`every beat that speaks of the moon carries a moon`：池子裡文字含「月」（「月影旅館」除外）的每一句都必須有 `moon`；
  - 寫新月、滿月各一句，每句 ≤ 60 字，風格照聖經裡瑟蕾的「月亮說的──收回」；
  - 改寫核桃句（裁定 11）；
  - **稽核**：
    - 用 Grep 在 `data/story.zh-TW.ts` 找 `春|夏|秋|冬|雪|滿月|新月|弦|月光|月亮`；
    - 只看不帶 `past`、會在城裡或旅館播的句子；
    - 每一處判斷「任何季節、任何月相都說得通嗎」，結果表格寫進 SDD `task-6-audit.md`。
    - 只改說不通的，每一處寫理由。
  - 新句子與改寫的句子加進 `POLISHED`。
- [ ] **Step 3：收尾 G，commit**：`feat(starlantern): Selene's night beats keep to the moon, and the walnut line fits every season`。

---

### Task 7：季節與春祭的引擎

**Files:**
- Modify：
  - `data/story/scenes.ts:20-24`（`SceneId` 加 `` `season:${Season}` ``）、`:108-118`（`SCENE_IDS`）、`:125-134`（`sceneKind`：`season:` 算 `home`）、`lineCap`（10）、`SCENE_TIME`（`'season:spring': 'night'`）、`HEAVY_ARRIVAL`（加 `'season:'`）；新增 `SEASON_SCENES: Partial<Record<Season, SceneId>>`，先是空的；新增 `NIGHT_RANK`；
  - `engine/story/events.ts:287-299`（`arrivalScenes` 的反應槽、`nextSeasonScene`）；
  - `engine/story/nights.ts:188-193`（`planNight`：有季節場景的那一夜沒有回憶）；
  - `engine/game.ts:188-214`（`boot`）、`:1318-1332`（`arrive`：`isNightSlot`、`NIGHT_RANK`）、`:756-761`（終幕寫 `springDay`）；
  - `engine/story/handbook.ts`（千鶴那一頁，`home:chizuru` 後面）。
- Test：`engine/story/events.test.ts`、`engine/story/nights.test.ts`、`engine/game.test.ts`、`engine/story/handbook.test.ts`、`engine/save.test.ts`。
- `onReturn` 不改：春祭不進 `story.queue`（【審查修正 4】）。
- 已知會紅：把 `SCENE_IDS` 長度寫死的測試；改成新的長度，並在報告列出。

**Interfaces:**
- `SEASON_SCENES`：和 L 的 `REACTIONS` 一樣，寫作任務寫好一場才註冊一場。`SCENE_IDS` 只收已註冊的。
  - 引擎的測試用注入的表：照 L 計畫 Task 5 對 `REACTIONS` 的做法，在測試裡暫時放進 `spring: 'season:spring'`，`afterEach` 還原。
- `nextSeasonScene(s): SceneId | null`：`SEASON_SCENES.spring` 已註冊，而且裁定 7 的三個條件都成立時，回傳 `'season:spring'`。
  - 「春天」是 `seasonAt(stage, dayOf(s), …)`。`arrivalScenes` 在 `arrive` 加一之前執行，所以用的是出發那一天，也就是今晚。
  - 讀檔時天數已經加一，但春天只會延續，所以結果相同。
- `arrivalScenes`：反應槽在終幕之後改問 `nextSeasonScene`。有值時回傳 `[...list, 'season:spring']`，沒有回城對話與閒聊。
- `planNight(s, day)`：`day` 有季節場景時，`night` 是空的，`before` 照舊。
- `Game.arrive`／`Game.boot`：`isNightSlot(id)`（群戲或 `season:`）的移到 `night`，`night` 照 `NIGHT_RANK` 排。
- 終幕：`story.springDay = dayOf(state) + SPRING_AFTER`。
- 手冊：千鶴的頁在 `home:chizuru` 之後列 `season:spring`，標題「春祭」，放在 `data/story.zh-TW.ts` 的 `HOME_TITLES` 旁邊，新增 `SEASON_TITLES`。

- [ ] **Step 1：寫失敗的測試**
  - `events.test.ts`（新 `describe('time and moon: the spring festival (Task 7)')`）：
    - `the spring festival waits for spring and the shrine`：分別少一個條件（終幕之前、冬天、沒看過 `home:chizuru`、已經看過）都沒有；三個都成立時，`arrivalScenes` 的最後一項是 `season:spring`；
    - `it never enters the queue`：`onReturn` 之後 `story.queue` 沒有它；
    - `the return that plays the homecoming does not play the festival; the next spring return does`；
    - `no chat or banter follows the festival, after-finale banters included`；
    - `it is not offered while unregistered`；
    - `it is a night scene of the home kind, at most ten lines`。
  - `nights.test.ts`：`a festival night tells no memory; they wait for the next night`：`untold` 有三段，那一夜 `night` 是空的；下一次回城照公式挑。
  - `game.test.ts`：
    - `the festival leads the night and a reload plays it again until it is seen`；
    - `the night is ordered group, season, memory`（`NIGHT_RANK`，用注入的表造三種都有的情況）。
  - `game.test.ts`：
    - `the finale writes the spring day`；
    - `spring comes SPRING_AFTER days after the finale's dive`：之前的回城都是冬，之後是春。
  - `handbook.test.ts`：`the festival sits after Chizuru's homecoming on her page`。
  - `save.test.ts`：`a queued or seen season:spring loads`（只在已註冊時是合法的 id）。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
- [ ] **Step 4：執行**全套、閘門 `gate-7`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): seasons follow the story, and spring comes a moon after the finale`。

---

### Task 8：寫作：春祭

**Files:**
- Modify：
  - `data/story.zh-TW.ts`（`season:spring` 的劇本與摘要、`PL.shrineFestival = { text: '鎮邊小祠・春祭之夜', night: true }`、`SEASON_TITLES`）；
  - `data/story/scenes.ts`（`SEASON_SCENES.spring = 'season:spring'`）；
  - `docs/superpowers/story/starlantern-lore-ledger.md`（I-200）。
- Test：`data/story/story.test.ts`、`data/story/voice.test.ts`、`data/story/readAloud.test.ts`、`engine/story/events.test.ts`（拿掉 Task 7 的注入，改用真的註冊）。
- 已知會紅：Task 7 改過的 `SCENE_IDS` 長度再加一。

- [ ] **Step 1：W1 紅**：新增釘子：
  - `the spring festival sings the changed line to its end`：`pinBeat` 釘情節要點，每一種讀法都要有：
    - 白蘿蔔；
    - 「春祭的燈」；
    - 最後一句是「回來了」的意思；
    - 鈴響。
  - `it reads both ways: with group:act4 seen she stops a beat, without it she sets up the changed line first`（【審查修正 10】）：沒看過的讀法裡，「原本的後半，提燈的人沒有回來」與「今年改了」這兩件事，在唱出改過的那一句之前就說了；
  - 句數 ≤ 10；
  - 每一位說話者都有 `met` 閘門，千鶴除外，她一定已遇見。
- [ ] **Step 2：W3 寫**：照裁定 7 的九拍。
  - 讀過 `home:chizuru`、`group:act4`、終幕第 1369–1370 行、帳本 I-61、I-118、I-195，不能和它們矛盾；
  - 千鶴的口吻照聖經（古禮、不用「喔、啦、唷、呀、耶、嘛」）；
  - 洛恩不說教。
- [ ] **Step 3：W4–W6**。
- [ ] **Step 4：W7 冷讀**（【審查修正 10】：**兩種讀法都要及格**）。
  - 朗讀稿要分別印出兩種讀法：看過 `group:act4`，以及沒看過。
  - 兩位全新的讀者各讀一種。只讀「沒看過」的那一位，也不給他群戲與終幕。
  - 及格條件是 W7 的三條，再加一條：兩位都要答得出「最後那句歌詞原本是什麼、現在改成什麼、為什麼改」。
  - 任何一種讀法不及格，就回到 W3。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): the spring festival at Chizuru's shrine — the lamp song sung to its end`。

---

### Task 9：`useFieldItem` 不再壓低超量 HP（舊帳 b）

**Files:**
- Modify：`engine/town.ts:251-268`。
- Test：`engine/town.test.ts:149-170`。
- 已知會紅：無。

**Interfaces:**
- `restore`：`t.hp = Math.max(t.hp, Math.min(max.hp, t.hp + hp))`，TP 同理。
- `heal`：同樣只升不降。
- `revive`：不變（倒下的人 HP 是 0）。

- [ ] **Step 1：寫失敗的測試**（`describe('useFieldItem')` 裡）：
  - `a potion on a member above max HP (an altar's leftover) keeps the extra`：HP 設成上限 + 20，喝回復藥，HP 不變，藥少一瓶；
  - `a potion below max still heals up to max, not past it`（回歸）；
  - `TP above max is kept too`：用會回 TP 的道具。沒有這種道具就把這一條寫成 `restore` 效果的單元測試，並在報告註明。
- [ ] **Step 2：執行**，確認紅（第一條）。
- [ ] **Step 3：實作**。
- [ ] **Step 4：執行**全套、閘門 `gate-9`。`useFieldItem` 不在模擬裡，閘門必須相同。
- [ ] **Step 5：收尾 G，commit**：`fix(starlantern): a field item never lowers HP an altar raised past max`。

---

### Task 10：技能分頁的 TP 與迷宮施法同價（舊帳 a，只加守門）

**Files:**
- Test：`ui2/scenes/status.test.ts`（`:493` 那一則旁邊）。
- 不改程式（裁定 13）。

- [ ] **Step 1：寫守門測試**：`the skills tab asks the field's price for every field skill`：
  - 照 `engine/field.test.ts:175-187` 的做法，在測試裡暫時打開 `teachers-gift`；
  - 對每一位有迷宮技能的夥伴，技能分頁每一個迷宮技能的 `.slx-skill-cost` 文字等於 `T.ui2.status.tp(fieldCost(m, sk))`；
  - `afterEach` 還原。
- [ ] **Step 2：執行**。預期一寫就綠：報告註明「Task 0 已查證行為正確，這是守門，不是修正」。如果是紅的，就照 TDD 修 `statusTabs.ts` 讓它改用 `fieldCost`，並回報。
- [ ] **Step 3：收尾 G，commit**：`test(starlantern): pin the skills tab to the field's TP price`。

---

### Task 11：驗收

**Files:** 只寫 SDD；有修正時照該任務的規則改。

- [ ] **Step 1**：全套、tsc、e2e 三個專案全綠。閘門錄 `gate-final`，對 `gate-0` 必須 `gate: identical`，`cmp` 沒有輸出。`engine/storyL.dive.test.ts` 通過。
- [ ] **Step 2：讀檔一致性的手動腳本**（vitest，不 commit 的探測檔，跑完刪掉）：
  - 回城（今晚滿月）、播一段回憶、存檔、`Game.boot`；
  - 剩下的回憶、拍子、暗幕的月色、HUD 的月相都和讀檔前一致；
  - 再出發：碎片過濾用的是同一個月亮。
  - 結果寫進 SDD `reload.md`。
- [ ] **Step 3：全分支審查**：控制者派一位全新的審查者，用 `superpowers:requesting-code-review` 的做法看整條分支對 `<BASE>` 的差異。重點：
  - 有沒有任何地方讀了現實時間；
  - 戰鬥、模擬、期望值有沒有讀到日曆；
  - 保底有沒有被日曆擋住；
  - L 的夜晚排程有沒有被改到；
  - 字級與換行；
  - 帳本與劇本是否一致。
- [ ] **Step 4**：報告附上：
  - Task 3 的延遲表；
  - Task 6 的稽核表；
  - 兩次冷讀的結論；
  - 偏離本計畫的地方。
  - 交給控制者轉告使用者。
  - commit `chore(starlantern): time and moon acceptance`。

---

## 驗收條件（整份計畫）

- `story.day` 只在回城（含全滅、歸還之燈、終幕通關）與旅館住宿時加一。讀檔與出發不加。
- 月相四天一輪，`moonOf(0)` 是滿月；回城那一夜用前一天的月相。讀檔前後一致。
- 瑟蕾第 2、4 片只在滿月、第 5 片只在新月掉。保底不看月亮；月相對上的第一層一定有她的光點，必要時那一層有三個強制光點（只在實際遊戲，模擬與快照不走這條路）。三種玩家（隊伍含千鶴、波比）的第 5 片都在第 30 層以前。
- 終幕時第 5 片若還沒掉：之後在新月照常掉、照常在夜晚說；等她集滿的兩段閒聊不會過期，瑟蕾沒有歸鄉場景，沒有任何結局被錯過。
- `expectedMemories`、`memoryPace`、模擬閘門、下潛快照逐位元不變。一般難度的戰鬥、裝備、素材、金錢數字不變。戰鬥裡瑟蕾的月相與日曆無關，由 `Game` 層的守門測試證明。
- 凜的揭露在夜晚，帶今晚的月色。L 的必需回憶、`ALONE`、清晨、下潛前的那一夜規則全部照舊。
- 季節：第三幕之前秋、第三到第四幕與終幕之後的一個月相週期冬，之後春。
- 春祭：
  - 是夜晚的場景，不進白天的隊列；
  - 在千鶴歸鄉之後的第一次春天回城播一次；
  - 那一次回城沒有回城對話、沒有閒聊，那一夜沒有回憶；
  - 兩種讀法都有改歌詞的鋪陳，兩種讀法的冷讀都及格。
- 城鎮 HUD 顯示「季・月相」（12px），場景播放時收起；到站的場景播完後重算（第三幕那一次回城，選單一出現就是「冬」）。手冊提示寫出月相。
- 夜晚的暗幕隨月相變色，只用 CSS。回城的夜晚、凜的揭露、下潛前的那一夜（出發時與終幕清單裡）都帶今晚的月色；手冊重看與迷宮用原本的暗幕。
- 夜晚拍子裡**每一句**寫到月亮的句子（夥伴與旁白）都有 `moon`，新月的夜晚不會出現月光；核桃句不分季節；稽核表沒有遺漏。
- `useFieldItem` 不再壓低超量 HP、TP；技能分頁的 TP 有守門測試釘住與 `fieldCost` 同價。
- 沒有新美術、沒有佔位圖、沒有新字級、沒有存檔遷移。

## 驗證

1. `rtk proxy npx vitest run --testTimeout=20000`：全綠。
2. `rtk proxy npx tsc --noEmit -p .`：starlantern 0 錯；全 repo 不多於基準。
3. `rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-final <SDD>/gate-0`：最後一行 `gate: identical`；`cmp <SDD>/gate-final/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
4. `E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts`：`chromium`、`chromium-dpr125`、`chromium-dpr150` 全綠，headless、靜音。
5. `engine/storyL.dive.test.ts` 通過，`engine/__fixtures__/` 沒有任何差異（`git diff --stat -- src/scripts/games/starlantern/engine/__fixtures__` 為空）。
6. SDD 有：
   - `baseline.md`；
   - `task-3-report.md`；
   - `task-6-audit.md`；
   - 兩次冷讀紀錄；
   - `reload.md`；
   - 全分支審查的結論。
