import SplitHero from '@/components/sections/SplitHero';

export default function Home() {
  return (
    <main id="main-content" className="min-h-screen bg-white">
      {/* SEO-only H1 + content. sr-only is accessible and not "cloaked" — it accurately describes the page. */}
      <h1 className="sr-only">
        쿠팡PT · 메가로드 — 초기비용 0원, 3개월 매출 보장형 쿠팡 1:1 전문가 코칭과 AI 기반 쿠팡 상품 등록 자동화 프로그램
      </h1>
      <div className="sr-only">
        <p>
          쿠팡PT(쿠팡 1:1 전문가 코칭)는 검증된 전문가가 직접 카테고리, 상품
          소싱, 가격, 광고까지 함께 운영해 3개월 안에 쿠팡 매출을 만드는
          성과 기반 코칭 서비스입니다. 초기비용 0원으로 시작하며, 매출이
          발생하지 않으면 비용도 0원입니다.
        </p>
        <p>
          메가로드(Megaload)는 GPT-4 기반 쿠팡 상품 대량등록 자동화 프로그램으로,
          카테고리 매칭, 노출상품명 생성, 가격·옵션·재고 처리를 자동화해
          100개 상품 등록을 10분 이내로 단축합니다. 쿠팡 부업, 위탁판매,
          창업 초보자 모두에게 적합합니다.
        </p>
        <nav aria-label="주요 메뉴">
          <ul>
            <li>
              <a href="/pt">쿠팡PT 1:1 코칭 자세히 보기</a>
            </li>
            <li>
              <a href="/program">메가로드 AI 자동등록 프로그램 자세히 보기</a>
            </li>
            <li>
              <a href="/guide">초보 셀러 가이드</a>
            </li>
            <li>
              <a href="/start">사업자등록 체크리스트</a>
            </li>
          </ul>
        </nav>
      </div>
      <SplitHero />
    </main>
  );
}
