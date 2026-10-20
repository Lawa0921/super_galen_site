import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { GateScene, portalArt } from './gate';
import { art, codexArtId } from '../../render/artPaths';
import { generalLegendaries } from '../../data/gear';
import { capacity, carried, formatWeight } from '../../data/weights';
import { BAG_SIZE } from '../../engine/loot/bag';
import { MEETINGS } from '../../data/meetings';
import { T } from '../../data/text.zh-TW';
import { meet } from '../../engine/party';
import { STORY } from '../../data/story.zh-TW';

function setup(prep?: (g: Game) => void, art: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.dungeon.portals = [
    { region: 'mainline', condition: 'plain' },
    { region: 'blaze', condition: 'fog' },
    { region: 'iron', condition: 'starfall' },
  ];
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new GateScene({ game, art, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');   // greeting
  s.onAction('confirm');   // 選擇傳送門
  const cards = () => [...root.querySelectorAll<HTMLElement>('.slx-portal')];
  const depths = () => [...root.querySelectorAll('.slx-depths [role=option] .slx-label')].map((o) => o.textContent);
  return { game, go, root, s, cards, depths };
}

describe('GateScene: the portal plaza', () => {
  it('the plaza shows three portals with the mainline first', () => {
    const { root, cards } = setup();
    expect(root.querySelector('.slx-place')!.textContent).toBe('傳送門廣場');
    expect(cards()).toHaveLength(3);
    expect(cards().map((c) => c.querySelector('.slx-portal-name')!.textContent)).toEqual(['星燈迷宮・本道', '熾焰之地', '鋼鐵要塞']);
    expect(cards()[0].getAttribute('aria-selected')).toBe('true');
    const blaze = cards()[1];
    expect(blaze.querySelector('.slx-portal-trait')!.textContent).toContain('火');
    expect(blaze.querySelector('.slx-portal-trait')!.textContent).toContain('灼燒');
    expect(blaze.querySelector('.slx-portal-monsters')!.textContent).toContain('苔蘚史萊姆');
    expect(blaze.querySelector('.slx-portal-cond')!.textContent).toContain('濃霧');
    expect(blaze.querySelector('.slx-portal-gear')!.textContent).toContain('限定裝備');
    expect(blaze.querySelector('.slx-portal-drop')!.textContent).toBe('主要掉落：火焰核');
    expect(cards()[2].querySelector('.slx-portal-drop')!.textContent).toBe('主要掉落：鋼鐵碎片');
    expect(cards()[0].querySelector('.slx-portal-drop')!.textContent).toBe('主要掉落：一般素材');
    // Before the art is approved there is no picture and no stand-in shape: words only.
    expect(root.querySelector('.slx-portals img')).toBeNull();
  });

  it('a regional card says what its material is for; the mainline card does not', () => {
    const { cards } = setup();
    const use = cards()[1].querySelector('.slx-portal-drop-use')!.textContent!;
    expect(use).toBe('用途：重鑄火焰詞綴、焰紋套裝');
    const full = cards()[1].querySelector('.slx-portal-drop-use')!.getAttribute('title')!;
    expect(full).toContain('重鑄時指定火焰系詞綴');
    expect(full).toContain('焰紋套裝打造');
    expect(cards()[2].querySelector('.slx-portal-drop-use')!.textContent).toBe('用途：重鑄防禦詞綴、鐵壁套裝');
    expect(cards()[0].querySelector('.slx-portal-drop-use')).toBeNull();
  });

  it('moves between cards with left and right', () => {
    const { s, cards } = setup();
    s.onAction('right');
    expect(cards().map((c) => c.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    s.onAction('right'); s.onAction('right');   // wraps
    expect(cards()[0].getAttribute('aria-selected')).toBe('true');
    s.onAction('left');
    expect(cards()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('a run that can only start at depth 1 says the region resist starts from depth 2', () => {
    const { cards } = setup();
    const affinity = (i: number) => cards()[i].querySelector('.slx-portal-affinity')?.textContent;
    expect(affinity(1)).toBe('弱 冰　抗 火（第 2 層起）');
    expect(affinity(2)).toBe('弱 雷　抗 物理（第 2 層起）');
    expect(affinity(0)).toBeUndefined();
  });

  it('a portal that can start deeper than depth 1 shows the plain resist line', () => {
    const { cards } = setup((g) => { g.state.dungeon.reached.iron = 5; g.state.dungeon.reached.blaze = 4; });
    expect(cards()[2].querySelector('.slx-portal-affinity')!.textContent).toBe('弱 雷　抗 物理');
    expect(cards()[1].querySelector('.slx-portal-affinity')!.textContent).toBe('弱 冰　抗 火（第 2 層起）');
  });

  it('start depth offers only 1 and reached multiples of 5', () => {
    const { s, depths } = setup((g) => { g.state.dungeon.reached.blaze = 12; });
    s.onAction('right'); s.onAction('confirm');   // 熾焰之地
    expect(depths()).toEqual(['第 1 層', '第 5 層', '第 10 層']);
  });

  it('keeps the mainline shortcuts to every floor reached', () => {
    const { s, depths } = setup((g) => { g.state.dungeon.reached.mainline = 3; });
    s.onAction('confirm');
    expect(depths()).toEqual(['第 1 層 林間遺跡', '第 2 層 水晶洞窟', '第 3 層 星燈神殿']);
  });

  it('shows the suggested level beside each start depth', () => {
    const { s, root } = setup((g) => { g.state.dungeon.reached.blaze = 12; });
    s.onAction('right'); s.onAction('confirm');   // 熾焰之地
    const right = [...root.querySelectorAll('.slx-depths [role=option] .slx-right')].map((o) => o.textContent);
    expect(right).toEqual(['建議 Lv 2', '建議 Lv 18', '建議 Lv 38']);
  });

  it('departs after a yes with the portal, its condition and the start depth', () => {
    const { game, go, s, root } = setup((g) => { g.state.dungeon.reached.blaze = 5; });
    s.onAction('right'); s.onAction('confirm');    // 熾焰之地
    s.onAction('down'); s.onAction('confirm');     // 第 5 層
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('熾焰之地');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('第 5 層');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('up'); s.onAction('confirm');       // 是
    expect(go).toHaveBeenCalledWith('dungeon');
    expect([game.phase, game.run!.region, game.run!.condition, game.run!.startDepth, game.floor]).toEqual(['map', 'blaze', 'fog', 5, 5]);
  });

  it('warns before departure when the consumables brought along are over the weight limit, and still departs', () => {
    const { game, go, s, root } = setup((g) => { g.state.inventory.potion = 999; });
    s.onAction('confirm'); s.onAction('confirm');   // the mainline, depth 1
    const warn = root.querySelector('.slx-confirm .slx-confirm-warn');
    expect(warn!.textContent).toMatch(/^超重！重量 \d+(\.\d)?／\d+(\.\d)?，出發後撿不了任何東西$/);
    expect(warn!.textContent).toContain(`重量 ${formatWeight(carried(game.state))}／${formatWeight(capacity(game.state.party))}`);
    s.onAction('up'); s.onAction('confirm');       // 是
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(game.phase).toBe('map');
  });

  it('warns before departure when the town bag has fewer than 5 free slots, and still departs', () => {
    const gear = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: 100 + i, base: 'iron-sword', rarity: 'common' as const, ilvl: 1, affixes: [], enhance: 0 }));
    const { game, go, s, root } = setup((g) => { g.state.bag = gear(BAG_SIZE - 4); });
    s.onAction('confirm'); s.onAction('confirm');   // the mainline, depth 1
    const warn = root.querySelector('.slx-confirm .slx-confirm-warn');
    expect(warn!.textContent).toBe('背包只剩 4 格空位，放不下的裝備只能先留在寶箱裡');
    s.onAction('up'); s.onAction('confirm');       // 是
    expect(go).toHaveBeenCalledWith('dungeon');
    expect(game.phase).toBe('map');
    // A full bag says 0; five free slots say nothing.
    for (const [n, said] of [[BAG_SIZE, '背包只剩 0 格空位，放不下的裝備只能先留在寶箱裡'], [BAG_SIZE - 5, null]] as const) {
      const t = setup((g) => { g.state.bag = gear(n); });
      t.s.onAction('confirm'); t.s.onAction('confirm');
      expect(t.root.querySelector('.slx-confirm')).not.toBeNull();
      expect(t.root.querySelector('.slx-confirm .slx-confirm-warn')?.textContent ?? null).toBe(said);
    }
  });

  it('no weight warning when the pack is within the limit', () => {
    const { s, root } = setup();
    s.onAction('confirm'); s.onAction('confirm');
    expect(root.querySelector('.slx-confirm')).not.toBeNull();
    expect(root.querySelector('.slx-confirm .slx-confirm-warn')).toBeNull();
  });

  it('is fully playable with the mouse', () => {
    const { game, go, root, cards } = setup();
    cards()[2].click();
    (root.querySelector('.slx-depths [role=option]') as HTMLElement).click();
    (root.querySelector('.slx-confirm [data-id=yes]') as HTMLElement).click();
    expect(go).toHaveBeenCalledWith('dungeon');
    expect([game.run!.region, game.run!.condition]).toEqual(['iron', 'starfall']);
  });

  it('backs out one window at a time', () => {
    const { s, root } = setup();
    s.onAction('confirm');
    expect(root.querySelector('.slx-depths')).not.toBeNull();
    s.onAction('cancel');
    expect(root.querySelector('.slx-depths')).toBeNull();
    expect(root.querySelector('.slx-portals')).not.toBeNull();
    s.onAction('cancel');
    expect(root.querySelector('.slx-portals')).toBeNull();
  });

  it('cards under the depth window ignore the mouse', () => {
    const { s, root, cards, depths } = setup();
    s.onAction('confirm');
    expect(root.querySelector('.slx-portals')!.hasAttribute('inert')).toBe(true);
    cards()[1].click();
    expect(depths()).toEqual(['第 1 層 林間遺跡']);
  });

  it('shows approved portal art when it is published', () => {
    const urls = new Set([portalArt.card('blaze'), portalArt.trait('fire')]);
    const { cards } = setup(undefined, { has: (u) => urls.has(u) });
    expect(cards()[1].querySelector('img.slx-portal-art')!.getAttribute('src')).toBe(portalArt.card('blaze'));
    expect(cards()[1].querySelector('.slx-portal-trait img')!.getAttribute('src')).toBe(portalArt.trait('fire'));
    expect(cards()[0].querySelector('img')).toBeNull();
  });

  it('every card names its region in a class (for its banner crop) and keeps the monsters label on the monsters line', () => {
    const pairs = [['blaze', 'frost'], ['storm', 'mire'], ['shade', 'iron']] as const;
    for (const pair of pairs) {
      const { cards } = setup((g) => { g.state.dungeon.portals = [{ region: 'mainline', condition: 'plain' }, ...pair.map((region) => ({ region, condition: 'fog' as const }))]; }, { has: () => true });
      for (const [i, region] of ['mainline', ...pair].entries()) {
        const c = cards()[i];
        expect(c.classList.contains(`slx-portal-${region}`)).toBe(true);
        expect(c.querySelector('img.slx-portal-art')!.getAttribute('src')).toBe(portalArt.card(region as Parameters<typeof portalArt.card>[0]));
        // The label sits inside the line it names: no row of its own above the names.
        const line = c.querySelector('.slx-portal-monsters')!;
        expect(line.querySelector('.slx-portal-label')!.textContent).toBe('怪物');
        expect(line.textContent).toMatch(/^怪物.*苔蘚史萊姆/);
        expect([...c.children].filter((e) => e.classList.contains('slx-portal-label'))).toEqual([]);
      }
    }
  });

  it('explains when nobody can fight', () => {
    const { game, go, s, root } = setup((g) => { for (const id of g.state.party.recruited) g.state.party.roster[id].hp = 0; });
    s.onAction('confirm'); s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(game.phase).toBe('town');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('出戰成員全部倒下，無法出發');
  });
});

describe('GateScene: region-only gear on the portal cards', () => {
  const items = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.slx-portal-gear .slx-codex-item[data-special]')];

  it('a regional card lists two specials and its set, unknown until obtained', () => {
    const { cards } = setup();
    const its = items(cards()[1]);
    expect(its.map((i) => i.dataset.special)).toEqual(['blaze-heart-sword', 'blaze-ember-ring', 'set-blaze']);
    expect(its.map((i) => i.textContent)).toEqual(['灼心之劍（未取得）', '餘燼指環（未取得）', '焰紋套裝（未取得）']);
    expect(its.every((i) => i.classList.contains('slx-codex-unknown'))).toBe(true);
    expect(its[0].classList.contains('slx-rarity-legendary')).toBe(true);
    expect(its[1].classList.contains('slx-rarity-unique')).toBe(true);
    expect(its[2].classList.contains('slx-rarity-set')).toBe(true);
    expect(items(cards()[2]).map((i) => i.dataset.special)).toEqual(['iron-unbroken-shield', 'iron-bulwark-plate', 'set-iron']);
  });

  it('an obtained special shows its name and rarity word, but not its power text', () => {
    const { cards } = setup((g) => { g.state.codex.push('blaze-heart-sword', 'set-blaze'); });
    const [sword, ring, set] = items(cards()[1]);
    expect(sword.classList.contains('slx-codex-unknown')).toBe(false);
    expect(sword.textContent).toBe('灼心之劍・傳說');
    expect(set.classList.contains('slx-codex-unknown')).toBe(false);
    expect(set.textContent).toBe('焰紋套裝');
    expect(cards()[1].querySelector('.slx-codex-line')).toBeNull();
    expect(ring.classList.contains('slx-codex-unknown')).toBe(true);
    expect(ring.textContent).toBe('餘燼指環（未取得）');
  });

  it('the mainline card has one summary line of the general legendaries, not a list', () => {
    const { cards } = setup((g) => { g.state.codex.push('lg-noel', 'lg-liz', 'blaze-heart-sword'); });
    const main = cards()[0];
    expect(main.querySelector('.slx-portal-general')!.textContent).toBe(`通用傳說：已取得 2／${generalLegendaries().length}`);
    expect(generalLegendaries()).toHaveLength(8);
    expect(items(main)).toHaveLength(0);
    expect(main.textContent).not.toContain('限定裝備');
    expect(cards()[1].textContent).toContain('限定裝備');
  });

  it('the scroll cue shows only when the list really overflows', () => {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
    try {
      sh.mockReturnValue(40); ch.mockReturnValue(60);
      const fit = setup();
      expect([...fit.root.querySelectorAll<HTMLElement>('.slx-codex-more')].every((m) => m.hidden)).toBe(true);
      sh.mockReturnValue(90);
      const over = setup();
      const more = [...over.root.querySelectorAll<HTMLElement>('.slx-codex-more')];
      expect(more).toHaveLength(2);
      expect(more.every((m) => !m.hidden)).toBe(true);
    } finally { sh.mockRestore(); ch.mockRestore(); }
  });

  it('an unobtained piece loads only its silhouette file; an obtained one its gear icon', () => {
    const pic = (r: ReturnType<typeof setup>, id: string) => r.root.querySelector<HTMLImageElement>(`[data-special="${id}"] img`);
    expect(setup().root.querySelector('.slx-codex-silhouette, .slx-codex-icon')).toBeNull();
    // Its real icon published, its silhouette not: no picture at all, so the unobtained piece is never shown early.
    const iconOnly = setup(undefined, { has: (u) => u === art.gear('blaze-ember-ring') || u === art.icon('blaze-ember-ring') });
    expect(pic(iconOnly, 'blaze-ember-ring')).toBeNull();
    const ALL: ArtIndex = { has: () => true };
    const unknown = setup(undefined, ALL);
    expect(pic(unknown, 'blaze-ember-ring')!.className).toBe('slx-codex-silhouette');
    expect(pic(unknown, 'blaze-ember-ring')!.getAttribute('src')).toBe(art.gearSilhouette('blaze-ember-ring'));
    expect(pic(unknown, 'set-blaze')!.getAttribute('src')).toBe(art.gearSilhouette('set-blaze'));
    const known = setup((g) => { g.state.codex.push('blaze-ember-ring', 'set-blaze'); }, ALL);
    expect(pic(known, 'blaze-ember-ring')!.className).toBe('slx-codex-icon');
    expect(pic(known, 'blaze-ember-ring')!.getAttribute('src')).toBe(art.gear(codexArtId('blaze-ember-ring')));
    expect(pic(known, 'set-blaze')!.getAttribute('src')).toBe(art.gear('set-blaze-weapon'));
    // Obtained but its gear art not published: the name alone.
    const knownNoArt = setup((g) => { g.state.codex.push('blaze-ember-ring'); }, { has: (u) => u === art.gearSilhouette('blaze-ember-ring') });
    expect(pic(knownNoArt, 'blaze-ember-ring')).toBeNull();
  });
});

describe("GateScene: Glen's reroll", () => {
  const commands = (prep?: (g: Game) => void) => {
    const game = new Game(constRng(0.5), null);
    prep?.(game);
    const root = document.createElement('div');
    const s = new GateScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');   // greeting
    return { game, root, s, labels: () => [...root.querySelectorAll('.slx-cmd [role=option] .slx-label')].map((o) => o.textContent) };
  };

  it("the reroll command appears only with Glen's perk", () => {
    expect(commands().labels()).toEqual(['選擇傳送門', '離開']);
    expect(commands((g) => g.state.story.returned.push('glen')).labels()).toEqual(['選擇傳送門', '重抽傳送門', '離開']);
  });

  it("rerolling uses the arrival's one reroll, and the command goes away", () => {
    const { game, s, labels } = commands((g) => g.state.story.returned.push('glen'));
    s.onAction('down');
    s.onAction('confirm');
    expect(game.canReroll()).toBe(false);
    expect(labels()).toEqual(['選擇傳送門', '離開']);
  });
});

describe('GateScene: the leads (6c Task 16)', () => {
  const mark = (c: HTMLElement) => c.querySelector('.slx-portal-sighting')?.querySelector('.slx-portal-sighting-depth')?.textContent ?? null;
  const isLead = (c: HTMLElement) => c.classList.contains('slx-portal-lead') && !!c.querySelector('.slx-portal-lead-tag');

  it("a new game marks the main road as the guild's lead, and no region yet: the regions' rumours come after the prologue (I-124)", () => {
    const { cards } = setup();
    const [main, blaze, iron] = cards();
    expect(isLead(main)).toBe(true);
    expect(main.querySelector('.slx-portal-lead-tag')!.getAttribute('title')).toBe(T.ui2.gate.lead);
    expect(mark(main)).toBe(T.ui2.gate.leadAt(2));
    // UI copy, so the card's own numerals (「最深 第 1 層」); only Anna's lead lines use Chinese numerals (6c Task 16 fix round 1)
    expect([T.ui2.gate.leadAt(2), T.ui2.gate.sighted(3)]).toEqual(['線索・第 2 層', '目擊・第 3 層']);
    // beside the name, so the card is no taller than before
    expect(main.querySelector('.slx-portal-head .slx-portal-sighting')).not.toBeNull();
    // Safira and Scarlet are out there, but the guild has no word from the regions in the prologue (final review M-3)
    expect([isLead(blaze), mark(blaze)]).toEqual([false, null]);
    expect([isLead(iron), mark(iron)]).toEqual([false, null]);
  });

  it('past the prologue each region where someone is still unmet shows its sighting (the same opening as the leads)', () => {
    const { cards } = setup((g) => { g.state.dungeon.reached.mainline = 2; });
    const [main, blaze, iron] = cards();
    expect([isLead(main), mark(main)]).toEqual([true, T.ui2.gate.leadAt(2)]);   // Selene is still the lead
    expect([isLead(blaze), mark(blaze)]).toEqual([false, T.ui2.gate.sighted(3)]);   // Safira
    expect([isLead(iron), mark(iron)]).toEqual([false, T.ui2.gate.sighted(8)]);     // Scarlet
  });

  it('a regional lead marks its own portal; the main road is marked only for a lead of its own', () => {
    const { cards } = setup((g) => {
      g.state.party = meet(g.state.party, 'selene', 1);
      g.state.dungeon.reached.mainline = 2;
      g.state.dungeon.portals = [{ region: 'mainline', condition: 'plain' }, { region: 'frost', condition: 'fog' }, { region: 'blaze', condition: 'calm' }];
    });
    const [main, frost, blaze] = cards();
    expect([isLead(main), mark(main)]).toEqual([false, null]);   // Bobby is unmet there, but the lead is the frost's
    expect([isLead(frost), mark(frost)]).toEqual([true, T.ui2.gate.leadAt(3)]);
    expect([isLead(blaze), mark(blaze)]).toEqual([false, T.ui2.gate.sighted(3)]);
  });

  it('nobody left: no portal is marked', () => {
    const { cards, root } = setup((g) => { for (const m of MEETINGS) g.state.party = meet(g.state.party, m.id, 1); });
    expect(cards().map(mark)).toEqual([null, null, null]);
    expect(root.querySelector('.slx-portal-lead')).toBeNull();
  });

  it('a lead is a sighting, never a call for help: the companions are lost and remember nothing (user ruling)', () => {
    expect(T.ui2.rescue.waiting).toBe('這層好像還有別人。');
    const texts = [T.ui2.rescue.waiting, T.ui2.gate.lead, T.ui2.gate.leadAt(3), T.ui2.gate.sighted(3), ...Object.values(STORY.leads)];
    for (const t of texts) expect(t).not.toMatch(/求救|求助|呼救|訊號|救命/);
  });
});
