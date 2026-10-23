import type { RaiseFail, TalentFail } from '../engine/progression';
import type { StatCategory } from '../engine/stats';
import type { SkillMod } from './gear';
import { KEYSTONE_GATE } from './talents';
import { EQUIPMENT } from './equipment';
import { ITEMS } from './items';
import { MATERIALS } from './materials';
import { SETS } from './gear';
import type { RegionId } from './regions';
import { RUNES, type RuneId, type RuneTier, type Tag } from './runes';
import { numeral } from './numeral';
import { CHARACTERS } from './characters';
import type { MaterialUse } from '../engine/forge/uses';
import type { MaterialKind } from '../engine/types';
import type { AnyStat, BuffStat, Rarity, Slot, StatKey, Target } from '../engine/types';
import type { AilmentChip, AilmentShown } from '../engine/ailments';

const STAT: Record<StatKey, string> = { hp: 'HP', tp: 'TP', atk: '攻擊', def: '防禦', mag: '魔力', res: '魔防', spd: '速度' };
/** The battle log's line when an ailment takes hold (a boss's freeze reads as the chill it became). */
const STATUS_LINE: Record<AilmentShown, string> = {
  poison: '中毒了', sleep: '睡著了', burn: '燒起來了', freeze: '被凍住了', chill: '的動作變慢了', shock: '觸電了', bleed: '開始流血了',
};
const AILMENT_NAME: Record<AilmentShown, string> = { poison: '中毒', sleep: '睡眠', burn: '灼燒', freeze: '凍結', chill: '冰緩', shock: '感電', bleed: '流血' };
/** A rune refused or greyed for one already on the skill: the same one, or one of its group (T.rune.why and T.rune.fail). */
const RUNE_SAME = (name: string) => `同一招不能裝兩個${name}`;
const RUNE_GROUP = (name: string) => `已有同類符文：${name}`;
const SLOT: Record<Slot, string> = {
  weapon: '武器', offhand: '副手', head: '頭部', body: '身體', hands: '手部', feet: '腳部', neck: '項鍊', ring1: '戒指 1', ring2: '戒指 2',
};

const RARITY: Record<Rarity, string> = { common: '普通', magic: '魔法', rare: '稀有', epic: '史詩', legendary: '傳說', unique: '獨特', set: '套裝' };
/**
 * A power percent said as a multiplier, 「×1.3」 for 130 (plan 8g final review): a variant's or a rank's power is never
 * read as a final number beside the card's.
 */
const MULT = (pct: number): string => `×${+(pct / 100).toFixed(2)}`;
/** Who a skill aims at, one style on every screen (the status page, the card, the battle summary). */
const TARGETS: Record<Target, string> = {
  enemy: '敵方單體', enemies: '敵方全體', ally: '我方單體', allies: '我方全體', self: '自身', deadAlly: '倒下的隊友',
  row: '敵方一排', column: '敵方一列', cross: '十字範圍',
};
/** Every stat's name: the seven base names come from STAT, so they are written once. */
const STAT_NAME: Record<AnyStat, string> = {
  ...STAT,
  str: '力量', int: '智力', agi: '敏捷', wil: '意志',
  crit: '暴擊率', critDmg: '暴擊傷害', vuln: '弱點傷害', eliteDmg: '對菁英傷害', multi: '連擊率',
  armor: '護甲', evasion: '閃避', block: '格擋率', meleeDR: '近戰減傷', rangedDR: '遠程減傷',
  fireRes: '火抗', iceRes: '冰抗', thunderRes: '雷抗', fireDmg: '火焰傷害', iceDmg: '冰霜傷害', thunderDmg: '雷電傷害',
  poisonRes: '毒抗', sleepRes: '睡眠抗性',
  tpRegen: 'TP 回復', tpCost: 'TP 消耗減少', gauge: '絕技充能', heal: '治療效果',
  goldFind: '金幣掉落', matFind: '素材掉落', expBonus: '經驗加成',
};
/** Stats that read as points; every other stat reads as a percent. */
const POINT_STATS: AnyStat[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd', 'str', 'int', 'agi', 'wil', 'armor', 'evasion', 'tpRegen'];

/** A number as shown: whole when it is (within a float's error), else one decimal (a fractional base bonus: 「7.4」). */
const num = (v: number): string => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));
/** A stat change as shown to the player: `+5`, `−3` (the minus sign U+2212, never a hyphen), `0`. */
const signed = (v: number): string => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : '0');
/**
 * Two numbers with one shared precision: whole when both are, else one decimal, or two when one would read the same.
 * The one place an item display may show two decimals (the precision ruling says one): the enhance preview's before → after.
 * A 1-point base (def 1) grows ENHANCE_STEP = 0.08 a level, so one decimal can print the same number on both sides
 * (1.0 → 1.0) and hide a real step; the second decimal (1.00 → 1.08) is shown only then.
 */
const pair = (a: number, b: number): [string, string] => {
  if (num(a) === String(Math.round(a)) && num(b) === String(Math.round(b))) return [num(a), num(b)];
  const d = a.toFixed(1) === b.toFixed(1) && Math.abs(a - b) > 1e-9 ? 2 : 1;
  return [a.toFixed(d), b.toFixed(d)];
};

/** The homecoming sentence, alone or ahead of what came home. */
const home = (viaLamp: boolean) => (viaLamp ? '歸還之燈的光芒把隊伍帶回了城鎮。' : '平安回城。');

const FORGE_GROUP: Record<RegionId, string> = {
  mainline: '', blaze: '火焰系', frost: '冰霜系', storm: '雷鳴系', mire: '毒抗與回復系', shade: '暴擊系', iron: '防禦系',
};
const SLOT_KIND = { ...SLOT, ring: '戒指' } as Record<Slot | 'ring', string>;

