# 네이버 스마트스토어 소싱 → 셀러 대량등록 시스템 설계도 v2

작성 2026-08-13 · 상태: **설계 확정, 구현 미착수**
원천 자료: `H:\내 드라이브\소싱 아이템 목록\naveritemv2\네이버_상품추출_이식_가이드.txt` (2,238줄, 기존 크롬 확장 프로그램의 완전 명세)

## 구현 현황 (2026-08-13)

| 단계 | 상태 |
|---|---|
| **P0** 예산 게이트 + 창 풀 + 클릭 네비게이션 + 차단/캡차 판정 | **코드 완료 · 실측 미검증** |
| P1~P6 | 미착수 |

P0 산출물
```
main/naver-gate.mjs                      전역 예산 게이트 (품절 모니터와 공유) — 자동검증 17/17 통과
main/modules/naver-ingest/inject.mjs     주입 JS (클릭 네비 · SPA 판정 · 차단/캡차 · 최소추출 · 418 감시)
main/modules/naver-ingest/browser.mjs    수집 창 (공유 파티션 · 워밍업 · 클릭 이동 · 리소스 차단)
main/modules/naver-ingest/window-pool.mjs 동시 창 풀 (개수 설정 · 3초 스태거 · 자동 감축 · 역할 분리)
main/modules/naver-ingest/runner.mjs     상품 1건 시퀀스 (재시도 6회 · 캡차 수동 대기 · 차단 쿨다운)
main/modules/naver-ingest/module.mjs     모듈 등록 · 관리자 게이트 · IPC
renderer/modules/naver-ingest/panel.*    창 개수 슬라이더 · 창별 상태 · 1건 테스트
main/modules/stock-monitor/naver-fetch.mjs  ← 게이트 통과하도록 개조(우선순위 monitor)
main/main.mjs                            ← setupServices 에서 게이트 init
```

⚠️ **아직 검증 안 된 것**: 클릭 네비게이션이 실제로 네이버 안티봇을 통과하는지. 이건 앱을 띄워
"1건 테스트" 를 눌러봐야 안다. P0 의 합격 기준이 바로 그것이다.

---

**v1 → v2 변경**: 입력 방식이 "관리자가 저장한 HTML 파일 파싱"에서 **"로컬 에이전트가 브라우저 자동화로 카테고리별 전량 수집"** 으로 바뀌었다. 기존 확장 프로그램에 캡차 풀이·차단 회피·DOM 매핑이 전부 완성돼 있어서, 사람이 HTML 을 저장할 이유가 없다.

---

## 🔴 0. 착수 전 필수 조치 — 노출된 API 키

이식 가이드 101~102행 / 116~117행에 **실제 OpenAI·Gemini 키가 평문으로** 들어 있다. 파일 위치는 Google Drive 동기화 폴더다.

1. 두 키 모두 **즉시 폐기·재발급**
2. 가이드 파일과 `.env` 를 `.gitignore` 에 추가 (레포에 절대 커밋 금지)
3. **새 설계에서는 도우미에 어떤 API 키도 심지 않는다.** 도우미는 사용자 PC 에 설치되는 Electron 앱이라 asar 를 풀면 문자열이 그대로 나온다. 키가 필요한 작업(캡차 Vision 등)은 **우리 서버를 프록시로 경유**하거나 **로컬 GPU 모델**로 처리한다(§7).

---

## 1. 한 줄 요약

```
관리자 도우미(Electron)
  ├ 네이버 카테고리 트리를 순회하며 상품 URL 수집 (스크롤 / 검색 API)
  ├ 상품 1건씩 클릭 네비게이션으로 진입 → SPA 대기 → 차단·캡차 판정 → DOM 전량 추출
  ├ 산출물 A: 로컬 폴더(product.json + 이미지)  → 기존 올인원 파이프라인 입력
  └ 산출물 B: 서버 업로드(URL·메타만)          → 네이버 소싱 카탈로그
                                                    ↓
                                        셀러가 골라 대량등록
                                        (유니크 SEO · 쿠팡 등록 파이프라인 재사용)
```

---

## 2. 가이드가 우리에게 주는 것 — 자산 대조표

| 기능 | 우리 현재 코드 | 가이드 | 판정 |
|---|---|---|---|
| 네이버 페이지 로드 | `naver-fetch.mjs` — `wc.loadURL(url)` **직접 이동** | **URL 직접 접근 금지.** 네이버 내부 페이지에서 `<a>` 만들어 **실제 마우스 이벤트 체인 클릭** | ⚠️ **우리가 틀렸다.** 직접 접근이 490/418 을 부른다. 품절 모니터가 429 스트릭에 시달린 원인 후보 |
| 세션 워밍업 | `warmUpSession()` — www.naver.com 1회 | naver → **클릭으로** shopping 이동 → 각 2~3초 체류 | 가이드가 우수 |
| 페이지 준비 판정 | `did-finish-load` | SPA 렌더 판정 (bodyText>500 ‖ og:title ‖ JSON-LD Product) | 가이드가 우수 |
| 차단 감지 | HTTP status + 에러 제목 | `isBlockedPage()` 5단계 + 429/418 구분 | 가이드가 우수 |
| 캡차 | **없음** (뜨면 그냥 실패) | 감지 → 이미지·질문 추출 → Vision 풀이 → 입력 → 제출 + **4중 가드** | 완전 신규 |
| 레이트 리밋 | 상품간 12~15초 고정 | 전역 토큰버킷 3~7초 + **전역 쿨다운(영속)** + 적응형 4레벨 | 가이드가 우수 |
| 상품 데이터 추출 | 제목·가격·품절만 | **전 필드** (브랜드/옵션/이미지 3종/리뷰/평점/고시/인증/해외직배송) | 완전 신규 |
| URL 수집 | 없음 | 스크롤 + **검색 API**(80건/페이지) + 1000개 한계 우회 | 완전 신규 |
| 산출 포맷 | — | `product.json` + `product_summary.txt` + 이미지 폴더 | **우리 `folder-scanner` 가 읽는 그 포맷** |

