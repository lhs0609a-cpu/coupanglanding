// ============================================================
// 쿠팡 상품 등록 페이로드 빌더
// 쿠팡 OpenAPI v2 상품 등록 스펙에 맞춰 빌드
//
// 개선사항:
// - buyOptions ↔ attributes 분리 (구매옵션은 item-level, 속성은 attributes)
// - 멀티옵션 상품 지원 (색상×사이즈 조합 → 여러 item)
// - KC인증 지원 (certifications)
// - 할인가 표시 (originalPrice ≠ salePrice)
// - 바코드 지원
// - deliveryMethod 오타 수정
// ============================================================

import type { LocalProduct } from './local-product-reader';
import type { FilledNoticeCategory } from './notice-field-filler';
import type { ImageVariation } from './image-variation';
import { buildRichDetailPageHtml } from './detail-page-builder';
import { shuffleWithSeed, selectWithSeed } from './item-winner-prevention';
import { stringToSeed } from './seeded-random';
import { checkCompliance, containsForbiddenTerm } from './compliance-filter';
import type { ContentBlock } from './fragment-composer';

// ---- 입력 타입 ----

export interface DeliveryInfo {
  deliveryCompanyCode: string;
  deliveryChargeType: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE';
  deliveryCharge: number;
  freeShipOverAmount: number;
  deliveryChargeOnReturn: number;
  outboundShippingPlaceCode: string;
}

export interface ReturnInfo {
  returnCenterCode: string;
  returnCharge: number;
  companyContactNumber: string;
  afterServiceContactNumber: string;
  afterServiceInformation: string;
  // 쿠팡 필수 필드
  returnChargeName?: string;
  returnZipCode?: string;
  returnAddress?: string;
  returnAddressDetail?: string;
}

export interface AttributeMeta {
  attributeTypeName: string;
  required: boolean;
  dataType: string;
  basicUnit?: string;       // API 기본 단위 (예: "개", "g", "ml")
  usableUnits?: string[];   // 사용 가능 단위 목록
  exposed?: string;         // "EXPOSED" = 구매옵션, "NONE" = 검색속성
  groupNumber?: string;     // 택1 그룹 번호 ("1", "2", "NONE")
  attributeValues?: { attributeValueName: string }[];
}

/** 추출된 구매옵션 (item-level 반영용, attributes와 별도) */
export interface ExtractedBuyOption {
  name: string;
  value: string;
  unit?: string;
}

/** option-extractor에서 계산된 총 수량 (perCount × count) */
// totalUnitCount는 BuildCoupangPayloadParams에서 직접 받음

/** KC인증 정보 */
export interface CertificationInfo {
  certificationType: string;     // 'KC_CERTIFICATION' | 'OVERSEAS_CERTIFICATION' | etc.
  certificationCode?: string;    // 인증번호 (예: SU05016-21001)
  certificationOrganization?: string; // 인증기관
}

/** 멀티옵션 변형 (색상×사이즈 등 조합별 item) */
export interface OptionVariant {
  optionName: string;      // 옵션 표시명 (예: "블랙 / M")
  salePrice: number;
  originalPrice?: number;
  stock?: number;
  barcode?: string;
  sku?: string;            // 개별 SKU (없으면 자동 생성)
  mainImageUrls?: string[];  // 옵션별 대표이미지 (없으면 공통 사용)
}

export interface BuildCoupangPayloadParams {
  vendorId: string;
  product: LocalProduct;
  sellingPrice: number;
  categoryCode: string;
  mainImageUrls: string[];
  detailImageUrls: string[];
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  brand?: string;
  manufacturer?: string;
  maximumBuyForPerson?: number;
  outboundShippingTimeDay?: number;
  // 가격
  originalPrice?: number;          // 정가 (할인 태그용, 미설정 시 sellingPrice 사용)
  // 동적 notices / attributes / 리치 상세페이지
  filledNotices?: FilledNoticeCategory[];
  attributeMeta?: AttributeMeta[];
  attributeValues?: Record<string, string>;
  reviewImageUrls?: string[];
  infoImageUrls?: string[];
  aiStoryHtml?: string;
  aiStoryParagraphs?: string[];
  aiReviewTexts?: string[];
  consignmentImageUrls?: string[];
  thirdPartyImageUrls?: string[];   // 제3자 이미지 URLs (랜덤 선정된 2장)
  // 구매옵션 (option-extractor 추출값 — item-level 반영용)
  extractedBuyOptions?: ExtractedBuyOption[];
  // 총 수량 (option-extractor의 totalUnitCount — perCount × count)
  totalUnitCount?: number;
  // AI 생성 상품명
  displayProductName?: string;
  sellerProductName?: string;
  // 이미지 변형 (로깅용, 페이로드에 포함하지 않음)
  imageVariation?: ImageVariation;
  // KC인증
  certifications?: CertificationInfo[];
  // 멀티옵션 (제공 시 sellerProductItemList에 여러 item 생성)
  optionVariants?: OptionVariant[];
  // 바코드 (단일 옵션일 때)
  barcode?: string;
  // 세금/성인/해외 설정
  taxType?: 'TAX' | 'FREE' | 'ZERO';
  adultOnly?: 'EVERYONE' | 'ADULT_ONLY';
  parallelImported?: 'NOT_PARALLEL_IMPORTED' | 'PARALLEL_IMPORTED';
  overseasPurchased?: 'NOT_OVERSEAS_PURCHASED' | 'OVERSEAS_PURCHASED';
  pccNeeded?: boolean;
  // 아이템위너 방지
  preventionSeed?: string;            // 셀러ID 등 — 이미지 셔플 시드
  detailLayoutVariant?: string;       // 상세페이지 레이아웃 변형 (A/B/C/D)
  // 카테고리 경로 (예: "뷰티>스킨>크림>넥크림") — generalProductName, 고시정보 폴백에 사용
  categoryPath?: string;
  // SEO 상세페이지 신규 필드
  seoKeywords?: string[];
  faqItems?: { question: string; answer: string }[];
  closingText?: string;
  // V2: 설득형 콘텐츠 블록
  contentBlocks?: import('./persuasion-engine').ContentBlock[];
  // Wing ID (vendorUserId) — vendorId와 다름, DB에서 조회하여 전달
  vendorUserId?: string;
}

