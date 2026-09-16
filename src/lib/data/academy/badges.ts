/**
 * 뱃지 도감.
 *
 * ★ 뱃지는 **실제 달성**에만 붙는다(설계도 §8-1).
 *   슬라이드를 넘겼다고 주는 보상은 사람을 속이는 것이고, 속은 사람은 두 번 안 온다.
 *   그래서 여기 있는 뱃지는 전부 스텝 통과 — 그중 대부분이 쿠팡 API 로 확인된 사실 — 에 붙는다.
 *
 * ★ 키를 화면에 그대로 내보내지 않는다.
 *   'first_connect' 같은 내부 식별자가 사용자에게 보이면 그건 미완성으로 읽힌다.
 *   스텝의 badgeKey 는 반드시 이 도감에 있어야 하고, 테스트가 그걸 강제한다.
 */

export interface AcademyBadge {
  key: string;
  emoji: string;
  name: string;
  /** 어떻게 얻는가 — 미획득 상태에서도 보여준다(목표가 보여야 움직인다) */
  how: string;
  /** 진도 뱃지인가, 습관 뱃지인가. 습관 쪽이 사람을 남긴다. */
  kind: 'progress' | 'habit' | 'knowledge';
}

export const ACADEMY_BADGES: AcademyBadge[] = [
  { key: 'first_connect',    emoji: '🔌', name: '첫 연결',   kind: 'progress',  how: '쿠팡 API 연동에 성공하면' },
  { key: 'first_listing',    emoji: '📦', name: '첫 등록',   kind: 'progress',  how: '쿠팡에 상품을 1건 이상 올리면' },
  { key: 'first_invoice',    emoji: '🚚', name: '첫 송장',   kind: 'progress',  how: '첫 주문에 송장을 등록하면' },
  { key: 'first_answer',     emoji: '💬', name: '첫 답변',   kind: 'progress',  how: '고객 문의를 전부 답변하면' },
  { key: 'first_return',     emoji: '↩️', name: '첫 반품',   kind: 'progress',  how: '반품 요청을 처리하면' },
  { key: 'first_settlement', emoji: '💰', name: '첫 정산',   kind: 'progress',  how: '첫 정산 내역이 잡히면' },
  { key: 'incident_ready',   emoji: '🛡️', name: '사고 대응', kind: 'knowledge', how: '내용증명 대응 시나리오를 모두 맞히면' },
];

const BY_KEY = new Map(ACADEMY_BADGES.map((b) => [b.key, b]));

/** 도감에 없는 키가 와도 화면이 깨지지 않게 — 다만 테스트가 그런 키를 먼저 잡는다. */
export function getBadge(key: string): AcademyBadge {
  return BY_KEY.get(key) ?? { key, emoji: '🏅', name: key, kind: 'progress', how: '' };
}
