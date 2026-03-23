// ============================================================
// 리치 HTML 상세페이지 빌더 — 네이버 블로그 스타일
//
// 구조: 이미지 → 글 → 이미지 → 글 → 이미지 → 글 ...
// 마지막: 상품정보 이미지 + 위탁/신뢰 정보
//
// 아이템위너 방지: 4가지 레이아웃 변형 (A/B/C/D)
// ============================================================

export interface DetailPageParams {
  productName: string;
  brand?: string;
  aiStoryParagraphs?: string[];  // AI 생성 문단 배열 (이미지 사이에 삽입)
  aiStoryHtml?: string;           // 기존 호환: 단일 HTML 문자열
  reviewImageUrls?: string[];
  reviewTexts?: string[];         // 리뷰 이미지별 AI 생성 텍스트
  detailImageUrls: string[];
  infoImageUrls?: string[];       // 상품정보제공고시 이미지
  consignmentImageUrls?: string[]; // 위탁판매/신뢰 정보 이미지
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

/**
 * 블로그 스타일 상세페이지 HTML을 생성한다.
 *
 * @param templateVariant - 레이아웃 변형 (A/B/C/D), 아이템위너 방지용
 *
 * A (기본): 헤더 → 이미지-글 교차 → 리뷰 → 정보
 * B: 이미지 전체 먼저 → 글 모음 → 리뷰 → 정보
 * C: 히어로 이미지 → 글 소개 → 2열 그리드 이미지 → 리뷰 → 정보
 * D: 헤더 없이 바로 이미지-글 교차 → 텍스트 리뷰만 → 정보
 */
export function buildRichDetailPageHtml(params: DetailPageParams, templateVariant?: string): string {
  const variant = templateVariant || 'A';
  switch (variant) {
    case 'B': return buildLayoutB(params);
    case 'C': return buildLayoutC(params);
    case 'D': return buildLayoutD(params);
    default:  return buildLayoutA(params);
  }
}

// ─── 레이아웃 A (기본: 이미지-글 교차) ──────────────────────

function buildLayoutA(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls } = params;
  const style = getStyle('A');
  const sections: string[] = [];

  sections.push(`<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#333;">`);
  sections.push(buildHeaderSection(productName, brand));

  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  // 글 → 이미지 → 글 → 이미지 블로그 스타일
  // detail이미지와 리뷰이미지를 합쳐서 글 사이에 교차 배치
  const allImages = [...detailImageUrls, ...(reviewImageUrls || [])];
  if (allImages.length > 0) {
    sections.push(buildBlogStyleSection(allImages, paragraphs, productName, style));
  } else if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 B (이미지 전체 먼저 → 글 모음) ───────────────

function buildLayoutB(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls } = params;
  const style = getStyle('B');
  const sections: string[] = [];

  sections.push(`<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#333;">`);
  sections.push(buildHeaderSection(productName, brand));

  // 이미지 전체 먼저
  for (let i = 0; i < detailImageUrls.length; i++) {
    sections.push(`<div style="margin:0;"><img src="${esc(detailImageUrls[i])}" alt="${esc(productName)} ${i + 1}" style="width:100%;display:block;" /></div>`);
  }

  // 글 모음
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (paragraphs.length > 0) {
    sections.push(`<div style="padding:32px ${style.padding.split(' ')[1] || '32px'};">`);
    for (const p of paragraphs) {
      sections.push(buildParagraphBlock(p, style));
    }
    sections.push('</div>');
  }

  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName, style));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 C (히어로 이미지 → 글 → 2열 그리드) ──────────

function buildLayoutC(params: DetailPageParams): string {
  const { productName, brand, aiStoryParagraphs, aiStoryHtml, reviewImageUrls, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls } = params;
  const style = getStyle('C');
  const sections: string[] = [];

  sections.push(`<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#333;">`);
  sections.push(buildHeaderSection(productName, brand));

  // 히어로 이미지 (1번째 이미지 크게)
  if (detailImageUrls.length > 0) {
    sections.push(`<div style="margin:0;"><img src="${esc(detailImageUrls[0])}" alt="${esc(productName)} 메인" style="width:100%;display:block;" /></div>`);
  }

  // 글 소개
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  // 나머지 이미지 2열 그리드
  if (detailImageUrls.length > 1) {
    const remaining = detailImageUrls.slice(1);
    sections.push('<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 0;">');
    for (let i = 0; i < remaining.length; i++) {
      const w = remaining.length === 1 ? '100%' : 'calc(50% - 2px)';
      sections.push(`<div style="width:${w};"><img src="${esc(remaining[i])}" alt="${esc(productName)} ${i + 2}" style="width:100%;display:block;" /></div>`);
    }
    sections.push('</div>');
  }

  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName, style));
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 레이아웃 D (헤더 없음, 이미지-글 교차, 텍스트 리뷰만) ─

