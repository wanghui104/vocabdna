# Adding Words to VocabDNA

This guide is the project-level source of truth for adding vocabulary entries.
The Codex skill that uses this guide is stored locally at:

`C:\Users\wangh\.codex\skills\vocabdna-add-word\`

The canonical data lives in this directory. Generated YAML files and static
HTML should be produced by scripts, not edited by hand.

## Canonical Files

- `words.seed-50.json`: canonical word entries for the current pilot.
- `roots.seed.json`: canonical roots, prefixes, suffixes, and combining forms.
- `schema/*.schema.json`: validation schemas for the source data.
- `validate-vocab-data.mjs`: source-data validator.

Generated files include:

- `data/words/*.yaml`
- `data/morphemes/*.yaml`
- `VocabDNA.html`

## Add-One-Word Workflow

For multi-word requests, process one word at a time.

1. Check whether the slug already exists in `words.seed-50.json`.
2. Decide whether the word is a new headword or a derivative of an existing
   headword.
3. Add or update the canonical word entry in `words.seed-50.json`.
4. Reuse existing `rootIds` whenever possible.
5. Add missing root, prefix, suffix, or combining-form entries to
   `roots.seed.json` only when they are reusable.
6. Fill morphemes with explicit forms, meanings, types, and `rootId` links.
7. Fill relationships according to the relationship rules below.
8. Run validation and generation.
9. Inspect affected generated YAML/static data before reporting completion.

## Relationship Rules

Keep these relationship fields separate. This prevents unrelated same-root words
from being merged into one word page.

- `relations.derivatives`: same-headword derivative forms. These become the top
  word-family tabs.
- `relations.sameFamily`: words that share a root or construction pattern. These
  belong in root-family and browse surfaces, not top tabs.
- `relations.confusables`: words learners may confuse by spelling, root shape,
  pronunciation, meaning, or usage.

Do not put a word in `derivatives` only because it shares a root.

Example:

- `induct`, `induction`, and `inductive` are one derivative family.
- `reduce` and `reduction` are one derivative family.
- `deduct`, `deduction`, and `deductible` are one derivative family.
- `induct`, `reduce`, `deduct`, `conduct`, and `produce` are same-root
  neighbors through `duc/duct`, but they are not one top-tab family.

## Validation Commands

Run these after changing source data:

```bash
npm run validate:vocab
npm run generate:vocab
npm run build:static
npx tsc --noEmit
```

Run `npm run build` when the local environment can clean `dist`. If Windows
blocks `dist` cleanup because the directory is locked or a reparse point, report
that separately from vocabulary-data validation.

## Review Checklist

Before finishing an add-word task, confirm:

- The new word has a stable slug and clear definition.
- Every `rootId` exists in `roots.seed.json`.
- Top tabs contain only true derivatives of the same headword.
- Same-root neighbors appear through root-family data, not derivative tabs.
- Confusable words explain the learner-facing difference.
- Generated files were refreshed from source data.
