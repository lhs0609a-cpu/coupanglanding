// ============================================================
// 리치 HTML 상세페이지 빌더 — SEO 최적화 7섹션 구조
//
// 구조 (쿠팡 검색 노출 + 체류시간 극대화):
//   1. 히어로 헤더: 브랜드 + 상품명 + SEO 키워드 배지
//   2. 이미지-스토리 교차: 블로그 스타일 긴 문단
//   3. FAQ: 카테고리별 Q&A (검색 노출 + 체류시간↑)
//   4. 후기 섹션: 이미지 + 상세 텍스트
//   5. 키워드 마무리: SEO 키워드 자연 포함 구매 유도
//   6. 상품정보제공고시
//   7. 위탁판매 정보
//
// 아이템위너 방지: 4가지 레이아웃 변형 (A/B/C/D)
//
// V2: 설득형 콘텐츠 블록 렌더러 (11가지 블록 타입별 HTML)
// ============================================================

import type { ContentBlock } from './persuasion-engine';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface DetailPageParams {
  productName: string;
  brand?: string;
  aiStoryParagraphs?: string[];   // AI 생성 문단 배열 (이미지 사이에 삽입)
  aiStoryHtml?: string;            // 기존 호환: 단일 HTML 문자열
  reviewImageUrls?: string[];
  reviewTexts?: string[];          // 리뷰 이미지별 AI 생성 텍스트
  detailImageUrls: string[];
  infoImageUrls?: string[];        // 상품정보제공고시 이미지
  consignmentImageUrls?: string[]; // 위탁판매/신뢰 정보 이미지
  thirdPartyImageUrl?: string;     // 제3자 이미지 (랜덤 1장, 법적 리스크 분산용)
  // SEO 신규 필드
  seoKeywords?: string[];          // SEO 키워드 배지 (3~6개)
  faqItems?: FaqItem[];            // 카테고리별 FAQ (3~5개)
  closingText?: string;            // SEO 마무리 문구
  categoryPath?: string;           // 카테고리 경로 (컬러 테마용)
  // V2: 설득형 콘텐츠 블록
  contentBlocks?: ContentBlock[];    // 설득형 블록 배열 (있으면 새 렌더러 사용)
  // 상품고지정보 텍스트 테이블 (이미지 없을 때 폴백)
  noticeFields?: { name: string; value: string }[];
}

// ─── 레이아웃별 CSS 변형값 ──────────────────────────────────

interface LayoutStyle {
  maxWidth: string;
  fontSize: string;
  padding: string;
  lineHeight: string;
}

const LAYOUT_STYLES: Record<string, LayoutStyle> = {
  A: { maxWidth: '860px', fontSize: '15px', padding: '24px 30px', lineHeight: '1.9' },
  B: { maxWidth: '880px', fontSize: '16px', padding: '28px 32px', lineHeight: '1.85' },
  C: { maxWidth: '840px', fontSize: '14px', padding: '20px 24px', lineHeight: '1.95' },
  D: { maxWidth: '860px', fontSize: '15px', padding: '22px 28px', lineHeight: '1.9' },
};

function getStyle(variant?: string): LayoutStyle {
  return LAYOUT_STYLES[variant || 'A'] || LAYOUT_STYLES.A;
}

// ─── 카테고리별 테마 컬러 ──────────────────────────────────

interface ThemeColor {
  primary: string;     // 주 악센트
  bgLight: string;     // 밝은 배경
  bgAccent: string;    // 강조 배경
  textAccent: string;  // 강조 텍스트
}

