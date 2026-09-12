// Presentation metadata only. Never use these classifications as connectivity evidence.
const node = (id, en, ru, children = []) => ({ id, en, ru, children })
export const FAMILIES = [
  { id:'system', name:'System', ru:'Классические кирпичи и архитектура', en:'Bricks, surfaces and architecture', icon:'blocks', color:'#e2ae65', tree:[node('bricks','Bricks','Кирпичи'),node('plates','Plates','Пластины'),node('tiles','Tiles','Тайлы'),node('slopes','Slopes','Скосы'),node('curved','Curved','Изогнутые'),node('panels','Panels','Панели'),node('hinges','Hinges','Шарниры'),node('clips','Clips / Bars','Клипы / стержни'),node('windows','Windows / Doors','Окна / двери'),node('minifig','Minifig-related','Минифигурки'),node('decorative','Decorative','Декор'),node('other','Other','Прочее')] },
  { id:'technic', name:'Technic', ru:'Механизмы, передачи и ходовая часть', en:'Mechanisms, gears and motion', icon:'cog', color:'#81d2b1', tree:[node('beams','Beams','Балки'),node('bricks','Technic Bricks','Technic-кирпичи'),node('axles','Axles','Оси'),node('pins','Pins','Пины'),node('bushes','Bushes','Втулки'),node('connectors','Connectors','Соединители'),node('gears','Gears','Шестерни',[node('spur','Spur','Цилиндрические'),node('bevel','Bevel','Конические'),node('worm','Worm','Червячные'),node('rack','Rack','Рейки')]),node('steering','Steering','Рулевое'),node('suspension','Suspension','Подвеска'),node('wheels','Wheels','Колёса',[node('tires','Tires','Шины'),node('rims','Rims','Диски'),node('hubs','Hubs','Ступицы')]),node('drivetrain','Drivetrain','Трансмиссия'),node('motors','Motors / Power','Моторы / питание'),node('other','Other','Прочее')] },
  { id:'duplo', name:'Duplo', ru:'Крупные детали для простых построек', en:'Large-scale building essentials', icon:'boxes', color:'#d9b66c', tree:[node('bricks','Bricks','Кирпичи'),node('plates','Plates / Bases','Пластины / основы'),node('figures','Figures / Animals','Фигуры / животные'),node('vehicles','Vehicles / Trains','Транспорт / поезда'),node('windows','Windows / Doors','Окна / двери'),node('other','Other','Прочее')] },
  { id:'bionicle', name:'Bionicle / CCBS', ru:'Фигуры, броня и шаровые соединения', en:'Action figures, shells and joints', icon:'bone', color:'#c5a3e5', tree:[node('limbs','Limbs / Joints','Конечности / суставы'),node('shells','Shells / Armour','Оболочки / броня'),node('heads','Heads / Masks','Головы / маски'),node('accessories','Accessories','Аксессуары'),node('other','Other','Прочее')] },
  { id:'trains', name:'Trains', ru:'Рельсы, колёсные пары и вагоны', en:'Rails, wheelsets and rolling stock', icon:'train-front', color:'#9abbe9', tree:[node('tracks','Tracks','Рельсы'),node('wheels','Wheels / Bogies','Колёса / тележки'),node('couplings','Couplings','Сцепки'),node('bodies','Bodies / Bases','Кузова / основы'),node('other','Other','Прочее')] },
  { id:'power', name:'Power / Robotics', ru:'Электромоторы, датчики и управление', en:'Motors, sensors and control', icon:'zap', color:'#e5cc7c', tree:[node('motors','Motors','Моторы'),node('sensors','Sensors','Датчики'),node('controllers','Controllers','Контроллеры'),node('power','Batteries / Cables','Батареи / кабели'),node('other','Other','Прочее')] },
  { id:'other', name:'Other', ru:'Специальные системы и редкие детали', en:'Special systems and uncommon parts', icon:'shapes', color:'#a3b1bd', tree:[node('accessories','Accessories','Аксессуары'),node('flexible','Flexible','Гибкие детали'),node('special','Special systems','Специальные системы'),node('unclassified','Unclassified','Без категории')] },
]

export function normalizeSearch(value) {
  const aliases = { 'ось':'axle','оси':'axle','осей':'axle','шестерня':'gear','шестерни':'gear','шестерёнка':'gear','шестеренка':'gear','балка':'liftarm','балки':'liftarm','beam':'liftarm','beams':'liftarm','диск':'wheel','диски':'wheel','rim':'wheel','rims':'wheel','шина':'tyre','шины':'tyre','tire':'tyre','tires':'tyre','пин':'pin','пины':'pin','кирпич':'brick','кирпичи':'brick','пластина':'plate','пластины':'plate','втулка':'bush','мотор':'motor','коническая':'bevel','рейка':'rack' }
  return String(value ?? '').toLowerCase().replace(/^ldraw-/, '').replace(/\.dat\b/g,'')
    .replace(/(\d)\s*[xх×]\s*(?=\d)/g,'$1x').replace(/\b(\d+)\s*(?:t|teeth|tooth)\b/g,'$1')
    .replace(/[\p{L}]+/gu, word => aliases[word] || word).replace(/[^\p{L}\p{N}.]+/gu,' ').trim()
}

