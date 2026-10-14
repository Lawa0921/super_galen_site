import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

test('world guns keep their visible geometry and effect anchors without the FPS hand rig', async ({ page }, testInfo) => {
  await page.route('**/__cs_world_weapon', route => route.fulfill({ contentType: 'text/html', body: '<style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas>' }));
  await page.goto('/__cs_world_weapon');
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{GameRenderer}=await import('/src/scripts/games/cs/renderer.ts'),{createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const m=createMatch('attack');m.phase='live';const rows=[];
    try{
      for(const weapon of ['pistol','smg','rifle','sniper']){
        m.actors.forEach((a,i)=>Object.assign(a,{weapon,x:i===0?0:(i-3)*1.5,z:i===0?24:20,y:0,yaw:i===0?0:Math.PI,moving:false}));r.render(m,0,{yaw:0,pitch:-.12},false);
        const source=r.weapons.get(weapon),template=r.worldWeapons.get(weapon),held=r.units.get(3).getObjectByName('held-weapon');source.updateMatrixWorld(true);template.updateMatrixWorld(true);held.updateWorldMatrix(true,true);
        const meshSeal=root=>{const inverse=new T.Matrix4().copy(root.matrixWorld).invert(),rows=[];root.traverse(n=>{if(!n.isMesh||n.isSkinnedMesh)return;const local=new T.Matrix4().multiplyMatrices(inverse,n.matrixWorld);rows.push(JSON.stringify({geometry:n.geometry.uuid,materials:(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.uuid),matrix:local.elements.map(v=>Math.round(v*1e10)/1e10)}));});return rows.sort();};
        const sourceMeshes=meshSeal(source),templateMeshes=meshSeal(template),meshMultisetExact=JSON.stringify(sourceMeshes)===JSON.stringify(templateMeshes);
        const inverse=new T.Matrix4().copy(held.matrixWorld).invert(),sourceInverse=new T.Matrix4().copy(source.matrixWorld).invert();let bones=0,skins=0,fpsBones=0,sourceBones=0,maxMatrixError=0,meshes=0;
        source.traverse(n=>{if(n.isBone)sourceBones++;});r.gun.traverse(n=>{if(n.isBone)fpsBones++;});
        held.traverse(n=>{if(n.isBone)bones++;if(n.isSkinnedMesh)skins++;if(n.isMesh&&!/view_hands/.test(n.name)){const original=source.getObjectByName(n.name);if(!original||original.geometry!==n.geometry)throw Error('World gun geometry changed');meshes++;}});
        for(const name of ['muzzle','ejection_port']){const a=held.getObjectByName(name),b=source.getObjectByName(name);if(!a||!b)throw Error('Missing effect anchor');const actual=new T.Matrix4().multiplyMatrices(inverse,a.matrixWorld),expected=new T.Matrix4().multiplyMatrices(sourceInverse,b.matrixWorld);maxMatrixError=Math.max(maxMatrixError,...actual.elements.map((v,i)=>Math.abs(v-expected.elements[i])));}
        rows.push({weapon,bones,skins,meshes,sourceMeshCount:sourceMeshes.length,meshMultisetExact,sourceBones,fpsBones,sourceClips:source.animations.length,maxMatrixError,glError:r.renderer.getContext().getError()});
      }
      const png=r.canvas.toDataURL('image/png');return{rows,png};
    }finally{r.dispose();}
  });
  await writeFile(testInfo.outputPath('world-weapon.json'),JSON.stringify(result.rows,null,2));
  await writeFile(testInfo.outputPath('world-weapon.png'),Buffer.from(result.png.split(',')[1],'base64'));
  for(const row of result.rows){expect(row.bones,row.weapon).toBe(0);expect(row.skins).toBe(0);expect(row.meshes).toBe(row.sourceMeshCount);expect(row.sourceMeshCount).toBeGreaterThan(0);expect(row.meshMultisetExact).toBe(true);expect(row.sourceBones).toBe(48);expect(row.fpsBones).toBe(48);expect(row.sourceClips).toBeGreaterThan(0);expect(row.maxMatrixError).toBeLessThan(1e-8);expect(row.glError).toBe(0);}
});

for (const weapon of ['pistol', 'smg', 'rifle', 'sniper'] as const) {
  test(`viewmodel ${weapon} kick distinguishes ADS, decays once and resets for a new match`, async ({ page }, testInfo) => {
    await page.route('**/__cs_weapon_kick', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
    await page.goto('/__cs_weapon_kick');
    const result = await page.evaluate(async weapon => {
      const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
      const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
      const r = new GameRenderer(document.querySelector('canvas')); await r.load();
      const samples = [], dt = 1 / 60;
      let renderCount = 0;
      const render = (m, step = dt) => { renderCount++; r.render(m, step, { yaw: 0, pitch: 1 }, false); };
      try {
        for (const aim of [false, true]) {
          const m = createMatch('attack'); m.phase = 'live'; const p = m.actors[0];
          Object.assign(p, { weapon, aim, pitch: 1 }); render(m);
          stepMatch(m, { 0: { fire: true, aim, pitch: 1 } }, dt); render(m);
          const first = r.recoil, cameraPitch = r.camera.rotation.x;
          render(m, 0); const paused = r.recoil;
          render(m); const repeated = r.recoil;
          for (let i = 0; i < 12; i++) { m.time += .05; render(m, .05); }
          samples.push({ weapon, aim, first, paused, repeated, recovered: r.recoil, enginePitch: p.recoilPitch, cameraPitch });
        }
        return { samples, renderCount };
      } finally { r.dispose(); }
    }, weapon);
    await writeFile(testInfo.outputPath(`${weapon}-kick-numeric.json`), JSON.stringify(result, null, 2));
    expect(result.renderCount).toBe(32);
    expect(result.samples.map(sample => sample.aim)).toEqual([false, true]);
    const kicks = { pistol: .006, smg: .008, rifle: .013, sniper: .024 };
    const cosmetic = { pistol: .052, smg: .045, rifle: .092, sniper: .125 };
    for (const sample of result.samples) {
      expect(sample.weapon).toBe(weapon);
      const kick = kicks[weapon] * (sample.aim ? .7 : 1);
      expect(sample.first, `${weapon} aim=${sample.aim}`).toBeCloseTo(cosmetic[weapon] * (sample.aim ? .55 : 1), 9);
      expect(sample.enginePitch).toBeCloseTo(kick, 9); expect(sample.cameraPitch).toBeCloseTo(1 + kick, 9);
      expect(sample.paused).toBe(sample.first); expect(sample.repeated).toBe(sample.first);
      expect(sample.recovered).toBeLessThan(.0001);
    }
  });
}

test('viewmodel kick resets when the viewed actor changes and when a round starts', async ({ page }, testInfo) => {
  await page.route('**/__cs_weapon_kick', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_weapon_kick');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas')); await r.load();
    const dt = 1 / 60;
    let renderCount = 0;
    const render = (m, step = dt, viewId = 0) => { renderCount++; r.render(m, step, { yaw: 0, pitch: 1 }, false, viewId); };
    try {
      const m = createMatch('attack'); m.phase = 'live'; m.actors[0].hp = 0;
      const viewed = m.actors[1]; Object.assign(viewed, { weapon: 'rifle', aim: true, pitch: 1 });
      render(m, dt, 1); stepMatch(m, { 1: { fire: true, aim: true, pitch: 1 } }, dt); render(m, dt, 1);
      const spectator = r.recoil;
      render(m, dt, 2); const switched = r.recoil;
      render(m, dt, 1); const returned = r.recoil;
      viewed.shot += 4; render(m, 0, 1); const skippedCounters = r.recoil;
      for (let i = 0; i < 8; i++) { viewed.shot++; render(m, 0, 1); }
      const capped = r.recoil;
      m.round++; render(m, 0, 1); const roundReset = r.recoil;
      // Presentation observes current ADS; hitscan/camera keep shot-time ADS.
      viewed.shot++; viewed.aim = false; render(m, 0, 1); const currentAimKick = r.recoil;
      return { renderCount, spectator, switched, returned, skippedCounters, capped, roundReset, currentAimKick };
    } finally { r.dispose(); }
  });
  await writeFile(testInfo.outputPath('spectator-kick-numeric.json'), JSON.stringify(result, null, 2));
  expect(result.renderCount).toBe(15);
  expect(result.spectator).toBeCloseTo(.092 * .55, 9);
  expect(result.switched).toBe(0); expect(result.returned).toBe(0); expect(result.roundReset).toBe(0);
  expect(result.skippedCounters).toBeCloseTo(.092 * .55, 9);
  expect(result.capped).toBeCloseTo(.092 * .55, 9); expect(result.currentAimKick).toBeCloseTo(.092, 9);
});

test('viewmodel kick recovers after round-over and match-over shots', async ({ page }, testInfo) => {
  await page.route('**/__cs_weapon_kick', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_weapon_kick');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas')); await r.load();
    const decisive = [], dt = 1 / 60;
    let renderCount = 0;
    const render = (m, step = dt) => { renderCount++; r.render(m, step, { yaw: 0, pitch: 0 }, false); };
    try {
      for (const wins of [0, 3]) {
        const end = createMatch('attack'); end.phase = 'live'; end.scores.attack = wins;
        Object.assign(end.actors[0], { x: 4, z: 20, weapon: 'rifle' });
        Object.assign(end.actors[3], { x: 4, z: 14, hp: 8 }); end.actors[4].hp = end.actors[5].hp = 0;
        render(end);
        stepMatch(end, { 0: { fire: true, yaw: 0, pitch: 0 } }, dt); render(end);
        const first = r.recoil;
        for (let i = 0; i < 12; i++) render(end, .05);
        decisive.push({ phase: end.phase, first, recovered: r.recoil });
      }
      return { renderCount, decisive };
    } finally { r.dispose(); }
  });
  await writeFile(testInfo.outputPath('decisive-kick-numeric.json'), JSON.stringify(result, null, 2));
  expect(result.renderCount).toBe(28);
  expect(result.decisive.map(v => v.phase)).toEqual(['round-over', 'match-over']);
  for (const sample of result.decisive) { expect(sample.first).toBeGreaterThan(0); expect(sample.recovered).toBe(0); }
});

