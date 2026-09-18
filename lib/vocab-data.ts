type RawRecord = Record<string, unknown>;

export type WordComponent = {
  morpheme: string;
  form: string;
  meaning_in_word: string;
  zh: string;
  role: string;
  is_core?: boolean;
  note?: string;
  related_morphemes?: string[];
};

export type WordEntry = {
  id: string;
  word: string;
  pos: string;
  phonetic?: string;
  zh: string;
  en: string;
  components: WordComponent[];
  word_family: string[];
  word_family_details: Array<{ word: string; en: string; zh: string }>;
  confusables: Array<{ word: string; reason: string; zh_reason?: string }>;
  examples: Array<{ en: string; zh: string }>;
  why_confusing?: string;
};

export type MorphemeEntry = {
  id: string;
  display: string;
  type: string;
  core_meaning: string;
  zh: string;
  origin: string;
  source_form?: string;
  source_meaning?: string;
  source_meaning_zh?: string;
  source_note?: string;
  senses: Array<{ meaning: string; zh: string; examples: string[] }>;
  similar_form: string[];
  similar_meaning: string[];
  patterns: string[];
  high_value_words?: string[];
  related_morphemes: string[];
  confusable_words?: string[];
};

type Line = {
  indent: number;
  text: string;
};

const wordFiles = import.meta.glob<string>('../data/words/*.yaml', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const morphemeFiles = import.meta.glob<string>('../data/morphemes/*.yaml', {
  eager: true,
  import: 'default',
  query: '?raw',
});

export const words = Object.values(wordFiles)
  .map((raw) => normalizeWord(parseYaml(raw)))
  .sort((a, b) => a.word.localeCompare(b.word));

export const morphemes = Object.values(morphemeFiles)
  .map((raw) => normalizeMorpheme(parseYaml(raw)))
  .sort((a, b) => a.display.localeCompare(b.display));

const wordById = new Map(words.map((word) => [word.id, word]));
const wordByLabel = new Map(words.map((word) => [word.word, word]));
const wordByFoldedLabel = new Map<string, WordEntry | undefined>();
for (const word of words) {
  const key = word.word.toLowerCase();
  wordByFoldedLabel.set(key, wordByFoldedLabel.has(key) ? undefined : word);
}
const morphemeById = new Map(
  morphemes.map((morpheme) => [morpheme.id, morpheme]),
);

export function getWord(id: string | undefined) {
  if (!id) {
    return undefined;
  }
  return wordById.get(id) ?? wordByLabel.get(id) ?? wordByFoldedLabel.get(id.toLowerCase());
}

export function getMorpheme(id: string | undefined) {
  if (!id) {
    return undefined;
  }
  return morphemeById.get(id);
}

export function searchWords(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return words;
  }
  return words
    .map((word) => ({
      score: scoreText(
        normalized,
        [
          word.word,
          word.zh,
          word.en,
          word.pos,
          word.components.map((component) => component.form).join(' '),
          word.components
            .map((component) => component.meaning_in_word)
            .join(' '),
          word.word_family.join(' '),
        ].join(' '),
      ),
      word,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.word.word.localeCompare(b.word.word))
    .map((item) => item.word);
}

export function searchMorphemes(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return morphemes;
  }
  return morphemes
    .map((morpheme) => ({
      morpheme,
      score: scoreText(
        normalized,
        [
          morpheme.id,
          morpheme.display,
          morpheme.type,
          morpheme.core_meaning,
          morpheme.zh,
          morpheme.origin,
          morpheme.high_value_words?.join(' ') ?? '',
          morpheme.senses
            .map((sense) => `${sense.meaning} ${sense.zh} ${sense.examples.join(' ')}`)
            .join(' '),
        ].join(' '),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.morpheme.display.localeCompare(b.morpheme.display),
    )
    .map((item) => item.morpheme);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/^[-]+|[-]+$/g, '');
}

function scoreText(query: string, text: string) {
  const normalized = text.toLowerCase();
  const stripped = normalized.replaceAll('-', '');
  if (normalized.startsWith(query) || stripped.startsWith(query)) {
    return 4;
  }
  if (normalized.includes(query) || stripped.includes(query)) {
    return 2;
  }
  return query
    .split(/\s+/)
    .filter((token) => token && normalized.includes(token)).length;
}

function normalizeWord(record: RawRecord): WordEntry {
  return {
    id: asString(record.id),
    word: asString(record.word),
    pos: asString(record.pos),
    phonetic:
      typeof record.phonetic === 'string' ? record.phonetic : undefined,
    zh: asString(record.zh),
    en: asString(record.en),
    components: asArray<RawRecord>(record.components).map((component) => ({
      morpheme: asString(component.morpheme),
      form: asString(component.form),
      meaning_in_word: asString(component.meaning_in_word),
      zh: asString(component.zh),
      role: asString(component.role),
      is_core:
        typeof component.is_core === 'boolean' ? component.is_core : undefined,
      note:
        typeof component.note === 'string' ? component.note : undefined,
      related_morphemes: asArray<string>(component.related_morphemes).map(String),
    })),
    word_family: asArray<string>(record.word_family).map(String),
    word_family_details: asArray<RawRecord>(record.word_family_details).map(
      (item) => ({
        word: asString(item.word),
        en: asString(item.en),
        zh: asString(item.zh),
      }),
    ),
    confusables: asArray<RawRecord>(record.confusables).map((item) => ({
      word: asString(item.word),
      reason: asString(item.reason),
      zh_reason:
        typeof item.zh_reason === 'string' ? item.zh_reason : undefined,
    })),
    examples: asArray<RawRecord>(record.examples).map((example) => ({
      en: asString(example.en),
      zh: asString(example.zh),
    })),
    why_confusing:
      typeof record.why_confusing === 'string' ? record.why_confusing : undefined,
  };
}

function normalizeMorpheme(record: RawRecord): MorphemeEntry {
  return {
    id: asString(record.id),
    display: asString(record.display),
    type: asString(record.type),
    core_meaning: asString(record.core_meaning),
    zh: asString(record.zh),
    origin: asString(record.origin),
    source_form:
      typeof record.source_form === 'string' ? record.source_form : undefined,
    source_meaning:
      typeof record.source_meaning === 'string'
        ? record.source_meaning
        : undefined,
    source_meaning_zh:
      typeof record.source_meaning_zh === 'string'
        ? record.source_meaning_zh
        : undefined,
    source_note:
      typeof record.source_note === 'string' ? record.source_note : undefined,
    senses: asArray<RawRecord>(record.senses).map((sense) => ({
      meaning: asString(sense.meaning),
      zh: asString(sense.zh),
      examples: asArray<string>(sense.examples).map(String),
    })),
    similar_form: asArray<string>(record.similar_form).map(String),
    similar_meaning: asArray<string>(record.similar_meaning).map(String),
    patterns: asArray<string>(record.patterns).map(String),
    high_value_words: asArray<string>(record.high_value_words).map(String),
    related_morphemes: asArray<string>(record.related_morphemes).map(String),
    confusable_words: asArray<string>(record.confusable_words).map(String),
  };
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseYaml(raw: string): RawRecord {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/(^|\s+)#.*$/, ''))
    .filter((line) => line.trim())
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      text: line.trim(),
    }));

  return parseBlock(lines, 0, 0).value as RawRecord;
}

function parseBlock(lines: Line[], index: number, indent: number) {
  const line = lines[index];
  if (!line || line.indent < indent) {
    return { value: null, index };
  }
  if (line.text === '[]') {
    return { value: [], index: index + 1 };
  }
  if (line.text.startsWith('- ')) {
    return parseArray(lines, index, line.indent);
  }
  return parseObject(lines, index, indent);
}

function parseArray(lines: Line[], index: number, indent: number) {
  const value: unknown[] = [];
  let cursor = index;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.indent !== indent || !line.text.startsWith('- ')) {
      break;
    }

    const rest = line.text.slice(2).trim();
    cursor += 1;

    if (!rest) {
      const parsed = parseBlock(lines, cursor, indent + 2);
      value.push(parsed.value);
      cursor = parsed.index;
      continue;
    }

    if (rest.includes(':')) {
      const item: RawRecord = {};
      assignPair(item, rest, lines, cursor, indent + 2);
      const parsed = parseObject(lines, cursor, indent + 2);
      Object.assign(item, parsed.value);
      value.push(item);
      cursor = parsed.index;
      continue;
    }

    value.push(parseScalar(rest));
  }

  return { value, index: cursor };
}

