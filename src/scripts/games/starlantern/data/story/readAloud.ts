// The read-aloud dump (story polish Task 3): the script as it plays, one reading at a time, with the plates the game shows,
// for the rewriter (R2, R6) and the read-aloud reviewer (R8). Runs only under the tests: `readAloud.test.ts` writes it to
// STORY_DUMP when that is set.
import { CHARACTERS, CHARACTER_IDS } from '../characters';
import { MEETINGS } from '../meetings';
import { NPC_NAMES, STORY, flatLines, introIndex, isChoice, numeral, type LineWhen, type SceneLine, type ScriptLine, type Speaker } from '../story.zh-TW';
import { GIFT_LINES, RIN_OATH_GIFT_LINES, type GiftPools } from '../bond.zh-TW';
import { COMPANIONS, type Companion, type Tone } from './bond';
import { T } from '../text.zh-TW';
import { SCENE_IDS, type SceneId } from './scenes';
import { SENTENCE_PARTICLE, dots, heavyScene, readingsOf, sceneReadings, speakerOf, storyTexts } from './voiceGates';

/** The pools that are not scenes, in the order they are printed after the scenes and the meetings. */
const POOLS = ['townLines', 'greet', 'rinLines', 'rinOath', 'bellkeeper', 'merchant', 'leads', 'absorb', 'people', 'truths', 'town', 'nightBeats'] as const;
const PARTICLES = ['呢', '吧', '啦', '喔', '囉', '嘛', '耶', '唷', '呀'];

const nameOf = (who: Speaker): string =>
  who === 'narrator' ? '' : (CHARACTER_IDS as string[]).includes(who) ? CHARACTERS[who as keyof typeof CHARACTERS].name : NPC_NAMES[who as keyof typeof NPC_NAMES];
/** The scenes `lines` wait on (`if.seen`, `if.notSeen`), in the order they first come. */
const waitsOn = (lines: readonly SceneLine[]): SceneId[] => [...new Set(flatLines(lines).flatMap((l) => [l.if?.seen, l.if?.notSeen].filter((x): x is SceneId => !!x)))];
/** Bond plan Task 7: what each tone of a choice is called in the dump. */
const TONE_NAMES: Record<Tone, string> = { ask: '問', stay: '陪', promise: '約' };
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

/** One spoken line, kept aside in blind mode: who says it (the key's answer) and what is said. */
interface Said { name: string; text: string }

/**
 * The read-aloud script of every key under `prefixes`: the scenes in `SCENE_IDS` order (each reading once, marked
 * ［重］ or ［輕］), then the meetings (her plate 「？？？」 until she says her name), then the pools that are not scenes.
 * The header counts the strings with 「……」 and each speaker's sentence particles over the same keys.
 * Blind (story L Task 7): every plate is 「？」 and nothing else names the speaker (no scene title, key, summary, reading label
 * or particle table); each spoken line comes back in `said`, its place in the text held by a token for `readAloudBlind`.
 */
