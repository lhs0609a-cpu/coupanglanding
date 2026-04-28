// ============================================================
// 조합형 문장 생성 엔진 (Fragment Composer)
//
// 원자적 문장 조각(openers × values × closers)을 시드 랜덤으로
// 조합하여 ContentBlock[]을 생성한다.
//
// 5-Layer 아키텍처:
//   L1: 원자적 조각 (persuasion-fragments.json)
//   L2: 중분류 변수풀 (story-templates.json 확장)
//   L3: 상품명 파서 (product-name-parser)
//   L4: SEO 키워드 위빙 (seo-keyword-resolver)
//   L5: 셀러 시드 차별화 (seeded-random)
// ============================================================

import fragmentData from '../data/persuasion-fragments.json';
import storyData from '../data/story-templates.json';
import v2TemplateData from '../data/story-templates-v2.json';
import { resolveContentProfile } from './content-profile-resolver';
import type { ContentProfile } from './content-profile-resolver';

// ─── 타입 (여기가 원본 — persuasion-engine에서 re-export) ──

export type ContentBlockType =
  | 'hook'
  | 'problem'
  | 'agitation'
  | 'solution'
  | 'benefits_grid'
  | 'social_proof'
  | 'comparison'
  | 'feature_detail'
  | 'usage_guide'
  | 'urgency'
  | 'cta';

export interface ContentBlock {
  type: ContentBlockType;
  content: string;
  subContent?: string;
  items?: string[];
  emphasis?: string;
}

interface FragmentPool {
  openers: string[];
  values: string[];
  closers: string[];
  emphases?: string[];
  titles?: string[];
  item_pool?: string[];
}

interface FrameworkDef {
  name: string;
  blocks: string[];
}

// ─── 데이터 로드 ─────────────────────────────────────────

const FRAGMENTS: Record<string, Record<string, FragmentPool>> =
  (fragmentData as Record<string, unknown>).fragments as Record<string, Record<string, FragmentPool>>;

const FRAMEWORKS: Record<string, FrameworkDef> =
  (fragmentData as Record<string, unknown>).frameworks as Record<string, FrameworkDef>;

const CATEGORY_FRAMEWORKS: Record<string, string[]> =
  (fragmentData as Record<string, unknown>).categoryFrameworks as Record<string, string[]>;

const VARIABLES: Record<string, Record<string, string[]>> =
  storyData.variables as Record<string, Record<string, string[]>>;

// 실제 쿠팡 중분류명 → VARIABLES 키 변환
// (real-review-composer.ts의 SUBCATEGORY_ALIASES와 동일)
const SUBCATEGORY_ALIASES: Record<string, string> = {
  '가전/디지털>TV/영상가전':'가전/디지털>영상가전','가전/디지털>계절환경가전':'가전/디지털>계절가전',
  '가전/디지털>냉장고/밥솥/주방가전':'가전/디지털>주방가전','가전/디지털>생활가전':'가전/디지털>청소가전',
  '가전/디지털>이미용건강가전':'가전/디지털>건강가전','가전/디지털>음향기기/이어폰/스피커':'가전/디지털>음향가전',
  '가전/디지털>컴퓨터/게임/SW':'가전/디지털>컴퓨터','가전/디지털>휴대폰/태블릿PC/액세서리':'가전/디지털>휴대폰',
  '가전/디지털>카메라/캠코더':'가전/디지털>카메라',
  '뷰티>남성화장품':'뷰티>스킨','뷰티>어린이화장품':'뷰티>스킨','뷰티>임산부화장품':'뷰티>스킨',
  '뷰티>선물세트':'뷰티>스킨','뷰티>뷰티소품':'뷰티>메이크업','뷰티>네일':'뷰티>네일','뷰티>향수':'뷰티>향수',
  '식품>가공/즉석식품':'식품>가공식품','식품>냉장/냉동식품':'식품>가공식품','식품>스낵/간식':'식품>가공식품',
  '식품>생수/음료':'식품>음료','식품>유제품/아이스크림/디저트':'식품>가공식품','식품>장/소스':'식품>가공식품',
  '식품>가루/조미료/향신료':'식품>가공식품','식품>커피/차':'식품>음료','식품>전통주':'식품>음료',
  '생활용품>세탁용품':'생활용품>세제','생활용품>청소용품':'생활용품>세제',
  '생활용품>방향/탈취/제습/살충':'생활용품>세제','생활용품>화장지/물티슈':'생활용품>욕실용품',
  '생활용품>구강/면도':'생활용품>욕실용품','생활용품>생리대/성인기저귀':'생활용품>욕실용품',
  '생활용품>건강용품':'생활용품>건강용품','생활용품>의료/간호용품':'생활용품>건강용품',
  '생활용품>조명/전기용품':'생활용품>수납/정리','생활용품>생활소품':'생활용품>수납/정리',
  '생활용품>생활잡화':'생활용품>수납/정리','생활용품>안전용품':'생활용품>수납/정리',
  '생활용품>공구':'생활용품>공구','생활용품>보수용품':'생활용품>공구',
  '생활용품>배관/건축자재':'생활용품>공구','생활용품>철물':'생활용품>공구',
  '생활용품>접착용품':'생활용품>공구','생활용품>방충용품':'생활용품>세제',
  '생활용품>도장용품':'생활용품>공구','생활용품>성인용품(19)':'생활용품>수납/정리',
  '패션의류잡화>남성패션':'패션의류잡화>남성의류','패션의류잡화>여성패션':'패션의류잡화>여성의류',
  '패션의류잡화>유니섹스/남녀공용 패션':'패션의류잡화>남성의류',
  '패션의류잡화>베이비 의류/신발/잡화(~24개월)':'패션의류잡화>아동의류',
  '패션의류잡화>영유아동 신발/잡화/기타의류(0~17세)':'패션의류잡화>아동의류',
  '패션의류잡화>주니어 의류(9~17세)':'패션의류잡화>아동의류',
  '패션의류잡화>키즈 의류(3~8세)':'패션의류잡화>아동의류',
  '가구/홈데코>가구':'가구/홈데코>가구','가구/홈데코>침구':'가구/홈데코>침대',
  '가구/홈데코>인테리어용품':'가구/홈데코>조명','가구/홈데코>인테리어자재':'가구/홈데코>조명',
  '가구/홈데코>카페트/매트':'가구/홈데코>소파','가구/홈데코>커튼/침장':'가구/홈데코>침대',
  '가구/홈데코>쿠션/방석':'가구/홈데코>소파','가구/홈데코>패브릭소품/커버':'가구/홈데코>소파',
  '가구/홈데코>원예/가드닝':'가구/홈데코>원예','가구/홈데코>금고':'가구/홈데코>소파',
  '가구/홈데코>수선/수예도구':'가구/홈데코>소파',
  '출산/유아동>기저귀/교체용품':'출산/유아동>기저귀','출산/유아동>분유/유아식품':'출산/유아동>분유',
  '출산/유아동>수유/이유용품':'출산/유아동>분유','출산/유아동>이유/유아식기':'출산/유아동>유아식품',
  '출산/유아동>유아목욕/스킨케어':'출산/유아동>유아스킨케어','출산/유아동>유아물티슈/캡/홀더':'출산/유아동>기저귀',
  '출산/유아동>유아위생/건강/세제':'출산/유아동>기저귀','출산/유아동>놀이매트/안전용품':'출산/유아동>유아식품',
  '출산/유아동>외출용품':'출산/유아동>외출용품','출산/유아동>유아가구/인테리어':'출산/유아동>외출용품',
  '출산/유아동>유아동침구':'출산/유아동>유아스킨케어','출산/유아동>임부용품':'출산/유아동>유아스킨케어',
  '출산/유아동>출산준비물/선물':'출산/유아동>외출용품',
  '스포츠/레져>헬스/요가':'스포츠/레져>헬스','스포츠/레져>등산':'스포츠/레져>캠핑',
  '스포츠/레져>자전거':'스포츠/레져>자전거','스포츠/레져>수영/수상스포츠':'스포츠/레져>수영',
  '스포츠/레져>낚시':'스포츠/레져>낚시','스포츠/레져>스키/겨울스포츠':'스포츠/레져>캠핑',
  '스포츠/레져>구기스포츠':'스포츠/레져>구기','스포츠/레져>라켓스포츠':'스포츠/레져>구기',
  '스포츠/레져>킥보드/스케이트':'스포츠/레져>자전거','스포츠/레져>발레/댄스/에어로빅':'스포츠/레져>헬스',
  '스포츠/레져>검도/격투/무술':'스포츠/레져>헬스','스포츠/레져>스포츠 신발':'스포츠/레져>헬스',
  '스포츠/레져>스포츠 잡화':'스포츠/레져>헬스','스포츠/레져>기타스포츠':'스포츠/레져>헬스',
  '스포츠/레져>심판용품':'스포츠/레져>구기','스포츠/레져>측정용품':'스포츠/레져>헬스',
  '스포츠/레져>철인3종경기':'스포츠/레져>헬스',
  '반려/애완용품>강아지 사료/간식/영양제':'반려/애완용품>강아지','반려/애완용품>강아지용품':'반려/애완용품>강아지',
  '반려/애완용품>강아지/고양이 겸용':'반려/애완용품>강아지','반려/애완용품>고양이 사료/간식/영양제':'반려/애완용품>고양이',
  '반려/애완용품>고양이용품':'반려/애완용품>고양이','반려/애완용품>관상어용품':'반려/애완용품>소동물',
  '반려/애완용품>햄스터/토끼/기니피그용품':'반려/애완용품>소동물','반려/애완용품>조류용품':'반려/애완용품>소동물',
  '반려/애완용품>파충류용품':'반려/애완용품>소동물','반려/애완용품>고슴도치용품':'반려/애완용품>소동물',
  '반려/애완용품>페럿용품':'반려/애완용품>소동물','반려/애완용품>장수풍뎅이/곤충용품':'반려/애완용품>소동물',
  '반려/애완용품>거북이/달팽이용품':'반려/애완용품>소동물','반려/애완용품>가축사료/용품':'반려/애완용품>소동물',
  '주방용품>조리용품':'주방용품>프라이팬','주방용품>취사도구':'주방용품>프라이팬',
  '주방용품>칼/가위/도마':'주방용품>칼/도마','주방용품>보관/밀폐용기':'주방용품>도시락',
  '주방용품>보온/보냉용품':'주방용품>도시락','주방용품>수저/컵/식기':'주방용품>식기',
  '주방용품>이유/유아식기':'주방용품>식기','주방용품>베이킹&포장용품':'주방용품>프라이팬',
  '주방용품>주방수납/정리':'주방용품>도시락','주방용품>주방일회용품':'주방용품>도시락',
  '주방용품>주방잡화':'주방용품>도시락','주방용품>커피/티/와인':'주방용품>식기',
  '주방용품>교자상/밥상/상커버':'주방용품>식기','주방용품>제기/제수용품':'주방용품>식기',
  '완구/취미>블록놀이':'완구/취미>레고/블록','완구/취미>보드게임':'완구/취미>보드게임',
  '완구/취미>퍼즐/큐브/피젯토이':'완구/취미>보드게임','완구/취미>인형':'완구/취미>인형',
  '완구/취미>역할놀이':'완구/취미>인형','완구/취미>로봇/작동완구':'완구/취미>RC/로봇',
  '완구/취미>RC완구/부품':'완구/취미>RC/로봇','완구/취미>STEAM/학습완구':'완구/취미>레고/블록',
  '완구/취미>프라모델':'완구/취미>레고/블록','완구/취미>피규어/다이캐스트':'완구/취미>레고/블록',
  '완구/취미>수집품':'완구/취미>레고/블록','완구/취미>악기/음향기기':'완구/취미>악기',
  '완구/취미>DIY':'완구/취미>레고/블록','완구/취미>신생아/영아완구':'완구/취미>인형',
  '완구/취미>물놀이/계절완구':'완구/취미>인형','완구/취미>스포츠/야외완구':'완구/취미>RC/로봇',
  '완구/취미>승용완구':'완구/취미>RC/로봇','완구/취미>실내대형완구':'완구/취미>인형',
  '완구/취미>마술용품':'완구/취미>보드게임',
  '자동차용품>세차/관리용품':'자동차용품>세차용품','자동차용품>공기청정/방향/탈취':'자동차용품>실내용품',
  '자동차용품>매트/시트/쿠션':'자동차용품>실내용품','자동차용품>실내용품':'자동차용품>실내용품',
  '자동차용품>실외용품':'자동차용품>실외용품','자동차용품>차량용디지털기기':'자동차용품>디지털기기',
  '자동차용품>차량용튜닝용품':'자동차용품>세차용품','자동차용품>램프/배터리/전기':'자동차용품>디지털기기',
  '자동차용품>비상/안전/차량가전':'자동차용품>디지털기기','자동차용품>오일/정비/소모품':'자동차용품>세차용품',
  '자동차용품>오토바이용품':'자동차용품>세차용품','자동차용품>타이어/휠/체인':'자동차용품>세차용품',
  '자동차용품>DIY/공구용품':'자동차용품>세차용품',
  '문구/오피스>문구/학용품':'문구/오피스>필기구','문구/오피스>사무용품':'문구/오피스>필기구',
  '문구/오피스>사무기기':'문구/오피스>필기구','문구/오피스>미술/화방용품':'문구/오피스>필기구',
};

