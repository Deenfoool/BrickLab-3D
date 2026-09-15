#!/usr/bin/env python3
"""Build deterministic 128 px WebP preview atlases from a local LDraw tree."""

from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import multiprocessing as mp
import re
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, features

CELL = 128
GRID = 15
PAGE = 2048
INNER = 112
ROT_X = math.radians(-24)
ROT_Y = math.radians(-38)
RX = np.array([[1, 0, 0], [0, math.cos(ROT_X), -math.sin(ROT_X)], [0, math.sin(ROT_X), math.cos(ROT_X)]], dtype=np.float32)
RY = np.array([[math.cos(ROT_Y), 0, math.sin(ROT_Y)], [0, 1, 0], [-math.sin(ROT_Y), 0, math.cos(ROT_Y)]], dtype=np.float32)
VIEW = RX @ RY
ROOT: Path


def family(category: str, description: str) -> str:
    text = f"{category} {description}".lower()
    if "duplo" in text:
        return "duplo"
    if re.search(r"bionicle|ccbs|constraction|hero factory", text):
        return "bionicle"
    if re.search(r"train|monorail", text):
        return "trains"
    if re.search(r"electric|robot|mindstorms|powered up|battery|sensor|motor", text):
        return "power"
    if re.search(r"technic|liftarm|axle|gear|\bpin\b|bush|wheel|tyre|tire|drivetrain|steering|suspension", text):
        return "technic"
    if re.search(r"brick|plate|tile|slope|curve|panel|hinge|clip|\bbar\b|window|door|windscreen|minifig|arch|bracket|plant|animal|wedge|decor", text):
        return "system"
    return "other"


def resolve(name: str, parent: Path | None = None) -> Path | None:
    clean = name.replace("\\", "/").lower()
    candidates = []
    if parent is not None:
        candidates.append(parent / clean)
    if clean.startswith("s/"):
        candidates.append(ROOT / "parts" / clean)
    else:
        candidates.extend((ROOT / "parts" / clean, ROOT / "p" / clean))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def triangles(path: Path, matrix=None, offset=None, stack=None):
    matrix = np.eye(3, dtype=np.float32) if matrix is None else matrix
    offset = np.zeros(3, dtype=np.float32) if offset is None else offset
    stack = set() if stack is None else stack
    key = str(path)
    if key in stack:
        return []
    stack.add(key)
    result = []
    try:
        lines = path.read_text("utf-8", errors="ignore").splitlines()
    except OSError:
        stack.remove(key)
        return result
    for line in lines:
        parts = line.strip().split()
        if not parts:
            continue
        try:
            kind = parts[0]
            if kind == "1" and len(parts) >= 15:
                child_offset = np.array([float(x) for x in parts[2:5]], dtype=np.float32)
                child_matrix = np.array([float(x) for x in parts[5:14]], dtype=np.float32).reshape(3, 3)
                child = resolve(" ".join(parts[14:]), path.parent)
                if child:
                    result.extend(triangles(child, matrix @ child_matrix, offset + matrix @ child_offset, stack))
            elif kind in ("3", "4"):
                count = 3 if kind == "3" else 4
                values = np.array([float(x) for x in parts[2:2 + count * 3]], dtype=np.float32).reshape(count, 3)
                values = values @ matrix.T + offset
                result.append(values[[0, 1, 2]])
                if count == 4:
                    result.append(values[[0, 2, 3]])
        except (ValueError, IndexError):
            continue
    stack.remove(key)
    return result