### ★ 가장 큰 발견

24-8 의 `product.json` 스키마와 24-9 의 `product_summary.txt` 는 **우리 올인원 파이프라인이 이미 먹고 있는 입력 포맷**이다. `folder-scanner.mjs` → `run-folder.mjs` 가 그대로 소비한다.

즉 이 가이드는 "새 수집기 명세"이면서 동시에 **기존에 우리가 겪던 입력 품질 문제의 정답지**다. 메모리에 남은 두 문제 —
- *"소싱 크롤러가 og:title 을 긁어 product.json 이 사실상 빈 상태"*
- *"원본 상품명이 분류 라벨 반복(`혼합곡/기타곡류 …`)·설명 문장으로 오염"*

— 은 이 가이드의 **JSON-LD 1순위 폴백 체인**(12-1)과 **저장 전 검증 게이트**(24-4: name 이 비었거나 'NAVER'/'Unknown' 이면 저장 거부)를 이식하면 근본적으로 사라진다.

### 2-2. 가이드 외에 원본 소스가 통째로 남아 있다

`H:\…\naveritemv2\naveritem\` 에 확장·서버·어댑터 원본과 문서가 그대로 있다. 구현 중 가이드로 부족하면 **원본을 직접 볼 수 있다**.

```
chrome_extension/{content.js, background.js, manifest.json, naver_to_coupang_map.js}
server.py                          app/crawler/adapters/{smartstore.py, naver.py}
app/utils/stealth.py               data/nav_category_map.json
CATEGORY_CRAWLING_GUIDE.md         CRAWLING_PROCESS.md   BATCH_PROCESSING_GUIDE.md
generate_category_mapping{,_ai}.py
```

**① `naver_to_coupang_map.js` — 493KB, 매핑 4,491개**
네이버 카테고리 **전체 경로 → 쿠팡 카테고리명** 사전이다.

```js
"가구/인테리어>DIY자재/용품>가구부속품>나사/못": "나사/못 세트",
```

- 이건 우리 **카테고리 오분류 문제의 앵커**로 값어치가 크다. 소싱 원본 카테고리를 앵커로 쓰면 "나주배 → 공기청정기", "맥주 → 가구" 류의 사고가 원천 차단된다
- ⚠️ 단, 매핑값이 **쿠팡 카테고리명(문자열)**이지 `displayCategoryCode` 가 아니다. 그리고 `generate_category_mapping_ai.py` 로 **AI 자동 생성된 것**이라 검증되지 않았다 (실제로 `가구바퀴 → "가구발커버"` 처럼 어긋난 항목이 보인다)
- → **권위값으로 쓰지 말 것.** 우리 카테고리 매처(baseline 99.42%)에 **후보 힌트로 주입**하고, 코드 해석과 최종 판정은 매처가 한다. 매처 자체는 광범위하게 손대지 않는다

**② `data/nav_category_map.json` — 3KB뿐**
이름과 달리 전체 트리가 아니라 **대분류 십여 개의 `navId` 만** 들어 있다(여성의류 10000107, 화장품/미용 10000111, 신선식품 10006530 …). 중·소분류는 없다.
→ 카테고리 워커의 **출발점 시드**로만 쓰고, 하위 분류는 런타임에 발견해야 한다(§5-2).

---

## 3. 아키텍처 — 도우미 안의 `naver-ingest` 모듈

기존 모듈(`stock-monitor`, `ads`, `allinone`)과 동형으로 붙인다. Flask 서버(8767)는 **이식하지 않는다** — 우리는 Electron + Node 이므로 그 역할을 메인 프로세스가 직접 한다.

```
worker/desktop/main/modules/naver-ingest/
  module.mjs          모듈 등록 · 관리자 계정에서만 활성 · 잡 루프
  browser.mjs         전용 파티션 BrowserWindow · 워밍업 · 클릭 네비게이션 · 인간행동
  window-pool.mjs     ★ 동시 창 풀 — 개수 설정 · 3초 간격 기동 · 차단 시 자동 감축 (§4-2)
  gate.mjs            ★ 네이버 단일 예산 게이트 (§4)
  detect.mjs          isBlockedPage / isCaptchaPage / is429 / 418 카운터
  captcha.mjs         캡차 감지·풀이 (§7)
  inject/extract.js   페이지에 주입할 추출 번들 (가이드 [12] 전체)
  inject/navigate.js  navigateViaClick (가이드 [4] 원문)
  collect-urls.mjs    카테고리별 URL 수집 — 스크롤 · 검색 API
  category-walker.mjs 카테고리 트리 순회 · 1000개 한계 우회 (§5)
  save-local.mjs      product.json / summary / 이미지 저장 (가이드 [24])
  upload.mjs          서버 업로드 (supabase-rest.mjs 재사용)
