#!/usr/bin/env python3
"""Build a portable visual review archive for candidate instruction maps.
Does not approve, publish, or modify any maps.
"""
import argparse
import hashlib
import json
import runpy
import zipfile
from pathlib import Path
from collections import Counter
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import pymupdf as fitz

root=Path(__file__).resolve().parent
e=runpy.run_path(root/"experiment-instruction-recovery.py")
repeat=runpy.run_path(root/"experiment-instruction-repeat.py")
b=e["b"]
font=ImageFont.load_default(size=17)
small=ImageFont.load_default(size=14)

def rank(sample,refs):
    if sample is None:return []
    best={}
    for ref in refs:
        f=e["features"](sample,ref["sample"])
        if f is None:continue
        pixel,shape,color,ink,ratio=f
        item=ref["item"]
        candidate={"item":item,"pixel":float(pixel),"shape":float(shape),"color":float(color),
                   "outline_score":float(.45*shape+.25*ink+.20*color+.10*ratio),"sample":ref["sample"]}
        if item not in best or pixel<best[item]["pixel"]:best[item]=candidate
    return sorted(best.values(),key=lambda x:x["pixel"])

def crop(page,box):
    box=fitz.Rect(box)&page.rect
    if box.is_empty:return None
    scale=min(5,400/max(box.width,box.height))
    pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=box,colorspace=fitz.csRGB,annots=False)
    return Image.frombytes("RGB",(pix.width,pix.height),pix.samples)

def thumb(sample):
    if sample is None:return None
    pixels,aspect=sample
    image=Image.fromarray(np.uint8(np.clip(pixels,0,1)*255))
    ratio=float(np.exp(np.clip(aspect,-3,3)))
    w,h=(180,max(1,round(180/ratio))) if ratio>=1 else (max(1,round(180*ratio)),180)
    return image.resize((w,h),Image.Resampling.NEAREST)

def paste(sheet,image,x,y,w,h):
    if image is None:return
    image=image.copy()
    image.thumbnail((w,h),Image.Resampling.LANCZOS)
    sheet.paste(image,(x+(w-image.width)//2,y+(h-image.height)//2))

def sheets(rows,folder,prefix):
    for offset in range(0,len(rows),6):
        group=rows[offset:offset+6]
        sheet=Image.new("RGB",(1180,70+len(group)*200),"#ffffff")
        draw=ImageDraw.Draw(sheet)
        draw.text((20,18),f"{prefix} | {offset+1}-{offset+len(group)} / {len(rows)} | UNREVIEWED",font=font,fill="#18232d")
        for i,row in enumerate(group):
            y=60+i*200
            color="#984727" if row["status"]=="unassigned" else "#31597d"
            draw.rectangle((8,y,1171,y+194),fill="#f3f5f7",outline="#d5dde5")
            draw.text((20,y+12),f'{row["id"]}  Page {row["page"]}',font=font,fill=color)
            draw.text((20,y+40),row["status"],font=small,fill=color)
            draw.text((20,y+63),f'Qty: {row.get("quantity","?")}',font=small,fill="#18232d")
            selected=row.get("selected")
            if selected:draw.text((20,y+88)," / ".join(selected),font=small,fill="#18232d")
            paste(sheet,row.get("crop"),200,y+5,224,145)
            draw.text((200,y+157),"PDF artwork",font=small,fill="#18232d")
            for j,ref in enumerate(row.get("choices",[])):
                x=440+j*242
                paste(sheet,thumb(ref["sample"]),x,y+5,228,145)
                draw.text((x,y+154)," / ".join(ref["item"]),font=small,fill="#18232d")
                draw.text((x,y+173),f'pixel {ref["pixel"]:.3f} shape {ref["shape"]:.3f}',font=small,fill="#405165")
        sheet.save(folder/f"{prefix}-{offset//6+1:02d}.png",optimize=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("pdf","elements","baseline","candidate","output"):
        parser.add_argument("--"+name,type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    baseline=json.loads(args.baseline.read_text())
    candidate=json.loads(args.candidate.read_text())
    elements=e["d"]["load_local_elements"](args.elements)
    pdf,pages=b["read_book"](args.pdf)
    refs,inventory_pages,report=e["references"](pdf,pages,elements)
    rows=[];missing=[];status_counts=Counter()
    for page_no,(words,images,_) in enumerate(pages):
        if page_no in inventory_pages:continue
        page=pdf[page_no];key=str(page_no+1);display=page.get_displaylist(annots=False)
        old={tuple(r[:4]):tuple(r[4:6]) for r in baseline.get(key,[])}
        accepted={tuple(r[:4]):tuple(r[4:6]) for r in candidate.get(key,[])}
        parts=list(b["step_artwork"](page,words,images)) if images else []
        parts+=repeat["missing_artwork"](page,words,images,parts) if images else []
        captions=b["text_boxes"](words,b["QUANTITY"])
        occupied=set()
        for i,(_,box,quantity,_,neighbors,_) in enumerate(parts):
            region=tuple(b["normalized_box"](box,page.rect))
            cap=repeat["match_caption"](box,captions)
            if cap is not None:occupied.add(cap)
            selected=accepted.get(region)
            status="baseline" if region in old else "new candidate" if selected else "unassigned"
            status_counts[status]+=1
            sample=b["template"](display,box,neighbors)
            ranked=rank(sample,refs)
            choices=ranked[:3]
            if selected and selected not in {x["item"] for x in choices}:
                assigned=next((x for x in ranked if x["item"]==selected),None)
                if assigned:choices=[assigned,*choices[:2]]
            rows.append({"id":f"P{page_no+1:03d}-{i+1:02d}","page":page_no+1,"region":region,
                         "quantity":quantity,"status":status,"selected":selected,"choices":choices,
                         "crop":crop(page,fitz.Rect(box.x0-2,box.y0-2,box.x1+2,box.y1+2))})
        for i,c in enumerate(captions):
            if i in occupied:continue
            x,y,right,bottom=c[:4]
            missing.append({"id":f"P{page_no+1:03d}-Q{i+1:02d}","page":page_no+1,
                            "quantity":c[4],"caption":c[:4],"status":"unlinked caption","selected":None,
                            "crop":crop(page,fitz.Rect(x-25,y-70,right+95,bottom+8))})
    pdf.close()
    groups={"unassigned":[r for r in rows if r["status"]=="unassigned"],
            "new":[r for r in rows if r["status"]=="new candidate"],
            "baseline":[r for r in rows if r["status"]=="baseline"],"unlinked":missing}
    for prefix,group in groups.items():sheets(group,args.output,prefix)
    def serialize(row):
        return {k:([{a:b for a,b in choice.items() if a!="sample"} for choice in v] if k=="choices" else v)
                for k,v in row.items() if k!="crop"}
    report.update({"status_counts":dict(status_counts),"unlinked_captions":len(missing),
                   "pdf_sha256":hashlib.sha256(args.pdf.read_bytes()).hexdigest()})
    data={"summary":report,"rows":[serialize(r) for r in rows+missing]}
    manifest=args.output/"review.json"
    manifest.write_text(json.dumps(data,indent=2),encoding="utf-8")
    archive=args.output/"ducati-recognition-review.zip"
    with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
        z.write(manifest,"review.json")
        z.write(args.candidate,"candidate-parts-by-page.json")
        for path in sorted(args.output.glob("*.png")):z.write(path,path.name)
    print("VISUAL REVIEW:",json.dumps(report),flush=True)
    print("ARCHIVE:",archive,"bytes:",archive.stat().st_size,flush=True)

if __name__=="__main__":
    main()
