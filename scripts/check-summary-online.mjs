// Standalone browser smoke test using an isolated headless profile; no packages needed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createQuestionBank, getQuestionExamples, answerQuestion } from '../lib/study-engine.mjs';
const catalog = JSON.parse(await readFile(new URL('../lib/study-catalog.json', import.meta.url), 'utf8'));
const supplement = JSON.parse(await readFile(new URL('../lib/study-supplement.json', import.meta.url), 'utf8'));
const completedRound = createQuestionBank(catalog, supplement).start(120, 'en-zh');
while (completedRound.answers.length < completedRound.questions.length) completedRound.answers.push(answerQuestion(completedRound, [], true));
const hintQuestion = createQuestionBank(catalog.filter(w => w.senses.every(s => s.example)), supplement).start(1, 'zh-en').questions[0];
const noHintQuestion = createQuestionBank(catalog.filter(w => w.senses.every(s => !s.example)), supplement).start(1, 'en-zh').questions[0];
const longQuestion = createQuestionBank(catalog, supplement).start(500, 'en-zh').questions.find(q => q.answerIds.length === 2);
assert.ok(longQuestion, 'five-option fixture is available');
longQuestion.options = longQuestion.options.map(o => ({ ...o, zh: o.zh + '；这里使用较长的释义来验证小屏幕上选项换行后仍然能够操作提交按钮。'.repeat(3) }));

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
    throw new Error(`Timed out: ${expression}; history=${JSON.stringify(await send("Page.getNavigationHistory"))}; exceptions=${JSON.stringify(exceptions)}; ${await evaluate("JSON.stringify({hash:location.hash,state:history.state,hidden:document.querySelector(\"#study-host\")?.hidden,body:document.querySelector(\"#study-host\")?.textContent.slice(-300)})")}`);
  }
  const click = async selector => {
    const result = await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)}).click()`, userGesture: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  };
  const settleLayout = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  async function checkMobileQuestion() {
    await settleLayout();
    const geometry = await evaluate(`(() => {
      const q=document.querySelector('.study-question'), b=document.querySelector('[data-study-action=submit]');
      return { top:q.getBoundingClientRect().top, header:document.querySelector('body > header').getBoundingClientRect().bottom,
        bottom:b.getBoundingClientRect().bottom, height:innerHeight, position:getComputedStyle(b.parentElement).position, scroll:scrollY, card:q.closest('.study-panel').getBoundingClientRect().toJSON(), min:q.closest('.study-panel').style.minHeight };
    })()`);
    assert.ok(geometry.top >= geometry.header - 2, 'new question is below the sticky header');
    assert.ok(geometry.bottom <= geometry.height, `submit button is visible without dragging: ${JSON.stringify(geometry)}`);
    assert.ok(await evaluate("!document.querySelector('.study-quiz-panel [data-study-action=stats]') && !document.querySelector('.study-quiz-panel [data-sync-status]')"), 'management controls are outside the quiz card');
    assert.ok(await evaluate("document.querySelector('.study-management').getBoundingClientRect().bottom <= document.querySelector('body > header').getBoundingClientRect().bottom"), 'management card is above the focused view');
    return geometry;
  }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:4317/' });
  await waitFor("document.documentElement.dataset.vocabdnaReady==='true' && Boolean(document.querySelector('.study-dictionary-return'))");
  for (const device of [{ width:390,height:844,mobile:true },{ width:1440,height:1000,mobile:false }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...device, deviceScaleFactor:1 });
    await evaluate("window.dispatchEvent(new CustomEvent('vocabdna-route',{detail:'#word/archaeology'}))"); await settleLayout();
    const state={version:1,events:completedRound.answers,session:completedRound,markEvents:[]};
    await evaluate(`localStorage.setItem('vocabdna-study-v1',${JSON.stringify(JSON.stringify(state))}); window.dispatchEvent(new CustomEvent('vocabdna-route',{detail:'#study/summary'}))`);
    await waitFor("Boolean(document.querySelector('.study-round-summary'))"); await settleLayout();
    await evaluate("document.querySelectorAll('[data-summary-word]')[50].scrollIntoView({block:'center'})"); await settleLayout();
    const position=await evaluate('scrollY');
    const word=await evaluate("document.querySelectorAll('[data-summary-word]')[50].textContent");
    const hash=await evaluate("'#word/'+document.querySelectorAll('[data-summary-word]')[50].dataset.summaryWord");
    await click('.study-results li:nth-child(51) [data-summary-word]'); await waitFor("!document.querySelector('.study-host') && !document.querySelector('.study-dictionary-return').hidden"); await settleLayout();
    assert.equal(await evaluate('location.hash'),hash);
    await evaluate('window.scrollTo(0,200)'); await settleLayout();
    const wordScroll=await evaluate('scrollY');
    const selector=await evaluate(`(() => { const buttons=[...document.querySelectorAll('section.min-w-0 .inline-link')]; const b=buttons.find(b=>b.textContent.trim()!==${JSON.stringify(word)}); b.dataset.onlineReviewLink=''; return '[data-online-review-link]'; })()`);
    await click(selector); await waitFor(`location.hash!==${JSON.stringify(hash)}`); await settleLayout();
    await click('[data-review-back]'); await waitFor(`location.hash===${JSON.stringify(hash)}`); await settleLayout();
    assert.ok(Math.abs(await evaluate('scrollY')-wordScroll)<2,'online nested back restores word scroll');
    await click('[data-review-back]'); await waitFor("Boolean(document.querySelector('.study-round-summary')) && location.hash==='#study/summary'"); await settleLayout();
    assert.ok(Math.abs(await evaluate('scrollY')-position)<2,'online summary restores scroll');
    await click('.study-results li:nth-child(51) [data-summary-word]'); await waitFor("!document.querySelector('.study-host')"); await settleLayout();
    const another=await evaluate(`(() => { const b=[...document.querySelectorAll('section.min-w-0 .inline-link')].find(b=>b.textContent.trim()!==${JSON.stringify(word)}); b.dataset.onlineReviewLink=''; return '[data-online-review-link]'; })()`);
    await click(another); await waitFor(`location.hash!==${JSON.stringify(hash)}`); await settleLayout();
    await click('[data-review-summary]'); await waitFor("Boolean(document.querySelector('.study-round-summary')) && location.hash==='#study/summary'"); await settleLayout();
    assert.ok(Math.abs(await evaluate('scrollY')-position)<2,'online direct return restores summary');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"),120);
  }
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: online React mobile/desktop nested lookup, back and direct summary return preserve position and answers.');
} finally { socket?.close(); browser.kill(); }
