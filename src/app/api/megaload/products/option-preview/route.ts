// ============================================================
// 구매옵션 등록 전 미리보기 — 올인원 검수 화면용
//
// 올인원 텍스트 생성(로컬 LLM)은 옵션을 상품명에서 지어내 "무알콜=무알콜"
// 같은 무의미 값을 만든다. 그런데 실제 등록(preflight-builder)은 그 LLM 값을
// 쓰지 않고 **카테고리 buyOptions 스키마 기반 extractOptionsEnhanced** 로
// 원본 상품명에서 진짜 옵션(용량 750ml, 수량 24개 등)을 재추출한다.
//
// → 검수 화면이 이 엔드포인트로 "실제 등록될 옵션"을 미리 받아 카드에 채운다.
//   등록 경로(preflight-builder)와 **같은 함수**를 써서 미리보기≠실제 를 방지한다.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractOptionsEnhanced } from '@/lib/megaload/services/option-extractor';

export const maxDuration = 60;

export interface OptionPreviewResult {
  uid: string;
  /** 실제 등록될 구매옵션 (카테고리 스키마 기반) */
  buyOptions: { name: string; value: string; unit?: string }[];
  confidence: number;
  warnings: string[];
  /** 다변량(택1) 상품이라 단일 확정 불가 — 사용자 선택 필요 */
  ambiguous?: boolean;
  optionCandidates?: { name: string; candidates: string[] }[];
  /** 상품명에서 못 뽑아 억지 기본값이 들어간 필수옵션명 — 사용자가 직접 입력해야 함(억지값 등록 방지) */
  needsInput?: string[];
}

/**
 * 순수 "수량/개수(총 판매 개수)" 옵션인지 — 원본명에 개수 표기가 없으면 1개로 봐도 안전한 항목.
 *   사용자 규칙: "갯수가 원본명에 없으면 1개인 거야" → 이런 옵션은 등록차단(needsInput)에서 제외.
 *   ⚠️ '개당 중량/개당 용량'(농산물·식품에서 쿠팡윙이 실제 값을 요구) 은 제외 대상이 아니다 —
 *      이름에 '수량/개수'가 없으므로 아래 정규식에 걸리지 않아 그대로 차단 유지된다.
 */
function isCountLikeOption(name: string): boolean {
  return /수량|개수|갯수|입수/.test(name) && !/중량|용량|무게|부피/.test(name);
}

/**
 * 추출기 경고에서 "억지 기본값/추출실패" 필수옵션명을 뽑아낸다.
 * 예: `'개당 용량' → 기본값 "1ml" 사용`, `필수 옵션 '개당 중량' 값을 추출할 수 없습니다`,
 *     `택1 필수 옵션 '개당 용량/개당 중량' 중 하나도 추출할 수 없습니다`.
 * 단, 순수 수량/개수 옵션은 기본값 1개로 등록해도 되므로 차단 목록에서 뺀다.
 */
function placeholderOptionNames(warnings: string[]): string[] {
  const names = new Set<string>();
  for (const w of warnings) {
    if (!/기본값|추출할 수 없/.test(w)) continue;
    for (const m of w.matchAll(/'([^']+)'/g)) {
      for (const nm of m[1].split('/')) {
        const t = nm.trim();
        if (t && !isCountLikeOption(t)) names.add(t);
      }
    }
  }
  return [...names];
}

interface ReqProduct {
  uid: string;
  categoryCode: string;
  /** 옵션 추출의 1차 소스 — 원본(소싱) 상품명이 스펙이 가장 풍부하다 */
  productName: string;
  /** AI 노출명(폴백 소스) */
  displayName?: string;
  brand?: string;
  tags?: string[];
  categoryPath?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { products?: ReqProduct[] };
    const products = body.products || [];
    if (products.length === 0) return NextResponse.json({ results: [] });

    const results: OptionPreviewResult[] = await Promise.all(products.map(async (p) => {
      if (!p.categoryCode) {
        return { uid: p.uid, buyOptions: [], confidence: 0, warnings: ['카테고리 코드 없음'] };
      }
      try {
        const name = (p.productName || p.displayName || '').trim();
        const ext = await extractOptionsEnhanced({
          productName: name,
          displayName: p.displayName && p.displayName !== name ? p.displayName : undefined,
          categoryCode: String(p.categoryCode),
          brand: p.brand,
          tags: p.tags,
          categoryPath: p.categoryPath,
        });
        return {
          uid: p.uid,
          buyOptions: ext.buyOptions,
          confidence: ext.confidence,
          warnings: ext.warnings,
          ambiguous: ext.ambiguous,
          optionCandidates: ext.optionCandidates,
          needsInput: placeholderOptionNames(ext.warnings),
        };
      } catch (e) {
        return {
          uid: p.uid, buyOptions: [], confidence: 0,
          warnings: [e instanceof Error ? e.message : '옵션 추출 실패'],
        };
      }
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '옵션 미리보기 실패' },
      { status: 500 },
    );
  }
}
