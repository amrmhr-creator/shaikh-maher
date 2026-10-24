// تعريف نماذج لوحة التحكم لكل نوع محتوى، وقراءة النموذج المرسل إلى بيانات.
import { TOPICS } from './topics';
import { schemas, type CollectionName, type Entry } from './schemas';
import { isUpload, saveUpload } from './uploads';

export type Option = readonly [value: string, label: string];
export type Field = {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
} & (
  | { type: 'string' | 'text' | 'number' | 'lines' | 'markdown' }
  | { type: 'select' | 'checkboxes'; options: readonly Option[] }
  | { type: 'ref'; collections: CollectionName[] }
  | { type: 'image' | 'file'; accept: string; folder: string }
  | { type: 'object'; fields: Field[] }
  | { type: 'list'; fields: Field[]; itemLabel: string }
);

const topics: Field = { name: 'topics', label: 'الموضوعات', type: 'checkboxes', options: Object.entries(TOPICS) };

export interface CollectionAdmin {
  label: string;
  singular: string;
  newLabel: string;
  fields: Field[];
  title: (e: Entry) => string;
  sort: (a: Entry, b: Entry) => number;
  /** رابط الصفحة على الموقع */
  href: (id: string) => string;
  /** معرّف ثابت من البيانات (مثل رقم الدرس)، وإلا يُبنى من العنوان */
  idFrom?: (data: any) => string;
}

export const ADMIN: Record<CollectionName, CollectionAdmin> = {
  lessons: {
    label: 'تسجيلات المجالس',
    singular: 'مجلس',
    newLabel: 'مجلس جديد',
    href: (id) => `/lessons/${id}/`,
    title: (e: any) => `${e.data.number}. ${e.data.title}`,
    sort: (a: any, b: any) => a.data.number - b.data.number,
    idFrom: (d) => String(d.number ?? '').padStart(2, '0'),
    fields: [
      { name: 'title', label: 'عنوان المجلس', type: 'string', required: true },
      { name: 'number', label: 'رقم المجلس', type: 'number', required: true, help: 'يحدد ترتيب المجلس ورابط صفحته.' },
      { name: 'series', label: 'عنوان المجموعة', type: 'string', help: 'اتركها فارغة لتكون «بعض من التسجيلات الصوتية لمجالس الشيخ».' },
      { name: 'audio', label: 'الملف الصوتي', type: 'file', accept: 'audio/*', folder: 'audio', required: true },
      { name: 'duration', label: 'المدة', type: 'string', help: 'مثل 45:30' },
      topics,
      { name: 'points', label: 'موضوعات المجلس', type: 'lines', help: 'كل سطر نقطة مستقلة. الآيات بين ﴿ ﴾ والأحاديث بين « » بعد ﷺ تظهر بخط مميز.' },
    ],
  },
  fawaid: {
    label: 'فوائد مختارة',
    singular: 'فائدة',
    newLabel: 'فائدة جديدة',
    href: (id) => `/fawaid/${id}/`,
    title: (e: any) => e.data.title,
    sort: (a, b) => a.id.localeCompare(b.id),
    fields: [
      { name: 'title', label: 'عنوان الفائدة', type: 'string', required: true },
      { name: 'quote', label: 'نص الفائدة من كلام الشيخ', type: 'text' },
      { name: 'summary', label: 'وصف قصير', type: 'text' },
      topics,
      {
        name: 'source',
        label: 'المصدر',
        type: 'object',
        fields: [
          { name: 'ref', label: 'الدرس أو الكتاب', type: 'ref', collections: ['lessons', 'books'] },
          { name: 'at', label: 'التوقيت في الدرس', type: 'string', help: 'مثل 12:30، يفتح الدرس عند هذه الدقيقة.' },
          { name: 'chapter', label: 'الفصل في الكتاب', type: 'string' },
        ],
      },
      {
        name: 'media',
        label: 'الفيديو أو الملف المرفق',
        type: 'object',
        fields: [
          { name: 'url', label: 'الملف', type: 'file', accept: 'video/*,audio/*,image/*,application/pdf', folder: 'fawaid', help: 'فيديو في الأساس، ويمكن رفع صوت أو صورة أو PDF، ويُعرف النوع من الملف.' },
          { name: 'poster', label: 'صورة الغلاف (اختياري)', type: 'image', accept: 'image/*', folder: 'fawaid', help: 'تظهر على بطاقة الفائدة. لو تُركت فارغة يظهر أول مشهد من الفيديو.' },
        ],
      },
      { name: 'body', label: 'شرح أو تعليق', type: 'markdown' },
      {
        name: 'status',
        label: 'الحالة',
        type: 'select',
        options: [['draft', 'مسودة'], ['review', 'قيد المراجعة'], ['published', 'منشورة']],
        help: 'الفائدة لا تظهر على الموقع إلا إذا كانت «منشورة».',
      },
    ],
  },
  books: {
    label: 'الكتب والرسائل',
    singular: 'كتاب',
    newLabel: 'كتاب جديد',
    href: (id) => `/books/${id}/`,
    title: (e: any) => e.data.title,
    sort: (a: any, b: any) => a.data.order - b.data.order,
    fields: [
      { name: 'title', label: 'عنوان الكتاب', type: 'string', required: true },
      { name: 'kind', label: 'النوع', type: 'select', options: [['book', 'كتاب'], ['series', 'سلسلة']], help: 'يظهر بخط صغير فوق العنوان.' },
      { name: 'order', label: 'الترتيب', type: 'number', help: 'الأصغر يظهر أولًا.' },
      { name: 'summary', label: 'وصف الكتاب', type: 'text', required: true },
      { name: 'cover', label: 'الغلاف', type: 'image', accept: 'image/*', folder: 'books' },
      { name: 'pdf', label: 'الكتاب كاملًا (PDF)', type: 'file', accept: 'application/pdf', folder: 'books' },
      { name: 'chapterLabel', label: 'عنوان قائمة الفصول', type: 'string', help: 'مثل: فصول الكتاب' },
      {
        name: 'chapters',
        label: 'الفصول',
        type: 'list',
        itemLabel: 'فصل',
        fields: [
          { name: 'title', label: 'عنوان الفصل', type: 'string', required: true },
          { name: 'pdf', label: 'ملف PDF للفصل', type: 'file', accept: 'application/pdf', folder: 'books' },
          { name: 'thumb', label: 'صورة الصفحة الأولى', type: 'image', accept: 'image/*', folder: 'books' },
        ],
      },
      { name: 'body', label: 'مقدمة أو نص إضافي', type: 'markdown' },
    ],
  },
  gallery: {
    label: 'مكتبة الصور',
    singular: 'صورة',
    newLabel: 'صورة جديدة',
    href: () => `/gallery/`,
    title: (e: any) => e.data.caption,
    sort: (a: any, b: any) => a.data.order - b.data.order || a.id.localeCompare(b.id),
    fields: [
      { name: 'image', label: 'الصورة', type: 'image', accept: 'image/*', folder: 'gallery', required: true },
      { name: 'caption', label: 'التعليق تحت الصورة', type: 'string', required: true },
      {
        name: 'person',
        label: 'الصورة لمن؟',
        type: 'select',
        options: [['maher', 'الشيخ ماهر'], ['fathallah', 'الشيخ فتح الله'], ['group', 'صورة جماعية'], ['other', 'أخرى']],
      },
      { name: 'order', label: 'الترتيب', type: 'number', help: 'الأصغر يظهر أولًا.' },
    ],
  },
};

