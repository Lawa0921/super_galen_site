import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.beforeEach(({ browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL combat acceptance.');
});

test('actual shot events use wall occlusion and follow the spectator listening position', async ({ page }, testInfo) => {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('acoustic-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?acoustic-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?acoustic-source';
    export function createMatch(team){const m=make(team);window.acousticMatch=m;
      Object.assign(m.actors[0],{x:-8,z:0});Object.assign(m.actors[1],{x:12,z:7});
      Object.assign(m.actors[3],{x:8,z:0,weapon:'rifle',ammo:30});return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body:
    'export function botInputs(){const inputs=window.acousticInputs??{};window.acousticInputs={};return inputs;}' }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/audio.ts' && !url.searchParams.has('acoustic-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/audio.ts?acoustic-source';
    import {CombatAudio as Real} from '/src/scripts/games/cs/audio.ts?acoustic-source';
    export class CombatAudio extends Real{shot(distance,weapon,pan,occluded){const played=super.shot(distance,weapon,pan,occluded);
      (window.acousticShots??=[]).push({distance,weapon,pan,occluded,played});return played;}}` }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 }); await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  // Pointer Lock can resolve before the buy -> live simulation step. The
  // one-shot bot fixture would otherwise consume its fire input during buy.
  await expect.poll(() => page.evaluate(() => window.acousticMatch?.phase)).toBe('live');
  await page.evaluate(() => { window.acousticInputs = { 3: { fire: true } }; });
  await expect.poll(() => page.evaluate(() => window.acousticShots?.length)).toBe(1);
  expect(await page.evaluate(() => window.acousticShots[0])).toMatchObject({ distance: 16, pan: 1, occluded: true, played: true });
  await page.evaluate(() => {
    Object.assign(window.acousticMatch.actors[0], { x: 0, z: 7 });
    Object.assign(window.acousticMatch.actors[3], { z: 7, cooldown: 0 }); window.acousticInputs = { 3: { fire: true } };
  });
  await expect.poll(() => page.evaluate(() => window.acousticShots.length)).toBe(2);
  expect(await page.evaluate(() => window.acousticShots[1])).toMatchObject({ distance: 8, pan: 1, occluded: false, played: true });
  await page.evaluate(() => {
    window.acousticMatch.actors[3].cooldown = 0; window.acousticInputs = { 3: { fire: true, yaw: Math.PI / 2 } };
  });
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL', { timeout: 5000 });
  await page.evaluate(() => {
    window.acousticMatch.actors[3].cooldown = 0; window.acousticInputs = { 3: { fire: true, yaw: 0 } };
  });
  await expect.poll(() => page.evaluate(() => window.acousticShots.length)).toBe(4);
  expect(await page.evaluate(() => window.acousticShots[3])).toMatchObject({ distance: 4, pan: -1, occluded: false, played: true });
  await page.screenshot({ path: testInfo.outputPath('spectator-acoustics.png') });
  await writeFile(testInfo.outputPath('shot-cues.json'), JSON.stringify(await page.evaluate(() => window.acousticShots), null, 2));
  await testInfo.attach('shot-cues.json', { path: testInfo.outputPath('shot-cues.json'), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('native Web Audio produces quieter, darker covered shots with consistent stereo direction', async ({ page }, testInfo) => {
  await page.goto('/games/cs'); await page.locator('#cs-start').waitFor({ state: 'visible' });
  const samples = await page.evaluate(async () => {
    const { CombatAudio } = await import('/src/scripts/games/cs/audio.ts');
    const Original = window.AudioContext, random = Math.random, results = [];
    try {
      for (const [name, occluded, pan] of [['direct-left', false, -.8], ['covered-left', true, -.8], ['direct-right', false, .8]] as const) {
        const context = new OfflineAudioContext(2, 24000, 48000);
        // Native DSP renders the production graph. Only the unlock/running
        // lifecycle is adapted; the preceding actual-game test covers that.
        const adapter = { sampleRate: context.sampleRate, currentTime: 0, state: 'running', destination: context.destination, resume: async () => {} };
        for (const method of ['createGain','createBuffer','createBufferSource','createBiquadFilter','createStereoPanner','createOscillator']) adapter[method] = context[method].bind(context);
        window.AudioContext = class { constructor() { return adapter; } } as typeof AudioContext;
        let seed = 971; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        const audio = new CombatAudio(); await audio.unlock(); Math.random = random;
        audio.shot(16, 'rifle', pan, occluded);
        const rendered = await context.startRendering(), channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
        const power = channels.map(channel => channel.reduce((sum, value) => sum + value * value, 0));
        let difference = 0; for (const channel of channels) for (let i = 1; i < channel.length; i++) difference += (channel[i] - channel[i - 1]) ** 2;
        const bytes = new Uint8Array(44 + rendered.length * 4), view = new DataView(bytes.buffer);
        const text = (at: number, value: string) => [...value].forEach((char, i) => bytes[at + i] = char.charCodeAt(0));
        text(0,'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8,'WAVEfmt '); view.setUint32(16,16,true);
        view.setUint16(20,1,true); view.setUint16(22,2,true); view.setUint32(24,48000,true); view.setUint32(28,192000,true);
        view.setUint16(32,4,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,bytes.length-44,true);
        for (let i=0;i<rendered.length;i++) for(let ch=0;ch<2;ch++) view.setInt16(44+(i*2+ch)*2, Math.round(Math.max(-1,Math.min(1,channels[ch][i]))*32767), true);
        results.push({ name, power, energy: power[0]+power[1], differenceRatio: difference/(power[0]+power[1]), wav: Array.from(bytes) });
      }
    } finally { window.AudioContext = Original; Math.random = random; }
    return results;
  });
  const [direct, covered, right] = samples;
  expect(direct.energy).toBeGreaterThan(.001); expect(covered.energy).toBeGreaterThan(0);
  expect(covered.energy).toBeLessThan(direct.energy * .15);
  expect(covered.differenceRatio).toBeLessThan(direct.differenceRatio * .65);
  for (const sample of [direct, covered]) expect(sample.power[0]).toBeGreaterThan(sample.power[1] * 20);
  expect(right.power[1]).toBeGreaterThan(right.power[0] * 20);
  await mkdir(testInfo.outputPath(), { recursive: true });
  for (const { name, wav } of samples) {
    await writeFile(testInfo.outputPath(`${name}.wav`), Buffer.from(wav));
    await testInfo.attach(`${name}.wav`, { path: testInfo.outputPath(`${name}.wav`), contentType: 'audio/wav' });
  }
  await writeFile(testInfo.outputPath('native-audio.json'), JSON.stringify(samples.map(({ wav, ...stats }) => stats), null, 2));
  await testInfo.attach('native-audio.json', { path: testInfo.outputPath('native-audio.json'), contentType: 'application/json' });
});

test('wall shots play one nearby material impact and do not replay on following frames or resume', async ({ page }, testInfo) => {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('impact-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?impact-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?impact-source';
    export function createMatch(team){const m=make(team);window.impactMatch=m;return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body: 'export function botInputs(){return {}}' }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/audio.ts' && !url.searchParams.has('impact-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/audio.ts?impact-source';
    import {CombatAudio as Base} from '/src/scripts/games/cs/audio.ts?impact-source';
    export class CombatAudio extends Base{impact(cue){const played=super.impact(cue);if(cue)(window.impactSounds??=[]).push({...cue,played});return played;}}` }));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 }); await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(() => {
    window.impactMatch.actors.forEach((p, i) => Object.assign(p, { x: 20, z: 18 + i }));
    Object.assign(window.impactMatch.actors[0], { x: 4, z: 10 }); window.impactSounds = [];
  });
  await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.impactSounds.length)).toBe(1);
  const cue = await page.evaluate(() => window.impactSounds[0]);
  expect(cue.surface).toBe('stone'); expect(cue.played).toBe(true);
  expect(cue.gain).toBeGreaterThan(.5); expect(cue.gain).toBeLessThan(.6); expect(Math.abs(cue.pan)).toBeLessThan(.05);
  await page.waitForTimeout(500); expect(await page.evaluate(() => window.impactSounds.length)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('wall-impact.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('#cs-pause')).toBeVisible();
  await page.locator('#cs-resume').click(); await expect(page.locator('#cs-pause')).toBeHidden();
  await page.waitForTimeout(200); expect(await page.evaluate(() => window.impactSounds.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('spectator weapons, HUD, scope and reload follow the selected teammate and reset on revival', async ({page},testInfo)=>{
  await page.route(url=>url.pathname==='/src/scripts/games/cs/engine.ts'&&!url.searchParams.has('view-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?view-source';import {createMatch as make} from '/src/scripts/games/cs/engine.ts?view-source';
    export function createMatch(team){const m=make(team);window.viewMatch=m;return m;}`}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:`export function botInputs(){const inputs=window.viewInputs??{};window.viewInputs=Object.fromEntries(Object.entries(inputs).map(([id,input])=>[id,{...input,reload:false}]));return inputs;}`}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/renderer.ts'&&!url.searchParams.has('view-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    import {GameRenderer as Base} from '/src/scripts/games/cs/renderer.ts?view-source';
    export class GameRenderer extends Base{constructor(...a){super(...a);window.viewRenderer=this;}
      render(m,...a){super.render(m,...a);if(m&&this.gun&&window.viewFrames?.length<1200){
        const actor=m.actors.find(p=>p.id===this.viewActorId),action=document.querySelector('#cs-action');
        if(actor.reload>0&&!action.hidden&&action.textContent.includes('換彈')&&!window.viewReloadBounds){const x=action.getBoundingClientRect(),y=document.querySelector('#cs-death').getBoundingClientRect();window.viewReloadBounds={actionBottom:x.bottom,cardTop:y.top};}
        window.viewFrames.push({at:m.time,actor:this.viewActorId,fov:this.camera.fov,scope:document.querySelector('#cs-root').classList.contains('cs-scoped'),gun:this.gun.visible,weapon:this.currentWeapon,recoil:this.recoil,flashes:this.effects.viewFlash.active,casings:this.effects.stats().casings,reload:actor.reload,ammo:actor.ammo,lower:this.weaponMotion.reload.lower,action:action.hidden?'':action.textContent});}}}`}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:30000});await page.locator('#cs-deploy').click();
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(()=>{
    const m=window.viewMatch;m.actors.forEach((p,i)=>Object.assign(p,{x:20,z:18+i}));
    Object.assign(m.actors[1],{x:0,z:20,weapon:'pistol',ammo:7,reserve:48,hp:74,armor:25});
    Object.assign(m.actors[2],{x:3,z:20,weapon:'rifle',ammo:19,reserve:61,hp:83,armor:50});
    m.actors[0].hp=0;window.viewFrames=[];
  });
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL');
  await expect(page.locator('#cs-ammo')).toHaveText('7');await expect(page.locator('#cs-health')).toHaveText('74');
  await expect.poll(()=>page.evaluate(()=>window.viewRenderer.gun.visible)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('spectator-pistol.png')});
  await page.locator('#cs-spectate-next').click();await expect(page.locator('#cs-spectating-name')).toHaveText('ECHO');
  await expect(page.locator('#cs-weapon-name')).toContainText('AR-4');await expect(page.locator('#cs-ammo')).toHaveText('19');await expect(page.locator('#cs-reserve')).toHaveText('61');
  await expect.poll(()=>page.evaluate(()=>window.viewRenderer.currentWeapon)).toBe('rifle');
  const dead=await page.evaluate(()=>{const p=window.viewMatch.actors[0];return [p.x,p.z,p.shot,p.ammo,p.reload]});
  await page.keyboard.press('KeyR');await page.mouse.click(10,300);await page.keyboard.press('KeyW');
  expect(await page.evaluate(()=>{const p=window.viewMatch.actors[0];return [p.x,p.z,p.shot,p.ammo,p.reload]})).toEqual(dead);
  await page.evaluate(()=>{window.viewInputs={2:{fire:true,yaw:0,pitch:0}};window.viewFrames=[];});
  await expect.poll(()=>page.evaluate(()=>window.viewFrames.some(f=>f.flashes>0&&f.casings>0&&f.recoil>0))).toBe(true);
  await page.evaluate(()=>{window.viewInputs={};});
  await page.screenshot({path:testInfo.outputPath('spectator-rifle.png')});
  await page.evaluate(()=>{window.viewFrames=[];window.viewReloadBounds=null;window.viewInputs={2:{reload:true}};});
  await expect.poll(()=>page.evaluate(()=>window.viewFrames.some(f=>f.reload>0)&&window.viewFrames.some(f=>f.reload===0&&f.ammo===30))).toBe(true);
  const rifleReload=await page.evaluate(()=>({frames:window.viewFrames.slice(),bounds:window.viewReloadBounds}));
  const activeRifle=rifleReload.frames.filter(f=>f.reload>0);
  expect(activeRifle.length).toBeGreaterThan(0);expect(Math.max(...activeRifle.map(f=>f.lower))).toBeGreaterThan(.5);
  expect(activeRifle.every(f=>f.lower>=0&&f.lower<=1)).toBe(true);expect(activeRifle.some(f=>f.action.includes('換彈'))).toBe(true);
  expect(rifleReload.bounds).not.toBeNull();expect(rifleReload.bounds.actionBottom).toBeLessThan(rifleReload.bounds.cardTop);
  await page.screenshot({path:testInfo.outputPath('spectator-reload-complete.png')});
  await expect(page.locator('#cs-ammo')).toHaveText('30',{timeout:4000});
  await page.evaluate(()=>{Object.assign(window.viewMatch.actors[2],{weapon:'sniper',ammo:4,reserve:20});window.viewInputs={2:{aim:true}};window.viewFrames=[];});
  await expect(page.locator('#cs-root')).toHaveClass(/cs-scoped/);
  await expect(page.locator('#cs-weapon-name')).toContainText('SR-8');await expect(page.locator('#cs-ammo')).toHaveText('4');
  await expect.poll(()=>page.evaluate(()=>window.viewRenderer.gun.visible)).toBe(false);
  await page.screenshot({path:testInfo.outputPath('spectator-scope.png')});
  await page.evaluate(()=>{window.viewFrames=[];window.viewReloadBounds=null;window.viewInputs={2:{aim:true,reload:true}};});
  await expect.poll(()=>page.evaluate(()=>window.viewFrames.some(f=>f.reload>0)&&window.viewFrames.some(f=>f.reload===0&&f.ammo===5&&f.scope&&!f.gun))).toBe(true);
  const sniperReload=await page.evaluate(()=>window.viewFrames.slice());
  const activeSniper=sniperReload.filter(f=>f.reload>0);
  expect(activeSniper.length).toBeGreaterThan(0);expect(activeSniper.every(f=>!f.scope&&f.gun)).toBe(true);
  expect(activeSniper.some(f=>f.action.includes('換彈'))).toBe(true);
  const reloadPath=testInfo.outputPath('spectator-reload-frames.json');await writeFile(reloadPath,JSON.stringify({rifleReload,sniperReload}));
  await testInfo.attach('spectator-reload-frames',{path:reloadPath,contentType:'application/json'});
  await expect(page.locator('#cs-ammo')).toHaveText('5',{timeout:4000});await expect(page.locator('#cs-root')).toHaveClass(/cs-scoped/);
  expect(await page.evaluate(()=>window.viewFrames.filter(f=>f.weapon==='sniper'&&f.scope===f.gun))).toEqual([]);
  await page.locator('#cs-spectate-prev').click();await expect(page.locator('#cs-root')).not.toHaveClass(/cs-scoped/);
  await expect.poll(()=>page.evaluate(()=>({weapon:window.viewRenderer.currentWeapon,visible:window.viewRenderer.gun.visible,casings:window.viewRenderer.effects.stats().casings,recoil:window.viewRenderer.recoil}))).toEqual({weapon:'pistol',visible:true,casings:0,recoil:0});
  expect(await page.evaluate(()=>window.viewFrames.find(f=>f.actor===1).fov)).toBe(78);
  await page.evaluate(()=>{Object.assign(window.viewMatch.actors[1],{weapon:'smg',ammo:22});});
  await expect(page.locator('#cs-weapon-name')).toContainText('VECT');await expect.poll(()=>page.evaluate(()=>window.viewRenderer.currentWeapon)).toBe('smg');
  await page.setViewportSize({width:800,height:600});await page.screenshot({path:testInfo.outputPath('spectator-compact.png')});
  await page.evaluate(()=>{window.viewMatch.phase='round-over';window.viewMatch.timer=.01;window.viewInputs={};});
  await expect(page.locator('#cs-shop')).toBeVisible();await expect(page.locator('#cs-death')).toBeHidden();
  await page.locator('#cs-deploy').click();await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
  await expect(page.locator('#cs-health')).toHaveText('100');await expect(page.locator('#cs-weapon-name')).toContainText('P9');
  await expect.poll(()=>page.evaluate(()=>window.viewRenderer.gun.visible)).toBe(true);expect(errors).toEqual([]);
});

test('lethal damage confirms the killer, releases controls, and follows selectable live teammates until round reset', async ({ page }, testInfo) => {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('spectator-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?spectator-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?spectator-source';
    export function createMatch(team){const m=make(team);window.csSpectatorMatch=m;return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function botInputs(m){return (window.csLethalBot&&m.actors[0].hp>0)||window.csSpectatorFire?{3:{fire:true,yaw:Math.PI,pitch:0}}:{}}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/renderer.ts' && !url.searchParams.has('spectator-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    import {GameRenderer as Base} from '/src/scripts/games/cs/renderer.ts?spectator-source';
    export class GameRenderer extends Base{constructor(...args){super(...args);window.csSpectatorRenderer=this;}
      render(m,...args){super.render(m,...args);if(m?.actors[0].hp===0)(window.csDeathViews??=[]).push({time:m.time,deathAt:m.deaths.findLast(d=>d.actor.id===0&&d.shot.round===m.round)?.shot.at,x:this.camera.position.x,z:this.camera.position.z});}}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/audio.ts' && !url.searchParams.has('spectator-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/audio.ts?spectator-source';
    import {CombatAudio as Base} from '/src/scripts/games/cs/audio.ts?spectator-source';
    export class CombatAudio extends Base{death(){window.csDeathSounds=(window.csDeathSounds||0)+1;super.death();}
      shot(distance,weapon,pan){(window.csHeardShots??=[]).push({distance,weapon,pan});super.shot(distance,weapon,pan);}}` }));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 }); await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.mouse.down({ button: 'right' });
  await page.evaluate(() => {
    const m = window.csSpectatorMatch; m.actors.forEach((a, i) => Object.assign(a, { x: 20, z: 18 + i }));
    Object.assign(m.actors[0], { x: 4, z: 20, hp: 8 }); Object.assign(m.actors[3], { x: 4, z: 14 }); window.csLethalBot = true;
  });
  await expect(page.locator('#cs-death')).toBeVisible();
  await expect(page.locator('#cs-death-summary')).toContainText('VIPER');
  await expect(page.locator('#cs-death-summary')).toContainText('P9 手槍');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#cs-pause')).toBeHidden();
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL');
  const deathViews = await page.evaluate(() => window.csDeathViews);
  await testInfo.attach('death-view-clock', { body: JSON.stringify(deathViews), contentType: 'application/json' });
  // The hold starts at the lethal event, which may precede the first rendered
  // dead frame by multiple fixed simulation steps during catch-up.
  expect(deathViews.every(row => Number.isFinite(row.deathAt))).toBe(true);
  const heldViews = deathViews.filter(row => row.time < row.deathAt + .65);
  expect(heldViews.length).toBeGreaterThan(0);
  expect(heldViews.every(row => Math.hypot(row.x - 4, row.z - 20) < .001)).toBe(true);
  await expect(page.locator('#cs-root')).not.toHaveClass(/cs-aiming/); await page.mouse.up({ button: 'right' });
  const time = await page.evaluate(() => window.csSpectatorMatch.time);
  await expect.poll(() => page.evaluate(() => window.csSpectatorMatch.time)).toBeGreaterThan(time + .2);
  await page.locator('#cs-spectate-next').click(); await expect(page.locator('#cs-spectating-name')).toHaveText('ECHO');
  await expect.poll(() => page.evaluate(() => {
    const m = window.csSpectatorMatch, c = window.csSpectatorRenderer.camera.position; return Math.hypot(c.x - m.actors[2].x, c.z - m.actors[2].z);
  })).toBeLessThan(.001);
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL');
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#cs-spectating-name')).toHaveText('ECHO');
  // A real bot shot after switching is heard from ECHO's location, not the corpse.
  const heardCount = await page.evaluate(() => { window.csSpectatorFire = true; return window.csHeardShots.length; });
  await expect.poll(() => page.evaluate(() => window.csHeardShots.length)).toBeGreaterThan(heardCount);
  const sound = await page.evaluate(() => {
    window.csSpectatorFire = false;
    const m = window.csSpectatorMatch, view = m.actors[2], shooter = m.actors[3];
    return { actual: window.csHeardShots.at(-1), distance: Math.hypot(view.x - shooter.x, view.y - shooter.y, view.z - shooter.z), pan: Math.sin(view.yaw - Math.atan2(view.x - shooter.x, view.z - shooter.z)) };
  });
  expect(sound.actual.distance).toBeCloseTo(sound.distance, 5); expect(sound.actual.pan).toBeCloseTo(sound.pan, 5);
  const deadPosition = await page.evaluate(() => { const p=window.csSpectatorMatch.actors[0]; return [p.x,p.z,p.shot]; });
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyR'); await page.mouse.click(10, 300); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => { const p=window.csSpectatorMatch.actors[0]; return [p.x,p.z,p.shot]; })).toEqual(deadPosition);
  await page.screenshot({ path: testInfo.outputPath('spectator-desktop.png') });
  await page.setViewportSize({ width: 800, height: 600 }); await page.screenshot({ path: testInfo.outputPath('spectator-compact.png') });
  const bounds = await page.locator('#cs-death').boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(800);
  await page.keyboard.press('Escape'); await expect(page.locator('#cs-pause')).toBeVisible();
  await page.locator('#cs-resume').click(); await expect(page.locator('#cs-pause')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#cs-death-summary')).toContainText('VIPER');
  expect(await page.evaluate(() => window.csDeathSounds)).toBe(1);
  await page.evaluate(() => { window.csSpectatorMatch.actors[2].hp = 0; });
  await expect(page.locator('#cs-spectating-name')).toHaveText('KESTREL'); await expect(page.locator('#cs-spectate-next')).toBeDisabled();
  // The actual engine resetRound restores the same actor objects.
  await page.evaluate(() => { window.csSpectatorMatch.phase='round-over'; window.csSpectatorMatch.timer=.01; window.csLethalBot=false; });
  await expect(page.locator('#cs-shop')).toBeVisible(); await expect(page.locator('#cs-death')).toBeHidden(); await expect(page.locator('#cs-health')).toHaveText('100');
  await page.locator('#cs-deploy').click(); await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await expect(page.locator('#cs-root')).toHaveAttribute('data-life', 'alive');
  expect(await page.evaluate(() => window.csDeathSounds)).toBe(1); expect(errors).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('#cs-quit').click(); await page.locator('#cs-start').click();
  await expect(page.locator('#cs-death')).toBeHidden(); await expect(page.locator('#cs-health')).toHaveText('100');
});

test('a decisive incoming shot preserves death confirmation under the result, then a new match clears it', async ({ page }) => {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('death-end-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?death-end-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?death-end-source';
    export function createMatch(team){const m=make(team);window.csDeathEndMatch=m;return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body: `export function botInputs(){return window.csEndShot?{3:{fire:true,yaw:Math.PI,pitch:0}}:{}}` }));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 }); await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(() => {
    const m=window.csDeathEndMatch; m.actors.forEach((p,i)=>Object.assign(p,{x:20,z:18+i}));
    Object.assign(m.actors[0],{x:4,z:20,hp:8}); Object.assign(m.actors[3],{x:4,z:14});
    m.actors[1].hp=m.actors[2].hp=0; m.scores.defend=3; window.csEndShot=true;
    window.csDeathPaints=[];
    const observe=()=>{if(document.querySelector('#cs-death-summary').textContent.includes('VIPER'))window.csDeathPaints.push(document.querySelector('#cs-result').hidden);requestAnimationFrame(observe);};requestAnimationFrame(observe);
  });
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase','match-over');
  await expect(page.locator('#cs-death-summary')).toContainText('VIPER');
  await expect(page.locator('#cs-result')).toBeVisible(); await expect(page.locator('#cs-pause')).toBeHidden();
  expect(await page.evaluate(() => window.csDeathPaints.some(Boolean))).toBe(true);
  await expect(page.locator('#cs-spectate-prev')).toBeDisabled(); await expect(page.locator('#cs-spectate-next')).toBeDisabled();
  await expect(page.locator('#cs-spectating-name')).toHaveText('沒有存活隊友');
  await page.locator('#cs-restart').click(); await expect(page.locator('#cs-shop')).toBeVisible();
  await expect(page.locator('#cs-death')).toBeHidden(); await expect(page.locator('#cs-root')).toHaveAttribute('data-life','alive');
});

test('holding sniper aim exits the scope while reloading and restores it after the magazine is ready', async ({page})=>{
  await page.route(url=>url.pathname==='/src/scripts/games/cs/engine.ts'&&!url.searchParams.has('motion-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?motion-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?motion-source';
    export function createMatch(team){const m=make(team);m.actors[0].money=5000;return m;}
  `}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:'export function botInputs(){return {};}' }));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/renderer.ts'&&!url.searchParams.has('motion-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    import {GameRenderer as Base} from '/src/scripts/games/cs/renderer.ts?motion-source';
    export class GameRenderer extends Base {
      constructor(canvas){super(canvas);window.csMotionRenderer=this;}
      render(m,...args){super.render(m,...args);if(m?.phase==='live'&&m.actors[0].weapon==='sniper'&&m.actors[0].hp>0&&this.gun){
        (window.csScopeFrames??=[]).push({scope:document.querySelector('#cs-root').classList.contains('cs-scoped'),gun:this.gun.visible});
      }}
    }
  `}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/audio.ts'&&!url.searchParams.has('motion-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/audio.ts?motion-source';
    import {CombatAudio as Base} from '/src/scripts/games/cs/audio.ts?motion-source';
    export class CombatAudio extends Base {reload(cue,weapon){(window.csReloadSounds??=[]).push({cue,weapon});super.reload(cue,weapon);}}
  `}));
  await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:30000});
  await page.locator('[data-buy="sniper"]').click();await page.locator('#cs-deploy').click();
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.mouse.down({button:'right'});await expect(page.locator('#cs-root')).toHaveClass(/cs-scoped/);
  await page.mouse.down();await expect(page.locator('#cs-ammo')).toHaveText('4');await page.mouse.up();
  await page.keyboard.press('KeyR');await expect(page.locator('#cs-action')).toContainText('換彈');
  await expect(page.locator('#cs-root')).not.toHaveClass(/cs-scoped/);
  await expect.poll(()=>page.evaluate(()=>window.csMotionRenderer.gun.visible)).toBe(true);
  await expect(page.locator('#cs-ammo')).toHaveText('5',{timeout:4500});
  await expect(page.locator('#cs-root')).toHaveClass(/cs-scoped/);
  await expect.poll(()=>page.evaluate(()=>window.csMotionRenderer.gun.visible)).toBe(false);
  expect(await page.evaluate(()=>window.csReloadSounds)).toEqual(['release','insert','chamber'].map(cue=>({cue,weapon:'sniper'})));
  expect(await page.evaluate(()=>window.csScopeFrames.filter(frame=>frame.scope===frame.gun))).toEqual([]);
  await page.mouse.up({button:'right'});await page.keyboard.press('Escape');
});

