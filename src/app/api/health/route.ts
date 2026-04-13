import { NextResponse } from 'next/server';

export async function GET() {
  const hasDb = !!process.env.DATABASE_URL;
  const dbPreview = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.substring(0, 30) + '...'
    : 'NOT SET';
  return NextResponse.json({ ok: true, hasDb, dbPreview });
}
