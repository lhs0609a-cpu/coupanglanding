# AI 상담봇 (모든 페이지 플로팅)

초보 셀러가 막히는 순간, 페이지를 떠나지 않고 바로 물어보면 **실제 계정 상태까지 확인해서** 답하는 상담봇.
사람 코치가 카톡·디스코드로 1:1로 하던 응대를 대체하는 것이 목적이다.

---

## 1. 어디에 뜨나

`src/app/layout.tsx` 루트 레이아웃에 `<AssistantWidget />` 하나만 마운트돼 있다.
→ **공개 랜딩 / 로그인 전 / `/my` / `/megaload` / `/admin` 전부**에서 우측 하단에 뜬다.

예외는 `HIDDEN_PREFIXES` 두 곳뿐 (`/sign/`, `/screening/` — 서명·심사 화면을 가리면 안 됨).

루트 레이아웃에 있으므로 클라이언트 네비게이션으로 페이지를 옮겨도 **대화가 끊기지 않고**, 봇이 보는 "현재 화면"만 바뀐다.

기존 카카오톡 플로팅 버튼(`KakaoChatFloat`)은 제거했다. 사람 상담은 상담 패널 안의 **[사람 상담]** 링크와,
👎를 눌렀을 때 뜨는 **[사람에게 연결하기]** 로 이어진다.

---

## 2. 구성

```
src/lib/assistant/
  types.ts            공통 타입 (KbEntry, UserStatusSnapshot …)
  kb/
    operator.ts       ★ 코치가 실제로 답한 운영 노하우 (카톡/디코/대응 메일/영상에서 추출)
    troubleshooting.ts★ 화면에 실제로 뜨는 오류 문구 → 원인 → 조치
    pages.ts          페이지 지도 (경로별 설명 · 자주 막히는 것 · 추천 질문)
    from-app-data.ts  앱에 이미 있는 콘텐츠를 KB 로 평탄화 (복사가 아니라 참조)
    index.ts          정적 KB + DB KB 병합 · 색인 캐시
  retrieval.ts        한국어 어휘 검색 (어절 + 문자 2/3-gram, BM25 변형)
  diagnostics.ts      ★ 로그인 사용자의 실제 상태 스냅샷
  tools.ts            LLM 툴 정의 + 실행기
  prompt.ts           시스템 프롬프트 (페이지·사용자 맥락 주입)
  llm.ts              OpenAI/Gemini 스트리밍 + 툴 콜링

src/components/assistant/
  AssistantWidget.tsx 플로팅 버튼 + 상담 패널
  Markdown.tsx        답변용 최소 마크다운 렌더러 (외부 의존성 없음)

src/app/api/assistant/chat/route.ts       상담 (SSE 스트리밍)
src/app/api/assistant/feedback/route.ts   👍/👎
src/app/api/admin/assistant/route.ts      관리자 조회 + KB 추가
src/app/admin/assistant/page.tsx          AI 상담 운영 화면

supabase/migration_assistant.sql          대화·메시지·관리자 KB 테이블
```

---

## 3. 봇이 실제로 할 수 있는 것

| 툴 | 하는 일 |
|---|---|
| `search_kb` | 지식베이스 검색 (현재 화면 가중치 적용) |
| `open_kb` | 문서 본문 열람 — 답변 근거로 표시됨 |
| `get_my_status` | **실제 계정 조회** — 등록 상품 수, 연동 채널, 도우미 온/오프라인, 대기 주문·미답변 문의, 최근 등록 실패, 정산 보고서 상태, 결제 잠금, 페널티 |
| `list_recent_errors` | 최근 등록 실패 사유 원문 + 접수한 오류문의 |
| `create_support_ticket` | 1:1 문의 생성 (PT 회원, 동의 후) — 상담 전문이 자동 첨부 |
| `create_bug_report` | 오류문의 생성 (메가로드, 동의 후) |

첫 턴에는 계정 상태를 **미리 조회해서 프롬프트에 넣어둔다.** 툴 왕복 한 번을 아끼고, 첫 답변부터
"등록 상품 340개인데 품절동기화가 0건이네요" 같은 말이 나오게 하려는 것.

답변 안의 앱 경로(`/megaload/orders` 등)는 자동으로 **이동 버튼**이 된다.

---

## 4. 지식은 어디서 왔나

### 4-1. 사람이 쓴 것 (`kb/operator.ts`, `kb/troubleshooting.ts`)
`H:\내 드라이브\플라톤마케팅_쿠팡PT` 자료를 전수 검토해서 뽑았다.

- **교육내용(카톡·디코)** — 수강생 5명과의 실제 상담 전문
  발주 시 수취인 전화번호 사고, 마진 20% 근거, 상품명 브랜드 제거, 카테고리 오매칭(스킨에센스→헤어에센스),
  원가 인상 시 주문취소, 프로모션이 첫 매출을 연다는 것, 월 5,000개 목표, 화장품 vs 건기식 리스크 비교,
  건기식 수료증, 순위 상승 스팸 전화, 네이버페이 적립 카드, 빠른정산
