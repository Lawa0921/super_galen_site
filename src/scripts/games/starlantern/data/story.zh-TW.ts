// Story copy (zh-TW). Every line of dialogue goes through ph(): it is placeholder text until plan 6c writes the real script.
import type { CharacterId } from '../engine/types';
import type { ExtraMood, Mood } from '../render/artPaths';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { MEETINGS, type Meetable } from './meetings';
import { CHAINS } from './story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from './story/fragments';
import { CHAT_COUNT, MAJOR_SCENES, STAGES, type MajorScene, memScene, type SceneId, type Stage } from './story/scenes';

export type NpcId = 'anna' | 'orik' | 'marta' | 'glen' | 'doran' | 'merchant' | 'bellkeeper';
export const NPC_NAMES: Record<NpcId, string> = {
  anna: '安娜', orik: '歐里克', marta: '瑪莎', glen: '葛倫', doran: '多蘭', merchant: '流浪商人', bellkeeper: '鐘守',
};

export type Speaker = CharacterId | NpcId | 'narrator';
export interface ScriptLine {
  who: Speaker; mood?: Mood | ExtraMood; text: string;
  /** `full`: that person's memories are all found. `oath`: Rin has made her choice (`true`) or has not yet (`false`). */
  if?: { met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId; full?: CharacterId; oath?: boolean };
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
    if (c.full && !w.full.includes(c.full)) return false;
    if (c.oath !== undefined && c.oath !== w.oath) return false;
    return true;
  });
}

/** The faces a line may ask for. */
export const STORY_MOODS: (Mood | ExtraMood)[] = ['normal', 'smile', 'sad', 'down'];
/** The longest a line of story text may be, in characters (the dialogue box shows about this much). */
export const MAX_LINE_CHARS = 60;
/** Who may speak in a memory besides its owner, the hero and the narrator. Each entry needs a reason in the lore ledger. */
export const MEMORY_GUESTS: Partial<Record<SceneId, Speaker[]>> = { 'mem:liz:5': ['orik'], 'mem:noel:5': ['merchant'] };

/** Every string that is still draft copy. 6c empties this set by writing the real script. */
export const PLACEHOLDERS = new Set<string>();
const ph = (text: string): string => { PLACEHOLDERS.add(text); return text; };

const nameOf = (id: CharacterId): string => CHARACTERS[id].name;
/** 1 to 10 in Chinese numerals: story text carries no Arabic digits. */
export const numeral = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`numeral(${n}): only 1 to 10`);
  return '一二三四五六七八九十'[n - 1];
};

