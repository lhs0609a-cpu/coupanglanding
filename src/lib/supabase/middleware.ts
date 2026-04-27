import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 결제 락에서 항상 예외되는 경로 (mutation 이어도 허용).
 * 사용자가 결제를 하려면 이 경로들은 닫히면 안 되며, 로그아웃/세션/알림 조회 같은
 * 운영상 필수 기능도 포함.
 */
const LOCK_ALLOWLIST_PREFIXES: string[] = [
  '/api/payments/',           // 카드 등록/결제 — 락 해제 수단
  '/api/auth/',               // 로그인/로그아웃
  '/api/notifications/',      // 알림 읽음 처리
  '/api/profile/',            // 프로필 기본 정보
  '/api/cron/',               // 크론 엔드포인트 (Bearer 자체 검증)
  '/api/admin/',              // 관리자 (별도 role 체크)
  '/api/webhook/',            // 외부 웹훅 (해당 경로에서 인증)
  '/api/tax-invoices',        // 내부 호출
];

/**
 * 세션 없이 호출되는 공개 API — 회원가입/아이디 찾기/비밀번호 재설정 등.
 * 이 경로들은 미들웨어의 `세션 없으면 401` 차단에서 제외해야 한다.
 * (해당 라우트에서 입력값 검증 + service-role 로 자체 처리)
 */
const PUBLIC_API_PREFIXES: string[] = [
  '/api/auth/signup',
  '/api/auth/find-id',
  '/api/auth/reset-password',
  '/api/webhook/',           // 외부에서 호출, 자체 서명 검증
];

/**
 * L1(부분 쓰기 차단) 에서도 차단해야 할 "메이저 쓰기" 경로.
 * 신규 상품 등록/일괄 처리/외부 동기화 등 비용이 큰 작업.
 */
const L1_BLOCK_PATTERNS: RegExp[] = [
  /^\/api\/megaload\/bulk-register\//,
  /^\/api\/megaload\/sourcing\//,
  /^\/api\/megaload\/products\/.+\/register/,
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Record<string, unknown>)
          );
        },
      },
    }
  );

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/auth')) {
    return supabaseResponse;
  }

  const isApiRoute = pathname.startsWith('/api/');
  // 공개 API (회원가입/아이디 찾기/비밀번호 재설정/웹훅) 는 세션 검사 자체를 스킵
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublicApi) {
    return supabaseResponse;
  }

  if (sessionError || !user) {
    const isProtected =
      pathname.startsWith('/my') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/megaload') ||
      isApiRoute;

    if (!isProtected) {
      return supabaseResponse;
    }

    if (isApiRoute) {
      return jsonResponse(401, { error: '인증 필요' });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(url);

    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });

    return redirectResponse;
  }

  // ─── 결제 락 가드 ─────────────────────────────────────────────
  //
  // 범위: `/api/*` 의 모든 mutation (POST/PUT/PATCH/DELETE) + 일부 `/megaload/*` 쓰기.
  //       단 LOCK_ALLOWLIST_PREFIXES 는 제외 (결제/인증/관리자 경로).
  //
  // 레벨별 정책:
  //   L1 (payment_lock_level=1) — L1_BLOCK_PATTERNS 에 매칭되는 "메이저 쓰기" 만 차단
  //   L2 (payment_lock_level=2) — 모든 mutation 차단
  //   L3 (payment_lock_level=3) — 페이지 자체는 /my/settings 로 리다이렉트 (별도 처리), API 도 전부 차단
  //
  if (isMutationMethod(request.method) && isLockTargetPath(pathname)) {
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('payment_lock_level, payment_lock_exempt_until, admin_override_level, is_test_account')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (ptUser) {
      // 테스트 계정 — 락 계산 자체 skip, 모든 기능 허용
      if (ptUser.is_test_account) {
        return supabaseResponse;
      }
      const today = new Date().toISOString().slice(0, 10);
      const exemptActive =
        ptUser.payment_lock_exempt_until && ptUser.payment_lock_exempt_until > today;
      const baseLevel = ptUser.admin_override_level ?? ptUser.payment_lock_level ?? 0;
      const level = exemptActive ? 0 : baseLevel;

      const isMajorWrite = L1_BLOCK_PATTERNS.some((re) => re.test(pathname));
      const blocked =
        level >= 2 || (level >= 1 && isMajorWrite);

      if (blocked) {
        return jsonResponse(423, {
          error: '결제 미이행으로 서비스가 일시 제한되었습니다',
          code: 'PAYMENT_LOCKED',
          lockLevel: level,
          link: '/my/settings',
        });
      }
    }
  }

  return supabaseResponse;
}

function isMutationMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isLockTargetPath(pathname: string): boolean {
  // 비 /api 경로는 락 체크 안 함 (페이지 레벨은 layout/guard 에서 처리)
  if (!pathname.startsWith('/api/')) return false;
  // allowlist 먼저 체크
  if (LOCK_ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return true;
}

function jsonResponse(status: number, body: Record<string, unknown>): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
