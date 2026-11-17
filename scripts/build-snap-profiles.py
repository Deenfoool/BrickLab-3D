"""Translate pinned LDraw / LDCad cylinders to the BrickLab axial connector catalog."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from math import dist, hypot, isfinite
from pathlib import Path
import re
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = '24366c8f0782a65d6138f41d593300b079859cb1'
SHADOW = 'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec'
OPENINGS = {'none': 3, 'A': 2, 'B': 1, 'two': 0}
TECHNIC = {'R', 'A', 'L'}
# Two round holes on the train connecting rod. The center and the two slots
# in LDraw 4586.dat are elongated apertures, without a round seating surface.
OVERRIDES = {
    '4586': [
        {'gender': 'F', 'caps': 'none', 'start': [0, -5, z], 'dir': [0, 1, 0],
         'secs': [{'shape': 'R', 'radius': 8, 'length': 2},
                  {'shape': 'R', 'radius': 6, 'length': 6},
                  {'shape': 'R', 'radius': 8, 'length': 2}]}
        for z in (-80, 80)
    ],
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def near(a, b):
    return abs(a - b) <= .025


def normalize(vector):
    length = hypot(*vector)
    return tuple(round(n / length, 6) or 0 for n in vector)


def encode_number(n):
    return int(n) if isinstance(n, float) and n.is_integer() else n


def classify(cylinder, title):
    sections = cylinder['secs']
    gender = cylinder['gender']
    caps = cylinder['caps']
    opening = (2 if gender == 'M' else 1) if caps == 'one' else OPENINGS.get(caps)
    if not opening or not sections or any(
        not isfinite(s['radius']) or not isfinite(s['length']) or s['radius'] <= 0 or s['length'] <= 0
        for s in sections
    ):
        return None
    shapes = {s['shape'] for s in sections}
    first = sections[0]

    def has(shape, radius):
        return any(s['shape'] == shape and near(s['radius'], radius) for s in sections)

    is_duplo = title.lower().startswith('duplo ')
    if is_duplo:
        if shapes == {'A'} and has('A', 9) and cylinder.get('ref'):
            return ('duplo-axle' if gender == 'M' else 'duplo-key'), opening
        if gender == 'F' and opening == 3 and shapes == {'R'} and has('R', 9) and all(
            9 <= s['radius'] <= 12 for s in sections
        ):
            return 'duplo-bearing', opening
        if gender == 'M' and caps == 'one' and len(sections) == 1 and has('R', 12) and near(first['length'], 11):
            return 'duplo-stud', opening
        if gender == 'F' and opening != 3 and len(sections) == 1 and has('R', 12) and first['length'] >= 11:
            return 'duplo-anti-stud', opening
        if gender == 'M' and has('R', 9) and shapes <= {'R', 'L'} and max(s['radius'] for s in sections) <= 12:
            return 'duplo-pin', opening
        return None

    if len(sections) == 1 and first['shape'] == 'G' and first.get('teeth', 0) > 0:
        if first.get('spur', True) and not any(k in first for k in ('rack', 'worm', 'crown')):
            return 'gear', 0
    if gender == 'F':
        if shapes <= {'R', 'A'} and has('A', 6) and all(near(s['radius'], 6) for s in sections):
            if cylinder.get('ref'):
                return ('key' if opening == 3 else 'blind-key'), opening
        if shapes == {'R'} and has('R', 6) and all(6 <= s['radius'] <= 8 for s in sections):
            if opening == 3 or len(sections) > 1:
                return 'bearing', opening
        if opening != 3 and len(sections) == 1 and (has('R', 6) or has('S', 6)):
            if 4 <= first['length'] <= 8:
                return 'anti-stud', opening
        if shapes == {'R'} and all(near(s['radius'], 4) for s in sections):
            if len(sections) == 1 and opening != 3 and near(first['length'], 4):
                return 'hollow-stud', opening
            return 'rod-bore', opening
    else:
        friction = re.search(r'\bwith friction\b|\bfriction ridges?\b', title, re.I)
        pin_tip = any(s['shape'] == 'L' and 6 <= s['radius'] <= 6.5 for s in sections)
        if shapes <= TECHNIC and has('A', 6) and cylinder.get('ref') and all(
            (s['shape'] != 'A' or near(s['radius'], 6)) and s['radius'] <= 8 for s in sections
        ):
            if pin_tip and has('R', 6):
                return ('friction-axle-pin' if friction else 'axle-pin'), opening
            return 'axle', opening
        if shapes <= {'R', 'L'} and has('R', 6) and pin_tip and all(6 <= s['radius'] <= 8 for s in sections):
            return ('friction-pin' if friction else 'pin'), opening
        if opening != 3 and len(sections) == 1 and has('R', 6) and near(first['length'], 4):
            return 'stud', opening
        if shapes == {'R'} and all(near(s['radius'], 4) for s in sections):
            if len(sections) == 1 and opening != 3 and near(first['length'], 4):
                return 'stud-pin', opening
            if sum(s['length'] for s in sections) >= 8:
                return 'rod', opening
    return None


def adapt(cylinder, title, role=None):
    result = (role, 3) if role else classify(cylinder, title)
    if result is None or hypot(*cylinder['dir']) < .999:
        return None
    role, openings = result
    gender = cylinder['gender']
    axis = normalize(cylinder['dir'])
    start = tuple(cylinder['start'])
    sections = tuple((s['shape'], s['radius'], s['length'], s.get('teeth')) for s in cylinder['secs'])
    ref = normalize(cylinder['ref']) if cylinder.get('ref') and hypot(*cylinder['ref']) > .999 else None
    # Canonicalize two-sided cylinders so inherited clips and bores can be deduplicated.
    if openings == 3 and next(n for n in axis if n) < 0:
        span = sum(s[2] for s in sections)
        start = tuple(round(a + b * span, 3) or 0 for a, b in zip(start, axis))
        axis = tuple(-n or 0 for n in axis)
        sections = sections[::-1]
    # Keep a keyed roll reference and rely on the existing perpendicular default for round profiles.
    if not any(s[0] in {'A', 'S'} for s in sections):
        ref = None
    point = tuple(encode_number(n) for n in (*start, *axis))
    return (role, gender, openings, sections), point, ref


def endpoints(port):
    spec, point, _ = port
    length = sum(s[2] for s in spec[3])
    start, axis = point[:3], point[3:]
    return start, tuple(p + a * length for p, a in zip(start, axis))


def unique_ports(ports):
    unique = {}
    for port in ports:
        spec, point, _ = port
        key = (spec[0], spec[1], point)
        previous = unique.get(key)
        if previous:
            # Prefer the smaller access region for conflicting declarations of one opening.
            def clearance(spec):
                return (spec[2].bit_count(),
                        sum(section[2] for section in spec[3]),
                        sum(section[1] * section[2] for section in spec[3]))
            if clearance(previous[0]) <= clearance(spec):
                continue
        unique[key] = port

    ports = list(unique.values())
    for port in ports:
        spec, point, _ = port
        if spec[0] in {'bearing', 'rod-bore'}:
            start, end = endpoints(port)
            size = dist(start, end)
            axis = point[3:]
            shadowed = False
            # At a coaxial opening use the enclosing profile with its counterbores.
            for other in ports:
                if other[0][0] != spec[0] or other[1][3:] != axis:
                    continue
                other_start, other_end = endpoints(other)
                width = dist(other_start, other_end)
                delta = [x - y for x, y in zip(start, other_start)]
                along = sum(x * y for x, y in zip(delta, axis))
                if width > size + .02 and along >= -.01 and along + size <= width + .01 and \
                        dist(delta, [along * v for v in axis]) <= .01:
                    shadowed = True
                    break
            if shadowed:
                continue
        yield port


def wheel_data(archive, upstream, designs):
    """Record real rim/tyre pairs and their pose from LDraw wheel assembly shortcuts."""
    cylinders = {}
    for design in designs:
        ports = [upstream['cylinders'][index] for index in upstream['parts'].get(design + '.dat', [])]
        seats = [port for port in ports if [s['shape'] for s in port['secs']] == ['T']]
        if len(seats) == 1:
            seat = seats[0]
            role = 'rim-seat' if seat['gender'] == 'M' else 'tyre-seat'
            if pose := adapt(seat, '', role):
                cylinders[design] = pose

    def world(port, values):
        matrix = [values[3:6], values[6:9], values[9:12]]
        point = port[1]
        return (
            [t + sum(u * n for u, n in zip(row, point[:3])) for t, row in zip(values[:3], matrix)],
            [sum(u * n for u, n in zip(row, point[3:])) for row in matrix],
        )

    pairs = defaultdict(set)
    with ZipFile(archive) as catalog:
        for name in catalog.namelist():
            if not re.fullmatch(r'ldraw/parts/[^/]+\.dat', name, re.I):
                continue
            with catalog.open(name) as file:
                title = file.readline().decode('utf-8', errors='replace')
                if not re.search(r'\b(?:wheel|rim)\b.*\bwith (?:[\w/-]+ ){0,3}(?:tyre|tire)\b', title, re.I):
                    continue
                rows = [row.decode('utf-8', errors='replace').strip().split(maxsplit=14) for row in file]
            refs = [(row[14].lower().removesuffix('.dat'), [float(v) for v in row[2:14]])
                    for row in rows if row and row[0] == '1' and len(row) == 15]
            if len(refs) != 2 or any(design not in cylinders for design, _ in refs):
                continue
            a, b = sorted(refs, key=lambda ref: cylinders[ref[0]][0][0])
            rim, tyre = cylinders[a[0]], cylinders[b[0]]
            if rim[0][0] != 'rim-seat' or tyre[0][0] != 'tyre-seat':
                continue
            start_m, axis_m = world(rim, a[1])
            start_f, axis_f = world(tyre, b[1])
            alignment = sum(x * y for x, y in zip(axis_m, axis_f))
            if abs(abs(alignment) - 1) > .0001:
                continue
            delta = [m - f for m, f in zip(start_m, start_f)]
            offset = sum(x * y for x, y in zip(delta, axis_f))
            if dist(delta, [offset * n for n in axis_f]) > .01:
                continue
            direction = 1 if alignment > 0 else -1
            pairs[(a[0], b[0])].add((round(offset, 3) or 0, direction))

    rim_mates = defaultdict(dict)
    used = set()
    for (rim, tyre), poses in sorted(pairs.items()):
        # Conflicting assembly records do not establish a unique seat.
        if len(poses) == 1:
            rim_mates[rim][tyre] = poses.pop()
            used.update([rim, tyre])
    return {design: cylinders[design] for design in used}, dict(rim_mates)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('upstream', type=Path)
    parser.add_argument('archive', type=Path, help='LDraw complete.zip used to build the parts index')
    args = parser.parse_args()
    upstream = read(args.upstream)
    index = read(ROOT / 'catalog/parts-library.json')
    curated = read(ROOT / 'catalog/technic.json')
    if sha256(args.archive.read_bytes()).hexdigest() != index['source']['sha256']:
        parser.error('LDraw archive does not match the parts index')
    wheel_designs = {design for section in index['sections'] for design, group, *_ in section['parts']
                     if group == 'wheels'}
    wheel_ports, rim_mates = wheel_data(args.archive, upstream, wheel_designs)
    specs = {}
    locations = {}
    registry = {}
    coverage = Counter()
    missing_beams = []
    for section in index['sections']:
        for design, group, title, _, _ in sorted(section['parts']):
            if design in curated or design in registry:
                coverage[group] += 1
                continue
            cylinders = [upstream['cylinders'][i] for i in upstream['parts'].get(design + '.dat', [])]
            cylinders += OVERRIDES.get(design, [])
            ports = list(unique_ports(port for c in cylinders if (port := adapt(c, title))))
            if design in wheel_ports:
                ports.append(wheel_ports[design])
            if not ports:
                if group == 'beams':
                    missing_beams.append((design, title, [c['secs'] for c in cylinders]))
                continue
            coverage[group] += 1
            records = []
            for spec, point, ref in ports:
                type_index = specs.setdefault(spec, len(specs))
                loc = (point, ref)
                loc_index = locations.setdefault(loc, len(locations))
                # Save geometric keys rather than upstream indices, which move between releases.
                key = sha256(json.dumps((spec[0], spec[1], point), separators=(',', ':')).encode()).hexdigest()[:12]
                if any(row[0] == key for row in records):
                    raise ValueError(f'Duplicate endpoint key on {design}: {key}')
                records.append([key, type_index, loc_index])
            registry[design] = records
    output = {'source': SOURCE, 'shadow': SHADOW, 'ldraw': index['source']['release'],
              'types': list(specs), 'locations': list(locations), 'rimMates': rim_mates}
    # Keep one location or profile per line for review.
    def encode(value):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

    lines = []
    for key, value in output.items():
        encoded = '[\n' + ',\n'.join(map(encode, value)) + '\n]' if isinstance(value, list) else encode(value)
        lines.append(encode(key) + ':' + encoded)
    (ROOT / 'catalog/snap-profiles.json').write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8')
    part_lines = ',\n'.join(encode(design) + ':' + encode(ports)
                            for design, ports in registry.items())
    (ROOT / 'catalog/snap-parts.json').write_text('{\n' + part_lines + '\n}\n', encoding='utf-8')
    print(dict(coverage), f'{sum(coverage.values())} designs, {sum(map(len, rim_mates.values()))} rim/tyre pairs')
    for row in missing_beams:
        print(row)


if __name__ == '__main__':
    main()
