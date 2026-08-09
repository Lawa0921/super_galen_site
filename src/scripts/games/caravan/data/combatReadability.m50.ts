import type { Move, PartyMember } from '../combat';
import { formationAttackProfile } from './martialEngagement.m49';

export interface CombatMoveForecast {
  shortLabel: string;
  hint: string;
  penalized: boolean;
}

const ROW_LABEL: Record<'front' | 'back', string> = {
  front: '前排',
  back: '後排',
};

function readyShieldBonus(actor: PartyMember): number {
  const armory = actor.armoryProfile;
  return armory?.shieldReady ? Math.max(0, armory.shieldGuardBonus ?? 0) : 0;
}

/**
 * M50：把 M49 已經存在的站位規則在玩家按下招式前就說清楚。
 * M51 延伸同一資訊契約：老兵換位也必須在出手前說明會前進、後撤或輪替。
 * M52 再要求盾牌的守勢收益在按下防禦以前可見，且收起的盾不能假裝生效。
 * isMystic 由 M41/M44 的 arcana 真實規則提供，避免用元素外觀猜測魔法。
 */
export function combatMoveForecast(
  actor: PartyMember,
  move: Move,
  isMystic = false,
): CombatMoveForecast {
  const row = actor.formationRow === 'back' ? 'back' : 'front';

  if (move.formationShift) {
    if (row === 'back') {
      const guardedAdvance = (actor.veteranMasteryRank ?? 0) >= 2;
      const shieldBonus = guardedAdvance ? readyShieldBonus(actor) : 0;
      const guardTotal = 4 + shieldBonus;
      return {
        shortLabel: guardedAdvance
          ? shieldBonus > 0 ? `前進・守勢・盾+${shieldBonus}` : '前進・守勢'
          : '前進',
        hint: guardedAdvance
          ? `花費完整一回合進入前排；精通 II 會同時進入守勢，防禦 +${guardTotal}${shieldBonus > 0 ? `（含盾牌 +${shieldBonus}）` : ''}，直到下一次自身行動前有效。`
          : '花費完整一回合從後排進入前排，不造成傷害。',
        penalized: false,
      };
    }
    if (actor.formationReliefFallback) {
      return { shortLabel: '輪替後撤', hint: '精通 III：由後排中防禦最高的存活隊友接替前線後，你才會退到後排。', penalized: false };
    }
    if (actor.formationCanFallBack) {
      return { shortLabel: '後撤', hint: '花費完整一回合退到後排；其他存活前排會繼續接敵。', penalized: false };
    }
    return { shortLabel: '無人接替', hint: '你是目前最後一名前排，而且沒有符合精通 III 輪替條件的後排隊友；現在不能後撤。', penalized: false };
  }

  if (move.kind === 'guard') {
    const shieldBonus = readyShieldBonus(actor);
    const guardTotal = 4 + shieldBonus;
    const defenseText = `防禦 +${guardTotal}${shieldBonus > 0 ? `（含盾牌 +${shieldBonus}）` : ''}`;
    return row === 'front'
      ? { shortLabel: shieldBonus > 0 ? `守勢・可護衛・盾+${shieldBonus}` : '守勢・可護衛', hint: `${defenseText}；位於前排時可替隊友攔截敵方單體攻擊。`, penalized: false }
      : { shortLabel: shieldBonus > 0 ? `守勢・自保・盾+${shieldBonus}` : '守勢・自保', hint: `${defenseText}；後排守勢只能保護自己，不能隔空替前排隊友攔截。`, penalized: false };
  }

  if (move.kind !== 'attack') return { shortLabel: '', hint: '', penalized: false };

  const formation = formationAttackProfile(actor.formationRow, move, isMystic);
  const rowLabel = ROW_LABEL[row];
  if (formation.engagement === 'mystic') {
    return { shortLabel: '魔法・站位自由', hint: `${rowLabel}施法：真正的秘法／神術不受近戰與遠程的站位命中懲罰。`, penalized: false };
  }

  const kindLabel = formation.engagement === 'ranged' ? '遠程' : '近戰';
  if (formation.hitModifier < 0) {
    return { shortLabel: `${kindLabel}・命中 ${formation.hitModifier}`, hint: formation.message, penalized: true };
  }
  return { shortLabel: `${kindLabel}・站位適配`, hint: `${rowLabel}${kindLabel}：目前站位不會受到額外命中懲罰。`, penalized: false };
}

/** M50–M52：action name 必須反映當下真正可用的站位／盾牌狀態。 */
export function combatMoveDisplayName(actor: PartyMember, move: Move, isMystic = false): string {
  const forecast = combatMoveForecast(actor, move, isMystic);
  const shieldBonus = readyShieldBonus(actor);
  const baseName = move.kind === 'guard'
    ? '防禦架勢'
    : move.id === 'shield-bash'
      ? shieldBonus > 0 ? '盾牆猛擊' : '壁壘猛擊'
      : move.name;
  if (move.formationShift) return `${baseName}〔${forecast.shortLabel}〕`;
  if (move.kind === 'guard') {
    const role = actor.formationRow === 'back' ? '自保' : '護衛';
    return `${baseName}〔${role}${shieldBonus > 0 ? `・盾+${shieldBonus}` : ''}〕`;
  }
  if (move.kind === 'attack' && !isMystic) {
    const kindLabel = forecast.shortLabel.startsWith('遠程') ? '遠程' : '近戰';
    return forecast.penalized ? `${baseName}〔${kindLabel} -2〕` : `${baseName}〔${kindLabel}〕`;
  }
  return baseName;
}
