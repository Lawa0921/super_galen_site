/**
 * T6：SoloRun 能量/技能/perk 狀態機（純 TS、種子化、無 Pixi/DOM）。
 */
import { describe, it, expect } from 'vitest';
import { SoloRun, SKILLS, PERK_CATALOG, type PerkId } from './run';

function makeRun(opts?: Partial<{ skill: 'bomb' | 'slow' | 'reroll' | 'shield' | null; seed: number; mode: 'solo' | 'ai' }>) {
  return new SoloRun({
    skill: opts?.skill === undefined ? 'bomb' : opts.skill,
    seed: opts?.seed ?? 42,
    mode: opts?.mode ?? 'solo',
  });
}

describe('SKILLS / PERK_CATALOG 目錄', () => {
  it('SKILLS 含 4 技能且 shield 為 aiOnly', () => {
    expect(Object.keys(SKILLS).sort()).toEqual(['bomb', 'reroll', 'shield', 'slow']);
    expect(SKILLS.shield.aiOnly).toBe(true);
    expect(SKILLS.bomb.aiOnly).toBeUndefined();
  });

  it('PERK_CATALOG 共 9 款且上限/需求對照 spec', () => {
    expect(PERK_CATALOG).toHaveLength(9);
    const byId = Object.fromEntries(PERK_CATALOG.map((p) => [p.id, p]));
    expect(byId.blastPlus.maxStacks).toBe(3);
    expect(byId.blastPlus.requiresSkill).toBe('bomb');
    expect(byId.energySurge.maxStacks).toBe(3);
    expect(byId.scoreFever.maxStacks).toBe(3);
    expect(byId.timeMaster.maxStacks).toBe(2);
    expect(byId.timeMaster.requiresSkill).toBe('slow');
    expect(byId.instantCharge.instant).toBe(true);
    expect(byId.instantCharge.maxStacks).toBe(Infinity);
    expect(byId.lightPiece.maxStacks).toBe(1);
    expect(byId.comboAdept.maxStacks).toBe(1);
    expect(byId.survivor.maxStacks).toBe(1);
    expect(byId.cheapSkill.maxStacks).toBe(2);
    expect(byId.cheapSkill.requiresSkill).toBe('reroll');
  });
});

describe('能量累積', () => {
  it('能量表：1 行=10、2 行=25、3 行=45、4 行=70', () => {
    const values: Array<[number, number]> = [
      [1, 10],
      [2, 25],
      [3, 45],
      [4, 70],
    ];
    for (const [count, expected] of values) {
      const run = makeRun();
      run.onLineClear(count, 0, false);
      expect(run.energy).toBe(expected);
    }
  });

  it('combo 每段 +5（combo>=1 才加）', () => {
    const run = makeRun();
    run.onLineClear(1, 2, false); // 10 + 2*5 = 20
    expect(run.energy).toBe(20);
  });

  it('combo=0 不加成', () => {
    const run = makeRun();
    run.onLineClear(1, 0, false);
    expect(run.energy).toBe(10);
  });

  it('tSpin 整筆 ×1.5 後取整（含 combo 加成）', () => {
    const run = makeRun();
    run.onLineClear(1, 1, true); // (10+5)*1.5 = 22.5 → 22
    expect(run.energy).toBe(22);
  });

  it('能量上限 100', () => {
    const run = makeRun();
    run.onLineClear(4, 0, false);
    run.onLineClear(4, 0, false);
    expect(run.energy).toBe(100);
  });

  it('energySurge 乘算：先乘後取整再 cap', () => {
    const run = makeRun();
    run.pickPerk('energySurge'); // ×1.3
    run.onLineClear(3, 0, false); // 45*1.3 = 58.5 → 58
    expect(run.energy).toBe(58);
    expect(run.energyMultiplier()).toBeCloseTo(1.3);
  });

  it('comboAdept 將每段 combo 加成 5→10', () => {
    const run = makeRun();
    expect(run.comboBonus()).toBe(5);
    run.pickPerk('comboAdept');
    expect(run.comboBonus()).toBe(10);
    run.onLineClear(1, 2, false); // 10 + 2*10 = 30
    expect(run.energy).toBe(30);
  });
});

describe('技能發動', () => {
  it('能量不足或無帶技能時 activate 回 null', () => {
    const run = makeRun();
    expect(run.canActivate()).toBe(false);
    expect(run.activate()).toBeNull();

    const noSkill = makeRun({ skill: null });
    noSkill.onLineClear(4, 0, false);
    noSkill.onLineClear(4, 0, false);
    expect(noSkill.energy).toBe(100);
    expect(noSkill.canActivate()).toBe(false);
    expect(noSkill.activate()).toBeNull();
  });

  it('activate 消耗能量歸 0 並回傳操作描述', () => {
    const run = makeRun({ skill: 'bomb' });
    run.onLineClear(4, 0, false);
    run.onLineClear(4, 0, false);
    expect(run.canActivate()).toBe(true);
    const op = run.activate();
    expect(op).toEqual({ skill: 'bomb', bombRows: 2, slowMs: 10000, shieldRows: 8 });
    expect(run.energy).toBe(0);
    expect(run.canActivate()).toBe(false);
  });

  it('cheapSkill 降需求 100→80→60（下限 60，超疊不再降）', () => {
    const run = makeRun({ skill: 'reroll' });
    expect(run.energyRequired).toBe(100);
    run.pickPerk('cheapSkill');
    expect(run.energyRequired).toBe(80);
    run.pickPerk('cheapSkill');
    expect(run.energyRequired).toBe(60);
    run.pickPerk('cheapSkill'); // 超過 maxStacks，不再降
    expect(run.energyRequired).toBe(60);
    expect(run.perkLevel('cheapSkill')).toBe(2);
    // 60 能量即可發動
    run.onLineClear(3, 0, false); // 45
    expect(run.canActivate()).toBe(false);
    run.onLineClear(2, 0, false); // 70
    expect(run.canActivate()).toBe(true);
  });

  it('bombRows = 2 + blastPlus 層數', () => {
    const run = makeRun({ skill: 'bomb' });
    run.pickPerk('blastPlus');
    run.pickPerk('blastPlus');
    run.onLineClear(4, 0, false);
    run.onLineClear(4, 0, false);
    expect(run.activate()?.bombRows).toBe(4);
  });

  it('slowMs = 10000 + 5000×timeMaster 層數', () => {
    const run = makeRun({ skill: 'slow' });
    run.pickPerk('timeMaster');
    run.onLineClear(4, 0, false);
    run.onLineClear(4, 0, false);
    expect(run.activate()?.slowMs).toBe(15000);
  });
});

