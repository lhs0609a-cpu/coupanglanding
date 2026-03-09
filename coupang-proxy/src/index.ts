import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const TARGET = 'https://api-gateway.coupang.com';

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth middleware for /proxy/*
app.use('/proxy/*', async (c, next) => {
  if (!PROXY_SECRET || c.req.header('x-proxy-secret') !== PROXY_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Reverse proxy
app.all('/proxy/*', async (c) => {
  const reqUrl = new URL(c.req.url);
  const targetPath = reqUrl.pathname.replace(/^\/proxy/, '');
  const targetUrl = `${TARGET}${targetPath}${reqUrl.search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  headers.delete('x-proxy-secret');

  const res = await fetch(targetUrl, {
    method: c.req.method,
    headers,
  });

  const body = await res.arrayBuffer();
  const responseHeaders = new Headers(res.headers);
  responseHeaders.delete('transfer-encoding');

  return new Response(body, {
    status: res.status,
    headers: responseHeaders,
  });
});

const port = Number(process.env.PORT) || 8080;
console.log(`Coupang API Proxy listening on port ${port}`);
serve({ fetch: app.fetch, port });
