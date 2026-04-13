import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import db from '@/lib/db';
import Header from '@/components/Header';
import UserManagement from '@/components/UserManagement';
import ClaudeChat from '@/components/ClaudeChat';

interface DbUser {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  const users = db.prepare(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC'
  ).all() as DbUser[];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header userName={session.name} role={session.role} />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <UserManagement initialUsers={users} currentUserId={session.userId} />
      </main>
      <ClaudeChat />
    </div>
  );
}
