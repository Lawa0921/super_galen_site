import type { RaiseFail, TalentFail } from '../engine/progression';
import type { StatCategory } from '../engine/stats';
import type { SkillMod } from './gear';
import { KEYSTONE_GATE, MAX_KEYSTONES } from './talents';
import { EQUIPMENT } from './equipment';
import { ITEMS } from './items';
import { MATERIALS } from './materials';
import { SETS } from './gear';
import type { RegionId } from './regions';
import type { MaterialUse } from '../engine/forge/uses';
import type { MaterialKind } from '../engine/types';
import type { AnyStat, BuffStat, Rarity, Slot, StatKey, Target } from '../engine/types';

const STAT: Record<StatKey, string> = { hp: 'HP', tp: 'TP', atk: '攻擊', def: '防禦', mag: '魔力', res: '魔防', spd: '速度' };
const SLOT: Record<Slot, string> = {
  weapon: '武器', offhand: '副手', head: '頭部', body: '身體', hands: '手部', feet: '腳部', neck: '項鍊', ring1: '戒指 1', ring2: '戒指 2',
};

const RARITY: Record<Rarity, string> = { common: '普通', magic: '魔法', rare: '稀有', legendary: '傳說', unique: '獨特', set: '套裝' };
/** Every stat's name: the seven base names come from STAT, so they are written once. */
const STAT_NAME: Record<AnyStat, string> = {
  ...STAT,
  str: '力量', int: '智力', agi: '敏捷', wil: '意志',
  crit: '暴擊率', critDmg: '暴擊傷害', vuln: '弱點傷害', eliteDmg: '對精英傷害', multi: '連擊率',
  armor: '護甲', evasion: '閃避', block: '格擋率', meleeDR: '近戰減傷', rangedDR: '遠程減傷',
  fireRes: '火抗', iceRes: '冰抗', thunderRes: '雷抗', fireDmg: '火焰傷害', iceDmg: '冰霜傷害', thunderDmg: '雷電傷害',
  poisonRes: '毒抗', sleepRes: '睡眠抗性',
  tpRegen: 'TP 回復', tpCost: 'TP 消耗減少', gauge: '絕技充能', heal: '治療效果',
  goldFind: '金幣掉落', matFind: '素材掉落', expBonus: '經驗加成',
};
/** Stats that read as points; every other stat reads as a percent. */
const POINT_STATS: AnyStat[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd', 'str', 'int', 'agi', 'wil', 'armor', 'evasion', 'tpRegen'];

/** A stat change as shown to the player: `+5`, `−3` (the minus sign U+2212, never a hyphen), `0`. */
const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

/** The homecoming sentence, alone or ahead of what came home. */
const home = (viaLamp: boolean) => (viaLamp ? '歸還之燈的光芒把隊伍帶回了城鎮。' : '平安回城。');

const FORGE_GROUP: Record<RegionId, string> = {
  mainline: '', blaze: '火焰系', frost: '冰霜系', storm: '雷鳴系', mire: '毒抗與恢復系', shade: '暴擊系', iron: '防禦系',
};
const SLOT_KIND = { ...SLOT, ring: '戒指' } as Record<Slot | 'ring', string>;

export const T = {
  signed,
  stat: STAT,
  slot: SLOT,
  /** Gear kinds, for a base's own slot: a ring is one "戒指" here, "戒指 1" / "戒指 2" only where a member's slots are listed. */
  slotKind: { ...SLOT, ring: '戒指' } as Record<Slot | 'ring', string>,
  gold: (n: number) => `${n} G`,
  /** Rarity words (spec §4). Loot lines show the word after a gear name; common gear leaves it out. */
  rarity: RARITY,
  gearLabel: (name: string, rarity: string) => `${name}・${rarity}`,
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
    'party-down': '出戰成員全部倒下，無法出發', size: '編隊格數錯誤', 'not-recruited': '尚未招募',
    duplicate: '同一人不能重複上陣', empty: '至少要有一人出戰', 'too-many': '最多只能 5 人上陣',
    mats: '素材不足', max: '已經強化到最高了', affixLocked: '這件裝備只能重鑄已鎖定的詞綴', none: '沒有可以換的詞綴',
  } as Record<string, string>,
  notices: {
    'save-reset': '存檔無法讀取，已開始新遊戲', wipe: '全滅……冒險背包遺失在迷宮裡，身上的金幣也少了四分之一。',
    saved: '已存檔', 'save-failed': '存檔失敗：瀏覽器不允許儲存', lamp: '歸還之燈的光芒把隊伍帶回了城鎮。', banked: '平安回城，冒險背包裡的戰利品已經入庫。',
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
  },
  battle: {
    win: '勝利！', lose: '全滅……', fled: '成功逃跑', cont: '繼續', poison: '毒', sleep: '睡眠',
    exp: (n: number) => `經驗值 +${n}`, gold: (n: number) => `金錢 +${n}`, drop: (name: string, n: number) => `${name} ×${n}`,
    leftBehind: (name: string, n: number) => `背包已滿，留下了 ${name} ×${n}`,
    levelUp: (name: string, lv: number) => `${name} 升到 Lv ${lv}`,
    /** Points a level-up brought, each pointing to the status tab where it is spent; the talent part only when there is one. */
    points: (name: string, skill: number, talent: number) =>
      skill === 0 && talent > 0
        ? `${name} 獲得天賦點 ${talent}（狀態→天賦）`
        : `${name} 獲得技能點 ${skill}（狀態→技能樹）${talent > 0 ? `、天賦點 ${talent}（狀態→天賦）` : ''}`,
    weak: (els: string) => `已知弱點：${els}`,
    /** Words that pop over a struck enemy or member. */
    pop: { miss: 'MISS', crit: '暴擊！', weak: '弱點！', resist: '抗性', tp: (n: number) => `+${n} TP` },
    gearLeft: (name: string) => `背包已滿，留下了 ${name}`,
  },
  element: { phys: '物理', fire: '火', ice: '冰', thunder: '雷' },
  log: {
    act: (who: string, label: string) => `${who}：${label}`,
    damage: (who: string, n: number, mult: number) => `${who} 受到 ${n} 傷害${mult > 1 ? '（弱點）' : mult < 1 ? '（抗性）' : ''}`,
    ko: (who: string) => `${who} 倒下了`,
    heal: (who: string, n: number) => `${who} 回復 ${n} HP`,
    tp: (who: string, n: number) => `${who} 回復 ${n} TP`,
    revive: (who: string) => `${who} 復活了`,
    cure: (who: string) => `${who} 的異常狀態解除了`,
    status: (who: string, s: 'poison' | 'sleep') => `${who}${s === 'poison' ? '中毒了' : '睡著了'}`,
    resist: (who: string) => `${who} 沒有受到影響`,
    buff: (who: string, stat: BuffStat, pct: number) => `${who} 的${STAT[stat]}${pct > 0 ? '提升' : '下降'}了`,
    taunt: (who: string) => `${who} 吸引了敵人的注意`,
    turret: (who: string) => `${who} 設置了砲台`,
    asleep: (who: string) => `${who} 正在睡覺`,
    noTp: (who: string) => `${who} 的 TP 不足`,
    noSkill: (who: string) => `${who} 還沒學會這個技能`,
    noLimit: (who: string) => `${who} 的絕技量表還沒滿`,
    escape: (ok: boolean) => (ok ? '成功逃跑了' : '逃跑失敗'),
    poison: (who: string, n: number) => `${who} 因毒受到 ${n} 傷害`,
    miss: (who: string) => `${who} 閃過了攻擊`,
    crit: '（暴擊）',
  },
  ui2: {
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
    },
    status: {
      tabs: { stats: '能力', gear: '裝備', skills: '技能', tree: '技能樹', talent: '天賦', ultimate: '絕技' },
      /** Column titles for statSources; a new source needs one line here. */
      sources: { base: '基礎', growth: '成長', gear: '裝備', set: '套裝', talent: '天賦', primary: '主屬性' } as Record<string, string>,
      total: '合計',
      /** Category headings of the stats page, in STAT_CATEGORIES order. */
      cats: { primary: '主屬性', attack: '攻擊', defense: '防禦', element: '元素', resource: '資源', other: '其他' } as Record<StatCategory, string>,
      /** A sheet total: points read bare, every other stat as a percent. */
      value: (key: AnyStat, v: number) => `${v}${POINT_STATS.includes(key) ? '' : '%'}`,
      /** Column of the cut a cap takes off a total (an em dash when the stat is under its cap). */
      capCol: '上限',
      targets: {
        enemy: '敵方單體', enemies: '敵方全體', ally: '我方單體', allies: '我方全體', self: '自身', deadAlly: '倒下的隊友',
        row: '敵方一排', column: '敵方一列', cross: '十字範圍',
      } as Record<Target, string>,
      exp: (n: number, next: number) => `經驗 ${n}／${next}`,
      place: (where: string) => `站位 ${where}`,
      attack: (melee: boolean, pct: number | null) => (!melee ? '攻擊方式 遠程／魔法' : pct === null ? '攻擊方式 近戰' : `攻擊方式 近戰（${pct}%）`),
      gauge: (n: number) => `絕技量表 ${n}%`,
      rank: (r: number, max: number) => `${r}／${max}`, passive: '被動', tp: (n: number) => `TP ${n}`,
      none: '（未裝備）',
      hint: '←→ 分頁　Q／E 換人　↑↓ 捲動　Esc 返回',
      /** The stats tab's own keys: a row cursor and folding. */
      hintStats: '←→ 分頁　Q／E 換人　↑↓ 選擇　Enter 摺疊　Esc 返回',
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
      keystones: (k: number) => `關鍵天賦 ${k}／${MAX_KEYSTONES}`,
      keysHead: `關鍵天賦（限選 ${MAX_KEYSTONES} 個）`,
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
        gate: `盤面需 ${KEYSTONE_GATE} 點`, keystones: `關鍵天賦已選滿 ${MAX_KEYSTONES} 個`,
      } as Record<TalentFail, string>,
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
    /** The status screen's skill-tree tab. */
    tree: {
      left: (n: number) => `剩餘技能點 ${n}`,
      /** A branch heading: its name and the points put into it. */
      branch: (name: string, n: number) => `${name}（${n} 點）`,
      kind: { active: '主動', mod: '強化', passive: '被動', ultimate: '終極' },
      /** A node that can take its next rank now. */
      open: '可投點',
      /** Why a node cannot take its next rank (progression canRaiseNode). */
      reason: {
        unknown: '無法投點', max: '已達最高等級', points: '點數不足', req: '需先學會上一階',
        gate: '分支點數不足', capstone: '已選其他終極',
      } as Record<RaiseFail, string>,
      pending: '再按一次投點',
      /** The engine turned a spend down after the page allowed it (e.g. outside town and the labyrinth). */
      failed: '現在無法投點',
      capstone: (name: string) => `終極技：${name}`,
      noCapstone: '終極技：未選（限選一個）',
      /** What the next rank of an active node scales: power for damage and heals, the percent for a pure buff or debuff. */
      next: (what: 'power' | 'buff', a: number, b: number) => `下一級：${what === 'power' ? '威力' : '效果'} ${a}% → ${b}%`,
      now: (text: string) => `目前：${text}`,
      nextMod: (text: string) => `下一級：${text}`,
      none: '未投入',
      /** A modifier rank's rewrite in short, e.g. 「威力 120%」「TP −2」「持續 5 回合」. */
      mod: (m: SkillMod): string => [
        m.powerPct !== undefined ? `威力 ${m.powerPct}%` : '',
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
      /** The number of a comparison row: `+11`, `-3%`. */
      delta: (key: AnyStat, v: number) => `${signed(Math.round(v * 10) / 10)}${POINT_STATS.includes(key) ? '' : '%'}`,
      menu: {
        title: '背包選單',
        sort: { rarity: '排序：依稀有度', slot: '排序：依欄位', ilvl: '排序：依物品等級' },
        auto: { off: '自動標記：關閉', common: '自動標記：普通', magic: '自動標記：普通與魔法' },
        current: '使用中',
        mark: (name: string) => `標記垃圾：${name}`,
        unmark: (name: string) => `取消標記：${name}`,
        markNone: '標記垃圾（先選一件）',
        wornNoMark: (name: string) => `標記垃圾：${name}（穿著中）`,
        unequip: (name: string) => `卸下：${name}`,
      },
      hint: '方向鍵 移動　Tab 切換　Enter 決定　C 選單　Q／E 換人　R／F 捲動說明　Esc 返回',
      hintTarget: 'Enter 穿上　選空格 卸下　Esc 取消目標',
      hintTargetFull: 'Enter 穿上　C 選單 卸下　Esc 取消目標',
    },
    settings: {
      title: '設定', volume: '音效音量', speed: '文字速度', vibrate: '震動', on: '開', off: '關', fullscreen: '全螢幕', keys: '按鍵說明', back: '返回',
      speeds: { slow: '慢', mid: '中', fast: '快', instant: '立即' } as Record<'slow' | 'mid' | 'fast' | 'instant', string>,
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
    town: {
      place: '邊境小鎮 露米亞',
      facilities: { guild: '冒險者公會', shop: '道具店', inn: '旅館', gate: '傳送門廣場', forge: '鍛造屋', settings: '設定' },
      lines: ['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。'],
      soon: (name: string) => `${name}的新介面正在製作中，下一階段開放。`,
      toTitle: '要回到標題畫面嗎？上次存檔之後的進度不會保留。',
    },
    facility: {
      guild: { place: '冒險者公會', npc: '安娜', greet: ['歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。'] },
      shop: { place: '道具店', npc: '歐里克', greet: ['歡迎光臨！看看有什麼需要的。', '剛進了新貨喔。'] },
      inn: { place: '月影旅館', npc: '瑪莎', greet: ['辛苦了，要休息一下嗎？', '熱湯已經準備好了。'] },
      gate: { place: '傳送門廣場', npc: '葛倫', greet: ['三座傳送門都開著。要去哪裡？別逞強。', '傳送門今天也在發光。'] },
      forge: { place: '鍛造屋', npc: '多蘭', greet: ['爐火正旺。要拆、要打，還是要重新鍛一回？', '帶素材來了嗎？好鐵配好手藝。'] },
      leave: '離開',
    },
    forge: {
      tabs: { dismantle: '分解', enhance: '強化', reroll: '重鑄', fuse: '合成', craft: '製作' },
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
      warnPrecious: '裡面有傳說、獨特、套裝或已強化的裝備，分解後無法復原。',
      dismantled: (yields: string) => `分解完成，得到了${yields}。`,
      maxed: '已達上限',
      nothingToEnhance: '沒有可以強化的裝備。',
      levelStep: (from: number, to: number) => `強化　+${from} → +${to}`,
      /** One base-bonus line: 「攻擊 6 → 7」. */
      baseStat: (name: string, from: number, to: number) => `${name} ${from} → ${to}`,
      chance: (pct: number) => `成功率 ${pct}%`,
      failNote: '失敗不會降級，但素材照樣消耗',
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
    },
    dungeon: {
      status: '隊伍狀態', items: '道具', lamp: (n: number) => `歸還之燈 ×${n}`, close: '關閉', askTown: '要回到城鎮嗎？',
      noItems: '沒有可以使用的道具。', askLamp: '要使用歸還之燈回到城鎮嗎？', who: (item: string) => `${item}要給誰使用？`, used: (item: string, who: string) => `${who} 使用了${item}。`, menuHint: '選單',
      weight: (now: string, cap: string) => `重量 ${now}／${cap}`,
      bagRoom: (n: number) => `背包剩 ${n} 格，帶回的裝備放不下的會遺失。`,
      conditionItem: (name: string) => `本次狀況　${name}`, conditionLine: (name: string, desc: string) => `${name}：${desc}`,
    },
    inn: {
      rest: (cost: number) => `休息（${cost} G）`, revive: '復活', ask: (cost: number) => `住一晚要 ${cost} G，要休息嗎？`,
      respec: '重置配點', askRespec: (name: string, cost: number) => `要重置${name}的技能樹與天賦嗎？
需要 ${cost} G，點數會全部退回。`,
      respecDone: (name: string) => `${name}的配點已重置，點數可以重新分配了。`, nothingToReset: '還沒有配過點，不需要重置。',
      /** The respec happened but its save did not: a reload would undo it (and give the gold back). */
      respecSaveFailed: (name: string) => `${name}的配點已重置，但存檔失敗了……瀏覽器不允許儲存。`,
      morning: '──隔天早上', saved: '已存檔。', saveFailed: '存檔失敗了……瀏覽器不允許儲存。',
      nobodyDown: '大家都很有精神呢。', revived: (name: string) => `${name} 醒過來了！`,
    },
    gate: {
      choose: '選擇傳送門', floor: (n: number, name?: string) => (name ? `第 ${n} 層 ${name}` : `第 ${n} 層`),
      suggest: (lv: number) => `建議 Lv ${lv}`,
      heavy: (now: string, cap: string) => `超重！重量 ${now}／${cap}，出發後撿不了任何東西`,
      bagLow: (free: number) => `背包只剩 ${free} 格空位，放不下的裝備只能先留在寶箱裡`,
      depthTitle: '起始深度', deepest: (n: number) => `最深 第 ${n} 層`, notYet: '尚未進入',
      element: (name: string | null) => (name ? `${name}屬性` : '無屬性'),
      traits: { burn: '灼燒', chill: '降速', swift: '迅捷', poison: '劇毒', evasive: '閃避', armored: '堅甲' } as Record<string, string>,
      noTrait: '無特性', weak: (els: string) => `弱 ${els}`, resist: (els: string) => `抗 ${els}`,
      /** A run that can only start at depth 1: the region resist is not there yet (scaling.REGION_TRAITS_FROM). */
      resistFrom: (els: string, depth: number) => `抗 ${els}（第 ${depth} 層起）`,
      monsters: '怪物', condition: '本次狀況', gear: '限定裝備', general: (n: number, total: number) => `通用傳說：已取得 ${n}／${total}`, moreGear: '↑↓ 捲動看更多', unknownGear: (name: string) => `${name}（未取得）`,
      drop: (name: string) => `主要掉落：${name}`, commonDrop: '一般素材', dropUse: (list: string) => `用途：${list}`,
      ask: (region: string, n: number, cond: string) => `要從第 ${n} 層進入「${region}」嗎？\n本次狀況：${cond}`,
      banner: (cond: string) => `本次狀況　${cond}`,
      hint: '←→ 選擇　Enter／點擊 決定　Esc／右鍵 返回',
    },
    event: {
      leave: '離開',
      fountain: { title: '泉水', desc: '清澈的泉水湧出。喝下能回復全隊 HP 與 TP 的 30%，每趟只能喝一次。', drink: '飲用', done: '喝下泉水，全隊的 HP 與 TP 回復了。' },
      merchant: { title: '流浪商人', desc: '「旅途中缺什麼嗎？價錢跟城裡一樣。」', gold: (n: number) => `持有 ${n} G` },
      altar: {
        title: '祭壇', accept: '接受', decline: '拒絕',
        cost: (hpPct: number | undefined, gold: number | undefined) => `代價：${[hpPct ? `全隊 HP ${hpPct}%` : '', gold ? `${gold} G` : ''].filter(Boolean).join('、')}`,
        gain: (stat: string, pct: number) => `收益：全隊${stat} +${pct}%（本趟有效）`,
        done: '祭壇的光芒流進隊伍的身體。', refused: '祭壇沒有回應……付不起代價，或這項能力已經提升到上限。',
      },
      vault: {
        title: '寶庫', locked: '厚重的寶庫上了鎖。需要這一層的鑰匙。', ready: '用這一層的鑰匙可以打開寶庫。', open: '開啟',
        opened: (list: string) => `打開寶庫：${list}`, failed: '寶庫打不開。需要這一層的鑰匙。',
      },
      elite: { title: '精英怪', desc: '房間中央有一隻強大的敵人（★）。', ask: '要挑戰嗎？', fight: '挑戰' },
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
        freed: '空出位置了。再走上寶箱一次就能撿起來。', left: '先把它留在原地吧。',
        bagTitle: (n: number) => `背包已滿（${n} 件）`, bagDesc: (name: string) => `${name} 放不下：背包沒有空位了。`,
        whichGear: '要丟掉哪件裝備來騰出空位？', askGear: (name: string) => `要丟掉 ${name} 嗎？`,
        noGear: '冒險背包裡沒有裝備可以丟，這件裝備只能先留在原地。',
        gearHeavy: (name: string, need: number) => `${name} 放不下（還差重量 ${need}）。`,
      },
    },
    home,
    banked: (viaLamp: boolean, list: string) => `${home(viaLamp)}帶回了：${list}。`,
    bankedLost: (n: number, list: string) => `背包已滿（${n} 件），沒能帶回：${list}。`,
    shop: {
      buy: '購買', sell: '販賣', owned: (n: number) => `持有 ${n}`, bagFull: (n: number) => `背包已滿（${n} 件）`, needs: (text: string) => `需要 ${text}`,
      bought: (name: string, n: number) => `${name} ×${n}，謝謝惠顧！`, sold: (name: string, n: number, g: number) => `收下 ${name} ×${n}，這是 ${g} G。`,
      unlocked: (names: string) => `託你的福，現在可以做出 ${names} 了！`, nothing: '沒有可以賣的素材。',
      pages: { mats: '素材', gear: '裝備' }, nothingGear: '沒有可以賣的裝備。', marked: '已標記',
      sellJunk: (n: number, g: number) => `賣出全部雜物（${n} 個，${g} G）`, soldJunk: (n: number, g: number) => `收下 ${n} 個雜物，這是 ${g} G。`, junkTag: '雜物',
      sellMarked: (n: number) => `賣出全部已標記（${n} 件）`,
      askMarked: (n: number, g: number) => `要賣出已標記的 ${n} 件裝備，共 ${g} G 嗎？`,
      askOne: (name: string, g: number) => `要賣出 ${name}（${g} G）嗎？`,
      soldGear: (n: number, g: number) => `收下 ${n} 件裝備，這是 ${g} G。`,
    },
    guild: {
      formation: '編隊', recruit: '招募', equip: '裝備', status: '狀態', tree: '技能樹', talent: '天賦',
      ask: (name: string) => `要讓 ${name} 加入隊伍嗎？`, recruited: (name: string) => `${name} 加入了隊伍！`,
      roles: {
        noel: '後排。火、冰、雷攻擊；降低敵人能力、毒。', chizuru: '前排。全體攻擊；我方減傷。', liz: '前或後。多段攻擊；降低遇敵、素材掉落加成。',
        sylvie: '後排。單體高傷；先制攻擊、提高逃跑率。', scarlet: '前排。吸引攻擊、替隊友擋傷；消耗 HP 打火屬性大傷害。',
        selene: '後排。治療、復活、解毒；催眠。', safira: '前排。多段攻擊、提高閃避；全隊增益。', bobby: '後排。放置砲台每回合攻擊；道具效果加倍、護盾。',
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
        case 'regionReroll': return `重鑄時鎖定${FORGE_GROUP[u.region]}詞綴`;
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
  clear: { title: '星燈重新亮起', body: '燈喰之獸倒下了。暮霧散去，露米亞迎來久違的晨光。', back: '回到城鎮' },
};
