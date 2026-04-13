import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { createSession, COOKIE_NAME } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json();

  if (!email || !name || !password) {
    return NextResponse.json({ error: '全項目を入力してください' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await sql`
    INSERT INTO users (email, name, password_hash) VALUES (${email}, ${name}, ${hash}) RETURNING id
  `;
  const userId = result[0].id as number;

  const token = await createSession({ userId, email, name, role: 'staff' });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
