# Источники

## Kinebrick Play

Профили в `catalog/technic.json` адаптированы из [library-connections.json](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/library-connections.json) проекта Erik Larsen. Выбраны поддерживаемые профили, добавлены стабильные идентификаторы, роли и доступные стороны. Таблица Kinebrick использует LDCad Shadow Library Roland Melkert и участников проекта, а также LDraw Parts Library и поправки Kinebrick. Адаптированные данные распространяются под [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Уведомление об источниках и лицензиях Kinebrick](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/data/LICENSE.md).

Правила сопоставления профилей и геометрической проверки зацепления перенесены в модель BrickLab по [fits.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/fits.ts) и [gears.ts](https://github.com/erik-larsen/kinebrick/blob/c217b4ea13d3c8634e10c4cf6e5728c442833e76/src/inference/gears.ts).

## Sim Studio

Из [Sim Studio](https://github.com/WorketeWorks/SimStudio-LEGO-Technic-Physics-Simulator/blob/3014c3a34ad0f7878d0392bce8f535241d555a03/README.md) взята модель совместимых посадок: круглая опора допускает вращение и осевой ход крестообразной оси, крестовое отверстие передаёт вращение, одна длинная ось поддерживает несколько опор. В BrickLab доступный ход вычисляется по профилю и занятым участкам. Правила реализованы в общем ядре BrickLab.

## 3D-сцена

Геометрия `assets/ldraw/technic.mpd` взята из [официального архива LDraw](https://library.ldraw.org/updates). В MPD упакованы одиннадцать деталей палитры и их зависимости. Авторство и лицензия сохранены в заголовках встроенных файлов. Условия и атрибуция LDraw находятся в `assets/ldraw/CAreadme.txt`, `CAlicense.txt` и `CAlicense4.txt`.

[Three.js](https://threejs.org/) r180, OrbitControls и LDrawLoader загружаются локально из `vendor/three`. Лицензия MIT включена в этот каталог.
