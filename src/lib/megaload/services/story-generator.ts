// ============================================================
// 상품 스토리/후기 랜덤 템플릿 생성기
//
// AI 없이 즉시 생성. 카테고리별 템플릿 × 변수 × 톤 조합.
// 같은 상품이라도 셀러마다 다른 스토리.
// 상세설명 HTML에 이미지↔텍스트 교차 구조로 삽입.
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import storyData from '../data/story-templates.json';

// ─── 타입 ────────────────────────────────────────────────────

interface StoryTemplate {
  type: 'review' | 'qa' | 'info' | 'compare' | 'story';
  text: string;
}

interface Tone {
  id: string;
  name: string;
  prefix: string;
  suffix: string;
  style: string;
}

// ─── 데이터 로드 ─────────────────────────────────────────────

const TONES: Tone[] = storyData.tones as Tone[];
const TEMPLATES: Record<string, StoryTemplate[]> = storyData.templates as Record<string, StoryTemplate[]>;
const VARIABLES: Record<string, Record<string, string[]>> = storyData.variables as Record<string, Record<string, string[]>>;

// ─── 카테고리 매핑 ───────────────────────────────────────────

function getCategoryKey(categoryPath: string): string {
  const top = categoryPath.split('>')[0]?.trim() || '';
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품')) return '식품';
  if (top.includes('생활') || top.includes('주방') || top.includes('문구')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  // 나머지는 DEFAULT
  for (const key of Object.keys(TEMPLATES)) {
    if (key !== 'DEFAULT' && top.includes(key.split('/')[0])) return key;
  }
  return 'DEFAULT';
}

// ─── 변수 치환 ───────────────────────────────────────────────

function fillTemplate(
  template: string,
  vars: Record<string, string[]>,
  productName: string,
  rng: () => number,
): string {
  let result = template;

  // {product} → 상품명
  result = result.replace(/\{product\}/g, productName);

  // {변수명} → 풀에서 랜덤 선택
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)];
    }
    return match; // 매칭 안 되면 원본 유지
  });

  return result;
}

// ─── 톤 적용 ─────────────────────────────────────────────────

function applyTone(text: string, tone: Tone): string {
  let result = text;

  // prefix 추가
  if (tone.prefix) result = tone.prefix + ' ' + result;

  // suffix 추가 (마지막 문장에)
  if (tone.suffix) {
    const lastDot = result.lastIndexOf('.');
    if (lastDot >= 0) {
      result = result.slice(0, lastDot + 1) + ' ' + tone.suffix;
    } else {
      result += ' ' + tone.suffix;
    }
  }

  return result;
}

// ─── 공개 API ────────────────────────────────────────────────

export interface StoryResult {
  paragraphs: string[];     // 3~5개 스토리 문단 (이미지 사이에 삽입)
  reviewTexts: string[];    // 2~3개 짧은 후기 (리뷰 이미지 캡션)
  tone: string;             // 사용된 톤
}

/**
 * 상품 스토리/후기 생성
 *
 * @param productName 상품명 (짧은 형태)
 * @param categoryPath 쿠팡 카테고리 경로
 * @param sellerSeed 셀러 고유 시드
 * @param productIndex 상품 인덱스
 */
export function generateStory(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): StoryResult {
  const catKey = getCategoryKey(categoryPath);
  const templates = TEMPLATES[catKey] || TEMPLATES['DEFAULT'];
  const vars = VARIABLES[catKey] || VARIABLES['DEFAULT'];

  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::story::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  // 톤 선택
  const tone = TONES[Math.floor(rng() * TONES.length)];

  // 이름 정리 (괄호/특수문자 제거, 짧게)
  const cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // 템플릿 셔플 후 타입별로 선택
  const shuffled = [...templates].sort(() => rng() - 0.5);

  // 5~7개 문단 선택 (다양한 타입으로, 더 풍부한 상세설명)
  const usedTypes = new Set<string>();
  const selectedParagraphs: StoryTemplate[] = [];
  for (const t of shuffled) {
    if (selectedParagraphs.length >= 6) break;
    // 같은 타입은 최대 2개
    const typeCount = selectedParagraphs.filter(s => s.type === t.type).length;
    if (typeCount >= 2) continue;
    selectedParagraphs.push(t);
    usedTypes.add(t.type);
  }

  // 변수 치환 + 문단 확장 + 톤 적용
  const EXPANSION_SENTENCES = [
    '꾸준히 사용하면 더 좋은 결과를 기대할 수 있어요.',
    '주변에 추천하고 싶을 정도로 만족스러워요.',
    '다른 제품으로 바꿀 생각이 전혀 없어요.',
    '가격 대비 만족도가 정말 높아요.',
    '포장도 꼼꼼하고 배송도 빨랐어요.',
    '하나 더 구매해서 지인에게 선물할 예정이에요.',
    '온 가족이 함께 사용하고 있어요.',
    '처음에는 반신반의했는데 결과에 놀랐어요.',
    '이 가격에 이 퀄리티면 정말 가성비 최고예요.',
    '앞으로도 계속 재구매할 생각이에요.',
    '사용법도 간단해서 누구나 쉽게 쓸 수 있어요.',
    '선물용으로도 정말 좋아요.',
    '매일 꾸준히 사용하니까 확실히 달라지는 게 느껴져요.',
    '리뷰 보고 구매했는데 리뷰 그대로예요.',
    '정기배송으로 구매하고 있어요. 그만큼 만족해요.',
  ];

  const paragraphs = selectedParagraphs.map(t => {
    let filled = fillTemplate(t.text, vars, cleanName, rng);
    // 문단 확장: 2~3개 추가 문장 붙이기 (총 3~5줄)
    const extraCount = 1 + Math.floor(rng() * 2); // 1~2개 추가
    for (let e = 0; e < extraCount; e++) {
      const extra = EXPANSION_SENTENCES[Math.floor(rng() * EXPANSION_SENTENCES.length)];
      filled += ' ' + extra;
    }
    return applyTone(filled, tone);
  });

  // 리뷰 텍스트 (짧은 후기 3~4개, 각 2~3줄)
  const reviewTemplates = shuffled.filter(t => t.type === 'review' && !selectedParagraphs.includes(t));
  const reviewTexts = reviewTemplates.slice(0, 4).map(t => {
    let filled = fillTemplate(t.text, vars, cleanName, rng);
    // 리뷰도 1줄 추가
    const extra = EXPANSION_SENTENCES[Math.floor(rng() * EXPANSION_SENTENCES.length)];
    filled += ' ' + extra;
    return filled;
  });

  return { paragraphs, reviewTexts, tone: tone.name };
}

