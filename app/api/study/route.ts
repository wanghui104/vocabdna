import { studyDB } from '@/lib/study-db';
import { validateEvents, validateMarkEvents } from '@/lib/study-engine.mjs';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user) return json({ error: '请先登录，再同步学习记录。' }, 401);
  try {
    const result = await studyDB().prepare('SELECT payload FROM study_events WHERE user_id = ? ORDER BY event_id').bind(user).all<{ payload: string }>();
    const records = result.results.map(row => JSON.parse(row.payload));
    return json({ events: records.filter(e => e.kind !== 'word-mark'), markEvents: records.filter(e => e.kind === 'word-mark') });
  } catch (error) {
    console.error('Study read failed', error);
    return json({ error: '云端记录暂不可用，本机记录仍保留。' }, 503);
  }
}

export async function POST(request: Request) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user) return json({ error: '请先登录，再同步学习记录。' }, 401);
  // Same-origin JSON writes only. Authentication is provided by Sites dispatch.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '来源不匹配' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: '需要 JSON' }, 415);
  let events;
  try {
    const text = await request.text();
    if (text.length > 500_000) return json({ error: '请分批同步' }, 413);
    const body = JSON.parse(text);
    events = body.events;
    const marks = body.markEvents ?? [];
    if (!Array.isArray(events) || !Array.isArray(marks) || events.length + marks.length > 100) throw new Error('无效批次');
    validateEvents(events);
    validateMarkEvents(marks);
    // Keep the answer namespace disjoint from mark IDs and old-client GETs.
    if (events.some(e => e.kind !== undefined || e.id.startsWith('mark:'))) throw new Error('无效记录');
    events = [...events, ...marks];
  } catch { return json({ error: '学习记录格式异常' }, 400); }
  try {
    const db = studyDB();
    if (events.length) await db.batch(events.map(event => db.prepare(
      'INSERT INTO study_events (user_id, event_id, payload) VALUES (?, ?, ?) ON CONFLICT(user_id, event_id) DO NOTHING'
    ).bind(user, event.id, JSON.stringify(event))));
    return json({ saved: events.length });
  } catch (error) {
    console.error('Study write failed', error);
    return json({ error: '暂未同步，本机记录仍保留，联网后重试。' }, 503);
  }
}
