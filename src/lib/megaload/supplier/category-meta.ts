/**
 * 공급사 상품 등록 동적폼용 카테고리 메타(고시/속성) 조회.
 *
 * 카테고리 메타는 전 사용자 공유 자산이므로, 공급사가 쿠팡 연동이 없어도
 * "연결된 쿠팡 셀러 1명"의 creds 로 조회한다(category-attribute-sync 크론과 동일 패턴).
 * 캐시 우선(coupang_notice_category_cache / coupang_attribute_cache).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoupangAdapter } from '../adapters/coupang.adapter';
import { getAuthenticatedAdapter } from '../adapters/factory';
import { getNoticeCategoryWithCache } from '../services/notice-category-cache';
import { getAttributesWithCache } from '../services/attribute-cache';
import { computeRequiredAttrAutofillDetailed, type AutofillAttrMeta } from '../services/required-attr-autofill';

export interface SupplierNoticeField { name: string; required: boolean }
export interface SupplierNoticeGroup { noticeCategoryName: string; fields: SupplierNoticeField[] }
export interface SupplierAttributeField {
  name: string;
  required: boolean;
  unit: string | null;
  options: string[];        // 선택지(있으면)
}
export interface SupplierCategoryMeta {
  notices: SupplierNoticeGroup[];
  attributes: SupplierAttributeField[];
  /** 상품명 기반 필수속성 자동채움 제안값 (productName 전달 시) */
  suggestedAttributes?: Record<string, string>;
  /** 자동채움했지만 확인이 필요한 속성명(ENUM 첫값 등) */
  uncertainAttributes?: string[];
}

/** 연결된 쿠팡 셀러 아무나의 어댑터 (공유 카테고리 메타 조회용). 없으면 null. */
async function getSharedCoupangAdapter(serviceClient: SupabaseClient): Promise<CoupangAdapter | null> {
  const { data: cred } = await serviceClient
    .from('channel_credentials')
    .select('megaload_user_id')
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .limit(1)
    .maybeSingle();
  if (!cred) return null;
  try {
    return await getAuthenticatedAdapter(
      serviceClient,
      (cred as { megaload_user_id: string }).megaload_user_id,
      'coupang',
    ) as CoupangAdapter;
  } catch {
    return null;
  }
}

export async function getSupplierCategoryMeta(
  serviceClient: SupabaseClient,
  categoryCode: string,
  productName?: string,
): Promise<SupplierCategoryMeta> {
  const adapter = await getSharedCoupangAdapter(serviceClient);
  if (!adapter) return { notices: [], attributes: [] };

  const [noticeRaw, attrRaw] = await Promise.all([
    getNoticeCategoryWithCache(serviceClient, adapter, categoryCode).catch(() => []),
    getAttributesWithCache(serviceClient, adapter, categoryCode).catch(() => []),
  ]);

  const notices: SupplierNoticeGroup[] = noticeRaw.map((g) => ({
    noticeCategoryName: g.noticeCategoryName,
    fields: (g.fields || []).map((f) => ({ name: f.name, required: !!f.required })),
  }));

  const attributes: SupplierAttributeField[] = attrRaw.map((a) => {
    const rec = a as Record<string, unknown>;
    const optSrc = rec.attributeValues ?? rec.inputValues ?? rec.options;
    const options = Array.isArray(optSrc)
      ? optSrc.map((o) => (typeof o === 'string' ? o : String((o as Record<string, unknown>)?.attributeValueName ?? ''))).filter(Boolean)
      : [];
    return {
      name: String(rec.attributeTypeName ?? rec.name ?? ''),
      required: rec.required === true || rec.required === 'MANDATORY' || rec.exposed === 'MANDATORY',
      unit: (rec.basicUnit as string) || (rec.unit as string) || null,
      options,
    };
  }).filter((a) => a.name);

  // 상품명 기반 필수속성 자동채움 — 원시 메타(attrRaw)로 서버 buildAttributes 와 동일 규칙 적용
  let suggestedAttributes: Record<string, string> = {};
  let uncertainAttributes: string[] = [];
  if (productName && productName.trim()) {
    const { values, uncertainEnum } = computeRequiredAttrAutofillDetailed(
      { name: productName.trim() },
      attrRaw as unknown as AutofillAttrMeta[],
    );
    suggestedAttributes = values;
    uncertainAttributes = uncertainEnum;
  }

  return { notices, attributes, suggestedAttributes, uncertainAttributes };
}
