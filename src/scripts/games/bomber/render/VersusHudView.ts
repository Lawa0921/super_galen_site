import { Container, Text, TextStyle, Graphics, Sprite } from 'pixi.js';
import type { BomberTextures } from './assets';
import type { VersusState, VPlayer } from '../versus/types';
import type { AbilityId } from '../engine/types';
import { abilityRatio, suddenDeathHud, HUD_PLAYER_TINTS } from './versusHud';

const FONT_FAMILY = '"Press Start 2P", Consolas, monospace';

/** Per-ability accent colours (match select-screen auras / VersusEntityView). */
const ABILITY_COLOR: Record<AbilityId, number> = {
  detonate: 0xffb347,
  inferno: 0xff5a3c,
  blink: 0x36e0c0,
  bulwark: 0x6b9fd0,
};

/** One per-player panel: name + swatch, ability cooldown arc, powerup tiers, shield, OUT state. */
interface PlayerPanel {
  root: Container;
  bg: Graphics;
  swatch: Graphics;
  name: Text;
  /** Ability radial: background ring + fill arc + READY/CD label. */
  abilityArc: Graphics;
  abilityIcon: Sprite;
  abilityLabel: Text;
  /** Powerup tiers (fire / bomb / speed) + shield, drawn as one compact text line + shield icon. */
  tierText: Text;
  shieldIcon: Sprite;
}

const PANEL_W = 150;
const PANEL_H = 50;
const PANEL_GAP = 8;
const ARC_R = 15;
const ARC_CX = 18;
const ARC_CY = 24;

/**
 * Versus HUD (Pixi, mounted into stage.hudLayer — no bloom).
 *
 * Per-player panels are laid across the top edge (2–4 players, compact, non-overlapping).
 * Each panel shows: character label + colour swatch, an ability cooldown radial arc that
 * fills 0→1 as the ability recharges (READY glow when ready), powerup tiers (fire/bomb/speed),
 * a shield indicator, and a dimmed "OUT" state when eliminated. The local player's panel
 * (id === localId, online) is highlighted; hotseat may pass undefined → no highlight.
 *
 * A sudden-death timer sits top-center, driven purely off state.elapsedMs (deterministic).
 *
 * All pure logic lives in versusHud.ts (abilityRatio / suddenDeathHud), unit-tested separately.
 */
export class VersusHudView {
  private container = new Container();
  private panels: PlayerPanel[] = [];
  /** playerId → panel index, rebuilt when the roster changes. */
  private panelByPlayer = new Map<string, number>();

  // ---- sudden-death timer (top center) ----
  private sdContainer = new Container();
  private sdBg = new Graphics();
  private sdText: Text;

  private stageW = 800;
  private pulse = 0;
  private readonly reducedMotion: boolean;

