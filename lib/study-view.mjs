import { POS_LABELS, createQuestionBank, answerQuestion, emptyState, readState, saveState, wordStats, rewardTotals, STORAGE_KEY, mergeEvents, getQuestionExamples, revealExample, wordMarks, setWordMark, mergeMarkEvents } from './study-engine.mjs';
import { createStudySync } from './study-sync.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { correct: '答对', wrong: '答错', uncertain: '不确定' };
const modeLabels = { 'en-zh': '英文 → 中文', 'zh-en': '中文＋词性 → 英文', mixed: '混合方向' };
const ANSWER_MODE_KEY = 'vocabdna-answer-mode-v1';

export function mountStudy(host, catalog, supplement, onClose) {
  const bank = createQuestionBank(catalog, supplement);
  let state = emptyState(), storage, blocked = false, error = '', selected = [], feedback = false;
  let count = 20, mode = 'en-zh', statistics = false;
  let syncStatus = '学习记录保存在本机', sync;
  let layoutFrame;
  let layoutWidth = 0, layoutHeight = 0;
  let feedbackAnchor;
  let answerMode = 'quick';
  let reviewing = false, reviewTimer;
  function clearReview() {
    clearTimeout(reviewTimer); reviewing = false;
    host.classList.remove('study-reviewing');
    rewardLayer.querySelector('.study-review-recap')?.remove();
  }
  function reviewCorrect(correctButtons, rewardRect, answer) {
    cancelAnimationFrame(layoutFrame);
    reviewing = true;
    host.classList.add('study-reviewing');
    const card = host.querySelector('.study-quiz-panel');
    card.classList.add('study-correct-review');
    card.setAttribute('aria-busy', 'true');
    card.querySelector('.study-prompt').classList.add('study-gold');
    correctButtons.forEach(button => {
      button.classList.add('study-selected', 'study-gold');
      button.setAttribute('aria-pressed', 'true');
    });
    // Long questions can leave the prompt or a selected option outside the view.
    // Repeat both together without scrolling the old page during the brief review.
    const prompt = card.querySelector('.study-prompt');
    const header = host.closest('main')?.querySelector('header') || document.querySelector('body > header');
    const top = Math.max(window.visualViewport?.offsetTop || 0, header?.getBoundingClientRect().bottom || 0) + 12;
    const bottom = (window.visualViewport?.offsetTop || 0) + (window.visualViewport?.height || window.innerHeight);
    if ([prompt, ...correctButtons].some(node => { const rect = node.getBoundingClientRect(); return rect.top < top || rect.bottom > bottom; })) {
      const recap = document.createElement('div');
      recap.className = 'study-review-recap'; recap.style.top = `${top}px`;
      recap.setAttribute('role', 'status');
      recap.innerHTML = `<strong>${escape(prompt.textContent)}</strong>${correctButtons.map(button => `<div>${escape(button.textContent)}</div>`).join('')}`;
      rewardLayer.append(recap);
    }
    host.querySelectorAll('button:not([data-study-action="close"])').forEach(button => { button.disabled = true; });
    updateRewards();
    floatReward(rewardRect, answer);
    reviewTimer = setTimeout(() => {
      clearReview();
      render({ positionQuestion: true });
    }, 750);
  }
  const needsFeedback = () => !(location.hash === '#study/summary' && state.session?.answers.length === state.session?.questions.length) && Boolean(state.session?.answers.at(-1) && state.session.answers.at(-1).outcome !== 'correct');
  const rewardLayer = document.createElement('div');
  rewardLayer.className = 'study-reward-layer';
  rewardLayer.setAttribute('aria-live', 'polite');
  rewardLayer.setAttribute('aria-atomic', 'false');
  document.body.append(rewardLayer);
  const rewardTimers = new Set();
  function floatReward(rect, answer) {
    const stats = wordStats(state.events).find(s => s.wordId === answer.wordId);
    const notice = document.createElement('div');
    notice.className = 'study-reward-float';
    const offset = (rewardLayer.children.length % 3) * 14;
    notice.style.left = `${Math.max(8, Math.min(window.innerWidth - 248, rect.left + rect.width / 2 - 120 + offset))}px`;
    notice.style.top = `${Math.max(80, Math.min(window.innerHeight - 90, rect.top - 82))}px`;
    notice.innerHTML = `<span class="study-exp">EXP +1</span><span class="study-copper">铜币 +1</span><span class="study-reward-stat">本词累计答对 ${stats.correct} / ${stats.total} 次</span>`;
    rewardLayer.append(notice);
    const timer = setTimeout(() => { notice.remove(); rewardTimers.delete(timer); }, 1500);
    rewardTimers.add(timer);
  }
  function updateRewards() {
    const total = rewardTotals(state.events);
    const display = host.querySelector('[data-study-rewards]');
    if (display) display.textContent = `EXP ${total.exp} · 铜币 ${total.copper}`;
  }
  const mobile = () => window.matchMedia('(max-width: 767px)').matches;
  function summaryContentTop() {
    const header = host.closest('main')?.querySelector('header') || document.querySelector('body > header');
    return Math.max(window.visualViewport?.offsetTop || 0, header?.getBoundingClientRect().bottom || 0) + 12;
  }
  function updateSummaryTop() {
    const summary = host.querySelector('.study-round-summary');
    const button = host.querySelector('[data-study-action="summary-top"]');
    if (button) button.hidden = !summary || summaryContentTop() - summary.getBoundingClientRect().top < (window.visualViewport?.height || window.innerHeight);
  }
  function positionSummary(smooth = false) {
    const summary = host.querySelector('.study-round-summary') || host.querySelector('#study-settings')?.closest('.study-panel');
    if (!summary) return;
    const top = summaryContentTop();
    summary.style.minHeight = `${Math.max(0, (window.visualViewport?.height || window.innerHeight) - top - 12)}px`;
    window.scrollTo({ top: Math.max(0, window.scrollY + summary.getBoundingClientRect().top - top), behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
    updateSummaryTop();
  }
  function arrangeQuestion({ position = false, restoreScroll } = {}) {
    if (reviewing) return;
    cancelAnimationFrame(layoutFrame);
    const question = host.querySelector('.study-question');
    if (!question) { if (position) positionSummary(); updateSummaryTop(); return; }
    const card = question.closest('.study-quiz-panel');
    const actions = question.querySelector('.study-actions');
    const body = question.querySelector('.study-question-body');
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const header = host.closest('main')?.querySelector('header') || document.querySelector('body > header');
    const contentTop = Math.max(viewportTop, header?.getBoundingClientRect().bottom || 0) + 12;
    const available = Math.max(0, viewportBottom - contentTop - 12);
    // iPhone browser chrome can change viewport height after a tap. Keep the
    // scrollable floor so that this never clamps scrollY and moves the question.
    if (layoutWidth !== window.innerWidth) { layoutWidth = window.innerWidth; layoutHeight = 0; }
    layoutHeight = Math.max(layoutHeight, available);
    card.style.minHeight = `${layoutHeight}px`;
    const cardStyle = getComputedStyle(card);
    const padding = parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom) + card.querySelector('.study-answer-mode').offsetHeight + 16;
    question.classList.remove('study-question-docked');
    question.classList.toggle('study-question-docked', mobile() && body.offsetHeight + actions.offsetHeight + padding + 12 > available);
    question.style.setProperty('--study-actions-height', `${actions.offsetHeight}px`);
    // Complete layout and position synchronously, before the new question paints.
    if (position) {
      window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - contentTop), behavior: 'instant' });
    } else if (restoreScroll !== undefined) {
      window.scrollTo({ top: restoreScroll, behavior: 'instant' });
    }
  }
  const resizeQuestion = () => {
    if (reviewing) return;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => arrangeQuestion());
  };
  try { storage = window.localStorage; state = readState(storage); feedback = needsFeedback(); answerMode = storage.getItem(ANSWER_MODE_KEY) === 'confirm' ? 'confirm' : 'quick'; }
  catch (e) { blocked = true; error = `${e.message} 无法安全保存学习记录，暂不能开始答题。`; }

  function commit(next) {
    if (blocked) return false;
    try {
      const current = readState(storage);
      if (JSON.stringify(current) !== JSON.stringify(state)) {
        state = current; selected = []; feedback = needsFeedback();
        error = '另一窗口已修改本轮或记录，已载入最新状态。请重新作答。';
        return false;
      }
      saveState(storage, next); state = next; error = ''; queueMicrotask(() => sync?.sync()); return true;
    }
    catch { error = '学习记录未保存（存储空间不足或浏览器禁止存储）。本题尚未计入，请保留页面并重试；可先导出已有记录。'; return false; }
  }
  const action = (key, label, disabled = false) => `<button type="button" data-study-action="${key}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function markControls(q) {
    const marks = wordMarks(state.markEvents).get(q.wordId) || {};
    const star = '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>';
    const check = '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>';
    return `<div class="study-marks" role="group" aria-label="可选单词标记：星形为重要，勾选为已熟练；再次点击取消">${[['important', '重要', star], ['mastered', '已熟练（自评）', check]].map(([mark, label, svg]) => `<button type="button" data-study-mark="${mark}" data-word-id="${escape(q.wordId)}" aria-pressed="${Boolean(marks[mark])}" aria-label="${label}" title="${label}：点击标记，再次点击取消" ${blocked ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">${svg}</svg></button>`).join('')}</div>`;
  }
  function updateMarks() {
    const marks = wordMarks(state.markEvents);
    host.querySelectorAll('[data-study-mark]').forEach(button => button.setAttribute('aria-pressed', String(Boolean(marks.get(button.dataset.wordId)?.[button.dataset.studyMark]))));
  }
  function exampleHint(q) {
    const examples = getQuestionExamples(q, catalog);
    if (!examples.length) return `<div class="study-hint">${action('example', '查看例句', true)}<span class="study-muted">本题暂无可用例句</span></div>`;
    return `<div class="study-hint"><button type="button" data-study-action="example" aria-expanded="${Boolean(q.exampleViewedAt)}">查看例句</button>
      ${q.exampleViewedAt ? `<div class="study-example" role="status">${examples.map(e => `<p lang="en">${escape(e.text)}</p>`).join('')}<small>目标词已用 _____ 遮住</small></div>` : ''}</div>`;
  }
  function render({ positionQuestion = false, preserveScroll = false } = {}) {
    if (reviewing) return;
    const previousScroll = window.scrollY;
    const session = state.session;
    const stats = wordStats(state.events);
    let body = '';
    if (statistics) {
      body = `<h2>学习记录</h2><p>已测试 ${stats.length} 个单词，共 ${state.events.length} 次。掌握评分＝（答对＋0.2 × 不确定）÷总次数。</p>
        <div class="study-scroll"><table><thead><tr><th>单词</th><th>对 / 错 / 不确定</th><th>掌握评分</th><th>正确率</th><th>最近测试</th></tr></thead><tbody>${stats.sort((a, b) => b.lastAnsweredAt.localeCompare(a.lastAnsweredAt)).map(s => `<tr><td>${escape(s.word)}</td><td>${s.correct} / ${s.wrong} / ${s.uncertain}</td><td>${Math.round(s.mastery * 100)}%</td><td>${Math.round(s.accuracy * 100)}%</td><td>${escape(new Date(s.lastAnsweredAt).toLocaleString())}</td></tr>`).join('')}</tbody></table></div>${action('back', '返回背单词')}`;
    } else if (!session) {
      body = `<h2>开始背单词</h2><p>随机抽词，同轮不重复。答题后立即保存结果和时间，支持中途继续。</p>
        <form id="study-settings"><label>本轮单词数<input name="count" type="number" min="1" max="${bank.size}" step="1" value="${count}" required></label>
        <label>出题方向<select name="mode">${Object.entries(modeLabels).map(([key, label]) => `<option value="${key}" ${key === mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <button type="submit" ${blocked ? 'disabled' : ''}>开始本轮</button></form>
        <p class="study-muted">可用 ${bank.size} 个词。缺少明确释义词性标签的内容暂不出题。四选一；考查两个独立释义时五选二。</p>
        <p class="study-muted">干扰项优先来自词库随机词、关联词和本地补充词库；某类不足时由其他来源补足。</p>`;
    } else if (feedback) {
      const a = session.answers.at(-1), q = session.questions[a.questionIndex];
      const s = stats.find(s => s.wordId === q.wordId);
      body = `<p class="study-muted">${a.questionIndex + 1} / ${session.questions.length} · ${modeLabels[q.direction]}</p>
        <h2 class="study-prompt">${escape(q.prompt)} <small>${POS_LABELS[q.pos]}</small></h2>
        ${markControls(q)}<div class="study-feedback study-${a.outcome}" role="status"><strong>${labels[a.outcome]}</strong><p>正确答案：${q.senses.map(s => escape(`${q.word} — ${s.zh} (${POS_LABELS[s.pos]})`)).join('<br>')}</p>
        ${a.selected.length ? `<p>你的选择：${a.selected.map(o => escape(`${o.word} — ${o.zh}`)).join('<br>')}</p>` : ''}</div>
        <p>累计：答对 ${s.correct} · 答错 ${s.wrong} · 不确定 ${s.uncertain} · 掌握评分 ${Math.round(s.mastery * 100)}%</p>
        <p class="study-muted">本题记录已保存 · ${escape(new Date(a.answeredAt).toLocaleString())}</p>
        ${a.exampleViewed ? '<p class="study-muted">本题使用过例句提示</p>' : ''}
        <div class="study-feedback-actions" ${feedbackAnchor ? `style="left:${feedbackAnchor.left}px;top:${feedbackAnchor.top}px;width:${feedbackAnchor.width}px;height:${feedbackAnchor.height}px"` : ''}>${action('next', session.answers.length === session.questions.length ? '查看本轮结果' : '下一题')}</div><div class="study-feedback-space" aria-hidden="true"></div>`;
    } else if (session.answers.length === session.questions.length) {
      const marks = wordMarks(state.markEvents);
      const totals = { correct: 0, wrong: 0, uncertain: 0 };
      session.answers.forEach(a => totals[a.outcome]++);
      body = `<h2>本轮完成</h2><p>${session.questions.length} 个单词 · 答对 ${totals.correct} · 答错 ${totals.wrong} · 不确定 ${totals.uncertain}</p>
        <div class="study-round-next">${action('new', '设置下一轮')}</div>
        <ul class="study-results">${session.answers.map(a => `<li><a class="study-result-word" href="#word/${encodeURIComponent(a.wordId)}" data-summary-word="${escape(a.wordId)}">${escape(a.word)}</a><span class="study-result-state"><span class="study-result-mark ${marks.get(a.wordId)?.important ? 'is-important' : ''}" aria-label="${marks.get(a.wordId)?.important ? '重要' : '未标记重要'}" title="${marks.get(a.wordId)?.important ? '重要' : '未标记重要'}">${marks.get(a.wordId)?.important ? '★' : '☆'}</span><span class="study-result-mark ${marks.get(a.wordId)?.mastered ? 'is-mastered' : ''}" aria-label="${marks.get(a.wordId)?.mastered ? '已熟练（自评）' : '未标记已熟练'}" title="${marks.get(a.wordId)?.mastered ? '已熟练（自评）' : '未标记已熟练'}">${marks.get(a.wordId)?.mastered ? '✓' : '○'}</span><span class="study-result-${a.outcome}">${labels[a.outcome]}</span></span></li>`).join('')}</ul>
        ${action('new', '设置下一轮')}<p class="study-muted">所有测试历史均已保留，结束本轮不会清除记录。</p>`;
    } else {
      const q = session.questions[session.answers.length];
      const multiple = q.answerIds.length === 2;
      body = `<section class="study-question" aria-label="单词测验"><div class="study-question-body"><p class="study-muted">${session.answers.length + 1} / ${session.questions.length} · ${modeLabels[q.direction]}</p>
        <progress max="${session.questions.length}" value="${session.answers.length}" aria-label="本轮进度"></progress>
        <h2 class="study-prompt">${escape(q.prompt)} <small>${POS_LABELS[q.pos]}</small></h2>
        <div class="study-question-tools">${exampleHint(q)}${markControls(q)}</div>
        <p>${answerMode === 'quick' ? (multiple ? `已选 ${selected.length}/2 · 选满两个即提交；再次点击已选项可取消。` : '点击一个选项即提交。') : (multiple ? `已选 ${selected.length}/2 · 请选择两个正确答案，然后提交。` : '请选择一个正确答案，然后提交。')}</p>
        <div class="study-options" role="group" aria-label="答案选项">${q.options.map((o, i) => `<button type="button" data-study-option="${escape(o.id)}" aria-pressed="${selected.includes(o.id)}" class="${selected.includes(o.id) ? 'study-selected' : ''}"><span>${String.fromCharCode(65 + i)}.</span> ${escape(q.direction === 'en-zh' ? o.zh : o.word)}${q.direction === 'zh-en' ? ` <small>${POS_LABELS[o.pos]}</small>` : ''}</button>`).join('')}</div>
        </div><div class="study-actions">${answerMode === 'confirm' ? action('submit', '提交答案', selected.length !== q.answerIds.length) : ''}${action('uncertain', '不确定')}</div></section>`;
    }
    const answering = session && !statistics && !feedback && session.answers.length < session.questions.length;
    const completed = session && !statistics && !feedback && session.answers.length === session.questions.length;
    host.innerHTML = `<section class="study-panel study-management" aria-label="学习管理"><div class="study-toolbar"><h1>背单词</h1><div>${action('stats', '学习记录')}${action('export', '导出记录')}${action('import', '导入记录')}${action('close', '返回字典')}</div></div>
      <div class="study-sync"><span data-sync-status role="status">${escape(syncStatus)}</span>${action('sync', '同步记录')}</div></section>
      <section class="study-panel ${answering ? 'study-quiz-panel' : ''} ${completed ? 'study-round-summary' : ''} ${feedback && !statistics ? 'study-feedback-panel' : ''}" ${feedback && !statistics && feedbackAnchor ? `style="min-height:${feedbackAnchor.cardHeight}px"` : ''} aria-label="背单词内容"><div class="study-answer-mode" role="group" aria-label="答题模式"><button type="button" data-study-action="mode-quick" aria-pressed="${answerMode === 'quick'}">快速模式</button><button type="button" data-study-action="mode-confirm" aria-pressed="${answerMode === 'confirm'}">确认模式</button></div>${error ? `<p class="study-error" role="alert">${escape(error)}</p>` : ''}${body}</section>${completed ? '<button type="button" class="study-back-top" data-study-action="summary-top" hidden aria-label="回到本轮完成页顶部">↑ 回到顶部</button>' : ''}`;
    if (feedback && !statistics && feedbackAnchor) window.scrollTo({ top: previousScroll, behavior: 'instant' });
    const rewards = document.createElement('p');
    rewards.className = 'study-reward-total'; rewards.dataset.studyRewards = '';
    host.querySelector('.study-management').append(rewards); updateRewards();
    arrangeQuestion({ position: positionQuestion, ...(preserveScroll ? { restoreScroll: previousScroll } : {}) });
  }

  function exportRecords() {
    let content = JSON.stringify(state, null, 2);
    if (blocked) { try { content = storage.getItem(STORAGE_KEY) || content; } catch { /* Export readable in-memory records. */ } }
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `VocabDNA-study-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function click(event) {
    let key = event.target.closest('[data-study-action]')?.dataset.studyAction;
    if (reviewing && key !== 'close') return;
    const option = event.target.closest('[data-study-option]');
    if (option) {
      if (blocked || feedback || statistics || !state.session || state.session.answers.length >= state.session.questions.length) return;
      const q = state.session.questions[state.session.answers.length], id = option.dataset.studyOption;
      if (selected.includes(id)) selected = selected.filter(x => x !== id);
      else if (q.answerIds.length === 1) selected = [id];
      else if (selected.length < 2) selected.push(id);
      if (answerMode === 'quick' && selected.length === q.answerIds.length) key = 'submit';
      else { render({ preserveScroll: true }); return; }
    }
    const markButton = event.target.closest('[data-study-mark]');
    if (markButton) {
      if (blocked) return;
      const { wordId, studyMark } = markButton.dataset;
      const value = Boolean(wordMarks(state.markEvents).get(wordId)?.[studyMark]);
      commit(setWordMark(state, wordId, studyMark, !value));
      render({ preserveScroll: true }); return;
    }
    if (!key) return;
    if (key === 'summary-top') {
      positionSummary(true);
      const title = host.querySelector('.study-round-summary h2');
      title?.setAttribute('tabindex', '-1'); title?.focus({ preventScroll: true });
      return;
    }
    if (key === 'mode-quick' || key === 'mode-confirm') {
      const nextMode = key === 'mode-quick' ? 'quick' : 'confirm';
      if (nextMode === answerMode) return;
      selected = []; answerMode = nextMode;
      try { storage?.setItem(ANSWER_MODE_KEY, answerMode); }
      catch { error = '答题模式已切换，但浏览器未能记住此设置。'; }
      render({ preserveScroll: true }); return;
    }
    if (key === 'close') { onClose(); return; }
    if (key === 'export') { exportRecords(); return; }
    if (key === 'sync') { void sync?.sync(); return; }
    if (key === 'import') { importRecords(); return; }
    if (key === 'example') {
      if (blocked || feedback || statistics) return;
      try { commit(revealExample(state, catalog)); } catch (e) { error = e.message; }
      render({ preserveScroll: true }); return;
    }
    if (key === 'stats') statistics = true;
    if (key === 'back') statistics = false;
    if (key === 'new') {
      if (commit({ ...state, session: null })) { feedback = false; selected = []; }
    }
    if (key === 'next') { feedback = false; selected = []; }
    if (key === 'submit' || key === 'uncertain') {
      if (blocked) { render(); return; }
      if (feedback || !state.session || state.session.answers.length >= state.session.questions.length) return;
      try {
        const a = answerQuestion(state.session, selected, key === 'uncertain');
        const next = { ...state, events: [...state.events, a], session: { ...state.session, answers: [...state.session.answers, a] } };
        const button = host.querySelector('[data-study-action="submit"]') || host.querySelector('[data-study-action="uncertain"]');
        const rect = button.getBoundingClientRect();
        const cardRect = button.closest('.study-quiz-panel').getBoundingClientRect();
        const anchor = { left: rect.left - cardRect.left - 1, top: rect.top - cardRect.top - 1, width: rect.width, height: rect.height, cardHeight: Math.max(cardRect.height, rect.bottom - cardRect.top + 96) };
        const q = state.session.questions[state.session.answers.length];
        const correctButtons = [...host.querySelectorAll('[data-study-option]')].filter(b => q.answerIds.includes(b.dataset.studyOption));
        const rewardRect = (correctButtons.find(b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }) || correctButtons[0]).getBoundingClientRect();
        if (commit(next)) {
          feedbackAnchor = anchor; feedback = a.outcome !== 'correct'; selected = [];
          if (!feedback) {
            reviewCorrect(correctButtons, rewardRect, a);
            return;
          }
        }
      } catch (e) { error = e.message; }
    }
    render({ positionQuestion: key === 'next' || key === 'back' || key === 'new' });
  }
  function submit(event) {
    if (reviewing) { event.preventDefault(); return; }
    if (event.target.id !== 'study-settings') return;
    event.preventDefault();
    if (blocked) return;
    const settings = new FormData(event.target);
    count = Number(settings.get('count')); mode = settings.get('mode');
    try { if (commit({ ...state, session: bank.start(count, mode, state) })) { selected = []; feedback = false; } }
    catch (e) { error = e.message; }
    render({ positionQuestion: Boolean(state.session && !feedback) });
  }
  function importRecords() {
    if (blocked) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 20_000_000) throw new Error('记录文件过大，请拆分后导入。');
        const text = await file.text();
        const imported = readState({ getItem: () => text });
        const current = readState(storage);
        state = current;
        const next = { ...current, events: mergeEvents(current.events, imported.events), markEvents: mergeMarkEvents(current.markEvents, imported.markEvents), session: current.session || imported.session };
        if (commit(next)) { error = '记录已导入；重复答题不会重复计数。'; feedback = needsFeedback(); }
      } catch (e) { error = `导入失败：${e.message}`; }
      render();
    };
    input.click();
  }
  // Prevent competing browser tabs from overwriting each other's history.
  function refresh(event) {
    if (event.key !== STORAGE_KEY) return;
    clearReview();
    try { state = readState(storage); selected = []; feedback = needsFeedback(); error = '学习记录已从另一窗口更新。'; }
    catch (e) { blocked = true; error = e.message; }
    render();
  }
  host.addEventListener('click', click); host.addEventListener('submit', submit);
  window.addEventListener('storage', refresh);
  window.addEventListener('resize', resizeQuestion);
  window.addEventListener('scroll', updateSummaryTop, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeQuestion);
  render({ positionQuestion: Boolean(state.session && !feedback) });
  if (!blocked) {
    sync = createStudySync(storage, next => { state = next; if (statistics || host.querySelector('.study-round-summary')) render({ preserveScroll: true }); else { updateRewards(); updateMarks(); } }, message => {
      syncStatus = message;
      const status = host.querySelector('[data-sync-status]');
      if (status) status.textContent = message;
    });
    void sync.sync();
  }
  return () => { clearReview(); cancelAnimationFrame(layoutFrame); rewardTimers.forEach(clearTimeout); rewardLayer.remove(); sync?.dispose(); host.removeEventListener('click', click); host.removeEventListener('submit', submit); window.removeEventListener('storage', refresh); window.removeEventListener('resize', resizeQuestion); window.removeEventListener('scroll', updateSummaryTop); window.visualViewport?.removeEventListener('resize', resizeQuestion); };
}
