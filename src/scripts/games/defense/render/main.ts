import { Application, Container, Graphics, Sprite, Assets, Texture } from 'pixi.js';
import { DefenseGame, PATH, SLOTS, FIELD_W, FIELD_H, TOWERS, type TowerType, type EnemyType } from '../engine/engine';

const BASE = '/assets/games/defense';
const TOWER_FILES: TowerType[] = ['arrow', 'bomb', 'frost', 'arcane'];
const ENEMY_FILES: EnemyType[] = ['slime', 'skeleton', 'bat', 'boss'];

export interface DefenseHandle { game: DefenseGame; destroy(): void; }

export async function startDefense(canvas: HTMLCanvasElement): Promise<DefenseHandle> {
  const app = new Application();
  await app.init({ canvas, resizeTo: canvas.parentElement ?? window, background: '#0a0716', antialias: false });

  // 像素素材（nearest 採樣保硬邊）
  const urls = [...TOWER_FILES.map((t) => `${BASE}/tower-${t}.png`), ...ENEMY_FILES.map((e) => `${BASE}/enemy-${e}.png`)];
  const loaded = await Assets.load<Texture>(urls);
  const tex = (u: string): Texture => { const t = loaded[u]; t.source.scaleMode = 'nearest'; return t; };
  const towerTex = Object.fromEntries(TOWER_FILES.map((t) => [t, tex(`${BASE}/tower-${t}.png`)])) as Record<TowerType, Texture>;
  const enemyTex = Object.fromEntries(ENEMY_FILES.map((e) => [e, tex(`${BASE}/enemy-${e}.png`)])) as Record<EnemyType, Texture>;

  const content = new Container();
  app.stage.addChild(content);
  const pathG = new Graphics();
  const towersC = new Container();
  const enemiesC = new Container();
  const dyn = new Graphics(); // 格/射程/血條/投射物（程式繪製）
  content.addChild(pathG, towersC, enemiesC, dyn);

  // 路徑石板（畫一次）
  for (const [w, c] of [[34, 0x2a2438], [26, 0x3a3350]] as const) {
    pathG.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) pathG.lineTo(PATH[i].x, PATH[i].y);
    pathG.stroke({ width: w, color: c, cap: 'round', join: 'round' });
  }

  const game = new DefenseGame();
  let selected: string | null = null;
  const towerSprites = new Map<number, Sprite>();
  const enemySprites = new Map<number, Sprite>();

  function relayout(): void {
    const W = app.renderer.width, H = app.renderer.height;
    const s = Math.min(W / FIELD_W, H / FIELD_H);
    content.scale.set(s);
    content.x = (W - FIELD_W * s) / 2;
    content.y = (H - FIELD_H * s) / 2;
  }
  relayout();
  app.renderer.on('resize', relayout);

  // ---- DOM HUD ----
  const $ = (id: string) => document.getElementById(id);
  const goldEl = $('td-gold'), hpEl = $('td-hp'), waveEl = $('td-wave');
  const startBtn = $('td-start') as HTMLButtonElement | null;
  const menu = $('td-menu'), upgradeBtn = $('td-upgrade') as HTMLButtonElement | null;
  const resultEl = $('td-result'), resultText = $('td-result-text');

  function refreshHud(): void {
    const s = game.getState();
    if (goldEl) goldEl.textContent = String(s.gold);
    if (hpEl) hpEl.textContent = String(s.baseHp);
    if (waveEl) waveEl.textContent = `${s.wave}/${s.totalWaves}`;
    if (startBtn) startBtn.disabled = s.status !== 'building' || s.wave >= s.totalWaves;
  }
  function refreshMenu(): void {
    if (!menu) return;
    const occupied = selected != null && game.getState().towers.some((t) => t.slot === selected);
    menu.toggleAttribute('hidden', selected == null);
    menu.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((b) => {
      const cost = TOWERS[b.dataset.build as TowerType].cost;
      b.hidden = occupied;
      b.disabled = game.getState().gold < cost;
    });
    if (upgradeBtn) {
      const t = game.getState().towers.find((x) => x.slot === selected);
      upgradeBtn.hidden = !occupied || (t?.level ?? 2) >= 2;
      if (t) upgradeBtn.disabled = game.getState().gold < TOWERS[t.type].up.cost;
    }
  }
  menu?.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((b) =>
    b.addEventListener('click', () => { if (selected) game.build(selected, b.dataset.build as TowerType); refreshMenu(); refreshHud(); }));
  upgradeBtn?.addEventListener('click', () => {
    const t = game.getState().towers.find((x) => x.slot === selected);
    if (t) game.upgrade(t.id); refreshMenu(); refreshHud();
  });
  const onStart = (): void => { game.startWave(); refreshHud(); };
  startBtn?.addEventListener('click', onStart);

  const onPointer = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (app.renderer.width / rect.width);
    const sy = (e.clientY - rect.top) * (app.renderer.height / rect.height);
    const fx = (sx - content.x) / content.scale.x, fy = (sy - content.y) / content.scale.y;
    let hit: string | null = null;
    for (const s of SLOTS) if (Math.hypot(s.x - fx, s.y - fy) <= 26) hit = s.id;
    selected = hit;
    refreshMenu();
  };
  canvas.addEventListener('pointerdown', onPointer);

  function draw(): void {
    const s = game.getState();
    dyn.clear();
    // 空格虛線圈（選中高亮）+ 選中射程圈
    for (const sl of SLOTS) {
      if (!s.towers.some((t) => t.slot === sl.id))
        dyn.circle(sl.x, sl.y, 14).stroke({ width: 1.5, color: selected === sl.id ? 0xffd23f : 0x6a5f88, alpha: 0.8 });
    }
    if (selected) {
      const t = s.towers.find((x) => x.slot === selected);
      const sl = SLOTS.find((x) => x.id === selected)!;
      const range = t ? (t.level >= 2 ? TOWERS[t.type].up.range : TOWERS[t.type].range) : 120;
      dyn.circle(sl.x, sl.y, range).fill({ color: 0xffffff, alpha: 0.05 }).stroke({ width: 1, color: 0xffd23f, alpha: 0.4 });
    }
    // 塔 sprite（建一次、留存）
    for (const t of s.towers) {
      let sp = towerSprites.get(t.id);
      if (!sp) {
        sp = new Sprite(towerTex[t.type]);
        sp.anchor.set(0.5, 0.72);
        const sl = SLOTS.find((x) => x.id === t.slot)!;
        sp.x = sl.x; sp.y = sl.y;
        towersC.addChild(sp);
        towerSprites.set(t.id, sp);
      }
      if (t.level >= 2) { const sl = SLOTS.find((x) => x.id === t.slot)!; dyn.circle(sl.x + 12, sl.y - 16, 3.5).fill(0xffd23f); } // 升級金點
    }
    // 敵人 sprite（依 id 同步）
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let sp = enemySprites.get(e.id);
      if (!sp) { sp = new Sprite(enemyTex[e.type]); sp.anchor.set(0.5); enemiesC.addChild(sp); enemySprites.set(e.id, sp); }
      sp.x = e.x; sp.y = e.y;
      if (e.hp < e.maxHp) {
        const w = sp.width, top = e.y - sp.height / 2 - 5;
        dyn.rect(e.x - w / 2, top, w, 3).fill(0x000000);
        dyn.rect(e.x - w / 2, top, w * (e.hp / e.maxHp), 3).fill(0x7ed957);
      }
    }
    for (const [id, sp] of enemySprites) if (!seen.has(id)) { sp.destroy(); enemySprites.delete(id); }
    // 投射物
    for (const p of s.projectiles) dyn.circle(p.x, p.y, 3).fill(0xfff0a0);
  }

  const tick = (t: { deltaMS: number }): void => {
    game.step(t.deltaMS);
    draw();
    refreshHud();
    const st = game.getState();
    if ((st.status === 'won' || st.status === 'lost') && resultEl?.hasAttribute('hidden')) {
      if (resultText) resultText.textContent = st.status === 'won' ? 'THE GATE HOLDS' : 'THE GATE IS BREACHED';
      resultEl?.removeAttribute('hidden');
    }
  };
  app.ticker.add(tick);
  refreshHud();

  return {
    game,
    destroy(): void {
      app.renderer.off('resize', relayout);
      startBtn?.removeEventListener('click', onStart);
      canvas.removeEventListener('pointerdown', onPointer);
      app.ticker.remove(tick);
      app.destroy(undefined, { children: true });
    },
  };
}
