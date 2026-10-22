# 星燈迷宮 計畫 6c Task 7.5：對話表情 id（每人的表情組、缺圖退回 normal、重標已寫好的台詞） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在程式裡定下對話表情的 id 與每個人能用的表情組；美術還沒到的表情一律顯示 `normal`，`allArtUrls()` 維持 246；故事測試檢查每一句的表情屬於說話的那個人；把 6c Task 4–7 已經寫好的角色台詞重新標上表情。之後 Task 8 起的寫作者直接用新的表情 id 寫，不必再回頭重標。

**Architecture:**
- **只定 id，不加圖。** 新表情只是型別與資料：`render/artPaths.ts` 宣告每個 art id 能用的表情（`MOODS_OF`），以及「已經在硬碟上的故事表情」（`PUBLISHED_FACES`）。`allArtUrls()` 只列已發佈的，所以總數不變；`speakerOf` 本來就只挑 `ArtIndex` 裡有的 url，所以沒有圖的表情顯示 `normal`，不會破圖。
- **錯的表情比中性的表情糟。** 新表情缺圖時直接退回 `normal`，不借用別的情緒；`sad → down → normal` 照舊。
- **表情是說話者的。** 專屬表情只屬於一個人（凜的兩套共用一組）；鎮民與旁白照舊不帶 `mood`。
- **凜移開視線是一個劇透。** `averted` 用在凜身上，等於畫面說「她開始避開他」，所以和帳本 I-11、I-29 同一條規則，寫成測試。
- 排在 6c **Task 7 之後、Task 8 之前**：凜的揭露、回城對話與 `rinOath` 已經寫好，可以一起重標；夥伴的寫作從一開始就用新 id。

**Tech Stack:** TypeScript、Vitest（happy-dom）。

**Spec:**
- `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md` §10（表情分類、每人的表情組、缺圖規則、檔名）、§11.1、§12.1。
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md` §5、§5.1、§8.1、§14。
- 文風聖經 `docs/superpowers/story/starlantern-style-bible.md` §3（每個人的個性）；帳本 `docs/superpowers/story/starlantern-lore-ledger.md` I-05、I-11、I-20、I-29。
- 上層計畫：`docs/superpowers/plans/2026-10-18-starlantern-plan6c-writing.md`。它的 **Global Constraints 全部適用**（分支、測試指令、換行、git 禁令、平衡凍結、美術 246、文字規則、測試修改規則）。本檔只寫和它不同或額外的部分。

> 沒有以 `src/`、`tests/`、`docs/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄沿用 `.superpowers/sdd/2026-10-18-starlantern-plan6c-writing/`，本任務的報告叫 `task-7.5-report.md`。

## Global Constraints（本任務額外的）
- **只碰下面 Files 列出的檔案。** 不改任何劇情文字（`text`、`summary`），只加、改、刪 `mood` 欄位。不改句子的順序、`if`、說話者。
- **不新增任何圖片**，也不改 `art-factory/`、`public/`。`allArtUrls()` 剛好 246 個 url，`render/artPaths.test.ts` 的數字不改。
- 換行：`render/artPaths.ts` 是 **CRLF**；`render/artPaths.test.ts` 是**混用**（照每一行原本的格式）；`ui2/story.ts`、`ui2/story.test.ts`、`data/story.zh-TW.ts`、`data/story/story.test.ts`、帳本是 **LF**。改前用 `git ls-files --eol <檔案>` 再確認一次；CRLF 檔不可以用 `sed -i`。改完看 `git diff --stat`，不可以出現整檔重寫。
- 平衡、`PLACEHOLDERS`：本任務不改任何數值，不寫任何 `ph()` 的文字；`PLACEHOLDERS.size` 前後相同。
- 實作者不派子代理。

---

