import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionBank, answerQuestion, emptyState, readState, saveState, mergeEvents, validateEvents, setWordMark, mergeMarkEvents, wordMarks } from '../lib/study-engine.mjs';
import { createStudySync } from '../lib/study-sync.mjs';
import catalog from '../lib/study-catalog.json' with { type: 'json' };
import supplement from '../lib/study-supplement.json' with { type: 'json' };

const bank = createQuestionBank(catalog, supplement);
const sessionA = bank.start(1), sessionB = bank.start(1);
const a = answerQuestion(sessionA, sessionA.questions[0].answerIds);
const b = answerQuestion(sessionB, [], true);

test('two-device merge is idempotent, preserves answers, rejects conflicting or malformed backups', () => {
  const merged = mergeEvents([a], [a, b]);
  assert.equal(merged.length, 2);
  assert.deepEqual(mergeEvents(merged, [a, b]), merged);
  assert.throws(() => mergeEvents([a], [{ ...a, answeredAt: '2026-01-01T00:00:00Z' }]));
  assert.throws(() => validateEvents([{ ...a, word: {} }]));
  assert.throws(() => validateEvents([{ ...a, senses: [null] }]));
});

test('cloud round-trip merges device history, preserves local round and retries offline outbox', async () => {
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.location = { protocol: 'https:' };
  const originalFetch = globalThis.fetch;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  let raw, remote = [b], remoteMarks = [], uploads = 0, failUpload = true;
  const storage = { getItem() { return raw; }, setItem(_key, value) { raw = value; } };
  const initial = { ...emptyState(), events: [a], session: { ...sessionA, answers: [a] } };
  const marked = setWordMark(initial, a.wordId, 'mastered', true, '2026-10-10T00:00:00Z');
  const cancelled = setWordMark(marked, a.wordId, 'mastered', false, '2026-10-11T00:00:00Z');
  remoteMarks = cancelled.markEvents;
  saveState(storage, setWordMark(marked, a.wordId, 'important', true, '2026-10-12T00:00:00Z'));
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'GET') return Response.json({ events: remote, markEvents: remoteMarks });
    uploads++;
    if (failUpload) return Response.json({}, { status: 503 });
    const body = JSON.parse(options.body);
    remote = mergeEvents(remote, body.events);
    remoteMarks = mergeMarkEvents(remoteMarks, body.markEvents);
    return Response.json({ saved: remote.length });
  };
  let status;
  const sync = createStudySync(storage, () => {}, value => { status = value; });
  try {
    await sync.sync();
    assert.equal(readState(storage).events.length, 2);
    assert.deepEqual(readState(storage).session, initial.session);
    assert.match(status, /暂未同步/);
    failUpload = false;
    await sync.sync();
    assert.equal(remote.length, 2);
    assert.deepEqual(wordMarks(remoteMarks).get(a.wordId), { important: true, mastered: false });
    assert.deepEqual(readState(storage).markEvents, remoteMarks);
    const previousUploads = uploads;
    await sync.sync();
    assert.equal(uploads, previousUploads, 'acknowledged answers not uploaded again');
    navigator.onLine = false;
    await sync.sync();
    assert.match(status, /离线/);
    assert.equal(readState(storage).events.length, 2);
  } finally {
    sync.dispose(); globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
});
