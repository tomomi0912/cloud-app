import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { getSession } from '@/lib/session';

// PATCH /api/users/[id] — ユーザー更新（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { id } = await params;
  const { name, email, role, password } = await req.json();

  const existing = await sql`SELECT id FROM users WHERE id = ${id}`;
  if (existing.length === 0) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

  if (email) {
    const dup = await sql`SELECT id FROM users WHERE email = ${email} AND id != ${id}`;
    if (dup.length > 0) return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 400 });
  }

  if (password) {
    if (password.length < 8) return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
  }

  const validRole = role === 'admin' ? 'admin' : 'staff';
  const result = await sql`
    UPDATE users SET name = ${name}, email = ${email}, role = ${validRole} WHERE id = ${id}
    RETURNING id, email, name, role, created_at
  `;

  return NextResponse.json(result[0]);
}

// DELETE /api/users/[id] — ユーザー削除（管理者のみ・自分自身は不可）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { id } = await params;

  if (Number(id) === session.userId) {
    return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM users WHERE id = ${id}`;
  if (existing.length === 0) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
