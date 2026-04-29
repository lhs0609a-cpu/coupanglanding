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

    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY;
      if (!clientKey) {
        setError('결제 서비스 설정이 필요합니다.');
        return;
      }

      // customerKey 는 서버 시크릿(TOSS_CUSTOMER_KEY_SECRET)으로 HMAC 되므로 서버에서만 계산 가능.
      // 이전엔 generateCustomerKey() 를 클라이언트에서 직접 호출 → process.env.TOSS_PAYMENTS_SECRET_KEY 가
      // 브라우저에서 undefined 라 항상 "결제 설정 누락" 에러 발생.
      const ckRes = await fetch('/api/payments/customer-key', { credentials: 'include' });
      if (!ckRes.ok) {
        const data = await ckRes.json().catch(() => ({}));
        setError(data.error || 'customerKey 발급 실패');
        return;
      }
      const { customerKey } = (await ckRes.json()) as { customerKey: string };
      if (!customerKey) {
        setError('customerKey 발급 실패');
        return;
      }

      const TossPayments = await loadTossPaymentsSDK();
      const toss = TossPayments(clientKey);

      const origin = window.location.origin;

      await toss.requestBillingAuth('카드', {
        customerKey,
        successUrl: `${origin}/my/settings/payment-callback`,
        failUrl: `${origin}/my/settings/payment-callback?error=true`,
      });
    } catch (err) {
      console.error('카드 등록 에러:', err);
      setError(err instanceof Error ? err.message : '카드 등록에 실패했습니다.');
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