- **쿠팡 대응/브랜드사 대응** — 맘스포뮬러 법무팀 메일 실물 → 상품번호로 찾아 삭제 → "상품 삭제했습니다" 회신까지의 전 과정
- **쿠팡 대응/쿠팡법 대응** — 쿠팡(CNS) 표시·광고 위반 메일 실물. **24시간 내 미확인 시 판매중지**, 소명 미제출 반복 시 계정 정지
- **쿠팡영상/메가로드 상품등록 영상** (11분) — 실제 등록 화면. 검증 대시보드, Dry-Run, 프리플라이트, 카나리 테스트,
  "이미 등록된 상품입니다(productCode 중복)" 실패, 품질체크 접속오류 99건
- **쿠팡영상/신선식품리뷰이미지사용영상** (3분) — 대표이미지 부족 시 리뷰 이미지 끌어쓰기, 셀러별 이미지 순서 차별화
- **교육내용/@nanos Discord** (8분) — 인터넷 속도(speed.nia.or.kr) 진단, 구버전 폴더 업로드 방식
- **매출사진 자료/블랙아웃자료** — 전환율 0.46%, 유입 검색 63.5% / 광고 31.1% (벤치마크)
- **매출내용/셀잇 광고 로아스** — 광고비 24만 → 전환매출 286만, ROAS 1,186% (벤치마크)

오류 문구는 지어내지 않고 코드에서 가져왔다 — `error-classifier.ts` 의 12개 `ErrorCategory`,
검증 화면의 품질 체크 상태(판매중/품절/삭제됨/확인불가/접속오류), 정산 게이트 3단계, 결제 락 3단계.

### 4-2. 앱에 이미 있던 것 (`kb/from-app-data.ts`)
아래를 **복사하지 않고 import 해서** KB 로 변환한다. 원본 문서를 고치면 봇 답변도 같이 바뀐다.

`guides.ts` · `guide-articles.ts` · `feature-tutorials.ts` · `onboarding-tutorials.ts` ·
`emergency-responses.ts` · `penalty-response-guide.ts` · `channel-setup-guides.ts` ·
`channel-onboarding-guides.ts` · `ad-tips.ts` · `ad-academy-stages.ts` · `scaling-guide.ts` ·
`growth-roadmap.ts` · `start-roadmap.ts` · `cs-templates.ts` · `contract-terms.ts`

### 4-3. DB (배포 없이 즉시 반영)
`faqs` · `notices`(최근 30건) · `assistant_kb_entries`(관리자가 직접 추가)

---

## 5. 지식을 늘리는 방법 (피드백 루프)

1. 사용자가 답변에 👎 를 누르면 그 대화가 기록된다.
2. 관리자 → **AI 상담 운영** (`/admin/assistant`) → **👎 받은 대화** 필터
3. 대화를 열고 **[이 질문으로 지식 추가]** → 제목·경로·대상이 자동으로 채워진 폼이 뜬다
4. 본문을 쓰고 저장 → **배포 없이 5분 내(캐시 TTL) 봇이 그 답을 한다**

코드에 넣어야 할 정도로 중요한 항목은 `kb/operator.ts` 에 추가하고 배포한다.

---

## 6. 운영에 필요한 것

### 환경변수
| 이름 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 권장 | 이미 상품명·상세 생성에 쓰는 키를 그대로 쓴다 |
| `GEMINI_API_KEY` | 대체 | OpenAI 키가 없을 때 OpenAI 호환 엔드포인트로 폴백 |
| `ASSISTANT_MODEL` | 선택 | 기본 `gpt-4o-mini` (Gemini 폴백 시 `gemini-2.0-flash`) |

둘 다 없으면 봇은 **KB 검색 결과만** 보여주고 카톡 상담을 안내한다. 화면이 깨지지는 않는다.

### 마이그레이션
```
supabase/migration_assistant.sql
```
**프로덕션(CoupangPT, ref dwfhcshvkxyokvtbgluw)에는 2026-09-15 적용 완료.**
assistant_conversations / assistant_messages / assistant_kb_entries + message_count 트리거.

다시 적용하거나 다른 환경에 넣을 때:
```
npx supabase db query --linked --project-ref <ref> -f supabase/migration_assistant.sql
```
(Supabase CLI 로그인 상태면 DB 비밀번호 없이 Management API 로 실행된다.
 Supabase SQL Editor 에 붙여넣거나 `DATABASE_URL=... node scripts/migrate.mjs` 도 가능.)

**적용 전에도 상담은 동작한다.** 대화 저장·👍👎·관리자 검토만 안 될 뿐이다
(테이블 없음 오류를 전부 삼키도록 만들어 뒀다).

---

## 7. 안전장치

- 비로그인 방문자는 개인 데이터 툴이 아예 붙지 않는다 (`toolSpecs` 가 로그인 여부로 분기).
- 남의 `conversationId` 를 보내도 이어지지 않는다 (profile_id / anon_key 소유 확인).
- 진단 결과에 구매자 이름·주소·전화를 담지 않는다. 집계 숫자만 낸다.
- 티켓·오류문의 생성은 "먼저 물어보고 동의 후"가 프롬프트에 박혀 있다.
- 답변은 `dangerouslySetInnerHTML` 없이 렌더한다 (자체 마크다운 파서, HTML 미지원 = XSS 여지 없음).
- 캡차 자동 뚫기·어뷰징 트래픽·가짜 리뷰는 안내하지 않는다고 프롬프트에 명시.
