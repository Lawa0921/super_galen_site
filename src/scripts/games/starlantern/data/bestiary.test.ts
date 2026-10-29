// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BESTIARY, type BestiaryText } from './bestiary.zh-TW';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { ENEMIES } from './enemies';
import { SPECIALS } from './gear';
import { LEGACY_ENEMY_IDS, ROSTER_LIVE } from './monsters';
import { STAGES, type Stage, type StoryGate } from './story/scenes';
import { withRosterLive } from '../engine/testing';
import type { CharacterId } from '../engine/types';

/**
 * Roster plan Task C5 (spec §4.2, §10, ruling 20): the gates the bestiary's words must pass, written before a single entry
 * is. Each L task's writing (W1–W7) fills BESTIARY; these keep what it writes from telling a secret before its scene.
 */

/** Where a word may first be said: a scene seen (a memory piece, or an act), or never. */
type Reveal = { mem: [CharacterId, number] } | { scene: 'act3' | 'act4' | 'finale' } | 'never';
/**
 * The checked words and their earliest reveal. Copied, as data/monsters.test.ts's SECRET_WORDS is (A5), from the lore
 * ledger's 揭露表 (docs/superpowers/story/starlantern-lore-ledger.md §3, :98-114) and data/story/story.test.ts:
 * RIN_SECRET_TERMS (:428), SPOILERS (:457, :462) and REVEALED (:1009-1046), each word at its own piece; and ruling 20's
 * (plan): no 道具店 or 露米亞 anywhere, 鐘守 never (I-10, I-167), 滿月 from mem:selene:2. When either source changes, so
 * does this list.
 */
const WORDS: { re: RegExp; at: Reveal }[] = [
  { re: /靜鐘會/, at: { scene: 'act3' } },
  { re: /守燈人/, at: { scene: 'act4' } },
  { re: /艾斯特拉/, at: { scene: 'act4' } },
  { re: /燈喰之母/, at: { scene: 'finale' } },
  { re: /燈鑰/, at: { mem: ['hero', 10] } },
  { re: /代號|信物|刺客|派來殺|派去殺|去殺|要殺的人/, at: { mem: ['rin', 6] } },
  { re: /道具店|露米亞/, at: 'never' },
  { re: /鐘守/, at: 'never' },
  { re: /滿月/, at: { mem: ['selene', 2] } },
  // REVEALED, story.test.ts :1010-1046
  { re: /洛恩/, at: { mem: ['selene', 5] } },
  { re: /我想看見|新月/, at: { mem: ['selene', 5] } },
  { re: /不在了/, at: { mem: ['chizuru', 4] } },
  { re: /託付/, at: { mem: ['chizuru', 5] } },
  { re: /團長|做決定的/, at: { mem: ['safira', 4] } },
  { re: /[你妳]要繼續跳/, at: { mem: ['safira', 5] } },
  { re: /林子|守林/, at: { mem: ['sylvie', 1] } },
  { re: /帶出去/, at: { mem: ['sylvie', 4] } },
  { re: /帶出來|種子|種下|空地|新綠|發芽/, at: { mem: ['sylvie', 5] } },
  { re: /星火|燒掉/, at: { mem: ['noel', 3] } },
  { re: /燒光|為薪|保護/, at: { mem: ['noel', 4] } },
  { re: /商人/, at: { mem: ['noel', 5] } },
  { re: /祖先/, at: { mem: ['bobby', 1] } },
  { re: /一族|錯了/, at: { mem: ['bobby', 2] } },
  { re: /構造圖|都能裝/, at: { mem: ['bobby', 3] } },
  { re: /道歉|修好/, at: { mem: ['bobby', 4] } },
  { re: /閥/, at: { mem: ['bobby', 5] } },
  { re: /櫃檯|估價的本事|瓶罐/, at: { mem: ['liz', 1] } },
  { re: /債|借據|賒/, at: { mem: ['liz', 2] } },
  { re: /帽子|星燈|光柱/, at: { mem: ['liz', 3] } },
  { re: /麵包.{0,4}焦|焦.{0,4}麵包|寶庫的門/, at: { mem: ['liz', 4] } },
  { re: /爸爸|父親|歐里克|臉想起來/, at: { mem: ['liz', 5] } },
  { re: /起誓|立誓|誓言/, at: { mem: ['scarlet', 1] } },
  { re: /國家|王國/, at: { mem: ['scarlet', 2] } },
  { re: /轉身|逃|號角/, at: { mem: ['scarlet', 3] } },
  { re: /王城|公主|殿下/, at: { mem: ['scarlet', 4] } },
  { re: /朋友|活下去|撤退|密道/, at: { mem: ['scarlet', 5] } },
];

