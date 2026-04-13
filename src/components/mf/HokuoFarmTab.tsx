'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { buildCsv, downloadCsv } from '@/lib/mfUtils';
import type { JournalRow } from '@/lib/mfUtils';

// ── 税区分 ──────────────────────────────────────────────────────
const TAX_OPTIONS = ['対象外', '課税売上 10%', '課税仕入 10%', '不課税', '非課税売上', '非課税仕入'];

// ── Excel パース ─────────────────────────────────────────────────
function parseJournal(data: (string | number | null)[][]): Omit<JournalRow, 'txNo' | 'isFirst'>[] {
  const entries: Omit<JournalRow, 'txNo' | 'isFirst'>[] = [];

  // 年月取得
  let year: number | null = null, month: number | null = null;
  for (const row of data) {
    for (const cell of row) {
      if (typeof cell === 'string') {
        const m = cell.match(/令和\s*(\d+)年\s*(\d+)月/);
        if (m) { year = 2018 + parseInt(m[1]); month = parseInt(m[2]); break; }
      }
    }
    if (year) break;
  }
  if (!year || !month) return [];

  const lastDay = new Date(year, month, 0).getDate();
  const dateStr = `${year}/${String(month).padStart(2,'0')}/${String(lastDay).padStart(2,'0')}`;
  const ym = `R${year - 2018}.${month}`;

  function push(dr: string, drTax: string, cr: string, crTax: string, amt: number, desc: string, clientName = '') {
    if (amt <= 0) return;
    const drSub = (dr === '売掛金' && clientName) ? clientName : '';
    const crSub = (cr === '立替金' && clientName) ? clientName : '';
    entries.push({
      date: dateStr,
      dAcc: dr, dSub: drSub, dDept: '', dVen: '', dTax: drTax, dInv: '', dAmt: Math.round(amt), dTaxAmt: 0,
      cAcc: cr, cSub: crSub, cDept: '', cVen: '', cTax: crTax, cInv: '', cAmt: Math.round(amt), cTaxAmt: 0,
      tekiyo: desc, memo: '', tags: '', mfType: '', yearEnd: '',
    });
  }

  // メインテーブル（①〜㉕）
  const circleSet = new Set('①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕'.split(''));
  const normName = (s: string | number | null) => s ? String(s).replace(/[\s\u3000]+/g, ' ').trim() : '';

  for (const row of data) {
    const a0 = row[0] ? String(row[0]).trim() : '';
    if (!circleSet.has(a0)) continue;
    const name = normName(row[1]);
    const amt = typeof row[2] === 'number' ? row[2] : 0;
    if (!name || amt <= 0) continue;
    push('売掛金', '対象外', '売上高', '課税売上 10%', amt, `${name} ${ym}売上`, name);
  }

  // 特殊セクション開始位置
  let specialStart = data.length;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row[1] && typeof row[1] === 'string' && row[1].replace(/[\s　]/g,'').includes('合計') && !row[0]) {
      specialStart = i + 1; break;
    }
  }

  // 特殊セクション
  for (let i = specialStart; i < data.length; i++) {
    const row  = data[i];
    const colB = row[1]  ? String(row[1]).trim()  : '';
    const col12= row[12] ? String(row[12]).trim() : '';
    const col13= row[13] ? String(row[13]).trim() : '';
    const num  = (v: string | number | null) => typeof v === 'number' ? v : 0;

    if (colB === 'HACHIYA')
      push('売掛金','対象外','売上高','課税売上 10%', num(row[2]), `HACHIYA 利用料 ${ym}`, 'HACHIYA');
    if (colB === '馬場牧場')
      push('売掛金','対象外','立替金','対象外', num(row[3]), `馬場牧場 タイヤ代立替 ${ym}`, '馬場牧場');
    if (col12 === 'ホーディー')
      push('売掛金','対象外','売上高','対象外', num(row[13]), `ホーディー 追加請求 ${ym}`, 'ホーディー');
    if (colB === '青野実業')
      push('売掛金','対象外','立替金','対象外', num(row[3]), `青野実業 計量代立替 ${ym}`, '青野実業');
    if (col12 === 'ボクソーヤ')
      push('売掛金','対象外','立替金','対象外', num(row[14]), `ボクソーヤ 計量代立替 ${ym}`, 'ボクソーヤ');
    if (colB === 'きたそらち肉牛組合')
      push('売掛金','対象外','立替金','対象外', num(row[2]), `きたそらち ホイールローダー ${ym}`, 'きたそらち肉牛組合');
    if (col13 === '藤原畜産')
      push('売掛金','対象外','立替金','対象外', num(row[15]), `藤原畜産 富永燃料代立替 ${ym}`, '藤原畜産');
    if (colB === '細谷地商店') {
      const ch300 = num(row[3]), ch2101 = num(row[5]), ferry = num(row[10]);
      const ryoTotal = ch300 + ch2101;
      if (ryoTotal > 0) push('売掛金','対象外','売上高','課税売上 10%', ryoTotal, `細谷地商店 利用料 ${ym}`, '細谷地商店');
      if (ferry   > 0) push('売掛金','対象外','立替金','対象外', ferry, `細谷地商店 立替費用 ${ym}`, '細谷地商店');
    }
    if (colB.replace(/[\s　]/g,'') === '田村元')
      push('売掛金','対象外','立替金','対象外', num(row[2]), `田村元 フェリー・タイヤ立替 ${ym}`, '田村元');
    if (col13 === '東大雪肉牛牧場')
      push('売掛金','対象外','立替金','対象外', num(row[15]), `東大雪 タイヤ・原料代立替 ${ym}`, '東大雪肉牛牧場');
    if (colB === 'シェルトレイド') {
      let monthCol = -1;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        for (let k = 0; k < data[j].length; k++) {
          if (data[j][k] && String(data[j][k]).includes(`${month}月分`)) { monthCol = k; break; }
        }
        if (monthCol >= 0) break;
      }
      if (monthCol >= 0)
        push('売掛金','対象外','売上高','課税売上 10%', num(row[monthCol]), `シェルトレイド ${ym}分`, 'シェルトレイド');
    }
  }

  return entries;
}

