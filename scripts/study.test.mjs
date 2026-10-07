import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { createCatalog, createQuestionBank, meaningsOverlap, answerQuestion, emptyState, saveState, readState, wordStats, rewardTotals, maskExample, getQuestionExamples, revealExample, mergeEvents, validateEvents } from '../lib/study-engine.mjs';

const catalog = JSON.parse(await readFile(new URL('../lib/study-catalog.json', import.meta.url), 'utf8'));
const supplement = JSON.parse(await readFile(new URL('../lib/study-supplement.json', import.meta.url), 'utf8'));

test('correct rewards persist once per event across import and sync; old history is unchanged', () => {
  const session = createQuestionBank(catalog, supplement).start(1);
  const correct = answerQuestion(session, session.questions[0].answerIds);
  assert.deepEqual(correct.reward, { exp: 1, copper: 1 });
  const uncertain = answerQuestion(session, [], true);
  assert.equal(uncertain.reward, undefined);
  const wrong = answerQuestion(session, [session.questions[0].options.find(o => !session.questions[0].answerIds.includes(o.id)).id, ...session.questions[0].answerIds.slice(1)]);
  assert.equal(wrong.reward, undefined);
  const history = { ...correct, id: 'old:0', sessionId: 'old' }; delete history.reward;
  assert.deepEqual(rewardTotals(mergeEvents([correct, history], [correct])), { exp: 1, copper: 1 });
  assert.deepEqual(rewardTotals([correct, correct]), { exp: 1, copper: 1 });
  validateEvents([history]);
  assert.throws(() => validateEvents([{ ...uncertain, reward: { exp: 1, copper: 1 } }]));
  const state = { ...emptyState(), events: [correct], session: { ...session, answers: [correct] } };
  let text; const storage = { getItem: () => text, setItem: (_key, value) => { text = value; } };
  saveState(storage, state);
  assert.deepEqual(rewardTotals(readState(storage).events), { exp: 1, copper: 1 });
});
let seed = 12345;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const bank = createQuestionBank(catalog, supplement, random);

test('example masking handles case, repeated targets, inflections and phrases without substring leaks', () => {
  assert.equal(maskExample('OVERLOAD it, but avoid overloading or overloaded circuits.', 'overload'), '_____ it, but avoid _____ or _____ circuits.');
  assert.equal(maskExample('She studies and studied a study.', 'study'), 'She _____ and _____ a _____.');
  assert.equal(maskExample('He stopped stopping at the stop.', 'stop'), 'He _____ _____ at the _____.');
  assert.equal(maskExample('They took what was taken.', 'take'), 'They _____ what was _____.');
  assert.equal(maskExample('She abides by rules.', 'abide by'), 'She _____ rules.');
  assert.equal(maskExample('Art is part of life.', 'art'), '_____ is part of life.');
  assert.equal(maskExample('No target here.', 'overload'), null);
  assert.equal(maskExample(undefined, 'overload'), null);
});

test('sense-specific hints persist before answering and sync with answer records; old records still load', () => {
  const source = [{ slug: 'test', term: 'test', partOfSpeech: ['verb'], definitions: [
    { zh: '测试', example: { en: 'They tested the engine.', zh: '测试发动机' } },
    { zh: '检验', example: { en: 'Test the new method.' } },
  ] }];
  const hints = createCatalog(source, [{ id: 'test', components: [], word_family: [], confusables: [] }]);
  assert.equal(hints[0].senses[0].example, 'They _____ the engine.');
  const q = { wordId: 'test', word: 'test', direction: 'zh-en', pos: 'verb', senses: [{ id: 'test:0', pos: 'verb', zh: '测试' }], answerIds: ['yes'], options: [
    { id: 'yes', word: 'test', zh: '测试', pos: 'verb' },
    ...['read', 'write', 'walk'].map(word => ({ id: word, word, zh: '干扰', pos: 'verb' })),
  ] };
  const state = { ...emptyState(), session: { id: 'hint-test', questions: [q], answers: [] } };
  assert.equal(getQuestionExamples(q, hints).length, 1);
  const viewed = revealExample(state, hints, '2026-10-06T12:00:00.000Z');
  assert.equal(viewed.events.length, 0);
  assert.equal(viewed.session.answers.length, 0);
  assert.equal(revealExample(viewed, hints), viewed);
  assert.equal(readState({ getItem: () => JSON.stringify(viewed) }).session.questions[0].exampleViewedAt, '2026-10-06T12:00:00.000Z');
  const a = answerQuestion(viewed.session, ['yes']);
  assert.equal(a.exampleViewed, true); assert.equal(a.score, 1);
  assert.equal(a.exampleViewedAt, '2026-10-06T12:00:00.000Z');
  assert.deepEqual(mergeEvents([], [a]), [a]);
  const old = answerQuestion(state.session, [], true);
  delete old.exampleViewed; delete old.exampleViewedAt;
  validateEvents([old]);
  assert.throws(() => validateEvents([{ ...a, exampleViewedAt: 'not a date' }]));
  assert.throws(() => revealExample(state, []));
  assert.equal(getQuestionExamples({ ...q, senses: [{ ...q.senses[0], zh: '错误释义' }] }, hints).length, 0);
});

