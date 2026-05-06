'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { loadTossPaymentsSDK } from '@/lib/payments/toss-client';

interface CardRegistrationProps {
  /** 사용 안 함 (하위호환) — customerKey 는 서버에서 발급하므로 클라이언트 ptUserId 불필요 */
  ptUserId?: string;
}

export default function CardRegistration(_props: CardRegistrationProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = useCallback(async () => {
    setLoading(true);
    setError('');
    const t0 = Date.now();
    const ms = () => Date.now() - t0;

    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY;
      console.log(`[card-reg] start ${ms()}ms — clientKey=${clientKey ? 'set' : 'MISSING'}`);
      if (!clientKey) {
        setError('결제 서비스 설정이 필요합니다 (NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY 미설정).');
        return;
      }

      // Step 1: customerKey 발급 (15s timeout — 서버 hang 시 명확한 에러)
      const ckRes = await fetch('/api/payments/customer-key', {
        credentials: 'include',
        signal: AbortSignal.timeout(15_000),
      });
      console.log(`[card-reg] customer-key ${ms()}ms — status=${ckRes.status}`);
      if (!ckRes.ok) {
        const data = await ckRes.json().catch(() => ({}));
        setError(data.error || `customerKey 발급 실패 (HTTP ${ckRes.status})`);
        return;
      }
      const { customerKey } = (await ckRes.json()) as { customerKey: string };
      if (!customerKey) {
        setError('customerKey 발급 실패 (빈 응답)');
        return;
      }
      console.log(`[card-reg] customerKey 발급 완료 ${ms()}ms`);

      // Step 2: 토스 SDK 로드 (10s timeout — script 로드 hang 차단)
      const sdkPromise = loadTossPaymentsSDK();
      const sdkTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('토스 SDK 로드 10초 초과 — 네트워크 또는 CSP 문제')), 10_000)
      );
      const TossPayments = await Promise.race([sdkPromise, sdkTimeout]);
      console.log(`[card-reg] SDK 로드 완료 ${ms()}ms`);

      const toss = TossPayments(clientKey);
      const origin = window.location.origin;

      console.log(`[card-reg] requestBillingAuth 호출 직전 ${ms()}ms — 곧 토스 페이지로 redirect 됩니다`);

      // Step 3: 토스 결제창 — 정상이면 페이지가 토스로 redirect 되어 finally 가 안 돌아감.
      // 만약 5초 안에 redirect 가 안 일어나면 popup blocked 또는 SDK 내부 에러.
      const authPromise = toss.requestBillingAuth('카드', {
        customerKey,
        successUrl: `${origin}/my/settings/payment-callback`,
        failUrl: `${origin}/my/settings/payment-callback?error=true`,
      });
      const redirectGuard = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          '토스 결제창이 열리지 않았습니다. 브라우저의 팝업 차단 / 광고 차단기 / CSP 설정을 확인해주세요. (5초 경과)'
        )), 5_000)
      );
      await Promise.race([authPromise, redirectGuard]);
    } catch (err) {
      console.error(`[card-reg] error at ${ms()}ms:`, err);
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      setError(
        isTimeout
          ? '서버 응답 지연 (15초) — Vercel/Supabase 상태를 확인해주세요.'
          : err instanceof Error ? err.message : '카드 등록에 실패했습니다.'
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
        className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <CreditCard className="w-5 h-5" />
        )}
        {loading ? '카드 등록 중...' : '결제 카드 등록하기'}
      </button>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <p className="text-xs text-gray-500">
        토스페이먼츠 보안 결제창에서 카드를 등록합니다. 카드 정보는 토스페이먼츠에서 안전하게 관리됩니다.
      </p>
    </div>
  );
}
