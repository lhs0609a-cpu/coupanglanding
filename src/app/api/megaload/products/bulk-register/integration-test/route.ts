import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

interface TestResult {
  id: string;
  label: string;
  success: boolean;
  message: string;
  detail?: unknown;
  durationMs: number;
}

/**
 * POST — 쿠팡 API 연동 테스트 (6개 항목)
 *
 * 1. API 인증
 * 2. 출고지 조회
 * 3. 반품지 조회
 * 4. 카테고리 검색
 * 5. 고시정보 API
 * 6. 속성 API
 */
export async function POST() {
  const results: TestResult[] = [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    // Test 1: API 인증
    let coupangAdapter: CoupangAdapter;
    const t1Start = Date.now();
    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      coupangAdapter = adapter as CoupangAdapter;
      results.push({
        id: 'auth', label: 'API 인증', success: true,
        message: '연결 성공', durationMs: Date.now() - t1Start,
      });
    } catch (err) {
      results.push({
        id: 'auth', label: 'API 인증', success: false,
        message: err instanceof Error ? err.message : 'API 인증 실패',
        durationMs: Date.now() - t1Start,
      });
      return NextResponse.json({ results, overallSuccess: false });
    }

    // Test 2: 출고지 조회
    const t2Start = Date.now();
    try {
      const outbound = await coupangAdapter.getOutboundShippingPlaces();
      const usable = outbound.items.filter((p) => p.usable);
      results.push({
        id: 'outbound', label: '출고지 조회', success: usable.length > 0,
        message: usable.length > 0 ? `${usable.length}개 사용 가능` : '사용 가능한 출고지가 없습니다. 쿠팡 Wing에서 등록해주세요.',
        detail: { count: usable.length },
        durationMs: Date.now() - t2Start,
      });
    } catch (err) {
      results.push({
        id: 'outbound', label: '출고지 조회', success: false,
        message: err instanceof Error ? err.message : '출고지 조회 실패',
        durationMs: Date.now() - t2Start,
      });
    }

    // Test 3: 반품지 조회
    const t3Start = Date.now();
    try {
      const returns = await coupangAdapter.getReturnShippingCenters();
      const usable = returns.items.filter((c) => c.usable);
      results.push({
        id: 'return', label: '반품지 조회', success: usable.length > 0,
        message: usable.length > 0 ? `${usable.length}개 사용 가능` : '사용 가능한 반품지가 없습니다. 쿠팡 Wing에서 등록해주세요.',
        detail: { count: usable.length },
        durationMs: Date.now() - t3Start,
      });
    } catch (err) {
      results.push({
        id: 'return', label: '반품지 조회', success: false,
        message: err instanceof Error ? err.message : '반품지 조회 실패',
        durationMs: Date.now() - t3Start,
      });
    }

    // Test 4: 카테고리 검색
    let testCategoryId: string | null = null;
    const t4Start = Date.now();
    try {
      const catResult = await coupangAdapter.searchCategory('식품');
      const count = catResult.items?.length ?? 0;
      if (count > 0) {
        testCategoryId = catResult.items[0].id;
        results.push({
          id: 'category', label: '카테고리 검색', success: true,
          message: `"식품" ${count}건`, detail: { count, firstId: testCategoryId },
          durationMs: Date.now() - t4Start,
        });
      } else {
        results.push({
          id: 'category', label: '카테고리 검색', success: false,
          message: '카테고리 검색 결과가 없습니다.',
          durationMs: Date.now() - t4Start,
        });
      }
    } catch (err) {
      results.push({
        id: 'category', label: '카테고리 검색', success: false,
        message: err instanceof Error ? err.message : '카테고리 검색 실패',
        durationMs: Date.now() - t4Start,
      });
    }

    // Test 5: 고시정보 API (depends on test 4)
    const t5Start = Date.now();
    if (!testCategoryId) {
      results.push({
        id: 'notice', label: '고시정보 API', success: false,
        message: '카테고리 검색 실패로 테스트를 건너뜁니다.',
        durationMs: 0,
      });
    } else {
      try {
        const notice = await coupangAdapter.getNoticeCategoryFields(testCategoryId);
        const fieldCount = notice.items?.length ?? 0;
        results.push({
          id: 'notice', label: '고시정보 API', success: fieldCount > 0,
          message: fieldCount > 0 ? `${fieldCount}개 고시 카테고리` : '고시정보가 없습니다.',
          detail: { fieldCount },
          durationMs: Date.now() - t5Start,
        });
      } catch (err) {
        results.push({
          id: 'notice', label: '고시정보 API', success: false,
          message: err instanceof Error ? err.message : '고시정보 조회 실패',
          durationMs: Date.now() - t5Start,
        });
      }
    }

    // Test 6: 속성 API (depends on test 4)
    const t6Start = Date.now();
    if (!testCategoryId) {
      results.push({
        id: 'attribute', label: '속성 API', success: false,
        message: '카테고리 검색 실패로 테스트를 건너뜁니다.',
        durationMs: 0,
      });
    } else {
      try {
        const attrs = await coupangAdapter.getCategoryAttributes(testCategoryId);
        const attrCount = attrs.items?.length ?? 0;
        results.push({
          id: 'attribute', label: '속성 API', success: true,
          message: attrCount > 0 ? `${attrCount}개 속성` : '속성 정보 정상 (속성 0개)',
          detail: { attrCount },
          durationMs: Date.now() - t6Start,
        });
      } catch (err) {
        results.push({
          id: 'attribute', label: '속성 API', success: false,
          message: err instanceof Error ? err.message : '속성 조회 실패',
          durationMs: Date.now() - t6Start,
        });
      }
    }

    const overallSuccess = results.every((r) => r.success);
    return NextResponse.json({ results, overallSuccess });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '연동 테스트 실패' },
      { status: 500 },
    );
  }
}
