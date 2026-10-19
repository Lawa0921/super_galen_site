// avatarPalette.ts — 角色外觀的色階（全部取自 pixel.ts 統一色票；索引對應 engine/appearance.ts 的選項）。
//   髮 5 階：[最暗, 陰影, 底色, 亮部, 高光（天使光環）]
//   布 5 階：[縫線 / 最暗, 深影, 陰影, 底色, 高光]
//   膚 5 階：[嘴 / 最暗, 深影, 陰影, 底色, 高光]；腮紅另外一色
//   瞳 3 階：[深, 中, 淺]（高光一律白）
import { ramp, hex, type RGB } from './pixel';

export const HAIR_RAMPS: RGB[][] = [
  ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#707490'), // 烏黑（帶藍光澤）
  ramp('#1c1424', '#472819', '#623924', '#7c4c2e', '#b07a4b'), // 深棕
  ramp('#2a1810', '#623924', '#7c4c2e', '#b07a4b', '#d8ba76'), // 栗色
  ramp('#7c4c2e', '#c99660', '#d8ba76', '#ffd86a', '#fff4c0'), // 金
  ramp('#423f54', '#707490', '#b4b9c8', '#cceaf8', '#ffffff'), // 銀白
  ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee'), // 湛藍
  ramp('#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8'), // 青綠
  ramp('#7a5a8c', '#b8788e', '#e890b0', '#ffc8dc', '#ffffff'), // 櫻粉
  ramp('#6c1e14', '#8c2038', '#c8344c', '#e890b0', '#ffc8dc'), // 緋紅
  ramp('#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50'), // 嫩綠
  ramp('#2c2450', '#463c78', '#7a5a8c', '#9a6ee0', '#c4a0f0'), // 紫藤
  ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'), // 橘
];

export const EYE_RAMPS: RGB[][] = [
  ramp('#18204a', '#3e74c4', '#94c8ee'), // 藍
  ramp('#16301e', '#468a34', '#93cc50'), // 翠綠
  ramp('#6c1e14', '#e8701c', '#ffd86a'), // 琥珀
  ramp('#2c2450', '#9a6ee0', '#c4a0f0'), // 紫羅蘭
  ramp('#6c1e14', '#c8344c', '#e890b0'), // 紅
  ramp('#2a1810', '#7c4c2e', '#c99660'), // 茶
  ramp('#18204a', '#2c8692', '#4aaeb0'), // 碧青
  ramp('#7a5a8c', '#e890b0', '#ffc8dc'), // 桃紅
  ramp('#1c1424', '#5e5e74', '#b4b9c8'), // 銀灰
];

export const SKIN_RAMPS: RGB[][] = [
  ramp('#b07a4b', '#d98f66', '#f2b888', '#ffe2cc', '#fff4c0'), // 白皙
  ramp('#7c4c2e', '#b07a4b', '#d98f66', '#f2b888', '#ffe2cc'), // 淺色
  ramp('#623924', '#7c4c2e', '#b07a4b', '#d98f66', '#f2b888'), // 小麥
  ramp('#2a1810', '#623924', '#966139', '#c99660', '#d8ba76'), // 褐色
  ramp('#1c1424', '#472819', '#623924', '#7c4c2e', '#b07a4b'), // 深色
];
export const BLUSH: RGB[] = [hex('#ffc8dc'), hex('#e890b0'), hex('#e890b0'), hex('#b8788e'), hex('#b8788e')];

export const CLOTH_RAMPS: RGB[][] = [
  ramp('#707490', '#858aa0', '#b4b9c8', '#ffffff', '#ffffff'), // 白
  ramp('#0c0a12', '#0c0a12', '#1c1424', '#2c2838', '#423f54'), // 黑
  ramp('#0c0a12', '#18204a', '#2c2450', '#2c4486', '#3e74c4'), // 藏青
  ramp('#2a1810', '#6c1e14', '#8c2038', '#c8344c', '#e890b0'), // 紅
  ramp('#7a5a8c', '#b8788e', '#e890b0', '#ffc8dc', '#ffffff'), // 粉紅
  ramp('#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8'), // 天藍
  ramp('#16301e', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0'), // 青綠
  ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c'), // 森綠
  ramp('#623924', '#966139', '#c99660', '#d8ba76', '#f2e2b0'), // 卡其
  ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139'), // 棕
  ramp('#1c1424', '#2c2450', '#463c78', '#7a5a8c', '#9a6ee0'), // 紫
  ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'), // 橘
];

/** 皮革 / 靴 / 包包 */
export const LEATHER = ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e');
/** 深色鞋 / 襪 */
export const DARK = ramp('#0c0a12', '#0c0a12', '#1c1424', '#2c2838', '#423f54');
export const WHITE = CLOTH_RAMPS[0];
export const GOLD = hex('#ffd86a');
export const EYE_WHITE = hex('#ffffff');
export const MOUTH = hex('#8c2038');
export const TONGUE = hex('#e890b0');
export const SWEAT = ramp('#5c9ce0', '#94c8ee', '#ffffff');
export const GLASSES = hex('#423f54');

export const hairRamp = (i: number): RGB[] => HAIR_RAMPS[i] ?? HAIR_RAMPS[0];
export const eyeRamp = (i: number): RGB[] => EYE_RAMPS[i] ?? EYE_RAMPS[0];
export const skinRamp = (i: number): RGB[] => SKIN_RAMPS[i] ?? SKIN_RAMPS[1];
export const clothRamp = (i: number): RGB[] => CLOTH_RAMPS[i] ?? CLOTH_RAMPS[0];
/** 某色階整體壓暗一階（後面那條腿 / 遠側的馬尾）：每格換成前一階，最暗那格不變 */
export const darker = (r: RGB[]): RGB[] => r.map((_, i) => r[Math.max(0, i - 1)]);
