/**
 * 공개 시작 로드맵 (/start) — **아카데미 Act 1·2 에서 파생된다.**
 *
 * ★ 이 파일은 콘텐츠를 담지 않는다. 담으면 안 된다.
 *   예전에는 여기에 5단계를 손으로 적어뒀는데, 아카데미(33단계)와 내용이 갈라져서
 *   같은 질문에 두 화면이 다른 답을 했다. (업종코드 47911 vs 525101,
 *   사업자등록을 홈택스로 vs 토스로 — 실제로 이렇게 어긋나 있었다.)
 *   그래서 원천을 `src/lib/data/academy` 하나로 못 박고, 여기서는 모양만 바꾼다.
 *
 * 무엇이 보이는가:
 *   Act 1(개업 7단계) + Act 2(등록 8단계) = **사업자등록 → 상품 업로드 → 승인 확인** 15단계.
 *   Act 0(진단)은 "나한테 맞나"라서 로드맵에 넣지 않고, Act 3~5 는 PT 전용이라 빠진다.
 *
 * 체크 상태는 `StepHowto.id` 로 localStorage 에 저장된다 → id 를 바꾸면 사용자의 체크가 날아간다.
 */

import { getActSteps, ACT_META, type AcademyStep, type AcademyAct } from './academy';

/**
 * 공개 로드맵에 싣는 막(Act).
 *
 * ★ 되돌리는 법: 이 배열을 `[1, 2]` 로 줄이면 예전 범위(입점·등록까지만 무료)로 돌아간다.
 *   설계도 §16-1 은 Act 3~5 를 PT 전용으로 잡았으나, 2026-09-24 에 주문처리·CS까지
 *   공개하기로 바꿨다. 화면·SEO·구조화 데이터가 전부 이 배열을 따라가므로 여기만 고치면 된다.
 *   (Act 5 성장은 아직 howto 를 안 썼다. 쓰면 여기에 5 를 더하면 된다.)
 */
export const ROADMAP_ACTS: AcademyAct[] = [1, 2, 3, 4];

export interface SubStep {
  id: string;
  label: string;
  description?: string;
  tip?: string;
  warning?: string;
  link?: { url: string; label: string };
  imagePlaceholder?: string;
}

export interface RoadmapStep {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: string; // lucide icon name
  estimatedTime: string;
  estimatedDays: number; // 영업일 기준
  cost: string;
  required: boolean; // false면 선택(건너뛰기 가능)
  subSteps: SubStep[];
  /** 로그인하면 시스템이 직접 판정해주는 아카데미 단계로 가는 링크 */
  academyHref: string;
  /** 몇 번째 막인가. 26단계를 한 줄로 늘어놓으면 어디쯤 왔는지 알 수 없다. */
  act: AcademyAct;
}

