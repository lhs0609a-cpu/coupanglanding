/**
 * 올인원 AI 최종점검(allinone-final-audit) 회귀 하니스.
 *   npx tsx scripts/verify-allinone-final-audit.ts
 *
 * 각 케이스는 "이 입력이면 이 code 가 이 severity 로 나와야 한다"를 고정한다.
 * 규칙을 손볼 때 다른 규칙이 조용히 죽는 것을 막는 게 목적.
 */
import { auditProduct, summarizeAudits, type AuditInput } from '../src/lib/megaload/services/allinone-final-audit';

const base: AuditInput = {
  uid: 'u1',
  displayName: '테스트 상품 500ml 2개입',
  categoryCode: '63454',
  categoryPath: '식품>음료>생수',
  detail: '깨끗한 물맛을 그대로 담았습니다. '.repeat(20),
  options: [{ name: '용량', value: '500', unit: 'ml' }],
  sellingPrice: 12900,
  sourcePrice: 5000,
  originalName: '생수 500ml 2개입',
  genCategoryPath: '식품>음료>생수',
  unresolvedOptions: [],
  mainImageCount: 3,
  mainPickedFromReview: false,
  mainImageWarning: undefined,
  detailImageCount: 2,
  reviewImageCount: 1,
};

interface Case {
  name: string;
  input: Partial<AuditInput>;
  expectCodes: string[];
  /** 이 code 들은 나오면 안 됨 */
  forbidCodes?: string[];
  expectBlocked?: boolean;
  check?: (r: ReturnType<typeof auditProduct>) => string | null;
}