describe('onLevelUp 三選一抽卡', () => {
  it('ai 模式回 null', () => {
    const run = makeRun({ mode: 'ai' });
    expect(run.onLevelUp()).toBeNull();
  });

  it('solo 抽 3 張不重複', () => {
    const run = makeRun({ skill: 'bomb' });
    const choices = run.onLevelUp();
    expect(choices).toHaveLength(3);
    const ids = choices!.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    for (const c of choices!) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.desc).toBe('string');
    }
  });

  it('同 seed 同呼叫序列 → 兩實例抽卡結果完全相同', () => {
    const a = makeRun({ skill: 'bomb', seed: 7 });
    const b = makeRun({ skill: 'bomb', seed: 7 });
    for (let i = 0; i < 5; i++) {
      expect(a.onLevelUp()).toEqual(b.onLevelUp());
    }
  });

  it('不同 seed 序列（多次呼叫）應出現差異', () => {
    const a = makeRun({ skill: 'bomb', seed: 1 });
    const b = makeRun({ skill: 'bomb', seed: 99999 });
    const seqA = JSON.stringify([a.onLevelUp(), a.onLevelUp(), a.onLevelUp(), a.onLevelUp()]);
    const seqB = JSON.stringify([b.onLevelUp(), b.onLevelUp(), b.onLevelUp(), b.onLevelUp()]);
    expect(seqA).not.toBe(seqB);
  });

  it('requiresSkill 過濾：帶 bomb 才見 blastPlus、永不見 timeMaster/cheapSkill', () => {
    const seen = (run: SoloRun): Set<PerkId> => {
      const s = new Set<PerkId>();
      for (let i = 0; i < 50; i++) for (const c of run.onLevelUp()!) s.add(c.id);
      return s;
    };
    const bombRun = makeRun({ skill: 'bomb' });
    const bombSeen = seen(bombRun);
    expect(bombSeen.has('blastPlus')).toBe(true);
    expect(bombSeen.has('timeMaster')).toBe(false);
    expect(bombSeen.has('cheapSkill')).toBe(false);

    const noSkillRun = makeRun({ skill: null });
    const noneSeen = seen(noSkillRun);
    expect(noneSeen.has('blastPlus')).toBe(false);
    expect(noneSeen.has('timeMaster')).toBe(false);
    expect(noneSeen.has('cheapSkill')).toBe(false);
  });

  it('滿層 perk 退出抽卡池', () => {
    const run = makeRun({ skill: null });
    run.pickPerk('lightPiece'); // maxStacks ×1
    for (let i = 0; i < 50; i++) {
      const ids = run.onLevelUp()!.map((c) => c.id);
      expect(ids).not.toContain('lightPiece');
    }
  });

  it('池 <3 時給全部', () => {
    const run = makeRun({ skill: null });
    // skill=null 池：energySurge/scoreFever/instantCharge/lightPiece/comboAdept/survivor
    for (const id of ['energySurge', 'scoreFever', 'lightPiece', 'comboAdept', 'survivor'] as PerkId[]) {
      const max = PERK_CATALOG.find((p) => p.id === id)!.maxStacks;
      for (let i = 0; i < max; i++) run.pickPerk(id);
    }
    const choices = run.onLevelUp();
    expect(choices!.map((c) => c.id)).toEqual(['instantCharge']);
  });

  it('instantCharge 即時 +50（cap 100）且持續入池', () => {
    const run = makeRun({ skill: null });
    run.onLineClear(4, 0, false); // 70
    run.pickPerk('instantCharge');
    expect(run.energy).toBe(100); // 70+50 cap 100
    const fresh = makeRun({ skill: null });
    fresh.pickPerk('instantCharge');
    expect(fresh.energy).toBe(50);
    // 多次拿後仍會出現在池中
    for (let i = 0; i < 10; i++) fresh.pickPerk('instantCharge');
    const seen = new Set<PerkId>();
    for (let i = 0; i < 50; i++) for (const c of fresh.onLevelUp()!) seen.add(c.id);
    expect(seen.has('instantCharge')).toBe(true);
  });
});

describe('被動效果', () => {
  it('scoreMultiplier = 1 + 0.25×scoreFever 層', () => {
    const run = makeRun();
    expect(run.scoreMultiplier()).toBe(1);
    run.pickPerk('scoreFever');
    expect(run.scoreMultiplier()).toBe(1.25);
    run.pickPerk('scoreFever');
    run.pickPerk('scoreFever');
    expect(run.scoreMultiplier()).toBe(1.75);
  });

  it('survivorTriggered：需持有 survivor，且高度 >15 才觸發（15 否、16 是）', () => {
    const run = makeRun();
    expect(run.survivorTriggered(16)).toBe(false); // 未持有
    run.pickPerk('survivor');
    expect(run.survivorTriggered(15)).toBe(false);
    expect(run.survivorTriggered(16)).toBe(true);
  });
});
