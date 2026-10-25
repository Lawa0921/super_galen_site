import type { GiftId } from '../engine/types';
import type { Companion } from './story/bond';
import type { SceneId } from './story/scenes';
import type { SceneLine } from './story.zh-TW';

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
export const BOND_SCENES: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>> = {};

/** Two town lines for the one chosen (plan ruling 13), added to the town's pool under her name once she is chosen. */
export const ROMANCE_LINES: Partial<Record<Companion, string[]>> = {};
