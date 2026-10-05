// Shared by the React app and the self-contained HTML build. No network requests.
export const POS_LABELS = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', phrase: 'phrase' };
export const STORAGE_KEY = 'vocabdna-study-v1';
const synonyms = [
  ['重要', '重大', '显著', '要紧', '关键'], ['漂亮', '美丽', '好看'],
  ['开始', '启动', '着手'], ['结束', '终止', '停止'], ['快速', '迅速', '飞快'],
  ['巨大', '庞大', '硕大'], ['微小', '细小', '小巧'], ['聪明', '聪慧', '机智'],
  ['困难', '艰难', '艰巨'], ['容易', '简单', '轻易'], ['愤怒', '生气', '恼怒'],
  ['快乐', '高兴', '愉快'], ['悲伤', '难过', '伤心'], ['购买', '买入'],
  ['帮助', '协助', '援助'], ['允许', '许可', '准许'], ['禁止', '不准'],
  ['正确', '准确', '精确'], ['错误', '不对'], ['获得', '取得', '获取'],
  ['保护', '保卫', '防护'], ['减少', '降低', '缩减'], ['增加', '增多', '增长'],
];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function meaningsOverlap(a, b) {
  const clean = text => String(text).replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[^\u4e00-\u9fff]/g, '');
  const x = clean(a), y = clean(b);
  if (!x || !y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  // Conservative: shared Chinese phrases and curated synonymous expressions
  // are excluded, even when this excludes an otherwise usable distractor.
  for (let i = 0; i < x.length - 1; i++) if (y.includes(x.slice(i, i + 2))) return true;
  return synonyms.some(group => group.some(s => x.includes(s)) && group.some(s => y.includes(s)));
}

export function createCatalog(sourceWords, displayWords) {
  const display = new Map(displayWords.map(w => [w.id, w]));
  return sourceWords.flatMap(w => {
    const visible = display.get(w.slug);
    if (!visible) return [];
    const senses = w.definitions.flatMap((d, index) => {
      // Never infer POS from definition order or Chinese word endings.
      const explicit = d.partOfSpeech || d.pos;
      const tag = /\b(adj|adv|n|v|prep)\./i.exec(d.sense || '');
      const tagged = tag && { adj: 'adjective', adv: 'adverb', n: 'noun', v: 'verb', prep: 'preposition' }[tag[1].toLowerCase()];
      const pos = explicit || tagged || (w.partOfSpeech.length === 1 ? w.partOfSpeech[0] : null);
      if (!POS_LABELS[pos] || !d.zh?.trim()) return [];
      return [{ id: `${w.slug}:${index}`, pos, zh: d.zh.trim(), en: d.en || '' }];
    });
    if (!senses.length) return [];
    return [{ id: w.slug, word: w.term, senses,
      // All glosses are kept for ambiguity checks, including untestable senses.
      allZh: w.definitions.map(d => d.zh).join('；'),
      related: [...new Set([...(visible.word_family || []), ...(visible.confusables || []).map(c => c.word)])],
      roots: (visible.components || []).filter(c => c.is_core || c.role === 'root').map(c => c.morpheme),
      otherRoots: (visible.components || []).flatMap(c => [c.morpheme, ...(c.related_morphemes || [])]),
    }];
  });
}

