import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TOPIC_SLUGS } from './lib/topics';

const topic = z.enum(TOPIC_SLUGS);

// درس صوتي: نص الملف (body) هو التفريغ النصي الكامل عند توفره.
const lessons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    number: z.number(),
    series: z.string(),
    audio: z.string(),
    duration: z.string().optional(),
    topics: z.array(topic).default([]),
    points: z.array(z.string()).default([]),
  }),
});

// فصل كتاب: عنوان فقط، أو عنوان مع ملف PDF للفصل وصورة صفحته الأولى.
const chapter = z.union([
  z.string().transform((title) => ({ title, pdf: undefined, thumb: undefined })),
  z.object({ title: z.string(), pdf: z.string().optional(), thumb: z.string().optional() }),
]);

// كتاب أو رسالة: الفصول قائمة عناوين، ونص كل فصل يضاف لاحقًا.
const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    summary: z.string(),
    cover: z.string().optional(),
    pdf: z.string().optional(),
    chapterLabel: z.string().default('الفصول'),
    chapters: z.array(chapter).default([]),
  }),
});

// فائدة: نص قصير من كلام الشيخ مربوط بمصدره (درس + توقيت، أو كتاب + فصل).
const fawaid = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fawaid' }),
  schema: z.object({
    title: z.string(),
    quote: z.string().optional(),
    summary: z.string().optional(),
    topics: z.array(topic).default([]),
    source: z
      .object({
        kind: z.enum(['lesson', 'book']),
        ref: z.string(),
        at: z.string().optional(),
        chapter: z.string().optional(),
      })
      .optional(),
    media: z.object({ type: z.enum(['video', 'audio']), url: z.string() }).optional(),
    status: z.enum(['draft', 'review', 'published']).default('draft'),
  }),
});

export const collections = { lessons, books, fawaid };
