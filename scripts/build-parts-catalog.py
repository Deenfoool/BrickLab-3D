"""Generate BrickLab's parts index and local model packs from LDraw complete.zip."""
import argparse
from collections import Counter, defaultdict
from functools import lru_cache
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ('beams', 'Балки и рамы', 'Beams & frames', r'beam|liftarm|frame|brick|plate'),
    ('axles', 'Оси и втулки', 'Axles & bushes', r'axle flexible|flexible axle|^(?:technic )?(?:axle(?: [0-9]| with| threaded)|bush)'),
    ('pins', 'Штифты и соединители', 'Pins & connectors', r'pin|connector|joiner|cross block'),
    ('gears', 'Шестерни и трансмиссия', 'Gears & drivetrain', r'gear|differential|transmission|clutch|pulley|driving ring|belt'),
    ('joints', 'Шарниры и подвеска', 'Joints & suspension', r'joint|hinge|suspension|steering|shock absorber|turntable|spindle|towball|spring'),
    ('wheels', 'Колёса и гусеницы', 'Wheels & tracks', r'wheel|tyre|tire|track|chain tread|chain link|rim'),
    ('pneumatics', 'Пневматика и актуаторы', 'Pneumatics & actuators', r'pneumatic|actuator|hose|cylinder|pump|valve'),
    ('panels', 'Панели и кузов', 'Panels & bodywork', r'panel|fairing|mudguard|windscreen|cockpit'),
    ('power', 'Моторы и электроника', 'Motors & electronics', r'^electric|motor|battery|power functions|mindstorms|powered up|control\+|control plus|spike prime'),
    ('other', 'Прочие детали', 'Other parts', r'.'),
]
GROUP_PRIORITY = ['power', 'pneumatics', 'panels', 'gears', 'joints', 'wheels', 'axles', 'beams', 'pins', 'other']

SYSTEM_GROUPS = [
    ('plates', 'Пластины', 'Plates'),
    ('slopes', 'Скосы', 'Slopes'),
]

