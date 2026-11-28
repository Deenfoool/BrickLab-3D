#!/usr/bin/env python3
"""Read an actual official PDF and produce an UNREVIEWED map and diagnostic report.
No production catalog, database or approval files are modified.
"""
import argparse
import gzip
import json
import re
from collections import Counter
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

# The existing CLI has a hyphenated filename, not an importable module name.
builder_path = Path(__file__).resolve().with_name("build-instruction-part-maps.py")
spec = spec_from_file_location("build_instruction_part_maps", builder_path)
if spec is None or spec.loader is None:
    raise ImportError(f"Cannot load instruction map builder: {builder_path}")
builder = module_from_spec(spec)
spec.loader.exec_module(builder)
read_book, analyze, save_map = builder.read_book, builder.analyze, builder.save_map
QUANTITY, ELEMENT = builder.QUANTITY, builder.ELEMENT

def load_local_elements(directory):
    elements = {}
    for path in sorted(directory.glob("*.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as file:
            bucket = json.load(file)
        for key, entry in bucket["elements"].items():
            if isinstance(entry, list) and len(entry) >= 2:
                elements[str(key)] = (str(entry[0]), str(entry[1]))
    if not elements:
        raise ValueError("No local element index entries")
    return elements

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--set", dest="set_id", required=True)
    parser.add_argument("--pdf-id", required=True)
    parser.add_argument("--elements", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"\d+-\d+", args.set_id) or not args.pdf_id.isdigit():
        parser.error("Invalid set/PDF ID")
    args.output.mkdir(parents=True, exist_ok=True)
    elements = load_local_elements(args.elements)
    print("ELEMENT INDEX:", len(elements), flush=True)
    pdf, pages = read_book(args.pdf)
    print("PDF PAGES:", len(pdf), flush=True)
    rows = []
    for i, (words, images, _) in enumerate(pages):
        q = sum(bool(QUANTITY.fullmatch(w[4])) for w in words)
        ids = [w[4] for w in words if ELEMENT.fullmatch(w[4])]
        known = sum(v in elements for v in ids)
        rows.append({"page": i+1, "quantities": q, "printed_ids": len(ids), "known_ids": known, "image_regions": len(images)})
    report = {"set": args.set_id, "pdf": args.pdf_id, "pages": rows, "page_count": len(pdf)}
    print("PAGES WITH QUANTITY LABELS:", sum(r["quantities"]>0 for r in rows), flush=True)
    print("TOP INVENTORY PAGES:", sorted(rows, key=lambda r:r["known_ids"], reverse=True)[:8], flush=True)
    try:
        maps, audit = analyze({args.pdf_id:(pdf,pages)}, elements)
        result = maps[args.pdf_id]
        reviewed = audit[args.pdf_id]
        candidates = Counter()
        for record in reviewed.values():
            for page, _, _ in record["pages"]:
                candidates[page] += 1
        counts = [{"page":r["page"],"located":candidates[r["page"]],"assigned":len(result.get(str(r["page"]),[]))} for r in rows]
        report.update({"candidate_counts":counts,"assigned_regions":sum(map(len,result.values())),"located_regions":sum(candidates.values()),"mapped_pages":len(result)})
        save_map(args.output / "candidate-parts-by-page.json", result)
        (args.output / "candidate-review.json").write_text(json.dumps(reviewed, ensure_ascii=False),encoding="utf-8")
        print("MAP:", report["assigned_regions"], "/", report["located_regions"], "located regions;",len(result),"mapped pages",flush=True)
        print("PAGES WITH CALLOUTS BUT NO MATCH:", [r["page"] for r in counts if r["located"] and not r["assigned"]][:30],flush=True)
    except ValueError as error:
        report["analysis_error"] = str(error)
        print("ANALYSIS:", str(error), flush=True)
    finally:
        pdf.close()
        (args.output / "report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
        print("=== INSTRUCTION DIAGNOSTICS COMPLETE ===",flush=True)

if __name__ == "__main__":
    main()
