// The read-aloud dump (story polish Task 3): the script as it plays, one reading at a time, with the plates the game shows,
// for the rewriter (R2, R6) and the read-aloud reviewer (R8). Runs only under the tests: `readAloud.test.ts` writes it to
// STORY_DUMP when that is set.
import { CHARACTERS, CHARACTER_IDS } from '../characters';
import { MEETINGS } from '../meetings';
import { NPC_NAMES, STORY, introIndex, type LineWhen, type ScriptLine, type Speaker } from '../story.zh-TW';
import { T } from '../text.zh-TW';
import { SCENE_IDS, type SceneId } from './scenes';
import { SENTENCE_PARTICLE, dots, heavyScene, readingsOf, sceneReadings, speakerOf, storyTexts } from './voiceGates';

/** The pools that are not scenes, in the order they are printed after the scenes and the meetings. */
const POOLS = ['townLines', 'greet', 'rinLines', 'rinOath', 'bellkeeper', 'merchant', 'leads', 'absorb', 'people', 'truths', 'town'] as const;
const PARTICLES = ['呢', '吧', '啦', '喔', '囉', '嘛', '耶', '唷', '呀'];

const nameOf = (who: Speaker): string =>
  who === 'narrator' ? '' : (CHARACTER_IDS as string[]).includes(who) ? CHARACTERS[who as keyof typeof CHARACTERS].name : NPC_NAMES[who as keyof typeof NPC_NAMES];
/** One line as the box shows it: `名牌：台詞`, the narrator's with no plate. */
const say = (l: ScriptLine, plate?: string): string => {
  const name = plate ?? nameOf(l.who);
  return name ? `${name}：${l.text}` : l.text;
};
/** The scenes `lines` wait on (`if.seen`, `if.notSeen`), in the order they first come. */
const waitsOn = (lines: ScriptLine[]): SceneId[] => [...new Set(lines.flatMap((l) => [l.if?.seen, l.if?.notSeen].filter((x): x is SceneId => !!x)))];
/**
 * What a reading turns on, in words: who is not met, whose memories are whole, which townsfolk piece is back, her choice,
 * and each scene the lines wait on, seen or not (`waits`).
 */
const readingLabel = (w: LineWhen, waits: SceneId[] = []): string => {
  const parts = [
    ...CHARACTER_IDS.filter((c) => !w.met.includes(c)).map((c) => `未遇見${CHARACTERS[c].name}`),
    ...w.full.map((c) => `${CHARACTERS[c].name}集滿`),
    ...w.returned.map((t) => `${t}已交還`),
    ...(w.oath ? ['凜已選擇'] : []),
    ...waits.map((id) => ((w.seen ?? []).includes(id) ? `看過 ${id}` : `沒看過 ${id}`)),
  ];
  return parts.length ? parts.join('、') : '基本';
};

/**
 * The read-aloud script of every key under `prefixes`: the scenes in `SCENE_IDS` order (each reading once, marked
 * ［重］ or ［輕］), then the meetings (her plate 「？？？」 until she says her name), then the pools that are not scenes.
 * The header counts the strings with 「……」 and each speaker's sentence particles over the same keys.
 */
