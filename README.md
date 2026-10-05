# VocabDNA

Double-click `VocabDNA.bat` on Windows to open the app.

The double-click launcher opens the local static page:

`VocabDNA.html`

The full development server is still available with:

`npm run dev`

Click **背单词** to start a random round (default: 20 words, English → Chinese).
The count and direction can be changed before starting. Chinese → English
options all match the displayed part of speech. Independent, explicitly stored
senses can produce a five-option, two-answer English → Chinese question.
Gloss punctuation alone is not used to infer independent senses.

Each submission immediately saves its result, UTC timestamp, tested senses,
direction and selected answers in browser local storage. **不确定** receives a
mastery score of 0.2; correct/wrong receive 1/0. The learning records screen shows
both mastery score and actual accuracy. Returning to the same browser and URL/file
resumes the round; unsubmitted questions are not counted. **导出记录** downloads a
JSON backup (restore/import and cross-device sync are not implemented).

Records belong to that browser profile and origin/file location. Clearing browser
data or moving to another browser/device does not transfer them. No account is used.
The static HTML bundles the question bank and a small local supplemental word list:
the quiz makes no network requests. iPhone installation/PWA caching is a separate task.

Multi-POS definitions without reliable sense-level POS labels are excluded from
the quiz, but remain available in the dictionary. Distractors exclude overlapping
Chinese expressions and curated synonym groups; this conservative filter cannot
prove semantic uniqueness for every dictionary gloss, so question quality still
needs review. Missing source categories fall back to other valid local candidates.

After updating vocabulary or quiz code, run `npm run build:static` to rebuild both
HTML copies and `lib/study-catalog.json` (generated; do not edit manually).
Run `node --test scripts/study.test.mjs` for quiz and persistence checks.
On Windows with Chrome installed, run `node scripts/check-study-ui.mjs` for an
isolated headless browser check (including offline mode and mobile layout).

Vocabulary source data lives in:

- `data/vocab/v1/words.seed-50.json`
- `data/vocab/v1/roots.seed.json`

Generated app data lives in:

- `data/words/*.yaml`
- `data/morphemes/*.yaml`

Regenerate generated vocabulary files with:

`npm run generate:vocab`

Project-level vocabulary operation guides are:

- `data/vocab/v1/ADDING_WORDS.md`
- `data/vocab/v1/DELETING_WORDS.md`

Local Codex skills for vocabulary operations are stored at:

- `C:\Users\wangh\.codex\skills\vocabdna-add-word\`
- `C:\Users\wangh\.codex\skills\vocabdna-delete-word\`

Equivalent Codex skill paths:

- `~/.codex/skills/vocabdna-add-word/`
- `~/.codex/skills/vocabdna-delete-word/`

