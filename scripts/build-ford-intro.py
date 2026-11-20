"""Build a grouped display model from the Ford GT Studio assembly and LDraw library.

Install gltfpack 1.3.0 and make it available on PATH.
Run with Blender in background mode: blender -b -t 6 -P scripts/build-ford-intro.py
    -- 42154.io complete.zip assets/startup/ford-gt.glb.gz
"""
import gzip
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

import bpy
import numpy as np


SUBSTITUTIONS = {
    "me20a3429_2023521_010145.dat": "2405.dat",
    "me20a3429_2023521_065226.dat": "76537.dat",
    "me20a3429_2023521_123749.dat": "2509.dat",
    "me20a3429_2023521_121720.dat": "3538.dat",
    "me20a3429_2023519_114827.dat": "2442.dat",
    "me20a3429_2023519_114920.dat": "2438.dat",
    "2436c.dat": "2436b.dat",
    "62821b.dat": "62821.dat",
}
# Convert official part origins to the local coordinates of the Studio replacements.
SUBSTITUTION_POSES = {
    "me20a3429_2023521_065226.dat": ((0, 1, 2), (1, 122 / 130, 1), (0, -1220 / 13 - 240 / 13, 0)),
    "me20a3429_2023521_123749.dat": ((0, 2, 1), (-1, -1, -1), (-9.95, -110, -50)),
    "me20a3429_2023521_121720.dat": ((0, 1, 2), (1, 1, 1), (10.35, -9, -115)),
    "me20a3429_2023519_114827.dat": ((0, 1, 2), (1, -1, -1), (-20.5, 9, -39.5)),
    "me20a3429_2023519_114920.dat": ((0, 1, 2), (1, 1, 1), (20.5, -9, 39.5)),
}
PANEL_COLORS = {"272", "15"}
WHEEL_PARTS = {"41897.dat", "56908.dat"}
ENGINE_PARTS = {"2850a.dat", "2850b.dat", "2851.dat", "2852.dat", "2853.dat", "2854.dat"}


def read_archive(assembly, library):
    names = {name.lower(): name for name in library.namelist()}
    mpd = assembly.read("model.ldr", pwd=b"soho0909").decode("utf-8-sig")
    sections = {}
    for block in re.split(r"(?m)^0 FILE ", mpd)[1:]:
        name, body = block.split("\n", 1)
        sections[name.strip().lower()] = body
    root = sections.pop(next(iter(sections)))

    @lru_cache
    def read(name):
        name = name.lower().replace("\\", "/")
        if name == "softaxleendtip.dat":
            return ""  # Studio-only cosmetic cap on four already modelled flexible axles.
        if name in sections:
            return sections[name]
        name = SUBSTITUTIONS.get(name, name)
        for prefix in ("ldraw/parts/", "ldraw/p/", "ldraw/"):
            path = names.get(prefix + name)
            if path:
                return library.read(path).decode("utf-8-sig", errors="replace")
        raise ValueError(f"Missing LDraw geometry: {name}")

    return root, read


def placement(tokens):
    origin = np.array(tokens[2:5], dtype=np.float32)
    transform = np.array(tokens[5:14], dtype=np.float32).reshape(3, 3)
    return origin, transform


def load_meshes(read):
    @lru_cache
    def mesh(name):
        colors = defaultdict(list)
        clockwise = False
        invert = False
        for line in read(name).splitlines():
            tokens = line.strip().split(maxsplit=14)
            if not tokens:
                continue
            op = tokens[0]
            if op == "0" and tokens[1:2] == ["BFC"]:
                if "CW" in tokens:
                    clockwise = True
                elif "CCW" in tokens:
                    clockwise = False
                if "INVERTNEXT" in tokens:
                    invert = True
            elif op == "1":
                origin, transform = placement(tokens)
                reverse = (np.linalg.det(transform) < 0) != invert
                for color, vertices in mesh(tokens[14]).items():
                    transformed = vertices @ transform.T + origin
                    if reverse:
                        transformed = transformed[:, ::-1]
                    colors[tokens[1] if color == "16" else color].append(transformed)
                invert = False
            elif op in {"3", "4"}:
                face = np.array(tokens[2:], dtype=np.float32).reshape(-1, 3)
                if clockwise:
                    face = face[::-1]
                faces = [face[:3]] if op == "3" else [face[:3], face[[0, 2, 3]]]
                colors[tokens[1]].append(np.array(faces))
        return {color: np.concatenate(batches) for color, batches in colors.items()}

    return mesh


def assembly_group(name, color, point):
    x, y, z = point
    side = "left" if x > 20 else "right"
    end = "front" if z < -370 else "rear"
    if name in WHEEL_PARTS:
        return f"wheel-{end}-{side}"
    if name in {"76537.dat", "me20a3429_2023521_065226.dat"}:
        return f"suspension-{end}-{side}"
    if name in ENGINE_PARTS:
        return "engine"
    if color in PANEL_COLORS:
        lateral = abs(x - 20)
        if -595 < z < -255 and lateral > 108 and y < -85:
            return f"door-{side}"
        if -485 < z < -220 and y < -180:
            return "roof"
        if z < -535:
            return "bonnet"
        if z > -285 and y < -80:
            return "rear-body"
        if lateral > 103:
            return f"side-{side}"
        if y < -165:
            return "roof"
    return "chassis"


