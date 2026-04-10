import { createSeededRandom, stringToSeed } from './seeded-random';
import { getForbiddenTermsForPrompt } from '../data/forbidden-terms';
import { checkCompliance } from './compliance-filter';

export interface AiServiceResult {
  content: string;
  creditsUsed: number;
  model: string;
}

// ---- 상품명 생성 관련 타입 ----

export interface ProductTitleInput {
  originalName: string;
  categoryPath: string;
  brand: string;
  keywords: string[];
  /** 아이템위너 방지: 셀러 페르소나 시드 (셀러 ID 등) */
  personaSeed?: string;
}

export interface ProductTitleResult {
  displayName: string;
  sellerName: string;
  keywords: string[];
}

// ---- 스토리 배치 관련 ----

export interface StoryBatchInput {
  productName: string;
  category: string;
  features: string[];
  description?: string;
  categoryPath?: string;  // "뷰티>스킨>크림>넥크림" — AI 맥락 파악용
}

/** 스토리 톤 타입 — 배치 생성 시 순환 사용 */
export const STORY_TONES = ['감성형', '정보형', '후기형', '비교형', '스토리텔링형'] as const;
export type StoryTone = (typeof STORY_TONES)[number];

// ---- 셀러 페르소나 (아이템위너 방지 P2) ----

const SELLER_PERSONAS = [
  {
    name: '건강/효능',
    style: '건강 효능과 성분을 강조하는 전문가 스타일',
    example: '비오틴 5000mcg 고함량 모발건강 탈모영양제 120정',
    keywords: '효능, 성분, 함량, 건강, 영양',
  },
  {
    name: '가성비/실용',
    style: '가성비와 실용성을 강조하는 알뜰살뜰 스타일',
    example: '대용량 비오틴 120정 가성비 영양제 모발 손톱',
    keywords: '대용량, 가성비, 실용, 알뜰, 경제적',
  },
  {
    name: '프리미엄/고급',
    style: '프리미엄 품질과 고급스러움을 강조하는 럭셔리 스타일',
    example: '프리미엄 비오틴 5000 독일산 영양제 120정',
    keywords: '프리미엄, 고급, 엄선, 특별, 최상급 원료',
  },
  {
    name: '가족/일상',
    style: '가족과 일상에서의 편리함을 강조하는 따뜻한 스타일',
    example: '온가족 비오틴 영양제 120정 간편 데일리 모발',
    keywords: '가족, 온가족, 데일리, 간편, 일상',
  },
  {
    name: '선물/특별',
    style: '선물과 특별한 가치를 강조하는 감성 스타일',
    example: '비오틴 선물세트 120정 건강선물 모발영양',
    keywords: '선물, 감사, 특별, 마음, 건강케어',
  },
] as const;

/**
 * 셀러 시드로 페르소나를 결정적으로 선택
 */
function selectPersona(seed: string): typeof SELLER_PERSONAS[number] {
  const rng = createSeededRandom(stringToSeed(seed));
  const idx = Math.floor(rng() * SELLER_PERSONAS.length);
  return SELLER_PERSONAS[idx];
}

/**
 * 페르소나 프롬프트 섹션 생성
 */
function buildPersonaSection(seed?: string): string {
  if (!seed) return '';
  const persona = selectPersona(seed);
  return `\n\n[셀러 페르소나]
당신은 "${persona.name}" 스타일의 판매자입니다.
- 스타일: ${persona.style}
- 상품명 예시: ${persona.example}
- 선호 키워드: ${persona.keywords}
- 이 페르소나에 맞게 상품명의 키워드 선택과 배열을 결정하세요.`;
}

export async function generateProductDescription(
  productTitle: string,
  category: string,
  features: string[],
  targetLength = 500
): Promise<AiServiceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const prompt = `당신은 한국 이커머스 상품 설명 전문가입니다. 다음 상품의 매력적인 상품 설명을 ${targetLength}자 내외로 작성해주세요.

상품명: ${productTitle}
카테고리: ${category}
특징: ${features.join(', ')}

규칙:
- 한국어로 작성
- SEO 키워드 자연스럽게 포함
- 구매를 유도하는 매력적인 문구
- HTML 형식 (간단한 태그만 사용)`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return {
    content: data.choices?.[0]?.message?.content || '',
    creditsUsed: 800,
    model: 'gpt-4o-mini',
  };
}

