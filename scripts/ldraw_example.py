"""LDraw import helpers shared by the bundled examples."""
from functools import lru_cache
import re

IDENTITY = (1, 0, 0, 0, 1, 0, 0, 0, 1)


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


def flatten(sections, colors, name, position, matrix=IDENTITY, inherited=7, embedded=None):
    embedded = embedded or {}
    for color, child_pos, child_matrix, file in refs(sections[name]):
        p = [a + b for a, b in zip(position, apply(matrix, child_pos))]
        m = multiply(matrix, child_matrix)
        selected = inherited if color == 16 else color
        if file in sections and file not in embedded:
            yield from flatten(sections, colors, file, p, m, selected, embedded)
        else:
            design = embedded.get(file, file.removesuffix('.dat'))
            yield {'design': design, 'position': p, 'matrix': m, 'color': colors[selected]}


def supporting_ports(source, design, title, adapter, prefix):
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
    return [
        {'id': f'{prefix}-support-{index + 1}', 'role': spec[0], 'gender': spec[1],
         'openings': [[], ['start'], ['end'], ['start', 'end']][spec[2]],
         'start': point[:3], 'axis': point[3:], **({'reference': ref} if ref else {}),
         'sections': [{'shape': shape, 'radius': radius, 'length': width} for shape, radius, width, _ in spec[3]]}
        for index, (spec, point, ref) in enumerate(adapter['unique_ports'](adapted))
    ]


class LDrawLibrary:
    def __init__(self, archive):
        self.archive = archive
        self.files = {entry.lower().removeprefix('ldraw/'): entry for entry in archive.namelist()}
        self.colors = {int(code): value for code, value in re.findall(
            r'\bCODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})', archive.read('ldraw/LDConfig.ldr').decode())}
        self.pack = {}
        self.read = lru_cache(maxsize=None)(self.read)
        self.vertices = lru_cache(maxsize=None)(self.vertices)

    def read(self, key):
        return self.archive.read(self.files[key]).decode('utf-8-sig', errors='replace').replace('\r\n', '\n')

    def resolve(self, name):
        for key in (f'parts/{name}', f'p/{name}'):
            if key in self.files:
                return key
        raise KeyError(f'LDraw file not found: {name}')

    def collect(self, key):
        file = key.split('/', 1)[1]
        name = key if file.startswith(('s/', '48/')) else file
        if name in self.pack:
            return
        body = self.read(key)
        self.pack[name] = body
        for _, _, _, ref in refs(body):
            self.collect(self.resolve(ref))

    def collect_design(self, design):
        key = self.resolve(f'{design}.dat')
        self.collect(key)
        title = self.read(key).splitlines()[0].removeprefix('0 ').lstrip('~')
        while title.startswith('Moved to '):
            key = self.resolve(title.removeprefix('Moved to ').lower() + '.dat')
            title = self.read(key).splitlines()[0].removeprefix('0 ').lstrip('~')
        return title

    def vertices(self, key):
        data = self.read(key)
        result = []
        for line in data.splitlines():
            fields = line.split()
            if fields and fields[0] in ('3', '4'):
                values = list(map(float, fields[2:]))
                result.extend(values[i:i + 3] for i in range(0, len(values), 3))
        for _, point, transform, ref in refs(data):
            result.extend([a + b for a, b in zip(point, apply(transform, vertex))]
                          for vertex in self.vertices(self.resolve(ref)))
        return result