TITLES = [
    ('Electric Control+ Hub', 'Хаб Control+'),
    ('Electric Mindstorms EV3', 'Электроника Mindstorms EV3'),
    ('Electric Mindstorms NXT', 'Электроника Mindstorms NXT'),
    ('Electric Mindstorms RCX', 'Электроника Mindstorms RCX'),
    ('Electric Mindstorms', 'Электроника Mindstorms'),
    ('Electric Power Functions', 'Электроника Power Functions'),
    ('Electric Powered Up', 'Электроника Powered Up'),
    ('Electric Spike Prime', 'Электроника SPIKE Prime'),
    ('Electric Technic', 'Электроника Technic'),
    ('Action Figure', 'Фигурка Technic'),
    ('Brake Disc', 'Тормозной диск'),
    ('Cable', 'Кабель'),
    ('Cylinder', 'Цилиндр'),
    ('Fairing', 'Обтекатель'),
    ('Flexible Hose', 'Гибкая трубка'),
    ('Hose', 'Трубка'),
    ('Large Wheel Hub', 'Большая ступица'),
    ('Motor', 'Мотор'),
    ('Propeller', 'Пропеллер'),
    ('Rotation Joint Disk', 'Диск поворотного шарнира'),
    ('Sheet Plastic Technic Panel', 'Гибкая панель Technic'),
    ('Sprocket', 'Ведущая звёздочка'),
    ('Tread', 'Звено гусеницы'),
    ('Winch', 'Лебёдка'),
    ('Axle and Pin Connector Hub', 'Комбинированный соединитель осей и штифтов'),
    ('Axle and Pin Connector', 'Соединитель осей и штифтов'),
    ('Axle Flexible', 'Гибкая ось'),
    ('Axle Joiner', 'Муфта для осей'),
    ('Axle Pin', 'Штифт-ось'),
    ('Angle Connector', 'Угловой соединитель'),
    ('Ball Joint', 'Шаровой шарнир'),
    ('Beam Bent', 'Угловая балка'),
    ('Beam Curved', 'Изогнутая балка'),
    ('Beam', 'Балка'),
    ('Brick', 'Кирпич'),
    ('Bush', 'Втулка'),
    ('Chain Link', 'Звено цепи'),
    ('Chain Tread', 'Звено гусеницы'),
    ('Connector Block', 'Соединительный блок'),
    ('Connector', 'Соединитель'),
    ('Competition Arrow', 'Стрела'),
    ('Competition Cannon', 'Пусковой механизм'),
    ('Cross Block', 'Угловой блок'),
    ('Differential', 'Дифференциал'),
    ('Disc', 'Диск'),
    ('Driving Ring', 'Муфта переключения'),
    ('Engine Crankshaft', 'Коленвал'),
    ('Engine Cylinder', 'Цилиндр двигателя'),
    ('Engine Piston', 'Поршень двигателя'),
    ('Engine', 'Двигатель'),
    ('Excavator Bucket', 'Ковш экскаватора'),
    ('Flex-System Hose', 'Трубка Flex-System'),
    ('Flex-System Pin Hole Connector', 'Соединитель Flex-System под штифт'),
    ('Frame', 'Рама'),
    ('Gear Rack', 'Зубчатая рейка'),
    ('Gear Ring', 'Зубчатый венец'),
    ('Gearbox', 'Редуктор'),
    ('Hinge Plate', 'Шарнирная пластина'),
    ('Hinge', 'Шарнир'),
    ('Hook', 'Крюк'),
    ('Linear Actuator', 'Линейный актуатор'),
    ('Link', 'Тяга'),
    ('Panel Fairing', 'Панель обтекателя'),
    ('Panel', 'Панель'),
    ('Pin Connector', 'Соединитель штифтов'),
    ('Pin Joiner', 'Муфта для штифтов'),
    ('Pin Long', 'Длинный штифт'),
    ('Pin', 'Штифт'),
    ('Plate', 'Пластина'),
    ('Slope Brick Curved', 'Изогнутый скос'),
    ('Slope Curved', 'Изогнутый скос'),
    ('Slope Brick', 'Скос'),
    ('Slope', 'Скос'),
    ('Roof', 'Крыша'),
    ('Pneumatic Cylinder', 'Пневмоцилиндр'),
    ('Pneumatic Pump', 'Пневмонасос'),
    ('Pneumatic T-Piece', 'Пневматический тройник'),
    ('Pneumatic Tube', 'Пневмотрубка'),
    ('Pneumatic Valve', 'Пневмоклапан'),
    ('Pulley', 'Шкив'),
    ('Ribbed Hose', 'Гофрированная трубка'),
    ('Shock Absorber', 'Амортизатор'),
    ('Steering Arm', 'Рулевой рычаг'),
    ('Steering Link', 'Рулевая тяга'),
    ('Steering Wheel Bearing', 'Опора рулевого вала'),
    ('Steering Wheel', 'Рулевое колесо'),
    ('Suspension Arm', 'Рычаг подвески'),
    ('Transmission Driving Ring', 'Муфта переключения передач'),
    ('Transmission', 'Трансмиссия'),
    ('Turntable', 'Поворотная платформа'),
    ('Tyre', 'Шина'),
    ('Universal Joint', 'Карданный шарнир'),
    ('Wheel Rim', 'Колёсный диск'),
    ('Wheel Spindle', 'Колёсная цапфа'),
    ('Wheel', 'Колесо'),
    ('Worm Gear', 'Червячная шестерня'),
    ('Wedge Belt Wheel', 'Шкив клинового ремня'),
    ('Axle', 'Ось'),
]
MODIFIERS = {
    'with battery holder': 'с держателем батарей',
    'battery holder': 'держатель батарей',
    'battery lid': 'крышка батарейного отсека',
    'medium motor': 'средний мотор',
    'large motor': 'большой мотор',
    'servo motor': 'сервомотор',
    'color sensor': 'датчик цвета',
    'colour sensor': 'датчик цвета',
    'touch sensor': 'датчик касания',
    'ultrasonic sensor': 'ультразвуковой датчик',
    'remote control': 'пульт управления',
    'control unit': 'блок управления',
    'with end bulges': 'с утолщениями на концах',
    'with axle holes at both ends': 'с крестовыми отверстиями по краям',
    'with alternating holes': 'с чередующимися отверстиями',
    'with friction': 'с трением',
    'without friction': 'без трения',
    'with axle hole': 'с крестовым отверстием',
    'with axlehole': 'с крестовым отверстием',
    'with pin hole': 'с отверстием под штифт',
    'with peghole': 'с отверстием под штифт',
    'with holes': 'с отверстиями',
    'with hole': 'с отверстием',
    'with open centre': 'с открытым центром',
    'damped spring': 'с демпфирующей пружиной',
    'double bevel': 'двойная коническая',
    'single bevel': 'одинарная коническая',
    'reinforced': 'усиленная',
    'liftarm': '',
    'bent': 'угловая',
    'extended': 'выдвинут',
    'retracted': 'втянут',
    'compressed': 'сжат',
    'contracted': 'втянут',
    'neutral position': 'нейтральное положение',
    'type': 'тип',
}
TITLE_LOOKUP = {name.lower(): translated for name, translated in TITLES}
TITLE_PATTERN = re.compile(
    r'^(?:' + '|'.join(map(re.escape, sorted(TITLE_LOOKUP, key=len, reverse=True))) + r')(?=\s|$)', re.I
)
MODIFIER_PATTERN = re.compile(r'\b(?:' + '|'.join(map(re.escape, sorted(MODIFIERS, key=lambda term: -len(term)))) + r')\b', re.I)
GROUP_PATTERNS = {key: re.compile(pattern, re.I) for key, _, _, pattern in GROUPS}


