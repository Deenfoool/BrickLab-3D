# Источники

## Kinebrick Play

Профили в `catalog/technic.json` адаптированы из [library-connections.json](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/library-connections.json) проекта Erik Larsen. Выбраны поддерживаемые профили, добавлены стабильные идентификаторы, роли и доступные стороны. Таблица Kinebrick использует LDCad Shadow Library Roland Melkert и участников проекта, а также LDraw Parts Library и поправки Kinebrick. Адаптированные данные распространяются под [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Уведомление об источниках и лицензиях Kinebrick](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/LICENSE.md).

Правила сопоставления профилей и геометрической проверки зацепления перенесены в модель BrickLab по [fits.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/fits.ts) и [gears.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/gears.ts).

## Расширенные профили стыковки

`catalog/snap-parts.json` и `catalog/snap-profiles.json` содержат преобразованные данные [LDCad Shadow Library](https://github.com/RolandMelkert/LDCadShadowLibrary/tree/f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec) и [Kinebrick](https://github.com/erik-larsen/kinebrick/tree/24366c8f0782a65d6138f41d593300b079859cb1), распространяемые по [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Профили преобразованы в рабочие координаты BrickLab, повторные определения объединены, ориентация крестовых отверстий сохранена. Шаровые и цилиндрические шарниры используют центры посадки. Маркированные разъёмы сопоставляются по семейству. Съёмные компоненты с известной парой используют локальные координаты из оригинального LDraw Shortcut и делят занятость одного посадочного места. Для балок, блоков и соединителей явные круглые отверстия из LDraw дополняют профили Shadow Library. Существующие идентификаторы сохраняются, в том числе когда геометрия подтверждает второй вход в отверстие. У балки 4586 учитываются два крайних круглых отверстия. Связи дисков и шин получены из официальных файлов сборок LDraw и сохраняют фактическое осевое смещение.

1. Подготовьте чистый checkout Kinebrick и распакуйте в него тот же архив LDraw, что использован для индекса деталей. Разместите зафиксированный checkout Shadow Library в `ldcad-shadow/` и установите зависимости Kinebrick.
2. Запустите `python3 scripts/build-shadow-input.py /path/to/kinebrick`, чтобы собрать исходные цилиндры с ориентацией.
3. Запустите `python3 scripts/build-snap-profiles.py /path/to/kinebrick/data/library-connections.json /path/to/complete.zip`.
4. Запустите `npm test`. Тесты проверяют каждый описанный соединитель балок, рам, блоков и штифтов, обе постановки деталей и доступные стороны входа. Созданные соединения проверяются при повторной загрузке.

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

При открытии BrickLab загружается [world.glb](https://github.com/swift502/Sketchbook/blob/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55/build/assets/world.glb) из зафиксированной версии Sketchbook от swift502. «Тест-драйв» повторно использует подготовленную карту. [Лицензия исходного проекта (MIT)](https://github.com/swift502/Sketchbook/blob/62f4b7986fd1ce1e4f91daba89ef032c20a6ce55/LICENSE). Карта остаётся в исходной системе координат с масштабом 90 LDU на единицу Sketchbook. Узлы `physics` используются как поверхности для поиска опоры колёс. Сцена загружается локальными GLTFLoader и BufferGeometryUtils из Three.js r180, лицензия находится в `vendor/three/LICENSE`.

Заставка Ford GT 42154 использует расположение деталей из [сборки Studio от efferman](https://www.eurobricks.com/forum/forums/topic/193141-42154-2022-ford-gt/page/9/) и геометрию из [библиотеки LDraw](https://library.ldraw.org/). В `assets/startup/ford-gt.glb.gz` сохранена облегчённая модель с отдельными кузовными группами, колёсами, амортизаторами и двигателем. Команда для пересборки указана в `scripts/build-ford-intro.py`. Для сжатия модели используется [meshoptimizer 1.3.0](https://github.com/zeux/meshoptimizer), лицензия MIT находится в `vendor/meshoptimizer/LICENSE.md`.

## Динамика

Тест-драйв и физика сборки используют [Rapier 3D 0.19.3](https://www.npmjs.com/package/@dimforge/rapier3d-compat/v/0.19.3) под Apache 2.0. Браузер загружает выпущенный пакет при первом запуске симуляции. Для тестов та же версия закреплена в `package-lock.json`. Коллизии полигона строятся по коробкам и треугольным поверхностям из узлов `physics` Sketchbook.

## 858 Inline Engine

Редактируемая сборка `examples/inline-engine.json` основана на [модели LDraw, опубликованной в Kinebrick](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/models/858-Auto%20Engines-Inline%20Engine.mpd). Автор цифровой модели Takeshi Takahashi (RainbowDolphin). Модель и геометрия двух ремней, созданная LDCad для исходного MPD, распространяются по [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). BrickLab разворачивает вложенные сборки в редактируемые детали, переводит их в координаты редактора и сохраняет проверенные посадки. Ручка на шестерне 40T смещена на 2 LDU в центр отверстия. Короткий штифт вентилятора 3749 заменён на штифт 65249, чтобы крестовой конец входил в отверстия обеих круглых пластин. При открытии старой копии BrickLab восстанавливает эту посадку, если прежнее крепление сохранилось.

Редактор переводит две исходные петли LDCad в редактируемые ременные передачи по совпадению осей и канавок. Пакет `assets/ldraw/inline-engine/common.json.gz` хранит резервную геометрию ремней для старых сохранений и недостающие модели из официального архива LDraw с сохранёнными заголовками. Профили в `catalog/inline-engine-parts.json` адаптированы из [таблицы Kinebrick](https://github.com/erik-larsen/kinebrick/blob/24366c8f0782a65d6138f41d593300b079859cb1/data/library-connections.json) и распространяются по CC BY-SA 4.0.

`python3 scripts/build-inline-engine.py "<858-Auto Engines-Inline Engine.mpd>" <complete.zip> <library-connections.json>` пересобирает пример.

## PDF-инструкции наборов

BrickLab обращается к [публичному индексу BrickDB](https://bricks.party/) при первом поиске инструкции. В индексе есть номера наборов, ссылки на PDF LEGO и число страниц там, где оно известно. Файл `catalog/sets/instruction-sequences.json` хранит порядок книг, сверенный со [страницами инструкций LEGO](https://www.lego.com/en-us/service/building-instructions). Сами PDF загружаются с сайтов-источников. Для наборов 910xxx BrickLab проверяет наличие PDF на сервере [BrickLink Designer Program](https://www.bricklink.com/v3/designer-program/instructions.page).

Панель «Инструкция» показывает сверенные изображения страниц и отрисовывает доступные PDF через PDF.js. При добавлении набора в `previewSets` сверяйте не только число страниц, но и начало и конец каждого тома с оригинальным PDF. Если сервер PDF ограничивает чтение с GitHub Pages, кнопка «Выбрать PDF» позволяет отрисовать скачанный файл в той же панели. Файл остаётся в браузере.

Координаты деталей в `catalog/sets/42223-parts-by-page.json` получены из [инструкции LEGO 42223, PDF 6651409](https://www.lego.com/en-us/service/building-instructions/42223) и нормализованы до 10 000 по каждой оси. Изображения в рамках шагов сопоставлены с изображениями и кодами элементов на страницах 181–182. Артикулы и идентификаторы цветов взяты из таблицы `elements.csv.gz` на [Rebrickable](https://rebrickable.com/downloads/). Запись хранит `[x, y, ширина, высота, артикул, цвет]`. Изображения страниц загружаются с [BrickInstructions](https://lego.brickinstructions.com/lego_instructions/set/42223).

`scripts/build-instruction-part-maps.py` готовит такие карты для других наборов. Передайте все тома вместе с таблицей `elements.csv.gz`. Генератор находит рисунки над подписями количества, объединяет фрагменты и сравнивает отрисованные участки страницы с иллюстрированной описью. Он сохраняет совпадения с достаточным отрывом от ближайшего кандидата. Аргумент `--review` сохраняет оценки кандидатов для проверки, а `--corrections` принимает проверенные артикулы и цвета и позволяет вручную указать связанные фрагменты PDF.

Для рисунка из одного встроенного изображения генератор дополнительно сравнивает исходный растр с растрами описи. Такое совпадение проходит проверку по артикулу и видимому цвету на странице. Если два способа уверенно предлагают разные детали, подсказка пропускается.

На страницах с векторными рамками генератор привязывает подпись количества к рисунку в той же рамке. Если соседний рисунок попал в пустой угол прямоугольной области детали, генератор пробует повторно сравнить её с описью без соседнего рисунка. Если рамка не найдена, используются координаты подписи и изображения на странице.

Круглые и квадратные числовые метки рядом с рисунком помогают различить детали похожей формы. Генератор сопоставляет число и форму значка с метками на рисунках в описи этого набора. Подсказка появляется только при достаточном совпадении рисунка и цвета.

Для PDF со страницами в виде изображений добавьте `--ocr` к команде генерации. Для этого режима нужны Tesseract с языковыми данными `eng` и Python-пакет SciPy. Генератор находит рамки со списками деталей, читает подписи вроде `2x` и связывает их с рисунками внутри рамки. Он также читает коды элементов в отсканированной описи. Режим включается только для страниц без текстового слоя и сохраняет обычный формат карт подсказок.

Для [Volvo EC500 42215](https://www.lego.com/en-us/service/building-instructions/42215) запуск выглядит так.

```sh
python3 scripts/build-instruction-part-maps.py --set 42215 --elements /path/to/elements.csv.gz \
  --corrections catalog/sets/42215-instruction-corrections.json \
  6592888=/path/to/6592888.pdf 6595793=/path/to/6595793.pdf
```

Генератор обновляет `catalog/sets/instruction-part-index.json`. Перед добавлением нового набора проверьте порядок книг и совпадение страниц с изображениями BrickInstructions в `src/sets/instruction-sources.js`. Карты загружаются по PDF ID конкретного тома и содержат координаты зон, артикулы и идентификаторы цветов.
