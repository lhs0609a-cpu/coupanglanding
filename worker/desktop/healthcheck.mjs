// ============================================================
// 발행 전 "신호기" — 패키지된 앱이 정상 시작·구성됐는지 전수 점검.
//   ❗ 모든 항목이 ✅ 일 때만 exit 0. 하나라도 ❌ 면 exit 1 → 업로드 금지.
//   publish-checked.mjs 가 이 결과를 보고 업로드 여부를 결정한다.
//
// 점검 항목:
//   1) 빌드 산출물 (Setup.exe / latest.yml / blockmap)
//   2) 패키지 내부 모든 상대 import 해결 (모듈 누락 = 시작 크래시의 주범)
//   3) runtime/ 필수 파일 존재
//   4) renderer 자산 존재 (index.html, shell.js, 모듈 패널)
//   5) 버전 일치 (package.json == latest.yml == 웹 WORKER_APP_VERSION)
//   6) 시작 스모크 — exe 를 --hidden 으로 띄워 12초 생존 + stderr 무에러
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const unpacked = join(dist, 'win-unpacked');
const appDir = join(unpacked, 'resources', 'app');
const exe = join(unpacked, 'MegaloadDesktop.exe');

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

// ── 1) 빌드 산출물 ──
{
  const need = ['MegaloadDesktop-Setup.exe', 'latest.yml', 'MegaloadDesktop-Setup.exe.blockmap'];
  const missing = need.filter((f) => !existsSync(join(dist, f)));
  ok('빌드 산출물 (Setup/latest.yml/blockmap)', missing.length === 0, missing.length ? `누락: ${missing.join(', ')}` : '');
}

// ── 2) 패키지 내부 상대 import 전수 해결 ──
{
  let files = [];
  for (const d of ['main', 'runtime']) {
    const D = join(appDir, d);
    if (!existsSync(D)) continue;
    (function walk(p) {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const fp = join(p, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.name.endsWith('.mjs')) files.push(fp);
      }
    })(D);
  }
  const re = /(?:import|export)[^"']*?from\s*["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g;
  let checked = 0;
  const missing = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2];
      checked++;
      if (!existsSync(resolve(dirname(f), spec))) missing.push(`${spec} (in ${f.replace(appDir, '')})`);
    }
  }
  ok(`상대 import 해결 (${checked}개)`, missing.length === 0, missing.slice(0, 5).join('; '));
}

// ── 3) runtime 필수 파일 ──
{
  const need = ['supabase-rest.mjs', 'pull-loop.mjs', 'llm-pull-loop.mjs', 'comfyui-client.mjs',
    'ai-prompts.mjs', 'local-llm.mjs', 'category-embed-matcher.mjs'];
  const missing = need.filter((f) => !existsSync(join(appDir, 'runtime', f)));
  ok('runtime 필수 파일', missing.length === 0, missing.length ? `누락: ${missing.join(', ')}` : '');
}

// ── 3.5) preload 구성 — CommonJS(.cjs) 존재 + main 이 .cjs 참조 (ESM preload 타이밍버그 재발 방지) ──
{
  const hasCjs = existsSync(join(appDir, 'main', 'preload.cjs'));
  let refsCjs = false;
  try { refsCjs = readFileSync(join(appDir, 'main', 'main.mjs'), 'utf8').includes('preload.cjs'); } catch { /* */ }
  ok('preload(cjs) 구성', hasCjs && refsCjs,
    !hasCjs ? 'preload.cjs 없음' : (!refsCjs ? 'main.mjs 가 preload.cjs 미참조' : ''));
}

// ── 4) renderer 자산 ──
{
  const need = ['renderer/index.html', 'renderer/shell.js', 'renderer/style.css'];
  const mods = ['stock-monitor', 'allinone', 'thumbnail-gpu', 'ads'];
  for (const m of mods) { need.push(`renderer/modules/${m}/panel.html`, `renderer/modules/${m}/panel.js`); }
  const missing = need.filter((f) => !existsSync(join(appDir, f)));
  ok('renderer 자산(쉘+모듈 패널)', missing.length === 0, missing.length ? `누락: ${missing.join(', ')}` : '');
}

