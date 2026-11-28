#!/usr/bin/env python3
"""Compare extra recognition candidates against an existing, unreviewed baseline.
No catalog or commerce changes. A candidate is NOT a verified part identity.
"""
import argparse
import json
import runpy
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import pymupdf as fitz

root = Path(__file__).resolve().parent
b = runpy.run_path(root / "build-instruction-part-maps.py")
d = runpy.run_path(root / "diagnose-instruction-recognition.py")

def pair_inventory_labels(ids, quantities):
    # Quantity is normally between the part drawing and its printed element ID.
    pairs = []
    for i, label in enumerate(ids):
        x, y = label[:2]
        height = max(3, label[3] - y)
        for j, q in enumerate(quantities):
            dx = abs(x-q[0])
            dy = y-q[3]
            if dx <= max(3, height*.45) and -1 <= dy <= max(12, height*1.6):
                pairs.append((dx*2+abs(dy), i, j))
    result, used = {}, set()
    for score, i, j in sorted(pairs):
        if i in result or j in used:
            continue
        if any((ii == i or jj == j) and (ii,jj)!=(i,j) and abs(other-score)<1.5
               for other,ii,jj in pairs):
            continue
        result[i]=quantities[j]
        used.add(j)
    return result

def overlap(a,c):
    intersection = (a & c).get_area()
    return intersection / max(1e-9, min(a.get_area(),c.get_area()))

def references(pdf,pages,elements):
    entries, rejected, printed, paired_total = [], 0, set(), 0
    inventory_pages=set()
    for page_no,(words,images,_) in enumerate(pages):
        ids=[w for w in b["text_boxes"](words,b["ELEMENT"]) if w[4] in elements]
        quantities=b["text_boxes"](words,b["QUANTITY"])
        if len(ids)<10 or len(quantities)<10:
            continue
        inventory_pages.add(page_no)
        printed.update(elements[w[4]] for w in ids)
        display=pdf[page_no].get_displaylist(annots=False)
        # Compare original direct-ID anchors with quantity-anchored recovery.
        direct=list(b["artwork"](ids,images,max_dx=4,min_dy=-2,max_dy=11))
        linked=pair_inventory_labels(ids,quantities)
        anchors=[(*q[:4],ids[i][4]) for i,q in linked.items()]
        via=list(b["artwork"](anchors,images,max_dx=5,min_dy=-2.5,max_dy=6))
        paired_total+=len(linked)
        for xref,box,element,isolated in [*direct,*via]:
            identity=elements[element]
            # Do not train on a crop assigned to two different inventory identities.
            if any(elements[e]!=identity and overlap(box,other)>.75 for _,other,e,_ in [*direct,*via]):
                rejected+=1
                continue
            sample=b["template"](display,box)
            if sample is None:
                continue
            entries.append({"sample":sample,"item":identity,"xref":xref if isolated else 0,
                            "origin":"direct" if any(element==e and box==other for _,other,e,_ in direct) else "quantity"})
    unique={}
    for entry in entries:
        image,aspect=entry["sample"]
        key=(entry["item"],entry["xref"],round(float(aspect),5),image.tobytes())
        unique[key]=entry
    return list(unique.values()),inventory_pages,{"printed_identities":len(printed),"paired_labels":paired_total,
        "rejected_conflicting_crops":rejected,"reference_identities":len({e["item"] for e in unique.values()}),
        "references":len(unique),"quantity_references":sum(e["origin"]=="quantity" for e in unique.values())}

def features(sample,reference):
    image,aspect=sample
    other,other_aspect=reference
    a=image.min(axis=2)<.84
    c=other.min(axis=2)<.84
    union=np.count_nonzero(a|c)
    both=a&c
    intersection=np.count_nonzero(both)
    if union<20 or intersection<15:
        return None
    ratio=abs(float(aspect-other_aspect))
    shape=1-intersection/union
    color=float(np.max(np.abs(b["visible_chroma"](image)-b["visible_chroma"](other))))
    ink_delta=float(np.mean(np.abs(image[both]-other[both])))
    pixel=float(np.mean(np.abs(image-other)))+.18*ratio
    return pixel,shape,color,ink_delta,ratio

