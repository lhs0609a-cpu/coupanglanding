'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Megaphone,
  Settings2,
  ListChecks,
  FileText,
  Save,
  AlertCircle,
  CheckCircle,
  Play,
  ToggleLeft,
  ToggleRight,
  Store,
  X,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import SetupGuide from '@/components/my/promotion/SetupGuide';
import ProgressDisplay from '@/components/my/promotion/ProgressDisplay';
import InstantCouponCard from '@/components/my/promotion/InstantCouponCard';
import DownloadCouponCard from '@/components/my/promotion/DownloadCouponCard';
import StatisticsCards from '@/components/my/promotion/StatisticsCards';
import TrackingList from '@/components/my/promotion/TrackingList';
import LogsList from '@/components/my/promotion/LogsList';
import { POLLING_INTERVAL_MS, PROMO_DESCRIPTION_BANNER } from '@/lib/data/promotion-constants';
import type {
  CouponAutoSyncConfig,
  ProductCouponTracking,
  CouponApplyLog,
  BulkApplyProgress,
  TrackingStatus,
} from '@/lib/supabase/types';
import type { CoupangContract, CoupangCoupon } from '@/lib/utils/coupang-api-client';

// ── Types ───────────────────────────────────────────────
type TabKey = 'config' | 'tracking' | 'logs';

interface Stats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}

interface AccountInfo {
  vendorId: string;
  vendorName: string;
}

