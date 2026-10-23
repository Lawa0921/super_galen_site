// gen2Flag.test.ts — Task 17：開發旗標（?gen2=1 / 0 寫入 / 清掉 localStorage 'delve.gen2'；都沒有 → 看 store）；
// 只在開發版（import.meta.env.DEV）有效：正式版一律 false、不讀不寫 store（final fix 2）
import { describe, expect, it } from 'vitest';
import { GEN2_FLAG_KEY, gen2Flag } from './gen2Flag';

type FlagStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function fakeStore(): FlagStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}
function throwingStore(): FlagStore {
  const no = (): never => { throw new Error('SecurityError'); };
  return { getItem: no, setItem: no, removeItem: no };
}

describe('gen2Flag', () => {
  it('gen2Flag', () => {
    const s = fakeStore();
    expect(gen2Flag('', s, true)).toBe(false); expect(gen2Flag('?gen2=1', s, true)).toBe(true); expect(gen2Flag('', s, true)).toBe(true);
    expect(gen2Flag('?gen2=0', s, true)).toBe(false); expect(gen2Flag('', s, true)).toBe(false); expect(gen2Flag('', throwingStore(), true)).toBe(false);
  });

  it('寫入的鍵與值：?gen2=1 → delve.gen2 = "1"；?gen2=0 → 刪鍵；其他值不動 store', () => {
    const s = fakeStore();
    gen2Flag('?seed=x&gen2=1', s, true);
    expect([...s.data]).toEqual([[GEN2_FLAG_KEY, '1']]);
    expect(GEN2_FLAG_KEY).toBe('delve.gen2');
    expect(gen2Flag('?gen2=yes', s, true)).toBe(true);   // 不認得的值 → 照 store
    expect([...s.data]).toEqual([['delve.gen2', '1']]);
    gen2Flag('?gen2=0&seed=x', s, true);
    expect(s.data.size).toBe(0);
    s.data.set('delve.gen2', 'true');                // 只有 '1' 算開
    expect(gen2Flag('', s, true)).toBe(false);
  });

  it('沒有 store（無 localStorage）：網址照樣決定這一次；store 丟例外時 ?gen2=1 仍是 true', () => {
    expect(gen2Flag('?gen2=1', null, true)).toBe(true);
    expect(gen2Flag('', null, true)).toBe(false);
    expect(gen2Flag('?gen2=1', throwingStore(), true)).toBe(true);
    expect(gen2Flag('?gen2=0', throwingStore(), true)).toBe(false);
  });

  it('正式版（dev = false）：?gen2=1 與記住的 "1" 都無效、回 false；不讀也不寫 store', () => {
    const s = fakeStore(); s.data.set(GEN2_FLAG_KEY, '1');
    let touched = 0;
    const spy: FlagStore = {
      getItem: (k) => { touched++; return s.getItem(k); },
      setItem: (k, v) => { touched++; s.setItem(k, v); },
      removeItem: (k) => { touched++; s.removeItem(k); },
    };
    expect(gen2Flag('?gen2=1', spy, false)).toBe(false);
    expect(gen2Flag('', spy, false)).toBe(false);
    expect(gen2Flag('?gen2=0', spy, false)).toBe(false);
    expect(touched).toBe(0);
    expect([...s.data]).toEqual([[GEN2_FLAG_KEY, '1']]);
    expect(gen2Flag('?gen2=1', throwingStore(), false)).toBe(false);
    // 同一份 store 回到開發版：照舊看記住的值
    expect(gen2Flag('', s, true)).toBe(true);
  });
});
