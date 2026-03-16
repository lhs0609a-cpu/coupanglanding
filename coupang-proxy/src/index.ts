import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const TARGET = 'https://api-gateway.coupang.com';

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Outbound IP check — 쿠팡 Wing 화이트리스트에 등록할 실제 IP 확인
app.get('/check-ip', async (c) => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json() as { ip: string };
    return c.json({ outboundIp: data.ip, timestamp: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Auth middleware for /proxy/*
app.use('/proxy/*', async (c, next) => {
  const received = c.req.header('x-proxy-secret') || '(empty)';
  if (!PROXY_SECRET || received !== PROXY_SECRET) {
    console.log(`[proxy-auth] REJECTED - expected length=${PROXY_SECRET.length}, received length=${received.length}, match=${received === PROXY_SECRET}`);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Reverse proxy
app.all('/proxy/*', async (c) => {
  const reqUrl = new URL(c.req.url);
  const targetPath = reqUrl.pathname.replace(/^\/proxy/, '');
  const targetUrl = `${TARGET}${targetPath}${reqUrl.search}`;

  // Clean up request headers
  const reqHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'x-proxy-secret' && k !== 'connection' && k !== 'accept-encoding') {
      reqHeaders[key] = value;
    }
  });

  // 수신 헤더 전체 덤프
  const allHeaders: string[] = [];
  c.req.raw.headers.forEach((value, key) => {
    allHeaders.push(`${key}: ${value.slice(0, 80)}`);
  });
  console.log(`[proxy] ${c.req.method} ${targetPath}${reqUrl.search}`);
  console.log(`[proxy] Incoming headers (${allHeaders.length}): ${allHeaders.join(' | ')}`);
  console.log(`[proxy] Forwarding headers (${Object.keys(reqHeaders).length}): ${Object.keys(reqHeaders).join(', ')}`);

  const bodyMethods = ['POST', 'PUT', 'PATCH'];
  const fetchInit: RequestInit = { method: c.req.method, headers: reqHeaders };
  if (bodyMethods.includes(c.req.method)) {
    fetchInit.body = await c.req.text();
  }

  const res = await fetch(targetUrl, fetchInit);

  const body = await res.text();
  console.log(`[proxy] -> ${res.status} (${body.length} bytes)`);
  if (res.status >= 400) {
    console.log(`[proxy] ERROR body: ${body.slice(0, 500)}`);
  }

  try {
    return c.json(JSON.parse(body), res.status as 200);
  } catch {
    // JSON 파싱 실패 시 원문 텍스트로 에러 반환
    return c.json({ error: 'Invalid JSON response from upstream', body: body.slice(0, 500) }, res.status as 200);
  }
});

const port = Number(process.env.PORT) || 8080;
console.log(`Coupang API Proxy listening on port ${port}`);
serve({ fetch: app.fetch, port });
