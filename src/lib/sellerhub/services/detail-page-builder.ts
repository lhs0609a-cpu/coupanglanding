// ============================================================
// 리치 HTML 상세페이지 빌더
// AI 스토리 + 리뷰이미지 + 상세이미지 + 제품정보이미지 조립
// ============================================================

export interface DetailPageParams {
  productName: string;
  brand?: string;
  aiStoryHtml?: string;
  reviewImageUrls?: string[];
  detailImageUrls: string[];
  infoImageUrls?: string[];
}

/**
 * 리치 상세페이지 HTML을 생성한다.
 *
 * 구조:
 * 1. 브랜드명 + 상품명 헤더
 * 2. AI 생성 스토리 (있으면)
 * 3. REAL REVIEW 섹션 (리뷰 이미지, 있으면)
 * 4. 상세 이미지 (output/)
 * 5. 상품정보 이미지 (product_info/)
 */
export function buildRichDetailPageHtml(params: DetailPageParams): string {
  const {
    productName,
    brand,
    aiStoryHtml,
    reviewImageUrls,
    detailImageUrls,
    infoImageUrls,
  } = params;

  const sections: string[] = [];

  // 컨테이너 시작
  sections.push('<div style="width:100%;max-width:860px;margin:0 auto;font-family:\'Malgun Gothic\',\'맑은 고딕\',sans-serif;">');

  // 1. 헤더 (브랜드 + 상품명)
  sections.push(buildHeaderSection(productName, brand));

  // 2. AI 스토리
  if (aiStoryHtml) {
    sections.push(buildStorySection(aiStoryHtml));
  }

  // 3. 리뷰 이미지 섹션
  if (reviewImageUrls && reviewImageUrls.length > 0) {
    sections.push(buildReviewSection(reviewImageUrls, productName));
  }

  // 4. 구분선
  if (aiStoryHtml || (reviewImageUrls && reviewImageUrls.length > 0)) {
    sections.push('<div style="height:40px;"></div>');
  }

  // 5. 상세 이미지
  if (detailImageUrls.length > 0) {
    sections.push(buildDetailImagesSection(detailImageUrls, productName));
  }

  // 6. 상품정보 이미지
  if (infoImageUrls && infoImageUrls.length > 0) {
    sections.push(buildInfoSection(infoImageUrls, productName));
  }

  // 컨테이너 종료
  sections.push('</div>');

  return sections.join('\n');
}

function buildHeaderSection(productName: string, brand?: string): string {
  const parts: string[] = [];
  parts.push('<div style="text-align:center;padding:30px 20px 20px;">');
  if (brand) {
    parts.push(`<div style="font-size:14px;color:#888;letter-spacing:2px;margin-bottom:8px;">${escapeHtml(brand)}</div>`);
  }
  parts.push(`<div style="font-size:22px;font-weight:bold;color:#222;line-height:1.4;">${escapeHtml(productName)}</div>`);
  parts.push('<div style="width:60px;height:3px;background:#E31837;margin:16px auto 0;"></div>');
  parts.push('</div>');
  return parts.join('\n');
}

function buildStorySection(aiStoryHtml: string): string {
  return `<div style="padding:20px 30px;line-height:1.8;color:#333;font-size:15px;">\n${aiStoryHtml}\n</div>`;
}

function buildReviewSection(urls: string[], productName: string): string {
  const parts: string[] = [];
  parts.push('<div style="padding:30px 0;">');
  // 섹션 타이틀
  parts.push('<div style="text-align:center;margin-bottom:20px;">');
  parts.push('<div style="font-size:12px;color:#E31837;letter-spacing:3px;margin-bottom:6px;">REAL REVIEW</div>');
  parts.push('<div style="font-size:18px;font-weight:bold;color:#222;">실제 구매 후기</div>');
  parts.push('</div>');
  // 리뷰 이미지들
  for (let i = 0; i < urls.length; i++) {
    parts.push(
      `<img src="${escapeHtml(urls[i])}" alt="${escapeHtml(productName)} 리뷰 ${i + 1}" style="width:100%;display:block;margin-bottom:8px;" />`
    );
  }
  parts.push('</div>');
  return parts.join('\n');
}

function buildDetailImagesSection(urls: string[], productName: string): string {
  return urls
    .map(
      (url, i) =>
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(productName)} 상세 ${i + 1}" style="width:100%;display:block;" />`
    )
    .join('\n');
}

function buildInfoSection(urls: string[], productName: string): string {
  const parts: string[] = [];
  parts.push('<div style="padding:30px 0 0;">');
  parts.push('<div style="text-align:center;margin-bottom:16px;">');
  parts.push('<div style="font-size:16px;font-weight:bold;color:#555;">상품정보제공고시</div>');
  parts.push('</div>');
  for (let i = 0; i < urls.length; i++) {
    parts.push(
      `<img src="${escapeHtml(urls[i])}" alt="${escapeHtml(productName)} 정보 ${i + 1}" style="width:100%;display:block;margin-bottom:4px;" />`
    );
  }
  parts.push('</div>');
  return parts.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