const cases: Case[] = [
  {
    // ⭐ 가장 중요한 케이스 — 정상 상품이 재생성 큐에 들어가면 GPU 를 통째로 낭비한다.
    name: '정상 상품 — 지적도 재생성도 없음',
    input: {},
    expectCodes: [],
    forbidCodes: ['name_forbidden', 'detail_too_short', 'opt_meaningless', 'opt_unresolved'],
    expectBlocked: false,
    check: (r) => (r.regens.length === 0 ? null : `정상 상품인데 재생성 요구: ${r.regens.join(',')}`),
  },
  {
    // 값·단위 분리 저장이 이 시스템의 정상 형태다(숫자 값을 의심하면 전량 오판).
    name: '숫자 값 + 단위 분리는 정상',
    input: { options: [{ name: '중량', value: '1', unit: 'kg' }, { name: '수량', value: '2', unit: '개' }] },
    expectCodes: [],
    forbidCodes: ['opt_meaningless'],
    check: (r) => (r.regens.includes('options') ? '정상 옵션인데 재생성 요구' : null),
  },
  {
    name: '옵션값이 비었음 → options 재생성',
    input: { options: [{ name: '색상', value: '' }] },
    expectCodes: ['opt_meaningless'],
    check: (r) => (r.regens.includes('options') ? null : `regens=${r.regens.join(',')}`),
  },

  {
    name: '상품명 마크다운 제거',
    input: { displayName: '**프리미엄** 생수 500ml' },
    expectCodes: ['name_markdown'],
    check: (r) => (r.patch.displayName === '프리미엄 생수 500ml' ? null : `patch=${r.patch.displayName}`),
  },
  {
    name: '상품명 100자 초과 → 자름',
    input: { displayName: '가'.repeat(140) },
    expectCodes: ['name_too_long'],
    check: (r) => ((r.patch.displayName?.length ?? 0) <= 100 ? null : `len=${r.patch.displayName?.length}`),
  },
  {
    name: '상품명 비었음 → display_name 재생성',
    input: { displayName: '   ' },
    expectCodes: ['name_empty'],
    check: (r) => (r.regens.includes('display_name') ? null : `regens=${r.regens.join(',')}`),
  },
  { name: '상품명이 원본명 그대로 → 경고', input: { displayName: '생수 500ml 2개입' }, expectCodes: ['name_is_source'] },

  {
    name: '카테고리 코드 없음 → category 재생성',
    input: { categoryCode: '' },
    expectCodes: ['cat_missing'],
    check: (r) => (r.regens.includes('category') ? null : `regens=${r.regens.join(',')}`),
  },
  {
    name: '카테고리 변경됨 → 상세글 재작성',
    input: { categoryPath: '가구>침대', genCategoryPath: '식품>음료>생수' },
    expectCodes: ['detail_stale_category'],
    check: (r) => (r.regens.includes('content') ? null : `regens=${r.regens.join(',')}`),
  },

  { name: '상세글 비었음', input: { detail: '' }, expectCodes: ['detail_empty'] },
  { name: '상세글 너무 짧음', input: { detail: '짧은 글입니다.' }, expectCodes: ['detail_too_short'] },
  {
    name: '슬래시 분류 라벨 누출',
    input: { categoryPath: '식품>곡물>혼합곡/기타곡류', genCategoryPath: '식품>곡물>혼합곡/기타곡류', detail: `이 상품은 혼합곡/기타곡류 입니다. ${'고소한 풍미가 살아 있습니다. '.repeat(15)}` },
    expectCodes: ['detail_slash_label'],
  },
  {
    name: '생성 지시문 누출',
    input: { detail: `상세페이지 카피: ${'좋은 물맛을 그대로 담았습니다. '.repeat(20)}` },
    expectCodes: ['detail_meta_leak'],
  },

  {
    name: '필수옵션 미해결 → options 재생성',
    input: { unresolvedOptions: ['용량'] },
    expectCodes: ['opt_unresolved'],
    check: (r) => (r.regens.includes('options') ? null : `regens=${r.regens.join(',')}`),
  },
  { name: '의미없는 옵션명', input: { options: [{ name: '옵션1', value: '1' }] }, expectCodes: ['opt_meaningless'] },
  { name: '옵션 없음 → 경고만', input: { options: [] }, expectCodes: ['opt_none'], expectBlocked: false },

  {
    name: '판매가 없음 + 원가 있음 → 자동 계산',
    input: { sellingPrice: null },
    expectCodes: ['price_recomputed'],
    expectBlocked: false,
    check: (r) => ((r.patch.sellingPrice ?? 0) > 5000 ? null : `price=${r.patch.sellingPrice}`),
  },
  {
    name: '판매가·원가 모두 없음 → 차단',
    input: { sellingPrice: null, sourcePrice: null },
    expectCodes: ['price_missing'],
    expectBlocked: true,
  },
  {
    name: '역마진 → 원가 기준으로 상향',
    input: { sellingPrice: 4000, sourcePrice: 5000 },
    expectCodes: ['price_below_cost'],
    check: (r) => ((r.patch.sellingPrice ?? 0) > 5000 ? null : `price=${r.patch.sellingPrice}`),
  },
  {
    name: '10원 단위 정렬',
    input: { sellingPrice: 12345, sourcePrice: 5000 },
    expectCodes: ['price_round10'],
    check: (r) => (r.patch.sellingPrice === 12350 ? null : `price=${r.patch.sellingPrice}`),
  },
  { name: '원가 대비 과도한 판매가 → 경고', input: { sellingPrice: 900000, sourcePrice: 5000 }, expectCodes: ['price_outlier'], expectBlocked: false },

  { name: '대표이미지 0장 → 차단', input: { mainImageCount: 0 }, expectCodes: ['img_no_main'], expectBlocked: true },
  { name: '대표컷이 리뷰 사진 → 경고만', input: { mainPickedFromReview: true }, expectCodes: ['img_main_from_review'], expectBlocked: false },
  { name: '워커 대표컷 경고', input: { mainImageWarning: '후보가 전부 로고' }, expectCodes: ['img_main_warning'] },
  { name: '본문 이미지 없음 → 경고', input: { detailImageCount: 0, reviewImageCount: 0 }, expectCodes: ['img_no_body'], expectBlocked: false },
];

let pass = 0;
const failures: string[] = [];

for (const c of cases) {
  const r = auditProduct({ ...base, ...c.input });
  const codes = r.findings.map((f) => f.code);
  const problems: string[] = [];

  for (const want of c.expectCodes) {
    if (!codes.includes(want)) problems.push(`기대 code '${want}' 없음`);
  }
  for (const forbid of c.forbidCodes || []) {
    if (codes.includes(forbid)) problems.push(`금지 code '${forbid}' 나옴`);
  }
  if (c.expectBlocked !== undefined && r.blocked !== c.expectBlocked) {
    problems.push(`blocked 기대=${c.expectBlocked} 실제=${r.blocked}`);
  }
  const extra = c.check?.(r);
  if (extra) problems.push(extra);

  if (problems.length === 0) pass += 1;
  else failures.push(`✕ ${c.name}\n    ${problems.join('\n    ')}\n    실제 codes: [${codes.join(', ')}]`);
}

const summary = summarizeAudits(cases.map((c) => auditProduct({ ...base, ...c.input })));

console.log(`\n최종점검 규칙 회귀: ${pass}/${cases.length} 통과`);
if (failures.length) {
  console.log('\n' + failures.join('\n'));
}
console.log('\n집계 함수 동작 확인:', JSON.stringify(summary));
process.exit(failures.length ? 1 : 0);
