import {test,expect} from '@playwright/test';
import {waitForRtsLobby} from '../helpers/rts-readiness';

test('mounted RTS lobby is ready while an unrelated request remains pending',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');
  let release!:()=>void,observed!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const requested=new Promise<void>(resolve=>{observed=resolve;});
  await page.route('**/__rts-readiness-pending',async route=>{
    observed();await held;await route.fulfill({status:204});
  });
  const response=page.waitForResponse('**/__rts-readiness-pending');
  await page.evaluate(()=>{void fetch('/__rts-readiness-pending');});
  await requested;
  try{
    await expect(page.waitForLoadState('networkidle',{timeout:1000})).rejects.toThrow('Timeout');
    await waitForRtsLobby(page,3000);
    await page.locator('#rts-start').click();
    await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    expect(errors).toEqual([]);
  }finally{release();await response;}
});

test('static lobby cannot report ready when the RTS module fails to load',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.route('**/src/scripts/games/rts/main.ts*',route=>route.abort());
  await page.goto('/games/rts');
  await expect(page.locator('#rts-lobby')).toBeVisible();
  await expect(page.locator('#rts-start')).toBeEnabled();
  await expect(waitForRtsLobby(page,1000)).rejects.toThrow();
});
