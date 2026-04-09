/**
 * 멀티 카테고리 진단 스크립트: 쿠팡 API의 실제 attributes vs 로컬 JSON buyOptions 비교
 *
 * 각 대분류별 대표 카테고리 + 지정 카테고리(58920, 56137)에 대해:
 * 1. category-related-metas endpoint 호출
 * 2. EXPOSED 속성 (구매옵션) 추출
 * 3. 로컬 JSON buyOptions 이름과 비교
 * 4. 이름 불일치 카운트
 *
 * 사용: node scripts/diag-multi-category.mjs
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const API_DELAY_MS = 500;

const MANDATORY_CATEGORIES = ['58920', '56137'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCredentials() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('channel_credentials')
    .select('credentials, megaload_user_id')
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .limit(1)
    .single();

  if (error || !data) throw new Error('자격증명 조회 실패: ' + (error ? error.message : 'no data'));
  return data.credentials;
}

async function callCoupangApi(method, path, accessKey, secretKey, vendorId) {
  const proxyPath = '/proxy' + path;
  const url = COUPANG_PROXY_URL + proxyPath;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': COUPANG_PROXY_SECRET,
      'X-Coupang-Access-Key': accessKey,
      'X-Coupang-Secret-Key': secretKey,
      'X-Coupang-Vendor-Id': vendorId,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('API ' + res.status + ': ' + text.slice(0, 300));
  }

  return res.json();
}

function loadLocalDetails() {
  const detailsPath = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
  return JSON.parse(readFileSync(detailsPath, 'utf-8'));
}

function getMajorCategoryRepresentatives(raw) {
  const majorCats = {};
  for (const [code, entry] of Object.entries(raw)) {
    const major = entry.p.split('>')[0].trim();
    if (majorCats[major] === undefined) {
      majorCats[major] = code;
    }
  }
  return majorCats;
}

async function diagnoseCategory(code, raw, creds) {
  const { accessKey, secretKey, vendorId } = creds;
  const entry = raw[code];

  const result = {
    code: code,
    path: entry ? entry.p : '(로컬 없음)',
    localBuyOptions: [],
    apiExposedAttrs: [],
    matches: [],
    mismatches: [],
    apiOnly: [],
    localOnly: [],
    error: null,
  };

  if (!entry) {
    result.error = '로컬 JSON에서 카테고리 ' + code + '을 찾을 수 없습니다.';
    return result;
  }

  result.localBuyOptions = (entry.b || []).map(function(o) {
    return { name: o.n, required: o.r, unit: o.u || null };
  });

  try {
    const apiPath = '/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/' + code;
    const metaResult = await callCoupangApi('GET', apiPath, accessKey, secretKey, vendorId);
    const metaData = metaResult.data || metaResult;
    const allAttrs = metaData.attributes || [];

    const exposedAttrs = allAttrs.filter(function(a) { return a.exposed === 'EXPOSED'; });
    result.apiExposedAttrs = exposedAttrs.map(function(a) {
      return {
        name: a.attributeTypeName,
        required: a.required,
        dataType: a.dataType,
        basicUnit: a.basicUnit || null,
        usableUnits: a.usableUnits || [],
      };
    });

    const apiNames = new Set(exposedAttrs.map(function(a) { return a.attributeTypeName; }));
    const localNames = new Set(result.localBuyOptions.map(function(o) { return o.name; }));

    for (const localOpt of result.localBuyOptions) {
      if (apiNames.has(localOpt.name)) {
        result.matches.push(localOpt.name);
      } else {
        result.mismatches.push(localOpt.name);
        result.localOnly.push(localOpt.name);
      }
    }

    for (const apiAttr of exposedAttrs) {
      if (!localNames.has(apiAttr.attributeTypeName)) {
        result.apiOnly.push(apiAttr.attributeTypeName);
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

async function main() {
  console.log('');
  console.log('================================================================');
  console.log('  멀티 카테고리 진단: 쿠팡 API attributes vs 로컬 buyOptions');
  console.log('================================================================');
  console.log('');

  console.log('[1/4] 로컬 JSON 로드 중...');
  const raw = loadLocalDetails();
  const totalCategories = Object.keys(raw).length;
  console.log('  총 ' + totalCategories + '개 카테고리 로드 완료');

  console.log('');
  console.log('[2/4] 대분류별 대표 카테고리 선택...');
  const majorCats = getMajorCategoryRepresentatives(raw);
  const majorEntries = Object.entries(majorCats);
  console.log('  ' + majorEntries.length + '개 대분류 발견:');
  for (const [major, code] of majorEntries) {
    console.log('    ' + major + ' -> ' + code + ' (' + raw[code].p + ')');
  }

  const targetCodes = new Set();
  for (const code of MANDATORY_CATEGORIES) {
    targetCodes.add(code);
  }
  for (const [, code] of majorEntries) {
    targetCodes.add(code);
  }

  const targets = [...targetCodes];
  console.log('');
  console.log('[3/4] 총 ' + targets.length + '개 카테고리 진단 시작 (API 딜레이: ' + API_DELAY_MS + 'ms)...');
  console.log('');

  const creds = await getCredentials();
  console.log('  자격증명 로드 완료');
  console.log('');

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const code = targets[i];
    const entry = raw[code];
    const label = entry ? entry.p.split('>')[0] : '???';
    process.stdout.write('  [' + (i + 1) + '/' + targets.length + '] ' + code + ' (' + label + ') ... ');

    const result = await diagnoseCategory(code, raw, creds);
    results.push(result);

    if (result.error) {
      console.log('ERROR: ' + result.error.slice(0, 80));
    } else {
      const matchCount = result.matches.length;
      const mismatchCount = result.mismatches.length;
      const apiOnlyCount = result.apiOnly.length;
      console.log('match=' + matchCount + ', mismatch=' + mismatchCount + ', apiOnly=' + apiOnlyCount);
    }

    if (i < targets.length - 1) {
      await sleep(API_DELAY_MS);
    }
  }

  // ── 상세 결과 ──
  console.log('');
  console.log('');
  console.log('================================================================');
  console.log('  상세 진단 결과');
  console.log('================================================================');

  let totalMatches = 0;
  let totalMismatches = 0;
  let totalApiOnly = 0;
  let totalErrors = 0;

  for (const r of results) {
    console.log('');
    console.log('----------------------------------------');
    console.log('카테고리: ' + r.code + ' (' + r.path + ')');
    console.log('----------------------------------------');

    if (r.error) {
      console.log('  ERROR: ' + r.error);
      totalErrors++;
      continue;
    }

    console.log('  로컬 buyOptions: ' + r.localBuyOptions.length + '개');
    for (const opt of r.localBuyOptions) {
      console.log('    - "' + opt.name + '" (필수=' + opt.required + ', 단위=' + (opt.unit || 'N/A') + ')');
    }

    console.log('  API EXPOSED 속성: ' + r.apiExposedAttrs.length + '개');
    for (const attr of r.apiExposedAttrs) {
      console.log('    - "' + attr.name + '" (필수=' + attr.required + ', dataType=' + attr.dataType + ', unit=' + (attr.basicUnit || 'N/A') + ')');
    }

    if (r.matches.length > 0) {
      const matchStr = r.matches.map(function(n) { return '"' + n + '"'; }).join(', ');
      console.log('  [OK] 일치 (' + r.matches.length + '개): ' + matchStr);
    }
    if (r.mismatches.length > 0) {
      const mmStr = r.mismatches.map(function(n) { return '"' + n + '"'; }).join(', ');
      console.log('  [MISMATCH] 로컬에만 있음 (' + r.mismatches.length + '개): ' + mmStr);
    }
    if (r.apiOnly.length > 0) {
      const aoStr = r.apiOnly.map(function(n) { return '"' + n + '"'; }).join(', ');
      console.log('  [API-ONLY] API에만 있음 (' + r.apiOnly.length + '개): ' + aoStr);
    }

    totalMatches += r.matches.length;
    totalMismatches += r.mismatches.length;
    totalApiOnly += r.apiOnly.length;
  }

  // ── 요약 ──
  console.log('');
  console.log('');
  console.log('================================================================');
  console.log('  요약');
  console.log('================================================================');
  console.log('  진단 카테고리 수: ' + results.length);
  console.log('  성공: ' + (results.length - totalErrors) + ', 실패: ' + totalErrors);
  console.log('  총 일치: ' + totalMatches + '개');
  console.log('  총 불일치 (로컬에만): ' + totalMismatches + '개');
  console.log('  총 API에만: ' + totalApiOnly + '개');
  console.log('');

  if (totalMismatches > 0 || totalApiOnly > 0) {
    console.log('  --- 불일치 상세 ---');
    for (const r of results) {
      if (r.error) continue;
      if (r.mismatches.length > 0 || r.apiOnly.length > 0) {
        const major = r.path.split('>')[0];
        console.log('  [' + r.code + '] ' + major + ':');
        if (r.mismatches.length > 0) {
          console.log('    로컬에만: ' + r.mismatches.join(', '));
        }
        if (r.apiOnly.length > 0) {
          console.log('    API에만:  ' + r.apiOnly.join(', '));
        }
      }
    }
  }

  console.log('');
  console.log('[4/4] 진단 완료.');
  console.log('');
}

main().catch(function(err) {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
