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
const N = (text: string): ScriptLine => ({ who: 'narrator', text });

/** The finished script, scene by scene (plan 6c). Read the style bible and the lore ledger before adding to it. */
const SCRIPT: Partial<Record<SceneId, Written>> = {
  // Task 4: the prologue (spec §9.2, §3.3, §4).
  prologue: {
    lines: [
      N('黎明前的傳送門廣場。暮霧貼著石板流動，西邊高地上的星燈，淡得像快燒盡的燭芯。'),
      { who: 'glen', text: '「喂，醒醒！……這身灰，是深處才有的。」' },
      { who: 'glen', text: '「沒人走進去，門卻自己亮了。這小子背著那女孩走出來，走了三步就倒了。」' },
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
    summary: '黎明的傳送門廣場倒著兩個失憶的人。安娜替他們取名洛恩與凜；他是唯一從深處走出來的人。',
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
      N('「守著這扇門。」師父說，「鐘響的那天，門後走出來的東西，一樣也別放過。」'),
      { who: 'rin', text: '「我在那裡等了很久。等的是什麼……還想不起來。」' },
      N('她說得很平靜，握著短刃的手卻在發抖。洛恩看見了，什麼也沒問。'),
    ],
    summary: '凜想起自己被派去守一扇吐霧的石門，等著某一天鐘響。',
  },
  'mem:rin:6': {
    lines: [
      N('守門的第幾年，她已經數不清了。那天夜裡，領口那枚小銅鐘，自己響了。'),
      N('她想起臨行前，師父替她扣上銅鐘：「靜鐘會的信物。它響了，就是時候了。」'),
      N('「刀柄上的字，是妳的代號，不是名字。去殺掉那個從深處走出來的人。」'),
      { who: 'rin', mood: 'sad', text: '「……你先回去。我一個人，待一下就好。」' },
    ],
    summary: '鐘自己響了。「凜」是刺客的代號；她的任務，是殺死從深處走出來的人。',
  },
  'mem:rin:7': {
    lines: [
      N('鐘響了三天，石門卻什麼也沒走出來。她握緊短刃，自己走進了迷宮。'),
      N('她在深處找到了他。那人渾身是灰，拖著一把刻滿紋路的劍，一步一步往上走。'),
      N('她跟在後面，跟了好幾層。他一次也沒回頭，像是只看得見頭頂那一點光。'),
      N('出口就在前面。她拔出短刃，刀尖離他的後頸，只剩一個呼吸的距離。'),
      N('就在那一瞬間，暮霧從四面八方湧上來。白色吞掉了光，吞掉了路，也吞掉了她記得的一切。'),
      N('最後剩下的，是一隻手。有人在霧裡抓住她的手腕，把她往光的方向拉。'),
      { who: 'rin', mood: 'sad', text: '「……那把劍。上面的紋路，我看過。」' },
      { who: 'hero', text: '「凜？妳想起什麼了？」' },
      { who: 'rin', mood: 'sad', text: '「霧裡抓住我的那隻手……是你的。」' },
      { who: 'rin', mood: 'sad', text: '「我追了那麼多層，要殺的人，就是你。」' },
      { who: 'hero', text: '「凜──」' },
      N('她退了一步，又一步。短刃還在鞘裡，她的手卻一直握著刀柄，沒有放開。'),
    ],
    summary: '凜想起她追進迷宮，在出口前和目標一起被暮霧吞沒。那個人，就是洛恩。',
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
      out[`chat:${id}:${n}`] = {
        title: `${name}・對話 ${n}`,
        lines: [{ who: id, text: ph(`（${name}說了第${numeral(n)}段話。）`) }],
        summary: ph(`和${name}聊了一會兒。`),
      };
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

// The town's opening lines and the facility greetings, one set for every stage until 6c writes them per stage.
const stageEach = <V>(make: () => V): Record<Stage, V> =>
  Object.fromEntries(STAGES.map((s) => [s, make()])) as Record<Stage, V>;

const TOWN_OPENING = ['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。'];
const greetOf = (a: string, b: string) => stageEach(() => [ph(a), ph(b)]);

export const STORY = {
  scenes: buildScenes(),
  townLines: stageEach(() => TOWN_OPENING.map((t) => ph(t))),
  rinLines: {
    act2: [ph('……沒什麼。')], act3: [ph('……沒什麼。')], act4: [ph('……沒什麼。')], after: [ph('……沒什麼。')],
  } as Partial<Record<Stage, string[]>>,
  /** Rin's lines in the town once she has made her choice; they replace `rinLines`. */
  rinOath: [ph('……我在這裡。哪裡也不去。'), ph('今天也，一起回來了呢。')],
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
  act1Card: { title: ph('第一幕　星燈重新亮起'), body: ph('燈喰之獸倒下了。暮霧散去，露米亞迎來久違的晨光。') },
  endingTitle: ph('終幕　點燈'),
  /** Rescue meetings: what is said before the fight (the found line is narration; 6c adds hers) and after it is won. */
  meet: Object.fromEntries(MEETINGS.map((m) => [m.id, {
    before: [{ who: 'narrator' as const, text: ph(`有人被怪物圍住了──是${nameOf(m.id)}！`) }],
    after: [] as ScriptLine[],
  }])) as Record<Meetable, { before: ScriptLine[]; after: ScriptLine[] }>,
  absorb: [ph('碎片化開，一段陌生的暖意流進身體。')],
  people: Object.fromEntries(CHARACTER_IDS.map((id) => [id, [1, 2, 3].map((n) => ph(`${nameOf(id)}的簡介（${numeral(n)}）。`))])) as Record<CharacterId, string[]>,
  truths: Object.fromEntries(STAGES.map((s, i) => [s, ph(`第${numeral(i + 1)}條真相。`)])) as Record<Stage, string>,
  town: Object.fromEntries(TOWN_FRAGMENTS.map((f) => [f.id, { lost: ph(`${f.npc}遺失了一段記憶。`), after: ph(`${f.npc}想起來了，謝謝你。`) }])) as Record<TownFragmentId, { lost: string; after: string }>,
};
