import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIONS, GIFT_TASTE, type Companion } from './story/bond';
import { BOND_SCENES, GIFT_LINES, RIN_OATH, ROMANCE_LINES, type GiftPools } from './bond.zh-TW';
const RIN_OATH_GIFT_LINES = RIN_OATH.value;
import { BONDS_WRITTEN, ENDINGS_WRITTEN, ROMANCES_WRITTEN, TOGETHER_WRITTEN, bondScene, sceneKind, type SceneId } from './story/scenes';
import { CHOICE_MAX_CHARS, MAX_LINE_CHARS, STORY, flatLines, isChoice, type ChoiceLine, type SceneLine, type ScriptLine } from './story.zh-TW';
import { CHIZURU_ARCHAIC, CHIZURU_NEVER, SYLVIE_WORLD, VOICE, dots, opensOnDots, pinBeat, telegraphBreaks } from './story/voiceGates';
import { CHARACTER_IDS } from './characters';

/**
 * Bond plan Task 6 (spec §0 D14, §6.4): a companion's gift reactions are registered whole or not at all. What a written
 * table misses; empty when whole: loved and liked two lines or more, neutral one or more, a line for each material she
 * declines and for each one her healing turns, and no other keys.
 */
const problems = (c: Companion, p: GiftPools): string[] => {
  const t = GIFT_TASTE[c];
  const out: string[] = [];
  if (p.loved.length < 2) out.push(`${c}: loved ${p.loved.length} < 2`);
  if (p.liked.length < 2) out.push(`${c}: liked ${p.liked.length} < 2`);
  if (p.neutral.length < 1) out.push(`${c}: no neutral line`);
  const same = (got: string[], want: string[]) => [...got].sort().join() === [...want].sort().join();
  if (!same(Object.keys(p.declined), t.declined)) out.push(`${c}: declined lines ${Object.keys(p.declined)} not ${t.declined}`);
  if (!same(Object.keys(p.healed), Object.keys(t.healed))) out.push(`${c}: healed lines ${Object.keys(p.healed)} not ${Object.keys(t.healed)}`);
  for (const line of [...p.loved, ...p.liked, ...p.neutral, ...Object.values(p.declined), ...Object.values(p.healed)]) if (!line) out.push(`${c}: an empty line`);
  return out;
};
/** Every written table's problems; Rin needs both of hers (bond plan ruling 6). */
const allProblems = (lines: Partial<Record<Companion, GiftPools>>, rinOath: GiftPools | null): string[] => [
  ...COMPANIONS.flatMap((c) => (lines[c] ? problems(c, lines[c]!) : [])),
  ...(lines.rin && !rinOath ? ['rin: written before her choice only'] : []),
  ...(!lines.rin && rinOath ? ['rin: written after her choice only'] : []),
  ...(rinOath ? problems('rin', rinOath) : []),
];
const whole = (c: Companion): GiftPools => ({
  loved: ['一', '二'], liked: ['三', '四'], neutral: ['五'],
  declined: Object.fromEntries(GIFT_TASTE[c].declined.map((m) => [m, '六'])),
  healed: Object.fromEntries(Object.keys(GIFT_TASTE[c].healed).map((m) => [m, '七'])),
});

describe('bond text: gift reactions', () => {
  it('gift pools are whole once written', () => {
    expect(allProblems(GIFT_LINES, RIN_OATH_GIFT_LINES)).toEqual([]);
    // The check bites: whole tables pass, and each kind of hole is caught.
    expect(allProblems({ selene: whole('selene'), rin: whole('rin') }, whole('rin'))).toEqual([]);
    expect(allProblems({ selene: { ...whole('selene'), loved: ['一'] } }, null)).toEqual(['selene: loved 1 < 2']);
    expect(allProblems({ noel: { ...whole('noel'), neutral: [] } }, null)).toEqual(['noel: no neutral line']);
    expect(allProblems({ liz: { ...whole('liz'), declined: {} } }, null)).toHaveLength(1);
    expect(allProblems({ sylvie: { ...whole('sylvie'), healed: {} } }, null)).toHaveLength(1);
    expect(allProblems({ chizuru: { ...whole('chizuru'), healed: { 'ice-crystal': '八' } } }, null)).toHaveLength(1);   // she never heals
    expect(allProblems({ rin: whole('rin') }, null)).toEqual(['rin: written before her choice only']);
    expect(allProblems({}, whole('rin'))).toEqual(['rin: written after her choice only']);
  });
});

// ---- bond plan Task 8: the gates on the bond's copy. Each takes the copy as an argument (the real tables by default) and
// says what breaks, one line a break, so the test can prove on an injected table that it bites.