// ─── 글로벌 다양성 메가풀 (모든 카테고리 closer/opener 다양성 폭증) ──
// 동일 종결어("확인하세요"·"경험하세요" 등)가 96만회 반복되는 문제를
// 시드 기반 선택의 폭을 80~150개로 키워 해결한다.
const GLOBAL_CTA_CLOSERS: string[] = [
  '오늘 한 번 들여다보실 가치가 있어요.','지금 한 번쯤 짚어볼 만합니다.','한 번 살펴두시면 분명 도움이 됩니다.',
  '둘러보시면 차이가 보일 거예요.','조용히 입소문을 타는 데는 이유가 있습니다.','정직한 만족감이 가장 큰 이유예요.',
  '직접 써보시면 굳이 설명이 필요 없어요.','쓸수록 손에 익는 그런 제품입니다.','한 번 들이면 바꾸기 어려운 게 이런 거죠.',
  '꾸준히 손이 가는 데에는 분명한 이유가 있습니다.','고민하셨다면 한 번쯤 시도해볼 만합니다.','선택지에 넣어두실 만한 가치는 충분합니다.',
  '저 같으면 이 가격에 망설이지 않겠습니다.','아래 정보 천천히 살펴보세요.','상세 사양 한 번 훑어보시는 걸 권합니다.',
  '더 자세한 내용은 본문에서 확인하실 수 있어요.','후회하지 않으실 선택이 됩니다.','써본 분들의 평이 가장 정직합니다.',
  '실사용자들의 평가가 좋은 이유가 분명히 있습니다.','한 번 사용해보시면 다음 구매도 자연스레 이어집니다.',
  '비슷해 보여도 막상 써보면 결이 다릅니다.','오래 두고 쓸 수 있는 선택이에요.','매일 손이 가는 그런 물건입니다.',
  '꼭 필요한 분께는 분명한 답이 됩니다.','과한 기대는 아니고, 적정한 만족이 핵심입니다.','광고보다 실사용기가 더 정직합니다.',
  '오래 고민하지 마시고 일단 둘러보세요.','지금 합리적인 선택지입니다.','평소처럼 쓰셔도 차이가 느껴지는 제품입니다.',
  '한 번 자리 잡으면 빠지지 않는 이유가 있어요.','꾸준히 찾는 분들이 많은 이유가 분명합니다.','사용해보면 자연스럽게 손이 가게 됩니다.',
  '필요한 순간에 빛을 발하는 그런 제품입니다.','사소해 보이지만 일상의 차이를 만듭니다.','조금 다른 선택이 일상을 바꿔줍니다.',
  '깊이 알아갈수록 제값이 보이는 제품입니다.','써보고 나서야 보이는 디테일이 있어요.','과장 없이, 있는 그대로의 만족입니다.',
  '소소하지만 확실한 만족이 핵심이에요.','첫인상보다 오래 쓸수록 점수가 올라가는 제품입니다.','부담 없이 시작해보셔도 좋은 선택이에요.',
  '여러 번 검토하실 필요는 없습니다.','지금 가장 합리적으로 접근할 수 있는 제품입니다.','선물로도 자기 사용으로도 두루 어울립니다.',
  '한 번의 선택이 일상을 가볍게 만듭니다.','적당한 가격에 정확한 효용을 주는 제품입니다.','써보시면 광고와 실제가 일치한다는 걸 알게 됩니다.',
  '꼭 비싼 게 답은 아니라는 걸 알려주는 제품이에요.','현재 가장 균형 잡힌 선택지 중 하나입니다.','잠깐의 검토가 긴 만족으로 이어집니다.',
  '너무 깊게 고민하지 않으셔도 됩니다.','막연했던 선택이 명확해지는 순간입니다.','그동안 미뤄두셨던 고민에 답이 됩니다.',
  '하루의 작은 차이를 만드는 일에 적합합니다.','이만한 무게감의 선택은 흔치 않습니다.','말없이 묵묵히 자기 역할 하는 제품이에요.',
];

const GLOBAL_CTA_OPENERS: string[] = [
  '솔직하게 말씀드리면','과장 없이 말하자면','한마디로 정리하면','결론부터 말씀드리면','사용해본 입장에서 말씀드리면',
  '지금 시점에서 보면','여러 옵션 검토해본 결과','시간 두고 살펴봐도','꾸준히 찾는 분들 얘기를 들어보면','시중 제품들과 비교해보면',
  '같은 가격대에서 보면','이 카테고리에서는','요즘 같은 분위기에서는','쓰는 사람 입장에서는','매장에서 직접 본 사람들 평이',
  '온라인 후기를 종합하면','오래 쓰신 분들 후기를 보면','첫 사용자 후기를 보면','꾸준한 재구매가 말해주듯','반복 구매율이 높은 이유를 보면',
  '계절이 바뀌어도','일상에서 자주 쓰는 입장에서','가성비를 따지는 분들에게도','품질을 우선하시는 분들에게도','선물용으로 알아보시는 분들에게도',
  '이리저리 살펴보면','전체적으로 보면','조금 들여다보면','자세히 비교해보면','시간이 지나도',
  '쓰던 것과 비교해보면','새로 들이실 거라면','대체할 만한 것이 마땅치 않으니','한 단계 업그레이드 차원에서','평소 쓰시던 흐름에 더해',
  '필요한 시점이라면','지금 같은 환경이라면','매일 쓰는 만큼','일상 루틴 속에서','잘 알려지진 않았지만',
  '과거에 비해 훨씬 다듬어진','업그레이드된 사양으로','신중하게 고른 만큼','구매 전 한 번 더 검토하실 분들에게도','경험상 봤을 때',
];

