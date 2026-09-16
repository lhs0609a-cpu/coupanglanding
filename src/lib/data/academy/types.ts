/**
 * 셀러 독학 아카데미 — 스텝 스키마
 *
 * 설계: 셀러_독학_아카데미_설계도.md
 *
 * ★ 이 파일의 존재 이유 한 줄:
 *   교육 콘텐츠가 실패하는 지점은 늘 같다 — **설명은 있는데 "됐는지"를 아무도 안 봐준다.**
 *   그래서 스텝은 `verify` 없이 만들 수 없게 타입을 짰다. 설명만 있는 스텝은 컴파일이 안 된다.
 */

// ── 판정 프로브 ────────────────────────────────────────────
// 서버에서 실행되는 **읽기 전용** 조회. 판정이 사용자의 쿠팡 계정을 바꾸는 일은 절대 없다.
export type ProbeKey =
  | 'coupang.connection'      // API 연동됐나
  | 'coupang.shippingPlaces'  // 출고지·반품지 등록됐나
  | 'coupang.products'        // 상품 몇 개 올렸나 / 승인됐나
  | 'coupang.orders'          // 주문 들어왔나 / 처리됐나
  | 'coupang.inquiries'       // 고객문의 / 답변했나
  | 'coupang.returns'         // 반품 접수 / 처리했나
  | 'coupang.settlements'     // 정산 났나
  | 'db.productCount';        // 우리 DB 기준 등록 상품 수

/** 프로브 실행 결과 — pass() 가 이걸 보고 판정한다. */
export interface ProbeResult {
  ok: boolean;
  /** 프로브가 긁어온 사실. 구조는 프로브마다 다르다. */
  data: Record<string, unknown>;
  /** 프로브 자체가 실패한 이유 (네트워크·인증 등). ok=false 일 때만. */
  error?: string;
}

/**
 * 판정 결과.
 * ★ `detail` 은 선택이 아니라 필수다. "실패했습니다" 만 있으면 사람은 거기서 막힌다.
 *   "쿠팡에 등록된 상품이 0건으로 조회됩니다" 라고 말해줘야 다음 행동을 스스로 찾는다.
 */
export interface VerifyVerdict {
  passed: boolean;
  detail: string;
}

export type VerifySpec =
  /** L1 — 사실 조회. 사람 개입 0. 가능하면 언제나 이것. */
  | {
      level: 1;
      probe: ProbeKey;
      params?: Record<string, unknown>;
      pass: (r: ProbeResult) => VerifyVerdict;
      /** 판정 전에 화면에 띄우는 안내 ("쿠팡에 물어봅니다") */
      hint: string;
    }
  /** L2 — 증빙 제출. 자동 조회가 원천적으로 불가능한 것만 (사업자등록증 등). */
  | {
      level: 2;
      accept: 'image' | 'pdf';
      /** 추출·검증 규칙 키 (서버 구현과 1:1) */
      extract: 'bizNumber' | 'onlineSalesNumber' | 'certificate';
      hint: string;
      /** 증빙 보관 기간(일). 지나면 삭제한다 — 민감정보를 영구보관하지 않는다. */
      retentionDays: number;
    }
  /** L3 — 자가 확인 + 퀴즈. 최후 수단. 자기신고라는 걸 인정하고 쓴다. */
  | {
      level: 3;
      checklist: string[];
      quiz: { q: string; choices: string[]; answer: number; why: string }[];
    };

// ── 콘텐츠 ────────────────────────────────────────────────
export interface StepHotspot {
  /** 이미지 대비 비율(0~1). 픽셀이 아니라 비율이라야 반응형에서 안 깨진다. */
  x: number; y: number; w: number; h: number;
  label: string;
  order: number;
}

export interface StepMockup {
  imageUrl: string;
  /** 캡처 일자 — 쿠팡 윙 UI 는 바뀐다. 6개월 지나면 재검토 플래그가 뜬다. */
  capturedAt: string;
  hotspots: StepHotspot[];
}

export interface StepVideo {
  youtubeId: string;
  startSec: number;
  endSec: number;
  transcript: string;
}

export interface StepAction {
  label: string;
  href?: string;
  external?: boolean;
  copyable?: { label: string; text: string };
}

export interface StepTrouble {
  symptom: string;
  cause: string;
  fix: string;
}

export type AcademyAct = 0 | 1 | 2 | 3 | 4 | 5;

/** Act 0~2 는 로그인한 전원, Act 3~5 는 PT 학생 전용 (2026-09-16 확정) */
export type AcademyAccess = 'public' | 'pt';

export interface AcademyStep {
  key: string;
  act: AcademyAct;
  order: number;
  access: AcademyAccess;
  /** 기존 pt_education_modules.key 연결 — 트레이너 화면에 단방향 미러링된다 */
  moduleKey?: string;

  title: string;
  /** ① 이 스텝이 끝나면 무엇이 참이 되는가 */
  goal: string;
  /** ② 건너뛰면 무슨 일이 나는가. 이유 없는 지시는 안 지켜진다. */
  why: string;
  /** ③ 예상 소요(초) */
  estimatedSec: number;

  /** ④ 영상 챕터 — 통짜 금지. 40~90초. 없어도 발행 가능(목업+TTS 로 충분). */
  video?: StepVideo;
  /** ⑤ 목업 + 핫스팟 */
  mockup?: StepMockup;
  /** ⑥ TTS 원문. 한 문장 = 한 동작. 문장 배열이라야 하이라이트가 붙는다. */
  narration: string[];
  /** ⑦ 실제로 할 일 */
  actions: StepAction[];
  /** ⑧ 합격 판정 */
  verify: VerifySpec;
  /** ⑨ 막히면 */
  troubleshoot: StepTrouble[];

  xp: number;
  badgeKey?: string;
}

/** 클라이언트로 내보낼 때의 모양 — pass() 같은 함수는 빼고 보낸다. */
export type AcademyStepPublic = Omit<AcademyStep, 'verify'> & {
  verify:
    | { level: 1; hint: string }
    | { level: 2; accept: 'image' | 'pdf'; hint: string; retentionDays: number }
    | { level: 3; checklist: string[]; quiz: { q: string; choices: string[] }[] };
};

export const ACT_META: Record<AcademyAct, { title: string; subtitle: string; access: AcademyAccess }> = {
  0: { title: '진단',  subtitle: '나한테 맞나?',            access: 'public' },
  1: { title: '개업',  subtitle: '팔 수 있는 상태 만들기',   access: 'public' },
  2: { title: '등록',  subtitle: '첫 상품을 올린다',         access: 'public' },
  3: { title: '주문',  subtitle: '돈이 들어온다',            access: 'pt' },
  4: { title: 'CS',    subtitle: '사고가 난다',              access: 'pt' },
  5: { title: '성장',  subtitle: '늘린다',                   access: 'pt' },
};
