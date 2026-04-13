import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSession } from '@/lib/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { name, code, memo, tool_type } = await req.json();

  const check = await sql`SELECT id FROM companies WHERE id = ${id} AND user_id = ${session.userId}`;
  if (check.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await sql`
    UPDATE companies SET name=${name}, code=${code || null}, memo=${memo || null}, tool_type=${tool_type || 'all'}
    WHERE id=${id}
    RETURNING *
  `;

  return NextResponse.json(result[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const check = await sql`SELECT id FROM companies WHERE id = ${id} AND user_id = ${session.userId}`;
  if (check.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql`DELETE FROM companies WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
