# أدوات تجهيز المحتوى

سكربتات تعمل على جهاز أو سيرفر فيه `ffmpeg` (وPython 3)، وليست جزءًا من الموقع نفسه.
الملفات الكبيرة (الصوت والكتب) لا تُحفظ في الريبو، بل في ملفات المشروع وعلى `media.shaikhmaher.com`.

| المجلد | الوظيفة |
|---|---|
| [`audio-enhancement/`](audio-enhancement/) | تنقية صوت الدروس وتوحيد مستواه (`enhance.py`)، والشرح في README الخاص به. |
| [`fawaid/`](fawaid/) | قص فائدة من درس وتحويلها لفيديو طولي بصورة الشيخ وترجمة عربية (`make_faida.py`). |
| [`pdf-compress/`](pdf-compress/) | تصغير الكتب الممسوحة ضوئيًا للقراءة على الموقع (`compress.sh`، يحتاج `pdftoppm` و ImageMagick). النسخ المصغرة تُرفع إلى `media.shaikhmaher.com/2026/07/web/`. |
