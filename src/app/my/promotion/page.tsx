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
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import SetupGuide from '@/components/my/promotion/SetupGuide';
import ProgressDisplay from '@/components/my/promotion/ProgressDisplay';
import InstantCouponCard from '@/components/my/promotion/InstantCouponCard';
import DownloadCouponCard from '@/components/my/promotion/DownloadCouponCard';
import StatisticsCards from '@/components/my/promotion/StatisticsCards';
import TrackingList from '@/components/my/promotion/TrackingList';
import LogsList from '@/components/my/promotion/LogsList';
import { POLLING_INTERVAL_MS } from '@/lib/data/promotion-constants';
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

// ── Page Component ──────────────────────────────────────
export default function PromotionPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('config');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    download_coupon_auto_create: false,
    download_coupon_title_template: '다운로드쿠폰 {date}',
    download_coupon_duration_days: 30,
    download_coupon_policies: [],
    apply_delay_days: 0,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Coupang data
  const [contracts, setContracts] = useState<CoupangContract[]>([]);
  const [instantCoupons, setInstantCoupons] = useState<CoupangCoupon[]>([]);
  const [downloadCoupons, setDownloadCoupons] = useState<CoupangCoupon[]>([]);
  const [copyingPolicies, setCopyingPolicies] = useState(false);

  // Progress
  const [progress, setProgress] = useState<BulkApplyProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout>();

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

  // Stats
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
      }
    } catch { /* ignore */ } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchCoupangData = useCallback(async () => {
    try {
      const [contractsRes, instantRes, downloadRes] = await Promise.all([
        fetch('/api/promotion/contracts').then((r) => r.ok ? r.json() : { data: [] }),
        fetch('/api/promotion/coupons/instant').then((r) => r.ok ? r.json() : { data: [] }),
        fetch('/api/promotion/coupons/download').then((r) => r.ok ? r.json() : { data: [] }),
      ]);
      setContracts(contractsRes.data || []);
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
  }, [fetchConfig, fetchCoupangData, fetchProgress]);

  // Tab-specific loading
  useEffect(() => {
    if (activeTab === 'tracking') {
      fetchTracking();
      fetchStats();
    } else if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, fetchTracking, fetchLogs, fetchStats]);

  // Polling for active progress
  const progressStatus = progress?.status;
  useEffect(() => {
    if (progressStatus === 'collecting' || progressStatus === 'applying') {
      pollingRef.current = setInterval(async () => {
        await fetchProgress();
        // Trigger next batch
        try {
          await fetch('/api/promotion/bulk-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        } catch { /* ignore */ }
      }, POLLING_INTERVAL_MS);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [progressStatus, fetchProgress]);

  // ── Handlers ──────────────────────────────────────────
  const handleConfigChange = (field: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
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
      // 서버 응답으로 로컬 상태 갱신
      if (data.config) {
        setConfig((prev) => ({ ...prev, ...data.config }));
      }
      setSuccess('설정이 저장되었습니다.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyAll = async () => {
    setApplyingAll(true);
    setError(null);
    try {
      const res = await fetch('/api/promotion/bulk-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startNew: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '일괄 적용 시작에 실패했습니다.');
      }
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : '일괄 적용 실패');
    } finally {
      setApplyingAll(false);
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

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch('/api/promotion/restart', { method: 'POST' });
      await fetchProgress();
    } catch { /* ignore */ } finally {
      setRestarting(false);
    }
  };

  const handleCopyPolicies = async (couponId: number) => {
    setCopyingPolicies(true);
    try {
      const res = await fetch(`/api/promotion/coupons/download/${couponId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data?.policies) {
          handleConfigChange('download_coupon_policies', data.data.policies);
        }
      }
    } catch { /* ignore */ } finally {
      setCopyingPolicies(false);
    }
  };

  // ── Setup guide step count ────────────────────────────
  const completedSteps = useMemo(() => {
    let steps = 0;
    // Step 1: API connected (check if contracts load)
    if (contracts.length > 0 || instantCoupons.length > 0) steps = 1;
    // Step 2: Contract selected
    if (config.contract_id) steps = 2;
    // Step 3: At least one coupon type configured
    if (config.instant_coupon_enabled || config.download_coupon_enabled) steps = 3;
    // Step 4: Config saved and enabled
    if (config.is_enabled) steps = 4;
    return steps;
  }, [contracts, instantCoupons, config]);

  const tabs: { key: TabKey; label: string; icon: typeof Settings2 }[] = [
    { key: 'config', label: '설정', icon: Settings2 },
    { key: 'tracking', label: '추적', icon: ListChecks },
    { key: 'logs', label: '이력', icon: FileText },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Megaphone className="w-6 h-6 text-[#E31837]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로모션</h1>
          <p className="text-sm text-gray-500">쿠폰 자동 적용 및 프로모션 관리</p>
        </div>
        {config.is_enabled && (
          <Badge label="활성화" colorClass="bg-green-100 text-green-700" />
        )}
      </div>

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
          <span>{error}</span>
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

              {/* Progress (if active) */}
              {progress && progress.status !== 'completed' && (
                <ProgressDisplay
                  progress={progress}
                  onCancel={handleCancel}
                  onRestart={handleRestart}
                  cancelling={cancelling}
                  restarting={restarting}
                />
              )}

              {/* Contract Selection */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-3">계약서 선택</h3>
                <select
                  value={config.contract_id || ''}
                  onChange={(e) => handleConfigChange('contract_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                >
                  <option value="">계약서를 선택하세요</option>
                  {contracts.map((c) => (
                    <option key={c.contractId} value={String(c.contractId)}>
                      {c.contractName} ({c.contractStatus})
                    </option>
                  ))}
                </select>
                {contracts.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    계약서를 불러올 수 없습니다. 쿠팡 API가 연동되어 있는지 확인하세요.
                  </p>
                )}
              </Card>

              {/* Instant Coupon */}
              <InstantCouponCard
                enabled={config.instant_coupon_enabled ?? false}
                autoCreate={config.instant_coupon_auto_create ?? false}
                couponId={config.instant_coupon_id || ''}
                couponName={config.instant_coupon_name || ''}
                titleTemplate={config.instant_coupon_title_template || ''}
                durationDays={config.instant_coupon_duration_days ?? 30}
                discount={config.instant_coupon_discount ?? 0}
                discountType={config.instant_coupon_discount_type ?? 'RATE'}
                maxDiscount={config.instant_coupon_max_discount ?? 0}
                contracts={contracts}
                existingCoupons={instantCoupons}
                onChange={handleConfigChange}
              />

              {/* Download Coupon */}
              <DownloadCouponCard
                enabled={config.download_coupon_enabled ?? false}
                autoCreate={config.download_coupon_auto_create ?? false}
                couponId={config.download_coupon_id || ''}
                couponName={config.download_coupon_name || ''}
                titleTemplate={config.download_coupon_title_template || ''}
                durationDays={config.download_coupon_duration_days ?? 30}
                policies={(config.download_coupon_policies as Record<string, unknown>[]) ?? []}
                existingCoupons={downloadCoupons}
                onChange={handleConfigChange}
                onCopyPolicies={handleCopyPolicies}
                copyingPolicies={copyingPolicies}
              />

              {/* Apply delay */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-3">적용 옵션</h3>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700">상품 등록 후 대기일수:</label>
                  <input
                    type="number"
                    value={config.apply_delay_days ?? 0}
                    onChange={(e) => handleConfigChange('apply_delay_days', Number(e.target.value))}
                    min={0}
                    max={30}
                    className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                  />
                  <span className="text-xs text-gray-400">일 (0 = 즉시)</span>
                </div>
              </Card>

              {/* Save + Apply buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? '저장 중...' : '설정 저장'}
                </button>

                {config.is_enabled && (
                  <button
                    type="button"
                    onClick={handleApplyAll}
                    disabled={applyingAll || (progress?.status === 'collecting' || progress?.status === 'applying')}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-[#E31837] border border-[#E31837] rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    {applyingAll ? '시작 중...' : '전체 상품 적용'}
                  </button>
                )}
              </div>

              {/* Current status */}
              {config.is_enabled && config.last_sync_at && (
                <div className="text-xs text-gray-400">
                  마지막 동기화: {new Date(config.last_sync_at).toLocaleString('ko-KR')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Tracking Tab ═══ */}
      {activeTab === 'tracking' && (
        <div className="space-y-6">
          <StatisticsCards stats={stats} loading={statsLoading} />
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
