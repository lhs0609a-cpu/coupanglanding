// ============================================================
// 인증(KC 등) 등록 전 미리보기 — 검수 화면용
//
// 등록을 눌러야 인증번호가 붙었는지 알 수 있으면 늦다. 검수 단계에서
// "이 인증번호가 어느 쿠팡 타입으로 들어갈지"를 미리 계산해 보여준다.
//
// 실제 등록(batch/route.ts)과 **같은 함수**(groundCertifications)를 쓴다.
// 미리보기와 실제 등록이 갈리면 안 되기 때문.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { normalizeCertifications, groundCertifications } from '@/lib/megaload/services/cert-normalizer';

export const maxDuration = 60;

export type CertPreviewStatus =
  | 'none'      // 소싱 인증정보 자체가 없음 (인증 대상 아닐 수 있음 — 경고 아님)
  | 'ok'        // 전부 매칭됨
  | 'partial'   // 일부만 매칭 (나머지는 등록에서 빠짐)
  | 'failed'    // 인증번호는 있는데 하나도 못 붙임 → NOT_REQUIRED 로 등록됨
  | 'error';    // 카테고리 메타 조회 실패

export interface CertPreviewResult {
  uid: string;
  status: CertPreviewStatus;
  /** 등록 payload 에 실제로 들어갈 항목 */
  matched: {
    certificationType: string;
    certificationName: string;
    certificationCode: string;
    /** true = 쿠팡에 인증번호 입력칸이 없는 항목. 체크만 되며 번호는 원래 안 들어간다(정상). */
    checkboxOnly: boolean;
  }[];
  /** 빠지는 것 중 **조치 가능한** 원본 라벨(= 경고 대상) */
  unmatched: string[];
  /** 쿠팡에 대응 인증 항목 자체가 없어 빠지는 라벨(HACCP·할랄 등). 조치 불가 → 경고 아님 */
  unsupported: string[];
  message?: string;
}

interface ReqProduct {
  uid: string;
  categoryCode: string;
  sourceCertifications?: unknown[];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { products?: ReqProduct[] };
    const products = body.products || [];
    if (products.length === 0) return NextResponse.json({ results: [] });

    const serviceClient = await createServiceClient();
    const megaloadUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const adapter = await getAuthenticatedAdapter(serviceClient, megaloadUserId, 'coupang') as CoupangAdapter;

    // 카테고리별 인증 메타는 상품 수만큼이 아니라 "서로 다른 카테고리 수"만큼만 조회
    const codes = [...new Set(products.map((p) => p.categoryCode).filter(Boolean))];
    const metaByCode = new Map<string, Awaited<ReturnType<CoupangAdapter['getCategoryCertifications']>>['items'] | null>();
    await Promise.all(codes.map(async (code) => {
      try {
        const { items } = await adapter.getCategoryCertifications(code);
        metaByCode.set(code, items);
      } catch (e) {
        console.warn(`[cert-preview] 카테고리 메타 실패: ${code}`, e instanceof Error ? e.message : e);
        metaByCode.set(code, null);
      }
    }));

    const results: CertPreviewResult[] = products.map((p) => {
      const normalized = normalizeCertifications(p.sourceCertifications);
      if (normalized.length === 0) {
        return { uid: p.uid, status: 'none', matched: [], unmatched: [], unsupported: [] };
      }
      const offered = metaByCode.get(p.categoryCode);
      if (!offered) {
        return {
          uid: p.uid, status: 'error', matched: [], unmatched: normalized.map((n) => n.rawName || n.code), unsupported: [],
          message: '쿠팡 카테고리 인증 정보를 불러오지 못했습니다. 등록 시 다시 시도합니다.',
        };
      }

      const { certs, actionable, unsupported, grounded } = groundCertifications(normalized, offered);
      const matched = grounded.map((g) => ({
        certificationType: g.certificationType,
        certificationName: g.offeredName || g.certificationType,
        certificationCode: g.code,
        checkboxOnly: g.checkboxOnly,
      }));

      // 경고는 "사용자가 조치할 수 있는 누락"에만 띄운다.
      //   쿠팡에 칸이 없는 인증(HACCP·할랄 등)은 윙에서도 넣을 데가 없다 →
      //   경고로 올리면 아무도 못 고치는 노이즈가 되므로 unsupported 로만 알린다.
      let status: CertPreviewStatus = 'ok';
      let message: string | undefined;
      if (actionable.length > 0) {
        if (certs.length === 0) {
          status = 'failed';
          message = '소싱 인증을 이 카테고리의 인증 항목에 연결하지 못했습니다. 이대로 등록하면 인증정보 없이(인증대상아님) 올라갑니다.';
        } else {
          status = 'partial';
          message = `${actionable.length}건이 등록에서 빠집니다.`;
        }
      }
      return { uid: p.uid, status, matched, unmatched: actionable, unsupported, message };
    });

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '인증 미리보기 실패' },
      { status: 500 },
    );
  }
}
