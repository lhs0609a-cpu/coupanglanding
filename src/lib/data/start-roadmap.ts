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
import { START_SUPPORT, type StartSupport } from './academy/start-support';

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
  support: StartSupport;
  actions: AcademyStep['actions'];
  troubleshoot: AcademyStep['troubleshoot'];
  verification: string;
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
    support: START_SUPPORT[step.key],
    actions: step.actions,
    troubleshoot: step.troubleshoot,
    verification: step.verify.level === 1 ? '연결된 계정의 일부 상태를 API로 조회합니다. 조회 결과가 전체 업무 완료를 보장하지는 않습니다.' : step.verify.level === 2 ? '입력한 정보 또는 제출 자료로 확인하는 단계입니다.' : '체크리스트와 상황별 퀴즈로 이해도를 확인하는 단계입니다.',
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
    "question": "사업자등록 전에 윙 계정을 만들 수 있나요?",
    "answer": "계정 생성과 사업자 인증은 별개입니다. 구매안전서비스 이용 확인증 준비를 위해 계정을 먼저 만들 수 있습니다. 판매를 진행하려면 쿠팡이 요구하는 사업자 인증과 서류 심사를 마쳐야 합니다."
  },
  {
    "question": "통신판매업 신고는 누구나 반드시 해야 하나요?",
    "answer": "신고 대상과 면제 요건을 관할 지자체에서 확인하세요. 신고 면제와 쿠팡의 서류 제출 절차는 별개이므로, 면제 대상이면 윙에 제출할 자료도 판매자 지원에 확인합니다."
  },
  {
    "question": "간이과세와 일반과세 중 무엇을 골라야 하나요?",
    "answer": "업종·매출 예상·적용 요건·매입 및 세금계산서 필요에 따라 달라집니다. 홈택스 안내나 국세상담센터 126에서 본인 조건으로 확인합니다."
  },
  {
    "question": "준비 비용과 기간은 어느 정도인가요?",
    "answer": "사업자등록 신청 자체는 무료입니다. 통신판매업 등록면허세, 해당 업종 교육·신고 비용, 메가로드 이용료와 실제 상품 매입·배송비는 별도입니다. 지역·계약·보완 심사에 따라 달라지므로 고지 금액과 접수 상태를 확인하세요. 표시된 시간은 예상입니다."
  },
  {
    "question": "메가로드는 가입만 하면 바로 사용할 수 있나요?",
    "answer": "로그인 외에 계정 승인과 서비스 이용 권한이 필요합니다. 접근이 안 되면 계정 상태를 확인하세요. 상품 등록·주문·CS는 쿠팡 윙에서도 직접 할 수 있지만 메가로드 카탈로그와 자동 등록 기능이 그대로 제공되는 것은 아닙니다."
  },
  {
    "question": "IP는 제 컴퓨터에서 확인해서 넣나요?",
    "answer": "아닙니다. 메가로드가 쿠팡 API를 호출하는 서버의 허용 IP를 입력합니다. API 단계의 복사 버튼과 채널 설정이 같은 목록을 사용합니다. 윙 저장 후 최대 30분 반영 시간을 고려해 실제 연결 테스트를 합니다."
  },
  {
    "question": "건강기능식품 단계는 건너뛰어도 되나요?",
    "answer": "해당 상품을 판매하지 않으면 건너뜁니다. 판매하려면 업종에 맞는 교육과 영업신고 등 자격 요건을 확인하고 필요한 서류를 준비합니다."
  },
  {
    "question": "상세 확보 상품은 바로 판매해도 되나요?",
    "answer": "상세 자료가 있다는 뜻입니다. 판매·이미지 사용 권한, 실제 재고와 구성, 필수 고시·인증, 가격·배송 조건은 판매자가 검수해야 합니다."
  },
  {
    "question": "완료 체크하면 실제 신청이나 등록이 되나요?",
    "answer": "체크는 현재 브라우저의 진행 기록입니다. 실제 신청·저장·등록·발주·환불은 연결된 작업 사이트에서 직접 해야 합니다. 회원 아카데미의 API 조회도 일부 상태만 확인하며 전체 업무 완료를 보장하지 않습니다."
  },
  {
    "question": "주문이나 반품이 아직 없으면 어떻게 하나요?",
    "answer": "해당 단계는 미리보고 실제 건이 들어오면 처리합니다. 연습하려고 주문·반품을 만들 필요는 없습니다. 실제 요청이 들어오면 현재 학습 순서보다 처리 기한을 우선하세요."
  },
  {
    "question": "발주확인과 발주는 같은 건가요?",
    "answer": "발주확인은 고객 주문을 확인했다는 상태 변경입니다. 발주는 공급처에 실제로 주문하고 결제하는 일입니다. 쿠팡 주문번호와 공급처 주문번호를 연결해 관리하세요."
  },
  {
    "question": "송장 등록 후에도 할 일이 있나요?",
    "answer": "실제 집화와 배송 완료를 확인하고 지연·취소에 대응합니다. 이후 윙 정산 내역과 수수료·매입액·환불 차감을 대조합니다. 송장번호가 있다는 것만으로 출고가 보장되지는 않습니다."
  },
  {
    "question": "반품은 회수 송장만 넣으면 끝나나요?",
    "answer": "아닙니다. 회수 접수 → 실제 수거 → 입고·검수 → 고객 환불 또는 교환 재배송 → 공급처 환불·정산 대조까지 확인합니다. 자동 회수·자동 환불 여부를 먼저 봐서 중복 처리하지 않습니다."
  },
  {
    "question": "브랜드 통지나 제재는 어떻게 대응하나요?",
    "answer": "문서 원문·수령일·기한과 요구 증빙을 보관합니다. 정품 거래 증빙과 이미지·상표 사용 권리는 따로 확인합니다. 통지가 지정한 창구로 대응하고 필요하면 법률상담을 받으세요. 해제나 무책임을 일괄 보장할 수 없습니다."
  }
];
