'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  RefreshCw, Package, XCircle, AlertTriangle, PauseCircle, Loader2,
  CheckCircle2, ExternalLink, Clock, Link2Off, PlayCircle,
  ChevronRight, ChevronDown, Zap,
} from 'lucide-react';
import StockStatusBadge from './StockStatusBadge';
import MonitorHistoryPanel from './MonitorHistoryPanel';
import PriceRuleModal from './PriceRuleModal';
import { effectivePriceFollowRule } from '@/lib/megaload/price-follow-default';
import type { PriceFollowRule } from '@/lib/supabase/types';

interface MonitorItem {
  id: string;
  coupang_product_id: string;
  source_url: string;
  source_status: string;
  coupang_status: string;
  is_active: boolean;
  last_checked_at: string | null;
  consecutive_errors: number;
  source_price_last: number | null;
  our_price_last: number | null;
  price_last_updated_at: string | null;
  price_follow_rule: PriceFollowRule | null;
  sh_products: { product_name: string; display_name: string; brand: string };
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
  needsSourceUrl: number;
}

type FilterTab = 'all' | 'in_stock' | 'sold_out' | 'error' | 'no_source_url';

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
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [apiError, setApiError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState('');

  // 상품별 이력 토글 (펼친 모니터 id)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 가격 자동추종 설정 모달
  const [ruleTarget, setRuleTarget] = useState<MonitorItem | null>(null);
  const [bulkRuleOpen, setBulkRuleOpen] = useState(false);

  // 데스크탑 앱 (메가로드 도우미) 상태 — 꺼져 있으면 네이버 조회가 전부 실패한다.
  interface DesktopStatus {
    isAlive: boolean;
    tokenIssued: boolean;
    lastHeartbeatAt: string | null;
    heartbeatAgeMin: number;
    monitorsCheckedRecently: number;
    diagnosis: string;
  }
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);

  const fetchDesktopStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/megaload/desktop/status');
      if (res.ok) setDesktopStatus(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchDesktopStatus();
    // 30초 폴링 + 창 포커스 복귀 시 즉시 갱신 — 도우미를 막 켰을 때 "꺼짐"이 오래 남던 문제 해소.
    const id = setInterval(fetchDesktopStatus, 30_000);
    const onFocus = () => fetchDesktopStatus();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [fetchDesktopStatus]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const statusParam = filterTab === 'all' ? '' : `&status=${filterTab}`;
      const res = await fetch(`/api/megaload/stock-monitor?${statusParam}`);
      const data = await res.json();
      if (!res.ok) {
        setApiError(`GET ${res.status}: ${data.error || JSON.stringify(data)}`);
        return;
      }
      setMonitors(data.monitors || []);
      setStats(data.stats || null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filterTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 단 하나의 버튼 — "전체 점검 시작".
   * 1) 신규 쿠팡 상품을 모니터에 합류 (조용히, 실패 무시)
   * 2) 조회 실패(에러) 상태 복구 → 다시 점검 대상에 포함
   * 3) 전체 상품을 새로 점검하도록 예약 (last_checked_at 리셋)
   * 이후엔 PC의 메가로드 도우미가 켜져 있는 한 24시간 자동으로 갱신한다.
   */
  const handleStartScan = async () => {
    setStarting(true);
    setStartMsg('신규 상품 확인...');
    try {
      try {
        await fetch('/api/megaload/stock-monitor/backfill', { method: 'POST' });
      } catch { /* 신규 상품 없거나 실패해도 진행 */ }

      setStartMsg('실패 상품 복구...');
      await fetch('/api/megaload/stock-monitor/check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'error_state' }),
      });

      setStartMsg('전체 점검 예약...');
      const res = await fetch('/api/megaload/stock-monitor/check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'recheck_all' }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(
          `전체 ${data.reset ?? ''}개 상품 점검을 시작했습니다.\n\n` +
          `PC의 메가로드 도우미가 켜져 있으면 24시간 자동으로 원본 상태·가격을 갱신합니다.\n` +
          `한 바퀴 도는 데 약 4~5시간 걸리고, 끝나면 자동으로 다시 돕니다.`,
        );
        await fetchData();
      } else {
        alert(`점검 시작 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('start scan error:', err);
      alert('점검 시작 중 오류가 발생했습니다.');
    } finally {
      setStarting(false);
      setStartMsg('');
    }
  };

  const tabButtons: { tab: FilterTab; label: string; count: number }[] = [
    { tab: 'all', label: '전체', count: stats?.total ?? 0 },
    { tab: 'in_stock', label: '판매중', count: stats?.inStock ?? 0 },
    { tab: 'sold_out', label: '품절', count: stats?.soldOut ?? 0 },
    { tab: 'error', label: '오류', count: stats?.error ?? 0 },
    { tab: 'no_source_url', label: '원본 URL 필요', count: stats?.needsSourceUrl ?? 0 },
  ];

  // 데스크탑 앱 배너 — 토큰 발급된 사용자에 한해, 비정상일 때만
  const showDesktopBanner = !!desktopStatus
    && desktopStatus.tokenIssued
    && (!desktopStatus.isAlive || desktopStatus.monitorsCheckedRecently === 0);

  // 신호등 — 메가로드 도우미 실시간 연동 상태 (헤더에 항상 표시)
  const light: {
    color: 'green' | 'yellow' | 'red' | 'gray';
    label: string;
    detail: string;
    pulse: boolean;
  } = !desktopStatus
    ? { color: 'gray', label: '연동 확인 중', detail: '도우미 상태를 확인하고 있습니다…', pulse: false }
    : !desktopStatus.tokenIssued
      ? { color: 'gray', label: '도우미 미설치', detail: '메가로드 도우미를 설치·연결해야 자동 점검이 됩니다.', pulse: false }
      : !desktopStatus.isAlive
        ? {
            color: 'red',
            label: '연동 끊김',
            detail: desktopStatus.heartbeatAgeMin >= 0
              ? `마지막 접속 ${desktopStatus.heartbeatAgeMin >= 60 ? `${Math.floor(desktopStatus.heartbeatAgeMin / 60)}시간` : `${desktopStatus.heartbeatAgeMin}분`} 전 — 도우미가 꺼져 있습니다.`
              : '도우미가 한 번도 접속한 적 없습니다.',
            pulse: false,
          }
        : desktopStatus.monitorsCheckedRecently === 0
          ? { color: 'yellow', label: '연결됨 · 대기중', detail: '도우미는 접속 중이며 곧 점검 결과가 도착합니다.', pulse: true }
          : {
              color: 'green',
              label: '실시간 연동중',
              detail: `정상 동작 중 — 최근 1시간 ${desktopStatus.monitorsCheckedRecently}건 갱신`,
              pulse: true,
            };

  const lightStyles: Record<typeof light.color, { wrap: string; dot: string; text: string }> = {
    green: { wrap: 'bg-green-50 border-green-200', dot: 'bg-green-500', text: 'text-green-700' },
    yellow: { wrap: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-400', text: 'text-yellow-700' },
    red: { wrap: 'bg-red-50 border-red-200', dot: 'bg-red-500', text: 'text-red-700' },
    gray: { wrap: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400', text: 'text-gray-500' },
  };
  const ls = lightStyles[light.color];

  return (
    <div className="space-y-6">
      {/* 메가로드 도우미가 꺼져 있을 때만 뜨는 경고 */}
      {showDesktopBanner && desktopStatus && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-orange-900">
              메가로드 도우미(PC 프로그램)가 꺼져 있습니다 — 켜야 자동 점검이 됩니다
            </div>
            <div className="text-xs text-orange-800 mt-1">
              도우미가 켜져 있으면 원본 상태·가격을 24시간 자동으로 갱신합니다. 꺼져 있으면 조회가 실패합니다.
              {desktopStatus.heartbeatAgeMin >= 0 && (
                <span className="ml-1 text-orange-700">
                  (마지막 접속 {desktopStatus.heartbeatAgeMin >= 60
                    ? `${Math.floor(desktopStatus.heartbeatAgeMin / 60)}시간`
                    : `${desktopStatus.heartbeatAgeMin}분`} 전)
                </span>
              )}
            </div>
            <div className="mt-2">
              <a
                href="/megaload/desktop-app"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-orange-900 bg-white border border-orange-300 rounded hover:bg-orange-100 transition"
              >
                메가로드 도우미 켜기 / 설치하기 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 — 버튼은 단 하나 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">품절 동기화</h1>
            {/* 신호등 — 메가로드 도우미 실시간 연동 상태 */}
            <a
              href="/megaload/desktop-app"
              title={light.detail}
              className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border text-xs font-semibold transition hover:brightness-95 ${ls.wrap} ${ls.text}`}
            >
              <span className="relative flex h-2.5 w-2.5">
                {light.pulse && (
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${ls.dot}`} />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${ls.dot}`} />
              </span>
              도우미 {light.label}
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            버튼 한 번이면 전체 상품의 원본 상태·가격을 점검합니다. 이후 PC의 메가로드 도우미가 24시간 자동으로 갱신합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkRuleOpen(true)}
            disabled={loading || monitors.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            title="원본가 변동 시 우리 판매가를 자동으로 따라 올리거나 내립니다"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            가격 자동추종 일괄설정
          </button>
          <button
            onClick={handleStartScan}
            disabled={starting || loading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {starting ? (startMsg || '시작 중...') : '전체 점검 시작'}
          </button>
        </div>
      </div>

      {/* 요약 카드 (읽기 전용) */}
      {stats && (
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <Package className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">전체 모니터</div>
            {stats.unchecked > 0 && (
              <div className="text-[9px] text-gray-400 mt-0.5">{stats.unchecked}개 대기중</div>
            )}
          </div>
          <div className={`bg-white rounded-xl border p-4 text-center ${stats.needsSourceUrl > 0 ? 'border-orange-300' : 'border-gray-200'}`}>
            <Link2Off className={`w-5 h-5 mx-auto mb-1 ${stats.needsSourceUrl > 0 ? 'text-orange-500' : 'text-gray-300'}`} />
            <div className={`text-2xl font-bold ${stats.needsSourceUrl > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
              {stats.needsSourceUrl}
            </div>
            <div className="text-xs text-gray-500">원본 URL 필요</div>
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
            <div className="text-xs text-gray-500">오류</div>
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
          title="새로고침"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 상품 테이블 — 원본상태 · 쿠팡상태 · 원본가 · 판매가 · 마지막확인 */}
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
            <p className="text-xs mt-1">아래 버튼을 누르면 쿠팡 판매중 상품을 가져와 점검을 시작합니다</p>
            <button
              onClick={handleStartScan}
              disabled={starting}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
              {starting ? (startMsg || '시작 중...') : '전체 점검 시작'}
            </button>
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
                <th className="text-center px-3 py-3 text-xs font-medium text-gray-500">마지막 확인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monitors.map((m) => {
                const product = m.sh_products;
                const isOpen = expandedId === m.id;
                return (
                  <Fragment key={m.id}>
                  <tr className={`hover:bg-gray-50 transition ${isOpen ? 'bg-gray-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setExpandedId(isOpen ? null : m.id)}
                          className="mt-0.5 text-gray-400 hover:text-gray-700 shrink-0"
                          title="가격·품절 변동 이력 보기"
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setExpandedId(isOpen ? null : m.id)}
                          className="text-sm font-medium text-gray-900 truncate max-w-[300px] text-left hover:text-[#E31837] block"
                        >
                          {product?.display_name || product?.product_name || '상품명 없음'}
                        </button>
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
                              href={`https://wing.coupang.com/tenants/manage-product/products/list?searchKeyword=${m.coupang_product_id}&searchType=SELLER_PRODUCT_ID`}
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
                        !m.source_url
                          ? 'no_source_url'
                          : !m.last_checked_at
                            ? 'unknown'
                            : m.source_status as 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error'
                      } />
                      {m.source_url && m.source_status === 'error' && (
                        <div className="text-[9px] text-orange-500 mt-0.5">
                          {m.consecutive_errors === 0
                            ? '도우미 꺼짐(조회 실패)'
                            : m.consecutive_errors >= 5
                              ? '네이버 속도제한'
                              : `연속 ${m.consecutive_errors}회 실패`}
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
                          {!m.source_url
                            ? 'URL 필요'
                            : m.source_status === 'error'
                              ? '조회 실패'
                              : !m.last_checked_at
                                ? '미조회'
                                : '-'}
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
                      <div className="mt-1">
                        {(() => {
                          const eff = effectivePriceFollowRule(m.price_follow_rule);
                          const isDefault = !m.price_follow_rule; // 명시 설정 없이 기본 자동추종
                          return (
                            <button
                              onClick={() => setRuleTarget(m)}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border transition ${
                                eff.enabled
                                  ? eff.mode === 'auto'
                                    ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                                    : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
                                  : 'text-gray-400 bg-gray-50 border-gray-200 hover:bg-gray-100'
                              }`}
                              title={
                                !eff.enabled
                                  ? '가격 추종 꺼짐 — 클릭해 설정'
                                  : isDefault
                                    ? '기본값: 원본가 변동 시 마진 유지하며 자동 추종 (클릭해 변경)'
                                    : '원본가 변동 시 판매가 자동 추종 설정'
                              }
                            >
                              <Zap className="w-2.5 h-2.5" />
                              {!eff.enabled
                                ? '추종 꺼짐'
                                : eff.mode === 'auto'
                                  ? (isDefault ? '자동추종·기본' : '자동추종')
                                  : '승인후추종'}
                            </button>
                          );
                        })()}
                      </div>
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
                  </tr>
                  {isOpen && (
                    <tr key={`${m.id}-history`}>
                      <td colSpan={6} className="p-0 border-t border-gray-100">
                        <MonitorHistoryPanel monitorId={m.id} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 가격 자동추종 — 단일 상품 설정 */}
      {ruleTarget && (
        <PriceRuleModal
          open={!!ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSaved={() => { setRuleTarget(null); fetchData(); }}
          monitor={{
            id: ruleTarget.id,
            source_price_last: ruleTarget.source_price_last,
            our_price_last: ruleTarget.our_price_last,
            price_follow_rule: ruleTarget.price_follow_rule,
            productName: ruleTarget.sh_products?.display_name || ruleTarget.sh_products?.product_name || '상품',
          }}
        />
      )}

      {/* 가격 자동추종 — 전체 일괄 설정 */}
      {bulkRuleOpen && (
        <PriceRuleModal
          open={bulkRuleOpen}
          onClose={() => setBulkRuleOpen(false)}
          onSaved={() => { setBulkRuleOpen(false); fetchData(); }}
          monitorIds={monitors.map((m) => m.id)}
        />
      )}
    </div>
  );
}
