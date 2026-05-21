/**
 * 로컬 HTTP 페어링 서버. 웹(메가로드 대시보드)이 사용자의 Supabase 세션을
 * localhost로 POST하면 데스크탑이 받아 .session.json 으로 저장한다.
 *
 * 흐름:
 *  1) 앱 시작 시 random port + nonce 생성
 *  2) UI "메가로드 자동 연결" → shell.openExternal(webOrigin + activate?port=&nonce=)
 *  3) 웹 페이지가 fetch('http://127.0.0.1:<port>/pair') with { nonce, access_token, ... }
 *  4) 서버가 nonce 검증 → onPair 콜백 → UI 갱신
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ALLOWED_ORIGIN_RE = /^https?:\/\/(?:localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.megaload\.co\.kr|.*\.vercel\.app)$/i;

export async function startPairServer({ onPair, allowedOriginRe = ALLOWED_ORIGIN_RE } = {}) {
  const nonce = randomUUID();
  const state = { paired: false, nonce, port: 0 };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const corsOk = !origin || allowedOriginRe.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': corsOk ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    };

    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, paired: state.paired }));
    }

    if (req.method === 'POST' && req.url === '/pair') {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const chunks = [];
      let total = 0;
      for await (const c of req) {
        total += c.length;
        if (total > 64 * 1024) { res.writeHead(413, cors); return res.end('payload too large'); }
        chunks.push(c);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { res.writeHead(400, cors); return res.end('invalid json'); }

      if (body.nonce !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }
      if (!body.access_token || !body.refresh_token) {
        res.writeHead(400, cors); return res.end('missing tokens');
      }

      try {
        await onPair({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_at: body.expires_at,
        });
        state.paired = true;
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, cors);
        return res.end('pair error: ' + (e?.message || e));
      }
    }

    res.writeHead(404, cors); res.end('not found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  state.port = server.address().port;

  return {
    port: state.port,
    nonce: state.nonce,
    isPaired: () => state.paired,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
