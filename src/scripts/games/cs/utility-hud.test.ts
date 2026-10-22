import { describe, expect, it } from 'vitest';
import { createMatch } from './engine';
import { heldDisplay, deathCause } from './utility-hud';

describe('held item HUD', () => {
  it('shows the gun magazine normally and the grenade name and count while one is drawn', () => {
    const p = createMatch('attack').actors[0];
    expect(heldDisplay(p)).toEqual({ name: 'P9 手槍', ammo: '12', reserve: '60' });
    p.grenades.flash = 2; p.held = 'flash';
    expect(heldDisplay(p)).toEqual({ name: '閃光彈', ammo: '2', reserve: '—' });
  });
  it('names the cause of death for bullets and HE blasts', () => {
    expect(deathCause({ weapon: 'rifle' })).toBe('AR-4 突擊步槍');
    expect(deathCause({ weapon: 'rifle', grenade: 'he' })).toBe('HE 手雷');
  });
});
