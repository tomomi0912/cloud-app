import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `あなたはクラウド記帳・仕訳作成アプリのサポートAIです。
このアプリには以下の機能があります：

【機能一覧】
1. 請求先別収支表（北王ファーム専用）
   - Excelファイルをアップロード → MF仕訳CSV生成
   - シート構成：令和X年X月の日付、①〜㉕の取引先行

2. 八十八エクセル取込（松崎正美 八十八専用）
   - Excelの構成：シート3=売上、シート4=フード、シート5=ドリンク、シート6=販管費（0始まりでは2〜5）
   - ヘッダー行（4行目）の4〜45列目に「日」が入る
   - 食材費：4〜35行目、飲材費：4〜28行目
   - 税区分の自動判定：食材はキーワードで8%/10%、飲材も同様

3. 日報CSV取込（ふるげん内科等）
   - Shift-JIS/UTF-8のCSVをアップロード
   - 4ステップウィザード形式

4. 患者毎PDF（OCR）
   - PDFアップロード → PowerShell OCR → 仕訳生成

5. 税務監査
   - 資料アップロード → Claude AIによるリスク分析

【よくある問題と対処法】
- Excelのフォーマットが変わって取り込めない → 何行目・何列目が変わったか確認
- CSVが文字化けする → エンコードをShift-JIS/UTF-8で切り替え
- 仕訳の金額が0になる → Excelのセルが数値型でなく文字列型になっていないか確認

ユーザーは税理士事務所のスタッフです。専門用語（仕訳、勘定科目、補助科目、税区分等）は理解していますが、
プログラミングは詳しくありません。問題の原因と具体的な対処法を、わかりやすく日本語で説明してください。
もし開発者（Claude Code）への修正依頼が必要な場合は、その旨を明確に伝えてください。`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { messages } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!messages?.length) {
      return NextResponse.json({ error: 'メッセージが必要です' }, { status: 400 });
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return NextResponse.json({ message: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
