/** 五屬性：力量/敏捷/智力/魅力/體質 */
export type Stat = 'str' | 'dex' | 'int' | 'cha' | 'con';

export interface StatBlock {
  str: number;
  dex: number;
  int: number;
  cha: number;
  con: number;
}
