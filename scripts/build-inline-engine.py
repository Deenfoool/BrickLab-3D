"""Build the editable 858 Inline Engine example from the attributed LDraw model."""
import argparse
import gzip
from hashlib import sha256
import json
from pathlib import Path
import runpy
import subprocess
from zipfile import ZipFile

from ldraw_example import LDrawLibrary, flatten, model_sections, supporting_ports

ROOT = Path(__file__).resolve().parents[1]
MODEL_SHA256 = '8e511f22dbe6fbe04400f1d16301c534ddd62248467814cae8aa19ff98a87ce3'
BELTS = {f'858-1 - rubberbandsquare-{i}.ldr': f'858-belt-{i}' for i in (1, 2)}
NAMES = {
    '3022': 'Пластина 2×2', '3023b': 'Пластина 1×2', '3024': 'Пластина 1×1',
    '3176': 'Пластина 2×3 с отверстием', '3456': 'Пластина 6×14',
    '3496c01': 'Опора из двух пластин 2×2', '3622': 'Кирпич 1×3', '3623': 'Пластина 1×3',
    '3665a': 'Обратный скос 1×2', '3941': 'Круглый кирпич 2×2 с отверстием под ось',
    '4032a': 'Круглая пластина 2×2 с отверстием под ось',
}
BUILDER = r"""
import fs from 'node:fs'
import { registerHooks } from 'node:module'
const url = new URL('./vendor/three/build/three.module.min.js', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? url : specifier, context)
} })
const { Matrix4, Quaternion, Vector3 } = await import('three')
const { connectAligned, createAssembly, gearPoses } = await import('./src/editor/model.js')
const { newProject } = await import('./src/projects/documents.js')
const records = JSON.parse(fs.readFileSync(0, 'utf8'))
const flip = new Matrix4().makeRotationX(Math.PI)
const parts = records.map(({ design, position, matrix, color }, index) => {
  const [a, b, c, d, e, f, g, h, i] = matrix
  const basis = new Matrix4().set(a, b, c, 0, d, e, f, 0, g, h, i, 0, 0, 0, 0, 1)
  if (Math.abs(basis.determinant() - 1) > 1e-5) throw new Error(`Non-rigid transform for ${design}`)
  const rotation = new Quaternion().setFromRotationMatrix(
    flip.clone().multiply(new Matrix4().extractRotation(basis))
  ).normalize().toArray()
  // Center the base and place the bottom of its 8 LDU plate at floor height.
  const point = new Vector3().fromArray(position).applyMatrix4(flip).add(new Vector3(-20, 8, 0))
  return { id: `858-${index + 1}`, design, position: point.toArray(), rotation, color }
})
const assembly = createAssembly(parts, [])
const connections = parts.flatMap((part, index) => connectAligned(assembly, [part], parts.slice(0, index)))
const gears = gearPoses(parts).map(({ part, center, axis }) => ({ part, center, axis }))
const project = newProject('858 Inline Engine', { parts, connections, gears })
fs.writeFileSync('examples/inline-engine.json', JSON.stringify(project) + '\n')
console.log(`${parts.length} parts, ${connections.length} validated connections, ${gears.length} gears`)
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mpd', type=Path)
    parser.add_argument('library_zip', type=Path)
    parser.add_argument('connections', type=Path, help='Kinebrick library-connections.json for supporting parts')
    args = parser.parse_args()
    if sha256(args.mpd.read_bytes()).hexdigest() != MODEL_SHA256:
        parser.error('The MPD must match the pinned 858 model.')
    index = json.loads((ROOT / 'catalog/parts-library.json').read_text())
    if sha256(args.library_zip.read_bytes()).hexdigest() != index['source']['sha256']:
        parser.error('The official LDraw archive must match the existing catalog.')
    adapter = runpy.run_path(str(ROOT / 'scripts/build-snap-profiles.py'))
    sections = model_sections(args.mpd.read_text())
    upstream = json.loads(args.connections.read_text())
    catalog = {row[0] for section in index['sections'] for row in section['parts']}
    catalog.update(json.loads((ROOT / 'catalog/dune-buggy-parts.json').read_text()))
    metadata = {}

    with ZipFile(args.library_zip) as archive:
        library = LDrawLibrary(archive)
        records = list(flatten(sections, library.colors, next(iter(sections)), [0, 0, 0], embedded=BELTS))
        for number, (file, design) in enumerate(BELTS.items(), 1):
            library.pack[f'{design}.dat'] = sections[file]
            metadata[design] = {'en': f'Drive belt {number}', 'ru': f'Приводной ремень {number}', 'ports': []}

        for design in sorted({record['design'] for record in records} - catalog - metadata.keys()):
            title = ' '.join(library.collect_design(design).split())
            metadata[design] = {'en': title, 'ru': NAMES.get(design, title),
                                'ports': supporting_ports(upstream, design, title, adapter, '858')}

    target = ROOT / 'assets/ldraw/inline-engine'
    target.mkdir(exist_ok=True)
    payload = json.dumps(library.pack, ensure_ascii=False, separators=(',', ':')).encode()
    (target / 'common.json.gz').write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    (ROOT / 'catalog/inline-engine-parts.json').write_text(
        json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    subprocess.run(['node', '--input-type=module', '-e', BUILDER], cwd=ROOT,
                   input=json.dumps(records), text=True, check=True)


if __name__ == '__main__':
    main()
