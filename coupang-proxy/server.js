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

/** 이미지 상한 — 상세컷은 500KB 를 넘는 일이 흔하다(HTML 상한으로는 잘린다). */
const NAVER_MAX_IMAGE_BYTES = 10_000_000;

/**
 * 이미지 요청용 헤더 — 문서 탐색(document/navigate)이 아니라 이미지 로드로 보이게 한다.
 * 페이지 헤더 그대로 이미지를 받으면 "문서를 여는 척하며 jpg 를 받는" 모양이라 굳이 티가 난다.
 */
const NAVER_IMAGE_HEADERS = {
  ...NAVER_BROWSER_HEADERS,
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'same-site',
  Referer: 'https://smartstore.naver.com/',
};
delete NAVER_IMAGE_HEADERS['Sec-Fetch-User'];
delete NAVER_IMAGE_HEADERS['Upgrade-Insecure-Requests'];

/**
 * 네이버로 GET 한 번 — **바이트 그대로** 돌려준다.
 * ---------------------------------------------------------------------------
 * ★ 왜 생겼나(2026-09-08): fetchNaverUrl 은 받은 것을 toString('utf8') 해서 돌려준다.
 *   HTML 에는 맞지만 이미지에는 치명적이다 — 바이너리가 문자열로 바뀌며 깨진다
 *   (실측: 17,832바이트 jpg 가 16,891자로 나왔다). 게다가 상한이 500KB 라 상세컷이 잘린다.
 *   그래서 "바이트를 바이트로" 가져오는 길을 따로 낸다. 기존 fetchNaverUrl 은 이 함수를
 *   감싸는 얇은 껍데기가 되므로 동작이 달라지지 않는다.
 */
function fetchNaverRaw(targetUrl, opts = {}, redirectCount = 0) {
  const maxBytes = opts.maxBytes || NAVER_MAX_HTML_BYTES;
  const headers = opts.headers || NAVER_BROWSER_HEADERS;
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
      headers: { ...headers, Host: parsed.hostname },
    };

    const req = https.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectCount >= NAVER_MAX_REDIRECTS) {
          reject(new Error('too many redirects'));
          return;
        }
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        fetchNaverRaw(nextUrl, opts, redirectCount + 1).then(resolve, reject);
        return;
      }

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
        if (bytes + chunk.length > maxBytes) {
          chunks.push(chunk.slice(0, maxBytes - bytes));
          truncated = true;
          bytes = maxBytes;
          res.destroy();
          return;
        }
        chunks.push(chunk);
        bytes += chunk.length;
      });
      stream.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || '',
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

/**
 * 기존 계약 그대로 — HTML 문자열을 돌려준다. 내부만 fetchNaverRaw 로 옮겼다.
 * (품절 동기화가 이 함수를 쓰므로 반환 모양·상한·헤더를 바꾸지 않는다)
 */
