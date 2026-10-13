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
    throw new Error(`Timed out: ${expression}`);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: pathToFileURL(path.resolve('VocabDNA.html')).href });
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#study-open')) && document.querySelector('#detail').textContent.length > 0");
  await click('#study-open');
  assert.ok(await evaluate("document.querySelector('[data-study-action=mode-quick]').getAttribute('aria-pressed')==='true'"), 'quick mode is the default');
  await click('[data-study-action=mode-confirm]');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('main.shell')).display"), 'none');
  assert.equal(await evaluate("document.querySelector('[name=mode]').value"), 'en-zh');
  assert.equal(await evaluate("document.querySelector('[name=count]').value"), '20');
  await evaluate("document.querySelector('[name=count]').value = '3'; document.querySelector('#study-settings').requestSubmit()");
  await waitFor("Boolean(document.querySelector('[data-study-option]'))");
  await checkMobileQuestion();
  // Sync finishes after a question is already readable: status wrapping must not move it.
  assert.equal(await evaluate("document.querySelectorAll('[data-study-mark][aria-pressed=false]').length"), 2);
  const markScroll = await evaluate('scrollY');
  await click('[data-study-mark=important]');
  await click('[data-study-mark=mastered]');
  assert.equal(await evaluate("document.querySelectorAll('[data-study-mark][aria-pressed=true]').length"), 2);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 0, 'marks never submit answers');
  assert.equal(await evaluate('scrollY'), markScroll, 'marking never scrolls the question');
  assert.ok(await evaluate("[...document.querySelectorAll('[data-study-mark]')].every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44&&b.getAttribute('aria-label'))"));
  await click('[data-study-mark=mastered]');
  assert.equal(await evaluate("document.querySelector('[data-study-mark=mastered]').getAttribute('aria-pressed')"), 'false');
  assert.equal(await evaluate("document.querySelector('[data-study-mark=important]').getAttribute('aria-pressed')"), 'true');
  const stableTop = await evaluate("document.querySelector('.study-prompt').getBoundingClientRect().top");
  const stableScroll = await evaluate('scrollY');
  await evaluate("document.querySelector('[data-sync-status]').textContent='正在同步学习记录…'");
  await settleLayout();
  await evaluate("document.querySelector('[data-sync-status]').textContent='已同步 · 12:34:56 PM · 电脑与手机共享学习记录'");
  await evaluate('new Promise(resolve=>setTimeout(resolve, 650))');
  assert.ok(Math.abs(await evaluate("document.querySelector('.study-prompt').getBoundingClientRect().top") - stableTop) < 1, 'delayed sync completion never pushes the question down');
  assert.ok(Math.abs(await evaluate('scrollY') - stableScroll) < 1, 'sync completion never scrolls the question');
  // Simulate Safari chrome changing the visual viewport after a tap.
  await evaluate("window.studyViewportHeight=visualViewport.height; Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>window.studyViewportHeight-70}); visualViewport.dispatchEvent(new Event('resize'))");
  await settleLayout();
  assert.ok(Math.abs(await evaluate("document.querySelector('.study-prompt').getBoundingClientRect().top") - stableTop) < 1, 'viewport height changes keep the question stationary');
  await evaluate("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))");
  await settleLayout();
  await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); s.session.questions[0]=${JSON.stringify(hintQuestion)}; s.session.questions[1]=${JSON.stringify(noHintQuestion)}; localStorage.setItem('vocabdna-study-v1',JSON.stringify(s)); })()`);
  await click('[data-study-action=close]'); await click('#study-open');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  assert.ok(await evaluate("!document.querySelector('.study-example')"));
  await click('[data-study-option]');
  await click('[data-study-action=example]');
  assert.ok(await evaluate("Boolean(document.querySelector('[data-study-option][aria-pressed=true]'))"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 0);
  assert.equal(await evaluate("document.querySelector('.study-example p').textContent"), getQuestionExamples(hintQuestion, catalog)[0].text);
  const hintScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'mobile-example.png'), Buffer.from(hintScreenshot.data, 'base64'));
  await send('Page.reload');
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#study-open')) && document.querySelector('#detail').textContent.length > 0");
  await click('#study-open');
  assert.ok(await evaluate("Boolean(document.querySelector('.study-example'))"));
  // Correct, wrong, unsure; inspect persisted question IDs solely to make test deterministic.
  await settleLayout();
  await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('vocabdna-study-v1')); const q=s.session.questions[0]; for(const id of q.answerIds) [...document.querySelectorAll('[data-study-option]')].find(b=>b.dataset.studyOption===id).click(); })()`);
  await settleLayout();
  const correctRect = await evaluate(`(() => { const q=JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.questions[0]; return [...document.querySelectorAll('[data-study-option]')].find(b=>q.answerIds.includes(b.dataset.studyOption)).getBoundingClientRect().toJSON(); })()`);
  const reviewPrompt = await evaluate("document.querySelector('.study-prompt').textContent");
  const reviewTop = await evaluate("document.querySelector('.study-prompt').getBoundingClientRect().top");
  await click('[data-study-action=submit]');
  await settleLayout();
  assert.ok(await evaluate("Boolean(document.querySelector('.study-correct-review')) && document.querySelectorAll('.study-gold').length===2"), 'old prompt and correct option stay highlighted');
  assert.equal(await evaluate("document.querySelector('.study-prompt').textContent"), reviewPrompt);
  assert.equal(await evaluate("document.querySelector('.study-prompt').getBoundingClientRect().top"), reviewTop);
  await evaluate("document.querySelector('[data-study-option]').dispatchEvent(new MouseEvent('click',{bubbles:true})); document.querySelector('[data-study-action=uncertain]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 1, 'review locks repeated input');
  assert.equal(await evaluate("document.querySelector('.study-reward-float').textContent"), 'EXP +1铜币 +1本词累计答对 1 / 1 次');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.study-reward-layer')).pointerEvents"), 'none');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.study-reward-float')).animationDuration"), '1.5s');
  assert.ok(await evaluate(`document.querySelector('.study-reward-float').getBoundingClientRect().top <= ${correctRect.top}`), 'reward originates above the correct option');
  await checkMobileQuestion();
  const rewardScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'mobile-reward.png'), Buffer.from(rewardScreenshot.data, 'base64'));
  await waitFor("!document.querySelector('.study-correct-review')");
  assert.ok(await evaluate("Boolean(document.querySelector('.study-reward-float')) && !document.querySelector('[data-study-action=next]')"), 'next question starts before the 1.5-second reward ends');
  await waitFor("!document.querySelector('.study-reward-float')");
  assert.ok(await evaluate("document.querySelector('[data-study-rewards]').textContent.includes('EXP 1 · 铜币 1')"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events[0].outcome"), 'correct');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events[0].exampleViewed"), true);
  await send('Page.reload');
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#study-open')) && document.querySelector('#detail').textContent.length > 0");
  await click('#study-open');
  assert.ok(await evaluate("Boolean(document.querySelector('[data-study-option]')) && !document.querySelector('.study-reward-float')"), 'reload resumes next question without replaying rewards');
  await checkMobileQuestion();
  assert.ok(await evaluate("document.querySelector('[data-study-action=example]').disabled"));
  await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); const q=s.session.questions[1]; const ids=[q.options.find(o=>!q.answerIds.includes(o.id)).id, ...q.answerIds.slice(0,q.answerIds.length-1)]; for(const id of ids) [...document.querySelectorAll('[data-study-option]')].find(b=>b.dataset.studyOption===id).click(); document.querySelector('[data-study-action=submit]').click(); })()`);
  assert.ok(await evaluate("Boolean(document.querySelector('.study-wrong')) && !document.querySelector('.study-reward-float')"));
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
  // Desktop uses the same separated cards and focuses the quiz on entry.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('[data-study-action=close]'); await click('#study-open');
  await checkMobileQuestion();
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.study-actions')).position"), 'fixed');
  const desktopScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'desktop-quiz.png'), Buffer.from(desktopScreenshot.data, 'base64'));
  await evaluate('window.scrollTo(0, 0)'); await settleLayout();
  assert.ok(await evaluate("document.querySelector('.study-management').getBoundingClientRect().top >= document.querySelector('body > header').getBoundingClientRect().bottom"), 'scrolling up exposes management actions');
  await click('[data-study-action=stats]');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('掌握评分')"));
  await click('[data-study-action=back]');
  await checkMobileQuestion();
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Five long options: fixed actions, scroll preserved, final option never covered.
  await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); s.session.questions[0]=${JSON.stringify(longQuestion)}; localStorage.setItem('vocabdna-study-v1',JSON.stringify(s)); })()`);
  await click('[data-study-action=close]'); await click('#study-open');
  assert.equal((await checkMobileQuestion()).position, 'fixed');
  const longScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'mobile-long-question.png'), Buffer.from(longScreenshot.data, 'base64'));
  await evaluate('window.scrollBy(0, 70)'); await settleLayout();
  const beforeSelection = await evaluate('window.scrollY');
  await click('[data-study-option]'); await settleLayout();
  assert.ok(Math.abs(await evaluate('window.scrollY') - beforeSelection) < 2, 'selecting an option does not move the page');
  await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)'); await settleLayout();
  assert.ok(await evaluate("document.querySelector('.study-options button:last-child').getBoundingClientRect().bottom <= document.querySelector('.study-actions').getBoundingClientRect().top"), 'last option can be scrolled clear of the footer');
  // Orientation changes recalculate without introducing a new auto-scroll.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await settleLayout();
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.study-actions')).position"), 'fixed');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await settleLayout();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.study-actions')).position"), 'fixed');
  // Simulate quota failure: do not advance or claim a successful save.
  await evaluate("window.studyOriginalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(){ throw new Error('test quota') }");
  await click('[data-study-action=uncertain]');
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('本题尚未计入')"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), 3);
  assert.ok(await evaluate("!document.querySelector('.study-reward-float')"), 'failed saves never pay rewards');
  await evaluate('Storage.prototype.setItem = window.studyOriginalSetItem');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('[data-study-action=close]'); await click('#study-open'); await settleLayout();
  const selectCorrect = () => evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); const q=s.session.questions[s.session.answers.length]; for (const id of q.answerIds) { const b=[...document.querySelectorAll('[data-study-option]')].find(b=>b.dataset.studyOption===id); if (b.getAttribute('aria-pressed') !== 'true') b.click(); } })()`);
  await selectCorrect(); await settleLayout(); await click('[data-study-action=submit]'); await settleLayout();
  assert.ok(await evaluate("Boolean(document.querySelector('.study-reward-float')) && Boolean(document.querySelector('.study-correct-review'))"), 'desktop shows the gold review with rewards');
  const desktopRewardScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'desktop-reward.png'), Buffer.from(desktopRewardScreenshot.data, 'base64'));
  await waitFor("!document.querySelector('.study-correct-review')");
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await selectCorrect(); await settleLayout(); await click('[data-study-action=submit]'); await settleLayout();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.study-gold')).animationName"), 'none', 'reduced motion retains static gold highlighting');
  await waitFor("!document.querySelector('.study-correct-review')");
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('本轮完成') && !document.querySelector('[data-study-action=next]')"), 'last correct answer goes straight to round summary');
  assert.ok(await evaluate("[...document.querySelectorAll('.study-reward-float')].every(n=>getComputedStyle(n).animationName==='study-reward-fade')"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.filter(e=>e.reward).length"), 3);
  // Fast mode: direct single-answer settlement, cancellation and safe mode changes for 5 choose 2.
  await click('[data-study-action=new]');
  await evaluate("document.querySelector('[name=count]').value='3'; document.querySelector('#study-settings').requestSubmit()");
  await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); s.session.questions=[${JSON.stringify(hintQuestion)},${JSON.stringify(longQuestion)},${JSON.stringify(hintQuestion)}]; localStorage.setItem('vocabdna-study-v1',JSON.stringify(s)); })()`);
  await click('[data-study-action=close]'); await click('#study-open');
  await click('[data-study-action=mode-quick]'); await settleLayout();
  assert.ok(await evaluate("!document.querySelector('[data-study-action=submit]') && Boolean(document.querySelector('[data-study-action=uncertain]'))"));
  const fastBaseline = await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length");
  await selectCorrect(); await settleLayout();
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.answers.length"), 1, 'single click settles and advances on desktop');
  await waitFor("!document.querySelector('.study-correct-review')");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('[data-study-action=close]'); await click('#study-open'); await settleLayout();
  const multiFirst = await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.questions[1].answerIds[0]");
  await click(`[data-study-option="${multiFirst}"]`); await settleLayout();
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('已选 1/2')"));
  await click(`[data-study-option="${multiFirst}"]`); await settleLayout();
  assert.ok(await evaluate("document.querySelector('#study-host').textContent.includes('已选 0/2')"));
  await click(`[data-study-option="${multiFirst}"]`); await click('[data-study-action=mode-confirm]'); await settleLayout();
  assert.ok(await evaluate("!document.querySelector('[data-study-option][aria-pressed=true]') && document.querySelector('[data-study-action=submit]').disabled"), 'mode change clears pending choices');
  await click(`[data-study-option="${multiFirst}"]`); await click('[data-study-action=mode-quick]'); await settleLayout();
  assert.ok(await evaluate("!document.querySelector('[data-study-option][aria-pressed=true]') && !document.querySelector('[data-study-action=submit]')"));
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), fastBaseline + 1);
  const fastScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  assert.ok(await evaluate("document.querySelector('[data-study-action=uncertain]').getBoundingClientRect().bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth"), 'mobile fast mode keeps unsure visible without overflow');
  await writeFile(path.join(output, 'mobile-fast-mode.png'), Buffer.from(fastScreenshot.data, 'base64'));
  await selectCorrect(); await settleLayout();
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.answers.length"), 2, 'second distinct selection settles the pair once');
  assert.equal(await evaluate("document.querySelectorAll('.study-options .study-gold').length"), 2, 'both correct options stay clear in five choose two');
  await waitFor("!document.querySelector('.study-correct-review')");
  const wrongId = await evaluate("(() => {const q=JSON.parse(localStorage.getItem('vocabdna-study-v1')).session.questions[2]; return q.options.find(o=>!q.answerIds.includes(o.id)).id;})()");
  await click(`[data-study-option="${wrongId}"]`); await settleLayout();
  assert.ok(await evaluate("Boolean(document.querySelector('.study-wrong')) && Boolean(document.querySelector('[data-study-action=next]'))"), 'fast wrong answer pauses in feedback');
  await click('[data-study-action=next]'); await click('[data-study-action=new]');
  await evaluate("document.querySelector('[name=count]').value='1'; document.querySelector('#study-settings').requestSubmit()");
  await click('[data-study-action=uncertain]'); await settleLayout();
  assert.ok(await evaluate("Boolean(document.querySelector('.study-uncertain')) && Boolean(document.querySelector('[data-study-action=next]'))"), 'fast unsure answer pauses in feedback');
  await click('[data-study-action=close]'); await click('#study-open');
  assert.equal(await evaluate("document.querySelector('[data-study-action=mode-quick]').getAttribute('aria-pressed')"), 'true', 'answer mode survives remount');
  // A long completed round offers the next-round action at both ends on both devices.
  const beforeLongRound = await evaluate("localStorage.getItem('vocabdna-study-v1')");
  for (const device of [{ width: 390, height: 844, mobile: true }, { width: 1440, height: 1000, mobile: false }]) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: device.mobile ? 'no-preference' : 'reduce' }] });
    await send('Emulation.setDeviceMetricsOverride', { ...device, deviceScaleFactor: 1 });
    await evaluate(`(() => { const s=JSON.parse(${JSON.stringify(beforeLongRound)}); s.events.push(...${JSON.stringify(completedRound.answers)}); s.session=${JSON.stringify(completedRound)}; localStorage.setItem('vocabdna-study-v1',JSON.stringify(s)); })()`);
    await click('[data-study-action=close]'); await click('#study-open');
    await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await click('[data-study-action=next]'); await settleLayout();
    assert.equal(await evaluate("document.querySelectorAll('.study-round-summary [data-study-action=new]').length"), 2);
    assert.ok(await evaluate("document.querySelector('.study-round-next button').getBoundingClientRect().bottom <= innerHeight"), 'summary opens with next-round action visible');
    assert.ok(await evaluate("document.querySelector('[data-study-action=summary-top]').hidden"));
    const topScreenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(output, `${device.mobile ? 'mobile' : 'desktop'}-round-summary.png`), Buffer.from(topScreenshot.data, 'base64'));
    await evaluate('window.scrollBy(0, innerHeight + 100)'); await settleLayout();
    await waitFor("!document.querySelector('[data-study-action=summary-top]').hidden");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-study-action=summary-top]')).position"), 'fixed');
    assert.ok(await evaluate("document.querySelector('[data-study-action=summary-top]').getBoundingClientRect().bottom <= innerHeight"));
    await click('[data-study-action=summary-top]');
    await waitFor("document.querySelector('[data-study-action=summary-top]').hidden && document.querySelector('.study-round-next button').getBoundingClientRect().top >= document.querySelector('body > header').getBoundingClientRect().bottom && document.querySelector('.study-round-next button').getBoundingClientRect().bottom < innerHeight");
    const savedEvents = await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length");
    await click('.study-round-next [data-study-action=new]'); await settleLayout();
    assert.ok(await evaluate("Boolean(document.querySelector('#study-settings')) && !document.querySelector('[data-study-action=summary-top]')"));
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('vocabdna-study-v1')).events.length"), savedEvents, 'starting next round retains history');
    // Restore the completed round and verify the bottom action as well.
    await evaluate(`(() => { const s=JSON.parse(localStorage.getItem('vocabdna-study-v1')); s.session=${JSON.stringify(completedRound)}; localStorage.setItem('vocabdna-study-v1',JSON.stringify(s)); })()`);
    await click('[data-study-action=close]'); await click('#study-open'); await click('[data-study-action=next]');
    await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)'); await settleLayout();
    await click('.study-round-summary > [data-study-action=new]'); await settleLayout();
    assert.ok(await evaluate("document.querySelector('#study-settings').getBoundingClientRect().top >= 0 && document.querySelector('#study-settings').getBoundingClientRect().bottom <= innerHeight"), 'bottom next-round action focuses settings');
  }
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  assert.ok(!requests.some(url => /^https?:/.test(url)), 'static quiz uses no network resources');
  console.log('PASS: desktop/mobile fast and confirmation modes, two-choice cancellation, mode persistence, rewards, offline results, resume, dictionary return, storage failure.');
  console.log(`Screenshot: ${path.join(output, 'mobile-question.png')}`);
} finally {
  socket?.close();
  browser.kill();
}