// Keep each synchronous GPU readback within its own normal test deadline.
// Six numeric cases above retain all 171 renders (4 * 32 + 15 + 28) and assertions.
for (const weapon of ['pistol', 'smg', 'rifle', 'sniper'] as const) {
  test(`viewmodel ${weapon} kick captures the first unaimed shot`, async ({ page }, testInfo) => {
    await page.route('**/__cs_weapon_kick', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
    await page.goto('/__cs_weapon_kick');
    const result = await page.evaluate(async weapon => {
      const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
      const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
      const canvas = document.querySelector('canvas');
      const r = new GameRenderer(canvas); await r.load();
      let renderCount = 0, readbackCount = 0;
      try {
        const m = createMatch('attack'); m.phase = 'live';
        const p = m.actors[0], dt = 1 / 60;
        Object.assign(p, { weapon, aim: false, pitch: 1 });
        const render = () => { renderCount++; r.render(m, dt, { yaw: 0, pitch: 1 }, false); };
        render();
        const shotBefore = p.shot;
        stepMatch(m, { 0: { fire: true, aim: false, pitch: 1 } }, dt); render();
        const first = r.recoil, cameraPitch = r.camera.rotation.x;
        readbackCount++;
        const png = canvas.toDataURL('image/png'), gl = r.renderer.getContext();
        return { weapon: p.weapon, aim: p.aim, shotDelta: p.shot - shotBefore, first,
          enginePitch: p.recoilPitch, cameraPitch, renderCount, readbackCount,
          width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, glError: gl.getError(), png };
      } finally { r.dispose(); }
    }, weapon);
    const { png, ...facts } = result;
    await writeFile(testInfo.outputPath(`${weapon}-kick.json`), JSON.stringify(facts, null, 2));
    const pixels = Buffer.from(png.split(',')[1], 'base64');
    await writeFile(testInfo.outputPath(`${weapon}-kick.png`), pixels);
    expect(result.weapon).toBe(weapon); expect(result.aim).toBe(false);
    expect(result.shotDelta).toBe(1); expect(result.renderCount).toBe(2); expect(result.readbackCount).toBe(1);
    const kick = { pistol: .006, smg: .008, rifle: .013, sniper: .024 }[weapon];
    const cosmetic = { pistol: .052, smg: .045, rifle: .092, sniper: .125 }[weapon];
    expect(result.first).toBeCloseTo(cosmetic, 9);
    expect(result.enginePitch).toBeCloseTo(kick, 9); expect(result.cameraPitch).toBeCloseTo(1 + kick, 9);
    expect(result.glError).toBe(0);
    expect(png.startsWith('data:image/png;base64,')).toBe(true);
    expect(pixels.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(pixels.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(result.width).toBeGreaterThan(0); expect(result.height).toBeGreaterThan(0);
    expect(pixels.readUInt32BE(16)).toBe(result.width); expect(pixels.readUInt32BE(20)).toBe(result.height);
  });
}

test('candidate reacts to an engine hit without moving its feet or losing grip, then settles and resets', async ({ page }, testInfo) => {
  await page.route('**/__cs_candidate_hit', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_candidate_hit');
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { loadSkinCandidate } = await import('/src/scripts/games/cs/skin-candidate.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas'),loadSkinCandidate); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    m.actors.forEach((p,i)=>Object.assign(p,{weapon:'rifle',ammo:30,hp:100,armor:100,x:10+i,z:23,y:0,yaw:0}));
    Object.assign(m.actors[0],{x:0,z:27});Object.assign(m.actors[3],{x:0,z:23,yaw:Math.PI});
    const render=()=>r.render(m,1/60,{yaw:0,pitch:-.12},false);
    try {
      render();const model=r.units.get(3),chest=model.getObjectByName('spine_03'),foot=model.getObjectByName('foot_l'),gun=model.getObjectByName('held-weapon'),hand=model.getObjectByName('hand_r');
      const orientation=()=>chest.getWorldQuaternion(new T.Quaternion()).normalize(),base=orientation(),at=foot.getWorldPosition(new T.Vector3());
      const grip=()=>gun.worldToLocal(hand.getWorldPosition(new T.Vector3())),beforeGrip=grip();
      stepMatch(m,{0:{fire:true,aim:true,yaw:0,pitch:-.12}},1/60);render();render();
      const hit=m.shots.at(-1),reaction=orientation().angleTo(base),peak=orientation();
      const footError=foot.getWorldPosition(new T.Vector3()).distanceTo(at),handError=grip().distanceTo(beforeGrip);
      render();render();const repeatedError=orientation().angleTo(peak);
      const pixels=await new Promise(resolve=>requestAnimationFrame(()=>{render();resolve(document.querySelector('canvas').toDataURL('image/png'));}));
      const decay=[];
      // stepMatch caps a single tick at 50 ms; advance real simulation ticks.
      for(let i=0;i<15;i++){stepMatch(m,{},1/60);render();decay.push(orientation().angleTo(base));}
      const settledError=orientation().angleTo(base);
      m.round++;m.phase='buy';render();const resetError=orientation().angleTo(base);
      return {hit:{target:hit?.target,damage:hit?.damage,killed:hit?.killed},reaction,footError,handError,repeatedError,settledError,resetError,decay,pixels};
    } finally {r.dispose();}
  });
  const {pixels,...facts}=result;
  await writeFile(testInfo.outputPath('candidate-hit.json'),JSON.stringify(facts,null,2));
  await writeFile(testInfo.outputPath('candidate-hit.png'),Buffer.from(pixels.split(',')[1],'base64'));
  expect(result.hit.target).toBe(3);expect(result.hit.damage).toBeGreaterThan(0);expect(result.hit.killed).toBe(false);
  expect(result.reaction).toBeGreaterThan(.03);expect(result.reaction).toBeLessThan(.15);
  expect(result.footError).toBeLessThan(1e-8);expect(result.handError).toBeLessThan(1e-8);
  expect(result.repeatedError).toBeLessThan(1e-6);expect(result.settledError).toBeLessThan(1e-6);expect(result.resetError).toBeLessThan(1e-6);
  expect(result.decay.every((v,i)=>v<=(i?result.decay[i-1]:result.reaction)+1e-7)).toBe(true);
});

test('baked candidate gait follows resolved travel, freezes on pause, and resets per round without losing the rifle', async ({ page }, testInfo) => {
  await page.route('**/__cs_candidate_motion', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_candidate_motion');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { loadSkinCandidate } = await import('/src/scripts/games/cs/skin-candidate.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas'), loadSkinCandidate); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    m.actors.forEach((p, i) => Object.assign(p, { weapon: 'rifle', hp: 100, x: (i - 3) * .7, y: 0, z: i ? 22 : 27, moving: true }));
    const render = () => r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
    try {
      render(); const model = r.units.get(1), leg = model.getObjectByName('calf_l'), neutral = leg.quaternion.clone();
      const gun = model.getObjectByName('held-weapon'), hand = model.getObjectByName('hand_r');
      const relative = () => gun.worldToLocal(hand.getWorldPosition(hand.position.clone()));
      const startHand = relative();
      for (let i = 0; i < 8; i++) { m.time += .025; m.actors[1].z -= .1; render(); }
      const moved = leg.quaternion.angleTo(neutral), handError = relative().distanceTo(startHand), moving = { ...model.userData.skinMotion };
      const pose = leg.quaternion.toArray(); render(); render();
      const pause = JSON.stringify(pose) === JSON.stringify(leg.quaternion.toArray());
      const phase = model.userData.skinMotion?.phase; m.time += .025; render();
      const blocked = model.userData.skinMotion?.phase === phase;
      const other = r.units.get(2).userData.skinMotion?.phase;
      await new Promise(resolve => requestAnimationFrame(resolve));
      m.round++; m.actors[1].z = -23; m.time += .025; render();
      return { moved, handError, moving, pause, blocked, other, reset: { ...model.userData.skinMotion }, gunParent: gun.parent.name, resident: r.candidateDiagnostics.resident };
    } finally { r.dispose(); }
  });
  await writeFile(testInfo.outputPath('candidate-motion.json'), JSON.stringify(result, null, 2));
  expect(result.moved).toBeGreaterThan(.01); expect(result.handError).toBeLessThan(1e-6); expect(result.moving.phase).toBeGreaterThan(0);
  expect(result.pause).toBe(true); expect(result.blocked).toBe(true); expect(result.other).toBe(0);
  expect(result.reset.phase).toBe(0); expect(result.reset.weight).toBe(0); expect(result.gunParent).toBe('spine_03'); expect(result.resident).toBe(5);
});

test('candidate distance LOD is per actor, uses the spectator camera, and releases dormant geometry once', async ({ page }, testInfo) => {
  await page.route('**/__cs_candidate_lod', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_candidate_lod');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { loadSkinCandidate } = await import('/src/scripts/games/cs/skin-candidate.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas'), loadSkinCandidate); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    m.actors.forEach((p, i) => Object.assign(p, { weapon: 'rifle', hp: 100, x: i === 2 ? 1 : 0, y: 0, z: i ? 23 : 27 }));
    const render = () => r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
    const vest = id => r.units.get(id).getObjectByName('tactical_vest');
    const rows = []; let lodDisposals = 0, nearDisposals = 0, instanceDisposals = 0;
    try {
      render(); const original = vest(1).geometry; original.addEventListener('dispose', () => nearDisposals++);
      for (const high of [true, false]) {
        r.quality(high); m.actors[1].z = 15; render();
        const reduced = vest(1).geometry, draws = [];
        const onBeforeRender = vest(1).onBeforeRender;
        vest(1).onBeforeRender = function (...args) { onBeforeRender.apply(this, args); draws.push(this.geometry.index.count); };
        render(); vest(1).onBeforeRender = onBeforeRender;
        rows.push({ high, near: original.index.count, far: reduced.index.count, otherNear: vest(2).geometry === original,
          sharedAttributes: Object.keys(original.attributes).every(key => original.attributes[key] === reduced.attributes[key]), draws });
        if (high) reduced.addEventListener('dispose', () => lodDisposals++);
        m.actors[1].weapon = 'smg'; render(); instanceDisposals += lodDisposals;
        m.actors[1].weapon = 'rifle'; m.actors[1].z = 23; render();
      }
      // Observer follows the live teammate at z=23, so a bot at z=27 is near,
      // even though the dead player's old location at z=55 is distant.
      m.actors[0].hp = 0; m.actors[0].z = 55; m.actors[2].z = 27; render();
      const spectatorNear = vest(2).geometry === original;
      m.actors[0].hp = 100; m.actors[0].z = 27; m.actors[2].z = 23; render();
      const dormant = [1, 2, 3, 4, 5].every(id => vest(id).geometry === original);
      r.dispose(); r.dispose();
      return { rows, spectatorNear, dormant, lodDisposals, nearDisposals, instanceDisposals, finalTextures: r.renderer.info.memory.textures };
    } finally { r.dispose(); }
  });
  await writeFile(testInfo.outputPath('candidate-lod.json'), JSON.stringify(result, null, 2));
  for (const row of result.rows) {
    expect(row.near).toBe(111168); expect(row.far).toBe(55584); expect(row.otherNear).toBe(true); expect(row.sharedAttributes).toBe(true);
    expect(row.draws.length).toBeGreaterThan(0); expect(row.draws.every(count => count === 55584)).toBe(true);
  }
  expect(result.spectatorNear).toBe(true); expect(result.dormant).toBe(true); expect(result.instanceDisposals).toBe(0);
  expect(result.lodDisposals).toBe(1); expect(result.nearDisposals).toBe(1); expect(result.finalTextures).toBe(1);
});