function buildLayoutD(params: DetailPageParams): string {
  const { productName, aiStoryParagraphs, aiStoryHtml, reviewTexts, detailImageUrls, infoImageUrls, consignmentImageUrls } = params;
  const style = getStyle('D');
  const sections: string[] = [];

  sections.push(`<div style="width:100%;max-width:${style.maxWidth};margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#333;">`);

  // 헤더 없이 바로 이미지-글 교차
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);
  if (detailImageUrls.length > 0) {
    sections.push(buildBlogStyleSection(detailImageUrls, paragraphs, productName, style));
  } else if (paragraphs.length > 0) {
    for (const p of paragraphs) sections.push(buildParagraphBlock(p, style));
  }

  // 텍스트 리뷰만 (이미지 없음)
  if (reviewTexts && reviewTexts.length > 0) {
    sections.push('<div style="padding:32px 0 16px;">');
    sections.push('<div style="text-align:center;font-size:18px;font-weight:bold;color:#333;margin-bottom:16px;">구매 후기</div>');
    for (const rt of reviewTexts) {
      if (rt.trim()) {
        sections.push(
          `<div style="padding:14px 24px;line-height:1.8;font-size:14px;color:#555;background:#f9f9f9;border-radius:8px;margin:8px 16px;">`
          + `${esc(rt)}</div>`
        );
      }
    }
    sections.push('</div>');
  }

  sections.push(buildDivider());
  if (infoImageUrls && infoImageUrls.length > 0) sections.push(buildInfoSection(infoImageUrls, productName));
  if (consignmentImageUrls && consignmentImageUrls.length > 0) sections.push(buildConsignmentSection(consignmentImageUrls));

  sections.push('</div>');
  return sections.join('\n');
}

// ─── 공통 섹션 빌더 ─────────────────────────────────────────

function buildHeaderSection(productName: string, brand?: string): string {
  const parts: string[] = [];
  parts.push('<div style="text-align:center;padding:40px 20px 30px;">');
  if (brand) {
    parts.push(`<div style="font-size:13px;color:#999;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;">${esc(brand)}</div>`);
  }
  parts.push(`<div style="font-size:24px;font-weight:bold;color:#111;line-height:1.5;">${esc(productName)}</div>`);
  parts.push('<div style="width:60px;height:3px;background:#E31837;margin:20px auto 0;border-radius:2px;"></div>');
  parts.push('</div>');
  return parts.join('\n');
}

function buildBlogStyleSection(
  imageUrls: string[],
  paragraphs: string[],
  productName: string,
  style: LayoutStyle,
): string {
  const parts: string[] = [];
  const maxLen = Math.max(imageUrls.length, paragraphs.length);

  // 글 → 이미지 → 글 → 이미지 (블로그 스타일)
  for (let i = 0; i < maxLen; i++) {
    if (i < paragraphs.length && paragraphs[i].trim()) {
      parts.push(buildParagraphBlock(paragraphs[i], style));
    }
    if (i < imageUrls.length) {
      parts.push(
        `<div style="margin:8px 0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} ${i + 1}" style="width:100%;display:block;border-radius:8px;" /></div>`
      );
    }
  }

  return parts.join('\n');
}

function buildParagraphBlock(text: string, style: LayoutStyle): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(text);
  const content = isHtml ? text : `<p>${esc(text)}</p>`;
  return `<div style="padding:${style.padding};line-height:${style.lineHeight};font-size:${style.fontSize};color:#444;word-break:keep-all;">\n${content}\n</div>`;
}

function buildBlogReviewSection(
  imageUrls: string[],
  reviewTexts: string[] | undefined,
  productName: string,
  style: LayoutStyle,
): string {
  const parts: string[] = [];

  parts.push('<div style="padding:40px 0 20px;">');
  parts.push('<div style="text-align:center;">');
  parts.push('<div style="font-size:12px;color:#E31837;letter-spacing:4px;font-weight:600;margin-bottom:8px;">REAL REVIEW</div>');
  parts.push('<div style="font-size:20px;font-weight:bold;color:#222;">실제 사용 후기</div>');
  parts.push('<div style="width:40px;height:2px;background:#E31837;margin:12px auto 0;"></div>');
  parts.push('</div>');
  parts.push('</div>');

  for (let i = 0; i < imageUrls.length; i++) {
    parts.push(
      `<div style="margin:0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} 리뷰 ${i + 1}" style="width:100%;display:block;" /></div>`
    );
    if (reviewTexts && i < reviewTexts.length && reviewTexts[i].trim()) {
      parts.push(
        `<div style="padding:16px 30px 24px;line-height:1.8;font-size:${style.fontSize};color:#555;background:#fafafa;border-left:3px solid #E31837;margin:8px 20px 16px;">`
        + `${esc(reviewTexts[i])}`
        + `</div>`
      );
    }
  }

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
