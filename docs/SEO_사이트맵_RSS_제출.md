# 사이트맵 · RSS 제출 절차

www.megaload.co.kr 의 색인용 피드는 전부 코드에서 생성된다. 별도 파일을 public 에 올리지 않는다.

| 주소 | 생성 파일 | 내용 |
| --- | --- | --- |
| https://www.megaload.co.kr/sitemap.xml | `src/app/sitemap.ts` | 공개 URL 전체(홈·PT·프로그램·가이드·채널가이드·약관 등) |
| https://www.megaload.co.kr/rss.xml | `src/app/rss.xml/route.ts` | 콘텐츠 문서만(가이드 아티클 8 + 채널 입점 가이드 7 + 오픈마켓 비교 1) |
| https://www.megaload.co.kr/coupang/category/sitemap.xml | `src/app/coupang/category/sitemap.ts` | 쿠팡 카테고리 문서 **11,657개** (색인 대상만) |
| https://www.megaload.co.kr/robots.txt | `src/app/robots.ts` | 크롤러 규칙 + 위 사이트맵·RSS 주소 고지 |
| https://www.megaload.co.kr/llms.txt | `src/app/llms.txt/route.ts` | AI 검색 크롤러용 요약 |

sitemap 과 RSS 는 역할이 다르다. sitemap 은 "이 URL들이 존재한다", RSS 는 "새로 쓰거나 고친 문서가 이거다".
네이버는 두 경로를 따로 돌리고 신규 문서 수집은 RSS 쪽이 눈에 띄게 빠르므로 **둘 다 제출한다.**

---

## 0. 대표 도메인은 www 다

apex(`megaload.co.kr`)는 Vercel 에서 `www.megaload.co.kr` 로 307 리다이렉트된다.
**코드의 `SITE_URL` 도 전부 www 기준이다**(2026-09-24 통일). sitemap `<loc>`, canonical,
RSS `<link>`, llms.txt 가 모두 www 를 가리킨다.

검색엔진에는 **www 속성으로 등록**한다. apex 로 등록하면 모든 URL이 리다이렉트를 한 번 더
거치고, 네이버는 그런 사이트맵/RSS 를 수집 실패로 처리하는 경우가 있다.

소유확인 메타태그(`src/app/layout.tsx` 의 `verification`)는 같은 앱이 두 도메인에 다 응답하므로
**www 속성에서도 같은 태그로 즉시 확인된다.** 새 토큰을 받을 필요가 없다.

---

## 1. 네이버 서치어드바이저 (가장 중요)

https://searchadvisor.naver.com → 웹마스터도구 → 사이트 선택

1. **사이트 소유확인** — www 속성을 새로 추가하고 소유확인한다(apex 속성은 그대로 둬도 된다). 메타태그 방식이고 토큰은 `src/app/layout.tsx` 의
   `verification.other["naver-site-verification"]` 에 박혀 있다 (env `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` 이 있으면 그쪽 우선).
   소유확인이 풀리면 색인이 통째로 멈추므로 이 값을 건드리지 않는다.
2. **요청 → 사이트맵 제출** — `sitemap.xml` 입력 후 확인. (도메인 뒤 경로만 넣는 칸이다)
   이어서 `coupang/category/sitemap.xml` 도 **따로 한 번 더** 제출한다. 사이트맵은 여러 개 등록된다.
3. **요청 → RSS 제출** — `rss.xml` 입력 후 확인.
4. **요청 → 웹페이지 수집** — 새로 쓴 문서 URL을 직접 넣으면 즉시 수집 요청이 간다. 하루 한도가 있으니
   중요한 글(가이드 아티클)에만 쓴다.
5. 제출 후 **검증 → 로봇스룰 검증 / 웹페이지 최적화**로 오류가 없는지 본다.

반영 확인: 제출 직후 "성공"이 떠도 실제 수집까지는 며칠 걸린다.
**검색 반영 현황**과 `site:www.megaload.co.kr` 검색으로 확인한다.

## 2. 구글 서치 콘솔

https://search.google.com/search-console

1. 색인 생성 → **Sitemaps** → `sitemap.xml` 제출.
2. 같은 화면에 `coupang/category/sitemap.xml` 과 `rss.xml` 도 추가 제출.
   구글은 RSS 를 사이트맵의 한 종류로 받는다.
3. 개별 문서는 상단 검색창에 URL을 넣고 **색인 생성 요청**.

## 3. 빙 웹마스터 도구

https://www.bing.com/webmasters — Sitemaps 에 `sitemap.xml`, `coupang/category/sitemap.xml`, `rss.xml` 모두 등록.
구글 서치 콘솔 계정에서 사이트를 그대로 가져오는(Import) 기능이 있다.

## 4. 다음(카카오)

https://register.search.daum.net/index.daum — 신규 등록 폼에 사이트 주소만 넣으면 된다.
다음은 사이트맵 제출 창구가 따로 없고 robots.txt 의 `Sitemap:` 줄을 읽는다. 이미 들어 있다.

---

## 유지보수 — 날짜를 손으로 올려야 하는 곳

