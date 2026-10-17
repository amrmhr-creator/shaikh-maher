#!/usr/bin/env bash
# يجرب صفحات الموقع ولوحة التحكم على خادم يعمل: bash scripts/smoke-test.sh http://127.0.0.1:4321
set -euo pipefail
B=${1:-http://127.0.0.1:4321}
T=$(mktemp -d)
JAR=$T/jar
OUT=$T/out
pass=0

fail() { echo "FAIL: $*"; echo '--- response ---'; head -c 3000 "$OUT" || true; echo; exit 1; }
# req <expected-status> <curl args...>
req() {
  local want=$1; shift
  local code
  code=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" -c "$JAR" "$@")
  [ "$code" = "$want" ] || fail "$* -> $code (expected $want)"
  pass=$((pass + 1))
}
has() { grep -qF -- "$1" "$OUT" || fail "response missing: $1"; }
lacks() { ! grep -qF -- "$1" "$OUT" || fail "response should not contain: $1"; }
post() { req "$1" -H "Origin: $B" "${@:2}"; }

echo '== public pages'
req 200 "$B/"; has 'حقيقة الحياة الدنيا'; has 'الشيخ فتح الله'
req 200 "$B/lessons/"
req 200 "$B/lessons/01/"; has 'حقيقة الحياة الدنيا'; has 'shaikhmaher.com/wp-content/uploads/2026/03/1.mp3'
req 200 "$B/books/"
req 200 "$B/books/rasayel/"; has 'في الإيثار'
req 200 "$B/fawaid/"
req 200 "$B/fawaid/haqiqat-alistighfar/"; has 'حقيقة الاستغفار'
req 200 "$B/gallery/"; has 'sheikh-photo.webp'
req 200 "$B/topics/tazkiyah/"
req 200 "$B/about/"
req 200 "$B/fathallah/"
req 200 -G --data-urlencode 'q=الاستغفار' "$B/search/"; has 'حقيقة الاستغفار'
req 200 -G --data-urlencode 'q=الحياه الدنيا' "$B/search/"; has 'حقيقة الحياة الدنيا'
req 404 "$B/lessons/999/"
req 404 "$B/topics/nothing/"
req 200 "$B/media/images/sheikh-photo.webp"

echo '== admin requires login'
req 302 "$B/admin/"
req 302 "$B/admin/lessons/"
req 200 "$B/admin/login/"
req 403 -d 'username=admin&password=ci-password-123' "$B/admin/login/"   # no Origin header
post 401 -d 'username=admin&password=wrong' "$B/admin/login/"; has 'غير صحيحة'
post 403 -H 'Origin: https://evil.example' -d 'username=admin&password=ci-password-123' "$B/admin/login/"
post 303 -d 'username=admin&password=ci-password-123' "$B/admin/login/"
req 200 "$B/admin/"; has 'أهلًا admin'
for c in lessons fawaid books gallery; do req 200 "$B/admin/$c/"; req 200 "$B/admin/$c/new/"; done
req 200 "$B/admin/lessons/01/"; has 'حقيقة الحياة الدنيا'
req 200 "$B/admin/books/rasayel/"; has 'في الإيثار'
req 200 "$B/admin/gallery/upload/"
req 200 "$B/admin/account/"
req 404 "$B/admin/nothing/"

echo '== gallery: upload one photo, edit, delete'
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$T/test.png"
post 303 -F "images=@$T/test.png;type=image/png" -F 'person=fathallah' -F 'caption=صورة تجربة للشيخ فتح الله' "$B/admin/gallery/upload/"
req 200 "$B/gallery/"; has 'صورة تجربة للشيخ فتح الله'
img=$(grep -o '/uploads/gallery/[^"]*\.png' "$OUT" | head -1)
[ -n "$img" ] || fail 'uploaded image url not found on gallery page'
echo "uploaded: $img"
req 200 "$B$img"
req 206 -H 'Range: bytes=0-3' "$B$img"
req 200 "$B/admin/gallery/"
gid=$(grep -o '/admin/gallery/[^/"]*/' "$OUT" | grep -v -e '/upload/' -e '/new/' | tail -1)
[ -n "$gid" ] || fail 'gallery entry link not found'
post 303 -F "image=$img" -F 'caption=تعليق معدل' -F 'person=group' -F 'order=2' -F '_action=save' "$B$gid"
req 200 "$B/gallery/"; has 'تعليق معدل'; lacks 'صورة تجربة للشيخ فتح الله'
post 303 -F '_action=delete' "$B$gid"
req 200 "$B/gallery/"; lacks 'تعليق معدل'
post 422 -F 'caption=بدون صورة' -F '_action=save' "$B/admin/gallery/new/"; has 'الصورة'

echo '== fawaid: create draft, publish, link to lesson'
post 303 -F 'title=فائدة تجريبية عن الصبر' -F 'quote=الصبر مفتاح الفرج' -F 'topics=tazkiyah' -F 'source.ref=03' -F 'source.at=12:30' -F 'status=draft' -F '_action=save' "$B/admin/fawaid/new/"
req 200 "$B/fawaid/"; lacks 'الصبر مفتاح الفرج'
req 200 "$B/admin/fawaid/"; has 'فائدة تجريبية عن الصبر'
fid=$(grep -o '/admin/fawaid/[^/"]*/' "$OUT" | grep -v '/new/' | grep -v haqiqat | head -1)
post 303 -F 'title=فائدة تجريبية عن الصبر' -F 'quote=الصبر مفتاح الفرج' -F 'topics=tazkiyah' -F 'source.ref=03' -F 'source.at=12:30' -F 'status=published' -F '_action=save' "$B$fid"
req 200 "$B/fawaid/"; has 'الصبر مفتاح الفرج'
req 200 "$B/lessons/03/"; has 'الصبر مفتاح الفرج'
req 200 -G --data-urlencode 'q=مفتاح الفرج' "$B/search/"; has 'فائدة تجريبية عن الصبر'

echo '== lessons: transcript + duplicate number'
post 303 -F 'title=درس تجريبي' -F 'number=42' -F "audio=https://media.shaikhmaher.com/audio/42.mp3" -F 'points=النقطة الأولى
النقطة الثانية' -F 'body=## عنوان فرعي

نص **التفريغ** هنا.' -F '_action=save' "$B/admin/lessons/new/"
req 200 "$B/lessons/42/"; has 'النقطة الثانية'; has '<strong>التفريغ</strong>'; has '<h2'
post 422 -F 'title=درس مكرر' -F 'number=42' -F 'audio=x.mp3' -F '_action=save' "$B/admin/lessons/new/"; has 'بنفس الرقم'
post 303 -F '_action=delete' "$B/admin/lessons/42/"
req 404 "$B/lessons/42/"

echo '== books: chapters list'
post 303 -F 'title=كتاب تجريبي' -F 'summary=وصف' -F 'order=50' -F 'chapters.0.title=الفصل الأول' -F 'chapters.7.title=الفصل الثاني' -F 'chapters.7.pdf=https://media.shaikhmaher.com/b/2.pdf' -F '_action=save' "$B/admin/books/new/"
req 200 "$B/books/"; has 'كتاب تجريبي'
bid=$(grep -o '/books/[^/"]*/' "$OUT" | grep -v -e rasayel -e dros | grep -v '^/books/$' | head -1)
req 200 "$B$bid"; has 'الفصل الأول'; has 'https://media.shaikhmaher.com/b/2.pdf'

echo '== account + logout'
post 200 -F '_action=add' -F 'username=editor' -F 'password=editor-pass-1' "$B/admin/account/"; has 'editor'
post 303 -d '' "$B/admin/logout/"
req 302 "$B/admin/"

echo "All $pass checks passed."
