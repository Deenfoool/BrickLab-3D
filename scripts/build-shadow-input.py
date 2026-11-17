"""Run the pinned Kinebrick builder, retaining axial orientation and LDCad metadata."""
import argparse
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile

COMMIT = '24366c8f0782a65d6138f41d593300b079859cb1'
SHADOW = 'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec'

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('checkout', type=Path, help='Kinebrick checkout with ldraw/ and ldcad-shadow/ as documented upstream')
args = parser.parse_args()
root = args.checkout.resolve()

def head(folder):
    return subprocess.check_output(['git', '-C', str(folder), 'rev-parse', 'HEAD'], text=True).strip()

if head(root) != COMMIT or head(root / 'ldcad-shadow') != SHADOW:
    parser.error('Use Kinebrick ' + COMMIT + ' and Shadow Library ' + SHADOW)

source = root / 'scripts/build-connections.ts'
text = source.read_text()
for before, after in [
    ('import { Cylinder, Groove, Section, Slide, Vec3, normalizePartName }',
     'import { type Cylinder, type Groove, type Section, type Slide, type Vec3, normalizePartName }'),
    ('  mirrorRule: string; // none, cor', '  mirrorRule: string; // none, cor\n  ref?: Vec3;\n  group?: string;'),
    ("      id: p.get('id') ?? '',\n      gender: p.get('gender')", """      id: p.get('id') ?? '',
      group: p.get('group') ?? '',
      ref: secs.some(s => s.shape === 'A' || s.shape === 'S') ? applyMatrix(ori, [1, 0, 0]) : undefined,
      gender: p.get('gender')"""),
    ('    dir: scaleVec(along, 1 / newTotal),', """    dir: scaleVec(along, 1 / newTotal),
    ref: cyl.ref ? applyMatrix(tr.m, cyl.ref) : undefined,"""),
    ('    dir: c.dir.map(round) as Vec3,', """    dir: c.dir.map(round) as Vec3,
    ...('ref' in c && c.ref ? { ref: (c.ref as Vec3).map(round) } : {}),
    ...('group' in c && c.group ? { group: c.group } : {}),"""),
]:
    if text.count(before) != 1:
        parser.error('Unexpected upstream builder revision')
    text = text.replace(before, after)
with NamedTemporaryFile(mode='w', suffix='.ts', dir=source.parent, encoding='utf-8') as adapted:
    adapted.write(text)
    adapted.flush()
    subprocess.run(['node', adapted.name], cwd=root, check=True)
