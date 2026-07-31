import type { StatBlock } from '../types';
import type { CharacterGenesis } from './genesis';
import { resolveCharacterGenesis, genesisName } from './genesis';
import { STARTING_PROFILE } from '../save';
import { deriveGrowthProfile, growthSignature } from './growth';
import type { GrowthProfile } from './growth';
import { CAREER_LEVELS } from './careers';
import type { CareerMilestone } from './careers';

export interface GenesisForgeInput {
  job: keyof typeof STARTING_PROFILE;
  stats: StatBlock;
  trait: string | null;
}

export interface GenesisForgePreview {
  genesis: CharacterGenesis | null;
  genesisName: string;
  growth: GrowthProfile | null;
  growthSignature: string;
  projectedCareers: Array<{
    level: number;
    note: string;
  }>;
  diversityScore: number;
}

/**
 * M30 命運鍛造所：只讀預覽，不建立角色、不修改存檔。
 * 用正式創角與成長公式提前展示玩家選擇會形成什麼樣的商隊人才。
 */
export function previewGenesisForge(input: GenesisForgeInput): GenesisForgePreview {
  const profile = STARTING_PROFILE[input.job];
  const genesis = resolveCharacterGenesis(input.stats, input.trait);
  if (!genesis) {
    return {
      genesis: null,
      genesisName: '未啟用命運矩陣',
      growth: null,
      growthSignature: '—',
      projectedCareers: CAREER_LEVELS.map((level) => ({
        level,
        note: '需要命運與潛力後推演',
      })),
      diversityScore: 0,
    };
  }

  const growth = deriveGrowthProfile(input.stats, profile.stats, genesis.profile);
  const projectedCareers = CAREER_LEVELS.map((level) => ({
    level,
    note: level <= 2
      ? '初期依屬性與冒險技能形成方向'
      : level <= 4
        ? '依玩家投入形成混合職涯'
        : '最終形成商隊核心定位',
  }));

  return {
    genesis: genesis.profile,
    genesisName: genesisName(genesis.profile),
    growth,
    growthSignature: growthSignature(growth),
    projectedCareers,
    diversityScore: new Set(Object.values(growth.potential)).size,
  };
}

export function forgeFingerprint(preview: GenesisForgePreview): string {
  return [
    preview.genesisName,
    preview.growthSignature,
    preview.diversityScore,
  ].join('|');
}
