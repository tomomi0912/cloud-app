'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface Props {
  initialUsers: User[];
  currentUserId: number;
}

const emptyForm = { name: '', email: '', password: '', role: 'staff' };

export default function UserManagement({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setError('');
    setShowModal(true);
  }

  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setEditId(u.id);
    setError('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = editId ? `/api/users/${editId}` : '/api/users';
      const method = editId ? 'PATCH' : 'POST';
      const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '保存に失敗しました'); return; }

      if (editId) {
        setUsers(prev => prev.map(u => u.id === editId ? data : u));
      } else {
        setUsers(prev => [...prev, data]);
      }
      setShowModal(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
    } else {
      const data = await res.json();
      alert(data.error || '削除に失敗しました');
    }
  }

  return (
    <div>
      {/* ページヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">従業員管理</h2>
          <p className="text-sm text-gray-500 mt-0.5">{users.length}名登録</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          ＋ 従業員を追加
        </button>
      </div>

      {/* ユーザー一覧テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">氏名</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">メールアドレス</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">権限</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">登録日</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-blue-500">（あなた）</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {u.role === 'admin' ? '管理者' : 'スタッフ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {u.created_at.slice(0, 10)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      編集
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">従業員が登録されていません</div>
        )}
      </div>

      {/* 追加/編集モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {editId ? '従業員を編集' : '従業員を追加'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  氏名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  メールアドレス <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="yamada@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  パスワード {editId && <span className="text-gray-400 text-xs">（変更する場合のみ入力）</span>}
                  {!editId && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required={!editId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="8文字以上"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">権限</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              {error && (
                <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
