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
      { who: 'noel', mood: 'pout', text: '「妳只說會很響！炸了也是響！妳明明知道會炸！」', if: { met: 'noel' } },
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
      { who: 'narrator', text: '下一個走過來的是一隻狗。再下一個才是諾艾兒，把一盞雷光做的小提燈塞進她手裡。', if: { met: 'noel' } },
      { who: 'narrator', text: '下一個走過來的是一隻狗。再下一個，才是提著水桶的瑪莎。', if: { notMet: 'noel' } },
      { who: 'noel', mood: 'smug', text: '「哼，試射的成品，送妳。小、小的那一種！」', if: { met: 'noel' } },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「還敢再猜嗎？」', reply: [{ who: 'selene', mood: 'smile', text: '「敢。猜錯了，也只是輸給一隻狗。」' }] },
        { tone: 'stay', text: '（摸了摸那隻狗的頭。）', reply: [{ who: 'selene', text: '「看牠多得意。第一名是牠的。」' }] },
        { tone: 'promise', text: '「明天換我猜。」', reply: [{ who: 'selene', mood: 'smile', text: '「好。猜錯的人請喝熱茶──那我先去燒水。」' }] },
      ] },
    ],
    summary: '瑟蕾猜下一個走過來的是誰，結果輸給了一隻狗；猜錯了，也什麼事都沒有。',
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
      { who: 'chizuru', text: '「我們那時候的規則是這樣的：石子只踢一次，不可以回頭，還有──」' },
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
      { who: 'narrator', text: '祠前的香剛好燒完一半。她看了一眼，說時辰正好。' },
    ],
    summary: '千鶴說，她在祭典之前遲到了很多年；在這裡，她一次也沒有遲到過。',
  },

  // ---- bond plan Task 18: Safira (arcs v7). 小洛, never his name; 唷 and 呀; her jokes keep off the troupe.
  'bond:safira:1': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。石板上用粉筆畫了一整條舞步，每一個腳印，都剛好擋在洛恩平常溜走的那條路上。' },
      { who: 'narrator', text: '他繞了一圈，腳印也跟著繞了一圈。莎菲拉昨晚補畫到半夜。' },
      { who: 'safira', mood: 'wink', text: '「小洛，這邊！整條都是給你一個人的舞台唷～」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「這是誰的腳印？」', reply: [
          { who: 'safira', mood: 'laugh', text: '「你的呀！第一步踩這裡，第二步轉半圈，第三步最難，很多人踩空呀。」' },
          { who: 'narrator', text: '她一路跳給他看，跳到第八步才停。' },
        ] },
        { tone: 'stay', text: '（站在第一個腳印上，不動。）', reply: [{ who: 'safira', mood: 'laugh', text: '「站上去了！掌聲呢？──沒有？那我自己拍。」' }] },
        { tone: 'promise', text: '「明天我踩一步。」', reply: [{ who: 'safira', mood: 'smile', text: '「一步也算唷～記下了，小洛。」' }] },
      ] },
    ],
    summary: '莎菲拉在廣場畫了一整條粉筆舞步，剛好擋住洛恩平常溜走的路。',
  },
  'bond:safira:2': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。莎菲拉帶著鎮上的孩子跳舞遊行，孩子們連她踩錯的那一步都學得一模一樣，一路跳出了廣場。' },
      { who: 'narrator', text: '最後面的那個孩子跟丟了。希爾薇循著腳印在井邊找到他，抱回來，第一次對莎菲拉大聲。', if: { met: 'sylvie' } },
      { who: 'narrator', text: '最後面的那個孩子跟丟了。洛恩在井邊找到他，把他抱了回來。', if: { notMet: 'sylvie' } },
      { who: 'sylvie', mood: 'serious', text: '「孩子哭了一路。妳一次都沒有回頭看。」', if: { met: 'sylvie' } },
      { who: 'safira', mood: 'sad', text: '「跟在我後面的人，總是跟得很緊。我忘了。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「妳忘了什麼？」', reply: [{ who: 'safira', text: '「下一拍再說。我先去道歉──這次不跳著去，用走的。」' }] },
        { tone: 'stay', text: '（陪她把廣場上的粉筆擦掉。）', reply: [{ who: 'safira', text: '「擦乾淨了。我畫得太長，長到自己都快迷路了唷。明天畫短一點，短到看得見最後一個人。」' }] },
        { tone: 'promise', text: '「下一場，我走最後面。」', reply: [{ who: 'safira', mood: 'smile', text: '「那最後面就有人了唷。」' }] },
      ] },
    ],
    summary: '莎菲拉帶孩子跳舞遊行，最後面的孩子跟丟了；她一次都沒有回頭。',
  },
  'bond:safira:3': {
    lines: [
      { who: 'narrator', place: PL.innYard, text: '旅館的後院。莎菲拉把洛恩拉到正中間，自己退到一邊。' },
      { who: 'safira', mood: 'wink', text: '「今天換小洛數拍子，我跟。」' },
      { who: 'narrator', text: '他數：一、二、三、五。她的腳抬起來想搶拍，停在半空，又放下，等他數下一個。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「四去哪了？」', reply: [
          { who: 'safira', mood: 'laugh', text: '「四是用來喘氣的呀！」' },
          { who: 'safira', mood: 'smile', text: '「被人數著跳，原來不用一直往前衝。」' },
        ] },
        { tone: 'stay', text: '（不數了，只是拍手。）', reply: [{ who: 'safira', mood: 'laugh', text: '「掌聲！是給我的？──收下了唷。」' }] },
        { tone: 'promise', text: '「明天數到八給妳聽。」', reply: [{ who: 'safira', text: '「說好了唷，數到八，一個都不准跳。」' }] },
      ] },
    ],
    summary: '莎菲拉讓洛恩數拍子，自己跟著跳；他數錯了，她還是等他。',
  },
  'bond:safira:4': {
    lines: [
      { who: 'narrator', place: PL.square, text: '白天的廣場。莎菲拉站上石階宣布，接下來的節目不准拍手，違者罰跳一支。' },
      { who: 'narrator', text: '洛恩把手插進口袋。她跳完一整支，停在原地，沒有喊掌聲。' },
      { who: 'safira', text: '「以前每一首，我都要掌聲。一安靜下來，就怕聽見後面沒有人。」' },
      { who: 'safira', mood: 'smile', text: '「在這裡，安靜也沒關係。小洛在看，我知道。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「不要掌聲？」', reply: [
          { who: 'safira', mood: 'smile', text: '「今天不要。被看著，就夠了。」' },
          { who: 'narrator', text: '她轉了一圈，腳踝上的銅環輕輕響了一聲。' },
        ] },
        { tone: 'stay', text: '（不拍手，只是看著她。）', reply: [{ who: 'safira', mood: 'smile', text: '「就是這樣唷。」' }] },
        { tone: 'promise', text: '「明天的練習，我會到。」', reply: [{ who: 'safira', mood: 'wink', text: '「那明天，我也不要掌聲唷。」' }] },
      ] },
      { who: 'narrator', text: '廣場上的人來來去去，誰都沒有拍手，她笑得很開心。' },
    ],
    summary: '莎菲拉跳完一支舞，沒有要掌聲；她說安靜也沒關係，因為有人在看。',
  },

  // ---- Sylvie (arcs v7). 洛恩; her grumbling is how she looks after people; 啦 and 欸 rare, none in her 心契.
  'bond:sylvie:1': {
    lines: [
      { who: 'narrator', place: PL.innYard, text: '旅館的後院。希爾薇蹲在籬笆前，用小刀刻箭頭，一路指向旅館的後門。' },
      { who: 'sylvie', text: '「半夜迷路的人，看得見這個。」' },
      { who: 'sylvie', text: '「最後一個指廚房。餓的人也算迷路。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「刻給誰看的？」', reply: [{ who: 'sylvie', text: '「誰都行。看不懂箭頭的，就跟著湯的味道走。」' }] },
        { tone: 'stay', text: '（蹲下來，替她扶著木板。）', reply: [
          { who: 'sylvie', text: '「扶歪了啦。」' },
          { who: 'narrator', text: '她沒有說不用，又多刻了一個小箭頭，指向他。' },
        ] },
        { tone: 'promise', text: '「明天我來把剩下的刻完。」', reply: [{ who: 'sylvie', text: '「你刻的會歪。那就歪一個也好。」' }] },
      ] },
    ],
    summary: '希爾薇在後院的籬笆上刻箭頭，最後一個指向廚房。',
  },
  'bond:sylvie:2': {
    lines: [
      { who: 'narrator', place: PL.innKitchen, text: '旅館的廚房。下迷宮那一趟，希爾薇把兩個人的背包都背了，跑慢半步；洛恩替她擋了一下，手臂劃了一道。' },
      { who: 'sylvie', text: '「瑪莎的麵包硬得能擋刀，下次拿這個擋。」' },
      { who: 'sylvie', mood: 'serious', text: '「我背得動。一向都背得動。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「下次背包分我一半？」', reply: [{ who: 'sylvie', text: '「一半太多。三分之一，我再看看。」' }] },
        { tone: 'stay', text: '（讓她把繃帶纏完。）', reply: [
          { who: 'narrator', text: '她纏得很仔細，最後打了一個獵人的結。' },
          { who: 'sylvie', text: '「明天要下雨，傷口別碰水。」' },
        ] },
        { tone: 'promise', text: '「明天我自己背。」', reply: [{ who: 'sylvie', text: '「那我在後面看著。背歪了，我會說。」' }] },
      ] },
    ],
    summary: '希爾薇硬是把兩個人的背包都背了；替她擋下那一下的是洛恩。',
  },
  'bond:sylvie:3': {
    lines: [
      { who: 'narrator', place: PL.innKitchen, text: '旅館的廚房。希爾薇照瑪莎的方子燉了一鍋湯，自己嚐了五口，一口說淡，一口說鹹。' },
      { who: 'sylvie', text: '「野味我會烤，鍋子裡的鹹淡我不會。你嚐嚐。」' },
      { who: 'narrator', text: '第六口，她才把勺子交到洛恩手上。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「要加什麼？」', reply: [{ who: 'sylvie', text: '「加一小撮鹽就好。你別動手，你的一撮太大。」' }] },
        { tone: 'stay', text: '（把鹽罐推到她手邊。）', reply: [
          { who: 'narrator', text: '她撒了一小撮，自己又嚐一口，臉紅了。' },
          { who: 'sylvie', mood: 'blush', text: '「還行。風轉南了，明天收衣服。」' },
        ] },
        { tone: 'promise', text: '「下次換我煮。」', reply: [{ who: 'sylvie', text: '「那我先把胃藥準備好。」' }] },
      ] },
    ],
    summary: '希爾薇燉了一鍋湯，嚐了五口還拿不定，第六口才把勺子交給洛恩。',
  },
  'bond:sylvie:4': {
    lines: [
      { who: 'narrator', place: PL.innLot, text: '旅館旁的空地。那棵芽長高了，三支箭還插在旁邊。希爾薇在籬笆上刻最後一個箭頭，刻歪了。' },
      { who: 'sylvie', text: '「風害的。」' },
      { who: 'narrator', text: '刻歪的箭頭，指著那棵芽。' },
      { who: 'sylvie', mood: 'unguarded', text: '「你那時候不收種子，要我自己種。我一直以為，活下來的人要一直守著，不能停。」' },
      { who: 'sylvie', mood: 'unguarded', text: '「現在我想看它長大。也想看你們。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「它要長多久？」', reply: [{ who: 'sylvie', text: '「很久。所以我哪裡也不去。」' }] },
        { tone: 'stay', text: '（蹲在她旁邊，看著那棵芽。）', reply: [
          { who: 'narrator', text: '她拔起一支箭，插回箭袋。' },
          { who: 'sylvie', mood: 'unguarded', text: '「它不用人站崗了。」' },
        ] },
        { tone: 'promise', text: '「明天早上，我們一起來澆水。」', reply: [{ who: 'sylvie', text: '「水要先曬過，冷的它不喝。」' }] },
      ] },
    ],
    summary: '希爾薇刻了最後一個箭頭，指著那棵芽；她說想看它長大，也想看大家。',
  },

  // ---- Noel (arcs v7). Scenes 1-3 never name him and never thank him straight; 本小姐, 哼; her notebook is hers alone.
  'bond:noel:1': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。諾艾兒把筆記本攤在洛恩面前，整整一頁，全是她替自己想的稱號。' },
      { who: 'noel', mood: 'smug', text: '「哼，挑一個！本小姐今天就要正式出道。」' },
      { who: 'narrator', text: '每一個都比上一個長，戰績也越寫越誇張。最後一個寫著打倒了凜的某某，後面括號：暫定。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「哪一個最好？」', reply: [
          { who: 'noel', mood: 'smug', text: '「全部都好！不過這三個最好。」' },
          { who: 'narrator', text: '她念了三個，一個比一個長，念完自己喘了一口氣。' },
        ] },
        { tone: 'stay', text: '（在最短的那個下面畫線。）', reply: [{ who: 'noel', mood: 'panic', text: '「最、最短的？那是本小姐隨手寫的！」' }] },
        { tone: 'promise', text: '「明天聽妳宣布。」', reply: [{ who: 'noel', mood: 'smug', text: '「哼，等著被嚇到吧。」' }] },
      ] },
    ],
    summary: '諾艾兒寫了一整頁稱號要洛恩挑，最長的那一個還是暫定。',
  },
  'bond:noel:2': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。諾艾兒跟凜比劈柴，用雷劈，劈完手指麻得握不住筆，只好要洛恩替她寫筆記：每個人的名字和長相。' },
      { who: 'rin', text: '「我劈了四十二根柴。妳三根，其中一根是灰。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼要寫長相？」', reply: [{ who: 'noel', mood: 'pout', text: '「不、不為什麼！本小姐的筆記，要完整！」' }] },
        { tone: 'stay', text: '（照她說的，一個一個寫。）', reply: [
          { who: 'noel', text: '「瑪莎，眉毛這樣，再兇一點。」' },
          { who: 'noel', mood: 'pout', text: '「輪到你了？這一張，本小姐自己畫。」' },
        ] },
        { tone: 'promise', text: '「明天再補新的。」', reply: [{ who: 'noel', mood: 'smug', text: '「哼，那你們別跑太遠，頁數不夠。」' }] },
      ] },
      { who: 'narrator', text: '那一頁的最下面，洛恩把她的名字和臉也寫了上去。她看見了，什麼也沒說。' },
    ],
    summary: '諾艾兒跟凜比劈柴，累得握不住筆，要洛恩替她把每個人的長相寫進筆記。',
  },
  'bond:noel:3': {
    lines: [
      { who: 'narrator', place: PL.innYard, text: '旅館的後院。諾艾兒手裡聚起一顆大雷，看了很久，又一點一點把它壓小，壓到只有指甲那麼大。' },
      { who: 'noel', text: '「大的那個，本小姐暫時不練。」' },
      { who: 'narrator', text: '小雷光一離手，就去追旅館的貓，她追在後面跑了半個院子。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼練小的？」', reply: [
          { who: 'noel', mood: 'smug', text: '「小的才照得到字。大的只會照到天花板！」' },
          { who: 'noel', text: '「晚上看筆記，剛好。」' },
        ] },
        { tone: 'stay', text: '（伸出手，讓小雷光停在掌心。）', reply: [{ who: 'noel', mood: 'panic', text: '「不、不燙吧？本小姐控制得很好吧！」' }] },
        { tone: 'promise', text: '「今晚用它照筆記。」', reply: [{ who: 'noel', mood: 'smug', text: '「哼，平常要收費的。今晚免費。」' }] },
      ] },
    ],
    summary: '諾艾兒把一顆大雷壓成指甲大的小雷光，說大的那個暫時不練。',
  },
  'bond:noel:4': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。諾艾兒宣布今天的稱號是被記住的諾艾兒，又嫌太短，加了三個形容詞。' },
      { who: 'noel', mood: 'blush', text: '「洛、洛恩。……直接叫名字，還是不習慣。」' },
      { who: 'narrator', text: '她翻開筆記本。那一頁的最下面，是洛恩替她寫的名字，和一張畫得很醜的臉。' },
      { who: 'noel', text: '「想當最厲害，是怕沒人記得我。」' },
      { who: 'noel', mood: 'blush', text: '「在這裡，有人把我的臉寫進了筆記。所以本小姐留下來了。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「現在還要稱號嗎？」', reply: [
          { who: 'noel', mood: 'blush', text: '「不、不要了。有人記得，就先這樣。」' },
          { who: 'narrator', text: '她把那一頁折了一個角。' },
        ] },
        { tone: 'stay', text: '（把她頭頂翹起來的那撮頭髮壓平。）', reply: [{ who: 'noel', mood: 'blush', text: '「不准笑！謝、謝謝。」' }] },
        { tone: 'promise', text: '「明天我再畫一次妳的臉。」', reply: [{ who: 'noel', mood: 'pout', text: '「這次畫好看一點！不准畫頭髮！」' }] },
      ] },
    ],
    summary: '諾艾兒說，想當最厲害，是怕沒人記得她；這裡有人把她的臉寫進了筆記。',
  },

  // ---- bond plan Task 19: Bobby (arcs v7). 洛恩哥; 一下下 is never a moment; her 心契 has no 喔; her family's hand in his
  // sword is the finale's, never said here.
  'bond:bobby:1': {
    lines: [
      { who: 'narrator', place: PL.forge, text: '鍛造屋。波比問洛恩缺什麼，他說什麼都不缺；她就做了一個他不知道自己缺的東西。' },
      { who: 'narrator', text: '會自己找劍鞘的劍穗。它找錯了，纏在多蘭的鐵鎚上。多蘭看了一眼：「嗯。」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，那是試作品，正式版一下下就好！」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「這是什麼？」', reply: [
          { who: 'bobby', mood: 'excited', text: '「這個齒輪負責聞劍鞘，這個負責轉彎，這個──啊，這邊鬆了！」' },
          { who: 'bobby', mood: 'grin', text: '「還沒講到最好的地方喔！」' },
        ] },
        { tone: 'stay', text: '（伸手讓她把劍穗綁上去。）', reply: [{ who: 'bobby', mood: 'excited', text: '「綁、綁上去了！洛恩哥第一個用！」' }] },
        { tone: 'promise', text: '「下一層，我帶著它下去。」', reply: [{ who: 'bobby', text: '「那要報告它有沒有找錯鞘喔！」' }] },
      ] },
    ],
    summary: '波比替什麼都不缺的洛恩做了一個會自己找劍鞘的劍穗，它找錯了。',
  },
  'bond:bobby:2': {
    lines: [
      { who: 'narrator', place: PL.forge, text: '鍛造屋。波比說要看洛恩的劍一下下，拆了一整夜。四十八個零件攤在桌上，順序記不起來了。' },
      { who: 'narrator', text: '洛恩那天下不去了。' },
      { who: 'bobby', mood: 'focused', text: '「做錯的東西，要修到對為止。不然它就會被丟掉。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「這一個是什麼？」', reply: [
          { who: 'bobby', mood: 'excited', text: '「這是──啊！就是這裡！順序想起來了！」' },
          { who: 'narrator', text: '她一口氣裝回去三個，又停在第四個。' },
        ] },
        { tone: 'stay', text: '（坐下來，一起把零件排好。）', reply: [{ who: 'bobby', mood: 'grin', text: '「洛恩哥排的那一排，是反的喔。嘿嘿。」' }] },
        { tone: 'promise', text: '「明天只拆一半。」', reply: [{ who: 'bobby', text: '「只拆一半！這次是真的，大概。」' }] },
      ] },
    ],
    summary: '波比說要看劍一下下，拆了一整夜，順序記不起來；洛恩那天下不去了。',
  },
  'bond:bobby:3': {
    lines: [
      { who: 'narrator', place: PL.innKitchen, text: '旅館的廚房。瑪莎的舊音樂盒，有一個音永遠是歪的。' },
      { who: 'narrator', text: '波比的手伸過去，縮回來，又伸過去；另一隻手在口袋裡轉螺絲，轉到發燙，整張臉皺成一團。瑪莎說，她就喜歡那個歪的音。' },
      { who: 'bobby', mood: 'focused', text: '「我不修。今天不修。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「忍得住？」', reply: [{ who: 'bobby', text: '「忍、忍不住！可是它歪的地方，瑪莎阿姨會跟著哼。」' }] },
        { tone: 'stay', text: '（陪她聽完那一首。）', reply: [{ who: 'bobby', mood: 'smile', text: '「歪的那一下，其實很好聽耶。」' }] },
        { tone: 'promise', text: '「明天它還會歪。」', reply: [{ who: 'bobby', mood: 'grin', text: '「嘿嘿，那我明天再來聽。」' }] },
      ] },
    ],
    summary: '瑪莎的音樂盒有一個歪掉的音，波比忍了又忍，沒有修。',
  },
  'bond:bobby:4': {
    lines: [
      { who: 'narrator', place: PL.forge, text: '鍛造屋。波比把劍還給洛恩，自己掐著手指計時。' },
      { who: 'bobby', mood: 'grin', text: '「八十七下！這次真的是一下下。」' },
      { who: 'bobby', text: '「我一直以為，要修好東西，才能被留下來。」' },
      { who: 'bobby', text: '「可是在這裡，沒有人要我修好什麼，大家還是留著我。」' },
      { who: 'bobby', mood: 'smile', text: '「洛恩哥是我第一個不想修的人。你這樣就好。」' },
      { who: 'narrator', text: '她說完自己愣了一下，趕緊低頭講起劍要怎麼上油。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「真的不想修？」', reply: [{ who: 'bobby', mood: 'grin', text: '「一顆螺絲都不想。這是我說過最厲害的一句話了吧。」' }] },
        { tone: 'stay', text: '（收下劍，摸了摸她的頭。）', reply: [{ who: 'bobby', mood: 'blush', text: '「劍、劍要記得上油！」' }] },
        { tone: 'promise', text: '「明天的劍，再借妳看一下下。」', reply: [{ who: 'bobby', mood: 'smile', text: '「那時候，我只看，不拆。」' }] },
      ] },
    ],
    summary: '波比說，這裡沒有人要她修好什麼；洛恩哥是她第一個不想修的人。',
  },

  // ---- Liz (arcs v7). 老大; the doorway is hers; no 爸爸 before her last piece, and no reunion.
  'bond:liz:1': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。莉茲把全隊的東西攤在桌上，一件一件估價，要找出隊上最值錢的東西。' },
      { who: 'liz', mood: 'scheming', text: '「老大這捲繃帶，原價一枚銅板。被老大纏過，跌到半枚。」' },
      { who: 'narrator', text: '她估到自己的雙刃，跟自己殺了三次價。' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「誰教妳估價的？」', reply: [{ who: 'liz', mood: 'hushed', text: '「有人教過。估對了，頭髮就會被揉成鳥窩。」' }] },
        { tone: 'stay', text: '（把自己的錢袋放在她面前。）', reply: [{ who: 'liz', mood: 'scheming', text: '「老大，這袋裡一半是銅板，一半是麵包屑。」' }] },
        { tone: 'promise', text: '「明天帶個值錢的給妳估。」', reply: [
          { who: 'liz', mood: 'smile', text: '「成交！估對了，獎勵給錢就好啦。」' },
          { who: 'narrator', text: '她伸出手，等他握。' },
        ] },
      ] },
    ],
    summary: '莉茲替全隊估價，洛恩的繃帶只值半枚銅板。',
  },
  'bond:liz:2': {
    lines: [
      { who: 'narrator', place: PL.guild, text: '冒險者公會。莉茲給洛恩開了一疊借條：麵包錢、帶路錢、陪聊錢，利息算到半枚銅板以下。' },
      { who: 'narrator', text: '他下潛之前，連一瓶藥都買不起了。' },
      { who: 'narrator', text: '最後一張的期限欄，她寫了之後再付，寫完停住了。' },
      { who: 'liz', mood: 'hushed', text: '「這種借條，我看過一整面牆。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「一整面牆？」', reply: [{ who: 'liz', text: '「沒什麼。老大，你那疊期限改成明天──欠太久的，會變成一面牆。」' }] },
        { tone: 'stay', text: '（把借條一張一張摺好，收進懷裡。）', reply: [{ who: 'liz', text: '「收那麼好做什麼？又不值錢。」' }] },
        { tone: 'promise', text: '「明天我一定付。」', reply: [{ who: 'liz', mood: 'smile', text: '「這句我收了，不收利息。」' }] },
      ] },
    ],
    summary: '莉茲替洛恩開了一疊借條，利息算得比誰都細；寫到最後一張，她停住了。',
  },
  'bond:liz:3': {
    lines: [
      { who: 'narrator', place: PL.innKitchen, text: '旅館的廚房。莉茲烤了一盤麵包，邊邊全焦了，她說這種最好吃。' },
      { who: 'narrator', text: '她摸出那疊借條，撕了一張，停下來算了一下，又撕一張，最後一口氣全撕了。撕到期限寫著之後再付的那一張，她猶豫得最久。' },
      { who: 'liz', mood: 'smile', text: '「虧大了。這一盤，不算錢。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「不收錢？」', reply: [{ who: 'liz', text: '「這盤估不出價。估不出價的，我不賣。」' }] },
        { tone: 'stay', text: '（拿了最焦的那一塊。）', reply: [{ who: 'liz', mood: 'scheming', text: '「老大，眼光不錯。那塊最好吃。」' }] },
        { tone: 'promise', text: '「明天再烤一盤，我來搬柴。」', reply: [
          { who: 'liz', mood: 'smile', text: '「好啦，柴算你的，麵包算我的。──不對不對，都不算錢。」' },
          { who: 'liz', mood: 'hushed', text: '「有人等著吃，烤起來比較香。」' },
        ] },
      ] },
    ],
    summary: '莉茲烤了一盤邊邊焦掉的麵包，說這盤不算錢，還把借條全撕了。',
  },
  'bond:liz:4': {
    lines: [
      { who: 'narrator', place: PL.squareDusk, text: '黃昏的廣場。莉茲坐在台階上，先替台階估了價。' },
      { who: 'liz', mood: 'scheming', text: '「坐起來值三枚銅板，看夕陽另加一枚。」' },
      { who: 'liz', text: '「以前我以為，把錢帶回家就好。」' },
      { who: 'liz', mood: 'hushed', text: '「後來才知道，家是門口有人等。」' },
      { who: 'liz', mood: 'smile', text: '「這支隊伍，是我回來的時候，門口有人的地方。」' },
      { who: 'liz', text: '「爸爸說，帳他自己會對，叫我別急著回去顧店。」', if: { returned: 'orik' } },
      { who: 'liz', mood: 'hushed', text: '「帽子還掛在門後。等爸爸想起來之前，這裡也有人等我。」', if: { notReturned: 'orik' } },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「現在最值錢的是什麼？」', reply: [{ who: 'liz', text: '「台階的價錢我算得出來。這個，我算不出來。」' }] },
        { tone: 'stay', text: '（陪她坐在台階上，看人回家。）', reply: [{ who: 'liz', text: '「老大，你坐得太近了。算了，這個位置不收錢。」' }] },
        { tone: 'promise', text: '「明天傍晚，台階上等妳。」', reply: [
          { who: 'liz', mood: 'smile', text: '「這次不殺價，成交。」' },
          { who: 'narrator', text: '她伸出手，這一次沒有討價還價。' },
        ] },
      ] },
    ],
    summary: '莉茲說，家是門口有人等；這支隊伍，是她回來時門口有人的地方。',
  },

  // ---- Scarlet (arcs v7). Scenes 1-3 never name him; no 起誓, no 選, nothing of her last piece before it; 「！」 not hers.
  'bond:scarlet:1': {
    lines: [
      { who: 'narrator', place: PL.guild, text: '冒險者公會。絲嘉蕾把全隊的雜務排成一張勤務表，每一格都填了人，只有她自己那一格空著。' },
      { who: 'scarlet', text: '「待命。等候命令。」' },
      { who: 'narrator', text: '洛恩隨口說去吃點心。她立正出門，回來時手裡拿著半塊蛋糕。' },
      { who: 'scarlet', mood: 'serious', text: '「回報：外酥內軟，甜度三成。另外半塊，請品評。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼要等命令？」', reply: [{ who: 'scarlet', text: '「有命令，就知道該做什麼。」' }] },
        { tone: 'stay', text: '（在她那一格畫一個問號。）', reply: [{ who: 'scarlet', mood: 'surprised', text: '「問號……是什麼勤務？請說明。」' }] },
        { tone: 'promise', text: '「明天給妳一道命令。」', reply: [{ who: 'scarlet', text: '「遵命。我會保持待命。」' }] },
      ] },
    ],
    summary: '絲嘉蕾排了一張勤務表，只有自己那一格空著，等候命令。',
  },
  'bond:scarlet:2': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。公帳連著三天對不平，總是多出一份。絲嘉蕾立正：「報告：差額是我。」' },
      { who: 'liz', mood: 'serious', text: '「帳上多出來的那一份，是妳的賣命錢！妳不拿，就是把自己從帳上劃掉！」', if: { met: 'liz' } },
      { who: 'narrator', text: '莉茲把錢摔在桌上，頭也不回地走了。', if: { met: 'liz' } },
      { who: 'narrator', text: '洛恩把那一份錢推回她面前。', if: { notMet: 'liz' } },
      { who: 'scarlet', mood: 'sad', text: '「我以為，少一份，就不會給誰添麻煩。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「為什麼不拿自己那份？」', reply: [{ who: 'scarlet', text: '「我拿了，也不知道要用在哪裡。」' }] },
        { tone: 'stay', text: '（把錢收攏，放回她的掌心。）', reply: [{ who: 'scarlet', text: '「收下了。這一份，是我的。」' }] },
        { tone: 'promise', text: '「明天陪妳把帳對一次。」', reply: [{ who: 'scarlet', text: '「遵命。數字的部分，請提醒我。」' }] },
      ] },
    ],
    summary: '絲嘉蕾每次都把自己那份錢放回公帳；被發現的時候，她說差額是她。',
  },
  'bond:scarlet:3': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。孩子們拿木劍挑戰騎士大人，最小的那一個跑到她前面，大喊要保護她。' },
      { who: 'narrator', text: '她的手已經按上劍柄，一根一根手指鬆開，慢慢單膝跪下，讓那把木劍擋在她前面。' },
      { who: 'scarlet', mood: 'serious', text: '「回報：後方安全。」' },
      { who: 'scarlet', text: '「我也被木劍追過。追我的人，很會耍賴。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「怎麼耍賴的？」', reply: [{ who: 'scarlet', text: '「輸了就說，剛才那一下不算。」' }] },
        { tone: 'stay', text: '（也撿起一把木劍，站到孩子後面。）', reply: [{ who: 'scarlet', mood: 'smile', text: '「被兩個人守著。這種陣形，我還沒學過。」' }] },
        { tone: 'promise', text: '「明天換孩子們排勤務表。」', reply: [{ who: 'scarlet', text: '「那我會被排在哪裡，我有點擔心。」' }] },
      ] },
    ],
    summary: '孩子拿著木劍要保護絲嘉蕾，她鬆開劍柄，單膝跪下，讓孩子守。',
  },
  'bond:scarlet:4': {
    lines: [
      { who: 'narrator', place: PL.guild, text: '冒險者公會。新的勤務表上多了一格『點心：全員』。絲嘉蕾說這是她排過最難的一格。' },
      { who: 'narrator', text: '她拿起筆，在最後一格第一次替自己寫了名字：『休息：絲嘉蕾』。' },
      { who: 'scarlet', text: '「洛恩，我以前排班，從來不把自己算進去。」' },
      { who: 'scarlet', text: '「在這裡，我第一次覺得自己也在隊伍裡面。算在裡面的人，也可以休息。」' },
      { who: 'hero', choices: [
        { tone: 'ask', text: '「休息的時候做什麼？」', reply: [{ who: 'scarlet', text: '「不知道。所以，請教我。」' }] },
        { tone: 'stay', text: '（在那一格後面，寫上自己的名字。）', reply: [
          { who: 'scarlet', mood: 'smile', text: '「兩個人一起休息……這樣排，勤務表沒有寫過。」' },
          { who: 'narrator', text: '她看了很久，沒有劃掉。' },
        ] },
        { tone: 'promise', text: '「明天第一班，我來站。」', reply: [{ who: 'scarlet', mood: 'serious', text: '「那明天，我睡到第二班。以騎士的名譽保證。」' }] },
      ] },
      { who: 'narrator', text: '她把盾靠在牆上，坐了下來。' },
    ],
    summary: '絲嘉蕾第一次替自己排了一格休息，因為算在隊伍裡的人，也可以休息。',
  },

  // ---- bond plan Task 20: the after-stories (arcs v7). Light, six lines at most on the worst path, one line more (or two) at
  // tier 3 and up (`if.tier`); daily life after her homecoming, never a promise for life; the last line closes the return.
  'ending:rin': {
    lines: [
      { who: 'narrator', place: PL.plazaMorning, text: '清晨的傳送門廣場。鐘守把那枚敲平的鐘掛在門柱上，葛倫每天開門，都順手敲它一下。' },
      { who: 'narrator', text: '叩。凜照樣從鐘守身邊經過，不看他，也不繞路。' },
      { who: 'rin', text: '「今天晚了三口氣。葛倫睡過頭了。」' },
      { who: 'glen', text: '「我沒睡過頭。是呵欠打得比較長。」' },
      { who: 'narrator', text: '她已經走在洛恩前面半步，回頭說：「走了。瑪莎的湯，第一碗是我的。」', if: { tier: { who: 'rin', min: 3 } } },
      { who: 'narrator', text: '門柱上那枚鐘還輕輕晃著。' },
    ],
    summary: '鐘守把那枚鐘掛在門柱上，葛倫每天開門敲一下；凜照樣從鐘守身邊走過，不看他，也不繞路。',
  },
  'ending:selene': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館。瑟蕾的窗台上放著一本小冊子，她每天在上面寫一件明天要做的事。' },
      { who: 'narrator', text: '隔天做到了就打一個勾，沒做到就畫一個小圈。圈比勾多，一個「也許」也沒有。' },
      { who: 'selene', mood: 'smile', text: '「昨天寫的是『在第三扇窗亮之前回到旅館』。那扇窗幾時亮，我早就看見了，結果看得太入迷，又多一個圈。」' },
      { who: 'selene', text: '「圈多一點也好呢。畫起來，比勾圓。」' },
      { who: 'narrator', text: '往前翻幾頁，有一行寫著『和洛恩看第一扇窗』，旁邊是一個勾。', if: { tier: { who: 'selene', min: 3 } } },
      { who: 'narrator', text: '她翻到新的一頁，想了很久，寫下明天的事。' },
    ],
    summary: '瑟蕾每天在小冊子上寫一件明天要做的事；沒做到就畫一個圈，圈比勾多。',
  },
  'ending:chizuru': {
    lines: [
      { who: 'narrator', place: PL.shrine, text: '鎮邊小祠。祭典之後，祠前的鈴每晚由千鶴搖一次；每天早上，麵包店的孩子會送來一個剛出爐的麵包。' },
      { who: 'narrator', text: '千鶴每一個都記進奉納的名冊，名字那一欄，寫的是麵包的名字。' },
      { who: 'chizuru', text: '「今日奉納，核桃麵包一個。我們那時候的供品，沒有這麼香。」' },
      { who: 'chizuru', mood: 'smile', text: '「神明大人收香氣就好。剩下的，請你們吃。」' },
      { who: 'narrator', text: '名冊的最後一頁另有一行：『洛恩大人，遲到兩次，之後從未遲到。』', if: { tier: { who: 'chizuru', min: 3 } } },
      { who: 'narrator', text: '孩子們捧著麵包跑回廣場。千鶴在名冊上，先替明天空了一行。' },
    ],
    summary: '祭典之後，千鶴每晚搖一次鈴；孩子們每天送來的麵包，她都記進奉納的名冊。',
  },
  'ending:safira': {
    lines: [
      { who: 'narrator', place: PL.square, text: '廣場。莎菲拉開了一堂舞蹈課，學生是鎮上的孩子，還有多蘭。' },
      { who: 'narrator', text: '多蘭一個字都沒說，只是從第一步開始，一直跟錯。' },
      { who: 'safira', mood: 'laugh', text: '「多蘭大叔又錯了！沒關係，錯得這麼整齊，也算一種舞呀。」' },
      { who: 'safira', mood: 'wink', text: '「隊伍最後面那個位置，是小洛的唷。站著就好，不用跑。」', if: { tier: { who: 'safira', min: 3 } } },
      { who: 'narrator', text: '孩子們數著拍子轉了一圈。多蘭也轉了，轉的是另一個方向。' },
    ],
    summary: '莎菲拉在廣場開了舞蹈課，學生是孩子們和多蘭；多蘭一句話也沒說，一直跟錯。',
  },
  'ending:sylvie': {
    lines: [
      { who: 'narrator', place: PL.innLot, text: '旅館旁的空地。那棵芽已經長成小樹苗，高到洛恩的膝蓋。' },
      { who: 'narrator', text: '每天早上，希爾薇都替全隊報明天的天氣，準不準另說。' },
      { who: 'sylvie', text: '「明天晴，風從北邊來，曬被子剛好。昨天那場雨沒下，是雲自己走錯路啦。」' },
      { who: 'narrator', text: '她教洛恩看風向，走了幾步，回頭看了看他的腳印。', if: { tier: { who: 'sylvie', min: 3 } } },
      { who: 'sylvie', mood: 'smile', text: '「你現在走路輕多了。像在林子裡待過的人。」', if: { tier: { who: 'sylvie', min: 3 } } },
      { who: 'narrator', text: '小樹苗的葉子晃了一下。她說那是在點頭。' },
    ],
    summary: '那棵芽長成了小樹苗；希爾薇每天早上替全隊報明天的天氣，準不準另說。',
  },
  'ending:noel': {
    lines: [
      { who: 'narrator', place: PL.inn, text: '月影旅館的大廳。諾艾兒每隔幾天去老師的攤子幫忙，今天也是。' },
      { who: 'narrator', text: '在老師面前，她說的是「我」。一進旅館的門，「本小姐」就加倍奉還。' },
      { who: 'noel', mood: 'smug', text: '「本小姐今天替老師算帳，一枚銅板都沒算錯！本小姐的算術，連本小姐都佩服！」' },
      { who: 'noel', mood: 'blush', text: '「稱號定了，『雷光的諾艾兒』。你是第一個聽的，老師是第二個！」', if: { tier: { who: 'noel', min: 3 } } },
      { who: 'narrator', text: '她翻開筆記本，把今天的戰績記上去，字寫得特別大。' },
    ],
    summary: '諾艾兒每隔幾天去老師的攤子幫忙；在老師面前不說「本小姐」，回到旅館加倍說。',
  },
  'ending:bobby': {
    lines: [
      { who: 'narrator', place: PL.forge, text: '鍛造屋。波比在多蘭的爐子旁邊擺了一張修理桌，掛牌寫著『一下下就好』。' },
      { who: 'narrator', text: '排隊的人從早上排到中午。' },
      { who: 'bobby', mood: 'grin', text: '「洛恩哥，劍還你！比八十七下久了一點點，可是當天就還了，記下來！」', if: { tier: { who: 'bobby', min: 3 } } },
      { who: 'bobby', mood: 'excited', text: '「多蘭叔叔！這個門鎖，我拆開看一下下，可以嗎？」' },
      { who: 'doran', text: '「好。」' },
      { who: 'narrator', text: '多蘭回她的那個字，換了。' },
    ],
    summary: '波比在多蘭的鍛造屋旁擺了修理桌，掛牌「一下下就好」；多蘭回她的那個字，從「嗯」變成「好」。',
  },
  'ending:liz': {
    lines: [
      { who: 'narrator', place: PL.shopEvening, text: '傍晚的道具店。莉茲和爸爸輪流顧櫃檯，每天比誰估得準，輸的請吃邊邊烤焦的麵包。', if: { returned: 'orik' } },
      { who: 'liz', mood: 'scheming', text: '「這只壺，爸爸估三枚，我估兩枚半，客人付了兩枚半。今天換爸爸請。」', if: { returned: 'orik' } },
      { who: 'orik', text: '「好好好，丫頭贏了！今天的名目叫『輸家價』，焦的那幾塊最好吃，爸爸先替妳嚐。」', if: { returned: 'orik' } },
      { who: 'narrator', place: PL.shopEvening, text: '傍晚的道具店。莉茲每天都來買一樣小東西，每一樣都跟老闆殺價。', if: { notReturned: 'orik' } },
      { who: 'liz', mood: 'scheming', text: '「一根火柴要兩枚銅板？這價錢我估過了，頂多一枚半啦，老闆。」', if: { notReturned: 'orik' } },
      { who: 'narrator', text: '老闆被殺得很開心，笑著收了錢。那頂紅帽子，還掛在門後。', if: { notReturned: 'orik' } },
      { who: 'narrator', text: '回旅館的路上，她把一枚舊銀幣放在洛恩的手上。', if: { tier: { who: 'liz', min: 3 } } },
      { who: 'liz', mood: 'smile', text: '「這枚換你收著。不估。」', if: { tier: { who: 'liz', min: 3 } } },
      { who: 'narrator', text: '她把錢袋拍得叮噹響，已經在算明天要估什麼。' },
    ],
    summary: '莉茲每天都在道具店裡估價殺價，錢袋又拍得叮噹響了。',
  },
  'ending:scarlet': {
    lines: [
      { who: 'narrator', place: PL.guild, text: '冒險者公會。公會收到一封回信：從要塞撤退密道出來的人，在山的另一邊落了腳，那裡有一位小姐在教孩子拿木劍。' },
      { who: 'narrator', text: '絲嘉蕾讀了三遍，寫了一封『回報』。' },
      { who: 'scarlet', mood: 'serious', text: '「回報：本隊人員齊全，點心充足。完畢。」' },
      { who: 'scarlet', text: '「最後一行，請協助檢查錯字。回報有誤，是我的失職。」', if: { tier: { who: 'scarlet', min: 3 } } },
      { who: 'narrator', text: '那一行寫著：『我現在有同伴，排班的時候，我也算一個。』', if: { tier: { who: 'scarlet', min: 3 } } },
      { who: 'narrator', text: '她把信摺好交給安娜，朝著山的那一邊，敬了一個禮。' },
    ],
    summary: '公會收到一封信：撤退密道出來的人在山的另一邊落了腳；絲嘉蕾讀了三遍，回了一封「回報」。',
  },

  // ---- the walk together (`together`): light, three lines at most; no companion named, since any may not be met yet
  together: {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。洛恩只說出去走走，結果大家全跟了出來，一路吵吵鬧鬧。' },
      { who: 'narrator', text: '走著走著，地上的影子疊成一大團，分不出哪一個是誰的。' },
      { who: 'narrator', text: '走到傳送門廣場的時候，有人說明天也這樣走。沒有人反對，只有葛倫在門邊打了一個很大的呵欠。' },
    ],
    summary: '夜裡大家一起在鎮上走了一段，影子疊成一大團，分不出誰是誰。',
  },

  // ---- bond plan Task 21: the romances (arcs v7). Heavy, twelve lines at most, on the night walk (PL.nightWalk); another
  // companion is there on her own `if.met`, and no one loses anything; Lorne answers in his own way, nine ways (I-205).
  'romance:rin': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。凜走在洛恩旁邊，沒有快半步，也沒有慢半步。' },
      { who: 'narrator', text: '走到廣場，針線攤早就收了。她在空蕩蕩的攤位前停下來。' },
      { who: 'rin', text: '「攤主收攤的時候，把那盒針也帶走了。三十七根，我數過。」' },
      { who: 'rin', mood: 'averted', text: '「那根針，三枚銅板，我到現在還欠著。今晚我想再欠一樣。」' },
      { who: 'hero', text: '「想要什麼？」' },
      { who: 'rin', text: '「我的名字，是我自己挑的。這一個也是。」' },
      { who: 'rin', mood: 'smile', text: '「是你。這一次，我不打算還。」' },
      { who: 'hero', mood: 'smile', text: '「好。我會一直回來，讓妳欠著。」' },
      { who: 'narrator', text: '旅館的屋頂上，希爾薇對著夜空報明天的天氣，沒有往下看。', if: { met: 'sylvie' } },
      { who: 'sylvie', text: '「後半夜起風，往南吹。明天的衣服，曬得乾。」', if: { met: 'sylvie' } },
      { who: 'narrator', text: '凜的手指勾住他的袖口，就沒有再放開。' },
    ],
    summary: '夜路上，凜想再欠一樣東西；這一次，她不打算還。',
  },
  'romance:selene': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。瑟蕾一路上沒有抬頭看星，只看著腳下，和走在身邊的洛恩。' },
      { who: 'selene', mood: 'smile', text: '「今晚不猜窗。猜窗的人，今天放假。」' },
      { who: 'selene', mood: 'wistful', text: '「我一直看得見很遠的地方。看得見結局，卻看不見路上的事。」' },
      { who: 'selene', text: '「今晚我只想看身邊。你在這裡，這件事不用猜。」' },
      { who: 'hero', text: '「每次出門，都回到妳看得見的地方。」' },
      { who: 'selene', mood: 'smile', text: '「那我就不必再看那麼遠了。──這一句，我不收回。」' },
      { who: 'narrator', text: '回頭看，旅館的窗口亮著一盞小小的雷光，正對著他們走的這條路。', if: { met: 'noel' } },
      { who: 'noel', mood: 'pout', text: '「路、路太暗了！本小姐只是順手照一下！」', if: { met: 'noel' } },
      { who: 'selene', mood: 'smile', text: '「她說是順手。可是那盞燈，從我們出門就亮著了呢。」', if: { met: 'noel' } },
      { who: 'narrator', text: '瑟蕾把手放進洛恩的手裡。一路上，她一扇窗也沒有猜。' },
    ],
    summary: '夜路上，瑟蕾不看遠方，只看身邊；說出口的那一句，她不收回。',
  },
  'romance:chizuru': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。走到鎮邊的小祠前，千鶴停下來，搖了一次鈴。' },
      { who: 'chizuru', mood: 'smile', text: '「今晚的鈴，比平常早搖了一刻。洛恩大人，這是我第一次不守時辰。」' },
      { who: 'narrator', text: '遠遠地，廣場那頭傳來莎菲拉數拍子的聲音。', if: { met: 'safira' } },
      { who: 'safira', mood: 'laugh', text: '「最後一次唷～數到八，轉一圈！」', if: { met: 'safira' } },
      { who: 'chizuru', mood: 'solemn', text: '「神主大人等我的那一次，我沒有趕上。」' },
      { who: 'chizuru', text: '「所以我一直想，這一回一定要準時。可是今晚，我想早一點說。」' },
      { who: 'chizuru', mood: 'serious', text: '「往後的每一次集合，我都想第一個看見你──洛恩。」' },
      { who: 'narrator', text: '她叫完，先退了半步，深深行了一禮。' },
      { who: 'chizuru', text: '「失禮了。直接叫名字，我們那時候沒有這種規矩。」' },
      { who: 'hero', mood: 'smile', text: '「下次集合，妳第一個看見的，會是回來的我。叫我的時候，不用行禮。」' },
      { who: 'narrator', text: '她抬起頭，這一次沒有行禮，只是點了點頭。' },
    ],
    summary: '夜路經過小祠，千鶴第一次直接叫了他的名字，叫完先行了一禮。',
  },
  'romance:safira': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。莎菲拉倒退著走在前面，一邊走，一邊哼歌。' },
      { who: 'safira', mood: 'wink', text: '「小洛，今晚地上沒有粉筆腳印唷。要逃的話，現在是好機會。」' },
      { who: 'narrator', text: '洛恩沒有逃。他伸出手，往前跳了一步，只有一步，剛好踩在她的拍子上。' },
      { who: 'safira', mood: 'surprised', text: '「一步就夠了呀。」' },
      { who: 'narrator', text: '遠處傳來絲嘉蕾巡夜的靴子聲，一下一下，正合著拍子。', if: { met: 'scarlet' } },
      { who: 'scarlet', mood: 'serious', text: '「巡夜回報：這一帶一切安全。請繼續。」', if: { met: 'scarlet' } },
      { who: 'safira', mood: 'smile', text: '「我一直在等，有人接上我的拍子。」' },
      { who: 'safira', text: '「原來接上的人，就是一直從我面前跑掉的那一個。」' },
      { who: 'hero', mood: 'smile', text: '「以後不跑了。妳數拍子，我跟著。」' },
      { who: 'safira', mood: 'laugh', text: '「那我數慢一點，慢到你一輩子都跟得上唷。」' },
      { who: 'narrator', text: '她牽起他的手開始數，數到三，跳過了四，兩個人一起笑了出來。' },
    ],
    summary: '夜路上，洛恩第一次自己伸出手，接上了莎菲拉的拍子；只有一步，她說就夠了。',
  },
  'romance:sylvie': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。希爾薇一路都走在下風處。' },
      { who: 'sylvie', text: '「你的腳步聲，在林子裡我也認得出來。聞到湯的味道，它就慢下來。」' },
      { who: 'narrator', text: '旅館的後門開了一條縫，波比探出頭來。', if: { met: 'bobby' } },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，我只是出來倒個水，順便給門軸上點油──」', if: { met: 'bobby' } },
      { who: 'narrator', text: '希爾薇瞪了一眼。門縫馬上關上了。', if: { met: 'bobby' } },
      { who: 'sylvie', text: '「我不太會說，所以只說一次。」' },
      { who: 'sylvie', mood: 'unguarded', text: '「你走在前面也好，走在後面也好。聽得見你的腳步聲，我就睡得著。」' },
      { who: 'hero', mood: 'smile', text: '「我回來的時候，會走大聲一點。」' },
      { who: 'sylvie', mood: 'smile', text: '「別太大聲。吵醒了鳥，牠們會罵你。」' },
      { who: 'narrator', text: '她替他把領口拉高，說是風太冷。' },
    ],
    summary: '夜路上，從不談自己的希爾薇只說了一次：聽得見他的腳步聲，她就睡得著。',
  },
  'romance:noel': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。諾艾兒手心托著一顆小雷光，舉得高高的，照著洛恩的臉。' },
      { who: 'noel', mood: 'smug', text: '「不准動！本小姐在記你的臉。左邊的眉毛，比右邊高一點。」' },
      { who: 'narrator', text: '廣場那頭，莉茲正在跟宵夜攤喊價，整條街都聽得見。', if: { met: 'liz' } },
      { who: 'liz', mood: 'scheming', text: '「三串算兩串！不然我明天去對面買！」', if: { met: 'liz' } },
      { who: 'noel', mood: 'pout', text: '「吵死了，害本小姐數錯了一根睫毛。」', if: { met: 'liz' } },
      { who: 'noel', mood: 'sad', text: '「我以前把好多人的臉都忘了。老師的，還有好多人的。」' },
      { who: 'noel', mood: 'blush', text: '「這一張臉，我不會再忘。」' },
      { who: 'narrator', text: '她說完，張著嘴愣住了。小雷光跟著抖了一下。' },
      { who: 'hero', mood: 'smile', text: '「記不住也沒關係。我天天站到妳面前。」' },
      { who: 'noel', mood: 'blush', text: '「哼、哼！那本小姐就天天記一次。洛恩，明天也要站好！」' },
      { who: 'narrator', text: '小雷光暗了下去。她沒有再點亮，把手縮回去，又伸出來，抓住了他的手指。' },
    ],
    summary: '夜路上，諾艾兒用小雷光照著洛恩的臉，說這一張臉，她不會再忘。',
  },
  'romance:bobby': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。波比的口袋一路叮噹響，裝滿了螺絲。' },
      { who: 'bobby', mood: 'grin', text: '「出門前想說只帶一顆，結果手停不下來。嘿嘿，這是一下下的份量。」' },
      { who: 'narrator', text: '路過鎮邊的小祠，千鶴正好搖響了鈴。', if: { met: 'chizuru' } },
      { who: 'chizuru', mood: 'solemn', text: '「時辰到了。今夜的鈴，也很準。」', if: { met: 'chizuru' } },
      { who: 'bobby', mood: 'serious', text: '「最底下那個燈芯，是我修的。修的時候，我一直只想著一件事。」' },
      { who: 'bobby', text: '「你不用再一個人燒到最後了。有我。」' },
      { who: 'narrator', text: '她說完，自己先紅了臉，張口試著換一個叫法。' },
      { who: 'bobby', mood: 'blush', text: '「洛恩──好像少了一顆螺絲。還是洛恩哥，鎖得比較緊。」' },
      { who: 'hero', mood: 'smile', text: '「那就都不修。我們兩個，就這樣。」' },
      { who: 'bobby', mood: 'smile', text: '「嗯。一顆螺絲都不動。」' },
      { who: 'narrator', text: '她從口袋裡挑了一顆最亮的螺絲，放進他的手心。' },
    ],
    summary: '夜路上，波比說燈芯是她修的；他不用再一個人燒到最後了。',
  },
  'romance:liz': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。莉茲從懷裡掏出一張紙，攤在街燈底下。' },
      { who: 'liz', mood: 'scheming', text: '「老大，簽個合約吧。我熬了三個晚上寫的，條款比公會的還多。」' },
      { who: 'narrator', text: '紙的最上面寫著：『合夥一輩子。雙方同意。』價錢那一欄空著。' },
      { who: 'liz', mood: 'hushed', text: '「這一份，我不寫價錢。」' },
      { who: 'liz', text: '「第二條：以後誰先到家，誰就在門口等。這一條，不准改。」' },
      { who: 'hero', mood: 'smile', text: '「價錢那一欄，我也不填。」' },
      { who: 'narrator', text: '洛恩在最下面簽了名。莉茲看了很久，把紙摺好，收進懷裡。' },
      { who: 'narrator', text: '遠處的街口，絲嘉蕾停下巡夜的腳步，行了一個騎士禮。', if: { met: 'scarlet' } },
      { who: 'scarlet', mood: 'smile', text: '「以騎士的名譽保證，這份合約，我看見了。」', if: { met: 'scarlet' } },
      { who: 'liz', mood: 'smile', text: '「騎士大姊當見證人，不收費。老大，這下你跑不掉啦。」', if: { met: 'scarlet' } },
      { who: 'narrator', text: '她勾著他的手臂往前走，一路都在算，算出來的數字一個也沒說。' },
    ],
    summary: '夜路上，莉茲拿出一份合夥一輩子的合約；價錢那一欄，兩個人都沒有填。',
  },
  'romance:scarlet': {
    lines: [
      { who: 'narrator', place: PL.nightWalk, text: '鎮上的夜路。絲嘉蕾沒有穿鎧甲，手裡拿著一張勤務表和一支筆。' },
      { who: 'scarlet', text: '「洛恩，今晚我請了假。照勤務表請的，假單一式兩份。」' },
      { who: 'narrator', text: '表上每一格都填滿了，只剩最下面一格，標題寫著『往後』，底下空著。' },
      { who: 'scarlet', mood: 'serious', text: '「我替所有人排過班。只有這一格，我不會排。」' },
      { who: 'scarlet', text: '「這一次，換你下令。」' },
      { who: 'narrator', text: '洛恩接過筆，寫了一行：『命令：往後每一天的點心，由絲嘉蕾先挑。』' },
      { who: 'narrator', text: '她讀了兩遍，笑了。' },
      { who: 'scarlet', mood: 'smile', text: '「遵命。這是我收過最難的命令。」' },
      { who: 'narrator', text: '街角傳來莉茲的聲音。', if: { met: 'liz' } },
      { who: 'liz', mood: 'scheming', text: '「騎士大姊！今晚請假的點心錢，照樣算公帳啦！」', if: { met: 'liz' } },
      { who: 'narrator', text: '絲嘉蕾在命令底下補了一行『執行時，洛恩陪同』，把筆收進懷裡。' },
    ],
    summary: '夜路上，絲嘉蕾把勤務表和筆交給洛恩：只有「往後」那一格，她不會排。',
  },
};