/** All of the bond's copy and its registries (spec §0 D14), as one argument. */
interface BondCopy {
  scenes: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>>;
  gifts: Partial<Record<Companion, GiftPools>>;
  rinOath: GiftPools | null;
  romance: Partial<Record<Companion, string[]>>;
  bonds: readonly Companion[]; endings: readonly Companion[]; romances: readonly Companion[]; together: boolean;
}
const REAL = (): BondCopy => ({
  scenes: BOND_SCENES, gifts: GIFT_LINES, rinOath: RIN_OATH_GIFT_LINES, romance: ROMANCE_LINES,
  bonds: BONDS_WRITTEN, endings: ENDINGS_WRITTEN, romances: ROMANCES_WRITTEN, together: TOGETHER_WRITTEN.value,
});
const EMPTY: BondCopy = { scenes: {}, gifts: {}, rinOath: null, romance: {}, bonds: [], endings: [], romances: [], together: false };
const scenesOf = (copy: BondCopy) => Object.entries(copy.scenes) as [SceneId, { lines: SceneLine[]; summary: string }][];
/** Every gift line of the copy, with whose it is and where it sits. */
const giftLinesOf = (copy: BondCopy): { key: string; who: Companion; text: string }[] => {
  const of = (who: Companion, p: GiftPools, tag: string) => [
    ...(['loved', 'liked', 'neutral'] as const).flatMap((t) => p[t].map((text, i) => ({ key: `${tag}.${t}.${i}`, who, text }))),
    ...Object.entries(p.declined).map(([m, text]) => ({ key: `${tag}.declined.${m}`, who, text: text! })),
    ...Object.entries(p.healed).map(([m, text]) => ({ key: `${tag}.healed.${m}`, who, text: text! })),
  ];
  return [
    ...(Object.entries(copy.gifts) as [Companion, GiftPools][]).flatMap(([c, p]) => of(c, p, `gift:${c}`)),
    ...(copy.rinOath ? of('rin', copy.rinOath, 'gift:rin-oath') : []),
  ];
};
const romanceLinesOf = (copy: BondCopy): { key: string; who: Companion; text: string }[] =>
  (Object.entries(copy.romance) as [Companion, string[]][]).flatMap(([c, ls]) => ls.map((text, i) => ({ key: `romanceLines.${c}.${i}`, who: c, text })));
/** Every string of the copy: each scene's lines (choices opened), their place cards and summaries, gift and romance lines. */
const allText = (copy: BondCopy): { key: string; text: string }[] => [
  ...scenesOf(copy).flatMap(([id, s]) => [
    ...flatLines(s.lines).flatMap((l, i) => [{ key: `${id}.${i}`, text: l.text }, ...(l.place ? [{ key: `${id}.${i}.place`, text: l.place.text }] : [])]),
    { key: `${id}.summary`, text: s.summary },
  ]),
  ...giftLinesOf(copy), ...romanceLinesOf(copy),
];

const choiceCountBreaks = (copy: BondCopy): string[] => scenesOf(copy).flatMap(([id, s]) => {
  const n = s.lines.filter(isChoice).length;
  const want = sceneKind(id) === 'bond' ? 1 : 0;
  return n === want ? [] : [`${id}: ${n} choices, not ${want}`];
});
const choiceShapeBreaks = (copy: BondCopy): string[] => scenesOf(copy).flatMap(([id, s]) => s.lines.filter(isChoice).flatMap((c) => [
  ...(c.choices.length < 2 || c.choices.length > 3 ? [`${id}: ${c.choices.length} ways to say it`] : []),
  ...(new Set(c.choices.map((x) => x.tone)).size !== c.choices.length ? [`${id}: a tone twice`] : []),
  ...c.choices.flatMap((x) => [
    ...([...x.text].length > CHOICE_MAX_CHARS ? [`${id}: 「${x.text}」 is over ${CHOICE_MAX_CHARS}`] : []),
    ...(x.reply.length < 1 || x.reply.length > 2 ? [`${id}: a reply of ${x.reply.length} lines`] : []),
    ...(x.reply.some((l) => l.if) ? [`${id}: a reply line with a condition`] : []),
  ]),
]));
/** Season and moon words (spec §0 D11): none, the inn's name 月影旅館 aside; nor the lantern festival. */
const SEASON_MOON = /[春夏秋冬雪月]|星燈祭/;
const seasonBreaks = (copy: BondCopy): string[] =>
  allText(copy).filter((t) => SEASON_MOON.test(t.text.replaceAll('月影旅館', ''))).map((t) => `${t.key}: ${t.text}`);
