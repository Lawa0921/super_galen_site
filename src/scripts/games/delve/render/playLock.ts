// playLock.ts — 跨分頁的遊玩鎖（Web Locks）：同一個角色、同一個世界一次只能在一個分頁裡玩。
// 兩個分頁各自自動存檔同一個角色 / 世界會互相覆蓋（後寫的贏 → 物品複製或進度消失），所以開局前先拿鎖、整場遊戲握著，
// 回到標題 / 關掉頁面才放（分頁關掉時瀏覽器自動放掉）。瀏覽器沒有 Web Locks → 不上鎖（照舊）。

export const PLAY_LOCKED_MSG = '這個角色或世界正在另一個分頁中遊玩，請先關掉那個分頁。';

export const charLock = (id: string): string => `delve-char-${id}`;
export const worldLock = (slot: string): string => `delve-world-${slot}`;

/** 用到的 LockManager 部分（測試換成假的） */
export type LockApi = Pick<LockManager, 'request' | 'query'>;

/** 這個瀏覽器的 LockManager；沒有 → undefined */
export function browserLocks(): LockApi | undefined {
  try { return globalThis.navigator?.locks ?? undefined; } catch { return undefined; }
}

/** 拿一把鎖（拿不到不等）：拿到 → 回傳放鎖函式（鎖一直握到呼叫它）；別人握著 → null */
function hold(mgr: LockApi, name: string): Promise<(() => void) | null> {
  return new Promise((resolve, reject) => {
    mgr.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return undefined; }
      return new Promise<void>((done) => resolve(() => done()));
    }).catch(reject);
  });
}

/** 一場遊戲握著的鎖（角色 + 世界）；release 一次放掉全部 */
export class PlayLocks {
  private releases: (() => void)[] = [];
  constructor(private readonly mgr: LockApi | undefined) {}

  /** 全部拿到 → true 並一直握著；任一把被別的分頁握著 → 這次拿到的放掉、回 false。沒有 Web Locks → true（不上鎖） */
  async acquire(names: readonly string[]): Promise<boolean> {
    if (!this.mgr) return true;
    const got: (() => void)[] = [];
    const undo = (): void => { for (const f of got) f(); };
    for (const name of names) {
      let release: (() => void) | null;
      try { release = await hold(this.mgr, name); } catch (e) { undo(); throw e; }
      if (!release) { undo(); return false; }
      got.push(release);
    }
    this.releases.push(...got);
    return true;
  }

  release(): void {
    const r = this.releases;
    this.releases = [];
    for (const f of r) f();
  }
}

/** 這些鎖有沒有被（別的分頁）握著：刪角色 / 刪世界前檢查。這個分頁在標題時不握任何鎖，所以握著的一定是別人 */
export async function heldElsewhere(mgr: LockApi | undefined, names: readonly string[]): Promise<boolean> {
  if (!mgr) return false;
  const snap = await mgr.query();
  return (snap.held ?? []).some((l) => l.name !== undefined && names.includes(l.name));
}
