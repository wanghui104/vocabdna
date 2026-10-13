// One history entry per dictionary route. Positions belong to the entry, not
// the word: the same word may be visited from several places in one review.
export function installSummaryNavigation({ showSummary, showDictionary }) {
  const key = 'vocabdnaReview';
  const originalRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  let current = history.state?.[key] || { index: 0, scroll: window.scrollY };
  let currentHash = location.hash;
  let restoring = false, frame, saveTimer, disposed = false;
  const write = entry => history.replaceState({ ...history.state, [key]: entry }, '');
  write(current);
  const controls = document.createElement('nav');
  controls.className = 'study-dictionary-return';
  controls.setAttribute('aria-label', '复习查词导航');
  controls.innerHTML = '<button type="button" data-review-back>← 返回</button><button type="button" data-review-summary>返回本轮总结</button>';
  document.body.append(controls);
  const update = () => {
    controls.hidden = current.summaryIndex === undefined || location.hash === '#study/summary';
    document.body.classList.toggle('study-dictionary-review', !controls.hidden);
  };
  const save = () => {
    clearTimeout(saveTimer);
    if (restoring || currentHash !== location.hash) return;
    current = { ...current, scroll: window.scrollY };
    write(current);
  };
  const scrolled = () => {
    if (restoring || currentHash !== location.hash) return;
    current = { ...current, scroll: window.scrollY };
    // Writing on every scroll frame exhausts browsers' history write limits,
    // which can then prevent even back/push navigation. Only persist review
    // positions after scrolling settles; explicit navigation flushes them.
    clearTimeout(saveTimer);
    if (current.summaryIndex !== undefined) saveTimer = setTimeout(save, 300);
  };
  const restore = scroll => {
    restoring = true; cancelAnimationFrame(frame);
    // React commits or the static renderer mounts the study view before this.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        window.scrollTo({ top: scroll, behavior: 'instant' });
        restoring = false;
      });
    });
  };
  const changed = () => {
    clearTimeout(saveTimer);
    currentHash = location.hash;
    const saved = history.state?.[key];
    current = saved || { index: current.index + 1, scroll: 0, summaryIndex: current.summaryIndex };
    write(current);
    if (location.hash === '#study/summary') showSummary();
    else showDictionary();
    update(); restore(current.scroll);
  };
  const navigate = hash => {
    if (hash === location.hash) return;
    save();
    const next = { index: current.index + 1, scroll: 0, summaryIndex: current.summaryIndex };
    history.pushState({ ...history.state, [key]: next }, '', hash);
    // pushState creates a real entry without a browser's automatic anchor
    // scrolling. Notify both dictionary renderers through their existing event.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const route = event => navigate(event.detail);
  const open = event => {
    const link = event.target.closest('[data-summary-word]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    current = { ...current, scroll: window.scrollY, summaryIndex: current.index };
    history.replaceState({ ...history.state, [key]: current }, '', '#study/summary');
    currentHash = location.hash;
    navigate(`#word/${encodeURIComponent(link.dataset.summaryWord)}`);
  };
  const back = event => {
    if (event.target.closest('[data-review-back]')) { save(); history.back(); }
    if (event.target.closest('[data-review-summary]')) {
      save();
      const distance = current.summaryIndex - current.index;
      if (distance < 0) history.go(distance);
    }
  };
  document.addEventListener('click', open);
  controls.addEventListener('click', back);
  window.addEventListener('scroll', scrolled, { passive: true });
  window.addEventListener('hashchange', changed);
  window.addEventListener('vocabdna-route', route);
  update();
  if (location.hash === '#study/summary') { showSummary(); restore(current.scroll); }
  return () => {
    disposed = true; cancelAnimationFrame(frame); clearTimeout(saveTimer);
    history.scrollRestoration = originalRestoration;
    controls.remove(); document.body.classList.remove('study-dictionary-review');
    document.removeEventListener('click', open); controls.removeEventListener('click', back);
    window.removeEventListener('scroll', scrolled); window.removeEventListener('hashchange', changed);
    window.removeEventListener('vocabdna-route', route);
  };
}
