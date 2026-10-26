# 2026-10-24 對話表情第四波（14 張，好感度計畫 Task A，codex，已發佈）

- 依據：計畫 `docs/superpowers/plans/2026-10-24-starlantern-affinity.md` Task A；spec `2026-10-18-starlantern-affinity-expressions-design.md` §0 D18、§10.2、§10.5。
- 核准：使用者 2026-10-24 看過樣本（`runs/2026-10-24-faces-wave4-sample`）回「可以，照這風格」，凜（誓約後）averted 用 a2（頭轉開）。登錄表 `approved_by` 記這兩句。
- 14 張：九位夥伴的 `blush`（凜只做誓約後 `rin-oath`）、凜兩套的 `averted`（誓約前 `rin`：心虛、迴避，鐘有裂痕；誓約後：害羞，鐘敲平）、希爾薇 `unguarded`、諾艾兒 `smug`、波比 `excited`。

## 生成（codex，一次一個，每張最多 2 次）

- 樣本 4 張沿用樣本那一輪的候選（5 次呼叫）。其餘 10 張：`faces.py gen --wave=4 --n=1` 10 次，之後 2 張生 a2（`WAVE4_NOTES`）。這一輪共 12 次呼叫，第四波總共 17 次。log 沒有 usage／rate limit 訊息；沒有用 Gemini。
- 凜兩套與絲嘉蕾的原始閘門顯示「foreground touches the canvas edge」：身體碰底邊，後處理 `allow_edge: [bottom]` 判定碰邊 0。

## 選定（每張都在原尺寸看過能讀出表情）

| id | 發佈 | 淘汰與原因 |
|---|---|---|
| rin averted | a1 | ── 頭轉開、視線往下、皺眉抿嘴：心虛迴避 |
| rin-oath blush | a1 | ── |
| rin-oath averted | a2 | a1：只移了眼珠，原尺寸看不出迴避（使用者選 a2） |
| selene blush | a1 | ── |
| chizuru blush | a1 | ── |
| safira blush | a1 | ── |
| sylvie blush | a1 | ── |
| sylvie unguarded | a2 | a1：原尺寸幾乎和她帶笑的 normal 一樣；a2 閉眼、歪頭、滿足的笑，一眼是卸下防備 |
| noel blush | a1 | ── |
| noel smug | a1 | ── 半閉眼、斜嘴笑 |
| bobby blush | a2 | a1：畫布比 normal 寬 1 個美術像素（123 對 122），尺寸必須一致；a2 一致，臉紅更明顯（偏慌張） |
| bobby excited | a1 | ── |
| liz blush | a1 | ── |
| scarlet blush | a1 | ── 紅髮上的粉紅硬邊點分得開 |

淘汰的只留在 `work/<id>/cand/a<N>/`，原因記在登錄表 `rejected_attempts`，不在 runtime 路徑。

## QA（14 張全部通過）

- 機械 QA：magenta 殘留 0、半透明 0、碰邊 0（只允許底邊）；封閉洞都是小洞（警告），在頭髮、帽簷、飾品的縫。
- 對照 normal：尺寸與 block 和各自的 normal 完全相同（差 0,0），normal 色盤佔 99.2–100%。
- runtime 檔逐位元組等於選定的候選；manifest 708 → 722。

## 發佈與接線

- `faces.py pick --wave=4 --id <id> --attempt <N>` → `Registry.approve`（`approved_by`）→ `Registry.publish` 只發這 14 個 id → 重寫 manifest。
- `render/artPaths.ts` 的 `PUBLISHED_FACES`：凜兩套各自加 `averted`，只有 `rin-oath` 加 `blush`；八位夥伴加 `blush`，希爾薇 `unguarded`、諾艾兒 `smug`、波比 `excited`。`MOODS_OF` 本來就有這些表情。
- `ui2/story.ts` 不用改：喜悅類（`WARM_MOODS`）先找自己的臉再借 normal，所以 excited、smug、blush 的活潑台詞現在用新臉；`averted`、`unguarded` 在重場景先找自己的臉、再照 `NEAR_FACE` 找 sad；凜的 `CALM_NORMALS` 最後備援不變。
- `ui2/storyFaces.test.ts`：劇本裡 30 句帶這五種標籤的台詞（averted 6、blush 4、excited 6、smug 12、unguarded 2），在輕場景與重場景都顯示說話者那個時期的臉；整份劇本重場景隱藏頭貼仍是 0；總表 heavy exact 161 → 172、light exact 95 → 114。

## 審核頁與截圖

- `review.html`：14 張和該角色之前已有的每張臉並排（每次嘗試都列，選定的標「發佈」），劇本台詞放在遊戲對話框樣式裡（之前借的臉｜新臉），以及 14 張各自服務的台詞與用途。
- `montage.png`：14 張選定版的 3× 總覽。
- `ingame/`：遊戲內 1280×720 截圖（headless，從手冊人物頁重看場景，停在目標台詞）。
- 產生：`python art-factory/starlantern/tools/review_faces.py wave4-final 2026-10-24-faces-wave4`。

## 驗證（2026-10-25）

- vitest 全套：7464 通過、11 失敗：9 個是全套負載下的 5 秒逾時、1 個效能門檻（`dungeon/gen.test` 1000 seeds 228 ms 對 150 ms），都和本波無關，單獨重跑都通過，只有 `engine/builds.test` 的「every build is valid…」單跑也要 5.3 秒，逾時邊緣，不 import 美術或劇本。另一個是 `ui2/story.test` 的 speakerOf 測試用了已發佈的 selene blush／rin-oath averted 當「還沒發佈」的例子，改成 foresee／surprised。
- tsc：773 個，starlantern 0。`engine/` 沒有 diff。
- e2e（`E2E_PORT=4353`，chromium、chromium-dpr125、chromium-dpr150）：108 通過、3 失敗。「every published art file loads」的 manifest 數 708 → 722 已更新並通過。另外兩個（star-light pillar 的掉落行圖示、商店清單的裝備圖示）把 manifest 暫時拿掉這 14 張（回到 708）重跑仍然失敗，所以和這一波無關；manifest 已改回 722。
- 遊戲內截圖 `ingame/`：手冊人物頁重看 chat:noel:2（諾艾兒 blush）、banter:chizuru-rin:2（凜誓約後 averted）、chat:bobby:1（波比 excited）、banter:bobby-sylvie:2（希爾薇 blush），頭貼 src 都是新臉。
