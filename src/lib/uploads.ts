// حفظ الملفات المرفوعة من لوحة التحكم على مساحة الاستضافة.
// UPLOAD_DIR: مجلد الحفظ (يفضل خارج مجلد التطبيق حتى لا يُمسح مع كل نشر).
// UPLOAD_URL: الرابط العام للمجلد؛ إذا كان مسارًا مثل /uploads/ يخدم الموقع الملفات بنفسه.
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
export const UPLOAD_URL = (process.env.UPLOAD_URL || '/uploads/').replace(/\/?$/, '/');

export const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

export const isUpload = (v: unknown): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v && (v as File).size > 0;

export async function saveUpload(file: File, folder: string): Promise<string> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!TYPES[ext]) throw new Error(`نوع الملف «${file.name}» غير مسموح. المسموح: ${Object.keys(TYPES).join('، ')}`);
  const month = new Date().toISOString().slice(0, 7);
  const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
  const rel = `${folder.replace(/[^a-z0-9-]/gi, '')}/${month}/${name}`;
  const dest = path.join(UPLOAD_DIR, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return UPLOAD_URL + rel;
}