const GLOBAL_HOOK_OPENERS: string[] = [
  '의외로 모르고 지나치는 부분이','일상에서 자주 마주하는 순간이','한 번쯤 고민해보셨을 만한 주제가','평소엔 무심코 넘기던 디테일이','요즘 들어 자주 화제가 되는 부분이',
  '비슷한 듯 다른 차이가','놓치기 쉬운 작은 디테일이','꾸준히 입소문이 도는 이유가','조용히 자리 잡은 그런 선택이','뜻밖의 만족을 주는 순간이',
  '오래 쓸수록 진가가 드러나는 부분이','첫인상은 평범해도 쓸수록 다른','광고보다 실제가 나은 그런 제품','쓰는 사람만 아는 만족이','매일 손이 가는 그 이유가',
  '큰 변화는 아니지만 분명한 차이가','사소해 보여도 무시 못 할 영향이','당연하게 여겼던 것이 사실은 아니라는','요즘 다시 주목받는 카테고리가','꾸준히 사랑받는 데에는 이유가',
  '한 번 자리 잡으면 빠지지 않는','쓰는 사람마다 결을 달리하는','오래된 표준에 작은 변화가','새로 등장한 옵션이 흥미로운','믿고 쓰는 분들이 늘어나는',
  '시즌이 바뀔 때 떠오르는','계절감을 살리는 데 안성맞춤인','매일의 루틴에 자연스럽게 녹아드는','이 정도 가격에 이런 품질이라니','경험해보지 않으면 모르는',
];

const GLOBAL_HOOK_CLOSERS: string[] = [
  '한 번쯤 짚고 넘어갈 만합니다.','조금만 들여다보면 답이 보입니다.','막상 따져보면 어렵지 않은 문제입니다.','검토할 가치가 충분합니다.','자세히 살펴볼 만합니다.',
  '눈여겨볼 부분이 있습니다.','얘기 나눌 만한 주제가 됩니다.','사실 알고 보면 꽤 흥미롭습니다.','단순한 듯 보여도 꽤 깊이가 있습니다.','일상의 작은 차이를 만들어요.',
  '결국 핵심은 디테일입니다.','쓰면서 점점 분명해집니다.','꾸준히 손이 가게 되는 이유가 있습니다.','시간이 지나도 변하지 않는 가치가 있어요.','선택은 결국 사용자의 몫입니다.',
  '관심 있으신 분께는 의미가 있습니다.','한 번쯤 진지하게 살펴볼 만합니다.','대충 넘어가기엔 아까운 부분입니다.','꾸준히 입소문이 나는 데는 이유가 있어요.','예상보다 만족도가 높은 이유가 있습니다.',
  '겪어보면 더 잘 와닿습니다.','선택의 기준이 점점 명확해집니다.','괜한 호들갑이 아니었음이 드러납니다.','왜 권하는지 직접 알게 됩니다.','자연스럽게 답이 나옵니다.',
  '의외로 자세히 보면 매력이 보입니다.','첫인상이 점점 바뀌는 이유가 있어요.','짚어볼수록 깊이가 보입니다.','조용히 기억에 남는 그런 부분입니다.','막연했던 게 명확해집니다.',
  '한 줄로 요약하기 어려운 매력이 있습니다.','한 번 들이면 다시 안 찾기 어려워요.','사소해 보여도 꽤 큰 차이로 이어집니다.','지금 시점에서 한 번 정리해볼 가치가 있습니다.','계속 보고 있게 되는 이유가 있어요.',
  '본격적으로 비교하면 더 분명합니다.','처음에는 평범해 보여도 다릅니다.','놓치기 쉬운 디테일이 있습니다.','자세히 들여다볼수록 점수가 올라갑니다.','단순함 속에 신경 쓴 흔적이 보여요.',
  '익숙해지면 빠지는 그런 매력입니다.','한 발 떨어져서 봐도 매력이 있어요.','시간이 지나도 만족이 이어집니다.','모르고 지나치기엔 아까운 부분입니다.','한 번쯤 비교군에 넣어볼 만합니다.',
  '천천히 살펴보면 답이 보입니다.','지금이 결정 타이밍입니다.','괜찮은 선택지로 자리 잡고 있어요.','관심을 두면 더 잘 보입니다.','조용히 평가가 좋아지는 중입니다.',
  '한 번 자리잡으면 빠지지 않습니다.','꾸준한 사랑은 이유가 있습니다.','입문용으로도 무난한 선택입니다.','오래 쓰는 사람이 늘고 있어요.','지금 검토하기 좋은 시점입니다.',
  '평이 점점 좋아지고 있습니다.','일상에 자연스럽게 자리합니다.','사용 만족이 후기에 정직하게 드러납니다.','꾸밈없는 만족이 더 신뢰가 갑니다.','평범 속에 깊이가 있어요.',
  '비교 후에 다시 돌아오는 분들이 많습니다.','막상 써보면 첫인상보다 좋습니다.','선입견을 깨는 제품 중 하나입니다.','선택지에 한 번쯤 올려볼 만해요.','지금 가장 합리적인 옵션입니다.',
];

const GLOBAL_FEATURE_CLOSERS: string[] = [
  '디테일이 살아있습니다.','마감이 깔끔합니다.','제값을 합니다.','과하지 않게 잘 다듬어졌습니다.','꼭 필요한 부분에 신경 썼습니다.',
  '실용성이 우선입니다.','균형이 잘 잡혀있습니다.','사용감이 자연스럽습니다.','일상에 잘 녹아듭니다.','오래 쓰기 좋은 구성입니다.',
  '디자인과 기능이 균형감 있습니다.','과장이 없는 설계입니다.','쓰는 사람을 배려한 구조입니다.','복잡하지 않게 정리됐습니다.','필요한 만큼만 더했습니다.',
  '꾸준한 만족을 줍니다.','시간이 지나도 만족도가 유지됩니다.','써보시면 차이가 느껴집니다.','겉만 봐서는 모를 디테일이 있어요.','쓰는 사람의 손에 맞게 다듬어졌습니다.',
  '편의를 우선한 구성이에요.','보이지 않는 부분까지 챙겼습니다.','꼼꼼한 마감이 인상적입니다.','단단한 만듦새가 느껴집니다.','오래 두고 쓰기 좋습니다.',
  '쓸수록 손에 익는 그립감입니다.','버리는 부분 없이 정리된 구성이에요.','오래 써도 처짐이 적습니다.','잡았을 때 안정감이 있어요.','마감이 거칠지 않습니다.',
  '소재 선택이 신중해 보입니다.','견고함이 우선된 설계예요.','자주 쓰는 부분에 힘을 실었습니다.','과한 기능보다 충실한 본질이 강점입니다.','사용 빈도를 고려한 배치입니다.',
  '필요한 동작에만 집중한 구조입니다.','여유 있는 두께감이 안정감을 줍니다.','체감 무게가 적당합니다.','한 손 사용성도 괜찮습니다.','반복 사용에 따른 마모가 적습니다.',
  '단순한 외관 뒤에 정교한 설계가 있습니다.','보관 시 차지하는 공간을 줄였어요.','휴대성과 안정성을 동시에 챙겼습니다.','오래 두고 봐도 질리지 않는 디자인입니다.','디자인보다 기능이 먼저인 제품입니다.',
  '정리된 라인이 깔끔한 인상을 줍니다.','겉과 속이 모두 단정합니다.','직관적인 사용 흐름이 마음에 들어요.','자잘한 손맛까지 챙긴 만듦새입니다.','사소한 부분의 완성도가 높습니다.',
  '쓰면서 느껴지는 안정감이 있어요.','차분한 컬러감이 어디든 잘 어울립니다.','거치 안정성도 좋습니다.','조립 정밀도가 높습니다.','조작 피드백이 명확합니다.',
  '구성 품목이 군더더기 없습니다.','부속이 단단히 맞물립니다.','오래 사용해도 흔들림이 적어요.','떨어뜨려도 충격을 잘 견디는 설계입니다.','수납 시 형태가 잘 유지됩니다.',
  '결합부가 헐겁지 않습니다.','관리 부담이 적습니다.','외관에 잘 묻지 않는 마감입니다.','지속력이 좋다는 평이 많습니다.','오래 써도 첫인상이 유지됩니다.',
  '잘 다듬어진 모서리 처리가 마음에 들어요.','만듦새의 차이가 점점 보입니다.','사용감이 한결같습니다.','피로감을 줄이는 설계가 인상적입니다.','쥐는 손에 부담이 적어요.',
  '잡티 없는 마감이 깔끔합니다.','시각적으로도 정돈된 인상입니다.','구성품이 빠지는 게 없습니다.','사용 흐름에 자연스럽게 녹아듭니다.','일상의 작은 불편을 잘 잡아줍니다.',
];

// 시드 기반 N개 추출 (중복 없이)
function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  if (arr.length === 0) return [];
  if (arr.length <= n) return [...arr];
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < arr.length) {
    const i = Math.floor(rng() * arr.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i]);
  }
  return out;
}

/**
 * 카테고리 풀에 글로벌 다양성 풀을 시드 기반으로 주입한다.
 * 모든 카테고리에 동일 종결어가 박히는 문제를 해결.
 */