/** Two town lines for the one chosen (plan ruling 13), added to the town's pool under her name once she is chosen. */
// bond plan Task 21: light; plain text (the town adds her name); none needs her after-story heard first
export const ROMANCE_LINES: Partial<Record<Companion, string[]>> = {
  rin: ['你的斗篷又破了一處，我來縫。這一次，我不數針。', '今天走慢一點吧。不是累了，是想走慢一點。'],
  selene: ['明天要做的事，我寫好了：和洛恩吃晚飯。這一個，我想打勾呢。', '我又猜錯了一扇窗。你笑得比我還大聲。'],
  chizuru: ['洛恩大人，今日的集合，我又早到了一刻。我們那時候，這叫用心。', '城裡最近流行兩個人一起散步。這個新規矩，我很喜歡。'],
  safira: ['小洛！今天的節目，觀眾只有你一個唷～', '我數一，你接二。接錯了也沒關係呀，再來一次。'],
  sylvie: ['明天有雨。你那件外套，我先收進來了。', '你的腳步聲今天比較重。是不是又沒吃飯？'],
  noel: ['本小姐的筆記又多了一頁，全部是你的臉。不准偷看！', '小雷光今晚也替你照路。收費的，你付一句晚安就好。'],
  bobby: ['洛恩哥，今天我修了三樣東西！你不算在裡面，嘿嘿。', '洛恩哥口袋裡那顆螺絲，還在吧？不能用，只是帶著喔。'],
  liz: ['老大，合約第三條：晚飯一起吃。不收錢，可是不准缺席。', '今天的帳對完了。我們兩個，又多賺了一天！'],
  scarlet: ['回報：今日點心，已由我先挑。洛恩的那一份，我也挑好了。', '今晚第二班是我。請陪我一起站，這次不是命令。'],
};
