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
 * 상품 등록/업로드 가능 여부 판정.
 * 핵심 게이트: 카드(자동결제) 미등록이면 업로드 불가.
 */
export function checkUploadGate(supplier: Supplier | null): SupplierUploadGate {
  if (!supplier) {
    return { canUpload: false, reason: '공급사 등록이 필요합니다.' };
  }
  if (supplier.status === 'suspended') {
    return { canUpload: false, reason: '공급사 계정이 정지되었습니다. 관리자에게 문의하세요.' };
  }
  if (supplier.billing_status !== 'active' || !supplier.card_registered_at) {
    return { canUpload: false, reason: '상품 업로드 전에 자동결제 카드를 먼저 등록해주세요.' };
  }
  return { canUpload: true, reason: null };
}
