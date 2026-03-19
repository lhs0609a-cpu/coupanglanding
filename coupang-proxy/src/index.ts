import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createHmac } from 'node:crypto';

const app = new Hono();
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const TARGET = 'https://api-gateway.coupang.com';

// ─── HMAC 서명 생성 (쿠팡 CEA 방식) ────────────────────────

function generateCoupangSignature(
  method: string,
  path: string,
  query: string,
  secretKey: string,
  accessKey: string,
): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(2);
  const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const HH = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

  const message = `${datetime}${method}${path}${query}`;
  const signature = createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

// ─── Health / IP check ──────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/check-ip', async (c) => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = (await res.json()) as { ip: string };
    return c.json({ outboundIp: data.ip, timestamp: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ─── Auth middleware for /proxy/* ────────────────────────────

app.use('/proxy/*', async (c, next) => {
  const received = c.req.header('x-proxy-secret') || '(empty)';
  if (!PROXY_SECRET || received !== PROXY_SECRET) {
    console.log(
      `[proxy-auth] REJECTED - expected length=${PROXY_SECRET.length}, received length=${received.length}`,
    );
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// ─── Reverse proxy with HMAC signing ────────────────────────

app.all('/proxy/*', async (c) => {
  const reqUrl = new URL(c.req.url);
  const targetPath = reqUrl.pathname.replace(/^\/proxy/, '');
  const targetQuery = reqUrl.search.replace('?', '');
  const targetUrl = `${TARGET}${targetPath}${reqUrl.search}`;

  // 클라이언트에서 전달받은 쿠팡 API 키
  const accessKey = c.req.header('x-coupang-access-key') || '';
  const secretKey = c.req.header('x-coupang-secret-key') || '';

  if (!accessKey || !secretKey) {
    return c.json({ error: 'Missing X-Coupang-Access-Key or X-Coupang-Secret-Key headers' }, 400);
  }

  // HMAC 서명 생성
  const authorization = generateCoupangSignature(
    c.req.method,
    targetPath,
    targetQuery,
    secretKey,
    accessKey,
  );

  // 쿠팡 API로 보낼 헤더 구성
  const reqHeaders: Record<string, string> = {
    Authorization: authorization,
    'Content-Type': 'application/json;charset=UTF-8',
  };

  console.log(`[proxy] ${c.req.method} ${targetPath}${reqUrl.search}`);

  const bodyMethods = ['POST', 'PUT', 'PATCH'];
  const fetchInit: RequestInit = { method: c.req.method, headers: reqHeaders };
  if (bodyMethods.includes(c.req.method)) {
    fetchInit.body = await c.req.text();
  }

  try {
    const startTime = Date.now();
    const res = await fetch(targetUrl, fetchInit);
    const body = await res.text();
    const duration = Date.now() - startTime;

    console.log(`[proxy] -> ${res.status} (${body.length} bytes, ${duration}ms)`);
    if (res.status >= 400) {
      console.log(`[proxy] ERROR body: ${body.slice(0, 500)}`);
    }

    try {
      return c.json(JSON.parse(body), res.status as 200);
    } catch {
      return c.json(
        { error: 'Invalid JSON response from upstream', body: body.slice(0, 500) },
        res.status as 200,
      );
    }
  } catch (err) {
    console.error(`[proxy] FETCH ERROR: ${err}`);
    return c.json({ error: `Proxy error: ${err}` }, 502);
  }
});

const port = Number(process.env.PORT) || 8080;
console.log(`Coupang API Proxy listening on port ${port}`);
serve({ fetch: app.fetch, port });
