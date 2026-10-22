// avatarDraw.ts — 畫一個玩家（co-op M-C2 D4 AvatarPainter）：本地玩家和遠端玩家走同一條路徑，
//   輸入是 PlayerPose（engine/pose.ts）+ 紙娃娃樣子 + 每個玩家自己的 AvatarState（動畫器 / 受傷時間 / 揮鎬相位 / 面向 / 竿尖 / 輪廓光）。
//   後手臂 → 身體 → 揮劍殘影 → 前手臂（或攀邊的手臂）→ 頭 → 攀邊手掌 → 手上的東西（一律在臉前面）。
//   不碰 game、不碰亂數：世界只透過 AvatarWorld 問（繩頂要看哪幾格可以爬）。
import { ITEMS, type ItemId } from '../engine/items';
import { PLAYER_H, PLAYER_W, TILE_SIZE } from '../engine/constants';
import type { DollLook } from '../engine/doll';
import type { PlayerPose } from '../engine/pose';
import { armAngles, carryArm, carryStyle, flameFrame, heldCarryArm, swingAngle, SWING_RATE, type PoseKind } from './anim';
import { clearShiftAll, faceGuard } from './heldLayout';
import { skinRamp } from './avatarPalette';
import { FW, FH, type Sprites } from './sprites';
import { PlayerAnimator, atRopeTop, blinkAt, type PlayerAnim } from './playerAnim';
import { MANTLE_KNEE_X, mantleLean, ROPE_HAND_HI, SHEET, type SheetAnim } from './avatarArt';
import { previewArms } from './dollPreview';
import { aimArmDeg, attackArmDeg, spearThrust } from './combatAnim';

const S = TILE_SIZE;

/** 這一幀玩家畫在哪（光照遮罩之後補畫暗處輪廓光用） */
export interface RimDraw { cx: number; bottom: number; facing: number; fi: number; x: number; y: number; canvas: HTMLCanvasElement }
/** 影格表第幾格、原點（腳底中心，緩衝座標）、影格偏移、面向（e2e 檢查武器不蓋臉用） */
export interface PlayerDraw { fi: number; x: number; y: number; ox: number; oy: number; facing: number }
/** 手上的一張圖（局部座標，面向右） */
export interface HeldPart { c: HTMLCanvasElement; x: number; y: number }

/** 每個玩家一份（本地一份、遠端每個 pid 一份） */
export interface AvatarState {
  animator: PlayerAnimator;
  /** 最近一次受傷的時間（time 秒） */
  hurtAt: number;
  swingPhase: number;
  facing: 1 | -1;
  /** 竿尖（世界 px；畫釣線用）；沒拿釣竿 = null */
  rodTip: { x: number; y: number } | null;
  rim: RimDraw | null;
  /**
   * 上次看到的 pose.hurt（挨打計數）；null = 還沒看過。計數變了 → hurtAt = 現在（第一次看到不算）。
   * 單機 / 房主的本地玩家由 hurt 事件設定 hurtAt，renderer 每幀先把它對齊成 pose.hurt（不會再觸發一次）
   */
  hurtSeen: number | null;
}
export function newAvatarState(): AvatarState {
  return { animator: new PlayerAnimator(), hurtAt: -99, swingPhase: 0, facing: 1, rodTip: null, rim: null, hurtSeen: null };
}

/** painter 要問世界的事（只傳函式，不傳整個 game） */
export interface AvatarWorld { isClimbable(tx: number, ty: number): boolean }

export interface AvatarDrawOut {
  anim: PlayerAnim;
  /** 動畫提示（換手 → 攀爬音效 / 繩屑；只有本地玩家用） */
  cue: 'grip' | null;
  /** 這一幀畫的原點（腳底中心，含攀邊傾身）；閃爍那幀沒畫 = null */
  at: { x: number; y: number } | null;
  /** 有手臂的影格才有；null = 這一幀沒更新（閃爍 / 爬繩 / 倒地：本地沿用上一幀的值） */
  playerDraw: PlayerDraw | null;
  heldDraws: HeldPart[] | null;
  /** 這一幀手上的暖光（火把 / 提燈）/ 冷光（水晶法杖尖端），世界 px */
  torches: { x: number; y: number }[];
  cool: { x: number; y: number }[];
}