test('development candidate connects an engine-fired bot shot to its actual rifle muzzle', async ({ page }, testInfo) => {
  await page.route('**/__cs_candidate_shot', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_candidate_shot');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { loadSkinCandidate } = await import('/src/scripts/games/cs/skin-candidate.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas'), loadSkinCandidate); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    m.actors.forEach((p, i) => Object.assign(p, { weapon: 'rifle', x: i ? (i - 1) * 1.1 : 0, z: i ? 23 : 27, yaw: i ? Math.PI : 0, hp: 100 }));
    // The real client renders its menu before the user deploys, preparing the
    // postprocessing/background passes separately from actor material programs.
    r.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
    const prepared = new Set(r.renderer.info.programs.map(program => program.id));
    const programFacts = program => {
      const gl = r.renderer.getContext();
      return { id: program.id, key: program.cacheKey,
        vertexDefines: gl.getShaderSource(program.vertexShader).split('\n').filter(line => line.startsWith('#define ')),
        fragmentDefines: gl.getShaderSource(program.fragmentShader).split('\n').filter(line => line.startsWith('#define ')) };
    };
    const preparedFacts = r.renderer.info.programs.map(programFacts);
    try {
      r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
      const beforeShot = new Set(r.renderer.info.programs.map(program => program.id));
      stepMatch(m, { 1: { fire: true, yaw: Math.PI, pitch: 0 } }, 1 / 60);
      r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
      const model = r.units.get(1), muzzle = model.getObjectByName('held-weapon').getObjectByName('muzzle');
      const at = muzzle.getWorldPosition(muzzle.position.clone());
      const trace = r.effects.traces.find(t => t.live), flash = r.effects.flash.slots.find(s => s.life > 0);
      const gl = r.renderer.getContext();
      const newPrograms = r.renderer.info.programs.filter(p => !prepared.has(p.id)).map(p => ({ name: p.name,
        beforeShot: beforeShot.has(p.id), skinning: gl.getShaderSource(p.vertexShader).includes('#define USE_SKINNING'),
        depth: gl.getShaderSource(p.fragmentShader).includes('#define DEPTH_PACKING') }));
      const before = r.units.size; m.round++; r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
      const next = createMatch('defend'); next.actors.forEach(p => p.weapon = 'rifle');
      r.render(next, 1 / 60, { yaw: Math.PI, pitch: 0 }, false);
      let held = 0; r.units.get(1).traverse(n => { if (n.name === 'held-weapon') held++; });
      return { actor: m.shots[0]?.actor, traceError: trace.from.distanceTo(at), flashError: flash.p.distanceTo(at),
        before, after: r.units.size, held, newPrograms, preparedFacts,
        newFacts: r.renderer.info.programs.filter(p => !prepared.has(p.id)).map(programFacts), diagnostics: { ...r.candidateDiagnostics } };
    } finally { r.dispose(); }
  });
  await testInfo.attach('candidate-shot', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await writeFile(testInfo.outputPath('candidate-shot.json'), JSON.stringify(result, null, 2));
  expect(result.actor).toBe(1); expect(result.traceError).toBeLessThan(1e-6); expect(result.flashError).toBeLessThan(1e-6);
  expect(result.before).toBe(6); expect(result.after).toBe(6); expect(result.held).toBe(1); expect(result.newPrograms).toEqual([]);
});

test('development candidate cancels a pending load without disposing borrowed rifle resources twice', async ({ page }) => {
  await page.route('**/__cs_candidate_cancel', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/__cs_candidate_cancel');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { cloneModel, disposeModelInstance } = await import('/src/scripts/games/cs/model-resources.ts');
    let enter, finish, release = 0, geometryDisposals = 0;
    const entered = new Promise(resolve => { enter = resolve; });
    const pending = new Promise(resolve => { finish = resolve; });
    const r = new GameRenderer(document.querySelector('canvas'), async rifle => {
      let geometry; rifle.traverse(n => { if (!geometry && n.isMesh) geometry = n.geometry; });
      geometry.addEventListener('dispose', () => geometryDisposals++);
      const copy = cloneModel(rifle); enter(); await pending;
      return { source: copy, resources: [copy], create: () => cloneModel(copy), dispose: () => { release++; disposeModelInstance(copy); } };
    });
    const loading = r.load(); await entered; r.dispose(); finish(); await loading; r.dispose();
    return { release, geometryDisposals, ready: r.ready, units: r.units.size };
  });
  expect(result).toEqual({ release: 1, geometryDisposals: 1, ready: false, units: 0 });
});

test('development candidate page loads five rifle bots and clearly labels motion limitations', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName === 'webkit' || isMobile, 'Native candidate movement and shooting require desktop Pointer Lock; Windows WebKit rejects it. Chromium and Firefox retain this coverage.');
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/sole-weights-v1|calibration-v17/.test(request.url())) requests.push(request.url()); });
  await page.goto('/games/cs'); await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
  expect(requests).toEqual([]); await expect(page.locator('#cs-candidate-notice')).toBeHidden();
  await page.goto('/games/cs?skinCandidate=1'); await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#cs-candidate-notice')).toContainText('走跑循環已接入');
  await page.locator('#cs-start').click();
  await expect(page.locator('#cs-canvas')).toHaveAttribute('data-candidate-resident', '5');
  await expect(page.locator('#cs-canvas')).toHaveAttribute('data-candidate-mode', 'cmu-cycle-development');
  await page.locator('[data-buy="rifle"]').click(); await page.locator('#cs-deploy').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'cs-canvas');
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  await expect(page.locator('#cs-ammo')).not.toHaveText('30');
  await page.screenshot({ path: testInfo.outputPath('candidate-gameplay.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('#cs-pause')).toBeVisible();
  expect(errors).toEqual([]); expect(requests.some(url => url.includes('sole-weights-v1'))).toBe(true);
});

// Each corrupt source gets its own browser context and the original 60s budget.
// A failed calibration can leave unrelated downloads pending until context teardown.
for (const { sourceName, source } of [
  { sourceName: 'character', source: '**/sole-weights-v1.glb*' },
  { sourceName: 'rifle', source: '**/assets/games/cs/rifle.glb' },
]) {
  test(`development candidate rejects changed source bytes before starting the game: ${sourceName}`, async ({ page }, testInfo) => {
    const messages: Promise<string>[] = [];
    const startedAt = Date.now();
    const routeEvents: { atMs: number; resourceType: string; action: string }[] = [];
    const failedRequests: { atMs: number; url: string; error: string | undefined }[] = [];
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      failedRequests.push({ atMs: Date.now() - startedAt, url: url.origin + url.pathname,
        error: request.failure()?.errorText });
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      // Firefox's console preview renders an Error as only "Error". Read its
      // actual message while the JSHandle is alive, retaining the same assertion.
      messages.push(Promise.all(message.args().map(argument => argument.evaluate(value => {
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        return String(value);
      }))).then(parts => parts.join(' ')).catch(() => message.text()));
    });
    let requests = 0;
    try {
      await page.route(source, route => {
        const resourceType = route.request().resourceType();
        if (resourceType !== 'fetch') {
          routeEvents.push({ atMs: Date.now() - startedAt, resourceType, action: 'continue-import' });
          return route.continue();
        }
        requests++;
        // Let the rifle's ordinary model load complete; corrupt only the second
        // fetch used by the development calibration's integrity check.
        if (sourceName === 'rifle' && requests === 1) {
          routeEvents.push({ atMs: Date.now() - startedAt, resourceType, action: 'continue-base-model' });
          return route.continue();
        }
        routeEvents.push({ atMs: Date.now() - startedAt, resourceType, action: 'corrupt-candidate-source' });
        return route.fulfill({ contentType: 'model/gltf-binary', body: 'invalid candidate bytes' });
      });
      await page.goto('/games/cs?skinCandidate=1');
      await expect(page.locator('#cs-load-error')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('#cs-start')).toBeDisabled();
      await expect.poll(async () => (await Promise.all(messages))
        .some(message => message.includes('Candidate source hash mismatch'))).toBe(true);
      expect(requests).toBeGreaterThanOrEqual(sourceName === 'rifle' ? 2 : 1);
    } finally {
      await testInfo.attach(`${sourceName}-source-rejection`, {
        body: JSON.stringify({ source, requests, routeEvents, failedRequests,
          messages: await Promise.all(messages) }, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

test('development skin candidate switches rifle actors without leaking palettes or changing shared sources', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium candidate lifecycle.');
  const bytes = await readFile(resolve('art-factory/cs/runs/run-20261004-v7-skin-gait/candidate/sole-weights-v1.glb'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('ceed6a8d8936bdf1eef464f8ed50d602fc7a2255bf1d483f2d423ddd953113e1');
  await page.route('**/__cs_candidate.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: bytes }));
  await page.route('**/__cs_candidate_lifecycle', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_candidate_lifecycle');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const { cloneModel, disposeModelResources } = await import('/src/scripts/games/cs/model-resources.ts');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    let loads = 0, creates = 0, source;
    const r = new GameRenderer(document.querySelector('canvas'), async () => {
      loads++; source = (await new GLTFLoader().loadAsync('/__cs_candidate.glb')).scene;
      return { source, resources: [source], dispose: () => disposeModelResources([source]), create: () => { creates++; return cloneModel(source); } };
    });
    await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    m.actors.forEach((p, i) => Object.assign(p, { weapon: 'rifle', x: i ? (i - 3) * .7 : 0, z: i ? 16 : 20, hp: 100 }));
    const render = () => r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
    const skins = model => { const list = []; model.traverse(n => { if (n.isSkinnedMesh) list.push(n); }); return list; };
    const candidates = () => [...r.candidateUnits.values()];
    try {
      render(); const first = candidates(), count = first.length;
      const skeletons = first.map(model => skins(model)[0].skeleton);
      const palettesAllocated = skeletons.every(s => s.boneTexture !== null);
      const sourceBone = source?.getObjectByName('lowerarm_l'), original = sourceBone?.quaternion.toArray();
      const privateBones = first.length === 5 && first.every((a, i) => first.every((b, j) => i === j || a.getObjectByName('lowerarm_l') !== b.getObjectByName('lowerarm_l')));
      const old = r.units.get(1), oldPalettes = skins(old).map(mesh => mesh.skeleton);
      let disposedMaterials = 0; const materials = new Set(); old.traverse(n => { if (n.isMesh) for (const mat of Array.isArray(n.material) ? n.material : [n.material]) materials.add(mat); });
      materials.forEach(mat => mat.addEventListener('dispose', () => disposedMaterials++));
      m.actors[1].weapon = 'smg'; render();
      const switchToProduction = r.tacticalUnits.has(1) && !r.candidateUnits.has(1) && !old.parent;
      const palettesReleased = oldPalettes.every(s => s.boneTexture === null);
      m.actors[1].weapon = 'rifle'; render();
      const switchBack = r.candidateUnits.has(1) && !r.tacticalUnits.has(1) && r.units.get(1) !== old;
      const sourceUnchanged = !!original && JSON.stringify(original) === JSON.stringify(sourceBone.quaternion.toArray());
      const resident = r.units.size, visible = candidates().filter(model => model.visible).length;
      r.dispose(); r.dispose();
      return { loads, creates, count, resident, visible, privateBones, palettesAllocated, palettesReleased,
        switchToProduction, switchBack, sourceUnchanged, disposedMaterials, materialCount: materials.size, finalTextures: r.renderer.info.memory.textures };
    } finally { r.dispose(); }
  });
  await testInfo.attach('candidate-lifecycle', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.loads).toBe(1); expect(result.creates).toBe(6); expect(result.count).toBe(5); expect(result.resident).toBe(6); expect(result.visible).toBe(5);
  expect(result.privateBones).toBe(true); expect(result.palettesAllocated).toBe(true); expect(result.palettesReleased).toBe(true);
  expect(result.switchToProduction).toBe(true); expect(result.switchBack).toBe(true); expect(result.sourceUnchanged).toBe(true);
  expect(result.disposedMaterials).toBe(result.materialCount); expect(result.finalTextures).toBe(1);
});

test('real skinned GLB instances isolate deformation and release their GPU bone palettes', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium real skin ownership acceptance.');
  const candidate = resolve('art-factory/cs/runs/run-20261004-v7-character-rig/candidate/full-body-review-material-final-diagnostic.glb');
  const bytes = await readFile(candidate);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('1c5be30bbb2a804242490662d32b2f8fe4074e6a853ee493511fe5b7b3ca60ce');
  await page.route('**/__cs_skin_candidate.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: bytes }));
  await page.route('**/__cs_skin_ownership', route => route.fulfill({ contentType: 'text/html', body: '<canvas style="width:960px;height:540px"></canvas>' }));
  await page.goto('/__cs_skin_ownership');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { cloneModel, disposeModelInstance, disposeModelResources } = await import('/src/scripts/games/cs/model-resources.ts');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const r = new GameRenderer(document.querySelector('canvas'));
    const initialTextures = r.renderer.info.memory.textures;
    const source = (await new GLTFLoader().loadAsync('/__cs_skin_candidate.glb')).scene;
    const first = cloneModel(source), second = cloneModel(source);
    const skins = model => { const list = []; model.traverse(node => { if (node.isSkinnedMesh) list.push(node); }); return list; };
    const palettes = model => new Set(skins(model).map(mesh => mesh.skeleton));
    const positions = model => {
      model.updateMatrixWorld(true);
      return skins(model).flatMap(mesh => {
        const vertex = mesh.position.clone(), output = [];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.getVertexPosition(i, vertex); output.push(vertex.x, vertex.y, vertex.z);
        }
        return output;
      });
    };
    const delta = (before, after) => before.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - after[index])), 0);
    try {
      const rest = positions(source);
      const restError = delta(rest, positions(first));
      first.getObjectByName('lowerarm_l').rotation.x += .3;
      const moved = delta(rest, positions(first)), secondError = delta(rest, positions(second)), sourceError = delta(rest, positions(source));
      first.position.x = -.65; second.position.x = .65;
      r.scene.add(first, second); r.camera.position.set(0, 1, 4); r.camera.lookAt(0, .9, 0);
      // This inspection bypasses GameRenderer.render; mirror its shadow refresh.
      r.renderer.shadowMap.needsUpdate = true;
      r.renderer.render(r.scene, r.camera);
      const shadowAllocated = r.sun.shadow.map !== null;
      const allPalettes = [...palettes(first), ...palettes(second)];
      const boneTextures = new Set(allPalettes.map(skeleton => skeleton.boneTexture));
      const allocated = allPalettes.every(skeleton => skeleton.boneTexture !== null);
      const loadedTextures = r.renderer.info.memory.textures;
      disposeModelInstance(first); disposeModelInstance(second);
      r.scene.remove(first, second); r.renderer.render(r.scene, r.camera);
      const removedTextures = r.renderer.info.memory.textures;
      const cleared = allPalettes.every(skeleton => skeleton.boneTexture === null);
      disposeModelResources([source]); const assetReleasedTextures = r.renderer.info.memory.textures;
      r.dispose(); r.dispose();
      return { restError, moved, secondError, sourceError, sourcePalettes: palettes(source).size,
        instancePalettes: allPalettes.length, uniqueTextures: boneTextures.size, allocated, cleared,
        initialTextures, loadedTextures, removedTextures, assetReleasedTextures, shadowAllocated, finalTextures: r.renderer.info.memory.textures };
    } finally { disposeModelResources([source, first, second]); r.dispose(); }
  });
  await testInfo.attach('actual-glb-ownership', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.restError).toBeLessThan(1e-6);
  expect(result.moved).toBeGreaterThan(.01);
  expect(result.secondError).toBeLessThan(1e-6); expect(result.sourceError).toBeLessThan(1e-6);
  expect(result.instancePalettes).toBe(result.sourcePalettes * 2);
  expect(result.allocated).toBe(true); expect(result.uniqueTextures).toBe(result.instancePalettes);
  expect(result.shadowAllocated).toBe(true);
  expect(result.cleared).toBe(true);
  expect(result.loadedTextures - result.removedTextures).toBe(result.instancePalettes);
  // Native sampler tracing identifies Three's module-global 16x16 DFG_LUT.
  // All eight GLB maps and both instance bone palettes have been deleted.
  expect(result.finalTextures).toBe(1);
});

test('entering combat with every weapon uses already prepared world and view shader programs', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium shader preparation with real GLBs.');
  await page.route('**/__cs_shader_prepare_test',route=>route.fulfill({contentType:'text/html',body:'<canvas width="1280" height="720"></canvas>'}));
  await page.goto('/__cs_shader_prepare_test');
  const results=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const rows=[];
    try {
      for(const high of [true,false]){
        r.quality(high);r.render(null,1/60,{yaw:0,pitch:0},false);
        const prepared=new Set(r.renderer.info.programs.map(program=>program.id));
        const m=createMatch('attack');m.phase='live';
        m.actors.forEach((actor,i)=>Object.assign(actor,{x:i===0?0:(i-3)*.7,z:i===0?20:16,weapon:['rifle','pistol','smg','sniper'][i%4],hp:100}));
        for(const weapon of ['pistol','smg','rifle','sniper']){
          m.actors[0].weapon=weapon;r.render(m,1/60,{yaw:0,pitch:-.1},false);
        }
        rows.push({high,unprepared:r.renderer.info.programs.filter(program=>!prepared.has(program.id)).map(program=>({id:program.id,name:program.name}))});
      }
      return rows;
    } finally {r.dispose();}
  });
  for(const row of results)expect(row.unprepared,`unprepared shaders in ${row.high?'high':'low'} quality`).toEqual([]);
});

