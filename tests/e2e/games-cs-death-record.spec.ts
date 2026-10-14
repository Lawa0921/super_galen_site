import { test, expect } from '@playwright/test';

test('expired lethal effects still restore death HUD and a recreated spectator without replaying the cue', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL acceptance.');
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('record-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?record-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?record-source';
    export function createMatch(team){const m=make(team);window.recordMatch=m;return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function botInputs(m){return window.recordFire&&m.actors[0].hp>0?{3:{fire:true,yaw:Math.PI,pitch:0}}:{}}` }));
  // Defer only the observer. The real engine and renderer continue running,
  // and the real engine expires the shot before the spectator consumes it.
  await page.route(url => url.pathname === '/src/scripts/games/cs/spectator.ts' && !url.searchParams.has('record-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export {selectViewActor} from '/src/scripts/games/cs/spectator.ts?record-source';
    import {SpectatorState as Real} from '/src/scripts/games/cs/spectator.ts?record-source';
    export class SpectatorState {
      state=new Real();
      get viewId(){return this.state.viewId;} get death(){return this.state.death;}
      available(m){return this.state.available(m);} cycle(m,d){return this.state.cycle(m,d);}
      update(m){
        const record=m?.deaths.find(d=>d.actor.id===0);
        if(record&&m.time-record.shot.at<1)return 'none';
        if(window.recordRecreate){this.state=new Real();window.recordRecreate=false;window.recordRecreated=true;}
        const transition=this.state.update(m);
        if(record&&(transition==='died'||window.recordRecreated))window.recordObserved={transition,viewId:this.viewId,shots:m.shots.length,age:m.time-record.shot.at};
        return transition;
      }
    }` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/audio.ts' && !url.searchParams.has('record-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/audio.ts?record-source';
    import {CombatAudio as Real} from '/src/scripts/games/cs/audio.ts?record-source';
    export class CombatAudio extends Real{death(){window.recordDeathSounds=(window.recordDeathSounds||0)+1;super.death();}}` }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 }); await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(() => {
    const m = window.recordMatch; m.actors.forEach((p, i) => Object.assign(p, { x: 20, z: 18 + i }));
    Object.assign(m.actors[0], { x: 4, z: 20, hp: 8 }); Object.assign(m.actors[3], { x: 4, z: 14 }); window.recordFire = true;
  });
  await expect(page.locator('#cs-death-summary')).toContainText('VIPER');
  await expect(page.locator('#cs-death-summary')).toContainText('P9 手槍');
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  const observed = await page.evaluate(() => window.recordObserved);
  expect(observed).toMatchObject({ transition: 'died', viewId: 1, shots: 0 }); expect(observed.age).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.recordDeathSounds)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('delayed-death-summary.png') });
  await page.locator('#cs-spectate-next').click(); await expect(page.locator('#cs-spectating-name')).toHaveText('ECHO');
  await page.evaluate(() => { window.recordRecreate = true; });
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL');
  await expect(page.locator('#cs-death-summary')).toContainText('VIPER');
  expect(await page.evaluate(() => window.recordObserved)).toMatchObject({ transition: 'none', viewId: 1, shots: 0 });
  expect(await page.evaluate(() => window.recordDeathSounds)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('restored-death-summary.png') });
  await page.evaluate(() => { window.recordMatch.phase = 'round-over'; window.recordMatch.timer = .01; window.recordFire = false; });
  await expect(page.locator('#cs-shop')).toBeVisible(); await expect(page.locator('#cs-death')).toBeHidden();
  expect(await page.evaluate(() => window.recordMatch.deaths)).toEqual([]);
  await page.locator('#cs-deploy').click(); await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await expect(page.locator('#cs-health')).toHaveText('100');
  expect(await page.evaluate(() => window.recordDeathSounds)).toBe(1); expect(errors).toEqual([]);
});