```

### 왜 Flask 를 버리는가
- 파이썬 런타임을 사용자 PC 에 또 깔 이유가 없다 (도우미는 이미 Electron + Node + Ollama 를 관리한다)
- 캡차 API 를 `localhost:8767` 로 두면 네이버 페이지에서 CORS 에 막힌다 — 가이드 2,212행이 직접 지적한 함정이다. Electron 메인 프로세스는 **CORS 밖**이라 이 문제가 원천적으로 없다
- 이미지 다운로드·리사이즈는 이미 있는 `sharp` / `thumbnail-processor.mjs` 로 대체

---

## 4. 🔴 네이버 단일 예산 게이트 — 이걸 안 하면 품절 모니터가 죽는다

**도우미는 이미 네이버에 요청을 보내고 있다.** `stock-monitor` 가 셀러들의 품절 감시를 위해 상품 페이지를 계속 연다. 과거에 여기서 429 증폭 루프로 크게 데였다(오류 상품을 백오프 없이 매 tick 재조회 → IP 계속 hot).

여기에 수집기가 **같은 PC · 같은 가정 IP** 로 초당 몇 배의 요청을 얹으면, 수집이 성공해도 **품절 모니터가 통째로 죽는다.** 그건 셀러들에게 직접 피해가 간다.

### 규칙

```
gate.mjs 는 프로세스 전역 단일 인스턴스다.
stock-monitor 와 naver-ingest 가 같은 게이트를 통과한다.

  acquireSlot(priority)      priority: 'monitor' > 'ingest'
  triggerCooldown(is429)     한쪽이 막히면 양쪽 다 정지
  cooldown 은 디스크에 영속   앱 재시작으로 회피 불가
```

- 우선순위: **품절 모니터가 항상 먼저.** 수집은 남는 예산만 쓴다
- 쿨다운은 반드시 **영속 저장**. 밴 중에 앱을 재시작해 즉시 재요청하면 단기 밴이 2~24시간 장기 밴으로 악화된다 (가이드 [11-B])
- 시계는 `performance.now()` — `Date.now()` 는 NTP 점프 때 토큰이 폭주한다 (가이드 함정 8)
- 권장 운영: **수집 전용 PC 를 분리**한다. 같은 IP 를 쓸 거면 수집은 야간(품절 모니터 한산 시간)에만 돌린다

기본 페이싱 = 요청간 3~7초(평균 5초), 분당 12회. 워커를 늘려도 총량은 게이트가 강제한다.

---

## 4-2. 동시 창(멀티 윈도우) — 관리자가 개수를 정한다

수집은 창 여러 개로 동시에 돌린다. 앱 설정에서 **창 개수를 조절**할 수 있다.

### 먼저 짚을 것 — 창을 늘리면 뭐가 빨라지고 뭐가 안 빨라지나

전역 게이트는 **"네이버로 나가는 페이지 진입 횟수"** 를 센다. 그런데 상품 1건 처리 시간(30~90초)의 대부분은 요청이 아니라 **페이지 안에서의 대기**다 — 상세 이미지 lazy-load 스크롤 2라운드, 리뷰 페이지 순회, 렌더 대기. 이 시간에 게이트는 놀고 있다.

```
창 1개 : [진입]──대기 50초──[저장]  [진입]──대기 50초──[저장]     → 시간당 약 60건
창 3개 : [진입]──대기──[저장]                                      게이트가 꽉 참
          5초 뒤 [진입]──대기──[저장]                              → 시간당 400~700건
              5초 뒤 [진입]──대기──[저장]
