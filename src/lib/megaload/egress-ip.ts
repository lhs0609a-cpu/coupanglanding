/**
 * 메가로드 채널 API 호출 서버 IP (단일 출처)
 *
 * 11번가·롯데온·ESM·네이버 커머스API 는 모두 "호출 서버 IP" 를 화이트리스트에 등록해야 한다.
 * 셀러가 각 채널 화면에 붙여넣을 값이므로 비밀이 아니다 → NEXT_PUBLIC_ 로 노출한다.
 *
 * 값의 출처: Fly.io 프록시(coupang-api-proxy)의 outbound IP.
 *   확인: fly ssh console -a coupang-api-proxy -C "curl -s ifconfig.me"
 *   또는: 프록시 배포 후 GET {COUPANG_PROXY_URL}/check-ip
 *
 * ⚠️ Fly 는 dedicated egress IP 를 붙이지 않으면 outbound IP 가 고정이라는 보장이 없다.
 *    IP 가 바뀌면 등록해 둔 전 채널이 동시에 401/403 으로 죽으므로, 반드시 고정 IP 를
 *    확보한 뒤 이 값을 배포할 것. (미확정 상태에서는 빈 값으로 두어 가이드가 "준비 중"을 노출)
 *
 * 여러 개면 쉼표로: NEXT_PUBLIC_MEGALOAD_EGRESS_IPS="1.2.3.4,5.6.7.8"
 */

const RAW = process.env.NEXT_PUBLIC_MEGALOAD_EGRESS_IPS || '';

/** 등록해야 할 IP 목록. 미설정이면 빈 배열. */
export function egressIps(): string[] {
  return RAW.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 채널 화면에 그대로 붙여넣을 문자열. 11번가·롯데온은 세미콜론 구분을 요구한다. */
export function egressIpsForPaste(separator: ';' | ',' = ';'): string {
  return egressIps().join(separator);
}

export function hasEgressIps(): boolean {
  return egressIps().length > 0;
}
