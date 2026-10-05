import { readState, saveState, validateEvents, mergeEvents } from './study-engine.mjs';

// Local storage is an offline outbox/cache; D1 is the shared history.
export function createStudySync(storage, onChange, onStatus) {
  let running = false, again = false, disposed = false;
  const controller = new AbortController();
  async function request(method, body) {
    const response = await fetch('/api/study', {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 || response.redirected) throw new Error('请联网登录后同步；本机记录已保留。');
    if (!response.ok) throw new Error('暂未同步；本机记录已保留，可稍后重试。');
    return response.json();
  }
  async function sync() {
    if (disposed) return;
    if (location.protocol === 'file:') { onStatus('本地文件版：可导出记录，在手机网页版导入。'); return; }
    if (running) { again = true; return; }
    if (!navigator.onLine) { onStatus('离线复习中 · 记录保存在本机，联网后自动同步'); return; }
    running = true; onStatus('正在同步学习记录…');
    try {
      const remote = await request('GET');
      validateEvents(remote.events);
      const current = readState(storage);
      const merged = { ...current, events: mergeEvents(current.events, remote.events) };
      if (JSON.stringify(current.events) !== JSON.stringify(merged.events)) {
        saveState(storage, merged); onChange(merged);
      }
      const known = new Set(remote.events.map(event => event.id));
      const pending = merged.events.filter(event => !known.has(event.id));
      for (let i = 0; i < pending.length; i += 100) await request('POST', { events: pending.slice(i, i + 100) });
      onStatus(`已同步 · ${new Date().toLocaleTimeString()} · 电脑与手机共享学习记录`);
    } catch (error) {
      if (!disposed) onStatus(error.message);
    } finally {
      running = false;
      if (again && !disposed) { again = false; void sync(); }
    }
  }
  const visible = () => { if (document.visibilityState === 'visible') void sync(); };
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', visible);
  const timer = setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 60_000);
  return { sync, dispose() { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', visible); } };
}
