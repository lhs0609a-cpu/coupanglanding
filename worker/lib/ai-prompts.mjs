/**
 * 올인원 생성 프롬프트 빌더 (한국어 이커머스)
 * ---------------------------------------------------------------------------
 * 필드: 노출상품명/제목 · 카테고리 · 상세페이지(스토리).
 * - 페르소나 시드로 셀러마다 톤을 다르게 → 아이템위너(동일문구) 회피.
 * - 금지어/효능과장 회피를 시스템 프롬프트로 1차 차단(+ 사후 compliance-mini 검사).
 */

const FORBIDDEN_RULE =
  '절대 금지: 질병 치료/예방/완화 표현(치료·완치·항암·당뇨·면역력 증진 등), 의약품 오인, ' +
  '"100% 효과/보장", "최고·1위·유일·최초" 같은 객관적 근거 없는 최상급/절대 표현, 부작용 없음. ' +
  '효능을 단정하지 말고 제품 특징·성분·사용감·편의 중심으로 표현할 것.';

export const PERSONAS = [
  { key: '효능정보', style: '성분과 스펙을 신뢰감 있게 설명하는 전문가 톤', focus: '성분, 함량, 규격, 사용법' },
  { key: '가성비',   style: '대용량·실용성을 강조하는 알뜰 톤',           focus: '용량, 구성, 경제성, 활용도' },
  { key: '프리미엄', style: '품질과 고급스러움을 강조하는 럭셔리 톤',     focus: '소재, 마감, 디테일, 브랜드감' },
  { key: '감성',     style: '일상 장면을 그리는 따뜻한 감성 톤',         focus: '사용 순간, 분위기, 만족감' },
  { key: '실용후기', style: '실사용자가 알려주듯 솔직 담백한 톤',         focus: '편의, 장점, 사용 팁' },
];

function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s || 'default')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
export function pickPersona(seed) { return PERSONAS[hashSeed(seed) % PERSONAS.length]; }

/** 노출상품명/제목 — JSON {displayName, sellerKeywords} */
export function buildTitlePrompt(p, persona) {
  const system = `당신은 쿠팡 상품명 카피라이터다. ${persona.style}. ${FORBIDDEN_RULE}
출력은 JSON만: {"displayName": "...", "keywords": ["..."]}. displayName 은 한국어 30~50자, 핵심 키워드 포함, 검색 친화적. 과장/특수문자 금지.`;
  const prompt = `원본 상품명: ${p.originalName}
카테고리: ${p.categoryPath || '미상'}
브랜드: ${p.brand || '없음'}
핵심 특징: ${(p.features || []).join(', ') || '미상'}
페르소나 강조점: ${persona.focus}
→ 위 상품의 새 노출상품명(displayName)과 검색 키워드 5개를 JSON으로.`;
  return { system, prompt, format: 'json', options: { temperature: 0.8, num_predict: 200 } };
}

/** 카테고리 — 후보가 있으면 그 중 선택, 없으면 경로 추론. JSON {categoryPath, confidence} */
export function buildCategoryPrompt(p, candidates = []) {
  const hasCand = candidates.length > 0;
  const system = `당신은 쿠팡 카테고리 분류기다. 출력은 JSON만: {"categoryPath": "대>중>소>세부", "confidence": 0~1}.`;
  const prompt = hasCand
    ? `상품명: ${p.originalName}\n후보 카테고리:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n→ 가장 적합한 1개를 골라 JSON으로(반드시 후보 중에서).`
    : `상품명: ${p.originalName}\n특징: ${(p.features || []).join(', ')}\n→ 쿠팡식 카테고리 경로(대>중>소>세부)를 추론해 JSON으로.`;
  return { system, prompt, format: 'json', options: { temperature: 0.2, num_predict: 120 } };
}

/** 상세페이지(스토리) — 섹션형 한국어 카피. 일반 텍스트(마크다운 허용). */
export function buildDetailPrompt(p, persona, { maxTokens = 900 } = {}) {
  const system = `당신은 쿠팡 상세페이지 카피라이터다. ${persona.style}. ${FORBIDDEN_RULE}
구성: (1) 한 줄 후킹 헤드라인 (2) 핵심 특징 3~5개 불릿 (3) 사용 장면/추천 대상 (4) 마무리 한 문장.
한국어, 자연스럽고 신뢰감 있게. 효능 단정 금지, 특징·사용감 중심.`;
  const prompt = `상품명: ${p.originalName}
카테고리: ${p.categoryPath || '미상'}
특징: ${(p.features || []).join(', ') || '미상'}
강조점: ${persona.focus}
→ 위 상품의 상세페이지 본문을 작성.`;
  return { system, prompt, options: { temperature: 0.8, num_predict: maxTokens } };
}
