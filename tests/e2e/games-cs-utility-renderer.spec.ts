import { test, expect } from '@playwright/test';

test('scorch shader keeps a stair mark on its supporting tread and preserves flat ground', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop WebGL regression');
  await page.route('**/__cs_scorch_surface', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/__cs_scorch_surface');
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { UtilityEffects } = await import('/src/scripts/games/cs/utility-effects.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const { groundHeight } = await import('/src/scripts/games/cs/elevation.ts');
    const source = new T.Group();
    for (const name of ['he_grenade', 'flashbang', 'smoke_grenade']) { const node = new T.Group(); node.name = name; source.add(node); }
    // Uniform mask isolates terrain clipping from the approved atlas artwork.
    const texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    const fx = new UtilityEffects(source, { dust: texture, flash: texture, masks: texture });
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas')! }); renderer.setSize(128, 128);
    const camera = new T.OrthographicCamera(-2, 2, 2, -2, .1, 20);
    camera.up.set(0, 0, -1);
    const output = new T.WebGLRenderTarget(128, 128), scene = new T.Scene(); scene.add(fx.scorches);
    const samples: { place: string; center: number; upper: number; lower: number; calls: number }[] = [];
    try {
      for (const [place, x, z] of [['stairs', 20, 16.75], ['flat', 0, 10]] as const) {
        const floor = groundHeight(x, z), match = createMatch('attack'); match.phase = 'live';
        camera.position.set(x, floor + 10, z); camera.lookAt(x, floor, z); camera.updateMatrixWorld();
        const ctx = { camera, units: new Map(), viewId: 0 };
        fx.update(match, ctx, 0);
        match.blasts.push({ id: 1, actor: 0, kind: 'he', x, y: floor + .06, z, at: 0 });
        fx.update(match, ctx, 0); match.time = 2.7; fx.update(match, ctx, 0);
        renderer.setRenderTarget(output); renderer.setClearColor(0xffffff); renderer.clear(); renderer.render(scene, camera);
        const at = (offset: number) => {
          const p = new T.Vector3(x, floor + .012, z + offset).project(camera), pixel = new Uint8Array(4);
          renderer.readRenderTargetPixels(output, Math.floor((p.x + 1) * 64), Math.floor((p.y + 1) * 64), 1, 1, pixel);
          return Math.min(pixel[0], pixel[1], pixel[2]);
        };
        samples.push({ place, center: at(0), upper: at(-.5), lower: at(.5), calls: renderer.info.render.calls });
      }
      return { samples, glError: renderer.getContext().getError() };
    } finally { fx.dispose(); texture.dispose(); output.dispose(); renderer.dispose(); }
  });
  expect(result.glError).toBe(0);
  const [stairs, flat] = result.samples;
  expect(stairs.center).toBeLessThan(200);
  expect(stairs.upper).toBe(255); expect(stairs.lower).toBe(255);
  expect(flat.center).toBeLessThan(200); expect(flat.upper).toBeLessThan(200); expect(flat.lower).toBeLessThan(200);
  expect(result.samples.map(s => s.calls)).toEqual([1, 1]);
});

test('AO retains opaque grenade models and the blast light while excluding transparent scorches', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop WebGL regression');
  await page.route('**/__cs_utility_ao', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="640" height="360"></canvas>' }));
  await page.goto('/__cs_utility_ao');
  const result = await page.evaluate(async () => {
    const { GameRenderer } = await import('/src/scripts/games/cs/renderer.ts');
    const { createMatch, spawnGrenade } = await import('/src/scripts/games/cs/engine.ts');
    const r = new GameRenderer(document.querySelector('canvas')!); await r.load();
    const m = createMatch('attack'); m.phase = 'live';
    const p = m.actors[0];
    spawnGrenade(m, p, 'he', [p.x, 1, p.z - 2], [0, 0, 0]);
    const snapshots = [];
    const fx = r.utility!;
    const original = r.occlusion._renderOverride.bind(r.occlusion);
    r.occlusion._renderOverride = (...args) => {
      const visible = new Set(); r.scene.traverseVisible(object => visible.add(object));
      let grenades = 0;
      fx.props.traverse(object => { if (object.isMesh && visible.has(object)) grenades++; });
      snapshots.push({ grenades, scorch: visible.has(fx.scorches), light: visible.has(fx.light) });
      return original(...args);
    };
    try {
      // Both absent and active decals must restore their own visibility, while
      // the actual normal/depth pass continues to include opaque grenade meshes.
      r.render(m, 0, { yaw: 0, pitch: -.12 }, false);
      const absent = fx.scorches.visible;
      m.blasts.push({ id: ++m.serial, actor: 0, kind: 'he', x: 0, y: .06, z: 10, at: 0 }); m.time = .1;
      r.render(m, .1, { yaw: 0, pitch: -.12 }, false);
      return { snapshots, absent, restored: fx.scorches.visible, glError: r.renderer.getContext().getError() };
    } finally { r.dispose(); }
  });
  expect(result.glError).toBe(0);
  expect(result.snapshots).toHaveLength(2);
  for (const pass of result.snapshots) {
    expect(pass.grenades).toBeGreaterThan(0);
    expect(pass.scorch).toBe(false);
    expect(pass.light).toBe(true);
  }
  expect(result.absent).toBe(false);
  expect(result.restored).toBe(true);
});

