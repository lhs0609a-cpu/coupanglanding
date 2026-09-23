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

import { getActSteps, type AcademyStep } from './academy';

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
  };
}

/**
 * Act 1 + Act 2. howto 가 비어 있는 단계는 내보내지 않는다 —
 * 설명 없는 빈 카드가 로드맵에 뜨면 "여긴 뭐지" 하고 거기서 멈춘다.
 */
export const ROADMAP_STEPS: RoadmapStep[] = [...getActSteps(1), ...getActSteps(2)]
  .filter((s) => (s.howto?.length ?? 0) > 0)
  .map(toRoadmapStep);

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
    question: '쿠팡 외에 다른 마켓(네이버, 11번가 등)도 같은 절차인가요?',
    answer:
      '사업자등록과 통신판매업 신고는 모든 마켓 공통입니다. 각 마켓별 입점 절차만 다를 뿐, 기본 자격요건은 동일합니다.',
  },
];
