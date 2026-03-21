/**
 * fetch-naver-categories.cjs
 *
 * 네이버 커머스 API /v1/categories 로 전체 카테고리 다운로드.
 * Supabase DB에 저장된 네이버 채널 인증 정보 사용.
 *
 * Usage: node scripts/fetch-naver-categories.cjs
 * Output: src/lib/megaload/data/naver-categories.json
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const NAVER_API_BASE = 'https://api.commerce.naver.com/external';
const OUTPUT = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'naver-categories.json');

// ── 인증 정보 ──
async function getNaverCredentials() {
  // 1. 환경변수에서 직접
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    return {
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
    };
  }

  // 2. .env.local에서 Supabase → megaload_channels 조회
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) envVars[match[1].trim()] = match[2].trim();
    }

    const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      console.log('Supabase에서 네이버 채널 인증 정보 조회...');
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/megaload_channels?channel=eq.naver&select=credentials_enc`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          }
        );
        const rows = await res.json();
        if (rows.length > 0 && rows[0].credentials_enc) {
          const creds = typeof rows[0].credentials_enc === 'string'
            ? JSON.parse(rows[0].credentials_enc)
            : rows[0].credentials_enc;
          if (creds.clientId && creds.clientSecret) {
            return { clientId: creds.clientId, clientSecret: creds.clientSecret };
          }
        }
      } catch (err) {
        console.warn('Supabase 조회 실패:', err.message);
      }
    }
  }

  console.error(`
네이버 인증 정보가 필요합니다:

  NAVER_CLIENT_ID=xxx NAVER_CLIENT_SECRET=xxx node scripts/fetch-naver-categories.cjs

또는 megaload에 네이버 채널이 연동되어 있으면 자동으로 조회합니다.
`);
  process.exit(1);
}

async function fetchNaverToken(clientId, clientSecret) {
  const timestamp = String(Math.round(Date.now() - 3000));
  const password = `${clientId}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, clientSecret);
  const clientSecretSign = Buffer.from(hashed).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId,
    timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const res = await fetch(`${NAVER_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

/**
 * GET /v1/categories — 전체 카테고리 조회
 * Response: Array<{ wholeCategoryName: string, id: string, name: string, last: boolean }>
 */
async function fetchAllCategories(token) {
  console.log('전체 카테고리 조회 중...');
  const res = await fetch(`${NAVER_API_BASE}/v1/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`카테고리 조회 실패: ${res.status} ${await res.text()}`);
  return await res.json();
}

/**
 * GET /v1/categories?last=true — leaf 카테고리만 조회
 */
async function fetchLeafCategories(token) {
  console.log('Leaf 카테고리 조회 중...');
  const res = await fetch(`${NAVER_API_BASE}/v1/categories?last=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Leaf 카테고리 조회 실패: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function main() {
  const creds = await getNaverCredentials();
  console.log(`Client ID: ${creds.clientId.slice(0, 8)}...`);

  const token = await fetchNaverToken(creds.clientId, creds.clientSecret);
  console.log('토큰 발급 성공');

  // 전체 + leaf 둘 다 가져옴
  const [allRaw, leafRaw] = await Promise.all([
    fetchAllCategories(token),
    fetchLeafCategories(token),
  ]);

  const all = (Array.isArray(allRaw) ? allRaw : []).map(c => ({
    id: String(c.id),
    name: c.name,
    path: c.wholeCategoryName,  // 예: "화장품/미용>스킨케어>크림>넥크림"
    isLeaf: !!c.last,
  }));

  const leaves = (Array.isArray(leafRaw) ? leafRaw : []).map(c => ({
    id: String(c.id),
    name: c.name,
    path: c.wholeCategoryName,
  }));

  const output = {
    fetchedAt: new Date().toISOString(),
    totalCount: all.length,
    leafCount: leaves.length,
    all,
    leaves,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n저장 완료: ${OUTPUT}`);
  console.log(`  전체 카테고리: ${all.length}개`);
  console.log(`  Leaf 카테고리: ${leaves.length}개`);

  // 상위 카테고리 분포 출력
  const tops = new Map();
  for (const c of all) {
    const top = c.path.split('>')[0];
    tops.set(top, (tops.get(top) || 0) + 1);
  }
  console.log(`\n상위 카테고리 분포:`);
  for (const [name, count] of [...tops.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}개`);
  }
}

main().catch(err => {
  console.error('실패:', err.message);
  process.exit(1);
});
