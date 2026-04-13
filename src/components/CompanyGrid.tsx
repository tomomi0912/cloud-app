'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

interface Company {
  id: number;
  name: string;
  code: string | null;
  memo: string | null;
  tool_type: string;
}

interface CompanyGridProps {
  initialCompanies: Company[];
}

export default function CompanyGrid({ initialCompanies }: CompanyGridProps) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', code: '', memo: '', tool_type: 'hokuofarm' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function openAdd() {
    setForm({ name: '', code: '', memo: '', tool_type: 'hokuofarm' });
    setEditId(null);
    setShowAdd(true);
    setError('');
  }

  function openEdit(c: Company, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const validTypes = ['hokuofarm', 'hachihachi', 'nippo'];
    const tt = validTypes.includes(c.tool_type) ? c.tool_type : 'hokuofarm';
    setForm({ name: c.name, code: c.code || '', memo: c.memo || '', tool_type: tt });
    setEditId(c.id);
    setShowAdd(true);
    setError('');
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('この事業所を削除しますか？')) return;
    await apiFetch(`/api/companies/${id}`, { method: 'DELETE' });
    setCompanies(prev => prev.filter(c => c.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = editId ? `/api/companies/${editId}` : '/api/companies';
      const method = editId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '保存に失敗しました');
        return;
      }
      if (editId) {
        setCompanies(prev => prev.map(c => c.id === editId ? data : c));
      } else {
        setCompanies(prev => [...prev, data]);
      }
      setShowAdd(false);
    } finally {
      setLoading(false);
    }
  }

  const sorted = [...companies].sort((a, b) => {
    const ca = (a.code || '') + a.name;
    const cb = (b.code || '') + b.name;
    return ca.localeCompare(cb, 'ja');
  });

  return (
    <div className="p-6">
      {/* ツールバー */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">事業所 {companies.length}件</p>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          ＋ 事業所を追加
        </button>
      </div>

      {/* グリッド */}
      <div className="grid grid-cols-3 gap-3">
        {sorted.map(company => (
          <div
            key={company.id}
            onClick={() => router.push(`/companies/${company.id}`)}
            className="group relative border border-gray-300 rounded-lg p-5 bg-white cursor-pointer hover:border-blue-400 hover:shadow-sm transition-all"
          >
            <div className="flex flex-col items-center justify-center min-h-[80px]">
              {company.code && (
                <span className="text-xs text-gray-400 mb-1">{company.code}</span>
              )}
              <span className="text-center font-medium text-gray-800 text-sm leading-snug">
                {company.name}
              </span>
            </div>
            <div className="absolute bottom-2 right-3 text-xs text-gray-300 group-hover:text-blue-400 transition-colors">
              開く →
            </div>
            {/* 編集・削除ボタン（hover時表示） */}
            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
              <button
                onClick={e => openEdit(company, e)}
                className="text-xs text-gray-400 hover:text-blue-600 px-1"
                title="編集"
              >
                ✎
              </button>
              <button
                onClick={e => handleDelete(company.id, e)}
                className="text-xs text-gray-400 hover:text-red-500 px-1"
                title="削除"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {companies.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🏢</div>
          <p className="text-lg font-medium text-gray-600 mb-2">まだ事業所が登録されていません</p>
          <p className="text-sm mb-6">右上の「事業所を追加」から顧客・事業所を登録してください</p>
          <div className="inline-block bg-blue-50 border border-blue-100 rounded-lg px-6 py-4 text-left text-sm text-blue-800 space-y-1">
            <p className="font-semibold mb-2">事業所を追加すると使える機能：</p>
            <p>📄 MF仕訳作成 — 日報CSV取込 / 患者毎PDF OCR</p>
            <p>🔍 税務監査 — Claude AIによる税務リスク分析・PDFレポート</p>
          </div>
        </div>
      )}

      {/* 追加/編集モーダル */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {editId ? '事業所を編集' : '事業所を追加'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  事業所名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="株式会社〇〇"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  コード <span className="text-gray-400 text-xs">（任意）</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  メモ <span className="text-gray-400 text-xs">（任意）</span>
                </label>
                <input
                  type="text"
                  value={form.memo}
                  onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="メモ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">使用する機能</label>
                <select
                  value={form.tool_type}
                  onChange={e => setForm(f => ({ ...f, tool_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="hokuofarm">請求先別収支表のみ</option>
                  <option value="hachihachi">八十八エクセル取込のみ</option>
                  <option value="nippo">日報CSV取込・患者毎PDFのみ</option>
                </select>
              </div>
              {error && (
                <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
