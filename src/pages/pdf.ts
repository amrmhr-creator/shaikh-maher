// يمرر ملفات PDF من موقع الوسائط إلى قارئ الكتب، لأن المتصفح يمنع قراءتها مباشرة من نطاق آخر.
import type { APIRoute } from 'astro';

const HOSTS = new Set(['media.shaikhmaher.com', 'shaikhmaher.com', 'www.shaikhmaher.com']);

export const GET: APIRoute = async ({ url }) => {
  let src: URL;
  try {
    src = new URL(url.searchParams.get('src') ?? '');
  } catch {
    return new Response('رابط غير صالح', { status: 400 });
  }
  if (src.protocol !== 'https:' || !HOSTS.has(src.hostname) || !/\.pdf$/i.test(src.pathname)) {
    return new Response('رابط غير مسموح', { status: 400 });
  }
  const res = await fetch(src, { redirect: 'follow' }).catch(() => undefined);
  if (!res?.ok || !res.body) return new Response('تعذر جلب الملف', { status: 502 });
  return new Response(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      ...(res.headers.get('content-length') ? { 'Content-Length': res.headers.get('content-length')! } : {}),
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