// ── Page Component ──────────────────────────────────────
export default function PromotionPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('config');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Account info
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  // Config state
  const [config, setConfig] = useState<Partial<CouponAutoSyncConfig>>({
    is_enabled: false,
    contract_id: '',
    instant_coupon_enabled: false,
    instant_coupon_id: '',
    instant_coupon_name: '',
    instant_coupon_auto_create: false,
    instant_coupon_title_template: '즉시할인 {date}',
    instant_coupon_duration_days: 30,
    instant_coupon_discount: 0,
    instant_coupon_discount_type: 'RATE',
    instant_coupon_max_discount: 0,
    download_coupon_enabled: false,
    download_coupon_id: '',
    download_coupon_name: '',
    download_coupon_auto_create: true,
    download_coupon_title_template: '다운로드쿠폰 {date}',
    download_coupon_duration_days: 30,
    download_coupon_policies: [],
    apply_delay_days: 0,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Apply all checkbox
  const [applyAllOnSave, setApplyAllOnSave] = useState(false);
  // 수집 범위 (일수) — 0이면 전체
  const [collectDays, setCollectDaysState] = useState(0);
  const collectDaysRef = useRef(0);
  const setCollectDays = (v: number) => { collectDaysRef.current = v; setCollectDaysState(v); };

  // Coupang data
  const [contracts, setContracts] = useState<CoupangContract[]>([]);
  const [contractsRetired, setContractsRetired] = useState(false);
  const [contractsAutoDetected, setContractsAutoDetected] = useState(false);
  const [instantCoupons, setInstantCoupons] = useState<CoupangCoupon[]>([]);
  const [downloadCoupons, setDownloadCoupons] = useState<CoupangCoupon[]>([]);
  const [copyingPolicies, setCopyingPolicies] = useState(false);

  // Progress
  const [progress, setProgress] = useState<BulkApplyProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [applyingNewOnly, setApplyingNewOnly] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<import('@/components/my/promotion/ProgressDisplay').VerifyResult | null>(null);
  const pollingRef = useRef<NodeJS.Timeout>(null);
  const collectNextTokenRef = useRef<string>('');

  // Tracking tab
  const [trackingItems, setTrackingItems] = useState<ProductCouponTracking[]>([]);
  const [trackingTotal, setTrackingTotal] = useState(0);
  const [trackingFilter, setTrackingFilter] = useState<TrackingStatus | 'all'>('all');
  const [trackingPage, setTrackingPage] = useState(0);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Logs tab
  const [logItems, setLogItems] = useState<CouponApplyLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  // Stats (always loaded)
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  const PAGE_SIZE = 30;

  // ── Fetch Functions ──────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/promotion/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig((prev) => ({ ...prev, ...data.config }));
        }
        if (data.account) {
          setAccountInfo(data.account);
        }
      }
    } catch { /* ignore */ } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch('/api/promotion/contracts');
      if (res.ok) {
        const data = await res.json();
        setContracts(data.data || []);
        if (data.retired) setContractsRetired(true);
        if (data.autoDetected) setContractsAutoDetected(true);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCoupangData = useCallback(async () => {
    try {
      const [contractsRes, instantRes, downloadRes] = await Promise.all([
        fetch('/api/promotion/contracts').then((r) => r.ok ? r.json() : { data: [] }),
        fetch('/api/promotion/coupons/instant').then((r) => r.ok ? r.json() : { data: [] }),
        fetch('/api/promotion/coupons/download').then((r) => r.ok ? r.json() : { data: [] }),
      ]);
      setContracts(contractsRes.data || []);
      if (contractsRes.retired) setContractsRetired(true);
      if (contractsRes.autoDetected) setContractsAutoDetected(true);
      setInstantCoupons(instantRes.data || []);
      setDownloadCoupons(downloadRes.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/promotion/progress');
      if (res.ok) {
        const data = await res.json();
        setProgress(data.progress || null);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/promotion/statistics');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchTracking = useCallback(async () => {
    setTrackingLoading(true);
    try {
      const statusParam = trackingFilter !== 'all' ? `&status=${trackingFilter}` : '';
      const res = await fetch(`/api/promotion/tracking?limit=${PAGE_SIZE}&offset=${trackingPage * PAGE_SIZE}${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingItems(data.data || []);
        setTrackingTotal(data.total || 0);
      }
    } catch { /* ignore */ } finally {
      setTrackingLoading(false);
    }
  }, [trackingFilter, trackingPage]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/promotion/logs?limit=${PAGE_SIZE}&offset=${logsPage * PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setLogItems(data.data || []);
        setLogsTotal(data.total || 0);
      }
    } catch { /* ignore */ } finally {
      setLogsLoading(false);
    }
  }, [logsPage]);

  // ── Initial load ─────────────────────────────────────
  useEffect(() => {
    fetchConfig();
    fetchCoupangData();
    fetchProgress();
    fetchStats();
  }, [fetchConfig, fetchCoupangData, fetchProgress, fetchStats]);

  // Tab-specific loading
  useEffect(() => {
    if (activeTab === 'tracking') {
      fetchTracking();
      fetchStats();
    } else if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, fetchTracking, fetchLogs, fetchStats]);

  // Polling for active progress (setTimeout으로 순차 실행 — 동시 호출 방지)
  const progressStatus = progress?.status;
  const errorRetryRef = useRef(0);
  useEffect(() => {
    if (progressStatus === 'collecting' || progressStatus === 'applying') {
      let active = true;
      errorRetryRef.current = 0;

      const poll = async () => {
        if (!active) return;
        // fetchProgress가 상태를 업데이트하면 useEffect가 재실행되어 폴링 중단
        const freshProgress = await fetch('/api/promotion/progress').then(r => r.json()).catch(() => null);
        const currentStatus = freshProgress?.progress?.status;
        if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'failed') {
          await fetchProgress(); // UI 업데이트
          return;
        }
        try {
          if (progressStatus === 'collecting') {
            const res = await fetch('/api/promotion/collect-products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nextToken: collectNextTokenRef.current, collectDays: collectDaysRef.current }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              collectNextTokenRef.current = data.nextToken || '';
              setError(null);
              errorRetryRef.current = 0;
            } else {
              errorRetryRef.current++;
              setError(`상품 수집 실패: ${data.error || `HTTP ${res.status}`}`);
              // 연속 5회 실패 시 폴링 중단
              if (errorRetryRef.current >= 5) {
                setError('상품 수집이 반복 실패하여 중단되었습니다. 취소 후 다시 시도해주세요.');
                return;
              }
            }
          } else {
            const res = await fetch('/api/promotion/bulk-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              errorRetryRef.current++;
              setError(`쿠폰 적용 실패: ${data.error || `HTTP ${res.status}`}`);
              if (errorRetryRef.current >= 5) {
                setError('쿠폰 적용이 반복 실패하여 중단되었습니다. 취소 후 다시 시도해주세요.');
                return;
              }
            } else {
              // 배치 내 실패가 있으면 에러 표시 (API는 200이지만 개별 아이템 실패)
              if (data.lastError) {
                setError(`쿠폰 적용 오류: ${data.lastError}`);
                // 즉시할인 실패 시 다음 폴링 지연 (쿠팡 처리량 제한 방지)
                errorRetryRef.current = Math.min(errorRetryRef.current + 1, 3);
              } else {
                setError(null);
                errorRetryRef.current = 0;
              }
            }
          }
        } catch {
          errorRetryRef.current++;
          if (errorRetryRef.current >= 5) {
            setError('네트워크 오류가 반복되어 중단되었습니다. 취소 후 다시 시도해주세요.');
            return;
          }
        }
        await fetchProgress();
        // 이전 요청이 완전히 끝난 뒤에만 다음 폴링 예약
        if (active) {
          // 에러 시 대기 시간 증가 (backoff)
          const delay = errorRetryRef.current > 0
            ? POLLING_INTERVAL_MS * (errorRetryRef.current + 1)
            : POLLING_INTERVAL_MS;
          pollingRef.current = setTimeout(poll, delay);
        }
      };

      pollingRef.current = setTimeout(poll, POLLING_INTERVAL_MS);
      return () => {
        active = false;
        if (pollingRef.current) clearTimeout(pollingRef.current);
      };
    }
    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, [progressStatus, fetchProgress]);

  // ── Handlers ──────────────────────────────────────────
  const handleConfigChange = (field: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleSync = async () => {
    const newEnabled = !config.is_enabled;
    handleConfigChange('is_enabled', newEnabled);
    try {
      const res = await fetch('/api/promotion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, is_enabled: newEnabled }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.config) setConfig((prev) => ({ ...prev, ...data.config }));
        setSuccess(newEnabled ? '자동연동이 활성화되었습니다.' : '자동연동이 비활성화되었습니다.');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        handleConfigChange('is_enabled', !newEnabled); // rollback
        setError(data.error || '자동연동 설정 변경에 실패했습니다.');
      }
    } catch {
      handleConfigChange('is_enabled', !newEnabled); // rollback
      setError('네트워크 오류가 발생했습니다.');
    }
  };

  const handleSaveAndApply = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/promotion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '설정 저장에 실패했습니다.');
      }
      if (data.config) {
        setConfig((prev) => ({ ...prev, ...data.config }));
      }

      // If "apply all" checkbox is checked, start product collection then apply
      if (applyAllOnSave) {
        collectNextTokenRef.current = ''; // 수집 시작 시 토큰 리셋
        const collectRes = await fetch('/api/promotion/collect-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectDays }),
        });
        if (!collectRes.ok) {
          const collectData = await collectRes.json();
          throw new Error(collectData.error || '상품 수집 시작에 실패했습니다.');
        }
        await fetchProgress();
        setSuccess('설정이 저장되었고 상품 수집 및 쿠폰 적용이 시작되었습니다.');
      } else {
        setSuccess('설정이 저장되었습니다.');
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch('/api/promotion/progress', { method: 'DELETE' });
      await fetchProgress();
    } catch { /* ignore */ } finally {
      setCancelling(false);
    }
  };

  const handleRestart = async (days?: number) => {
    setRestarting(true);
    const daysToUse = days ?? collectDays;
    setCollectDays(daysToUse);
    collectNextTokenRef.current = '';
    try {
      await fetch('/api/promotion/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectDays: daysToUse }),
      });
      await fetchProgress();
    } catch { /* ignore */ } finally {
      setRestarting(false);
    }
  };

  const handleApplyNewOnly = async (days?: number) => {
    setApplyingNewOnly(true);
    setError(null);
    const daysToUse = days ?? collectDays;
    setCollectDays(daysToUse);
    collectNextTokenRef.current = '';
    try {
      // 기존 데이터 삭제 + 새로 수집 시작 (restart와 동일하지만 날짜 필터 적용)
      await fetch('/api/promotion/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectDays: daysToUse }),
      });
      await fetchProgress();
      // polling이 collecting 상태를 감지하고 collect-products 호출
    } catch (err) {
      setError(err instanceof Error ? err.message : '상품 적용 실패');
    } finally {
      setApplyingNewOnly(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    setError(null);
    try {
      const res = await fetch('/api/promotion/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressId: progress?.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setVerifyResult(data);
        if (data.verified) {
          setSuccess('쿠팡에서 모든 쿠폰이 확인되었습니다.');
          setTimeout(() => setSuccess(null), 5000);
        } else {
          setError(data.message || '일부 쿠폰이 쿠팡에서 확인되지 않았습니다.');
        }
      } else {
        setError(data.error || '검증에 실패했습니다.');
      }
    } catch {
      setError('검증 중 네트워크 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyPolicies = async (couponId: number) => {
    setCopyingPolicies(true);
    setError(null);
    try {
      const res = await fetch(`/api/promotion/coupons/download/${couponId}`);
      const data = await res.json();
      if (res.ok && data.data) {
        const policies = data.data.policies || data.data.couponPolicies || [];
        if (policies.length > 0) {
          handleConfigChange('download_coupon_policies', policies);
          setSuccess(`정책 ${policies.length}개를 복사했습니다.`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(`쿠폰 ${couponId}에 정책 데이터가 없습니다. 다른 쿠폰 ID를 시도해주세요.`);
        }
      } else {
        setError(data.error || `쿠폰 ${couponId} 조회에 실패했습니다.`);
      }
    } catch {
      setError('정책 복사 중 네트워크 오류가 발생했습니다.');
    } finally {
      setCopyingPolicies(false);
    }
  };

  const handleRefreshContracts = async () => {
    await fetchContracts();
  };

  const handleResetConfig = () => {
    fetchConfig();
    setApplyAllOnSave(false);
  };

  // ── Setup guide step count ────────────────────────────
  const completedSteps = useMemo(() => {
    let steps = 0;
    // Step 1: Account connected (has vendor ID)
    if (accountInfo?.vendorId || contracts.length > 0) steps = 1;
    // Step 2: At least one coupon type enabled
    if (config.instant_coupon_enabled || config.download_coupon_enabled) steps = 2;
    // Step 3: Coupon ID configured
    if (config.instant_coupon_id || config.download_coupon_policies?.length) steps = 3;
    // Step 4: Config saved and enabled
    if (config.is_enabled) steps = 4;
    return steps;
  }, [accountInfo, contracts, config]);

  const tabs: { key: TabKey; label: string; icon: typeof Settings2 }[] = [
    { key: 'config', label: '쿠폰 설정', icon: Settings2 },
    { key: 'tracking', label: '추적 목록', icon: ListChecks },
    { key: 'logs', label: '적용 이력', icon: FileText },
  ];

  // Current config summary
  const configSummary = useMemo(() => {
    if (!config.is_enabled) return null;
    const parts: string[] = [];
    if (config.instant_coupon_enabled) {
      parts.push(`즉시할인: ${config.instant_coupon_name || config.instant_coupon_id || '설정됨'}`);
    }
    if (config.download_coupon_enabled) {
      parts.push(`다운로드: ${config.download_coupon_title_template || '설정됨'}`);
    }
    return parts;
  }, [config]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header with Account Info */}
      <div className="flex items-center gap-3">
        <Megaphone className="w-6 h-6 text-[#E31837]" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">프로모션</h1>
          <p className="text-sm text-gray-500">쿠폰 자동 적용 및 프로모션 관리</p>
        </div>
      </div>

      {/* Account Info Header */}
      {accountInfo && accountInfo.vendorId && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
          <Store className="w-5 h-5 text-gray-500" />
          <div>
            <span className="text-sm font-medium text-gray-900">{accountInfo.vendorName}</span>
            <span className="text-xs text-gray-400 ml-2">({accountInfo.vendorId})</span>
          </div>
        </div>
      )}

      {/* Statistics Cards - Always visible */}
      <StatisticsCards stats={stats} loading={statsLoading} />

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error / Success Banners */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-0.5 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 text-green-600 text-sm">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ═══ Config Tab ═══ */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {configLoading ? (
            <Card>
              <div className="py-8 text-center text-gray-400">불러오는 중...</div>
            </Card>
          ) : (
            <>
              {/* Setup Guide */}
              <SetupGuide completedSteps={completedSteps} />

              {/* Progress Display */}
              {progress && (
                <ProgressDisplay
                  progress={progress}
                  onCancel={handleCancel}
                  onRestart={handleRestart}
                  onApplyNewOnly={handleApplyNewOnly}
                  onVerify={handleVerify}
                  cancelling={cancelling}
                  restarting={restarting}
                  applyingNewOnly={applyingNewOnly}
                  verifying={verifying}
                  verifyResult={verifyResult}
                />
              )}

              {/* Description Banner */}
              <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-xl">
                <p className="text-sm font-medium text-gray-800">{PROMO_DESCRIPTION_BANNER}</p>
              </div>

              {/* Auto Sync Toggle */}
              <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  {config.is_enabled ? (
                    <ToggleRight className="w-5 h-5 text-[#E31837]" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-900">자동연동</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    config.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {config.is_enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.is_enabled ?? false}
                    onChange={handleToggleSync}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#E31837]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E31837]" />
                </label>
              </div>

              {/* STEP 1: 쿠폰 정보 입력 */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#E31837] text-white text-xs font-bold">1</span>
                  쿠폰 정보 입력
                </h3>
                <div className="space-y-4">
                  <InstantCouponCard
                    enabled={config.instant_coupon_enabled ?? false}
                    couponId={config.instant_coupon_id || ''}
                    couponName={config.instant_coupon_name || ''}
                    existingCoupons={instantCoupons}
                    onChange={handleConfigChange}
                  />
                  <DownloadCouponCard
                    enabled={config.download_coupon_enabled ?? false}
                    contractId={config.contract_id || ''}
                    titleTemplate={config.download_coupon_title_template || ''}
                    durationDays={config.download_coupon_duration_days ?? 30}
                    policies={(config.download_coupon_policies as Record<string, unknown>[]) ?? []}
                    contracts={contracts}
                    contractsRetired={contractsRetired}
                    contractsAutoDetected={contractsAutoDetected}
                    onChange={handleConfigChange}
                    onCopyPolicies={handleCopyPolicies}
                    onRefreshContracts={handleRefreshContracts}
                    copyingPolicies={copyingPolicies}
                  />
                </div>
              </Card>

              {/* STEP 2: 적용 옵션 */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#E31837] text-white text-xs font-bold">2</span>
                  적용 옵션
                </h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyAllOnSave}
                    onChange={(e) => setApplyAllOnSave(e.target.checked)}
                    className="w-4 h-4 text-[#E31837] border-gray-300 rounded focus:ring-[#E31837]/30"
                  />
                  <span className="text-sm text-gray-700">승인된 상품에 일괄 적용</span>
                </label>

                {/* 수집 범위 선택 */}
                {applyAllOnSave && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">수집 범위 (등록일 기준)</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '전체', value: 0 },
                        { label: '7일', value: 7 },
                        { label: '14일', value: 14 },
                        { label: '30일', value: 30 },
                        { label: '60일', value: 60 },
                        { label: '90일', value: 90 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCollectDays(opt.value)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                            collectDays === opt.value
                              ? 'bg-[#E31837] text-white border-[#E31837]'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {opt.value === 0 ? '전체 상품' : `최근 ${opt.label}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Buttons: Cancel + Save & Apply */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="px-6 py-2.5 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndApply}
                  disabled={saving || (progress?.status === 'collecting' || progress?.status === 'applying')}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
                >
                  {applyAllOnSave ? <Play className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saving ? '저장 중...' : applyAllOnSave ? '설정 저장 및 적용' : '설정 저장'}
                </button>
              </div>

              {/* Current config summary */}
              {configSummary && configSummary.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h4 className="text-xs font-medium text-gray-500 mb-2">현재 설정 요약</h4>
                  <div className="space-y-1">
                    {configSummary.map((line, i) => (
                      <p key={i} className="text-sm text-gray-700 flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        {line}
                      </p>
                    ))}
                  </div>
                  {config.last_sync_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      마지막 동기화: {new Date(config.last_sync_at).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Tracking Tab ═══ */}
      {activeTab === 'tracking' && (
        <div className="space-y-6">
          <TrackingList
            items={trackingItems}
            total={trackingTotal}
            loading={trackingLoading}
            currentFilter={trackingFilter}
            onFilterChange={setTrackingFilter}
            currentPage={trackingPage}
            onPageChange={setTrackingPage}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      {/* ═══ Logs Tab ═══ */}
      {activeTab === 'logs' && (
        <LogsList
          items={logItems}
          total={logsTotal}
          loading={logsLoading}
          currentPage={logsPage}
          onPageChange={setLogsPage}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}
