import { env } from 'cloudflare:workers';

export function studyDB(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('学习数据库暂不可用');
  return db;
}