function injectGlobalDiversity(
  pool: FragmentPool,
  blockType: string,
  rng: () => number,
): FragmentPool {
  // blockType별 글로벌 풀 매핑
  let globalCloser: string[] = [];
  let globalOpener: string[] = [];
  switch (blockType) {
    case 'cta':
      globalCloser = GLOBAL_CTA_CLOSERS;
      globalOpener = GLOBAL_CTA_OPENERS;
      break;
    case 'hook':
      globalOpener = GLOBAL_HOOK_OPENERS;
      globalCloser = GLOBAL_HOOK_CLOSERS;
      break;
    case 'feature_detail':
      globalCloser = GLOBAL_FEATURE_CLOSERS;
      break;
    case 'solution':
    case 'social_proof':
    case 'usage_guide':
      globalCloser = GLOBAL_HOOK_CLOSERS;
      globalOpener = GLOBAL_HOOK_OPENERS;
      break;
    default:
      break;
  }
  // 시드 기반으로 글로벌 풀에서 12개 골라 카테고리 풀에 추가
  // — 시드별로 다른 12개가 선택되므로 다양성 폭증
  const addCloser = pickN(globalCloser, 12, rng);
  const addOpener = pickN(globalOpener, 12, rng);
  return {
    ...pool,
    openers: [...(pool.openers || []), ...addOpener],
    closers: [...(pool.closers || []), ...addCloser],
  };
}

// ─── Layer 2: 계층적 조각 풀 해석 ───────────────────────

/**
 * blockType × categoryPath → 가장 구체적인 FragmentPool 반환.
 * 소분류→중분류→대분류→DEFAULT 폴백.
 */
export function resolveFragments(
  blockType: string,
  categoryPath: string,
): FragmentPool {
  const blockFragments = FRAGMENTS[blockType];
  if (!blockFragments) {
    return { openers: [], values: [], closers: [] };
  }

  // 1. 정확 매칭
  if (blockFragments[categoryPath]) return blockFragments[categoryPath];

  // 2. 뒤에서부터 줄여가며 매칭
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (blockFragments[key]) return blockFragments[key];
  }

  // 3. 대분류 부분 매칭
  const top = parts[0];
  for (const key of Object.keys(blockFragments)) {
    if (key === top || key.startsWith(top + '>')) {
      return blockFragments[key];
    }
  }

  // 4. DEFAULT
  return blockFragments['DEFAULT'] || { openers: [], values: [], closers: [] };
}

// ─── Layer 2: 계층적 변수풀 해석 ────────────────────────

/**
 * categoryPath에서 가장 구체적인 변수풀을 반환.
 *
 * CPG 프로필 존재 시 → 격리된 변수풀만 반환 (상위 병합 없음, 오염 방지)
 * CPG 없으면 → 레거시: 중분류→대분류→DEFAULT 폴백.
 */
export function resolveVariables(
  categoryPath: string,
  categoryCode?: string,
): Record<string, string[]> {
  // ── CPG 프로필 우선 참조 (격리된 변수풀) ──
  const profile = resolveContentProfile(categoryPath, categoryCode);
  if (profile && profile.variables && Object.keys(profile.variables).length > 0) {
    // 격리! DEFAULT/대분류 병합 없이 프로필 변수만 반환
    return { ...profile.variables };
  }

  // ── 레거시 로직 (미매핑 카테고리) ──
  return legacyResolveVariables(categoryPath);
}

/**
 * 레거시 변수풀 해석 — CPG 미매핑 카테고리용.
 * 중분류→대분류→DEFAULT 폴백. 상위 변수를 하위가 오버라이드(prepend).
 */
function legacyResolveVariables(categoryPath: string): Record<string, string[]> {
  const parts = categoryPath.split('>').map(p => p.trim());

  // 대분류 키 추론 (getCategoryKey 로직 인라인)
  const topKey = inferTopCategory(parts[0] || '', categoryPath);

  // 기본 변수풀: DEFAULT → 대분류
  const base = { ...(VARIABLES['DEFAULT'] || {}) };
  const topVars = VARIABLES[topKey];
  if (topVars) {
    for (const [k, v] of Object.entries(topVars)) {
      base[k] = v;
    }
  }

  // 중분류 변수풀 오버라이드 (있으면 prepend)
  // 실제 쿠팡 경로명을 SUBCATEGORY_ALIASES로 변환 후 조회
  for (let len = 2; len <= parts.length; len++) {
    const rawSubKey = parts.slice(0, len).join('>');
    const subKey = SUBCATEGORY_ALIASES[rawSubKey] || rawSubKey;
    const subVars = VARIABLES[subKey];
    if (subVars) {
      for (const [k, v] of Object.entries(subVars)) {
        if (base[k]) {
          // prepend: 중분류 값이 앞에, 대분류 값이 뒤에
          const merged = [...v];
          for (const existing of base[k]) {
            if (!merged.includes(existing)) merged.push(existing);
          }
          base[k] = merged;
        } else {
          base[k] = v;
        }
      }
    }
  }

  return base;
}

/**
 * CPG 프로필 객체 조회 (persuasion-engine에서 forbiddenTerms 접근용)
 */
export function getContentProfile(
  categoryPath: string,
  categoryCode?: string,
): ContentProfile | null {
  return resolveContentProfile(categoryPath, categoryCode);
}

