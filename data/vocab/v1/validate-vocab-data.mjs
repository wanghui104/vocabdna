import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const wordsPath = path.join(baseDir, "words.seed-50.json");
const rootsPath = path.join(baseDir, "roots.seed.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function pushIf(condition, issues, message) {
  if (condition) issues.push(message);
}

const wordsDoc = readJson(wordsPath);
const rootsDoc = readJson(rootsPath);

requireArray(wordsDoc.words, "words");
requireArray(rootsDoc.roots, "roots");

const issues = [];
const warnings = [];
const rootIds = new Set();
const wordSlugs = new Set();
const duplicateWordCheck = new Set();

for (const root of rootsDoc.roots) {
  pushIf(!root.id, issues, "root entry is missing id");
  pushIf(!root.slug, issues, `${root.id || "unknown root"} is missing slug`);
  pushIf(rootIds.has(root.id), issues, `duplicate root id: ${root.id}`);
  rootIds.add(root.id);
}

for (const word of wordsDoc.words) {
  if (word.slug) wordSlugs.add(word.slug);
}

for (const word of wordsDoc.words) {
  pushIf(!word.id, issues, "word entry is missing id");
  pushIf(!word.slug, issues, `${word.id || "unknown word"} is missing slug`);
  pushIf(!word.term, issues, `${word.slug || word.id} is missing term`);
  pushIf(duplicateWordCheck.has(word.slug), issues, `duplicate word slug: ${word.slug}`);
  duplicateWordCheck.add(word.slug);

  requireArray(word.rootIds, `${word.slug}.rootIds`);
  requireArray(word.morphemes, `${word.slug}.morphemes`);

  for (const rootId of word.rootIds) {
    pushIf(!rootIds.has(rootId), issues, `${word.slug} references missing rootId ${rootId}`);
  }

  for (const morpheme of word.morphemes) {
    pushIf(!morpheme.form, issues, `${word.slug} has a morpheme without form`);
    pushIf(!morpheme.rootId, issues, `${word.slug}.${morpheme.form || "morpheme"} is missing rootId`);
    pushIf(
      morpheme.rootId && !rootIds.has(morpheme.rootId),
      issues,
      `${word.slug}.${morpheme.form || "morpheme"} references missing rootId ${morpheme.rootId}`,
    );
  }

  for (const [relationType, slugs] of Object.entries(word.relations || {})) {
    requireArray(slugs, `${word.slug}.relations.${relationType}`);
    for (const slug of slugs) {
      if (!wordSlugs.has(slug)) {
        warnings.push(`${word.slug}.relations.${relationType} points outside current pilot: ${slug}`);
      }
    }
  }
}

const result = {
  words: wordsDoc.words.length,
  roots: rootsDoc.roots.length,
  issues,
  warnings,
};

console.log(JSON.stringify(result, null, 2));

if (issues.length > 0) {
  process.exitCode = 1;
}