export async function generateCsResponse(
  inquiryContent: string,
  productInfo?: string,
  orderInfo?: string
): Promise<AiServiceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const context = [
    productInfo ? `상품 정보: ${productInfo}` : '',
    orderInfo ? `주문 정보: ${orderInfo}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `당신은 친절하고 전문적인 이커머스 CS 상담사입니다. 다음 고객 문의에 대한 답변을 작성해주세요.

${context ? `[참고 정보]\n${context}\n` : ''}
[고객 문의]
${inquiryContent}

규칙:
- 한국어 존댓말 사용
- 정확하고 친절한 어조
- 문제 해결 방안 제시
- 200자 내외`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return {
    content: data.choices?.[0]?.message?.content || '',
    creditsUsed: 100,
    model: 'gpt-4o-mini',
  };
}

export async function generateProductStory(
  productName: string,
  category: string,
  features: string[],
  description?: string,
): Promise<AiServiceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const featureStr = features.length > 0 ? features.join(', ') : '없음';
  const descStr = description ? `\n상품 설명: ${description}` : '';

  const prompt = `당신은 쿠팡 상세페이지 전문 카피라이터입니다. 다음 상품의 감성적인 구매유도 스토리를 HTML로 작성해주세요.

상품명: ${productName}
카테고리: ${category}
특징/태그: ${featureStr}${descStr}

규칙:
- 한국어로 작성 (800자 내외)
- 인라인 스타일만 사용 (외부 CSS 불가)
- max-width: 860px, 가운데 정렬
- 3~4개 단락으로 구성
- 첫 단락: 공감/문제제기 (고객의 고민에 공감)
- 중간 단락: 솔루션 제시 (이 상품이 왜 좋은지)
- 마지막 단락: 행동 유도 (지금 구매해야 하는 이유)
- 감성적이고 신뢰감 있는 톤
- <script>, <link>, <style> 태그 금지
- 이미지 태그 금지 (텍스트만)
- 반드시 <div> 태그로 전체를 감싸기`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    return { content: '', creditsUsed: 0, model: 'none' };
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  let html = data.choices?.[0]?.message?.content || '';

  // HTML만 추출 (마크다운 코드블록 제거)
  const htmlMatch = html.match(/<div[\s\S]*<\/div>/i);
  if (htmlMatch) {
    html = htmlMatch[0];
  }

  return {
    content: html,
    creditsUsed: 1200,
    model: 'gpt-4o-mini',
  };
}

// ============================================================
// AI 상품명 생성
// ============================================================

/**
 * 단일 상품에 대해 고유한 displayProductName / sellerProductName 생성
 */
export async function generateProductTitles(
  input: ProductTitleInput,
): Promise<ProductTitleResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { displayName: input.originalName, sellerName: input.originalName, keywords: input.keywords };
  }

  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const personaSection = buildPersonaSection(input.personaSeed);
  const prompt = `당신은 쿠팡 상품 등록 SEO 전문가입니다.${personaSection}

[원본 상품명] ${input.originalName}
[카테고리] ${input.categoryPath}
[브랜드] ${input.brand || '없음'}
[키워드] ${input.keywords.join(', ') || '없음'}
[변형 시드] ${seed}

## displayName 작성 규칙 (노출상품명, 100자 이내):

### 필수 포함 요소 (순서 매번 변경):
- 브랜드명 (있으면)
- 상품 유형 (크림, 세럼, 영양제 등)
- 핵심 스펙 (용량/중량/수량: 50ml, 120정, 3개 등)
- 검색 키워드 2~3개 (사용자가 실제 검색할 단어)

### 금지어 (절대 사용 금지 — 법규 위반 + 쿠팡 정책):
${getForbiddenTermsForPrompt()}
- 타사 비교: OO보다, OO 대비, 경쟁사명

### 키워드 배열 전략 (아이템위너 회피):
- 시드에 따라 키워드 순서를 완전히 바꿀 것
- 같은 상품이어도 매번 다른 구조로 작성
- 예시 변형:
  A) "[브랜드] 넥크림 50ml 목주름 리프팅 보습"
  B) "목주름 탄력케어 넥 크림 50ml [브랜드] 수분"
  C) "리프팅 넥케어 크림 [브랜드] 50ml 탄력 보습"

## sellerName (판매자상품명, 30자 이내):
- 내부 관리용, 간결하게: "[브랜드] 상품유형 스펙"

## keywords: 고객이 실제 검색할 키워드 5개 (배열)

