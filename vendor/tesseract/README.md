Pinned, locally served OCR runtime: tesseract.js 6.0.1, tesseract.js-core 6.0.0,
and @tesseract.js-data/eng 1.0.0 (4.0.0_best_int).

Run `python scripts/vendor-ocr.py` from the repository root to reproduce these
files. Downloads are checked against pinned SHA-256 hashes before extraction.
The runtime uses external WASM files instead of the embedded data-URL builds.
Both SIMD and portable LSTM builds are included. Library licenses are preserved
alongside the assets. The English model is reproduced from the pinned language
data package listed above; all upstream download URLs are recorded in the installer.
