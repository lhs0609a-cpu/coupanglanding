import type { StepHowto } from '../academy/types';
import { START_SUPPORT } from '../academy/start-support';
import { ACT12_MOCKUPS } from './screens-act12';
import { ACT34_MOCKUPS } from './screens-act34';
import type { MockupScreen, MockupBlock } from './types';
const reviewedIds = new Set(["act1-01-biz-registration","act1-02-online-sales","act1-03-health-cert","act1-05-api","act1-06-shipping","act1-07-catalog","act2-20-preflight","act2-30-options","act2-40-main-image","act2-50-detail-image","act2-60-select","act2-08-register","act2-09-approved","act3-10-first-order","act3-30-purchase","act3-40-invoice","act3-50-stockout","act3-60-delay","act4-10-inquiry","act4-20-return","act4-30-difficult","act4-40-brand-notice","act4-50-coupang-penalty"]);
const originals = { ...ACT12_MOCKUPS, ...ACT34_MOCKUPS };
/** 입력 예시는 실제 고객/상품 데이터가 아니다. 실제 화면 캡처와 작업 설명도를 구분한다. */
const examples: Record<string, MockupBlock[]> = {
 'op-3': [{k:'table',cols:['판매 구성 예시','중량 단위','판매 수량'],rows:[['500 g × 2개','g','2'],['미확인','공급처 확인','등록 보류']]}],
 'op-5': [{k:'table',cols:['계산 항목','예시 금액'],rows:[['판매가','20,000원'],['매입 + 배송','15,000원'],['수수료 (예시)','2,000원'],['세금·기타 비용 전 차액','3,000원']]}],
 'op-6': [{k:'check',options:[{text:'실제 재고와 출고 소요일 확인'},{text:'품목별 상품정보 고시 입력'},{text:'인증 대상 여부와 증빙 확인'}]}],
 'sp-2': [{k:'field',label:'주소 이름',ph:'공급처 A 출고지'},{k:'field',label:'우편번호 · 기본/상세주소',ph:'공급처가 확인한 실제 출고 주소'},{k:'field',label:'담당자 · 연락처',ph:'연락 가능한 실제 담당자'}],
 'sp-3': [{k:'field',label:'반품 수령 주소',ph:'공급처와 합의한 반품지'},{k:'field',label:'수령 담당자 · 연락처',ph:'반품 수령이 가능한 연락처'}],
 'pc-5': [{k:'table',cols:['쿠팡 주문번호','공급처 주문번호','실제 결제액','택배사·운송장'],rows:[['해당 고객 주문','공급처 결제 후 기록','주문별 기록','출고 후 대조']]}],
 'iv-3': [{k:'select',label:'택배사',value:'공급처가 실제 사용한 택배사 선택'},{k:'field',label:'운송장번호',ph:'해당 주문의 실제 번호 붙여넣기'}],
 'rt-2': [{k:'radio',label:'현재 회수 상태에 따른 분기',options:[{text:'이미 회수 접수됨',note:'중복 접수 없이 수거 상태 확인'},{text:'자체 수거 필요',note:'수령지 합의 → 택배 접수 → 고객 안내'}]}],
 'rt-4': [{k:'check',options:[{text:'실제 수령일·담당자 기록'},{text:'상품·수량·구성품 대조'},{text:'상태 사진과 검수 결과 보관'},{text:'윙 요청 상세의 입고 확인 처리'}]}],
 'rt-5': [{k:'flow',items:[{text:'윙 환불 상태 조회',state:'done'},{text:'이미 환불 / 추가 처리 필요 구분',state:'now'},{text:'중복 없이 완료 확인',state:'todo'}]}],
 'rt-6': [{k:'flow',items:[{text:'교환 재고·고객 합의',state:'done'},{text:'회수·검수 / 교환 재배송',state:'now'},{text:'교환 송장·배송 완료',state:'todo'}]}],
 'rt-7': [{k:'table',cols:['서로 별개인 거래','확인할 결과'],rows:[['쿠팡 → 고객','환불 상태·금액'],['공급처 → 판매자','매입 환불·배송비 차감'],['쿠팡 → 판매자','정산 차감·최종 입금']]}],
};
export function getReviewedMockups(stepId: string, howto: StepHowto[]): MockupScreen[] | undefined {
  if (!reviewedIds.has(stepId)) return undefined;
  const support = START_SUPPORT[stepId];
  const screens: MockupScreen[] = howto.flatMap(mission => {
   const shots: MockupScreen[] = (originals[stepId] ?? []).filter(s => s.kind === 'shot').filter(s => s.kind === 'shot' && s.hotspots.some(h => h.pin === mission.id)).map(s => s.kind === 'shot' ? {...s, caption: mission.label + ' — 기존 화면 캡처입니다. 실제 메뉴가 다르면 안내 경로와 필드 이름을 기준으로 찾으세요.', hotspots: s.hotspots.filter(h => h.pin === mission.id).map(h => ({...h,label:mission.label}))} : s);
   return [...shots, {
    tab: mission.label, chrome: 'browser', brand: '작업 설명도', url: mission.link?.url ?? support.url, path: support.path, accent: 'blue',
    caption: '작업 설명용 예시입니다. 실제 사이트의 화면 배치와 다를 수 있습니다. 입력 예시는 실제 값으로 바꾸세요.',
    blocks: [
     {k:'heading',text:mission.label},
     {k:'text',text:mission.description ?? ''},
     ...(examples[mission.id] ?? []),
     {k:'check',pin:mission.id,label:'실제 작업 화면에서 확인',options:[{text:mission.label,note:'실제 작업 화면 열기 링크에서 처리한 후 완료 체크'}]},
     {k:'notice',tone:'ok',title:'단계 종료 전 확인',text:support.complete},
    ],
   } satisfies MockupScreen];
  });
  return screens;
}

