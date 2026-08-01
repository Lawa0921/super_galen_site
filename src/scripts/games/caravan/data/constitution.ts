import type { SaveData } from '../save';

export type ConstitutionClauseId =
  | 'martial-priority'
  | 'open-knowledge'
  | 'fellowship-dividend'
  | 'commercial-supremacy'
  | 'exploration-duty';

export interface ConstitutionClauseDef {
  id: ConstitutionClauseId;
  name: string;
  summary: string;
  advantage: string;
  cost: string;
}

export interface ConstitutionState {
  active: ConstitutionClauseId | null;
  warnings: string[];
  amendmentGoldCost: number;
  amendmentReputationCost: number;
}

export const CONSTITUTION_CLAUSE_ORDER: ConstitutionClauseId[] = [
  'martial-priority',
  'open-knowledge',
  'fellowship-dividend',
  'commercial-supremacy',
  'exploration-duty',
];

export const CONSTITUTION_CLAUSES: Record<ConstitutionClauseId, ConstitutionClauseDef> = {
  'martial-priority': {
    id: 'martial-priority', name: '武力優先條款',
    summary: '以護運、紀律與現場控制作為公司第一責任。',
    advantage: '護運委託與實地解法更容易。',
    cost: '交易委託的金幣與聲望報酬降低。',
  },
  'open-knowledge': {
    id: 'open-knowledge', name: '知識公開條款',
    summary: '要求地圖、技術與鑑定結果在公司內公開。',
    advantage: '專業解法門檻降低，遺珍報酬提高。',
    cost: '資本解法金幣成本提高。',
  },
  'fellowship-dividend': {
    id: 'fellowship-dividend', name: '同袍分紅條款',
    summary: '公司收益必須優先回饋共同承擔風險的旅伴。',
    advantage: '羈絆與聲望報酬提高。',
    cost: '所有委託的金幣報酬降低。',
  },
  'commercial-supremacy': {
    id: 'commercial-supremacy', name: '商業至上條款',
    summary: '公司所有決策以可持續現金流與交易權為核心。',
    advantage: '交易委託與金幣報酬提高。',
    cost: '實地解法需要更多乾糧。',
  },
  'exploration-duty': {
    id: 'exploration-duty', name: '探索義務條款',
    summary: '公司必須持續開拓未知路線並保存探索成果。',
    advantage: '前線與遺珍委託門檻降低。',
    cost: '所有可執行路線額外消耗一份補給。',
  },
};

const flag = (id: ConstitutionClauseId): string => `company-constitution:${id}`;
const enactedFlag = 'company-constitution:enacted';

export function companyConstitutionState(save: SaveData): ConstitutionState {
  const active = CONSTITUTION_CLAUSE_ORDER.filter((id) => save.flags[flag(id)] === true);
  const warnings: string[] = [];
  if (active.length > 1) warnings.push('偵測到多個公司憲章條款，政策效果暫停並視為未制定。');
  const selected = active.length === 1 ? active[0] : null;
  const amendedBefore = save.flags[enactedFlag] === true;
  return {
    active: selected,
    warnings,
    amendmentGoldCost: amendedBefore ? 40 : 0,
    amendmentReputationCost: amendedBefore ? 2 : 0,
  };
}

export function enactCompanyConstitution(save: SaveData, id: ConstitutionClauseId): ConstitutionState {
  if (!CONSTITUTION_CLAUSE_ORDER.includes(id)) throw new Error(`未知公司憲章條款「${id}」`);
  const current = companyConstitutionState(save);
  if (current.active === id && current.warnings.length === 0) throw new Error('這項條款已經生效。');
  if (save.gold < current.amendmentGoldCost) throw new Error(`金幣不足，需要 ${current.amendmentGoldCost} G。`);
  if (save.reputation < current.amendmentReputationCost) throw new Error(`聲望不足，需要 ${current.amendmentReputationCost}。`);

  save.gold -= current.amendmentGoldCost;
  save.reputation -= current.amendmentReputationCost;
  for (const clauseId of CONSTITUTION_CLAUSE_ORDER) delete save.flags[flag(clauseId)];
  save.flags[flag(id)] = true;
  save.flags[enactedFlag] = true;
  return companyConstitutionState(save);
}
