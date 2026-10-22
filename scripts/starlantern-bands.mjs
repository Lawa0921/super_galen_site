// The rune bands of 星燈迷宮's suggested builds (plan 8h): opt-in, not in the default vitest run. One file a member,
// at most two workers; every number printed (BALANCE_REPORT). Extra arguments go to vitest (e.g. a member's file name).
import { spawnSync } from 'node:child_process';

const args = ['vitest', 'run', '--maxWorkers=2', '--testTimeout=3000000', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['builds.bands'])];
const r = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, BANDS: '1', BALANCE_REPORT: process.env.BALANCE_REPORT ?? '1' } });
process.exit(r.status ?? 1);
