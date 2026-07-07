'use client';

import { useState, useMemo, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { COURIER_CHANNEL_CODES } from '@/lib/megaload/constants';
import { Truck, Loader2 } from 'lucide-react';

// 택배사 목록 — COURIER_CHANNEL_CODES 의 키에서 파생 (단일 소스)
const COURIERS = Object.keys(COURIER_CHANNEL_CODES);

export interface InvoiceTarget {
  id: string;
  label: string; // 예: "쿠팡 · 12345 · 홍길동"
}

export interface InvoiceInput {
  orderId: string;
  courierCode: string;
  invoiceNumber: string;
}

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: InvoiceTarget[];
  onSubmit: (invoices: InvoiceInput[]) => Promise<void>;
}

export default function InvoiceModal({ isOpen, onClose, orders, onSubmit }: InvoiceModalProps) {
  const [defaultCourier, setDefaultCourier] = useState<string>(COURIERS[0] || '');
  // orderId -> { courierCode, invoiceNumber }
  const [rows, setRows] = useState<Record<string, { courierCode: string; invoiceNumber: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  // 모달 오픈/대상 변경 시 행 초기화
  useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, { courierCode: string; invoiceNumber: string }> = {};
    for (const o of orders) init[o.id] = { courierCode: defaultCourier, invoiceNumber: '' };
    setRows(init);
    setSubmitting(false);
    // defaultCourier 는 의도적으로 deps 제외 (오픈 시 1회만 초기화)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orders]);

  const isBulk = orders.length > 1;

  // 전체 택배사 일괄 적용
  const applyCourierToAll = (courier: string) => {
    setDefaultCourier(courier);
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = { ...next[id], courierCode: courier };
      return next;
    });
  };

  const canSubmit = useMemo(() => {
    if (orders.length === 0) return false;
    return orders.every((o) => {
      const r = rows[o.id];
      return r && r.courierCode && r.invoiceNumber.trim().length > 0;
    });
  }, [orders, rows]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const invoices: InvoiceInput[] = orders.map((o) => ({
        orderId: o.id,
        courierCode: rows[o.id].courierCode,
        invoiceNumber: rows[o.id].invoiceNumber.trim(),
      }));
      await onSubmit(invoices);
      onClose();
    } catch {
      // 상위(onSubmit)에서 alert 처리, 여기선 모달 유지
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={isBulk ? `송장 일괄등록 (${orders.length}건)` : '송장등록'}
      maxWidth={isBulk ? 'max-w-2xl' : 'max-w-md'}
    >
      <div className="space-y-4">
        {/* 택배사 (일괄 적용) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            택배사 {isBulk && <span className="text-xs text-gray-400">(전체 적용)</span>}
          </label>
          <select
            value={defaultCourier}
            onChange={(e) => applyCourierToAll(e.target.value)}
            disabled={submitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent disabled:bg-gray-100"
          >
            {COURIERS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* 단건: 송장번호 하나 */}
        {!isBulk && orders[0] && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">송장번호</label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={rows[orders[0].id]?.invoiceNumber || ''}
              onChange={(e) =>
                setRows((prev) => ({
                  ...prev,
                  [orders[0].id]: { ...prev[orders[0].id], invoiceNumber: e.target.value.replace(/[^0-9A-Za-z-]/g, '') },
                }))
              }
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="숫자 송장번호 입력"
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-400 mt-1">{orders[0].label}</p>
          </div>
        )}

        {/* 일괄: 주문별 송장번호 행 */}
        {isBulk && (
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 min-w-0 truncate text-xs text-gray-600">{o.label}</span>
                <select
                  value={rows[o.id]?.courierCode || defaultCourier}
                  onChange={(e) =>
                    setRows((prev) => ({ ...prev, [o.id]: { ...prev[o.id], courierCode: e.target.value } }))
                  }
                  disabled={submitting}
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-xs disabled:bg-gray-100"
                >
                  {COURIERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rows[o.id]?.invoiceNumber || ''}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [o.id]: { ...prev[o.id], invoiceNumber: e.target.value.replace(/[^0-9A-Za-z-]/g, '') },
                    }))
                  }
                  placeholder="송장번호"
                  disabled={submitting}
                  className="w-36 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#E31837] focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            ))}
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            {isBulk ? `${orders.length}건 등록` : '등록'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