```

즉 창 개수는 **비어 있는 게이트 슬롯을 채워 상한까지 끌어올리는 장치**다. 게이트 자체를 넘지는 못한다 — 넘게 만들면 그게 곧 밴이다. 창을 20개로 올려도 총 요청량은 분당 12회 그대로고, 늘어나는 건 RAM 소모뿐이다.

**따라서 실효 구간은 2~4개다.** 가이드도 `CONCURRENT_TABS = 2` 를 권장 상한으로 적었다.

### 설정 항목

| 항목 | 기본값 | 범위 | 비고 |
|---|---|---|---|
| 동시 창 개수 | **3** | 1~6 | 4 초과는 처리량이 안 늘고 RAM 만 먹는다고 UI 에 명시 |
| 창 시작 간격 | 3000ms | 고정 | 창을 동시에 띄우면 그 자체가 봇 시그널 (가이드 [11-E]) |
| 프리셋 | 안전(1) / 표준(3) / 최대(4) | | |
| 차단 시 자동 감축 | 켬 | | 아래 참조 |

### 반드시 지킬 규칙 5가지

**1. 목록 수집은 창 1개 고정, 상세 추출만 병렬**
카테고리 목록은 한 창이 처음부터 끝까지 스크롤해야 이어진다. 여러 창이 같은 목록을 스크롤하면 중복만 쌓이고 418 위험만 커진다.
→ 창 배치: `1창 = 목록 수집 전담`, `나머지 N-1창 = 상세 추출`. 목록 잡이 없으면 전 창이 상세로 간다.

**2. 세션(파티션)은 전 창이 공유한다**
`persist:naveringest` 하나를 모든 창이 쓴다. 창마다 파티션을 나누면 **쿠키 없는 신규 방문자가 여러 명** 생기는 셈이라 오히려 봇으로 잡힌다. 우리가 원하는 그림은 "한 사람이 탭 3개 열어놓고 쇼핑 중"이다.

**3. 게이트·쿨다운은 창 수와 무관하게 전역 단일**
한 창이 차단당하면 **전 창이 같이 멈춘다.** 창별 쿨다운은 금지 — 한 창이 쉬는 동안 나머지가 계속 때려서 IP 밴이 누적된다(가이드 함정 9).

**4. 차단 시 창 수를 자동으로 줄인다**
적응형 속도 레벨이 오르면(차단 감지) 동시 창을 1개씩 줄이고, 연속 성공이 쌓이면 설정값까지 되돌린다. 관리자가 4로 놨어도 네이버가 싫어하면 알아서 2로 내려간다.

**5. 창에서는 이미지를 로드하지 않는다**
우리는 페이지에서 **이미지 URL 만** 뽑고, 실제 다운로드는 별도 HTTP 로 한다. 그러니 `image / media / font` 리소스를 차단해도 손해가 없다(이미 `naver-fetch.mjs` 가 쓰는 기법). 창 3개를 띄워도 메모리가 감당된다.
- 예외: 가이드 12-10 의 **리뷰 이미지 배경 균일도 점수화**는 실제 픽셀이 필요하다. 이건 브라우저 Canvas 로 하지 말고 **다운로드 후 로컬에서 `sharp`** 로 계산한다. 창 메모리도 아끼고 GPU Canvas 누수(가이드 함정 14)도 원천 회피된다.

### 창 상태 표시

앱 UI 에 창별로 한 줄씩: `창 2 · 상세추출 · 사과 카테고리 · 1234567890 · 리뷰 수집 중 (42초)`.
어느 창이 멈췄는지, 캡차를 만났는지 즉시 보이게 한다.

---

## 5. 카테고리 워커 — "각 카테고리별로 파싱해서 리스팅"

### 5-1. 카테고리 잡 큐 (서버가 소유)

```sql
naver_ingest_jobs (
  id, cat_id, cat_path,            -- 네이버 카테고리 ID / '패션의류>여성의류>티셔츠'
  sort_variant,                    -- REVIEW | RECENT | PRICE_ASC | PRICE_DESC | SALE
  target_count, collected_count,
  cursor JSONB,                    -- 스크롤 위치 / 페이지 인덱스 (중단 후 재개)
  status,                          -- queued | claimed | running | done | blocked | failed
  claimed_by, claimed_at, lease_expires_at,
  last_error, block_count
)
```

도우미는 `claim_naver_ingest_job(admin)` RPC 로 1건씩 가져간다. **RPC 안에서 관리자 여부를 검증**한다(§9). 리스가 만료되면 다른 세션이 이어받는다 — 이건 기존 `claim_llm_jobs` 와 동형이다.

### 5-2. 카테고리 트리는 런타임에 발견한다

전체 트리를 가진 파일은 **없다**(§2-2 ②). 대분류 시드에서 시작해 워커가 스스로 내려간다.

```
시드(대분류 navId 십여 개)
  → shopping.naver.com/ns/category/{catId} 진입
  → 하위 분류 링크 수집:  a[href*="/ns/category/"][class*="subCategory"]
                          a[href*="/ns/category/"]:not([aria-current="true"])
                          [class*="categoryTree"] a[href*="/ns/category/"]
  → href 의 /\/category\/(\d+)/ 로 id 추출 (현재 카테고리 자신은 제외)
  → 발견한 하위 분류마다 naver_ingest_jobs 행 생성 (재귀)
```

- 발견된 트리는 `naver_categories(cat_id, parent_id, name, path, depth, leaf)` 로 **서버에 캐시**한다. 한 번 훑으면 다음부터는 잡 생성이 즉시다
- 카테고리 메뉴 이동도 **직접 URL 금지** — 대분류 hover(800ms) → 중분류 탐색 → 클릭 (가이드 [15])
- 소분류(leaf)까지 내려가야 1000개 한계를 실질적으로 우회할 수 있다(§5-4)

### 5-3. URL 수집 — 화면을 실제로 보면서 긁는다 (검색 API 아님)

**결정: 검색 API(`search.shopping.naver.com/api/search/all`)는 쓰지 않는다.**
그건 XHR 엔드포인트를 직접 때리는 것이라 사람이 쇼핑하는 경로가 아니다. 클릭 네비게이션 원칙(§6 ①~②)과도 어긋나고, 차단 판정도 다른 규칙을 탄다. 가이드 [16] 은 **참고용으로만 남기고 구현하지 않는다.**

실제 경로는 사람이 쇼핑하는 그대로다.

```
① https://shopping.naver.com/ns/home 진입 (세션 워밍업 뒤)
② 대분류에 hover  → 800ms 대기          ← 메뉴가 그때 열린다
③ 중분류 링크 클릭                        ← a[href*="/ns/category/{midId}"]
                                            없으면 모든 a[href*="/ns/category/"] 중
                                            텍스트가 중분류명인 것. 8회 재시도(500ms)
④ 중분류에 hover → 800ms → 소분류 클릭
⑤ 목록 페이지 도착 → 무한스크롤로 상품 링크 수집
```

②~④ 어디에서도 **href 를 직접 열지 않는다.** 화면에 있는 실제 링크를 클릭한다(가이드 [15]).

#### 스크롤 루프 (가이드 [14])

```
maxScrolls = max(100, ceil(목표수 / 30) + 20)
종료 조건  = 신규 0건이 연속 10회 (418 이력이 있으면 5회로 단축)