  constructor(private layer: Container, private textures: BomberTextures) {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.sdText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0xffd23f, letterSpacing: 1 }),
    });
    this.sdText.anchor.set(0.5, 0.5);
    this.sdContainer.addChild(this.sdBg, this.sdText);
    this.sdContainer.visible = false;

    this.layer.addChild(this.container, this.sdContainer);
  }

  /** Set stage size (call on construct + every resize). Rebuilds panel layout. */
  setLayout(w: number, _h = 600): void {
    this.stageW = w;
    this.relayoutSd();
    this.relayoutPanels();
  }

  /** Alias used by versusMain's relayout path. */
  onResize(w: number, h?: number): void {
    this.setLayout(w, h);
  }

  /**
   * Render the HUD for the current frame.
   * @param state    current VersusState (players + elapsedMs)
   * @param _layout  grid layout (unused for now; HUD is screen-anchored, reserved for future)
   * @param localId  local player's id (online); undefined in hotseat → no highlight
   */
  render(state: VersusState, _layout: unknown, localId?: string): void {
    if (!this.reducedMotion) {
      this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
    }

    this.ensurePanels(state.players);

    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const idx = this.panelByPlayer.get(p.id);
      if (idx === undefined) continue;
      this.renderPanel(this.panels[idx], p, i, p.id === localId);
    }

    this.renderSuddenDeath(state.elapsedMs);
  }

  // ─── per-player panels ───────────────────────────────────────────────────────

  /** Build/rebuild the panel pool to match the current roster (id order is stable). */
  private ensurePanels(players: VPlayer[]): void {
    const ids = players.map((p) => p.id).join('|');
    if (ids === this._lastRosterKey) return;
    this._lastRosterKey = ids;

    // (Re)create exactly players.length panels.
    while (this.panels.length < players.length) this.panels.push(this.createPanel());
    while (this.panels.length > players.length) {
      const extra = this.panels.pop();
      if (extra) { extra.root.destroy({ children: true }); }
    }

    this.panelByPlayer.clear();
    players.forEach((p, i) => this.panelByPlayer.set(p.id, i));

    this.relayoutPanels();
  }
  private _lastRosterKey = '';

  private createPanel(): PlayerPanel {
    const root = new Container();
    const bg = new Graphics();
    const swatch = new Graphics();

    const name = new Text({
      text: '',
      style: new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 9, fill: 0xfff2e6, letterSpacing: 1 }),
    });

    const abilityArc = new Graphics();
    const abilityIcon = new Sprite(this.textures.abDetonate);
    abilityIcon.width = 18;
    abilityIcon.height = 18;
    abilityIcon.anchor.set(0.5);
    abilityIcon.x = ARC_CX;
    abilityIcon.y = ARC_CY;

    const abilityLabel = new Text({
      text: '',
      style: new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 8, fill: 0xfff2e6 }),
    });
    abilityLabel.anchor.set(0.5, 0);
    abilityLabel.x = ARC_CX;
    abilityLabel.y = ARC_CY + ARC_R + 3;

    const tierText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 9, fill: 0xffd23f, letterSpacing: 1 }),
    });

    const shieldIcon = new Sprite(this.textures.puShield);
    shieldIcon.width = 14;
    shieldIcon.height = 14;

    root.addChild(bg, swatch, name, abilityArc, abilityIcon, abilityLabel, tierText, shieldIcon);
    this.container.addChild(root);
    return { root, bg, swatch, name, abilityArc, abilityIcon, abilityLabel, tierText, shieldIcon };
  }

  private renderPanel(panel: PlayerPanel, p: VPlayer, seat: number, isLocal: boolean): void {
    const tint = HUD_PLAYER_TINTS[seat] ?? 0xffffff;
    const out = !p.alive;

    // -- background frame (highlight local; dim eliminated) --
    panel.bg.clear();
    const bgAlpha = out ? 0.5 : 0.92;
    panel.bg.rect(0, 0, PANEL_W, PANEL_H).fill({ color: 0x0a0817, alpha: bgAlpha });
    panel.bg.rect(0, 0, PANEL_W, PANEL_H).stroke({
      color: isLocal ? 0xffce6b : 0x2a2138,
      width: isLocal ? 2 : 1,
      alpha: isLocal ? 0.95 : 0.8,
    });
    if (isLocal && !out) {
      // subtle top accent line for the local player's panel
      panel.bg.rect(0, 0, PANEL_W, 2).fill({ color: 0xffce6b, alpha: 0.9 });
    }

    // -- colour swatch (top-right of name row) --
    panel.swatch.clear();
    panel.swatch.rect(PANEL_W - 14, 6, 8, 8).fill({ color: tint, alpha: out ? 0.4 : 1 });

    // -- name / OUT label --
    const label = (p.character ?? '?').toUpperCase();
    panel.name.text = out ? `${label} · OUT` : label;
    panel.name.style.fill = out ? 0x8a7f74 : 0xfff2e6;
    panel.name.x = 6;
    panel.name.y = 5;

    // -- ability cooldown radial arc --
    const ratio = abilityRatio(p.abilityCooldownMs, p.abilityMaxMs);
    const ready = p.abilityCooldownMs <= 0 || p.abilityMaxMs <= 0;
    const aColor = ABILITY_COLOR[p.abilityId] ?? 0xffb347;

    panel.abilityIcon.texture = this.abilityTexture(p.abilityId);
    panel.abilityIcon.alpha = out ? 0.3 : ready ? 1 : 0.7;

    const arc = panel.abilityArc;
    arc.clear();
    // base ring
    arc.circle(ARC_CX, ARC_CY, ARC_R).stroke({ color: 0x2a2138, width: 3, alpha: out ? 0.4 : 0.9 });
    if (!out) {
      const start = -Math.PI / 2;
      const end = start + ratio * Math.PI * 2;
      if (ratio > 0) {
        arc.arc(ARC_CX, ARC_CY, ARC_R, start, end).stroke({ color: aColor, width: 3, alpha: 0.95 });
      }
      if (ready) {
        // READY glow ring (subtle pulse; static under reduced-motion)
        const glow = this.reducedMotion ? 0.5 : 0.35 + Math.abs(Math.sin(this.pulse * 1.6)) * 0.35;
        arc.circle(ARC_CX, ARC_CY, ARC_R + 2).stroke({ color: aColor, width: 2, alpha: glow });
      }
    }

    if (out) {
      panel.abilityLabel.text = '';
    } else if (ready) {
      panel.abilityLabel.text = 'READY';
      panel.abilityLabel.style.fill = aColor;
    } else {
      panel.abilityLabel.text = `${Math.ceil(p.abilityCooldownMs / 1000)}`;
      panel.abilityLabel.style.fill = 0xc0b8b0;
    }

    // -- powerup tiers: F / B / S (compact) --
    const tierParts = [`F${p.fireRange}`, `B${p.maxBombs}`, `S${p.speedLevel}`];
    panel.tierText.text = tierParts.join(' ');
    panel.tierText.style.fill = out ? 0x6a6058 : 0xffd23f;
    panel.tierText.x = 42;
    panel.tierText.y = 22;

    // -- shield indicator --
    panel.shieldIcon.visible = !!p.shield && !out;
    panel.shieldIcon.x = 42;
    panel.shieldIcon.y = 33;
  }

  /** Lay panels across the top edge: P1/P3 on the left, P2/P4 on the right, mirrored from center. */
  private relayoutPanels(): void {
    const n = this.panels.length;
    if (n === 0) return;
    const top = 4;

    // Split into left group (even seats: 0,2) and right group (odd seats: 1,3),
    // so 2 players sit at the two top corners and 3-4 fan inward — never overlapping the
    // top-center sudden-death timer.
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < n; i++) (i % 2 === 0 ? left : right).push(i);

    left.forEach((seat, k) => {
      const panel = this.panels[seat];
      panel.root.x = 6 + k * (PANEL_W + PANEL_GAP);
      panel.root.y = top;
    });
    right.forEach((seat, k) => {
      const panel = this.panels[seat];
      panel.root.x = this.stageW - 6 - PANEL_W - k * (PANEL_W + PANEL_GAP);
      panel.root.y = top;
    });
  }

  // ─── sudden-death timer ────────────────────────────────────────────────────────

  private renderSuddenDeath(elapsedMs: number): void {
    const sd = suddenDeathHud(elapsedMs);
    this.sdContainer.visible = true;

    let text: string;
    let color: number;
    if (sd.phase === 'pre') {
      const s = sd.secondsToNext;
      text = `SUDDEN DEATH 0:${String(Math.min(99, s)).padStart(2, '0')}`;
      // turn amber→red as it approaches
      color = s <= 5 ? 0xff5a3c : 0xffd23f;
    } else if (sd.phase === 'collapsing') {
      text = `COLLAPSING · RING ${sd.ring} · ${sd.secondsToNext}`;
      color = 0xff5a3c;
    } else {
      text = 'COLLAPSING';
      color = 0xff2a2a;
    }

    this.sdText.text = text;
    this.sdText.style.fill = color;
    // subtle pulse during the danger phases (static under reduced-motion)
    const danger = sd.phase !== 'pre' || sd.secondsToNext <= 5;
    this.sdText.alpha = danger && !this.reducedMotion
      ? 0.7 + Math.abs(Math.sin(this.pulse * 2.2)) * 0.3
      : 1;

    this.relayoutSd();
  }

  private relayoutSd(): void {
    const cx = Math.round(this.stageW / 2);
    this.sdText.x = cx;
    this.sdText.y = 16;

    const tw = Math.max(120, this.sdText.width + 24);
    this.sdBg.clear();
    this.sdBg.roundRect(cx - tw / 2, 4, tw, 24, 4).fill({ color: 0x0a0817, alpha: 0.85 });
    this.sdBg.roundRect(cx - tw / 2, 4, tw, 24, 4).stroke({ color: 0x5a3208, width: 1, alpha: 0.9 });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────────

  private abilityTexture(id: AbilityId): typeof this.textures.abDetonate {
    return id === 'detonate' ? this.textures.abDetonate
      : id === 'inferno' ? this.textures.abInferno
      : id === 'blink' ? this.textures.abBlink
      : this.textures.abBulwark;
  }

  /** Explicit teardown (destroys panels + sd container). Called from the versus handle's destroy(). */
  destroy(): void {
    for (const panel of this.panels) panel.root.destroy({ children: true });
    this.panels = [];
    this.panelByPlayer.clear();
    this.sdContainer.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}
