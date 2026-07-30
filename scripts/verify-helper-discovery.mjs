/**
 * 웹 ↔ 도우미 "발견(discovery) 규약" 검증.
 * ---------------------------------------------------------------------------
 * 왜 있나: 2026-07-30 에 웹이 도우미를 찾을 때 `/allinone/gen-status` 로 프로브했는데,
 *   그 경로는 `session` 파라미터를 강제한다 → 정상 도우미인데도 400 → "이 PC 도우미 미연결"
 *   오표시 + 업로드 생성 차단. 웹과 도우미 사이의 규약을 **아무것도 검증하지 않아서** 배포 후에야
 *   드러났다. 이 스크립트가 그 계층을 지킨다.
 *
 * 규약:
 *   ① /health 는 파라미터 없이 200 + { app:'megaload-desktop', nonce } 를 준다(우리 오리진일 때).
 *   ② /health 는 Origin 이 없거나 낯설면 nonce 를 주지 않는다.
 *   ③ 발견 포트 대역이 웹 상수와 일치한다.
 *   ④ 웹이 발견에 쓰는 경로는 파라미터 없이 200 이어야 한다(=/health). 파라미터를 강제하는
 *      경로(gen-status 등)를 프로브로 쓰면 실패로 잡는다.
 *
 * 실행: node scripts/verify-helper-discovery.mjs
 */
import { readFileSync } from 'node:fs';
import { startPairServer, DISCOVERY_PORTS } from '../worker/desktop/main/pair-server.mjs';

const WEB_SRC = 'src/lib/megaload/allinone-local.ts';
const ORIGIN = 'https://www.megaload.co.kr';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const srv = await startPairServer({ appVersion: '9.9.9-test' });
const base = `http://127.0.0.1:${srv.port}`;
const get = (path, origin = ORIGIN) =>
  fetch(`${base}${path}`, { headers: origin ? { Origin: origin } : {} });

try {
  // ① 파라미터 없는 /health 가 신원 + 열쇠를 준다
  {
    const r = await get('/health');
    const j = r.ok ? await r.json() : {};
    check('/health 는 파라미터 없이 200', r.status === 200, `HTTP ${r.status}`);
    check('/health 가 app 신원을 준다', j.app === 'megaload-desktop', JSON.stringify(j.app));
    check('/health 가 nonce 를 준다(우리 오리진)', typeof j.nonce === 'string' && j.nonce.length > 0);
    check('/health 가 port 를 준다', j.port === srv.port, `${j.port} vs ${srv.port}`);
  }

  // ② 낯선/없는 Origin 에는 열쇠를 주지 않는다
  {
    const r = await get('/health', 'https://evil.example.com');
    const j = await r.json();
    check('낯선 오리진엔 nonce 미제공', j.nonce === undefined);
    const r2 = await fetch(`${base}/health`);      // Origin 헤더 없음
    const j2 = await r2.json();
    check('Origin 없는 요청엔 nonce 미제공', j2.nonce === undefined);
  }

  // ③ 포트 대역이 웹 상수와 일치
  {
    const web = readFileSync(WEB_SRC, 'utf8');
    const m = web.match(/DISCOVERY_PORTS\s*=\s*\[([^\]]+)\]/);
    const webPorts = m ? m[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite) : [];
    check('웹/도우미 발견 포트 대역 일치',
      webPorts.length > 0 && webPorts.join(',') === DISCOVERY_PORTS.join(','),
      `web=[${webPorts}] app=[${DISCOVERY_PORTS}]`);
    check('도우미가 발견 대역 안에서 바인딩', DISCOVERY_PORTS.includes(srv.port), `port=${srv.port}`);
  }

  // ④ 발견 프로브로 쓰면 안 되는 경로가 실제로 파라미터를 강제하는지 확인(회귀의 정체)
  {
    const r = await get(`/allinone/gen-status?nonce=${encodeURIComponent(srv.nonce)}`);
    check('gen-status 는 파라미터 강제(=발견용으로 쓸 수 없음)', r.status === 400,
      `HTTP ${r.status} — 이 경로를 프로브로 쓰면 정상 도우미가 미연결로 오판된다`);
    const web = readFileSync(WEB_SRC, 'utf8');
    const probesGenStatus = /verifyEndpoint[\s\S]{0,900}?gen-status/.test(web);
    check('웹이 gen-status 를 발견 프로브로 쓰지 않는다', !probesGenStatus);
  }
} finally {
  await srv.close();
}

console.log(failed === 0 ? '\n규약 검증 통과' : `\n실패 ${failed}건`);
// ⚠️ process.exit() 를 쓰면 닫히는 중인 소켓 핸들 때문에 libuv 가 abort 한다(Windows 실측,
//    검증은 전부 통과했는데 종료코드 127). exitCode 만 세우고 자연 종료시킨다.
process.exitCode = failed === 0 ? 0 : 1;
