// قراءة المحتوى وحفظه من قاعدة البيانات، بنفس شكل مجموعات Astro (id و data و body).
import type mysql from 'mysql2/promise';
import { marked } from 'marked';
import { db } from './db';
import { schemas, type CollectionName, type Entry, type EntryData } from './schemas';

const TTL = Number(process.env.CACHE_TTL_SECONDS ?? 60) * 1000;
const cache = new Map<CollectionName, { at: number; entries: Entry[] }>();

function toEntry<C extends CollectionName>(collection: C, row: mysql.RowDataPacket): Entry<C> | undefined {
  const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  const parsed = schemas[collection].safeParse(raw);
  if (!parsed.success) {
    console.warn(`[content] تجاهل ${collection}/${row.id}: بيانات غير صالحة`);
    return undefined;
  }
  return { id: row.id, collection, data: parsed.data as EntryData<C>, body: row.body ?? '' };
}

async function load<C extends CollectionName>(collection: C): Promise<Entry<C>[]> {
  const hit = cache.get(collection);
  if (hit && Date.now() - hit.at < TTL) return hit.entries as Entry<C>[];
  const [rows] = await (await db()).query<mysql.RowDataPacket[]>(
    `SELECT id, data, body FROM entries WHERE collection = ? ORDER BY id`,
    [collection],
  );
  const entries = rows.map((r) => toEntry(collection, r)).filter((e): e is Entry<C> => Boolean(e));
  cache.set(collection, { at: Date.now(), entries });
  return entries;
}

export async function getCollection<C extends CollectionName>(
  collection: C,
  filter?: (entry: Entry<C>) => boolean,
): Promise<Entry<C>[]> {
  const entries = [...(await load(collection))];
  return filter ? entries.filter(filter) : entries;
}

export async function getEntry<C extends CollectionName>(collection: C, id: string): Promise<Entry<C> | undefined> {
  return (await load(collection)).find((e) => e.id === id);
}

/** يحوّل نص Markdown (التفريغ أو الشرح) إلى HTML. */
export function renderBody(entry: { body?: string }): string {
  const body = entry.body?.trim();
  return body ? (marked.parse(body, { async: false }) as string) : '';
}

/** يحفظ العنصر؛ مع create يرفض الحفظ إذا كان المعرّف مستخدمًا (خطأ ER_DUP_ENTRY). */
export async function saveEntry<C extends CollectionName>(
  collection: C,
  id: string,
  data: EntryData<C>,
  body = '',
  { create = false } = {},
) {
  const sql = create
    ? `INSERT INTO entries (collection, id, data, body) VALUES (?, ?, ?, ?)`
    : `INSERT INTO entries (collection, id, data, body) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), body = VALUES(body)`;
  await (await db()).query(sql, [collection, id, JSON.stringify(data), body]);
  cache.delete(collection);
}

export async function deleteEntry(collection: CollectionName, id: string) {
  await (await db()).query(`DELETE FROM entries WHERE collection = ? AND id = ?`, [collection, id]);
  cache.delete(collection);
}

/** معرّف قصير يصلح رابطًا للصفحة، من العنوان العربي، مع رقم إضافي إذا كان مستخدمًا. */
export async function uniqueId(collection: CollectionName, text: string): Promise<string> {
  const base =
    text
      .normalize('NFKC')
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '')
      .toLowerCase() || new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  cache.delete(collection);
  const taken = new Set((await load(collection)).map((e) => e.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
