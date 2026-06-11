/**
 * ItemHud smoke test（Pixi 元件不易深測：驗建構/排版/render/destroy 不丟例外）。
 * 主要行為驗證在 e2e（games-tetris-items.spec.ts）與 run.ts 單元測試。
 */
import { describe, it, expect } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { ItemHud } from './ItemHud';

describe('ItemHud (smoke)', () => {
  it('建構 → setLayout → render（未滿/滿）→ destroy 全程不丟例外且清乾淨', () => {
    const layer = new Container();
    const hud = new ItemHud(layer, Texture.WHITE);
    expect(layer.children.length).toBeGreaterThan(0);

    hud.setLayout({ x: 10, y: 20 }, 24);
    hud.render(0, 100, false, 16);
    hud.render(55, 100, false, 16);
    hud.render(100, 100, true, 16);
    hud.render(100, 100, true, 16); // 滿能量脈動第二幀（走快取路徑）

    hud.destroy();
    expect(layer.children.length).toBe(0);
  });
});