test('all model images are uploaded before start, including unused weapons and bomb', async ({ page }) => {
  await page.route('**/__cs_model_upload', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_model_upload');
  const rows = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const rows = [];
    for (const high of [false, true]) {
      const r = new GameRenderer(document.querySelector('canvas')); r.quality(high); await r.load();
      const gl = r.renderer.getContext(), original = gl.texSubImage2D, uploads = [];
      gl.texSubImage2D = function (...args) {
        if (args.some(arg => arg instanceof ImageBitmap || arg instanceof HTMLImageElement)) uploads.push('image');
        return original.apply(this, args);
      };
      try {
        const m = createMatch('attack');
        r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
        m.phase = 'live'; m.bomb.carrier = null;
        for (const weapon of ['pistol', 'smg', 'rifle', 'sniper']) {
          m.actors[0].weapon = weapon;
          r.render(m, 1 / 60, { yaw: 0, pitch: 0 }, false);
        }
        rows.push({ high, uploads });
      } finally { gl.texSubImage2D = original; r.dispose(); }
    }
    return rows;
  });
  for (const row of rows) expect(row.uploads, `cold model images after load high=${row.high}`).toEqual([]);
});

test('first real shot uses prepared impact and viewmodel programs and textures in both quality modes', async ({ page }, testInfo) => {
  await page.route('**/__cs_first_shot', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_first_shot');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const rows = [];
    for (const high of [true, false]) {
      const r = new GameRenderer(document.querySelector('canvas')); r.quality(high); await r.load();
      try {
        const m = createMatch('attack'); m.phase = 'live';
        m.actors.forEach((p, i) => Object.assign(p, { x: i ? 20 : 0, z: i ? 18 + i : 20, weapon: 'rifle', ammo: 30 }));
        const render = () => r.render(m, 1 / 60, { yaw: 0, pitch: -.3 }, false);
        render();
        const prepared = new Set(r.renderer.info.programs.map(p => p.id));
        const texturesBefore = r.renderer.info.memory.textures;
        const gl = r.renderer.getContext(), firstUseCalls = [], restores = [];
        for (const name of ['getProgramInfoLog', 'getShaderInfoLog', 'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getAttribLocation']) {
          const original = gl[name];
          gl[name] = function (...args) { firstUseCalls.push(name); return original.apply(this, args); };
          restores.push(() => { gl[name] = original; });
        }
        try { stepMatch(m, { 0: { fire: true, yaw: 0, pitch: -.3 } }, 1 / 60); render(); }
        finally { restores.forEach(restore => restore()); }
        const shot = m.shots.at(-1);
        rows.push({ high, shot: { surface: shot.surface, ammo: m.actors[0].ammo }, effects: r.effects.stats(), texturesBefore, texturesAfter: r.renderer.info.memory.textures, firstUseCalls,
          unprepared: r.renderer.info.programs.filter(p => !prepared.has(p.id)).map(p => ({ name: p.name,
            defines: gl.getShaderSource(p.vertexShader).split('\n').filter(line => line.startsWith('#define ')) })) });
      } finally { r.dispose(); }
    }
    return rows;
  });
  await writeFile(testInfo.outputPath('first-shot-programs.json'), JSON.stringify(result, null, 2));
  for (const row of result) {
    expect(['ground', 'stone']).toContain(row.shot.surface); expect(row.shot.ammo).toBe(29);
    expect(row.effects.decals).toBe(1); expect(row.effects.casings).toBe(1); expect(row.effects.flashes).toBeGreaterThan(0);
    expect(row.unprepared, `first-shot programs high=${row.high}`).toEqual([]);
    expect(row.texturesAfter, `first-shot texture uploads high=${row.high}`).toBe(row.texturesBefore);
    expect(row.firstUseCalls, `first-shot synchronous shader queries high=${row.high}`).toEqual([]);
  }
});

test('first live frames draw no program and vertex layout pair that loading did not draw', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium; ANGLE D3D11 compiles shader executables per drawn vertex layout.');
  // compile() links a program for a generic float layout. ANGLE D3D11 builds the
  // real vertex executable (D3DCompile in the GPU process) on the first draw with
  // each concrete attribute format, e.g. skinned viewmodels' integer skinIndex.
  // That stall is invisible to main-thread long tasks, so assert the draw keys.
  await page.route('**/__cs_first_layout', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="1280" height="720"></canvas>' }));
  await page.goto('/__cs_first_layout');
  const rows = await page.evaluate(async () => {
    const proto = WebGL2RenderingContext.prototype as any, layouts = new Map<object, Map<number, any>>();
    const state: { program: any; vao: object; seen: Set<string> } = { program: null, vao: proto, seen: new Set() };
    const layout = () => { if (!layouts.has(state.vao)) layouts.set(state.vao, new Map()); return layouts.get(state.vao)!; };
    const attr = (index: number) => { const map = layout(); if (!map.has(index)) map.set(index, { enabled: false, format: 'float4', divisor: 0 }); return map.get(index); };
    const wrap = (name: string, before: (...args: any[]) => void) => { const original = proto[name]; proto[name] = function (...args: any[]) { before(...args); return original.apply(this, args); }; };
    let programs = 0;
    wrap('useProgram', program => { if (program && !program.csId) program.csId = ++programs; state.program = program; });
    wrap('bindVertexArray', vao => { state.vao = vao ?? proto; });
    wrap('enableVertexAttribArray', index => { attr(index).enabled = true; });
    wrap('disableVertexAttribArray', index => { attr(index).enabled = false; });
    wrap('vertexAttribPointer', (index, size, type, normalized) => { attr(index).format = `f${size}:${type}:${normalized}`; });
    wrap('vertexAttribIPointer', (index, size, type) => { attr(index).format = `i${size}:${type}`; });
    wrap('vertexAttribDivisor', (index, divisor) => { attr(index).divisor = divisor; });
    const draws: { key: string; name: string; program: any }[] = [];
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) wrap(name, mode => {
      const vertex = [...layout()].filter(([, a]) => a.enabled).sort(([a], [b]) => a - b).map(([index, a]) => `${index}=${a.format}/${a.divisor}`).join(',');
      draws.push({ key: `${state.program?.csId}|${mode}|${vertex}`, name, program: state.program });
    });
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const rows = [];
    for (const high of [true, false]) {
      const r = new GameRenderer(document.querySelector('canvas')!); r.quality(high);
      draws.length = 0; await r.load();
      r.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
      const loaded = new Set(draws.map(draw => draw.key)); draws.length = 0;
      try {
        for (const weapon of ['pistol', 'smg', 'rifle', 'sniper'] as const) {
          const m = createMatch('attack'); m.phase = 'live';
          m.actors.forEach((p, i) => Object.assign(p, { x: i ? (i - 3) * .7 : 0, z: i ? 16 : 20, weapon: i ? (['rifle', 'pistol', 'smg', 'sniper'] as const)[i % 4] : weapon, ammo: 30, hp: 100 }));
          const render = () => r.render(m, 1 / 60, { yaw: 0, pitch: -.3 }, false);
          render(); stepMatch(m, { 0: { fire: true, yaw: 0, pitch: -.3 } }, 1 / 60); render(); render();
        }
        const gl = r.renderer.getContext(), describe = (program: WebGLProgram) => (gl.getAttachedShaders(program) ?? [])
          .flatMap(shader => (gl.getShaderSource(shader) ?? '').split(/\r?\n/).filter(line => /^#define (SHADER_NAME|SHADER_TYPE|USE_SKINNING|DEPTH_PACKING|USE_SHADOWMAP|USE_INSTANCING)/.test(line)))
          .filter((line, i, all) => all.indexOf(line) === i).join(' ');
        const fresh = [...new Map(draws.filter(draw => !loaded.has(draw.key)).map(draw => [draw.key, `${draw.key} ${describe(draw.program)}`])).values()];
        rows.push({ high, loaded: loaded.size, fresh });
      } finally { r.dispose(); }
    }
    return rows;
  });
  await writeFile(testInfo.outputPath('first-live-draw-layouts.json'), JSON.stringify(rows, null, 2));
  for (const row of rows) {
    expect(row.loaded, `loading draws high=${row.high}`).toBeGreaterThan(0);
    expect(row.fresh, `live program/vertex layouts first drawn after loading high=${row.high}`).toEqual([]);
  }
});

test('daylight sky loads in the measured sun direction and releases its texture when the game closes', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium HDR sky acceptance.');
  if(process.env.CS_SKY_CANDIDATE)await page.route('**/assets/games/cs/sky.hdr',route=>route.fulfill({contentType:'application/octet-stream',path:process.env.CS_SKY_CANDIDATE}));
  await page.route('**/__cs_sky_test',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));
  await page.goto('/__cs_sky_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();r.render(null,1/60,{yaw:0,pitch:0},false);
    const background=r.scene.background;let disposed=0;background?.addEventListener('dispose',()=>disposed++);
    const result={isHDR:!!background?.isDataTexture,width:background?.image.width,height:background?.image.height,
      rotationY:r.scene.backgroundRotation.y,backgroundIsLighting:background===r.scene.environment,
      viewUsesOriginalLighting:r.viewScene.environment===r.environment.texture,worldIntensity:r.scene.environmentIntensity,
      hdrMatchesRenderTargetTexture:background instanceof r.environment.texture.constructor};
    r.dispose();r.dispose();return {...result,disposed};
  });
  expect(result.isHDR).toBe(true);expect(result.width).toBe(1024);expect(result.height).toBe(512);
  expect(result.rotationY).toBeCloseTo(-1.8861421782,7);expect(result.backgroundIsLighting).toBe(false);
  expect(result.viewUsesOriginalLighting).toBe(true);expect(result.worldIntensity).toBe(.16);expect(result.disposed,JSON.stringify(result)).toBe(1);
});

