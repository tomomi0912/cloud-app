import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import sql from '@/lib/db';
import Header from '@/components/Header';
import CompanyGrid from '@/components/CompanyGrid';
import ClaudeChat from '@/components/ClaudeChat';

interface Company {
  id: number;
  name: string;
  code: string | null;
  memo: string | null;
  tool_type: string;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const companies = await sql`
    SELECT id, name, code, memo, tool_type FROM companies WHERE user_id = ${session.userId} ORDER BY code, name
  ` as Company[];

  const now = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header userName={session.name} role={session.role} />
      <div className="flex items-center justify-end px-6 py-1 bg-white border-b border-gray-100">
        <span className="text-xs text-blue-600">{now}</span>
      </div>
      <main className="flex-1 overflow-auto">
        <CompanyGrid initialCompanies={companies} />
      </main>
      <ClaudeChat />
    </div>
  );
}
