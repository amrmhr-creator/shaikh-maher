// اتصال قاعدة بيانات MySQL على الاستضافة، وإنشاء الجداول وتعبئتها بالمحتوى الأولي عند أول تشغيل.
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
  await seedContent(p);
  await bootstrapAdmin(p);
}

// المحتوى الأولي: ملفات src/content/*.md تُضم داخل البناء وتُنقل إلى القاعدة مرة واحدة فقط.
const SEED = import.meta.glob('../content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

async function seedContent(p: mysql.Pool) {
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT value FROM meta WHERE name = 'seeded'`);
  if (rows.length) return;
  for (const [file, raw] of Object.entries(SEED)) {
    const m = file.match(/content\/([^/]+)\/(.+)\.md$/);
    if (!m || !(m[1] in schemas)) continue;
    const collection = m[1] as CollectionName;
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const data = schemas[collection].parse(parseYaml(fm ? fm[1] : '') ?? {});
    const body = (fm ? fm[2] : raw).trim();
    await p.query(`INSERT IGNORE INTO entries (collection, id, data, body) VALUES (?, ?, ?, ?)`, [
      collection,
      m[2],
      JSON.stringify(data),
      body,
    ]);
  }
  await p.query(`INSERT IGNORE INTO meta (name, value) VALUES ('seeded', ?)`, [new Date().toISOString()]);
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
