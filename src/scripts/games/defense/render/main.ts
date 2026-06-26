import { Application, Container, Graphics, Sprite, Assets, Texture } from 'pixi.js';
import { DefenseGame, PATH, SLOTS, FIELD_W, FIELD_H, TOWERS, type TowerType, type EnemyType } from '../engine/engine';
import { Effects } from './effects';

const BASE = '/assets/games/defense';
const TOWER_FILES: TowerType[] = ['arrow', 'bomb', 'frost', 'arcane'];
const ENEMY_FILES: EnemyType[] = ['slime', 'skeleton', 'bat', 'boss'];
const TCOL: Record<TowerType, number> = { arrow: 0xffe08a, bomb: 0xff8a3c, frost: 0x6fe6ff, arcane: 0xc08bff };
const ECOL: Record<EnemyType, number> = { slime: 0x7ed957, skeleton: 0xd8d8e0, bat: 0xb06bff, boss: 0xff4d4d };

export interface DefenseHandle { game: DefenseGame; destroy(): void; }

export async function startDefense(canvas: HTMLCanvasElement): Promise<DefenseHandle> {
  const app = new Application();
  await app.init({ canvas, resizeTo: canvas.parentElement ?? window, background: '#0a0716', antialias: false });

  // 像素素材（nearest 採樣保硬邊）
  const urls = [
    ...TOWER_FILES.map((t) => `${BASE}/tower-${t}.png`),
    ...ENEMY_FILES.map((e) => `${BASE}/enemy-${e}.png`),
    `${BASE}/floor.webp`, `${BASE}/gate.png`,
  ];
  const loaded = await Assets.load<Texture>(urls);
  const tex = (u: string): Texture => { const t = loaded[u]; t.source.scaleMode = 'nearest'; return t; };
  const towerTex = Object.fromEntries(TOWER_FILES.map((t) => [t, tex(`${BASE}/tower-${t}.png`)])) as Record<TowerType, Texture>;
  const enemyTex = Object.fromEntries(ENEMY_FILES.map((e) => [e, tex(`${BASE}/enemy-${e}.png`)])) as Record<EnemyType, Texture>;
  const floorTex = tex(`${BASE}/floor.webp`);
  const gateTex = tex(`${BASE}/gate.png`);

  const content = new Container();
  app.stage.addChild(content);
  // 地城地板背景（鋪滿戰場）
  const floor = new Sprite(floorTex);
  floor.width = FIELD_W; floor.height = FIELD_H;
  const pathG = new Graphics();
  // 封印門脈動光暈（在門後）
  const gateGlow = new Graphics().circle(0, 0, 1).fill(0x6fd8ff);
  gateGlow.x = 380; gateGlow.y = 600; gateGlow.alpha = 0;
  // 封印門（路徑出口、底部）
  const gate = new Sprite(gateTex);
  gate.anchor.set(0.5, 0.5);
  gate.scale.set(118 / gateTex.width);
  gate.x = 380; gate.y = 606;
  const towersC = new Container();
  const enemiesC = new Container();
  const dyn = new Graphics(); // 格/射程/血條/投射物（程式繪製）
  const fxC = new Container(); // 爽度效果層（最上）
  content.addChild(floor, pathG, gateGlow, gate, towersC, enemiesC, dyn, fxC);
  const effects = new Effects(fxC);

  // 石道（畫一次）：外暗邊 + 石路面 + 內微亮，疊在地板上
  const road = (w: number, c: number, a = 1): void => {
    pathG.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) pathG.lineTo(PATH[i].x, PATH[i].y);
    pathG.stroke({ width: w, color: c, alpha: a, cap: 'round', join: 'round' });
  };
  road(40, 0x120d1c, 0.9); // 外暗邊
  road(32, 0x4a4458);      // 石路面
  road(28, 0x564f6a, 0.5); // 內微亮
  // cobble 鋪面（沿路三排小石塊，交錯色）
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const px = -(b.y - a.y) / len, py = (b.x - a.x) / len;
    const n = Math.floor(len / 12);
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (const off of [-10, 0, 10]) {
        const c = ((k + off / 10) & 1) ? 0x423c5a : 0x37314a;
        pathG.roundRect(x + px * off - 4.5, y + py * off - 4.5, 9, 9, 2).fill(c).stroke({ width: 0.6, color: 0x120d1c, alpha: 0.45 });
      }
    }
  }
  // 建塔石台（畫一次）
  for (const sl of SLOTS) {
    pathG.roundRect(sl.x - 16, sl.y - 13, 32, 28, 5).fill(0x231d30).stroke({ width: 2, color: 0x120d1c });
    pathG.roundRect(sl.x - 14, sl.y - 13, 28, 13, 4).fill(0x5a5470);
  }

  const game = new DefenseGame();
  let selected: string | null = null;
  let elapsed = 0;
  let shakeMs = 0;
  let baseX = 0, baseY = 0;
  const towerSprites = new Map<number, Sprite>();
  const enemySprites = new Map<number, Sprite>();
  const firePulse = new Map<number, number>(); // towerId → 開火 pop 0..1
  const bossSeen = new Set<number>();

  function relayout(): void {
    const W = app.renderer.width, H = app.renderer.height;
    const s = Math.min(W / FIELD_W, H / FIELD_H);
    content.scale.set(s);
    content.x = (W - FIELD_W * s) / 2;
    content.y = (H - FIELD_H * s) / 2;
    baseX = content.x; baseY = content.y;
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
      const pulse = firePulse.get(t.id) ?? 0; // 開火放大一下
      sp.scale.set(1 + 0.16 * pulse);
      if (pulse > 0.02) firePulse.set(t.id, pulse * 0.8); else firePulse.delete(t.id);
    }
    // 敵人 sprite（依 id 同步）
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let sp = enemySprites.get(e.id);
      if (!sp) { sp = new Sprite(enemyTex[e.type]); sp.anchor.set(0.5); enemiesC.addChild(sp); enemySprites.set(e.id, sp); }
      // 程式化走路動畫（依種類）
      const ph = elapsed / 130 + e.id * 1.7;
      let bob = 0, sx = 1, sy = 1, rot = 0;
      if (e.type === 'slime') { const a = Math.abs(Math.sin(ph)); bob = -a * 5; sx = 1 + 0.14 * (1 - a); sy = 1 - 0.14 * (1 - a); } // 彈跳+落地壓扁
      else if (e.type === 'bat') { sx = 1 + Math.sin(ph * 2.2) * 0.2; bob = Math.sin(ph * 2.2) * 2.5; } // 拍翅
      else if (e.type === 'boss') { bob = Math.sin(ph * 0.6) * 2.5; sx = 1 + Math.sin(ph * 0.6) * 0.05; } // 沉重
      else { bob = Math.sin(ph) * 1.5; rot = Math.sin(ph) * 0.06; } // 骷髏走路晃
      sp.x = e.x; sp.y = e.y + bob;
      sp.scale.set(sx, sy); sp.rotation = rot;
      sp.tint = e.slowMs > 0 ? 0x8fdcff : 0xffffff; // 冰凍變藍
      if (e.hp < e.maxHp) {
        const w = sp.width, top = e.y - sp.height / 2 - 5;
        dyn.rect(e.x - w / 2, top, w, 3).fill(0x000000);
        dyn.rect(e.x - w / 2, top, w * (e.hp / e.maxHp), 3).fill(0x7ed957);
      }
    }
    for (const [id, sp] of enemySprites) if (!seen.has(id)) { sp.destroy(); enemySprites.delete(id); }
    // 投射物（依塔流派色：光暈 + 亮核）
    for (const p of s.projectiles) {
      const c = TCOL[p.tower];
      dyn.circle(p.x, p.y, 5).fill({ color: c, alpha: 0.35 });
      dyn.circle(p.x, p.y, 2.6).fill(0xffffff).stroke({ width: 1, color: c });
    }
    // 封印門脈動光暈
    gateGlow.scale.set(38 + Math.sin(elapsed / 480) * 5);
    gateGlow.alpha = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(elapsed / 480));
  }

  const tick = (t: { deltaMS: number }): void => {
    const dt = t.deltaMS;
    elapsed += dt;
    game.step(dt);
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'fire') {
        effects.flash(ev.x, ev.y - 8, TCOL[ev.tower]);
        const tw = game.getState().towers.find((x) => { const sl = SLOTS.find((q) => q.id === x.slot); return sl != null && sl.x === ev.x && sl.y === ev.y; });
        if (tw) firePulse.set(tw.id, 1);
      } else if (ev.kind === 'hit') effects.spark(ev.x, ev.y, 0xffffff);
      else if (ev.kind === 'blast') effects.ring(ev.x, ev.y, ev.r, 0xff8a3c);
      else if (ev.kind === 'kill') { effects.poof(ev.x, ev.y, ECOL[ev.etype]); effects.popup(ev.x, ev.y - 6, `+${ev.gold}`, 0xffd23f); }
      else if (ev.kind === 'leak') effects.ring(380, 600, 46, 0xff3b3b);
    }
    // Boss 登場演出（首次出現）
    for (const e of game.getState().enemies) {
      if (e.type === 'boss' && !bossSeen.has(e.id)) {
        bossSeen.add(e.id);
        effects.screen(0xff3b3b, 0.42);
        effects.ring(e.x, e.y + 30, 60, 0xff5a4d);
        shakeMs = 440;
      }
    }
    draw();
    effects.update(dt);
    // 震屏（Boss 登場）
    if (shakeMs > 0) { shakeMs -= dt; content.x = baseX + (Math.random() - 0.5) * 7; content.y = baseY + (Math.random() - 0.5) * 7; }
    else { content.x = baseX; content.y = baseY; }
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
