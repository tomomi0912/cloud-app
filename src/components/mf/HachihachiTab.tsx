'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { buildCsv, downloadCsv } from '@/lib/mfUtils';
import type { JournalRow } from '@/lib/mfUtils';

type Category = '売上_現金' | '売上_クレジット' | '売上_YouTube' | '売上_その他' | '仕入_食材' | '仕入_飲材' | '販管費';

interface Entry {
  category: Category;
  row: Omit<JournalRow, 'txNo' | 'isFirst'>;
}

// ── ユーティリティ ─────────────────────────────────────────────────────
function getCellValue(ws: XLSX.WorkSheet, r: number, c: number): string | number | null {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
}

function toInt(v: string | number | null): number {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.round(n);
}

function getDayCols(ws: XLSX.WorkSheet, headerRow = 3): Map<number, number> {
  const ref = ws['!ref'];
  if (!ref) return new Map();
  const range = XLSX.utils.decode_range(ref);
  const maxCol = Math.min(45, range.e.c);
  const dayCols = new Map<number, number>();
  for (let colIdx = 4; colIdx <= maxCol; colIdx++) {
    const val = getCellValue(ws, headerRow, colIdx);
    if (val !== null && val !== '') {
      const day = Math.round(Number(val));
      if (!isNaN(day) && day >= 1 && day <= 31) dayCols.set(colIdx, day);
    }
  }
  return dayCols;
}

function detectFoodTax(vendor: string): string {
  const kws10 = ['送料', '手数料', '10%', '１０%', '10％', '１０％', '料理酒', 'みりん', '七蔵', 'アマゾン', 'メルカリ'];
  return kws10.some(k => vendor.includes(k)) ? '課税仕入 10%' : '軽減税率仕入 8%';
}

function detectDrinkTax(vendor: string): string {
  const kws8 = ['８%', '8%', '８％', '8％', '（水）', '(水)'];
  return kws8.some(k => vendor.includes(k)) ? '軽減税率仕入 8%' : '課税仕入 10%';
}

function makeEntry(
  date: string, category: Category,
  drAcct: string, drSub: string, drTax: string,
  crAcct: string, crSub: string, crTax: string,
  amt: number, memo: string
): Entry | null {
  if (!amt) return null;
  if (amt < 0) return makeEntry(date, category, crAcct, crSub, crTax, drAcct, drSub, drTax, -amt, memo);
  return {
    category,
    row: {
      date,
      dAcc: drAcct, dSub: drSub, dDept: '', dVen: '', dTax: drTax, dInv: '', dAmt: amt, dTaxAmt: 0,
      cAcc: crAcct, cSub: crSub, cDept: '', cVen: '', cTax: crTax, cInv: '', cAmt: amt, cTaxAmt: 0,
      tekiyo: memo, memo: '', tags: '', mfType: '', yearEnd: '',
    },
  };
}

