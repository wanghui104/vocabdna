import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "data", "vocab", "v1");
const wordsSourcePath = path.join(sourceDir, "words.seed-50.json");
const rootsSourcePath = path.join(sourceDir, "roots.seed.json");
const wordsOutputDir = path.join(projectRoot, "data", "words");
const morphemesOutputDir = path.join(projectRoot, "data", "morphemes");
const generatedHeader = "# Generated from data/vocab/v1. Edit the JSON source, then rerun scripts/generate-vocab-data.mjs.";

const args = new Set(process.argv.slice(2));
const shouldWrite = !args.has("--dry-run");
const overwriteExisting = args.has("--overwrite-existing");

const [wordsDoc, rootsDoc] = await Promise.all([
  readJson(wordsSourcePath),
  readJson(rootsSourcePath),
]);

validateSource(wordsDoc, rootsDoc);

await Promise.all([
  mkdir(wordsOutputDir, { recursive: true }),
  mkdir(morphemesOutputDir, { recursive: true }),
]);

const [existingWordFiles, existingMorphemeFiles] = await Promise.all([
  listYamlBasenames(wordsOutputDir),
  listYamlBasenames(morphemesOutputDir),
]);

const wordsBySlug = new Map(wordsDoc.words.map((word) => [word.slug, word]));
const rootsById = new Map(rootsDoc.roots.map((root) => [root.id, root]));
const wordsByRootId = buildWordsByRootId(wordsDoc.words);

const generated = {
  words: [],
  morphemes: [],
  skippedWords: [],
  skippedMorphemes: [],
};

for (const word of wordsDoc.words) {
  const yaml = buildWordYaml(word, wordsBySlug, rootsById);
  const filePath = path.join(wordsOutputDir, `${word.slug}.yaml`);
  const exists = existingWordFiles.has(word.slug);

  if (exists && !(await canWriteExistingFile(filePath))) {
    generated.skippedWords.push(word.slug);
    continue;
  }

  if (shouldWrite) {
    await writeFile(filePath, yaml, "utf8");
  }
  generated.words.push(word.slug);
}

for (const root of rootsDoc.roots) {
  const id = stripRootPrefix(root.id);
  const yaml = buildMorphemeYaml(root, wordsByRootId.get(root.id) ?? []);
  const fileBase = safeYamlBasename(id);
  const filePath = path.join(morphemesOutputDir, `${fileBase}.yaml`);
  const exists = existingMorphemeFiles.has(id);

  if (exists && !(await canWriteExistingFile(filePath))) {
    generated.skippedMorphemes.push(id);
    continue;
  }

  if (shouldWrite) {
    await writeFile(filePath, yaml, "utf8");
  }
  generated.morphemes.push(id);
}

console.log(
  JSON.stringify(
    {
      mode: shouldWrite ? "write" : "dry-run",
      sourceWords: wordsDoc.words.length,
      sourceRoots: rootsDoc.roots.length,
      generatedWordFiles: generated.words.length,
      generatedMorphemeFiles: generated.morphemes.length,
      skippedExistingWordFiles: generated.skippedWords,
      skippedExistingMorphemeFiles: generated.skippedMorphemes,
    },
    null,
    2,
  ),
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function listYamlBasenames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => entry.name.replace(/\.yaml$/, "")),
  );
}

async function canWriteExistingFile(filePath) {
  if (overwriteExisting) {
    return true;
  }

  const current = await readFile(filePath, "utf8");
  return current.startsWith(generatedHeader);
}

function validateSource(wordsDoc, rootsDoc) {
  if (!Array.isArray(wordsDoc.words)) {
    throw new Error("Expected data/vocab/v1/words.seed-50.json to contain words[]");
  }
  if (!Array.isArray(rootsDoc.roots)) {
    throw new Error("Expected data/vocab/v1/roots.seed.json to contain roots[]");
  }

  const rootIds = new Set(rootsDoc.roots.map((root) => root.id));
  const issues = [];

  for (const word of wordsDoc.words) {
    for (const rootId of word.rootIds ?? []) {
      if (!rootIds.has(rootId)) {
        issues.push(`${word.slug} references missing ${rootId}`);
      }
    }
    for (const morpheme of word.morphemes ?? []) {
      if (!rootIds.has(morpheme.rootId)) {
        issues.push(`${word.slug}.${morpheme.form} references missing ${morpheme.rootId}`);
      }
    }
  }

  if (issues.length) {
    throw new Error(`Cannot generate YAML:\n${issues.join("\n")}`);
  }
}

function buildWordsByRootId(words) {
  const map = new Map();
  for (const word of words) {
    for (const rootId of word.rootIds ?? []) {
      const bucket = map.get(rootId) ?? [];
      bucket.push(word);
      map.set(rootId, bucket);
    }
  }
  return map;
}

