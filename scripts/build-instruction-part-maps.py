"""Generate clickable part regions from matched LEGO PDF instruction booklets.

Install PyMuPDF, NumPy and Pillow. Supply all booklets of a set together, including
the one with the illustrated inventory, and the Rebrickable elements.csv.gz export.
For example: python scripts/build-instruction-part-maps.py --set 42215 \
    --elements elements.csv.gz 6592888=first.pdf 6595793=second.pdf
"""
import argparse
import csv
import gzip
import json
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import fitz
import numpy as np
from PIL import Image


QUANTITY = re.compile(r"[1-9]\d*x")
ELEMENT = re.compile(r"\d{6,8}")
SIZE = 40


def text_boxes(words, pattern):
    return sorted({(*word[:4], word[4]) for word in words if pattern.fullmatch(word[4])},
                  key=lambda box: (box[1], box[0]))


def artwork(words, images, max_dx, min_dy, max_dy):
    for x, y, _, _, value in words:
        # Both caption types are left-aligned to the underlying part drawing.
        candidates = [
            (abs(x - box[0]) * 2 + abs(y - box[3]), xref, box)
            for xref, box in images
            if xref and abs(x - box[0]) <= max_dx and min_dy <= y - box[3] <= max_dy
        ]
        if not candidates:
            continue
        _, xref, box = min(candidates)
        if box[2] - box[0] >= 6 and box[3] - box[1] >= 4:
            yield xref, box, value


def read_book(path, cache=None):
    pdf = fitz.open(path)
    if cache is not None:
        return pdf, cache
    pages = []
    for page in pdf:
        words = page.get_text("words")
        images = []
        if any(QUANTITY.fullmatch(word[4]) for word in words):
            images = [(image["xref"], image["bbox"]) for image in page.get_image_info(xrefs=True)]
        pages.append((words, images))
    return pdf, pages


def template(pdf, xref):
    pixmap = fitz.Pixmap(pdf, xref)
    if not pixmap.colorspace:
        return None
    if pixmap.colorspace.n != 3:
        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
    rgb = pixels.astype(np.float32) / 255
    background = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    if min(background) < .5:
        return None
    foreground = np.linalg.norm(rgb - background, axis=2) > .18
    ys, xs = np.where(foreground)
    if len(ys) < 6:
        return None
    crop = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    crop = np.clip(crop + (1 - background), 0, 1)
    thumbnail = Image.fromarray(np.uint8(crop * 255)).resize((SIZE, SIZE), Image.Resampling.BILINEAR)
    return np.asarray(thumbnail, dtype=np.float32) / 255, np.log(crop.shape[1] / crop.shape[0])


def make_matcher(templates):
    images, aspects, identifiers = zip(*templates)
    images = np.stack(images)
    aspects = np.asarray(aspects)
    # Repeated images of the same catalog item are one candidate, not competitors.
    columns = defaultdict(list)
    for i, identifier in enumerate(identifiers):
        columns[identifier].append(i)

    def rank(sample):
        if sample is None:
            return []
        image, aspect = sample
        distances = np.abs(images - image).mean(axis=(1, 2, 3)) + .18 * np.abs(aspects - aspect)
        return sorted((float(min(distances[indices])), identifier) for identifier, indices in columns.items())
    return rank


def normalized_box(box, page):
    left = max(0, (box[0] - 1.5) / page.width)
    top = max(0, (box[1] - 1.5) / page.height)
    right = min(1, (box[2] + 1.5) / page.width)
    bottom = min(1, (box[3] + 1.5) / page.height)
    x, y, x1, y1 = (round(value * 10000) for value in (left, top, right, bottom))
    return [x, y, x1 - x, y1 - y]