test('real HUD distinguishes head/kill and incoming damage, then clears feedback on pause', async ({ page }, testInfo) => {
  // Deterministic actors for hit feedback; the actual engine, client, renderer,
  // keyboard, mouse and Pointer Lock still execute. No production debug API.
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('feedback-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?feedback-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?feedback-source';
    export function createMatch(team) { const m=make(team); window.csTestMatch=m; return m; }
  ` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({ contentType: 'text/javascript', body: `export function botInputs() { const fire=window.csFireBot;window.csFireBot=false;return fire ? {4:{fire:true,yaw:Math.PI,pitch:-.08}} : {}; }` }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/games/cs'); await page.locator('#cs-start').click({ timeout: 30000 });
  expect(await page.locator('#cs-hit-feedback').count()).toBe(1);
  await page.locator('#cs-deploy').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(() => {
    const m = window.csTestMatch;
    m.actors.forEach((a, i) => Object.assign(a, { x: 20, z: 18 + i }));
    Object.assign(m.actors[0], { x: 4, z: 20 }); Object.assign(m.actors[3], { x: 4, z: 14 });
    const root=document.querySelector('#cs-root');window.csHudCues=[];
    const observer=new MutationObserver(()=>{window.csHudCues.push({feedback:root.dataset.feedback,text:document.querySelector('#cs-hit-feedback').textContent,hurt:root.dataset.hurt,damage:document.querySelector('#cs-damage').classList.contains('cs-hurt')});});
    observer.observe(root,{attributes:true,attributeFilter:['data-feedback','data-hurt']});
  });
  // Retain actual DOM transitions before firing. A held pistol can produce
  // both head and kill while a screenshot/protocol round trip is in progress.
  await page.mouse.down();
  try { await page.waitForFunction(()=>window.csHudCues.some(c=>c.feedback==='head'&&c.text.includes('爆頭'))&&window.csHudCues.some(c=>c.feedback==='kill'&&c.text.includes('擊殺'))); }
  finally { await page.mouse.up(); }
  const hits=await page.evaluate(()=>window.csHudCues.slice());
  expect(hits.findIndex(c=>c.feedback==='head')).toBeLessThan(hits.findIndex(c=>c.feedback==='kill'));
  await page.screenshot({path:testInfo.outputPath('hit-sequence-complete.png')});
  await page.evaluate(() => { Object.assign(window.csTestMatch.actors[4], { x: 4, z: 14 }); window.csFireBot = true; });
  await page.waitForFunction(()=>window.csHudCues.some(c=>c.hurt==='front'&&c.damage));
  await expect(page.locator('#cs-health')).not.toHaveText('100');
  const cuePath=testInfo.outputPath('hud-cues.json');await writeFile(cuePath,JSON.stringify(await page.evaluate(()=>window.csHudCues)));
  await testInfo.attach('hud-cues',{path:cuePath,contentType:'application/json'});
  await page.keyboard.press('Escape'); await expect(page.locator('#cs-pause')).toBeVisible();
  await expect(page.locator('#cs-root')).toHaveAttribute('data-feedback', 'none');
  await expect(page.locator('#cs-root')).toHaveAttribute('data-hurt', 'none');
  await page.locator('#cs-resume').click();
  await expect(page.locator('#cs-root')).toHaveAttribute('data-feedback', 'none');
  expect(errors).toEqual([]);
});

test('the decisive shot retains its kill confirmation through round and match transitions', async ({ page }) => {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('feedback-source'), route => route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?feedback-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?feedback-source';
    export function createMatch(team){const m=make(team);window.csTestMatch=m;return m;}` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:'export function botInputs(){return {}}'}));
  for(const matchPoint of [false,true]) {
    await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:30000});await page.locator('#cs-deploy').click();
    await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
    await page.evaluate(matchPoint=>{
      const m=window.csTestMatch;m.actors.forEach((a,i)=>Object.assign(a,{x:20,z:18+i}));
      Object.assign(m.actors[0],{x:4,z:20});Object.assign(m.actors[3],{x:4,z:14,hp:8});m.actors[4].hp=m.actors[5].hp=0;m.scores.attack=matchPoint?3:0;
      window.killPaints=[];
      const observe=()=>{if(document.querySelector('#cs-root').dataset.feedback==='kill')window.killPaints.push(document.querySelector('#cs-result').hidden);requestAnimationFrame(observe);};requestAnimationFrame(observe);
    },matchPoint);
    await page.mouse.down();
    try {await expect(page.locator('#cs-root')).toHaveAttribute('data-feedback','kill');}
    finally {await page.mouse.up();}
    await expect(page.locator('#cs-root')).toHaveAttribute('data-phase',matchPoint?'match-over':'round-over');
    await expect(page.locator('#cs-result')).toBeVisible();
    expect(await page.evaluate(()=>window.killPaints.some(Boolean))).toBe(true);
    await expect(page.locator('#cs-root')).toHaveAttribute('data-feedback','none');
  }
});

