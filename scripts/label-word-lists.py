"""Reconcile every canonical word with the complete local TOEFL source."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_appendix/NewOriental_TOEFL_5400.xlsx"
WORDS = ROOT / "data/vocab/v1/words.seed-50.json"


def slugify(term):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", term.lower())).strip("-")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
    matches = {}
    for sheet in workbook:
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows)
        if "Word" not in headers:
            continue
        indices = {name: headers.index(name) for name in ("Word", "No.", "Source_Page")}
        for row_number, row in enumerate(rows, 2):
            term = row[indices["Word"]]
            if not term or not str(term).strip():
                continue
            term = str(term).strip()
            matches.setdefault(slugify(term), []).append({
                "sheet": sheet.title,
                "row": row_number,
                "number": row[indices["No."]],
                "term": term,
                "sourcePage": str(row[indices["Source_Page"]] or ""),
            })
    workbook.close()
    doc = json.loads(WORDS.read_text(encoding="utf-8"))
    yes = 0
    for word in doc["words"]:
        evidence = matches.get(slugify(word["term"]), [])
        yes += bool(evidence)
        memberships = word.setdefault("wordLists", {})
        memberships["toefl-5400"] = {"status": "Y" if evidence else "N", "matches": evidence}
        memberships.setdefault("gre", {"status": "unchecked", "matches": []})
    catalog = {"lists": {
        "toefl-5400": {
            "name": "新东方 TOEFL 5400",
            "exam": "TOEFL",
            "status": "checked",
            "source": SOURCE.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "matching": "lowercase; non-ASCII-alphanumeric runs become hyphens; exact normalized term match; no family inheritance",
        },
        "gre": {"name": "GRE（词表待导入）", "exam": "GRE", "status": "unchecked"},
    }}
    canonical_slugs = {word["slug"] for word in doc["words"]}
    generated_only = {}
    for file in (ROOT / "data/words").glob("*.yaml"):
        if file.stem in canonical_slugs:
            continue
        content = file.read_text(encoding="utf-8")
        term = re.search(r"^word:\s*(.+)$", content, re.M).group(1).strip().strip("\"'")
        evidence = matches.get(slugify(term), [])
        generated_only[file.stem] = {
            "toefl-5400": {"status": "Y" if evidence else "N", "matches": evidence},
            "gre": {"status": "unchecked", "matches": []},
        }
    if args.write:
        WORDS.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (WORDS.parent / "word-lists.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (WORDS.parent / "word-list-supplement.json").write_text(json.dumps(generated_only, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"write": args.write, "total": len(doc["words"]), "toeflY": yes,
                      "toeflN": len(doc["words"]) - yes, "sourceUnique": len(matches),
                      "generatedOnly": len(generated_only),
                      "generatedOnlyY": sum(m["toefl-5400"]["status"] == "Y" for m in generated_only.values())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
