'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { loadTossPaymentsSDK } from '@/lib/payments/toss-client';

/**
 * 공급사 카드(자동결제) 등록 — 토스 SDK requestBillingAuth.
 * 셀러 CardRegistration 과 동일 흐름이나 공급사 엔드포인트/콜백으로 향한다.
 *   customerKey: /api/supplier/customer-key
 *   콜백:        /supplier/payment-callback → /api/supplier/billing-key/issue
 */
export default function SupplierCardRegistration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY;
      if (!clientKey) {
        setError('결제 서비스 설정이 필요합니다 (NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY 미설정).');
        return;
      }

      const ckRes = await fetch('/api/supplier/customer-key', {
        credentials: 'include',
        signal: AbortSignal.timeout(15_000),
      });
      if (!ckRes.ok) {
        const data = await ckRes.json().catch(() => ({}));
        setError(data.error || `customerKey 발급 실패 (HTTP ${ckRes.status})`);
        return;
      }
      const { customerKey } = (await ckRes.json()) as { customerKey: string };
      if (!customerKey) { setError('customerKey 발급 실패 (빈 응답)'); return; }

      const sdkPromise = loadTossPaymentsSDK();
      const sdkTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('토스 SDK 로드 10초 초과 — 네트워크 또는 CSP 문제')), 10_000),
      );
      const TossPayments = await Promise.race([sdkPromise, sdkTimeout]);

      const toss = TossPayments(clientKey);
      const origin = window.location.origin;

      const authPromise = toss.requestBillingAuth('카드', {
        customerKey,
        successUrl: `${origin}/supplier/payment-callback`,
        failUrl: `${origin}/supplier/payment-callback?error=true`,
      });
      const redirectGuard = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          '토스 결제창이 열리지 않았습니다. 팝업 차단 / 광고 차단기 / CSP 설정을 확인해주세요. (5초 경과)',
        )), 5_000),
      );
      await Promise.race([authPromise, redirectGuard]);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      setError(
        isTimeout
          ? '서버 응답 지연 (15초) — 잠시 후 다시 시도해주세요.'
          : err instanceof Error ? err.message : '카드 등록에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
        {loading ? '카드 등록 중...' : '자동결제 카드 등록하기'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-500">
        토스페이먼츠 보안 결제창에서 카드를 등록합니다. 카드 정보는 토스페이먼츠에서 안전하게 관리됩니다.
      </p>
    </div>
  );
}
