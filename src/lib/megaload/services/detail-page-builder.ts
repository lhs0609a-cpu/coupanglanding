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
  thirdPartyImageUrls?: string[];   // 제3자 이미지 (랜덤 2장)
  // SEO 신규 필드
  seoKeywords?: string[];          // SEO 키워드 배지 (3~6개)
  faqItems?: FaqItem[];            // 카테고리별 FAQ (3~5개)
  closingText?: string;            // SEO 마무리 문구
  categoryPath?: string;           // 카테고리 경로 (컬러 테마용)
  // V2: 설득형 콘텐츠 블록
  contentBlocks?: ContentBlock[];    // 설득형 블록 배열 (있으면 새 렌더러 사용)
  // 이미지 타입 분류 (의미적 매칭용)
  detailImageTypes?: string[];
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
  A: { maxWidth: '860px', fontSize: '17px', padding: '24px 20px', lineHeight: '2.0' },
  B: { maxWidth: '880px', fontSize: '17px', padding: '28px 20px', lineHeight: '2.0' },
  C: { maxWidth: '840px', fontSize: '17px', padding: '20px 20px', lineHeight: '2.0' },
  D: { maxWidth: '860px', fontSize: '17px', padding: '22px 20px', lineHeight: '2.0' },
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
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrls, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('A');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  // 본문: 스토리문단 + 리뷰이미지를 글-이미지-글-이미지 교차 (detailImageUrls는 사용하지 않음)
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  // 빈 슬롯/null URL 제거 — 후기 4·5번이 빈 칸으로 노출되는 문제 차단
  const bodyImages = (reviewImageUrls ?? []).filter(u => typeof u === 'string' && u.trim().length > 0);
  if (bodyImages.length > 0 || paragraphs.length > 0) {
    sections.push(buildBlogStyleSection(bodyImages, paragraphs, productName, style, theme));
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrls && thirdPartyImageUrls.length > 0) sections.push(buildThirdPartySection(thirdPartyImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 B (이미지 전체 → 글모음 → FAQ → 리뷰 → 마무리) ──

function buildLayoutB(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrls, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('B');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  // 본문: 리뷰이미지 + 문단 균등 인터리브 (이미지당 3~5문단)
  // 이전 "이미지 전체 dump → 텍스트 전체 dump" 패턴 폐기 — 텍스트가 끝에 몰리는 버그 차단
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  const bodyImages = (reviewImageUrls ?? []).filter(u => typeof u === 'string' && u.trim().length > 0);
  if (bodyImages.length > 0 || paragraphs.length > 0) {
    sections.push(buildBlogStyleSection(bodyImages, paragraphs, productName, style, theme));
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrls && thirdPartyImageUrls.length > 0) sections.push(buildThirdPartySection(thirdPartyImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 C (히어로이미지 → 글 → 2열그리드 → FAQ → 리뷰 → 마무리) ──

function buildLayoutC(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrls, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('C');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));
  sections.push(buildHeroSection(productName, brand, seoKeywords, theme));

  // 본문: 1번 이미지 히어로 → 나머지 이미지+문단 인터리브 → 마지막에 2열 그리드(차별화)
  // 이전 "히어로 → 모든 텍스트 → 그리드" 패턴 폐기 — 텍스트가 한 덩어리로 쌓이는 버그 차단
  const bodyImages = (reviewImageUrls ?? []).filter(u => typeof u === 'string' && u.trim().length > 0);
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);

  if (bodyImages.length > 0) {
    sections.push(`<div style="margin:0;"><img src="${esc(bodyImages[0])}" alt="${esc(shortenForAlt(productName))} 메인" style="width:100%;display:block;" /></div>`);
  }

  // 가운데 본문: 2번 이후 이미지 절반 + 모든 문단을 인터리브
  // 그리드(레이아웃 차별화)에 남길 이미지: 마지막 ~3장
  const GRID_RESERVE = 3;
  const interleaveImages = bodyImages.length > 1
    ? bodyImages.slice(1, Math.max(1, bodyImages.length - GRID_RESERVE))
    : [];
  const gridImages = bodyImages.length > 1 + interleaveImages.length
    ? bodyImages.slice(1 + interleaveImages.length)
    : [];

  if (interleaveImages.length > 0 || paragraphs.length > 0) {
    sections.push(buildBlogStyleSection(interleaveImages, paragraphs, productName, style, theme));
  }

  if (gridImages.length > 0) {
    sections.push('<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 0;">');
    for (let i = 0; i < gridImages.length; i++) {
      const w = gridImages.length === 1 ? '100%' : 'calc(50% - 2px)';
      sections.push(`<div style="width:${w};"><img src="${esc(gridImages[i])}" alt="${esc(shortenForAlt(productName))} ${interleaveImages.length + i + 2}" style="width:100%;display:block;" /></div>`);
    }
    sections.push('</div>');
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  if (closingText) {
    sections.push(buildDivider());
    sections.push(buildClosingSection(closingText, productName, theme));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (params.noticeFields && params.noticeFields.length > 0) sections.push(buildNoticeTable(params.noticeFields));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));
  if (thirdPartyImageUrls && thirdPartyImageUrls.length > 0) sections.push(buildThirdPartySection(thirdPartyImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 D (헤더없음 → 이미지-글 교차 → FAQ → 텍스트리뷰 → 마무리) ──

function buildLayoutD(params: DetailPageParams): string {
  const { productName, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, infoImageUrls, consignmentImageUrls, thirdPartyImageUrls, seoKeywords, faqItems, closingText, categoryPath } = params;
  const style = getStyle('D');
  const theme = getTheme(categoryPath);
  const sections: string[] = [];

  sections.push(buildWrapper(style, theme));

  // 키워드 배지만 표시 (헤더 없음)
  if (seoKeywords && seoKeywords.length > 0) {
    sections.push(buildKeywordBadgesOnly(seoKeywords, theme));
  }

  // 본문: 리뷰이미지 + 스토리문단 글-이미지 교차 (detailImageUrls 미사용)
  // 빈 슬롯/null URL 제거 — 후기 4·5번이 빈 칸으로 노출되는 문제 차단
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  const bodyImages = (reviewImageUrls ?? []).filter(u => typeof u === 'string' && u.trim().length > 0);
  if (bodyImages.length > 0 || paragraphs.length > 0) {
    sections.push(buildBlogStyleSection(bodyImages, paragraphs, productName, style, theme));
  }

  if (faqItems && faqItems.length > 0) {
    sections.push(buildDivider());
    sections.push(buildFaqSection(faqItems, theme));
  }

  // 텍스트 리뷰만 (이미지 없음) — 리얼 후기 스타일
  if (reviewTexts && reviewTexts.length > 0) {
    sections.push('<div style="padding:32px 0 16px;">');
    for (const rt of reviewTexts) {
      if (rt.trim()) {
        sections.push(
          `<div style="padding:18px 20px;line-height:2.2;font-size:21px;color:#222;word-break:keep-all;">`
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
  if (thirdPartyImageUrls && thirdPartyImageUrls.length > 0) sections.push(buildThirdPartySection(thirdPartyImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 공통 섹션 빌더 ─────────────────────────────────────────

function buildWrapper(style: LayoutStyle, theme: ThemeColor): string {
  return `<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;">`;
}

/** 섹션 1: 히어로 헤더 — 상품명만 크게 */
function buildHeroSection(productName: string, brand?: string, seoKeywords?: string[], _theme?: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="text-align:center;padding:48px 20px 36px;">`);
  if (brand) {
    parts.push(`<div style="font-size:14px;color:#999;letter-spacing:2px;margin-bottom:10px;">${esc(brand)}</div>`);
  }
  parts.push(`<div style="font-size:24px;font-weight:bold;color:#222;line-height:1.6;word-break:keep-all;">${esc(productName)}</div>`);

  // SEO 키워드 — 쉼표 구분 텍스트
  if (seoKeywords && seoKeywords.length > 0) {
    parts.push(`<div style="font-size:14px;color:#888;margin-top:14px;line-height:1.8;">${seoKeywords.slice(0, 6).map(k => esc(k)).join(', ')}</div>`);
  }

  parts.push('</div>');
  return parts.join('\n');
}

/** 레이아웃 D 전용: 키워드 텍스트만 (헤더 없이) */
function buildKeywordBadgesOnly(keywords: string[], _theme: ThemeColor): string {
  return `<div style="text-align:center;padding:20px 16px;font-size:14px;color:#888;line-height:1.8;">${keywords.slice(0, 6).map(k => esc(k)).join(', ')}</div>`;
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
  const cleanParagraphs = paragraphs.filter(p => p && p.trim());
  const cleanImages = imageUrls.filter(u => typeof u === 'string' && u.trim().length > 0);

  // 이미지 0개 → 문단만
  if (cleanImages.length === 0) {
    for (const p of cleanParagraphs) parts.push(buildParagraphBlock(p, style));
    return parts.join('\n');
  }
  // 문단 0개 → 이미지만
  if (cleanParagraphs.length === 0) {
    for (let i = 0; i < cleanImages.length; i++) {
      parts.push(
        `<div style="margin:12px 0;"><img src="${esc(cleanImages[i])}" alt="${esc(shortenForAlt(productName))} ${i + 1}" style="width:100%;display:block;" /></div>`
      );
    }
    return parts.join('\n');
  }

  // 문단을 이미지 수만큼 균등 분배 — 이미지당 ceil(p/img) 문단씩 끼워 넣어
  // 마지막에 텍스트 wall 쌓이지 않게 함
  const chunkSize = Math.ceil(cleanParagraphs.length / cleanImages.length);
  let pIdx = 0;
  for (let i = 0; i < cleanImages.length; i++) {
    // 첫 슬롯엔 1문단 짧게 도입(가독성), 이후 chunkSize씩 묶어 뒤에 이미지
    const isFirst = i === 0;
    const take = isFirst ? Math.min(1, cleanParagraphs.length - pIdx) : Math.min(chunkSize, cleanParagraphs.length - pIdx);
    for (let k = 0; k < take && pIdx < cleanParagraphs.length; k++, pIdx++) {
      parts.push(buildParagraphBlock(cleanParagraphs[pIdx], style));
    }
    parts.push(
      `<div style="margin:12px 0;"><img src="${esc(cleanImages[i])}" alt="${esc(shortenForAlt(productName))} ${i + 1}" style="width:100%;display:block;" /></div>`
    );
  }
  // 잔여 문단 — 1~3개씩 끊어 (한 덩어리로 dump 금지)
  const REMAINING_CHUNK = 3;
  while (pIdx < cleanParagraphs.length) {
    const end = Math.min(pIdx + REMAINING_CHUNK, cleanParagraphs.length);
    for (; pIdx < end; pIdx++) {
      parts.push(buildParagraphBlock(cleanParagraphs[pIdx], style));
    }
    // 잔여 끊어 보일 시각적 spacer
    if (pIdx < cleanParagraphs.length) parts.push('<div style="margin:8px 0;"></div>');
  }

  return parts.join('\n');
}

function buildParagraphBlock(text: string, style: LayoutStyle): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(text);
  const content = isHtml ? text : `<p style="margin:0;">${esc(text)}</p>`;
  return `<div style="padding:${style.padding};line-height:2.2;font-size:21px;color:#222;word-break:keep-all;">\n${content}\n</div>`;
}

/** 섹션 3: FAQ — 심플 텍스트 Q&A */
function buildFaqSection(items: FaqItem[], _theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push('<div style="padding:36px 20px 20px;">');

  for (const item of items) {
    parts.push(`<div style="margin-bottom:28px;">`);
    parts.push(`<div style="font-size:21px;font-weight:bold;color:#222;line-height:2.2;word-break:keep-all;">Q. ${esc(item.question)}</div>`);
    parts.push(`<div style="font-size:21px;color:#222;line-height:2.2;margin-top:8px;word-break:keep-all;">A. ${esc(item.answer)}</div>`);
    parts.push('</div>');
  }

  parts.push('</div>');
  return parts.join('\n');
}

/** 섹션 5: 키워드 마무리 — 텍스트만 */
function buildClosingSection(closingText: string, _productName: string, _theme: ThemeColor): string {
  return `<div style="padding:32px 20px;text-align:center;"><div style="font-size:21px;color:#222;line-height:2.2;word-break:keep-all;">${esc(closingText)}</div></div>`;
}

function buildDivider(): string {
  return '<div style="margin:40px 0;"></div>';
}

function buildInfoSection(urls: string[], productName: string): string {
  const parts: string[] = [];
  parts.push('<div style="padding:30px 0 0;">');
  parts.push('<div style="text-align:center;margin-bottom:20px;">');
  parts.push('<div style="font-size:16px;font-weight:bold;color:#555;letter-spacing:1px;">상품정보제공고시</div>');
  parts.push('</div>');
  for (const url of urls) {
    parts.push(`<img src="${esc(url)}" alt="${esc(shortenForAlt(productName))} 상품정보" style="width:100%;display:block;margin-bottom:4px;" />`);
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

function buildThirdPartySection(urls: string[]): string {
  return urls.map((url, i) =>
    `<div style="padding:10px 0;"><img src="${esc(url)}" alt="추가 정보 ${i + 1}" style="width:100%;display:block;" /></div>`
  ).join('\n');
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

// ─── 이미지-텍스트 의미적 매칭 (ImageType → ContentBlockType affinity) ───

const IMAGE_BLOCK_AFFINITY: Record<string, string[]> = {
  nukki:       ['hook', 'feature_detail', 'comparison'],
  lifestyle:   ['solution', 'social_proof', 'usage_guide'],
  packaging:   ['benefits_grid', 'feature_detail'],
  ingredient:  ['feature_detail', 'comparison'],
  detail_shot: ['feature_detail', 'usage_guide'],
  infographic: ['comparison', 'benefits_grid'],
  unknown:     ['hook', 'solution', 'benefits_grid'],
};

// ─── V2: 설득형 콘텐츠 블록 렌더러 (11가지 타입) ─────────────

/** hook: 큰 폰트, 중앙정렬 */
function renderHookBlock(block: ContentBlock, _theme: ThemeColor): string {
  return `<div style="text-align:center;padding:32px 20px;margin:16px 0;">
<div style="font-size:24px;font-weight:bold;color:#222;line-height:2.0;word-break:keep-all;">${esc(block.content)}</div>
</div>`;
}

/** problem: 본문 문단 */
function renderProblemBlock(block: ContentBlock, _theme: ThemeColor): string {
  return `<div style="padding:20px 20px;margin:16px 0;">
<p style="font-size:21px;color:#222;line-height:2.2;margin:0;word-break:keep-all;">${esc(block.content)}</p>
</div>`;
}

/** agitation: bold 강조 문단 */
function renderAgitationBlock(block: ContentBlock, _theme: ThemeColor): string {
  return `<div style="padding:20px 20px;margin:16px 0;">
<p style="font-size:21px;color:#222;font-weight:bold;line-height:2.2;margin:0;word-break:keep-all;">${esc(block.content)}</p>
</div>`;
}

/** solution: 큰 폰트 중앙 */
function renderSolutionBlock(block: ContentBlock, _theme: ThemeColor): string {
  return `<div style="padding:24px 20px;margin:16px 0;text-align:center;">
<div style="font-size:22px;font-weight:bold;color:#222;line-height:2.0;word-break:keep-all;">${esc(block.content)}</div>
</div>`;
}

/** benefits_grid: 세로 리스트 */
function renderBenefitsGridBlock(block: ContentBlock, _theme: ThemeColor): string {
  const items = block.items || [];
  const parts: string[] = [];
  parts.push(`<div style="padding:20px 20px;margin:12px 0;">`);
  parts.push(`<div style="font-size:21px;font-weight:bold;color:#222;margin-bottom:14px;word-break:keep-all;">${esc(block.content)}</div>`);
  for (const item of items.slice(0, 5)) {
    parts.push(`<div style="font-size:20px;color:#222;line-height:2.2;word-break:keep-all;">- ${esc(item)}</div>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** social_proof: 리얼 후기 스타일 */
function renderSocialProofBlock(block: ContentBlock, _theme: ThemeColor): string {
  return `<div style="padding:20px 20px;margin:16px 0;">
<p style="font-size:21px;color:#222;line-height:2.2;margin:0;word-break:keep-all;">${esc(block.content)}</p>
</div>`;
}

/** comparison: 단일 컬럼 리스트 */
function renderComparisonBlock(block: ContentBlock, _theme: ThemeColor): string {
  const items = block.items || [];
  const parts: string[] = [];
  parts.push(`<div style="padding:20px 20px;margin:16px 0;">`);
  if (block.content) {
    parts.push(`<div style="font-size:21px;font-weight:bold;color:#222;margin-bottom:14px;word-break:keep-all;">${esc(block.content)}</div>`);
  }
  for (const item of items) {
    parts.push(`<div style="font-size:20px;color:#222;line-height:2.2;word-break:keep-all;">${esc(item)}</div>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** feature_detail: 본문 텍스트 */
function renderFeatureDetailBlock(block: ContentBlock, _theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:20px 20px;margin:16px 0;">`);
  if (block.emphasis) {
    parts.push(`<div style="font-size:21px;font-weight:bold;color:#222;margin-bottom:10px;word-break:keep-all;">${esc(block.emphasis)}</div>`);
  }
  parts.push(`<p style="font-size:21px;color:#222;line-height:2.2;margin:0;word-break:keep-all;">${esc(block.content)}</p>`);
  if (block.subContent) {
    parts.push(`<p style="font-size:20px;color:#222;line-height:2.2;margin:10px 0 0 0;word-break:keep-all;">${esc(block.subContent)}</p>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** usage_guide: 숫자 리스트 */
function renderUsageGuideBlock(block: ContentBlock, _theme: ThemeColor): string {
  const items = block.items || [];
  const parts: string[] = [];
  parts.push(`<div style="padding:20px 20px;margin:16px 0;">`);
  if (block.content) {
    parts.push(`<div style="font-size:21px;font-weight:bold;color:#222;margin-bottom:14px;word-break:keep-all;">${esc(block.content)}</div>`);
  }
  for (let i = 0; i < items.length; i++) {
    parts.push(`<div style="font-size:20px;color:#222;line-height:2.2;word-break:keep-all;">${i + 1}. ${esc(items[i])}</div>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

/** urgency: 큰 폰트 bold */
function renderUrgencyBlock(block: ContentBlock, _theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="padding:24px 20px;margin:16px 0;text-align:center;">`);
  if (block.emphasis) {
    parts.push(`<div style="font-size:24px;font-weight:bold;color:#222;margin-bottom:8px;word-break:keep-all;">${esc(block.emphasis)}</div>`);
  }
  parts.push(`<p style="font-size:22px;font-weight:bold;color:#222;line-height:2.0;margin:0;word-break:keep-all;">${esc(block.content)}</p>`);
  parts.push('</div>');
  return parts.join('\n');
}

/** cta: 큰 폰트 bold */
function renderCtaBlock(block: ContentBlock, _theme: ThemeColor): string {
  const parts: string[] = [];
  parts.push(`<div style="text-align:center;padding:24px 20px;margin:16px 0;">`);
  parts.push(`<div style="font-size:22px;font-weight:bold;color:#222;word-break:keep-all;">${esc(block.content)}</div>`);
  if (block.subContent) {
    parts.push(`<div style="margin-top:10px;font-size:20px;color:#222;word-break:keep-all;">${esc(block.subContent)}</div>`);
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
    default: return `<div style="padding:20px 20px;"><p style="font-size:21px;color:#222;line-height:2.2;word-break:keep-all;">${esc(block.content)}</p></div>`;
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
  const { productName, brand, detailImageUrls, reviewImageUrls, infoImageUrls, consignmentImageUrls, thirdPartyImageUrls, seoKeywords, faqItems, closingText, categoryPath } = params;
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

  // 이미지 배분: 지정된 블록 뒤에 배치 (사용자 선택 상세이미지만 사용)
  const imageQueue = [...detailImageUrls];

  // 이미지 alt 텍스트 SEO 강화 — 풀네임 대신 단축형(앞 2단어)으로 SEO 스터핑 방지
  const seoAltPrefix = seoKeywords && seoKeywords.length > 0 ? seoKeywords[0] + ' ' : '';
  const altShort = (() => {
    const tokens = (productName || '').split(/\s+/).filter(Boolean);
    if (tokens.length <= 2) return productName;
    const head = tokens.slice(0, 2).join(' ');
    return head.length >= 4 ? head : productName;
  })();

  // 이미지→블록 배정 맵: imageIndex → blockIndex (뒤에 배치)
  const imageToBlockMap = new Map<number, number>();
  const detailImageTypes = params.detailImageTypes;
  const useAffinity = detailImageTypes && detailImageTypes.length === detailImageUrls.length && detailImageUrls.length > 0;

  // 이미지를 전체 블록 범위에 균등 분배 — 마지막 블록들이 텍스트 wall로 쌓이지 않게
  // affinity는 보너스 가중치 정도로만 사용, 핵심은 spread.
  {
    const N = contentBlocks.length;
    const M = imageQueue.length;
    const assignedBlocks = new Set<number>();

    if (N > 0 && M > 0) {
      // 1) affinity 우선 매칭 — 단 매칭 가능한 block_idx 후보를 균등 분배 위치 근처로 제한
      //    (앞쪽 cluster 방지): img i 의 "이상적 위치"는 round((i+1)*N / (M+1))
      const idealSlot = (i: number) => Math.min(N - 1, Math.max(0, Math.round((i + 1) * N / (M + 1)) - 1));

      if (useAffinity) {
        for (let imgIdx = 0; imgIdx < M; imgIdx++) {
          const imgType = imgIdx < detailImageTypes.length ? detailImageTypes[imgIdx] : 'unknown';
          const affinityTypes = IMAGE_BLOCK_AFFINITY[imgType] || IMAGE_BLOCK_AFFINITY['unknown'];
          const target = idealSlot(imgIdx);
          // ideal slot 기준 ±2 범위 내에서 affinity match 우선, 없으면 ideal slot 그대로
          let chosen = -1;
          for (let radius = 0; radius <= 3 && chosen < 0; radius++) {
            for (const dir of [0, 1, -1]) {
              const cand = target + dir * radius;
              if (cand < 0 || cand >= N || assignedBlocks.has(cand)) continue;
              if (affinityTypes.includes(contentBlocks[cand].type)) { chosen = cand; break; }
            }
          }
          if (chosen < 0) {
            // affinity 매칭 실패 — ideal slot에서 가장 가까운 미배정 블록
            for (let r = 0; r < N; r++) {
              for (const dir of [0, 1, -1]) {
                const cand = target + dir * r;
                if (cand < 0 || cand >= N || assignedBlocks.has(cand)) continue;
                chosen = cand; break;
              }
              if (chosen >= 0) break;
            }
          }
          if (chosen >= 0) {
            imageToBlockMap.set(imgIdx, chosen);
            assignedBlocks.add(chosen);
          }
        }
      } else {
        // 균등 spacing — 이미지 i 를 (i+1)*N/(M+1) 번째 block 뒤에 배치
        for (let imgIdx = 0; imgIdx < M; imgIdx++) {
          const target = idealSlot(imgIdx);
          // 이미 같은 위치에 배치된 이미지가 있으면 가장 가까운 빈 block 찾기
          let chosen = -1;
          for (let r = 0; r < N; r++) {
            for (const dir of [0, 1, -1]) {
              const cand = target + dir * r;
              if (cand < 0 || cand >= N || assignedBlocks.has(cand)) continue;
              chosen = cand; break;
            }
            if (chosen >= 0) break;
          }
          if (chosen >= 0) {
            imageToBlockMap.set(imgIdx, chosen);
            assignedBlocks.add(chosen);
          }
        }
      }
    }
  }

  // blockIndex → 해당 블록 뒤에 배치할 이미지 인덱스 목록
  const blockToImages = new Map<number, number[]>();
  for (const [imgIdx, blockIdx] of imageToBlockMap) {
    const list = blockToImages.get(blockIdx) || [];
    list.push(imgIdx);
    blockToImages.set(blockIdx, list);
  }
  const placedImages = new Set(imageToBlockMap.keys());

  // 블록 렌더링 + 이미지 인터리빙
  for (let i = 0; i < contentBlocks.length; i++) {
    sections.push(renderContentBlock(contentBlocks[i], theme));

    const imgsForBlock = blockToImages.get(i);
    if (imgsForBlock) {
      for (const imgIdx of imgsForBlock) {
        const altType = useAffinity && imgIdx < detailImageTypes.length ? detailImageTypes[imgIdx] : contentBlocks[i].type;
        sections.push(`<div style="margin:12px 0;"><img src="${esc(imageQueue[imgIdx])}" alt="${esc(altShort)} ${seoAltPrefix}${altType}" style="width:100%;display:block;" /></div>`);
      }
    }
  }

  // 미배치 이미지 모두 출력
  for (let imgIdx = 0; imgIdx < imageQueue.length; imgIdx++) {
    if (!placedImages.has(imgIdx)) {
      sections.push(`<div style="margin:12px 0;"><img src="${esc(imageQueue[imgIdx])}" alt="${esc(altShort)} ${seoAltPrefix}${imgIdx + 1}" style="width:100%;display:block;" /></div>`);
    }
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
  if (thirdPartyImageUrls && thirdPartyImageUrls.length > 0) sections.push(buildThirdPartySection(thirdPartyImageUrls));

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

/** 이미지 alt 텍스트용 단축 상품명 — 앞 2단어만 유지 (SEO 스터핑 방지) */
function shortenForAlt(name: string): string {
  if (!name) return '';
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return name;
  const head = tokens.slice(0, 2).join(' ');
  return head.length >= 4 ? head : name;
}
