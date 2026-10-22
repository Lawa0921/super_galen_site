/**
 * The suggested builds (spec §16, plan 8h): for each character a "standard" build and the rune builds after it. One build
 * serves three ends: the tree and talents a click lays out, the runes it suggests for each skill, and the policy that drives
 * both the sim and the battle's 「自動」. The standard build is the default tree, talents and policy (engine/builds.test),
 * so wearing it changes nothing anywhere. A build's name and line are content, like a skill's name; its policy words are
 * made from its rules (engine/builds.ts policyText), never written twice.
 */
import type { PolicyRule } from '../engine/policy';
import type { AnyStat, CharacterId } from '../engine/types';
import { CHARACTER_IDS } from './characters';
import type { HeroBuild } from './hero';
import { DEFAULT_POLICIES } from './policies';
import type { RuneId } from './runes';
import type { KeystoneId } from './talents';
import { T } from './text.zh-TW';

/** Where a build is measured to shine (plan 8h ruling 7): a boss, a crowd, or a long fight. */
export type BuildScenario = 'boss' | 'crowd' | 'long';

/**
 * One build. `first`: nodes learned before the default order reaches them; `sides`: B sides taken in place of their A
 * sides; `capstone`: the branch whose ultimate it takes; `talents` / `keystones`: the stats its normal talent nodes lean
 * on and its keystones; `runes`: the runes it suggests per skill, slot by slot; `hero`: the hero's HERO_BUILDS tree and
 * talents (his builds take those, not the fields above).
 */
export interface BuildDef {
  key: string; owner: CharacterId; name: string; intro: string;
  hero?: HeroBuild; first?: string[]; sides?: string[]; capstone?: number; talents?: AnyStat[]; keystones?: KeystoneId[];
  runes: Readonly<Record<string, readonly RuneId[]>>;
  policy: readonly PolicyRule[];
  scenario?: BuildScenario;
}

/** A character's standard build: the default tree, talents and policy, no runes. */
const standard = (owner: CharacterId): BuildDef => ({
  key: 'standard', owner, name: T.build.standard.name, intro: T.build.standard.intro, runes: {},
  policy: DEFAULT_POLICIES[owner] ?? [], ...(owner === 'hero' ? { hero: 'balanced' as const } : {}),
});

type RuneBuild = Omit<BuildDef, 'owner'>;

/** The builds' damage pick: what each cast would really deal, times the foes it meets (plan 8h Task 5b, H1). */
const aoe: PolicyRule = { kind: 'strongest-damage', aoe: true, effective: true };

/**
 * The rune builds (plan 8h Task 4; spec §16's starting proposal on the roster as it is now). Each puts at least one rune
 * the item shop sells (plan 8h, the spec's conflict 2). A build that names `capstone` is laid out to reach that ultimate
 * (engine/progression.ts treeFor); `first` brings in the nodes its policy plays before the default order would.
 */
