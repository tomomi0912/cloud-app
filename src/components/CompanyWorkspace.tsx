'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MfJournalPane from './MfJournalPane';
import TaxAuditPane from './TaxAuditPane';

interface Company {
  id: number;
  name: string;
  code: string | null;
  memo: string | null;
  tool_type: string;
}

type Mode = 'mf' | 'audit';

export default function CompanyWorkspace({ company }: { company: Company }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('mf');

  return (
    <div className="h-full flex flex-col" style={{ height: 'calc(100vh - 81px)' }}>
      {/* サブヘッダー */}
      <div className="bg-[#1a237e] text-white px-4 py-0 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.push('/')}
          className="text-white/70 hover:text-white text-sm py-3 mr-2"
        >
          ← 一覧
        </button>
        <span className="text-sm font-bold py-3">
          {company.code ? `${company.code} ` : ''}{company.name}
        </span>
        <div className="ml-auto flex">
          <button
            onClick={() => setMode('mf')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mode === 'mf'
                ? 'border-white text-white'
                : 'border-transparent text-white/60 hover:text-white/80'
            }`}
          >
            📄 MF仕訳作成
          </button>
          <button
            onClick={() => setMode('audit')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mode === 'audit'
                ? 'border-white text-white'
                : 'border-transparent text-white/60 hover:text-white/80'
            }`}
          >
            🔍 税務監査
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden">
        {mode === 'mf' && <MfJournalPane companyId={company.id} toolType={company.tool_type} />}
        {mode === 'audit' && <TaxAuditPane companyId={company.id} companyName={company.name} />}
      </div>
    </div>
  );
}