const CATEGORY_THEMES: Record<string, ThemeColor> = {
  '뷰티':       { primary: '#E31837', bgLight: '#FFF5F7', bgAccent: '#FEE2E8', textAccent: '#C81535' },
  '식품':       { primary: '#2E7D32', bgLight: '#F1F8E9', bgAccent: '#DCEDC8', textAccent: '#1B5E20' },
  '생활':       { primary: '#1565C0', bgLight: '#E3F2FD', bgAccent: '#BBDEFB', textAccent: '#0D47A1' },
  '가전':       { primary: '#37474F', bgLight: '#ECEFF1', bgAccent: '#CFD8DC', textAccent: '#263238' },
  '패션':       { primary: '#6D4C41', bgLight: '#EFEBE9', bgAccent: '#D7CCC8', textAccent: '#4E342E' },
  '가구':       { primary: '#5D4037', bgLight: '#FBE9E7', bgAccent: '#FFCCBC', textAccent: '#3E2723' },
  '출산':       { primary: '#F06292', bgLight: '#FCE4EC', bgAccent: '#F8BBD0', textAccent: '#C2185B' },
  '스포츠':     { primary: '#FF6F00', bgLight: '#FFF8E1', bgAccent: '#FFECB3', textAccent: '#E65100' },
  '반려':       { primary: '#00897B', bgLight: '#E0F2F1', bgAccent: '#B2DFDB', textAccent: '#00695C' },
  '주방':       { primary: '#D84315', bgLight: '#FBE9E7', bgAccent: '#FFCCBC', textAccent: '#BF360C' },
  '문구':       { primary: '#5C6BC0', bgLight: '#E8EAF6', bgAccent: '#C5CAE9', textAccent: '#283593' },
  '완구':       { primary: '#AB47BC', bgLight: '#F3E5F5', bgAccent: '#E1BEE7', textAccent: '#7B1FA2' },
  '자동차':     { primary: '#455A64', bgLight: '#ECEFF1', bgAccent: '#CFD8DC', textAccent: '#37474F' },
  'DEFAULT':    { primary: '#E31837', bgLight: '#FAFAFA', bgAccent: '#F5F5F5', textAccent: '#E31837' },
};

function getTheme(categoryPath?: string): ThemeColor {
  if (!categoryPath) return CATEGORY_THEMES['DEFAULT'];
  const top = categoryPath.split('>')[0]?.trim() || '';
  for (const [key, theme] of Object.entries(CATEGORY_THEMES)) {
    if (key !== 'DEFAULT' && top.includes(key)) return theme;
  }
  return CATEGORY_THEMES['DEFAULT'];
}

/**
 * SEO 최적화 상세페이지 HTML을 생성한다.
 *
 * @param templateVariant - 레이아웃 변형 (A/B/C/D), 아이템위너 방지용
 *
 * A (기본): 히어로 → 이미지-글 교차 → FAQ → 리뷰 → 키워드마무리 → 정보
 * B: 히어로 → 이미지 전체 → 글모음 → FAQ → 리뷰 → 키워드마무리 → 정보
 * C: 히어로 → 히어로이미지 → 글 → 2열그리드 → FAQ → 리뷰 → 키워드마무리 → 정보
 * D: 이미지-글 교차(헤더없음) → FAQ → 텍스트리뷰 → 키워드마무리 → 정보
 */
export function buildRichDetailPageHtml(params: DetailPageParams, templateVariant?: string): string {
  // V2: contentBlocks가 있으면 설득형 렌더러 사용
  if (params.contentBlocks && params.contentBlocks.length > 0) {
    return buildPersuasionPageHtml(params, params.contentBlocks, templateVariant);
  }

  const variant = templateVariant || 'A';
  switch (variant) {
    case 'B': return buildLayoutB(params);
    case 'C': return buildLayoutC(params);
    case 'D': return buildLayoutD(params);
    default:  return buildLayoutA(params);
  }
}

// ─── 레이아웃 A (기본: 히어로 → 이미지-글 교차 → FAQ → 리뷰 → 마무리) ──

function buildLayoutA(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrl, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('A');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  const detailSet = new Set(detailImageUrls);
  const uniqueReviews = (reviewImageUrls || []).filter(url => !detailSet.has(url)).slice(0, 5);
  const allImages = [...detailImageUrls, ...uniqueReviews];
  if (allImages.length > 0) {
    sections.push(buildBlogStyleSection(allImages, paragraphs, productName, style, theme));
  } else if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildDivider());
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName, style, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrl) sections.push(buildThirdPartySection(thirdPartyImageUrl));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 B (이미지 전체 → 글모음 → FAQ → 리뷰 → 마무리) ──

function buildLayoutB(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrl, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('B');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  for (let i = 0; i < detailImageUrls.length; i++) {
    sections.push(`<div style="margin:0;"><img src="${esc(detailImageUrls[i])}" alt="${esc(productName)} ${i + 1}" style="width:100%;display:block;" /></div>`);
  }

  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (paragraphs.length > 0) {
    sections.push(`<div style="padding:32px ${style.padding.split(' ')[1] || '32px'};">`);
    for (const p of paragraphs) {
      sections.push(buildParagraphBlock(p, style));
    }
    sections.push('</div>');
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildDivider());
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName, style, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrl) sections.push(buildThirdPartySection(thirdPartyImageUrl));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 C (히어로이미지 → 글 → 2열그리드 → FAQ → 리뷰 → 마무리) ──

