import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PS_SCRIPT = path.join(process.cwd(), 'scripts', 'pdf_ocr.ps1');

function runPs(args: string[], timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', PS_SCRIPT,
      ...args,
    ], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || (err as NodeJS.ErrnoException).message || '').trim()));
      else resolve(stdout.trim());
    });
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let tmpPath = '';
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    if (!file) return NextResponse.json({ error: 'PDFファイルが必要です' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(os.tmpdir(), `ocr-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buf);

    const countStr = await runPs(['-pdfPath', tmpPath, '-mode', 'pagecount']);
    const pageCount = parseInt(countStr);
    if (isNaN(pageCount) || pageCount < 1) {
      return NextResponse.json({ error: 'PDFページ数を取得できませんでした' }, { status: 500 });
    }

    const texts: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const text = await runPs(
        ['-pdfPath', tmpPath, '-mode', 'ocr', '-pageIndex', String(i), '-width', '2000'],
        120000
      );
      texts.push(text);
    }

    return NextResponse.json({ texts, pageCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'OCRエラー: ' + msg }, { status: 500 });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

export const maxDuration = 300;
