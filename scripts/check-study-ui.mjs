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
    throw new Error(`Timed out: ${expression}`);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: pathToFileURL(path.resolve('VocabDNA.html')).href });
  await waitFor("Boolean(document.querySelector('#study-open')) && document.querySelector('#detail').textContent.length > 0");
  await click('#study-open');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('main.shell')).display"), 'none');
  assert.equal(await evaluate("document.querySelector('[name=mode]').value"), 'en-zh');
  assert.equal(await evaluate("document.querySelector('[name=count]').value"), '20');
  await evaluate("document.querySelector('[name=count]').value = '3'; document.querySelector('#study-settings').requestSubmit()");
  await waitFor("Boolean(document.querySelector('[data-study-option]'))");
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  // Correct, wrong, unsure; inspect persisted question IDs solely to make test deterministic.
  await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('vocabdna-study-v1')); const q=s.session.questions[0]; for(const id of q.answerIds) [...document.querySelectorAll('[data-study-option]')].find(b=>b.dataset.studyOption===id).click(); document.querySelector('[data-study-action=submit]').click(); })()`);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events[0].outcome"), 'correct');
  await send('Page.reload');
  await waitFor("Boolean(document.querySelector('#study-open')) && document.querySelector('#detail').textContent.length > 0");
  await click('#study-open');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('本题记录已保存')"));
  await click('[data-study-action=next]');
  await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); const q=s.session.questions[1]; const ids=[q.options.find(o=>!q.answerIds.includes(o.id)).id, ...q.answerIds.slice(0,q.answerIds.length-1)]; for(const id of ids) [...document.querySelectorAll('[data-study-option]')].find(b=>b.dataset.studyOption===id).click(); document.querySelector('[data-study-action=submit]').click(); })()`);
  await click('[data-study-action=next]');
  await click('[data-study-action=uncertain]');
  const state = await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1'))");
  assert.deepEqual(state.events.map(e => e.outcome), ['correct', 'wrong', 'uncertain']);
  assert.ok(state.events.every(e => e.answeredAt.endsWith('Z')));
  await click('[data-study-action=next]');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('本轮完成')"));
  await click('[data-study-action=new]');
  await evaluate("document.querySelector('[name=count]').value='2'; document.querySelector('[name=mode]').value='zh-en'; document.querySelector('#study-settings').requestSubmit()");
  assert.ok(await evaluate("document.querySelectorAll('.study-options small').length === 4"));
  assert.ok(await evaluate("new Set([...document.querySelectorAll('.study-options small')].map(n=>n.textContent)).size === 1"));
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"), 'mobile page has no horizontal overflow');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'mobile-question.png'), Buffer.from(screenshot.data, 'base64'));
  await click('[data-study-action=stats]');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('掌握评分')"));
  await click('[data-study-action=close]');
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('main.shell')).display"), 'none');
  await click('#study-open');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.answers.length"), 0);
  // Simulate quota failure: do not advance or claim a successful save.
  await evaluate("Storage.prototype.setItem = function(){ throw new Error('test quota') }");
  await click('[data-study-action=uncertain]');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('本题尚未计入')"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 3);
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  assert.ok(!requests.some(url => /^https?:/.test(url)), 'static quiz uses no network resources');
  console.log('PASS: mobile layout, offline correct/wrong/unsure, UTC persistence, reload/resume, same-POS options, dictionary return, storage failure.');
  console.log(`Screenshot: ${path.join(output, 'mobile-question.png')}`);
} finally {
  socket?.close();
  browser.kill();
}
