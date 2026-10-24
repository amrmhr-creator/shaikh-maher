// اتصال قاعدة بيانات MySQL على الاستضافة، وإنشاء الجداول وتعبئتها بالمحتوى الأولي عند أول تشغيل.
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { parse as parseYaml } from 'yaml';
import { schemas, type CollectionName } from './schemas';
import { hashPassword } from './password';

const env = process.env;
let pool: mysql.Pool | undefined;
let ready: Promise<void> | undefined;

// على Hostinger قد يُعطى العنوان localhost، وفي Node قد يتحول إلى ::1 الذي لا يقبله MySQL هناك.
const ipv4 = (host?: string) => (!host || host === 'localhost' ? '127.0.0.1' : host);

function createPool() {
  const common = { charset: 'utf8mb4', connectionLimit: 5, waitForConnections: true, timezone: 'Z' } as const;
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    url.hostname = ipv4(url.hostname);
    return mysql.createPool({ uri: url.toString(), ...common });
  }
  return mysql.createPool({
    host: ipv4(env.DB_HOST),
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...common,
  });
}

/** يرجع الاتصال بعد التأكد من وجود الجداول. */
export async function db(): Promise<mysql.Pool> {
  pool ??= createPool();
  ready ??= init(pool).catch((err) => {
    ready = undefined;
    throw err;
  });
  await ready;
  return pool;
}