const summaryBreaks = (copy: BondCopy): string[] => scenesOf(copy).flatMap(([id, s]) => [
  ...(s.summary.trim() === '' ? [`${id}: no summary`] : []),
  ...([...s.summary].length > MAX_LINE_CHARS ? [`${id}: a summary over ${MAX_LINE_CHARS}`] : []),
  ...(SEASON_MOON.test(s.summary.replaceAll('月影旅館', '')) ? [`${id}: a season or the moon in its summary`] : []),
]);
const registryBreaks = (copy: BondCopy): string[] => {
  const want = new Set<string>([
    ...copy.bonds.flatMap((c) => [1, 2, 3, 4].map((n) => bondScene(c, n))), ...copy.endings.map((c) => `ending:${c}`),
    ...copy.romances.map((c) => `romance:${c}`), ...(copy.together ? ['together'] : []),
  ]);
  const have = new Set<string>(Object.keys(copy.scenes));
  return [
    ...[...want].filter((id) => !have.has(id)).map((id) => `${id}: registered, not written`),
    ...[...have].filter((id) => !want.has(id)).map((id) => `${id}: written, not registered`),
    ...(Object.keys(copy.romance) as Companion[]).filter((c) => !copy.romances.includes(c)).map((c) => `romanceLines.${c}: her romance is not registered`),
  ];
};
const PRE_CHOICE = /洛恩|我們|[呢吧啦喔囉嘛耶]|！/;
const PRE_CHOICE_MOODS: ReadonlySet<string> = new Set(['normal', 'serious', 'guarded']);
const rinBeforeBreaks = (copy: BondCopy): string[] => [
  ...(['bond:rin:1', 'bond:rin:2'] as SceneId[]).flatMap((id) => flatLines(copy.scenes[id]?.lines ?? []).filter((l) => l.who === 'rin').flatMap((l) => [
    ...(PRE_CHOICE.test(l.text) ? [`${id}: 「${l.text}」`] : []),
    ...(l.mood && !PRE_CHOICE_MOODS.has(l.mood) ? [`${id}: ${l.mood}`] : []),
  ])),
  ...giftLinesOf({ ...copy, rinOath: null }).filter((t) => t.who === 'rin' && PRE_CHOICE.test(t.text)).map((t) => `${t.key}: 「${t.text}」`),
];
/** Style bible §3: Safira never says his name; Selene, Noel and Scarlet call him otherwise once whole, so a reading-blind gift line names him not. */
const callBreaks = (copy: BondCopy): string[] => [
  ...scenesOf(copy).flatMap(([id, s]) => flatLines(s.lines).filter((l) => l.who === 'safira' && l.text.includes('洛恩')).map((l) => `${id}: Safira says 「洛恩」`)),
  ...giftLinesOf(copy).filter((t) => (t.who === 'safira' || t.who === 'selene' || t.who === 'noel' || t.who === 'scarlet') && t.text.includes('洛恩')).map((t) => `${t.key}: 「洛恩」`),
];
const LOUD = new Set<string>(['noel', 'bobby', 'safira', 'liz']);
/** Bible §2.2–§2.4, the light rules, on the copy that is no scene (gift and romance lines). */
const lightCopyBreaks = (copy: BondCopy): string[] => [...giftLinesOf(copy), ...romanceLinesOf(copy)].flatMap((t) => [
  ...(dots(t.text) > 1 ? [`${t.key}: two 「……」`] : []),
  ...(opensOnDots(t.text) ? [`${t.key}: opens on 「……」`] : []),
  ...(t.text.includes('！') && !LOUD.has(t.who) ? [`${t.key}: 「！」 is not hers`] : []),
]);
const ROOM = /你房裡|你的房間|他的房間|她的房間|凜的房間|各自的房/;
const roomBreaks = (copy: BondCopy): string[] => allText(copy).filter((t) => ROOM.test(t.text)).map((t) => t.key);
const LOSS = /吃醋|嫉妒|離開隊伍|退出隊伍|不要我了|輸給/;
const romanceBreaks = (copy: BondCopy): string[] => scenesOf(copy).filter(([id]) => id.startsWith('romance:')).flatMap(([id, s]) => {
  const c = id.split(':')[1];
  const lines = flatLines(s.lines);
  const other = lines.some((l) => l.who !== c && l.who !== 'hero' && (COMPANIONS as string[]).includes(l.who) && l.if?.met === l.who);
  return [...(other ? [] : [`${id}: no other companion is there`]), ...lines.filter((l) => LOSS.test(l.text)).map((l) => `${id}: 「${l.text}」`)];
});
/** A banter holds no choice and no tier: one reading for two companions on their own. */
const banterBreaks = (scenes: Partial<Record<SceneId, { lines: SceneLine[] }>>): string[] =>
  (Object.entries(scenes) as [SceneId, { lines: SceneLine[] }][]).filter(([id]) => id.startsWith('banter:')).flatMap(([id, s]) => [
    ...(s.lines.some(isChoice) ? [`${id}: a choice`] : []),
    ...(flatLines(s.lines).some((l) => l.if?.tier) ? [`${id}: a tier`] : []),
  ]);

