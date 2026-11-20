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
import math
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import fitz
import numpy as np
from PIL import Image


QUANTITY = re.compile(r"[1-9]\d*x")
ELEMENT = re.compile(r"\d{6,8}")
BADGE_NUMBER = re.compile(r"[1-9]\d?")
SIZE = 40


def text_boxes(words, pattern):
    return sorted({(*word[:4], word[4]) for word in words if pattern.fullmatch(word[4])},
                  key=lambda box: (box[1], box[0]))


def is_rectangular_path(items, rect):
    if len(items) == 1:
        return items[0][0] == "re"
    # Some booklets draw a filled rectangle as a chain of perimeter segments.
    if len(items) < 4 or any(item[0] != "l" for item in items):
        return False
    edges = ((0, rect.x0), (0, rect.x1), (1, rect.y0), (1, rect.y1))
    lengths = [0.] * len(edges)
    for _, start, end in items:
        for i, (axis, value) in enumerate(edges):
            if abs(start[axis] - value) <= .05 and abs(end[axis] - value) <= .05:
                lengths[i] += abs(start[1 - axis] - end[1 - axis])
                break
        else:
            return False
    return all(abs(actual - expected) < 1 for actual, expected in zip(
        lengths, (rect.height, rect.height, rect.width, rect.width),
    ))


def numbered_badges(words, drawings):
    shapes = []
    for path in drawings:
        rect = path["rect"]
        fill = path.get("fill")
        if not (fill and (max(fill) < .14 or min(fill) > .86)
                and 10.8 < rect.width < 13.4 and 10.8 < rect.height < 13.4
                and abs(rect.width - rect.height) < .65):
            continue
        items = path["items"]
        if sum(item[0] == "c" for item in items) >= 4:
            shapes.append((rect, "round"))
        elif is_rectangular_path(items, rect):
            shapes.append((rect, "square"))

    for x0, y0, x1, y1, value in text_boxes(words, BADGE_NUMBER):
        candidates = [(rect, shape) for rect, shape in shapes
                      if rect.x0 <= x0 and x1 <= rect.x1 and y1 - y0 < 13
                      and abs(x0 + x1 - rect.x0 - rect.x1) < 3.4
                      and abs(y0 + y1 - rect.y0 - rect.y1) < 5.2]
        if candidates and len({shape for _, shape in candidates}) == 1:
            rect, shape = min(candidates, key=lambda candidate: candidate[0].get_area())
            yield rect, (shape, int(value))


def artwork_badges(parts, badges):
    candidates = []
    for i, (rect, _) in enumerate(badges):
        for j, (_, box, *_) in enumerate(parts):
            dx, dy = rect.x0 - box.x1, rect.y0 - box.y0
            if -3 <= dx <= 7 and -8 <= dy <= 8:
                candidates.append((abs(dx) + abs(dy), i, j))
    assigned = {}
    used = set()
    for _, i, j in sorted(candidates):
        if i not in used and j not in assigned:
            assigned[j] = badges[i][1]
            used.add(i)
    return assigned


def step_artwork(page, words, images, corrections=None):
    captions = text_boxes(words, QUANTITY)
    if not captions:
        return
    frames = set()
    drawings = page.get_drawings()
    for path in drawings:
        rect = path["rect"]
        fill = path.get("fill")
        if (fill and min(fill) >= .8 and max(fill) - min(fill) < .08
                and 25 <= rect.width <= .7 * page.rect.width
                and 18 <= rect.height <= .55 * page.rect.height
                and page.rect.contains(rect) and is_rectangular_path(path["items"], rect)):
            frames.add(tuple(rect))
    frames = sorted((fitz.Rect(frame) for frame in frames), key=lambda rect: (rect.get_area(), tuple(rect)))
    badges = list(numbered_badges(words, drawings)) if frames else []

    groups = defaultdict(list)
    for caption in captions:
        bounds = fitz.Rect(caption[:4])
        frame = next((rect for rect in frames if rect.contains(bounds)), None)
        groups[tuple(frame) if frame is not None else None].append(caption)
    for frame, group in groups.items():
        if frame is None:
            for part in artwork(group, images, max_dx=3, min_dy=-2.5, max_dy=2, corrections=corrections):
                yield (*part, (), None)
            continue
        bounds = fitz.Rect(frame)
        local = [(xref, box) for xref, box in images if bounds.contains(fitz.Rect(box))]
        parts = list(artwork(group, local, max_dx=4.5, min_dy=-2.5, max_dy=3.5, corrections=corrections))
        dimensions = artwork_badges(parts, [badge for badge in badges if bounds.contains(badge[0])])
        for index, part in enumerate(parts):
            _, box, _, _ = part
            # A long diagonal part can have smaller, independently captioned
            # drawings in the blank corners of its bounding box.
            neighbors = tuple(other_box for _, other_box, _, _ in parts
                              if other_box.get_area() < .65 * box.get_area() and box.intersects(other_box))
            yield (*part, neighbors, dimensions.get(index))


