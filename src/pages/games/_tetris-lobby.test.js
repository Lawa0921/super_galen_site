// Execute the actual Astro lobby callbacks: early transport errors must remain visible and cancellable.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { Window } from 'happy-dom';
import vm from 'node:vm';

const sourcePath = resolve('src/pages/games/tetris.astro');
const source = readFileSync(sourcePath, 'utf8');
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'Expected one executable Astro script');
const ast = ts.createSourceFile(sourcePath + '.ts', scripts[0][1], ts.ScriptTarget.Latest, true);
const names = ['showLobby', 'onStatus', 'onFfaStatus'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.deepEqual(functions.map(node => node.name.text).sort(), [...names].sort());
const cancel = ast.statements.filter(node => ts.isExpressionStatement(node)
  && node.getText(ast).startsWith("document.getElementById('lobby-cancel')?.addEventListener("));
assert.equal(cancel.length, 1, 'Use the actual cancel event registration');
const executable = ts.transpileModule([...functions, ...cancel].map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function fixture() {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `
    <section id="mode-select"></section><section id="online-panel"></section>
    <section id="online-lobby" hidden><span id="lobby-code">.....</span>
      <p id="lobby-wait"></p><button id="lobby-cancel">Cancel</button></section>`;
  const context = vm.createContext({
    document, location: { href: '/games/tetris?mode=online' },
    modeSelect: document.getElementById('mode-select'),
    onlinePanel: document.getElementById('online-panel'),
    lobby: document.getElementById('online-lobby'),
    lobbyCode: document.getElementById('lobby-code'),
    lobbyWait: document.getElementById('lobby-wait'),
    started: true, isQueueMatch: false,
  });
  vm.runInContext(executable, context, { filename: sourcePath, timeout: 1000 });
  return { window, document, context };
}

for (const callback of ['onStatus', 'onFfaStatus']) {
  test(`${callback}: successful room status exposes the real lobby and room code`, async () => {
    const { window, context } = fixture();
    try {
      context[callback]({ phase: 'creating' }, false);
      context[callback]({ phase: 'waiting', room: 'ABCDE' }, false);
      assert.equal(context.lobby.hidden, false);
      assert.equal(context.onlinePanel.hidden, true);
      assert.equal(context.lobbyCode.textContent, 'ABCDE');
      assert.equal(context.lobbyWait.classList.contains('pending'), true);
    } finally { await window.happyDOM.close(); }
  });

  test(`${callback}: an error before any lobby status is visible and allows return`, async () => {
    const { window, document, context } = fixture();
    try {
      context[callback]({ phase: 'error', message: 'transport initialization failed' }, false);
      assert.equal(context.lobby.hidden, false, 'Initialization error is hidden from the user');
      assert.equal(context.onlinePanel.hidden, true);
      assert.match(context.lobbyWait.textContent, /transport initialization failed/);
      assert.equal(context.lobbyWait.classList.contains('pending'), false);
      assert.equal(context.started, false);
      document.getElementById('lobby-cancel').click();
      assert.equal(context.location.href, '/games/tetris');
    } finally { await window.happyDOM.close(); }
  });

  test(`${callback}: an error after waiting preserves the room and clears pending state`, async () => {
    const { window, context } = fixture();
    try {
      context[callback]({ phase: 'waiting', room: 'ABCDE' }, false);
      context[callback]({ phase: 'error', message: 'signaling failed' }, false);
      assert.equal(context.lobby.hidden, false);
      assert.equal(context.lobbyCode.textContent, 'ABCDE');
      assert.match(context.lobbyWait.textContent, /signaling failed/);
      assert.equal(context.lobbyWait.classList.contains('pending'), false);
      assert.equal(context.started, false);
    } finally { await window.happyDOM.close(); }
  });
}
