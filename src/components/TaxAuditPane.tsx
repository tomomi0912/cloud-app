'use client';

export default function TaxAuditPane({ companyId, companyName }: { companyId: number; companyName: string }) {
  return (
    <div className="h-full bg-[#f0f4f8] flex flex-col items-center justify-center text-gray-400">
      <div className="text-5xl mb-4">🔍</div>
      <p className="text-lg font-medium text-gray-600">税務監査</p>
      <p className="text-sm mt-2">（実装予定: {companyName} の税務チェックレポート生成）</p>
      <p className="text-xs mt-1 text-gray-300">companyId: {companyId}</p>
    </div>
  );
}
