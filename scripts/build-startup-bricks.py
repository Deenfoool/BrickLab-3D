"""Bundle the LDraw parts used to build the animated BrickLab 3D wordmark.

Usage: python3 scripts/build-startup-bricks.py complete.zip
"""
from pathlib import Path
import sys
from zipfile import ZipFile

from ldraw_example import LDrawLibrary

PARTS = ("3024", "3023b", "3623", "3710", "41539", "3005", "3004", "3622", "3010")
OUTPUT = Path(__file__).resolve().parents[1] / "assets/startup/brand-bricks.mpd"


def main():
    with ZipFile(sys.argv[1]) as archive:
        library = LDrawLibrary(archive)
        for design in PARTS:
            library.collect_design(design)
        root = ["0 FILE brand-bricks.ldr", "0 BrickLab 3D startup part library"]
        root.extend(f"1 16 0 0 0 1 0 0 0 1 0 0 0 1 {design}.dat" for design in PARTS)
        for name, body in library.pack.items():
            # Match the embedded names LDrawLoader resolves for primitives and subparts.
            root.extend((f"0 FILE {name}", "\n".join(line.rstrip() for line in body.rstrip().splitlines())))
        OUTPUT.write_text("\n".join(root) + "\n", encoding="utf-8")
        print(f"{OUTPUT.name}: {len(library.pack)} files, {OUTPUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
