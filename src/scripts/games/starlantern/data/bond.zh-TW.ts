import type { GiftId } from '../engine/types';
import type { Companion } from './story/bond';
import type { SceneId } from './story/scenes';
import type { SceneLine } from './story.zh-TW';
import { PL } from './story/places';

/**
 * The bond's text (bond plan Task 6 on; spec 2026-10-18 affinity design, 0 D14): only text that is written. Nothing here is
 * a placeholder, and a companion with no entry is simply not offered (the gift and talk lists leave her out). Before
 * writing, read the style bible and spec 6.2 and 6.4; 6.4's voice samples predate the voice pass, and where they differ
 * from the bible, the bible wins. Story text imports from data/story.zh-TW.ts as types only (plan ruling 7).
 */

/**
 * A companion's reactions to gifts (spec 6.4): loved and liked two lines or more, neutral one or more, a line for each
 * material she declines and for each one her healing turns. Each line is her one line of dialogue (MAX_LINE_CHARS).
 */
export interface GiftPools {
  loved: string[];
  liked: string[];
  neutral: string[];
  declined: Partial<Record<GiftId, string>>;
  healed: Partial<Record<GiftId, string>>;
}

/**
 * Gift reactions, registered whole as each one is written (data/bond.test.ts); Rin's here are hers before her choice.
 * Bond plan Task 16: a pool picks its line by how many of that one material she has had (`giftLine`), so the first loved or
 * liked line is any first gift of that taste and the second reads as "this again"; declined and healed lines are each for
 * one material. A healed line is said once, the first time she takes what she used to decline. Selene, Noel and Scarlet
 * call him otherwise once whole, and Safira never by name, so their lines name him not (data/bond.test.ts).
 */
