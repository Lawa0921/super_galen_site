import { describe, expect, it } from 'vitest';
import { touchText, cdLabel, journalLevelLine, levelUpLines, moveFocus, nextMilestone, respecLabel, skillStatLines, skillTip, xpLabel } from './levelModel';
import { continueLines, summarizeGame } from './titleModel';
import { Progression, xpAtLevel } from '../engine/levels';
import { skillTotals, SKILLS, BRANCHES } from '../engine/skills';

describe('levelModel text', () => {
  it('xp label and level-up lines (merged when several levels at once, milestone mentions title + frame)', () => {
    expect(xpLabel(3, 120, 405)).toBe('3 級 · 120/405');
    expect(xpLabel(50, 0, 0)).toBe('50 級 · 滿級');
    const one = levelUpLines(2, 3);
    expect(one.title).toBe('升級！等級 3');
    expect(one.lines[0]).toBe('生命上限 +2 · 技能點 +1（按 K 分配）');
    expect(one.milestone).toBe(false);
    const m = levelUpLines(4, 5);
    expect(m.milestone).toBe(true);
    expect(m.lines[0]).toContain('技能點 +2');
    expect(m.lines.join()).toContain('稱號「初出茅廬」');
    expect(m.lines.join()).toContain('銅框');
    const many = levelUpLines(1, 4);
    expect(many.title).toBe('升級！等級 4（+3）');
    expect(levelUpLines(9, 10).lines.join()).toContain('防禦 +1');
  });
  it('touch wording drops key hints', () => {
    expect(touchText(levelUpLines(2, 3).lines[0])).toBe('生命上限 +2 · 技能點 +1（點經驗條分配）');
    expect(touchText(cdLabel('dash', 1.2))).toBe('突進冷卻 2 秒');
    expect(touchText('花費 1 點（再點一下或 Enter）')).toBe('花費 1 點（再點一下）');
    expect(touchText(skillTip('b_dash', {}, 5, 3).now!)).not.toContain('（Q）');
  });
  it('next milestone', () => {
    expect(nextMilestone(1)).toMatchObject({ level: 5, frame: '銅框' });
    expect(nextMilestone(5)).toMatchObject({ level: 10, frame: null });
    expect(nextMilestone(50)).toBeNull();
  });
  it('skill tooltip: rank, now / next, prerequisites with status, cost and failure state', () => {
    const t = skillTip('b_edge', { b_vigor: 1, b_edge: 2 }, 6, 3);
    expect(t).toMatchObject({ name: '銳鋒', kind: '被動', rank: '2 / 5 級', now: '目前：傷害 +8%', next: '下一級：傷害 +12%', cost: '花費 1 點', state: null });
    expect(t.reqs).toEqual([{ text: '前置：鍛體', ok: true }, { text: '需要等級 2', ok: true }]);
    const locked = skillTip('b_slam', { b_vigor: 1 }, 4, 9);
    expect(locked.kind).toBe('主動');
    expect(locked.state).toBe('level');
    expect(locked.reqs.filter((r) => !r.ok).length).toBe(3);
    expect(skillTip('b_fury', {}, 50, 9).now).toContain('35%');
  });
  it('skill stat lines list only non-zero totals', () => {
    expect(skillStatLines(skillTotals({}))).toEqual([]);
    const l = skillStatLines(skillTotals({ b_vigor: 2, p_stride: 1, p_reach: 1 }));
    expect(l).toContain('生命上限 +20');
    expect(l).toContain('跳躍高度 +4%');
    expect(l).toContain('伸手距離 +1 格');
  });
  it('labels', () => {
    expect(respecLabel({ shard: 0, dust: 0 })).toBe('重置技能樹');
    expect(respecLabel({ shard: 8, dust: 1 })).toBe('重置技能樹（碎晶 8 · 星塵 1）');
    expect(cdLabel('dash', 1.2)).toBe('突進（Q）冷卻 2 秒');
    expect(cdLabel('pulse', 0)).toBe('尋礦感知（R）可用');
  });
  it('keyboard focus moves spatially across branches', () => {
    const nodes = SKILLS.map((s) => ({ id: s.id, gx: BRANCHES.findIndex((b) => b.id === s.branch) * 3 + s.col, row: s.row }));
    expect(moveFocus(nodes, 'b_vigor', 'down')).toBe('b_dash');
    expect(moveFocus(nodes, 'b_vigor', 'right')).toBe('b_guard');
    expect(moveFocus(nodes, 'b_guard', 'right')).toBe('p_lamp');
    expect(moveFocus(nodes, 'b_edge', 'left')).toBe('b_edge');
    expect(moveFocus(nodes, 'b_fury', 'up')).toBe('b_eye');
  });
  it('journal line and title summary carry the level', () => {
    const p = new Progression();
    p.gain(xpAtLevel(7) + 15);
    p.learn('b_vigor');
    expect(journalLevelLine(p)).toBe(`等級 7「初出茅廬」· 經驗 15 / 1,100 · 累計 ${(xpAtLevel(7) + 15).toLocaleString('en-US')} · 技能點 6 可用 / 1 已花`);
    const g = { seed: 's', time: 0, tick: 0, peaceful: false, discovery: { stats: () => ({ completion: 0.1, depthRecord: 0 }) }, levels: p };
    const sum = summarizeGame(g);
    expect(sum.level).toBe(7);
    expect(continueLines({ seed: 's', savedAt: 0, summary: sum }, 0)[1]).toMatch(/^等級 7 · /);
  });
});
