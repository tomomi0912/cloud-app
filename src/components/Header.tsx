'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

interface HeaderProps {
  userName: string;
  role?: string;
}

export default function Header({ userName, role }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-800">税務・会計支援システム</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">クラウド版</span>
        </div>
        <div className="flex items-center gap-4">
          {role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="text-sm text-purple-600 hover:underline font-medium"
            >
              従業員管理
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="text-sm text-blue-600 hover:underline"
          >
            ホーム
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-blue-600 hover:underline"
          >
            ログアウト
          </button>
          <span className="text-sm text-gray-700 font-medium">
            {userName}
            {role === 'admin' && (
              <span className="ml-1.5 text-xs text-purple-500 font-normal">管理者</span>
            )}
          </span>
        </div>
      </div>
      <div className="h-1 bg-blue-500" />
    </header>
  );
}
