// levelModel.ts — 等級 / 技能 UI 的純文字邏輯（無 DOM，可測）：經驗文字、升級橫幅、技能說明框、技能數值總表、樹狀圖鍵盤移動。
import {
  BRANCHES, SKILLS, SKILL_CD, skillDef, skillText, learnCheck, rankOf, type Branch, type LearnFail, type Ranks, type SkillId, type SkillTotals,
} from '../engine/skills';
import { MAX_LEVEL, TITLES, levelDef, levelHp, milestoneAt, respecCost, titleFor } from '../engine/levels';
import type { Cost } from '../engine/gear';
import { badgeTier } from './levelArt';

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/**
 * 觸控版的說法：拿掉按鍵提示（「（Q）」「按 K」「或 Enter」），改成點擊的說法。
 * 文字本身用鍵盤版寫，顯示前在觸控裝置上過一次這個函式。
 */
export function touchText(s: string): string {
  return s
    .replace(/（按 K 分配）/g, '（點經驗條分配）')
    .replace(/（[A-Z]）/g, '')
    .replace(/再點一下或 Enter/g, '再點一下')
    .replace(/（Enter）/g, '');
}

/** HUD 經驗條旁的小字 */
export function xpLabel(level: number, into: number, need: number): string {
  return level >= MAX_LEVEL ? `${level} 級 · 滿級` : `${level} 級 · ${fmt(into)}/${fmt(need)}`;
}

/** 升級橫幅：標題 + 說明行（跨好幾級時合併成一則；milestone = 這次跨過的里程碑） */
export function levelUpLines(from: number, to: number): { title: string; lines: string[]; milestone: boolean } {
  const n = to - from;
  const lines = [`生命上限 +${levelHp(to) - levelHp(from)}`];
  let pts = n, milestone = false;
  const titles: string[] = [];
  for (let L = from + 1; L <= to; L++) {
    const m = milestoneAt(L);
    if (m) { pts += m.bonusPoints; milestone = true; titles.push(m.title); }
  }
  if (levelDef(to) > levelDef(from)) lines.push(`防禦 +${levelDef(to) - levelDef(from)}`);
  lines[0] += ` · 技能點 +${pts}（按 K 分配）`;
  if (titles.length) {
    const t = titles[titles.length - 1];
    const frameNew = badgeTier(to).zh !== badgeTier(from).zh;
    lines.push(`里程碑：稱號「${t}」${frameNew ? `、徽章換成${badgeTier(to).zh}` : ''}`);
  }
  return { title: n > 1 ? `升級！等級 ${to}（+${n}）` : `升級！等級 ${to}`, lines, milestone };
}

/** 下一個里程碑（滿級 → null） */
export function nextMilestone(level: number): { level: number; title: string; frame: string | null } | null {
  for (let L = level + 1; L <= MAX_LEVEL; L++) {
    const m = milestoneAt(L);
    if (m) return { level: L, title: m.title, frame: badgeTier(L).zh !== badgeTier(level).zh ? badgeTier(L).zh : null };
  }
  return null;
}
export const ALL_TITLES = TITLES;

const KIND_ZH = { passive: '被動', active: '主動', keystone: '核心' } as const;
const FAIL_ZH: Record<LearnFail, string> = { max: '已經點滿', points: '技能點不夠', level: '等級不夠', req: '要先點前置技能' };
export function failText(f: LearnFail): string { return FAIL_ZH[f]; }

export interface SkillTip {
  name: string;
  kind: string;
  rank: string;
  now: string | null;
  next: string | null;
  reqs: { text: string; ok: boolean }[];
  cost: string;
  state: LearnFail | null;
}
/** 技能說明框內容 */
export function skillTip(id: SkillId, ranks: Ranks, level: number, points: number): SkillTip {
  const d = skillDef(id), k = rankOf(ranks, id);
  const reqs = d.req.map((q) => ({ text: `前置：${skillDef(q).zh}`, ok: rankOf(ranks, q) > 0 }));
  reqs.push({ text: `需要等級 ${d.level}`, ok: level >= d.level });
  const passive = d.kind !== 'active';
  return {
    name: d.zh,
    kind: KIND_ZH[d.kind],
    rank: d.max > 1 ? `${k} / ${d.max} 級` : k ? '已學會' : '未學會',
    now: k > 0 && passive && d.max > 1 ? `目前：${skillText(id, k)}` : k > 0 || d.max === 1 ? skillText(id, Math.max(1, k)) : null,
    next: k < d.max && d.max > 1 ? `下一級：${skillText(id, k + 1)}` : null,
    reqs,
    cost: k >= d.max ? '已點滿' : `花費 ${d.cost} 點`,
    state: learnCheck(ranks, id, level, points),
  };
}

