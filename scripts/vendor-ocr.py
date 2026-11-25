#!/usr/bin/env python3
"""Fetch pinned OCR assets with verified hashes; no runtime CDN dependency."""
import hashlib
import io
import pathlib
import tarfile
import urllib.request
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument('--archives', type=pathlib.Path)
parser.add_argument('--proxy-env', type=pathlib.Path)
args = parser.parse_args()
opener = urllib.request.build_opener()
if args.proxy_env:
    proxy = next(line.split('=', 1)[1] for line in args.proxy_env.read_text().splitlines() if line.startswith('BRICKLAB_INSTRUCTIONS_PROXY='))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': proxy, 'https': proxy}))

root = pathlib.Path(__file__).resolve().parents[1] / 'vendor/tesseract'
sources = [
    ('https://registry.npmjs.org/tesseract.js/-/tesseract.js-6.0.1.tgz', '4a208f2560a527ea9fc339ba2fdf125c13bca6638c194a149379601a1418d0ed', {
        **{f'package/dist/{name}': name for name in ['tesseract.min.js', 'worker.min.js', 'tesseract.min.js.map', 'worker.min.js.map', 'tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt']},
        'package/LICENSE.md': 'LICENSE-tesseract.js.md',
    }),
    ('https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-6.0.0.tgz', '197b53b6bc42b7270c99b079e438992096d71a2b9b8237c6349491bd22fbd5a0', {
        **{f'package/{name}': name for name in ['tesseract-core-lstm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.wasm']},
        'package/LICENSE': 'LICENSE-core.txt',
    }),
    ('https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz', '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91', None),
]

for index, (url, digest, files) in enumerate(sources):
    if args.archives:
        data = (args.archives / ['tesseract.tgz', 'core.tgz', 'eng.traineddata.gz'][index]).read_bytes()
    else:
        with opener.open(url, timeout=90) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit('OCR asset checksum mismatch')
    if files:
        archive = tarfile.open(fileobj=io.BytesIO(data), mode='r:gz')
        for source, target in files.items():
            path = root / target
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.extractfile(source).read())
    else:
        path = root / 'lang/eng.traineddata.gz'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
names = [target for _, _, files in sources if files for target in files.values()] + ['lang/eng.traineddata.gz']
manifest = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sorted(names)}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Verified local OCR assets installed')
