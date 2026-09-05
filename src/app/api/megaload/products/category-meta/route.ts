// ============================================================
// 카테고리 속성 메타(attributeMeta) 조회 — 올인원 검수 화면의 "옵션/속성 수동 선택"용
//
// 대량등록은 init-job 이 job 생성과 함께 categoryMeta 를 주지만, 검수 단계에서 속성
// 드롭다운을 그리려고 job 을 만들 필요는 없다. 여기서는 job 없이 attributeMeta 만
// 캐시 우선으로 돌려준다(init-job 과 같은 getAttributesWithCacheBatch 사용 → 동일 결과).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import { getAttributesWithCacheBatch } from '@/lib/megaload/services/attribute-cache';

export const maxDuration = 50;

export interface CategoryMetaResult {
  /** 카테고리코드 → 속성 메타(드롭다운 허용값 포함) */
  attributes: Record<string, AttributeMeta[]>;
}

export async function POST(req: NextRequest) {
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

    const body = (await req.json()) as { categoryCodes?: string[] };
    const codes = [...new Set(body.categoryCodes || [])].filter(Boolean).map(String);
    const attributes: Record<string, AttributeMeta[]> = {};
    if (codes.length === 0) return NextResponse.json({ attributes });

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang') as CoupangAdapter;
    const attrMap = await getAttributesWithCacheBatch(serviceClient, adapter, codes, { concurrency: 10, delayMs: 100 });
    for (const code of codes) attributes[code] = (attrMap[code] || []) as AttributeMeta[];

    return NextResponse.json({ attributes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '카테고리 속성 조회 실패' },
      { status: 500 },
    );
  }
}
