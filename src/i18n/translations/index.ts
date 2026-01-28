/**
 * 翻譯檔案統一入口
 * 由 scripts/convert-i18n.ts 自動生成
 */

import { zh_TW } from './zh-TW';
import { zh_CN } from './zh-CN';
import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';

export const translations = {
  'zh-TW': zh_TW,
  'zh-CN': zh_CN,
  'en': en,
  'ja': ja,
  'ko': ko
} as const;

export type Translations = typeof translations;
export type Language = keyof Translations;

export default translations;
