export async function mountNext(): Promise<void> {
  const ui = document.getElementById('sl-ui');
  if (!ui) return;
  ui.dataset.ready = 'true';
}