JSON으로만 응답: { "displayName": "...", "sellerName": "...", "keywords": ["..."] }`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    return { displayName: input.originalName, sellerName: input.originalName, keywords: input.keywords };
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const rawDisplay = (parsed.displayName || input.originalName).slice(0, 100);
    const { cleanedText: cleanedDisplay } = checkCompliance(rawDisplay, { removeErrors: true, categoryContext: input.categoryPath });
    return {
      displayName: cleanedDisplay || input.originalName.slice(0, 100),
      sellerName: (parsed.sellerName || input.originalName).slice(0, 30),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : input.keywords,
    };
  } catch {
    return { displayName: input.originalName, sellerName: input.originalName, keywords: input.keywords };
  }
}

/**
 * 배치 상품명 생성 — 최대 10개 상품을 한 번의 API 호출로 처리
 */
export async function generateProductTitlesBatch(
  inputs: ProductTitleInput[],
): Promise<ProductTitleResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return inputs.map((i) => ({ displayName: i.originalName, sellerName: i.originalName, keywords: i.keywords }));
  }

  // 10개씩 청크
  const chunks: ProductTitleInput[][] = [];
  for (let i = 0; i < inputs.length; i += 10) {
    chunks.push(inputs.slice(i, i + 10));
  }

  const allResults: ProductTitleResult[] = [];

  for (const chunk of chunks) {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const productList = chunk
      .map((p, idx) => `${idx + 1}. 원본: "${p.originalName}" | 카테고리: ${p.categoryPath} | 브랜드: ${p.brand || '없음'} | 키워드: ${p.keywords.join(', ') || '없음'}`)
      .join('\n');

    // 배치 내 첫 번째 상품의 페르소나 시드를 대표로 사용
    const batchPersonaSeed = chunk[0]?.personaSeed;
    const batchPersonaSection = buildPersonaSection(batchPersonaSeed);
    const prompt = `당신은 쿠팡 상품 등록 SEO 전문가입니다. ${chunk.length}개 상품 각각에 대해 고유한 상품명을 생성하세요.${batchPersonaSection}

[변형 시드] ${seed}

[상품 목록]
${productList}

## 규칙:

### displayName (노출상품명, 100자 이내):
- 필수 포함: 브랜드(있으면), 상품유형, 핵심스펙(용량/수량), 검색키워드 2~3개
- 상품마다 반드시 다른 키워드 순서와 문장 구조 사용
- 유사 표현 활용 (보습/수분/촉촉, 탄력/리프팅/탱탱 등)

### 금지어 (절대 사용 금지 — 법규 위반 + 쿠팡 정책):
${getForbiddenTermsForPrompt()}
타사비교 표현도 금지

### 아이템위너 회피:
- 같은 카테고리 상품이어도 키워드 순서를 완전히 다르게 배치
- 같은 구조 반복 금지 (A: "[브랜드] 상품 스펙", B: "효능 상품 [브랜드] 스펙" 등)

### sellerName (판매자상품명, 30자 이내): 내부 관리용
### keywords: 실제 검색 키워드 5개

JSON 배열로만 응답: { "results": [{ "displayName": "...", "sellerName": "...", "keywords": ["..."] }, ...] }
반드시 ${chunk.length}개 항목을 순서대로 반환.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      // 실패 시 원본 이름으로 폴백
      allResults.push(...chunk.map((i) => ({ displayName: i.originalName, sellerName: i.originalName, keywords: i.keywords })));
      continue;
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      const results: ProductTitleResult[] = Array.isArray(parsed.results) ? parsed.results : [];

      // 각 상품에 대해 결과 매핑 (부족하면 원본으로 폴백)
      for (let i = 0; i < chunk.length; i++) {
        const r = results[i];
        if (r && r.displayName) {
          const rawDisplay = String(r.displayName).slice(0, 100);
          const { cleanedText: cleanedDisplay } = checkCompliance(rawDisplay, { removeErrors: true, categoryContext: chunk[i].categoryPath });
          allResults.push({
            displayName: cleanedDisplay || chunk[i].originalName.slice(0, 100),
            sellerName: String(r.sellerName || chunk[i].originalName).slice(0, 30),
            keywords: Array.isArray(r.keywords) ? r.keywords : chunk[i].keywords,
          });
        } else {
          allResults.push({ displayName: chunk[i].originalName, sellerName: chunk[i].originalName, keywords: chunk[i].keywords });
        }
      }
    } catch {
      allResults.push(...chunk.map((i) => ({ displayName: i.originalName, sellerName: i.originalName, keywords: i.keywords })));
    }
  }

  return allResults;
}

// ============================================================
// AI 스토리 배치 생성
// ============================================================

/**
 * 최대 10개 상품의 스토리를 한 번의 API 호출로 생성
 * 각 스토리는 서로 다른 톤(감성형/정보형/후기형/비교형/스토리텔링형)을 순환 사용
 */
