import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { createSession, COOKIE_NAME } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 });
  }

  let rows;
  try {
    rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  } catch (err) {
    return NextResponse.json({ error: 'DB接続エラー: ' + String(err) }, { status: 500 });
  }

  const user = rows[0] as {
    id: number; email: string; name: string; password_hash: string; role: string;
  } | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
  }

  const token = await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role || 'staff' });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