describe('bond text: the gates on the copy (bond plan Task 8)', () => {
  const line = (who: ScriptLine['who'], text: string, extra: Partial<ScriptLine> = {}): ScriptLine => ({ who, text, ...extra });
  const choice = (n = 2): ChoiceLine => ({ who: 'hero', choices: (['ask', 'stay', 'promise'] as const).slice(0, n).map((tone) => ({ tone, text: '「後來呢？」', reply: [line('selene', '「好。」')] })) });
  const scene = (lines: SceneLine[], summary = '她說了一件事。') => ({ lines, summary });
  const bonds4 = (c: Companion, lines = [line('narrator', '甲。'), choice()]) =>
    Object.fromEntries([1, 2, 3, 4].map((n) => [bondScene(c, n), scene(lines)]));

  it('every bond scene holds exactly one choice, and nothing else does', () => {
    expect(choiceCountBreaks(REAL())).toEqual([]);
    expect(choiceCountBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([line('narrator', '甲。')]), 'ending:liz': scene([choice()]) } }))
      .toEqual(['bond:selene:1: 0 choices, not 1', 'ending:liz: 1 choices, not 0']);
    expect(choiceCountBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([choice(), choice()]) } })).toEqual(['bond:selene:1: 2 choices, not 1']);
  });

  it('choices are two or three ways to say it', () => {
    expect(choiceShapeBreaks(REAL())).toEqual([]);
    const bad: ChoiceLine = { who: 'hero', choices: [
      { tone: 'ask', text: `「${'好'.repeat(19)}」`, reply: [] },
      { tone: 'ask', text: '「好。」', reply: [line('selene', '一'), line('selene', '二'), line('selene', '三')] },
    ] };
    expect(choiceShapeBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([bad]) } })).toHaveLength(4);   // a tone twice, too long, no reply, three
    expect(choiceShapeBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([choice(1)]) } })).toEqual(['bond:selene:1: 1 ways to say it']);
    const iffy: ChoiceLine = { who: 'hero', choices: [choice().choices[0], { tone: 'stay', text: '（坐下。）', reply: [line('selene', '「嗯。」', { if: { met: 'rin' } })] }] };
    expect(choiceShapeBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([iffy]) } })).toEqual(['bond:selene:1: a reply line with a condition']);
    expect(choiceShapeBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([choice(3)]) } })).toEqual([]);
  });

  it('every scene has its summary', () => {
    expect(summaryBreaks(REAL())).toEqual([]);
    expect(summaryBreaks({ ...EMPTY, scenes: { 'ending:liz': scene([line('narrator', '甲。')], ' '), 'ending:noel': scene([line('narrator', '甲。')], '那一晚的月亮很圓。') } }))
      .toEqual(['ending:liz: no summary', 'ending:noel: a season or the moon in its summary']);
    expect(summaryBreaks({ ...EMPTY, scenes: { 'ending:liz': scene([line('narrator', '甲。')], '好'.repeat(61)) } })).toEqual([`ending:liz: a summary over ${MAX_LINE_CHARS}`]);
  });

  it('registries match the scripts', () => {
    expect(registryBreaks(REAL())).toEqual([]);
    expect(registryBreaks({ ...EMPTY, bonds: ['selene'], scenes: { 'bond:selene:1': scene([choice()]) } })).toEqual([
      'bond:selene:2: registered, not written', 'bond:selene:3: registered, not written', 'bond:selene:4: registered, not written',
    ]);
    expect(registryBreaks({ ...EMPTY, scenes: { 'ending:liz': scene([]) }, romance: { rin: ['一'] } })).toEqual([
      'ending:liz: written, not registered', 'romanceLines.rin: her romance is not registered',
    ]);
    expect(registryBreaks({ ...EMPTY, bonds: ['selene'], endings: ['liz'], romances: ['rin'], together: true, romance: { rin: ['一'] },
      scenes: { ...bonds4('selene'), 'ending:liz': scene([]), 'romance:rin': scene([]), together: scene([]) } })).toEqual([]);
  });

  it('bond copy names no season and no moon', () => {
    expect(seasonBreaks(REAL())).toEqual([]);
    const at = { text: '月影旅館・夜', night: true as const };
    expect(seasonBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([line('narrator', '月影旅館的走廊很安靜。', { place: at }), choice()]) } })).toEqual([]);
    for (const bad of ['窗外下著雪。', '月亮出來了。', '春天到了。', '星燈祭那一晚。']) {
      expect(seasonBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([line('narrator', bad)]) } }), bad).toHaveLength(1);
    }
    expect(seasonBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([line('narrator', '甲。', { place: { text: '屋頂・月下' } })]) } })).toHaveLength(1);
    expect(seasonBreaks({ ...EMPTY, gifts: { selene: { loved: ['「像月光。」'], liked: [], neutral: [], declined: {}, healed: {} } } })).toHaveLength(1);
    expect(seasonBreaks({ ...EMPTY, romance: { rin: ['夏天的夜。'] } })).toHaveLength(1);
    const reply: ChoiceLine = { who: 'hero', choices: [{ tone: 'ask', text: '「冷嗎？」', reply: [line('selene', '「雪好白。」')] }, choice().choices[1]] };
    expect(seasonBreaks({ ...EMPTY, scenes: { 'bond:selene:1': scene([reply]) } })).toHaveLength(1);
  });

  it('Rin before her choice', () => {
    expect(rinBeforeBreaks(REAL())).toEqual([]);
    expect(rinBeforeBreaks({ ...EMPTY, scenes: { 'bond:rin:1': scene([line('rin', '「洛恩。」'), line('rin', '「嗯。」', { mood: 'smile' })]) } }))
      .toEqual(['bond:rin:1: 「「洛恩。」」', 'bond:rin:1: smile']);
    expect(rinBeforeBreaks({ ...EMPTY, scenes: { 'bond:rin:2': scene([line('rin', '「好吧。」')]), 'bond:rin:3': scene([line('rin', '「洛恩，好吧！」')]) } })).toEqual(['bond:rin:2: 「「好吧。」」']);
    const pools = { loved: ['「我們走。」'], liked: [], neutral: [], declined: {}, healed: {} };
    expect(rinBeforeBreaks({ ...EMPTY, gifts: { rin: pools }, rinOath: { ...pools, loved: ['「洛恩，我們走。」'] } })).toEqual(['gift:rin.loved.0: 「「我們走。」」']);
  });

  it('who calls him what', () => {
    expect(callBreaks(REAL())).toEqual([]);
    expect(callBreaks({ ...EMPTY, scenes: { 'bond:safira:1': scene([line('safira', '「洛恩！」'), line('liz', '「洛恩老大。」')]) } })).toEqual(['bond:safira:1: Safira says 「洛恩」']);
    const p = (t: string): GiftPools => ({ loved: [t], liked: [], neutral: [], declined: {}, healed: {} });
    expect(callBreaks({ ...EMPTY, gifts: { selene: p('「洛恩先生。」'), noel: p('「洛恩。」'), scarlet: p('「洛恩閣下。」'), liz: p('「洛恩老大。」') } })).toHaveLength(3);
  });

  it('light and heavy: gift and romance lines keep the light rules', () => {
    expect(lightCopyBreaks(REAL())).toEqual([]);
    const p = (who: Companion, t: string) => ({ ...EMPTY, gifts: { [who]: { loved: [t], liked: [], neutral: [], declined: {}, healed: {} } } });
    expect(lightCopyBreaks(p('selene', '「……謝謝……」'))).toEqual(['gift:selene.loved.0: two 「……」', 'gift:selene.loved.0: opens on 「……」']);
    expect(lightCopyBreaks(p('selene', '「好亮！」'))).toEqual(['gift:selene.loved.0: 「！」 is not hers']);
    expect(lightCopyBreaks(p('bobby', '「好亮！」'))).toEqual([]);
    expect(lightCopyBreaks({ ...EMPTY, romance: { rin: ['「……走吧。」'] } })).toEqual(['romanceLines.rin.0: opens on 「……」']);
  });

  it('the finale and the festival are untouched', () => {
    // data/story/frozenScenes.test.ts holds the snapshot; this checks it is there and holds both scenes.
    const fixture = join(dirname(fileURLToPath(import.meta.url)), 'story', '__fixtures__', 'frozen-scenes.json');
    expect(existsSync(fixture)).toBe(true);
    expect(Object.keys(JSON.parse(readFileSync(fixture, 'utf8'))).sort()).toEqual(['epilogue', 'finale']);
  });

  it('no banter holds a choice or a tier', () => {
    expect(banterBreaks(STORY.scenes)).toEqual([]);
    expect(banterBreaks({ 'banter:noel-rin:1': { lines: [choice()] }, 'banter:noel-rin:2': { lines: [line('rin', '一', { if: { tier: { who: 'rin', min: 1 } } })] } }))
      .toEqual(['banter:noel-rin:1: a choice', 'banter:noel-rin:2: a tier']);
  });

  it('no room of his own', () => {
    expect(roomBreaks(REAL())).toEqual([]);
    expect(roomBreaks({ ...EMPTY, scenes: { 'bond:rin:3': scene([line('narrator', '他回到自己的床。'), line('narrator', '她敲了敲他的房間。')]) } })).toEqual(['bond:rin:3.1']);
  });

  it('a romance keeps everyone', () => {
    expect(romanceBreaks(REAL())).toEqual([]);
    expect(romanceBreaks({ ...EMPTY, scenes: { 'romance:rin': scene([line('rin', '「走吧。」'), line('selene', '「我吃醋了呢。」')]) } }))
      .toEqual(['romance:rin: no other companion is there', 'romance:rin: 「「我吃醋了呢。」」']);
    expect(romanceBreaks({ ...EMPTY, scenes: { 'romance:rin': scene([line('rin', '「走吧。」'), line('selene', '「路上小心。」', { if: { met: 'selene' } })]) } })).toEqual([]);
  });
});

