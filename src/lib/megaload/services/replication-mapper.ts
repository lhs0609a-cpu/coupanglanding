/**
 * Replication Mapper — Canonical → 채널 페이로드 오케스트레이터
 *
 * 흐름:
 *   1) 채널 자동등록 가능 여부(capabilities.canCreate)
 *   2) 카테고리 매핑 존재
 *   3) 채널 공통 필수값 사전검증(이미지·이름·가격·고시·배송템플릿) — capabilities 기반
 *   4) 어댑터 mapFromCanonical (채널 고유 번역 + 채널별 추가 needs_input)
 *
 * 어느 단계든 막히면 needs_input 누락필드를 모아 반환 → 그 (상품,채널)만 보류,
 * 다른 채널·상품은 계속(부분 성공). 채널 지식은 어댑터 안에만(ACL).
 */
import type { BaseAdapter } from '../adapters/base.adapter';
import type {
  CanonicalProduct,
  ChannelMappingContext,
  ChannelMappingResult,
  MissingField,
} from './canonical-product';

/** capabilities 기반 채널 공통 필수값 사전검증 (어댑터 호출 전 빠른 필터) */
function precheckRequired(
  adapter: BaseAdapter,
  product: CanonicalProduct,
  ctx: ChannelMappingContext,
): MissingField[] {
  const missing: MissingField[] = [];
  const cap = adapter.capabilities;

  if (!ctx.channelCategoryId) {
    missing.push({ field: 'category', reason: '채널 카테고리 매핑이 필요합니다' });
  }
  if (product.images.length === 0) {
    missing.push({ field: 'image', reason: '대표 이미지가 없습니다' });
  }
  if (!(product.displayName || product.name)) {
    missing.push({ field: 'name', reason: '상품명이 비어 있습니다' });
  }
  if (ctx.sellingPrice <= 0) {
    missing.push({ field: 'price', reason: '판매가가 0입니다' });
  }
  if (cap.requiresShipTemplate) {
    const tpl = ctx.shippingTemplate;
    if (!tpl?.outboundPlaceCode || !tpl?.returnCenterCode) {
      missing.push({ field: 'ship_template', reason: '출고지/반품지 등 배송 템플릿이 필요합니다' });
    }
  }
  if (cap.requiresNotice && Object.keys(product.notices).length === 0) {
    missing.push({ field: 'notice', reason: '상품정보고시가 필요합니다' });
  }
  return missing;
}

/**
 * 단일 (상품, 채널) 매핑. 어댑터·canonical·ctx 를 받아 등록 페이로드 또는 needs_input 반환.
 */
export function mapForChannel(
  adapter: BaseAdapter,
  product: CanonicalProduct,
  ctx: ChannelMappingContext,
): ChannelMappingResult {
  // 1) 채널이 자동등록 자체를 지원하지 않음
  if (!adapter.capabilities.canCreate) {
    return {
      ok: false,
      status: 'needs_input',
      missing: [{ field: 'channel_unsupported', reason: `${ctx.channel} 은(는) 자동등록 미지원 채널입니다` }],
    };
  }

  // 2~3) 공통 사전검증
  const pre = precheckRequired(adapter, product, ctx);
  if (pre.length > 0) {
    return { ok: false, status: 'needs_input', missing: pre };
  }

  // 4) 채널 고유 번역 (어댑터가 추가 needs_input 반환 가능)
  return adapter.mapFromCanonical(product, ctx);
}