const MAJOR_TITLES: Record<MajorScene, string> = {
  prologue: '序章', 'act1-after': '第一幕・之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', finale: '終幕',
};
const MAJOR_TEXT: Record<MajorScene, string> = {
  prologue: '序章', 'act1-after': '第一幕之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', finale: '終幕',
};

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
      { who: 'hero', mood: 'sad', text: '「洛……只有這個。後面的，怎麼也想不起來。」' },
      { who: 'anna', text: '「那就叫你洛恩吧。名字總要有一個，回來的時候，才有人喊得出來。」' },
      { who: 'anna', text: '「妳的刀柄上也刻著字。……『凜』。認得嗎？」' },
      { who: 'rin', text: '「不認得。……但就用它吧。」' },
      N('凜把短刃收回鞘裡。她看了洛恩一眼，在他回頭之前，移開了視線。'),
      { who: 'anna', text: '「回復藥五瓶，歸還之燈一盞。在下面迷路了就點燈，星燈會把你們拉回來。」' },
      N('從那天起，鎮上的人叫他「歸來者」──唯一從迷宮深處走出來的人。'),
    ],
    summary: '黎明的傳送門廣場倒著兩個失憶的人。安娜替他取名洛恩，凜則用刀柄上的字當名字。他是唯一從深處走出來的人。',
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
      { who: 'hero', text: '「現在可以眨了。這裡沒有人逼妳。」' },
    ],
    summary: '凜想起不准眨眼的訓練。洛恩告訴她，現在可以眨了。',
  },
  'mem:rin:4': {
    lines: [
      N('一張泛黃的名單。名字一個接一個被劃掉，墨跡有新有舊，筆跡都是同一個人的。'),
      N('師父擱下筆：「從深處走出來的，不是人，是迷宮的意志。它走到哪裡，暮霧就跟到哪裡。」'),
      { who: 'rin', text: '「名單上的人，我一個都不認得。……一個都不。」' },
      N('洛恩問她怎麼了。她說沒事，第一次沒有看著他的眼睛回答。'),
    ],
    summary: '凜想起被劃掉的名單和師父的話：從深處走出來的，不是人。她開始避開洛恩的視線。',
  },
  'mem:rin:5': {
    lines: [
      N('荒野裡，一扇半埋在土中的石門，門縫終日吐著霧。她被派到那裡，一個人。'),
      N('「守著這扇門。」師父說，「鐘響的那天，妳就會知道該做什麼。」'),
      { who: 'rin', text: '「我在那裡等了很久。等的是什麼……還想不起來。」' },
      N('她說得很平靜，握著短刃的手卻在發抖。洛恩看見了，什麼也沒問。'),
    ],
    summary: '凜想起自己被派去守一扇吐霧的石門，等著某一天鐘響。',
  },
  'mem:rin:6': {
    lines: [
      N('守門的第幾年，她已經數不清了。那天夜裡，遠方那座從不響的鐘響了，領口的小銅鐘也跟著響。'),
      N('她想起臨行前，師父替她扣上銅鐘：「靜鐘會的信物。它響了，就是時候了。」'),
      N('師父把短刃交到她手上：「『凜』是妳的代號。鐘響了，就去殺那個從深處走出來的人。」'),
      { who: 'rin', mood: 'sad', text: '「……別看我。一下就好。」' },
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
      { who: 'rin', mood: 'sad', text: '「……那把劍。上面的紋路，我看過。」' },
      { who: 'hero', text: '「凜？妳想起什麼了？」' },
      { who: 'rin', mood: 'sad', text: '「霧裡抓住我的那隻手……是你的。」' },
      { who: 'rin', mood: 'sad', text: '「我追了那麼多層，追的人……原來──」' },
      { who: 'hero', text: '「凜──」' },
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
      { who: 'hero', text: '「有幾條是灰的。摸上去，會聽見不認識的人在說話。」' },
      { who: 'anna', text: '「公會的老人說過：山上那道光只是燈罩，真正在燒的燈芯，在迷宮的最底下。」' },
      { who: 'anna', text: '「迷宮的牆如果是燈的根……那它是在燈壞掉之後，才長出來的。」' },
      { who: 'hero', text: '「燈芯還在燒嗎？」' },
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
      { who: 'hero', text: '「『艾斯特拉。此燈收逝者之記憶，點之為光，使其長明。』」' },
      { who: 'hero', text: '「『戰後，眾人欲忘，盡傾悲傷於燈。光遂變質，燈根生為迷宮。』」' },
      { who: 'hero', text: '「『一人自願下行，以己之記憶為燈芯。後人稱之守燈人。』」' },
      { who: 'hero', text: '「『芯盡，其人被吐還地面，一無所記；終將復歸深處，再點此燈。』」' },
      N('冒險者公會。安娜聽完，翻開那本舊登記簿，指著邊上一行褪色的小字。'),
      { who: 'anna', text: '「靜鐘會的人說，那個走出來的人『走到哪裡，暮霧就跟到哪裡』。」' },
      { who: 'anna', text: '「他們看反了。不是有人走出來，霧才變濃。是燈芯快燒完了，霧才變濃。」' },
      { who: 'hero', mood: 'sad', text: '「……那我為什麼，讀得懂那塊碑？」' },
      // Rin's lines know whether she has made her choice: act 4 may play before her reveal or after it (U1).
      { who: 'narrator', text: '凜一直站在門邊。她的手按著刀柄，像是在等某個聲音。', if: { oath: false } },
      { who: 'rin', text: '「……我出去走走。這裡太安靜了。」', if: { oath: false } },
      { who: 'rin', mood: 'sad', text: '「我等過那口鐘響。……等的，原來是一個誤會。」', if: { oath: true } },
      { who: 'rin', text: '「洛恩。他們錯了。……你不是霧。」', if: { oath: true } },
    ],
    summary: '地底的古城艾斯特拉。石碑說，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。洛恩讀得懂碑文。',
  },
  // Task 6: Lorne's memories (spec §4, §3.4, §3.6, §4.6, §8.4). Pieces 1–8 hint; piece 9 names the keeper, piece 10 the key.
  'mem:hero:1': {
    lines: [
      N('黑暗裡有一點光，遠得像針尖。他拖著劍，一層一層往上走。'),
      N('他不知道自己是誰，也不知道要去哪裡。只知道，要朝那點光走。'),
      { who: 'hero', text: '「想起來一點了。……我是朝著光，走上來的。」' },
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
      { who: 'hero', text: '「絆住，不是為了殺。……手還記得。」' },
      { who: 'hero', text: '「劍、繩結……都有人教過我。那些人，我一個也想不起來。」' },
    ],
    summary: '洛恩想起老獵人教他設陷阱：不用殺，讓牠慢下來就好。',
  },
  'mem:hero:4': {
    lines: [
      N('風沙裡，一輛馬車翻倒在路邊。他舉著一面裂開的盾，擋在車輪前。'),
      N('身後有人在哭。盾一次次被撞歪，他一次次把它推回來。'),
      { who: 'hero', text: '「我擋過。擋在誰前面……想不起來。」' },
      N('那些人身上的衣服，洛恩在鎮上從來沒見過，像是很久以前的樣式。'),
    ],
    summary: '洛恩想起自己在風沙裡舉盾，護著一輛翻倒的馬車。那些人的衣服，是很舊的樣式。',
  },
  'mem:hero:5': {
    lines: [
      N('那年秋天，遠方響過一次鐘。他回過頭，什麼也沒看見，日子照樣過。'),
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
      { who: 'hero', text: '「那座塔，鎮上沒有。那片天上的星星，位置也不對。」' },
      { who: 'hero', text: '「教我劍、盾、繩結和星星的人……也許，不是同一輩子遇見的。」' },
    ],
    summary: '洛恩想起在石塔上學星星的名字。那片星空的位置不對，像是另一輩子的事。',
  },
  'mem:hero:7': {
    lines: [
      N('遠方的鐘又響過一次。一季還沒過完，市集的人群裡，他看見了拿刀的人。'),
      N('然後是黑暗。他在很深很深的地方醒來，什麼都不記得，只看得見頭頂一點光。'),
      { who: 'hero', mood: 'sad', text: '「死了，就在最底下醒來，再走上來一次。……這條路，我走過不只一次。」' },
      { who: 'hero', text: '「拿刀的那個人，手在發抖。……他們在怕什麼？」' },
    ],
    summary: '洛恩又想起一次死亡，和死後在最深處醒來、再往上走的路。拿刀的人，手在發抖。',
  },
  'mem:hero:8': {
    lines: [
      N('荒地上圍著一圈帳篷。從迷宮裡抬出來的人躺了一地，什麼都不記得。'),
      N('他跪在他們中間，雙手捧著一點光，照著有人教過的樣子，一個一個祈禱。'),
      { who: 'hero', text: '「那一圈帳篷……是露米亞最早的樣子。」' },
      { who: 'hero', text: '「那時候我也什麼都不記得。照顧人的方法，手卻記得。」' },
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
      N('死了的那幾次，他在最底下的黑暗裡躺了好幾年。醒來時手裡只有那把劍，再從頭往上走。'),
      { who: 'hero', mood: 'sad', text: '「……想起來了。我是守燈人。」' },
      { who: 'hero', text: '「我在上面活過的日子，就是下一次的燈芯。」' },
      { who: 'narrator', text: '凜站在光照不到的地方，手緊緊按著領口的小銅鐘。', if: { oath: false } },
      { who: 'narrator', text: '凜走到他身邊，什麼也沒說，只是抓住了他的袖口。', if: { oath: true } },
      { who: 'hero', text: '「被殺了那麼多次，還是一直往上走。……原來我一直，想回來。」' },
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
      { who: 'hero', text: '「這把劍，是燈鑰。……我一直帶著它，走回來。」' },
      { who: 'hero', text: '「第一次，是我自己選的。那時候，只剩我還記得。」' },
      { who: 'hero', text: '「我知道該怎麼做。每一次，都是一個人做的。」' },
      N('他握緊劍，朝燈走去。身後的腳步聲，沒有停。'),
    ],
    summary: '洛恩想起第一輪：艾斯特拉的人都想忘，只有他記得，所以自願下去。他的劍，就是燈鑰。',
  },
  // Task 6: Lorne's chats. 2–4 wait for act 2, 3 and 4 (CHAT_GATE); the last one knows whether Rin has chosen.
  'chat:hero:1': {
    lines: [
      { who: 'glen', text: '「小子。下去之前，先看一眼那道光。迷路了，就朝它走。」' },
      { who: 'hero', text: '「……嗯。醒來的時候，第一個看見的就是它。」' },
      { who: 'glen', text: '「……這話，怎麼聽著耳熟。錯覺吧。去吧，別逞強。」' },
    ],
    summary: '葛倫要洛恩迷路時朝星燈走。洛恩說，他醒來第一個看見的就是它。',
  },
  'chat:hero:2': {
    lines: [
      N('深夜的月影旅館。凜坐在窗邊，一直看著傳送門的方向，眼睛一下也沒眨。'),
      { who: 'hero', text: '「睡不著？」' },
      { who: 'rin', text: '「……習慣了。總覺得，有什麼會從那裡走出來。」' },
    ],
    summary: '深夜，凜坐在旅館窗邊盯著傳送門。她說，總覺得有什麼會從那裡走出來。',
  },
  'chat:hero:3': {
    lines: [
      { who: 'marta', text: '「洛恩，今天的事說給我聽。我記下來。」' },
      { who: 'hero', text: '「回來了。……就這樣。」' },
      { who: 'marta', text: '「傻孩子，那是最要緊的一句。我寫在最上面。」' },
    ],
    summary: '瑪莎要把洛恩的一天寫進日記。他只說「回來了」，她把這句寫在最上面。',
  },
  'chat:hero:4': {
    lines: [
      { who: 'hero', text: '「凜。碑上那個人，每一次都是一個人走下去的。」' },
      { who: 'rin', text: '「……為什麼跟我說這個。」', if: { oath: false } },
      { who: 'narrator', text: '她轉身上樓，走到一半停了一下，沒有回頭。', if: { oath: false } },
      { who: 'rin', text: '「這一次，不是一個人。」', if: { oath: true } },
      { who: 'rin', text: '「洛恩，你下去的地方，我也去。我們一起回來。」', if: { oath: true } },
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
      { who: 'rin', text: '「洛恩。我被派來殺你。我現在選擇不要。」' },
      N('洛恩看著那枚鐘，看了很久。他沒有問為什麼，像是早就知道它會被放在那裡。'),
      { who: 'hero', text: '「明天也一起回來吧。」' },
      { who: 'rin', mood: 'smile', text: '「『凜』是他們給的代號。……可是，這個名字是我自己決定要用的。」' },
    ],
    summary: '深夜，凜的刀尖停在洛恩的喉嚨上，最後收了回去。天亮後她說出一切，選擇不殺他。洛恩只說：明天也一起回來吧。',
  },
  // Task 7: Rin's chats. 2 waits for act 2, 3 for act 3 (she looks away only from her 4th piece), 4 for her choice.
  // 2 and 3 can be delayed past her choice (one chat per return): each reading has its own lines.
  'chat:rin:1': {
    lines: [
      { who: 'rin', text: '「喂。葛倫說，是你把我從門裡拖出來的。」' },
      { who: 'hero', text: '「記不得了。……手好像，自己就伸出去了。」' },
      N('凜只說了一句「下次不用」，就上樓了。走到樓梯轉角，她停下來，回頭看了他一眼。'),
    ],
    summary: '凜問洛恩，是不是他把她從門裡拖出來的。他說記不得，手自己伸出去了。',
  },
  'chat:rin:2': {
    lines: [
      N('旅館的後院。凜坐在井邊，一隻手一直按在領口那枚小銅鐘上。', false),
      N('旅館的後院。凜坐在井邊，手指碰了碰領口，又放了下來。', true),
      { who: 'hero', text: '「怎麼了？」' },
      { who: 'rin', text: '「……沒什麼。只是，不想聽見它響。」', if: { oath: false } },
      { who: 'rin', mood: 'smile', text: '「……習慣了。那裡的鐘，已經不會響了。」', if: { oath: true } },
    ],
    summary: '凜坐在旅館後院的井邊，手按著領口。洛恩問她怎麼了。',
  },
  'chat:rin:3': {
    lines: [
      N('凜在擦短刃。洛恩在她對面坐下，她的視線便落回刀刃上，再也沒有抬起來。', false),
      { who: 'rin', text: '「……喂。你是人？」', if: { oath: false } },
      { who: 'hero', text: '「我想是。會餓，會累，回來的時候也會想睡。」', if: { oath: false } },
      N('凜在擦短刃。洛恩在她對面坐下，她停下手，抬起頭看著他。', true),
      { who: 'rin', mood: 'smile', text: '「以前，我不敢看你的眼睛。……現在，想多看一點。」', if: { oath: true } },
      N('洛恩沒有說話，也沒有移開視線。', true),
    ],
    summary: '洛恩在擦短刃的凜對面坐下。她說了一句話，眼神說得更多。',
  },
  'chat:rin:4': {
    lines: [
      { who: 'rin', text: '「洛恩。那枚銅鐘，扣上的時候還是好的。從霧裡出來，就裂了。」' },
      { who: 'rin', text: '「我想，是你抓住我手腕的那一下。……所以，我把它敲平了。」' },
      { who: 'rin', mood: 'smile', text: '「再也不會有鐘聲，叫我去殺誰。我們明天，也一起回來。」' },
    ],
    summary: '凜說，銅鐘是在霧裡裂的，在洛恩抓住她手腕的那一下。她把它敲平了，再也不會響。',
  },
};

