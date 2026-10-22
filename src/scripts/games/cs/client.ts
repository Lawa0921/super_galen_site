import { armoryOffer, currency } from './armory';
import { createMatch, stepMatch, buyWeapon, WEAPONS, holdsGrenade, type Match, type Team, type WeaponId, type Input, type GrenadeId } from './engine';
import { GRENADES, GRENADE_ORDER, THROW, flashAmount } from './grenades';
import { heldDisplay, deathCause } from './utility-hud';
import { botInputs } from './ai';
import { MAP } from './map';
import { GameRenderer } from './renderer';
import { RenderSchedule } from './render-schedule';
import { CombatAudio, worldImpactCue, worldShotCue } from './audio';
import { HudLists } from './hud-lists';
import { CombatFeedback, ReloadFeedback, hurtDirection, crosshairSpread } from './feedback';
import { resultReason, formatClock, frameSeconds, isScopeActive } from './presentation';
import { useSkinCandidate } from './skin-candidate-option';
import { SpectatorState, selectViewActor } from './spectator';
import { AllyMarkers } from './ally-markers';
import { capturesKey, keyboardInput, slotForKey, wheelSlot } from './keyboard-input';

export async function boot() {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`cs-${id}`) as T;
  const root = get('root'), canvas = get<HTMLCanvasElement>('canvas');
  const ui = { menu: get('menu'), hud: get('hud'), shop: get('shop'), pause: get('pause'), result: get('result'), scoreboard: get('scoreboard'), death: get('death') };
  const audio = new CombatAudio(), keys = new Set<string>();
  let renderer: GameRenderer | undefined, match: Match | null = null, team: Team = 'attack';
  let paused = false, lockPending = false, fire = false, aim = false, yaw = 0, pitch = 0, sensitivity = 1, lastTime = performance.now(), frame = 0, disposed = false;
  let accumulator = 0, lastHud = 0, lastPhase = '', lastBeep = -1, resultAt = 0;
  const feedback = new CombatFeedback();
  const reloadFeedback = new ReloadFeedback();
  const spectator = new SpectatorState();
  const renderSchedule = new RenderSchedule();
  let reloadPending = false;
  // Slot keys / wheel latch until a simulation step consumes them, like reload.
  let equipPending: 'gun' | GrenadeId | null = null;
  let lastBlast = 0, lastPin = -1, lastThrow = -1, lastFlashUntil = 0, lastFlashView = -1, afterimagePending = false;
  const bounces = new Map<number, number>();
  const afterimage = get<HTMLCanvasElement>('afterimage').getContext('2d');
  let lastScope = false;
  let lastViewId: number | undefined, lastViewWeapon: WeaponId | undefined;
  const radar = get<HTMLCanvasElement>('radar'), mapContext = radar.getContext('2d')!;
  const controller = new AbortController(), options = { signal: controller.signal };
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-buy]')];
  const hudLists = new HudLists(get('feed'), get('score-rows'));
  const allyMarkers = new AllyMarkers(get('allies'));
  const clearInput = () => { keys.clear(); fire = false; aim = false; reloadPending = false; equipPending = null; };
  const clearFeedback = () => {
    feedback.clear(match); reloadFeedback.clear(match, match ? selectViewActor(match, spectator.viewId) : undefined); renderer?.clearTransient(match);
    renderSchedule.invalidate();
    root.dataset.feedback = 'none'; root.dataset.hurt = 'none'; root.dataset.spread = '0';
    get('hitmarker').classList.remove('cs-hit', 'cs-head', 'cs-kill'); get('damage').classList.remove('cs-hurt', 'cs-heavy');
    get('hit-feedback').textContent = '';
  };
  const setText = (id: string, value: string | number) => { const node = get(id), text = String(value); if (node.textContent !== text) node.textContent = text; };
  const persistSettings = () => { try { localStorage.setItem('breach-point.settings', JSON.stringify({ sensitivity, volume: audio.volume, quality: get<HTMLSelectElement>('quality').value })); } catch { /* Private mode still supports play. */ } };
  try {
    const saved = JSON.parse(localStorage.getItem('breach-point.settings') ?? '{}');
    if (Number.isFinite(saved.sensitivity)) sensitivity = Math.max(.3, Math.min(2.5, saved.sensitivity));
    if (Number.isFinite(saved.volume)) audio.volume = Math.max(0, Math.min(1, saved.volume));
    if (saved.quality === 'low') get<HTMLSelectElement>('quality').value = 'low';
  } catch { /* Ignore corrupt settings. */ }
  get<HTMLInputElement>('sensitivity').value = String(sensitivity); get<HTMLInputElement>('volume').value = String(audio.volume);
  get('sensitivity').addEventListener('input', () => { sensitivity = Number(get<HTMLInputElement>('sensitivity').value); persistSettings(); }, options);
  get('volume').addEventListener('input', () => { audio.volume = Number(get<HTMLInputElement>('volume').value); persistSettings(); }, options);
  get('quality').addEventListener('change', () => { renderer?.quality(get<HTMLSelectElement>('quality').value === 'high'); renderSchedule.invalidate(); persistSettings(); }, options);
  const pause = (reason = '單人遊戲已暫停。') => {
    if (!match) return;
    if (match.phase === 'match-over') { clearInput(); clearFeedback(); return; }
    paused = true; clearInput(); clearFeedback(); ui.pause.hidden = false; ui.scoreboard.hidden = true;
    setText('pause-reason', reason); if (document.pointerLockElement) document.exitPointerLock();
  };
  const lock = async () => {
    if (lockPending || !match || match.actors[0].hp <= 0) return;
    lockPending = true;
    try {
      await canvas.requestPointerLock();
      if (disposed || !match || paused || match.actors[0].hp <= 0) document.exitPointerLock();
    }
    catch { pause('尚未取得滑鼠控制，請按「繼續行動」再試一次。'); }
    finally { lockPending = false; }
  };
  const start = () => {
    match = createMatch(team); paused = false; clearInput(); accumulator = 0; lastBlast = 0; bounces.clear(); lastFlashUntil = 0; lastFlashView = -1;
    spectator.update(match);
    yaw = match.actors[0].yaw; pitch = 0; lastPhase = ''; lastBeep = -1; clearFeedback();
    ui.menu.hidden = true; ui.hud.hidden = false; ui.pause.hidden = true; ui.result.hidden = true; ui.shop.hidden = false;
    void audio.unlock().catch(() => {}); updateHud();
  };
  const quit = () => {
    match = null; paused = false; clearInput(); clearFeedback(); if (document.pointerLockElement) document.exitPointerLock();
    spectator.update(null); delete root.dataset.life; delete root.dataset.spectating;
    for (const node of Object.values(ui)) node.hidden = true; ui.menu.hidden = false; root.dataset.phase = 'menu'; root.classList.remove('cs-aiming', 'cs-scoped');
  };
  get('start').addEventListener('click', start, options); get('restart').addEventListener('click', start, options);
  get('quit').addEventListener('click', quit, options); get('result-menu').addEventListener('click', quit, options);
  get('deploy').addEventListener('click', () => { if (!match) return; ui.shop.hidden = true; match.timer = 0; paused = false; clearInput(); void lock(); }, options);
  get('pause-open').addEventListener('click', () => pause(), options);
  get('resume').addEventListener('click', () => { paused = false; ui.pause.hidden = true; clearInput(); if (ui.shop.hidden) void lock(); }, options);
  const changeSpectator = (direction: -1 | 1) => { if (match && !paused && spectator.cycle(match, direction)) updateHud(); };
  get('spectate-prev').addEventListener('click', () => changeSpectator(-1), options);
  get('spectate-next').addEventListener('click', () => changeSpectator(1), options);
  document.querySelectorAll<HTMLButtonElement>('[data-team]').forEach(button => button.addEventListener('click', () => {
    team = button.dataset.team as Team;
    document.querySelectorAll('[data-team]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  }, options));
  for (const button of buttons) button.addEventListener('click', () => {
    const item = button.dataset.buy as WeaponId | 'armor' | GrenadeId;
    if (match && buyWeapon(match, 0, item)) { audio.tone(720, .06); setText('shop-status', item === 'armor' ? '護甲已補滿。' : Object.hasOwn(GRENADES, item) ? `已購買 ${GRENADES[item as GrenadeId].name}。戰鬥中按 4 或滾輪切換投擲物。` : `已裝備 ${WEAPONS[item as WeaponId].name}。`); updateHud(); }
  }, options);
  for (const id of ['settings-open', 'pause-settings']) get(id).addEventListener('click', () => get<HTMLDialogElement>('settings').showModal(), options);
  get('help-open').addEventListener('click', () => get<HTMLDialogElement>('help').showModal(), options);
  get('retry').addEventListener('click', () => location.reload(), options);
  canvas.addEventListener('click', () => { if (match && !paused && ui.shop.hidden && match.phase === 'live' && !document.pointerLockElement) void lock(); }, options);
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && match && match.actors[0].hp > 0 && !paused && ui.shop.hidden && match.phase === 'live') pause(); }, options);
  document.addEventListener('mousemove', e => { if (match && match.actors[0].hp > 0 && !paused && document.pointerLockElement === canvas) { yaw -= e.movementX * .002 * sensitivity; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * .002 * sensitivity)); } }, options);
  document.addEventListener('mousedown', e => { if (match && match.actors[0].hp > 0 && document.pointerLockElement === canvas && !paused) { if (e.button === 0) fire = true; if (e.button === 2) aim = true; } }, options);
  document.addEventListener('mouseup', e => { if (e.button === 0) fire = false; if (e.button === 2) aim = false; }, options);
  document.addEventListener('wheel', e => {
    if (!match || match.actors[0].hp <= 0 || document.pointerLockElement !== canvas || paused || e.deltaY === 0) return;
    const p = match.actors[0]; equipPending = wheelSlot({ ...p, held: equipPending ?? p.held }, e.deltaY > 0 ? 1 : -1);
  }, options);
  canvas.addEventListener('contextmenu', e => e.preventDefault(), options);
  document.addEventListener('keydown', e => {
    if (!match || (e.target instanceof HTMLElement && /INPUT|SELECT/.test(e.target.tagName)) || document.querySelector('dialog[open]')) return;
    if (capturesKey(e)) e.preventDefault();
    if (e.code === 'Escape' && !paused) { e.preventDefault(); pause(); return; }
    if (paused) return;
    if (e.code === 'Tab') ui.scoreboard.hidden = false;
    if (match.actors[0].hp <= 0) {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); if (!e.repeat) changeSpectator(e.code === 'ArrowLeft' ? -1 : 1); }
      return;
    }
    keys.add(e.code);
    if (e.code === 'KeyR') reloadPending = true;
    const slot = e.repeat ? null : slotForKey(e.code, { ...match.actors[0], held: equipPending ?? match.actors[0].held });
    if (slot) equipPending = slot;
    if (e.code === 'KeyB' && match.phase === 'buy') { ui.shop.hidden = false; clearInput(); if (document.pointerLockElement) document.exitPointerLock(); }
  }, options);
  document.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') ui.scoreboard.hidden = true; }, options);
  window.addEventListener('blur', () => pause('視窗失去焦點，已替你暫停。'), options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('切換分頁，已替你暫停。'); renderSchedule.invalidate(); }, options);
  window.addEventListener('resize', () => { renderer?.resize(); renderSchedule.invalidate(); }, options);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => renderSchedule.invalidate(), options);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause('3D 繪圖環境中斷，請重新整理頁面。'); }, options);

  function drawRadar(m: Match) {
    const c = mapContext, sx = radar.width / 52, sz = radar.height / 60;
    const x = (value: number) => (value + 26) * sx, z = (value: number) => (value + 30) * sz;
    c.clearRect(0, 0, radar.width, radar.height); c.strokeStyle = '#76909455'; c.strokeRect(x(-24), z(-28), 48 * sx, 56 * sz);
    c.fillStyle = '#81beca33'; c.strokeStyle = '#81beca88';
    for (const area of MAP.elevations) {
      c.fillRect(x(area.minX), z(area.minZ), (area.maxX-area.minX)*sx, (area.maxZ-area.minZ)*sz);
      c.strokeRect(x(area.minX), z(area.minZ), (area.maxX-area.minX)*sx, (area.maxZ-area.minZ)*sz);
      if (area.steps) for(let i=1;i<4;i++) { const zz=z(area.minZ+(area.maxZ-area.minZ)*i/4);c.beginPath();c.moveTo(x(area.minX),zz);c.lineTo(x(area.maxX),zz);c.stroke(); }
    }
    c.fillStyle = '#68777b'; for (const b of MAP.obstacles) c.fillRect(x(b.minX), z(b.minZ), (b.maxX - b.minX) * sx, (b.maxZ - b.minZ) * sz);
    c.font = 'bold 12px monospace'; c.textAlign = 'center';
    for (const s of MAP.sites) { c.fillStyle = '#e8ac5725'; c.beginPath(); c.arc(x(s.x), z(s.z), 13, 0, Math.PI * 2); c.fill(); c.fillStyle = '#efba69'; c.fillText(s.id, x(s.x), z(s.z) + 4); }
    for (const p of m.actors) {
      if (p.hp <= 0 || p.team !== m.actors[0].team) continue;
      c.fillStyle = p.id === 0 ? '#ffffff' : '#81beca'; c.beginPath(); c.arc(x(p.x), z(p.z), p.id === 0 ? 3.5 : 2.5, 0, Math.PI * 2); c.fill();
      if (p.id === 0) { c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(x(p.x), z(p.z)); c.lineTo(x(p.x - Math.sin(yaw) * 3), z(p.z - Math.cos(yaw) * 3)); c.stroke(); }
    }
    if (m.bomb.planted || (m.bomb.carrier === null && m.actors[0].team === 'attack')) { c.fillStyle = '#ff6655'; c.fillRect(x(m.bomb.x) - 3, z(m.bomb.z) - 3, 6, 6); }
  }
  function updateHud() {
    if (!match) return;
    const m = match, p = m.actors[0]; root.dataset.phase = m.phase; root.dataset.playerX = p.x.toFixed(2); root.dataset.playerZ = p.z.toFixed(2); root.dataset.playerSpeed = Math.hypot(p.vx, p.vz).toFixed(2);
    const dead = p.hp <= 0, view = selectViewActor(m, spectator.viewId);
    root.dataset.life = dead ? 'dead' : 'alive';
    root.dataset.spectating = String(dead && view.id !== p.id);
    ui.death.hidden = !dead || m.phase === 'buy';
    if (dead) {
      const death = spectator.death, available = spectator.available(m);
      setText('death-summary', death ? `${death.killerName} 以 ${deathCause(death)} 擊殺了你${death.head ? ' · 爆頭' : ''}` : '你已退出本回合戰鬥');
      setText('spectating-name', view.id !== p.id ? view.name : available ? '正在切換隊友視角…' : '沒有存活隊友');
      setText('spectating-details', view.id !== p.id ? `生命 ${view.hp} · 護甲 ${Math.ceil(view.armor)} · ${WEAPONS[view.weapon].name}` : '下一回合重新出發');
      get<HTMLButtonElement>('spectate-prev').disabled = get<HTMLButtonElement>('spectate-next').disabled = available < 2 || m.phase !== 'live';
    }
    setText('team', p.team === 'attack' ? '攻方 / ATTACK' : '守方 / DEFEND'); setText('round-number', `ROUND ${String(m.round).padStart(2, '0')}`);
    setText('score-attack', m.scores.attack); setText('score-defend', m.scores.defend); setText('phase-label', m.bomb.planted ? '炸彈已安裝' : m.phase === 'buy' ? '準備 / 購買' : '先取 4 回合');
    setText('timer', formatClock(m.bomb.planted ? m.bomb.fuse : m.timer)); setText('health', view.hp); setText('armor', Math.ceil(view.armor)); setText('money', `$${p.money}`);
    const held = heldDisplay(view); setText('weapon-name', held.name); setText('ammo', held.ammo); setText('reserve', held.reserve);
    for (const id of GRENADE_ORDER) {
      const count = String(view.grenades?.[id] ?? 0), slot = get(`utility-${id}`).parentElement!;
      setText(`utility-${id}`, count); if (slot.dataset.count !== count) slot.dataset.count = count;
      const active = String(view.held === id); if (slot.dataset.held !== active) slot.dataset.held = active;
    }
    setText('objective', dead ? '觀戰隊友 · 等待下一回合' : m.bomb.planted ? (p.team === 'defend' ? '拆除炸彈！靠近後站定，按住 E' : '守住炸彈，阻止對方拆除') : p.team === 'attack' ? (m.bomb.carrier === 0 ? '你攜帶炸彈 · 前往 A 或 B，站定按住 E' : '掩護炸彈手，突破 A 或 B') : '守住 A / B 爆破點，阻止敵方安裝炸彈');
    const atSite = MAP.sites.some(s => Math.hypot(s.x - p.x, s.z - p.z) < s.radius), atBomb = Math.hypot(m.bomb.x - p.x, m.bomb.z - p.z) < 2;
    get('action').hidden = dead && (view.hp <= 0 || view.reload <= 0);
    setText('action', view.reload > 0 ? `${dead ? '隊友' : ''}換彈中 ${view.reload.toFixed(1)}s` : dead ? '' : p.interaction > 0 ? (m.bomb.planted ? '拆彈中 · 保持按住 E' : '安裝中 · 保持按住 E') : (atSite && m.bomb.carrier === 0) || (atBomb && m.bomb.planted && p.team === 'defend') ? '站定並按住 E' : '');
    const progress = get<HTMLProgressElement>('interaction'); progress.hidden = dead || p.interaction <= 0; progress.value = p.interaction / (m.bomb.planted ? 5 : 3);
    get('crosshair').hidden = view.hp <= 0 || m.phase !== 'live'; root.classList.toggle('cs-aiming', (view === p ? aim && !holdsGrenade(p) : view.aim) && view.hp > 0);
    setText('shop-money', currency(p.money));
    setText('shop-timer', String(Math.ceil(m.timer)));
    const utility = GRENADE_ORDER.filter(id => p.grenades[id] > 0).map(id => `${GRENADES[id].short}×${p.grenades[id]}`).join(' ');
    setText('shop-loadout', `${WEAPONS[p.weapon].name} · ${p.armor > 0 ? `${Math.ceil(p.armor)} 護甲` : '無護甲'}${utility ? ` · ${utility}` : ''}`);
    for (const button of buttons) {
      const item = button.dataset.buy as WeaponId | 'armor' | GrenadeId, offer = armoryOffer(m, item);
      button.dataset.equipped = String(offer.state === 'equipped');
      button.dataset.offerState = offer.state;
      button.disabled = !offer.enabled;
      const label = button.querySelector('[data-offer]');
      if (label && label.textContent !== offer.label) label.textContent = offer.label;
    }
    hudLists.update(m);
    drawRadar(m);
    if (lastPhase !== m.phase) {
      lastPhase = m.phase;
      if (m.phase === 'buy') { setText('shop-status', '點選武器即可裝備。陣亡後，下回合恢復手槍。'); ui.result.hidden = true; ui.shop.hidden = false; yaw = p.yaw; pitch = 0; clearInput(); clearFeedback(); if (document.pointerLockElement) document.exitPointerLock(); }
      if (m.phase === 'live') { ui.shop.hidden = true; if (!dead && !document.pointerLockElement && !lockPending) pause('準備時間結束。按「繼續行動」控制滑鼠並開始。'); }
      if (m.phase === 'round-over' || m.phase === 'match-over') {
        ui.shop.hidden = true; ui.result.hidden = true; resultAt = performance.now() + 240; clearInput(); if (document.pointerLockElement) document.exitPointerLock();
        setText('result-eyebrow', m.phase === 'match-over' ? 'OPERATION COMPLETE' : 'ROUND COMPLETE');
        setText('result-title', m.winner === p.team ? (m.phase === 'match-over' ? '行動成功' : '拿下這一回合') : (m.phase === 'match-over' ? '行動失利' : '重整，準備下一回合'));
        setText('result-reason', resultReason(m.reason, m.winner === p.team));
        setText('result-score', `${m.scores.attack} : ${m.scores.defend}`);
        get('restart').hidden = m.phase !== 'match-over'; get('result-menu').hidden = m.phase !== 'match-over'; audio.tone(m.winner === p.team ? 660 : 180, .4);
      }
    }
    if (m.phase === 'round-over') setText('next-round', `${Math.ceil(m.timer)} 秒後開始下一回合`);
    if (m.phase === 'match-over') setText('next-round', `擊殺 ${p.kills} · 陣亡 ${p.deaths}`);
  }
  function animate(now: number) {
    if (disposed) return;
    const elapsed = now - lastTime;
    const dt = frameSeconds(elapsed); lastTime = now;
    if (match && !paused) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        const inputs = botInputs(match);
        // A quick down/up pair can occur between rendered frames. Keep reload
        // until a simulation step consumes it; pause/new rounds clear the latch.
        const input: Partial<Input> = { ...keyboardInput(keys), yaw, pitch, fire, aim, reload: reloadPending || keys.has('KeyR'), ...(equipPending ? { equip: equipPending } : {}) };
        inputs[0] = input; stepMatch(match, inputs, 1 / 60); reloadPending = false; equipPending = null; accumulator -= 1 / 60;
      }
      const p = match.actors[0];
      const transition = spectator.update(match);
      if (transition === 'died') {
        clearInput(); ui.scoreboard.hidden = true;
        if (document.pointerLockElement) document.exitPointerLock();
        audio.death();
      } else if (transition === 'revived') clearInput();
      const listener = selectViewActor(match, spectator.viewId), listenerYaw = listener.id === p.id ? yaw : listener.yaw;
      for (const cue of reloadFeedback.consume(match, listener)) audio.reload(cue, listener.weapon);
      for (const shot of feedback.consume(match, now)) {
        if (!shot.grenade) {
          const sound = worldShotCue(shot, listener, listenerYaw);
          if (sound) audio.shot(sound.distance, shot.weapon, sound.pan, sound.occluded, shot.actor === listener.id);
          audio.impact(worldImpactCue(shot, listener, listenerYaw));
        }
        if (shot.actor === p.id && shot.damage > 0) audio.hit(shot.head, shot.killed);
        if (shot.target === p.id && shot.damage > 0) audio.hurt(shot.damage, Math.sin(yaw - Math.atan2(shot.tx - shot.x, shot.tz - shot.z)));
      }
      // Utility audio: detonations, bounces, the viewed thrower's pin and release, flash ringing.
      for (const blast of match.blasts) if (blast.id > lastBlast) { lastBlast = blast.id; audio.blast(blast.kind, worldShotCue(blast, listener, listenerYaw)); }
      for (const g of match.grenades) if (g.bounces > (bounces.get(g.id) ?? 0)) { bounces.set(g.id, g.bounces); audio.bounce(worldShotCue(g, listener, listenerYaw)); }
      if (bounces.size > 24) for (const id of bounces.keys()) if (!match.grenades.some(g => g.id === id)) bounces.delete(id);
      if (listener.primedAt >= 0 && listener.primedAt !== lastPin) { lastPin = listener.primedAt; audio.pin(); }
      if (listener.thrownAt > lastThrow) { lastThrow = listener.thrownAt; audio.tone(260, .14, .06, .2, 120); }
      if (listener.id !== lastFlashView) { lastFlashView = listener.id; lastFlashUntil = listener.flashUntil; }
      else if (listener.flashUntil > lastFlashUntil + .01) {
        lastFlashUntil = listener.flashUntil;
        audio.flashRing(Math.min(1, listener.flashDuration / THROW.flashMax), listener.flashDuration);
        afterimagePending = listener.flashDuration > .8;
      }
      if (match.bomb.planted) { const beat = Math.floor(match.time * (match.bomb.fuse < 10 ? 4 : 1)); if (beat !== lastBeep) { audio.tone(950, .06, .16); lastBeep = beat; } }
    }
    const hit = now < feedback.hitUntil, hurt = now < feedback.hurtUntil;
    const hitState = hit ? feedback.kind : 'none', hurtState = hurt ? hurtDirection(feedback.hurtBearing, yaw) : 'none';
    if (root.dataset.feedback !== hitState) root.dataset.feedback = hitState;
    if (root.dataset.hurt !== hurtState) root.dataset.hurt = hurtState;
    get('hitmarker').classList.toggle('cs-hit', hit); get('hitmarker').classList.toggle('cs-head', feedback.kind === 'head'); get('hitmarker').classList.toggle('cs-kill', feedback.kind === 'kill');
    get('damage').classList.toggle('cs-hurt', hurt); get('damage').classList.toggle('cs-heavy', hurt && feedback.strength > .7);
    setText('hit-feedback', hit ? feedback.kind === 'kill' ? `擊殺 · ${match?.actors.find(a => a.id === feedback.target)?.name ?? ''}` : `${feedback.kind === 'head' ? '爆頭' : '命中'} · −${feedback.damage}` : '');
    const view = match ? selectViewActor(match, spectator.viewId) : null;
    // Scope masking and viewmodel visibility must change on the same frame;
    // the slower text/radar refresh can otherwise leave an empty optical view.
    const scoped = !!view && !!match && isScopeActive(view.weapon, view === match.actors[0] ? aim && !holdsGrenade(view) : view.aim, view.hp, match.phase, view.reload);
    // CS2 flash: white veil, then the frozen last frame fades out through it.
    const white = view && match && !paused ? flashAmount(view, match.time) : 0, flashState = white > .01 ? 'on' : 'off';
    if (root.dataset.flash !== flashState) root.dataset.flash = flashState;
    const flashNode = get('flash'), opacity = white > .01 ? white.toFixed(3) : '0';
    if (flashNode.style.opacity !== opacity) flashNode.style.opacity = opacity;
    get('flash-white').style.opacity = Math.max(0, Math.min(1, white * 1.4 - .4)).toFixed(3);
    if (scoped !== lastScope) { root.classList.toggle('cs-scoped', scoped); lastScope = scoped; }
    const spread = String(view && !paused ? crosshairSpread(view) : 0);
    if (root.dataset.spread !== spread) root.dataset.spread = spread;
    if (now - lastHud > 80 || view?.id !== lastViewId || view?.weapon !== lastViewWeapon) {
      updateHud(); lastHud = now; lastViewId = view?.id; lastViewWeapon = view?.weapon;
    }
    if (match && !paused && (match.phase === 'round-over' || match.phase === 'match-over') && now >= resultAt) ui.result.hidden = false;
    // A paused match has no animation to advance. Keep its last canvas image,
    // but redraw after display changes and immediately on the first live frame.
    if (renderer?.observeFrame(elapsed / 1000, !!match && match.phase === 'live' && !paused && !document.hidden, view?.id ?? null)) renderSchedule.invalidate();
    if (renderer && renderSchedule.frame(paused, !document.hidden)) {
      renderer.render(match, paused ? 0 : dt, { yaw, pitch }, aim && !(match && holdsGrenade(match.actors[0])), spectator.viewId);
      if (afterimagePending && afterimage) { afterimage.drawImage(canvas, 0, 0, afterimage.canvas.width, afterimage.canvas.height); afterimagePending = false; }
      allyMarkers.update(match, view, renderer.camera);
    }
    frame = requestAnimationFrame(animate);
  }
  const dispose = () => { disposed = true; cancelAnimationFrame(frame); controller.abort(); renderer?.dispose(); audio.dispose(); if (document.pointerLockElement === canvas) document.exitPointerLock(); };
  window.addEventListener('pagehide', dispose, { once: true });
  try {
    let candidateLoader;
    if (import.meta.env.DEV && useSkinCandidate(import.meta.env.DEV, location.search)) {
      candidateLoader = (await import('./skin-candidate')).loadSkinCandidate;
      get('candidate-notice').hidden = false;
    }
    if (disposed) return;
    renderer = new GameRenderer(canvas, candidateLoader); renderer.quality(get<HTMLSelectElement>('quality').value === 'high'); await renderer.load();
    if (disposed) { renderer.dispose(); return; }
    get('loading').hidden = true; get<HTMLButtonElement>('start').disabled = false;
    lastTime = performance.now(); frame = requestAnimationFrame(animate);
  } catch (error) {
    renderer?.dispose(); renderer = undefined;
    if (disposed) return;
    get('loading').hidden = true; get('load-error').hidden = false;
    setText('error-text', error instanceof Error && /WebGL|context/i.test(error.message) ? '瀏覽器無法啟動 3D，請開啟硬體加速或使用支援 WebGL 的瀏覽器。' : '場景或模型載入失敗，請確認連線後重試。');
    console.error('Breach Point loading failed:', error);
  }
}
