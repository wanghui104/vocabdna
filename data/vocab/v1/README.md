# VocabDNA Data Layer v1

This directory is the first structured data layer for the 50-word pilot.

The data layer is intentionally separate from page generation. A future generator
should read these files and produce word pages, root pages, reverse links, search
indexes, and navigation indexes from the same source of truth.

## Files

- `schema/word.schema.json`: JSON Schema for word entries.
- `schema/root.schema.json`: JSON Schema for root entries.
- `words.seed-50.json`: the first 50 pilot words.
- `roots.seed.json`: root and affix entries referenced by the pilot words.

## Design Principles

- `words` grows continuously as new words are added.
- `roots` grows only when a new root, prefix, suffix, or combining form is needed.
- Links are stored as stable ids or slugs, not display text.
- Reverse links should be generated, not manually duplicated. For example,
  `root -> words` can be derived from every word's `rootIds`.
- Each entry has a `status` field so rough draft data and reviewed data can
  coexist during the pilot.

## Add-One-Word Workflow, Data Layer Only

1. Check whether the word slug already exists in `words.seed-50.json` or the
   eventual production word file.
2. Add a new word entry matching `schema/word.schema.json`.
3. Reuse existing `rootIds` whenever possible.
4. Add missing root entries to `roots.seed.json`, matching `schema/root.schema.json`.
5. Fill relation fields with slugs only when the related word exists or is planned.
6. Keep `status` as `draft` until the entry has been reviewed for content quality.

## Notes for Future Generator

The generator should treat the word file as the canonical source and derive:

- word detail pages
- root detail pages
- root-to-word reverse links
- word-family panels
- confusable-word panels
- search and browse indexes