/**
 * 배치 스토리 생성
 */
export function generateStoryBatch(
  products: { name: string; categoryPath: string }[],
  sellerSeed: string,
): StoryResult[] {
  return products.map((p, i) => generateStory(p.name, p.categoryPath, sellerSeed, i));
}

// ─── 상세설명 HTML 조합 ──────────────────────────────────────

/**
 * 스토리 텍스트 + 이미지를 교차 배치한 상세설명 HTML 생성
 *
 * 구조: 스토리1 → 이미지1 → 스토리2 → 이미지2 → ... → 상품정보고시 이미지
 */
export function buildStoryDetailHtml(params: {
  paragraphs: string[];
  detailImageUrls: string[];
  infoImageUrls?: string[];
  reviewTexts?: string[];
  reviewImageUrls?: string[];
  productName: string;
  brand?: string;
}): string {
  const { paragraphs, detailImageUrls, infoImageUrls, reviewTexts, reviewImageUrls, productName, brand } = params;

  const sections: string[] = [];

  // 헤더
  sections.push(`
    <div style="text-align:center;padding:30px 20px;background:#fafafa;border-radius:12px;margin-bottom:20px;">
      <h2 style="font-size:22px;font-weight:700;color:#333;margin:0 0 8px 0;">${escapeHtml(productName)}</h2>
      ${brand ? `<p style="font-size:14px;color:#888;margin:0;">${escapeHtml(brand)}</p>` : ''}
    </div>
  `);

  // 스토리↔이미지 교차
  const maxBlocks = Math.max(paragraphs.length, detailImageUrls.length);
  for (let i = 0; i < maxBlocks; i++) {
    // 텍스트 블록
    if (i < paragraphs.length) {
      const p = paragraphs[i];
      // Q&A 형식 처리
      if (p.includes('Q.') && p.includes('A.')) {
        const [q, a] = p.split(/\nA\.\s*/);
        sections.push(`
          <div style="padding:24px 20px;margin:16px 0;background:#f8f9fa;border-left:4px solid #E31837;border-radius:0 8px 8px 0;">
            <p style="font-size:15px;font-weight:600;color:#E31837;margin:0 0 12px 0;">${escapeHtml(q.replace(/^Q\.\s*/, 'Q. '))}</p>
            <p style="font-size:15px;color:#333;line-height:1.7;margin:0;">A. ${escapeHtml(a || '')}</p>
          </div>
        `);
      } else {
        sections.push(`
          <div style="padding:20px;margin:16px 0;">
            <p style="font-size:15px;color:#444;line-height:1.8;text-align:center;margin:0;word-break:keep-all;">
              "${escapeHtml(p)}"
            </p>
          </div>
        `);
      }
    }

    // 이미지 블록
    if (i < detailImageUrls.length) {
      sections.push(`
        <div style="margin:8px 0;text-align:center;">
          <img src="${escapeHtml(detailImageUrls[i])}" style="max-width:100%;height:auto;border-radius:8px;" alt="${escapeHtml(productName)}" />
        </div>
      `);
    }
  }

  // 리뷰 섹션 (있으면)
  if (reviewTexts && reviewTexts.length > 0 && reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(`
      <div style="margin:32px 0;padding:24px;background:#fff9fa;border-radius:12px;">
        <h3 style="font-size:16px;font-weight:600;color:#E31837;text-align:center;margin:0 0 16px 0;">구매자 후기</h3>
    `);

    for (let i = 0; i < Math.min(reviewTexts.length, reviewImageUrls.length); i++) {
      sections.push(`
        <div style="display:flex;align-items:flex-start;gap:12px;margin:12px 0;padding:12px;background:#fff;border-radius:8px;">
          <img src="${escapeHtml(reviewImageUrls[i])}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="" />
          <p style="font-size:13px;color:#555;line-height:1.6;margin:0;">"${escapeHtml(reviewTexts[i])}"</p>
        </div>
      `);
    }

    sections.push(`</div>`);
  }

  // 상품정보고시 이미지 (마지막)
  if (infoImageUrls && infoImageUrls.length > 0) {
    sections.push(`
      <div style="margin:32px 0 0 0;padding:20px 0;border-top:1px solid #eee;">
        <h3 style="font-size:14px;color:#888;text-align:center;margin:0 0 16px 0;">상품정보제공고시</h3>
    `);
    for (const url of infoImageUrls) {
      sections.push(`
        <div style="margin:4px 0;text-align:center;">
          <img src="${escapeHtml(url)}" style="max-width:100%;height:auto;" alt="상품정보" />
        </div>
      `);
    }
    sections.push(`</div>`);
  }

  return `<div style="max-width:860px;margin:0 auto;font-family:'Noto Sans KR',sans-serif;">${sections.join('')}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
