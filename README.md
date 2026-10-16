# موقع تراث الشيخ ماهر إسماعيل جاهين

أرشيف دروس الشيخ ماهر إسماعيل جاهين رحمه الله وكتبه وفوائده. مبني بـ [Astro](https://astro.build) كموقع ثابت، مع بحث عربي عبر [Pagefind](https://pagefind.app).

## إضافة المحتوى

كل عنصر ملف Markdown داخل `src/content/`:

| المجلد | النوع | أهم الحقول |
|---|---|---|
| `lessons/` | درس صوتي | `title`, `number`, `series`, `audio`, `topics`, `points`؛ ونص الملف هو التفريغ |
| `books/` | كتاب أو رسالة | `title`, `summary`, `cover`, `pdf`, `chapters` |
| `fawaid/` | فائدة | `title`, `quote`, `source` (`kind: lesson` + `ref` + `at: "12:30"`)، `topics`, `status` |

الموضوعات معرّفة في `src/lib/topics.ts`. الفائدة لا تظهر إلا إذا كانت `status: published`.

## التشغيل

```sh
npm install
npm run dev     # معاينة محلية
npm run build   # بناء الموقع + فهرس البحث في dist/
```

## النشر

كل دفع إلى `main` يبني الموقع وينشره على فرع `gh-pages` (رابط تجريبي على GitHub Pages).
عند الانتقال إلى shaikhmaher.com تُضبط `SITE_URL` و`BASE_PATH=/` في ملف النشر.
