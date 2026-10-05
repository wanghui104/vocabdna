'use client';

import { useEffect, useRef } from 'react';
import catalog from '@/lib/study-catalog.json';
import supplement from '@/lib/study-supplement.json';
import { mountStudy } from '@/lib/study-view.mjs';

export function StudyPanel({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) return mountStudy(host.current, catalog, supplement, onClose);
  }, [onClose]);
  return <div ref={host} className="study-host" />;
}
