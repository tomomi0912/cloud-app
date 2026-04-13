'use client';

import { useState, useRef } from 'react';
import { JournalRow, buildCsv, downloadCsv, fmt } from '@/lib/mfUtils';

// ── 型定義 ──────────────────────────────────────────────────────
interface NrNums {
  imakaisei: number; zenkaimi: number; zenkaipre: number;
  ukemi: number; chosei: number; imakaimiori: number; imakaipre: number;
}
interface Subtotal { day: string; date: string; name: string; nums: NrNums; }
interface CheckError { day: string; date: string; name: string; calc: number; ukemi: number; diff: number; }

// ── 解析ロジック ─────────────────────────────────────────────────
function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  let headers: string[] = [];
  const days: Record<string, string[][]> = {};
  const dayOrder: string[] = [];
  const dayDate: Record<string, string> = {};
  const skip = ['Title', 'PriodFrom', 'Group By', 'Order By', 'Head', 'Data', 'End'];

  for (const l of lines) {
    if (l.includes('患者件数') && l.includes('保険区分')) {
      headers = l.split(','); break;
    }
  }

  let curDay: string | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (skip.some(s => line.includes('[' + s + ']') || line.includes('【' + s))) continue;
    const cols = line.split(',');
    const c0 = cols[0] || '';
    const dm = c0.match(/R(\d+)\.(\d+)\.(\d+)\((.+?)\)/);
    if (dm) {
      const wy = 2018 + parseInt(dm[1]), mm = dm[2], dd = dm[3], dow = dm[4];
      curDay = `${mm}/${dd}(${dow})`;
      if (!days[curDay]) { days[curDay] = []; dayOrder.push(curDay); }
      dayDate[curDay] = `${wy}/${mm}/${dd}`;
      continue;
    }
    if (curDay) days[curDay].push(cols);
  }

  const getNums = (cols: string[]): NrNums => {
    const n = (i: number) => parseInt(cols[i] || '0') || 0;
    return { imakaisei: n(12), zenkaimi: n(13), zenkaipre: n(14), ukemi: n(16), chosei: n(17), imakaimiori: n(18), imakaipre: n(19) };
  };

  const subtotals: Subtotal[] = [];
  for (const day of dayOrder) {
    for (const cols of days[day]) {
      const c0 = cols[0] || '', c1 = cols[1] || '', c2 = cols[2] || '';
      if (c0 && c0 !== '合計' && c0.endsWith('合計') && c1 === '' && c2 === '') {
        const nums = getNums(cols);
        if (nums.imakaisei > 0 || nums.ukemi > 0)
          subtotals.push({ day, date: dayDate[day], name: c0, nums });
      }
    }
  }

  return { headers, days, dayOrder, dayDate, subtotals };
}

function runCheck(subtotals: Subtotal[]): CheckError[] {
  return subtotals.flatMap(sub => {
    const { imakaisei, zenkaimi, zenkaipre, ukemi, chosei, imakaimiori, imakaipre } = sub.nums;
    const calc = imakaisei + zenkaimi - zenkaipre - imakaimiori + imakaipre - chosei;
    return calc !== ukemi ? [{ day: sub.day, date: sub.date, name: sub.name, calc, ukemi, diff: calc - ukemi }] : [];
  });
}

