#!/usr/bin/env python3
"""Compare provisional visually checked identities with a real PDF recovery experiment.
These checks are a diagnostic sample, not a fully reviewed ground truth."""
import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("pdf","fixture","review"):
        parser.add_argument("--"+name,type=Path,required=True)
    args=parser.parse_args()
    fixture=json.loads(args.fixture.read_text())
    actual=hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if fixture["pdfSha256"]!=actual:
        raise SystemExit("Visual fixture does not match this PDF edition")
    rows=json.loads(args.review.read_text())
    by_id={row["id"]:row for row in rows}
    counts=Counter()
    for key,expected in fixture["labels"].items():
        row=by_id.get(key)
        if not row:
            counts["not_evaluated"]+=1
        elif row["selected"] is None:
            counts["abstained"]+=1
        elif list(row["selected"])==expected:
            counts["agrees"]+=1
        else:
            counts["disagrees"]+=1
            print("REVIEW DISAGREEMENT:",key,"expected:",expected,"candidate:",row["selected"])
    print("PROVISIONAL VISUAL CHECK:",json.dumps({"total":len(fixture["labels"]),**counts}))
    print("These labels are provisional; this is not an accuracy estimate for the entire PDF.")

if __name__=="__main__":
    main()
