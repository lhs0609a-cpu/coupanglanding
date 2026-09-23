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
  /**
   * L2 — 증빙. 쿠팡에 물어볼 수 없는 것(사업자등록 등).
   *
   * mode 'number' — 번호를 받아 형식·체크섬으로 검증한다. 파일도 OCR 도 필요 없고,
   *   오타와 지어낸 번호를 걸러낸다. 다만 "실제로 등록했는지" 까지는 확인하지 못하므로
   *   `note` 에 그 한계를 적어 화면에 그대로 노출한다. 판정이 실제보다 세 보이면 안 된다.
   * mode 'file' — 파일 증빙. 업로드·보관·판정 라우트가 필요하다(아직 미구현).
   */
  | {
      level: 2;
      mode: 'number';
      validator: 'bizNumber' | 'onlineSalesNumber';
      hint: string;
      placeholder: string;
      /** 이 판정이 무엇까지 확인하는지 — 정직하게 */
      note: string;
    }
  | {
      level: 2;
      mode: 'file';
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
  /** 유튜브에 올린 경우. 자체 호스팅이면 비워두고 src 를 쓴다. */
  youtubeId?: string;
  /** 자체 호스팅 mp4 (Supabase Storage). 원본이 화면공유 녹화라 유튜브에 그대로 못 올린다. */
  src?: string;
  startSec: number;
  endSec: number;
  transcript: string;
}

/**
 * 따라하기 체크리스트 — **한 줄에 한 동작.**
 *
 * narration 은 귀로 듣는 대본이고, 이건 눈으로 보며 체크하는 목록이다. 둘은 문장이 다르다.
 * ★ 이 배열이 공개 로드맵(/start)과 스텝 플레이어가 함께 쓰는 단일 원천이다.
 *   같은 내용을 두 군데 적어두면 반드시 한쪽만 고쳐져서 서로 다른 말을 하게 된다.
 */
export interface StepHowto {
  /**
   * 체크 상태 저장 키. 사용자의 체크는 이 id 로 localStorage 에 남는다.
   * ★ 한 번 발행한 id 는 바꾸지 않는다 — 바꾸면 그 사람이 해둔 체크가 통째로 날아간다.
   */
  id: string;
  /** 한 줄 한 동작. 명령형으로 쓴다. */
  label: string;
  description?: string;
  tip?: string;
  warning?: string;
  link?: { url: string; label: string };
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
  /**
   * ⑦-b 따라하기 체크리스트. Act 1·2(무료 공개 구간)는 필수로 채운다 —
   * 공개 로드맵 /start 가 이걸 그린다. 비어 있으면 그 단계는 /start 에서 설명이 사라진다.
   */
  howto?: StepHowto[];
  /** ⑧ 합격 판정 */
  verify: VerifySpec;
  /** ⑨ 막히면 */
  troubleshoot: StepTrouble[];

  /**
   * 공개 로드맵(/start)용 표시 정보.
   * 비용과 기다리는 날수는 왕초보가 가장 먼저 묻는 두 가지다. 본문 어딘가에 묻어두면 안 읽는다.
   */
  roadmap?: {
    /** lucide 아이콘 이름 */
    icon: string;
    /** '무료' 또는 '등록면허세 4~6만원'. 공짜가 아닌 건 공짜라고 하지 않는다. */
    cost: string;
    /** 신청을 넣고 **기다리는** 영업일. 완료 예상일 계산의 분모다. */
    waitDays: number;
    /** 건기식처럼 해당 없으면 건너뛰는 단계 */
    optional?: boolean;
  };

  xp: number;
  badgeKey?: string;
}

/** 클라이언트로 내보낼 때의 모양 — pass() 같은 함수는 빼고 보낸다. */
export type AcademyStepPublic = Omit<AcademyStep, 'verify'> & {
  verify:
    | { level: 1; hint: string }
    | { level: 2; mode: 'number'; hint: string; placeholder: string; note: string }
    | { level: 2; mode: 'file'; accept: 'image' | 'pdf'; hint: string; retentionDays: number }
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
