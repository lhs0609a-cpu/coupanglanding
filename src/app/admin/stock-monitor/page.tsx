'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, EyeOff, Clock, HelpCircle,
} from 'lucide-react';
import Card from '@/components/ui/Card';

/**
 * 품절감시 현황판 — "지금 아무도 못 보고 있는 상품이 몇 개이고, 누구에게 말해야 하는가".
 *
 * 스마트스토어 원본은 셀러 PC 의 네이버 로그인 없이는 조회가 막힌다. 로그인이 없으면
 * 도우미가 그 건들을 조용히 건너뛰므로, 서버 로그만 봐서는 방치를 알아챌 수 없다.
 */

type SellerStatus = 'no_app' | 'logged_out' | 'session_only' | 'ok' | 'unknown';

interface Seller {
  megaloadUserId: string;
  businessName: string | null;
  email: string | null;
  fullName: string | null;
  hostname: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  heartbeatAgeMin: number;
  appAlive: boolean;
  naverLoggedIn: boolean | null;
  naverPersistent: boolean | null;
  naverCredential: boolean | null;
  naverCheckedAt: string | null;
  smartstoreMonitors: number;
  smartstoreChecked24h: number;
  smartstoreStale3d: number;
  status: SellerStatus;
  needsAttention: boolean;
}

interface Result {
  ok: boolean;
  needsMigration: boolean;
  truncated: boolean;
  scanned: number;
  summary: {
    sellers: number;
    loggedOut: number;
    sessionOnly: number;
    noApp: number;
    ok: number;
    unknown: number;
    blindSmartstore: number;
    smartstoreTotal: number;
  };
  sellers: Seller[];
  generatedAt: string;
}

const STATUS_META: Record<SellerStatus, { label: string; tone: string; hint: string }> = {
  logged_out: {
    label: '네이버 로그인 없음',
    tone: 'bg-red-100 text-red-800 border-red-200',
    hint: '도우미는 켜져 있으나 로그인이 없어 스마트스토어를 통째로 건너뛰고 있습니다.',
  },
  no_app: {
    label: '도우미 꺼짐',
    tone: 'bg-orange-100 text-orange-800 border-orange-200',
    hint: '앱이 꺼져 있어 원본 확인이 멈췄습니다. 로그인 이전의 문제입니다.',
  },
  session_only: {
    label: '세션만 (앱 끄면 풀림)',
    tone: 'bg-blue-100 text-blue-800 border-blue-200',
    hint: '지금은 되지만 “로그인 상태 유지”가 꺼져 있어 앱을 끄면 풀립니다.',
  },
  ok: {
    label: '정상',
    tone: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    hint: '로그인이 유지되고 있습니다.',
  },
  unknown: {
    label: '모름 (구버전 도우미)',
    tone: 'bg-gray-100 text-gray-600 border-gray-200',
    hint: '도우미가 네이버 상태를 보내지 않는 버전입니다. 업데이트되면 자동으로 채워집니다.',
  },
};

const fmtAge = (min: number) => {
  if (min < 0) return '기록 없음';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
};

