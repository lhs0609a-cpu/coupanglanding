'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Package, XCircle, AlertTriangle, PauseCircle, Loader2,
  CheckCircle2, ExternalLink, Clock, Activity, Download, Settings, Bell,
} from 'lucide-react';
import StockStatusBadge from './StockStatusBadge';
import PriceRuleModal from './PriceRuleModal';
import PendingPriceApprovalList from './PendingPriceApprovalList';
import type { PriceFollowRule, PendingPriceChange } from '@/lib/supabase/types';

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
  // 가격 추종
  price_follow_rule: PriceFollowRule | null;
  source_price_last: number | null;
  our_price_last: number | null;
  price_last_updated_at: string | null;
  price_last_applied_at: string | null;
  pending_price_change: PendingPriceChange | null;
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
  source_price_before: number | null;
  source_price_after: number | null;
  our_price_before: number | null;
  our_price_after: number | null;
  price_skip_reason: string | null;
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
  unchecked: number;
  pendingApprovalCount: number;
}

type FilterTab = 'all' | 'in_stock' | 'sold_out' | 'error';
type LogFilter = 'all' | 'stock' | 'price';

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  source_sold_out: { label: '품절 감지', color: 'text-red-600' },
  source_restocked: { label: '재입고', color: 'text-green-600' },
  source_removed: { label: '상품 삭제', color: 'text-gray-600' },
  coupang_suspended: { label: '쿠팡 중지', color: 'text-red-600' },
  coupang_resumed: { label: '쿠팡 재개', color: 'text-green-600' },
  check_error: { label: '체크 오류', color: 'text-orange-600' },
  check_ok: { label: '정상', color: 'text-gray-500' },
  price_changed_source: { label: '소스가 변동', color: 'text-blue-600' },
  price_updated_coupang: { label: '가격 적용', color: 'text-green-600' },
  price_update_skipped: { label: '가격 스킵', color: 'text-gray-500' },
  price_update_flagged: { label: '가격 플래그', color: 'text-orange-600' },
  price_update_failed: { label: '가격 실패', color: 'text-red-600' },
  price_update_pending: { label: '승인 대기', color: 'text-yellow-600' },
  price_approved: { label: '승인 완료', color: 'text-green-600' },
  price_rejected: { label: '거부됨', color: 'text-gray-600' },
};

const PRICE_EVENT_TYPES = new Set([
  'price_changed_source', 'price_updated_coupang', 'price_update_skipped',
  'price_update_flagged', 'price_update_failed', 'price_update_pending',
  'price_approved', 'price_rejected',
]);