// ---- bond plan Task 16: the gift reactions of all nine, each in her own voice (style bible §2.3, §2.5, §3; story L §7)

/** Chizuru's own day in a light line (story L Task 13, the same list voice.test.ts reads). */
const ERA = /我們那時候|我們那裡|最近|近來|去年|今年|城裡.{0,4}(流行|改|新)/;
/**
 * What breaks a gift line's voice, one line a break. Each line is one spoken line in 「」 of MAX_LINE_CHARS at most, in whole
 * sentences (`telegraphBreaks`), with no particle her voice never uses and Chizuru's old style one a line; each table (Rin's
 * two counted apart) keeps her particle to its share, 「……」 to the bible's share of a speaker, no line twice, and Sylvie's
 * food and weather, Chizuru's own day and her old style to their shares of a light scene.
 */
const giftVoiceBreaks = (copy: BondCopy): string[] => {
  const lines = giftLinesOf(copy);
  const out: string[] = [];
  for (const t of lines) {
    if (!/^「[^「」]*」$/.test(t.text)) out.push(`${t.key}: not one line in 「」`);
    if ([...t.text].length > MAX_LINE_CHARS) out.push(`${t.key}: over ${MAX_LINE_CHARS}`);
    for (const why of telegraphBreaks(t.text)) out.push(`${t.key}: ${why}`);
    if (VOICE[t.who]?.never?.test(t.text)) out.push(`${t.key}: a particle not hers`);
    if (t.who === 'chizuru' && (CHIZURU_NEVER.test(t.text) || (t.text.match(new RegExp(CHIZURU_ARCHAIC.source, 'g')) ?? []).length > 1)) out.push(`${t.key}: not her old style`);
  }
  const tables = new Map<string, typeof lines>();
  for (const t of lines) { const tag = t.key.split('.')[0]; tables.set(tag, [...(tables.get(tag) ?? []), t]); }
  for (const [tag, ls] of tables) {
    const who = ls[0].who;
    const v = VOICE[who];
    const share = (re: RegExp) => ls.filter((t) => re.test(t.text)).length / ls.length;
    if (v?.mark && v.maxShare !== undefined && share(v.mark) > v.maxShare) out.push(`${tag}: her particle in too many lines`);
    if (ls.filter((t) => dots(t.text) > 0).length > Math.max(1, Math.floor(ls.length / 6))) out.push(`${tag}: 「……」 in too many lines`);
    if (new Set(ls.map((t) => t.text)).size !== ls.length) out.push(`${tag}: a line twice`);
    if (who === 'sylvie' && share(SYLVIE_WORLD) < 1 / 3) out.push(`${tag}: too little food, weather or tracks`);
    if (who === 'chizuru' && share(ERA) < 1 / 3) out.push(`${tag}: too little of her own day`);
    if (who === 'chizuru' && share(CHIZURU_ARCHAIC) > 1 / 4) out.push(`${tag}: too much old style`);
  }
  return out;
};

