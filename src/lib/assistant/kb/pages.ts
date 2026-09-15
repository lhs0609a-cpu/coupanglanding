import type { KbEntry, KbAudience } from '../types';

/**
 * 페이지 지도 — 경로마다 "여기가 뭐 하는 곳인지 / 여기서 뭘 하면 되는지 / 여기서 자주 막히는 게 뭔지".
 *
 * 두 곳에서 쓴다:
 *  1) 상담봇 시스템 프롬프트 — "지금 사용자가 보고 있는 화면" 설명으로 주입
 *  2) KB 항목 — "이 페이지 뭐예요?" 같은 질문에 검색으로 걸리게
 *  3) 플로팅 위젯의 추천 질문 칩
 *
 * 경로는 prefix 매칭이므로 긴 경로를 앞에 둔다(resolvePage 가 길이순 정렬해서 찾는다).
 */
export interface PageInfo {
  path: string;
  name: string;
  /** 한 문장 설명 */
  purpose: string;
  /** 이 화면에서 실제로 하는 일 */
  howTo: string[];
  /** 여기서 자주 막히는 것 */
  pitfalls?: string[];
  /** 위젯이 띄울 추천 질문 */
  suggestions: string[];
  audience: KbAudience;
}

export const PAGE_MAP: PageInfo[] = [
  // ── 메가로드 (실제 판매 운영) ────────────────────────────
  {
    path: '/megaload/products/bulk-register',
    name: '상품등록 (대량 등록)',
    purpose: '소싱한 상품을 검증하고 쿠팡·타 채널에 한 번에 등록하는 화면. 메가로드에서 가장 많이 쓰는 화면입니다.',
    howTo: [
      '1단계 [설정] — 출고지·반품지·마진율·등록할 채널을 고릅니다. 한 번 설정하면 유지됩니다.',
      '2단계 [검증] — 소싱 폴더를 스캔해 상품을 불러오고, 카테고리 자동매칭 → 노출상품명 생성 → 상세페이지 생성이 자동 파이프라인으로 돌아갑니다.',
      '[전체 검증 + 이미지 사전업로드] 를 눌러 Dry-Run·이미지 업로드·프리플라이트를 한 번에 돌립니다.',
      '검증 대시보드에서 등록가능 / 경고 / 오류 숫자를 확인합니다. 특히 "필수필드 누락"이 0인지 봅니다.',
      '[품질 체크 완료] 로 소싱처 원본이 아직 살아 있는지(판매중/품절/삭제됨) 확인합니다.',
      '[카나리 테스트]로 1건만 실제 등록했다 지워보고, 통과하면 3단계 [등록]을 누릅니다.',
    ],
    pitfalls: [
      '필수필드 누락을 0으로 만들지 않고 올리면 몇 주 뒤 쿠팡 CNS 표시·광고 위반 메일이 옵니다.',
      '이미지 사전업로드를 건너뛰고 등록하면 이미지 실패가 많이 납니다.',
      '카테고리를 바꾼 뒤에는 프리플라이트를 재실행해야 합니다.',
      '한 번에 500개씩 밀면 중간 실패 복구가 번거롭습니다. 100개 단위를 권합니다.',
    ],
    suggestions: [
      '등록 실패한 상품들 원인이 뭐예요?',
      '필수필드 누락을 어떻게 채우나요?',
      '카나리 테스트가 뭔가요?',
      '접속오류가 99건이에요',
    ],
    audience: 'megaload',
  },
  {
    path: '/megaload/products/allinone',
    name: '올인원 등록 (폴더)',
    purpose: '로컬 폴더에 상품별로 정리된 자료(product.json + 이미지)를 통째로 올려 한 번에 등록하는 화면.',
    howTo: [
      '상위폴더 아래 product_001/, product_002/ … 로 상품별 폴더를 만듭니다.',
      '각 상품 폴더 안에 product.json, main_images/, detail_images/ 를 둡니다.',
      '상위 폴더를 통째로 지정하면 폴더 구조를 분석해 상품 목록으로 만들어줍니다.',
    ],
    pitfalls: ['폴더 구조가 다르면 인식이 안 됩니다. 화면에 표시된 "올바른 폴더 구조" 예시와 똑같이 맞추세요.'],
    suggestions: ['폴더 구조를 어떻게 만들어야 하나요?', '대량 등록이랑 뭐가 다른가요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/products/channel-status',
    name: '채널 등록현황',
    purpose: '상품이 채널별(쿠팡/네이버/11번가/G마켓/옥션/롯데온)로 실제 등록됐는지 한눈에 보는 화면.',
    howTo: ['채널별 성공/실패/대기 상태를 확인합니다.', '등록됐는지 헷갈릴 때 여기가 기준입니다.'],
    suggestions: ['등록했는데 상품이 안 보여요', '채널별로 상태가 다른 이유가 뭐예요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/products/exceptions',
    name: '등록 예외큐',
    purpose: '검증에서 걸려 등록되지 못하고 보류된 상품이 쌓이는 곳.',
    howTo: ['보류 사유를 확인하고 고친 뒤 재등록하거나, 살릴 수 없는 상품은 버립니다.'],
    suggestions: ['예외큐에 쌓인 상품들 어떻게 처리해요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/products',
    name: '상품관리',
    purpose: '등록한 상품 전체를 조회·수정·삭제하는 화면.',
    howTo: [
      '상품명·카테고리·가격을 개별 수정합니다.',
      '브랜드사에서 삭제 요청이 온 상품을 여기서 찾아 삭제합니다.',
      '검색으로 쿠팡 상품번호·상품명으로 찾을 수 있습니다.',
    ],
    suggestions: ['카테고리가 잘못 잡힌 상품 고치기', '브랜드사가 내려달라는 상품 삭제하기', '상품 개수가 쿠팡이랑 안 맞아요'],
    audience: 'megaload',
  },
  {
    path: '/megaload/orders',
    name: '주문관리',
    purpose: '쿠팡 등 채널에서 들어온 주문을 확인하고, 발주 후 운송장을 입력하는 화면.',
    howTo: [
      '신규 주문을 확인합니다.',
      '소싱처(네이버)에 고객 주소로 대신 주문합니다. 수취인 전화번호는 반드시 셀러 본인 번호로 합니다.',
      '소싱처가 발송하면 택배사 + 운송장번호를 입력합니다.',
      '조달할 수 없는 상품은 주문 취소(사유: 품절)로 처리합니다.',
    ],
    pitfalls: [
      '쿠팡 고객 안심번호(050…)를 네이버 발주 수취인 번호로 넣으면 배송기사가 연결할 수 없습니다.',
      '판매자 귀책 취소가 쌓이면 판매자 점수가 깎입니다.',
    ],
    suggestions: ['주문 들어왔는데 뭘 해야 하나요?', '운송장 어떻게 입력해요?', '소싱처가 품절이면 어떡하죠?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/returns',
    name: '반품수거',
    purpose: '쿠팡 반품/교환 요청을 가져와 처리하는 화면.',
    howTo: ['[쿠팡에서 가져오기]로 동기화한 뒤 건별로 처리합니다.'],
    suggestions: ['반품 요청이 왔어요', '반품 배송비는 누가 부담해요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/stock-monitor',
    name: '품절동기화',
    purpose: '등록한 상품의 소싱처 원본을 주기적으로 확인해 품절·삭제·가격변동을 쿠팡에 반영하는 기능.',
    howTo: [
      '감시할 상품을 등록합니다.',
      '품절이면 쿠팡에서 자동 품절 처리, 삭제됐으면 내림, 가격이 오르면 (설정에 따라) 따라 올립니다.',
      '이력에서 마지막 확인 시각과 결과를 봅니다.',
    ],
    pitfalls: ['하루 확인 한도가 있어 수천 개를 매일 전부 돌 수는 없습니다. 잘 팔리는 상품을 우선순위로 두세요.'],
    suggestions: ['품절동기화가 안 돌아요', '품절 주문이 계속 들어와요'],
    audience: 'megaload',
  },
  {
    path: '/megaload/cs',
    name: '문의관리',
    purpose: '쿠팡 고객문의 + 콜센터 문의를 한 화면에 모아 템플릿으로 빠르게 답하는 화면.',
    howTo: [
      '[문의 가져오기]로 쿠팡에서 동기화합니다.',
      '문의를 클릭하면 자동 분류된 카테고리와 주문정보가 뜹니다.',
      '오른쪽 추천 템플릿을 클릭하면 고객명·상품명·송장번호가 자동 치환됩니다.',
      '단축키: ↑↓ 문의 이동, 1~9 템플릿 선택, Ctrl+Enter 전송',
    ],
    pitfalls: ['브랜드사 메일·문자는 쿠팡 API로 들어오지 않습니다. 메일함과 문자는 따로 봐야 합니다.'],
    suggestions: ['고객 문의에 어떻게 답해요?', '템플릿을 새로 만들고 싶어요'],
    audience: 'megaload',
  },
  {
    path: '/megaload/channels/automation',
    name: '멀티채널 자동전파',
    purpose: '쿠팡에 등록한 상품을 네이버·11번가·G마켓·옥션·롯데온으로 자동 복제하는 기능.',
    howTo: ['전파할 채널과 채널별 마진을 설정하면 이후 등록분이 자동으로 퍼집니다.'],
    suggestions: ['다른 채널에도 올리려면?', '채널별 마진을 다르게 할 수 있나요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/channels',
    name: '채널관리 (연동)',
    purpose: '쿠팡·네이버·11번가·G마켓·옥션·롯데온 API 키를 등록하고 연결을 테스트하는 화면.',
    howTo: [
      '채널을 고르고 API 키를 입력합니다. 쿠팡은 Vendor ID + Access Key + Secret Key 3개입니다.',
      '[연결 테스트]로 실제 호출이 되는지 확인합니다.',
      '11번가·롯데온·네이버·ESM은 IP 화이트리스트가 필요합니다. 화면에 표시된 메가로드 호출 IP를 채널에 등록하세요.',
    ],
    pitfalls: [
      '쿠팡 API Key는 사업자 인증이 끝난 계정만 발급됩니다.',
      'Secret Key는 발급 시 한 번만 보입니다. 놓쳤으면 재발급하세요.',
      'G마켓·옥션(ESM)은 셀프 발급 메뉴가 없어 이메일 신청만 가능합니다.',
    ],
    suggestions: ['쿠팡 API 키 어디서 발급해요?', '인증 오류가 나요', 'IP 등록은 어떻게 해요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/naver-sourcing',
    name: '네이버 소싱 (수집)',
    purpose: '네이버 스마트스토어에서 상품 정보를 수집해 등록 후보로 쌓는 화면.',
    howTo: ['카테고리·키워드로 수집을 돌리면 상품이 카탈로그에 쌓입니다.'],
    pitfalls: [
      '수집 성공률 78% 전후가 정상입니다. 100%가 아니라고 설정을 바꾸지 마세요.',
      '보안문자(캡차)가 뜨면 사람이 직접 풀어야 합니다. 자동 풀이는 없습니다.',
    ],
    suggestions: ['캡차가 떠요', '수집 성공률이 낮아요', '수집한 상품은 어디서 봐요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/sourcing/naver',
    name: '네이버 소싱 카탈로그',
    purpose: '수집해둔 네이버 상품을 골라 등록 대상으로 넘기는 화면.',
    howTo: ['필터로 카테고리·가격대를 좁히고, 올릴 상품을 선택해 등록으로 보냅니다.'],
    suggestions: ['어떤 상품을 골라야 하나요?', '수동으로 상품을 추가할 수 있나요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/sourcing',
    name: '해외소싱',
    purpose: '알리익스프레스·1688 상품을 소싱하는 화면.',
    howTo: ['상품 URL이나 키워드로 가져와 마진·관세를 계산하고 등록 대상으로 넘깁니다.'],
    pitfalls: ['해외소싱은 배송기간이 길어 쿠팡 배송기한 설정에 주의해야 합니다. 관세·부가세도 마진에 반영하세요.'],
    suggestions: ['해외소싱 마진 계산은 어떻게 해요?', '배송기간을 어떻게 설정하죠?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/supplier-catalog',
    name: '공급사 제휴상품',
    purpose: '제휴 공급사가 직접 등록한 상품을 골라 바로 올릴 수 있는 화면. 소싱·발주 부담이 없습니다.',
    howTo: ['마음에 드는 상품을 선택해 내 채널에 등록합니다.'],
    suggestions: ['제휴상품은 발주를 어떻게 해요?', '일반 소싱이랑 뭐가 달라요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/catalog',
    name: '상품 카탈로그',
    purpose: '수집·소싱해둔 상품 후보를 모아 보는 창고.',
    howTo: ['여기서 고른 상품을 등록으로 넘깁니다.'],
    suggestions: ['카탈로그에서 등록으로 어떻게 보내요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/inventory',
    name: '재고관리',
    purpose: '마스터 재고를 단일 기준으로 관리해 채널 간 재고를 맞추는 화면.',
    howTo: ['마스터 재고 수량을 바꾸면 연결된 채널 재고가 함께 갱신됩니다.'],
    suggestions: ['재고가 채널마다 달라요', '재고를 일괄로 바꾸려면?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/settlement',
    name: '정산 (채널별)',
    purpose: '쿠팡 등 채널의 정산 내역을 가져와 보는 화면.',
    howTo: ['채널별 정산 예정·완료 금액을 확인하고 쿠팡 윙 화면과 대조합니다.'],
    pitfalls: ['이 화면은 채널 정산(쿠팡→나)이고, PT 코칭비 정산은 [매출 정산](/my/report)입니다. 헷갈리기 쉽습니다.'],
    suggestions: ['정산금이 언제 들어와요?', '빠른정산은 어떻게 신청해요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/analytics',
    name: '판매 통계',
    purpose: '채널별 매출·판매량·전환을 분석하는 화면.',
    howTo: ['기간과 채널을 골라 매출 추이를 봅니다.'],
    suggestions: ['제 전환율이 정상인가요?', '어떤 상품이 잘 팔리나요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/ads',
    name: '광고 자동화',
    purpose: '쿠팡 광고 캠페인을 규칙 기반으로 자동 운영하는 화면.',
    howTo: ['규칙(입찰가 조정, 성과 낮은 키워드 정리 등)을 만들어 두면 자동으로 적용됩니다.'],
    pitfalls: ['삭제 동작은 되돌릴 수 없습니다. 처음에는 "승인 후 적용" 모드로 쓰세요.'],
    suggestions: ['광고는 언제 시작해야 해요?', 'ROAS가 낮아요', '자동 규칙을 어떻게 만들죠?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/automation',
    name: '자동화',
    purpose: '반복 작업을 규칙으로 등록해 자동으로 돌리는 화면. 설정 1회 → 이후 전부 자동.',
    howTo: ['규칙을 추가해 소싱·등록·품절체크 같은 반복 작업을 자동화합니다.'],
    suggestions: ['어떤 걸 자동화할 수 있어요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/bug-reports',
    name: '오류문의',
    purpose: '프로그램 버그·이상 동작을 스크린샷과 함께 신고하고 답변을 받는 곳.',
    howTo: [
      '분류(UI 오류 / 데이터 오류 / API 오류 / 성능 / 기능 요청 / 기타)를 고릅니다.',
      '제목과 상세 설명을 쓰고 스크린샷을 첨부합니다.',
      '언제·어떤 화면에서·무엇을 눌렀더니 어떻게 됐는지를 쓰면 훨씬 빨리 해결됩니다.',
    ],
    suggestions: ['오류를 신고하고 싶어요', '답변은 언제 오나요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/desktop-app',
    name: '메가로드 도우미 다운로드',
    purpose: '소싱 수집·이미지 처리를 담당하는 데스크톱 프로그램을 받는 곳.',
    howTo: ['다운로드 → 설치 → 실행 → 활성화하면 상태가 온라인으로 바뀝니다.'],
    pitfalls: ['Windows 전용입니다. SmartScreen/백신이 막으면 예외 처리해야 합니다.'],
    suggestions: ['도우미가 오프라인이에요', '설치가 안 돼요'],
    audience: 'megaload',
  },
  {
    path: '/megaload/onboarding',
    name: '메가로드 시작하기',
    purpose: '처음 들어온 사람이 채널 연동부터 첫 등록까지 순서대로 따라가는 마법사.',
    howTo: ['연동할 채널만 채우고 나머지는 비워둬도 됩니다. 나중에 설정할 수 있습니다.'],
    suggestions: ['처음인데 뭐부터 해요?', '채널 연동을 나중에 해도 되나요?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/settings',
    name: '설정',
    purpose: '마진율, 출고지/반품지, 메가로드 도우미, Gemini 키 등 메가로드 전반 설정.',
    howTo: ['탭을 이동하며 항목을 설정합니다. 도우미 상태는 [메가로드 도우미] 탭에서 봅니다.'],
    suggestions: ['마진율은 어디서 바꿔요?', '도우미 상태 확인은 어디서?'],
    audience: 'megaload',
  },
  {
    path: '/megaload/notices',
    name: '공지사항 (메가로드)',
    purpose: '프로그램 업데이트·점검·정책 변경 공지.',
    howTo: ['새 공지가 있으면 사이드바에 배지가 뜹니다.'],
    suggestions: ['최근 공지 요약해줘'],
    audience: 'megaload',
  },
  {
    path: '/megaload/dashboard',
    name: '메가로드 대시보드',
    purpose: '주문·상품·매출·알림을 한눈에 보는 메가로드 홈.',
    howTo: ['오늘 처리할 일(신규 주문, 미답변 문의, 오류)이 위쪽에 모입니다.'],
    suggestions: ['오늘 뭐부터 해야 해요?', '내 상태 진단해줘'],
    audience: 'megaload',
  },

  // ── PT (코칭 / 정산 / 교육) ─────────────────────────────
  {
    path: '/my/report',
    name: '매출 정산',
    purpose: '매월 쿠팡 매출을 보고하고 코칭비를 정산하는 화면. 매월 마감일까지 제출해야 합니다.',
    howTo: [
      '대상월을 고르고 매출을 입력합니다. 쿠팡 API가 연동돼 있으면 자동으로 채워집니다.',
      '광고비 등 비용을 입력하면 순이익과 코칭 정산액이 계산됩니다.',
      '제출하면 정산 게이트가 즉시 풀립니다.',
    ],
    pitfalls: ['미제출로 마감일이 지나면 단계적으로 기능이 제한되고, 7일을 넘기면 대부분 차단됩니다.'],
    suggestions: ['정산 보고서를 어떻게 제출해요?', '게이트가 걸려서 화면이 막혔어요', '매출이 자동으로 안 채워져요'],
    audience: 'pt',
  },
  {
    path: '/my/ad-cost',
    name: '광고비 제출',
    purpose: '해당 월에 쓴 쿠팡 광고비를 제출하는 화면. 순이익 계산에 반영됩니다.',
    howTo: ['쿠팡 광고 관리자에서 집행 광고비를 확인해 입력하고 증빙을 첨부합니다.'],
    suggestions: ['광고비는 어디서 확인해요?', '광고비를 안 냈으면 0으로 내도 되나요?'],
    audience: 'pt',
  },
  {
    path: '/my/emergency',
    name: '긴급 대응',
    purpose: '브랜드 클레임·계정 페널티 같은 사고가 터졌을 때 시나리오별 대응 절차와 소명서 템플릿을 제공하는 곳.',
    howTo: [
      '겪고 있는 상황(상표권 침해 경고, 판매중지, 계정 정지 등)을 고릅니다.',
      '즉시 조치 목록을 순서대로 실행합니다.',
      '소명서/회신 템플릿을 복사해 씁니다.',
    ],
    suggestions: ['브랜드사에서 메일이 왔어요', '쿠팡에서 24시간 안에 답하라는 메일이 왔어요', '계정이 정지됐어요'],
    audience: 'pt',
  },
  {
    path: '/my/penalty',
    name: '페널티 트래커',
    purpose: '쿠팡 페널티 이력과 위험도를 기록·추적하는 화면.',
    howTo: ['받은 페널티를 등록하면 점수와 위험도가 계산되고, 대응 가이드로 연결됩니다.'],
    suggestions: ['페널티 몇 점이면 위험한가요?', '페널티를 받았어요'],
    audience: 'pt',
  },
  {
    path: '/my/violations',
    name: '계약위반 내역',
    purpose: '코칭 계약상 위반 사항과 위험 점수를 확인하는 화면.',
    howTo: ['기록된 항목과 사유를 확인하고, 이견이 있으면 1:1 문의로 알립니다.'],
    suggestions: ['위반 내역이 잘못된 것 같아요'],
    audience: 'pt',
  },
  {
    path: '/my/promotion',
    name: '프로모션',
    purpose: '쿠팡 즉시할인·다운로드 쿠폰을 상품에 일괄 적용하는 화면. 첫 매출을 여는 핵심 기능입니다.',
    howTo: [
      '쿠폰 종류(즉시할인 / 다운로드)와 할인율·기간을 정합니다.',
      '적용할 상품을 선택하고 실행하면 배치로 적용됩니다.',
      '즉시할인은 1개당 최대 10,000개 상품, 다운로드 쿠폰은 100개까지입니다.',
    ],
    suggestions: ['프로모션을 어떻게 걸어요?', '할인율은 몇 %가 적당해요?', '쿠폰이 적용이 안 돼요'],
    audience: 'pt',
  },
  {
    path: '/my/growth',
    name: '성장 로드맵',
    purpose: '매출 단계별 목표와 달성 시 열리는 혜택을 보여주는 화면.',
    howTo: ['현재 단계와 다음 목표를 확인합니다.'],
    suggestions: ['다음 단계로 가려면 뭘 해야 해요?'],
    audience: 'pt',
  },
  {
    path: '/my/scaling-guide',
    name: '매출 단계별 운영 가이드 (사업 확장)',
    purpose: '매출 규모가 커질 때 필요한 인력·고정비·체크리스트를 단계별로 정리한 가이드.',
    howTo: ['내 매출 구간의 카드를 열어 인력 구성과 고정비를 확인합니다.'],
    suggestions: ['직원을 언제 뽑아야 해요?', '월 1억이면 고정비가 얼마나 드나요?'],
    audience: 'pt',
  },
  {
    path: '/my/ad-academy',
    name: '광고 아카데미',
    purpose: '쿠팡 광고를 단계별 미션으로 배우는 과정.',
    howTo: ['스테이지를 순서대로 진행하며 미션을 완료합니다.'],
    suggestions: ['광고 처음인데 어디서 시작해요?'],
    audience: 'pt',
  },
  {
    path: '/my/ad-tips',
    name: '광고 노하우',
    purpose: '실전 광고 운영 팁 모음.',
    howTo: ['카테고리별로 팁을 찾아봅니다.'],
    suggestions: ['입찰가는 얼마로 시작해요?', '광고 효율을 올리려면?'],
    audience: 'pt',
  },
  {
    path: '/my/arena',
    name: '상품등록 랭킹',
    purpose: '쿠팡에서 실제 등록 상품 수를 가져와 다른 셀러와 비교하는 화면.',
    howTo: ['내 등록 수와 순위를 확인합니다. 물량이 매출의 선행지표라 여기 숫자가 중요합니다.'],
    suggestions: ['등록 수가 안 올라가요', '몇 개나 올려야 해요?'],
    audience: 'pt',
  },
  {
    path: '/my/cs-templates',
    name: 'CS 응답 템플릿',
    purpose: '고객 문의 유형별 답변 템플릿 모음. 복사해서 바로 쓰거나 내 템플릿으로 저장합니다.',
    howTo: ['카테고리(배송/교환/반품/불량/상품문의/주문)에서 상황에 맞는 템플릿을 고릅니다.'],
    suggestions: ['배송 지연 문의에 뭐라고 답해요?', '반품 요청 응대 문구'],
    audience: 'pt',
  },
  {
    path: '/my/product-search',
    name: '상품검색',
    purpose: '등록한 상품을 검색하고 경쟁 가격을 비교하는 화면.',
    howTo: ['상품명·키워드로 검색해 내 가격이 시세와 맞는지 봅니다.'],
    suggestions: ['내 가격이 비싼가요?'],
    audience: 'pt',
  },
  {
    path: '/my/trends',
    name: '트렌드 키워드',
    purpose: '지금 뜨는 키워드를 보고 소싱 방향을 잡는 화면.',
    howTo: ['상승 키워드를 보고 그 카테고리로 소싱을 돌립니다.'],
    suggestions: ['지금 뭘 소싱하면 좋아요?'],
    audience: 'pt',
  },
  {
    path: '/my/education',
    name: '교육 센터',
    purpose: '쿠팡 셀러가 되기 위한 단계별 교육. 리셀 합법성부터 CS·마진·페널티까지 모듈로 구성돼 있습니다.',
    howTo: ['모듈을 순서대로 수강하고 퀴즈를 통과하면 다음 단계가 열립니다.'],
    suggestions: ['교육을 꼭 들어야 하나요?', '퀴즈를 틀렸어요'],
    audience: 'pt',
  },
  {
    path: '/my/curriculum',
    name: '쿠팡 PT 교육 현황',
    purpose: '내 교육 진도와 남은 과정을 보는 화면.',
    howTo: ['진행률과 미완료 모듈을 확인합니다.'],
    suggestions: ['진도가 얼마나 남았어요?'],
    audience: 'pt',
  },
  {
    path: '/my/training-videos',
    name: '교육 영상',
    purpose: '실제 화면을 녹화한 실습 영상 모음.',
    howTo: ['상품등록, 소싱, 주문 처리 등 실습 영상을 봅니다.'],
    suggestions: ['상품등록 영상 어디 있어요?'],
    audience: 'pt',
  },
  {
    path: '/my/guides',
    name: '운영 가이드',
    purpose: '사업자등록부터 쿠팡 입점·운영까지 단계별 문서 가이드.',
    howTo: ['카테고리에서 필요한 문서를 찾아 따라 합니다.'],
    suggestions: ['사업자등록 어떻게 해요?', '통신판매업 신고가 필요한가요?'],
    audience: 'pt',
  },
  {
    path: '/my/contract',
    name: '계약서',
    purpose: '전자계약서 조항을 확인하고 서명하는 화면.',
    howTo: ['조항을 확인하고 서명합니다. 이미 서명했으면 내용만 열람합니다.'],
    suggestions: ['정산 비율이 어떻게 되나요?', '해지는 어떻게 하나요?'],
    audience: 'pt',
  },
  {
    path: '/my/tax-invoices',
    name: '세금계산서',
    purpose: '정산 완료 건의 세금계산서를 확인하는 화면. 정산 완료 후 자동 발행됩니다.',
    howTo: ['발행된 계산서를 확인·다운로드합니다.'],
    suggestions: ['세금계산서가 안 나왔어요'],
    audience: 'pt',
  },
  {
    path: '/my/support',
    name: '1:1 문의',
    purpose: '정산·계약·API·세금계산서·시스템 오류 등을 관리자에게 직접 묻는 곳.',
    howTo: ['분류를 고르고 내용을 남기면 관리자가 답합니다.'],
    suggestions: ['1:1 문의를 남기고 싶어요'],
    audience: 'pt',
  },
  {
    path: '/my/faq',
    name: 'FAQ',
    purpose: '자주 묻는 질문 모음.',
    howTo: ['카테고리별로 찾아봅니다.'],
    suggestions: ['자주 묻는 질문 보여줘'],
    audience: 'pt',
  },
  {
    path: '/my/notices',
    name: '공지사항',
    purpose: '정책·교육·긴급 공지.',
    howTo: ['새 공지를 확인합니다.'],
    suggestions: ['최근 공지 요약해줘'],
    audience: 'pt',
  },
  {
    path: '/my/settings',
    name: '계정 설정',
    purpose: '비밀번호, 연락처, 결제 수단(카드)을 관리하는 화면.',
    howTo: ['카드를 등록하면 코칭비가 자동 결제됩니다.'],
    pitfalls: ['결제 잠금 3단계가 걸리면 이 화면 밖으로 나갈 수 없습니다. 카드 등록 후 결제하면 풀립니다.'],
    suggestions: ['카드 등록이 안 돼요', '결제 잠금을 풀려면?'],
    audience: 'pt',
  },
  {
    path: '/my/dashboard',
    name: 'PT 대시보드',
    purpose: '정산 D-Day, 교육 진행률, 긴급 알림, 매출 현황을 한눈에 보는 홈.',
    howTo: ['위젯에서 오늘 처리할 일을 확인합니다.'],
    suggestions: ['오늘 뭐부터 해야 해요?', '내 상태 진단해줘'],
    audience: 'pt',
  },

  // ── 공개 페이지 ──────────────────────────────────────────
  {
    path: '/pt',
    name: '쿠팡PT 안내',
    purpose: '1:1 쿠팡 전문가 코칭(쿠팡PT) 소개 페이지.',
    howTo: ['초기비용 0원, 매출 발생 후 순이익의 일부를 정산하는 성과 기반 구조를 설명합니다.'],
    suggestions: ['쿠팡PT가 뭐예요?', '비용이 얼마나 드나요?', '신청은 어떻게 해요?'],
    audience: 'public',
  },
  {
    path: '/program',
    name: '메가로드 프로그램 안내',
    purpose: 'AI 기반 쿠팡 상품 대량등록 자동화 프로그램(메가로드) 소개.',
    howTo: ['기능과 요금제를 설명합니다. 1일 무료 체험이 있습니다.'],
    suggestions: ['메가로드가 뭐예요?', '무료로 써볼 수 있나요?', '어떤 채널을 지원해요?'],
    audience: 'public',
  },
  {
    path: '/apply',
    name: '신청',
    purpose: '쿠팡PT 신청서를 작성하는 페이지.',
    howTo: ['연락처와 현재 상황을 적어 제출하면 심사 후 연락이 갑니다.'],
    suggestions: ['신청하면 언제 연락 오나요?', '심사 기준이 뭐예요?'],
    audience: 'public',
  },
  {
    path: '/start',
    name: '시작하기',
    purpose: '쿠팡 셀러 시작 로드맵을 단계별로 보여주는 페이지.',
    howTo: ['사업자등록 → 통신판매업 신고 → 쿠팡 입점 순서를 따라갑니다.'],
    suggestions: ['뭐부터 준비해야 해요?', '사업자등록이 꼭 필요한가요?'],
    audience: 'public',
  },
  {
    path: '/guide',
    name: '가이드',
    purpose: '쿠팡 셀러 운영에 필요한 공개 문서 모음.',
    howTo: ['주제별 문서를 읽습니다.'],
    suggestions: ['쿠팡 위탁판매가 뭐예요?', '초보가 읽을 글 추천해줘'],
    audience: 'public',
  },
  {
    path: '/supplier-program',
    name: '공급사 프로그램',
    purpose: '상품을 공급할 업체를 위한 제휴 안내.',
    howTo: ['입점 조건과 정산 구조를 설명합니다.'],
    suggestions: ['공급사로 참여하려면?'],
    audience: 'public',
  },
  {
    path: '/',
    name: '메인',
    purpose: '쿠팡PT와 메가로드를 소개하는 홈.',
    howTo: [],
    suggestions: ['쿠팡PT가 뭐예요?', '메가로드는 뭐가 다른가요?', '무료로 시작할 수 있나요?'],
    audience: 'public',
  },
];

/** 경로 → 페이지 정보. 가장 구체적인(긴) prefix 가 이긴다. */
const SORTED_PAGES = [...PAGE_MAP].sort((a, b) => b.path.length - a.path.length);

export function resolvePage(pathname: string | null | undefined): PageInfo | null {
  if (!pathname) return null;
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return (
    SORTED_PAGES.find((p) => (p.path === '/' ? clean === '/' : clean === p.path || clean.startsWith(p.path + '/'))) ??
    null
  );
}

/** 경로 → 상담 표면 */
export function resolveSurface(pathname: string | null | undefined): 'public' | 'pt' | 'megaload' | 'admin' {
  const clean = (pathname || '/').split('?')[0];
  if (clean.startsWith('/admin')) return 'admin';
  if (clean.startsWith('/megaload')) return 'megaload';
  if (clean.startsWith('/my')) return 'pt';
  return 'public';
}

/** PAGE_MAP 을 KB 항목으로 변환 — "이 화면 뭐예요?" 류 질문이 검색에 걸리게 */
export function pageKbEntries(): KbEntry[] {
  return PAGE_MAP.map((p) => ({
    id: `page-${p.path.replace(/\//g, '_')}`,
    title: `[화면] ${p.name}`,
    summary: p.purpose,
    body: [
      `**${p.name}** (${p.path})`,
      '',
      p.purpose,
      '',
      p.howTo.length ? '**사용 순서**\n' + p.howTo.map((h) => `- ${h}`).join('\n') : '',
      p.pitfalls?.length ? '\n**여기서 자주 막히는 것**\n' + p.pitfalls.map((h) => `- ${h}`).join('\n') : '',
    ]
      .filter(Boolean)
      .join('\n'),
    tags: [p.name, ...p.name.split(/[\s()]+/).filter(Boolean), p.path],
    paths: [p.path],
    audience: p.audience,
    priority: 40,
    source: 'page',
    link: { label: `${p.name} 열기`, href: p.path },
  }));
}
