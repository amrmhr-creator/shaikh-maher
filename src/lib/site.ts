export const SITE_NAME = 'فضيلة الشيخ ماهر إسماعيل جاهين';
export const SITE_SHORT = 'الشيخ ماهر جاهين';
export const CONTACT_EMAIL = 'sh.maher.ismail@gmail.com';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** يضيف مسار الموقع الأساسي لأي رابط داخلي. */
export function u(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export const NAV = [
  { href: '/', label: 'الرئيسية' },
  { href: '/about/', label: 'تعريف بالشيخ' },
  { href: '/lessons/', label: 'تسجيلات المجالس' },
  { href: '/books/', label: 'الكتب والرسائل' },
  { href: '/fawaid/', label: 'فوائد مختارة' },
  { href: '/fathallah/', label: 'الشيخ فتح الله' },
  { href: '/gallery/', label: 'مكتبة الصور' },
  { href: '/search/', label: 'بحث' },
];

export const SITE_TAGLINE = 'إرثٌ خالد ومشكاةُ علمٍ تضيء دروب السالكين في كل زمان ومكان';

/** "12:30" أو "1:02:05" إلى ثوانٍ */
export function toSeconds(t?: string): number {
  if (!t) return 0;
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
export const lessonLabel = (n: number) => (ORDINALS[n] ? `المجلس ${ORDINALS[n]}` : `المجلس ${ar(n)}`);

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** يميّز الآيات ﴿…﴾ والأحاديث «…» (المسبوقة بـ ﷺ) بخط مختلف داخل النص. */
export function markScripture(text: string): string {
  return escapeHtml(text)
    .replace(/﴿[^﴾]*﴾(\s*\[[^\]]*\])?/g, (m) => `<span class="ayah">${m}</span>`)
    .replace(/(ﷺ:?\s*)(«[^»]*»)/g, '$1<span class="hadith">$2</span>');
}