describe('bond text: the gift reactions of all nine (bond plan Task 16)', () => {
  it('all nine are written, Rin before and after her choice', () => {
    expect(COMPANIONS.filter((c) => !GIFT_LINES[c])).toEqual([]);
    expect(RIN_OATH_GIFT_LINES).not.toBeNull();
  });

  it('each line is hers: her voice, her particles, whole sentences', () => {
    expect(giftVoiceBreaks(REAL())).toEqual([]);
    // The gate bites: each kind of break on an injected table.
    const pools = (loved: string[], neutral: string[]): GiftPools => ({ loved, liked: ['「乙。」', '「丙。」'], neutral, declined: {}, healed: {} });
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { scarlet: pools(['「收下了啦。」', '收下了。'], [`「${'好'.repeat(60)}」`]) } })).toEqual([
      'gift:scarlet.loved.0: a particle not hers', 'gift:scarlet.loved.1: not one line in 「」', `gift:scarlet.neutral.0: over ${MAX_LINE_CHARS}`,
    ]);
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { liz: pools(['「好啦。收啦。」', '「虧啦。」'], ['「成交啦。」']) } })).toContain('gift:liz: her particle in too many lines');
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { liz: pools(['「這個算你……便宜。」', '「虧大了可是……收下。」'], ['「乙。」']) } }))
      .toEqual(['gift:liz: 「……」 in too many lines', 'gift:liz: a line twice']);
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { sylvie: pools(['「好看。」', '「收下。」'], ['「放著。」']) } })).toContain('gift:sylvie: too little food, weather or tracks');
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { chizuru: pools(['「此處甚好。」', '「收下了。」'], ['「莫非是禮物。」']) } })).toEqual([
      'gift:chizuru.loved.0: not her old style', 'gift:chizuru: too little of her own day', 'gift:chizuru: too much old style',
    ]);
    expect(giftVoiceBreaks({ ...EMPTY, gifts: { selene: pools(['「好亮。退路。三條。」', '「收下了。」'], ['「謝謝。」']) } })).toHaveLength(1);   // telegraphese
  });
});

// ---- bond plan Task 17: Rin's, Selene's and Chizuru's bond scenes (arcs v7)

describe('bond scenes: Rin, Selene, Chizuru (bond plan Task 17)', () => {
  it('the three are registered, all four scenes of each written', () => {
    for (const c of ['rin', 'selene', 'chizuru'] as Companion[]) {
      expect(BONDS_WRITTEN, c).toContain(c);
      for (let n = 1; n <= 4; n++) expect(BOND_SCENES[bondScene(c, n)], `${c} ${n}`).toBeDefined();
    }
  });

  it('each scene holds its beat, in each reading it branches into (W4)', () => {
    const noNoel = CHARACTER_IDS.filter((c) => c !== 'noel');
    // Rin: the needle she wants; owing is not leaving; what she did not say then; the place she picked herself
    pinBeat('bond:rin:1', { oath: false }, /長半分/);
    pinBeat('bond:rin:2', { oath: false }, /欠了人就要還/);
    pinBeat('bond:rin:3', { oath: true }, /那時候不能欠你/);
    pinBeat('bond:rin:4', { oath: true }, /自己挑的位置/);
    // Selene: the window she sorry-guessed; the choice she would not make (Noel met or not); a dog first; her first 明天見
    pinBeat('bond:selene:1', {}, /害的/);
    pinBeat('bond:selene:2', {}, /怕選錯/);
    pinBeat('bond:selene:2', {}, /妳明明知道/);
    pinBeat('bond:selene:2', { met: noNoel }, /有人繞了遠路/);
    pinBeat('bond:selene:3', {}, /是一隻狗/);
    pinBeat('bond:selene:3', {}, /小提燈塞進她手裡/);   // review 5: the gift is seen
    pinBeat('bond:selene:4', { full: ['selene'] }, /明天見，洛恩/);
    // Chizuru: paying more than asked; the great-grandson (her fourth piece told or not); the new rules; never late here
    pinBeat('bond:chizuru:1', {}, /店家會吃虧/);
    pinBeat('bond:chizuru:2', { seen: [] }, /曾祖母/);
    pinBeat('bond:chizuru:2', { seen: [] }, /抱回懷裡/);
    pinBeat('bond:chizuru:2', { seen: ['mem:chizuru:4'] }, /總該還有人在/);
    pinBeat('bond:chizuru:3', {}, /也是我贏/);
    pinBeat('bond:chizuru:3', {}, /只踢一次/);   // review 5: the old rule plainly older than the new one
    pinBeat('bond:chizuru:4', { full: ['chizuru'] }, /一次也沒有遲到過/);
  });
});

