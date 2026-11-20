"""Build the lazy Element ID lookup from Rebrickable's elements, parts and colors CSV exports."""
import csv
import gzip
import json
import re
import sys
from pathlib import Path


def rows(filename):
    with gzip.open(filename, "rt", encoding="utf-8-sig", newline="") as source:
        yield from csv.DictReader(source)


elements, parts, colors = sys.argv[1:]
names = {row["part_num"]: row["name"] for row in rows(parts)}
palette = {row["id"]: [row["name"], "#" + row["rgb"]] for row in rows(colors)}
buckets = [{} for _ in range(10)]
for row in rows(elements):
    key = row["element_id"]
    if re.fullmatch(r"[0-9]{6,8}", key):
        bucket = buckets[int(key[-1])]
        value = [row["part_num"], row["color_id"], row["design_id"]]
        if key in bucket and bucket[key] != value:
            bucket[key] = None
        else:
            bucket[key] = value

folder = Path(__file__).resolve().parents[1] / "catalog" / "elements"
folder.mkdir(exist_ok=True)
for digit, bucket in enumerate(buckets):
    entries = {key: value for key, value in sorted(bucket.items()) if value}
    data = {"source": "https://rebrickable.com/downloads/", "elements": entries,
            "names": {part: names.get(part, part) for part in sorted({v[0] for v in entries.values()})},
            "colors": palette}
    (folder / f"{digit}.gz").write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))
