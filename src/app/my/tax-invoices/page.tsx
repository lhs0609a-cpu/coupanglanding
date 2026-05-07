'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatKRW, formatYearMonth } from '@/lib/utils/format';
import { TAX_INVOICE_STATUS_LABELS, TAX_INVOICE_STATUS_COLORS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import MonthPicker from '@/components/ui/MonthPicker';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import { Receipt, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { TaxInvoice } from '@/lib/supabase/types';

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function MyTaxInvoicesPage() {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (yearMonth) params.set('yearMonth', yearMonth);

    try {
      const res = await fetch(`/api/tax-invoices?${params.toString()}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        setError('세금계산서를 불러오지 못했습니다.');
        setInvoices([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
      setInvoices([]);
    }
    setLoading(false);
  }, [yearMonth]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleConfirm = async (invoiceId: string) => {
    setConfirmingId(invoiceId);
    try {
      const res = await fetch(`/api/tax-invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        fetchInvoices();
      } else {
        const data = await res.json();
        setError(data.error || '확인 처리에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    }
    setConfirmingId(null);
  };

  const activeInvoices = invoices.filter((i) => i.status === 'issued' || i.status === 'confirmed');
  const totalSupply = activeInvoices.reduce((s, i) => s + i.supply_amount, 0);
  const totalVat = activeInvoices.reduce((s, i) => s + i.vat_amount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <FeatureTutorial featureKey="tax-invoices" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">세금계산서</h1>
        </div>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="공급가액 합계"
          value={formatKRW(totalSupply)}
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="부가세 합계"
          value={formatKRW(totalVat)}
          subtitle={`발행 ${activeInvoices.length}건`}
          icon={<Receipt className="w-5 h-5" />}
        />
      </div>

      {/* 에러 */}
      {error && (
        <div className="px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 목록 */}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>발행된 세금계산서가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">정산 완료 후 세금계산서가 자동 발행됩니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">번호</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">정산월</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">공급가액</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">VAT</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">합계</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">상태</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">발행일</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-700 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-2 px-3 text-gray-700">{formatYearMonth(inv.year_month)}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{formatKRW(inv.supply_amount)}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{formatKRW(inv.vat_amount)}</td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900">{formatKRW(inv.total_amount)}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        label={TAX_INVOICE_STATUS_LABELS[inv.status]}
                        colorClass={TAX_INVOICE_STATUS_COLORS[inv.status]}
                      />
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500 text-xs">
                      {new Date(inv.issued_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {inv.status === 'issued' && (
                        <button
                          type="button"
                          onClick={() => handleConfirm(inv.id)}
                          disabled={confirmingId === inv.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {confirmingId === inv.id ? '처리중...' : '확인'}
                        </button>
                      )}
                      {inv.status === 'confirmed' && inv.confirmed_at && (
                        <span className="text-xs text-blue-600">
                          {new Date(inv.confirmed_at).toLocaleDateString('ko-KR')} 확인
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
