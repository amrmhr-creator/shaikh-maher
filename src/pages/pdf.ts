// يمرر ملفات PDF من موقع الوسائط إلى قارئ الكتب، لأن المتصفح يمنع قراءتها مباشرة من نطاق آخر.
// يمرر طلبات الأجزاء (Range) كما هي، فيقرأ القارئ الصفحات التي يحتاجها فقط بدل تنزيل الملف كله،
// وبعض الملفات أكبر من ٦٠ ميجابايت.
import type { APIRoute } from 'astro';

const HOSTS = new Set(['media.shaikhmaher.com', 'shaikhmaher.com', 'www.shaikhmaher.com']);
const PASS = ['content-length', 'content-range', 'last-modified', 'etag'];

export const GET: APIRoute = async ({ url, request }) => {
  let src: URL;
  try {
    src = new URL(url.searchParams.get('src') ?? '');
  } catch {
    return new Response('رابط غير صالح', { status: 400 });
  }
  if (src.protocol !== 'https:' || !HOSTS.has(src.hostname) || !/\.pdf$/i.test(src.pathname)) {
    return new Response('رابط غير مسموح', { status: 400 });
  }
  const range = request.headers.get('range');
  const res = await fetch(src, {
    redirect: 'follow',
    headers: range ? { range } : {},
    signal: request.signal,
  }).catch(() => undefined);
  if (!res || !(res.ok || res.status === 416) || !res.body) return new Response('تعذر جلب الملف', { status: 502 });
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400, no-transform',
  });
  for (const h of PASS) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
};
