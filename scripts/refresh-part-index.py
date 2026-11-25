#!/usr/bin/env python3
"""Refresh verified identity aliases and the exact LEGO element lookup.
Writes only public catalog metadata, never executable code or existing geometry.
"""
import argparse
import csv
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import ZipFile

LDRAW = "https://library.ldraw.org/library/updates/complete.zip"
REBRICKABLE = "https://cdn.rebrickable.com/media/downloads/"
ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,79}\Z")
PART = re.compile(r"(?:ldraw/)?parts/([a-z0-9][a-z0-9_-]{0,79})\.dat\Z", re.I)
IDENTITY = ["1", "16", "0", "0", "0", "1", "0", "0", "0", "1", "0", "0", "0", "1"]
MAX_INDEX = 4_000_000


def atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".", delete=False) as temp:
        name = Path(temp.name)
        try:
            temp.write(data)
            temp.flush()
            os.fsync(temp.fileno())
            os.chmod(name, 0o644)
            os.replace(name, path)
        finally:
            name.unlink(missing_ok=True)


def atomic_json(path, data):
    atomic_bytes(path, json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode())


def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def download(url, destination, limit):
    """Conditional downloads; retain a complete cached file on network errors."""
    meta_path = destination.with_suffix(destination.suffix + ".meta.json")
    meta = read_json(meta_path, {}) if destination.is_file() else {}
    headers = {"User-Agent": "BrickLab-Catalog/1.0"}
    if meta.get("etag"):
        headers["If-None-Match"] = meta["etag"]
    if meta.get("modified"):
        headers["If-Modified-Since"] = meta["modified"]
    try:
        response = urlopen(Request(url, headers=headers), timeout=40)
    except HTTPError as exc:
        if exc.code == 304 and destination.is_file():
            exc.close()
            return destination
        raise
    with response:
        if not response.url.startswith("https://"):
            raise ValueError("non-HTTPS catalog response")
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".", delete=False) as tmp:
            name = Path(tmp.name)
            try:
                size = 0
                while block := response.read(1024 * 1024):
                    size += len(block)
                    if size > limit:
                        raise ValueError("download limit exceeded")
                    tmp.write(block)
                if not size:
                    raise ValueError("empty download")
                tmp.flush()
                if destination.suffix == ".zip":
                    with ZipFile(name) as archive:
                        if len(archive.infolist()) < 1000:
                            raise ValueError("incomplete LDraw archive")
                else:
                    with gzip.open(name, "rb") as source:
                        if not source.read(128):
                            raise ValueError("empty CSV")
                os.replace(name, destination)
            finally:
                name.unlink(missing_ok=True)
        atomic_json(meta_path, {"etag": response.headers.get("ETag"),
                                "modified": response.headers.get("Last-Modified")})
    return destination