/** The acts in the order they are told; seeing a later one means the earlier ones were seen. */
const ACTS = ['act2', 'act3', 'act4', 'finale'] as const;
const STAGE_OF: Record<(typeof ACTS)[number], Stage> = { act2: 'act2', act3: 'act3', act4: 'act4', finale: 'after' };

/** The pieces of `c`'s chain a gate holds for sure: by `seen` memories, `pieces` or `full` (counted as every piece). */
function piecesHeld(g: StoryGate | undefined, c: CharacterId): number {
  if (!g) return 0;
  if (g.full === c) return 99;
  const seen = (g.seen ?? []).flatMap((id) => { const m = /^mem:([a-z]+):(\d+)$/.exec(id); return m && m[1] === c ? [Number(m[2])] : []; });
  return Math.max(0, g.pieces?.[c] ?? 0, ...seen);
}
/** Whether a gate holds `act` for sure: it names that act's scene or a later one, or a stage at or past it. */
function actHeld(g: StoryGate | undefined, act: (typeof ACTS)[number]): boolean {
  if (!g) return false;
  const k = ACTS.indexOf(act);
  if ((g.seen ?? []).some((id) => ACTS.indexOf(id as (typeof ACTS)[number]) >= k)) return true;
  return !!g.stage && STAGES.indexOf(g.stage) >= STAGES.indexOf(STAGE_OF[act]);
}
const opens = (g: StoryGate | undefined, at: Reveal): boolean =>
  at === 'never' ? false : 'mem' in at ? piecesHeld(g, at.mem[0]) >= at.mem[1] : actHeld(g, at.scene);

const COMPANIONS = CHARACTER_IDS.filter((c) => c !== 'hero');
/**
 * What the script calls each companion besides her name (PR C review S2): the nicknames the ledger records (I-146 莉茲's
 * 「騎士大姊」「小魔女」, I-160 莎菲拉's 「小嘉」「小鶴」 and 千鶴's 「舞姬大人」 for her, the style bible §3 莎菲拉's 「小希」
 * 「凜凜」, data/story/voiceGates.ts VOCATIVES), and her title (data/characters.ts). The 「〇〇姊」「〇〇姑娘」「〇〇小姐」
 * forms hold her name, so the name catches them. When the ledger names a new one, it goes here.
 */
const ALIASES: Partial<Record<CharacterId, string[]>> = {
  chizuru: ['小鶴'], safira: ['舞姬大人'], sylvie: ['小希'], scarlet: ['小嘉', '騎士大姊'], noel: ['小魔女'], rin: ['凜凜'],
};
const namesOf = (c: CharacterId): string[] => [CHARACTERS[c].name, ...(ALIASES[c] ?? []), CHARACTERS[c].title];
/** Plan ruling 20: handbook text, every line at most sixty characters. */
const MAX_LEN = 60;

