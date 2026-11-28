#!/usr/bin/env python3
"""Offline recovery of missing callouts using repeated artwork and independent inventory evidence.
Outputs unreviewed candidates and a local visual review sheet. Never modifies the published catalog.
"""
import argparse
import hashlib
import html
import io
import json
import runpy
import base64
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from PIL import Image
import pymupdf as fitz

root=Path(__file__).resolve().parent
e=runpy.run_path(root/"experiment-instruction-recovery.py")
b=e["b"]

def bounds_overlap(a,c):
    return (a&c).get_area()/max(1e-9,min(a.get_area(),c.get_area()))

def match_caption(box, captions):
    candidates=[]
    for i,c in enumerate(captions):
        x,y,right,bottom=c[:4]
        height=max(3,bottom-y)
        dx=min(abs(x-box.x0),abs((x+right)/2-(box.x0+box.x1)/2)+1)
        gap=y-box.y1
        if dx<=max(5,height*.75) and -max(3,height*.45)<=gap<=max(12,height*1.6):
            candidates.append((dx*2+abs(gap),i))
    candidates.sort()
    if not candidates or len(candidates)>1 and candidates[1][0]-candidates[0][0]<1.5:return None
    return candidates[0][1]

def missing_artwork(page,words,images,existing):
    captions=b["text_boxes"](words,b["QUANTITY"])
    occupied={i for _,box,*_ in existing if (i:=match_caption(box,captions)) is not None}
    # Use the same light callout frames as the original extractor; never select
    # a large assembly image or a previously assigned overlapping region.
    frames=[]
    for path in page.get_drawings():
        rect,fill=path["rect"],path.get("fill")
        if (fill and min(fill)>=.8 and max(fill)-min(fill)<.08
            and 25<=rect.width<=.7*page.rect.width and 18<=rect.height<=.55*page.rect.height
            and page.rect.contains(rect) and b["is_rectangular_path"](path["items"],rect)):
            frames.append(rect)
    found=[]
    for i,c in enumerate(captions):
        if i in occupied:continue
        frame=min((f for f in frames if f.contains(fitz.Rect(c[:4]))),key=lambda f:f.get_area(),default=None)
        if frame is None:continue
        options=[]
        for xref,raw in images:
            box=fitz.Rect(raw)
            if not frame.contains(box) or box.width<5 or box.height<3 or box.get_area()>.6*frame.get_area():continue
            if any(bounds_overlap(box,other)>.3 for _,other,*_ in [*existing,*found]):continue
            if match_caption(box,captions)!=i:continue
            dx=min(abs(c[0]-box.x0),abs((c[0]+c[2])/2-(box.x0+box.x1)/2)+1)
            options.append((dx*2+abs(c[1]-box.y1),xref,box))
        options.sort(key=lambda t:t[0])
        if not options or len(options)>1 and options[1][0]-options[0][0]<2:continue
        _,xref,box=options[0]
        found.append((xref,box,c[4],False,(),None))
    return found

def digest(pdf,xref,cache):
    if not xref:return None
    if xref not in cache:
        try:
            # Include the soft mask: equal RGB streams with different transparency
            # are not equivalent artwork.
            raw=pdf.extract_image(xref)
            if not raw or not raw.get("image"):return None
            mask=raw.get("smask",0)
            alpha=pdf.extract_image(mask) if mask else None
            cache[xref]=hashlib.sha256(raw["image"]+(alpha["image"] if alpha else b"")).hexdigest()
        except (RuntimeError,ValueError,KeyError):
            cache[xref]=None
    return cache[xref]

def repeat_candidate(sample,key,seeds,refs):
    if sample is None or not key or key not in seeds:return None
    entries=seeds[key]
    identities={item for item,_,_ in entries}
    if len(identities)!=1 or len({page for _,page,_ in entries})<2:return None
    item=next(iter(identities))
    for _,_,other in entries:
        f=e["features"](sample,other)
        if f is None:return None
        pixel,shape,color,ink,ratio=f
        if pixel>.045 or shape>.2 or color>.08 or ink>.12 or ratio>.15:return None
    # Independent inventory comparison must favor the same identity.
    by_item={}
    for ref in refs:
        f=e["features"](sample,ref["sample"])
        if f is None:continue
        by_item[ref["item"]]=min(by_item.get(ref["item"],float("inf")),f[0])
    rank=sorted((v,k) for k,v in by_item.items())
    if len(rank)<2 or rank[0][1]!=item or rank[0][0]>.085 or rank[1][0]-rank[0][0]<.006:return None
    return item