export const T = {
  signed,
  mult: MULT,
  stat: STAT,
  slot: SLOT,
  /** Gear kinds, for a base's own slot: a ring is one "戒指" here, "戒指 1" / "戒指 2" only where a member's slots are listed. */
  slotKind: SLOT_KIND,
  gold: (n: number) => `${n} G`,
  /** Rarity words (spec §4). Loot lines show the word after a gear name; common gear leaves it out. */
  rarity: RARITY,
  gearLabel: (name: string, rarity: string) => `${name}・${rarity}`,
  /** The rarity word of a starlit piece (plan 5g): 「雙月槍・星輝傳說」. */
  starlitWord: (word: string) => `星輝${word}`,
  /** A gear name with its enhance level: 「鐵劍 +3」; +0 shows nothing extra. */
  enhanced: (name: string, n: number) => (n > 0 ? `${name} +${n}` : name),
  /** The bare 「+3」 for cells too tight for the name and the level together; empty at +0. */
  enhanceTag: (n: number) => (n > 0 ? `+${n}` : ''),
  gear: {
    rarity: RARITY,
    statName: STAT_NAME,
    affix: (key: AnyStat, value: number) => `${STAT_NAME[key]} ${signed(value)}${POINT_STATS.includes(key) ? '' : '%'}`,
    ilvl: (n: number) => `物品等級 ${n}`,
    /** The base bonus line, set apart from rolled affixes on the same stat. */
    implicit: (text: string) => `基礎 ${text}`,
    /** Follows the affix kept by a reforge, in item detail. */
    lockedAffix: '（重鑄鎖定）',
    cannotUse: '此角色無法發動',
    /** A power whose skill is in the wearer's tree but not learned yet. */
    notLearned: '（尚未習得）',
    setBonus: (n: number, text: string) => `${n} 件：${text}`,
    setFour: '（同時擁有 2 件效果）',
    junk: '已標為垃圾',
    weight: (w: number) => `重量 ${w}`,
    /** The detail line of a starlit piece (plan 5g), after its affixes. */
    starlitLine: '星輝：所有詞綴皆為最大值，另多一條詞綴',
  },
  tabs: { guild: '公會', shop: '商店', inn: '旅館', depart: '出發' },
  shop: {
    sell: '賣出素材', sellOne: '賣 1 個', sellAll: '全部賣出', buy: '購買', nothing: '沒有可賣的素材',
    needs: (name: string, n: number) => `需賣出 ${name} ×${n}`, price: (name: string, n: number) => `${name}（${n} G）`,
  },
  inn: { rest: (cost: number) => `住宿並存檔（${cost} G）`, revive: (name: string, cost: number) => `復活 ${name}（${cost} G）` },
  departTo: (n: number, name: string) => `前往第 ${n} 層：${name}`,
  reasons: {
    gold: '金錢不足', full: '背包已滿', locked: '尚未解鎖', stock: '數量不足', invalid: '無法執行', phase: '現在不能這麼做',
    'party-down': '出戰成員全部倒下，無法出發', size: '編隊格數錯誤', 'not-recruited': '尚未遇見', 'no-hero': '洛恩必須出戰',
    duplicate: '同一人不能重複上陣', empty: '至少要有一人出戰', 'too-many': '最多只能 5 人上陣',
    mats: '素材不足', max: '已經強化到最高了', affixLocked: '這件裝備只能重鑄標著（重鑄鎖定）的詞綴，其他詞綴不可重鑄', none: '沒有可以換的詞綴',
    heavy: '太重了，冒險背包裝不下', lineup: '迷宮裡只能調整站位，不能換人', tp: 'TP 不足', 'no-effect': '沒有需要回復的人',
    down: '倒下的人不能行動', 'not-learned': '還沒學會這個技能',
  } as Record<string, string>,
  notices: {
    'save-reset': '存檔無法讀取，已開始新遊戲', wipe: '全滅……冒險背包遺失在迷宮裡，身上的金幣也少了四分之一。',
    saved: '已存檔', 'save-failed': '存檔失敗：瀏覽器不允許儲存', lamp: '歸還之燈的光芒把隊伍帶回了城鎮。', banked: '平安回城，冒險背包裡的戰利品已經入庫。',
    'tree-reworked': '技能樹改版了：技能點已照標準配點重新分配，下一次在旅館重置配點免費。',
  },
  map: {
    returnTown: '回城', lamp: (n: number) => `歸還之燈 ×${n}`,
    danger: { green: '安全', yellow: '注意', red: '危險' },
    floor: (n: number, name: string) => `第 ${n} 層　${name}`,
    cleared: (exp: number) => `踏破獎勵：經驗值 +${exp}`,
    chest: (name: string, qty: number) => `打開寶箱：${name} ×${qty}`,
    dirs: { up: '↑', down: '↓', left: '←', right: '→' },
  },
  cmd: {
    attack: '攻擊', skill: '技能', defend: '防禦', item: '道具', escape: '逃跑', auto: '全員攻擊', back: '返回',
    choose: (name: string) => `${name} 的行動`, target: '選擇目標', tp: (n: number) => `${n} TP`,
    ultimate: (name: string) => `絕技：${name}`, gauge: (n: number) => `絕技 ${n}%`,
    /** The hero's echo: what it repeats (「殘響」 alone, greyed, when there is nothing); the act's name in the log. */
    echo: (name?: string) => (name ? `殘響：${name}` : '殘響'),
    echoAct: (name: string) => `殘響・${name}`,
    /** What the echo repeats, in numbers (plan 8g ruling 12): the repeated skill's battle line, its percent already in it. */
    echoNote: (pct: number, line: string) => `重現（已含 ${pct}%）：${line}`,
    /** After a skill's name in the battle menu, one for each working rune on it (plan 8g ruling 12). */
    runeMark: '◆',
    /** A skill's note in the battle menu: its final numbers (battleLine), then its words. */
    noteWith: (line: string, desc: string) => `${line}　${desc}`,
    /** After the note when the record left a variant's mechanic extras out (8d final review). */
    echoDropped: '（機制效果不會重現）',
    /** 自動 (plan 8h ruling 15): each member not commanded yet does what her build's policy (or the standard one) says. */
    policy: '自動',
    /** Its note: what each of them will do this round, as it will be done, one member a line. */
    policyNote: (parts: string[]) => parts.join('\n'),
    policyPart: (name: string, what: string) => `${name}：${what}`,
    /** A skill in the note: its name and its numbers as she casts it now (battleLine). */
    policySkill: (skill: string, line: string) => `${skill}（${line}）`,
  },
  battle: {
    win: '勝利！', lose: '全滅……', fled: '成功逃跑', cont: '繼續', poison: '毒', sleep: '睡眠',
    exp: (n: number) => `經驗值 +${n}`, gold: (n: number) => `金錢 +${n}`,
    /** Liz's coins left at a won fight's end, already counted in the gold line. */
    coinGold: (n: number) => `（其中莉茲的銅板換了 ${n}）`, drop: (name: string, n: number) => `${name} ×${n}`,
    leftBehind: (name: string, n: number) => `背包已滿，留下了 ${name} ×${n}`,
    levelUp: (name: string, lv: number) => `${name} 升到 Lv ${lv}`,
    /** Points a level-up brought, each pointing to the status tab where it is spent; the talent part only when there is one. */
    points: (name: string, skill: number, talent: number) =>
      skill === 0 && talent > 0
        ? `${name} 獲得天賦點 ${talent}（狀態→天賦）`
        : `${name} 獲得技能點 ${skill}（狀態→技能樹）${talent > 0 ? `、天賦點 ${talent}（狀態→天賦）` : ''}`,
    /** In place of `points` for a member who follows a build: the points were laid out for her (plan 8h final review I2). */
    followed: (name: string, build: string) => `${name} 已照〈${build}〉配好`,
    weak: (els: string) => `已知弱點：${els}`,
    /** Words that pop over a struck enemy or member. */
    pop: { miss: 'MISS', crit: '暴擊！', weak: '弱點！', resist: '抗性', tp: (n: number) => `+${n} TP` },
    gearLeft: (name: string) => `背包已滿，留下了 ${name}`,
  },
  element: { phys: '物理', fire: '火', ice: '冰', thunder: '雷' },
  /** Ailment names on the battle screen (the region trait `burn` reads 酷熱, so the two never share a word). */
  ailment: AILMENT_NAME,
  /** One ailment as a short label: its name and rounds left (「灼燒3」), a bleed's stacks (「流血×2」); poison and freeze have no number. */
  ailmentChip: (c: AilmentChip) => `${AILMENT_NAME[c.id]}${c.stacks !== undefined ? `×${c.stacks}` : c.turns !== undefined ? c.turns : ''}`,
  /** The ailments a full row folds away, counted: 「+2」. */
  ailmentMore: (n: number) => `+${n}`,
  /** Character mechanics on the battle screen (plan 8c): words under a member or over a foe, and the moments that pop. */
  mech: {
    heat: (n: number) => `熱度${n}`,
    expose: (n: number) => `弱點${n}`,
    mark: '暗記',
    veil: '隱匿',
    /** The field bar (plan 8c Task 3): the barrier up, with its rounds; the moon now and next. */
    ward: (n: number | string, boosted: boolean, bolt = false) => `守之結界${boosted ? '・加倍' : ''}${bolt ? '・雷' : ''}${n}`,
    purify: (n: number | string, bolt = false) => `淨之結界${bolt ? '・雷' : ''}${n}`,
    /** A lasting barrier's word in place of its rounds (常駐, plan 8e). */
    lasting: '常駐',
    /** After a barrier's name in the field bar: 「守之結界・常駐」. */
    lastingTag: '・常駐',
    /** Chizuru's 雷之結界 (plan 8d Task 5): the act line of its round-end strike. */
    thunderWard: '雷之結界',
    moon: (now: string, next: string) => `月相：${now}→${next}`,
    phase: { first: '上弦', full: '滿月', waning: '下弦', new: '新月' },
    /** Liz's coins; a foe she appraised. Sylvie's aim on a foe (locked by the hunter's mark); a pinned foe. */
    coins: (n: number) => `銅板${n}`,
    /** 大手筆's words for the power a coin adds (data/skills.ts; 分期 rewrites the number, plan 8d). */
    coinPower: (n: number) => `每枚威力多 ${n}%`,
    /** A variant's power as its words say it (雙管's 「每下威力 60%」); 雙砲台's added points rewrite it to the sum (8d Task 8 review). */
    notePower: (n: number) => `威力 ${MULT(n)}`,
    /** ... and what it spends: every coin, or a share of them (分期), rounded up. */
    coinSpend: (pct: number) => (pct >= 100 ? '花光所有銅板' : `花掉 ${pct}% 的銅板（進位）`),
    /** 獵人標記's words for the stacks it locks at (her 獵人的耐心 raises it; engine/battle.ts skillFor rewrites it). */
    aimFull: (n: number) => `瞄準直接 ${n} 層`,
    appraised: '估價',
    aim: (n: number) => `瞄準${n}`,
    aimLocked: (n: number) => `瞄準${n}・鎖定`,
    last: '最後行動',
    /** Why a skill is greyed in the menu: its resource is empty. */
    noCoins: '沒有銅板',
    noBarrier: '沒有結界',
    noDevices: '沒有裝置',
    /** 收回 above its first rank: the phase it steps back to stays this many round ends more. */
    recallHold: (n: number) => `倒回的月相再停 ${n} 回合。`,
    /** Scarlet's embers, her cover (受護 on the one she covers), her 贖火's rounds; Safira's beat (the fourth is the finale's). */
    embers: (n: number) => `餘燼${n}`,
    cover: '代受',
    guarded: '受護',
    /** Bobby's devices: their names (the act's label when one runs), the short ones in a word 「砲台2・3」 (level, rounds), a shield's 「護盾12」. */
    device: { turret: '砲台', drone: '無人機', shield: '護盾產生器', mine: '地雷', coil: '線圈' },
    deviceShort: { turret: '砲台', drone: '修機', shield: '盾機', mine: '地雷', coil: '線圈' },
    deviceWord: (name: string, level: number, turns: number) => `${name}${level}・${turns}`,
    shield: (n: number) => `護盾${n}`,
    riposte: (n: number) => `贖火${n}`,
    beat: (n: number) => (n >= 4 ? `拍子${n}・終幕` : `拍子${n}`),
    cue: { overload: '暴走！', again: '還有。', noBarrier: '無結界', counter: '贖火', misstep: '踩空！', finale: '終幕' },
  },
  log: {
    act: (who: string, label: string) => `${who}：${label}`,
    /** A trigger rune's free cast (plan 8e): 「凜的暴擊觸發：飛針！」. */
    trigger: (who: string, rune: string, skill: string) => `${who}的${rune}：${skill}！`,
    damage: (who: string, n: number, mult: number) => `${who} 受到 ${n} 傷害${mult > 1 ? '（弱點）' : mult < 1 ? '（抗性）' : ''}`,
    ko: (who: string) => `${who} 倒下了`,
    heal: (who: string, n: number) => `${who} 回復 ${n} HP`,
    tp: (who: string, n: number) => `${who} 回復 ${n} TP`,
    revive: (who: string) => `${who} 復活了`,
    cure: (who: string) => `${who} 的異常狀態解除了`,
    status: (who: string, s: AilmentShown) => `${who}${STATUS_LINE[s]}`,
    resist: (who: string) => `${who} 沒有受到影響`,
    buff: (who: string, stat: BuffStat, pct: number) => `${who} 的${STAT[stat]}${pct > 0 ? '提升' : '下降'}了`,
    taunt: (who: string) => `${who} 吸引了敵人的注意`,
    asleep: (who: string) => `${who} 正在睡覺`,
    noTp: (who: string) => `${who} 的 TP 不足`,
    noSkill: (who: string) => `${who} 還沒學會這個技能`,
    noLimit: (who: string) => `${who} 的絕技量表還沒滿`,
    escape: (ok: boolean) => (ok ? '成功逃跑了' : '逃跑失敗'),
    poison: (who: string, n: number) => `${who} 因毒受到 ${n} 傷害`,
    dot: (who: string, s: 'burn' | 'bleed', n: number) => `${who} 因${s === 'burn' ? '灼燒' : '流血'}受到 ${n} 傷害`,
    shield: (who: string, n: number) => `${who}的護盾擋下了 ${n} 傷害`,
    mech: (who: string, cue: 'overload' | 'again' | 'no-barrier' | 'counter' | 'misstep' | 'finale', n?: number) => (cue === 'overload' ? `${who}的魔力暴走了！${n ? `反噬 ${n}` : ''}`
      : cue === 'again' ? `${who}：還有。` : cue === 'no-barrier' ? `${who}：沒有結界可以加強` : cue === 'counter' ? `${who}以贖火反擊！`
      : cue === 'misstep' ? `${who}：這一步踩空了呀。` : `${who}的終幕！`),
    frozen: (who: string) => `${who} 被凍住了，動彈不得`,
    miss: (who: string) => `${who} 閃過了攻擊`,
    crit: '（暴擊）',
  },
  ui2: {
    battle: { survive: (left: number) => `撐過去！還有 ${left} 回合` },
    memory: {
      piece: (name: string, n: number) => `找回了${name}的記憶（第${numeral(n)}片）。`,
      shard: (name: string) => `撿到了${name}。`,
      town: (name: string) => `撿到了${name}。`,
    },
    rescue: { waiting: '這層好像還有別人。', stranger: '？？？', joined: (name: string, lv: number) => `${name}（Lv${lv}）加入了隊伍！`, benched: (name: string, lv: number) => `${name}（Lv${lv}）加入了隊伍，在公會待命。` },
    banner: { encounter: '遭遇！', boss: '頭目出現！', win: '勝利！' },
    hints: {
      title: '↑↓ 選擇　Enter 決定　滑鼠也可以操作',
      town: 'Enter／點擊 決定　Esc／右鍵 返回',
      dungeon: '方向鍵／WASD 移動　C 選單　Esc／右鍵 返回',
    },
    title: { newGame: '新遊戲', cont: '繼續', settings: '設定', overwrite: '已有存檔，開始新遊戲會覆蓋它。要繼續嗎？' },
    rows: { front: '前排', middle: '中排', back: '後排' },
    formation: {
      title: '編隊', count: (n: number, max: number) => `上陣 ${n}／${max}`, empty: '空位', reserve: '待命', remove: '移出隊伍',
      who: '要放誰到這一格？',
      rules: [
        '近戰攻擊力：前排 100%、中排 75%、後排 50%。',
        '遠程與魔法攻擊不受站位影響。',
        '近戰敵人只會攻擊最前面有人站著的一排。',
        '敵人的範圍技能會打中整排、整列或十字範圍。',
      ],
      hint: '方向鍵 選格　Enter／點擊 放人　Esc 返回',
      /** The rules shown in the labyrinth, where only the rows move (the bench is in town). */
      fieldRules: [
        '迷宮裡只能調整站位：前、中、後排與同一排的格子。',
        '換人要回公會。',
        '近戰攻擊力：前排 100%、中排 75%、後排 50%。',
        '近戰敵人只會攻擊最前面有人站著的一排。',
      ],
    },
    status: {
      tabs: { stats: '能力', gear: '裝備', skills: '技能', tree: '技能樹', talent: '天賦', ultimate: '絕技' },
      /** Beside a skill's name on the skills page: it can be cast outside battle (SkillDef.field). */
      fieldTag: '迷宮中可用',
      /** Column titles for statSources; a new source needs one line here. */
      sources: { base: '基礎', growth: '成長', gear: '裝備', set: '套裝', talent: '天賦', memory: '記憶', primary: '主屬性' } as Record<string, string>,
      /** A column heading too long for its share of the table: the short word, the whole one in its title (plan 8g Task 5 review). */
      sourcesShort: { primary: '主屬' } as Record<string, string>,
      total: '合計',
      /** Category headings of the stats page, in STAT_CATEGORIES order. */
      cats: { primary: '主屬性', attack: '攻擊', defense: '防禦', element: '元素', resource: '資源', other: '其他' } as Record<StatCategory, string>,
      /** A sheet total: points read bare, every other stat as a percent. */
      value: (key: AnyStat, v: number) => `${v}${POINT_STATS.includes(key) ? '' : '%'}`,
      /** The affinity line under the stats page's primary heading: the affinity primary's name, or affinityAll. */
      affinity: (label: string) => `取向：${label}`,
      /** The hero's affinity: every primary converts. */
      affinityAll: '全能',
      /** Column of the cut a cap takes off a total (an em dash when the stat is under its cap). */
      capCol: '上限',
      targets: TARGETS,
      exp: (n: number, next: number) => `經驗 ${n}／${next}`,
      place: (where: string) => `站位 ${where}`,
      attack: (melee: boolean, pct: number | null) => (!melee ? '攻擊方式 遠程／魔法' : pct === null ? '攻擊方式 近戰' : `攻擊方式 近戰（${pct}%）`),
      gauge: (n: number) => `絕技量表 ${n}%`,
      rank: (r: number, max: number) => `${r}／${max}`, passive: '被動',
      /** In place of a rank: a skill she knows outside her tree (Rin's mark). */
      innate: '天生', tp: (n: number) => `TP ${n}`,
      none: '（未裝備）',
      hint: '←→ 分頁　Q／E 換人　↑↓ 捲動　Esc 返回',
      /** The stats tab's own keys: a row cursor and folding. */
      hintStats: '←→ 分頁　Q／E 換人　↑↓ 選擇　Enter 摺疊　Esc 返回',
      /** The skills tab's keys (plan 8g Task 5): Enter or a click on a skill opens the workshop. */
      hintSkills: '←→ 分頁　Q／E 換人　↑↓ 捲動　Enter／點一招：技能工坊　Esc 返回',
      /** After the TP line, when 常駐 holds some back: the max TP a fight leaves her (plan 8g ruling 9). */
      tpBattle: (n: number) => `（戰鬥中上限 ${n}）`,
      /** A rune on the skills page: what it does to this skill, in the card's final numbers (plan 8g final review). */
      runeLine: (label: string, parts: string[]) => `${label}：${parts.join('・')}`,
      /** In the labyrinth only the members on the field change their runes (plan 8g Task 5 review). */
      fieldOnly: '迷宮中只能調整出戰的成員',
      /** The tree and talent tabs' own keys: a node cursor and the two-press spend. */
      hintTree: '←→ 分頁　Q／E 換人　↑↓ 選擇　Enter 投點　Esc 返回',
      /** The talent tab's own keys: ↑↓ go between the board's rows, Tab along a row (←→ stay the tab switch). */
      hintTalent: '←→ 分頁　Q／E 換人　↑↓ 換列　Tab 換欄　Enter 投點　Esc 返回',
    },
    /** The status screen's talent tab. */
    talent: {
      left: (n: number) => `剩餘天賦點 ${n}`,
      /** Points on the board's normal nodes, against the keystone gate. */
      board: (n: number) => (n >= KEYSTONE_GATE ? `盤面已投 ${n} 點・可選關鍵天賦` : `盤面已投 ${n} 點・${KEYSTONE_GATE} 點後可選關鍵天賦`),
      keystones: (k: number, max: number) => `關鍵天賦 ${k}／${max}`,
      keysHead: (max: number) => `關鍵天賦（限選 ${max} 個）`,
      /** The memory keystone's line under the board (it takes no slot): its name once awake, or what wakes it. */
      memoryKeystone: (name: string) => `記憶關鍵天賦：${name}`,
      memoryLocked: (n: number) => `找回全部 ${n} 片記憶後覺醒`,
      /** Rin's wakes on her oath, not on her pieces. Seen before her reveal, so it names no choice (6c Task 13; lore ledger I-107). */
      memoryLockedRin: '當她不再等待的那天覺醒',
      /** A normal node's bonus per rank, e.g. 「+2／級」; a percent stat carries a % sign. */
      per: (key: AnyStat, v: number) => `${signed(v)}${POINT_STATS.includes(key) ? '' : '%'}／級`,
      /** The notes for a normal node: 「智力 +2／級（目前 +4）」. */
      note: (stat: string, key: AnyStat, v: number, now: number) => {
        const unit = POINT_STATS.includes(key) ? '' : '%';
        return `${stat} ${signed(v)}${unit}／級（目前 ${now ? signed(now) : '+0'}${unit}）`;
      },
      keystone: '關鍵天賦',
      row: (r: number) => `第 ${r} 列`,
      /** A board row's label beside its nodes, read top to bottom: 「第1列」. */
      tier: (r: number) => `第${r}列`,
      /** The adjacency rule, under a normal node's notes while it is shut by it. */
      adjacentRule: '上一列的左上、正上或右上格至少投入 1 點後才能投點',
      /** A node that can take its next rank now. */
      open: '可投點',
      /** Why a node cannot take its next rank (progression canRaiseTalent). */
      reason: {
        unknown: '無法投點', max: '已滿級', points: '點數不足', adjacent: '需相鄰上一列',
        gate: `盤面需 ${KEYSTONE_GATE} 點`, keystones: (max: number) => `關鍵天賦已選滿 ${max} 個`,
      } as Record<Exclude<TalentFail, 'keystones'>, string> & { keystones: (max: number) => string },
      /**
       * A board cell's state beside its bonus, at most 3 wide characters (a keystone cell has no bonus, so its own states take
       * up to 4); the notes under the board give `reason` in full. 已滿級 is a maxed node, 關鍵已滿 the keystone cap.
       */
      cell: {
        open: '可投點', unknown: '不可投', max: '已滿級', points: '缺點數', adjacent: '需相鄰', gate: `需${KEYSTONE_GATE}點`, keystones: '關鍵已滿',
      } as Record<TalentFail | 'open', string>,
      pending: '再按一次投點',
      /** The engine turned a spend down after the page allowed it (e.g. outside town and the labyrinth). */
      failed: '現在無法投點',
    },
    /**
     * The skill workshop (plan 8g): the card's rows before and after a rune, its 附加 lines (what the skill does beyond
     * its rows, read from the skill as it is), the battle menu's summary, the TP lines. Every number is passed in.
     */
    workshop: {
      row: { target: '目標', hits: '段數', element: '屬性', power: '威力', heal: '回復', effect: '效果', turns: '回合', tp: 'TP', hp: 'HP 消耗', tpMax: '戰鬥 TP 上限' },
      /** The status page's target words (TARGETS): one style everywhere. */
      target: TARGETS,
      /** A row one side of the card does not have. */
      none: '—',
      /** Numbers that differ between a skill's effects. */
      join: '／',
      /** A power that strikes every target. */
      each: (v: string) => `${v}（每個目標）`,
      pct: (n: number) => `${n}%`,
      buff: (stat: string, pct: number) => `${stat} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
      guard: (pct: number) => `防禦與魔防 +${pct}%`,
      purify: (n: number) => `每回合回復 ${n}`,
      device: (name: string, n: number) => `${name} 威力 ${n}`,
      expose: '火冰雷弱點',
      add: {
        onHit: (pct: number, ailment: string) => `每段命中 ${pct}% ${ailment}`,
        inflict: (pct: number, ailment: string) => `每次施放 ${pct}% ${ailment}`,
        aftermath: (ailment: string) => `暴擊時必定${ailment}`,
        drain: (pct: number) => `造成傷害的 ${pct}% 回復自己`,
        regain: (n: number) => `每段命中回復 ${n} TP`,
        armorBreak: '無視護甲與格擋',
        cure: '解除異常',
        spill: (pct: number) => `超出的回復變成護盾（最多 ${pct}%）`,
        when: { crit: '她暴擊時', kill: '她擊倒敵人時', struck: '她受到攻擊後' },
        trigger: (when: string, pct: number) => `${when}自動施放（威力 ${pct}%）`,
        twice: (pct: number) => `連續施放兩次，第二次威力 ${pct}%`,
        bounce: (n: number, drop: number) => `彈射 ${n} 次，每次威力 −${drop}%`,
        reprise: (pct: number) => `下一回合結束時再打一次（威力 ${pct}%）`,
        sync: (pct: number) => `下一位隊友本回合的技能威力 +${pct}%`,
        lasting: (pct: number, reserve: number) => `常駐：效果 ${pct}%，保留 ${reserve}% TP 上限`,
        wheel: (a: string, b: string, c: string) => `屬性依${a}、${b}、${c}輪替`,
      },
      /** The battle menu's summary of a skill (plan 8g ruling 12): 「全體・威力 84・火」. */
      battle: { sep: '・', power: (n: number | string) => `威力 ${n}`, heal: (n: number | string) => `回復 ${n}` },
      /** Max TP out of battle and in it, when 常駐 holds some back (plan 8g ruling 9). */
      reserve: (max: number, battle: number, pct: number) => `TP 上限 ${max}，戰鬥中 ${battle}（常駐保留 ${pct}%）`,
      /** Two lasting barriers (plan 8g ruling 10). */
      barrierClash: '兩個常駐結界只會留下一個：被換掉的那個照樣保留 TP 上限',
      /** 「持有 n（袋子 m，鑲嵌中 k）」 (plan 8g ruling 8). */
      owned: (all: number, bag: number, socketed: number) => `持有 ${all}（袋子 ${bag}，鑲嵌中 ${socketed}）`,
      /**
       * What the member a rune is moved from loses (Task 4b review): 「移走後，希爾薇的瞄準射擊：TP 10 → 5；少了「連續施放兩次」」,
       * each changed row by name, each line she no longer has in 「」.
       */
      giver: (who: string, skill: string, items: string[]) => `移走後，${who}的${skill}：${items.length ? items.join('；') : '不受影響'}`,
      /** A card row that changes: 「段數 1 → 2」 (the giver line, the tree's variant preview). */
      change: (row: string, before: string, after: string) => `${row} ${before} → ${after}`,
      giverLost: (line: string) => `少了「${line}」`,
      /** The workshop screen (plan 8g Task 4a). */
      title: '技能工坊',
      skillsHead: '技能',
      slotsHead: '插槽',
      runesHead: '符文',
      now: '現在',
      before: '之前',
      after: '之後',
      slot: (i: number) => `槽 ${i}`,
      slotEmpty: '空',
      slotLocked: (lv: number) => `Lv ${lv} 開放`,
      noSlots: (lv: number) => `Lv ${lv} 才有第一個插槽`,
      noSkills: '還沒有可以裝符文的技能',
      remove: '拆下',
      /** The rune a pick takes out of its slot (plan 8g final review). */
      swapOut: (label: string) => `換下：${label}，回到袋子`,
      /** A power multiplier in a skill's words, dropped from a battle note whose summary gives the final number. */
      powerClause: /[，；、]?(?:每段|每下|回復)?威力 ×[0-9.]+/g,
      /** The rune list's heading over the runes in other slots, and what a move says (plan 8g Task 4b). */
      fromOthers: '從別人身上移過來',
      moved: (label: string, who: string, skill: string) => `從${who}・${skill}移過來：${label}`,
      pick: (i: number) => `要裝進槽 ${i} 的符文`,
      off: (why: string) => `未生效：${why}`,
      emptyBag: '袋子裡沒有符文',
      socketed: (label: string, skill: string) => `${skill}裝上了${label}`,
      removed: (label: string) => `拆下了${label}，回到袋子`,
      backToBag: (label: string) => `，${label}回到袋子`,
      added: (line: string) => `＋${line}`,
      lost: (line: string) => `−${line}`,
      hint: '↑↓ 選擇　Enter 決定　Tab 切換欄　Q/E 換人　R/F 捲動卡片　Esc 返回',
      /** Under the title while she follows a suggested build (plan 8h): its name and the first rule of its play. */
      following: (name: string, line: string) => `跟隨：${name}——${line}`,
      /** Over the rune list: the runes her build suggests for this skill not in its slots yet, each with where it is. */
      lacking: (items: [string, string][]) => `缺：${items.map(([name, where]) => `${name}（${where}）`).join('、')}`,
      /** In place of where a lacking rune is found: one is in the bag already. */
      inBag: '袋子裡有',
      /** Over the rune list: suggested runes the bag holds for this skill's slots, ready to put in (plan 8h final review). */
      ready: (items: [string, string][]) => `可裝：${items.map(([name, where]) => `${name}（${where}）`).join('、')}`,
      /** Over the rune list, a suggested rune the slot refuses (Task 7 review): why, in place of where it is. */
      refusedWhy: (name: string, why: string) => `${name}裝不上：${why}`,
    },
    /** The status screen's skill-tree tab. */
    tree: {
      left: (n: number) => `剩餘技能點 ${n}`,
      /** A branch heading: its name and the points put into it. */
      branch: (name: string, n: number) => `${name}（${n} 點）`,
      kind: { active: '主動', variant: '變招', mech: '機制', passive: '被動', ultimate: '終極' },
      /** Between the two sides of a pair (plan 8d): only one of them holds points. */
      pairTag: '二選一',
      /** The empty side of a pair whose other side holds points: a press moves the points over, free (two presses). */
      swapOpen: '可改選（免費）', swapPending: '再按一次改選', swapped: '已改選',
      /** What learning a variant, or changing to it, does to its skill (plan 8g Task 8): the card's changed rows. */
      preview: (swap: boolean, parts: string[]) => `${swap ? '改選後' : '學會後'}：${parts.join('・')}`,
      /** The empty side of a pair: its rule at the rank the swap brings (all the other side's points). */
      afterSwap: (rank: number, max: number, text: string) => `改選後（${rank}/${max}）：${text}`,
      /** The runes on the skill that would do nothing after learning or changing to this variant (plan 8g final review). */
      runeOff: (labels: string[]) => `之後不再生效：${labels.join('、')}`,
      /** The Game would not change the side now (in battle, say). */
      swapRefused: '現在無法改選',
      /** A node that can take its next rank now. */
      open: '可投點',
      /** Why a node cannot take its next rank (progression canRaiseNode). */
      reason: {
        unknown: '無法投點', max: '已達最高等級', pair: '已選另一個版本', points: '點數不足', req: '需先學會上一階',
        gate: '分支點數不足', capstone: '已選其他終極',
        abyss: (n: number) => `深淵尚未甦醒（需要 ${n} 片記憶）`,
      } as Record<Exclude<RaiseFail, 'abyss'>, string> & { abyss: (n: number) => string },
      pending: '再按一次投點',
      /** The engine turned a spend down after the page allowed it (e.g. outside town and the labyrinth). */
      failed: '現在無法投點',
      capstone: (name: string) => `終極技：${name}`,
      noCapstone: (max: number) => `終極技：未選（限選 ${max} 個）`,
      /** What the next rank of an active node scales: power for damage and heals, the percent for a pure buff or debuff. */
      next: (what: 'power' | 'buff', a: number, b: number) => `下一級：${what === 'power' ? `威力 ${MULT(a)} → ${MULT(b)}` : `效果 ${a}% → ${b}%`}`,
      now: (text: string) => `目前：${text}`,
      nextMod: (text: string) => `下一級：${text}`,
      nextHold: (n: number) => `下一級：倒回的月相再停 ${n} 回合`,
      none: '未投入',
      /** A modifier rank's rewrite in short, e.g. 「威力 120%」「TP −2」「持續 5 回合」. */
      mod: (m: SkillMod): string => [
        m.powerPct !== undefined ? `威力 ${MULT(m.powerPct)}` : '',
        m.powerDelta !== undefined ? `威力 ${signed(m.powerDelta)}%` : '',
        m.buffPct !== undefined ? `效果 ${m.buffPct}%` : '',
        m.tpDelta !== undefined ? `TP ${signed(m.tpDelta)}` : '',
        m.hpCost !== undefined ? `HP 消耗 ${Math.round(m.hpCost * 100)}%` : '',
        m.turns !== undefined ? `持續 ${m.turns} 回合` : '',
        m.turnsDelta !== undefined ? `持續 ${signed(m.turnsDelta)} 回合` : '',
        m.chance !== undefined ? `毒機率 ${Math.round(m.chance * 100)}%` : '',
        m.hits !== undefined ? `${m.hits} 段` : '',
      ].filter(Boolean).join('、'),
    },
    equip: {
      title: '裝備',
      dollTitle: '身上裝備',
      bag: (n: number, max: number) => `背包 ${n}／${max}`,
      /** The labyrinth's bag line: the run pack's pieces and the party's load against its limit. */
      pack: (n: number, w: string, cap: string) => `冒險背包 ${n} 件　重量 ${w}／${cap}`,
      menuBtn: '選單',
      target: (slot: string) => `目標：${slot}`,
      worn: (slot: string, name: string) => `${slot}：${name}`,
      /** The compare heading, short enough for one line: the worn piece's name, or the slot marked empty. */
      versusLabel: '比較：',
      versus: (name: string) => `比較：${name}`,
      versusEmpty: (slot: string) => `比較：${slot}（空）`,
      noChange: '能力不變',
      takeOff: (slot: string) => `Enter 卸下${slot}的裝備`,
      pickSlot: 'Enter 選這一格，再到背包挑裝備',
      emptyCell: '空格',
      full: '背包已滿，無法卸下。先整理背包吧。',
      fullField: '回城時背包放不下了，不能再卸下',
      /** The number of a comparison row: `+11`, `-3%`. */
      delta: (key: AnyStat, v: number) => `${signed(Math.round(v * 10) / 10)}${POINT_STATS.includes(key) ? '' : '%'}`,
      menu: {
        title: '背包選單',
        /** In the labyrinth the grid is the run pack. */
        titleField: '冒險背包選單',
        sort: { rarity: '排序：依稀有度', slot: '排序：依欄位', ilvl: '排序：依物品等級' },
        auto: { off: '自動標記：關閉', common: '自動標記：普通', magic: '自動標記：普通與魔法' },
        current: '使用中',
        mark: (name: string) => `標記垃圾：${name}`,
        unmark: (name: string) => `取消標記：${name}`,
        markNone: '標記垃圾（先選一件）',
        wornNoMark: (name: string) => `標記垃圾：${name}（穿著中）`,
        unequip: (name: string) => `卸下：${name}`,
        /** In the labyrinth, with nothing to take off: sorting and marking wait for town. */
        townOnly: '整理背包要回城才能做',
      },
      hint: '方向鍵 移動　Tab 切換　Enter 決定　C 選單　Q／E 換人　R／F 捲動說明　Esc 返回',
      hintTarget: 'Enter 穿上　選空格 卸下　Esc 取消目標',
      hintTargetFull: 'Enter 穿上　C 選單 卸下　Esc 取消目標',
      /** In the labyrinth with no room left at home (bag + pack fill the 60 slots): nothing can be taken off. */
      hintTargetFullField: 'Enter 穿上　回城背包已滿，不能卸下　Esc 取消目標',
      hintField: '方向鍵 移動　Tab 切換　Enter 穿上／卸下　C 選單　Q／E 換人　R／F 捲動說明　Esc 返回',
    },
    settings: {
      title: '設定', volume: '音效音量', speed: '文字速度', vibrate: '震動', story: '劇情播放', on: '開', off: '關', fullscreen: '全螢幕', keys: '按鍵說明', back: '返回',
      speeds: { slow: '慢', mid: '中', fast: '快', instant: '立即' } as Record<'slow' | 'mid' | 'fast' | 'instant', string>,
      storyModes: { all: '全部播放', major: '只播重大場景', none: '不自動播放' } as Record<'all' | 'major' | 'none', string>,
      hint: '←→ 調整　點擊 切換　Esc／右鍵 返回',
      close: '點擊或按 Enter／Esc 關閉',
      keyList: [
        ['方向鍵／WASD', '移動游標、在迷宮中行走'],
        ['Enter／Space／Z', '決定、推進對話'],
        ['Esc／X／右鍵', '取消、返回'],
        ['C', '迷宮中開啟選單'],
        ['Q／E', '狀態與裝備畫面換人'],
        ['R／F', '裝備畫面捲動物品說明'],
        ['F11', '全螢幕'],
        ['滑鼠', '點選項目即決定；畫面上的「返回」等同取消'],
      ] as [string, string][],
    },
    story: {
      skipped: (summary: string) => `（略過）${summary}`,
    },
    handbook: {
      title: '冒險者手冊',
      tabs: { memories: '記憶', people: '人物', leads: '線索', town: '鎮民', codex: '圖鑑', truths: '真相' },
      unknown: '？？？', fresh: '新', status: { unknown: '尚未找到', held: '持有中', returned: '已交還' },
      stages: { prologue: '序章', act1: '第一幕', act2: '第二幕', act3: '第三幕', act4: '第四幕', after: '終幕' },
      pieces: (found: number, total: number) => `${found}/${total}`,
      codex: { none: '無', rarity: { legendary: '傳說', unique: '獨特', set: '套裝' }, weak: (list: string) => `弱點：${list}`, weakUnknown: '弱點：？？？', setPieces: (have: number, total: number) => `${have}/${total} 件` },
      pieceHint: (regions: string, deep: boolean) => `${regions}・${deep ? '深處' : '淺層'}`,
      hint: '←→ 換分頁　確定：選取　取消：返回',
      hintReadonly: '←→ 換分頁　確定：重看　取消：回到迷宮',
      empty: '還沒有可以重看的場景。',
      /** The guild's leads (6c Task 16): sightings, never a call for help (the lost remember nothing). */
      leads: { now: '目前的線索', found: '已找到', heard: '公會聽來的目擊', place: (region: string, depth: number) => `${region}・第 ${depth} 層`, allFound: '目擊過的人影，都已經找到了。', none: '公會還沒有新的目擊消息。' },
    },
    town: {
      place: '邊境小鎮 露米亞',
      facilities: { guild: '冒險者公會', shop: '道具店', inn: '旅館', gate: '傳送門廣場', forge: '鍛造屋', handbook: '冒險者手冊', settings: '設定' },
      soon: (name: string) => `${name}的新介面正在製作中，下一階段開放。`,
      toTitle: '要回到標題畫面嗎？上次存檔之後的進度不會保留。',
    },
    facility: {
      guild: { place: '冒險者公會', npc: '安娜' },
      shop: { place: '道具店', npc: '歐里克' },
      inn: { place: '月影旅館', npc: '瑪莎' },
      gate: { place: '傳送門廣場', npc: '葛倫' },
      forge: { place: '鍛造屋', npc: '多蘭' },
      leave: '離開',
    },
    forge: {
      tabs: { dismantle: '分解', enhance: '強化', reroll: '重鑄', fuse: '合成', craft: '製作', runes: '符文合成' },
      wornBy: (name: string) => `（${name}裝備中）`,
      saveFailed: '東西是做好了，可是存檔失敗：瀏覽器不允許儲存。',
      /** An essence tally as one phrase: 「普通精華 ×2、魔法精華 ×1」. */
      yields: (y: Record<string, number>) => Object.entries(y).map(([id, n]) => `${MATERIALS[id]?.name ?? id} ×${n}`).join('、'),
      dismantleMarked: (n: number) => `分解全部已標記（${n} 件）`,
      nothingToDismantle: '背包裡沒有可以分解的裝備。',
      askOne: (label: string, yields: string) => `要分解${label}嗎？
會得到：${yields}`,
      askMarked: (n: number, yields: string) => `要分解已標記的 ${n} 件裝備嗎？
會得到：${yields}`,
      warnPrecious: '裡面有史詩、傳說、獨特、套裝、已強化或有重鑄鎖定詞綴的裝備，分解後無法復原。',
      dismantled: (yields: string) => `分解完成，得到了${yields}。`,
      maxed: '已達上限',
      nothingToEnhance: '沒有可以強化的裝備。',
      levelStep: (from: number, to: number) => `強化　+${from} → +${to}`,
      /** One base-bonus line: 「攻擊 +7.4 → +8.0」, both sides at one precision (`pair`), so a step always reads as a change. */
      baseStat: (name: string, from: number, to: number) => { const [a, b] = pair(from, to); return `${name} +${a} → +${b}`; },
      chance: (pct: number) => `成功率 ${pct}%`,
      failNote: '失敗不會降級，但素材照樣消耗',
      /** Beside a stat the step raises by less than a whole point: the wearer's whole number moves once the fractions add up. */
      accruing: '（累積中）',
      lacking: '（不足）',
      /** 「魔法精華 3／5」: what you have over what is needed. */
      costMat: (name: string, have: number, need: number) => `${name} ${have}／${need}`,
      costGold: (need: number) => `${need} G`,
      costGoldHave: (have: number, need: number) => `${have}／${need} G`,
      /** What is still short, named: 「還缺：魔法精華 ×3、金錢 50 G」. */
      lackNames: (names: string[]) => `還缺：${names.join('、')}`,
      lackMat: (name: string, n: number) => `${name} ×${n}`,
      lackGold: (n: number) => `金錢 ${n} G`,
      askEnhance: (label: string) => `要強化${label}嗎？`,
      enhanceOk: (label: string) => `強化成功！${label}`,
      enhanceFail: (label: string) => `強化失敗了……${label}沒有降級，素材卻用掉了。`,
      nothingToReroll: '沒有可以重鑄的裝備。',
      /** The item list's right column when no affix is locked yet. */
      unlocked: '未鎖定',
      /**
       * Why the other affixes are greyed out once one is locked (the same words as the engine's refusal). In the reroll flow
       * 鎖定 only ever names the affix a reroll is locked to (its mark is T.gear.lockedAffix); the others read 不可重鑄.
       */
      lockedOther: '這件裝備只能重鑄標著（重鑄鎖定）的詞綴，其他詞綴不可重鑄',
      /** The state of every other affix, short enough for a greyed row. */
      lockedShort: '不可重鑄',
      rerollValue: '重抽數值',
      /** Why a starlit piece's 重抽數值 row is greyed out: its affixes are at their maximum already. */
      starlitMaxed: '星輝詞綴已是最大值',
      rerollSwap: '換成其他詞綴',
      /** A swap pinned to a region material: 「火焰核（火焰系）」. */
      rerollWith: (mat: string, group: string) => `換：${mat}（${group}）`,
      rerollNow: (affix: string) => `目前　${affix}`,
      rerollRange: (key: AnyStat, lo: number, hi: number) => `可能的範圍 ${lo}–${hi}${POINT_STATS.includes(key) ? '' : '%'}`,
      rerollPool: (names: string) => `可能換成：${names}`,
      lockWarn: '重鑄之後，這件裝備就只能重鑄這一條詞綴（重鑄鎖定），其他詞綴不可重鑄',
      askReroll: (label: string, affix: string) => `要重鑄${label}的「${affix}」嗎？`,
      /** 「暴擊率 +3% → 暴擊傷害 +18%」: the old affix, then the new one. */
      rerolled: (before: string, after: string) => `重鑄完成！${before} → ${after}`,
      /** The new affix in a reroll result, with a word for which way it went (its colour says the same). */
      rerollTrend: (after: string, up: boolean) => `${after}（${up ? '提升' : '下降'}）`,
      /** A fusion tier row: 「普通 ×3 → 魔法」. */
      fuseTier: (from: Rarity, to: Rarity) => `${RARITY[from]} ×3 → ${RARITY[to]}`,
      /** The 合成 row of the picking layer: 「合成（已選 2／3）」. */
      fuseGo: (n: number) => `合成（已選 ${n}／3）`,
      picked: '已選',
      randomSlot: '隨機欄位',
      /** The confirm: the result's rarity word is filled in (and coloured) by the page. */
      askFuse: (rarity: string) => `要合成嗎？
結果：${rarity}裝備`,
      /** Added to the fuse confirm when an input carries an investment the fusion throws away. */
      warnFuse: '材料裡有已強化或有重鑄鎖定詞綴的裝備，合成後強化與重鑄都會消失。',
      fuseIlvl: (n: number) => `物品等級 ${n}`,
      fuseRandom: '隨機物品',
      fuseRandomIn: (slot: string) => `隨機${slot}`,
      fuseRegionNote: '不會出現限定地區的裝備',
      fuseNeed: '費用：',
      fused: (label: string) => `合成完成！得到了${label}。`,
      craftCats: { item: '消耗品', base: '底材', set: '套裝' },
      /** A consumable row's right column: the shop's price, then the gold crafting one takes. */
      craftRow: (shop: number, cost: string) => `店價 ${shop} G 製作 ${cost}`,
      craftShop: (shop: number) => `店價 ${shop} G`,
      craftLevel: (n: number) => `物品等級 ${n}`,
      magicChance: (pct: number) => `${pct}% 機率為魔法級`,
      craftBagRoom: (n: number) => `背包剩 ${n} 格`,
      craftNeed: '製作費用：',
      askCraftBase: (slot: string) => `要製作${slot}底材嗎？`,
      askCraftSet: (piece: string) => `要製作${piece}嗎？`,
      /** The refusal for a recipe the stores cannot cover: the reason, then what is short. */
      craftLack: (reason: string, names: string[]) => `${reason}。還缺：${names.join('、')}`,
      craftedItem: (name: string, qty: number) => `製作完成！得到了${name} ×${qty}。`,
      crafted: (label: string) => `製作完成！得到了${label}。`,
    },
    dungeon: {
      status: '隊伍狀態', handbook: '冒險者手冊', items: '道具', lamp: (n: number) => `歸還之燈 ×${n}`, close: '關閉', askTown: '要回到城鎮嗎？',
      noItems: '沒有能用的道具。', askLamp: '要使用歸還之燈回到城鎮嗎？', who: (item: string) => `${item}要給誰使用？`, used: (item: string, who: string) => `${who} 使用了${item}。`, menuHint: '選單',
      weight: (now: string, cap: string) => `重量 ${now}／${cap}`,
      bagRoom: (n: number) => `背包剩 ${n} 格，帶回來的裝備放不下就會遺失。`,
      conditionItem: (name: string) => `本次狀況　${name}`, conditionLine: (name: string, desc: string) => `${name}：${desc}`,
      /** The field menu's recovery skills (plan 6f): who casts, which skill, on whom, then one line per member helped. */
      skills: '技能', equip: '裝備', workshop: '技能工坊', formation: '隊形',
      castWho: '誰要施放技能？',
      castWhat: (name: string) => `${name}要施放哪個技能？`,
      castOn: (skill: string) => `${skill}要對誰施放？`,
      cast: (who: string, skill: string) => `${who}施放了${skill}。`,
      healed: (name: string, n: number) => `${name}回復了 ${n} HP。`,
      revived: (name: string) => `${name}站起來了！`,
      noSkills: '沒有可以在迷宮中使用的技能。',
    },
    inn: {
      rest: (cost: number) => `休息（${cost} G）`, revive: '復活', ask: (cost: number) => `住一晚要 ${cost} G，要休息嗎？`,
      respec: '重置配點', askRespec: (name: string, cost: number) => `要重置${name}的技能樹與天賦嗎？
${cost === 0 ? '這次免費' : `需要 ${cost} G`}，點數會全部退回。`,
      /** The respec list's price for a member whose reset is free (the tree rework's, plan 8d). */
      free: '免費',
      respecDone: (name: string) => `${name}的配點已重置，點數可以重新分配了。`, nothingToReset: '還沒有配過點，不需要重置。',
      /** The respec happened but its save did not: a reload would undo it (and give the gold back). */
      respecSaveFailed: (name: string) => `${name}的配點已重置，但存檔失敗了……瀏覽器不允許儲存。`,
      morning: '──隔天早上', saved: '已存檔。', saveFailed: '存檔失敗了……瀏覽器不允許儲存。',
      nobodyDown: '大家都很有精神呢。', revived: (name: string) => `${name} 醒過來了！`,
      /** Plan 8h: the suggested builds screen, after 重置配點. */
      builds: '建議配點',
    },
    /** The suggested builds screen (plan 8h Task 7): each build of a member, what it does and lacks; apply and follow. */
    builds: {
      title: '建議配點', listHead: '配點方案',
      /** Beside the name of the build she follows. */
      following: '跟隨中',
      /** What applying starts (plan 8h ruling 2: following is off until a build is applied). */
      follow: '套用之後會跟隨這套：升級時自動照這套配點，新開的符文槽也從袋子補上。自己動手配點就會停止跟隨。',
      /** On the card of the build she follows: what it does, and how to stop it. */
      followingNow: '正在跟隨這套：升級時自動照這套配點，新開的符文槽從袋子補上。',
      /** Beside the buttons while she follows the build on the card (story depth Task 20): how to stop, by the stop button. */
      stopHint: '想停下來，按「停止跟隨」或自己配點就好。',
      stopFollow: '停止跟隨',
      stopped: (name: string, build: string) => `${name}不再跟隨${build}，配點維持現在的樣子。`,
      apply: (cost: number) => `套用（${cost} G）`,
      applyFree: '套用（免費）',
      applied: (name: string, build: string, placed: number, missing: number, returned: number) =>
        `${name}套用了${build}：鑲上 ${placed} 顆符文${missing ? `，還缺 ${missing} 顆` : ''}${returned ? `，${returned} 顆回到袋子` : ''}。`,
      townOnly: '回城後才能套用',
      /** The confirm (plan 8h ruling 12, Task 7 review): the price, then a line for each thing it changes (`notes`). */
      askApply: (name: string, build: string, cost: number, notes: string[]) =>
        `要讓${name}套用${build}嗎？${cost === 0 ? '免費' : `需要 ${cost} G`}。${notes.map((n) => `\n${n}`).join('')}`,
      /** Points she spent move. */
      reassign: '技能樹與天賦會照這套重新分配。',
      /** No point moves, some are added. */
      addPoints: '會照這套補上技能點與天賦點。',
      /** A rune she wears would not be back in its slot. */
      strip: (name: string) => `${name}身上其他的符文會回到袋子。`,
      /** Below the build's suggested level (ruling E2): on the card and in the confirm. */
      underLevel: (lv: number, min: number) => `目前 Lv ${lv}，建議 Lv ${min} 以上`,
      askStop: (name: string, build: string) => `要讓${name}停止跟隨${build}嗎？\n配點維持現在的樣子，之後升級要自己配點。`,
      /** Where the build is measured to shine (data/builds.ts BuildScenario). */
      scenario: { boss: '擅長：頭目戰', crowd: '擅長：一次對付一大群', long: '擅長：打得久的戰鬥', ordeal: '擅長：更深處的頭目戰' },
      policyHead: '打法',
      /** The tree the build lays out at the top level: its ultimate and the B sides it takes. */
      treeHead: (lv: number) => `技能樹（練到 Lv ${lv}）`,
      ultimate: (names: string[]) => `絕技：${names.join('、')}`,
      noUltimate: '絕技：不學',
      sides: (names: string[]) => `二選一：${names.join('、')}`,
      runesHead: '建議符文',
      noRunes: '不裝符文。',
      /** The mark of a rune in reach (a missing one says 缺 on its own row). */
      have: '◆ 鑲得上（鑲著或袋子裡有）',
      /** What applying costs: the respec's price when her points move; free when they only grow or stay. */
      cost: (n: number) => `費用：${n} G（技能樹與天賦重新分配）`,
      costFree: '費用：免費（技能樹與天賦照這套補上）',
      costFill: '費用：免費（技能樹不變，只補符文）',
      costStrip: '費用：免費（技能樹不變，有些符文會回到袋子）',
      /** The tree tab, following nothing with points left (plan 8h ruling 14). */
      unspentHint: '不想自己配？旅館的『建議配點』可以一鍵套用',
      /** The tree tab's way in, and the build she follows. */
      entry: 'Tab 建議配點',
      followTag: (name: string) => `跟隨：${name}`,
      hint: '↑↓ 選擇　←→ 換按鈕　Enter 決定　Q/E 換人　R/F 捲動　Esc 返回',
      /** One button: no ←→. */
      hintOne: '↑↓ 選擇　Enter 決定　Q/E 換人　R/F 捲動　Esc 返回',
    },
    gate: {
      reroll: '重抽傳送門',
      /** The portal of the guild's lead, and where someone was sighted (6c Task 16): a sighting, never a distress call. */
      lead: '公會的線索', leadAt: (depth: number) => `線索・第 ${depth} 層`, sighted: (depth: number) => `目擊・第 ${depth} 層`,
      choose: '選擇傳送門', floor: (n: number, name?: string) => (name ? `第 ${n} 層 ${name}` : `第 ${n} 層`),
      suggest: (lv: number) => `建議 Lv ${lv}`,
      heavy: (now: string, cap: string) => `超重！重量 ${now}／${cap}，出發後撿不了任何東西`,
      bagLow: (free: number) => `背包只剩 ${free} 格空位，放不下的裝備只能先留在寶箱裡`,
      depthTitle: '起始深度', deepest: (n: number) => `最深 第 ${n} 層`, notYet: '尚未進入',
      element: (name: string | null) => (name ? `${name}屬性` : '無屬性'),
      traits: { burn: '酷熱', chill: '降速', swift: '迅捷', poison: '劇毒', evasive: '閃避', armored: '堅甲' } as Record<string, string>,
      noTrait: '無特性', weak: (els: string) => `弱 ${els}`, resist: (els: string) => `抗 ${els}`,
      /** A run that can only start at depth 1: the region resist is not there yet (scaling.REGION_TRAITS_FROM). */
      resistFrom: (els: string, depth: number) => `抗 ${els}（第 ${depth} 層起）`,
      monsters: '怪物', condition: '本次狀況', gear: '限定裝備', gearCount: (n: number, total: number) => `限定裝備 ${n}／${total}`, general: (n: number, total: number) => `通用傳說：已取得 ${n}／${total}`, moreGear: '↑↓ 捲動看更多', unknownGear: (name: string) => `${name}（未取得）`, unknownTag: '未取得',
      drop: (name: string) => `主要掉落：${name}`, commonDrop: '一般素材', dropUse: (list: string) => `用途：${list}`,
      ask: (region: string, n: number, cond: string) => `要從第 ${n} 層進入「${region}」嗎？\n本次狀況：${cond}`,
      banner: (cond: string) => `本次狀況　${cond}`,
      hint: '←→ 選擇　Enter／點擊 決定　Esc／右鍵 返回',
    },
    event: {
      leave: '離開',
      fountain: { title: '泉水', desc: '清澈的泉水湧出。喝下能回復全隊 HP 與 TP 的 30%，每趟只能喝一次。', drink: '飲用', done: '喝下泉水，全隊的 HP 與 TP 回復了。' },
      merchant: { title: '流浪商人', gold: (n: number) => `持有 ${n} G` },
      altar: {
        title: '祭壇', accept: '接受', decline: '拒絕',
        cost: (hpPct: number | undefined, gold: number | undefined) => `代價：${[hpPct ? `全隊 HP ${hpPct}%` : '', gold ? `${gold} G` : ''].filter(Boolean).join('、')}`,
        gain: (stat: string, pct: number) => `收益：全隊${stat} +${pct}%（本趟有效）`,
        done: '祭壇的光芒流進隊伍的身體。', refused: '祭壇沒有回應……可能是付不起代價，或這項能力已經提升到上限了。',
      },
      vault: {
        title: '寶庫', locked: '厚重的寶庫上了鎖。需要這一層的鑰匙。', ready: '用這一層的鑰匙可以打開寶庫。', open: '開啟',
        opened: (list: string) => `打開寶庫：${list}`, failed: '寶庫打不開。需要這一層的鑰匙。',
      },
      elite: { title: '菁英怪', desc: '房間中央有一隻強大的敵人（★）。', ask: '要挑戰嗎？', fight: '挑戰' },
      trap: {
        hurt: (n: number) => `陷阱！全隊受到 ${n} 點傷害。`,
        poison: (n: number, tp: number) => `毒氣陷阱！全隊受到 ${n} 點傷害${tp > 0 ? `，TP 最多減少 ${tp}` : ''}。`,
      },
      key: '撿到了寶庫的鑰匙。',
      pickedUp: (name: string) => `撿起了 ${name}。`,
      stairs: {
        title: (n: number) => `前往第 ${n} 層？`, level: (lv: number) => `建議等級 Lv ${lv}`,
        warn: '隊伍等級不足，可能會很危險', go: '前往', stay: '留在這層',
      },
      full: {
        title: '背包已滿', desc: (name: string, qty: number, need: number) => `${name} ×${qty} 放不下（還差重量 ${need}）。`, which: '要丟掉什麼來換？',
        keep: '先留在這裡', ask: (name: string, n: number) => `要丟掉 ${name} ×${n} 嗎？`,
        freed: '空出位置了。再走回寶箱那一格就能撿起來。', left: '先把它留在原地吧。',
        bagTitle: (n: number) => `背包已滿（${n} 件）`, bagDesc: (name: string) => `${name} 放不下：背包沒有空位了。`,
        whichGear: '要丟掉哪件裝備來騰出空位？', askGear: (name: string) => `要丟掉 ${name} 嗎？`,
        noGear: '冒險背包裡沒有能丟的裝備，這件只能先留在原地。',
        gearHeavy: (name: string, need: number) => `${name} 放不下（還差重量 ${need}）。`,
        fragments: (names: string) => `還有 ${names} 也放不下。`,
      },
    },
    home,
    banked: (viaLamp: boolean, list: string) => `${home(viaLamp)}帶回了：${list}。`,
    bankedLost: (n: number, list: string) => `背包已滿（${n} 件），沒能帶回：${list}。`,
    shop: {
      buy: '購買', sell: '販賣', runes: '符文', owned: (n: number) => `持有 ${n}`, bagFull: (n: number) => `背包已滿（${n} 件）`, needs: (text: string) => `需要 ${text}`,
      bought: (name: string, n: number) => `${name} ×${n}，謝謝惠顧！`, sold: (name: string, n: number, g: number) => `收下 ${name} ×${n}，這是 ${g} G。`,
      unlocked: (names: string) => `託你的福，現在可以做出 ${names} 了！`, nothing: '沒有可以賣的素材。',
      pages: { mats: '素材', gear: '裝備' }, nothingGear: '沒有可以賣的裝備。', marked: '已標記',
      sellJunk: (n: number, g: number) => `賣出全部雜物（${n} 個，${g} G）`, soldJunk: (n: number, g: number) => `收下 ${n} 個雜物，這是 ${g} G。`, junkTag: '雜物',
      /** The sell-all row's detail: one line per junk material. */
      junkHead: '要賣出的雜物', junkLine: (name: string, n: number, g: number) => `${name} ×${n}　${g} G`,
      sellMarked: (n: number) => `賣出全部已標記（${n} 件）`,
      askMarked: (n: number, g: number) => `要賣出已標記的 ${n} 件裝備，共 ${g} G 嗎？`,
      askOne: (name: string, g: number) => `要賣出 ${name}（${g} G）嗎？`,
      /** Added to a sell confirm when a piece is enhanced or reforged: the price counts neither. */
      warnInvested: '裡面有已強化或有重鑄鎖定詞綴的裝備：售價不計強化與重鑄，賣出後無法復原。',
      soldGear: (n: number, g: number) => `收下 ${n} 件裝備，這是 ${g} G。`,
    },
    /** The guild's fragment exchange: sell, absorb, and give townsfolk fragments back. */
    exchange: {
      title: '碎片交易所', sell: '販售無主碎片', absorb: '吸收無主碎片', give: '交還鎮民碎片', who: '要讓誰吸收？',
      count: (n: number, cap: number) => `已吸收 ${n}／${cap}`, full: '已經吸收不了更多了。', none: '沒有可以交還的碎片。',
      /** The question before a shard goes into a member. */
      absorbAsk: (shard: string, name: string) => `要讓 ${name} 吸收${shard}嗎？`,
      /** What the shard gave, after the stranger's line: 「攻擊 +2」. */
      gain: (stat: string, amount: number) => `${stat} +${amount}`,
      giveAsk: (name: string) => `要把${name}還給本人嗎？`,
      /** After a return: what the owner paid. */
      reward: (parts: string) => `作為謝禮，收下了 ${parts}。`,
      absorbFail: { cap: '已經吸收不了更多了。', stock: '手上沒有這種碎片了。', invalid: '這個人還沒加入隊伍，或這不是能吸收的碎片。' } as Record<string, string>,
      giveFail: { invalid: '已經還給本人了。', stock: '手上沒有這個碎片了。' } as Record<string, string>,
    },
    guild: {
      formation: '編隊', recall: '召回', equip: '裝備', status: '狀態', tree: '技能樹', talent: '天賦', workshop: '技能工坊',
      recallAsk: (name: string) => `要讓 ${name} 回到隊伍嗎？`, swapWho: '要讓誰回公會待命？', swapOut: (name: string) => `${name} 回公會待命`, welcomeBack: (name: string) => `歡迎回來，${name}。`,
      roles: {
        noel: '後排。火、冰、雷攻擊；降低敵人能力、毒。', chizuru: '前排。全體攻擊；我方減傷。', liz: '前或後。多段攻擊；降低遇敵、素材掉落加成。',
        sylvie: '後排。單體高傷；先制攻擊、提高逃跑率。', scarlet: '前排。吸引攻擊、替隊友擋傷；消耗 HP 打火屬性大傷害。',
        selene: '後排。治療、復活、解毒；催眠。', safira: '前排。多段攻擊、提高閃避；全隊增益。', bobby: '後排。放置砲台每回合攻擊；道具效果加倍、護盾。',
        rin: '靜默的短刃使。暗器牽制，對受傷的敵人背刺，處決殘血的目標。',
        hero: '從迷宮深處走出來的人。什麼都能學，五條分支任意組合。',
      } as Record<string, string>,
    },
  },
  forge: {
    kind: { essence: '精華', monster: '怪物素材', region: '地區素材', rare: '稀有素材', junk: '雜物' } as Record<MaterialKind, string>,
    group: FORGE_GROUP,
    use: (u: MaterialUse): string => {
      switch (u.kind) {
        case 'enhance': return `強化 +${u.level}`;
        case 'reroll': return `重鑄${RARITY[u.tier]}裝備`;
        case 'legendaryReroll': return '重鑄傳說裝備';
        case 'regionReroll': return `重鑄時指定${FORGE_GROUP[u.region]}詞綴`;
        case 'fuseSlot': return `合成${RARITY[u.target]}時指定欄位`;
        case 'consumable': return ITEMS[u.item]?.name ?? u.item;
        case 'base': return `${SLOT_KIND[u.slot]}打造`;
        case 'set': return `${SETS[u.set]?.name ?? u.set}打造`;
        case 'unlock': return `${EQUIPMENT[u.base]?.name ?? u.base}解鎖`;
      }
    },
    usedFor: (list: string) => `用於：${list}`,
    /** The portal card's short form: the same kinds as `use`, one word each, so a line fits the card. */
    useShort: (u: MaterialUse): string => {
      switch (u.kind) {
        case 'enhance': return '強化';
        case 'reroll': case 'legendaryReroll': return '重鑄裝備';
        case 'regionReroll': return `重鑄${FORGE_GROUP[u.region].replace(/系$/, '').split('與')[0]}詞綴`;
        case 'fuseSlot': return '合成指定欄位';
        case 'consumable': return ITEMS[u.item]?.name ?? u.item;
        case 'base': return `${SLOT_KIND[u.slot]}打造`;
        case 'set': return SETS[u.set]?.name ?? u.set;
        case 'unlock': return `${EQUIPMENT[u.base]?.name ?? u.base}解鎖`;
      }
    },
    junkOnly: '雜物：只能賣錢',
  },
  /** Runes (plan 8e): a skill's tags, and the one line that says why a rune does not fit (engine/runes.ts runeWhy). */
  rune: {
    tag: {
      damage: '傷害', heal: '治療', buff: '增益', debuff: '減益', ailment: '異常', device: '裝置', single: '單體', all: '全體', self: '自身',
      multi: '多段', melee: '近戰', ranged: '遠程', attack: '武技', spell: '法術', phys: '物理', fire: '火', ice: '冰', thunder: '雷', tp: '消耗 TP',
    } satisfies Record<Tag, string>,
    why: {
      /** 「需要：單體＋傷害，或單體＋治療」: each list is one way to fit, its tags all needed. */
      needs: (ways: string[]) => `需要：${ways.join('，或')}`,
      and: '＋',
      /** After an element an element rune can give (spec §6.2): 「需要：火（可由屬性符文提供）＋傷害」. */
      fromRune: '（可由屬性符文提供）',
      group: RUNE_GROUP,
      same: RUNE_SAME,
      revive: '不能用在復活',
      scatter: '隨機目標的招不能改形狀',
      pure: '只能用在只有增益的招',
      noHeal: '需要：回復效果',
      /** A trigger rune on a skill with no plain effect (plan 8h ruling 11b). */
      plain: '需要：傷害、治療或增益這類一般效果（觸發不會打出結界、裝置這些機制）',
    },
    /** Why a rune cannot go into a socket (engine/sockets.ts SocketFail); `reserve` takes RESERVE_CAP. */
    fail: {
      none: '袋子裡沒有這個符文',
      slot: '這一招還沒有這個插槽',
      same: RUNE_SAME,
      group: RUNE_GROUP,
      reserve: (cap: number) => `常駐保留的 TP 上限已經到 ${cap}%`,
      /** Socketing or moving outside town and the labyrinth's field (plan 8g ruling 19), and moving from an empty slot. */
      invalid: '現在不能換符文',
      empty: '這個槽是空的',
      /** Trading runes (plan 8f, engine/runeTrade RuneTradeFail); `gold` uses T.reasons.gold. */
      closed: '在迷宮打倒頭目之後才有符文',
      full: (n: number) => `這個符文已經 ${n} 個了`,
      stock: '袋子裡沒有這麼多',
      /** Fusion (plan 8f Task 5): an epic or legendary rune, and the essence it lacks by name. */
      top: '這一階不能再合成',
      essence: (name: string) => `缺少${name}`,
      /** A fusion short of runes in the bag: 「袋子 2／需要 3」. */
      fuseStock: (have: number, need: number) => `袋子 ${have}／需要 ${need}`,
    },
    /** The battle log's act for 雙重詠唱's second cast and for a 回聲 (plan 8e Task 5). */
    again: (name: string) => `${name}（第二次）`,
    /** After 常駐's sentence on a barrier skill (plan 8e Task 7). */
    lastingBarrier: '再施放一次會換掉它。',
    /**
     * The rune tutorial (plan 8g Task 6), told once by the narrator: after the battle that first gave a rune, or on the first
     * workshop visit of a player who already holds one. `levels` are RUNE_SLOT_LEVELS; `town` and `field` name the guild's
     * and the field menu's 技能工坊.
     */
    tutorial: (levels: readonly number[], town: string, field: string): string[] => [
      '你得到了符文！符文會改變一招「怎麼打」：單體變全體、一段變多段，或加上異常與觸發。',
      `每一招都有插槽：角色在 Lv ${levels.join('／')} 時各開一格。`,
      `到公會的「${town}」或迷宮選單的「${field}」把符文裝上；裝之前就會看到這一招之前 → 之後的數字。`,
      '戰鬥外隨時都能免費拆下、換到別招或別人身上，符文不會壞，也不會不見。',
    ],
    /**
     * What else a rune says on this skill (plan 8g ruling 15): the ailment the skill already has, at its own chance, and
     * the ailment 餘波 brings on this skill's element.
     */
    notes: {
      merged: (pct: number, ailment: string) => `這招本來就有 ${pct}% ${ailment}，取較高的一個`,
      sure: (ailment: string) => `這招本來就必定${ailment}`,
      aftermath: (element: string, ailment: string) => `這招是${element}屬性：暴擊時必定${ailment}`,
    },
    /** A skill's words for its element, 「火屬性」: rewritten when an element rune changes it (plan 8g ruling 14). */
    elementWord: (element: string) => `${element}屬性`,
    /**
     * A variant's per-hit note (data/trees), and the same note once 重擊 folds the hits into one, its power the sum (plan
     * 8g Task 2 review). `pct` may be a pattern: applyRunes finds the note through it.
     */
    perHitNote: (hits: number | string, times: string) => `改為 ${hits} 段，每段威力 ${times}`,
    foldedHits: (hits: number, pct: number) => `合為 ${hits} 段，威力 ${MULT(pct)}`,
    reprise: (name: string) => `${name}的回聲`,
    /** A rune as every screen names it (plan 8f): 「擴散（魔法）」, the tier in the gear's rarity words. */
    label: (id: RuneId, tier: RuneTier) => `${RUNES[id].name}（${RARITY[tier]}）`,
    /** The tier part of a label, kept whole where a long name is cut (plan 8g final review). */
    tierTag: (tier: RuneTier) => `（${RARITY[tier]}）`,
    /** A rune found in a fight, a chest or a vault. */
    got: (label: string) => `得到符文：${label}`,
    /** A rune found with `n` (RUNE_STACK) already owned: paid as its sell price instead (plan 8f ruling 7). */
    overStack: (label: string, n: number, gold: number) => `${label}已經 ${n} 個，換成 ${gold} G`,
    /** The shop's rune rows (plan 8f): 「100 G　持有 3」 to buy, 「收購 25 G　持有 3」 to sell; 持有 counts the socketed ones too. */
    buyRight: (price: number, owned: number) => `${price} G　持有 ${owned}`,
    sellRight: (price: number, owned: number) => `收購 ${price} G　持有 ${owned}`,
    /** How many are in the bag: only these can be sold or fused. */
    bag: (n: number) => `袋子 ${n}`,
    socketedNote: (k: number) => `其中 ${k} 個鑲嵌中，先拆下才能賣或合成`,
    /** The heading over the shop's sell rows, which takes no cursor. */
    sellHead: '收購',
    /** A fusion as one line: 「3 個擴散（普通）＋30 G＋普通精華 → 擴散（魔法）」. */
    fuseLine: (n: number, from: string, gold: number, essence: string, to: string) => `${n} 個${from}＋${gold} G＋${essence} → ${to}`,
    askFuse: (line: string) => `${line}\n要合成嗎？`,
    fused: (label: string) => `合成了 ${label}！`,
    /** The rune tab with nothing in the bag to fuse. */
    fuseEmpty: '袋子裡沒有可合成的符文。三個同名同階的符文，可以合成一個高一階的符文。',
  },
  /** The suggested builds (plan 8h): the standard build's name and line, and a policy's words, one sentence a rule. */
  build: {
    standard: { name: '標準', intro: '照預設的配點走，不裝符文：補血優先，其他時候放最強的招。' },
    gauge: { heat: '熱度', coins: '銅板', aim: '瞄準層數', embers: '餘燼' },
    /** After a build's line when it is suggested from a level (ruling E2). */
    minLevel: (lv: number) => `（建議 Lv ${lv} 以上）`,
    /** Where a missing rune is found. */
    from: { shop: '道具店有賣', drop: '打怪、寶箱掉落', legendary: '菁英、頭目掉落' },
    missing: (name: string, from: string) => `缺：${name}（${from}）`,
    later: (name: string, lv: number) => `${name}：Lv ${lv} 起`,
    /** A rune whose skill waits for the hero's memories (his abyss skills). */
    laterMemories: (name: string, n: number) => `${name}：記憶 ${n} 段後`,
    /** A rune the slot refused (常駐's reserve, or a clash with a rune already there). */
    refused: (name: string) => `${name}：這一格裝不上`,
    /** Changes by hand stopped them following their builds (several at once, in the order they stopped). */
    followEnded: (names: string[]) => `${names.join('、')}不再跟隨建議配點。`,
    rule: {
      none: '沒有特別的規則：補血優先，其他時候放最強的招。',
      ensureBarrier: (names: string[], big: boolean, below?: number) =>
        `${big ? (below !== undefined ? `頭目或菁英剩不到 ${below}% HP 時，` : '有頭目或菁英時，') : ''}結界快結束就重新架起${names.join('或')}。`,
      ensureDevice: (names: string[], big: boolean) => `${big ? '有頭目或菁英時，' : ''}裝置快停了就重新設置（${names.join('、')}）。`,
      ensureMark: (name: string, big: boolean, below?: number) =>
        `先用${name}記住${below !== undefined ? `剩不到 ${below}% HP 的` : ''}${big ? '頭目或菁英' : '敵人'}。`,
      alternate: (repeat: boolean) => (repeat ? '跟著拍子換招，只剩一招時照樣出招。' : '跟著拍子換招。'),
      spendAt: (gauge: string, min: number, name: string, ofMaxHp: boolean) =>
        `${gauge}${ofMaxHp ? `累積到最大 HP 的 ${min}%` : `到 ${min}`} 就放${name}，之前先留著。`,
      healBelow: (pct: number) => `有人 HP 低於 ${pct}% 就先補血。`,
      strongest: (aoe: boolean) => (aoe ? '其他時候放打得最多的招（看威力，也看打到幾個）。' : '其他時候放威力最高的招。'),
      ensureTaunt: (name: string) => `挑釁快結束就再用${name}。`,
      ensureCover: (name: string) => `用${name}護住 HP 比例最低的隊友。`,
      releaseAt: (min: number, name: string) => `結界還剩 ${min} 回合以上（或常駐）就用${name}解放。`,
      atPhase: (phase: string, name: string) => `${phase}時放${name}。`,
      executeBelow: (pct: number, name: string) => `敵人剩不到 ${pct}% HP 就用${name}收尾，先挑暗記中的。`,
      castUnlessLast: (name: string) => `上一招不是${name}就放${name}。`,
      castWhen: (name: string, big: boolean, whileAbsent: boolean) =>
        `${big ? '有頭目或菁英時，' : ''}${whileAbsent ? `${name}的效果不在了就放` : `能放就放${name}`}。`,
      echo: '同伴剛放的招比自己最強的招還強時，用殘響重現它。',
      echoAt: (pct: number) => `同伴剛放的招有自己最強的招的 ${pct}% 以上時，用殘響重現它。`,
    },
  },
  clear: { back: '繼續' },   // the Act 1 card's title and body are story copy: STORY.act1Card
  /** The finale's closing card; its text is the finale scene's summary. */
  ending: { back: '繼續' },   // its title is STORY.endingTitle
};
