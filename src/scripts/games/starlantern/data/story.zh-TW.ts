// Story copy (zh-TW): the script plan 6c wrote. Read the style bible and the lore ledger before changing a line.
import type { CharacterId } from '../engine/types';
import { MOODS_OF, type StoryMood } from '../render/artPaths';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { MEETINGS, type Meetable } from './meetings';
import { numeral } from './numeral';
import { CHAINS, type MoonPhase, type Season } from './story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from './story/fragments';
import { PL, type Place } from './story/places';
import type { BondTier, Companion, Tone } from './story/bond';
import { ACT_NODES, BANTER_COUNT, BANTER_PAIRS, BONDS_WRITTEN, CHAT_COUNT, ENDINGS_WRITTEN, type GroupScene, HOME_OWNERS, type HomeOwner, MAJOR_SCENES, type MajorScene, REACTIONS, ROMANCES_WRITTEN, SEASON_SCENES, TOGETHER_WRITTEN, banterScene, banterTwo, bondScene, homeScene, memScene, type SceneId, type Stage } from './story/scenes';
import { BOND_SCENES } from './bond.zh-TW';

export type NpcId = 'anna' | 'orik' | 'marta' | 'glen' | 'doran' | 'merchant' | 'bellkeeper';
export const NPC_NAMES: Record<NpcId, string> = {
  anna: '安娜', orik: '歐里克', marta: '瑪莎', glen: '葛倫', doran: '多蘭', merchant: '流浪商人', bellkeeper: '鐘守',
};

export type Speaker = CharacterId | NpcId | 'narrator';
export type { Place } from './story/places';
export interface ScriptLine {
  who: Speaker; mood?: StoryMood; text: string;
  /**
   * The line happens in a memory's remembered past (story staging S5): only these wear the memory look (the sepia veil,
   * the dimmed box). A memory's present lines (Lorne's 「想起什麼了？」, her answer now) look like any other scene's.
   */
  past?: true;
  /**
   * Where the scene is from this line on (story staging S6): the card's one line, `place・time`, and `night` to dim the
   * screen. Set on the line whose narration names the place; a later line's place replaces it.
   */
  place?: Place;
  /**
   * `full`: that person's memories are all found; `notFull`: not yet (a chat can play before or after her last piece).
   * `oath`: Rin has made her choice (`true`) or has not yet (`false`).
   * `returned`: that townsfolk fragment has been given back; `notReturned`: not yet (Liz's last piece reads both ways).
   * `seen`: that scene has been seen; `notSeen`: not yet (story depth: a line that waits on a scene, or stands in for it).
   * `tier`: that companion's bond is at least that tier (bond plan Task 7; `LineWhen.tiers`).
   */
  if?: {
    met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId; notReturned?: TownFragmentId; full?: CharacterId; notFull?: CharacterId; oath?: boolean;
    seen?: SceneId; notSeen?: SceneId; tier?: { who: Companion; min: BondTier };
  };
}

/**
 * One way Lorne says it in a bond scene (spec §7.2, §7.3): its tone, his line (in 「」) or his action (in （）), at most
 * CHOICE_MAX_CHARS, and the 1 to 2 lines that follow it.
 */
export interface Choice { tone: Tone; text: string; reply: ScriptLine[] }
/** A fork in a bond scene (spec §7.3): Lorne picks one of 2 to 3 ways to say the same care. Never filtered by `if`. */
export interface ChoiceLine { who: 'hero'; choices: Choice[] }
/** A line of a scene as written: a plain line, or a choice (bond scenes only). */
export type SceneLine = ScriptLine | ChoiceLine;
/** The longest a choice's text may be (spec §0 D13): it is a 12px menu row. */
export const CHOICE_MAX_CHARS = 20;
export const isChoice = (l: SceneLine): l is ChoiceLine => 'choices' in l;
/** How many lines a scene plays at worst (spec §7.3): each line one, a choice one and then its longest reply. */
export const worstCount = (lines: readonly SceneLine[]): number =>
  lines.reduce((n, l) => n + (isChoice(l) ? 1 + Math.max(0, ...l.choices.map((c) => c.reply.length)) : 1), 0);
/**
 * Every line as the gates read it (bond plan Task 7): a choice opened into each of its texts, said by Lorne, followed by that
 * choice's reply. A scene with no choice is its own lines.
 */
export const flatLines = (lines: readonly SceneLine[]): ScriptLine[] =>
  lines.flatMap((l) => (isChoice(l) ? l.choices.flatMap((c): ScriptLine[] => [{ who: 'hero', text: c.text }, ...c.reply]) : [l]));

/** A line of the bellkeeper's pool in town (story depth Task 4): `returned`, once that townsfolk fragment is back. */
export interface KeeperLine { text: string; if?: { returned?: TownFragmentId } }

/**
 * What a scene's conditions are checked against. `seen` is the save's seen scenes; left out, nothing counts as seen (the one
 * caller in play, `ui2/story.ts`, always gives it; tests and the handbook readers that do not name it read it as empty).
 */
export interface LineWhen {
  met: CharacterId[]; full: CharacterId[]; returned: TownFragmentId[]; oath: boolean; seen?: SceneId[];
  /** Each companion's bond tier (bond plan Task 7); one left out, or no `tiers` at all, reads as 0. */
  tiers?: Partial<Record<Companion, BondTier>>;
}

