import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

export const maxDuration = 30;

/**
 * 디버그: 로그인 사용자의 쿠팡 키로 카테고리 메타의 "인증(certifications)" 원문 shape 확인.
 *   전기제품 KC 인증 grounding 파서 검증용.
 *   GET /api/megaload/debug-cert-meta?categoryCode=<쿠팡 displayCategoryCode>
 *   예: 안마의자 카테고리 코드로 호출 → certifications/requiredDocuments 실제 구조 확인.
 */
export async function GET(req: NextRequest) {
  const categoryCode = req.nextUrl.searchParams.get('categoryCode');
  if (!categoryCode) {
    return NextResponse.json({
      usage: 'GET /api/megaload/debug-cert-meta?categoryCode=<쿠팡 displayCategoryCode>',
      hint: '올인원 검수화면의 전기제품(안마의자 등) 카테고리 코드를 넣으세요.',
    });
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const megaloadUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const adapter = await getAuthenticatedAdapter(serviceClient, megaloadUserId, 'coupang') as CoupangAdapter;

    const raw = await adapter.getRawCategoryMeta(categoryCode);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ((raw as any)?.data ?? raw) as Record<string, unknown> | null;
    const parsed = await adapter.getCategoryCertifications(categoryCode);

    return NextResponse.json({
      categoryCode,
      // 응답 최상위 키 — 어떤 키에 인증이 있는지 한눈에
      topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : null,
      // 인증/필수서류 원문(파서가 이 shape 를 정확히 읽는지 대조)
      certificationsRaw: data?.certifications ?? data?.certificationList ?? data?.requiredCertifications ?? null,
      requiredDocumentsRaw: data?.requiredDocuments ?? data?.requiredDocumentNames ?? null,
      // 우리 어댑터가 파싱한 결과(요구 인증타입)
      parsedByOurAdapter: parsed.items,
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