/** 玩家中心欄這段繩子最上面那格的頂端（世界 px） */
function ropeTopY(world: AvatarWorld, p: { x: number; y: number; w: number; h: number }): number {
  const tx = Math.floor((p.x + p.w / 2) / S);
  let ty = Math.floor((p.y + p.h - 0.01) / S);
  while (ty >= 0 && !world.isClimbable(tx, ty)) ty--;
  while (ty > 0 && world.isClimbable(tx, ty - 1)) ty--;
  return ty * S;
}

/**
 * 畫一個玩家（ctx 已是世界座標）。time = 動畫時鐘（renderer.clock，秒：眨眼 / 火焰 / 受傷）；
 * poseTime = pose.attack.at 的時鐘（世界時間秒：本地 / 房主 = game.time，客人看別人 = 跟身體內插同一個延遲時鐘）。
 * 揮擊進度 = (poseTime − at) / dur，夾在 [0, 1)；≥ 1 = 已經揮完，不畫。
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D, sp: Sprites, pose: PlayerPose, look: DollLook, key: string, st: AvatarState,
  dt: number, time: number, world: AvatarWorld, poseTime: number,
): AvatarDrawOut {
  const out: AvatarDrawOut = { anim: 'idle', cue: null, at: null, playerDraw: null, heldDraws: null, torches: [], cool: [] };
  st.rim = null;
  // 受傷姿勢：挨打計數變了才算（突進 / 重生的無敵時間不算）
  if (st.hurtSeen !== null && pose.hurt !== st.hurtSeen) st.hurtAt = time;
  st.hurtSeen = pose.hurt;
  const p = { x: pose.x, y: pose.y, w: PLAYER_W, h: PLAYER_H };
  const mt = pose.mantle;
  // 船上：站著不動的姿勢（船在走、人不踏步）
  const boating = pose.boating;
  const swim = !boating && pose.liquidFrac > 0.55 && !pose.onGround && !pose.climbing;
  const an = st.animator.update({
    dt, dead: pose.dead, climbing: pose.climbing, mantle: mt ? mt.p : null, onGround: boating || pose.onGround, vx: boating ? 0 : pose.vx, vy: boating ? 0 : pose.vy,
    swim, sinceHurt: time - st.hurtAt,
  });
  out.anim = an.anim;
  out.cue = an.cue;
  const a0 = pose.attack;
  const prog = a0 ? (poseTime - a0.at) / a0.dur : 1;
  const atk = a0 && prog < 1 ? { ...a0, progress: Math.max(0, prog) } : null;
  if (mt) st.facing = mt.dir;
  else if (atk) st.facing = atk.dir;
  else if (!pose.dead) {
    if (pose.vx > 8) st.facing = 1; else if (pose.vx < -8) st.facing = -1;
    if (pose.mining) st.facing = (pose.mining.x + 0.5) * S >= p.x + p.w / 2 ? 1 : -1;
    // 釣魚：面向浮標（拋竿時沿用遊戲的面向）
    else if (pose.fishing) st.facing = Math.abs(pose.fishing.x - (p.x + p.w / 2)) > 2 ? (pose.fishing.x >= p.x + p.w / 2 ? 1 : -1) : pose.facing;
  }
  const facing = st.facing;
  st.swingPhase = pose.mining ? (st.swingPhase + dt * SWING_RATE) % 1 : 0;
  // 受傷無敵時閃爍（倒地 / 縮身那一下不閃）
  if (!pose.dead && pose.iframes > 0 && an.anim !== 'hurt' && Math.floor(pose.iframes * 16) % 2 === 1) return out;
  const cx = Math.round(p.x + p.w / 2), bottom = Math.round(p.y + p.h + pose.gfxOffY);
  const ox = -FW / 2, oy = -FH;
  // 爬到繩頂：舉高的那隻手以上沒有繩子了 → 換成兩手抓在胸口的繩頂影格
  let sheetAnim: SheetAnim = an.anim === 'idle' && blinkAt(time) ? 'blink' : an.anim;
  let sheetFrame = an.frame;
  if (pose.climbing && atRopeTop(an.anim, bottom + oy + ROPE_HAND_HI, ropeTopY(world, p))) { sheetAnim = 'ropetop'; sheetFrame = Math.floor(time * 3) % 2; }
  const fi = SHEET[sheetAnim][0] + Math.min(sheetFrame, SHEET[sheetAnim][1] - 1);
  // 分幀烘焙：換裝那一幀只烘這一格 + 時間預算內的幾格（不會整張同步烘完卡住）
  const sheet = sp.sheetFor(look, key, fi);
  const meta = sheet.meta[fi];
  st.rim = { cx, bottom, facing, fi, x: ox + (meta.arms ? 0 : meta.ox ?? 0), y: oy, canvas: sheet.canvas };
  if (!meta.arms) {
    // 背面爬繩 / 掛著 / 倒地：手臂畫在影格裡，手上的東西收起來
    ctx.save(); ctx.translate(cx, bottom); ctx.scale(facing, 1);
    ctx.drawImage(sheet.canvas, fi * FW, 0, FW, FH, ox + (meta.ox ?? 0), oy, FW, FH);
    ctx.restore();
    st.rodTip = null;
    out.at = { x: cx, y: bottom };
    return out;
  }
  const kind: PoseKind = an.anim === 'walk' || an.anim === 'jump' || an.anim === 'fall' ? an.anim : 'idle';
  const local = an.anim === 'walk' || an.anim === 'idle' ? an.frame : 0;
  // 船上：手上不拿東西（不能挖 / 用道具）
  const held = pose.held && !boating ? pose.held : null;
  const heldDef = held ? ITEMS[held] : null;
  let swing: number | null = pose.mining ? swingAngle(st.swingPhase) : null;
  let blade: ItemId | null = null;
  let rot: { item: ItemId; base: number; push: number } | null = null;
  let throwMini: ItemId | null = null;
  if (atk) {
    swing = attackArmDeg(atk.kind, atk.progress, aimArmDeg(atk.angle, atk.dir));
    if (atk.kind === 'sword' || atk.kind === 'broadsword') blade = atk.item;
    else if (atk.kind === 'bow') rot = { item: atk.item, base: -Math.PI * 0.75, push: 0 };
    else if (atk.kind === 'staff') rot = { item: atk.item, base: -Math.PI / 4, push: 4 };
    else if (atk.kind === 'spear') rot = { item: atk.item, base: -Math.PI / 4, push: 4 + spearThrust(atk.progress) * 16 };
    else if (atk.progress < 0.5) throwMini = atk.item;
  }
  const special = an.anim === 'mantle' || an.anim === 'swim' || an.anim === 'hurt';
  if (special) { swing = null; blade = null; rot = null; throwMini = null; }
  const arms = special ? previewArms(an.anim as 'mantle' | 'swim' | 'hurt', an.frame) : armAngles(kind, local, swing);
  // 攀上邊緣（最後一格「站起來」以外）：手掌撐在牆角那一格上（手掌 3 寬：從牆邊往內），換算成影格座標
  // 牆角在胸口以下、手搆不到（繩頂旁的台面）→ 整個人往牆那邊傾幾格，手掌才落得到牆角上（不會浮在半空）
  let lean = 0, grip: ReturnType<Sprites['grip']> | null = null;
  if (mt && an.frame < 3) {
    const gx = Math.round((mt.edgeX + mt.dir - cx) * facing - ox), gy = Math.round(mt.edgeY - 1 - bottom - oy);
    const s0 = sp.shoulder(look, false);
    lean = mantleLean(gx, gy, { x: s0.x + meta.dx, y: s0.y + meta.dy });
    // 膝蓋上台那格：身體已經越過牆角，手改撐在身前的台面上（不會往後拉長）
    grip = sp.grip(look, key, meta, fi, Math.max(an.frame === 2 ? MANTLE_KNEE_X : 0, gx - lean), gy);
  }
  // 待機 / 走路 / 跳躍時，手上的鎬 / 武器也拿著（往前斜舉）；挖掘時換成背包裡最好的鎬、攻擊時用攻擊動畫
  const carry = !pose.mining && !atk && !special ? carryStyle(heldDef) : null;
  if (carry && carry !== 'mini') arms.front = carryArm(kind, arms.front);
  // 鎬：扛在身前、鎬頭朝上（不會拖在腳邊）
  // 釣竿：手往前平舉（竿子從手往前上方斜出去、不會蓋到大頭）
  if (carry === 'rod') arms.front = pose.fishing?.state === 'bite' ? 105 : 85;
  if (carry === 'pick') arms.front = (kind === 'jump' || kind === 'fall' ? 150 : 128) + (kind === 'walk' ? Math.round(Math.sin((local / 8) * Math.PI * 2) * 6) : 0);
  const showPick = special ? null : pose.mining ? pose.mining.pick : carry === 'pick' ? held : null;
  if (carry === 'blade') blade = held;
  const heldOther = !special && !pose.mining && !atk && held && carry !== 'rod' && ((!heldDef?.pick && !heldDef?.weapon) || carry === 'mini') ? held : null;
  // 火把 / 方塊：前手往前平舉（手在身體前面、離開臉）
  if (heldOther && kind !== 'jump' && kind !== 'fall') arms.front = heldCarryArm(heldOther === 'torch' || heldOther === 'lantern' ? 'torch' : 'mini') + Math.round(arms.front * 0.15);

  const bodyDy = meta.dy;
  const X = cx + lean * facing;
  out.playerDraw = { fi, x: X, y: bottom, ox, oy, facing };
  out.at = { x: X, y: bottom };
  const sb0 = sp.shoulder(look, true), sf0 = sp.shoulder(look, false);
  const sb = { x: sb0.x + meta.dx, y: sb0.y }, sf = { x: sf0.x + meta.dx, y: sf0.y };
  // 局部座標（面向右；畫的時候整個鏡像）：肩膀 / 自然的手的位置
  const sx = ox + sf.x, sy = oy + sf.y + bodyDy;
  const radA = (arms.front * Math.PI) / 180;
  const hx = Math.round(sx + Math.sin(radA) * sp.handReach), hy = Math.round(sy + Math.cos(radA) * sp.handReach);
  // ── 手上的東西：先算好要畫哪幾張、畫在哪（局部座標）。一律畫在頭和臉的前面 ──
  const parts: HeldPart[] = [];
  let glowAt: { x: number; y: number } | null = null, rodTipL: { x: number; y: number } | null = null;
  if (!grip && (showPick || blade)) { const it = sp.arm(look, key, false, showPick, arms.front, blade, true); parts.push({ c: it.canvas, x: sx - it.ox, y: sy - it.oy }); }
  if (heldOther === 'torch') parts.push({ c: sp.torches[flameFrame(time, 7, 3)], x: hx - 4, y: hy - 13 });
  else if (heldOther) parts.push({ c: sp.mini(heldOther), x: hx - 2, y: hy - 6 });
  if (throwMini) parts.push({ c: sp.mini(throwMini), x: hx - 2, y: hy - 5 });
  if (rot && atk) {
    // 弓 / 法杖 / 矛：轉到瞄準角（局部座標：面向左時角度鏡像），從肩膀沿瞄準方向推出去
    const la = facing > 0 ? atk.angle : Math.PI - atk.angle;
    const c = sp.rotatedIcon(rot.item, la, rot.base), ux = Math.cos(la), uy = Math.sin(la);
    const px = sx + ux * (sp.handReach + rot.push), py = sy + uy * (sp.handReach + rot.push);
    parts.push({ c, x: Math.round(px - c.width / 2), y: Math.round(py - c.height / 2) });
    if (rot.item === 'crystal_staff') glowAt = { x: px + ux * 8, y: py + uy * 8 };
  }
  if (carry === 'rotated' && held) {
    // 弓 / 法杖 / 矛拿在手上：法杖 / 矛朝上斜立、弓朝前（圖示中心沿著拿的方向往外推：握的那端在手上）
    const wk = heldDef?.weapon?.kind;
    const up = wk === 'bow' ? 0.3 : -Math.PI / 2 + 0.6, base = wk === 'bow' ? -Math.PI * 0.75 : -Math.PI / 4, push = wk === 'bow' ? 4 : 8;
    const c = sp.rotatedIcon(held, up, base);
    parts.push({ c, x: Math.round(hx - c.width / 2 + Math.cos(up) * push), y: Math.round(hy - c.height / 2 + Math.sin(up) * push) });
  }
  if (carry === 'rod' && held) {
    // 釣竿：往前斜舉（浮標在水上時比較平、上鉤時往上抬）；竿尖記下來畫釣線
    const fishing = pose.fishing;
    const up = fishing?.state === 'bite' ? -Math.PI / 2 + 0.55 : fishing ? -Math.PI / 2 + 1.05 : -Math.PI / 2 + 0.85;
    const c = sp.rotatedIcon(held, up, -Math.PI / 4);
    parts.push({ c, x: Math.round(hx - c.width / 2 + Math.cos(up) * 9), y: Math.round(hy - c.height / 2 + Math.sin(up) * 9) });
    rodTipL = { x: hx + Math.cos(up) * 18, y: hy + Math.sin(up) * 18 };
  }
  // 握點：手持物只要碰到臉上「眼睛 + 嘴」那一塊，整隻手（連手上的東西）往前推到碰不到為止（手臂往前伸）
  const g0 = faceGuard(meta.dx, meta.dy), guard = { x0: g0.x0 + ox, x1: g0.x1 + ox, y0: g0.y0 + oy, y1: g0.y1 + oy };
  const reach = special || grip ? 0 : clearShiftAll(parts.flatMap((q) => { const s = sp.spans(q.c); return s ? [{ s, x: q.x, y: q.y }] : []; }), guard);
  const sk = skinRamp(look.app.skin), css = (c: readonly number[]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

  ctx.save();
  ctx.translate(X, bottom);
  ctx.scale(facing, 1);
  // 紙娃娃順序：後手臂 → 第一張（背飾 / 後髮 / 身體 / 腿 / 胸）→ 前手臂 → 第二張（臉 / 前髮 / 頭飾 / 前飾品）→ 手上的東西 + 手
  if (!grip) { const back = sp.arm(look, key, true, null, arms.back); ctx.drawImage(back.canvas, ox + sb.x - back.ox, oy + sb.y + bodyDy - back.oy); }
  ctx.drawImage(sheet.canvas, fi * FW, 0, FW, FH, ox, oy, FW, FH);
  // 揮劍殘影：刀身掃過的弧（前 80%）
  if (atk && blade && atk.progress < 0.8) {
    const r0 = 20, r1 = atk.kind === 'broadsword' ? 34 : 30;
    for (let d = arms.front + 8; d <= Math.min(arms.front + 70, 205); d += 4) {
      const fade = (d - arms.front) / 70;
      ctx.fillStyle = fade < 0.35 ? '#ffffff' : fade < 0.7 ? '#cceaf8' : '#94c8ee';
      const ux = Math.sin((d * Math.PI) / 180), uy = Math.cos((d * Math.PI) / 180);
      for (let r = r0 + Math.round(fade * 6); r <= r1; r += 3) ctx.fillRect(Math.round(sx + reach + ux * r), Math.round(sy + uy * r), 1, 1);
    }
  }
  if (grip) ctx.drawImage(grip.arms, ox - grip.pad, oy - grip.pad);
  else {
    const front = sp.arm(look, key, false, null, arms.front, null);
    ctx.drawImage(front.canvas, ox + sf.x - front.ox, oy + sf.y + bodyDy - front.oy);
    // 手往前伸：前臂從原本的手一路接到推出去的握點（畫在頭後面：從臉的前緣外面露出來）
    if (reach > 0) {
      ctx.fillStyle = css(sk[1]); ctx.fillRect(hx - 1, hy - 2, reach + 2, 4);
      ctx.fillStyle = css(sk[3]); ctx.fillRect(hx - 1, hy - 1, reach + 2, 2);
    }
  }
  ctx.drawImage(sheet.canvas, fi * FW, FH, FW, FH, ox, oy, FW, FH);
  // 手掌蓋在臉 / 頭髮上面：看得出抓住了邊緣
  if (grip) ctx.drawImage(grip.hands, ox - grip.pad, oy - grip.pad);
  const heldDraws: HeldPart[] = [];
  for (const q of parts) { ctx.drawImage(q.c, q.x + reach, q.y); heldDraws.push({ c: q.c, x: q.x + reach, y: q.y }); }
  ctx.restore();
  out.heldDraws = heldDraws;
  if (glowAt) out.cool.push({ x: X + facing * (glowAt.x + reach), y: bottom + glowAt.y });
  if (heldOther === 'torch' || heldOther === 'lantern') out.torches.push({ x: X + facing * (hx + reach), y: bottom + hy - 8 });
  st.rodTip = rodTipL ? { x: Math.round(X + facing * (rodTipL.x + reach)), y: Math.round(bottom + rodTipL.y) } : null;
  return out;
}
