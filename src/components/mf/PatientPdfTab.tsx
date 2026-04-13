'use client';

import { useState, useRef } from 'react';
import { JournalRow, buildCsv, downloadCsv, fmt, parseNum } from '@/lib/mfUtils';
import { apiFetch } from '@/lib/apiFetch';

interface PayRow { date: string; grand: number; cash: number; credit: number; emoney: number; qr: number; patients: number; }

function parseOcrText(text: string, year: number): { date: string; cash: number; credit: number }[] {
  const results: { date: string; cash: number; credit: number }[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const dPatterns = [
      /(?:令和|R)\s*\d+\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
      /(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
      /(?:\d{4}[\/\-])(\d{1,2})[\/\-](\d{1,2})/,
      /^(\d{1,2})[\/\-．.](\d{1,2})$/,
    ];
    let mm: number | null = null, dd: number | null = null;
    for (const pat of dPatterns) {
      const m = line.match(pat);
      if (m) { mm = parseInt(m[1]); dd = parseInt(m[2]); break; }
    }
    if (mm === null || dd === null || mm < 1 || mm > 12 || dd < 1 || dd > 31) continue;
    const date = `${year}/${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}`;
    const nums = [...line.matchAll(/[\d,，]{4,}/g)]
      .map(x => parseNum(x[0])).filter(n => n >= 1000 && n <= 9_999_999);
    if (nums.length === 0) continue;
    const exist = results.find(r => r.date === date);
    if (exist) {
      const all = [...nums, exist.cash, exist.credit].filter(n => n > 0).sort((a, b) => b - a);
      exist.cash = all[0] || 0; exist.credit = all[1] || 0;
    } else {
      const sorted = [...nums].sort((a, b) => b - a);
      results.push({ date, cash: sorted[0] || 0, credit: sorted[1] || 0 });
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function genJournal(rows: PayRow[]): JournalRow[] {
  const result: JournalRow[] = [];
  let txNo = 1;
  for (const r of rows) {
    const { date, grand, cash, credit, emoney, qr } = r;
    if (!grand && !cash && !credit && !emoney && !qr) { txNo++; continue; }
    const tekiyo = `${date} 患者窓口売上`;
    const methods = [
      { acc: '現金',             sub: '窓口現金',          amt: cash   },
      { acc: '医業未収金',       sub: 'ｸﾚｼﾞｯﾄｶｰﾄﾞ払い',  amt: credit },
      { acc: '電子マネー売掛金', sub: '',                  amt: emoney },
      { acc: 'QR売掛金',         sub: '',                  amt: qr     },
    ].filter(m => m.amt > 0);
    if (methods.length === 0) { txNo++; continue; }
    methods.forEach((m, idx) => result.push({
      txNo, date: idx === 0 ? date : '',
      dAcc: m.acc, dSub: m.sub, dDept: '', dVen: '', dTax: '対象外', dInv: '', dAmt: m.amt, dTaxAmt: 0,
      cAcc: '窓口現金勘定', cSub: '', cDept: '', cVen: '', cTax: '非課税売上', cInv: '', cAmt: m.amt, cTaxAmt: 0,
      tekiyo: idx === 0 ? tekiyo : '', memo: '', tags: '', mfType: '', yearEnd: '',
      isFirst: idx === 0,
    }));
    txNo++;
  }
  return result;
}

export default function PatientPdfTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PayRow[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrPct, setOcrPct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setFileName(file.name);
    setError('');
    setLoading(true);
    setOcrPct(0);
    setOcrProgress('PDFをアップロード中...');
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      setOcrProgress('OCR処理中...');
      const res = await apiFetch('/api/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'OCRエラー'); return; }
      setOcrPct(100);
      const extracted: Record<string, { cash: number; credit: number }> = {};
      for (let i = 0; i < data.texts.length; i++) {
        setOcrProgress(`テキスト解析中... ${i + 1} / ${data.pageCount} ページ`);
        setOcrPct(Math.round(((i + 1) / data.texts.length) * 100));
        const parsed = parseOcrText(data.texts[i], year);
        for (const r of parsed) {
          if (!extracted[r.date]) extracted[r.date] = { cash: 0, credit: 0 };
          extracted[r.date].cash += r.cash;
          extracted[r.date].credit += r.credit;
        }
      }
      const sorted = Object.entries(extracted)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, grand: 0, cash: v.cash, credit: v.credit, emoney: 0, qr: 0, patients: 0 }));
      if (sorted.length === 0) {
        setError('OCRで日付＋金額を自動抽出できませんでした。各行を手動で入力してください。');
        setRows([{ date: `${year}/${String(month).padStart(2,'0')}/01`, grand: 0, cash: 0, credit: 0, emoney: 0, qr: 0, patients: 0 }]);
      } else {
        setRows(sorted);
        setOcrProgress(`完了: ${sorted.length}日分のデータを抽出しました`);
      }
    } finally {
      setLoading(false);
    }
  }

  function updateRow(i: number, field: keyof PayRow, val: number) {
    setRows(prev => prev.map((r, ri) => ri === i ? { ...r, [field]: val } : r));
  }

  function addRow() {
    setRows(prev => [...prev, { date: '', grand: 0, cash: 0, credit: 0, emoney: 0, qr: 0, patients: 0 }]);
  }

  function genAndShow() {
    const jrn = genJournal(rows);
    if (jrn.length === 0) { alert('仕訳データがありません。金額を入力してください。'); return; }
    setJournal(jrn);
    setShowJournal(true);
  }

  function doDownload() {
    const jrn = genJournal(rows);
    if (jrn.length === 0) { alert('仕訳データがありません。'); return; }
    const csv = buildCsv(jrn);
    const mm = String(month).padStart(2, '0');
    downloadCsv(csv, `${year}年${mm}月分_患者毎売上帳票_MF仕訳インポート.csv`);
  }

  // 集計
  let tDays = 0, tCash = 0, tCred = 0, tGrand = 0, tEmon = 0, tQr = 0, tPat = 0;
  for (const r of rows) {
    if (r.cash + r.credit + r.emoney + r.qr + r.grand > 0) tDays++;
    tCash += r.cash; tCred += r.credit; tGrand += r.grand; tEmon += r.emoney; tQr += r.qr; tPat += r.patients;
  }

  const payTotal = tCash + tCred + tEmon + tQr;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* ツールバー */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <label className="text-xs text-gray-500">PDF:</label>
        <span className="text-xs text-gray-700 max-w-xs truncate">{fileName || '未選択'}</span>
        <button onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">
          参照...
        </button>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <label className="text-xs text-gray-500">年:</label>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)}
          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center" />
        <label className="text-xs text-gray-500">月:</label>
        <input type="number" value={month} onChange={e => setMonth(Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
          min={1} max={12} className="w-12 px-2 py-1 border border-gray-200 rounded text-xs text-center" />
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button onClick={() => inputRef.current?.click()} disabled={loading}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          🔍 OCRで読み込む
        </button>
        <button onClick={genAndShow} disabled={rows.length === 0 || loading}
          className="px-3 py-1.5 bg-green-700 text-white text-xs rounded font-medium hover:bg-green-800 disabled:opacity-50">
          仕訳プレビュー
        </button>
        <button onClick={doDownload} disabled={rows.length === 0 || loading}
          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded font-medium hover:bg-green-700 disabled:opacity-50">
          ⬇ CSVダウンロード
        </button>
      </div>

      {/* プログレスバー */}
      {loading && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${ocrPct}%` }} />
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">{ocrProgress}</span>
        </div>
      )}

      {/* ステータスバー */}
      <div className="bg-white border-b border-gray-100 px-4 py-1.5 flex gap-4 text-xs flex-shrink-0">
        <StatItem label="日数" val={tDays} />
        <StatItem label="現金合計" val={fmt(tCash)} />
        <StatItem label="クレジット合計" val={fmt(tCred)} />
        <StatItem label="請求合計" val={fmt(tGrand)} />
      </div>

      {error && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-700 flex-shrink-0">{error}</div>
      )}

      {/* データテーブル */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs border-collapse w-full" style={{ minWidth: 700 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {['#','取引日','請求合計','現金（円）','クレジット（円）','電子マネー（円）','QR（円）','確認','患者数'].map(h =>
                <th key={h} className={`px-3 py-2 border border-gray-200 bg-gray-700 text-white text-left whitespace-nowrap ${
                  ['請求合計','現金（円）','クレジット（円）','電子マネー（円）','QR（円）','患者数'].includes(h) ? 'text-right' : ''}`}>
                  {h}
                </th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">PDFを選択してOCRで読み込んでください</td></tr>
            ) : rows.map((r, i) => {
              const total = r.cash + r.credit + r.emoney + r.qr;
              const hasOcr = r.cash > 0 || r.credit > 0;
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1 border border-gray-100 text-center text-gray-400">{i + 1}</td>
                  <td className="px-2 py-1 border border-gray-100">
                    <input type="text" value={r.date}
                      onChange={e => setRows(prev => prev.map((row, ri) => ri === i ? { ...row, date: e.target.value } : row))}
                      className="w-28 px-1 py-0.5 border border-gray-200 rounded text-xs" />
                  </td>
                  {(['grand','cash','credit','emoney','qr'] as const).map(field => (
                    <td key={field} className="px-2 py-1 border border-gray-100">
                      <input type="number" value={r[field] || ''} min={0}
                        onChange={e => updateRow(i, field, parseInt(e.target.value) || 0)}
                        className={`w-24 px-1 py-0.5 border rounded text-xs text-right
                          ${hasOcr && (field === 'cash' || field === 'credit') && r[field] > 0
                            ? 'bg-blue-50 border-blue-300'
                            : 'border-gray-200'}`} />
                    </td>
                  ))}
                  <td className="px-2 py-1 border border-gray-100 text-center">
                    {r.grand === 0 && total === 0
                      ? <span className="text-gray-400">-</span>
                      : total === r.grand
                        ? <span className="text-green-600 font-bold">✓</span>
                        : <span className="text-red-500">✗ {fmt(total - r.grand)}</span>}
                  </td>
                  <td className="px-2 py-1 border border-gray-100">
                    <input type="number" value={r.patients || ''} min={0}
                      onChange={e => updateRow(i, 'patients', parseInt(e.target.value) || 0)}
                      className="w-16 px-1 py-0.5 border border-gray-200 rounded text-xs text-right" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-yellow-50 font-bold">
                <td className="px-2 py-1.5 border border-gray-200" />
                <td className="px-2 py-1.5 border border-gray-200 text-center">合計</td>
                {[tGrand, tCash, tCred, tEmon, tQr].map((v, i) =>
                  <td key={i} className="px-2 py-1.5 border border-gray-200 text-right">{fmt(v)}</td>)}
                <td className="px-2 py-1.5 border border-gray-200 text-center">
                  {payTotal === tGrand
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-red-500 text-xs">✗ {fmt(payTotal - tGrand)}</span>}
                </td>
                <td className="px-2 py-1.5 border border-gray-200 text-right">{fmt(tPat)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex-shrink-0">
        <button onClick={addRow} className="text-xs text-blue-600 hover:underline">＋ 行を追加</button>
      </div>

      {/* 仕訳プレビューモーダル */}
      {showJournal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">MF仕訳プレビュー（先頭50行）</h3>
              <button onClick={() => setShowJournal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="text-xs whitespace-nowrap border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    {['取引No','取引日','借方勘定科目','借方補助科目','借方税区分','借方金額','貸方勘定科目','貸方補助科目','貸方税区分','貸方金額','摘要'].map(h =>
                      <th key={h} className="px-3 py-2 border border-gray-200">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {journal.slice(0, 50).map((r, i) => (
                    <tr key={i} className={r.isFirst ? 'border-t-2 border-gray-300' : ''}>
                      <td className="px-3 py-1 border border-gray-100">{r.txNo}</td>
                      <td className="px-3 py-1 border border-gray-100">{r.date}</td>
                      <td className="px-3 py-1 border border-gray-100">{r.dAcc}</td>
                      <td className="px-3 py-1 border border-gray-100 text-gray-500">{r.dSub}</td>
                      <td className="px-3 py-1 border border-gray-100 text-gray-500">{r.dTax}</td>
                      <td className="px-3 py-1 border border-gray-100 text-right font-semibold">{r.dAmt ? fmt(r.dAmt) : ''}</td>
                      <td className="px-3 py-1 border border-gray-100">{r.cAcc}</td>
                      <td className="px-3 py-1 border border-gray-100 text-gray-500">{r.cSub}</td>
                      <td className="px-3 py-1 border border-gray-100 text-gray-500">{r.cTax}</td>
                      <td className="px-3 py-1 border border-gray-100 text-right font-semibold">{r.cAmt ? fmt(r.cAmt) : ''}</td>
                      <td className="px-3 py-1 border border-gray-100 text-gray-500">{r.tekiyo}</td>
                    </tr>
                  ))}
                  {journal.length > 50 && (
                    <tr><td colSpan={11} className="px-3 py-2 text-center text-gray-400">… 他 {journal.length - 50} 行</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-gray-200">
              <button onClick={() => setShowJournal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">閉じる</button>
              <button onClick={() => { doDownload(); setShowJournal(false); }}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium">
                ⬇ MF仕訳CSVをダウンロード
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, val }: { label: string; val: string | number }) {
  return (
    <span className="text-gray-600">
      <span className="text-gray-400">{label}: </span>
      <span className="font-medium">{val}</span>
    </span>
  );
}
