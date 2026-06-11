/**
 * SoloRun（Phase 4 T6）：能量/技能/perk 狀態機。
 * 純 TS、種子化（createRng 派生，禁 Math.random）、無 Pixi/DOM。
 * 渲染層只讀：onLineClear 餵事件、activate 拿操作描述、onLevelUp 拿三選一。
 */
import { createRng } from './rng';
import type { SkillId } from './items';
import { DEFAULT_BOMB_ROWS, DEFAULT_SHIELD_ROWS, SLOW_DURATION_MS } from './items';

export type { SkillId } from './items';

/** 技能目錄（shield 僅 vs-AI：SOLO 無垃圾不出現此卡）。 */
export const SKILLS: Record<SkillId, { name: string; desc: string; aiOnly?: boolean }> = {
  bomb: { name: '地城炸彈', desc: '立即清除盤面最底 2 行（不計分、不算消行）' },
  slow: { name: '時之沙', desc: '重力降為 0.3× 持續 10 秒' },
  reroll: { name: '命運重抽', desc: '當前方塊與 NEXT 佇列全部重抽' },
  shield: { name: '符文護盾', desc: '抵擋接下來 8 行待入垃圾', aiOnly: true },
};

export type PerkId =
  | 'blastPlus'
  | 'energySurge'
  | 'scoreFever'
  | 'timeMaster'
  | 'instantCharge'
  | 'lightPiece'
  | 'comboAdept'
  | 'survivor'
  | 'cheapSkill';

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  maxStacks: number;
  requiresSkill?: SkillId;
  instant?: boolean;
}

/** Perk 池（9 款，對照 spec §2.3 表）。 */
export const PERK_CATALOG: PerkDef[] = [
  { id: 'blastPlus', name: '爆破擴大', desc: '地城炸彈 +1 行範圍', maxStacks: 3, requiresSkill: 'bomb' },
  { id: 'energySurge', name: '能量湧流', desc: '消行能量 +30%', maxStacks: 3 },
  { id: 'scoreFever', name: '分數狂熱', desc: '全部得分 +25%', maxStacks: 3 },
  { id: 'timeMaster', name: '時間掌控', desc: '時之沙時長 +5 秒', maxStacks: 2, requiresSkill: 'slow' },
  { id: 'instantCharge', name: '蓄勢待發', desc: '立即獲得能量 50', maxStacks: Infinity, instant: true },
  { id: 'lightPiece', name: '輕盈方塊', desc: '軟降速度 +50%', maxStacks: 1 },
  { id: 'comboAdept', name: '連擊行家', desc: 'combo 能量加成 ×2', maxStacks: 1 },
  { id: 'survivor', name: '倖存者', desc: '升級時若盤面高度 >15 行，清除最底 1 行', maxStacks: 1 },
  { id: 'cheapSkill', name: '開局重抽', desc: '命運重抽的發動能量需求 -20', maxStacks: 2, requiresSkill: 'reroll' },
];

export interface PerkChoice {
  id: PerkId;
  name: string;
  desc: string;
}

export interface SkillActivation {
  skill: SkillId;
  bombRows: number;
  slowMs: number;
  shieldRows: number;
}

/** 能量表（可調常數集中一處）：1 行=10、2 行=25、3 行=45、4 行=70。 */
const ENERGY_BY_LINES: Record<number, number> = { 1: 10, 2: 25, 3: 45, 4: 70 };
const ENERGY_CAP = 100;
const ENERGY_REQUIRED_BASE = 100;
const ENERGY_REQUIRED_MIN = 60;
const CHEAP_SKILL_DISCOUNT = 20;
const COMBO_BONUS_BASE = 5;
const TSPIN_MULTIPLIER = 1.5;
const ENERGY_SURGE_PER_STACK = 0.3;
const SCORE_FEVER_PER_STACK = 0.25;
const INSTANT_CHARGE_GAIN = 50;
const BLAST_PLUS_ROWS_PER_STACK = 1;
const TIME_MASTER_MS_PER_STACK = 5000;
const SURVIVOR_HEIGHT_THRESHOLD = 15;
const RNG_SALT = 0x7e57a11;

export class SoloRun {
  private readonly skill: SkillId | null;
  private readonly mode: 'solo' | 'ai';
  private readonly rng: () => number;
  private readonly levels = new Map<PerkId, number>();
  private energyValue = 0;

