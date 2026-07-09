# 02 · 광고 만들기 1단계 — 광고 목표 선택

- URL: `https://advertising.coupang.com/marketing/campaign/type`
- 역할: 새 캠페인 생성 플로우의 **1단계(목표 선택)**. 매출 성장(상품광고) vs 인지도 상승(브랜드광고) 선택 후 `다음`.
- 진입: LNB `광고 만들기` 버튼(`a.add-advertiser-button[href="/marketing/campaign/type"]`) 또는 목록 `캠페인 추가`.
- 수집일: 2026-07-08 / 머프키치(A01526382). `__NEXT_DATA__`(JWT+PII)·봇스크립트 저장 제외.

## ⚠️ 이 화면은 data-bigfoot-component가 없음
목록과 달리 목표 카드/버튼에 `data-bigfoot-component`가 **없다.** styled-components 클래스(`sc-1rgwm6o-*`, `sc-g856g8-*`)만 있으므로 **텍스트 매칭 + 시맨틱 클래스**로 잡아야 한다. (`sc-` 해시는 빌드마다 바뀜 → 텍스트가 1순위)

## DOM 구조
- 페이지 헤더: `.text--content-title` → "광고 등록", 설명 `.text--content-description` → "새 광고 캠페인을 등록할 수 있습니다."
- 목표 섹션 제목: `.title` → "광고 목표"
- **목표 카드**: `.goal-type-card` (컨테이너 `.sc-1rgwm6o-2` 안에 카드 `.sc-1rgwm6o-3`)
  - 선택된 카드에 `.active` 클래스 (기본값 "매출 성장"에 `active`, 체크 아이콘 표시)
  - 카드 제목: `.goal-type-card__title` → "매출 성장" / "인지도 상승"
  - 카드 설명: `.goal-type-card__content` (li: "중요 결과 지표: 광고 전환 매출" / "도달" 등)
  - **선택 조작**: 원하는 카드(`.goal-type-card__title` 텍스트로 찾기)의 상위 `.sc-1rgwm6o-3` 클릭 → `.active` 이동
- 하단 푸터(`.sc-g856g8-0`):
  - 뒤로: `.sc-g856g8-1` (텍스트 "광고관리로 돌아가기")
  - **다음**: `button.button--goto-registration.ant-btn-primary` (텍스트 "다음") → 2단계로 진행

## 목표 → 광고 유형 매핑
| 목표 카드 | 의미 | 다음 단계 |
|---|---|---|
| 매출 성장 | 상품광고(PA). 중요결과=광고전환매출 | 상품선택 → 예산/목표ROAS/기간 |
| 인지도 상승 | 브랜드광고(BA)/도달. 중요결과=도달 | (별도 플로우) |

## 자동화 시사점
- **신규 캠페인 자동생성(상품 자동등록 B-2)** 경로의 시작점. 흐름: 광고 만들기 → 목표=매출 성장 선택 → `다음` → (상품선택/예산/목표ROAS 입력) → 등록.
- 목표 선택은 텍스트 "매출 성장" 카드 클릭 + `.button--goto-registration` 클릭으로 자동화 가능.
- **다음 단계(상품 선택 + 예산·목표ROAS·기간 입력) HTML이 아직 필요** — `MainCampaignDataInputGroup`·`TargetRoasCalcInput`·`useSelectProducts`·`AdGroupForm` 청크가 그 화면에서 렌더됨. 이 입력창 셀렉터가 있어야 (a)신규생성 (b)입찰(목표ROAS) 조정 둘 다 자동화 완성.
- 참고: 캠페인 "수정" 화면도 이 입력 컴포넌트를 재사용할 가능성이 높음(같은 `MainCampaignDataInputGroup`). 수정 화면 1장이면 생성+수정 양쪽 셀렉터를 동시에 확보할 수 있음.