function inferTopCategory(top: string, full: string): string {
  const fl = full.toLowerCase();

  // ── Phase 1: top 세그먼트 강한 매칭 (우선) ──
  // 반려 경로에 "분유" 가 있으면 출산으로 오분류되던 버그 방지:
  // top.includes() 가 fl.includes() 서브스트링보다 항상 우선한다.
  if (top.includes('반려') || top.includes('애완')) return '반려/애완용품';
  if (top.includes('출산') || top.includes('유아')) return '출산/유아동';
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코')) return '가구/홈데코';
  if (top.includes('스포츠') || top.includes('레져')) return '스포츠/레져';
  if (top.includes('주방')) return '주방용품';
  if (top.includes('문구') || top.includes('사무') || top.includes('오피스')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미')) return '완구/취미';
  if (top.includes('자동차')) return '자동차용품';
  if (top.includes('도서')) return '도서';

  // ── Phase 2: 경로 전체 서브스트링 fallback (top이 일반명사인 경우) ──
  if (fl.includes('사료') || fl.includes('고양이') || fl.includes('강아지')) return '반려/애완용품';
  if (fl.includes('세제') || fl.includes('욕실') || fl.includes('수납')) return '생활용품';
  if (fl.includes('컴퓨터') || fl.includes('영상')) return '가전/디지털';
  if (fl.includes('신발') || fl.includes('가방')) return '패션의류잡화';
  if (fl.includes('침대') || fl.includes('소파') || fl.includes('인테리어')) return '가구/홈데코';
  if (fl.includes('기저귀') || fl.includes('분유')) return '출산/유아동';
  if (fl.includes('헬스') || fl.includes('골프') || fl.includes('캠핑')) return '스포츠/레져';
  if (fl.includes('프라이팬') || fl.includes('냄비') || fl.includes('식기')) return '주방용품';
  if (fl.includes('필기') || fl.includes('노트')) return '문구/오피스';
  if (fl.includes('퍼즐') || fl.includes('보드게임')) return '완구/취미';
  if (fl.includes('블랙박스') || fl.includes('세차')) return '자동차용품';
  return 'DEFAULT';
}

// ─── L1 (대분류) 크로스카테고리 금지어 안전망 ───────────
// CPG 프로필의 forbiddenTerms가 비어있을 때 L1 레벨 금지어를 자동 적용.
// 자동차용품에 "면역력" 같은 건강식품 변수가 섞이는 등 크로스카테고리 오염 방지.
const L1_FORBIDDEN_TERMS: Record<string, string[]> = {
  // ─ 뷰티: 식품/자동차/공구/반려/기저귀 등 차단
  '뷰티': ['세차','광택','발수','토크','절단력','복용','1정','논스틱','인덕션','프라이팬','필기감','타이어','브레이크','노트북','냉장고','세탁기','에어컨','강아지','고양이','사료','기저귀','분유','한우','삼겹살','김치찌개','건강기능식품','영양제','1캡슐'],
  // ─ 식품: 뷰티/가전/공구/자동차 등 차단
  '식품': ['세차','광택','발수','코팅','필기감','토크','절단력','드릴','논스틱','인덕션','프라이팬','세정력','탈취','살균','크림','에센스','세럼','토너','샴푸','린스','마스크팩','립스틱','파운데이션','마스카라','기저귀','타이어','브레이크','노트북','자동차','소파','냉장고','세탁기','강아지','고양이','사료'],
  // ─ 생활용품: 건강식품/뷰티/자동차/의류 등 차단
  '생활용품': ['면역력','섭취','복용','영양제','건강기능식품','세차','광택','발수','1정','캡슐','정제','필기감','크림','에센스','립스틱','마스카라','타이어','브레이크','노트북','김치','된장','한우','파운데이션','소파','침대','강아지사료','고양이사료','기저귀','오메가3','홍삼','유산균'],
  // ─ 가전/디지털: 건강식품/뷰티/식재료/반려/의류 등 차단
  '가전/디지털': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','소파','침대','타이어','브레이크'],
  // ─ 패션의류잡화: 뷰티/식품/반려/자동차/가전 등 차단
  '패션의류잡화': ['면역력','섭취','복용','세차','광택','발수','토크','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','냉장고','세탁기','타이어','소파','침대','기저귀'],
  // ─ 가구/홈데코: 건강식품/뷰티/식재료/자동차/반려 등 차단
  '가구/홈데코': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','토크','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','타이어','브레이크','기저귀'],
  // ─ 출산/유아동: 반려/자동차/건강식품/뷰티성분/가구 등 차단
  '출산/유아동': ['세차','광택','발수','토크','절단력','드릴','1정','필기감','강아지','고양이','사료','립스틱','마스카라','오메가3','홍삼','한우','삼겹살','타이어','브레이크','노트북','소파','침대','크림','에센스','세럼','샴푸','김치'],
  // ─ 스포츠/레져: 뷰티/식품/반려/가전/자동차 등 차단 (자전거는 타이어 예외 필요 — 개별 서브카테고리에서 처리)
  '스포츠/레져': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','파운데이션','샴푸','기저귀','소파','냉장고','세탁기'],
  // ─ 주방용품: 건강식품/반려/자동차/뷰티/의류 등 차단
  '주방용품': ['면역력','섭취','복용','영양제','건강기능식품','세차','필기감','토크','1정','캡슐','정제','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','브레이크','소파','침대'],
  // ─ 반려/애완용품: 건강식품 효과명/뷰티/가구/자동차/출산 등 강력 차단
  '반려/애완용품': ['면역력','섭취','복용','세차','광택','발수','1정','필기감','토크','크림','에센스','립스틱','마스카라','파운데이션','오메가3','오메가-3','유산균','프로바이오틱스','글루코사민','콘드로이틴','홍삼','비타민','영양제','건강기능식품','피부탄력','혈관건강','혈행개선','중성지방','장건강','간건강','뼈건강','눈건강','인지능력','피부미백','주름개선','모발윤기','탈모예방','김치','된장','한우','파운데이션','기저귀','분유','타이어','브레이크','노트북','소파','침대','냉장고','세탁기','HACCP','GMP'],
  // ─ 완구/취미: 건강식품/뷰티/반려/식품/자동차용품(차량) 등 차단 (장난감 타이어는 "미니카/RC" 맥락 허용 — 개별 처리)
  '완구/취미': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','논스틱','인덕션','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','소파','침대','냉장고','세탁기','브레이크'],
  // ─ 자동차용품: 건강식품/뷰티/반려/식품/가전/의류 등 강력 차단 ("카샴푸"는 예외지만 "샴푸" 단독으로는 오염으로 간주)
  '자동차용품': ['면역력','섭취','복용','영양제','건강기능식품','피부탄력','장건강','뼈건강','관절건강','혈관건강','혈행개선','1정','캡슐','정제','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','기저귀','분유','소파','침대','냉장고','세탁기'],
  // ─ 문구/오피스: 기존 + 뷰티/반려/식품 차단 강화
  '문구/오피스': ['면역력','섭취','복용','세차','광택','세정력','탈취','살균','1정','영양제','건강기능식품','토크','드릴','논스틱','인덕션','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','소파','침대'],
  // ─ 도서: 생필/뷰티/식품 등 차단 (책은 내용어 자체가 자유로움)
  '도서': ['세차','광택','발수','토크','절단력','드릴','1정','강아지사료','고양이사료','오메가3','홍삼','립스틱','크림','에센스','샴푸','기저귀','타이어','브레이크','냉장고','세탁기','파운데이션'],
};

/**
 * categoryPath에서 L1 대분류를 추출하여 해당 L1의 금지어를 반환.
 * CPG 프로필의 forbiddenTerms가 비어있을 때 안전망으로 사용된다.
 */
function getL1ForbiddenTerms(categoryPath: string): string[] {
  if (!categoryPath) return [];
  const top = (categoryPath.split('>')[0] || '').trim();
  return L1_FORBIDDEN_TERMS[top] || [];
}

// ─── v2 완성문 템플릿 뱅크 ────────────────────────────────
// v1 조각조합 엔진의 주술호응 버그/부자연스러운 연결을 차단하기 위해
// 카테고리별로 사전 생성된 완성 문장 템플릿을 우선 사용한다.
// 슬롯({product}, {효과1} 등)만 치환하면 자연스러운 한국어가 나오도록 작성됨.

interface V2BenefitsGrid {
  titles: string[];
  items: string[];
}

interface V2CategoryTemplates {
  hook?: string[];
  problem?: string[];
  agitation?: string[];
  solution?: string[];
  feature_detail?: string[];
  benefits_grid?: V2BenefitsGrid;
  social_proof?: string[];
  comparison?: string[];
  usage_guide?: string[];
  urgency?: string[];
  cta?: string[];
}

const V2_TEMPLATES: Record<string, V2CategoryTemplates> =
  (v2TemplateData as { templates: Record<string, V2CategoryTemplates> }).templates;

// ─── v2 통문장 글로벌 다양성 풀 ──
// 카테고리 무관하게 자연스러운 변형이 가능한 완성문장.
// "한 번 입어본 분이 색깔 바꿔..." 같은 단일 통문장 5만회 폭주를 막기 위해
// blockType별 글로벌 풀을 시드 기반으로 v2 풀에 추가한다.
const V2_GLOBAL_FRAGMENTS: Record<string, string[]> = {
  hook: [
    '{product}을 들이고 나서 일상이 살짝 정돈된 느낌이에요.','{product}, 처음 봤을 땐 평범해 보였는데 쓸수록 다르더라고요.',
    '{product}은 무난해 보여서 오히려 손이 자주 가는 그런 제품이에요.','요즘 잘 골랐다 싶은 게 {product}입니다.',
    '{product}, 사놓고 잘 안 쓰면 어쩌나 했는데 매일 손이 가요.','{product}을 쓴 지 얼마 안 됐는데 벌써 익숙해졌어요.',
    '{product}은 한 번 자리 잡으면 빠지지 않을 것 같아요.','지인 추천으로 {product} 알게 됐는데 잘 권해줬다 싶어요.',
    '{product}에 대한 첫인상이 점점 바뀌고 있어요.','{product}은 광고보다 실제가 더 나은 케이스 같아요.',
    '쓰는 순간 ‘이거다’ 싶었던 게 {product}이에요.','{product}은 부담 없이 시작하기 좋은 선택이었어요.',
    '{product}을 만난 뒤로는 검색 횟수가 부쩍 줄었어요.','{product}, 비교 끝에 결국 여기로 정착했습니다.',
    '한참 둘러보다 {product}으로 마음이 기울었어요.','꼼꼼히 따져보고 고른 {product}, 후회가 없네요.',
    '{product}은 첫 사용부터 손에 익는 그런 느낌이었어요.','{product}, 군더더기 없는 사용감이 마음에 듭니다.',
    '오래 망설인 끝에 {product}을 들였는데 잘한 선택이었어요.','{product}, 막상 써보니 ‘이거였구나’ 싶었어요.',
    '{product}을 쓰니 기존에 쓰던 게 어색해질 정도예요.','{product}은 ‘딱 이만큼이 좋다’를 잘 보여주는 제품이에요.',
  ],
  problem: [
    '비슷한 카테고리 제품을 여럿 써봤지만 늘 어딘가 부족했어요.','선택지는 많은데 막상 결정하기는 어려웠습니다.',
    '브랜드만 봐서는 차이를 알기 힘든 게 이 카테고리예요.','가격대만 따라가다 보면 만족도와 멀어지더라고요.',
    '꼼꼼히 비교해도 답이 안 보일 때가 많았어요.','자주 쓰는 만큼 작은 불편이 쌓이면 스트레스가 됐어요.',
    '한 번 잘못 사면 한참 후회하게 되는 카테고리이기도 합니다.','광고만 보고는 실제 사용감을 가늠하기 어려웠어요.',
    '비슷한 가격대인데 사용감 차이는 의외로 컸습니다.','그동안 ‘대충 이 정도면 됐지’ 하고 타협한 게 많았어요.',
  ],
  solution: [
    '{product}은 그런 고민을 의외로 깔끔하게 정리해줍니다.','{product}은 ‘적당히’가 아니라 ‘딱 맞게’를 지향하는 제품이에요.',
    '복잡한 비교보다 직접 써보는 게 빠른데, {product}은 그 첫 후보가 되기 좋아요.','{product}이 만드는 차이는 거창하지는 않지만 분명합니다.',
    '한 번 써보시면 왜 입소문이 나는지 자연스럽게 이해되실 거예요.','{product}은 과한 마케팅보다 실사용 경험에 무게를 둔 제품이에요.',
    '{product}은 매일 쓰는 흐름에 자연스럽게 끼어드는 제품입니다.','단순히 사양만 좋은 게 아니라 사용자 입장에서 다듬어진 제품이에요.',
    '{product}은 ‘무리 없이 만족할 만한 선택’이 무엇인지 보여줍니다.','자주 쓸수록 만족도가 올라가는 그런 제품이에요.',
  ],
  feature_detail: [
    '눈에 잘 띄지 않는 부분까지 다듬은 흔적이 보입니다.','마감 디테일에 신경 쓴 흔적이 손끝에서 느껴져요.',
    '오래 사용해도 처음 같은 사용감을 유지하도록 설계됐습니다.','꼭 필요한 부분에 정확히 힘을 준 구성이에요.',
    '소재와 구조의 균형이 잘 맞춰져 있어요.','과한 장식 없이 본질에 충실한 디자인입니다.',
    '쓰는 동안 작은 불편을 줄여주는 디테일이 곳곳에 있어요.','꺼내자마자 바로 쓸 수 있도록 설계된 점이 좋습니다.',
    '구성은 단순하지만 그 안의 완성도가 높아요.','오래 두고 쓰기 좋은 견고한 만듦새가 인상적입니다.',
  ],
  social_proof: [
    '꾸준한 재구매가 이 제품의 정직한 평가입니다.','후기 분포가 한쪽으로 쏠리지 않고 골고루 좋은 게 신뢰감을 줍니다.',
    '오랜 사용자 비중이 높다는 건 그만큼 만족도가 높다는 뜻입니다.','입문자도 숙련자도 비슷하게 만족하는 제품이에요.',
    '추천으로 이어지는 구매 패턴이 인상적입니다.','‘다음에도 이걸로 살 거예요’ 같은 후기가 많은 게 핵심입니다.',
    '비교 후기가 많을수록 제품의 자신감이 보입니다.','조용히 자리 잡은 베스트셀러라는 표현이 어울려요.',
    '리뷰의 톤이 과장되지 않고 차분한 만족감 위주입니다.','솔직 후기일수록 점수가 높은 패턴이 보입니다.',
  ],
  comparison: [
    '비슷한 가격대에서 비교해보면 균형감이 도드라집니다.','상위 라인업과 비교해도 사용감 차이가 크지 않습니다.',
    '특정 부분에서는 오히려 더 나은 경우도 적지 않습니다.','구성과 가격을 함께 보면 합리적인 위치입니다.',
    '동급에서 ‘이만하면 잘 만들었다’는 평가가 많습니다.','단점이 거의 보고되지 않는 게 가장 큰 강점입니다.',
    '비교 영상이나 후기에서 자주 추천되는 모델이에요.','대체할 만한 다른 선택지가 마땅치 않다는 평이 많습니다.',
  ],
  usage_guide: [
    '꾸준히 쓰는 게 가장 쉬운 활용법입니다.','특별한 노하우 없이도 자연스럽게 쓸 수 있도록 설계됐어요.',
    '처음 사용 시에도 별도 적응 기간이 필요하지 않아요.','매일 같은 시간대에 사용하면 효과가 더 잘 보입니다.',
    '한꺼번에 많이 쓰기보다 꾸준히 사용하는 걸 권합니다.','관리만 잘하면 오래 쓸 수 있어요.',
    '보관도 어렵지 않아 일상에서 자연스럽게 사용 가능합니다.','조작이 단순해 누구나 바로 쓸 수 있습니다.',
  ],
  urgency: [
    '재고가 빨리 소진되는 시기에는 미리 챙겨두시는 편이 좋아요.','이런 가격대로 만나기 어려운 구성입니다.',
    '시즌이 지나면 비슷한 가격대 옵션을 찾기 어려울 수 있어요.','지금 시점이 가장 합리적으로 접근할 수 있는 타이밍이에요.',
    '한 번 빠지면 채워지기까지 시간이 걸리는 제품입니다.','수요가 늘 때마다 들어오기 무섭게 빠지는 모델입니다.',
  ],
  cta: [
    '필요한 분께 분명한 가치를 드립니다.','오랜 검색 끝에 답이 될 수 있는 제품입니다.',
    '한 번의 선택이 일상의 작은 차이를 만듭니다.','꼼꼼히 살피셨다면 이제 결정만 남았습니다.',
    '망설이실 이유가 적은 옵션입니다.','정직한 만족을 원하셨다면 이 선택이 답입니다.',
    '검색 마무리하시기에 좋은 시점이에요.','선택 후 후회가 적은 제품이라는 점이 가장 큰 강점입니다.',
  ],
};

/**
 * categoryPath에서 가장 구체적인 v2 템플릿 뱅크를 반환한다.
 * 정확 매칭 → SUBCATEGORY_ALIASES 변환 → 부모 경로 폴백. 없으면 null.
 */
function resolveV2CategoryTemplates(categoryPath: string): V2CategoryTemplates | null {
  if (!categoryPath) return null;

  // 1. 정확 매칭
  if (V2_TEMPLATES[categoryPath]) return V2_TEMPLATES[categoryPath];

  // 2. 별칭 매칭
  const aliased = SUBCATEGORY_ALIASES[categoryPath];
  if (aliased && V2_TEMPLATES[aliased]) return V2_TEMPLATES[aliased];

  // 3. 부모 경로 폴백
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (V2_TEMPLATES[key]) return V2_TEMPLATES[key];
    const aliasedKey = SUBCATEGORY_ALIASES[key];
    if (aliasedKey && V2_TEMPLATES[aliasedKey]) return V2_TEMPLATES[aliasedKey];
  }

  return null;
}

