export const SITE_NAME = 'فضيلة الشيخ ماهر إسماعيل جاهين';
export const SITE_SHORT = 'الشيخ ماهر جاهين';
export const CONTACT_EMAIL = 'info@shaikhmaher.com';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** يضيف مسار الموقع الأساسي لأي رابط داخلي. */
export function u(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export const NAV = [
  { href: '/', label: 'الرئيسية' },
  { href: '/lessons/', label: 'الدروس الصوتية' },
  { href: '/books/', label: 'الكتب والرسائل' },
  { href: '/fawaid/', label: 'الفوائد' },
  { href: '/about/', label: 'عن الشيخ' },
  { href: '/search/', label: 'بحث' },
];

/** "12:30" أو "1:02:05" إلى ثوانٍ */
export function toSeconds(t?: string): number {
  if (!t) return 0;
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
export const lessonLabel = (n: number) => (ORDINALS[n] ? `الدرس ${ORDINALS[n]}` : `الدرس ${ar(n)}`);