각 회차:
  · 20% 확률로 부분 스크롤 먼저 (scrollHeight × 0.7~1.0) → 300~600ms
  · window.scrollTo(0, document.body.scrollHeight)
  · 2000~4000ms 랜덤 대기
  · 링크 수집:  a[href*="/products/"] · a[href*="/catalog/"] · a[href*="nvMid="]
               + data-href / data-url / data-link 속성
               + [data-nclick] → closest('a')
  · 8회마다  4000~7000ms 휴식
  · 15회마다 8000~12000ms 휴식
  · 수집량이 800~1200 구간이면 매 회차 500~1000ms 추가 대기  ← 418 직전 구간
```

- 스크롤 1회 = **전역 게이트 슬롯 1개**를 소모한다(§4). 스크롤도 결국 네이버에 요청을 보낸다
- **418 감시**: `window.fetch` 를 래핑해 `status === 418` 을 센다. 3회 누적되면 30초 정지 후 재개. ★ `try/finally` 로 감싸 **에러가 나도 `window.fetch` 를 반드시 원복**할 것
- 저장은 쿼리 제거: `href.split('?')[0]`

#### 목록 페이지에서 카테고리 경로를 함께 확보한다 (중요)

상품 페이지에 들어간 뒤 카테고리를 읽으면 사이드바 렌더링이 늦어 자주 실패한다. **목록 페이지에 있을 때** 미리 뽑아서 상품마다 붙여준다(가이드 12-3).

```
a[class*="categoryNode"][href*="search.shopping.naver.com/ns/category"] 를 순서대로 순회,
텍스트를 배열에 push 하다가 aria-current="true" 를 만나면 중단
→ join('>')  =  "식품>과일>사과"
```

이 값이 **카테고리 매칭의 앵커**가 된다(§2-2 ①과 연결).

#### `/catalog/` 링크는 수집하되 별도 취급한다

`/catalog/{id}` 는 개별 스토어 상품이 아니라 **가격비교 묶음**이다(판매자가 여럿). 위탁 소싱 대상이 아니므로 기본 제외하고, 필요하면 나중에 "묶음 안의 최저가 스토어 상품"으로 풀어내는 별도 작업으로 뺀다.

### 5-4. 1000개 한계 — 카테고리 전량 수집의 핵심

네이버는 한 카테고리/검색에서 **약 1000개 이후 418** 을 뿌린다. 대분류를 통째로 긁는 건 불가능하다. 두 가지로 쪼갠다.

```
(a) 하위 카테고리 분할   — 소분류까지 내려가면 각 1000개씩 확보
(b) 정렬 변형 5종        — 리뷰순 / 최신순 / 가격낮은순 / 가격높은순 / 판매량순
                            같은 카테고리를 5번 훑고 productCode 로 중복 제거
```

- **정렬 변경도 화면의 정렬 버튼을 클릭**해서 한다. URL 의 `sort=` 를 갈아끼워 여는 건 직접 접근이라 마지막 폴백으로만 둔다
- 정렬을 바꾸면 목록이 갈아엎어지므로 스크롤 루프를 처음부터 다시 돈다. 중복은 `productCode` 로 걷어낸다 — 실측상 정렬마다 겹치는 비율이 높아, 5회 훑어도 순증은 1000건의 2~3배 수준으로 보는 게 안전하다

→ 워커는 **소분류 단위로 잡을 쪼개고**, 900건 이상 수집됐는데 목표 미달이면 정렬 변형 잡을 자동 생성한다. 이게 "카테고리별 전량"의 실체다.

### 5-5. 규모 산정 (정직하게)

전역 게이트가 분당 12요청이므로:

```
URL 수집   : 스크롤 1회 ≈ 신규 30건, 회차당 5~8초(게이트 + 자체 대기 + 주기 휴식)
             → 카테고리 1개(1000건) ≈ 4~6분,  시간당 약 1만 건 URL
상세 추출  : 상품 1건 = 페이지 1회 + 상세 스크롤 + 리뷰 페이지 순회 → 실측 30~90초
             전역 게이트까지 감안하면 시간당 400~700건
```

**상세 추출이 병목이다.** 하루 24시간 무중단으로 약 1만~1.5만 건. 10만 건을 모으려면 1주일 이상 걸린다. 그래서:

- 티어를 분리한다 — **후보(candidate)는 URL+제목+가격만**으로도 카탈로그에 리스팅할 수 있다
- 상세 추출은 **관리자가 승인했거나 셀러가 관심을 보인 상품부터** 우선 처리한다
- 카테고리 워커는 "전부 훑기"가 아니라 **"카테고리별 상위 N건씩 넓게"** 가 기본 전략이다

---

## 6. 추출 1건 시퀀스 (가이드 [20] 을 우리 스택으로)

```
extractOne(url):
  productCode = /\/products\/(\d+)/         // 없으면 중단
  storeId 검증                               // search/products/category/best/new/sale/event 는 노이즈
  if (이미 수집됨) return skipped             // 서버 UNIQUE(product_no) + 로컬 로그 2중

  await gate.acquireSlot('ingest')           // §4 전역 게이트

  for (attempt of 1..6):
    await gate.waitCooldown()

    ① 이동      : 재사용 중인 탭에서 navigateViaClick(url)   ← loadURL 금지
    ② main URL  : '/main/products/' 면 리다이렉트 완료까지 20×500ms 폴링 + 2초
    ③ SPA 대기  : bodyText>500 ‖ og:title ‖ JSON-LD, 1초 간격 6회
    ④ 캡차 판정 : isCaptchaPage() 먼저!  (차단보다 우선 — 가이드 함정 4)
                  → 자동/수동 모드로 해결 (§7)
    ⑤ 차단 판정 : isBlockedPage() → gate.triggerCooldown(is429) → 재시도
    ⑥ 인간행동  : 랜덤 스크롤 2~4회 + mousemove + 상단 복귀
    ⑦ 추출      : extractProductFromDOM()  — 타임아웃 90초
                  (상세 이미지 lazy-load 스크롤 2라운드 + 리뷰 페이지 3곳 순회 때문)
    ⑧ 저장      : 로컬 폴더 + 서버 업로드 (§8)

    성공 → adaptiveSpeed.recordSuccess(); gate.resetStreak()