async function fetchNaverUrl(targetUrl, redirectCount = 0) {
  const r = await fetchNaverRaw(
    targetUrl,
    { maxBytes: NAVER_MAX_HTML_BYTES, headers: NAVER_BROWSER_HEADERS },
    redirectCount,
  );
  return { statusCode: r.statusCode, html: r.buffer.toString('utf8'), truncated: r.truncated };
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

  /**
   * ── /naver-image: 네이버 CDN 이미지를 **바이트 그대로** 중계 ──
   * ---------------------------------------------------------------------------
   * 왜 필요한가: 네이버는 Vercel IP 를 403 으로 막는다(그래서 이 프록시가 있다).
   * 소싱 카탈로그에서 고른 상품을 GPU·도우미 없이 서버에서 바로 등록하려면
   * 이미지 원본을 서버가 손에 넣어야 하는데, /naver-check 는 응답을 utf8 문자열로
   * 바꾸므로 이미지가 깨지고(실측: 17,832B → 16,891자) 상한 500KB 에서 잘린다.
   *
   * 응답은 base64 가 아니라 **바이너리 그대로** 돌려준다 — 33% 부풀리기와
   * 인코딩/디코딩 왕복이 통째로 없어진다. 호출측은 arrayBuffer() 로 받으면 된다.
   * 원본 상태코드는 X-Naver-Status 헤더로 따로 알린다(중계 성공 ≠ 네이버 성공).
   *
   * ⚠️ 오픈 프록시가 되지 않도록 **호스트 화이트리스트 필수**. 시크릿이 있어도
   *    임의 URL 을 대신 받아 주는 창구를 열어 두지 않는다(/fwd 와 같은 원칙).
   */
  if (req.url === '/naver-image' && req.method === 'POST') {
    const IMG_ALLOWED_HOST_SUFFIXES = ['.pstatic.net', '.naver.net', '.naver.com'];
    try {
      const rawBody = await readRequestBody(req);
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const targetUrl = payload && typeof payload.url === 'string' ? payload.url : '';
      let parsedTarget;
      try {
        parsedTarget = new URL(targetUrl);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url (http/https) is required' }));
        return;
      }
      if (parsedTarget.protocol !== 'https:') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'https only' }));
        return;
      }
      const host = parsedTarget.hostname.toLowerCase();
      if (!IMG_ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'host not allowed: ' + host }));
        return;
      }

      const startTime = Date.now();
      const result = await fetchNaverRaw(targetUrl, {
        maxBytes: NAVER_MAX_IMAGE_BYTES,
        headers: NAVER_IMAGE_HEADERS,
      });
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] NAVER-IMG ${targetUrl.slice(0, 80)} → ${result.statusCode}`
        + ` (${duration}ms, ${result.buffer.length}B${result.truncated ? ' TRUNC' : ''})`);

      if (result.statusCode !== 200) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'naver returned ' + result.statusCode, statusCode: result.statusCode }));
        return;
      }
      // 잘린 이미지는 성공으로 넘기지 않는다 — 깨진 jpg 를 쿠팡에 올리는 것이 더 나쁘다.
      if (result.truncated) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'image too large (> ' + NAVER_MAX_IMAGE_BYTES + ' bytes)' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': result.contentType || 'application/octet-stream',
        'Content-Length': result.buffer.length,
        'X-Naver-Status': String(result.statusCode),
      });
      res.end(result.buffer);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] NAVER-IMG ERROR:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'naver image fetch failed: ' + err.message }));
    }
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

  // ── /fwd: 채널 API 범용 포워더 (11번가·ESM·롯데온·네이버 커머스API 공용) ──
  // 국내 오픈마켓 오픈API 는 "호출 서버 IP" 를 화이트리스트에 등록해야 한다.
  // Vercel 은 고정 IP 가 없으므로 이 앱의 egress IP(209.71.88.111)를 단일 출구로 삼는다.
  //
  // 응답을 text 로 돌려주는 이유: 11번가 셀러 API 는 XML 이 기본이라 JSON 으로 파싱하면 깨진다.
  // 파싱은 호출측(어댑터) 책임.
  //
  // 오픈 프록시가 되지 않도록 호스트 화이트리스트 필수. 새 채널은 여기만 늘린다.
  if (req.url === '/fwd' && req.method === 'POST') {
    const FWD_ALLOWED_HOSTS = new Set([
      'openapi.11st.co.kr',   // 11번가 셀러 오픈API
      'apis.openapi.sk.com',  // SK Open API (11번가 카테고리)
    ]);
    const FWD_TIMEOUT_MS = 30000;
    const FWD_MAX_BODY = 2000000;

    try {
      const rawBody = await readRequestBody(req);
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const targetUrl = payload && typeof payload.url === 'string' ? payload.url : '';
      const method = (payload && payload.method) || 'GET';
      const headers = (payload && payload.headers) || {};
      const outBody = payload && payload.body;

      let host;
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'https:') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'https only' }));
          return;
        }
        host = parsed.hostname;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid url' }));
        return;
      }

      if (!FWD_ALLOWED_HOSTS.has(host)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'host not allowed: ' + host }));
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FWD_TIMEOUT_MS);
      const startTime = Date.now();
      try {
        const upstream = await fetch(targetUrl, {
          method,
          headers,
          ...(outBody != null && method !== 'GET' && method !== 'HEAD' ? { body: outBody } : {}),
          signal: controller.signal,
        });
        clearTimeout(timer);
        // 11번가 셀러 API 는 EUC-KR 로 응답한다. text() 는 UTF-8 로 디코딩하므로
        // 그대로 쓰면 한글(상품명·오류 메시지)이 전부 깨진다. charset 을 보고 디코딩한다.
        const rawCt = upstream.headers.get('content-type') || '';
        const csMatch = rawCt.match(/charset=["']?([\w-]+)/i);
        const charset = (csMatch ? csMatch[1] : 'utf-8').toLowerCase();
        const buf = await upstream.arrayBuffer();
        let text;
        try {
          text = new TextDecoder(charset).decode(buf);
        } catch {
          // 알 수 없는 charset 이면 UTF-8 로 폴백 (깨지더라도 응답 자체는 돌려준다)
          text = new TextDecoder('utf-8').decode(buf);
        }
        text = text.slice(0, FWD_MAX_BODY);
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] FWD ${method} ${host} → ${upstream.status} (${duration}ms, ${text.length}B, ${charset})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: upstream.status,
          contentType: upstream.headers.get('content-type') || '',
          body: text,
        }));
      } catch (err) {
        clearTimeout(timer);
        const isTimeout = err && err.name === 'AbortError';
        const msg = isTimeout ? `upstream timeout (${FWD_TIMEOUT_MS / 1000}s)` : String((err && err.message) || err);
        console.error(`[${new Date().toISOString()}] FWD ERROR ${host}:`, msg);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg, transient: isTimeout }));
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] FWD FATAL:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'fwd failed: ' + err.message }));
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