## File Structure
- `render/artPaths.ts`：`CoreMood`、`SpecialMood`、`StoryMood`、`CORE_MOODS`、`SPECIAL_MOODS_OF`、`MOODS_OF`、`PUBLISHED_FACES`；`ExtraMood` 改成由 `StoryMood` 推出；刪掉 `EXTRA_MOODS`、`EXTRA_MOOD_IDS`；`allArtUrls()` 改讀 `PUBLISHED_FACES`；`art.portrait` 的參數型別。
- `render/artPaths.test.ts`：表情組與 url 的測試。
- `ui2/story.ts`：`faceOrder`、`speakerOf` 的型別改成 `StoryMood`（行為不變）。
- `ui2/story.test.ts`：缺圖退回 `normal` 的測試。
- `data/story.zh-TW.ts`：`ScriptLine.mood` 的型別；`STORY_MOODS` 換成 `moodsFor`、`moodAllowed`；重標 Task 4–7 的台詞。
- `data/story/story.test.ts`：表情屬於說話者、凜的 `averted` 規則、重標的釘點。
- `docs/superpowers/story/starlantern-lore-ledger.md`：§6「機械檢查與版面」加一條（`averted` 的閘門）。
- `docs/superpowers/story/starlantern-style-bible.md`：§3 每個人的小節末尾加一行「表情」（給 Task 8 以後的寫作者）。

---

### Task 7.5: 對話表情 id

**Files:**
- Modify：上面 File Structure 的全部檔案。
- Test：`render/artPaths.test.ts`、`ui2/story.test.ts`、`data/story/story.test.ts`；`render/published.test.ts` 與 `ui/art.test.ts` 不改，但必須照樣綠。

**Read：**
- spec（好感度與表情）§10.1–§10.4、§11.1、§12.1；
- `render/artPaths.ts` 全檔（`Mood`、`ExtraMood`、`EXTRA_MOODS`、`EXTRA_MOOD_IDS`、`art.portrait`、`allArtUrls`）；
- `ui2/story.ts` 的 `faceOrder`、`speakerOf`；`ui/art.ts`（`artIdOf`，凜誓約後用 `rin-oath`）；
- `data/story.zh-TW.ts` 的 `ScriptLine`、`STORY_MOODS` 與全部已寫好的 `SCRIPT` 條目；
- `data/story/story.test.ts` 的 `storyTexts`、`position`、`rinSecretAllowed`、`speakers and moods are valid`；
- 帳本 I-05、I-11、I-20、I-29；文風聖經 §3。

**Interfaces:**
- Produces（`render/artPaths.ts`）：
  ```ts
  /** Battle faces (unchanged). */
  export type Mood = 'normal' | 'attack' | 'hit' | 'dying' | 'down' | 'ultimate';
  /** Talking faces everyone has. */
  export type CoreMood = 'normal' | 'smile' | 'sad' | 'surprised' | 'serious' | 'blush';
  /** Talking faces only one character has (Rin's two looks share hers). */
  export type SpecialMood =
    | 'resolve' | 'distant'                 // hero
    | 'averted' | 'guarded'                 // rin, rin-oath
    | 'foresee' | 'wistful'                 // selene
    | 'solemn' | 'bewildered'               // chizuru
    | 'wink' | 'laugh'                      // safira
    | 'alert' | 'unguarded'                 // sylvie
    | 'smug' | 'pout' | 'panic'             // noel
    | 'excited' | 'grin' | 'focused'        // bobby
    | 'scheming' | 'hushed'                 // liz
    | 'vow' | 'shaken';                     // scarlet
  /** What a story line may ask for: a talking face, or the battle `down` for a collapse. */
  export type StoryMood = CoreMood | SpecialMood | 'down';
  /** Story faces beyond the battle set (kept as a name so existing imports still compile). */
  export type ExtraMood = Exclude<StoryMood, Mood>;
  export const CORE_MOODS: CoreMood[] = ['normal', 'smile', 'sad', 'surprised', 'serious', 'blush'];
  export const SPECIAL_MOODS_OF: Record<string, SpecialMood[]> = {
    hero: ['resolve', 'distant'], rin: ['averted', 'guarded'], 'rin-oath': ['averted', 'guarded'],
    selene: ['foresee', 'wistful'], chizuru: ['solemn', 'bewildered'], safira: ['wink', 'laugh'],
    sylvie: ['alert', 'unguarded'], noel: ['smug', 'pout', 'panic'], bobby: ['excited', 'grin', 'focused'],
    liz: ['scheming', 'hushed'], scarlet: ['vow', 'shaken'],
  };
  /** Every talking face of an art id: the core six, then that id's own. */
  export const MOODS_OF: Record<string, StoryMood[]>;   // built from CORE_MOODS and SPECIAL_MOODS_OF
  /** Story faces on disk, by art id. An art batch adds its moods here in the same commit as its registry entries. */
  export const PUBLISHED_FACES: Record<string, StoryMood[]> = {
    hero: ['smile', 'sad'], rin: ['smile', 'sad'], 'rin-oath': ['smile', 'sad'],
  };
  ```
  - `art.portrait(cid: string, mood: Mood | StoryMood)`：檔名規則不變（`normal` 沒有後綴）。
  - `allArtUrls()`：原本的 `for (const id of EXTRA_MOOD_IDS) urls.push(...EXTRA_MOODS.map(...))` 換成走 `PUBLISHED_FACES`（同樣的 6 個 url，同樣的順序）。`EXTRA_MOODS`、`EXTRA_MOOD_IDS` 刪掉（用 Grep 確認沒有別處引用）。