/** Everything wrong with one entry (an empty list when it passes): the plan's W4 gates, line by line. */
function problemsOf(id: string, e: BestiaryText): string[] {
  const out: string[] = [];
  const texts: { where: string; text: string; after?: StoryGate }[] = [
    { where: 'trait', text: e.trait },
    ...e.lines.map((l, i) => ({ where: `line ${i + 1}`, text: l.text, after: l.after })),
  ];
  if (!e.trait) out.push(`${id}: no trait`);
  if (!e.lines.length) out.push(`${id}: no line`);
  for (const { where, text, after } of texts) {
    const at = `${id} ${where}`;
    if (/…|‥|\.\.\./.test(text)) out.push(`${at}: an ellipsis (none in the handbook)`);
    if (/[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/.test(text)) out.push(`${at}: a Latin letter or a digit`);
    if (/[,.!?;:()"'<>[\]]/.test(text)) out.push(`${at}: half-width punctuation`);
    if ([...text].length > MAX_LEN) out.push(`${at}: over ${MAX_LEN} characters`);
    if (/精英/.test(text)) out.push(`${at}: 精英 (write 菁英)`);
    for (const w of WORDS) if (w.re.test(text) && !opens(after, w.at)) out.push(`${at}: ${w.re.source} before its reveal`);
    // A companion's name is hers to tell: only on a line behind one of her own memories (the remnant's line). Her
    // nicknames and her title count as her name (PR C review S2); a line is told once per companion, by the first form found.
    for (const c of COMPANIONS) {
      const form = namesOf(c).find((n) => text.includes(n));
      if (form && piecesHeld(after, c) < 1) out.push(`${at}: ${form} without her memory`);
    }
  }
  return out;
}

/** Roster plan L1 (spec §13.5 R0 and R1): the eighteen of the first live wave. */
const WAVE_1 = [
  'paper-moth', 'lamp-wight', 'root-hound', 'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter',
  'mist-twin', 'moon-crow', 'bell-watcher', 'sleepwalker', 'hoarder', 'fog-warden', 'silent-bell', 'hollow-champion',
  'false-moon', 'bell-warden',
];
/** The neutral lore PR A gave the first wave's five own uniques (data/gear.roster.ts), for L1a to write over. */
const L1_NEUTRAL_LORE: Record<string, string> = {
  'moonless-mirror': '鏡面映著一輪不在天上的月，照久了，連影子都變得溫柔。',
  'unrung-clapper': '從沒敲響過的鐘舌，掛在胸前卻意外地讓人安心。',
  'fog-halberd': '戟刃揮過的地方，霧會自己讓出一條路。',
  'silent-chime': '輕輕一晃也沒有聲音，心卻跟著靜了下來。',
  'borrowed-blade': '劍柄上留著好幾種握法的痕跡，借來的招式也能變成自己的。',
};

/** Roster plan L2 (spec §13.5 R2): the twenty-seven of the second live wave, the lantern-mother with them (L2c). */
const WAVE_2 = [
  'old-city-sentinel', 'requiem-choir', 'lantern-larva', 'epitaph-golem', 'ancestor-automaton', 'ash-archivist', 'wick-shade',
  'keeper-echo', 'ember-maw', 'sorrow-crystal', 'deep-tendril', 'music-box', 'paper-cranes', 'lost-shadow', 'returning-light',
  'gilded-hoarder', 'old-city-archon', 'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale', 'stopped-clock',
  'first-lantern', 'archon-hand', 'toppled-automaton', 'requiem-conductor', 'lantern-brood',
];
/** The neutral lore PR A gave the second wave's ten own uniques (data/gear.roster.ts), for L2a to write over. */
const L2_NEUTRAL_LORE: Record<string, string> = {
  'ancestor-gauntlet': '關節裡的齒輪還在轉，彷彿記得上一個主人的握力。',
  'requiem-staff': '杖頭一揮，四周的雜音便安靜下來，只剩一段慢板。',
  'brood-lantern': '殼裡透出暖光，提在手上像抱著一顆小小的心跳。',
  'archon-crown': '冠上的金漆斑駁，戴上它的人說話都慢了半拍。',
  'glutton-gauntlet': '吃得多、打得重，手甲本人似乎很滿意這個安排。',
  'cradled-light': '一小團光蜷在鍊墜裡，像在等誰把它抱回家。',
  'festival-mask': '面具的笑臉一直沒變，戴上它的人也跟著想笑。',
  'whale-song-ring': '貼近耳朵，能聽見很遠很遠的低鳴。',
  'still-hand-boots': '穿上它的人，總覺得時間替自己多停了一秒。',
  'first-lantern-staff': '杖頂的火苗很小，卻從來沒有熄過。',
};

/** Roster plan L3 (spec §13.5 R3): the twenty-eight of the third live wave, the fire, frost and storm lands. */
const WAVE_3 = [
  'cinder-imp', 'forge-hound', 'ash-mourner', 'mirage-dancer', 'sand-scorpion', 'frost-doll', 'glacier-tortoise', 'snow-caller',
  'ice-komainu', 'frozen-pilgrim', 'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome', 'ember-tyrant',
  'sandstorm-maw', 'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc', 'storm-conductor', 'starfire-colossus',
  'mirage-lead', 'ice-shrine', 'burning-page', 'rime-pillar',
];
/** The neutral lore PR A gave the third wave's twelve own uniques (data/gear.roster.ts), for L3a to write over. */
const L3_NEUTRAL_LORE: Record<string, string> = {
  'last-dance-veil': '紗一揚起，腳步就自己踩上了拍子。',
  'ninety-nine-steps': '鞋底刻著石階的紋路，每一步都走得很穩。',
  'starbound-tome': '書頁被星光封住，翻不開，卻總在需要的時候發熱。',
  'burning-crown-ring': '戒圈燙手，脾氣也不太好，但打起架來很可靠。',
  'sand-veil-boots': '靴底永遠倒得出一點沙，走過的路都被風抹平。',
  'troupe-drum': '鼓面一響，連最怕跳舞的人都會踏兩步。',
  'everwinter-veil': '披上它便不怕冷，只是說話時會冒出白氣。',
  'snowmute-ring': '指環裡下著一場不會停的小雪。',
  'sealing-spear': '槍尖纏著舊舊的紙籤，一刺出去，寒氣就跟著收攏。',
  'roc-feather-boots': '腳步輕得像羽毛，落地時卻帶著一聲雷。',
  'conductor-ring': '舉起手的時候，雷聲會乖乖等你數到三。',
  'starfire-tiara': '頭冠上的星火一閃一閃，想事情的時候閃得特別快。',
};

/** Roster plan L4 (spec §13.5 R4): the twenty-seven of the fourth live wave, the mire, the shade and the iron lands. */
const WAVE_4 = [
  'bog-mother', 'rot-lily', 'leech-knight', 'ashen-treant', 'spore-moth', 'mirror-thief', 'veil-stalker', 'hush-acolyte', 'vault-mimic',
  'debt-collector', 'rivet-golem', 'siege-crab', 'herald-engine', 'fallen-knight', 'banner-bearer', 'mire-hydra', 'grey-blight',
  'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade', 'fortress-colossus', 'siege-titan', 'last-commander', 'grey-elder',
  'locked-vault', 'gate-breaker',
];
/** The neutral lore PR A gave the fourth wave's twelve own uniques (data/gear.roster.ts), for L4a to write over. */
const L4_NEUTRAL_LORE: Record<string, string> = {
  'arrowmark-bow': '弓身滿是小小的刻痕，每一道都指著同一個方向。',
  'hungry-purse': '錢袋永遠覺得自己不夠飽，所以總能多撿一點。',
  'gatewarden-shield': '盾面坑坑疤疤，卻一次也沒讓身後的人受傷。',
  'hydra-fang': '刃上有兩道細溝，總是一次咬兩口。',
  'greenward-cloak': '斗篷沾著青草的味道，雨水一碰就滑走了。',
  'bog-ring': '指環沉甸甸的，戴久了反而覺得踏實。',
  'faceless-mask': '面具上沒有表情，所以戴上它的人想要什麼表情都行。',
  'gilded-mail': '金光閃閃，敵人第一眼都會先看錢，再看人。',
  'parade-boots': '走在夜裡，腳步聲會混進別人的腳步聲裡。',
  'colossus-gauntlet': '螺栓一顆都沒少，握拳時會發出很可靠的喀聲。',
  'wallclimber-boots': '鞋尖的鐵釘專咬石縫，再高的牆也爬得上去。',
  'red-horn': '號角的紅漆已經褪了，吹起來的聲音卻還很響亮。',
};

const entries = (): [string, BestiaryText][] => Object.entries(BESTIARY).filter((x): x is [string, BestiaryText] => !!x[1]);

describe('the bestiary text and its gates (roster plan Task C5)', () => {
  it('every live foe has an entry', () => {
    // Nothing is live yet; from L1 on each go-live commit writes its foes' entries with it.
    const missing = [...ROSTER_LIVE].filter((id) => !BESTIARY[id]);
    expect(missing).toEqual([]);
    // The check itself: a foe made live without an entry is caught.
    withRosterLive(['paper-moth'], () => expect([...ROSTER_LIVE].filter((id) => !BESTIARY[id])).toEqual(BESTIARY['paper-moth'] ? [] : ['paper-moth']));
  });

  it('the first live wave is written, its story lines behind their gates (L1a)', () => {
    // Roster plan Task L1a: E1's eighteen, each with an entry that passes the gates below.
    const missing = WAVE_1.filter((id) => !BESTIARY[id]);
    expect(missing).toEqual([]);
    for (const id of WAVE_1) expect(problemsOf(id, BESTIARY[id]!), id).toEqual([]);
    const gates = (id: string) => BESTIARY[id]!.lines.map((l) => l.after);
    // Ruling 20: the false moon's first line tells only its turning; Selene's 2nd piece the bright ending, her 3rd that
    // there is more than one. 新月 is never written (her 5th piece's word, I-201).
    expect(gates('false-moon')).toEqual([undefined, { seen: ['mem:selene:2'] }, { seen: ['mem:selene:3'] }]);
    expect(BESTIARY['false-moon']!.lines.some((l) => /新月/.test(l.text))).toBe(false);
    // Ruling 20, I-222: the bell tower's two remnants may say 靜鐘會 from act 3; never Rin, the bellkeeper, the errand or
    // the one who walked out of the deep, and the warden's door no stone and no exit (I-12 is Rin's picture).
    for (const id of ['bell-watcher', 'bell-warden']) {
      expect(gates(id), id).toEqual([undefined, { seen: ['act3'] }]);
      const all = [BESTIARY[id]!.trait, ...BESTIARY[id]!.lines.map((l) => l.text)].join('');
      expect(all, id).not.toMatch(/凜|鐘守|師父|從深處走出來|殺|石門|出口/);
    }
    // The hollow ones need no gate (空殼 is the town's common word, spec §4.2): two lines each, open once felled.
    for (const id of ['hollow-hunter', 'hollow-champion']) expect(gates(id), id).toEqual([undefined, undefined]);
    // Every other one of the wave is one line, no story.
    for (const id of WAVE_1.filter((x) => !['false-moon', 'bell-watcher', 'bell-warden', 'hollow-hunter', 'hollow-champion'].includes(x))) {
      expect(gates(id), id).toEqual([undefined]);
    }
  });

  it("the first wave's own uniques carry lore that keeps every gate (L1a)", () => {
    // Shown when the piece is had, with no gate at all: as a trait is (no secret word, no companion's name).
    for (const id of ['moonless-mirror', 'unrung-clapper', 'fog-halberd', 'silent-chime', 'borrowed-blade']) {
      const lore = SPECIALS[id].lore ?? '';
      expect(problemsOf(id, { trait: lore, lines: [{ text: lore }] }), id).toEqual([]);
      expect(lore, id).not.toBe(L1_NEUTRAL_LORE[id]);   // rewritten by the W steps, not the placeholder PR A left
    }
  });

  it('the second live wave is written, its story lines behind their gates (L2a)', () => {
    // Roster plan Task L2a: E2's twenty-seven, each with an entry that passes the gates below.
    const missing = WAVE_2.filter((id) => !BESTIARY[id]);
    expect(missing).toEqual([]);
    for (const id of WAVE_2) expect(problemsOf(id, BESTIARY[id]!), id).toEqual([]);
    const gates = (id: string) => BESTIARY[id]!.lines.map((l) => l.after);
    const all = (id: string) => [BESTIARY[id]!.trait, ...BESTIARY[id]!.lines.map((l) => l.text)].join('');
    // Ruling 20, spec §4.2: the nameless lantern-bearer walks down with a lamp; act 4 may tell the legend of the one who made
    // himself a wick; the hero's 9th piece that every shadow walks the same. Never the sword, never the lamp key.
    expect(gates('keeper-echo')).toEqual([undefined, { seen: ['act4'] }, { seen: ['mem:hero:9'] }]);
    expect(all('keeper-echo')).not.toMatch(/劍|燈鑰|每一次，都是一個人做的/);
    // Spec §4.2: the old city's four may say 艾斯特拉 from act 4.
    for (const id of ['old-city-sentinel', 'requiem-choir', 'requiem-conductor', 'old-city-archon']) expect(gates(id), id).toEqual([undefined, { seen: ['act4'] }]);
    // Spec §4.2: the two machines are her family's work from Bobby's 4th piece; never the lamp's workings or its valve.
    for (const id of ['ancestor-automaton', 'toppled-automaton']) {
      expect(gates(id), id).toEqual([undefined, { seen: ['mem:bobby:4'] }]);
      expect(all(id), id).not.toMatch(/閥|燈芯機構|構造圖/);
    }
    // Ruling 20, I-223: the lantern-eater's brood says whose young they are only after the finale; the mother is met there alone.
    for (const id of ['lantern-larva', 'deep-tendril', 'lantern-brood', 'gorged-beast']) expect(gates(id), id).toEqual([undefined, { seen: ['finale'] }]);
    expect(gates('lantern-mother')).toEqual([{ seen: ['finale'] }]);
    // Every other one of the wave is one line, no story.
    const story = ['keeper-echo', 'old-city-sentinel', 'requiem-choir', 'requiem-conductor', 'old-city-archon', 'ancestor-automaton',
      'toppled-automaton', 'lantern-larva', 'deep-tendril', 'lantern-brood', 'gorged-beast', 'lantern-mother'];
    for (const id of WAVE_2.filter((x) => !story.includes(x))) expect(gates(id), id).toEqual([undefined]);
  });

  it("the second wave's own uniques carry lore that keeps every gate (L2a)", () => {
    for (const id of Object.keys(L2_NEUTRAL_LORE)) {
      const lore = SPECIALS[id].lore ?? '';
      expect(problemsOf(id, { trait: lore, lines: [{ text: lore }] }), id).toEqual([]);
      expect(lore, id).not.toBe(L2_NEUTRAL_LORE[id]);   // rewritten by the W steps, not the placeholder PR A left
    }
  });

  it('the third live wave is written, its story lines behind their gates (L3a)', () => {
    // Roster plan Task L3a: E3's twenty-eight, each with an entry that passes the gates below.
    const missing = WAVE_3.filter((id) => !BESTIARY[id]);
    expect(missing).toEqual([]);
    for (const id of WAVE_3) expect(problemsOf(id, BESTIARY[id]!), id).toEqual([]);
    const gates = (id: string) => BESTIARY[id]!.lines.map((l) => l.after);
    const all = (id: string) => [BESTIARY[id]!.trait, ...BESTIARY[id]!.lines.map((l) => l.text)].join('');
    // Spec §4.2: the mirage's dancers say Safira's troupe from her 1st piece; the city that it was false and burned, from her 5th,
    // as the sand's two say the fire was a desert. The leader's words never (團長 waits for her 4th piece, its words for her 5th).
    for (const id of ['mirage-dancer', 'mirage-lead']) expect(gates(id), id).toEqual([undefined, { seen: ['mem:safira:1'] }]);
    for (const id of ['mirage-city', 'sand-scorpion', 'sandstorm-maw']) expect(gates(id), id).toEqual([undefined, { seen: ['mem:safira:5'] }]);
    for (const id of ['mirage-dancer', 'mirage-lead', 'mirage-city', 'sand-scorpion', 'sandstorm-maw']) expect(all(id), id).not.toMatch(/團長|繼續跳/);
    // Spec §4.2: the shrine is gone from Chizuru's 4th piece, the rift is what she came to seal from her 2nd; the komainu stand
    // at her mountain shrine (1st) and the pilgrims grow fewer (4th). Never the bell (her 5th piece, I-62).
    expect(gates('ice-shrine')).toEqual([undefined, { seen: ['mem:chizuru:4'] }]);
    expect(gates('rift-maw')).toEqual([undefined, { seen: ['mem:chizuru:2'] }]);
    expect(gates('ice-komainu')).toEqual([undefined, { seen: ['mem:chizuru:1'] }]);
    expect(gates('frozen-pilgrim')).toEqual([undefined, { seen: ['mem:chizuru:4'] }]);
    for (const id of ['ice-shrine', 'rift-maw', 'ice-komainu', 'frozen-pilgrim']) expect(all(id), id).not.toMatch(/鈴/);
    // Spec §4.2: the burning page burns memory from Noel's 3rd piece, her teacher kept her from it from her 4th; the ember, the
    // book and the colossus each behind the piece they echo. Never the merchant (her 5th piece).
    expect(gates('burning-page')).toEqual([undefined, { seen: ['mem:noel:3'] }, { seen: ['mem:noel:4'] }]);
    expect(gates('stolen-tome')).toEqual([undefined, { seen: ['mem:noel:1'] }]);
    for (const id of ['star-ember', 'starfire-colossus']) expect(gates(id), id).toEqual([undefined, { seen: ['mem:noel:3'] }]);
    for (const id of ['burning-page', 'stolen-tome', 'star-ember', 'starfire-colossus']) expect(all(id), id).not.toMatch(/商人/);
    // Every other one of the wave is one line, no story.
    const story = ['mirage-dancer', 'mirage-lead', 'mirage-city', 'sand-scorpion', 'sandstorm-maw', 'ice-shrine', 'rift-maw', 'ice-komainu',
      'frozen-pilgrim', 'burning-page', 'stolen-tome', 'star-ember', 'starfire-colossus'];
    for (const id of WAVE_3.filter((x) => !story.includes(x))) expect(gates(id), id).toEqual([undefined]);
  });

  it("the third wave's own uniques carry lore that keeps every gate (L3a)", () => {
    for (const id of Object.keys(L3_NEUTRAL_LORE)) {
      const lore = SPECIALS[id].lore ?? '';
      expect(problemsOf(id, { trait: lore, lines: [{ text: lore }] }), id).toEqual([]);
      expect(lore, id).not.toBe(L3_NEUTRAL_LORE[id]);   // rewritten by the W steps, not the placeholder PR A left
    }
  });

  it('the fourth live wave is written, its story lines behind their gates (L4a)', () => {
    // Roster plan Task L4a: E4's twenty-seven, each with an entry that passes the gates below.
    const missing = WAVE_4.filter((id) => !BESTIARY[id]);
    expect(missing).toEqual([]);
    for (const id of WAVE_4) expect(problemsOf(id, BESTIARY[id]!), id).toEqual([]);
    const gates = (id: string) => BESTIARY[id]!.lines.map((l) => l.after);
    const all = (id: string) => [BESTIARY[id]!.trait, ...BESTIARY[id]!.lines.map((l) => l.text)].join('');
    // Spec §4.2: the mire is Sylvie's wood from her 1st piece (the treant), the fog could not be shot from her 2nd (the blight),
    // the last seed from her 5th (the elder).
    expect(gates('ashen-treant')).toEqual([undefined, { seen: ['mem:sylvie:1'] }]);
    expect(gates('grey-blight')).toEqual([undefined, { seen: ['mem:sylvie:2'] }]);
    expect(gates('grey-elder')).toEqual([undefined, { seen: ['mem:sylvie:5'] }]);
    // Spec §4.2 with ruling 20 (§0 item 11): the knocking shadow says the debt from Liz's 2nd piece, the locked vault that she
    // came to pay it from her 3rd, the hungry vault the vault's door from her 4th. Never the shop, the town or her father's name.
    expect(gates('debt-collector')).toEqual([undefined, { seen: ['mem:liz:2'] }]);
    expect(gates('locked-vault')).toEqual([undefined, { seen: ['mem:liz:3'] }]);
    expect(gates('vault-mimic')).toEqual([undefined, { seen: ['mem:liz:4'] }]);
    for (const id of ['debt-collector', 'locked-vault', 'vault-mimic']) expect(all(id), id).not.toMatch(/道具店|露米亞|歐里克/);
    // Spec §4.2, ruling 20, I-222: the hushed acolyte may say 靜鐘會 from act 3; never Rin, the bellkeeper, the errand or the one
    // who walked out of the deep (as the bell tower's two).
    expect(gates('hush-acolyte')).toEqual([undefined, { seen: ['act3'] }]);
    expect(all('hush-acolyte')).not.toMatch(/凜|鐘守|師父|從深處走出來|殺|石門|出口/);
    // Spec §4.2: the fortress was Scarlet's country from her 2nd piece (the knight, the banner and the beast that climbed its
    // walls), the rammed gate from her 3rd; only the last commander, behind her 5th, may say the horns were the withdrawal's.
    // Ruling 20, I-211: the princess's fate is never written.
    for (const id of ['fallen-knight', 'banner-bearer', 'siege-titan']) expect(gates(id), id).toEqual([undefined, { seen: ['mem:scarlet:2'] }]);
    expect(gates('gate-breaker')).toEqual([undefined, { seen: ['mem:scarlet:3'] }]);
    expect(gates('last-commander')).toEqual([undefined, { seen: ['mem:scarlet:5'] }]);
    for (const id of ['fallen-knight', 'banner-bearer', 'siege-titan', 'gate-breaker']) expect(all(id), id).not.toMatch(/撤退|密道/);
    for (const id of ['fallen-knight', 'banner-bearer', 'siege-titan', 'gate-breaker', 'last-commander']) expect(all(id), id).not.toMatch(/公主|殿下/);
    // Every other one of the wave is one line, no story.
    const story = ['ashen-treant', 'grey-blight', 'grey-elder', 'debt-collector', 'locked-vault', 'vault-mimic', 'hush-acolyte', 'fallen-knight',
      'banner-bearer', 'siege-titan', 'gate-breaker', 'last-commander'];
    for (const id of WAVE_4.filter((x) => !story.includes(x))) expect(gates(id), id).toEqual([undefined]);
  });

  it("the fourth wave's own uniques carry lore that keeps every gate (L4a)", () => {
    for (const id of Object.keys(L4_NEUTRAL_LORE)) {
      const lore = SPECIALS[id].lore ?? '';
      expect(problemsOf(id, { trait: lore, lines: [{ text: lore }] }), id).toEqual([]);
      expect(lore, id).not.toBe(L4_NEUTRAL_LORE[id]);   // rewritten by the W steps, not the placeholder PR A left
    }
  });

  it('every roster foe is written once all four waves are (L4a)', () => {
    // Roster plan Task L4c Step 1: the whole roster has its words; with the four waves no roster id is left without an entry.
    const roster = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
    expect(roster).toHaveLength(100);
    expect(roster.filter((id) => !BESTIARY[id])).toEqual([]);
  });

  it('no entry for a foe that does not exist', () => {
    for (const [id] of entries()) {
      expect(ENEMIES[id], id).toBeDefined();
      expect(LEGACY_ENEMY_IDS, id).not.toContain(id);
    }
  });

  it('every gated word waits for its reveal', () => {
    expect(entries().flatMap(([id, e]) => problemsOf(id, e))).toEqual([]);
    // The gates themselves, on lines made to break them.
    const one = (text: string, after?: StoryGate) => problemsOf('x', { trait: '先打旗手。', lines: [{ text, after }] });
    expect(one('靜鐘會的巡守。')).toEqual(['x line 1: 靜鐘會 before its reveal']);
    expect(one('靜鐘會的巡守。', { seen: ['act3'] })).toEqual([]);
    expect(one('靜鐘會的巡守。', { seen: ['act4'] })).toEqual([]);   // a later act holds the earlier
    expect(one('靜鐘會的巡守。', { stage: 'act3' })).toEqual([]);
    expect(one('靜鐘會的巡守。', { seen: ['act2'] })).toHaveLength(1);
    expect(one('守燈人走過。', { seen: ['act3'] })).toHaveLength(1);
    expect(one('那裡有燈喰之母。', { stage: 'after' })).toEqual([]);
    expect(one('那裡有燈喰之母。', { seen: ['act4'] })).toHaveLength(1);
    expect(one('滿月照出明亮的結局。', { seen: ['mem:selene:2'] })).toEqual([]);
    expect(one('滿月照出明亮的結局。', { seen: ['mem:selene:1'] })).toHaveLength(1);
    expect(one('債要還的。', { pieces: { liz: 2 } })).toEqual([]);
    expect(one('債要還的。', { full: 'liz' })).toEqual([]);
    expect(one('債要還的。', { pieces: { liz: 1 } })).toHaveLength(1);
    // Some words are never said, whatever the gate.
    expect(one('道具店的門。', { full: 'liz' })).toHaveLength(1);
    expect(one('鐘守的影子。', { stage: 'after' })).toHaveLength(1);
  });

  it("a remnant's last line stays a memory", () => {
    const one = (text: string, after?: StoryGate) => problemsOf('x', { trait: '先打旗手。', lines: [{ text, after }] });
    expect(one('莎菲拉記得的那個人不在這裡。')).toEqual(['x line 1: 莎菲拉 without her memory']);
    expect(one('莎菲拉記得的那個人不在這裡。', { seen: ['mem:safira:1'] })).toEqual([]);
    expect(one('莎菲拉記得的那個人不在這裡。', { seen: ['mem:selene:3'] })).toHaveLength(1);
    // A trait has no gate at all, so no companion's name.
    expect(problemsOf('x', { trait: '凜認得牠。', lines: [{ text: '一句。' }] })).toEqual(['x trait: 凜 without her memory']);
  });

  it("handbook text spends no 「……」, no Latin letters or digits, no line over sixty", () => {
    const one = (text: string) => problemsOf('x', { trait: '先打旗手。', lines: [{ text }] });
    expect(one('牠在等……')).toEqual(['x line 1: an ellipsis (none in the handbook)']);
    expect(one('牠有三顆頭。')).toEqual([]);
    expect(one('牠有3顆頭。')).toEqual(['x line 1: a Latin letter or a digit']);
    expect(one('牠叫HP怪。')).toEqual(['x line 1: a Latin letter or a digit']);
    expect(one('牠會飛, 也會叫。')).toEqual(['x line 1: half-width punctuation']);
    expect(one('精英的那一隻。')).toEqual(['x line 1: 精英 (write 菁英)']);
    expect(one('長'.repeat(60))).toEqual([]);
    expect(one('長'.repeat(61))).toEqual([`x line 1: over ${MAX_LEN} characters`]);
    expect(problemsOf('x', { trait: '', lines: [] })).toEqual(['x: no trait', 'x: no line']);
  });

  it('the read-aloud script (BESTIARY_DUMP, the W6 step)', () => {
    const gate = (g?: StoryGate) => (g ? `（閘門：${JSON.stringify(g)}）` : '');
    const md = ['# 圖鑑朗讀稿', '', ...entries().flatMap(([id, e]) => [
      `## ${ENEMIES[id].name}（${id}）`, '', `- 特性：${e.trait}`, ...e.lines.map((l, i) => `- 第 ${i + 1} 句：${l.text}${gate(l.after)}`), '',
    ])].join('\n');
    expect(md.startsWith('# 圖鑑朗讀稿')).toBe(true);
    const out = process.env.BESTIARY_DUMP;
    if (out) writeFileSync(out, `${md}\n`, 'utf8');
  });
});

describe("a companion's other names are hers too (PR C review S2)", () => {
  const one = (text: string, after?: StoryGate) => problemsOf('x', { trait: '先打旗手。', lines: [{ text, after }] });
  it('her nicknames and her title wait for her memory as her name does', () => {
    // The nicknames the script gives them (ledger I-146, I-160; style bible §3, Safira's 口癖) and each one's title.
    expect(one('小鶴記得的那個人不在這裡。')).toEqual(['x line 1: 小鶴 without her memory']);
    expect(one('小鶴記得的那個人不在這裡。', { seen: ['mem:chizuru:1'] })).toEqual([]);
    expect(one('騎士大姊的影子。')).toEqual(['x line 1: 騎士大姊 without her memory']);
    expect(one('小嘉的影子。')).toEqual(['x line 1: 小嘉 without her memory']);
    expect(one('小魔女的筆記。')).toEqual(['x line 1: 小魔女 without her memory']);
    expect(one('小希的箭。')).toEqual(['x line 1: 小希 without her memory']);
    expect(one('舞姬大人的舞台。')).toEqual(['x line 1: 舞姬大人 without her memory']);
    expect(one('沙漠舞劍士的步子。')).toEqual(['x line 1: 沙漠舞劍士 without her memory']);
    expect(one('沙漠舞劍士的步子。', { pieces: { safira: 1 } })).toEqual([]);
    // 凜凜 holds 凜: one problem, under her name.
    expect(one('凜凜不在。')).toEqual(['x line 1: 凜 without her memory']);
  });
});
