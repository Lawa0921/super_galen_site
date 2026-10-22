import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { HalfResolutionSSAOPass } from './half-resolution-ssao';
import { warmScissorSize } from './warm-scissor';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { type Actor, type Match, type WeaponId } from './engine';
import { shotEnvelope } from './shot-presentation';
import { groundHeight } from './elevation';
import { equipActorModel, syncTeamColor, cloneActorModel, animateActorLegs, animateActorAim, isScopeActive } from './presentation';
import { CombatEffects } from './combat-effects';
import { WeaponMotion, WeaponRig } from './weapon-motion';
import { MAP } from './map';
import { ViewLighting, WORLD_SUN } from './view-lighting';
import { cloneModel, disposeModelInstance, disposeModelResources } from './model-resources';
import { selectViewActor } from './spectator';
import { createAssetLoadWatchdog, loadOwnedResources } from './asset-loading';
import { fetchAssetBytes, parseSkyTexture } from './asset-download';
import { FrameBudget } from './frame-budget';
import { createTacticalActor } from './tactical-actor';
import { shareModelTextures } from './shared-model-textures';
import { applyFabricDetail } from './fabric-detail';
import { applyPlasterDetail } from './plaster-detail';
import { createWorldWeapon } from './world-weapon';
import { UtilityEffects } from './utility-effects';
import { GrenadeViewmodel } from './grenade-viewmodel';
import { holdsGrenade } from './engine';
import { eyeHeight } from './movement';