export const GIFT_LINES: Partial<Record<Companion, GiftPools>> = {
  rin: {
    loved: ['「剛好缺這個。另外，下次不用包得這麼好看。」', '「第二份。上一份還沒用完，這一份先收著。」'],
    liked: ['「可以用。重量剛好，比我自己找的輕兩成。」', '「又是這個。可以。兩個並在一起，剛好一手握得住。」'],
    neutral: ['「掂起來不重。不知道拿來做什麼，先放著，總有用得到的那天。」'],
    declined: { 'king-scale': '「太亮了。帶著它走，十步外就會被看見。拿回去，心意我記著。」' },
    healed: {},
  },
  selene: {
    loved: ['「真漂亮。像窗外剛點起的一盞燈。這一句不算預言，是真心的。」', '「又收到了。我早就看見了呢──啊，剛才那句請當作沒聽見。」'],
    liked: ['「謝謝。我替它看了一下明天──啊，不行，說出來就會長出腳來。」', '「同樣的禮物，又一份。明天也許會下雨，也許不會。這種預言最安全了呢。」'],
    neutral: ['「要用在哪裡，就請星星替我決定吧。」'],
    declined: { 'old-coin': '「銀幣一拋，就有正反兩面。我不想替誰選，請收回去。」' },
    healed: { 'old-coin': '「這一次，我收下。我不拋它，就這樣收著。是我自己決定的。」' },
  },
  chizuru: {
    loved: ['「我們那時候，這樣的東西是要供在神前的。洛恩大人，您太客氣了。」', '「又收到了？我們那時候，這些夠換一整年的米。洛恩大人，您太揮霍了。」'],
    liked: ['「城裡最近的禮物都這麼講究嗎？我們那時候，送一把青菜就算有心了。」', '「又是這個？洛恩大人挑中了，就一直挑同一樣。專一是美德，甚好。」'],
    neutral: ['「這是哪裡的特產？我們那時候沒見過，得先問問它的來歷。」'],
    declined: {
      'ice-crystal': '「冰的東西，請恕我收不下。手一碰，就想起那一陣冷。」',
      'frost-heart': '「比冰還要冷的東西，我實在拿不住。洛恩大人的心意，我放在心上就好。」',
    },
    healed: {},
  },
  safira: {
    loved: ['「好亮！小洛，下一場我就穿著它上台，第一排的位子留給你唷～」', '「又是亮晶晶的！小洛，你是不是偷偷想當我的服裝師呀？」'],
    liked: ['「謝謝唷！收在腰帶上，轉圈的時候會跟著打拍子。」', '「又來一個！小洛送禮的時機剛好踩在拍子上，漂亮！」'],
    neutral: ['「嗯～這個呀，我想想看要編進哪一支舞。」'],
    declined: { 'blaze-core': '「這個好燙。抱著它，我的腳會停下來的。小洛，換一首唷。」' },
    healed: { 'blaze-core': '「好燙……可是，抱得住了。小洛，這一團火，我帶著它跳。」' },
  },
  sylvie: {
    loved: ['「欸，這個好用。下雨的夜路靠它，箭頭也靠它。謝了。」', '「又一份？我原本要說不用的。風往這邊吹，那就收下。」'],
    liked: ['「還行。拿來補箭袋，起風的時候比較安靜。」', '「又一個？切口比上次乾淨，你追得比上次穩了。」'],
    neutral: ['「這個能吃嗎？不能的話，我先拿去墊桌腳。」'],
    declined: { 'mire-gland': '「毒腺？這味道我聞夠了。拿遠一點，晚飯會吃不下。」' },
    healed: { 'mire-gland': '「給我。那片林子的味道，現在記著就好，不用再躲了。」' },
  },
  noel: {
    loved: ['「哼！你總算知道本小姐配得上什麼了。今天的雷，會響一倍！」', '「又送？哼，本小姐可沒有在等，只是剛好有空收而已！」'],
    liked: ['「這個還不錯。本小姐就勉強收下了！」', '「哼，又來？你該不會是想收買本小姐吧？」'],
    neutral: ['「這是什麼？不、不用解釋，本小姐一看就懂了！」'],
    declined: { 'star-stone': '「不要那個！我──本小姐的雷，用不著這種石頭。拿遠一點啦！」' },
    healed: { 'star-stone': '「星紋石。老師說過，只要用對地方，就不可怕。我會用對它的。謝謝你。」' },
  },
  bobby: {
    loved: ['「哇──洛恩哥你看這紋路！等一下，我先看一下下，就一下下！」', '「又一個！嘿嘿，湊起來就能做一個會自己走路的……不行，這是秘密！」'],
    liked: ['「謝謝洛恩哥！這個拿來當零件剛剛好喔。」', '「又一個零件！剛好拿去補那顆一直鬆掉的螺絲，嘿嘿。」'],
    neutral: ['「嗯──這個能做什麼？等一下，我想到了！──不對不對，還要再一下下！」'],
    declined: { 'mire-gland': '「這個不行喔，洛恩哥。它會把齒輪蝕壞，工具箱會哭的。」' },
    healed: {},
  },
  liz: {
    loved: ['「好貨！老大，這個拿去賣，少說二十枚銀幣。不過這是老大送的，我不賣。」', '「又一個好貨！老大，你再這樣送，我要開始算利息給你了。」'],
    liked: ['「這個不錯啦。估價八枚銀幣，加上老大的心意，我記九枚。」', '「又送這個？好啦好啦，朋友價，我照收。」'],
    neutral: ['「這個值兩枚銅板。不過是老大送的，加一枚。」'],
    declined: { 'shade-crystal': '「暗影結晶？老大，看到它我肚子就餓得發慌。這筆生意不做。」' },
    healed: { 'shade-crystal': '「咦？這次肚子沒叫。老大，暗影結晶我還是不會估高，不過這個我收了。」' },
  },
  scarlet: {
    loved: ['「以騎士的名譽保證，我會善用它。用途會寫進下一次的回報。」', '「又一份。恕我直言，再這樣送下去，我的回報要多寫一頁了。」'],
    liked: ['「謝謝。我會帶著它出勤，算是今天的護身符。」', '「同一項物資，第二次收到。依照禮節，我是否需要回禮？請下令。」'],
    neutral: ['「用途不明。暫時編入裝備清單第九項。」'],
    declined: { 'iron-shard': '「這塊鐵片，是從那座要塞來的吧。失禮了，我的手……現在還不想碰它。」' },
    healed: { 'iron-shard': '「從那座要塞來的鐵片。那裡是我的家，我沒有丟下那裡。今天起，它跟我一起出勤。」' },
  },
};

/** Rin's reactions after her choice; she is offered only once both of hers are written (plan ruling 6). */
export const RIN_OATH: { value: GiftPools | null } = {
  value: {
    loved: ['「剛好缺這個。洛恩，你偷看過我的針包吧。」', '「又是這個。我會用完的，所以下次可以再送。」'],
    liked: ['「可以。這個放在看得見的地方，每天看一次。」', '「第二份了。洛恩，你是想讓我一直欠下去吧。」'],
    neutral: ['「用途我再想。謝謝你，這一句不用想。」'],
    declined: { 'king-scale': '「太亮了。現在不用躲了，可是它還是太亮。收回去吧。」' },
    healed: {},
  },
};
/** The same table, as `giveGift` and `giftPools` read it by default (read when called: `RIN_OATH.value`). */
export const rinOathLines = (): GiftPools | null => RIN_OATH.value;

