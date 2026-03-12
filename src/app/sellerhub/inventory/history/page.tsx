'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { INVENTORY_CHANGE_LABELS } from '@/lib/sellerhub/constants';
import { History, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

interface LogEntry {
  id: string;
  change_type: string;
  change_quantity: number;
  before_quantity: number;
  after_quantity: number;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export default function InventoryHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, count } = await supabase
      .from('sh_inventory_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    setLogs((data as unknown as LogEntry[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">입출고 이력</h1>
        <p className="text-sm text-gray-500 mt-1">재고 변동 이력 조회</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">일시</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">유형</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">변동</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">이전 → 이후</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">불러오는 중...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400"><History className="w-8 h-8 mx-auto mb-2" />이력이 없습니다</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{INVENTORY_CHANGE_LABELS[log.change_type] || log.change_type}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${log.change_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {log.change_quantity > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(log.change_quantity)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{log.before_quantity} → {log.after_quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{log.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{total}건</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-1 text-sm text-gray-700">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
