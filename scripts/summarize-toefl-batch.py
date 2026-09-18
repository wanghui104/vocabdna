#!/usr/bin/env python
"""Summarize the latest TOEFL 5400 ingest batch for handoff reports."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_PROGRESS = Path("data/vocab/v1/toefl-5400-ingest-progress.json")
WORDS_SOURCE = Path("data/vocab/v1/words.seed-50.json")
ROOTS_SOURCE = Path("data/vocab/v1/roots.seed.json")


def main() -> int:
    args = parse_args()
    root = Path(args.project_root).resolve()
    progress_path = resolve_project_path(root, Path(args.progress))
    progress = read_json(progress_path)
    words = read_json(root / WORDS_SOURCE).get("words", [])
    roots = read_json(root / ROOTS_SOURCE).get("roots", [])

    check = run_json(root, [sys.executable, "scripts/check-toefl-batch.py", "--json"])
    audit = run_json(root, [sys.executable, "scripts/audit-current-toefl-batch.py", "--json"])
    diff_stat = run_text(root, ["git", "diff", "--stat", "--", "data/vocab/v1/words.seed-50.json", "data/vocab/v1/roots.seed.json", "data/vocab/v1/toefl-5400-ingest-progress.json", "data/words", "data/morphemes", "VocabDNA.html", "package.json", "scripts"])
    git_status = run_text(root, ["git", "status", "--short", "--", "data/vocab/v1", "data/words", "data/morphemes", "VocabDNA.html", "package.json", "scripts"])

    result = {
        "progress": progress,
        "wordCount": len(words),
        "rootCount": len(roots),
        "check": check,
        "audit": audit,
        "diffStat": diff_stat,
        "gitStatus": git_status,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_human(result)
    return 1 if (check.get("issues") or audit.get("issues")) else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--progress", default=str(DEFAULT_PROGRESS))
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_project_path(root: Path, path: Path) -> Path:
    return path if path.is_absolute() else root / path


def run_json(root: Path, command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, cwd=root, text=True, encoding="utf-8", capture_output=True)
    payload = extract_json(completed.stdout)
    if completed.returncode != 0 and not payload:
        return {"issues": [completed.stderr.strip() or completed.stdout.strip() or f"Command failed: {' '.join(command)}"], "warnings": []}
    return payload


def run_text(root: Path, command: list[str]) -> str:
    completed = subprocess.run(command, cwd=root, text=True, encoding="utf-8", errors="replace", capture_output=True)
    return (completed.stdout or completed.stderr).strip()


def extract_json(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    return json.loads(text[start : end + 1])


def print_human(result: dict[str, Any]) -> None:
    progress = result["progress"]
    last = progress.get("lastBatch", {})
    check = result.get("check", {})
    audit = result.get("audit", {})
    print("TOEFL 5400 ingest summary")
    print(f"Batch: {last.get('sheet')} rows {last.get('startRow')}-{last.get('endRow')} ({last.get('excelRowsCovered')} source rows, {last.get('logicalWordsProcessed')} logical words)")
    print(f"Words: {last.get('firstWord')} -> {last.get('lastWord')}")
    print(f"Canonical totals: {result['wordCount']} words, {result['rootCount']} roots")
    print(f"Next start: {progress.get('nextStartSheet')} row {progress.get('nextStartRow')} / No. {progress.get('nextStartNo')}")
    print(f"Check: {len(check.get('issues', []))} issues, {len(check.get('warnings', []))} warnings")
    print(f"Audit: {len(audit.get('issues', []))} issues, {len(audit.get('warnings', []))} warnings, {len(audit.get('notes', []))} notes")
    checked = check.get("checkedSlugs") or []
    if checked:
        print("Checked slugs: " + ", ".join(checked))
    if result.get("diffStat"):
        print("\nGit diff stat:")
        print(result["diffStat"])
    if result.get("gitStatus"):
        print("\nGit status:")
        print(result["gitStatus"])
    print(f"\nTOEFL 5400 progress: {progress.get('completedThroughSheet')} completed through Excel row {progress.get('completedThroughRow')}; next start: {progress.get('nextStartSheet')} row {progress.get('nextStartRow')}")


if __name__ == "__main__":
    raise SystemExit(main())