def render(code: str) -> bytes | None:
    path = resolve(f"{code}.dat")
    if not path:
        return None
    faces = triangles(path)
    if not faces:
        return None
    points = np.asarray(faces, dtype=np.float32)
    if len(points) > 12000:
        step = math.ceil(len(points) / 12000)
        points = points[::step]
    projected = points @ VIEW.T
    flat = projected.reshape(-1, 3)
    minimum, maximum = flat.min(axis=0), flat.max(axis=0)
    extent = np.maximum(maximum - minimum, 1e-4)
    scale = min((INNER - 8) / extent[0], (INNER - 8) / extent[1])
    center = (minimum + maximum) / 2
    coords = projected.copy()
    coords[:, :, 0] = (coords[:, :, 0] - center[0]) * scale + INNER / 2
    coords[:, :, 1] = INNER / 2 - (coords[:, :, 1] - center[1]) * scale
    normals = np.cross(projected[:, 1] - projected[:, 0], projected[:, 2] - projected[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    valid = lengths > 1e-7
    light = np.array([-0.35, 0.6, 0.72], dtype=np.float32)
    light /= np.linalg.norm(light)
    shades = np.full(len(coords), 0.55, dtype=np.float32)
    shades[valid] = 0.45 + 0.5 * np.abs((normals[valid] / lengths[valid, None]) @ light)
    order = np.argsort(coords[:, :, 2].mean(axis=1))
    image = Image.new("RGBA", (INNER, INNER), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for index in order:
        shade = float(shades[index])
        color = (int(224 * shade), int(52 * shade), int(68 * shade), 255)
        polygon = [(float(x), float(y)) for x, y in coords[index, :, :2]]
        draw.polygon(polygon, fill=color)
    output = io.BytesIO()
    image.save(output, "PNG", optimize=False)
    return output.getvalue()


def worker(task):
    code, fam = task
    try:
        return code, fam, render(code), None
    except Exception as error:
        return code, fam, None, str(error)


def load_index(path: Path):
    rows = []
    with zipfile.ZipFile(path) as archive:
        meta = json.loads(archive.read("index.json"))
        for category, ids in meta["categories"].items():
            member = f"c/{re.sub(r'\s+', '-', category.strip())}.json"
            parts = json.loads(archive.read(member))
            for code in ids:
                entry = parts.get(code, [])
                description = entry[0] if isinstance(entry, list) and entry else ""
                rows.append((str(code).lower(), family(category, description)))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ldraw", required=True, type=Path)
    parser.add_argument("--index", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--workers", type=int, default=max(1, min(8, mp.cpu_count() - 1)))
    args = parser.parse_args()
    global ROOT
    ROOT = args.ldraw.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    rows = load_index(args.index)
    grouped = {name: [] for name in ("system", "technic", "duplo", "bionicle", "trains", "power", "other")}
    failed = []
    with mp.Pool(args.workers, initializer=lambda: None) as pool:
        for done, (code, fam, payload, error) in enumerate(pool.imap_unordered(worker, rows, chunksize=8), 1):
            if payload:
                grouped[fam].append((code, payload))
            else:
                failed.append({"code": code, "family": fam, "error": error or "no-triangles"})
            if done % 250 == 0:
                print(f"rendered {done}/{len(rows)}", flush=True)
    manifest = {"version": 1, "cell": CELL, "page": PAGE, "grid": GRID, "families": {}, "parts": {}}
    for fam, entries in grouped.items():
        entries.sort(key=lambda item: item[0])
        directory = output / fam
        directory.mkdir(exist_ok=True)
        pages = math.ceil(len(entries) / (GRID * GRID))
        manifest["families"][fam] = {"count": len(entries), "pages": pages}
        for page_index in range(pages):
            canvas = Image.new("RGBA", (PAGE, PAGE), (0, 0, 0, 0))
            batch = entries[page_index * GRID * GRID:(page_index + 1) * GRID * GRID]
            for cell_index, (code, payload) in enumerate(batch):
                thumb = Image.open(io.BytesIO(payload)).convert("RGBA")
                x = 8 + (cell_index % GRID) * 136
                y = 8 + (cell_index // GRID) * 136
                canvas.alpha_composite(thumb, (x + 8, y + 8))
                manifest["parts"][f"ldraw-{code}"] = {"f": fam, "p": page_index, "x": x, "y": y, "w": CELL, "h": CELL}
            target = directory / f"atlas-{page_index:03d}.webp"
            canvas.save(target, "WEBP", quality=82, method=4, lossless=False, exact=True)
        print(f"{fam}: {len(entries)} previews / {pages} pages", flush=True)
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode("utf-8")
    (output / "manifest.json.gz").write_bytes(gzip.compress(manifest_bytes, compresslevel=9, mtime=0))
    (output / "failed.json").write_text(json.dumps(failed, ensure_ascii=False, indent=2), "utf-8")
    print(f"complete: {len(manifest['parts'])} previews, {len(failed)} unavailable", flush=True)


if __name__ == "__main__":
    main()