def localized_title(title):
    core = re.sub(r'^Technic ', '', title, flags=re.I)
    gear = re.fullmatch(r'Gear (\d+) Tooth(?: (.*))?', core, re.I)
    if gear:
        prefix, tail = f'Шестерня {gear[1]}T', gear[2] or ''
    elif match := TITLE_PATTERN.match(core):
        prefix = TITLE_LOOKUP[match[0].lower()]
        tail = core[match.end():].strip()
    else:
        return None
    tail = MODIFIER_PATTERN.sub(lambda phrase: MODIFIERS[phrase[0].lower()], tail)
    tail = re.sub(r'(?<=\d) x (?=\d)', '×', tail)
    if re.search(r'[a-zA-Z]{2}', tail):
        sizes = re.match(r'^\d[\d.×/ ]*L?\b', tail)
        if sizes:
            prefix += ' ' + sizes[0].rstrip()
        return f'{prefix} · {title}'
    return f'{prefix} {tail}'.strip()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def build(archive_path):
    source = ZipFile(archive_path)
    files = {name.lower().split('/', 1)[1]: name for name in source.namelist() if name.lower().startswith('ldraw/')}
    notes = sorted(name for name in files if re.fullmatch(r'models/note\d{4}ca\.txt', name))
    # The archive has older notes too, so compare versions after 2000 in the same YYMM format.
    version = re.search(r'(\d{2})(\d{2})ca', notes[-1])
    release = f'20{version[1]}-{version[2]}'
    ldraw = ROOT / 'assets/ldraw'
    starter_model = (ldraw / 'technic.mpd').read_text().split('\n0 FILE ', 1)[0]
    core = set(re.findall(r'^1 .+ ([^\s]+)\.dat$', starter_model, re.M))
    models = ldraw / 'technic'
    system_models = ldraw / 'system'
    for directory in (models, system_models):
        directory.mkdir(exist_ok=True)
        for old in directory.glob('*.json.gz'):
            old.unlink()

    @lru_cache
    def read(path):
        data = source.read(files[path])
        try:
            return data.decode('utf-8-sig').replace('\r\n', '\n')
        except UnicodeDecodeError:
            return data.decode('cp1252').replace('\r\n', '\n')

    @lru_cache
    def dependencies(path):
        text = read(path)
        required = set()
        for line in text.splitlines():
            fields = line.strip().split(maxsplit=14)
            if len(fields) != 15 or fields[0] != '1':
                continue
            ref = fields[-1].lower().replace('\\', '/')
            dep = next((key for key in (f'parts/{ref}', f'p/{ref}', ref) if key in files), None)
            if dep is None:
                raise ValueError(f'{path}: missing {ref}')
            required.add(dep)
        return required

    def closure(paths):
        result = set(paths)
        pending = list(paths)
        while pending:
            for dep in dependencies(pending.pop()) - result:
                result.add(dep)
                pending.append(dep)
        return result

    entries = []
    system_plates = []
    system_slopes = []
    redirects = {}
    for path in sorted(files):
        if not re.fullmatch(r'parts/[^/]+\.dat', path):
            continue
        design = Path(path).stem
        with source.open(files[path]) as file:
            header = file.read(2048).decode('utf-8-sig', errors='replace')
        first = header.splitlines()[0][2:].strip()
        title = ' '.join(first.split())
        if title.startswith(('=Plate ', '=Slope ', '~Moved to ')):
            target = re.search(r'^1 16 0 0 0 1 0 0 0 1 0 0 0 1 ([^\s/]+)\.dat\s*$', read(path), re.M | re.I)
            if target:
                redirects[design] = target[1].lower()
        category = re.search(r'^0 !CATEGORY ([^\r\n]+)', header, re.M)
        category = category[1].strip() if category else title.partition(' ')[0]
        # Plate also includes Duplo and other product lines in the LDraw index.
        if category == 'Plate' and title.startswith('Plate '):
            system_plates.append((design, 'plates', title, localized_title(title), path))
            continue
        if category == 'Slope' and not title.startswith(('~', '=', '_', 'Duplo ', 'Fabuland ', 'Quatro ')):
            system_slopes.append((design, 'slopes', title, localized_title(title), path))
            continue
        named_technic = re.search(r'\btechnic\b|power functions|mindstorms|powered up|control\+|control plus|spike prime', title, re.I)
        wheel = category in {'Wheel', 'Tyre'} and not re.search(r'\b(?:minifig|duplo|train|scala)\b', title, re.I)
        related = named_technic and category not in {'Sticker', 'Sticker Shortcut', 'Obsolete'}
        if design not in core and (title.startswith(('~', '=', '_')) or not (category == 'Technic' or related or wheel)):
            continue
        if title.startswith('~Moved to '):
            target = title.removeprefix('~Moved to ').lower()
            title = ' '.join(read(f'parts/{target}.dat').splitlines()[0][2:].split())
        group = 'wheels' if wheel else next(key for key in GROUP_PRIORITY if GROUP_PATTERNS[key].search(title))
        en = title.removeprefix('Technic ')
        entries.append((design, group, en, localized_title(title), path))
    entries.sort(key=lambda item: (GROUP_PRIORITY.index(item[1]), item[2].lower(), item[0]))

    for family in (system_plates, system_slopes):
        family.sort(key=lambda item: (item[2].lower(), item[0]))

    def write_pack(output, paths):
        # Use the same names that Three.js derives for LDraw references.
        data = {}
        for path in sorted(paths):
            file = path.split('/', 1)[-1]
            key = path if file.startswith(('s/', '48/')) else file
            data[key] = read(path)
        payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
        output.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))

    def pack_library(directory, entries, embedded=(), extra_common=(), prefix=''):
        trees = {entry[4]: closure([entry[4]]) for entry in entries if entry[0] not in embedded}
        # Share common primitives while fetching only the models in the active pack.
        counts = Counter(dep for tree in trees.values() for dep in tree)
        common = {path for path, count in counts.items() if count >= 30}
        common_pack = f'{prefix}common'
        write_pack(directory / f'{common_pack}.json.gz', common.union(extra_common))
        index = []
        batch = []
        batch_paths = set()
        pack_index = 0

        def flush():
            nonlocal pack_index, batch_paths
            if not batch:
                return
            pack_index += 1
            pack = f'{prefix}{pack_index:03}'
            if batch_paths:
                write_pack(directory / f'{pack}.json.gz', batch_paths)
            for design, group, en, ru, path in batch:
                asset = None if design in embedded else pack if trees[path] - common else common_pack
                row = [design, group, en, ru, asset]
                if prefix:
                    row.append(common_pack)
                index.append(row)
            batch.clear()
            batch_paths = set()

        for entry in entries:
            missing = trees.get(entry[4], set()) - common
            proposed = batch_paths | missing
            if batch and (len(batch) == 24 or sum(len(read(path)) for path in proposed) > 1_400_000):
                flush()
            batch.append(entry)
            batch_paths.update(missing)
        flush()
        return index

    index = pack_library(models, entries, embedded=core)
    plate_index = pack_library(system_models, system_plates, extra_common=('ldconfig.ldr',))
    slope_index = pack_library(system_models, system_slopes, extra_common=('ldconfig.ldr',), prefix='slope-')
    system_index = plate_index + slope_index
    system_designs = {design for design, *_ in system_index}
    aliases = defaultdict(list)
    for design, target in redirects.items():
        visited = {design}
        while target in redirects and target not in visited:
            visited.add(target)
            target = redirects[target]
        if target in system_designs:
            aliases[target].append(design)

    write_json(ROOT / 'catalog/parts-library.json', {
        'source': {'name': 'LDraw Parts Library', 'release': release, 'sha256': sha256(archive_path.read_bytes()).hexdigest()},
        'sections': [
            {'id': 'technic', 'ru': 'Technic', 'en': 'Technic', 'assetPath': 'technic',
             'groups': [group[:3] for group in GROUPS], 'parts': index},
            {'id': 'system', 'ru': 'System', 'en': 'System', 'assetPath': 'system',
             'revision': f'{release}-slopes',
             'groups': SYSTEM_GROUPS, 'parts': system_index, 'aliases': aliases},
        ],
    })
    print(f'{release}: {len(index)} Technic parts, {len(plate_index)} System plates, {len(slope_index)} System slopes')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('archive', type=Path, help='Official LDraw complete.zip')
    build(cli.parse_args().archive)
