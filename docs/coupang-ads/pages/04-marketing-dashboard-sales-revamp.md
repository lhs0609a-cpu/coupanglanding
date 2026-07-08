# 04 · 매출 성장 대시보드 (개편판 revamp) + 상품 드릴다운

- URL: `/marketing/dashboard/sales` (01과 같은 라우트지만 **개편된 UI** + 특정 캠페인 안으로 들어간 **상품(노출된 광고) 뷰**)
- 01과의 차이: 01은 **캠페인 목록**(행=캠페인, ON/OFF·예산연필·수정/삭제). 여기는 **캠페인 하나로 드릴다운**해 그 캠페인의 **상품별 성과**를 보여줌(행=상품). 개편 클래스 `dashboard-container-revamp`/`dashboard-table-revamp`/`dashboard-react-table-revamp`.
- 수집일: 2026-07-08 / 머프키치(A01526382). 기간 2026.07.01~07.07. `__NEXT_DATA__`(JWT+PII)·봇스크립트 저장 제외.

## ★ 새 신호 — 이미지 심사 위반 배너 (자동화 모니터링 대상)
상단에 두 배너 존재:
- `[data-bigfoot-component="image_audit_suppresion_banner"]` → **"광고 노출 제한 · 이미지 가이드 위반 상품 82개"**. 수정 버튼 `[data-bigfoot-component="edit_image"] button`, 스누즈 `[data-bigfoot-component="snooze"]`.
- `[data-bigfoot-component="image_audit_optin_banner"]` → 자동수정 옵트인. 버튼 `[data-bigfoot-component="see-details"]`.
→ **자동화가 읽어야 할 상태**: 위반 상품 수(정규식 "위반 상품 (\d+)개")는 광고 노출이 막힌 원인 지표. 01의 캠페인 "중지" 상태와 연결됨(이 계정 82개 상품 이미지 위반 → 노출 제한).

## 페이지 구조 (개편판)
- 루트: `[data-bigfoot-component="dashboard"].dashboard-container-revamp`
- 헤더: `h3` "광고 관리 매출 성장"
- 기간: `[data-bigfoot-component="date_range_picker"]` — 프리셋 버튼 `.sc-d9rqla-1`(어제/최근 7일/이번달), 표시 `.sc-1nljja5-0`(2026.07.01 ~ 2026.07.07), 드롭다운 `.dashboard-metric-widget-date-indicator-revamp`
- **전체 성과 요약 위젯** `[data-bigfoot-component="metric_widget"]`:
  - 지표 항목 `.widget-item` → 값 `.metric-value` (집행 광고비 0 / 광고 전환 매출 0 / 광고 수익률 0%)
  - 지표 추가: `[data-bigfoot-component="add_metric"] button`, 지표 제거: `.remove-widget`
  - 접기/펼치기: `[data-testid="toggle-collapse-button"]`
  - "광고 성과 자세히 보기" 링크(→ 광고보고서)
- **성과 그래프** `[data-bigfoot-component="performance_chart"]`:
  - 지표 선택 드롭다운 `[data-bigfoot-component="chart_metric_selection"]` ×2 (집행 광고비 / 광고 전환 매출)
  - 빈 상태 "이 기간의 데이터가 없습니다."

## 캠페인 성과 테이블 (드릴다운 = 상품별)
- 래퍼: `#dashboard-table[data-bigfoot-component="campaign_performance"]`
- 패널: `[data-bigfoot-component="products_table"]`
- **브레드크럼**: `.path-name__text` "모든 캠페인" → `.path-name--current` "노출된 광고". 캠페인명 `.page-name` "새 캠페인"(옆 APS 뱃지 img, 상태 blinker `.status-blinker` color #ff3330=중지)
- 지표 설정: `[data-bigfoot-component="campaign_list_add_metrics"]` ("키워드 외 9개")
- ReactTable `.dashboard-react-table-revamp` — 상품 행 `.rt-tbody .rt-tr`(현재 비어있음)
- **열 순서(상품 뷰)**: 상품명(고정좌측 `.rthfc-th-fixed-left-last`) / 상태 / 판매 방식 / 키워드 / 전환율 / 광고비 효율성(=광고수익률) / 집행 광고비 / 중요 결과(=광고 전환 매출) / 노출수 / 클릭수 / 클릭률 / 광고 전환 판매수 / 광고 전환 주문수
  - 정렬 가능 헤더: `.rt-sortable-header` + `.sorting-icon`
- 빈 상태: `.box--data-empty` "해당 기간내 노출된 상품이 없습니다. 오늘 노출된 상품목록은 24시간 이후 확인 가능해요"
- 페이지네이션: `.-pagination`(`.-previous`/`.-next`, `.-pageJump input`, `.-pageSizeOptions select`)

## 자동화 시사점
- **성과 수집(P2)은 두 레벨**: (a) 캠페인 레벨=01의 캠페인 목록 테이블, (b) 상품 레벨=여기 드릴다운 상품 테이블. 상품별 ROAS/전환율까지 필요하면 이 뷰를 긁어야 함.
- 상품 레벨엔 오늘 데이터가 24h 지연("24시간 이후 확인 가능") → 자동 수집 주기는 하루 1회 이후로.
- **이미지 위반 배너가 노출 제한의 근본 원인 지표**. 도우미가 이 배너의 위반 수를 읽어 "광고 왜 안 나가나" 진단에 활용 가능. 단, 이미지 자동수정은 상품 이미지를 실제로 바꾸므로(Wing 대표 이미지 변경) 실행은 허락 후.
- 개편판이라 클래스가 01과 다름(`*-revamp`) → 셀렉터는 `data-bigfoot-component` 우선(안정). 두 UI가 A/B로 갈릴 수 있으니 자동화는 `data-bigfoot-component` 존재 여부로 분기.
