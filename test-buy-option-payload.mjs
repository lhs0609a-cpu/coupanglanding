// 사료(110824) 필수 구매옵션 값 해석 회귀 테스트 — 쿠팡 호출 없이 페이로드만 빌드한다.
//   실행: node --env-file=.env.local test-buy-option-payload.mjs
//
// 지키려는 것:
//   1) 구매옵션 값에 "상세페이지 참조" 가 절대 안 들어간다 (쿠팡이 거부)
//   2) 상품명/원본고시에서 주원료를 찾아낸다
//   3) 단서가 없으면 지어내지 않고 차단한다
//   4) ★ 사용자가 검수 화면에서 직접 넣은 값을 추출기 폴백이 덮지 않는다
import { register } from 'node:module';
register('./test-loader-hooks.mjs', import.meta.url);

const { buildProductPayload } = await import('@/lib/megaload/services/preflight-builder');

// 110824 라이브 메타 실측값 그대로
const attributeMeta = [
  { attributeTypeName: '사료/간식 주원료', required: true, dataType: 'STRING', exposed: 'EXPOSED', groupNumber: 'NONE', basicUnit: '없음', usableUnits: [], attributeValues: [] },
  { attributeTypeName: '개당 중량', required: true, dataType: 'NUMBER', exposed: 'EXPOSED', groupNumber: '1', basicUnit: 'g', usableUnits: ['g', 'kg'], attributeValues: [] },
  { attributeTypeName: '개당 용량', required: true, dataType: 'NUMBER', exposed: 'EXPOSED', groupNumber: '1', basicUnit: 'ml', usableUnits: ['L', 'ml'], attributeValues: [] },
  { attributeTypeName: '수량', required: true, dataType: 'NUMBER', exposed: 'EXPOSED', groupNumber: 'NONE', basicUnit: '개', usableUnits: ['개', '박스', '세트'], attributeValues: [] },
];
// 110824 고시 = "기타 재화" (원재료 칸 없음) — 실측값 그대로
const noticeMeta = [{
  noticeCategoryName: '기타 재화',
  fields: [
    { name: '품명 및 모델명', required: true },
    { name: '인증/허가 사항', required: true },
    { name: '제조국(원산지)', required: true },
    { name: '제조자(수입자)', required: true },
    { name: '소비자상담 관련 전화번호', required: true },
  ],
}];

const deliveryInfo = {
  deliveryCompanyCode: 'CJGLS', deliveryChargeType: 'FREE', deliveryCharge: 0,
  freeShipOverAmount: 0, deliveryChargeOnReturn: 5000, outboundShippingPlaceCode: '12345',
};
const returnInfo = {
  returnCenterCode: '1000', returnCharge: 5000, companyContactNumber: '1600-0000',
  afterServiceContactNumber: '1600-0000', afterServiceInformation: '고객센터로 연락 바랍니다.',
};

async function run(label, name, extra = {}) {
  const product = {
    productCode: 'TEST-' + Math.random().toString(36).slice(2, 8),
    folderPath: 'test', name, sourceName: name,
    brand: '', sellingPrice: 19900, sourcePrice: 12000,
    categoryCode: '110824', categoryPath: '반려동물용품>강아지 사료>건식사료',
    tags: [], description: '강아지를 위한 사료입니다.',
    mainImages: ['a.jpg'], detailImages: [], reviewImages: [], infoImages: [],
    noticeMeta, attributeMeta,
    aiDisplayName: name,
    ...extra,
  };
  try {
    const { payload } = await buildProductPayload({
      product, vendorId: 'A01526382', deliveryInfo, returnInfo, stock: 10,
      shUserId: 'test-user',
      mainImageUrls: ['https://example.com/a.jpg'],
      detailImageUrls: [], reviewImageUrls: [], infoImageUrls: [],
      skipAiNoticeFill: true,
    });
    const items = payload.sellerProductItemList || payload.items || [];
    const attrs = (items[0]?.attributes || []).map((a) => `${a.attributeTypeName}="${a.attributeValueName}"`);
    console.log(`\n[${label}] ${name}`);
    console.log(`  ✅ 빌드 성공 → attributes: ${attrs.join(', ')}`);
    const bad = (items[0]?.attributes || []).filter((a) => /참조|참고/.test(a.attributeValueName));
    console.log(`  참조문구 포함: ${bad.length === 0 ? '없음 ✔' : JSON.stringify(bad) + ' ✗'}`);
  } catch (e) {
    console.log(`\n[${label}] ${name}`);
    console.log('  ERR:', e.stack.split('\n').slice(0, 6).join('\n     '));
  }
}

await run('원료 있음', '도그쿡 연어 사료 500g 강아지 건사료');
await run('원료 있음', '펫프렌즈 닭가슴살 수제간식 300g');
await run('원료 없음', '프리미엄 반려견 사료 500g');
await run('원본고시 제공', '프리미엄 반려견 사료 500g', {
  providedNotice: { productInfoProvidedNoticeView: { pet: { 주원료: '오리고기 35%, 현미' } } },
});
await run('사용자 직접입력', '프리미엄 반려견 사료 500g', {
  attributeValuesOverride: { '사료/간식 주원료': '소고기' },
});