def artwork(words, images, max_dx, min_dy, max_dy, corrections=None):
    candidates = []
    for caption, (x, y, _, _, _) in enumerate(words):
        # Both caption types are left-aligned to the underlying part drawing.
        candidates.extend(
            (abs(x - box[0]) * 2 + abs(y - box[3]), caption, index)
            for index, (_, box) in enumerate(images)
            if abs(x - box[0]) <= max_dx and min_dy <= y - box[3] <= max_dy
            and box[2] - box[0] >= 6 and box[3] - box[1] >= 4
        )

    anchors = {}
    assigned = set()
    for _, caption, index in sorted(candidates):
        if caption not in anchors and index not in assigned:
            anchors[caption] = index
            assigned.add(index)
    for caption, index in sorted(anchors.items()):
        xref, bounds = images[index]
        anchor = fitz.Rect(bounds)
        box = fitz.Rect(anchor)
        isolated = bool(xref)
        joins = (corrections or {}).get(str(xref), {}).get("join", ())
        for other_index, (other_ref, other_bounds) in enumerate(images):
            if other_index == index or (other_ref == xref and other_bounds == bounds):
                continue
            if other_index in assigned and other_ref not in joins:
                continue
            fragment = fitz.Rect(other_bounds)
            overlap = fragment & anchor
            # Ignore page-wide backgrounds and contacts along tile edges.
            background = fragment.contains(anchor) and fragment.get_area() > 4 * anchor.get_area()
            if not background and overlap.width > .5 and overlap.height > .5:
                isolated = False
            if other_ref in joins:
                nearby = fitz.Rect(anchor.x0 - 2, anchor.y0 - 2, anchor.x1 + 2, anchor.y1 + 2)
                if fragment.intersects(nearby):
                    box |= fragment
                    isolated = False
            elif fragment.intersects(anchor) and not fragment.contains(anchor):
                # A tile can extend above or to the right. Keep the crop clear of
                # the caption and do not absorb artwork from other callouts.
                same_left = abs(fragment.x0 - anchor.x0) <= 2
                same_bottom = abs(fragment.y1 - anchor.y1) <= 2 and fragment.x0 >= anchor.x0
                if (same_left or same_bottom) and fragment.y1 <= anchor.y1 + 1:
                    box |= fragment
        yield xref, box, words[caption][4], isolated and box == anchor


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


def template(display, box, neighbors=()):
    # Render the actual page so inline images, masks and layered tiles are composited.
    clip = fitz.Rect(box.x0 - 1, box.y0 - 1, box.x1 + 1, box.y1 + .25) & display.rect
    scale = min(3, 240 / max(clip.width, clip.height)) if not clip.is_empty else 0
    if not scale:
        return None
    pixmap = display.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, clip=clip)
    excluded = [
        (max(0, math.floor(neighbor.x0 * scale) - pixmap.x),
         max(0, math.floor(neighbor.y0 * scale) - pixmap.y),
         math.ceil(neighbor.x1 * scale) - pixmap.x,
         math.ceil(neighbor.y1 * scale) - pixmap.y)
        for neighbor in neighbors
    ]
    return thumbnail(pixmap, excluded=excluded)


def embedded_template(pdf, xref):
    try:
        pixmap = fitz.Pixmap(pdf, xref)
    except (RuntimeError, ValueError):
        return None
    if not pixmap.colorspace or pixmap.alpha:
        return None
    if pixmap.colorspace.n != 3:
        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
    return thumbnail(pixmap, normalize_paper=True)


def thumbnail(pixmap, normalize_paper=False, excluded=()):
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
    rgb = pixels.astype(np.float32) / 255
    background = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    if min(background) < .5:
        return None
    for left, top, right, bottom in excluded:
        rgb[top:bottom, left:right] = background
    foreground = np.linalg.norm(rgb - background, axis=2) > .18
    ys, xs = np.where(foreground)
    if len(ys) < 6:
        return None
    if normalize_paper:
        # The embedded artwork uses the original white point of its raster tile.
        rgb = np.clip(rgb + (1 - background), 0, 1)
    else:
        # In a rendered crop the paper can be gray while the part keeps its color.
        rgb[~foreground] = 1
    crop = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
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


def confident_match(matches, max_difference, min_margin):
    if len(matches) < 2:
        return None
    (difference, identifier), (alternative, _) = matches[:2]
    if difference <= max_difference and alternative - difference >= min_margin:
        return identifier
    return None