test('hiding a finished match clears its decisive recoil without opening the pause panel', async ({page})=>{
  await page.route(url=>url.pathname==='/src/scripts/games/cs/engine.ts'&&!url.searchParams.has('hidden-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?hidden-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?hidden-source';
    export function createMatch(team){const m=make(team);window.hiddenMatch=m;return m;}`}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:'export function botInputs(){return {}}'}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/renderer.ts'&&!url.searchParams.has('hidden-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    import {GameRenderer as Base} from '/src/scripts/games/cs/renderer.ts?hidden-source';
    export class GameRenderer extends Base {render(m,...args){super.render(m,...args);
      if(m?.phase==='match-over'&&this.recoil>0&&!window.hiddenKick){
        const before=this.recoil;
        // Deterministic visibility transition exactly on the decisive frame.
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
        try{document.dispatchEvent(new Event('visibilitychange'));}finally{delete document.hidden;}
        const after=this.recoil;super.render(m,.25,...args.slice(1));
        window.hiddenKick={before,after,resumed:this.recoil};
      }}}`}));
  await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:60000});await page.locator('#cs-deploy').click();
  await expect.poll(()=>page.evaluate(()=>window.hiddenMatch?.phase)).toBe('live');
  await page.evaluate(()=>{const m=window.hiddenMatch;m.scores.attack=3;
    Object.assign(m.actors[0],{x:4,z:20});Object.assign(m.actors[3],{x:4,z:14,hp:8});m.actors[4].hp=m.actors[5].hp=0;});
  await page.mouse.down();
  try{await page.waitForFunction(()=>!!window.hiddenKick);}finally{await page.mouse.up();}
  const kick=await page.evaluate(()=>window.hiddenKick);
  expect(kick.before).toBeGreaterThan(0);expect(kick.after).toBe(0);expect(kick.resumed).toBe(0);
  await expect(page.locator('#cs-result')).toBeVisible();await expect(page.locator('#cs-pause')).toBeHidden();
});

