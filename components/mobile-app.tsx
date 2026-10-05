'use client';
import { useEffect, useState } from 'react';

export function MobileApp() {
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    let active = true;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
        const worker = registration.installing || registration.waiting || registration.active;
        const status = () => { if (active && worker?.state === 'activated') setReady(true); };
        worker?.addEventListener('statechange', status); status();
        if (registration.active && active) setReady(true);
      }).catch(() => { /* Online app remains available. */ });
    }
    return () => { active = false; window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, []);
  return <div className="mobile-app-bar">
    <span role="status">{offline ? '离线模式 · 联网后同步记录' : ready ? '已可离线使用' : '联网使用中'}</span>
    <button type="button" aria-expanded={installHelp} onClick={() => setInstallHelp(value => !value)}>添加到手机主屏幕</button>
    {installHelp && <p>iPhone：在 Safari 打开本页，点分享 → 添加到主屏幕。电脑和手机使用同一个 ChatGPT 账号；在「背单词」中查看同步状态。首次联网打开并显示「已可离线使用」后，再离线复习。</p>}
  </div>;
}
