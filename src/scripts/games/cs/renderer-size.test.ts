import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GameRenderer } from './renderer';
import { FrameBudget } from './frame-budget';
import { HalfResolutionSSAOPass } from './half-resolution-ssao';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

function fixture(high = true) {
  vi.stubGlobal('devicePixelRatio', 1);
  let ratio = 1, width = 1, height = 1;
  const rect = { width: 1440, height: 900 };
  const canvas = { width: 1, height: 1, getBoundingClientRect: () => rect };
  const setSize = vi.fn((w: number, h: number) => { width = w; height = h; canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio); });
  const renderer = {
    getPixelRatio: () => ratio,
    setSize,
    setPixelRatio: vi.fn((r: number) => { ratio = r; setSize(width, height); }),
    setDrawingBufferSize: vi.fn((w: number, h: number, r: number) => { ratio = r; width = w; height = h; canvas.width = Math.floor(w * r); canvas.height = Math.floor(h * r); }),
  };
  const camera = new THREE.PerspectiveCamera();
  const occlusion = new HalfResolutionSSAOPass(new THREE.Scene(), camera, 1, 1, 4);
  const composer = new EffectComposer(renderer as unknown as THREE.WebGLRenderer, new THREE.WebGLRenderTarget(1, 1));
  composer.addPass(occlusion);
  const targetDisposals = [composer.renderTarget1, composer.renderTarget2, occlusion.normalRenderTarget, occlusion.ssaoRenderTarget, occlusion.blurRenderTarget].map(target => vi.spyOn(target, 'dispose'));
  const game = Object.assign(Object.create(GameRenderer.prototype), {
    canvas, renderer, composer, occlusion, camera, viewCamera: new THREE.PerspectiveCamera(),
    frameBudget: new FrameBudget(), budgetLayout: '', drawingBufferLayout: '', postprocessLayout: '',
    highQuality: high, budgetFloor: .8, antialias: { uniforms: { resolution: { value: new THREE.Vector2() } } },
    effects: { resize: vi.fn() },
  });
  cleanup.push(() => { composer.dispose(); occlusion.dispose(); });
  return { game, canvas, rect, renderer, composer, occlusion, targetDisposals };
}

describe('GPU target sizes', () => {
  it('allocates the canvas and each target once, then preserves them for an unchanged resize', () => {
    const f = fixture(); f.game.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([1440, 900]);
    expect(f.renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    expect(f.renderer.setSize).not.toHaveBeenCalled();
    f.targetDisposals.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    f.game.resize();
    expect(f.renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    f.targetDisposals.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
  it('uses integer physical pixels at fractional DPR and exactly half-size AO', () => {
    const f = fixture(); vi.stubGlobal('devicePixelRatio', 1.25); f.rect.width = 1001; f.rect.height = 701;
    f.game.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([1251, 876]);
    expect([f.composer.renderTarget1.width, f.composer.renderTarget1.height]).toEqual([1251, 876]);
    expect([f.occlusion.width, f.occlusion.height]).toEqual([626, 438]);
    expect(f.game.camera.aspect).toBeCloseTo(1001 / 701);
    expect(f.game.antialias.uniforms.resolution.value.x).toBe(1 / 1251);
  });
  it('leaves unused postprocess targets at 1x1 during low-quality adaptive changes', () => {
    const f = fixture(false); f.game.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([1214, 758]);
    for (let i = 0; i < 160; i++) f.game.frameBudget.frame(1 / 30, true);
    expect(f.game.renderScale).toBe(.8); f.game.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([971, 607]);
    expect([f.composer.renderTarget1.width, f.composer.renderTarget1.height, f.occlusion.width, f.occlusion.height]).toEqual([1, 1, 1, 1]);
    f.targetDisposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(f.renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
  });
  it('restores high quality after releasing high-resolution targets for low quality', () => {
    const f = fixture(); f.game.resize();
    f.game.highQuality = false; f.game.budgetLayout = ''; f.game.resize();
    expect(f.composer.renderTarget1.width).toBe(1);
    f.game.highQuality = true; f.game.budgetLayout = ''; f.game.resize();
    expect([f.composer.renderTarget1.width, f.composer.renderTarget1.height]).toEqual([1440, 900]);
    expect([f.occlusion.width, f.occlusion.height]).toEqual([720, 450]);
    f.targetDisposals.forEach(spy => expect(spy).toHaveBeenCalledTimes(3));
  });
  it('keeps a minimized canvas and all render targets at least one pixel', () => {
    const f = fixture(); f.rect.width = 0; f.rect.height = 0; f.game.resize();
    expect([f.canvas.width, f.canvas.height, f.occlusion.width, f.occlusion.height]).toEqual([1, 1, 1, 1]);
    expect(f.game.camera.aspect).toBe(1);
  });
  it('resizes AO once from composer dimensions without an intermediate full-size target', () => {
    const f = fixture(); f.composer.setSize(1001, 701);
    expect([f.occlusion.width, f.occlusion.height]).toEqual([501, 351]);
    f.targetDisposals.slice(2).forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
});
