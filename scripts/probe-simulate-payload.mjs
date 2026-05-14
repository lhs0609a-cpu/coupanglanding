// Single-cat probe to inspect actual payload structure
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');
const builder = await jiti.import('../src/lib/megaload/services/coupang-product-builder.ts');

const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');
let liveAttrs;
for (let s = 0; s < 10; s++) {
  const f = join(CACHE_DIR, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  if (data['59363']?.attrs) { liveAttrs = data['59363'].attrs; break; }
}
console.log('Live attrs for 59363:');
for (const a of liveAttrs) console.log('  ', JSON.stringify(a));

const attributeMeta = liveAttrs.map(a => ({
  attributeTypeName: a.n, required: !!a.r, dataType: a.dt,
  basicUnit: a.bu, usableUnits: a.uu, exposed: a.ex, groupNumber: a.gn,
  attributeValues: (a.vs || []).map(v => ({ attributeValueName: v })),
}));

const extracted = await oe.extractOptionsEnhanced({
  productName: '오렌지 17kg, 1개',
  categoryCode: '59363',
  categoryPath: '식품>신선식품>과일류>과일>오렌지',
});
console.log('\nExtracted:', JSON.stringify(extracted.buyOptions));

const payload = builder.buildCoupangProductPayload({
  vendorId: 'DUMMY_VENDOR',
  product: { folderPath: '/tmp', productCode: 'DUMMY', productJson: { name: '오렌지 17kg, 1개', price: 19900 }, mainImages: [], detailImages: [], infoImages: [], reviewImages: [] },
  sellingPrice: 19900,
  categoryCode: '59363',
  mainImageUrls: ['https://example.com/main.jpg'],
  detailImageUrls: ['https://example.com/d1.jpg'],
  deliveryInfo: { vendorUserId: 'X', shippingMethod: 'NOT_BUNDLE', deliveryCompanyCode: 'CJGLS', deliveryChargeType: 'FREE', deliveryCharge: 0, freeShipOverAmount: 0, remoteAreaDeliverable: 'Y', outboundShippingPlaceCode: 0, unionDeliveryType: 'NOT_UNION_DELIVERY', returnCharge: 5000, returnChargeName: 'X', returnZipCode: '00000', returnAddress: 'X', returnAddressDetail: 'X' },
  returnInfo: { returnCenterCode: 'X' },
  attributeMeta,
  extractedBuyOptions: extracted.buyOptions,
  totalUnitCount: extracted.totalUnitCount,
  displayProductName: '오렌지 신선한 까는법 1개',
  sellerProductName: '오렌지 신선한 까는법 1개',
  categoryPath: '식품>신선식품>과일류>과일>오렌지',
});

console.log('\nPayload top-level keys:', Object.keys(payload));
const items = payload.sellerProductItemList || [];
console.log('items count:', items.length);
if (items.length > 0) {
  console.log('items[0] keys:', Object.keys(items[0]));
  console.log('items[0].attributes:', JSON.stringify(items[0].attributes));
}
