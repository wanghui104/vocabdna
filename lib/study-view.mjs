import { POS_LABELS, createQuestionBank, answerQuestion, emptyState, readState, saveState, wordStats, STORAGE_KEY } from './study-engine.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { correct: '答对', wrong: '答错', uncertain: '不确定' };
const modeLabels = { 'en-zh': '英文 → 中文', 'zh-en': '中文＋词性 → 英文', mixed: '混合方向' };

export function mountStudy(host, catalog, supplement, onClose) {
  const bank = createQuestionBank(catalog, supplement);
  let state = emptyState(), storage, blocked = false, error = '', selected = [], feedback = false;
  let count = 20, mode = 'en-zh', statistics = false;
  try { storage = window.localStorage; state = readState(storage); feedback = Boolean(state.session?.answers.length); }
  catch (e) { blocked = true; error = `${e.message} 无法安全保存学习记录，暂不能开始答题。`; }

  function commit(next) {
    if (blocked) return false;
    try {
      const current = readState(storage);
      if (JSON.stringify(current) !== JSON.stringify(state)) {
        state = current; selected = []; feedback = Boolean(state.session?.answers.length);
        error = '另一窗口已修改本轮或记录，已载入最新状态。请重新作答。';
        return false;
      }
      saveState(storage, next); state = next; error = ''; return true;
    }
    catch { error = '学习记录未保存（存储空间不足或浏览器禁止存储）。本题尚未计入，请保留页面并重试；可先导出已有记录。'; return false; }
  }
  const action = (key, label, disabled = false) => `<button type="button" data-study-action="${key}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function render() {
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
        <div class="study-feedback study-${a.outcome}" role="status"><strong>${labels[a.outcome]}</strong><p>正确答案：${q.senses.map(s => escape(`${q.word} — ${s.zh} (${POS_LABELS[s.pos]})`)).join('<br>')}</p>
        ${a.selected.length ? `<p>你的选择：${a.selected.map(o => escape(`${o.word} — ${o.zh}`)).join('<br>')}</p>` : ''}</div>
        <p>累计：答对 ${s.correct} · 答错 ${s.wrong} · 不确定 ${s.uncertain} · 掌握评分 ${Math.round(s.mastery * 100)}%</p>
        <p class="study-muted">本题记录已保存 · ${escape(new Date(a.answeredAt).toLocaleString())}</p>
        ${action('next', session.answers.length === session.questions.length ? '查看本轮结果' : '下一题')}`;
    } else if (session.answers.length === session.questions.length) {
      const totals = { correct: 0, wrong: 0, uncertain: 0 };
      session.answers.forEach(a => totals[a.outcome]++);
      body = `<h2>本轮完成</h2><p>${session.questions.length} 个单词 · 答对 ${totals.correct} · 答错 ${totals.wrong} · 不确定 ${totals.uncertain}</p>
        <ul class="study-results">${session.answers.map(a => `<li><strong>${escape(a.word)}</strong><span>${labels[a.outcome]}</span></li>`).join('')}</ul>
        ${action('new', '设置下一轮')}<p class="study-muted">所有测试历史均已保留，结束本轮不会清除记录。</p>`;
    } else {
      const q = session.questions[session.answers.length];
      const multiple = q.answerIds.length === 2;
      body = `<p class="study-muted">${session.answers.length + 1} / ${session.questions.length} · ${modeLabels[q.direction]}</p>
        <progress max="${session.questions.length}" value="${session.answers.length}" aria-label="本轮进度"></progress>
        <h2 class="study-prompt">${escape(q.prompt)} <small>${POS_LABELS[q.pos]}</small></h2>
        <p>${multiple ? '请选择两个正确答案，然后提交。' : '请选择一个正确答案，然后提交。'}</p>
        <div class="study-options" role="group" aria-label="答案选项">${q.options.map((o, i) => `<button type="button" data-study-option="${escape(o.id)}" aria-pressed="${selected.includes(o.id)}" class="${selected.includes(o.id) ? 'study-selected' : ''}"><span>${String.fromCharCode(65 + i)}.</span> ${escape(q.direction === 'en-zh' ? o.zh : o.word)}${q.direction === 'zh-en' ? ` <small>${POS_LABELS[o.pos]}</small>` : ''}</button>`).join('')}</div>
        <div class="study-actions">${action('submit', '提交答案', selected.length !== q.answerIds.length)}${action('uncertain', '不确定')}</div>`;
    }
    host.innerHTML = `<section class="study-panel"><div class="study-toolbar"><h1>背单词</h1><div>${action('stats', '学习记录')}${action('export', '导出记录')}${action('close', '返回字典')}</div></div>
      ${error ? `<p class="study-error" role="alert">${escape(error)}</p>` : ''}${body}</section>`;
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
    const option = event.target.closest('[data-study-option]');
    if (option) {
      const q = state.session.questions[state.session.answers.length], id = option.dataset.studyOption;
      if (selected.includes(id)) selected = selected.filter(x => x !== id);
      else if (q.answerIds.length === 1) selected = [id];
      else if (selected.length < 2) selected.push(id);
      render(); return;
    }
    const key = event.target.closest('[data-study-action]')?.dataset.studyAction;
    if (!key) return;
    if (key === 'close') { onClose(); return; }
    if (key === 'export') { exportRecords(); return; }
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
        if (commit(next)) { feedback = true; selected = []; }
      } catch (e) { error = e.message; }
    }
    render();
    if (key === 'next') host.querySelector('.study-prompt')?.scrollIntoView({ block: 'nearest' });
  }
  function submit(event) {
    if (event.target.id !== 'study-settings') return;
    event.preventDefault();
    if (blocked) return;
    const settings = new FormData(event.target);
    count = Number(settings.get('count')); mode = settings.get('mode');
    try { if (commit({ ...state, session: bank.start(count, mode) })) { selected = []; feedback = false; } }
    catch (e) { error = e.message; }
    render();
  }
  // Prevent competing browser tabs from overwriting each other's history.
  function refresh(event) {
    if (event.key !== STORAGE_KEY) return;
    try { state = readState(storage); selected = []; feedback = Boolean(state.session?.answers.length); error = '学习记录已从另一窗口更新。'; }
    catch (e) { blocked = true; error = e.message; }
    render();
  }
  host.addEventListener('click', click); host.addEventListener('submit', submit);
  window.addEventListener('storage', refresh);
  render();
  return () => { host.removeEventListener('click', click); host.removeEventListener('submit', submit); window.removeEventListener('storage', refresh); };
}
