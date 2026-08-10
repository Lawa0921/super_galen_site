import type { FormationRow } from '../save';
import type { EngagementBand } from './martialEngagement.m49';

export type BattlefieldTerrainId = 'open-ground' | 'broken-stone-bridge' | 'ruined-battlements';
export type BattlefieldSide = 'party' | 'enemy';
export type CoverGrade = 'none' | 'partial' | 'strong';
export type RearLineObstruction = 'none' | 'solid';

export interface BattlefieldTerrain {
  id: BattlefieldTerrainId;
  name: string;
  description: string;
  partyRearCover: CoverGrade;
  enemyRearCover: CoverGrade;
  /** M57：是否有足以切斷「直線」作用線的實體殘牆／車陣。 */
  rearLineObstruction: RearLineObstruction;
}

export interface ProjectileCoverProfile {
  grade: CoverGrade;
  hitModifier: number;
  applies: boolean;
  message: string;
}

export const BATTLEFIELD_TERRAINS: Record<BattlefieldTerrainId, BattlefieldTerrain> = {
  'open-ground': {
    id: 'open-ground',
    name: '開闊地',
    description: '沒有足以改變投射命中的固定掩體。',
    partyRearCover: 'none',
    enemyRearCover: 'none',
    rearLineObstruction: 'none',
  },
  'broken-stone-bridge': {
    id: 'broken-stone-bridge',
    name: '斷裂石橋',
    description: '殘破女牆與橋柱替雙方仍受前線保護的後排提供部分投射掩體；物理遠程命中 -1。前線崩潰、後排被迫上前後便失去這項保護。',
    partyRearCover: 'partial',
    enemyRearCover: 'partial',
    rearLineObstruction: 'none',
  },
  'ruined-battlements': {
    id: 'ruined-battlements',
    name: '傾圮城垛',
    description: '殘牆、關隘折角與車陣切斷雙方對受前線保護後排的直線作用線；越頂攻勢仍可跨越，但物理投射仍承受部分／強掩體。',
    partyRearCover: 'partial',
    enemyRearCover: 'strong',
    rearLineObstruction: 'solid',
  },
};

const COVER_HIT_MODIFIER: Record<CoverGrade, number> = {
  none: 0,
  partial: -1,
  strong: -2,
};

export function battlefieldTerrain(id: BattlefieldTerrainId | undefined): BattlefieldTerrain | undefined {
  return id ? BATTLEFIELD_TERRAINS[id] : undefined;
}

export function rearCoverForSide(terrain: BattlefieldTerrain, side: BattlefieldSide): CoverGrade {
  return side === 'party' ? terrain.partyRearCover : terrain.enemyRearCover;
}

/**
 * M55 only models partial projectile cover, not the M57 solid line-of-effect blocker.
 * It therefore modifies physical ranged attacks against a protected rear rank and nothing else:
 * melee/reach are governed by the line model, while spell delivery/solid obstruction is handled
 * separately by M57. An overhead physical projectile can clear a wall and still be harder to land
 * accurately among battlements, so cover remains relevant after a legal M57 bypass.
 */
export function projectileCoverProfile(
  terrain: BattlefieldTerrain | undefined,
  targetSide: BattlefieldSide,
  targetRow: FormationRow | undefined,
  engagement: EngagementBand,
  isMystic: boolean,
  frontlineAlive: boolean,
): ProjectileCoverProfile {
  if (!terrain || !frontlineAlive || targetRow !== 'back' || engagement !== 'ranged' || isMystic) {
    return { grade: 'none', hitModifier: 0, applies: false, message: '' };
  }
  const grade = rearCoverForSide(terrain, targetSide);
  const hitModifier = COVER_HIT_MODIFIER[grade];
  if (hitModifier === 0) return { grade, hitModifier: 0, applies: false, message: '' };
  const label = grade === 'strong' ? '強掩體' : '部分掩體';
  return {
    grade,
    hitModifier,
    applies: true,
    message: `${terrain.name}的${label}遮蔽投射線，物理遠程命中 ${hitModifier}。`,
  };
}