// ── 5) 버전 일치 ──
{
  const pkgV = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  let ymlV = '?';
  try { ymlV = (readFileSync(join(dist, 'latest.yml'), 'utf8').match(/^version:\s*(.+)$/m) || [])[1]?.trim(); } catch { /* */ }
  let webV = '?';
  try {
    const w = readFileSync(join(here, '..', '..', 'src', 'lib', 'megaload', 'worker-download.ts'), 'utf8');
    webV = (w.match(/WORKER_APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  } catch { /* */ }
  // pkg==yml 은 필수. web 은 파일이 있으면 비교(없으면 생략 — 빌드 디렉토리 실행 대비).
  const same = !!pkgV && pkgV === ymlV && (webV === '?' || pkgV === webV);
  ok('버전 일치 (pkg=yml' + (webV === '?' ? ', web생략' : '=web') + ')', same, `pkg=${pkgV} yml=${ymlV} web=${webV}`);
}

// ── 6) 시작 스모크 (exe 12초 생존 + stderr 무에러) ──
async function smoke() {
  if (!existsSync(exe)) return ok('시작 스모크 (12초 생존)', false, `exe 없음: ${exe}`);
  // ★ 단일실행 잠금 회피 — 기존 인스턴스(설치본/이전 테스트)를 먼저 종료해야
  //   새 인스턴스가 lock 에 막혀 즉시종료(code=0)하는 가짜 실패를 막는다.
  try { spawnSync('taskkill', ['/im', 'MegaloadDesktop.exe', '/f', '/t'], { stdio: 'ignore' }); } catch { /* */ }
  await new Promise((r) => setTimeout(r, 1500));
  let stderr = '';
  let exitedEarly = null;
  const child = spawn(exe, ['--hidden', '--smoke-test'], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('exit', (code) => { if (exitedEarly === null) exitedEarly = code; });
  await new Promise((r) => setTimeout(r, 12000));
  const alive = exitedEarly === null;
  // 정리
  try { child.kill(); } catch { /* */ }
  try { spawnSync('taskkill', ['/im', 'MegaloadDesktop.exe', '/f', '/t'], { stdio: 'ignore' }); } catch { /* */ }
  // electron/chromium 의 무해한 경고는 무시, 실제 에러 키워드만 검출
  const errLines = stderr.split(/\r?\n/).filter((l) =>
    /Error|Cannot find|Uncaught|ERR_|throw|exception/i.test(l) && !/DevTools|Autofill|GPU stall|cache_util/i.test(l));
  if (!alive) ok('시작 스모크 (12초 생존)', false, `즉시 종료(code=${exitedEarly}). ${errLines.slice(0, 3).join(' | ')}`);
  else if (errLines.length) ok('시작 스모크 (12초 생존)', false, `생존했으나 에러 로그: ${errLines.slice(0, 3).join(' | ')}`);
  else ok('시작 스모크 (12초 생존)', true, '크래시 없음');
}

await smoke();

// ── 7) 설치기 스모크 — Setup.exe 를 실제 /S 무인설치해서 끝까지 되는지 ──
//    (앱 실행 스모크는 win-unpacked 를 직접 띄우므로 "설치기(installer.nsh/NSIS)" 버그는 못 잡는다.
//     설치가 중간에 깨지는 류는 이 테스트만 잡을 수 있음.)
async function installerSmoke() {
  const setup = join(dist, 'MegaloadDesktop-Setup.exe');
  if (!existsSync(setup)) return ok('설치기 스모크 (/S 무인설치)', false, 'Setup.exe 없음');
  const installDir = join(process.env.LOCALAPPDATA || '', 'Programs', 'megaload-desktop');
  const pkgPath = join(installDir, 'resources', 'app', 'package.json');
  const pkgV = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  try { spawnSync('taskkill', ['/im', 'MegaloadDesktop.exe', '/f', '/t'], { stdio: 'ignore' }); } catch { /* */ }
  await new Promise((r) => setTimeout(r, 1000));
  // oneClick 무인 설치
  spawnSync(setup, ['/S'], { timeout: 150000, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 8000));
  // 설치 후 runAfterFinish 로 떴을 수 있으니 정리
  try { spawnSync('taskkill', ['/im', 'MegaloadDesktop.exe', '/f', '/t'], { stdio: 'ignore' }); } catch { /* */ }
  let installedV = null;
  if (existsSync(pkgPath)) { try { installedV = JSON.parse(readFileSync(pkgPath, 'utf8')).version; } catch { /* */ } }
  ok('설치기 스모크 (/S 무인설치)', installedV === pkgV,
    installedV ? `설치 완료 v${installedV}` : '설치 실패 — 설치 폴더/버전 확인 불가(중간에 깨짐)');
}
await installerSmoke();

// ── 결과 보드 ──
console.log('\n┌─────────────── 발행 전 신호기 ───────────────');
let allGreen = true;
for (const r of results) {
  console.log(`│ ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  if (!r.pass) allGreen = false;
}
console.log('└──────────────────────────────────────────────');
console.log(allGreen ? '\n🟢 전부 정상 — 업로드 가능' : '\n🔴 실패 항목 있음 — 업로드 금지');
process.exit(allGreen ? 0 : 1);