export const isCollection = (name: string | undefined): name is CollectionName => Boolean(name && name in ADMIN);

/** قيمة حقل داخل البيانات بمسار مثل source.ref */
export function valueAt(data: any, path: string): any {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), data);
}

const emptyish = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0);

/** يقرأ النموذج المرسل إلى كائن بيانات، ويحفظ الملفات المرفوعة. */
export async function readForm(fields: Field[], form: FormData, prefix = ''): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    const key = prefix + f.name;
    const text = () => {
      const v = form.get(key);
      return typeof v === 'string' && v.trim() !== '' ? v.replace(/\r\n/g, '\n').trim() : undefined;
    };
    switch (f.type) {
      case 'number': {
        const v = text();
        out[f.name] = v === undefined ? undefined : Number(v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
        break;
      }
      case 'checkboxes':
        out[f.name] = form.getAll(key).filter((v): v is string => typeof v === 'string');
        break;
      case 'lines':
        out[f.name] = (text() ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
        break;
      case 'markdown':
        out[f.name] = (form.get(key) as string | null)?.replace(/\r\n/g, '\n') ?? '';
        break;
      case 'image':
      case 'file': {
        const file = form.get(`${key}.__file`);
        out[f.name] = isUpload(file) ? await saveUpload(file, f.folder) : text();
        break;
      }
      case 'object': {
        const obj = await readForm(f.fields, form, `${key}.`);
        out[f.name] = Object.values(obj).every(emptyish) ? undefined : obj;
        break;
      }
      case 'list': {
        // ترتيب العناصر حسب ظهورها في الصفحة.
        const indices = new Set<string>();
        for (const k of form.keys()) {
          const m = k.startsWith(`${key}.`) && k.slice(key.length + 1).match(/^(\d+)\./);
          if (m) indices.add(m[1]);
        }
        const items = [];
        for (const i of indices) {
          const item = await readForm(f.fields, form, `${key}.${i}.`);
          if (!Object.values(item).every(emptyish)) items.push(item);
        }
        out[f.name] = items;
        break;
      }
      default:
        out[f.name] = text();
    }
  }
  return out;
}

function mediaType(url: string) {
  if (/\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url)) return 'audio';
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) return 'image';
  if (/\.pdf(\?|$)/i.test(url)) return 'pdf';
  return 'video';
}

/** الفائدة: نوع المصدر يُستنتج من العنصر المختار، ونوع المقطع من امتداد الملف. */
export function prepareFawaid(data: Record<string, any>, lessonIds: Set<string>) {
  const { source, media } = data;
  if (source) data.source = source.ref ? { ...source, kind: lessonIds.has(source.ref) ? 'lesson' : 'book' } : undefined;
  if (media) {
    data.media = media.url
      ? { url: media.url, type: mediaType(media.url), ...(media.poster ? { poster: media.poster } : {}) }
      : undefined;
  }
  return data;
}

/** يتحقق من البيانات ويرجع رسائل الأخطاء بالعربية. */
export function validate(collection: CollectionName, raw: Record<string, any>) {
  const { body = '', ...data } = raw;
  const result = schemas[collection].safeParse(data);
  if (result.success) return { ok: true as const, data: result.data, body: String(body) };
  const labels = labelMap(ADMIN[collection].fields);
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.filter((p) => typeof p === 'string').join('.');
    const label = labels.get(path) ?? path;
    const msg = /[؀-ۿ]/.test(issue.message) ? issue.message : 'قيمة غير صحيحة أو ناقصة';
    return `${label}: ${msg}`;
  });
  return { ok: false as const, errors };
}

function labelMap(fields: Field[], prefix = '', parent = '', map = new Map<string, string>()) {
  for (const f of fields) {
    const label = parent ? `${parent} ← ${f.label}` : f.label;
    map.set(prefix + f.name, label);
    if (f.type === 'object' || f.type === 'list') labelMap(f.fields, `${prefix}${f.name}.`, label, map);
  }
  return map;
}
