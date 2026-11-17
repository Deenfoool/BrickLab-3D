# Источники

## Kinebrick Play

Профили в `catalog/technic.json` адаптированы из [library-connections.json](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/library-connections.json) проекта Erik Larsen. Выбраны поддерживаемые профили, добавлены стабильные идентификаторы, роли и доступные стороны. Таблица Kinebrick использует LDCad Shadow Library Roland Melkert и участников проекта, а также LDraw Parts Library и поправки Kinebrick. Адаптированные данные распространяются под [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Уведомление об источниках и лицензиях Kinebrick](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/LICENSE.md).

Правила сопоставления профилей и геометрической проверки зацепления перенесены в модель BrickLab по [fits.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/fits.ts) и [gears.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/gears.ts).

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