- Produces（`data/story.zh-TW.ts`）：
  ```ts
  export interface ScriptLine { who: Speaker; mood?: StoryMood; text: string; if?: … }   // only the mood type changes
  /** The faces `who` may wear in a story line: the talking faces of that character, plus the battle `down`. */
  export const moodsFor = (who: CharacterId): StoryMood[] => [...MOODS_OF[who], 'down'];
  /** Whether a line's mood fits its speaker: characters wear their own faces; the narrator and the town people wear none. */
  export function moodAllowed(who: Speaker, mood: StoryMood | undefined): boolean;
  ```
  - `STORY_MOODS` 刪掉，`story.test.ts` 改用 `moodAllowed`。凜的說話者 id 永遠是 `rin`（誓約後畫面用 `rin-oath` 是 `speakerOf` 的事），所以 `moodsFor('rin')` 就是她兩套共用的表情組。
- `ui2/story.ts`：`faceOrder(mood: StoryMood): StoryMood[]` 與 `speakerOf(…, mood: StoryMood = 'normal')` 只改型別。規則照舊：`normal → [normal]`；`sad → [sad, down, normal]`；其他 → `[mood, normal]`（不借用別的情緒，spec §10.3）。
- `story.test.ts` 的輔助（只在測試檔裡）：
  ```ts
  /** Rin may be shown looking away only once she has started to (lore ledger I-11, I-29). */
  const avertedAllowed = (key: string, line: ScriptLine): boolean
  ```
  成立的情況（任一）：
  1. `position(key)` 在 `act3` 或更晚（I-29：避開視線只能出現在第三幕以後）；
  2. 這句在凜的第 4 片以後的回憶裡（`scenes.mem:rin:<n>`，n ≥ 4；回憶在撿到時播，那時第 4 片一定已經有了）；
  3. 這句帶 `if.oath: true`（她已選擇，代表七片都在）。
  `if.oath: false` **不算**：它不保證第 4 片已經撿到（例：`chat:rin:2` 的門檻是第二幕）。

**重標表（Task 4–7 的產出）**
規則：
- 用內容找句子（`text` 的片段），不用行號。若 Task 7 的最終文字和下表的片段不同，依「意圖」欄判斷，並寫進報告。
- 只標有意義的地方：沒有明確情緒的句子不標（就是 `normal`）。下表沒列的角色台詞維持原狀。
- 表情只能用 `moodsFor(說話者)` 裡的；凜的 `averted` 必須通過 `avertedAllowed`。
- `rinLines`、`rinOath`、`townLines`、`truths`、`people`、`greet` 是純字串，畫面只顯示名字（或手冊文字），沒有立繪，**不在本任務重標**（要讓它們帶表情得改 `ui2/scenes/town.ts` 的格式，屬於之後的計畫）。報告裡註明「已檢查，格式不帶表情」。

