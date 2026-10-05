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
JSON backup. **导入记录** safely merges that backup without counting the same answer twice.

The local HTML remains device-local. The hosted web app synchronizes learning history
to D1 under the signed-in ChatGPT user. Open the same hosted URL on desktop and iPhone
with the same account. The current unfinished round stays separate on each device;
accuracy, mastery and answer history merge across devices. Open **背单词** to sync,
or press **同步记录**. Offline answers queue locally and retry when connected.
Do not clear browser data before pending answers have synced.
The static HTML bundles the question bank and a small local supplemental word list:
the file-based quiz makes no network requests. The hosted version supports installation
and offline dictionary/quiz use after its first successful online cache installation.
On iPhone: open the hosted URL in Safari, sign in, then Share → Add to Home Screen.
Wait for **已可离线使用** before going offline. API responses and sign-in pages are not cached.
Browser/OS cache eviction can require another online visit.

To move old desktop learning history: open the old local HTML → **背单词** →
**导出记录**, then open the hosted version on that computer → **背单词** →
**导入记录**. Once synced, those answers appear on iPhone too.

`npm run build` builds the Worker and generates a versioned service worker from all
client chunks. Cloud database schema is in `db/schema.ts`; generated migrations are
in `drizzle/`. Use `npm run db:generate` for future schema changes. On Windows,
previous build output is preserved in `.tmp/build-archives` to avoid Dropbox locks.

Multi-POS definitions without reliable sense-level POS labels are excluded from
the quiz, but remain available in the dictionary. Distractors exclude overlapping
Chinese expressions and curated synonym groups; this conservative filter cannot
prove semantic uniqueness for every dictionary gloss, so question quality still
needs review. Missing source categories fall back to other valid local candidates.

After updating vocabulary or quiz code, run `npm run build:static` to rebuild both
HTML copies and `lib/study-catalog.json` (generated; do not edit manually).
Run `node --test scripts/study.test.mjs` for quiz and persistence checks.
Run `node --test scripts/study-sync.test.mjs` for cross-device merge and retry checks.
With a built app running on `127.0.0.1:8787` and local D1 migrations applied,
run `node scripts/check-pwa-ui.mjs` for hosted mobile/offline/sync browser checks.
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