test('ground blast ring faces the camera above the floor and survives soft-depth mode', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop WebGL regression');
  await page.route('**/__cs_ring_test', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/__cs_ring_test');
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { UtilityEffects } = await import('/src/scripts/games/cs/utility-effects.ts');
    const { createMatch } = await import('/src/scripts/games/cs/engine.ts');
    const source = new T.Group();
    for (const name of ['he_grenade', 'flashbang', 'smoke_grenade']) { const node = new T.Group(); node.name = name; source.add(node); }
    // An all-white data texture isolates visibility/orientation from mask art.
    const texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    const fx = new UtilityEffects(source, { dust: texture, flash: texture, masks: texture });
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas')! }); renderer.setSize(64, 64);
    const camera = new T.PerspectiveCamera(50, 1, .1, 50); camera.position.set(0, 5, 6); camera.lookAt(0, 0, 0);
    const output = new T.WebGLRenderTarget(64, 64);
    const depth = new T.WebGLRenderTarget(64, 64, { depthTexture: new T.DepthTexture(64, 64) });
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshBasicMaterial()); floor.rotation.x = -Math.PI / 2;
    const ground = new T.Scene(); ground.add(floor);
    const scene = new T.Scene(); scene.add(fx.volumes);
    const match = createMatch('attack'); match.phase = 'live';
    const ctx = { camera, units: new Map(), viewId: 0 };
    fx.update(match, ctx, 0);
    match.blasts.push({ id: 1, actor: 0, kind: 'he', x: 0, y: .06, z: 0, at: 0 }); match.time = .1;
    fx.update(match, ctx, .1);
    // Draw only the real ring instance with its real material/shader.
    const attributes = fx.fireballs.geometry.attributes;
    const ring = Array.from({ length: fx.fireballs.count }, (_, i) => i).find(i => attributes.motion.getW(i) === 2)!;
    for (const key of ['burst', 'look', 'motion', 'tint']) {
      const a = attributes[key];
      for (let j = 0; j < a.itemSize; j++) a.array[j] = a.array[ring * a.itemSize + j];
      a.needsUpdate = true;
    }
    fx.fireballs.count = 1; fx.puffs.visible = false; fx.overlay.visible = false;
    const counts = [], centers = [];
    try {
      renderer.setRenderTarget(depth); renderer.render(ground, camera);
      for (const useDepth of [false, true]) {
        fx.setSceneDepth(useDepth ? depth.depthTexture : null, 64, 64);
        renderer.setRenderTarget(output); renderer.setClearColor(0); renderer.clear(); renderer.render(scene, camera);
        const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(output, 0, 0, 64, 64, pixels);
        let count = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 8) count++;
        counts.push(count);
        // An expanding dust ring must leave its centre transparent, including
        // without soft depth. Read the real GPU result, independent of mask art.
        const center = [];
        for (let y = 31; y <= 33; y++) for (let x = 31; x <= 33; x++) {
          const i = (y * 64 + x) * 4; center.push(...pixels.slice(i, i + 3));
        }
        centers.push(Math.max(...center));
      }
      return { counts, centers, glError: renderer.getContext().getError() };
    } finally {
      fx.dispose(); texture.dispose(); output.dispose(); depth.dispose(); floor.geometry.dispose(); floor.material.dispose(); renderer.dispose();
    }
  });
  expect(result.glError).toBe(0);
  expect(result.counts[0]).toBeGreaterThan(40);
  expect(result.counts[1]).toBeGreaterThan(result.counts[0] * .8);
  expect(result.centers).toEqual([0, 0]);
});