function buildWordYaml(word, wordsBySlug, rootsById) {
  const definition = word.definitions[0];
  const familySlugs = unique([
    ...(word.relations.derivatives ?? []),
    ...(word.relations.sameFamily ?? []).filter((slug) => slug !== word.slug),
  ]);
  const examples = word.definitions
    .map((item) => item.example)
    .filter(Boolean);

  return `${generatedHeader}
id: ${plain(word.slug)}
word: ${plain(word.term)}
pos: ${plain(formatPartOfSpeech(word.partOfSpeech))}
zh: ${plain(definition.zh)}
en: ${plain(definition.en)}
components:
${word.morphemes.map((morpheme) => formatWordComponent(morpheme, rootsById)).join("\n")}
word_family:
${formatStringArray(familySlugs)}
word_family_details:
${formatWordFamilyDetails(familySlugs, wordsBySlug)}
confusables:
${formatConfusables(word)}
examples:
${formatExamples(examples)}
why_confusing: ${plain(word.learning.watchOut)}
`;
}

function formatWordComponent(morpheme, rootsById) {
  const morphemeId = stripRootPrefix(morpheme.rootId);
  const root = rootsById.get(morpheme.rootId);
  return `  - morpheme: ${plain(morphemeId)}
    form: ${plain(formatMorphemeForm(morpheme))}
    meaning_in_word: ${plain(morpheme.meaning)}
    zh: ${plain(root?.meaning?.zh ?? morpheme.meaning)}
    role: ${plain(formatRole(morpheme.type))}
    is_core: ${morpheme.type === "root" || morpheme.type === "combiningForm"}`;
}

function formatMorphemeForm(morpheme) {
  if (morpheme.type === "prefix" || morpheme.type === "combiningForm") {
    return morpheme.form.endsWith("-") ? morpheme.form : `${morpheme.form}-`;
  }
  if (morpheme.type === "suffix") {
    return morpheme.form.startsWith("-") ? morpheme.form : `-${morpheme.form}`;
  }
  return morpheme.form;
}

function formatRole(type) {
  if (type === "combiningForm") {
    return "combining_form";
  }
  return type;
}

function formatPartOfSpeech(parts) {
  return parts.join("/");
}

function formatWordFamilyDetails(familySlugs, wordsBySlug) {
  if (!familySlugs.length) {
    return "  []";
  }

  return familySlugs
    .map((slug) => {
      const linked = wordsBySlug.get(slug);
      return `  - word: ${plain(slug)}
    en: ${plain(linked?.definitions?.[0]?.en ?? `related form of ${slug}`)}
    zh: ${plain(linked?.definitions?.[0]?.zh ?? `${slug} 的相关词`)}`;
    })
    .join("\n");
}

function formatConfusables(word) {
  const confusables = word.relations.confusables ?? [];
  if (!confusables.length) {
    return "  []";
  }

  return confusables
    .map(
      (slug) => `  - word: ${plain(slug)}
    reason: ${plain(word.learning.watchOut)}
    zh_reason: ${plain(word.learning.watchOut)}`,
    )
    .join("\n");
}

function formatExamples(examples) {
  if (!examples.length) {
    return "  []";
  }

  return examples
    .map(
      (example) => `  - en: ${plain(example.en)}
    zh: ${plain(example.zh)}`,
    )
    .join("\n");
}

function buildMorphemeYaml(root, linkedWords) {
  const id = stripRootPrefix(root.id);
  const display = formatRootDisplay(root);
  const linkedWordLabels = linkedWords.map((word) => word.term);
  const patterns = linkedWords.map((word) => formatPattern(root, word));

  return `${generatedHeader}
id: ${plain(id)}
display: ${plain(display)}
type: ${plain(formatRootType(root.type))}
core_meaning: ${plain(root.meaning.en)}
zh: ${plain(root.meaning.zh)}
origin: ${plain(root.origin)}
senses:
  - meaning: ${plain(root.meaning.en)}
    zh: ${plain(root.meaning.zh)}
    examples:
${formatStringArray(linkedWordLabels, 6)}
similar_form:
  []
similar_meaning:
  []
patterns:
${formatStringArray(patterns)}
high_value_words:
${formatStringArray(linkedWordLabels)}
confusable_words:
  []
`;
}

function formatRootDisplay(root) {
  const form = root.forms[0] ?? root.slug;
  if (root.type === "prefix" || root.type === "combiningForm") {
    return form.endsWith("-") ? form : `${form}-`;
  }
  if (root.type === "suffix") {
    return form.startsWith("-") ? form : `-${form}`;
  }
  return form;
}

function formatRootType(type) {
  if (type === "combiningForm") {
    return "combining form";
  }
  return type;
}

function formatPattern(root, word) {
  const forms = word.morphemes
    .filter((morpheme) => morpheme.rootId === root.id)
    .map((morpheme) => formatMorphemeForm(morpheme))
    .join(" / ");
  return `${forms || root.forms[0]} -> ${word.term}`;
}

function stripRootPrefix(id) {
  return id.replace(/^root:/, "");
}

function safeYamlBasename(id) {
  const reservedWindowsNames = new Set([
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
  ]);
  return reservedWindowsNames.has(id.toLowerCase()) ? `${id}-root` : id;
}

function formatStringArray(values, indent = 2) {
  const uniqueValues = unique(values).filter(Boolean);
  if (!uniqueValues.length) {
    return `${" ".repeat(indent)}[]`;
  }
  const prefix = " ".repeat(indent);
  return uniqueValues.map((value) => `${prefix}- ${plain(value)}`).join("\n");
}

function unique(values) {
  return Array.from(new Set(values));
}

function plain(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+#/g, " -")
    .trim();
}