def badge_match(matches, candidates, max_difference, min_margin):
    eligible = [(score, part) for score, part in matches if part in candidates]
    if not eligible or eligible[0][0] - matches[0][0] > min_margin:
        return None
    if len(eligible) == 1:
        score, part = eligible[0]
        return part if score <= max_difference else None
    return confident_match(eligible, max_difference, min_margin)


def visible_chroma(image):
    ink = image[image.min(axis=2) < .87]
    colored = ink[np.ptp(ink, axis=1) > .16]
    if len(colored) < max(3, .2 * len(ink)):
        return np.zeros(3)
    return np.median(colored - colored.mean(axis=1, keepdims=True), axis=0)


def analyze(books, elements, corrections=None, max_difference=.043, min_margin=.028):
    inventory, embedded_inventory = [], []
    inventory_chroma = defaultdict(list)
    inventory_badges = defaultdict(set)
    inventory_pages = set()
    for book_id, (pdf, pages) in books.items():
        for page_no, (words, images) in enumerate(pages):
            labels = [box for box in text_boxes(words, ELEMENT) if box[4] in elements]
            if len(labels) < 10 or len(text_boxes(words, QUANTITY)) < 10:
                continue
            inventory_pages.add((book_id, page_no))
            page = pdf[page_no]
            display = page.get_displaylist(annots=False)
            items = list(artwork(labels, images, max_dx=4, min_dy=-2, max_dy=11))
            badges = artwork_badges(items, list(numbered_badges(words, page.get_drawings())))
            for index, (xref, box, element, isolated) in enumerate(items):
                identifier = elements[element]
                sample = template(display, box)
                if sample is not None:
                    inventory.append((*sample, identifier))
                    inventory_chroma[identifier].append(visible_chroma(sample[0]))
                    if index in badges:
                        inventory_badges[badges[index]].add(identifier)
                if isolated and (embedded := embedded_template(pdf, xref)) is not None:
                    embedded_inventory.append((*embedded, identifier))
    if not inventory:
        raise ValueError("No illustrated inventory found. Include the PDF containing the inventory.")
    rank = make_matcher(inventory)
    rank_embedded = make_matcher(embedded_inventory) if embedded_inventory else None
    corrections = corrections or {}
    maps, audit = {}, {}
    for book_id, (pdf, pages) in books.items():
        def embedded_matches(xref):
            return rank_embedded(embedded_template(pdf, xref))[:4]

        cached_embedded = lru_cache(maxsize=None)(embedded_matches)
        result, review = {}, {}
        book_corrections = corrections.get(book_id, {})
        for page_no, (words, images) in enumerate(pages):
            if (book_id, page_no) in inventory_pages:
                continue
            if not images:
                continue
            page = pdf[page_no]
            parts = list(step_artwork(page, words, images, book_corrections))
            if not parts:
                continue
            display = page.get_displaylist(annots=False)
            regions = []
            for xref, box, quantity, isolated, neighbors, badge in parts:
                sample = template(display, box)
                ranking = rank(sample)
                matches = ranking[:4]
                views = [(sample, ranking)]
                checked = book_corrections.get(str(xref))
                override = checked and checked["part"]
                if checked is None:
                    override = confident_match(matches, max_difference, min_margin)
                    if isolated and rank_embedded is not None:
                        raster_ranking = cached_embedded(xref)
                        embedded = confident_match(raster_ranking, max_difference, min_margin)
                        if override and embedded and override != embedded:
                            override = None
                            neighbors = ()
                            badge = None
                        elif embedded and not override and matches and matches[0][1] == embedded:
                            # A placed image can be recolored or marked up. The
                            # paper around thin parts can dominate the image score.
                            chroma = visible_chroma(sample[0])
                            if any(np.max(np.abs(chroma - reference)) <= .15
                                   for reference in inventory_chroma[embedded]):
                                override = embedded
                                matches = raster_ranking
                    if not override and neighbors:
                        cleaned_sample = template(display, box, neighbors)
                        cleaned = rank(cleaned_sample)
                        views.append((cleaned_sample, cleaned))
                        override = confident_match(cleaned, max_difference, min_margin)
                        if override:
                            matches = cleaned[:4]
                    if not override and badge in inventory_badges:
                        compatible = inventory_badges[badge]
                        for pixels, ranked in views:
                            candidate = badge_match(ranked, compatible, max_difference, min_margin)
                            if not candidate:
                                continue
                            chroma = visible_chroma(pixels[0])
                            if any(np.max(np.abs(chroma - reference)) <= .15
                                   for reference in inventory_chroma[candidate]):
                                override = candidate
                                matches = ranked[:4]
                                break
                review.setdefault(xref, {"matches": matches, "pages": [], "selected": override})
                review[xref]["pages"].append((page_no + 1, tuple(box), quantity))
                if override:
                    regions.append([*normalized_box(box, page.rect), *override])
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
