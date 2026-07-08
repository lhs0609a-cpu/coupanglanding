# 01 · 광고관리 > 매출 성장 (상품광고 캠페인 목록)

- URL: `https://advertising.coupang.com/marketing/dashboard/sales` (SSR currentPath `/marketing/dashboard`)
- 역할: 상품광고 캠페인 목록 + 캠페인별 ON/OFF·예산·목표ROAS·성과. **입찰/예산 자동화의 메인 진입점.**
- 수집일: 2026-07-08 / 광고주 머프키치(A01526382)
- 원본 `__NEXT_DATA__`(JWT+PII) 및 봇스크립트는 보안상 저장 제외.

## 안정 셀렉터 원칙
1순위 `[data-bigfoot-component="..."]`, 2순위 시맨틱 클래스(`.dashboard-title`, `.simplify-compliance__budget`, `.ant-switch`, `.status__message`, `.rt-td`), 3순위 텍스트 매칭.
`sc-xxxx`/`cap-`/`css-77tu7h` 클래스는 **빌드마다 바뀌므로 셀렉터로 쓰지 말 것.**

## 계정 컨텍스트
- 광고주명: `.current-advertiser-name` → "머프키치"
- 업체코드: `.current-advertiser-detail dd` (첫번째) → "A01526382"
- (SSR 데이터) advertiserId 455312, channel WING, paymentModel POST_PAID, segment CHURNED

## 좌측 네비(LNB) — `data-menu-id` 접미사로 매칭
| 메뉴 | href | data-menu-id 끝 |
|---|---|---|
| 광고 요약 | /dashboard | -dashboard |
| 매출 성장 | /marketing/dashboard/sales | -ads-management-sales |
| 인지도 상승 | /marketing/dashboard/reach | -ads-management-reach |
| 추천 | /marketing/recommendation | -recommendation |
| 상품 기회 탐색 | /marketing/product-dashboard | -product-explorer |
| 프로모션 관리 | /marketing/promotion-product | -promotion-product |
| 변경 이력 | /marketing/change-history | -change-history |
| 공유예산 | /marketing/budget-sharing | -budget-sharing |
| **자동규칙** | /marketing/rule/dashboard | -automated-rule |
| 상세페이지 관리 | /merchandising/sdp | -sdp-management |
| 광고보고서 | /marketing-reporting/billboard | -ad-reporting-billboard |
| 디스플레이 광고 | /display-ad/da | -display-ad |
- 광고 만들기: `a.add-advertiser-button[href="/marketing/campaign/type"]`

## 캠페인 테이블 (자동화 핵심)
- 래퍼: `#dashboard-table[data-bigfoot-component="campaign_performance"]`
- 테이블 패널: `[data-bigfoot-component="campaigns_table"]`
- ReactTable: `.rt-table` → 헤더 `.rt-thead`, 바디 `.rt-tbody`
- **행**: `.rt-tbody .rt-tr-group .rt-tr` (행마다 아래 `.rt-td`들이 고정 순서로 존재)

### 열 순서와 값(관측 캠페인 "새 캠페인")
| idx | 열 | 셀렉터(행 기준) | 값/조작 |
|---|---|---|---|
| 0 | 캠페인 이름 (고정좌측) | `.rthfc-td-fixed-left [data-bigfoot-component="campaign_name"] .dashboard-title` | "새 캠페인". 마우스오버 시 `[data-bigfoot-component="edit_button"]`(수정)·`[data-bigfoot-component="delete_button"]`(삭제) 노출 |
| 1 | **ON/OFF** (고정좌측last) | `.rthfc-td-fixed-left-last button.ant-switch[role="switch"]` | `aria-checked`/`.ant-switch-checked` = ON. **클릭=캠페인 켜기/끄기** |
| 2 | 상태 | `[data-bigfoot-component="campaign_status"] .status__message` | "중지" (+서브 "모든 광고 중지됨", blinker color #ff3330) |
| 3 | 진단 및 추천 | 텍스트 "권장 예산 미충족" + 추천 보기 버튼 | |
| 4 | 주간 예산 점수 | `.sc-17lk8fk-0` | "-" |
| 5 | **예산** | `.simplify-compliance__budget` (금액) + `.simplify-compliance__icon-pencil`(연필=인라인 수정) | "10,000" 원. **연필 클릭→예산 편집** |
| 6 | 광고비효율성/**광고수익률** | 셀 첫 줄=실제ROAS "0%", 둘째 줄 "목표 900%" | **목표 ROAS = 입찰 대체 레버** |
| 7 | 상품 | 텍스트 | "자동 운영" |
| 8 | 오늘 누적광고비 | `.sc-n7h3ex-0 .flex-item.box--content` | "0원" |
| 9 | 집행 광고비 | 동일 | "0원" |
| 10 | 중요결과(광고전환매출) | `span` | "0원" |
| 11 | 전환율 | flex-item | "0 %" |
| 12 | 클릭률 | | "0 %" |
| 13 | 노출수 | | "0 회" |
| 14 | 클릭수 | | "0 회" |
| 15 | 광고전환판매수 | | "0 회" |
| 16 | 광고전환주문수 | | "0 회" |
| 17 | 시작 날짜 | `.rt-td` 텍스트 | "2026.01.14" |
| 18 | 종료 날짜 | | "종료일 없음" |
| 19 | 광고 운영 방식 | | "자동운영 - 매출최적화" |

- 페이지네이션: `.-pagination` (`.-previous/.-next .-btn`, `.-pageJump input[type=number]`, `.-pageSizeOptions select`)
- 캠페인 추가: `[data-bigfoot-component="add_campaign"] button`
- 검색·필터: `[data-bigfoot-component="filter_sorting"]`
- 기간선택: `[data-bigfoot-component="date_range_picker"]` — 어제/최근7일/이번달 버튼 `.sc-d9rqla-1`, 표시 `.sc-1nljja5-0`
- 상단 성과요약 위젯: `[data-bigfoot-component="metric_widget"]` → 전체집행광고비/집행광고비/광고전환매출/광고수익률 값 `.metric-value`

## 관측 상태(이 계정)
캠페인 1개. 캠페인 스위치는 ON이지만 상태=중지("모든 광고 중지됨") — 쿠팡 자동규칙(최근7일 광고비>매출→전체중지) 또는 예산 사유로 추정. 예산 10,000원, 목표 ROAS 900%, 매출최적화(target-ROAS) 모드, 종료일 없음.

## 자동화에 주는 핵심 시사점
- **매출최적화(자동운영) 캠페인의 입찰 조정 = 키워드 입찰이 아니라 "목표 광고수익률(ROAS)" 값 변경**이다.
  → 우리 P1 "입찰 자동조정"의 실제 조작 = (a) 수정 화면에서 목표 ROAS 입력값 변경, (b) 예산은 목록 연필 인라인 편집, (c) ON/OFF는 `ant-switch` 클릭.
  → 청크 `TargetRoasCalcInput`·`useBudgetInputValidator`·`OOBBudgetRuleInput` 존재가 이를 뒷받침. 정확한 입력창 셀렉터는 **캠페인 수정 화면 HTML 필요**.
- **직접입력(수동입찰) 캠페인**이라면 키워드별 입찰가 테이블이 별도로 있음 → 그 화면도 필요.
- 목록 값은 대부분 `data-bigfoot-component` 또는 시맨틱 클래스로 읽을 수 있어 **성과 수집(P2)에 바로 활용 가능**.
- 봇 탐지 때문에 **반드시 유저가 로그인해 둔 Chromium 세션**에서 동작해야 함(신규 헤드리스 로그인 지양).