```

### 추출 필드는 가이드 [12] 를 그대로 옮긴다 (12-1 ~ 12-16)

**폴백 순서는 절대 바꾸지 않는다**: `JSON-LD → og:* → span.blind 접근성 라벨 → data-shp-* 속성 → 난독화 클래스 → 휴리스틱`.

난독화 클래스(`d7RuushwQU`, `sAla67hq4a` …)는 유통기한이 있는 값이다. 가이드 [23] 의 스냅샷 표는 "깨졌을 때 무엇을 고쳐야 하는지의 지도"로만 쓰고, **1순위 앵커로 쓰지 않는다.** 이건 우리가 `source-title.mjs` 에서 이미 같은 결론에 도달했던 원칙이다.

특히 중요한 것:
- **가격**(12-5) — `span.blind` 가 '상품 가격'인 요소의 부모에서 숫자 추출. 난독화에 강하다
- **리뷰 이미지**(12-10) — `img[alt="review_image"]` 가 앵커. 배경 균일도 점수화로 상품컷 우선 선별 → **우리 대표컷 자동선정과 직결**
- **인증정보**(12-13) — `a[data-shp-area-id="certification_link"]` 앵커. **KC 인증번호 누락 문제의 소스가 여기 있다**
- **상품정보고시**(12-12) — 구형 table / 신형 ul-li 두 구조 모두 파싱. 쿠팡 `notices` 에 직결

---

## 7. 캡차 정책 — 기본은 **수동**, 자동은 옵션

가이드에는 GPT-4o-mini Vision 자동 풀이가 완비돼 있다. 그런데 **테무 건에서 우리는 "캡차 우회는 안 만든다"고 결정**했었다(2026-08-12). 일관성을 위해 이렇게 나눈다.

### 모드 A — 관리자 수동 해결 (기본값)

캡차 감지 시 **숨겨둔 BrowserWindow 를 화면에 띄우고** 관리자에게 알린다. 사람이 직접 푼다. 풀리면 자동으로 수집이 이어진다.
- 사람이 캡차를 푸는 건 아무 문제가 없다 — 캡차의 본래 목적 그대로다
- 야간 무인 배치에서는 캡차가 뜨면 그 잡을 `blocked` 로 두고 다음 잡으로 넘어간다
- **이 모드만으로도 시스템은 완전히 동작한다.** 캡차는 페이싱을 지키면 자주 뜨지 않는다

### 모드 B — 자동 풀이 (관리자가 명시적으로 켤 때만)

가이드 [8]~[10] 을 이식하되 **키는 도우미에 넣지 않는다**:

```
도우미 → POST /api/megaload/naver-ingest/captcha   (우리 서버, 관리자 인증 필수)
       { imageDataUrl, question }
서버   → Vision 모델 호출 (키는 서버 환경변수에만 존재)
       → { answer }
```

- 서버 경유이므로 키 유출이 원천 차단되고, 호출량·비용을 서버에서 통제할 수 있다
- 대안: **로컬 GPU VLM**(`qwen2.5vl`)로 푼다. 우리는 이미 `vision-selector.mjs` 에서 이 모델을 쓰고 있다. 캡차는 "영수증 이미지에서 빈칸 값 읽기"라 로컬 VLM 으로 충분할 가능성이 높고 **비용 0**이다. 먼저 이쪽을 시도할 것
- 4중 가드는 필수: 질문 추출 직후 / Base64 변환 직후 / 서버 응답 직후 / 제출 직전에 **이미지 src 가 바뀌었는지 재확인**. 바뀐 캡차에 옛 정답을 넣으면 실패가 누적돼 장기 밴이 된다 (가이드 함정 7)

---

## 8. 산출물 2경로 — 로컬은 풍부하게, 서버는 가볍게

### A. 로컬 폴더 (가이드 [24] 그대로)

```
<수집루트>/2026-08-13/80-1/product_1234567890/
  main_images/  detail_images/  review_images/  product_info/
  product.json          ← 24-8 스키마
  product_summary.txt   ← 24-9 포맷
```

**이 폴더가 곧 올인원 파이프라인의 입력이다.** `folder-scanner` → `run-folder.mjs` 가 그대로 먹는다. 수집과 생성이 한 앱 안에서 이어진다.

- 배치 80개 단위 폴더, `extraction_log.json` 으로 중복 방지
- ⚠️ 저장 경로가 **Google Drive 동기화 폴더면 `f.flush()` 필수**, 로그 저장은 `PermissionError` 재시도 5회 (가이드 24-3). 레포가 Drive 경로라 `sharp` 부분동기화로 이미 데인 적이 있다
- 이미지는 **Referer 헤더 없으면 403** (가이드 [13]). `Referer: https://smartstore.naver.com/`

