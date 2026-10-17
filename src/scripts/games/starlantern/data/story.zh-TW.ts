// Story copy (zh-TW). Every line of dialogue goes through ph(): it is placeholder text until plan 6c writes the real script.
import type { CharacterId } from '../engine/types';
import type { ExtraMood, Mood } from '../render/artPaths';
import { CHARACTERS, CHARACTER_IDS } from './characters';
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
  if?: { met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId };
}

/** Every string that is still draft copy. 6c empties this set by writing the real script. */
export const PLACEHOLDERS = new Set<string>();
const ph = (text: string): string => { PLACEHOLDERS.add(text); return text; };

const nameOf = (id: CharacterId): string => CHARACTERS[id].name;

const MAJOR_TITLES: Record<MajorScene, string> = {
  prologue: '序章', 'act1-after': '第一幕・之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', finale: '終幕',
};
const MAJOR_TEXT: Record<MajorScene, string> = {
  prologue: '序章', 'act1-after': '第一幕之後', act2: '第二幕', act3: '第三幕', act4: '第四幕', 'rin-reveal': '凜的真相', finale: '終幕',
};

function buildScenes(): Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }> {
  const out = {} as Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }>;
  for (const id of MAJOR_SCENES) {
    out[id] = { title: MAJOR_TITLES[id], lines: [{ who: 'narrator', text: ph(`（${MAJOR_TEXT[id]}。）`) }], summary: ph(`${MAJOR_TEXT[id]}的故事。`) };
  }
  for (const id of CHARACTER_IDS) {
    const name = nameOf(id);
    CHAINS[id].pieces.forEach((_, i) => {
      const n = i + 1;
      out[memScene(id, n)] = {
        title: `${name}・第 ${n} 片`,
        lines: [{ who: id, text: ph(`（${name}想起了第 ${n} 段記憶。）`) }],
        summary: ph(`${name}找回了一段記憶。`),
      };
    });
    for (let n = 1; n <= CHAT_COUNT[id]; n++) {
      out[`chat:${id}:${n}`] = {
        title: `${name}・對話 ${n}`,
        lines: [{ who: id, text: ph(`（${name}說了第 ${n} 段話。）`) }],
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

// The opening lines are copied from the current T.ui2.town.lines and T.ui2.facility.<x>.greet as literals (never referenced):
// the originals are deleted in a later task.
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
  greet: {
    guild: greetOf('歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。'),
    shop: greetOf('歡迎光臨！看看有什麼需要的。', '剛進了新貨喔。'),
    inn: greetOf('辛苦了，要休息一下嗎？', '熱湯已經準備好了。'),
    gate: greetOf('三座傳送門都開著。要去哪裡？別逞強。', '傳送門今天也在發光。'),
    forge: greetOf('爐火正旺。要拆、要打，還是要重新鍛一回？', '帶素材來了嗎？好鐵配好手藝。'),
  },
  absorb: [ph('碎片化開，一段陌生的暖意流進身體。')],
  people: Object.fromEntries(CHARACTER_IDS.map((id) => [id, [1, 2, 3].map((n) => ph(`${nameOf(id)}的簡介（${n}）。`))])) as Record<CharacterId, string[]>,
  truths: Object.fromEntries(STAGES.map((s, i) => [s, ph(`第 ${i + 1} 條真相。`)])) as Record<Stage, string>,
  town: Object.fromEntries(TOWN_FRAGMENTS.map((f) => [f.id, { lost: ph(`${f.npc}遺失了一段記憶。`), after: ph(`${f.npc}想起來了，謝謝你。`) }])) as Record<TownFragmentId, { lost: string; after: string }>,
};