test('two attackers on opposite sides retain separate hurt sound directions in one frame', async ({page})=>{
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('feedback-source'), route => route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?feedback-source';import {createMatch as make} from '/src/scripts/games/cs/engine.ts?feedback-source';
    export function createMatch(team){const m=make(team);window.csTestMatch=m;return m;}` }));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/audio.ts'&&!url.searchParams.has('feedback-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/audio.ts?feedback-source';
    import {CombatAudio as Real} from '/src/scripts/games/cs/audio.ts?feedback-source';
    export class CombatAudio extends Real{hurt(damage,pan){(window.csHurtPans??=[]).push(pan);super.hurt(damage,pan);}}`}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:`export function botInputs(){return window.csFireSides?{4:{fire:true,yaw:-Math.PI/2,pitch:-.08},5:{fire:true,yaw:Math.PI/2,pitch:-.08}}:{}}`}));
  await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:30000});await page.locator('#cs-deploy').click();
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
  await page.evaluate(()=>{const m=window.csTestMatch;m.actors.forEach((a,i)=>Object.assign(a,{x:20,z:18+i}));Object.assign(m.actors[0],{x:0,z:20});Object.assign(m.actors[4],{x:-3,z:20});Object.assign(m.actors[5],{x:3,z:20});window.csFireSides=true;});
  await expect.poll(()=>page.evaluate(()=>window.csHurtPans?.length??0)).toBeGreaterThanOrEqual(2);
  const pans=await page.evaluate(()=>{window.csFireSides=false;return window.csHurtPans.slice(0,2);});
  expect(pans[0]).toBeLessThan(-.9);expect(pans[1]).toBeGreaterThan(.9);
});

