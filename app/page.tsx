'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Network, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getMorpheme,
  getWord,
  morphemes,
  searchMorphemes,
  searchWords,
  words,
  type MorphemeEntry,
  type WordComponent,
  type WordEntry,
} from '@/lib/vocab-data';

type RouteState =
  | { type: 'word'; id: string }
  | { type: 'morpheme'; id: string };

const defaultRoute: RouteState = { type: 'word', id: 'archaeology' };

function parseRoute(): RouteState {
  if (typeof window === 'undefined') {
    return defaultRoute;
  }

  const [type, id] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (type === 'morpheme' && getMorpheme(id)) {
    return { type, id };
  }
  if (type === 'word' && getWord(id)) {
    return { type, id };
  }
  return defaultRoute;
}

function navigate(next: RouteState) {
  window.location.hash = `${next.type}/${next.id}`;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [freezeTopPane, setFreezeTopPane] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('vocabdna-freeze-top-pane') === 'true';
  });

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'vocabdna-freeze-top-pane',
      String(freezeTopPane),
    );
  }, [freezeTopPane]);

  const wordResults = useMemo(() => searchWords(query).slice(0, 9), [query]);
  const morphemeResults = useMemo(
    () => searchMorphemes(query).slice(0, 9),
    [query],
  );
  const activeWord = route.type === 'word' ? getWord(route.id) : undefined;
  const activeMorpheme =
    route.type === 'morpheme' ? getMorpheme(route.id) : undefined;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/96 backdrop-blur">
        <div className="mx-auto grid max-w-[1500px] gap-3 px-4 py-3 md:grid-cols-[220px_minmax(280px,680px)_1fr] md:items-center md:px-6">
          <button
            className="flex w-fit items-center gap-2 text-left"
            onClick={() => navigate(defaultRoute)}
            type="button"
          >
            <span className="grid size-8 place-items-center rounded-md border border-foreground bg-foreground text-background">
              <Network className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-semibold leading-5">
                VocabDNA
              </span>
              <span className="block text-xs text-muted-foreground">
                word roots, not word lists
              </span>
            </span>
          </button>

          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search word or morpheme: archaeology, -logy, simul..."
              className="h-10 rounded-md border-border bg-card pl-8 pr-9 text-[15px]"
            />
            {query ? (
              <Button
                aria-label="Clear search"
                className="absolute right-1 top-1 size-8 rounded-md"
                onClick={() => setQuery('')}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </label>

          <div className="topbar-actions">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{words.length} Words</span>
              <span className="text-border">/</span>
              <span>{morphemes.length} Morphemes</span>
              <span className="text-border">/</span>
              <span>YAML-backed</span>
            </div>
            <FreezeTopPaneToggle
              enabled={freezeTopPane}
              onToggle={() => setFreezeTopPane((enabled) => !enabled)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 md:grid-cols-[260px_minmax(0,1fr)] md:px-6">
        <aside className="space-y-4 md:sticky md:top-[76px] md:h-[calc(100vh-96px)] md:overflow-auto">
          <SearchPanel
            query={query}
            wordResults={wordResults}
            morphemeResults={morphemeResults}
            route={route}
          />
          <BrowsePanel route={route} />
          <AlphabetBrowsePanel route={route} />
          <AlphabetRootBrowsePanel route={route} />
        </aside>

        <section className="min-w-0">
          {activeWord ? (
            <WordDetail freezeTopPane={freezeTopPane} word={activeWord} />
          ) : null}
          {activeMorpheme ? <MorphemeDetail morpheme={activeMorpheme} /> : null}
        </section>
      </div>
    </main>
  );
}

function FreezeTopPaneToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={`Freeze top pane ${enabled ? 'on' : 'off'}`}
      aria-pressed={enabled}
      className={`freeze-toggle ${enabled ? 'freeze-toggle-on' : ''}`}
      onClick={onToggle}
      type="button"
    >
      <span className="freeze-toggle-label">Freeze Top Pane</span>
      <span className="freeze-switch" aria-hidden="true">
        <span className="freeze-switch-thumb" />
      </span>
      <span className="freeze-toggle-state">{enabled ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function SearchPanel({
  query,
  wordResults,
  morphemeResults,
  route,
}: {
  query: string;
  wordResults: WordEntry[];
  morphemeResults: MorphemeEntry[];
  route: RouteState;
}) {
  return (
    <section className="vocab-panel">
      <PanelTitle icon={<Search className="size-4" />} title="Search Results" />
      {query ? (
        <div className="space-y-4">
          <ResultGroup
            current={route}
            emptyLabel="No matching words"
            items={wordResults.map((word) => ({
              id: word.id,
              label: word.word,
              sublabel: word.zh,
              type: 'word' as const,
            }))}
            title="Word"
          />
          <ResultGroup
            current={route}
            emptyLabel="No matching morphemes"
            items={morphemeResults.map((morpheme) => ({
              id: morpheme.id,
              label: morpheme.display,
              sublabel: morpheme.zh,
              type: 'morpheme' as const,
            }))}
            title="Morpheme"
          />
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Type any word, root, prefix, suffix, English meaning, or Chinese gloss.
          Results stay separated so similar shapes do not blur into the same
          thing.
        </p>
      )}
    </section>
  );
}

function BrowsePanel({ route }: { route: RouteState }) {
  const activeWord = route.type === 'word' ? getWord(route.id) : undefined;
  const activeMorpheme =
    route.type === 'morpheme' ? getMorpheme(route.id) : undefined;
  const sameCoreRootWords = activeWord
    ? getWordsSharingCoreRoots(activeWord).slice(0, 10)
    : [];
  const wordsUsingMorpheme = activeMorpheme
    ? getWordsUsingMorpheme(activeMorpheme.id).slice(0, 10)
    : [];
  const similarMorphemes =
    activeMorpheme?.similar_form
      .map((id) => getMorpheme(id))
      .filter((morpheme): morpheme is MorphemeEntry => Boolean(morpheme))
      .slice(0, 10) ?? [];

  return (
    <section className="vocab-panel">
      <PanelTitle icon={<BookOpen className="size-4" />} title="Browse" />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
        {activeWord ? (
          <ResultGroup
            current={route}
            emptyLabel=""
            items={sameCoreRootWords.map((word) => ({
              id: word.id,
              label: word.word,
              sublabel: word.pos,
              type: 'word' as const,
            }))}
            title="Same Core Root Words / 同核心词根词"
          />
        ) : null}
        {activeMorpheme ? (
          <>
            <ResultGroup
              current={route}
              emptyLabel=""
              items={wordsUsingMorpheme.map((word) => ({
                id: word.id,
                label: word.word,
                sublabel: word.pos,
                type: 'word' as const,
              }))}
              title="Words Using This Root / 使用该词根的词"
            />
            <ResultGroup
              current={route}
              emptyLabel=""
              items={similarMorphemes.map((morpheme) => ({
                id: morpheme.id,
                label: morpheme.display,
                sublabel: morpheme.type,
                type: 'morpheme' as const,
              }))}
              title="Similar-Looking Roots / 拼写相近词根"
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function AlphabetBrowsePanel({ route }: { route: RouteState }) {
  const groups = useMemo(() => getAlphabetWordGroups(), []);

  return (
    <section className="vocab-panel">
      <PanelTitle icon={<BookOpen className="size-4" />} title="A-Z Words" />
      <div className="alphabet-dropdowns">
        {groups.map((group) => {
          const activeInGroup =
            route.type === 'word' &&
            group.words.some((word) => word.id === route.id);
          return (
            <details
              className="alpha-dropdown"
              key={group.letter}
              open={activeInGroup}
            >
              <summary className="alpha-summary">
                <span className="alpha-letter">{group.letter}</span>
                <span className="alpha-count">{group.words.length}</span>
                <ChevronDown className="alpha-chevron" aria-hidden="true" />
              </summary>
              <div className="alpha-menu">
                {group.words.length ? (
                  group.words.map((word) => {
                    const isActive =
                      route.type === 'word' && route.id === word.id;
                    return (
                      <button
                        className={`alpha-word ${isActive ? 'alpha-word-active' : ''}`}
                        key={word.id}
                        onClick={() => navigate({ type: 'word', id: word.id })}
                        type="button"
                      >
                        <span>{word.word}</span>
                        <span>{word.pos}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="alpha-empty">No words yet</p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function AlphabetRootBrowsePanel({ route }: { route: RouteState }) {
  const groups = useMemo(() => getAlphabetMorphemeGroups(), []);

  return (
    <section className="vocab-panel">
      <PanelTitle icon={<Network className="size-4" />} title="A-Z Roots" />
      <div className="alphabet-dropdowns">
        {groups.map((group) => {
          const activeInGroup =
            route.type === 'morpheme' &&
            group.morphemes.some((morpheme) => morpheme.id === route.id);
          return (
            <details
              className="alpha-dropdown"
              key={group.letter}
              open={activeInGroup}
            >
              <summary className="alpha-summary">
                <span className="alpha-letter">{group.letter}</span>
                <span className="alpha-count">{group.morphemes.length}</span>
                <ChevronDown className="alpha-chevron" aria-hidden="true" />
              </summary>
              <div className="alpha-menu">
                {group.morphemes.length ? (
                  group.morphemes.map((morpheme) => {
                    const isActive =
                      route.type === 'morpheme' && route.id === morpheme.id;
                    return (
                      <button
                        className={`alpha-word ${isActive ? 'alpha-word-active' : ''}`}
                        key={morpheme.id}
                        onClick={() =>
                          navigate({ type: 'morpheme', id: morpheme.id })
                        }
                        type="button"
                      >
                        <span>{morpheme.display}</span>
                        <span>{morpheme.zh}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="alpha-empty">No roots yet</p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function getAlphabetWordGroups() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return letters.map((letter) => ({
    letter,
    words: words.filter(
      (word) => word.word.charAt(0).toUpperCase() === letter,
    ),
  }));
}

function getAlphabetMorphemeGroups() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return letters.map((letter) => ({
    letter,
    morphemes: morphemes.filter(
      (morpheme) => getAlphabetLabel(morpheme.display).charAt(0) === letter,
    ),
  }));
}

function getAlphabetLabel(label: string) {
  return label.replace(/^[^A-Za-z]+/, '').toUpperCase();
}

function getWordsSharingCoreRoots(activeWord: WordEntry) {
  const coreMorphemeIds = getCoreMorphemeIds(activeWord);
  if (!coreMorphemeIds.size) {
    return [];
  }

  return words
    .filter((word) =>
      word.components.some((component) =>
        coreMorphemeIds.has(component.morpheme),
      ),
    )
    .sort((a, b) => {
      if (a.id === activeWord.id) {
        return -1;
      }
      if (b.id === activeWord.id) {
        return 1;
      }
      return a.word.localeCompare(b.word);
    });
}

function getCoreMorphemeIds(word: WordEntry) {
  return new Set(
    word.components
      .filter(isCoreComponent)
      .map((component) => component.morpheme),
  );
}

function getWordsUsingMorpheme(morphemeId: string) {
  return words.filter((word) =>
    word.components.some((component) => component.morpheme === morphemeId),
  );
}

function ResultGroup({
  current,
  emptyLabel,
  items,
  title,
}: {
  current: RouteState;
  emptyLabel: string;
  items: Array<{
    id: string;
    label: string;
    sublabel?: string;
    type: RouteState['type'];
  }>;
  title: string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-1">
        {items.length ? (
          items.map((item) => {
            const isActive = current.type === item.type && current.id === item.id;
            return (
              <button
                className={`result-row ${isActive ? 'result-row-active' : ''}`}
                key={`${item.type}-${item.id}`}
                onClick={() => navigate({ type: item.type, id: item.id })}
                type="button"
              >
                <span className="truncate font-medium">{item.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.sublabel}
                </span>
              </button>
            );
          })
        ) : (
          emptyLabel ? (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          ) : null
        )}
      </div>
    </div>
  );
}

function WordDetail({
  freezeTopPane,
  word,
}: {
  freezeTopPane: boolean;
  word: WordEntry;
}) {
  const familyEntries = getWordFamilyEntries(word);

  return (
    <article className="vocab-article">
      <div
        className={`freeze-pane ${freezeTopPane ? 'freeze-pane-active' : ''}`}
      >
        <WordFamilyTabs activeWord={word} familyEntries={familyEntries} />
        <header className="border-b border-border pb-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-heading text-4xl font-semibold tracking-normal">
              {word.word}
            </h1>
            <span className="word-badge uppercase">
              {word.pos}
            </span>
            {word.phonetic ? (
              <span className="word-badge">{word.phonetic}</span>
            ) : null}
          </div>
          <p className="mt-2 text-lg leading-7">
            {word.en}
            <span className="text-muted-foreground"> / {word.zh}</span>
          </p>
        </header>

        <DetailSection title="Word DNA / 构词拆解">
          <div className="overflow-x-auto">
            <table className="dna-table">
              <colgroup>
                <col className="dna-col-form" />
                <col className="dna-col-meaning" />
                <col className="dna-col-zh" />
                <col className="dna-col-etymon" />
                <col className="dna-col-etymon-meaning" />
              </colgroup>
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Meaning in this word</th>
                  <th>中文</th>
                  <th>Etymon / 源词根</th>
                  <th>Etymon Meaning / 源义</th>
                </tr>
              </thead>
              <tbody>
                {word.components.map((component, componentIndex) => {
                  const source = getComponentSource(component);
                  const ownerKey = `${word.id}-${component.morpheme}-${componentIndex}`;

                  return (
                    <Fragment key={ownerKey}>
                      <tr>
                        <td>
                          <InlineLink
                            label={component.form}
                            route={{ type: "morpheme", id: component.morpheme }}
                          />
                        </td>
                        <td>
                          {component.meaning_in_word}
                          {component.note ? (
                            <span className="dna-note">{component.note}</span>
                          ) : null}
                        </td>
                        <td>{component.zh}</td>
                        <td>{source.form}</td>
                        <td>{source.meaning}</td>
                      </tr>
                      <RelatedMorphemeRows
                        ids={component.related_morphemes}
                        ownerKey={ownerKey}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DetailSection>
      </div>

      <DetailSection title="Root Families / 相关例词">
        <RootFamilyColumns word={word} />
      </DetailSection>

      <DetailSection title="Word Family / 派生词">
        <WordFamilyRows word={word} />
      </DetailSection>

      <DetailSection title="Common Confusions / 易混淆词">
        <div className="space-y-3">
          {word.confusables.map((item) => (
            <div className="comparison-row" key={`${word.id}-${item.word}`}>
              <InlineWord label={item.word} />
              <span className="text-sm leading-6 text-muted-foreground">
                <span className="block">{getConfusionDescription(item)}</span>
                <span className="block">
                  {getConfusionReasonLine(word, item)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Examples">
        <div className="space-y-3">
          {word.examples.map((example) => (
            <blockquote
              className="border-l-2 border-primary pl-3"
              key={example.en}
            >
              <p className="leading-7">{example.en}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {example.zh}
              </p>
            </blockquote>
          ))}
        </div>
      </DetailSection>
    </article>
  );
}

function WordFamilyTabs({
  activeWord,
  familyEntries,
}: {
  activeWord: WordEntry;
  familyEntries: WordEntry[];
}) {
  if (familyEntries.length < 2) {
    return null;
  }

  const familyStem = getWordFamilyStem(familyEntries);

  return (
    <nav
      aria-label={`${familyEntries[0].word} word family`}
      className="family-tabs"
    >
      <span className="family-tab family-stem-tab">
        {familyStem}
      </span>
      {familyEntries.map((entry) => (
        <button
          className={`family-tab ${entry.id === activeWord.id ? 'family-tab-active' : ''}`}
          key={entry.id}
          onClick={() => navigate({ type: 'word', id: entry.id })}
          type="button"
        >
          {getWordVariantLabel(entry, familyStem)}
        </button>
      ))}
    </nav>
  );
}

function getWordFamilyEntries(word: WordEntry) {
  const activeWordLabel = word.word.toLowerCase();
  const familyLabels = new Set([
    activeWordLabel,
    ...word.word_family.map((label) => label.toLowerCase()),
  ]);

  for (const entry of words) {
    if (entry.word_family.some((label) => label.toLowerCase() === activeWordLabel)) {
      familyLabels.add(entry.word.toLowerCase());
    }
  }

  return words
    .filter((entry) => familyLabels.has(entry.word.toLowerCase()))
    .sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word));
}

function getWordFamilyStem(familyEntries: WordEntry[]) {
  const labels = familyEntries.map((entry) => entry.word.toLowerCase());
  const commonPrefix = getCommonPrefix(labels).replace(/[^a-z]+$/g, '');
  const fallbackStem = familyEntries[0]?.components.at(0)?.form.replace(/-+$/g, '');
  const stem = commonPrefix || fallbackStem || familyEntries[0]?.word || '';
  return stem.endsWith('-') ? stem : `${stem}-`;
}

function getCommonPrefix(labels: string[]) {
  if (!labels.length) {
    return '';
  }

  let prefix = labels[0];
  for (const label of labels.slice(1)) {
    while (prefix && !label.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function getWordVariantLabel(word: WordEntry, familyStem?: string) {
  return `${getWordVariantSuffix(word, familyStem)} · ${getPosShortLabel(word.pos)}`;
}

function getWordVariantSuffix(word: WordEntry, familyStem?: string) {
  const lowerWord = word.word.toLowerCase();
  const normalizedStem = familyStem?.replace(/-+$/g, '').toLowerCase();
  if (normalizedStem && lowerWord.startsWith(normalizedStem)) {
    const suffix = lowerWord.slice(normalizedStem.length);
    if (suffix) {
      return `-${suffix}`;
    }
  }

  const suffixPatterns: Array<[string, string]> = [
    ['ologically', '-ly'],
    ['ically', '-ly'],
    ['logist', '-ist'],
    ['ological', '-ical'],
    ['ology', '-y'],
    ['aneous', '-aneous'],
    ['eous', '-eous'],
    ['ical', '-ical'],
    ['tion', '-tion'],
    ['ist', '-ist'],
    ['ism', '-ism'],
    ['ure', '-ure'],
    ['ous', '-ous'],
    ['ic', '-ic'],
    ['al', '-al'],
    ['y', '-y'],
  ];
  const matchedPattern = suffixPatterns.find(([ending]) =>
    lowerWord.endsWith(ending),
  );

  if (matchedPattern) {
    return matchedPattern[1];
  }

  return word.components.at(-1)?.form ?? word.word;
}

function getPosShortLabel(pos: string) {
  if (pos === 'adjective') {
    return 'adj';
  }
  if (pos === 'adverb') {
    return 'adv';
  }
  return pos;
}

function RootFamilyColumns({ word }: { word: WordEntry }) {
  const coreComponents = word.components.filter(isCoreComponent);
  const supportComponents = word.components.filter(
    (component) => !isCoreComponent(component),
  );

  return (
    <div className="root-family-layout">
      <RootFamilyStack
        components={coreComponents}
        emptyLabel="No core roots marked yet."
        title="核心词根"
      />
      <RootFamilyStack
        components={supportComponents}
        emptyLabel="No supporting roots."
        title="非核心词根"
      />
    </div>
  );
}

function WordFamilyRows({ word }: { word: WordEntry }) {
  const uniqueWords = Array.from(new Set(word.word_family)).filter(Boolean);

  if (!uniqueWords.length) {
    return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  }

  return (
    <div className="space-y-3">
      {uniqueWords.map((label) => {
        const detail = getWordFamilyDetail(word, label);

        return (
          <div className="comparison-row" key={`${word.id}-${label}`}>
            <InlineWord label={label} />
            <span className="text-sm leading-6 text-muted-foreground">
              {detail.en} / {detail.zh}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getWordFamilyDetail(word: WordEntry, label: string) {
  const explicit = word.word_family_details.find(
    (item) => item.word.toLowerCase() === label.toLowerCase(),
  );
  if (explicit) {
    return explicit;
  }

  const linkedWord = getWord(label);
  if (linkedWord) {
    return { en: linkedWord.en, zh: linkedWord.zh };
  }

  return {
    en: `derived form of ${word.word}`,
    zh: `${word.zh} 的派生词`,
  };
}

function getConfusionDescription(item: WordEntry['confusables'][number]) {
  const linkedWord = getWord(item.word);
  if (linkedWord?.zh) {
    return `${item.reason} / ${linkedWord.zh}`;
  }

  const linkedMorpheme = getMorpheme(normalizeMorphemeId(item.word));
  if (linkedMorpheme?.zh) {
    return `${item.reason} / ${linkedMorpheme.zh}`;
  }

  return item.reason;
}

function getConfusionReasonLine(
  word: WordEntry,
  item: WordEntry['confusables'][number],
) {
  if (item.zh_reason) {
    return `混淆原因：${item.zh_reason}`;
  }

  const linkedWord = getWord(item.word);
  const linkedMorpheme = getMorpheme(normalizeMorphemeId(item.word));
  const comparisonZh = linkedWord?.zh ?? linkedMorpheme?.zh;

  return comparisonZh
    ? `混淆原因：${item.word} 和 ${word.word} 在拼写、词根或主题上接近，但核心义不同；${word.word} 指“${word.zh}”，${item.word} 指“${comparisonZh}”。`
    : `混淆原因：${item.word} 和 ${word.word} 外形或词根线索接近，但走的是不同的意义路径。`;
}

function normalizeMorphemeId(label: string) {
  return label.trim().toLowerCase().replace(/^[-]+|[-]+$/g, '');
}

function RootFamilyStack({
  components,
  emptyLabel,
  title,
}: {
  components: WordComponent[];
  emptyLabel: string;
  title: string;
}) {
  return (
    <div className="root-family-column">
      <h3>{title}</h3>
      {components.length ? (
        components.map((component) => (
          <RootFamilyCard
            component={component}
            key={`${component.morpheme}-${component.form}`}
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function RootFamilyCard({ component }: { component: WordComponent }) {
  const morpheme = getMorpheme(component.morpheme);

  return (
    <div className="sub-panel">
      <h4 className="mb-2 text-sm font-semibold">{component.form}</h4>
      <WordList
        words={[
          ...(morpheme?.high_value_words ?? []),
          ...(morpheme?.senses.flatMap((sense) => sense.examples) ?? []),
        ]}
      />
    </div>
  );
}

function isCoreComponent(component: WordComponent) {
  if (typeof component.is_core === 'boolean') {
    return component.is_core;
  }

  const commonMorphemes = new Set([
    'al',
    'aneous',
    'eous',
    'ic',
    'ical',
    'ious',
    'ism',
    'ist',
    'log',
    'logy',
    'type',
    'ure',
  ]);

  if (commonMorphemes.has(component.morpheme)) {
    return false;
  }

  return component.role !== 'suffix';
}

function getComponentSource(component: WordComponent) {
  const morpheme = getMorpheme(component.morpheme);
  return getMorphemeSource(
    morpheme,
    component.meaning_in_word,
    component.zh,
  );
}

function getMorphemeSource(
  morpheme: MorphemeEntry | undefined,
  fallbackMeaning = '',
  fallbackZh = '',
) {
  const parsedOrigin = parseOrigin(morpheme?.origin ?? '');
  const meaning =
    morpheme?.source_meaning ??
    parsedOrigin.meaning ??
    morpheme?.core_meaning ??
    fallbackMeaning;
  const meaningZh = morpheme?.source_meaning_zh ?? morpheme?.zh ?? fallbackZh;

  return {
    form: morpheme?.source_form
      ? formatEtymonSource(morpheme.source_form)
      : (parsedOrigin.form ?? morpheme?.display ?? ''),
    meaning: `${meaning} / ${meaningZh}`,
  };
}

function parseOrigin(origin: string) {
  const [source, meaning] = origin.split('=').map((part) => part.trim());
  if (!source || !meaning) {
    return { form: formatEtymonSource(origin), meaning: undefined };
  }

  return { form: formatEtymonSource(source), meaning };
}

function formatEtymonSource(source: string) {
  const languagePrefixes = [
    'Old English',
    'Middle English',
    'Greek and Latin',
    'Latin and French',
    'Greek',
    'Latin',
    'French',
  ];
  const matchedPrefix = languagePrefixes.find((prefix) =>
    source.startsWith(`${prefix} `),
  );

  if (!matchedPrefix) {
    return source;
  }

  return `${matchedPrefix} / ${source.slice(matchedPrefix.length).trim()}`;
}

function getRelatedMorphemes(ids: string[] | undefined) {
  return [...new Set(ids ?? [])]
    .map((id) => getMorpheme(id))
    .filter((morpheme): morpheme is MorphemeEntry => Boolean(morpheme));
}

function RelatedMorphemeRows({
  ids,
  ownerKey,
}: {
  ids: string[] | undefined;
  ownerKey: string;
}) {
  return getRelatedMorphemes(ids).map((morpheme) => {
    const source = getMorphemeSource(morpheme);

    return (
      <tr className="dna-subrow" key={`${ownerKey}-${morpheme.id}`}>
        <td>
          <span className="dna-subform">
            <InlineLink
              label={morpheme.display}
              route={{ type: "morpheme", id: morpheme.id }}
            />
          </span>
        </td>
        <td>{morpheme.core_meaning}</td>
        <td>{morpheme.zh}</td>
        <td>{source.form}</td>
        <td>{source.meaning}</td>
      </tr>
    );
  });
}

function LayeredConnectedWords({ morpheme }: { morpheme: MorphemeEntry }) {
  const relatedMorphemes = getRelatedMorphemes(morpheme.related_morphemes);

  return (
    <div className="space-y-3">
      <div className="sub-panel">
        <h3 className="mb-2 text-sm font-semibold">{morpheme.display}</h3>
        <WordList words={morpheme.high_value_words ?? []} />
      </div>
      {relatedMorphemes.map((related) => (
        <details className="sub-panel root-layer-panel" key={related.id}>
          <summary className="root-layer-summary">
            <span>{related.display}</span>
            <span className="root-layer-type">{related.type}</span>
          </summary>
          <WordList words={related.high_value_words ?? []} />
        </details>
      ))}
    </div>
  );
}

function MorphemeDetail({ morpheme }: { morpheme: MorphemeEntry }) {
  const source = getMorphemeSource(morpheme);

  return (
    <article className="vocab-article">
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-heading text-4xl font-semibold tracking-normal">
            {morpheme.display}
          </h1>
          <span className="word-badge uppercase">
            {morpheme.type}
          </span>
        </div>
        <p className="mt-2 text-lg leading-7">
          {morpheme.core_meaning}
          <span className="text-muted-foreground"> / {morpheme.zh}</span>
        </p>
      </header>

      <DetailSection title="Root DNA / 词根拆解">
        <div className="overflow-x-auto">
          <table className="dna-table">
            <colgroup>
              <col className="dna-col-form" />
              <col className="dna-col-meaning" />
              <col className="dna-col-zh" />
              <col className="dna-col-etymon" />
              <col className="dna-col-etymon-meaning" />
            </colgroup>
            <thead>
              <tr>
                <th>Form</th>
                <th>Core Meaning</th>
                <th>中文</th>
                <th>Etymon / 源词根</th>
                <th>Etymon Meaning / 源义</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-semibold text-primary">
                    {morpheme.display}
                  </span>
                </td>
                <td>{morpheme.core_meaning}</td>
                <td>{morpheme.zh}</td>
                <td>{source.form}</td>
                <td>{source.meaning}</td>
              </tr>
              <RelatedMorphemeRows ids={morpheme.related_morphemes} ownerKey={morpheme.id} />
            </tbody>
          </table>
        </div>
        {morpheme.source_note ? (
          <p className="dna-source-note">{morpheme.source_note}</p>
        ) : null}
      </DetailSection>

      <DetailSection title="Meanings">
        <div className="space-y-4">
          {morpheme.senses.map((sense, index) => (
            <div className="sub-panel" key={`${morpheme.id}-${sense.meaning}`}>
              <h3 className="mb-2 text-sm font-semibold">
                {index + 1}. {sense.meaning}
                <span className="ml-2 font-normal text-muted-foreground">
                  {sense.zh}
                </span>
              </h3>
              <WordGlossList words={sense.examples} />
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Common Patterns">
        <PatternList patterns={morpheme.patterns} />
      </DetailSection>

      <DetailSection title="Connected Words">
        <LayeredConnectedWords morpheme={morpheme} />
      </DetailSection>

      <DetailSection title="Similar-Looking Roots">
        <MorphemeGrid ids={morpheme.similar_form} showMeaning />
      </DetailSection>

      <DetailSection title="Meaning-Neighbor Roots">
        <MorphemeGrid ids={morpheme.similar_meaning} showMeaning />
      </DetailSection>

      <DetailSection title="Confusable Words">
        <ul className="dense-list">
          {(morpheme.confusable_words ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailSection>

    </article>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PanelTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      {icon}
      {title}
    </h2>
  );
}

function WordList({ words: wordLabels }: { words: string[] }) {
  const uniqueWords = Array.from(new Set(wordLabels)).filter(Boolean);
  if (!uniqueWords.length) {
    return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  }
  return (
    <ul className="link-list">
      {uniqueWords.map((label) => (
        <li key={label}>
          <InlineWord label={label} />
        </li>
      ))}
    </ul>
  );
}

function WordGlossList({ words: wordLabels }: { words: string[] }) {
  const uniqueWords = Array.from(new Set(wordLabels)).filter(Boolean);
  if (!uniqueWords.length) {
    return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  }
  return (
    <ul className="word-gloss-list">
      {uniqueWords.map((label) => {
        const word = getWord(label.toLowerCase());
        return (
          <li className="word-gloss-item" key={label}>
            <InlineWord label={label} />
            <span className="word-gloss-meaning">{word?.zh ?? ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
type PatternFamilyGroup = {
  key: string;
  labels: string[];
};

type PatternFormGroup = {
  form: string;
  families: PatternFamilyGroup[];
};

function PatternList({ patterns }: { patterns: string[] }) {
  const groupedPatterns = groupPatternsByFormAndFamily(patterns);

  if (!patterns.length) {
    return <p className="text-sm text-muted-foreground">No patterns yet.</p>;
  }
  return (
    <ul className="pattern-list">
      {groupedPatterns.map((pattern) => (
        <li className="pattern-row" key={pattern.form}>
          <span className="pattern-form">{pattern.form}</span>
          <span className="pattern-arrow">-&gt;</span>
          <span className="pattern-families">
            {pattern.families.map((family) => (
              <span className="pattern-family" key={family.key}>
                {family.labels.map((label, index) => (
                  <Fragment key={label}>
                    {index > 0 ? <span className="pattern-comma">, </span> : null}
                    <InlineWord label={label} />
                  </Fragment>
                ))}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function groupPatternsByFormAndFamily(patterns: string[]): PatternFormGroup[] {
  const groups = new Map<string, PatternFamilyGroup[]>();

  for (const pattern of patterns) {
    const parsed = parsePattern(pattern);
    if (!parsed) {
      const fallback = getOrCreatePatternFamily(groups, pattern, `pattern:${pattern}`);
      fallback.labels.push(pattern);
      continue;
    }

    const word = getWord(parsed.label.toLowerCase());
    const familyEntries = word ? getWordFamilyEntries(word) : [];
    const familyKey = familyEntries[0]?.id ?? `word:${parsed.label.toLowerCase()}`;
    const family = getOrCreatePatternFamily(groups, parsed.form, familyKey);
    if (!family.labels.some((label) => label.toLowerCase() === parsed.label.toLowerCase())) {
      family.labels.push(parsed.label);
    }
  }

  return Array.from(groups, ([form, families]) => ({ form, families }));
}

function parsePattern(pattern: string) {
  const match = pattern.match(/^\s*(.+?)\s*->\s*(.+?)\s*$/);
  if (!match) {
    return null;
  }
  return {
    form: match[1],
    label: match[2],
  };
}

function getOrCreatePatternFamily(
  groups: Map<string, PatternFamilyGroup[]>,
  form: string,
  familyKey: string,
) {
  const families = groups.get(form) ?? [];
  let family = families.find((item) => item.key === familyKey);
  if (!family) {
    family = { key: familyKey, labels: [] };
    families.push(family);
    groups.set(form, families);
  }
  return family;
}

function MorphemeGrid({
  ids,
  showMeaning = false,
}: {
  ids: string[];
  showMeaning?: boolean;
}) {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (!uniqueIds.length) {
    return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  }
  return (
    <ul className="morpheme-grid">
      {uniqueIds.map((id) => {
        const morpheme = getMorpheme(id);
        return (
          <li className="morpheme-grid-item" key={id}>
            {morpheme ? (
              <InlineLink
                label={morpheme.display}
                route={{ type: 'morpheme', id }}
              />
            ) : (
              <span className="font-semibold">{id}</span>
            )}
            {showMeaning ? (
              <span className="morpheme-grid-meaning">
                {morpheme?.zh ?? ''}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
function InlineWord({ label }: { label: string }) {
  const word = getWord(label.toLowerCase());
  if (!word) {
    return <span className="inline-word-static">{label}</span>;
  }
  return <InlineLink label={word.word} route={{ type: 'word', id: word.id }} />;
}

function InlineLink({ label, route }: { label: string; route: RouteState }) {
  return (
    <button
      className="inline-link"
      onClick={() => navigate(route)}
      type="button"
    >
      {label}
    </button>
  );
}
