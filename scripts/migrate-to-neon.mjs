import { neon } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = 'postgresql://neondb_owner:npg_HKUYPb7oTpZ5@ep-divine-haze-a1eq5ujo.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);
const sqlite = new Database(path.join(__dirname, '../data/app.db'));

async function migrate() {
  console.log('テーブルを作成中...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      code TEXT,
      memo TEXT,
      tool_type TEXT NOT NULL DEFAULT 'all',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('ユーザーデータを移行中...');
  const users = sqlite.prepare('SELECT * FROM users ORDER BY id').all();
  for (const user of users) {
    await sql`
      INSERT INTO users (id, email, name, password_hash, role)
      VALUES (${user.id}, ${user.email}, ${user.name}, ${user.password_hash}, ${user.role || 'staff'})
      ON CONFLICT (email) DO NOTHING
    `;
    console.log(`  ✓ ${user.name} (${user.email})`);
  }

  // シーケンスをリセット
  await sql`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`;

  console.log('事業所データを移行中...');
  const companies = sqlite.prepare('SELECT * FROM companies ORDER BY id').all();
  for (const company of companies) {
    await sql`
      INSERT INTO companies (id, user_id, name, code, memo, tool_type)
      VALUES (${company.id}, ${company.user_id}, ${company.name}, ${company.code}, ${company.memo}, ${company.tool_type || 'all'})
      ON CONFLICT DO NOTHING
    `;
    console.log(`  ✓ ${company.name}`);
  }

  if (companies.length > 0) {
    await sql`SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies))`;
  }

  console.log('✅ 移行完了！');
  sqlite.close();
}

migrate().catch(console.error);
