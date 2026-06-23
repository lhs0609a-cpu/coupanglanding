/**
 * 어댑터 mapFromCanonical 공용 헬퍼 — 이미지/상세/상품명 정규화.
 * 채널별 어댑터가 페이로드를 만들 때 반복되는 로직을 단일화.
 */
import type { CanonicalProduct, ChannelMappingContext } from '../services/canonical-product';

const swapWith = (ctx: ChannelMappingContext) => (u: string): string =>
  ctx.rehostedImages?.get(u) || u;

/** 대표 이미지 + 추가 이미지 URL (재호스팅 맵 반영) */
export function pickImages(product: CanonicalProduct, ctx: ChannelMappingContext): {
  representative: string;
  extras: string[];
} {
  const swap = swapWith(ctx);
  const main = product.images.filter((i) => i.role === 'main').map((i) => i.url);
  const extra = product.images.filter((i) => i.role !== 'main').map((i) => i.url);
  const representative = main[0] || product.images[0]?.url || '';
  return { representative: swap(representative), extras: extra.map(swap) };
}

/** 머리/꼬리말 합성 + 상세 내 <img src> 재호스팅 치환 */
export function composeDetail(product: CanonicalProduct, ctx: ChannelMappingContext): string {
  const swap = swapWith(ctx);
  let html = `${ctx.headerHtml || ''}${product.detailHtml || ''}${ctx.footerHtml || ''}`;
  html = html.replace(/(<img[^>]+src=["'])([^"']+)(["'])/gi, (_m, a, s, c) => `${a}${swap(s)}${c}`);
  return html || '<p>상세페이지 참조</p>';
}

/** 채널 상품명 (노출명 우선, 길이 제한) */
export function cleanName(product: CanonicalProduct, max = 100): string {
  return (product.displayName || product.name || '').trim().slice(0, max);
}