export function createQuestionBank(catalog, supplement, random = Math.random) {
  const byName = new Map(catalog.flatMap(w => [[w.id, w], [w.word.toLowerCase(), w]]));
  const byPos = new Map();
  const core = new Map(), other = new Map();
  const index = (map, key, value) => map.set(key, [...(map.get(key) || []), value]);
  for (const w of catalog) {
    for (const s of w.senses) index(byPos, s.pos, { wordId: w.id, word: w.word, ...s, allZh: w.allZh, source: 'app' });
    for (const r of w.roots) index(core, r, w);
    for (const r of w.otherRoots) index(other, r, w);
  }
  const external = supplement.filter(s => !byName.has(s.word.toLowerCase())).map(s => ({ ...s, wordId: `supplement:${s.word}`, id: `supplement:${s.word}`, allZh: s.zh, source: 'supplement' }));

  function makeQuestion(target, direction) {
    const first = shuffle(target.senses, random)[0];
    const matching = target.senses.filter(s => s.pos === first.pos);
    const second = matching.find(s => s.id !== first.id && !meaningsOverlap(s.zh, first.zh));
    const answers = direction === 'en-zh' && second ? [first, second] : [first];
    const relatedWords = [...target.related.map(id => byName.get(id) || byName.get(id.toLowerCase())),
      ...target.roots.flatMap(r => core.get(r) || []), ...target.otherRoots.flatMap(r => other.get(r) || [])].filter(Boolean);
    const relationPool = relatedWords.flatMap(w => w.senses.filter(s => s.pos === first.pos).map(s => ({ wordId: w.id, word: w.word, ...s, allZh: w.allZh, source: 'related' })));
    const candidates = [];
    const accept = c => c.wordId !== target.id && !meaningsOverlap(target.allZh, c.allZh)
      && !candidates.some(p => p.word.toLowerCase() === c.word.toLowerCase() || meaningsOverlap(p.zh, c.zh));
    // Take one from each requested source where possible, then fill safely.
    for (const pool of [byPos.get(first.pos) || [], relationPool, external.filter(s => s.pos === first.pos)]) {
      const c = shuffle(pool, random).find(accept);
      if (c) candidates.push(c);
    }
    for (const c of shuffle(byPos.get(first.pos) || [], random)) {
      if (candidates.length === 3) break;
      if (accept(c)) candidates.push(c);
    }
    if (candidates.length !== 3) return null;
    const correct = answers.map(s => ({ id: `answer:${s.id}`, wordId: target.id, word: target.word, zh: s.zh, pos: s.pos, source: 'answer' }));
    return { wordId: target.id, word: target.word, direction, pos: first.pos,
      prompt: direction === 'en-zh' ? target.word : first.zh,
      senses: answers.map(s => ({ id: s.id, zh: s.zh, pos: s.pos })),
      answerIds: correct.map(c => c.id),
      options: shuffle([...correct, ...candidates.map(c => ({ ...c, id: `option:${c.wordId}:${c.id}` }))], random),
    };
  }

  return {
    size: catalog.length,
    start(count = 20, mode = 'en-zh') {
      if (!Number.isInteger(count) || count < 1 || count > catalog.length) throw new Error(`单词数须为 1–${catalog.length} 的整数。`);
      if (!['en-zh', 'zh-en', 'mixed'].includes(mode)) throw new Error('无效的出题方向。');
      const questions = [];
      for (const target of shuffle(catalog, random)) {
        const direction = mode === 'mixed' ? (random() < 0.5 ? 'en-zh' : 'zh-en') : mode;
        const q = makeQuestion(target, direction);
        if (q) questions.push(q);
        if (questions.length === count) break;
      }
      if (questions.length !== count) throw new Error(`目前只有 ${questions.length} 个词能生成合格题目，请减少本轮数量。`);
      return { id: newId(), mode, count, startedAt: new Date().toISOString(), questions, answers: [] };
    },
  };
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function answerQuestion(session, selectedIds, uncertain = false, answeredAt = new Date().toISOString()) {
  const q = session.questions[session.answers.length];
  if (!q) throw new Error('本轮已结束。');
  const selected = [...new Set(selectedIds)];
  if (!uncertain && (selected.length !== q.answerIds.length || selected.some(id => !q.options.some(o => o.id === id)))) throw new Error(`请选择 ${q.answerIds.length} 个选项。`);
  const outcome = uncertain ? 'uncertain' : selected.every(id => q.answerIds.includes(id)) ? 'correct' : 'wrong';
  return { id: `${session.id}:${session.answers.length}`, sessionId: session.id, questionIndex: session.answers.length,
    wordId: q.wordId, word: q.word, direction: q.direction, pos: q.pos, senses: q.senses,
    selected: uncertain ? [] : q.options.filter(o => selected.includes(o.id)).map(o => ({ word: o.word, zh: o.zh, pos: o.pos, source: o.source })),
    outcome, score: outcome === 'correct' ? 1 : outcome === 'uncertain' ? 0.2 : 0, answeredAt,
  };
}

export function wordStats(events) {
  const result = new Map();
  for (const event of events) {
    const stats = result.get(event.wordId) || { word: event.word, correct: 0, wrong: 0, uncertain: 0, total: 0, score: 0, lastAnsweredAt: '' };
    stats[event.outcome]++;
    stats.total++;
    stats.score += event.score;
    stats.lastAnsweredAt = event.answeredAt;
    result.set(event.wordId, stats);
  }
  return [...result.entries()].map(([wordId, s]) => ({ wordId, ...s, mastery: s.score / s.total, accuracy: s.correct / s.total }));
}

export function emptyState() { return { version: 1, events: [], session: null }; }

export function readState(storage) {
  const text = storage.getItem(STORAGE_KEY);
  if (!text) return emptyState();
  const state = JSON.parse(text);
  if (state.version !== 1 || !Array.isArray(state.events) || !state.events.every(e =>
    typeof e.id === 'string' && typeof e.wordId === 'string' && ['correct', 'wrong', 'uncertain'].includes(e.outcome)
    && e.score === ({ correct: 1, wrong: 0, uncertain: 0.2 })[e.outcome] && Number.isFinite(Date.parse(e.answeredAt)))) throw new Error('学习记录格式异常，已停止自动写入以保护原记录。');
  const s = state.session;
  if (s && (!Array.isArray(s.questions) || !Array.isArray(s.answers) || s.answers.length > s.questions.length
    || !s.questions.every(q => Array.isArray(q.options) && Array.isArray(q.answerIds) && q.options.length === q.answerIds.length + 3)
    || !s.answers.every((a, i) => a.id === `${s.id}:${i}` && state.events.some(e => e.id === a.id)))) throw new Error('本轮记录格式异常，已停止自动写入以保护原记录。');
  return state;
}

export function saveState(storage, state) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
