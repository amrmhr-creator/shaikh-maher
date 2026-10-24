#!/bin/bash
# يصغّر ملف PDF ممسوح ضوئيًا للقراءة على الموقع:
#   compress.sh IN.pdf OUT.pdf
# كل صفحة تترسم بدقة 200 نقطة/بوصة. صفحات النص (أبيض وأسود) تُحفظ بأربع درجات رمادي مضغوطة بلا فقد،
# والصفحات اللي فيها صور أو ألوان تُحفظ JPEG بجودة 75.
set -euo pipefail
in=$1; out=$2
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
pdftoppm -r 200 -png "$in" "$d/pg"
for f in $(ls "$d"/pg-*.png | sort -V); do
  # نسبة البكسلات الرمادية المتوسطة (مش أبيض ولا أسود) ودرجة التشبع اللوني
  read mid sat < <(convert "$f" -resize 25% \( +clone -colorspace gray -fx '(u>0.25&&u<0.75)?1:0' -format '%[fx:mean] ' -write info: +delete \) -colorspace HSL -channel G -separate +channel -format '%[fx:maxima]\n' info:)
  if awk "BEGIN{exit !($mid < 0.10 && $sat < 0.15)}"; then
    convert "$f" -colorspace gray -level 8%,88% -posterize 4 -density 200 -units PixelsPerInch -compress Zip "${f%.png}.pdf"
  elif awk "BEGIN{exit !($sat < 0.15)}"; then
    convert "$f" -colorspace gray -density 200 -units PixelsPerInch -compress jpeg -quality 75 "${f%.png}.pdf"
  else
    convert "$f" -density 200 -units PixelsPerInch -compress jpeg -quality 75 "${f%.png}.pdf"
  fi
done
pdfunite $(ls "$d"/pg-*.pdf | sort -V) "$out"
echo "$(basename "$in"): $(( $(stat -c%s "$in") / 1024 )) KB -> $(( $(stat -c%s "$out") / 1024 )) KB, $(pdfinfo "$out" | awk '/^Pages/{print $2}') pages"
