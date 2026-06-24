import { Application, Container, Graphics } from 'pixi.js';
import { DefenseGame, PATH, SLOTS, FIELD_W, FIELD_H, TOWERS, type TowerType, type EnemyType } from '../engine/engine';

const ENEMY_STYLE: Record<EnemyType, { r: number; color: number }> = {
  slime: { r: 9, color: 0x7ed957 }, skeleton: { r: 10, color: 0xd8d8e0 },
  bat: { r: 7, color: 0xb06bff }, boss: { r: 20, color: 0xff4d4d },
};
const TOWER_COLOR: Record<TowerType, number> = { arrow: 0xc8a24a, bomb: 0xff8a3c, frost: 0x4fd8ff, arcane: 0xc08bff };
export const TOWER_LABEL: Record<TowerType, string> = { arrow: 'ARROW', bomb: 'BOMB', frost: 'FROST', arcane: 'ARCANE' };

export interface DefenseHandle { game: DefenseGame; destroy(): void; }

export async function startDefense(canvas: HTMLCanvasElement): Promise<DefenseHandle> {
  const app = new Application();
  await app.init({ canvas, resizeTo: canvas.parentElement ?? window, background: '#0a0716', antialias: false });

  const content = new Container();
  app.stage.addChild(content);
  const pathG = new Graphics();
  const dyn = new Graphics();
  content.addChild(pathG, dyn);

  // 路徑石板（畫一次）
  pathG.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) pathG.lineTo(PATH[i].x, PATH[i].y);
  pathG.stroke({ width: 34, color: 0x2a2438, cap: 'round', join: 'round' });
  pathG.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) pathG.lineTo(PATH[i].x, PATH[i].y);
  pathG.stroke({ width: 26, color: 0x3a3350, cap: 'round', join: 'round' });

  const game = new DefenseGame();
  let selected: string | null = null;

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

  // ---- 點擊建塔格 ----
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

  // ---- draw + loop ----
  function draw(): void {
    dyn.clear();
    const s = game.getState();
    // 建塔格（空格虛線圈；選中高亮）
    for (const sl of SLOTS) {
      const occ = s.towers.some((t) => t.slot === sl.id);
      if (!occ) dyn.circle(sl.x, sl.y, 14).stroke({ width: 1.5, color: selected === sl.id ? 0xffd23f : 0x6a5f88, alpha: 0.8 });
    }
    // 選中射程圈
    if (selected) {
      const t = s.towers.find((x) => x.slot === selected);
      const sl = SLOTS.find((x) => x.id === selected)!;
      const range = t ? (t.level >= 2 ? TOWERS[t.type].up.range : TOWERS[t.type].range) : 120;
      dyn.circle(sl.x, sl.y, range).fill({ color: 0xffffff, alpha: 0.05 }).stroke({ width: 1, color: 0xffd23f, alpha: 0.4 });
    }
    // 塔
    for (const t of s.towers) {
      const sl = SLOTS.find((x) => x.id === t.slot)!;
      dyn.roundRect(sl.x - 11, sl.y - 11, 22, 22, 4).fill(TOWER_COLOR[t.type])
        .stroke({ width: 2, color: t.level >= 2 ? 0xffd23f : 0x000000, alpha: 0.8 });
    }
    // 敵人 + 血條
    for (const e of s.enemies) {
      const st = ENEMY_STYLE[e.type];
      dyn.circle(e.x, e.y, st.r).fill(st.color).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      if (e.hp < e.maxHp) {
        const w = st.r * 2;
        dyn.rect(e.x - st.r, e.y - st.r - 5, w, 3).fill(0x000000);
        dyn.rect(e.x - st.r, e.y - st.r - 5, w * (e.hp / e.maxHp), 3).fill(0x7ed957);
      }
    }
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
