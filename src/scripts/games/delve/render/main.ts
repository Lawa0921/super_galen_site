// main.ts — 把 DelveGame 接上 canvas：固定 60Hz 步長 + rAF 渲染、HUD、輸入、resize。回傳 handle（含 destroy）。
import type { DelveGame } from '../engine/game';
import { FIXED_DT } from '../engine/constants';
import { LIQUID_BUDGET_MS } from '../engine/game';
import { LIQ } from '../engine/liquidKind';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { FixedStepper, blockedMessage, hintText } from './model';
import { MapCache, Minimap, FullMap } from './mapView';
import { ExploreUi } from './journal';
import { CalendarUi } from './calendarUi';
import { LevelsUi } from './levelsUi';
import { SoundManager } from '../audio/SoundManager';
import { T } from '../engine/tiles';
import { ITEMS } from '../engine/items';
import { parseZoomPref } from './lowres';
import { FISH } from '../engine/fishing';
import { RARITIES, affixDef, gearSlot } from '../engine/gear';
import { TOAST_HIGH, TOAST_LOW, TOAST_NORMAL } from './toastQueue';
import { LIVE, endLoop, loopId, markFrame } from './live';
import { SettleUi } from './settleUi';
import { FolkUi } from './folkUi';
import { NPCS } from '../engine/npcs';
import { LEVEL_NAMES } from '../engine/settlement';

/** 稀有 / 傳說的漁獲（釣到時多一聲鈴） */
const FISH_RARE = new Set(FISH.filter((f) => f.rarity === 'rare' || f.rarity === 'legendary').map((f) => f.item));

const ZOOM_KEY = 'delve.zoom';
function loadZoom(): number {
  try { return parseZoomPref(globalThis.localStorage?.getItem(ZOOM_KEY)); } catch { return 0; }
}
function saveZoom(z: number): void {
  try { globalThis.localStorage?.setItem(ZOOM_KEY, String(z)); } catch { /* 私密模式等：不記住 */ }
}
import { attachControls } from '../input/controls';

export interface FrameStats {
  /** 平均每幀 JS 工作時間（模擬 + 繪製，ms） */
  avgWorkMs: number;
  /** 平均 rAF 間隔（ms） */
  avgFrameMs: number;
  fps: number;
  frames: number;
  lightMs: number;
  cachedChunks: number;
  /** 地圖快取 + 小地圖 / 全地圖每幀平均耗時（ms） */
  mapMs: number;
  /** 液體：上一刻模擬耗時 / 處理格數 / 活躍格數、液體圖層繪製耗時 */
  liquidSimMs: number; liquidProcessed: number; liquidActive: number; liquidDrawMs: number;
  /** 最近 WINDOW 幀 JS 工作時間的 p95 / 最大值（ms）：看尖峰幀 */
  p95WorkMs: number; maxWorkMs: number;
}

export interface DelveHandle {
  game: DelveGame;
  renderer: Renderer;
  hud: Hud;
  map: { cache: MapCache; minimap: Minimap; full: FullMap };
  ui: ExploreUi;
  /** 據點面板 / 居民面板 / 查房標籤 */
  settleUi: SettleUi;
  /** 世界 NPC 面板 / 委託清單 */
  folkUi: FolkUi;
  /** HUD 日期時鐘 + 日曆 / 天氣預報面板 */
  calendar: CalendarUi;
  /** 等級系統：經驗條、升級橫幅、角色 / 技能面板、主動技能按鍵 */
  levels: LevelsUi;
  sound: SoundManager;
  stats(): FrameStats;
  /** 暫停模擬（選單開啟時） */
  setPaused(p: boolean): void;
  readonly paused: boolean;
  destroy(): void;
}

export interface StartOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  game: DelveGame;
  onMenu: () => void;
}

const WINDOW = 120;

