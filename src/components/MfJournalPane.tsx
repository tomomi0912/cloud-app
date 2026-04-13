'use client';

import { useState } from 'react';
import NippoTab from './mf/NippoTab';
import PatientPdfTab from './mf/PatientPdfTab';
import HokuoFarmTab from './mf/HokuoFarmTab';
import HachihachiTab from './mf/HachihachiTab';

type MfTab = 'nippo' | 'pdf' | 'hokuofarm' | 'hachihachi';

const ALL_TABS: { id: MfTab; label: string }[] = [
  { id: 'hokuofarm',   label: '請求先別収支表' },
  { id: 'hachihachi',  label: '八十八エクセル取込' },
  { id: 'nippo',       label: '日報CSV取込' },
  { id: 'pdf',         label: '患者毎PDF' },
];

function getVisibleTabs(toolType: string): { id: MfTab; label: string }[] {
  if (toolType === 'hokuofarm')  return ALL_TABS.filter(t => t.id === 'hokuofarm');
  if (toolType === 'hachihachi') return ALL_TABS.filter(t => t.id === 'hachihachi');
  if (toolType === 'nippo')      return ALL_TABS.filter(t => t.id === 'nippo' || t.id === 'pdf');
  return ALL_TABS; // 'all'
}

export default function MfJournalPane({ companyId: _companyId, toolType = 'all' }: { companyId: number; toolType?: string }) {
  const visibleTabs = getVisibleTabs(toolType);
  const [tab, setTab] = useState<MfTab>(visibleTabs[0].id);

  return (
    <div className="h-full flex flex-col">
      {/* サブタブ */}
      <div className="bg-[#1e3a5f] flex-shrink-0 flex px-3">
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm border-b-2 transition-colors
              ${tab === t.id
                ? 'border-blue-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden">
        {tab === 'hokuofarm'  && <HokuoFarmTab />}
        {tab === 'hachihachi' && <HachihachiTab />}
        {tab === 'nippo'      && <NippoTab />}
        {tab === 'pdf'        && <PatientPdfTab />}
      </div>
    </div>
  );
}
