import type { Metadata } from "next";
import Link from "next/link";
import SharedFooter from "@/components/sections/Footer";
import {
  getCategoriesByDepth,
  getIndexableCategories,
  getTopLevels,
} from "@/lib/data/coupang-categories";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 쿠팡 카테고리 허브
 *
 * 16,259개 카테고리 문서로 들어가는 입구다. 메인 히어로에는 노출하지 않고
 * 푸터 링크와 사이트맵으로만 연결한다 — 링크를 눈에 안 띄게 두는 것은 정상이고,
 * 텍스트를 숨기는 것과는 전혀 다른 얘기다.
 *
 * 크롤러가 16,259개를 다 돌 수 있도록 여기서 3depth(495개) 전부를 실제 링크로 깐다.
 * 그 아래 depth 는 각 카테고리 문서의 "하위 카테고리" 링크로 이어진다.
 */

export const revalidate = 86400;

const title = "쿠팡 카테고리별 판매수수료·필수속성 전체 목록";
const INDEXED_COUNT = getIndexableCategories().length;
const description =
  `쿠팡 카테고리 ${INDEXED_COUNT.toLocaleString()}개의 판매수수료율(4~10.9%)과 상품 등록 시 반드시 입력해야 하는 속성을 카테고리별로 정리했습니다. 대분류 14개에서 원하는 카테고리를 찾아보세요.`;

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "쿠팡 카테고리 수수료",
    "쿠팡 판매수수료",
    "쿠팡 수수료율",
    "쿠팡 카테고리 목록",
    "쿠팡 필수속성",
    "쿠팡 상품등록 속성",
    "쿠팡 대량등록",
  ],
  alternates: {
    canonical: `${SITE_URL}/coupang/category`,
    languages: { "ko-KR": `${SITE_URL}/coupang/category` },
  },
  openGraph: { title, description, url: `${SITE_URL}/coupang/category`, type: "website" },
};

export default function CoupangCategoryHub() {
  const topLevels = getTopLevels();
  // 화면에 적는 숫자는 실제로 문서가 서 있는 개수여야 한다.
  // 색인에서 뺀 도서>외국도서까지 세면 글에 쓴 수치가 사실과 어긋난다.
  const total = INDEXED_COUNT;

  // 3depth(중분류 495개)를 대분류별로 묶는다
  const depth3ByTop = new Map<string, { id: string; name: string }[]>();
  for (const c of getCategoriesByDepth(3, true)) {
    const list = depth3ByTop.get(c.topLevel) ?? [];
    list.push({ id: c.id, name: c.name });
    depth3ByTop.set(c.topLevel, list);
  }

  return (
    <main id="main-content" className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">
          쿠팡 카테고리별 판매수수료·필수속성
        </h1>
        <p className="text-gray-600 leading-relaxed mb-3">
          쿠팡 카테고리 <strong className="text-gray-900">{total.toLocaleString()}개</strong>의 판매수수료율과,
          상품을 등록할 때 반드시 입력해야 하는 속성을 카테고리별로 정리했습니다.
          수수료는 카테고리에 따라 <strong className="text-gray-900">4%부터 10.9%까지</strong> 달라지기 때문에,
          같은 판매가라도 어느 카테고리에 올리느냐에 따라 남는 돈이 바뀝니다.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed mb-10">
          대분류를 고르면 중분류 목록이 나오고, 거기서 더 내려가면 실제 등록 카테고리까지 이어집니다.
          각 문서에는 판매가별 실수령액 표와 필수·선택 속성 전체 목록이 들어 있습니다.
        </p>

        {/* 대분류 요약 */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-gray-900 mb-4">대분류 {topLevels.length}개</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {topLevels.map((t) => (
              <a
                key={t.name}
                href={`#${encodeURIComponent(t.name)}`}
                className="rounded-xl border border-gray-200 px-3.5 py-3 hover:border-[#E31837] transition-colors"
              >
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.count.toLocaleString()}개 카테고리</div>
              </a>
            ))}
          </div>
        </section>

        {/* 대분류별 중분류 링크 */}
        {topLevels.map((t) => {
          const list = depth3ByTop.get(t.name) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={t.name} id={encodeURIComponent(t.name)} className="mb-10 scroll-mt-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">{t.name}</h2>
              <p className="text-xs text-gray-500 mb-3">
                하위 카테고리 {t.count.toLocaleString()}개 · 중분류 {list.length}개
              </p>
              <ul className="flex flex-wrap gap-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/coupang/category/${c.id}`}
                      className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">카테고리마다 속성을 손으로 채우기 어렵다면</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            메가로드는 상품을 올리면 AI가 쿠팡 카테고리를 매칭하고 그 카테고리의 필수 속성을 자동으로 채웁니다.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/program"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              대량등록 프로그램 보기
            </Link>
            <Link
              href="/guide/marketplace-comparison"
              className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
            >
              오픈마켓 수수료 비교
            </Link>
          </div>
        </section>
      </div>
      <SharedFooter />
    </main>
  );
}