def recover(sample,refs,xref=0):
    if sample is None or len({e["item"] for e in refs})<2:
        return None,"no-sample-or-references",[]
    by_item={}
    same_object=set()
    for entry in refs:
        f=features(sample,entry["sample"])
        if f is None: continue
        pixel,shape,color,ink,ratio=f
        # A second metric emphasizes outline and foreground instead of empty paper.
        score=.45*shape+.25*ink+.20*color+.10*ratio
        item=entry["item"]
        v=(pixel,score,f)
        old=by_item.get(item)
        if old is None or v[0]<old[0]:
            by_item[item]=v
        if xref and xref==entry["xref"] and pixel<=.045 and shape<=.22 and color<=.10 and ratio<=.18:
            same_object.add(item)
    primary=sorted((v[0],item) for item,v in by_item.items())
    secondary=sorted((v[1],item) for item,v in by_item.items())
    if len(primary)<2:
        return None,"insufficient-competitors",primary[:4]
    best,item=primary[0]
    f=by_item[item][2]
    _,shape,color,ink,ratio=f
    # Keep the original ranking threshold when the recovered inventory adds references.
    if best<=.043 and primary[1][0]-best>=.028 and shape<=.34 and color<=.12:
        return item,"expanded-inventory",primary[:4]
    if same_object=={item} and primary[1][0]-best>=.012:
        return item,"same-pdf-object-and-render",primary[:4]
    # Two distinct scores must independently favor the same identity, with separation
    # from alternatives and strict outline, color, aspect and foreground safeguards.
    if (len(secondary)>=2 and secondary[0][1]==item and best<=.068
            and primary[1][0]-best>=.014 and secondary[0][0]<=.15
            and secondary[1][0]-secondary[0][0]>=.035
            and shape<=.23 and color<=.085 and ink<=.16 and ratio<=.24):
        return item,"outline-color-consensus",primary[:4]
    return None,"ambiguous-or-different",primary[:4]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf",required=True,type=Path)
    parser.add_argument("--elements",required=True,type=Path)
    parser.add_argument("--baseline",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    elements=d["load_local_elements"](args.elements)
    baseline=json.loads(args.baseline.read_text())
    pdf,pages=b["read_book"](args.pdf)
    refs,inventory_pages,report=references(pdf,pages,elements)
    print("INVENTORY REFERENCES:",json.dumps(report),flush=True)
    combined={key:list(value) for key,value in baseline.items()}
    review=[]
    reasons=Counter()
    total_captions=0
    for page_no,(words,images,_) in enumerate(pages):
        if page_no in inventory_pages:continue
        total_captions+=len(b["text_boxes"](words,b["QUANTITY"]))
        if not images:continue
        page=pdf[page_no]
        display=page.get_displaylist(annots=False)
        key=str(page_no+1)
        original={tuple(r[:4]) for r in baseline.get(key,[])}
        accepted=set(original)
        for xref,box,quantity,isolated,neighbors,badge in b["step_artwork"](page,words,images):
            region=b["normalized_box"](box,page.rect)
            if tuple(region) in accepted:continue
            raw=b["template"](display,box)
            sample=raw
            if neighbors:
                sample=b["template"](display,box,neighbors)
                if sample is None:sample=raw
            item,reason,ranking=recover(sample,refs,xref if isolated and not neighbors else 0)
            # If cleaning changes a strong result to another identity, abstain.
            if item and neighbors and raw is not None:
                alternative,_,_=recover(raw,refs)
                if alternative and alternative!=item:item=None;reason="conflicting-views"
            reasons[reason]+=1
            review.append({"page":page_no+1,"region":region,"quantity":quantity,
                           "xref":xref,"selected":item,"reason":reason,"ranking":ranking})
            if item:
                combined.setdefault(key,[]).append([*region,*item])
                accepted.add(tuple(region))
    baseline_count=sum(map(len,baseline.values()))
    combined_count=sum(map(len,combined.values()))
    report.update({"printed_step_captions":total_captions,"baseline":baseline_count,
                   "additional_candidates":combined_count-baseline_count,"combined_candidates":combined_count,
                   "mapped_pages":len(combined),"reasons":dict(reasons)})
    b["save_map"](args.output/"candidate-parts-by-page.json",combined)
    (args.output/"additional-review.json").write_text(json.dumps(review,indent=2))
    (args.output/"comparison.json").write_text(json.dumps(report,indent=2))
    pdf.close()
    print("RECOVERY COMPARISON:",json.dumps(report),flush=True)
    print("=== RECOVERY EXPERIMENT COMPLETE ===",flush=True)

if __name__=="__main__":
    main()
