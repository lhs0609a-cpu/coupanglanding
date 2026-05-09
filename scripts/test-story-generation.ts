/**
 * 메가로드 상세페이지(스토리/리뷰) 생성기 임의 테스트
 *
 * 카테고리 다양성을 갖춘 가상 상품명을 입력해
 * 실제로 어떤 본문이 만들어지는지 점검한다.
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
  {
    label: '뷰티 / 넥크림',
    productName: '셀라비뷰 나이트 넥리프트 크림 50ml',
    categoryPath: '뷰티>스킨케어>크림>넥크림',
    brand: '셀라비뷰',
    tags: ['넥크림', '목주름', '리프팅'],
  },
  {
    label: '식품 / 망고',
    productName: '태국산 알폰소 생망고 1kg 박스',
    categoryPath: '식품>과일>열대과일>망고',
    description: '태국에서 직수입한 잘 익은 알폰소 망고입니다.',
    tags: ['망고', '열대과일', '태국'],
  },
  {
    label: '건강식품 / 비타민',
    productName: '라이프케어 비타민D 2000IU 120정',
    categoryPath: '식품>건강식품>비타민>비타민D',
    brand: '라이프케어',
    tags: ['비타민D', '면역', '뼈건강'],
  },
  {
    label: '반려/사료',
    productName: '퓨어퍼피 연어&고구마 강아지 사료 2kg',
    categoryPath: '반려/애완용품>강아지>사료>건사료',
    brand: '퓨어퍼피',
    tags: ['강아지사료', '연어', '고구마'],
  },
  {
    label: '주방 / 프라이팬',
    productName: '데일리쿡 인덕션 IH 28cm 논스틱 프라이팬',
    categoryPath: '주방용품>조리도구>팬>프라이팬',
    brand: '데일리쿡',
    tags: ['프라이팬', '인덕션', '논스틱'],
  },
  {
    label: '가전 / 무선청소기',
    productName: '에어플로 듀얼파워 무선청소기 30000Pa',
    categoryPath: '가전/디지털>생활가전>청소기>무선청소기',
    brand: '에어플로',
    tags: ['무선청소기', '강력흡입', '핸디스틱'],
  },
  {
    label: '패션 / 여성 가디건',
    productName: '오버핏 울 카라넥 가디건 베이지 M',
    categoryPath: '패션의류잡화>여성패션>니트>가디건',
    tags: ['가디건', '울', '오버핏'],
  },
  {
    label: '출산/유아 / 분유',
    productName: '맘스케어 산양분유 3단계 800g',
    categoryPath: '출산/유아동>분유/이유식>분유',
    brand: '맘스케어',
    tags: ['분유', '산양', '3단계'],
  },
  {
    label: '문구/사무 / 노트',
    productName: '플레인노트 무지 A5 도트노트 5권 세트',
    categoryPath: '문구/오피스>노트/메모>노트',
    brand: '플레인노트',
    tags: ['노트', '도트', 'A5'],
  },
  {
    label: '자동차 / 블랙박스',
    productName: '카비전 4K UHD 2채널 블랙박스 256GB',
    categoryPath: '자동차용품>안전/관리>블랙박스',
    brand: '카비전',
    tags: ['블랙박스', '4K', '2채널'],
  },
  {
    label: '뷰티 / 한자/영문 혼합',
    productName: '[Rue del Sol] AHA 8% 토닉 250ml',
    categoryPath: '뷰티>스킨케어>토너',
    brand: 'Rue del Sol',
    tags: ['AHA', '각질', '토너'],
  },
  {
    label: '식품 / 단어 짧음',
    productName: '국산 햇감자 5kg',
    categoryPath: '식품>채소>감자/고구마/당근>감자',
    tags: ['감자', '국산'],
  },
];

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUSPICIOUS_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '식품 표현(뷰티/생활용품 오염)', re: /(맛있|쫄깃|식감|밥상|반찬|간식|디저트)/ },
  { name: '뷰티 표현(식품 오염)', re: /(피부톤|보습|세럼|각질|모공|쿠션|광채)/ },
  { name: '의약/효능 과장', re: /(치료|완치|특효|의약품|만병통치|즉각 효과)/ },
  { name: '동물 표현(사람 상품 오염)', re: /(반려동물|강아지|고양이|사료|배변)/ },
  { name: '의류 표현(타카테고리 오염)', re: /(코디|핏감|어울리는 룩|니트)/ },
  { name: '주방 표현(타카테고리 오염)', re: /(프라이팬|냄비|조리|화구)/ },
  { name: '미완성 fragment(빈 괄호/꺾쇠)', re: /(\(\s*\))|(\[\s*\])|<\s*>/ },
  { name: '미치환 변수', re: /\{[^}]+\}/ },
  { name: '연속 공백/줄바꿈 과다', re: /\s{4,}/ },
  { name: '문장 미완료(말줄임 외)', re: /[가-힣]\s*\.{2}(?!\.)\s/ },
];

function scanSuspicious(text: string, productCategory: string) {
  const hits: string[] = [];
  for (const p of SUSPICIOUS_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;

    // 카테고리 정합성: 그 카테고리에 자연스러운 표현은 통과
    if (p.name.startsWith('식품') && /식품|건강식품|과일|채소|육류/.test(productCategory)) continue;
    if (p.name.startsWith('뷰티') && /뷰티|화장품|스킨/.test(productCategory)) continue;
    if (p.name.startsWith('동물') && /반려|애완|강아지|고양이/.test(productCategory)) continue;
    if (p.name.startsWith('의류') && /패션|의류|니트|가디건/.test(productCategory)) continue;
    if (p.name.startsWith('주방') && /주방|프라이팬|조리/.test(productCategory)) continue;

    hits.push(`[${p.name}] "${m[0]}"`);
  }
  return hits;
}

async function main() {
  for (const c of CASES) {
    console.log('═'.repeat(80));
    console.log(`■ ${c.label}`);
    console.log(`상품명: ${c.productName}`);
    console.log(`카테고리: ${c.categoryPath}`);
    console.log('─'.repeat(80));

    const result = generateStoryV2(
      c.productName,
      c.categoryPath,
      'seller_TEST_FIXED_SEED',
      0,
      {
        description: c.description,
        tags: c.tags,
        brand: c.brand,
      },
    );

    console.log('\n[ 본문 단락 ]');
    result.paragraphs.forEach((p, i) => {
      const flat = strip(p);
      console.log(`  ${i + 1}. ${flat}`);
    });

    console.log('\n[ 리뷰 캡션 ]');
    result.reviewTexts.forEach((r, i) => {
      console.log(`  ${i + 1}. ${strip(r)}`);
    });

    if (result.contentBlocks?.length) {
      console.log('\n[ 설득 블록 ]');
      result.contentBlocks.forEach((b, i) => {
        const text = typeof (b as { text?: unknown }).text === 'string'
          ? (b as { text: string }).text
          : JSON.stringify(b).slice(0, 200);
        console.log(`  ${i + 1}. (${(b as { type?: string }).type ?? '?'}) ${strip(text).slice(0, 220)}`);
      });
    }

    // 의심 패턴 검출
    const wholeText = [
      ...result.paragraphs,
      ...result.reviewTexts,
      ...(result.contentBlocks?.map(b =>
        typeof (b as { text?: unknown }).text === 'string'
          ? (b as { text: string }).text
          : '',
      ) ?? []),
    ].map(strip).join(' ');
    const hits = scanSuspicious(wholeText, c.categoryPath);
    if (hits.length) {
      console.log('\n⚠️  의심 패턴:');
      hits.forEach(h => console.log(`   - ${h}`));
    }
  }
}

main().catch(e => {
  console.error('FAIL', e);
  process.exit(1);
});