// ---- HTML 이스케이프 (XSS 방어) ----

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * AI 생성 HTML에서 위험한 태그/속성을 제거
 * <script>, <iframe>, <object>, <embed> 태그 제거
 * on* 이벤트 핸들러 제거
 * javascript: URL 제거
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[\s\S]*?\/?>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?\/?>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    .replace(/src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'src=""');
}

// ---- 쿠팡 상품명 금지어 필터 (compliance-filter 기반) ----

// 쿠팡 상품명에 추가로 허용되지 않는 특수문자 (규제 금지어와 별도)
const EXTRA_SPECIAL_CHARS = /[!@#$%^&*=+|\\{}[\]<>~`]/g;

function cleanProductName(name: string, categoryContext?: string): string {
  let cleaned = name.trim();

  // 0) "상세페이지 참조" 등 소싱 잔여 구문 제거
  cleaned = cleaned.replace(/상세\s*페이지\s*참조|상품\s*상세\s*참조|상세\s*설명\s*참조|본문\s*참조|상페\s*참조|이미지\s*참조/gi, '');

  // 1) 특수문자 제거 (쿠팡 기본 정책)
  cleaned = cleaned.replace(EXTRA_SPECIAL_CHARS, '');

  // 2) 규제 금지어 자동 제거 (error severity)
  const result = checkCompliance(cleaned, { removeErrors: true, categoryContext });
  cleaned = result.cleanedText;

  // 위반 로깅 (디버그)
  if (result.violations.length > 0) {
    console.log(
      `[compliance] 상품명 금지어 감지: ${result.violations.map((v) => `${v.label}(${v.category})`).join(', ')} | 원본: "${name}"`,
    );
  }

  // 빈 문자열 폴백
  if (!cleaned) {
    cleaned = name.trim().replace(/[!@#$%^&*=+|\\{}[\]<>~`]/g, '').replace(/\s+/g, ' ');
    if (!cleaned) cleaned = '상품';
  }
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100);
  }
  return cleaned;
}

// ---- 빌드 함수 ----

export function buildCoupangProductPayload(
  params: BuildCoupangPayloadParams,
): Record<string, unknown> {
  const {
    vendorId,
    product,
    sellingPrice,
    categoryCode,
    mainImageUrls,
    detailImageUrls,
    deliveryInfo,
    returnInfo,
    stock = 999,
    brand,
    manufacturer,
    maximumBuyForPerson = 0,
    outboundShippingTimeDay = 3,
    originalPrice,
    filledNotices,
    attributeMeta,
    attributeValues,
    reviewImageUrls,
    infoImageUrls,
    aiStoryHtml,
    aiStoryParagraphs,
    aiReviewTexts,
    consignmentImageUrls,
    thirdPartyImageUrls,
    extractedBuyOptions,
    displayProductName,
    sellerProductName,
    certifications,
    optionVariants,
    barcode,
    taxType = 'TAX',
    adultOnly = 'EVERYONE',
    parallelImported = 'NOT_PARALLEL_IMPORTED',
    overseasPurchased = 'NOT_OVERSEAS_PURCHASED',
    pccNeeded = false,
    preventionSeed,
    detailLayoutVariant,
    categoryPath,
    seoKeywords,
    faqItems,
    closingText,
    contentBlocks,
    vendorUserId,
  } = params;

  // ---- 1. 상품명 정리 ----
  const rawName = product.productJson.name || product.productJson.title || `상품_${product.productCode}`;
  const productName = displayProductName
    ? cleanProductName(displayProductName)
    : cleanProductName(rawName);

  // 셀러별 고유 코드: preventionSeed(shUserId:productCode) 해시 → 4자리 hex
  // 같은 셀러+같은 상품 = 항상 같은 코드, 다른 셀러+같은 상품 = 다른 코드
  const sellerHash = preventionSeed
    ? stringToSeed(preventionSeed).toString(16).slice(0, 4).toUpperCase()
    : '';
  const uniqueProductCode = sellerHash
    ? `${sellerHash}-${product.productCode}`
    : product.productCode;

  const resolvedSellerName = sellerProductName
    ? cleanProductName(sellerProductName.replace(product.productCode, uniqueProductCode))
    : productName;

  // brand: 항상 앞 2글자만 축약 (비오팜→비오, 종근당→종근, 고려은단헬스→고려)
  // 아이템위너 방지 모드: '자체' 고정 (원본 브랜드로 매칭되는 것 방지)
  const rawBrand = brand || product.productJson.brand || '';
  const resolvedBrand = preventionSeed
    ? '자체'  // 아이템위너 방지: 원본 브랜드 제거
    : (rawBrand ? rawBrand.slice(0, 2) : '자체');
  if (!rawBrand && !preventionSeed) {
    console.warn(`[payload-builder] ⚠️ brand 미설정 → "자체" 폴백 | "${rawName}"`);
  }
  // manufacturer: brand와 별개 — product.json에 manufacturer 있으면 사용
  // 아이템위너 방지 모드: '자체제조' 고정
  const resolvedManufacturer = preventionSeed
    ? '자체제조'  // 아이템위너 방지: 원본 제조사 제거
    : (manufacturer
      || (product.productJson as Record<string, unknown>).manufacturer as string
      || rawBrand
      || '자체제조');

  // ---- 2. 대표이미지 (REPRESENTATION) ----
  // 빈 문자열/falsy 값만 제거 (preflight-placeholder URL은 프리플라이트에서 유효)
  const validMainImageUrls = mainImageUrls.filter(Boolean);
  // 아이템위너 방지: 대표이미지(1번)는 고정, 나머지만 셔플
  const sliced = validMainImageUrls.slice(0, 10);
  const orderedImageUrls = preventionSeed && sliced.length > 1
    ? [sliced[0], ...shuffleWithSeed(sliced.slice(1), preventionSeed)]
    : sliced;
  // 쿠팡: REPRESENTATION은 1개만 허용, 나머지는 DETAIL
  const images = orderedImageUrls.map((url, i) => ({
    imageOrder: i,
    imageType: i === 0 ? 'REPRESENTATION' : 'DETAIL',
    cdnPath: url,
    vendorPath: url,
  }));

  // ---- 3. 상세페이지 (contents) ----
  console.log(`[payload-builder] 상세페이지 이미지: detail=${detailImageUrls.length}, review=${reviewImageUrls?.length || 0}, info=${infoImageUrls?.length || 0}, consignment=${consignmentImageUrls?.length || 0}, thirdParty=${thirdPartyImageUrls?.length || 0}, noticeFields=${filledNotices?.[0]?.noticeCategoryDetailName?.length || 0}`);
  const hasRichContent = aiStoryHtml || aiStoryParagraphs?.length
    || (reviewImageUrls && reviewImageUrls.length > 0)
    || (infoImageUrls && infoImageUrls.length > 0);
  let detailHtml: string;

  // ---- 상세페이지 텍스트 compliance 필터링 (쿠팡 AI 검수 대응) ----
  const complianceCtx = categoryPath;
  const cleanText = (t: string) => {
    const { cleanedText } = checkCompliance(t, { removeErrors: true, categoryContext: complianceCtx });
    return cleanedText || t;
  };
  const safeParagraphs = aiStoryParagraphs?.map(cleanText);
  const safeReviewTexts = aiReviewTexts?.map(cleanText);
  const safeFaqItems = faqItems?.map(f => ({ question: f.question, answer: cleanText(f.answer) }));
  const safeClosingText = closingText ? cleanText(closingText) : closingText;
  const safeSeoKeywords = seoKeywords?.filter(k => !containsForbiddenTerm(k));
  const safeContentBlocks: ContentBlock[] | undefined = contentBlocks?.map(b => ({
    ...b,
    content: cleanText(b.content),
    subContent: b.subContent ? cleanText(b.subContent) : b.subContent,
    items: b.items?.map(cleanText),
    emphasis: b.emphasis ? cleanText(b.emphasis) : b.emphasis,
  }));
  const safeStoryHtml = aiStoryHtml ? cleanText(aiStoryHtml) : aiStoryHtml;

  if (hasRichContent) {
    detailHtml = sanitizeHtml(buildRichDetailPageHtml({
      productName,
      brand: resolvedBrand,
      aiStoryParagraphs: safeParagraphs,
      aiStoryHtml: safeStoryHtml,
      reviewImageUrls,
      reviewTexts: safeReviewTexts,
      detailImageUrls,
      infoImageUrls,
      consignmentImageUrls,
      thirdPartyImageUrls,
      seoKeywords: safeSeoKeywords,
      faqItems: safeFaqItems,
      closingText: safeClosingText,
      categoryPath,
      contentBlocks: safeContentBlocks,
      noticeFields: filledNotices?.[0]?.noticeCategoryDetailName?.map(f => ({
        name: f.noticeCategoryDetailName,
        value: f.content,
      })),
    }, detailLayoutVariant));
  } else {
    detailHtml = buildSimpleDetailHtml(detailImageUrls, productName);
  }

  const contents = detailHtml
    ? [{
        contentsType: 'TEXT',
        contentDetails: [{ content: detailHtml, detailType: 'TEXT' }],
      }]
    : [];

  // ---- 4. 상품정보제공고시 (notices) ----
  // filledNotices가 있으면 flattenNotices()로 변환, 없으면 빈 배열 전송
  // 쿠팡 API는 notices 키 필수 — 생략하면 oneOf 다중 매칭 에러 발생
  const noticeCategories: FilledNoticeCategory[] = filledNotices && filledNotices.length > 0
    ? filledNotices
    : [];
  const hasNotices = noticeCategories.length > 0;
  console.log(`[payload-builder] notices: source=${hasNotices ? 'API_META' : 'OMITTED'}, category="${noticeCategories[0]?.noticeCategoryName || 'N/A'}", fields=${noticeCategories[0]?.noticeCategoryDetailName?.length || 0}`);

  // ---- 5. attributes (카테고리 필수 속성 + 구매옵션) ----
  // 쿠팡 API: attributes에 필수 속성 + 구매옵션(exposed) 모두 포함
  //
  // 핵심: extractedBuyOptions(option-extractor에서 정확히 추출한 값)가
  //       metaAttributes(buildAttributes 폴백값)보다 우선해야 함!
  //       이전 버그: buildAttributes()가 "상세페이지 참조" 폴백 먼저 채움
  //       → alreadyExists 체크로 정확한 추출값 버림 → API 에러
  const metaAttributes = buildAttributes(attributeMeta, attributeValues);

  // ⚠️ attributeMeta 비어있으면 경고 (구매옵션 미전송 → API 에러 가능)
  if (!attributeMeta || attributeMeta.length === 0) {
    console.error(`[payload-builder] 🚨 attributeMeta 비어있음! 카테고리=${categoryCode} → 구매옵션/필수속성 미전송 → API 에러 가능`);
  } else if (metaAttributes.length === 0) {
    const exposedCount = attributeMeta.filter(a => a.exposed === 'EXPOSED').length;
    const mandatoryCount = attributeMeta.filter(a => a.required).length;
    console.error(`[payload-builder] 🚨 buildAttributes 결과 0개! meta=${attributeMeta.length}개(EXPOSED=${exposedCount}, MANDATORY=${mandatoryCount}) → 필터링 로직 확인 필요`);
  }

  // extractedBuyOptions로 metaAttributes 값 교체
  // 추출값이 있는 속성만 마킹 (택1 그룹 처리에 사용)
  const extractedAttrNames = new Set<string>();
  if (extractedBuyOptions) {
    for (const opt of extractedBuyOptions) {
      if (!opt.value) continue;

      // 쿠팡 공식 스펙: NUMBER 타입 attributeValueName = "숫자+단위" 형식 필수
      //   예: "90정" (O), "1개" (O), "200ml" (O), "90" (X — 단위 누락)
      //   ⚠️ 단위는 반드시 usableUnits 배열 안에 있어야 유효!
      //      basicUnit이 usableUnits에 없으면 사용 불가 (검증 에러 발생)
      let attrValue: string;

      // 매칭되는 attributeMeta 찾기 (단위 정보 참조)
      const matchedMeta = attributeMeta?.find(m => m.attributeTypeName === opt.name)
        || attributeMeta?.find(m => normalizeAttrName(m.attributeTypeName) === normalizeAttrName(opt.name));

      if (opt.unit || matchedMeta?.basicUnit || (matchedMeta?.usableUnits && matchedMeta.usableUnits.length > 0)) {
        // 단위형: 숫자 추출 후 유효 단위 부착
        const numMatch = opt.value.match(/(\d+(?:\.\d+)?)/);
        const numStr = numMatch ? numMatch[1] : '1';

        // usableUnits��� 진짜 유효 단위 ��록 — basicUnit은 usableUnits에 포함된 경우만 유효
        const usable = matchedMeta?.usableUnits || [];
        const basic = matchedMeta?.basicUnit || '';
        const basicIsValid = basic && usable.includes(basic);

        let unit = '';
        if (opt.unit && usable.includes(opt.unit)) {
          // 1순위: 추출된 단위�� usableUnits에 있으면 그대로 사용
          unit = opt.unit;
        } else if (opt.unit && basicIsValid && opt.unit === basic) {
          // 2순위: 추출된 단위 = basicUnit이고 basicUnit이 유효하면 사용
          unit = basic;
        } else if (usable.length > 0) {
          // 3순위: usableUnits 첫 번째 사용 (가장 안전)
          unit = usable[0];
        } else if (basic) {
          // 4순위: usableUnits 없으면 basicUnit 사용 (레��시 카테고리)
          unit = basic;
        } else if (opt.unit) {
          // 5순위: API 메타에 단위 정보 전혀 없으면 로컬 JSON 단위 사용
          unit = opt.unit;
        }

        attrValue = unit ? `${numStr}${unit}` : numStr;
      } else {
        attrValue = opt.value;
      }

      // 이미 metaAttributes에 존재하면 → 폴백값을 추출값으로 교체
      // 1차: 정확히 일치
      let existingIdx = metaAttributes.findIndex(a => a.attributeTypeName === opt.name);
      // 2차: 정규화 매칭 (택1 제거, 공백 정리, 수량↔총 수량 등)
      if (existingIdx < 0) {
        const normalizedOpt = normalizeAttrName(opt.name);
        existingIdx = metaAttributes.findIndex(a => normalizeAttrName(a.attributeTypeName) === normalizedOpt);
        if (existingIdx >= 0) {
          console.log(`[payload-builder] buyOption 이름 정규화 매칭: "${opt.name}" → API명 "${metaAttributes[existingIdx].attributeTypeName}"`);
        }
      }

      if (existingIdx >= 0) {
        const oldVal = metaAttributes[existingIdx].attributeValueName;
        if (oldVal !== attrValue) {
          console.log(`[payload-builder] buyOption "${metaAttributes[existingIdx].attributeTypeName}": 폴백 "${oldVal}" → 추출값 "${attrValue}" 교체`);
        }
        metaAttributes[existingIdx].attributeValueName = attrValue;
        extractedAttrNames.add(metaAttributes[existingIdx].attributeTypeName);
      } else {
        console.warn(`[payload-builder] buyOption "${opt.name}" → 라이브 API attributeMeta에 매칭 안됨 → 건너뜀`);
      }
    }
  }

  // ⚠️ 택1(choose1) 그룹 처리: 같은 groupNumber의 EXPOSED 속성 중 하나만 남김
  // 쿠팡 에러: "카테고리는 최대 3개까지 옵션생성이 가능합니다"
  // 예: 개당 캡슐/정, 개당 중량, 개당 용량 (groupNumber="1") → 추출된 하나만 전송
  if (attributeMeta && attributeMeta.length > 0) {
    // groupNumber별 EXPOSED 속성 그룹 만들기
    const exposedGroups = new Map<string, string[]>(); // groupNumber → attributeTypeName[]
    for (const meta of attributeMeta) {
      if (meta.exposed === 'EXPOSED' && meta.groupNumber && meta.groupNumber !== 'NONE') {
        const group = exposedGroups.get(meta.groupNumber) || [];
        group.push(meta.attributeTypeName);
        exposedGroups.set(meta.groupNumber, group);
      }
    }

    // 각 그룹에서 추출값이 있는 하나만 남기고 나머지 제거
    for (const [groupNum, members] of exposedGroups) {
      if (members.length <= 1) continue; // 택1이 아닌 단일 그룹

      // 추출값이 있는 멤버 찾기
      const extracted = members.filter(name => extractedAttrNames.has(name));
      const keepName = extracted.length > 0 ? extracted[0] : members[0]; // 없으면 첫 번째 유지

      // 나머지 제거
      const removeNames = new Set(members.filter(name => name !== keepName));
      if (removeNames.size > 0) {
        console.log(`[payload-builder] 택1그룹 ${groupNum}: "${keepName}" 유지, ${[...removeNames].map(n => `"${n}"`).join(',')} 제거`);
        for (let i = metaAttributes.length - 1; i >= 0; i--) {
          if (removeNames.has(metaAttributes[i].attributeTypeName)) {
            metaAttributes.splice(i, 1);
          }
        }
      }
    }
  }

  const attributes = [...metaAttributes];
  // 디버깅: 최종 attributes 로깅 (구매옵션 에러 추적)
  const exposedLog = attributeMeta?.filter(m => m.exposed === 'EXPOSED').map(m => m.attributeTypeName) || [];
  console.log(`[payload-builder] attributes (${attributes.length}개, EXPOSED=${exposedLog.length}→${attributes.filter(a => exposedLog.includes(a.attributeTypeName)).length}): ${attributes.map(a => `${a.attributeTypeName}="${a.attributeValueName}"`).join(' | ')}`);

  // ---- 6. KC인증 ----
  const certificationList = certifications && certifications.length > 0
    ? certifications.map((cert) => ({
        certificationType: cert.certificationType,
        certificationCode: cert.certificationCode || '',
        ...(cert.certificationOrganization
          ? { certificationOrganization: cert.certificationOrganization }
          : {}),
      }))
    : [];

  // ---- 7. unitCount (총 수량: perCount × count) ----
  // 쿠팡의 unitCount는 "묶음 내 총 수량"
  // 예: "80매 x 10팩" → 800, "3개세트" → 3
  let unitCount = 1;
  if (params.totalUnitCount && params.totalUnitCount > 0) {
    // option-extractor에서 정확히 계산된 값 우선 사용
    unitCount = params.totalUnitCount;
  } else if (extractedBuyOptions) {
    const countOpt = extractedBuyOptions.find(
      (o) => o.name === '수량' || o.name.includes('수량'),
    );
    if (countOpt) {
      const parsed = parseInt(countOpt.value, 10);
      if (!isNaN(parsed) && parsed > 0) unitCount = parsed;
    }
  }

  // 건기식 안전장치: unitCount 낮으면 단가 초과로 노출제한 위험
  // 원본 상품명에서 정/캡슐 수 × 수량을 재추출 시도
  if (unitCount <= 1 && rawName) {
    // 1차: 정/캡슐 등 정제형 단위 (포 제외 — 포는 포장단위)
    const tabletMatch = rawName.match(/(\d+)\s*(정|캡슐|알|타블렛|소프트젤|매|장|ml|mL|g)/);
    if (tabletMatch) {
      const tabletNum = parseInt(tabletMatch[1], 10);
      // 수량 추출: "N개/통/팩/박스" (개입/개월 제외)
      const countMatch = rawName.match(/(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|EA|ea)/i);
      const packageCount = countMatch ? parseInt(countMatch[1], 10) : 1;
      const total = tabletNum * packageCount;
      if (total > 1) {
        console.warn(`[payload-builder] ⚠️ unitCount=${unitCount} → 재추출 ${tabletNum}×${packageCount}=${total} 적용 | "${rawName}"`);
        unitCount = total;
      }
    }
    // 2차: 포(sachet/스틱) — 수량과 곱하지 않음 (포장단위이므로)
    if (unitCount <= 1) {
      const sachetMatch = rawName.match(/(\d+)\s*포(?!기|인)/);
      if (sachetMatch) {
        const sachetNum = parseInt(sachetMatch[1], 10);
        if (sachetNum > 1) {
          console.warn(`[payload-builder] ⚠️ unitCount=${unitCount} → 포(sachet) 재추출 ${sachetNum} 적용 | "${rawName}"`);
          unitCount = sachetNum;
        }
      }
    }
    // 개월분 기반 추정: "2개월 1캡슐" → 1×1=1이지만 2×30=60이 맞음
    if (unitCount <= 1) {
      const monthMatch = rawName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) {
          const estimated = months * 30;
          console.warn(`[payload-builder] ⚠️ unitCount=${unitCount} → 개월분 추정 ${months}개월×30=${estimated} 적용 | "${rawName}"`);
          unitCount = estimated;
        }
      }
    }
  }
  // 건기식 카테고리에서 unitCount=1 경고 (단위가격 = 판매가 전체 → 노출제한 위험)
  if (unitCount === 1 && categoryPath && /건강식품|건강기능|영양제|비타민|오메가|유산균|프로바이오틱/.test(categoryPath)) {
    const unitPrice = sellingPrice / unitCount;
    console.error(`[payload-builder] 🚨 건기식 unitCount=1 경고! 단위가격=${unitPrice.toLocaleString()}원 (판매가=${sellingPrice.toLocaleString()}원) → 노출제한 위험 | "${rawName}"`);
  }

  // ---- 8. itemName에 구매옵션 반영 ----
  let baseItemName = productName;
  if (extractedBuyOptions && extractedBuyOptions.length > 0) {
    const optParts: string[] = [];
    for (const opt of extractedBuyOptions) {
      if (opt.name === '수량' || opt.name === '총 수량') continue;
      if (opt.unit) {
        // 단위형: 숫자가 있을 때만 "숫자+단위" 포맷으로 itemName에 추가
        if (/\d/.test(opt.value)) {
          const numMatch = opt.value.match(/(\d+(?:\.\d+)?)/);
          if (numMatch) optParts.push(`${numMatch[1]}${opt.unit}`);
        }
      } else if (opt.name.includes('색상') || opt.name.includes('사이즈')) {
        optParts.push(opt.value);
      }
    }
    if (optParts.length > 0) {
      const optStr = optParts.join(', ');
      baseItemName = `${productName} (${optStr})`;
      if (baseItemName.length > 100) baseItemName = baseItemName.slice(0, 100);
    }
  }

  // ---- 9. 바코드 처리 ----
  // 아이템위너 방지 모드: 바코드를 비워서 기존 상품 매칭 차단 (매칭 1순위)
  // barcode가 있으면 쿠팡이 정확히 같은 상품을 찾아 아이템위너에 묶고,
  // 단위가격이 높으면 노출제한 걸림. barcode 비우면 새 아이템 페이지 생성됨.
  const resolvedBarcode = preventionSeed
    ? ''  // 아이템위너 방지 활성 → 바코드 제거
    : (barcode || (product.productJson as Record<string, unknown>).barcode as string || '');
  const hasBarcode = !!resolvedBarcode;

  // ---- 10. 할인가 (originalPrice > salePrice면 할인 태그 표시) ----
  if (originalPrice && originalPrice > 0 && originalPrice < sellingPrice) {
    console.warn(`[payload-builder] originalPrice(${originalPrice}) < sellingPrice(${sellingPrice}): 쿠팡에서 할인 태그가 표시되지 않습니다. originalPrice를 sellingPrice로 대체합니다.`);
  }
  const resolvedOriginalPrice = originalPrice && originalPrice > sellingPrice
    ? originalPrice
    : sellingPrice;

  // ---- 11. sellerProductItemList 조립 ----
  let sellerProductItemList: Record<string, unknown>[];

  if (optionVariants && optionVariants.length > 0) {
    // 멀티옵션 상품: 각 변형별 별도 item
    sellerProductItemList = optionVariants.map((variant, idx) => {
      // 아이템위너 방지: 멀티옵션 바코드도 제거
      const variantBarcode = preventionSeed ? '' : (variant.barcode || '');
      const variantImages = variant.mainImageUrls
        ? variant.mainImageUrls.slice(0, 10).map((url, i) => ({
            imageOrder: i,
            imageType: i === 0 ? 'REPRESENTATION' : 'DETAIL',
            cdnPath: url,
            vendorPath: url,
          }))
        : images;

      return {
        itemName: (variant.optionName || '').slice(0, 100),
        originalPrice: variant.originalPrice ?? variant.salePrice,
        salePrice: variant.salePrice,
        maximumBuyCount: variant.stock ?? stock,
        maximumBuyForPerson,
        maximumBuyForPersonPeriod: 1,
        outboundShippingTimeDay,
        unitCount,
        adultOnly,
        taxType,
        parallelImported,
        overseasPurchased,
        pccNeeded: String(pccNeeded),  // 스펙: 문자열 "true"/"false"
        externalVendorSku: variant.sku || `${uniqueProductCode}_${idx + 1}`,
        barcode: variantBarcode,
        emptyBarcode: !variantBarcode,
        ...((!variantBarcode) ? { emptyBarcodeReason: '상품확인불가_바코드없음사유' } : {}),
        certifications: certificationList.length > 0
          ? certificationList
          : [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }],
        images: variantImages,
        // notices: API 메타 있을 때만 전송, 없으면 키 생략 (잘못된 카테고리 전송 방지)
        notices: hasNotices ? flattenNotices(noticeCategories) : [],
        attributes,
        contents,
      };
    });
  } else {
    // 단일 옵션 상품
    sellerProductItemList = [{
      itemName: baseItemName,
      originalPrice: resolvedOriginalPrice,
      salePrice: sellingPrice,
      maximumBuyCount: stock,
      maximumBuyForPerson,
      maximumBuyForPersonPeriod: 1,
      outboundShippingTimeDay,
      unitCount,
      adultOnly,
      taxType,
      parallelImported,
      overseasPurchased,
      pccNeeded: String(pccNeeded),  // 쿠팡: 문자열 "true"/"false"
      externalVendorSku: uniqueProductCode,
      barcode: resolvedBarcode,
      emptyBarcode: !hasBarcode,
      ...((!hasBarcode) ? { emptyBarcodeReason: '상품확인불가_바코드없음사유' } : {}),
      certifications: certificationList.length > 0
        ? certificationList
        : [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }],
      images,
      // notices: API 메타 있을 때만 전송, 없으면 키 생략
      notices: hasNotices ? flattenNotices(noticeCategories) : [],
      attributes,
      contents,
    }];
  }

  // ---- 12. 전체 페이로드 조립 ----
  // 쿠팡 OpenAPI v2 seller-products 공식 스펙에 맞춤
  const payload: Record<string, unknown> = {
    displayCategoryCode: Number(categoryCode) || 0,
    sellerProductName: resolvedSellerName,
    vendorId,
    saleStartedAt: formatCoupangDateTime(new Date()),
    saleEndedAt: '2099-01-01T23:59:59',
    displayProductName: productName,
    brand: resolvedBrand,
    generalProductName: extractGeneralProductName(categoryPath, productName),
    productGroup: '',
    deliveryMethod: 'SEQUENCIAL',
    deliveryCompanyCode: deliveryInfo.deliveryCompanyCode,
    deliveryChargeType: deliveryInfo.deliveryChargeType,
    deliveryCharge: deliveryInfo.deliveryCharge,
    freeShipOverAmount: deliveryInfo.deliveryChargeType === 'CONDITIONAL_FREE'
      ? (deliveryInfo.freeShipOverAmount || 0)
      : 0,
    deliveryChargeOnReturn: deliveryInfo.deliveryChargeOnReturn,
    remoteAreaDeliverable: 'Y',
    unionDeliveryType: 'NOT_UNION_DELIVERY',
    outboundShippingPlaceCode: Number(deliveryInfo.outboundShippingPlaceCode) || 0,  // 스펙: Number 타입

    returnCenterCode: returnInfo.returnCenterCode,
    returnChargeName: returnInfo.returnChargeName || '반품지',
    companyContactNumber: returnInfo.companyContactNumber || '010-0000-0000',
    returnCharge: returnInfo.returnCharge,
    returnZipCode: returnInfo.returnZipCode || '06159',
    returnAddress: returnInfo.returnAddress || '서울특별시 강남구',
    returnAddressDetail: returnInfo.returnAddressDetail || '상세주소',
    // vendorUserId는 Wing ID — vendorId와 다른 값이므로 별도 전달 시에만 설정
    // batch/route.ts에서 wingUserId가 있을 때 payload에 직접 주입함
    ...(vendorUserId ? { vendorUserId } : {}),

    requested: true,  // 자동 판매승인 요청

    // 쿠팡 스펙 필드명: "items" (sellerProductItemList가 아님!)
    items: sellerProductItemList,

    extraInfoMessage: '',
    manufacture: resolvedManufacturer,
  };

  return payload;
}