function buildLayoutC(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrl, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('C');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  if (detailImageUrls.length > 0) {
    sections.push(`<div style="margin:0;"><img src="${esc(detailImageUrls[0])}" alt="${esc(productName)} 메인" style="width:100%;display:block;" /></div>`);
  }

  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  if (detailImageUrls.length > 1) {
    const remaining = detailImageUrls.slice(1);
    sections.push('<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 0;">');
    for (let i = 0; i < remaining.length; i++) {
      const w = remaining.length === 1 ? '100%' : 'calc(50% - 2px)';
      sections.push(`<div style="width:${w};"><img src="${esc(remaining[i])}" alt="${esc(productName)} ${i + 2}" style="width:100%;display:block;" /></div>`);
    }
    sections.push('</div>');
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildDivider());
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName, style, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrl) sections.push(buildThirdPartySection(thirdPartyImageUrl));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 D (헤더없음 → 이미지-글 교차 → FAQ → 텍스트리뷰 → 마무리) ──

function buildLayoutD(params: DetailPageParams): string {
  const { productName, aiStoryParagraphs, aiStoryHtml, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrl, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('D');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));

  // 키워드 배지만 표시 (헤더 없음)
  if (seoKeywords && seoKeywords.length > 0) {
    sections.push(buildKeywordBadgesOnly(seoKeywords, theme));
  }

  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (detailImageUrls.length > 0) {
    sections.push(buildBlogStyleSection(detailImageUrls, paragraphs, productName, style, theme));
  } else if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  // 텍스트 리뷰만 (이미지 없음)
  if (reviewTexts && reviewTexts.length > 0) {
    sections.push('<div style="padding:32px 0 16px;">');
    sections.push(`<div style="text-align:center;font-size:18px;font-weight:bold;color:${theme.textAccent};margin-bottom:16px;">구매 후기</div>`);
    for (const rt of reviewTexts) {
      if (rt.trim()) {
        sections.push(
          `<div style="padding:14px 24px;line-height:1.8;font-size:14px;color:#555;background:${theme.bgLight};border-radius:8px;margin:8px 16px;">`
          + `${esc(rt)}</div>`
        );
      }
    }
    sections.push('</div>');
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrl) sections.push(buildThirdPartySection(thirdPartyImageUrl));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 공통 섹션 빌더 ─────────────────────────────────────────

function buildWrapper(style: LayoutStyle, theme: ThemeColor): string {
  return `<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#333;background:#fff;">`;
}

/** 섹션 1: 히어로 헤더 — 브랜드 + 상품명 + SEO 키워드 배지 */
function buildHeroSection(productName: string, brand?: string, seoKeywords?: string[], theme?: ThemeColor): string {
  const t = theme || CATEGORY_THEMES['DEFAULT'];
  const parts: string[] = [];
  parts.push(`<div style="text-align:center;padding:48px 20px 36px;background:${t.bgLight};">`);
  if (brand) {
    parts.push(`<div style="font-size:13px;color:#999;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;">${esc(brand)}</div>`);
  }
  parts.push(`<div style="font-size:26px;font-weight:bold;color:#111;line-height:1.5;margin-bottom:16px;">${esc(productName)}</div>`);
  parts.push(`<div style="width:60px;height:3px;background:${t.primary};margin:0 auto 20px;border-radius:2px;"></div>`);

  // SEO 키워드 배지
  if (seoKeywords && seoKeywords.length > 0) {
    parts.push('<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px;">');
    for (const kw of seoKeywords.slice(0, 6)) {
      parts.push(`<span style="display:inline-block;padding:6px 14px;background:${t.bgAccent};color:${t.textAccent};font-size:13px;font-weight:500;border-radius:20px;letter-spacing:0.3px;">${esc(kw)}</span>`);
    }
    parts.push('</div>');
  }

  parts.push('</div>');
  return parts.join('\n');
}

