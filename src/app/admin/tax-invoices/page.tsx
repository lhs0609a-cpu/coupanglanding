'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth } from '@/lib/utils/format';
import { TAX_INVOICE_STATUS_LABELS, TAX_INVOICE_STATUS_COLORS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import Modal from '@/components/ui/Modal';
import MonthPicker from '@/components/ui/MonthPicker';
import { Receipt, FileText, XCircle, Search } from 'lucide-react';
import type { TaxInvoice } from '@/lib/supabase/types';

export default function AdminTaxInvoicesPage() {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelModal, setCancelModal] = useState<TaxInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (yearMonth) params.set('yearMonth', yearMonth);
    if (statusFilter) params.set('status', statusFilter);

    try {
      const res = await fetch(`/api/tax-invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch {
      // 무시
    }
    setLoading(false);
  }, [yearMonth, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleCancel = async () => {
    if (!cancelModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tax-invoices/${cancelModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelled_reason: cancelReason }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '세금계산서가 취소되었습니다.' });
        setCancelModal(null);
        setCancelReason('');
        fetchInvoices();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || '취소 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '취소 중 오류가 발생했습니다.' });
    }
    setActionLoading(false);
  };

  const issuedInvoices = invoices.filter((i) => i.status === 'issued');
  const totalSupply = issuedInvoices.reduce((s, i) => s + i.supply_amount, 0);
  const totalVat = issuedInvoices.reduce((s, i) => s + i.vat_amount, 0);
  const totalAmount = issuedInvoices.reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">세금계산서 관리</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none"
          >
            <option value="">전체 상태</option>
            <option value="issued">발행됨</option>
            <option value="cancelled">취소됨</option>
          </select>
          <MonthPicker value={yearMonth} onChange={setYearMonth} />
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="공급가액 합계"
          value={formatKRW(totalSupply)}
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="부가세 합계"
          value={formatKRW(totalVat)}
          icon={<Receipt className="w-5 h-5" />}
        />
        <StatCard
          title="총액 합계"
          value={formatKRW(totalAmount)}
          subtitle={`발행 ${issuedInvoices.length}건`}
          icon={<Search className="w-5 h-5" />}
        />
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {message.text}
        </div>
      )}

      {/* 목록 */}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center text-gray-400">세금계산서가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">번호</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">파트너</th>
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
                {invoices.map((inv) => {
                  const ptProfile = (inv as TaxInvoice & { pt_user?: { profile?: { full_name?: string } } }).pt_user?.profile;
                  return (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-700 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="py-2 px-3 text-gray-700">{ptProfile?.full_name || inv.buyer_business_name || '-'}</td>
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
                            onClick={() => setCancelModal(inv)}
                            className="text-red-600 hover:text-red-700 text-xs font-medium"
                          >
                            취소
                          </button>
                        )}
                        {inv.status === 'cancelled' && inv.cancelled_reason && (
                          <span className="text-xs text-gray-400" title={inv.cancelled_reason}>사유 보기</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 취소 모달 */}
      <Modal
        isOpen={!!cancelModal}
        onClose={() => { setCancelModal(null); setCancelReason(''); }}
        title="세금계산서 취소"
      >
        <div className="space-y-4">
          {cancelModal && (
            <>
              <p className="text-sm text-gray-600">
                세금계산서 <span className="font-mono font-medium">{cancelModal.invoice_number}</span>을 취소합니다.
              </p>
              <div>
                <label htmlFor="cancelReason" className="block text-sm font-medium text-gray-700 mb-1">취소 사유</label>
                <textarea
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]"
                  placeholder="취소 사유를 입력하세요"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setCancelModal(null); setCancelReason(''); }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  {actionLoading ? '처리 중...' : '취소 확인'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
