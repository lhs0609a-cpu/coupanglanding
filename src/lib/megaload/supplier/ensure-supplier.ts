/**
 * 공급사 조회 / 업로드 자격 게이트.
 *
 * megaload_users 와 달리 공급사는 자동 프로비저닝하지 않는다 — 명시적 온보딩 필요.
 * getSupplierByProfile 은 없으면 null 반환(호출부가 온보딩으로 유도).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Supplier, SupplierUploadGate } from './types';

/** 로그인 프로필의 공급사 계정 조회 (없으면 null). */
export async function getSupplierByProfile(
  client: SupabaseClient,
  profileId: string,
): Promise<Supplier | null> {
  const { data } = await client
    .from('suppliers')
    .select('*')
    .eq('owner_profile_id', profileId)
    .maybeSingle();
  return (data as Supplier | null) ?? null;
}

/**
 * 상품 등록 가능 여부 판정.
 * 순서: 가입 승인 → 상품 등록(카드 불필요) → 카드 등록 → 판매노출.
 * 카드(자동결제)는 등록 단계가 아니라 "판매노출(관리자 승인)" 직전에 필요하다.
 * → 카드 미등록 공급사의 상품 승인은 admin/supplier-catalog 에서 차단(수수료 청구 보장).
 */
export function checkUploadGate(supplier: Supplier | null): SupplierUploadGate {
  if (!supplier) {
    return { canUpload: false, reason: '공급사 등록이 필요합니다.' };
  }
  if (supplier.status === 'suspended') {
    return { canUpload: false, reason: '공급사 계정이 정지되었습니다. 관리자에게 문의하세요.' };
  }
  if (supplier.status !== 'approved') {
    return { canUpload: false, reason: '가입 승인 후 상품을 등록할 수 있습니다.' };
  }
  return { canUpload: true, reason: null };
}

/**
 * 판매노출(관리자 승인) 자격 — 자동결제 카드가 있어야 판매 시 수수료를 청구할 수 있다.
 */
export function checkSellReady(supplier: Supplier | null): SupplierUploadGate {
  const gate = checkUploadGate(supplier);
  if (!gate.canUpload) return gate;
  if (supplier!.billing_status !== 'active' || !supplier!.card_registered_at) {
    return { canUpload: false, reason: '자동결제 카드를 등록해야 판매가 시작됩니다.' };
  }
  return { canUpload: true, reason: null };
}
