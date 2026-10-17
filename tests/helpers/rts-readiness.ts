import {expect,type Page} from '@playwright/test';
import type {RtsDebugHook} from '../../src/scripts/games/rts/debug-hook';

/** Wait for the development RTS page before installing a staged fixture. */
export async function waitForRtsLobby(page:Page,timeout=30000):Promise<void>{
  // The static lobby exists before its module mounts. Check the DEV hook without
  // calling time(), which needs a running match. Node-side polling also works
  // when the caller has installed Playwright's page clock.
  await expect.poll(()=>page.evaluate(()=>typeof (window as Window & {__rtsDebug?:RtsDebugHook}).__rtsDebug?.time),{timeout}).toBe('function');
  await expect(page.locator('#rts-lobby')).toBeVisible({timeout});
  await expect(page.locator('#rts-start')).toBeEnabled({timeout});
}
