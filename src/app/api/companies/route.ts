import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const companies = await sql`
    SELECT * FROM companies WHERE user_id = ${session.userId} ORDER BY code, name
  `;

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, code, memo, tool_type } = await req.json();
  if (!name) return NextResponse.json({ error: '事業所名を入力してください' }, { status: 400 });

  const result = await sql`
    INSERT INTO companies (user_id, name, code, memo, tool_type)
    VALUES (${session.userId}, ${name}, ${code || null}, ${memo || null}, ${tool_type || 'all'})
    RETURNING *
  `;

  return NextResponse.json(result[0], { status: 201 });
}
