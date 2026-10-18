import { describe, expect, it } from 'vitest';
import {
  BRANCHES, SKILLS, SKILL_CAPS, TREE_COST, gearBonus, learnCheck, nodeState, skillDef, skillText, skillTotals, spentPoints,
  type Ranks,
} from './skills';
import { addGearTotals, capTotals, emptyTotals, STAT_CAPS } from './gear';
import { computeStats } from './combat';
import { Equipment } from './equipment';

describe('skill tree data', () => {
  it('three branches, 6–10 nodes each, unique grid cells, prerequisites inside the same branch', () => {
    expect(BRANCHES.map((b) => b.id)).toEqual(['blade', 'path', 'craft']);
    for (const b of BRANCHES) {
      const nodes = SKILLS.filter((s) => s.branch === b.id);
      expect(nodes.length).toBeGreaterThanOrEqual(6);
      expect(nodes.length).toBeLessThanOrEqual(10);
      const cells = new Set(nodes.map((n) => `${n.col},${n.row}`));
      expect(cells.size).toBe(nodes.length);
      for (const n of nodes) for (const q of n.req) expect(skillDef(q).branch).toBe(b.id);
      // 每條分支都有 1 級就能點的根（劍心另外有 2 級就能點的突進：前期選擇）
      const roots = nodes.filter((n) => n.req.length === 0);
      expect(roots.filter((n) => n.level === 1)).toHaveLength(1);
      expect(roots.every((n) => n.level <= 2)).toBe(true);
      // 有主動或核心節點
      expect(nodes.some((n) => n.kind !== 'passive')).toBe(true);
    }
  });
  it('prerequisites sit on an earlier row (the graph only points downwards) and need a lower or equal level', () => {
    for (const s of SKILLS) for (const q of s.req) {
      expect(skillDef(q).row).toBeLessThan(s.row);
      expect(skillDef(q).level).toBeLessThanOrEqual(s.level);
    }
  });
  it('the full tree costs more than a level-50 character can spend (you have to choose)', () => {
    expect(TREE_COST).toBeGreaterThan(59);
  });
});

describe('learnCheck / prerequisites', () => {
  it('root is learnable at level 1 with a point; child needs its parent', () => {
    expect(learnCheck({}, 'b_vigor', 1, 1)).toBeNull();
    expect(learnCheck({}, 'b_vigor', 1, 0)).toBe('points');
    expect(learnCheck({}, 'b_edge', 5, 5)).toBe('req');
    expect(learnCheck({ b_vigor: 1 }, 'b_edge', 5, 5)).toBeNull();
  });
  it('level gate and max rank', () => {
    expect(learnCheck({}, 'b_dash', 1, 5)).toBe('level');
    expect(learnCheck({}, 'b_dash', 2, 1)).toBeNull(); // 2 級、1 點就能點突進
    expect(learnCheck({ b_vigor: 1 }, 'b_fury', 15, 5)).toBe('req');
    expect(learnCheck({ b_vigor: 5 }, 'b_vigor', 50, 5)).toBe('max');
  });
  it('multi-parent node needs every parent', () => {
    const r: Ranks = { b_vigor: 1, b_dash: 1 };
    expect(learnCheck(r, 'b_slam', 20, 5)).toBe('req');
    expect(learnCheck({ ...r, b_guard: 1 }, 'b_slam', 20, 5)).toBeNull();
    expect(learnCheck({ ...r, b_guard: 1 }, 'b_slam', 20, 1)).toBe('points');
  });
  it('nodeState: learned / partial / open / locked', () => {
    expect(nodeState({ b_vigor: 5 }, 'b_vigor', 10)).toBe('learned');
    expect(nodeState({ b_vigor: 2 }, 'b_vigor', 10)).toBe('partial');
    expect(nodeState({ b_vigor: 2 }, 'b_edge', 10)).toBe('open');
    expect(nodeState({}, 'b_edge', 10)).toBe('locked');
    expect(nodeState({}, 'b_dash', 1)).toBe('locked');
  });
  it('spentPoints counts rank × cost', () => {
    expect(spentPoints({ b_vigor: 3, b_dash: 1, b_fury: 1 })).toBe(3 + 1 + 3);
  });
});

describe('skill totals and caps', () => {
  it('ranks multiply the per-rank value', () => {
    const t = skillTotals({ b_vigor: 3, b_edge: 2, p_feather: 2 });
    expect(t.hp).toBe(30);
    expect(t.dmg).toBe(8);
    expect(t.fallSafe).toBe(12);
    expect(t.fallRed).toBe(30);
  });
  it('skill-only stats respect SKILL_CAPS even with corrupt over-max ranks', () => {
    const t = skillTotals({ c_thrift: 99, p_reach: 99, c_scholar: 99 } as Ranks);
    expect(t.refund).toBeLessThanOrEqual(SKILL_CAPS.refund);
    expect(t.reach).toBeLessThanOrEqual(SKILL_CAPS.reach);
    expect(t.xp).toBeLessThanOrEqual(SKILL_CAPS.xp);
  });
  it('shared stats go into the gear sum and share the gear cap (skills cannot push past STAT_CAPS)', () => {
    const raw = emptyTotals();
    raw.dmg = 78; raw.hp = 95;
    const bonus = gearBonus(skillTotals({ b_vigor: 5, b_edge: 5 }));
    for (const [k, v] of Object.entries(bonus)) raw[k as keyof typeof raw] += v as number;
    const capped = capTotals(raw);
    expect(capped.dmg).toBe(STAT_CAPS.dmg);
    expect(capped.hp).toBe(STAT_CAPS.hp);
  });
  it('computeStats folds the skill bonus into damage / max hp / defense (capped together with gear)', () => {
    const eq = new Equipment();
    const base = computeStats(eq);
    const withSkills = computeStats(eq, [], gearBonus(skillTotals({ b_vigor: 2, b_edge: 5, b_guard: 3 })));
    expect(withSkills.maxHpBonus - base.maxHpBonus).toBe(20);
    expect(withSkills.damageMul - base.damageMul).toBeCloseTo(0.2, 5);
    expect(withSkills.defense - base.defense).toBe(3);
    // 詞條已經到頂：技能不再多給
    const raw = emptyTotals();
    addGearTotals(raw, 'copper_sword', { rarity: 1, ilvl: 5, plus: 0, affixes: [{ id: 'keen', tier: 5, value: 80 }] });
    expect(capTotals(raw).dmg).toBe(80);
  });
  it('skillText fills in the current total', () => {
    expect(skillText('b_edge', 3)).toBe('傷害 +12%');
    expect(skillText('p_feather', 2)).toBe('安全落差 +12 格、摔落傷害 −30%');
    expect(skillText('b_edge', 0)).toBe('傷害 +4%');
  });
});
