# 쿠팡 애즈(광고센터) 자동화 — HTML 레퍼런스 & 설계

쿠팡 애즈(`advertising.coupang.com`, 광고센터)는 일반 셀러에게 입찰/예산 관리 **공식 API가 없다.**
따라서 자동화는 **데스크톱 도우미(Electron+Chromium)가 로그인된 광고센터 화면을 DOM 조작**하는 방식이어야 한다.
이 폴더는 각 화면의 HTML을 수집·분석해 **안정적인 셀렉터 맵**과 **자동화 설계**를 축적한다.

## ⚠️ 보안 · 저장 규칙 (반드시 준수)
- 광고센터 페이지의 `__NEXT_DATA__` `<script>` 안에는 **실제 로그인 JWT(id_token)와 개인정보(전화·이메일·이름)**가 들어있다.
  → git에 **절대 저장 금지**. 페이지를 저장할 때는 `__NEXT_DATA__` 스크립트를 제거하거나 토큰/PII를 `[REDACTED]`로 치환한다.
- DOM(`<body>` 마크업) 자체에는 토큰이 없다. 필요한 건 DOM 구조뿐이므로 스크립트 블록은 저장하지 않는다.
- 실제 계정: 광고주 `머프키치`(vendorId `A01526382`, advertiserId `455312`, WING/POST_PAID). 셀러 계정(한정욱)이 관리하는 별도 광고주 계정으로 보임.

## 🚨 실행 위험 (설계는 자유, 실행은 허락 후)
이 자동화는 **실제 광고비·입찰·예산을 변경**한다(진짜 돈). 설계·HTML 저장·셀렉터 추출은 로컬에서 자유롭게 하되,
**실제 DOM 조작 실행(입찰/예산/ON·OFF 변경)은 규모 설명 후 명시적 허락을 받고** 켠다. (참고: 서버/비용 영향 수정 사전허락 규칙)

## 핵심 발견 — 앱 구조
- 껍데기는 Next.js SSR(`advertising.coupang.com`)이고, **실제 광고관리 SPA는 마이크로 프론트엔드 `cmg-self-service`**(front.coupangcdn.com)가 ES 모듈로 로드됨.
- **`data-bigfoot-component` 속성이 가장 안정적인 셀렉터**다. styled-components 해시(`sc-xxxx`)와 `cap-`/`css-` 클래스는 빌드마다 바뀌므로 의존 금지.
- 봇 탐지 존재: `/Jkxj/zro3/.../xTPhUDE3gB` (Akamai Bot Manager류 난독화 스크립트). → 헤드리스 차단 가능. **실제 로그인된 유저 프로필의 Chromium 세션 재사용 필수**(도우미가 이미 네이버/윙에 쓰는 방식).
- 청크 이름이 내부 모듈을 노출(자동화 대상 확인용): `CampaignsTable`, `AdGroupForm`, `MainCampaignDataInputGroup`, `TargetRoasCalcInput`, `OOBBudgetRuleInput`, `useBudgetInputValidator`, `AutomatedRuleModal`, `QuickCampaignModal`, `ad-config-api`(내부 API 클라이언트), `CpSwitch`(ON/OFF 토글), `KeywordBudgetProgressBar`, `budget-utils`, `campaignUtils`, `ROASTooltip`, `DateRangePicker`, `ChangeHistoryPage`.

## 수집한 페이지
| # | 화면 | 경로 | 파일 | 상태 |
|---|------|------|------|------|
| 01 | 광고관리 > 매출 성장(상품광고 캠페인 목록) | `/marketing/dashboard/sales` | `pages/01-marketing-dashboard-sales.md` | ✅ 분석 완료 |
| 02 | 광고 만들기 1단계(목표 선택) | `/marketing/campaign/type` | `pages/02-marketing-campaign-type.md` | ✅ 분석 완료 |
| 03 | **광고 만들기 2단계(등록 폼: 상품·예산·목표ROAS·기간)** | `/marketing/campaign/type`(동일 라우트 폼) | `pages/03-marketing-campaign-registration.md` | ✅ 분석 완료 — **P1 입찰+신규생성 셀렉터 확보** |
| 04 | 매출 성장 대시보드(개편판)+상품 드릴다운 | `/marketing/dashboard/sales` | `pages/04-marketing-dashboard-sales-revamp.md` | ✅ 분석 완료 — 상품별 성과(P2 2레벨)+이미지위반 82개 배너 |
| 05 | 광고보고서(AG Grid·파일 다운로드) | `/marketing-reporting/billboard` | `pages/05-marketing-reporting-billboard.md` | ✅ 분석 완료 — **P2 성과수집 정식 소스** |

## 아직 필요한 페이지 (보내주시면 이어서 저장·분석)
자동화 실행에 반드시 필요한 순서:
1. **캠페인 수정/상세** — 목록에서 `수정` 클릭 후 화면. 03(등록 폼)과 같은 컴포넌트를 `campaignId≠0`으로 재사용할 가능성 큼 → **한 장으로 03 셀렉터가 수정에도 적용되는지 검증** + 기존값 프리필 확인. (직접입력형이면 키워드별 입찰가 테이블 추가 확인)
2. **자동규칙** `/marketing/rule/dashboard` + `자동규칙` 모달(`AutomatedRuleModal`). → **쿠팡 자체 자동규칙(최소 ROAS→중지, 예산 규칙 등).** 활용하면 스크래핑을 줄일 수 있어 최우선 확인 대상.
3. **변경 이력** `/marketing/change-history` — 우리가 바꾼 내역 검증.
4. (선택) **직접입력(수동입찰) 캠페인** — 운영방식 `MANUAL` 선택 시 나오는 키워드별 입찰가 테이블.
5. (선택) 인지도 상승(브랜드광고) `/marketing/dashboard/reach`.