| 場景 | 說話者 | 句子（片段） | 現在 | 改成 | 意圖 |
|---|---|---|---|---|---|
| `prologue` | hero | 洛……只有這個 | `sad` | `distant` | 想抓住一個想不起來的名字 |
| `prologue` | rin | 不認得。……但就用它吧 | ── | `guarded` | 醒來的第一句，戒備 |
| `mem:rin:3` | hero | 現在可以眨了 | ── | `smile` | 他的溫柔是做出來的 |
| `mem:rin:4` | rin | 名單上的人，我一個都不認得 | ── | `averted` | 第一次沒看著他回答（I-11） |
| `mem:rin:5` | rin | 我在那裡等了很久 | ── | `averted` | 手在發抖，不看他 |
| `mem:rin:6` | rin | ……別看我。一下就好 | `sad` | `averted` | 字面就是「別看我」 |
| `mem:rin:7` | rin | ……那把劍。上面的紋路 | `sad` | `surprised` | 認出紋路的那一下 |
| `mem:rin:7` | hero | 凜？妳想起什麼了？ | ── | `serious` | 察覺不對 |
| `mem:rin:7` | hero | 凜── | ── | `serious` | 打斷她 |
| `act2` | hero | 有幾條是灰的 | ── | `serious` | ── |
| `act2` | hero | 燈芯還在燒嗎？ | ── | `serious` | ── |
| `act4` | hero | 碑文四句（『艾斯特拉。……』等） | ── | `distant` | 讀得出沒學過的字（I-36） |
| `act4` | rin（`oath: false`） | ……我出去走走 | ── | `guarded` | 手按刀柄、站在門邊（I-38） |
| `act4` | rin（`oath: true`） | 洛恩。他們錯了。……你不是霧 | ── | `serious` | ── |
| `mem:hero:1` | hero | 想起來一點了 | ── | `distant` | 殘響 |
| `mem:hero:3` | hero | 絆住，不是為了殺 | ── | `distant` | 手記得 |
| `mem:hero:3` | hero | 劍、繩結……都有人教過我 | ── | `sad` | 一個也想不起來 |
| `mem:hero:4` | hero | 我擋過。擋在誰前面 | ── | `distant` | ── |
| `mem:hero:6` | hero | 那座塔，鎮上沒有 | ── | `serious` | ── |
| `mem:hero:6` | hero | 教我劍、盾、繩結和星星的人 | ── | `distant` | ── |
| `mem:hero:7` | hero | 拿刀的那個人，手在發抖 | ── | `serious` | ── |
| `mem:hero:8` | hero | 那一圈帳篷 | ── | `distant` | ── |
| `mem:hero:8` | hero | 照顧人的方法，手卻記得 | ── | `smile` | ── |
| `mem:hero:9` | hero | 我在上面活過的日子 | ── | `serious` | ── |
| `mem:hero:9` | hero | 原來我一直，想回來 | ── | `resolve` | 他的主題詞「回來」 |
| `mem:hero:10` | hero | 這把劍，是燈鑰 | ── | `resolve` | ── |
| `mem:hero:10` | hero | 第一次，是我自己選的 | ── | `distant` | ── |
| `mem:hero:10` | hero | 我知道該怎麼做 | ── | `resolve` | 握緊劍，朝燈走去 |
| `chat:hero:1` | hero | ……嗯。醒來的時候 | ── | `distant` | ── |
| `chat:hero:2` | rin | ……習慣了。總覺得 | ── | `guarded` | 第二幕，還不可以 `averted`（I-29） |
| `chat:hero:3` | hero | 回來了。……就這樣 | ── | `smile` | ── |
| `chat:hero:4` | hero | 凜。碑上那個人 | ── | `serious` | ── |
| `chat:hero:4` | rin（`oath: false`） | ……為什麼跟我說這個 | ── | `averted` | 第四幕，轉身上樓 |
| `chat:hero:4` | rin（`oath: true`） | 這一次，不是一個人 | ── | `serious` | ── |
| `chat:hero:4` | rin（`oath: true`） | 你下去的地方，我也去 | ── | `smile` | ── |
| `rin-reveal` | rin | 我被派來殺你。我現在選擇不要 | ── | `serious` | 直直看著他的眼睛 |
| `rin-reveal` | hero | 明天也一起回來吧 | ── | `smile` | ── |
| `chat:rin:1` | rin | 喂。葛倫說，是你把我從門裡拖出來的 | ── | `guarded` | ── |
| `chat:rin:2` | rin（`oath: false`） | ……沒什麼。只是，不想聽見它響 | ── | `guarded` | 第二幕的門檻，不可以 `averted` |
| `chat:rin:3` | rin（`oath: false`） | ……喂。你是人？ | ── | `averted` | 第三幕；視線落回刀刃 |
| `chat:rin:3` | hero（`oath: false`） | 我想是。會餓，會累 | ── | `smile` | ── |
| `chat:rin:3` | rin（`oath: true`） | 以前，我不敢看你的眼睛 | `smile` | `blush` | ── |
| `chat:rin:4` | rin | 那枚銅鐘，扣上的時候還是好的 | ── | `serious` | ── |

