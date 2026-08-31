# VocabDNA

Double-click `VocabDNA.bat` on Windows to open the app.

The double-click launcher opens the local static page:

`VocabDNA.html`

The full development server is still available with:

`npm run dev`

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

