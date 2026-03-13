export interface AiServiceResult {
  content: string;
  creditsUsed: number;
  model: string;
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
