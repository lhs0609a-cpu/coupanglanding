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
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const COUPANG_API_BASE = 'https://api-gateway.coupang.com';

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

    // body를 Buffer로 변환하여 정확한 Content-Length 계산
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const bodyBuffer = bodyStr ? Buffer.from(bodyStr, 'utf-8') : null;

    const headers = {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': vendorId || accessKey, // 쿠팡 API 필수 헤더
    };

    // Content-Length 명시 (chunked encoding 방지 — 쿠팡 API 호환성)
    if (bodyBuffer) {
      headers['Content-Length'] = String(bodyBuffer.length);
    }

    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };

    console.log(`[proxy→coupang] ${method} ${parsed.pathname}${parsed.search} Content-Length: ${bodyBuffer ? bodyBuffer.length : 0}`);
    if (bodyBuffer && bodyBuffer.length > 0) {
      console.log(`[proxy→coupang] body: ${bodyStr.slice(0, 500)}`);
    }

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        console.log(`[proxy←coupang] ${res.statusCode} ${method} ${path} body: ${responseBody.slice(0, 500)}`);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Coupang API timeout (30s)'));
    });

    // body를 end()에 직접 전달 (Content-Length와 일치 보장)
    if (bodyBuffer) {
      req.end(bodyBuffer);
    } else {
      req.end();
    }
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
    console.log(`[${new Date().toISOString()}] 요청: ${req.method} ${coupangPath}${coupangQuery ? '?' + coupangQuery : ''} body-length=${body ? body.length : 0}`);

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

    console.log(`[${new Date().toISOString()}] 응답: ${req.method} ${coupangPath} → ${result.statusCode} (${duration}ms) body: ${result.body.slice(0, 300)}`);

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
