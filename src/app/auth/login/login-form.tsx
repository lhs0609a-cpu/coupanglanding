'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // 429(레이트리밋) 쿨다운 — 남은 초. 0보다 크면 로그인 버튼 잠금 + 카운트다운.
  // 사용자가 계속 눌러 한도를 스스로 늘리는 걸 막는다(루트 원인은 IP당 sign-in 한도).
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const type = searchParams.get('type');
  const [isSignup, setIsSignup] = useState(type === 'signup');

  // 쿨다운 1초마다 감소
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return; // 쿨다운 중엔 시도 자체를 막아 한도 악화 방지
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let supabase;
      try {
        supabase = createClient();
      } catch (err) {
        if (err instanceof Error && err.message === 'SUPABASE_NOT_CONFIGURED') {
          setError('서버 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.');
        } else {
          setError('연결 오류가 발생했습니다.');
        }
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message === 'Invalid login credentials') {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (authError.status === 429) {
          setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
          setCooldown(60); // 60초 잠금 — 연타로 IP 한도가 더 늘어나는 것 방지
        } else if (!authError.message || authError.message === '0' || authError.message === 'Failed to fetch') {
          setError('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
        } else if (authError.message === 'Email not confirmed') {
          setError('이메일 인증이 완료되지 않았습니다. 이메일을 확인해주세요.');
        } else {
          setError(`로그인 오류: ${authError.message}`);
        }
        return;
      }

      if (!data?.user) {
        setError('로그인 응답이 올바르지 않습니다. 다시 시도해주세요.');
        return;
      }

      // 역할 및 승인 상태 체크
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('프로필 조회 오류:', profileError);
        setError(`프로필 조회 실패: ${profileError.message}`);
        return;
      }

      // 미승인 유저 차단 (admin/partner 제외, 공급사는 로그인 허용 후 센터에서 심사상태로 게이트)
      if (profile && profile.role !== 'admin' && profile.role !== 'partner' && profile.role !== 'supplier' && !profile.is_active) {
        await supabase.auth.signOut();
        setError('관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.');
        return;
      }

      if (redirect) {
        router.push(redirect);
      } else if (profile?.role === 'admin' || profile?.role === 'partner') {
        router.push('/admin/dashboard');
      } else if (profile?.role === 'supplier') {
        router.push('/supplier');
      } else {
        router.push('/my/dashboard');
      }

      router.refresh();
    } catch (err) {
      console.error('로그인 처리 중 오류:', err);
      setError(err instanceof Error ? `오류: ${err.message}` : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone && !/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      setError('올바른 휴대폰 번호를 입력해주세요.');
      setLoading(false);
      return;
    }

    // 35s 타임아웃 가드 — 서버 hang 시 사용자가 무한 대기하지 않도록
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 35_000);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone: cleanPhone || null,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '회원가입 중 오류가 발생했습니다.');
        setLoading(false);
        return;
      }

      setSuccess('회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
      setLoading(false);
      setIsSignup(false);
    } catch (err) {
      clearTimeout(tid);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('서버 응답이 35초를 초과했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.');
      } else {
        setError(err instanceof Error ? err.message : '서버 오류가 발생했습니다.');
      }
      setLoading(false);
    }
  };

  if (isSignup) {
    return (
      <form onSubmit={handleSignup} className="space-y-5">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            이름
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
            placeholder="홍길동"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            연락처
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
            placeholder="010-1234-5678"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
              placeholder="6자 이상 입력"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm" role="alert">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '가입 처리 중...' : '파트너 회원가입'}
        </button>

        <p className="text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <button type="button" onClick={() => setIsSignup(false)} className="text-[#E31837] font-semibold hover:underline">
            로그인
          </button>
        </p>

        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-center text-sm text-emerald-800">
          제조사·도매·공급사이신가요?{' '}
          <Link href="/supplier/signup" className="font-semibold underline hover:text-emerald-900">
            공급사 회원가입
          </Link>
          <span className="block text-xs text-emerald-700/80 mt-0.5">사업자등록증·증빙서류 제출 후 관리자 승인</span>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          이메일
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
          placeholder="email@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
            placeholder="비밀번호 입력"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || cooldown > 0}
        className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cooldown > 0 ? `${cooldown}초 후 다시 시도` : loading ? '로그인 중...' : '로그인'}
      </button>

      <div className="flex justify-center gap-3 text-sm text-gray-500">
        <Link href="/auth/find-id" className="hover:text-[#E31837] hover:underline">
          아이디 찾기
        </Link>
        <span>|</span>
        <Link href="/auth/reset-password" className="hover:text-[#E31837] hover:underline">
          비밀번호 찾기
        </Link>
      </div>

      <p className="text-center text-sm text-gray-500">
        파트너 계정이 없으신가요?{' '}
        <button type="button" onClick={() => setIsSignup(true)} className="text-[#E31837] font-semibold hover:underline">
          파트너 회원가입
        </button>
      </p>

      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-center text-sm text-emerald-800">
        제조사·도매·공급사이신가요?{' '}
        <Link href="/supplier/signup" className="font-semibold underline hover:text-emerald-900">
          공급사 회원가입
        </Link>
        <span className="block text-xs text-emerald-700/80 mt-0.5">사업자등록증·증빙서류 제출 후 관리자 승인</span>
      </div>
    </form>
  );
}