def identity_target(text):
    """Only official alias/move headers with exactly one identity reference.
    No offsets, mirroring, geometry additions, or fixed colours.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines or not re.match(r"^0\s+(?:=|~Moved to\s)", lines[0], re.I):
        return None
    if any("INVERTNEXT" in line.upper() or "!TEXMAP" in line.upper() for line in lines):
        return None
    geometry = [line.split() for line in lines if not line.startswith("0 ")]
    if len(geometry) != 1 or len(geometry[0]) != 15:
        return None
    fields = geometry[0]
    if fields[:14] != IDENTITY or not fields[14].lower().endswith(".dat"):
        return None
    target = fields[14][:-4].lower()
    return target if ID.fullmatch(target) else None


def redirects_from(archive_path):
    redirects = {}
    duplicates = set()
    with ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            match = PART.fullmatch(entry.filename)
            if not match or entry.file_size > 128 * 1024:
                continue
            design = match.group(1).lower()
            with archive.open(entry) as source:
                header = source.readline(2048).decode("utf-8-sig", errors="replace")
                if not re.match(r"^0\s+(?:=|~Moved to\s)", header, re.I):
                    continue
                rest = source.read(128 * 1024).decode("utf-8", errors="replace")
            target = identity_target(header + rest)
            if target:
                if design in redirects and redirects[design] != target:
                    duplicates.add(design)
                redirects[design] = target
    return {key: value for key, value in redirects.items() if key not in duplicates}


def resolve_redirects(redirects, available):
    result = {}
    for alias in sorted(redirects):
        if alias in available:
            continue
        seen = {alias}
        target = redirects[alias]
        while target not in available and target in redirects and target not in seen:
            seen.add(target)
            target = redirects[target]
        if target in available and target not in seen:
            result[alias] = target
    return result


def catalog_designs(path):
    data = json.loads(path.read_text())
    designs = {row[0] for section in data["sections"] for row in section["parts"]}
    for filename in ("dune-buggy-parts.json", "inline-engine-parts.json"):
        designs.update(read_json(path.parent / filename, {}))
    return {str(design).lower() for design in designs if ID.fullmatch(str(design).lower())}


def rows(path):
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as source:
        yield from csv.DictReader(source)


def digest(paths):
    h = hashlib.sha256()
    for path in paths:
        with path.open("rb") as source:
            while block := source.read(1024 * 1024):
                h.update(block)
    return h.hexdigest()[:24]


def refresh_elements(cache, public):
    files = [download(REBRICKABLE + name, cache / name, 64 * 1024 * 1024)
             for name in ("elements.csv.gz", "parts.csv.gz", "colors.csv.gz")]
    revision = digest(files)
    base = public / "elements"
    target = base / revision
    if target.is_dir() and all((target / f"{n}.gz").is_file() for n in range(10)):
        return revision
    names = {row["part_num"]: row["name"] for row in rows(files[1])}
    colors = {row["id"]: [row["name"], "#" + row["rgb"]] for row in rows(files[2])}
    buckets = [{} for _ in range(10)]
    for row in rows(files[0]):
        key = row["element_id"]
        if not re.fullmatch(r"[0-9]{6,8}", key):
            continue
        bucket = buckets[int(key[-1])]
        value = [row["part_num"], row["color_id"], row["design_id"]]
        bucket[key] = None if key in bucket and bucket[key] != value else value
    if sum(len(bucket) for bucket in buckets) < 1000 or not colors or not names:
        raise ValueError("incomplete Rebrickable exports")
    base.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".", dir=base))
    try:
        for n, bucket in enumerate(buckets):
            entries = {k: v for k, v in sorted(bucket.items()) if v}
            data = {"source": "https://rebrickable.com/downloads/", "elements": entries,
                    "names": {part: names.get(part, part) for part in sorted({v[0] for v in entries.values()})},
                    "colors": colors}
            atomic_bytes(stage / f"{n}.gz", gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))
        os.chmod(stage, 0o755)
        stage.rename(target)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--archive", type=Path, help="Use a local official archive instead of downloading")
    parser.add_argument("--skip-elements", action="store_true")
    args = parser.parse_args()
    cache, public = args.state / "cache", args.state / "public"
    cache.mkdir(parents=True, exist_ok=True)
    public.mkdir(parents=True, exist_ok=True)
    index_file = public / "aliases.json"
    previous = read_json(index_file, {})
    archive = args.archive or download(LDRAW, cache / "complete.zip", 512 * 1024 * 1024)
    available = catalog_designs(args.catalog)
    redirects = redirects_from(archive)
    aliases = resolve_redirects(redirects, available)
    if not aliases:
        raise ValueError("no verified aliases; keep previous index")
    # Do not publish an obviously truncated or invalid replacement.
    if not args.archive and len(redirects) < 100:
        raise ValueError("incomplete official alias scan")
    revision = previous.get("elementRevision")
    element_error = None
    if not args.skip_elements:
        try:
            revision = refresh_elements(cache, public)
        except (OSError, ValueError, KeyError, HTTPError) as exc:
            element_error = type(exc).__name__
            print(f"Rebrickable refresh failed ({element_error}); keeping prior element snapshot", flush=True)
    result = {"schema": 1, "source": LDRAW, "updatedAt": datetime.now(timezone.utc).isoformat(),
              "aliases": aliases, "stats": {"catalogModels": len(available),
              "identityRedirects": len(redirects), "resolvedAliases": len(aliases),
              "unresolvedAliases": len(set(redirects) - available - set(aliases))}}
    if isinstance(revision, str) and re.fullmatch(r"[a-f0-9]{24}", revision):
        result["elementRevision"] = revision
    if element_error:
        result["elementRefreshError"] = element_error
    payload = json.dumps(result, separators=(",", ":")).encode()
    if len(payload) > MAX_INDEX:
        raise ValueError("index exceeds client limit")
    atomic_bytes(index_file, payload)
    # Keep current and two previous generations; a long-lived client falls back
    # to the packaged element index if an older generation is pruned.
    folder = public / "elements"
    if folder.is_dir():
        versions = sorted((p for p in folder.iterdir() if p.is_dir() and re.fullmatch(r"[a-f0-9]{24}", p.name)),
                          key=lambda p: p.stat().st_mtime, reverse=True)
        keep = {revision, *(p.name for p in versions[:3])}
        for version in versions:
            if version.name not in keep:
                shutil.rmtree(version)
    print(json.dumps(result["stats"]), flush=True)


if __name__ == "__main__":
    main()