test('a failed FX asset frees its renderer and shows the retry screen', async ({page})=>{
  await page.route(url=>url.pathname==='/src/scripts/games/cs/renderer.ts'&&!url.searchParams.has('lifecycle-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    import {GameRenderer as Real} from '/src/scripts/games/cs/renderer.ts?lifecycle-source';
    export class GameRenderer extends Real{constructor(c){super(c);window.csTestRenderer=this;}dispose(){this.disposeCalls=(this.disposeCalls||0)+1;super.dispose();}}`}));
  await page.route('**/assets/games/cs/fx/stone-impact.webp',route=>route.fulfill({status:503,body:'controlled asset failure'}));
  await page.goto('/games/cs');await expect(page.locator('#cs-load-error')).toBeVisible({timeout:30000});
  expect(await page.evaluate(()=>window.csTestRenderer.disposeCalls??0)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.csTestRenderer.renderer.info.memory.textures)).toBe(0);
  await expect(page.locator('#cs-retry')).toBeEnabled();
});

test('leaving while assets load prevents a disposed renderer from compiling the scene', async ({page},testInfo)=>{
  const errors:string[]=[],rendererRequests:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/cs/renderer.ts'))rendererRequests.push(request.url());});
  let release;const blocked=new Promise<void>(resolve=>{release=resolve;});
  await page.route(url=>url.pathname==='/src/scripts/games/cs/renderer.ts'&&!url.searchParams.has('lifecycle-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    import {GameRenderer as Real} from '/src/scripts/games/cs/renderer.ts?lifecycle-source';
    export class GameRenderer extends Real{constructor(c){super(c);window.csTestRenderer=this;this.compileCalls=0;const original=this.renderer.compile.bind(this.renderer);this.renderer.compile=(...a)=>{this.compileCalls++;return original(...a)};}async load(){await super.load();this.loadFinished=true;}}`}));
  await page.route('**/assets/games/cs/fx/impact-dust.webp',async route=>{await blocked;await route.continue();});
  try{
    await page.goto('/games/cs',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.csTestRenderer);
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));release();
    await page.waitForFunction(()=>window.csTestRenderer.loadFinished);
    expect(await page.evaluate(()=>window.csTestRenderer.compileCalls)).toBe(0);
    expect(await page.evaluate(()=>window.csTestRenderer.ready)).toBe(false);
  }finally{
    release();
    await testInfo.attach('load-cancel-diagnostics',{body:JSON.stringify({errors,rendererRequests}),contentType:'application/json'});
  }
});
