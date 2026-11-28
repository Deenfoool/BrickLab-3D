#!/bin/sh
# Render branded raster banners from the actual BrickLab gearbox preview.
set -eu
root="${1:-.}"
src="$root/assets/examples/5-plus-r-gearbox.webp"
out="$root/assets/seo"
mkdir -p "$out"
test -s "$src"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
font=DejaVu-Sans-Bold
# Prepare a matte framed image without stretching the original preview.
panel() {
  convert "$src" -auto-orient -resize "$1" -background '#202329' -gravity center -extent "$1" "$tmp/panel.jpg"
}
panel 586x458
convert -size 1200x630 xc:'#181a1d' \
 -fill '#ffb01b' -draw 'rectangle 0,0 12,630' \
 -fill '#202329' -draw 'roundrectangle 548,86 1148,550 14,14' \
 "$tmp/panel.jpg" -gravity northwest -geometry +555+89 -composite \
 -gravity northwest -font "$font" -fill '#ffb01b' -pointsize 26 -annotate +60+63 'BRICKLAB 3D' \
 -fill '#f5f5f6' -pointsize 50 -annotate +60+186 'Не просто' -annotate +60+249 'собирай.' \
 -fill '#ffb01b' -pointsize 50 -annotate +60+315 'Оживляй.' \
 -font DejaVu-Sans -fill '#b9bdc6' -pointsize 23 -annotate +60+387 '3D-конструктор и механика' -annotate +60+422 'прямо в браузере' \
 -fill '#f5f5f6' -pointsize 22 -annotate +60+552 'bricklab-3d.ru' \
 -strip -quality 91 "$out/og.jpg"
panel 928x565
convert -size 1080x1080 xc:'#181a1d' \
 -fill '#ffb01b' -draw 'rectangle 0,0 1080,12' \
 "$tmp/panel.jpg" -gravity northwest -geometry +76+218 -composite \
 -gravity northwest -font "$font" -fill '#ffb01b' -pointsize 32 -annotate +76+65 'BRICKLAB 3D' \
 -fill '#f5f5f6' -pointsize 52 -annotate +76+133 'Не просто собирай.' \
 -fill '#ffb01b' -annotate +76+192 'Оживляй.' \
 -font DejaVu-Sans -fill '#c5c8cf' -pointsize 30 -annotate +76+875 'Виртуальная инженерная мастерская' \
 -fill '#f5f5f6' -pointsize 28 -annotate +76+989 'bricklab-3d.ru' \
 -strip -quality 91 "$out/social-square.jpg"
panel 1000x760
convert -size 1920x1080 xc:'#181a1d' \
 -fill '#ffb01b' -draw 'rectangle 0,0 15,1080' \
 "$tmp/panel.jpg" -gravity northwest -geometry +840+160 -composite \
 -gravity northwest -font "$font" -fill '#ffb01b' -pointsize 40 -annotate +92+116 'BRICKLAB 3D' \
 -fill '#f5f5f6' -pointsize 78 -annotate +92+346 'Не просто' -annotate +92+435 'собирай.' \
 -fill '#ffb01b' -annotate +92+527 'Оживляй.' \
 -font DejaVu-Sans -fill '#b9bdc6' -pointsize 34 -annotate +92+653 'Сборка. Кинематика. Эксперименты.' \
 -fill '#f5f5f6' -pointsize 32 -annotate +92+938 'bricklab-3d.ru' \
 -strip -quality 92 "$out/presentation.jpg"
