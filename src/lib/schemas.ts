import { z } from 'astro/zod';
import { TOPIC_SLUGS } from './topics';

const topic = z.enum(TOPIC_SLUGS);
const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const opt = () => z.preprocess(blank, z.string().optional());

// درس صوتي: الحقل body هو التفريغ النصي الكامل عند توفره.
const lessons = z.object({
  title: z.string().min(1, 'عنوان الدرس مطلوب'),
  number: z.number({ message: 'رقم الدرس مطلوب' }).int().positive(),
  series: z.string().default('بعض من التسجيلات الصوتية لمجالس الشيخ'),
  audio: z.string().min(1, 'الملف الصوتي مطلوب'),
  duration: opt(),
  topics: z.array(topic).default([]),
  points: z.array(z.string()).default([]),
});

// فصل كتاب: عنوان فقط، أو عنوان مع ملف PDF للفصل وصورة صفحته الأولى.
const chapter = z.union([
  z.string().transform((title) => ({ title, pdf: undefined, thumb: undefined })),
  z.object({ title: z.string().min(1, 'عنوان الفصل مطلوب'), pdf: opt(), thumb: opt() }),
]);

// كتاب أو رسالة.
const books = z.object({
  title: z.string().min(1, 'عنوان الكتاب مطلوب'),
  kind: z.enum(['book', 'series']).default('book'),
  order: z.number().default(10),
  summary: z.string().min(1, 'وصف الكتاب مطلوب'),
  cover: opt(),
  pdf: opt(),
  chapterLabel: z.preprocess(blank, z.string().default('الفصول')),
  chapters: z.array(chapter).default([]),
});

// فائدة: نص قصير من كلام الشيخ مربوط بمصدره (درس + توقيت، أو كتاب + فصل).
const fawaid = z.object({
  title: z.string().min(1, 'عنوان الفائدة مطلوب'),
  quote: opt(),
  summary: opt(),
  topics: z.array(topic).default([]),
  source: z
    .object({
      kind: z.enum(['lesson', 'book']),
      ref: z.string(),
      at: opt(),
      chapter: opt(),
    })
    .optional(),
  // الفيديو هو الأساس، ويمكن إرفاق صوت أو صورة أو PDF. poster صورة الغلاف في البطاقة.
  media: z.object({ type: z.enum(['video', 'audio', 'image', 'pdf']), url: z.string(), poster: opt() }).optional(),
  status: z.enum(['draft', 'review', 'published']).default('draft'),
});

// صورة في مكتبة الصور، ويُرتب العرض حسب order ثم المعرّف.
const gallery = z.object({
  image: z.string().min(1, 'الصورة مطلوبة'),
  caption: z.string().min(1, 'التعليق مطلوب'),
  person: z.enum(['maher', 'fathallah', 'group', 'other']).default('maher'),
  order: z.number().default(100),
});

export const schemas = { lessons, books, fawaid, gallery };
export type CollectionName = keyof typeof schemas;
export const COLLECTIONS = Object.keys(schemas) as CollectionName[];
export type EntryData<C extends CollectionName> = z.infer<(typeof schemas)[C]>;
export interface Entry<C extends CollectionName = CollectionName> {
  id: string;
  collection: C;
  data: EntryData<C>;
  body: string;
}
export type CollectionEntry<C extends CollectionName> = Entry<C>;
