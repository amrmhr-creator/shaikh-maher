// حفظ الملفات المرفوعة من لوحة التحكم على مساحة الاستضافة.
// UPLOAD_DIR: مجلد الحفظ (يفضل خارج مجلد التطبيق حتى لا يُمسح مع كل نشر).
// UPLOAD_URL: الرابط العام للمجلد؛ إذا كان مسارًا مثل /uploads/ يخدم الموقع الملفات بنفسه.
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
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

/** يخدم ملفًا مرفوعًا (rel مسار داخل UPLOAD_DIR)، مع دعم Range للتقديم في الصوت والفيديو. */
export async function serveUpload(request: Request, rel: string): Promise<Response> {
  const missing = () => new Response('الملف غير موجود', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  let file: string;
  try {
    file = path.resolve(UPLOAD_DIR, decodeURIComponent(rel));
  } catch {
    return missing();
  }
  if (!file.startsWith(UPLOAD_DIR + path.sep)) return missing();
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) return missing();

  const headers = new Headers({
    'Content-Type': TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  // دعم Range حتى يعمل التقديم والتأخير في الملفات الصوتية والمرئية.
  const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(0, info.size - Number(range[2]));
    }
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}
