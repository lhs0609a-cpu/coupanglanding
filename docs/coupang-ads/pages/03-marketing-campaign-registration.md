# 03 · 광고 만들기 2단계 — 캠페인 등록 폼 (핵심)

- URL: `https://advertising.coupang.com/marketing/campaign/type` 에서 목표=매출 성장 선택 후 렌더되는 **등록 폼**(SSR currentPath `/marketing/campaign/type`, query.path 동일). 별도 URL 없이 같은 라우트에서 폼이 그려짐.
- 역할: **신규 캠페인 생성의 모든 입력창**(기본설정·상품선택·운영방식·예산·목표ROAS·상세). → **P1 입찰(목표ROAS)조정 + 신규생성 B-2 자동화의 핵심 셀렉터 소스.**
- 수집일: 2026-07-08 / 머프키치(A01526382). `__NEXT_DATA__`(JWT+PII: capUserId 387056, mari10, 양보름 등)·봇스크립트 저장 제외.
- 관측 컨텍스트: campaignId `0`(신규), campaignType `new`, goalType `sales`. **수정 화면은 같은 컴포넌트를 campaignId≠0으로 재사용할 가능성 큼** → 이 셀렉터 맵이 수정에도 대부분 적용될 것.

## 앵커(진행바) — 3섹션
`.ant-anchor-link` 3개: `#basic-setting`(기본 설정) / `#ad-setting`(광고 설정) / `#detailed-setting`(상세 설정). 현재 섹션 `.current-anchor`.

## 1) 기본 설정 `#basic-setting`
- **캠페인 이름**: `.campaign-name-input input.ant-input` (value "새 캠페인", 접미 글자수 `.ant-input-suffix` "5/150자")
- **기간 설정**(`.upper-radio-group`):
  - 종료일 없음(기본): `input.ant-radio-input[data-testid="no-end-date"][value="false"]` (checked)
  - 특정 기간: `input.ant-radio-input[value="true"]`
  - 날짜: `.ant-picker-range` — 시작일 `input[placeholder="시작일"]`(value "2026-07-08"), 종료일 `input[placeholder="종료일 없음"]`(특정기간 선택 시 활성). 종료일 없음일 땐 래퍼 `.end-date-disabled`.

## 2) 광고 상품 설정 `[data-bigfoot-component="ad_group_form"]` `#ad-setting`
- **광고 그룹 이름**: `#reg_ad_group_name` (value "새 광고 그룹")
- **광고 상품 설정 방식**(radio):
  - `input[value="MANUAL_SELECTION"]` 수동 상품 설정 (기본 checked)
  - `input[value="AUTO_SELECTION"]` AI스마트광고 — **이 계정은 disabled**("AI스마트광고 캠페인이 이미 운영 중" — 계정당 1개 제한)
- **상품 선택 영역**:
  - 좌: 전체 상품 `.available-items-pane`
    - 탭: `[data-bigfoot-component="normal_registration"]`(일반 등록, active) / 대량 등록 `#rc-tabs-0-tab-bulk`
    - 검색: 기준 셀렉트 `.ant-select-selection-item`("상품명"), 검색창 `input[placeholder="판매 상품을 검색해보세요"]`
    - 리스트(가상 스크롤): `.virtualized-list` — 비었을 때 `.sc-12cfp88-1` "상품이 없습니다."
    - 필터 체크박스: "노출수 부족" `input[data-testid="show-cold-start-items-checkbox"]`, (disabled) 매출상승예상/최근인기/누적인기
    - 페이지네이션: `.vendor-item-pagination .ant-pagination`
  - 우: 선택한 상품 `.added-items-pane`
    - **선택 개수**: `.sc-1wxomfy-3 .count` (관측 "0")
    - 전체삭제: `[data-bigfoot-component="delete_all_vendor_item"] button`
    - 상품 효율지수 진행바: `.overlay--conversion-compliance`(최소/권장 마커)
    - 선택목록: `.sc-u6w3bh-1 .virtualized-list` — 비었을 때 "선택된 상품이 없습니다"
  - **자동화 조작**: 좌측 검색 → 결과 행 클릭 = 우측으로 이동. (행에 `data-bigfoot-component` 없음 → 텍스트/상품ID 매칭 필요. 상품 미선택 시 하단 목표ROAS 추천값 등이 확정 안 될 수 있음)

## 3) 광고 운영 방식 (입찰 모드 결정 — 중요)
상품 선택 전엔 안내만 표시(`상품을 먼저 선택해주세요`). radio group `.sc-cg0pg5-0`:
- **자동운영** `input[value="AUTO"]` (기본 checked) — "키워드와 입찰가를 자동으로 운영"
  - 하위 목표(`.sc-g7vaoe-3`):
    - 매출최적화 `input[value="PRODUCT_TARGET_ROAS"]` (checked) — target-ROAS 모드 = **목표ROAS가 입찰 레버**
    - 매출스타트 `input[value="PRODUCT_TARGET_BUDGET"]` — 예산소진/노출최대화
- **직접입력** `input[value="MANUAL"]` — "키워드와 입찰가를 직접 조정" (→ 이걸 고르면 키워드별 입찰 테이블 등장, 별도 수집 필요)

