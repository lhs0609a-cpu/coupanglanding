/**
 * 카테고리 매칭 실측 테스트
 * 실행: npx tsx scripts/test-category-matching.ts
 */
import { matchCategoryBatch } from '../src/lib/megaload/services/category-matcher';

const TEST_PRODUCTS = [
  // ── 스크린샷의 실패 케이스 ──
  '4 Years Achievement Cleanser 클렌징용품 200ml',
  '선언 비누 클렌징',
  '얼굴 각질제거 클렌징',
  '라끌리어 퓨어 마일드 엔자임 파우더 워시 클렌징',
  '청미정 클렌징 오일 클렌징',
  '얼굴 각질제거기 힐링젤 프리메라 얼굴 스크럽 클렌징',
  '뷰티 페이스 리터 순한 피부 미세 클렌징 PHA 듀얼 클렌징젤',
  '언제니 약산성 폼클렌징 저자극 초등학생 청소년 사춘기',
  '조성이 원더 버스 슈퍼 베지 톡스 클렌저 통',
  // ── 정상 케이스 ──
  '비타민C 1000mg 60정',
  '오메가3 1100mg',
  '아무 것도 매칭 안 되는 상품 xyzabc',
];

async function main() {
  console.log(`\n=== 카테고리 매칭 실측 테스트 (${TEST_PRODUCTS.length}건) ===\n`);
  const t0 = Date.now();
  const { results, failures } = await matchCategoryBatch(TEST_PRODUCTS);
  console.log(`총 소요: ${Date.now() - t0}ms\n`);

  let succ = 0, fail = 0;
  for (let i = 0; i < TEST_PRODUCTS.length; i++) {
    const r = results[i];
    if (r) {
      succ++;
      console.log(`✅ [${i}] ${TEST_PRODUCTS[i]}`);
      console.log(`   → ${r.categoryName} (code=${r.categoryCode}, source=${r.source})`);
      console.log(`   path: ${r.categoryPath}\n`);
    } else {
      fail++;
      const f = failures.find((x) => x.index === i);
      console.log(`❌ [${i}] ${TEST_PRODUCTS[i]}`);
      console.log(`   tokens: [${f?.tokens?.join(', ') || '?'}]`);
      console.log(`   bestTier: ${f?.bestTier} | bestScore: ${f?.bestScore}/12`);
      if (f?.bestCandidate) console.log(`   가장 가까운: ${f.bestCandidate}`);
      console.log(`   사유: ${f?.reason}\n`);
    }
  }
  console.log(`\n=== 요약 === 성공: ${succ}/${TEST_PRODUCTS.length} | 실패: ${fail}/${TEST_PRODUCTS.length}`);
}

main().catch((err) => {
  console.error('테스트 실행 실패:', err);
  process.exit(1);
});
