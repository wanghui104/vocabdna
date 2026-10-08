# Schema Notes

## Word-list membership

`wordLists` records independent membership by list id. `Y` means the exact
normalized term occurs in that list; `N` means a complete list was checked and
the term was absent; `unchecked` means the list has not been imported/checked.
Never inherit membership from a base word or derivative. Only Y entries should
produce learner badges. N does not mean a word cannot appear on that exam.

`word-lists.json` identifies each list, its source and source SHA-256. Y entries
retain all matching headword rows (`sheet`, `row`, `number`, `term`, `sourcePage`).
Continuation rows for extra senses are not separate membership evidence.

Run `python scripts/label-word-lists.py --write` after adding words to reconcile
the complete TOEFL workbook. Without `--write`, it reports counts without edits.
GRE remains unchecked until a specific GRE source list is supplied.

`word-list-supplement.json` records membership for legacy hand-maintained YAML
words absent from canonical JSON. The generator syncs their labels without
replacing their lexical content. A future migration into canonical data should
carry these memberships over.

The canonical shape for this pilot is:

- `words.seed-50.json` is a collection file and should validate against
  `schema/words-file.schema.json`.
- `roots.seed.json` is a collection file and should validate against
  `schema/roots-file.schema.json`.
- Each item inside `words` should validate against `schema/word.schema.json`.
- Each item inside `roots` should validate against `schema/root.schema.json`.

The current pilot data is intentionally marked `draft`. During the next data
cleanup pass, split temporary morpheme placeholders into independent root or
suffix entries when they become reusable across words.