function parseObject(lines: Line[], index: number, indent: number) {
  const value: RawRecord = {};
  let cursor = index;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.indent < indent || line.text.startsWith('- ')) {
      break;
    }
    if (line.indent > indent) {
      cursor += 1;
      continue;
    }

    assignPair(value, line.text, lines, cursor + 1, indent + 2);
    cursor += 1;

    const key = line.text.slice(0, line.text.indexOf(':')).trim();
    const rest = line.text.slice(line.text.indexOf(':') + 1).trim();
    if (!rest && lines[cursor]?.indent >= indent + 2) {
      const parsed = parseBlock(lines, cursor, indent + 2);
      value[key] = parsed.value;
      cursor = parsed.index;
    }
  }

  return { value, index: cursor };
}

function assignPair(
  target: RawRecord,
  text: string,
  lines: Line[],
  nextIndex: number,
  childIndent: number,
) {
  const separator = text.indexOf(':');
  const key = text.slice(0, separator).trim();
  const rest = text.slice(separator + 1).trim();

  if (rest) {
    target[key] = parseScalar(rest);
    return;
  }

  if (lines[nextIndex]?.indent >= childIndent) {
    target[key] = parseBlock(lines, nextIndex, childIndent).value;
    return;
  }

  target[key] = null;
}

function parseScalar(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === '[]') {
    return [];
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  return trimmed;
}