/**
 * v2 템플릿으로 ContentBlock 생성 시도.
 * 템플릿 존재 시 블록 반환, 없으면 null (호출부에서 v1 로직 폴백).
 */
function composeFromV2Templates(
  blockType: ContentBlockType,
  categoryPath: string,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
  forbiddenTerms?: string[],
): ContentBlock | null {
  const catTemplates = resolveV2CategoryTemplates(categoryPath);
  if (!catTemplates) return null;

  const effectiveForbidden = (forbiddenTerms && forbiddenTerms.length > 0)
    ? forbiddenTerms
    : getL1ForbiddenTerms(categoryPath);

  const filterOut = (arr: string[]): string[] => {
    if (effectiveForbidden.length === 0) return arr;
    const filtered = arr.filter(s => !effectiveForbidden.some(t => s.includes(t)));
    return filtered.length > 0 ? filtered : arr;
  };

  // benefits_grid — titles + items 구조
  if (blockType === 'benefits_grid') {
    const grid = catTemplates.benefits_grid;
    if (!grid || !grid.titles || !grid.items) return null;
    if (grid.titles.length === 0 || grid.items.length === 0) return null;

    const titles = filterOut(grid.titles);
    const items = filterOut(grid.items);

    const titleTpl = titles[Math.floor(rng() * titles.length)];
    const title = fillTemplate(titleTpl, vars, productName, rng);

    const selectedItems = selectDistinct(items, 5, rng);
    const filledItems = selectedItems.map(item => {
      let filled = fillTemplate(item, vars, productName, rng);
      if (filled.includes('{seo_keyword}') && seoKeywords.length > 0) {
        filled = filled.replace(
          /\{seo_keyword\}/g,
          seoKeywords[Math.floor(rng() * seoKeywords.length)],
        );
      }
      return filled;
    });

    return { type: blockType, content: title, items: filledItems };
  }

  // 문자열 기반 블록 — hook/problem/agitation/solution/feature_detail/social_proof/comparison/usage_guide/urgency/cta
  const key = blockType as Exclude<ContentBlockType, 'benefits_grid'>;
  const rawTemplates = catTemplates[key];
  if (!rawTemplates || !Array.isArray(rawTemplates) || rawTemplates.length === 0) {
    return null;
  }

  // ── v2 글로벌 다양성 풀 주입 ──
  // 동일 통문장이 5만회+ 폭주하는 문제 해결: 시드별로 글로벌 풀에서 8개 추가
  const globalV2 = V2_GLOBAL_FRAGMENTS[blockType] || [];
  const extraGlobals = pickN(globalV2, 8, rng);
  const enriched = [...rawTemplates, ...extraGlobals];

  const effective = filterOut(enriched);

  const pickOne = (): string => {
    const tpl = effective[Math.floor(rng() * effective.length)];
    let out = fillTemplate(tpl, vars, productName, rng);
    out = maybeSeoWeave(out, seoKeywords, rng, blockType);
    out = cleanSpaces(out);
    return out;
  };

  const content = pickOne();
  let subContent: string | undefined;
  if (effective.length >= 2) {
    // subContent는 content와 다른 결과가 나올 때까지 최대 5회 재시도
    for (let i = 0; i < 5; i++) {
      const s = pickOne();
      if (s !== content) {
        subContent = s;
        break;
      }
    }
  }

  return { type: blockType, content, subContent };
}

// ─── Layer 3: 상품 토큰 + 카테고리 변수 병합 ────────────

/**
 * 상품 토큰 오버라이드를 변수풀에 prepend 병합.
 * 상품 토큰이 높은 확률로 선택되되, 카테고리 풀도 폴백 유지.
 *
 * @param categoryPath — L1 금지어 안전망 적용용 (forbiddenTerms가 비었을 때 L1 금지어 사용)
 */
export function mergeVariables(
  categoryVars: Record<string, string[]>,
  productOverrides: Record<string, string[]>,
  forbiddenTerms?: string[],
  hasStrongContext?: boolean,
  categoryPath?: string,
): Record<string, string[]> {
  const result = { ...categoryVars };

  // forbiddenTerms 결정: 프로필 지정값 우선, 없으면 L1 안전망 적용
  let effectiveForbidden = forbiddenTerms;
  if ((!effectiveForbidden || effectiveForbidden.length === 0) && categoryPath) {
    effectiveForbidden = getL1ForbiddenTerms(categoryPath);
  }

  // forbiddenTerms 필터링 — 카테고리 변수에서 금지어 포함 항목 제거
  // (완전 일치가 아닌 부분 문자열 매칭 — "아침 공복에 1정 섭취" 같은 문장도 차단)
  if (effectiveForbidden && effectiveForbidden.length > 0) {
    const forbidden = effectiveForbidden;
    for (const [key, values] of Object.entries(result)) {
      const filtered = values.filter(v => !forbidden.some(term => v.includes(term)));
      if (filtered.length > 0) {
        result[key] = filtered;
      }
      // filtered가 비면 원본 유지 (안전망)
    }
  }

  // 상품 오버라이드 키가 존재하면 카테고리 풀을 축소하여
  // 상품별 맞춤 콘텐츠 생성 확률을 극대화한다.
  // 강한 컨텍스트(상품 데이터 충분) → 카테고리 폴백 최소화(1개)
  // 약한 컨텍스트 → 기존대로 3개 유지
  const MAX_CATEGORY_KEEP = hasStrongContext ? 1 : 3;
  for (const [key, overrideValues] of Object.entries(productOverrides)) {
    if (result[key]) {
      const trimmed = result[key].slice(0, MAX_CATEGORY_KEEP);
      const merged = [...overrideValues];
      for (const existing of trimmed) {
        if (!merged.includes(existing)) merged.push(existing);
      }
      result[key] = merged;
    } else {
      result[key] = overrideValues;
    }
  }
  return result;
}