const assets = '/assets/games/cs/';
export interface SkinCandidateSource {
  source: THREE.Group;
  resources: THREE.Group[];
  create(): THREE.Group;
  updatePose?(model: THREE.Group, actor: Actor, match: Match, flinch: number): void;
  updateLod?(model: THREE.Group, camera: THREE.PerspectiveCamera): boolean;
  /** Release candidate-owned resources after a cancelled load. Borrowed weapon
   * geometry/maps may already have been released by the renderer. */
  dispose(): void;
}
// Measured bright-sun centroid of the registered CC0 Kloofendal 38d HDR.
// The sky is a backdrop; retain the reviewed procedural PMREM for readable fill.
const skySun = [.6387103393762216, .6149873433266817, .4624280159353472] as const;
// Per-asset poses follow the exported grip origin and sight height, in metres.
const weaponView: Record<WeaponId, { scale: number; hip: [number, number, number]; ads: [number, number, number] }> = {
  pistol: { scale: 1, hip: [.18, -.20, -.39], ads: [0, -.106, -.33] },
  smg: { scale: .8, hip: [.22, -.21, -.56], ads: [0, -.086, -.43] },
  rifle: { scale: .62, hip: [.16, -.17, -.45], ads: [0, -.108, -.42] },
  sniper: { scale: .65, hip: [.23, -.23, -.67], ads: [0, -.07, -.56] },
};
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, .06, 250);
  private readonly viewScene = new THREE.Scene();
  /** Smoke/blast volumes, composited after SSAO and before tone mapping. */
  private readonly volumeScene = new THREE.Scene();
  private readonly viewCamera = new THREE.PerspectiveCamera(58, 1, .01, 10);
  private readonly sun = new THREE.DirectionalLight(0xffe6c9, 3);
  private readonly viewSun = new THREE.DirectionalLight(0xffe3c0, 2.2);
  private readonly viewFill = new THREE.HemisphereLight(0xd7e8f4, 0x514334, .95);
  private readonly viewLighting = new ViewLighting(MAP.obstacles);
  private readonly inverseView = new THREE.Quaternion();
  private readonly units = new Map<number, THREE.Group>();
  private readonly tacticalUnits = new Map<number, ReturnType<typeof createTacticalActor>>();
  private candidateSource?: SkinCandidateSource;
  private readonly candidateUnits = new Map<number, THREE.Group>();
  private readonly drawnCandidates = new Set<number>();
  readonly candidateDiagnostics = { mode: 'off', resident: 0, visible: 0, drawn: 0 };
  private readonly weapons = new Map<WeaponId, THREE.Group>();
  private readonly worldWeapons = new Map<WeaponId, THREE.Group>();
  private soldier?: THREE.Group;
  private bomb?: THREE.Group;
  private skyBackground?: THREE.Texture;
  private currentWeapon?: WeaponId;
  private gun?: THREE.Group;
  private gunRig?: WeaponRig;
  private readonly weaponMotion = new WeaponMotion();
  private effects?: CombatEffects;
  private utility?: UtilityEffects;
  private grenadeView?: GrenadeViewmodel;
  private get tracers() { return this.effects!.tracers; }
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private recoil = 0;
  private recoilAt = -1;
  private recoilClock = 0;
  private lastShot = 0;
  private lastRound = 0;
  private viewActorId: number | null = null;
  private matchRef: Match | null = null;
  private ready = false;
  private disposed = false;
  private readonly assetController = new AbortController();
  private readonly loadingManager = new THREE.LoadingManager();
  private assetModels: THREE.Group[] = [];
  private assetTextures: THREE.Texture[] = [];
  private menuAngle = 0;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly composer: EffectComposer;
  private readonly occlusion: HalfResolutionSSAOPass;
  private readonly antialias = new ShaderPass(FXAAShader);
  private highQuality = true;
  private readonly frameBudget = new FrameBudget();
  private budgetLayout = '';
  private drawingBufferLayout = '';
  private postprocessLayout = '';
  private budgetFloor = .8;
  private budgetView: number | null | undefined;
  private budgetViewChanged = false;
  get renderScale() { return this.frameBudget.scale; }
  constructor(private canvas: HTMLCanvasElement, private candidateLoader?: (rifle: THREE.Group) => Promise<SkinCandidateSource>) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // RenderPass and SSAO both render the world. Refresh shadows once per frame,
    // after actor poses change, rather than repeating the shadow pass for AO.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .85;
    this.scene.fog = new THREE.Fog(0xb6c6cc, 65, 155);
    const sky = new Sky(); sky.scale.setScalar(200);
    sky.material.uniforms.turbidity.value = 2; sky.material.uniforms.rayleigh.value = 3.5;
    sky.material.uniforms.mieCoefficient.value = .003;
    sky.material.uniforms.sunPosition.value.set(...WORLD_SUN);
    const skyEnvironment = new THREE.Scene(); skyEnvironment.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(skyEnvironment, .04); pmrem.dispose();
    sky.geometry.dispose(); sky.material.dispose();
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .16;
    this.viewScene.environment = this.environment.texture; this.viewScene.environmentIntensity = .3;
    this.scene.add(new THREE.HemisphereLight(0xb6d7ef, 0x655341, .35));
    this.sun.position.set(...WORLD_SUN); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -34, right: 34, top: 38, bottom: -38, near: 1, far: 95 });
    this.sun.shadow.bias = -.0002; this.sun.shadow.normalBias = .055; this.sun.shadow.radius = 1.5; this.scene.add(this.sun);
    this.viewScene.add(this.viewFill, this.viewSun);
    // Multisampled HDR buffers were the largest measured GPU cost on integrated
    // graphics. Keep HDR lighting, then antialias the tone-mapped image with FXAA.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    // All composer dimensions below are integer physical pixels, independent
    // of the renderer's adaptive DPR. Pin this before adding any passes.
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.occlusion = new HalfResolutionSSAOPass(this.scene, this.camera, 1, 1, 16);
    this.occlusion.kernelRadius = .55; this.occlusion.minDistance = .0002; this.occlusion.maxDistance = .025;
    const renderOcclusion = this.occlusion.render.bind(this.occlusion);
    this.occlusion.render = (...args) => {
      // RenderPass already contains transparent FX. The AO pass only needs
      // opaque world geometry; its MeshNormalMaterial ignores decal alpha.
      const group = this.effects?.world, visible = group?.visible;
      // Keep opaque grenade props and the blast light in every world pass.
      // Changing the light count also creates new depth/normal shader variants.
      const scorch = this.utility?.scorches, scorchVisible = scorch?.visible;
      if (group) group.visible = false;
      if (scorch) scorch.visible = false;
      try { renderOcclusion(...args); } finally { if (group) group.visible = visible!; if (scorch) scorch.visible = scorchVisible!; }
    };
    const volumes = new RenderPass(this.volumeScene, this.camera); volumes.clear = false; volumes.clearDepth = false;
    this.composer.addPass(this.occlusion); this.composer.addPass(volumes); this.composer.addPass(new OutputPass()); this.composer.addPass(this.antialias);
    this.camera.rotation.order = 'YXZ'; this.resize();
  }
  async load() {
    const failedImages: string[] = [];
    // GLTFLoader resolves a missing image as a null map instead of rejecting
    // the GLB. Surface this failure before compiling partially textured assets.
    this.loadingManager.onError = url => { failedImages.push(url); };
    const loader = new GLTFLoader(this.loadingManager);
    const names = ['environment', 'soldier', 'bomb', 'pistol', 'smg', 'rifle', 'sniper', 'casing', 'grenades'] as const;
    const textureLoader = new THREE.TextureLoader(this.loadingManager);
    const watchdog = createAssetLoadWatchdog(this.assetController);
    const download = (name: string) => fetchAssetBytes(`${assets}${name}`, this.assetController.signal, bytes => watchdog.progress(name, bytes));
    this.loadingManager.onProgress = watchdog.completed;
    let resources: (GLTF | THREE.Texture)[];
    try {
      resources = await loadOwnedResources<GLTF | THREE.Texture>([
        ...names.map(name => download(`${name}.glb`).then(buffer => loader.parseAsync(buffer, assets))),
        ...['muzzle-flash', 'impact-dust', 'stone-impact'].map(name => textureLoader.loadAsync(`${assets}fx/${name}.webp`)),
        download('sky.hdr').then(parseSkyTexture),
        textureLoader.loadAsync(`${assets}fx/utility-masks.webp`),
      ], resource => resource instanceof THREE.Texture ? resource.dispose() : disposeModelResources([resource.scene]), this.assetController.signal);
    } catch (error) {
      this.loadingManager.abort();
      if (this.disposed) return;
      this.dispose();
      throw error;
    } finally {
      watchdog.stop(); this.loadingManager.onProgress = undefined;
    }
    const models = resources.slice(0, names.length) as GLTF[];
    const textures = resources.slice(names.length) as THREE.Texture[];
    if (this.disposed) {
      disposeModelResources(models.map(model => model.scene), textures);
      return;
    }
    // Register ownership before uploads or scene setup can throw. The effects
    // owner takes its casing and three maps only after construction succeeds.
    this.assetModels = models.map(model => model.scene); this.assetTextures = textures;
    try {
      if (failedImages.length) throw new Error('Required model texture unavailable');
      shareModelTextures(this.assetModels);
      // compile() prepares shaders, but leaves these hidden effects' image data
      // on the CPU. Upload during loading so the first shot does not pay for it.
      for (const texture of textures.slice(0, 3)) {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.renderer.initTexture(texture);
      }
      // Packed masks are linear scalar data; sRGB decoding destroys opacity.
      textures[4].colorSpace = THREE.NoColorSpace; this.renderer.initTexture(textures[4]);
      this.skyBackground = textures[3]; this.skyBackground.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = this.skyBackground;
      this.scene.backgroundRotation.y = Math.atan2(skySun[2], skySun[0]) - Math.atan2(WORLD_SUN[2], WORLD_SUN[0]);
      this.scene.backgroundIntensity = 1.6;
      const modelTextures = new Set<THREE.Texture>();
      models.forEach(model => model.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true; object.receiveShadow = true;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
              value.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
              modelTextures.add(value);
            }
          }
        }
      }));
      // A compiled material does not upload its images. Hidden weapon/bomb
      // models otherwise defer image conversion and mip allocation until buy
      // or their first combat draw. Upload each shared map once, after its
      // sampler settings are final and while the loading screen still owns it.
      for (const texture of modelTextures) this.renderer.initTexture(texture);
      this.scene.add(models[0].scene); this.soldier = models[1].scene;
      this.bomb = models[2].scene; this.scene.add(this.bomb); this.bomb.visible = false;
      // FPS sleeves: tiled cloth detail from the asset's occlusion slot; clones keep the patch.
      for (let i = 3; i < 7; i++) applyFabricDetail(models[i].scene);
      // Plaster walls: stucco grain detail plus world-space grime/variation; same draws.
      applyPlasterDetail(models[0].scene);
      for (let i = 3; i < 7; i++) { models[i].scene.animations = models[i].animations; this.weapons.set(names[i] as WeaponId, models[i].scene); }
      for (const [name, source] of this.weapons) this.worldWeapons.set(name, createWorldWeapon(source));
      this.effects = new CombatEffects({ flash: textures[0], dust: textures[1], decal: textures[2] }, models[7].scene);
      // CC0 grenades (V37): pooled world props/smoke/blasts, and the FPS hold on the pistol arm rig.
      this.utility = new UtilityEffects(models[8].scene, { dust: textures[1], flash: textures[0], masks: textures[4] });
      this.grenadeView = new GrenadeViewmodel(models[3].scene, models[8].scene);
      this.assetModels = [...this.assetModels.slice(0, 7), models[8].scene]; this.assetTextures = textures.slice(3);
      this.scene.add(this.effects.world); this.viewScene.add(this.effects.view); this.effects.resize(this.canvas.height);
      this.scene.add(this.utility.world); this.volumeScene.add(this.utility.volumes); this.viewScene.add(this.grenadeView.root);
      if (this.candidateLoader) {
        const candidate = await this.candidateLoader(this.weapons.get('rifle')!);
        if (this.disposed) { candidate.dispose(); return; }
        this.candidateSource = candidate; this.candidateDiagnostics.mode = candidate.updatePose ? 'cmu-cycle-development' : 'neutral-rifle-render-only';
      }
      this.preparePrograms();
      this.prepareLiveDraws();
      if (this.candidateSource) this.prepareCandidatePasses();
      else if (this.soldier.getObjectByName('pelvis') instanceof THREE.Bone) this.prepareCandidatePasses(this.soldier);
      this.ready = true;
    } catch (error) {
      if (this.disposed) return;
      this.dispose(); throw error;
    }
  }
  private prepareCandidatePasses(source = this.candidateSource!.source) {
    // compile() prepares the surface material, but not the skin variants of
    // shadow depth and SSAO's override normal material. Exercise those passes
    // offscreen before a candidate bot can enter combat.
    const target = this.renderer.getRenderTarget(), shadow = this.renderer.shadowMap.enabled;
    const cast = this.sun.castShadow, override = this.scene.overrideMaterial;
    const warmTarget = new THREE.WebGLRenderTarget(32, 32);
    const warmCamera = new THREE.PerspectiveCamera(60, 1, .06, 250);
    warmCamera.position.set(0, 1.2, 4); warmCamera.lookAt(0, .9, 0);
    const culling = new Map<THREE.Object3D, boolean>();
    source.traverse(node => { if (node instanceof THREE.Mesh) { culling.set(node, node.frustumCulled); node.frustumCulled = false; } });
    this.scene.add(source);
    try {
      this.renderer.setRenderTarget(warmTarget);
      this.renderer.shadowMap.enabled = true; this.sun.castShadow = true; this.renderer.shadowMap.needsUpdate = true;
      // Three renders shadows before refreshing its light-state arrays. The
      // regular compile loop ends in low quality. Rebuild the high-quality
      // light state before shadow materials are first created, including cached
      // alpha-tested depth materials which do not themselves use light uniforms.
      this.renderer.compile(this.scene, warmCamera);
      this.renderer.render(this.scene, warmCamera);
      this.scene.overrideMaterial = this.occlusion.normalMaterial;
      this.renderer.render(this.scene, warmCamera);
    } finally {
      this.scene.remove(source); culling.forEach((value, node) => { node.frustumCulled = value; });
      this.scene.overrideMaterial = override; this.renderer.setRenderTarget(target);
      this.renderer.shadowMap.enabled = shadow; this.sun.castShadow = cast; warmTarget.dispose();
      if (!shadow) { this.sun.shadow.dispose(); this.sun.shadow.map = null; this.sun.shadow.mapPass = null; }
    }
  }
  private prepareLiveDraws() {
    // compile() links each program for a generic float vertex layout. ANGLE's
    // D3D11 backend compiles the real vertex executable on the first draw with
    // each concrete attribute format (skinned hands' byte skinIndex, instanced
    // matrices, point sprites), stalling the GPU process for ~50 ms per shader
    // after deploy. Draw every viewmodel and effect primitive into one pixel of
    // its live target now. Each quality uses its own target-dependent programs.
    const renderer = this.renderer, target = renderer.getRenderTarget(), autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.enabled, castShadow = this.sun.castShadow;
    const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
    const hdr = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const guns = [...this.weapons.values()].map(source => {
      const gun = cloneModel(source); gun.traverse(node => { node.frustumCulled = false; });
      this.viewScene.add(gun); return gun;
    });
    // Actor sources share geometry with every match clone; draw them without
    // shadows too, so low quality does not first meet them in the buy phase.
    const actors = [this.soldier!, ...this.worldWeapons.values(), ...(this.candidateSource ? [this.candidateSource.source] : [])];
    const culling = new Map<THREE.Object3D, boolean>();
    for (const actor of actors) { actor.traverse(node => { culling.set(node, node.frustumCulled); node.frustumCulled = false; }); this.scene.add(actor); }
    this.effects!.primeDraws();
    this.utility!.primeDraws(); this.grenadeView!.prime();
    try {
      renderer.autoClear = false;
      const size = warmScissorSize(renderer.getPixelRatio()); renderer.setScissor(0, 0, size, size); renderer.setScissorTest(true);
      for (const high of [true, false]) {
        // Live high quality refreshes the shadow map before sampling it; an
        // unrendered map would leave a non-depth texture on the shadow sampler.
        // Three renders shadows before refreshing light state, so rebuild that
        // state first or the cached depth materials keep a stale program.
        renderer.shadowMap.enabled = high; this.sun.castShadow = high; renderer.shadowMap.needsUpdate = high;
        renderer.setRenderTarget(high ? hdr : null);
        if (high) renderer.compile(this.scene, this.camera);
        renderer.render(this.scene, this.camera);
        renderer.render(this.volumeScene, this.camera);
      }
      renderer.setRenderTarget(null); renderer.render(this.viewScene, this.viewCamera);
    } finally {
      this.effects!.clear(null);
      this.utility!.clear(); this.grenadeView!.root.visible = false;
      for (const actor of actors) this.scene.remove(actor);
      culling.forEach((value, node) => { node.frustumCulled = value; });
      for (const gun of guns) { this.viewScene.remove(gun); disposeModelInstance(gun); }
      renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.autoClear = autoClear;
      renderer.setRenderTarget(target); renderer.shadowMap.enabled = shadows; this.sun.castShadow = castShadow;
      if (!shadows) { this.sun.shadow.dispose(); this.sun.shadow.map = null; this.sun.shadow.mapPass = null; }
      hdr.dispose();
    }
  }
  private preparePrograms() {
    const target = this.renderer.getRenderTarget(), shadows = this.renderer.shadowMap.enabled, castShadow = this.sun.castShadow;
    try {
      // Actors and weapons are cloned only when a match starts. Prepare their
      // source materials now so turning toward a new opponent does not compile
      // a shader in the middle of combat. HDR and direct output need different
      // program variants, as do the first-person scene's lights and environment.
      for (const high of [true, false]) {
        this.renderer.shadowMap.enabled = high; this.sun.castShadow = high;
        this.renderer.setRenderTarget(high ? this.composer.readBuffer : null);
        this.renderer.compile(this.scene, this.camera);
        this.renderer.compile(this.soldier!, this.camera, this.scene);
        if (this.candidateSource) this.renderer.compile(this.candidateSource.source, this.camera, this.scene);
        for (const weapon of this.worldWeapons.values()) this.renderer.compile(weapon, this.camera, this.scene);
      }
      this.renderer.shadowMap.enabled = shadows; this.sun.castShadow = castShadow;
      this.renderer.setRenderTarget(null);
      this.renderer.compile(this.viewScene, this.viewCamera);
      for (const weapon of this.weapons.values()) this.renderer.compile(weapon, this.viewCamera, this.viewScene);
      // Three r182 defers diagnostics and uniform/attribute reflection until
      // first use, even for compiled programs. Finish that synchronous work
      // during loading; keep shader error checking enabled.
      for (const program of this.renderer.info.programs ?? []) program.getUniforms();
    } finally {
      this.renderer.setRenderTarget(target); this.renderer.shadowMap.enabled = shadows; this.sun.castShadow = castShadow;
    }
  }
  quality(high: boolean) {
    this.highQuality = high;
    this.budgetLayout = '';
    this.occlusion.enabled = high; this.renderer.shadowMap.enabled = high; this.sun.castShadow = high;
    if (!high) { this.sun.shadow.dispose(); this.sun.shadow.map = null; this.sun.shadow.mapPass = null; }
    this.resize();
  }
  /** Feed actual client RAF elapsed time, never the clamped simulation dt or
   * synthetic render/authoring calls. Inactive trials restart on a live frame. */
  observeFrame(seconds: number, active: boolean, viewId: number | null) {
    if (!this.ready || this.disposed) return false;
    if (this.budgetView !== undefined && this.budgetView !== viewId) this.budgetViewChanged = true;
    this.budgetView = viewId;
    let changed = false;
    if (this.budgetViewChanged && active && Number.isFinite(seconds) && seconds > 0 && seconds <= .25) {
      changed = this.frameBudget.scale !== 1;
      this.frameBudget.reset(this.budgetFloor); this.budgetViewChanged = false;
    }
    changed = this.frameBudget.frame(seconds, active) || changed;
    if (changed) this.resize();
    return changed;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    // Bound 3D pixel work on integrated GPUs. 1080p showed sustained graphics
    // pressure and intermittent RAF stalls in five-bot play; 900p retains the
    // material/shadow/AO path while leaving headroom for presentation.
    const pixels = this.highQuality ? 1600 * 900 : 1280 * 720;
    const baseRatio = Math.min(devicePixelRatio, this.highQuality ? 1.5 : 1, Math.sqrt(pixels / (width * height)));
    const layout = `${width}:${height}:${devicePixelRatio}:${this.highQuality}`;
    if (layout !== this.budgetLayout) {
      this.budgetLayout = layout;
      // Preserve at least 540 pixels on the shorter axis where the base size
      // allows it. Always compose from the unscaled quality/DPR budget.
      this.budgetFloor = Math.min(1, Math.max(.8, 540 / (Math.min(width, height) * baseRatio)));
      this.frameBudget.reset(this.budgetFloor); this.budgetViewChanged = false;
    }
    const ratio = baseRatio * this.frameBudget.scale;
    const drawingBufferLayout = `${width}:${height}:${ratio}`;
    if (drawingBufferLayout !== this.drawingBufferLayout) {
      // setPixelRatio already calls setSize internally. Use one atomic update
      // and preserve the current canvas for redundant resize notifications.
      this.renderer.setDrawingBufferSize(width, height, ratio);
      this.drawingBufferLayout = drawingBufferLayout;
    }
    this.camera.aspect = width / Math.max(1, height);
    this.viewCamera.aspect = this.camera.aspect;
    this.camera.updateProjectionMatrix(); this.viewCamera.updateProjectionMatrix();
    const bufferWidth = this.canvas.width, bufferHeight = this.canvas.height;
    const postWidth = this.highQuality ? bufferWidth : 1, postHeight = this.highQuality ? bufferHeight : 1;
    const postprocessLayout = `${postWidth}:${postHeight}`;
    if (postprocessLayout !== this.postprocessLayout) {
      this.composer.setSize(postWidth, postHeight);
      this.postprocessLayout = postprocessLayout;
    }
    this.antialias.uniforms.resolution.value.set(1 / bufferWidth, 1 / bufferHeight);
    this.effects?.resize(bufferHeight);
  }
  clearTransient(m: Match | null) {
    this.recoil = 0; this.recoilAt = -1; this.effects?.clear(m); this.utility?.clear();
  }
  private unit(p: Actor) {
    const candidate = !!this.candidateSource && p.bot && p.weapon === 'rifle';
    if (this.units.has(p.id) && candidate !== this.candidateUnits.has(p.id)) {
      const old = this.units.get(p.id)!; this.scene.remove(old); disposeModelInstance(old);
      this.units.delete(p.id); this.candidateUnits.delete(p.id);
      this.tacticalUnits.delete(p.id);
    }
    if (candidate) {
      if (!this.candidateUnits.has(p.id)) {
        const model = this.candidateSource!.create();
        model.traverse(node => { if (node instanceof THREE.Mesh) node.onBeforeRender = () => { this.drawnCandidates.add(p.id); }; });
        this.candidateUnits.set(p.id, model); this.units.set(p.id, model); this.scene.add(model);
      }
      return this.candidateUnits.get(p.id)!;
    }
    if (this.soldier?.getObjectByName('pelvis') instanceof THREE.Bone) {
      if (!this.tacticalUnits.has(p.id)) {
        const actor = createTacticalActor(this.soldier, this.worldWeapons);
        this.tacticalUnits.set(p.id, actor); this.units.set(p.id, actor.model); this.scene.add(actor.model);
      }
      return this.tacticalUnits.get(p.id)!.model;
    }
    if (this.units.has(p.id)) { const model = this.units.get(p.id)!; syncTeamColor(model, p.team); equipActorModel(model, this.worldWeapons.get(p.weapon)!, p.weapon); return model; }
    const model = cloneActorModel(this.soldier!);
    syncTeamColor(model, p.team); equipActorModel(model, this.worldWeapons.get(p.weapon)!, p.weapon); this.units.set(p.id, model); this.scene.add(model); return model;
  }
  render(m: Match | null, dt: number, look: { yaw: number; pitch: number }, aiming: boolean, viewId?: number | null) {
    if (!this.ready) return;
    this.drawnCandidates.clear();
    if (m !== this.matchRef) { this.matchRef = m; this.viewActorId = null; this.recoil = 0; this.recoilAt = -1; this.weaponMotion.reset(); this.viewLighting.reset(); this.gunRig?.reset(); this.lastRound = m?.round ?? 0; this.lastShot = m?.actors[0].shot ?? 0; }
    const viewed = m ? selectViewActor(m, viewId) : null;
    const viewAim = !!viewed && (viewed === m?.actors[0] ? aiming : viewed.aim);
    if (!m) {
      this.menuAngle += dt * .016;
      this.camera.position.set(22 * Math.cos(this.menuAngle + .55), 17, 22 * Math.sin(this.menuAngle + .55));
      this.camera.lookAt(-3, 1, -5); this.camera.fov = 63; this.camera.updateProjectionMatrix();
      for (const model of this.units.values()) model.visible = false;
      if (this.bomb) this.bomb.visible = false;
    } else {
      const self = m.actors[0], view = viewed!;
      const changedView = this.lastRound !== m.round || this.viewActorId !== view.id;
      if (changedView) { this.lastRound = m.round; this.viewActorId = view.id; this.lastShot = view.shot; this.recoil = 0; this.recoilAt = -1; this.weaponMotion.reset(); this.viewLighting.reset(); this.gunRig?.reset(); }
      // The visual envelope follows the viewed actor's current ADS state;
      // shot-time hitscan and camera recoil remain authoritative in the engine.
      if (view.shot !== this.lastShot) this.recoilAt = view.fireAt;
      this.recoilClock = m.phase === 'live' || m.phase === 'buy' || changedView ? m.time : Math.max(m.time, this.recoilClock + Math.max(0, Math.min(.25, dt)));
      // A delayed frame presents the latest shot, never an accumulated burst
      // kick. The same clock completes the decisive round/match-ending shot.
      const impulse = shotEnvelope(view.weapon, m.phase !== 'buy' && this.recoilAt >= 0 ? this.recoilClock - this.recoilAt : -1, view.aim, this.reducedMotion.matches);
      this.recoil = impulse.kick; this.lastShot = view.shot;
      // Footfall motion belongs to the weapon, keeping the sight line steady.
      // Eye height follows the engine's smoothed crouch amount (1.58 m → 1.14 m).
      const eye = view.y + eyeHeight(view), cameraY = eye.toFixed(2);
      this.camera.position.set(view.x, eye, view.z);
      if (this.canvas.dataset.cameraY !== cameraY) this.canvas.dataset.cameraY = cameraY;
      const hurt = this.reducedMotion.matches ? 0 : this.effects!.flinch(view.id, m.time);
      this.camera.rotation.set((view === self ? look.pitch : view.pitch) + view.recoilPitch, (view === self ? look.yaw : view.yaw) + view.recoilYaw, hurt * Math.sin(m.time * 65) * .012, 'YXZ');
      this.viewLighting.update(view.x, view.y + 1.4, view.z, dt);
      const exposure = this.viewLighting.exposure;
      this.inverseView.copy(this.camera.quaternion).invert();
      this.viewSun.position.copy(this.sun.position).applyQuaternion(this.inverseView);
      this.viewFill.position.set(0, 1, 0).applyQuaternion(this.inverseView);
      this.viewScene.environmentRotation.setFromQuaternion(this.inverseView);
      this.viewSun.intensity = .12 + exposure * 2.08;
      this.viewFill.intensity = .8 + exposure * .15 + impulse.light;
      this.viewScene.environmentIntensity = .38 + exposure * .10;
      const canAim = viewAim && view.hp > 0 && view.reload <= 0 && m.phase === 'live';
      const fov = canAim ? (view.weapon === 'sniper' ? 25 : 57) : 78;
      this.camera.fov = changedView ? fov : this.camera.fov + (fov - this.camera.fov) * (1 - Math.exp(-dt * 16)); this.camera.updateProjectionMatrix();
      for (const p of m.actors) {
        const model = this.unit(p); model.visible = p.id !== view.id && p.hp > 0;
        const flinch = this.effects!.flinch(p.id, m.time);
        model.position.set(p.x, p.y, p.z); model.rotation.set(0, p.yaw, 0);
        if (this.tacticalUnits.has(p.id)) {
          this.tacticalUnits.get(p.id)!.update(p, m, flinch);
        } else if (!this.candidateUnits.has(p.id)) {
          animateActorLegs(model, m.time, p.moving);
          animateActorAim(model, m.phase === 'live' ? p.pitch + p.recoilPitch : 0, flinch);
        } else {
          this.candidateSource!.updatePose?.(model, p, m, flinch);
          this.candidateSource!.updateLod?.(model, this.camera);
        }
      }
      if (this.bomb) { this.bomb.visible = m.bomb.carrier === null; this.bomb.position.set(m.bomb.x, groundHeight(m.bomb.x, m.bomb.z) + .05, m.bomb.z); }
      if (this.currentWeapon !== view.weapon) {
        this.gunRig?.dispose();
        if (this.gun) { disposeModelInstance(this.gun); this.viewScene.remove(this.gun); }
        this.gun = cloneModel(this.weapons.get(view.weapon)!); this.gun.scale.setScalar(weaponView[view.weapon].scale); this.viewScene.add(this.gun); this.currentWeapon = view.weapon;
        this.gunRig = new WeaponRig(this.gun); this.weaponMotion.reset(); this.effects!.clearView();
      }
      if (this.gun) {
        this.weaponMotion.update(view, m.time, dt, canAim, this.reducedMotion.matches, m.phase === 'live');
        const { hip, ads } = weaponView[view.weapon], { aim, offset, reload } = this.weaponMotion;
        const heldReload = reload.lower;
        const skeletalReload = this.gunRig!.hasSkeletalReload;
        this.gun.position.set(
          THREE.MathUtils.lerp(hip[0], ads[0], aim) - heldReload * .10 + offset.x,
          THREE.MathUtils.lerp(hip[1], ads[1], aim) + heldReload * (skeletalReload ? .075 : .11) + offset.y,
          THREE.MathUtils.lerp(hip[2], ads[2], aim) + heldReload * (skeletalReload ? -.04 : .03) + this.recoil + offset.z);
        this.gun.rotation.set(heldReload * .12 + this.recoil + offset.pitch, heldReload * .20 + offset.yaw, heldReload * (skeletalReload ? -.35 : -.65) + offset.roll);
        this.gunRig!.apply(reload, view.fireAt < 0 ? -1 : m.time - view.fireAt, view.weapon);
        const grenade = holdsGrenade(view) && view.hp > 0 && m.phase !== 'buy';
        this.gun.visible = !grenade && view.hp > 0 && m.phase !== 'buy' && !isScopeActive(view.weapon, viewAim, view.hp, m.phase, view.reload);
        this.grenadeView!.update(grenade ? view : { ...view, held: 'gun' }, m.time, this.reducedMotion.matches ? undefined : offset);
      }
    }
    if (m && viewed) this.effects!.update(m, { camera: this.camera, viewCamera: this.viewCamera, gun: this.gun, units: this.units, viewId: viewed.id, scoped: isScopeActive(viewed.weapon, viewAim, viewed.hp, m.phase, viewed.reload) }, dt);
    else this.effects!.clear(null);
    if (m && viewed) this.utility!.update(m, { camera: this.camera, units: this.units, viewId: viewed.id }, dt);
    else this.utility!.clear();
    this.occlusion.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.occlusion.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.renderer.autoClear = true;
    this.renderer.shadowMap.needsUpdate = this.highQuality;
    if (this.highQuality) {
      // Sample the separate AO depth target, never the target being rendered.
      this.utility?.setSceneDepth(this.occlusion.normalRenderTarget.depthTexture, this.composer.readBuffer.width, this.composer.readBuffer.height);
      this.composer.render(dt);
    }
    else {
      this.utility?.setSceneDepth(null, this.canvas.width, this.canvas.height);
      this.renderer.render(this.scene, this.camera);
      if (this.utility?.active) { this.renderer.autoClear = false; this.renderer.render(this.volumeScene, this.camera); this.renderer.autoClear = true; }
    }
    if (m && (this.gun?.visible || this.grenadeView?.root.visible)) { this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.viewScene, this.viewCamera); }
    if (this.candidateSource) {
      const stats = this.candidateDiagnostics;
      stats.resident = this.candidateUnits.size;
      stats.visible = [...this.candidateUnits.values()].filter(model => model.visible).length;
      stats.drawn = this.drawnCandidates.size;
      for (const [key, value] of Object.entries(stats)) {
        const name = `candidate${key[0].toUpperCase()}${key.slice(1)}`, text = String(value);
        if (this.canvas.dataset[name] !== text) this.canvas.dataset[name] = text;
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.ready = false;
    this.assetController.abort(); this.loadingManager.abort();
    this.effects?.dispose();
    this.utility?.dispose(); this.grenadeView?.dispose();
    this.gunRig?.dispose();
    disposeModelResources([this.scene, this.viewScene, ...this.assetModels, ...this.weapons.values(), ...this.worldWeapons.values(), ...(this.soldier ? [this.soldier] : []), ...(this.candidateSource?.resources ?? [])], this.assetTextures);
    this.worldWeapons.clear();
    this.assetModels = []; this.assetTextures = [];
    for (const pass of this.composer.passes) pass.dispose();
    this.occlusion.ssaoMaterial.dispose(); this.occlusion.noiseTexture?.dispose(); this.composer.dispose();
    this.sun.shadow.dispose(); this.environment.dispose(); this.renderer.dispose();
  }
}
