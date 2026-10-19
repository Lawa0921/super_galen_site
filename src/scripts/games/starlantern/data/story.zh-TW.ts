// Story copy (zh-TW): the script plan 6c wrote. Read the style bible and the lore ledger before changing a line.
import type { CharacterId } from '../engine/types';
import { MOODS_OF, type StoryMood } from '../render/artPaths';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { MEETINGS, type Meetable } from './meetings';
import { CHAINS } from './story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from './story/fragments';
import { CHAT_COUNT, HOME_OWNERS, type HomeOwner, MAJOR_SCENES, type MajorScene, homeScene, memScene, type SceneId, type Stage } from './story/scenes';

export type NpcId = 'anna' | 'orik' | 'marta' | 'glen' | 'doran' | 'merchant' | 'bellkeeper';
export const NPC_NAMES: Record<NpcId, string> = {
  anna: '安娜', orik: '歐里克', marta: '瑪莎', glen: '葛倫', doran: '多蘭', merchant: '流浪商人', bellkeeper: '鐘守',
};

export type Speaker = CharacterId | NpcId | 'narrator';
export interface ScriptLine {
  who: Speaker; mood?: StoryMood; text: string;
  /**
   * `full`: that person's memories are all found; `notFull`: not yet (a chat can play before or after her last piece).
   * `oath`: Rin has made her choice (`true`) or has not yet (`false`).
   * `returned`: that townsfolk fragment has been given back; `notReturned`: not yet (Liz's last piece reads both ways).
   */
  if?: { met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId; notReturned?: TownFragmentId; full?: CharacterId; notFull?: CharacterId; oath?: boolean };
}

/** What a scene's conditions are checked against. */
export interface LineWhen { met: CharacterId[]; full: CharacterId[]; returned: TownFragmentId[]; oath: boolean }

/** The lines that play: every line whose conditions all hold (a line with none always plays). */
export function linesWhen(lines: ScriptLine[], w: LineWhen): ScriptLine[] {
  return lines.filter((l) => {
    const c = l.if;
    if (!c) return true;
    if (c.met && !w.met.includes(c.met)) return false;
    if (c.notMet && w.met.includes(c.notMet)) return false;
    if (c.returned && !w.returned.includes(c.returned)) return false;
    if (c.notReturned && w.returned.includes(c.notReturned)) return false;
    if (c.full && !w.full.includes(c.full)) return false;
    if (c.notFull && w.full.includes(c.notFull)) return false;
    if (c.oath !== undefined && c.oath !== w.oath) return false;
    return true;
  });
}

/** The faces `who` may wear in a story line: the talking faces of that character, plus the battle `down`. */
export const moodsFor = (who: CharacterId): StoryMood[] => [...MOODS_OF[who], 'down'];
/** Whether a line's mood fits its speaker: characters wear their own faces; the narrator and the town people wear none. */
export function moodAllowed(who: Speaker, mood: StoryMood | undefined): boolean {
  if (mood === undefined) return true;
  return (CHARACTER_IDS as string[]).includes(who) && moodsFor(who as CharacterId).includes(mood);
}
/** The longest a line of story text may be, in characters (the dialogue box shows about this much). */
export const MAX_LINE_CHARS = 60;
/** Who may speak in a memory besides its owner, the hero and the narrator. Each entry needs a reason in the lore ledger. */
export const MEMORY_GUESTS: Partial<Record<SceneId, Speaker[]>> = { 'mem:liz:5': ['orik'], 'mem:noel:5': ['merchant'] };

/**
 * Every string that is still draft copy. Plan 6c has written the whole script, so it stays empty (Task 14 removed the draft
 * generators); the story gates keep checking it so that no draft can come back.
 */
export const PLACEHOLDERS: ReadonlySet<string> = new Set<string>();
/** A written part of the script; a missing one is a bug now that there are no drafts. */
function written<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`starlantern story: ${what} is not written`);
  return v;
}

const nameOf = (id: CharacterId): string => CHARACTERS[id].name;
/** 1 to 10 in Chinese numerals: story text carries no Arabic digits. */
export const numeral = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`numeral(${n}): only 1 to 10`);
  return '一二三四五六七八九十'[n - 1];
};

const MAJOR_TITLES: Record<MajorScene, string> = {
  prologue: '序章', 'prologue-inn': '序章・旅館的第一夜', 'first-return': '回城的那一夜', 'act1-after': '第一幕・之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', 'bellkeeper-arrives': '鐘守來到鎮上', finale: '終幕',
};
/** What each homecoming is called in the handbook, after her name (continuity fix 2). */
const HOME_TITLES: Record<HomeOwner, string> = { chizuru: '鎮邊的小祠', safira: '廣場上的最後一支舞', sylvie: '窗外的新芽', liz: '店門口' };

type Written = { lines: ScriptLine[]; summary: string };
const N = (text: string, oath?: boolean): ScriptLine => (oath === undefined ? { who: 'narrator', text } : { who: 'narrator', text, if: { oath } });