def analyze(books, elements, corrections=None, max_difference=.043, min_margin=.028):
    inventory = []
    inventory_pages = set()
    for book_id, (pdf, pages) in books.items():
        for page_no, (words, images) in enumerate(pages):
            labels = [box for box in text_boxes(words, ELEMENT) if box[4] in elements]
            if len(labels) < 10 or len(text_boxes(words, QUANTITY)) < 10:
                continue
            inventory_pages.add((book_id, page_no))
            for xref, _, element in artwork(labels, images, max_dx=4, min_dy=-2, max_dy=11):
                sample = template(pdf, xref)
                if sample is not None:
                    inventory.append((*sample, elements[element]))
    if not inventory:
        raise ValueError("No illustrated inventory found. Include the PDF containing the inventory.")
    rank = make_matcher(inventory)
    corrections = corrections or {}
    maps, audit = {}, {}
    for book_id, (pdf, pages) in books.items():
        cached = lru_cache(maxsize=None)(lambda xref: rank(template(pdf, xref))[:4])
        result, review = {}, {}
        for page_no, (words, images) in enumerate(pages):
            if (book_id, page_no) in inventory_pages:
                continue
            regions = []
            for xref, box, quantity in artwork(text_boxes(words, QUANTITY), images, max_dx=3, min_dy=-2.5, max_dy=.3):
                matches = cached(xref)
                checked = corrections.get(book_id, {}).get(str(xref))
                override = checked and checked["part"]
                if override and checked.get("join"):
                    extended = fitz.Rect(box)
                    for ref in checked["join"]:
                        fragments = [candidate for other, candidate in images if other == ref]
                        if fragments:
                            nearest = min(fragments, key=lambda candidate: abs(candidate[0] - box[0]) + abs(candidate[3] - box[3]))
                            horizontal = nearest[0] <= box[2] + 2 and nearest[2] >= box[0] - 2
                            vertical = nearest[1] <= box[3] + 2 and nearest[3] >= box[1] - 2
                            if horizontal and vertical:
                                extended |= fitz.Rect(nearest)
                    box = tuple(extended)
                if checked is None and len(matches) >= 2:
                    (difference, suggested), (alternative, _) = matches[:2]
                    if difference <= max_difference and alternative - difference >= min_margin:
                        override = suggested
                review.setdefault(xref, {"matches": matches, "pages": [], "selected": override})
                review[xref]["pages"].append((page_no + 1, box, quantity))
                if override:
                    regions.append([*normalized_box(box, pdf[page_no].rect), *override])
            if regions:
                result[str(page_no + 1)] = regions
        maps[book_id], audit[book_id] = result, review
    return maps, audit


def save_map(destination, regions):
    rows = (f'  "{page}": {json.dumps(entries, separators=(",", ":"))}' for page, entries in regions.items())
    destination.write_text("{\n" + ",\n".join(rows) + "\n}\n", encoding="utf-8")


def read_elements(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as handle:
        return {row["element_id"]: (row["part_num"], row["color_id"]) for row in csv.DictReader(handle)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("books", metavar="ID=PDF", nargs="+")
    parser.add_argument("--set", required=True, dest="set_number")
    parser.add_argument("--elements", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("catalog/sets"))
    parser.add_argument("--corrections", type=Path, help="Reviewed matches and joined image fragments keyed by PDF ID and image reference")
    parser.add_argument("--review", type=Path, help="Save candidate matches and locations for manual review")
    args = parser.parse_args()
    if not re.fullmatch(r"\d+(?:-\d+)?", args.set_number):
        parser.error("--set expects a LEGO set number, for example 42215 or 42215-1")
    set_number, _, variant = args.set_number.partition("-")
    normalized = f"{set_number}-{variant or '1'}"
    book_paths = dict(entry.split("=", 1) for entry in args.books)
    if not all(book.isdigit() for book in book_paths):
        parser.error("book identifiers must be numeric LEGO PDF IDs")
    books = {book: read_book(path) for book, path in book_paths.items()}
    corrections = json.loads(args.corrections.read_text()) if args.corrections else None
    limits = {"max_difference": .060, "min_margin": .022} if corrections else {}
    maps, audit = analyze(books, read_elements(args.elements), corrections, **limits)
    args.output.mkdir(parents=True, exist_ok=True)
    if args.review:
        args.review.write_text(json.dumps(audit, indent=2))
    index_path = args.output / "instruction-part-index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    for book, regions in maps.items():
        total = sum(map(len, regions.values()))
        available = sum(len(item["pages"]) for item in audit[book].values())
        name = f"{normalized.split('-')[0]}-{book}-parts-by-page.json"
        save_map(args.output / name, regions)
        index[f"{normalized}/{book}"] = name
        print(f"{book}: {total}/{available} part regions on {len(regions)} pages")
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
