import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const wordsDir = path.join(projectRoot, 'data', 'words');
const morphemesDir = path.join(projectRoot, 'data', 'morphemes');

const [words, morphemes] = await Promise.all([
  readYamlDirectory(wordsDir),
  readYamlDirectory(morphemesDir),
]);

const html = buildHtml({
  words: words.sort((a, b) => a.word.localeCompare(b.word)),
  morphemes: morphemes.sort((a, b) => a.display.localeCompare(b.display)),
});

await writeFile(path.join(projectRoot, 'VocabDNA.html'), html, 'utf8');
await mkdir(path.join(projectRoot, 'dist'), { recursive: true });
await writeFile(path.join(projectRoot, 'dist', 'VocabDNA.html'), html, 'utf8');

async function readYamlDirectory(directory) {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith('.yaml'),
  );

  return Promise.all(
    files.map(async (file) => parseYaml(await readFile(path.join(directory, file), 'utf8'))),
  );
}

function buildHtml(data) {
  const payload = JSON.stringify(data).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VocabDNA</title>
  <meta name="description" content="A local word and morpheme graph for advanced English vocabulary." />
  <style>
    :root {
      --background: #f7f4ec;
      --foreground: #182334;
      --card: #fffefa;
      --muted: #627083;
      --line: #d8d0bf;
      --soft: #ece6d8;
      --accent: #d3ede6;
      --primary: #165f75;
      --primary-dark: #0f4151;
      --warning: #9a5a18;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--foreground);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button, input { font: inherit; }
    button { cursor: pointer; }
    body > header {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--background) 94%, white);
      backdrop-filter: blur(12px);
    }
    .topbar {
      display: grid;
      grid-template-columns: 220px minmax(260px, 700px) 1fr;
      gap: 14px;
      align-items: center;
      max-width: 1500px;
      margin: 0 auto;
      padding: 12px 24px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0;
      text-align: left;
    }
    .mark {
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border-radius: 6px;
      background: var(--foreground);
      color: var(--background);
      font-weight: 800;
      line-height: 1;
    }
    .brand strong { display: block; font-size: 19px; line-height: 20px; }
    .brand span:last-child { display: block; color: var(--muted); font-size: 12px; }
    .search { position: relative; }
    .search input {
      width: 100%;
      height: 42px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--card);
      padding: 0 42px 0 36px;
      color: var(--foreground);
      outline: none;
    }
    .search input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
    .search-icon { position: absolute; left: 12px; top: 10px; color: var(--muted); }
    .clear {
      position: absolute;
      right: 5px;
      top: 5px;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--muted);
    }
    .clear:hover { background: var(--soft); color: var(--foreground); }
    .stats {
      display: flex;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .topbar-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }
    .freeze-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--card);
      color: var(--muted);
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 1px 0 rgb(0 0 0 / 3%);
    }
    .freeze-toggle:hover { background: var(--soft); }
    .freeze-toggle.active { color: var(--primary); }
    .freeze-switch {
      position: relative;
      display: inline-flex;
      width: 44px;
      height: 24px;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--soft);
      transition: background-color 160ms ease, border-color 160ms ease;
    }
    .freeze-switch-thumb {
      position: absolute;
      left: 2px;
      top: 2px;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: var(--card);
      box-shadow: 0 1px 4px rgb(0 0 0 / 22%);
      transition: transform 160ms ease;
    }
    .freeze-toggle.active .freeze-switch {
      border-color: var(--primary);
      background: #18c89a;
    }
    .freeze-toggle.active .freeze-switch-thumb { transform: translateX(20px); }
    .freeze-state {
      width: 24px;
      color: inherit;
      font-size: 10px;
      text-align: left;
    }
    .shell {
      display: grid;
      grid-template-columns: 270px minmax(0, 1fr);
      gap: 20px;
      max-width: 1500px;
      margin: 0 auto;
      padding: 20px 24px;
    }
    aside {
      align-self: start;
      position: sticky;
      top: 78px;
      max-height: calc(100vh - 96px);
      overflow: auto;
    }
    .panel, .article {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--card);
      box-shadow: 0 1px 0 rgba(0,0,0,.03);
    }
    .panel { padding: 15px; margin-bottom: 14px; }
    .article { padding: 26px 32px; }
    .panel-title {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 750;
    }
    .group-title {
      margin: 14px 0 7px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 760;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .result-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      width: 100%;
      border: 0;
      border-radius: 5px;
      background: transparent;
      padding: 7px 8px;
      color: inherit;
      text-align: left;
    }
    .result-row:hover { background: var(--soft); }
    .result-row.active { background: var(--accent); color: var(--primary-dark); }
    .alphabet-dropdowns { display: grid; gap: 4px; }
    .alpha-dropdown { position: relative; }
    .alpha-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 0 8px;
      cursor: pointer;
      list-style: none;
      font-size: 14px;
      font-weight: 720;
    }
    .alpha-summary::-webkit-details-marker { display: none; }
    .alpha-summary:hover { background: var(--soft); }
    .alpha-letter { width: 24px; }
    .alpha-count {
      margin-left: auto;
      min-width: 28px;
      border-radius: 4px;
      background: var(--soft);
      color: var(--muted);
      padding: 1px 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
    }
    .alpha-chevron { color: var(--muted); transition: transform 160ms ease; }
    .alpha-dropdown[open] .alpha-summary { border-color: var(--line); background: var(--soft); }
    .alpha-dropdown[open] .alpha-chevron { transform: rotate(180deg); }
    .alpha-menu {
      max-height: 224px;
      overflow-y: auto;
      margin-top: 4px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--card);
      padding: 4px 0;
      box-shadow: 0 10px 24px rgb(24 35 52 / 14%);
    }
    .alpha-word {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 7px 12px;
      text-align: left;
      font-size: 14px;
    }
    .alpha-word:hover { background: var(--soft); }
    .alpha-word.active { background: var(--accent); color: var(--primary-dark); }
    .alpha-word span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
    .alpha-word span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
    .alpha-word.active span:last-child { color: color-mix(in srgb, var(--primary-dark) 72%, var(--muted)); }
    .alpha-empty { margin: 0; padding: 8px 12px; color: var(--muted); font-size: 14px; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result-sub { color: var(--muted); font-size: 12px; }
    .article header {
      position: static;
      border-bottom: 1px solid var(--line);
      background: transparent;
      padding: 0 0 18px;
    }
    h1 {
      margin: 0;
      font-size: 42px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .meta {
      display: inline-flex;
      margin-left: 10px;
      transform: translateY(-5px);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 2px 7px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 750;
      text-transform: uppercase;
    }
    .meta.phonetic { text-transform: none; }
    .definition { margin: 10px 0 0; font-size: 18px; line-height: 1.55; }
    .zh { margin: 3px 0 0; color: var(--muted); line-height: 1.7; }
    section.detail {
      border-bottom: 1px solid var(--line);
      padding: 22px 0;
    }
    section.detail:last-child { border-bottom: 0; padding-bottom: 0; }
    section.detail h2 {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 780;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      min-width: 820px;
      table-layout: fixed;
      border-collapse: collapse;
      text-align: left;
      font-size: 14px;
    }
    .dna-col-form { width: 13%; }
    .dna-col-meaning { width: 24%; }
    .dna-col-zh { width: 16%; }
    .dna-col-etymon { width: 23%; }
    .dna-col-etymon-meaning { width: 24%; }
    th {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      vertical-align: top;
      line-height: 1.55;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .dna-subrow td {
      color: var(--muted);
    }
    .dna-subform {
      position: relative;
      display: block;
      padding-left: 24px;
    }
    .dna-subform::before {
      content: "";
      position: absolute;
      left: 8px;
      top: 0.72em;
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: color-mix(in srgb, currentColor 48%, transparent);
    }
    .dna-note {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .dna-source-note {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .root-layer-panel { background: color-mix(in srgb, var(--soft) 30%, white); }
    .root-layer-summary {
      display: flex;
      cursor: pointer;
      list-style: none;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--primary);
      font-size: 14px;
      font-weight: 720;
    }
    .root-layer-summary::-webkit-details-marker { display: none; }
    .root-layer-type {
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 2px 6px;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
    }
    .scroll { overflow-x: auto; }
    .sub-panel {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: color-mix(in srgb, var(--soft) 55%, white);
      padding: 12px;
    }
    .freeze-pane { background: var(--card); }
    .freeze-pane.active {
      position: sticky;
      top: 72px;
      z-index: 4;
      margin-left: -32px;
      margin-right: -32px;
      padding-left: 32px;
      padding-right: 32px;
      background: var(--card);
      box-shadow: 0 8px 16px rgb(24 35 52 / 10%);
    }
    .freeze-pane section.detail:last-child { border-bottom: 1px solid var(--line); }
    .family-tabs {
      display: flex;
      gap: 1px;
      overflow-x: auto;
      margin: -26px -32px 22px;
      border-bottom: 1px solid var(--line);
      background: var(--line);
    }
    .family-tab {
      min-width: 96px;
      border: 0;
      background: var(--soft);
      color: var(--foreground);
      padding: 7px 14px;
      font-size: 14px;
      font-weight: 650;
      text-align: left;
    }
    .family-tab:hover { background: var(--accent); }
    .family-tab.active { background: var(--card); color: var(--primary); }
    .family-stem-tab {
      cursor: default;
      background: var(--card);
      color: var(--primary);
    }
    .family-stem-tab:hover { background: var(--card); }
    .root-family-layout {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 14px;
    }
    .root-family-column {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .root-family-column h3 {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 760;
    }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .link-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 14px;
      line-height: 1.7;
    }
    .word-gloss-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 14px;
      line-height: 1.65;
    }
    .word-gloss-item {
      display: inline-flex;
      min-width: 144px;
      align-items: baseline;
      gap: 6px;
    }
    .word-gloss-meaning {
      color: var(--muted);
      font-size: 12px;
    }    .morpheme-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 96px));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 14px;
    }
    .morpheme-grid-item {
      min-height: 56px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: color-mix(in srgb, var(--soft) 45%, white);
      padding: 8px;
      line-height: 1.45;
    }
    .morpheme-grid-meaning {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }    .dense-list { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.75; }
    .pattern-list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }
    .pattern-row {
      padding-left: 4px;
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 1.8;
    }
    .pattern-form {
      margin-right: 8px;
      color: var(--foreground);
      font-weight: 720;
    }
    .pattern-arrow {
      margin-right: 8px;
      color: var(--muted);
    }
    .pattern-families {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      vertical-align: middle;
    }
    .pattern-family {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0;
      border: 1px solid var(--line);
      border-radius: 3px;
      background: transparent;
      padding: 2px 8px;
      vertical-align: middle;
    }
    .pattern-family .inline-link,
    .pattern-family .inline-word-static {
      display: inline;
      width: auto;
      text-align: left;
      font-size: 14px;
    }
    .pattern-comma {
      color: var(--muted);
      margin-right: 6px;
    }
    .inline-link {
      border: 0;
      background: transparent;
      color: var(--primary);
      padding: 0;
      font-weight: 720;
      text-decoration: none;
    }
    .inline-link:hover { text-decoration: underline; text-underline-offset: 2px; }
    .inline-word-static {
      display: block;
      width: 100%;
      color: var(--foreground);
      font-weight: 720;
      text-align: center;
    }
    .comparison {
      display: grid;
      grid-template-columns: 160px minmax(0, 1fr);
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: color-mix(in srgb, var(--soft) 45%, white);
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    blockquote {
      border-left: 2px solid var(--primary);
      margin: 0 0 12px;
      padding-left: 12px;
    }
    blockquote p { margin: 0; line-height: 1.65; }
    .note { color: var(--muted); font-size: 14px; line-height: 1.65; }
    .mini-group {
      border-top: 1px solid var(--line);
      padding-top: 12px;
      margin-top: 12px;
    }
    .mini-group:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
    @media (max-width: 760px) {
      .topbar { grid-template-columns: 1fr; padding: 12px 14px; }
      .topbar-actions { justify-content: flex-start; }
      .shell { grid-template-columns: 1fr; padding: 14px; }
      aside { position: static; max-height: none; }
      .article { padding: 20px 16px; }
      .freeze-pane.active {
        top: 128px;
        margin-left: -16px;
        margin-right: -16px;
        padding-left: 16px;
        padding-right: 16px;
      }
      .family-tabs { margin: -20px -16px 20px; }
      h1 { font-size: 34px; }
      .grid-2, .comparison, .root-family-layout { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <button class="brand" type="button" data-route="word:archaeology">
        <span class="mark">VD</span>
        <span><strong>VocabDNA</strong><span>word roots, not word lists</span></span>
      </button>
      <label class="search">
        <span class="search-icon">⌕</span>
        <input id="search" autocomplete="off" placeholder="Search word or morpheme: archaeology, -logy, simul..." />
        <button id="clear" class="clear" type="button" aria-label="Clear search">×</button>
      </label>
      <div class="topbar-actions">
        <div class="stats"><span id="word-count"></span><span>/</span><span id="morpheme-count"></span><span>/</span><span>local HTML</span></div>
        <button id="freeze-toggle" class="freeze-toggle" type="button" aria-pressed="false" aria-label="Freeze top pane off">
          <span class="freeze-label">Freeze Top Pane</span>
          <span class="freeze-switch" aria-hidden="true"><span class="freeze-switch-thumb"></span></span>
          <span id="freeze-state" class="freeze-state">OFF</span>
        </button>
      </div>
    </div>
  </header>
  <main class="shell">
    <aside>
      <div class="panel">
        <h2 class="panel-title">Search Results</h2>
        <div id="search-results" class="note">Type any word, root, prefix, suffix, English meaning, or Chinese gloss.</div>
      </div>
      <div class="panel">
        <h2 class="panel-title">Browse</h2>
        <div id="browse"></div>
      </div>
      <div class="panel">
        <h2 class="panel-title">A-Z Words</h2>
        <div id="alphabet-browse"></div>
      </div>
      <div class="panel">
        <h2 class="panel-title">A-Z Roots</h2>
        <div id="alphabet-root-browse"></div>
      </div>
    </aside>
    <article id="detail" class="article"></article>
  </main>
  <script id="vocab-data" type="application/json">${payload}</script>
  <script>
    const data = JSON.parse(document.getElementById('vocab-data').textContent);
    const words = data.words;
    const morphemes = data.morphemes;
    const wordById = new Map(words.map((word) => [word.id, word]));
    const wordByLabel = new Map(words.map((word) => [word.word.toLowerCase(), word]));
    const morphemeById = new Map(morphemes.map((morpheme) => [morpheme.id, morpheme]));
    const searchInput = document.getElementById('search');
    const clearButton = document.getElementById('clear');
    const freezeToggle = document.getElementById('freeze-toggle');
    const freezeState = document.getElementById('freeze-state');
    let freezeTopPane = readFreezeSetting();

    document.getElementById('word-count').textContent = words.length + ' Words';
    document.getElementById('morpheme-count').textContent = morphemes.length + ' Morphemes';

    function readFreezeSetting() {
      try {
        return localStorage.getItem('vocabdna-freeze-top-pane') === 'true';
      } catch {
        return false;
      }
    }

    function saveFreezeSetting(value) {
      try {
        localStorage.setItem('vocabdna-freeze-top-pane', String(value));
      } catch {
        // The local file still works when browser storage is unavailable.
      }
    }

    function updateFreezeToggle() {
      freezeToggle.classList.toggle('active', freezeTopPane);
      freezeToggle.setAttribute('aria-pressed', String(freezeTopPane));
      freezeToggle.setAttribute('aria-label', 'Freeze top pane ' + (freezeTopPane ? 'on' : 'off'));
      freezeState.textContent = freezeTopPane ? 'ON' : 'OFF';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
    }

    function normalize(value) {
      return String(value ?? '').trim().toLowerCase().replace(/^[-]+|[-]+$/g, '');
    }

    function score(query, text) {
      const normalized = normalize(text);
      const stripped = normalized.replaceAll('-', '');
      if (!query) return 1;
      if (normalized.startsWith(query) || stripped.startsWith(query)) return 4;
      if (normalized.includes(query) || stripped.includes(query)) return 2;
      return query.split(/\\s+/).filter((token) => token && normalized.includes(token)).length;
    }

    function searchWords(query) {
      const q = normalize(query);
      return words
        .map((word) => ({
          word,
          score: score(q, [word.word, word.zh, word.en, word.pos, word.word_family?.join(' '), word.components?.map((item) => item.form + ' ' + item.meaning_in_word).join(' ')].join(' '))
        }))
        .filter((item) => !q || item.score > 0)
        .sort((a, b) => b.score - a.score || a.word.word.localeCompare(b.word.word))
        .map((item) => item.word);
    }

    function searchMorphemes(query) {
      const q = normalize(query);
      return morphemes
        .map((morpheme) => ({
          morpheme,
          score: score(q, [morpheme.id, morpheme.display, morpheme.type, morpheme.core_meaning, morpheme.zh, morpheme.origin, morpheme.high_value_words?.join(' '), morpheme.senses?.map((sense) => sense.meaning + ' ' + sense.zh + ' ' + sense.examples.join(' ')).join(' ')].join(' '))
        }))
        .filter((item) => !q || item.score > 0)
        .sort((a, b) => b.score - a.score || a.morpheme.display.localeCompare(b.morpheme.display))
        .map((item) => item.morpheme);
    }

    function getRoute() {
      const [type, id] = location.hash.replace(/^#\\/?/, '').split('/');
      if (type === 'morpheme' && morphemeById.has(id)) return { type, id };
      if (type === 'word' && wordById.has(id)) return { type, id };
      return { type: 'word', id: 'archaeology' };
    }

    function setRoute(type, id) {
      location.hash = type + '/' + id;
    }

    function routeButton(type, id, label, className = 'inline-link') {
      return '<button class="' + className + '" type="button" data-route="' + type + ':' + id + '">' + escapeHtml(label) + '</button>';
    }

    function inlineWord(label) {
      const word = wordByLabel.get(String(label).toLowerCase());
      return word ? routeButton('word', word.id, word.word) : '<span class="inline-word-static">' + escapeHtml(label) + '</span>';
    }

    function wordList(labels) {
      const unique = [...new Set((labels ?? []).filter(Boolean))];
      if (!unique.length) return '<p class="note">No entries yet.</p>';
      return '<ul class="link-list">' + unique.map((label) => '<li>' + inlineWord(label) + '</li>').join('') + '</ul>';
    }
    function wordGlossList(labels) {
      const unique = [...new Set((labels ?? []).filter(Boolean))];
      if (!unique.length) return '<p class="note">No entries yet.</p>';
      return '<ul class="word-gloss-list">' + unique.map((label) => {
        const word = wordByLabel.get(String(label).toLowerCase());
        return '<li class="word-gloss-item">' + inlineWord(label) + '<span class="word-gloss-meaning">' + escapeHtml(word?.zh ?? '') + '</span></li>';
      }).join('') + '</ul>';
    }

    function getWordFamilyDetail(word, label) {
      const explicit = (word.word_family_details ?? []).find(
        (item) => String(item.word).toLowerCase() === String(label).toLowerCase()
      );
      if (explicit) return explicit;

      const linkedWord = wordByLabel.get(String(label).toLowerCase());
      if (linkedWord) return { en: linkedWord.en, zh: linkedWord.zh };

      return {
        en: 'derived form of ' + word.word,
        zh: word.zh + ' 的派生词'
      };
    }

    function wordFamilyRows(word) {
      const unique = [...new Set((word.word_family ?? []).filter(Boolean))];
      if (!unique.length) return '<p class="note">No entries yet.</p>';
      return unique.map((label) => {
        const detail = getWordFamilyDetail(word, label);
        return '<div class="comparison">' + inlineWord(label) + '<span class="note">' + escapeHtml(detail.en) + ' / ' + escapeHtml(detail.zh) + '</span></div>';
      }).join('');
    }

    function getWordFamilyEntries(word) {
      const familyLabels = new Set([
        String(word.word).toLowerCase(),
        ...(word.word_family ?? []).map((label) => String(label).toLowerCase())
      ]);

      for (const entry of words) {
        if ((entry.word_family ?? []).some((label) => String(label).toLowerCase() === String(word.word).toLowerCase())) {
          familyLabels.add(String(entry.word).toLowerCase());
        }
      }

      return words
        .filter((entry) => familyLabels.has(String(entry.word).toLowerCase()))
        .sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word));
    }

    function getPosShortLabel(pos) {
      if (pos === 'adjective') return 'adj';
      if (pos === 'adverb') return 'adv';
      return pos;
    }

    function getWordFamilyStem(familyEntries) {
      const labels = familyEntries.map((entry) => String(entry.word).toLowerCase());
      const commonPrefix = getCommonPrefix(labels).replace(/[^a-z]+$/g, '');
      const fallbackStem = familyEntries[0]?.components?.at(0)?.form?.replace(/-+$/g, '');
      const stem = commonPrefix || fallbackStem || familyEntries[0]?.word || '';
      return String(stem).endsWith('-') ? String(stem) : String(stem) + '-';
    }

    function getCommonPrefix(labels) {
      if (!labels.length) return '';

      let prefix = labels[0];
      for (const label of labels.slice(1)) {
        while (prefix && !label.startsWith(prefix)) {
          prefix = prefix.slice(0, -1);
        }
      }
      return prefix;
    }

    function getWordVariantSuffix(word, familyStem) {
      const lowerWord = String(word.word).toLowerCase();
      const normalizedStem = familyStem?.replace(/-+$/g, '').toLowerCase();
      if (normalizedStem && lowerWord.startsWith(normalizedStem)) {
        const suffix = lowerWord.slice(normalizedStem.length);
        if (suffix) return '-' + suffix;
      }

      const suffixPatterns = [
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
        ['y', '-y']
      ];
      const matchedPattern = suffixPatterns.find(([ending]) => lowerWord.endsWith(ending));
      if (matchedPattern) return matchedPattern[1];
      return word.components?.at(-1)?.form ?? word.word;
    }

    function getWordVariantLabel(word, familyStem) {
      return getWordVariantSuffix(word, familyStem) + ' · ' + getPosShortLabel(word.pos);
    }

    function wordFamilyTabs(activeWord) {
      const familyEntries = getWordFamilyEntries(activeWord);
      if (familyEntries.length < 2) return '';
      const familyStem = getWordFamilyStem(familyEntries);

      return '<nav class="family-tabs" aria-label="' + escapeHtml(familyEntries[0].word) + ' word family">' +
        '<span class="family-tab family-stem-tab">' + escapeHtml(familyStem) + '</span>' +
        familyEntries.map((entry) => {
          const active = entry.id === activeWord.id ? ' active' : '';
          return routeButton('word', entry.id, getWordVariantLabel(entry, familyStem), 'family-tab' + active);
        }).join('') +
      '</nav>';
    }

    function normalizeMorphemeId(label) {
      return String(label ?? '').trim().toLowerCase().replace(/^[-]+|[-]+$/g, '');
    }

    function getConfusionDescription(item) {
      const linkedWord = wordByLabel.get(String(item.word).toLowerCase());
      if (linkedWord?.zh) return item.reason + ' / ' + linkedWord.zh;

      const linkedMorpheme = morphemeById.get(normalizeMorphemeId(item.word));
      if (linkedMorpheme?.zh) return item.reason + ' / ' + linkedMorpheme.zh;

      return item.reason;
    }

    function getConfusionReasonLine(word, item) {
      if (item.zh_reason) return '混淆原因：' + item.zh_reason;

      const linkedWord = wordByLabel.get(String(item.word).toLowerCase());
      const linkedMorpheme = morphemeById.get(normalizeMorphemeId(item.word));
      const comparisonZh = linkedWord?.zh ?? linkedMorpheme?.zh;

      return comparisonZh
        ? '混淆原因：' + item.word + ' 和 ' + word.word + ' 在拼写、词根或主题上接近，但核心义不同；' + word.word + ' 指“' + word.zh + '”，' + item.word + ' 指“' + comparisonZh + '”。'
        : '混淆原因：' + item.word + ' 和 ' + word.word + ' 外形或词根线索接近，但走的是不同的意义路径。';
    }

    function isCoreComponent(component) {
      if (typeof component.is_core === 'boolean') return component.is_core;
      const commonMorphemes = new Set(['al', 'aneous', 'eous', 'ic', 'ical', 'ious', 'ism', 'ist', 'log', 'logy', 'type', 'ure']);
      if (commonMorphemes.has(component.morpheme)) return false;
      return component.role !== 'suffix';
    }

    function parseOrigin(origin) {
      const [source, meaning] = String(origin ?? '').split('=').map((part) => part.trim());
      if (!source || !meaning) return { form: formatEtymonSource(origin), meaning: undefined };
      return { form: formatEtymonSource(source), meaning };
    }

    function formatEtymonSource(source) {
      const languagePrefixes = ['Old English', 'Middle English', 'Greek and Latin', 'Latin and French', 'Greek', 'Latin', 'French'];
      const matchedPrefix = languagePrefixes.find((prefix) => String(source ?? '').startsWith(prefix + ' '));
      if (!matchedPrefix) return source;
      return matchedPrefix + ' / ' + String(source).slice(matchedPrefix.length).trim();
    }

    function getComponentSource(component) {
      const morpheme = morphemeById.get(component.morpheme);
      return getMorphemeSource(morpheme, component.meaning_in_word, component.zh);
    }

    function getMorphemeSource(morpheme, fallbackMeaning = '', fallbackZh = '') {
      const parsedOrigin = parseOrigin(morpheme?.origin ?? '');
      const meaning = morpheme?.source_meaning ?? parsedOrigin.meaning ?? morpheme?.core_meaning ?? fallbackMeaning;
      const meaningZh = morpheme?.source_meaning_zh ?? morpheme?.zh ?? fallbackZh;
      return {
        form: morpheme?.source_form ? formatEtymonSource(morpheme.source_form) : (parsedOrigin.form ?? morpheme?.display ?? ''),
        meaning: meaning + ' / ' + meaningZh
      };
    }

    function getRelatedMorphemes(ids) {
      return [...new Set(ids ?? [])]
        .map((id) => morphemeById.get(id))
        .filter(Boolean);
    }

    function relatedMorphemeRows(ids, ownerKey) {
      return getRelatedMorphemes(ids).map((morpheme) => {
        const source = getMorphemeSource(morpheme);
        return '<tr class="dna-subrow"><td><span class="dna-subform">' +
          routeButton('morpheme', morpheme.id, morpheme.display) +
          '</span></td><td>' + escapeHtml(morpheme.core_meaning) +
          '</td><td>' + escapeHtml(morpheme.zh) +
          '</td><td>' + escapeHtml(source.form) +
          '</td><td>' + escapeHtml(source.meaning) + '</td></tr>';
      }).join('');
    }

    function morphemeDnaRows(morpheme) {
      const source = getMorphemeSource(morpheme);
      const mainRow = '<tr><td><span class="inline-link">' + escapeHtml(morpheme.display) +
        '</span></td><td>' + escapeHtml(morpheme.core_meaning) +
        '</td><td>' + escapeHtml(morpheme.zh) +
        '</td><td>' + escapeHtml(source.form) +
        '</td><td>' + escapeHtml(source.meaning) + '</td></tr>';
      return mainRow + relatedMorphemeRows(morpheme.related_morphemes, morpheme.id);
    }

    function sourceNote(morpheme) {
      return morpheme.source_note
        ? '<p class="dna-source-note">' + escapeHtml(morpheme.source_note) + '</p>'
        : '';
    }

    function layeredConnectedWords(morpheme) {
      const direct = '<div class="sub-panel"><strong>' + escapeHtml(morpheme.display) +
        '</strong><div style="margin-top:8px">' + wordList(morpheme.high_value_words ?? []) + '</div></div>';
      const related = getRelatedMorphemes(morpheme.related_morphemes).map((item) =>
        '<details class="sub-panel root-layer-panel"><summary class="root-layer-summary"><span>' +
        escapeHtml(item.display) + '</span><span class="root-layer-type">' + escapeHtml(item.type) +
        '</span></summary>' + wordList(item.high_value_words ?? []) + '</details>'
      ).join('');
      return '<div class="stack">' + direct + related + '</div>';
    }

    function rootFamilyCard(component) {
      const morpheme = morphemeById.get(component.morpheme);
      const examples = [...(morpheme?.high_value_words ?? []), ...((morpheme?.senses ?? []).flatMap((sense) => sense.examples))];
      return '<div class="sub-panel"><strong>' + escapeHtml(component.form) + '</strong><div style="margin-top:8px">' + wordList(examples) + '</div></div>';
    }

    function rootFamilyColumn(title, components, emptyLabel) {
      const content = components.length
        ? components.map(rootFamilyCard).join('')
        : '<p class="note">' + escapeHtml(emptyLabel) + '</p>';
      return '<div class="root-family-column"><h3>' + escapeHtml(title) + '</h3>' + content + '</div>';
    }

    function rootFamilyLayout(word) {
      const coreComponents = word.components.filter(isCoreComponent);
      const supportComponents = word.components.filter((component) => !isCoreComponent(component));
      return '<div class="root-family-layout">' +
        rootFamilyColumn('核心词根', coreComponents, 'No core roots marked yet.') +
        rootFamilyColumn('非核心词根', supportComponents, 'No supporting roots.') +
      '</div>';
    }
    function commonPatternList(patterns) {
      if (!patterns.length) return '<p class="note">No patterns yet.</p>';
      const groups = groupPatternsByFormAndFamily(patterns);
      return '<ul class="pattern-list">' + groups.map((group) =>
        '<li class="pattern-row"><span class="pattern-form">' + escapeHtml(group.form) +
        '</span><span class="pattern-arrow">-&gt;</span><span class="pattern-families">' +
        group.families.map((family) => '<span class="pattern-family">' + family.labels.map((label, index) =>
          (index > 0 ? '<span class="pattern-comma">, </span>' : '') + inlineWord(label)
        ).join('') + '</span>').join('') +
        '</span></li>'
      ).join('') + '</ul>';
    }

    function groupPatternsByFormAndFamily(patterns) {
      const groups = new Map();
      for (const pattern of patterns) {
        const parsed = parsePattern(pattern);
        if (!parsed) {
          const family = getOrCreatePatternFamily(groups, pattern, 'pattern:' + pattern);
          family.labels.push(pattern);
          continue;
        }
        const word = wordByLabel.get(String(parsed.label).toLowerCase());
        const familyEntries = word ? getWordFamilyEntries(word) : [];
        const familyKey = familyEntries[0]?.id ?? 'word:' + String(parsed.label).toLowerCase();
        const family = getOrCreatePatternFamily(groups, parsed.form, familyKey);
        if (!family.labels.some((label) => String(label).toLowerCase() === String(parsed.label).toLowerCase())) {
          family.labels.push(parsed.label);
        }
      }
      return [...groups.entries()].map(([form, families]) => ({ form, families }));
    }

    function parsePattern(pattern) {
      const match = String(pattern).match(/^\\s*(.+?)\\s*->\\s*(.+?)\\s*$/);
      return match ? { form: match[1], label: match[2] } : null;
    }

    function getOrCreatePatternFamily(groups, form, familyKey) {
      const families = groups.get(form) ?? [];
      let family = families.find((item) => item.key === familyKey);
      if (!family) {
        family = { key: familyKey, labels: [] };
        families.push(family);
        groups.set(form, families);
      }
      return family;
    }




    function morphemeGrid(ids, showMeaning = false) {
      const unique = [...new Set((ids ?? []).filter(Boolean))];
      if (!unique.length) return '<p class="note">No entries yet.</p>';
      return '<ul class="morpheme-grid">' + unique.map((id) => {
        const morpheme = morphemeById.get(id);
        const label = morpheme ? routeButton('morpheme', id, morpheme.display) : '<span style="font-weight:720">' + escapeHtml(id) + '</span>';
        const meaning = showMeaning ? '<span class="morpheme-grid-meaning">' + escapeHtml(morpheme?.zh ?? '') + '</span>' : '';
        return '<li class="morpheme-grid-item">' + label + meaning + '</li>';
      }).join('') + '</ul>';
    }


    function resultGroup(title, items, route, emptyLabel) {
      return '<h3 class="group-title">' + escapeHtml(title) + '</h3>' +
        (items.length ? items.map((item) => {
          const active = route.type === item.type && route.id === item.id ? ' active' : '';
          return '<button class="result-row' + active + '" type="button" data-route="' + item.type + ':' + item.id + '">' +
            '<span class="truncate">' + escapeHtml(item.label) + '</span>' +
            '<span class="result-sub truncate">' + escapeHtml(item.sublabel ?? '') + '</span>' +
          '</button>';
        }).join('') : (emptyLabel ? '<p class="note">' + escapeHtml(emptyLabel) + '</p>' : ''));
    }

    function getCoreMorphemeIds(word) {
      return new Set((word.components ?? []).filter(isCoreComponent).map((component) => component.morpheme));
    }

    function getAlphabetWordGroups() {
      return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => ({
        letter,
        words: words.filter((word) => String(word.word).charAt(0).toUpperCase() === letter)
      }));
    }

    function getAlphabetMorphemeGroups() {
      return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => ({
        letter,
        morphemes: morphemes.filter((morpheme) => getAlphabetLabel(morpheme.display).charAt(0) === letter)
      }));
    }

    function getAlphabetLabel(label) {
      return String(label ?? '').replace(/^[^A-Za-z]+/, '').toUpperCase();
    }

    function alphabetBrowsePanel(route) {
      return '<div class="alphabet-dropdowns">' + getAlphabetWordGroups().map((group) => {
        const activeInGroup = route.type === 'word' && group.words.some((word) => word.id === route.id);
        const open = activeInGroup ? ' open' : '';
        const body = group.words.length
          ? group.words.map((word) => {
              const active = route.type === 'word' && route.id === word.id ? ' active' : '';
              return '<button class="alpha-word' + active + '" type="button" data-route="word:' + word.id + '"><span>' + escapeHtml(word.word) + '</span><span>' + escapeHtml(word.pos) + '</span></button>';
            }).join('')
          : '<p class="alpha-empty">No words yet</p>';

        return '<details class="alpha-dropdown"' + open + '><summary class="alpha-summary"><span class="alpha-letter">' + group.letter + '</span><span class="alpha-count">' + group.words.length + '</span><span class="alpha-chevron">⌄</span></summary><div class="alpha-menu">' + body + '</div></details>';
      }).join('') + '</div>';
    }

    function alphabetRootBrowsePanel(route) {
      return '<div class="alphabet-dropdowns">' + getAlphabetMorphemeGroups().map((group) => {
        const activeInGroup = route.type === 'morpheme' && group.morphemes.some((morpheme) => morpheme.id === route.id);
        const open = activeInGroup ? ' open' : '';
        const body = group.morphemes.length
          ? group.morphemes.map((morpheme) => {
              const active = route.type === 'morpheme' && route.id === morpheme.id ? ' active' : '';
              return '<button class="alpha-word' + active + '" type="button" data-route="morpheme:' + morpheme.id + '"><span>' + escapeHtml(morpheme.display) + '</span><span>' + escapeHtml(morpheme.zh) + '</span></button>';
            }).join('')
          : '<p class="alpha-empty">No roots yet</p>';

        return '<details class="alpha-dropdown"' + open + '><summary class="alpha-summary"><span class="alpha-letter">' + group.letter + '</span><span class="alpha-count">' + group.morphemes.length + '</span><span class="alpha-chevron">⌄</span></summary><div class="alpha-menu">' + body + '</div></details>';
      }).join('') + '</div>';
    }

    function getWordsSharingCoreRoots(activeWord) {
      const coreMorphemeIds = getCoreMorphemeIds(activeWord);
      if (!coreMorphemeIds.size) return [];

      return words
        .filter((word) => (word.components ?? []).some((component) => coreMorphemeIds.has(component.morpheme)))
        .sort((a, b) => {
          if (a.id === activeWord.id) return -1;
          if (b.id === activeWord.id) return 1;
          return a.word.localeCompare(b.word);
        });
    }

    function getWordsUsingMorpheme(morphemeId) {
      return words.filter((word) => (word.components ?? []).some((component) => component.morpheme === morphemeId));
    }

    function browsePanel(route) {
      if (route.type === 'word') {
        const activeWord = wordById.get(route.id);
        const sameCoreRootWords = activeWord ? getWordsSharingCoreRoots(activeWord).slice(0, 10) : [];
        return resultGroup(
          'Same Core Root Words / 同核心词根词',
          sameCoreRootWords.map((word) => ({ type: 'word', id: word.id, label: word.word, sublabel: word.pos })),
          route,
          ''
        );
      }

      const activeMorpheme = morphemeById.get(route.id);
      const wordsUsingMorpheme = activeMorpheme ? getWordsUsingMorpheme(activeMorpheme.id).slice(0, 10) : [];
      const similarMorphemes = (activeMorpheme?.similar_form ?? [])
        .map((id) => morphemeById.get(id))
        .filter(Boolean)
        .slice(0, 10);

      return resultGroup(
        'Words Using This Root / 使用该词根的词',
        wordsUsingMorpheme.map((word) => ({ type: 'word', id: word.id, label: word.word, sublabel: word.pos })),
        route,
        ''
      ) +
      resultGroup(
        'Similar-Looking Roots / 拼写相近词根',
        similarMorphemes.map((morpheme) => ({ type: 'morpheme', id: morpheme.id, label: morpheme.display, sublabel: morpheme.type })),
        route,
        ''
      );
    }

    function detailSection(title, body) {
      return '<section class="detail"><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
    }

    function renderSearch(route) {
      const query = searchInput.value;
      document.getElementById('search-results').innerHTML = query
        ? resultGroup('Word', searchWords(query).slice(0, 9).map((word) => ({ type: 'word', id: word.id, label: word.word, sublabel: word.zh })), route, 'No matching words') +
          resultGroup('Morpheme', searchMorphemes(query).slice(0, 9).map((morpheme) => ({ type: 'morpheme', id: morpheme.id, label: morpheme.display, sublabel: morpheme.zh })), route, 'No matching morphemes')
        : 'Type any word, root, prefix, suffix, English meaning, or Chinese gloss.';

      document.getElementById('browse').innerHTML =
        browsePanel(route);
      document.getElementById('alphabet-browse').innerHTML =
        alphabetBrowsePanel(route);
      document.getElementById('alphabet-root-browse').innerHTML =
        alphabetRootBrowsePanel(route);
    }

    function renderWord(word) {
      const rows = word.components.map((component, componentIndex) => {
        const source = getComponentSource(component);
        const ownerKey = word.id + '-' + component.morpheme + '-' + componentIndex;
        const note = component.note
          ? '<span class="dna-note">' + escapeHtml(component.note) + '</span>'
          : '';
        const mainRow = '<tr><td>' + routeButton('morpheme', component.morpheme, component.form) +
          '</td><td>' + escapeHtml(component.meaning_in_word) + note +
          '</td><td>' + escapeHtml(component.zh) +
          '</td><td>' + escapeHtml(source.form) +
          '</td><td>' + escapeHtml(source.meaning) + '</td></tr>';
        return mainRow + relatedMorphemeRows(component.related_morphemes, ownerKey);
      }).join('');

      const confusions = word.confusables.map((item) =>
        '<div class="comparison">' + inlineWord(item.word) + '<span class="note"><span style="display:block">' + escapeHtml(getConfusionDescription(item)) + '</span><span style="display:block">' + escapeHtml(getConfusionReasonLine(word, item)) + '</span></span></div>'
      ).join('');

      const examples = word.examples.map((example) =>
        '<blockquote><p>' + escapeHtml(example.en) + '</p><p class="zh">' + escapeHtml(example.zh) + '</p></blockquote>'
      ).join('');
      const phonetic = word.phonetic ? '<span class="meta phonetic">' + escapeHtml(word.phonetic) + '</span>' : '';
      const freezeClass = freezeTopPane ? ' active' : '';

      document.getElementById('detail').innerHTML =
        '<div class="freeze-pane' + freezeClass + '">' +
          wordFamilyTabs(word) +
          '<header><h1>' + escapeHtml(word.word) + '<span class="meta">' + escapeHtml(word.pos) + '</span>' + phonetic + '</h1><p class="definition">' + escapeHtml(word.en) + ' <span class="zh">/ ' + escapeHtml(word.zh) + '</span></p></header>' +
          detailSection('Word DNA / 构词拆解', '<div class="scroll"><table><colgroup><col class="dna-col-form"><col class="dna-col-meaning"><col class="dna-col-zh"><col class="dna-col-etymon"><col class="dna-col-etymon-meaning"></colgroup><thead><tr><th>Form</th><th>Meaning in this word</th><th>中文</th><th>Etymon / 源词根</th><th>Etymon Meaning / 源义</th></tr></thead><tbody>' + rows + '</tbody></table></div>') +
        '</div>' +
        detailSection('Root Families / 相关例词', rootFamilyLayout(word)) +
        detailSection('Word Family / 派生词', wordFamilyRows(word)) +
        detailSection('Common Confusions / 易混淆词', confusions) +
        detailSection('Examples', examples);
    }

    function renderMorpheme(morpheme) {
      const source = getMorphemeSource(morpheme);
      const meanings = morpheme.senses.map((sense, index) =>
        '<div class="sub-panel" style="margin-bottom:12px"><strong>' + (index + 1) + '. ' + escapeHtml(sense.meaning) + '</strong><span class="note"> ' + escapeHtml(sense.zh) + '</span><div style="margin-top:8px">' + wordGlossList(sense.examples) + '</div></div>'
      ).join('');

      document.getElementById('detail').innerHTML =
        '<header><h1>' + escapeHtml(morpheme.display) + '<span class="meta">' + escapeHtml(morpheme.type) + '</span></h1><p class="definition">' + escapeHtml(morpheme.core_meaning) + ' <span class="zh">/ ' + escapeHtml(morpheme.zh) + '</span></p></header>' +
        detailSection('Root DNA / 词根拆解', '<div class="scroll"><table><colgroup><col class="dna-col-form"><col class="dna-col-meaning"><col class="dna-col-zh"><col class="dna-col-etymon"><col class="dna-col-etymon-meaning"></colgroup><thead><tr><th>Form</th><th>Core Meaning</th><th>中文</th><th>Etymon / 源词根</th><th>Etymon Meaning / 源义</th></tr></thead><tbody>' + morphemeDnaRows(morpheme) + '</tbody></table></div>' + sourceNote(morpheme)) +
        detailSection('Meanings', '<div>' + meanings + '</div>') +
        detailSection('Common Patterns', commonPatternList(morpheme.patterns ?? [])) +
        detailSection('Connected Words', layeredConnectedWords(morpheme)) +
        detailSection('Similar-Looking Roots', morphemeGrid(morpheme.similar_form, true)) +
        detailSection('Meaning-Neighbor Roots', morphemeGrid(morpheme.similar_meaning, true)) +
        detailSection('Confusable Words', '<ul class="dense-list">' + (morpheme.confusable_words ?? []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>');
    }

    function render() {
      const route = getRoute();
      renderSearch(route);
      if (route.type === 'morpheme') renderMorpheme(morphemeById.get(route.id));
      else renderWord(wordById.get(route.id));
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-route]');
      if (!button) return;
      const [type, id] = button.dataset.route.split(':');
      setRoute(type, id);
    });

    searchInput.addEventListener('input', render);
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      render();
      searchInput.focus();
    });
    freezeToggle.addEventListener('click', () => {
      freezeTopPane = !freezeTopPane;
      saveFreezeSetting(freezeTopPane);
      updateFreezeToggle();
      render();
    });
    window.addEventListener('hashchange', render);
    if (!location.hash) location.hash = 'word/archaeology';
    updateFreezeToggle();
    render();
  </script>
</body>
</html>`;
}

function parseYaml(raw) {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/(^|\s+)#.*$/, ''))
    .filter((line) => line.trim())
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      text: line.trim(),
    }));

  return parseBlock(lines, 0, 0).value;
}

function parseBlock(lines, index, indent) {
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

function parseArray(lines, index, indent) {
  const value = [];
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
      const item = {};
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

function parseObject(lines, index, indent) {
  const value = {};
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

function assignPair(target, text, lines, nextIndex, childIndent) {
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

function parseScalar(value) {
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