function genJournal(subtotals: Subtotal[]): JournalRow[] {
  const rows: JournalRow[] = [];
  let txNo = 1;
  const jr = (dAcc: string, dSub: string, dTax: string, dAmt: number, cAcc: string, cSub: string, cTax: string, cAmt: number, tek: string) =>
    ({ dAcc, dSub, dDept: '', dVen: '', dTax, dInv: '', dAmt, dTaxAmt: 0, cAcc, cSub, cDept: '', cVen: '', cTax, cInv: '', cAmt, cTaxAmt: 0, tek });

  for (const sub of subtotals) {
    const { imakaisei, zenkaimi, zenkaipre, ukemi, chosei, imakaimiori, imakaipre } = sub.nums;
    const base = `${sub.date} ${sub.name}`;
    const parts = [];
    const rowA = ukemi + zenkaipre - zenkaimi - imakaipre;
    if (rowA > 0)        parts.push(jr('窓口現金勘定','','対象外',rowA,'保険窓口収入','','非課税売上',rowA,base));
    if (imakaimiori > 0) parts.push(jr('医業未収金','窓口未収','対象外',imakaimiori,'保険窓口収入','','非課税売上',imakaimiori,base+'（未収）'));
    if (chosei > 0)      parts.push(jr('福利厚生費','','対象外',chosei,'保険窓口収入','','非課税売上',chosei,base+'（調整）'));
    if (zenkaimi > 0)    parts.push(jr('窓口現金勘定','','対象外',zenkaimi,'医業未収金','窓口未収','対象外',zenkaimi,base+'（前回未収回収）'));
    if (zenkaipre > 0)   parts.push(jr('窓口預り金','','対象外',zenkaipre,'窓口現金勘定','','対象外',zenkaipre,base+'（前回預かり充当）'));
    if (imakaipre > 0)   parts.push(jr('窓口現金勘定','','対象外',imakaipre,'窓口預り金','','対象外',imakaipre,base+'（今回預かり）'));

    if (parts.length === 0) { txNo++; continue; }
    parts.forEach((p, i) => rows.push({
      txNo, date: sub.date,
      dAcc: p.dAcc, dSub: p.dSub, dDept: '', dVen: '', dTax: p.dTax, dInv: '', dAmt: p.dAmt, dTaxAmt: 0,
      cAcc: p.cAcc, cSub: p.cSub, cDept: '', cVen: '', cTax: p.cTax, cInv: '', cAmt: p.cAmt, cTaxAmt: 0,
      tekiyo: i === 0 ? p.tek : '', memo: '', tags: '', mfType: '', yearEnd: '',
      isFirst: i === 0,
    }));
    txNo++;
  }
  return rows;
}