test('default and adjustable rounds have unique words, matching POS and valid options', () => {
  const defaults = bank.start();
  assert.equal(defaults.count, 20);
  assert.ok(defaults.questions.every(q => q.direction === 'en-zh'));
  for (const mode of ['en-zh', 'zh-en', 'mixed']) {
    const session = bank.start(100, mode);
    assert.equal(new Set(session.questions.map(q => q.wordId)).size, 100);
    for (const q of session.questions) {
      assert.equal(q.options.length, q.answerIds.length + 3);
      assert.equal(new Set(q.options.map(o => o.id)).size, q.options.length);
      assert.ok(q.options.every(o => o.pos === q.pos));
      if (q.direction === 'zh-en') assert.equal(q.answerIds.length, 1);
      const target = catalog.find(w => w.id === q.wordId);
      for (const o of q.options.filter(o => !q.answerIds.includes(o.id))) {
        assert.notEqual(o.wordId, q.wordId);
        assert.ok(!meaningsOverlap(target.allZh, o.allZh));
      }
    }
  }
  for (const count of [0, -1, 1.5, NaN, catalog.length + 1]) assert.throws(() => bank.start(count));
});

test('synonym and shared-meaning distractors are excluded', () => {
  assert.ok(meaningsOverlap('重要的', '重大的'));
  assert.ok(meaningsOverlap('有意义的；重要的，重大的', '重要的'));
  assert.ok(meaningsOverlap('许可', '允许'));
  assert.ok(!meaningsOverlap('茶壶', '鞋带'));
});

test('unlabelled multi-POS definitions are not guessed', () => {
  const source = [{ slug: 'sample', term: 'sample', partOfSpeech: ['noun', 'verb'], definitions: [{ zh: '样品', sense: 'sample' }, { zh: '取样', sense: 'v. sense' }] }];
  const result = createCatalog(source, [{ id: 'sample', components: [], confusables: [], word_family: [] }]);
  assert.equal(result[0].senses.length, 1);
  assert.equal(result[0].senses[0].pos, 'verb');
});

test('five-option questions need both answers; unsure and wrong score separately', () => {
  const session = bank.start(200);
  const q = session.questions.find(q => q.answerIds.length === 2);
  assert.ok(q, 'real vocabulary produces multi-sense questions');
  const multi = { ...session, questions: [q], answers: [] };
  assert.throws(() => answerQuestion(multi, [q.answerIds[0]]));
  assert.equal(answerQuestion(multi, q.answerIds).outcome, 'correct');
  const wrong = q.options.find(o => !q.answerIds.includes(o.id));
  assert.equal(answerQuestion(multi, [q.answerIds[0], wrong.id]).outcome, 'wrong');
  const unknown = answerQuestion(multi, [], true, '2026-10-04T15:01:02.123Z');
  assert.equal(unknown.score, 0.2);
  assert.equal(unknown.answeredAt, '2026-10-04T15:01:02.123Z');
  assert.equal(unknown.selected.length, 0);
});

test('history, statistics and interrupted round survive storage round-trip', () => {
  const session = bank.start(3, 'zh-en');
  let state = { ...emptyState(), session };
  const q = session.questions[0];
  const a = answerQuestion(session, q.answerIds);
  state = { ...state, events: [a], session: { ...session, answers: [a] } };
  let raw;
  const storage = { setItem(_key, text) { raw = text; }, getItem() { return raw; } };
  saveState(storage, state);
  assert.deepEqual(readState(storage), state);
  assert.equal(readState(storage).session.answers.length, 1);
  const events = [a, { ...a, id: 'wrong', outcome: 'wrong', score: 0 }, { ...a, id: 'unknown', outcome: 'uncertain', score: 0.2 }];
  const s = wordStats(events)[0];
  assert.equal(s.total, 3); assert.equal(s.accuracy, 1 / 3); assert.equal(s.mastery, 1.2 / 3);
  assert.throws(() => saveState({ setItem() { throw new Error('quota'); } }, state));
  assert.throws(() => readState({ getItem() { return '{broken'; } }));
  assert.throws(() => readState({ getItem() { return JSON.stringify({ ...state, events: [{ ...a, score: 99 }] }); } }));
});

test('both HTML copies contain syntactically valid inline scripts and bundled quiz', async () => {
  const html = await readFile(new URL('../VocabDNA.html', import.meta.url), 'utf8');
  assert.equal(html, await readFile(new URL('../dist/VocabDNA.html', import.meta.url), 'utf8'));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, source] of scripts) new Script(source);
  assert.ok(html.includes('id="study-open"'));
  assert.ok(html.includes('function mountStudy('));
});
