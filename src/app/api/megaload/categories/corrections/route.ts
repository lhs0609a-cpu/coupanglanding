import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { computeSignature } from '@/lib/megaload/services/category-signature';

export const maxDuration = 15;

interface CorrectionRow {
  product_signature: string;
  corrected_code: string;
  corrected_path: string;
  hit_count: number;
}

/**
 * POST — 사용자 학습 결과 일괄 조회.
 * body: { productNames: string[] }
 * 응답: { matches: { [index]: { code, path, hitCount } } }
 *
 * 매칭 시작 직전에 호출하여 사용자가 과거 수정한 패턴 즉시 적용.
 */
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
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정 없음' }, { status: 404 });
    }

    const body = await req.json() as { productNames: string[] };
    if (!body.productNames || !Array.isArray(body.productNames)) {
      return NextResponse.json({ error: 'productNames 배열 필요' }, { status: 400 });
    }

    // 시그니처 생성 (각 상품명별)
    const signatures = body.productNames.map(n => computeSignature(n));
    const uniqueSigs = [...new Set(signatures.filter(s => s.length > 0))];
    if (uniqueSigs.length === 0) {
      return NextResponse.json({ matches: {} });
    }

    // Supabase 일괄 조회
    const { data: rows } = await serviceClient
      .from('megaload_category_corrections')
      .select('product_signature, corrected_code, corrected_path, hit_count')
      .eq('megaload_user_id', shUserId)
      .in('product_signature', uniqueSigs);

    const sigToMatch = new Map<string, CorrectionRow>();
    for (const r of (rows || []) as CorrectionRow[]) {
      sigToMatch.set(r.product_signature, r);
    }

    // 인덱스별 매핑
    const matches: Record<number, { code: string; path: string; hitCount: number }> = {};
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      const row = sigToMatch.get(sig);
      if (row) {
        matches[i] = {
          code: row.corrected_code,
          path: row.corrected_path,
          hitCount: row.hit_count,
        };
      }
    }

    // hit_count 증가 (사용된 시그니처)
    const usedSigs = [...new Set(Object.values(matches).map((_, idx) => signatures[+Object.keys(matches)[idx]]))]
      .filter(Boolean);
    if (usedSigs.length > 0) {
      // 비동기 fire-and-forget — 응답 지연 방지
      (async () => {
        try {
          await serviceClient.rpc('increment_category_correction_hits', {
            user_id: shUserId,
            sigs: usedSigs,
          }).then(() => null, () => null); // RPC 없으면 무시 (선택적)
        } catch { /* ignore */ }
      })();
    }

    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '학습 조회 실패' },
      { status: 500 },
    );
  }
}

/**
 * PUT — 사용자 카테고리 수정 1건 저장 (또는 hit_count 증가).
 * body: {
 *   productName: string;
 *   correctedCode: string;
 *   correctedPath: string;
 *   originalCode?: string;
 *   originalPath?: string;
 *   originalConfidence?: number;
 * }
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정 없음' }, { status: 404 });
    }

    const body = await req.json() as {
      productName: string;
      correctedCode: string;
      correctedPath: string;
      originalCode?: string;
      originalPath?: string;
      originalConfidence?: number;
    };

    if (!body.productName || !body.correctedCode) {
      return NextResponse.json({ error: 'productName, correctedCode 필수' }, { status: 400 });
    }

    const signature = computeSignature(body.productName);
    if (!signature) {
      return NextResponse.json({ error: '시그니처 생성 실패' }, { status: 400 });
    }

    // upsert (있으면 업데이트, 없으면 insert)
    const { error } = await serviceClient
      .from('megaload_category_corrections')
      .upsert({
        megaload_user_id: shUserId,
        product_signature: signature,
        corrected_code: body.correctedCode,
        corrected_path: body.correctedPath,
        original_code: body.originalCode ?? null,
        original_path: body.originalPath ?? null,
        original_confidence: body.originalConfidence ?? null,
        product_name_sample: body.productName.slice(0, 200),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'megaload_user_id,product_signature' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, signature });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '학습 저장 실패' },
      { status: 500 },
    );
  }
}