// ---- bond plan Task 18: Safira's, Sylvie's and Noel's bond scenes (arcs v7)

describe('bond scenes: Safira, Sylvie, Noel (bond plan Task 18)', () => {
  it('the three are registered, all four scenes of each written', () => {
    for (const c of ['safira', 'sylvie', 'noel'] as Companion[]) {
      expect(BONDS_WRITTEN, c).toContain(c);
      for (let n = 1; n <= 4; n++) expect(BOND_SCENES[bondScene(c, n)], `${c} ${n}`).toBeDefined();
    }
  });

  it('each scene holds its beat, in each reading it branches into (W4)', () => {
    const noSylvie = CHARACTER_IDS.filter((c) => c !== 'sylvie');
    // Safira: a stage for him alone; the child she never looked back for (Sylvie met or not); she waits for his count; no applause
    pinBeat('bond:safira:1', {}, /一個人的舞台/);
    pinBeat('bond:safira:2', {}, /跟得很緊/);
    pinBeat('bond:safira:2', {}, /妳一次都沒有回頭看/);
    pinBeat('bond:safira:2', { met: noSylvie }, /洛恩在井邊找到他/);
    pinBeat('bond:safira:3', {}, /停在半空/);
    pinBeat('bond:safira:4', { full: ['safira'] }, /安靜也沒關係/);
    // Sylvie: hungry counts as lost; she always carries it; the sixth spoonful; she wants to watch it grow
    pinBeat('bond:sylvie:1', {}, /餓的人也算迷路/);
    pinBeat('bond:sylvie:2', {}, /一向都背得動/);
    pinBeat('bond:sylvie:3', {}, /第六口/);
    pinBeat('bond:sylvie:4', { full: ['sylvie'] }, /想看它長大/);
    // Noel: the title still provisional; every face in the notebook; the big one shelved; afraid no one would remember her
    pinBeat('bond:noel:1', {}, /暫定/);
    pinBeat('bond:noel:2', {}, /每個人的名字和長相/);
    pinBeat('bond:noel:3', {}, /暫時不練/);
    pinBeat('bond:noel:4', { full: ['noel'] }, /怕沒人記得我/);
  });
});

// ---- bond plan Task 19: Bobby's, Liz's and Scarlet's bond scenes (arcs v7); with them all nine are written

describe('bond scenes: Bobby, Liz, Scarlet (bond plan Task 19)', () => {
  it('the three are registered, all four scenes of each written; every companion now has hers', () => {
    for (const c of ['bobby', 'liz', 'scarlet'] as Companion[]) {
      expect(BONDS_WRITTEN, c).toContain(c);
      for (let n = 1; n <= 4; n++) expect(BOND_SCENES[bondScene(c, n)], `${c} ${n}`).toBeDefined();
    }
    expect([...BONDS_WRITTEN].sort()).toEqual([...COMPANIONS].sort());
  });

  it('each scene holds its beat, in each reading it branches into (W4)', () => {
    const noLiz = CHARACTER_IDS.filter((c) => c !== 'liz');
    // Bobby: the tassel that found the wrong sheath; mend it till it is right; not today; the first one she won't fix
    pinBeat('bond:bobby:1', {}, /找錯了/);
    pinBeat('bond:bobby:2', {}, /修到對為止/);
    pinBeat('bond:bobby:3', {}, /今天不修/);
    pinBeat('bond:bobby:4', { full: ['bobby'] }, /第一個不想修的人/);
    // Liz: half a copper; a whole wall of them; every IOU torn; home is someone at the door (Orik's piece back or not)
    pinBeat('bond:liz:1', {}, /跌到半枚/);
    pinBeat('bond:liz:2', {}, /我看過一整面牆/);
    pinBeat('bond:liz:3', {}, /一口氣全撕了/);
    pinBeat('bond:liz:3', {}, /之後再付的那一張/);   // review 5: every IOU is his (scene 2); the last one holds her longest
    pinBeat('bond:liz:4', { full: ['liz'] }, /門口有人等/);
    pinBeat('bond:liz:4', { full: ['liz'], returned: ['orik'] }, /帳他自己會對/);
    pinBeat('bond:liz:4', { full: ['liz'], returned: [] }, /帽子還掛在門後/);
    // Scarlet: her own slot left empty; the difference is her (Liz met or not); she kneels and lets the child guard; rest
    pinBeat('bond:scarlet:1', {}, /只有她自己那一格空著/);
    pinBeat('bond:scarlet:2', {}, /差額是我/);
    pinBeat('bond:scarlet:2', {}, /命錢/);
    pinBeat('bond:scarlet:2', { met: noLiz }, /推回她面前/);
    pinBeat('bond:scarlet:2', {}, /摔在桌上/);   // review 5: Liz leaves on the page, not in Scarlet's mouth
    pinBeat('bond:scarlet:3', {}, /單膝跪下/);
    pinBeat('bond:scarlet:4', { full: ['scarlet'] }, /休息：絲嘉蕾/);
  });

  it('Selene, Noel and Scarlet call him nothing in their first three; Selene says neither 你 nor 您 there (I-208, review 5)', () => {
    const ADDRESS = /洛恩|閣下|長官|歸來者|先生|大人/;
    const out: string[] = [];
    for (const c of ['selene', 'noel', 'scarlet'] as Companion[]) for (const n of [1, 2, 3]) {
      for (const l of flatLines(BOND_SCENES[bondScene(c, n)]!.lines)) {
        if (l.who !== c) continue;
        if (ADDRESS.test(l.text) || (c === 'selene' && /你|您/.test(l.text))) out.push(`${bondScene(c, n)}: ${l.text}`);
      }
    }
    expect(out).toEqual([]);
  });
});