def ldraw_materials(read, colors):
    rgb = dict(re.findall(r"CODE (\d+) VALUE #([0-9A-Fa-f]{6})", read("ldconfig.ldr")))
    # Lift the navy paint slightly under the studio lighting.
    rgb.update({"272": "174888", "0": "1D2128", "256": "1A1D22", "47": "B8DBF0", "36": "DF3946"})
    materials = {}

    def linear(value):
        v = int(value, 16) / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

    for code in sorted(colors):
        shade = rgb.get(code, "8B9198")
        color = tuple(linear(shade[i:i + 2]) for i in (0, 2, 4))
        material = bpy.data.materials.new(f"LDraw {code}")
        material.diffuse_color = (*color, 1)
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*color, 1)
        shader.inputs["Roughness"].default_value = .57 if code in {"0", "256"} else .35
        shader.inputs["Metallic"].default_value = .10 if code == "272" else .04
        materials[code] = material
    return materials


def create_scene(root, read):
    mesh = load_meshes(read)
    groups = defaultdict(lambda: defaultdict(list))
    pivots = {}
    ground = 0
    for line in root.splitlines():
        tokens = line.strip().split(maxsplit=14)
        if tokens[:1] != ["1"]:
            continue
        name = tokens[14].lower()
        color = tokens[1]
        origin, transform = placement(tokens)
        group = assembly_group(name, color, origin)
        if name in SUBSTITUTION_POSES:
            axes, scales, offset = SUBSTITUTION_POSES[name]
            local = np.eye(3)[list(axes)] * np.array(scales)[:, None]
            origin = origin + transform @ offset
            transform = transform @ local
        if name == "41897.dat":
            pivots[group] = origin
        for local_color, triangles in mesh(name).items():
            world = triangles @ transform.T + origin
            if np.linalg.det(transform) < 0:
                world = world[:, ::-1]
            ground = max(ground, float(world[:, :, 1].max()))
            groups[group][color if local_color == "16" else local_color].append(world)

    def to_blender(points):
        p = points[..., [0, 2, 1]].copy()
        p[..., 2] *= -1
        return (p + [-20, 370, ground]) / 230

    materials = ldraw_materials(read, {color for batch in groups.values() for color in batch})
    for group, batch in groups.items():
        pivot = to_blender(pivots[group]) if group in pivots else np.zeros(3)
        name = group
        for color, batches in batch.items():
            triangles = to_blender(np.concatenate(batches)) - pivot
            # Weld equal vertices within each finish, preserving the material boundaries.
            vertices, ids = np.unique(np.around(triangles.reshape(-1, 3), 5), axis=0, return_inverse=True)
            faces = ids.reshape(-1, 3)
            faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 2] != faces[:, 0])]
            if not len(faces):
                continue
            surface = bpy.data.meshes.new(f"{name}/{color}")
            surface.from_pydata(vertices.tolist(), [], faces.tolist())
            surface.validate(clean_customdata=False)
            surface.update()
            obj = bpy.data.objects.new(f"{name}/{color}", surface)
            bpy.context.collection.objects.link(obj)
            obj.location = pivot
            obj.data.materials.append(materials[color])
            obj["animationGroup"] = group
            bpy.context.view_layer.objects.active = obj
            if len(faces) > 150:
                # Remove coplanar interior triangulation before lowering the detail.
                dissolve = obj.modifiers.new("Coplanar surfaces", "DECIMATE")
                dissolve.decimate_type = "DISSOLVE"
                dissolve.angle_limit = .025
                bpy.ops.object.modifier_apply(modifier=dissolve.name)
                if group == "chassis" and len(obj.data.polygons) > 4500:
                    reduce = obj.modifiers.new("Intro detail", "DECIMATE")
                    reduce.ratio = min(1, 4500 / len(obj.data.polygons))
                    bpy.ops.object.modifier_apply(modifier=reduce.name)
            bpy.ops.object.shade_smooth_by_angle(angle=.52)


def main():
    source, library, destination = map(Path, sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with ZipFile(source) as assembly, ZipFile(library) as parts:
        root, read = read_archive(assembly, parts)
        create_scene(root, read)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        glb = Path(tmp) / "ford-gt.glb"
        packed = Path(tmp) / "ford-gt-packed.glb"
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_extras=True)
        subprocess.run(["gltfpack", "-i", str(glb), "-o", str(packed), "-si", "0.26", "-se", "0.01",
                        "-sp", "-vp", "13", "-vn", "7", "-kn", "-ke", "-cc", "-ce", "ext"], check=True)
        destination.write_bytes(gzip.compress(packed.read_bytes(), compresslevel=9, mtime=0))
    print(f"{destination}: {destination.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
