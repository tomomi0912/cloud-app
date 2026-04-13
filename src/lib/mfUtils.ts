// MF仕訳インポートCSVのヘッダー
export const MF_HEADERS = [
  '取引No', '取引日',
  '借方勘定科目', '借方補助科目', '借方部門', '借方取引先', '借方税区分', '借方インボイス', '借方金額(円)', '借方税額',
  '貸方勘定科目', '貸方補助科目', '貸方部門', '貸方取引先', '貸方税区分', '貸方インボイス', '貸方金額(円)', '貸方税額',
  '摘要', '仕訳メモ', 'タグ', 'MF仕訳タイプ', '決算整理仕訳', '作成日時', '作成者', '最終更新日時', '最終更新者',
];

export interface JournalRow {
  txNo: number;
  date: string;
  dAcc: string; dSub: string; dDept: string; dVen: string; dTax: string; dInv: string; dAmt: number; dTaxAmt: number;
  cAcc: string; cSub: string; cDept: string; cVen: string; cTax: string; cInv: string; cAmt: number; cTaxAmt: number;
  tekiyo: string; memo: string; tags: string; mfType: string; yearEnd: string;
  isFirst: boolean;
}

export function journalToRow(r: JournalRow): (string | number)[] {
  return [
    r.txNo, r.date,
    r.dAcc, r.dSub, r.dDept, r.dVen, r.dTax, r.dInv, r.dAmt, r.dTaxAmt,
    r.cAcc, r.cSub, r.cDept, r.cVen, r.cTax, r.cInv, r.cAmt, r.cTaxAmt,
    r.tekiyo, r.memo, r.tags, r.mfType, r.yearEnd, '', '', '', '',
  ];
}

export function toCsvLine(values: (string | number)[]): string {
  return values.map(v => {
    const s = String(v ?? '');
    return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

export function buildCsv(journal: JournalRow[]): string {
  const hdr = MF_HEADERS.join(',');
  const body = journal.map(r => toCsvLine(journalToRow(r)));
  return '\uFEFF' + [hdr, ...body].join('\r\n'); // UTF-8 BOM
}

export function downloadCsv(csvText: string, filename: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const fmt = (n: number | undefined | null) => (n || 0).toLocaleString('ja-JP');
export const parseNum = (s: string) => { const n = parseInt(String(s).replace(/[^\d]/g, '')); return isNaN(n) ? 0 : n; };