export async function generateProductStoriesBatch(
  products: StoryBatchInput[],
): Promise<AiServiceResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return products.map(() => ({ content: '', creditsUsed: 0, model: 'none' }));
  }

  // 10개씩 청크
  const chunks: StoryBatchInput[][] = [];
  for (let i = 0; i < products.length; i += 10) {
    chunks.push(products.slice(i, i + 10));
  }

  const allResults: AiServiceResult[] = [];

  for (const chunk of chunks) {
    const productList = chunk
      .map((p, idx) => {
        const tone = STORY_TONES[idx % STORY_TONES.length];
        const featureStr = p.features.length > 0 ? p.features.join(', ') : '없음';
        const descStr = p.description ? ` | 설명: ${p.description}` : '';
        return `${idx + 1}. [톤: ${tone}] 상품명: "${p.productName}" | 카테고리: ${p.categoryPath || p.category} | 특징: ${featureStr}${descStr}`;
      })
      .join('\n');

    const prompt = `당신은 쿠팡 상세페이지 전문 카피라이터입니다. 네이버 블로그 스타일로 상품 소개 글을 작성합니다.

[상품 목록]
${productList}

## 톤 설명:
- 감성형: 따뜻한 공감, 라이프스타일 연결, 감정적 어필
- 정보형: 객관적 데이터, 성분/스펙 강조, 전문가 관점
- 후기형: 실제 사용 체험담, before/after, 솔직한 리뷰
- 비교형: 기존 제품과 차별점, 가성비, 실용적 장점
- 스토리텔링형: 서사 구조, 상황 묘사, 몰입형

## 작성 형식 — 문단 배열 (블로그 스타일 핵심):
각 상품마다 3~4개 문단을 배열로 반환하세요.
이 문단들은 상세 이미지 사이사이에 삽입됩니다.

- paragraphs[0]: 상품 소개 (이 상품이 뭔지, 누구를 위한건지)
- paragraphs[1]: 핵심 특징/장점 (왜 이 상품이 좋은지)
- paragraphs[2]: 사용법/활용팁 (어떻게 사용하면 좋은지)
- paragraphs[3]: (선택) 마무리 한마디

추가로 reviewTexts도 2~3개 생성하세요:
- 실제 구매자가 쓴 것 같은 자연스러운 후기
- 각 리뷰는 50~80자, 구어체
- 매번 다른 관점 (효과, 가성비, 배송, 사용감 등)

## 규칙:
- 한국어, 각 문단 100~200자
- 순수 텍스트만 (HTML 태그 불가, 이미지 삽입 불가)
- 광고법 위반 금지: 최고/1위/완벽/기적/치료 등
- 각 상품은 반드시 다른 구조와 표현 사용

JSON: { "results": [{ "paragraphs": ["...", "...", "..."], "reviewTexts": ["...", "..."] }, ...] }
반드시 ${chunk.length}개 항목을 순서대로 반환.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      allResults.push(...chunk.map(() => ({ content: '', creditsUsed: 0, model: 'none' })));
      continue;
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      const results: { paragraphs?: string[]; reviewTexts?: string[] }[] =
        Array.isArray(parsed.results) ? parsed.results :
        Array.isArray(parsed.stories) ? parsed.stories.map((s: string) => ({ paragraphs: [s] })) :
        [];

      for (let i = 0; i < chunk.length; i++) {
        const item = results[i] || {};
        const paragraphs: string[] = Array.isArray(item.paragraphs) ? item.paragraphs : [];
        const reviewTexts: string[] = Array.isArray(item.reviewTexts) ? item.reviewTexts : [];

        // content에는 문단을 \n\n으로 합쳐서 저장 (기존 호환)
        // paragraphs와 reviewTexts는 JSON으로 별도 저장
        const content = JSON.stringify({ paragraphs, reviewTexts });
        allResults.push({
          content,
          creditsUsed: paragraphs.length > 0 ? 1200 : 0,
          model: paragraphs.length > 0 ? 'gpt-4o-mini' : 'none',
        });
      }
    } catch {
      allResults.push(...chunk.map(() => ({ content: '', creditsUsed: 0, model: 'none' })));
    }
  }

  return allResults;
}

export async function mapCategory(
  productTitle: string,
  sourceCategory: string,
  targetChannel: string
): Promise<{ categoryId: string; categoryName: string; confidence: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { categoryId: '', categoryName: '', confidence: 0 };
  }

  const prompt = `다음 상품의 ${targetChannel} 카테고리를 추천해주세요.

상품명: ${productTitle}
원본 카테고리: ${sourceCategory}

JSON 형식으로 답변: { "categoryId": "...", "categoryName": "...", "confidence": 0.0-1.0 }`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    return { categoryId: '', categoryName: '', confidence: 0 };
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  try {
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch {
    return { categoryId: '', categoryName: '', confidence: 0 };
  }
}