// ---- 헬퍼 함수들 ----

/**
 * 쿠팡 notices 포맷: 중첩 구조 → flat 배열 변환
 * 입력: [{ noticeCategoryName, noticeCategoryDetailName: [{ noticeCategoryDetailName, content }] }]
 * 출력: [{ noticeCategoryName, noticeCategoryDetailName, content }, ...]
 */
function flattenNotices(
  categories: FilledNoticeCategory[],
): { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[] {
  const flat: { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[] = [];
  for (const cat of categories) {
    for (const detail of cat.noticeCategoryDetailName) {
      flat.push({
        noticeCategoryName: cat.noticeCategoryName,
        noticeCategoryDetailName: detail.noticeCategoryDetailName,
        content: detail.content || '상세페이지 참조',
      });
    }
  }
  return flat;
}

/** 쿠팡 API 날짜 포맷: yyyy-MM-ddTHH:mm:ss (밀리초/타임존 없음) */
function formatCoupangDateTime(date: Date): string {
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const H = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${d}T${H}:${m}:${s}`;
}

/**
 * 카테고리 경로에서 generalProductName(상품군) 추출
 * 예: "뷰티>스킨>크림>넥크림" → "넥크림"
 * categoryPath가 없으면 상품명 사용
 */
function extractGeneralProductName(categoryPath?: string, fallbackName?: string): string {
  if (categoryPath) {
    const leafName = categoryPath.split('>').pop()?.trim();
    if (leafName) return leafName.slice(0, 100);
  }
  return (fallbackName || '상품').slice(0, 100);
}

function buildSimpleDetailHtml(imageUrls: string[], productName: string): string {
  if (imageUrls.length === 0) return '';
  const safeName = escHtml(productName);
  const imgTags = imageUrls
    .map(
      (url, i) =>
        `<img src="${escHtml(url)}" alt="${safeName} 상세 ${i + 1}" style="width:100%;display:block;" />`,
    )
    .join('\n');
  return `<div style="width:100%;max-width:860px;margin:0 auto;">\n${imgTags}\n</div>`;
}

/**
 * 카테고리 속성 빌드
 *
 * items[].attributes는 구매옵션(exposed=EXPOSED)을 위한 필드.
 * non-EXPOSED 검색속성은 포함하지 않음 — 넣으면 NUMBER에 텍스트 폴백이 들어가
 * "유효하지 않은 구매 옵션 값 혹은 단위" 에러 발생.
 *
 * exposed 정보가 없는 경우(이전 캐시) → 기존 로직으로 폴백.
 */
function buildAttributes(
  meta?: AttributeMeta[],
  values?: Record<string, string>,
): { attributeTypeName: string; attributeValueName: string }[] {
  if (!meta || meta.length === 0) return [];

  // exposed 정보가 있으면 EXPOSED 속성만 포함 (구매옵션만)
  const hasExposedInfo = meta.some(a => a.exposed);

  const attrs: { attributeTypeName: string; attributeValueName: string }[] = [];
  for (const attr of meta) {
    if (!attr.required) continue;

    // EXPOSED 속성만 포함 (non-EXPOSED 검색속성은 제외)
    if (hasExposedInfo && attr.exposed !== 'EXPOSED') continue;

    const userValue = values?.[attr.attributeTypeName];
    const allowedValues = attr.attributeValues?.map((v) => v.attributeValueName) || [];

    if (userValue) {
      // ENUM 타입: 사용자 값이 허용목록에 있는지 검증
      if (allowedValues.length > 0 && !allowedValues.includes(userValue)) {
        console.warn(`[payload-builder] 속성 "${attr.attributeTypeName}" 값 "${userValue}"이 ENUM 허용목록에 없음 → "${allowedValues[0]}" 폴백`);
        attrs.push({
          attributeTypeName: attr.attributeTypeName,
          attributeValueName: allowedValues[0],
        });
      } else {
        attrs.push({
          attributeTypeName: attr.attributeTypeName,
          attributeValueName: userValue,
        });
      }
    } else if (allowedValues.length > 0) {
      // 선택형 필수: 첫 번째 선택지로 폴백
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: allowedValues[0],
      });
    } else if (attr.dataType === 'NUMBER') {
      // NUMBER 타입: "숫자+단위" 폴백 (쿠팡 공식 스펙)
      // ⚠️ 단위는 반드시 usableUnits에 포함되어야 함!
      //    basicUnit이 usableUnits에 없으면 사용 불가 (예: "개당 캡슐/정" basicUnit="개" usableUnits=["정","회분"])
      const usable = attr.usableUnits || [];
      const basic = attr.basicUnit || '';
      const unit = (usable.length > 0)
        ? (usable.includes(basic) ? basic : usable[0])  // usableUnits 기준으로 선택
        : basic;  // usableUnits 없으면 basicUnit 폴백
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: unit ? `1${unit}` : '1',
      });
    } else if (attr.dataType === 'TEXT' || attr.dataType === 'STRING') {
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: getAttributeFallback(attr.attributeTypeName),
      });
    }
  }
  return attrs;
}

/**
 * 속성명 정규화 — 로컬 캐시명과 라이브 API명의 미세 차이를 흡수
 * 예: "개당 캡슐/정(택1)" → "개당 캡슐/정"
 *     "총 수량" → "수량"
 *     " 수량 " → "수량"
 */
function normalizeAttrName(name: string): string {
  let n = name
    .replace(/\(택\d+\)\s*/g, '')   // "(택1)" 등 제거
    .replace(/\s+/g, ' ')            // 다중 공백 정리
    .trim();
  // "총 수량" ↔ "수량" 동의어
  if (n === '총 수량') n = '수량';
  return n;
}

/** 구매옵션(단위형) 속성명인지 판별 — 이 속성에 텍스트 폴백을 넣으면 API 에러 */
function isBuyOptionName(attrName: string): boolean {
  const n = attrName.toLowerCase();
  return n.includes('개당') || n === '수량' || n === '총 수량' || n === '용량' || n === '중량'
    || n.includes('캡슐') || n.includes('정(') || n.includes('길이')
    || n.includes('가로') || n.includes('세로') || n.includes('신발');
}

/** TEXT/NUMBER형 필수 속성의 안전한 기본값 */
function getAttributeFallback(attrName: string): string {
  const n = attrName.toLowerCase();
  if (n.includes('원산지') || n.includes('제조국')) return '상세페이지 참조';
  if (n.includes('브랜드')) return '자체브랜드';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  if (n.includes('소재') || n.includes('재질')) return '상세페이지 참조';
  if (n.includes('무게') || n.includes('중량')) return '상세페이지 참조';
  if (n.includes('크기') || n.includes('사이즈')) return '상세페이지 참조';
  if (n.includes('색상') || n.includes('컬러')) return '상세페이지 참조';
  return '상세페이지 참조';
}