// ── 編集行の型 ──────────────────────────────────────────────────
interface EditRow {
  id: number;
  date: string; dr: string; drSub: string; drTax: string; drAmt: number;
  cr: string; crSub: string; crTax: string; crAmt: number;
  desc: string;
}

let _nextId = 1;

export default function HokuoFarmTab() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  let toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  function loadFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buf = e.target?.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
        const parsed = parseJournal(data as (string | number | null)[][]);
        if (parsed.length === 0) { showToast('仕訳を生成できませんでした。ファイル形式を確認してください。'); return; }
        setRows(parsed.map(e => ({
          id: _nextId++,
          date: e.date, dr: e.dAcc, drSub: e.dSub, drTax: e.dTax, drAmt: e.dAmt,
          cr: e.cAcc, crSub: e.cSub, crTax: e.cTax, crAmt: e.cAmt,
          desc: e.tekiyo,
        })));
        showToast(`${parsed.length} 件の仕訳を生成しました。`);
      } catch (err) {
        showToast('エラー: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function update(id: number, field: keyof EditRow, val: string | number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }

  function addRow() {
    const defDate = rows[0]?.date || '';
    setRows(prev => [...prev, {
      id: _nextId++, date: defDate,
      dr: '売掛金', drSub: '', drTax: '対象外', drAmt: 0,
      cr: '売上高', crSub: '', crTax: '課税売上 10%', crAmt: 0,
      desc: '',
    }]);
  }

  function deleteRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function applyBulkDate() {
    if (!bulkDate) return;
    const d = bulkDate.replace(/-/g, '/');
    setRows(prev => prev.map(r => ({ ...r, date: d })));
    showToast('取引日を ' + d + ' に一括変更しました。');
  }

  function exportCsv() {
    if (rows.length === 0) return;
    const journal: JournalRow[] = rows.map((r, i) => ({
      txNo: i + 1, isFirst: true,
      date: r.date,
      dAcc: r.dr, dSub: r.drSub, dDept: '', dVen: '', dTax: r.drTax, dInv: '', dAmt: r.drAmt, dTaxAmt: 0,
      cAcc: r.cr, cSub: r.crSub, cDept: '', cVen: '', cTax: r.crTax, cInv: '', cAmt: r.crAmt, cTaxAmt: 0,
      tekiyo: r.desc, memo: '', tags: '', mfType: '', yearEnd: '',
    }));
    const csv = buildCsv(journal);
    const base = fileName.replace(/\.xlsx?$/i, '');
    downloadCsv(csv, `MF仕訳_${base}.csv`);
    showToast('CSVをダウンロードしました。');
  }

  // 集計
  const drTotal = rows.reduce((s, r) => s + (r.drAmt || 0), 0);
  const crTotal = rows.reduce((s, r) => s + (r.crAmt || 0), 0);
  const mismatch = drTotal !== crTotal;

  return (
    <div className="h-full flex flex-col bg-[#f0f2f5]">
      {/* ツールバー */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
        <label className="text-xs text-gray-500 whitespace-nowrap">Excelファイル:</label>
        <span className="text-xs text-gray-700 max-w-xs truncate flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded px-2 py-1">
          {fileName || '請求先別収支表 .xlsx を選択...'}
        </span>
        <button onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 whitespace-nowrap">
          参照
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { loadFile(f); e.target.value = ''; } }} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!fileName}
          className="px-3 py-1.5 bg-blue-700 text-white text-xs rounded font-bold hover:bg-blue-800 disabled:opacity-40 whitespace-nowrap">
          読み込み・仕訳生成
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

        <label className="text-xs text-gray-500 whitespace-nowrap">日付一括変更:</label>
        <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
          className="px-2 py-1 border border-gray-200 rounded text-xs" />
        <button onClick={applyBulkDate}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">適用</button>

        <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

        <button onClick={addRow}
          className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 whitespace-nowrap">
          ＋ 行追加
        </button>
        <button onClick={() => { if (rows.length > 0 && confirm('仕訳をすべて削除しますか？')) setRows([]); }}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">クリア</button>
        <button onClick={exportCsv} disabled={rows.length === 0}
          className="px-3 py-1.5 bg-green-700 text-white text-xs rounded font-bold hover:bg-green-800 disabled:opacity-40 whitespace-nowrap">
          CSV出力
        </button>
      </div>

      {/* ステータスバー */}
      <div className={`px-3 py-1.5 flex gap-6 text-xs flex-shrink-0 border-b
        ${mismatch ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
        <span>件数: <b>{rows.length}</b> 件</span>
        <span>借方合計: <b>¥{drTotal.toLocaleString()}</b></span>
        <span>貸方合計: <b>¥{crTotal.toLocaleString()}</b></span>
        {mismatch && <span className="font-bold">⚠ 借貸不一致あり</span>}
      </div>

      {/* テーブル */}
      <div className="flex-1 overflow-auto p-2">
        {rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-gray-600">Excelファイルを選択し「読み込み・仕訳生成」をクリックしてください。</p>
            <p className="text-xs mt-1">対象: 請求先別収支表（令和X年X月分）</p>
          </div>
        ) : (
          <table className="border-collapse w-full bg-white shadow-sm rounded-lg overflow-hidden text-xs" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                {['#','取引日','借方勘定科目','借方補助科目','借方税区分','借方金額','貸方勘定科目','貸方補助科目','貸方税区分','貸方金額','摘要',''].map((h, i) => (
                  <th key={i} className="px-2 py-2 bg-[#1e3a5f] text-white text-left whitespace-nowrap sticky top-0 z-10">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 0 ? 'hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                  <td className="px-2 py-1 border-b border-gray-100 text-center text-gray-400 w-8">{idx + 1}</td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input type="text" value={r.date} onChange={e => update(r.id, 'date', e.target.value)}
                      className="w-28 px-1 py-0.5 border border-transparent rounded text-center hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input value={r.dr} onChange={e => update(r.id, 'dr', e.target.value)} list="dl-accounts"
                      className="w-24 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input value={r.drSub} onChange={e => update(r.id, 'drSub', e.target.value)}
                      className="w-28 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <select value={r.drTax} onChange={e => update(r.id, 'drTax', e.target.value)}
                      className="w-32 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent cursor-pointer text-xs">
                      {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input type="number" value={r.drAmt || ''} onChange={e => update(r.id, 'drAmt', parseInt(e.target.value) || 0)}
                      className="w-24 px-1 py-0.5 border border-transparent rounded text-right hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input value={r.cr} onChange={e => update(r.id, 'cr', e.target.value)} list="dl-accounts"
                      className="w-24 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input value={r.crSub} onChange={e => update(r.id, 'crSub', e.target.value)}
                      className="w-28 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <select value={r.crTax} onChange={e => update(r.id, 'crTax', e.target.value)}
                      className="w-32 px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent cursor-pointer text-xs">
                      {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input type="number" value={r.crAmt || ''} onChange={e => update(r.id, 'crAmt', parseInt(e.target.value) || 0)}
                      className="w-24 px-1 py-0.5 border border-transparent rounded text-right hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100">
                    <input value={r.desc} onChange={e => update(r.id, 'desc', e.target.value)}
                      className="w-full min-w-[180px] px-1 py-0.5 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none bg-transparent" />
                  </td>
                  <td className="px-1 py-1 border-b border-gray-100 text-center w-8">
                    <button onClick={() => deleteRow(r.id)}
                      className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 勘定科目サジェスト */}
      <datalist id="dl-accounts">
        <option value="売掛金" /><option value="売上高" /><option value="立替金" />
        <option value="普通預金" /><option value="未払金" /><option value="仮受消費税等" />
      </datalist>

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
