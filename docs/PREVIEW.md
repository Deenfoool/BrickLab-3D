# BrickLab Preview

Separate static testing environment for feature/mechanics-core. Do not deploy the cloud server branch or change production GitHub Pages. The preview is a browser-only demo; real accounts and remote storage are not enabled.

Vercel static settings: framework Other, install command true, build command `node scripts/build-preview.mjs`, output dist-preview. Configure the project's Git ignored build step to `test "$VERCEL_GIT_COMMIT_REF" != "feature/mechanics-core"` (exit 0 skips, exit 1 builds). Keep deployment protection enabled if available. Only the allowed source directories are copied into the output. The preview has a visible environment label and noindex headers; noindex is not authentication.

Local check: `node scripts/build-preview.mjs` then `python3 -m http.server 8000 --directory dist-preview`. Open /#account. /preview-version.json identifies the source commit when built by Vercel.

Browser localStorage is scoped to the preview origin; existing GitHub Pages builds do not appear automatically. Export/import .bricklab files if needed.
