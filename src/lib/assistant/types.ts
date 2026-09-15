/**
 * AI 상담 봇 공통 타입.
 *
 * 지식베이스(KB)는 세 군데에서 온다:
 *  1) src/lib/assistant/kb/*.ts  — 사람이 직접 쓴 운영 노하우 / 장애 대응 / 페이지 설명
 *  2) src/lib/data/*.ts          — 이미 앱에 있는 가이드·긴급대응·페널티·튜토리얼을 평탄화
 *  3) DB (faqs, notices, assistant_kb_entries) — 배포 없이 즉시 반영되는 항목
 *
 * 세 소스 모두 KbEntry 하나로 맞춰서 같은 검색기를 태운다.
 */

/** 상담 표면 — 어떤 영역에서 말 걸었는가 */
export type AssistantSurface = 'public' | 'pt' | 'megaload' | 'admin';

/** 문서가 누구에게 유효한가 */
export type KbAudience = 'public' | 'pt' | 'megaload' | 'all';

export interface KbEntry {
  /** 전역 고유 id. 소스별 접두사를 붙인다 (op-, page-, guide-, emg-, faq- …) */
  id: string;
  title: string;
  /** 검색 결과 목록에 보여줄 1~2문장 */
  summary: string;
  /** 실제 답변 근거가 되는 본문 (마크다운 허용) */
  body: string;
  /** 검색 가중치를 크게 받는 키워드들 */
  tags: string[];
  /** 이 문서가 특히 관련 있는 앱 경로 (prefix 매칭) */
  paths?: string[];
  audience: KbAudience;
  /** 같은 점수일 때 위로 올릴 가중치. 운영 노하우/장애대응이 높다. */
  priority?: number;
  /** 출처 표기 (관리자 검토용) */
  source: KbSource;
  /** 사용자에게 열어줄 링크 */
  link?: { label: string; href: string };
}

export type KbSource =
  | 'operator'        // 실제 코치가 카톡/디코에서 답한 내용
  | 'troubleshooting' // 오류 메시지 → 원인 → 조치
  | 'page'            // 페이지별 사용법
  | 'guide'           // src/lib/data/guides.ts
  | 'article'         // src/lib/data/guide-articles.ts
  | 'tutorial'        // feature-tutorials / onboarding-tutorials
  | 'emergency'       // emergency-responses
  | 'penalty'         // penalty-response-guide
  | 'channel'         // channel-setup-guides / channel-onboarding-guides
  | 'ads'             // ad-tips / ad-academy-stages
  | 'growth'          // growth-roadmap / scaling-guide / start-roadmap
  | 'cs'              // cs-templates
  | 'contract'        // contract-terms
  | 'faq'             // DB faqs
  | 'notice'          // DB notices
  | 'admin-kb';       // DB assistant_kb_entries

export interface KbHit {
  entry: KbEntry;
  score: number;
}

/** 봇이 답변에 첨부하는 근거 */
export interface AssistantSource {
  id: string;
  title: string;
  href?: string;
}

/** 봇이 제안하는 행동 버튼 (UI가 칩으로 렌더) */
export interface AssistantAction {
  kind: 'navigate' | 'kakao' | 'ticket' | 'bug_report' | 'external';
  label: string;
  href?: string;
  /** ticket / bug_report 용 프리필 */
  payload?: Record<string, unknown>;
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AssistantSource[];
  actions?: AssistantAction[];
}

/** 로그인 사용자 실시간 진단 결과 */
export interface UserStatusSnapshot {
  loggedIn: boolean;
  name?: string;
  role?: string;
  /** PT 회원 여부 + 시작일 */
  pt?: {
    joinedAt: string | null;
    daysSinceJoin: number | null;
    coupangApiConnected: boolean;
    coupangVendorId: string | null;
    paymentLockLevel: number;
    paymentOverdueSince: string | null;
    hasPaymentCard: boolean;
  };
  megaload?: {
    plan: string | null;
    onboardingDone: boolean;
    productCount: number;
    registeredCount: number;
    /** 최근 7일 등록 실패 건수 */
    recentFailures: number;
    pendingOrders: number;
    pendingInquiries: number;
    stockMonitorCount: number;
    connectedChannels: string[];
    desktopHelper: {
      online: boolean;
      lastSeenAt: string | null;
      version: string | null;
    };
  };
  settlement?: {
    targetMonth: string;
    dday: number;
    reportStatus: string | null;
    feePaymentStatus: string | null;
  };
  penalty?: {
    score: number | null;
    openIncidents: number;
  };
  /** 진단 중 확인된 경고 — 봇이 먼저 짚어준다 */
  warnings: string[];
}
