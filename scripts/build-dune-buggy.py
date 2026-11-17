"""Build the bundled editable 8845 example from the attributed LDraw model."""
import argparse
from functools import lru_cache
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import runpy
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
IDENTITY = (1, 0, 0, 0, 1, 0, 0, 0, 1)
SPRING_SUBMODEL = '8845-shock absorber_springmesh.ldr'
SPRING_DESIGN = '8845-spring'
BUILDER = r"""
import fs from 'node:fs'
import { registerHooks } from 'node:module'
const url = new URL('./vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? url : specifier, context)
} })
const { Matrix4, Quaternion, Vector3 } = await import('three')
const { connectAligned, createAssembly, gearPoses } = await import('./src/editor/model.js')
const { worldPort } = await import('./src/editor/placement.js')
const { portsFor } = await import('./src/mechanics/catalog.js')
const { alignBuggy } = await import('./scripts/align-buggy.mjs')
const { newProject } = await import('./src/projects/documents.js')
const { records, lift } = JSON.parse(fs.readFileSync(0, 'utf8'))
const flip = new Matrix4().makeRotationX(Math.PI)
const parts = records.map(({ design, position, matrix, color }, index) => {
  const [a, b, c, d, e, f, g, h, i] = matrix
  const basis = new Matrix4().set(a, b, c, 0, d, e, f, 0, g, h, i, 0, 0, 0, 0, 1)
  const rotation = new Quaternion().setFromRotationMatrix(
    flip.clone().multiply(new Matrix4().extractRotation(basis))
  ).normalize().toArray()
  const point = new Vector3().fromArray(position).applyMatrix4(flip).add(new Vector3(-50, lift, -130))
  return { id: `8845-${index + 1}`, design, position: point.toArray(), rotation, color }
})
// Correct the source pulley's 0.025 LDU lateral offset from its shaft.
const pulley = parts.find(part => part.design === '4185')
const bore = worldPort(pulley, portsFor(pulley.design).find(port => port.id === 'pulley-axle-hole'))
const shafts = parts.filter(part => part.design === '3705')
const axle = shafts.find(part => new Vector3().fromArray(part.position).distanceTo(bore.start) < 45 &&
  Math.abs(worldPort(part, portsFor(part.design)[0]).axis.dot(bore.axis)) > .99999)
if (!axle) throw new Error('Missing pulley axle in 8845 source model')
const line = worldPort(axle, portsFor(axle.design)[0])
const delta = bore.start.sub(line.start)
const correction = delta.clone().projectOnVector(line.axis).sub(delta)
if (correction.length() > .05) throw new Error('Unexpected pulley offset in 8845 source model')
pulley.position = new Vector3().fromArray(pulley.position).add(correction).toArray()
alignBuggy(parts)
const assembly = createAssembly(parts, [])
const connections = parts.flatMap((part, index) => connectAligned(assembly, [part], parts.slice(0, index)))
const gears = gearPoses(parts).map(({ part, center, axis }) => ({ part, center, axis }))
const project = newProject('8845 Dune Buggy', { parts, connections, gears })
project.testDrive = { heading: 0, mode: 'push', driveParts: [], steering: pulley.id, invert: false }
fs.writeFileSync('examples/dune-buggy.json', JSON.stringify(project, null, 2) + '\n')
console.log(`${parts.length} parts and ${connections.length} validated connections`)
"""


def model_sections(text):
    result = {}
    for found in re.finditer(r'^0 FILE (.+)\n([\s\S]*?)(?=^0 FILE |\Z)', text, re.M):
        result[found[1].strip().lower()] = found[2]
    return result


def refs(text):
    for line in text.splitlines():
        fields = line.strip().split(maxsplit=14)
        if len(fields) == 15 and fields[0] == '1':
            yield (int(fields[1]), list(map(float, fields[2:5])), list(map(float, fields[5:14])),
                   fields[14].lower().replace('\\', '/'))


def apply(matrix, point):
    return [sum(matrix[i * 3 + j] * point[j] for j in range(3)) for i in range(3)]


def multiply(a, b):
    return [sum(a[i * 3 + k] * b[k * 3 + j] for k in range(3)) for i in range(3) for j in range(3)]


def flatten(sections, colors, name, position, matrix=IDENTITY, inherited=7):
    for color, child_pos, child_matrix, file in refs(sections[name]):
        p = [a + b for a, b in zip(position, apply(matrix, child_pos))]
        m = multiply(matrix, child_matrix)
        selected = inherited if color == 16 else color
        if file.endswith('.ldr') and file != SPRING_SUBMODEL:
            yield from flatten(sections, colors, file, p, m, selected)
        else:
            design = SPRING_DESIGN if file == SPRING_SUBMODEL else file.removesuffix('.dat')
            yield {'design': design, 'position': p, 'matrix': m, 'color': colors[selected]}


