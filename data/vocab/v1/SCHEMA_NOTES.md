# Schema Notes

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

