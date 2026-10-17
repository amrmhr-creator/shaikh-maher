import { defineMiddleware } from 'astro:middleware';
import { currentUser } from './lib/auth';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const ADMIN = `${base}/admin`;

// كل صفحات /admin تحتاج تسجيل دخول، ما عدا صفحة الدخول نفسها.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
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
});