保持不變（列出來，免得被誤改）：`mem:rin:2` 的 `smile`、`mem:rin:3` 凜的 `sad`、`mem:rin:7` 凜的其餘 `sad`、`act3` 洛恩的 `sad`、`act4`「讀得懂那塊碑」的 `sad`、`act4` 凜（`oath: true`）「等過那口鐘響」的 `sad`、`mem:hero:2`、`5`、`7`、`9` 原有的 `sad`、`rin-reveal` 最後一句的 `smile`、`chat:rin:2`（`oath: true`）與 `chat:rin:4` 最後一句的 `smile`。

- [ ] **Step 1：確認基準**：`git ls-files --eol` 確認上面每個檔案的換行；執行 `rtk proxy npx vitest run src/scripts/games/starlantern/render src/scripts/games/starlantern/ui2/story.test.ts src/scripts/games/starlantern/data/story`，全綠，記下 `PLACEHOLDERS.size`（寫進報告）。

- [ ] **Step 2：紅燈（表情組與 url）**：在 `render/artPaths.test.ts` 新增：
  - `everyone has at least eight talking faces, the core six first`：對 `ART_CHARACTER_IDS` 與 `ART_VARIANT_IDS` 的每一個 id，`MOODS_OF[id].length >= 8`，前 6 個等於 `CORE_MOODS`，沒有重複；`MOODS_OF.rin` 等於 `MOODS_OF['rin-oath']`；
  - `a special face belongs to one character`：`SPECIAL_MOODS_OF` 裡每一個表情，只出現在一個角色（`rin` 與 `rin-oath` 算同一個）；沒有任何專屬表情和 `CORE_MOODS` 或 `MOODS`（戰鬥表情）重名；
  - `a declared face adds no url until it is published`：`allArtUrls()` 不含 `art.portrait('selene', 'blush')`、`art.portrait('hero', 'resolve')`、`art.portrait('rin-oath', 'averted')`；含 `PUBLISHED_FACES` 的每一個 url；`PUBLISHED_FACES` 的每一個表情都在該 id 的 `MOODS_OF` 裡；
  - 既有的 `lists one url per asset with no duplicates`（246）與 `matches the art registry runtime paths exactly` 不改。
  執行，確認因為 `MOODS_OF`、`SPECIAL_MOODS_OF`、`PUBLISHED_FACES`、`CORE_MOODS` 還不存在而失敗。

