# Audio System v1 — BrickLab 3D

Ветка: `feature/audio-system-v1`, база: PARTS-6 `393f8be`.

## Состав и события

| Область | События / звук | Источник события |
|---|---|---|
| UI | короткий click, toggle, panel, tool, mode, language | кнопки, смена инструмента/режима/языка, фактическое открытие панели |
| Результат действия | success, warning, error | сообщения сохранения/импорта/группировки и ошибок |
| История | undo, redo, delete | успешно выполненное действие редактора, включая горячие клавиши |
| Каталог | pickup, place | нажатие на карточку; добавление детали в проект |
| BUILD | move, rotate, detach | завершение перемещения/вращения; отсоединение при начале переноса |
| Connectors | pin-insert, axle-insert, axle-gear, wheel-hub, snap | типы реального соединения и part IDs, после успешного attach |
| Gear mesh | gear-mesh | существующее `bricklab:gearmeshsnap`, без изменения snap semantics |
| Отказ соединения | incompatible | отклонённый attach выбранного snap candidate; не на каждом поиске snap |
| SIMULATE / TEST | start, stop, success/warning результата теста | запуск, пауза, остановка, результат scenario |
| Мотор | основной motor loop | actualRpm, load; один доминирующий мотор на весь проект |
| Трансмиссия | тихий gears loop | измеренная угловая скорость валов; общий слой для gears / bevel / gearbox / differential / U / CV |
| Колёса | tyres loop | groundSpeed, slipRatio, normalLoadN; только нагруженные колёса |
| Подвеска и рейка | короткий suspension | v2Velocity или относительная скорость двух тел по оси реального prismatic joint |
| Удары | impact-soft / medium / hard, иногда metal | импульс контактного manifold и обратная масса после Rapier step |
| BUILD ambience | Workbench | оригинальная спокойная 32-секундная композиция |

Всего 35 имён звука: 31 короткое событие × 4 варианта и четыре loop-слоя.
Нет hover-звука, скрипа на каждом движении мыши или отдельного loop на каждом зубчатом колесе.
У gearbox / differential / U / CV намеренно общий слой трансмиссии: это мелкие пластиковые механизмы, а не автомобильный моторный отсек.
Случайный pitch ±3%, громкость ±6%; формы вариантов также немного различаются.

## Архитектура

- `assets/audio/recipes.js`: локальные детерминированные рецепты затухающих негармонических резонансов и фильтрованного контактного шума.
- `assets/audio/music/workbench.ogg`: оригинальная ambient-композиция, 32 s / mono / 24 kHz, около 55 KB.
- `audio/manager.js`: один AudioContext, буферы в кэше, SFX/Music → Master → compressor; Web Audio BufferSource для коротких событий и loops.
- `audio/mechanics.js`: read-only adapter, контактные импульсы, параметры микса.
- `audio-events.js`: необязательные изолированные observers. Ошибка звука не выходит в solver или редактор.
- `audio/runtime.js`: подключение событий приложения и browser lifecycle.
- `audio/settings.js`: Master / SFX / Music / Mute, русский/английский интерфейс.
- `audio-qa.html`, `audio/qa.js`: отдельная QA-страница без WebGL, включена в Vite build.
- `scripts/render-audio.mjs`: воспроизводимая генерация Ogg (FFmpeg).
- `tests/audio.test.mjs`: поведенческие тесты движка, настроек, сигналов, микса и настоящего Rapier.

Настройки: `bricklab.audio.v1`, defaults Master 70%, SFX 70%, Music 23%. Запрет localStorage не мешает работе.
Контекст создаётся только после pointerdown / keydown. Никакого накопления событий до unlock.
Музыка загружается и декодируется асинхронно после взаимодействия; при ошибке остаётся тишина и один warning.
Остальные эффекты не требуют сети. SFX генерируются/кэшируются при preload либо первом обращении.
Музыкальный буфер получает однократное сглаживание крайних 64 samples, чтобы убрать переходные артефакты Vorbis.

## Микс и ограничения

Один motor, один gears, один tyres; music только в BUILD. Изменения pitch/gain сглаживаются 100–150 ms.
Motor/gear playback rate: `clamp(0.5 + |RPM| / 240, 0.3, 3)`.
Motor volume растёт с actual RPM и load и ограничен 0.65; drivetrain ограничен 0.32.
Spatial audio: equal-power panner, inverse attenuation, refDistance 8 studs. UI и BUILD не позиционные.
Камера и источники используют stud-координаты; physics meters преобразуются только для звука.