function render(prefixes: string[], blind: boolean): { lines: string[]; said: Said[] } {
  // a scene or meeting is printed whole as soon as a prefix names any of its keys (Task 3 review I3)
  const touches = (unit: string): boolean => prefixes.some((p) => unit.startsWith(p) || p.startsWith(unit));
  const unitOf = (key: string): string | undefined => {
    const [top, id] = key.split('.');
    return top === 'scenes' || top === 'meet' ? `${top}.${id}.` : undefined;
  };
  const under = (key: string): boolean => prefixes.some((p) => key.startsWith(p)) || (unitOf(key) !== undefined && touches(unitOf(key)!));
  const texts = storyTexts().filter((t) => under(t.key));
  const body: string[] = [];
  const said: Said[] = [];
  /** A line with its plate `name`; narration (no name) bare; blind, a token the numbering pass fills in. */
  const plated = (name: string, text: string): string => {
    if (!name) return text;
    if (!blind) return `${name}：${text}`;
    said.push({ name, text });
    return `${TOKEN}${said.length - 1}${TOKEN}`;
  };
  const say = (l: ScriptLine, plate?: string): string => plated(plate ?? nameOf(l.who), l.text);
  let part = 0;
  /** A part's heading: its own words, or blind only a number and light or heavy. */
  const heading = (open: string, weight: string, title = ''): string => (blind ? `## 第${++part}段 ${weight}` : `## ${open} ${weight}${title ? ` ${title}` : ''}`);
  const reading = (label: string, k: number): string => (blind ? `### 讀法${numeral(k + 1)}` : `### 讀法：${label}`);

  for (const id of SCENE_IDS) {
    if (!touches(`scenes.${id}.`)) continue;
    const scene = STORY.scenes[id];
    body.push(heading(`scenes.${id}`, heavyScene(id) ? '［重］' : '［輕］', scene.title), '');
    const waits = waitsOn(scene.lines);
    // bond plan Task 7: a choice prints each way Lorne can say it, marked with its tone, its reply under it
    const sayAll = (l: SceneLine): string[] => (isChoice(l)
      ? l.choices.flatMap((c) => [`［選項・${TONE_NAMES[c.tone]}］${say({ who: 'hero', text: c.text })}`, ...c.reply.map((x) => `　→ ${say(x)}`)])
      : [say(l)]);
    sceneReadings(id).forEach((r, k) => body.push(reading(readingLabel(r.when, waits), k), ...r.played.flatMap(sayAll), ''));
    if (!blind) body.push(`摘要：${scene.summary}`, '');
  }
  // bond plan Task 7: her gift reactions (`gift:<c>`), pool by pool; Rin's after her choice under their own heading
  const pools = (title: string, c: Companion, p: GiftPools): string[] => [
    heading(title, '［輕］'), '',
    ...(['loved', 'liked', 'neutral'] as const).flatMap((t) => p[t].map((x) => `${blind ? '・' : `${t}　`}${say({ who: c, text: x })}`)),
    ...Object.entries(p.declined).map(([m, x]) => `${blind ? '・' : `declined ${m}　`}${say({ who: c, text: x! })}`),
    ...Object.entries(p.healed).map(([m, x]) => `${blind ? '・' : `healed ${m}　`}${say({ who: c, text: x! })}`),
    '',
  ];
  for (const c of COMPANIONS) {
    if (!touches(`gift:${c}`)) continue;
    if (GIFT_LINES[c]) body.push(...pools(`gift:${c}`, c, GIFT_LINES[c]!));
    if (c === 'rin' && RIN_OATH_GIFT_LINES) body.push(...pools('gift:rin（選擇之後）', c, RIN_OATH_GIFT_LINES));
  }
  // in the order they are met: by depth, the mainline first at a depth it shares (spec §6)
  const byDepth = [...MEETINGS].sort((a, b) => a.depth - b.depth || Number(b.region === 'mainline') - Number(a.region === 'mainline'));
  for (const { id } of byDepth) {
    if (!touches(`meet.${id}.`)) continue;
    const { before, after } = STORY.meet[id];
    const intro = introIndex(id);
    const stranger = (l: ScriptLine, i: number, part: 'before' | 'after') =>
      l.who === id && (part === 'before' || i < intro) ? T.ui2.rescue.stranger : undefined;
    body.push(heading(`meet.${id}`, '［輕］'), '', '### 戰鬥前', ...before.map((l, i) => say(l, stranger(l, i, 'before'))), '', '### 戰鬥後', ...after.map((l, i) => say(l, stranger(l, i, 'after'))), '');
  }
  for (const pool of POOLS) {
    const rows = texts.filter((t) => t.key.startsWith(`${pool}.`));
    if (!rows.length) continue;
    // each row with its plate: the one who says it (`speakerOf`), none for narration
    const row = (t: (typeof rows)[number]): string => {
      if (t.line) return say(t.line);
      const who = speakerOf(t.key);
      return plated(who && who !== 'narrator' ? nameOf(who) : '', t.text);
    };
    body.push(heading(pool, pool === 'rinLines' ? '［重］' : '［輕］'), '', ...rows.map((t) => (blind ? `・${row(t)}` : `${t.key}　${row(t)}`)), '');
  }
  // anything else the prefixes name (the finale's wait, the act card, the night's beats, single strings)
  const printed = (key: string) => key.startsWith('scenes.') || key.startsWith('meet.') || POOLS.some((p) => key.startsWith(`${p}.`));
  const rest = texts.filter((t) => !printed(t.key));
  if (rest.length) {
    const finaleWait = rest.filter((t) => t.key.startsWith('finaleWait.') && t.line).map((t) => t.line!);
    if (finaleWait.length) {
      readingsOf(finaleWait).forEach((r, k) => {
        const label = blind ? `${heading('', '［重］')} 讀法${numeral(k + 1)}` : `## finaleWait ［重］ 讀法：${readingLabel(r.when, waitsOn(finaleWait))}`;
        body.push(label, ...r.lines.map((l) => say(l)), '');
      });
    }
    const others = rest.filter((t) => !(t.key.startsWith('finaleWait.') && t.line));
    const row = (t: (typeof others)[number]): string => (t.line ? say(t.line) : t.text);
    if (others.length) body.push(blind ? heading('', '［輕］') : '## 其他', '', ...others.map((t) => (blind ? `・${row(t)}` : `${t.key}　${row(t)}`)), '');
  }

  // The header: 「……」 over the same keys, and (not blind) each speaker's particles.
  const withDots = texts.filter((t) => dots(t.text) > 0).length;
  const share = texts.length ? ((withDots / texts.length) * 100).toFixed(1) : '0.0';
  const head = [`# 朗讀稿${blind ? '（無名牌）' : `：${prefixes.join('、')}`}`, '', `「……」：${withDots}／${texts.length} 個字串（${share}%）`, ''];
  if (!blind) {
    const speakers = [...new Set(texts.filter((t) => t.line && t.line.who !== 'narrator').map((t) => t.line!.who))];
    const rows = speakers.map((who) => {
      const theirs = texts.filter((t) => t.line?.who === who);
      return `| ${nameOf(who)} | ${theirs.length} | ${PARTICLES.map((p) => theirs.filter((t) => SENTENCE_PARTICLE(p).test(t.text)).length).join(' | ')} |`;
    });
    head.push('助詞（每位說話者帶該助詞的句數）', '', `| 說話者 | 句數 | ${PARTICLES.join(' | ')} |`, `|---|---|${PARTICLES.map(() => '---').join('|')}|`, ...rows, '');
  }
  return { lines: [...head, ...body], said };
}

