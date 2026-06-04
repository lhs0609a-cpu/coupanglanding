'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KeyRound, CheckCircle, Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      // 새 비밀번호 설정 + must_change_password 플래그 해제(동시)
      const { error: updErr } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (updErr) throw new Error(updErr.message);

      setDone(true);
      // 세션(JWT) 갱신 반영 후 대시보드로 이동
      router.refresh();
      setTimeout(() => router.replace('/my/dashboard'), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg || '비밀번호 변경 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 bg-[#E31837]/10 rounded-full flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-[#E31837]" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">새 비밀번호 설정</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          관리자가 비밀번호를 초기화했습니다. 계속 이용하시려면 새 비밀번호를 설정해 주세요.
        </p>

        {done ? (
          <div className="flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="w-5 h-5" />
            비밀번호가 변경되었습니다. 잠시 후 대시보드로 이동합니다…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="8자 이상"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                placeholder="다시 입력"
                autoComplete="new-password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving || !password || !confirm}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              {saving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
