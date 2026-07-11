'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('카드를 등록하는 중입니다...');

  useEffect(() => {
    if (params.get('error')) {
      setState('error');
      setMessage('카드 등록이 취소되었거나 실패했습니다.');
      return;
    }
    const authKey = params.get('authKey');
    if (!authKey) {
      setState('error');
      setMessage('인증 정보(authKey)가 없습니다. 다시 시도해주세요.');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/supplier/billing-key/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '카드 등록 실패');
        setState('success');
        setMessage(`${data.card?.company || ''} ${data.card?.number || ''} 카드가 등록되었습니다. 이제 상품을 등록할 수 있어요.`);
        setTimeout(() => router.replace('/supplier'), 1800);
      } catch (err) {
        setState('error');
        setMessage(err instanceof Error ? err.message : '카드 등록 실패');
      }
    })();
  }, [params, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {state === 'processing' && <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />}
        {state === 'success' && <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />}
        {state === 'error' && <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />}
        <p className="text-gray-800 font-medium">{message}</p>
        {state === 'error' && (
          <button onClick={() => router.replace('/supplier')} className="mt-6 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
            공급사 홈으로
          </button>
        )}
      </div>
    </div>
  );
}

export default function SupplierPaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>}>
      <CallbackInner />
    </Suspense>
  );
}
