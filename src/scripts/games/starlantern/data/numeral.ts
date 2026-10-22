/** 1 to 10 in Chinese numerals: story text, scene titles and the memory notice carry no Arabic digits. */
export const numeral = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`numeral(${n}): only 1 to 10`);
  return '一二三四五六七八九十'[n - 1];
};