async function init(p: mysql.Pool) {
  await p.query(`CREATE TABLE IF NOT EXISTS entries (
    collection VARCHAR(32) NOT NULL,
    id VARCHAR(191) NOT NULL,
    data JSON NOT NULL,
    body MEDIUMTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (collection, id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await p.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await p.query(`CREATE TABLE IF NOT EXISTS meta (
    name VARCHAR(64) PRIMARY KEY,
    value TEXT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const fresh = !(await getMeta(p, 'seeded'));
  await seedContent(p);
  await numberGallery(p, fresh);
  await bootstrapAdmin(p);
}

// تعليقات الصور المرفوعة كانت أسماء ملفات (مثل FB IMG 1451504638128)، فطُلب ترقيم كل الصور
// بالترتيب المعروض في مكتبة الصور (١ لأول صورة) مرة واحدة، لحين كتابة تعليقات حقيقية من اللوحة.
async function numberGallery(p: mysql.Pool, fresh: boolean) {
  if (await getMeta(p, 'gallery_numbered')) return;
  if (fresh) return void (await setMeta(p, 'gallery_numbered', 'fresh install'));
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT id, data FROM entries WHERE collection = 'gallery'`);
  const photos = rows
    .map((r) => ({ id: r.id as string, order: Number((typeof r.data === 'string' ? JSON.parse(r.data) : r.data).order ?? 100) }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const [i, ph] of photos.entries()) {
    await p.query(`UPDATE entries SET data = JSON_SET(data, '$.caption', ?) WHERE collection = 'gallery' AND id = ?`, [String(i + 1), ph.id]);
  }
  await setMeta(p, 'gallery_numbered', new Date().toISOString());
}

// المحتوى الأولي: ملفات src/content/*.md تُضم داخل البناء وتُنقل إلى القاعدة.
// عند تغيّر هذه الملفات في تحديث جديد تُحدَّث المداخل التي لم تُعدَّل من لوحة التحكم فقط
// (updated_at = created_at)، وتُحذف المداخل الأولية التي أُزيلت ملفاتها إن لم تُعدَّل.
const SEED = import.meta.glob('../content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function seedEntries() {
  const out: { collection: CollectionName; id: string; data: string; body: string }[] = [];
  for (const [file, raw] of Object.entries(SEED)) {
    const m = file.match(/content\/([^/]+)\/(.+)\.md$/);
    if (!m || !(m[1] in schemas)) continue;
    const collection = m[1] as CollectionName;
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const data = schemas[collection].parse(parseYaml(fm ? fm[1] : '') ?? {});
    out.push({ collection, id: m[2], data: JSON.stringify(data), body: (fm ? fm[2] : raw).trim() });
  }
  return out;
}

const keyOf = (e: { collection: string; id: string }) => `${e.collection}/${e.id}`;

async function getMeta(p: mysql.Pool, name: string): Promise<string | undefined> {
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT value FROM meta WHERE name = ?`, [name]);
  return rows[0]?.value ?? undefined;
}
const setMeta = (p: mysql.Pool, name: string, value: string) =>
  p.query(`INSERT INTO meta (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [name, value]);

async function seedContent(p: mysql.Pool) {
  const seed = seedEntries();
  const version = createHash('sha256').update(JSON.stringify(seed)).digest('hex');
  const seeded = await getMeta(p, 'seeded');
  if (!seeded) {
    for (const e of seed) {
      await p.query(`INSERT IGNORE INTO entries (collection, id, data, body) VALUES (?, ?, ?, ?)`, [e.collection, e.id, e.data, e.body]);
    }
    await setMeta(p, 'seeded', new Date().toISOString());
  } else if ((await getMeta(p, 'seed_version')) !== version) {
    await syncSeed(p, seed, seeded);
  }
  await setMeta(p, 'seed_ids', JSON.stringify(seed.map(keyOf)));
  await setMeta(p, 'seed_version', version);
}

async function syncSeed(p: mysql.Pool, seed: ReturnType<typeof seedEntries>, seededAt: string) {
  const stored = await getMeta(p, 'seed_ids');
  let previous: Set<string>;
  if (stored) previous = new Set(JSON.parse(stored));
  else {
    // قواعد أقدم لم تسجّل المداخل الأولية: هي التي أُنشئت مع التعبئة الأولى.
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT collection, id FROM entries WHERE created_at <= ? + INTERVAL 5 MINUTE`,
      [new Date(seededAt)],
    );
    previous = new Set(rows.map((r) => keyOf(r as any)));
  }
  const current = new Set(seed.map(keyOf));
  for (const e of seed) {
    if (!previous.has(keyOf(e))) {
      await p.query(`INSERT IGNORE INTO entries (collection, id, data, body) VALUES (?, ?, ?, ?)`, [e.collection, e.id, e.data, e.body]);
    } else {
      await p.query(
        `UPDATE entries SET data = ?, body = ?, updated_at = created_at WHERE collection = ? AND id = ? AND updated_at = created_at`,
        [e.data, e.body, e.collection, e.id],
      );
    }
  }
  for (const key of previous) {
    if (current.has(key)) continue;
    const [collection, id] = key.split('/');
    await p.query(`DELETE FROM entries WHERE collection = ? AND id = ? AND updated_at = created_at`, [collection, id]);
  }
}

// أول مستخدم للوحة التحكم يُنشأ من ADMIN_USERNAME و ADMIN_PASSWORD إذا لم يوجد أي مستخدم.
async function bootstrapAdmin(p: mysql.Pool) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return;
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM users`);
  if (Number(rows[0].n) > 0) return;
  await p.query(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [
    env.ADMIN_USERNAME,
    await hashPassword(env.ADMIN_PASSWORD),
  ]);
}

// إعدادات الموقع العامة (مثل اللوجو) في جدول meta، مع ذاكرة قصيرة حتى لا تُقرأ القاعدة مع كل صفحة.
const settings = new Map<string, { value: string | undefined; at: number }>();
const SETTINGS_TTL = 60_000;

export async function getSetting(name: string): Promise<string | undefined> {
  const hit = settings.get(name);
  if (hit && Date.now() - hit.at < SETTINGS_TTL) return hit.value;
  const value = await getMeta(await db(), `setting:${name}`);
  settings.set(name, { value: value || undefined, at: Date.now() });
  return value || undefined;
}

export async function setSetting(name: string, value: string | undefined) {
  const p = await db();
  if (value) await setMeta(p, `setting:${name}`, value);
  else await p.query(`DELETE FROM meta WHERE name = ?`, [`setting:${name}`]);
  settings.set(name, { value, at: Date.now() });
}
