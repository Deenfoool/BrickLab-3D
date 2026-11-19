"""Translate pinned LDraw / LDCad cylinders to the BrickLab axial connector catalog."""
import argparse
from collections import Counter, defaultdict
from functools import lru_cache
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
ANCHORS = {'ball', 'ball-socket', 'plug', 'receptacle', 'pivot', 'clip'}
LABELED = {'techFlexEnd', 'rim8_6'}
GROUP_MALE = {'ball': 'ball-socket', 'plug': 'receptacle', 'pivot': 'clip', 'labeled-pin': 'labeled-bore'}
# Two round holes on the train connecting rod. The center and the two slots
# in LDraw 4586.dat are elongated apertures, without a round seating surface.
OVERRIDES = {
    '32198b': [{'gender': 'F', 'caps': 'none', 'start': [0, 0, -7], 'dir': [0, 0, 1], 'ref': [1, 0, 0],
                'secs': [{'shape': 'A', 'radius': 6, 'length': 7},
                         {'shape': 'R', 'radius': 9, 'length': 3}]}],
    't1114': [{'gender': 'M', 'caps': 'none', 'start': [0, 0, 0], 'dir': [1, 0, 0], 'ref': [0, 1, 0],
               'secs': [{'shape': 'A', 'radius': 6, 'length': 16},
                        {'shape': 'R', 'radius': 5, 'length': 3},
                        {'shape': 'A', 'radius': 6, 'length': 16}]}],
    't1115': [{'gender': 'M', 'caps': 'none', 'start': [0, 0, 0], 'dir': [1, 0, 0], 'ref': [0, 1, 0],
               'secs': [{'shape': 'A', 'radius': 6, 'length': 4},
                        {'shape': 'R', 'radius': 5, 'length': 3},
                        {'shape': 'A', 'radius': 6, 'length': 11},
                        {'shape': 'R', 'radius': 5, 'length': 3},
                        {'shape': 'A', 'radius': 6, 'length': 4}]}],
    '6615': [{'gender': 'M', 'caps': 'A', 'start': [0, 0, 10], 'dir': [0, 0, 1], 'ref': [1, 0, 0],
              'secs': [{'shape': 'A', 'radius': 6, 'length': 40}]}],
    '2405': [{'gender': 'M', 'caps': 'A', 'start': [0, 0, 10], 'dir': [0, 0, 1], 'ref': [1, 0, 0],
              'secs': [{'shape': 'A', 'radius': 6, 'length': 60}]}],
    '4192': [{'gender': 'M', 'caps': 'A', 'start': [0, 0, -20], 'dir': [0, 0, -1], 'ref': [1, 0, 0],
              'secs': [{'shape': 'A', 'radius': 6, 'length': 30}]}],
    '8168': [{'gender': 'M', 'caps': 'none', 'start': [-35, 0, 0], 'dir': [1, 0, 0], 'ref': [0, 1, 0],
              'secs': [{'shape': 'A', 'radius': 6, 'length': 68},
                       {'shape': 'R', 'radius': 8, 'length': 2}]}],
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
    if not sections or any(
        not isfinite(s['radius']) or not isfinite(s['length']) or s['radius'] <= 0 or s['length'] <= 0
        for s in sections
    ):
        return None
    shapes = {s['shape'] for s in sections}
    first = sections[0]

    group = cylinder.get('group')
    if shapes == {'O'} and len(sections) == 1 and first['radius'] <= 26 and group not in {'pfLight', 'diffHouse'}:
        return ('ball' if gender == 'M' else 'ball-socket'), 1
    if shapes == {'K'} and len(sections) == 1 and cylinder.get('ref'):
        return ('clutch-driver' if gender == 'M' else 'clutch-face'), 1 if gender == 'F' else 3
    if shapes == {'Q'} and group and cylinder.get('ref'):
        return ('plug' if gender == 'M' else 'receptacle'), 1
    if group in {'uniJnt', 'technicChain'} and shapes == {'R'} and len(sections) == 1:
        return ('pivot' if gender == 'M' else 'clip'), 1
    if group == 'techWhlCon1' and shapes == {'A'} and cylinder.get('ref'):
        return ('plug' if gender == 'M' else 'receptacle'), 1
    if opening and group in LABELED and shapes == {'R'}:
        return ('labeled-pin' if gender == 'M' else 'labeled-bore'), opening
    if cylinder.get('tube'):
        return 'tube-end', 1
    if not opening:
        return None

    def has(shape, radius):
        return any(s['shape'] == shape and near(s['radius'], radius) for s in sections)

    is_duplo = title.lower().startswith('duplo ')
    if is_duplo:
        if shapes <= {'A', 'R'} and has('A', 9) and cylinder.get('ref') and (
            gender == 'F' or shapes == {'A'}
        ):
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
        if shapes <= {'R', 'A'} and has('A', 6) and all(s['radius'] >= 5.975 and (s['shape'] == 'R' or near(s['radius'], 6)) for s in sections):
            if cylinder.get('ref'):
                return ('key' if opening == 3 else 'blind-key'), opening
        if shapes <= {'R', 'S'} and has('R', 6) and all(6 <= s['radius'] <= 8 for s in sections):
            if opening == 3 or len(sections) > 1:
                return 'bearing', opening
        if opening != 3 and len(sections) == 1 and (has('R', 6) or has('S', 6)):
            if 4 <= first['length'] <= 8:
                return 'anti-stud', opening
        if title.startswith('Wheel') and shapes == {'R'} and has('R', 4) and all(
            4 <= section['radius'] <= 6 for section in sections
        ) and any(not near(section['radius'], 4) for section in sections):
            return 'wheel-bearing', opening
        if shapes == {'R'} and all(near(s['radius'], 4) for s in sections):
            if len(sections) == 1 and opening != 3 and near(first['length'], 4):
                return 'hollow-stud', opening
            return 'rod-bore', opening
    else:
        friction = re.search(r'\bwith friction\b|\bfriction ridges?\b', title, re.I)
        pin_tip = any(s['shape'] == 'L' and 6 <= s['radius'] <= 6.5 for s in sections)
        if opening != 3 and has('R', 4) and shapes == {'R', 'L'} and all(4 <= sector['radius'] <= 4.5 for sector in sections):
            return 'wheel-spindle', opening
        if shapes <= TECHNIC and has('A', 6) and cylinder.get('ref') and all(
            (s['shape'] != 'A' or near(s['radius'], 6)) for s in sections
        ):
            if pin_tip and has('R', 6):
                return ('friction-axle-pin' if friction else 'axle-pin'), opening
            return 'axle', opening
        if shapes <= {'R', 'L'} and has('R', 6) and pin_tip and all(6 <= s['radius'] <= 8 for s in sections):
            return ('friction-pin' if friction else 'pin'), opening
        if re.match(r'^Electric (?:Power Functions|Powered Up) Light ', title) and len(sections) == 1 and has('R', 6):
            if near(first['length'], 14):
                return 'pin', opening
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
    if role in ANCHORS and not cylinder.get('anchor'):
        start = tuple(round(a + b * sum(s[2] for s in sections) / 2, 3) or 0 for a, b in zip(start, axis))
    # Canonicalize two-sided cylinders so inherited clips and bores can be deduplicated.
    if openings == 3 and role != 'clutch-driver' and next(n for n in axis if n) < 0:
        span = sum(s[2] for s in sections)
        start = tuple(round(a + b * span, 3) or 0 for a, b in zip(start, axis))
        axis = tuple(-n or 0 for n in axis)
        sections = sections[::-1]
    # Keep a keyed roll reference and rely on the existing perpendicular default for round profiles.
    if role not in {'plug', 'receptacle'} and not any(s[0] in {'A', 'S', 'K'} for s in sections):
        ref = None
    point = tuple(encode_number(n) for n in (*start, *axis))
    group = cylinder.get('group') if role in ANCHORS or role.startswith('labeled-') else None
    pneumatic = (role == 'rod' and openings == 2 and title.startswith('Pneumatic') and
                 'Piston' not in title and sum(section[2] for section in sections) <= 18)
    return (role, gender, openings, sections, group, cylinder.get('slot'), pneumatic, cylinder.get('legacy', False)), point, ref


def endpoints(port):
    spec, point, _ = port
    length = sum(s[2] for s in spec[3])
    start, axis = point[:3], point[3:]
    return start, tuple(p + a * length for p, a in zip(start, axis))


def unique_ports(ports):
    unique = {}
    for port in ports:
        spec, point, _ = port
        key = (spec[0], spec[1], spec[4], point)
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


def part_refs(data):
    for line in data.splitlines():
        values = line.split(maxsplit=14)
        if len(values) == 15 and values[0] == '1':
            yield values[14].lower().replace('\\', '/'), [float(value) for value in values[2:14]]


def cylinder(gender, caps, start, direction, shape, radius, length, **options):
    return {'gender': gender, 'caps': caps, 'start': start, 'dir': direction,
            'secs': [{'shape': shape, 'radius': radius, 'length': length}], **options}


# Male component, female component, LDraw assembly and the optional shared physical slot.
# These are adjacent components of the hardware, confirmed in the actual shortcut.
CONTACTS = [
    ('24849c01', '24852c01', '22167', 'battery-tray'),
    ('24853', '24852c01', '22167', 'battery-cover'),
    ('80737', '24852c02', '85825', 'battery-cover'),
    ('99143', '99141c01', '95646', 'ev3-battery'),
    ('95656', '99141c01', '95646c01', 'ev3-battery'),
    ('76609', '76607c01', '72156', 'battery-cover'),
    ('11237', '76607c01', '72156', 'channel-selector'),
    ('99386', '99385c01', '95648', 'switch'),
    ('66757', '67351', '67351c01', 'hub-battery'),
    ('45610', '45601', '45601c01', 'hub-battery'),
    ('u9467c01', 'u9470c01', '37316', 'front'),
    ('35538c01', '35533c01', '28739', 'control'),
    ('u9386', 'u9384c02', 'u9384c01', 'output'),
    ('65413', '65414', '65414c01', 'differential-ring'),
    ('2815', '4185b', '4185bc01', 'belt-tyre'),
    ('2815', '4185a', '4185ac01', 'belt-tyre'),
    ('2705', '2701', '2701c01', 'bearing-pin'),
    ('2708', '2707', '2698c01', 'hair'),
    ('2701c01', '2700', '2698c01', 'arm-bearing'),
    ('2701c01', '2699c01', '2698c01', 'body-bearing'),
    ('2700', '2702', '2698c01', 'hand'),
    ('99948', '92911', '92911c01', 'ball-castor'),
]
SPRINGS = [
    ('22020', '76320', ('32181c05', '32183c02')),
    ('u9411', '95292', ('2909', '2910')),
    ('41355', '41475', ('2909', '2910')),
    ('u9410', '75348', ('2909', '2910')),
    ('u9409', '74741', ('2909', '2910')),
    ('80028', '79717p04', ('80022', '80021')),
    ('u9562', '79717p04', ('80022', '80021')),
]


def assembly_ports(archive):
    """Convert reviewed direct subpart poses to pair-specific local datum frames."""
    contacts = CONTACTS.copy()
    for spring, assembly, ends in SPRINGS:
        for state in ('f1', 'f2'):
            for end, body in enumerate(ends):
                slot = 'fake-spring' if spring == '80028' else 'spring'
                contacts.append((f'{spring}-{state}', body, f'{assembly}-{state}', f'{slot}-{end}'))

    def axes(transform):
        return [world_vector(transform, vector) for vector in ([1, 0, 0], [0, -1, 0], [0, 0, 1])]

    def rigid(transform):
        x, y, z = axes(transform)
        d = x[0] * (y[1] * z[2] - y[2] * z[1]) + x[1] * (y[2] * z[0] - y[0] * z[2]) + x[2] * (y[0] * z[1] - y[1] * z[0])
        return abs(d + 1) <= .0001 and all(abs(hypot(*axis) - 1) <= .0001 for axis in (x, y, z))

    ports = defaultdict(list)
    for male, female, assembly, slot in contacts:
        data = archive.read(f'ldraw/parts/{assembly}.dat').decode(errors='replace')
        refs = defaultdict(list)
        for name, transform in part_refs(data):
            if name in {male + '.dat', female + '.dat'} and rigid(transform):
                refs[name.removesuffix('.dat')].append(transform)
        if not refs[male] or not refs[female]:
            continue
        group = f'assembly:{male}:{female}:{slot}'
        for socket in refs[female]:
            nearby = sorted(refs[male], key=lambda shaft: dist(socket[:3], shaft[:3]))
            if slot != 'control' and len(refs[female]) > 1:
                nearby = nearby[:1]
            for shaft in nearby:
                pos = [a - b for a, b in zip(shaft[:3], socket[:3])]
                mate_start = [round(value, 3) for value in local_vector(socket, pos)]
                aligned = lambda vector: normalize(local_vector(socket, world_vector(shaft, vector)))
                # Slots at the same anchor on spring/axle variants share occupancy.
                unique_slot = slot if slot != 'control' else f'{slot}:{mate_start}'
                radius = 22.5 if slot == 'ball-castor' else 1
                shape = 'O' if slot == 'ball-castor' else 'Q'
                span = radius * 2 if shape == 'O' else 1
                ports[male].append(cylinder('M', 'none', [0, 0, 0], [0, -1, 0], shape, radius, span,
                                            group=group, ref=[1, 0, 0], anchor=True, slot=slot))
                ports[female].append(cylinder('F', 'none', mate_start, aligned([0, -1, 0]), shape, radius, span,
                                              group=group, ref=aligned([1, 0, 0]), anchor=True, slot=unique_slot))
    return ports


def geometry_ports(design, title, cylinders, archive):
    result = OVERRIDES.get(design, []).copy()
    if title.startswith('Pneumatic Tube') and design.endswith('-f1'):
        geometry = archive.read(f'ldraw/parts/{design}.dat').decode(errors='replace')
        for name, transform in part_refs(geometry):
            if name == '71533k02.dat':
                axis = [transform[i] for i in (4, 7, 10)]
                # 71533k02 gives the mouth and inner radius. The following tube section is flexible.
                result.append(cylinder('F', 'one', transform[:3], axis, 'R', 3, 14, tube=True))
    if title.startswith('Axle Flexible'):
        for source in cylinders:
            sections = source['secs']
            if len(sections) == 3 and [section['radius'] for section in sections] == [4, 6, 4]:
                # faxle1–5 are the cross-shaped body segments; the solid tips are round bars.
                result.append({**source, 'ref': [0, 1, 0],
                               'secs': [sections[0], {**sections[1], 'shape': 'A'}, sections[2]]})
                span = sum(section['length'] for section in sections)
                # The two round tips can be mounted independently of the keyed center.
                for edge, direction in [(source['start'], [1, 0, 0]),
                    ([source['start'][0] + span, *source['start'][1:]], [-1, 0, 0])]:
                    tip = [a + 20 * b for a, b in zip(edge, direction)]
                    result.append(cylinder('M', 'one', tip, [-a for a in direction], 'R', 4, 20))
    if design == '22678':
        geometry = archive.read(f'ldraw/parts/{design}.dat').decode(errors='replace')
        for name, transform in part_refs(geometry):
            if name == '71944k01.dat':
                axis = [-transform[i] for i in (4, 7, 10)]
                start = [point - 2.5 * inward for point, inward in zip(transform[:3], axis)]
                result.append(cylinder('F', 'one', start, axis, 'R', 4, 10))
    for source in cylinders:
        sections = source['secs']
        if (source['gender'] == 'F' and source['caps'] == 'none' and source.get('ref') and
                [section['shape'] for section in sections] == ['A', 'R', 'A'] and
                [section['radius'] for section in sections] == [6, 3, 6]):
            x, y, z = source['start']
            direction = source['dir']
            distal = [a + b * sum(section['length'] for section in sections)
                      for a, b in zip((x, y, z), direction)]
            result.extend([
                cylinder('F', 'one', source['start'], direction, 'A', 6, sections[0]['length'], ref=source['ref']),
                cylinder('F', 'one', distal, [-n for n in direction], 'A', 6, sections[-1]['length'], ref=source['ref']),
            ])
    if design in {'3711', '14696', '3249'}:
        # Both sides of the clip grip the same crossbar, so give each end a single pivot.
        for gender, z in [('F', 0), ('M', 16)]:
            result.append(cylinder(gender, 'none', [0, 0, z], [1, 0, 0], 'R', 1.5, 20,
                                   group='technicChain', anchor=True))
    return result


def primitive_holes(archive):
    """Read explicit LDraw Technic bore primitives and paired mouths."""
    names = set(archive.namelist())
    peg_mouths = {'peghole.dat', 'peghole5.dat'}
    standard = peg_mouths | {'connhole.dat', 'connhol3.dat'}
    bore_widths = {
        ('peghole.dat', 'peghole.dat'): (10, 20),
        ('connhol3.dat', 'connhol3.dat'): (40,),
        ('peghole.dat', 'peghole5.dat'): (20,),
    }

    @lru_cache
    def collect(name):
        if name in standard:
            return [(name, [0, 0, 0], [0, 1, 0])]
        path = f'ldraw/parts/{name}'
        if path not in names:
            return []
        result = []
        for child, transform in part_refs(archive.read(path).decode(errors='replace')):
            axes = [world_vector(transform, vector) for vector in ([1, 0, 0], [0, 1, 0], [0, 0, 1])]
            if any(abs(hypot(*axis) - 1) > .0001 for axis in axes):
                continue
            for label, point, direction in collect(child):
                result.append((label, world_point(transform, point), normalize(world_vector(transform, direction))))
        return result

    def as_ports(design, include_split=False):
        declared = collect(design + '.dat')
        # 4526 was checked against the full cylinder between its two mouth primitives.
        allowed = peg_mouths if design == '4526' else {'peghole.dat'}
        mouths = [(kind, start, axis) for kind, start, axis in declared if kind in allowed]
        spans = [(list(a - 10 * b for a, b in zip(start, axis)), axis, 20)
                 for kind, start, axis in declared if kind == 'connhole.dat']
        if include_split:
            mouths += [(kind, [p - 10 * n for p, n in zip(start, axis)], axis)
                       for kind, start, axis in declared if kind == 'connhol3.dat']
        for index, (kind, start, axis) in enumerate(mouths):
            for other_kind, other, direction in mouths[index + 1:]:
                # An extended mouth lines up with a standard mouth on 1L bores
                # opening into the windows of alternate-hole frames.
                widths = bore_widths.get(tuple(sorted((kind, other_kind))), ())
                if not widths or dist(axis, [-n for n in direction]) > .001:
                    continue
                delta = [b - a for a, b in zip(start, other)]
                span = sum(a * b for a, b in zip(delta, axis))
                if dist(delta, [span * n for n in axis]) > .01:
                    continue
                width = next((value for value in widths if abs(span - value) <= .01), None)
                if width:
                    spans.append((start, axis, width))
        return [
            {'gender': 'F', 'caps': 'none', 'start': start, 'dir': axis,
             'secs': [{'shape': 'R', 'radius': radius, 'length': length}
                      for radius, length in ([(8, 2), (6, 16), (8, 4), (6, 16), (8, 2)]
                                             if span == 40 else [(8, 2), (6, span - 4), (8, 2)])]}
            for start, axis, span in spans
        ]

    return as_ports


def overlapping_bores(measured, existing):
    spec, point, _ = existing
    if spec[0] not in {'bearing', 'key', 'blind-key', 'rod-bore', 'wheel-bearing', 'labeled-bore'}:
        return False
    start, end = endpoints(measured)
    a, b = endpoints(existing)
    axis = measured[1][3:]
    if abs(sum(x * y for x, y in zip(axis, point[3:]))) < .9999:
        return False
    delta = [x - y for x, y in zip(a, start)]
    along = sum(d * n for d, n in zip(delta, axis))
    if dist(delta, [along * n for n in axis]) > .01:
        return False
    far = sum((x - y) * n for x, y, n in zip(b, start, axis))
    lo, hi = sorted((along, far))
    return min(hi, dist(start, end)) - max(lo, 0) > .01


def merge_round_bores(existing, measured):
    result = list(existing)
    for bore in measured:
        matches = [i for i, port in enumerate(result) if overlapping_bores(bore, port)]
        if not matches:
            result.append(bore)
        for i in matches:
            spec, point, ref = result[i]
            # Opposing mouths can complete a one-sided shadow profile without moving its datum.
            direct = dist(point, bore[1]) <= .01 and spec[3] == bore[0][3]
            reverse = (dist(endpoints(result[i])[1], bore[1][:3]) <= .01 and
                       dist(point[3:], [-n for n in bore[1][3:]]) <= .001 and spec[3] == bore[0][3][::-1])
            if spec[0] == 'bearing' and spec[2] != 3 and (direct or reverse):
                result[i] = ((*spec[:2], 3, *spec[3:]), point, ref)
    return result


def match_signature(port):
    spec, _, _ = port
    role, gender, _, sections, group, _, _, _ = spec
    if role not in ANCHORS and not role.startswith('labeled-'):
        return None
    family = role if gender == 'M' else next(male for male, female in GROUP_MALE.items() if female == role)
    size = sections[0][1] if family in {'ball', 'pivot', 'labeled-pin'} else None
    width = sections[0][2] if family == 'pivot' else None
    return family, group, size, width


def remove_internal_ports(ports):
    ports = list(ports)
    for port in ports:
        spec, point, _ = port
        signature = match_signature(port)
        if signature and any(
            mate[0][1] != spec[1] and match_signature(mate) == signature and
            dist(point[:3], mate[1][:3]) <= .02
            for mate in ports
        ):
            continue
        yield port


def local_vector(transform, vector):
    # Rigid type-1 LDraw matrices use the inverse rotation transpose here.
    return [sum(transform[3 + 3 * row + column] * vector[row] for row in range(3)) for column in range(3)]


def world_vector(transform, vector):
    return [sum(a * b for a, b in zip(transform[i:i + 3], vector)) for i in (3, 6, 9)]


def world_point(transform, point):
    return [a + b for a, b in zip(transform[:3], world_vector(transform, point))]


def wheel_data(archive, upstream, designs):
    """Record real rim/tyre pairs and their pose from LDraw wheel assembly shortcuts."""
    cylinders = {}
    for design, title in designs.items():
        ports = [upstream['cylinders'][index] for index in upstream['parts'].get(design + '.dat', [])]
        seats = [port for port in ports if [s['shape'] for s in port['secs']] == ['T']]
        if len(seats) == 1:
            seat = seats[0]
            role = 'rim-seat' if seat['gender'] == 'M' else 'tyre-seat'
            if pose := adapt(seat, '', role):
                cylinders[design] = pose
        elif not seats and re.match(r'^(?:Wheel Rim|Wheel \d)', title):
            cylinders[design] = None

    def world(port, values):
        point = port[1]
        return world_point(values, point[:3]), world_vector(values, point[3:])

    evidence = []
    with ZipFile(archive) as catalog:
        for name in catalog.namelist():
            if not re.fullmatch(r'ldraw/parts/[^/]+\.dat', name, re.I):
                continue
            with catalog.open(name) as file:
                title = file.readline().decode('utf-8', errors='replace')
                if not re.search(r'\b(?:wheel|rim)\b.*\bwith (?:[\w/-]+ ){0,3}(?:tyre|tire)\b', title, re.I):
                    continue
                refs = [(ref.removesuffix('.dat'), matrix)
                        for ref, matrix in part_refs(file.read().decode('utf-8', errors='replace'))]
            rims = [(part, matrix) for part, matrix in refs if part in cylinders and (
                cylinders[part] is None or cylinders[part][0][0] == 'rim-seat')]
            tyres = [(part, matrix) for part, matrix in refs if cylinders.get(part) and
                     cylinders[part][0][0] == 'tyre-seat']
            if len(rims) == len(tyres) == 1:
                evidence.append((rims[0], tyres[0]))

    def measure(rim, tyre, rim_matrix, tyre_matrix):
        start_m, axis_m = world(rim, rim_matrix)
        start_f, axis_f = world(tyre, tyre_matrix)
        alignment = sum(x * y for x, y in zip(axis_m, axis_f))
        if abs(abs(alignment) - 1) > .0001:
            return None
        delta = [m - f for m, f in zip(start_m, start_f)]
        offset = sum(x * y for x, y in zip(delta, axis_f))
        if dist(delta, [offset * n for n in axis_f]) > .01:
            return None
        return round(offset, 3) or 0, 1 if alignment > 0 else -1

    # Keep existing rim coordinates whenever the original measured axis agrees with a real assembly.
    valid_axes = set()
    for (rim, m), (tyre, f) in evidence:
        if cylinders[rim] and measure(cylinders[rim], cylinders[tyre], m, f):
            valid_axes.add(rim)
    for (rim, m), (tyre, f) in evidence:
        if rim in valid_axes:
            continue
        tyre_seat = cylinders[tyre]
        origin, axis = world(tyre_seat, f)
        delta = [a - b for a, b in zip(origin, m[:3])]
        position = [round(value, 3) for value in local_vector(m, delta)]
        direction = normalize(local_vector(m, axis))
        section = tyre_seat[0][3][0]
        snap = cylinder('M', 'none', position, direction, 'T', section[1], section[2])
        if rim_seat := adapt(snap, '', 'rim-seat'):
            cylinders[rim] = rim_seat
            valid_axes.add(rim)

    pairs = defaultdict(set)
    for (rim, m), (tyre, f) in evidence:
        if cylinders[rim] and (fit := measure(cylinders[rim], cylinders[tyre], m, f)):
            pairs[(rim, tyre)].add(fit)

    rim_mates = defaultdict(dict)
    used = set()
    for (rim, tyre), poses in sorted(pairs.items()):
        # Conflicting assembly records do not establish a unique seat.
        if len(poses) == 1:
            rim_mates[rim][tyre] = poses.pop()
            used.update([rim, tyre])
    # Both variants share the inner bead profile and its position in the LDraw geometry.
    for variant, original in [('44771', '56907'), ('4410', '54120')]:
        for rim, mates in rim_mates.items():
            if original in mates and variant not in mates and cylinders.get(variant):
                mates[variant] = mates[original]
                used.add(variant)
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
    wheel_designs = {design: title for section in index['sections'] for design, _, title, *_ in section['parts']}
    wheel_ports, rim_mates = wheel_data(args.archive, upstream, wheel_designs)
    parts = sorted(row for section in index['sections'] for row in section['parts'])
    groups = defaultdict(set)
    by_design = {}
    measured_bores = {}
    with ZipFile(args.archive) as archive:
        contacts = assembly_ports(archive)
        fallback = primitive_holes(archive)
        for design, group, title, _, _ in parts:
            if design in curated:
                continue
            cylinders = [upstream['cylinders'][i] for i in upstream['parts'].get(design + '.dat', [])]
            cylinders += geometry_ports(design, title, cylinders, archive) + contacts.get(design, [])
            legacy = []
            for i, prior in enumerate(cylinders):
                if prior.get('group') != 'uniJnt' or prior['gender'] != 'F' or prior['caps'] != 'none':
                    continue
                sections = prior['secs']
                if len(sections) != 1 or sections[0]['shape'] != 'R' or sections[0]['radius'] != 6:
                    continue
                mid = [round(point + axis * sections[0]['length'] / 2, 3) or 0
                       for point, axis in zip(prior['start'], prior['dir'])]
                slot = 'universal-yoke:' + ','.join(map(str, mid))
                cylinders[i] = {**prior, 'slot': slot}
                if port := adapt({**prior, 'slot': slot, 'legacy': True}, title, 'bearing'):
                    legacy.append(port)
            ports = list(remove_internal_ports(unique_ports(port for c in cylinders if (port := adapt(c, title)))))
            if design in wheel_ports:
                ports.append(wheel_ports[design])
            if not ports:
                ports = list(unique_ports(port for c in fallback(design) if (port := adapt(c, title))))
            by_design[design] = list(unique_ports([*ports, *legacy]))
            structural = group in {'beams', 'pins'} or title.startswith((
                'Beam ', 'Cross Block ', 'Connector ', 'Brick ', 'Steering Portal Axle Frame'))
            # 4586 has a decorative round mouth in the center of an elongated slot.
            if structural and design != '4586':
                measured_bores[design] = list(unique_ports(
                    port for c in fallback(design, include_split=True) if (port := adapt(c, title))))
            for port in ports:
                if signature := match_signature(port):
                    groups[signature].add(port[0][1])

    specs = {}
    locations = {}
    registry = {}
    coverage = Counter()

    def record(port):
        spec, point, ref = port
        type_index = specs.setdefault(spec, len(specs))
        loc = (point, ref)
        loc_index = locations.setdefault(loc, len(locations))
        # Save geometric keys rather than upstream indices, which move between releases.
        identity = (spec[0], spec[1], point) if spec[4] is None else (spec[0], spec[1], point, spec[4])
        key = sha256(json.dumps(identity, separators=(',', ':')).encode()).hexdigest()[:12]
        return [key, type_index, loc_index]

    for design, group, _, _, _ in parts:
        if design in curated or design in registry:
            coverage[group] += 1
            continue
        ports = [port for port in by_design[design]
                 if not match_signature(port) or groups[match_signature(port)] == {'M', 'F'}]
        if not ports:
            continue
        coverage[group] += 1
        records = [record(port) for port in ports]
        if len({entry[0] for entry in records}) != len(records):
            raise ValueError(f'Duplicate endpoint key on {design}')
        registry[design] = records
        by_design[design] = ports

    # Add verified geometry after encoding shadow data to keep its profile indexes stable.
    for design, measured in measured_bores.items():
        if design in registry:
            registry[design] = [record(port) for port in merge_round_bores(by_design[design], measured)]
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


if __name__ == '__main__':
    main()