/** The lines that play: every line whose conditions all hold (a line with none always plays, and so does a choice). */
export function linesWhen<L extends SceneLine>(lines: readonly L[], w: LineWhen): L[] {
  return lines.filter((l) => {
    if (isChoice(l)) return true;
    const c = l.if;
    if (!c) return true;
    if (c.met && !w.met.includes(c.met)) return false;
    if (c.notMet && w.met.includes(c.notMet)) return false;
    if (c.returned && !w.returned.includes(c.returned)) return false;
    if (c.notReturned && w.returned.includes(c.notReturned)) return false;
    if (c.full && !w.full.includes(c.full)) return false;
    if (c.notFull && w.full.includes(c.notFull)) return false;
    if (c.oath !== undefined && c.oath !== w.oath) return false;
    if (c.seen && !(w.seen ?? []).includes(c.seen)) return false;
    if (c.notSeen && (w.seen ?? []).includes(c.notSeen)) return false;
    if (c.tier && (w.tiers?.[c.tier.who] ?? 0) < c.tier.min) return false;
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
// `numeral` lives in its own module so the interface text can use it without importing the script (story polish Task 4:
// text.zh-TW -> story.zh-TW -> artPaths -> skills -> text.zh-TW would be a cycle); the script re-exports it.
export { numeral } from './numeral';

const MAJOR_TITLES: Record<MajorScene, string> = {
  prologue: '序章', 'prologue-inn': '序章・旅館的第一夜', 'first-return': '回城的那一夜', 'act1-after': '第一幕・之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', 'rin-confess': '凜的坦白', 'bellkeeper-arrives': '鐘守來到鎮上', 'hero-alone': '一個人的清晨', 'finale-eve': '下潛前的那一夜', finale: '終幕',
  epilogue: '星燈祭',
};
/** Story L spec §5.1: what each group scene is called in the handbook, on its act's truth page after the act. */
export const GROUP_TITLES: Record<GroupScene, string> = {
  'group:act2': '第二幕之後・碎片的價錢', 'group:act3': '第三幕之後・問不問', 'group:act4': '第四幕之後・桌上的錢袋',
};
/** What each homecoming is called in the handbook, after her name (continuity fix 2). */
const HOME_TITLES: Record<HomeOwner, string> = { chizuru: '鎮邊的小祠', safira: '廣場上的最後一支舞', sylvie: '窗外的新芽', liz: '店門口' };
/** Time and moon ruling 7: what each season's scene is called in the handbook, after Chizuru's name (her page). */
export const SEASON_TITLES: Partial<Record<Season, string>> = { spring: '春祭' };

type Written = { lines: ScriptLine[]; summary: string };
const N = (text: string, oath?: boolean): ScriptLine => (oath === undefined ? { who: 'narrator', text } : { who: 'narrator', text, if: { oath } });
/** Narration of a memory's remembered past (story staging S5): `N` with `past`. */
const NP = (text: string): ScriptLine => ({ who: 'narrator', text, past: true });
/** `line`, with the scene's location card from it on (story staging S6). */
const at = (place: Place, line: ScriptLine): ScriptLine => ({ ...line, place });
/** Story L plan ruling 3: the night's card, over a return's memories (the owed ones before the day's scene, and the night's). */
export const NIGHT_PLACE: Place = PL.innNight;
/** 【控制者裁定 2026-10-24】 The card the dawn before departure tells its one memory under. */
export const DAWN_PLACE: Place = PL.innDawn;

/**
 * Story L spec §4.4.1: the beats between two memories of a night, in their fixed order (the companions by `CHARACTER_IDS`,
 * six each, Selene eight, then twelve of narration). `engine/story/nights.ts` `nextBeat` walks it from the save's cursor (`story.beat`).
 */
export interface NightBeats { lines: NightBeat[] }
/**
 * Story L Task 8 (cold read): a beat's tone. `quiet` (a warm drink, a door kept, a night sound, a small touch) may follow any
 * memory; `lively` (a joke, a show-off, clapping) only a warm one (`engine/story/nights.ts` `nextBeat`). The written pool
 * tags every line; a line with no tone (a test's pool) fits either.
 */
export type BeatTone = 'quiet' | 'lively';
/**
 * Time and moon ruling 10: `moon`, the nights a beat fits (`tonightMoon`): a line that speaks of the moon or its light says
 * which, and the cursor passes it over on any other night, not used up. No `moon`: any night.
 */
export interface NightBeat extends ScriptLine { tone?: BeatTone; moon?: MoonPhase[] }
/**
 * The night's beats (story L Task 8; style bible §1.3.1; lore ledger I-191, I-201). Each companion has six (Selene eight:
 * time and moon ruling 10), in `CHARACTER_IDS` order, then twelve of the deep night. A line that speaks of the moon carries
 * the nights it fits (`moon`). Each line carries its tone (cold read, 2026-10-24): `quiet` (a drink, a door kept, a night
 * sound, a small touch) may follow any memory; `lively` (a joke, a show-off, clapping) only a warm one. None touches what a
 * memory told, says 你 or 妳 to whoever told it, names another companion (anyone may not be met yet), or leans on a stage
 * or on Rin's choice.
 */
const Q = (who: CharacterId, text: string, mood?: StoryMood): NightBeat => ({ who, text, tone: 'quiet', ...(mood ? { mood } : {}) });
const J = (who: CharacterId, text: string, mood?: StoryMood): NightBeat => ({ who, text, tone: 'lively', ...(mood ? { mood } : {}) });
const QN = (text: string): NightBeat => ({ who: 'narrator', text, tone: 'quiet' });
/** Time and moon ruling 10: a beat that speaks of the moon, for the nights under one of `moon`. */
const UNDER = (moon: MoonPhase[], l: NightBeat): NightBeat => ({ ...l, moon });
/** The moon is up: any night but the new moon's. */
const LIT: MoonPhase[] = ['waxing', 'full', 'waning'];
export const NIGHT_BEATS: NightBeats = {
  lines: [
    // Noel: loud by day; at night a kindness she will not own
    J('noel', '「本小姐在畫樓下那隻貓，叫牠雷獸大人！牠剛才打了個呵欠，很有威嚴！」', 'smug'),
    Q('noel', '「哼，本小姐才沒有在聽。只是剛好睡不著，剛好坐在這裡而已。」', 'pout'),
    Q('noel', '「手帕借妳──借你──哎，誰要就拿去。本小姐才不是特地帶的。」', 'panic'),
    Q('noel', '「燈太暗了，本小姐點一盞小雷光。很小的，不會吵到人。」'),
    Q('noel', '「說完了？那本小姐的厲害事蹟就留到明天講。今晚……先不搶了。」', 'pout'),
    Q('noel', '「本小姐要睡了。睡著之前，誰都不准先走。」', 'blush'),
    // Chizuru: the rites of her shrine, kept in a room at the inn; and the year she fell asleep in
    J('chizuru', '「近來的被子真輕。我們那時候，冬天得壓三層棉被，翻身前還得先跟神明打聲招呼。」', 'bewildered'),
    J('chizuru', '「鎮上的守夜人，最近改敲梆子了？去年還是打鼓的。」', 'bewildered'),
    Q('chizuru', '「香點上了。煙直直往上升，今晚屋裡很靜。」', 'solemn'),
    Q('chizuru', '「我摺了一張護符，放在枕邊。說過心事的人，夜裡要有東西守著。」'),
    Q('chizuru', '「我在紙上記下今天的日子。一天一道，明天再添一道。」'),
    Q('chizuru', '「容我合掌一次。說出口的心裡話，要有人替它收好，這是我們那裡的規矩。」', 'solemn'),
    // Liz: a price on everything but one
    J('liz', '「瑪莎說這張床墊值三枚銀幣。我躺過了，頂多兩枚，明天找她殺價。」', 'scheming'),
    J('liz', '「宵夜的麵包我先收起來了。不是要賣，是怕明天有人肚子餓──好啦，算你們便宜。」', 'scheming'),
    Q('liz', '「這杯熱的不算錢。今晚的帳，我先劃掉。」'),
    Q('liz', '「我在數今天的銅板。數錢的聲音，比較好睡。」'),
    Q('liz', '「這盞燈的油我算過了，還能點到半夜。點著吧，不心疼。」'),
    Q('liz', '「聽完要付錢嗎？不用啦。這種東西，我估不出價。」', 'hushed'),
    // Sylvie: she reads the night; the wind, the insects, the tracks
    J('sylvie', '「瑪莎的湯鹹了一點。明天下去前多裝一袋水，不然走到第三層就有人喊渴。」'),
    Q('sylvie', '「窗縫在灌冷風，我拿布塞起來了。誰再打開，自己去睡走廊。」'),
    Q('sylvie', '「多的被子在櫃子最下面。半夜會變冷，蓋好再睡。」'),
    Q('sylvie', '「風停了，外頭安靜得很。明天是好天氣。」', 'alert'),
    Q('sylvie', '「後院有腳印，小小的一串，是貓。不用管牠。」', 'alert'),
    Q('sylvie', '「外面的貓頭鷹還在叫，代表附近沒東西在走動。安心睡啦。」'),
    // Scarlet: a soldier's watch, kept to the letter
    J('scarlet', '「盾已經擦了三遍。再擦一遍，應該就能拿來當鏡子用。」', 'serious'),
    Q('scarlet', '「門閂檢查了三次，三次都很牢。回報完畢。」', 'serious'),
    Q('scarlet', '「靴子擺在門邊了，鞋尖朝外。有事的話，我穿上就能走。」', 'serious'),
    Q('scarlet', '「我聽到了。這些話我會守著，一個字也不會傳出去。」', 'serious'),
    Q('scarlet', '「下一班守夜是我。蠟燭剪短了，剛好點到換班。」'),
    Q('scarlet', '「說完了就請休息。門口由我負責，今晚沒有任何東西進得來。」'),
    // Selene: the moon says it, and then she takes it back. Time and moon ruling 10: each line that sees the moon keeps to
    // the nights it is up (the waning one only to its own); the new moon has her a line of its own, and so has the full.
    UNDER(['waning'], J('selene', '「今晚的月亮缺了右邊一半。不是壞兆頭──大概不是。」', 'foresee')),
    UNDER(LIT, J('selene', '「月亮往西邊走了一點。今晚大家都睡得著──啊，這句不算。」', 'foresee')),
    UNDER(LIT, Q('selene', '「月亮剛才也在聽。它不會說出去的，我也不會呢。」', 'smile')),
    UNDER(LIT, Q('selene', '「我把窗簾拉開一點。月光照進來，比燈溫柔。」', 'wistful')),
    Q('selene', '「我在窗邊數星星，數到一半，忘了數到哪裡。這不算預言，請別記下來。」', 'wistful'),
    UNDER(LIT, Q('selene', '「今晚的月亮，適合說話。說完了，也適合睡覺。」')),
    UNDER(['new'], Q('selene', '「今晚月亮請假了。那就由我替它聽著，只聽不讀。」', 'smile')),
    UNDER(['full'], Q('selene', '「月亮好亮，亮得什麼都讀得出來。今晚不讀了，看大家就好。」', 'smile')),
    // Safira: on the beat, even sitting down
    J('safira', '「睡不著？那來跳一小段啊──不跳？坐著打拍子也算喔。」', 'wink'),
    J('safira', '「一、二──小洛，你的腳在桌子底下跟著拍子，我看見了喔。」', 'laugh'),
    Q('safira', '「說完啦？最後一拍，我輕輕敲在桌上，就當收尾。」', 'smile'),
    Q('safira', '「這一段停在這裡，剛剛好。下一拍，誰想接都可以喔。」', 'smile'),
    Q('safira', '「我坐這裡，不吵你們。今晚我的腳也想休息一下。」'),
    Q('safira', '「一、二、三──數到八就會想睡了。我小時候都這樣數。」', 'smile'),
    // Bobby: out loud, one step after another
    J('bobby', '「我把瑪莎的湯勺改好了，攪一下會自己轉三圈喔！等一下下，我拿給大家看！」', 'excited'),
    J('bobby', '「這扇窗會叫，是因為鉸鏈乾了。先上油，再把螺絲鎖緊，然後──對了，然後是去睡覺。」', 'focused'),
    Q('bobby', '「我把蠟燭的芯剪平了。火不跳，影子就不晃，大家比較好睡。」', 'focused'),
    Q('bobby', '「聽完以後，我腦袋裡的齒輪轉得好慢。先讓它停一下下，等它自己轉回來。」'),
    Q('bobby', '「我小聲一點收工具。一支一支放回去，不會吵到人。」'),
    Q('bobby', '「洛恩哥，我想好要說什麼了。第一件，說出來的人很厲害。第二件……我還在想。」', 'grin'),
    // the deep night itself
    QN('樓下的貓跳上窗台，在玻璃上按了兩個梅花印，又跳下去了。'),
    QN('瑪莎提著燈走過走廊，在每一扇門前停一下，聽聽裡面還有沒有聲音。'),
    QN('遠處傳來守夜人的梆子，敲了兩下。鎮上的窗戶又暗了一扇。'),
    QN('風把窗框吹得喀喀響，桌上的燈火跟著歪了一下。'),
    QN('爐火裡的柴塌了一塊，火星往上竄了一下，又安靜下來。'),
    QN('樓梯的第三階吱了一聲。不知道是誰下樓倒水，還是那隻貓。'),
    QN('窗外下起小雨，打在屋簷上，一滴一滴，不急不慢。'),
    QN('走廊盡頭，瑪莎的房門底下還透著光，筆尖沙沙地響。'),
    QN('隔壁房的鼾聲停了一下，又接上了。'),
    QN('桌上的茶涼了，杯緣留著一圈淡淡的水痕。'),
    UNDER(LIT, QN('月光從窗縫斜斜照進來，落在地板上，慢慢挪了一寸。')),
    QN('有人把一條毯子輕輕搭在椅背上，又走開了。'),
  ],
};

/** The finished script, scene by scene (plan 6c). Read the style bible and the lore ledger before adding to it. */
const SCRIPT: Partial<Record<SceneId, Written>> = {
  // Task 4: the prologue (spec §9.2, §3.3, §4).
  prologue: {
    lines: [
      at(PL.plazaPredawn, N('黎明前的傳送門廣場。迷宮吐出的霧──鎮上叫它暮霧──貼著石板流動，西邊高地上的星燈淡得像殘燭。')),
      { who: 'glen', text: '「喂，醒醒！這身灰，只有深處才沾得到。」' },
      { who: 'glen', text: '「別光看，去叫安娜！門自己亮了，這小子把那女孩拖了出來，走了三步就倒了，還扣著她的手腕不放。」' },
      at(PL.guild, N('冒險者公會。安娜攤開一張失憶登記表：找到的地點、身上的東西、記得的最後一句話。')),
      { who: 'anna', text: '「身上只有一把刻著怪紋路的劍。你醒來以後，嘴裡一直念著一個『洛』字。」' },
      { who: 'hero', mood: 'normal', text: '「洛……就這樣。後面那個字，大概掉在下面了。」' },
      { who: 'anna', text: '「那就叫你洛恩吧。名字總要有一個，回來的時候，才有人喊得出來。」' },
      { who: 'anna', text: '「妳的刀柄上也刻了一個字：『凜』。認得嗎？」' },
      { who: 'rin', mood: 'guarded', text: '「不認得。名字總要有一個，就它了。」' },
      N('凜把短刃收回鞘裡。安娜遞來的熱茶還冒著煙，她一口就喝乾了，眉頭也沒皺。'),
      { who: 'anna', text: '「回復藥五瓶，歸還之燈一盞，先記在公會的帳上。茶不用記。在下面迷路了就點燈，星燈會把你們拉回來。」' },
      N('從那天起，鎮上的人叫他「歸來者」──唯一從迷宮深處走出來的人。'),
    ],
    summary: '黎明的傳送門廣場倒著兩個失憶的人。安娜替他取名洛恩，凜則用刀柄上的字當名字。他是唯一從深處走出來的人。',
  },
  // Task 10b: why the two of them go down together (lore ledger I-81 to I-86). The first night, before the town is the
  // player's: the grip, each other's only lead, one lamp, the debt, and the pull she takes for instinct (her 7th piece pays it).
  'prologue-inn': {
    lines: [
      at(PL.innDeepNight, N('深夜的月影旅館。洛恩從夢裡驚醒，窗邊的凜還睜著眼，臉朝著他的床。他翻個身，她的眼睛就跟著動。')),
      N('她手腕上還留著一圈發青的指痕。洛恩昏過去以後，那幾根手指還扣著，葛倫掰了很久才掰開。他悄悄把手縮回被子裡。'),
      { who: 'hero', mood: 'normal', text: '「我們是一起被撿回來的吧？那妳該不會認識以前的我？」' },
      { who: 'rin', mood: 'guarded', text: '「不認識。我什麼都不記得，現在只能跟著你。你說了三次夢話，很吵。」' },
      { who: 'hero', mood: 'serious', text: '「明天我再下去。我怎麼會從下面走出來，答案總不會自己爬上來。欠公會的錢，也得撿碎片來還。」' },
      { who: 'rin', mood: 'normal', text: '「我跟你去。」' },
      { who: 'hero', mood: 'surprised', text: '「為什麼？妳不是嫌我吵？」' },
      { who: 'rin', mood: 'serious', text: '「公會只發了一盞燈。你一個人下去回不來，我也回不來。」' },
      { who: 'rin', mood: 'sad', text: '「吵是吵。反正我能去的地方，也只剩迷宮了。」' },
      { who: 'hero', mood: 'smile', text: '「好。那夢話我盡量小聲。」' },
    ],
    summary: '旅館的第一夜。兩人都欠著公會，什麼都不記得，只能跟著彼此。公會只發了一盞燈，兩個人決定一起下去。',
  },
  // Task 10b: the return after the first fight Rin won in (not always the first return). Her first trust in a fight,
  // mirrored on his grip; she will not take thanks. Nothing here says "first": an earlier return may have played a chat.
  'first-return': {
    lines: [
      at(PL.innNight, N('月影旅館。從迷宮回來的那一晚，洛恩替自己的手臂纏繃帶。纏了三圈，鬆了兩圈。')),
      N('下面那一擊，本來會正中他的胸口。是凜撲過來，抓住他的手腕，往後一扯。'),
      { who: 'hero', mood: 'smile', text: '「那一下，謝了。妳的手比我快。」' },
      { who: 'rin', mood: 'guarded', text: '「不用謝。身體自己動的，用想的就來不及了。」' },
      N('她看著自己那隻手，像是不認得它。指尖碰到領口的小銅鐘，停了一下，才收回來。'),
      { who: 'rin', mood: 'normal', text: '「另外，那個繃帶纏成那樣，不如不纏。」' },
      N('她拆掉繃帶，三兩下重新纏好。緊得洛恩倒吸了一口氣。'),
      { who: 'hero', mood: 'surprised', text: '「這是包紮，還是報仇？」' },
      { who: 'rin', mood: 'normal', text: '「太鬆會掉。太緊是故意的。」' },
    ],
    summary: '從迷宮回來的那一晚。下面那一擊，是凜把洛恩拉開的。她說身體自己動的，又嫌他繃帶纏得太醜。',
  },
  // Task 4: Rin's seven memories (spec §5, §5.1, §3.6). Pieces 1–2 warm and a little off, 3–5 cold, 6–7 heavy.
  'mem:rin:1': {
    lines: [
      NP('石板路的盡頭有一座鐘樓。小女孩每天坐在台階上，等那口大鐘響。'),
      NP('「它不會響的。」大人們笑著摸她的頭，「它要是響了，我們就有工作了。」'),
      { who: 'rin', text: '「一座很大的鐘，從來不響。我好像每天都坐在下面等它。」' },
      N('她抬頭看了一眼，好像在等誰的手放上來。'),
    ],
    summary: '凜想起鐘樓下的童年。那口大鐘從來不響；大人說，它響了才有工作。',
  },
  'mem:rin:2': {
    lines: [
      NP('冬天的院子。木樁上畫著一個圓，有人把細針放進她手心：「來玩遊戲。丟中了，晚上有湯喝。」'),
      NP('她丟到天黑，手指凍得發紫。那晚的湯好燙，她捧著碗，一口一口全喝完了。'),
      { who: 'hero', text: '「妳丟針的準頭，是那時候練的？」' },
      { who: 'rin', mood: 'smile', text: '「嗯。那是遊戲。……湯很燙，很好喝。」' },
    ],
    summary: '凜想起冬天丟針的「遊戲」，和丟中之後那碗很燙的湯。',
  },
  'mem:rin:3': {
    lines: [
      NP('燭火前，有人用兩根手指撐開她的眼皮：「不准眨。眨一次，目標就不見了。」'),
      NP('她盯著火，直到眼淚流乾、火光變成一片白。旁邊的人只說：「再一次。」'),
      { who: 'rin', mood: 'serious', text: '「難怪我打架都不眨眼。」' },
      { who: 'hero', mood: 'normal', text: '「那妳現在眨一下。」' },
      N('凜瞪著他，撐了三秒，眨了一下。然後又眨了一下，像在確認這件事可以做。'),
    ],
    summary: '凜想起不准眨眼的訓練。洛恩要她現在眨一下，她撐了三秒，眨了。',
  },
  'mem:rin:4': {
    lines: [
      // Story depth ruling (a): the list is copied from the order's old book; only its last line is the master's (I-09).
      NP('一張泛黃的名單，抄自一本更舊的書。抄來的名字都劃著線，只有最後一道，是師父很多年前自己劃的，劃得很深。'),
      NP('師父擱下筆：「從深處走出來的，不是人，是迷宮的意志。它走到哪裡，暮霧就跟到哪裡。」'),
      { who: 'rin', mood: 'averted', text: '「名單上的人，我一個都不認得。……一個都不。」' },
      N('洛恩問她怎麼了。她說沒事，第一次沒有看著他的眼睛回答。'),
    ],
    summary: '凜想起被劃掉的名單和師父的話：從深處走出來的，不是人。她開始避開洛恩的視線。',
  },
  'mem:rin:5': {
    lines: [
      NP('荒野裡，一扇半埋在土中的石門，門縫終日吐著霧。她被派到那裡，一個人。'),
      NP('「守著這扇門。」師父說，「鐘響的那天，妳就會知道該做什麼。」'),
      { who: 'rin', mood: 'averted', text: '「我在那裡等了很久。等的是什麼……還想不起來。」' },
      N('她說得很平靜，握著短刃的手卻在發抖。洛恩看見了，什麼也沒問。'),
    ],
    summary: '凜想起自己被派去守一扇吐霧的石門，等著某一天鐘響。',
  },
  'mem:rin:6': {
    lines: [
      NP('守門的第幾年，她已經數不清了。那天夜裡，遠方那座從不響的鐘響了，領口的小銅鐘也跟著響。'),
      NP('她想起臨行前，師父替她扣上銅鐘：「靜鐘會的信物。它響了，就是時候了。」'),
      NP('師父把短刃交到她手上：「『凜』是妳的代號。鐘響了，就去殺那個從深處走出來的人。」'),
      { who: 'rin', mood: 'averted', text: '「別看我……一下就好。」' },
    ],
    summary: '鐘自己響了。「凜」是刺客的代號；她的任務，是殺死從深處走出來的人。',
  },
  'mem:rin:7': {
    lines: [
      NP('鐘響了三天，石門卻什麼也沒走出來。她握緊短刃，自己走進了迷宮。'),
      NP('她在深處找到了他。那人渾身是灰，拖著一把刻滿紋路的劍，一步一步往上走。'),
      NP('她跟在後面，跟了好幾層。他沒發現她，像是只看得見頭頂那一點光。'),
      NP('出口就在前面。她拔出短刃，刀尖離他的後頸，只剩一個呼吸的距離。'),
      NP('就在那一瞬間，暮霧從四面八方湧上來。白色吞掉了光，吞掉了路，也吞掉了她記得的一切。'),
      NP('最後剩下的，是一隻手。有人在霧裡抓住她的手腕，把她往光的方向拉。'),
      { who: 'rin', mood: 'surprised', text: '「那把劍上的紋路，我看過。」' },
      { who: 'hero', mood: 'serious', text: '「凜？妳想起什麼了？」' },
      { who: 'rin', mood: 'sad', text: '「霧裡抓住我的那隻手……是你的。」' },
      { who: 'rin', mood: 'sad', text: '「我追了那麼多層，追的那個人，原來是──」' },
      { who: 'hero', mood: 'serious', text: '「凜，等等──」' },
      N('她退了一步，又一步。短刃還在鞘裡，她的手卻一直握著刀柄，沒有放開。'),
    ],
    summary: '凜想起她追進迷宮，在出口前和目標一起被暮霧吞沒。那個人，就是洛恩。',
  },
  // Task 5: the act nodes (spec §8.4, §8.5, §3.4, §3.6). Each plays in the town, the first return after its depth.
  'act1-after': {
    lines: [
      N('三天後的清晨。暮霧從傳送門的方向漫回來，貼著石板，流進鎮上每一條巷子。'),
      N('西邊高地上，星燈的光柱還亮著，卻比打倒燈喰之獸以前更暗了。'),
      { who: 'glen', text: '「霧散了才三天，又回來了。小子，別洩氣，門還開著。」' },
    ],
    summary: '燈喰之獸倒下三天後，暮霧又回來了。星燈的光，比以前更暗。',
  },
  act2: {
    lines: [
      at(PL.guild, N('冒險者公會。洛恩把一塊石頭擱上櫃台，是他在本道第四層的牆上敲了一整個下午才敲下來的。')),
      N('石頭裡有光，細得像葉脈。安娜把它翻過來，又翻回去，光都往同一邊流──往下。其中幾條，是灰的。'),
      { who: 'anna', text: '「這紋路，星燈的基座上也有。我每年替公會上去擦一次，擦到閉著眼睛都畫得出來。」' },
      N('洛恩把耳朵貼上灰的那一條。他整個人停住了，過了很久，才把石頭放回櫃台。'),
      { who: 'anna', text: '「你聽到什麼了？」' },
      { who: 'hero', mood: 'serious', text: '「沒什麼。只是下面的牆，都是順著這種灰的長出來的。」' },
      { who: 'anna', text: '「公會的老人老愛講，山上那道光只是燈罩，燈芯在迷宮最底下。我一直當成醉話。」' },
      { who: 'anna', text: '「燈芯要是好好的，光柱就不會一年比一年暗。我每年都跟自己說，是我眼睛老花了。」' },
      at(PL.inn, N('月影旅館。瑪莎端上剛起鍋的湯，凜捧起碗，一口氣喝到見底，眉頭也沒有皺一下。')),
      { who: 'marta', text: '「慢慢喝，燙壞了舌頭，明天的湯就嘗不出味道了。」' },
      { who: 'rin', text: '「放著，會被拿走。」' },
      N('洛恩把自己那一碗推到她面前，說他吃得慢。第二碗，凜喝了很久。'),
    ],
    summary: '第四層的牆裡流著星燈的光，牆順著灰掉的光長；洛恩貼耳聽了，不肯說聽見什麼。燈芯在迷宮最底下。凜喝湯的樣子不對勁。',
  },
  act3: {
    lines: [
      at(PL.guildCellar, N('冒險者公會的地下室。安娜搬出最舊的一本登記簿，封皮上的字已經磨平了。')),
      { who: 'anna', text: '「替你的碎片建檔的時候，我一直覺得這些字在哪裡讀過。原來是在這裡。」' },
      N('泛黃的一頁。找到的地點：傳送門廣場。身上的東西：一把刻著怪紋路的劍。記得的最後一句話：「洛」。'),
      { who: 'anna', text: '「比我出生還早。每隔幾十年就有一筆，名字每次都不一樣，地點、那把劍和那個『洛』字，從來沒變過。」' },
      // Story depth design §7.3: the last entry's name is the last line on her list (I-09, I-168); true before and after her choice.
      N('凜湊過來看那幾個名字。樓上有人走過，她猛地回頭看樓梯口，手按住了領口的小銅鐘。'),
      N('每一筆的最後一欄，不是「回到迷宮，未歸」，就是「死亡」。洛恩數著「死亡」，數到第四筆，就不數了。'),
      { who: 'hero', mood: 'smile', text: '「看來我很難殺。」' },
      N('安娜沒有笑。她指著「死亡」旁邊的小字。每一筆，都補著同一個名字。'),
      { who: 'anna', text: '「不是人名，是一個結社。『靜鐘會』。老冒險者說，他們不搶錢，也不搶碎片，只要一條命。」' },
      N('安娜闔上登記簿，把今年那一張登記表抽出來，壓在最上面。'),
      { who: 'anna', text: '「你這一張的最後一欄，我還空著。我打算一直空著。」' },
      N('回旅館的路上，洛恩第一次停下腳步，回頭看了一眼身後的暮霧。'),
    ],
    summary: '公會最舊的登記簿裡，記著好幾個和洛恩一模一樣的人，有幾筆死於「靜鐘會」之手。安娜說，他這一張的最後一欄會一直空著。',
  },
  act4: {
    lines: [
      at(PL.depth16, N('本道第十六層。崩落的牆後面，埋著一整座城：石板街、屋頂、乾掉的噴泉。')),
      N('廣場中央的石碑，刻滿和洛恩的劍上一樣的紋路。沒有人教過他，他卻讀得出來。'),
      { who: 'hero', mood: 'distant', text: '「『艾斯特拉之燈，收逝者之記憶，點之為光，長明不滅。』」' },
      N('碑上接著寫：戰爭結束後，城裡的人想忘掉一切，把悲傷全倒進了燈裡。光變了質，燈的根長成了迷宮。'),
      { who: 'hero', mood: 'distant', text: '「『一人自願下行，以己之記憶為燈芯，後人稱之守燈人。』」' },
      { who: 'hero', mood: 'distant', text: '「燈芯燒完了，那個人就被吐回地面，什麼都不記得。然後，又會被引著走回深處，再點一次燈。」' },
      at(PL.guild, N('冒險者公會。安娜聽完，翻開那本舊登記簿，指著邊上一行褪色的小字。')),
      { who: 'anna', text: '「靜鐘會的人說，那個走出來的人『走到哪裡，暮霧就跟到哪裡』。」' },
      { who: 'anna', text: '「霧濃是燈快乾了。這筆帳，別記在你頭上。」' },
      { who: 'hero', mood: 'sad', text: '「那我……為什麼讀得懂那塊碑？」' },
      // Rin's lines know whether she has made her choice: act 4 may play before her reveal or after it (U1).
      { who: 'rin', mood: 'guarded', text: '「我去外面看看。」', if: { oath: false } },
      { who: 'rin', mood: 'sad', text: '「我等過那口鐘響，等的原來是一個誤會。」', if: { oath: true } },
      { who: 'rin', mood: 'serious', text: '「洛恩，他們錯了。……你不是霧。」', if: { oath: true } },
    ],
    summary: '地底的古城艾斯特拉。石碑說，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。洛恩讀得懂碑文。',
  },
  // Story L Task 9 (spec §6.1; lore ledger I-193): the night of act 2, its first thing. Rin would sell, Noel would absorb,
  // Selene leaves it to a coin until Lorne catches it. One reading; the last line is what the finale calls back.
  'group:act2': {
    lines: [
      at(PL.innDinner, N('月影旅館的晚飯。碗收走以後，桌上攤開一塊布，布上是找不到主人的碎片。瑟蕾拿起一片，對著燈看了很久。')),
      { who: 'rin', mood: 'serious', text: '「一共十一片。明天全部拿去交易所換錢，照人頭分，誰也不欠誰。」' },
      { who: 'noel', mood: 'smug', text: '「換錢？裡面是光耶！吸進去，本小姐的雷能再亮一倍。」' },
      { who: 'rin', mood: 'serious', text: '「吸進去，別人的東西就長在妳身上。」' },
      { who: 'noel', mood: 'smug', text: '「說得好像妳很懂。」' },
      { who: 'rin', mood: 'normal', text: '「不懂。所以明天賣。」' },
      { who: 'noel', mood: 'smug', text: '「瑟蕾，妳盯著那片看了那麼久，一定看到了什麼吧？看到又不講，很賊耶。」' },
      N('瑟蕾摸出一枚銅板。'),
      { who: 'selene', mood: 'foresee', text: '「那就……問問月亮吧。」' },
      N('她把它往上一彈。洛恩伸手接住，放回她的手心。'),
      { who: 'hero', mood: 'smile', text: '「妳自己說。」' },
      { who: 'selene', mood: 'smile', text: '「不賣也不吸。我那一份，請瑪莎收進廚房的抽屜，等它的主人。」' },
      N('凜把自己那份包好，擱在腳邊。大家看著瑟蕾的時候，諾艾兒把一片滑進了袖子；洛恩看見了，什麼也沒說。'),
    ],
    summary: '晚飯桌上攤著無主的碎片。凜要賣，諾艾兒要吸，瑟蕾想丟銅板，被洛恩接住。諾艾兒藏起一片，他看見了。',
  },
  // Story L Task 10 (spec §6.2; lore ledger I-194): the night of act 3. Sylvie would ask Rin, Bobby would rather not know,
  // Lorne will not. They take her for one the society hunts too, never the one it sent; she comes back with the water.
  'group:act3': {
    lines: [
      at(PL.innDeepNight, N('月影旅館，深夜。凜把窗閂扣好，才提著水桶下樓打水。房裡剩下洛恩、希爾薇、波比，和一盞燈。')),
      { who: 'sylvie', mood: 'alert', text: '「樓上一有腳步聲，她就按住領口回頭看。兔子聽見狗叫，就是那個樣子。洛恩，你去問，她只聽你的。」' },
      { who: 'hero', mood: 'sad', text: '「不問。她想說的時候，自己會說。」' },
      { who: 'bobby', mood: 'sad', text: '「凜姊如果也被人追，一定不想講吧。我們一問……她、她就非講不可了耶。那、那還是不要問。」' },
      { who: 'sylvie', mood: 'serious', text: '「有人盯你盯了好幾輩子。凜不講，你也不問，那我要怎麼守？」' },
      { who: 'bobby', mood: 'grin', text: '「那、那我去幫她修修那個鐘好了。她每晚都在擦，一定是哪裡怪怪的。先拆下來，再──」' },
      N('門響了。凜提著水桶站在門口，沒有人知道她聽見了多少。'),
      { who: 'rin', mood: 'guarded', text: '「要問什麼？」' },
      { who: 'hero', mood: 'smile', text: '「問妳水打了沒。」' },
      { who: 'rin', mood: 'normal', text: '「打了。來回四十二步。」' },
      { who: 'sylvie', mood: 'serious', text: '「今晚起，我也睡門口。地板硬就硬，守夜一人一半，誰都別想多扛。」' },
      N('凜和希爾薇並排坐在門邊，中間多了一床被子。凜看著床上的洛恩，希爾薇看著凜。波比把被子拉過了頭。'),
    ],
    summary: '登記簿那一夜。希爾薇要洛恩去問凜，波比說不要問，洛恩不問。凜打水回來，希爾薇把被子鋪到了門邊。',
  },
  // Story L Task 11 (spec §6.3; lore ledger I-195): after act 4, Rin on the roof either side of her choice. Chizuru's festival
  // song breaks off on the line the stone said; Liz would buy him out, Safira would run, Scarlet would go in his place.
  'group:act4': {
    lines: [
      at(PL.guildClosed, N('冒險者公會，打烊以後。安娜回家了，舊登記簿還攤在桌上。凜一個人上了屋頂。')),
      { who: 'chizuru', mood: 'solemn', text: '「『春祭的燈，誰提下去？提燈的人，不留名字──』」' },
      N('歌停在那一句。莉茲把錢袋重重擱上桌；莎菲拉從椅背上拎起包袱，甩上了肩。'),
      { who: 'liz', mood: 'serious', text: '「我算過了。這一袋，夠在鎮上頂一間小店，外加三年的租金。老大，不下去了，你來顧店。」' },
      { who: 'safira', mood: 'laugh', text: '「開什麼店，乾脆走遠一點！明天一早往南，霧總不能追到天涯海角吧。」' },
      { who: 'liz', mood: 'scheming', text: '「跑路最貴啦。妳那個包袱，撐不過十天的伙食錢。店至少天天有進帳。」' },
      { who: 'scarlet', mood: 'vow', text: '「燈要燈芯，我去。盾本來就是拿來用掉的。」' },
      { who: 'liz', mood: 'serious', text: '「騎士大姊，妳把自己算成零，這帳要怎麼對？」' },
      { who: 'scarlet', mood: 'serious', text: '「帳不用對。要有人去，騎士排第一個。」' },
      { who: 'safira', mood: 'sad', text: '「那妳去當燈芯，就不會有人難過了嗎？」' },
      { who: 'hero', mood: 'distant', text: '「歌裡只有一個提燈的。那就我。」' },
      { who: 'liz', mood: 'sad', text: '「一個人你個頭啦！錢都擺上桌了，你還要自己下去？」' },
      { who: 'chizuru', mood: 'sad', text: '「那首歌的後半，提燈的那位沒有回來。我從小唱到大……那一段，我不唱了。」' },
      N('莎菲拉放下剛拎起的包袱，第一個坐了回去。莉茲沒有收回那袋錢，它在桌上放了一整夜，天亮時還在。'),
    ],
    summary: '打烊後的公會。千鶴的祭典歌唱到一半就停了。莉茲把錢袋放上桌要他別下去，絲嘉蕾說她去當燈芯。',
  },
  // Task 6: Lorne's memories (spec §4, §3.4, §3.6, §4.6, §8.4). Pieces 1–8 hint; piece 9 names the keeper, piece 10 the key.
  'mem:hero:1': {
    lines: [
      NP('黑暗裡有一點光，遠得像針尖。他拖著劍，一層一層往上走。'),
      NP('他不知道自己是誰，也不知道要去哪裡。只知道，要朝那點光走。'),
      { who: 'hero', mood: 'distant', text: '「我是自己走上來的。朝著那一點光，一層一層。」' },
      N('洛恩握緊劍柄。上面的紋路，摸起來還是溫的。'),
    ],
    summary: '洛恩想起自己拖著劍，在黑暗裡朝頭頂的一點光往上走。',
  },
  'mem:hero:2': {
    lines: [
      NP('下著雪的院子。他握著一把木劍，手凍得發紅，一遍又一遍地揮。'),
      NP('有人從背後扶正他的手腕：「太緊了。劍是放出去的，不是抓著的。」'),
      { who: 'hero', mood: 'smile', text: '「難怪我老是握太緊。」' },
      N('他拿起靠在床邊的劍，照著那句話，把手鬆開一點。劍尖不晃了。'),
    ],
    summary: '洛恩想起雪地裡有人教他握劍：劍是放出去的，不是抓著的。',
  },
  'mem:hero:3': {
    lines: [
      NP('秋天的獵場。他蹲在草裡，把細繩繞成活結，繫在兩棵樹之間。'),
      NP('「不用殺牠。」老獵人說，「讓牠慢下來、站不穩，剩下的交給同伴。」'),
      { who: 'hero', mood: 'distant', text: '「絆住牠，不是為了殺。這件事，我的手還記得。」' },
      N('當晚洛恩在後院拉了幾道細繩。半夜有東西絆了一跤，叫了一聲就跑了。誰也沒受傷。'),
    ],
    summary: '洛恩想起老獵人教他設陷阱：不用殺，讓牠慢下來就好。',
  },
  'mem:hero:4': {
    lines: [
      NP('風沙裡，一輛馬車翻倒在路邊。他舉著一面裂開的盾，擋在車輪前。'),
      NP('身後有人在哭。盾一次次被撞歪，他一次次把它推回來。'),
      { who: 'hero', mood: 'smile', text: '「盾裂成那樣還在用。我以前大概很窮。」' },
      N('那些人身上的衣服，洛恩在鎮上從來沒見過，像是很久以前的樣式。'),
    ],
    summary: '洛恩想起自己在風沙裡舉盾，護著一輛翻倒的馬車。那些人的衣服，是很舊的樣式。',
  },
  'mem:hero:5': {
    lines: [
      NP('那年秋天，他走出迷宮時，遠方的鐘正好響完最後一聲。他回過頭，什麼也沒看見。'),
      NP('幾天後的夜裡，巷子裡背後一涼。他倒進暮霧裡，耳邊又響起那口鐘。'),
      { who: 'hero', mood: 'sad', text: '「我死過……就在那條巷子裡。」' },
      N('洛恩伸手摸了摸自己的背。那裡什麼傷口也沒有。'),
    ],
    summary: '洛恩想起遠方響過一次鐘。幾天後的夜裡，他死在巷子裡。',
  },
  'mem:hero:6': {
    lines: [
      NP('石塔頂上，有人指著夜空，一顆一顆念星星的名字。他跟著念，念錯了就重來。'),
      NP('「火、冰和雷都在星星裡。」那人說，「叫得出名字，它們就會回應你。」'),
      { who: 'hero', mood: 'serious', text: '「那座塔，鎮上沒有。那片天上的星星，位置也不對。」' },
      { who: 'hero', mood: 'distant', text: '「教我劍、盾、繩結和星星的人……也許，不是同一輩子遇見的。」' },
    ],
    summary: '洛恩想起在石塔上學星星的名字。那片星空的位置不對，像是另一輩子的事。',
  },
  'mem:hero:7': {
    lines: [
      NP('遠方的鐘又響過一次。一季還沒過完，市集的人群裡，他看見了拿刀的人。'),
      NP('然後是黑暗。他在很深很深的地方醒來，什麼都不記得，只看得見頭頂一點光。'),
      { who: 'hero', mood: 'sad', text: '「死了以後，就在最底下醒來，再走上來一次。這條路，我走過不只一次。」' },
      { who: 'hero', mood: 'serious', text: '「拿刀的那個人，手在發抖。……他們在怕什麼？」' },
    ],
    summary: '洛恩又想起一次死亡，和死後在最深處醒來、再往上走的路。拿刀的人，手在發抖。',
  },
  'mem:hero:8': {
    lines: [
      NP('荒地上圍著一圈帳篷。從迷宮裡抬出來的人躺了一地，什麼都不記得。'),
      NP('他跪在他們中間，雙手捧著一點光，照著有人教過的樣子，一個一個祈禱。'),
      { who: 'hero', mood: 'distant', text: '「那一圈帳篷……是露米亞最早的樣子。」' },
      { who: 'hero', mood: 'smile', text: '「那時候我也什麼都不記得。照顧人的方法，手卻記得。」' },
    ],
    summary: '洛恩想起露米亞還只是一圈帳篷的時候，他捧著光，照顧失憶的人。',
  },
  // Piece 9 may play before Rin's reveal (d25 against her d22): her one line knows which.
  'mem:hero:9': {
    lines: [
      NP('最深處，一盞大得看不見頂的燈。燈芯的光，細得像一根快斷的線。'),
      NP('他走到燈前，閉上眼睛。記得的每一張臉、每一句話，一段段化成光，沿著燈芯往上爬。'),
      NP('燈亮了，他睡在光裡。很多年以後，燈芯燒完，迷宮把他吐了出來。'),
      NP('他什麼都不記得，朝頭頂的光往上走，倒在迷宮的入口。有人替他登記，替他取名字。'),
      NP('有幾次，他在鎮上住了下來，交了朋友，學了本事。然後底下有什麼在拉他，他就走回深處。'),
      NP('也有幾次，遠方的鐘響了。他在鎮上還住不滿一季，靜鐘會的刀就到了背後。'),
      NP('死了的那幾次，他在最底下的黑暗裡躺了幾十年。醒來時手裡只有那把劍，再從頭往上走。'),
      { who: 'hero', mood: 'sad', text: '「想起來了……我是守燈人。」' },
      { who: 'hero', mood: 'serious', text: '「我在上面活過的日子，就是下一次的燈芯。」' },
      { who: 'narrator', text: '凜站在光照不到的地方，手緊緊按著領口的小銅鐘。', if: { oath: false } },
      { who: 'narrator', text: '凜走到他身邊，什麼也沒說，只是抓住了他的袖口。', if: { oath: true } },
      { who: 'hero', mood: 'resolve', text: '「被殺了那麼多次，還是一直往上走。原來我一直都想回來。」' },
    ],
    summary: '洛恩想起了一切：他是守燈人。點燈、被吐回地面、被靜鐘會殺死，一輪又一輪。',
  },
  // Piece 10 plays at the bottom, after the depth-30 boss and before the finale (which always follows Rin's choice, U3).
  'mem:hero:10': {
    lines: [
      NP('很久以前的艾斯特拉。戰爭結束了，廣場上排著長長的隊，人們把悲傷倒進燈裡。'),
      NP('只有他沒有排隊。死去的人，他一張臉也不想忘。'),
      NP('燈變了顏色，地底長出了迷宮。城裡的工匠把一把刻滿文字的劍，放進他手裡。'),
      NP('「這是燈鑰。往下的路上有獸，所以做成了劍。」工匠說，「插進燈座，燈就認得你。」'),
      NP('送他到階梯口的人說：「城裡只剩你還記得。……要回來。」'),
      NP('他說會回來。然後他往下走，走了很久很久。'),
      N('星燈之底。燈喰之母倒下了，牠身後那盞燈，只剩一點快熄的藍。'),
      N('洛恩手上的劍，紋路一條一條亮了起來，和燈座上刻的一模一樣。'),
      { who: 'hero', mood: 'resolve', text: '「這把劍，就是燈鑰。我一直帶著它走回來。」' },
      { who: 'hero', mood: 'distant', text: '「第一次，是我自己選的。那時候，只剩我還記得。」' },
      { who: 'hero', mood: 'resolve', text: '「我知道該怎麼做。每一次，都是一個人做的。」' },
      N('他握緊劍，朝燈走去。身後的腳步聲，沒有停。'),
    ],
    summary: '洛恩想起第一輪：艾斯特拉的人都想忘，只有他記得，所以自願下去。他的劍，就是燈鑰。',
  },
  // Task 6: Lorne's chats. 2–4 wait for act 2, 3 and 4 (CHAT_GATE); the last one knows whether Rin has chosen.
  'chat:hero:1': {
    lines: [
      { who: 'glen', text: '「小子，下去之前先看一眼那道光。迷路了，就朝它走。」' },
      { who: 'hero', mood: 'normal', text: '「知道。醒來的時候，第一個看見的就是它。第二個，是你的鼻孔。」' },
      { who: 'glen', text: '「少耍嘴皮。下次你醒過來，我記得把臉挪開。還站著幹嘛，下去。」' },
    ],
    summary: '葛倫要洛恩迷路時朝星燈走。洛恩說，他醒來第一個看見的就是它。',
  },
  'chat:hero:2': {
    lines: [
      at(PL.innDeepNight, N('深夜的月影旅館。凜還坐在窗邊，眼睛一下也沒眨。洛恩問她怎麼不睡，她說：「你會打呼。」')),
      { who: 'hero', text: '「我沒有。」' },
      { who: 'rin', text: '「現在沒有。」' },
    ],
    summary: '那天深夜，凜坐在旅館窗邊沒有睡。洛恩問她怎麼不睡，她說他會打呼。',
  },
  'chat:hero:3': {
    lines: [
      { who: 'marta', text: '「洛恩，今天的事說給我聽。我記下來。」' },
      { who: 'hero', mood: 'smile', text: '「回來了。……就這樣。」' },
      { who: 'marta', text: '「傻孩子，那是最要緊的一句。我寫在最上面。」' },
    ],
    summary: '瑪莎要把洛恩的一天寫進日記。他只說「回來了」，她把這句寫在最上面。',
  },
  'chat:hero:4': {
    lines: [
      { who: 'hero', mood: 'serious', text: '「凜。碑上那個人，每一次都是一個人走下去的。」' },
      { who: 'rin', mood: 'averted', text: '「為什麼跟我說這個？」', if: { oath: false } },
      { who: 'narrator', text: '她轉身上樓，走到一半停了一下，沒有回頭。', if: { oath: false } },
      { who: 'rin', mood: 'serious', text: '「這一次，不是一個人。你下去的地方，我也去。」', if: { oath: true } },
      { who: 'rin', mood: 'smile', text: '「再說，洛恩。你一個人，連繃帶都纏不好。」', if: { oath: true } },
    ],
    summary: '洛恩對凜說，碑上的那個人，每一次都是一個人走下去的。',
  },
  // Story depth Task 4 (design §7.4, pasted as it stands; plan ruling 10): act 4, the town turns. Anna keeps tearing down
  // the papers on the guild door, and keeps the forms of the adventurers who stopped coming.
  'chat:hero:5': {
    lines: [
      { who: 'anna', text: '「門口的紙，我又撕了一張。」' },
      { who: 'hero', text: '「公會的人，少了幾個吧。」' },
      { who: 'anna', text: '「三個。他們的登記表我也收好了──回來的時候，才有人喊得出名字。」' },
    ],
    summary: '安娜又撕掉了公會門口的一張紙。不再來的三個冒險者，她把登記表收好了，等他們回來的時候喊得出名字。',
  },
  // Task 7: Rin's choice (spec §5.2), the darkest scene. It plays alone at night, after her 7th piece and before the finale (U3).
  // It may come before or after the hero's 9th piece, so it does not say he is the lamp keeper (lore ledger I-50).
  // Story depth ruling (c): the bandage among her nights, her own hand on the knife, and one more line of his; it still ends
  // on the spec's 「明天也一起回來吧」 (lore ledger I-169).
  'rin-reveal': {
    lines: [
      at(PL.innDeepNight, N('深夜的月影旅館。窗外星燈的光很淡，淡得只照得到床邊那一截刀刃。')),
      N('洛恩睡著了。凜站在床邊，短刃出鞘，刀尖落在他的喉嚨上。'),
      N('她數著他的呼吸。每數一下，就有一個一起回城的夜晚浮上來：瑪莎的熱湯、纏得太緊的繃帶、走在她前面的背影。'),
      N('她沒有眨眼。先抖起來的，是刀尖。'),
      N('她收起短刃，靠著床腳坐下，一直坐到窗外發白。'),
      at(PL.innDawn, N('洛恩醒來時，桌上放著一枚裂開的小銅鐘。凜直直看著他的眼睛，把鐘樓、名單、石門和出口前那一刀，全都說了。')),
      { who: 'rin', mood: 'serious', text: '「洛恩，我是被派來殺你的。可是我不殺了──這是我自己決定的。」' },   // story polish ruling 10 (user-approved sample)
      { who: 'rin', mood: 'serious', text: '「昨晚收刀的不是身體，是我。」' },   // answers first-return's 「身體自己動的」
      { who: 'rin', mood: 'smile', text: '「『凜』是他們給的代號。……這個名字是我自己決定要用的。」' },
      { who: 'hero', mood: 'sad', text: '「我早就覺得不對勁了。一直沒問下去，是怕一問，妳就走了。」' },
      N('凜沒有回答，也沒有移開視線。'),
      { who: 'hero', mood: 'smile', text: '「明天也一起回來吧。」' },
    ],
    summary: '那天深夜，凜的刀尖停在洛恩的喉嚨上，最後收了回去。天亮後她說出一切，選擇不殺他。洛恩說，他一直沒問下去，是怕她走。',
  },
  // Story depth design §8 sample 2 (Task 14 final): her confession to the party, the dinner of the return after her reveal; it
  // plays alone. Owed at depth 30 (the finale plays it first, plan ruling 8), it is the last rest before the lamp, with
  // Marta's soup from the pack: `full: 'hero'` tells the two apart (controller ruling). Each one's beat comes from her own
  // arc: Scarlet's shield and his back, Sylvie's hunter, Liz's debts; Lorne says a fact, not a speech; Marta's warmth.
  'rin-confess': {
    lines: [
      { place: PL.innDinner, who: 'narrator', text: '回城那天的晚飯，月影旅館的餐桌。凜沒有坐下。她把那枚裂開的小銅鐘，放在自己的湯碗旁邊。', if: { notFull: 'hero' } },
      { place: PL.depth30, who: 'narrator', text: '第三十層，燈前最後一次歇腳。凜沒有坐下。她把那枚小銅鐘，放在大家圍著的火堆旁邊。', if: { full: 'hero' } },
      { who: 'rin', mood: 'serious', text: '「我本來是靜鐘會的人，被派來殺洛恩。上一次回城的那一夜，我的刀尖抵在他的喉嚨上。」' },
      { who: 'narrator', text: '絲嘉蕾站了起來，椅子倒在地上。她一步跨到洛恩和凜之間，手按住了劍柄。', if: { met: 'scarlet', notFull: 'hero' } },
      { who: 'narrator', text: '絲嘉蕾猛地站起來，踢散了火堆邊的石子。她一步跨到洛恩和凜之間，手按住了劍柄。', if: { met: 'scarlet', full: 'hero' } },
      { who: 'narrator', text: '沒有人動。瑪莎端著湯鍋站在廚房門口，也沒有動。', if: { notMet: 'scarlet', notFull: 'hero' } },
      { who: 'narrator', text: '沒有人動。火堆劈啪響了一聲，誰也沒有去撥。', if: { notMet: 'scarlet', full: 'hero' } },
      { who: 'scarlet', mood: 'vow', text: '「凜小姐，請退後三步。這一次，誰也別想從他背後過去。」', if: { met: 'scarlet' } },
      // Story L Task 15 (spec §10): one reading, heard on the roof or not
      { who: 'sylvie', mood: 'alert', text: '「我一直覺得，妳走路像在追獵物。」', if: { met: 'sylvie' } },
      { who: 'rin', mood: 'serious', text: '「妳說對了。那時候，我自己也不知道在追什麼。」', if: { met: 'sylvie' } },
      { who: 'liz', mood: 'serious', text: '「所以這一路，妳一直欠我們一句實話。我們背靠背打的時候，妳的刀朝著哪邊？」', if: { met: 'liz' } },
      { who: 'rin', mood: 'serious', text: '「是我欠的。今天還給你們。」', if: { met: 'liz' } },
      { who: 'hero', mood: 'serious', text: '「那天早上她就說了。這一趟下去，她還是走在我後面。」' },
      { who: 'scarlet', mood: 'serious', text: '「我明白了。那麼……我有我的做法。」', if: { met: 'scarlet' } },
      { who: 'marta', text: '「湯要涼了。孩子，坐下。這碗是妳的，一直都是。」', if: { notFull: 'hero' } },
      { who: 'narrator', text: '洛恩把瑪莎硬塞進行囊的那壺湯熱了，倒一碗，推到凜的面前。', if: { full: 'hero' } },
      N('凜坐下了。這一次，她把湯喝得很慢。'),
    ],
    summary: '凜當著大家說出自己本來是靜鐘會派來殺洛恩的人。絲嘉蕾擋在洛恩身前，莉茲要她還一句實話；最後她坐下來，把湯喝得很慢。',
  },
  // Continuity fix 4 (spec §5.2, §3.6; lore ledger I-119): the arrival after her choice. The society struck its bell and her
  // flattened one did not answer: that is how they know. He is afraid, not cruel; the finale's truths stay the finale's.
  // Rin's `guarded` belongs here after her oath (style bible §3: it is kept for the bellkeeper).
  // Story depth ruling (a): he is her master and the knife in the market (I-10, I-167). She calls him 「師父」 once and never
  // speaks to him again; he will not say Lorne's name. No reconciling.
  // Final review: owed at the finale (no return between her choice and depth 30, plan ruling 8) it plays at the bottom, his
  // tenth piece in hand (`full: 'hero'`, as rin-confess reads): the keeper is already waiting at the lamp, not in town.
  'bellkeeper-arrives': {
    lines: [
      { place: PL.plazaMorning, who: 'narrator', text: '幾天後的清晨，傳送門廣場。一位穿長袍的老人站在門前，雙手捧著一口小小的鐘。', if: { notFull: 'hero' } },
      { place: PL.lampBase, who: 'narrator', text: '星燈之底，燈座前的石階上。穿長袍的老人已經等在那裡，雙手捧著一口小小的鐘。', if: { full: 'hero' } },
      { who: 'bellkeeper', text: '「吾等敲了三回鐘。那孩子領口的鐘，一回也沒有應。」' },
      { who: 'rin', mood: 'guarded', text: '「那枚鐘，我敲平了。洛恩，站到我後面。」' },
      { who: 'bellkeeper', text: '「站在目標身後一步，是我教妳的站法。妳卻站到了他的前面。」' },
      { who: 'rin', mood: 'surprised', text: '「師父。」' },
      N('老人捧著鐘的手在發抖。他看的不是凜，是站在她身後的洛恩。'),
      { who: 'bellkeeper', text: '「那張臉，吾等記得。很多年前在市集裡，從背後刺進你的，是吾等的刀──是我的刀。」' },
      { who: 'bellkeeper', text: '「從深處走出來的人，殺了也會再回來。吾等怕的，就是這個。這一回我不動手，只想看清楚你。」' },
      { who: 'hero', mood: 'serious', text: '「我叫洛恩。名單上要寫的話，就寫這個。」' },
      { who: 'narrator', text: '老人沒有應那個名字，把鐘抱緊，轉身走進了鎮裡。凜沒有再看他一眼。', if: { notFull: 'hero' } },
      { who: 'narrator', text: '老人沒有應那個名字，把鐘抱緊，退進燈座旁的暗處。凜沒有再看他一眼。', if: { full: 'hero' } },
    ],
    summary: '鐘守來了。他是凜的師父，也是很多年前在市集裡殺死洛恩的人。這一回他不動手，洛恩報上了名字。',
  },
  // Story depth Task 2 (design §7.4, the row's nine beats; plan ruling 10): the morning after his ninth piece, when he means
  // to go down alone. It plays on a departure, never on an arrival. Beat 6 reads five ways (Scarlet met or not, her second
  // chat heard or not, her memories whole or not); beat 9 is two lines. The writing task finalizes it.
  'hero-alone': {
    lines: [
      at(PL.innBeforeDawn, N('天還沒亮，洛恩揹好劍，走到門邊。門口坐著一個人。')),
      N('凜背靠著房門，短刃橫在膝上。跟第一次回城的那一夜一樣，從那裡看得見他。'),
      { who: 'rin', mood: 'serious', text: '「要出去，得先過我這裡。」' },
      { who: 'hero', mood: 'sad', text: '「燈要的是記憶。妳們跟下去，交出去的就回不來了。」' },
      { who: 'rin', mood: 'serious', text: '「你說過，下次也拜託我。這就是下次。」' },
      // Scarlet gives him back his own words from chat:scarlet:2 (「不必替我擋」), as he said them. Story L Task 15 (spec §10):
      // she names him neither way, so her memories no longer split the line; only the chat heard or not does.
      { who: 'scarlet', mood: 'vow', text: '「『不必替我擋』。這一句，原封不動奉還。」', if: { met: 'scarlet', seen: 'chat:scarlet:2' } },
      { who: 'scarlet', mood: 'vow', text: '「盾還在，輪不到誰一個人去擋。」', if: { met: 'scarlet', notSeen: 'chat:scarlet:2' } },
      { who: 'narrator', text: '房門外傳來腳步聲，不只一個人的。', if: { notMet: 'scarlet' } },
      N('走廊上，大家都醒著。瑪莎披著外套，端著熱湯站在樓梯口。'),
      { who: 'marta', text: '「真要走，也先吃了再走。吃飽了，就不想走了。」' },
      { who: 'hero', mood: 'normal', text: '「妳們都不睡的嗎。」' },
      N('那一天，洛恩沒有一個人出門。天亮以後，大家一起下去了。'),
    ],
    summary: '天還沒亮，洛恩想一個人下迷宮，門口的凜、走廊上的夥伴和端著熱湯的瑪莎，誰也沒讓他一個人走。',
  },
  // Story L (spec §4.8): the night before the descent, on the first departure once her choice is made and the main road
  // reaches depth 26. One frame line, shown, not said (Task 8): no lamp goes out; up to three companions' untold memories follow.
  'finale-eve': {
    lines: [
      at(NIGHT_PLACE, N('下到最後一層的前一晚。月影旅館的燈，一盞也沒有熄。')),
    ],
    summary: '下到最後一層的前一晚，旅館裡沒有人睡得著。',
  },
  // Task 7: Rin's chats. 2 waits for act 2, 3 for act 3 (she looks away only from her 4th piece), 4 for her choice.
  // 2 and 3 can be delayed past her choice (one chat per return): each reading has its own lines.
  'chat:rin:1': {
    lines: [
      { who: 'rin', mood: 'normal', text: '「喂。手腕上的印子退了。那時候，你為什麼抓著不放？」' },
      { who: 'hero', mood: 'smile', text: '「記不得了。我的手，好像比我還固執。」' },
      N('「下次不用抓那麼緊，會痛。另外，指甲剪一剪。」凜說完就上樓了。洛恩看了看自己的指甲，確實該剪了。'),
    ],
    summary: '凜手腕上的指痕退了。她問洛恩那時候為什麼不放手，他說記不得，他的手比他還固執。',
  },
  'chat:rin:2': {
    lines: [
      at(PL.innYard, N('旅館的後院。凜坐在井邊，一隻手一直按在領口那枚小銅鐘上。', false)),
      at(PL.innYard, N('旅館的後院。凜坐在井邊，手指碰了碰領口，又放了下來。', true)),
      { who: 'hero', text: '「怎麼了？」' },
      { who: 'rin', mood: 'guarded', text: '「沒什麼。只是不想聽見它響。」', if: { oath: false } },
      { who: 'rin', mood: 'smile', text: '「手自己摸過去的。別擔心，那裡的鐘已經不會響了。」', if: { oath: true } },
    ],
    summary: '凜坐在旅館後院的井邊，手按著領口。洛恩問她怎麼了。',
  },
  'chat:rin:3': {
    lines: [
      N('凜在擦短刃。洛恩在她對面坐下，她的視線便落回刀刃上，再也沒有抬起來。', false),
      { who: 'rin', mood: 'averted', text: '「喂。你是人？」', if: { oath: false } },
      { who: 'hero', mood: 'smile', text: '「我想是。我會餓也會累，回來的時候還會想睡。」', if: { oath: false } },
      N('凜在擦短刃。洛恩在她對面坐下，她停下手，抬起頭看著他。', true),
      { who: 'rin', mood: 'smile', text: '「以前我不敢看你的眼睛，現在敢了。」', if: { oath: true } },   // final review: courage, not a confession
      N('洛恩沒有說話，也沒有移開視線。最後先眨眼的，是凜。', true),
    ],
    summary: '洛恩在擦短刃的凜對面坐下。她說了一句話，眼神說得更多。',
  },
  'chat:rin:4': {
    lines: [
      { who: 'rin', mood: 'serious', text: '「洛恩，那枚銅鐘扣上的時候還是好的，從霧裡出來就裂了。」' },
      { who: 'rin', text: '「應該是你抓住我手腕那一下裂的。……所以我把它敲平了。」' },
      { who: 'rin', mood: 'smile', text: '「再也不會有鐘聲叫我去殺誰了。我們明天也一起回來。」' },
    ],
    summary: '凜說銅鐘是在霧裡裂的，就在洛恩抓住她手腕的那一下。她把它敲平了，再也不會響。',
  },
  // Task 8: Selene (spec §6, §11.1). She fears that a spoken prophecy walks itself into being. Pieces 2 and 4 are the full
  // moon's bright ending, piece 5 the new moon's dark one; in it she knows the people by the lamp, and says 「我想看見」.
  // A companion's piece can drop in her own region before the main road reaches its act: no act content (lore ledger I-58).
  'mem:selene:1': {
    lines: [
      NP('山丘上的石屋。銀盆裡盛著水，水面映著月亮。村裡的人排著隊，來問明天的事。'),
      NP('她說那座橋會塌。從那天起，沒有人走那座橋，也沒有人去修。入秋的第一場雨，橋塌了。'),
      { who: 'selene', mood: 'sad', text: '「月亮說的。……是月亮說的吧？」' },
      N('洛恩沒有說話，只是把桌上的燈往她那邊挪近了一點。'),
    ],
    summary: '瑟蕾想起自己是讀月相的占星師。她說橋會塌，橋就塌了。她開始害怕自己說出口的預言。',
  },
  'mem:selene:2': {
    lines: [
      NP('滿月的夜。銀盆裡的水自己亮了起來，映出一道從地底往上走的背影。'),
      NP('很多人在喊同一個名字。那個從深處走出來的人走過的地方，一盞很大的燈重新亮了。'),
      { who: 'selene', mood: 'foresee', text: '「滿月給我看的結局……好亮好暖喔。」' },
      N('瑟蕾偷偷看了一眼燈下的洛恩，又趕快轉頭，去找窗外的月亮。'),
    ],
    summary: '滿月的夜，瑟蕾在水盆裡看見一個光明的結局：從深處走出來的人被很多人記住，燈重新亮了。',
  },
  'mem:selene:3': {
    lines: [
      NP('迷宮的入口，暮霧從門縫裡吐出來。她捧著銀盆，在霧前跪下。'),
      NP('她把盆裡的水倒進霧裡：「看見的，我不要了。就讓未來自己走過來吧。」'),
      { who: 'hero', text: '「是妳自己交出去的？」' },
      { who: 'selene', mood: 'sad', text: '「兩種結局，我都看見了。我怕一開口，就替所有人選了其中一個。」' },
    ],
    summary: '瑟蕾想起，她看見的結局不是被迷宮奪走的，是她自己交出去的。她怕自己的話替所有人選了未來。',
  },
  'mem:selene:4': {
    lines: [
      NP('又是滿月。這一次，銀盆裡那道背影的旁邊，站著好幾個人。'),
      NP('他們一起提著燈往下走，又一起走了回來。她只看見手和衣角，看不見臉。'),
      { who: 'selene', mood: 'foresee', text: '「那個人，不是一個人走到燈前的。」' },
      { who: 'selene', mood: 'wistful', text: '「洛恩先生，我差一點……就看清楚他們的臉了。」' },
    ],
    summary: '又一個滿月的結局：從深處走出來的人身邊，站著好幾個一起提燈的人。他們的臉，瑟蕾還沒看清。',
  },
  // Story depth design §7.4 (fix one): the new moon is the back that falls before the exit with a short blade in it, the
  // same picture as Rin's seventh piece. Her piece can come before or after Rin's choice: after it she owns what she saw;
  // before it she only looks at where Rin stands, and says nothing. She is still afraid, so no 「我不怕了」; her
  // 「是我說的，不是月亮」 waits for banter:rin-selene:2 (I-60, I-170).
  'mem:selene:5': {
    lines: [
      NP('新月的夜，銀盆裡沒有月亮。那道往上走的背影，在出口前倒下了，背後插著一把短刃。'),
      NP('燈等不到人，熄了。暮霧漫上來，吞掉了每一個人。滿月裡那些人的臉，這時才一張一張清楚了。'),
      { who: 'selene', mood: 'sad', text: '「凜，插在背後的那把刀……我早就看見了。是我一直沒有說出口。」', if: { oath: true } },
      { who: 'selene', mood: 'smile', text: '「站在燈旁邊的那群人，是你們，凜也在。洛恩，我想看見我們走到那一天。」', if: { oath: true } },
      { who: 'narrator', text: '瑟蕾抬起頭，看著站在洛恩身後一步的凜，看了很久，什麼也沒有說。', if: { oath: false } },
      { who: 'selene', mood: 'wistful', text: '「站在燈旁邊的那群人……是你們。洛恩，我想看見我們走到那一天。」', if: { oath: false } },
    ],
    summary: '新月的結局：往上走的背影在出口前倒下，背後插著短刃，燈熄了。瑟蕾認出滿月裡的那群人就是這支隊伍，說她想看見。',
  },
  'chat:selene:1': {
    lines: [
      at(PL.innRoof, N('深夜的月影旅館屋頂。瑟蕾抱著膝蓋，仰頭看著夜空，看得很專心。')),
      { who: 'hero', text: '「看得見明天嗎？」' },
      { who: 'selene', mood: 'foresee', text: '「一點點呢。明天的早餐是──不行。話一說出口，就會自己長出腳來。所以，我只說月亮的事。」' },
    ],
    summary: '瑟蕾在旅館的屋頂看夜空。洛恩問她看不看得見明天，她說只說月亮的事。',
  },
  'chat:selene:2': {
    lines: [
      // Her last piece can come before this chat (one chat per return), and it turns 「洛恩先生／您」 into 「洛恩／你」 (I-22,
      // I-58). Story L Task 15 (spec §10): she names him neither way here, so it reads one way.
      { who: 'selene', mood: 'foresee', text: '「月亮最近很好說話。想讀哪一件未來的事？什麼都可以──早餐除外。」' },
      { who: 'hero', text: '「那就讀讀看，明天大家會不會都回來。」' },
      { who: 'selene', mood: 'smile', text: '「那一件，不用讀月亮也知道呢。每一次，大家都是跟著同一個人回來的。」' },
    ],
    summary: '瑟蕾問洛恩想知道什麼未來。他只想知道明天大家會不會都回來。',
  },
  // Task 8: Chizuru (spec §6, §11.2). She thinks she left days ago; the pieces show the ice kept her for decades and the
  // shrine is gone. Her last piece is the bell the last priest tied to her spear; she will build a small shrine by the town.
  'mem:chizuru:1': {
    lines: [
      NP('山腰的神社，石階兩旁積著雪。神主替她繫好袖帶，把長槍交到她手上。'),
      NP('「去封住迷宮的裂口吧。」神主說，「春祭之前，回來。」'),
      { who: 'chizuru', mood: 'solemn', text: '「明明是前幾天的事。春祭之前，我得回山上去。」' },
      N('千鶴推開窗看了看天色，掐著手指算今天是幾月幾日。算到一半，又從頭算起。'),
    ],
    summary: '千鶴想起神主送她出發：去封住迷宮的裂口，春祭之前回來。她以為那只是幾天前的事。',
  },
  'mem:chizuru:2': {
    lines: [
      NP('迷宮深處，寒氣從石縫裡湧出來。她把槍插進冰面，閉上眼睛，念起封印的祝詞。'),
      NP('冰順著槍柄往上爬，爬上她的手、她的袖子。祝詞念到最後一句，她的呼吸也結成了霜。'),
      { who: 'chizuru', mood: 'sad', text: '「封印沒有念完。最後一句，凍在嘴裡了。」' },
      N('千鶴把槍靠在窗邊，閉上眼睛，從第一句重新念起。凜坐在門邊等，一直等到她念完。'),
    ],
    summary: '千鶴想起封印的儀式。祝詞念到最後一句，她和槍一起被凍進了冰裡。',
  },
  'mem:chizuru:3': {
    lines: [
      NP('從冰裡看出去，世界像隔著一層水。有人提著燈從冰前走過，又有人走過。'),
      NP('起初是草鞋與皮甲，後來是她沒見過的長靴與鐵扣。走過的人，衣裳換了好幾回樣式。'),
      { who: 'chizuru', mood: 'bewildered', text: '「才幾天而已，衣裳的樣式不會換這麼多回。」' },
      N('千鶴低頭看自己的袖帶。那條紅色，褪得比她以為的還要淡。'),
    ],
    summary: '千鶴想起冰外走過的冒險者，衣裳換了好幾回樣式。她在冰裡待的，不只幾天。',
  },
  'mem:chizuru:4': {
    lines: [
      NP('出發的前一夜。神社的院子裡沒有別人，只有神主在掃石階上的雪，一下又一下。'),
      NP('「參拜的人，一年比一年少了。」神主說，「我之後，這裡就沒有人了。」'),
      { who: 'chizuru', mood: 'sad', text: '「神主大人那時，已經很老了。那是幾十年前的事。」' },
      { who: 'chizuru', mood: 'sad', text: '「神社……已經不在了吧。」' },
    ],
    summary: '神主是神社最後的守護者。千鶴明白，自己在冰裡待了幾十年，神社早就不在了。',
  },
  'mem:chizuru:5': {
    lines: [
      NP('出發的清晨。神主解下拜殿前的鈴，繫在她的槍穗上。'),
      NP('「帶著吧。」神主說，「回不來也無妨。在妳守著的地方掛上它，那裡就是神社。」'),
      { who: 'chizuru', mood: 'solemn', text: '「神主大人早就知道，我可能回不去了。」' },
      { who: 'chizuru', mood: 'smile', text: '「洛恩大人，我想在鎮邊蓋一座小祠，為此處的人掛上這枚鈴。」' },
    ],
    summary: '槍穗上的鈴，是神主託付給千鶴的。她決定在露米亞的鎮邊蓋一座小祠，為了現在的人。',
  },
  'chat:chizuru:1': {
    lines: [
      // Read right before and after any of her pieces: the words she wrote stay true (I-58).
      { who: 'chizuru', mood: 'bewildered', text: '「洛恩大人，公會的表要寫『記得的最後一句話』。我寫好之後，向那張表行了一禮。」' },
      { who: 'hero', text: '「表格也要行禮？」' },
      { who: 'chizuru', mood: 'solemn', text: '「我寫的是『春祭之前，回來。』送我出門的人說的話，自然要行禮。城裡最近連這個規矩都不講了嗎？」' },
    ],
    summary: '千鶴在公會的登記表上，寫下送她出門的人說的話：春祭之前，回來。',
  },
  'chat:chizuru:2': {
    lines: [
      at(PL.edgeMorning, N('清晨的鎮邊。千鶴搖了搖槍穗上的小鈴，閉上眼睛，等它響完。')),
      // Story L Task 13 (spec §10): it waits for Bobby (`CHAT_GATE`), who wants to take the bell apart (style bible pairing);
      // the reading without her is gone. Chizuru's answer still turns on her last piece, which tells her who tied the bell.
      { who: 'bobby', mood: 'excited', text: '「千鶴姊，那個鈴好好聽喔！裡面藏了什麼機關？借我拆開看看！」' },
      { who: 'chizuru', mood: 'solemn', text: '「拆不得。城裡最近流行把東西拆開來看嗎？這鈴是何時繫上的，我也記不得了，只知道每天聽它響一回，心就定了。」', if: { notFull: 'chizuru' } },
      { who: 'chizuru', mood: 'solemn', text: '「拆不得。這是神主大人託付的鈴，每天聽它響一回，心就定了。」', if: { full: 'chizuru' } },
    ],
    summary: '千鶴每天清晨搖一次槍穗上的鈴，聽它響完，心就定了。',
  },
  // Task 8: Safira (spec §6, §11.2). One member of her troupe in each piece, the leader last: 「妳要繼續跳。」
  'mem:safira:1': {
    lines: [
      NP('沙丘上的營火。鼓手敲著皮鼓，她赤著腳，在火光裡轉圈。'),
      NP('「慢了半拍！」鼓手笑著喊，「跟上我的鼓，別讓鼓跟著妳跑！」'),
      { who: 'safira', mood: 'laugh', text: '「哈哈，那個大鬍子啊，罵我慢半拍，罵了整整十年唷。」' },
      N('莎菲拉跟著記憶裡的鼓點踩了兩拍。第三拍踩空了，她笑了一下，沒有再踩。'),
    ],
    summary: '莎菲拉想起舞團的鼓手，和營火邊跟不上的那半拍。鼓聲是哪一天停的，她想不起來。',
  },
  'mem:safira:2': {
    lines: [
      NP('乾掉的河床。吹笛的少年跟在她後面，笛聲斷斷續續。水袋已經空了兩天。'),
      NP('她先看見了。地平線上浮著一座城，屋頂閃閃發亮。她喊著「那裡有城」，第一個跑了過去。'),
      { who: 'safira', mood: 'sad', text: '「笛子是我教他吹的。他什麼都學我，連往哪裡跑，也學我。」' },
      N('莎菲拉把椅子往後拖，一直拖到所有人的背後，才坐下。'),
    ],
    summary: '沙漠裡，莎菲拉第一個看見蜃樓裡的城，第一個跑了過去。吹笛的少年跟在她後面。',
  },
  'mem:safira:3': {
    lines: [
      NP('帳篷裡熱得像爐子。縫衣裳的大姊替她的舞衣縫上最後一排銅片，針扎了手也不吭聲。'),
      NP('大姊把自己那一口水推給她：「跳舞的人，喉嚨不能乾。我只要拿得動針就好。」'),
      { who: 'safira', mood: 'sad', text: '「這件舞衣，就是我身上這件。上面的銅片，一片都沒掉。」' },
      N('那天晚上，她把舞衣上的銅片一片一片擦亮，擦到天快亮。'),
    ],
    summary: '莎菲拉身上的舞衣，是縫衣裳的大姊縫的。大姊把最後一口水讓給了她。',
  },
  'mem:safira:4': {
    lines: [
      NP('她發著燒，躺在搖晃的駱駝背上。牽駱駝的老人走在前面，和團長低聲說話。'),
      NP('「那座城是假的。」老人說，「可身後的沙暴是真的。走進去，也許還有一條路。」'),
      NP('團長沉默了很久，最後只說了一句：「走吧。」'),
      { who: 'safira', mood: 'surprised', text: '「做決定的……不是我？」' },
    ],
    summary: '發燒的莎菲拉在駱駝背上，聽見牽駱駝的老人和團長商量。走進蜃樓，是團長決定的。',
  },
  // Story depth design §7.6 (fix six): the absolution still comes from the memory, but the turn is hers, now. She stops
  // for the first time, ankle rings silent, and thinks of them one by one before she goes to dance it out. The old joke
  // about the leader's push is gone (her jokes never touch the troupe). I-67.
  'mem:safira:5': {
    lines: [
      NP('蜃樓裡的城燒了起來，火順著沙丘一路燒開。團長把她推向那道快要合上的光。'),
      NP('「進來是我選的，不是妳的錯。」團長說，「妳要繼續跳。」'),
      N('莎菲拉在房裡轉著圈，忽然停下腳步。腳踝上的銅環，這次一聲也沒響。'),
      { who: 'safira', mood: 'sad', text: '「小洛，熾焰之地那片火海……就是我們的沙漠。等我一下，我想把他們一個一個想一遍。想完了，再去廣場替大家跳完。」' },
    ],
    summary: '團長在最後一刻把莎菲拉推出了蜃樓：妳要繼續跳。她第一次停下腳步，把團員一個一個想一遍，再去廣場替大家跳完。',
  },
  'chat:safira:1': {
    lines: [
      at(PL.plazaNight, N('夜裡的傳送門廣場。莎菲拉一個人踩著拍子轉圈，腳踝上的銅環叮叮作響。')),
      { who: 'hero', text: '「不累嗎？」' },
      { who: 'safira', mood: 'wink', text: '「累？跳舞的人不說這個字。倒是小洛，站在那裡偷看了我那麼久，門票就算你免費唷～」' },
    ],
    summary: '莎菲拉夜裡在廣場一個人跳舞。洛恩問她累不累，反被她抓到偷看了很久。',
  },
  'chat:safira:2': {
    lines: [
      { who: 'safira', mood: 'wink', text: '「凜凜，妳走路都沒聲音，天生是跳舞的料呀。跳一拍就好～」' },
      { who: 'rin', text: '「一拍過了，就有第二拍。再來第三拍。」' },   // ungated: may play after her oath, where guarded is the bellkeeper's
      { who: 'safira', mood: 'laugh', text: '「哈哈，被算得一清二楚！那換小洛上台──欸，主角別跑呀！」' },
    ],
    summary: '莎菲拉想教凜跳舞，被一口回絕。她轉頭找洛恩，洛恩跑了。',
  },
  // Task 9: Sylvie (spec §6, §11.2). The mire is her forest rotted. She led its people out, one family at a time, and turned
  // back last; she never says so herself until her last piece (style bible). Her last piece is the seed she has held since.
  'mem:sylvie:1': {
    lines: [
      NP('綠得發亮的林子。她在樹皮上刻下小小的箭頭，一棵接一棵，指向林外的路。'),
      NP('「迷了路，就跟著箭頭走。」她對林子裡的孩子說，「走到底，就出得去。」'),
      { who: 'sylvie', mood: 'sad', text: '「沼澤裡那些箭頭，是我刻的。那時候，那裡還是林子。」' },
      N('她從箭袋裡摸出一塊帶回來的樹皮，用指尖把箭頭上的泥，一點一點擦乾淨。'),
    ],
    summary: '希爾薇在沼澤的枯木上，認出自己刻的箭頭。腐毒沼澤，以前是她守的林子。',
  },
  'mem:sylvie:2': {
    lines: [
      NP('那一年，霧從林子深處漫了出來。樹從根開始發灰，一棵接著一棵。'),
      NP('她拉滿了弓，卻不知道該對著什麼射。霧是射不死的。'),
      { who: 'sylvie', mood: 'serious', text: '「沼澤那一帶，以前到處都是路。我閉著眼睛都走得出去。」' },
      N('希爾薇拿起弓，對著黑漆漆的窗外拉滿。找了很久，還是把弦放了。'),
    ],
    summary: '暮霧吞掉了希爾薇的林子。她拉滿了弓，卻沒有東西可以射。',
  },
  'mem:sylvie:3': {
    lines: [
      NP('她在霧裡牽著一個抱著嬰兒的女人，踩著樹上的箭頭，一棵一棵往外走。'),
      NP('林子邊上透進了光。她把那一家人推出去，自己轉身，又鑽回霧裡。'),
      { who: 'sylvie', mood: 'serious', text: '「才一家。林子裡的人，不只這些。」' },
      N('她說完就站了起來，背好弓，走到門口，又坐了回來。'),
    ],
    summary: '希爾薇在霧裡把一家人帶到林外，又轉身回去。她說才一家而已。',
  },
  'mem:sylvie:4': {
    lines: [
      NP('一趟又一趟。砍柴的、採藥的、迷路的獵人，一個一個跟著箭頭走出了霧。'),
      NP('最後一趟出來，林外的人點著火把，數了又數：「都出來了。一個也沒少。」'),
      { who: 'hero', text: '「妳把他們全都帶出去了。」' },
      { who: 'sylvie', mood: 'sad', text: '「那又怎樣。我還是沒守住林子。」' },
    ],
    summary: '希爾薇一趟又一趟，把林子裡的人全部帶了出去。她還是覺得，自己沒守住林子。',
  },
  // Story depth design §7.6 (fix six): the seed is the past; the turn is now. She would hand it to him to plant, he will not
  // take it, and she plants it herself: she brought everyone out, and this one she keeps for her own hands. I-63.
  'mem:sylvie:5': {
    lines: [
      NP('人都出來了，她才回頭，走進正在倒下的林子。最老的那棵樹落下最後一顆種子，她剛握進手心，霧就漫了上來。'),
      { who: 'sylvie', mood: 'serious', text: '「這顆種子我一直帶著。你拿去，找一塊空地替我種下去。」' },
      { who: 'hero', mood: 'smile', text: '「妳帶出來的，妳來種。」' },
      { who: 'sylvie', mood: 'smile', text: '「我把人都帶出去了。……這一顆，我自己種。」' },
    ],
    summary: '人都出來之後，希爾薇才回頭，帶出林子最後一顆種子。她想交給洛恩替她種，洛恩沒收，她便決定自己種。',
  },
  'chat:sylvie:1': {
    lines: [
      // Story L Task 12 (spec §10): the bed, moved here from chat:sylvie:2, one reading. Her reason is a hunter's (a soft bed
      // hears nothing); that she thinks she has no right to it stays under the line until her last piece (I-58, I-196).
      at(PL.innDeepNight, N('深夜的月影旅館。希爾薇把被子摺得方方正正，像一塊豆腐，自己卻抱著弓，靠在窗邊的牆上。')),
      { who: 'hero', text: '「那塊豆腐，是摺來看的？」' },
      { who: 'sylvie', mood: 'serious', text: '「床太軟，一躺下去，風聲都聽不見了。總要有人醒著，聽外面有沒有東西在走。」' },
    ],
    summary: '希爾薇在深夜把被子摺成一塊豆腐，自己抱著弓靠在窗邊。她說床太軟，總要有人醒著聽外面的動靜。',
  },
  'chat:sylvie:2': {
    lines: [
      // Story L Task 12 (spec §10): it waits for her memories told whole (`CHAT_GATE`), so it reads one way: her seed has
      // sprouted in the clearing (`home:sylvie`, continuity fix 2), she has seen it, and she takes the bed chat:sylvie:1 left.
      { place: PL.innDeepNight, who: 'narrator', text: '深夜的月影旅館。被子又摺成了豆腐。希爾薇抱著弓靠在窗邊，往樓下空地上的新芽看了一眼。' },
      { who: 'hero', text: '「今晚也醒著聽風？」' },
      { who: 'sylvie', mood: 'smile', text: '「新芽，我看過了。今晚我睡床。換你守窗。」' },
    ],
    summary: '希爾薇看過樓下空地上的新芽，第一次去睡床，換洛恩守窗。',
  },
  // Task 9: Noel (spec §6, §7.5). She stole her teacher's book; its star fire burns the caster's own memory; the teacher
  // forbade it to protect her. Her last piece holds the teacher's memory too: she gives it back at the merchant's stall.
  'mem:noel:1': {
    lines: [
      NP('深夜的書房。老師上了鎖的書櫃，被一根髮夾撬開了。'),
      NP('她抱出一本封面嵌著星星的書。翻開來，紙上的字像火一樣在跳。'),
      { who: 'noel', mood: 'pout', text: '「幹嘛那樣看我。是借的啦，只是沒說一聲。」' },
      N('她把那本書往背後藏了藏。封面的星星，從她指縫裡透出光來。'),
    ],
    summary: '諾艾兒想起自己撬開老師的書櫃，抱走了一本封面嵌著星星的魔法書。',
  },
  'mem:noel:2': {
    lines: [
      NP('老師一把闔上那本書，壓住了她的手：「這一頁，不准念。」'),
      NP('她甩開那隻手，抱著書跑出門，一路跑進了迷宮。'),
      { who: 'noel', mood: 'pout', text: '「小氣鬼。老師一定是怕我太厲害。」' },
      { who: 'noel', mood: 'sad', text: '「可是那時候，老師的手好冰。」' },
    ],
    summary: '老師不准諾艾兒念書裡的一頁。她甩開老師的手，抱著書逃進了迷宮。',
  },
  'mem:noel:3': {
    lines: [
      NP('迷宮裡，怪物撲了上來。她念出那一頁，掌心開出一朵藍白色的星火。'),
      NP('她低頭看著自己的手。剛才是從哪裡跑進來的，她想不起來了。'),
      { who: 'noel', mood: 'panic', text: '「不是迷宮偷走的……是我自己，用那一頁燒掉的。」' },
      { who: 'hero', mood: 'serious', text: '「那一頁，別再念了。」' },
    ],
    summary: '書裡的星火，每用一次就燒掉施法者的一段記憶。諾艾兒的失憶，是她自己燒掉的。',
  },
  // Story depth design §7.6 (fix six): the absolution is in the memory; the turn is hers, now. She tears the page out to hand
  // it back herself, and drops back to 「我」 (she means it). The rain joke is gone: there is no rain in the labyrinth. I-67.
  'mem:noel:4': {
    lines: [
      NP('出走的前一夜，她從門縫看見書房的燈還亮著。老師在那本書的空白處寫字。'),
      NP('「此術以記憶為薪。」老師低聲說，「那孩子要是學了，會連自己是誰都燒掉。」'),
      { who: 'noel', mood: 'sad', text: '「老師不教我，不是小氣，是怕我把自己燒光。」' },
      N('她把那一頁撕下來，摺得整整齊齊，收進最裡面的口袋：「這一頁，我不念了。我要親手還給老師。」'),
    ],
    summary: '老師不讓諾艾兒念那一頁，是怕她把自己燒光。她撕下那一頁，決定親手還給老師。',
  },
  'mem:noel:5': {
    lines: [
      NP('迷宮的入口。有人提著燈，一遍又一遍喊著她的名字，走進了暮霧。'),
      N('隔天一早，她跑到流浪商人的攤子前，把那一頁和裹著老師記憶的碎片，一起塞進他手裡。'),
      { who: 'merchant', text: '「諾艾兒──啊，我想起來了。比起那本書，妳平安就夠了。」' },
      { who: 'noel', mood: 'smile', text: '「老師，對不起。我回來了。」' },
    ],
    summary: '老師為了找諾艾兒也走進迷宮，成了失憶的流浪商人。她把老師的記憶還給他，師徒在攤前重逢。',
  },
  'chat:noel:1': {
    lines: [
      at(PL.innDeepNight, N('深夜的月影旅館。諾艾兒指尖點著一朵小電光，在筆記本上又寫又畫。')),
      { who: 'rin', text: '「那隻貓，畫得不錯。」' },   // V2: ungated, so it may play on either side of her oath: no guarded face, no particle
      { who: 'noel', mood: 'panic', text: '「那、那是雷獸！我的召喚獸啦！不准看，也不准再說貓！」' },
    ],
    summary: '諾艾兒深夜點著小電光畫筆記。凜說她的貓畫得不錯，她慌著說那是雷獸，不准看。',
  },
  'chat:noel:2': {
    lines: [
      // Until her last piece she calls him 「喂，歸來者」; after it, 「洛恩」, and she blushes first (style bible, I-25).
      { place: PL.plaza, who: 'narrator', text: '傳送門廣場。諾艾兒搶先一步，擋在洛恩前面。', if: { notMet: 'liz' } },   // with Liz the three lines are theirs
      { place: PL.plaza, who: 'noel', mood: 'smug', text: '「喂，歸來者！下一層的怪，全交給本小姐。本小姐的雷，可是很貴的。」', if: { notFull: 'noel' } },
      { place: PL.plaza, who: 'noel', mood: 'blush', text: '「洛、洛恩。下一層，我的雷借你們用。……免費。」', if: { full: 'noel' } },
      // V2: Liz, if met, prices the lightning (style bible pairing); once Noel's memories are whole, the free offer floors her.
      { who: 'liz', mood: 'scheming', text: '「很貴？我來估估看。小魔女這種雷，一發兩枚銅板。」', if: { met: 'liz', notFull: 'noel' } },
      { who: 'liz', mood: 'surprised', text: '「免費？小魔女，妳是不是被自己的雷劈到了？」', if: { met: 'liz', full: 'noel' } },
      { who: 'noel', mood: 'pout', text: '「才、才兩枚？！本小姐的雷，最少也要三枚！」', if: { met: 'liz', notFull: 'noel' } },
      { who: 'noel', mood: 'blush', text: '「吵、吵死了！借你們用，就是借你們用！」', if: { met: 'liz', full: 'noel' } },
      // Story depth plan Task 10 (ruling 15): the script's 「一起回來」 are the reveal's, chat:rin:4's and the finale's.
      { who: 'hero', text: '「好。記在公會的帳上。」', if: { notMet: 'liz', notFull: 'noel' } },
      { who: 'hero', text: '「好。這次就不記帳了。」', if: { notMet: 'liz', full: 'noel' } },
    ],
    summary: '出發前，諾艾兒搶先擋在洛恩前面，說下一層交給她的雷。',
  },
  // Task 9: Bobby (spec §6). Met on the main road at depth 6, so her lines sit in act 2: she may name the lamp she sees, not
  // what the acts tell of it (I-58). Her pieces build the lamp's plan and her ancestors' guilt; the last ends on the spec line.
  'mem:bobby:1': {
    lines: [
      NP('山谷裡的小工坊，牆上掛滿了扳手。小女孩踮起腳，打開一只上了鎖的鐵箱。'),
      NP('箱底壓著半張發黃的圖，畫著一道衝上天的光柱。'),
      { who: 'bobby', mood: 'excited', text: '「那是星燈！我家的祖先，畫過星燈的圖！」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，只看到半張。剩下的，我得一片一片想起來。」' },
    ],
    summary: '波比想起家裡鐵箱底的半張舊圖。圖上畫的，是星燈。',
  },
  'mem:bobby:2': {
    lines: [
      NP('山谷外的村子。她報出家裡的名號，村裡卻沒有一個人聽過。'),
      NP('家裡最老的工匠只是笑：「被忘掉，是我們自己選的。祖先做錯了事，後人就躲起來。」'),
      { who: 'bobby', mood: 'sad', text: '「被時間忘掉的一族，說的就是我們家。」' },
      { who: 'bobby', mood: 'serious', text: '「洛恩哥，那時候我沒敢問：祖先到底做錯了什麼？」' },
    ],
    summary: '波比的一族被時間遺忘了。家裡的老工匠說，祖先做錯了事，後人才躲了起來。',
  },
  'mem:bobby:3': {
    lines: [
      N('構造圖又拼上了一角。燈的開口畫得好大，大得像一張嘴。'),
      N('旁邊是祖先的字：「無論何種記憶，皆可收納。」底下另一個筆跡，只寫了兩個字：「錯了。」'),
      { who: 'bobby', mood: 'focused', text: '「什麼記憶都能裝……所以，連不該裝的，也全裝進去了。」' },
      { who: 'bobby', mood: 'sad', text: '「洛恩哥，這張圖，我第一次沒辦法說它畫得好。」' },
    ],
    summary: '構造圖上，祖先把星燈造得什麼記憶都能裝。旁邊有人補了兩個字：錯了。',
  },
  'mem:bobby:4': {
    lines: [
      NP('老工匠把那半張圖交到她手上：「祖先造的機兵，還守在星燈底下。去看看它們吧。」'),
      NP('神殿裡倒著一台機兵。它胸口的記號，和圖上畫的一模一樣。'),
      { who: 'bobby', mood: 'sad', text: '「這些機兵，是我家的人造的。每修好一台，就像替祖先道一次歉。」' },
      N('洛恩想起相遇那天，她趴在機兵的胸口，連怪物圍過來都沒發現。'),
    ],
    summary: '老工匠要波比去看祖先造的機兵。她修機兵，是想替祖先道歉。',
  },
  'mem:bobby:5': {
    lines: [
      N('最後一角拼上了。整張構造圖在她眼前亮起來，齒輪和管線，一條一條連上。'),
      { who: 'bobby', mood: 'serious', text: '「看懂了。燈芯少一道閥，只會吞，不會還。可是閥第一次點火，要一段回不來的光。」' },
      { who: 'hero', text: '「修得好嗎？」' },
      { who: 'bobby', mood: 'smile', text: '「祖先造錯的東西，我來修好。」' },
    ],
    summary: '波比讀懂了整張構造圖：燈芯少一道閥，第一次點火要一段回不來的光。她說她來修好。',
  },
  'chat:bobby:1': {
    lines: [
      { who: 'bobby', mood: 'excited', text: '「洛恩哥，劍借我看一下下！這紋路刻得好深，刻的人一定熬了好幾個晚上！」' },
      { who: 'hero', text: '「妳上一次說『一下下』，是午飯前。」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，再一下下！這不是刻好看的喔。是有人很認真、很認真地做過它。」' },
    ],
    summary: '波比盯著洛恩的劍，說上面的紋路不像是刻好看的。',
  },
  'chat:bobby:2': {
    lines: [
      at(PL.innKitchen, N('月影旅館的廚房冒出一陣白煙。波比抱著一支會自己轉的湯勺，臉上全是灰。')),
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，彈簧上得太緊，它自己從鍋子裡轉出去了！瑪莎阿姨，再一次，一下下就好喔！」' },
      { who: 'marta', text: '「孩子，湯我自己攪。今天的日記就寫『湯勺離家出走』，畫一個圈。先去洗臉。」' },
    ],
    summary: '波比做了一支會自己轉的湯勺，弄得旅館廚房一陣白煙。瑪莎要她先去洗臉。',
  },
  // Task 10: Liz (spec §6, §7.5). She came to pay her family's debt and forgot their faces. Each piece narrows where home
  // is (a shop, its credit, the lamp's light overhead) without naming it; her last piece gives back her father's face. Only
  // when Orik's own fragment is back does the voice in that memory carry his name: the reveal waits for both (揭露表).
  'mem:liz:1': {
    lines: [
      NP('擺滿瓶罐的小店。小女孩趴在櫃檯上，把冒險者拿來換藥的一枚舊銀幣舉到燈下。'),
      NP('「丫頭，這個值多少？」櫃檯後面的人笑著問。她答對了，頭髮就被一隻大手揉亂。'),
      { who: 'liz', mood: 'hushed', text: '「估價的本事，是在那裡學的。」' },
      N('莉茲伸手揉了揉自己的頭髮，揉亂了，又慢慢理好。'),
    ],
    summary: '莉茲想起小時候，在一間小店的櫃檯學估價。教她的人，她想不起臉。',
  },
  'mem:liz:2': {
    lines: [
      NP('深夜。她從樓梯的縫往下看，櫃檯的燈還亮著，有人一枚一枚數著銅幣。'),
      NP('牆上釘著一疊借據，每一張都寫著「回來再付」。寫下它們的冒險者，很多都沒有回來。'),
      { who: 'liz', mood: 'hushed', text: '「賒出去的東西收不回來，進貨的錢就還不出去。家裡的債，是這樣來的。」' },
      { who: 'liz', mood: 'serious', text: '「所以我才進迷宮。挖到寶藏換成錢，債就還得完了。」' },
    ],
    summary: '莉茲想起家裡的債：賒給冒險者的帳，人沒回來，錢也沒回來。她是為了還債，才進了迷宮。',
  },
  'mem:liz:3': {
    lines: [
      NP('天還沒亮。她把那頂紅帽子掛在門後，留下一張字條：「等我把寶藏帶回來。」'),
      NP('她推開門。屋頂的上方，一道好大的光柱直直衝上夜空。'),
      { who: 'liz', mood: 'hushed', text: '「那道光，近得像就在屋頂上。……老大，我家離星燈很近。」' },
      { who: 'liz', mood: 'sad', text: '「帽子留在門後了。說好了，回家再戴。」' },
    ],
    summary: '莉茲想起出門的那個清晨。她把紅帽子留在門後，說好回家再戴。她的家，離星燈很近。',
  },
  'mem:liz:4': {
    lines: [
      NP('寶庫的門在她身後闔上了。黑暗裡，金幣堆成的小山閃著光。'),
      NP('她一枚一枚地數。數到肚子不再叫，數到忘了這些錢要拿去還給誰。'),
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
      NP('傍晚的店門口。那張臉終於從霧裡浮了出來：鬍子扎人，一笑起來，眼睛就瞇成一條線。'),
      { who: 'narrator', past: true, text: '「回來啦，丫頭！」他張開雙手，把她連人帶帽子抱了起來。', if: { notReturned: 'orik' } },
      { who: 'orik', text: '「妳出門那天掛在門後的紅帽子，爸爸到現在都沒收。……是妳吧，丫頭，爸爸認得妳了。」', if: { returned: 'orik' } },
      { who: 'liz', mood: 'hushed', text: '「想起來了，是爸爸！……奇怪，這張臉，我最近好像在鎮上見過？」', if: { notReturned: 'orik' } },
      { who: 'hero', text: '「歐里克說過，他想起女兒的臉了。」', if: { returned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「老大，爸爸的臉，我不會再弄丟了。總有一天，換我自己走回家。」', if: { notReturned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「是爸爸。那頂帽子，是我掛的。老大，我們回家吧，換我在店門口喊『我回來了』。」', if: { returned: 'orik' } },
    ],
    summary: '莉茲終於想起了父親的臉，和每天傍晚在店門口等她回家的那個人。她要回家了。',
  },
  'chat:liz:1': {
    lines: [
      // Read right before and after any of her pieces: the hunger is her meeting's, not a memory (I-58).
      at(PL.innDinner, N('月影旅館的晚餐桌。莉茲把第三塊麵包，若無其事地塞進了口袋。')),
      { who: 'hero', text: '「口袋裡，還放得下？」' },
      { who: 'liz', mood: 'scheming', text: '「這叫存糧，老大。人會走，麵包不會。分你一塊？旅館價三枚銅板，算你兩枚。」' },
    ],
    summary: '旅館的晚餐桌上，莉茲把麵包塞進口袋。她說這叫存糧：人會走，麵包不會。',
  },
  'chat:liz:2': {
    lines: [
      // Until her last piece the faces at home are gone; after it she has her father's, but the text still does not name him.
      at(PL.innDeepNight, N('深夜的旅館房間。莉茲把今天分到的錢收進一只舊布袋，袋口綁了一個又一個死結。')),
      { who: 'hero', text: '「綁成這樣，賊都會放棄。家裡有人在等？」' },
      { who: 'liz', mood: 'hushed', text: '「嗯。臉想不起來，可是一定有人在等。」', if: { notFull: 'liz' } },
      { who: 'liz', mood: 'smile', text: '「嗯。爸爸的臉，想起來了。這些錢，我要親手交到他手上。」', if: { full: 'liz' } },
    ],
    summary: '莉茲深夜把分到的錢收進舊布袋。洛恩問她，家裡是不是有人在等。',
  },
  // Task 10: Scarlet (spec §6). The iron fortress was her kingdom; she believes she turned and fled from her gate. Her last
  // piece is the princess's order: 「妳不是盾，妳是我的朋友。活下去。」 From there she guards by choice, not by oath.
  'mem:scarlet:1': {
    lines: [
      NP('石造的大殿，火盆燒得正旺。她單膝跪地，把劍橫舉過頭頂。'),
      NP('「以我的劍起誓。」她高聲說，「從今以後，我是您的盾。」'),
      { who: 'scarlet', mood: 'shaken', text: '「『從今以後，我是您的盾。』這一句，我一個字也沒有忘。」' },
      N('念到「您」的時候，她停了一下。按著劍柄的手，很久都沒有放開。'),
    ],
    summary: '絲嘉蕾想起受封為騎士的那天，她以劍起誓，要做某個人的盾。那個人是誰，她想不起來。',
  },
  'mem:scarlet:2': {
    lines: [
      NP('鋼鐵的城牆上飄著紅旗。城下的街道，擠滿了趕集的人。'),
      NP('那一夜，暮霧從城牆的裂縫湧了進來。怪物跟著霧，爬上了城牆。'),
      { who: 'scarlet', mood: 'sad', text: '「那座要塞……是我家。」' },
      N('絲嘉蕾把盾轉過來，用袖口擦了擦上面的紋章。'),
      { who: 'scarlet', mood: 'serious', text: '「洛恩閣下，我們相遇的那扇城門，就是我的崗位。」' },
    ],
    summary: '鋼鐵要塞曾經是絲嘉蕾的國家。暮霧湧進城牆的那一夜，迷宮把它整個吞了下去。',
  },
  'mem:scarlet:3': {
    lines: [
      NP('火光裡，城門被撞得一下一下地震。她背對著城門，往城裡跑。'),
      NP('她身後，號角一聲接著一聲。她沒有回頭。'),
      { who: 'scarlet', mood: 'shaken', text: '「我轉身了。……在城門最需要我的時候，我逃了。」' },
      { who: 'hero', text: '「那些號角，是為了什麼吹的？」' },
    ],
    summary: '絲嘉蕾想起城門快被攻破時，自己背對城門往城裡跑。她認定，自己臨陣脫逃了。',
  },
  'mem:scarlet:4': {
    lines: [
      NP('王城的庭院。公主提著木劍追著她跑，裙襬沾滿了草屑。'),
      NP('「別叫我殿下。」公主笑著說，「在這裡，我們只是一起練劍的人。」'),
      { who: 'scarlet', mood: 'sad', text: '「我立誓守護的人，是公主殿下。她總是不讓我這樣叫她。」' },
      { who: 'scarlet', mood: 'shaken', text: '「而我卻把她一個人留在了城門後面。」' },
    ],
    summary: '絲嘉蕾想起誓言守護的人：和她一起練劍長大的公主。她以為，自己把公主丟在了城門後面。',
  },
  // Story depth design §7.6 (fix six): the princess's words are the past; the turn is hers, now. The horns were the retreat:
  // she was told to live, and kept trying to die for others. She moves her shield from in front of him to beside him, a
  // narrated pause, then her first plain 「洛恩」. No 「選」 (I-78).
  'mem:scarlet:5': {
    lines: [
      NP('城門快要倒下的時候，公主把她推進撤退的密道：「這是命令。妳不是盾，妳是我的朋友。活下去。」'),
      { who: 'scarlet', mood: 'sad', text: '「那些號角，是撤退的號角。她要我活下去，我卻一直想替人死。」' },
      N('絲嘉蕾把盾從洛恩身前移開，站到他旁邊。她停了一下，才開口。'),
      { who: 'scarlet', mood: 'serious', text: '「洛恩，從今天起，我站這裡。」' },
    ],
    summary: '公主下令絲嘉蕾撤退，要她活下去。她不是逃走的。她把盾從洛恩身前移開，站到他旁邊。',
  },
  'chat:scarlet:1': {
    lines: [
      // Read right before and after any of her pieces: a knight keeping watch is her meeting's, not a memory (I-58).
      at(PL.plazaDeepNight, N('深夜的傳送門廣場。絲嘉蕾佩著劍站在門前，一動也不動。')),
      { who: 'glen', text: '「喂，騎士大人。守門是我的工作，妳回去睡。別逞強。」' },
      { who: 'scarlet', mood: 'serious', text: '「遵命。守夜表已排定。葛倫先生，明晚第二班，請勿遲到。」' },
    ],
    summary: '絲嘉蕾深夜站在傳送門前守夜，被葛倫趕回去睡。她領命，順手把葛倫排進了守夜表。',
  },
  'chat:scarlet:2': {
    lines: [
      // Until her last piece she calls him 「洛恩閣下」 and shields him as a duty; after it, 「洛恩」, by choice (I-26).
      // Story L Task 15: spec §10 meant to write the 「閣下」 off, but the two readings split on what her last piece undoes (the
      // debt, the duty), so both stay.
      N('回城的路上，絲嘉蕾的盾上，又多了一道新的凹痕。'),
      { who: 'hero', text: '「盾比我還常受傷。剛才那一下，不必替我擋。」' },
      { who: 'scarlet', mood: 'serious', text: '「洛恩閣下，盾本來就是用來受傷的，替人擋刀也是騎士的職責。只是總覺得……我還欠著某個人。」', if: { notFull: 'scarlet' } },
      { who: 'scarlet', mood: 'smile', text: '「洛恩，我是站在你旁邊擋的，不算替你。順手而已。」', if: { full: 'scarlet' } },
    ],
    summary: '絲嘉蕾又替洛恩擋下了一擊。洛恩說不必，她說了自己的理由。',
  },
  // Task 14: the finale (spec §8.4, §3.4, §3.6, §6; lore ledger I-109 to I-115), rewritten by story depth Task 16 (design §7.5,
  // ruling d) and story L Task 14 (spec §9). It opens where the hero's 10th piece ends and always follows Rin's choice (U3): no
  // `if.oath`. Lorne means to burn this round's days and says what the lamp takes; each companion gives a night she shared
  // with him anyway, believing it lost (met), or Lorne hears her in the lamp and names her (not met); Bobby closes the eight
  // with her valve and its rule (her fifth piece); Lorne pays its first light with the ten pieces he found; Rin's hand on his;
  // the bell, handed over without a word, and the keeper's last; Rin's last word. Seventeen lines in every party (R8: the
  // faces fading after his cost; story L Task 14 cold read: one line more, why the lamp took none of theirs); the two 「……」
  // are Lorne's and Rin's.
  finale: {
    lines: [
      { who: 'hero', mood: 'resolve', text: '「這一輪走過的每一天，就是這一次的燈芯。送到這裡就好。」' },
      { who: 'hero', mood: 'serious', text: '「這盞燈只收記憶，收了就不還。」' },   // final review: hero-alone already says 「燈要的是記憶」
      // Story L Task 14 (spec §9): each one gives back a night she shared with him. Seen: the group scene she was in, and what it
      // left on the table (`if.seen`; a group scene can expire, spec §5.2). Missed: one of the nights at the inn, the habit her
      // night beats show (style bible §2.2: no two share a role). Not met: Lorne hears her in the lamp (I-112). No reading
      // turns on her pieces, so none names him in a way that does; none gives back the minute they met.
      { who: 'selene', mood: 'wistful', text: '「那枚銅板我還收著，再也不丟了。我自己說──這一段，給燈。」', if: { met: 'selene', seen: 'group:act2' } },
      { who: 'selene', mood: 'smile', text: '「看月亮的時候，我總會順便看看，明天大家回不回得來。這次不問月亮了──這一段，給燈。」', if: { met: 'selene', notSeen: 'group:act2' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有一段光在讀月亮。瑟蕾，還沒找到妳，但我記住妳了。」', if: { notMet: 'selene' } },
      { who: 'noel', mood: 'pout', text: '「袖子裡這一片，藏到今天了。拿去吧，本小姐自己交出去。」', if: { met: 'noel', seen: 'group:act2' } },
      { who: 'noel', mood: 'pout', text: '「旅館的燈一暗，都是本小姐點小雷光，你每次都說剛好。這次不點雷光了，這一段，本小姐親手交出去。」', if: { met: 'noel', notSeen: 'group:act2' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有人快把自己的雷燒乾了。諾艾兒，一起回去吧。」', if: { notMet: 'noel' } },
      { who: 'sylvie', mood: 'unguarded', text: '「你不肯問，我就去睡了門邊。今晚不用守了──這一段，給燈。」', if: { met: 'sylvie', seen: 'group:act3' } },
      { who: 'sylvie', mood: 'unguarded', text: '「我靠窗聽風的那些晚上，你都睡得很沉。那些風聲，給燈。」', if: { met: 'sylvie', notSeen: 'group:act3' } },
      { who: 'hero', mood: 'distant', text: '「燈裡還有一支箭在射。希爾薇，不用再一個人守了。」', if: { notMet: 'sylvie' } },
      { who: 'liz', mood: 'smile', text: '「老大，錢袋還擺在公會的桌上，一枚都沒少。回去記得拿。」', if: { met: 'liz', seen: 'group:act4' } },
      { who: 'liz', mood: 'smile', text: '「老大，這枚是我每晚數的第一枚銅板。這次不數了，給燈。」', if: { met: 'liz', notSeen: 'group:act4' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有人數著吃不下的金幣。莉茲，家裡有人在等。」', if: { notMet: 'liz' } },
      { who: 'safira', mood: 'smile', text: '「我坐得好好的，哪裡也不去。小洛，你也別跑。」', if: { met: 'safira', seen: 'group:act4' } },
      { who: 'safira', mood: 'smile', text: '「小洛，你的腳在桌子底下偷偷跟著我的拍子，我都看見了。最後這一拍，敲在燈上。」', if: { met: 'safira', notSeen: 'group:act4' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有人一個人跳著舞，等誰接上拍子。莎菲拉，我會去接。」', if: { notMet: 'safira' } },
      { who: 'scarlet', mood: 'vow', text: '「想替你當燈芯，被罵回來兩次。好，我不替你──我站你旁邊。」', if: { met: 'scarlet', seen: 'group:act4' } },
      // Cold read: the fallback's eight were one template; Scarlet, who reports everything, says nothing here.
      { who: 'narrator', text: '絲嘉蕾沒有開口。她把盾靠上燈座，站到洛恩身側，行了一個騎士禮。', if: { met: 'scarlet', notSeen: 'group:act4' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有個騎士還守著城門，不肯轉身。絲嘉蕾，劍可以放下了。」', if: { notMet: 'scarlet' } },
      { who: 'chizuru', mood: 'solemn', text: '「洛恩大人，祭歌的後半我改了。我們那時候沒人敢改，我改成：提燈的人，會回來。那一夜，交給燈。」', if: { met: 'chizuru', seen: 'group:act4' } },
      { who: 'chizuru', mood: 'solemn', text: '「洛恩大人，我每晚在紙上添一道。冰裡的日子數不清，跟大家過的，一道一道都在。這一段，交給燈。」', if: { met: 'chizuru', notSeen: 'group:act4' } },
      { who: 'hero', mood: 'distant', text: '「燈裡有人還在念沒念完的祝詞。千鶴，封印可以停下了。」', if: { notMet: 'chizuru' } },
      // The valve and its rule (Bobby's fifth piece, design fix four) close the eight in every reading. Her whole chain keeps its
      // own line: her family made his sword (I-46, foreshadowing 14), a fact only her pieces give her, so it is the one place
      // the finale still reads a chain. Before it: seen, the bell she did not take apart; missed, the wicks she trims each night.
      { who: 'bobby', mood: 'focused', text: '「洛恩哥，做這把劍的，是我家的人。閥裝好了，這次真的一下下。只是第一次點火，要一段回不來的光。」', if: { met: 'bobby', full: 'bobby' } },
      { who: 'bobby', mood: 'focused', text: '「這個閥我拆拆裝裝幾十次了，凜姊的鐘倒是一次也沒碰──好，裝上了！只是第一次點火，要一段回不來的光。」', if: { met: 'bobby', notFull: 'bobby', seen: 'group:act3' } },
      { who: 'bobby', mood: 'focused', text: '「旅館的蠟燭，我都替它們剪芯，剪平了，火才不跳。閥也一樣──好，裝上了！只是第一次點火，要一段回不來的光。」', if: { met: 'bobby', notFull: 'bobby', notSeen: 'group:act3' } },
      { who: 'hero', mood: 'distant', text: '「燈座上刻著：閥初次點火，須一段不歸之光。波比，造燈那一族的孩子，這道閥我替妳補上。」', if: { notMet: 'bobby' } },
      // The cost (ruling d): the ten pieces he found, given as the light that does not come back; 「要回來」 kept (mem:hero:10).
      { who: 'hero', mood: 'resolve', text: '「那就用我找回來的那十段記憶。我答應過那個人要回來……我回來了。」' },
      // Final review: whose memories the lamp kept. It took his ten as the light that does not come back, and so none of theirs.
      N('光從劍上流進燈裡。十段記憶裡那些他一張也不肯忘的臉，一張一張淡了，再也不會回到他身上。'),
      // Cold read (story L Task 14): the gifts were not wasted. The lamp takes the keeper's ten and nothing of theirs; they keep
      // what they held out, and will tell it back to him (the festival: Marta reads him the diary).
      N('燈只收下他的十段。大家遞出去的，原封不動留在她們手裡──往後總得有人說給他聽。'),
      N('凜的手疊上他握著燈鑰的手。燈穩了下來，碎片的光回到每一個弄丟它的人身上，他的除外。暮霧散了。天亮時，沒有一個人鬆開手。'),
      // Ruling a: she hands the flattened bell over without a word; the keeper says the truth himself (story polish ruling 7).
      N('回到鎮上，凜把那枚再也敲不響的小銅鐘還給鐘守，一句話也沒說。他敲響結社的鐘，最後一聲。'),
      { who: 'bellkeeper', text: '「每殺一個守燈人，燈就晚一輪亮……我們管那叫守住。市集那一刀，也是我。靜鐘會，到此為止。」' },
      // Coordinator ruling (T14): Rin closes the game, echoing Lorne's line from her reveal; 「大家」 makes it everyone's.
      { who: 'rin', mood: 'smile', text: '「洛恩，明天……大家也一起回來吧。」' },
    ],
    summary: '燈喰之母倒下了。洛恩把找回的十段記憶交給了燈，閥點亮了星燈，大家都回來了。從深處走出來的，再也不是一個人。',
  },
  // Story depth Task 2 (design §7.5; controller ruling d: pulled from 6e into the main line): the lantern festival, the first
  // return after the finale. The main line's six core lines (plan Task 2's wording); 6e may add at most ten (affinity spec §8.5).
  epilogue: {
    lines: [
      at(PL.festival, N('終幕之後的第一個晚上，鎮上第一次辦了星燈祭。廣場掛滿了燈。')),
      { who: 'marta', text: '「洛恩，坐下。今天的日記，我念給你聽。」' },
      { who: 'marta', text: '「第一頁：兩個孩子倒在門口。名字是安娜取的。」' },
      // Controller ruling (Task 2 review): the townsfolk returns fold into Marta's and Anna's beats, not added lines (affinity
      // spec §8.5: hopeful, 「有了消息」「找到一張登記表」; the whole of it is left to 6e's marta-diary and anna-name).
      { who: 'marta', text: '「每一頁最上面那一行，都一樣：回來了。」', if: { notReturned: 'marta' } },
      { who: 'marta', text: '「每一頁最上面那一行，都一樣：回來了。我家那口子，也有消息了。」', if: { returned: 'marta' } },
      { who: 'narrator', text: '安娜從公會抱來一疊登記表，翻開最上面那一張，洛恩的。最後一欄填著：回來了。', if: { notReturned: 'anna' } },
      { who: 'narrator', text: '安娜從公會抱來一疊登記表，翻開最上面那一張，洛恩的。最後一欄填著：回來了。底下壓著一張舊的，寫著她同伴的名字。', if: { returned: 'anna' } },
      { who: 'hero', mood: 'smile', text: '「以前的每一輪，我一句也不記得。這一輪，有人念給我聽。」' },
    ],
    summary: '終幕之後，鎮上第一次辦了星燈祭，瑪莎把日記念給洛恩聽，每一頁最上面都寫著回來了。',
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
      at(PL.shopClosed, N('道具店，打烊以後。歐里克把碎片捧在掌心。嗓門大了一輩子的人，半天說不出一句話。')),
      { who: 'orik', text: '「小兄弟，我想起來了。是我女兒的臉。她一笑，眼睛就瞇成一條線，跟我一個樣。」' },
      { who: 'orik', text: '「想起來的，是她出門那年的臉，還是個小丫頭。現在長成什麼模樣，老頭子我可猜不著。」' },
      { who: 'orik', text: '「門後還掛著一頂紅帽子，是她的。這些年，我一直沒捨得收。」' },
      { who: 'orik', text: '「壓箱底的好貨，我賣了。這三百金幣是謝禮。往後店裡的東西，都算你便宜一成！」' },
      { who: 'narrator', text: '店門被推開了。莉茲站在門口，看著門後那頂紅帽子，一步也沒有動。', if: { full: 'liz' } },
      { who: 'liz', mood: 'sad', text: '「爸爸。我回來了。」', if: { full: 'liz' } },
      { who: 'orik', text: '「丫頭？……是妳啊。妳看那頂帽子的樣子，爸爸認得。它還等著妳戴呢。」', if: { full: 'liz' } },
    ],
    summary: '歐里克想起了女兒小時候的臉。門後那頂紅帽子，他一直沒捨得收。他賣了壓箱底的好貨當謝禮，往後也算便宜一成。',
  },
  marta: {
    lines: [
      at(PL.innKitchen, N('月影旅館的廚房。瑪莎把碎片貼在胸口，爐上的湯咕嘟咕嘟地響。')),
      { who: 'marta', text: '「想起來了。他走的那天早上，我也在煮這鍋湯。」' },
      { who: 'marta', text: '「他是冒險者。出門前說：『回來的時候，把今天的事說給我聽。』」' },
      { who: 'marta', text: '「我一直怕，那天沒跟他說路上小心。……原來說了。追到門口，說了兩次。」' },
      { who: 'marta', text: '「那本日記，原來是寫給他的。他回來的時候，我要說得出每一天。」' },
      { who: 'hero', mood: 'normal', text: '「那以後就不用寫了？」' },
      { who: 'marta', text: '「還是會寫。現在想記住的事變多了。你們的事，一件也不想漏。」' },
      { who: 'marta', text: '「這兩根復活羽毛，是他留在家裡的，你們帶著。往後的飯菜，我多添一道。」' },
    ],
    summary: '瑪莎想起丈夫出門的那個早上，她說了路上小心。日記原本是寫給他的；往後她還是會寫，因為想記住的事變多了。',
  },
  anna: {
    lines: [
      at(PL.guildClosed, N('冒險者公會，打烊以後。安娜從櫃子最底層，抽出一張發黃的失憶登記表。')),
      { who: 'anna', text: '「這一張是我的。名字那一欄的『安娜』，是上一任公會長取的。『名字總要有一個』，是他說的。」' },
      { who: 'anna', text: '「緹雅。進迷宮之前，我叫這個名字。我也當過冒險者。」' },
      { who: 'anna', text: '「我們四個人，提著同一盞燈下去。隊長總說，一起下去的，算同一盞燈。」' },
      { who: 'anna', text: '「暮霧湧上來的時候，我鬆開了手。……再醒來，已經躺在公會的床上了。」' },
      { who: 'hero', mood: 'serious', text: '「其他三個人呢？」' },
      { who: 'anna', text: '「不知道。可是他們的名字，我想起來了。他們的登記表，我會一張一張找。」' },
      { who: 'anna', text: '「收購價我會調高，碎片都是拚了命帶上來的。這顆星燈之淚，是我們當年帶上來的，給你們。」' },
    ],
    summary: '安娜想起了進迷宮之前的名字。她也當過冒險者，在暮霧裡鬆開了同伴的手。她要找回同伴們的登記，也調高了碎片的收購價。',
  },
  glen: {
    lines: [
      at(PL.plazaBeforeDawn, N('傳送門廣場，天還沒亮。葛倫站在門前，盯著那三座門看了很久。')),
      // Story depth Task 18 (design §7.3, controller ruling b): the morning, then the young man in the robe he pointed the
      // way, and why his body stood at the gate before dawn all act 3 (townLines.act3). He never learns who the young man
      // was, so he names no society; the keeper's line that answers this waits for this piece (bellkeeper.oath, I-185).
      { who: 'glen', text: '「我想起來了，小子。那年我十七，剛當上守門的。天還沒亮，門自己亮了。」' },
      { who: 'glen', text: '「走出來一個渾身是灰、拖著劍的男人，長得跟你很像。走沒幾步，就倒在我腳邊。」' },
      { who: 'glen', text: '「倒下前，他還笑了一下：『門還開著啊。』這句話我掛在嘴邊幾十年，沒想到是跟他學的。」' },
      { who: 'hero', mood: 'distant', text: '「那個人，後來呢？」' },
      { who: 'glen', text: '「幾天後，一個穿長袍的年輕人來問，從門裡出來的那個人住在哪裡。我說了，還替他指了路。」' },
      { who: 'glen', text: '「後來那個人就不在了。……我天沒亮就站在這裡，原來是為了這個。」' },
      { who: 'glen', text: '「這一次，我記住了，洛恩。五百金幣，守門攢的，拿去買藥。哪扇門不合意，我替你換。」' },
    ],
    summary: '葛倫想起十七歲那年，門裡走出一個像洛恩的男人。幾天後，他替一個穿長袍的年輕人指了路。這一次，他記住了洛恩。',
  },
  doran: {
    lines: [
      at(PL.forge, N('鍛造屋。多蘭握著碎片站在爐前，風箱停了很久。')),
      { who: 'doran', text: '「師父的手法，我在鋼鐵要塞弄丟了。」' },
      { who: 'doran', text: '「年輕時下去找要塞的鐵。鐵扛回來了，手卻忘了怎麼打它。」' },
      { who: 'doran', text: '「師父按著我的手說：『別看火，聽鐵。鐵唱起來的那一下，就是火候。』」' },
      { who: 'hero', mood: 'serious', text: '「現在聽得見了嗎？」' },
      N('多蘭拉起風箱。爐火一亮，燒紅的鐵塊發出一聲細細的鳴響。'),
      { who: 'doran', text: '「聽見了。差的那一點，原來在耳朵裡。」' },
      { who: 'doran', text: '「洛恩，這塊王者之鱗是師父留給我的，拿去。套裝的配方，往後少兩份料就打得成。」' },
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
      at(PL.edgeMorning, N('幾天後的清晨，鎮邊。一座小小的祠立在路旁，屋簷下掛著那枚鈴。')),
      { who: 'chizuru', mood: 'solemn', text: '「洛恩大人，祠是小了點，可是鈴一響，此處就是神社了。」' },
      N('賣菜的老婆婆路過，合了合掌，又在祠前放了一根白蘿蔔。風一吹，鈴響了一聲。'),
      { who: 'chizuru', mood: 'smile', text: '「第一份供品是白蘿蔔，我們那裡也是這樣供的。春祭時請務必來看。……這一回，我會等到春祭。」' },
    ],
    summary: '千鶴在露米亞的鎮邊蓋了一座小祠，掛上神主託付的鈴。鈴一響，這裡就是她為現在的人守著的神社。',
  },
  safira: {
    lines: [
      at(PL.squareDusk, N('黃昏的廣場。莎菲拉赤著腳站在石板中央，腳踝上的銅環輕輕一響。')),
      N('鎮上的人圍了過來。沒有鼓，也沒有笛。守門的葛倫打著呵欠，第一個拍起了手，替她打拍子。'),
      { who: 'safira', mood: 'smile', text: '「這拍子比鼓手還準呀──團長和大家，都看好了。」' },
      N('她跳完最後一步，深深鞠了一躬。拍手聲響了很久，很久都沒有停。'),
    ],
    summary: '莎菲拉在露米亞的廣場，跳完舞團最後的那支舞。鎮上的人都來看，替她打拍子。',
  },
  sylvie: {
    lines: [
      at(PL.innDawn, N('幾天後的清晨，月影旅館。希爾薇站在窗邊，看著樓下那塊空地，看了很久。')),
      N('她種下的那顆種子，冒出了兩片小小的葉子。旁邊插著三支箭，圍成一圈，像在站崗。'),
      { who: 'sylvie', mood: 'surprised', text: '「發芽了。」' },
      { who: 'sylvie', mood: 'smile', text: '「洛恩，林子會從這裡重新長起來。先得跟後院那隻貓講好，不准在這裡挖。」' },
    ],
    summary: '希爾薇種在旅館窗外空地的種子發芽了。她說林子會從這裡重新長起來。',
  },
  liz: {
    lines: [
      { place: PL.shopEvening, who: 'narrator', text: '傍晚的道具店。莉茲推開店門，取下門後那頂紅帽子，戴在頭上。', if: { notReturned: 'orik' } },
      { who: 'orik', text: '「喂，那頂不賣！店裡什麼都賣，就它不賣。它一直掛在門後。奇怪，妳這張臉，老頭子我怎麼就是想不起來？」', if: { notReturned: 'orik' } },
      { who: 'liz', mood: 'hushed', text: '「沒關係。等你想起來，我再戴。」', if: { notReturned: 'orik' } },
      { who: 'narrator', text: '她把帽子掛回門後，回頭笑了一下。櫃檯後面的人撓著頭，也跟著笑了。', if: { notReturned: 'orik' } },
      { place: PL.shopEvening, who: 'narrator', text: '傍晚的道具店。莉茲推開店門，從門後取下那頂紅帽子戴上，深深吸了一口氣。', if: { returned: 'orik' } },
      { who: 'liz', mood: 'smile', text: '「我回來了，爸爸！今天的帳，交給我來對！」', if: { returned: 'orik' } },
      { who: 'orik', text: '「回來啦，丫頭！帽子戴歪了，過來讓爸爸替妳扶正。」', if: { returned: 'orik' } },
      { who: 'narrator', text: '櫃檯上擺著一枚舊銀幣。他笑著問：「丫頭，這個值多少？」', if: { returned: 'orik' } },
    ],
    summary: '莉茲回到道具店的門口。那頂紅帽子一直在門後等她；認得她的人，會笑著問她這個值多少。',
  },
};

/**
 * Time and moon ruling 7 (lore ledger I-200): the spring festival at Chizuru's shrine, the first spring night after her
 * homecoming once the finale is over. Two readings: with `group:act4` seen she stops a beat where she used to stop singing;
 * without it she first tells the children what the old second half said, and that she changed it this year.
 */
const SEASON: Partial<Record<Season, Written>> = {
  spring: {
    lines: [
      at(PL.shrineSpringNight, N('冬天過去了。鎮邊小祠的屋簷下掛滿紙燈，祠前的供品堆成一座小山，全是白蘿蔔。')),
      { who: 'chizuru', mood: 'bewildered', text: '「春祭開始了。照我們那時候的規矩，先向神明報上供品：白蘿蔔、白蘿蔔，還有白蘿蔔。」' },
      { who: 'marta', text: '「賣菜的婆婆起的頭，整條街都跟著供。今晚旅館大概只能煮蘿蔔湯了。」' },
      { who: 'chizuru', mood: 'solemn', text: '「這首祭歌原本的後半，唱的是提燈的人沒有回來。從今年起，我改了這一句。」', if: { notSeen: 'group:act4' } },
      N('千鶴清了清喉嚨。鎮上的孩子圍過來，跟著她唱。'),
      { who: 'chizuru', mood: 'solemn', text: '「『春祭的燈，誰提下去？提燈的人，不留名字──』」' },
      { who: 'narrator', text: '唱到她從前不唱的那一段，千鶴停了一拍。', if: { seen: 'group:act4' } },
      { who: 'chizuru', mood: 'smile', text: '「『提燈的人，回來了。』」' },
      { who: 'hero', mood: 'smile', text: '「回來是回來了。這麼多白蘿蔔，誰吃得完？」' },
      { who: 'chizuru', mood: 'smile', text: '「歌是活著的人唱的，活著的人就改得了。至於蘿蔔，大家一起吃，就吃得完。」' },
      N('屋簷下的鈴響了一聲。千鶴看著洛恩，孩子們又把新的那一句唱了一遍。'),
    ],
    summary: '冬天過去，千鶴在鎮邊的小祠辦春祭。供品全是白蘿蔔；她當著全鎮把改過的祭歌唱完：提燈的人，回來了。',
  },
};

/**
 * B1: town banter (voice-pass sample §6). Two companions talk among themselves on a return; Lorne listens (one line at most,
 * or the narrator gives his reaction). Light scenes: one 「……」 at most. The gate (`BANTER_GATE`) guarantees both are met, so
 * neither line needs `if.met`. A banter with no gate can play before or after Rin's choice and before either one's first
 * piece: Rin keeps her rules from before her choice, and each keeps her own reveal rules (story.test, B1). B2 writes the rest.
 */
const BANTER: Partial<Record<SceneId, Written>> = {
  // Safira's register (唷, 呀, ～) and her nickname for Sylvie, 「小希」 (sample §3, §7); Sylvie counts exits like a hunter (story L).
  'banter:safira-sylvie:1': {
    lines: [
      at(PL.squareDusk, N('黃昏的廣場。莎菲拉拉著希爾薇的手腕，硬是把她拖到石板中央。')),
      { who: 'safira', mood: 'wink', text: '「小希，右腳、左腳、轉──妳的眼睛在看哪裡呀？」' },
      { who: 'sylvie', mood: 'serious', text: '「找退路。這裡有三條，下風那條最好溜。」' },
      { who: 'safira', mood: 'laugh', text: '「跳舞不用退路唷！欸，小洛你看，她真的從第三條溜走了～」' },
    ],
    summary: '莎菲拉硬把希爾薇拖到廣場上學跳舞。希爾薇只顧著找退路，最後從第三條溜走了。',
  },
  // Noel declares Rin her rival; Rin concedes at once, which is worse. Rin's two lines hold before and after her choice.
  'banter:noel-rin:1': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「喂，凜！今天本小姐打倒的，比妳多一隻。服不服？」' },
      { who: 'rin', mood: 'normal', text: '「服。」' },
      { who: 'noel', mood: 'pout', text: '「太、太乾脆了吧！至少不甘心一下啊！」' },
      { who: 'rin', mood: 'normal', text: '「好。不甘心。」' },
    ],
    summary: '諾艾兒宣布凜是她的勁敵。凜乾脆認輸，反而把諾艾兒氣得跳腳。',
  },
  // Street talk against a knight's report. Scarlet says no 起誓, 轉身 or 逃; Liz no debt, home or hat: both hold before any piece.
  'banter:liz-scarlet:1': {
    lines: [
      { who: 'liz', mood: 'scheming', text: '「騎士大姊，剛才那個寶箱，我三兩下就搞定了。」' },
      { who: 'scarlet', mood: 'serious', text: '「『搞定』是指什麼？請完整回報：開鎖的手法、所花的時間、有無陷阱。」' },
      { who: 'liz', mood: 'smile', text: '「手法屬於商業機密，時間大約一眨眼，陷阱已拆──零件還能賣兩枚銀幣。」' },
      // B2: the knight wins the last word at the merchant's own game (and sets up liz-scarlet:2's 「公帳」).
      { who: 'scarlet', mood: 'serious', text: '「回報收到。……那兩枚銀幣，請列入隊伍的公帳。」' },
    ],
    summary: '莉茲說寶箱三兩下就搞定了，絲嘉蕾要她照規矩完整回報。拆下來的零件能賣兩枚銀幣，絲嘉蕾要她列入公帳。',
  },
  // ---- B2: what they say to each other (lore ledger I-158 to I-160). Pairs in BANTER_PAIRS order. ----
  // Chizuru out of her time (B2 fix 1; story L Task 13): she takes the toy for the town's latest way of housing a god, takes
  // 「彈簧」 for its name, and volunteers to tend it.
  'banter:bobby-chizuru:1': {
    lines: [
      at(PL.forgeDoor, N('鍛造屋門口。波比上緊發條，小木人便「喀、喀」地自己走了起來。')),
      { who: 'chizuru', mood: 'bewildered', text: '「這東西自己會走？波比姑娘，城裡最近都把神明請進木頭裡嗎？」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，是彈簧喔！上緊了就會走，鬆了就會停。」' },
      { who: 'chizuru', mood: 'solemn', text: '「彈簧大人，我記下了。從明天起，每天早上由我替祂上緊一回。」' },
    ],
    summary: '波比的發條小木人自己走了起來。千鶴問是哪一位神靈在驅使它，聽說是彈簧，便決定每天早上替「彈簧大人」上緊發條。',
  },
  // Liz's livelihood against Bobby's improvements; the flaw becomes the selling point.
  'banter:bobby-liz:1': {
    lines: [
      { who: 'bobby', mood: 'excited', text: '「莉茲姊妳看，自動開鎖機！插進鎖孔，喀啦一聲就開了！」' },
      { who: 'liz', mood: 'surprised', text: '「等等。那我的飯碗怎麼辦？」' },
      { who: 'bobby', mood: 'grin', text: '「嘿嘿，放心！它開一次要半天，中途還會卡住兩次。」' },
      { who: 'liz', mood: 'scheming', text: '「那正好。賣給鎖匠，就叫『防盜鎖測試機』，一台十枚銀幣，成交？」' },
    ],
    summary: '波比做了一台自動開鎖機，莉茲擔心飯碗不保。聽說它開一次要半天，莉茲決定把它當成防盜鎖的測試機賣給鎖匠。',
  },
  // Bobby builds Noel's notebook beast exactly as drawn (chat:noel:1's 雷獸), and it turns out to be what it always was.
  'banter:bobby-noel:1': {
    lines: [
      { who: 'bobby', mood: 'excited', text: '「諾艾兒姊，我照妳筆記本上的雷獸，做了一隻會動的。」' },
      { who: 'noel', mood: 'smug', text: '「哼，眼光不錯嘛。本小姐的雷獸，可是威風凜凜的──」' },
      N('機關喀啦一聲站起來，伸了個懶腰，「喵」地叫了一聲。'),
      { who: 'noel', mood: 'panic', text: '「為、為什麼會喵？！是雷鳴！那叫雷鳴啦！」' },
    ],
    summary: '波比照著諾艾兒筆記本上的雷獸，做了一隻會動的機關。它站起來，伸了個懶腰，喵了一聲。',
  },
  // Why 「松鼠」 (chat:sylvie:1): Sylvie answers with an animal's habits, and Bobby's pocket agrees with her.
  'banter:bobby-sylvie:1': {
    lines: [
      { who: 'bobby', mood: 'surprised', text: '「希爾薇姊，妳老是叫我松鼠。我才不像松鼠！」' },
      { who: 'sylvie', mood: 'serious', text: '「手停不下來，看到什麼都撿，撿了就往口袋塞。入冬前的松鼠就長這樣。」' },
      { who: 'bobby', mood: 'excited', text: '「那些是零件！螺絲和彈簧，還有這顆──咦，口袋裡怎麼有核桃？」' },
      { who: 'sylvie', mood: 'smile', text: '「妳自己撿的啦。果然是松鼠──撿了就忘。不過松鼠忘掉的核桃，後來都長成了樹。」' },
    ],
    summary: '波比抗議希爾薇老叫她松鼠。希爾薇說她手停不下來、什麼都往口袋藏；波比的口袋裡，翻出了一顆核桃。',
  },
  // Chizuru's morning greeting and Rin's half of it. Ungated: Rin's two words hold before and after her choice.
  'banter:chizuru-rin:1': {
    lines: [
      { who: 'chizuru', mood: 'serious', text: '「凜姑娘，早安。我們那裡，一起出門的人早上都要互道早安，一天才走得順。」' },
      { who: 'rin', mood: 'normal', text: '「早。」' },
      { who: 'chizuru', mood: 'bewildered', text: '「那才半句。另外半句去哪裡了？」' },
      { who: 'rin', mood: 'normal', text: '「明天再說。」' },
    ],
    summary: '千鶴要和凜每天早上互道早安。凜只說了一個「早」，另外半句，她說明天再說。',
  },
  // Safira hands out nicknames (B2 fix 1, not a dance lesson): Chizuru takes 「小鶴」 for a rank and answers with a title of her own.
  'banter:chizuru-safira:1': {
    lines: [
      { who: 'safira', mood: 'wink', text: '「早呀，小鶴～今天也站得端端正正，像一根槍唷。」' },
      { who: 'chizuru', mood: 'bewildered', text: '「『小鶴』是什麼稱號？我才睡了幾天，城裡又新封了官位嗎？」' },
      { who: 'safira', mood: 'laugh', text: '「哈哈，是我封的唷！小洛也有一個，他到現在都還不肯應呀～」' },
      { who: 'chizuru', mood: 'solemn', text: '「多謝賜封。那我也回贈一個：莎菲拉姑娘就叫『舞姬大人』，比小鶴高一等。」' },
    ],
    summary: '莎菲拉叫千鶴「小鶴」，千鶴以為是一個官位。聽說是莎菲拉封的，她恭恭敬敬地回贈了一個：「舞姬大人」。',
  },
  // Two formal people bow to each other and cannot stop (style bible pairing); Chizuru claims the last bow by the manners of
  // her day (story L Task 13). Lorne ends it by sitting down.
  'banter:chizuru-scarlet:1': {
    lines: [
      at(PL.innDoor, N('旅館門口。千鶴行了一禮，絲嘉蕾回了一禮，千鶴又回了一禮。')),
      { who: 'scarlet', mood: 'serious', text: '「千鶴小姐，依騎士禮節，最後一禮該由我行。請您先起身。」' },
      { who: 'chizuru', mood: 'solemn', text: '「不，最後一禮該由我行。我們那時候，騎士見了巫女，是要先下馬的。」' },
      N('最後是洛恩先拉開椅子坐下。兩人對看一眼，一起朝他行了一禮。'),
    ],
    summary: '千鶴和絲嘉蕾在旅館門口互相行禮，誰都不肯收尾。最後洛恩先坐下，兩人一起朝他行了一禮。',
  },
  // Gated to act 3 (ledger §5): by then Liz would keep the little witch rather than price her.
  'banter:liz-noel:1': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「喂，莉茲。本小姐這樣的天才魔法師，市價多少？」' },
      { who: 'liz', mood: 'scheming', text: '「雷一發兩枚銅板，脾氣倒貼三枚，算下來負一枚。」' },
      { who: 'noel', mood: 'panic', text: '「負、負的？！本小姐是倒貼的嗎！」' },
      { who: 'liz', mood: 'smile', text: '「所以不賣啦。這麼虧的貨，只好我自己留著。」' },
    ],
    summary: '諾艾兒要莉茲替她估價。莉茲算出來是負一枚，所以不賣，只好自己留著。',
  },
  // Story depth Task 4: moved from :2 (content unchanged). Gated on Scarlet's full memories (ledger §5), and act 3: the knight
  // who guards by choice can say 「搞定」, and reports in Liz's own words.
  'banter:liz-scarlet:3': {
    lines: [
      { who: 'scarlet', mood: 'serious', text: '「莉茲小姐，回報。剛才那個寶箱，搞定了。」' },
      { who: 'liz', mood: 'surprised', text: '「騎士大姊說『搞定』？！那手法、時間、陷阱呢？」' },
      { who: 'scarlet', mood: 'smile', text: '「怎麼拆的，是商業機密，時間大約一眨眼。陷阱已拆，零件賣了兩枚銀幣，已列入公帳。」' },
      { who: 'liz', mood: 'scheming', text: '「才兩枚？虧大了。──好啦，第一次，給妳及格。」' },
    ],
    summary: '這一次，是絲嘉蕾說寶箱搞定了，回報得和莉茲當初一模一樣。莉茲嫌她賣便宜了，還是給了及格。',
  },
  // Fortune-telling as a business (B2 fix 1): Liz tries to cut the moon in; the moon, through Selene, out-bargains her.
  'banter:liz-selene:1': {
    lines: [
      { who: 'liz', mood: 'scheming', text: '「瑟蕾，談筆生意。妳讀月亮，我來擺攤。一次十枚銅板，分妳四成。」' },
      { who: 'selene', mood: 'foresee', text: '「月亮說，它不太想做生意。」' },
      { who: 'liz', mood: 'scheming', text: '「那月亮的那一份，我另外算給它。它收銅板，還是收銀幣？」' },
      { who: 'selene', mood: 'smile', text: '「月亮說，它要八成。──是月亮說的，不是我說的。」' },
    ],
    summary: '莉茲想替瑟蕾擺占卜攤，連月亮的那一份都打算另外算。瑟蕾說，月亮要八成。',
  },
  // After her choice Rin teases back (ledger §5, oath gate): the rival she conceded to in noel-rin:1 finds she can lose.
  'banter:noel-rin:2': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「喂，凜！今天又是本小姐贏。服不服，這次就不用問了吧。」' },
      { who: 'rin', mood: 'smile', text: '「不服。」' },
      { who: 'noel', mood: 'panic', text: '「咦？！妳、妳什麼時候學會不甘心了？」' },
      { who: 'rin', mood: 'smile', text: '「跟妳學的。明天再比一次吧。」' },
    ],
    summary: '諾艾兒又宣布自己贏了。這一次，凜說她不服，是跟諾艾兒學的，明天再比一次。',
  },
  // Noel wants a prophecy about her lightning; Selene hedges (也許, the bible pairing) and the moon gives a weather report.
  'banter:noel-selene:1': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「瑟蕾，替本小姐讀一下月亮。本小姐的雷，明天會不會更響？」' },
      { who: 'selene', mood: 'foresee', text: '「也許呢。月亮說，明天會有很響的東西。」' },
      { who: 'noel', mood: 'smug', text: '「哼，聽到沒？連月亮都挺我！」' },
      { who: 'selene', mood: 'wistful', text: '「也可能是打雷。剛才那句不算。啊，外面的衣服記得收。」' },
    ],
    summary: '諾艾兒要瑟蕾預言她的雷明天會不會更響。瑟蕾只說也許，月亮說的很響的東西，也許是雷雨。',
  },
  // Story depth Task 4: moved from :2 (content unchanged). Gated on Selene's full memories (ledger §5), and act 3: she says a
  // future out loud and keeps it, and still finds the moon's loophole.
  'banter:noel-selene:3': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「瑟蕾，今天不准說『也許』。本小姐明天贏不贏得了凜？」' },
      { who: 'selene', mood: 'foresee', text: '「贏得了。」' },
      { who: 'noel', mood: 'panic', text: '「咦？！妳、妳竟然直接說了？不收回？」' },
      { who: 'selene', mood: 'smile', text: '「不收回呢。只是我沒說，比的是什麼。」' },
    ],
    summary: '瑟蕾第一次把一個明天直接說出口，也不收回。只是她沒說，諾艾兒要和凜比的是什麼。',
  },
  // Scarlet's honour guarantee (B2 fix 1, not a report) against Rin's one-word verdict. Ungated: Rin keeps her rules from before her choice.
  'banter:rin-scarlet:1': {
    lines: [
      at(PL.innHall, N('夜裡的旅館走廊。絲嘉蕾每走一步，鎧甲就「鏘」地響一聲。')),
      { who: 'rin', mood: 'normal', text: '「吵。」' },
      { who: 'scarlet', mood: 'serious', text: '「失禮了。以騎士的名譽保證，接下來的每一步，都會很輕。」' },
      { who: 'rin', mood: 'normal', text: '「保證之後，又響了兩聲。名譽也很吵。」' },
    ],
    summary: '絲嘉蕾的鎧甲夜裡在走廊上一步一響。她以騎士的名譽保證會走輕一點，凜說名譽也很吵。',
  },
  // Story depth Task 4: moved from :1 (content unchanged). After her choice (oath gate): the two quiet ones (style bible
  // pairing), and Rin asks him up.
  'banter:rin-sylvie:2': {
    lines: [
      N('屋頂上，凜和希爾薇並肩蹲著，看著同一個方向，很久都沒有說話。'),
      { who: 'hero', text: '「吵架了？」' },
      { who: 'sylvie', mood: 'serious', text: '「沒吵。在看貓等老鼠，牠蹲在下風處半天了，還算懂。」' },
      { who: 'rin', mood: 'smile', text: '「牠剛才打了一個呵欠。洛恩，你也上來看。這裡還蹲得下一個。」' },
    ],
    summary: '凜和希爾薇蹲在屋頂上，很久都沒說話。洛恩以為她們吵架了，其實她們在看貓。',
  },
  // Drill against dance (style bible pairing): Scarlet gives her own knees an order. Safira calls her 「小嘉」.
  'banter:safira-scarlet:1': {
    lines: [
      at(PL.square, N('廣場上，莎菲拉數著拍子。絲嘉蕾跟在她身後，每一步都踩得像在閱兵。')),
      { who: 'safira', mood: 'laugh', text: '「跳舞要軟一點呀，小嘉！妳這樣，怪物看了都想立正～」' },
      { who: 'scarlet', mood: 'serious', text: '「遵命。全身放軟──報告：膝蓋拒絕服從。」' },
      { who: 'safira', mood: 'wink', text: '「哈哈，好老實的膝蓋！算了，就照妳的跳。全場最準的拍子，是妳的唷～」' },
    ],
    summary: '莎菲拉教絲嘉蕾跳舞，絲嘉蕾跳得像在閱兵。她命令自己放軟，膝蓋不聽；莎菲拉說，全場最準的拍子是她的。',
  },
  // Story depth Task 4: moved from :2 (content unchanged). Gated to act 3 and Safira's full memories: safira-sylvie:1's three
  // ways out, now at Safira's one-woman show (B2 fix 1: her stage voice).
  'banter:safira-sylvie:3': {
    lines: [
      { who: 'safira', mood: 'wink', text: '「各位觀眾──好吧，只有小希一位。今晚的特別公演，門票全免唷～」' },
      { who: 'sylvie', mood: 'serious', text: '「欸，退路我只找了一條，夠用了。」' },
      { who: 'safira', mood: 'surprised', text: '「咦，只找一條？另外兩條呢？」' },
      { who: 'sylvie', mood: 'smile', text: '「今天不找了。晚風是暖的，坐著看就好。」' },
    ],
    summary: '莎菲拉辦了一場只有希爾薇一個觀眾的公演。希爾薇只找了一條退路，另外兩條，她說今天不找了。',
  },
  // Scarlet tries to command the moon; she puts it on the night watch, and Selene finds that kind.
  'banter:scarlet-selene:1': {
    lines: [
      { who: 'scarlet', mood: 'serious', text: '「瑟蕾小姐。月亮若知道明天的事，請它先知會我一聲。」' },
      { who: 'selene', mood: 'smile', text: '「月亮可不歸騎士管。它連我說的話，也不太聽。」' },
      { who: 'scarlet', mood: 'serious', text: '「既然不聽指揮，那就排進守夜表。月亮排第一班。」' },
      { who: 'selene', mood: 'smile', text: '「排得真好。只是它每個月總要請假幾晚，請先排好代班。」' },
    ],
    summary: '絲嘉蕾要月亮先知會她明天的事。月亮不聽指揮，她就把月亮排進了守夜表；瑟蕾提醒，它每個月總要請假幾晚，要先排好代班。',
  },
  // Two ways of knowing (B2 fix 1, no weather): Selene will not say the dinner she has read; Sylvie smells it.
  'banter:selene-sylvie:1': {
    lines: [
      { who: 'selene', mood: 'foresee', text: '「今晚的晚餐，我已經讀到了呢。可是說出口，就不靈了。」' },
      { who: 'sylvie', mood: 'serious', text: '「南瓜湯，還有烤魚。魚又煎過頭了，瑪莎每次都這樣。」' },
      { who: 'selene', mood: 'surprised', text: '「月亮也告訴妳了？」' },
      { who: 'sylvie', mood: 'smile', text: '「不用月亮啦。用鼻子聞就知道。」' },
    ],
    summary: '瑟蕾讀到了今晚的晚餐，卻不肯說。希爾薇一口氣說了出來：她不用月亮，用鼻子。',
  },

  // ---- Story depth Task 4: the friction banters (design §7.2–§7.4, §8 sample 1), pasted as they stand (plan ruling 10).
  // The writing tasks finalize them; a beat the design gives as stage direction is narration. ----
  'banter:chizuru-noel:1': {
    lines: [
      { who: 'noel', mood: 'smug', text: '「千鶴，看好了。本小姐借來的魔法書，封面的星星會自己發光！」' },
      { who: 'chizuru', mood: 'serious', text: '「確實好看。可是神主大人教過：借而不告，謂之竊。這本書什麼時候還？」' },
      { who: 'noel', mood: 'panic', text: '「我、我有打算還的！等我比誰都厲害的時候！」' },
      { who: 'chizuru', mood: 'solemn', text: '「那就是永遠不還了。至少書角別再折，這麼白的紙，我們那時候一張要一枚銀幣。」' },
    ],
    summary: '諾艾兒向千鶴炫耀她的魔法書。千鶴說借而不告謂之竊，問她何時歸還；諾艾兒說等她比誰都厲害的時候，千鶴說那便是永遠不還了。',
  },
  'banter:chizuru-noel:2': {
    lines: [
      N('千鶴行了一禮：「聽說妳的老師平安。先前那句『謂之竊』，我收回。」'),
      { who: 'noel', mood: 'panic', text: '「不、不用行禮啦！」' },
      { who: 'chizuru', mood: 'solemn', text: '「禮尚往來，我們那裡都是這樣。」' },
      { who: 'noel', mood: 'blush', text: '「那……本小姐也收回一句。『比誰都厲害』那句先不算，千鶴的祝詞就比我厲害。」' },
    ],
    summary: '千鶴聽說諾艾兒的老師平安，收回了那句「謂之竊」。諾艾兒也收回一句：千鶴的祝詞，比她厲害。',
  },
  'banter:liz-scarlet:2': {
    lines: [
      { who: 'liz', mood: 'scheming', text: '「這片碎片上刻著名字，好貨。交給公會只有謝禮，賣給收藏家，翻三倍。」' },
      { who: 'scarlet', mood: 'serious', text: '「那是某個人的記憶。請交還。」' },
      { who: 'liz', mood: 'normal', text: '「騎士大姊，妳守的那扇門，門後還有人嗎？」' },
      N('絲嘉蕾沒有回答。莉茲又看了一眼那個名字，才交出去。謝禮兩枚銀幣，虧大了。'),
    ],
    summary: '莉茲想把刻著名字的碎片賣給收藏家，絲嘉蕾要她交還。莉茲問她守的門後還有沒有人；絲嘉蕾沒有回答，碎片還是交了出去。',
  },
  'banter:safira-sylvie:2': {
    lines: [
      N('莎菲拉單腳轉了三圈，彎刀上還挑著一隻怪物的角。'),
      { who: 'safira', mood: 'wink', text: '「小希，剛才那一場我一個人衝第一個，帥不帥？」' },
      { who: 'sylvie', mood: 'serious', text: '「妳一跑，後面的人就會跟。跟錯路的人，回不來。」' },
      { who: 'safira', mood: 'sad', text: '「那、那就叫他們別跟呀。……好唷，下一場我數拍子，讓小希先走。」' },
    ],
    summary: '莎菲拉一個人衝在最前面，問希爾薇帥不帥。希爾薇說跟錯路的人回不來，莎菲拉答應下一場讓她先走。',
  },
  'banter:rin-sylvie:1': {
    lines: [
      at(PL.roofNight, N('夜裡的屋頂，希爾薇盯著巷子。凜從背後走近，一點聲音也沒有。')),
      { who: 'sylvie', mood: 'alert', text: '「妳走路像在追獵物，腳跟不落地。在追什麼？」' },
      { who: 'rin', mood: 'normal', text: '「不知道。等我知道了，第一個告訴妳。」' },
      N('希爾薇往旁邊挪了一個位置。兩人一起盯著巷子，盯到一隻貓走過去。'),
    ],
    summary: '希爾薇問凜，走路像在追獵物，是在追什麼。凜說不知道，等她知道了，第一個告訴希爾薇。',
  },
  'banter:rin-selene:1': {
    lines: [
      { who: 'selene', mood: 'foresee', text: '「凜，妳的明天，月亮說了一點點呢。──算了，請當作沒聽見。」' },
      { who: 'rin', mood: 'normal', text: '「說一半就收回，比不說還吵。」' },
      { who: 'selene', mood: 'wistful', text: '「那換凜說一個？妳每次都只說『沒事』。」' },
      N('凜想了一下，說：「沒事。」瑟蕾笑出聲來。'),
    ],
    summary: '瑟蕾說月亮讀到了凜的明天，又收了回去。凜嫌她吵，瑟蕾說凜每次都只說沒事，凜想了一下，還是說沒事。',
  },
  'banter:rin-selene:2': {
    lines: [
      { who: 'rin', mood: 'serious', text: '「瑟蕾，我差點刺下去的那一刀，妳看見過吧。早一點說，我就能早一點收刀。」' },
      { who: 'selene', mood: 'wistful', text: '「對不起。下一次看見什麼，我會先說。」' },
      { who: 'rin', mood: 'normal', text: '「那現在說一個。我明天會怎樣？」' },
      { who: 'selene', mood: 'smile', text: '「妳明天會多眨幾次眼。是我說的，不是月亮。」' },
    ],
    summary: '凜問瑟蕾，她差點刺下去的那一刀，是不是早就看見了。瑟蕾道歉，答應下一次先說，還替凜說了一個明天。',
  },
  'banter:safira-scarlet:2': {
    lines: [
      { who: 'scarlet', mood: 'serious', text: '「莎菲拉小姐，今天是鎮上的追思日，請肅靜。」' },
      { who: 'safira', mood: 'wink', text: '「我也在想他們呀。我們那裡，送人走是用跳的唷。小嘉那張臉，送得走誰呀？」' },
      { who: 'scarlet', mood: 'shaken', text: '「失禮了……」' },
      N('絲嘉蕾踩著閱兵的步子，下場陪她跳。拍子準得讓莎菲拉笑出聲。'),
    ],
    summary: '追思日，絲嘉蕾要莎菲拉肅靜。莎菲拉說她們那裡送人走是用跳的，絲嘉蕾便踩著閱兵的步子下場陪她跳。',
  },
  'banter:bobby-chizuru:2': {
    lines: [
      { who: 'bobby', mood: 'sad', text: '「千鶴姊，燈是我家的人造錯的。迷宮奪走妳的那些年，對不起。」' },
      { who: 'chizuru', mood: 'serious', text: '「道歉就不必了。不過，請讓我生氣一刻鐘。」' },
      N('千鶴端坐閉眼，一動也不動。波比也不敢動，連彈簧大人都停了。'),
      N('一刻鐘後，千鶴起身，照樣替彈簧大人上緊發條：「氣生完了。今天也請多指教。」'),
    ],
    summary: '波比替祖先向千鶴道歉。千鶴說不必道歉，只請她容自己生氣一刻鐘；一刻鐘後，她照樣替彈簧大人上緊發條。',
  },
  'banter:bobby-sylvie:2': {
    lines: [
      N('波比遞出一條箭袋背帶，上面縫了七個口袋。希爾薇照樣說「不用」。'),
      { who: 'bobby', mood: 'sad', text: '「希爾薇姊什麼都說不用。我做的東西，妳一次都沒用過。」' },
      { who: 'sylvie', mood: 'blush', text: '「好東西沾了泥可惜，我捨不得用。明天要下雨，正好試試它防不防水。」' },
      N('她已經背上了。波比哭了一下，又笑了，說還可以再加一個口袋。'),
    ],
    summary: '波比做的東西，希爾薇從來不用。這一次，希爾薇把箭袋背帶背上了，說明天就用。',
  },
  'banter:noel-selene:2': {
    lines: [
      { who: 'noel', mood: 'pout', text: '「瑟蕾的魔法明明那麼強，留著不用，是要醃起來嗎！」' },
      { who: 'selene', mood: 'wistful', text: '「有些力量，用一次，就會少掉一點自己呢。」' },
      { who: 'noel', mood: 'panic', text: '「妳、妳怎麼知道──」' },
      { who: 'selene', mood: 'smile', text: '「月亮說的。」' },
    ],
    summary: '諾艾兒不懂瑟蕾為什麼不用自己的力量。瑟蕾說有些力量用一次就會少掉一點自己：她說的是自己，諾艾兒卻以為在說她。',
  },
  'banter:rin-scarlet:2': {
    lines: [
      { who: 'rin', mood: 'normal', text: '「第七個晚上。妳的鎧甲今晚響了四十一次，比昨晚少了三次。」' },
      { who: 'scarlet', mood: 'serious', text: '「我在練習不動。今晚是守夜表上的最後一班，總要守得像樣。」' },
      { who: 'rin', mood: 'normal', text: '「守夜表排了七個晚上，一次都沒換人。妳守的不是門，是我。」' },
      N('「是。」絲嘉蕾答得很乾脆。凜沒有回房，在她旁邊坐下。鎧甲每響一聲，凜就說一次「吵」，一直說到天亮。'),
    ],
    summary: '守夜表的第七個晚上。凜說絲嘉蕾守的不是門，是她；絲嘉蕾說是。凜在她旁邊坐下，一直說到天亮。',
  },
  'banter:rin-scarlet:3': {
    lines: [
      { who: 'scarlet', mood: 'serious', text: '「凜小姐，我想起來了。有人命令我活下去，我照做了。」' },
      { who: 'rin', mood: 'serious', text: '「我收到的命令，我沒照做。」' },
      { who: 'scarlet', mood: 'smile', text: '「嗯。……守夜表，我撕了。」', if: { seen: 'banter:rin-scarlet:2' } },
      // Told at the depth-30 rest, there was no seventh night (rin-scarlet:2 expired): the rota she meant to draw up is never used.
      { who: 'scarlet', mood: 'smile', text: '「嗯。守夜表，我撕了。」', if: { notSeen: 'banter:rin-scarlet:2' } },
      N('凜說前面歸絲嘉蕾，後面歸她自己。結果兩人都走到洛恩旁邊，把他夾在中間，三個人並排走。'),
    ],
    summary: '絲嘉蕾想起了要她活下去的命令，凜說她收到的命令沒有照做。守夜表撕了，三個人並排走。',
  },
  'banter:chizuru-rin:2': {
    lines: [
      { who: 'chizuru', mood: 'solemn', text: '「凜姑娘，早安。」' },
      { who: 'rin', mood: 'normal', text: '「早安。」' },
      { who: 'chizuru', mood: 'smile', text: '「完整了。這樣一來，今天一定走得順。」' },
      { who: 'rin', mood: 'averted', text: '「另外半句，早該說了。」' },
    ],
    summary: '凜第一次回了完整的早安。千鶴說，甚好。',
  },
};

/** A scene as the game plays it: its handbook title, its lines as written (a bond scene's choices among them), its summary. */
export interface Scene { title: string; lines: SceneLine[]; summary: string }

/** What is registered of the bond's scenes (data/story/scenes.ts), as one argument. */
export interface BondWritten { bonds: readonly Companion[]; endings: readonly Companion[]; romances: readonly Companion[]; together: boolean }
/**
 * Bond plan Task 8: the registered bond scenes with their titles (interface labels may carry numerals) and their text
 * (`BOND_SCENES`), in `SCENE_IDS` order. A registered scene with no text throws: it is a bug, not a draft.
 */
export function bondSceneEntries(
  w: BondWritten = { bonds: BONDS_WRITTEN, endings: ENDINGS_WRITTEN, romances: ROMANCES_WRITTEN, together: TOGETHER_WRITTEN.value },
  texts: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>> = BOND_SCENES,
): [SceneId, Scene][] {
  const entry = (id: SceneId, title: string): [SceneId, Scene] => [id, { title, ...written(texts[id], id) }];
  return [
    ...w.bonds.flatMap((c) => [1, 2, 3, 4].map((n) => entry(bondScene(c, n), `${nameOf(c)}・羈絆 ${n}`))),
    ...w.endings.map((c) => entry(`ending:${c}`, `${nameOf(c)}・後日談`)),
    ...w.romances.map((c) => entry(`romance:${c}`, `${nameOf(c)}・夜路`)),
    ...(w.together ? [entry('together', '夜路・和大家一起')] : []),
  ];
}

function buildScenes(): Record<SceneId, Scene> {
  const out = {} as Record<SceneId, Scene>;
  // Plan 6c wrote every scene (Task 14 removed the drafts): a scene without its SCRIPT entry is a bug, not a draft.
  const scene = (id: SceneId, title: string): void => { out[id] = { title, ...written(SCRIPT[id], id) }; };
  for (const id of MAJOR_SCENES) scene(id, MAJOR_TITLES[id]);
  // story L: a group scene is in the script once it is registered (Tasks 9-11 write it and register it together)
  for (const node of ACT_NODES) { const id = REACTIONS[node]; if (id) scene(id, GROUP_TITLES[id]); }
  for (const id of CHARACTER_IDS) {
    const name = nameOf(id);
    CHAINS[id].pieces.forEach((_, i) => scene(memScene(id, i + 1), `${name}・第${numeral(i + 1)}片`));
    for (let n = 1; n <= CHAT_COUNT[id]; n++) scene(`chat:${id}:${n}`, `${name}・對話${numeral(n)}`);
  }
  for (const f of TOWN_FRAGMENTS) out[`town:${f.id}`] = { title: `${f.npc}的記憶`, ...TOWN_SCENES[f.id] };
  for (const c of HOME_OWNERS) out[homeScene(c)] = { title: `${nameOf(c)}・${HOME_TITLES[c]}`, ...HOME[c] };
  // time and moon ruling 7: a season's scene is in the script once registered (Task 8 writes the spring festival)
  for (const [season, id] of Object.entries(SEASON_SCENES) as [Season, SceneId][]) out[id] = { title: `${nameOf('chizuru')}・${SEASON_TITLES[season]}`, ...written(SEASON[season], id) };
  for (const p of BANTER_PAIRS) {
    for (let n = 1; n <= (BANTER_COUNT[p] ?? 0); n++) {
      const id = banterScene(p, n);
      const [a, b] = banterTwo(id);
      out[id] = { title: `${nameOf(a)}與${nameOf(b)}・閒聊${numeral(n)}`, ...written(BANTER[id], id) };
    }
  }
  for (const [id, scene] of bondSceneEntries()) out[id] = scene;   // bond plan Task 8: the registered bond scenes
  return out;
}

/**
 * The handbook's people pages that are written: met, half the memories, all of them (spec §7.6). Lorne's are his own notes.
 * Unlocked by pieces, they never tell Rin's choice; Rin's fourth page alone unlocks with her oath (continuity fix 3).
 */
const PEOPLE: Partial<Record<CharacterId, string[]>> = {
  // Task 6
  hero: [
    '洛恩是安娜替我取的名字，因為我醒來時只念得出一個「洛」字。我從迷宮深處走出來，手上握著一把刻著紋路的劍。',
    '我的手記得的事比我多：劍怎麼放出去、繩結怎麼絆住、盾怎麼推回來。我也記得，自己死在一條巷子裡。',
    '我是守燈人，從艾斯特拉走下去的那一個。這把劍是燈鑰，燈芯是我在地面上活過的日子。這一次，我想和大家一起走回地面上。',
  ],
  // Task 7: segment 3 unlocks with her 7th piece, before the reveal (the handbook opens in the dungeon): no choice (F6).
  rin: [
    '凜。和我一起倒在傳送門廣場的女孩，刀柄上刻著這個字，她就用它當名字。話很少，常在我背後。',
    '她在鐘樓下長大，丟針是她小時候的遊戲。她戰鬥時從不眨眼。她的師父說，從深處走出來的，不是人。',
    '她的碎片裡，「凜」是靜鐘會給刺客的代號，銅鐘是信物。鐘響了三天，她走進迷宮，追那個從深處走出來的人。',
    // Continuity fix 3: unlocks with her oath, so once she has chosen the page ends on her choice (lore ledger I-120).
    '旅館那一夜之後，她把一切都告訴了我。她是被派來的，可是她不做了，這是她自己決定的。銅鐘她自己敲平了，現在她叫我洛恩。',
  ],
  // Task 8: Lorne's notes on Selene, Chizuru and Safira. Each segment is placed at her meeting: no act content.
  selene: [
    '瑟蕾。在本道的水晶洞窟遇見她，被怪物圍著，還在讀月相。她叫我洛恩先生，話說到一半常收回去，說那是月亮說的。',
    '她是讀月亮的占星師，怕說出口的預言會自己成真。滿月的夜裡，她看過燈重新亮起。那些結局，是她自己交給迷宮的。',
    '新月的夜裡，她看過一道背影在出口前倒下，燈也熄了。她說滿月裡站在燈旁邊的，就是我們。她不再叫我洛恩先生，說她想看見。',
  ],
  chizuru: [
    '千鶴。在霜凍之地的冰裡找到她，出冰的第一件事，是向倒下的怪物行禮。她說只睡了幾天，叫我洛恩大人。',
    '神社派她來封印迷宮，要她春祭之前回去。祝詞沒念完，她就被凍進冰裡。冰外走過的人，衣裳換了好幾回。',
    '她是最後一位神主送出來的，神社早就不在了。槍穗上的鈴是神主託付的。她要在鎮邊蓋一座小祠，為了現在的人。',
  ],
  safira: [
    '莎菲拉。在熾焰之地的火裡一個人跳劍舞，把怪物叫成舞伴。她叫我小洛，說要教我跟上拍子，我還沒答應。',
    '她是流浪舞團的舞者。碎片裡有打鼓的、吹笛的、縫衣裳的團員。她說是她先看見沙漠裡那座蜃樓的城。',
    '走進蜃樓是團長選的，團長把她推了出來：「妳要繼續跳。」她第一次停下腳步，把團員一個一個想了一遍，才說要去廣場替大家跳完。',
  ],
  // Task 9: Lorne's notes on Sylvie, Noel and Bobby. Each segment is placed at her meeting: no act content (I-58).
  sylvie: [
    '希爾薇。在腐毒沼澤被毒藤纏住，箭筒只剩一支箭，還在射。嘴上什麼都嫌：路難走、風向不對、乾糧難吃，嫌完了照樣把大家帶好。',
    '腐毒沼澤，以前是她守的林子。霧來的時候，她牽著一家人走出去，又回頭了。她說林子是在她眼前死的。',
    '人全出來之後，她才回頭，帶出了林子最後一顆種子。她想交給我替她種，我沒收。她說這一顆要自己種。',
  ],
  noel: [
    '諾艾兒。在雷鳴之地亂放雷，魔力見底，眼神空空的，頭髮還被自己劈蓬了。自稱本小姐，叫我歸來者，不准我笑。',
    '她偷了老師的魔法書，逃進迷宮。書裡的星火，用一次就燒掉施法者的一段記憶。她的失憶，是自己燒的。',
    '老師不讓她念那一頁，是為了保護她。她撕下那一頁，連同記憶還給了流浪商人──她的老師。現在她喊我的名字之前，會先臉紅。',
  ],
  bobby: [
    '波比。在本道的星燈神殿，她趴在倒下的古代機兵身上修東西，怪物圍過來都沒發現。她叫我洛恩哥，她的一下下從來不是一下下。',
    '她家是替星燈造機關的工匠一族，被時間忘了。碎片拼出星燈的構造圖：祖先把燈造得什麼記憶都能裝。',
    '她修機兵，是想替祖先道歉。她讀懂了整張構造圖：燈芯少一道閥。祖先造錯的地方，她要親手修好。',
  ],
  // Task 10: Lorne's notes on Liz and Scarlet (I-58). Liz's last page unlocks with her 5th piece whether or not Orik's
  // fragment is back, so it stops at her father's face (揭露表).
  liz: [
    '莉茲。在暗影迴廊上鎖的寶庫裡找到她，餓得站不起來，還在跟自己殺價。嘴很快，愛估價，叫我老大。',
    '她小時候在一間擺滿瓶罐的小店裡學估價。家裡的債，是賒出去收不回來的帳。她說她家離星燈很近。',
    '寶庫的門關上之後，她數著吃不下的金幣，把家人的臉數忘了。現在她想起了父親的臉，說要回家。',
  ],
  scarlet: [
    '絲嘉蕾。在鋼鐵要塞的城門前，她和機兵一起把劍對著我們，撐過三個回合才收劍。她叫我洛恩閣下，道歉時要我們先回報傷勢。',
    '她是騎士，以劍起誓要做某個人的盾。鋼鐵要塞是她的國家，被迷宮吞了下去。她說城門快破的那一夜，她轉身逃了。',
    '她立誓守護的，是一起練劍長大的公主。那一夜吹的是撤退的號角，是公主要她活下去。她不再叫我閣下，站到了我旁邊。',
  ],
};

/**
 * The found line: narration that opens every meeting. It names nobody (story polish ruling 2; lore ledger I-161): her name
 * comes in her own words after the fight (`introIndex`), and until then her plate reads 「？？？」 (`ui2/rescue.ts`).
 */
export const FOUND_LINE = '有人被怪物圍住了！';
/**
 * The written meetings (spec §6): the found line, then what the party sees and her own words; after the fight, she joins.
 * Played unfiltered: no `if`, and only she, Lorne, Rin and the narrator speak.
 */
const MEET: Partial<Record<Meetable, { before: ScriptLine[]; after: ScriptLine[] }>> = {
  // Task 8
  selene: {
    before: [
      N(FOUND_LINE),
      N('水晶洞窟的石壁上，映著一輪天上沒有的月亮。她跪在那片月光裡，被怪物圍著，卻抬頭讀著月相。'),
      { who: 'selene', mood: 'foresee', text: '「上弦的月。今晚也許會有人經過吧。」' },
      { who: 'rin', text: '「被圍住了，還在看月亮。心很大。」' },   // a meeting plays unfiltered and may come after her oath: no guarded face
    ],
    after: [
      { who: 'selene', mood: 'smile', text: '「謝謝各位。我是瑟蕾，讀月亮的人。剛才那句『會有人經過』，是月亮說的，不是我說的呢。」' },
      { who: 'hero', text: '「那月亮有沒有說，出口往哪邊？」' },
      { who: 'selene', mood: 'wistful', text: '「洞裡這個月亮只會照著我，不會指路。可以跟各位走一段嗎？走到看得見真的月亮為止。」' },
      N('凜比洛恩先開了口：「可以。」瑟蕾眨了眨眼，輕輕笑出聲來。'),   // V1 fix 1: her verdict, and Selene's answer to it
    ],
  },
  chizuru: {
    before: [
      N(FOUND_LINE),
      N('一大塊冰裡凍著一位巫女，握著長槍，還保持著封印儀式的姿勢。冰面忽然裂開一道細縫。'),
      { who: 'chizuru', mood: 'solemn', text: '「封印……尚未完成。」' },
      N('凜伸手敲了敲冰面。冰裡那雙眼睛，動了一下。'),   // story polish M round 2: half of Rin's meeting quips become actions
    ],
    after: [
      N('冰碎了。巫女跌了出來，拄著長槍站穩，第一件事是朝倒下的怪物鄭重行了一禮。'),
      { who: 'hero', text: '「站得起來嗎？看來可以，還有空跟怪物鞠躬。」' },
      { who: 'chizuru', mood: 'bewildered', text: '「失禮了，倒下的也得好好送走。我是千鶴，神社派我來封這道裂口。春祭快到了，請問下山的路往哪邊？」' },
      { who: 'rin', text: '「這裡沒有山下。只有樓下。」' },
      N('千鶴愣了很久，抬頭看那片石頭天頂。然後把長槍扛上肩，跟在凜後面走了。'),
    ],
  },
  safira: {
    before: [
      N(FOUND_LINE),
      N('熾焰之地的火海裡，一個少女握著彎刀，一個人跳著劍舞。每一步，都像在等誰接上她的拍子。'),
      { who: 'safira', mood: 'wink', text: '「哎呀，有觀眾！來得剛好，這首一個人跳太寂寞了呀。舞伴又一個比一個醜。」' },
      N('凜的腳尖跟著那拍子點了一下，又立刻停住。'),   // story polish M round 2: an action, not a quip
    ],
    after: [
      { who: 'safira', mood: 'laugh', text: '「哈哈，好久沒人陪我跳完一整首了！你們踩拍子的腳，還不錯唷。」' },
      { who: 'hero', text: '「我是洛恩。剛才那個，我們是在打架。」' },
      N('她轉過身，朝空蕩蕩的火海喊：「鼓手大叔，下一首快一點！」火海裡，什麼也沒有回答。'),
      { who: 'safira', mood: 'wink', text: '「啊，喊錯人了。那就你們吧，一、二──我是莎菲拉。你的名字太硬，叫小洛好了。跟上拍子囉！」' },
    ],
  },
  // Task 9
  sylvie: {
    before: [
      N(FOUND_LINE),
      N('腐毒沼澤的爛泥裡，毒藤纏住了一個少女的腿。她的箭筒裡，只剩最後一支箭。'),
      N('她還在射。弓弦一響，撲過來的怪物就倒下一隻。'),
      { who: 'sylvie', mood: 'alert', text: '「別過來。風向不對，毒會往你們那邊飄。」' },
    ],
    after: [
      N('洛恩割斷了毒藤。她把箭一支一支撿回來，順手拎起一條被射穿的蛇，掂了掂。'),
      { who: 'sylvie', text: '「希爾薇。謝了──這條晚上烤來吃，比乾糧強。」' },
      { who: 'hero', text: '「蛇就不用了。那妳知道哪條路比較不會被吃掉嗎？」' },
      { who: 'sylvie', mood: 'serious', text: '「這片沼澤的路，我認得。你們的腳印太深，獵物隔三棵樹就聽得見。踩我踩過的地方。」' },
      N('她走在最前面，弓一直沒有放下。那條蛇掛在她腰上，晃了一路。'),
    ],
  },
  noel: {
    before: [
      N(FOUND_LINE),
      N('雷鳴之地的岩台上，雷光四處亂竄。一個少女揮著法杖，連自己腳邊都劈。'),
      { who: 'noel', mood: 'panic', text: '「別、別過來！我的雷還、還沒用完！」' },
      N('一道雷劈在凜的腳邊。凜往旁邊挪了一步，像在躲雨。'),
    ],
    after: [
      N('雷光熄了。少女腿一軟，坐倒在岩石上，頭髮被自己的雷劈得蓬成一團。'),
      { who: 'noel', mood: 'pout', text: '「哼。剛才那只是熱身！一個人本來也打得贏。」' },
      { who: 'hero', text: '「熱身完了，就一起回去吧。」' },
      N('她翻開筆記本，找了半天上一次想好的稱號。沒找到，只好清了清喉嚨。'),
      { who: 'noel', mood: 'smug', text: '「本小姐是諾艾兒，雷鳴之地的──稱號之後再想。就勉強跟著你們吧。頭髮不准笑。」' },
    ],
  },
  bobby: {
    before: [
      N(FOUND_LINE),
      N('星燈神殿的石柱之間，倒著一台古代機兵。一個少女趴在它的胸口，扳手轉個不停。'),
      { who: 'rin', text: '「後面有三隻。」' },   // a meeting plays unfiltered and may come after her oath: no guarded face
      { who: 'bobby', mood: 'focused', text: '「三隻？等一下，這邊還差半圈──好了！可以打了！」' },
    ],
    after: [
      { who: 'hero', text: '「怪物都圍過來了，妳還在鎖螺絲。」' },
      { who: 'bobby', mood: 'excited', text: '「第一步鎖螺絲，第二步打怪，順序不能反──啊，你那把劍，紋路好漂亮。借我看一下下！」' },
      N('她的手已經伸過來了。洛恩把劍往後一收，她整個人就跟著劍走了兩步。'),
      { who: 'bobby', mood: 'grin', text: '「我是波比，技師。那我就跟著你們走吧，剛好順路。真的。」' },
    ],
  },
  // Task 10
  liz: {
    before: [
      N(FOUND_LINE),
      N('暗影迴廊深處，寶庫的門鎖被撬開了。金幣堆成小山，一個少女靠著它坐著，餓得站不起來。'),
      { who: 'liz', mood: 'scheming', text: '「喂，那邊的。金幣分你們一半，換一口吃的。不說話？那六成。七成也行！成交？」' },
      { who: 'rin', text: '「她在跟自己殺價。」' },   // V2: her deadpan; a meeting plays unfiltered, so no guarded face
    ],
    after: [
      // Story polish Task 1 (ruling 2): she says her own name in her own line; 「金幣不用」 lives on in her answer to it.
      // Story depth Task 11 (story polish Task 2 note): Lorne gives his name as at every meeting, inside the rations line (the
      // meeting cap is four lines); her 「帶回家」 answers their turning down the gold.
      N('洛恩遞過乾糧：「我是洛恩。先吃點東西。」她兩口就吞了下去，連膝上的碎屑都撿起來吃掉。'),
      { who: 'liz', mood: 'smile', text: '「活過來了！我是莉茲，尋寶獵人。金幣真的不要？你們這群怪人。」' },
      // Story polish M (diagnosis §4.2 6): the lost faces leak out of a joke instead of a confession.
      { who: 'liz', mood: 'scheming', text: '「你們不要，那我全部扛回家。欸，家在哪啊？算了，先扛再說。」' },
      N('她扛起一袋，走了三步，連人帶袋坐回了金幣堆上。'),
      { who: 'liz', mood: 'scheming', text: '「好啦，老大。雇你們幫我扛，一袋算一成，成交？」' },
    ],
  },
  // Her story fight (spec §6): she takes the party for the ones storming her gate, and fights beside the fortress's machine
  // soldiers until the party has lasted STORY_FIGHT_ROUNDS; the battle log then says `survived`, and she joins.
  scarlet: {
    before: [
      N(FOUND_LINE),
      N('鋼鐵要塞的城門前，一位騎士舉著燃燒的劍，背對著城門站著。'),
      N('她身邊圍著要塞的守城機兵。它們不是在圍攻她，是和她站在同一邊，一起轉向了隊伍。'),
      { who: 'scarlet', mood: 'vow', text: '「止步。這扇門後，一步也不許過。以我的劍起誓，我不會再轉身。」' },
    ],
    after: [
      { who: 'scarlet', mood: 'shaken', text: '「抱歉。我以為你們是來破門的。」' },
      { who: 'hero', text: '「妳在守這扇門？守著什麼？」' },
      N('她張開口，又閉上，回頭看了城門很久。門後面，一點聲音也沒有。'),
      { who: 'scarlet', mood: 'serious', text: '「我是絲嘉蕾，騎士。誰受了傷，請一個一個報上來，我一個一個賠。」' },
      { who: 'scarlet', mood: 'vow', text: '「查清各位的來歷之前，我隨隊行動。這是監視，不是同行。」' },
    ],
  },
};

/**
 * The guild's lead for each companion still out there (6c Task 16; lore ledger I-124, I-126 to I-134): Anna passes on what
 * other adventurers saw, in her registry's words. A sighting, never a call for help: the lost remember nothing (I-126).
 * One box each: the region in words, the depth in numerals, what was seen and never who she is (her meeting, `MEET`, is
 * where she says it). Each matches her meeting's opening picture (spec §6).
 */
// V3 voice pass (light): Anna's clerk voice around each sighting; the picture is unchanged, and her worry keeps the last word.
const LEADS: Record<Meetable, string> = {
  selene: '本道第二層的水晶洞窟裡，有人看見了月光。照不到天的洞裡，跪著一個人影。登記表上，還沒有這個人──這一格，我先空著。',
  chizuru: '霜凍之地回來的人登記了一件事，備註欄寫得密密麻麻：第三層的冰裡，封著一個握長槍的人，姿勢像在做什麼儀式。',
  safira: '熾焰之地第三層的火海裡，有人一個人跳著劍舞。回來的冒險者一邊打拍子一邊說，那拍子像在等誰跟上。',
  sylvie: '腐毒沼澤第四層，一直有弓弦的聲音，一響就有怪物倒下。可是箭，總有用完的時候。',
  noel: '雷鳴之地第四層的岩台上，雷整天亂劈。回報的人頭髮還豎著。雷光裡有個小小的人影，連自己腳邊都劈。那樣撐不了多久。',
  bobby: '本道第六層的星燈神殿，一直傳出扳手的聲音。倒下的古代機兵身上趴著一個人，怪物圍過來也不抬頭。這一份，我蓋了「急件」。',
  liz: '暗影迴廊第六層，有間寶庫的鎖被撬開了。金幣堆成小山，旁邊靠著一個人，一直沒有站起來。這份紀錄，我用紅筆圈起來了。',
  scarlet: '鋼鐵要塞第八層，一位騎士舉著燃燒的劍，守在城門前。靠近的人，全被趕了回來。去之前，把隊伍整好──這一項，我要打勾。',
};

/**
 * Where she first says her own name after the fight: the index in `STORY.meet[id].after` of her first line that has her name
 * in it, or -1. Before it her plate reads 「？？？」 (story polish ruling 2). Read live, so a test that swaps the lines is seen.
 */
export function introIndex(id: Meetable): number {
  return STORY.meet[id].after.findIndex((l) => l.who === id && l.text.includes(nameOf(id)));
}

export const STORY = {
  scenes: buildScenes(),
  /**
   * The town's line of the day, told by the narrator with no name plate (Task 12; lore ledger I-96 to I-101; story polish ruling 8, I-163). Everyone is pretending
   * all is well (spec §3.3). Unconditional: no companion but Rin, no townsfolk secret, and before `after` neither Rin's
   * choice nor the society's end. Act 2 seeds that Lorne has noticed her (§5.2, I-57) without her looking away (I-54);
   * act 4 may come before or after her choice, so it says nothing her choice would undo.
   */
  townLines: {
    // V3 voice pass: the town is visibly pretending, which is funnier than pretending well (style bible §2.5).
    prologue: [
      '廣場的早市照常開張。賣麵包的大嬸笑著跟洛恩打招呼──今天早上，這已經是第三次了。',
      '井邊的婦人壓低聲音：「從深處走出來的？」洛恩一走近，她立刻大聲稱讚起今天的天氣。',
      '西邊高地上，星燈今晚也亮著。老人們說它以前亮得多，說完又補一句：「現在這樣也挺好。」',
      '暮霧貼著石板流進巷子。鎮上的人關緊窗，說一句「今天霧大」，就當它沒來過。',
      '老人們說，前幾天夜裡，遠方好像有鐘在響。是哪裡的鐘，誰也說不上來。',
    ],
    act1: [
      '公會的布告欄上，失憶登記又多了兩張。安娜每一張都多敲兩根釘子，好像這樣就不會再掉。',
      '酒館裡，冒險者們聊起下面的事。聊到一半，誰也想不起是誰先開的頭，乾脆再點一輪。',
      '道具店門口排起了隊。歐里克一邊找零一邊喊「好貨」，歸還之燈賣得最快──大家都想確定，自己回得來。',
      '廣場上，孩子們玩著「迷路了就朝光走」：閉上眼睛朝星燈走，撞到葛倫的人就算輸。',
    ],
    act2: [
      '公會的老人又在說：山上那道光，只是燈罩。大家照樣舉杯，舉得比平常還用力。',
      '瑪莎收著碗：「洛恩，你那碗又讓給凜了？算了，明天我多煮一鍋。」',
      '葛倫揉著眼睛：「那丫頭走路沒聲音，嚇醒我好幾回。小子，你倒是每回都知道，她就在你後面。」',
      '瑪莎開始先把凜的湯盛起來晾著。凜每次都站在桌邊等，等到不冒煙了，才肯坐下。',
      '霧裡又冒出沒人認得的怪物。酒館裡的人一致決定，今晚只聊天氣和麵包的價錢。',
    ],
    act3: [
      '霧又濃了一層。白天也得點燈，鎮上的人卻說，這樣比較有過節的氣氛。',
      '公會門口被人貼了一張紙：「歸來者走到哪，霧就跟到哪。」第二天，紙不見了，安娜的紅筆短了一截。',
      '酒館裡有人提起那張紙。沒人接話，大家突然對麵包漲價很有意見。',
      '天還沒亮，葛倫就站在傳送門前了。他說是早起活動筋骨，可是一動也沒動。',
      '月影旅館換了新的門閂。瑪莎說舊的鬆了，卻每晚都等最後一個人進門，才肯落鎖。',
      '瑪莎小聲說：「那孩子最近吃飯都不抬頭。……你看見了，也什麼都沒問，是吧。」',
    ],
    act4: [
      '鎮上流傳起一個很老的故事：很久以前，有人自己走下去，替燈點火。聽的人都說，那只是故事。',
      '星燈的光柱，暗得只剩一條細線。孩子問它會不會熄，大人只說：「快睡吧。」',
      '歐里克在店門口多點了兩盞燈：「霧再大，也得讓回來的人找得到門！燈油錢？不收！」',
      '公會的牆上，失憶登記多得釘不下了。安娜換了一面更大的牆，什麼也沒說。',
      '瑪莎的桌子越併越長，現在每晚都得併三張。她嘴上嫌擠，湯倒是每一碗都喝得精光。',
      '鎮上的人見面不再問「霧大不大」，改問「吃飽沒」。問完以後，兩邊都笑得有點用力。',
      '幾個冒險者不再來公會了。安娜把他們的登記表，照樣收在抽屜裡。',
      '酒館裡有人說：「要不是那個歸來者，霧也不會──」話還沒說完，歐里克就把一整桶酒倒在他頭上：「這桶好貨，請你的！」',
    ],
    after: [
      '暮霧散了。推開窗就看得見遠山，鎮上的人吵了一早上，爭那座山到底是什麼顏色。',
      '星燈的光柱又亮又直。孩子們抱怨，往後迷了路，再也不用閉著眼睛找它了，一點也不好玩。',
      '傳送門前排起了隊。下去的人不是去打寶，是去找回自己弄丟的東西。葛倫在一旁喊：「一個一個來，別插隊。」',
      '旅館窗外那塊空地，今年綠得特別早。路過的人，都會停下來多看一眼。',
      '鐘不響了。一位穿長袍的老人在鎮上住了下來，每天早上，都到廣場坐一會兒。',
      '廣場上，葛倫和穿長袍的老人並排坐著，一個上午誰也沒開口。到了中午，葛倫把麵包掰了一半遞過去。',
      '凜現在會跟瑪莎說早安了。瑪莎把這件事記進日記，圈了一圈，又圈了一圈。',
    ],
  } as Record<Stage, string[]>,
  /**
   * Rin's town lines before her choice (Task 7). Act 2 starts at depth 4, before her 4th piece: she goes quiet, touches the
   * bell, walks behind, but does not look away yet. From act 3 she looks away. After the finale she has always chosen (U3).
   */
  rinLines: {
    // V1 voice pass: her shadow, kept restrained (no jokes about her strangeness); one 「……」 at most per line, in half the lines at most.
    act2: ['湯放涼了再喝，味道比較多。剛發現的。', '喂，你走前面。我走後面。', '葛倫問我會不會笑。我說會。他等了很久，我忘了要笑。'],
    act3: ['別一直看我。看路。', '最近夢裡一直有鐘聲。……沒事。', '問那麼多做什麼。你先顧好自己。'],
    act4: ['今晚早點睡，門記得鎖好。', '不要站在我背後。……也不要讓我站在你背後。', '沒事。你再問，我也只會說沒事。'],
  } as Partial<Record<Stage, string[]>>,
  /** Rin's lines in the town once she has made her choice; they replace `rinLines`. They read right before and after the finale. */
  rinOath: [
    '洛恩，我們今天也一個都沒少。',
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
    // Story depth Task 4: each line a `KeeperLine`; the town's pool is `engine/story/keeper.ts` `bellkeeperPool`.
    oath: [
      { text: '從深處走出來的人。鐘響了，吾等便來。世世代代，都是如此。' },
      { text: '吾等不是來動手的。那孩子的選擇，吾等還不知道該怎麼回答。' },
      { text: '那孩子領口的鐘，被敲平了。那枚鐘得由她親手交回來，吾等不去取。' },
      // V3 voice pass: one human touch, never a joke (style bible §3 鐘守): the man he came to watch nodded to him.
      { text: '這幾天，我在鎮上看著你。你替旅館劈柴，替孩子撿球。球滾到我腳邊，你也向我點了頭。迷宮的意志，會做這些事嗎？' },
      { text: '吾等怕了很久。怕霧、怕深處，也怕自己弄錯。' },
      // Story depth (design §7.4; controller ruling b): his own hand, and the boy at the gate once Glen remembers him.
      { text: '教那孩子不准眨眼的，是我。我的手，當年抖了。' },
      { text: '守門的那個人想起來了。很多年前替吾等指路的少年，就是他。吾等欠他一句話。', if: { returned: 'glen' } },
    ] as KeeperLine[],
    after: [
      '洛恩，最後那一聲鐘是我敲的。靜鐘會散了，往後不必再有人等它響。',
      '吾等弄錯了很多年。……不，是我弄錯了。剩下的日子，我想拿來記住，不是拿來守。',
      '那孩子笑起來的樣子，我從來沒見過。今天隔著廣場看見了，她在和同伴說笑。我沒有走過去。',
      '廣場的麵包，吾等──不，我今天買了兩個。守門的那個人，每天只帶一個。',
    ],
  },
  /** The wandering merchant's greeting: before Noel has all her memories, and after (his recovered voice, I-68). */
  merchant: {
    lost: '「客人，旅途中缺什麼嗎？價錢跟城裡一樣。我打哪裡來的……哈哈，這個不賣，我自己也找不到。」',
    found: '「年輕人，諾艾兒沒給你們添麻煩吧？你們記住，回去的燈，要比藥先備好。她披風的扣子，也替我看著。」',
  },
  /** The finale's boss room when Rin has not made her choice yet: said once, and the party stays on the map. */
  // Task 14: it plays in act 4 before her choice, maybe before her 6th piece: something is missing, and it is hers to give.
  finaleWait: [
    { who: 'hero', mood: 'serious', text: '「還少了什麼。今天先回去吧。」' },
    N('凜站在他身後，手按著領口的小銅鐘，一步也沒有往前。'),
  ] as ScriptLine[],
  /**
   * Glen, the first time at the gates after Nightmare opens (difficulty plan Task 7a, ruling 22): once, then the tier row
   * is written down as seen.
   */
  tierUnlock: '小子，門後頭的東西變兇了。想往裡頭闖，就把符文帶齊了再進去──不想闖，照舊走也行，門我替你顧著。',
  /**
   * Each facility's greeting, said by its townsperson (Task 12; I-96 to I-101). A greeting knows the stage, not whether its
   * speaker has her fragment back, so it holds both ways: Orik never speaks of his daughter, Anna of her old name, Martha of
   * the day her husband left, Glen of the earlier dawn; Doran, who calls Lorne by name only once returned, calls him nothing.
   */
  greet: {
    // V3 voice pass: each keeper has a running bit that comes back changed (style bible §2.5, §3): Anna's forms and red
    // pen, Orik's pitch with the worry under it, Martha's soup and diary, Glen's 「別逞強」 and yawn, Doran in few words.
    guild: {
      prologue: ['洛恩，你的登記表我收好了。想起什麼隨時來補，一個字也算數──「洛」已經算一個了。', '下去之前，燈帶了嗎？好，打勾。藥也帶了？打勾。今天也請平安歸來──這一格，回來再勾。'],
      act1: ['帳上那筆藥錢和房錢，我用紅筆劃掉了。碎片早就抵清了──這一筆，劃得最痛快。', '歡迎回來。碎片放這裡，我來登記。主人是誰，我一個一個問到底，問到對方嫌我煩為止。'],
      act2: ['那塊石頭，我收進櫃子裡了。備註欄不知道該怎麼寫──裡面的光，到現在還往下流。', '回來了就好。找到的地點、看見的東西，慢慢說。我一條一條記，記錯的，用紅筆改。', '公會的帳上，你們那一頁乾乾淨淨。往後碎片換的錢都歸你們，連印章都蓋得特別用力。'],
      act3: ['下去的時候，別讓誰落在最後面。這是新規矩，我用紅筆寫在規章第一條了。', '你那一張登記表，我每天都會翻一次。最後一欄，還空著──我打算讓它一直空著。'],
      act4: ['碑文我抄了一份，鎖在櫃子裡。……想看的時候，再跟我說。', '霧再濃，登記表上的名字也不會被吹走──我用的是最黏的漿糊。今天也請平安歸來，洛恩。'],
      after: ['歡迎回來。今天來登記的人，都是來領回東西的。報失的那一疊表格，已經積了一層灰。', '洛恩，你那一張的最後一欄，我填上了：「回來了」。這一格，紅筆不准碰。'],
    },
    shop: {
      prologue: ['小兄弟，又要下去了？好膽量！回復藥多帶幾瓶，今天特價，名目就叫「好膽量價」！', '架上全是好貨，沒有一樣不是好貨。哪樣最好？老頭子我說，你手上拿的那樣。'],
      act1: ['燈多帶一盞，不吃虧！回得來，下回才能再讓老頭子我賺一次嘛。', '小兄弟，那把劍的紋路，老頭子我盯了三天──看不懂！看不懂的，一律是好貨。'],
      act2: ['回復藥最近賣得真快！好事一樁。不過你們少用一點，也是好事。', '瞧這靴底磨的，最近下得深了吧？靴子老頭子我不賣，回復藥倒是多帶兩瓶！'],
      act3: ['最近夜裡收攤早。不是怕，是老頭子我也得睡美容覺──好貨要有好氣色來賣嘛！', '好貨都替你留著，貼了「小兄弟專用」，出再高的價都不賣。你可得回來買，聽見沒有？'],
      act4: ['歡迎光臨！今天老頭子我不講價──挑好的拿，別囉嗦。', '活著回來！好貨老頭子我替你囤著，囤到倉庫塞不下，也照囤。'],
      after: ['好貨！好天氣！小兄弟，今天看什麼都順眼吧？', '有人拿著從下面找回來的東西，來問值多少。老頭子我只說：那個，無價！'],
    },
    inn: {
      prologue: ['吃了沒？名字想不起來不要緊，熱湯喝下去，肚子會先記得。', '房間替你們留著。今天下了幾層、吃了什麼，回來都說給我聽──我要寫進日記。'],
      act1: ['回來啦。被褥曬過了，今晚會睡得好一點。日記也記下了：曬被子的好天氣，畫一個圈。', '又瘦了一點。快坐下，湯馬上就好。添第二碗不用問，第三碗也不用。'],
      act2: ['湯要慢慢喝，燙著了我可不管──說的是你們每一個。', '今天的日記，寫到你們出門為止。下一行我先空著，等你們回來填。'],
      act3: ['回來了。好，我記下來了：今天也是全員回來，畫兩個圈。', '孩子，吃不下也坐一會兒。湯我替你溫著──溫了又溫，不差這一回。'],
      act4: ['孩子，臉色好差。……不想說就別說，湯先喝了。', '日記寫到第幾本，我也數不清了。書架快塞不下了──沒關係，你們回來，我就再買一個。'],
      after: ['窗外看得見山了。今天的早飯，大家一起吃──吃不完的，我替你們打包。', '今天的日記好寫。第一行：天晴了。第二行：天還是晴的。'],
    },
    gate: {
      prologue: ['三座門都開著，挑一扇，去吧。別逞強，小子。逞強的人，回來都得我扛。', '霧大的時候別往深處鑽。迷路了就點燈，點了燈就回來，回來就去睡。聽懂沒？'],
      act1: ['門還開著。去吧小子，別逞強──也別洩氣，這句算附贈的。', '走路的樣子像樣多了。別得意，回來再說。'],
      act2: ['門今天也亮著──比去年暗了點，你別跟人說。', '下去吧。別逞強──後面有那丫頭跟著，前面的路，你自己看著點。'],
      act3: ['天亮前我就站在這兒了。不睏──這是呵欠，不是睏。誰從門裡出來，我都看得見。', '小子，回頭看什麼？後面有我盯著，往前走。'],
      act4: ['霧大得看不見對面了。門還開著，我在這裡等。', '別逞強。這句我說了幾十年，沒一個人聽進去。你當第一個。'],
      after: ['天亮了，門也亮著。小子，下去撿點好東西回來，順便替我帶杯熱的。', '從門裡出來的人，現在都笑著出來。這樣的早上，我連呵欠都捨不得打。'],
    },
    forge: {
      prologue: ['那把劍，誰打的？紋路沒見過。放著，我只看──看久一點。', '帶素材來。好鐵配好手藝。你帶好鐵，手藝我出。'],
      act1: ['爐火正旺。要拆要打，說一聲。要聊天，去隔壁。', '刃口缺了。補好再下去。鐵會記仇。'],
      act2: ['那兩把短刃，主人天天來磨。磨得比要用的還利。', '鐵也會累，打太多回就脆。人也一樣。少打兩回。'],
      act3: ['盔甲的扣環，我加了一道。背後最容易被盯上。', '爐子一夜沒熄。睡不著，就打鐵。打了幾把，尺寸都是你們的。'],
      act4: ['霧裡的鐵生鏽得快。回來就拿來，我上油。人的話，去喝湯。', '好鐵配好手藝。……再加上一個肯回來的人，才算打完。'],
      after: ['爐火正旺。今天想打點不砍東西的──鍋鏟。', '素材帶來了？好。天一晴，連鐵都乖。'],
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
    '「明天就回來了，媽媽。」',
    '「麵團要揉到跟耳垂一樣軟。天還沒亮，爐子得先醒。」',
    '「信寫好了，一直沒寄。等我回去，親手交給妳也一樣。」',
    '「爸爸你看，我自己綁好鞋帶了！」',
    '「這口井的水最甜。小時候，奶奶總是先舀一瓢給我。」',
    '「推船下水之前，先看一眼天──我爸總是這麼說。」',
    '「第一個孩子出生那晚，外頭下著大雨。我一直握著她的手。」',
    '「羊數到四十七隻，又少了一隻。算了，明天再上山找。」',
    '「戒指小了一點。他說沒關係，戴久了就合了。」',
    '「別哭。哥哥只是去遠一點的地方工作，很快的。」',
    '「今年的麥子長得好。收完這一季，就把屋頂修一修。」',
    '「他唱歌總是走音。那首歌叫什麼──想不起來了。」',
    '「隔壁的阿婆又送菜來了。下次換我煮一鍋，端過去給她。」',
    '「門口那棵柿子樹，是我們搬來那年一起種的。」',
    '「今天的晚飯，是我第一次自己煮的。大家都說好吃。」',
    '「再過三條巷子就到家了。屋頂冒著煙的那一間，就是我家。」',
    '「老狗趴在門口等我。牠已經走不動了，尾巴還是會搖。」',
    '「這件外套是妳縫的。袖口磨破了，我還是捨不得換。」',
    '「弟弟發燒了。我去找醫生，你們先睡。」',
    '「第一次領到工錢，我買了一包糖，一顆都捨不得吃。」',
    '「是爸爸的船！帆上那塊補丁，我一眼就認得。」',
    '「那年的花開得特別早。我們說好了，明年也要一起來看。」',
    '「阿公的手好大。揹著我過河的時候，一點都不晃。」',
    '「說好了喔。等我長大，換我揹你上山。」',
    '「河邊烤的魚，刺多得要命。他一根一根挑乾淨，才遞給我。」',
    '「最後一塊肉乾留給你。別讓媽知道，她會念。」',
    '「當學徒的第一天，我敲歪了十根釘子。老闆只是笑。」',
    '「出門前，妳替我把領子翻好。那是最後一次嗎？」',
    '「在河邊比賽打水漂，我贏了。弟弟哭著說不算，要再比一次。」',
    '「下個月就要成親了。新鞋子有點緊，走起來腳好痛。」',
    '「我會數到一百了。一、二、三──奇怪，接下來是什麼？」',
    '「醫生說熬過今晚就沒事了。我就坐在這裡，哪裡也不去。」',
    '「市場收攤前，賣魚的大叔總會多塞一條給我。」',
  ],
  people: Object.fromEntries(CHARACTER_IDS.map((id) => [id, written(PEOPLE[id], `people.${id}`)])) as Record<CharacterId, string[]>,
  /** The handbook's truth pages: Lorne's own notes, one per stage, saying only what is known by then (spec §7.6, §8.4). */
  truths: {
    prologue: '我在傳送門廣場醒來，什麼都不記得。鎮上的人說，我是唯一從迷宮深處走出來的人。',
    act1: '迷宮吞掉人的記憶，暮霧也是它吐出來的。燈喰之獸倒下，霧散了。三天後，又回來了。',
    act2: '山上的光柱只是燈罩，燈芯在迷宮最底下。迷宮是燈壞掉之後才長出來的。凜喝湯的樣子，像有人規定她非喝完不可。',
    act3: '舊登記簿裡，有好幾個我。有幾筆死在靜鐘會手上。這一次的最後一欄，安娜說會一直空著。',
    act4: '地底的艾斯特拉，有人自願當燈芯，叫守燈人。霧變濃是因為燈芯快燒完，靜鐘會看反了。那塊碑，我讀得懂。',
    after: '燈點亮了，這一次不必有人燒盡自己。我找回的那十段記憶，交給了燈。手冊裡的筆記還在，大家也替我記著。',
  } as Record<Stage, string>,
  /**
   * The townsfolk in the handbook and at their counters (Task 11): `lost` is what the held fragment took from its owner;
   * `after` joins that facility's greeting once it is returned. Unconditional: true before and after Liz's reunion, Rin's
   * choice and the finale.
   */
  town: {
    orik: {
      lost: '歐里克失去了女兒的臉。他記得自己有個女兒，卻想不起她長什麼樣子。',
      // V3 voice pass (light): the thanks keep their reward and lose their 「……」, so a counter's pool spends one at most.
      after: '小兄弟，往後都算你便宜一成！名目嘛，就叫「平安回來價」。',
    },
    marta: {
      lost: '瑪莎失去了丈夫離開的那一天。她每天寫日記，怕明天連今天也忘了。',
      after: '今天多添了一道菜。吃飽了，身子才擋得住。吃完別跑，今天的事說給我聽。',
    },
    anna: {
      lost: '安娜失去了進入迷宮之前的名字。她替每一個失憶的人建檔，自己那一張卻從來不提。',
      after: '碎片的收購價調高了，表格我也改好了。叫我安娜就好──兩個名字，我都留著。',
    },
    glen: {
      lost: '葛倫失去了很久以前的一個黎明。那天在傳送門前發生的事，他一點也想不起來。',
      after: '洛恩，哪一扇門不合意，跟我說，我替你換。挑門不算逞強。',
    },
    doran: {
      lost: '多蘭失去了師父的鍛造手法。火候總是差一點，差在哪裡，他說不上來。',
      after: '套裝的料，少兩份也打得成。手藝回來了，洛恩。',
    },
  } as Record<TownFragmentId, { lost: string; after: string }>,
};