## 4) 광고 예산 설정 `[data-bigfoot-component="budget_setting"]`
- 폼: `[data-bigfoot-component="budget_form"]`
- 과금/예산운영: 고정 텍스트 "CPC / 탄력적 예산 운영"(일예산 최대 1.2배)
- **일예산 입력**: `input[data-testid="budget-input"].ant-input` (placeholder "예)30,000", 접미 addon "원")
- **추천 예산**: `a[data-bigfoot-component="pa-campaign-edit-budget-recommendation"]` — 텍스트 "30,000원", `data-bigfoot-extra`에 `recommendedValue:30000` 등 포함 → **DOM에서 추천 예산 파싱 가능**
- 자동규칙(OOB 예산부족 대응) 토글: `.OOB-BR__title-wrapper button.ant-switch[role="switch"]` (기본 OFF)

## 5) 목표 광고수익률 설정 `[data-bigfoot-component="target_roas"]` — P1 입찰의 실제 레버
### ★ DOM에서 추천값·분포를 직접 읽을 수 있음 (자동화에 결정적)
`[data-bigfoot-component="target_roas_configuration"]` 요소의 `data-bigfoot-extra`(JSON)에:
- `recommendedValue: "420"`
- `distributionMetrics`: P10=310, P20=350, P30=365, P40=375, **P50(중앙값)=420**, P60=475, P70=520, P80=620, P90=810
- `optionsDetail`: aggressive=355(P25), balanced=420(P50), conservative=585(P75)
→ 상품/캠페인마다 이 값이 다르므로, **자동화가 이 JSON을 파싱해 목표ROAS를 결정**할 수 있음(경쟁 대비 공격/균형/보수).

### 조작 셀렉터
- 옵션 카드(각각 `[data-bigfoot-component="pa_registration_target_roas_options"]`, `data-bigfoot-extra`의 `optionSelected`/`toBeValue`로 구분):
  - aggressive 355%(적극적 노출), balanced 420%(안정적, 기본 선택), conservative 585%(소극적), manual(직접입력)
  - 선택 상태: 선택된 카드 테두리 `rgb(52,106,255)` + 라디오 dot(인라인 스타일). `data-bigfoot-click="true"` 있음.
- **직접 입력**: manual 카드의 `.v3-roas-input input.ant-input` (placeholder "420", maxlength 6, addon "%")
  → **P1 자동 입찰조정 = 이 입력창에 목표ROAS 값 write** (또는 aggressive/balanced/conservative 카드 클릭)

## 6) 상세 설정 `#detailed-setting`
- 할인쿠폰 자동 적용 토글: `button[data-testid="ad-discount-optin-switch"].ant-switch` (기본 ON)
- 자동규칙 안내 배너 `[data-bigfoot-component="pa_promo"]` 등
- 키워드 제외(접힘): `.toggle-mode.sub-section` — textarea + 추가 버튼, 제외 키워드 테이블(자동운영에도 노출)

## 7) 하단 액션 `[data-bigfoot-component="pa_form_buttons"]`
- **완료**: `footer button.ant-btn-primary`(텍스트 "완료") — **입력 유효 전까지 `disabled`** (상품 미선택 등)
- 이전: `button.ant-btn-secondary`
- 광고관리로 돌아가기: `button.button--goto-dashboard`

## 8) 검토(리뷰) 팝업 `[data-bigfoot-component="review"]`
완료 시 검토 화면(`.hide` 상태로 미리 존재). `.ant-descriptions`로 광고목표/기본설정/상품/운영방식/예산/목표ROAS/상세 요약. 성과 저하 우려 시 nudge(`troas_increase_prevention_warning_confirm`). 여기 `완료` 버튼으로 최종 제출.

## 자동화 시사점 (요약)
- **P1 입찰조정(목표ROAS)**: 수정 화면 진입 → `.v3-roas-input input`에 값 write 또는 aggressive/balanced/conservative 카드 클릭 → 완료. 추천/분포는 `target_roas_configuration`의 `data-bigfoot-extra` JSON에서 읽음.
- **예산 변경**: `input[data-testid="budget-input"]`에 write (또는 목록의 연필 인라인 편집 — 01 참고). 추천은 `pa-campaign-edit-budget-recommendation`의 extra.
- **신규 생성(B-2)**: 캠페인명 → 기간 → (상품 검색·클릭) → 운영방식 AUTO/PRODUCT_TARGET_ROAS → 예산 write → 목표ROAS 선택 → 완료(disabled 해제 확인) → 리뷰 완료.
- **모드 분기**: `AUTO`(자동운영)면 목표ROAS/예산이 레버, `MANUAL`(직접입력)이면 키워드별 입찰 테이블이 별도 등장 → 수동입찰 캠페인 자동화하려면 그 화면 HTML 추가 수집 필요.
- 상품 행·목표 카드 다수가 `data-bigfoot-component`/`data-bigfoot-extra`를 가지므로 목록(01)만큼 안정적. 단 상품 리스트 개별 행은 텍스트/상품ID 매칭.
- 봇탐지 회피 위해 **로그인된 Chromium 세션**에서만 조작(01·02와 동일).
