// Shared by the React app, API validation, and self-contained HTML build.
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

const irregularForms = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'], go: ['went', 'gone'],
  take: ['took', 'taken'], give: ['gave', 'given'], make: ['made'], have: ['has', 'had'],
  do: ['does', 'did', 'done'], get: ['got', 'gotten'], see: ['saw', 'seen'],
  write: ['wrote', 'written'], speak: ['spoke', 'spoken'], break: ['broke', 'broken'],
  choose: ['chose', 'chosen'], know: ['knew', 'known'], grow: ['grew', 'grown'],
  begin: ['began', 'begun'], run: ['ran'], come: ['came'], become: ['became'],
  fall: ['fell', 'fallen'], rise: ['rose', 'risen'], drive: ['drove', 'driven'],
  draw: ['drew', 'drawn'], eat: ['ate', 'eaten'], drink: ['drank', 'drunk'],
  buy: ['bought'], bring: ['brought'], think: ['thought'], teach: ['taught'],
  catch: ['caught'], seek: ['sought'], find: ['found'], leave: ['left'], feel: ['felt'],
  keep: ['kept'], hold: ['held'], build: ['built'], send: ['sent'], spend: ['spent'],
  lose: ['lost'], win: ['won'], meet: ['met'], lead: ['led'], bind: ['bound'],
  bear: ['bore', 'borne', 'born'], lie: ['lay', 'lain'], lay: ['laid'], die: ['dying'],
  tie: ['tying'], fly: ['flew', 'flown'], swim: ['swam', 'swum'],
  man: ['men'], woman: ['women'], child: ['children'], person: ['people'],
  foot: ['feet'], tooth: ['teeth'], mouse: ['mice'], analysis: ['analyses'],
};

export function maskExample(text, word) {
  if (typeof text !== 'string' || !text.trim() || typeof word !== 'string' || !word.trim()) return null;
  const inflect = stem => {
    const forms = [stem, stem + 's', stem + 'es', stem + 'ed', stem + 'ing', ...(irregularForms[stem] || [])];
    if (/[^aeiou]y$/.test(stem)) forms.push(stem.slice(0, -1) + 'ies', stem.slice(0, -1) + 'ied');
    if (stem.endsWith('e')) forms.push(stem + 'd', stem.slice(0, -1) + 'ing');
    if (stem.endsWith('ie')) forms.push(stem.slice(0, -2) + 'ying');
    if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(stem)) forms.push(stem + stem.at(-1) + 'ed', stem + stem.at(-1) + 'ing');
    return forms;
  };
  const parts = word.toLowerCase().trim().split(/\s+/);
  const forms = [...inflect(parts[0]).map(form => [form, ...parts.slice(1)].join(' ')),
    ...inflect(parts.at(-1)).map(form => [...parts.slice(0, -1), form].join(' '))];
  const alternatives = [...new Set(forms)].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  const pattern = new RegExp(`(?<![A-Za-z])(?:${alternatives.join('|')})(?![A-Za-z])`, 'gi');
  const masked = text.trim().replace(pattern, '_____');
  // If no target form can be located, omit the hint instead of exposing an unchecked sentence.
  return masked !== text.trim() ? masked : null;
}

export function getQuestionExamples(question, catalog) {
  // Look up by tested sense, so existing saved rounds can use newly added examples too.
  const entry = catalog.find(w => w.id === question.wordId);
  return question.senses.flatMap(s => {
    const sense = entry?.senses.find(item => item.id === s.id && item.pos === s.pos && item.zh === s.zh);
    return sense?.example ? [{ senseId: s.id, text: sense.example }] : [];
  });
}

export function revealExample(state, catalog, viewedAt = new Date().toISOString()) {
  const index = state.session?.answers.length;
  const q = state.session?.questions[index];
  if (!q || !getQuestionExamples(q, catalog).length) throw new Error('本题暂无可用例句。');
  if (q.exampleViewedAt) return state;
  return { ...state, session: { ...state.session, questions: state.session.questions.map((item, i) => i === index ? { ...item, exampleViewedAt: viewedAt } : item) } };
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
      const example = maskExample(d.example?.en, w.term);
      return [{ id: `${w.slug}:${index}`, pos, zh: d.zh.trim(), en: d.en || '', ...(example ? { example } : {}) }];
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
    exampleViewed: Boolean(q.exampleViewedAt), exampleViewedAt: q.exampleViewedAt || null,
    ...(outcome === 'correct' ? { reward: { exp: 1, copper: 1 } } : {}),
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

// Rewards live on immutable answer events; merging the same event never pays twice.
export function rewardTotals(events) {
  const unique = new Map(events.map(event => [event.id, event]));
  return [...unique.values()].reduce((total, event) => ({
    exp: total.exp + (event.reward?.exp || 0), copper: total.copper + (event.reward?.copper || 0),
  }), { exp: 0, copper: 0 });
}

export function validateEvents(events) {
  const string = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
  if (!Array.isArray(events) || !events.every(e => e && string(e.id) && string(e.sessionId)
    && Number.isInteger(e.questionIndex) && e.questionIndex >= 0 && e.id === `${e.sessionId}:${e.questionIndex}`
    && string(e.wordId) && string(e.word) && ['en-zh', 'zh-en'].includes(e.direction) && POS_LABELS[e.pos]
    && ['correct', 'wrong', 'uncertain'].includes(e.outcome)
    && (e.reward === undefined || (e.outcome === 'correct' && e.reward?.exp === 1 && e.reward?.copper === 1))
    && e.score === ({ correct: 1, wrong: 0, uncertain: 0.2 })[e.outcome]
    && string(e.answeredAt) && Number.isFinite(Date.parse(e.answeredAt))
    && (e.exampleViewed === undefined || typeof e.exampleViewed === 'boolean')
    && (e.exampleViewedAt === undefined || e.exampleViewedAt === null || (string(e.exampleViewedAt) && Number.isFinite(Date.parse(e.exampleViewedAt))))
    && Array.isArray(e.senses) && e.senses.length >= 1 && e.senses.length <= 2
    && e.senses.every(s => s && string(s.id) && string(s.zh) && POS_LABELS[s.pos])
    && Array.isArray(e.selected) && e.selected.length <= 2
    && e.selected.every(s => s && string(s.word) && string(s.zh) && POS_LABELS[s.pos]))) {
    throw new Error('学习记录格式异常，未修改原记录。');
  }
}

export function mergeEvents(local, remote) {
  validateEvents(local); validateEvents(remote);
  const events = new Map(local.map(e => [e.id, e]));
  for (const e of remote) {
    if (events.has(e.id) && JSON.stringify(events.get(e.id)) !== JSON.stringify(e)) throw new Error('同一答题记录存在冲突，请先导出备份。');
    events.set(e.id, e);
  }
  return [...events.values()].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id));
}

export function readState(storage) {
  const text = storage.getItem(STORAGE_KEY);
  if (!text) return emptyState();
  const state = JSON.parse(text);
  validateEvents(state.events);
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
