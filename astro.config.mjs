import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// الموقع يعمل كتطبيق Node.js على الاستضافة: الصفحات تُقرأ من قاعدة البيانات عند كل طلب،
// فأي تعديل من لوحة التحكم (/admin) يظهر مباشرة بدون إعادة بناء.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://shaikhmaher.com',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // يستمع على كل الواجهات حتى يصل إليه بروكسي الاستضافة (HOST في البيئة يغيّر ذلك).
  server: { host: true },
  // التحقق من مصدر النماذج يتم في src/middleware.ts لأنه يعمل خلف بروكسي الاستضافة.
  security: { checkOrigin: false },
});
