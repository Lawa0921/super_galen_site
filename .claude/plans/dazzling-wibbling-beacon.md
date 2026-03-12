# Plan: Joanna-Themed Doodle Patterns

## Context

p5.js margin scribbles currently draw random abstract lines, cross-hatching, and text symbols. The user wants concrete, recognizable doodle patterns that reflect Joanna's personal themes: BTS, skull makeup, piercings, DIY, music, camera, etc.

## Approach

Replace/supplement the existing random scribble spawner with a **doodle pattern system** that draws hand-drawn iconic shapes using sequences of p5.js `line()`, `bezier()`, `arc()`, and `ellipse()` calls. Each pattern is defined as a set of drawing commands relative to an origin point, drawn progressively (like the existing scribbles) for a "sketching" effect.

## Doodle Patterns (10 Joanna-themed shapes)

| # | Pattern | Theme | Drawing Method |
|---|---------|-------|----------------|
| 1 | **Purple Heart** (紫色愛心) | BTS ARMY | Two bezier curves forming a heart |
| 2 | **Skull** (骷髏) | Skull makeup | Circle head + eye sockets + jaw lines |
| 3 | **Ear with rings** (穿孔耳環) | Piercing culture | Ear outline arc + small circles for piercings |
| 4 | **Palette** (調色盤) | Chaos Creator | Oval + small circles for paint dots + brush line |
| 5 | **Headphones** (耳機) | Borderless music | Arc + two ear cups |
| 6 | **Camera** (相機) | Raw camera | Rectangle + circle lens + small flash |
| 7 | **Star** (星星) | BTS constellation | 5-pointed star drawn with line segments |
| 8 | **Scissors** (剪刀) | DIY soul | Two crossing blade arcs + handle circles |
| 9 | **Flask** (燒瓶) | Absurdist universe | Triangle body + narrow neck + bubble dots |
| 10 | **Lightning bolt** (閃電) | Chaos/energy | Zigzag line segments |

## Implementation

### File: `src/content/guild/joanna_army.html`

**1. Add `doodles[]` array** alongside existing `scribbles[]`, `hatches[]`, `annotations[]`:
```js
var doodles = [];
var DOODLE_PATTERNS = [ /* 10 pattern definitions */ ];
```

**2. Each pattern definition** is an object with a `draw(sk, x, y, size, progress)` function that draws the shape progressively (0→1). The shapes use relative coordinates scaled by `size` (default ~20-40px).

**3. Spawn logic** (inside `sk.draw`): Similar to scribbles — random chance based on `chaos`, edge margin position, random pattern selection:
```
if (sk.random() < spawnRate * 0.5 && totalMarks() < MAX_MARKS) {
    spawn a random doodle pattern at marginPos()
}
```

**4. Doodle object structure**:
```js
{
    pattern: DOODLE_PATTERNS[idx],
    x, y,
    size: sk.random(18, 40),
    color: palette[random],
    alpha: sk.random(35, 65),
    weight: sk.random(0.6, 1.5),
    drawProgress: 0,
    drawSpeed: 0.015 + energy * 0.03,
    life: sk.random(120, 300),
    maxLife: 300,
    rotation: sk.random(-0.3, 0.3),  // slight tilt for hand-drawn feel
}
```

**5. Render loop**: After drawing scribbles/before drawing ink ribbon, iterate doodles array, call each pattern's draw function with current progress, apply fade.

**6. Update `totalMarks()`** to include `doodles.length`.

### Pattern Drawing Style
- All strokes, no fills (consistent with existing scribble aesthetic)
- Slight wobble: add `sk.random(-1, 1)` jitter to control points
- Progressive reveal: each pattern draws its strokes in sequence as `progress` goes 0→1
- Hand-drawn feel via imperfect bezier control points

### File: `tests/e2e/guild-joanna-army.spec.ts`
- No new tests needed (existing canvas + JS error stability tests already cover this)

## Steps

1. Define the 10 `DOODLE_PATTERNS` array with draw functions
2. Add `doodles[]` array and update `totalMarks()`
3. Add spawn logic in `sk.draw`
4. Add render loop for doodles in `sk.draw`
5. Run E2E tests to verify no regressions

## Verification

- `npx playwright test tests/e2e/guild-joanna-army.spec.ts --project=chromium` — all 34 tests pass
- Visual check at http://localhost:4324/guild/joanna_army — doodle patterns visible in margins
