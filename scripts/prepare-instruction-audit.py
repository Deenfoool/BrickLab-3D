#!/usr/bin/env python3
"""Inventory existing maps or prepare a PRIVATE, unapproved review draft from real PDFs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.request import build_opener, HTTPRedirectHandler, Request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog" / "sets"

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def inventory():
    index = read(CATALOG / "instruction-part-index.json")
    sequences = read(CATALOG / "instruction-sequences.json")
    result = {}
    for key, filename in index.items():
        set_id, pdf_id = key.split("/")
        if not re.fullmatch(r"\d+(?:-\d+)?-parts-by-page\.json", filename):
            raise ValueError("Invalid map name")
        regions = read(CATALOG / filename)
        expected = next((v[2] for v in sequences.get(set_id, []) if v[1] == pdf_id), None)
        pages = [int(p) for p in regions]
        result.setdefault(set_id, {})[pdf_id] = {
            "mappedPages": len(pages), "firstMappedPage": min(pages, default=0),
            "lastMappedPage": max(pages, default=0), "regions": sum(len(v) for v in regions.values()),
            "catalogPageCount": expected, "map": filename}
    return result

def private_output(path):
    path = path.resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError("Review drafts must be outside the repository")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Never overwrite an existing approved or draft file.
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    return os.fdopen(fd, "w", encoding="utf-8")

class OfficialRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(newurl)
        if parsed.scheme != "https" or parsed.netloc != "www.lego.com":
            raise ValueError("Unexpected PDF redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def download_pdf(pdf_id, directory):
    directory = directory.resolve()
    if directory == ROOT or ROOT in directory.parents:
        raise ValueError("PDFs must be stored outside the repository")
    if not re.fullmatch(r"\d{1,12}", pdf_id):
        raise ValueError("Invalid official PDF ID")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / (pdf_id + ".pdf")
    if target.exists():
        return
    url = "https://www.lego.com/cdn/product-assets/product.bi.core.pdf/" + pdf_id + ".pdf"
    opener = build_opener(OfficialRedirect())
    fd, tmp = tempfile.mkstemp(prefix=".pdf-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as file, opener.open(Request(url, headers={"User-Agent": "BrickLab-Instruction-Audit/1.0", "Accept": "application/pdf"}), timeout=60) as response:
            first = response.read(8)
            if not first.startswith(b"%PDF-"):
                raise ValueError("Official source did not return a PDF")
            file.write(first)
            total = len(first)
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 512 * 1024 * 1024:
                    raise ValueError("PDF exceeds review download limit")
                file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        os.link(tmp, target)  # Atomic, never replace an existing PDF.
        print("Downloaded official PDF", pdf_id, flush=True)
    finally:
        os.unlink(tmp)

def prepare(plan, pdf_dir, output, download_missing=False):
    import fitz  # PyMuPDF, same extraction dependency as the existing map builder.
    candidates = inventory()
    draft = {"schema": 2, "sets": {}}
    for set_id, meta in plan.items():
        if not re.fullmatch(r"\d{3,7}-\d{1,2}", set_id) or set_id not in candidates:
            raise ValueError("Unknown indexed set: " + set_id)
        ids = meta["volumes"]
        if not isinstance(ids, list) or set(ids) != set(candidates[set_id]) or len(ids) != len(set(ids)):
            raise ValueError("Supply the confirmed complete volume order: " + set_id)
        entry = {"title": meta["title"], "partCount": meta["partCount"], "reviewed": False, "volumes": []}
        for pdf_id in ids:
            if download_missing:
                download_pdf(pdf_id, pdf_dir)
            source = pdf_dir / (pdf_id + ".pdf")
            if source.stat().st_size > 512 * 1024 * 1024:
                raise ValueError("PDF exceeds review size limit")
            data = source.read_bytes()
            maps = read(CATALOG / candidates[set_id][pdf_id]["map"])
            with fitz.open(stream=data, filetype="pdf") as pdf:
                count = len(pdf)
                if not 0 < count <= 5000 or any(not 1 <= int(p) <= count for p in maps):
                    raise ValueError("PDF/map page mismatch: " + pdf_id)
                pages = []
                for i, page in enumerate(pdf, 1):
                    # Text numerals are only review aids, not accepted step IDs.
                    hints = sorted(set(int(x) for x in re.findall(r"(?m)^\s*(\d{1,4})\s*$", page.get_text())))
                    pages.append({"step": None, "regions": maps.get(str(i), []), "review": "pending", "stepCandidates": hints[:40]})
            entry["volumes"].append({"id": pdf_id, "pdfSha256": hashlib.sha256(data).hexdigest(),
                                     "pageCount": count, "pages": pages})
        draft["sets"][set_id] = entry
    with private_output(output) as target:
        json.dump(draft, target, ensure_ascii=False, indent=2)
    print("UNAPPROVED draft created; inspect all pages, parts, volume order and rights before approval.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, help="JSON set -> title, partCount, confirmed ordered volume IDs")
    parser.add_argument("--pdf-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--download-missing", action="store_true", help="Download missing official PDFs to private directory")
    args = parser.parse_args()
    if not any((args.plan, args.pdf_dir, args.output)):
        print(json.dumps(inventory(), indent=2))
    elif all((args.plan, args.pdf_dir, args.output)):
        prepare(read(args.plan), args.pdf_dir, args.output, args.download_missing)
    else:
        parser.error("--plan, --pdf-dir and --output are required together")

if __name__ == "__main__":
    main()
