// characters.ts
/**
 * 可選角色（鐘塔魔女）。輕度差異：只動既有起始旋鈕（移速/命/炸/火力），無新彈幕系統。
 * mira 為預設，其數值＝現有常數基準（回歸保護）。
 */
import { START_LIVES, START_BOMBS } from './constants';

export type CharacterId = 'mira' | 'gale' | 'frost' | 'volt';
export type ShotType = 'balanced' | 'pierce' | 'fan' | 'chain';
export type BombType = 'inferno' | 'gust' | 'freeze' | 'storm';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  school: string;        // 英文流派（HUD/UI 用）
  schoolZh: string;      // 中文流派
  blurb: string;         // 一句定位描述
  speedMult: number;     // 併入既有 relic speedMult（相乘）
  startLives: number;
  startBombs: number;
  startPower: number;
  shotType: ShotType;    // 主射型
  bombType: BombType;    // 爆彈型
  color: number;         // Pixi tint（自機彈光點）
  colorCss: string;      // 選角畫面流派色光暈
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  mira: {
    id: 'mira', name: 'MIRA', school: 'INFERNO', schoolZh: '爆炎',
    blurb: '平衡型，爆炎強力',
    speedMult: 1, startLives: START_LIVES, startBombs: START_BOMBS, startPower: 1,
    shotType: 'balanced', bombType: 'inferno',
    color: 0xff5a4d, colorCss: '#ff5a4d',
  },
  gale: {
    id: 'gale', name: 'GALE', school: 'GALE', schoolZh: '疾風',
    blurb: '高機動，迴避見長（少 1 爆炎）',
    speedMult: 1.18, startLives: START_LIVES, startBombs: 2, startPower: 1,
    shotType: 'pierce', bombType: 'gust',
    color: 0x36e6ff, colorCss: '#36e6ff',
  },
  frost: {
    id: 'frost', name: 'FROST', school: 'FROST', schoolZh: '冰霜',
    blurb: '高續航，多 1 命（移速較慢）',
    speedMult: 0.88, startLives: 4, startBombs: START_BOMBS, startPower: 1,
    shotType: 'fan', bombType: 'freeze',
    color: 0xa8d8ff, colorCss: '#a8d8ff',
  },
  volt: {
    id: 'volt', name: 'VOLT', school: 'VOLT', schoolZh: '雷光',
    blurb: '高火力起手，但脆（命 2／少 1 爆炎）',
    speedMult: 1, startLives: 2, startBombs: 2, startPower: 2,
    shotType: 'chain', bombType: 'storm',
    color: 0xd0baff, colorCss: '#d0baff',
  },
};

export const DEFAULT_CHARACTER: CharacterId = 'mira';
