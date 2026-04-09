'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Package, XCircle, AlertTriangle, PauseCircle, Loader2,
  CheckCircle2, ExternalLink, Clock, Activity, Download,
} from 'lucide-react';
import StockStatusBadge from './StockStatusBadge';

interface MonitorItem {
  id: string;
  product_id: string;
  coupang_product_id: string;
  source_url: string;
  source_status: string;
  coupang_status: string;
  option_statuses: { optionName: string; status: string }[];
  is_active: boolean;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_action_at: string | null;
  consecutive_errors: number;
  created_at: string;
  sh_products: { product_name: string; display_name: string; brand: string };
}

interface LogItem {
  id: string;
  monitor_id: string;
  event_type: string;
  source_status_before: string | null;
  source_status_after: string | null;
  coupang_status_before: string | null;
  coupang_status_after: string | null;
  option_name: string | null;
  action_taken: string | null;
  action_success: boolean | null;
  error_message: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  inStock: number;
  soldOut: number;
  removed: number;
  suspended: number;
  error: number;
  inactive: number;
}

type FilterTab = 'all' | 'in_stock' | 'sold_out' | 'error';

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  source_sold_out: { label: '품절 감지', color: 'text-red-600' },
  source_restocked: { label: '재입고', color: 'text-green-600' },
  source_removed: { label: '상품 삭제', color: 'text-gray-600' },
  coupang_suspended: { label: '쿠팡 중지', color: 'text-red-600' },
  coupang_resumed: { label: '쿠팡 재개', color: 'text-green-600' },
  check_error: { label: '체크 오류', color: 'text-orange-600' },
  check_ok: { label: '정상', color: 'text-gray-500' },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function StockMonitorDashboard() {
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = filterTab === 'all' ? '' : `&status=${filterTab}`;
      const res = await fetch(`/api/megaload/stock-monitor?${statusParam}`);
      if (!res.ok) throw new Error('데이터 로딩 실패');
      const data = await res.json();
      setMonitors(data.monitors || []);
      setStats(data.stats || null);
      setRecentLogs(data.recentLogs || []);
    } catch (err) {
      console.error('stock-monitor fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckNow = async (monitorId: string) => {
    setCheckingIds(prev => new Set(prev).add(monitorId));
    try {
      const res = await fetch('/api/megaload/stock-monitor/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitorIds: [monitorId] }),
      });
      if (res.ok) {
        // 결과 반영을 위해 목록 새로고침
        await fetchData();
      }
    } catch (err) {
      console.error('check error:', err);
    } finally {
      setCheckingIds(prev => {
        const next = new Set(prev);
        next.delete(monitorId);
        return next;
      });
    }
  };

  const handleCheckAll = async () => {
    const activeMonitorIds = monitors.filter(m => m.is_active).map(m => m.id).slice(0, 20);
    if (activeMonitorIds.length === 0) return;

    setCheckingIds(new Set(activeMonitorIds));
    try {
      const res = await fetch('/api/megaload/stock-monitor/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitorIds: activeMonitorIds }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('check all error:', err);
    } finally {
      setCheckingIds(new Set());
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch('/api/megaload/stock-monitor/backfill', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`기존 상품 가져오기 실패: ${data.error || '알 수 없는 오류'}`);
        return;
      }
      const msgs: string[] = [];
      msgs.push(`신규 등록: ${data.created}개`);
      if (data.alreadyMonitored > 0) msgs.push(`이미 등록됨: ${data.alreadyMonitored}개`);
      if (data.missingUrl > 0) msgs.push(`원본 URL 없음: ${data.missingUrl}개`);
      if (data.missingChannel > 0) msgs.push(`쿠팡 매핑 없음: ${data.missingChannel}개`);
      alert(`기존 상품 가져오기 완료\n\n${msgs.join('\n')}\n\n(전체 스캔 ${data.totalScanned}개)`);
      await fetchData();
    } catch (err) {
      console.error('backfill error:', err);
      alert('기존 상품 가져오기 중 오류가 발생했습니다.');
    } finally {
      setBackfilling(false);
    }
  };

  const handleDeactivate = async (monitorId: string) => {
    try {
      await fetch(`/api/megaload/stock-monitor?id=${monitorId}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      console.error('deactivate error:', err);
    }
  };

  const tabButtons: { tab: FilterTab; label: string; count: number }[] = [
    { tab: 'all', label: '전체', count: stats?.total ?? 0 },
    { tab: 'in_stock', label: '판매중', count: stats?.inStock ?? 0 },
    { tab: 'sold_out', label: '품절', count: stats?.soldOut ?? 0 },
    { tab: 'error', label: '오류', count: stats?.error ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">품절 동기화</h1>
          <p className="text-sm text-gray-500 mt-0.5">원본(네이버) 품절 상태를 감시하여 쿠팡 상품을 자동 중지/재개합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackfill}
            disabled={backfilling || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            title="이미 등록된 쿠팡 상품들을 모니터 목록에 일괄 추가합니다"
          >
            {backfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            기존 상품 가져오기
          </button>
          <button
            onClick={handleCheckAll}
            disabled={checkingIds.size > 0 || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            {checkingIds.size > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            전체 즉시 확인
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <Package className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">전체 모니터</div>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold text-green-600">{stats.inStock}</div>
            <div className="text-xs text-gray-500">판매중</div>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
            <XCircle className="w-5 h-5 mx-auto text-red-500 mb-1" />
            <div className="text-2xl font-bold text-red-600">{stats.soldOut + stats.removed}</div>
            <div className="text-xs text-gray-500">품절 감지</div>
          </div>
          <div className="bg-white rounded-xl border border-orange-200 p-4 text-center">
            <PauseCircle className="w-5 h-5 mx-auto text-orange-500 mb-1" />
            <div className="text-2xl font-bold text-orange-600">{stats.suspended}</div>
            <div className="text-xs text-gray-500">쿠팡 중지</div>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
            <div className="text-2xl font-bold text-yellow-600">{stats.error}</div>
            <div className="text-xs text-gray-500">에러</div>
          </div>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="flex items-center gap-2">
        {tabButtons.map(({ tab, label, count }) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={`px-4 py-1.5 text-xs rounded-full border transition ${
              filterTab === tab
                ? 'bg-[#E31837] text-white border-[#E31837]'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`ml-1 px-1.5 py-px rounded-full text-[10px] font-medium ${
                filterTab === tab ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={fetchData}
          disabled={loading}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 상품 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-400">로딩 중...</span>
          </div>
        ) : monitors.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <RefreshCw className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">모니터링 대상 상품이 없습니다</p>
            <p className="text-xs mt-1">신규 상품등록 시 자동으로 등록됩니다</p>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              기존 등록 상품 가져오기
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상품명</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">원본 상태</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">쿠팡 상태</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">마지막 확인</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">마지막 변경</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monitors.map((m) => {
                const product = m.sh_products;
                const isChecking = checkingIds.has(m.id);

                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[300px]">
                            {product?.display_name || product?.product_name || '상품명 없음'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {product?.brand && (
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                {product.brand}
                              </span>
                            )}
                            <a
                              href={m.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                            >
                              원본 <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            {m.coupang_product_id && (
                              <a
                                href={`https://www.coupang.com/vp/products/${m.coupang_product_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5"
                              >
                                쿠팡 <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StockStatusBadge status={m.source_status as 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error'} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StockStatusBadge status={m.coupang_status as 'active' | 'suspended'} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-gray-500 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(m.last_checked_at)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-gray-500">
                        {timeAgo(m.last_changed_at)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleCheckNow(m.id)}
                          disabled={isChecking}
                          className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 transition"
                          title="지금 확인"
                        >
                          {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : '확인'}
                        </button>
                        <button
                          onClick={() => handleDeactivate(m.id)}
                          className="px-2 py-1 text-[10px] font-medium text-gray-500 bg-gray-50 rounded hover:bg-gray-100 transition"
                          title="모니터링 중지"
                        >
                          중지
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 최근 이력 */}
      {recentLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-gray-500" />
            최근 변경 이력
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentLogs.map((log) => {
              const eventConfig = EVENT_LABELS[log.event_type] || { label: log.event_type, color: 'text-gray-500' };
              return (
                <div key={log.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 last:border-b-0">
                  <span className="text-gray-400 w-24 shrink-0">
                    {new Date(log.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`font-medium w-20 shrink-0 ${eventConfig.color}`}>
                    {eventConfig.label}
                  </span>
                  {log.source_status_before && log.source_status_after && (
                    <span className="text-gray-500">
                      {log.source_status_before} → {log.source_status_after}
                    </span>
                  )}
                  {log.option_name && (
                    <span className="text-gray-400">옵션: {log.option_name}</span>
                  )}
                  {log.action_taken && (
                    <span className={`${log.action_success ? 'text-green-600' : 'text-red-600'}`}>
                      [{log.action_taken}]
                    </span>
                  )}
                  {log.error_message && (
                    <span className="text-red-500 truncate max-w-[200px]">{log.error_message}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
