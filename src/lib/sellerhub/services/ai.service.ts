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
}

/** 스토리 톤 타입 — 배치 생성 시 순환 사용 */
export const STORY_TONES = ['감성형', '정보형', '후기형', '비교형', '스토리텔링형'] as const;
export type StoryTone = (typeof STORY_TONES)[number];

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

  const prompt = `당신은 쿠팡 상품명 SEO 전문가입니다. 아래 상품 정보를 바탕으로 고유한 상품명을 생성하세요.

[원본 상품명] ${input.originalName}
[카테고리] ${input.categoryPath}
[브랜드] ${input.brand || '없음'}
[키워드] ${input.keywords.join(', ') || '없음'}
[변형 시드] ${seed}

규칙:
1. displayName (고객 노출용, 100자 이내):
   - 핵심 키워드(상품 유형, 주요 효능, 용량/수량) 포함
   - 매번 다른 단어 순서와 조합 사용
   - 유사 표현 활용 (보습/수분/촉촉, 탄력/리프팅/탱탱, 대용량/빅사이즈/넉넉한 등)
   - 자연스러운 한국어, 과도한 특수문자 금지
   - 같은 구조를 반복하지 말 것
2. sellerName (판매자 관리용, 짧고 간결, 30자 이내)
3. keywords: 추천 검색 키워드 5개 (배열)

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
    return {
      displayName: (parsed.displayName || input.originalName).slice(0, 100),
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

    const prompt = `당신은 쿠팡 상품명 SEO 전문가입니다. 아래 ${chunk.length}개 상품 각각에 대해 고유한 상품명을 생성하세요.

[변형 시드] ${seed}

[상품 목록]
${productList}

규칙:
1. displayName (고객 노출용, 100자 이내):
   - 핵심 키워드(상품 유형, 주요 효능, 용량/수량) 포함
   - 상품마다 반드시 다른 단어 순서와 조합 사용
   - 유사 표현 활용 (보습/수분/촉촉, 탄력/리프팅/탱탱, 대용량/빅사이즈/넉넉한 등)
   - 자연스러운 한국어, 과도한 특수문자 금지
   - 같은 구조를 반복하지 말 것
2. sellerName (판매자 관리용, 짧고 간결, 30자 이내)
3. keywords: 추천 검색 키워드 5개

JSON 배열로만 응답: { "results": [{ "displayName": "...", "sellerName": "...", "keywords": ["..."] }, ...] }
반드시 ${chunk.length}개 항목을 순서대로 반환하세요.`;

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
          allResults.push({
            displayName: String(r.displayName).slice(0, 100),
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
        return `${idx + 1}. [톤: ${tone}] 상품명: "${p.productName}" | 카테고리: ${p.category} | 특징: ${featureStr}${descStr}`;
      })
      .join('\n');

    const prompt = `당신은 쿠팡 상세페이지 전문 카피라이터입니다. 아래 ${chunk.length}개 상품 각각에 대해 지정된 톤으로 구매유도 스토리를 HTML로 작성하세요.

[상품 목록]
${productList}

톤 설명:
- 감성형: 감정적 공감, 따뜻한 어조, 라이프스타일 연결
- 정보형: 객관적 데이터, 성분/스펙 강조, 전문가 관점
- 후기형: 실제 사용 후기 형태, 체험담, before/after
- 비교형: 기존 제품과 비교, 차별점 강조, 가성비 어필
- 스토리텔링형: 서사 구조, 상황 묘사, 몰입형 콘텐츠

공통 규칙:
- 한국어로 작성 (각 800자 내외)
- 인라인 스타일만 사용 (외부 CSS 불가)
- max-width: 860px, 가운데 정렬
- 3~4개 단락으로 구성
- <script>, <link>, <style>, <img> 태그 금지
- 반드시 <div> 태그로 전체를 감싸기
- 각 스토리는 서로 다른 구조와 표현을 사용할 것

JSON으로만 응답: { "stories": ["<div>...</div>", "<div>...</div>", ...] }
반드시 ${chunk.length}개의 HTML 스토리를 순서대로 반환하세요.`;

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
      const stories: string[] = Array.isArray(parsed.stories) ? parsed.stories : [];

      for (let i = 0; i < chunk.length; i++) {
        let html = stories[i] || '';
        // HTML만 추출 (마크다운 코드블록 제거)
        const htmlMatch = html.match(/<div[\s\S]*<\/div>/i);
        if (htmlMatch) {
          html = htmlMatch[0];
        }
        allResults.push({
          content: html,
          creditsUsed: html ? 1200 : 0,
          model: html ? 'gpt-4o-mini' : 'none',
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