export function startDelve(opts: StartOptions): DelveHandle {
  const { root, canvas, game } = opts;
  const renderer = new Renderer(canvas, game);
  LIVE.handles++;
  const lid = loopId();
  // 液體模擬每刻最多花 LIQUID_BUDGET_MS（大洪水分到之後的刻，不會卡住一幀）
  game.liquids.timeBudgetMs = LIQUID_BUDGET_MS;
  renderer.zoomOffset = loadZoom();
  const hud = new Hud(root, game, renderer.atlas);
  const stepper = new FixedStepper(FIXED_DT, 0.25);
  const sound = new SoundManager();
  renderer.onCue = () => sound.climbGrip();
  const ui = new ExploreUi(root, game, renderer.atlas);
  const calendar = new CalendarUi(root, game);
  const settleUi = new SettleUi(root, game, renderer, renderer.atlas, (m) => hud.toast(m, 2400), () => hud.setInventory(true));
  const folkUi = new FolkUi(root, game, renderer, renderer.atlas, { onToast: (m, ms, prio) => hud.toast(m, ms ?? 2400, prio), onInventory: () => hud.setInventory(true) });
  const mapCache = new MapCache(game);
  renderer.onWorldDirty = (cis) => mapCache.markWorld(cis);
  const mmRoot = root.querySelector<HTMLElement>('#delve-minimap'), mmCanvas = root.querySelector<HTMLCanvasElement>('#delve-minimap-canvas');
  const mapRoot = root.querySelector<HTMLElement>('#delve-map'), mapCanvas = root.querySelector<HTMLCanvasElement>('#delve-map-canvas');
  if (!mmRoot || !mmCanvas || !mapRoot || !mapCanvas) throw new Error('delve: missing map elements');
  const minimap = new Minimap(mmRoot, mmCanvas, mapCache, game);
  /** 選單暫停（session 控制）與地圖開啟（這裡控制）分開記 */
  let menuPaused = false;
  const fullmap = new FullMap(mapRoot, mapCanvas, mapCache, game, {
    onClose: () => setMap(false),
    onToast: (m) => hud.toast(m),
  });
  let paused = false;
  /** NPC 面板開著而暫停（非和平模式） */
  let talkPaused = false;
  // 等級系統：角色 / 技能面板開著時暫停（面板用方向鍵選技能）
  const levels = new LevelsUi({
    root, game, sound, hud,
    isBlocked: () => menuPaused || fullmap.isOpen,
    onToggle: () => {
      paused = menuPaused || fullmap.isOpen || levels.isOpen;
      if (paused) controls.releaseAll();
      last = performance.now();
    },
  });
  const setMap = (open: boolean): void => {
    if (open === fullmap.isOpen) return;
    if (open) { fullmap.open(); root.dataset.map = '1'; } else { fullmap.close(); delete root.dataset.map; }
    paused = menuPaused || fullmap.isOpen || levels.isOpen;
    if (paused) controls.releaseAll();
    last = performance.now();
  };
  const unlock = (): void => sound.ensure();
  root.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const mmIn = root.querySelector('#delve-mm-in'), mmOut = root.querySelector('#delve-mm-out'), mapBtn = root.querySelector('#delve-map-btn');
  const onMmIn = (): void => { minimap.zoomBy(1); }, onMmOut = (): void => { minimap.zoomBy(-1); };
  const onMapBtn = (): void => { if (!menuPaused) setMap(!fullmap.isOpen); };
  mmIn?.addEventListener('click', onMmIn);
  mmOut?.addEventListener('click', onMmOut);
  mapBtn?.addEventListener('click', onMapBtn);
  mmCanvas.addEventListener('click', onMapBtn);
  // 自動瞄準（觸控用；偏好記在 localStorage）
  const aimBtn = root.querySelector<HTMLElement>('#delve-aim-btn');
  const setAutoAim = (on: boolean): void => {
    game.autoAim = on;
    aimBtn?.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { globalThis.localStorage?.setItem('delve.autoaim', on ? '1' : '0'); } catch { /* 私密模式 */ }
  };
  try { setAutoAim(globalThis.localStorage?.getItem('delve.autoaim') === '1'); } catch { setAutoAim(false); }
  const onAim = (): void => { setAutoAim(!game.autoAim); hud.toast(game.autoAim ? '自動瞄準：開（攻擊最近的怪物）' : '自動瞄準：關'); };
  aimBtn?.addEventListener('click', onAim);
  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  const work = new Float32Array(WINDOW), gaps = new Float32Array(WINDOW), mapWork = new Float32Array(WINDOW);
  let frames = 0;

  const resize = (): void => {
    const r = canvas.getBoundingClientRect();
    renderer.resize(r.width || window.innerWidth, r.height || window.innerHeight, window.devicePixelRatio || 1);
    renderer.snapCamera();
    // HUD 的像素單位（CSS px）跟著畫面的美術像素大小走：外框 / 圖示都是整數倍
    root.dataset.px = String(Math.max(1, Math.min(3, Math.round(renderer.baseZoom()))));
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  window.addEventListener('resize', resize);

  const zoom = (d: number): void => {
    saveZoom(renderer.zoomBy(d));
    const v = renderer.viewTiles();
    hud.toast(`縮放 ${renderer.scale}× · 視野 ${v.w}×${v.h} 格`);
  };
  const zIn = root.querySelector('#delve-zoom-in'), zOut = root.querySelector('#delve-zoom-out');
  const onZin = (): void => zoom(1), onZout = (): void => zoom(-1);
  zIn?.addEventListener('click', onZin);
  zOut?.addEventListener('click', onZout);

  const controls = attachControls({
    game, canvas, root,
    joy: root.querySelector<HTMLElement>('#delve-joy'),
    jumpBtn: root.querySelector<HTMLElement>('#delve-jump'),
    screenToWorld: (sx, sy) => renderer.screenToWorld(sx, sy),
    onInventory: () => hud.toggleInventory(),
    onMenu: () => {
      if (fullmap.isOpen) setMap(false);
      else if (levels.isOpen) levels.setOpen(false);
      else if (ui.loreOpen) ui.closeLore();
      else if (settleUi.closeTop()) { /* 據點 / 居民面板 */ }
      else if (folkUi.closeTop()) { /* NPC 面板 / 委託清單 */ }
      else if (hud.confirmOpen) hud.cancelConfirm();
      else if (game.openChest) game.closeChest();
      else if (hud.forgeOpen) hud.setForge(null);
      else if (ui.journalOpen) ui.setJournal(false);
      else if (calendar.isOpen) calendar.setOpen(false);
      else if (hud.inventoryOpen) hud.setInventory(false);
      else opts.onMenu();
    },
    onMap: () => { if (!menuPaused) setMap(!fullmap.isOpen); },
    onMinimap: () => { if (!menuPaused && !fullmap.isOpen) hud.toast(minimap.toggle() ? '小地圖：開' : '小地圖：關'); },
    onJournal: () => { if (!menuPaused && !fullmap.isOpen) ui.toggleJournal(); },
    onHousing: () => { if (!menuPaused && !fullmap.isOpen) settleUi.toggleHousing(); },
    onSettle: () => { if (!menuPaused && !fullmap.isOpen) { if (ui.journalOpen) ui.setJournal(false); settleUi.toggleSettle(); } },
    onQuests: () => { if (!menuPaused && !fullmap.isOpen) { if (ui.journalOpen) ui.setJournal(false); folkUi.toggleQuests(); } },
    onTalk: () => { if (!menuPaused && !fullmap.isOpen && !game.talkNearest()) hud.toast('附近沒有可以說話的人（靠近 NPC 再按 T）', 1600); },
    onZoom: zoom,
    isBlocked: () => paused,
  });

  const frame = (now: number): void => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    markFrame(lid, now);
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    gaps[frames % WINDOW] = now - last;
    last = now;
    const t0 = performance.now();
    // 和 NPC 對話（面板開著）時：非和平模式下暫停模擬（怪物不會趁你挑商品時打你）；UI 事件照常處理
    const talking = !game.peaceful && (folkUi.isOpen || settleUi.npcOpen);
    if (talking !== talkPaused) { talkPaused = talking; root.dataset.talkpause = talking ? '1' : ''; if (!talking) delete root.dataset.talkpause; if (talking) controls.releaseAll(); }
    if (!paused) {
      if (!talking) {
        controls.update();
        const n = stepper.advance(dt);
        for (let i = 0; i < n; i++) game.step(FIXED_DT);
      }
      let invChanged = false;
      for (const e of game.drainEvents()) {
        renderer.onEvent(e);
        levels.onEvent(e);
        if (e.type === 'blocked') {
          const m = blockedMessage(e.reason);
          if (m) hud.toast(m);
        } else if (e.type === 'chest') hud.setChest(e.open);
        else if (e.type === 'lore') { ui.showLore(e.id, e.first); sound.lore(e.first); }
        else if (e.type === 'discover') { ui.discover(e.region.name, e.region.cat); sound.discover(); }
        else if (e.type === 'treasure') { hud.toast(`獲得珍寶：${ITEMS[e.item].name.zh}`, 2400); sound.treasure(); invChanged = true; }
        else if (e.type === 'spawn') { hud.toast(e.set ? (game.settle.spawnCore !== null ? '已設定重生點（據點爐心）' : '已設定重生點（床）') : '重生點被拆掉了：回到出生點'); if (e.set) sound.spawn(); }
        else if (e.type === 'recall') {
          sound.recall(e.phase);
          if (e.phase === 'done') { renderer.snapCamera(); hud.toast('傳送回重生點'); }
          else if (e.phase === 'cancel') hud.toast('移動了：傳送中斷');
        }
        else if (e.type === 'hint') hud.toast(hintText(e.id));
        else if (e.type === 'unlock') { hud.toast(e.item === 'golden_key' ? '用金鑰匙打開了金寶箱' : '用地城鑰匙打開了門'); invChanged = true; }
        else if (e.type === 'door') { /* 門的開關：只需要重畫（chunk dirty） */ }
        else if (e.type === 'attack') {
          if (e.kind === 'bow') sound.bow(); else if (e.kind === 'staff') sound.magic();
          else if (e.kind === 'throw' || e.kind === 'boomerang') sound.throwSfx(); else sound.swing(e.kind === 'broadsword');
          if (e.kind === 'throw' || e.kind === 'bow') invChanged = true;
        }
        else if (e.type === 'hit') sound.enemyHit(e.crit);
        else if (e.type === 'kill') sound.enemyDeath();
        else if (e.type === 'hurt') { if (e.cause === 'drown') sound.drown(); else if (e.cause === 'burn') sound.burn(); else sound.hurt(); }
        else if (e.type === 'splash') sound.splash(e.big, e.liquid === LIQ.LAVA);
        else if (e.type === 'liquid') { if (renderer.nearView(e.x, e.y)) sound.sizzle(); }
        else if (e.type === 'bubble') sound.bubble();
        else if (e.type === 'liquidtool') { sound.splash(false, e.liquid === LIQ.LAVA); invChanged = true; }
        else if (e.type === 'death') { sound.death(); hud.setInventory(false); }
        else if (e.type === 'respawn') hud.toast('你甦醒了');
        else if (e.type === 'sleep') {
          if (e.phase === 'start') { sound.sleep(); hud.setInventory(false); }
          else { sound.wake(); hud.toast(`早安——${game.dateText()}`, 2400); }
        }
        else if (e.type === 'lightning') sound.thunder(e.dist);
        else if (e.type === 'fish') {
          if (e.phase === 'cast') sound.cast();
          else if (e.phase === 'land') sound.plop(e.liquid === LIQ.LAVA);
          else if (e.phase === 'bite') sound.bite();
          else if (e.phase === 'catch' && e.item) {
            const def = ITEMS[e.item], rare = Boolean(def.unique) || FISH_RARE.has(e.item);
            sound.catchFish(rare);
            hud.toast(def.unique ? `傳說之魚！釣到了 ${def.name.zh}` : `釣到了 ${def.name.zh}`, rare ? 2600 : 1600);
            invChanged = true;
          }
          else if (e.phase === 'escape') { sound.reel(true); hud.toast('魚跑掉了…（浮標沉下去時要馬上按）'); }
          else if (e.phase === 'reel') sound.reel(false);
          else if (e.phase === 'snag') hud.toast('浮標卡住了');
          else if (e.phase === 'burn') hud.toast('浮標燒掉了：熔岩要用燼線釣竿');
          else if (e.phase === 'snap') hud.toast('走太遠，釣線斷了');
        }
        else if (e.type === 'crate') { sound.treasure(); hud.toast(`打開了${ITEMS[e.item].name.zh}`); invChanged = true; }
        else if (e.type === 'craft' && gearSlot(e.item)) {
          // 合成出優良以上：提示一下稀有度
          const st = [...game.inventory.slots].reverse().find((s) => s?.item === e.item && s.gear);
          if (st?.gear && st.gear.rarity >= 1) { hud.toast(`合成出${RARITIES[st.gear.rarity].zh}：${hud.gearLabel(st)}`, 2000); sound.lootPickup(st.gear.rarity); }
          invChanged = true;
        }
        else if (e.type === 'eat') { sound.munch(); invChanged = true; }
        else if (e.type === 'pickup') {
          if (e.rarity !== undefined) {
            sound.lootPickup(e.rarity);
            if (e.rarity >= 2) {
              const st = game.inventory.slots.find((s) => s?.item === e.item && s.gear?.rarity === e.rarity);
              hud.toast(`獲得${RARITIES[e.rarity].zh}裝備：${st ? hud.gearLabel(st) : ITEMS[e.item].name.zh}`, e.rarity >= 4 ? 3000 : 1800, e.rarity >= 4 ? TOAST_HIGH : TOAST_NORMAL);
            }
          } else sound.pickup();
          invChanged = true;
        }
        else if (e.type === 'loot') {
          sound.lootDrop(e.rarity);
          if (e.rarity >= 4) hud.toast(`${RARITIES[e.rarity].zh}裝備掉落了！`, 2400, TOAST_HIGH);
        }
        else if (e.type === 'chain') sound.zap();
        else if (e.type === 'undying') { sound.undying(); hud.toast('不滅：撐住了致命一擊！', 2200, TOAST_HIGH); }
        else if (e.type === 'airjump') sound.airJump();
        else if (e.type === 'climb') { if (e.phase === 'grab') sound.climbGrab(); else if (e.phase === 'mantle') sound.mantle(); else sound.mantleTop(); }
        else if (e.type === 'codex') { sound.codex(); hud.toast(`圖鑑收錄新詞條：${affixDef(e.affix).word}`, 1800, TOAST_LOW); }
        else if (e.type === 'salvage') { sound.salvage(); invChanged = true; }
        else if (e.type === 'forge') { sound.forge(e.action); invChanged = true; }
        else if (e.type === 'heal') { sound.heal(); invChanged = true; }
        else if (e.type === 'lifeup') { sound.heal(); hud.toast(`生命上限提升到 ${e.maxHp}`); invChanged = true; }
        else if (e.type === 'shot') { if (e.hostile) sound.enemyShot(e.kind === 'fireball' || e.kind === 'ember'); }
        else if (e.type === 'impact') { /* 火花由 renderer 畫 */ }
        else if (e.type === 'hearth') { if (ui.journalOpen) ui.setJournal(false); folkUi.closeTop(); folkUi.closeTop(); settleUi.openSettle(e.id); }
        else if (e.type === 'talk') { if (ui.journalOpen) ui.setJournal(false); folkUi.closeTop(); folkUi.closeTop(); settleUi.openNpc(e.kind, e.line); sound.pickup(); }
        else if (e.type === 'npc') {
          const d = NPCS[e.kind];
          if (e.phase === 'arrive') { hud.toast(`${d.title}「${d.name}」搬進來了！`, 3000, TOAST_HIGH); sound.treasure(); }
          else if (e.phase === 'coming') hud.toast(`${d.title}「${d.name}」聽說了你的據點，正在搬來的路上`, 2600);
          else if (e.phase === 'leave') hud.toast(`${d.title}「${d.name}」搬走了`, 2400);
          else hud.toast(`${d.title}「${d.name}」沒有房間了（房間不合格或床被拆了）`, 2600);
        }
        else if (e.type === 'settlement') {
          if (e.phase === 'found') hud.toast('建立了據點！在範圍內蓋好房間（H 查房、B 據點面板）', 3000);
          else if (e.phase === 'level') { hud.toast(`據點升級：Lv${e.level}「${LEVEL_NAMES[e.level]}」！`, 3000, TOAST_HIGH); sound.discover(); }
          else hud.toast('據點爐心被拆掉了：據點解散', 2400);
        }
        else if (e.type === 'trade') { sound.pickup(); invChanged = true; }
        else if (e.type === 'folktalk') { if (ui.journalOpen) ui.setJournal(false); settleUi.closeNpc(); settleUi.closeSettle(); folkUi.open(e.key, e.line, e.board); sound.pickup(); }
        else if (e.type === 'folktrade') { sound.pickup(); invChanged = true; }
        else if (e.type === 'folk' || e.type === 'quest' || e.type === 'buff' || e.type === 'scoutmark') {
          folkUi.onEvent(e);
          if (e.type === 'folk' && e.phase === 'appear') sound.discover();
          else if (e.type === 'quest' && e.phase === 'done') { sound.treasure(); invChanged = true; }
          else if (e.type === 'quest' && e.phase === 'ready') sound.lore(true);
          else if (e.type === 'buff' && e.on) sound.heal();
        }
        else if (e.type === 'landmark') {
          ui.showNote(e.first ? '地標 · 新發現' : '地標', e.title, e.first ? `${e.text}${e.items.length || e.coins ? `\n\n得到：${[...e.items.map((i) => `${ITEMS[i.item].name.zh} ×${i.n}`), ...(e.coins ? [`${e.coins} 銅幣`] : [])].join('、')}` : ''}${e.clue ? `\n\n線索：「${e.clue}」已經標在地圖上了。` : ''}` : e.text);
          if (e.first) { sound.treasure(); invChanged = true; } else sound.tick();
        }
        else if (e.type === 'travel') { renderer.snapCamera(); sound.recall('done'); hud.toast('傳送到另一個據點'); }
        else if (e.type === 'boss') {
          if (e.phase === 'spawn') { sound.roar(); hud.toast('燈脈守望者甦醒了！', 2600); invChanged = true; }
          else if (e.phase === 'phase2') { sound.roar(); hud.toast('鐵籠碎裂——守望者發狂了！', 2400); }
          else if (e.phase === 'defeated') { sound.victory(); hud.toast('擊敗了燈脈守望者！（日誌：首領擊敗）', 3200); }
          else hud.toast('燈脈守望者離開了');
        }
        else {
          if (e.type === 'mine' && e.tile === T.CRACKED_STONE) { sound.crumble(); hud.toast('裂紋石碎了——後面好像是空的'); }
          else if (e.type === 'place' && e.tile === T.ROPE) sound.tick();
          invChanged = true;
        }
      }
      if (invChanged) hud.refresh();
    }
    renderer.render(paused || talkPaused ? 0 : dt);
    hud.tick();
    levels.tick(dt);
    ui.tick(dt);
    settleUi.tick();
    folkUi.tick();
    calendar.tick();
    const tm = performance.now();
    mapCache.update(fullmap.isOpen ? 64 : 16);
    if (fullmap.isOpen) fullmap.draw();
    else if ((frames & 3) === 0) minimap.draw();
    mapWork[frames % WINDOW] = performance.now() - tm;
    work[frames % WINDOW] = performance.now() - t0;
    frames++;
  };
  raf = requestAnimationFrame(frame);

  const sorted = new Float32Array(WINDOW);
  /** 最近 WINDOW 幀的第 q 分位數 */
  const quantile = (a: Float32Array, q: number): number => {
    const n = Math.min(frames, WINDOW);
    if (!n) return 0;
    const s = sorted.subarray(0, n);
    s.set(a.subarray(0, n));
    s.sort();
    return s[Math.min(n - 1, Math.floor(q * n))];
  };
  const avg = (a: Float32Array): number => {
    const n = Math.min(frames, WINDOW);
    if (!n) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i];
    return s / n;
  };

  const handle: DelveHandle = {
    game, renderer, hud, ui, settleUi, folkUi, calendar, sound, levels,
    map: { cache: mapCache, minimap, full: fullmap },
    stats: () => {
      const f = avg(gaps);
      return {
        avgWorkMs: avg(work), avgFrameMs: f, fps: f > 0 ? 1000 / f : 0, frames,
        lightMs: renderer.stats.lightMs, cachedChunks: renderer.stats.cached, mapMs: avg(mapWork),
        liquidSimMs: game.liquids.stats.ms, liquidProcessed: game.liquids.stats.processed, liquidActive: game.liquids.activeCount,
        liquidDrawMs: renderer.stats.liquidMs,
        p95WorkMs: quantile(work, 0.95), maxWorkMs: quantile(work, 1),
      };
    },
    setPaused: (p) => {
      menuPaused = p;
      if (p && levels.isOpen) levels.setOpen(false);
      paused = menuPaused || fullmap.isOpen || levels.isOpen;
      if (paused) controls.releaseAll();
      last = performance.now();
    },
    get paused() { return paused; },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      LIVE.handles--;
      cancelAnimationFrame(raf);
      endLoop(lid);
      // 開著的面板收起來、遊戲寫在根元素上的狀態清掉（回到標題後再開局是乾淨的）
      if (fullmap.isOpen) setMap(false);
      if (ui.loreOpen) ui.closeLore();
      if (ui.journalOpen) ui.setJournal(false);
      if (calendar.isOpen) calendar.setOpen(false);
      hud.setChest(false);
      hud.setInventory(false);
      for (const k of ['chest', 'boss', 'dead', 'forge', 'map']) delete root.dataset[k];
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      controls.destroy();
      zIn?.removeEventListener('click', onZin);
      zOut?.removeEventListener('click', onZout);
      mmIn?.removeEventListener('click', onMmIn);
      mmOut?.removeEventListener('click', onMmOut);
      mapBtn?.removeEventListener('click', onMapBtn);
      mmCanvas.removeEventListener('click', onMapBtn);
      aimBtn?.removeEventListener('click', onAim);
      root.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      fullmap.destroy();
      settleUi.destroy();
      folkUi.destroy();
      ui.destroy();
      calendar.destroy();
      levels.destroy();
      sound.destroy();
      hud.destroy();
      renderer.destroy();
    },
  };
  return handle;
}
