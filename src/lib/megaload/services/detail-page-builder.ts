// ============================================================
// 리치 HTML 상세페이지 빌더 — 네이버 블로그 스타일
//
// 구조: 이미지 → 글 → 이미지 → 글 → 이미지 → 글 ...
// 마지막: 상품정보 이미지 + 위탁/신뢰 정보
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

/**
 * 블로그 스타일 상세페이지 HTML을 생성한다.
 *
 * 구조 (네이버 블로그 느낌):
 * ┌─────────────────────────────┐
 * │  브랜드명 + 상품명 헤더      │
 * ├─────────────────────────────┤
 * │  [상세 이미지 1]             │
 * │  AI 문단 1 (소개/특징)       │
 * │  [상세 이미지 2]             │
 * │  AI 문단 2 (효능/장점)       │
 * │  [상세 이미지 3]             │
 * │  AI 문단 3 (사용법/팁)       │
 * │  ... (이미지-글 교차 반복)    │
 * ├─────────────────────────────┤
 * │  ✦ REAL REVIEW 섹션          │
 * │  [리뷰 이미지 1]             │
 * │  AI 리뷰 텍스트 1            │
 * │  [리뷰 이미지 2]             │
 * │  AI 리뷰 텍스트 2            │
 * ├─────────────────────────────┤
 * │  상품정보제공고시 이미지      │
 * │  위탁판매/신뢰 정보 이미지    │
 * └─────────────────────────────┘
 */
export function buildRichDetailPageHtml(params: DetailPageParams): string {
  const {
    productName,
    brand,
    aiStoryParagraphs,
    aiStoryHtml,
    reviewImageUrls,
    reviewTexts,
    detailImageUrls,
    infoImageUrls,
    consignmentImageUrls,
  } = params;

  const sections: string[] = [];

  // 컨테이너 시작
  sections.push(`<div style="width:100%;max-width:860px;margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#333;">`);

  // ── 1. 헤더 ──
  sections.push(buildHeaderSection(productName, brand));

  // ── 2. 상세 이미지 + AI 글 교차 배치 (블로그 스타일 핵심) ──
  const paragraphs = aiStoryParagraphs || splitStoryIntoParagraphs(aiStoryHtml);

  if (detailImageUrls.length > 0) {
    sections.push(buildBlogStyleSection(detailImageUrls, paragraphs, productName));
  } else if (paragraphs.length > 0) {
    // 이미지 없이 글만 있는 경우
    for (const p of paragraphs) {
      sections.push(buildParagraphBlock(p));
    }
  }

  // ── 3. 리뷰 섹션 (이미지 + 텍스트 교차) ──
  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildBlogReviewSection(reviewImageUrls, reviewTexts, productName));
  }

  // ── 4. 구분선 ──
  sections.push('<div style="height:2px;background:linear-gradient(90deg,transparent,#ddd,transparent);margin:40px 0;"></div>');

  // ── 5. 상품정보제공고시 이미지 ──
  if (infoImageUrls && infoImageUrls.length > 0) {
    sections.push(buildInfoSection(infoImageUrls, productName));
  }

  // ── 6. 위탁판매/신뢰 정보 이미지 ──
  if (consignmentImageUrls && consignmentImageUrls.length > 0) {
    sections.push(buildConsignmentSection(consignmentImageUrls));
  }

  // 컨테이너 종료
  sections.push('</div>');

  return sections.join('\n');
}

// ─── 헤더 ────────────────────────────────────────────────────

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

// ─── 블로그 스타일: 이미지 → 글 → 이미지 → 글 ──────────────

function buildBlogStyleSection(
  imageUrls: string[],
  paragraphs: string[],
  productName: string,
): string {
  const parts: string[] = [];

  // 이미지와 글을 교차 배치
  // 이미지가 더 많으면 남은 이미지는 마지막에 연속 배치
  // 글이 더 많으면 마지막 이미지 뒤에 남은 글 모두 배치
  const maxLen = Math.max(imageUrls.length, paragraphs.length);

  for (let i = 0; i < maxLen; i++) {
    // 이미지 (있으면)
    if (i < imageUrls.length) {
      parts.push(
        `<div style="margin:0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} ${i + 1}" style="width:100%;display:block;" /></div>`
      );
    }

    // 글 (있으면) — 이미지 바로 아래에 배치
    if (i < paragraphs.length && paragraphs[i].trim()) {
      parts.push(buildParagraphBlock(paragraphs[i]));
    }
  }

  return parts.join('\n');
}

function buildParagraphBlock(text: string): string {
  // HTML 태그가 이미 있으면 그대로, 없으면 <p> 태그로 감싸기
  const isHtml = /<[a-z][\s\S]*>/i.test(text);
  const content = isHtml ? text : `<p>${esc(text)}</p>`;
  return `<div style="padding:24px 30px;line-height:1.9;font-size:15px;color:#444;word-break:keep-all;">\n${content}\n</div>`;
}

// ─── 리뷰 섹션 (이미지 + 텍스트 교차) ───────────────────────

function buildBlogReviewSection(
  imageUrls: string[],
  reviewTexts: string[] | undefined,
  productName: string,
): string {
  const parts: string[] = [];

  // 섹션 타이틀
  parts.push('<div style="padding:40px 0 20px;">');
  parts.push('<div style="text-align:center;">');
  parts.push('<div style="font-size:12px;color:#E31837;letter-spacing:4px;font-weight:600;margin-bottom:8px;">REAL REVIEW</div>');
  parts.push('<div style="font-size:20px;font-weight:bold;color:#222;">실제 사용 후기</div>');
  parts.push('<div style="width:40px;height:2px;background:#E31837;margin:12px auto 0;"></div>');
  parts.push('</div>');
  parts.push('</div>');

  // 리뷰 이미지 + 텍스트 교차
  for (let i = 0; i < imageUrls.length; i++) {
    // 리뷰 이미지
    parts.push(
      `<div style="margin:0;"><img src="${esc(imageUrls[i])}" alt="${esc(productName)} 리뷰 ${i + 1}" style="width:100%;display:block;" /></div>`
    );

    // 리뷰 텍스트 (있으면)
    if (reviewTexts && i < reviewTexts.length && reviewTexts[i].trim()) {
      parts.push(
        `<div style="padding:16px 30px 24px;line-height:1.8;font-size:14px;color:#555;background:#fafafa;border-left:3px solid #E31837;margin:8px 20px 16px;">`
        + `${esc(reviewTexts[i])}`
        + `</div>`
      );
    }
  }

  return parts.join('\n');
}

// ─── 상품정보 이미지 ─────────────────────────────────────────

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

// ─── 위탁판매/신뢰 정보 이미지 ──────────────────────────────

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

/**
 * 단일 AI 스토리 HTML을 문단 배열로 분리
 * (기존 호환용: aiStoryHtml이 하나의 문자열일 때)
 */
function splitStoryIntoParagraphs(html?: string): string[] {
  if (!html) return [];

  // <p>, <div>, <br> 기준으로 분리
  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();

  if (!stripped) return [];

  // 빈 줄 기준으로 문단 분리
  const paragraphs = stripped
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // 문단이 1개뿐이면 문장 단위로 2~3개로 쪼개기
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
