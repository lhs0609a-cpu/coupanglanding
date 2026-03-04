'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import { Activity } from 'lucide-react';
import {
  ACTIVITY_ACTION_LABELS,
  TARGET_TYPE_LABELS,
} from '@/lib/utils/activity-log';
import type { AdminActivityLog, ActivityAction } from '@/lib/supabase/types';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = Object.entries(ACTIVITY_ACTION_LABELS).map(
  ([value, label]) => ({ value, label })
);

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatDetails(details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '-';
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

export default function AdminActivityLogPage() {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchLogs = useCallback(
    async (offset = 0, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      let query = supabase
        .from('admin_activity_logs')
        .select('*, admin_profile:profiles!admin_id(id, full_name, email)')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }
      if (actionFilter) {
        query = query.eq('action', actionFilter);
      }

      const { data } = await query;
      const fetched = (data as AdminActivityLog[]) || [];

      if (append) {
        setLogs((prev) => [...prev, ...fetched]);
      } else {
        setLogs(fetched);
      }

      setHasMore(fetched.length === PAGE_SIZE);
      setLoading(false);
      setLoadingMore(false);
    },
    [supabase, startDate, endDate, actionFilter]
  );

  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  const handleLoadMore = () => {
    fetchLogs(logs.length, true);
  };

  const handleSearch = () => {
    fetchLogs(0, false);
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setActionFilter('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="w-7 h-7 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">활동 로그</h1>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="startDate"
              className="text-xs font-medium text-gray-500"
            >
              시작일
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="endDate"
              className="text-xs font-medium text-gray-500"
            >
              종료일
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="actionFilter"
              className="text-xs font-medium text-gray-500"
            >
              액션
            </label>
            <select
              id="actionFilter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] bg-white"
            >
              <option value="">전체</option>
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
            >
              검색
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
            >
              초기화
            </button>
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card>
        <h2 className="font-bold text-gray-900 mb-4">활동 내역</h2>

        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            활동 로그가 없습니다.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">
                      일시
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">
                      관리자
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">
                      액션
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">
                      대상
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">
                      상세
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {log.admin_profile?.full_name || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-0.5 bg-red-50 text-[#E31837] rounded text-xs font-medium">
                          {ACTIVITY_ACTION_LABELS[log.action as ActivityAction] ||
                            log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                          {TARGET_TYPE_LABELS[log.target_type] ||
                            log.target_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs max-w-xs truncate">
                        {formatDetails(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {loadingMore ? '불러오는 중...' : '더 보기'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