test('a missing daylight sky fails loading and the same page can retry successfully', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium real asset load lifecycle.');
  let fail=true;
  await page.route('**/assets/games/cs/sky.hdr',route=>fail?route.fulfill({status:503,body:'unavailable'}):process.env.CS_SKY_CANDIDATE?route.fulfill({contentType:'application/octet-stream',path:process.env.CS_SKY_CANDIDATE}):route.continue());
  await page.goto('/games/cs');
  await expect(page.locator('#cs-load-error')).toBeVisible();await expect(page.locator('#cs-start')).toBeDisabled();
  fail=false;await page.locator('#cs-retry').click();await expect(page.locator('#cs-start')).toBeEnabled({timeout:30000});
  await expect(page.locator('#cs-load-error')).toBeHidden();
});

test('a failed asset reports immediately while another download is stalled, then retry succeeds', async ({ page }, testInfo) => {
  let fail = true, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/games/cs/environment.glb', async route => {
    if (fail) await pending;
    try { await route.continue(); } catch { /* The failed load may already have cancelled this request. */ }
  });
  await page.route('**/assets/games/cs/sky.hdr', route => fail ? route.fulfill({ status: 503, body: 'controlled unavailable sky' }) : route.continue());
  try {
    await page.goto('/games/cs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#cs-load-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cs-start')).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('failed-load-with-pending-download.png') });
    fail = false; release(); await page.locator('#cs-retry').click();
    await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
    await expect(page.locator('#cs-load-error')).toBeHidden();
  } finally { release(); }
});

test('missing shared hand image fails visibly and retry restores complete materials', async ({ page }) => {
  let fail = true;
  await page.route('**/assets/games/cs/shared/fps/*.png', route => fail ? route.fulfill({ status: 404, body: 'controlled missing shared image' }) : route.continue());
  await page.goto('/games/cs');
  await expect(page.locator('#cs-load-error')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#cs-start')).toBeDisabled();
  fail = false; await page.locator('#cs-retry').click();
  await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#cs-load-error')).toBeHidden();
});

test('four skeletal viewmodels share six authored maps (V36 sleeve fabric detail included) before shader preparation', async ({ page }) => {
  await page.route('**/__cs_shared_hands', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/__cs_shared_hands');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, WEAPONS } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas')), prepare = r.preparePrograms.bind(r);
    let beforePrepare;
    r.preparePrograms = () => {
      const all = new Set(), materials = new Set(), weapons = [];
      for (const [id, model] of r.weapons) {
        const textures = new Set(), bones = new Set();
        model.traverse(node => {
          if (node.isBone && node.name.startsWith('fps_')) bones.add(node);
          if (!node.isMesh) return;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            let tagged = false;
            for (const value of Object.values(material)) if (value?.isTexture && value.userData.csSharedSource) { textures.add(value); all.add(value); tagged = true; }
            if (tagged) materials.add(material);
          }
        });
        weapons.push({ id, maps: textures.size, bones: bones.size, clips: model.animations.map(a => a.name) });
      }
      beforePrepare = { weapons, unique: all.size, materials: materials.size }; prepare();
    };
    try {
      await r.load();
      const match = createMatch('attack'); match.phase = 'live';
      const counts = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const weapon of ['pistol', 'smg', 'rifle', 'sniper']) {
          Object.assign(match.actors[0], { weapon, reload: WEAPONS[weapon].reload * .4 });
          r.render(match, 1 / 60, { yaw: 0, pitch: 0 }, false);
        }
        counts.push(r.renderer.info.memory.textures);
      }
      return { beforePrepare, counts, error: r.renderer.getContext().getError() };
    } finally { r.dispose(); }
  });
  expect(result.beforePrepare.unique).toBe(6); expect(result.beforePrepare.materials).toBe(8);
  expect(result.beforePrepare.weapons).toHaveLength(4);
  for (const weapon of result.beforePrepare.weapons) {
    expect(weapon.maps, weapon.id).toBe(6); expect(weapon.bones, weapon.id).toBe(48); expect(weapon.clips, weapon.id).toEqual(['fps_reload']);
  }
  expect(new Set(result.counts).size).toBe(1); expect(result.error).toBe(0);
});