/** 레이아웃 D 전용: 키워드 배지만 (헤더 없이) */
function buildKeywordBadgesOnly(keywords: string[], theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push('<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:20px 16px;">');
  for (const kw of keywords.slice(0, 6)) {
    parts.push(`<span style="display:inline-block;padding:6px 14px;background:${theme.bgAccent};color:${theme.textAccent};font-size:13px;font-weight:500;border-radius:20px;">${esc(kw)}</span>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** 섹션 2: 이미지-스토리 교차 (블로그 스타일) */
function buildBlogStyleSection(
  imageUrls: string[],
  paragraphs: string[],
  productName: string,
  style: LayoutStyle,
  theme?: ThemeColor,
): string {
  const parts: string[] = [];
  const maxLen = Math.max(imageUrls.length, paragraphs.length);

  for (let i = 0; i < maxLen; i++) {
    if (i < paragraphs.length && paragraphs[i].trim()) {
      parts.push(buildParagraphBlock(paragraphs[i], style));
    }
    if (i < imageUrls.length) {
      parts.push(
        `<div style="margin:12px 0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} ${i + 1}" style="width:100%;display:block;border-radius:8px;" /></div>`
      );
    }
  }

  return parts.join('\n');
}

function buildParagraphBlock(text: string, style: LayoutStyle): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(text);
  const content = isHtml ? text : `<p style="margin:0;">${esc(text)}</p>`;
  return `<div style="padding:${style.padding};line-height:${style.lineHeight};font-size:${style.fontSize};color:#444;word-break:keep-all;">\n${content}\n</div>`;
}

/** 섹션 3: FAQ — 카테고리별 Q&A (쿠팡 검색 노출 + 체류시간↑) */
function buildFaqSection(items: FaqItem[], theme: ThemeColor): string {
  const parts: string[] = [];

  parts.push('<div style="padding:36px 0 20px;">');
  parts.push('<div style="text-align:center;margin-bottom:24px;">');
  parts.push(`<div style="font-size:12px;color:${theme.primary};letter-spacing:4px;font-weight:600;margin-bottom:6px;">FAQ</div>`);
  parts.push('<div style="font-size:20px;font-weight:bold;color:#222;">자주 묻는 질문</div>');
  parts.push(`<div style="width:40px;height:2px;background:${theme.primary};margin:12px auto 0;"></div>`);
  parts.push('</div>');

  for (const item of items) {
    parts.push(`<div style="margin:12px 20px;border-radius:12px;overflow:hidden;border:1px solid #eee;">`);
    parts.push(`<div style="padding:16px 20px;background:${theme.bgLight};font-size:15px;font-weight:600;color:#333;">Q. ${esc(item.question)}</div>`);
    parts.push(`<div style="padding:16px 20px;font-size:14px;color:#555;line-height:1.8;background:#fff;">A. ${esc(item.answer)}</div>`);
    parts.push('</div>');
  }

  parts.push('</div>');
  return parts.join('\n');
}

/** 섹션 4: 후기 — 이미지 + 상세 텍스트 */
function buildBlogReviewSection(
  imageUrls: string[],
  reviewTexts: string[] | undefined,
  productName: string,
  style: LayoutStyle,
  theme: ThemeColor,
): string {
  const parts: string[] = [];

  parts.push('<div style="padding:36px 0 20px;">');
  parts.push('<div style="text-align:center;">');
  parts.push(`<div style="font-size:12px;color:${theme.primary};letter-spacing:4px;font-weight:600;margin-bottom:8px;">REAL REVIEW</div>`);
  parts.push('<div style="font-size:20px;font-weight:bold;color:#222;">실제 사용 후기</div>');
  parts.push(`<div style="width:40px;height:2px;background:${theme.primary};margin:12px auto 0;"></div>`);
  parts.push('</div>');
  parts.push('</div>');

  for (let i = 0; i < imageUrls.length; i++) {
    parts.push(
      `<div style="margin:0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} 리뷰 ${i + 1}" style="width:100%;display:block;" /></div>`
    );
    if (reviewTexts && i < reviewTexts.length && reviewTexts[i].trim()) {
      parts.push(
        `<div style="padding:16px 24px 20px;line-height:1.8;font-size:${style.fontSize};color:#555;background:${theme.bgLight};border-left:3px solid ${theme.primary};margin:8px 20px 16px;border-radius:0 8px 8px 0;">`
        + `${esc(reviewTexts[i])}`
        + `</div>`
      );
    }
  }

  return parts.join('\n');
}

/** 섹션 5: 키워드 마무리 — SEO 키워드를 자연스럽게 포함한 구매 유도 문구 */
function buildClosingSection(closingText: string, productName: string, theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:32px 24px;text-align:center;background:${theme.bgLight};border-radius:12px;margin:0 16px;">`);
  parts.push(`<div style="width:40px;height:2px;background:${theme.primary};margin:0 auto 20px;border-radius:2px;"></div>`);
  parts.push(`<div style="font-size:15px;color:#444;line-height:1.9;word-break:keep-all;">${esc(closingText)}</div>`);
  parts.push('</div>');
  return parts.join('\n');
}

function buildDivider(): string {
  return '<div style="height:2px;background:linear-gradient(90deg,transparent,#ddd,transparent);margin:40px 0;"></div>';
}

function buildInfoSection(urls: string[], productName: string): string {
  const parts: string[] = [];
  parts.push('<div style="padding:30px 0 0;">');
  parts.push('<div style="text-align:center;margin-bottom:20px;">');
  parts.push('<div style="font-size:16px;font-weight:bold;color:#555;letter-spacing:1px;">상품정보제공고시</div>');
  parts.push('</div>');
  for (const url of urls) {
    parts.push(`<img src="${esc(url)}" alt="${esc(productName)} 상품정보" style="width:100%;display:block;margin-bottom:4px;" />`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

function buildConsignmentSection(urls: string[]): string {
  const parts: string[] = [];
  parts.push('<div style="padding:20px 0 30px;">');
  parts.push('<div style="text-align:center;margin-bottom:16px;">');
  parts.push('<div style="font-size:14px;font-weight:bold;color:#777;">위탁판매 안내 및 판매자 정보</div>');
  parts.push('</div>');
  for (const url of urls) {
    parts.push(`<img src="${esc(url)}" alt="위탁판매 정보" style="width:100%;display:block;margin-bottom:4px;" />`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

function buildThirdPartySection(url: string): string {
  return `<div style="padding:20px 0 30px;"><img src="${esc(url)}" alt="추가 정보" style="width:100%;display:block;" /></div>`;
}

/** 상품고지정보 텍스트 테이블 — 모바일 최적화 */
function buildNoticeTable(fields: { name: string; value: string }[]): string {
  const rows = fields
    .filter(f => f.name && f.value)
    .map(f =>
      `<tr><td style="padding:10px 14px;background:#f8f9fa;border:1px solid #e9ecef;font-size:13px;font-weight:600;color:#555;width:35%;vertical-align:top;word-break:keep-all;">${esc(f.name)}</td>`
      + `<td style="padding:10px 14px;border:1px solid #e9ecef;font-size:13px;color:#444;line-height:1.6;word-break:keep-all;">${esc(f.value)}</td></tr>`
    )
    .join('\n');

  return `<div style="padding:30px 0 0;">
<div style="text-align:center;margin-bottom:20px;">
<div style="font-size:16px;font-weight:bold;color:#555;letter-spacing:1px;">상품정보제공고시</div>
</div>
<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
${rows}
</table>
</div>`;
}

// ─── V2: 설득형 콘텐츠 블록 렌더러 (11가지 타입) ─────────────

/** hook: 큰 폰트, 중앙정렬, 배경 그라데이션, 모바일 최적 */
function renderHookBlock(block: ContentBlock, theme: ThemeColor): string {
  return `<div style="text-align:center;padding:28px 16px;background:linear-gradient(135deg,${theme.bgLight},${theme.bgAccent});border-radius:16px;margin:16px 0;">
<h3 style="font-size:18px;font-weight:700;color:#222;line-height:1.6;margin:0;word-break:keep-all;">${esc(block.content)}</h3>
</div>`;
}

/** problem: 좌측 빨간 보더, 아이콘(⚠), 회색 배경 */
function renderProblemBlock(block: ContentBlock, theme: ThemeColor): string {
  return `<div style="padding:20px 24px;margin:16px 0;background:#f8f9fa;border-left:4px solid ${theme.primary};border-radius:0 12px 12px 0;">
<div style="font-size:14px;color:${theme.primary};font-weight:600;margin-bottom:8px;">&#9888; 이런 고민, 있으신가요?</div>
<p style="font-size:15px;color:#444;line-height:1.8;margin:0;word-break:keep-all;">${esc(block.content)}</p>
</div>`;
}

/** agitation: 진한 배경, 볼드 텍스트, 경고 톤 */
function renderAgitationBlock(block: ContentBlock, theme: ThemeColor): string {
  return `<div style="padding:24px;margin:16px 0;background:#2c2c2c;border-radius:12px;">
<p style="font-size:15px;color:#fff;font-weight:600;line-height:1.8;margin:0;word-break:keep-all;">&#9888;&#65039; ${esc(block.content)}</p>
</div>`;
}

/** solution: 밝은 배경, 테마 컬러 악센트, 모바일 경량화 */
function renderSolutionBlock(block: ContentBlock, theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:24px 16px;margin:16px 0;background:${theme.bgLight};border:2px solid ${theme.bgAccent};border-radius:16px;text-align:center;">`);
  parts.push(`<h3 style="font-size:17px;font-weight:700;color:#222;line-height:1.6;margin:0;word-break:keep-all;">${esc(block.content)}</h3>`);
  parts.push('</div>');
  return parts.join('\n');
}

/** benefits_grid: flex 카드, 체크마크 아이콘, 3개 제한, 모바일 최적 */
function renderBenefitsGridBlock(block: ContentBlock, theme: ThemeColor): string {
  const items = block.items || [];
  const parts: string[] = [];
  parts.push(`<div style="padding:20px 12px;margin:12px 0;">`);
  parts.push(`<div style="text-align:center;font-size:15px;font-weight:700;color:#222;margin-bottom:12px;">${esc(block.content)}</div>`);
  parts.push(`<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">`);
  for (const item of items.slice(0, 3)) {
    parts.push(`<div style="flex:1;min-width:90px;max-width:32%;padding:12px 8px;background:${theme.bgLight};border-radius:10px;text-align:center;">
<div style="font-size:18px;margin-bottom:6px;color:${theme.primary};">&#10003;</div>
<div style="font-size:12px;color:#444;font-weight:500;word-break:keep-all;">${esc(item)}</div>
</div>`);
  }
  parts.push('</div></div>');
  return parts.join('\n');
}

/** social_proof: 큰 인용부호("), 이탤릭, 별점 시각화 */
function renderSocialProofBlock(block: ContentBlock, theme: ThemeColor): string {
  const stars = block.emphasis || '⭐⭐⭐⭐⭐';
  return `<div style="padding:28px 24px;margin:16px 0;background:#fff;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
<div style="font-size:40px;color:${theme.bgAccent};line-height:1;margin-bottom:4px;">&ldquo;</div>
<p style="font-size:15px;color:#444;line-height:1.8;font-style:italic;margin:0 0 12px 0;word-break:keep-all;">${esc(block.content)}</p>
<div style="font-size:16px;letter-spacing:2px;">${esc(stars)}</div>
</div>`;
}

/** comparison: ✓/✗ 리스트, 좌우 비교 */
function renderComparisonBlock(block: ContentBlock, theme: ThemeColor): string {
  const items = block.items || [];
  const pros = items.filter(i => i.startsWith('✓'));
  const cons = items.filter(i => i.startsWith('✗'));

  const parts: string[] = [];
  parts.push(`<div style="padding:24px 16px;margin:16px 0;">`);
  parts.push(`<div style="text-align:center;font-size:16px;font-weight:700;color:#222;margin-bottom:16px;">${esc(block.content || '비교 분석')}</div>`);
  parts.push(`<div style="display:flex;gap:12px;flex-wrap:wrap;">`);

  // 장점 (왼쪽)
  parts.push(`<div style="flex:1;min-width:45%;padding:16px;background:${theme.bgLight};border-radius:12px;">`);
  for (const p of pros) {
    parts.push(`<div style="padding:6px 0;font-size:13px;color:${theme.textAccent};line-height:1.6;word-break:keep-all;">${esc(p)}</div>`);
  }
  parts.push('</div>');

  // 단점 (오른쪽)
  parts.push(`<div style="flex:1;min-width:45%;padding:16px;background:#f5f5f5;border-radius:12px;">`);
  for (const c of cons) {
    parts.push(`<div style="padding:6px 0;font-size:13px;color:#999;line-height:1.6;word-break:keep-all;">${esc(c)}</div>`);
  }
  parts.push('</div>');

  parts.push('</div></div>');
  return parts.join('\n');
}

/** feature_detail: 하이라이트 박스, 성분/기술 강조 */
function renderFeatureDetailBlock(block: ContentBlock, theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:24px;margin:16px 0;background:#fff;border:1px solid ${theme.bgAccent};border-radius:12px;">`);
  if (block.emphasis) {
    parts.push(`<div style="display:inline-block;padding:4px 12px;background:${theme.bgAccent};color:${theme.textAccent};font-size:11px;font-weight:600;border-radius:6px;margin-bottom:12px;">${esc(block.emphasis)}</div>`);
  }
  parts.push(`<p style="font-size:15px;color:#333;line-height:1.8;margin:0;word-break:keep-all;">${esc(block.content)}</p>`);
  if (block.subContent) {
    parts.push(`<p style="font-size:13px;color:#888;line-height:1.6;margin:8px 0 0 0;">${esc(block.subContent)}</p>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** usage_guide: 번호 매겨진 스텝, 아이콘 장식 */
function renderUsageGuideBlock(block: ContentBlock, theme: ThemeColor): string {
  const items = block.items || [];
  const parts: string[] = [];
  parts.push(`<div style="padding:24px 20px;margin:16px 0;background:${theme.bgLight};border-radius:16px;">`);
  parts.push(`<div style="text-align:center;font-size:16px;font-weight:700;color:#222;margin-bottom:20px;">&#128218; ${esc(block.content || '사용 가이드')}</div>`);
  for (let i = 0; i < items.length; i++) {
    parts.push(`<div style="display:flex;align-items:flex-start;gap:12px;margin:12px 0;">
<div style="width:28px;height:28px;background:${theme.primary};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${i + 1}</div>
<div style="font-size:14px;color:#444;line-height:1.7;padding-top:4px;word-break:keep-all;">${esc(items[i])}</div>
</div>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** urgency: 배너 스타일, 강한 대비 컬러, 굵은 텍스트 */
function renderUrgencyBlock(block: ContentBlock, theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:24px;margin:16px 0;background:linear-gradient(135deg,${theme.primary},${theme.textAccent});border-radius:12px;text-align:center;">`);
  if (block.emphasis) {
    parts.push(`<div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:8px;">${esc(block.emphasis)}</div>`);
  }
  parts.push(`<p style="font-size:15px;color:rgba(255,255,255,0.9);line-height:1.7;margin:0;word-break:keep-all;">${esc(block.content)}</p>`);
  parts.push('</div>');
  return parts.join('\n');
}

/** cta: 버튼 모양 CTA 영역, 테마 컬러 배경, 터치 강조 */
function renderCtaBlock(block: ContentBlock, theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="text-align:center;padding:24px 16px;margin:16px 0;">`);
  parts.push(`<div style="display:inline-block;padding:16px 48px;background:${theme.primary};color:#fff;font-size:18px;font-weight:700;border-radius:50px;letter-spacing:0.5px;word-break:keep-all;box-shadow:0 4px 12px rgba(0,0,0,0.15);">${esc(block.content)}</div>`);
  if (block.subContent) {
    parts.push(`<div style="margin-top:10px;font-size:12px;color:#999;">${esc(block.subContent)}</div>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** 블록 타입별 렌더러 매핑 */
function renderContentBlock(block: ContentBlock, theme: ThemeColor): string {
  switch (block.type) {
    case 'hook': return renderHookBlock(block, theme);
    case 'problem': return renderProblemBlock(block, theme);
    case 'agitation': return renderAgitationBlock(block, theme);
    case 'solution': return renderSolutionBlock(block, theme);
    case 'benefits_grid': return renderBenefitsGridBlock(block, theme);
    case 'social_proof': return renderSocialProofBlock(block, theme);
    case 'comparison': return renderComparisonBlock(block, theme);
    case 'feature_detail': return renderFeatureDetailBlock(block, theme);
    case 'usage_guide': return renderUsageGuideBlock(block, theme);
    case 'urgency': return renderUrgencyBlock(block, theme);
    case 'cta': return renderCtaBlock(block, theme);
    default: return `<div style="padding:20px;"><p style="font-size:15px;color:#444;line-height:1.8;">${esc(block.content)}</p></div>`;
  }
}

/**
 * 설득형 콘텐츠 블록 기반 상세페이지 HTML 생성
 *
 * 이미지 인터리빙 규칙:
 * - hook 뒤: 첫 번째 상세이미지
 * - solution 뒤: 두 번째 상세이미지
 * - benefits_grid 뒤: 세 번째 상세이미지
 * - 나머지 이미지: 남은 블록 사이에 분배
 */
export function buildPersuasionPageHtml(
  params: DetailPageParams,
  contentBlocks: ContentBlock[],
  templateVariant?: string,
): string {
  const { productName, brand, detailImageUrls, reviewImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrl, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle(templateVariant);
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));

  // 히어로 헤더 (레이아웃 D는 키워드만)
  if (templateVariant === 'D') {
    if (seoKeywords && seoKeywords.length > 0) {
      sections.push(buildKeywordBadgesOnly(seoKeywords, theme));
    }
  } else {
    sections.push(buildHeroSection(productName, brand, seoKeywords, theme));
  }

  // SEO 키워드 텍스트 레이어 (크롤러용, 시각적 방해 최소)
  if (seoKeywords && seoKeywords.length > 0) {
    sections.push(`<div style="text-align:center;padding:4px 16px;font-size:12px;color:#999;line-height:1.6;">${seoKeywords.slice(0, 5).map(k => esc(k)).join(' | ')}</div>`);
  }

  // 이미지 배분: 지정된 블록 뒤에 배치
  const imageQueue = [...detailImageUrls];
  const detailSet = new Set(detailImageUrls);
  const uniqueReviews = (reviewImageUrls || []).filter(url => !detailSet.has(url)).slice(0, 5);
  imageQueue.push(...uniqueReviews);

  let imageIdx = 0;
  const imageAfterTypes = ['hook', 'solution', 'benefits_grid'];
  const imageAfterSet = new Set(imageAfterTypes);

  // 남은 이미지를 배치할 블록 인덱스 계산
  const extraImagePositions: Set<number> = new Set();
  const priorityCount = contentBlocks.filter(b => imageAfterSet.has(b.type)).length;
  const remainingImages = Math.max(0, imageQueue.length - priorityCount);
  if (remainingImages > 0) {
    // 우선 블록이 아닌 블록들 사이에 균등 배분
    const nonPriorityIndices = contentBlocks
      .map((b, i) => ({ type: b.type, i }))
      .filter(x => !imageAfterSet.has(x.type))
      .map(x => x.i);
    const step = Math.max(1, Math.floor(nonPriorityIndices.length / remainingImages));
    for (let n = 0; n < remainingImages && n * step < nonPriorityIndices.length; n++) {
      extraImagePositions.add(nonPriorityIndices[n * step]);
    }
  }

  // 이미지 alt 텍스트 SEO 강화
  const seoAltPrefix = seoKeywords && seoKeywords.length > 0 ? seoKeywords[0] + ' ' : '';

  // 블록 렌더링 + 이미지 인터리빙
  for (let i = 0; i < contentBlocks.length; i++) {
    sections.push(renderContentBlock(contentBlocks[i], theme));

    // 우선 이미지 배치 (hook, solution, benefits_grid 뒤)
    if (imageAfterSet.has(contentBlocks[i].type) && imageIdx < imageQueue.length) {
      sections.push(`<div style="margin:12px 0;"><img src="${esc(imageQueue[imageIdx])}" alt="${esc(productName)} ${seoAltPrefix}${contentBlocks[i].type}" style="width:100%;display:block;border-radius:8px;" /></div>`);
      imageIdx++;
    }
    // 남은 이미지 배치
    else if (extraImagePositions.has(i) && imageIdx < imageQueue.length) {
      sections.push(`<div style="margin:12px 0;"><img src="${esc(imageQueue[imageIdx])}" alt="${esc(productName)} ${seoAltPrefix}${i + 1}" style="width:100%;display:block;border-radius:8px;" /></div>`);
      imageIdx++;
    }
  }

  // 미배치 이미지 모두 출력
  while (imageIdx < imageQueue.length) {
    sections.push(`<div style="margin:12px 0;"><img src="${esc(imageQueue[imageIdx])}" alt="${esc(productName)} ${seoAltPrefix}${imageIdx + 1}" style="width:100%;display:block;border-radius:8px;" /></div>`);
    imageIdx++;
  }

  // FAQ
  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  // 마무리 문구
  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  // 상품정보제공고시 / 위탁판매 정보 / 제3자 이미지
  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrl) sections.push(buildThirdPartySection(thirdPartyImageUrl));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function splitStoryIntoParagraphs(html?: string): string[] {
  if (!html) return [];

  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();

  if (!stripped) return [];

  const paragraphs = stripped
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length <= 1 && stripped.length > 100) {
    const sentences = stripped.split(/(?<=[.!?。])\s+/);
    const chunks: string[] = [];
    const chunkSize = Math.ceil(sentences.length / 3);
    for (let i = 0; i < sentences.length; i += chunkSize) {
      chunks.push(sentences.slice(i, i + chunkSize).join(' '));
    }
    return chunks.filter(c => c.trim().length > 0);
  }

  return paragraphs;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