const STAT_ZH: Partial<Record<keyof SkillTotals, [string, string]>> = {
  hp: ['生命上限', ''], dmg: ['傷害', '%'], crit: ['暴擊率', '%'], def: ['防禦', ''], atkspd: ['攻擊速度', '%'], regen: ['生命回復', '/秒'],
  move: ['移動速度', '%'], jump: ['跳躍高度', '%'], light: ['照明', '%'], luck: ['幸運', '%'], reach: ['伸手距離', ' 格'],
  breath: ['憋氣時間', '%'], fallSafe: ['安全落差', ' 格'], fallRed: ['摔落傷害減免', '%'], fishPower: ['釣力', ''], refund: ['合成退料機率', '%'],
  salvage: ['分解產量', '%'], forge: ['鍛造折扣', '%'], mineSpd: ['挖掘速度', '%'], vein: ['礦石加倍機率', '%'], xp: ['經驗', '%'],
  airJump: ['空中再跳', ' 次'], fury: ['背水傷害（低血）', '%'], masterwork: ['精工升階機率', '%'],
};
/** 技能帶來的數值總表（只列非零；和裝備共用的那些會和詞條一起封頂，這裡顯示技能本身的值） */
export function skillStatLines(t: SkillTotals): string[] {
  const out: string[] = [];
  for (const [k, [name, unit]] of Object.entries(STAT_ZH) as [keyof SkillTotals, [string, string]][]) {
    const v = t[k];
    if (!v) continue;
    out.push(`${name} +${Math.round(v * 10) / 10}${unit}`);
  }
  return out;
}

/** 分支已花點數 */
export function branchSpent(r: Ranks, b: Branch): number {
  return SKILLS.filter((s) => s.branch === b).reduce((a, s) => a + rankOf(r, s.id) * s.cost, 0);
}
export function respecLabel(c: Cost): string {
  return c.shard <= 0 && c.dust <= 0 ? '重置技能樹' : `重置技能樹（碎晶 ${c.shard}${c.dust ? ` · 星塵 ${c.dust}` : ''}）`;
}
export { respecCost, titleFor };

export const ACTIVE_KEYS = { dash: 'Q', slam: 'F', pulse: 'R' } as const;
export const ACTIVE_ZH = { dash: '突進', slam: '震地', pulse: '尋礦感知' } as const;
export function cdLabel(a: keyof typeof SKILL_CD, left: number): string {
  return left > 0 ? `${ACTIVE_ZH[a]}（${ACTIVE_KEYS[a]}）冷卻 ${Math.ceil(left)} 秒` : `${ACTIVE_ZH[a]}（${ACTIVE_KEYS[a]}）可用`;
}

/**
 * 樹狀圖的鍵盤移動：nodes = 看得到的節點（全域欄 gx = 分支 × 3 + col、列 row），從 cur 往 dir 走一步。
 * 左右：同列優先、找最近的下一欄；上下：同欄優先、找最近的下一列。找不到 → 原地。
 */
export function moveFocus(nodes: readonly { id: SkillId; gx: number; row: number }[], cur: SkillId, dir: 'left' | 'right' | 'up' | 'down'): SkillId {
  const c = nodes.find((n) => n.id === cur);
  if (!c) return nodes[0]?.id ?? cur;
  const horiz = dir === 'left' || dir === 'right', sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best: { id: SkillId; score: number } | null = null;
  for (const n of nodes) {
    if (n.id === cur) continue;
    const main = horiz ? (n.gx - c.gx) * sign : (n.row - c.row) * sign;
    if (main <= 0) continue;
    const side = horiz ? Math.abs(n.row - c.row) : Math.abs(n.gx - c.gx);
    const score = main * 10 + side * 7;
    if (!best || score < best.score) best = { id: n.id, score };
  }
  return best?.id ?? cur;
}
export function branchOrder(): Branch[] { return BRANCHES.map((b) => b.id); }

/** 日誌的等級行 */
export function journalLevelLine(p: { level: number; xp: number; points: number; spent: number; progress(): { into: number; need: number } }): string {
  const pr = p.progress();
  const xp = p.level >= MAX_LEVEL ? '已滿級' : `經驗 ${fmt(pr.into)} / ${fmt(pr.need)}`;
  return `等級 ${p.level}「${titleFor(p.level)}」· ${xp} · 累計 ${fmt(p.xp)} · 技能點 ${p.points} 可用 / ${p.spent} 已花`;
}
