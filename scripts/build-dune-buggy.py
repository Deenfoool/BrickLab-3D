"""Build the bundled editable 8845 example from the attributed LDraw model."""
import argparse
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import runpy
import subprocess
from zipfile import ZipFile

from ldraw_example import LDrawLibrary, apply, flatten, model_sections, supporting_ports

ROOT = Path(__file__).resolve().parents[1]
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
        library = LDrawLibrary(archive)
        records = list(flatten(sections, library.colors, next(iter(sections)), [0, 0, 0],
                               embedded={SPRING_SUBMODEL: SPRING_DESIGN}))
        catalog = {row[0] for section in index['sections'] for row in section['parts']}
        missing = sorted({record['design'] for record in records} - catalog)
        metadata = {}

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
                library.pack[f'{design}.dat'] = sections[SPRING_SUBMODEL]
                en, ru = 'Shock absorber spring', 'Пружина амортизатора'
                ports = []
            else:
                en, ru = labels(library.collect_design(design), design)
                ports = supporting_ports(upstream, design, en, adapter, '8845')
                if design == '4185':
                    # Central 10 LDU axle hole in the LDraw 4185a pulley.
                    ports.append({
                        'id': 'pulley-axle-hole', 'role': 'key', 'gender': 'F',
                        'openings': ['start', 'end'], 'start': [0, 0, -5],
                        'axis': [0, 0, 1], 'reference': [1, 0, 0],
                        'sections': [{'shape': 'A', 'radius': 6, 'length': 10}], 'rotor': True,
                    })
            metadata[design] = {'en': en, 'ru': ru, 'ports': ports}

        # In the source, the front tires rest slightly above the rears.
        tire_points = library.vertices(library.resolve('3634.dat'))
        lift = max(record['position'][1] + apply(record['matrix'], vertex)[1]
                   for record in records if record['design'] == '3634' for vertex in tire_points)

    target = ROOT / 'assets/ldraw/dune-buggy'
    target.mkdir(exist_ok=True)
    payload = json.dumps(library.pack, ensure_ascii=False, separators=(',', ':')).encode()
    (target / 'common.json.gz').write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    (ROOT / 'catalog/dune-buggy-parts.json').write_text(
        json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    subprocess.run(['node', '--input-type=module', '-e', BUILDER], cwd=ROOT,
                   input=json.dumps({'records': records, 'lift': lift}), text=True, check=True)


if __name__ == '__main__':
    main()