/** The read-aloud script of every key under `prefixes`, with the plates the game shows (see `render`). */
export function readAloud(prefixes: string[]): string {
  return render(prefixes, false).lines.join('\n');
}

/** Where a blind dump's spoken line goes, until the numbering pass fills it in. */
const TOKEN = '\u0000';
/** How many spoken lines a blind dump numbers for the listener to name (plan W8 question 4). */
export const BLIND_NUMBERED = 10;
/** A fixed draw from the prefixes (mulberry32 on a string hash): the same dump numbers the same lines every time. */
function seededDraw(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The blind read-aloud (story L Task 7, plan W6 and W8): the dump with every plate 「？」, and `BLIND_NUMBERED` spoken lines
 * (all of them when there are fewer) numbered [1] on in the order they are said, drawn with a fixed seed. `key` says who
 * says each numbered line, for the controller; the reader gets `text` only.
 */
export function readAloudBlind(prefixes: string[]): { text: string; key: string } {
  const { lines, said } = render(prefixes, true);
  const draw = seededDraw(prefixes.join(','));
  const order = said.map((_, i) => i);
  for (let i = 0; i < Math.min(BLIND_NUMBERED, order.length); i++) {
    const j = i + Math.floor(draw() * (order.length - i));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const picked = order.slice(0, BLIND_NUMBERED).sort((x, y) => x - y);
  const number = new Map(picked.map((at, n) => [at, n + 1]));
  const text = lines.join('\n').replace(new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g'), (_, at: string) => {
    const n = number.get(Number(at));
    return `${n ? `[${n}] ` : ''}？：${said[Number(at)].text}`;
  });
  const key = ['# 朗讀稿（無名牌）的答案', '', ...picked.map((at, n) => `[${n + 1}] ${said[at].name}：${said[at].text}`), ''].join('\n');
  return { text, key };
}

/**
 * Writes `readAloud(STORY_DUMP_KEYS)` to STORY_DUMP when the environment asks for it, or, with STORY_DUMP_BLIND set, the
 * blind dump there and its key beside it; says whether it wrote.
 */
export function dumpStory(env: Record<string, string | undefined>, write: (path: string, text: string) => void): boolean {
  const path = env.STORY_DUMP;
  if (!path) return false;
  const keys = (env.STORY_DUMP_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (env.STORY_DUMP_BLIND) {
    // story L Task 7: the blind dump for the reader, and its key apart (`<STORY_DUMP>.key.md`)
    const { text, key } = readAloudBlind(keys);
    write(path, text);
    write(`${path}.key.md`, key);
    return true;
  }
  write(path, readAloud(keys));
  return true;
}
