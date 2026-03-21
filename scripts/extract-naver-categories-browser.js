/**
 * 브라우저 콘솔에서 실행하는 네이버 쇼핑 카테고리 추출 스크립트
 *
 * 사용법:
 * 1. 크롬에서 https://datalab.naver.com/shoppingInsight/sCategory.naver 접속
 * 2. F12 → Console 탭
 * 3. 이 스크립트 전체를 붙여넣기 후 Enter
 * 4. 완료되면 자동으로 JSON 파일이 다운로드됨
 *
 * 추출 원리: 데이터랩 쇼핑인사이트의 카테고리 선택 UI에서
 * AJAX로 하위 카테고리를 순차 요청하여 전체 트리를 수집함
 */

(async function extractNaverCategories() {
  const ALL = [];
  const LEAVES = [];

  async function fetchChildren(parentCid) {
    const res = await fetch('https://datalab.naver.com/shoppingInsight/getCategoryList.naver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `cid=${parentCid}`,
    });
    const data = await res.json();
    return Array.isArray(data) ? data : (data.childList || data.result || []);
  }

  // Level 1: 대분류
  console.log('대분류 조회 중...');
  const level1 = await fetchChildren('50000000');
  console.log(`대분류: ${level1.length}개`);

  for (const cat1 of level1) {
    const c1 = { id: String(cat1.cid), name: cat1.name || cat1.catNm, path: cat1.name || cat1.catNm };
    ALL.push({ ...c1, level: 1, isLeaf: false });

    // Level 2: 중분류
    const level2 = await fetchChildren(c1.id);
    if (level2.length === 0) {
      c1.isLeaf = true;
      LEAVES.push(c1);
      ALL[ALL.length - 1].isLeaf = true;
      continue;
    }

    for (const cat2 of level2) {
      const c2 = { id: String(cat2.cid), name: cat2.name || cat2.catNm, path: `${c1.path}>${cat2.name || cat2.catNm}` };
      ALL.push({ ...c2, level: 2, isLeaf: false });

      // Level 3: 소분류
      const level3 = await fetchChildren(c2.id);
      if (level3.length === 0) {
        LEAVES.push(c2);
        ALL[ALL.length - 1].isLeaf = true;
        continue;
      }

      for (const cat3 of level3) {
        const c3 = { id: String(cat3.cid), name: cat3.name || cat3.catNm, path: `${c2.path}>${cat3.name || cat3.catNm}` };
        ALL.push({ ...c3, level: 3, isLeaf: false });

        // Level 4: 세분류
        const level4 = await fetchChildren(c3.id);
        if (level4.length === 0) {
          LEAVES.push(c3);
          ALL[ALL.length - 1].isLeaf = true;
          continue;
        }

        for (const cat4 of level4) {
          const c4 = { id: String(cat4.cid), name: cat4.name || cat4.catNm, path: `${c3.path}>${cat4.name || cat4.catNm}` };
          ALL.push({ ...c4, level: 4, isLeaf: true });
          LEAVES.push(c4);
        }
      }
    }

    console.log(`  ${c1.name}: ${ALL.length}개 누적 (leaf: ${LEAVES.length}개)`);
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    totalCount: ALL.length,
    leafCount: LEAVES.length,
    all: ALL,
    leaves: LEAVES,
  };

  // JSON 다운로드
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'naver-categories.json';
  a.click();
  URL.revokeObjectURL(url);

  console.log(`\n=== 완료 ===`);
  console.log(`전체: ${ALL.length}개, Leaf: ${LEAVES.length}개`);
  console.log('naver-categories.json 다운로드됨!');

  return output;
})();
