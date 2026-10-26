// gen2Names.ts — gen2 地區名字的唯一化（M2a Task 17b；discovery.ts 的 Gen2Kit 用）。
//   · 起點仍是 id 雜湊在名單上挑的那個（discovery.ts 算好傳進來）。同一組（kind）分兩輪：固定名字（沙灘、家鄉林地）先佔位、不改；
//     第一輪起點名字沒被佔的直接定名（同起點的由 id 最小者拿到）；第二輪才讓衝突者依 id 由小到大從起點往後找名單裡還沒用的（繞回開頭），
//     整份名單都用過才加後綴「二」「三」…（同舊世界 Namer 的後綴），從起點起依序試。→ 起點沒和別人衝突的地區一定拿到起點名字。
//   · 純函式：只看傳進來的整組（id 集合 + 各自的起點），與輸入順序、查詢順序無關——同種子的主機 / 客人逐位相同。
//   · 用在家鄉（gen2HomeRegions 的全部地區，依 kind 分組）與單一份藍圖的部件（外圍的地城房間）；外圍之間不唯一化（可以重複）。

/** 一個要命名的地區：fixed = 固定名字；否則 list[start] 是雜湊挑的起點 */
export type NameSpec =
  | { id: number; kind: string; fixed: string }
  | { id: number; kind: string; list: readonly string[]; start: number };

const DIGITS = '一二三四五六七八九';
/** 2..99 → 中文數字（二、十、十一、二十一…）；其他 → 阿拉伯數字 */
export function numeral(k: number): string {
  if (!Number.isInteger(k) || k < 1 || k > 99) return String(k);
  const t = Math.floor(k / 10), u = k % 10;
  return (t === 0 ? '' : t === 1 ? '十' : DIGITS[t - 1] + '十') + (u === 0 ? '' : DIGITS[u - 1]);
}

/** specs → id → 名字；同 kind 的不同 id 一定不同名（固定名字彼此相同時照給，那是呼叫端的事） */
export function uniqueNames(specs: readonly NameSpec[]): Map<number, string> {
  const out = new Map<number, string>(), groups = new Map<string, NameSpec[]>();
  for (const s of specs) {
    let g = groups.get(s.kind);
    if (!g) { g = []; groups.set(s.kind, g); }
    g.push(s);
  }
  for (const g of groups.values()) {
    const used = new Set<string>();
    for (const s of g) if ('fixed' in s) { used.add(s.fixed); out.set(s.id, s.fixed); }
    const picks = g.filter((s): s is Extract<NameSpec, { list: readonly string[] }> => !('fixed' in s)).sort((a, b) => a.id - b.id);
    // 第一輪：起點名字沒被固定名字佔、也沒有 id 更小的同起點者 → 直接定名（沒碰撞的一律保留起點，不會被別人擠走）
    const later: typeof picks = [];
    for (const s of picks) {
      const c = s.list.length ? s.list[s.start % s.list.length] : '';
      if (c && !used.has(c)) { used.add(c); out.set(s.id, c); } else later.push(s);
    }
    // 第二輪：衝突者依 id 由小到大，從起點往後找空位
    for (const s of later) {
      const L = s.list.length;
      let name = '';
      // 第 round 輪：round 1 = 名單本身，之後 = 名單 + 後綴（二、三…）
      for (let round = 1; !name; round++) {
        const suf = round === 1 ? '' : numeral(round);
        for (let j = 0; j < L && !name; j++) { const c = s.list[(s.start + j) % L] + suf; if (!used.has(c)) name = c; }
        // 空名單（正式碼不會有）：用 kind + 編號，照樣避開已用的
        if (L === 0 && !used.has(s.kind + numeral(round))) name = s.kind + numeral(round);
      }
      used.add(name);
      out.set(s.id, name);
    }
  }
  return out;
}