Столкновение оценивается как `normalImpulse × inverseMassSum`, за вычетом ожидаемой опорной силы тяжести за dt.
Это эквивалент изменения скорости, а не опубликованное измерение точной энергии удара.
Пороги: <0.10 m/s — тихо; 0.10–0.30 soft; 0.30–0.80 medium; ≥0.80 hard.
Cooldown пары 280 ms, общий 80 ms; устойчивый контакт повторно звучит лишь при резком росте импульса.
Металлическая добавка определяется по фактическим материалам render object; collider не меняется.

Не более 20 голосов, не более 4 копий одного SFX, до 3 одинаковых impact, один loop каждого типа.
Микс обновляется 20 Hz. Контакты читаются после microstep с вращающимся бюджетом: до 48 тел, 96 colliders, 128 пар за вызов.
При очень большой сцене второстепенные контакты могут быть пропущены. Это сознательный приоритет FPS.
В скрытой вкладке master затухает, loops останавливаются. При паузе/выходе из SIMULATE механические loops затухают.

Ни forces, ни velocities, ни timestep, ни collider flags, ни mechanics metadata аудиосистема не изменяет.
Physics pipeline получил только необязательное уведомление после существующего `world.step()`.

## Проверка

- `npm run test:audio`: 9 тестов — autoplay gate, настройки и DOM, варианты и пределы сигнала, buffer reuse, cooldown/polyphony, mute/visibility, missing music, mix RPM/load, event isolation, реальное падение в Rapier.
- Реальный Rapier drop: позиции по всем 360 шагам побитово совпадают с запуском без observer; удар обнаружен; лежащая деталь не повторяет звук.
- `npm run build`: обе страницы и Ogg входят в сборку.
- `npm run test:vehicle`: 19/19 проходят; отдельная регрессия машины, steering и PARTS-4 linear mechanisms.
- Общий `npm run test:physics`: 202 теста, 192 проходят, 10 не проходят. На чистом исходном `393f8be` получен тот же набор из 10 ошибок. Новых ошибок по сравнению с базой нет.

Исходные ошибки: bevel snap apex; состав visual QA; interface-fit metadata; rack pitch; liftarm silhouette; interface bounds; shock detail; Technic brick bores; frame bores; старое ограничение query imports в time-scale test.
Они не скрыты и не исправлялись изменением механики в аудиоветке.

## Обязательная ручная проверка перед merge

Облачный браузер заблокировал локальные HTTP/file URL политикой среды. Browser autoplay, слуховой баланс и FPS в реальном браузере здесь НЕ подтверждены.

1. `npm ci`, `npm run dev`, открыть `/BrickLab-3D/audio-qa.html`.
2. До первого нажатия — тишина; после «Включить аудио» state=running, failed пустой.
3. Сравнить pin / axle / gear / wheel snaps, частое размещение, warning/error; убедиться в отсутствии раздражающих тонов.
4. Запустить motor и gears; RPM 0→800, нагрузка 0→1, перемещать источник влево/вправо.
5. Impact slider: 0.05 — тишина; 0.15 / 0.4 / 1.2 — три разных уровня.
6. Послушать music минимум два полных цикла (64 s); проверить отсутствие слышимого стыка.
7. Проверить все volume, mute, reload, скрытие вкладки, наушники и динамики; повторить Chrome/Firefox/Safari.
8. В редакторе: каталог, панели, hotkeys, pin/axle/wheel snap, gear mesh, undo/redo/delete, язык.
9. SIMULATE: падающий кирпич и машина PARTS-4; idle / acceleration / steering / floor impacts / pause / reset / возврат в BUILD. TEST: запуск и результат сценария.
10. Большая сборка: сравнить FPS и physics diagnostics с mute и без; проверить предел voice count через `window.__bricklabAudioDebug()`.
11. В DevTools заблокировать `workbench.ogg`, reload: редактор и SIMULATE работают, SFX доступны, музыка молчит.

Исходники и лицензия всех звуков: `assets/audio/ATTRIBUTION.md` (оригинальные assets, CC0; сторонних samples нет).
