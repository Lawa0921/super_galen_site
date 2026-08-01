import { describe, expect, it } from 'vitest';
import {
  createForgedSave,
  defaultGenesisForgeInput,
  forgeFingerprint,
  genesisForgeSearchSpace,
  previewGenesisForge,
} from './genesisForge';
import {
  newGame,
  realizeSaveCareer,
  realizeSaveGrowth,
} from '../save';
import {
  XP_TABLE,
  applyLevelUp,
  spendSkillPoint,
} from '../roster';
import { CAREER_LEVELS } from './careers';

function manualProjection(input: ReturnType<typeof defaultGenesisForgeInput>) {
  const save = newGame(1, {
    job: input.job,
    trait: input.trait,
    statRoll: { ...input.statRoll },
    allocation: { ...input.allocation },
  });
  for (const level of CAREER_LEVELS) {
    const plan = input.training[level];
    save.protagonist.xp = XP_TABLE[level];
    applyLevelUp(save.protagonist, { ...plan.allocation });
    realizeSaveGrowth(save);
    realizeSaveCareer(save);
    if (plan.skillId && (save.protagonist.skillPoints ?? 0) > 0) {
      const rank = save.protagonist.skills?.[plan.skillId] ?? 0;
      if (rank < 5) spendSkillPoint(save.protagonist, plan.skillId);
    }
  }
  return save;
}

describe('M30 transactional genesis forge', () => {
  it('creates the exact same Lv1 save as the official newGame boundary', () => {
    const input = defaultGenesisForgeInput('mage', 'learned');
    input.statRoll.int += 2;
    input.statRoll.con -= 1;
    const forged = createForgedSave(input, 777);
    const official = newGame(777, {
      job: input.job,
      trait: input.trait,
      statRoll: input.statRoll,
      allocation: input.allocation,
    });
    expect(forged).toEqual(official);
    expect(forged.protagonist.level).toBe(1);
    expect(forged.protagonist.careerMilestones).toEqual([]);
  });

  it('matches a separately executed official Lv2-Lv5 progression transaction', () => {
    const input = defaultGenesisForgeInput('cleric', 'charming');
    input.training[3] = { allocation: { int: 2 }, skillId: 'lore' };
    input.training[4] = { allocation: { con: 1, cha: 1 }, skillId: 'survival' };
    input.training[5] = { allocation: { dex: 2 }, skillId: 'scouting' };
    const preview = previewGenesisForge(input);
    const manual = manualProjection(input);
    expect(preview.final).toEqual({
      level: manual.protagonist.level,
      xp: manual.protagonist.xp,
      stats: manual.protagonist.stats,
      maxHp: manual.protagonist.maxHp,
      skills: manual.protagonist.skills ?? {},
      skillPoints: manual.protagonist.skillPoints ?? 0,
    });
    expect(preview.projectedCareers.map((entry) => entry.pathId)).toEqual(
      manual.protagonist.careerMilestones?.map((entry) => entry.pathId),
    );
  });

  it('allows later training to create distinct development signatures', () => {
    const scouting = defaultGenesisForgeInput('ranger', 'nimble');
    const negotiation = defaultGenesisForgeInput('ranger', 'charming');
    for (const level of CAREER_LEVELS) {
      scouting.training[level] = { allocation: { dex: 2 }, skillId: 'scouting' };
      negotiation.training[level] = { allocation: { cha: 2 }, skillId: 'negotiation' };
    }
    expect(forgeFingerprint(previewGenesisForge(scouting))).not.toBe(
      forgeFingerprint(previewGenesisForge(negotiation)),
    );
    expect(previewGenesisForge(scouting).final.stats).not.toEqual(
      previewGenesisForge(negotiation).final.stats,
    );
  });

  it('is deterministic and read-only for the same planning object', () => {
    const input = defaultGenesisForgeInput('swordsman', 'brawny');
    const before = JSON.stringify(input);
    const a = previewGenesisForge(input);
    const b = previewGenesisForge(input);
    expect(forgeFingerprint(a)).toBe(forgeFingerprint(b));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects under-spent, over-spent, fractional and out-of-range plans', () => {
    const under = defaultGenesisForgeInput();
    under.allocation = { str: 2 };
    expect(() => previewGenesisForge(under)).toThrow(/恰好配置 3 點/);

    const over = defaultGenesisForgeInput();
    over.training[2].allocation = { str: 3 };
    expect(() => previewGenesisForge(over)).toThrow(/恰好配置 2 點/);

    const fractional = defaultGenesisForgeInput();
    fractional.training[3].allocation = { dex: 1.5, con: 0.5 };
    expect(() => previewGenesisForge(fractional)).toThrow(/非負整數/);

    const roll = defaultGenesisForgeInput('mage', 'learned');
    roll.statRoll.str = 20;
    expect(() => previewGenesisForge(roll)).toThrow(/擲骰屬性超出允許範圍/);
  });

  it('keeps legacy no-origin creation compatible without inventing growth', () => {
    const input = defaultGenesisForgeInput('swordsman', null);
    const preview = previewGenesisForge(input);
    expect(preview.genesis).toBeNull();
    expect(preview.growth).toBeNull();
    expect(preview.growthSignature).toBe('—');
    expect(preview.projectedCharter).toBeNull();
  });

  it('documents a finite search space without claiming duplicate outcomes are unique', () => {
    const space = genesisForgeSearchSpace();
    expect(space.total).toBe('206671500000000');
    expect(BigInt(space.total)).toBeGreaterThan(200_000_000_000_000n);
    expect(space.explanation).toContain('75⁴');
  });
});
