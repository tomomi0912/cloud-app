import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import db from '@/lib/db';
import Header from '@/components/Header';
import CompanyWorkspace from '@/components/CompanyWorkspace';
import ClaudeChat from '@/components/ClaudeChat';

interface Company {
  id: number;
  name: string;
  code: string | null;
  memo: string | null;
  tool_type: string;
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const company = db
    .prepare('SELECT id, name, code, memo, tool_type FROM companies WHERE id = ? AND user_id = ?')
    .get(id, session.userId) as Company | undefined;

  if (!company) redirect('/');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header userName={session.name} role={session.role} />
      <main className="flex-1 overflow-hidden">
        <CompanyWorkspace company={company} />
      </main>
      <ClaudeChat />
    </div>
  );
}