// ── コンポーネント ───────────────────────────────────────────────
export default function NippoTab() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSV> | null>(null);
  const [errors, setErrors] = useState<CheckError[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer;
      let text: string;
      try {
        const dec = new TextDecoder('shift-jis');
        const t = dec.decode(buf);
        text = (t.split('\uFFFD').length > 5) ? new TextDecoder('utf-8').decode(buf) : t;
      } catch { text = new TextDecoder('utf-8').decode(buf); }
      const p = parseCSV(text);
      const errs = runCheck(p.subtotals);
      const jrn = genJournal(p.subtotals);
      setParsed(p);
      setErrors(errs);
      setJournal(jrn);
      setActiveDay(0);
      setStep(1);
    };
    reader.readAsArrayBuffer(file);
  }

  function gotoStep(n: number) {
    if (n > 1 && !parsed?.dayOrder.length) { alert('先にCSVファイルを読み込んでください'); return; }
    setStep(n);
  }

  const dates = parsed ? parsed.dayOrder.map(d => parsed.dayDate[d]).filter(Boolean) : [];
  const txCnt = [...new Set(journal.map(r => r.txNo))].length;

  // ── ステップバー ──
  const StepBar = () => (
    <div className="flex items-stretch border-b border-gray-200 bg-white px-4 flex-shrink-0">
      {[
        { n: 1, label: 'ファイル読込' },
        { n: 2, label: '日別データ' },
        { n: 3, label: 'エラーチェック' },
        { n: 4, label: 'MF仕訳作成' },
      ].map(({ n, label }) => (
        <button key={n}
          onClick={() => gotoStep(n)}
          className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors
            ${step === n ? 'border-blue-500 text-blue-600' :
              n < step ? 'border-transparent text-green-600' :
              'border-transparent text-gray-400'}`}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
            ${step === n ? 'bg-blue-500 text-white' :
              n < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {n < step ? '✓' : n}
          </span>
          {label}
        </button>
      ))}
    </div>
  );

  // ── STEP 1 ──
  const Step1 = () => (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="font-semibold text-gray-700 mb-3">📂 CSVファイルを読み込む</p>
        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
          onClick={() => inputRef.current?.click()}
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-medium text-gray-700">クリックしてファイルを選択</p>
          <p className="text-sm text-gray-400 mt-1">またはここにドラッグ＆ドロップ</p>
          <p className="text-xs text-gray-300 mt-2">対応: Shift-JIS / UTF-8 CSV（日報形式）</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
      </div>

      {parsed && parsed.dayOrder.length > 0 && (
        <div className="bg-white border border-green-200 rounded-lg p-5">
          <p className="font-semibold text-green-700 mb-3">✅ 読込完了</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBox label="ファイル名" value={fileName} />
            <InfoBox label="期間" value={dates.length ? `${dates[0]} 〜 ${dates[dates.length - 1]}` : '-'} />
            <InfoBox label="営業日数" value={`${parsed.dayOrder.length} 日`} />
            <InfoBox label="保険区分合計行" value={`${parsed.subtotals.length} 件`} />
          </div>
          <button onClick={() => gotoStep(2)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            日別データを確認 →
          </button>
        </div>
      )}
    </div>
  );

  // ── STEP 2 ──
  const Step2 = () => {
    if (!parsed) return null;
    const day = parsed.dayOrder[activeDay];
    const rows = parsed.days[day] || [];
    const hdrs = parsed.headers.length > 0 ? parsed.headers :
      ['','','保険区分','患者件数','新患','実日','初診','点数','自賠・労','一部負担','保険外','消費税',
       '今回請求','前回未収','前回預かり','総請求','受取','調整','今回未収','今回預かり','保険総請求'];
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
          <div className="flex gap-0 px-2 py-1 min-w-max">
            {parsed.dayOrder.map((d, i) => (
              <button key={d} onClick={() => setActiveDay(i)}
                className={`px-3 py-1.5 text-xs rounded-t mr-0.5 border-b-2 whitespace-nowrap
                  ${activeDay === i ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded border border-gray-200 overflow-auto">
            <table className="text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr>{hdrs.map((h, i) => <th key={i} className="px-3 py-2 bg-gray-700 text-white border border-gray-600 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((cols, ri) => {
                  const c0 = cols[0] || '', c1 = cols[1] || '';
                  let bg = '';
                  if (c0 === '合計') bg = 'bg-yellow-50 font-bold';
                  else if (c0 && c0.endsWith('合計') && c1 === '') bg = 'bg-blue-50 font-semibold';
                  else if (c1 === '*') bg = 'bg-green-50';
                  return <tr key={ri} className={bg}>{
                    cols.map((v, ci) => {
                      const isNum = ci >= 7 && v !== '' && !isNaN(Number(v));
                      return <td key={ci} className={`px-3 py-1 border border-gray-100 ${isNum ? 'text-right' : ''}`}>
                        {isNum ? parseInt(v).toLocaleString() : v}
                      </td>;
                    })
                  }</tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-gray-100 bg-white flex-shrink-0">
          <button onClick={() => gotoStep(1)} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">← 戻る</button>
          <button onClick={() => gotoStep(3)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">エラーチェックへ →</button>
        </div>
      </div>
    );
  };

  // ── STEP 3 ──
  const Step3 = () => {
    if (!parsed) return null;
    const total = parsed.subtotals.length, errsN = errors.length, ok = total - errsN;
    return (
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="flex gap-3">
          <SumCard n={total} label="チェック対象" />
          <SumCard n={ok} label="✓ 正常" green />
          <SumCard n={errsN} label={errsN > 0 ? '✗ エラー' : '✓ エラーなし'} red={errsN > 0} green={errsN === 0} />
          <SumCard n={parsed.dayOrder.length} label="営業日数" />
        </div>
        <div className={`p-3 rounded text-sm ${errsN === 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {errsN === 0
            ? `全${total}件 検証OK — 全日付・全保険区分の残高が一致しています`
            : `${errsN}件のエラーがあります。以下の赤行を確認してください`}
        </div>
        <div className="bg-white rounded border border-gray-200 overflow-auto">
          <table className="text-xs whitespace-nowrap border-collapse w-full">
            <thead>
              <tr className="bg-gray-100">
                {['日付','保険区分','今回請求','前回未収','前回預かり','今回未収','今回預かり','調整','計算値','受取金額','判定'].map(h =>
                  <th key={h} className="px-3 py-2 border border-gray-200 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {parsed.subtotals.map((sub, i) => {
                const { imakaisei, zenkaimi, zenkaipre, ukemi, chosei, imakaimiori, imakaipre } = sub.nums;
                const calc = imakaisei + zenkaimi - zenkaipre - imakaimiori + imakaipre - chosei;
                const isOk = calc === ukemi;
                return (
                  <tr key={i} className={isOk ? '' : 'bg-red-50'}>
                    <td className="px-3 py-1 border border-gray-100">{sub.date}</td>
                    <td className="px-3 py-1 border border-gray-100 font-semibold">{sub.name}</td>
                    {[imakaisei,zenkaimi,zenkaipre,imakaimiori,imakaipre,chosei,calc,ukemi].map((v, vi) =>
                      <td key={vi} className="px-3 py-1 border border-gray-100 text-right">{fmt(v)}</td>)}
                    <td className="px-3 py-1 border border-gray-100 text-center">
                      {isOk
                        ? <span className="text-green-600 font-bold">✓ 正常</span>
                        : <span className="text-red-600 font-bold">✗ 差異: {fmt(calc - ukemi)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button onClick={() => gotoStep(2)} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">← 戻る</button>
          <button onClick={() => gotoStep(4)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">MF仕訳を作成 →</button>
        </div>
      </div>
    );
  };

  // ── STEP 4 ──
  const Step4 = () => {
    const txCntUniq = [...new Set(journal.map(r => r.txNo))].length;
    const preview = journal.slice(0, 50);
    return (
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="flex gap-3">
          <SumCard n={parsed?.subtotals.length || 0} label="保険区分数" />
          <SumCard n={txCntUniq} label="取引No数" />
          <SumCard n={journal.length} label="仕訳行数" />
          <SumCard n={errors.length} label={errors.length > 0 ? '⚠ 検証エラー' : '✓ エラーなし'} red={errors.length > 0} green={errors.length === 0} />
        </div>
        {errors.length > 0 && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded">
            <b>検証エラーあり（{errors.length}件）:</b>
            {errors.map((e, i) => <div key={i}>{e.date} {e.name} — 差異: {fmt(e.diff)}円</div>)}
          </div>
        )}
        {errors.length === 0 && (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded">全仕訳の借貸バランスが一致しています</div>
        )}
        <div className="bg-white rounded border border-gray-200 overflow-auto" style={{ maxHeight: 380 }}>
          <table className="text-xs whitespace-nowrap border-collapse">
            <thead>
              <tr className="bg-gray-100">
                {['取引No','取引日','借方勘定科目','借方補助科目','借方税区分','借方金額','貸方勘定科目','貸方補助科目','貸方税区分','貸方金額','摘要'].map(h =>
                  <th key={h} className="px-3 py-2 border border-gray-200 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
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
                <tr><td colSpan={11} className="px-3 py-2 text-center text-gray-400">… 他 {journal.length - 50} 行（ダウンロードで全件確認）</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button onClick={() => gotoStep(3)} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">← 戻る</button>
          <button
            onClick={() => {
              if (!journal.length) { alert('仕訳データがありません'); return; }
              const csv = buildCsv(journal);
              const base = fileName.replace(/\.[^.]+$/, '');
              downloadCsv(csv, `MF仕訳_${base}.csv`);
            }}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium"
          >
            ⬇ MF仕訳CSVをダウンロード
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <StepBar />
      <div className="flex-1 overflow-hidden flex flex-col">
        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-800 mt-0.5 break-all">{value}</div>
    </div>
  );
}

function SumCard({ n, label, green, red }: { n: number; label: string; green?: boolean; red?: boolean }) {
  return (
    <div className={`bg-white border rounded-lg p-3 text-center min-w-[80px]
      ${green ? 'border-green-300' : red ? 'border-red-300' : 'border-gray-200'}`}>
      <div className={`text-2xl font-bold ${green ? 'text-green-600' : red ? 'text-red-600' : 'text-gray-700'}`}>{n}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