def img_uri(sample):
    if sample is None:return ""
    image=Image.fromarray(np.uint8(np.clip(sample[0],0,1)*255)).resize((100,100))
    out=io.BytesIO();image.save(out,format="PNG")
    return "data:image/png;base64,"+base64.b64encode(out.getvalue()).decode("ascii")

def review_html(rows,path):
    lines=["<!doctype html><meta charset='utf-8'><title>BrickLab recognition review</title>",
           "<style>body{font:15px system-ui;margin:24px;color:#18212b} article{display:flex;gap:16px;align-items:center;border-bottom:1px solid #ddd;padding:12px} img{width:100px;height:100px;object-fit:contain} small{color:#555}</style>",
           "<h1>Unreviewed part matches</h1><p>Compare the page crop against the illustrated inventory. These are candidates, not verified identities.</p>"]
    for row in rows:
        label=html.escape(str(row["item"]))
        lines.append(f'<article><div><b>Page {row["page"]}</b><br>{html.escape(row["reason"])}<br>{label}</div><img alt="Page artwork" src="{img_uri(row["sample"])}"><img alt="Inventory artwork" src="{img_uri(row["reference"])}"></article>')
    path.write_text("\n".join(lines),encoding="utf-8")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("pdf","elements","baseline","previous","output"):
        parser.add_argument("--"+name,type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    baseline=json.loads(args.baseline.read_text())
    previous=json.loads(args.previous.read_text())
    pdf,pages=b["read_book"](args.pdf)
    refs,inventory_pages,report=e["references"](pdf,pages,e["d"]["load_local_elements"](args.elements))
    seeds=defaultdict(list);cache={};parts=[];missing=0
    for page_no,(words,images,_) in enumerate(pages):
        if page_no in inventory_pages or not images:continue
        page=pdf[page_no];key=str(page_no+1);display=page.get_displaylist(annots=False)
        base={tuple(r[:4]):tuple(r[4:6]) for r in baseline.get(key,[])}
        old={tuple(r[:4]):tuple(r[4:6]) for r in previous.get(key,[])}
        existing=list(b["step_artwork"](page,words,images))
        extra=missing_artwork(page,words,images,existing)
        missing+=len(extra)
        for index,(xref,box,quantity,isolated,neighbors,badge) in enumerate([*existing,*extra]):
            region=b["normalized_box"](box,page.rect)
            sample=b["template"](display,box,neighbors)
            art=digest(pdf,xref,cache) if isolated and not neighbors else None
            if tuple(region) in base and art and sample is not None:
                seeds[art].append((base[tuple(region)],page_no+1,sample))
            parts.append((key,region,sample,art,old.get(tuple(region)),index>=len(existing)))
    combined={key:list(rows) for key,rows in previous.items()}
    added=Counter();review=[]
    for key,region,sample,art,old,is_new in parts:
        # Preserve existing candidates, but include them in the visual review.
        item,reason=old,"previous experiment"
        if item and any(tuple(r[:4])==tuple(region) for r in baseline.get(key,[])):continue
        if not item:
            if is_new:
                item,reason,_=e["recover"](sample,refs)
                if item:reason="new callout / "+reason
            else:
                item=repeat_candidate(sample,art,seeds,refs)
                reason="repeated artwork + inventory"
            if not item:continue
            if any(bounds_overlap(fitz.Rect(region[0],region[1],region[0]+region[2],region[1]+region[3]),
                    fitz.Rect(r[0],r[1],r[0]+r[2],r[1]+r[3]))>.65 for r in combined.get(key,[])):continue
            combined.setdefault(key,[]).append([*region,*item]);added[reason]+=1
        matches=[ref["sample"] for ref in refs if ref["item"]==item and sample is not None]
        reference=min(matches,key=lambda s:float(np.mean(np.abs(sample[0]-s[0]))),default=None)
        review.append({"page":key,"item":item,"reason":reason,"sample":sample,"reference":reference})
    report.update({"previous_candidates":sum(map(len,previous.values())),"additional_candidates":sum(added.values()),
                   "combined_candidates":sum(map(len,combined.values())),"mapped_pages":len(combined),
                   "newly_located_callouts":missing,"repeated_artwork_groups":len(seeds),"reasons":dict(added)})
    b["save_map"](args.output/"candidate-parts-by-page.json",combined)
    (args.output/"comparison.json").write_text(json.dumps(report,indent=2))
    review_html(review,args.output/"review.html")
    pdf.close()
    print("REPEAT RECOVERY:",json.dumps(report),flush=True)
    print("=== REPEAT RECOVERY COMPLETE ===",flush=True)

if __name__=="__main__":
    main()