- [ ] **Step 3：紅燈（缺圖退回 normal）**：在 `ui2/story.test.ts` 的 `describe('speakerOf')` 新增 `a face with no art yet shows normal; one with art shows itself`：
  - 用既有的 `ART`（`allArtUrls()` 組成）：`speakerOf('selene', state, ART, 'blush').face` 是 `art.portrait('selene', 'normal')`；`speakerOf('hero', state, ART, 'resolve').face` 是 `art.portrait('hero', 'normal')`；
  - 另組一個 `ArtIndex` 加上 `art.portrait('selene', 'blush')`：同一個呼叫給 `blush` 的 url；
  - 凜誓約後（roster 的 `rin.oath = true`）：`speakerOf('rin', …, 'averted')` 在有 `rin-oath-portrait-averted.png` 的索引裡給那一張，沒有時給 `art.portrait('rin-oath', 'normal')`；
  - `sad` 仍是 `sad → down → normal`（既有測試若已涵蓋就不重複）。
  執行，確認型別錯誤或斷言失敗的原因是 `StoryMood` 還不存在（`'blush'` 不是合法參數）。

- [ ] **Step 4：紅燈（台詞的表情）**：在 `data/story/story.test.ts`：
  - 改寫 `speakers and moods are valid`：`STORY_MOODS` 換成 `expect(moodAllowed(l.who, l.mood), \`${key}: ${l.who} ${l.mood}\`).toBe(true)`（說話者檢查照舊）；
  - 新增 `a mood belongs to its speaker`：`moodAllowed('selene', 'smug')` 為 false、`moodAllowed('noel', 'smug')` 為 true、`moodAllowed('rin', 'averted')` 為 true、`moodAllowed('hero', 'averted')` 為 false、`moodAllowed('anna', 'smile')` 為 false、`moodAllowed('narrator', undefined)` 為 true、`moodAllowed('scarlet', 'down')` 為 true、`moodAllowed('scarlet', 'attack')` 為 false；
  - 新增 `Rin looks away only once she has started to`：每一句 `who === 'rin' && mood === 'averted'` 的台詞都通過 `avertedAllowed`；並直接測 `avertedAllowed`：`chat:rin:2` 帶 `oath: false` 的句子 → false，`mem:rin:4` 的句子 → true，`mem:rin:3` 的句子 → false，`act4` 的句子 → true，帶 `oath: true` 的句子 → true；
  - 新增 `the written scenes wear their faces`（重標的釘點，用內容找句子）：`mem:rin:6` 含「別看我」的那句是 `averted`；`mem:rin:7` 含「那把劍」的是 `surprised`；`mem:hero:10` 含「是燈鑰」的是 `resolve`；`rin-reveal` 含「選擇不要」的是 `serious`；`chat:rin:3` 帶 `oath: true` 的凜的句子是 `blush`；`prologue` 凜的句子是 `guarded`。
  執行 `rtk proxy npx vitest run src/scripts/games/starlantern/data/story`，確認失敗的原因是 `moodAllowed` 不存在、以及釘點的表情還是舊的。

- [ ] **Step 5：實作程式**：
  - `render/artPaths.ts`（CRLF）：照 Interfaces 加型別與常數，`MOODS_OF` 由 `CORE_MOODS` 與 `SPECIAL_MOODS_OF` 組出；`allArtUrls()` 改走 `PUBLISHED_FACES`；刪 `EXTRA_MOODS`、`EXTRA_MOOD_IDS`。
  - `ui2/story.ts`：`faceOrder`、`speakerOf` 的型別改成 `StoryMood`，import 跟著改。
  - `data/story.zh-TW.ts`：`ScriptLine.mood?: StoryMood`；刪 `STORY_MOODS`，加 `moodsFor`、`moodAllowed`（說話者是 `CHARACTER_IDS` 之一時，`mood` 為 `undefined` 或在 `moodsFor(who)` 裡；其他說話者只接受 `undefined`）。
  - 用 Grep 找 `ExtraMood`、`EXTRA_MOODS`、`STORY_MOODS` 的其他引用（`ui2/scenes/battle.ts`、`ui2/scenes/dungeon.ts` 傳 `l.mood` 進 `speakerOf`，型別自動跟上），全部改完。
  執行 Step 2、3 的測試，綠。