function buildScenes(): Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }> {
  const out = {} as Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }>;
  // A written scene takes its SCRIPT entry; the draft (and its placeholder strings) is only made for the rest.
  const scene = (id: SceneId, title: string, draft: () => Written): void => { out[id] = { title, ...(SCRIPT[id] ?? draft()) }; };
  for (const id of MAJOR_SCENES) {
    scene(id, MAJOR_TITLES[id], () => ({ lines: [{ who: 'narrator', text: ph(`（${MAJOR_TEXT[id]}。）`) }], summary: ph(`${MAJOR_TEXT[id]}的故事。`) }));
  }
  for (const id of CHARACTER_IDS) {
    const name = nameOf(id);
    CHAINS[id].pieces.forEach((_, i) => {
      const n = i + 1;
      scene(memScene(id, n), `${name}・第 ${n} 片`, () => ({
        lines: [{ who: id, text: ph(`（${name}想起了第${numeral(n)}段記憶。）`) }],
        summary: ph(`${name}找回了一段記憶。`),
      }));
    });
    for (let n = 1; n <= CHAT_COUNT[id]; n++) {
      scene(`chat:${id}:${n}`, `${name}・對話 ${n}`, () => ({
        lines: [{ who: id, text: ph(`（${name}說了第${numeral(n)}段話。）`) }],
        summary: ph(`和${name}聊了一會兒。`),
      }));
    }
  }
  for (const f of TOWN_FRAGMENTS) {
    out[`town:${f.id}`] = {
      title: `${f.npc}的記憶`,
      lines: [{ who: f.id, text: ph(`（${f.npc}取回了失去的記憶。）`) }],
      summary: ph(`${f.npc}取回了記憶。`),
    };
  }
  return out;
}