### B. 서버 업로드 — **이미지 본체는 절대 올리지 않는다**

```
서버에 올리는 것 : 텍스트 메타 + 이미지 URL(고해상도 변환된) + 옵션 + 고시 + 인증
서버에 안 올리는 것: 이미지 바이너리, Base64, 상세 원문 HTML 전량
```

이유는 비용이다. 상품 1만 건 × 이미지 30장 = 30만 장. 이걸 Storage 에 넣으면 저장비+전송비가 바로 터진다. 셀러가 실제로 등록을 누르는 그 상품만, **그 셀러의 도우미가 URL 에서 직접 받아 쿠팡에 업로드**한다 (우리 서버 미경유 — 올인원 로컬 직독과 같은 원칙).

이미지 URL 규칙(가이드 [13]):
```
고해상도화 : src.replace(/\?type=.*/, '?type=m10000_10000_no_rotate')
썸네일 제외 : /\?type=f\d+/ 매칭 시 skip
리뷰 판정   : src.includes('checkout.phinf')
중복 키     : src.split('?')[0]
```

---

## 9. 관리자 전용 — 클라이언트 게이팅은 신뢰하지 않는다

도우미는 사용자 PC 에 설치되는 앱이다. UI 를 숨기는 것만으로는 못 막는다. **서버가 막아야 한다.**

| 지점 | 검증 |
|---|---|
| 잡 클레임 | `claim_naver_ingest_job()` RPC 안에서 `profiles.role = 'admin'` 확인. 아니면 0건 반환 |
| 결과 업로드 | `POST /api/megaload/naver-ingest/upload` 에서 세션 role 재검증 |
| 캡차 프록시 | 같은 검증 + 계정별 호출 쿼터 |
| 앱 UI | 하트비트 응답의 `isAdmin` 으로 탭 노출 (편의 기능일 뿐, 보안 경계 아님) |

관리자 계정이 아니면 잡을 못 받으므로 수집 자체가 시작되지 않는다.

---

## 10. 서버 스키마 — `supabase/migration_naver_sourcing.sql`

```sql
-- 카테고리 잡 큐 (§5-1)
CREATE TABLE naver_ingest_jobs (...);

-- 배치/세션 기록
CREATE TABLE naver_ingest_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES profiles(id),
  cat_path TEXT, sort_variant TEXT,
  urls_collected INT DEFAULT 0, products_extracted INT DEFAULT 0,
  blocked_count INT DEFAULT 0, captcha_count INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);

CREATE TABLE naver_source_stores (
  store_no TEXT PRIMARY KEY, store_name TEXT, store_url TEXT,
  product_count INT DEFAULT 0,
  blocked BOOLEAN DEFAULT false, block_reason TEXT   -- 브랜드사·대형몰 제외
);

CREATE TABLE naver_source_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_no TEXT NOT NULL UNIQUE,          -- 멱등 키 (가이드의 productCode)
  store_no TEXT REFERENCES naver_source_stores(store_no),
  batch_id UUID REFERENCES naver_ingest_batches(id),
  url TEXT, url_type TEXT,                  -- smartstore | brand
  name TEXT NOT NULL, brand TEXT,
  price INT, original_price INT, discount_rate INT,
  shipping_fee INT DEFAULT 0, total_price INT,
  volume_weight TEXT,
  naver_category TEXT, coupang_category_code TEXT,
  main_image_urls TEXT[] DEFAULT '{}',
  detail_image_urls TEXT[] DEFAULT '{}',
  review_image_urls TEXT[] DEFAULT '{}',
  product_info JSONB DEFAULT '{}',          -- 상품정보 표
  product_notice JSONB DEFAULT '{}',        -- 상품정보제공고시 → 쿠팡 notices
  certifications JSONB DEFAULT '[]',        -- KC 등 → 쿠팡 certifications
  review_count INT DEFAULT 0, rating NUMERIC(3,2),
  categorized_reviews JSONB DEFAULT '{}',   -- 상세글 생성 재료
  related_tags TEXT[] DEFAULT '{}',         -- 검색태그 재료
  is_overseas BOOLEAN DEFAULT false,
  tier TEXT DEFAULT 'candidate' CHECK (tier IN ('candidate','detailed')),
  quality JSONB DEFAULT '{}', risk JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new'
    CHECK (status IN ('new','normalized','approved','rejected','published')),
  reject_reason TEXT,
  local_folder TEXT,                        -- 관리자 PC 산출 폴더 경로
  extracted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE naver_source_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id UUID REFERENCES naver_source_products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL, price_delta INT DEFAULT 0,
  sold_out BOOLEAN DEFAULT false, sort_order INT DEFAULT 0
);

CREATE TABLE naver_publish_map (
  source_product_id UUID PRIMARY KEY REFERENCES naver_source_products(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  published_at TIMESTAMPTZ DEFAULT now()
);
```

`categorized_reviews`(상품정보/고민/장점/효과/변화 5분류)와 `related_tags` 는 그냥 메타가 아니다 — **상세글 LLM 생성의 최고급 재료**다. 실제 구매자 언어가 들어 있어서 우리가 만들어 쓰던 페르소나 문장보다 낫다.