const RUNE_BUILDS: Record<CharacterId, readonly RuneBuild[]> = {
  noel: [
    { key: 'meteor', name: '暴走流星', intro: '火之星彈一口氣燒過去，熱度滿了就用業火暴走！', scenario: 'crowd', capstone: 0,
      runes: { 'fire-star': ['spread', 'ignite', 'multistrike'] },
      policy: [{ kind: 'spend-at', gauge: 'heat', min: 4, skill: 'inferno' }, aoe] },
    { key: 'cycle', name: '冰火循環', intro: '火之星彈蓄力猛攻，熱度一高就換冰之星彈，降溫順便回氣。', scenario: 'boss',
      // 連擊 on the ice star (the shop's): one more hit is one more TP back, so she cools down sooner.
      runes: { 'ice-star': ['regain', 'multistrike'], 'fire-star': ['charge', 'ignite'] },
      policy: [{ kind: 'spend-at', gauge: 'heat', min: 4, skill: 'ice-star' }, aoe] },
  ],
  chizuru: [
    { key: 'steady', name: '不動結界', intro: '失禮了。守之結界整場都在，代價是一點 TP 上限。', scenario: 'long',
      // 常駐 keeps it up all fight, never cast by hand: no 延長.
      runes: { ward: ['lasting'], sweep: ['multistrike'] },
      policy: [{ kind: 'heal-below', pct: 40 }, aoe] },
    { key: 'exorcist', name: '破邪神槍', intro: '貫槍帶著雷鳴；結界蓄好之後，天之逆鉾一口氣解放。', scenario: 'boss', capstone: 2,
      first: ['chizuru-thunder-ward'],
      // 雷鳴 and 感電 ride on 天之逆鉾, the blow the build is for; 連擊 on 貫槍 (the shop's) for the turns between.
      runes: { pierce: ['multistrike'], 'heaven-spear': ['thunderclap', 'jolt', 'charge'] },
      // Tuning round 1 (plan 8h Task 5b): released from two rounds left.
      policy: [{ kind: 'ensure-barrier', skills: ['ward'] }, { kind: 'release-at', min: 2, skill: 'heaven-spear' }, aoe] },
  ],
  liz: [
    { key: 'jackpot', name: '一擲千金', intro: '雙刃快快賺銅板，存夠了就一擲千金！', scenario: 'crowd', capstone: 0,
      runes: { 'twin-slash': ['multistrike', 'regain'] },
      // Between the throws the strongest cast earns the coins; 大手筆 waits for a full purse (tuning round 1).
      policy: [{ kind: 'spend-at', gauge: 'coins', min: 8, skill: 'jackpot' }, { kind: 'spend-at', gauge: 'coins', min: 10, skill: 'fortune-strike' }, aoe] },
    { key: 'bleed', name: '撕裂快刀', intro: '雙刃加撕裂，一刀一刀讓牠流血流到見底。', scenario: 'boss',
      runes: { 'twin-slash': ['tear', 'multistrike'], pickpocket: ['tear'] },
      // 大手筆 waits for a full purse, so the torn blades come first.
      policy: [{ kind: 'spend-at', gauge: 'coins', min: 10, skill: 'fortune-strike' }, aoe] },
  ],
  sylvie: [
    { key: 'heart', name: '一箭穿心', intro: '盯住頭目，穿心箭蓄滿力，再用星墜一矢收下瞄準。', scenario: 'boss', capstone: 0,
      // 連擊 on 穿心箭 (the shop's): the shot the build casts, one more hit on the aimed foe.
      runes: { 'heart-shot': ['charge', 'armor-break', 'multistrike'] },
      policy: [{ kind: 'spend-at', gauge: 'aim', min: 3, skill: 'starfall-arrow' }, aoe] },
    { key: 'wildfire', name: '燎原箭雨', intro: '箭雨帶火，整片一起燒掉。', scenario: 'crowd', capstone: 2,
      runes: { 'arrow-rain': ['flame', 'ignite', 'multistrike'] },
      // 箭雨 every turn: the runes are on it (tuning round 1: the strongest pick never chose it).
      policy: [{ kind: 'cast-when', skill: 'arrow-rain' }] },
  ],
  scarlet: [
    { key: 'riposte', name: '反擊之壁', intro: '來打我啊！挨一下，就燒一圈還給你們。', scenario: 'long', capstone: 2,
      first: ['scarlet-burst-heart', 'blaze-ring'],
      // 炎環斬 is fire already: 點燃 in place of the table's 灼焰; 連擊 (the shop's) on it too (「依 fit」).
      runes: { 'blaze-ring': ['on-struck', 'ignite', 'multistrike'] },
      policy: [{ kind: 'ensure-taunt', skill: 'provoke' }, { kind: 'cast-when', skill: 'atoning-flame', big: true, whileAbsent: true }, aoe] },
    { key: 'ember', name: '紅蓮餘燼', intro: '替大家擋下的傷，全部存成餘燼，紅蓮終焉一次還給牠。', scenario: 'boss', capstone: 1,
      // 代受 (on the way, 高喊), then 熾心, 赤心 and 回禮; 延長 does not take a cover, so 代受 takes 節流 (「依 fit」).
      first: ['scarlet-provoke-shout', 'cover', 'scarlet-ardent', 'scarlet-burst-heart', 'scarlet-thanks'],
      runes: { 'crimson-end': ['charge'], cover: ['thrift'] },
      // 紅蓮終焉 from a tenth of her max HP in embers (tuning round 1: at 40% it was never cast).
      policy: [{ kind: 'ensure-cover', skill: 'cover' }, { kind: 'spend-at', gauge: 'embers', min: 10, of: 'maxHp', skill: 'crimson-end' }, aoe] },
  ],
  selene: [
    { key: 'fullmoon', name: '滿月聖女', intro: '月光照著大家，大補就留到滿月呢。', scenario: 'long', capstone: 1,
      runes: { moonlight: ['spread', 'dispel'] },
      // The full moon's big heal is 月光 spread over everyone (滿月之癒 is the other branch's ultimate). Tuning round 1: no
      // 收回 rule — 滿月之夜 holds the full moon past the end of every measured fight, so the moon never wanes for it to
      // step back (controller ruling R5: dropped from coverage, reason in rune-value.md); heal from 70%.
      policy: [
        { kind: 'cast-when', skill: 'full-moon-night', big: true, whileAbsent: true },
        { kind: 'at-phase', phase: 'full', skill: 'moonlight' }, { kind: 'heal-below', pct: 70 }, aoe,
      ] },
    { key: 'nightmare', name: '新月夢魘', intro: '新月來了，大家都睡吧。夢裡也有毒喔。', scenario: 'crowd', capstone: 2,
      // 夢境 deals no damage: 淬毒 goes on 月蝕, which strikes them all; 夢境 takes 節流 (「依 fit」).
      runes: { dream: ['thrift'], 'lunar-eclipse': ['venom'] },
      policy: [{ kind: 'at-phase', phase: 'new', skill: 'dream' }, aoe] },
  ],
  safira: [
    { key: 'fourbeat', name: '四拍劍舞', intro: '刃舞加撕裂，跟著四拍一路跳到終幕！', scenario: 'boss', capstone: 2,
      first: ['safira-dance-four'],
      runes: { 'blade-dance': ['tear', 'multistrike'] },
      policy: [{ kind: 'cast-when', skill: 'mirage-step', whileAbsent: true }, { kind: 'alternate', repeat: true }, aoe] },
    { key: 'festival', name: '祭典指揮', intro: '戰舞整場不停，拍手幫大家把絕技量表炒熱！', scenario: 'long', capstone: 1,
      first: ['clap', 'safira-clap-encore'],
      // No rune takes 拍手 (a free gauge skill); 常駐 keeps 戰舞 up; 連擊 (the shop's) on 刃舞 (「依 fit」).
      runes: { 'war-dance': ['lasting'], 'blade-dance': ['multistrike'] },
      policy: [{ kind: 'cast-unless-last', skill: 'clap' }, { kind: 'alternate', repeat: true }] },
  ],
  bobby: [
    { key: 'factory', name: '砲台工廠', intro: '砲台一座一座架，改良到最好！', scenario: 'long',
      first: ['bobby-drone-aid', 'overclock'],
      // A turret deals its damage as a device, so 連擊 does not take it: 蓄力 in its place (「依 fit」).
      runes: { turret: ['extend', 'charge'] },
      policy: [{ kind: 'ensure-device', skills: ['turret'] }, { kind: 'cast-when', skill: 'overclock', big: true }, aoe] },
    { key: 'grid', name: '電網', intro: '線圈加地雷，整片都通電啦！', scenario: 'crowd', capstone: 2,
      runes: { 'tesla-coil': ['extend'], 'shock-mine': ['extend'] },
      policy: [{ kind: 'ensure-device', skills: ['tesla-coil', 'shock-mine', 'barrier'] }, aoe] },
  ],
  rin: [
    { key: 'silent', name: '無聲處決', intro: '先暗記，處決收尾；倒下的時候，飛針會自己追出去。', scenario: 'boss',
      first: ['rin-mark-steady', 'rin-execute'],
      runes: { 'rin-needle': ['on-kill', 'multistrike'], 'rin-execute': ['charge'] },
      policy: [{ kind: 'ensure-mark', skill: 'rin-mark' }, { kind: 'execute-below', pct: 35, skill: 'rin-execute' }, aoe] },
    { key: 'venom', name: '千針毒', intro: '千針帶毒又帶撕裂，慢慢磨。', scenario: 'crowd', capstone: 0,
      // 連擊 on 千針 (the shop's): one more hit, one more 撕裂.
      runes: { 'rin-storm': ['venom', 'tear', 'multistrike'] },
      policy: [aoe] },
  ],
  hero: [
    { key: 'sword', name: '劍技', intro: '正面衝上去，劍技一路連斬。', scenario: 'boss', hero: 'sword',
      runes: { 'hero-slash': ['multistrike', 'tear'] }, policy: [aoe] },
    { key: 'mage', name: '星術', intro: '星火擴散開來，一次照亮整片。', scenario: 'crowd', hero: 'mage',
      runes: { 'hero-flare': ['spread', 'ignite'] }, policy: [{ kind: 'heal-below', pct: 40 }, aoe] },
    { key: 'healer', name: '祈光', intro: '治癒照到每個人，誰都別倒下。', scenario: 'long', hero: 'healer',
      runes: { 'hero-mend': ['spread', 'dispel'] }, policy: [{ kind: 'heal-below', pct: 60 }, aoe] },
    { key: 'tank', name: '守護', intro: '站到最前面，傷害都衝著我來。', scenario: 'long', hero: 'tank',
      // 分享 needs a skill of buffs alone and 守勢 also taunts: 節流 in its place (「依 fit」).
      runes: { 'hero-guard': ['extend', 'thrift'] }, policy: [{ kind: 'ensure-taunt', skill: 'hero-guard' }, aoe] },
    // 連擊 on 劍技 (the shop's): more hits of his own bring more TP back, kept for the echo.
    { key: 'echo', name: '殘響', intro: '跟在大家後面，把最強的那一招再放一次。', scenario: 'boss', hero: 'balanced',
      // The echo from 40% of his strongest (tuning round 1: at 100% it never fired).
      runes: { 'hero-slash': ['regain', 'multistrike'] }, policy: [{ kind: 'echo', min: 40 }, aoe] },
  ],
};

/** Each character's builds, the standard one first. */
export const BUILDS: Record<CharacterId, readonly BuildDef[]> = Object.fromEntries(
  CHARACTER_IDS.map((id): [CharacterId, readonly BuildDef[]] => [id, [standard(id), ...RUNE_BUILDS[id].map((b) => ({ ...b, owner: id }))]]),
) as Record<CharacterId, readonly BuildDef[]>;

/** `id`'s build `key`, if there is one. */
export function buildOf(id: CharacterId, key: string): BuildDef | undefined {
  return BUILDS[id]?.find((b) => b.key === key);
}