function buildEntries(wb: XLSX.WorkBook, yearMonth: string): Entry[] {
  const shS = wb.Sheets[wb.SheetNames[2]];
  const shF = wb.Sheets[wb.SheetNames[3]];
  const shD = wb.Sheets[wb.SheetNames[4]];
  const shE = wb.Sheets[wb.SheetNames[5]];

  const dayColsS = getDayCols(shS);
  const dayColsF = getDayCols(shF);
  const dayColsD = getDayCols(shD);
  const dayColsE = getDayCols(shE);

  const [y, m] = yearMonth.split('/');
  const entries: Entry[] = [];

  function date(day: number): string {
    return `${y}/${m}/${String(day).padStart(2, '0')}`;
  }
  function sortedDays(dc: Map<number, number>): [number, number][] {
    return [...dc.entries()].sort(([a], [b]) => a - b);
  }

  for (const [colIdx, day] of sortedDays(dayColsS)) {
    const d = date(day);
    const e0 = makeEntry(d, '売上_現金',      '現金', '', '対象外', '売上高', '現金売上',    '課税売上 10%',    toInt(getCellValue(shS, 4, colIdx)), '現金売上');
    const e1 = makeEntry(d, '売上_その他',    '売掛金', 'お節', '対象外', '売上高', 'お節売上', '軽減税率売上 8%', toInt(getCellValue(shS, 5, colIdx)), 'お節売上（掛）');
    const e2 = makeEntry(d, '売上_クレジット','売掛金', 'クレジット', '対象外', '売上高', 'クレジット売上', '課税売上 10%', toInt(getCellValue(shS, 6, colIdx)), 'クレジット売上');
    const e3 = makeEntry(d, '売上_YouTube',   '現金', '', '対象外', '売上高', 'YouTube収益', '課税売上 10%',    toInt(getCellValue(shS, 7, colIdx)), 'YouTube収益');
    if (e0) entries.push(e0);
    if (e1) entries.push(e1);
    if (e2) entries.push(e2);
    if (e3) entries.push(e3);
  }

  for (let ri = 4; ri < 36; ri++) {
    const vendor = String(getCellValue(shF, ri, 1) ?? '').trim();
    if (!vendor) continue;
    const tax = detectFoodTax(vendor);
    for (const [colIdx, day] of sortedDays(dayColsF)) {
      const v = toInt(getCellValue(shF, ri, colIdx));
      const e = makeEntry(date(day), '仕入_食材', '仕入高', '食材', tax, '現金', '', '対象外', v, `食材仕入 ${vendor}`);
      if (e) entries.push(e);
    }
  }

  for (let ri = 4; ri < 29; ri++) {
    const vendor = String(getCellValue(shD, ri, 1) ?? '').trim();
    if (!vendor) continue;
    const tax = detectDrinkTax(vendor);
    for (const [colIdx, day] of sortedDays(dayColsD)) {
      const v = toInt(getCellValue(shD, ri, colIdx));
      const e = makeEntry(date(day), '仕入_飲材', '仕入高', '飲材', tax, '現金', '', '対象外', v, `飲材仕入 ${vendor}`);
      if (e) entries.push(e);
    }
  }

  function addExp(ri: number, acct: string, sub: string, tax: string, memo: string, crAcct = '現金', crSub = '') {
    for (const [colIdx, day] of sortedDays(dayColsE)) {
      const v = toInt(getCellValue(shE, ri, colIdx));
      const e = makeEntry(date(day), '販管費', acct, sub, tax, crAcct, crSub, '対象外', v, memo);
      if (e) entries.push(e);
    }
  }

  addExp(5,  '給料賃金',   '給与',        '対象外',         '給与（社員）');
  addExp(6,  '給料賃金',   '雑給',        '対象外',         '雑給（バイト）');
  addExp(7,  '旅費交通費', '通勤手当',    '課税仕入 10%',   '通勤手当');
  for (let ri = 11; ri < 22; ri++) {
    const d = String(getCellValue(shE, ri, 3) ?? '').trim();
    if (d) addExp(ri, '広告宣伝費', '直接広告費', '課税仕入 10%', `広告宣伝費 ${d}`);
  }
  addExp(19, '広告宣伝費', '販売促進費', '課税仕入 10%',    '他店調査費');
  addExp(21, '広告宣伝費', '販売促進費', '軽減税率仕入 8%', 'お節手伝い弁当');
  addExp(32, '地代家賃',   '賃借料',     '課税仕入 10%',    '賃借料（八十八）');
  for (let ri = 41; ri < 61; ri++) {
    const d = String(getCellValue(shE, ri, 3) ?? '').trim();
    if (d) {
      const tax = d.includes('お菓子') ? '軽減税率仕入 8%' : '課税仕入 10%';
      addExp(ri, '消耗品費', '', tax, `消耗品費 ${d}`);
    }
  }
  addExp(62, '水道光熱費', '電気',          '課税仕入 10%',  '電気代（八十八）');
  addExp(63, '水道光熱費', 'ガス',          '課税仕入 10%',  'ガス代（八十八）');
  for (let ri = 68; ri < 71; ri++) {
    const d = String(getCellValue(shE, ri, 3) ?? '').trim();
    if (d) addExp(ri, '通信費', '', '課税仕入 10%', `通信費 ${d}`);
  }
  addExp(84, '租税公課',   '印紙代',        '対象外',        '印紙代');
  addExp(87, '地代家賃',   '家按分50%',     '課税仕入 10%',  '家賃按分50%（冷凍庫保管）', '事業主貸');
  addExp(88, '水道光熱費', '家電気按分',    '課税仕入 10%',  '電気代家事按分50%',         '事業主貸');
  addExp(89, '水道光熱費', '家ガス按分',    '課税仕入 10%',  'ガス代家事按分50%',          '事業主貸');
  addExp(90, '水道光熱費', '家水道按分',    '課税仕入 10%',  '水道代家事按分50%',          '事業主貸');
  addExp(91, '通信費',     '家光回線按分',  '課税仕入 10%',  '光回線家事按分90%',          '事業主貸');

  for (const en of entries) {
    if (en.row.dAcc === '現金') en.row.dSub = '';
    if (en.row.cAcc === '現金') en.row.cSub = '';
  }

  return entries;
}

