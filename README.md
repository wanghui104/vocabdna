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

**查看例句** reveals an English sentence for the tested sense when one is available.
The target word and recognized inflections are replaced with `_____`; Chinese
translations are not shown. Missing or unmaskable examples are explicitly marked
unavailable. Hints use bundled vocabulary data and work offline, including in older
saved rounds. Opening a hint saves its UTC timestamp in the current round; the
submitted answer includes `exampleViewed` and `exampleViewedAt` without changing
the existing correct/wrong/uncertain scoring. Old answer records remain compatible.

On phones, starting or resuming an unanswered round and moving to the next question
automatically positions the quiz in view. Short questions show the complete quiz;
long questions keep the prompt in view and dock Submit/Unsure at the screen bottom.
Reserved space keeps the final option clear of the docked buttons. Selecting options
and opening example hints preserve the scroll position; resizing recalculates layout.

Desktop and phone layouts put learning records, import/export, dictionary return,
and synchronization in a separate management card above the quiz. Starting a round
or entering a new question focuses the quiz card below the header, leaving management
above the viewport; scroll toward the top to access it. The quiz card fills the
available screen height so short questions can show their submit buttons immediately.

The quiz defaults to Quick mode: one choice submits immediately, and five-option
questions submit when two distinct choices are selected. Clicking the first choice
again cancels it. Confirmation mode retains Submit. The switch above the question
remembers the device preference and clears pending choices when the mode changes.
Correct answers retain the old question for 750ms, fading other content while the
prompt and selected answers glow gold. Long questions show a compact recap when
these areas are outside the viewport. Input is locked during this review; then the
next question appears while the 1.5-second floating reward continues. Reduced-motion
preferences use static gold highlighting. Wrong and unsure answers pause for feedback. Each new correct answer
stores EXP +1 and copper +1 on its answer event, so import and sync cannot pay twice.
Reward totals appear in the management card; older records do not receive rewards.

Sync status reserves a fixed height so delayed status changes cannot push the quiz
down. Question layout and positioning finish before paint; viewport-height changes
retain the scrollable minimum height rather than shifting the question.

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


### 单词标记与动态抽词

测验和错题反馈中可点击星形标记“重要”、圆圈勾标记“已熟练”（用户自评），再次点击取消。两项独立，默认不标记；与答题正确率分别记录，支持离线保存、记录导入导出和电脑手机同步。重要标记暂不影响抽词。

已熟练词的抽词权重为 `max(0.1, 0.6^x)`；未标记词权重为 1。按时间顺序重放去重的答题记录，正确 +1、错误 −3、不确定 −2，每次处理后 x 不小于 0；相隔 d 天时 x 乘以 `0.8^(d/365)`，最后衰减到当前时间。标记本身不增加 x，零历史不会立即降频。本轮按权重随机抽取且不重复；标记修改影响下一轮抽词，不替换已生成题目。
