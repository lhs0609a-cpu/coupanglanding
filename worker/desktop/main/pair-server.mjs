/**
 * 로컬 HTTP 서버. 웹(메가로드 대시보드)과 도우미 사이의 직접 통로.
 *
 * ① 페어링 — 웹이 사용자의 Supabase 세션을 localhost로 POST하면 .session.json 으로 저장.
 *  1) 앱 시작 시 random port + nonce 생성
 *  2) UI "메가로드 자동 연결" → shell.openExternal(webOrigin + activate?port=&nonce=)
 *  3) 웹 페이지가 fetch('http://127.0.0.1:<port>/pair') with { nonce, access_token, ... }
 *  4) 서버가 nonce 검증 → onPair 콜백 → UI 갱신
 *
 * ② 올인원 결과 직독 — 웹 올인원 등록 화면이 폴더를 다시 고르지 않아도 되게,
 *    도우미가 방금 생성한 결과(_allinone.generated.jsonl)와 이미지를 여기서 그대로 읽어간다.
 *    ⭐ 왜 서버 업로드가 아니라 localhost 인가: 파일이 이미 같은 PC 에 있는데 썸네일을
 *       Storage 에 올렸다가 웹이 도로 내려받는 건 순수 낭비다(등록도 안 할 상품까지).
 *       localhost 직독이면 추가 스토리지·전송 비용이 0 이고 폴더 선택도 사라진다.
 *    포트·nonce 는 하트비트에 실려 웹이 발견한다(worker-status → local_endpoint).
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, extname } from 'node:path';

const ALLOWED_ORIGIN_RE = /^https?:\/\/(?:localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.megaload\.co\.kr|.*\.vercel\.app)$/i;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};
const GEN_FILE = '_allinone.generated.jsonl';

/**
 * 요청 경로가 정말 root 안인지 — 경로 탈출(../ 등) 차단.
 * 웹에 로컬 파일을 열어 주는 통로이므로 이 게이트가 유일한 방어선이다.
 *
 * 절대경로도 받는다: 생성 레코드(_allinone.generated.jsonl)의 mainImage/detailImages 가
 * 절대경로라 웹이 그대로 넘긴다. 절대경로든 상대경로든 최종적으로 root 하위인지로만 판정한다.
 */
function jail(root, p) {
  if (!p || p.includes('\0')) return null;
  const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rl = relative(resolve(root), abs);
  if (!rl || rl.startsWith('..') || isAbsolute(rl)) return null;
  return abs;
}

export async function startPairServer({
  onPair,
  allowedOriginRe = ALLOWED_ORIGIN_RE,
  // 마지막으로 올인원 생성을 끝낸 폴더의 절대경로를 돌려주는 함수(없으면 null).
  getAllinoneFolder = () => null,
  // 웹 '최신으로 업데이트' 버튼 → electron-updater 즉시 확인/적용 킥(없으면 미지원).
  onCheckUpdate = null,
} = {}) {
  const nonce = randomUUID();
  const state = { paired: false, nonce, port: 0 };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const corsOk = !origin || allowedOriginRe.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': corsOk ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      // Chrome Private Network Access — HTTPS 페이지가 사설망(127.0.0.1)을 부를 때
      // 프리플라이트에 이 헤더가 없으면 차단된다. /pair 가 이미 이 경로로 동작 중.
      'Access-Control-Allow-Private-Network': 'true',
    };

    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, paired: state.paired }));
    }

    // 웹 '최신으로 업데이트' — electron-updater 즉시 확인/적용 킥. nonce 로 보호.
    if (req.method === 'POST' && req.url?.startsWith('/update')) {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.searchParams.get('nonce') !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }
      if (typeof onCheckUpdate !== 'function') {
        res.writeHead(501, cors); return res.end('update not supported');
      }
      try { onCheckUpdate(); } catch { /* 킥 실패해도 200 — 앱 로그로 진단 */ }
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // ── 올인원 결과 직독 ───────────────────────────────────────────────────
    if (req.method === 'GET' && req.url?.startsWith('/allinone/')) {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.searchParams.get('nonce') !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }
      const folder = getAllinoneFolder();
      if (!folder) {
        res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '아직 올인원 생성을 실행한 폴더가 없습니다.' }));
      }

      // 생성 결과 목록 — 웹이 폴더를 고르지 않고도 카드를 채울 수 있게.
      if (u.pathname === '/allinone/manifest') {
        try {
          const text = await readFile(join(folder, GEN_FILE), 'utf8');
          const records = text.split('\n').map((l) => l.trim()).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
          const st = await stat(join(folder, GEN_FILE));
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ folder, generatedAt: st.mtime.toISOString(), records }));
        } catch (e) {
          res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `${GEN_FILE} 를 읽을 수 없습니다: ${e.message}`, folder }));
        }
      }

      // 상품 폴더의 이미지 파일 목록 — 웹이 기존 분류 로직(대표/상세/리뷰/정보)을 그대로
      // 돌리게 한다. 워커 레코드엔 대표·상세만 있어 리뷰·정보컷이 빠지는 걸 이걸로 메운다.
      // 재귀 1단계까지만(product_*/main_images 등 흔한 한 겹 구조), 이미지 확장자만.
      if (u.pathname === '/allinone/list') {
        const dirAbs = jail(folder, u.searchParams.get('p') || '');
        if (!dirAbs) { res.writeHead(400, cors); return res.end('bad path'); }
        try {
          const out = [];
          const walk = async (abs, depth) => {
            for (const ent of await readdir(abs, { withFileTypes: true })) {
              if (ent.name.startsWith('.')) continue;
              const child = join(abs, ent.name);
              if (ent.isDirectory()) { if (depth > 0) await walk(child, depth - 1); }
              else if (MIME[extname(ent.name).toLowerCase()]) {
                out.push(relative(folder, child).split('\\').join('/'));
              }
            }
          };
          await walk(dirAbs, 1);
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ files: out }));
        } catch (e) {
          res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: e.message }));
        }
      }

      // 로컬 이미지 1장 — 카드 썸네일 표시·등록 업로드 모두 이걸로 읽는다.
      if (u.pathname === '/allinone/file') {
        const abs = jail(folder, u.searchParams.get('p') || '');
        if (!abs) { res.writeHead(400, cors); return res.end('bad path'); }
        try {
          const st = await stat(abs);
          if (!st.isFile()) throw new Error('not a file');
          res.writeHead(200, {
            ...cors,
            'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
            'Content-Length': st.size,
            'Cache-Control': 'no-store',
          });
          return createReadStream(abs).pipe(res);
        } catch {
          res.writeHead(404, cors); return res.end('not found');
        }
      }

      res.writeHead(404, cors); return res.end('not found');
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