`lastmod` / `pubDate` 에 `new Date()` 를 쓰면 배포할 때마다 모든 문서가 "오늘 수정됨"으로 나간다.
구글은 신뢰할 수 없는 lastmod 를 무시하고, 네이버는 변경 없는 문서를 반복 수집한다.
그래서 **내용을 실제로 고친 날짜를 상수로 박아둔다.** 문서를 고칠 때 같이 올린다.

| 상수 | 파일 | 대상 |
| --- | --- | --- |
| `STATIC_UPDATED` | `src/app/sitemap.ts` | 홈·/pt·/program·/guide·/start 등 정적 페이지 |
| `LEGAL_UPDATED` | `src/app/sitemap.ts` | /terms·/privacy·/refund |
| `CHANNEL_GUIDE_UPDATED` | `src/app/sitemap.ts`, `src/app/rss.xml/route.ts` | 채널 입점 가이드 — **두 파일 값을 같게 유지** |
| `COMPARISON_UPDATED` | `src/app/rss.xml/route.ts` | /guide/marketplace-comparison |

가이드 아티클(`src/lib/data/guide-articles.ts`)은 항목의 `published` / `updated` 를 그대로 쓰므로
**글을 추가하면 sitemap·RSS 에 자동으로 들어간다.** 따로 할 일이 없다.

## 쿠팡 카테고리 문서 (11,657개)

`/coupang/category/{catId}` — 카테고리마다 실제 판매수수료율, 등록 필수·선택 속성 전체 목록,
판매가별 실수령액 표가 들어간다. 전부 `public/data/coupang-cat-details.json` 의 실데이터라
페이지마다 값이 다르다.

**화면 입구는 푸터 링크 하나뿐이다** (지원 → 쿠팡 카테고리별 수수료).
메인 히어로에는 일부러 노출하지 않는다. 링크를 눈에 안 띄는 곳에 두는 것은 정상이고,
텍스트를 숨기는 것(색인 삭제 사유)과는 전혀 다른 얘기다. 크롤러는 푸터 링크 →
허브(`/coupang/category`, 중분류 495개 링크) → 각 문서의 하위 카테고리 링크로 전부 도달한다.

### 색인에서 뺀 것 — `도서>외국도서` 4,602개

전체 16,259개 중 4,602개가 `도서>외국도서`다. 이 묶음은 판매수수료가 전부 10.8% 로 같고
속성도 ISBN·출판사·저자로 사실상 동일하며, "Mice, Hamsters, Guinea Pigs, etc." 같은
영문 장르명이라 한글 검색 수요가 없다. **이런 걸 색인에 올리면 문서 하나가 아니라 사이트
전체가 thin content 로 평가된다.** 규모를 키우려다 나머지 11,657개까지 같이 죽는다.

→ 페이지는 살려 두고(`noindex, follow`) 사이트맵에서만 뺀다.
제외 규칙은 `src/lib/data/coupang-categories.ts` 의 `NON_INDEXABLE_PREFIXES` 한 곳에 있다.

### 빌드·런타임 메모

- 빌드 시 프리렌더는 **3depth 495개만** 한다. 16,259개를 전부 프리렌더하면 빌드가 수십 분이 된다.
  나머지는 `dynamicParams` 로 첫 요청 때 생성되어 캐시된다(`revalidate = 86400`).
- 목록·허브·사이트맵은 `src/lib/data/generated/coupang-cat-slim.json`(1.8MB)만 읽는다.
  11.5MB 상세 JSON 은 카테고리 문서 1건을 그릴 때만 읽는다.
- 원본 카테고리 데이터가 갱신되면 `node scripts/build-coupang-cat-slim.mjs` 를 다시 돌리고
  결과 파일을 커밋한다. `sitemap.ts` 의 `CATEGORY_DATA_UPDATED` 날짜도 같이 올린다.
- `public/data` 의 JSON 은 Vercel 에서 CDN 으로만 올라가 람다 번들에서 빠질 수 있다.
  `next.config.ts` 의 `outputFileTracingIncludes` 로 강제 포함시켜 두었다. 빼면 **프로덕션에서만**
  ENOENT 로 죽는다(로컬은 멀쩡해서 못 잡는다).

## RSS 에 넣지 않는 것

- `/terms`, `/privacy`, `/refund`, `/apply`, `/supplier-program` 같은 약관·기능 페이지.
  RSS 는 "발행물" 피드라서 비콘텐츠 URL을 섞으면 피드 전체가 저품질로 평가된다. (sitemap 에는 들어간다)
- 로그인 뒤 화면(`/my`, `/megaload`, `/admin`) — robots.txt 에서도 Disallow 되어 있다.
- 항목 수 상한은 `MAX_ITEMS = 50`(네이버 권장). 넘으면 오래된 문서부터 잘린다.

## 배포 후 점검 명령

```bash
curl -s https://www.megaload.co.kr/rss.xml | head -20        # 200 + application/rss+xml
curl -s https://www.megaload.co.kr/sitemap.xml | grep -c "<loc>"
curl -s https://www.megaload.co.kr/coupang/category/sitemap.xml | grep -c "<loc>"  # 11658
curl -s https://www.megaload.co.kr/robots.txt | grep Sitemap  # 세 줄 나와야 정상
```

RSS 문법 검증은 https://validator.w3.org/feed/ 에 주소를 넣어 확인한다.