// ── 定数 ──────────────────────────────────────────────────────────────
const ACCOUNTS = [
  '現金', '売掛金', '未収入金', '売上高', '仕入高',
  '給料賃金', '旅費交通費', '広告宣伝費', '地代家賃', '消耗品費',
  '水道光熱費', '通信費', '租税公課', '雑収入', '雑費',
  '事業主貸', '事業主借', '未払金', '買掛金', '前払費用',
];
const TAX_OPTIONS = [
  '対象外', '課税売上 10%', '軽減税率売上 8%',
  '課税仕入 10%', '軽減税率仕入 8%', '不課税売上',
];

const TAB_FILTERS: { label: string; filter: (c: Category) => boolean }[] = [
  { label: '全件',               filter: () => true },
  { label: '売上（現金）',       filter: c => c === '売上_現金' },
  { label: '売上（クレジット）', filter: c => c === '売上_クレジット' },
  { label: '売上（YouTube）',    filter: c => c === '売上_YouTube' },
  { label: '売上（その他）',     filter: c => c === '売上_その他' },
  { label: '仕入（食材）',       filter: c => c === '仕入_食材' },
  { label: '仕入（飲材）',       filter: c => c === '仕入_飲材' },
  { label: '販管費',             filter: c => c === '販管費' },
];

const SALE_CATS: Category[] = ['売上_現金', '売上_クレジット', '売上_YouTube', '売上_その他'];

const CAT_BG: Partial<Record<Category, string>> = {
  '売上_現金':      'bg-green-50',
  '売上_クレジット':'bg-blue-50',
  '売上_YouTube':   'bg-yellow-50',
  '売上_その他':    'bg-pink-50',
};

// ── 振替伝票モーダル ──────────────────────────────────────────────────
type RowForm = Omit<JournalRow, 'txNo' | 'isFirst'>;

const BLANK_ROW = (date: string): RowForm => ({
  date,
  dAcc: '現金', dSub: '', dDept: '', dVen: '', dTax: '対象外', dInv: '', dAmt: 0, dTaxAmt: 0,
  cAcc: '売上高', cSub: '', cDept: '', cVen: '', cTax: '課税売上 10%', cInv: '', cAmt: 0, cTaxAmt: 0,
  tekiyo: '', memo: '', tags: '', mfType: '', yearEnd: '',
});

// 共通入力部品
const AccountSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
    {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
  </select>
);
const TaxSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
    {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
  </select>
);
const TI = ({ value, onChange, placeholder = '' }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
);
const AI = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <input type="number" value={value || ''} onChange={e => onChange(Math.round(Number(e.target.value)) || 0)}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
);