// ─── Layer 4: SEO 키워드 변수풀 보강 ────────────────────

/**
 * SEO 키워드를 변수풀에 주입한다.
 * - seoKeywords 중 짧은 키워드(≤6자) → 효과1/효과2 앞에 prepend
 * - 긴 키워드 → 카테고리 앞에 prepend
 */
export function enrichVariablesWithSeo(
  vars: Record<string, string[]>,
  seoKeywords: string[],
  rng: () => number,
): Record<string, string[]> {
  if (!seoKeywords || seoKeywords.length === 0) return vars;

  const result = { ...vars };
  for (const [key, val] of Object.entries(result)) {
    result[key] = [...val]; // 원본 불변 보장
  }

  const shortKws = seoKeywords.filter(k => k.length <= 6);
  const longKws = seoKeywords.filter(k => k.length > 6);

  // 효과1/효과2에 짧은 SEO 키워드 prepend
  if (shortKws.length > 0) {
    const picked = shortKws[Math.floor(rng() * shortKws.length)];
    if (result['효과1'] && !result['효과1'].includes(picked)) {
      result['효과1'] = [picked, ...result['효과1']];
    }
    if (shortKws.length > 1) {
      const picked2 = shortKws.filter(k => k !== picked)[0];
      if (picked2 && result['효과2'] && !result['효과2'].includes(picked2)) {
        result['효과2'] = [picked2, ...result['효과2']];
      }
    }
  }

  // 카테고리에 긴 SEO 키워드 prepend
  if (longKws.length > 0) {
    const picked = longKws[Math.floor(rng() * longKws.length)];
    if (result['카테고리'] && !result['카테고리'].includes(picked)) {
      result['카테고리'] = [picked, ...result['카테고리']];
    }
  }

  return result;
}

// ─── Layer 4: SEO 키워드 인라인 위빙 ────────────────────

// ─── SEO 위빙 삽입 카운터 (블록 순서 기반 로테이션) ────
let _seoWeaveInsertionCount = 0;

/** 삽입 카운터 리셋 (composeAllBlocks 시작 시 호출) */
export function resetSeoWeaveCounter(): void {
  _seoWeaveInsertionCount = 0;
}

/**
 * SEO 키워드를 문장에 자연스럽게 삽입한다.
 * - 처음 4개 블록: 100% 삽입 보장
 * - 이후 블록: 50-60% 확률
 * - 키워드 로테이션: insertionCount % seoKeywords.length
 */
export function maybeSeoWeave(
  content: string,
  seoKeywords: string[],
  rng: () => number,
  blockType: string,
): string {
  if (!seoKeywords || seoKeywords.length === 0) return content;

  const isEarlyBlock = _seoWeaveInsertionCount < 4;
  const threshold = isEarlyBlock ? 1.0 : ((blockType === 'hook' || blockType === 'cta') ? 0.6 : 0.5);

  if (rng() > threshold) return content;

  // 키워드 로테이션 — 모든 키워드 균등 사용
  const kw = seoKeywords[_seoWeaveInsertionCount % seoKeywords.length];
  _seoWeaveInsertionCount++;

  // 이미 포함되어 있으면 스킵
  if (content.includes(kw)) return content;

  // 종결어미(입니다/예요/어요/해요/죠/네요/요/다) 또는 조사(은/는/이/가/을/를/과/와/도/만) 뒤에
  // 바로 키워드를 이어붙이면 "~입니다 고함량." 같이 부자연스러운 문장이 되므로 삽입 스킵.
  //   자연스러운 삽입 지점이 없으면 아예 붙이지 않는다 (삽입 실패 허용).
  const UNNATURAL_TAIL = /(입니다|습니다|예요|에요|어요|아요|해요|되요|돼요|이죠|네요|군요|세요|죠|다|요)[.!?。]?$/;
  const PARTICLE_TAIL = /[은는이가을를과와도만에의로]\s*[.!?。]?$/;

  if (UNNATURAL_TAIL.test(content) || PARTICLE_TAIL.test(content)) {
    // 이른 블록(강제 삽입 구간)이라면 prefix 삽입 fallback으로 강제 SEO 노출 보장.
    // — 종결어미 뒤에 키워드 붙이는 부자연스러움을 피하면서도 SEO 미포함률을 줄인다.
    if (isEarlyBlock) {
      // 자연스러운 prefix 형태로 삽입 (시드 기반 4가지 형식 로테이션)
      const prefixForms = [
        `${kw}을 찾고 계셨다면 좋은 기회입니다. `,
        `${kw} 카테고리에서 한 번쯤 짚어볼 만한 제품입니다. `,
        `${kw} 분야에 관심 있으신 분이라면 주목해보세요. `,
        `${kw} 관련해서 자주 비교되는 제품 중 하나입니다. `,
      ];
      const prefix = prefixForms[_seoWeaveInsertionCount % prefixForms.length];
      return prefix + content;
    }
    return content;
  }

  // 마침표/물음표 앞에 삽입 (종결어미 아닐 때만 실행됨)
  const punctIdx = content.search(/[.?!。]$/);
  if (punctIdx >= 0) {
    return content.slice(0, punctIdx) + ' ' + kw + content.slice(punctIdx);
  }

  // 문장 끝에 추가
  return content + ' ' + kw;
}

// ─── Layer 1: 변수 치환 ─────────────────────────────────

/** 한글 받침(종성) 존재 여부 확인 */
function hasFinalConsonant(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

/** 한글 조사 자동 교정 — 변수 치환 후 은/는, 이/가, 을/를, 과/와 수정
 *  ※ 단어 중간의 이/가/과/와는 건드리지 않음 (첨가물, 효과적, 다이어트 보호)
 *     → 조사 뒤에 공백/구두점/문장끝이 올 때만 교정 */
function fixKoreanParticles(text: string): string {
  const boundary = '(?=[\\s,.!?;:)\\]\'\"」, 。]|$)';
  return text
    .replace(new RegExp(`([\\uAC00-\\uD7A3])(은|는)${boundary}`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '은' : '는'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])(이|가)${boundary}`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '이' : '가'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])(을|를)${boundary}`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '을' : '를'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])(과|와)${boundary}`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '과' : '와'));
}

// 변수 치환 경계 마커. 치환 후 이 경계 직후의 조사만 교정하여
// 템플릿 내부의 관형사형 어미("있는/없는") · 의존명사("뭔가/누군가")
// 같은 단어가 잘못 교정되는 것을 방지한다.
const VAR_BOUNDARY = '\u0001';

/**
 * 변수 치환 경계(VAR_BOUNDARY)에 접한 조사만 교정한다.
 * 경계 = 치환된 변수값의 끝 (즉, 템플릿에서 "...{var}X..." 형태의 X가 조사인 경우).
 *
 * 주의: 계사(copula) "이" 처리 - "이라면/이시라면/이에요/이다/이야" 등에서
 * "이"는 주격조사가 아니라 계사이므로 vowel-final noun에서는 탈락(drop)된다.
 * 예) "프리랜서이라면" → "프리랜서라면" (NOT "프리랜서가라면")
 *     "직장인이라면" → "직장인이라면" (유지)
 */
function fixParticlesAtBoundary(text: string): string {
  const b = VAR_BOUNDARY;
  return text
    // 계사 "이" + (라|시|에|다|야): vowel-final이면 탈락, consonant-final이면 유지
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}이(?=[라시에다야])`, 'g'), (_, prev) =>
      hasFinalConsonant(prev) ? prev + '이' : prev)
    // 은/는 주격보조조사
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(은|는)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '은' : '는'))
    // 주격조사 이/가 — 계사 케이스는 위에서 이미 처리됨
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(이|가)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '이' : '가'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(을|를)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '을' : '를'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(과|와)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '과' : '와'))
    .replace(new RegExp(b, 'g'), '');
}

function fillTemplate(
  template: string,
  vars: Record<string, string[]>,
  productName: string,
  rng: () => number,
): string {
  const b = VAR_BOUNDARY;
  // 1. {product} 치환 — 끝에 경계 마커 삽입
  let result = template.replace(/\{product\}/g, productName + b);
  // 2. {변수} 치환 — 끝에 경계 마커 삽입
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)] + b;
    }
    // 미해결 변수: 유사 키에서 폴백 시도 (성분2→성분, 효과2→효과1)
    const baseKey = key.replace(/\d+$/, '');
    const fallback = vars[baseKey] || vars[baseKey + '1'];
    if (fallback && fallback.length > 0) {
      return fallback[Math.floor(rng() * fallback.length)] + b;
    }
    return '';
  });
  // 3. 경계 직후의 조사만 교정 + 경계 마커 제거
  //    "{효과1}은 물론" → "콜레스테롤관리\u0001은 물론" → "콜레스테롤관리는 물론"
  //    템플릿 내부의 "있는/없는/뭔가"는 경계가 없으므로 보호됨.
  result = fixParticlesAtBoundary(result);
  return result;
}

