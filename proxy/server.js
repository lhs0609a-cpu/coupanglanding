/**
 * 쿠팡 API 프록시 서버 (Fly.io 배포용)
 *
 * 역할: Vercel(동적 IP) → Fly.io(고정 IP) → 쿠팡 API
 * 쿠팡 Wing에 이 서버의 고정 IP만 등록하면 됨
 *
 * 보안:
 * - PROXY_SECRET 토큰으로 인증 (Vercel↔Fly.io 간)
 * - 쿠팡 HMAC 서명은 이 서버에서 직접 생성
 * - API 키는 환경변수로만 관리 (DB 미사용)
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const COUPANG_API_BASE = 'https://api-gateway.coupang.com';

// ─── 네이버 원본 페이지 스크랩 (품절 동기화용) ──────────────

const NAVER_BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
};

const NAVER_FETCH_TIMEOUT_MS = 25000;
const NAVER_MAX_REDIRECTS = 5;
const NAVER_MAX_HTML_BYTES = 500_000;

function fetchNaverUrl(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      reject(new Error('invalid url: ' + err.message));
      return;
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { ...NAVER_BROWSER_HEADERS, Host: parsed.hostname },
    };

    const req = https.request(options, (res) => {
      // 리다이렉트 처리
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectCount >= NAVER_MAX_REDIRECTS) {
          reject(new Error('too many redirects'));
          return;
        }
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        fetchNaverUrl(nextUrl, redirectCount + 1).then(resolve, reject);
        return;
      }

      // 인코딩 디코더 파이프
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      let bytes = 0;
      let truncated = false;
      stream.on('data', (chunk) => {
        if (truncated) return;
        if (bytes + chunk.length > NAVER_MAX_HTML_BYTES) {
          chunks.push(chunk.slice(0, NAVER_MAX_HTML_BYTES - bytes));
          truncated = true;
          bytes = NAVER_MAX_HTML_BYTES;
          res.destroy();
          return;
        }
        chunks.push(chunk);
        bytes += chunk.length;
      });
      stream.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          html: Buffer.concat(chunks).toString('utf8'),
          truncated,
        });
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(NAVER_FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('naver fetch timeout'));
    });
    req.end();
  });
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// ─── HMAC 서명 생성 (쿠팡 CEA 방식) ────────────────────────

function generateCoupangSignature(method, path, query, secretKey, accessKey) {
  // 쿠팡 공식 스펙: 2자리 연도 (yyMMdd'T'HHmmss'Z')
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(2);
  const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const HH = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

  const message = `${datetime}${method}${path}${query}`;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

// ─── 쿠팡 API 호출 ──────────────────────────────────────────

function callCoupangApi(method, path, query, body, accessKey, secretKey, vendorId) {
  return new Promise((resolve, reject) => {
    const authorization = generateCoupangSignature(method, path, query, secretKey, accessKey);
    const url = `${COUPANG_API_BASE}${path}${query ? '?' + query : ''}`;
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Requested-By': vendorId || accessKey, // 쿠팡 API 필수 헤더
        'Accept-Encoding': 'gzip, deflate, br',  // 압축 응답 명시 수락 (해제 로직 추가됨)
      },
    };

    const req = https.request(options, (res) => {
      // Content-Encoding 디코딩 — 쿠팡이 gzip/br 압축으로 응답하면
      // raw 바이트가 그대로 전달돼 클라이언트에서 깨진 문자열로 보임 (BUG FIX)
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        // Content-Encoding 헤더는 디코딩 후 제거 (다운스트림 재압축 방지)
        const cleanHeaders = { ...res.headers };
        delete cleanHeaders['content-encoding'];
        delete cleanHeaders['content-length'];  // 크기 변경됨
        resolve({
          statusCode: res.statusCode,
          headers: cleanHeaders,
          body: responseBody,
        });
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Coupang API timeout (30s)'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ─── HTTP 서버 ───────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Proxy-Secret, X-Coupang-Access-Key, X-Coupang-Secret-Key, X-Coupang-Vendor-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', region: process.env.FLY_REGION || 'local', timestamp: new Date().toISOString() }));
    return;
  }

  // ── 인증 체크 ──
  const proxySecret = req.headers['x-proxy-secret'];
  if (PROXY_SECRET && proxySecret !== PROXY_SECRET) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid proxy secret' }));
    return;
  }

  // ── /naver-check: 품절 동기화용 네이버 스크랩 (쿠팡 헤더 불필요) ──
  if (req.url === '/naver-check' && req.method === 'POST') {
    try {
      const rawBody = await readRequestBody(req);
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
      const targetUrl = parsedBody && typeof parsedBody.url === 'string' ? parsedBody.url : '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url (http/https) is required' }));
        return;
      }

      const startTime = Date.now();
      const result = await fetchNaverUrl(targetUrl);
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] NAVER ${targetUrl.slice(0, 80)} → ${result.statusCode} (${duration}ms, ${result.html.length}B${result.truncated ? ' trunc' : ''})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ statusCode: result.statusCode, html: result.html }));
    } catch (err) {
      console.error(`[${new Date().toISOString()}] NAVER ERROR:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'naver fetch failed: ' + err.message }));
    }
    return;
  }

  // ── 쿠팡 API 키 (헤더에서 받음) ──
  const accessKey = req.headers['x-coupang-access-key'];
  const secretKey = req.headers['x-coupang-secret-key'];
  const vendorId = req.headers['x-coupang-vendor-id'] || ''; // X-Requested-By용

  if (!accessKey || !secretKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-Coupang-Access-Key or X-Coupang-Secret-Key headers' }));
    return;
  }

  // ── 요청 파싱 ──
  // URL: /proxy/v2/providers/seller_api/... → 쿠팡 API 경로
  const proxyPrefix = '/proxy';
  if (!req.url.startsWith(proxyPrefix)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Use /proxy/v2/... path' }));
    return;
  }

  const coupangUrl = new URL(req.url.replace(proxyPrefix, ''), 'http://localhost');
  const coupangPath = coupangUrl.pathname;
  const coupangQuery = coupangUrl.search.replace('?', '');

  // Body 읽기
  let body = '';
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }

  // ── 쿠팡 API 호출 ──
  try {
    const startTime = Date.now();
    const result = await callCoupangApi(
      req.method,
      coupangPath,
      coupangQuery,
      body || undefined,
      accessKey,
      secretKey,
      vendorId,
    );
    const duration = Date.now() - startTime;

    // ★ FMS 비동기 상태 확인 + 쿠폰 적용 응답 로깅 (디버깅)
    const isFmsPath = coupangPath.includes('/fms/') || coupangPath.includes('/coupons/');
    if (isFmsPath || result.statusCode !== 200) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${coupangPath} → ${result.statusCode} (${duration}ms) BODY: ${result.body.slice(0, 800)}`);
    } else {
      console.log(`[${new Date().toISOString()}] ${req.method} ${coupangPath} → ${result.statusCode} (${duration}ms)`);
    }

    res.writeHead(result.statusCode, {
      'Content-Type': 'application/json',
      'X-Proxy-Duration': String(duration),
    });
    res.end(result.body);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${coupangPath}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Coupang API Proxy running on port ${PORT}`);
  console.log(`   Region: ${process.env.FLY_REGION || 'local'}`);
  console.log(`   Auth: ${PROXY_SECRET ? 'enabled' : 'DISABLED (set PROXY_SECRET!)'}`);
});