export function readAloud(prefixes: string[]): string {
  // a scene or meeting is printed whole as soon as a prefix names any of its keys (Task 3 review I3)
  const touches = (unit: string): boolean => prefixes.some((p) => unit.startsWith(p) || p.startsWith(unit));
  const unitOf = (key: string): string | undefined => {
    const [top, id] = key.split('.');
    return top === 'scenes' || top === 'meet' ? `${top}.${id}.` : undefined;
  };
  const under = (key: string): boolean => prefixes.some((p) => key.startsWith(p)) || (unitOf(key) !== undefined && touches(unitOf(key)!));
  const texts = storyTexts().filter((t) => under(t.key));
  const body: string[] = [];

  for (const id of SCENE_IDS) {
    if (!touches(`scenes.${id}.`)) continue;
    const scene = STORY.scenes[id];
    body.push(`## scenes.${id} ${heavyScene(id) ? '［重］' : '［輕］'} ${scene.title}`, '');
    const waits = waitsOn(scene.lines);
    for (const r of sceneReadings(id)) body.push(`### 讀法：${readingLabel(r.when, waits)}`, ...r.lines.map((l) => say(l)), '');
    body.push(`摘要：${scene.summary}`, '');
  }
  // in the order they are met: by depth, the mainline first at a depth it shares (spec §6)
  const byDepth = [...MEETINGS].sort((a, b) => a.depth - b.depth || Number(b.region === 'mainline') - Number(a.region === 'mainline'));
  for (const { id } of byDepth) {
    if (!touches(`meet.${id}.`)) continue;
    const { before, after } = STORY.meet[id];
    const intro = introIndex(id);
    const stranger = (l: ScriptLine, i: number, part: 'before' | 'after') =>
      l.who === id && (part === 'before' || i < intro) ? T.ui2.rescue.stranger : undefined;
    body.push(`## meet.${id} ［輕］`, '', '### 戰鬥前', ...before.map((l, i) => say(l, stranger(l, i, 'before'))), '', '### 戰鬥後', ...after.map((l, i) => say(l, stranger(l, i, 'after'))), '');
  }
  for (const pool of POOLS) {
    const rows = texts.filter((t) => t.key.startsWith(`${pool}.`));
    if (!rows.length) continue;
    // each row with its plate: the one who says it (`speakerOf`), none for narration
    const plated = (t: (typeof rows)[number]): string => {
      if (t.line) return say(t.line);
      const who = speakerOf(t.key);
      return who && who !== 'narrator' ? `${nameOf(who)}：${t.text}` : t.text;
    };
    body.push(`## ${pool} ${pool === 'rinLines' ? '［重］' : '［輕］'}`, '', ...rows.map((t) => `${t.key}　${plated(t)}`), '');
  }
  // anything else the prefixes name (the finale's wait, the act card, single strings)
  const printed = (key: string) => key.startsWith('scenes.') || key.startsWith('meet.') || POOLS.some((p) => key.startsWith(`${p}.`));
  const rest = texts.filter((t) => !printed(t.key));
  if (rest.length) {
    const finaleWait = rest.filter((t) => t.key.startsWith('finaleWait.') && t.line).map((t) => t.line!);
    if (finaleWait.length) for (const r of readingsOf(finaleWait)) body.push(`## finaleWait ［重］ 讀法：${readingLabel(r.when, waitsOn(finaleWait))}`, ...r.lines.map((l) => say(l)), '');
    body.push('## 其他', '', ...rest.filter((t) => !(t.key.startsWith('finaleWait.') && t.line)).map((t) => `${t.key}　${t.text}`), '');
  }

  // The header: 「……」 and particles over the same keys.
  const withDots = texts.filter((t) => dots(t.text) > 0).length;
  const share = texts.length ? ((withDots / texts.length) * 100).toFixed(1) : '0.0';
  const speakers = [...new Set(texts.filter((t) => t.line && t.line.who !== 'narrator').map((t) => t.line!.who))];
  const rows = speakers.map((who) => {
    const theirs = texts.filter((t) => t.line?.who === who);
    return `| ${nameOf(who)} | ${theirs.length} | ${PARTICLES.map((p) => theirs.filter((t) => SENTENCE_PARTICLE(p).test(t.text)).length).join(' | ')} |`;
  });
  const head = [
    `# 朗讀稿：${prefixes.join('、')}`, '',
    `「……」：${withDots}／${texts.length} 個字串（${share}%）`, '',
    '助詞（每位說話者帶該助詞的句數）', '',
    `| 說話者 | 句數 | ${PARTICLES.join(' | ')} |`, `|---|---|${PARTICLES.map(() => '---').join('|')}|`, ...rows, '',
  ];
  return [...head, ...body].join('\n');
}

/** Writes `readAloud(STORY_DUMP_KEYS)` to STORY_DUMP when the environment asks for it; says whether it wrote. */
export function dumpStory(env: Record<string, string | undefined>, write: (path: string, text: string) => void): boolean {
  const path = env.STORY_DUMP;
  if (!path) return false;
  write(path, readAloud((env.STORY_DUMP_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean)));
  return true;
}