export default function AdminStockMonitorPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/stock-monitor/naver');
      const data = await res.json();
      if (!res.ok) setError(data.error || '조회 실패');
      else setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = result
    ? (onlyAttention ? result.sellers.filter((s) => s.needsAttention) : result.sellers)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#E31837]" /> 품절감시 현황
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            스마트스토어 원본은 셀러 PC 의 네이버 로그인 없이는 조회할 수 없습니다.
            로그인이 없는 셀러의 상품은 품절이 되어도 아무도 보지 못합니다.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {result?.needsMigration && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">네이버 상태 컬럼이 아직 DB 에 없습니다</div>
            <div className="text-xs mt-1">
              <code>supabase/migration_stock_worker_naver_state.sql</code> 을 실행하기 전까지
              모든 셀러가 “모름”으로 표시됩니다(도우미 상태·감시 수는 정상입니다).
            </div>
          </div>
        </div>
      )}

      {result?.truncated && (
        <div className="flex items-start gap-2 p-3 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          감시 스캔이 상한(40,000건)에서 잘렸습니다 — 아래 집계는 실제보다 작습니다.
        </div>
      )}

      {result && (
        <>
          {/* 한 줄 결론 */}
          <Card className={result.summary.blindSmartstore > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
            <div className="flex items-start gap-3">
              {result.summary.blindSmartstore > 0
                ? <EyeOff className="w-6 h-6 text-red-600 flex-shrink-0" />
                : <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />}
              <div>
                <div className={`text-lg font-bold ${result.summary.blindSmartstore > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                  {result.summary.blindSmartstore > 0
                    ? `지금 아무도 보지 못하는 스마트스토어 상품 ${result.summary.blindSmartstore.toLocaleString()}개`
                    : '모든 스마트스토어 감시가 확인되고 있습니다'}
                </div>
                <div className={`text-sm mt-1 ${result.summary.blindSmartstore > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                  전체 스마트스토어 감시 {result.summary.smartstoreTotal.toLocaleString()}개 ·
                  셀러 {result.summary.sellers.toLocaleString()}명 ·
                  기준 시각 {new Date(result.generatedAt).toLocaleString('ko-KR')}
                </div>
              </div>
            </div>
          </Card>

          {/* 상태별 셀러 수 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(['logged_out', 'no_app', 'session_only', 'ok', 'unknown'] as SellerStatus[]).map((st) => {
              const count = st === 'logged_out' ? result.summary.loggedOut
                : st === 'no_app' ? result.summary.noApp
                  : st === 'session_only' ? result.summary.sessionOnly
                    : st === 'ok' ? result.summary.ok
                      : result.summary.unknown;
              return (
                <div key={st} className={`rounded-lg border p-3 ${STATUS_META[st].tone}`}>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs font-medium mt-0.5">{STATUS_META[st].label}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAttention}
                onChange={(e) => setOnlyAttention(e.target.checked)}
                className="rounded border-gray-300"
              />
              안내가 필요한 셀러만 보기 (못 보는 상품이 실제로 있는 경우)
            </label>
            <span className="text-xs text-gray-400">— {rows.length}명 표시</span>
          </div>

          {/* 셀러 목록 */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">셀러</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-right px-4 py-3 font-medium">스마트스토어 감시</th>
                    <th className="text-right px-4 py-3 font-medium">24시간 확인</th>
                    <th className="text-right px-4 py-3 font-medium">3일+ 방치</th>
                    <th className="text-left px-4 py-3 font-medium">도우미</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                        {loading ? '불러오는 중…' : '표시할 셀러가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {rows.map((s) => (
                    <tr key={s.megaloadUserId} className={s.needsAttention ? 'bg-red-50/40' : ''}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {s.businessName || s.fullName || '(이름 없음)'}
                        </div>
                        <div className="text-xs text-gray-500">{s.email || s.megaloadUserId.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={STATUS_META[s.status].hint}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${STATUS_META[s.status].tone}`}
                        >
                          {s.status === 'ok' ? <CheckCircle2 className="w-3 h-3" />
                            : s.status === 'unknown' ? <HelpCircle className="w-3 h-3" />
                              : s.status === 'session_only' ? <Clock className="w-3 h-3" />
                                : <AlertTriangle className="w-3 h-3" />}
                          {STATUS_META[s.status].label}
                        </span>
                        {s.naverCredential && s.status === 'logged_out' && (
                          <div className="text-[11px] text-gray-500 mt-1">계정 저장됨 — 자동 복구 시도 중</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {s.smartstoreMonitors.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {s.smartstoreChecked24h.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-right ${s.smartstoreStale3d > 0 ? 'text-red-700 font-semibold' : 'text-gray-400'}`}>
                        {s.smartstoreStale3d.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <div>{s.appAlive ? '연결됨' : fmtAge(s.heartbeatAgeMin)}</div>
                        <div className="text-gray-400">
                          {s.appVersion ? `v${s.appVersion}` : '버전 미상'}
                          {s.hostname ? ` · ${s.hostname}` : ''}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
