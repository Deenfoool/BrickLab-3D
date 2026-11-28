#!/usr/bin/env python3
"""Evaluate cleaned artwork matching against the prior candidate map and visual checks.
This is an offline experiment; no catalog or payment data is changed.
"""
import argparse
import json
import runpy
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
import pymupdf as fitz

root=Path(__file__).resolve().parent
e=runpy.run_path(root/"experiment-instruction-recovery.py")
b=e["b"]
SIZE=40

def components(mask):
    seen=np.zeros(mask.shape,dtype=bool)
    height,width=mask.shape
    groups=[]
    for y,x in np.argwhere(mask):
        if seen[y,x]:continue
        queue=[(int(y),int(x))]
        seen[y,x]=True
        for yy,xx in queue:
            for dy,dx in ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)):
                ny,nx=yy+dy,xx+dx
                if 0<=ny<height and 0<=nx<width and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True
                    queue.append((ny,nx))
        groups.append(np.asarray(queue,dtype=np.int32))
    return sorted(groups,key=len,reverse=True)

def cleaned_thumbnail(rgb,excluded=()):
    rgb=np.array(rgb,dtype=np.float32,copy=True)
    if rgb.ndim!=3 or rgb.shape[2]!=3 or min(rgb.shape[:2])<3:return None
    h,w=rgb.shape[:2]
    border=np.concatenate([rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]],axis=0)
    light=border[border.min(axis=1)>.58]
    if len(light)<len(border)*.25:return None
    paper=np.median(light,axis=0)
    for x,y,right,bottom in excluded:
        rgb[max(0,y):min(h,bottom),max(0,x):min(w,right)]=paper
    mask=np.linalg.norm(rgb-paper,axis=2)>.15
    groups=components(mask)
    if not groups or len(groups[0])<12:return None
    largest=groups[0]
    # Reject multi-object crops instead of pretending that the largest object
    # necessarily belongs to the caption.
    if len(groups)>1 and len(groups[1])>len(largest)*.40:return None
    keep=np.zeros(mask.shape,dtype=bool)
    keep[largest[:,0],largest[:,1]]=True
    # Keep nearby small interior details (e.g. printed decoration).
    y0,x0=largest.min(axis=0);y1,x1=largest.max(axis=0)
    for group in groups[1:]:
        a,c=group.min(axis=0);d,f=group.max(axis=0)
        if a>=y0 and d<=y1 and c>=x0 and f<=x1:
            keep[group[:,0],group[:,1]]=True
    rgb[~keep]=1
    crop=rgb[y0:y1+1,x0:x1+1]
    image=Image.fromarray(np.uint8(np.clip(crop,0,1)*255))
    image=image.resize((SIZE,SIZE),Image.Resampling.LANCZOS)
    # Printed inventory often has lower raster resolution than the steps.
    # Blur both views equally before comparing their appearance.
    image=image.filter(ImageFilter.GaussianBlur(radius=.65))
    return np.asarray(image,dtype=np.float32)/255,float(np.log(crop.shape[1]/crop.shape[0]))

def clean_crop(display,box,exclusions):
    clip=(fitz.Rect(box.x0-1,box.y0-1,box.x1+1,box.y1+.25)&display.rect)
    if clip.is_empty:return None
    scale=min(4,240/max(clip.width,clip.height))
    pix=display.get_pixmap(matrix=fitz.Matrix(scale,scale),colorspace=fitz.csRGB,clip=clip)
    image=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)/255
    excluded=[]
    for other in exclusions:
        if not clip.intersects(other):continue
        intersection=clip&other
        # A nearby caption can touch a drawing but must never erase the drawing.
        if intersection.get_area()>.32*clip.get_area():continue
        excluded.append((int(np.floor(other.x0*scale))-pix.x-1,int(np.floor(other.y0*scale))-pix.y-1,
                         int(np.ceil(other.x1*scale))-pix.x+1,int(np.ceil(other.y1*scale))-pix.y+1))
    return cleaned_thumbnail(image,excluded)

def text_exclusions(words,badges):
    return [fitz.Rect(w[:4]) for w in words if len(w)>=5]+[rect for rect,_ in badges]

def references(pdf,pages,elements):
    result=[];inventory=set()
    for i,(words,images,_) in enumerate(pages):
        ids=[w for w in b["text_boxes"](words,b["ELEMENT"]) if w[4] in elements]
        quantities=b["text_boxes"](words,b["QUANTITY"])
        if len(ids)<10 or len(quantities)<10:continue
        inventory.add(i)
        page=pdf[i];display=page.get_displaylist(annots=False)
        exclusions=text_exclusions(words,list(b["numbered_badges"](words,page.get_drawings())))
        linked=e["pair_inventory_labels"](ids,quantities)
        direct=list(b["artwork"](ids,images,max_dx=4,min_dy=-2,max_dy=11))
        via=list(b["artwork"]([(*q[:4],ids[j][4]) for j,q in linked.items()],images,max_dx=5,min_dy=-2.5,max_dy=6))
        for _,box,element,_ in direct+via:
            item=elements[element]
            if any(elements[v]!=item and e["overlap"](box,other)>.75 for _,other,v,_ in direct+via):continue
            sample=clean_crop(display,box,exclusions)
            if sample is not None:result.append({"item":item,"sample":sample})
    return result,inventory