function ruleSummary(rule: PriceFollowRule | null): { label: string; colorClass: string } {
  if (!rule || !rule.enabled) return { label: 'OFF', colorClass: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200' };
  let label = '';
  switch (rule.type) {
    case 'exact': label = '정가'; break;
    case 'markup_amount': label = `+${(rule.amount ?? 0).toLocaleString()}원`; break;
    case 'markup_percent': label = `+${rule.percent ?? 0}%`; break;
    case 'fixed_margin':
      label = rule.captured_margin != null
        ? `마진고정(₩${rule.captured_margin.toLocaleString()})`
        : '마진고정';
      break;
  }
  const ring = rule.mode === 'auto' ? 'ring-2 ring-blue-400' : 'ring-2 ring-yellow-400';
  return { label, colorClass: `bg-white text-gray-700 ${ring}` };
}

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
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [priceRuleModal, setPriceRuleModal] = useState<
    { mode: 'single'; monitor: MonitorItem } | { mode: 'bulk' } | null
  >(null);
  const [showPendingList, setShowPendingList] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceProgress, setPriceProgress] = useState('');

  const [apiError, setApiError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const statusParam = filterTab === 'all' ? '' : `&status=${filterTab}`;
      const res = await fetch(`/api/megaload/stock-monitor?${statusParam}`);
      const data = await res.json();
      if (!res.ok) {
        const errMsg = `GET ${res.status}: ${data.error || JSON.stringify(data)}`;
        console.error('stock-monitor API error:', errMsg);
        setApiError(errMsg);
        return;
      }
      console.log('[stock-monitor] loaded:', { monitors: data.monitors?.length, stats: data.stats });
      setMonitors(data.monitors || []);
      setStats(data.stats || null);
      setRecentLogs(data.recentLogs || []);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('stock-monitor fetch error:', errMsg);
      setApiError(errMsg);
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

  const handleFetchPrices = async () => {
    setFetchingPrices(true);
    setPriceProgress('가격 조회 시작...');
    let totalUpdated = 0;
    let cursor: string | undefined;
    try {
      // 반복 호출로 전체 처리 (50개씩)
      for (let round = 0; round < 100; round++) {
        const res = await fetch('/api/megaload/stock-monitor/fetch-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPriceProgress(`오류: ${data.error}`);
          break;
        }
        totalUpdated += data.updated || 0;
        setPriceProgress(`${totalUpdated}개 조회 완료, 남은 ${data.remaining}개...`);
        if (data.done) {
          setPriceProgress(`완료! 총 ${totalUpdated}개 가격 업데이트`);
          break;
        }
        cursor = data.cursor;
        // 429 발생 시 5초 대기 후 재시도
        if (data.rateLimited) {
          setPriceProgress(`API 속도 제한 — 5초 대기 중... (${totalUpdated}개 완료)`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      await fetchData();
    } catch (err) {
      console.error('fetch-prices error:', err);
      setPriceProgress('가격 조회 중 오류 발생');
    } finally {
      setFetchingPrices(false);
    }
  };

  const [recheckScheduled, setRecheckScheduled] = useState(false);

  const handleCheckAll = async () => {
    // 즉시 재체크 예약: last_checked_at을 null로 리셋 → 크론이 다음 실행에서 우선 처리
    setRecheckScheduled(true);
    try {
      const res = await fetch('/api/megaload/stock-monitor/check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'recheck_all' }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.reset}개 모니터가 재체크 예약되었습니다.\n30분마다 60개씩 자동 처리됩니다.`);
        await fetchData();
      } else {
        alert(`재체크 예약 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('recheck all error:', err);
      alert('재체크 예약 중 오류가 발생했습니다.');
    } finally {
      setRecheckScheduled(false);
    }
  };

  const handleResetErrors = async () => {
    try {
      const res = await fetch('/api/megaload/stock-monitor/check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'errors' }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.reset}개 모니터의 에러 상태를 초기화했습니다.\n다음 크론 실행 시 자동으로 재체크됩니다.`);
        await fetchData();
      }
    } catch (err) {
      console.error('reset errors:', err);
    }
  };

  /** 파이프라인 진단 실행 — 어디서 끊기는지 확인 */
  const runDiagnose = async (): Promise<string> => {
    try {
      const res = await fetch('/api/megaload/stock-monitor/diagnose');
      const data = await res.json();
      const steps = (data.steps || []) as { step: string; status: string; detail: unknown }[];
      const lines: string[] = ['=== 파이프라인 진단 결과 ===\n'];
      const labels: Record<string, string> = {
        '1_auth': '① 로그인',
        '2_megaload_users_rls': '② DB 계정(RLS)',
        '3_megaload_users_admin': '③ DB 계정(Admin)',
        '4_pt_users': '④ PT 쿠팡 연동',
        '5_channel_credentials': '⑤ API 인증정보',
        '6_coupang_api': '⑥ 쿠팡 API 호출',
        '7_products': '⑦ 상품 DB',
        '8_monitors': '⑧ 모니터 DB',
        '9_inner_join_test': '⑨ 조인 테스트',
      };
      const icons: Record<string, string> = { ok: '[OK]', fail: '[실패]', warn: '[경고]' };
      for (const s of steps) {
        const label = labels[s.step] || s.step;
        const icon = icons[s.status] || s.status;
        const detail = typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail, null, 1);
        lines.push(`${icon} ${label}\n   ${detail}`);
      }
      return lines.join('\n');
    } catch {
      return '진단 API 호출 실패';
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      // 1단계: backfill 시도
      const res = await fetch('/api/megaload/stock-monitor/backfill', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const diag = await runDiagnose();
        alert(`기존 상품 가져오기 실패: ${data.error || '알 수 없는 오류'}\n\n${diag}`);
        return;
      }

      // 상품이 0개면 → 쿠팡 동기화 먼저 실행
      if (data.totalScanned === 0) {
        const doSync = confirm(
          '등록된 상품이 없습니다.\n\n쿠팡에서 판매중인 상품을 자동으로 가져올까요?\n(쿠팡 API 연동이 필요합니다)'
        );
        if (doSync) {
          try {
            const syncRes = await fetch('/api/megaload/products/sync-coupang', { method: 'POST' });
            const syncData = await syncRes.json();
            if (!syncRes.ok) {
              const diag = await runDiagnose();
              alert(`쿠팡 동기화 실패: ${syncData.error || '알 수 없는 오류'}\n\n${diag}`);
              return;
            }
            if (syncData.synced === 0) {
              const diag = await runDiagnose();
              alert(`쿠팡 API에서 가져온 상품이 0개입니다.\n\n${diag}`);
              return;
            }
            alert(`쿠팡 상품 ${syncData.synced}개 동기화 완료!\n모니터 ${syncData.monitorCreated || 0}개 자동 등록`);
            await fetchData();
            return;
          } catch (syncErr) {
            console.error('sync-coupang error:', syncErr);
            const diag = await runDiagnose();
            alert(`쿠팡 동기화 중 오류 발생\n\n${diag}`);
            return;
          }
        }
        return;
      }

      const msgs: string[] = [];
      msgs.push(`신규 등록: ${data.created}개`);
      if (data.alreadyMonitored > 0) msgs.push(`이미 등록됨: ${data.alreadyMonitored}개`);
      if (data.missingUrl > 0) msgs.push(`원본 URL 없음: ${data.missingUrl}개`);
      if (data.missingChannel > 0) msgs.push(`쿠팡 매핑 없음: ${data.missingChannel}개`);
      alert(`기존 상품 가져오기 완료\n\n${msgs.join('\n')}\n\n(전체 스캔 ${data.totalScanned}개)`);

      if (data.created === 0 && data.alreadyMonitored === 0) {
        const diag = await runDiagnose();
        console.log(diag);
      }
      await fetchData();
    } catch (err) {
      console.error('backfill error:', err);
      const diag = await runDiagnose();
      alert(`기존 상품 가져오기 중 오류 발생\n\n${diag}`);
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
            onClick={handleFetchPrices}
            disabled={fetchingPrices || loading || monitors.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            title="쿠팡 API에서 전체 상품 판매가를 일괄 조회합니다"
          >
            {fetchingPrices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {fetchingPrices ? priceProgress : '가격 일괄 조회'}
          </button>
          <button
            onClick={() => setPriceRuleModal({ mode: 'bulk' })}
            disabled={loading || monitors.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            title="필터된 모니터 전체에 가격 추종 규칙을 일괄 적용합니다"
          >
            <Settings className="w-4 h-4" />
            가격 추종 일괄 설정
          </button>
          <button
            onClick={handleCheckAll}
            disabled={recheckScheduled || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            {recheckScheduled ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            전체 재체크 예약
          </button>
        </div>
      </div>

      {/* 승인 대기 배너 */}
      {stats && stats.pendingApprovalCount > 0 && (
        <button
          onClick={() => setShowPendingList(true)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-300 rounded-lg hover:bg-yellow-100 transition text-left"
        >
          <Bell className="w-5 h-5 text-yellow-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900">
              가격 변경 승인 대기 {stats.pendingApprovalCount}건
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              소스 가격 변동으로 인한 가격 업데이트가 승인을 기다리고 있습니다.
            </p>
          </div>
          <span className="text-xs text-yellow-700 font-medium">자세히 →</span>
        </button>
      )}

      {/* 요약 카드 */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <Package className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">전체 모니터</div>
            {stats.unchecked > 0 && (
              <div className="text-[9px] text-gray-400 mt-0.5">{stats.unchecked}개 대기중</div>
            )}
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
          <div className="bg-white rounded-xl border border-orange-200 p-4 text-center" title="쿠팡에서 판매 중지된 상품 수. 원본이 판매중이면 다음 체크 시 자동 재개됩니다.">
            <PauseCircle className="w-5 h-5 mx-auto text-orange-500 mb-1" />
            <div className="text-2xl font-bold text-orange-600">{stats.suspended}</div>
            <div className="text-xs text-gray-500">쿠팡 중지</div>
            {stats.suspended > stats.soldOut + stats.removed && (
              <div className="text-[9px] text-orange-400 mt-0.5">원본 확인 후 자동 재개</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 p-4 text-center relative">
            <AlertTriangle className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
            <div className="text-2xl font-bold text-yellow-600">{stats.error}</div>
            <div className="text-xs text-gray-500">에러</div>
            {stats.error > 0 && (
              <button
                onClick={handleResetErrors}
                className="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] text-yellow-700 bg-yellow-50 border border-yellow-300 rounded hover:bg-yellow-100 transition"
                title="에러 상태를 초기화하여 다음 크론에서 재체크합니다"
              >
                리셋
              </button>
            )}
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
            {apiError && (
              <div className="mb-4 mx-auto max-w-md p-3 bg-red-50 border border-red-200 rounded-lg text-left">
                <p className="text-xs font-medium text-red-700">API 오류</p>
                <p className="text-[11px] text-red-600 mt-1 break-all">{apiError}</p>
              </div>
            )}
            <RefreshCw className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">모니터링 대상 상품이 없습니다</p>
            <p className="text-xs mt-1">아래 버튼을 눌러 쿠팡 판매중인 상품을 가져오세요</p>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {backfilling ? '상품 동기화 중...' : '쿠팡 상품 가져오기'}
            </button>
            <p className="text-[10px] text-gray-400 mt-2">
              이미 등록된 상품은 자동 감지하며, 없으면 쿠팡 API에서 직접 가져옵니다
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상품명</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">원본 상태</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">쿠팡 상태</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">원본가(네이버)</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">판매가(쿠팡)</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">추종 규칙</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">마지막 확인</th>
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
                            {m.source_url ? (
                              <a
                                href={m.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                              >
                                원본 <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                                원본 URL 필요
                              </span>
                            )}
                            {m.coupang_product_id && (
                              <a
                                href={`https://wing.coupang.com/tenants/manage-product/products?searchKeyword=${m.coupang_product_id}&searchType=SELLER_PRODUCT_ID`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5"
                                title="쿠팡 Wing 셀러센터에서 보기"
                              >
                                쿠팡 <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StockStatusBadge status={
                        !m.last_checked_at ? 'unknown' : m.source_status as 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error'
                      } />
                      {m.source_status === 'error' && m.consecutive_errors > 0 && (
                        <div className="text-[9px] text-orange-500 mt-0.5">
                          {m.consecutive_errors >= 5 ? '네이버 속도제한' : `연속 ${m.consecutive_errors}회 실패`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StockStatusBadge status={
                        !m.last_checked_at ? 'unknown' : m.coupang_status as 'active' | 'suspended'
                      } />
                      {m.last_checked_at && m.coupang_status === 'suspended' && m.source_status !== 'error' && (
                        <div className="text-[9px] text-orange-500 mt-0.5">재개 대기중</div>
                      )}
                      {m.last_checked_at && m.coupang_status === 'suspended' && m.source_status === 'error' && (
                        <div className="text-[9px] text-gray-400 mt-0.5">확인 후 재개</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.source_price_last != null ? (
                        <>
                          <span className="text-xs text-gray-700 font-mono">
                            ₩{m.source_price_last.toLocaleString()}
                          </span>
                          {m.price_last_updated_at && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {timeAgo(m.price_last_updated_at)} 감지
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {m.source_status === 'error' ? '조회 실패' : !m.last_checked_at ? '미조회' : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.our_price_last != null ? (
                        <>
                          <span className="text-xs text-gray-700 font-mono">
                            ₩{m.our_price_last.toLocaleString()}
                          </span>
                          {m.last_checked_at && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {timeAgo(m.last_checked_at)} 조회
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {!m.last_checked_at ? '미조회' : '조회 중'}
                        </span>
                      )}
                      {m.pending_price_change && (
                        <div className="text-[10px] text-yellow-700 mt-0.5">
                          → ₩{m.pending_price_change.newPrice.toLocaleString()} 대기
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const s = ruleSummary(m.price_follow_rule);
                        return (
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded ${s.colorClass}`}>
                            {s.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.last_checked_at ? (
                        <>
                          <span className="text-xs text-gray-500 flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(m.last_checked_at)}
                          </span>
                          <div className="text-[10px] text-gray-400">
                            {new Date(m.last_checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">미확인</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setPriceRuleModal({ mode: 'single', monitor: m })}
                          className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition"
                          title="가격 추종 설정"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              최근 변경 이력
            </h3>
            <div className="flex items-center gap-1">
              {(['all', 'stock', 'price'] as LogFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className={`px-3 py-1 text-[11px] rounded-full border transition ${
                    logFilter === f
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {f === 'all' ? '전체' : f === 'stock' ? '품절' : '가격'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentLogs
              .filter((log) => {
                if (logFilter === 'all') return true;
                const isPrice = PRICE_EVENT_TYPES.has(log.event_type);
                return logFilter === 'price' ? isPrice : !isPrice;
              })
              .map((log) => {
                const eventConfig = EVENT_LABELS[log.event_type] || { label: log.event_type, color: 'text-gray-500' };
                const isPrice = PRICE_EVENT_TYPES.has(log.event_type);
                return (
                  <div key={log.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 last:border-b-0">
                    <span className="text-gray-400 w-24 shrink-0">
                      {new Date(log.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`font-medium w-20 shrink-0 ${eventConfig.color}`}>
                      {eventConfig.label}
                    </span>
                    {isPrice ? (
                      <span className="text-gray-600 font-mono">
                        {log.source_price_before != null || log.source_price_after != null ? (
                          <>소스 ₩{log.source_price_before?.toLocaleString() ?? '-'} → ₩{log.source_price_after?.toLocaleString() ?? '-'}</>
                        ) : null}
                        {log.our_price_before != null && log.our_price_after != null && (
                          <span className="ml-2">우리 ₩{log.our_price_before.toLocaleString()} → ₩{log.our_price_after.toLocaleString()}</span>
                        )}
                      </span>
                    ) : (
                      log.source_status_before && log.source_status_after && (
                        <span className="text-gray-500">
                          {log.source_status_before} → {log.source_status_after}
                        </span>
                      )
                    )}
                    {log.option_name && (
                      <span className="text-gray-400">옵션: {log.option_name}</span>
                    )}
                    {log.action_taken && (
                      <span className={`${log.action_success ? 'text-green-600' : 'text-red-600'}`}>
                        [{log.action_taken}]
                      </span>
                    )}
                    {log.price_skip_reason && (
                      <span className="text-gray-400 truncate max-w-[200px]">{log.price_skip_reason}</span>
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

      {/* 가격 추종 규칙 모달 */}
      {priceRuleModal && (
        <PriceRuleModal
          open={true}
          onClose={() => setPriceRuleModal(null)}
          monitor={priceRuleModal.mode === 'single' ? {
            id: priceRuleModal.monitor.id,
            source_price_last: priceRuleModal.monitor.source_price_last,
            our_price_last: priceRuleModal.monitor.our_price_last,
            price_follow_rule: priceRuleModal.monitor.price_follow_rule,
            productName: priceRuleModal.monitor.sh_products?.display_name || priceRuleModal.monitor.sh_products?.product_name || '',
          } : undefined}
          monitorIds={priceRuleModal.mode === 'bulk' ? monitors.map((m) => m.id) : undefined}
          onSaved={() => { setPriceRuleModal(null); fetchData(); }}
        />
      )}

      {/* 승인 대기 목록 모달 */}
      {showPendingList && (
        <PendingPriceApprovalList
          open={true}
          onClose={() => setShowPendingList(false)}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}
