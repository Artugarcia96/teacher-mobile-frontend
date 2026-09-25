"""A private copy of one of the demo's exams for one E2E test (e2e/flows/examenes-helpers.ts › cloneExam).

The demo's exams hold what the real AI made when the demo was seeded («Examen U2 · Fracciones»: a scanned pile of 24
papers with the AI's suggestions; «Examen global · 1.ª evaluación»: a generated exam with Modelo B and four adapted
versions). A test that changes them (moves pages, accepts a draft, removes a version) works on a copy in the same class
instead: the activity, its papers, grades, trays and versions, with every file copied (deleting the copy through the
API deletes the copy's files, never the original's). Nothing here calls the AI.

Run from the backend checkout, with the same SEPIA_DATA_DIR / SEPIA_DATABASE_URL as the running API:
    python <this file> --activity <id> [--title T] [--no-papers] [--no-versions] [--unread] [--foreign] [--date YYYY-MM-DD]
Prints {"id", "title", "code"} as JSON.
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path.cwd()
sys.path.insert(0, str(BACKEND))


def data_paths() -> tuple[Path, Path]:
    data = Path(os.environ.get("SEPIA_DATA_DIR") or BACKEND / "data")
    url = os.environ.get("SEPIA_DATABASE_URL") or f"sqlite+aiosqlite:///{data / 'sepia.db'}"
    m = re.match(r"sqlite(?:\+\w+)?:///(.+)$", url)
    if not m:
        raise SystemExit(f"exam_clone only works with SQLite ({url})")
    return Path(m.group(1)), data / "files"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--activity", required=True)
    ap.add_argument("--title")
    ap.add_argument("--date")
    ap.add_argument("--no-papers", action="store_true", help="only the exam: no papers, grades nor scanned trays")
    ap.add_argument("--no-versions", action="store_true")
    ap.add_argument("--unread", action="store_true", help="the loose pages come back as pages the AI could not read")
    ap.add_argument("--foreign", action="store_true",
                    help="the loose pages that carry another exam's code are pages of that exam (as the AI reads them in most piles)")
    args = ap.parse_args()

    from app.services.papers import make_code  # the code printed on every page ("FRAC-7K2")

    db_path, files = data_paths()
    db = sqlite3.connect(db_path, timeout=30)
    db.row_factory = sqlite3.Row
    src = db.execute("SELECT * FROM activities WHERE id = ?", (args.activity,)).fetchone()
    if not src:
        raise SystemExit(f"No activity {args.activity} in {db_path}: point SEPIA_DATA_DIR/SEPIA_DATABASE_URL at the API's data")
    new_id = str(uuid.uuid4())
    tag = new_id[:8]
    copied: dict[str, str] = {}

    def copy_file(rel: str) -> str:
        """The copy's own file for a stored relative path (the same path with the new activity id, or a tagged name)."""
        if rel in copied:
            return copied[rel]
        new = rel.replace(src["id"], new_id)
        if new == rel:
            p = Path(rel)
            new = str(p.with_name(f"{tag}_{p.name}"))
        (files / new).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(files / rel, files / new)
        copied[rel] = new
        return new

    def remap(value):
        """Every stored file path inside a JSON value → the copy's own file."""
        if isinstance(value, str):
            return copy_file(value) if value and "/" in value and (files / value).is_file() else value
        if isinstance(value, list):
            return [remap(v) for v in value]
        if isinstance(value, dict):
            return {k: remap(v) for k, v in value.items()}
        return value

    def js(col: str, row=src):
        return json.loads(row[col]) if row[col] else None

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")
    title = args.title or f"{src['title']} · copia"
    row = dict(src)
    row.update(id=new_id, title=title, created_at=now, code=make_code(title, new_id),
               document_path=copy_file(src["document_path"]) if src["document_path"] else None)
    if args.date:
        row["date"] = args.date
    scan = js("scan")
    if args.no_papers:
        scan = None
    elif args.unread and scan:
        scan["unplaced"] = [dict(r, reason="sin_leer", kind="exam_page", n=None, name="") for r in scan.get("unplaced", [])]
    elif args.foreign and scan:
        scan["unplaced"] = [dict(r, reason="otro_examen", kind="exam_page", n=r.get("n") or 1) if r.get("code") else r
                            for r in scan.get("unplaced", [])]
    row["scan"] = json.dumps(remap(scan)) if scan is not None else None
    versions = None if args.no_versions else js("versions")
    row["versions"] = json.dumps(remap(versions)) if versions is not None else None
    cols = list(row)
    db.execute(f"INSERT INTO activities ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})", [row[c] for c in cols])

    if not args.no_papers:
        for p in db.execute("SELECT * FROM papers WHERE activity_id = ?", (src["id"],)).fetchall():
            r = dict(p)
            r.update(id=str(uuid.uuid4()), activity_id=new_id, pages=json.dumps(remap(js("pages", p))),
                     page_info=json.dumps(remap(js("page_info", p))) if p["page_info"] else None)
            cs = list(r)
            db.execute(f"INSERT INTO papers ({', '.join(cs)}) VALUES ({', '.join('?' for _ in cs)})", [r[c] for c in cs])
        for g in db.execute("SELECT * FROM grades WHERE activity_id = ?", (src["id"],)).fetchall():
            r = dict(g)
            r.update(id=str(uuid.uuid4()), activity_id=new_id)
            cs = list(r)
            db.execute(f"INSERT INTO grades ({', '.join(cs)}) VALUES ({', '.join('?' for _ in cs)})", [r[c] for c in cs])
    db.commit()
    print(json.dumps({"id": new_id, "title": title, "code": row["code"]}))


if __name__ == "__main__":
    main()
