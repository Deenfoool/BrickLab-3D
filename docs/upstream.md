# Источники

## Kinebrick Play

Профили в `catalog/technic.json` адаптированы из [library-connections.json](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/library-connections.json) проекта Erik Larsen. Выбраны поддерживаемые профили, добавлены стабильные идентификаторы, роли и доступные стороны. Таблица Kinebrick использует LDCad Shadow Library Roland Melkert и участников проекта, а также LDraw Parts Library и поправки Kinebrick. Адаптированные данные распространяются под [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Уведомление об источниках и лицензиях Kinebrick](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/LICENSE.md).

Правила сопоставления профилей и геометрической проверки зацепления перенесены в модель BrickLab по [fits.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/fits.ts) и [gears.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/gears.ts).

## Расширенные профили стыковки

`catalog/snap-parts.json` и `catalog/snap-profiles.json` содержат преобразованные данные [LDCad Shadow Library](https://github.com/RolandMelkert/LDCadShadowLibrary/tree/f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec) и [Kinebrick](https://github.com/erik-larsen/kinebrick/tree/24366c8f0782a65d6138f41d593300b079859cb1), распространяемые по [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Профили преобразованы в рабочие координаты BrickLab, повторные определения объединены, ориентация крестовых отверстий сохранена. Шаровые и цилиндрические шарниры используют центры посадки. Маркированные разъёмы сопоставляются по семейству. Съёмные компоненты с известной парой используют локальные координаты из оригинального LDraw Shortcut и делят занятость одного посадочного места. Для модели 4586 отверстия восстановлены по геометрии LDraw. Связи дисков и шин получены из официальных файлов сборок LDraw и сохраняют фактическое осевое смещение.

1. Подготовьте чистый checkout Kinebrick и распакуйте в него тот же архив LDraw, что использован для индекса деталей. Разместите зафиксированный checkout Shadow Library в `ldcad-shadow/` и установите зависимости Kinebrick.
2. Запустите `python3 scripts/build-shadow-input.py /path/to/kinebrick`, чтобы собрать исходные цилиндры с ориентацией.
3. Запустите `python3 scripts/build-snap-profiles.py /path/to/kinebrick/data/library-connections.json /path/to/complete.zip`.
4. Запустите `npm test`. Проверка «Балки и рамы» требует для каждой детали рабочую ответную деталь, возможность установки с обеих сторон операции и сохранение связи при повторной загрузке.

## Sim Studio

Из [Sim Studio](https://github.com/WorketeWorks/SimStudio-LEGO-Technic-Physics-Simulator/blob/3014c3a34ad0f7878d0392bce8f535241d555a03/README.md) взята модель совместимых посадок: круглая опора допускает вращение и осевой ход крестообразной оси, крестовое отверстие передаёт вращение, одна длинная ось поддерживает несколько опор. В BrickLab доступный ход вычисляется по профилю и занятым участкам. Правила реализованы в общем ядре BrickLab.

## 3D-сцена

Геометрия `assets/ldraw/technic.mpd` и пакетов `assets/ldraw/technic/*.json.gz` взята из [официального архива LDraw](https://library.ldraw.org/updates). В MPD упакованы девятнадцать моделей с профилями соединителей и их зависимости. Остальные модели загружаются из пакетов LDraw при выборе детали или открытии сборки. Авторство и лицензия сохранены в заголовках встроенных файлов. Условия и атрибуция LDraw находятся в `assets/ldraw/CAreadme.txt`, `CAlicense.txt` и `CAlicense4.txt`.

[Three.js](https://threejs.org/) r180, OrbitControls и LDrawLoader загружаются локально из `vendor/three`. Лицензия MIT включена в этот каталог.

Для пары 41679/41680 профили сопряжения кольца взяты из Kinebrick. Модель редактора использует семь фиксированных положений от −45° до 45° с шагом 15°.

Координаты шипов и внутренних отверстий дополнены по Kinebrick. Для круглых отверстий 24T использованы контрборы из модели LDraw 3648b.


## Обновление библиотеки

Каталог Technic строится из официального `complete.zip`. Версия и SHA-256 архива записываются в `catalog/parts-library.json`. Генератор включает доступные пользователю детали категории Technic и связанные модели, в том числе колёса, шины и электронику. Служебные перенаправления, скрытые subparts и алиасы остаются зависимостями моделей. Номера деталей со стыковкой сохраняются для совместимости существующих сборок.

1. `python3 scripts/build-parts-catalog.py /path/to/complete.zip` создаёт индекс и пакеты геометрии.
2. `python3 -m http.server 8032` запускает редактор из корня репозитория.
3. `node scripts/render-library-previews.mjs` пересоздаёт атласы WebP. Для этого шага нужен Playwright с Chromium. При использовании системного Chromium передайте `--chromium /path/to/chromium`. Для работы редактора эти зависимости не нужны.

Для подключения нового раздела добавьте запись в `sections` того же индекса. Каждая запись задаёт `id`, названия `ru` и `en`, путь `assetPath` под `assets/ldraw/`, список категорий `[id, ru, en]` и строки деталей `[design, group, en, ru, pack]`. Модели читаются из `common.json.gz` и пакета с указанным номером. Порядок строк задаёт позиции миниатюр в атласах `previews/0.webp`, `previews/1.webp` и далее. Категории и выбор раздела редактор строит из этого индекса.

## 8845 Dune Buggy

Редактируемая сборка `examples/dune-buggy.json` и геометрия пружины получены из модели [Stefan Frenz (smf)](https://library.ldraw.org/omr/sets/1019) под CC BY 2.0. Скрипт читает [файл MPD с вложенными сборками](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/models/8845-Dune%20Buggy.mpd), переводит оси LDraw в координаты редактора и отбирает соединения, проходящие проверку в исходных позах. Пакет `assets/ldraw/dune-buggy/common.json.gz` содержит дополнительные детали из того же архива LDraw. Профили в `catalog/dune-buggy-parts.json` адаптированы из [таблицы Kinebrick](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/data/library-connections.json) и распространяются по CC BY-SA 4.0.

`python3 scripts/build-dune-buggy.py "<8845-Dune Buggy.mpd>" <complete.zip> <library-connections.json>` пересобирает пример. Нужен Node.js той же версии, что для тестов проекта.

## Полигон Sketchbook

«Тест-драйв» подгружает [world.glb](https://github.com/swift502/Sketchbook/blob/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55/build/assets/world.glb) из зафиксированной версии Sketchbook от swift502. [Лицензия исходного проекта (MIT)](https://github.com/swift502/Sketchbook/blob/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55/LICENSE). Карта остаётся в исходной системе координат с масштабом 90 LDU на единицу Sketchbook. Узлы `physics` используются как поверхности для поиска опоры колёс. Сцена загружается локальными GLTFLoader и BufferGeometryUtils из Three.js r180, лицензия находится в `vendor/three/LICENSE`.

## Динамика

Тест-драйв и физика сборки используют [Rapier 3D 0.19.3](https://www.npmjs.com/package/@dimforge/rapier3d-compat/v/0.19.3) под Apache 2.0. Браузер загружает выпущенный пакет при первом запуске симуляции. Для тестов та же версия закреплена в `package-lock.json`. Коллизии полигона строятся по коробкам и треугольным поверхностям из узлов `physics` Sketchbook.

## 858 Inline Engine

Редактируемая сборка `examples/inline-engine.json` основана на [модели LDraw, опубликованной в Kinebrick](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/models/858-Auto%20Engines-Inline%20Engine.mpd). Автор цифровой модели Takeshi Takahashi (RainbowDolphin). Модель и геометрия двух ремней, созданная LDCad для исходного MPD, распространяются по [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). BrickLab разворачивает вложенные сборки в редактируемые детали, переводит их в координаты редактора и сохраняет проверенные посадки. Ручка на шестерне 40T смещена на 2 LDU в центр отверстия. Короткий штифт вентилятора 3749 заменён на штифт 65249, чтобы крестовой конец действительно заходил в отверстия обеих круглых пластин.

Редактор переводит две исходные петли LDCad в редактируемые ременные передачи по совпадению осей и канавок. Пакет `assets/ldraw/inline-engine/common.json.gz` хранит резервную геометрию ремней для старых сохранений и недостающие модели из официального архива LDraw с сохранёнными заголовками. Профили в `catalog/inline-engine-parts.json` адаптированы из [таблицы Kinebrick](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/data/library-connections.json) и распространяются по CC BY-SA 4.0.

`python3 scripts/build-inline-engine.py "<858-Auto Engines-Inline Engine.mpd>" <complete.zip> <library-connections.json>` пересобирает пример.
