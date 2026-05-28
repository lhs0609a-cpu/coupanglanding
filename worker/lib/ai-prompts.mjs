/**
 * 올인원 생성 프롬프트 빌더 (한국어 이커머스)
 * ---------------------------------------------------------------------------
 * 필드: 노출상품명/제목 · 카테고리 · 상세페이지(스토리).
 * - 페르소나 시드로 셀러마다 톤을 다르게 → 아이템위너(동일문구) 회피.
 * - 금지어/효능과장 회피를 시스템 프롬프트로 1차 차단(+ 사후 compliance-mini 검사).
 */

const FORBIDDEN_RULE =
  '절대 금지: 질병 치료/예방/완화 표현(치료·완치·항암·당뇨·면역력 증진 등), 의약품 오인, ' +
  '화장품 의학적 효능(미백·주름개선·재생·안티에이징 등 기능성 표현), ' +
  '"100% 효과/보장", "최고·1위·유일·최초" 같은 객관적 근거 없는 최상급/절대 표현, 부작용 없음. ' +
  '또한 존재하지 않는 인증·시험·임상·특허를 지어내지 말 것(예: "FDA 인증", "임상시험 완료"). ' +
  '주어진 정보에 없는 수치는 절대 만들지 말 것 — 함량 퍼센트(%), 일일권장량 대비 %, "○○% 함유/달성" 같은 수치는 입력에 명시된 경우에만 쓰고, 없으면 수치 없이 표현할 것. ' +
  '효능을 단정하지 말고 제품 특징·성분·사용감·편의 중심으로 표현할 것. 한자(漢字) 금지, 순한국어만.';

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
    ? `상품명: ${p.originalName}\n후보 카테고리(아래 문자열 중 하나를 글자 그대로 복사):\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n→ 가장 적합한 1개의 categoryPath 를 후보 문자열 그대로(변형·한자추가 금지) JSON으로.`
    : `상품명: ${p.originalName}\n특징: ${(p.features || []).join(', ')}\n→ 쿠팡식 카테고리 경로(대>중>소>세부)를 추론해 JSON으로. 한자 금지, 순한국어.`;
  return { system, prompt, format: 'json', options: { temperature: 0.2, num_predict: 120 } };
}

/** 옵션 — JSON {options:[{name,value,unit?}]}. 상품명/특징에서 도출 가능한 것만(환각 금지) */
export function buildOptionsPrompt(p) {
  const system = `당신은 쿠팡 상품 옵션 추출기다. 출력은 JSON만: {"options":[{"name":"옵션명","value":"옵션값","unit":"단위(없으면 생략)"}]}.
규칙: 상품명/특징에 실제로 드러난 정보(용량·수량·색상·사이즈·맛/종류 등)만 옵션으로. 없는 스펙은 절대 지어내지 말 것. 1~4개. 한자 금지.`;
  const prompt = `상품명: ${p.originalName}
특징: ${(p.features || []).join(', ') || '없음'}
→ 위에서 확인되는 구매옵션만 JSON으로. (예: 용량 50ml, 수량 120정, 색상 베이지)`;
  return { system, prompt, format: 'json', options: { temperature: 0.1, num_predict: 200 } };
}

/** 상세페이지(스토리) — 섹션형 한국어 카피. 일반 텍스트(마크다운 허용).
 *  p: { originalName, categoryPath, features[], leaf?, seoKeywords?[] }
 *  fixNote: 재시도 시 직전 출력의 문제를 교정 지시로 주입(검증 실패 피드백). */
export function buildDetailPrompt(p, persona, { maxTokens = 1100, fixNote = '' } = {}) {
  const leaf = (p.leaf || (p.categoryPath || '').split('>').pop() || p.originalName || '').trim();
  const seo = (p.seoKeywords || []).filter(Boolean).slice(0, 8);
  const system = `당신은 쿠팡 1페이지 상위노출과 구매전환을 동시에 잡는 한국어 상세페이지 카피라이터다. ${persona.style}.

[작성 대상] 오직 "${leaf}"(${p.categoryPath || leaf}) 상품 하나만 다룬다. 다른 종류의 상품이나 다른 카테고리의 기능·부품·효능(예: 시계인데 매트리스·수면, 마우스인데 공기청정·난방)을 절대 언급하지 않는다. 모든 문장이 "${leaf}"에 정확히 들어맞아야 한다.

[톤 — 가장 중요] 광고 같지 않게, 실제로 써본 사람이 솔직하게 추천하듯 자연스러운 후기 말투로 쓴다. 공감되는 일상 장면("이런 적 있으시죠?", "막상 받아보면")으로 시작해, 생생한 사용 경험과 이득을 이야기하듯 풀어낸다. 읽다 보면 "이거 지금 사야겠다" 싶게 구매욕이 차오르도록. (단, 특정 구매자를 사칭한 거짓 후기 — "제가 3개월 써보니" 같은 단정 — 는 쓰지 말고, 누구나 공감할 장면과 솔직한 추천 톤으로.)

[흐름]
1) 공감 후킹 한 문장(굵게 **...**) — 구매자가 겪는 상황/고민을 콕 집는다.
2) 자연스러운 본문 — "${leaf}"가 그 고민을 어떻게 풀어주는지 후기처럼 생생하게(문단 2~3개). 핵심 장점은 '- ' 불릿 3~4개로 정리하되 각 불릿도 딱딱한 스펙이 아니라 "그래서 뭐가 좋은지" 체감 이득 위주로.
3) 어떤 사람·어떤 순간에 특히 좋은지 1~2문장.
4) 부드럽지만 강하게 구매를 권하는 마무리 한 문장.

[쿠팡 SEO]
- 분량: 공백 제외 약 600~1200자(너무 짧으면 노출·신뢰 약함, 너무 길면 이탈).
- 키워드: 다음을 본문에 자연스럽게 녹인다(어색한 나열 금지): ${seo.join(', ') || leaf}. 특히 "${leaf}"는 본문 전체에서 2~4회 자연스럽게 반복 노출.

[문체] 순한국어 존댓말. 한자(漢字)·중국어·일본어·영어 문장 금지(USB·ml·LED 같은 표준 단위/약어만 허용). 같은 문장·문구 반복 금지.

[금지] ${FORBIDDEN_RULE}

[출력] 완성된 카피 본문만. '헤드라인','불릿','추천 대상','(1)','상세페이지 본문' 같은 지시문·라벨·번호를 출력에 쓰지 않는다.${fixNote ? `\n\n[직전 출력 문제 — 반드시 교정] ${fixNote}` : ''}`;
  const prompt = `상품명: ${p.originalName}
카테고리: ${p.categoryPath || '미상'}
핵심 특징: ${(p.features || []).join(', ') || '미상'}
강조점: ${persona.focus}
위 "${leaf}" 상품의 쿠팡 상세페이지 본문을, 자연스러운 후기 말투로 구매욕이 폭발하게, SEO 분량·키워드를 맞춰 작성해줘.`;
  return { system, prompt, options: { temperature: 0.8, num_predict: maxTokens } };
}