def median_ink(image):
    ink=image[image.min(axis=2)<.82]
    return np.median(ink,axis=0) if len(ink)>10 else None

def rank_clean(sample,refs):
    if sample is None:return []
    image,aspect=sample
    color=median_ink(image)
    if color is None:return []
    best={}
    for ref in refs:
        f=e["features"](sample,ref["sample"])
        if f is None:continue
        pixel,shape,chroma,ink,ratio=f
        other=median_ink(ref["sample"][0])
        if other is None:continue
        # Preserve neutral-color distinctions as well as chroma.
        tone=float(np.max(np.abs(color-other)))
        score=.34*shape+.26*ink+.16*chroma+.14*tone+.10*ratio
        item=ref["item"]
        candidate=(float(score),item,float(pixel),float(shape),float(chroma),float(tone),float(ratio))
        if item not in best or candidate[0]<best[item][0]:best[item]=candidate
    return sorted(best.values())

def select(clean,original,refs,original_refs):
    ranked=rank_clean(clean,refs)
    if len(ranked)<2:return None,"insufficient-clean-evidence",ranked[:3]
    score,item,pixel,shape,chroma,tone,ratio=ranked[0]
    gap=ranked[1][0]-score
    # The unmodified view remains an independent veto. A close competitor
    # with a different shape/length/color is never silently discarded.
    original_rank={}
    for ref in original_refs:
        f=e["features"](original,ref["sample"]) if original is not None else None
        if f is not None:original_rank[ref["item"]]=min(original_rank.get(ref["item"],float("inf")),f[0])
    raw=sorted((v,k) for k,v in original_rank.items())
    if not raw or item not in {v[1] for v in raw[:3]}:return None,"raw-clean-disagreement",ranked[:3]
    if (score<=.17 and gap>=.027 and pixel<=.10 and shape<=.30
            and chroma<=.12 and tone<=.19 and ratio<=.26
            and original_rank[item]-raw[0][0]<=.035):
        return item,"cleaned-artwork-consensus",ranked[:3]
    return None,"ambiguous",ranked[:3]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("pdf","elements","previous","output"):
        parser.add_argument("--"+name,type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    previous=json.loads(args.previous.read_text())
    elements=e["d"]["load_local_elements"](args.elements)
    pdf,pages=b["read_book"](args.pdf)
    refs,inventory=references(pdf,pages,elements)
    original_refs,_,_=e["references"](pdf,pages,elements)
    print("CLEAN INVENTORY:",len({r["item"] for r in refs}),"identities",flush=True)
    combined={key:list(rows) for key,rows in previous.items()}
    review=[];reasons=Counter()
    for page_no,(words,images,_) in enumerate(pages):
        if page_no in inventory or not images:continue
        page=pdf[page_no];key=str(page_no+1);display=page.get_displaylist(annots=False)
        exclusions=text_exclusions(words,list(b["numbered_badges"](words,page.get_drawings())))
        occupied={tuple(r[:4]) for r in previous.get(key,[])}
        for index,(_,box,quantity,_,neighbors,_) in enumerate(b["step_artwork"](page,words,images)):
            region=b["normalized_box"](box,page.rect)
            if tuple(region) in occupied:continue
            raw=b["template"](display,box,neighbors)
            clean=clean_crop(display,box,[*exclusions,*neighbors])
            item,reason,ranking=select(clean,raw,refs,original_refs)
            reasons[reason]+=1
            review.append({"id":f"P{page_no+1:03d}-{index+1:02d}","page":page_no+1,"region":region,
                           "selected":item,"reason":reason,"ranking":ranking})
            if item:
                combined.setdefault(key,[]).append([*region,*item])
                occupied.add(tuple(region))
    previous_count=sum(map(len,previous.values()))
    combined_count=sum(map(len,combined.values()))
    report={"previous":previous_count,"additional":combined_count-previous_count,"combined":combined_count,
            "clean_reference_identities":len({r["item"] for r in refs}),"mapped_pages":len(combined),"reasons":dict(reasons)}
    b["save_map"](args.output/"candidate-parts-by-page.json",combined)
    (args.output/"additional-review.json").write_text(json.dumps(review,indent=2))
    (args.output/"comparison.json").write_text(json.dumps(report,indent=2))
    pdf.close()
    print("CLEAN RECOVERY:",json.dumps(report),flush=True)

if __name__=="__main__":
    main()
