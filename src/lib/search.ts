// بحث عربي بسيط في المحتوى: يتجاهل التشكيل والفروق بين أشكال الألف والياء والتاء المربوطة.
import { getCollection } from './content';
import { lessonLabel } from './site';

export const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();

export interface Hit {
  href: string;
  kind: string;
  title: string;
  snippet: string;
  score: number;
}

function snippet(text: string, terms: string[]): string {
  const norm = normalize(text);
  const at = Math.min(...terms.map((t) => norm.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return text.slice(0, 160);
  // التطبيع يحذف التشكيل فيقصر النص؛ نقرب الموضع بالنسبة.
  const pos = Math.round((at / Math.max(norm.length, 1)) * text.length);
  const start = Math.max(0, pos - 60);
  return `${start > 0 ? '… ' : ''}${text.slice(start, start + 180).trim()}${start + 180 < text.length ? ' …' : ''}`;
}

export async function search(query: string): Promise<Hit[]> {
  const terms = normalize(query).split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const docs: { href: string; kind: string; title: string; text: string }[] = [];
  for (const l of await getCollection('lessons')) {
    docs.push({ href: `/lessons/${l.id}/`, kind: lessonLabel(l.data.number), title: l.data.title, text: l.data.points.join(' \n') });
  }
  for (const b of await getCollection('books')) {
    docs.push({ href: `/books/${b.id}/`, kind: 'كتاب', title: b.data.title, text: [b.data.summary, ...b.data.chapters.map((c) => c.title), b.body].join(' \n') });
  }
  for (const f of await getCollection('fawaid', (f) => f.data.status === 'published')) {
    docs.push({ href: `/fawaid/${f.id}/`, kind: 'فائدة', title: f.data.title, text: [f.data.quote, f.data.summary, f.body].filter(Boolean).join(' \n') });
  }
  const hits: Hit[] = [];
  for (const d of docs) {
    const title = normalize(d.title);
    const text = normalize(d.text);
    if (!terms.every((t) => title.includes(t) || text.includes(t))) continue;
    const score = terms.reduce((s, t) => s + (title.includes(t) ? 10 : 0) + text.split(t).length - 1, 0);
    hits.push({ href: d.href, kind: d.kind, title: d.title, snippet: snippet(d.text, terms), score });
  }
  return hits.sort((a, b) => b.score - a.score);
}