def supporting_ports(source, design, title, adapter):
    cylinders = [source['cylinders'][i] for i in source['parts'].get(design + '.dat', [])]
    adapted = []
    for cylinder in cylinders:
        sections = cylinder['secs']
        stud_cavity = (cylinder['gender'] == 'F' and cylinder['caps'] == 'one' and
                       len(sections) == 1 and sections[0]['shape'] in {'R', 'S'} and
                       sections[0]['radius'] == 6 and sections[0]['length'] >= 4)
        if stud_cavity:
            entry = adapter['adapt'](cylinder, title, 'anti-stud')
            if entry:
                spec, _, ref = entry
                point = (*cylinder['start'], *adapter['normalize'](cylinder['dir']))
                adapted.append(((spec[0], spec[1], 1, *spec[3:]), point, ref))
        elif entry := adapter['adapt'](cylinder, title):
            adapted.append(entry)
    ports = [
        {'id': f'8845-support-{index + 1}', 'role': spec[0], 'gender': spec[1],
         'openings': [[], ['start'], ['end'], ['start', 'end']][spec[2]],
         'start': point[:3], 'axis': point[3:], **({'reference': ref} if ref else {}),
         'sections': [{'shape': shape, 'radius': radius, 'length': width} for shape, radius, width, _ in spec[3]]}
        for index, (spec, point, ref) in enumerate(adapter['unique_ports'](adapted))
    ]

    if design == '4185':
        # Central 10 LDU axle hole in the LDraw 4185a pulley.
        ports.append({
            'id': 'pulley-axle-hole', 'role': 'key', 'gender': 'F', 'rotor': True, 'openings': ['start', 'end'],
            'start': [0, 0, -5], 'axis': [0, 0, 1], 'reference': [1, 0, 0],
            'sections': [{'shape': 'A', 'radius': 6, 'length': 10}],
        })
    return ports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mpd', type=Path)
    parser.add_argument('library_zip', type=Path)
    parser.add_argument('connections', type=Path, help='Kinebrick library-connections.json for supporting parts')
    args = parser.parse_args()
    index = json.loads((ROOT / 'catalog/parts-library.json').read_text())
    if sha256(args.library_zip.read_bytes()).hexdigest() != index['source']['sha256']:
        parser.error('The official LDraw archive must match the existing catalog.')
    adapter = runpy.run_path(str(ROOT / 'scripts/build-snap-profiles.py'))
    sections = model_sections(args.mpd.read_text())
    upstream = json.loads(args.connections.read_text())
    with ZipFile(args.library_zip) as archive:
        files = {entry.lower().removeprefix('ldraw/'): entry for entry in archive.namelist()}
        colors = {int(code): value for code, value in re.findall(
            r'\bCODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})', archive.read('ldraw/LDConfig.ldr').decode())}
        records = list(flatten(sections, colors, next(iter(sections)), [0, 0, 0]))
        catalog = {row[0] for section in index['sections'] for row in section['parts']}
        missing = sorted({record['design'] for record in records} - catalog)
        pack = {}
        metadata = {}

        @lru_cache(maxsize=None)
        def read(key):
            return archive.read(files[key]).decode('utf-8-sig', errors='replace').replace('\r\n', '\n')

        def resolve(name):
            return next(key for key in (f'parts/{name}', f'p/{name}') if key in files)

        def collect(key):
            file = key.split('/', 1)[1]
            name = key if file.startswith(('s/', '48/')) else file
            if name in pack:
                return
            body = read(key)
            pack[name] = body
            for _, _, _, ref in refs(body):
                collect(resolve(ref))

        def labels(name, design):
            words = re.sub(r' +', ' ', name)
            if design in {'4254', '4255', '4185'}:
                return words, {
                    '4254': 'Шток амортизатора 6,5L',
                    '4255': 'Корпус амортизатора 6,5L',
                    '4185': 'Шкив клинового ремня',
                }[design]
            localized = re.sub(r'(?<=\d) x (?=\d)', '×', words)
            for en, ru in [('Slope Brick ', 'Наклонный кирпич '), ('Plate ', 'Пластина '),
                           ('Tile ', 'Плитка '), ('Brick ', 'Кирпич '), (' with Groove', ' с пазом')]:
                localized = localized.replace(en, ru)
            return words, localized

        for design in missing:
            if design == SPRING_DESIGN:
                # This inline submodel is geometry created for Stefan Frenz's model.
                pack[f'{design}.dat'] = sections[SPRING_SUBMODEL]
                en, ru = 'Shock absorber spring', 'Пружина амортизатора'
                ports = []
            else:
                key = resolve(f'{design}.dat')
                collect(key)
                title = read(key).splitlines()[0].removeprefix('0 ').lstrip('~')
                if title.startswith('Moved to '):
                    title = read(resolve(title.removeprefix('Moved to ').lower() + '.dat')).splitlines()[0][2:]
                en, ru = labels(title, design)
                ports = supporting_ports(upstream, design, en, adapter)
            metadata[design] = {'en': en, 'ru': ru, 'ports': ports}

        @lru_cache(maxsize=None)
        def vertices(key):
            data = read(key)
            result = []
            for line in data.splitlines():
                fields = line.split()
                if fields and fields[0] in ('3', '4'):
                    values = list(map(float, fields[2:]))
                    result.extend(values[i:i + 3] for i in range(0, len(values), 3))
            for _, point, transform, ref in refs(data):
                result.extend([a + b for a, b in zip(point, apply(transform, vertex))]
                              for vertex in vertices(resolve(ref)))
            return result

        # In the source, the front tires rest slightly above the rears.
        tire_points = vertices(resolve('3634.dat'))
        lift = max(record['position'][1] + apply(record['matrix'], vertex)[1]
                   for record in records if record['design'] == '3634' for vertex in tire_points)

    target = ROOT / 'assets/ldraw/dune-buggy'
    target.mkdir(exist_ok=True)
    payload = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode()
    (target / 'common.json.gz').write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    (ROOT / 'catalog/dune-buggy-parts.json').write_text(
        json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    subprocess.run(['node', '--input-type=module', '-e', BUILDER], cwd=ROOT,
                   input=json.dumps({'records': records, 'lift': lift}), text=True, check=True)


if __name__ == '__main__':
    main()
