"""Find captions and artwork on scanned instruction pages."""
import csv
import io
import os
import re
import subprocess
from typing import NamedTuple

import fitz
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage


DPI = 216
SCALE = DPI / 72
QUANTITY = re.compile(r"[1-9]\d*x")
ELEMENT = re.compile(r"\d{6,8}")


class Scan(NamedTuple):
    inventory: list
    steps: list


def recognized_text(pixels, offset=(0, 0), magnification=1, *, quantities_only=False):
    image = Image.fromarray(pixels)
    if magnification > 1:
        image = image.resize((image.width * magnification, image.height * magnification), Image.Resampling.BICUBIC)
    source = io.BytesIO()
    image.save(source, format="PNG")
    args = ["tesseract", "stdin", "stdout", "-l", "eng", "--dpi", str(DPI * magnification)]
    args += (["--psm", "6", "-c", "tessedit_char_whitelist=0123456789xX"]
             if quantities_only else ["--psm", "11"])
    result = subprocess.run(
        [*args, "tsv"],
        input=source.getvalue(), capture_output=True, check=True, timeout=30,
        env={**os.environ, "OMP_THREAD_LIMIT": "1"},
    )
    for row in csv.DictReader(io.StringIO(result.stdout.decode()), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = row["text"].strip().lower().replace("×", "x")
        threshold = 65 if quantities_only else (75 if ELEMENT.fullmatch(text) else 55)
        if not text or float(row["conf"]) < threshold:
            continue
        x, y, w, h = (int(row[key]) for key in ("left", "top", "width", "height"))
        left, top = offset[0] + x // magnification, offset[1] + y // magnification
        right = offset[0] + (x + w + magnification - 1) // magnification
        bottom = offset[1] + (y + h + magnification - 1) // magnification
        yield (left, top, right, bottom), text


def frames(ink):
    def lines(axis, length):
        minimum = ndimage.minimum_filter1d(ink, size=length, axis=axis, mode="constant")
        return ndimage.maximum_filter1d(minimum, size=length, axis=axis, mode="constant")

    horizontal = lines(1, round(35 * SCALE))
    vertical = lines(0, round(18 * SCALE))
    labels, _ = ndimage.label(horizontal | vertical)
    for ys, xs in (bounds for bounds in ndimage.find_objects(labels) if bounds):
        x0, x1, y0, y1 = xs.start, xs.stop, ys.start, ys.stop
        w, h = x1 - x0, y1 - y0
        if not 50 * SCALE <= w <= .7 * ink.shape[1] or not 20 * SCALE <= h <= .55 * ink.shape[0]:
            continue
        # Require all four sides. A long illustration edge by itself is not a frame.
        margin = round(SCALE * 2)
        top = horizontal[y0:y0 + margin, xs].any(axis=0)
        bottom = horizontal[y1 - margin:y1, xs].any(axis=0)
        left = vertical[ys, x0:x0 + margin].any(axis=1)
        right = vertical[ys, x1 - margin:x1].any(axis=1)
        if min(top.mean(), bottom.mean(), left.mean(), right.mean()) >= .8:
            yield x0 + margin, y0 + margin, x1 - margin, y1 - margin


def contains(outer, inner):
    return outer[0] <= inner[0] and outer[1] <= inner[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def associate(left, right, limits):
    candidates = []
    max_x, min_y, max_y = limits
    for i, (x, y, _, _) in enumerate(left):
        for j, (a, _, _, b) in enumerate(right):
            dx, dy = abs(x - a), y - b
            if dx <= max_x * SCALE and min_y * SCALE <= dy <= max_y * SCALE:
                candidates.append((2 * dx + abs(dy), i, j))
    used_left, used_right = set(), set()
    for _, i, j in sorted(candidates):
        if i not in used_left and j not in used_right:
            yield i, j
            used_left.add(i)
            used_right.add(j)


def artwork(pixels, region, text):
    x0, y0, x1, y1 = region
    image = pixels[y0:y1, x0:x1]
    sample = image[::4, ::4].reshape(-1, 3)
    tones = sample.astype(np.uint16).sum(axis=1) // 24
    paper = np.median(sample[tones == np.bincount(tones).argmax()], axis=0).astype(np.float32)
    foreground = np.linalg.norm(image - paper, axis=2) > 42
    for (left, top, right, bottom), value in text:
        if (QUANTITY.fullmatch(value) or value.isdigit()) and contains(region, (left, top, right, bottom)):
            foreground[max(0, top - y0 - 1):bottom - y0 + 1, max(0, left - x0 - 1):right - x0 + 1] = False
    labels, _ = ndimage.label(foreground, structure=np.ones((3, 3)))
    for ys, xs in (bounds for bounds in ndimage.find_objects(labels) if bounds):
        if xs.stop - xs.start >= 6 * SCALE and ys.stop - ys.start >= 3 * SCALE:
            yield x0 + xs.start, y0 + ys.start, x0 + xs.stop, y0 + ys.stop


def quantities_below(gray, frame, boxes):
    if not boxes:
        return
    # Use one OCR pass for the small strips below the unmatched drawings.
    strip_width, strip_height, spacing = 180, 90, 12
    stack = Image.new("L", (strip_width, strip_height * len(boxes)), 255)
    for i, (left, _, _, bottom) in enumerate(boxes):
        strip = gray[bottom:min(frame[3], bottom + 25), max(frame[0], left - 4):min(frame[2], left + 42)]
        if not strip.size:
            continue
        image = ImageOps.autocontrast(Image.fromarray(strip), cutoff=1)
        stack.paste(image.resize((image.width * 3, image.height * 3)), (spacing, i * strip_height))
    found = {}
    for (_, top, _, bottom), quantity in recognized_text(np.asarray(stack), quantities_only=True):
        index = (top + bottom) // (2 * strip_height)
        if QUANTITY.fullmatch(quantity):
            found.setdefault(index, []).append(quantity)
    for index, candidates in found.items():
        if len(candidates) == 1:
            yield boxes[index], candidates[0]


def read_scan(page):
    pixmap = page.get_pixmap(dpi=DPI, colorspace=fitz.csRGB, annots=False)
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
    gray = np.asarray(Image.fromarray(pixels).convert("L"))
    whole = (0, 0, pixmap.width, pixmap.height)
    text = list(recognized_text(gray))
    quantities = [(box, value) for box, value in text if QUANTITY.fullmatch(value)]
    elements = [(box, value) for box, value in text if ELEMENT.fullmatch(value)]

    def to_page(box):
        return fitz.Rect(*(coordinate / SCALE for coordinate in box))

    if len(elements) >= 10 and len(quantities) >= 10:
        # In the illustrated inventory each element ID sits below its quantity.
        labels = {q: elements[e][1] for e, q in associate(
            [box for box, _ in elements], [box for box, _ in quantities], (2, -1, 6),
        )}
        boxes = list(artwork(pixels, whole, text))
        inventory = [(to_page(boxes[b]), labels[q]) for q, b in associate(
            [box for box, _ in quantities], boxes, (4, -1, 7),
        ) if q in labels]
        return Scan(inventory, [])

    steps = []
    for region in frames(gray < 176):
        left, top, right, bottom = region
        local = list(recognized_text(gray[top:bottom, left:right], offset=(left, top), magnification=2))
        captions = [(box, word) for box, word in local if QUANTITY.fullmatch(word)]
        for box, word in quantities:
            if contains(region, box) and not any(
                max(abs(box[0] - local_box[0]), abs(box[1] - local_box[1])) <= SCALE
                for local_box, _ in captions
            ):
                captions.append((box, word))
        boxes = list(artwork(pixels, region, local + captions))
        matches = list(associate(
            [box for box, _ in captions], boxes, (5, -1, 9),
        ))
        steps.extend((to_page(boxes[b]), captions[q][1]) for q, b in matches)
        claimed = {b for _, b in matches}
        unpaired = [box for b, box in enumerate(boxes) if b not in claimed]
        steps.extend((to_page(box), value) for box, value in quantities_below(gray, region, unpaired))
    return Scan([], steps)
