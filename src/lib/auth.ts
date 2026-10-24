// تسجيل الدخول للوحة التحكم: كلمات مرور مشفرة في القاعدة، وجلسة في كوكي موقّع.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import type mysql from 'mysql2/promise';
import { db } from './db';
import { hashPassword, verifyPassword } from './password';

export const COOKIE = 'sm_admin';
const MAX_AGE = 60 * 60 * 24 * 30;

let fallbackSecret: string | undefined;
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!fallbackSecret) {
    console.warn('[auth] SESSION_SECRET غير مضبوط؛ ستنتهي الجلسات عند إعادة تشغيل الخادم.');
    fallbackSecret = randomBytes(32).toString('hex');
  }
  return fallbackSecret;
}

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');
// بصمة من كلمة المرور الحالية: تغيير كلمة المرور يُبطل الجلسات القديمة.
const stamp = (passwordHash: string) => sign(`pw:${passwordHash}`).slice(0, 16);

export interface AdminUser {
  id: number;
  username: string;
}

export interface UserRow extends mysql.RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
}

async function findUser(where: 'id' | 'username', value: string | number) {
  const [rows] = await (await db()).query<UserRow[]>(
    `SELECT id, username, password_hash FROM users WHERE ${where} = ? LIMIT 1`,
    [value],
  );
  return rows[0];
}

export function setSession(cookies: AstroCookies, user: UserRow, secure: boolean) {
  const payload = Buffer.from(JSON.stringify({ u: user.id, p: stamp(user.password_hash), e: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  cookies.set(COOKIE, `${payload}.${sign(payload)}`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: MAX_AGE,
  });
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}

export async function currentUser(cookies: AstroCookies): Promise<AdminUser | undefined> {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return undefined;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return undefined;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const { u, p, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof e !== 'number' || e < Date.now()) return undefined;
    const user = await findUser('id', u);
    if (!user || stamp(user.password_hash) !== p) return undefined;
    return { id: user.id, username: user.username };
  } catch {
    return undefined;
  }
}

// حد بسيط لمحاولات الدخول الخاطئة: 8 محاولات لكل عنوان، و20 لكل اسم مستخدم، كل 15 دقيقة.
// عدّاد اسم المستخدم مهم لأن عنوان الزائر يُقرأ من X-Forwarded-For، ويمكن تزويره لتغيير العنوان مع كل محاولة.
const failures = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60 * 1000;
const LIMITS = { ip: 8, user: 20 };

const keys = (ip: string, username: string) =>
  [[`ip:${ip}`, LIMITS.ip], [`user:${username.toLowerCase()}`, LIMITS.user]] as const;

export function loginBlocked(ip: string, username = ''): boolean {
  return keys(ip, username).some(([key, limit]) => {
    const f = failures.get(key);
    return Boolean(f && f.until > Date.now() && f.n >= limit);
  });
}

function recordFailure(key: string) {
  const f = failures.get(key);
  failures.set(key, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + WINDOW });
  // تنظيف المداخل المنتهية حتى لا تكبر الذاكرة مع محاولات من عناوين كثيرة.
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.until <= Date.now()) failures.delete(k);
}

export async function login(username: string, password: string, ip: string): Promise<UserRow | undefined> {
  const user = username ? await findUser('username', username) : undefined;
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (ok) {
    for (const [key] of keys(ip, username)) failures.delete(key);
    return user;
  }
  for (const [key] of keys(ip, username)) recordFailure(key);
  return undefined;
}

export async function changePassword(userId: number, current: string, next: string): Promise<UserRow | string> {
  const user = await findUser('id', userId);
  if (!user || !(await verifyPassword(current, user.password_hash))) return 'كلمة المرور الحالية غير صحيحة.';
  if (next.length < 8) return 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.';
  const hash = await hashPassword(next);
  await (await db()).query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, userId]);
  return { ...user, password_hash: hash } as UserRow;
}

export async function listUsers(): Promise<AdminUser[]> {
  const [rows] = await (await db()).query<UserRow[]>(`SELECT id, username FROM users ORDER BY id`);
  return rows.map((r) => ({ id: r.id, username: r.username }));
}

export async function addUser(username: string, password: string): Promise<string | undefined> {
  if (!/^[\p{L}\p{N}._-]{3,64}$/u.test(username)) return 'اسم المستخدم من 3 إلى 64 حرفًا، بدون مسافات.';
  if (password.length < 8) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.';
  if (await findUser('username', username)) return 'اسم المستخدم موجود بالفعل.';
  await (await db()).query(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, await hashPassword(password)]);
}

export async function removeUser(id: number) {
  await (await db()).query(`DELETE FROM users WHERE id = ?`, [id]);
}

/** عنوان الزائر الحقيقي خلف بروكسي الاستضافة. */
export function clientIp(request: Request, fallback: string): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || fallback;
}

export function isHttps(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  return (proto ?? new URL(request.url).protocol.replace(':', '')) === 'https';
}