  constructor(opts: { skill: SkillId | null; seed: number; mode: 'solo' | 'ai' }) {
    this.skill = opts.skill;
    this.mode = opts.mode;
    this.rng = createRng((opts.seed ^ RNG_SALT) >>> 0);
  }

  /**
   * 消行能量：基礎表 + combo 每段加成（combo>=1 才加），
   * tSpin 整筆 ×1.5，再套 energySurge 乘算，最後取整、cap 100。
   */
  onLineClear(count: number, combo: number, tSpin: boolean): void {
    let gain = ENERGY_BY_LINES[count] ?? 0;
    if (combo >= 1) gain += combo * this.comboBonus();
    if (tSpin) gain *= TSPIN_MULTIPLIER;
    gain *= this.energyMultiplier();
    this.energyValue = Math.min(ENERGY_CAP, this.energyValue + Math.floor(gain));
  }

  get energy(): number {
    return this.energyValue;
  }

  /** 發動需求：100 - 20×開局重抽層數（下限 60）。 */
  get energyRequired(): number {
    return Math.max(
      ENERGY_REQUIRED_MIN,
      ENERGY_REQUIRED_BASE - CHEAP_SKILL_DISCOUNT * this.perkLevel('cheapSkill'),
    );
  }

  canActivate(): boolean {
    return this.skill !== null && this.energyValue >= this.energyRequired;
  }

  /** 消耗能量歸 0，回傳對引擎的操作描述；無法發動回 null。 */
  activate(): SkillActivation | null {
    if (!this.canActivate() || this.skill === null) return null;
    this.energyValue = 0;
    return {
      skill: this.skill,
      bombRows: DEFAULT_BOMB_ROWS + BLAST_PLUS_ROWS_PER_STACK * this.perkLevel('blastPlus'),
      slowMs: SLOW_DURATION_MS + TIME_MASTER_MS_PER_STACK * this.perkLevel('timeMaster'),
      shieldRows: DEFAULT_SHIELD_ROWS,
    };
  }

  /**
   * SOLO 限定三選一：從「未滿層 && 技能需求符合」池種子化抽 3（不重複；
   * 池 <3 給全部）。ai 模式回 null。instantCharge 無上限故一直入池。
   */
  onLevelUp(): PerkChoice[] | null {
    if (this.mode === 'ai') return null;
    const pool = PERK_CATALOG.filter(
      (p) =>
        this.perkLevel(p.id) < p.maxStacks &&
        (!p.requiresSkill || p.requiresSkill === this.skill),
    );
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3).map((p) => ({ id: p.id, name: p.name, desc: p.desc }));
  }

  /** instantCharge 即時 +50（cap 100）；其餘 perk 層數 +1（夾在 maxStacks）。 */
  pickPerk(id: PerkId): void {
    const def = PERK_CATALOG.find((p) => p.id === id);
    if (!def) return;
    if (def.instant) {
      this.energyValue = Math.min(ENERGY_CAP, this.energyValue + INSTANT_CHARGE_GAIN);
      this.levels.set(id, this.perkLevel(id) + 1); // 記次數，不影響入池（maxStacks=∞）
      return;
    }
    this.levels.set(id, Math.min(def.maxStacks, this.perkLevel(id) + 1));
  }

  perkLevel(id: PerkId): number {
    return this.levels.get(id) ?? 0;
  }

  /** 分數狂熱：1 + 0.25×層。 */
  scoreMultiplier(): number {
    return 1 + SCORE_FEVER_PER_STACK * this.perkLevel('scoreFever');
  }

  /** 能量湧流：1 + 0.3×層（onLineClear 內套用）。 */
  energyMultiplier(): number {
    return 1 + ENERGY_SURGE_PER_STACK * this.perkLevel('energySurge');
  }

  /** combo 每段能量加成：連擊行家持有時 5→10。 */
  comboBonus(): number {
    return this.perkLevel('comboAdept') > 0 ? COMBO_BONUS_BASE * 2 : COMBO_BONUS_BASE;
  }

  /** 倖存者被動：升級抽卡時呼叫端傳盤面高度，>15 觸發（呼叫端執行 clearBottomRows(1)）。 */
  survivorTriggered(stackHeight: number): boolean {
    return this.perkLevel('survivor') > 0 && stackHeight > SURVIVOR_HEIGHT_THRESHOLD;
  }
}