/**
 * The bond's scenes as written (bond plan Task 8): each bond scene, after-story, romance and the walk together, keyed by its
 * id, registered in data/story/scenes.ts as it is written; `buildScenes` adds them to `STORY.scenes`. A scene may use the
 * location cards of data/story/places.ts (a new one goes in that table).
 */
export const BOND_SCENES: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>> = {
  // ---- bond plan Task 17: Rin (arcs v7). Her first two before her choice: no name, no 我們, no particle, no 「！」.
  'bond:rin:1': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場的市集。凜在針線攤買了一卷黑線，又拿起一根縫衣針，看了很久。' },
      { who: 'rin', text: '「這一根比我的長半分，針眼穿得過線。我的不行。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「妳想要？」', reply: [{ who: 'rin', text: '「不需要。三枚銅板，記住了而已。」' }] },
        { tone: 'stay', text: '（在攤前停下來等她。）', reply: [
          { who: 'rin', text: '「攤主找錢多找了一枚。不是我的。」' },
          { who: 'narrator', text: '她把那枚銅板推回去，順手把那根針擺正。' },
        ] },
        { tone: 'promise', text: '「明天再來看一次。」', reply: [{ who: 'rin', text: '「明天它也還在。看一次就夠了。」' }] },
      ] },
      { who: 'narrator', text: '她走開了，走到廣場的另一頭，又回頭看了那個攤子一眼。' },
    ],
    summary: '凜在市集看一根縫衣針看了很久，說不需要，走開以後又回頭看了一眼。',
  },
  'bond:rin:2': {
    lines: [
      { who: 'narrator', place: PL.innYard, text: '旅館的後院。凜練針割破了左手，正用右手單手纏繃帶，纏得比洛恩第一次還醜。' },
      { who: 'hero', text: '「太緊是故意的？」' },
      { who: 'rin', mood: 'guarded', text: '「這是太鬆。不用你來，欠了人就要還。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼不能欠？」', reply: [{ who: 'rin', mood: 'serious', text: '「欠了人，就走不掉。」' }] },
        { tone: 'stay', text: '（伸出手，等。）', reply: [
          { who: 'narrator', text: '她看著他的手，看了四秒，把左手放了上去。' },
          { who: 'rin', text: '「只纏三圈。三圈以後，我還你一次。」' },
        ] },
        { tone: 'promise', text: '「明天換藥，我來。」', reply: [{ who: 'rin', text: '「換藥用不著兩個人。一個半就夠。」' }] },
      ] },
    ],
    summary: '凜練針割破了手，單手纏得很醜，還是不肯讓洛恩幫忙。',
  },
  'bond:rin:3': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場的市集。凜把那根縫衣針拿起來又放回去，攤主正要收進盒子，她先伸手按住了。' },
      { who: 'rin', text: '「以前在這個攤子，有一根針我想要。那時候不能欠你，所以沒說。」' },
      { who: 'narrator', text: '洛恩付了錢。她的手伸進錢袋，停了一下，又空著抽了出來。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「欠著不難受嗎？」', reply: [{ who: 'rin', text: '「難受。所以記下來了：一根針，三枚銅板，欠洛恩。期限沒有。」' }] },
        { tone: 'stay', text: '（把針放進她手心。）', reply: [
          { who: 'rin', mood: 'averted', text: '「這一次，我欠著。我們走吧。」' },
          { who: 'narrator', text: '她握著那根針，一路都沒有收進口袋。' },
        ] },
        { tone: 'promise', text: '「下次換妳挑一樣給我。」', reply: [{ who: 'rin', text: '「那要很久，我挑東西很慢。這一次，我先欠著。」' }] },
      ] },
    ],
    summary: '凜說起那時候沒說的事：有一根針她想要。這一次，她讓洛恩買給她。',
  },
  'bond:rin:4': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。凜用那根縫衣針，替洛恩縫斗篷的破邊，一針一針數著。' },
      { who: 'rin', text: '「三十一。你的斗篷破得很沒規律，左邊三處，下擺兩處，袖口還有一個洞。」' },
      { who: 'rin', mood: 'serious', text: '「以前我待在一個地方，是因為鐘還沒響。」' },
      { who: 'rin', text: '「那口鐘不會再響了。每天醒來，沒有人叫我去哪裡，也沒有人攔我。」' },
      { who: 'rin', mood: 'averted', text: '「我每天都還在這裡。這是我自己挑的位置。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼還在？」', reply: [{ who: 'rin', text: '「你問了，我就要想。想完了，明天告訴你。」' }] },
        { tone: 'stay', text: '（等她縫完最後一針。）', reply: [
          { who: 'narrator', text: '她低頭把線咬斷。' },
          { who: 'rin', mood: 'smile', text: '「好了。縫得比你的繃帶好看。」' },
        ] },
        { tone: 'promise', text: '「明天早上，湯我先替妳盛。」', reply: [{ who: 'rin', mood: 'smile', text: '「好。那我比你早一步下樓。」' }] },
      ] },
      { who: 'narrator', text: '她把斗篷搭回他肩上，手在那裡多停了一下。' },
    ],
    summary: '凜替洛恩縫好斗篷，說她每天都還在這裡，那是她自己挑的位置。',
  },

  // ---- Selene (arcs v7). Scenes 1-3 never name him nor say 你 or 您 (they may play before or after she is whole).
  'bond:selene:1': {
    lines: [
      { who: 'narrator', place: PL.squareDusk, text: '黃昏的廣場。鎮上的窗一扇一扇亮起來，瑟蕾抬起手，指向鐘樓旁的那一扇。' },
      { who: 'selene', mood: 'foresee', text: '「下一扇是那裡。──啊，亮了。對不起，好像是我害的。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「再下一扇是哪一扇？」', reply: [{ who: 'selene', mood: 'smile', text: '「不能說。一說出口，它就得亮，那盞燈會很累的。」' }] },
        { tone: 'stay', text: '（陪她看著窗一扇一扇亮。）', reply: [{ who: 'selene', text: '「最後一扇是瑪莎的。這一句不算預言，是看見的。」' }] },
        { tone: 'promise', text: '「明天這個時候，再來猜。」', reply: [
          { who: 'selene', mood: 'smile', text: '「這一句，我先收著。」' },
          { who: 'narrator', text: '她笑了，沒有反悔。' },
        ] },
      ] },
      { who: 'narrator', text: '分開的時候，她張了張嘴，最後只說了一聲晚安。' },
    ],
    summary: '黃昏時，瑟蕾猜中了下一扇亮起的窗，卻道歉得好像是她害的。',
  },
  'bond:selene:2': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。整個早上，麵包幾時賣完、葛倫打幾個呵欠，瑟蕾全說中了；只有諾艾兒問的那一件，她說得含糊。', if: { met: 'noel' } },
      { who: 'narrator', place: PL.square, text: '廣場。整個早上，麵包幾時賣完、葛倫打幾個呵欠，瑟蕾全說中了；只有洛恩問的那一件，她說得含糊。', if: { notMet: 'noel' } },
      { who: 'narrator', text: '大的會很響，小的會很亮。諾艾兒選了大的，在孩子們面前炸成一團煙。', if: { met: 'noel' } },
      { who: 'narrator', text: '遠的那條風景很好，近的那條很近。洛恩選了遠的，繞了大半天才回來。', if: { notMet: 'noel' } },
      { who: 'noel', mood: 'serious', text: '「妳只說會很響！炸了也是響！妳明明知道會炸！」', if: { met: 'noel' } },
      { who: 'selene', mood: 'wistful', text: '「她走了。我不替人選，是怕選錯。結果，是她一個人選錯。」', if: { met: 'noel' } },
      { who: 'selene', mood: 'wistful', text: '「我不替人選，是怕選錯。結果，有人繞了遠路。」', if: { notMet: 'noel' } },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「妳看見了什麼？」', reply: [{ who: 'selene', text: '「說的都是真的。只是，沒說哪一邊會讓人開心。」' }] },
        { tone: 'stay', text: '（陪她坐在廣場的台階上。）', reply: [{ who: 'narrator', text: '她把雙手攏在膝上，一整個下午，沒有再預報任何事。' }] },
        { tone: 'promise', text: '「下一次，換妳先挑一個。」', reply: [{ who: 'selene', mood: 'smile', text: '「好。下一次，我先說我會選哪一個。」' }] },
      ] },
    ],
    summary: '瑟蕾只說了真話，不肯替人挑；那一個選擇，有人一個人扛了。',
  },
  'bond:selene:3': {
    lines: [
      { who: 'narrator', place: PL.plazaMorning, text: '清晨的傳送門廣場。瑟蕾在掌心寫了一個名字，握起來，又攤開。' },
      { who: 'selene', mood: 'foresee', text: '「下一個從那頭走過來的，是諾艾兒。」', if: { met: 'noel' } },
      { who: 'selene', mood: 'foresee', text: '「下一個從那頭走過來的，是瑪莎。」', if: { notMet: 'noel' } },
      { who: 'narrator', text: '下一個走過來的是一隻狗。再下一個，才是諾艾兒。', if: { met: 'noel' } },
      { who: 'narrator', text: '下一個走過來的是一隻狗。再下一個，才是提著水桶的瑪莎。', if: { notMet: 'noel' } },
      { who: 'noel', mood: 'smug', text: '「哼，試射的成品，送妳。小、小的那一種！」', if: { met: 'noel' } },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「還敢再猜嗎？」', reply: [{ who: 'selene', mood: 'smile', text: '「敢。猜錯了，也只是輸給一隻狗。」' }] },
        { tone: 'stay', text: '（摸了摸那隻狗的頭。）', reply: [{ who: 'selene', text: '「看牠多得意。第一名是牠的。」' }] },
        { tone: 'promise', text: '「明天換我猜。」', reply: [{ who: 'selene', mood: 'smile', text: '「好。猜錯的人請喝熱茶──那我先去燒水。」' }] },
      ] },
    ],
    summary: '瑟蕾猜下一個走過來的人，輸給了一隻狗；什麼都沒有塌下來。',
  },
  'bond:selene:4': {
    lines: [
      { who: 'narrator', place: PL.innRoofDay, text: '月影旅館的屋頂。洛恩爬上來，踩響了第三塊瓦，正是瑟蕾剛才說的那一塊。' },
      { who: 'selene', mood: 'smile', text: '「這個是猜的，不算預言。」' },
      { who: 'selene', mood: 'wistful', text: '「以前我只看得見結局。看見了，就不敢走。」' },
      { who: 'selene', text: '「跟著你，我說錯了好幾次，大家都還在。」' },
      { who: 'selene', text: '「所以，我想自己走到明天，親眼看一看。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「明天想做什麼？」', reply: [{ who: 'selene', mood: 'smile', text: '「猜窗。猜錯了，就跟你一起笑。」' }] },
        { tone: 'stay', text: '（坐下來，一起看著鎮上的窗。）', reply: [{ who: 'selene', text: '「那扇窗開了。不用猜，也知道是誰起床了。」' }] },
        { tone: 'promise', text: '「明天傍晚，我陪妳猜第一扇窗。」', reply: [
          { who: 'selene', mood: 'smile', text: '「那我們說好了。」' },
          { who: 'narrator', text: '她笑著點了點頭。' },
        ] },
      ] },
      { who: 'narrator', text: '她站起來，拍掉裙上的灰。' },
      { who: 'selene', mood: 'smile', text: '「明天見，洛恩。」' },
    ],
    summary: '瑟蕾說，她想自己走到明天，親眼看一看；分開的時候，她說了明天見。',
  },

  // ---- Chizuru (arcs v7). 洛恩大人 throughout; her own year; the bakery is hers.
  'bond:chizuru:1': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場的市集。千鶴抱著一大包香，正在跟香攤的老闆爭價錢，爭的是要多付。' },
      { who: 'chizuru', text: '「一把才兩枚銅板？我們那時候，這樣的香要五枚。店家會吃虧的。」' },
      { who: 'narrator', text: '老闆嚇得多塞了一把給她。她行禮道謝，老闆只好再塞一把。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「這麼多香，要做什麼？」', reply: [{ who: 'chizuru', text: '「祭典要用的。準備周全，才不會誤了時辰。」' }] },
        { tone: 'stay', text: '（替她提起那一大包香。）', reply: [{ who: 'chizuru', text: '「失禮了。那就到了石階前，再換我提。」' }] },
        { tone: 'promise', text: '「祭典那天，我幫妳搬。」', reply: [
          { who: 'chizuru', mood: 'smile', text: '「這個約，我記下了。」' },
          { who: 'narrator', text: '她從袖子裡摸出一張紙，添了一道。' },
        ] },
      ] },
    ],
    summary: '千鶴為祭典買香，硬要多付錢，嚇得攤主越送越多。',
  },
  'bond:chizuru:2': {
    lines: [
      { who: 'narrator', place: PL.edgeMorning, text: '清晨的鎮邊。千鶴畫了一張路圖，說路沒有錯，是鎮上的人把路名改了。' },
      { who: 'chizuru', text: '「小時候，山腳的阿松婆婆總給我麥芽糖。洛恩大人，陪我去送一份謝禮吧。」', if: { notSeen: 'mem:chizuru:4' } },
      { who: 'chizuru', text: '「阿松婆婆大概早就走了。可是婆婆的家，總該還有人在。洛恩大人，陪我去看看吧。」', if: { seen: 'mem:chizuru:4' } },
      { who: 'narrator', text: '路圖上的那戶人家，現在是一家麵包店。年輕的店主說，阿松是他的曾祖母。' },
      { who: 'narrator', text: '千鶴停住了，把那包謝禮抱回懷裡。', if: { notSeen: 'mem:chizuru:4' } },
      { who: 'narrator', text: '她算得出那是多少年。算出來了，還是停了一下。', if: { seen: 'mem:chizuru:4' } },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「婆婆是什麼樣的人？」', reply: [{ who: 'chizuru', text: '「我們那時候，婆婆總坐在石階上剝豆子。我又說成現在的事了。」' }] },
        { tone: 'stay', text: '（把店主送的麵包分她一半。）', reply: [{ who: 'chizuru', mood: 'smile', text: '「和婆婆的麥芽糖，一樣甜。」' }] },
        { tone: 'promise', text: '「明天陪妳去店裡打招呼。」', reply: [{ who: 'chizuru', mood: 'smile', text: '「好。替婆婆向她的曾孫，好好行一次禮。」' }] },
      ] },
    ],
    summary: '千鶴帶洛恩去找山腳的阿松婆婆，那裡已經是一家麵包店。',
  },
  'bond:chizuru:3': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。麵包店的孩子拉著千鶴玩踢石子，規則和她那時候不一樣。' },
      { who: 'chizuru', text: '「我們那時候的規則是這樣的：石子要踢三步，不可以回頭，還有──」' },
      { who: 'narrator', text: '孩子們的眼睛越睜越圓。她停在半句，撿起石子，照孩子們的新規則踢了出去，還贏了。' },
      { who: 'chizuru', mood: 'smile', text: '「按我們那時候的規則，也是我贏。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「新規則難嗎？」', reply: [{ who: 'chizuru', text: '「難。鎮上最近的玩法，石子要踢三次才算數。」' }] },
        { tone: 'stay', text: '（也撿一顆石子，排在孩子後面。）', reply: [{ who: 'chizuru', text: '「洛恩大人，請照新的規則來。我會盯著。」' }] },
        { tone: 'promise', text: '「明天教他們舊的。」', reply: [{ who: 'chizuru', mood: 'smile', text: '「好。舊的一種，換新的一種，誰也不吃虧。」' }] },
      ] },
    ],
    summary: '千鶴差點替孩子們糾正規則，最後照新的規則玩，還贏了。',
  },
  'bond:chizuru:4': {
    lines: [
      { who: 'narrator', place: PL.shrine, text: '鎮邊小祠。千鶴攤開那張添了很多道的紙，一道是一次約好的集合。' },
      { who: 'chizuru', mood: 'smile', text: '「洛恩大人遲到過兩次，我一次也沒有。」' },
      { who: 'chizuru', mood: 'solemn', text: '「神主大人要我在祭典之前回去。我遲到了，遲了很多年。」' },
      { who: 'chizuru', text: '「跟著洛恩大人以後，每一次集合、每一次出發，在這裡，我一次也沒有遲到過。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼這麼準時？」', reply: [{ who: 'chizuru', text: '「因為有人在等。等的人在，才趕得上。」' }] },
        { tone: 'stay', text: '（搖一次鈴，等她回頭。）', reply: [
          { who: 'narrator', text: '她回過頭來。' },
          { who: 'chizuru', mood: 'smile', text: '「甚好。鈴聲很準。」' },
        ] },
        { tone: 'promise', text: '「明天的集合，我比妳早到。」', reply: [
          { who: 'chizuru', mood: 'smile', text: '「那我就更早。這一回，換洛恩大人追不上。」' },
          { who: 'narrator', text: '她把那張紙收回袖子，又添了一道。' },
        ] },
      ] },
      { who: 'narrator', text: '祠前的鈴被風吹著，輕輕響了一聲。' },
    ],
    summary: '千鶴說，她在祭典之前遲到了很多年；在這裡，她一次也沒有遲到過。',
  },
};

/** Two town lines for the one chosen (plan ruling 13), added to the town's pool under her name once she is chosen. */
export const ROMANCE_LINES: Partial<Record<Companion, string[]>> = {};
