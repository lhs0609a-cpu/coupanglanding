'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';

export default function PaymentCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const isError = searchParams.get('error');
    const authKey = searchParams.get('authKey');
    const errorCode = searchParams.get('code');
    const errorMessage = searchParams.get('message');

    if (isError || errorCode) {
      setStatus('error');
      setMessage(errorMessage || '카드 등록이 취소되었습니다.');
      return;
    }

    if (!authKey) {
      setStatus('error');
      setMessage('인증 정보가 없습니다.');
      return;
    }

    // 빌링키 발급 요청
    issueBillingKey(authKey);
  }, [searchParams]);

  const issueBillingKey = async (authKey: string) => {
    try {
      const res = await fetch('/api/payments/billing-key/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || '빌링키 발급에 실패했습니다.');
        return;
      }

      setStatus('success');
      setMessage('카드가 성공적으로 등록되었습니다.');

      // 3초 후 설정 페이지로 리다이렉트
      setTimeout(() => {
        router.push('/my/settings');
      }, 3000);
    } catch {
      setStatus('error');
      setMessage('서버 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <Card>
        <div className="text-center py-8">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">카드 등록 처리 중...</h2>
              <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">카드 등록 완료!</h2>
              <p className="text-sm text-gray-500">{message}</p>
              <p className="text-xs text-gray-400 mt-3">잠시 후 설정 페이지로 이동합니다...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">카드 등록 실패</h2>
              <p className="text-sm text-red-600 mb-4">{message}</p>
              <button
                type="button"
                onClick={() => router.push('/my/settings')}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                설정으로 돌아가기
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
