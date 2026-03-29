/**
 * 모든 카테고리의 고시정보(notices) 매핑 테스트
 *
 * 사용법:
 *   node scripts/test-all-notices.cjs
 *
 * 결과:
 *   src/lib/megaload/data/notice-category-map.json
 *   - categoryCode → { noticeCategoryName, fields[] }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- 쿠팡 API 인증 ----
// channel_credentials에서 가져오거나 환경변수에서 읽기
const VENDOR_ID = process.env.COUPANG_VENDOR_ID || '';
const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY || '';
const SECRET_KEY = process.env.COUPANG_SECRET_KEY || '';

if (!VENDOR_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error('환경변수 설정 필요:');
  console.error('  COUPANG_VENDOR_ID=...');
  console.error('  COUPANG_ACCESS_KEY=...');
  console.error('  COUPANG_SECRET_KEY=...');
  console.error('');
  console.error('사용법:');
  console.error('  COUPANG_VENDOR_ID=A0... COUPANG_ACCESS_KEY=... COUPANG_SECRET_KEY=... node scripts/test-all-notices.cjs');
  process.exit(1);
}

// Fly.io 프록시 경유 (쿠팡 API는 IP 화이트리스트 필요)
const PROXY_URL = process.env.COUPANG_PROXY_URL || 'https://coupang-api-proxy.fly.dev';
const PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

async function coupangApi(method, apiPath) {
  const url = `${PROXY_URL}/proxy${apiPath}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': PROXY_SECRET,
      'X-Coupang-Access-Key': ACCESS_KEY,
      'X-Coupang-Secret-Key': SECRET_KEY,
      'X-Coupang-Vendor-Id': VENDOR_ID,
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

async function getNoticeCategories(categoryCode) {
  const endpoints = [
    `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-models/display-category-codes/${categoryCode}`,
    `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/noticeCategories`,
  ];

  for (const apiPath of endpoints) {
    try {
      const raw = await coupangApi('GET', apiPath);
      const data = raw?.data || raw;
      if (!data) continue;

      const noticeCategories = data.noticeCategories || data.noticeCategoryList || (Array.isArray(data) ? data : null);
      if (noticeCategories && Array.isArray(noticeCategories) && noticeCategories.length > 0) {
        return noticeCategories.map((nc) => ({
          noticeCategoryName: nc.noticeCategoryName || '',
          fields: (nc.noticeCategoryDetailNames || nc.noticeDetails || []).map((d) => ({
            name: d.noticeCategoryDetailName || d.name || '',
            required: d.required ?? true,
          })),
        }));
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  // 카테고리 인덱스 로드
  const indexPath = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  // 고유 카테고리 코드 추출
  const codes = [...new Set(index.map((entry) => entry[0]))];
  console.log(`총 ${codes.length}개 카테고리 코드 발견`);

  // 결과 저장 (이미 존재하면 이어서)
  const outputPath = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'notice-category-map.json');
  let result = {};
  if (fs.existsSync(outputPath)) {
    result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    console.log(`기존 결과 ${Object.keys(result).length}개 로드됨 — 이어서 진행`);
  }

  const remaining = codes.filter((c) => !(c in result));
  console.log(`남은 ${remaining.length}개 조회 시작...\n`);

  let success = 0;
  let fail = 0;
  let empty = 0;

  // 동시성 제한 (5개씩)
  const BATCH_SIZE = 5;
  const DELAY_MS = 300;

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (code) => {
        const notices = await getNoticeCategories(code);
        return { code, notices };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { code, notices } = r.value;
        if (notices && notices.length > 0) {
          result[code] = notices;
          success++;
        } else {
          result[code] = null;
          empty++;
        }
      } else {
        fail++;
      }
    }

    // 진행률 표시
    const done = i + batch.length;
    const pct = Math.round((done / remaining.length) * 100);
    process.stdout.write(`\r[${pct}%] ${done}/${remaining.length} — 성공: ${success}, 빈값: ${empty}, 실패: ${fail}`);

    // 중간 저장 (100개마다)
    if (done % 100 === 0 || done === remaining.length) {
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    }

    // 레이트 리밋 방지
    if (i + BATCH_SIZE < remaining.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // 최종 저장
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\n\n=== 완료 ===`);
  console.log(`총 카테고리: ${codes.length}`);
  console.log(`고시정보 있음: ${success}`);
  console.log(`고시정보 없음: ${empty}`);
  console.log(`조회 실패: ${fail}`);
  console.log(`결과 저장: ${outputPath}`);

  // 통계: 고시정보 카테고리명별 빈도
  const nameCount = {};
  for (const [, notices] of Object.entries(result)) {
    if (notices && Array.isArray(notices)) {
      for (const nc of notices) {
        nameCount[nc.noticeCategoryName] = (nameCount[nc.noticeCategoryName] || 0) + 1;
      }
    }
  }

  console.log('\n=== 고시정보 카테고리명 빈도 ===');
  const sorted = Object.entries(nameCount).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  ${name}: ${count}개 카테고리`);
  }
}

main().catch((err) => {
  console.error('에러:', err);
  process.exit(1);
});
