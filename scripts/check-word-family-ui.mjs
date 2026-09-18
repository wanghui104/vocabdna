import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const html = readFileSync('VocabDNA.html', 'utf8');
const data = JSON.parse(
  html.match(
    /<script id="vocab-data" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
const canonical = JSON.parse(
  readFileSync('data/vocab/v1/words.seed-50.json', 'utf8'),
).words;
const reviewPath = process.argv[2];
const focused = reviewPath
  ? new Set(JSON.parse(readFileSync(reviewPath, 'utf8')).verifiedWordSlugs)
  : new Set();
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  let i = source.indexOf('{', start),
    depth = 1;
  i++;
  while (depth && i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i);
}
const lib = readFileSync('lib/vocab-data.ts', 'utf8');
const index = lib.slice(
  lib.indexOf('const wordById ='),
  lib.indexOf('const morphemeById ='),
);
const lookup = index + '\n' + extract(lib, 'getWord');
const reports = [];
for (const path of ['app/page.tsx', 'scripts/build-static-page.mjs']) {
  const source = readFileSync(path, 'utf8');
  const names = [
    'getWordFamilyEntries',
    'getWordFamilyStem',
    'getCommonPrefix',
    'getWordVariantSuffix',
    'getWordVariantLabel',
    'getPosShortLabel',
  ];
  const resolver = path.startsWith('app')
    ? lookup
    : source.slice(
        source.indexOf('const wordById ='),
        source.indexOf('const morphemeById ='),
      );
  const code =
    resolver +
    '\n' +
    names.map((name) => extract(source, name)).join('\n') +
    '\n({getWord, getWordFamilyEntries,getWordFamilyStem,getWordVariantSuffix,getWordVariantLabel});';
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = runInNewContext(js, { words: data.words });
  assert.equal(api.getWord('ford').id, 'ford');
  assert.equal(api.getWord('Ford').id, 'ford-company');
  assert.equal(api.getWord('ford-company').id, 'ford-company');
  assert.equal(api.getWord('FORD'), undefined);
  assert.equal(api.getWordFamilyEntries(api.getWord('ford')).length, 1);
  assert.equal(api.getWordFamilyEntries(api.getWord('Ford')).length, 1);
  assert.equal(api.getWordVariantSuffix({ word: 'better' }, 'good-'), 'better');
  assert.equal(
    api.getWordVariantSuffix({ word: 'malfunction' }, 'malfunction-'),
    'malfunction',
  );
  let labels = 0,
    familyPages = 0;
  for (const w of data.words) {
    const family = api.getWordFamilyEntries(w);
    const stem = api.getWordFamilyStem(family);
    if (family.length > 1) familyPages++;
    for (const entry of family) {
      const label = api.getWordVariantSuffix(entry, stem);
      const rebuilt = label.startsWith('-')
        ? stem.replace(/-+$/, '') + label.slice(1)
        : label;
      assert.equal(
        rebuilt.toLowerCase(),
        entry.word.toLowerCase(),
        path + ': ' + entry.id,
      );
      assert(
        api.getWordVariantLabel(entry, stem).includes(' · '),
        path + ': ' + entry.id,
      );
      labels++;
    }
  }
  for (const w of canonical.filter((x) => focused.has(x.slug))) {
    const expected = [w.slug, ...w.relations.derivatives].sort();
    const actual = Array.from(
      api.getWordFamilyEntries(api.getWord(w.slug)),
      (x) => x.id,
    ).sort();
    assert.deepEqual(actual, expected, path + ': family ' + w.slug);
  }
  reports.push({
    path,
    allWordPages: data.words.length,
    pagesWithFamilyTabs: familyPages,
    tabLabelsVerified: labels,
    canonicalFocusedFamilies: focused.size,
    fordHomographIsolation: true,
    baseLabelAndNonprefixFallback: true,
  });
}
console.log(JSON.stringify({ checks: reports }, null, 2));
