// Standalone browser smoke test using an isolated headless profile; no packages needed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const output = path.resolve('.tmp/study-ui');
await mkdir(output, { recursive: true });
const profile = path.join(output, `profile-${Date.now()}`);
const browser = spawn(process.env.STUDY_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await new Promise(r => setTimeout(r, 100)); }
  }
  assert.ok(port, 'headless browser started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 1;
  const pending = new Map(), exceptions = [], requests = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const p = pending.get(data.id); pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error.message)); else p.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
    if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(0,2000) + '\\nSTATE: ' + localStorage.getItem('vocabdna-study-v1')")}`);
  }

  const origin = 'http://127.0.0.1:8787';
  const user = 'pwa-test-' + Date.now();
  const headers = { 'oai-authenticated-user-id': user };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const reload = async () => {
    const previous = await evaluate('performance.timeOrigin');
    await send('Page.reload');
    await waitFor(`performance.timeOrigin !== ${previous} && document.readyState === 'complete' && Boolean(document.querySelector('.study-entry'))`);
    // Ensure React has attached handlers before exercising the controls.
    await new Promise(resolve => setTimeout(resolve, 500));
  };
  const api = async (identity = user, method = 'GET', body) => fetch(origin + '/api/study', { method, headers: { 'oai-authenticated-user-id': identity, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Network.setExtraHTTPHeaders', { headers });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: origin });
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.study-entry'))");
  await waitFor("Boolean(navigator.serviceWorker.controller) && document.body.textContent.includes('已可离线使用')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#dictionary-browse')).display"), 'none');
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"), 'dictionary fits iPhone');
  await click('.mobile-browse-toggle');
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#dictionary-browse')).display"), 'none');
  await click('.mobile-browse-toggle');
  await click('.study-entry');
  await waitFor("Boolean(document.querySelector('#study-settings'))");
  await evaluate("document.querySelector('[name=count]').value='2'; document.querySelector('#study-settings').requestSubmit()");
  await click('[data-study-action=uncertain]');
  await waitFor("document.querySelector('[data-sync-status]').textContent.startsWith('已同步')");
  let records = await (await api()).json();
  assert.equal(records.events.length, 1);
  assert.equal((await api('other-' + user)).status, 200);
  assert.equal((await (await api('other-' + user)).json()).events.length, 0, 'user histories isolated');
  assert.equal((await fetch(origin + '/api/study')).status, 401);
  assert.equal((await api(user, 'POST', { events: [{ bad: true }] })).status, 400);
  await api(user, 'POST', { events: records.events });
  assert.equal((await (await api()).json()).events.length, 1, 'duplicate submission not counted twice');
  // Simulate a second device: empty local cache loads shared cloud history.
  await evaluate("localStorage.removeItem('vocabdna-study-v1')");
  await reload();
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.study-entry'))");
  await click('.study-entry');
  await waitFor("JSON.parse(localStorage.getItem('vocabdna-study-v1') || '{}').events?.length === 1");
  await evaluate("document.querySelector('[name=count]').value='2'; document.querySelector('#study-settings').requestSubmit()");
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await reload();
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.study-entry'))");
  await click('.study-entry');
  await waitFor("Boolean(document.querySelector('[data-study-action=uncertain]'))");
  await click('[data-study-action=uncertain]');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 2);
  assert.ok(await evaluate("document.querySelector('[data-sync-status]').textContent.includes('离线')"));
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'iphone-pwa-offline.png'), Buffer.from(screenshot.data, 'base64'));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('[data-study-action=sync]');
  await waitFor("document.querySelector('[data-sync-status]').textContent.startsWith('已同步')");
  assert.equal((await (await api()).json()).events.length, 2);
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  console.log('PASS: iPhone dictionary layout, PWA installation/cache, offline reload and answers, reconnect sync, second-device history, duplicate protection, user isolation, auth rejection and malformed records.');
} finally { socket?.close(); browser.kill(); }
