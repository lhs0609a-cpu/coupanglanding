/**
 * 최종 무결점 검증 — 12개 카테고리 임의 상품에 대해
 * 모든 알려진 비문/오염 패턴이 0건인지 확인.
 */
import { generateStoryV2 } from '../src/lib/megaload/services/story-generator';

interface TestCase {
  label: string;
  productName: string;
  categoryPath: string;
  brand?: string;
  description?: string;
  tags?: string[];
}

const CASES: TestCase[] = [
  { label: '뷰티/넥크림', productName: '셀라비뷰 나이트 넥리프트 크림 50ml', categoryPath: '뷰티>스킨케어>크림>넥크림', brand: '셀라비뷰', tags: ['넥크림','목주름','리프팅'] },
  { label: '식품/망고', productName: '태국산 알폰소 생망고 1kg 박스', categoryPath: '식품>과일>열대과일>망고', tags: ['망고','열대과일'] },
  { label: '건강식품/비타민', productName: '라이프케어 비타민D 2000IU 120정', categoryPath: '식품>건강식품>비타민>비타민D', brand: '라이프케어', tags: ['비타민D','면역'] },
  { label: '반려/사료', productName: '퓨어퍼피 연어&고구마 강아지 사료 2kg', categoryPath: '반려/애완용품>강아지>사료>건사료', brand: '퓨어퍼피', tags: ['강아지사료'] },
  { label: '주방/프라이팬', productName: '데일리쿡 인덕션 IH 28cm 논스틱 프라이팬', categoryPath: '주방용품>조리도구>팬>프라이팬', brand: '데일리쿡', tags: ['프라이팬'] },
  { label: '가전/무선청소기', productName: '에어플로 듀얼파워 무선청소기 30000Pa', categoryPath: '가전/디지털>생활가전>청소기>무선청소기', brand: '에어플로', tags: ['무선청소기'] },
  { label: '패션/가디건', productName: '오버핏 울 카라넥 가디건 베이지 M', categoryPath: '패션의류잡화>여성패션>니트>가디건', tags: ['가디건','울'] },
  { label: '출산유아/분유', productName: '맘스케어 산양분유 3단계 800g', categoryPath: '출산/유아동>분유/이유식>분유', brand: '맘스케어', tags: ['분유'] },
  { label: '문구/노트', productName: '플레인노트 무지 A5 도트노트 5권 세트', categoryPath: '문구/오피스>노트/메모>노트', brand: '플레인노트', tags: ['노트'] },
  { label: '자동차/블랙박스', productName: '카비전 4K UHD 2채널 블랙박스 256GB', categoryPath: '자동차용품>안전/관리>블랙박스', brand: '카비전', tags: ['블랙박스'] },
  { label: '뷰티/영문혼합', productName: '[Rue del Sol] AHA 8% 토닉 250ml', categoryPath: '뷰티>스킨케어>토너', brand: 'Rue del Sol', tags: ['AHA','토너'] },
  { label: '식품/단어짧음', productName: '국산 햇감자 5kg', categoryPath: '식품>채소>감자/고구마/당근>감자', tags: ['감자'] },
];

interface ViolationCheck {
  name: string;
  re: RegExp;
  // 카테고리 경로에 이 단어가 있으면 통과 (해당 카테고리에서는 정상 표현)
  exemptIfCategoryHas?: string[];
  // 상품명에 이 단어가 있으면 통과
  exemptIfProductHas?: string[];
}

