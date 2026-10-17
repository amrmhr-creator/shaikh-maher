import { defineConfig } from 'astro/config';

// Preview build runs on GitHub Pages under /shaikh-maher.
// When the site moves to shaikhmaher.com, set SITE_URL and BASE_PATH=/ in the workflow.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://amrmhr-creator.github.io',
  base: process.env.BASE_PATH ?? '/shaikh-maher',
  trailingSlash: 'always',
});