/** 막 머리말 — 단계 목록 사이에 끼워 "지금 어느 구간인가"를 말해준다. */
export interface RoadmapPhase {
  act: AcademyAct;
  /** '1부 · 개업' */
  label: string;
  /** '팔 수 있는 상태 만들기' */
  subtitle: string;
  /** 이 막의 첫 단계 번호 (1-based) */
  firstStepNumber: number;
  stepCount: number;
  /** 이 막에서 실제로 기다리는 영업일 합계 */
  waitDays: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

/** "약 15분", "약 1시간" — 초 단위는 사람이 못 읽는다. */
function humanMinutes(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `약 ${min}분`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `약 ${h}시간` : `약 ${h}시간 ${rest}분`;
}

/** 손으로 하는 시간과 기다리는 시간은 다른 종류의 시간이라 따로 적는다. */
function estimatedTime(step: AcademyStep): string {
  const doing = humanMinutes(step.estimatedSec);
  const wait = step.roadmap?.waitDays ?? 0;
  return wait > 0 ? `${doing} + 처리 ${wait}영업일` : doing;
}

function toRoadmapStep(step: AcademyStep, index: number): RoadmapStep {
  const meta = step.roadmap;
  return {
    id: step.key,
    number: index + 1,
    title: step.title,
    subtitle: step.goal,
    icon: meta?.icon || 'FileText',
    estimatedTime: estimatedTime(step),
    estimatedDays: meta?.waitDays ?? 0,
    cost: meta?.cost || '무료',
    required: !meta?.optional,
    subSteps: (step.howto || []).map((h) => ({
      id: h.id,
      label: h.label,
      description: h.description,
      tip: h.tip,
      warning: h.warning,
      link: h.link,
    })),
    academyHref: `/my/academy/${step.key}`,
    act: step.act,
  };
}

/**
 * 공개 로드맵의 단계 목록.
 * howto 가 비어 있는 단계는 내보내지 않는다 — 설명 없는 빈 카드가 뜨면
 * "여긴 뭐지" 하고 거기서 멈춘다.
 */
export const ROADMAP_STEPS: RoadmapStep[] = ROADMAP_ACTS
  .flatMap((act) => getActSteps(act))
  .filter((s) => (s.howto?.length ?? 0) > 0)
  .map(toRoadmapStep);

/** 막 머리말. 화면과 목차가 같은 데이터를 보도록 여기서 한 번만 계산한다. */
export const ROADMAP_PHASES: RoadmapPhase[] = ROADMAP_ACTS
  .map((act) => {
    const steps = ROADMAP_STEPS.filter((s) => s.act === act);
    if (steps.length === 0) return null;
    return {
      act,
      label: `${act}부 · ${ACT_META[act].title}`,
      subtitle: ACT_META[act].subtitle,
      firstStepNumber: steps[0].number,
      stepCount: steps.length,
      waitDays: steps.reduce((sum, s) => sum + s.estimatedDays, 0),
    };
  })
  .filter((p): p is RoadmapPhase => p !== null);

/**
 * 첫 상품을 올리기까지(Act 1·2) 기다리는 영업일.
 *
 * ★ 전체 26단계의 합이 아니다. Act 3·4 는 "첫 주문이 들어오면" 열리는 구간이라
 *   날짜로 더할 수 있는 성질이 아니다. 그걸 더해서 "예상 40일" 같은 숫자를 띄우면
 *   시작도 하기 전에 사람을 돌려보내게 된다.
 */
export const DAYS_TO_FIRST_PRODUCT = ROADMAP_STEPS
  .filter((s) => s.act === 1 || s.act === 2)
  .reduce((sum, s) => sum + s.estimatedDays, 0);

export const ROADMAP_FAQS: FAQItem[] = [
  {
    question: '사업자등록 없이 쿠팡에서 판매할 수 있나요?',
    answer:
      '아니요. 쿠팡은 개인에게 판매 권한을 주지 않습니다. 사업자등록이 없으면 쿠팡 윙 가입 자체가 안 되고, 통신판매업 신고도 사업자등록번호가 있어야 시작할 수 있습니다.',
  },
  {
    question: '사업자등록, 어디서 하는 게 제일 편한가요?',
    answer:
      '토스페이먼츠 바로신청을 씁니다. 공동인증서·증빙서류·대행 수수료가 없고, 다음 단계인 통신판매업 신고까지 같은 자리에서 이어서 할 수 있습니다. 홈택스에서 직접 해도 결과는 같습니다. 다만 토스 바로신청은 통신판매업을 준비하는 개인사업자만 쓸 수 있어서, 법인이거나 업종이 다르면 홈택스로 가야 합니다.',
  },
  {
    question: '간이과세자와 일반과세자 중 어떤 걸 선택해야 하나요?',
    answer:
      '위탁판매는 도매로 매입하는 구조라 매입세액 공제를 받는 일반과세자가 유리한 경우가 많습니다. 다만 어느 쪽으로 시작하든 나중에 바꿀 수 있고, 매출이 기준을 넘으면 자동으로 일반과세자가 됩니다. 여기서 오래 고민하지 마세요.',
  },
  {
    question: '통신판매업 신고는 왜 필요한가요?',
    answer:
      '전자상거래법상 온라인 판매 사업자의 의무입니다. 미신고는 과태료 대상이고, 쿠팡도 가입할 때 신고번호를 요구합니다.',
  },
  {
    question: '토스가 무료라는데 왜 돈을 내라고 하나요?',
    answer:
      '무료인 것은 대행 수수료입니다. 통신판매업 등록면허세(지역에 따라 4~6만원)는 구청에 내는 세금이라 누가 대행해도 똑같이 냅니다. 게다가 매년 1월에 한 번씩 더 나옵니다.',
  },
  {
    question: '건강기능식품 판매업 신고는 꼭 해야 하나요?',
    answer:
      '건기식(비타민·유산균 등)을 팔 계획이 있을 때만 필요합니다. 처음이라면 빼고 시작해도 됩니다. 마진은 좋지만 규제가 자주 바뀌고, 나중에 언제든 추가할 수 있습니다.',
  },
  {
    question: '전체 과정에 비용이 얼마나 드나요?',
    answer:
      '사업자등록(무료) + 통신판매업 등록면허세(4~6만원)만 필수입니다. 건기식까지 하면 신고 수수료가 2~3만원 정도 추가됩니다. 프로그램을 깔 필요가 없어 설치 비용은 0입니다.',
  },
  {
    question: '상품을 올리려면 프로그램을 설치해야 하나요?',
    answer:
      '아닙니다. 소싱 카탈로그에서 고르는 길은 설치가 하나도 없습니다. 구글 드라이브도, 도우미 앱도 필요 없습니다. 상세페이지까지 자동으로 만들어주는 올인원 등록을 쓸 때만 도우미가 필요한데, 시작 단계에서는 안 써도 됩니다.',
  },
  {
    question: '첫 상품을 올리기까지 전체 기간은 얼마나 걸리나요?',
    answer:
      '사업자등록(3영업일) → 통신판매업(3~5영업일) → 쿠팡 윙 승인(3영업일)까지가 기다리는 시간이고, 그 뒤 API 연동부터 상품 등록까지는 기다림 없이 이어집니다. 순차 진행하면 대략 2주 안팎입니다.',
  },
  {
    question: '다 했는지 누가 확인해주나요?',
    answer:
      '로그인하면 시스템이 쿠팡에 직접 물어봐서 확인해줍니다. API 연동·출고지 등록·상품 등록·판매중 여부는 전부 자동으로 판정되고, 안 됐으면 무엇이 몇 건으로 조회되는지까지 알려줍니다.',
  },
  {
    question: '주문이 들어오면 제가 직접 포장해서 보내나요?',
    answer:
      '아닙니다. 위탁판매는 물건을 내가 가지고 있지 않습니다. 소싱처에 고객 주소로 직배송을 걸고(발주), 소싱처가 준 운송장 번호를 쿠팡에 등록하면 끝입니다. ① 주문 확인 ② 발주 ③ 송장 등록, 이 세 가지가 주문 처리의 전부입니다.',
  },
  {
    question: '주문 처리에서 가장 많이 하는 실수는 뭔가요?',
    answer:
      '발주할 때 배송지에 내 주소를 넣는 것입니다. 고객 주소로 넣어야 물건이 고객에게 바로 갑니다. 그다음이 안심번호(050으로 시작)를 방치하는 것 — 기간이 지나면 끊겨서 택배기사가 연락을 못 합니다. 그래서 발주를 미루면 안 됩니다.',
  },
  {
    question: '팔았는데 소싱처가 품절이면 어떻게 하나요?',
    answer:
      '다른 소싱처에 같은 상품이 있는지 먼저 봅니다. 없으면 고객에게 먼저 연락하고(통보가 아니라 사과와 안내) 주문을 품절 사유로 취소합니다. 그리고 반드시 그 상품의 판매를 중지하세요. 안 하면 같은 품절 주문이 계속 들어와 취소율이 쌓입니다.',
  },
  {
    question: '고객 문의나 반품을 안 하고 두면 어떻게 되나요?',
    answer:
      '판매자 점수에 바로 들어갑니다. 미답변 문의와 미처리 반품은 쌓일수록 노출이 줄고, 누적되면 계정 제재까지 갑니다. 반품은 회수 운송장을 등록해야 처리가 끝나고, 그전까지는 정산도 묶입니다.',
  },
  {
    question: '브랜드사에서 내용증명이 오면 어떡하나요?',
    answer:
      '내용증명은 소송이 아니라 "이렇게 주장한다"는 편지입니다. 가장 하면 안 되는 건 놀라서 잘못을 인정하는 답장을 보내는 것 — 그 답장이 증거가 됩니다. 정품을 사서 되판 것이라면 상표권 침해가 아닐 수 있습니다(대법원 2002다42322 취지). 다만 사건마다 사실관계가 다르니 금액이 크거나 형사 고소가 언급되면 변호사에게 확인하세요.',
  },
  {
    question: '쿠팡 외에 다른 마켓(네이버, 11번가 등)도 같은 절차인가요?',
    answer:
      '사업자등록과 통신판매업 신고는 모든 마켓 공통입니다. 각 마켓별 입점 절차만 다를 뿐, 기본 자격요건은 동일합니다.',
  },
];