/** The finished script, scene by scene (plan 6c). Read the style bible and the lore ledger before adding to it. */
const SCRIPT: Partial<Record<SceneId, Written>> = {
  // Task 4: the prologue (spec §9.2, §3.3, §4).
  prologue: {
    lines: [
      N('黎明前的傳送門廣場。暮霧貼著石板流動，西邊高地上的星燈，淡得像快燒盡的燭火。'),
      { who: 'glen', text: '「喂，醒醒！……這身灰，是深處才有的。」' },
      { who: 'glen', text: '「沒人走進去，門卻自己亮了。這小子抓著那女孩的手腕，把她拖了出來，走了三步就倒了。」' },
      N('冒險者公會。安娜攤開一張失憶登記表：找到的地點、身上的東西、記得的最後一句話。'),
      { who: 'anna', text: '「一把刻著怪紋路的劍。還有……你醒來之後，一直在念一個『洛』字。」' },
      { who: 'hero', mood: 'distant', text: '「洛……只有這個。後面的，怎麼也想不起來。」' },
      { who: 'anna', text: '「那就叫你洛恩吧。名字總要有一個，回來的時候，才有人喊得出來。」' },
      { who: 'anna', text: '「妳的刀柄上也刻著字。……『凜』。認得嗎？」' },
      { who: 'rin', mood: 'guarded', text: '「不認得。……但就用它吧。」' },
      N('凜把短刃收回鞘裡。她看了洛恩一眼，在他回頭之前，移開了視線。'),
      { who: 'anna', text: '「回復藥五瓶，歸還之燈一盞。在下面迷路了就點燈，星燈會把你們拉回來。」' },
      N('從那天起，鎮上的人叫他「歸來者」──唯一從迷宮深處走出來的人。'),
    ],
    summary: '黎明的傳送門廣場倒著兩個失憶的人。安娜替他取名洛恩，凜則用刀柄上的字當名字。他是唯一從深處走出來的人。',
  },
  // Task 10b: why the two of them go down together (lore ledger I-81 to I-86). The first night, before the town is the
  // player's: the grip, each other's only lead, one lamp, the debt, and the pull she takes for instinct (her 7th piece pays it).
  'prologue-inn': {
    lines: [
      N('深夜的月影旅館。洛恩從夢裡驚醒，窗邊的凜還睜著眼，朝著他的床，像是不知道他在哪裡，就睡不著。'),
      N('她手腕上一圈發青的指痕。那幾根手指，葛倫怎麼掰也掰不開。洛恩把自己的手，悄悄縮回被子裡。'),
      { who: 'hero', mood: 'normal', text: '「妳是唯一和我一起出來的人。我以前是誰，也許妳看過。」' },
      { who: 'rin', mood: 'guarded', text: '「我什麼都不記得。你是我唯一的線索。還有。你說夢話，三次。吵。」' },
      { who: 'hero', mood: 'serious', text: '「明天我要下去。我怎麼會從下面走出來，只有下面知道。何況欠公會的帳，也只有碎片還得起。」' },
      { who: 'rin', mood: 'normal', text: '「我跟你去。」' },
      { who: 'hero', mood: 'surprised', text: '「為什麼？妳不是嫌我吵？」' },
      { who: 'rin', mood: 'serious', text: '「公會說，一起下去的，算同一盞燈。一個人下去，就沒有燈帶你回來。」' },
      { who: 'rin', mood: 'sad', text: '「吵是吵。……反正，我也只剩下面了。」' },
      { who: 'rin', mood: 'normal', text: '「還有。你走路的樣子，我好像在哪裡看過。」' },
    ],
    summary: '旅館的第一夜。兩人都欠著公會，又只有彼此是自己的線索。同一盞燈的兩個人，決定一起下去。',
  },
  // Task 10b: the return after the first fight Rin won in (not always the first return). Her first trust in a fight,
  // mirrored on his grip; she will not take thanks. Nothing here says "first": an earlier return may have played a chat.
  'first-return': {
    lines: [
      N('月影旅館。從迷宮回來的那一晚，洛恩替自己的手臂纏繃帶。纏了三圈，鬆了兩圈。'),
      N('下面那一擊，本來會正中他的胸口。是凜撲過來，抓住他的手腕，往後一扯。'),
      { who: 'hero', mood: 'smile', text: '「那一下，謝謝。」' },
      { who: 'rin', mood: 'guarded', text: '「不用謝。身體自己動的。想了，就來不及了。」' },
      N('她看著自己那隻手，像是不認得它。指尖碰到領口的小銅鐘，停了一下，才收回來。'),
      { who: 'rin', mood: 'normal', text: '「還有。那個繃帶，纏成那樣，不如不纏。」' },
      N('她拆掉繃帶，三兩下重新纏好。緊得洛恩倒吸了一口氣。'),
      { who: 'rin', mood: 'normal', text: '「太鬆會掉。太緊，是故意的。」' },
      { who: 'hero', mood: 'smile', text: '「那就，下次也拜託了。兩件事都是。」' },
      N('凜沒有回答。她背靠著房門，在地上坐下，短刃橫在膝上。從那裡，看得見他。'),
    ],
    summary: '從迷宮回來的那一晚。下面那一擊，是凜把洛恩拉開的。她說身體自己動的，又嫌他繃帶纏得太醜。',
  },
  // Task 4: Rin's seven memories (spec §5, §5.1, §3.6). Pieces 1–2 warm and a little off, 3–5 cold, 6–7 heavy.
  'mem:rin:1': {
    lines: [
      N('石板路的盡頭有一座鐘樓。小女孩每天坐在台階上，等那口大鐘響。'),
      N('「它不會響的。」大人們笑著摸她的頭，「它要是響了，我們就有工作了。」'),
      { who: 'hero', text: '「想起什麼了？」' },
      { who: 'rin', text: '「……一座鐘。很安靜。我小時候，好像一直在等它響。」' },
    ],
    summary: '凜想起鐘樓下的童年。那口大鐘從來不響；大人說，它響了才有工作。',
  },
  'mem:rin:2': {
    lines: [
      N('冬天的院子。木樁上畫著一個圓，有人把細針放進她手心：「來玩遊戲。丟中了，晚上有湯喝。」'),
      N('她丟到天黑，手指凍得發紫。那晚的湯好燙，她捧著碗，一口一口全喝完了。'),
      { who: 'hero', text: '「妳丟針的準頭，是那時候練的？」' },
      { who: 'rin', mood: 'smile', text: '「嗯。那是遊戲。……湯很燙，很好喝。」' },
    ],
    summary: '凜想起冬天丟針的「遊戲」，和丟中之後那碗很燙的湯。',
  },
  'mem:rin:3': {
    lines: [
      N('燭火前，有人用兩根手指撐開她的眼皮：「不准眨。眨一次，目標就不見了。」'),
      N('她盯著火，直到眼淚流乾、火光變成一片白。這一次，沒有人說這是遊戲。'),
      { who: 'rin', mood: 'sad', text: '「我在戰鬥裡從來不眨眼。……我一直以為，那是天生的。」' },
      { who: 'hero', mood: 'smile', text: '「現在可以眨了。這裡沒有人逼妳。」' },
    ],
    summary: '凜想起不准眨眼的訓練。洛恩告訴她，現在可以眨了。',
  },
  'mem:rin:4': {
    lines: [
      N('一張泛黃的名單。名字一個接一個被劃掉，墨跡有新有舊，筆跡都是同一個人的。'),
      N('師父擱下筆：「從深處走出來的，不是人，是迷宮的意志。它走到哪裡，暮霧就跟到哪裡。」'),
      { who: 'rin', mood: 'averted', text: '「名單上的人，我一個都不認得。……一個都不。」' },
      N('洛恩問她怎麼了。她說沒事，第一次沒有看著他的眼睛回答。'),
    ],
    summary: '凜想起被劃掉的名單和師父的話：從深處走出來的，不是人。她開始避開洛恩的視線。',
  },
  'mem:rin:5': {
    lines: [
      N('荒野裡，一扇半埋在土中的石門，門縫終日吐著霧。她被派到那裡，一個人。'),
      N('「守著這扇門。」師父說，「鐘響的那天，妳就會知道該做什麼。」'),
      { who: 'rin', mood: 'averted', text: '「我在那裡等了很久。等的是什麼……還想不起來。」' },
      N('她說得很平靜，握著短刃的手卻在發抖。洛恩看見了，什麼也沒問。'),
    ],
    summary: '凜想起自己被派去守一扇吐霧的石門，等著某一天鐘響。',
  },
  'mem:rin:6': {
    lines: [
      N('守門的第幾年，她已經數不清了。那天夜裡，遠方那座從不響的鐘響了，領口的小銅鐘也跟著響。'),
      N('她想起臨行前，師父替她扣上銅鐘：「靜鐘會的信物。它響了，就是時候了。」'),
      N('師父把短刃交到她手上：「『凜』是妳的代號。鐘響了，就去殺那個從深處走出來的人。」'),
      { who: 'rin', mood: 'averted', text: '「……別看我。一下就好。」' },
    ],
    summary: '鐘自己響了。「凜」是刺客的代號；她的任務，是殺死從深處走出來的人。',
  },
  'mem:rin:7': {
    lines: [
      N('鐘響了三天，石門卻什麼也沒走出來。她握緊短刃，自己走進了迷宮。'),
      N('她在深處找到了他。那人渾身是灰，拖著一把刻滿紋路的劍，一步一步往上走。'),
      N('她跟在後面，跟了好幾層。他沒發現她，像是只看得見頭頂那一點光。'),
      N('出口就在前面。她拔出短刃，刀尖離他的後頸，只剩一個呼吸的距離。'),
      N('就在那一瞬間，暮霧從四面八方湧上來。白色吞掉了光，吞掉了路，也吞掉了她記得的一切。'),
      N('最後剩下的，是一隻手。有人在霧裡抓住她的手腕，把她往光的方向拉。'),
      { who: 'rin', mood: 'surprised', text: '「……那把劍。上面的紋路，我看過。」' },
      { who: 'hero', mood: 'serious', text: '「凜？妳想起什麼了？」' },
      { who: 'rin', mood: 'sad', text: '「霧裡抓住我的那隻手……是你的。」' },
      { who: 'rin', mood: 'sad', text: '「我追了那麼多層，追的人……原來──」' },
      { who: 'hero', mood: 'serious', text: '「凜──」' },
      N('她退了一步，又一步。短刃還在鞘裡，她的手卻一直握著刀柄，沒有放開。'),
    ],
    summary: '凜想起她追進迷宮，在出口前和目標一起被暮霧吞沒。那個人，就是洛恩。',
  },
  // Task 5: the act nodes (spec §8.4, §8.5, §3.4, §3.6). Each plays in the town, the first return after its depth.
  'act1-after': {
    lines: [
      N('三天後的清晨。暮霧從傳送門的方向漫回來，貼著石板，流進鎮上每一條巷子。'),
      N('西邊高地上，星燈的光柱還亮著，卻比打倒燈喰之獸以前更暗了。'),
      { who: 'glen', text: '「才三天。……小子，別洩氣。門還開著。」' },
    ],
    summary: '燈喰之獸倒下三天後，暮霧又回來了。星燈的光，比以前更暗。',
  },
  act2: {
    lines: [
      N('冒險者公會。洛恩把一塊石頭放上櫃台，那是從本道第四層的牆上敲下來的。'),
      N('石頭裡有光，細得像葉脈，全都往同一個方向流──往下。'),
      { who: 'anna', text: '「這紋路……西邊高地的星燈，基座上刻的就是這個。」' },
      { who: 'hero', mood: 'serious', text: '「有幾條是灰的。摸上去，會聽見不認識的人在說話。」' },
      { who: 'anna', text: '「公會的老人說過：山上那道光只是燈罩，真正在燒的燈芯，在迷宮的最底下。」' },
      { who: 'anna', text: '「迷宮的牆如果是燈的根……那它是在燈壞掉之後，才長出來的。」' },
      { who: 'hero', mood: 'serious', text: '「燈芯還在燒嗎？」' },
      { who: 'anna', text: '「光柱一年比一年暗。……還在燒，可是快燒完了。」' },
      N('月影旅館。瑪莎端上熱湯，凜捧起碗，一口氣喝到見底，眉頭也沒有皺一下。'),
      { who: 'marta', text: '「慢點，孩子，那是剛起鍋的。」' },
      { who: 'rin', text: '「……湯要趁熱喝完。不然，就沒有了。」' },
      N('洛恩看著她空掉的碗，什麼也沒說。'),
    ],
    summary: '第四層的牆裡流著星燈的光。燈芯在迷宮最底下，迷宮是燈壞掉之後長出來的。凜喝湯的樣子有點不對勁。',
  },
  act3: {
    lines: [
      N('冒險者公會的地下室。安娜搬出最舊的一本登記簿，封皮上的字已經磨平了。'),
      { who: 'anna', text: '「替你的碎片建檔的時候，我總覺得，這些字我在哪裡讀過。」' },
      N('泛黃的一頁。找到的地點：傳送門廣場。身上的東西：一把刻著怪紋路的劍。'),
      N('記得的最後一句話，只有一個字：「洛」。'),
      { who: 'anna', text: '「比我出生還早。後面還有，每隔幾十年就一筆。……我數到第七筆，就數不下去了。」' },
      N('每一筆的最後一欄，不是「回到迷宮，未歸」，就是「死亡」。'),
      { who: 'anna', text: '「寫著死亡的那幾筆，邊上都有人補了同一個名字。不是人名，是一個結社。」' },
      { who: 'anna', text: '「『靜鐘會』。老冒險者說，他們不搶錢，也不搶碎片。只要一條命。」' },
      { who: 'hero', mood: 'sad', text: '「……我被殺過。不只一次。」' },
      N('安娜闔上登記簿，把今年那一張登記表抽出來，放在最上面。'),
      { who: 'anna', text: '「你這一張，最後一欄我還空著。……我打算一直空著。」' },
      N('回旅館的路上，洛恩第一次停下腳步，回頭看了一眼身後的暮霧。'),
    ],
    summary: '公會最舊的登記簿裡，記著好幾個和洛恩一模一樣的人，有幾筆死於「靜鐘會」之手。安娜說，他這一張的最後一欄會一直空著。',
  },
  act4: {
    lines: [
      N('本道第十六層。崩落的牆後面，埋著一整座城：石板街、屋頂、乾掉的噴泉。'),
      N('廣場中央的石碑，刻滿和洛恩的劍上一樣的紋路。沒有人教過他，他卻讀得出來。'),
      { who: 'hero', mood: 'distant', text: '「『艾斯特拉。此燈收逝者之記憶，點之為光，使其長明。』」' },
      { who: 'hero', mood: 'distant', text: '「『戰後，眾人欲忘，盡傾悲傷於燈。光遂變質，燈根生為迷宮。』」' },
      { who: 'hero', mood: 'distant', text: '「『一人自願下行，以己之記憶為燈芯。後人稱之守燈人。』」' },
      { who: 'hero', mood: 'distant', text: '「『芯盡，其人被吐還地面，一無所記；終將復歸深處，再點此燈。』」' },
      N('冒險者公會。安娜聽完，翻開那本舊登記簿，指著邊上一行褪色的小字。'),
      { who: 'anna', text: '「靜鐘會的人說，那個走出來的人『走到哪裡，暮霧就跟到哪裡』。」' },
      { who: 'anna', text: '「他們看反了。不是有人走出來，霧才變濃。是燈芯快燒完了，霧才變濃。」' },
      { who: 'hero', mood: 'sad', text: '「……那我為什麼，讀得懂那塊碑？」' },
      // Rin's lines know whether she has made her choice: act 4 may play before her reveal or after it (U1).
      { who: 'narrator', text: '凜一直站在門邊。她的手按著刀柄，像是在等某個聲音。', if: { oath: false } },
      { who: 'rin', mood: 'guarded', text: '「……我出去走走。這裡太安靜了。」', if: { oath: false } },
      { who: 'rin', mood: 'sad', text: '「我等過那口鐘響。……等的，原來是一個誤會。」', if: { oath: true } },
      { who: 'rin', mood: 'serious', text: '「洛恩。他們錯了。……你不是霧。」', if: { oath: true } },
    ],
    summary: '地底的古城艾斯特拉。石碑說，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。洛恩讀得懂碑文。',
  },
  // Task 6: Lorne's memories (spec §4, §3.4, §3.6, §4.6, §8.4). Pieces 1–8 hint; piece 9 names the keeper, piece 10 the key.
  'mem:hero:1': {
    lines: [
      N('黑暗裡有一點光，遠得像針尖。他拖著劍，一層一層往上走。'),
      N('他不知道自己是誰，也不知道要去哪裡。只知道，要朝那點光走。'),
      { who: 'hero', mood: 'distant', text: '「想起來一點了。……我是朝著光，走上來的。」' },
      N('洛恩握緊劍柄。上面的紋路，摸起來還是溫的。'),
    ],
    summary: '洛恩想起自己拖著劍，在黑暗裡朝頭頂的一點光往上走。',
  },
  'mem:hero:2': {
    lines: [
      N('下著雪的院子。他握著一把木劍，手凍得發紅，一遍又一遍地揮。'),
      N('有人從背後扶正他的手腕：「太緊了。劍是放出去的，不是抓著的。」'),
      { who: 'hero', mood: 'sad', text: '「這把劍，是那個人教的。……那張臉，我想不起來。」' },
      N('他照著那句話，把握劍的手鬆開一點。這一劍，比剛才快。'),
    ],
    summary: '洛恩想起雪地裡有人教他握劍。教他的人，他想不起臉。',
  },
  'mem:hero:3': {
    lines: [
      N('秋天的獵場。他蹲在草裡，把細繩繞成活結，繫在兩棵樹之間。'),
      N('「不用殺牠。」老獵人說，「讓牠慢下來、站不穩，剩下的交給同伴。」'),
      { who: 'hero', mood: 'distant', text: '「絆住，不是為了殺。……手還記得。」' },
      { who: 'hero', mood: 'sad', text: '「劍、繩結……都有人教過我。那些人，我一個也想不起來。」' },
    ],
    summary: '洛恩想起老獵人教他設陷阱：不用殺，讓牠慢下來就好。',
  },
  'mem:hero:4': {
    lines: [
      N('風沙裡，一輛馬車翻倒在路邊。他舉著一面裂開的盾，擋在車輪前。'),
      N('身後有人在哭。盾一次次被撞歪，他一次次把它推回來。'),
      { who: 'hero', mood: 'distant', text: '「我擋過。擋在誰前面……想不起來。」' },
      N('那些人身上的衣服，洛恩在鎮上從來沒見過，像是很久以前的樣式。'),
    ],
    summary: '洛恩想起自己在風沙裡舉盾，護著一輛翻倒的馬車。那些人的衣服，是很舊的樣式。',
  },
  'mem:hero:5': {
    lines: [
      N('那年秋天，他走出迷宮時，遠方的鐘正好響完最後一聲。他回過頭，什麼也沒看見。'),
      N('幾天後的夜裡，巷子裡背後一涼。他倒進暮霧裡，耳邊又響起那口鐘。'),
      { who: 'hero', mood: 'sad', text: '「……我死過。在那條巷子裡。」' },
      N('凜的手按住了領口的小銅鐘，按得很緊，像是怕它響。'),
    ],
    summary: '洛恩想起遠方響過一次鐘。幾天後的夜裡，他死在巷子裡。',
  },
  'mem:hero:6': {
    lines: [
      N('石塔頂上，有人指著夜空，一顆一顆念星星的名字。他跟著念，念錯了就重來。'),
      N('「火、冰、雷，都在星星裡。」那人說，「叫得出名字，它們就會回應你。」'),
      { who: 'hero', mood: 'serious', text: '「那座塔，鎮上沒有。那片天上的星星，位置也不對。」' },
      { who: 'hero', mood: 'distant', text: '「教我劍、盾、繩結和星星的人……也許，不是同一輩子遇見的。」' },
    ],
    summary: '洛恩想起在石塔上學星星的名字。那片星空的位置不對，像是另一輩子的事。',
  },
  'mem:hero:7': {
    lines: [
      N('遠方的鐘又響過一次。一季還沒過完，市集的人群裡，他看見了拿刀的人。'),
      N('然後是黑暗。他在很深很深的地方醒來，什麼都不記得，只看得見頭頂一點光。'),
      { who: 'hero', mood: 'sad', text: '「死了，就在最底下醒來，再走上來一次。……這條路，我走過不只一次。」' },
      { who: 'hero', mood: 'serious', text: '「拿刀的那個人，手在發抖。……他們在怕什麼？」' },
    ],
    summary: '洛恩又想起一次死亡，和死後在最深處醒來、再往上走的路。拿刀的人，手在發抖。',
  },
  'mem:hero:8': {
    lines: [
      N('荒地上圍著一圈帳篷。從迷宮裡抬出來的人躺了一地，什麼都不記得。'),
      N('他跪在他們中間，雙手捧著一點光，照著有人教過的樣子，一個一個祈禱。'),
      { who: 'hero', mood: 'distant', text: '「那一圈帳篷……是露米亞最早的樣子。」' },
      { who: 'hero', mood: 'smile', text: '「那時候我也什麼都不記得。照顧人的方法，手卻記得。」' },
    ],
    summary: '洛恩想起露米亞還只是一圈帳篷的時候，他捧著光，照顧失憶的人。',
  },
  // Piece 9 may play before Rin's reveal (d25 against her d22): her one line knows which.
  'mem:hero:9': {
    lines: [
      N('最深處，一盞大得看不見頂的燈。燈芯的光，細得像一根快斷的線。'),
      N('他走到燈前，閉上眼睛。記得的每一張臉、每一句話，一段段化成光，沿著燈芯往上爬。'),
      N('燈亮了，他睡在光裡。很多年以後，燈芯燒完，迷宮把他吐了出來。'),
      N('他什麼都不記得，朝頭頂的光往上走，倒在迷宮的入口。有人替他登記，替他取名字。'),
      N('有幾次，他在鎮上住了下來，交了朋友，學了本事。然後底下有什麼在拉他，他就走回深處。'),
      N('也有幾次，遠方的鐘響了。他在鎮上還住不滿一季，靜鐘會的刀就到了背後。'),
      N('死了的那幾次，他在最底下的黑暗裡躺了幾十年。醒來時手裡只有那把劍，再從頭往上走。'),
      { who: 'hero', mood: 'sad', text: '「……想起來了。我是守燈人。」' },
      { who: 'hero', mood: 'serious', text: '「我在上面活過的日子，就是下一次的燈芯。」' },
      { who: 'narrator', text: '凜站在光照不到的地方，手緊緊按著領口的小銅鐘。', if: { oath: false } },
      { who: 'narrator', text: '凜走到他身邊，什麼也沒說，只是抓住了他的袖口。', if: { oath: true } },
      { who: 'hero', mood: 'resolve', text: '「被殺了那麼多次，還是一直往上走。……原來我一直，想回來。」' },
    ],
    summary: '洛恩想起了一切：他是守燈人。點燈、被吐回地面、被靜鐘會殺死，一輪又一輪。',
  },
  // Piece 10 plays at the bottom, after the depth-30 boss and before the finale (which always follows Rin's choice, U3).
  'mem:hero:10': {
    lines: [
      N('很久以前的艾斯特拉。戰爭結束了，廣場上排著長長的隊，人們把悲傷倒進燈裡。'),
      N('只有他沒有排隊。死去的人，他一張臉也不想忘。'),
      N('燈變了顏色，地底長出了迷宮。城裡的工匠把一把刻滿文字的劍，放進他手裡。'),
      N('「這是燈鑰。往下的路上有獸，所以做成了劍。」工匠說，「插進燈座，燈就認得你。」'),
      N('送他到階梯口的人說：「城裡只剩你還記得。……要回來。」'),
      N('他說會回來。然後他往下走，走了很久很久。'),
      N('星燈之底。燈喰之母倒下了，牠身後那盞燈，只剩一點快熄的藍。'),
      N('洛恩手上的劍，紋路一條一條亮了起來，和燈座上刻的一模一樣。'),
      { who: 'hero', mood: 'resolve', text: '「這把劍，是燈鑰。……我一直帶著它，走回來。」' },
      { who: 'hero', mood: 'distant', text: '「第一次，是我自己選的。那時候，只剩我還記得。」' },
      { who: 'hero', mood: 'resolve', text: '「我知道該怎麼做。每一次，都是一個人做的。」' },
      N('他握緊劍，朝燈走去。身後的腳步聲，沒有停。'),
    ],
    summary: '洛恩想起第一輪：艾斯特拉的人都想忘，只有他記得，所以自願下去。他的劍，就是燈鑰。',
  },
  // Task 6: Lorne's chats. 2–4 wait for act 2, 3 and 4 (CHAT_GATE); the last one knows whether Rin has chosen.
  'chat:hero:1': {
    lines: [
      { who: 'glen', text: '「小子。下去之前，先看一眼那道光。迷路了，就朝它走。」' },
      { who: 'hero', mood: 'normal', text: '「知道。醒來的時候，第一個看見的就是它。第二個，是你的鼻孔。」' },
      { who: 'glen', text: '「少耍嘴皮。……這話，怎麼聽著耳熟。錯覺吧。去吧，別逞強。」' },
    ],
    summary: '葛倫要洛恩迷路時朝星燈走。洛恩說，他醒來第一個看見的就是它。',
  },
  'chat:hero:2': {
    lines: [
      N('深夜的月影旅館。凜坐在窗邊，一直看著傳送門的方向，眼睛一下也沒眨。'),
      { who: 'hero', text: '「睡不著？」' },
      { who: 'rin', mood: 'serious', text: '「看門。總覺得，有什麼會從那裡走出來。還有。你翻身，太吵。」' },
    ],
    summary: '深夜，凜坐在旅館窗邊盯著傳送門。她說，總覺得有什麼會從那裡走出來。',
  },
  'chat:hero:3': {
    lines: [
      { who: 'marta', text: '「洛恩，今天的事說給我聽。我記下來。」' },
      { who: 'hero', mood: 'smile', text: '「回來了。就這樣。」' },
      { who: 'marta', text: '「傻孩子，那是最要緊的一句，我寫在最上面。下面再補一行：晚飯又剩了半碗。」' },
    ],
    summary: '瑪莎要把洛恩的一天寫進日記。他只說「回來了」，她把這句寫在最上面。',
  },
  'chat:hero:4': {
    lines: [
      { who: 'hero', mood: 'serious', text: '「凜。碑上那個人，每一次都是一個人走下去的。」' },
      { who: 'rin', mood: 'averted', text: '「……為什麼跟我說這個。」', if: { oath: false } },
      { who: 'narrator', text: '她轉身上樓，走到一半停了一下，沒有回頭。', if: { oath: false } },
      { who: 'rin', mood: 'serious', text: '「這一次，不是一個人。你下去的地方，我也去。我們一起回來。」', if: { oath: true } },
      { who: 'rin', mood: 'smile', text: '「何況，洛恩。你一個人，連繃帶都纏不好。」', if: { oath: true } },
    ],
    summary: '洛恩對凜說，碑上的那個人，每一次都是一個人走下去的。',
  },
  // Task 7: Rin's choice (spec §5.2), the darkest scene. It plays alone at night, after her 7th piece and before the finale (U3).
  // It may come before or after the hero's 9th piece, so it does not say he is the lamp keeper (lore ledger I-50).
  'rin-reveal': {
    lines: [
      N('深夜的月影旅館。窗外星燈的光很淡，淡得只照得到床邊那一截刀刃。'),
      N('洛恩睡著了。凜站在床邊，短刃出鞘，刀尖落在他的喉嚨上。'),
      N('她數著他的呼吸。一下，又一下。'),
      N('每數一下，就有一個一起回城的夜晚浮上來：瑪莎的熱湯、旅館的燈、走在她前面的那個背影。'),
      N('她沒有眨眼。先抖起來的，是刀尖。'),
      N('她收起短刃，靠著床腳坐下，一直坐到窗外發白。'),
      N('洛恩醒來時，桌上放著一枚裂開的小銅鐘。凜坐在桌邊，直直看著他的眼睛。'),
      N('她把一切都說了：鐘樓、名單、吐霧的石門、響了三天的鐘，還有出口前那一刀。'),
      { who: 'rin', mood: 'serious', text: '「洛恩。我被派來殺你。我現在選擇不要。」' },
      N('洛恩看著那枚鐘，看了很久。他沒有問為什麼，像是早就知道它會被放在那裡。'),
      { who: 'hero', mood: 'smile', text: '「明天也一起回來吧。」' },
      { who: 'rin', mood: 'smile', text: '「『凜』是他們給的代號。……可是，這個名字是我自己決定要用的。」' },
    ],
    summary: '深夜，凜的刀尖停在洛恩的喉嚨上，最後收了回去。天亮後她說出一切，選擇不殺他。洛恩只說：明天也一起回來吧。',
  },
  // Continuity fix 4 (spec §5.2, §3.6; lore ledger I-119): the arrival after her choice. The society struck its bell and her
  // flattened one did not answer: that is how they know. He is afraid, not cruel; the finale's truths stay the finale's.
  // Rin's `guarded` belongs here after her oath (style bible §3: it is kept for the bellkeeper).
  'bellkeeper-arrives': {
    lines: [
      N('幾天後的清晨，傳送門廣場。一位穿長袍的老人站在門前，雙手捧著一口小小的鐘。'),
      { who: 'bellkeeper', text: '「吾等敲了三回鐘。那孩子領口的鐘，一回也沒有應。」' },
      { who: 'rin', mood: 'guarded', text: '「……那枚鐘，我敲平了。洛恩，站到我後面。」' },
      { who: 'bellkeeper', text: '「鐘不應，吾等便知道了。……所以，我來了。」' },
      N('老人捧著鐘的手在發抖。他看的不是凜，是站在她身後的洛恩。'),
      { who: 'bellkeeper', text: '「從深處走出來的人。我不動手。……我只是，想看清楚你。」' },
    ],
    summary: '靜鐘會敲了三回鐘，凜領口那枚敲平的鐘沒有回應。鐘守來到鎮上，說他不動手，只想看清楚從深處走出來的人。',
  },
  // Task 7: Rin's chats. 2 waits for act 2, 3 for act 3 (she looks away only from her 4th piece), 4 for her choice.
  // 2 and 3 can be delayed past her choice (one chat per return): each reading has its own lines.
  'chat:rin:1': {
    lines: [
      { who: 'rin', mood: 'normal', text: '「喂。手腕上的印子退了。那時候，你為什麼抓著不放？」' },
      { who: 'hero', mood: 'smile', text: '「記不得了。我的手，好像比我還固執。」' },
      N('「下次不用。會痛。還有，指甲剪一剪。」凜說完就上樓了。走到樓梯轉角，她回頭看了他一眼。'),
    ],
    summary: '凜手腕上的指痕退了。她問洛恩那時候為什麼不放手，他說記不得，他的手比他還固執。',
  },
  'chat:rin:2': {
    lines: [
      N('旅館的後院。凜坐在井邊，一隻手一直按在領口那枚小銅鐘上。', false),
      N('旅館的後院。凜坐在井邊，手指碰了碰領口，又放了下來。', true),
      { who: 'hero', text: '「怎麼了？」' },
      { who: 'rin', mood: 'guarded', text: '「……沒什麼。只是，不想聽見它響。」', if: { oath: false } },
      { who: 'rin', mood: 'smile', text: '「手自己摸過去的，跟你那隻固執的手一樣。放心，那裡的鐘不會再響了。」', if: { oath: true } },
    ],
    summary: '凜坐在旅館後院的井邊，手按著領口。洛恩問她怎麼了。',
  },
  'chat:rin:3': {
    lines: [
      N('凜在擦短刃。洛恩在她對面坐下，她的視線便落回刀刃上，再也沒有抬起來。', false),
      { who: 'rin', mood: 'averted', text: '「喂。你是人？」', if: { oath: false } },
      { who: 'hero', mood: 'smile', text: '「我想是。會餓，會累，回來會想睡。睡著了還會被嫌吵。」', if: { oath: false } },
      N('凜在擦短刃。洛恩在她對面坐下，她停下手，抬起頭看著他。', true),
      { who: 'rin', mood: 'blush', text: '「以前，我不敢看你的眼睛。現在，想多看一點。」', if: { oath: true } },
      N('洛恩沒有說話，也沒有移開視線。最後先眨眼的，是凜。', true),
    ],
    summary: '洛恩在擦短刃的凜對面坐下。她說了一句話，眼神說得更多。',
  },
  'chat:rin:4': {
    lines: [
      { who: 'rin', mood: 'serious', text: '「洛恩。那枚銅鐘，扣上的時候還是好的。從霧裡出來，就裂了。」' },
      { who: 'rin', text: '「我想，是你抓住我手腕的那一下。……所以，我把它敲平了。」' },
      { who: 'rin', mood: 'smile', text: '「再也不會有鐘聲，叫我去殺誰。我們明天，也一起回來。還有，指甲剪了沒？」' },
    ],
    summary: '凜說，銅鐘是在霧裡裂的，在洛恩抓住她手腕的那一下。她把它敲平了，再也不會響。',
  },
  // Task 8: Selene (spec §6, §11.1). She fears that a spoken prophecy walks itself into being. Pieces 2 and 4 are the full
  // moon's bright ending, piece 5 the new moon's dark one; in it she knows the people by the lamp, and says 「我想看見」.
  // A companion's piece can drop in her own region before the main road reaches its act: no act content (lore ledger I-58).
  'mem:selene:1': {
    lines: [
      N('山丘上的石屋。銀盆裡盛著水，水面映著月亮。村裡的人排著隊，來問明天的事。'),
      N('她說那座橋會塌。從那天起，沒有人走那座橋，也沒有人去修。入秋的第一場雨，橋塌了。'),
      { who: 'selene', mood: 'sad', text: '「是我說了，它才塌的嗎？……這個答案，我一直不敢知道。」' },
      N('洛恩沒有說話，只是把提燈往她那邊挪近了一點。'),
    ],
    summary: '瑟蕾想起自己是讀月相的占星師。她說橋會塌，橋就塌了。她開始害怕自己說出口的預言。',
  },
  'mem:selene:2': {
    lines: [
      N('滿月的夜。銀盆裡的水自己亮了起來，映出一道從地底往上走的背影。'),
      N('很多人在喊同一個名字。那個從深處走出來的人走過的地方，一盞很大的燈重新亮了。'),
      { who: 'selene', mood: 'foresee', text: '「那是滿月給我看的結局。……很亮，也很暖呢。」' },
      { who: 'selene', mood: 'wistful', text: '「那個人的臉，我沒有看清楚。也許，是我不敢看吧。」' },
    ],
    summary: '滿月的夜，瑟蕾在水盆裡看見一個光明的結局：從深處走出來的人被很多人記住，燈重新亮了。',
  },
  'mem:selene:3': {
    lines: [
      N('迷宮的入口，暮霧從門縫裡吐出來。她捧著銀盆，在霧前跪下。'),
      N('她把盆裡的水倒進霧裡：「看見的，我不要了。未來，就讓它自己走過來吧。」'),
      { who: 'hero', text: '「是妳自己交出去的？」' },
      { who: 'selene', mood: 'sad', text: '「……兩種結局，我都看見了。我怕一開口，就替所有人選了其中一個。」' },
    ],
    summary: '瑟蕾想起，她看見的結局不是被迷宮奪走的，是她自己交出去的。她怕自己的話替所有人選了未來。',
  },
  'mem:selene:4': {
    lines: [
      N('又是滿月。這一次，銀盆裡那道背影的旁邊，站著好幾個人。'),
      N('他們一起提著燈往下走，又一起走了回來。她只看見手和衣角，看不見臉。'),
      { who: 'selene', mood: 'foresee', text: '「那個人，不是一個人走到燈前的。」' },
      { who: 'selene', mood: 'wistful', text: '「……洛恩先生。我差一點，就看清楚他們的臉了。」' },
    ],
    summary: '又一個滿月的結局：從深處走出來的人身邊，站著好幾個一起提燈的人。他們的臉，瑟蕾還沒看清。',
  },
  'mem:selene:5': {
    lines: [
      N('新月的夜，銀盆裡沒有月亮。燈熄了，暮霧一層一層漫上來，吞掉了每一個人。'),
      N('她曾把它和滿月的結局，一起倒進了霧裡。如今，滿月裡那些人的臉，一張一張清楚了。'),
      { who: 'selene', mood: 'surprised', text: '「站在燈旁邊的那群人……是你們。」' },
      { who: 'selene', mood: 'smile', text: '「洛恩。我不怕了。……我想看見，我們走到那一天。」' },
    ],
    summary: '新月的結局是燈熄、所有人被暮霧吞沒。瑟蕾也認出了光明結局裡的那群人，就是這支隊伍。她說：我想看見。',
  },
  'chat:selene:1': {
    lines: [
      N('深夜，月影旅館的屋頂。瑟蕾抱著膝蓋坐著，抬頭看著月亮。'),
      { who: 'hero', text: '「看得見明天嗎？」' },
      { who: 'selene', mood: 'wistful', text: '「一點點呢。……可是話一說出口，就會自己長出腳來。所以，我只說月亮的事。」' },
    ],
    summary: '瑟蕾在旅館的屋頂看月亮。洛恩問她看不看得見明天，她說只說月亮的事。',
  },
  'chat:selene:2': {
    lines: [
      // Her last piece can come before this chat (one chat per return): after it she calls him 「洛恩」 (I-22, I-58).
      { who: 'selene', mood: 'foresee', text: '「洛恩先生。如果我能替您讀一件未來的事，您想知道什麼？」', if: { notFull: 'selene' } },
      { who: 'selene', mood: 'foresee', text: '「洛恩。如果我能替你讀一件未來的事，你想知道什麼？」', if: { full: 'selene' } },
      { who: 'hero', text: '「明天，大家有沒有都回來。」' },
      { who: 'selene', mood: 'smile', text: '「那一件，不用讀月亮也知道呢。……您每一次，都把大家帶回來了。」', if: { notFull: 'selene' } },
      { who: 'selene', mood: 'smile', text: '「那一件，不用讀月亮也知道呢。……你每一次，都把大家帶回來了。」', if: { full: 'selene' } },
    ],
    summary: '瑟蕾問洛恩想知道什麼未來。他只想知道明天大家有沒有都回來。',
  },
  // Task 8: Chizuru (spec §6, §11.2). She thinks she left days ago; the pieces show the ice kept her for decades and the
  // shrine is gone. Her last piece is the bell the last priest tied to her spear; she will build a small shrine by the town.
  'mem:chizuru:1': {
    lines: [
      N('山腰的神社，石階兩旁積著雪。神主替她繫好袖帶，把長槍交到她手上。'),
      N('「去封住迷宮的裂口吧。」神主說，「春祭之前，回來。」'),
      { who: 'chizuru', mood: 'solemn', text: '「是。……不過是幾日前的事，記得這般清楚。」' },
      { who: 'chizuru', mood: 'smile', text: '「洛恩大人，春祭時請務必來看。神社的石階，有九十九級呢。」' },
    ],
    summary: '千鶴想起神主送她出發：去封住迷宮的裂口，春祭之前回來。她以為那只是幾天前的事。',
  },
  'mem:chizuru:2': {
    lines: [
      N('迷宮深處，寒氣從石縫裡湧出來。她把槍插進冰面，閉上眼睛，念起封印的祝詞。'),
      N('冰順著槍柄往上爬，爬上她的手、她的袖子。祝詞念到最後一句，她的呼吸也結成了霜。'),
      { who: 'chizuru', mood: 'sad', text: '「封印……沒有念完。最後一句，凍在嘴裡了。」' },
      { who: 'chizuru', mood: 'serious', text: '「無妨。既然醒了，再念一次便是。」' },
    ],
    summary: '千鶴想起封印的儀式。祝詞念到最後一句，她和槍一起被凍進了冰裡。',
  },
  'mem:chizuru:3': {
    lines: [
      N('從冰裡看出去，世界像隔著一層水。有人提著燈從冰前走過，又有人走過。'),
      N('起初是草鞋與皮甲，後來是她沒見過的長靴與鐵扣。走過的人，衣裳換了好幾回樣式。'),
      { who: 'chizuru', mood: 'bewildered', text: '「……幾日之間，換不了這麼多回衣裳。」' },
      { who: 'chizuru', mood: 'sad', text: '「洛恩大人。我在冰裡，究竟待了多久？」' },
    ],
    summary: '千鶴想起冰外走過的冒險者，衣裳換了好幾回樣式。她在冰裡待的，不只幾天。',
  },
  'mem:chizuru:4': {
    lines: [
      N('出發的前一夜。神社的院子裡沒有別人，只有神主在掃石階上的雪，一下，又一下。'),
      N('「參拜的人，一年比一年少了。」神主說，「我之後，這裡就沒有人了。」'),
      { who: 'chizuru', mood: 'sad', text: '「神主大人那時，已經很老了。那是幾十年前的事。」' },
      { who: 'chizuru', mood: 'sad', text: '「……神社，已經不在了吧。」' },
    ],
    summary: '神主是神社最後的守護者。千鶴明白，自己在冰裡待了幾十年，神社早就不在了。',
  },
  'mem:chizuru:5': {
    lines: [
      N('出發的清晨。神主解下拜殿前的鈴，繫在她的槍穗上。'),
      N('「帶著吧。」神主說，「回不來也無妨。在你守著的地方掛上它，那裡就是神社。」'),
      { who: 'chizuru', mood: 'solemn', text: '「神主大人，早就知道我可能回不去了。」' },
      { who: 'chizuru', mood: 'smile', text: '「洛恩大人，回城之後，我想在鎮邊蓋一座小祠。為了此處的人，掛上這枚鈴。」' },
    ],
    summary: '槍穗上的鈴，是神主託付給千鶴的。她決定在露米亞的鎮邊蓋一座小祠，為了現在的人。',
  },
  'chat:chizuru:1': {
    lines: [
      // Read right before and after any of her pieces: the words she wrote stay true (I-58).
      { who: 'chizuru', mood: 'bewildered', text: '「洛恩大人，公會要我寫下『記得的最後一句話』。此處的規矩，甚是奇特。」' },
      { who: 'hero', text: '「妳寫了什麼？」' },
      { who: 'chizuru', mood: 'solemn', text: '「『春祭之前，回來。』……是送我出門的人說的。」' },
    ],
    summary: '千鶴在公會的登記表上，寫下送她出門的人說的話：春祭之前，回來。',
  },
  'chat:chizuru:2': {
    lines: [
      N('清晨的鎮邊。千鶴搖了搖槍穗上的小鈴，閉上眼睛，等它響完。'),
      { who: 'hero', text: '「那個鈴，是神社的？」' },
      { who: 'chizuru', mood: 'solemn', text: '「不記得是何時繫上的。只是每日聽它響一回，心便定了。」', if: { notFull: 'chizuru' } },
      { who: 'chizuru', mood: 'solemn', text: '「是神主大人託付的鈴。……每日聽它響一回，心便定了。」', if: { full: 'chizuru' } },
    ],
    summary: '千鶴每天清晨搖一次槍穗上的鈴，聽它響完，心就定了。',
  },
  // Task 8: Safira (spec §6, §11.2). One member of her troupe in each piece, the leader last: 「你要繼續跳。」
  'mem:safira:1': {
    lines: [
      N('沙丘上的營火。鼓手敲著皮鼓，她赤著腳，在火光裡轉圈。'),
      N('「慢了半拍！」鼓手笑著喊，「跟上我的鼓，別讓鼓跟著你跑！」'),
      { who: 'safira', mood: 'laugh', text: '「哈哈，那個大鬍子，打起鼓來比誰都兇。是我們舞團的鼓手啦。」' },
      { who: 'safira', mood: 'sad', text: '「……可是，鼓聲是哪一天停的，我想不起來。」' },
    ],
    summary: '莎菲拉想起舞團的鼓手，和營火邊跟不上的那半拍。鼓聲是哪一天停的，她想不起來。',
  },
  'mem:safira:2': {
    lines: [
      N('乾掉的河床。吹笛的少年跟在她後面，笛聲斷斷續續。水袋已經空了兩天。'),
      N('她先看見了。地平線上浮著一座城，屋頂閃閃發亮。她喊著「那裡有城」，第一個跑了過去。'),
      { who: 'safira', mood: 'sad', text: '「笛子是我教他吹的。他什麼都學我，連往哪裡跑，也學我。」' },
      { who: 'safira', mood: 'sad', text: '「……小洛。是我先看見那座城的。」' },
    ],
    summary: '沙漠裡，莎菲拉第一個看見蜃樓裡的城，第一個跑了過去。吹笛的少年跟在她後面。',
  },
  'mem:safira:3': {
    lines: [
      N('帳篷裡熱得像爐子。縫衣裳的大姊替她的舞衣縫上最後一排銅片，針扎了手也不吭聲。'),
      N('大姊把自己那一口水推給她：「跳舞的人，喉嚨不能乾。我只要拿得動針就好。」'),
      { who: 'safira', mood: 'sad', text: '「這件舞衣，就是我身上這件。……銅片，一片都沒掉。」' },
      { who: 'safira', mood: 'smile', text: '「很好看吧？大姊的手藝，可是全舞團第一喔。」' },
    ],
    summary: '莎菲拉身上的舞衣，是縫衣裳的大姊縫的。大姊把最後一口水讓給了她。',
  },
  'mem:safira:4': {
    lines: [
      N('她發著燒，躺在搖晃的駱駝背上。牽駱駝的老人走在前面，和團長低聲說話。'),
      N('「那座城是假的。」老人說，「可身後的沙暴是真的。進去，也許還有一條路。」'),
      N('團長沉默了很久，最後只說了一句：「走吧。」'),
      { who: 'safira', mood: 'surprised', text: '「……做決定的，不是我？」' },
    ],
    summary: '發燒的莎菲拉在駱駝背上，聽見牽駱駝的老人和團長商量。走進蜃樓，是團長決定的。',
  },
  'mem:safira:5': {
    lines: [
      N('蜃樓裡的城燒了起來，火順著沙丘一路燒開。團長抓住她的手臂，把她推向那道快要合上的光。'),
      N('「進來是我選的，不是你的錯。」團長說，「你要繼續跳。」'),
      { who: 'safira', mood: 'sad', text: '「……這片火海，原來就是那片沙漠啊。團長那一推，害我一路跳到了這裡。」' },
      { who: 'safira', mood: 'smile', text: '「小洛，回城之後來廣場看囉。舞團最後的那支舞，我替大家跳完。」' },
    ],
    summary: '團長在最後一刻把莎菲拉推出了蜃樓：你要繼續跳。她要在露米亞的廣場，跳完舞團最後的那支舞。',
  },
  'chat:safira:1': {
    lines: [
      N('夜裡的傳送門廣場。莎菲拉一個人踩著拍子轉圈，腳踝上的銅環叮叮作響。'),
      { who: 'hero', text: '「不累嗎？」' },
      { who: 'safira', mood: 'wink', text: '「累？跳舞的人不說這個字啦。……倒是小洛，你的腳尖剛剛在跟著打拍子喔。」' },
    ],
    summary: '莎菲拉夜裡在廣場一個人跳舞。洛恩問她累不累，反被她抓到腳尖在打拍子。',
  },
  'chat:safira:2': {
    lines: [
      { who: 'safira', mood: 'wink', text: '「凜，妳的腳步這麼輕，天生是跳舞的料喔。來，跟上拍子囉！」' },
      { who: 'rin', text: '「……不要。」' },   // ungated: may play after her oath, where guarded is the bellkeeper's
      { who: 'safira', mood: 'laugh', text: '「哈哈，被拒絕了！那小洛，換你囉。……欸，別跑啊！」' },
    ],
    summary: '莎菲拉想教凜跳舞，被一口回絕。她轉頭找洛恩，洛恩跑了。',
  },
  // Task 9: Sylvie (spec §6, §11.2). The mire is her forest rotted. She led its people out, one family at a time, and turned
  // back last; she never says so herself until her last piece (style bible). Her last piece is the seed she has held since.
  'mem:sylvie:1': {
    lines: [
      N('綠得發亮的林子。她在樹皮上刻下小小的箭頭，一棵接一棵，指向林外的路。'),
      N('「迷了路，就跟著箭頭走。」她對林子裡的孩子說，「走到底，就出得去。」'),
      { who: 'sylvie', mood: 'sad', text: '「這箭頭，是我刻的。……這片沼澤，以前是我守的林子。」' },
      N('她蹲在一截爛掉的樹幹前，用指尖把箭頭上的泥，一點一點擦乾淨。'),
    ],
    summary: '希爾薇在沼澤的枯木上，認出自己刻的箭頭。腐毒沼澤，以前是她守的林子。',
  },
  'mem:sylvie:2': {
    lines: [
      N('那一年，霧從林子深處漫了出來。樹從根開始發灰，一棵接著一棵。'),
      N('她拉滿了弓，卻不知道該對著什麼射。霧，是射不死的。'),
      { who: 'sylvie', mood: 'sad', text: '「我沒守住。……林子死了，我還活著。」' },
      { who: 'hero', text: '「霧，不是一個人擋得住的。」' },
    ],
    summary: '暮霧吞掉了希爾薇的林子。她覺得是自己沒守住，不該一個人活下來。',
  },
  'mem:sylvie:3': {
    lines: [
      N('霧裡，她牽著一個抱著嬰兒的女人，踩著樹上的箭頭，一棵一棵往外走。'),
      N('林子邊上透進了光。她把那一家人推出去，自己轉身，又鑽回霧裡。'),
      { who: 'sylvie', mood: 'serious', text: '「才一家。……林子裡的人，不只這些。」' },
      N('她說完就站了起來，背好弓，往沼澤更深的地方看。'),
    ],
    summary: '霧裡，希爾薇把一家人帶到林外，又轉身回去。她說，才一家而已。',
  },
  'mem:sylvie:4': {
    lines: [
      N('一趟，又一趟。砍柴的、採藥的、迷路的獵人，一個一個跟著箭頭走出了霧。'),
      N('最後一趟出來，林外的人點著火把，數了又數：「都出來了。一個也沒少。」'),
      { who: 'hero', text: '「妳把他們，全都帶出去了。」' },
      { who: 'sylvie', mood: 'sad', text: '「……那又怎樣。林子，我還是沒守住。」' },
    ],
    summary: '希爾薇一趟又一趟，把林子裡的人全部帶了出去。她還是覺得，自己沒守住林子。',
  },
  'mem:sylvie:5': {
    lines: [
      N('人都出來了，她才回頭，走進正在倒下的林子。'),
      N('最老的那棵樹，落下了最後一顆種子。她把它握進手心，霧就漫了上來。'),
      { who: 'sylvie', mood: 'sad', text: '「這顆種子，我一直握著。……人，我都帶出去了。它，也帶出來了。」' },
      { who: 'sylvie', mood: 'smile', text: '「洛恩。回城以後，找一塊空地。……林子，還能再長。」' },
    ],
    summary: '人都出來之後，希爾薇才回頭，帶出了林子最後一顆種子。她要把它種在露米亞的空地上。',
  },
  'chat:sylvie:1': {
    lines: [
      // Read right before and after any of her pieces: the quiver is from her meeting, not from a memory (I-58).
      N('天還沒亮，傳送門廣場的石階上。希爾薇在削箭桿，腳邊的箭筒插得滿滿的。'),
      { who: 'hero', text: '「這麼多？」' },
      { who: 'sylvie', mood: 'serious', text: '「箭筒要滿。……只剩一支的時候，什麼都護不住。」' },
    ],
    summary: '天亮前，希爾薇在廣場削箭。她說箭筒要滿，只剩一支的時候，什麼都護不住。',
  },
  'chat:sylvie:2': {
    lines: [
      // Until her last piece she thinks she has no right to the bed; after it, her seed has sprouted in the clearing (I-58, I-66).
      // The sprouting itself is `home:sylvie`'s (continuity fix 2): here she has seen it, and takes the bed.
      { who: 'narrator', text: '深夜的月影旅館。希爾薇的床鋪得整整齊齊，她卻抱著弓，靠在窗邊的牆上。', if: { notFull: 'sylvie' } },
      { who: 'narrator', text: '深夜的月影旅館。希爾薇抱著弓靠在窗邊，又看了一眼樓下空地上的新芽。', if: { full: 'sylvie' } },
      { who: 'hero', text: '「不睡？」' },
      { who: 'sylvie', mood: 'sad', text: '「床，留給該睡的人。……我在這裡就好。」', if: { notFull: 'sylvie' } },
      { who: 'sylvie', mood: 'smile', text: '「……看過了。今晚，去睡床。」', if: { full: 'sylvie' } },
    ],
    summary: '深夜，希爾薇抱著弓，靠在旅館的窗邊。洛恩問她不睡嗎。',
  },
  // Task 9: Noel (spec §6, §7.5). She stole her teacher's book; its star fire burns the caster's own memory; the teacher
  // forbade it to protect her. Her last piece holds the teacher's memory too: she gives it back at the merchant's stall.
  'mem:noel:1': {
    lines: [
      N('深夜的書房。老師上了鎖的書櫃，被一根髮夾撬開了。'),
      N('她抱出一本封面嵌著星星的書。翻開來，紙上的字像火一樣在跳。'),
      { who: 'noel', mood: 'smug', text: '「哼，老師最寶貝的書，本小姐一眼就挑中了。」' },
      { who: 'noel', mood: 'pout', text: '「……幹嘛那樣看我。是借的啦，只是沒說一聲。」' },
    ],
    summary: '諾艾兒想起自己撬開老師的書櫃，抱走了一本封面嵌著星星的魔法書。',
  },
  'mem:noel:2': {
    lines: [
      N('老師一把闔上那本書，壓住了她的手：「這一頁，不准念。」'),
      N('她甩開那隻手，抱著書跑出門，一路跑進了迷宮。'),
      { who: 'noel', mood: 'pout', text: '「小氣鬼。……老師一定是怕本小姐太厲害。」' },
      { who: 'noel', mood: 'sad', text: '「……可是那時候，老師的手好冰。」' },
    ],
    summary: '老師不准諾艾兒念書裡的一頁。她甩開老師的手，抱著書逃進了迷宮。',
  },
  'mem:noel:3': {
    lines: [
      N('迷宮裡，怪物撲了上來。她念出那一頁，掌心開出一朵藍白色的星火。'),
      N('她低頭看著自己的手。剛才是從哪裡跑進來的，她想不起來了。'),
      { who: 'noel', mood: 'panic', text: '「……不是迷宮偷走的。是我自己，用那一頁燒掉的。」' },
      { who: 'hero', mood: 'serious', text: '「那一頁，別再念了。」' },
    ],
    summary: '書裡的星火，每用一次就燒掉施法者的一段記憶。諾艾兒的失憶，是她自己燒掉的。',
  },
  'mem:noel:4': {
    lines: [
      N('出走的前一夜，她從門縫看見書房的燈還亮著。老師在那本書的空白處寫字。'),
      N('「此術以記憶為薪。」老師低聲說，「那孩子要是學了，會連自己是誰都燒掉。」'),
      { who: 'noel', mood: 'sad', text: '「老師不教我，不是小氣……是怕我把自己燒光。」' },
      { who: 'noel', mood: 'panic', text: '「我、我才沒有哭。是這裡的雨太大了。」' },
    ],
    summary: '老師不讓諾艾兒念那一頁，是怕她把自己燒光。老師一直在保護她。',
  },
  'mem:noel:5': {
    lines: [
      N('迷宮的入口。有人提著燈，一遍又一遍喊著她的名字，走進了暮霧。'),
      N('岔路口亮著一盞攤燈。諾艾兒把碎片裡的另一段光，放進流浪商人的掌心。'),
      { who: 'merchant', text: '「……諾艾兒。啊，我想起來了。比起那本書，妳平安，就夠了。」' },
      { who: 'noel', mood: 'smile', text: '「……老師。對不起。我回來了。」' },
    ],
    summary: '老師為了找諾艾兒也走進迷宮，成了失憶的流浪商人。她把老師的記憶還給他，師徒在攤前重逢。',
  },
  'chat:noel:1': {
    lines: [
      N('深夜的月影旅館。諾艾兒用指尖點起一朵小小的電光，照著攤開的筆記本。'),
      { who: 'hero', text: '「在寫什麼？」' },
      { who: 'noel', mood: 'panic', text: '「我、我的咒語筆記啦。不准看！……裡面才沒有錯字。」' },
    ],
    summary: '深夜，諾艾兒點著小小的電光寫咒語筆記。洛恩一問，她就慌了，說不准看。',
  },
  'chat:noel:2': {
    lines: [
      // Until her last piece she calls him 「喂，歸來者」; after it, 「洛恩」, and she blushes first (style bible, I-25).
      N('傳送門廣場。諾艾兒搶先一步，擋在洛恩前面。'),
      { who: 'noel', mood: 'smug', text: '「喂，歸來者。下一層的怪，全交給本小姐的雷。你們站後面就好。」', if: { notFull: 'noel' } },
      { who: 'noel', mood: 'blush', text: '「洛、洛恩。下一層……我的雷，借你們用。不准笑。」', if: { full: 'noel' } },
      { who: 'hero', text: '「好。一起回來。」' },
    ],
    summary: '出發前，諾艾兒搶先擋在洛恩前面，說下一層交給她的雷。',
  },
  // Task 9: Bobby (spec §6). Met on the main road at depth 6, so her lines sit in act 2: she may name the lamp she sees, not
  // what the acts tell of it (I-58). Her pieces build the lamp's plan and her ancestors' guilt; the last ends on the spec line.
  'mem:bobby:1': {
    lines: [
      N('山谷裡的小工坊，牆上掛滿了扳手。小女孩踮起腳，打開一只上了鎖的鐵箱。'),
      N('箱底壓著半張發黃的圖，畫著一道衝上天的光柱。'),
      { who: 'bobby', mood: 'excited', text: '「那是星燈喔。我家的祖先，畫過星燈的圖！」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，只看到半張。……剩下的，我得一片一片想起來喔。」' },
    ],
    summary: '波比想起家裡鐵箱底的半張舊圖。圖上畫的，是星燈。',
  },
  'mem:bobby:2': {
    lines: [
      N('山谷外的村子。她報出家裡的名號，村裡卻沒有一個人聽過。'),
      N('家裡最老的工匠只是笑：「被忘掉，是我們自己選的。祖先做錯了事，後人就躲起來。」'),
      { who: 'bobby', mood: 'sad', text: '「被時間忘掉的一族……說的就是我們家喔。」' },
      { who: 'bobby', mood: 'serious', text: '「洛恩哥，祖先到底做錯了什麼？……那時候，我沒敢問。」' },
    ],
    summary: '波比的一族被時間遺忘了。家裡的老工匠說，祖先做錯了事，後人才躲了起來。',
  },
  'mem:bobby:3': {
    lines: [
      N('構造圖又拼上了一角。燈的開口畫得好大，大得像一張嘴。'),
      N('旁邊是祖先的字：「無論何種記憶，皆可收納。」底下另一個筆跡，只寫了兩個字：「錯了。」'),
      { who: 'bobby', mood: 'focused', text: '「什麼記憶都能裝……所以，連不該裝的，也全裝進去了。」' },
      { who: 'bobby', mood: 'sad', text: '「洛恩哥。這張圖……我第一次，沒辦法說它畫得好。」' },
    ],
    summary: '構造圖上，祖先把星燈造得什麼記憶都能裝。旁邊有人補了兩個字：錯了。',
  },
  'mem:bobby:4': {
    lines: [
      N('老工匠把那半張圖交到她手上：「祖先造的機兵，還守在星燈底下。去看看它們吧。」'),
      N('神殿裡倒著一台機兵。它胸口的記號，和圖上畫的一模一樣。'),
      { who: 'bobby', mood: 'sad', text: '「它們是家裡的人造的。……修好一台，就像替祖先道一次歉喔。」' },
      N('洛恩想起相遇那天，她趴在機兵的胸口，連怪物圍過來都沒發現。'),
    ],
    summary: '老工匠要波比去看祖先造的機兵。她修機兵，是想替祖先道歉。',
  },
  'mem:bobby:5': {
    lines: [
      N('最後一角拼上了。整張構造圖在她眼前亮起來，齒輪和管線，一條一條連上。'),
      { who: 'bobby', mood: 'excited', text: '「看懂了。祖先錯在燈芯這裡──沒有閥，什麼都吞，也什麼都還不回來。」' },
      { who: 'hero', text: '「修得好嗎？」' },
      { who: 'bobby', mood: 'smile', text: '「祖先造錯的東西，我來修好。」' },
    ],
    summary: '波比讀懂了整張構造圖，找到祖先造錯的地方。她說，她來修好。',
  },
  'chat:bobby:1': {
    lines: [
      { who: 'bobby', mood: 'excited', text: '「洛恩哥，你的劍借我看一下下。這些紋路，不像是刻好看的喔。」' },
      { who: 'hero', text: '「不是裝飾？」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，我也說不上來。就是覺得，有人很認真地做過它。」' },
    ],
    summary: '波比盯著洛恩的劍，說上面的紋路不像是刻好看的。',
  },
  'chat:bobby:2': {
    lines: [
      N('月影旅館的廚房冒出一陣白煙。波比抱著一支會自己轉的湯勺，臉上全是灰。'),
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，彈簧上得太緊了。瑪莎阿姨，再讓我試一次就好喔。」' },
      { who: 'marta', text: '「孩子，湯我自己攪就好。……先去把臉洗乾淨。」' },
    ],
    summary: '波比做了一支會自己轉的湯勺，弄得旅館廚房一陣白煙。瑪莎要她先去洗臉。',
  },
  // Task 10: Liz (spec §6, §7.5). She came to pay her family's debt and forgot their faces. Each piece narrows where home
  // is (a shop, its credit, the lamp's light overhead) without naming it; her last piece gives back her father's face. Only
  // when Orik's own fragment is back does the voice in that memory carry his name: the reveal waits for both (揭露表).
  'mem:liz:1': {
    lines: [
      N('擺滿瓶罐的小店。小女孩趴在櫃檯上，把冒險者拿來換藥的一枚舊銀幣舉到燈下。'),
      N('「丫頭，這個值多少？」櫃檯後面的人笑著問。她答對了，頭髮就被一隻大手揉亂。'),
      { who: 'liz', mood: 'scheming', text: '「估價的本事，就是在那裡學的。老大，我很厲害吧？」' },
      { who: 'liz', mood: 'hushed', text: '「……可是揉我頭髮的那個人，臉是一片霧。」' },
    ],
    summary: '莉茲想起小時候，在一間小店的櫃檯學估價。教她的人，她想不起臉。',
  },
  'mem:liz:2': {
    lines: [
      N('深夜。她從樓梯的縫往下看，櫃檯的燈還亮著，有人一枚一枚數著銅幣。'),
      N('牆上釘著一疊借據，每一張都寫著「回來再付」。寫下它們的冒險者，很多都沒有回來。'),
      { who: 'liz', mood: 'hushed', text: '「賒出去的東西收不回來，進貨的錢就還不出去。家裡的債，是這樣來的。」' },
      { who: 'liz', mood: 'serious', text: '「所以我才進迷宮。挖到寶藏換成錢，債就還得完了。」' },
    ],
    summary: '莉茲想起家裡的債：賒給冒險者的帳，人沒回來，錢也沒回來。她是為了還債，才進了迷宮。',
  },
  'mem:liz:3': {
    lines: [
      N('天還沒亮。她把那頂紅帽子掛在門後，留下一張字條：「等我把寶藏帶回來。」'),
      N('她推開門。屋頂的上方，一道好大的光柱直直衝上夜空。'),
      { who: 'liz', mood: 'hushed', text: '「那道光，近得像就在屋頂上。……老大，我家離星燈很近。」' },
      { who: 'liz', mood: 'sad', text: '「帽子留在門後了。說好了，回家再戴。」' },
    ],
    summary: '莉茲想起出門的那個清晨。她把紅帽子留在門後，說好回家再戴。她的家，離星燈很近。',
  },
  'mem:liz:4': {
    lines: [
      N('寶庫的門在她身後闔上了。黑暗裡，金幣堆成的小山閃著光。'),
      N('她一枚一枚地數。數到肚子不再叫，數到忘了這些錢要拿去還給誰。'),
      { who: 'liz', mood: 'sad', text: '「金幣一枚也啃不動。……那時候，好想吃一口家裡那種邊邊烤焦的麵包。」' },
      { who: 'liz', mood: 'hushed', text: '「數著數著，家人的臉，就一張一張被數掉了。」' },
    ],
    summary: '寶庫的門在莉茲身後關上。她守著吃不下的金幣一枚一枚地數，把家人的臉數忘了。',
  },
  'mem:liz:5': {
    lines: [
      // Plays in the shade on pickup. Orik's fragment not yet back: she has the face, not the name (Task 11's town:orik picks
      // it up). Already back: the two halves of that evening meet, and the memory comes true: the voice in it is Orik's, and
      // he knows her by the red hat she hung behind the door (piece 3, I-72): both recognise each other here (I-75).
      N('傍晚的店門口。那張臉終於從霧裡浮了出來：鬍子扎人，一笑，眼睛就瞇成一條線。'),
      { who: 'narrator', text: '「回來啦，丫頭！」他張開雙手，把她連人帶帽子抱了起來。', if: { notReturned: 'orik' } },
      { who: 'orik', text: '「紅帽子還掛在門後，等妳回來戴。……是妳吧，丫頭。爸爸認得那頂帽子，也認得妳了。」', if: { returned: 'orik' } },
      { who: 'liz', mood: 'hushed', text: '「……想起來了。是爸爸的臉。這張臉，我好像在哪裡看過。」', if: { notReturned: 'orik' } },
      { who: 'hero', text: '「歐里克說過，他想起女兒的臉了。」', if: { returned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「老大。爸爸的臉，我不會再弄丟了。……總有一天，換我自己走回家。」', if: { notReturned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「……是爸爸。那頂帽子，是我掛的。老大，我們回家吧，換我在店門口喊『我回來了』。」', if: { returned: 'orik' } },
    ],
    summary: '莉茲終於想起了父親的臉，和每天傍晚在店門口等她回家的那個人。她要回家了。',
  },
  'chat:liz:1': {
    lines: [
      // Read right before and after any of her pieces: the hunger is her meeting's, not a memory (I-58).
      N('月影旅館的晚餐桌。莉茲把第三塊麵包，悄悄塞進了口袋。'),
      { who: 'hero', text: '「吃不完？」' },
      { who: 'liz', mood: 'scheming', text: '「這叫存糧，老大。金幣餓了啃不動，麵包可以。這個道理，算你便宜一點。」' },
    ],
    summary: '旅館的晚餐桌上，莉茲把麵包塞進口袋。她說這叫存糧，金幣餓了啃不動。',
  },
  'chat:liz:2': {
    lines: [
      // Until her last piece the faces at home are gone; after it she has her father's, but the text still does not name him.
      N('深夜的旅館房間。莉茲把今天分到的錢，一枚一枚收進一只舊布袋。'),
      { who: 'hero', text: '「家裡，有人在等？」' },
      { who: 'liz', mood: 'hushed', text: '「……嗯。臉想不起來。可是，一定有人在等。」', if: { notFull: 'liz' } },
      { who: 'liz', mood: 'smile', text: '「……嗯。爸爸的臉，想起來了。這些錢，我要親手交到他手上。」', if: { full: 'liz' } },
    ],
    summary: '深夜，莉茲把分到的錢收進舊布袋。洛恩問她，家裡是不是有人在等。',
  },
  // Task 10: Scarlet (spec §6). The iron fortress was her kingdom; she believes she turned and fled from her gate. Her last
  // piece is the princess's order: 「你不是盾，你是我的朋友。活下去。」 From there she guards by choice, not by oath.
  'mem:scarlet:1': {
    lines: [
      N('石造的大殿，火盆燒得正旺。她單膝跪地，把劍橫舉過頭頂。'),
      N('「以我的劍起誓。」她說，「從今以後，我是您的盾。」'),
      { who: 'scarlet', mood: 'shaken', text: '「誓言，我一個字也沒有忘。……聽我起誓的人，我卻想不起來。」' },
      N('她按著劍柄的手，很久都沒有放開。'),
    ],
    summary: '絲嘉蕾想起受封為騎士的那天，她以劍起誓，要做某個人的盾。那個人是誰，她想不起來。',
  },
  'mem:scarlet:2': {
    lines: [
      N('鋼鐵的城牆上飄著紅旗。城下的街道，擠滿了趕集的人。'),
      N('那一夜，暮霧從城牆的裂縫湧了進來。怪物跟著霧，爬上了城牆。'),
      { who: 'scarlet', mood: 'sad', text: '「這座要塞……是我的國家。迷宮把它整個吞了下去。」' },
      { who: 'scarlet', mood: 'serious', text: '「洛恩閣下。我們相遇的那扇城門，就是我的崗位。」' },
    ],
    summary: '鋼鐵要塞曾經是絲嘉蕾的國家。暮霧湧進城牆的那一夜，迷宮把它整個吞了下去。',
  },
  'mem:scarlet:3': {
    lines: [
      N('火光裡，城門被撞得一下一下地震。她背對著城門，往城裡跑。'),
      N('身後，號角一聲接著一聲。她沒有回頭。'),
      { who: 'scarlet', mood: 'shaken', text: '「我轉身了。……在城門最需要我的時候，我逃了。」' },
      { who: 'hero', text: '「那些號角，是為了什麼吹的？」' },
    ],
    summary: '絲嘉蕾想起城門快被攻破時，自己背對城門往城裡跑。她認定，自己臨陣脫逃了。',
  },
  'mem:scarlet:4': {
    lines: [
      N('王城的庭院。公主提著木劍追著她跑，裙襬沾滿了草屑。'),
      N('「別叫我殿下。」公主笑著說，「在這裡，我們只是一起練劍的人。」'),
      { who: 'scarlet', mood: 'sad', text: '「我立誓守護的人，是公主殿下。……她總是不讓我這樣叫她。」' },
      { who: 'scarlet', mood: 'shaken', text: '「而我，把她一個人留在了城門後面。」' },
    ],
    summary: '絲嘉蕾想起誓言守護的人：和她一起練劍長大的公主。她以為，自己把公主丟在了城門後面。',
  },
  'mem:scarlet:5': {
    lines: [
      N('城門快要倒下的時候，公主抓住她的手臂，把她推進了撤退的密道。'),
      N('「這是命令。」公主說，「你不是盾，你是我的朋友。活下去。」'),
      { who: 'scarlet', mood: 'sad', text: '「那些號角，是撤退的號角。……我不是逃走的。是她，要我活下去。」' },
      { who: 'scarlet', mood: 'smile', text: '「洛恩閣下……不，洛恩。今後我擋在前面，不是為了誓言，是我自己選的。」' },
    ],
    summary: '公主下令絲嘉蕾撤退，要她活下去。她不是逃走的。從今以後，她守護別人，是出於自己的選擇。',
  },
  'chat:scarlet:1': {
    lines: [
      // Read right before and after any of her pieces: a knight keeping watch is her meeting's, not a memory (I-58).
      N('深夜的傳送門廣場。絲嘉蕾佩著劍站在門前，一動也不動。'),
      { who: 'glen', text: '「喂，騎士大人。守門是我的工作。妳啊，回去睡。」' },
      { who: 'scarlet', mood: 'serious', text: '「……遵命。只是，請容我明晚再來確認一次。」' },
    ],
    summary: '深夜，絲嘉蕾站在傳送門前守夜，被葛倫趕回去睡。她說明晚還會再來。',
  },
  'chat:scarlet:2': {
    lines: [
      // Until her last piece she calls him 「洛恩閣下」 and shields him as a duty; after it, 「洛恩」, by choice (I-26).
      N('回城的路上，絲嘉蕾的盾上，又多了一道新的凹痕。'),
      { who: 'hero', text: '「剛才那一下，不必替我擋。」' },
      { who: 'scarlet', mood: 'serious', text: '「洛恩閣下，替人擋下攻擊，本是騎士的本分。……總覺得，我還欠著誰。」', if: { notFull: 'scarlet' } },
      { who: 'scarlet', mood: 'smile', text: '「……洛恩。替你擋下，不是本分。是我想這麼做。」', if: { full: 'scarlet' } },
    ],
    summary: '絲嘉蕾又替洛恩擋下了一擊。洛恩說不必，她說了自己的理由。',
  },
  // Task 14: the finale (spec §8.4, §3.4, §3.6, §6; lore ledger I-109 to I-115). It opens where the hero's 10th piece ends,
  // the footsteps behind him, and always follows Rin's choice (U3): no `if.oath`. Twelve lines in every party: Lorne means to
  // burn this round's days as the wick; each companion gives a memory of him in her own voice (met) or Lorne hears her in
  // the lamp and names her (not met); Bobby's valve closes the eight; Rin's hand on his as the lamp steadies and the light
  // goes home; the society's last bell; Rin's last word.
  // Address forms that change with a full chain (Selene, Noel, Scarlet, and Bobby's ancestors) read both ways.
  finale: {
    lines: [
      { who: 'hero', mood: 'resolve', text: '「這一輪走過的每一天，就是這一次的燈芯。……送到這裡就好。」' },
      { who: 'selene', mood: 'smile', text: '「洛恩先生。上弦的那一夜，經過洞窟的人，是您呢。……這一段月光，交給燈吧。」', if: { met: 'selene', notFull: 'selene' } },
      { who: 'selene', mood: 'smile', text: '「洛恩。銀盆裡，很多人喊著同一個名字。……原來是你呢。這一聲，我也交給燈。」', if: { met: 'selene', full: 'selene' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有一段光在讀月亮。……瑟蕾。還沒找到妳，但我記住妳了。」', if: { notMet: 'selene' } },
      { who: 'chizuru', mood: 'solemn', text: '「洛恩大人。冰碎之後，頭一句聽見的，是『站得起來嗎？』……謹以此段，奉於燈前。」', if: { met: 'chizuru' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有人還在念沒念完的祝詞。……千鶴。封印，可以停下了。」', if: { notMet: 'chizuru' } },
      { who: 'safira', mood: 'smile', text: '「小洛，在火裡陪我跳完一整首的，是你。……這一拍，交給燈囉。」', if: { met: 'safira' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有人一個人跳著舞，等誰接上拍子。……莎菲拉。我會去接。」', if: { notMet: 'safira' } },
      { who: 'sylvie', mood: 'unguarded', text: '「洛恩。毒藤，是你割斷的。……這個，給燈。」', if: { met: 'sylvie' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，還有一支箭在射。……希爾薇。不用再一個人守了。」', if: { notMet: 'sylvie' } },
      { who: 'noel', mood: 'pout', text: '「哼。喂，歸來者，『一起回去吧』是你先說的。……這句，本小姐借給燈。」', if: { met: 'noel', notFull: 'noel' } },
      { who: 'noel', mood: 'blush', text: '「洛、洛恩。『一起回去吧』，是你先說的。……這一句，我交出去。」', if: { met: 'noel', full: 'noel' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有人快把自己的雷燒乾了。……諾艾兒。一起回去吧。」', if: { notMet: 'noel' } },
      { who: 'scarlet', mood: 'vow', text: '「洛恩閣下。城門前，閣下問我在守什麼。……以我的劍起誓，這一段，交給燈。」', if: { met: 'scarlet', notFull: 'scarlet' } },
      { who: 'scarlet', mood: 'smile', text: '「洛恩。城門前，你問我在守什麼。……現在，我答得出來了。這一段，交給燈。」', if: { met: 'scarlet', full: 'scarlet' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有個騎士還守著城門，不肯轉身。……絲嘉蕾。劍，可以放下了。」', if: { notMet: 'scarlet' } },
      { who: 'liz', mood: 'smile', text: '「老大在寶庫遞給我的那塊乾糧，我估過了──無價。這種好貨，借燈用用。」', if: { met: 'liz' } },
      { who: 'hero', mood: 'distant', text: '「燈裡，有人數著吃不下的金幣。……莉茲。家裡，有人在等。」', if: { notMet: 'liz' } },
      { who: 'bobby', mood: 'focused', text: '「燈芯少了一道閥，只會吞，不會還喔。……好，裝上了！洛恩哥，燈不用再燒掉誰了。」', if: { met: 'bobby', notFull: 'bobby' } },
      { who: 'bobby', mood: 'smile', text: '「洛恩哥，閥裝好了喔。祖先造錯的東西，我修好了。……燈，再也不用燒掉誰。」', if: { met: 'bobby', full: 'bobby' } },
      { who: 'hero', mood: 'resolve', text: '「燈芯少一道閥，才會把點燈的人燒盡。……波比，造燈那一族的孩子。這道閥，我替妳補上。」', if: { notMet: 'bobby' } },
      // Fix round 1: Rin's hand is on his when the lamp takes, in every reading; each other is shown, not said. The bell he
      // strikes is the society's own: her flattened one never rings again (I-51).
      N('凜的手疊上他握著燈鑰的手。燈穩了下來，碎片的光回到每一個弄丟它的人身上。暮霧散了。天亮時，沒有一個人鬆開手。'),
      N('鎮上，凜把敲平的鐘交給鐘守。他敲響結社的鐘，最後一聲：「吾等殺的一直是守燈人。每殺一次，燈就晚一次點亮。靜鐘會，散了。」'),
      // Coordinator ruling: Rin closes the game, echoing Lorne's line from her reveal; 「大家」 makes it everyone's, not a pick.
      { who: 'rin', mood: 'smile', text: '「……洛恩。明天，大家也一起回來吧。」' },
    ],
    summary: '燈喰之母倒下，星燈不再由一個人點亮。暮霧散了，靜鐘會敲完最後一聲。大家一起回來了。從深處走出來的，再也不是一個人。',
  },
};

/**
 * Task 11: the townsfolk returns (spec §7.5, §3.3; lore ledger I-87 to I-93). Each owner gets back what she lost, changes,
 * and says where the reward comes from. Orik's return reads two ways: Liz with her memories whole meets him at the shop
 * door (`if.full: 'liz'`); otherwise he only tells Lorne of the daughter's face and the red hat, and the meeting waits for
 * her last piece (mem:liz:5 with orik returned). The face he gets back is the little girl's of the year she left, so he
 * cannot know the grown Liz in town; and nothing unconditional echoes her pieces 2-3 (the debt, the IOUs, 「回家再戴」).
 * Father and daughter meet once, in whichever comes second (I-75, I-87).
 */
const TOWN_SCENES: Record<TownFragmentId, Written> = {
  orik: {
    lines: [
      N('道具店，打烊以後。歐里克把碎片捧在掌心。嗓門大了一輩子的人，半天說不出一句話。'),
      { who: 'orik', text: '「……小兄弟，我想起來了。是我女兒的臉。一笑，眼睛就瞇成一條線，跟我一個樣。」' },
      { who: 'orik', text: '「想起來的，是她出門那年的臉，還是個小丫頭。……現在長成什麼模樣，老頭子我可猜不著。」' },
      { who: 'orik', text: '「門後還掛著一頂紅帽子，是她的。這些年，我一直沒捨得收。」' },
      { who: 'orik', text: '「壓箱底的好貨，我賣了。這三百金幣是謝禮。往後店裡的東西，都算你便宜一成！」' },
      { who: 'narrator', text: '店門被推開了。莉茲站在門口，看著門後那頂紅帽子，一步也沒有動。', if: { full: 'liz' } },
      { who: 'liz', mood: 'sad', text: '「……爸爸。我回來了。」', if: { full: 'liz' } },
      { who: 'orik', text: '「……丫頭？是妳。妳看那頂帽子的樣子，爸爸認得。……它還等著妳戴呢。」', if: { full: 'liz' } },
    ],
    summary: '歐里克想起了女兒小時候的臉。門後那頂紅帽子，他一直沒捨得收。他賣了壓箱底的好貨當謝禮，往後也算便宜一成。',
  },
  marta: {
    lines: [
      N('月影旅館的廚房。瑪莎把碎片貼在胸口，爐上的湯咕嘟咕嘟地響。'),
      { who: 'marta', text: '「……想起來了。他走的那天早上，我也在煮這鍋湯。」' },
      { who: 'marta', text: '「他是冒險者。出門前說：『回來的時候，把今天的事說給我聽。』」' },
      { who: 'marta', text: '「我一直怕，那天沒跟他說路上小心。……原來說了。追到門口，說了兩次。」' },
      { who: 'marta', text: '「日記，原來是寫給他的。他回來的時候，我要說得出每一天。」' },
      { who: 'hero', mood: 'normal', text: '「那，往後就不必寫了？」' },
      { who: 'marta', text: '「還是會寫。現在想記住的事變多了。……你們的事，一件也不想漏。」' },
      { who: 'marta', text: '「這兩根復活羽毛，是他留在家裡的，你們帶著。往後的飯菜，我多添一道。」' },
    ],
    summary: '瑪莎想起丈夫出門的那個早上，她說了路上小心。日記原本是寫給他的；往後她還是會寫，因為想記住的事變多了。',
  },
  anna: {
    lines: [
      N('冒險者公會，打烊以後。安娜從櫃子最底層，抽出一張發黃的失憶登記表。'),
      { who: 'anna', text: '「這一張是我的。名字那一欄的『安娜』，是上一任公會長取的。『名字總要有一個』，是他說的。」' },
      { who: 'anna', text: '「……緹雅。進迷宮之前，我叫這個名字。我也當過冒險者。」' },
      { who: 'anna', text: '「我們四個人，提著同一盞燈下去。隊長總說，一起下去的，算同一盞燈。」' },
      { who: 'anna', text: '「暮霧湧上來的時候，我鬆開了手。……醒來，已經躺在公會的床上。」' },
      { who: 'hero', mood: 'serious', text: '「其他三個人呢？」' },
      { who: 'anna', text: '「不知道。可是他們的名字，我想起來了。他們的登記表，我會一張一張找。」' },
      { who: 'anna', text: '「收購價我會調高，碎片都是拚了命帶上來的。這顆星燈之淚，是我們當年帶上來的，給你們。」' },
    ],
    summary: '安娜想起了進迷宮之前的名字。她也當過冒險者，在暮霧裡鬆開了同伴的手。她要找回同伴們的登記，也調高了碎片的收購價。',
  },
  glen: {
    lines: [
      N('傳送門廣場，天還沒亮。葛倫站在門前，盯著那三座門看了很久。'),
      { who: 'glen', text: '「『這身灰，是深處才有的。』……小子，那天我怎麼知道的？因為我見過。」' },
      { who: 'glen', text: '「那年我十七，剛當上守門的。天還沒亮，門自己亮了。」' },
      { who: 'glen', text: '「走出來一個渾身是灰的男人，拖著一把劍。走了幾步，就倒在我腳邊。」' },
      { who: 'glen', text: '「倒下之前，他還笑了一下：『門，還開著啊。』……那張臉，跟你很像。」' },
      { who: 'hero', mood: 'distant', text: '「……後來呢？」' },
      { who: 'glen', text: '「碎片裡只有那個早上。『門還開著』這句，我說了幾十年……原來是跟他學的。」' },
      { who: 'glen', text: '「這一次，我記住了，洛恩。五百金幣，守門攢的，拿去買藥。哪扇門不合意，我替你換。」' },
    ],
    summary: '葛倫想起年輕時的一個早上：傳送門自己亮了，走出來一個渾身是灰、長得像洛恩的男人。這一次，他記住了洛恩的名字。',
  },
  doran: {
    lines: [
      N('鍛造屋。多蘭握著碎片站在爐前，風箱停了很久。'),
      { who: 'doran', text: '「……師父的手法。我在鋼鐵要塞，把它弄丟了。」' },
      { who: 'doran', text: '「年輕時下去找要塞的鐵。鐵扛回來了，手卻忘了怎麼打它。」' },
      { who: 'doran', text: '「師父按著我的手說：『別看火，聽鐵。鐵唱起來的那一下，就是火候。』」' },
      { who: 'hero', mood: 'serious', text: '「現在，聽得見嗎？」' },
      N('多蘭拉起風箱。爐火一亮，燒紅的鐵塊發出一聲細細的鳴響。'),
      { who: 'doran', text: '「……聽見了。差的那一點，原來在耳朵裡。」' },
      { who: 'doran', text: '「洛恩。這塊王者之鱗是師父留給我的，拿去。套裝的配方，往後少兩份料就打得成。」' },
    ],
    summary: '多蘭想起師父的鍛造手法：別看火，聽鐵。他第一次叫了洛恩的名字，套裝的配方也省下了素材。',
  },
};

/**
 * Continuity fix 2: the homecomings (spec §6 「由最後一片回憶與鎮上的變化」; lore ledger I-118). Four lines at most, each
 * played once, on the first return after her last piece. Chizuru's shrine, Safira's dance, Sylvie's sprout, and Liz at the
 * shop door: with Orik's fragment back, the two know each other (after mem:liz:5 or town:orik, whichever brought them
 * together); without it, she takes her red hat from behind his door, he cannot place her face, and she hangs it back to wait
 * for him (town:orik's full-Liz lines finish it). The hat is behind his door until then, so town:orik stays true.
 */
const HOME: Record<HomeOwner, Written> = {
  chizuru: {
    lines: [
      N('幾天後的清晨，鎮邊。一座小小的祠立在路旁，屋簷下掛著那枚鈴。'),
      { who: 'chizuru', mood: 'solemn', text: '「洛恩大人。祠雖小，鈴一響，此處便是神社了。」' },
      N('賣菜的老婆婆路過，停下來合了合掌。風一吹，鈴響了一聲。'),
      { who: 'chizuru', mood: 'smile', text: '「春祭時，請務必來看。……這一回，我會等到春祭。」' },
    ],
    summary: '千鶴在露米亞的鎮邊蓋了一座小祠，掛上神主託付的鈴。鈴一響，這裡就是她為現在的人守著的神社。',
  },
  safira: {
    lines: [
      N('黃昏的廣場。莎菲拉赤著腳站在石板中央，腳踝上的銅環輕輕一響。'),
      N('鎮上的人圍了過來。沒有鼓，也沒有笛，有人先拍起了手，替她打拍子。'),
      { who: 'safira', mood: 'smile', text: '「這拍子，比鼓手還準呢。……團長，大家，看好囉。」' },
      N('她跳完最後一步，深深鞠了一躬。拍手聲響了很久，很久都沒有停。'),
    ],
    summary: '莎菲拉在露米亞的廣場，跳完舞團最後的那支舞。鎮上的人都來看，替她打拍子。',
  },
  sylvie: {
    lines: [
      N('幾天後的清晨，月影旅館。希爾薇站在窗邊，看著樓下那塊空地。'),
      N('她種下的那顆種子，冒出了兩片小小的葉子，還沾著露水。'),
      { who: 'sylvie', mood: 'surprised', text: '「……發芽了。」' },
      { who: 'sylvie', mood: 'smile', text: '「洛恩。林子，從這裡再長。」' },
    ],
    summary: '希爾薇種在旅館窗外空地的種子發芽了。她說，林子要從這裡再長。',
  },
  liz: {
    lines: [
      { who: 'narrator', text: '傍晚的道具店。莉茲推開店門，取下門後那頂紅帽子，戴在頭上。', if: { notReturned: 'orik' } },
      { who: 'orik', text: '「喂，那頂不賣！……它一直掛在門後。妳這張臉，老頭子我怎麼想不起來。」', if: { notReturned: 'orik' } },
      { who: 'liz', mood: 'hushed', text: '「……沒關係。等你想起來，我再戴。」', if: { notReturned: 'orik' } },
      { who: 'narrator', text: '她把帽子掛回門後，回頭笑了一下。櫃檯後面的人撓著頭，也跟著笑了。', if: { notReturned: 'orik' } },
      { who: 'narrator', text: '傍晚的道具店。莉茲推開店門，從門後取下那頂紅帽子戴上，深深吸了一口氣。', if: { returned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「爸爸，我回來了！今天的帳，交給我來對！」', if: { returned: 'orik' } },
      { who: 'orik', text: '「回來啦，丫頭！帽子戴歪了。過來，爸爸替妳扶正。」', if: { returned: 'orik' } },
      { who: 'narrator', text: '櫃檯上擺著一枚舊銀幣。他笑著問：「丫頭，這個值多少？」', if: { returned: 'orik' } },
    ],
    summary: '莉茲回到道具店的門口。那頂紅帽子一直在門後等她；認得她的人，會笑著問她這個值多少。',
  },
};

function buildScenes(): Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }> {
  const out = {} as Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }>;
  // Plan 6c wrote every scene (Task 14 removed the drafts): a scene without its SCRIPT entry is a bug, not a draft.
  const scene = (id: SceneId, title: string): void => { out[id] = { title, ...written(SCRIPT[id], id) }; };
  for (const id of MAJOR_SCENES) scene(id, MAJOR_TITLES[id]);
  for (const id of CHARACTER_IDS) {
    const name = nameOf(id);
    CHAINS[id].pieces.forEach((_, i) => scene(memScene(id, i + 1), `${name}・第 ${i + 1} 片`));
    for (let n = 1; n <= CHAT_COUNT[id]; n++) scene(`chat:${id}:${n}`, `${name}・對話 ${n}`);
  }
  for (const f of TOWN_FRAGMENTS) out[`town:${f.id}`] = { title: `${f.npc}的記憶`, ...TOWN_SCENES[f.id] };
  for (const c of HOME_OWNERS) out[homeScene(c)] = { title: `${nameOf(c)}・${HOME_TITLES[c]}`, ...HOME[c] };
  return out;
}

/**
 * The handbook's people pages that are written: met, half the memories, all of them (spec §7.6). Lorne's are his own notes.
 * Unlocked by pieces, they never tell Rin's choice; Rin's fourth page alone unlocks with her oath (continuity fix 3).
 */
const PEOPLE: Partial<Record<CharacterId, string[]>> = {
  // Task 6
  hero: [
    '洛恩。安娜替我取的名字，因為我醒來時只念得出一個「洛」字。我從迷宮深處走出來，手上握著一把刻著紋路的劍。',
    '我的手記得的事比我多：劍怎麼放出去、繩結怎麼絆住、盾怎麼推回來。我也記得，自己死在一條巷子裡。',
    '我是守燈人，從艾斯特拉走下去的那一個。這把劍是燈鑰，燈芯是我在地面上活過的日子。這一次，我想和大家一起回來。',
  ],
  // Task 7: segment 3 unlocks with her 7th piece, before the reveal (the handbook opens in the dungeon): no choice (F6).
  rin: [
    '凜。和我一起倒在傳送門廣場的女孩，刀柄上刻著這個字，她就用它當名字。話很少，常在我背後。',
    '她在鐘樓下長大，丟針是她小時候的遊戲。她戰鬥時從不眨眼。她的師父說，從深處走出來的，不是人。',
    '她的碎片裡，「凜」是靜鐘會給刺客的代號，銅鐘是信物。鐘響了三天，她走進迷宮，追那個從深處走出來的人。',
    // Continuity fix 3: unlocks with her oath, so once she has chosen the page ends on her choice (lore ledger I-120).
    '旅館那一夜之後，她把一切都告訴了我。她說，她是被派來的，現在選擇不要。銅鐘她自己敲平了，現在她叫我洛恩。',
  ],
  // Task 8: Lorne's notes on Selene, Chizuru and Safira. Each segment is placed at her meeting: no act content.
  selene: [
    '瑟蕾。在本道的水晶洞窟遇見她，被怪物圍著，還在讀月相。她叫我洛恩先生，說話總留一點餘地。',
    '她是讀月亮的占星師，怕說出口的預言會自己成真。滿月的夜裡，她看過燈重新亮起。那些結局，是她自己交給迷宮的。',
    '新月的夜裡，她看過燈熄滅。她說，滿月裡站在燈旁邊的，是我們。現在她叫我洛恩，說她想看見。',
  ],
  chizuru: [
    '千鶴。在霜凍之地的冰裡找到她，她握著槍，還保持著封印的姿勢。她說只睡了幾天，叫我洛恩大人。',
    '神社派她來封印迷宮，要她春祭之前回去。祝詞沒念完，她就被凍進冰裡。冰外走過的人，衣裳換了好幾回。',
    '她是最後一位神主送出來的，神社早就不在了。槍穗上的鈴是神主託付的。她要在鎮邊蓋一座小祠，為了現在的人。',
  ],
  safira: [
    '莎菲拉。在熾焰之地的火裡一個人跳劍舞，像在等誰跟上她的拍子。她叫我小洛，從不說累。',
    '她是流浪舞團的舞者。碎片裡有打鼓的、吹笛的、縫衣裳的團員。她說，是她先看見沙漠裡那座蜃樓的城。',
    '走進蜃樓是團長選的，團長把她推了出來：「你要繼續跳。」她要在鎮上的廣場，跳完舞團最後的那支舞。',
  ],
  // Task 9: Lorne's notes on Sylvie, Noel and Bobby. Each segment is placed at her meeting: no act content (I-58).
  sylvie: [
    '希爾薇。在腐毒沼澤被毒藤纏住，箭筒只剩一支箭，還在射。話很少，只說路、風和氣味。',
    '腐毒沼澤，以前是她守的林子。霧來的時候，她牽著一家人走出去，又回頭了。她說，林子是在她眼前死的。',
    '人全出來之後，她才回頭，帶出了林子最後一顆種子。她要把它種在鎮上的空地。她說，林子還能再長。',
  ],
  noel: [
    '諾艾兒。在雷鳴之地亂放雷，魔力都快見底了，眼神空空的。自稱本小姐，叫我歸來者。',
    '她偷了老師的魔法書，逃進迷宮。書裡的星火，用一次就燒掉施法者的一段記憶。她的失憶，是自己燒的。',
    '老師不讓她念那一頁，是為了保護她。流浪商人就是她的老師，他們在攤前重逢了。現在她叫我洛恩，叫之前會先臉紅。',
  ],
  bobby: [
    '波比。在本道的星燈神殿，她趴在倒下的古代機兵身上修東西，怪物圍過來都沒發現。她叫我洛恩哥。',
    '她家是替星燈造機關的工匠一族，被時間忘了。碎片拼出星燈的構造圖：祖先把燈造得什麼記憶都能裝。',
    '她修機兵，是想替祖先道歉。現在她讀懂了整張構造圖，說祖先造錯的地方，她要親手修好。',
  ],
  // Task 10: Lorne's notes on Liz and Scarlet (I-58). Liz's last page unlocks with her 5th piece whether or not Orik's
  // fragment is back, so it stops at her father's face (揭露表).
  liz: [
    '莉茲。在暗影迴廊上鎖的寶庫裡找到她，身邊堆著金幣，她卻餓得站不起來。嘴很快，愛估價，叫我老大。',
    '她小時候在一間擺滿瓶罐的小店裡學估價。家裡的債，是賒出去收不回來的帳。她說，她家離星燈很近。',
    '寶庫的門關上之後，她數著吃不下的金幣，把家人的臉數忘了。現在她想起了父親的臉，說要回家。',
  ],
  scarlet: [
    '絲嘉蕾。在鋼鐵要塞的城門前，她和機兵一起把劍對著我們，撐過三個回合才收劍。她叫我洛恩閣下。',
    '她是騎士，以劍起誓要做某個人的盾。鋼鐵要塞是她的國家，被迷宮吞了下去。她說，城門快破的那一夜，她轉身逃了。',
    '她立誓守護的，是一起練劍長大的公主。那一夜的號角是撤退的號角，是公主要她活下去。現在她叫我洛恩，說擋在前面是她自己選的。',
  ],
};

/** The found line: narration that opens every meeting, as the rescue screen says it (`T.ui2.rescue.found`). */
const foundLine = (id: Meetable): string => `有人被怪物圍住了──是${nameOf(id)}！`;
/**
 * The written meetings (spec §6): the found line, then what the party sees and her own words; after the fight, she joins.
 * Played unfiltered: no `if`, and only she, Lorne, Rin and the narrator speak.
 */
const MEET: Partial<Record<Meetable, { before: ScriptLine[]; after: ScriptLine[] }>> = {
  // Task 8
  selene: {
    before: [
      N(foundLine('selene')),
      N('水晶洞窟的石壁上，映著一輪天上沒有的月亮。她跪在那片月光裡，被怪物圍著，卻抬頭讀著月相。'),
      { who: 'selene', mood: 'foresee', text: '「……上弦的月。今晚，也許會有人經過吧。」' },
      { who: 'rin', text: '「被圍住了，還在看月亮。心很大。」' },   // a meeting plays unfiltered and may come after her oath: no guarded face
    ],
    after: [
      { who: 'selene', mood: 'smile', text: '「謝謝各位。我是瑟蕾，讀月亮的人。」' },
      { who: 'hero', text: '「我是洛恩。妳怎麼一個人在這裡？」' },
      { who: 'selene', mood: 'wistful', text: '「我好像，把很重要的東西忘在這座迷宮裡了。……洛恩先生，請讓我同行吧。」' },
      { who: 'rin', text: '「可以。」' },   // V1: her one-word verdict, before he can answer (no face kept for either side of her oath)
    ],
  },
  chizuru: {
    before: [
      N(foundLine('chizuru')),
      N('一大塊冰裡，凍著一位巫女。她握著長槍，還保持著封印儀式的姿勢。'),
      N('怪物繞著冰打轉。冰面忽然裂開一道細縫，裡面傳出很輕的聲音。'),
      { who: 'chizuru', mood: 'solemn', text: '「……封印，尚未完成……」' },
    ],
    after: [
      N('冰碎了。巫女跌了出來，用長槍拄著地，撐住了身子。'),
      { who: 'chizuru', mood: 'bewildered', text: '「失禮了，是諸位破的冰？……我才睡了幾日，此處怎麼全變了樣。」' },
      { who: 'hero', text: '「我是洛恩。站得起來嗎？」' },
      { who: 'chizuru', mood: 'serious', text: '「我是千鶴，奉神社之命前來封印迷宮。洛恩大人，這份恩情，請容我以槍相報。」' },
    ],
  },
  safira: {
    before: [
      N(foundLine('safira')),
      N('熾焰之地的火海裡，一個少女握著彎刀，一個人跳著劍舞。每一步，都像在等誰接上她的拍子。'),
      { who: 'safira', mood: 'wink', text: '「哎呀，有客人？來得正好，這首曲子一個人跳，太寂寞了。」' },
      { who: 'rin', text: '「那是在打，還是在跳？」' },   // V1: her deadpan; a meeting plays unfiltered, so no guarded face
    ],
    after: [
      { who: 'safira', mood: 'laugh', text: '「哈哈！好久沒有人陪我跳完一整首了。」' },
      { who: 'hero', text: '「我是洛恩。妳一直一個人在這裡跳？」' },
      { who: 'safira', mood: 'sad', text: '「……一停下來，好像就會忘掉什麼。所以，就一直跳囉。」' },
      { who: 'safira', mood: 'wink', text: '「我是莎菲拉。小洛，讓我跟著你們吧，順便教你跟上拍子！」' },
    ],
  },
  // Task 9
  sylvie: {
    before: [
      N(foundLine('sylvie')),
      N('腐毒沼澤的爛泥裡，毒藤纏住了一個少女的腿。她的箭筒裡，只剩最後一支箭。'),
      N('她還在射。弓弦一響，撲過來的怪物就倒下一隻。'),
      { who: 'sylvie', mood: 'alert', text: '「別過來。……風向不對，毒會往你們那邊飄。」' },
    ],
    after: [
      N('洛恩割斷了毒藤。她把射出去的箭一支一支撿回來，插回箭筒。'),
      { who: 'sylvie', text: '「希爾薇。……謝了。」' },
      { who: 'hero', text: '「我是洛恩。」' },
      { who: 'sylvie', mood: 'serious', text: '「洛恩。這片沼澤的路，我認得。跟著我。」' },
    ],
  },
  noel: {
    before: [
      N(foundLine('noel')),
      N('雷鳴之地的岩台上，雷光四處亂竄。一個少女揮著法杖，連自己腳邊都劈。'),
      { who: 'noel', mood: 'panic', text: '「別、別過來！我的雷……還、還沒用完！」' },
      N('她的眼睛空空的，像是連自己為什麼在這裡都忘了。'),
    ],
    after: [
      N('雷光熄了。少女腿一軟，坐倒在岩石上。'),
      { who: 'noel', mood: 'pout', text: '「哼……本小姐一個人，本來也打得贏。」' },
      { who: 'hero', text: '「我是洛恩。走得動嗎？一起回去吧。」' },
      { who: 'noel', mood: 'smug', text: '「……諾艾兒。看你們這麼想帶本小姐走，就勉強跟你們一起吧。」' },
    ],
  },
  bobby: {
    before: [
      N(foundLine('bobby')),
      N('星燈神殿的石柱之間，倒著一台古代機兵。一個少女趴在它的胸口，扳手轉個不停。'),
      { who: 'bobby', mood: 'focused', text: '「這顆螺絲……再半圈……好，接上了喔。」' },
      { who: 'rin', text: '「後面。三隻。」' },   // a meeting plays unfiltered and may come after her oath: no guarded face
    ],
    after: [
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，原來剛才那麼危險？完全沒注意到耶。」' },
      { who: 'hero', text: '「我是洛恩。妳一個人在這裡修這個？」' },
      { who: 'bobby', mood: 'excited', text: '「它是古代的機兵喔。關節裡的齒輪，到現在都還咬得好好的。」' },
      { who: 'bobby', mood: 'smile', text: '「我是波比，技師。洛恩哥，帶上我吧！壞掉的東西，我都修得好喔。」' },
    ],
  },
  // Task 10
  liz: {
    before: [
      N(foundLine('liz')),
      N('暗影迴廊深處，一間寶庫的門鎖被撬開了。金幣堆成小山，在火把下閃著光。'),
      N('一個少女靠著金幣山坐著，手裡握著短刀，餓得站不起來。'),
      { who: 'liz', mood: 'scheming', text: '「……喂，那邊的。這堆金幣分你們一半，先換一口吃的。成交嗎？」' },
    ],
    after: [
      N('洛恩遞過乾糧。她兩口就吞了下去，連掉在膝上的碎屑都撿起來吃掉。'),
      { who: 'liz', mood: 'smile', text: '「活過來了！我是莉茲，尋寶獵人。說好的，金幣分你們一半。」' },
      { who: 'hero', text: '「我是洛恩。一個人來這裡做什麼？」' },
      { who: 'liz', mood: 'hushed', text: '「得把錢帶回家。……家人的臉，卻一張也想不起來了。老大，讓我跟著你們吧。」' },
    ],
  },
  // Her story fight (spec §6): she takes the party for the ones storming her gate, and fights beside the fortress's machine
  // soldiers until the party has lasted STORY_FIGHT_ROUNDS; the battle log then says `survived`, and she joins.
  scarlet: {
    before: [
      N(foundLine('scarlet')),
      N('鋼鐵要塞的城門前，一位騎士舉著燃燒的劍，背對著城門站著。'),
      N('圍在她身邊的機兵，一台也沒有對她動手。它們和她一起，轉向了隊伍。'),
      { who: 'scarlet', mood: 'vow', text: '「止步。這扇門後，一步也不許過。以我的劍起誓，我不會再轉身。」' },
    ],
    after: [
      { who: 'scarlet', mood: 'shaken', text: '「……你們不是敵人。是我把你們，錯看成了攻破城門的人。」' },
      { who: 'hero', text: '「我是洛恩。妳在守這扇門？」' },
      { who: 'scarlet', mood: 'serious', text: '「我是絲嘉蕾，騎士。這扇門是為誰而守……我想不起來了。」' },
      { who: 'scarlet', mood: 'vow', text: '「洛恩閣下，請讓我同行。對各位拔劍的失禮，就讓我用這把劍償還。」' },
    ],
  },
};

/**
 * The guild's lead for each companion still out there (6c Task 16; lore ledger I-124, I-126 to I-134): Anna passes on what
 * other adventurers saw, in her registry's words. A sighting, never a call for help: the lost remember nothing (I-126).
 * One box each: the region in words, the depth in numerals, what was seen and never who she is (her meeting, `MEET`, is
 * where she says it). Each matches her meeting's opening picture (spec §6).
 */
const LEADS: Record<Meetable, string> = {
  selene: '本道第二層的水晶洞窟裡，有人看見了月光。照不到天的洞裡，跪著一個人影。登記表上，還沒有這個人。',
  chizuru: '霜凍之地回來的人登記了一件事：第三層的冰裡，封著一個握長槍的人，姿勢像在做什麼儀式。',
  safira: '熾焰之地第三層的火海裡，有人一個人跳著劍舞。回來的冒險者說，那拍子像在等誰跟上。',
  sylvie: '腐毒沼澤第四層，一直有弓弦的聲音，一響就有怪物倒下。……箭，總有用完的時候。',
  noel: '雷鳴之地第四層的岩台上，雷整天亂劈。雷光裡有個小小的人影，連自己腳邊都劈。那樣撐不了多久。',
  bobby: '本道第六層的星燈神殿，一直傳出扳手的聲音。倒下的古代機兵身上趴著一個人，怪物圍過來也不抬頭。',
  liz: '暗影迴廊第六層，有間寶庫的鎖被撬開了。金幣堆成小山，旁邊靠著一個人，一直沒有站起來。',
  scarlet: '鋼鐵要塞第八層，一位騎士舉著燃燒的劍，守在城門前。靠近的人，全被趕了回來。……去之前，把隊伍整好。',
};

export const STORY = {
  scenes: buildScenes(),
  /**
   * The town's line of the day, said under the town's own name (Task 12; lore ledger I-96 to I-101). Everyone is pretending
   * all is well (spec §3.3). Unconditional: no companion but Rin, no townsfolk secret, and before `after` neither Rin's
   * choice nor the society's end. Act 2 seeds that Lorne has noticed her (§5.2, I-57) without her looking away (I-54);
   * act 4 may come before or after her choice, so it says nothing her choice would undo.
   */
  townLines: {
    prologue: [
      '廣場的早市照常開張。賣麵包的大嬸笑著吆喝，忘了昨天已經跟洛恩打過招呼。',
      '井邊的婦人壓低聲音：「從深處走出來的？」看見洛恩走近，她又笑著聊起天氣。',
      '西邊高地上，星燈今晚也亮著。老人們說，它以前比現在亮得多。',
      '暮霧貼著石板流進巷子。鎮上的人關緊窗，說一句「今天霧大」，就不再提了。',
      '老人們說，前幾天夜裡，遠方好像有鐘在響。是哪裡的鐘，誰也說不上來。',
    ],
    act1: [
      '公會的布告欄上，失憶登記又多了兩張。安娜把它們釘得整整齊齊，像這樣就不會再掉下來。',
      '酒館裡，冒險者們說起下面的事。說到一半，誰也想不起是誰先開的頭。',
      '道具店門口排起了隊。歸還之燈賣得最快──大家都想確定，自己回得來。',
      '廣場上，孩子們玩著「迷路了就朝光走」的遊戲，閉著眼睛，一個一個朝星燈走。',
    ],
    act2: [
      '公會的老人又在說：山上那道光，只是燈罩。說完，大家照樣舉杯，誰也沒有接話。',
      '瑪莎收著碗：「凜那孩子，總要等你的燈熄了才肯睡。……洛恩，你也知道吧。」',
      '葛倫打著呵欠：「那丫頭走路沒聲音。小子，你倒是每回都知道，她就在你後面。」',
      '旅館的走廊。凜跟在洛恩身後一步，手按著領口的小銅鐘。他沒有回頭，只是放慢了腳步。',
    ],
    act3: [
      '霧又濃了一層。白天也得點燈，鎮上的人卻說，這樣看起來比較熱鬧。',
      '天還沒亮，葛倫就站在傳送門前了。他說是睡不著，眼睛卻一直盯著門裡。',
      '月影旅館的門閂換了新的。瑪莎說舊的鬆了，換好的那天，她等到大家全回來，才落了鎖。',
      '瑪莎小聲說：「那孩子最近吃飯都不抬頭。……你看見了，也什麼都沒問，是吧。」',
    ],
    act4: [
      '鎮上流傳起一個很老的故事：很久以前，有人自己走下去，替燈點火。聽的人都說，那只是故事。',
      '星燈的光柱，暗得只剩一條細線。孩子問它會不會熄，大人只說：「快睡吧。」',
      '歐里克在店門口多點了兩盞燈：「霧再大，也得讓回來的人找得到門！」',
      '公會的牆上，失憶登記多得釘不下了。安娜換了一面更大的牆，什麼也沒說。',
      '洛恩和凜，總是一起出門，一起回來。瑪莎每晚都把湯，留在他們常坐的那張桌上。',
    ],
    after: [
      '暮霧散了。推開窗看得見遠方的山，鎮上的人說，原來山是這個顏色。',
      '星燈的光柱又亮又直。孩子們說，往後迷了路，再也不用閉著眼睛找它了。',
      '傳送門前排著隊。下去的人不是去打寶，是去找回自己弄丟的東西。',
      '旅館窗外那塊空地，今年綠得特別早。路過的人，都會停下來多看一眼。',
      '鐘不響了。一位穿長袍的老人在鎮上住了下來，每天早上，都到廣場坐一會兒。',
      '凜現在會跟瑪莎說早安了。瑪莎把這件事記進日記，還在旁邊畫了一個圈。',
    ],
  } as Record<Stage, string[]>,
  /**
   * Rin's town lines before her choice (Task 7). Act 2 starts at depth 4, before her 4th piece: she goes quiet, touches the
   * bell, walks behind, but does not look away yet. From act 3 she looks away. After the finale she has always chosen (U3).
   */
  rinLines: {
    // V1 voice pass: act 2 is light (her deadpan), acts 3 and 4 keep their shadow with one 「……」 at most per line.
    act2: ['葛倫說我走路沒聲音。是他太吵。', '喂，你走前面。我走後面。理由，不用問。', '剛才，是不是有鐘在響？……沒事。聽錯了。'],
    act3: ['別一直看我。看路。', '最近，夢裡一直有鐘聲。……沒事。', '沒事。問那麼多做什麼。'],
    act4: ['今晚早點睡。門，記得鎖好。', '不要站在我背後。……也不要讓我站在你背後。', '沒事。不要問。'],
  } as Partial<Record<Stage, string[]>>,
  /** Rin's lines in the town once she has made her choice; they replace `rinLines`. They read right before and after the finale. */
  rinOath: [
    '洛恩，我們今天也一起回來了呢。',
    '我現在會眨眼了。看你的時候，還會多眨幾下。',
    '湯可以慢慢喝了。瑪莎說，明天還會有。所以，再一碗。',
    '洛恩，你走前面。──算了，並排走。',
    '繃帶給我。你纏的那個叫打結，不叫包紮。',
  ],
  /**
   * The bellkeeper in the town (Task 11; lore ledger I-94, I-95). `oath`: from Rin's choice to the finale, maybe before the
   * hero's 9th piece and even before act 4: doctrine, fear and a first doubt, never the finale's truths, and he leaves her
   * flattened bell to her (she hands it over in the finale, I-51). `after`: the society has ended; he says Lorne's name.
   */
  bellkeeper: {
    oath: [
      '從深處走出來的人。鐘響了，吾等便來。世世代代，都是如此。',
      '吾等不是來動手的。那孩子的選擇，吾等……還不知道該怎麼回答。',
      '那孩子領口的鐘，被敲平了。要還，也得由她自己來還。吾等不去取。',
      '這幾天，我在鎮上看著你。你替旅館劈柴，替孩子撿球。……迷宮的意志，會做這些事嗎？',
      '吾等怕了很久。怕霧，怕深處，也怕自己弄錯。',
    ],
    after: [
      '洛恩。最後那一聲鐘，是我敲的。靜鐘會散了，往後不必再有人等它響。',
      '吾等弄錯了很多年。……不，是我弄錯了。剩下的日子，我想拿來記住，不是拿來守。',
      '那孩子笑起來的樣子，我從來沒見過。……原來，她會笑。',
    ],
  },
  /** The wandering merchant's greeting: before Noel has all her memories, and after (his recovered voice, I-68). */
  merchant: {
    lost: '「客人，旅途中缺什麼嗎？價錢跟城裡一樣。我是打哪裡來的……哈哈，連我自己都想不起來。」',
    found: '「年輕人，諾艾兒沒給你們添麻煩吧？記住，回去的燈，要比藥先備好。」',
  },
  /** The finale's boss room when Rin has not made her choice yet: said once, and the party stays on the map. */
  // Task 14: it plays in act 4 before her choice, maybe before her 6th piece: something is missing, and it is hers to give.
  finaleWait: [
    { who: 'hero', mood: 'serious', text: '「……還少了什麼。今天，先回去吧。」' },
    N('凜站在他身後，手按著領口的小銅鐘，一步也沒有往前。'),
  ] as ScriptLine[],
  /**
   * Each facility's greeting, said by its townsperson (Task 12; I-96 to I-101). A greeting knows the stage, not whether its
   * speaker has her fragment back, so it holds both ways: Orik never speaks of his daughter, Anna of her old name, Martha of
   * the day her husband left, Glen of the earlier dawn; Doran, who calls Lorne by name only once returned, calls him nothing.
   */
  greet: {
    guild: {
      prologue: ['洛恩，登記表我收好了。想起什麼，隨時來補上，一個字也算數。', '下去之前，燈帶了嗎？……好。今天也請平安歸來。'],
      act1: ['帳上那筆藥錢和房錢，我劃掉了。你們帶上來的碎片，早就抵清了。', '歡迎回來。找到的碎片先登記，主人是誰，我替你們問。'],
      act2: ['那塊石頭，我收進櫃子裡了。……裡面的光，到現在還往下流。', '回來了就好。找到的地點、看見的東西，慢慢說，我一條一條記。', '公會的帳上，你們那一頁乾乾淨淨。往後碎片換來的報酬，都歸你們。'],
      act3: ['下去的時候，別讓誰落在最後面。……這是公會的規矩，從今以後都算。', '你那一張登記表，我今天也看過了。最後一欄，還空著。'],
      act4: ['碑文我抄了一份，鎖在櫃子裡。……想看的時候，再跟我說。', '霧再濃，登記表上的名字也不會被吹走。今天也請平安歸來，洛恩。'],
      after: ['歡迎回來。今天來登記的人，都是來領回東西的，不是來報失的。', '洛恩，你那一張的最後一欄，我終於填上了：「回來了」。'],
    },
    shop: {
      prologue: ['小兄弟，又要下去了？好膽量！回復藥多帶幾瓶，算你便宜。', '歡迎光臨！架上都是好貨，看中哪個，老頭子我算你實在價。'],
      act1: ['燈多帶一盞，不吃虧。回得來，才有下一回生意嘛！', '小兄弟，那把劍的紋路……哈哈，看不懂！不過看得出是好貨。'],
      act2: ['回復藥最近賣得真快！……哈哈，好事，好事。', '小兄弟，最近下得深了吧？回復藥多帶兩瓶，老頭子我替你挑好的！'],
      act3: ['最近夜裡收攤早。……不是怕，是老頭子我也得睡覺嘛！', '好貨都替你留著。小兄弟，你可得回來買，聽見沒有？'],
      act4: ['歡迎光臨！……小兄弟，今天別講價了，挑好的拿。', '活著回來，下回才有好貨給你挑。老頭子我等著！'],
      after: ['好貨！好天氣！小兄弟，今天看什麼都順眼吧？', '有人拿著從下面找回來的東西，來問值多少。老頭子我只說：那個，無價！'],
    },
    inn: {
      prologue: ['孩子，先吃。名字想不起來不要緊，熱湯喝下去，肚子會記得。', '房間替你們留著。今天下了幾層、吃了什麼，回來都說給我聽。'],
      act1: ['回來啦。被褥曬過了，今晚會睡得好一點。', '又瘦了一點。坐下，湯馬上就好。'],
      act2: ['湯要慢慢喝，燙著了我可不管。……說的是你們每一個。', '今天的日記，寫到你們出門為止。剩下的，等你們回來再寫。'],
      act3: ['回來了。……好，我記下來了。今天也是，回來了。', '孩子，吃得下嗎？吃不下也坐一會兒，湯我替你溫著。'],
      act4: ['孩子，臉色好差。……不想說就別說，湯先喝了。', '日記寫到第幾本，我也數不清了。只要你們還回來，我就一直寫下去。'],
      after: ['窗外看得見山了。……今天的早飯，大家一起吃吧。', '今天的日記好寫。第一行就寫：天晴了。'],
    },
    gate: {
      prologue: ['三座門都開著。挑一扇，去吧。別逞強，小子。', '霧大的時候，別往深處鑽。迷路了就點燈，別硬撐。'],
      act1: ['門還開著。去吧，小子。別洩氣，也別逞強。', '走路的樣子像樣多了。……別得意，回來再說。'],
      act2: ['門今天也亮著。……比去年暗了點，你別跟人說。', '下去吧。那丫頭跟在你後面，你自己也看著點腳下。'],
      act3: ['天亮前我就站在這兒了。誰從門裡出來，我都看得見。', '小子，回頭看什麼？後面有我盯著，往前走。'],
      act4: ['霧大得看不見對面了。……門還開著，我在這裡等。', '別逞強。這句我說了幾十年，對你也一樣。你可得聽進去。'],
      after: ['天亮了，門也亮著。小子，下去撿點好東西回來。', '從門裡出來的人，現在都笑著出來。……這樣的早上，我守得起。'],
    },
    forge: {
      prologue: ['那把劍，誰打的？……紋路沒見過。放著別動，我只是看看。', '帶素材來。好鐵配好手藝，缺一樣都不成。'],
      act1: ['爐火正旺。要拆、要打，說。', '刃口缺了。下去之前，補好。'],
      act2: ['那兩把短刃，主人天天來磨。磨得比要用的還利。', '鐵也會累。打太多回，就脆了。……人也一樣。'],
      act3: ['盔甲的扣環，我加了一道。背後，最容易被盯上。', '爐子一夜沒熄。……睡不著，就打鐵。'],
      act4: ['霧裡的鐵，生鏽得快。回來就拿來，我替你上油。', '好鐵配好手藝。……再加上一個肯回來的人，才算打完。'],
      after: ['爐火正旺。今天，想打點不是拿來砍的東西。', '素材帶來了？好。天晴的日子，連爐火都旺些。'],
    },
  } as Record<'guild' | 'shop' | 'inn' | 'gate' | 'forge', Record<Stage, string[]>>,
  /** The finale's boss: the lantern-eater under her own name. */
  finaleBossName: '燈喰之母',
  /** The log line that ends Scarlet's story fight. */
  survived: '絲嘉蕾的劍停在半空。她看清了對手的臉，收起了劍。',
  /** The Act 1 milestone card, and the finale's closing card title (its text is the finale scene's summary). */
  act1Card: { title: '第一幕　星燈重新亮起', body: '燈喰之獸倒下了。暮霧從石板路上退去，露米亞第一次看見了晨光。' },
  endingTitle: '終幕　點燈',
  /** Rescue meetings: what is said before the fight (the found line is narration, then hers) and after it is won. */
  meet: Object.fromEntries(MEETINGS.map((m) => [m.id, written(MEET[m.id], `meet.${m.id}`)])) as Record<Meetable, { before: ScriptLine[]; after: ScriptLine[] }>,
  /** The guild's lead for each companion not met yet: Anna says it in place of her greeting (engine/story/leads.ts). */
  leads: LEADS,
  /**
   * Strangers' memories, one played when a shard is absorbed (Task 13; spec §3.1, §7.4; lore ledger I-102). Ordinary lives,
   * one voice each, in quotes: no named person, no lore, nothing of the lamp, the bell or the deep. The hollow adventurers
   * of a later monster set reuse this voice.
   */
  absorb: [
    '「……媽媽，我明天就回來。」',
    '「麵團要揉到跟耳垂一樣軟。……天還沒亮，爐子得先醒。」',
    '「信寫好了，一直沒寄。等我回去，親手交給妳也一樣。」',
    '「爸爸你看，我自己綁好鞋帶了！」',
    '「這口井的水最甜。小時候，奶奶總是先舀一瓢給我。」',
    '「推船下水之前，先看一眼天。……我爸總是這麼說。」',
    '「第一個孩子出生那晚，外頭下著大雨。我一直握著她的手。」',
    '「羊數到四十七隻，又少了一隻。……算了，明天再上山找。」',
    '「戒指小了一點。他說沒關係，戴久了就合了。」',
    '「……別哭。哥哥只是去遠一點的地方工作，很快的。」',
    '「今年的麥子長得好。收完這一季，就把屋頂修一修。」',
    '「他唱歌總是走音。……是哪一首歌，想不起來了。」',
    '「隔壁的阿婆又送菜來了。下次換我煮一鍋，端過去給她。」',
    '「門口那棵柿子樹，是我們搬來那年一起種的。」',
    '「今天的晚飯，是我第一次自己煮的。……大家都說好吃。」',
    '「再過三條巷子就到家了。屋頂冒著煙的那一間，就是我家。」',
    '「老狗趴在門口等我。牠已經走不動了，尾巴還是會搖。」',
    '「這件外套是妳縫的。袖口磨破了，我還是捨不得換。」',
    '「弟弟發燒了。我去找醫生，你們先睡。」',
    '「第一次領到工錢，我買了一包糖。……一顆都捨不得吃。」',
    '「是爸爸的船！帆上那塊補丁，我一眼就認得。」',
    '「那年的花開得特別早。我們說好了，明年也要一起來看。」',
    '「……阿公的手好大。揹著我過河的時候，一點都不晃。」',
    '「說好了喔。等我長大，換我揹你上山。」',
    '「河邊烤的魚，刺多得要命。他一根一根挑乾淨，才遞給我。」',
    '「最後一塊肉乾留給你。……別讓媽知道，她會念。」',
    '「當學徒的第一天，我敲歪了十根釘子。老闆只是笑。」',
    '「出門前，妳替我把領子翻好。……那是最後一次嗎？」',
    '「在河邊比賽打水漂，我贏了。弟弟哭著說不算，要再比一次。」',
    '「下個月就要成親了。新鞋子有點緊，走起來腳好痛。」',
    '「……我會數到一百了。一、二、三……奇怪，接下來是什麼？」',
    '「醫生說熬過今晚就沒事了。我就坐在這裡，哪裡也不去。」',
    '「市場收攤前，賣魚的大叔總會多塞一條給我。」',
  ],
  people: Object.fromEntries(CHARACTER_IDS.map((id) => [id, written(PEOPLE[id], `people.${id}`)])) as Record<CharacterId, string[]>,
  /** The handbook's truth pages: Lorne's own notes, one per stage, saying only what is known by then (spec §7.6, §8.4). */
  truths: {
    prologue: '我在傳送門廣場醒來，什麼都不記得。鎮上的人說，我是唯一從迷宮深處走出來的人。',
    act1: '迷宮吞掉人的記憶，暮霧也是它吐出來的。燈喰之獸倒下，霧散了。三天後，又回來了。',
    act2: '山上的光柱只是燈罩，燈芯在迷宮最底下。迷宮是燈壞掉之後長出來的根。凜喝湯的樣子，像有人規定她非喝完不可。',
    act3: '舊登記簿裡，有好幾個我。有幾筆死在靜鐘會手上。這一次的最後一欄，安娜說會一直空著。',
    act4: '地底的艾斯特拉，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。那塊碑，我讀得懂。',
    after: '燈點亮了，這一次不必有人燒盡自己。碎片的光回到了主人身上。現在我們下去，是為了把失去的東西找回來。',
  } as Record<Stage, string>,
  /**
   * The townsfolk in the handbook and at their counters (Task 11): `lost` is what the held fragment took from its owner;
   * `after` joins that facility's greeting once it is returned. Unconditional: true before and after Liz's reunion, Rin's
   * choice and the finale.
   */
  town: {
    orik: {
      lost: '歐里克失去了女兒的臉。他記得自己有個女兒，卻想不起她長什麼樣子。',
      after: '小兄弟，往後都算你便宜一成！平安回來，比什麼都要緊。',
    },
    marta: {
      lost: '瑪莎失去了丈夫離開的那一天。她每天寫日記，怕明天連今天也忘了。',
      after: '今天多添了一道菜。吃飽了，身子才擋得住。……等一下，今天的事說給我聽。',
    },
    anna: {
      lost: '安娜失去了進入迷宮之前的名字。她替每一個失憶的人建檔，自己那一張卻從來不提。',
      after: '碎片的收購價調高了。……叫我安娜就好。兩個名字，我都留著。',
    },
    glen: {
      lost: '葛倫失去了很久以前的一個黎明。那天在傳送門前發生的事，他一點也想不起來。',
      after: '洛恩，哪一扇門不合意，跟我說。別逞強。',
    },
    doran: {
      lost: '多蘭失去了師父的鍛造手法。火候總是差一點，差在哪裡，他說不上來。',
      after: '洛恩，套裝的料備好了嗎？少兩份也打得成。',
    },
  } as Record<TownFragmentId, { lost: string; after: string }>,
};
