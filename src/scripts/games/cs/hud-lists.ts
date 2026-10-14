import type { Match } from './engine';

/** Stateful HUD lists, owned by a single game screen. */
export class HudLists {
  private readonly rows = new Map<number, HTMLTableRowElement>();
  private messages: string[] = [];
  constructor(private feed: HTMLElement, private scores: HTMLElement) {}
  update(m: Match) {
    const messages = m.feed.filter(f => m.time - f.at < 6).map(f => f.text);
    if (messages.length !== this.messages.length || messages.some((text, i) => text !== this.messages[i])) {
      this.feed.replaceChildren(...messages.map(text => { const row = document.createElement('p'); row.textContent = text; return row; }));
      this.messages = messages;
    }
    for (const actor of m.actors) {
      let row = this.rows.get(actor.id);
      if (!row) {
        row = document.createElement('tr');
        for (let i = 0; i < 5; i++) row.append(document.createElement('td'));
        this.rows.set(actor.id, row); this.scores.append(row);
      }
      const values = [actor.name, actor.team === 'attack' ? '攻方' : '守方', actor.kills, actor.deaths, actor.hp > 0 ? '作戰中' : '陣亡'];
      for (let i = 0; i < values.length; i++) {
        const text = String(values[i]); if (row.children[i].textContent !== text) row.children[i].textContent = text;
      }
    }
  }
}
