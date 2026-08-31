# Deleting Words from VocabDNA

This guide is the project-level source of truth for removing vocabulary entries.
The Codex skill that uses this guide is stored locally at:

`C:\Users\wangh\.codex\skills\vocabdna-delete-word\`

The canonical data lives in this directory. Generated YAML files and static
HTML should be regenerated after source-data deletion.

## Canonical Files

- `words.seed-50.json`: canonical word entries for the current pilot.
- `roots.seed.json`: canonical roots, prefixes, suffixes, and combining forms.
- `schema/*.schema.json`: validation schemas for the source data.
- `validate-vocab-data.mjs`: source-data validator.

Generated files include:

- `data/words/*.yaml`
- `data/morphemes/*.yaml`
- `VocabDNA.html`

## Delete-One-Word Workflow

For multi-word requests, process one word at a time.

1. Confirm the exact word slug in `words.seed-50.json`.
2. Search canonical source data for references to the slug.
3. Remove the word entry from `words.seed-50.json`.
4. Remove the slug from every remaining word's `relations.derivatives`,
   `relations.sameFamily`, and `relations.confusables` arrays.
5. Repair derivative families so top tabs still represent only same-headword
   derivatives.
6. Check whether any roots, prefixes, suffixes, or combining forms became
   unreferenced; keep them unless root cleanup is explicitly in scope.
7. Remove stale generated `data/words/<slug>.yaml` only if it starts with the
   generated-data header.
8. Run validation and generation.
9. Inspect affected generated YAML/static data before reporting completion.

## Relationship Cleanup Rules

Deletion must preserve the same relationship boundaries used when adding words:

- `relations.derivatives`: same-headword derivative forms shown as top tabs.
- `relations.sameFamily`: same-root or construction neighbors shown in root
  family/browse surfaces.
- `relations.confusables`: learner-facing confusion links.

If deleting a derivative, remove it from the headword and sibling derivative
lists. If deleting a headword while keeping derivative words, choose a new family
shape deliberately; do not automatically merge them into unrelated same-root
families.

Example:

- Removing `reduction` should remove it from `reduce.relations.derivatives`.
- Removing `reduce` should also remove `reduce` from `reduction` and from
  same-root neighbors such as `induct`, `deduct`, `conduct`, and `produce`.
- Removing `reduce` should not cause `induct` and `deduct` to become derivative
  tabs of each other.

## Generated File Cleanup

The current generator rewrites files for source entries that still exist, but it
may not delete stale generated word YAML for removed source entries.

Before removing a generated word YAML file, confirm it begins with:

`# Generated from data/vocab/v1.`

Do not remove hand-authored YAML unless the user explicitly requests that exact
file deletion.

Root/morpheme YAML usually stays and is regenerated from remaining roots. Remove
morpheme YAML only when the corresponding root entry is intentionally removed
from `roots.seed.json` and the file has the generated header.

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

Before finishing a delete-word task, confirm:

- The deleted slug no longer exists in `words.seed-50.json`.
- No remaining canonical relationship arrays point to the deleted slug.
- Generated `data/words/<slug>.yaml` does not leave the word visible in the app.
- Root-family generated files no longer list the deleted word.
- Top tabs for affected derivative families still make sense.
- Validation and static generation have passed.