for (const stage of ['image-error', 'upload', 'effects', 'compile', 'transfer-cancel', 'success']) test(`loaded resources are released once after ${stage}`, async ({ page }) => {
  if (stage === 'image-error') await page.route('**/assets/games/cs/shared/fps/*.png', route => route.fulfill({ status: 404, body: 'controlled missing image' }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/asset-loading.ts' && !url.searchParams.has('ownership-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/asset-loading.ts?ownership-source';
    import { loadOwnedResources as real } from '/src/scripts/games/cs/asset-loading.ts?ownership-source';
    export async function loadOwnedResources(...args) {
      const values = await real(...args), resources = new Set();
      for (const value of values) {
        if (value.isTexture) resources.add(value);
        else value.scene.traverse(node => {
          if (!node.isMesh) return;
          resources.add(node.geometry);
          for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
            resources.add(mat); for (const v of Object.values(mat)) if (v?.isTexture) resources.add(v);
          }
        });
      }
      window.csAssetDisposals = [...resources].map(resource => { const record = { type: resource.type, count: 0 }; resource.addEventListener('dispose', () => record.count++); return record; });
      if (window.csCancelAtTransfer) window.csOwnershipRenderer.dispose();
      return values;
    }` }));
  if (stage === 'effects') await page.route(url => url.pathname === '/src/scripts/games/cs/combat-effects.ts', route => route.fulfill({ contentType: 'text/javascript', body: `export class CombatEffects { constructor() { throw new Error('controlled setup failure'); } }` }));
  await page.route('**/__cs_load_ownership', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/__cs_load_ownership');
  const result = await page.evaluate(async stage => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const r = new GameRenderer(document.querySelector('canvas'));
    window.csOwnershipRenderer = r; window.csCancelAtTransfer = stage === 'transfer-cancel';
    let compileCalls = 0; const compile = r.renderer.compile.bind(r.renderer);
    r.renderer.compile = (...args) => { compileCalls++; return compile(...args); };
    if (stage === 'upload' || stage === 'compile') r.renderer[stage === 'upload' ? 'initTexture' : 'compile'] = () => { throw new Error('controlled setup failure'); };
    let error = null; try { await r.load(); } catch (caught) { error = caught.message; }
    if (stage === 'success') r.dispose();
    const beforeRepeat = window.csAssetDisposals?.map(record => ({ ...record })) ?? [];
    r.dispose(); return { error, beforeRepeat, afterRepeat: window.csAssetDisposals ?? [], textures: r.renderer.info.memory.textures, compileCalls };
  }, stage);
  expect(result.error).toBe(stage === 'success' || stage === 'transfer-cancel' ? null : stage === 'image-error' ? 'Required model texture unavailable' : 'controlled setup failure');
  expect(result.beforeRepeat.length).toBeGreaterThan(10);
  expect(result.beforeRepeat.filter(record => record.count !== 1)).toEqual([]);
  expect(result.afterRepeat).toEqual(result.beforeRepeat);
  // Successful skin-pass warmup now renders PBR surfaces during load. Three's
  // module-shared 16x16 RG16F DFG LUT remains cached after renderer disposal;
  // all loaded assets above must still emit exactly one dispose event.
  expect(result.textures).toBe(stage==='success'?1:0);
  if (stage === 'transfer-cancel' || stage === 'image-error') expect(result.compileCalls).toBe(0);
});

test('skeletal soldiers aim with connected shoulder joints, fixed grips and stationary legs', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium actual soldier and weapon articulation.');
  await page.route('**/__cs_actor_aim_test',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));
  await page.goto('/__cs_actor_aim_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();
    const m=createMatch('attack');m.phase='live';const p=m.actors[3];
    Object.assign(p,{weapon:'rifle',yaw:.7,pitch:0,recoilPitch:0,recoilYaw:0,moving:false});
    r.render(m,1/60,{yaw:0,pitch:0},false);
    const model=r.units.get(p.id);model.updateMatrixWorld(true);
    const gun=()=>model.getObjectByName('held-weapon');
    const left=model.getObjectByName('hand_l'),right=model.getObjectByName('hand_r');
    const relative=arm=>gun().matrixWorld.clone().invert().multiply(arm.matrixWorld).toArray();
    const rows=[];
    for(const weapon of ['rifle','pistol','smg','sniper']){
    p.weapon=weapon;p.pitch=0;r.render(m,1/60,{yaw:0,pitch:0},false);model.updateMatrixWorld(true);
    const restRelative=[relative(left),relative(right)];
    const legRest=['thigh_l','thigh_r'].map(name=>model.getObjectByName(name).matrixWorld.toArray());
    // Animated shoulders stay attached to their authored clavicles. A skinned
    // torso can rotate; requiring fixed world-space shoulder points was a
    // property of the former separate rigid-arm model, not joint continuity.
    const shoulders=['upperarm_l','upperarm_r'].map(name=>model.getObjectByName(name));
    const shoulderLocal=shoulders.map(bone=>bone.position.clone());
    for(const pitch of [.4,-.4,0]){
      p.pitch=pitch;r.render(m,1/60,{yaw:0,pitch:0},false);model.updateMatrixWorld(true);
      const direction=model.position.clone().set(0,0,-1).transformDirection(gun().matrixWorld);
      const expected=model.position.clone().set(-Math.sin(p.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(p.yaw)*Math.cos(pitch));
      rows.push({weapon,pitch,directionError:direction.distanceTo(expected),
        shoulderDrift:Math.max(...shoulders.map((bone,i)=>bone.position.distanceTo(shoulderLocal[i]))),
        gripError:Math.max(...[relative(left),relative(right)].flat().map((v,i)=>Math.abs(v-restRelative.flat()[i]))),
        legError:Math.max(...['thigh_l','thigh_r'].flatMap(name=>model.getObjectByName(name).matrixWorld.toArray()).map((v,i)=>Math.abs(v-legRest.flat()[i]))) });
    }
    }
    p.pitch=.3;p.recoilPitch=.06;r.render(m,1/60,{yaw:0,pitch:0},false);model.updateMatrixWorld(true);
    const recoilPitch=Math.asin(model.position.clone().set(0,0,-1).transformDirection(gun().matrixWorld).y);
    const beforePause=gun().matrixWorld.toArray();for(let i=0;i<20;i++)r.render(m,0,{yaw:0,pitch:0},false);
    model.updateMatrixWorld(true);const paused=gun().matrixWorld.toArray();
    for(const weapon of ['pistol','smg','sniper','rifle']){p.weapon=weapon;r.render(m,1/60,{yaw:0,pitch:0},false);}
    let heldCount=0;model.traverse(node=>{if(node.name==='held-weapon')heldCount++;});
    m.phase='buy';r.render(m,0,{yaw:0,pitch:0},false);model.updateMatrixWorld(true);
    const buyPitch=Math.asin(model.position.clone().set(0,0,-1).transformDirection(gun().matrixWorld).y);
    const skeletal=r.tacticalUnits.has(p.id);r.dispose();return {rows,recoilPitch,beforePause,paused,heldCount,buyPitch,skeletal};
  });
  expect(result.skeletal).toBe(true);for(const row of result.rows){
    expect(row.directionError,`actual gun direction at pitch ${row.pitch}`).toBeLessThan(.00001);
    expect(row.shoulderDrift).toBeLessThan(.00001);expect(row.gripError).toBeLessThan(.00001);expect(row.legError).toBeLessThan(.00001);
  }
  expect(result.recoilPitch).toBeCloseTo(.36,5);expect(result.paused).toEqual(result.beforePause);
  expect(result.heldCount).toBe(1);expect(result.buyPitch).toBeCloseTo(0,5);
});

test('skeletal soldier walking bends the real legs, preserves hip joints and returns to its rest pose', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium real GLB articulation acceptance.');
  const candidate=process.env.CS_SOLDIER_CANDIDATE;
  if(candidate)await page.route('**/assets/games/cs/soldier.glb',route=>route.fulfill({contentType:'model/gltf-binary',path:candidate}));
  await page.route('**/__cs_soldier_test',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));
  await page.goto('/__cs_soldier_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();
    const m=createMatch('attack');m.phase='live';const p=m.actors[3];Object.assign(p,{weapon:'rifle',x:0,z:20,y:0,yaw:0,pitch:0,moving:false});r.render(m,1/60,{yaw:0,pitch:0},false);
    const model=r.units.get(p.id),names=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'],bones=names.map(n=>model.getObjectByName(n));
    const rest=bones.map(b=>b.quaternion.clone()),origins=bones.map(b=>b.position.clone());let motion=0,jointDrift=0;
    for(let i=0;i<60;i++){
      p.moving=true;p.z+=2.2/60;m.time+=1/60;r.render(m,1/60,{yaw:0,pitch:0},false);
      motion=Math.max(motion,...bones.map((b,j)=>b.quaternion.angleTo(rest[j])));jointDrift=Math.max(jointDrift,...bones.map((b,j)=>b.position.distanceTo(origins[j])));
    }
    p.moving=false;for(let i=0;i<20;i++){m.time+=1/60;r.render(m,1/60,{yaw:0,pitch:0},false);}
    const restError=Math.max(...bones.map((b,j)=>b.quaternion.clone().normalize().angleTo(rest[j].clone().normalize()))),skeletal=r.tacticalUnits.has(p.id);
    r.dispose();return {motion,jointDrift,restError,skeletal};
  });
  expect(result.skeletal).toBe(true);expect(result.motion).toBeGreaterThan(.15);
  expect(result.jointDrift).toBeLessThan(.00001);expect(result.restError).toBeLessThan(.00001);
});

test('pistol plays the authored hand skeleton and resets it after a weapon switch', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium actual skinned pistol GLB.');
  await page.route('**/__cs_pistol_skin',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto('/__cs_pistol_skin');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts'),{createMatch,WEAPONS}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const m=createMatch('attack');m.phase='live';const p=m.actors[0];p.weapon='pistol';p.reload=0;
    const render=()=>{r.render(m,1/60,{yaw:0,pitch:0},false);r.gun.updateMatrixWorld(true);};render();
    const sample=name=>r.gun.matrixWorld.clone().invert().multiply(r.gun.getObjectByName(name).matrixWorld).toArray();
    const initial={left:sample('fps_hand_L'),right:sample('fps_hand_R')},skeletal=r.gunRig.hasSkeletalReload;
    p.reload=WEAPONS.pistol.reload*.15;render();const atSlide={left:sample('fps_hand_L'),right:sample('fps_hand_R')};
    for(let i=0;i<30;i++)r.render(m,0,{yaw:0,pitch:0},false);r.gun.updateMatrixWorld(true);const paused=sample('fps_hand_L');
    const releases=[];
    for(let cycle=0;cycle<4;cycle++){
      const palettes=new Set(),materials=new Set();r.gun.traverse(n=>{if(n.isSkinnedMesh)palettes.add(n.skeleton);if(n.isMesh)for(const material of Array.isArray(n.material)?n.material:[n.material])materials.add(material);});
      const counts=new Map([...materials].map(material=>[material,0]));for(const material of materials)material.addEventListener('dispose',()=>counts.set(material,counts.get(material)+1));
      const allocated=[...palettes].every(s=>s.boneTexture!==null);p.weapon='rifle';p.reload=0;render();
      releases.push({allocated,released:[...palettes].every(s=>s.boneTexture===null),materialDisposals:[...counts.values()]});p.weapon='pistol';render();
    }
    const restored={left:sample('fps_hand_L'),right:sample('fps_hand_R')};
    const skins=[];r.gun.traverse(n=>{if(n.isSkinnedMesh)skins.push(n.skeleton.bones.length);});r.dispose();return {initial,atSlide,paused,restored,skeletal,skins,releases};
  });
  expect(result.skeletal).toBe(true);expect(result.skins.length).toBeGreaterThan(0);expect(result.skins.every(n=>n===48)).toBe(true);
  expect(Math.max(...result.initial.left.map((v,i)=>Math.abs(v-result.atSlide.left[i])))).toBeGreaterThan(.1);
  expect(Math.max(...result.initial.right.map((v,i)=>Math.abs(v-result.atSlide.right[i])))).toBeLessThan(.00001);
  expect(result.paused).toEqual(result.atSlide.left);
  for(const cycle of result.releases){expect(cycle.allocated).toBe(true);expect(cycle.released).toBe(true);expect(cycle.materialDisposals.every(n=>n===1)).toBe(true);}
  for(const side of ['left','right'] as const)expect(Math.max(...result.initial[side].map((v,i)=>Math.abs(v-result.restored[side][i])))).toBeLessThan(.00001);
});

test('weapon reload starts at rest for every duration and pauses without advancing parts', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium WebGL viewmodel acceptance.');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/__cs_motion_test',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:960px;height:540px"></canvas>'}));
  await page.goto('/__cs_motion_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch,WEAPONS}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();
    const m=createMatch('attack');m.phase='live';const p=m.actors[0];const rows=[];
    for(const weapon of ['pistol','smg','rifle','sniper']){
      p.weapon=weapon;p.reload=0;p.moving=false;r.render(m,1/60,{yaw:0,pitch:0},false);
      const atRest=r.gun.rotation.toArray().slice(0,3);
      let magazine;r.gun.traverse(node=>{if(node.name==='Magazine'||node.name.endsWith('_Magazine'))magazine=node;});
      const magazineRest=magazine?.position.toArray();
      p.reload=WEAPONS[weapon].reload;r.render(m,1/60,{yaw:0,pitch:0},false);
      const start=r.gun.rotation.toArray().slice(0,3);
      p.reload=WEAPONS[weapon].reload*.65;r.render(m,1/60,{yaw:0,pitch:0},false);
      const middle=r.gun.rotation.toArray().slice(0,3);
      const removed=magazine?.position.toArray();
      for(let i=0;i<30;i++)r.render(m,0,{yaw:0,pitch:0},false);
      const paused=r.gun.rotation.toArray().slice(0,3),pausedPart=magazine?.position.toArray();
      p.reload=0;r.render(m,1/60,{yaw:0,pitch:0},false);
      const end=r.gun.rotation.toArray().slice(0,3);
      const magazineEnd=magazine?.position.toArray();
      const cameraY=r.camera.position.y;p.moving=true;m.time+=.1;r.render(m,.1,{yaw:0,pitch:0},false);
      rows.push({weapon,atRest,start,middle,paused,removed,pausedPart,end,magazineRest,magazineEnd,cameraY,walkingY:r.camera.position.y});
    }
    r.dispose();return rows;
  });
  for(const row of result){
    row.start.forEach((value,i)=>expect(value,`${row.weapon} starts at rest`).toBeCloseTo(row.atRest[i],8));
    expect(Math.abs(row.middle[2])).toBeGreaterThan(.2);expect(row.paused).toEqual(row.middle);
    expect(row.pausedPart).toEqual(row.removed);
    if(row.weapon!=='rifle'){
      expect(row.magazineRest,`${row.weapon} includes its source magazine`).toHaveLength(3);
      expect(Math.hypot(...row.removed.map((value,i)=>value-row.magazineRest[i]))).toBeGreaterThan(.05);
      expect(row.magazineEnd).toEqual(row.magazineRest);
    }
    row.end.forEach((value,i)=>expect(value).toBeCloseTo(row.atRest[i],8));
    expect(row.walkingY).toBe(row.cameraY);
  }
});

test('round and match results restore a weapon interrupted during reload', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium WebGL viewmodel acceptance.');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/__cs_result_motion_test',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:960px;height:540px"></canvas>'}));
  await page.goto('/__cs_result_motion_test');
  const rows=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch,WEAPONS}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const results=[];
    for(const phase of ['round-over','match-over']){
      const m=createMatch('attack');m.phase='live';const p=m.actors[0];p.weapon='pistol';
      r.render(m,1/60,{yaw:0,pitch:0},false);
      let mag;r.gun.traverse(node=>{if(node.name==='Magazine'||node.name.endsWith('_Magazine'))mag=node;});
      const rest={rotation:r.gun.rotation.toArray(),magazine:mag.position.toArray()};
      p.reload=WEAPONS.pistol.reload*.53;r.render(m,1/60,{yaw:0,pitch:0},false);
      const removed=!mag.visible;m.phase=phase;r.render(m,0,{yaw:0,pitch:0},false);
      const result={rotation:r.gun.rotation.toArray(),magazine:mag.position.toArray()};
      const visible=r.gun.visible&&mag.visible;
      m.phase='buy';m.round++;p.reload=0;r.render(m,1/60,{yaw:0,pitch:0},false);
      m.phase='live';r.render(m,1/60,{yaw:0,pitch:0},false);
      results.push({phase,rest,removed,result,visible,next:r.gun.rotation.toArray()});
    }
    r.dispose();return results;
  });
  for(const row of rows){
    expect(row.removed).toBe(true);expect(row.visible).toBe(true);
    expect(row.result,`${row.phase} returns to rest`).toEqual(row.rest);
    expect(row.next).toEqual(row.rest.rotation);
  }
});

test('first-person lighting follows world sun direction and building shade without extra resources', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium WebGL viewmodel acceptance.');
  await page.route('**/__cs_lighting_test',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:960px;height:540px"></canvas>'}));
  await page.goto('/__cs_lighting_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();
    const m=createMatch('attack'),p=m.actors[0];m.phase='live';p.weapon='rifle';p.x=0;p.z=23;
    const render=(yaw=0,dt=1/60)=>r.render(m,dt,{yaw,pitch:0},false);
    render();const lamp=r.viewScene.children.find(node=>node.isDirectionalLight);
    const direction=()=>lamp.position.clone().applyQuaternion(r.camera.quaternion).normalize().toArray();
    const initial={direction:direction(),intensity:lamp.intensity,memory:{...r.renderer.info.memory}};
    render(Math.PI/2);const turned=direction();
    p.x=8;p.z=-1;for(let i=0;i<90;i++)render(Math.PI/2);
    const shaded=lamp.intensity,shadeDirection=direction();p.x=0;p.z=23;
    render(Math.PI/2,0);const paused=lamp.intensity;
    for(let i=0;i<90;i++)render(Math.PI/2);
    const back=lamp.intensity,memory={...r.renderer.info.memory};r.dispose();
    return {initial,turned,shaded,shadeDirection,paused,back,memory};
  });
  result.turned.forEach((value,i)=>expect(value).toBeCloseTo(result.initial.direction[i],6));
  expect(result.shaded).toBeLessThan(result.initial.intensity*.35);
  expect(result.paused).toBe(result.shaded);expect(result.back).toBeCloseTo(result.initial.intensity,3);
  expect(result.memory).toEqual(result.initial.memory);
});

test('CS bounds high-DPI buffers and keeps AO at half resolution through quality changes', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL renderer acceptance.');
  await page.route('**/__cs_budget_test', route => route.fulfill({ contentType: 'text/html', body: '<canvas style="width:2880px;height:1620px"></canvas>' }));
  await page.goto('/__cs_budget_test');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const r = new GameRenderer(document.querySelector('canvas')!);
    const sizes = () => ({ pixels:r.renderer.domElement.width * r.renderer.domElement.height, aoWidth:r.occlusion.width, width:r.renderer.domElement.width, samples:r.composer.renderTarget1.samples });
    const high = sizes(); r.quality(false); const low = sizes();
    document.querySelector('canvas')!.style.width = '1600px'; r.resize(); r.quality(true); const resized = sizes();
    r.dispose(); return { high, low, resized };
  });
  expect(result.high.pixels).toBeLessThanOrEqual(1920 * 1080);
  expect(result.low.pixels).toBeLessThanOrEqual(1280 * 720);
  expect(result.high.samples).toBe(0);
  expect(result.high.aoWidth).toBeLessThanOrEqual(Math.ceil(result.high.width / 2));
  expect(result.resized.aoWidth).toBeLessThanOrEqual(Math.ceil(result.resized.width / 2));
});

test('CS updates moving shadows once per frame and reuses expired tracer resources', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL renderer acceptance.');
  await page.route('**/__cs_resources_test', route => route.fulfill({ contentType: 'text/html', body: '<canvas style="width:800px;height:450px"></canvas>' }));
  await page.goto('/__cs_resources_test');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas')!); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    r.render(m, 1/60, {yaw:0,pitch:0}, false);
    const counts = new Map(); r.scene.traverse(o => { if (o.isMesh && o.castShadow) o.onBeforeShadow = () => counts.set(o.uuid, (counts.get(o.uuid) ?? 0) + 1); });
    m.actors[1].x += .2; r.render(m, 1/60, {yaw:0,pitch:0}, false);
    const first = [...counts.values()]; counts.clear();
    m.actors[1].x += .2; r.render(m, 1/60, {yaw:0,pitch:0}, false);
    const second = [...counts.values()];
    const shot = {id:1,round:1,actor:0,weapon:'pistol',x:0,y:1.5,z:23,tx:0,ty:1.5,tz:18,at:m.time,hit:false,head:false,nx:0,ny:0,nz:1,surface:'stone',target:null,damage:0,armorDamage:0,killed:false};
    m.shots = [shot]; m.serial=1; r.render(m,1/60,{yaw:0,pitch:0},false);
    let geometry; r.tracers.traverse(o => {if(o.geometry) geometry=o.geometry;});
    const before=r.renderer.info.memory.geometries;
    for(let i=0;i<30;i++) {m.time+=.1;shot.at=m.time;shot.id=++m.serial;r.render(m,1/60,{yaw:0,pitch:0},false);}
    let current; r.tracers.traverse(o => {if(o.geometry) current=o.geometry;});
    const reused=geometry === current, after=r.renderer.info.memory.geometries;
    m.time+=1;r.render(m,1/60,{yaw:0,pitch:0},false);
    const empty = r.tracers.visible === false || r.tracers.children.length === 0;
    const gl=r.renderer.getContext();
    const shadowPrograms = r.renderer.info.programs.map(program => gl.getShaderSource(program.fragmentShader)).filter(source => source?.includes('#define USE_SHADOWMAP'));
    const filteredShadows = shadowPrograms.length > 0 && shadowPrograms.every(source => source.includes('#define SHADOWMAP_TYPE_PCF'));
    r.dispose();return {first,second,reused,before,after,empty,filteredShadows};
  });
  expect(result.first.length).toBeGreaterThan(0); expect(Math.max(...result.first)).toBe(1);
  expect(result.second.length).toBeGreaterThan(0); expect(Math.max(...result.second)).toBe(1);
  expect(result.reused).toBe(true); expect(result.after).toBe(result.before); expect(result.empty).toBe(true);
  expect(result.filteredShadows).toBe(true);
});

test('high quality bounds the scene pixel budget while retaining shadows and half-resolution occlusion', async ({ page }) => {
  await page.route('**/__cs_pixel_budget', route => route.fulfill({ contentType: 'text/html', body: '<style>canvas{width:1920px;height:1080px}</style><canvas></canvas>' }));
  await page.goto('/__cs_pixel_budget');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const r = new GameRenderer(document.querySelector('canvas'));
    const read = () => ({ width: r.renderer.domElement.width, height: r.renderer.domElement.height,
      aoWidth: r.occlusion.normalRenderTarget.width, aoHeight: r.occlusion.normalRenderTarget.height,
      shadows: r.renderer.shadowMap.enabled, ao: r.occlusion.enabled });
    try {
      r.quality(true); const high = read(); r.quality(false); const low = read();
      document.querySelector('canvas').style.width = '3840px'; document.querySelector('canvas').style.height = '2160px';
      r.quality(true); const resized = read(); return { high, low, resized };
    } finally { r.dispose(); }
  });
  expect(result.high).toEqual({ width: 1600, height: 900, aoWidth: 800, aoHeight: 450, shadows: true, ao: true });
  expect(result.resized).toEqual(result.high);
  expect(result.low.width).toBe(1280); expect(result.low.height).toBe(720); expect(result.low.shadows).toBe(false); expect(result.low.ao).toBe(false);
});

test('CS live pixel budget composes with quality and keeps every drawing resource synchronized', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL renderer acceptance.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__cs_live_budget', route => route.fulfill({ contentType: 'text/html', body: '<style>canvas{width:1920px;height:1080px}</style><canvas></canvas>' }));
  await page.goto('/__cs_live_budget');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const canvas = document.querySelector('canvas')!;
    const r = new GameRenderer(canvas);
    const feed = (fps: number, seconds: number, active = true, view = 0) => {
      let changes = 0;
      for (let i = 0; i < fps * seconds; i++) if (r.observeFrame(1 / fps, active, view)) changes++;
      return changes;
    };
    const read = () => ({ width: canvas.width, height: canvas.height, scale: r.renderScale,
      target: [r.composer.readBuffer.width, r.composer.readBuffer.height],
      ao: [r.occlusion.normalRenderTarget.width, r.occlusion.normalRenderTarget.height],
      fxaa: r.antialias.uniforms.resolution.value.toArray(),
      fxHeight: r.effects?.dust.points.material.uniforms.viewportHeight.value,
      shadows: r.renderer.shadowMap.enabled, aoEnabled: r.occlusion.enabled });
    const storage = JSON.stringify(localStorage);
    try {
      const loadingChanges = feed(30, 10);
      await r.load();
      const initial = read();
      const allocations = { canvas: 0, composer: 0, ao: 0 };
      for (const [owner, method, key] of [[r.renderer, 'setDrawingBufferSize', 'canvas'], [r.composer, 'setSize', 'composer'], [r.occlusion, 'setSize', 'ao']]) {
        const original = owner[method].bind(owner);
        owner[method] = (...args) => { allocations[key]++; return original(...args); };
      }
      const trialChanges = feed(30, 6), trial = read();
      const trialAllocations = { ...allocations };
      // These durations exercise policy, not a real FPS benchmark. Render once
      // after each transition to exercise the actual WebGL targets and passes.
      r.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
      const inactiveChanges = feed(60, 300, false), paused = read();
      const resumedChange = r.observeFrame(1 / 60, true, 0), resumed = read();
      feed(30, 6); feed(60, 6); const proven = read();
      allocations.canvas = allocations.composer = allocations.ao = 0;
      r.resize(); const repeatResize = read();
      const repeatedAllocations = { ...allocations };
      const viewChanged = r.observeFrame(1 / 60, true, 1), newView = read();
      r.quality(false); const low = read();
      allocations.canvas = allocations.composer = allocations.ao = 0;
      feed(30, 6, true, 1); const lowTrial = read();
      const lowAllocations = { ...allocations };
      r.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
      feed(30, 5, true, 1); const ineffective = read();
      const suppressed = feed(30, 30, true, 1);
      canvas.style.width = '800px'; canvas.style.height = '600px'; r.resize();
      feed(30, 6, true, 1); const floor = read();
      r.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
      r.quality(true); const manual = read();
      const storageUnchanged = storage === JSON.stringify(localStorage);
      r.dispose(); const disposedChange = r.observeFrame(1 / 30, true, 1);
      return { loadingChanges, initial, trialChanges, trial, inactiveChanges, paused, resumedChange, resumed,
        proven, repeatResize, viewChanged, newView, low, lowTrial, ineffective, suppressed, floor, manual, storageUnchanged, disposedChange,
        trialAllocations, repeatedAllocations, lowAllocations };
    } finally { r.dispose(); }
  });
  expect(result.loadingChanges).toBe(0);
  expect(result.initial).toMatchObject({ width: 1600, height: 900, scale: 1 });
  expect(result.trialChanges).toBe(1);
  expect(result.trialAllocations).toEqual({ canvas: 1, composer: 1, ao: 1 });
  expect(result.repeatedAllocations).toEqual({ canvas: 0, composer: 0, ao: 0 });
  expect(result.lowAllocations).toEqual({ canvas: 1, composer: 0, ao: 0 });
  expect(result.trial).toMatchObject({ width: 1280, height: 720, scale: .8, ao: [640, 360], fxHeight: 720, shadows: true, aoEnabled: true });
  expect(result.trial.target[0]).toBeCloseTo(1280); expect(result.trial.target[1]).toBeCloseTo(720);
  expect(result.trial.fxaa[0]).toBeCloseTo(1 / 1280); expect(result.trial.fxaa[1]).toBeCloseTo(1 / 720);
  expect(result.inactiveChanges).toBe(0); expect(result.paused).toEqual(result.trial);
  expect(result.resumedChange).toBe(true); expect(result.resumed).toEqual(result.initial);
  expect(result.proven).toEqual(result.trial); expect(result.repeatResize).toEqual(result.trial);
  expect(result.viewChanged).toBe(true); expect(result.newView).toEqual(result.initial);
  expect(result.low).toMatchObject({ width: 1280, height: 720, scale: 1, shadows: false, aoEnabled: false });
  expect(result.lowTrial).toMatchObject({ width: 1024, height: 576, scale: .8, ao: [1, 1], fxHeight: 576, shadows: false, aoEnabled: false });
  expect(result.ineffective).toEqual(result.low); expect(result.suppressed).toBe(0);
  expect(result.floor).toMatchObject({ width: 720, height: 540, scale: .9, fxHeight: 540 });
  expect(result.manual).toMatchObject({ width: 800, height: 600, scale: 1, shadows: true, aoEnabled: true });
  expect(result.storageUnchanged).toBe(true); expect(result.disposedChange).toBe(false);
  expect(errors).toEqual([]);
});

test('CS low quality avoids offscreen postprocessing and restores high quality after resize', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL renderer acceptance.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__cs_renderer_test', route => route.fulfill({
    contentType: 'text/html', body: '<style>canvas{width:800px;height:450px}</style><canvas></canvas>',
  }));
  await page.goto('/__cs_renderer_test');
  const result = await page.evaluate(async () => {
    // Exercise the actual renderer and GLB loader with no gameplay timing dependency.
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const renderer = new GameRenderer(document.querySelector('canvas')!);
    await renderer.load();
    const passes = () => {
      const before = renderer.renderer.info.render.frame;
      renderer.render(null, 1 / 60, { yaw: 0, pitch: 0 }, false);
      return renderer.renderer.info.render.frame - before;
    };
    renderer.quality(false);
    // Skeletal pass preparation has already converted the sky during loading.
    // Even the first live low-quality frame now needs only the scene pass.
    const initialLow = passes();
    const initialTextures = renderer.renderer.info.memory.textures;
    const lowFrames = Array.from({ length: 30 }, () => passes());
    const steadyTextures = renderer.renderer.info.memory.textures;
    document.querySelector('canvas')!.style.width = '640px'; renderer.resize(); const lowResized = passes();
    renderer.quality(true); const high = passes();
    renderer.quality(false); const lowAgain = passes();
    renderer.dispose();
    return { initialLow, initialTextures, lowFrames, steadyTextures, lowResized, high, lowAgain };
  });
  expect(result.initialLow).toBe(1);
  expect(result.lowFrames).toEqual(Array(30).fill(1));
  expect(result.steadyTextures).toBe(result.initialTextures);
  expect(result.lowResized).toBe(1);
  expect(result.high).toBeGreaterThan(1);
  expect(result.lowAgain).toBe(1);
  expect(errors).toEqual([]);
});

test('CS combat FX align with real weapon anchors, remain bounded and clear without replay', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL combat acceptance.');
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.route('**/__cs_fx_test', route => route.fulfill({ contentType:'text/html',body:'<style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas>' }));
  await page.goto('/__cs_fx_test');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, stepMatch } = await import('/src/scripts/games/cs/engine.ts');
    const { projectViewMuzzle } = await import('/src/scripts/games/cs/combat-effects.ts');
    const r = new GameRenderer(document.querySelector('canvas')!); await r.load();
    const m = createMatch('attack'); m.phase = 'live'; m.actors.forEach((p,i)=>{p.x=20;p.z=18+i;}); Object.assign(m.actors[0],{x:0,z:8});
    const pixels = [], anchorNames = [];
    for(const aspect of [16/9,32/9]) for(const weapon of ['pistol','smg','rifle','sniper']) for(const aiming of [false,true]) {
      m.actors[0].weapon=weapon; r.camera.aspect=r.viewCamera.aspect=aspect; r.viewCamera.updateProjectionMatrix();
      r.render(m,.5,{yaw:0,pitch:0},aiming); r.camera.updateMatrixWorld();r.viewCamera.updateMatrixWorld();r.gun.updateWorldMatrix(true,true);
      const anchor=r.gun.getObjectByName('muzzle'), eject=r.gun.getObjectByName('ejection_port'); anchorNames.push(!!anchor&&!!eject);
      const p=r.camera.position.clone(); anchor.getWorldPosition(p); const expected=p.clone().project(r.viewCamera);
      const actual=projectViewMuzzle(p,r.viewCamera,r.camera,p.clone()).project(r.camera);
      pixels.push(Math.hypot((actual.x-expected.x)*960,(actual.y-expected.y)*540));
    }
    m.actors[0].weapon='rifle';r.resize();r.render(m,.5,{yaw:0,pitch:0},false);
    stepMatch(m,{0:{fire:true}},1/60);r.render(m,1/60,{yaw:0,pitch:0},false);
    const initial=r.effects.stats(), geometry=r.effects.tracerLine.geometry;
    const before={...r.renderer.info.memory};const shot={...m.shots[0]};
    for(let id=2;id<=180;id++){m.serial=id;m.shots=[{...shot,id,at:m.time}];r.render(m,1/60,{yaw:0,pitch:0},false);}
    const saturated=r.effects.stats(), after={...r.renderer.info.memory}, reused=geometry===r.effects.tracerLine.geometry;
    r.clearTransient(m);r.render(m,0,{yaw:0,pitch:0},false);const paused=r.effects.stats();
    m.serial++;m.shots=[{...shot,id:m.serial}];r.render(m,1/60,{yaw:0,pitch:0},false);const resumed=r.effects.stats();
    m.phase='match-over';r.render(m,.25,{yaw:0,pitch:0},false);const over=r.effects.stats();
    const next=createMatch('attack');next.phase='live';next.actors[0].weapon='sniper';next.serial=1;next.shots=[{...shot,id:1,weapon:'sniper'}];
    r.render(next,1/60,{yaw:0,pitch:0},true);const scoped=r.effects.stats();
    r.dispose();return {pixels,anchorNames,initial,saturated,before,after,reused,paused,resumed,over,scoped};
  });
  expect(result.anchorNames.every(Boolean)).toBe(true);expect(Math.max(...result.pixels)).toBeLessThan(2);
  expect(result.initial).toMatchObject({emitted:1,traces:1,decals:1,casings:1,flashes:1,sparks:3});
  expect(result.saturated).toMatchObject({emitted:180,traces:64,decals:48,casings:24,dust:32,sparks:48});
  expect(result.after).toEqual(result.before);expect(result.reused).toBe(true);
  expect(result.paused).toMatchObject({traces:0,decals:0,casings:0,flashes:0,dust:0,sparks:0});
  expect(result.resumed.traces).toBe(1);expect(result.over.traces).toBe(0);
  expect(result.scoped).toMatchObject({flashes:0,casings:0});expect(errors).toEqual([]);
});

test('stationary impact decals keep their GPU buffer until an impact is added or expires', async ({page,browserName,isMobile},testInfo)=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium WebGL upload acceptance.');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__cs_decal_upload',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:800px;height:450px"></canvas>'}));
  await page.goto('/__cs_decal_upload');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts'),{createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const m=createMatch('attack');m.phase='live';Object.assign(m.actors[0],{x:0,z:8});
    const shot={id:1,round:1,actor:0,weapon:'rifle',at:0,x:0,y:1.58,z:8,tx:0,ty:1.58,tz:4,nx:0,ny:0,nz:1,surface:'stone',target:null,damage:0,armorDamage:0,killed:false,hit:false,head:false};
    m.shots=[shot];m.serial=1;const render=()=>r.render(m,1/60,{yaw:0,pitch:0},false);render();
    const attribute=r.effects.decals.instanceMatrix,gl=r.renderer.getContext(),original=gl.bufferSubData;
    let uploads=0;gl.bufferSubData=function(...args){if(args[2]===attribute.array)uploads++;return original.apply(this,args);};
    try {
      const initial=Array.from(attribute.array),memory={...r.renderer.info.memory};
      for(let i=1;i<=120;i++){m.time=i/60;render();}
      const steady={uploads,unchanged:initial.every((v,i)=>v===attribute.array[i]),count:r.effects.stats().decals};
      m.serial=2;m.shots=[{...shot,id:2,at:m.time,tx:.3}];render();const added={uploads,count:r.effects.stats().decals};
      m.time=12.1;render();const expired={uploads,count:r.effects.stats().decals};render();const repeated=uploads;
      r.clearTransient(m);render();const cleared=r.effects.stats().decals;
      m.serial=3;m.shots=[{...shot,id:3,at:m.time,tx:-.3}];render();const resumed={uploads,count:r.effects.stats().decals};
      return {steady,added,expired,repeated,cleared,resumed,memoryStable:JSON.stringify(memory)===JSON.stringify(r.renderer.info.memory)};
    }finally{gl.bufferSubData=original;r.dispose();}
  });
  await testInfo.attach('decal-gpu-uploads',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.steady).toEqual({uploads:0,unchanged:true,count:1});expect(result.added).toEqual({uploads:1,count:2});
  expect(result.expired).toEqual({uploads:2,count:1});expect(result.repeated).toBe(2);expect(result.cleared).toBe(0);
  expect(result.resumed).toEqual({uploads:3,count:1});expect(result.memoryStable).toBe(true);expect(errors).toEqual([]);
});

test('transparent combat decals never write the SSAO normal/depth pass', async ({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop Chromium WebGL acceptance.');
  await page.route('**/__cs_ao_test',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:800px;height:450px"></canvas>'}));await page.goto('/__cs_ao_test');
  const result=await page.evaluate(async()=>{
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');const {createMatch}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas'));await r.load();const m=createMatch('attack');m.phase='live';Object.assign(m.actors[0],{x:0,z:8});
    r.render(m,1/60,{yaw:0,pitch:0},false);
    const target=r.occlusion.ssaoRenderTarget;
    const read=()=>{const a=new Uint16Array(target.width*target.height*4);r.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,a);return a;};
    const before=read();let normalDraws=0,beautyDraws=0;
    r.effects.decals.onBeforeRender=(_,scene)=>{if(scene.overrideMaterial)normalDraws++;else beautyDraws++;};
    m.serial=1;m.shots=[{id:1,round:1,actor:0,weapon:'rifle',at:0,x:0,y:1.58,z:8,tx:0,ty:1.58,tz:4,nx:0,ny:0,nz:1,surface:'stone',target:null,damage:0,armorDamage:0,killed:false,hit:false,head:false}];
    r.render(m,1/60,{yaw:0,pitch:0},false);const after=read();let changed=0;for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed++;
    const visible=r.effects.decals.visible;r.dispose();return{normalDraws,beautyDraws,changed,visible};
  });
  expect(result.beautyDraws).toBeGreaterThan(0);expect(result.visible).toBe(true);expect(result.normalDraws).toBe(0);expect(result.changed).toBe(0);
});
