import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/users — ユーザー一覧（管理者のみ）
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const users = await sql`
    SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC
  `;

  return NextResponse.json(users);
}

// POST /api/users — ユーザー作成（管理者のみ）
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { email, name, password, role } = await req.json();

  if (!email || !name || !password) {
    return NextResponse.json({ error: '氏名・メールアドレス・パスワードは必須です' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const validRole = role === 'admin' ? 'admin' : 'staff';
  const result = await sql`
    INSERT INTO users (email, name, password_hash, role) VALUES (${email}, ${name}, ${hash}, ${validRole})
    RETURNING id, email, name, role, created_at
  `;

  return NextResponse.json(result[0], { status: 201 });
}
