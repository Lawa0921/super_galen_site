// calendarUi.ts — 曆法 / 天氣的 DOM：HUD 右上的日期時鐘（點一下打開）+ 日曆面板（今天 / 明天天氣、日出日落、月相、本季日曆）。
// 內容全部用 textContent / class 組出來（不用行內樣式）；小圖示是原生像素 canvas，CSS 以整數倍放大。
import type { DelveGame } from '../engine/game';
import {
  DAYS_PER_SEASON, MOON_NAMES, SEASON_NAMES, dayIndexOf, formatFrac, moonPhase, sunTimes, type Season,
} from '../engine/calendar';
import { DAY_LENGTH } from '../engine/constants';
import { WEATHER_NAMES, forecast, localWeather, type WeatherKind } from '../engine/weather';
import { moonPhaseBmp, weatherIconBmp } from './seasonArt';
import { Bmp, toCanvas } from './pixel';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function bmpCanvas(b: Bmp, cls: string): HTMLCanvasElement {
  const c = toCanvas(b) as HTMLCanvasElement;
  c.className = cls;
  return c;
}

/** 某天（dayIndex）在玩家所在生態區的預報（今天有強制天氣時以它為準） */
export function forecastFor(g: DelveGame, day: number): WeatherKind {
  const today = dayIndexOf(g.time);
  const o = g.weatherOverride;
  const kind = day === today && o && g.time < o.until ? o.kind : forecast(g.seed, day);
  return localWeather(kind, g.world.biomeAt(g.feetTile().x));
}

export class CalendarUi {
  private sig = '';
  private clockSig = '';
  private iconKind = '';
  private frame = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private root: HTMLElement, private game: DelveGame) {
    const on = (sel: string, fn: () => void): void => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', fn);
      this.offs.push(() => b.removeEventListener('click', fn));
    };
    on('#delve-calendar-close', () => this.setOpen(false));
    on('#delve-clock', () => this.toggle());
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T | null { return this.root.querySelector<T>(sel); }
  get isOpen(): boolean { return !(this.q('#delve-calendar')?.hidden ?? true); }
  setOpen(open: boolean): void {
    const p = this.q('#delve-calendar');
    if (!p) return;
    p.hidden = !open;
    if (open) { this.sig = ''; this.render(); }
  }
  toggle(): void { this.setOpen(!this.isOpen); }

  /** HUD 時鐘：「第1年 春 3日 06:40」+ 天氣小圖示 */
  private drawClock(): void {
    const g = this.game, wx = g.localWeatherState();
    const txt = this.q('#delve-clock-text');
    const text = g.dateText();
    if (txt && text !== this.clockSig) { this.clockSig = text; txt.textContent = text; }
    const k0 = wx.intensity > 0.3 ? wx.kind : 'clear';
    const kind = k0 === 'clear' && g.isNight() ? 'night' : k0;
    const box = this.q('#delve-clock');
    if (box && kind !== this.iconKind) {
      this.iconKind = kind;
      box.dataset.weather = kind;
      box.setAttribute('aria-label', `${text}・${WEATHER_NAMES[k0 as WeatherKind]}（點一下打開日曆）`);
      const old = this.q('#delve-clock-icon');
      const c = bmpCanvas(weatherIconBmp(kind), 'delve-clock-icon');
      c.id = 'delve-clock-icon';
      if (old) old.replaceWith(c); else box.prepend(c);
    }
  }

  private render(): void {
    const g = this.game, body = this.q('#delve-calendar-body');
    if (!body) return;
    const d = g.date(), sun = sunTimes(d.dayIndex);
    const today = forecastFor(g, d.dayIndex), tomorrow = forecastFor(g, d.dayIndex + 1);
    // 今晚：還沒入夜（白天）→ 接下來這一晚；已經入夜 → 現在這一晚
    const moonNow = g.isNight() ? g.moon() : moonPhase((d.dayIndex + 0.9) * DAY_LENGTH);
    const sig = `${d.dayIndex}|${today}|${tomorrow}|${moonNow}`;
    if (sig === this.sig) return;
    this.sig = sig;
    body.replaceChildren();
    const head = el('p', 'delve-cal-date', `第${d.year}年 ${SEASON_NAMES[d.season]}季 第${d.dayOfSeason}日`);
    head.dataset.testid = 'calendar-date';
    body.appendChild(head);
    // 今天 / 明天
    const fc = el('div', 'delve-cal-fc');
    for (const [label, kind, id] of [['今天', today, 'calendar-today'], ['明天', tomorrow, 'calendar-tomorrow']] as const) {
      const box = el('div', 'delve-cal-wx');
      box.dataset.testid = id;
      box.dataset.weather = kind;
      box.append(bmpCanvas(weatherIconBmp(kind), 'delve-cal-icon'), el('span', 'delve-cal-wx-label', `${label}　${WEATHER_NAMES[kind]}`));
      fc.appendChild(box);
    }
    body.appendChild(fc);
    // 日出 / 日落 / 月相
    const sky = el('div', 'delve-cal-sky');
    sky.append(
      el('span', 'delve-cal-line', `日出 ${formatFrac(sun.sunrise)}・日落 ${formatFrac(sun.sunset)}・白晝 ${Math.round((sun.sunset - sun.sunrise) * 24 * 10) / 10} 小時`),
    );
    const moon = el('div', 'delve-cal-moon-row');
    moon.append(bmpCanvas(moonPhaseBmp(moonNow), 'delve-cal-moon'), el('span', 'delve-cal-line', `今晚月相：${MOON_NAMES[moonNow]}`));
    sky.appendChild(moon);
    body.appendChild(sky);
    // 本季日曆（7 格）
    const grid = el('div', 'delve-cal-grid');
    for (let k = 1; k <= DAYS_PER_SEASON; k++) {
      const cell = el('span', 'delve-cal-day', String(k));
      if (k < d.dayOfSeason) cell.classList.add('is-past');
      if (k === d.dayOfSeason) cell.classList.add('is-today');
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    const left = DAYS_PER_SEASON - d.dayOfSeason;
    const next = SEASON_NAMES[((d.season + 1) % 4) as Season];
    body.appendChild(el('p', 'delve-cal-line', left > 0 ? `再 ${left} 天進入${next}季` : `明天進入${next}季`));
    const survived = el('p', 'delve-cal-line', `已在這個世界度過 ${d.dayIndex + 1} 天`);
    survived.dataset.testid = 'calendar-days';
    body.appendChild(survived);
    body.appendChild(el('p', 'delve-cal-note', '晚上躺到床上可以一覺睡到天亮（附近不能有怪物）。冬天湖面會結冰，可以走在上面。'));
  }

  /** 每幀呼叫；內部節流 */
  tick(): void {
    this.frame++;
    if (this.frame % 10 === 0) this.drawClock();
    if (this.isOpen && this.frame % 30 === 0) this.render();
  }
  destroy(): void { for (const f of this.offs) f(); }
}