export function classifyPart(item) {
  const text = `${item.category || ''} ${item.description || ''} ${item.name || ''} ${item.id || ''}`.toLowerCase()
  let family = 'other', category = 'unclassified'
  const choose = rules => rules.find(([pattern]) => pattern.test(text))?.[1] || 'other'
  if (/duplo/.test(text)) {
    family='duplo'; category=choose([[/plate|base/,'plates'],[/brick/,'bricks'],[/figure|animal/,'figures'],[/train|wheel|car/,'vehicles'],[/window|door/,'windows']])
  } else if (/bionicle|ccbs|constraction|hero factory/.test(text)) {
    family='bionicle'; category=choose([[/mask|head/,'heads'],[/shell|armour|armor/,'shells'],[/limb|joint|bone|arm|leg|socket/,'limbs'],[/accessory|weapon|sword/,'accessories']])
  } else if (/train|monorail/.test(text)) {
    family='trains'; category=choose([[/track|rail straight|rail curved/,'tracks'],[/wheel|bogie/,'wheels'],[/coupl|magnet/,'couplings'],[/base|body|roof|wagon/,'bodies']])
  } else if (/electric|robot|mindstorms|powered up|battery|sensor|motor|мотор/.test(text)) {
    family='power'; category=choose([[/motor|мотор/,'motors'],[/sensor/,'sensors'],[/control|receiver|hub|rcx|nxt|ev3/,'controllers'],[/battery|cable|wire|light/,'power']])
  } else if (/technic|liftarm|axle|gear|pin\b|bush|wheel|tyre|tire|drivetrain|steering|suspension|балк|шестер|ось|оси|колес|колёс|втулк|пин\b/.test(text)) {
    family='technic'; category=choose([
      [/differential|universal joint|cv joint|gearbox|cardan|drivetrain/,'drivetrain'],
      [/steering|рулев/,'steering'],[/shock|suspension|подвес/,'suspension'],
      [/tyre|tire|шина/,'wheels/tires'],[/wheel.*hub|ступиц/,'wheels/hubs'],[/wheel|rim|колес|колёс/,'wheels/rims'],
      [/worm|червяч/,'gears/worm'],[/rack|рейка/,'gears/rack'],[/gear.*bevel|bevel.*gear|конич/,'gears/bevel'],[/gear|шестер/,'gears/spur'],
      [/liftarm|beam|балк/,'beams'],[/brick|кирпич/,'bricks'],[/bush|втулк/,'bushes'],
      [/connector|joiner|соединител/,'connectors'],[/\bpin\b|пин/,'pins'],[/axle|ось|оси/,'axles'],
    ])
  } else if (/brick|plate|tile|slope|curve|panel|hinge|clip|bar\b|window|door|windscreen|minifig|arch|bracket|plant|animal|wedge|decor|кирпич|пластин|тайл/.test(text)) {
    family='system'; category=choose([[/minifig/,'minifig'],[/curved|curve/,'curved'],[/slope|wedge/,'slopes'],[/tile|тайл/,'tiles'],[/plate|пластин/,'plates'],[/brick|кирпич/,'bricks'],[/panel/,'panels'],[/hinge/,'hinges'],[/clip|bar\b/,'clips'],[/window|door|windscreen/,'windows'],[/plant|animal|decor|arch/,'decorative']])
  } else category=choose([[/hose|string|flex/,'flexible'],[/scala|znap|modulex|quatro|belville|clikits/,'special'],[/accessory|sticker|figure/,'accessories']])
  if (family==='other' && category==='other') category='unclassified'
  return { family, category }
}

export function partKey(item) { return item.file ? `ldraw-${String(item.file).replace(/^parts\//i,'').replace(/\.dat$/i,'').toLowerCase()}` : item.id }

// These are views of authoritative records, not a second part registry.
export function libraryItems(index, definitions) {
  const items = new Map(index.map(item => [partKey(item), item]))
  for (const def of definitions) {
    const key = def.id
    if (def.ldraw && items.has(key)) continue
    items.set(key, { id:def.id, file:def.ldraw?.file, code:def.ldraw?.code || def.id, name:def.name, description:def.description || def.name, category:def.category, source:def.ldraw?'LDraw':'BrickLab' })
  }
  return [...items.values()].map(item => ({ ...item, key:partKey(item), sourceCategory:item.category, ...classifyPart(item), source:item.file?'LDraw':'BrickLab', search:normalizeSearch(`${item.code} ${item.id || ''} ${item.name || ''} ${item.description} ${item.category}`) }))
}

export function filterLibrary(items, { family, category='', query='', tab='all', favorites=[], recents=[], project=[], compatible=[] }) {
  const terms=normalizeSearch(query).split(/\s+/).filter(Boolean)
  const allowed = tab==='favorites'?favorites:tab==='recent'?recents:tab==='project'?project:tab==='compatible'?compatible:null
  const keys = allowed && new Set(allowed)
  const result=items.filter(item => item.family===family && (!category || item.category===category || item.category.startsWith(`${category}/`)) && (!keys || keys.has(item.key)) && terms.every(word=>item.search.includes(word)))
  if (tab==='recent') return result.sort((a,b)=>recents.indexOf(a.key)-recents.indexOf(b.key))
  return result.sort((a,b)=>Number(b.code===normalizeSearch(query))-Number(a.code===normalizeSearch(query)) || String(a.description).localeCompare(String(b.description),'en',{numeric:true}))
}

export function readPreference(storage, key, fallback) { try { return JSON.parse(storage.getItem(key)) ?? fallback } catch { return fallback } }
export function writePreference(storage, key, value) { try { storage.setItem(key,JSON.stringify(value)) } catch { /* private mode remains functional */ } }
