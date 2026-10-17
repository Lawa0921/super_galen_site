import {expect,test} from '@playwright/test';

test.use({viewport:{width:1600,height:1000}});

test('battle starts and restarts when the browser has no AudioContext',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>console.log('FAILED_REQUEST',request.url(),request.failure()?.errorText));
  await page.addInitScript(()=>{
    Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});
    Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true});
  });
  await page.goto('/games/rts');
  await page.locator('#rts-start').click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await expect(page.locator('#rts-start')).toBeEnabled();
  await page.locator('#rts-pause').click();await page.locator('#rts-volume').fill('0');
  await expect(page.locator('#rts-volume-value')).toHaveText('靜音');
  await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.id)).toBe('rts-canvas');
  await expect(page.locator('#rts-time')).not.toHaveText('00:00',{timeout:15000});
  await page.screenshot({path:test.info().outputPath('audio-missing.png')});
  expect(errors).toEqual([]);
});