function VoucherModal({
  entry,
  index,
  total,
  onSave,
  onClose,
  onPrev,
  onNext,
}: {
  entry: Entry;
  index: number;
  total: number;
  onSave: (rows: RowForm[]) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [lines, setLines] = useState<RowForm[]>([{ ...entry.row }]);

  // 前後移動で entry が変わったときにリセット
  useEffect(() => {
    setLines([{ ...entry.row }]);
  }, [entry]);

  function updateLine<K extends keyof RowForm>(i: number, key: K, value: RowForm[K]) {
    setLines(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  }

  function addLine() {
    const last = lines[lines.length - 1];
    setLines(prev => [...prev, BLANK_ROW(last.date)]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  const drTotal = lines.reduce((s, r) => s + r.dAmt, 0);
  const crTotal = lines.reduce((s, r) => s + r.cAmt, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">

        {/* ヘッダー */}
        <div className="bg-[#1a237e] text-white px-5 py-3 rounded-t-xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-base">振替伝票</span>
            <span className="text-blue-200 text-sm">No. {index + 1}</span>
            {lines.length > 1 && (
              <span className="text-xs bg-blue-500 px-2 py-0.5 rounded-full">{lines.length}行</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onPrev} disabled={index === 0}
              className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded disabled:opacity-30">◀ 前</button>
            <span className="text-xs text-blue-200">{index + 1} / {total}</span>
            <button onClick={onNext} disabled={index === total - 1}
              className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded disabled:opacity-30">次 ▶</button>
            <button onClick={onClose} className="ml-2 text-white/70 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        {/* 本文 */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">

          {/* 列ヘッダー */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-semibold text-gray-500 px-1">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1 text-center">
              <span className="text-blue-600">借方科目</span>
              <span className="text-blue-600">補助科目</span>
              <span className="text-blue-600">税区分</span>
              <span className="text-blue-600">金額</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1 text-center">
              <span className="text-red-600">貸方科目</span>
              <span className="text-red-600">補助科目</span>
              <span className="text-red-600">税区分</span>
              <span className="text-red-600">金額</span>
            </div>
            <div className="w-6" />
          </div>

          {/* 各行 */}
          {lines.map((line, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
              {/* 行番号 + 取引日 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono w-5">{i + 1}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">取引日</span>
                  <input type="text" value={line.date}
                    onChange={e => updateLine(i, 'date', e.target.value)}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="2026/01/15" />
                </div>
                {lines.length > 1 && (
                  <button onClick={() => removeLine(i)}
                    className="ml-auto text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 border border-red-200 rounded hover:bg-red-50">
                    行削除
                  </button>
                )}
              </div>

              {/* 借方 / 貸方 グリッド */}
              <div className="grid grid-cols-2 gap-2">
                {/* 借方 */}
                <div className="border-l-2 border-blue-300 pl-2 grid grid-cols-4 gap-1 items-end">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">借方科目</p>
                    <AccountSelect value={line.dAcc} onChange={v => updateLine(i, 'dAcc', v)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">補助科目</p>
                    <TI value={line.dSub} onChange={v => updateLine(i, 'dSub', v)} placeholder="任意" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">税区分</p>
                    <TaxSelect value={line.dTax} onChange={v => updateLine(i, 'dTax', v)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">金額</p>
                    <AI value={line.dAmt} onChange={v => updateLine(i, 'dAmt', v)} />
                  </div>
                </div>
                {/* 貸方 */}
                <div className="border-l-2 border-red-300 pl-2 grid grid-cols-4 gap-1 items-end">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">貸方科目</p>
                    <AccountSelect value={line.cAcc} onChange={v => updateLine(i, 'cAcc', v)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">補助科目</p>
                    <TI value={line.cSub} onChange={v => updateLine(i, 'cSub', v)} placeholder="任意" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">税区分</p>
                    <TaxSelect value={line.cTax} onChange={v => updateLine(i, 'cTax', v)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">金額</p>
                    <AI value={line.cAmt} onChange={v => updateLine(i, 'cAmt', v)} />
                  </div>
                </div>
              </div>

              {/* 摘要 */}
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">摘要</p>
                <TI value={line.tekiyo} onChange={v => updateLine(i, 'tekiyo', v)} placeholder="摘要" />
              </div>
            </div>
          ))}

          {/* 行追加ボタン */}
          <button onClick={addLine}
            className="w-full py-2 border-2 border-dashed border-blue-300 text-blue-500 text-sm rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors">
            ＋ 行を追加
          </button>

          {/* 合計・貸借チェック */}
          <div className={`flex items-center justify-between px-3 py-2 rounded text-sm font-medium ${
            drTotal === crTotal ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            <span>借方合計: ¥{drTotal.toLocaleString('ja-JP')}</span>
            <span>{drTotal === crTotal ? '✓ 貸借一致' : '⚠ 貸借不一致'}</span>
            <span>貸方合計: ¥{crTotal.toLocaleString('ja-JP')}</span>
          </div>
        </div>

        {/* フッター */}
        <div className="flex gap-2 px-5 py-3 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={() => onSave(lines)}
            className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────────────
export default function HachihachiTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [yearMonth, setYearMonth] = useState('');
  const [error, setError] = useState('');
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));

  // 振替伝票
  const [voucherIdx, setVoucherIdx] = useState<number | null>(null);

  function handleFile(file: File) {
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        if (wb.SheetNames.length < 6) {
          setError('シートが足りません（シートが6枚以上必要です）');
          return;
        }
        const ym = `${year}/${String(month).padStart(2, '0')}`;
        const result = buildEntries(wb, ym);
        if (result.length === 0) {
          setError('仕訳データが見つかりませんでした。年月やシート構成を確認してください。');
          return;
        }
        setEntries(result);
        setYearMonth(ym);
        setActiveTab(0);
      } catch (err) {
        setError(`読み込みエラー: ${err}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDownload() {
    if (!entries) return;
    const rows: JournalRow[] = entries.map((en, i) => ({
      ...en.row, txNo: i + 1, isFirst: true,
    }));
    const csv = buildCsv(rows);
    const ym = yearMonth.replace('/', '');
    downloadCsv(csv, `MF_仕訳_八十八_${ym}.csv`);
  }

  function handleVoucherSave(rows: RowForm[]) {
    if (voucherIdx === null || !entries) return;
    const original = entries[voucherIdx];
    const next = [
      ...entries.slice(0, voucherIdx),
      ...rows.map(row => ({ ...original, row })),
      ...entries.slice(voucherIdx + 1),
    ];
    setEntries(next);
    setVoucherIdx(null);
  }

  const filtered = entries
    ? entries.filter(en => TAB_FILTERS[activeTab].filter(en.category))
    : [];

  // 全件タブ(0)では filtered[i] === entries[i]
  // 他タブでは元のインデックスを探す
  function getEntryIndex(filteredIdx: number): number {
    if (!entries) return -1;
    const en = filtered[filteredIdx];
    return entries.indexOf(en);
  }

  const salesTotal = entries
    ? entries.filter(en => SALE_CATS.includes(en.category)).reduce((s, en) => s + en.row.dAmt, 0)
    : 0;
  const expTotal = entries
    ? entries.filter(en => !SALE_CATS.includes(en.category)).reduce((s, en) => s + en.row.dAmt, 0)
    : 0;

  // ── アップロード画面 ─────────────────────────────────────────────────
  if (!entries) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-lg space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">読み込み月を指定</p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">年</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                min="2020" max="2099" />
              <label className="text-sm text-gray-600">月</label>
              <select value={month} onChange={e => setMonth(e.target.value)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm">
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{Number(m)}月</option>
                ))}
              </select>
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-blue-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors bg-white"
          >
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-semibold text-blue-600 mb-1">八十八 Excelファイルをドラッグ＆ドロップ</p>
            <p className="text-xs text-gray-400">（.xls / .xlsx）またはクリックして選択</p>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ── 仕訳ビューワー ────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* ツールバー */}
      <div className="bg-[#1a2a4a] text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => { setEntries(null); setError(''); }}
          className="text-white/70 hover:text-white text-sm">
          ◀ ファイル選択に戻る
        </button>
        <span className="text-sm font-bold">対象月: {yearMonth}　／　{entries.length} 件</span>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-blue-200">
            売上合計: ¥{salesTotal.toLocaleString('ja-JP')}　／　経費合計: ¥{expTotal.toLocaleString('ja-JP')}
          </span>
          <button onClick={handleDownload}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded transition-colors">
            CSVダウンロード
          </button>
        </div>
      </div>

      {/* カテゴリタブ */}
      <div className="bg-[#1e3a5f] flex-shrink-0 flex px-3 overflow-x-auto">
        {TAB_FILTERS.map((t, i) => {
          const count = entries.filter(en => t.filter(en.category)).length;
          return (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`px-4 py-2 text-xs border-b-2 whitespace-nowrap transition-colors ${
                activeTab === i ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.label}
              <span className="ml-1 opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 全件タブのみ振替伝票を案内 */}
      {activeTab === 0 && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-1.5 flex-shrink-0">
          <p className="text-xs text-blue-600">行をクリックすると振替伝票で編集できます</p>
        </div>
      )}

      {/* テーブル */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              {activeTab === 0 && (
                <th className="px-2 py-1.5 text-center border border-gray-200 font-medium text-gray-400 w-8">No</th>
              )}
              {['取引日', '借方科目', '借方補助', '借方税区分', '借方金額',
                '貸方科目', '貸方補助', '貸方税区分', '貸方金額', '摘要'].map(h => (
                <th key={h} className="px-2 py-1.5 text-left border border-gray-200 font-medium text-gray-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((en, i) => {
              const bg = CAT_BG[en.category] ?? (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
              const isZenken = activeTab === 0;
              return (
                <tr
                  key={i}
                  className={`${bg} ${isZenken ? 'cursor-pointer hover:bg-blue-100 hover:outline hover:outline-1 hover:outline-blue-300' : ''}`}
                  onClick={isZenken ? () => setVoucherIdx(getEntryIndex(i)) : undefined}
                >
                  {isZenken && (
                    <td className="px-2 py-1 border border-gray-100 text-center text-gray-400">{i + 1}</td>
                  )}
                  <td className="px-2 py-1 border border-gray-100 whitespace-nowrap">{en.row.date}</td>
                  <td className="px-2 py-1 border border-gray-100">{en.row.dAcc}</td>
                  <td className="px-2 py-1 border border-gray-100">{en.row.dSub}</td>
                  <td className="px-2 py-1 border border-gray-100 whitespace-nowrap">{en.row.dTax}</td>
                  <td className="px-2 py-1 border border-gray-100 text-right whitespace-nowrap">{en.row.dAmt.toLocaleString('ja-JP')}</td>
                  <td className="px-2 py-1 border border-gray-100">{en.row.cAcc}</td>
                  <td className="px-2 py-1 border border-gray-100">{en.row.cSub}</td>
                  <td className="px-2 py-1 border border-gray-100 whitespace-nowrap">{en.row.cTax}</td>
                  <td className="px-2 py-1 border border-gray-100 text-right whitespace-nowrap">{en.row.cAmt.toLocaleString('ja-JP')}</td>
                  <td className="px-2 py-1 border border-gray-100">{en.row.tekiyo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">データがありません</div>
        )}
      </div>

      {/* 振替伝票モーダル */}
      {voucherIdx !== null && entries[voucherIdx] && (
        <VoucherModal
          entry={entries[voucherIdx]}
          index={voucherIdx}
          total={entries.length}
          onSave={handleVoucherSave}
          onClose={() => setVoucherIdx(null)}
          onPrev={() => setVoucherIdx(i => (i ?? 0) > 0 ? (i ?? 0) - 1 : i)}
          onNext={() => setVoucherIdx(i => (i ?? 0) < entries.length - 1 ? (i ?? 0) + 1 : i)}
        />
      )}
    </div>
  );
}
