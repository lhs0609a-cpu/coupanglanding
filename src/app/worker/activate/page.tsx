'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Status = 'loading' | 'no-session' | 'sending' | 'success' | 'error';

export default function WorkerActivatePage() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const port = params.get('port');
  const nonce = params.get('nonce');

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!port || !nonce) {
      setStatus('error');
      setMessage('잘못된 접근입니다 (port/nonce 누락). 데스크탑 워커 앱에서 다시 시도하세요.');
      return;
    }
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      setStatus('error');
      setMessage('잘못된 port 값입니다.');
      return;
    }

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setStatus('no-session');
        setMessage('메가로드 로그인이 필요합니다. 로그인 후 자동으로 돌아옵니다.');
        const here = `/worker/activate?port=${port}&nonce=${encodeURIComponent(nonce)}`;
        setTimeout(() => router.replace(`/auth/login?redirect=${encodeURIComponent(here)}`), 1200);
        return;
      }

      setStatus('sending');
      setMessage('데스크탑 앱으로 세션 전달 중...');
      try {
        const res = await fetch(`http://127.0.0.1:${portNum}/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nonce,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at ? data.session.expires_at * 1000 : undefined,
          }),
        });
        if (!res.ok) {
          throw new Error(`데스크탑 앱이 응답하지 않습니다 (HTTP ${res.status}). 워커 앱이 실행 중인지 확인하세요.`);
        }
        setStatus('success');
        setMessage('✅ 메가로드와 데스크탑 워커가 연결되었습니다. 이 창은 닫으셔도 됩니다.');
      } catch (e) {
        setStatus('error');
        const msg = e instanceof Error ? e.message : String(e);
        setMessage(`연결 실패: ${msg}\n워커 앱이 실행 중이고 같은 PC에서 열고 있는지 확인하세요.`);
      }
    })();
  }, [port, nonce, supabase, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
          {status === 'success' ? (
            <span className="text-3xl">✅</span>
          ) : status === 'error' ? (
            <span className="text-3xl">⚠️</span>
          ) : status === 'no-session' ? (
            <span className="text-3xl">🔐</span>
          ) : (
            <div className="w-7 h-7 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {status === 'success' ? '연결 완료' :
           status === 'error'   ? '연결 실패' :
           status === 'no-session' ? '로그인 필요' :
           '데스크탑 워커 연결 중'}
        </h1>
        <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{message || '잠시만 기다려주세요...'}</p>

        {status === 'success' && (
          <button
            onClick={() => window.close()}
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#E31837] text-white font-semibold text-sm hover:bg-[#c5142f] transition"
          >
            창 닫기
          </button>
        )}
        {status === 'error' && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gray-100 text-gray-800 font-semibold text-sm hover:bg-gray-200 transition"
          >
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