---

## 11. 셀러 노출 — 별도 카탈로그, 등록 백엔드는 재사용

- 셀러 화면: `/megaload/naver-catalog` (공급사 카탈로그와 분리)
- 승인 시점에 **시스템 공급사("네이버 소싱") 밑 `supplier_products` 로 1건 승격** → `naver_publish_map` 기록
- 이유: 유니크 SEO 레지스트리·판매가 범위 검증·`supplier_listings`·재고 배분·판매 귀속이 전부 그 FK 를 문다. 재구현하면 등록 파이프라인을 두 벌 유지해야 한다
- 정산 제외: `suppliers.commission_rate = 0`, `billing_status = 'skipped'`
- 셀러 UX: 다중 선택 → **판매가 일괄 규칙**(원가×마진% → 10원 반올림) → 큐 적재 → 도우미 순차 등록

---

## 12. 리스크 게이트

| 리스크 | 대응 |
|---|---|
| **저작권** — 남의 상세 이미지·문구 재판매 | 원본은 **참고 입력**으로만. 등록물은 올인원 LLM/VLM 전량 재생성. 원본 이미지 직등록 경로를 코드에서 차단 |
| **상표/정품** | `isProtectedCoupangBrand` + 가이드 24-4 의 지재권 브랜드 필터. 걸리면 `rejected` |
| **금지어** | account-risk-words(유기농/국산/국내산/포도당/수액) 재사용 |
| **해외직배송** | `isOverseas` 감지 시 기본 제외 (관세·배송기간·반품 문제) |
| **역마진** | 가이드 24-10 마진 티어 + 쿠팡 수수료/배송/반품 반영. 음수면 자동 제외 |
| **품절·가격 변동** | 승격 상품은 기존 stock-monitor 에 자동 등록 |
| **IP 밴 → 품절 모니터 동반 사망** | §4 단일 게이트 + 우선순위 + 야간 운영 + 수집 전용 PC 권장 |
| **네이버 계정 밴** | 로그인 세션을 쓰지 않는다. 비로그인 조회만 (검색 API 는 익명 쿠키로 동작) |
| **비용 폭증** | 이미지 서버 업로드 금지, 캡차 Vision 은 로컬 GPU 우선·서버 프록시에 쿼터 |
| **장시간 구동 OOM** | Canvas 는 `width=0;height=0`, MutationObserver/setInterval 해제, Base64 는 전송 직후 삭제 (가이드 함정 14·15) |

---

## 13. 단계 계획

| 단계 | 내용 | 검증 기준 |
|---|---|---|
| **P0** | `gate.mjs`(단일 예산) + `browser.mjs`(클릭 네비게이션·워밍업) + SPA/차단/캡차 판정 | 상품 1건 진입 성공 · 품절 모니터 무영향 확인 |
| **P1** | `extract.js` 이식 — 상품명·가격만 먼저 → 나머지 필드 순차 | 10건 연속 추출, name 검증 게이트 통과 |
| **P2** | 로컬 저장(product.json/summary/이미지) + 서버 스키마 + 업로드 | 산출 폴더를 `run-folder.mjs` 가 그대로 소비 |
| **P3** | 카테고리 메뉴 클릭 진입 + 트리 발견·캐시 + 스크롤 수집 + 잡 큐 + 1000개 우회 | 소분류 1개 전량 수집 |
| **P4** | 캡차 모드 A(수동) + 관리자 검수 UI `/admin/naver-sourcing` | 캡차 발생 시 알림·재개 |
| **P5** | 승격 → 셀러 카탈로그 `/megaload/naver-catalog` + 대량등록 | 셀러 1명이 10건 쿠팡 등록 |
| **P6** | 캡차 모드 B(로컬 VLM 우선) · 적응형 속도 · 야간 무인 배치 | 24시간 무중단 |

**P0 가 최대 관문이다.** 가이드도 체크리스트 [21] 에서 같은 말을 한다 — "navigateViaClick 으로 상품 1건 열기 성공시키기 ← 여기가 최대 관문".

---

## 14. 구현 시 절대 어기면 안 되는 것 (가이드 [22] + 우리 실측)

1. `loadURL`/`location.href` 직접 이동 금지 → 반드시 클릭 네비게이션
2. 매 상품 새 탭 금지 → 탭 재사용 (referrer 체인)
3. `did-finish-load` 만 믿고 추출 금지 → SPA 판정 필수
4. `isBlockedPage()` 는 **반드시 `isCaptchaPage()` 를 먼저** 확인
5. 캡차 이미지 폴백으로 "가장 큰 이미지" 쓰지 말 것 → 상품 이미지 오인
6. 쿨다운은 전역 + 디스크 영속 (재시작으로 회피 불가)
7. `Date.now()` 로 레이트 리밋 계산 금지 → 단조 시계
8. 상세 이미지는 스크롤 2라운드 후 수집 (lazy load)
9. 이미지 다운로드에 Referer 필수 (없으면 403)
10. 브랜드명 제거 시 단어 경계 필수 (`500mg` 에서 `MG` 가 지워져 `500` 이 되는 사고)
11. 난독화 클래스명 1순위 사용 금지 → JSON-LD/og/blind/data-shp 앵커 우선
12. 저장 전 name 검증 게이트 필수 (`''`/`NAVER`/`Unknown` 거부) — **우리 product.json 오염의 백신**