const VIOLATIONS: ViolationCheck[] = [
  // 한국어 조사 비문
  { name: '선물으로(ㄹ받침 오류)', re: /선물으로/ },
  { name: '이걸으로(ㄹ받침 오류)', re: /이걸으로/ },
  { name: '없은(불규칙 관형형 오류)', re: /없은(?=[\s가-힣])/ },
  { name: '있은(불규칙 관형형 오류)', re: /있은(?=[\s가-힣])/ },
  { name: '드심해도/하면(합성 오류)', re: /드심하/ },
  { name: '단계에했(공백 누락)', re: /단계에했/ },
  { name: '때간이(공백 누락)', re: /때간이/ },
  { name: 'A5을(영문/숫자 받침 오류)', re: /[A-Za-z0-9]을\s/ },
  { name: 'UHD을 류', re: /UHD을\s/ },
  { name: '함량은 (식품 오염)', re: /이\s+함량은/, exemptIfCategoryHas: ['건강식품','비타민','영양제'] },
  { name: '10초 컷 (생식품 부적절)', re: /10초\s*컷/, exemptIfCategoryHas: ['주방','조리','즉석'] },
  { name: '자극없는은 (조사 깨짐)', re: /자극없는은/ },
  { name: '부담없는 부담없는', re: /부담없는\s+부담없는/ },
  { name: '식단에게 (추상명사+에게)', re: /식단에게/ },
  { name: '고민한테 (추상명사+한테)', re: /고민한테/ },
  { name: '는은/는는 (조사 충돌)', re: /[가-힣]는은\s|[가-힣]는는\s/ },

  // 변수 빈치환 깨짐
  { name: '미치환 placeholder', re: /\{[^}]+\}/ },
  { name: '문장 중간 " . "', re: /\s\.\s+[가-힣]/ },
  { name: '문장 끝 " ."', re: /[가-힣]\s+\.\s*$/ },
  { name: '"수 ." 어미 잘림', re: /[가-힣]\s+수\s*\.\s/ },

  // fallback 명사 노출
  { name: '바로 상품/제품입니다', re: /바로\s+(상품|제품)입니다/ },
  { name: ', 상품/제품 + 조사', re: /[,，]\s*(상품|제품)\s*(은|는|을|를|이|가|에|의|으로|로)\s/ },
  { name: '상품 써봐 (fallback)', re: /'\s*이건\s+상품\s+써봐/ },
  { name: '이제 (이) 제품으로 바꿔', re: /이제\s+(이\s+)?(상품|제품)\s*(으로|로)\s+바꿔/ },

  // 카테고리 cross-leaf
  { name: '분유→유아식예요', re: /유아식이?예요/, exemptIfProductHas: ['유아식','이유식'] },
  { name: '분유→물티슈예요', re: /물티슈예요/, exemptIfProductHas: ['물티슈'] },
  { name: '분유→카시트예요', re: /카시트예요/, exemptIfProductHas: ['카시트'] },
  { name: '분유→이유식예요', re: /이유식이?예요/, exemptIfProductHas: ['이유식','유아식'] },
  { name: '노트→다이어리/만년필/필통', re: /(다이어리|만년필|필통|점착메모|볼펜)/, exemptIfProductHas: ['다이어리','만년필','필통','점착메모','볼펜'] },
  { name: '블랙박스→왁스/코팅', re: /(왁스|발수|광택나는)\s/, exemptIfProductHas: ['왁스','코팅','광택'] },
  { name: '뷰티크림→박스 (포장 leaf)', re: /박스(가|는|이|을|예)\s/, exemptIfCategoryHas: ['식품','과일','채소','신선','자동차','블랙박스'], exemptIfProductHas: ['블랙박스'] },
  { name: '식품→사용법', re: /사용법은\s+단순/, exemptIfCategoryHas: ['주방','문구','자동차','가전','반려','패션','뷰티','출산'] },

  // 빈도 모순
  { name: '주말에+매일 (빈도 모순)', re: /주말에.*매일\s*빠지지/ },

  // 추가 한국어 비문
  { name: '한이라/운이라/은이라 (관형형+이라)', re: /[가-힣](한|운|은|인)이라\s/ },
  { name: '가까가 (조사 오류)', re: /가까가\s/ },
  { name: '문장 미완 - "거의 필요 처음"', re: /거의\s+필요\s+처음/ },
  { name: '문장 미완 - 어미 끝나지 않은 채 다음 문장', re: /[가-힣](요|다|니다)$.*$\n[A-Z가-힣]/m },

  // 동일 단어 인접 중복 (단일 문자는 조사 가능성 — 2자 이상만 검출)
  { name: '단어 직접 인접 중복', re: /(\S{2,}) \1(?=[\s.,!?])/ },

  // 짧은 미완 fragment
  { name: '"수 있어요." 단독 미완성', re: /^[가-힣]+\s+수\s+있어요\.$/ },
];

interface Hit {
  caseLabel: string;
  paragraphIndex: number;
  violation: string;
  excerpt: string;
}

const allHits: Hit[] = [];

for (const c of CASES) {
  const result = generateStoryV2(c.productName, c.categoryPath, 'seller_TEST_FIXED_SEED', 0, {
    description: c.description,
    tags: c.tags,
    brand: c.brand,
  });
  const allParagraphs = [...result.paragraphs, ...result.reviewTexts];
  for (let i = 0; i < allParagraphs.length; i++) {
    const para = allParagraphs[i];
    for (const v of VIOLATIONS) {
      if (v.exemptIfCategoryHas?.some(k => c.categoryPath.includes(k))) continue;
      if (v.exemptIfProductHas?.some(k => c.productName.includes(k))) continue;
      const m = para.match(v.re);
      if (m) {
        const excerpt = para.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + (m[0].length) + 30);
        allHits.push({
          caseLabel: c.label,
          paragraphIndex: i + 1,
          violation: v.name,
          excerpt,
        });
      }
    }
  }
}

if (allHits.length === 0) {
  console.log('✅ 12개 케이스 × 모든 검증 패턴 통과 — 0건 검출');
} else {
  console.log(`⚠️  ${allHits.length}건 검출:\n`);
  for (const h of allHits) {
    console.log(`  [${h.caseLabel}] §${h.paragraphIndex} (${h.violation})`);
    console.log(`    "${h.excerpt}"`);
  }
}
