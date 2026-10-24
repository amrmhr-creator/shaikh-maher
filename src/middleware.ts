import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { currentUser } from './lib/auth';
import { UPLOAD_URL, serveUpload } from './lib/uploads';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const ADMIN = `${base}/admin`;

// الملفات المرفوعة تُخدم هنا قبل التوجيه، لأن مسارات الملفات (بامتداد) لا تصل إلى صفحات Astro.
const LOCAL_UPLOADS = UPLOAD_URL.startsWith('/') ? `${base}${UPLOAD_URL}` : undefined;

// روابط موقع الورد بريس القديم تُحوَّل لمقابلها هنا حتى لا تنكسر روابط جوجل والسوشيال ميديا.
// نسخة الورد بريس نفسها محفوظة على old.shaikhmaher.com.
const LEGACY_PAGES: Record<string, string> = {
  '/shaikhfathalla': '/fathallah/',
  '/videos': '/fawaid/',
  '/elementor-page-4011': '/books/rasayel/',
};

function legacyRedirect(path: string): string | undefined {
  if (path.startsWith('/wp-content/uploads/')) {
    return `https://media.shaikhmaher.com/${path.slice('/wp-content/uploads/'.length)}`;
  }
  if (path === '/wp-login.php' || path === '/wp-admin' || path.startsWith('/wp-admin/')) {
    return `https://old.shaikhmaher.com${path}`;
  }
  const page = LEGACY_PAGES[path.replace(/\/$/, '')];
  return page && `${base}${page}`;
}

// رؤوس أمان لكل الردود: منع عرض الموقع داخل إطار في موقع آخر (حماية اللوحة من خداع النقرات)،
// ومنع المتصفح من تخمين نوع الملف، وعدم إرسال الرابط كاملًا للمواقع الخارجية.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await route(ctx, next);
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  } catch {}
  return res;
});

// كل صفحات /admin تحتاج تسجيل دخول، ما عدا صفحة الدخول نفسها.
async function route(ctx: APIContext, next: MiddlewareNext): Promise<Response> {
  const path = ctx.url.pathname;
  const legacy = legacyRedirect(path);
  if (legacy) return ctx.redirect(legacy + ctx.url.search, 301);
  if (LOCAL_UPLOADS && path.startsWith(LOCAL_UPLOADS) && ['GET', 'HEAD'].includes(ctx.request.method)) {
    return serveUpload(ctx.request, path.slice(LOCAL_UPLOADS.length));
  }
  if (path !== ADMIN && !path.startsWith(`${ADMIN}/`)) return next();

  // حماية من إرسال النماذج من مواقع أخرى: يجب أن يطابق Origin عنوان الموقع.
  if (!['GET', 'HEAD'].includes(ctx.request.method)) {
    const origin = ctx.request.headers.get('origin');
    const host = (ctx.request.headers.get('x-forwarded-host') ?? ctx.request.headers.get('host'))?.split(',')[0].trim();
    let originHost: string | undefined;
    try {
      originHost = origin ? new URL(origin).host : undefined;
    } catch {}
    if (!originHost || originHost !== host) return new Response('طلب غير مسموح', { status: 403 });
  }

  ctx.locals.user = await currentUser(ctx.cookies);
  const isLogin = path.replace(/\/$/, '') === `${ADMIN}/login`;
  if (!ctx.locals.user && !isLogin) {
    return ctx.redirect(`${ADMIN}/login/?next=${encodeURIComponent(path + ctx.url.search)}`);
  }
  const res = await next();
  try {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } catch {}
  return res;
}
