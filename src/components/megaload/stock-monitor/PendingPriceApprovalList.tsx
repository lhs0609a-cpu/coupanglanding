'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { PendingPriceChange, PriceFollowRule } from '@/lib/supabase/types';

interface PendingMonitor {
  id: string;
  pending_price_change: PendingPriceChange | null;
  price_follow_rule: PriceFollowRule | null;
  sh_products: { product_name: string; display_name: string; brand: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function ruleLabel(rule: PriceFollowRule | null): string {
  if (!rule || !rule.enabled) return '-';
  switch (rule.type) {
    case 'exact': return '정가';
    case 'markup_amount': return `+${(rule.amount ?? 0).toLocaleString()}원`;
    case 'markup_percent': return `+${rule.percent ?? 0}%`;
    case 'fixed_margin': return rule.captured_margin != null
      ? `마진고정(₩${rule.captured_margin.toLocaleString()})`
      : '마진고정';
  }
}

export default function PendingPriceApprovalList({ open, onClose, onUpdated }: Props) {
  const [items, setItems] = useState<PendingMonitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/megaload/stock-monitor?pendingOnly=true&limit=100');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로딩 실패');
      setItems(data.monitors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleApprove = async (monitorId: string) => {
    setProcessing((prev) => new Set(prev).add(monitorId));
    try {
      const res = await fetch('/api/megaload/stock-monitor/price-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`승인 실패: ${data.error}`);
      } else {
        await load();
        onUpdated();
      }
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(monitorId);
        return next;
      });
    }
  };

  const handleReject = async (monitorId: string) => {
    const reason = prompt('거부 사유 (선택)') ?? undefined;
    if (reason === null) return;
    setProcessing((prev) => new Set(prev).add(monitorId));
    try {
      const res = await fetch('/api/megaload/stock-monitor/price-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitorId, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`거부 실패: ${data.error}`);
      } else {
        await load();
        onUpdated();
      }
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(monitorId);
        return next;
      });
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="가격 변경 승인 대기" maxWidth="max-w-4xl">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500">승인 대기 중인 가격 변경이 없습니다.</div>
      ) : (
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {items.map((item) => {
            const pending = item.pending_price_change;
            if (!pending) return null;
            const diff = pending.newPrice - pending.oldPrice;
            const pct = pending.oldPrice ? (diff / pending.oldPrice) * 100 : 0;
            const isProcessing = processing.has(item.id);
            return (
              <div key={item.id} className="flex items-center gap-3 px-3 py-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {item.sh_products?.display_name || item.sh_products?.product_name || '상품명 없음'}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="font-mono">
                      소스 ₩{pending.sourcePrice.toLocaleString()}
                    </span>
                    <span className="font-mono">
                      우리 ₩{pending.oldPrice.toLocaleString()} → <span className="text-gray-900 font-semibold">₩{pending.newPrice.toLocaleString()}</span>
                    </span>
                    <span className={`font-medium ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({diff > 0 ? '+' : ''}{diff.toLocaleString()}원 / {pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                    <span>규칙: {ruleLabel(item.price_follow_rule)}</span>
                    <span>·</span>
                    <span>{new Date(pending.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {pending.reason && <><span>·</span><span>{pending.reason}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 transition"
                  >
                    <XIcon className="w-3 h-3" />
                    거부
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
