"""Build the Jeep Wrangler loading model from Philippe Hurbain's 42122 MPD.

With gltfpack 1.3 on PATH:
  blender -b -t 6 -P scripts/build-wrangler-intro.py -- 42122-1.mpd complete.zip assets/startup/jeep-wrangler.glb.gz
"""
from collections import defaultdict
from functools import lru_cache
import gzip
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
from zipfile import ZipFile

import bpy
import numpy as np

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from ldraw_example import LDrawLibrary, model_sections, refs

ldraw = runpy.run_path(str(SCRIPTS / "build-ford-intro.py"))
MODULES = {
    "chassis2": "chassis-rear", "chassis3": "drivetrain",
    "frontaxle": "front-axle", "rearaxle": "rear-axle", "steer": "steering",
    "dashboard": "dashboard", "winch": "winch", "front": "grille", "reartop": "rear-body",
    "door1": "door-right", "door2": "door-left", "reatbackseat": "rear-seats",
    "bonnet": "bonnet", "rearbump": "rear-bumper", "roof": "roof", "roofbars": "cage-front",
    "mudguard1": "fender-rear-right", "mudguard2": "fender-rear-left",
    "frontmudguard1": "fender-front-right", "frontmudguard2": "fender-front-left",
}
TIRES = {"42122 - 70695.dat", "70695.dat"}
RIM = "56145.dat"


def records(sections, section, inherited=16, point=None, basis=None, module=None):
    if point is None:
        point, basis = np.zeros(3), np.eye(3)
    for color, origin, transform, name in refs(sections[section]):
        position = point + basis @ origin
        matrix = basis @ np.array(transform).reshape(3, 3)
        finish = inherited if color == 16 else color
        if name.endswith(".ldr") and name in sections:
            group = module or MODULES[name.removeprefix("42122 - ").removesuffix(".ldr")]
            yield from records(sections, name, finish, position, matrix, group)
        else:
            yield name, str(finish), position, matrix, module


def animation_group(name, color, position, module):
    x, y, z = position
    side = "left" if x > 0 else "right"
    end = "front" if z < 0 else "rear"
    if name in TIRES or name == RIM:
        if abs(x) < 40:
            return "spare"
        wheel = f"wheel-{end}-{side}"
        return f"{wheel}-rim" if name == RIM else wheel
    if module:
        return module
    if name == "42122 - 42135.dat":
        return f"suspension-{end}-{side}"
    if y < -233 and abs(x) > 32:
        return f"cage-{side}"
    if abs(x) > 74 and y < -110:
        return f"side-{side}"
    if z < -116:
        return "chassis-front"
    if z > 120:
        return "chassis-rear"
    if y < -178 and color in {"0", "4", "14", "72"}:
        return "seats"
    return "chassis"


def build_scene(source, library):
    sections = {name.replace("\\", "/"): body
                for name, body in model_sections(source.read_text(encoding="utf-8-sig")).items()}

    @lru_cache
    def read(name):
        name = name.lower().replace("\\", "/")
        if name in sections:
            return sections[name]
        return library.read(library.resolve(name))

    mesh = ldraw["load_meshes"](read)
    surfaces = defaultdict(lambda: defaultdict(list))
    pivots = {}
    lower, upper = np.full(3, np.inf), np.full(3, -np.inf)
    part_count = 0
    for name, color, position, matrix, module in records(sections, next(iter(sections))):
        group = animation_group(name, color, position, module)
        if name in TIRES and group != "spare":
            pivots[group] = position
        reversed_winding = np.linalg.det(matrix) < 0
        for local_color, triangles in mesh(name).items():
            world = triangles @ matrix.T + position
            lower = np.minimum(lower, world.min(axis=(0, 1)))
            upper = np.maximum(upper, world.max(axis=(0, 1)))
            finish = color if local_color == "16" else local_color
            surfaces[group][finish].append(world[:, ::-1] if reversed_winding else world)
        part_count += 1

    center = (lower + upper) / 2
    center[1] = upper[1]
    scale = 4.5 / (upper[2] - lower[2])

    def to_blender(points):
        # Blender's Z-up export gives Three.js Y-up with the front facing +Z.
        return ((points - center)[..., [0, 2, 1]] * [1, 1, -1]) * scale

    colors = {color for finishes in surfaces.values() for color in finishes}
    # Preserve LDraw's aligned color table when using the common material builder.
    palette = "\n".join(f"CODE {code} VALUE {rgb}" for code, rgb in library.colors.items())
    materials = ldraw["ldraw_materials"](lambda _: palette, colors)
    for group, finishes in surfaces.items():
        axle = pivots.get(group.removesuffix("-rim"))
        pivot = to_blender(axle) if axle is not None else np.zeros(3)
        for color, batches in finishes.items():
            name = f"{group}/{color}"
            triangles = to_blender(np.concatenate(batches)) - pivot
            points, indices = np.unique(np.around(triangles.reshape(-1, 3), 5), axis=0, return_inverse=True)
            faces = indices.reshape(-1, 3)
            faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
            if not len(faces):
                continue
            surface = bpy.data.meshes.new(name)
            surface.from_pydata(points.tolist(), [], faces.tolist())
            surface.validate(clean_customdata=False)
            surface.update()
            obj = bpy.data.objects.new(name, surface)
            bpy.context.collection.objects.link(obj)
            obj.location = pivot
            obj.data.materials.append(materials[color])
            obj["animationGroup"] = group
            bpy.context.view_layer.objects.active = obj
            if len(faces) > 150:
                dissolve = obj.modifiers.new("Coplanar surfaces", "DECIMATE")
                dissolve.decimate_type = "DISSOLVE"
                dissolve.angle_limit = .025
                bpy.ops.object.modifier_apply(modifier=dissolve.name)
            bpy.ops.object.shade_smooth_by_angle(angle=.52)
    print(f"{part_count} LDraw placements in {len(surfaces)} animation groups", flush=True)


def main():
    source, library, destination = map(Path, sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with ZipFile(library) as archive:
        build_scene(source, LDrawLibrary(archive))
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "wrangler.glb"
        packed = Path(tmp) / "wrangler-packed.glb"
        bpy.ops.export_scene.gltf(filepath=str(raw), export_format="GLB", export_extras=True)
        subprocess.run(["gltfpack", "-i", str(raw), "-o", str(packed), "-si", "0.32", "-se", "0.012",
                        "-sp", "-vp", "13", "-vn", "7", "-kn", "-ke", "-cc", "-ce", "ext"], check=True)
        destination.write_bytes(gzip.compress(packed.read_bytes(), compresslevel=9, mtime=0))
    print(f"{destination}: {destination.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
