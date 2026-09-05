# 05 · 광고보고서 (Ad Report)

- URL: `https://advertising.coupang.com/marketing-reporting/billboard`
- 역할: 광고 성과 리포트 + **파일 다운로드**. → **성과 수집(P2)의 정식 소스**(대시보드보다 정제된 집계·기간별·다운로드 지원).
- 앞 화면들과 **다른 마이크로프론트엔드**: 루트 `#ad-reporting-app`, 프록시 `/marketing-reporting`, 번들 `/marketing-reporting/assets/*.js`(Vite). 테이블이 **AG Grid**(01·04의 ReactTable 아님).
- 수집일: 2026-07-08 / 머프키치(A01526382). 기간 2026.06.01~06.30(이 계정 데이터 없음 → "데이터를 확인할 수 없습니다"). `__NEXT_DATA__`(JWT+PII)·봇스크립트 저장 제외.

## 리포트 타입 탭 `[data-bigfoot-component="report_type_tab"]`
`data-bigfoot-extra`의 `value`로 구분:
- `OnePagerReport` → **자동 광고 보고서**(기본 선택)
- `reports` → 광고 보고서(드롭다운)
- `settlements` → 광고비 정산 보고서(드롭다운, 일별 광고비 정산내역)
- `CustomReport` → 맞춤 보고서

## 자동 광고 보고서(OnePager) 구성
- 성과 범위 선택 `[data-bigfoot-component="report_type_selector"]`(`value`):
  - `VENDOR_AD_PERFORMANCE` → 전체 광고 성과(기본)
  - `CAMPAIGN_AD_PERFORMANCE` → 캠페인별 성과
- **기간 선택** `[data-bigfoot-component="metric_date_range_picker"]`:
  - 프리셋 `[data-bigfoot-component="date_range_tab"] button` — `data-bigfoot-extra` value `LAST_MONTH`(지난달)/`THIS_MONTH`(이번달)/`LAST_WEEK`(지난주)/`LAST_7_DAYS`(최근 7일)
  - 커스텀 `[data-bigfoot-component="date_range_picker"]` — 표시 `.sc-g8m65p-0`(2026.06.01 ~ 2026.06.30)
  - 공유 링크 아이콘 `.anticon-link`
- 요약 카드 `[data-bigfoot-component="vendor_ad_performance"]`: 광고 노출수 / 광고 클릭수 / 광고 전환 판매수 / 광고 수익률(각 `.simple-chart-total`)
- GMV 차트 `[data-bigfoot-component="vendor_gmv_metric_chart"]`: 지표 체크박스 `[data-bigfoot-component="metric_checkbox"]`(`value` `TOTAL_GMV`/`AD_GMV`/`AD_COST_SUM`), 값 `.gmv-metric-total-value`

## 주차별 광고 성과 테이블 (AG Grid) `[data-bigfoot-component="ad_performance_table"]`
- 그리드: `.ag-root-wrapper`(AG Grid), 헤더 `.ag-header-cell[col-id=...]`, 행 `.ag-row[row-index]`, 셀 `.ag-cell[col-id=...]`
- **열(col-id → 라벨)**:
  - `range` → 기간(고정좌측 `.ag-pinned-left-header`)
  - `impressions` → 노출수 / `clicks` → 클릭수 / `ctr` → 클릭률 / `cost_per_click` → 클릭당 비용
  - `orders` → 광고 전환 주문수 / `sales` → 광고 전환 판매수 / `conversion_rate` → 전환율
  - `ad_cost_sum` → 집행 광고비 / `ad_gmv` → 광고 전환 매출
- 정렬: 헤더 `aria-sort`, 클릭 시 `.sort-active` + `.sorting-icon`
- 빈 상태: `.ag-overlay-no-rows-wrapper` "데이터를 확인할 수 없습니다."
- 페이지네이션(숨김 가능): `.ag-paging-panel`
- **파일 다운로드**: 보고서 가이드에 "캠페인부터 키워드별 상세 데이터까지 [파일 다운로드] 클릭으로 한 번에" — 다운로드 버튼이 데이터 있을 때 노출(현재 계정 데이터 없어 미표시).

## 자동화 시사점
- **P2 성과 수집의 1순위 소스**. 대시보드(01·04)보다 집계가 정제되고 기간 프리셋·다운로드 지원. `col-id`가 고정 키라 안정적으로 파싱 가능(styled-components 해시 무관).
- 수집 흐름: `report_type_tab`=OnePager → `report_type_selector`=VENDOR 또는 CAMPAIGN → 기간 프리셋 클릭 → AG Grid 행 파싱(또는 파일 다운로드 후 파싱).
- **파일 다운로드 방식이 DOM 스크래핑보다 안정적**일 수 있음(CSV/Excel). 단 다운로드 URL·요청 파라미터 역설계 필요(네트워크 탭 캡처).
- AG Grid는 가상 스크롤이라 화면 밖 행은 DOM에 없음 → 전체 수집은 페이지네이션 순회 또는 파일 다운로드가 확실.
- 정산 보고서(`settlements` 탭)는 광고비 정산 내역(일별) — 비용 검증용, 별도 수집 화면 필요 시 추가.
- 봇탐지 동일(로그인 세션 필수).