- [ ] **Step 6：重標台詞**：在 `data/story.zh-TW.ts` 照「重標表」改 `mood` 欄位，只動 `mood`。執行 Step 4 的測試，綠。

- [ ] **Step 7：文件**：
  - 帳本 §6「機械檢查與版面」加一條：「`averted`（凜移開視線）的位置規則：第三幕以後、凜第四片以後的回憶、或帶 `if.oath: true` 的句子（I-11、I-29；`story.test.ts` 的 `avertedAllowed`）。`if.oath: false` 不算。」
  - 文風聖經 §3：每個角色小節的末尾加一行「**表情**：核心 `normal`、`smile`、`sad`、`surprised`、`serious`、`blush`，專屬 `…`（各一句什麼時候用）」，內容抄 spec §10.2 的表；凜的那一行加上 `averted` 的位置規則；洛恩加上 `distant` 用在殘響、`resolve` 用在「回來」。鎮民與旁白寫一句「不帶表情」。這是給 Task 8 以後的寫作者看的。

- [ ] **Step 8：全套與檢查**：
  - `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」與「Tests」兩行，全綠；
  - `npx tsc --noEmit`：starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個錯誤；
  - `allArtUrls().length` 仍是 246（`render/artPaths.test.ts` 綠即可）；`PLACEHOLDERS.size` 與 Step 1 相同；
  - `git diff --stat`：沒有整檔重寫；`data/story.zh-TW.ts` 的 diff 只有型別、`STORY_MOODS`、兩個新函式與 `mood` 欄位（用 `git diff -U0 data/story.zh-TW.ts | grep '^[-+]' | grep -v mood` 檢查，除了型別與函式的那幾行，沒有別的變更）；
  - `grep -rn "it.fails\|it.skip\|\.only(\|\.todo(" src/scripts/games/starlantern` 沒有結果。
  平衡測試不必跑（本任務不碰任何數值、模擬或戰鬥程式）；報告裡註明理由。

- [ ] **Step 9：報告**（`task-7.5-report.md`）：每一句重標的前後（場景、說話者、片段、舊值、新值）；和重標表不同的地方與理由；純字串類別「已檢查，格式不帶表情」；`PLACEHOLDERS.size` 前後；全套與 tsc 的數字。

- [ ] **Step 10：commit**：只 add 本任務的檔案（完整路徑）。訊息：
  ```
  feat(starlantern): story faces per character, and the written lines wear them

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

**審查清單**（審查者沒參與實作）
1. 246 沒變，registry 測試綠；沒有任何圖片、`art-factory/`、`public/` 的變更。
2. 缺圖的新表情顯示 `normal`，不借用別的情緒；`sad` 的退路不變。
3. 每個 art id ≥ 8 種對話表情；專屬表情只屬於一個人；凜兩套相同。
4. 劇情文字一個字都沒變（只有 `mood`）；`if`、順序、說話者沒變。
5. 重標的表情符合文風聖經的個性（例：凜揭露前的冷、洛恩的「溫柔是做出來的」）；凜的 `averted` 沒有出現在第二幕的門檻裡（I-29）。
6. 文風聖經與帳本的新增內容和 spec §10.2 一致。

## 交給 Task 8 以後的寫作者
- 寫每一句角色台詞時，從 `moodsFor(說話者)` 挑表情；不標就是 `normal`。美術還沒到時畫面上就是 `normal`，不必等圖。
- `down` 只用在倒下、崩潰的瞬間；`attack`、`hit`、`dying`、`ultimate` 不可以用在對白（`moodAllowed` 會擋）。
- 夥伴的專屬表情見 spec §10.2 與文風聖經 §3 的新行：例如諾艾兒被說中時 `pout`、慌的時候 `panic`；波比講到機關 `excited`；莉茲說到家人 `hushed`；絲嘉蕾起誓 `vow`。
- 美術計畫（spec §11.4，5e）之後每發佈一批，只改 `PUBLISHED_FACES`、registry 與 246 的數字；台詞不必再動。