// ---- bond plan Task 20: the nine after-stories and the walk together (arcs v7, after-story lines)
describe('after-stories and the walk together (bond plan Task 20)', () => {
  const ENDING = (c: Companion): SceneId => `ending:${c}`;

  it('all nine and the walk together are registered and written', () => {
    expect([...ENDINGS_WRITTEN].sort()).toEqual([...COMPANIONS].sort());
    for (const c of COMPANIONS) expect(BOND_SCENES[ENDING(c)], c).toBeDefined();
    expect(TOGETHER_WRITTEN.value).toBe(true);
    expect(BOND_SCENES.together).toBeDefined();
  });

  it('each after-story holds its beat, and the line its tier adds (W4)', () => {
    const at3 = (c: Companion) => ({ oath: true, full: [c], tiers: { [c]: 3 } });
    const beats: [Companion, RegExp, RegExp][] = [
      ['rin', /晚了三口氣/, /第一碗是我的/],            // the bell on the gate's post (I-210); half a step ahead
      ['selene', /圈比勾多/, /和洛恩看第一扇窗/],        // the notebook of tomorrows
      ['chizuru', /收香氣就好/, /之後從未遲到/],         // the bread in the offering book, after the festival
      ['safira', /錯得這麼整齊/, /是小洛的/],            // the dance class, and Doran
      ['sylvie', /準不準另說/, /走路輕多了/],            // the sapling and the weather (I-213)
      ['noel', /加倍奉還/, /雷光的諾艾兒/],              // her teacher's stall; the title at last
      ['bobby', /一下下就好/, /當天就還了/],             // the repair table; Doran's 好
      ['scarlet', /撤退密道/, /我也算一個/],             // the letter (I-211)
    ];
    for (const [c, base, tier] of beats) {
      pinBeat(ENDING(c), { oath: true, full: [c] }, base);
      pinBeat(ENDING(c), at3(c), tier);
      expect(() => pinBeat(ENDING(c), { oath: true, full: [c] }, tier), `${c}: the tier line waits for tier 3`).toThrow();
    }
    // Liz, both ways: her father back (a contest at the counter) or not (a sale a day, the hat still behind his door)
    pinBeat('ending:liz', { full: ['liz'], returned: ['orik'] }, /輸家價/);
    pinBeat('ending:liz', { full: ['liz'], returned: [] }, /紅帽子，還掛在門後/);
    pinBeat('ending:liz', { full: ['liz'], tiers: { liz: 3 } }, /。不估。/);
    pinBeat('together', {}, /分不出哪一個是誰的/);
  });

  it('a tier line is hers and waits for tier 3; Orik says nothing where he has not remembered her', () => {
    for (const c of COMPANIONS) {
      const tiers = flatLines(BOND_SCENES[ENDING(c)]!.lines).filter((l) => l.if?.tier);
      expect(tiers.length, c).toBeGreaterThanOrEqual(1);
      for (const l of tiers) expect(l.if!.tier, c).toEqual({ who: c, min: 3 });
    }
    const notBack = flatLines(BOND_SCENES['ending:liz']!.lines).filter((l) => !l.if?.returned);
    expect(notBack.some((l) => l.who === 'orik')).toBe(false);
  });

  it("an after-story promises nothing for life: that is the romance's (arcs v7, M2)", () => {
    const LIFE = /一輩子|往後|以後每|每一次都|回到妳/;
    const ids: SceneId[] = [...COMPANIONS.map(ENDING), 'together'];
    const out = ids.flatMap((id) => flatLines(BOND_SCENES[id]?.lines ?? []).filter((l) => LIFE.test(l.text)).map((l) => `${id}: ${l.text}`));
    expect(out).toEqual([]);
    // Scarlet's letter names no princess and none of her words (I-211)
    for (const l of flatLines(BOND_SCENES['ending:scarlet']?.lines ?? [])) expect(l.text).not.toMatch(/公主|國家|轉身|號角|朋友|活下去|起誓|誓言|選/);
  });
});
