// Cosmetic product metadata is shared by the store, inventory and public profiles.
// Prices are server-authoritative in PostgreSQL; these defaults are for inventory display.
export const themes=Object.freeze([
 {id:'carbon',ru:'Carbon GT',en:'Carbon GT',priceRub:99,descriptionRu:'Плетёный карбон, графитовые панели и янтарная подсветка.',descriptionEn:'Woven carbon, graphite panels and amber lighting.',accent:'#ffae38',collection:'motorsport'},
 {id:'neon',ru:'Neon Circuit',en:'Neon Circuit',priceRub:149,descriptionRu:'Сине-фиолетовая подсветка и сетка электронных схем.',descriptionEn:'Blue-violet lighting and electronic circuit grid.',accent:'#75eaff',collection:'future'},
 {id:'blueprint',ru:'Blueprint Studio',en:'Blueprint Studio',priceRub:129,descriptionRu:'Инженерная синька, координатная сетка и чертёжные линии.',descriptionEn:'Engineering blueprints, coordinate grid and drafting lines.',accent:'#86c9ff',collection:'engineering'},
 {id:'titanium',ru:'Titanium Factory',en:'Titanium Factory',priceRub:179,descriptionRu:'Шлифованный металл, холодный свет и индустриальная геометрия.',descriptionEn:'Brushed metal, cool light and industrial geometry.',accent:'#d1dbe8',collection:'engineering'},
 {id:'ember',ru:'Ember Forge',en:'Ember Forge',priceRub:199,descriptionRu:'Тёмная сталь, медные контуры и жар кузницы.',descriptionEn:'Dark steel, copper outlines and forge glow.',accent:'#ff986a',collection:'motorsport'},
 {id:'aurora',ru:'Aurora Lab',en:'Aurora Lab',priceRub:199,descriptionRu:'Северное сияние, глубокий космический градиент и бирюзовый свет.',descriptionEn:'Northern lights, deep space gradients and teal illumination.',accent:'#6de5be',collection:'future'}
].map(Object.freeze))
export const themeIds=Object.freeze(themes.map(t=>t.id))
export const backgroundIds=Object.freeze(['default','first-build',...themeIds])
export const themeFor=id=>themes.find(t=>t.id===id)