// ─── Layer 1: 단일 블록 조합 ────────────────────────────

/**
 * 하나의 ContentBlock을 조각 조합으로 생성한다.
 */
export function composeBlock(
  blockType: ContentBlockType,
  categoryPath: string,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
  forbiddenTerms?: string[],
): ContentBlock {
  // ── v2 완성문 템플릿 뱅크 우선 ──
  // 해당 카테고리에 v2 템플릿이 있으면 조각조합 대신 직접 사용 (자연스러움 보장)
  const v2Block = composeFromV2Templates(
    blockType,
    categoryPath,
    vars,
    productName,
    seoKeywords,
    rng,
    forbiddenTerms,
  );
  if (v2Block) return v2Block;

  // social_proof, usage_guide는 자체 조각풀 사용, 없으면 solution으로 폴백
  const effectiveType = blockType;
  const rawPool = resolveFragments(effectiveType, categoryPath);
  // 안전 기본값 보장
  const pool: FragmentPool = {
    openers: rawPool.openers || [],
    values: rawPool.values || [],
    closers: rawPool.closers || [],
    emphases: rawPool.emphases,
    titles: rawPool.titles,
    item_pool: rawPool.item_pool,
  };
  const hasPool = pool.openers.length > 0 || pool.values.length > 0;

  // 풀이 비어있으면 solution 풀로 폴백 (social_proof, usage_guide 등)
  let actualPool = hasPool ? pool : resolveFragments('solution', categoryPath);

  // ── forbiddenTerms 필터: 프래그먼트 텍스트에서 금지어 포함 항목 제거 ──
  // 프로필 지정값 우선, 없으면 L1 대분류 안전망 적용
  const effectiveForbidden = (forbiddenTerms && forbiddenTerms.length > 0)
    ? forbiddenTerms
    : getL1ForbiddenTerms(categoryPath);
  if (effectiveForbidden.length > 0) {
    actualPool = filterFragmentPool(actualPool, effectiveForbidden);
  }

  // ── 글로벌 다양성 풀 주입 (closer/opener 96만회 반복 문제 해결) ──
  // 시드별로 다른 12개씩 추가되어 카테고리당 풀 크기가 5~10배 확대됨
  actualPool = injectGlobalDiversity(actualPool, blockType, rng);
  // forbidden 필터를 한번 더 적용 (글로벌 풀에 카테고리 부적합 단어가 있을 수 있음)
  if (effectiveForbidden.length > 0) {
    actualPool = filterFragmentPool(actualPool, effectiveForbidden);
  }

  switch (blockType) {
    case 'hook':
    case 'solution':
    case 'social_proof':
    case 'usage_guide': {
      // 1차 문장
      const content = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);
      // 2차 문장 (subContent) — 다른 조합으로 생성
      const subContent = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
    }

    case 'feature_detail': {
      const opener = pickRandom(actualPool.openers, rng);
      const value = pickRandom(actualPool.values, rng);
      const closer = pickRandom(actualPool.closers, rng);
      const emphasis = actualPool.emphases && actualPool.emphases.length > 0
        ? actualPool.emphases[Math.floor(rng() * actualPool.emphases.length)]
        : undefined;

      let rawContent = [opener, value, closer].filter(Boolean).join(' ');
      rawContent = fillTemplate(rawContent, vars, productName, rng);
      rawContent = maybeSeoWeave(rawContent, seoKeywords, rng, blockType);
      rawContent = cleanSpaces(rawContent);

      // subContent — 다른 조합
      const subContent = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      const filledEmphasis = emphasis
        ? fillTemplate(emphasis, vars, productName, rng)
        : undefined;

      return {
        type: blockType,
        content: rawContent,
        subContent: rawContent !== subContent ? subContent : undefined,
        emphasis: filledEmphasis,
      };
    }

    case 'benefits_grid': {
      const title = actualPool.titles && actualPool.titles.length > 0
        ? actualPool.titles[Math.floor(rng() * actualPool.titles.length)]
        : '핵심 장점';

      // item_pool에서 5개 비중복 선택 (기존 3→5)
      const items = selectDistinct(actualPool.item_pool || [], 5, rng);
      const filledItems = items.map(item => {
        let filled = fillTemplate(item, vars, productName, rng);
        // {seo_keyword} 치환
        if (filled.includes('{seo_keyword}') && seoKeywords.length > 0) {
          filled = filled.replace(
            /\{seo_keyword\}/g,
            seoKeywords[Math.floor(rng() * seoKeywords.length)],
          );
        }
        return filled;
      });

      return { type: blockType, content: title, items: filledItems };
    }

    case 'cta': {
      const opener = pickRandom(actualPool.openers, rng);
      const closer = pickRandom(actualPool.closers, rng);

      let rawContent = [opener, closer].filter(Boolean).join(' ');
      rawContent = fillTemplate(rawContent, vars, productName, rng);
      rawContent = maybeSeoWeave(rawContent, seoKeywords, rng, blockType);
      rawContent = cleanSpaces(rawContent);

      // subContent 추가
      const sub = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      return { type: blockType, content: rawContent, subContent: rawContent !== sub ? sub : undefined };
    }

    default: {
      // 미지원 블록타입은 hook 로직으로 폴백
      const fb = resolveFragments('hook', categoryPath);
      const content = composeOneSentence(fb, vars, productName, seoKeywords, rng, blockType);
      const subContent = composeOneSentence(fb, vars, productName, seoKeywords, rng, blockType);
      return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
    }
  }
}

/**
 * 프래그먼트 풀에서 forbiddenTerms 포함 항목을 제거한다.
 * 필터 후 비어있으면 원본 유지 (안전망).
 */
function filterFragmentPool(pool: FragmentPool, forbiddenTerms: string[]): FragmentPool {
  const hasForbidden = (text: string): boolean =>
    forbiddenTerms.some(term => text.includes(term));

  const filterArr = (arr: string[]): string[] => {
    const filtered = arr.filter(s => !hasForbidden(s));
    return filtered.length > 0 ? filtered : arr; // 전부 제거되면 원본 유지
  };

  return {
    openers: filterArr(pool.openers || []),
    values: filterArr(pool.values || []),
    closers: filterArr(pool.closers || []),
    emphases: pool.emphases ? filterArr(pool.emphases) : undefined,
    titles: pool.titles,
    item_pool: pool.item_pool ? filterArr(pool.item_pool) : undefined,
  };
}

/** 하나의 문장을 조각 풀에서 조합한다. */
function composeOneSentence(
  pool: FragmentPool,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
  blockType: string,
): string {
  const opener = pickRandom(pool.openers, rng);
  const value = pickRandom(pool.values, rng);
  const closer = pickRandom(pool.closers, rng);

  let raw = [opener, value, closer].filter(Boolean).join(' ');
  raw = fillTemplate(raw, vars, productName, rng);
  raw = maybeSeoWeave(raw, seoKeywords, rng, blockType);
  raw = cleanSpaces(raw);
  return raw;
}

/** 배열에서 랜덤 1개 선택 (빈 배열이면 '') */
function pickRandom(arr: string[], rng: () => number): string {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(rng() * arr.length)];
}

// ─── 프레임워크 전체 블록 시퀀스 조합 ───────────────────

/**
 * 프레임워크의 블록 시퀀스를 조합하여 ContentBlock[] 반환.
 */
export function composeAllBlocks(
  framework: FrameworkDef,
  categoryPath: string,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
  forbiddenTerms?: string[],
): ContentBlock[] {
  resetSeoWeaveCounter();
  return framework.blocks.map(blockType =>
    composeBlock(
      blockType as ContentBlockType,
      categoryPath,
      vars,
      productName,
      seoKeywords,
      rng,
      forbiddenTerms,
    ),
  );
}

// ─── 프레임워크 / 카테고리프레임워크 외부 노출 ──────────

export function getFrameworks(): Record<string, FrameworkDef> {
  return FRAMEWORKS;
}

export function getCategoryFrameworks(): Record<string, string[]> {
  return CATEGORY_FRAMEWORKS;
}

/**
 * categoryPath에서 가장 구체적인 프레임워크 배열 반환.
 * 소분류→중분류→대분류→DEFAULT 폴백.
 */
export function resolveCategoryFrameworks(categoryPath: string): string[] {
  // 정확 매칭
  if (CATEGORY_FRAMEWORKS[categoryPath]) return CATEGORY_FRAMEWORKS[categoryPath];

  // 뒤에서부터 줄여가며 매칭
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (CATEGORY_FRAMEWORKS[key]) return CATEGORY_FRAMEWORKS[key];
  }

  // 대분류 추론
  const topKey = inferTopCategory(parts[0] || '', categoryPath);
  if (CATEGORY_FRAMEWORKS[topKey]) return CATEGORY_FRAMEWORKS[topKey];

  return CATEGORY_FRAMEWORKS['DEFAULT'] || ['AIDA', 'PAS', 'LIFESTYLE'];
}

// ─── 유틸 ────────────────────────────────────────────────

/** 배열에서 비중복 n개 선택 (Fisher-Yates) */
function selectDistinct<T>(arr: T[], n: number, rng: () => number): T[] {
  if (arr.length <= n) return [...arr];
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

/** 연속 공백 정리, 앞뒤 공백 제거 */
function cleanSpaces(str: string): string {
  return str.replace(/\s{2,}/g, ' ').trim();
}