/**
 * The handbook's people pages that are written: met, half the memories, all of them (spec §7.6). Lorne's are his own notes.
 * Unconditional strings: they never tell Rin's choice.
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
  ],
};

// The town's opening lines and the facility greetings, one set for every stage until 6c writes them per stage.
const stageEach = <V>(make: () => V): Record<Stage, V> =>
  Object.fromEntries(STAGES.map((s) => [s, make()])) as Record<Stage, V>;

const TOWN_OPENING = ['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。'];
const greetOf = (a: string, b: string) => stageEach(() => [ph(a), ph(b)]);

export const STORY = {
  scenes: buildScenes(),
  townLines: stageEach(() => TOWN_OPENING.map((t) => ph(t))),
  /**
   * Rin's town lines before her choice (Task 7). Act 2 starts at depth 4, before her 4th piece: she goes quiet, touches the
   * bell, walks behind, but does not look away yet. From act 3 she looks away. After the finale she has always chosen (U3).
   */
  rinLines: {
    act2: ['……沒什麼。', '喂，你走前面。……我習慣走在後面。', '……剛才，是不是有鐘在響？……沒事，聽錯了。'],
    act3: ['……別一直看我。看路。', '靜鐘會……好像在哪裡聽過。想不起來。', '沒事。……問那麼多做什麼。'],
    act4: ['……今晚早點睡。門，記得鎖好。', '不要站在我背後。……也不要讓我站在你背後。', '……沒事。不要問。'],
  } as Partial<Record<Stage, string[]>>,
  /** Rin's lines in the town once she has made her choice; they replace `rinLines`. They read right before and after the finale. */
  rinOath: [
    '洛恩，我們今天也一起回來了呢。',
    '我現在會眨眼了。……看你的時候，也是。',
    '湯可以慢慢喝了。瑪莎說，明天還會有。',
  ],
  /** The bellkeeper in the town: after Rin's choice, and once the finale is won. */
  bellkeeper: {
    oath: [ph('鐘聲停了。我只是來看看，那孩子過得好不好。')],
    after: [ph('鐘不響了，也沒有人再需要它了。')],
  },
  /** The wandering merchant's greeting: before Noel has all her memories, and after. */
  merchant: {
    lost: ph('「旅途中缺什麼嗎？價錢跟城裡一樣。」'),
    found: ph('「旅途中缺什麼嗎？……啊，我想起來了。價錢跟城裡一樣。」'),
  },
  /** The finale's boss room when Rin has not made her choice yet: said once, and the party stays on the map. */
  finaleWait: [{ who: 'narrator' as const, text: ph('還少了什麼……現在還不是時候。') }] as ScriptLine[],
  greet: {
    guild: greetOf('歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。'),
    shop: greetOf('歡迎光臨！看看有什麼需要的。', '剛進了新貨喔。'),
    inn: greetOf('辛苦了，要休息一下嗎？', '熱湯已經準備好了。'),
    gate: greetOf('三座傳送門都開著。要去哪裡？別逞強。', '傳送門今天也在發光。'),
    forge: greetOf('爐火正旺。要拆、要打，還是要重新鍛一回？', '帶素材來了嗎？好鐵配好手藝。'),
  },
  /** The finale's boss: the lantern-eater under her own name. */
  finaleBossName: ph('燈喰之母'),
  /** The log line that ends Scarlet's story fight. */
  survived: ph('她收起了劍。'),
  /** The Act 1 milestone card, and the finale's closing card title (its text is the finale scene's summary). */
  act1Card: { title: '第一幕　星燈重新亮起', body: '燈喰之獸倒下了。暮霧從石板路上退去，露米亞第一次看見了晨光。' },
  endingTitle: ph('終幕　點燈'),
  /** Rescue meetings: what is said before the fight (the found line is narration; 6c adds hers) and after it is won. */
  meet: Object.fromEntries(MEETINGS.map((m) => [m.id, {
    before: [{ who: 'narrator' as const, text: ph(`有人被怪物圍住了──是${nameOf(m.id)}！`) }],
    after: [] as ScriptLine[],
  }])) as Record<Meetable, { before: ScriptLine[]; after: ScriptLine[] }>,
  absorb: [ph('碎片化開，一段陌生的暖意流進身體。')],
  people: Object.fromEntries(CHARACTER_IDS.map((id) => [id, PEOPLE[id] ?? [1, 2, 3].map((n) => ph(`${nameOf(id)}的簡介（${numeral(n)}）。`))])) as Record<CharacterId, string[]>,
  /** The handbook's truth pages: Lorne's own notes, one per stage, saying only what is known by then (spec §7.6, §8.4). */
  truths: {
    prologue: '我在傳送門廣場醒來，什麼都不記得。鎮上的人說，我是唯一從迷宮深處走出來的人。',
    act1: '迷宮吞掉人的記憶，暮霧也是它吐出來的。燈喰之獸倒下，霧散了。三天後，又回來了。',
    act2: '山上的光柱只是燈罩，燈芯在迷宮最底下。迷宮是燈壞掉之後長出來的根。凜喝湯的樣子，像有人規定她非喝完不可。',
    act3: '舊登記簿裡，有好幾個我。有幾筆死在靜鐘會手上。這一次的最後一欄，安娜說會一直空著。',
    act4: '地底的艾斯特拉，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。那塊碑，我讀得懂。',
    after: '燈點亮了，這一次不必有人燒盡自己。碎片的光回到了主人身上。現在我們下去，是為了把失去的東西找回來。',
  } as Record<Stage, string>,
  town: Object.fromEntries(TOWN_FRAGMENTS.map((f) => [f.id, { lost: ph(`${f.npc}遺失了一段記憶。`), after: ph(`${f.npc}想起來了，謝謝你。`) }])) as Record<TownFragmentId, { lost: string; after: string }>,
};
