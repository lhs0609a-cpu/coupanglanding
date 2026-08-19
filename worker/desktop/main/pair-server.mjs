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
import { stat, readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 웹에서 오는 요청 중 허용할 오리진.
 * ⚠️ `(?:[\w-]+\.)*` 로 **정점 도메인(apex)까지** 포함한다.
 *    예전엔 `.*\.megaload\.co\.kr` 이라 앞에 점이 필수였다 → `www.megaload.co.kr` 은 통과하지만
 *    **`megaload.co.kr`(www 없음)은 거부**됐다. 둘 다 살아있는 별칭이라, www 없이 접속한 PC 에서만
 *    CORS 가 필요한 호출이 전부 막혔다(실측 2026-07-30):
 *      · /health → nonce 미제공 → 로컬 스캔 실패
 *      · /allinone/* → 403 → "이 PC 도우미 미연결" + 업로드 생성 차단
 *    반면 CORS 가 필요 없는 검사(서버 하트비트 배지, no-cors 누끼 프로브)는 전부 초록이라
 *    "연결은 됐는데 진행이 안 되는" 모습으로 보였다.
 */
const ALLOWED_ORIGIN_RE = /^https?:\/\/(?:localhost(:\d+)?|127\.0\.0\.1(:\d+)?|(?:[\w-]+\.)*megaload\.co\.kr|(?:[\w-]+\.)*vercel\.app)$/i;

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

/**
 * 발견용 고정 포트 대역 — 웹이 서버(DB)를 거치지 않고 127.0.0.1 에서 직접 도우미를 찾는다.
 * ⚠️ 이 값을 바꾸면 웹의 DISCOVERY_PORTS(src/lib/megaload/allinone-local.ts)도 같이 바꿔야 한다.
 */
export const DISCOVERY_PORTS = [47690, 47691, 47692, 47693, 47694, 47695, 47696, 47697, 47698, 47699];

export async function startPairServer({
  onPair,
  allowedOriginRe = ALLOWED_ORIGIN_RE,
  // 마지막으로 올인원 생성을 끝낸 폴더의 절대경로를 돌려주는 함수(없으면 null).
  getAllinoneFolder = () => null,
  // 웹 '최신으로 업데이트' 버튼 → electron-updater 즉시 확인/적용 킥(없으면 미지원).
  onCheckUpdate = null,
  // 웹 업로드 생성 → 임시폴더를 올인원 생성. onGenerate(folder,{noThumb,onDone}). 없으면 미지원.
  onGenerate = null,
  // 업로드·생성물을 둘 곳. tmpdir 은 재시작·디스크정리에 통째로 사라져(실측 ENOENT) 방금 만든
  // 결과까지 날아갔다 → 앱이 재시작하면 lastAllinoneFolder 가 죽은 경로를 가리켜 manifest 404,
  // 웹 카드의 이미지·옵션이 전부 끊긴다. userData 하위(영속)로 받아 재시작에도 살아남게 한다.
  dataDir = null,
  // /health 가 돌려줄 앱 버전(웹이 구버전 판별에 쓴다). 없으면 null.
  appVersion = null,
  // 네이버 소싱 수집 서비스(관리자 전용). 웹 대시보드가 이 통로로 도우미를 조종한다.
  //   { getStatus, getLogs, setWindows, start, stop, testOne, showWindow } | null
  naverIngest = null,
} = {}) {
  const nonce = randomUUID();
  const state = { paired: false, nonce, port: 0 };

  // 웹 업로드 생성 세션. sessionId → { dir, state, code, error }.
  //   uploading → (generate) → generating → done|error. 완료 폴더는 lastAllinoneFolder 로 승격돼
  //   기존 /allinone/manifest·file·list 가 그대로 읽는다(읽기 경로 재사용).
  // 영속 위치 우선(dataDir), 없으면 예전처럼 tmpdir 폴백(하위호환).
  const uploadBase = join(dataDir || tmpdir(), 'megaload-allinone');
  const sessions = new Map();
  const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // 파일 1장 상한(대용량 원본 방어)

  const readBody = (req, cap) => new Promise((resolve, reject) => {
    const chunks = []; let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > cap) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const corsOk = !origin || allowedOriginRe.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': corsOk ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      // 프리플라이트 캐시를 넉넉히 — 업로드는 파일 1개당 POST 1회라 사진 수천 장이면
      // 프리플라이트 왕복만으로도 체감 지연이 된다(같은 PC 라도 요청 오버헤드는 남는다).
      'Access-Control-Max-Age': '86400',
      // Chrome Private Network Access — HTTPS 페이지가 사설망(127.0.0.1)을 부를 때
      // 프리플라이트에 이 헤더가 없으면 차단된다. /pair 가 이미 이 경로로 동작 중.
      'Access-Control-Allow-Private-Network': 'true',
    };

    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    // ── 발견(discovery) 창구 ────────────────────────────────────────────────
    // 웹이 "지금 이 PC 의 도우미"를 확정하는 유일한 경로.
    //   · 파라미터 없음 · 모든 버전에 존재 — 발견용 프로브가 지켜야 할 두 조건.
    //   · app/version 으로 다른 로컬 서비스와 구분하고, nonce 를 **직접** 돌려준다.
    //     예전엔 nonce 를 서버 하트비트(DB)로만 받을 수 있어, 2대를 켜면 다른 PC 의 nonce 로
    //     접속해 401 이 났다. 여기서 주면 그 추측 자체가 사라진다.
    //   · 보안: 아래 cors 는 우리 도메인(allowedOriginRe)에만 열려 있다. 그 오리진은 어차피
    //     하트비트로 nonce 를 받을 수 있었으므로 노출 범위는 그대로다.
    if (req.method === 'GET' && (req.url === '/health' || req.url?.startsWith('/health?'))) {
      // nonce 는 **우리 도메인에서 온 요청에만** 준다(Origin 헤더가 실제로 일치할 때).
      //   Origin 없는 요청(curl 등 로컬 프로세스)에는 신원만 알려주고 열쇠는 주지 않는다.
      const trusted = !!origin && allowedOriginRe.test(origin);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, app: 'megaload-desktop', version: appVersion || null, paired: state.paired,
        ...(trusted ? { port: state.port, nonce: state.nonce } : {}),
      }));
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

    // ── 네이버 소싱 수집 (관리자 전용) ──────────────────────────────────────
    // 수집은 이 PC 의 내장 크롬으로만 가능하다(서버는 datacenter IP 라 네이버에 차단됨).
    // 그래서 웹 화면은 "조종석"이고 실행 주체는 여기다. 창 풀은 service.mjs 가 단독
    // 소유하므로, 앱 탭에서 조작하든 웹에서 조작하든 수집기는 한 벌만 돈다.
    //
    // 관리자 판정은 도우미에 로그인된 계정의 role 로 한다(service 안에서 검증) — 웹 화면을
    // 숨기는 건 표시용일 뿐이다.
    if (req.url?.startsWith('/naver-ingest/')) {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.searchParams.get('nonce') !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }
      if (!naverIngest) { res.writeHead(501, cors); return res.end('naver-ingest not supported'); }

      const json = (code, obj) => {
        res.writeHead(code, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const readJson = async () => {
        try { return JSON.parse((await readBody(req, 1_000_000)).toString('utf8') || '{}'); }
        catch { return {}; }
      };

      try {
        // 상태 + 최근 로그. 웹은 이것만 폴링하면 창 상태·진행·결과를 전부 본다.
        if (req.method === 'GET' && u.pathname === '/naver-ingest/status') {
          const since = Number(u.searchParams.get('since')) || 0;
          return json(200, { ...naverIngest.getStatus(), logs: naverIngest.getLogs(since) });
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/windows') {
          const { count } = await readJson();
          return json(200, { ok: true, count: naverIngest.setWindows(count) });
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/start') {
          return json(200, await naverIngest.start());
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/stop') {
          await naverIngest.stop();
          return json(200, { ok: true });
        }
        // ⚠️ 기다리지 않고 즉시 200 을 준다 — 캡차를 사람이 푸는 경우 몇 분이 걸려서
        //   웹 fetch 가 먼저 끊긴다. 결과는 로그로 흘러가고 웹은 status 폴링으로 본다.
        if (req.method === 'POST' && u.pathname === '/naver-ingest/test') {
          const { url } = await readJson();
          if (!url) return json(400, { ok: false, error: '상품 URL 이 필요합니다.' });
          // 관리자 검증은 동기적으로 먼저 터지게 한다(권한 오류를 웹이 즉시 보도록).
          if (!naverIngest.getStatus().isAdmin) return json(403, { ok: false, error: '관리자 계정만 사용할 수 있습니다.' });
          naverIngest.testOne(url).catch(() => { /* 결과는 로그로 */ });
          return json(200, { ok: true, started: true });
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/show') {
          const { index } = await readJson();
          return json(200, { ok: naverIngest.showWindow(Number(index) || 0) });
        }
        // 네이버 로그인 — 목록 페이지의 전제 조건. 창을 띄우고 사람이 직접 로그인한다.
        // (계정 정보는 우리 쪽으로 오지 않는다 — 창 안에서 네이버로 바로 간다)
        if (req.method === 'POST' && u.pathname === '/naver-ingest/login') {
          return json(200, await naverIngest.openNaverLogin());
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/logout') {
          return json(200, await naverIngest.naverLogout());
        }
        // 자동 로그인 — 계정을 이 PC 의 OS 암호저장소에 넣어 두면 세션이 끊겨도 알아서 복구한다.
        // ★ 비밀번호는 이 요청(127.0.0.1)에서 도우미로 한 번 들어가고 끝이다. 응답·상태·로그
        //   어디로도 다시 나오지 않는다(naver-credentials.mjs 규칙 ③).
        if (req.method === 'POST' && u.pathname === '/naver-ingest/credentials') {
          const { id, pw } = await readJson();
          return json(200, await naverIngest.saveNaverCredential({ id, pw }));
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/credentials/clear') {
          return json(200, naverIngest.clearNaverCredential());
        }
        if (req.method === 'GET' && u.pathname === '/naver-ingest/credentials') {
          return json(200, await naverIngest.credentialStatus());
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/login/auto') {
          return json(200, await naverIngest.autoLoginNow({ byHuman: true }));
        }

        // ── 카테고리 선택 수집 ──────────────────────────────────────────
        // 대분류는 상수라 즉답, 하위는 캐시에 없으면 그 카테고리 페이지를 한 번 열어 발견한다.
        if (req.method === 'GET' && u.pathname === '/naver-ingest/categories') {
          const parent = u.searchParams.get('parent') || null;
          const force = u.searchParams.get('force') === '1';
          return json(200, await naverIngest.categories(parent, force));
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/categories/clear') {
          return json(200, { ok: naverIngest.clearCategories() });
        }
        // 트리 전체 미리 읽기 — 20~40분 걸리므로 시작만 하고 즉시 200. 진행은 status.prewarm.
        if (req.method === 'POST' && u.pathname === '/naver-ingest/categories/prewarm') {
          const { depth } = await readJson();
          if (!naverIngest.getStatus().isAdmin) return json(403, { ok: false, error: '관리자 계정만 사용할 수 있습니다.' });
          return json(200, await naverIngest.startPrewarm({ depth: Number(depth) || 3 }));
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/categories/prewarm/stop') {
          return json(200, { ok: naverIngest.stopPrewarm() });
        }
        // 발견한 트리 통째로 — 제품에 동봉할 스냅샷(category-tree.json)을 만들 때 쓴다.
        if (req.method === 'GET' && u.pathname === '/naver-ingest/categories/export') {
          return json(200, naverIngest.exportCategories());
        }
        // 페이지 진단 — 수집이 0건일 때 실제 DOM 구조를 파일로 남긴다(페이지 1장).
        if (req.method === 'POST' && u.pathname === '/naver-ingest/probe') {
          const { catId } = await readJson();
          return json(200, await naverIngest.probePage(catId));
        }
        // 상품 페이지 진단 — 상세 추출기를 짜기 전에 옵션·이미지 구조를 한 장으로 확인한다.
        if (req.method === 'POST' && u.pathname === '/naver-ingest/probe-product') {
          const { url } = await readJson();
          return json(200, await naverIngest.probeProduct(url));
        }
        // 상세 추출 — 고른 상품을 올인원이 먹는 폴더로 만들고, 끝나면 상세페이지 생성까지 잇는다.
        //   오래 걸리므로 시작만 하고 200. autoGenerate 를 안 보내면 기본값(생성까지)이다.
        if (req.method === 'POST' && u.pathname === '/naver-ingest/detail') {
          const { urls, rootDir, autoGenerate } = await readJson();
          return json(200, await naverIngest.startDetailExtract({ urls, rootDir, autoGenerate }));
        }
        // 미리보기 — 폴더를 만들지 않고 상세만 읽어 온다(보는 것과 가져오는 것의 분리).
        if (req.method === 'POST' && u.pathname === '/naver-ingest/preview') {
          const { url } = await readJson();
          return json(200, await naverIngest.previewProduct(url));
        }
        // 카탈로그에서 고른 상품을 이 PC 로 가져온다(이미지만 CDN 에서 — 네이버 페이지 안 엶).
        if (req.method === 'POST' && u.pathname === '/naver-ingest/import') {
          const { products, rootDir, autoAllinone } = await readJson();
          return json(200, await naverIngest.importProducts({ products, rootDir, autoAllinone }));
        }
        if (req.method === 'GET' && u.pathname === '/naver-ingest/import') {
          return json(200, naverIngest.getImportState());
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/detail/stop') {
          return json(200, naverIngest.stopDetailExtract());
        }
        if (req.method === 'GET' && u.pathname === '/naver-ingest/detail') {
          return json(200, naverIngest.getDetailState());
        }
        // 수집은 수 분이 걸리므로 시작만 하고 즉시 200. 진행은 status, 결과는 /collection.
        if (req.method === 'POST' && u.pathname === '/naver-ingest/collect') {
          const body = await readJson();
          return json(200, await naverIngest.startCollect(body));
        }
        if (req.method === 'POST' && u.pathname === '/naver-ingest/collect/stop') {
          return json(200, { ok: naverIngest.stopCollect() });
        }
        // 결과 배열은 수백 건이라 status 와 분리 — 웹이 필요할 때만 가져간다.
        if (req.method === 'GET' && u.pathname === '/naver-ingest/collection') {
          return json(200, naverIngest.getCollection());
        }
      } catch (e) {
        return json(400, { ok: false, error: String(e?.message || e) });
      }
      res.writeHead(404, cors); return res.end('not found');
    }

    // ── 웹 업로드 생성 ─────────────────────────────────────────────────────
    // 웹이 폴더 경로를 못 받으므로(브라우저 보안), 폴더 "내용"을 올려 도우미가 생성한다.
    //   ① /allinone/upload   상품 파일들을 임시폴더에 받음(파일 1개당 1요청)
    //   ② /allinone/generate 그 임시폴더로 run-folder 생성 시작
    //   ③ /allinone/gen-status 진행/완료 폴링 → done 이면 웹이 기존 직독으로 결과 로드
    if (req.url?.startsWith('/allinone/upload')
        || req.url?.startsWith('/allinone/generate')
        || req.url?.startsWith('/allinone/gen-status')) {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.searchParams.get('nonce') !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }
      const sid = u.searchParams.get('session') || '';
      if (!/^[a-f0-9-]{8,64}$/i.test(sid)) { res.writeHead(400, cors); return res.end('bad session'); }
      const sessDir = join(uploadBase, sid);

      // 파일 1장 업로드 — body = 원본 바이트, p = 세션 기준 상대경로.
      if (req.method === 'POST' && u.pathname === '/allinone/upload') {
        const abs = jail(sessDir, u.searchParams.get('p') || '');
        if (!abs) { res.writeHead(400, cors); return res.end('bad path'); }
        try {
          const body = await readBody(req, MAX_UPLOAD_BYTES);
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, body);
          if (!sessions.has(sid)) sessions.set(sid, { dir: sessDir, state: 'uploading' });
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(413, cors); return res.end(String(e.message || e));
        }
      }

      // 업로드 끝 → 생성 시작.
      if (req.method === 'POST' && u.pathname === '/allinone/generate') {
        if (typeof onGenerate !== 'function') { res.writeHead(501, cors); return res.end('generate not supported'); }
        const sess = sessions.get(sid);
        if (!sess) { res.writeHead(404, cors); return res.end('no uploaded session'); }
        if (sess.state === 'generating') { res.writeHead(409, cors); return res.end('already generating'); }
        const noThumb = u.searchParams.get('noThumb') === '1';
        sess.state = 'generating';
        sess.startedAt = Date.now();
        sess.updatedAt = Date.now();
        sess.progress = null; // { phase:'recognize'|'text'|'image', done, total }
        // ⚠️ onGenerate 를 **기다리지 않고** 즉시 200 을 준다.
        //   예전엔 await 했는데, 이 함수는 생성이 "시작될 때까지"(엔진 기동·원본명 조회 등)
        //   수 분이 걸릴 수 있다. 웹의 시작 요청 타임아웃은 30초라, 준비가 길어지면 웹만
        //   "도우미가 생성을 시작하지 못했습니다"로 실패 표시하고 도우미는 계속 도는
        //   엇갈림이 생겼다(실측: 원본명 조회를 넣은 v0.2.73 이후 재현).
        //   진행·완료·실패는 전부 gen-status 폴링으로 전달되므로 여기서 기다릴 이유가 없다.
        try {
          const started = onGenerate(sessDir, {
            noThumb,
            // 러너가 stdout 에서 파싱한 단계별 진행(인식/텍스트/이미지 n/total)을 세션에 적재 →
            // gen-status 로 웹이 실시간 진행률·ETA 를 그린다.
            onProgress: (p) => { sess.progress = p; sess.updatedAt = Date.now(); },
            onDone: (code, reason) => {
              sess.state = code === 0 ? 'done' : 'error';
              sess.code = code;
              if (code !== 0 && reason) sess.error = reason; // 웹이 실패 사유를 그대로 표시
              // 완료된 세션들 정리(용량 회수) — 성공한 것만 lastAllinoneFolder 로 살아있고,
              // 나머지 옛 세션 폴더는 지운다(단 방금 것은 남긴다).
              for (const [id, s] of sessions) {
                if (id !== sid && (s.state === 'done' || s.state === 'error')) {
                  rm(s.dir, { recursive: true, force: true }).catch(() => {});
                  sessions.delete(id);
                }
              }
            },
          });
          // 시작 자체가 실패하면(폴더 없음·이미 진행 중 등) 세션에 에러로 남긴다 → 웹이 폴링으로 본다.
          Promise.resolve(started).catch((e) => {
            sess.state = 'error';
            sess.error = String(e?.message || e);
            sess.updatedAt = Date.now();
          });
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, accepted: true }));
        } catch (e) {
          sess.state = 'error'; sess.error = String(e.message || e);
          res.writeHead(500, cors); return res.end(sess.error);
        }
      }

      // 진행/완료 폴링.
      if (req.method === 'GET' && u.pathname === '/allinone/gen-status') {
        const sess = sessions.get(sid);
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(sess
          ? {
              state: sess.state,
              code: sess.code ?? null,
              error: sess.error ?? null,
              progress: sess.progress ?? null,   // { phase, done, total }
              startedAt: sess.startedAt ?? null,  // epoch ms — 웹이 경과/ETA 계산
              updatedAt: sess.updatedAt ?? null,  // 마지막 진행 갱신(정체 감지용)
            }
          : { state: 'unknown' }));
      }

      res.writeHead(404, cors); return res.end('not found');
    }

    // ── 올인원 결과 직독 ───────────────────────────────────────────────────
    if (req.method === 'GET' && req.url?.startsWith('/allinone/')) {
      if (!corsOk) { res.writeHead(403, cors); return res.end('forbidden origin'); }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.searchParams.get('nonce') !== state.nonce) {
        res.writeHead(401, cors); return res.end('nonce mismatch');
      }

      // 비전 모델(qwen2.5vl) 준비 상태 — 폴더 불필요. ollama 에 모델이 있으면 재생성 시 비전이
      //   이미지를 직접 보고 대표/상세를 선별한다(없으면 CLIP 휴리스틱 폴백). 웹 신호등이 이걸 읽는다.
      if (u.pathname === '/allinone/vision-status') {
        const model = process.env.MEGALOAD_VISION_MODEL || 'qwen2.5vl:7b';
        let ollamaUp = false, hasVision = false;
        try {
          const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            ollamaUp = true;
            const j = await r.json();
            const names = (j.models || []).map((m) => m.name);
            const b = model.split(':')[0];
            hasVision = names.some((n) => n === model || String(n).startsWith(model) || String(n).split(':')[0] === b);
          }
        } catch { /* ollama 미기동 */ }
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ready: ollamaUp && hasVision, ollamaUp, hasVision, model }));
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

  // ── 고정 포트 대역 바인딩 ────────────────────────────────────────────────
  // 예전엔 listen(0) 으로 **랜덤 포트**를 잡고, 웹은 그 포트를 서버 하트비트(DB)로만 알 수 있었다.
  //   → ①앱이 재시작하면 포트가 바뀌어 DB 값이 낡고 ②도우미를 2대에서 켜면 웹이 어느 PC 것인지
  //     구분할 수 없었다(목록에 PC 표시가 없음). 그래서 "다른 PC 도우미로 접속 → 401" 사고가 났다.
  // 이제 고정 대역을 순서대로 시도한다. 웹은 DB 를 거치지 않고 127.0.0.1 의 이 대역만 훑으면
  //   **지금 이 PC** 의 도우미를 확정적으로 찾는다(로컬에 있는 건 로컬에서 찾는다).
  //   전부 사용 중이면 예전처럼 랜덤 포트로 폴백한다(기동 실패보다 낫다 — 하트비트 경로가 받쳐준다).
  const listenOn = (p) => new Promise((resolve, reject) => {
    const onErr = (e) => { server.removeListener('listening', onOk); reject(e); };
    const onOk = () => { server.removeListener('error', onErr); resolve(); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(p, '127.0.0.1');
  });
  let bound = false;
  for (const p of DISCOVERY_PORTS) {
    try { await listenOn(p); bound = true; break; }
    catch { /* 사용 중 → 다음 포트 */ }
  }
  if (!bound) await listenOn(0);
  state.port = server.address().port;

  // 오래된 업로드 세션 청소 — 영속 위치(userData)로 옮겼으니 방치하면 무한 누적된다.
  //   앱 재시작 후엔 sessions Map 이 비어 onDone 정리가 안 도므로 시작 시 1회 쓸어준다.
  //   보존: 마지막 생성 폴더(lastAllinoneFolder, 웹이 아직 읽을 수 있음)와 최근 3일치.
  //   실패는 무시(청소 실패가 서버 기동을 막지 않게).
  void (async () => {
    try {
      const keep = getAllinoneFolder();
      const keepName = keep ? relative(uploadBase, keep).split(/[/\\]/)[0] : null;
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const entries = await readdir(uploadBase, { withFileTypes: true }).catch(() => []);
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name === keepName) continue;
        const dir = join(uploadBase, ent.name);
        const st = await stat(dir).catch(() => null);
        if (st && st.mtimeMs < cutoff) await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } catch { /* 청소는 best-effort */ }
  })();

  return {
    port: state.port,
    nonce: state.nonce,
    isPaired: () => state.paired,
    resetPaired: () => { state.paired = false; }, // 로그아웃 시 페어 표시도 내림
    close: () => new Promise((r) => server.close(() => r())),
  };
}
